# Blockcraft

A block-building survival game that runs in the browser, on laptop or iPad. Features:

- Procedural worlds
- Crafting
- Armor
- Villages with traders
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

Online worlds are separate from your singleplayer worlds. They live on the server, and each has a permanent link like `https://your-site.onrender.com/?world=K7PQ2X`.

1. On the title screen choose **Multiplayer** and sign in, or create an account with a username and password. Then click **Create Online World**.
2. Click **Copy Link** and send it to your friends. The link never changes.
3. Anyone who opens the link joins that world, and from then on it is in their own Multiplayer list so they can come back any time. Nobody else sees your world in their list until you give them the link.

How it works:

- The first player in runs the world in their browser: mobs, water, fire, furnaces and the time of day. Everyone else joins them.
- The world is sent to the server every 10 seconds and when that player leaves. If they leave while others are playing, the next player takes over automatically after a short "Taking over the world…" screen.
- Everyone has their own inventory, health, hunger and position, saved under their account, so nobody else can ever be you. Sign in with the same account on any device. Passwords are stored as salted scrypt hashes, never as text.
- Only the player who created a world can delete it. Anyone else can remove it from their own list (the link still works).
- You can see what other players are wearing and holding.
- The time of day is the same for everyone. The night is skipped only when everyone is in bed.
- You can always hit other players, with fists, weapons or arrows.
- Dropped items are the same for everyone, and only one player can pick each one up.
- Chests, furnaces and villager trades are shared.
- Each dimension runs on its own, so friends can be in the Overworld, the Nether and the End at the same time. You come back wherever you left.
- Animals, villagers and dropped items are kept when you walk away.
- Press **T** (or the **T** button on iPad) to chat.

## Shields and the off hand (1.6.1)

- **Shield:** six planks and an iron ingot. Hold right click to raise it (on iPad, hold the shield button that appears above jump). It stops hits, arrows, fireballs and blasts that come from in front; axes knock it down for five seconds.
- **Off hand:** press **F** to swap what you are holding into it (on iPad, tap the slot left of the hotbar). Its item is used when the main hand has nothing to do, so a torch there can be placed while you hold a pickaxe.
- **Monsters by light level:** they appear anywhere with no torch or lava light and little sky light, day or night, and never within 24 blocks of a player. Light your caves and rooms.

**1.6.2:** held items sway gently instead of shaking, and fire spreads slowly, burns out by itself and can be put out by punching the flames or pouring water on them.

## Admins

The account called **Enzo** is the server admin (to change who, set `ADMINS` on Render to a comma-separated list of usernames). Admins can make other players admins too.

In any online world's chat (press **T**):

- `/kill name`: kills that player.
- `/kick name`: sends them out of the world.
- `/ban name reason`: bans them from multiplayer and signs them out everywhere. `/unban name` lets them back.
- `/op name`, `/deop name`: give or take away admin.
- `/players`: who is online, and where. `/accounts`: every account. `/list`: who is in this world (anyone can use this).

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

- **Old saves keep loading.** Every block and item keeps its number forever (`tools/ids.json`), and worlds saved by every earlier version are checked against each new one before it ships (`tools/check-saves.html`).
- **Updates don't interrupt players.** When Render restarts the server for an update, whoever is running each world sends one last save first. Everyone reconnects by themselves a few seconds later, with the same items. If the page is out of date, the game says to reload it.
- **The database is never skipped.** If the database can't be reached, the server waits for it instead of saving anywhere temporary. The game still loads, and online worlds open again as soon as the database answers.
- **Daily backups.** Before each online world's first save of the day, the server keeps a copy of it and of everyone's items, for the last 7 days. To roll a world back, run `node tools/restore.mjs` with your `DATABASE_URL` (instructions at the top of that file).
- **Singleplayer worlds** are kept in your browser, and updates don't touch them. For extra safety, use **Save Backup File** on the Select World screen to download a world as a file, and **Open Backup File** to bring it back on any device. On iPad, add Blockcraft to your Home Screen (Share → Add to Home Screen). Safari can clear a website's data after a week without a visit, but not a Home Screen app's.

Before each update:

```bash
node tools/check-ids.mjs
```

Then serve the folder (for example `python3 -m http.server`) and open `/tools/check-saves.html`, which should say *All old saves load with nothing lost.*
