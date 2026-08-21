# GSVIEWER

Static Gaussian Splat viewer, built from [playcanvas/supersplat-viewer](https://github.com/playcanvas/supersplat-viewer) (MIT licensed) with visible branding removed.

## Structure

- `index.html`, `index.css`, `index.js`, `index.js.map` — VIEWER (built from the official source, unmodified except branding text and a minimal scene selector)
- `settings.json` — viewer configuration (background, camera, post-effects)
- `scenes/S2.sog`, `scenes/S3.sog`, `scenes/S4.sog` — CONTENT (Gaussian Splat scenes, SOG runtime format)
- `scenes/S2.voxel.json` + `scenes/S2.voxel.bin` — voxel collision data for S2 (Walk Mode), loaded via the viewer's native `?collision=` mechanism
- `scenes/S2.settings.json` — the scene's real publication settings (initial camera pose), loaded via `?settings=`. On the original superspl.at publication this is server-side embedded straight into the HTML, not fetched — we recovered its exact values (`window.sse.settings` on the live page) and saved it as a normal file, which the viewer's own `?settings=` mechanism already supports natively.
- `settings.json` (root) — generic fallback for scenes with no recovered publication settings (S3/S4): `cameras: []` so the viewer auto-frames from the gsplat's own bounding box instead of guessing a pose. Do NOT put a made-up camera pose here — an empty `cameras` array is the correct default for an unknown scene.

The page loads `scenes/S2.sog` + its collision + its real settings by default, so Walk Mode and the (auto-generated) camera animation both match the original publication. A small selector (top-right) switches between scenes, setting/clearing `?content=`, `?collision=` and `?settings=` together for whichever of those each scene has.

To add another scene with its own recovered publication data, drop `SX.sog`, and optionally `SX.voxel.json`+`SX.voxel.bin` and `SX.settings.json`, into `scenes/`, then add an entry with those paths (or `null` for the ones you don't have) to the `scenes` list in `index.html`. Never hand-write a `SX.settings.json` — only use one recovered from the actual publication, otherwise leave `settings: null` and let the generic auto-frame default take over.

To add or replace a scene, drop a `.sog` file into `scenes/` and update the `scenes` list in the inline script at the bottom of `index.html` — no rebuild needed.

## Local preview

```sh
npx serve .
```

## License

Viewer code derived from `@playcanvas/supersplat-viewer`, MIT License, Copyright (c) PlayCanvas. See upstream repository for full license text.
