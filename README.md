# GSVIEWER

Static Gaussian Splat viewer, built from [playcanvas/supersplat-viewer](https://github.com/playcanvas/supersplat-viewer) (MIT licensed) with visible branding removed.

## Structure

- `index.html`, `index.css`, `index.js`, `index.js.map` — VIEWER (built from the official source, unmodified except branding text)
- `settings.json` — viewer configuration (background, camera, post-effects)
- `scene.sog` — CONTENT (the Gaussian Splat scene, SOG runtime format)

To swap the scene, replace `scene.sog` with another `.sog` file — no rebuild needed.

## Local preview

```sh
npx serve .
```

## License

Viewer code derived from `@playcanvas/supersplat-viewer`, MIT License, Copyright (c) PlayCanvas. See upstream repository for full license text.
