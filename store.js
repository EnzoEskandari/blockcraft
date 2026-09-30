// Where online worlds are kept: a Postgres database when DATABASE_URL is set (permanent; saves are
// stored gzipped as base64 text), otherwise files in DATA_DIR or ./data (permanent on your own
// computer or a Render disk, but wiped whenever a free Render server restarts).
import zlib from 'node:zlib';
import { mkdir, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

const gzip = (s) => zlib.gzipSync(Buffer.from(s));
const gunzip = (b) => zlib.gunzipSync(b).toString();

export async function openStore(root, deps = {}) {
  const url = process.env.DATABASE_URL;
  if (url) {
    try { return await openDatabase(url.trim(), deps.pg || (await import('pg')).default); } catch (err) {
      // a wrong DATABASE_URL shouldn't take the game down: fall back to files and say why
      console.error('Could not use the database, falling back to files:', err.message);
      const s = await openFiles(root);
      s.dbError = err.message;
      return s;
    }
  }
  return openFiles(root);
}

async function openDatabase(url, pg) {
  {
    const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
    const pool = new pg.Pool({ connectionString: url, ssl: local ? false : { rejectUnauthorized: false }, max: 3, connectionTimeoutMillis: 15000 });
    pool.on('error', (err) => console.error('database connection error:', err.message));
    await pool.query(`create table if not exists blockcraft_worlds (
      id text primary key, meta jsonb not null, save text, updated bigint not null default 0)`);
    return {
      kind: 'database',
      permanent: true,
      async list() { return (await pool.query('select meta from blockcraft_worlds')).rows.map((r) => r.meta); },
      async getSave(id) {
        const r = await pool.query('select save from blockcraft_worlds where id = $1', [id]);
        return r.rows[0] && r.rows[0].save ? gunzip(Buffer.from(r.rows[0].save, 'base64')) : null;
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
    };
  }
}

async function openFiles(root) {
  const dir = process.env.DATA_DIR || join(root, 'data');
  await mkdir(dir, { recursive: true });
  const file = (id, ext) => join(dir, `${id}.${ext}`);
  return {
    kind: 'disk',
    // a free Render server forgets its files when it restarts; a Render disk (DATA_DIR) or your own computer doesn't
    permanent: !process.env.RENDER || !!process.env.DATA_DIR,
    async list() {
      const out = [];
      for (const f of await readdir(dir)) {
        if (!f.endsWith('.meta.json')) continue;
        try { out.push(JSON.parse(await readFile(join(dir, f), 'utf8'))); } catch { /* skip a damaged file */ }
      }
      return out;
    },
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
  };
}
