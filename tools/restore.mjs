// Puts an online world back the way it was on an earlier day (days are in UTC), from the daily backups the server keeps
// (the last 7 days; each one is the world as it was before that day's first save).
//
//   node tools/restore.mjs                       list the online worlds
//   node tools/restore.mjs ABC123                list that world's backups
//   node tools/restore.mjs ABC123 2026-10-01     put that backup back: all three dimensions and everyone's items
//
// Run it with the same DATABASE_URL as the server (e.g. DATABASE_URL='postgres://…' node tools/restore.mjs),
// while nobody is in that world. Then restart the server (on Render: Manual Deploy → Restart service).
// What the world looks like right now is backed up first, so a restore can be undone.
import { fileURLToPath } from 'node:url';
import { openStore } from '../store.js';

const store = await openStore(fileURLToPath(new URL('..', import.meta.url)));
const [rawId, day] = process.argv.slice(2);
const DIMS = ['', '~nether', '~end'];
try {
  if (!rawId) {
    for (const m of (await store.list()).filter((x) => !x.id.includes('~'))) console.log(`${m.id}  ${m.name}  (by ${m.ownerName || '?'}, last saved ${new Date(m.updated || 0).toLocaleString()})`);
  } else {
    const id = rawId.toUpperCase();
    const meta = await store.getMeta(id);
    if (!meta) throw new Error(`No online world ${id}.`);
    if (!day) {
      console.log(`Backups of ${id} (${meta.name}):`);
      const days = new Set();
      for (const d of DIMS) for (const b of await store.listBackups(id + d)) days.add(b.day);
      for (const d of [...days].sort().reverse()) console.log('  ' + d);
      if (!days.size) console.log('  none yet (one is made each day the world is played)');
    } else {
      const found = await store.getBackup(id, day);
      if (!found) throw new Error(`No backup of ${id} from ${day}. Run without a day to see the list.`);
      const stamp = 'before-restore-' + new Date().toISOString().slice(0, 16).replace(':', '');
      for (const d of DIMS) {
        const key = id + d;
        const b = d ? await store.getBackup(key, day) : found;
        const now = await store.getSave(key);
        if (now) await store.backup(key, stamp, now, d ? null : await store.getPlayers(id));
        if (!b) continue;
        const m = (await store.getMeta(key)) || { id: key, dimOf: id, v: 0 };
        m.updated = Date.now();
        m.v = (m.v || 0) + 1000;   // newer than any copy kept in a player's browser, so this is what loads
        await store.putSave(m, b.save);
        console.log(`Restored ${key} from ${day}.`);
      }
      for (const [account, data] of Object.entries(found.players || {})) await store.putPlayer(id, account, data);
      console.log(`Restored ${Object.keys(found.players || {}).length} players' items. Now restart the server. (To undo: restore "${stamp}".)`);
    }
  }
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
} finally {
  await store.close();
}
