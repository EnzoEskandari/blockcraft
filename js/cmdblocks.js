// Command blocks (1.11.6), for building in Creative. A command block runs one command when something sets it
// off: a click, a pressure plate stepped on beside it or on top of it, a player coming near, or every few
// seconds by itself. Only a player in Creative can set one up (use it to open its screen), and nobody can break
// one outside Creative.
//
// The commands are the world's own, the kind a map maker wants (say, time, weather, give, tp, effect, heal,
// summon, setblock, fill, spawnpoint, tick), never an admin's: nobody can be kicked, banned, made an admin or killed
// by one. Commands about a player are about whoever is nearest the block, and ~ in a place means "from this
// block" (~ ~3 ~ is three blocks above it).
//
// What each block runs is kept in the world's flags (saved with the world) under "x,y,z". In multiplayer it
// all happens where the world lives (the host): a guest's changes, clicks and plates are sent there, and what a
// command does to a guest is sent back to them.
import { G } from './game.js';
import { B, BLOCKS, ITEMS, ID } from './blocks.js';
import { sfx } from './audio.js';
import { MOB_TYPES } from './entities.js';

export const MODES = [
  ['click', 'When clicked', 'Anyone who clicks it (or taps it) sets it off. In Creative a click opens this screen instead, so use Run Now to try it.'],
  ['plate', 'When stepped on', 'Put a pressure plate on top of it or right beside it. Stepping on the plate sets it off.'],
  ['near', 'When a player comes near', 'Goes off when someone comes within the distance below, and again once everyone has left and someone comes back.'],
  ['repeat', 'Over and over', 'Runs by itself every few seconds while you are nearby.'],
];
export const EXAMPLES = [
  ['say Welcome to my world!', 'show a message to everyone'],
  ['time day', 'make it day (or night, noon, midnight)'],
  ['weather clear', 'change the weather (clear, rain, thunder)'],
  ['tick freeze', 'freeze the world: nothing moves but the players (tick unfreeze lets it go, tick step 2 runs it 2 seconds)'],
  ['give diamond 5', 'give the nearest player something'],
  ['tp ~ ~10 ~', 'move the nearest player (here, ten blocks above the block)'],
  ['effect speed 30', 'give the nearest player an effect for 30 seconds'],
  ['heal', 'fill up the nearest player\'s health and food'],
  ['summon zombie ~ ~1 ~', 'make a creature appear on top of the block'],
  ['setblock ~ ~2 ~ gold_block', 'put a block somewhere (air takes one away)'],
  ['fill ~-2 ~-1 ~-2 ~2 ~-1 ~2 glass', 'fill a box with one block'],
  ['spawnpoint', 'the nearest player comes back here when they die'],
];
const EFFECTS = ['speed', 'haste', 'jump', 'strength', 'resistance', 'regen', 'poison', 'slow', 'wither', 'levitation', 'hunger', 'burn'];
const FILL_MAX = 8000, MOB_MAX = 300;

const isGuest = () => !!(G.net && G.net.role === 'client');
const keyOf = (x, y, z) => `${x},${y},${z}`;
function table() {
  const w = G.world, f = w.flags || (w.flags = {});
  if (!f.cmds || typeof f.cmds !== 'object' || Array.isArray(f.cmds)) f.cmds = {};
  return f.cmds;
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
// What a block runs, made safe to keep (whatever it came from)
export function cleanCmd(d) {
  if (!d || typeof d !== 'object') return null;
  const m = MODES.some(([k]) => k === d.m) ? d.m : 'click';
  return { c: String(d.c || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 200), m, r: clamp(Math.round(+d.r || 4), 1, 32), s: clamp(Math.round((+d.s || 1) * 2) / 2, 0.5, 600), out: String(d.out || '').slice(0, 160) };
}
export function cmdAt(x, y, z) { return cleanCmd(table()[keyOf(x, y, z)]) || cleanCmd({}); }
const live = new Map();   // "x,y,z" -> { t: when it last ran, near: someone was near, next: when it next repeats }

// ---------------------------------------------------------------- setting one up
// Save what a block runs (a guest's goes to the host, which tells everyone)
export function setCmd(x, y, z, d, from = null) {
  const c = cleanCmd(d);
  if (!c) return;
  if (isGuest() && from == null) { G.net.send({ k: 'cbset', x, y, z, d: c }); return; }
  if (G.world.getBlock(x, y, z) !== B.command_block) return;
  const old = table()[keyOf(x, y, z)];
  c.out = old && old.c === c.c ? old.out || '' : '';
  table()[keyOf(x, y, z)] = c;
  live.delete(keyOf(x, y, z));
  if (G.net && G.net.role === 'host') G.net.send({ k: 'cbset', x, y, z, d: c });
}
// (a guest hears of a change from the host)
export function takeCmd(x, y, z, d) { const c = cleanCmd(d); if (c) table()[keyOf(x, y, z)] = c; if (G.ui && G.screen === 'cmdblock' && open && open.x === x && open.y === y && open.z === z) showOut(c.out); }
export function forgetCmd(x, y, z) { delete table()[keyOf(x, y, z)]; live.delete(keyOf(x, y, z)); }
// A guest joining is sent them all
export const allCmds = () => ({ ...table() });
export function takeAllCmds(w, o) {
  const f = w.flags || (w.flags = {}), t = f.cmds && typeof f.cmds === 'object' ? f.cmds : (f.cmds = {});
  if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) { const c = cleanCmd(v); if (c && /^-?\d+,-?\d+,-?\d+$/.test(k)) t[k] = c; }
}

// ---------------------------------------------------------------- setting one off
// why: 'click', 'plate', 'test' (Run Now, from someone in Creative), or what runs it by itself
export function triggerCmd(x, y, z, why, creative = false) {
  if (isGuest()) { G.net.send({ k: 'cbrun', x, y, z, why }); return; }
  if (G.world.getBlock(x, y, z) !== B.command_block) return;
  const d = table()[keyOf(x, y, z)];
  if (!d || !d.c) return;
  if (why === 'test' ? !creative : d.m !== why) return;
  const st = live.get(keyOf(x, y, z)) || {};
  if (why !== 'test' && G.clock - (st.t ?? -9) < 0.25) return;   // (a plate held down or a double click goes off once)
  st.t = G.clock;
  live.set(keyOf(x, y, z), st);
  d.out = runCommand(x, y, z, d.c).slice(0, 160);
  if (G.net && G.net.role === 'host') G.net.send({ k: 'cbset', x, y, z, d });
  if (G.screen === 'cmdblock' && open && open.x === x && open.y === y && open.z === z) showOut(d.out);
}
// A pressure plate was stepped on: the command blocks under it and beside it
export function plateCmds(x, y, z) {
  for (const [dx, dy, dz] of [[0, -1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]]) if (G.world.getBlock(x + dx, y + dy, z + dz) === B.command_block) triggerCmd(x + dx, y + dy, z + dz, 'plate');
}
// Where the world lives, a few times a second: the ones that go off when someone is near, and the repeaters
let tickT = 0;
export function tickCmds(dt) {
  if (isGuest() || !G.world || !G.world.flags || !G.world.flags.cmds) return;
  tickT -= dt;
  if (tickT > 0) return;
  tickT = 0.1;
  const w = G.world, ps = everyone();
  for (const [k, d] of Object.entries(w.flags.cmds)) {
    if (!d || (d.m !== 'near' && d.m !== 'repeat') || !d.c) continue;
    const [x, y, z] = k.split(',').map(Number);
    const c = w.getChunk(x >> 4, z >> 4);
    if (!c) continue;
    if (w.getBlock(x, y, z) !== B.command_block) { forgetCmd(x, y, z); continue; }
    const st = live.get(k) || {};
    live.set(k, st);
    if (d.m === 'near') {
      const near = ps.some((q) => Math.hypot(q.pos.x - x - 0.5, q.pos.y + 0.9 - y - 0.5, q.pos.z - z - 0.5) <= d.r);
      if (near && !st.near) triggerCmd(x, y, z, 'near');
      st.near = near;
    } else {
      // (only with somebody within reach, so a forgotten one far away doesn't fill the world with zombies)
      if (!ps.some((q) => Math.hypot(q.pos.x - x, q.pos.z - z) < 96)) continue;
      if (st.next == null) st.next = G.clock + d.s;
      if (G.clock >= st.next) { st.next = G.clock + d.s; triggerCmd(x, y, z, 'repeat'); }
    }
  }
}

// ---------------------------------------------------------------- the commands
// Everyone in the world: the player here and the others (in multiplayer)
function everyone() {
  const out = [];
  if (G.player && !G.player.dead && !G.player.spectator) out.push(G.player);
  if (G.net) for (const a of G.net.players.values()) if (a.ready && !a.dead && a.pos && !a.ghost) out.push(a);
  return out;
}
function nearest(x, y, z) {
  let best = null, bd = Infinity;
  for (const q of everyone()) { const d = Math.hypot(q.pos.x - x, q.pos.y - y, q.pos.z - z); if (d < bd) { bd = d; best = q; } }
  return best;
}
const nameOf = (q) => (q === G.player ? (G.net ? G.net.name : (G.account && G.account.name) || 'you') : q.name);
// A place: a number, or ~ (this block) and ~5, ~-2 (that far from it)
function coord(tok, base) {
  if (tok == null) return null;
  const m = String(tok).match(/^(~)?(-?\d+(\.\d+)?)?$/);
  if (!m || (!m[1] && !m[2])) return null;
  return (m[1] ? base : 0) + (m[2] ? +m[2] : 0);
}
function place(a, x, y, z) {
  const p = [coord(a[0], x), coord(a[1], y), coord(a[2], z)];
  return p.every((v) => v != null && Number.isFinite(v)) ? p : null;
}
const norm = (s) => String(s || '').toLowerCase().replace(/^minecraft:/, '').replace(/[\s-]+/g, '_');
// A block or an item, by its name ('gold_block', 'Block of Gold', 'gold block')
function findThing(word, blocksOnly) {
  const k = norm(word);
  if (!k) return null;
  if (k === 'air') return blocksOnly ? 0 : null;
  const list = blocksOnly ? BLOCKS : ITEMS;
  const hit = list.find((d) => d && (d.key === k || norm(d.name) === k)) || list.find((d) => d && d.key === k + 's');
  if (!hit || (blocksOnly && !hit.isBlock) || hit.hidden) return null;
  return hit.id;
}
function findMob(word) {
  const k = norm(word);
  for (const [type, def] of Object.entries(MOB_TYPES)) if (type === k || norm(def.name) === k) return def.villagerProxy || def.turret || def.silo || def.icbm ? null : type;
  return null;
}
// A name that may be several words ('polar bear', 'Block of Gold') at the start of the words: what it is and
// the words after it
function lead(args, find) {
  for (let n = Math.min(args.length, 5); n >= 1; n--) { const v = find(args.slice(0, n).join(' ')); if (v != null) return [v, args.slice(n)]; }
  return [null, args.slice(1)];
}
// Something done to a player: the one here directly, another (in multiplayer) by a message to them
function toPlayer(q, m) {
  if (q === G.player) applyToMe(m);
  else G.net.sendTo(q.id, { k: 'cbx', ...m });
}
// A command block's doing, here (also what a guest does when the host sends it)
export function applyToMe(m) {
  const p = G.player;
  if (!p || p.dead || !m) return;
  if (m.a === 'say') { G.ui.toast(String(m.t || '').slice(0, 200), 6); sfx('click', null, { vol: 0.5, pitch: 1.4 }); return; }
  if (m.a === 'tp' && [m.x, m.y, m.z].every(Number.isFinite)) { G.game.teleport(m.x, clamp(m.y, 1, 250), m.z); sfx('pop', null, { vol: 0.6, pitch: 0.6 }); return; }
  if (m.a === 'give' && ITEMS[m.id] && !ITEMS[m.id].hidden) {
    const left = p.inv.add(m.id | 0, clamp(m.n | 0, 1, 64 * 36));
    if (left > 0) G.entities.dropItem(m.id | 0, left, p.pos.x, p.pos.y + 1, p.pos.z, 0, 2, 0);
    G.ui.invChanged();
    sfx('pop', null, { vol: 0.6 });
    return;
  }
  if (m.a === 'effect' && EFFECTS.includes(m.n)) { p.addEffect(m.n, clamp(+m.t || 30, 1, 3600), m.lv === 2 ? 2 : 1); return; }
  if (m.a === 'heal') { p.health = 20; p.food = 20; p.saturation = Math.max(p.saturation || 0, 5); p.effects.poison = 0; p.effects.wither = 0; p.burning = 0; G.ui.invChanged(); return; }
  if (m.a === 'spawn' && [m.x, m.y, m.z].every(Number.isFinite)) { p.spawn = { x: m.x, y: m.y, z: m.z }; G.ui.toast('Your respawn point is set', 3); }
}

// Run a command from the block at x, y, z. What came of it, in a few words (shown on its screen).
export function runCommand(x, y, z, text) {
  const words = String(text).trim().replace(/^\//, '').split(/\s+/).filter(Boolean);
  const cmd = (words.shift() || '').toLowerCase();
  // (Minecraft's @p and @a are understood and left out: a player command is always about the nearest one)
  const args = words.filter((a) => !/^@[pasre]$/.test(a));
  const bx = x + 0.5, by = y, bz = z + 0.5;
  const w = G.world;
  const who = () => nearest(bx, by, bz);
  switch (cmd) {
    case 'say': case 'tell': case 'title': {
      const t = args.join(' ').slice(0, 200);
      if (!t) return 'Nothing to say: write something after "say"';
      for (const q of everyone()) toPlayer(q, { a: 'say', t });
      return 'Said: ' + t;
    }
    case 'time': {
      const t = G.game.parseTime(args.filter((a) => a !== 'set')[0]);
      if (t == null) return 'Try: time day, noon, sunset, night or midnight';
      if (G.dim !== 'overworld') return 'There is no time of day here';
      G.game.setTime(t);
      return 'It is now ' + args.filter((a) => a !== 'set')[0];
    }
    case 'weather': {
      const k = G.game.weatherWord(args[0]);
      if (!k) return 'Try: weather clear, cloudy, rain or thunder';
      if (G.dim !== 'overworld') return 'There is no weather here';
      G.game.setWeatherNow(k, 0);
      return 'The weather is now ' + k;
    }
    case 'tick': {
      let said = '';
      G.game.tickCommand(args, (m) => { said = m; });
      return said;
    }
    case 'give': {
      const [id, rest] = lead(args, (s) => findThing(s, false));
      if (id == null) return `There is no item called "${args.join(' ')}"`;
      const n = rest[0] == null ? 1 : Math.floor(+rest[0]);
      if (!(n >= 1)) return 'How many? Put a number after the item, like give diamond 5';
      const q = who();
      if (!q) return 'Nobody is here to give it to';
      toPlayer(q, { a: 'give', id, n: Math.min(n, 64 * 36) });
      return `Gave ${Math.min(n, 64 * 36)} ${ITEMS[id].name} to ${nameOf(q)}`;
    }
    case 'tp': case 'teleport': {
      const at = place(args, bx, y, bz);
      if (!at) return 'Where to? Like tp 100 70 -20, or tp ~ ~10 ~ for ten blocks above the block';
      const q = who();
      if (!q) return 'Nobody is here to move';
      toPlayer(q, { a: 'tp', x: at[0], y: at[1], z: at[2] });
      return `Moved ${nameOf(q)} to ${at.map(Math.floor).join(' ')}`;
    }
    case 'effect': {
      const list = args.filter((a) => a !== 'give');
      const n = norm(list[0]).replace(/^(jump_boost)$/, 'jump').replace(/^(regeneration)$/, 'regen').replace(/^(slowness)$/, 'slow').replace(/^(fire)$/, 'burn');
      if (!EFFECTS.includes(n)) return 'Effects: ' + EFFECTS.join(', ');
      const q = who();
      if (!q) return 'Nobody is here';
      const t = clamp(+list[1] || 30, 1, 3600);
      toPlayer(q, { a: 'effect', n, t, lv: +list[2] >= 2 ? 2 : 1 });
      return `Gave ${nameOf(q)} ${n} for ${t} seconds`;
    }
    case 'heal': {
      const q = who();
      if (!q) return 'Nobody is here';
      toPlayer(q, { a: 'heal' });
      return 'Healed ' + nameOf(q);
    }
    case 'spawnpoint': {
      const at = args.length >= 3 ? place(args, bx, y, bz) : [bx, y + 1, bz];
      if (!at) return 'Like spawnpoint, or spawnpoint ~ ~1 ~';
      const q = who();
      if (!q) return 'Nobody is here';
      toPlayer(q, { a: 'spawn', x: at[0], y: at[1], z: at[2] });
      return `Set the respawn point of ${nameOf(q)}`;
    }
    case 'summon': {
      const [type, rest] = lead(args, findMob);
      if (!type) return `There is no creature called "${args.join(' ')}"`;
      const at = rest.length >= 3 ? place(rest, bx, y, bz) : [bx, y + 1, bz];
      if (!at) return 'Where? Like summon pig ~ ~1 ~';
      if (G.entities.mobs.length >= MOB_MAX) return 'There are too many creatures about already';
      if (!w.getChunk(Math.floor(at[0]) >> 4, Math.floor(at[2]) >> 4)) return 'That place is not loaded';
      G.entities.spawnMob(type, at[0], at[1], at[2]);
      return 'Summoned a ' + MOB_TYPES[type].name;
    }
    case 'setblock': {
      const at = place(args, x, y, z), id = lead(args.slice(3), (s) => findThing(s, true))[0];
      if (!at) return 'Like setblock ~ ~2 ~ stone';
      if (id == null) return `There is no block called "${args.slice(3).join(' ')}"`;
      const [X, Y, Z] = at.map(Math.floor);
      if (Y < 1 || Y > 127) return 'That is out of the world';
      if (!w.getChunk(X >> 4, Z >> 4)) return 'That place is not loaded';
      w.setBlock(X, Y, Z, id);
      return `Put ${id ? BLOCKS[id].name : 'air'} at ${X} ${Y} ${Z}`;
    }
    case 'fill': {
      const a = place(args, x, y, z), b = place(args.slice(3), x, y, z), id = lead(args.slice(6), (s) => findThing(s, true))[0];
      if (!a || !b) return 'Like fill ~-2 ~-1 ~-2 ~2 ~-1 ~2 glass (two corners, then the block)';
      if (id == null) return `There is no block called "${args.slice(6).join(' ')}"`;
      const [x0, x1] = [Math.floor(Math.min(a[0], b[0])), Math.floor(Math.max(a[0], b[0]))];
      const [y0, y1] = [Math.max(1, Math.floor(Math.min(a[1], b[1]))), Math.min(127, Math.floor(Math.max(a[1], b[1])))];
      const [z0, z1] = [Math.floor(Math.min(a[2], b[2])), Math.floor(Math.max(a[2], b[2]))];
      const n = (x1 - x0 + 1) * (y1 - y0 + 1) * (z1 - z0 + 1);
      if (!(n > 0)) return 'That box is out of the world';
      if (n > FILL_MAX) return `That box is ${n} blocks: the most is ${FILL_MAX}`;
      for (let cx = x0 >> 4; cx <= x1 >> 4; cx++) for (let cz = z0 >> 4; cz <= z1 >> 4; cz++) if (!w.getChunk(cx, cz)) return 'Part of that box is not loaded';
      let done = 0;
      for (let X = x0; X <= x1; X++) for (let Y = y0; Y <= y1; Y++) for (let Z = z0; Z <= z1; Z++) {
        if (X === x && Y === y && Z === z) continue;   // (it leaves itself alone)
        if (w.getBlock(X, Y, Z) !== id) { w.setBlock(X, Y, Z, id); done++; }
      }
      return `Filled ${done} block${done === 1 ? '' : 's'} with ${id ? BLOCKS[id].name : 'air'}`;
    }
    case '': return 'There is no command in it yet';
    default: return `"${cmd}" is not a command block command. Try: say, time, weather, tick, give, tp, effect, heal, summon, setblock, fill, spawnpoint`;
  }
}

// ---------------------------------------------------------------- its screen
let section = null, open = null;
const el = (tag, css, text) => { const e = document.createElement(tag); if (css) e.style.cssText = css; if (text != null) e.textContent = text; return e; };
function showOut(t) { const o = section && section.querySelector('[data-out]'); if (o) o.textContent = t ? 'Last time: ' + t : 'It hasn\'t run yet.'; }
// Use a command block in Creative: what it runs, and when
export function openCmdBlock(x, y, z) {
  if (!section) {
    section = el('section');
    section.className = 'screen dim';
    section.id = 's-cmdblock';
    section.hidden = true;
    const anchor = document.getElementById('s-container');
    anchor.parentNode.insertBefore(section, anchor);
  }
  open = { x, y, z };
  const d = cmdAt(x, y, z);
  section.textContent = '';
  section.appendChild(el('h2', null, 'Command Block'));
  const box = el('div', 'width:min(760px,100%);margin:6px auto;padding:10px 16px;box-sizing:border-box;background:rgba(0,0,0,0.4);font-size:18px;max-height:76vh;overflow:auto;touch-action:pan-y;text-align:left');
  section.appendChild(box);
  box.appendChild(el('div', 'color:#ddd;margin-bottom:6px', '1. Type a command (or pick one of the examples)'));
  const inp = el('input', 'width:100%;box-sizing:border-box;font:20px monospace;padding:8px;background:#111;color:#7dff8a;border:2px solid #555');
  inp.type = 'text'; inp.maxLength = 200; inp.value = d.c; inp.placeholder = 'say Hello!'; inp.spellcheck = false; inp.autocapitalize = 'off'; inp.autocomplete = 'off';
  box.appendChild(inp);
  const ex = el('div', 'display:flex;flex-wrap:wrap;gap:6px;margin:8px 0 2px');
  const about = el('div', 'color:#bbb;font:15px/1.4 monospace;min-height:20px;margin-bottom:8px', 'Commands about a player act on whoever is nearest the block. ~ means "from this block": ~ ~3 ~ is three blocks above it.');
  for (const [c, what] of EXAMPLES) {
    const b = el('button', 'font:15px monospace;padding:4px 8px;background:#2b2b2b;color:#cfe;border:1px solid #666;cursor:pointer', c.split(' ')[0]);
    b.type = 'button';
    b.title = what;
    b.addEventListener('click', () => { inp.value = c; about.textContent = c + ': ' + what; });
    ex.appendChild(b);
  }
  box.appendChild(ex);
  box.appendChild(about);
  box.appendChild(el('div', 'color:#ddd;margin:6px 0', '2. Choose when it runs'));
  let mode = d.m;
  const modes = el('div', 'display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:6px');
  const help = el('div', 'color:#bbb;font:15px/1.4 monospace;margin:6px 0;min-height:20px');
  const extra = el('div', 'margin:4px 0 8px;display:flex;gap:8px;align-items:center');
  const num = el('input', 'width:90px;font-size:18px;padding:4px');
  num.type = 'number';
  const unit = el('span');
  extra.append(unit, num);
  const btns = [];
  const pick = (k) => {
    mode = k;
    for (const [b, kk] of btns) { b.style.background = kk === k ? '#3d6b2a' : '#2b2b2b'; b.style.borderColor = kk === k ? '#9f6' : '#666'; }
    help.textContent = MODES.find(([kk]) => kk === k)[2];
    extra.style.display = k === 'near' || k === 'repeat' ? 'flex' : 'none';
    if (k === 'near') { unit.textContent = 'How near (blocks):'; num.min = 1; num.max = 32; num.step = 1; num.value = d.r; }
    if (k === 'repeat') { unit.textContent = 'Every (seconds):'; num.min = 0.5; num.max = 600; num.step = 0.5; num.value = d.s; }
  };
  for (const [k, label] of MODES) {
    const b = el('button', 'font-size:17px;padding:8px;color:#fff;border:2px solid #666;cursor:pointer', label);
    b.type = 'button';
    b.addEventListener('click', () => pick(k));
    btns.push([b, k]);
    modes.appendChild(b);
  }
  box.append(modes, help, extra);
  box.appendChild(el('div', 'color:#ddd;margin:6px 0', '3. Save it'));
  const out = el('div', 'font:15px monospace;color:#ffd866;margin:4px 0');
  out.dataset.out = '1';
  box.appendChild(out);
  pick(mode);
  showOut(d.out);
  const read = () => ({ c: inp.value, m: mode, r: mode === 'near' ? +num.value : d.r, s: mode === 'repeat' ? +num.value : d.s });
  const row = el('div');
  row.className = 'row';
  const mk = (label, fn) => { const b = el('button', null, label); b.className = 'btn'; b.type = 'button'; b.addEventListener('click', fn); row.appendChild(b); };
  mk('Run Now', () => { setCmd(x, y, z, read()); triggerCmd(x, y, z, 'test', true); });
  mk('Save', () => { setCmd(x, y, z, read()); sfx('click'); G.ui.back(); });
  mk('Cancel', () => G.ui.back());
  section.appendChild(row);
  // (Enter saves, Escape leaves it as it was)
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); setCmd(x, y, z, read()); sfx('click'); G.ui.back(); }
    if (e.key === 'Escape') { e.preventDefault(); G.ui.back(); }
  });
  G.ui.openScreen('cmdblock');
  setTimeout(() => { if (G.screen === 'cmdblock' && !('ontouchstart' in window)) inp.focus(); }, 30);
}
