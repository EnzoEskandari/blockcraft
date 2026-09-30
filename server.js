// Blockcraft server: serves the game, keeps the online worlds, and relays multiplayer messages.
// The world itself runs in the browser of whoever is "hosting" it right now (the first player in);
// they send the save here every few seconds, and if they leave the next player takes over.
import http from 'node:http';
import crypto from 'node:crypto';
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
// online worlds, and the saves of their Nether and End ("ID~nether", "ID~end")
const DIMS = ['overworld', 'nether', 'end'];
const roomKey = (id, dim) => (dim === 'overworld' ? id : `${id}~${dim}`);
const all = await store.list();
const worlds = new Map(all.filter((m) => !m.id.includes('~')).map((m) => [m.id, m]));
const dimMetas = new Map(all.filter((m) => m.id.includes('~')).map((m) => [m.id, m]));
console.log(`Online worlds: ${worlds.size} (${store.kind}${store.permanent ? '' : ', not permanent'})`);

// ---------------------------------------------------------------- accounts
// A username and password make you the same player everywhere; your items are saved under your account.
const accounts = new Map((await store.loadAccounts()).map((a) => [a.id, a]));
const byName = new Map([...accounts.values()].map((a) => [a.name.toLowerCase(), a]));
const sessions = new Map((await store.loadSessions()).map((x) => [x.token, x]));   // hashed token -> session
const NAME_RE = /^[A-Za-z0-9_]{3,16}$/;
const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');
const scrypt = (pw, salt) => new Promise((res, rej) => crypto.scrypt(pw, salt, 64, (e, k) => (e ? rej(e) : res(k))));
const pub = (a) => ({ id: a.id, name: a.name });

async function newSession(a) {
  const token = crypto.randomBytes(24).toString('base64url');
  const x = { token: sha(token), account: a.id, created: Date.now() };
  sessions.set(x.token, x);
  await store.putSession(x);
  return token;
}
function accountFrom(token) {
  if (typeof token !== 'string' || token.length > 100) return null;
  const x = sessions.get(sha(token));
  return x ? accounts.get(x.account) || null : null;
}
const bearer = (req) => { const m = String(req.headers.authorization || '').match(/^Bearer (.+)$/); return m ? m[1] : null; };

// at most 30 sign-in attempts per address every 10 minutes
const attempts = new Map();
function tooMany(req) {
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  const now = Date.now();
  const list = (attempts.get(ip) || []).filter((t) => now - t < 600000);
  list.push(now);
  attempts.set(ip, list);
  return list.length > 30;
}

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
const playersIn = (id) => DIMS.reduce((n, d) => { const r = rooms.get(roomKey(id, d)); return n + (r ? 1 + r.peers.size : 0); }, 0);

// ---------------------------------------------------------------- HTTP
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  try {
    if (p === '/healthz') { res.writeHead(200, { 'content-type': 'text/plain' }); res.end('ok'); return; }
    if (p === '/api/signup' && req.method === 'POST') {
      if (tooMany(req)) { json(res, 429, { error: 'Too many tries. Wait a few minutes.' }); return; }
      const b = await readBody(req);
      const name = String(b.name || '').trim(), pw = String(b.password || '');
      if (!NAME_RE.test(name)) { json(res, 400, { error: 'Usernames are 3 to 16 letters, numbers or _.' }); return; }
      if (pw.length < 6 || pw.length > 100) { json(res, 400, { error: 'Passwords need at least 6 characters.' }); return; }
      if (byName.has(name.toLowerCase())) { json(res, 409, { error: 'That username is taken.' }); return; }
      const salt = crypto.randomBytes(16).toString('hex');
      const a = { id: 'u_' + crypto.randomBytes(9).toString('base64url'), name, salt, hash: (await scrypt(pw, salt)).toString('hex'), created: Date.now() };
      accounts.set(a.id, a);
      byName.set(name.toLowerCase(), a);
      await store.putAccount(a);
      json(res, 201, { token: await newSession(a), account: pub(a) });
      return;
    }
    if (p === '/api/login' && req.method === 'POST') {
      if (tooMany(req)) { json(res, 429, { error: 'Too many tries. Wait a few minutes.' }); return; }
      const b = await readBody(req);
      const a = byName.get(String(b.name || '').trim().toLowerCase());
      const key = await scrypt(String(b.password || ''), a ? a.salt : 'no-such-account');
      if (!a || !crypto.timingSafeEqual(key, Buffer.from(a.hash, 'hex'))) { json(res, 401, { error: 'Wrong username or password.' }); return; }
      json(res, 200, { token: await newSession(a), account: pub(a) });
      return;
    }
    if (p === '/api/me' && req.method === 'GET') {
      const a = accountFrom(bearer(req));
      json(res, a ? 200 : 401, a ? { account: pub(a) } : { error: 'Not signed in' });
      return;
    }
    if (p === '/api/logout' && req.method === 'POST') {
      const t = bearer(req);
      if (t && sessions.has(sha(t))) { sessions.delete(sha(t)); await store.delSession(sha(t)); }
      json(res, 200, { ok: true });
      return;
    }
    if (p === '/api/worlds' && req.method === 'GET') {
      const list = [...worlds.values()].map((m) => ({ ...m, players: playersIn(m.id) })).sort((a, b) => (b.updated || 0) - (a.updated || 0));
      json(res, 200, { permanent: store.permanent, storage: store.kind, dbError: store.dbError ? 'The database could not be reached. Check DATABASE_URL on Render.' : undefined, worlds: list });
      return;
    }
    if (p === '/api/worlds' && req.method === 'POST') {
      const who = accountFrom(bearer(req));
      if (!who) { json(res, 401, { error: 'Sign in first.' }); return; }
      const b = await readBody(req);
      const name = cleanName(b.name, 32) || 'Online World';
      const seed = Number(b.seed) >>> 0;
      const mode = b.mode === 'creative' ? 'creative' : 'survival';
      const meta = { id: newId(), name, seed, mode, created: Date.now(), updated: Date.now(), v: 0, owner: who.id, ownerName: who.name };
      await store.putMeta(meta);
      worlds.set(meta.id, meta);
      json(res, 201, meta);
      return;
    }
    const del = p.match(/^\/api\/worlds\/([A-Z0-9]{6})$/);
    if (del && req.method === 'DELETE') {
      const id = del[1];
      const who = accountFrom(bearer(req));
      if (!who) { json(res, 401, { error: 'Sign in first.' }); return; }
      if (!worlds.has(id)) { json(res, 404, { error: 'No such world' }); return; }
      const owner = worlds.get(id).owner;
      if (owner && owner !== who.id) { json(res, 403, { error: `Only ${worlds.get(id).ownerName || 'its creator'} can delete this world.` }); return; }
      if (playersIn(id)) { json(res, 409, { error: 'Someone is playing in that world right now' }); return; }
      for (const d of DIMS) { const k = roomKey(id, d); await store.del(k); saves.delete(k); dimMetas.delete(k); }
      await store.delPlayers(id);
      worlds.delete(id);
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

function metaOf(key) {
  if (worlds.has(key)) return worlds.get(key);
  if (!key.includes('~')) return null;
  let m = dimMetas.get(key);
  if (!m) { m = { id: key, dimOf: key.split('~')[0], updated: Date.now(), v: 0 }; dimMetas.set(key, m); }
  return m;
}

async function writeSave(id) {
  const s = saves.get(id), meta = metaOf(id);
  if (!s || !meta || !s.dirty) return;
  s.dirty = false;
  clearTimeout(s.timer); s.timer = null;
  try { await store.putSave(meta, s.data); } catch (err) { s.dirty = true; console.error('save failed', id, err.message); return; }
  if (!rooms.has(id) && !s.dirty) saves.delete(id);
}

function queueSave(id, data, v) {
  const meta = metaOf(id);
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

// ---------------------------------------------------------------- players
// Each player's own record in each world (inventory, position, which dimension), sent by their browser
const records = new Map();   // "world|account" -> { data, dirty, timer }
async function getRecord(world, account) {
  const k = world + '|' + account;
  if (records.has(k)) return records.get(k).data;
  const data = await store.getPlayer(world, account).catch(() => null);
  records.set(k, { data, dirty: false, timer: null });
  return data;
}
function putRecord(world, account, data) {
  const k = world + '|' + account;
  let r = records.get(k);
  if (!r) { r = { data, dirty: false, timer: null }; records.set(k, r); }
  r.data = data;
  r.dirty = true;
  if (!r.timer) r.timer = setTimeout(() => flushRecord(world, account), 3000);
}
async function flushRecord(world, account) {
  const r = records.get(world + '|' + account);
  if (!r || !r.dirty) return;
  clearTimeout(r.timer); r.timer = null; r.dirty = false;
  try { await store.putPlayer(world, account, r.data); } catch (err) { r.dirty = true; console.error('player save failed', err.message); }
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
      const acc = accountFrom(m.token);
      if (!acc) { send(ws, { t: 'error', msg: 'Sign in to play online.' }); ws.joining = false; return; }
      ws.account = acc.id;
      const id = String(m.id || '').toUpperCase();
      ws.world = id;
      // already in this world (any dimension) from another tab or device: that one steps aside
      let old = null;
      for (const d of DIMS) {
        const r0 = rooms.get(roomKey(id, d));
        const q = r0 && [r0.host, ...r0.peers.values()].find((x) => x.account === acc.id && x.readyState === 1 && x !== ws);
        if (q) old = q;
      }
      if (old) {
        // it saves and leaves by itself; give it a moment before letting this one in
        send(old, { t: 'replaced' });
        await new Promise((r) => {
          const timer = setTimeout(() => { old.terminate(); r(); }, 4000);
          old.once('close', () => { clearTimeout(timer); r(); });
        });
        await new Promise((r) => setTimeout(r, 300));
        await flushRecord(id, acc.id);
      }
      // your own record in this world, then which dimension: where you are travelling to, or wherever you last were
      const me = await getRecord(id, acc.id);
      const dim = DIMS.includes(m.dim) ? m.dim : me && DIMS.includes(me.dim) ? me.dim : 'overworld';
      const key = roomKey(id, dim);
      let meta = worlds.get(id);
      const haves = m.haves && typeof m.haves === 'object' ? m.haves : {};
      const have = haves[dim] && typeof haves[dim] === 'object' ? haves[dim] : null;
      let useLocal = false;
      if (!meta) {
        // The server forgot this world (it restarted without a database): bring it back from a player's copy
        const hm = (have && have.meta) || Object.values(haves).map((h) => h && h.meta).find(Boolean);
        if (!ID_RE.test(id) || !hm || hm.id !== id) { send(ws, { t: 'error', msg: 'That world does not exist. It may have been deleted.' }); ws.joining = false; return; }
        meta = { id, name: cleanName(hm.name, 32) || 'Online World', seed: Number(hm.seed) >>> 0, mode: hm.mode === 'creative' ? 'creative' : 'survival', created: hm.created || Date.now(), updated: Date.now(), v: 0 };
        worlds.set(id, meta);
        await store.putMeta(meta);
        useLocal = true;
      }
      ws.name = acc.name;
      const r = rooms.get(key);
      if (r && r.host.readyState === 1) {
        if (playersIn(id) >= MAX_PLAYERS) { send(ws, { t: 'error', msg: 'That world is full.' }); ws.joining = false; return; }
        const pid = r.next++;
        r.peers.set(pid, ws);
        ws.room = key; ws.pid = pid;
        send(ws, { t: 'joined', id: pid, code: id, dim, me });
        send(r.host, { t: 'peer', id: pid, name: ws.name, account: acc.id });
        return;
      }
      // Nobody is running this dimension: this player runs it
      rooms.set(key, { host: ws, peers: new Map(), next: 1 });
      ws.room = key; ws.pid = 0;
      const rm = metaOf(key);
      if (have && (have.v || 0) > (rm.v || 0)) useLocal = true;   // their copy is newer than the server's
      else if (dim !== 'overworld' && have && !saves.has(key) && !(await store.getSave(key))) useLocal = true;
      const save = useLocal ? null : await latestSave(key);
      send(ws, { t: 'hostworld', meta, dim, v: rm.v || 0, save, useLocal, me });
      return;
    }
    if (m.t === 'me' && ws.world && ws.account && m.data && typeof m.data === 'object') { putRecord(ws.world, ws.account, m.data); return; }
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
    if (ws.world && ws.account) flushRecord(ws.world, ws.account);
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
  for (const k of records.keys()) { const [w, a] = k.split('|'); await flushRecord(w, a); }
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

server.listen(PORT, () => console.log(`Blockcraft running on http://localhost:${PORT}`));
