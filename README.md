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
3. Anyone who opens the link (or picks the world in the Multiplayer list) joins that world.

How it works:

- The first player in runs the world in their browser: mobs, water, fire, furnaces and the time of day. Everyone else joins them.
- The world is sent to the server every 10 seconds and when that player leaves. If they leave while others are playing, the next player takes over automatically after a short "Taking over the world…" screen.
- Everyone has their own inventory, health, hunger and position, saved under their account, so nobody else can ever be you. Sign in with the same account on any device. Passwords are stored as salted scrypt hashes, never as text.
- Only the player who created a world can delete it.
- The time of day is the same for everyone. The night is skipped only when everyone is in bed.
- You can always hit other players, with fists, weapons or arrows.
- Dropped items are the same for everyone, and only one player can pick each one up.
- Chests, furnaces and villager trades are shared.
- Each dimension runs on its own, so friends can be in the Overworld, the Nether and the End at the same time. You come back wherever you left.
- Animals, villagers and dropped items are kept when you walk away.
- Press **T** (or the **T** button on iPad) to chat.

## Deploy on Render

1. On Render, choose **New → Blueprint** and connect this repo. `render.yaml` sets it up as a free Node web service.
2. To set it up by hand instead, choose **New → Web Service** with:
   - Build command: `npm install`
   - Start command: `npm start`

### Make online worlds permanent (free database)

A free Render server loses its files whenever it restarts, which happens after about 15 minutes with nobody on. Until you add a database, online worlds are also backed up in the browser of whoever last ran them, and restored from there. For worlds that are truly permanent, add a free Postgres database from [Neon](https://neon.tech):

1. Sign up at https://console.neon.tech/signup and create a project (any name, any region).
2. On the project dashboard, click **Connect** and copy the connection string. It starts with `postgresql://`.
3. In Render, open the Blockcraft service, go to **Environment**, and add a variable:
   - key: `DATABASE_URL`
   - value: the string you copied
4. Save. Render redeploys, and from then on every online world and every account is stored in the database.

Without a database, accounts are kept in the server's files. On a free Render server those are wiped when it restarts, so add the database before you rely on accounts.
