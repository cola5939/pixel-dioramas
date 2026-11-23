#!/usr/bin/env node
// Films the street corner. What is filmed is the page (page.js, as build-page.mjs builds it), drawn a frame at a time in
// a Chrome with no window, from the scene's own camera; the frames are handed to ffmpeg. The page, and not Ink Studio's
// CPU renderer as in the night stall, because the page paints what the scene alone has not: the evening sky and the sea,
// the haze in the lamplight, the wet road's mirror, the light of the lamps that flash.
//
//   node film.mjs                      out/vice-corner.mp4: the whole loop, 30 fps, 1920x1080
//   node film.mjs --still 0,9,18,27    stills at those seconds: out/vice-corner-<t>s.png
//
//   --out file.mp4      where the film goes
//   --from 0 --to 36    seconds (the scene's own loop by default: the last frame leads back into the first)
//   --fps 30
//   --scale 4           how many screen pixels each art pixel becomes (the picture is 480x270 art pixels)
//   --crf 14            x264's quality: lower is better, and bigger
//   --resume            keep the frames already drawn by an earlier run that was stopped
//   --chrome path       the Chrome to draw with ($CHROME, or else Google Chrome where it is usually kept)
//
// It needs Chrome (or Chromium) and ffmpeg. The page is built first (build-page.mjs) when it is missing, or older than
// what it is built from.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name, fallback) => { const i = args.indexOf('--' + name); return i < 0 ? fallback : args[i + 1] ?? true; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const { LOOP } = require('./scene.js');
const PAGE = path.join(ROOT, 'out/vice-corner.html');

const fps = +flag('fps', 30), scale = +flag('scale', 4), crf = +flag('crf', 14);
const stills = flag('still') === undefined ? null : String(flag('still')).split(',').map(Number);
const from = +flag('from', 0), to = +flag('to', LOOP);
const out = path.resolve(ROOT, flag('out', 'out/vice-corner.mp4'));
const dir = path.join(ROOT, '../node_modules/.cache/vice-corner', stills ? 'stills' : `frames-${fps}`);
const frameFile = i => path.join(dir, 'f' + String(i).padStart(5, '0') + '.png');

buildPage();
if (!flag('resume') && fs.existsSync(dir)) fs.rmSync(dir, { recursive: true });
fs.mkdirSync(dir, { recursive: true });
fs.mkdirSync(path.dirname(out), { recursive: true });

const first = Math.round(from * fps), count = Math.round((to - from) * fps);
const frames = stills ? stills.map((t, index) => ({ index, t })) : Array.from({ length: count }, (_, k) => ({ index: first + k, t: (first + k) / fps }));
const queue = frames.filter(f => !fs.existsSync(frameFile(f.index)));
console.log(`${frames.length} frames` + (queue.length < frames.length ? ` (${frames.length - queue.length} kept from before)` : ''));

const started = Date.now();
if (queue.length) {
  const chrome = await openChrome();
  try {
    await chrome.open(pathToFileURL(PAGE).href);
    console.log(`page open in ${((Date.now() - started) / 1000).toFixed(0)} s`);
    const total = queue.length, step = Math.max(1, Math.round(total / 20));
    let done = 0;
    for (const f of queue) {
      const png = await chrome.evaluate(`window.__vice.film(${f.t})`);
      if (typeof png !== 'string' || !png.startsWith('data:image/png;base64,')) throw new Error(`frame ${f.index}: the page gave back no picture (${String(png).slice(0, 200)})`);
      fs.writeFileSync(frameFile(f.index), Buffer.from(png.slice(png.indexOf(',') + 1), 'base64'));
      if (++done % step === 0 || done === total) {
        const secs = (Date.now() - started) / 1000;
        console.log(`${done}/${total} drawn, ${secs.toFixed(0)} s` + (done < total ? `, about ${((secs / done) * (total - done)).toFixed(0)} s to go` : ''));
      }
    }
  } finally {
    await chrome.close();
  }
}

const big = `scale=iw*${scale}:ih*${scale}:flags=neighbor`;
if (stills) {
  for (const [index, t] of stills.entries()) {
    const file = out.replace(/\.[^.]+$/, '') + `-${t}s.png`;
    await ffmpeg(['-i', frameFile(index), '-frames:v', '1', '-vf', big, file]);
    console.log('wrote', path.relative(ROOT, file));
  }
} else {
  // x264, every art pixel a clean block of screen pixels: 4:2:0 colour still falls on whole art pixels when the scale is even
  await ffmpeg(['-framerate', String(fps), '-start_number', String(first), '-i', path.join(dir, 'f%05d.png'), '-frames:v', String(count),
    // (and every frame marked as BT.709, which is what the encoder writes into the film: told only on the command line it
    // leaves the primaries and the transfer unsaid)
    '-vf', `${big}:out_color_matrix=bt709:out_range=tv,format=yuv420p,setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv`,
    '-c:v', 'libx264', '-preset', 'slow', '-profile:v', 'high', '-crf', String(crf),
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv', '-movflags', '+faststart', out]);
  console.log(`wrote ${path.relative(ROOT, out)}: ${(count / fps).toFixed(1)} s at ${fps} fps, ${(fs.statSync(out).size / 1048576).toFixed(1)} MB, in ${((Date.now() - started) / 1000).toFixed(0)} s`);
}

/* the page, built again if anything it is built from is newer than it */
function buildPage() {
  const newest = Math.max(...['scene.js', 'page.js', 'build-page.mjs'].map(f => fs.statSync(path.join(ROOT, f)).mtimeMs));
  if (fs.existsSync(PAGE) && fs.statSync(PAGE).mtimeMs > newest) return;
  console.log('building the page first');
  const built = spawnSync(process.execPath, [path.join(ROOT, 'build-page.mjs')], { stdio: 'inherit' });
  if (built.status !== 0) throw new Error('build-page.mjs did not finish');
}

/* A Chrome with no window, spoken to over its DevTools protocol: `open` a page and wait for it to be ready to film,
   `evaluate` an expression in it and have its value back, `close` it all. */
async function openChrome() {
  const bin = flag('chrome', process.env.CHROME || [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'
  ].find(f => fs.existsSync(f)));
  if (!bin) throw new Error('no Chrome found: say where one is with --chrome, or in $CHROME');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'vice-corner-chrome-'));
  const child = spawn(bin, [
    '--headless=new', '--user-data-dir=' + profile, '--remote-debugging-port=0', '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--mute-audio', '--hide-scrollbars', '--ignore-gpu-blocklist',
    ...(process.platform === 'darwin' ? ['--use-angle=metal'] : []), 'about:blank'
  ], { stdio: 'ignore' });
  const gone = new Promise(r => child.once('exit', r));
  const close = async () => {
    child.kill();
    await Promise.race([gone, sleep(3000)]);
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 3 });
  };
  try {
    // (Chrome picks its own port, and says which in a file in its profile)
    let port;
    for (let i = 0; i < 100 && !port; i++) {
      await sleep(100);
      try { port = +fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]; } catch {}
    }
    if (!port) throw new Error('Chrome did not start: ' + bin);
    let target;
    for (let i = 0; i < 50 && !target; i++) {
      try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t => t.type === 'page'); } catch {}
      if (!target) await sleep(100);
    }
    if (!target) throw new Error('Chrome has no page to draw in');
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = () => reject(new Error('could not speak to Chrome')); });
    let id = 0;
    const waiting = new Map();
    ws.onmessage = e => {
      const m = JSON.parse(e.data);
      if (m.id && waiting.has(m.id)) { const { resolve, reject } = waiting.get(m.id); waiting.delete(m.id); m.error ? reject(new Error(m.error.message)) : resolve(m.result); }
      else if (m.method === 'Runtime.exceptionThrown') console.error('the page:', m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
      else if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(m.params.type)) console.error('the page:', m.params.args.map(a => a.value ?? a.description ?? '').join(' '));
    };
    const send = (method, params = {}) => new Promise((resolve, reject) => { const n = ++id; waiting.set(n, { resolve, reject }); ws.send(JSON.stringify({ id: n, method, params })); });
    const evaluate = async expression => {
      const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error('the page: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
      return r.result.value;
    };
    await send('Runtime.enable');
    await send('Page.enable');
    // (a window the size of the film's own frame: what the page draws before it is asked for a frame costs little)
    await send('Emulation.setDeviceMetricsOverride', { width: 480, height: 270, deviceScaleFactor: 1, mobile: false });
    return {
      evaluate,
      async open(url) {
        await send('Page.navigate', { url });
        for (let i = 0; i < 600; i++) {
          await sleep(200);
          if (await evaluate('typeof window.__vice?.film === "function"')) return;
          const said = await evaluate('document.getElementById("note")?.style.opacity === "1" ? document.getElementById("note").textContent : ""');
          if (said && !/加载|搭建/.test(said)) throw new Error('the page could not draw: ' + said);
        }
        throw new Error('the page was not ready after two minutes');
      },
      close: async () => { ws.close(); await close(); }
    };
  } catch (e) {
    await close();
    throw e;
  }
}

function ffmpeg(list) {
  const child = spawn('ffmpeg', ['-y', '-loglevel', 'error', ...list], { stdio: ['ignore', 'inherit', 'inherit'] });
  return new Promise((resolve, reject) => {
    child.on('error', e => reject(new Error('ffmpeg could not be run (is it installed?): ' + e.message)));
    child.on('close', code => (code ? reject(new Error('ffmpeg stopped with code ' + code)) : resolve()));
  });
}
