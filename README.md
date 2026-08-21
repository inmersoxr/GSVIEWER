# GSVIEWER

Static Gaussian Splat viewer, built from [playcanvas/supersplat-viewer](https://github.com/playcanvas/supersplat-viewer) (MIT licensed) with visible branding removed.

## Structure

- `index.html`, `index.css`, `index.js`, `index.js.map` — VIEWER (built from the official source, unmodified except branding text and a minimal scene selector)
- `settings.json` — viewer configuration (background, camera, post-effects)
- `scenes/S2.sog`, `scenes/S3.sog`, `scenes/S4.sog` — CONTENT (Gaussian Splat scenes, SOG runtime format)
- `scenes/S2.voxel.json` + `scenes/S2.voxel.bin` — voxel collision data for S2 (Walk Mode), loaded via the viewer's native `?collision=` mechanism

The page loads `scenes/S2.sog` by default, with its voxel collision data, so Walk Mode is available. A small selector (top-right) switches between scenes by reloading with `?content=./scenes/SX.sog` (and `?collision=./scenes/SX.voxel.json` for scenes that have one).

To add collision data for another scene, drop `SX.voxel.json` + `SX.voxel.bin` into `scenes/` (same basename, both required) and set `collision: './scenes/SX.voxel.json'` in the `scenes` list in `index.html`.

To add or replace a scene, drop a `.sog` file into `scenes/` and update the `scenes` list in the inline script at the bottom of `index.html` — no rebuild needed.

## Local preview

```sh
npx serve .
```

## License

Viewer code derived from `@playcanvas/supersplat-viewer`, MIT License, Copyright (c) PlayCanvas. See upstream repository for full license text.
