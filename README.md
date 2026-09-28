# Blockcraft

A block-building survival game that runs in the browser, on laptop or iPad. Features:

- Procedural worlds
- Crafting
- Armor
- Villages with traders
- Structures
- Night mobs

It's pure static HTML and JavaScript, so there's no build step. Three.js loads from a CDN.

## Play locally

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000.

## Deploy on Render

1. On Render, choose **New → Blueprint** (or **New → Static Site**) and connect this repo.
2. Settings:
   - Build command: *(empty)*
   - Publish directory: `.`

`render.yaml` already holds this config.
