// Saved worlds store blocks and items by number, so a number must never change meaning or old worlds
// would turn into the wrong blocks. tools/ids.json lists every number ever used (and every name saves keep:
// enchantments, professions, achievements). Run this before each update:
//   node tools/check-ids.mjs            fails if an old number changed
//   node tools/check-ids.mjs --update   also adds new numbers to the list
import { readFileSync, writeFileSync } from 'node:fs';
import { BLOCKS, ITEMS } from '../js/blocks.js';
import { ENCH_KEYS } from '../js/enchant.js';
import { PROFESSIONS } from '../js/villagers.js';

const file = new URL('./ids.json', import.meta.url);
const locked = JSON.parse(readFileSync(file, 'utf8'));
const now = {};
BLOCKS.forEach((d, i) => { if (d) now[i] = d.key; });
ITEMS.forEach((d, i) => { if (d && !(i in now)) now[i] = d.key; });
// Saves also hold some things by name: enchantments on items, villagers' professions, achievements made.
// Those names must stay too (a renamed enchantment would vanish from every item that has it).
for (const k of ENCH_KEYS) now['enchantment:' + k] = 'kept by name';
for (const k of Object.keys(PROFESSIONS)) now['profession:' + k] = 'kept by name';
for (const m of readFileSync(new URL('../js/advancements.js', import.meta.url), 'utf8').matchAll(/^  \{ key: '([a-z_]+)', tab:/gm)) now['achievement:' + m[1]] = 'kept by name';
let bad = 0;
for (const [id, key] of Object.entries(locked)) {
  if (now[id] !== key) { bad++; console.error(`#${id} was "${key}" but is now ${now[id] ? `"${now[id]}"` : 'gone'}`); }
}
const added = Object.keys(now).filter((id) => !(id in locked));
if (bad) { console.error(`${bad} id(s) changed: old saves would break. Give new things new numbers instead.`); process.exit(1); }
if (added.length && process.argv.includes('--update')) {
  for (const id of added) locked[id] = now[id];
  writeFileSync(file, JSON.stringify(locked, null, 0).replace(/,"/g, ',\n"') + '\n');
}
console.log(`ok: ${Object.keys(locked).length} ids unchanged${added.length ? `, ${added.length} new (${process.argv.includes('--update') ? 'added' : 'run with --update to add'})` : ''}`);
