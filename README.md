# GSVIEWER

Static Gaussian Splat viewer, built from [playcanvas/supersplat-viewer](https://github.com/playcanvas/supersplat-viewer) (MIT licensed) with visible branding removed.

## Structure

- `index.html`, `index.css`, `index.js`, `index.js.map` — VIEWER (built from the official source, unmodified except branding text and a minimal scene selector)
- `settings.json` (root) — generic fallback for scenes with no recovered publication settings: `cameras: []` so the viewer auto-frames from the gsplat's own bounding box instead of guessing a pose. Do NOT put a made-up camera pose here — an empty `cameras` array is the correct default for an unknown scene.
- `scenes/S1.sog` — CONTENT only, no recovered publication data (button label "S1")
- `scenes/ef3837bd/`, `scenes/beb9be49/` — Scene Packages imported from superspl.at (button labels "Dormitorio", "Living Room" — see `packageLabels` in `index.html`), each with its own `manifest.json`, content, collision (if present) and real settings (if present). See "Importing from superspl.at" below.

The page loads the Dormitorio package (`ef3837bd`) by default, with its real settings and collision, so Walk Mode and the (auto-generated) camera animation both match the original publication. A small selector (top-right) switches between scenes, setting/clearing `?content=`, `?collision=` and `?settings=` together for whichever of those each scene has.

To add another scene with its own recovered publication data, drop `SX.sog`, and optionally `SX.voxel.json`+`SX.voxel.bin` and `SX.settings.json`, into `scenes/`, then add an entry with those paths (or `null` for the ones you don't have) to the `staticScenes` list in `index.html`. Never hand-write a `SX.settings.json` — only use one recovered from the actual publication, otherwise leave `settings: null` and let the generic auto-frame default take over.

## Importing from superspl.at (Scene Packages)

`tools/import-scene.mjs` recovers a full Scene Package straight from a public superspl.at publication — no manual DevTools copying:

```sh
node tools/import-scene.mjs https://superspl.at/scene/<scene-id>
```

It fetches the same bootstrap page superspl.at itself loads the viewer from, and extracts exactly what that publication provides: content URL (`.sog` or `meta.json`+webp, downloaded as-is, never repackaged), collision URL (`scene.voxel.json`+`.bin`, size-checked against the metadata's own counts), and the Experience Settings — which superspl.at server-side-embeds as a literal JS object directly in the page, not as a separate fetched file (its own generic `settings.json` fallback path 404s and is never actually used). Nothing is invented: if a publication has no collision, `manifest.json` records `collision: null` and Walk Mode simply isn't offered for that scene; if it has no authored camera, `settings: null` and the viewer auto-frames from the bounding box instead of a placeholder pose.

Each import lands in its own `scenes/<scene-id>/` folder with a `manifest.json` describing what's actually present, and updates `scenes/index.json` (the list of imported package ids). The viewer's selector reads `scenes/index.json` at runtime and adds one button per package automatically — no per-scene code to write. `scenes/ef3837bd/` and `scenes/beb9be49/` are two such imports, checked in as a working example of the pipeline (not hardcoded — re-running the importer against any other `superspl.at/scene/<id>` produces the same shape).

To add or replace a scene, drop a `.sog` file into `scenes/` and update the `scenes` list in the inline script at the bottom of `index.html` — no rebuild needed.

## Local preview

```sh
npx serve .
```

## License

Viewer code derived from `@playcanvas/supersplat-viewer`, MIT License, Copyright (c) PlayCanvas. See upstream repository for full license text.
