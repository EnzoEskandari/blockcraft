// Blockcraft server: serves the game, keeps the online worlds, and relays multiplayer messages.
// The world itself runs in the browser of whoever is "hosting" it right now (the first player in);
// they send the save here every few seconds, and if they leave the next player takes over.
import http from 'node:http';
import crypto from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { openStore } from './store.js';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PORT = Number(process.env.PORT) || 8080;
const MAX_PLAYERS = 8;
const ID_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // no 0/O or 1/I look-alikes
const ID_RE = /^[A-HJ-NP-Z2-9]{6}$/;

const BOOT = Date.now();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// online worlds, and the saves of their Nether and End ("ID~nether", "ID~end")
const DIMS = ['overworld', 'nether', 'end'];
const roomKey = (id, dim) => (dim === 'overworld' ? id : `${id}~${dim}`);
const worlds = new Map();
const dimMetas = new Map();
const accounts = new Map();
const byName = new Map();
const sessions = new Map();   // hashed token -> session
const restored = new Set();   // worlds this server had lost and got back from a player's browser

// The database (or data folder). With a database set the server never falls back to files that a
// restart would wipe: until it answers, the game still loads and online worlds say to try again soon.
let store = null;
let storeError = '';
async function openAll() {
  for (let wait = 2000; ; wait = Math.min(wait * 2, 30000)) {
    let s = null;
    try {
      s = await openStore(ROOT);
      for (const m of await s.list()) (m.id.includes('~') ? dimMetas : worlds).set(m.id, m);
      for (const a of await s.loadAccounts()) addAccount(a);
      for (const x of await s.loadSessions()) sessions.set(x.token, x);
      store = s;
      console.log(`Online worlds: ${worlds.size} (${s.kind}${s.permanent ? '' : ', not permanent: add a database to keep them'})`);
      return;
    } catch (err) {
      if (s) s.close().catch(() => {});
      storeError = String(err.message).replace(/postgres(ql)?:\/\/\S+/gi, '(the address)');
      console.error(`Could not open the ${process.env.DATABASE_URL ? 'database' : 'data folder'}, trying again in ${wait / 1000}s:`, err.message);
      await sleep(wait);
    }
  }
}
openAll();
// What to tell players while the worlds aren't open yet (after half a minute, why)
const notReady = () => (Date.now() - BOOT < 30000 || !storeError ? 'Online worlds are starting up. Try again in a few seconds.'
  : `Online worlds can't reach the database right now (${storeError}). If this keeps happening, check DATABASE_URL on Render.`);

// A fingerprint of the game's files, so players still on an older page can be told to reload
const BUILD = crypto.createHash('sha256').update(
  [await readFile(join(ROOT, 'index.html')), ...(await Promise.all((await readdir(join(ROOT, 'js'))).sort().map((f) => readFile(join(ROOT, 'js', f)))))].map(String).join('\n'),
).digest('hex').slice(0, 10);

// ---------------------------------------------------------------- accounts
// A username and password make you the same player everywhere; your items are saved under your account.
const NAME_RE = /^[A-Za-z0-9_]{3,16}$/;
const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');
const scrypt = (pw, salt) => new Promise((res, rej) => crypto.scrypt(pw, salt, 64, (e, k) => (e ? rej(e) : res(k))));
const pub = (a) => ({ id: a.id, name: a.name, admin: isAdmin(a) || undefined });

// Admins run the online worlds: the accounts named in ADMINS (by default "Enzo"), and anyone an admin
// makes one with /op. An admin name can only be signed up with the ADMIN_PASSWORD set on the server
// (Render > Environment), so nobody else can claim it.
const ADMIN_NAMES = new Set(String(process.env.ADMINS ?? 'Enzo').split(',').map((n) => n.trim().toLowerCase()).filter(Boolean));
const isAdmin = (a) => !!a && (ADMIN_NAMES.has(a.name.toLowerCase()) || !!a.admin);
const sameSecret = (a, b) => crypto.timingSafeEqual(crypto.createHash('sha256').update(String(a)).digest(), crypto.createHash('sha256').update(String(b)).digest());
const BANNED = 'This account is banned from multiplayer.';
function addAccount(a) { accounts.set(a.id, a); byName.set(a.name.toLowerCase(), a); }
// During an update two copies of the server run for a moment: anything new on the other one is looked up.
// If the database can't answer these throw, so nobody is signed out or given a fresh world by mistake.
async function accountNamed(name) {
  const k = name.toLowerCase();
  if (byName.has(k)) return byName.get(k);
  const a = await store.findAccount(k);
  if (a) addAccount(a);
  return a;
}
// Which worlds are in an account's list ({ world: hidden }), kept in memory once read
const members = new Map();
async function memberList(account) {
  if (!members.has(account)) members.set(account, await store.memberWorlds(account));
  return members.get(account);
}
async function setMember(world, account, hidden) {
  const mine = await memberList(account);
  if (mine[world] === hidden) return;
  await store.setMember(world, account, hidden);
  mine[world] = hidden;
}
async function worldMeta(id) {
  if (worlds.has(id)) return worlds.get(id);
  const m = ID_RE.test(id) ? await store.getMeta(id) : null;
  if (m) worlds.set(id, m);
  return m;
}

async function newSession(a) {
  const token = crypto.randomBytes(24).toString('base64url');
  const x = { token: sha(token), account: a.id, created: Date.now() };
  await store.putSession(x);
  sessions.set(x.token, x);
  return token;
}
async function accountFrom(token) {
  if (typeof token !== 'string' || !token || token.length > 100) return null;
  const h = sha(token);
  let x = sessions.get(h);
  if (!x) { x = await store.getSession(h); if (x) sessions.set(h, x); }
  if (!x) return null;
  let a = accounts.get(x.account);
  if (!a) { a = await store.getAccount(x.account); if (a) addAccount(a); }
  return a && !a.banned ? a : null;   // a banned account is signed out everywhere
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
    // Healthy once the worlds are open (or after a while anyway, so the game itself still loads if the database is down)
    if (p === '/healthz') { const ok = store || Date.now() - BOOT > 90000; res.writeHead(ok ? 200 : 503, { 'content-type': 'text/plain' }); res.end(ok ? 'ok' : 'starting'); return; }
    if (p === '/api/build') { json(res, 200, { build: BUILD }); return; }
    if (p.startsWith('/api/') && !store) { json(res, 503, { error: notReady() }); return; }
    if (p === '/api/signup' && req.method === 'POST') {
      if (tooMany(req)) { json(res, 429, { error: 'Too many tries. Wait a few minutes.' }); return; }
      const b = await readBody(req);
      const name = String(b.name || '').trim(), pw = String(b.password || '');
      if (!NAME_RE.test(name)) { json(res, 400, { error: 'Usernames are 3 to 16 letters, numbers or _.' }); return; }
      if (pw.length < 6 || pw.length > 100) { json(res, 400, { error: 'Passwords need at least 6 characters.' }); return; }
      if (await accountNamed(name)) { json(res, 409, { error: 'That username is taken.' }); return; }
      if (ADMIN_NAMES.has(name.toLowerCase()) && !(process.env.ADMIN_PASSWORD && sameSecret(pw, process.env.ADMIN_PASSWORD))) {
        json(res, 403, { error: 'That username is reserved.' });
        return;
      }
      const salt = crypto.randomBytes(16).toString('hex');
      const a = { id: 'u_' + crypto.randomBytes(9).toString('base64url'), name, salt, hash: (await scrypt(pw, salt)).toString('hex'), created: Date.now() };
      await store.putAccount(a);
      addAccount(a);
      json(res, 201, { token: await newSession(a), account: pub(a) });
      return;
    }
    if (p === '/api/login' && req.method === 'POST') {
      if (tooMany(req)) { json(res, 429, { error: 'Too many tries. Wait a few minutes.' }); return; }
      const b = await readBody(req);
      const a = await accountNamed(String(b.name || '').trim());
      const key = await scrypt(String(b.password || ''), a ? a.salt : 'no-such-account');
      if (!a || !crypto.timingSafeEqual(key, Buffer.from(a.hash, 'hex'))) { json(res, 401, { error: 'Wrong username or password.' }); return; }
      if (a.banned) { json(res, 403, { error: BANNED + (a.banned.reason ? ` (${a.banned.reason})` : '') }); return; }
      json(res, 200, { token: await newSession(a), account: pub(a) });
      return;
    }
    if (p === '/api/me' && req.method === 'GET') {
      const a = await accountFrom(bearer(req));
      json(res, a ? 200 : 401, a ? { account: pub(a) } : { error: 'Not signed in' });
      return;
    }
    if (p === '/api/logout' && req.method === 'POST') {
      const t = bearer(req);
      if (t && t.length <= 100) { sessions.delete(sha(t)); await store.delSession(sha(t)); }
      json(res, 200, { ok: true });
      return;
    }
    // Admins: every account, who is online where, and what they can do about it
    if (p === '/api/admin/players' && req.method === 'GET') {
      const who = await accountFrom(bearer(req));
      if (!isAdmin(who)) { json(res, 403, { error: 'Only admins can do that.' }); return; }
      json(res, 200, { players: playerList() });
      return;
    }
    if (p === '/api/admin' && req.method === 'POST') {
      const who = await accountFrom(bearer(req));
      if (!isAdmin(who)) { json(res, 403, { error: 'Only admins can do that.' }); return; }
      const b = await readBody(req);
      json(res, 200, { msg: await adminAction(who, String(b.action || ''), String(b.name || ''), String(b.reason || '').slice(0, 80)) });
      return;
    }
    // Your online worlds: the ones you made, and the ones whose link you have opened (nobody else's)
    if (p === '/api/worlds' && req.method === 'GET') {
      const who = await accountFrom(bearer(req));
      let list = [];
      if (who) {
        for (const m of await store.list().catch(() => [])) if (!m.id.includes('~') && !worlds.has(m.id)) worlds.set(m.id, m);   // made on the other copy during an update
        const mine = await store.memberWorlds(who.id);   // fresh, in case another copy of the server changed it
        members.set(who.id, mine);
        // (your own stay in your list unless you took them off it; the join code puts one back)
        list = [...worlds.values()].filter((m) => mine[m.id] === false || (m.owner === who.id && mine[m.id] !== true))
          .map((m) => ({ ...m, players: playersIn(m.id), mine: m.owner === who.id || !m.owner })).sort((a, b) => (b.updated || 0) - (a.updated || 0));
      }
      json(res, 200, { permanent: store.permanent, storage: store.kind, build: BUILD, worlds: list });
      return;
    }
    if (p === '/api/worlds' && req.method === 'POST') {
      const who = await accountFrom(bearer(req));
      if (!who) { json(res, 401, { error: 'Sign in first.' }); return; }
      const b = await readBody(req);
      const name = cleanName(b.name, 32) || 'Online World';
      const seed = Number(b.seed) >>> 0;
      const mode = b.mode === 'creative' ? 'creative' : 'survival';
      const meta = { id: newId(), name, seed, mode, created: Date.now(), updated: Date.now(), v: 0, owner: who.id, ownerName: who.name };
      await store.putMeta(meta);
      worlds.set(meta.id, meta);
      await setMember(meta.id, who.id, false);
      json(res, 201, meta);
      return;
    }
    const del = p.match(/^\/api\/worlds\/([A-Z0-9]{6})$/);
    if (del && req.method === 'DELETE') {
      const id = del[1];
      const who = await accountFrom(bearer(req));
      if (!who) { json(res, 401, { error: 'Sign in first.' }); return; }
      const wm = await worldMeta(id);
      if (!wm) { json(res, 404, { error: 'No such world' }); return; }
      if ((wm.owner && wm.owner !== who.id) || url.searchParams.get('only') === 'list') {
        // someone else's world, or your own when you only want it out of the way, just leaves your list
        // (its join code and link still work, and bring it back)
        await setMember(id, who.id, true);
        json(res, 200, { ok: true, removed: true });
        return;
      }
      if (playersIn(id)) { json(res, 409, { error: 'Someone is playing in that world right now. Wait until they leave, or take it off your list instead.' }); return; }
      for (const d of DIMS) { const k = roomKey(id, d); await store.del(k); saves.delete(k); dimMetas.delete(k); }
      await store.delPlayers(id);
      worlds.delete(id);
      for (const k of [...records.keys()]) if (k.startsWith(id + '|')) records.delete(k);
      for (const m of members.values()) delete m[id];
      json(res, 200, { ok: true });
      return;
    }
    if (!PUBLIC.test(p)) { res.writeHead(404); res.end('Not found'); return; }
    const file = normalize(join(ROOT, p === '/' ? 'index.html' : p));
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache', 'x-content-type-options': 'nosniff' });
    res.end(body);
  } catch (err) {
    if (res.headersSent) return;
    if (p.startsWith('/api/')) { console.error('api error', p, err && err.message); json(res, 500, { error: 'The server could not do that just now. Try again in a moment.' }); return; }
    res.writeHead(err && err.code === 'ENOENT' ? 404 : 500); res.end();
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
  try {
    if (meta.backupDay !== today()) await backupFirst(id, meta);
    await store.putSave(meta, s.data);
  } catch (err) {
    // keep it and try again (it is also still in the host's browser)
    s.dirty = true;
    console.error('save failed', id, err.message);
    if (!s.timer) s.timer = setTimeout(() => writeSave(id), 15000);
    return;
  }
  if (!rooms.has(id) && !s.dirty) saves.delete(id);
}

// Once a day, before a world's first save of the day, keep a copy of how it was (and its players' items)
const today = () => new Date().toISOString().slice(0, 10);
async function backupFirst(id, meta) {
  const day = today();
  try {
    const old = await store.getSave(id);
    if (old) await store.backup(id, day, old, id.includes('~') ? null : await store.getPlayers(id));
    meta.backupDay = day;
  } catch (err) { console.error('backup failed', id, err.message); }
}

function queueSave(id, data, v) {
  const meta = metaOf(id);
  if (!meta) return;
  meta.updated = Date.now();
  meta.v = Math.max(meta.v || 0, v || 0);
  let s = saves.get(id);
  if (!s) { s = { data, dirty: true, timer: null }; saves.set(id, s); }
  s.data = data; s.dirty = true; s.at = Date.now();
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
  // if the database can't be read this throws: better than starting someone with nothing over their items
  const data = await store.getPlayer(world, account);
  if (!records.has(k)) records.set(k, { data, dirty: false, timer: null });
  return records.get(k).data;
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
  try { await store.putPlayer(world, account, r.data); } catch (err) {
    r.dirty = true;
    console.error('player save failed', err.message);
    if (!r.timer) r.timer = setTimeout(() => flushRecord(world, account), 15000);
  }
}

// ---------------------------------------------------------------- rooms
const rooms = new Map();   // world id -> { host, peers: Map(id -> ws), next }
const send = (ws, msg) => { if (ws && ws.readyState === 1) ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg)); };

// Someone opening an online world: they run it if nobody is in that dimension yet, otherwise they join whoever does
async function enterWorld(ws, m) {
  if (!store || stopping) { send(ws, { t: 'error', msg: stopping ? 'Blockcraft is updating. Reconnecting…' : notReady(), retry: true }); return; }
  const acc = await accountFrom(m.token);
  if (!acc) { send(ws, { t: 'error', msg: 'Sign in to play online.', signedOut: true }); return; }
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
    await sleep(300);
    await flushRecord(id, acc.id);
  }
  const haves = m.haves && typeof m.haves === 'object' ? m.haves : {};
  let meta = await worldMeta(id);
  let useLocal = false;
  if (!meta) {
    // The server forgot this world (it restarted without a database): bring it back from a player's copy
    const hm = Object.values(haves).map((h) => h && typeof h === 'object' && h.meta).find((x) => x && x.id === id);
    if (!ID_RE.test(id) || !hm) { send(ws, { t: 'error', msg: 'That world does not exist. It may have been deleted.' }); return; }
    meta = { id, name: cleanName(hm.name, 32) || 'Online World', seed: Number(hm.seed) >>> 0, mode: hm.mode === 'creative' ? 'creative' : 'survival', created: hm.created || Date.now(), updated: Date.now(), v: 0 };
    worlds.set(id, meta);
    await store.putMeta(meta);
    restored.add(id);
    useLocal = true;
  }
  // opening a world (its link) puts it in your list
  await setMember(id, acc.id, false);
  // your own record in this world; if the server lost it too, the copy your browser kept
  let me = await getRecord(id, acc.id);
  const mine = m.mine && typeof m.mine === 'object' && !Array.isArray(m.mine) && JSON.stringify(m.mine).length < 65536 ? m.mine : null;
  if (!me && mine && (restored.has(id) || !store.permanent)) { me = mine; putRecord(id, acc.id, me); }
  // which dimension: where you are travelling to, or wherever you last were
  const dim = DIMS.includes(m.dim) ? m.dim : me && DIMS.includes(me.dim) ? me.dim : 'overworld';
  const key = roomKey(id, dim);
  const have = haves[dim] && typeof haves[dim] === 'object' ? haves[dim] : null;
  ws.name = acc.name;
  const r = rooms.get(key);
  if (r && r.host.readyState === 1) {
    if (playersIn(id) >= MAX_PLAYERS) { send(ws, { t: 'error', msg: 'That world is full.' }); return; }
    const pid = r.next++;
    r.peers.set(pid, ws);
    ws.room = key; ws.pid = pid;
    send(ws, { t: 'joined', id: pid, code: id, dim, me, build: BUILD });
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
  send(ws, { t: 'hostworld', meta, dim, v: rm.v || 0, save, useLocal, me, build: BUILD });
}

// ---------------------------------------------------------------- admin
const socketsOf = (accountId) => [...wss.clients].filter((q) => q.account === accountId && q.readyState === 1);
const placeOf = (q) => { const [id, dim] = String(q.room || '').split('~'); const w = worlds.get(id); return w ? `${w.name}${dim ? ` (${dim === 'nether' ? 'Nether' : 'End'})` : ''}` : 'joining'; };

function playerList() {
  return [...accounts.values()].map((a) => ({
    name: a.name, created: a.created || 0, admin: isAdmin(a), owner: ADMIN_NAMES.has(a.name.toLowerCase()),
    banned: a.banned ? { by: a.banned.by, reason: a.banned.reason || '', at: a.banned.at } : null,
    online: socketsOf(a.id).filter((q) => q.room).map(placeOf),
  })).sort((x, y) => (y.online.length - x.online.length) || x.name.localeCompare(y.name));
}

// kill, kick, ban, unban, op and deop someone; the answer is a sentence for the admin
async function adminAction(admin, action, name, reason) {
  const a = name ? await accountNamed(name.trim()) : null;
  if (!a) return name ? `There is no player called ${name}.` : 'Say which player.';
  const fixed = ADMIN_NAMES.has(a.name.toLowerCase());
  if (action === 'kill') {
    const qs = socketsOf(a.id).filter((q) => q.room);
    for (const q of qs) send(q, { t: 'admin', a: 'kill', by: admin.name });
    return qs.length ? `Killed ${a.name}.` : `${a.name} isn't in an online world right now.`;
  }
  if (action === 'kick' || action === 'ban') {
    if (action === 'ban') {
      if (fixed) return `${a.name} is a server admin and can't be banned.`;
      a.banned = { by: admin.name, at: Date.now(), reason };
      await store.putAccount(a);
    }
    const qs = socketsOf(a.id);
    for (const q of qs) { send(q, { t: 'admin', a: action, by: admin.name, reason }); setTimeout(() => q.close(), 400); }
    if (action === 'kick') return qs.length ? `Kicked ${a.name}.` : `${a.name} isn't online.`;
    return `Banned ${a.name} from multiplayer${reason ? ` (${reason})` : ''}. /unban ${a.name} lets them back.`;
  }
  if (action === 'unban') {
    if (!a.banned) return `${a.name} isn't banned.`;
    delete a.banned;
    await store.putAccount(a);
    return `Unbanned ${a.name}.`;
  }
  if (action === 'op' || action === 'deop') {
    if (fixed) return `${a.name} is always an admin.`;
    a.admin = action === 'op';
    await store.putAccount(a);
    return a.admin ? `${a.name} is now an admin.` : `${a.name} is no longer an admin.`;
  }
  return `Unknown action ${action}.`;
}

// Chat commands (anything starting with /)
async function command(ws, text) {
  const acc = accounts.get(ws.account);
  const [cmd, name, ...rest] = text.trim().replace(/^\//, '').split(/\s+/);
  const c = (cmd || '').toLowerCase();
  if (c === 'list') {
    const here = String(ws.room || '').split('~')[0];
    const names = [...wss.clients].filter((q) => q.room && q.room.split('~')[0] === here && q.name).map((q) => q.name);
    return `${names.length} playing here: ${names.join(', ')}`;
  }
  if (!isAdmin(acc)) return c === 'help' ? 'Commands: /list (who is playing here). The rest are for admins.' : `Only admins can use /${c}.`;
  if (c === 'help') return 'Admin commands: /kill name, /kick name, /ban name [reason], /unban name, /op name, /deop name, /players (everyone online), /accounts (every account), /list';
  if (c === 'players') {
    const on = playerList().filter((x) => x.online.length);
    return on.length ? 'Online: ' + on.map((x) => `${x.name} in ${x.online.join(', ')}`).join('; ') : 'Nobody is in an online world.';
  }
  if (c === 'accounts') {
    const all = playerList();
    return `${all.length} accounts: ` + all.map((x) => x.name + (x.banned ? ' (banned)' : x.admin ? ' (admin)' : '')).join(', ');
  }
  if (['kill', 'kick', 'ban', 'unban', 'op', 'deop'].includes(c)) return adminAction(acc, c, name || '', rest.join(' ').slice(0, 80));
  return `Unknown command /${c}. Try /help.`;
}

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
      try { await enterWorld(ws, m); } catch (err) {
        // the database didn't answer: nobody starts with an empty world or empty pockets, they try again
        console.error('join failed', err && err.message);
        const r = ws.room && rooms.get(ws.room);
        if (r && r.host === ws) rooms.delete(ws.room); else if (r) r.peers.delete(ws.pid);
        ws.room = null;
        send(ws, { t: 'error', msg: 'Could not open the world just now. Trying again…', retry: true });
      }
      ws.joining = false;
      return;
    }
    if (m.t === 'me' && ws.world && ws.account && m.data && typeof m.data === 'object') { putRecord(ws.world, ws.account, m.data); return; }
    if (m.t === 'cmd' && ws.account && typeof m.text === 'string') {
      try { send(ws, { t: 'cmd', msg: await command(ws, m.text.slice(0, 200)) }); } catch (err) { send(ws, { t: 'cmd', msg: 'That did not work: ' + err.message }); }
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
    if (ws.world && ws.account) flushRecord(ws.world, ws.account);
    const id = ws.room;
    const r = id && rooms.get(id);
    if (!r) return;
    if (r.host === ws) {
      rooms.delete(id);
      await writeSave(id);
      if (stopping) return;
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

// Before the server stops (Render sends SIGTERM when it updates or restarts the game): everyone sends a
// last save (the world from whoever runs it, everyone their own items), it is all written, then it stops.
// Players reconnect by themselves to the new server a moment later.
let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  const asked = Date.now();
  for (const ws of wss.clients) send(ws, { t: 'restart' });
  await sleep(600);
  for (let i = 0; i < 30 && [...rooms.keys()].some((k) => !(saves.get(k) && saves.get(k).at > asked)); i++) await sleep(100);
  for (const id of [...saves.keys()]) await writeSave(id);
  for (const k of [...records.keys()]) { const [w, a] = k.split('|'); await flushRecord(w, a); }
  for (const ws of wss.clients) ws.close(1012, 'restarting');
  if (store) await store.close().catch(() => {});
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

server.listen(PORT, () => console.log(`Blockcraft running on http://localhost:${PORT}`));
