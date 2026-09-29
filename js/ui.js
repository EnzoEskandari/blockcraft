// HUD, menus and inventory screens (plain DOM).
import { G, saveSettings } from './game.js';
import { ITEMS, ID, B, maxStack, itemName, matchRecipe, fuelValue, SMELTING, creativeList, RECIPES } from './blocks.js';
import { iconURL, ICONS, drawAscii, TILES, TEX, armorSilhouette } from './textures.js';
import { PROFESSIONS } from './villagers.js';
import { structuresNear } from './structures.js';
import { sameItem, stack, craftableTimes, takeIngredients } from './inventory.js';
import { requestLock, exitLock, setTouchMode, resetTouch } from './input.js';
import { sfx, setVolume, initAudio } from './audio.js';
import { BIOME_NAMES } from './world.js';

const $ = (id) => document.getElementById(id);
const h = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};

const CONTAINERS = ['inventory', 'crafting', 'furnace', 'chest', 'creative', 'trade'];
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
    $('splash').textContent = SPLASHES[(Math.random() * SPLASHES.length) | 0];
    const on = (id, fn) => $(id).addEventListener('click', (e) => { e.preventDefault(); initAudio(); sfx('click'); fn(); });
    on('b-single', () => this.openScreen('worlds'));
    on('b-multi', () => this.openScreen('mp'));
    on('b-mp-back', () => this.back());
    on('b-join', () => this.playOnline());
    on('b-new-online', () => { if (this.mpName()) { this.createOnline = true; this.openScreen('create'); } });
    on('b-copy-link', () => this.copyLink(this.selectedOnline));
    on('b-copy-link-pause', () => this.copyLink(G.worldMeta && G.worldMeta.online));
    on('b-delete-online', () => this.askDeleteOnline());
    on('b-confirm-delete-online', () => this.confirmDeleteOnline());
    on('b-cancel-delete-online', () => { $('online-delete-confirm').hidden = true; });
    $('chat-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const inp = $('chat-input');
      if (G.net) G.net.say(inp.value);
      inp.value = '';
      this.back();
    });
    $('chat-input').addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); this.back(); } });
    $('t-chat').addEventListener('click', (e) => { e.preventDefault(); if (G.net && !G.screen) this.openScreen('chat'); });
    on('b-options', () => this.openScreen('options'));
    on('b-help', () => this.openScreen('help'));
    on('b-help-back', () => this.back());
    on('b-play-world', () => this.playSelected());
    on('b-new-world', () => { this.createOnline = false; this.openScreen('create'); });
    on('b-delete-world', () => this.askDelete());
    on('b-worlds-back', () => this.back());
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
    const map = { inventory: 'container', crafting: 'container', furnace: 'container', chest: 'container', creative: 'container', trade: 'container' };
    const id = 's-' + (map[name] || name);
    for (const s of document.querySelectorAll('.screen')) s.hidden = s.id !== id;
    const chat = name === 'chat';
    $('chat-form').hidden = !chat;
    $('chat-log').classList.toggle('open', chat);
    if (chat) $('chat-input').focus();   // right away, so iPad keyboards open from the tap
    else if (document.activeElement === $('chat-input')) $('chat-input').blur();
  }

  isInventoryScreen() { return CONTAINERS.includes(G.screen); }

  openScreen(name, data) {
    if (G.screen === name && !CONTAINERS.includes(name)) return;
    if (G.screen) {
      if (CONTAINERS.includes(G.screen)) this.closeContainer();
      else this.stack.push(G.screen);
    }
    G.screen = name;
    if (CONTAINERS.includes(name)) this.buildContainer(name, data);
    if (name === 'worlds') this.buildWorldList();
    if (name === 'options') this.syncOptions();
    if (name === 'pause') this.syncPause();
    if (name === 'mp') {
      $('mp-name').value = G.settings.name || '';
      this.mpStatus('');
      this.buildOnlineList();
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

  back() {
    const cur = G.screen;
    if (cur === 'death') return;
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
  }

  showLoading(p) {
    this.section('loading');
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
    list.innerHTML = '';
    if (!this.online.some((w) => w.id === this.selectedOnline)) this.selectedOnline = this.online.length ? this.online[0].id : null;
    if (!this.online.length) list.appendChild(h('p', 'empty', 'No online worlds yet. Create one, then send your friends its link.'));
    for (const w of this.online) {
      const row = h('button', 'world-row');
      row.type = 'button';
      row.appendChild(h('strong', null, w.name));
      const d = new Date(w.updated || w.created);
      const who = w.players ? `${w.players} playing now` : `last played ${d.toLocaleDateString()}`;
      row.appendChild(h('span', null, `${w.mode === 'creative' ? 'Creative' : 'Survival'} · ${who} · link …?world=${w.id}`));
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
    if (!res.permanent && !$('mp-status').textContent) {
      this.mpStatus('Note: this server has no database yet, so online worlds are also kept in the browsers of the people who play them. Add a database to make them fully permanent (see the README).');
    }
    this.syncOnlineButtons();
  }

  syncOnlineButtons() {
    const off = !this.selectedOnline || !!this.busy;
    for (const id of ['b-join', 'b-copy-link', 'b-delete-online']) $(id).disabled = off;
    $('b-new-online').disabled = !!this.busy;
  }

  mpName() {
    const name = $('mp-name').value.trim().slice(0, 16);
    if (!name) { this.mpStatus('Type your name first.'); $('mp-name').focus(); return null; }
    G.settings.name = name;
    saveSettings();
    return name;
  }

  async playOnline(id = this.selectedOnline) {
    if (!id || this.busy) return;
    const name = this.mpName();
    if (!name) return;
    this.busy = true;
    this.syncOnlineButtons();
    this.mpStatus('Connecting…');
    try { await G.game.joinWorld(id, name, (t) => this.mpStatus(t)); }
    catch (err) { this.mpStatus(err && err.message ? err.message : 'Could not join that world.'); }
    this.busy = false;
    this.syncOnlineButtons();
  }

  // Opened from a world link (…?world=ID)
  openOnline(id) {
    this.selectedOnline = id;
    this.openScreen('mp');
    if (G.settings.name) this.playOnline(id);
    else this.mpStatus('Type your name, then press Play Selected World to join.');
  }

  async copyLink(id) {
    if (!id) return;
    const link = this.onlineLink(id);
    let ok = false;
    try { await navigator.clipboard.writeText(link); ok = true; } catch { /* clipboard blocked */ }
    if (!ok) { window.prompt('Copy this link and send it to your friends:', link); return; }
    if (G.screen === 'mp') this.mpStatus(`Link copied: ${link}`);
    else {
      const b = $('b-copy-link-pause');
      b.textContent = 'Link copied!';
      setTimeout(() => { b.textContent = 'Copy Link'; }, 2000);
    }
  }

  askDeleteOnline() {
    const w = (this.online || []).find((x) => x.id === this.selectedOnline);
    if (!w) return;
    $('online-delete-name').textContent = w.name;
    $('online-delete-confirm').hidden = false;
  }

  async confirmDeleteOnline() {
    $('online-delete-confirm').hidden = true;
    try { await G.game.deleteOnline(this.selectedOnline); this.mpStatus('World deleted.'); } catch (err) { this.mpStatus(err.message); }
    this.buildOnlineList();
  }

  async createOnlineWorld() {
    const name = this.mpName();
    const b = $('b-create');
    if (!name) { this.back(); return; }
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

  // Shown while getting (back) into an online world
  showBusy(msg) {
    this.stack.length = 0;
    if (CONTAINERS.includes(G.screen)) this.closeContainer();
    G.screen = 'busy';
    this.section('loading');
    $('hud').hidden = true;
    $('load-title').textContent = msg;
    $('load-sub').textContent = '';
    $('load-bar').style.width = '0%';
    this.updateTouchVisibility();
  }

  syncPause() {
    const net = G.net, meta = G.worldMeta;
    const online = !!(meta && meta.online);
    $('mp-box').hidden = !online;
    $('b-quit').textContent = online ? 'Leave World' : 'Save and Quit to Title';
    if (!online) return;
    $('mp-info-head').textContent = 'Online world · anyone with the link can join';
    $('mp-code-show').textContent = meta.online;
    if (!net) { $('mp-players').textContent = ''; return; }
    const names = [net.role === 'host' ? `${net.name} (you)` : net.hostName];
    for (const a of net.players.values()) if (a.id !== 0) names.push(a.name);
    if (net.role === 'client') names.push(`${net.name} (you)`);
    $('mp-players').textContent = names.length > 1 ? 'Playing: ' + names.join(', ') : 'Nobody else is here right now.';
  }

  chatLine(text, sys) {
    const log = $('chat-log');
    const line = h('p', sys ? 'sys' : '', text);
    log.appendChild(line);
    while (log.children.length > 8) log.firstChild.remove();
    setTimeout(() => line.classList.add('old'), 10000);
  }

  toast(text) {
    const t = $('toast');
    t.textContent = text;
    t.classList.add('show');
    this.toastTimer = 2;
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
    $('delete-confirm').hidden = true;
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
    const key = s ? `${s.id}:${s.count}:${s.dmg || 0}` : '';
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
      if (s) this.toast(itemName(s.id));
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
    }
    const survival = !p.creative;
    if (c.survival !== survival) { c.survival = survival; $('stats').style.visibility = survival ? 'visible' : 'hidden'; }
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
    // Health bar for the mob you are fighting
    const fm = G.lastHitMob;
    const showBar = fm && G.clock - G.lastHitTime < 5 && !fm.removed;
    if (showBar) {
      const frac = Math.max(0, fm.hp) / (fm.maxHp || 1);
      const key = fm.def.name + Math.ceil(Math.max(0, fm.hp));
      if (c.mobBar !== key) {
        c.mobBar = key;
        $('mob-name').textContent = `${fm.def.name}  ${Math.ceil(Math.max(0, fm.hp))} / ${fm.maxHp}`;
        $('mob-fill').style.width = (frac * 100).toFixed(1) + '%';
      }
    }
    if (c.mobBarShown !== !!showBar) { c.mobBarShown = !!showBar; $('mob-bar').hidden = !showBar; }
    const burning = p.burning > 0 && !p.dead;
    if (c.burning !== burning) { c.burning = burning; $('burning').hidden = !burning; }
    const poisoned = p.effects.poison > 0;
    if (c.poison !== poisoned) { c.poison = poisoned; $('hearts').classList.toggle('poison', poisoned); }
    const fx = [];
    if (p.effects.poison > 0) fx.push(['Poison', p.effects.poison]);
    if (p.effects.slow > 0) fx.push(['Slowness', p.effects.slow]);
    if (p.hungerEffect > 0) fx.push(['Hunger', p.hungerEffect]);
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
        const biome = chunk ? BIOME_NAMES[chunk.biomes[((Math.floor(z) & 15) << 4) | (Math.floor(x) & 15)]] : '?';
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

  refGet(ref) {
    if (ref.kind === 'result') return this.craftResult();
    if (ref.kind === 'palette') return stack(ref.id, 1);
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

    const titles = { inventory: 'Crafting', crafting: 'Crafting', furnace: 'Furnace', chest: 'Chest', creative: 'Creative Inventory' };
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
      head.firstChild.textContent = (PROFESSIONS[data.prof] || { name: 'Villager' }).name;
      const list = h('div', 'offers');
      data.trades.forEach((tr, i) => list.appendChild(this.offerRow(data, tr, i)));
      panel.appendChild(list);
      this.container.offers = list;
    } else if (kind === 'chest') {
      this.craft = null;
      const g = grid(9);
      for (let i = 0; i < 27; i++) add(g, { kind: 'normal', arr: data.slots, i });
      panel.appendChild(g);
    } else if (kind === 'creative') {
      this.craft = null;
      const pal = grid(9, 'palette');
      for (const id of creativeList()) add(pal, { kind: 'palette', id });
      panel.appendChild(pal);
      panel.appendChild(h('div', 'hint', G.touchMode ? 'Tap an item to put a full stack in the selected hotbar slot.' : 'Click an item to put a full stack in the selected hotbar slot. Right-click puts just one.'));
      const row = h('div', 'hotbar-edit');
      const hb = grid(9);
      for (let i = 0; i < 9; i++) add(hb, { kind: 'select', arr: inv.slots, i });
      row.appendChild(hb);
      const trash = h('button', 'trash', 'Clear');
      trash.type = 'button';
      trash.addEventListener('click', () => { inv.slots[inv.selected] = null; this.invChanged(); sfx('click'); });
      row.appendChild(trash);
      panel.appendChild(row);
      this.refreshContainer();
      return;
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
    this.renderCursor();
    this.hudDirty = true;
  }

  // ---------------------------------------------------------------- villager trades
  offerRow(v, tr, i) {
    const row = h('button', 'offer');
    row.type = 'button';
    const icon = (s) => { const b = h('span', 'offer-item'); const img = document.createElement('img'); img.src = iconURL(s.id); img.alt = ''; if (ICONS[s.id] && ICONS[s.id].width === 16) img.className = 'px'; b.appendChild(img); if (s.count > 1) b.appendChild(h('span', 'count', String(s.count))); b.title = itemName(s.id); return b; };
    row.appendChild(icon(tr.buy));
    if (tr.buy2) row.appendChild(icon(tr.buy2));
    row.appendChild(h('span', 'offer-arrow', '→'));
    row.appendChild(icon(tr.sell));
    row.appendChild(h('span', 'offer-name', itemName(tr.sell.id)));
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
      if (tr.uses >= tr.max) { if (!n) sfx('villager', v.pos, { pitch: 0.7 }); break; }
      if (!this.canAfford(tr)) { if (!n) sfx('villager', v.pos, { pitch: 0.7 }); break; }
      inv.remove(tr.buy.id, tr.buy.count);
      if (tr.buy2) inv.remove(tr.buy2.id, tr.buy2.count);
      const left = inv.add(tr.sell.id, tr.sell.count);
      if (left) G.entities.dropItem(tr.sell.id, left, p.pos.x, p.pos.y + 1, p.pos.z);
      tr.uses++;
      n++;
    } while (many && n < 64);
    if (n) { sfx('villager', v.pos); sfx('pop', null, { vol: 0.5 }); }
    this.refreshContainer();
  }

  renderOffers() {
    const c = this.container;
    if (!c || c.kind !== 'trade' || !c.offers) return;
    for (const row of c.offers.children) {
      const tr = row._trade;
      const out = tr.uses >= tr.max;
      row.classList.toggle('out', out);
      row.classList.toggle('cant', !out && !this.canAfford(tr));
      row.title = out ? 'Out of stock until tomorrow' : '';
    }
  }

  // ---------------------------------------------------------------- recipe book
  buildRecipeBook() {
    const panel = $('recipe-panel');
    panel.innerHTML = '';
    const head = h('div', 'panel-head');
    head.appendChild(h('div', 'panel-title', 'Recipes'));
    const filter = h('button', 'filter');
    filter.type = 'button';
    const syncFilter = () => {
      const all = this.recipeFilter === 'all';
      filter.textContent = all ? 'All' : 'Craftable';
      filter.setAttribute('aria-pressed', String(!all));
      filter.title = all ? 'Showing every recipe. Tap to show only what you can craft.' : 'Showing what you can craft. Tap to show every recipe.';
    };
    filter.addEventListener('click', () => {
      this.recipeFilter = this.recipeFilter === 'all' ? 'craftable' : 'all';
      syncFilter();
      this.book.key = '';
      this.renderRecipeBook();
      sfx('click');
    });
    syncFilter();
    head.appendChild(filter);
    panel.appendChild(head);
    const grid = h('div', 'grid recipes');
    const empty = h('p', 'empty', 'Nothing to craft yet. Break a tree trunk to collect logs, then come back.');
    const status = h('div', 'status');
    const hint = h('div', 'hint', G.touchMode ? 'Tap a recipe to craft it. Hold it to craft a full stack.' : 'Click a recipe to craft it. Shift-click to craft a full stack.');
    panel.append(grid, empty, status, hint);
    this.book = { grid, empty, status, key: '', statusTimer: 0 };
    this.renderRecipeBook();
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
    const count = this.craftCount();
    const size = this.craft.n;
    const list = [];
    RECIPES.forEach((rec, i) => {
      const fits = rec.size <= size;
      const ok = fits && craftableTimes(count, rec) > 0;
      if (this.recipeFilter === 'all' || ok) list.push({ rec, i, ok, fits });
    });
    list.sort((a, c) => (c.ok - a.ok) || (c.fits - a.fits) || (a.i - c.i));
    const key = list.map((e) => e.i + (e.ok ? 'y' : e.fits ? 'n' : 't')).join(',');
    if (key === b.key) return;
    b.key = key;
    b.grid.innerHTML = '';
    for (const e of list) b.grid.appendChild(this.recipeTile(e));
    b.empty.hidden = list.length > 0;
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
      const left = p.inv.add(s.id, s.count, s.dmg);
      if (left) G.entities.dropItem(s.id, left, p.pos.x, p.pos.y + 1, p.pos.z);
      this.craft.slots[i] = null;
    });
  }

  // One click in the recipe book crafts straight into the inventory
  craftFromBook(rec, stackful) {
    this.hideTooltip();
    if (!this.craft || rec.size > this.craft.n) {
      this.setBookStatus('Needs a crafting table', true);
      sfx('click', null, { vol: 0.4 });
      return;
    }
    const p = G.player, inv = p.inv;
    this.returnGrid();
    const times = craftableTimes((id) => inv.count(id), rec);
    if (times < 1) {
      this.setBookStatus('Missing ingredients', true);
      sfx('click', null, { vol: 0.4 });
      this.refreshContainer();
      return;
    }
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
      const n = shift || G.touchMode ? maxStack(ref.id) : (button === 2 ? 1 : maxStack(ref.id));
      inv.slots[inv.selected] = stack(ref.id, n);
      this.toast(itemName(ref.id));
      this.invChanged();
      return;
    }
    if (ref.kind === 'select') { inv.selected = ref.i; this.invChanged(true); return; }
    if (ref.kind === 'result') { this.takeResult(shift); return; }
    const arr = ref.arr, i = ref.i;
    const s = arr[i];
    const c = this.cursor;
    if (shift && s) { this.quickMove(ref); this.afterChange(ref); return; }
    if (ref.kind === 'output') {
      if (!s) return;
      if (!c) { this.cursor = s; arr[i] = null; }
      else if (sameItem(c, s) && c.count + s.count <= maxStack(s.id)) { c.count += s.count; arr[i] = null; }
      this.afterChange(ref);
      return;
    }
    if (ref.kind === 'fuel' && c && !fuelValue(c.id)) return;
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
    if (ref.arr === inv.slots) {
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
    G.entities.dropItem(c.id, c.count, p.pos.x + d.x * 0.5, p.eyeY - 0.3, p.pos.z + d.z * 0.5, d.x * 5, 2, d.z * 5, c.dmg).pickupDelay = 1.5;
    this.cursor = null;
  }

  closeContainer() {
    const p = G.player;
    const giveBack = (s) => {
      if (!s) return;
      const left = p.inv.add(s.id, s.count, s.dmg);
      if (left) G.entities.dropItem(s.id, left, p.pos.x, p.pos.y + 1, p.pos.z);
    };
    if (this.craft) { this.craft.slots.forEach(giveBack); this.craft = null; }
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
    const it = ITEMS[s.id];
    let text = itemName(s.id);
    if (it && it.durability) text += `\nDurability: ${it.durability - (s.dmg || 0)} / ${it.durability}`;
    if (it && it.food) text += `\nRestores ${it.food / 2} food`;
    t.textContent = text;
    t.hidden = false;
    t.style.transform = `translate(${e.clientX + 14}px, ${e.clientY - 30}px)`;
  }

  hideTooltip() { $('tooltip').hidden = true; }
}
