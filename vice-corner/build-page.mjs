#!/usr/bin/env node
// Builds the page that shows the street corner and nothing else, to be turned with the mouse, in two forms:
//   node build-page.mjs [page.html] [--artifact dir]
//     page.html        (default out/vice-corner.html) everything inside the one file, so that it opens by
//                      double-clicking, with no server
//     --artifact dir   (default out/artifact) the same for publishing as a claude.ai Artifact. The Artifact
//                      wraps the page in its own <html>, <head> and <body>, so vice-corner.html there is the fragment
//                      that goes inside them; beside it are the Ink Studio toolkit, the page's own script and the baked
//                      scene, which it loads by relative address, to be published with it as its files
//
// The scene is sculpted and baked here, once (about ten seconds), and what that makes is stored with the page: so the
// page opens at once and does none of it. (Without that store, or with ?live in its address, the page builds the scene
// itself and says that it is doing so.)
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const studio = require('@shapeshift-labs/ink-studio');
const here = path.dirname(fileURLToPath(import.meta.url)), root = here;
const args = process.argv.slice(2), at = args.indexOf('--artifact');
const named = at < 0 ? [] : [at, at + 1];
const out = path.resolve(args.find((a, i) => !named.includes(i)) || path.join(root, 'out/vice-corner.html'));
const artifact = path.resolve(at < 0 ? path.join(root, 'out/artifact') : args[at + 1]);

const TITLE = '罪恶都市街角 · Vice Corner';

// the toolkit is plain scripts that share one scope: it goes in as it is, with its licence (MIT: the notice goes
// wherever the code goes). The page's own code is bundled after it
const licence = fs.readFileSync(path.join(path.dirname(require.resolve('@shapeshift-labs/ink-studio/package.json')), 'LICENSE'), 'utf8').trim();
if (licence.includes('*/')) throw new Error('the licence text would end the comment it is put in');
const toolkit = `/*! Ink Studio ${studio.version}, https://github.com/siliconjungle/shapeshift-labs-ink-studio\n\n${licence}\n*/\n${studio.bundle()}`;
const page = (await build({
  entryPoints: [path.join(here, 'page.js')], bundle: true, format: 'iife', write: false, target: 'es2022',
  legalComments: 'none', logLevel: 'warning',
})).outputFiles[0].text;
for (const [name, js] of [['toolkit', toolkit], ['viewer', page]])
  if (/<\/script|<!--/i.test(js)) throw new Error(`the ${name} script contains text that would end an inline script tag`);

// the scene, as the page would build it, and that taken apart into what JSON holds and what it does not
const makeScene = require('./scene.js');
const started = Date.now(), { plain, arrays } = makeScene.pack(studio.load());
const store = squeeze(arrays, { data: 16, pix: 8, materialIds: 1 });
console.log(`scene baked in ${((Date.now() - started) / 1000).toFixed(0)} s: ${plain.world.count} splats, ${(store.bytes / 1048576).toFixed(1)} MB of arrays packed to ${(store.packed / 1048576).toFixed(1)} MB`);

/* The big arrays packed small. Each is laid out a byte of every number at a time, and within that a column at a time
   (all the x's, then all the y's ...): that puts like beside like, and the lot then gzips to a sixth. page.js undoes
   it (`unsqueeze`). `strides` says how many numbers make a row of each. */
function squeeze(arrays, strides) {
  const layout = [], chunks = [];
  for (const [name, array] of Object.entries(arrays)) {
    const stride = strides[name], rows = array.length / stride, width = array.BYTES_PER_ELEMENT;
    const from = new Uint8Array(array.buffer, array.byteOffset, array.byteLength), to = new Uint8Array(from.length);
    for (let b = 0; b < width; b++) for (let k = 0; k < stride; k++)
      for (let i = 0, at = (b * stride + k) * rows, read = k * width + b; i < rows; i++, read += stride * width) to[at + i] = from[read];
    layout.push({ name, type: array.constructor.name, length: array.length, stride });
    chunks.push(to);
  }
  const all = Buffer.concat(chunks), packed = zlib.gzipSync(all, { level: 9 });
  return { layout, base64: packed.toString('base64'), bytes: all.length, packed: packed.length };
}

// what both forms share: the look of the page (one dark look: it is an evening scene), the canvas and the note
const style = `<style>
  :root { --night: #1a1433; --note: #b9a4d8; color-scheme: dark; }
  html, body { margin: 0; height: 100%; overflow: hidden; background: var(--night); }
  canvas { position: fixed; left: 0; top: 0; display: block; touch-action: none; cursor: grab; image-rendering: pixelated; }
  canvas:active { cursor: grabbing; }
  /* (nothing is said unless opening takes more than a moment; then in Chinese and in English, a line each) */
  #note { position: fixed; inset: 0; display: grid; place-items: center; padding: 0 16px; text-align: center; white-space: pre-line;
    color: var(--note); pointer-events: none; opacity: 0; animation: late 0.3s 1.5s forwards;
    font: 14px/1.6 -apple-system, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", system-ui, sans-serif; }
  @keyframes late { to { opacity: 1; } }
</style>`;
const body = `<canvas id="view"></canvas>
<div id="note">正在加载…
Loading…</div>`;

// the page that opens from disk: the store inside it, as text the page reads and then drops
const baked = JSON.stringify({ plain, layout: store.layout }).replace(/</g, '\\u003c');
const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<title>${TITLE}</title>
${style}
</head>
<body>
${body}
<script id="baked" type="application/json">${baked}</script>
<script id="baked-arrays" type="text/plain">${store.base64}</script>
<script>
${toolkit}
</script>
<script>
requestAnimationFrame(() => requestAnimationFrame(() => {
${page}
}));
</script>
</body>
</html>
`;
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log(`viewer → ${path.relative(root, out)}  (${(Buffer.byteLength(html) / 1048576).toFixed(1)} MB, Ink Studio ${studio.version})`);

// the Artifact: the fragment, and its three files. The scene's download begins before the scripts', beside them
const files = {
  'vice-corner.html': `<title>${TITLE}</title>
${style}
${body}
<script>
  // the baked scene, published beside the page (null if it cannot be had: the page then builds the scene itself)
  window.__viceScene = fetch('vice-corner-scene.json').then(r => (r.ok ? r.json() : null)).catch(() => null);
</script>
<script src="ink-studio.js"></script>
<script src="vice-corner.js"></script>
`,
  'ink-studio.js': toolkit,
  'vice-corner.js': page,
  'vice-corner-scene.json': JSON.stringify({ plain, layout: store.layout, arrays: store.base64 })
};
fs.rmSync(artifact, { recursive: true, force: true });
fs.mkdirSync(artifact, { recursive: true });
for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(artifact, name), text);
console.log(`artifact → ${path.relative(root, artifact)}/  ` +
  Object.entries(files).map(([name, text]) => `${name} ${(Buffer.byteLength(text) / 1048576).toFixed(2)} MB`).join(', '));
