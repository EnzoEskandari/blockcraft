// Guns (1.10.9; the rest of the armoury and the kinds of bullet in 1.10.10). A shot is an Arrow with
// `bullet` set to what it is (see entities.js): it flies almost straight, never sticks and is gone when it hits.
import { G } from './game.js';
import { ITEMS } from './blocks.js';
import { sfx } from './audio.js';
import { kickGun } from './render.js';

// dmg: what one bullet does with ordinary (iron) bullets; speed: how fast it flies; cd: seconds between shots;
// kick: how far each shot throws your aim up; spread: how far shots stray; pellets: bullets in one shot;
// pierce: how many things a bullet goes through; boom: the size of the blast where it lands; ammo: what it fires
export const GUNS = {
  pistol: { dmg: 6, speed: 90, cd: 0.4, kick: 0.03, ammo: 'bullet', snd: 'gun' },
  revolver: { dmg: 9, speed: 100, cd: 0.7, kick: 0.06, ammo: 'bullet', snd: 'gun_heavy' },
  smg: { dmg: 3, speed: 90, cd: 0.09, kick: 0.008, spread: 0.04, ammo: 'bullet', snd: 'gun_light' },
  assault_rifle: { dmg: 5, speed: 120, cd: 0.13, kick: 0.012, spread: 0.02, ammo: 'bullet', snd: 'gun_light' },
  rifle: { dmg: 13, speed: 150, cd: 1.1, kick: 0.08, ammo: 'bullet', snd: 'gun_heavy' },
  sniper_rifle: { dmg: 24, speed: 240, cd: 2.2, kick: 0.14, pierce: 1, ammo: 'bullet', snd: 'gun_heavy' },
  minigun: { dmg: 2.5, speed: 110, cd: 0.05, kick: 0.004, spread: 0.045, ammo: 'bullet', snd: 'gun_light' },
  shotgun: { dmg: 3, speed: 70, cd: 0.9, kick: 0.1, spread: 0.08, pellets: 8, ammo: 'shell', snd: 'gun_heavy' },
  rocket_launcher: { dmg: 8, speed: 40, cd: 1.5, kick: 0.1, boom: 3, ammo: 'rocket', snd: 'rocket' },
};

// mul: how much harder than an iron bullet it hits; pierce, fire (seconds alight) and boom as above
export const AMMO = {
  copper_bullet: { kind: 'bullet', mul: 0.7 },
  bullet: { kind: 'bullet', mul: 1 },
  fire_bullet: { kind: 'bullet', mul: 1, fire: 5 },
  explosive_bullet: { kind: 'bullet', mul: 1.2, boom: 1.2 },
  diamond_bullet: { kind: 'bullet', mul: 1.6, pierce: 1 },
  netherite_bullet: { kind: 'bullet', mul: 2.2, pierce: 2 },
  shotgun_shell: { kind: 'shell', mul: 1 },
  rocket: { kind: 'rocket', mul: 1 },
};
const PLAIN = { bullet: 'bullet', shell: 'shotgun_shell', rocket: 'rocket' };   // (what creative fires with none)
const NEED = { bullet: 'bullets', shell: 'shotgun shells', rocket: 'rockets' };
export const gunOf = (st) => (st ? GUNS[ITEMS[st.id].key] || null : null);
export const ammoOf = (st) => (st ? AMMO[ITEMS[st.id].key] || null : null);

// The ammunition a gun will use: the first that fits, in inventory order (the hotbar first), so whichever
// bullets come first are the ones fired
function ammoSlot(inv, kind) {
  return inv.slots.findIndex((s) => s && s.count > 0 && ammoOf(s) && ammoOf(s).kind === kind);
}

// The player fires the gun in their hand. True when the click was the gun's (fired, or still between shots).
export function fireGun(p, gun) {
  if (p.gunCd > 0) { p.nextUse = Math.max(0.01, p.gunCd); return true; }
  const i = ammoSlot(p.inv, gun.ammo);
  if (i < 0 && !p.creative) { p.hint(`You need ${NEED[gun.ammo]}`); return false; }
  const ammo = i >= 0 ? ammoOf(p.inv.slots[i]) : AMMO[PLAIN[gun.ammo]];
  const r = p.pickRay(p.lastInput || {});
  const mx = p.pos.x + r.dx * 0.6, my = p.eyeY - 0.1 + r.dy * 0.6, mz = p.pos.z + r.dz * 0.6;
  const opts = { bullet: gun.ammo, damage: Math.round(gun.dmg * ammo.mul * 10) / 10, keep: true, pierce: (gun.pierce || 0) + (ammo.pierce || 0),
    flame: !!ammo.fire, boom: gun.boom || ammo.boom || 0 };
  for (let n = 0; n < (gun.pellets || 1); n++) {
    let dx = r.dx, dy = r.dy, dz = r.dz;
    if (gun.spread) {
      const s = gun.spread * 2;
      dx += (Math.random() - 0.5) * s; dy += (Math.random() - 0.5) * s; dz += (Math.random() - 0.5) * s;
      const l = Math.hypot(dx, dy, dz); dx /= l; dy /= l; dz /= l;
    }
    G.entities.spawnArrow(mx, my, mz, dx * gun.speed, dy * gun.speed, dz * gun.speed, 'player', opts);
  }
  // a flash at the muzzle and a kick upwards
  for (let k = 0; k < 6; k++) G.entities.particles.spawn(mx, my, mz, r.dx * 2 + Math.random() - 0.5, r.dy * 2 + Math.random() - 0.5, r.dz * 2 + Math.random() - 0.5, 1, 0.75 + Math.random() * 0.2, 0.3, 0.07, 0.12, 0);
  p.pitch = Math.min(Math.PI / 2 - 0.001, p.pitch + gun.kick);
  sfx(gun.snd);
  kickGun(gun.cd >= 0.3 ? 1 : 0.55);
  if (!p.creative) {
    const a = p.inv.slots[i];
    if (--a.count <= 0) p.inv.slots[i] = null;
    p.inv.damageHeld(1);
  }
  G.ui.invChanged();
  p.gunCd = p.nextUse = gun.cd;
  return true;
}

// Lines for a gun's or a bullet's tooltip
export function gunLines(st) {
  const g = gunOf(st), a = ammoOf(st);
  if (g) {
    const per = g.pellets ? `${g.pellets} × ${g.dmg}` : g.dmg;
    return [`${per} damage, ${Math.round(10 / g.cd) / 10} shots a second`, `Fires ${NEED[g.ammo]}` + (g.boom ? ' that explode' : '') + (g.pierce ? ' that go through things' : '')];
  }
  if (a && a.kind === 'bullet') {
    const out = [`${a.mul === 1 ? 'Normal' : `×${a.mul}`} damage`];
    if (a.pierce) out.push(`Goes through ${a.pierce === 1 ? 'one thing' : a.pierce + ' things'}`);
    if (a.fire) out.push('Sets things on fire');
    if (a.boom) out.push('Explodes where it hits');
    return out;
  }
  return [];
}
