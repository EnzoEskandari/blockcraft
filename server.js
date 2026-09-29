// Blockcraft server: serves the game and relays multiplayer messages.
// The host's browser runs the world; this server only pairs players up by room code
// and passes messages between them.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PORT = Number(process.env.PORT) || 8080;
const MAX_PLAYERS = 8;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // no 0/O or 1/I look-alikes

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
};
const PUBLIC = /^\/(index\.html|js\/[\w-]+\.js|favicon\.ico)?$/;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/healthz') { res.writeHead(200, { 'content-type': 'text/plain' }); res.end('ok'); return; }
  if (!PUBLIC.test(url.pathname)) { res.writeHead(404); res.end('Not found'); return; }
  const file = normalize(join(ROOT, url.pathname === '/' ? 'index.html' : url.pathname));
  try {
    const body = await readFile(file);
    res.writeHead(200, {
      'content-type': TYPES[extname(file)] || 'application/octet-stream',
      'cache-control': 'no-cache',
      'x-content-type-options': 'nosniff',
    });
    res.end(body);
  } catch {
    res.writeHead(404); res.end('Not found');
  }
});

// ---------------------------------------------------------------- rooms
const rooms = new Map();   // code -> { host, peers: Map(id -> ws), next }

function newCode() {
  for (;;) {
    let c = '';
    for (let i = 0; i < 4; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    if (!rooms.has(c)) return c;
  }
}

const send = (ws, msg) => { if (ws && ws.readyState === 1) ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg)); };
const cleanName = (n) => String(n || '').replace(/[^\w .'-]/g, '').trim().slice(0, 16) || 'Player';

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 16 * 1024 * 1024 });

wss.on('connection', (ws) => {
  ws.alive = true;
  ws.on('pong', () => { ws.alive = true; });
  ws.room = null;
  ws.pid = -1;

  ws.on('message', (raw) => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m !== 'object') return;
    const room = ws.room && rooms.get(ws.room);

    if (m.t === 'host' && !ws.room) {
      // a world keeps its code between sessions when it is free
      const want = String(m.code || '').toUpperCase();
      const code = want.length === 4 && [...want].every((c) => CODE_CHARS.includes(c)) && !rooms.has(want) ? want : newCode();
      rooms.set(code, { host: ws, peers: new Map(), next: 1 });
      ws.room = code; ws.pid = 0; ws.name = cleanName(m.name);
      send(ws, { t: 'hosted', code, id: 0 });
      return;
    }
    if (m.t === 'join' && !ws.room) {
      const code = String(m.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      const r = rooms.get(code);
      if (!r) { send(ws, { t: 'error', msg: 'No game with that code. Check it and try again.' }); return; }
      if (r.peers.size + 1 >= MAX_PLAYERS) { send(ws, { t: 'error', msg: 'That game is full.' }); return; }
      const id = r.next++;
      r.peers.set(id, ws);
      ws.room = code; ws.pid = id; ws.name = cleanName(m.name);
      send(ws, { t: 'joined', id, code });
      send(r.host, { t: 'peer', id, name: ws.name });
      return;
    }
    if (m.t === 'to' && room) {
      // Guests only talk to the host; the host can talk to one guest or everyone
      const out = JSON.stringify({ t: 'msg', from: ws.pid, d: m.d });
      if (ws.pid !== 0) { send(room.host, out); return; }
      if (m.to === '*') { for (const p of room.peers.values()) send(p, out); return; }
      if (Array.isArray(m.to)) { for (const id of m.to) send(room.peers.get(id), out); return; }
      send(room.peers.get(m.to), out);
    }
  });

  ws.on('close', () => {
    const r = ws.room && rooms.get(ws.room);
    if (!r) return;
    if (ws.pid === 0) {
      for (const p of r.peers.values()) { send(p, { t: 'closed' }); p.room = null; p.close(); }
      rooms.delete(ws.room);
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

server.listen(PORT, () => console.log(`Blockcraft running on http://localhost:${PORT}`));
