// Spawn eggs (1.10.5), in the creative inventory: one for every creature. Used on a block, the creature
// hatches beside it; used on a spawner, the spawner makes that creature from then on. Creatures live on
// the host, so a guest asks the host to hatch one (`egg`). What hatches from an egg stays (it is
// persistent) and counts for nothing towards achievements, so the hard prizes still have to be earned.
import { G } from './game.js';
import { BLOCKS, B, ITEMS, SPAWN_EGGS, SPAWNER_TYPES } from './blocks.js';
import { MOB_TYPES } from './entities.js';
import { swingHand } from './render.js';
import { sfx } from './audio.js';

const TYPES = new Set(SPAWN_EGGS.map((e) => e[0]));
const TOO_BIG = new Set(['void_dragon', 'blight']);   // (no spawner can make these)

// On the host: the creature hatches
export function hatch(type, x, y, z, yaw) {
  if (!TYPES.has(type) || !MOB_TYPES[type] || !G.entities) return null;
  const m = G.entities.spawnMob(type, x, y, z, { persistent: true });
  m.fromEgg = true;
  m.yaw = yaw; m.model.root.rotation.y = yaw;
  for (let i = 0; i < 12; i++) G.entities.particles.spawn(x + (Math.random() - 0.5) * m.hw * 2, y + Math.random() * Math.min(2, m.h), z + (Math.random() - 0.5) * m.hw * 2, (Math.random() - 0.5) * 2, Math.random() * 2, (Math.random() - 0.5) * 2, 0.92, 0.92, 0.92, 0.12, 0.6, -0.05);
  return m;
}

// The player uses the egg they hold on the block they point at
export function useEgg(p, held, t) {
  const type = ITEMS[held.id].egg;
  if (!t || !MOB_TYPES[type]) return false;
  if (t.id === B.spawner) {
    if (TOO_BIG.has(type)) { p.hint('That is too big for a spawner'); return true; }
    G.game.placeBlock(t.x, t.y, t.z, B.spawner, SPAWNER_TYPES.indexOf(type));
    const name = ITEMS[held.id].name.replace(/ Spawn Egg$/, '');
    p.hint(`It is ${/^[AEIOU]/.test(name) ? 'an' : 'a'} ${name} spawner now`);
  } else {
    // in the space beside the side you point at (or in a plant, if that is what you point at)
    const def = MOB_TYPES[type];
    let x = t.x, y = t.y, z = t.z;
    if (!(BLOCKS[t.id].replaceable && t.ny === 1)) { x += t.nx; y += t.ny; z += t.nz; }
    if (t.ny === -1) y = t.y - Math.ceil(def.h);
    const yaw = p.yaw + Math.PI;   // (facing you)
    if (G.net && G.net.role === 'client') G.net.send({ k: 'egg', t: type, x: x + 0.5, y, z: z + 0.5, yaw });
    else hatch(type, x + 0.5, y, z + 0.5, yaw);
    sfx('pop', { x: x + 0.5, y: y + 0.5, z: z + 0.5 }, { vol: 0.7 });
  }
  if (!p.creative) { p.inv.consumeHeld(); G.ui.invChanged(); }
  swingHand();
  p.useCd = 0.2;
  return true;
}
