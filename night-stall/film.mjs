#!/usr/bin/env node
// Films scene.js: every frame of its loop is drawn by Ink Studio's own (CPU) renderer, several at a time,
// and the frames are handed to ffmpeg.
//
//   node film.mjs                      out/night-stall.mp4: the whole loop, 30 fps, 1920x1080
//   node film.mjs --still 0,9,18,27    stills at those seconds: out/night-stall-<t>s.png
//
//   --out file.mp4      where the film goes
//   --from 0 --to 36    seconds (the scene's own loop by default: the last frame leads back into the first)
//   --fps 30
//   --size 480x270      art pixels; --scale 4: how many screen pixels each becomes
//   --workers n         frames drawn at once (cores less two, eight at most)
//   --params '{..}'     passed to the scene: {"fog":false}, {"rain":false}, {"still":true} ...
//   --resume            keep the frames already drawn by an earlier run that was stopped
//
// The scene works everything out from the clock, so a frame does not need the ones before it: each worker builds the
// scene once and then draws whichever frames it is given. The camera is the scene's own (see `camera` there).
import { createRequire } from 'node:module';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const FILE = fileURLToPath(import.meta.url);
const ROOT = path.dirname(FILE);
const args = isMainThread ? process.argv.slice(2) : workerData.args;
const flag = (name, fallback) => { const i = args.indexOf('--' + name); return i < 0 ? fallback : args[i + 1] ?? true; };
const [W, H] = String(flag('size', '480x270')).split('x').map(Number);
const SCALE = +flag('scale', 4);
const frameFile = (dir, i) => path.join(dir, 'f' + String(i).padStart(5, '0') + '.rgb');

if (isMainThread) await main();
else draw();

// ── a worker: build the scene, then draw the frames it is sent ──
function draw() {
  const studio = require('@shapeshift-labs/ink-studio');
  const makeScene = require('./scene.js');
  const kit = studio.load(), K = kit.KIT, scene = makeScene(kit);
  const world = scene.build(scene.seed, { controls: workerData.params });
  // what the command line tool does to a world before it draws it: the per-pixel patterns, made ready to be asked
  if (world.pix && K.pixel)
    Object.assign(world, { pixTex: K.pixel.evaluators(world), pixCell: K.pixel.CELL, pixView: K.pixel.VIEW, pixUnfold: K.pixel.unfold, pixAnchors: K.pixel.anchors });
  const rest = world.data;
  let posed;
  parentPort.on('message', ({ index, t }) => {
    world.anim.update(1 / 60, t);
    // splats carried by bones stay at rest in the data: the renderer is given a copy with them put in place
    world.data = K.bones.posed({ data: rest, anim: world.anim, get posedBuf() { return posed; }, set posedBuf(v) { posed = v; } });
    const image = studio.render(world, { t, w: W, h: H, px: 1 });
    if (image.rgb.length !== W * H * 3) throw new Error(`frame ${index}: expected ${W}x${H}, got ${image.w}x${image.h}`);
    fs.writeFileSync(frameFile(workerData.dir, index), image.rgb);
    parentPort.postMessage({ index });
  });
  parentPort.postMessage({ ready: true, splats: world.count });
}

// ── the main thread: share the frames out, then encode ──
async function main() {
  const { LOOP } = require('./scene.js');
  const fps = +flag('fps', 30), params = flag('params') ? JSON.parse(flag('params')) : undefined;
  const stills = flag('still') === undefined ? null : String(flag('still')).split(',').map(Number);
  const from = +flag('from', 0), to = +flag('to', LOOP);
  const out = path.resolve(ROOT, flag('out', 'out/night-stall.mp4'));
  const dir = path.join(ROOT, '../node_modules/.cache/night-stall', stills ? 'stills' : `${W}x${H}-${fps}`);
  if (!flag('resume') && fs.existsSync(dir)) fs.rmSync(dir, { recursive: true });
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(path.dirname(out), { recursive: true });

  const first = Math.round(from * fps), count = Math.round((to - from) * fps);
  const frames = stills ? stills.map((t, index) => ({ index, t })) : Array.from({ length: count }, (_, k) => ({ index: first + k, t: (first + k) / fps }));
  const queue = frames.filter(f => !fs.existsSync(frameFile(dir, f.index)));
  const workers = Math.min(queue.length, Math.max(1, +flag('workers', Math.min(8, os.cpus().length - 2))));
  console.log(`${frames.length} frames at ${W}x${H}` + (queue.length < frames.length ? ` (${frames.length - queue.length} kept from before)` : '') + `, ${workers} at a time`);

  const started = Date.now(), total = queue.length, step = Math.max(1, Math.round(total / 20));
  let done = 0, told = 0;
  // (with nothing left to draw there are no workers, and this goes straight on to the encoding)
  await Promise.all(Array.from({ length: workers }, () => new Promise((resolve, reject) => {
    const worker = new Worker(FILE, { workerData: { args, dir, params } });
    const next = () => { const f = queue.shift(); if (f) worker.postMessage(f); else worker.terminate().then(resolve); };
    worker.on('message', m => {
      if (m.ready) { if (!told++) console.log(`scene built: ${m.splats} splats, ${((Date.now() - started) / 1000).toFixed(0)} s`); }
      else if (++done % step === 0 || done === total) {
        const secs = (Date.now() - started) / 1000;
        console.log(`${done}/${total} drawn, ${secs.toFixed(0)} s` + (done < total ? `, about ${((secs / done) * (total - done)).toFixed(0)} s to go` : ''));
      }
      next();
    });
    worker.on('error', reject);
  })));

  const video = ['-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${W}x${H}`];
  const big = `scale=${W * SCALE}:${H * SCALE}:flags=neighbor`;
  if (stills) {
    for (const [index, t] of stills.entries()) {
      const file = out.replace(/\.[^.]+$/, '') + `-${t}s.png`;
      await ffmpeg([...video, '-i', frameFile(dir, index), '-frames:v', '1', '-vf', big, file]);
      console.log('wrote', path.relative(ROOT, file));
    }
    return;
  }
  // x264, every art pixel a clean block of screen pixels: 4:2:0 colour still falls on whole art pixels when the scale is even
  const encode = ffmpeg([...video, '-r', String(fps), '-i', '-', '-vf', `${big}:out_color_matrix=bt709:out_range=tv,format=yuv420p`,
    '-c:v', 'libx264', '-preset', 'slow', '-crf', String(flag('crf', 14)), '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709',
    '-movflags', '+faststart', out], true);
  for (const f of frames) if (!encode.stdin.write(fs.readFileSync(frameFile(dir, f.index)))) await new Promise(r => encode.stdin.once('drain', r));
  encode.stdin.end();
  await encode.finished;
  console.log(`wrote ${path.relative(ROOT, out)}: ${(frames.length / fps).toFixed(1)} s, ${(fs.statSync(out).size / 1048576).toFixed(1)} MB, in ${((Date.now() - started) / 1000).toFixed(0)} s`);
}

function ffmpeg(list, piped) {
  const child = spawn('ffmpeg', ['-y', '-loglevel', 'error', ...list], { stdio: [piped ? 'pipe' : 'ignore', 'inherit', 'inherit'] });
  const finished = new Promise((resolve, reject) => {
    child.on('error', e => reject(new Error('ffmpeg could not be run (is it installed?): ' + e.message)));
    child.on('close', code => (code ? reject(new Error('ffmpeg stopped with code ' + code)) : resolve()));
  });
  if (!piped) return finished;
  child.finished = finished;
  return child;
}
