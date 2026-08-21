#!/usr/bin/env node
/**
 * Generic importer: superspl.at publication -> Entity Viewer Scene Package.
 *
 * Usage:
 *   node import-scene.mjs <https://superspl.at/scene/<id> | https://superspl.at/s?id=<id> | bare-id> [outputRoot]
 *
 * What it does, and nothing more:
 *   1. Resolves the scene id from whatever URL/id form was given.
 *   2. Fetches the real embed bootstrap page (https://superspl.at/s?id=<id>) — this is
 *      the page superspl.at itself loads the viewer from, and is the same page a
 *      DevTools inspection would show. No API reverse-engineering, no guessing.
 *   3. Extracts, from that page's inline bootstrap <script>, exactly the values
 *      superspl.at computed for THIS scene: posterUrl, skyboxUrl, collisionUrl,
 *      contentUrl, and the settings object. The settings object is looked for as an
 *      SSR-embedded JS object literal first (confirmed real mechanism for ef3837bd);
 *      if instead the bootstrap does a runtime fetch('settingsUrl'), that URL is
 *      fetched separately. Nothing is assumed — each field is reported as found or
 *      absent, never invented.
 *   4. Downloads whatever assets exist (content, collision json+bin, settings) into
 *      an isolated scenes/<scene-id>/ package, decompressing gzip transparently
 *      (Node's fetch does this automatically — this is exactly the bug we hit doing
 *      it by hand with curl).
 *   5. Writes scenes/<scene-id>/manifest.json describing what is actually present,
 *      and updates the top-level scenes/index.json list of imported packages.
 *
 * No camera is invented when settings/cameras are absent. No collision is invented
 * when the publication has none. No format conversion happens: a .sog source stays
 * scene.sog; a meta.json source stays as an unpacked content/ folder (meta.json +
 * its referenced .webp files, downloaded verbatim, same bytes).
 */

import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const resolveSceneId = (input) => {
    // bare id: 8 hex-ish chars, no slashes
    if (!input.includes('/')) return input;
    const url = new URL(input, 'https://superspl.at');
    if (url.searchParams.has('id')) return url.searchParams.get('id');
    const parts = url.pathname.split('/').filter(Boolean);
    const last = parts[parts.length - 1];
    if (!last) throw new Error(`Could not resolve a scene id from: ${input}`);
    return last;
};

const fetchText = async (url) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`GET ${url} -> ${res.status} ${res.statusText}`);
    return res.text();
};

const fetchBuffer = async (url) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`GET ${url} -> ${res.status} ${res.statusText}`);
    return Buffer.from(await res.arrayBuffer());
};

// Find the balanced-brace object literal starting at the '{' right after `key:` inside `text`.
const extractObjectLiteralAfterKey = (text, key) => {
    const marker = `${key}:`;
    const keyIdx = text.indexOf(marker);
    if (keyIdx === -1) return null;
    const braceStart = text.indexOf('{', keyIdx);
    if (braceStart === -1) return null;
    let depth = 0;
    for (let i = braceStart; i < text.length; i++) {
        if (text[i] === '{') depth++;
        else if (text[i] === '}') {
            depth--;
            if (depth === 0) return text.slice(braceStart, i + 1);
        }
    }
    return null;
};

// Extract `const <name> = <expr>;` and evaluate <expr> in a minimal sandbox that
// mirrors what the bootstrap script itself sees: a `url` (URL of the page, no extra
// query params — i.e. the publication's own defaults) and a no-op createImage.
const extractConstExpr = (scriptText, name, sandbox) => {
    const re = new RegExp(`const\\s+${name}\\s*=\\s*([^;]+);`);
    const m = scriptText.match(re);
    if (!m) return { found: false, value: undefined };
    const expr = m[1];
    try {
        // eslint-disable-next-line no-new-func
        const fn = new Function('url', 'createImage', `return (${expr});`);
        const value = fn(sandbox.url, sandbox.createImage);
        return { found: true, value };
    } catch (err) {
        return { found: true, value: undefined, error: err.message };
    }
};

const importScene = async (rawInput, outputRoot) => {
    const sceneId = resolveSceneId(rawInput);
    const embedUrl = `https://superspl.at/s?id=${sceneId}`;
    console.log(`\n=== Importing ${sceneId} ===`);
    console.log(`Bootstrap page: ${embedUrl}`);

    const html = await fetchText(embedUrl);

    // The bootstrap is the single <script type="module"> that sets window.sse.
    const scriptMatch = html.match(/<script type="module">([\s\S]*?window\.sse\s*=[\s\S]*?)<\/script>/);
    if (!scriptMatch) {
        throw new Error('Could not find the window.sse bootstrap <script> in the page — page structure may have changed.');
    }
    const scriptText = scriptMatch[1];

    const sandboxUrl = new URL(embedUrl);
    const sandbox = { url: sandboxUrl, createImage: () => null };

    const posterUrl = extractConstExpr(scriptText, 'posterUrl', sandbox);
    const skyboxUrl = extractConstExpr(scriptText, 'skyboxUrl', sandbox);
    const collisionUrl = extractConstExpr(scriptText, 'collisionUrl', sandbox);
    const contentUrl = extractConstExpr(scriptText, 'contentUrl', sandbox);
    const settingsUrlExpr = extractConstExpr(scriptText, 'settingsUrl', sandbox);

    // Settings: prefer the SSR-embedded literal object (confirmed mechanism).
    // Only fall back to fetching settingsUrl if no literal is present.
    let settingsObj = null;
    let settingsSource = null;
    const embeddedSettingsText = extractObjectLiteralAfterKey(scriptText.slice(scriptText.indexOf('window.sse')), 'settings');
    if (embeddedSettingsText) {
        try {
            settingsObj = JSON.parse(embeddedSettingsText);
            settingsSource = 'ssr-embedded';
        } catch (err) {
            console.warn(`  settings literal found but failed to parse as JSON: ${err.message}`);
        }
    }
    if (!settingsObj && settingsUrlExpr.found && settingsUrlExpr.value) {
        try {
            const resolved = new URL(settingsUrlExpr.value, embedUrl).toString();
            const text = await fetchText(resolved);
            settingsObj = JSON.parse(text);
            settingsSource = `fetched:${resolved}`;
        } catch (err) {
            console.warn(`  settingsUrl fetch/parse failed (${settingsUrlExpr.value}): ${err.message}`);
        }
    }

    console.log(`  contentUrl:   ${contentUrl.found ? contentUrl.value : '(not found)'}`);
    console.log(`  collisionUrl: ${collisionUrl.found ? (collisionUrl.value ?? 'null (no collision)') : '(not found)'}`);
    console.log(`  posterUrl:    ${posterUrl.found ? (posterUrl.value ?? 'null') : '(not found)'}`);
    console.log(`  skyboxUrl:    ${skyboxUrl.found ? (skyboxUrl.value ?? 'null') : '(not found)'}`);
    console.log(`  settings:     ${settingsObj ? `present (${settingsSource})` : 'ABSENT'}`);

    const sceneDir = path.join(outputRoot, sceneId);
    await mkdir(sceneDir, { recursive: true });

    const manifest = {
        id: sceneId,
        sourceUrl: `https://superspl.at/scene/${sceneId}`,
        embedUrl,
        importedAt: new Date().toISOString(),
        content: null,
        collision: null,
        settings: null,
        poster: null,
        skybox: null
    };

    // --- content ---
    if (contentUrl.found && contentUrl.value) {
        const url = contentUrl.value;
        const filename = new URL(url).pathname.split('/').pop().toLowerCase();
        if (filename === 'meta.json') {
            console.log('  content is unpacked SOG (meta.json + webp) — downloading as-is, no repackaging.');
            const contentDir = path.join(sceneDir, 'content');
            await mkdir(contentDir, { recursive: true });
            const metaBuf = await fetchBuffer(url);
            await writeFile(path.join(contentDir, 'meta.json'), metaBuf);
            const meta = JSON.parse(metaBuf.toString('utf8'));
            const base = url.slice(0, url.lastIndexOf('/') + 1);
            const files = new Set();
            for (const key of ['means', 'scales', 'quats', 'sh0', 'sh1', 'sh2', 'sh3']) {
                for (const f of meta[key]?.files ?? []) files.add(f);
            }
            for (const f of files) {
                const buf = await fetchBuffer(base + f);
                await writeFile(path.join(contentDir, f), buf);
            }
            manifest.content = { type: 'meta', path: 'content/meta.json', files: ['content/meta.json', ...[...files].map((f) => `content/${f}`)] };
        } else if (filename.endsWith('.sog')) {
            console.log('  content is a packaged .sog — downloading as scene.sog.');
            const buf = await fetchBuffer(url);
            await writeFile(path.join(sceneDir, 'scene.sog'), buf);
            manifest.content = { type: 'sog', path: 'scene.sog' };
        } else {
            console.log(`  content has an unrecognised extension (${filename}) — downloading as-is, not interpreted.`);
            const buf = await fetchBuffer(url);
            const outName = filename || 'scene.bin';
            await writeFile(path.join(sceneDir, outName), buf);
            manifest.content = { type: 'unknown', path: outName, originalUrl: url };
        }
    } else {
        console.log('  content: NOT FOUND — publication did not expose a contentUrl.');
    }

    // --- collision ---
    if (collisionUrl.found && collisionUrl.value) {
        const jsonUrl = collisionUrl.value;
        console.log('  collision present — fetching voxel.json + voxel.bin (same-basename convention, the mechanism the viewer itself uses).');
        try {
            const jsonBuf = await fetchBuffer(jsonUrl);
            await writeFile(path.join(sceneDir, 'scene.voxel.json'), jsonBuf);
            const binUrl = jsonUrl.replace('.voxel.json', '.voxel.bin');
            const binBuf = await fetchBuffer(binUrl);
            await writeFile(path.join(sceneDir, 'scene.voxel.bin'), binBuf);
            // Sanity check against the metadata's own declared counts — catches silent
            // corruption (e.g. an undecompressed gzip body) instead of shipping it.
            const meta = JSON.parse(jsonBuf.toString('utf8'));
            const expectedWords = meta.nodeCount + meta.leafDataCount;
            const actualWords = binBuf.byteLength / 4;
            if (!Number.isInteger(actualWords) || actualWords !== expectedWords) {
                console.warn(
                    `  WARNING: scene.voxel.bin size mismatch — expected ${expectedWords} x uint32 (${expectedWords * 4} bytes), got ${binBuf.byteLength} bytes. Collision data may be corrupt.`
                );
                manifest.collision = { json: 'scene.voxel.json', bin: 'scene.voxel.bin', sizeCheck: 'FAILED' };
            } else {
                manifest.collision = { json: 'scene.voxel.json', bin: 'scene.voxel.bin', sizeCheck: 'ok' };
            }
        } catch (err) {
            console.warn(`  collision fetch failed: ${err.message}`);
        }
    } else {
        console.log('  collision: none (publication has no collisionUrl) — Walk Mode will be unavailable for this scene.');
    }

    // --- settings ---
    if (settingsObj) {
        await writeFile(path.join(sceneDir, 'scene.settings.json'), JSON.stringify(settingsObj, null, 4));
        const hasCamera = Array.isArray(settingsObj.cameras) && settingsObj.cameras.length > 0;
        manifest.settings = {
            path: 'scene.settings.json',
            hasCamera,
            hasAnimTracks: Array.isArray(settingsObj.animTracks) && settingsObj.animTracks.length > 0,
            hasAnnotations: Array.isArray(settingsObj.annotations) && settingsObj.annotations.length > 0
        };
        if (!hasCamera) {
            console.log('  settings present but no authored camera — Entity Viewer will auto-frame from the bounding box (no placeholder camera written).');
        }
    } else {
        console.log('  settings: ABSENT — no camera/animation/annotation data recovered. Entity Viewer will use its generic auto-frame default.');
    }

    // --- poster / skybox (recorded, not required by Entity Viewer's core experience) ---
    if (posterUrl.found && posterUrl.value) manifest.poster = posterUrl.value;
    if (skyboxUrl.found && skyboxUrl.value) manifest.skybox = skyboxUrl.value;

    await writeFile(path.join(sceneDir, 'manifest.json'), JSON.stringify(manifest, null, 4));

    console.log(`  -> wrote ${path.relative(outputRoot, sceneDir)}/manifest.json`);
    return manifest;
};

const updateIndex = async (outputRoot, sceneId) => {
    const indexPath = path.join(outputRoot, 'index.json');
    let ids = [];
    if (existsSync(indexPath)) {
        try {
            ids = JSON.parse(await readFile(indexPath, 'utf8'));
        } catch {
            ids = [];
        }
    }
    if (!ids.includes(sceneId)) ids.push(sceneId);
    await writeFile(indexPath, JSON.stringify(ids, null, 4));
    return ids;
};

const main = async () => {
    const [, , input, outputRootArg] = process.argv;
    if (!input) {
        console.error('Usage: node import-scene.mjs <superspl.at scene URL or id> [outputRoot=./scenes]');
        process.exit(1);
    }
    const outputRoot = outputRootArg ?? path.join(process.cwd(), 'scenes');
    await mkdir(outputRoot, { recursive: true });
    const manifest = await importScene(input, outputRoot);
    const ids = await updateIndex(outputRoot, manifest.id);
    console.log(`\nscenes/index.json now lists: ${ids.join(', ')}`);
};

main().catch((err) => {
    console.error('\nImport failed:', err.message);
    process.exit(1);
});
