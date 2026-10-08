# Blockcraft

A block-building survival game that runs in the browser, on laptop or iPad. Features:

- Procedural worlds
- Crafting
- Armor
- Villages with traders who level up, take jobs and go to bed at night
- Enchanting, experience levels and achievements
- Structures
- Night mobs
- The Nether and the End, with their mobs, fortresses, bastions, strongholds, end cities and the Void Dragon
- Online multiplayer worlds

The game is plain HTML and JavaScript; Three.js loads from a CDN. A small Node server (`server.js`) serves the files, keeps the online worlds, and relays multiplayer messages.

## Play locally

```bash
npm install
npm start
```

Then open http://localhost:8080. Online worlds are saved in the `data/` folder.

## The Nether and the End

- **The Nether:** build an obsidian frame (at least 4 wide and 5 tall) and light it with flint and steel. Stand in the portal for 4 seconds. Obsidian comes from water meeting a lava source (use buckets) and needs a diamond pickaxe to mine.
- **Inside:** there are five biomes. Fortresses hold cinders, whose rods make cinder powder. Snoutlings leave you alone if you wear gold, and trade if you toss them a gold ingot.
- **Finding the End:** craft an Eye of the Shade from a shade pearl and cinder powder. Thrown eyes fly toward the nearest stronghold, 640 to 960 blocks from the centre of the world. Dig down, and fill the 12 frames in its portal room.
- **The End:** break the crystals on the pillars (they heal the Void Dragon), then beat the dragon. Its exit portal plays the ending and sends you home. A gateway also opens to the outer islands and their end cities.
- **Shades** only attack if you look them in the eyes, or hit them.

## Online worlds

Online worlds are separate from your singleplayer worlds. They live on the server, and each has a six-letter join code like `K7PQ2X` (and a permanent link, `https://your-site.onrender.com/?world=K7PQ2X`). Neither ever changes.

1. On the title screen choose **Multiplayer** and sign in, or create an account with a username and password. Then click **Create Online World**.
2. Tell your friends the join code. It is shown under the world in the Multiplayer list, and in the game menu while you play. (Or click **Copy Link** and send the link.)
3. A friend types the code into **Join With Code** on their Multiplayer screen (or opens the link). From then on the world is in their own list so they can come back any time. Nobody else sees your world in their list until you give them the code or the link.

How it works:

- The first player in runs the world in their browser: mobs, water, fire, furnaces and the time of day. Everyone else joins them.
- The world is sent to the server every 10 seconds and when that player leaves. If they leave while others are playing, the next player takes over automatically after a short "Taking over the world…" screen.
- Everyone has their own inventory, health, hunger and position, saved under their account, so nobody else can ever be you. Sign in with the same account on any device. Passwords are stored as salted scrypt hashes, never as text.
- Only the player who created a world can delete it for everyone. Anyone, the creator included, can take a world off their own list instead; typing its join code (or opening its link) puts it back.
- You can see what other players are wearing and holding.
- The time of day is the same for everyone. The night is skipped only when everyone is in bed.
- You can always hit other players, with fists, weapons or arrows.
- Dropped items are the same for everyone, and only one player can pick each one up.
- Chests, furnaces and villager trades are shared.
- Each dimension runs on its own, so friends can be in the Overworld, the Nether and the End at the same time. You come back wherever you left.
- Animals, villagers and dropped items are kept when you walk away.
- Press **T** (or the **T** button on iPad) to chat.

## Sun & Storms (1.9.1) and A New Look (1.9)

- **1.9.3** made shadows cheap: the land's shadow picture (`drawLand`) is drawn again only when the sun has moved on a little, you have walked eight blocks from its middle, or a chunk in it was re-meshed (`landChanged`); animals, players and dropped items have a small picture of their own, drawn every frame (`drawBodies`), and the lamp's views are split the same way. The pictures are read with the graphics card's own depth comparison (`sampler2DShadow`), four readings for a soft edge. With Shadows off the blocks get the shader without any of this (`SHADOWS` define); if a card refuses the shadow shader, `render()` notices the error and falls back to it.
- **1.9.2** made shadows keep to the pixels of the blocks they fall on: the fragment shader moves each lookup to the middle of the texture pixel it is in (`snap` in `CHUNK_FS`), from where the block stands rather than where the wind has pushed it. Plants cast shadows and are looked up a little towards the light so as not to shade themselves.
- **Lamp shadows** (1.9.2): the lamp lighting the place you are in or looking at (`findLamp`) gets six small depth views side by side in one picture (`drawLamp`), and lamp light is dimmed where that lamp is the one lighting a spot but cannot see it. Lamp light itself still spreads block to block as before.
- **The character is kept with the account** (1.9.2): `POST /api/look`, returned with the account on sign-in and `/api/me`; `adoptAccountLook` in `js/skins.js` decides which copy wins.

- **Sunlight and shadows** (`js/render.js`). The mesher no longer bakes a shade into each side of a block; it marks which way the side faces (the fourth byte of `aColor`), and the chunk shader lights it from where the sun or moon is. Part of the sky's light comes straight from the sun and is cut off by a shadow map: the land around you drawn from the sun's side into a depth picture (`drawShadows`), centred on you and moved a whole texel at a time so it does not shimmer. What is drawn is the faces turned *away* from the sun, so nothing lit can shade itself and no bias is needed. Beyond the map, and with **Shadows** off in Options, the sun is counted wherever the sky is open. Lamp light is added to daylight instead of replacing it.
- **Water** mirrors the sky more the flatter you look across it and glitters under the sun, one glint to a texture pixel. **Plants and leaves** sway (the mesher marks which corners move in the fourth byte of `aTex`).
- **Weather** (`js/weather.js`): clear, cloudy, rain and thunder, each lasting a few minutes and following one another by chance. Whoever runs a world decides it; it is saved with the world and sent to guests with the time. What the sky does with it (cloud cover, grey light, no sun) is in `updateSky`; rain and snow are sheets of streaks over each column of blocks around you, as in the original.
- **Characters** (`js/skins.js`): a look is ten parts (skin, face, eyes, hair, hair colour, hat, glasses, top, trousers, back), each a key, saved in the browser and sent to other players as `L1:` and the keys. It is drawn two ways from the same parts: as a model in the world and as a flat picture (`skinDoll`) on the title screen and the Character page. Some parts are prizes, unlocked by the hardest achievements. The skins of 1.9 are the ready-made characters, and their names still work as looks.
- The blocks' textures are the ones from before 1.9 (`js/textures.js`; the 1.9 repaint was taken back out).
- The boss of 1.8 is called **the Wither** (its internal name is still `blight`, so saves are untouched).

## Lands & Legends (1.8)

- **27 lands.** Each climate now has several kinds of land: savanna, badlands, birch and flower forests, cherry groves, meadows, sunflower plains, snowy taiga, ice spikes, old growth taiga, bamboo jungle, mushroom islands, snowy peaks, beaches and four kinds of ocean (`World.columnNew` in `js/world.js`; what grows where is in the `TREES` and `COVER` tables above it).
- **Ten kinds of village** (`STYLE` and `VILLAGE_LANDS` in `js/structures.js`), with market stalls, flower gardens and lookout towers.
- **Dungeons, mineshafts and buried treasure.** Mineshaft galleries have about five times as much ore in their walls as ordinary rock. Every sunken ship's treasure chest holds a map; the map screen draws the land round the treasure with a red cross on it.
- **Outposts** are watchtowers with one winding staircase of half blocks; **desert temples** have a pressure plate over their TNT. Pressure plates set off TNT and open doors for players and mobs alike.
- **The Wither** (`js/dimmobs.js`): three Charred Skulls in a row on a T of soul sand wake it. It swells for eleven seconds, bursts, and then fights as the old three-headed terror does: the middle head hunts the nearest player while the others pick victims of their own, it mends a point of health a second, tears through blocks, and at half health grows a shell that arrows cannot pierce. It leaves a Nether Star, for a **beacon**.
- All of it appears only in land nobody has seen (generator version 4). In a world from an earlier version the new land eases into the old over two chunks, and a structure is either one of the old rules that reaches into explored land (kept, and built as it always was) or one of the new rules that keeps wholly to unseen land (`regionPlan` in `js/structures.js`).

## Trades & Enchantments (1.7)

- **Experience:** killing monsters, mining ores, smelting, fishing, trading and achievements leave green orbs that fill the bar over the hotbar. Dying leaves some of it where you fell.
- **Enchanting table** (a book, two diamonds, four obsidian): put in an item and lapis lazuli and pick one of three offers; it costs one to three levels. Bookshelves two blocks from the table, with nothing in between, raise the level it can reach: fifteen bring the best offer to level 30, the most there is. Books can be enchanted too.
- **Enchantments:** all 39 from Minecraft's table, bow, crossbow, trident and fishing rod, with its numbers: Sharpness, Smite, Bane of Arthropods, Knockback, Fire Aspect, Looting, Sweeping Edge, Efficiency, Silk Touch, Fortune, Unbreaking, Mending, the four Protections, Feather Falling, Thorns, Respiration, Aqua Affinity, Depth Strider, Frost Walker, Soul Speed, Swift Sneak, Power, Punch, Flame, Infinity, Multishot, Piercing, Quick Charge, Loyalty, Impaling, Riptide, Channeling, Luck of the Sea, Lure and the two curses. (There is no weather here, so Channeling calls its lightning under any open sky, and Riptide works in water.)
- **Anvil** (three iron blocks over four ingots): put a book on an item, join two items of a kind, or mend an item with what it is made of, for levels. **Grindstone:** takes enchantments off and gives some experience back.
- **Villagers** start as Novices and rise to Apprentice, Journeyman, Expert and Master as you trade with them; each level adds trades (the list shows what is still locked). Librarians sell enchanted books, smiths enchanted tools and armour.
- **Job blocks:** a villager with no work walks to a free composter (farmer), lectern (librarian), blast furnace (armorer), grindstone (weaponsmith), smithing table (toolsmith), smoker (butcher), fletching table (fletcher), brewing stand (cleric), loom (shepherd), cauldron (leatherworker) or stonecutter (mason) within 16 blocks and takes up its trade. Break the block before it has ever traded and it is out of work again.
- **Bedtime:** from sunset villagers walk to a bed near home, opening and shutting doors on the way, and sleep until morning. Using a bed one is asleep in sends it to find another.
- **New items:** fishing rod (cast into water, pull in when the bobber dips), crossbow (hold use to load, press again to shoot), trident (dropped by the Drowned; thrown with use), experience bottles.
- **Achievements:** 53 of them, in five groups, each worth experience. Press **L** or open them from the game menu. They follow the goals of Minecraft's advancements that can be done here, under Blockcraft's own names.
- **Diamonds:** half as many veins again, everywhere.

## Shields and the off hand (1.6.1)

- **Shield:** six planks and an iron ingot. Hold right click to raise it (on iPad, hold the shield button that appears above jump). It stops hits, arrows, fireballs and blasts that come from in front; axes knock it down for five seconds.
- **Off hand:** press **F** to swap what you are holding into it (on iPad, tap the slot left of the hotbar). Its item is used when the main hand has nothing to do, so a torch there can be placed while you hold a pickaxe.
- **Monsters by light level:** they appear anywhere with no torch or lava light and little sky light, day or night, and never within 24 blocks of a player. Light your caves and rooms.

**1.6.2:** held items sway gently instead of shaking, and fire spreads slowly, burns out by itself and can be put out by punching the flames or pouring water on them.

## Building Blocks (1.6.3)

- **Slabs:** three blocks in a row make six slabs, in 17 materials (the woods, stone, cobblestone, sandstone, brick, stone brick, nether brick, quartz, cobbled deepslate, blackstone and end stone brick). Click the top of a block or the lower half of its side for a bottom slab, the underside or the upper half for a top slab. A second slab of the same kind makes the full block. You walk up half-block steps without jumping.
- **Trapdoors:** six planks of one wood (two rows of three) make two. Click to open and shut. They sit in the bottom or top half of a block, chosen the same way as slabs.
- **Signs:** six planks over a stick make three. On top of a block a sign stands on a post, on the side of one it hangs flat. Write up to four lines of 15 letters; click a sign to change it. Everyone in an online world sees the words.
- **Torches on walls:** a torch goes on the side of any solid block (glass, leaves, slabs and chests included), on the floor, or on whichever wall is beside it. It drops if its wall or floor is taken away.
- **Cactus:** touching one pricks you for half a heart every half second, and monsters and animals too.

## Admins

The account called **Enzo** is the server admin (to change who, set `ADMINS` on Render to a comma-separated list of usernames). Admins can make other players admins too.

In any online world's chat (press **T**):

- `/kill name`: kills that player.
- `/kick name`: sends them out of the world.
- `/ban name reason`: bans them from multiplayer and signs them out everywhere. `/unban name` lets them back.
- `/op name`, `/deop name`: give or take away admin.
- `/reload`: everyone in an online world saves, loads the newest version of the game and comes straight back in.
- `/where name`: where that player is, or where they were when they were last online.
- `/tp name`: go to them (or to where they were last seen), when you are in the same world and dimension. `/bring name`: fetch them to you.
- Commands and their answers show only to whoever typed them, never in the chat.
- `/creative`, `/survival` (or `/gamemode creative`): switch your own mode, in any world. The game menu has a button for the same thing.
- `/time day`, `noon`, `sunset`, `night`, `midnight`, `sunrise`, or an hour such as `/time 15` or `/time 7:30`: set the time of day.
- `/weather clear`, `cloudy`, `rain` or `thunder`, with a number of minutes if you like (`/weather rain 5`): change the weather.
- `/tp x y z` goes to a spot, and `/tp x z` to the ground there.
- `/time`, `/weather`, `/tp x y z`, `/creative` and `/survival` also work for an admin in a world that is not online (press **T**).
- `/players`: who is online, and where. `/accounts`: every account. `/list`: who is in this world (anyone can use this).

Admins see every online world on the server in their Multiplayer list (marked *Admin · made by …*) and can open any of them.

The **Admin** link on the Multiplayer screen (next to Sign out) lists every account, with buttons for the same things.

Nobody else can sign up as an admin name. If the Enzo account doesn't exist yet on your server: in Render, open the service, go to **Environment**, add `ADMIN_PASSWORD` with the password you want, save, then click **Create Account** as Enzo with that same password. If the account already exists, just sign in. The password is never written in this repo.

## Updates on the title screen

The title screen shows the newest update as Minecraft does: its version in the corner, its own splash texts, a "New:" link to **What's New**, and a slowly turning view of a place that fits it behind the menus. Updates are listed in `js/updates.js`, newest first. Each has a version, a name, notes, splashes and a scene (a world seed, a spot in it, and any blocks to place there).

## Deploy on Render

1. On Render, choose **New → Blueprint** and connect this repo. `render.yaml` sets it up as a free Node web service.
2. To set it up by hand instead, choose **New → Web Service** with:
   - Build command: `npm install`
   - Start command: `npm start`

### Make online worlds permanent (free database)

**Add a database before you rely on online worlds.** A free Render server forgets its files every time it restarts: after about 15 minutes with nobody on, and every time the game is updated. Without a database, accounts, online worlds and everyone's items go with them. (Each player's browser keeps a copy of the world and of their own items, so they usually come back after you make your account again, but that's only a safety net.)

Add a free Postgres database from [Neon](https://neon.tech):

1. Sign up at https://console.neon.tech/signup and create a project (any name, any region).
2. On the project dashboard, click **Connect** and copy the connection string. It starts with `postgresql://`.
3. In Render, open the Blockcraft service, go to **Environment**, and add a variable:
   - key: `DATABASE_URL`
   - value: the string you copied
4. Save. Render redeploys, and from then on every online world, account and inventory is stored in the database.

To check it worked, open **Multiplayer** in the game. Under the list it says *"Online worlds, accounts and items are saved in the database, with daily backups."* If it shows a red warning instead, the database isn't set up.

## Caves & Ores (1.6)

Caves are winding tunnels that slope down gently, branch and open onto the surface, with big caverns deep down. Below y 31 is deepslate, and ores sit at the heights Minecraft uses: diamonds and redstone near the bottom, iron and copper in the middle and high in the mountains, coal higher up, and emeralds only in mountains. Places you had already been in older worlds keep their old caves and ores. The new ones appear everywhere else.

## Keeping worlds safe through updates

Updating the game never deletes worlds:

- **Old saves keep loading.** Every block and item keeps its number forever, and every enchantment, profession and achievement its name (`tools/ids.json`); worlds saved by every earlier version are checked against each new one before it ships (`tools/check-saves.html`).
- **Explored land is left alone**, the way Minecraft leaves the chunks it has saved. A world remembers which version of the generator first made every chunk anyone has been to (`World.gens`, saved as `gens`), and those chunks are always made that way again. What an update adds to the land (new caves in 1.6, job blocks and door steps in villages in 1.7, the new lands and structures of 1.8) only appears in places nobody has seen; a village someone has seen part of is finished the way it was begun. When the generator changes, raise `GEN` in `js/world.js` and make the new part depend on `world.genAt(cx, cz)` (or `plan.gen` for structures).
- **Updates don't interrupt players.** When Render restarts the server for an update, whoever is running each world sends one last save first. Everyone reconnects by themselves a few seconds later, with the same items. If the page is out of date, the game says to reload it.
- **The database is never skipped.** If the database can't be reached, the server waits for it instead of saving anywhere temporary. The game still loads, and online worlds open again as soon as the database answers.
- **Daily backups.** Before each online world's first save of the day, the server keeps a copy of it and of everyone's items, for the last 7 days. To roll a world back, run `node tools/restore.mjs` with your `DATABASE_URL` (instructions at the top of that file).
- **Singleplayer worlds** are kept in your browser, and updates don't touch them. For extra safety, use **Save Backup File** on the Select World screen to download a world as a file, and **Open Backup File** to bring it back on any device. On iPad, add Blockcraft to your Home Screen (Share → Add to Home Screen). Safari can clear a website's data after a week without a visit, but not a Home Screen app's.

Before each update:

```bash
node tools/check-ids.mjs
```

Then serve the folder (for example `python3 -m http.server`) and open `/tools/check-saves.html`, which should say *All old saves load with nothing lost.*
