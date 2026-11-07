// Rewind (1.11.11): the world as it was a little while ago, to put right something done by mistake.
//
// Every few minutes of play (when something has changed), when you come into a world, just before a warhead that
// breaks blocks is launched and before the first explosion in a while, the game keeps a rewind point: a copy of
// this dimension's save (its blocks, chests, creatures, the time). Rewind in the Game Menu lists them; picking one
// puts the world back the way it was then. You keep what you are carrying and where you are standing.
//
// The points are kept in this browser (IndexedDB, which has far more room than the saves' own storage), squeezed
// small where the browser can, and the oldest go once a world has more than KEEP of them. In an online world
// only whoever is running it has them; rewinding there sends the old world to the server and everyone comes back
// in to it (main.js does the putting back: this file keeps the points and draws the screen).
import { G } from './game.js';

const DB = 'blockcraft-rewind', STORE = 'points', KEEP = 30;
let dbp = null;
function db() {
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      try {
        const rq = indexedDB.open(DB, 1);
        rq.onupgradeneeded = () => { const s = rq.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true }); s.createIndex('w', 'w'); };
        rq.onsuccess = () => resolve(rq.result);
        rq.onerror = () => reject(rq.error);
      } catch (e) { reject(e); }
    });
    dbp.catch(() => { dbp = null; });
  }
  return dbp;
}
const done = (rq) => new Promise((resolve, reject) => { rq.onsuccess = () => resolve(rq.result); rq.onerror = () => reject(rq.error); });

// (squeezed with gzip where the browser can: a world's save shrinks to about a tenth)
async function pack(text) {
  try {
    if (typeof CompressionStream === 'function') return { z: 1, b: await new Response(new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))).blob() };
  } catch { /* not supported here */ }
  return { z: 0, b: text };
}
async function unpack(rec) {
  if (!rec.z) return rec.b;
  return new Response(rec.b.stream().pipeThrough(new DecompressionStream('gzip'))).text();
}

// w: which world and dimension ("id" or "id~nether"); label: why it was kept; payload: { what, data, ... } with
// data a string (the save)
export async function savePoint(w, label, payload) {
  const { z, b } = await pack(payload.data);
  const d = await db();
  const tx = d.transaction(STORE, 'readwrite'), st = tx.objectStore(STORE);
  st.add({ w, t: Date.now(), label: String(label || '').slice(0, 60), ...payload, data: undefined, z, b, size: payload.data.length });
  // the oldest go
  const keys = await done(st.index('w').getAllKeys(w));
  for (const k of keys.slice(0, Math.max(0, keys.length - KEEP))) st.delete(k);
  return new Promise((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
}
// Newest first, without the saves themselves
export async function listPoints(w) {
  const d = await db();
  const all = await done(d.transaction(STORE).objectStore(STORE).index('w').getAll(w));
  return all.map(({ b, ...rest }) => rest).sort((a, b) => b.t - a.t);
}
export async function readPoint(id) {
  const d = await db();
  const rec = await done(d.transaction(STORE).objectStore(STORE).get(id));
  if (!rec) return null;
  const { b, ...rest } = rec;
  return { ...rest, data: await unpack(rec) };
}
// (a world deleted: its points go too)
export async function forgetWorld(id) {
  try {
    const d = await db();
    const st = d.transaction(STORE, 'readwrite').objectStore(STORE);
    for (const rec of await done(st.getAll())) if (rec.w === id || String(rec.w).startsWith(id + '~')) st.delete(rec.id);
  } catch { /* nothing kept */ }
}

// ---------------------------------------------------------------- the screen
let section = null;
const el = (tag, css, text) => { const e = document.createElement(tag); if (css) e.style.cssText = css; if (text != null) e.textContent = text; return e; };
const ago = (t) => {
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min ago`;
  return `${Math.floor(s / 86400)} day${s >= 172800 ? 's' : ''} ago`;
};
const clock = (t) => new Date(t).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' });

export async function openRewind(note = '') {
  if (!section) {
    section = el('section');
    section.className = 'screen dim';
    section.id = 's-rewind';
    section.hidden = true;
    const anchor = document.getElementById('s-container');
    anchor.parentNode.insertBefore(section, anchor);
  }
  section.textContent = '';
  section.appendChild(el('h2', null, 'Rewind World'));
  const box = el('div', 'width:min(720px,100%);margin:6px auto;padding:10px 16px;box-sizing:border-box;background:rgba(0,0,0,0.45);font:16px/1.4 monospace;max-height:70vh;overflow:auto;touch-action:pan-y;text-align:left;color:#eee');
  section.appendChild(box);
  const why = G.game.rewindBlocked ? G.game.rewindBlocked() : '';
  box.appendChild(el('div', 'color:#ccc;margin-bottom:8px', 'Puts this world back the way it was at one of these moments: blocks, chests, creatures and the time. You keep what you are carrying and where you are.' + (G.net ? ' Everyone in the world comes back in to it.' : '')));
  if (note) box.appendChild(el('div', 'color:#ffd866;margin-bottom:8px', note));
  if (why) box.appendChild(el('div', 'color:#ff7b6b;margin-bottom:8px', why));
  const list = el('div', 'display:flex;flex-direction:column;gap:6px');
  box.appendChild(list);
  list.appendChild(el('div', 'color:#aaa', 'Looking…'));
  const btns = el('div');
  btns.className = 'row';
  const now = el('button', null, 'Save a Rewind Point Now');
  now.className = 'btn'; now.type = 'button';
  now.disabled = !!why;
  now.addEventListener('click', async () => {
    now.disabled = true;
    const ok = await G.game.rewindPoint('Saved by hand', true);
    openRewind(ok ? 'Rewind point saved.' : 'Could not save a rewind point here.');
  });
  const back = el('button', null, 'Done');
  back.className = 'btn'; back.type = 'button';
  back.addEventListener('click', () => G.ui.back());
  btns.append(now, back);
  section.appendChild(btns);
  if (G.screen !== 'rewind') G.ui.openScreen('rewind');
  let pts = [];
  try { pts = await listPoints(G.game.rewindKey()); } catch { list.textContent = 'This browser will not keep rewind points (its storage is blocked or full).'; return; }
  list.textContent = '';
  if (!pts.length) { list.appendChild(el('div', 'color:#aaa', 'No rewind points yet. One is kept every few minutes while you play, and just before a warhead is launched.')); return; }
  for (const pt of pts) {
    const row = el('div', 'display:flex;align-items:center;gap:10px;padding:6px 8px;background:rgba(255,255,255,0.06);flex-wrap:wrap');
    const txt = el('div', 'flex:1;min-width:200px');
    txt.appendChild(el('div', 'color:#fff', `${clock(pt.t)} · ${ago(pt.t)}`));
    txt.appendChild(el('div', 'color:#aaa;font-size:14px', pt.label || ''));
    const go = el('button', 'font:15px monospace;padding:6px 12px;color:#fff;background:#2b4a6b;border:2px solid #69c;cursor:pointer', 'Rewind to here');
    go.type = 'button';
    go.disabled = !!why;
    if (why) go.style.opacity = '0.45';
    let armed = false;
    go.addEventListener('click', async () => {
      // (a second tap to be sure: everything since then is undone)
      if (!armed) { armed = true; go.textContent = 'Sure? Tap again'; go.style.background = '#8a1d14'; go.style.borderColor = '#f66'; return; }
      go.disabled = true; go.textContent = 'Rewinding…';
      let point = null;
      try { point = await readPoint(pt.id); } catch { /* unreadable */ }
      const err = point ? G.game.rewindTo(point) : 'That rewind point could not be read.';
      if (err) openRewind(err);
    });
    row.append(txt, go);
    list.appendChild(row);
  }
}
