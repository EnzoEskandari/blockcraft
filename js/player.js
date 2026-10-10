// The player: movement, mining, placing, eating, combat, hunger and health.
import * as THREE from 'three';
import { G } from './game.js';
import { BLOCKS, ITEMS, ID, B, canHarvest } from './blocks.js';
import { throwEye } from './dimmobs.js';
import { treasureFor } from './structures.js';
import { activateEndPortal } from './dims.js';
import { Inventory } from './inventory.js';
import { moveBox, raycast, boxBlocked, touching } from './physics.js';
import { R, showHighlight, swingHand, setHeldItem, setOffItem, updateHand, brightness } from './render.js';
import { sfx, blockSound } from './audio.js';
import { hitParticles } from './entities.js';
import { iconColors } from './textures.js';
import { ench, bonusDamage, wears, protection, xpForLevel } from './enchant.js';
import { Body } from './body.js';
import { useMount, useLabel, leaveMount, placeBoat, rideMove, canSteer } from './mounts.js';

const GRAVITY = 32;
const JUMP_V = 9.0;
const WALK = 4.317, SPRINT = 5.612, SNEAK = 1.31, FLY = 10.9, FLY_SPRINT = 21.6;
const EAT_TIME = 1.6;      // seconds of holding to finish eating (32 ticks)
const HURT_TIME = 0.5;
const tmpV = new THREE.Vector3();
// Block defs also name the tool that mines them (.tool), so only non-block items count as tools
const toolOf = (it) => (it && !it.isBlock ? it.tool : null);

// Items with a use of their own on right-click; anything else in the main hand lets an off-hand shield come up
const USES = ['bow', 'bucket', 'water_bucket', 'lava_bucket', 'flint_and_steel', 'shade_pearl', 'shade_eye', 'wheat_seeds', 'crossbow', 'trident', 'fishing_rod', 'experience_bottle', 'treasure_map', 'charred_skull'];
let shotSeq = 0;   // numbers crossbow shots, so one shot's kills can be counted together
const noUse = (st) => { if (!st) return true; const it = ITEMS[st.id]; return !(it.isBlock || it.food || it.armor || USES.includes(it.key)); };
const SHIELD_STOPS = ['mob', 'arrow', 'fireball', 'explosion', 'player'];

export class Player {
  constructor() {
    this.pos = { x: 0.5, y: 80, z: 0.5 };
    this.vel = { x: 0, y: 0, z: 0 };
    this.yaw = 0;
    this.pitch = 0;
    this.hw = 0.3;
    this.h = 1.8;
    this.onGround = false;
    this.inWater = false;
    this.headInWater = false;
    this.waterExit = 1;       // seconds since leaving water
    this.flying = false;
    this.sneaking = false;
    this.sprinting = false;
    this.health = 20;
    this.food = 20;
    this.saturation = 5;
    this.exhaustion = 0;
    this.hungerEffect = 0;    // seconds of the Hunger effect left (from rotten flesh / raw chicken)
    this.air = 15;
    this.airTick = 0;
    this.fallDist = 0;
    this.hurtTime = 0;
    this.hurtRoll = 1;
    this.invul = 0;
    this.regenTimer = 0;
    this.dead = false;
    this.isPlayer = true;
    this.mode = 'survival';
    this.inv = new Inventory();
    this.spawn = { x: 0.5, y: 80, z: 0.5 };
    this.mining = null;
    this.eating = null;
    this.mineCd = 0;
    this.useCd = 0;
    this.lastSwing = -10;
    this.lastSelected = 0;
    this.bob = 0;
    this.bobAmt = 0;
    this.stepDist = 0;
    this.target = null;
    // seen from outside (second or third person): your own body, and what the camera is in
    this.body = new Body();
    this.outside = false;
    this.camInWater = this.camInLava = false;
    this.tradeMob = null;
    this.useLabel = 'Trade';   // what the touch button for it says
    this.riding = null;        // the horse, donkey, strider or boat you are on
    this.swimming = false;     // sprinting under water: a proper stroke, quicker than paddling at the top
    this.fovKick = 0;
    this.frozen = true;
    this.lastJumpTap = 0;
    this.hintCd = 0;
    this.armor = [null, null, null, null];   // helmet, chestplate, leggings, boots
    this.off = [null];        // the off hand (F swaps it with the main hand); a list of one so the inventory can show it
    this.shieldUp = false;    // holding a shield up
    this.blocking = false;    // ...and it has been up long enough to stop a hit
    this.blockT = 0;
    this.shieldCd = 0;        // an axe knocked it down: seconds until it can be raised again
    this.blockedAt = -9;
    this.effects = { poison: 0, slow: 0, wither: 0, levitation: 0 };
    this.poisonTick = 0;
    this.portalT = 0;
    this.portalCooldown = true;   // step out of a portal before it can take you anywhere
    this.bedSpawn = null;                     // {x, y, z} of the bed you last slept in
    this.burning = 0;
    this.fireTick = 0;
    this.placeBlocked = false;
    this.xpLevel = 0;         // experience: the level, and the points gathered toward the next one
    this.xp = 0;
    this.enchSeed = (Math.random() * 4294967296) >>> 0;   // what an enchanting table offers; it changes with every enchantment
    this.adv = new Set();     // achievements made
    this.advData = {};        // and how far along the ones with several parts are
  }

  // ------------------------------------------------------------ experience
  // Mending comes first: a worn item that has it is mended, two points of wear for each point of experience
  addXp(n) {
    n = Math.floor(n);
    if (!(n > 0) || this.dead) return;
    const worn = [this.inv.held, this.off[0], ...this.armor].filter((s) => s && s.dmg > 0 && ench(s, 'mending'));
    if (worn.length) {
      const s = worn[Math.floor(Math.random() * worn.length)];
      const fix = Math.min(s.dmg, n * 2);
      s.dmg -= fix;
      n -= Math.ceil(fix / 2);
    }
    this.xp += n;
    while (this.xp >= xpForLevel(this.xpLevel)) {
      this.xp -= xpForLevel(this.xpLevel);
      this.xpLevel++;
      if (this.xpLevel % 5 === 0) sfx('levelup', null, { vol: 0.7 });
    }
    G.ui.invChanged();
  }

  // Enchanting and the anvil are paid for in whole levels
  spendLevels(n) {
    if (this.creative) return;
    const part = this.xp / xpForLevel(this.xpLevel);
    this.xpLevel = Math.max(0, this.xpLevel - n);
    this.xp = Math.floor(part * xpForLevel(this.xpLevel));
    G.ui.invChanged();
  }

  // The most any armour piece has of an enchantment (helmet for breathing, boots for walking on water...)
  worn(key) {
    let l = 0;
    for (const s of this.armor) l = Math.max(l, ench(s, key));
    return l;
  }

  // Flint and steel: light the block face you are looking at
  ignite(t) {
    if (!t) return false;
    const w = G.world;
    let x = t.x, y = t.y, z = t.z;
    const tb = BLOCKS[t.id];
    if (!(tb.replaceable && t.id !== B.water)) { x += t.nx; y += t.ny; z += t.nz; }
    const cur = w.getBlock(x, y, z);
    if (cur === B.water || (cur !== 0 && !BLOCKS[cur].replaceable)) return false;
    if (!G.game.canBurnAt(x, y, z)) return false;
    G.game.ignite(x, y, z);
    sfx('ignite', { x: x + 0.5, y, z: z + 0.5 });
    swingHand();
    if (!this.creative) { this.inv.damageHeld(1); G.ui.invChanged(); }
    return true;
  }

  armorPoints() {
    let pts = 0, tough = 0;
    for (const s of this.armor) if (s) { const a = ITEMS[s.id].armor; pts += a.points; tough += a.toughness; }
    return { pts, tough };
  }

  addEffect(name, secs) {
    if (this.creative || this.dead) return;
    if (G.clock - this.blockedAt < 0.2) return;   // it came with a hit the shield just stopped
    if (name === 'hunger') { this.hungerEffect = Math.max(this.hungerEffect, secs); return; }
    if (name === 'burn') { this.burning = Math.max(this.burning, secs * (1 - 0.15 * this.worn('fire_protection'))); return; }
    this.effects[name] = Math.max(this.effects[name] || 0, secs);
    G.ui.invChanged();
  }

  // Put on the armour piece in hand, swapping out whatever is worn in that slot
  equipHeld() {
    const s = this.inv.held;
    const a = s && ITEMS[s.id].armor;
    if (!a) return false;
    const old = this.armor[a.slot];
    this.armor[a.slot] = s;
    this.inv.slots[this.inv.selected] = old;
    sfx('armor');
    swingHand();
    G.ui.invChanged();
    return true;
  }

  get creative() { return this.mode === 'creative'; }
  get eyeY() { return this.riding ? this.pos.y + this.riding.def.seat + 0.95 : this.pos.y + 1.62 - (this.sneaking && !this.flying ? 0.12 : 0) - (this.swimming ? 0.5 : 0); }

  get offhand() { return this.off[0]; }

  // F: what is in the main hand and the off hand change places
  swapHands() {
    const inv = this.inv, i = inv.selected;
    if (!inv.slots[i] && !this.off[0]) return;
    [inv.slots[i], this.off[0]] = [this.off[0], inv.slots[i]];
    this.eating = null;
    this.mining = null;
    sfx('armor', null, { vol: 0.5 });
    G.ui.invChanged(true);
  }

  // The off hand gets its turn when the main hand had nothing to do (a torch while holding a pickaxe)
  useOff(target, fromTap) {
    const off = this.off[0];
    if (!off || off.id === ID.shield || ITEMS[off.id].food || ITEMS[off.id].armor) return false;
    const inv = this.inv, i = inv.selected, main = inv.slots[i];
    inv.slots[i] = off;
    let done = false;
    try { done = this.use(target, fromTap); } finally { this.off[0] = inv.slots[i]; inv.slots[i] = main; }
    if (done) G.ui.invChanged();
    return done;
  }

  // A blocked hit wears the shield out (the one in the main hand if both hold one)
  wearShield(n) {
    if (!n || this.creative) return;
    const inv = this.inv, i = inv.selected;
    const inMain = !!inv.slots[i] && inv.slots[i].id === ID.shield;
    const sh = inMain ? inv.slots[i] : this.off[0];
    if (!sh || sh.id !== ID.shield) return;
    for (let k = 0; k < n; k++) if (wears(sh)) sh.dmg = (sh.dmg || 0) + 1;
    if (sh.dmg >= ITEMS[ID.shield].durability) { if (inMain) inv.slots[i] = null; else this.off[0] = null; sfx('break_tool'); }
    G.ui.invChanged();
  }

  lookDir() {
    const cp = Math.cos(this.pitch);
    return { x: -Math.sin(this.yaw) * cp, y: Math.sin(this.pitch), z: -Math.cos(this.yaw) * cp };
  }

  // Attack strength recharges after each swing, like the original's attack cooldown
  attackStrength() {
    const held = this.inv.held;
    const it = held ? ITEMS[held.id] : null;
    const speed = toolOf(it) ? it.attackSpeed : 4;
    return Math.min(1, (G.clock - this.lastSwing) * speed);
  }

  hint(text) {
    if (this.hintCd > 0) return;
    this.hintCd = 1.2;
    G.ui.toast(text);
  }

  // ------------------------------------------------------------ per frame
  update(dt, input) {
    // a spectator looks and moves, and nothing else
    if (this.spectator) input = { ...input, attackPressed: false, usePressed: false, useHeld: false, tap: false, mine: false, touchHold: false, drop: false, dropAll: false, pick: false, swapHands: false };
    const w = G.world;
    this.hurtTime = Math.max(0, this.hurtTime - dt);
    this.invul -= dt;
    this.mineCd -= dt;
    this.useCd -= dt;
    this.hintCd -= dt;

    this.lastInput = input;
    if (this.dead) { this.target = null; this.eating = null; showHighlight(null); return; }

    // Look
    this.yaw -= input.lookX;
    this.pitch = Math.max(-Math.PI / 2 + 0.001, Math.min(Math.PI / 2 - 0.001, this.pitch - input.lookY));

    // Switching items resets the attack cooldown and cancels eating
    if (this.inv.selected !== this.lastSelected) {
      this.lastSelected = this.inv.selected;
      this.lastSwing = G.clock;
      this.eating = null;
    }

    // Wait for the ground under us to exist
    const chunkHere = w.getChunk(Math.floor(this.pos.x) >> 4, Math.floor(this.pos.z) >> 4);
    if (!chunkHere || !chunkHere.meshed) { this.frozen = true; }
    else if (this.frozen) {
      this.frozen = false;
      while (!this.spectator && boxBlocked(w, this.pos.x, this.pos.y, this.pos.z, this.hw, this.h) && this.pos.y < 126) this.pos.y += 1;
    }

    if (G.sleeping) {
      this.vel.x = this.vel.y = this.vel.z = 0;
      this.fallDist = 0;
      this.onGround = true;
      return;
    }
    if (!this.frozen) { if (this.riding) this.ride(dt, input); else this.move(dt, input); }
    if (!this.frozen && !this.riding) this.portals(dt);
    this.interact(dt, input);
    if (!this.creative) this.survival(dt);
  }

  // ------------------------------------------------------------ riding
  mountUp(m) {
    if (this.riding) this.dismount();
    this.riding = m;
    m.ridden = true;
    this.pos.x = m.pos.x; this.pos.y = m.pos.y; this.pos.z = m.pos.z;
    this.vel.x = this.vel.y = this.vel.z = 0;
    // (you take up the room the two of you do)
    this.hw = Math.max(0.3, Math.min(0.6, m.hw)); this.h = m.def.seat + 1.25;
    this.fallDist = 0; this.sprinting = this.sneaking = this.swimming = false; this.flying = false;
    this.rideSneak = true;   // (the sneak that may be held from before does not count)
    if (m.def.boat && G.adv) G.adv.did('boat');
  }
  dismount(why) {
    const m = this.riding;
    if (!m) return;
    this.riding = null;
    this.hw = 0.3; this.h = 1.8;
    leaveMount(m);
    // down beside it, or on top of it if there is no room
    const w = G.world, x = m.pos.x, y = m.pos.y, z = m.pos.z, side = m.hw + 0.5;
    const spots = [[side, 0], [-side, 0], [0, side], [0, -side]].flatMap(([dx, dz]) => [[dx, 0, dz], [dx, 1, dz]]);
    const free = spots.find(([dx, dy, dz]) => !boxBlocked(w, x + dx, y + dy, z + dz, 0.3, 1.8) && (m.def.ride.float || w.isSolid(Math.floor(x + dx), Math.floor(y + dy - 0.5), Math.floor(z + dz)) || dy === 0));
    if (free) { this.pos.x = x + free[0]; this.pos.y = y + free[1] + 0.05; this.pos.z = z + free[2]; } else this.pos.y = y + m.h + 0.05;
    this.vel.x = this.vel.y = this.vel.z = 0;
    this.fallDist = 0;
    if (why === 'buck') { this.vel.y = 5; this.hint('It threw you off! Try again: it trusts you a little more each time'); }
  }
  // On a mount: steering it if it will be steered, otherwise carried wherever it goes
  ride(dt, input) {
    const m = this.riding, w = G.world;
    if (m.dead || m.removed || !G.entities.mobs.includes(m)) { this.dismount(); return; }
    if (!input.sneak) this.rideSneak = false;
    if (input.sneak && !this.rideSneak) { this.dismount(); return; }
    if (input.swapHands && !this.dead) this.swapHands();
    this.sprinting = this.sneaking = this.swimming = this.flying = false;
    if (canSteer(m)) rideMove(this, dt, input);
    else {
      this.pos.x = m.pos.x; this.pos.y = m.pos.y; this.pos.z = m.pos.z;
      this.vel.x = this.vel.y = this.vel.z = 0;
      this.onGround = true; this.fallDist = 0;
    }
    const bx = Math.floor(this.pos.x), bz = Math.floor(this.pos.z), eye = w.getBlock(bx, Math.floor(this.eyeY), bz);
    this.inWater = w.getBlock(bx, Math.floor(this.pos.y + m.def.seat + 0.2), bz) === B.water;
    this.headInWater = eye === B.water;
    // (a strider keeps you out of the lava it wades in)
    this.inLava = m.type !== 'strider' && w.getBlock(bx, Math.floor(this.pos.y + 0.1), bz) === B.lava;
    this.headInLava = eye === B.lava;
    if (m.type === 'strider' && w.getBlock(bx, Math.floor(this.pos.y - 0.5), bz) === B.lava && G.adv) G.adv.did('strider');
    this.fovKick += (0 - this.fovKick) * Math.min(1, dt * 8);
  }

  move(dt, input) {
    const w = G.world;
    const bx = Math.floor(this.pos.x), bz = Math.floor(this.pos.z);
    const wasInWater = this.inWater;
    this.inWater = w.getBlock(bx, Math.floor(this.pos.y + 0.1), bz) === B.water ||
      w.getBlock(bx, Math.floor(this.pos.y + 0.8), bz) === B.water;
    this.headInWater = w.getBlock(bx, Math.floor(this.eyeY), bz) === B.water;
    this.inLava = w.getBlock(bx, Math.floor(this.pos.y + 0.1), bz) === B.lava || w.getBlock(bx, Math.floor(this.pos.y + 0.8), bz) === B.lava;
    this.headInLava = w.getBlock(bx, Math.floor(this.eyeY), bz) === B.lava;
    if (this.inWater) this.waterExit = 0; else this.waterExit += dt;
    if (this.inWater && !wasInWater && this.vel.y < -6) sfx('splash', this.pos);

    // Creative flight toggles with a double jump tap
    if (input.jumpPressed && this.creative) {
      const now = performance.now();
      if (now - this.lastJumpTap < 300) { this.flying = !this.flying; this.vel.y = 0; this.lastJumpTap = 0; }
      else this.lastJumpTap = now;
    }
    if (input.swapHands && !this.dead) this.swapHands();
    if (!this.creative) this.flying = false;
    // a spectator always flies, and water and lava are nothing to them
    if (this.spectator) { this.flying = true; this.inWater = this.headInWater = this.inLava = this.headInLava = false; }

    this.sneaking = input.sneak && !this.flying && !this.inWater;
    this.sneakWas = input.sneak;
    let fwd = input.moveZ, str = input.moveX;
    const len = Math.hypot(fwd, str);
    if (len > 1) { fwd /= len; str /= len; }
    const canSprint = this.food > 6 || this.creative;
    if ((input.sprint || input.sprintLatch) && fwd > 0.5 && !this.sneaking && canSprint && !this.eating) this.sprinting = true;
    if (fwd <= 0.1 || this.sneaking || !canSprint || this.eating || this.shieldUp) this.sprinting = false;
    // Sprinting with your head under water is swimming: you go where you look, quicker than paddling
    // along the top (and both are a good deal slower than a boat)
    this.swimming = this.sprinting && this.headInWater && !this.flying;

    // (Swift Sneak leggings: sneaking gets closer to walking speed)
    const sneakSpeed = Math.min(WALK, SNEAK + WALK * 0.15 * ench(this.armor[2], 'swift_sneak'));
    let speed = this.flying ? (this.sprinting ? FLY_SPRINT : FLY) : this.sneaking ? sneakSpeed : this.sprinting ? SPRINT : WALK;
    if (this.effects.slow > 0) speed *= 0.7;
    // Soul Speed boots: quick over soul sand and soul soil
    const under = w.getBlock(bx, Math.floor(this.pos.y - 0.1), bz);
    const soul = ench(this.armor[3], 'soul_speed');
    if (soul && this.onGround && (under === B.soul_sand || under === B.soul_soil)) speed *= 1.3 + 0.105 * soul;
    const inWeb = BLOCKS[w.getBlock(bx, Math.floor(this.pos.y + 0.2), bz)].slow || BLOCKS[w.getBlock(bx, Math.floor(this.pos.y + 1.2), bz)].slow;
    if (inWeb && !this.flying) { speed *= inWeb; this.vel.y = Math.max(this.vel.y, -1.5); }
    if ((this.eating || this.shieldUp) && !this.flying) speed *= 0.35;
    // (Depth Strider boots: each level takes away a third of the water's drag)
    if (this.inWater && !this.flying) {
      if (this.sprinting && !this.swimming) speed = WALK;   // (sprinting only counts for anything under water)
      const drag = this.swimming ? 0.36 : 0.25;
      speed *= drag + (1 - drag) * Math.min(3, ench(this.armor[3], 'depth_strider')) / 3;
    }
    if (this.inLava && !this.flying) speed *= 0.35;
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    // (a swimmer's speed is shared between along and up or down, by where they look)
    const level = this.swimming ? Math.cos(this.pitch) : 1;
    const wx = (-sy * fwd * level + cy * str) * speed;
    const wz = (-cy * fwd * level - sy * str) * speed;
    const accel = this.flying ? 8 : this.onGround ? 18 : this.inWater ? 7 : 4.5;
    const k = Math.min(1, accel * dt);
    this.vel.x += (wx - this.vel.x) * k;
    this.vel.z += (wz - this.vel.z) * k;

    if (this.flying) {
      const vy = ((input.jump ? 1 : 0) - (input.sneak ? 1 : 0)) * speed * 0.75;
      this.vel.y += (vy - this.vel.y) * Math.min(1, 10 * dt);
    } else if (this.effects.levitation > 0) {
      this.vel.y += (1.6 - this.vel.y) * Math.min(1, dt * 4);
    } else if (this.inLava) {
      this.vel.y -= 10 * dt;
      if (input.jump) this.vel.y = this.onGround ? JUMP_V * 0.7 : Math.min(this.vel.y + 30 * dt, 2.4);
      this.vel.y = Math.max(this.vel.y, -3);
    } else if (this.swimming) {
      // swimming: up and down with where you look (jump and sneak still nudge you)
      const vy = Math.sin(this.pitch) * speed * fwd + (input.jump ? 1.6 : 0) - (input.sneak ? 1.6 : 0);
      this.vel.y += (vy - this.vel.y) * Math.min(1, 6 * dt);
      if (Math.random() < dt * 2.5) sfx('swim', null, { vol: 0.4 });
    } else if (this.inWater) {
      // Water: slow sinking, swim up while jump is held, jump normally off the bottom
      this.vel.y -= 14 * dt;
      if (input.jump) {
        if (this.onGround) this.vel.y = JUMP_V;
        else this.vel.y = Math.min(this.vel.y + 44 * dt, 4.2);
      }
      if (input.sneak) this.vel.y -= 18 * dt;
      this.vel.y = Math.max(this.vel.y, -5);
      if (Math.random() < dt * 2 && Math.hypot(this.vel.x, this.vel.z) > 1) sfx('swim', null, { vol: 0.4 });
    } else {
      this.vel.y = Math.max(this.vel.y - GRAVITY * dt, -78);
      if (input.jump && this.onGround) {
        this.vel.y = JUMP_V;
        if (this.sprinting) { this.vel.x += -sy * 2; this.vel.z += -cy * 2; }
        this.exhaustion += this.sprinting ? 0.2 : 0.05;
      }
    }

    let dx = this.vel.x * dt, dy = this.vel.y * dt, dz = this.vel.z * dt;
    // Sneaking keeps you from walking off edges
    if (this.sneaking && this.onGround) {
      const P = this.pos;
      if (dx && !boxBlocked(w, P.x + dx, P.y - 0.6, P.z, this.hw, 0.6)) { dx = 0; this.vel.x = 0; }
      if (dz && !boxBlocked(w, P.x + dx, P.y - 0.6, P.z + dz, this.hw, 0.6)) { dz = 0; this.vel.z = 0; }
    }
    const ox = this.pos.x, oz = this.pos.z, oyPos = this.pos.y;
    let res;
    if (this.spectator) {
      // a spectator passes through blocks, as in Minecraft (kept inside the height of the world)
      this.pos.x += dx; this.pos.z += dz;
      this.pos.y = Math.max(1, Math.min(140, this.pos.y + dy));
      res = { x: false, y: false, z: false, ground: false };
    } else res = moveBox(w, this, dx, dy, dz, this.flying || this.inWater ? 0 : 0.6);   // slabs are walked up without a jump
    if (res.x) this.vel.x = 0;
    if (res.z) this.vel.z = 0;
    const wasGround = this.onGround;
    this.onGround = res.ground;
    if (res.y) this.vel.y = 0;

    // Walking into a one-block step: hop up it. On land this is auto-jump (touch default);
    // in water (or just after leaving it) pushing against a ledge climbs out, like the original.
    const pushing = Math.abs(fwd) + Math.abs(str) > 0.2;
    if ((res.x || res.z) && pushing && !this.flying) {
      const ax = res.x ? this.pos.x + Math.sign(wx) * (this.hw + 0.2) : this.pos.x;
      const az = res.z ? this.pos.z + Math.sign(wz) * (this.hw + 0.2) : this.pos.z;
      const climb = this.stepHeight(ax, az);
      const wet = this.inWater || this.waterExit < 0.35;
      const assist = input.jump || G.settings.autoJump || G.touchMode;
      if (wet && climb <= 2.2 && assist) this.vel.y = Math.max(this.vel.y, 8.2);
      else if (this.inWater && climb <= 5 && assist) this.vel.y = Math.max(this.vel.y, 4.2); // swim up the wall toward the exit
      else if (!wet && this.onGround && climb <= 1.1 && G.settings.autoJump) this.vel.y = JUMP_V;
    }

    if (this.flying && this.onGround && !input.jump) this.flying = false;

    // Falling
    const fell = oyPos - this.pos.y;
    if (!this.onGround && fell > 0 && !this.flying && !this.inWater) this.fallDist += fell;
    if (this.inWater || this.inLava || this.flying || this.effects.levitation > 0) this.fallDist = 0;
    if (this.onGround && !wasGround) {
      if (this.fallDist > 3 && !this.creative && !(G.clock < (this.safeLanding || 0))) {   // (no harm in the fall after a teleport)
        this.hurt(Math.floor(this.fallDist - 3), null, null, 'fall');
        sfx('fall');
      }
      if (this.fallDist > 1) this.stepSound(true);
      this.fallDist = 0;
    }

    // Walking effects
    const moved = Math.hypot(this.pos.x - ox, this.pos.z - oz);
    const frost = ench(this.armor[3], 'frost_walker');
    if (frost && this.onGround && moved > 0.001) G.game.frostWalk(this, frost);
    if (this.onGround && !this.flying) {
      this.stepDist += moved;
      this.bob += moved * 1.6;
      this.bobAmt += (Math.min(1, moved / dt / 5) - this.bobAmt) * Math.min(1, dt * 10);
      if (this.stepDist > 1.8) { this.stepDist = 0; if (!this.sneaking) this.stepSound(false); }
    } else this.bobAmt *= Math.max(0, 1 - dt * 8);
    if (this.inWater) this.exhaustion += moved * 0.01;
    else if (this.sprinting) this.exhaustion += moved * 0.1;
    this.fovKick += ((this.sprinting ? 1 : 0) - this.fovKick) * Math.min(1, dt * 8);

    if (this.pos.y < -30) this.hurt(4, null, null, 'void');
  }

  // Standing in a nether portal for a few seconds takes you through; end portals and gateways work at once
  portals(dt) {
    const w = G.world;
    const bx = Math.floor(this.pos.x), bz = Math.floor(this.pos.z);
    const at = (dy) => w.getBlock(bx, Math.floor(this.pos.y + dy), bz);
    const has = (id) => at(0.2) === id || at(1) === id;
    const nether = has(B.nether_portal), end = has(B.end_portal), gate = has(B.end_gateway);
    if (!nether && !end && !gate) {
      this.portalCooldown = false;
      if (this.portalT) { this.portalT = 0; G.ui.portalOverlay(0); }
      return;
    }
    if (this.portalCooldown || G.sleeping) return;
    if (end) { this.portalCooldown = true; if (G.dim === 'end') G.game.finishEnd(); else G.game.travel('end', 'end'); return; }
    if (gate) { this.portalCooldown = true; G.game.gateway(); return; }
    if (!this.portalT) sfx('portal', null, { vol: 0.5 });
    this.portalT += dt;
    const need = this.creative ? 1 : 4;
    G.ui.portalOverlay(Math.min(1, this.portalT / need));
    if (this.portalT >= need) {
      this.portalCooldown = true;
      this.portalT = 0;
      G.ui.portalOverlay(0);
      G.game.travel(G.dim === 'nether' ? 'overworld' : 'nether', 'portal');
    }
  }

  // How far up the player must rise to stand on the column at (ax, az); Infinity if it can't be climbed
  stepHeight(ax, az) {
    const w = G.world;
    const bx = Math.floor(ax), bz = Math.floor(az);
    const y0 = Math.floor(this.pos.y + 0.01);
    let top = y0;
    while (top < y0 + 6 && w.isSolid(bx, top, bz)) top++;
    if (top === y0) return Infinity;
    if (w.isSolid(bx, top + 1, bz)) return Infinity;
    const px = Math.floor(this.pos.x), pz = Math.floor(this.pos.z);
    for (let y = Math.floor(this.pos.y + this.h); y <= top + 1; y++) if (w.isSolid(px, y, pz)) return Infinity;
    return top - this.pos.y;
  }

  stepSound(land) {
    const id = G.world.getBlock(Math.floor(this.pos.x), Math.floor(this.pos.y - 0.2), Math.floor(this.pos.z));
    if (id && BLOCKS[id]) blockSound(BLOCKS[id].sound, land ? 'place' : 'step', null);
  }

  // ------------------------------------------------------------ interaction
  // The pick ray: the crosshair, or on touch screens the point under the finger
  pickRay(input) {
    if (input.aim) {
      const cam = R.camera, c = cam.position;
      tmpV.set(input.aim.x, input.aim.y, 0.5).unproject(cam).sub(c).normalize();
      if (!this.outside) return { ox: c.x, oy: c.y, oz: c.z, dx: tmpV.x, dy: tmpV.y, dz: tmpV.z };
      // Seen from outside: find what the finger is on as the camera sees it, then reach for that from
      // your own eyes
      const far = 40;
      const hit = raycast(G.world, c.x, c.y, c.z, tmpV.x, tmpV.y, tmpV.z, far, (id) => id !== B.water && id !== B.lava && id !== B.nether_portal && id !== B.end_portal);
      const mob = G.entities.pickMob(c.x, c.y, c.z, tmpV.x, tmpV.y, tmpV.z, far);
      const pl = G.net ? G.net.pickPlayer(c.x, c.y, c.z, tmpV.x, tmpV.y, tmpV.z, far) : null;
      let t = hit ? hit.dist + 0.02 : far;
      if (mob && mob.t < t) t = mob.t + 0.05;
      if (pl && pl.t < t) t = pl.t + 0.05;
      const tx = c.x + tmpV.x * t - this.pos.x, ty = c.y + tmpV.y * t - this.eyeY, tz = c.z + tmpV.z * t - this.pos.z;
      const n = Math.hypot(tx, ty, tz) || 1;
      return { ox: this.pos.x, oy: this.eyeY, oz: this.pos.z, dx: tx / n, dy: ty / n, dz: tz / n };
    }
    // from the camera itself, so the crosshair picks exactly the block it is drawn over (view bobbing moves the camera)
    const d = this.lookDir(), c = R.camera.position;
    const near = Math.hypot(c.x - this.pos.x, c.y - this.eyeY, c.z - this.pos.z) < 0.3;
    return near ? { ox: c.x, oy: c.y, oz: c.z, dx: d.x, dy: d.y, dz: d.z } : { ox: this.pos.x, oy: this.eyeY, oz: this.pos.z, dx: d.x, dy: d.y, dz: d.z };
  }

  interact(dt, input) {
    const w = G.world;
    const fingerAim = G.touchMode && G.settings.touchAim === 'finger';
    let target = null;
    if (!fingerAim || input.aim) {
      const r = this.pickRay(input);
      const reach = this.creative ? 6 : 5;
      const hit = raycast(w, r.ox, r.oy, r.oz, r.dx, r.dy, r.dz, reach, (id) => id !== B.water && id !== B.lava && id !== B.nether_portal && id !== B.end_portal);
      let mobHit = G.entities.pickMob(r.ox, r.oy, r.oz, r.dx, r.dy, r.dz, reach - 1.5);
      // other players can always be hit
      const pl = G.net ? G.net.pickPlayer(r.ox, r.oy, r.oz, r.dx, r.dy, r.dz, reach - 1.5) : null;
      if (pl && (!mobHit || pl.t < mobHit.t)) mobHit = { mob: pl.player, t: pl.t };
      if (mobHit && (!hit || mobHit.t < hit.dist)) target = { mob: mobHit.mob };
      else if (hit) target = { block: hit };
    }
    this.target = target;

    const held = this.inv.held;
    const it = held ? ITEMS[held.id] : null;
    setHeldItem(held ? held.id : 0);
    const off = this.off[0];
    setOffItem(off ? off.id : 0);

    // Shield: hold use (or the shield button on a touch screen) with one in either hand; it takes a moment
    // to come up. In the off hand it waits its turn behind a main-hand item with a use of its own.
    const shieldMain = !!held && held.id === ID.shield, shieldOff = !!off && off.id === ID.shield;
    this.shieldCd = Math.max(0, this.shieldCd - dt);
    this.shieldUp = !this.frozen && !this.dead && this.shieldCd <= 0 && !this.eating
      && ((input.block && (shieldMain || shieldOff)) || (input.useHeld && (shieldMain || (shieldOff && noUse(held)))));
    this.blockT = this.shieldUp ? this.blockT + dt : 0;
    this.blocking = this.blockT >= 0.25;
    this.shieldHand = this.shieldUp ? (shieldMain ? 1 : 2) : 0;

    // Crossbow: hold use to draw it (Quick Charge is faster; a tap draws it by itself on a touch screen).
    // It stays loaded until the next press.
    const ch = this.charging;
    if (ch) {
      if (held !== ch.s || this.dead || !(input.useHeld || ch.auto)) this.charging = null;
      else {
        ch.t += dt;
        if (ch.t >= ch.need) {
          this.charging = null;
          held.ch = 1;
          if (!this.creative) this.inv.remove(ID.arrow, 1);
          sfx('load');
          G.ui.toast('Crossbow loaded');
          G.ui.invChanged();
          this.useCd = 0.3;
        }
      }
    }

    // Eating: hold right mouse with food in hand. On touch, a tap starts eating (auto),
    // so holding the screen always mines, whatever you are holding.
    const isFood = !!(it && it.food);
    const holdToEat = isFood && !this.frozen && !G.touchMode && input.useHeld;
    const autoEat = !!(this.eating && this.eating.auto && held && this.eating.id === held.id);
    if ((holdToEat || autoEat) && (this.food < 20 || held.id === ID.golden_apple) && !this.creative) {
      if (!this.eating || this.eating.id !== held.id) this.eating = { id: held.id, t: 0, crunch: 0, auto: false };
      const e = this.eating;
      e.t += dt;
      e.crunch -= dt;
      if (e.crunch <= 0) { e.crunch = 0.2; sfx('eat', null, { vol: 0.8 }); this.crumbs(held.id); }
      if (e.t >= EAT_TIME) this.finishEating(it);
    } else {
      if (holdToEat && !this.creative) this.hint('You are not hungry');
      this.eating = null;
    }

    // Attack mobs (left click); a fireball in front can be hit back
    if (input.attackPressed) {
      const r = this.pickRay(input);
      const fb = G.entities.pickFireball && G.entities.pickFireball(r.ox, r.oy, r.oz, r.dx, r.dy, r.dz, 5.5);
      if (fb && (!target || !target.mob)) { fb.reflect({ x: r.dx, y: r.dy, z: r.dz }); this.swing(); }
      else if (target && target.mob) this.attack(target.mob);
      else this.swing();
      this.mining = null;
    }

    // Mining works with anything in hand
    if (input.mine && target && target.block && !this.frozen) {
      const t = target.block;
      if (this.eating && this.eating.auto) this.eating = null;
      if (this.creative) {
        if (this.mineCd <= 0) { this.breakBlock(t); this.mineCd = 0.22; }
        this.mining = null;
      } else if (this.mineCd <= 0) {
        if (!this.mining || this.mining.x !== t.x || this.mining.y !== t.y || this.mining.z !== t.z || this.mining.id !== t.id) {
          this.mining = { x: t.x, y: t.y, z: t.z, id: t.id, progress: 0, tick: 0 };
        }
        const time = this.breakTime(BLOCKS[t.id]);
        this.mining.progress += time === Infinity ? 0 : dt / Math.max(time, 0.0001);
        this.mining.tick -= dt;
        if (this.mining.tick <= 0) {
          this.mining.tick = 0.22;
          swingHand();
          blockSound(BLOCKS[t.id].sound, 'hit', t);
          hitParticles(t);
        }
        if (this.mining.progress >= 1) {
          this.breakBlock(t);
          this.mining = null;
          this.mineCd = 0.25;
        }
      }
    } else this.mining = null;
    showHighlight(target && target.block ? target.block : null, this.mining ? this.mining.progress : 0);

    // Touch: a finger held on a mob keeps hitting it
    this.holdHit = Math.max(0, (this.holdHit || 0) - dt);
    if (input.touchHold && target && target.mob && !this.frozen && this.holdHit <= 0) {
      this.attack(target.mob);
      this.holdHit = 0.55;
    }

    // Touch: a villager you are standing by and facing can be traded with from the Trade button (a tap
    // on a villager hits it, as it does anything else)
    this.tradeMob = G.touchMode && !this.frozen ? (this.riding || this.villagerInReach()) : null;
    this.useLabel = !this.tradeMob ? '' : this.riding ? 'Get off' : this.tradeMob.def.villager ? 'Trade' : useLabel(this, this.tradeMob);

    // Touch tap: hit a mob, otherwise use/place; with food in hand a tap starts eating
    if (input.tap && !this.frozen) {
      // (a fireball coming at you is knocked back by a tap on it, or anywhere near it)
      const r = this.pickRay(input);
      const fb = (!target || !target.mob) && G.entities.pickFireball && G.entities.pickFireball(r.ox, r.oy, r.oz, r.dx, r.dy, r.dz, 5.5);
      if (fb) { fb.reflect({ x: r.dx, y: r.dy, z: r.dz }); this.swing(); }
      else if (this.eating && this.eating.auto) this.eating = null;
      else if (target && target.mob) this.attack(target.mob);
      else if (isFood) {
        if (!this.use(target, true)) {
          if ((this.food < 20 || held.id === ID.golden_apple) && !this.creative) this.eating = { id: held.id, t: 0, crunch: 0, auto: true };
          else this.hint('You are not hungry');
        }
      } else if (!this.use(target, true) && !this.useOff(target, true)) swingHand();
      this.useCd = 0.25;
    }

    // Creative pick block (middle click)
    if (input.pick && this.creative && target && target.block) {
      const id = target.block.id === B.furnace_lit ? B.furnace : target.block.id;
      if (ITEMS[id]) {
        const inv = this.inv;
        const slot = inv.slots.findIndex((s, i) => i < 9 && s && s.id === id);
        if (slot >= 0) inv.selected = slot;
        else inv.slots[inv.selected] = { id, count: ITEMS[id].stack, dmg: 0 };
        G.ui.invChanged(true);
      }
    }

    // Use / place (right click, repeats while held)
    if ((input.usePressed || (input.useHeld && this.useCd <= 0)) && !this.frozen && !this.eating) {
      this.placeBlocked = false;
      if (this.use(target, false) || this.useOff(target, false)) this.useCd = 0.25;
      else if (input.usePressed && !this.placeBlocked) this.useCd = 0.25;
    }

    if (input.drop) this.dropHeld(input.dropAll);
  }

  swing() {
    swingHand();
    this.lastSwing = G.clock;
  }

  // The nearest villager within reach that you are facing, with nothing in the way
  villagerInReach() {
    const d = this.lookDir(), ex = this.pos.x, ey = this.eyeY, ez = this.pos.z;
    const reach = (this.creative ? 6 : 5) - 1.5;
    let best = null, bd = reach;
    for (const m of G.entities.mobs) {
      if (!(m.def.villager || m.def.mount) || m.dead) continue;
      const dx = m.pos.x - ex, dy = m.pos.y + m.h * 0.6 - ey, dz = m.pos.z - ez;
      const dist = Math.hypot(dx, dy, dz);
      if (dist >= bd || dist < 0.01) continue;
      // (in front of you: within about sixty degrees of where you look, or right beside you)
      if (dist > 1 && (dx * d.x + dy * d.y + dz * d.z) / dist < 0.5) continue;
      const hit = raycast(G.world, ex, ey, ez, dx / dist, dy / dist, dz / dist, dist, (id) => BLOCKS[id].solid && !BLOCKS[id].door);
      if (hit && hit.dist < dist - 0.4) continue;
      best = m; bd = dist;
    }
    return best;
  }
  trade() {
    const m = this.tradeMob;
    if (this.riding) this.dismount();
    else if (m && !m.dead && !this.dead && !this.spectator) this.use({ mob: m }, true);
  }

  crumbs(id) {
    const cols = iconColors(id);
    const d = this.lookDir();
    const x = this.pos.x + d.x * 0.6, y = this.eyeY - 0.2, z = this.pos.z + d.z * 0.6;
    const L = brightness(...G.world.getLight(Math.floor(this.pos.x), Math.floor(this.eyeY), Math.floor(this.pos.z)));
    for (let i = 0; i < 5; i++) {
      const c = cols[(Math.random() * cols.length) | 0];
      G.entities.particles.spawn(x, y, z, d.x * 1.5 + (Math.random() - 0.5) * 2, 1 + Math.random() * 1.5, d.z * 1.5 + (Math.random() - 0.5) * 2,
        c[0] * L, c[1] * L, c[2] * L, 0.035, 0.6, 1);
    }
  }

  finishEating(it) {
    this.food = Math.min(20, this.food + it.food);
    this.saturation = Math.min(this.food, this.saturation + it.sat);
    if (it.hungerChance && Math.random() < it.hungerChance) this.hungerEffect = 30;
    // a golden apple mends you for a while, whatever ails you
    if (it.id === ID.golden_apple) { this.health = Math.min(20, this.health + 4); this.addEffect('regen', 12); this.effects.poison = 0; this.effects.wither = 0; }
    this.inv.consumeHeld();
    this.eating = null;
    this.useCd = 0.3;
    if (G.adv) G.adv.ate(it.id);
    sfx('burp');
    G.ui.invChanged();
  }

  breakTime(def) {
    if (def.hardness < 0) return Infinity;
    if (def.hardness === 0) return 0.05;
    const held = this.inv.held;
    const it = held ? ITEMS[held.id] : null;
    let speed = 1;
    if (toolOf(it) && toolOf(it) === def.tool) {
      speed = it.speed;
      const eff = ench(held, 'efficiency');
      if (eff) speed += eff * eff + 1;
    }
    if (toolOf(it) === 'sword' && def.cutout && def.atten) speed = 1.5;
    if (this.effects.haste > 0) speed *= 1.3;   // (a beacon's doing)
    if (this.headInWater && !ench(this.armor[0], 'aqua_affinity')) speed /= 5;
    if (!this.onGround && !this.flying && !this.inWater) speed /= 5;
    // without a good enough pickaxe, stone and ores take much longer (and drop nothing)
    return def.hardness * (canHarvest(def, held) ? 1.5 : 5) / speed;
  }

  breakBlock(t) {
    const def = BLOCKS[t.id];
    if (def.hardness < 0 && !this.creative) return;
    if (t.id === B.bedrock && !this.creative) return;
    const drop = !this.creative;
    G.game.removeBlock(t.x, t.y, t.z, drop, true);
    swingHand();
    if (!this.creative) {
      this.exhaustion += 0.005;
      const held = this.inv.held;
      const it = held ? ITEMS[held.id] : null;
      if (toolOf(it) && it.durability && def.hardness > 0) {
        if (this.inv.damageHeld(toolOf(it) === 'sword' ? 2 : 1)) sfx('break_tool');
        G.ui.invChanged();
      }
    }
  }

  attack(mob) {
    const strength = this.attackStrength();
    const held = this.inv.held;
    const it = held ? ITEMS[held.id] : null;
    const base = toolOf(it) ? it.damage : 1.5;
    let dmg = base * (0.55 + strength * strength * 0.45);
    const crit = strength > 0.9 && !this.onGround && this.vel.y < 0 && !this.flying && !this.inWater;
    if (crit) dmg *= 1.5;
    // what the weapon's enchantments add (a weak swing gets less of it)
    const impale = ench(held, 'impaling');
    dmg += (bonusDamage(held, mob.def) + (impale && (mob.inWater || (mob.def && mob.def.aquatic)) ? 2.5 * impale : 0)) * strength;
    const fire = ench(held, 'fire_aspect') * 4;
    this.swing();
    if (mob.isPlayer) {
      G.net.pvp(mob, dmg, this.pos.x, this.pos.z, fire);
      sfx('attack', mob.pos);
      if (!this.creative) {
        this.exhaustion += 0.1;
        if (it && it.durability) { if (this.inv.damageHeld(toolOf(it) === 'sword' ? 1 : 2)) sfx('break_tool'); G.ui.invChanged(); }
      }
      return;
    }
    const kb = (strength > 0.9 ? 1 : 0.5) + (this.sprinting && strength > 0.9 ? 0.6 : 0) + 0.75 * ench(held, 'knockback');
    const fx = { fire, loot: ench(held, 'looting') };
    // a full swing of a sword while standing still-ish also sweeps whatever stands beside the target
    const sweep = toolOf(it) === 'sword' && strength > 0.9 && this.onGround && !this.sprinting && !crit;
    if (mob.hurt(dmg, this.pos.x, this.pos.z, true, kb, null, fx)) {
      sfx('attack', mob.pos);
      if (G.adv) G.adv.hit(mob, dmg, held);
      if (sweep) this.sweep(mob, base, held, fx);
      if (this.sprinting && strength > 0.9) this.sprinting = false;
      if (crit) {
        for (let i = 0; i < 10; i++) G.entities.particles.spawn(mob.pos.x, mob.pos.y + mob.h * 0.7, mob.pos.z, (Math.random() - 0.5) * 4, Math.random() * 3, (Math.random() - 0.5) * 4, 0.95, 0.95, 1, 0.06, 0.5, 0.5);
      }
      if (!this.creative) {
        this.exhaustion += 0.1;
        if (it && it.durability) { if (this.inv.damageHeld(toolOf(it) === 'sword' ? 1 : 2)) sfx('break_tool'); G.ui.invChanged(); }
      }
    }
  }

  // The sweep of a sword: everything within a block of the target takes a little damage (more with Sweeping Edge)
  sweep(target, base, held, fx) {
    const l = ench(held, 'sweeping_edge');
    const dmg = 1 + base * (l / (l + 1));
    let any = false;
    for (const m of G.entities.mobs) {
      if (m === target || m.dead || m.def.villager) continue;
      if (Math.abs(m.pos.x - target.pos.x) > 1 + m.hw || Math.abs(m.pos.z - target.pos.z) > 1 + m.hw || Math.abs(m.pos.y - target.pos.y) > 1) continue;
      if (Math.hypot(m.pos.x - this.pos.x, m.pos.z - this.pos.z) > 3.5) continue;
      if (m.hurt(dmg, this.pos.x, this.pos.z, true, 0.4, null, fx)) any = true;
    }
    if (any || l) {
      const d = this.lookDir();
      for (let i = -3; i <= 3; i++) {
        const a = Math.atan2(d.x, d.z) + i * 0.22;
        G.entities.particles.spawn(this.pos.x + Math.sin(a) * 1.6, this.pos.y + 1, this.pos.z + Math.cos(a) * 1.6, Math.sin(a) * 1.5, 0.2, Math.cos(a) * 1.5, 0.95, 0.95, 0.95, 0.07, 0.25, 0);
      }
    }
  }

  use(target, fromTap) {
    const held = this.inv.held;
    const it = held ? ITEMS[held.id] : null;
    const t = target && target.block;
    const mob = target && target.mob;
    if (mob && mob.def.mount && !mob.dead) return useMount(this, mob);
    // a boat is set down on water (or on the ground) where you point
    if (held && held.id === ID.boat && !mob) {
      const r = this.pickRay(this.lastInput || {});
      const hit = raycast(G.world, r.ox, r.oy, r.oz, r.dx, r.dy, r.dz, 5.5, (id) => id === B.water || BLOCKS[id].solid);
      if (!hit) return false;
      const onWater = hit.id === B.water;
      const x = r.ox + r.dx * hit.dist, z = r.oz + r.dz * hit.dist, y = onWater ? hit.y + 0.9 : hit.y + 1.02;
      if (!onWater && hit.ny !== 1) return false;
      if (boxBlocked(G.world, x, y + (onWater ? 0.15 : 0), z, 0.6, 0.5)) { this.hint('There is no room for a boat there'); return true; }
      placeBoat(x, y, z, this.yaw + Math.PI);
      if (!this.creative) { held.count--; if (held.count <= 0) this.inv.slots[this.inv.selected] = null; G.ui.invChanged(); }
      swingHand();
      return true;
    }
    if (mob && mob.def.villager && !mob.dead) {
      if (mob.sleeping) { this.hint('This villager is asleep'); return true; }
      if (mob.prof === 'nitwit' || !mob.trades.length) { sfx('villager', mob.pos, { pitch: 0.7 }); this.hint('This villager has no work. Put a job block nearby, like a composter or a lectern'); return true; }
      sfx('villager', mob.pos);
      G.ui.openScreen('trade', mob);
      return true;
    }
    if (t && !this.sneaking) {
      const id = t.id;
      if (BLOCKS[id].bed) { if (this.riding) this.dismount(); G.game.useBed(t.x, t.y, t.z); return true; }
      if (BLOCKS[id].door) { G.game.toggleDoor(t.x, t.y, t.z); swingHand(); return true; }
      if (BLOCKS[id].trapdoor) { G.game.toggleTrapdoor(t.x, t.y, t.z); swingHand(); return true; }
      if (BLOCKS[id].sign) { G.ui.openScreen('sign', { x: t.x, y: t.y, z: t.z }); return true; }
      if (id === B.crafting_table) { G.ui.openScreen('crafting'); return true; }
      if (id === B.enchanting_table) { G.ui.openScreen('enchant', { x: t.x, y: t.y, z: t.z }); return true; }
      if (id === B.anvil) { G.ui.openScreen('anvil', {}); return true; }
      if (id === B.grindstone) { G.ui.openScreen('grind', {}); return true; }
      if (id === B.smithing_table) { G.ui.openScreen('smith', {}); return true; }
      if (id === B.furnace || id === B.furnace_lit) { G.ui.openScreen('furnace', G.game.container(t.x, t.y, t.z, 'furnace')); return true; }
      if (id === B.chest) { sfx('chest', t); G.ui.openScreen('chest', G.game.container(t.x, t.y, t.z, 'chest')); return true; }
      if (id === B.tnt && held && held.id === ID.flint_and_steel) {
        G.game.removeBlock(t.x, t.y, t.z, false);
        G.entities.primeTNT(t.x, t.y, t.z);
        sfx('ignite', t);
        swingHand();
        if (!this.creative) { this.inv.damageHeld(1); G.ui.invChanged(); }
        return true;
      }
    }
    if (!held) return false;
    if (held.id === ID.flint_and_steel) return this.ignite(t);
    if (held.id === ID.bucket || held.id === ID.water_bucket || held.id === ID.lava_bucket) return this.useBucket(held);
    if (held.id === ID.shade_eye) {
      if (t && t.id === B.end_portal_frame) return this.fillFrame(t);
      if (G.dim !== 'overworld') { this.hint('The eye has nowhere to fly here'); return true; }
      throwEye(this);
      if (!this.creative) { this.inv.consumeHeld(); G.ui.invChanged(); }
      swingHand();
      this.useCd = 0.5;
      return true;
    }
    if (it.armor) return this.equipHeld();
    // Hoes till grass and dirt into farmland; shovels flatten grass into paths
    if (t && (toolOf(it) === 'hoe' || toolOf(it) === 'shovel') && (t.id === B.grass || t.id === B.dirt || t.id === B.snowy_grass) && t.ny === 1) {
      const w = G.world;
      if (w.getBlock(t.x, t.y + 1, t.z) !== 0 && !BLOCKS[w.getBlock(t.x, t.y + 1, t.z)].replaceable) return false;
      if (w.getBlock(t.x, t.y + 1, t.z)) G.game.removeBlock(t.x, t.y + 1, t.z, false);
      if (toolOf(it) === 'hoe') w.setBlock(t.x, t.y, t.z, B.farmland);
      else if (t.id !== B.dirt) w.setBlock(t.x, t.y, t.z, B.dirt_path);
      else return false;
      blockSound('gravel', 'place', { x: t.x + 0.5, y: t.y + 1, z: t.z + 0.5 });
      swingHand();
      if (!this.creative) { this.inv.damageHeld(1); G.ui.invChanged(); }
      return true;
    }
    if (held.id === ID.treasure_map) {
      // (a blank one, out of the creative inventory, takes on the nearest treasure the first time it is read)
      if (!held.dmg && G.dim === 'overworld') { held.dmg = treasureFor(G.world, Math.floor(this.pos.x), Math.floor(this.pos.z)); G.ui.invChanged(); }
      G.ui.openScreen('map', { code: held.dmg || 0 });
      return true;
    }
    if (held.id === ID.charred_skull) {
      // set down on a block, looking back at you; three in a row on a T of soul sand wake the Wither
      if (!t) return false;
      let x = t.x, y = t.y, z = t.z;
      if (!BLOCKS[t.id].replaceable) { x += t.nx; y += t.ny; z += t.nz; }
      const cur = G.world.getBlock(x, y, z);
      if (y < 1 || y >= 126 || (cur !== 0 && !BLOCKS[cur].replaceable)) return false;
      if (!G.world.isSolid(x, y - 1, z)) { this.hint('A skull needs a block to sit on'); return false; }
      const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
      G.game.placeBlock(x, y, z, B.charred_skull_block, Math.abs(fx) > Math.abs(fz) ? (fx > 0 ? 3 : 1) : (fz > 0 ? 0 : 2));
      blockSound('stone', 'place', { x: x + 0.5, y: y + 0.5, z: z + 0.5 });
      swingHand();
      if (!this.creative) { this.inv.consumeHeld(); G.ui.invChanged(); }
      this.useCd = 0.25;
      return true;
    }
    if (held.id === ID.wheat_seeds) {
      if (!t || t.id !== B.farmland || t.ny !== 1 || G.world.getBlock(t.x, t.y + 1, t.z) !== 0) return false;
      G.game.placeBlock(t.x, t.y + 1, t.z, B.wheat_0, 0);
      if (G.adv) G.adv.did('seed');
      blockSound('grass', 'place', { x: t.x + 0.5, y: t.y + 1, z: t.z + 0.5 });
      swingHand();
      if (!this.creative) { this.inv.consumeHeld(); G.ui.invChanged(); }
      return true;
    }
    if (held.id === ID.shade_pearl) {
      const r = this.pickRay(this.lastInput || {});
      G.entities.throwPearl(this.pos.x + r.dx * 0.5, this.eyeY + r.dy * 0.5, this.pos.z + r.dz * 0.5, r.dx * 22, r.dy * 22 + 2, r.dz * 22);
      sfx('bow');
      swingHand();
      if (!this.creative) { this.inv.consumeHeld(); G.ui.invChanged(); }
      return true;
    }
    if (it.food) {
      // Eating happens while use is held; a click with food does nothing else
      if (fromTap) return false;
      if (this.food >= 20 || this.creative) { this.hint('You are not hungry'); return false; }
      return true;
    }
    if (held.id === ID.bow) {
      const hasArrow = this.creative || this.inv.count(ID.arrow) > 0;
      if (!hasArrow) { this.hint('You need arrows'); return false; }
      const r = this.pickRay(this.lastInput || {});
      // Power: harder hits; Punch: knocks back; Flame: burning arrows; Infinity: the arrow isn't used up
      const power = ench(held, 'power');
      G.entities.spawnArrow(this.pos.x + r.dx * 0.4, this.eyeY - 0.1 + r.dy * 0.4, this.pos.z + r.dz * 0.4, r.dx * 34, r.dy * 34, r.dz * 34, 'player',
        { mul: power ? 1 + 0.25 * (power + 1) : 1, punch: ench(held, 'punch'), flame: ench(held, 'flame'), keep: !!ench(held, 'infinity') || this.creative });
      sfx('bow');
      swingHand();
      if (!this.creative) { if (!ench(held, 'infinity')) this.inv.remove(ID.arrow, 1); this.inv.damageHeld(1); G.ui.invChanged(); }
      return true;
    }
    if (held.id === ID.crossbow) {
      if (held.ch) {
        if (!fromTap && !(this.lastInput && this.lastInput.usePressed)) return true;   // loaded: it waits for a fresh press
        const r = this.pickRay(this.lastInput || {});
        const multi = ench(held, 'multishot'), shot = ++shotSeq;
        // Multishot: two more to the sides (they can't be picked up); Piercing: through several mobs
        for (const a of multi ? [0, -0.17, 0.17] : [0]) {
          const dx = r.dx * Math.cos(a) - r.dz * Math.sin(a), dz = r.dz * Math.cos(a) + r.dx * Math.sin(a);
          G.entities.spawnArrow(this.pos.x + dx * 0.4, this.eyeY - 0.1 + r.dy * 0.4, this.pos.z + dz * 0.4, dx * 40, r.dy * 40, dz * 40, 'player',
            { bolt: true, shot, pierce: ench(held, 'piercing'), keep: a !== 0 || this.creative });
        }
        held.ch = 0;
        sfx('bow', null, { vol: 1.2 });
        swingHand();
        if (G.adv) G.adv.did('crossbow');
        if (!this.creative) this.inv.damageHeld(multi ? 3 : 1);
        G.ui.invChanged();
        this.useCd = 0.4;
        return true;
      }
      if (this.charging) return true;
      if (!this.creative && this.inv.count(ID.arrow) < 1) { this.hint('You need arrows'); return false; }
      this.charging = { s: held, t: 0, need: Math.max(0.25, 1.25 - 0.25 * ench(held, 'quick_charge')), auto: !!fromTap };
      return true;
    }
    if (held.id === ID.trident) {
      const rip = ench(held, 'riptide');
      if (rip) {
        // Riptide: in water the trident carries you with it instead of being thrown
        if (!this.inWater) { this.hint('Riptide only works in water'); return false; }
        const d = this.lookDir(), v = 10 + 5 * rip;
        this.vel.x = d.x * v; this.vel.y = d.y * v + 3; this.vel.z = d.z * v;
        this.fallDist = 0;
        sfx('splash', null, { vol: 0.8 });
        swingHand();
        if (!this.creative) { this.inv.damageHeld(1); G.ui.invChanged(); }
        this.useCd = 0.6;
        return true;
      }
      const r = this.pickRay(this.lastInput || {});
      const st = { id: held.id, count: 1, dmg: (held.dmg || 0) + (this.creative || !wears(held) ? 0 : 1), ...(held.e ? { e: { ...held.e } } : {}) };
      this.inv.slots[this.inv.selected] = null;
      if (st.dmg < ITEMS[st.id].durability) {
        G.entities.spawnArrow(this.pos.x + r.dx * 0.5, this.eyeY - 0.1 + r.dy * 0.5, this.pos.z + r.dz * 0.5, r.dx * 30, r.dy * 30, r.dz * 30, 'player', { trident: st, damage: 11 });
      } else sfx('break_tool');
      sfx('bow', null, { vol: 0.9 });
      swingHand();
      if (G.adv) G.adv.did('trident');
      G.ui.invChanged();
      this.useCd = 0.5;
      return true;
    }
    if (held.id === ID.fishing_rod) {
      const wear = G.entities.fish(this, held, this.pickRay(this.lastInput || {}));
      swingHand();
      if (wear && !this.creative) { if (this.inv.damageHeld(wear)) sfx('break_tool'); G.ui.invChanged(); }
      this.useCd = 0.4;
      return true;
    }
    if (held.id === ID.experience_bottle) {
      const r = this.pickRay(this.lastInput || {});
      G.entities.throwBottle(this.pos.x + r.dx * 0.5, this.eyeY + r.dy * 0.5, this.pos.z + r.dz * 0.5, r.dx * 16, r.dy * 16 + 3, r.dz * 16);
      sfx('bow', null, { vol: 0.6 });
      swingHand();
      if (!this.creative) { this.inv.consumeHeld(); G.ui.invChanged(); }
      return true;
    }
    if (it.isBlock && t) return this.place(t, held);
    return false;
  }

  place(t, held) {
    const w = G.world;
    const def = BLOCKS[held.id];
    let x = t.x, y = t.y, z = t.z;
    // a slab onto the open side of a matching half slab completes the block
    if (def.slab && t.id === held.id) {
      const upper = w.getMeta(t.x, t.y, t.z) & 1;
      if ((t.ny === 1 && !upper) || (t.ny === -1 && upper)) return this.finishPlace(def, t.x, t.y, t.z, B[def.slab], 0);
    }
    if (!BLOCKS[t.id].replaceable || t.id === held.id) { x += t.nx; y += t.ny; z += t.nz; }
    if (y < 0 || y >= 127) return false;
    const cur = w.getBlock(x, y, z);
    // (or into the block where a matching half already sits, from the side)
    if (def.slab && cur === held.id) return this.finishPlace(def, x, y, z, B[def.slab], 0);
    if (cur !== 0 && !BLOCKS[cur].replaceable) return false;
    // how far up the clicked block the pointer hit (for the top or bottom half)
    const ray = this.pickRay(this.lastInput || {});
    const hitY = ray.oy + ray.dy * (t.dist || 0);
    const upperHalf = t.ny === -1 || (t.ny === 0 && hitY - Math.floor(hitY) > 0.5);
    const facing = () => { const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw); return Math.abs(fx) > Math.abs(fz) ? (fx > 0 ? 3 : 1) : (fz > 0 ? 0 : 2); };
    if (held.id === B.torch) {
      // on the wall that was clicked, else on the floor, else on any wall beside it
      const walls = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      let meta = -1;
      if (t.ny === 0) meta = walls.findIndex(([dx, dz]) => dx === -t.nx && dz === -t.nz) + 1;
      if (meta > 0 && !w.isSolid(x + walls[meta - 1][0], y, z + walls[meta - 1][1])) meta = -1;
      if (meta < 0 && w.isSolid(x, y - 1, z)) meta = 0;
      if (meta < 0) meta = walls.findIndex(([dx, dz]) => w.isSolid(x + dx, y, z + dz)) + 1 || -1;
      if (meta < 0) { this.hint('Torches need a block to stand on or hang from'); return false; }
      return this.finishPlace(def, x, y, z, held.id, meta);
    }
    if (def.sign) {
      // on top of a block it stands on a post, facing you; on the side of one it hangs flat
      if (t.ny === 0 && w.isSolid(t.x, t.y, t.z)) {
        const m = t.nz === 1 ? 0 : t.nx === 1 ? 1 : t.nz === -1 ? 2 : 3;
        this.finishPlace(def, x, y, z, B.wall_sign, m);
      } else {
        if (!w.isSolid(x, y - 1, z)) { this.hint('Signs need a block to stand on or hang from'); return false; }
        const lx = -Math.sin(this.yaw), lz = -Math.cos(this.yaw);   // it faces back at whoever placed it
        this.finishPlace(def, x, y, z, B.sign, Math.abs(lx) > Math.abs(lz) ? (lx > 0 ? 3 : 1) : (lz > 0 ? 2 : 0));
      }
      G.ui.openScreen('sign', { x, y, z });
      return true;
    }
    if (def.trapdoor) return this.finishPlace(def, x, y, z, held.id, facing() | (upperHalf ? 8 : 0));
    if (def.slab) return this.finishPlace(def, x, y, z, held.id, upperHalf ? 1 : 0);
    if (def.support) {
      const below = w.getBlock(x, y - 1, z);
      const ok = def.support === 'solid' ? (BLOCKS[below].opaque || below === B.oak_fence) : def.support().includes(below);
      if (!ok) { this.hint(held.id === B.torch ? 'Torches need a solid block below' : "That can't be placed here"); return false; }
    }
    if (def.solid) {
      const P = this.pos;
      const overlap = (px, py, pz, hw, h) => x < px + hw && x + 1 > px - hw && y < py + h && y + 1 > py && z < pz + hw && z + 1 > pz - hw;
      if (!this.dead && overlap(P.x, P.y, P.z, this.hw - 0.02, this.h - 0.02)) {
        // Jumping and placing straight down builds a pillar: lift the player onto the new block
        const under = Math.floor(P.x) === x && Math.floor(P.z) === z && P.y > y + 0.25 && !this.onGround && !this.flying;
        if (!under || boxBlocked(w, P.x, y + 1, P.z, this.hw, this.h)) { this.placeBlocked = true; return false; }
        P.y = y + 1;
        this.vel.y = Math.max(this.vel.y, 0);
        this.fallDist = 0;
      }
      for (const m of G.entities.mobs) if (!m.dead && overlap(m.pos.x, m.pos.y, m.pos.z, m.hw, m.h)) return false;
    }
    let meta = 0;
    if (def.facing) {
      const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
      meta = Math.abs(fx) > Math.abs(fz) ? (fx > 0 ? 3 : 1) : (fz > 0 ? 0 : 2);
    }
    const free = (bx, by, bz) => { const b = w.getBlock(bx, by, bz); return b === 0 || BLOCKS[b].replaceable; };
    if (def.bed) {
      // the head goes one block further in the direction you are facing
      const hd = [[0, -1], [1, 0], [0, 1], [-1, 0]][meta];
      const facing = [2, 3, 0, 1][meta];
      const hx = x + hd[0], hz = z + hd[1];
      if (!free(hx, y, hz) || !BLOCKS[w.getBlock(x, y - 1, z)].solid || !BLOCKS[w.getBlock(hx, y - 1, hz)].solid) { this.hint('There is no room for the bed here'); return false; }
      G.game.placeBlock(x, y, z, B.bed_foot, facing);
      G.game.placeBlock(hx, y, hz, B.bed_head, facing);
    } else if (def.door) {
      if (!free(x, y + 1, z) || !BLOCKS[w.getBlock(x, y - 1, z)].solid) { this.hint('There is no room for the door here'); return false; }
      G.game.placeBlock(x, y, z, B.oak_door, meta);
      G.game.placeBlock(x, y + 1, z, B.oak_door_top, meta);
    } else G.game.placeBlock(x, y, z, held.id, meta);
    blockSound(def.sound, 'place', { x: x + 0.5, y: y + 0.5, z: z + 0.5 });
    swingHand();
    if (!this.creative) { this.inv.consumeHeld(); G.ui.invChanged(); }
    return true;
  }

  // Puts the block down, with its sound, and uses up one from the hand
  finishPlace(def, x, y, z, id, meta) {
    const w = G.world;
    if (BLOCKS[id].solid) {
      const span = id === B[def.slab] || !def.slab ? [0, 1] : meta & 1 ? [0.5, 1] : [0, 0.5];
      const hit = (px, py, pz, hw, h) => x < px + hw && x + 1 > px - hw && y + span[0] < py + h && y + span[1] > py && z < pz + hw && z + 1 > pz - hw;
      if (!def.trapdoor) {
        if (!this.dead && hit(this.pos.x, this.pos.y, this.pos.z, this.hw - 0.02, this.h - 0.02)) { this.placeBlocked = true; return false; }
        for (const m of G.entities.mobs) if (!m.dead && hit(m.pos.x, m.pos.y, m.pos.z, m.hw, m.h)) return false;
      }
    }
    G.game.placeBlock(x, y, z, id, meta);
    blockSound(def.sound, 'place', { x: x + 0.5, y: y + 0.5, z: z + 0.5 });
    swingHand();
    if (!this.creative) { this.inv.consumeHeld(); G.ui.invChanged(); }
    return true;
  }

  // Buckets scoop up water and lava sources and pour them out again (water boils away in the Nether)
  useBucket(held) {
    const w = G.world;
    const r = this.pickRay(this.lastInput || {});
    const hit = raycast(w, r.ox, r.oy, r.oz, r.dx, r.dy, r.dz, 5, (id) => id === B.water || id === B.lava || BLOCKS[id].solid || !BLOCKS[id].replaceable);
    if (!hit) return false;
    if (held.id === ID.bucket) {
      if ((hit.id !== B.water && hit.id !== B.lava) || w.getMeta(hit.x, hit.y, hit.z) !== 0) return false;   // only a source fills a bucket
      w.setBlock(hit.x, hit.y, hit.z, 0);
      if (!this.creative) {
        const full = hit.id === B.water ? ID.water_bucket : ID.lava_bucket;
        this.inv.consumeHeld();
        const left = this.inv.add(full, 1);
        if (left) G.entities.dropItem(full, 1, this.pos.x, this.pos.y + 1, this.pos.z);
      }
      sfx('bucket', hit);
      swingHand();
      G.ui.invChanged();
      return true;
    }
    let x = hit.x, y = hit.y, z = hit.z;
    if (!BLOCKS[hit.id].replaceable) { x += hit.nx; y += hit.ny; z += hit.nz; }
    const cur = w.getBlock(x, y, z);
    if (cur !== 0 && !BLOCKS[cur].replaceable) return false;
    const liquid = held.id === ID.water_bucket ? B.water : B.lava;
    if (liquid === B.water && G.dim === 'nether') {
      sfx('extinguish', { x: x + 0.5, y: y + 0.5, z: z + 0.5 });
      for (let i = 0; i < 12; i++) G.entities.particles.spawn(x + Math.random(), y + Math.random(), z + Math.random(), 0, 1, 0, 0.8, 0.8, 0.8, 0.18, 1, -0.08);
    } else {
      if (cur && cur !== B.water && cur !== B.lava) G.game.removeBlock(x, y, z, true);
      w.setBlock(x, y, z, liquid, 0);
    }
    if (!this.creative) this.inv.slots[this.inv.selected] = { id: ID.bucket, count: 1, dmg: 0 };
    sfx('bucket', { x: x + 0.5, y: y + 0.5, z: z + 0.5 });
    swingHand();
    G.ui.invChanged();
    return true;
  }

  // An eye in an empty end portal frame; the twelfth one opens the portal
  fillFrame(t) {
    const w = G.world;
    w.setBlock(t.x, t.y, t.z, B.end_portal_frame_filled);
    if (G.adv) G.adv.did('eye');
    if (!this.creative) { this.inv.consumeHeld(); G.ui.invChanged(); }
    sfx('frame', t);
    swingHand();
    if (activateEndPortal(w, t.x, t.y, t.z)) { sfx('portal_open', t, { vol: 1.2 }); G.ui.toast('The End portal is open'); }
    return true;
  }

  dropHeld(all) {
    const s = this.inv.held;
    if (!s) return;
    const n = all ? s.count : 1;
    const d = this.lookDir();
    G.entities.dropShared(s.id, n, this.pos.x + d.x * 0.3, this.eyeY - 0.3, this.pos.z + d.z * 0.3, d.x * 6, d.y * 6 + 2, d.z * 6, s.dmg, s.e).pickupDelay = 1.5;
    this.inv.consumeHeld(n);
    swingHand();
    G.ui.invChanged();
  }

  // ------------------------------------------------------------ hunger, regeneration, air
  // Follows the original rules: exhaustion drains saturation first, then the hunger bar.
  survival(dt) {
    const w = G.world, bx = Math.floor(this.pos.x), bz = Math.floor(this.pos.z);
    const inFire = w.getBlock(bx, Math.floor(this.pos.y + 0.1), bz) === B.fire || w.getBlock(bx, Math.floor(this.pos.y + 1.2), bz) === B.fire;
    if (this.inWater) this.burning = 0;
    else if (this.inLava) this.burning = Math.max(this.burning, 15);
    else if (inFire) this.burning = Math.max(this.burning, 4);
    if (this.burning > 0) {
      this.burning -= dt;
      this.fireTick += dt;
      if (Math.random() < dt * 4) sfx('burn', null, { vol: 0.7 });
      if (this.fireTick >= (this.inLava || inFire ? 0.5 : 1)) { this.fireTick = 0; this.invul = 0; this.hurt(this.inLava ? 4 : 1, null, null, this.inLava ? 'lava' : 'fire'); }
      if (Math.random() < dt * 10) G.entities.particles.spawn(this.pos.x + (Math.random() - 0.5) * 0.6, this.pos.y + Math.random() * 1.6, this.pos.z + (Math.random() - 0.5) * 0.6, 0, 1, 0, 1, 0.6, 0.15, 0.12, 0.4, -0.05);
    }
    if (this.hungerEffect > 0) { this.hungerEffect -= dt; this.exhaustion += 0.1 * dt; }
    // standing on a pressure plate
    if (BLOCKS[w.getBlock(bx, Math.floor(this.pos.y + 0.02), bz)].plate && !this.flying && !this.spectator) G.game.pressPlate(bx, Math.floor(this.pos.y + 0.02), bz);
    // touching a cactus pricks
    this.cactusT = Math.max(0, (this.cactusT || 0) - dt);
    if (this.cactusT <= 0 && touching(w, this, B.cactus)) { this.cactusT = 0.5; this.hurt(1, null, null, 'cactus'); }
    // magma blocks burn your feet unless you sneak
    if (this.onGround && !this.sneaking && w.getBlock(bx, Math.floor(this.pos.y - 0.1), bz) === B.magma_block) {
      this.magmaTick = (this.magmaTick || 0) + dt;
      if (this.magmaTick >= 1) { this.magmaTick = 0; this.hurt(1, null, null, 'fire'); }
    }
    if (this.effects.levitation > 0) this.effects.levitation = Math.max(0, this.effects.levitation - dt);
    if (this.effects.wither > 0) {
      this.effects.wither = Math.max(0, this.effects.wither - dt);
      this.witherTick = (this.witherTick || 0) + dt;
      if (this.witherTick >= 2) { this.witherTick = 0; this.invul = 0; this.hurt(1, null, null, 'wither'); }
    }
    if (this.effects.slow > 0) this.effects.slow = Math.max(0, this.effects.slow - dt);
    if (this.effects.haste > 0) this.effects.haste = Math.max(0, this.effects.haste - dt);
    if (this.effects.regen > 0) {
      this.effects.regen = Math.max(0, this.effects.regen - dt);
      this.regenTick = (this.regenTick || 0) + dt;
      if (this.regenTick >= 1.6) { this.regenTick = 0; if (this.health < 20 && !this.dead) { this.health = Math.min(20, this.health + 1); G.ui.invChanged(); } }
    }
    if (this.effects.poison > 0) {
      this.effects.poison = Math.max(0, this.effects.poison - dt);
      this.poisonTick += dt;
      if (this.poisonTick >= 1.25) { this.poisonTick = 0; if (this.health > 1) { this.invul = 0; this.hurt(1, null, null, 'poison'); } }
    }
    // Hunger drains at about half the original game's rate
    while (this.exhaustion >= 8) {
      this.exhaustion -= 8;
      if (this.saturation > 0) this.saturation = Math.max(0, this.saturation - 1);
      else this.food = Math.max(0, this.food - 1);
    }
    this.regenTimer += dt;
    if (this.health < 20 && this.food >= 20 && this.saturation > 0) {
      // Fast regeneration while the hunger bar is full and saturated
      if (this.regenTimer >= 0.5) {
        const s = Math.min(this.saturation, 6);
        this.heal(s / 6);
        this.exhaustion += s * 0.6;
        this.regenTimer = 0;
      }
    } else if (this.health < 20 && this.food >= 18) {
      if (this.regenTimer >= 4) { this.heal(1); this.exhaustion += 4; this.regenTimer = 0; }
    } else if (this.food <= 0) {
      if (this.regenTimer >= 4) { this.regenTimer = 0; if (this.health > 1) this.hurt(1, null, null, 'starve'); }
    } else this.regenTimer = Math.min(this.regenTimer, 0.5);

    if (this.headInWater) {
      this.air -= dt / (1 + ench(this.armor[0], 'respiration'));   // Respiration: each level a breath as long again
      if (this.air <= 0) {
        this.air = 0;
        this.airTick += dt;
        if (this.airTick >= 1) { this.airTick = 0; this.hurt(2, null, null, 'drown'); }
      }
    } else { this.air = Math.min(15, this.air + dt * 5); this.airTick = 0; }
  }

  heal(n) {
    this.health = Math.min(20, this.health + n);
    G.ui.invChanged();
  }

  // axe: the blow came from an axe, which knocks a shield down for a while; by: the mob that struck it
  hurt(amount, fromX, fromZ, kind, axe = false, by = null) {
    if (this.spectator) return;
    if (this.dead) return;
    if (this.creative && kind !== 'void') return;
    if (this.invul > 0 && kind !== 'void') return;
    // A raised shield stops what comes from in front: hits, arrows, fireballs and blasts
    if (this.blocking && fromX != null && SHIELD_STOPS.includes(kind)) {
      const dx = fromX - this.pos.x, dz = fromZ - this.pos.z, d = Math.hypot(dx, dz);
      const look = this.lookDir();
      if (d < 0.05 || dx * look.x + dz * look.z > 0) {
        sfx('shield', null, { vol: 0.9 });
        if (G.adv && (kind === 'arrow' || kind === 'fireball')) G.adv.did('deflect');
        this.blockedAt = G.clock;
        this.invul = HURT_TIME;
        this.wearShield(amount >= 3 ? 1 + Math.floor(amount) : 0);
        if (axe) { this.shieldCd = 5; this.shieldUp = this.blocking = false; this.blockT = 0; this.hint('Your shield was knocked down'); }
        return;
      }
    }
    // monsters hit softer than in Minecraft's normal difficulty (its "easy" amounts)
    if (kind === 'mob' || kind === 'arrow' || kind === 'fireball' || kind === 'explosion') amount = Math.min(amount, amount / 2 + 1);
    const bypass = ['fall', 'drown', 'starve', 'void', 'poison', 'magic', 'pearl', 'wither'].includes(kind);
    if (!bypass) {
      const { pts, tough } = this.armorPoints();
      if (pts > 0) {
        const reduced = amount * (1 - Math.min(20, Math.max(pts / 5, pts - amount / (2 + tough / 4))) / 25);
        const wear = Math.max(1, Math.floor(amount / 4));
        this.armor.forEach((s, i) => {
          if (!s) return;
          for (let k = 0; k < wear; k++) if (wears(s, true)) s.dmg = (s.dmg || 0) + 1;   // (Unbreaking shrugs some of it off)
          if (s.dmg >= ITEMS[s.id].durability) { this.armor[i] = null; sfx('break_tool'); }
        });
        amount = reduced;
      }
    }
    // the Protection enchantments take off up to four fifths of what is left (falls and fire included)
    if (kind !== 'void' && kind !== 'starve' && kind !== 'admin') amount *= 1 - protection(this.armor, kind);
    // Thorns: whoever struck you may get hurt back
    if (by && by.hurt && !by.dead && (kind === 'mob')) {
      const th = this.worn('thorns');
      if (th && Math.random() < 0.15 * th) { by.invul = 0; by.hurt(1 + Math.floor(Math.random() * 4), this.pos.x, this.pos.z, true, 0.3); }
    }
    this.health = Math.max(0, this.health - amount);
    if (G.sleeping) G.game.wakeUp();
    this.invul = HURT_TIME;
    this.hurtTime = HURT_TIME;
    this.exhaustion += 0.1;
    this.eating = null;
    sfx('hurt');
    this.hurtRoll = Math.random() < 0.5 ? 1 : -1;
    if (fromX != null) {
      const dx = this.pos.x - fromX, dz = this.pos.z - fromZ;
      const d = Math.hypot(dx, dz) || 1;
      // (netherite armour is heavy: each piece takes a tenth off how far a blow throws you)
      const steady = 1 - this.armor.reduce((n, a) => n + (a && ITEMS[a.id].armor ? ITEMS[a.id].armor.steady || 0 : 0), 0);
      this.vel.x += (dx / d) * 6 * steady;
      this.vel.z += (dz / d) * 6 * steady;
      this.vel.y = Math.max(this.vel.y, 5.5 * steady);
      // Tilt the view away from the hit, the way the original's hurt camera does
      const right = { x: Math.cos(this.yaw), z: -Math.sin(this.yaw) };
      this.hurtRoll = (right.x * -dx + right.z * -dz) > 0 ? -1 : 1;
    }
    G.ui.onHurt(amount);
    G.ui.invChanged();
    if (this.health <= 0) this.die(kind);
  }

  die(kind) {
    if (this.riding) this.dismount();
    if (G.adv) G.adv.died();
    this.dead = true;
    this.health = 0;
    this.mining = null;
    this.eating = null;
    if (!this.creative) {
      const all = [...this.inv.slots, ...this.armor, ...this.off];
      for (const s of all) {
        // (anything with the Curse of Vanishing is gone for good)
        if (s && !ench(s, 'vanishing_curse')) G.entities.dropShared(s.id, s.count, this.pos.x, this.pos.y + 1, this.pos.z, (Math.random() - 0.5) * 6, 3 + Math.random() * 3, (Math.random() - 0.5) * 6, s.dmg, s.e);
      }
      this.inv.clear();
      this.armor = [null, null, null, null];
      this.off[0] = null;
      // some of your experience is left where you fell
      const lost = Math.min(100, this.xpLevel * 7);
      this.xpLevel = 0; this.xp = 0;
      if (lost) G.entities.spawnXp(this.pos.x, this.pos.y + 0.5, this.pos.z, lost, 4);
    }
    const msgs = { skull: 'The Wither struck you down', lava: 'You tried to swim in lava', fireball: 'You were fireballed', wither: 'You withered away', fall: 'You hit the ground too hard', drown: 'You drowned', starve: 'You starved to death', void: 'You fell out of the world', explosion: 'You blew up', fire: 'You burned to death', magic: 'You were killed by magic', arrow: 'You were shot', pearl: 'You hit the ground too hard' };
    if (kind === 'player' && this.lastAttacker) msgs.player = `You were slain by ${this.lastAttacker}`;
    if (kind === 'admin') msgs.admin = `You were killed by ${this.lastAttacker || 'an admin'}`;
    msgs.cactus = 'You were pricked to death';
    G.ui.showDeath(msgs[kind] || 'You were slain');
    if (G.net) {
      const told = { skull: 'was struck down by the Wither', lava: 'tried to swim in lava', fireball: 'was fireballed', wither: 'withered away', fall: 'hit the ground too hard', drown: 'drowned', starve: 'starved to death', void: 'fell out of the world', explosion: 'blew up', fire: 'burned to death', magic: 'was killed by magic', arrow: 'was shot', pearl: 'hit the ground too hard' };
      if (kind === 'player' && this.lastAttacker) told.player = `was slain by ${this.lastAttacker}`;
      if (kind === 'admin') told.admin = `was killed by ${this.lastAttacker || 'an admin'}`;
      told.cactus = 'was pricked to death';
      G.net.announce(`${G.net.name} ${told[kind] || 'was slain'}`);
    }
  }

  respawn() {
    this.dead = false;
    this.health = 20;
    this.food = 20;
    this.saturation = 5;
    this.exhaustion = 0;
    this.hungerEffect = 0;
    this.effects = { poison: 0, slow: 0, wither: 0, levitation: 0 };
    this.burning = 0;
    this.shieldUp = this.blocking = false;
    this.air = 15;
    this.fallDist = 0;
    this.vel = { x: 0, y: 0, z: 0 };
    this.pos = { ...this.spawn };
    // Wake up next to your bed if it is still there
    if (this.bedSpawn) {
      const b = this.bedSpawn;
      if (BLOCKS[G.world.getBlock(b.x, b.y, b.z)].bed || !G.world.getChunk(b.x >> 4, b.z >> 4)) this.pos = { x: b.x + 0.5, y: b.y + 1, z: b.z + 0.5 };
      else { this.bedSpawn = null; G.ui.toast('Your home bed was missing or obstructed'); }
    }
    this.frozen = true;
    this.flying = false;
  }

  // ------------------------------------------------------------ camera
  // How far the camera can stand off from your eyes along a line before something solid is in its way
  viewRoom(x, y, z, dx, dy, dz, want) {
    let room = want;
    const solid = (id) => BLOCKS[id].solid;
    for (let i = 0; i < 8; i++) {
      const hit = raycast(G.world, x + (i & 1 ? 0.1 : -0.1), y + (i & 2 ? 0.1 : -0.1), z + (i & 4 ? 0.1 : -0.1), dx, dy, dz, want, solid);
      if (hit && hit.dist < room) room = hit.dist;
    }
    return Math.max(0, room - 0.12);
  }

  // You see from your own eyes, or from outside: from behind (third person), or from in front, looking
  // back at yourself (second person)
  updateCamera(dt) {
    const cam = R.camera;
    const view = this.spectator ? 'first' : (G.settings.view || 'first');
    const outside = view === 'third' || view === 'second';
    this.outside = outside;
    const bob = G.settings.viewBob ? this.bobAmt : 0;
    const bx = outside ? 0 : Math.sin(this.bob * Math.PI) * 0.045 * bob;
    const by = outside ? 0 : Math.abs(Math.cos(this.bob * Math.PI)) * 0.07 * bob;
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    let shakeX = 0, shakeY = 0;
    if (G.shake > 0) {
      G.shake = Math.max(0, G.shake - dt * 1.5);
      shakeX = (Math.random() - 0.5) * G.shake * 0.4;
      shakeY = (Math.random() - 0.5) * G.shake * 0.4;
    }
    cam.position.set(this.pos.x + cy * bx + shakeX, this.eyeY + by - (outside ? 0 : 0.05 * bob) + shakeY, this.pos.z - sy * bx);
    // Hurt camera: a quick roll that eases back
    const f = this.hurtTime / HURT_TIME;
    const roll = this.dead && !outside ? 0.6 : Math.sin(Math.pow(f, 4) * Math.PI) * 0.24 * this.hurtRoll * (outside ? 0.4 : 1);
    cam.rotation.set(this.pitch, this.yaw, roll);
    let room = 0;
    if (outside) {
      const d = this.lookDir(), k = view === 'third' ? -1 : 1;
      const ex = this.pos.x, ey = this.dead ? this.pos.y + 0.6 : this.eyeY, ez = this.pos.z;
      room = this.viewRoom(ex, ey, ez, d.x * k, d.y * k, d.z * k, 4);
      cam.position.set(ex + d.x * k * room + shakeX, ey + d.y * k * room + shakeY, ez + d.z * k * room);
      if (view === 'second') cam.rotation.set(-this.pitch, this.yaw + Math.PI, roll);
    }
    // (lamps cast their shadows by where you are, not where the camera has been put)
    if (!R.lampEye) R.lampEye = { x: 0, y: 0, z: 0 };
    R.lampEye.x = this.pos.x; R.lampEye.y = this.eyeY; R.lampEye.z = this.pos.z;
    // what the camera is in: water and lava are seen through from inside
    if (outside) {
      const id = G.world.getBlock(Math.floor(cam.position.x), Math.floor(cam.position.y), Math.floor(cam.position.z));
      this.camInWater = id === B.water; this.camInLava = id === B.lava;
    } else { this.camInWater = this.headInWater; this.camInLava = this.headInLava; }
    const fov = G.settings.fov * (1 + this.fovKick * 0.12) * (this.camInWater ? 0.9 : 1);
    if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
    if (this.dead && !outside && this.pos.y > -60) cam.position.y = this.pos.y + 0.3;
    const [s, b] = G.world.getLight(Math.floor(this.pos.x), Math.floor(this.eyeY), Math.floor(this.pos.z));
    updateHand(dt, brightness(s, b), this.bob * Math.PI, bob, this.eating ? this.eating.t : -1, this.shieldHand || 0);
    R.handHolder.visible = !this.dead && !outside;
    // (your own body, unless the camera has been pushed right up against it)
    this.body.update(dt, this, outside && room > 0.7);
  }
}
