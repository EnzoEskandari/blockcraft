# Blockcraft

A block-building survival game that runs in the browser, on laptop or iPad. Features:

- Procedural worlds
- Crafting
- Armor
- Villages with traders
- Structures
- Night mobs
- Online multiplayer

The game is plain HTML and JavaScript; Three.js loads from a CDN. A small Node server (`server.js`) serves the files and relays multiplayer messages.

## Play locally

```bash
npm install
npm start
```

Then open http://localhost:8080.

## Multiplayer

1. **Host:** open one of your worlds, pause, and choose **Open to Friends**. You'll get a 4-letter code.
2. **Friends:** on the title screen, choose **Multiplayer** and enter that code.

How it works:

- The host's browser runs the world: mobs, water, fire, furnaces and the time of day. Guests send what they do and draw what the host sends back.
- Chests, furnaces and villager trades are shared.
- Items you throw or drop are shared too, but block and mob drops go only to whoever broke the block or made the kill.
- The night is skipped only when everyone is in bed.
- Press **T** (or the **T** button on iPad) to chat.
- The host's save keeps each guest's inventory, so they can come back later.

## Deploy on Render

1. On Render, choose **New → Blueprint** and connect this repo.
2. `render.yaml` sets it up as a free Node web service.

To set it up by hand instead, choose **New → Web Service** with:

- Build command: `npm install`
- Start command: `npm start`
