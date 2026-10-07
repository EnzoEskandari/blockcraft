// HUD, menus and inventory screens (plain DOM).
import { UPDATES, LATEST } from './updates.js';
import { G, saveSettings } from './game.js';
import { BLOCKS, ITEMS, ID, B, maxStack, itemName, matchRecipe, fuelValue, SMELTING, creativeList, RECIPES, inTag } from './blocks.js';
import { iconURL, ICONS, drawAscii, TILES, TEX, armorSilhouette, shieldSilhouette } from './textures.js';
import { PROFESSIONS, LEVEL_NAMES, levelProgress } from './villagers.js';
import { ADV, TABS } from './advancements.js';
import { structuresNear, treasureAt } from './structures.js';
import { SEA, BIOME } from './constants.js';
import { sameItem, stack, craftableTimes, takeIngredients } from './inventory.js';
import { isEnchanted, enchList, enchLine, ENCH, xpForLevel, enchantability, tableLevels, tableOffer, enchanted, anvil, grind, repairItem, countShelves } from './enchant.js';
import { requestLock, exitLock, setTouchMode, resetTouch } from './input.js';
import { sfx, setVolume, initAudio } from './audio.js';
import { BIOME_NAMES } from './world.js';
import { DIM_BIOME_NAMES } from './dims.js';

const $ = (id) => document.getElementById(id);
const h = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};

const CONTAINERS = ['inventory', 'crafting', 'furnace', 'chest', 'trade', 'enchant', 'anvil', 'grind'];
const TEMP = ['enchant', 'anvil', 'grind'];   // screens whose slots only hold things while they are open
const SPLASHES = ['Now on iPad!', 'Punch a tree!', 'Made of blocks!', 'Mind the Boomers!', '100% procedural!', 'Try the caves!', 'Smooth lighting!', 'Hold to mine!', 'Seeds are fun!'];

// ---------------------------------------------------------------- pixel icons for the HUD
const HEART = ['.OO...OO.', 'OHHO.OHHO', 'OHLHOHHHO', 'OHHHHHHHO', 'OHHHHHHHO', '.OHHHHHO.', '..OHHHO..', '...OHO...', '....O....'];
const FOOD = ['......OO.', '.....OBBO', '....OBBO.', '..OOOBO..', '.OMMMO...', 'OMMLMMO..', 'OMMMMO...', 'OMMMO....', '.OOO.....'];
const ARMOR_ICON = ['OOO...OOO', 'OHHOOOHHO', 'OHLHHHHhO', '.OLHHHhO.', '.OHHHHhO.', '.OHHHHhO.', '.OHHHHhO.', '.OhhhhhO.', '.OOOOOOO.'];
const BUBBLE = ['..OOOOO..', '.OLLHHHO.', 'OLLHHHHHO', 'OLHHHHHHO', 'OHHHHHHHO', 'OHHHHHHHO', 'OHHHHHHHO', '.OHHHHHO.', '..OOOOO..'];

function iconSet(art, full, empty) {
  const half = art.map((row) => row.split('').map((c, x) => (x < 5 ? c : c === 'O' ? c : c.toLowerCase())).join(''));
  const pal = { ...full };
  for (const [k, v] of Object.entries(empty)) pal[k.toLowerCase()] = v;
  return {
    full: drawAscii(art, full, 9).toDataURL(),
    half: drawAscii(half, pal, 9).toDataURL(),
    empty: drawAscii(art, { O: full.O, ...empty }, 9).toDataURL(),
  };
}

export class UI {
  constructor() {
    this.stack = [];
    this.cursor = null;
    this.hudDirty = true;
    this.slotEls = [];
    this.craft = null;
    this.container = null;
    this.hudCache = {};
    this.toastTimer = 0;
    this.fps = 0;
    this.frames = 0;
    this.fpsTime = 0;
    this.blinkTime = 0;
    this.blinkFrom = 0;
    this.book = null;
    this.recipeFilter = 'craftable';
  }

  // Lost hearts blink white for a moment after taking damage
  onHurt(amount) {
    const p = G.player;
    this.blinkFrom = Math.min(20, Math.ceil(p.health + amount));
    this.blinkTime = 0.72;
  }

  init() {
    const hi = iconSet(HEART, { O: [16, 0, 0], H: [222, 26, 26], L: [255, 190, 190] }, { H: [52, 14, 14], L: [52, 14, 14] });
    const hf = iconSet(HEART, { O: [255, 255, 255], H: [240, 60, 60], L: [255, 220, 220] }, { H: [70, 24, 24], L: [70, 24, 24] });
    const fi = iconSet(FOOD, { O: [30, 16, 6], B: [232, 232, 222], M: [176, 102, 48], L: [214, 144, 84] }, { B: [70, 60, 52], M: [52, 30, 16], L: [52, 30, 16] });
    const bi = drawAscii(BUBBLE, { O: [30, 60, 140], L: [240, 250, 255], H: [110, 170, 250] }, 9).toDataURL();
    const ai = iconSet(ARMOR_ICON, { O: [30, 30, 30], H: [214, 214, 214], L: [255, 255, 255], h: [140, 140, 140] }, { H: [60, 60, 60], L: [60, 60, 60], h: [60, 60, 60] });
    this.armorIcons = [0, 1, 2, 3].map((i) => armorSilhouette(i));
    const css = `
      .heart{background-image:url(${hi.empty})} .heart.full{background-image:url(${hi.full})} .heart.half{background-image:url(${hi.half})}
      #hearts.flash .heart{background-image:url(${hf.empty})} #hearts.flash .heart.full{background-image:url(${hf.full})} #hearts.flash .heart.half{background-image:url(${hf.half})}
      .food{background-image:url(${fi.empty})} .food.full{background-image:url(${fi.full})} .food.half{background-image:url(${fi.half})}
      .bubble{background-image:url(${bi})}
      .armor-icon{background-image:url(${ai.empty})} .armor-icon.full{background-image:url(${ai.full})} .armor-icon.half{background-image:url(${ai.half})}
      :root{--stone:url(${TILES[TEX.stone].toDataURL()});--dirt:url(${TILES[TEX.dirt].toDataURL()})}
      .logo{background-image:var(--stone)}`;
    const st = document.createElement('style');
    st.textContent = css;
    document.head.appendChild(st);

    // HUD
    const hearts = $('hearts'), food = $('food'), bubbles = $('bubbles'), armorBar = $('armor-bar');
    for (let i = 0; i < 10; i++) {
      armorBar.appendChild(h('i', 'armor-icon'));
      hearts.appendChild(h('i', 'heart'));
      food.appendChild(h('i', 'food'));
      bubbles.appendChild(h('i', 'bubble'));
    }
    // the off hand: tap or click it to swap hands (F on a keyboard)
    this.shieldIcon = shieldSilhouette();
    const offEl = $('offhand');
    offEl.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (G.state !== 'playing' || G.screen) return;
      G.player.swapHands();
    });
    $('t-shield').style.backgroundImage = `url(${iconURL(ID.shield)})`;
    const bar = $('hotbar');
    for (let i = 0; i < 9; i++) {
      const s = h('div', 'slot');
      s.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        if (G.state !== 'playing' || G.screen) return;
        G.player.inv.selected = i;
        this.invChanged(true);
      });
      bar.appendChild(s);
      this.slotEls.push(s);
    }

    // Menus
    // the newest update's own splash lines come up most of the time
    const lines = Math.random() < 0.7 && LATEST.splashes ? LATEST.splashes : SPLASHES;
    $('splash').textContent = lines[(Math.random() * lines.length) | 0];
    $('version').textContent = `Blockcraft ${LATEST.version}`;
    $('b-update').textContent = `New: the ${LATEST.name} Update!`;
    const on = (id, fn) => $(id).addEventListener('click', (e) => { e.preventDefault(); initAudio(); sfx('click'); fn(); });
    on('b-update', () => this.openScreen('news'));
    on('b-version', () => this.openScreen('news'));
    on('b-news-back', () => this.back());
    on('b-single', () => this.openScreen('worlds'));
    on('b-multi', () => this.openScreen('mp'));
    on('b-mp-back', () => this.back());
    on('b-join', () => this.playOnline());
    $('mp-code-form').addEventListener('submit', (e) => { e.preventDefault(); initAudio(); sfx('click'); this.joinCode(); });
    on('b-new-online', () => { if (this.signedIn()) { this.createOnline = true; this.openScreen('create'); } });
    $('mp-auth').addEventListener('submit', (e) => { e.preventDefault(); initAudio(); sfx('click'); this.auth(false); });
    on('b-sign-up', () => this.auth(true));
    on('b-sign-out', async () => { await G.game.signOut(); this.syncAccount(); this.mpStatus('Signed out.'); });
    on('b-admin', () => this.openScreen('admin'));
    on('b-sign-done', () => this.back());
    on('b-map-done', () => this.back());
    document.querySelectorAll('.sign-line').forEach((el, i, all) => el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === 'ArrowDown') { e.preventDefault(); if (i < all.length - 1) all[i + 1].focus(); else if (e.key === 'Enter') this.back(); }
      else if (e.key === 'ArrowUp' && i > 0) { e.preventDefault(); all[i - 1].focus(); }
      else if (e.key === 'Escape') { e.preventDefault(); this.back(); }
    }));
    on('b-admin-back', () => this.back());
    on('b-admin-kill', () => this.adminDo('kill'));
    on('b-admin-kick', () => this.adminDo('kick'));
    on('b-admin-ban', () => this.adminDo(this.adminSel && this.adminSel.banned ? 'unban' : 'ban'));
    on('b-admin-op', () => this.adminDo(this.adminSel && this.adminSel.admin ? 'deop' : 'op'));
    on('b-copy-link', () => this.copyLink(this.selectedOnline));
    on('b-copy-link-pause', () => this.copyLink(G.worldMeta && G.worldMeta.online));
    on('b-delete-online', () => this.askDeleteOnline());
    on('b-confirm-delete-online', () => this.confirmDeleteOnline(false));
    on('b-remove-online', () => this.confirmDeleteOnline(true));
    on('b-cancel-delete-online', () => { $('online-delete-confirm').hidden = true; });
    $('chat-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const inp = $('chat-input');
      if (G.net) G.net.say(inp.value);
      inp.value = '';
      this.back();
    });
    $('chat-input').addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); this.back(); return; }
      // Tab takes the first suggestion (or the next one, pressed again)
      const hints = [...$('chat-hints').children];
      if (e.key === 'Tab' && hints.length) { e.preventDefault(); hints[0].click(); }
    });
    $('chat-input').addEventListener('input', () => this.chatHints());
    $('chat-input').addEventListener('focus', () => this.chatHints());
    $('t-chat').addEventListener('click', (e) => { e.preventDefault(); if (G.net && !G.screen) this.openScreen('chat'); });
    on('b-options', () => this.openScreen('options'));
    on('b-help', () => this.openScreen('help'));
    on('b-help-back', () => this.back());
    on('b-play-world', () => this.playSelected());
    on('b-new-world', () => { this.createOnline = false; this.openScreen('create'); });
    on('b-delete-world', () => this.askDelete());
    on('b-backup-world', () => this.backupSelected());
    on('b-import-world', () => $('import-file').click());
    $('import-file').addEventListener('change', (e) => this.importFile(e.target.files && e.target.files[0]));
    on('b-worlds-back', () => this.back());
    on('b-busy-cancel', () => { if (this.onBusyCancel) this.onBusyCancel(); });
    on('b-confirm-delete', () => this.confirmDelete());
    on('b-cancel-delete', () => { $('delete-confirm').hidden = true; });
    on('b-mode', () => {
      const b = $('b-mode');
      b.dataset.mode = b.dataset.mode === 'creative' ? 'survival' : 'creative';
      b.textContent = 'Game Mode: ' + (b.dataset.mode === 'creative' ? 'Creative' : 'Survival');
      $('mode-note').textContent = b.dataset.mode === 'creative'
        ? 'Unlimited blocks, free flying, no damage'
        : 'Gather resources, craft, stay alive';
    });
    on('b-create', () => {
      if (this.createOnline) { this.createOnlineWorld(); return; }
      const name = $('world-name').value.trim() || 'New World';
      G.game.createWorld(name, $('world-seed').value.trim(), $('b-mode').dataset.mode);
    });
    on('b-create-cancel', () => this.back());
    on('b-options-done', () => this.back());
    on('b-resume', () => this.back());
    on('b-pause-options', () => this.openScreen('options'));
    on('b-pause-adv', () => this.openScreen('adv'));
    on('b-pause-mode', () => { G.game.toggleMode(); this.closeAll(); requestLock(); });
    on('b-adv-close', () => this.back());
    on('b-quit', () => G.game.quitToTitle());
    on('b-respawn', () => G.game.respawn());
    on('b-death-title', () => G.game.quitToTitle());

    const sc = $('s-container');
    sc.addEventListener('pointerdown', (e) => {
      const outside = e.target === sc || e.target.classList.contains('container-wrap');
      if (outside && this.cursor) { this.dropCursor(); this.refreshContainer(); }
      else if (outside && !this.cursor && e.pointerType === 'touch') this.back();
    });
    document.addEventListener('pointermove', (e) => this.moveCursor(e.clientX, e.clientY));
    this.buildOptions();
    this.updateTouchVisibility();
  }

  // ---------------------------------------------------------------- screens
  section(name) {
    const map = { inventory: 'container', crafting: 'container', furnace: 'container', chest: 'container', creative: 'container', trade: 'container', enchant: 'container', anvil: 'container', grind: 'container' };
    const id = 's-' + (map[name] || name);
    for (const s of document.querySelectorAll('.screen')) s.hidden = s.id !== id;
    const chat = name === 'chat';
    $('chat-form').hidden = !chat;
    $('chat-log').classList.toggle('open', chat);
    if (chat) { this.allNames = null; this.namesAsked = false; $('chat-hints').hidden = true; $('chat-input').focus(); }   // right away, so iPad keyboards open from the tap
    else if (document.activeElement === $('chat-input')) $('chat-input').blur();
  }

  isInventoryScreen() { return CONTAINERS.includes(G.screen); }

  openScreen(name, data) {
    if (name === 'creative') name = 'inventory';
    if (G.screen === name && !CONTAINERS.includes(name)) return;
    if (G.screen) {
      if (CONTAINERS.includes(G.screen)) this.closeContainer();
      else this.stack.push(G.screen);
    }
    G.screen = name;
    if (CONTAINERS.includes(name)) this.buildContainer(name, data);
    if (name === 'worlds') this.buildWorldList();
    if (name === 'options') this.syncOptions();
    if (name === 'news') this.buildNews();
    if (name === 'admin') this.buildAdminList();
    if (name === 'adv') this.buildAdv();
    if (name === 'sign') this.openSign(data);
    if (name === 'map') this.openMap(data);
    if (name === 'pause') this.syncPause();
    if (name === 'mp') {
      this.mpStatus('');
      this.syncAccount();
      // make sure the saved sign-in still works
      G.game.checkAccount().then(() => { if (G.screen === 'mp') this.syncAccount(false); });
    }
    if (name === 'create') {
      $('world-name').value = this.createOnline ? 'Online World' : 'New World';
      $('world-seed').value = '';
      document.querySelector('#s-create h2').textContent = this.createOnline ? 'Create Online World' : 'Create New World';
      $('b-create').textContent = this.createOnline ? 'Create Online World' : 'Create New World';
    }
    this.section(name);
    if (G.state === 'playing') exitLock();
    this.updateTouchVisibility();
    this.hideTooltip();
  }

  // ---------------------------------------------------------------- command suggestions
  // Typing / in the chat brings up the commands, and after a command the players it could be about;
  // a click (or Tab) finishes the word
  chatHints() {
    const box = $('chat-hints'), inp = $('chat-input'), text = inp.value;
    box.textContent = '';
    box.hidden = true;
    if (text[0] !== '/') return;
    const admin = !!(G.account && G.account.admin);
    const CMDS = admin ? [['where', 'where a player is', 1], ['tp', 'go to a player', 1], ['bring', 'fetch a player to you', 1], ['creative', 'creative mode'], ['survival', 'survival mode'],
      ['kill', 'kill a player', 1], ['kick', 'send a player out', 1], ['ban', 'ban a player', 1], ['unban', 'let a player back', 1], ['op', 'make a player an admin', 1], ['deop', 'take admin away', 1],
      ['players', 'everyone online'], ['accounts', 'every account'], ['list', 'who is here'], ['help', 'all the commands']]
      : [['list', 'who is here'], ['help', 'the commands']];
    const m = text.match(/^\/(\S*)(\s+(\S*))?$/);
    if (!m) return;
    let items;
    if (m[2] === undefined) {
      items = CMDS.filter(([c]) => c.startsWith(m[1].toLowerCase())).map(([c, about, takesName]) => ({ label: '/' + c, about, value: '/' + c + (takesName ? ' ' : ''), send: !takesName && c === m[1].toLowerCase() }));
    } else {
      const cmd = CMDS.find(([c]) => c === m[1].toLowerCase());
      if (!cmd || !cmd[2]) return;
      // the players here first, then (for an admin) every account on the server
      const here = G.net ? [...G.net.players.values()].filter((a) => !a.hidden).map((a) => a.name).filter(Boolean) : [];
      if (admin && !this.allNames && !this.namesAsked) { this.namesAsked = true; G.game.adminPlayers().then((l) => { this.allNames = l.map((x) => x.name); if (G.screen === 'chat') this.chatHints(); }, () => { this.namesAsked = false; }); }
      const names = [...new Set([...here, ...(this.allNames || [])])].filter((n) => n !== (G.account && G.account.name));
      const part = (m[3] || '').toLowerCase();
      items = names.filter((n) => n.toLowerCase().startsWith(part)).slice(0, 12).map((n) => ({ label: n, about: here.includes(n) ? 'here' : '', value: `/${cmd[0]} ${n}` }));
      if (items.length === 1 && items[0].label.toLowerCase() === part) return;
    }
    if (!items.length) return;
    for (const it of items) {
      const b = h('button', null, it.label);
      b.type = 'button';
      if (it.about) b.appendChild(h('small', null, it.about));
      // (pointerdown, so the keyboard stays up on an iPad)
      b.addEventListener('pointerdown', (e) => e.preventDefault());
      b.addEventListener('click', () => { inp.value = it.value; inp.focus(); this.chatHints(); });
      box.appendChild(b);
    }
    box.hidden = false;
  }

  // ---------------------------------------------------------------- treasure maps
  // The land round a buried treasure seen from above (two blocks to the dot, north at the top), a red
  // cross where it lies, and a marker for you that turns as you turn
  openMap(data) {
    const spot = treasureAt(G.world, data && data.code);
    const g = $('map-canvas').getContext('2d');
    g.fillStyle = '#d8c698'; g.fillRect(0, 0, 128, 128);
    this.map = { spot, row: 0, img: spot ? g.getImageData(0, 0, 128, 128) : null };
    if (!spot) $('map-note').textContent = G.dim === 'overworld' ? 'The ink has faded. This map shows nowhere in this world.' : 'This map shows a place in the Overworld.';
    const tick = () => { if (G.screen !== 'map') return; this.drawMap(); requestAnimationFrame(tick); };
    tick();
  }

  drawMap(rows = 6) {
    const M = this.map;
    if (!M || !M.spot) return;
    const g = $('map-canvas').getContext('2d'), w = G.world, d = M.img.data, sp = M.spot;
    // the land is drawn in a few rows at a time, so opening the map never makes the game stutter
    for (let n = 0; n < rows && M.row < 128; n++, M.row++) {
      const j = M.row, wz = sp.z + (j - 64) * 2;
      for (let i = 0; i < 128; i++) {
        const wx = sp.x + (i - 64) * 2;
        const c = w.column(wx, wz), b = c.biome;
        let col;
        if (c.h < SEA) { const k = Math.min(1, (SEA - c.h) / 16); col = b === BIOME.FROZEN_OCEAN ? [176, 204, 232] : [92 - 36 * k, 132 - 44 * k, 196 - 30 * k]; }
        else if (b === BIOME.BEACH || b === BIOME.DESERT || c.h <= SEA + 1) col = [226, 212, 158];
        else if (b === BIOME.BADLANDS) col = [196, 110, 62];
        else if (b === BIOME.SNOWY || b === BIOME.ICE_SPIKES || b === BIOME.SNOWY_TAIGA || b === BIOME.SNOWY_PEAKS) col = [236, 240, 244];
        else if (b === BIOME.MOUNTAINS) col = [150, 148, 144];
        else if (b === BIOME.MUSHROOM) col = [150, 122, 156];
        else if (b === BIOME.SAVANNA) col = [176, 170, 86];
        else if (b === BIOME.CHERRY_GROVE) col = [226, 164, 190];
        else if (b === BIOME.FOREST || b === BIOME.DARK_FOREST || b === BIOME.JUNGLE || b === BIOME.BAMBOO || b === BIOME.BIRCH_FOREST || b === BIOME.TAIGA || b === BIOME.OLD_TAIGA || b === BIOME.SWAMP) col = [84, 136, 70];
        else col = [130, 176, 92];
        // higher ground is lighter, and slopes facing north are in shade
        const sh = c.h < SEA ? 1 : Math.max(0.78, Math.min(1.16, 0.94 + (c.h - SEA) / 260 + (c.h - w.column(wx, wz - 2).h) * 0.05));
        const o = (j * 128 + i) * 4;
        // (inked on parchment: every colour leans a little towards the paper)
        d[o] = col[0] * sh * 0.82 + 216 * 0.18; d[o + 1] = col[1] * sh * 0.82 + 198 * 0.18; d[o + 2] = col[2] * sh * 0.82 + 152 * 0.18; d[o + 3] = 255;
      }
    }
    g.putImageData(M.img, 0, 0);
    // the cross
    g.strokeStyle = '#c01818'; g.lineWidth = 2.4; g.lineCap = 'round';
    g.beginPath(); g.moveTo(59, 59); g.lineTo(69, 69); g.moveTo(69, 59); g.lineTo(59, 69); g.stroke();
    const p = G.player;
    if (!p) return;
    const dx = p.pos.x - sp.x, dz = p.pos.z - sp.z, dist = Math.hypot(dx, dz);
    const note = $('map-note');
    let text;
    if (G.dim !== 'overworld') text = 'This map shows a place in the Overworld.';
    else if (dist < 5) text = 'You are standing on the cross. Dig straight down!';
    else {
      const ang = Math.atan2(-dx, dz) * 4 / Math.PI;   // which way the treasure lies from you
      const way = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'][((Math.round(ang) % 8) + 8) % 8];
      text = `The treasure is ${Math.round(dist)} blocks to the ${way}.`;
    }
    if (note.textContent !== text) note.textContent = text;
    if (G.dim !== 'overworld') return;
    // you: an arrowhead, kept on the sheet when you are off the edge of it
    const mx = Math.max(4, Math.min(124, 64 + dx / 2)), my = Math.max(4, Math.min(124, 64 + dz / 2));
    g.save();
    g.translate(mx, my);
    g.rotate(Math.atan2(-Math.sin(p.yaw), Math.cos(p.yaw)));
    g.beginPath(); g.moveTo(0, -4.5); g.lineTo(3.4, 3.6); g.lineTo(0, 1.8); g.lineTo(-3.4, 3.6); g.closePath();
    g.fillStyle = '#fff'; g.strokeStyle = '#202020'; g.lineWidth = 1; g.fill(); g.stroke();
    g.restore();
  }

  // ---------------------------------------------------------------- achievements
  // The note that slides in at the top right when one is made (they wait their turn)
  achievement(a) {
    (this.advQueue || (this.advQueue = [])).push(a);
    if (!this.advShowing) this.nextAchievement();
  }
  nextAchievement() {
    const a = this.advQueue.shift(), el = $('adv-toast');
    this.advShowing = !!a;
    if (!a) { el.hidden = true; return; }
    $('adv-toast-icon').src = iconURL(ID[a.icon]);
    $('adv-toast-head').textContent = a.hard ? 'Challenge complete!' : 'Achievement made!';
    $('adv-toast-title').textContent = a.title;
    el.classList.toggle('hard', !!a.hard);
    el.hidden = true; void el.offsetWidth; el.hidden = false;   // (start the slide again)
    clearTimeout(this.advTimer);
    this.advTimer = setTimeout(() => this.nextAchievement(), 4200);
  }

  // The list: a tab for each part of the game, what is done in green, and how far along the long ones are
  buildAdv(tab) {
    const p = G.player;
    if (!p) return;
    this.advTab = tab || this.advTab || TABS[0][0];
    const done = ADV.filter((a) => p.adv.has(a.key)).length;
    $('adv-title').textContent = `Achievements · ${done} of ${ADV.length}`;
    const tabs = $('adv-tabs'), list = $('adv-list');
    tabs.innerHTML = ''; list.innerHTML = '';
    for (const [key, name] of TABS) {
      const of = ADV.filter((a) => a.tab === key);
      const b = h('button', 'adv-tab' + (key === this.advTab ? ' sel' : ''), `${name} ${of.filter((a) => p.adv.has(a.key)).length}/${of.length}`);
      b.type = 'button';
      b.addEventListener('click', () => { sfx('click', null, { vol: 0.4 }); this.buildAdv(key); });
      tabs.appendChild(b);
    }
    for (const a of ADV.filter((q) => q.tab === this.advTab)) {
      const got = p.adv.has(a.key);
      const row = h('div', 'adv-row' + (got ? ' done' : '') + (a.hard ? ' hard' : ''));
      const img = document.createElement('img');
      img.src = iconURL(ID[a.icon]); img.alt = '';
      row.appendChild(img);
      const txt = h('div');
      txt.appendChild(h('div', 't', a.title));
      let desc = a.desc;
      if (a.all && !got) {
        // the long ones say what is still to do
        const [n, of] = G.adv.progress(a);
        const left = G.adv.missing(a).map(a.names);
        desc += ` (${n} of ${of}${left.length && left.length <= 8 ? ': still ' + left.join(', ') : ''})`;
      }
      txt.appendChild(h('div', 'd', desc));
      row.appendChild(txt);
      row.appendChild(h('div', 'x', got ? 'Done' : `${a.xp} experience`));
      list.appendChild(row);
    }
  }

  // Writing on a sign: the words are saved whenever the editor closes
  openSign(at) {
    this.signAt = at;
    const lines = G.game.signText(at.x, at.y, at.z);
    const inputs = document.querySelectorAll('.sign-line');
    inputs.forEach((el, i) => { el.value = lines[i] || ''; });
    setTimeout(() => { if (G.screen === 'sign') inputs[0].focus(); }, 0);
  }

  saveSign() {
    const at = this.signAt;
    this.signAt = null;
    if (!at) return;
    G.game.setSign(at.x, at.y, at.z, [...document.querySelectorAll('.sign-line')].map((el) => el.value.trim()));
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  }

  back() {
    const cur = G.screen;
    if (cur === 'death' || cur === 'credits' || cur === 'busy') return;
    if (cur === 'sign') this.saveSign();
    if (CONTAINERS.includes(cur)) this.closeContainer();
    const prev = this.stack.pop();
    if (prev) {
      G.screen = prev;
      if (prev === 'worlds') this.buildWorldList();
      this.section(prev);
    } else if (G.state === 'title') {
      G.screen = 'title';
      this.section('title');
    } else {
      G.screen = null;
      this.section(null);
      if (!G.touchMode) requestLock();
    }
    this.updateTouchVisibility();
    this.hideTooltip();
  }

  closeAll() {
    if (CONTAINERS.includes(G.screen)) this.closeContainer();
    this.stack.length = 0;
    G.screen = null;
    this.section(null);
    this.updateTouchVisibility();
  }

  showTitle() {
    this.stack.length = 0;
    G.screen = 'title';
    this.section('title');
    $('hud').hidden = true;
    this.updateTouchVisibility();
    if (G.startPanorama) G.startPanorama();
  }

  // Every update, newest first
  buildNews() {
    const list = $('news-list');
    list.innerHTML = '';
    for (const u of UPDATES) {
      const box = h('div', 'news-item');
      box.appendChild(h('h3', null, `${u.version} · ${u.name}`));
      box.appendChild(h('span', 'news-date', new Date(u.date + 'T12:00:00').toLocaleDateString([], { year: 'numeric', month: 'long', day: 'numeric' })));
      const ul = h('ul');
      for (const n of u.notes) ul.appendChild(h('li', null, n));
      box.appendChild(ul);
      list.appendChild(box);
    }
    list.scrollTop = 0;
  }

  showLoading(p) {
    this.section('loading');
    $('b-busy-cancel').hidden = true;
    const online = G.worldMeta && G.worldMeta.online;
    $('load-title').textContent = online ? 'Loading world' : 'Generating world';
    $('load-sub').textContent = online ? G.worldMeta.name : 'Building terrain';
    $('load-bar').style.width = Math.round(p * 100) + '%';
  }

  showDeath(msg) {
    $('death-msg').textContent = msg;
    this.stack.length = 0;
    if (CONTAINERS.includes(G.screen)) this.closeContainer();
    G.screen = 'death';
    this.section('death');
    exitLock();
    this.updateTouchVisibility();
  }

  startPlaying() {
    this.stack.length = 0;
    G.screen = null;
    this.section(null);
    $('hud').hidden = false;
    this.hudDirty = true;
    this.hudCache = {};
    resetTouch();
    this.updateTouchVisibility();
  }

  hideClickToPlay() { $('click-to-play').hidden = true; }

  portalOverlay(a) {
    const el = $('portal-overlay');
    el.style.opacity = (a * 0.9).toFixed(2);
  }

  // The ending, after stepping into the exit portal: scrolls by, then you are home
  showCredits(onDone) {
    this.stack.length = 0;
    if (CONTAINERS.includes(G.screen)) this.closeContainer();
    G.screen = 'credits';
    this.section('credits');
    this.updateTouchVisibility();
    const el = $('credits-scroll');
    const start = performance.now();
    const H = () => el.scrollHeight;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      cancelAnimationFrame(this.creditsRaf);
      $('b-credits-skip').onclick = null;
      G.screen = null;
      this.section(null);
      onDone();
    };
    const tick = () => {
      const t = (performance.now() - start) / 1000;
      const y = window.innerHeight - t * 38;
      el.style.transform = `translateY(${y}px)`;
      if (y < -H() + window.innerHeight * 0.4) { finish(); return; }
      this.creditsRaf = requestAnimationFrame(tick);
    };
    tick();
    $('b-credits-skip').onclick = (e) => { e.preventDefault(); sfx('click'); finish(); };
  }

  sleepOverlay(a) {
    const el = $('sleep');
    el.hidden = a <= 0;
    el.style.opacity = a.toFixed(2);
  }

  updateTouchVisibility() {
    const show = G.touchMode && G.state === 'playing' && !G.screen;
    $('touch-ui').hidden = !show;
    $('t-chat').hidden = !G.net;
    document.body.classList.toggle('touch', G.touchMode);
  }

  // ---------------------------------------------------------------- multiplayer
  mpStatus(text) { $('mp-status').textContent = text || ''; }

  onlineLink(id) { return `${location.origin}${location.pathname}?world=${id}`; }

  // Online worlds live on the server, each with a link that never changes
  async buildOnlineList() {
    const list = $('online-list');
    $('online-delete-confirm').hidden = true;
    list.innerHTML = '';
    list.appendChild(h('p', 'empty', 'Loading online worlds…'));
    $('mp-storage').textContent = '';
    this.online = [];
    this.syncOnlineButtons();
    let res;
    try { res = await G.game.listOnline(); } catch (err) {
      list.innerHTML = '';
      list.appendChild(h('p', 'empty', err && err.message ? err.message : 'Could not load the online worlds.'));
      return;
    }
    if (G.screen !== 'mp') return;
    this.online = res.worlds || [];
    // online worlds this browser keeps a copy of that the server doesn't have (it lost them): opening one puts it back
    const known = new Set([...this.online, ...(res.others || [])].map((w) => w.id));
    for (const w of G.game.localOnlineWorlds()) if (!known.has(w.id)) this.online.push({ ...w, local: true });
    // (for an admin) every other world on the server, after their own
    for (const w of res.others || []) if (!this.online.some((x) => x.id === w.id)) this.online.push(w);
    list.innerHTML = '';
    if (!this.online.some((w) => w.id === this.selectedOnline)) this.selectedOnline = this.online.length ? this.online[0].id : null;
    if (!this.online.length) list.appendChild(h('p', 'empty', 'No online worlds yet. Create one, or type a friend’s join code below to add theirs here.'));
    for (const w of this.online) {
      const row = h('button', 'world-row');
      row.type = 'button';
      row.appendChild(h('strong', null, w.name));
      const d = new Date(w.updated || w.created);
      const who = w.local ? 'only saved in this browser, open it to put it back online' : w.players ? `${w.players} playing now` : `last played ${d.toLocaleDateString()}`;
      row.appendChild(h('span', null, `${w.other ? `Admin · made by ${w.ownerName || 'someone'} · ` : ''}${w.mode === 'creative' ? 'Creative' : 'Survival'} · ${who} · join code ${w.id}`));
      if (w.id === this.selectedOnline) row.classList.add('sel');
      row.addEventListener('click', () => {
        if (this.selectedOnline === w.id) { this.playOnline(); return; }
        this.selectedOnline = w.id;
        for (const r of list.children) r.classList.remove('sel');
        row.classList.add('sel');
        $('online-delete-confirm').hidden = true;
        this.syncOnlineButtons();
      });
      list.appendChild(row);
    }
    // where online worlds are kept, so it is easy to check they are safe
    const st = $('mp-storage');
    st.classList.toggle('warn', !res.permanent);
    st.textContent = res.storage === 'database' ? 'Online worlds, accounts and items are saved in the database, with daily backups.'
      : res.permanent ? 'Online worlds are saved on this computer.'
        : 'Warning: this server has no database, so online worlds, accounts and items are wiped every time the game updates or the server goes to sleep. Add a database to keep them (see the README).';
    this.syncOnlineButtons();
  }

  syncOnlineButtons() {
    const off = !this.selectedOnline || !!this.busy;
    for (const id of ['b-join', 'b-copy-link', 'b-delete-online']) $(id).disabled = off;
    $('b-join-code').disabled = !!this.busy;
    const w = (this.online || []).find((x) => x.id === this.selectedOnline);
    $('b-delete-online').textContent = !w || w.local ? 'Delete' : w.mine ? 'Delete or Remove…' : 'Remove From List';
    $('b-new-online').disabled = !!this.busy;
  }

  // Signed in: the online worlds; signed out: the sign-in form
  syncAccount(rebuild = true) {
    const a = G.account;
    $('s-mp').classList.toggle('signed-out', !a);
    $('mp-auth').hidden = !!a;
    $('mp-account').hidden = !a;
    if (a) {
      $('mp-account-name').textContent = a.name;
      $('mp-admin-link').hidden = !a.admin;
      if (rebuild || !this.online) this.buildOnlineList();
    } else {
      $('auth-pass').value = '';
      if (!$('mp-status').textContent) this.mpStatus('');
    }
  }

  signedIn() {
    if (G.account) return true;
    this.mpStatus('Sign in first.');
    return false;
  }

  async auth(create) {
    const name = $('auth-name').value.trim(), pw = $('auth-pass').value;
    if (!name || !pw) { this.mpStatus('Type a username and a password.'); (name ? $('auth-pass') : $('auth-name')).focus(); return; }
    if (this.busy) return;
    this.busy = true;
    this.mpStatus(create ? 'Creating your account…' : 'Signing in…');
    try {
      await G.game.signIn(name, pw, create);
      this.mpStatus(create ? `Welcome, ${G.account.name}! Your account is ready.` : `Welcome back, ${G.account.name}.`);
      this.busy = false;
      this.syncAccount();
      if (this.pendingWorld) { const id = this.pendingWorld; this.pendingWorld = null; this.playOnline(id); }
    } catch (err) {
      this.busy = false;
      this.mpStatus(err && err.message ? err.message : 'Could not sign in.');
    }
  }

  // Resolves true once you are in
  // `how`: 'play' or 'spectate', when it has been settled already
  async playOnline(id = this.selectedOnline, how = null) {
    if (!id || this.busy) return false;
    if (!this.signedIn()) { this.pendingWorld = id; return false; }
    // an admin going into a world someone else made says how first: to play, or to watch unseen
    const w = (this.online || []).find((x) => x.id === id);
    if (!how && G.account && G.account.admin && !(w && w.mine && !w.other)) {
      how = await this.askHowToJoin(w ? w.name : id);
      if (!how) return false;
    }
    G.spectate = how === 'spectate';
    this.busy = true;
    this.syncOnlineButtons();
    this.mpStatus('Connecting…');
    let ok = true;
    try { await G.game.joinWorld(id, (t) => this.mpStatus(t)); }
    catch (err) { ok = false; this.mpStatus(err && err.message ? err.message : 'Could not join that world.'); }
    if (ok && G.net && G.net.spec) this.toast('Spectating: nobody can see you', 5);
    this.busy = false;
    this.syncOnlineButtons();
    return ok;
  }

  // (admins) the question before going into someone else's world; resolves 'play', 'spectate' or null
  askHowToJoin(name) {
    const box = $('join-how');
    $('join-how-text').textContent = `How do you want to go into ${name}?`;
    box.hidden = false;
    return new Promise((resolve) => {
      const done = (v) => { box.hidden = true; for (const [id] of opts) $(id).onclick = null; resolve(v); };
      const opts = [['b-join-play', 'play'], ['b-join-spectate', 'spectate'], ['b-join-cancel', null]];
      for (const [id, v] of opts) $(id).onclick = () => done(v);
    });
  }

  // Joining a friend's world by typing its code (a whole link pasted in works as well: the code is its last part)
  async joinCode() {
    const box = $('mp-code-input');
    const raw = box.value.trim();
    const m = raw.match(/[?&]world=([A-Za-z0-9]+)/);
    const code = (m ? m[1] : raw).toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!code) { this.mpStatus('Type the join code of the world: six letters and numbers, like K7PQ2X.'); box.focus(); return; }
    if (!/^[A-HJ-NP-Z2-9]{6}$/.test(code)) {
      this.mpStatus(/[OI01]/.test(code) && code.length === 6 ? 'Join codes never use the letters O and I or the numbers 0 and 1. Check the code again.' : 'A join code is six letters and numbers, like K7PQ2X.');
      box.focus();
      return;
    }
    if (await this.playOnline(code)) box.value = '';
  }

  // Opened from a world link (…?world=ID)
  openOnline(id) {
    this.selectedOnline = id;
    this.openScreen('mp');
    if (G.account) this.playOnline(id);
    else { this.pendingWorld = id; this.mpStatus('Sign in or create an account to join this world.'); }
  }

  async copyLink(id) {
    if (!id) return;
    const link = this.onlineLink(id);
    let ok = false;
    try { await navigator.clipboard.writeText(link); ok = true; } catch { /* clipboard blocked */ }
    if (!ok) { window.prompt('Copy this link and send it to your friends:', link); return; }
    if (G.screen === 'mp') this.mpStatus(`Link copied. Friends can also type the join code ${id} in their Multiplayer screen.`);
    else {
      const b = $('b-copy-link-pause');
      b.textContent = 'Link copied!';
      setTimeout(() => { b.textContent = 'Copy Link'; }, 2000);
    }
  }

  // ---------------------------------------------------------------- admin
  // Every account on the server, online players first
  async buildAdminList(keep) {
    const list = $('admin-list');
    if (!keep) { $('admin-status').textContent = ''; this.adminSel = null; }
    list.innerHTML = '';
    list.appendChild(h('p', 'empty', 'Loading players…'));
    let players;
    try { players = await G.game.adminPlayers(); } catch (err) {
      list.innerHTML = '';
      list.appendChild(h('p', 'empty', err.message));
      this.syncAdminButtons();
      return;
    }
    if (G.screen !== 'admin') return;
    list.innerHTML = '';
    if (this.adminSel) this.adminSel = players.find((x) => x.name === this.adminSel.name) || null;
    for (const pl of players) {
      const row = h('button', 'world-row');
      row.type = 'button';
      row.appendChild(h('strong', null, pl.name + (pl.admin ? '  (admin)' : '')));
      const st = h('span', pl.banned ? 'tag-banned' : pl.online.length ? 'tag-online' : null,
        pl.banned ? `Banned by ${pl.banned.by}${pl.banned.reason ? ': ' + pl.banned.reason : ''}`
          : pl.online.length ? `Playing in ${pl.spot || pl.online.join(', ')}`
            : pl.spot ? `Offline · last seen in ${pl.spot}, ${new Date(pl.seenAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}` : `Joined ${new Date(pl.created || Date.now()).toLocaleDateString()}`);
      row.appendChild(st);
      if (this.adminSel && this.adminSel.name === pl.name) row.classList.add('sel');
      row.addEventListener('click', () => {
        this.adminSel = pl;
        for (const r of list.children) r.classList.remove('sel');
        row.classList.add('sel');
        this.syncAdminButtons();
      });
      list.appendChild(row);
    }
    this.syncAdminButtons();
  }

  syncAdminButtons() {
    const pl = this.adminSel;
    for (const id of ['b-admin-kill', 'b-admin-kick', 'b-admin-ban', 'b-admin-op']) $(id).disabled = !pl;
    if (!pl) return;
    $('b-admin-kill').disabled = $('b-admin-kick').disabled = !pl.online.length;
    $('b-admin-ban').textContent = pl.banned ? 'Unban' : 'Ban';
    $('b-admin-ban').disabled = pl.owner;
    $('b-admin-op').textContent = pl.admin ? 'Remove Admin' : 'Make Admin';
    $('b-admin-op').disabled = pl.owner;
  }

  async adminDo(action) {
    const pl = this.adminSel;
    if (!pl) return;
    try { $('admin-status').textContent = await G.game.adminAction(action, pl.name, action === 'ban' ? $('admin-reason').value.trim() : ''); } catch (err) { $('admin-status').textContent = err.message; }
    if (action === 'ban') $('admin-reason').value = '';
    this.buildAdminList(true);
  }

  // Your own worlds can be deleted for everyone; anyone else's only leave your list
  // Taking a world out of the list. Anyone can take one off their own list (its join code brings it back);
  // whoever made it can also delete it for everyone.
  askDeleteOnline() {
    const w = (this.online || []).find((x) => x.id === this.selectedOnline);
    if (!w) return;
    const owner = !!w.mine && !w.local;
    $('online-delete-text').textContent = w.local ? `Forget “${w.name}”? It is only saved in this browser.`
      : owner ? `“${w.name}” is your world. Take it off your list (it stays for your friends, and its join code ${w.id} brings it back), or delete it for everyone, for good?`
        : `Take “${w.name}” off your list? Its join code ${w.id} brings it back any time.`;
    $('b-remove-online').hidden = !!w.local;
    $('b-confirm-delete-online').hidden = !owner && !w.local;
    $('b-confirm-delete-online').textContent = w.local ? 'Forget It' : 'Delete for Everyone';
    $('online-delete-confirm').hidden = false;
  }

  async confirmDeleteOnline(onlyList) {
    $('online-delete-confirm').hidden = true;
    const id = this.selectedOnline;
    const w = (this.online || []).find((x) => x.id === id);
    if (!id) return;
    this.mpStatus(onlyList ? 'Taking it off your list…' : 'Deleting…');
    try {
      // (forgetting a copy only this browser has never deletes anything on the server)
      const r = await G.game.deleteOnline(id, onlyList || !!(w && w.local));
      this.mpStatus(w && w.local ? 'Forgotten.' : r && r.removed ? `Taken off your list. Its join code is ${id} if you want it back.` : 'World deleted.');
    } catch (err) { this.mpStatus(err && err.message ? err.message : 'That did not work. Check your connection and try again.'); }
    this.buildOnlineList();
  }

  async createOnlineWorld() {
    const b = $('b-create');
    if (!G.account) { this.back(); this.signedIn(); return; }
    b.disabled = true;
    try {
      const w = await G.game.createOnline($('world-name').value.trim() || 'Online World', $('world-seed').value.trim(), $('b-mode').dataset.mode);
      this.back();
      this.selectedOnline = w.id;
      this.playOnline(w.id);
    } catch (err) {
      this.back();
      this.mpStatus(err.message);
    }
    b.disabled = false;
  }

  // Shown while getting (back) into an online world; with onCancel, a button to stop trying
  showBusy(msg, sub = '', onCancel = null) {
    this.stack.length = 0;
    if (CONTAINERS.includes(G.screen)) this.closeContainer();
    G.screen = 'busy';
    this.section('loading');
    $('hud').hidden = true;
    $('load-title').textContent = msg;
    $('load-sub').textContent = sub;
    $('load-bar').style.width = '0%';
    $('b-busy-cancel').hidden = !onCancel;
    this.onBusyCancel = onCancel;
    this.updateTouchVisibility();
  }

  syncPause() {
    const net = G.net, meta = G.worldMeta;
    const online = !!(meta && meta.online);
    $('mp-box').hidden = !online;
    $('b-quit').textContent = online ? 'Leave World' : 'Save and Quit to Title';
    // admins can change mode in any world
    const admin = !!(G.account && G.account.admin);
    $('b-pause-mode').hidden = !admin;
    if (admin && G.player) $('b-pause-mode').textContent = G.player.creative ? 'Switch to Survival Mode' : 'Switch to Creative Mode';
    if (!online) return;
    $('mp-info-head').textContent = 'Online world · friends join with this code';
    $('mp-code-show').textContent = meta.online;
    if (!net) { $('mp-players').textContent = ''; return; }
    const names = [net.role === 'host' ? `${net.name} (you)` : net.hostName];
    for (const a of net.players.values()) if (a.id !== 0 && !a.hidden) names.push(a.name);
    if (net.role === 'client') names.push(`${net.name} (you)`);
    const shown = names.filter(Boolean);
    $('mp-players').textContent = (net.spec ? 'You are spectating: nobody can see you, and you cannot touch anything. ' : '')
      + (shown.length > 1 ? 'Playing: ' + shown.join(', ') : 'Nobody else is here right now.');
  }

  chatLine(text, sys) {
    const log = $('chat-log');
    const line = h('p', sys ? 'sys' : '', text);
    log.appendChild(line);
    while (log.children.length > 8) log.firstChild.remove();
    setTimeout(() => line.classList.add('old'), 10000);
  }

  // Pixel flames rising from the bottom of the screen, a new flicker every few frames
  drawFlames(dt) {
    this.flameT = (this.flameT || 0) - dt;
    if (this.flameT > 0) return;
    this.flameT = matchMedia('(prefers-reduced-motion: reduce)').matches ? 1e9 : 0.07;
    const cv = $('burning'), g = cv.getContext('2d'), W = cv.width, H = cv.height;
    const pal = ['#fffac8', '#ffdc5a', '#faa01e', '#e65a14', '#b4280a'];
    g.clearRect(0, 0, W, H);
    const t = performance.now() / 1000;
    for (let x = 0; x < W; x++) {
      // taller at the sides, like flames around the edge of your view
      const edge = Math.abs(x - W / 2) / (W / 2);
      const h = Math.max(0, H * (0.35 + 0.55 * edge * edge) + Math.sin(x * 0.9 + t * 9) * 2.5 + (Math.random() - 0.5) * 6);
      for (let i = 0; i < h; i++) {
        const f = i / h;
        if (f > 0.75 && Math.random() < 0.4) continue;
        g.fillStyle = pal[Math.min(4, Math.floor(f * 5 + Math.random() * 0.8))];
        g.fillRect(x, H - 1 - i, 1, 1);
      }
    }
  }

  toast(text, secs = 2) {
    const t = $('toast');
    t.textContent = text;
    t.classList.add('show');
    this.toastTimer = secs;
  }

  // ---------------------------------------------------------------- worlds
  buildWorldList() {
    const list = $('world-list');
    list.innerHTML = '';
    const worlds = G.game.listWorlds();
    this.selectedWorld = worlds.length ? worlds[0].id : null;
    if (!worlds.length) list.appendChild(h('p', 'empty', 'No worlds yet. Create one to start.'));
    for (const w of worlds) {
      const row = h('button', 'world-row');
      row.type = 'button';
      row.appendChild(h('strong', null, w.name));
      const d = new Date(w.lastPlayed || w.created);
      row.appendChild(h('span', null, `${w.mode === 'creative' ? 'Creative' : 'Survival'} · seed ${w.seed} · ${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`));
      if (w.id === this.selectedWorld) row.classList.add('sel');
      row.addEventListener('click', () => {
        if (this.selectedWorld === w.id) { this.playSelected(); return; }
        this.selectedWorld = w.id;
        for (const r of list.children) r.classList.remove('sel');
        row.classList.add('sel');
      });
      list.appendChild(row);
    }
    $('b-play-world').disabled = !worlds.length;
    $('b-delete-world').disabled = !worlds.length;
    $('b-backup-world').disabled = !worlds.length;
    $('delete-confirm').hidden = true;
    $('worlds-status').textContent = '';
  }

  // Download the selected world as a file (every dimension, inventory and all)
  backupSelected() {
    const data = this.selectedWorld && G.game.exportWorld(this.selectedWorld);
    if (!data) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
    a.download = `${data.meta.name.replace(/[^\w -]/g, '').trim() || 'world'}.blockcraft.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 30000);
    $('worlds-status').textContent = `Saved “${data.meta.name}” as a file. Open Backup File brings it back on any device.`;
  }

  async importFile(f) {
    $('import-file').value = '';
    if (!f) return;
    let msg;
    try {
      const meta = G.game.importWorld(JSON.parse(await f.text()));
      this.buildWorldList();
      msg = `Added “${meta.name}”.`;
    } catch (err) {
      msg = err instanceof SyntaxError ? 'That is not a Blockcraft world backup.' : err.message;
    }
    $('worlds-status').textContent = msg;
  }

  playSelected() { if (this.selectedWorld) G.game.loadWorld(this.selectedWorld); }

  askDelete() {
    if (!this.selectedWorld) return;
    const w = G.game.listWorlds().find((x) => x.id === this.selectedWorld);
    $('delete-name').textContent = w ? w.name : '';
    $('delete-confirm').hidden = false;
  }

  confirmDelete() {
    G.game.deleteWorld(this.selectedWorld);
    this.buildWorldList();
  }

  // ---------------------------------------------------------------- options
  buildOptions() {
    const OPTS = [
      { key: 'renderDist', label: 'Render Distance', min: 2, max: 12, step: 1, fmt: (v) => v + ' chunks' },
      { key: 'fov', label: 'FOV', min: 50, max: 110, step: 1, fmt: (v) => (v === 70 ? 'Normal' : v) },
      { key: 'gamma', label: 'Brightness', min: 0, max: 1, step: 0.05, fmt: (v) => (v === 0 ? 'Moody' : v === 1 ? 'Bright' : Math.round(v * 100) + '%') },
      { key: 'volume', label: 'Sound', min: 0, max: 1, step: 0.05, fmt: (v) => (v === 0 ? 'Off' : Math.round(v * 100) + '%') },
      { key: 'sensitivity', label: 'Mouse Sensitivity', min: 0.2, max: 3, step: 0.05, fmt: (v) => Math.round(v * 100) + '%' },
      { key: 'touchSens', label: 'Touch Look Speed', min: 0.2, max: 3, step: 0.05, fmt: (v) => Math.round(v * 100) + '%' },
      { key: 'autoJump', label: 'Auto-Jump', toggle: true },
      { key: 'viewBob', label: 'View Bobbing', toggle: true },
      { key: 'touch', label: 'Touch Controls', cycle: ['auto', 'on', 'off'], names: { auto: 'Auto', on: 'On', off: 'Off' } },
      { key: 'touchAim', label: 'Touch Aiming', cycle: ['finger', 'crosshair'], names: { finger: 'Where You Tap', crosshair: 'Crosshair' } },
      { key: 'dayLength', label: 'Day Length', cycle: [1200, 600], names: { 1200: '20 min', 600: '10 min' } },
      { key: 'showCoords', label: 'Show Coordinates', toggle: true },
    ];
    const grid = $('options-grid');
    this.optionSync = [];
    for (const o of OPTS) {
      if (o.toggle || o.cycle) {
        const b = h('button', 'btn');
        b.type = 'button';
        b.id = 'opt-' + o.key;
        const sync = () => {
          const v = G.settings[o.key];
          b.textContent = `${o.label}: ${o.toggle ? (v ? 'On' : 'Off') : o.names[v]}`;
        };
        b.addEventListener('click', () => {
          sfx('click');
          if (o.toggle) G.settings[o.key] = !G.settings[o.key];
          else G.settings[o.key] = o.cycle[(o.cycle.indexOf(G.settings[o.key]) + 1) % o.cycle.length];
          this.applySetting(o.key);
          sync();
        });
        grid.appendChild(b);
        this.optionSync.push(sync);
      } else {
        const wrap = h('label', 'slider');
        const input = document.createElement('input');
        input.type = 'range';
        input.id = 'opt-' + o.key;
        input.min = o.min; input.max = o.max; input.step = o.step;
        const text = h('span');
        const sync = () => { input.value = G.settings[o.key]; text.textContent = `${o.label}: ${o.fmt(+G.settings[o.key])}`; };
        input.addEventListener('input', () => {
          G.settings[o.key] = +input.value;
          text.textContent = `${o.label}: ${o.fmt(+input.value)}`;
          this.applySetting(o.key);
        });
        wrap.append(input, text);
        grid.appendChild(wrap);
        this.optionSync.push(sync);
      }
    }
  }

  syncOptions() { this.optionSync.forEach((f) => f()); }

  applySetting(key) {
    saveSettings();
    if (key === 'volume') setVolume(G.settings.volume);
    if (key === 'renderDist' && G.game) G.game.renderDistChanged();
    if (key === 'touch') {
      const t = G.settings.touch;
      setTouchMode(t === 'on' ? true : t === 'off' ? false : G.touchMode);
    }
  }

  // ---------------------------------------------------------------- slots
  renderSlot(el, s) {
    const key = s ? `${s.id}:${s.count}:${s.dmg || 0}${s.e ? ':' + JSON.stringify(s.e) : ''}` : '';
    if (el._key === key) return;
    el._key = key;
    el.innerHTML = '';
    if (!s) return;
    const img = document.createElement('img');
    img.src = iconURL(s.id);
    img.draggable = false;
    img.alt = '';
    if (ICONS[s.id] && ICONS[s.id].width === 16) img.className = 'px';
    el.appendChild(img);
    // enchanted things shimmer
    if (isEnchanted(s)) { const g = h('span', 'glint'); g.style.setProperty('--icon', `url(${img.src})`); el.appendChild(g); }
    if (s.count > 1) el.appendChild(h('span', 'count', String(s.count)));
    const it = ITEMS[s.id];
    if (it && it.durability && s.dmg > 0) {
      const f = Math.max(0, 1 - s.dmg / it.durability);
      const bar = h('span', 'dur');
      const fill = h('i');
      fill.style.width = f * 100 + '%';
      fill.style.background = `hsl(${Math.round(f * 120)},90%,45%)`;
      bar.appendChild(fill);
      el.appendChild(bar);
    }
  }

  invChanged(selectionChanged) {
    this.hudDirty = true;
    if (selectionChanged) {
      const s = G.player.inv.held;
      if (s) this.toast(this.describe(s));
    }
    if (CONTAINERS.includes(G.screen)) this.refreshContainer();
  }

  // ---------------------------------------------------------------- HUD
  update(dt) {
    const p = G.player;
    if (!p) return;
    this.frames++;
    this.fpsTime += dt;
    if (this.fpsTime >= 0.5) {
      this.fps = Math.round(this.frames / this.fpsTime); this.frames = 0; this.fpsTime = 0;
      if (G.screen === 'pause' && G.net) this.syncPause();
    }
    const c = this.hudCache;
    if (this.hudDirty) {
      this.hudDirty = false;
      const inv = p.inv;
      this.slotEls.forEach((el, i) => {
        this.renderSlot(el, inv.slots[i]);
        el.classList.toggle('sel', i === inv.selected);
      });
      const off = p.off[0], offEl = $('offhand');
      this.renderSlot(offEl, off);
      offEl.classList.toggle('empty', !off);
      offEl.style.backgroundImage = off ? '' : `url(${this.shieldIcon})`;
      // the shield button, on touch screens, while a shield is in a hand
      const held = inv.held;
      $('t-shield').hidden = !((held && held.id === ID.shield) || (off && off.id === ID.shield));
    }
    const survival = !p.creative;
    if (c.survival !== survival) { c.survival = survival; $('stats').style.visibility = $('xp-bar').style.visibility = survival ? 'visible' : 'hidden'; }
    const xpKey = p.xpLevel + ':' + Math.round(p.xp / xpForLevel(p.xpLevel) * 200);
    if (c.xp !== xpKey) {
      c.xp = xpKey;
      $('xp-fill').style.width = Math.min(100, p.xp / xpForLevel(p.xpLevel) * 100).toFixed(1) + '%';
      $('xp-level').textContent = p.xpLevel > 0 ? String(p.xpLevel) : '';
    }
    const hp = Math.ceil(p.health), fd = Math.ceil(p.food);
    let shownHp = hp, flash = false;
    if (this.blinkTime > 0) {
      this.blinkTime -= dt;
      flash = Math.floor(this.blinkTime / 0.12) % 2 === 0;
      if (flash) shownHp = Math.max(hp, this.blinkFrom);
    }
    const hpKey = shownHp + (flash ? 'f' : '');
    if (c.hp !== hpKey) {
      c.hp = hpKey;
      $('hearts').childNodes.forEach((e, i) => { e.className = 'heart' + (shownHp >= (i + 1) * 2 ? ' full' : shownHp === i * 2 + 1 ? ' half' : ''); });
      $('hearts').classList.toggle('low', hp <= 4);
      $('hearts').classList.toggle('flash', flash);
    }
    if (c.fd !== fd) {
      c.fd = fd;
      $('food').childNodes.forEach((e, i) => { e.className = 'food' + (fd >= (i + 1) * 2 ? ' full' : fd === i * 2 + 1 ? ' half' : ''); });
    }
    const ap = p.armorPoints().pts;
    if (c.ap !== ap) {
      c.ap = ap;
      $('armor-bar').style.visibility = ap > 0 ? 'visible' : 'hidden';
      $('armor-bar').childNodes.forEach((e, i) => { e.className = 'armor-icon' + (ap >= (i + 1) * 2 ? ' full' : ap === i * 2 + 1 ? ' half' : ''); });
    }
    // Health bar for the mob you are fighting, or the boss nearby
    const boss = G.boss && G.clock < G.boss.until ? G.boss : null;
    const lm = G.lastHitMob;
    const fm = boss ? { def: { name: boss.name }, hp: boss.hp, maxHp: boss.max } : lm;
    const showBar = !!boss || (lm && G.clock - G.lastHitTime < 5 && !lm.removed);
    if (showBar) {
      const frac = Math.max(0, fm.hp) / (fm.maxHp || 1);
      const key = fm.def.name + Math.ceil(Math.max(0, fm.hp));
      if (c.mobBar !== key) {
        c.mobBar = key;
        $('mob-name').textContent = boss ? fm.def.name : `${fm.def.name}  ${Math.ceil(Math.max(0, fm.hp))} / ${fm.maxHp}`;
        $('mob-fill').style.width = (frac * 100).toFixed(1) + '%';
        $('mob-bar').classList.toggle('boss', !!boss);
      }
    }
    if (c.mobBarShown !== !!showBar) { c.mobBarShown = !!showBar; $('mob-bar').hidden = !showBar; }
    const burning = p.burning > 0 && !p.dead;
    if (c.burning !== burning) { c.burning = burning; $('burning').hidden = !burning; }
    if (burning) this.drawFlames(dt);
    const poisoned = p.effects.poison > 0;
    if (c.poison !== poisoned) { c.poison = poisoned; $('hearts').classList.toggle('poison', poisoned); }
    const fx = [];
    if (p.effects.poison > 0) fx.push(['Poison', p.effects.poison]);
    if (p.effects.slow > 0) fx.push(['Slowness', p.effects.slow]);
    if (p.hungerEffect > 0) fx.push(['Hunger', p.hungerEffect]);
    if (p.effects.wither > 0) fx.push(['Wither', p.effects.wither]);
    if (p.effects.levitation > 0) fx.push(['Levitation', p.effects.levitation]);
    if (p.effects.regen > 0) fx.push(['Regeneration', p.effects.regen]);
    if (p.effects.haste > 0) fx.push(['Haste', p.effects.haste]);
    const fxKey = fx.map((e) => e[0] + Math.ceil(e[1])).join();
    if (c.fx !== fxKey) {
      c.fx = fxKey;
      $('effects').textContent = fx.map(([n, t]) => `${n} 0:${String(Math.ceil(t)).padStart(2, '0')}`).join('\n');
      $('effects').hidden = !fx.length;
    }
    const hungry = p.hungerEffect > 0, shaky = !p.creative && p.saturation <= 0;
    if (c.hungry !== hungry) { c.hungry = hungry; $('food').classList.toggle('hunger', hungry); }
    if (c.shaky !== shaky) { c.shaky = shaky; $('food').classList.toggle('shaky', shaky); }

    // Crosshair (hidden when touch aims at the finger) and the attack cooldown indicator
    const cross = !(G.touchMode && G.settings.touchAim === 'finger');
    if (c.cross !== cross) { c.cross = cross; $('crosshair').hidden = !cross; }
    const str = p.attackStrength();
    const showInd = cross && str < 1 && !p.dead;
    if (c.ind !== showInd) { c.ind = showInd; $('attack-ind').hidden = !showInd; }
    if (showInd) $('attack-fill').style.width = Math.round(str * 100) + '%';
    const air = p.headInWater || p.air < 15 ? Math.max(0, Math.ceil(p.air / 1.5)) : -1;
    if (c.air !== air) {
      c.air = air;
      $('bubbles').childNodes.forEach((e, i) => { e.style.visibility = i < air ? 'visible' : 'hidden'; });
    }
    const hurt = p.hurtTime > 0 ? Math.min(1, p.hurtTime / 0.5) : 0;
    if (c.hurt !== hurt) { c.hurt = hurt; $('vignette').style.opacity = (hurt * hurt * 0.45).toFixed(2); }
    const uw = p.headInWater;
    if (c.uw !== uw) { c.uw = uw; $('water-overlay').hidden = !uw; }

    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) $('toast').classList.remove('show');
    }

    const showClick = G.state === 'playing' && !G.screen && !G.touchMode && !G.pointerLocked && !G.noLock;
    if (c.click !== showClick) { c.click = showClick; $('click-to-play').hidden = !showClick; }

    const dbg = $('debug');
    if (G.settings.showCoords) {
      dbg.hidden = false;
      if (this.frames === 0) {
        const x = p.pos.x, y = p.pos.y, z = p.pos.z;
        const dirs = ['South (+Z)', 'West (-X)', 'North (-Z)', 'East (+X)'];
        const yaw = ((-p.yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        const facing = dirs[Math.round((yaw + Math.PI) / (Math.PI / 2)) % 4];
        const chunk = G.world.getChunk(Math.floor(x) >> 4, Math.floor(z) >> 4);
        const bi = chunk ? chunk.biomes[((Math.floor(z) & 15) << 4) | (Math.floor(x) & 15)] : -1;
        const biome = BIOME_NAMES[bi] || DIM_BIOME_NAMES[bi] || '?';
        const [sl, bl] = G.world.getLight(Math.floor(x), Math.floor(p.eyeY), Math.floor(z));
        const tod = Math.floor(((G.time + 0.25) % 1) * 24);
        if (!this.nearCache || this.frames2++ % 6 === 0) {
          this.frames2 = this.frames2 || 1;
          const seen = new Set();
          this.nearCache = structuresNear(G.world, x, z, 1000).filter((s) => !seen.has(s.type) && seen.add(s.type)).slice(0, 4)
            .map((s) => `${s.type.replace('_', ' ')} ${Math.round(s.dist)}m ${['S', 'SW', 'W', 'NW', 'N', 'NE', 'E', 'SE'][Math.round(((Math.atan2(-(s.x - x), s.z - z) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 4)) % 8]}`).join('\n');
        }
        dbg.textContent = `Blockcraft  ${this.fps} fps  Day ${(G.day || 0) + 1}\nXYZ: ${x.toFixed(2)} / ${y.toFixed(2)} / ${z.toFixed(2)}\nChunk: ${Math.floor(x) >> 4}, ${Math.floor(z) >> 4}\nFacing: ${facing}\nBiome: ${biome}\nLight: sky ${sl}, block ${bl}\nTime: ${String(tod).padStart(2, '0')}:00\nMobs: ${G.entities.mobs.length}  Items: ${G.entities.items.length}\nNearest:\n${this.nearCache}`;
      }
    } else dbg.hidden = true;

    if (G.screen === 'furnace') this.updateFurnaceUI();
  }

  // ---------------------------------------------------------------- containers
  slot(ref) {
    const el = h('div', 'slot');
    el._ref = ref;
    let timer = 0, long = false;
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.pointerType === 'touch') {
        long = false;
        clearTimeout(timer);
        timer = setTimeout(() => { long = true; this.clickSlot(ref, 2, false); }, 420);
        el._touch = true;
      } else {
        this.clickSlot(ref, e.button, e.shiftKey);
      }
    });
    el.addEventListener('pointerup', (e) => {
      if (e.pointerType !== 'touch' || !el._touch) return;
      el._touch = false;
      clearTimeout(timer);
      if (!long) this.clickSlot(ref, 0, false);
    });
    el.addEventListener('pointercancel', () => clearTimeout(timer));
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('pointerenter', (e) => { if (e.pointerType !== 'touch') this.showTooltip(ref, e); });
    el.addEventListener('pointerleave', () => this.hideTooltip());
    return el;
  }

  // A faint picture of an item, for a slot that only takes that item
  ghost(id) {
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.globalAlpha = 0.28;
    if (ICONS[id]) g.drawImage(ICONS[id], 0, 0, 32, 32);
    return c.toDataURL();
  }

  // What the anvil or the grindstone would make of what is in it: { out, cost | xp, ... } or null
  made() {
    const c = this.container;
    if (!c) return null;
    if (c.kind === 'anvil') return anvil(c.data.slots[0], c.data.slots[1], (a, b) => { const k = repairItem(a); return !!k && inTag(k, b); });
    if (c.kind === 'grind') return grind(c.data.slots[0]);
    return null;
  }

  // Taking the result out of the anvil (levels are paid) or the grindstone (experience comes back)
  takeMade(shift) {
    const c = this.container, p = G.player, m = this.made();
    if (!m || this.cursor) return;
    if (c.kind === 'anvil') {
      if (m.tooExpensive && !p.creative) { this.toast('Too expensive!'); return; }
      if (!p.creative && p.xpLevel < m.cost) { this.toast(`That takes ${m.cost} level${m.cost === 1 ? '' : 's'}`); return; }
      p.spendLevels(m.cost);
      c.data.slots[0] = null;
      const b = c.data.slots[1];
      b.count -= m.uses;
      if (b.count <= 0) c.data.slots[1] = null;
      sfx('anvil');
      if (G.adv) G.adv.did('anvil');
    } else {
      c.data.slots[0] = null;
      sfx('anvil', null, { vol: 0.5 });
      G.entities.spawnXp(p.pos.x, p.pos.y + 1, p.pos.z, m.xp, 0);
    }
    if (shift) { const left = p.inv.add(m.out.id, 1, m.out.dmg, m.out.e); if (left) this.cursor = m.out; }
    else this.cursor = m.out;
    this.refreshContainer();
  }

  // The enchanting table's three offers: what each costs, a hint of what it gives, and the level it needs
  renderEnchant() {
    const c = this.container;
    if (!c || c.kind !== 'enchant') return;
    const p = G.player, item = c.data.slots[0], lapis = c.data.slots[1] ? c.data.slots[1].count : 0;
    const levels = item && !isEnchanted(item) ? tableLevels(p.enchSeed, c.data.shelves, item.id) : [0, 0, 0];   // (what is already enchanted can't be again)
    [...c.enchant.children].forEach((b, i) => {
      const lvl = levels[i];
      const offer = lvl ? tableOffer(p.enchSeed, i, lvl, item.id) : [];
      const [cost, clue, need] = b.children;
      const can = offer.length > 0 && (p.creative || (p.xpLevel >= lvl && lapis >= i + 1));
      b.disabled = !offer.length;
      b.classList.toggle('cant', offer.length > 0 && !can);
      cost.textContent = String(i + 1);
      clue.textContent = offer.length ? enchLine(offer[0][0], offer[0][1]) + ' . . . ?' : '';
      need.textContent = offer.length ? `level ${lvl}` : '';
      b.title = !offer.length ? '' : p.creative || can ? `Costs ${i + 1} level${i ? 's' : ''} and ${i + 1} lapis lazuli` : p.xpLevel < lvl ? `You need to be level ${lvl}` : `You need ${i + 1} lapis lazuli`;
      b._offer = offer; b._lvl = lvl;
    });
  }

  doEnchant(i) {
    const c = this.container, p = G.player;
    if (!c || c.kind !== 'enchant') return;
    const b = c.enchant.children[i], item = c.data.slots[0];
    if (!item || !b._offer || !b._offer.length) return;
    const lapis = c.data.slots[1] ? c.data.slots[1].count : 0;
    if (!p.creative) {
      if (p.xpLevel < b._lvl) { this.toast(`You need to be level ${b._lvl}`); return; }
      if (lapis < i + 1) { this.toast(`You need ${i + 1} lapis lazuli`); return; }
      c.data.slots[1].count -= i + 1;
      if (!c.data.slots[1].count) c.data.slots[1] = null;
      p.spendLevels(i + 1);
    }
    c.data.slots[0] = enchanted(item, b._offer);
    p.enchSeed = (Math.random() * 4294967296) >>> 0;   // the table offers something new next time
    sfx('enchant');
    if (G.adv) G.adv.did('enchant');
    this.toast(this.describe(c.data.slots[0]));
    this.refreshContainer();
  }

  refGet(ref) {
    if (ref.kind === 'result') return this.craftResult();
    if (ref.kind === 'made') { const m = this.made(); return m ? m.out : null; }
    if (ref.kind === 'palette') return stack(ref.id, 1, 0, ref.e || null);
    if (ref.kind === 'bin') return null;
    return ref.arr[ref.i];
  }

  buildContainer(kind, data) {
    const panel = $('container-panel');
    panel.innerHTML = '';
    panel.className = 'panel ' + kind;
    this.container = { kind, data, els: [] };
    const inv = G.player.inv;
    const add = (parent, ref) => { const el = this.slot(ref); parent.appendChild(el); this.container.els.push(el); return el; };
    const grid = (cols, cls) => { const g = h('div', 'grid ' + (cls || '')); g.style.setProperty('--cols', cols); return g; };

    const titles = { inventory: 'Crafting', crafting: 'Crafting', furnace: 'Furnace', chest: 'Chest', enchant: 'Enchant', anvil: 'Repair & Combine', grind: 'Grindstone' };
    const head = h('div', 'panel-head');
    head.appendChild(h('div', 'panel-title', titles[kind]));
    const close = h('button', 'close', '✕');
    close.type = 'button';
    close.setAttribute('aria-label', 'Close');
    close.addEventListener('click', () => this.back());
    head.appendChild(close);
    panel.appendChild(head);

    const bookPanel = $('recipe-panel');
    bookPanel.hidden = !(kind === 'inventory' || kind === 'crafting');
    this.book = null;
    if (kind === 'inventory' || kind === 'crafting') {
      const n = kind === 'crafting' ? 3 : 2;
      this.craft = { n, slots: new Array(n * n).fill(null) };
      this.buildRecipeBook();
      const row = h('div', 'craft-row');
      if (kind === 'inventory') {
        const col = h('div', 'armor-col');
        for (let i = 0; i < 4; i++) {
          const el = add(col, { kind: 'armor', arr: G.player.armor, i });
          el.classList.add('armor-slot');
          el.style.backgroundImage = `url(${this.armorIcons[i]})`;
        }
        row.appendChild(col);
        // the off hand, beside the boots
        const offCol = h('div', 'off-col');
        const offSlot = add(offCol, { kind: 'offhand', arr: G.player.off, i: 0 });
        offSlot.classList.add('armor-slot');
        offSlot.style.backgroundImage = `url(${this.shieldIcon})`;
        row.appendChild(offCol);
      }
      const g = grid(n);
      for (let i = 0; i < n * n; i++) add(g, { kind: 'craft', arr: this.craft.slots, i });
      row.appendChild(g);
      row.appendChild(h('div', 'arrow'));
      const res = add(row, { kind: 'result' });
      res.classList.add('big');
      panel.appendChild(row);
    } else if (kind === 'furnace') {
      this.craft = null;
      const row = h('div', 'furnace-row');
      const col = h('div', 'furnace-col');
      add(col, { kind: 'normal', arr: data.slots, i: 0 });
      const flame = h('div', 'flame');
      flame.appendChild(h('i'));
      col.appendChild(flame);
      add(col, { kind: 'fuel', arr: data.slots, i: 1 });
      row.appendChild(col);
      const arrow = h('div', 'arrow progress');
      arrow.appendChild(h('i'));
      row.appendChild(arrow);
      const out = add(row, { kind: 'output', arr: data.slots, i: 2 });
      out.classList.add('big');
      panel.appendChild(row);
      this.updateFurnaceUI(true);
    } else if (kind === 'trade') {
      this.craft = null;
      // its name and how good a trader it has become; the bar fills as it nears the next level
      const lvl = data.level;
      head.firstChild.textContent = `${(PROFESSIONS[data.prof] || { name: 'Villager' }).name} · ${LEVEL_NAMES[lvl - 1]}`;
      const bar = h('div', 'trade-level');
      const fill = h('i');
      fill.style.width = (levelProgress(data.vx || 0) * 100).toFixed(0) + '%';
      bar.appendChild(fill);
      bar.title = lvl >= 5 ? 'A Master: it has nothing more to learn' : `Trade with it and it becomes ${/^[AE]/.test(LEVEL_NAMES[lvl]) ? 'an' : 'a'} ${LEVEL_NAMES[lvl]}, with more to offer`;
      panel.appendChild(bar);
      const list = h('div', 'offers');
      data.trades.forEach((tr, i) => list.appendChild(this.offerRow(data, tr, i)));
      panel.appendChild(list);
      this.container.offers = list;
    } else if (kind === 'enchant') {
      // an item and some lapis lazuli on the left, the table's three offers on the right
      this.craft = null;
      data.slots = [null, null];
      data.shelves = countShelves(G.world, data.x, data.y, data.z, B.bookshelf, (x, y, z) => { const b = BLOCKS[G.world.getBlock(x, y, z)]; return !b.solid && !b.opaque; });
      const row = h('div', 'ench-row');
      const col = h('div', 'ench-slots');
      add(col, { kind: 'normal', arr: data.slots, i: 0, max: 1, ok: (s) => enchantability(s.id) > 0 && !isEnchanted(s) });
      const lap = add(col, { kind: 'normal', arr: data.slots, i: 1, ok: (s) => s.id === ID.lapis_lazuli });
      lap.classList.add('armor-slot');
      lap.style.backgroundImage = `url(${this.ghost(ID.lapis_lazuli)})`;
      row.appendChild(col);
      const offers = h('div', 'ench-offers');
      for (let i = 0; i < 3; i++) {
        const b = h('button', 'ench-offer');
        b.type = 'button';
        b.appendChild(h('span', 'ench-cost', String(i + 1)));
        b.appendChild(h('span', 'ench-clue', ''));
        b.appendChild(h('span', 'ench-need', ''));
        b.addEventListener('click', () => this.doEnchant(i));
        offers.appendChild(b);
      }
      row.appendChild(offers);
      panel.appendChild(row);
      panel.appendChild(h('div', 'hint', `Bookshelves around the table: ${data.shelves} of 15. ${data.shelves >= 15 ? 'It can reach level 30.' : 'More of them bring higher levels (15 for level 30).'}`));
      this.container.enchant = offers;
    } else if (kind === 'anvil' || kind === 'grind') {
      // one or two things in, one out; the anvil asks for levels, the grindstone gives a little experience back
      this.craft = null;
      data.slots = kind === 'anvil' ? [null, null] : [null];
      const row = h('div', 'craft-row anvil-row');
      add(row, { kind: 'normal', arr: data.slots, i: 0, max: 1 });
      if (kind === 'anvil') { row.appendChild(h('div', 'plus', '+')); add(row, { kind: 'normal', arr: data.slots, i: 1 }); }
      row.appendChild(h('div', 'arrow'));
      const res = add(row, { kind: 'made' });
      res.classList.add('big');
      panel.appendChild(row);
      const note = h('div', 'hint anvil-cost', '');
      panel.appendChild(note);
      this.container.note = note;
    } else if (kind === 'chest') {
      this.craft = null;
      const g = grid(9);
      for (let i = 0; i < 27; i++) add(g, { kind: 'normal', arr: data.slots, i });
      panel.appendChild(g);
    }

    panel.appendChild(h('div', 'panel-title', 'Inventory'));
    const main = grid(9);
    for (let i = 9; i < 36; i++) add(main, { kind: 'normal', arr: inv.slots, i });
    panel.appendChild(main);
    const hot = grid(9, 'hotbar-grid');
    for (let i = 0; i < 9; i++) add(hot, { kind: 'normal', arr: inv.slots, i });
    panel.appendChild(hot);
    this.refreshContainer();
  }

  craftResult() {
    if (!this.craft) return null;
    const ids = this.craft.slots.map((s) => (s ? s.id : 0));
    const r = matchRecipe(ids, this.craft.n);
    return r ? stack(r.id, r.count) : null;
  }

  refreshContainer() {
    if (!this.container) return;
    const inv = G.player.inv;
    for (const el of this.container.els) {
      const ref = el._ref;
      this.renderSlot(el, this.refGet(ref));
      if (ref.kind === 'select') el.classList.toggle('sel', ref.i === inv.selected);
    }
    this.renderRecipeBook();
    this.renderOffers();
    this.renderEnchant();
    if (this.container.note) {
      // what the anvil asks for, or what the grindstone gives
      const m = this.made(), p = G.player, n = this.container.note;
      if (this.container.kind === 'grind') n.textContent = m ? 'Takes the enchantments off and gives some experience back.' : 'Put an enchanted item or book in to take its enchantments off.';
      else if (!m) {
        // (say why nothing comes of it, when it is a book that does not suit the thing)
        const a = this.container.data.slots[0], b = this.container.data.slots[1];
        n.textContent = a && b && b.id === ID.enchanted_book ? (a.id === ID.enchanted_book ? 'Those two books cannot be put together.' : 'Nothing in that book suits this. Each enchantment only goes on the things it is for.')
          : a && !b ? 'Now add an enchanted book: every enchantment in it that suits this goes onto it. (Or another of its kind, or what it is made of, to mend it.)'
          : 'Put a tool, weapon or piece of armour on the left and an enchanted book on the right.';
      }
      else if (m.tooExpensive && !p.creative) n.textContent = 'Too expensive!';
      else n.textContent = `Costs ${m.cost} level${m.cost === 1 ? '' : 's'}` + (!p.creative && p.xpLevel < m.cost ? ` (you have ${p.xpLevel})` : '');
      n.classList.toggle('bad', !!m && !p.creative && (m.tooExpensive || p.xpLevel < m.cost));
    }
    this.renderCursor();
    this.hudDirty = true;
  }

  // ---------------------------------------------------------------- villager trades
  offerRow(v, tr, i) {
    const row = h('button', 'offer');
    row.type = 'button';
    row._i = i;
    const icon = (s) => { const b = h('span', 'offer-item'); const img = document.createElement('img'); img.src = iconURL(s.id); img.alt = ''; if (ICONS[s.id] && ICONS[s.id].width === 16) img.className = 'px'; b.appendChild(img); if (s.count > 1) b.appendChild(h('span', 'count', String(s.count))); b.title = itemName(s.id); return b; };
    row.appendChild(icon(tr.buy));
    if (tr.buy2) row.appendChild(icon(tr.buy2));
    row.appendChild(h('span', 'offer-arrow', '→'));
    row.appendChild(icon(tr.sell));
    // (what the villager can't offer yet is shown too, so you can see what trading with it will unlock)
    row.appendChild(h('span', 'offer-name', tr.lvl > v.level ? `Unlocks at ${LEVEL_NAMES[tr.lvl - 1]}` : this.describe(tr.sell)));
    let timer = 0, long = false;
    row.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') { long = false; clearTimeout(timer); timer = setTimeout(() => { long = true; this.doTrade(v, tr, true); }, 450); }
      else if (e.button === 0) { e.preventDefault(); this.doTrade(v, tr, e.shiftKey); }
    });
    row.addEventListener('pointerup', (e) => { if (e.pointerType === 'touch') { clearTimeout(timer); if (!long) this.doTrade(v, tr, false); } });
    row.addEventListener('pointercancel', () => clearTimeout(timer));
    row._trade = tr;
    return row;
  }

  canAfford(tr) {
    const inv = G.player.inv;
    return inv.count(tr.buy.id) >= tr.buy.count && (!tr.buy2 || inv.count(tr.buy2.id) >= tr.buy2.count);
  }

  doTrade(v, tr, many) {
    const p = G.player, inv = p.inv;
    let n = 0;
    do {
      if (tr.lvl > v.level || tr.uses + n >= tr.max) { if (!n) sfx('villager', v.pos, { pitch: 0.7 }); break; }
      if (!this.canAfford(tr)) { if (!n) sfx('villager', v.pos, { pitch: 0.7 }); break; }
      inv.remove(tr.buy.id, tr.buy.count);
      if (tr.buy2) inv.remove(tr.buy2.id, tr.buy2.count);
      const e = tr.sell.e ? { ...tr.sell.e } : null;
      const left = inv.add(tr.sell.id, tr.sell.count, tr.sell.dmg || 0, e);
      if (left) G.entities.dropItem(tr.sell.id, left, p.pos.x, p.pos.y + 1, p.pos.z, undefined, undefined, undefined, tr.sell.dmg || 0, e);
      n++;
    } while (many && n < 64 && !tr.sell.e);
    if (n) {
      sfx('villager', v.pos); sfx('pop', null, { vol: 0.5 });
      // the villager learns from every trade (the host keeps count), and you get a little experience too
      let xp = 0;
      for (let k = 0; k < n; k++) xp += 3 + Math.floor(Math.random() * 4);
      G.entities.spawnXp(v.pos.x, v.pos.y + 1, v.pos.z, xp, 0.1);
      if (G.adv) G.adv.traded(v, tr);
      const i = v.trades.indexOf(tr);
      if (v.proxy) { tr.uses += n; G.net.send({ k: 'tu', id: v.netId, i, n }); }
      else { const up = v.traded(i, n); if (up) this.toast(up); }
    }
    if (this.container && this.container.kind === 'trade') this.refreshContainer();
  }

  renderOffers() {
    const c = this.container;
    if (!c || c.kind !== 'trade' || !c.offers) return;
    for (const row of c.offers.children) {
      const tr = row._trade;
      const locked = tr.lvl > c.data.level;
      const out = !locked && tr.uses >= tr.max;
      row.classList.toggle('locked', locked);
      row.classList.toggle('out', out);
      row.classList.toggle('cant', !out && !locked && !this.canAfford(tr));
      row.title = locked ? `Trade with this villager until it is ${/^[AE]/.test(LEVEL_NAMES[tr.lvl - 1]) ? 'an' : 'a'} ${LEVEL_NAMES[tr.lvl - 1]}` : out ? 'Out of stock until tomorrow' : '';
    }
  }

  // ---------------------------------------------------------------- recipe book
  // The panel beside the inventory and the crafting table. In survival it is the recipe book; in creative
  // it also lists every block and item there is. Both can be searched by name.
  buildRecipeBook() {
    const panel = $('recipe-panel');
    panel.innerHTML = '';
    const creative = G.player.creative;
    if (!creative) this.bookTab = 'recipes';
    else if (this.bookTabFor !== 'creative') { this.bookTab = 'items'; this.recipeFilter = 'all'; }   // (in creative there is nothing to craft from: show every recipe)
    this.bookTabFor = creative ? 'creative' : 'survival';
    this.bookSearch = '';
    const head = h('div', 'panel-head');
    const tabs = {};
    if (creative) {
      const row = h('div', 'book-tabs');
      for (const [key, label] of [['items', 'Items'], ['recipes', 'Recipes']]) {
        const t = h('button', 'filter', label);
        t.type = 'button';
        t.addEventListener('click', () => {
          if (this.bookTab === key) return;
          this.bookTab = key;
          search.value = ''; this.bookSearch = '';
          this.book.key = ''; this.book.shown = null;
          sync();
          this.renderRecipeBook();
          sfx('click');
        });
        tabs[key] = t;
        row.appendChild(t);
      }
      head.appendChild(row);
    } else head.appendChild(h('div', 'panel-title', 'Recipes'));
    const filter = h('button', 'filter');
    filter.type = 'button';
    filter.addEventListener('click', () => {
      this.recipeFilter = this.recipeFilter === 'all' ? 'craftable' : 'all';
      sync();
      this.book.key = '';
      this.renderRecipeBook();
      sfx('click');
    });
    head.appendChild(filter);
    panel.appendChild(head);
    const search = h('input', 'book-search');
    search.type = 'text';
    search.autocomplete = 'off';
    search.spellcheck = false;
    search.setAttribute('autocapitalize', 'off');
    search.setAttribute('enterkeyhint', 'search');
    search.setAttribute('aria-label', 'Search by name');
    search.addEventListener('input', () => { this.bookSearch = search.value; this.renderRecipeBook(); });
    // Enter puts the keyboard away; Escape clears the search first, then leaves the box
    search.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); search.blur(); }
      if (e.key === 'Escape') { e.preventDefault(); if (search.value) { search.value = ''; this.bookSearch = ''; this.renderRecipeBook(); } else search.blur(); }
    });
    search.addEventListener('pointerdown', (e) => e.stopPropagation());
    const grid = h('div', 'grid recipes');
    const empty = h('p', 'empty', '');
    const detail = h('div', 'needs');
    detail.hidden = true;
    const status = h('div', 'status');
    const foot = h('div', 'book-foot');
    const hint = h('div', 'hint', '');
    foot.appendChild(hint);
    // (creative) somewhere to throw things away: put what you are holding on it
    const bin = this.slot({ kind: 'bin' });
    bin.classList.add('bin');
    bin.title = 'Bin: put something here to throw it away';
    foot.appendChild(bin);
    panel.append(search, grid, empty, detail, status, foot);
    const sync = () => {
      const items = this.bookTab === 'items', all = this.recipeFilter === 'all';
      for (const [key, t] of Object.entries(tabs)) t.setAttribute('aria-pressed', String(this.bookTab === key));
      filter.hidden = items;
      filter.textContent = all ? 'All' : 'Craftable';
      filter.setAttribute('aria-pressed', String(!all));
      filter.title = all ? 'Showing every recipe. Tap to show only what you can craft.' : 'Showing what you can craft. Tap to show every recipe.';
      search.placeholder = items ? 'Search items…' : 'Search recipes…';
      bin.hidden = !creative;
      if (items) detail.hidden = true;
      hint.textContent = items
        ? (G.touchMode ? 'Tap an item to put a stack in your inventory. To throw something away, pick it up and tap the bin.' : 'Click an item to pick up a stack (right-click for one, Shift-click to put it straight in your inventory). The bin throws away what you are holding.')
        : (G.touchMode ? 'Tap a recipe to craft it, or to see what it needs. Hold it to craft a full stack.' : 'Click a recipe to craft it, or to see what it needs. Shift-click to craft a full stack.');
    };
    this.book = { grid, empty, status, detail, key: '', statusTimer: 0, shown: null };
    sync();
    this.renderRecipeBook();
  }

  // Everything the creative list offers: every block and item, then a book for each enchantment at its highest
  paletteRefs() {
    if (!this.palette) {
      this.palette = creativeList().map((id) => ({ kind: 'palette', id }));
      for (const k of Object.keys(ENCH)) this.palette.push({ kind: 'palette', id: ID.enchanted_book, e: { [k]: ENCH[k].max } });
      for (const r of this.palette) r.name = this.describe(stack(r.id, 1, 0, r.e || null)).toLowerCase();
    }
    return this.palette;
  }

  // Counts items in the inventory plus anything already placed in the crafting grid
  craftCount() {
    const inv = G.player.inv;
    const grid = this.craft ? this.craft.slots : [];
    return (id) => inv.count(id) + grid.reduce((n, s) => n + (s && s.id === id ? s.count : 0), 0);
  }

  renderRecipeBook() {
    const b = this.book;
    if (!b || !this.craft) return;
    const q = (this.bookSearch || '').trim().toLowerCase();
    if (this.bookTab === 'items') {
      const key = 'items:' + q;
      if (key === b.key) return;
      b.key = key;
      b.grid.innerHTML = '';
      let n = 0;
      for (const ref of this.paletteRefs()) {
        if (q && !ref.name.includes(q)) continue;
        const el = this.slot(ref);
        this.renderSlot(el, this.refGet(ref));
        b.grid.appendChild(el);
        n++;
      }
      b.grid.scrollTop = 0;
      b.empty.textContent = 'Nothing is called that.';
      b.empty.hidden = n > 0;
      return;
    }
    const count = this.craftCount();
    const size = this.craft.n;
    const list = [];
    RECIPES.forEach((rec, i) => {
      const fits = rec.size <= size;
      const ok = fits && craftableTimes(count, rec) > 0;
      // a search looks through every recipe, whether or not it can be made right now
      if (q ? itemName(rec.out.id).toLowerCase().includes(q) : (this.recipeFilter === 'all' || ok)) list.push({ rec, i, ok, fits });
    });
    list.sort((a, c) => (c.ok - a.ok) || (c.fits - a.fits) || (a.i - c.i));
    if (b.shown) this.showNeeds(b.shown);   // (what you have changes as you go)
    const key = q + '|' + list.map((e) => e.i + (e.ok ? 'y' : e.fits ? 'n' : 't')).join(',');
    if (key === b.key) return;
    b.key = key;
    b.grid.innerHTML = '';
    for (const e of list) b.grid.appendChild(this.recipeTile(e));
    b.empty.textContent = q ? 'No recipe is called that.' : 'Nothing to craft yet. Break a tree trunk to collect logs, then come back. (Press All to see every recipe.)';
    b.empty.hidden = list.length > 0;
  }

  // What a recipe takes, drawn the way it is laid out, with a tick or a cross by each thing and how
  // many of it you have. Shown when a recipe is picked that cannot be made yet.
  showNeeds(rec) {
    const b = this.book;
    if (!b) return;
    b.shown = rec;
    const d = b.detail, count = this.craftCount();
    d.innerHTML = '';
    d.hidden = false;
    d.appendChild(h('div', 'needs-title', `${itemName(rec.out.id)}${rec.out.count > 1 ? ' ×' + rec.out.count : ''}`));
    const n = rec.size, cells = new Array(n * n).fill(null);
    if (rec.shapeless) rec.ings.forEach((set, i) => { cells[i] = set; });
    else for (let r = 0; r < rec.h; r++) for (let c = 0; c < rec.w; c++) cells[r * n + c] = rec.cells[r * rec.w + c];
    // (of a group, like any planks, the kind you have is the one shown)
    const pick = (set) => { const ids = [...set]; return ids.find((id) => count(id) > 0) || ids[0]; };
    const row = h('div', 'needs-row');
    const g = h('div', 'grid needs-grid');
    g.style.setProperty('--cols', n);
    for (const set of cells) {
      const el = h('div', 'slot mini');
      if (set) { const id = pick(set); this.renderSlot(el, stack(id, 1)); el.classList.toggle('lack', count(id) < 1 && ![...set].some((x) => count(x) > 0)); }
      g.appendChild(el);
    }
    const out = h('div', 'slot mini');
    this.renderSlot(out, stack(rec.out.id, rec.out.count));
    row.append(g, h('div', 'arrow'), out);
    d.appendChild(row);
    for (const grp of rec.groups) {
      const have = grp.ids.reduce((t, id) => t + count(id), 0);
      d.appendChild(h('div', have >= grp.n ? 'need ok' : 'need bad', `${have >= grp.n ? '✓' : '✗'} ${grp.n} × ${grp.label || itemName(grp.ids[0])} (you have ${have})`));
    }
    if (this.craft && rec.size > this.craft.n) d.appendChild(h('div', 'need bad', '✗ Needs a crafting table'));
  }

  recipeTile({ rec, ok, fits }) {
    const el = h('div', 'slot recipe' + (ok ? '' : fits ? ' missing' : ' locked'));
    this.renderSlot(el, stack(rec.out.id, rec.out.count));
    let timer = 0, long = false;
    el.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      if (e.pointerType === 'touch') {
        long = false;
        clearTimeout(timer);
        el._touch = true;
        timer = setTimeout(() => { long = true; el._touch = false; this.craftFromBook(rec, true); }, 450);
      } else if (e.button === 0) {
        e.preventDefault();
        this.craftFromBook(rec, e.shiftKey);
      }
    });
    el.addEventListener('pointerup', (e) => {
      if (e.pointerType !== 'touch' || !el._touch) return;
      el._touch = false;
      clearTimeout(timer);
      if (!long) this.craftFromBook(rec, false);
    });
    el.addEventListener('pointercancel', () => { clearTimeout(timer); el._touch = false; });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('pointerenter', (e) => { if (e.pointerType !== 'touch') this.showRecipeTip(rec, fits, e); });
    el.addEventListener('pointerleave', () => this.hideTooltip());
    return el;
  }

  showRecipeTip(rec, fits, e) {
    const count = this.craftCount();
    const lines = [`${itemName(rec.out.id)}${rec.out.count > 1 ? ' ×' + rec.out.count : ''}`];
    for (const g of rec.groups) {
      const have = g.ids.reduce((n, id) => n + count(id), 0);
      lines.push(`${have >= g.n ? '✓' : '✗'} ${g.n} ${g.label || itemName(g.ids[0])}  (have ${have})`);
    }
    if (!fits) lines.push('Needs a crafting table');
    const t = $('tooltip');
    t.textContent = lines.join('\n');
    t.hidden = false;
    t.style.transform = `translate(${e.clientX + 14}px, ${e.clientY - 30}px)`;
  }

  setBookStatus(text, bad) {
    const b = this.book;
    if (!b) return;
    b.status.textContent = text;
    b.status.classList.toggle('bad', !!bad);
    clearTimeout(b.statusTimer);
    b.statusTimer = setTimeout(() => { b.status.textContent = ''; }, 2200);
  }

  // Put anything left in the crafting grid back in the inventory
  returnGrid() {
    if (!this.craft) return;
    const p = G.player;
    this.craft.slots.forEach((s, i) => {
      if (!s) return;
      const left = p.inv.add(s.id, s.count, s.dmg, s.e);
      if (left) G.entities.dropItem(s.id, left, p.pos.x, p.pos.y + 1, p.pos.z, undefined, undefined, undefined, s.dmg, s.e);
      this.craft.slots[i] = null;
    });
  }

  // One click in the recipe book crafts straight into the inventory
  craftFromBook(rec, stackful) {
    this.hideTooltip();
    if (!this.craft || rec.size > this.craft.n) {
      this.setBookStatus('Needs a crafting table', true);
      this.showNeeds(rec);
      sfx('click', null, { vol: 0.4 });
      return;
    }
    const p = G.player, inv = p.inv;
    this.returnGrid();
    const times = craftableTimes((id) => inv.count(id), rec);
    if (times < 1) {
      this.setBookStatus('You need:', true);
      this.showNeeds(rec);
      sfx('click', null, { vol: 0.4 });
      this.refreshContainer();
      return;
    }
    if (this.book) { this.book.shown = null; this.book.detail.hidden = true; }
    const per = rec.out.count;
    const n = stackful ? Math.max(1, Math.min(times, Math.floor(maxStack(rec.out.id) / per))) : 1;
    let made = 0;
    for (let i = 0; i < n; i++) {
      if (!takeIngredients(inv, rec)) break;
      const left = inv.add(rec.out.id, per);
      if (left) G.entities.dropItem(rec.out.id, left, p.pos.x, p.pos.y + 1, p.pos.z);
      made += per;
    }
    sfx('pop', null, { vol: 0.6 });
    this.setBookStatus(`Crafted ${made} ${itemName(rec.out.id)}`);
    this.refreshContainer();
  }

  updateFurnaceUI(force) {
    const c = this.container;
    if (!c || c.kind !== 'furnace') return;
    const d = c.data;
    const panel = $('container-panel');
    const flame = panel.querySelector('.flame i'), arrow = panel.querySelector('.progress i');
    if (flame) flame.style.height = (d.burnMax ? Math.max(0, d.burn / d.burnMax) * 100 : 0) + '%';
    if (arrow) arrow.style.width = Math.min(100, (d.cook / 10) * 100) + '%';
    if (force || d.changed) { d.changed = false; this.refreshContainer(); }
  }

  clickSlot(ref, button, shift) {
    const inv = G.player.inv;
    sfx('click', null, { vol: 0.4 });
    if (ref.kind === 'palette') {
      const max = maxStack(ref.id);
      const full = stack(ref.id, max, 0, ref.e ? { ...ref.e } : null);
      const c0 = this.cursor;
      if (G.touchMode || shift) {
        // a tap (or shift-click) puts a full stack straight into the inventory
        const left = inv.add(full.id, full.count, 0, full.e);
        this.toast(left >= full.count ? 'Your inventory is full' : this.describe(full) + (max > 1 ? ' ×' + (full.count - left) : ''));
      } else if (!c0) this.cursor = button === 2 ? { ...full, count: 1 } : full;
      else if (sameItem(c0, full) && c0.count < max) c0.count = button === 2 ? c0.count + 1 : max;
      else this.cursor = null;   // (clicking the list with something else in hand throws it away, as in Minecraft)
      this.refreshContainer();
      return;
    }
    if (ref.kind === 'bin') { if (this.cursor) { this.cursor = null; sfx('pop', null, { vol: 0.4 }); this.refreshContainer(); } return; }
    if (ref.kind === 'select') { inv.selected = ref.i; this.invChanged(true); return; }
    if (ref.kind === 'result') { this.takeResult(shift); return; }
    if (ref.kind === 'made') { this.takeMade(shift); return; }
    const arr = ref.arr, i = ref.i;
    const s = arr[i];
    const c = this.cursor;
    // armour with the Curse of Binding stays on until it breaks (or you die)
    if (ref.kind === 'armor' && s && s.e && s.e.binding_curse && !G.player.creative) { this.toast('It is bound to you'); return; }
    if (shift && s) {
      this.quickMove(ref);
      if (ref.kind === 'output' && !arr[i] && this.container && this.container.kind === 'furnace') { G.game.furnaceXp(this.container.data); if (G.adv) G.adv.smelted(s.id); }
      this.afterChange(ref);
      return;
    }
    if (ref.kind === 'output') {
      if (!s) return;
      if (!c) { this.cursor = s; arr[i] = null; }
      else if (sameItem(c, s) && c.count + s.count <= maxStack(s.id)) { c.count += s.count; arr[i] = null; }
      if (!arr[i] && this.container && this.container.kind === 'furnace') { G.game.furnaceXp(this.container.data); if (G.adv) G.adv.smelted(s.id); }
      this.afterChange(ref);
      return;
    }
    if (ref.kind === 'fuel' && c && !fuelValue(c.id)) return;
    // slots that only take certain things, or only one of them (the enchanting table, the anvil)
    if (ref.ok && c && !ref.ok(c)) return;
    if (ref.max === 1 && c && c.count > 1) {
      if (s) return;
      arr[i] = { ...c, count: 1 }; c.count--;
      this.afterChange(ref);
      return;
    }
    if (ref.kind === 'armor' && c && !(ITEMS[c.id].armor && ITEMS[c.id].armor.slot === ref.i)) return;
    if (button === 2) {
      if (!c) {
        if (s) { const half = Math.ceil(s.count / 2); this.cursor = { ...s, count: half }; s.count -= half; if (!s.count) arr[i] = null; }
      } else if (!s) { arr[i] = { ...c, count: 1 }; c.count--; if (!c.count) this.cursor = null; }
      else if (sameItem(s, c) && s.count < maxStack(s.id)) { s.count++; c.count--; if (!c.count) this.cursor = null; }
      else { arr[i] = c; this.cursor = s; }
    } else {
      if (!c) { if (s) { this.cursor = s; arr[i] = null; } }
      else if (!s) { arr[i] = c; this.cursor = null; }
      else if (sameItem(s, c)) {
        const n = Math.min(c.count, maxStack(s.id) - s.count);
        s.count += n; c.count -= n;
        if (!c.count) this.cursor = null;
      } else { arr[i] = c; this.cursor = s; }
    }
    this.afterChange(ref);
  }

  afterChange(ref) {
    // (a touch screen has no pointer to hover with: picking up something enchanted says what it is)
    if (G.touchMode && this.cursor && this.cursor.e && this.cursor !== this.toldOf) { this.toldOf = this.cursor; this.toast(this.describe(this.cursor)); }
    if (this.container && this.container.kind === 'furnace') this.container.data.changed = false;
    this.refreshContainer();
  }

  // Merge `s` into arr at the given indices; returns leftover count
  moveInto(s, arr, idx) {
    const max = maxStack(s.id);
    let n = s.count;
    if (max > 1) for (const i of idx) { const t = arr[i]; if (n && t && t.id === s.id && t.count < max) { const k = Math.min(n, max - t.count); t.count += k; n -= k; } }
    for (const i of idx) { if (n && !arr[i]) { arr[i] = { ...s, count: Math.min(n, max) }; n -= Math.min(n, max); } }
    return n;
  }

  quickMove(ref) {
    const inv = G.player.inv;
    const s = ref.arr[ref.i];
    const range = (a, b) => Array.from({ length: b - a }, (_, k) => a + k);
    let left;
    const c = this.container;
    const arm = ITEMS[s.id] && ITEMS[s.id].armor;
    if (ref.arr === inv.slots && arm && !G.player.armor[arm.slot] && c && c.kind === 'inventory') {
      G.player.armor[arm.slot] = s; ref.arr[ref.i] = null; sfx('armor'); return;
    }
    if (ref.arr === inv.slots && s.id === ID.shield && !G.player.off[0] && c && c.kind === 'inventory') {
      G.player.off[0] = s; ref.arr[ref.i] = null; sfx('armor'); return;   // a shield goes straight to the off hand
    }
    if (ref.arr === inv.slots && c && TEMP.includes(c.kind)) {
      // into the first slot of the table, anvil or grindstone that takes it
      const slots = c.data.slots;
      const refs = c.els.map((el) => el._ref).filter((r) => r.arr === slots);
      const to = refs.find((r) => !slots[r.i] && (!r.ok || r.ok(s))) || refs.find((r) => slots[r.i] && r.max !== 1 && sameItem(slots[r.i], s) && (!r.ok || r.ok(s)));
      if (to && !slots[to.i]) { const n = to.max === 1 ? 1 : s.count; slots[to.i] = { ...s, count: n }; left = s.count - n; }
      else if (to) left = this.moveInto(s, slots, [to.i]);
      else left = this.moveInto(s, inv.slots, ref.i < 9 ? range(9, 36) : range(0, 9));
    } else if (ref.arr === inv.slots) {
      if (c && c.kind === 'chest') left = this.moveInto(s, c.data.slots, range(0, 27));
      else if (c && c.kind === 'furnace') {
        if (SMELTING.has(s.id)) left = this.moveInto(s, c.data.slots, [0]);
        else if (fuelValue(s.id)) left = this.moveInto(s, c.data.slots, [1]);
        else left = this.moveInto(s, inv.slots, ref.i < 9 ? range(9, 36) : range(0, 9));
      } else left = this.moveInto(s, inv.slots, ref.i < 9 ? range(9, 36) : range(0, 9));
    } else {
      left = this.moveInto(s, inv.slots, [...range(0, 9).reverse(), ...range(9, 36).reverse()].reverse());
    }
    if (left) s.count = left; else ref.arr[ref.i] = null;
  }

  takeResult(shift) {
    let r = this.craftResult();
    if (!r) return;
    const inv = G.player.inv;
    const consume = () => {
      for (let i = 0; i < this.craft.slots.length; i++) {
        const s = this.craft.slots[i];
        if (s) { s.count--; if (!s.count) this.craft.slots[i] = null; }
      }
    };
    if (shift) {
      let guard = 0;
      while (r && guard++ < 64) {
        const left = inv.add(r.id, r.count);
        if (left) { G.entities.dropItem(r.id, left, G.player.pos.x, G.player.pos.y + 1, G.player.pos.z); }
        consume();
        const nr = this.craftResult();
        if (!nr || nr.id !== r.id) break;
        r = nr;
      }
    } else {
      const c = this.cursor;
      if (!c) this.cursor = r;
      else if (c.id === r.id && c.count + r.count <= maxStack(r.id)) c.count += r.count;
      else return;
      consume();
    }
    this.refreshContainer();
  }

  dropCursor() {
    const c = this.cursor;
    if (!c) return;
    const p = G.player;
    const d = p.lookDir();
    G.entities.dropItem(c.id, c.count, p.pos.x + d.x * 0.5, p.eyeY - 0.3, p.pos.z + d.z * 0.5, d.x * 5, 2, d.z * 5, c.dmg, c.e).pickupDelay = 1.5;
    this.cursor = null;
  }

  closeContainer() {
    const p = G.player;
    const giveBack = (s) => {
      if (!s) return;
      const left = p.inv.add(s.id, s.count, s.dmg, s.e);
      if (left) G.entities.dropItem(s.id, left, p.pos.x, p.pos.y + 1, p.pos.z, undefined, undefined, undefined, s.dmg, s.e);
    };
    if (this.craft) { this.craft.slots.forEach(giveBack); this.craft = null; }
    if (this.container && TEMP.includes(this.container.kind)) this.container.data.slots.forEach(giveBack);
    giveBack(this.cursor);
    this.cursor = null;
    this.renderCursor();
    if (this.container && this.container.kind === 'chest') sfx('chest');
    this.container = null;
    this.book = null;
    $('recipe-panel').hidden = true;
    this.hudDirty = true;
    this.hideTooltip();
  }

  // ---------------------------------------------------------------- cursor + tooltip
  renderCursor() {
    const el = $('cursor-stack');
    this.renderSlot(el, this.cursor);
    el.hidden = !this.cursor;
  }

  moveCursor(x, y) {
    const el = $('cursor-stack');
    el.style.transform = `translate(${x}px, ${y}px)`;
    const t = $('tooltip');
    if (!t.hidden) t.style.transform = `translate(${x + 14}px, ${y - 30}px)`;
  }

  showTooltip(ref, e) {
    const s = this.refGet(ref);
    const t = $('tooltip');
    if (!s || this.cursor) { t.hidden = true; return; }
    this.fillTooltip(t, s);
    t.hidden = false;
    t.style.transform = `translate(${e.clientX + 14}px, ${e.clientY - 30}px)`;
  }

  // The name of a stack, its enchantments (curses in red) and what it does
  fillTooltip(t, s) {
    const it = ITEMS[s.id];
    t.textContent = '';
    const name = h('div', isEnchanted(s) ? 'tip-name ench' : 'tip-name', itemName(s.id));
    t.appendChild(name);
    for (const [k, l] of enchList(s)) t.appendChild(h('div', ENCH[k].curse ? 'tip-ench curse' : 'tip-ench', enchLine(k, l)));
    if (it && it.durability) t.appendChild(h('div', 'tip-line', `Durability: ${it.durability - (s.dmg || 0)} / ${it.durability}`));
    if (it && it.food) t.appendChild(h('div', 'tip-line', `Restores ${it.food / 2} food`));
    if (s.id === ID.treasure_map) t.appendChild(h('div', 'tip-line', 'Hold it and use it to read it'));
    if (s.id === ID.charred_skull) t.appendChild(h('div', 'tip-line', 'Three on a T of soul sand wake the Blight'));
    if (s.id === ID.golden_apple) t.appendChild(h('div', 'tip-line', 'Mends you for a while'));
  }

  // What a stack says about itself in one line (the toast when you select it)
  describe(s) {
    const list = enchList(s);
    return itemName(s.id) + (list.length ? ' (' + list.map(([k, l]) => enchLine(k, l)).join(', ') + ')' : '');
  }

  hideTooltip() { $('tooltip').hidden = true; }
}
