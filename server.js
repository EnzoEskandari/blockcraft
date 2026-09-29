// Blockcraft server: serves the game, keeps the online worlds, and relays multiplayer messages.
// The world itself runs in the browser of whoever is "hosting" it right now (the first player in);
// they send the save here every few seconds, and if they leave the next player takes over.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { openStore } from './store.js';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PORT = Number(process.env.PORT) || 8080;
const MAX_PLAYERS = 8;
const ID_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // no 0/O or 1/I look-alikes
const ID_RE = /^[A-HJ-NP-Z2-9]{6}$/;

const store = await openStore(ROOT);
const worlds = new Map((await store.list()).map((m) => [m.id, m]));
console.log(`Online worlds: ${worlds.size} (${store.kind}${store.permanent ? '' : ', not permanent'})`);

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};
const PUBLIC = /^\/(index\.html|js\/[\w-]+\.js|favicon\.ico)?$/;

const json = (res, code, body) => {
  res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
};

function readBody(req, limit = 16 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const parts = [];
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(new Error('too big')); req.destroy(); } else parts.push(c); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(parts).toString() || '{}')); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

function newId() {
  for (;;) {
    let id = '';
    for (let i = 0; i < 6; i++) id += ID_CHARS[Math.floor(Math.random() * ID_CHARS.length)];
    if (!worlds.has(id)) return id;
  }
}

const cleanName = (n, max = 16) => String(n || '').replace(/[^\w .'!-]/g, '').trim().slice(0, max);
const playersIn = (id) => { const r = rooms.get(id); return r ? 1 + r.peers.size : 0; };

// ---------------------------------------------------------------- HTTP
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  try {
    if (p === '/healthz') { res.writeHead(200, { 'content-type': 'text/plain' }); res.end('ok'); return; }
    if (p === '/api/worlds' && req.method === 'GET') {
      const list = [...worlds.values()].map((m) => ({ ...m, players: playersIn(m.id) })).sort((a, b) => (b.updated || 0) - (a.updated || 0));
      json(res, 200, { permanent: store.permanent, storage: store.kind, worlds: list });
      return;
    }
    if (p === '/api/worlds' && req.method === 'POST') {
      const b = await readBody(req);
      const name = cleanName(b.name, 32) || 'Online World';
      const seed = Number(b.seed) >>> 0;
      const mode = b.mode === 'creative' ? 'creative' : 'survival';
      const meta = { id: newId(), name, seed, mode, created: Date.now(), updated: Date.now(), v: 0 };
      await store.putMeta(meta);
      worlds.set(meta.id, meta);
      json(res, 201, meta);
      return;
    }
    const del = p.match(/^\/api\/worlds\/([A-Z0-9]{6})$/);
    if (del && req.method === 'DELETE') {
      const id = del[1];
      if (!worlds.has(id)) { json(res, 404, { error: 'No such world' }); return; }
      if (playersIn(id)) { json(res, 409, { error: 'Someone is playing in that world right now' }); return; }
      await store.del(id);
      worlds.delete(id);
      saves.delete(id);
      json(res, 200, { ok: true });
      return;
    }
    if (!PUBLIC.test(p)) { res.writeHead(404); res.end('Not found'); return; }
    const file = normalize(join(ROOT, p === '/' ? 'index.html' : p));
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache', 'x-content-type-options': 'nosniff' });
    res.end(body);
  } catch (err) {
    if (!res.headersSent) { res.writeHead(err && err.code === 'ENOENT' ? 404 : 500); res.end(); }
  }
});

// ---------------------------------------------------------------- saves
// Latest save of each active world, written to the store at most every few seconds
const saves = new Map();   // id -> { data, dirty, timer }

async function writeSave(id) {
  const s = saves.get(id), meta = worlds.get(id);
  if (!s || !meta || !s.dirty) return;
  s.dirty = false;
  clearTimeout(s.timer); s.timer = null;
  try { await store.putSave(meta, s.data); } catch (err) { s.dirty = true; console.error('save failed', id, err.message); return; }
  if (!rooms.has(id) && !s.dirty) saves.delete(id);
}

function queueSave(id, data, v) {
  const meta = worlds.get(id);
  if (!meta) return;
  meta.updated = Date.now();
  meta.v = Math.max(meta.v || 0, v || 0);
  let s = saves.get(id);
  if (!s) { s = { data, dirty: true, timer: null }; saves.set(id, s); }
  s.data = data; s.dirty = true;
  if (!s.timer) s.timer = setTimeout(() => writeSave(id), 4000);
}

async function latestSave(id) {
  const s = saves.get(id);
  return s ? s.data : store.getSave(id);
}

// ---------------------------------------------------------------- rooms
const rooms = new Map();   // world id -> { host, peers: Map(id -> ws), next }
const send = (ws, msg) => { if (ws && ws.readyState === 1) ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg)); };

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 32 * 1024 * 1024 });

wss.on('connection', (ws) => {
  ws.alive = true;
  ws.on('pong', () => { ws.alive = true; });
  ws.room = null;
  ws.pid = -1;

  ws.on('message', async (raw) => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m !== 'object') return;
    const room = ws.room && rooms.get(ws.room);

    if (m.t === 'world' && !ws.room && !ws.joining) {
      ws.joining = true;
      const id = String(m.id || '').toUpperCase();
      let meta = worlds.get(id);
      const have = m.have && typeof m.have === 'object' ? m.have : null;
      let useLocal = false;
      if (!meta) {
        // The server forgot this world (it restarted without a database): bring it back from a player's copy
        const hm = have && have.meta;
        if (!ID_RE.test(id) || !hm || hm.id !== id) { send(ws, { t: 'error', msg: 'That world does not exist. It may have been deleted.' }); ws.joining = false; return; }
        meta = { id, name: cleanName(hm.name, 32) || 'Online World', seed: Number(hm.seed) >>> 0, mode: hm.mode === 'creative' ? 'creative' : 'survival', created: hm.created || Date.now(), updated: Date.now(), v: 0 };
        worlds.set(id, meta);
        await store.putMeta(meta);
        useLocal = true;
      }
      ws.name = cleanName(m.name) || 'Player';
      const r = rooms.get(id);
      if (r && r.host.readyState === 1) {
        if (r.peers.size + 1 >= MAX_PLAYERS) { send(ws, { t: 'error', msg: 'That world is full.' }); ws.joining = false; return; }
        const pid = r.next++;
        r.peers.set(pid, ws);
        ws.room = id; ws.pid = pid;
        send(ws, { t: 'joined', id: pid, code: id });
        send(r.host, { t: 'peer', id: pid, name: ws.name });
        return;
      }
      // Nobody is running this world: this player hosts it
      rooms.set(id, { host: ws, peers: new Map(), next: 1 });
      ws.room = id; ws.pid = 0;
      if (have && (have.v || 0) > (meta.v || 0)) useLocal = true;   // their copy is newer than the server's
      const save = useLocal ? null : await latestSave(id);
      send(ws, { t: 'hostworld', meta, save, useLocal });
      return;
    }
    if (m.t === 'save' && room && ws.pid === 0 && typeof m.data === 'string') { queueSave(ws.room, m.data, m.v); return; }
    if (m.t === 'to' && room) {
      // Guests only talk to the host; the host can talk to one guest, several, or everyone
      const out = JSON.stringify({ t: 'msg', from: ws.pid, d: m.d });
      if (ws.pid !== 0) { send(room.host, out); return; }
      if (m.to === '*') { for (const q of room.peers.values()) send(q, out); return; }
      if (Array.isArray(m.to)) { for (const id of m.to) send(room.peers.get(id), out); return; }
      send(room.peers.get(m.to), out);
    }
  });

  ws.on('close', async () => {
    const id = ws.room;
    const r = id && rooms.get(id);
    if (!r) return;
    if (r.host === ws) {
      rooms.delete(id);
      await writeSave(id);
      // Hand the world to whoever is left: they reconnect one after another and the first one hosts
      let i = 0;
      for (const q of [...r.peers.entries()].sort((a, b) => a[0] - b[0]).map((e) => e[1])) {
        q.room = null;
        send(q, { t: 'rehost', wait: i++ * 900 });
        q.close();
      }
    } else if (r.peers.get(ws.pid) === ws) {
      r.peers.delete(ws.pid);
      send(r.host, { t: 'left', id: ws.pid });
    }
  });
});

// Drop dead connections so rooms don't linger
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.alive) { ws.terminate(); continue; }
    ws.alive = false;
    ws.ping();
  }
}, 25000);

// Write pending saves before the server stops (Render sends SIGTERM on restarts and deploys)
async function shutdown() {
  for (const id of saves.keys()) await writeSave(id);
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

server.listen(PORT, () => console.log(`Blockcraft running on http://localhost:${PORT}`));
