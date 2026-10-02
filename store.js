// Where online worlds are kept: a Postgres database when DATABASE_URL is set (permanent; saves are
// stored gzipped as base64 text), otherwise files in DATA_DIR or ./data (permanent on your own
// computer or a Render disk, but wiped whenever a free Render server restarts or updates).
// Once a day, before a world's first save of the day, its previous save (and its players) is copied
// to the backups, and the last 7 days of backups are kept (see tools/restore.mjs).
import zlib from 'node:zlib';
import { mkdir, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

const gzip = (s) => zlib.gzipSync(Buffer.from(s));
const gunzip = (b) => zlib.gunzipSync(b).toString();
export const KEEP_BACKUPS = 7;

// With a database set this never falls back to files (on Render they vanish): if it can't be reached
// it throws, and the server keeps trying.
export async function openStore(root, deps = {}) {
  const url = cleanUrl(process.env.DATABASE_URL);
  if (url) return openDatabase(url, deps.pg || (await import('pg')).default);
  return openFiles(root);
}

// Forgives common paste mistakes: the whole "psql '…'" command, quotes, or "DATABASE_URL=" in front
export function cleanUrl(raw) {
  return String(raw || '').trim().replace(/^DATABASE_URL\s*=\s*/i, '').replace(/^psql\s+/, '').replace(/^['"]|['"]$/g, '').trim();
}

async function openDatabase(url, pg) {
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  const pool = new pg.Pool({ connectionString: url, ssl: local ? false : { rejectUnauthorized: false }, max: 3, connectionTimeoutMillis: 15000 });
  pool.on('error', (err) => console.error('database connection error:', err.message));
  try {
    await pool.query(`create table if not exists blockcraft_worlds (
      id text primary key, meta jsonb not null, save text, updated bigint not null default 0)`);
    await pool.query('create table if not exists blockcraft_accounts (id text primary key, data jsonb not null)');
    await pool.query('create table if not exists blockcraft_sessions (token text primary key, account text not null, created bigint not null)');
    await pool.query('create table if not exists blockcraft_players (world text not null, account text not null, data jsonb not null, primary key (world, account))');
    await pool.query(`create table if not exists blockcraft_backups (
      id text not null, day text not null, save text not null, players jsonb, created bigint not null, primary key (id, day))`);
    // who has each online world in their list (its creator, and everyone who has opened its link)
    await pool.query(`create table if not exists blockcraft_members (
      world text not null, account text not null, joined bigint not null, hidden boolean not null default false, primary key (world, account))`);
    // everyone who played a world before this list existed keeps it
    await pool.query(`insert into blockcraft_members (world, account, joined)
      select world, account, 0 from blockcraft_players on conflict do nothing`);
  } catch (err) {
    pool.end().catch(() => {});
    throw err;
  }
  const one = async (sql, args) => (await pool.query(sql, args)).rows[0] || null;
  return {
    kind: 'database',
    permanent: true,
    close: () => pool.end(),
    async list() { return (await pool.query('select meta from blockcraft_worlds')).rows.map((r) => r.meta); },
    async getMeta(id) { const r = await one('select meta from blockcraft_worlds where id = $1', [id]); return r ? r.meta : null; },
    async getSave(id) {
      const r = await one('select save from blockcraft_worlds where id = $1', [id]);
      return r && r.save ? gunzip(Buffer.from(r.save, 'base64')) : null;
    },
    async putMeta(meta) {
      await pool.query(`insert into blockcraft_worlds (id, meta, updated) values ($1, $2, $3)
        on conflict (id) do update set meta = excluded.meta, updated = excluded.updated`, [meta.id, meta, meta.updated || 0]);
    },
    async putSave(meta, save) {
      await pool.query(`insert into blockcraft_worlds (id, meta, save, updated) values ($1, $2, $3, $4)
        on conflict (id) do update set meta = excluded.meta, save = excluded.save, updated = excluded.updated`, [meta.id, meta, gzip(save).toString('base64'), meta.updated || 0]);
    },
    async del(id) { await pool.query('delete from blockcraft_worlds where id = $1', [id]); },
    // accounts and sign-in sessions (tokens are stored hashed)
    async loadAccounts() { return (await pool.query('select data from blockcraft_accounts')).rows.map((r) => r.data); },
    async getAccount(id) { const r = await one('select data from blockcraft_accounts where id = $1', [id]); return r ? r.data : null; },
    async findAccount(lowerName) { const r = await one("select data from blockcraft_accounts where lower(data->>'name') = $1 limit 1", [lowerName]); return r ? r.data : null; },
    async putAccount(a) {
      await pool.query('insert into blockcraft_accounts (id, data) values ($1, $2) on conflict (id) do update set data = excluded.data', [a.id, a]);
    },
    async loadSessions() { return (await pool.query('select token, account, created from blockcraft_sessions')).rows.map((r) => ({ ...r, created: Number(r.created) })); },
    async getSession(token) { const r = await one('select token, account, created from blockcraft_sessions where token = $1', [token]); return r ? { ...r, created: Number(r.created) } : null; },
    async putSession(x) { await pool.query('insert into blockcraft_sessions (token, account, created) values ($1, $2, $3) on conflict (token) do nothing', [x.token, x.account, x.created]); },
    async delSession(token) { await pool.query('delete from blockcraft_sessions where token = $1', [token]); },
    // each player's inventory and position in each online world
    async getPlayer(world, account) { const r = await one('select data from blockcraft_players where world = $1 and account = $2', [world, account]); return r ? r.data : null; },
    async getPlayers(world) { return Object.fromEntries((await pool.query('select account, data from blockcraft_players where world = $1', [world])).rows.map((r) => [r.account, r.data])); },
    async putPlayer(world, account, data) {
      await pool.query('insert into blockcraft_players (world, account, data) values ($1, $2, $3) on conflict (world, account) do update set data = excluded.data', [world, account, data]);
    },
    async delPlayers(world) {
      await pool.query('delete from blockcraft_players where world = $1', [world]);
      await pool.query('delete from blockcraft_members where world = $1', [world]);
    },
    // which worlds are in each player's list ({ world: hidden })
    async memberWorlds(account) {
      return Object.fromEntries((await pool.query('select world, hidden from blockcraft_members where account = $1', [account])).rows.map((r) => [r.world, r.hidden]));
    },
    async setMember(world, account, hidden) {
      await pool.query(`insert into blockcraft_members (world, account, joined, hidden) values ($1, $2, $3, $4)
        on conflict (world, account) do update set hidden = excluded.hidden`, [world, account, Date.now(), hidden]);
    },
    // daily copies
    async backup(id, day, save, players) {
      await pool.query(`insert into blockcraft_backups (id, day, save, players, created) values ($1, $2, $3, $4, $5)
        on conflict (id, day) do nothing`, [id, day, gzip(save).toString('base64'), players, Date.now()]);
      await pool.query(`delete from blockcraft_backups where id = $1 and day not in
        (select day from blockcraft_backups where id = $1 order by day desc limit ${KEEP_BACKUPS})`, [id]);
    },
    async listBackups(id) { return (await pool.query('select day, created from blockcraft_backups where id = $1 order by day desc', [id])).rows.map((r) => ({ day: r.day, created: Number(r.created) })); },
    async getBackup(id, day) {
      const r = await one('select save, players from blockcraft_backups where id = $1 and day = $2', [id, day]);
      return r ? { save: gunzip(Buffer.from(r.save, 'base64')), players: r.players } : null;
    },
  };
}

async function openFiles(root) {
  const dir = process.env.DATA_DIR || join(root, 'data');
  await mkdir(dir, { recursive: true });
  const file = (id, ext) => join(dir, `${id}.${ext}`);
  // accounts and sessions are small, so each lives in one JSON file
  const readJson = async (name) => { try { return JSON.parse(await readFile(join(dir, name), 'utf8')); } catch { return {}; } };
  const accounts = await readJson('accounts.json');
  const sessions = await readJson('sessions.json');
  // account -> { world: hidden }; everyone who played a world before this list existed keeps it
  const members = await readJson('members.json');
  for (const f of await readdir(dir)) {
    if (!f.endsWith('.players.json')) continue;
    const world = f.slice(0, -'.players.json'.length);
    for (const account of Object.keys(await readJson(f))) {
      members[account] = members[account] || {};
      if (!(world in members[account])) members[account][world] = false;
    }
  }
  const flush = (name, obj) => writeFile(join(dir, name), JSON.stringify(obj));
  const backups = (id) => join(dir, 'backups', id.replace('~', '_'));
  return {
    kind: 'disk',
    // a free Render server forgets its files when it restarts; a Render disk (DATA_DIR) or your own computer doesn't
    permanent: !process.env.RENDER || !!process.env.DATA_DIR,
    close: async () => {},
    async list() {
      const out = [];
      for (const f of await readdir(dir)) {
        if (!f.endsWith('.meta.json')) continue;
        try { out.push(JSON.parse(await readFile(join(dir, f), 'utf8'))); } catch { /* skip a damaged file */ }
      }
      return out;
    },
    async getMeta(id) { try { return JSON.parse(await readFile(file(id, 'meta.json'), 'utf8')); } catch { return null; } },
    async getSave(id) {
      try { return gunzip(await readFile(file(id, 'save.gz'))); } catch { return null; }
    },
    async putMeta(meta) { await writeFile(file(meta.id, 'meta.json'), JSON.stringify(meta)); },
    async putSave(meta, save) {
      await writeFile(file(meta.id, 'save.gz'), gzip(save));
      await writeFile(file(meta.id, 'meta.json'), JSON.stringify(meta));
    },
    async del(id) {
      await rm(file(id, 'save.gz'), { force: true });
      await rm(file(id, 'meta.json'), { force: true });
    },
    async loadAccounts() { return Object.values(accounts); },
    async getAccount(id) { return accounts[id] || null; },
    async findAccount(lowerName) { return Object.values(accounts).find((a) => a.name.toLowerCase() === lowerName) || null; },
    async putAccount(a) { accounts[a.id] = a; await flush('accounts.json', accounts); },
    async loadSessions() { return Object.values(sessions); },
    async getSession(token) { return sessions[token] || null; },
    async putSession(x) { sessions[x.token] = x; await flush('sessions.json', sessions); },
    async delSession(token) { delete sessions[token]; await flush('sessions.json', sessions); },
    async getPlayer(world, account) { const all = await readJson(`${world}.players.json`); return all[account] || null; },
    async getPlayers(world) { return readJson(`${world}.players.json`); },
    async putPlayer(world, account, data) {
      const all = await readJson(`${world}.players.json`);
      all[account] = data;
      await flush(`${world}.players.json`, all);
    },
    async delPlayers(world) {
      await rm(join(dir, `${world}.players.json`), { force: true });
      for (const m of Object.values(members)) delete m[world];
      await flush('members.json', members);
    },
    async memberWorlds(account) { return { ...(members[account] || {}) }; },
    async setMember(world, account, hidden) {
      members[account] = members[account] || {};
      members[account][world] = hidden;
      await flush('members.json', members);
    },
    async backup(id, day, save, players) {
      const d = backups(id);
      await mkdir(d, { recursive: true });
      await writeFile(join(d, `${day}.json.gz`), gzip(JSON.stringify({ save, players })), { flag: 'wx' }).catch((e) => { if (e.code !== 'EEXIST') throw e; });
      const days = (await readdir(d)).filter((f) => f.endsWith('.json.gz')).sort().reverse();
      for (const f of days.slice(KEEP_BACKUPS)) await rm(join(d, f), { force: true });
    },
    async listBackups(id) {
      try { return (await readdir(backups(id))).filter((f) => f.endsWith('.json.gz')).sort().reverse().map((f) => ({ day: f.slice(0, -'.json.gz'.length) })); } catch { return []; }
    },
    async getBackup(id, day) {
      try { return JSON.parse(gunzip(await readFile(join(backups(id), `${day}.json.gz`)))); } catch { return null; }
    },
  };
}
