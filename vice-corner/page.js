// The street corner on its own: drag to turn it, scroll to come closer. Nothing else is on the page.
// build-page.mjs packs this, the scene (scene.js) and the Ink Studio toolkit into one HTML file that opens straight
// from disk. The toolkit arrives first as a plain script, so its names are already in scope. The scene comes with it
// already sculpted and baked (that is done when the page is built), so the page opens at once.
//
// Ink Studio's WebGL renderer draws the scene itself, live: the sculpt, and everything the puppet moves. What it has no
// means for is done here, in one small pass over Ink's picture:
//   the sky           Where Ink has drawn nothing (its backdrop, pure black in the scene's `web` variant) the pass paints
//                     the evening: a sun going down behind the store, bands of colour up from it, clouds lit from
//                     under, a far skyline, and the sea below the horizon with the sun's road on it. All of it is worked
//                     out from which way a pixel looks, so it turns with the view.
//   the haze          A thin haze over the corner that shows only where a lamp lights it: the neon, the shop window,
//                     the police car's red and blue as they flash, and the searchlight's beam down from the helicopter.
//   flashing light    What the police lamps and the searchlight fall on is tinted where they reach it, and drawn again
//                     in the nearest of the scene's own colours: the bake cannot hold a light that moves.
//   the wet road      Ink draws the scene a second time from under the ground looking up, which is what a mirror lying
//                     on the road shows; the pass lays that into the pixels that are road or pool, and where nothing
//                     stands to be mirrored, the sky.
// Everything on the page, the pass included, is worked out from where in the 36-second loop it is, so the end of the loop
// leads back into its start. film.mjs films the page itself, a frame at a time (`film` below), for that reason: Ink's
// CPU renderer would draw the scene without the sky, the haze and the wet road.
// For that the pass has to know, of each pixel, what it shows and how far off it is. Ink's render graph can add a
// number of its own to every pixel a chosen set of splats shows: here it adds, into the low bits of a pixel's colour
// (which the scene's `web` palette leaves clear), a note of each splat's kind and of its distance from the eye.
/* global KIT, PixelLook, RenderStages, makeBuilder, makeSculpt */
import { createRenderer } from '@shapeshift-labs/ink-studio/webgl.mjs';
import makeScene from './scene.js';

const { LOOP, GLOW, SUN, camera: filmCamera, beam: beamAt } = makeScene;
const FRAME = [480, 270], LENS = Math.tan((19 * Math.PI) / 180);   // the film's picture in art pixels, and its lens (half its angle of view, as a tangent)
const NEAR = 5.5, FAR = 22, LOW = 0.02, HIGH = 1.3;
const REACH = 11, STEPS = 64;               // how far from where the eye looks anything in the scene is; distances are noted in 64 steps across that
const ROAD = 1, POOL = 2, GLOWS = 3;        // a splat's kind, as noted
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lap = n => (2 * Math.PI * n) / LOOP;   // the speed (radians a second) of a thing that goes round n whole times in the loop
const bytes = hex => (typeof hex === 'number' ? [hex >> 16, (hex >> 8) & 255, hex & 255] : [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)));
const rgb = hex => bytes(hex).map(v => v / 255);

const canvas = document.getElementById('view'), note = document.getElementById('note');
const query = new URLSearchParams(location.search);
// (the note keeps its line breaks: each thing it says is said in Chinese, then in English)
const say = text => { note.textContent = text; note.style.animation = 'none'; note.style.opacity = 1; };

getWorld().then(start).catch(e => {
  say('无法显示：需要支持 WebGL 2 的浏览器。\nThis page needs a browser with WebGL 2.\n(' + (e && e.message ? e.message : e) + ')');
  throw e;
});

/* The world. Taken out of store, which is the work of a moment; or, where there is none (or the address says ?live),
   sculpted and baked here, which takes a while, and the page says so meanwhile. */
async function getWorld() {
  const stored = query.has('live') || typeof DecompressionStream !== 'function' ? null : await storedScene();
  if (stored) try {
    return makeScene.unpack({ KIT }, { plain: stored.plain, arrays: await unsqueeze(stored.layout, stored.arrays) });
  } catch (e) {
    console.warn('The stored scene could not be read, so it is built here instead.', e);
  }
  say('正在搭建场景，大约需要 20 秒…\nBuilding the scene, about 20 seconds…');
  await new Promise(seen => requestAnimationFrame(() => requestAnimationFrame(seen)));
  const scene = makeScene({ makeBuilder, makeSculpt, KIT });
  return scene.build(scene.seed, { controls: { still: true, web: true, ...JSON.parse(query.get('params') || '{}') } });
}

/* What build-page.mjs stores of the scene, baked, its big arrays packed small, as { plain, layout, arrays }: in the
   page itself (the file that opens from disk), or published beside it (the Artifact), in which case the page began to
   fetch it before its scripts. Null if there is none. */
async function storedScene() {
  const baked = document.getElementById('baked'), packed = document.getElementById('baked-arrays');
  if (baked && packed) {
    const { plain, layout } = JSON.parse(baked.textContent), arrays = packed.textContent;
    baked.remove(); packed.remove();   // (megabytes of text the page has no more use for)
    return { plain, layout, arrays };
  }
  return window.__viceScene ?? null;
}

/* The store's arrays again: gunzipped, and each put back from a byte of every number at a time, and within that a
   column at a time, into numbers in rows (`squeeze` in build-page.mjs, undone). */
async function unsqueeze(layout, base64) {
  const text = atob(base64), zipped = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) zipped[i] = text.charCodeAt(i);
  const all = new Uint8Array(await new Response(new Blob([zipped]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
  const arrays = {};
  let at = 0;
  for (const { name, type, length, stride } of layout) {
    const array = new globalThis[type](length), width = array.BYTES_PER_ELEMENT, rows = length / stride, to = new Uint8Array(array.buffer);
    for (let b = 0; b < width; b++) for (let k = 0; k < stride; k++)
      for (let i = 0, write = k * width + b; i < rows; i++, write += stride * width) to[write] = all[at++];
    arrays[name] = array;
  }
  return arrays;
}

/* the page itself, once there is a world to show */
function start(world) {
  // Ink draws on two canvases that are never shown: the scene, and the scene mirrored in the road
  const ink = document.createElement('canvas'), under = document.createElement('canvas'), wet = world.web.mirror;
  /* The notes, a byte to each splat (the render graph's tables start at 1). Ink asks for a table by the selector of
     the pass that wants it, and would work one out from the splats' names: it is handed these. A splat's kind never
     changes; its distance is noted again whenever the eye moves. */
  const notes = { kind: new Uint8Array(world.count + 1), 'far-low': new Uint8Array(world.count + 1), 'far-high': new Uint8Array(world.count + 1) };
  const named = name => KIT.renderGraph.selection(world, { material: name });
  const road = named('road'), pool = named('pool'), paving = named('paving');
  for (let i = 0; i < world.count; i++)
    notes.kind[i + 1] = 85 * (Math.round(world.data[i * 16 + 11]) & 32 ? GLOWS : wet && road[i + 1] ? ROAD : wet && pool[i + 1] ? POOL : 0);
  const kit = Object.create(KIT);
  kit.renderGraph = { ...KIT.renderGraph, selection: (w, select) => notes[select.tag] };
  const renderer = createRenderer(ink, { toolkit: { KIT: kit, PixelLook, RenderStages } });
  let below, mirror;
  if (wet) {
    // the mirrored view is of the same world without its ground (the eye is under it): the slab, and the pavements' tops
    const data = world.data.slice(), floor = wet.at + 0.02;
    for (let i = 0; i < world.count; i++) if (data[i * 16 + 1] < floor || paving[i + 1]) data[i * 16 + 3] = 0;
    below = { ...world, data, effectParticles: undefined };
    mirror = createRenderer(under, { toolkit: { KIT, PixelLook, RenderStages } });
  }
  const finish = createFinish(canvas, GLOW, world.web, world.pal);

  // the view starts where the film does
  const home = filmCamera(0);
  const view = { target: home.target.slice(), yaw: home.yaw, pitch: home.pitch, dist: home.dist };
  // a pass of the render graph that adds, to every pixel, its splat's note times `most` (so the note lands in those bits)
  const add = (tag, most) => ({ id: tag, type: 'composite', select: { tag }, layer: { source: { w: 1, h: 1, rgba: new Uint8Array([...most, 255]) }, blend: 'add' } });
  const frameOptions = { stepAnimation: false, damp: false, renderGraph: { passes: [add('kind', [3, 0, 0]), add('far-low', [0, 3, 0]), add('far-high', [0, 0, 15])] } };
  let time = 0, last = performance.now(), paused = false, filming = false, drawn = false, noted = '';

  // rows of the splat table that are rewritten every frame, to send again (the puppet's parts are not: they move by their bones)
  const changedRows = [], { first, count } = world.web.rows;
  if (count) for (let r = Math.floor(first / 512); r <= Math.floor((first + count - 1) / 512); r++) changedRows.push(r);

  /* note how far each splat is from the eye, along the way it looks: a step of STEPS, two bits of it in one table and four
     in the other (the tables hold what, times the most a pass adds, comes to that many) */
  function noteDistances({ target, yaw, pitch, dist }) {
    const key = [target, yaw, pitch, dist].join();
    if (key === noted) return;
    noted = key;
    const bx = Math.cos(pitch) * Math.sin(yaw), by = Math.sin(pitch), bz = Math.cos(pitch) * Math.cos(yaw);
    // (measured from REACH short of where the eye looks, to REACH past it)
    const base = REACH + target[0] * bx + target[1] * by + target[2] * bz, k = STEPS / (2 * REACH);
    const data = world.data, low = notes['far-low'], high = notes['far-high'];
    for (let i = 1, o = 0, n = world.count; i <= n; i++, o += 16) {
      let q = ((base - (data[o] * bx + data[o + 1] * by + data[o + 2] * bz)) * k) | 0;
      q = q < 0 ? 0 : q >= STEPS ? STEPS - 1 : q;
      low[i] = (q & 3) * 85; high[i] = (q >> 2) * 17;
    }
  }

  // ── one finger or the left button turns it; the wheel or a pinch comes closer; a double click goes back to the start ──
  const fingers = new Map();
  let pinch = 0;
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('pointerdown', e => {
    canvas.setPointerCapture(e.pointerId);
    fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    pinch = 0;
  });
  const lift = e => { fingers.delete(e.pointerId); pinch = 0; };
  canvas.addEventListener('pointerup', lift);
  canvas.addEventListener('pointercancel', lift);
  canvas.addEventListener('pointermove', e => {
    const f = fingers.get(e.pointerId);
    if (!f) return;
    const dx = e.clientX - f.x, dy = e.clientY - f.y;
    f.x = e.clientX; f.y = e.clientY;
    if (fingers.size === 2) {
      const [a, b] = [...fingers.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch) view.dist = clamp(view.dist * (pinch / d), NEAR, FAR);
      pinch = d;
    } else {
      view.yaw -= dx * 0.006;
      view.pitch = clamp(view.pitch + dy * 0.005, LOW, HIGH);
    }
  });
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    view.dist = clamp(view.dist * Math.exp(e.deltaY * 0.0012), NEAR, FAR);
  }, { passive: false });
  canvas.addEventListener('dblclick', () => Object.assign(view, { target: home.target.slice(), yaw: home.yaw, pitch: home.pitch, dist: home.dist }));

  /* How big the picture is, in the window. An art pixel is a whole number of screen pixels, so the picture stays crisp:
     the most that still lets the window hold nearly all of the film's frame, each way. And an art pixel takes in as much
     of the scene as it does in the film, whatever the window: so a taller window sees more above and below, through a
     wider lens. */
  function fit() {
    const px = Math.max(1, Math.floor(Math.min(innerWidth / (0.9 * FRAME[0]), innerHeight / (0.9 * FRAME[1]))));
    return { px, w: Math.max(16, Math.ceil(innerWidth / px)), h: Math.max(16, Math.ceil(innerHeight / px)) };
  }

  function draw({ w, h, px } = fit()) {
    const lens = Math.min(0.62, (LENS * h) / FRAME[1]), fov = 2 * Math.atan(lens);
    canvas.style.width = w * px + 'px'; canvas.style.height = h * px + 'px';
    Object.assign(world.cam, view);
    world.anim.update(1 / 60, time);
    noteDistances(view);
    const { target, yaw, pitch, dist } = view;
    renderer.render(world, { width: w, height: h, time, ...(drawn && { changedRows }), camera: { target, yaw, pitch, dist, fov }, ...frameOptions });
    // the same eye put through the ground: as far under the mirror as it is over it, looking up by as much as it looks
    // down. (Its picture comes out upside down, which the pass that uses it allows for.)
    if (below) mirror.render(below, {
      width: w, height: h, time, ...(drawn && { changedRows: [] }), outline: false, clean: false, stepAnimation: false, damp: false,
      camera: { target: [target[0], 2 * wet.at - target[1], target[2]], yaw, pitch: -pitch, dist, fov }
    });
    finish.draw(ink, below && under, w, h, view, lens, time);
    if (!drawn) { drawn = true; note.remove(); }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    if (filming) return;          // (film.mjs draws every frame itself)
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (!paused) time = (time + dt) % LOOP;
    draw();
  }
  requestAnimationFrame(frame);

  /* For film.mjs: the film's frame at the moment t of the loop, from the scene's own camera, as a PNG of FRAME's size in
     art pixels. It is read back in the task it is drawn in, before the browser may clear the canvas. From the first
     call on, the page draws nothing of its own accord. */
  function film(t) {
    filming = true;
    time = t;
    const shot = filmCamera(t);
    Object.assign(view, { target: shot.target.slice(), yaw: shot.yaw, pitch: shot.pitch, dist: shot.dist });
    draw({ w: FRAME[0], h: FRAME[1], px: 1 });
    return canvas.toDataURL('image/png');
  }

  // for looking at it from the console, and for film.mjs
  window.__vice = {
    world, view, renderer, frameOptions, draw, filmCamera, film, FRAME, ink, under, notes,
    get time() { return time; }, set time(t) { time = t; },
    get paused() { return paused; }, set paused(v) { paused = v; }
  };
}

/* The pass that finishes Ink's picture. `glow` is the scene's GLOW (the haze over the corner and its lamps, the
   searchlight, the lamps that flash); `web` is the scene's world.web (the colours to show, how the wet ground
   mirrors); `inked` the colours as Ink has them, their low bits clear. */
function createFinish(target, glow, web, inked) {
  const gl = target.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false });
  if (!gl) throw new Error('WebGL 2');
  const P = glow.points.length, Wn = glow.wash.length, N = web.colours.length;
  const wet = web.mirror, kept = bytes(web.bits);
  const f = v => (Number.isInteger(v) ? v + '.0' : String(v));
  const v3 = hex => `vec3(${rgb(hex).map(v => v.toFixed(4)).join(', ')})`;
  const list = hexes => `vec3[${hexes.length}](${hexes.map(v3).join(', ')})`;
  /* the evening sky, a band at a time from the horizon up: toward the sun, and away from it */
  const SKY_SUN = ['#ffe9a6', '#ffc56e', '#ff9659', '#f96d6c', '#d9528a', '#a3449c', '#6b3d98', '#3f3484', '#27296a', '#191e52'];
  const SKY_FAR = ['#f2a7a0', '#d987a8', '#b872aa', '#9163a8', '#6f559f', '#554990', '#41407f', '#31366f', '#232b5d', '#171f4b'];
  /* and the sea under it, from the horizon down */
  const SEA_SUN = ['#ffb872', '#f0846c', '#c75f84', '#8c4a8e', '#583c85', '#33316e', '#212658', '#161c44'];
  const SEA_FAR = ['#b8789e', '#8f639d', '#6b5296', '#4c4488', '#373876', '#272e63', '#1c2552', '#141b40'];
  const fragment = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D u_scene, u_under;
uniform vec2 u_size, u_lens, u_far;             // (u_far: the nearest distance noted, and the size of a step)
uniform vec3 u_eye, u_right, u_up, u_back;
uniform float u_drift, u_time;                  // (u_time: where in the loop it is, in seconds)
uniform vec3 u_sun;                             // the way to the sun, as it is drawn (lower than it lights from)
uniform vec4 u_lamp[${P}], u_lampLight[${P}];   // where and how far it reaches; its colour times its strength now, and a ceiling
uniform vec4 u_beam, u_beamAxis, u_beamLight;   // the searchlight: where and reach; its axis and the cosine of its edge; colour, cosine of its core
uniform vec4 u_wash[${Wn}];                     // the lamps that flash: where, and how far their light is laid on things
uniform vec3 u_washLight[${Wn}];                // their colours times their strength now
uniform vec3 u_mist;
uniform ivec3 u_inked[${N}];                    // the scene's colours as Ink has them,
uniform vec3 u_colour[${N}];                    // and as they are shown
${wet ? 'uniform vec3 u_roadTint, u_poolTint;' : ''}
out vec4 o;
const float BAYER[16] = float[16](0., 8., 2., 10., 12., 4., 14., 6., 3., 11., 1., 9., 15., 7., 13., 5.);
const vec3 LUMA = vec3(0.30, 0.55, 0.15);
const float PI = 3.14159265;
const vec3 SKY_SUN[${SKY_SUN.length}] = ${list(SKY_SUN)};
const vec3 SKY_FAR[${SKY_FAR.length}] = ${list(SKY_FAR)};
const vec3 SEA_SUN[${SEA_SUN.length}] = ${list(SEA_SUN)};
const vec3 SEA_FAR[${SEA_FAR.length}] = ${list(SEA_FAR)};

float hash1(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p) {
  vec2 i = floor(p), q = fract(p); q = q * q * (3.0 - 2.0 * q);
  return mix(mix(hash1(i), hash1(i + vec2(1.0, 0.0)), q.x), mix(hash1(i + vec2(0.0, 1.0)), hash1(i + vec2(1.0, 1.0)), q.x), q.y);
}
float fbm(vec2 p) { return 0.5 * vnoise(p) + 0.3 * vnoise(p * 2.03 + 7.1) + 0.2 * vnoise(p * 4.1 + 3.7); }
// how much cloud there is at a bearing and a height in the sky (over 0: cloud). Clouds keep low, in long banks. (They do
// not drift: at the end of the loop they would have to be back where they were at its start.)
float cloud(float az, float el) {
  float lie = smoothstep(0.015, 0.1, el) * (1.0 - smoothstep(0.34, 0.75, el));
  return fbm(vec2(az * 2.6, el * 8.5)) + 0.2 * vnoise(vec2(az * 9.0, el * 26.0)) - 0.66 - (1.0 - lie) * 0.5;
}
/* The evening, the way d looks. \`rank\` and \`rank2\` are the pixel's places in two orders, for laying one band into the
   next in a pattern. */
vec3 sky(vec3 d, float rank, float rank2) {
  float el = asin(clamp(d.y, -1.0, 1.0)), az = atan(d.x, -d.z), sunAz = atan(u_sun.x, -u_sun.z);
  float away = abs(mod(az - sunAz + PI, 2.0 * PI) - PI);                 // how far round from the sun's bearing, 0 to PI
  float toward = 1.0 - smoothstep(0.25, 2.3, away);
  float sunward = acos(clamp(dot(d, u_sun), -1.0, 1.0));                 // how far from the sun itself
  if (el < 0.0) {
    // the sea: it carries the sky's light near the horizon, and is deep water below
    float depth = -el, g = pow(depth / 1.5708, 0.42) * ${f(SEA_SUN.length - 1)};
    int i = int(clamp(floor(g + (rank - 0.5) * 0.9), 0.0, ${f(SEA_SUN.length - 1)}));
    vec3 c = rank2 < toward ? SEA_SUN[i] : SEA_FAR[i];
    // the sun's road on the water: short bright strokes, thick under the sun and near the horizon, thinning toward us.
    // Each row of them slides along by a whole number of strokes in the loop, and its strokes come round again after
    // that many: so at the end of the loop the row is as it was at the start
    float row = floor(depth * 300.0), reach = 1.0 - smoothstep(0.0, 0.75, depth);
    float lane = (1.0 - smoothstep(0.02, 0.1 + depth * 0.9, away)) * reach;
    float slide = floor(${f(LOOP)} * (0.5 + hash1(vec2(row, 2.0))) + 0.5);
    float seg = mod(floor(az * 90.0 + hash1(vec2(row, 1.0)) * 40.0 + u_time * slide / ${f(LOOP)}), slide);
    float spark = hash1(vec2(seg, row));
    if (spark < lane * 0.62) c = spark < lane * 0.2 ? ${v3('#fff1b8')} : ${v3('#ffc56e')};
    else if (spark > 1.0 - 0.035 * reach * (0.2 + toward)) c = mix(c, ${v3('#ffb0a0')}, 0.5);    // and a glint here and there besides
    return c;
  }
  // the bands, thin near the horizon; the sun pulls its own colours up round itself
  float g = pow(el / 1.5708, 0.5) * ${f(SKY_SUN.length - 1)} - 2.6 * (1.0 - smoothstep(0.0, 0.5, sunward));
  int i = int(clamp(floor(g + (rank - 0.5) * 0.9), 0.0, ${f(SKY_SUN.length - 1)}));
  vec3 c = rank2 < toward ? SKY_SUN[i] : SKY_FAR[i];
  // a few early stars, high up and away from the sun
  if (el > 0.55 && hash1(floor(vec2(az * 70.0, el * 70.0))) > 0.994 - 0.004 * (1.0 - toward)) c = ${v3('#f0e4ff')};
  // the sun: a disc, and a ring of its light
  if (sunward < 0.072) c = ${v3('#fffbe0')};
  else if (sunward < 0.105 && rank < 0.5 + 0.5 * (0.105 - sunward) / 0.033) c = ${v3('#ffe9a6')};
  // clouds: lit from under by the sun, which is lower than they are; their tops gone over to the dusk
  float n = cloud(az, el);
  if (n > 0.0) {
    float under = cloud(az, el - 0.028), lit = toward * (0.55 + 0.45 * (1.0 - smoothstep(0.1, 0.5, el)));
    if (under <= 0.0) c = rank2 < lit ? (sunward < 0.6 ? ${v3('#ffd98a')} : ${v3('#ffa878')}) : ${v3('#e58aa6')};
    else if (n < 0.07 + (rank - 0.5) * 0.04) c = rank2 < lit ? ${v3('#e0708c')} : ${v3('#a868a4')};
    else c = rank2 < lit * 0.6 ? ${v3('#9a4e92')} : ${v3('#5c4690')};
  }
  // a city a long way off, to the right of the sun: towers against the glow, a window lit here and there
  float town = smoothstep(0.25, 0.6, az - sunAz) * (1.0 - smoothstep(1.5, 2.1, az - sunAz));
  if (town > 0.0 && el < 0.085) {
    float cell = floor(az * 44.0), tall = (0.012 + 0.066 * pow(hash1(vec2(cell, 3.0)), 2.2)) * town;
    if (el < tall) {
      c = ${v3('#2a2262')};
      if (hash1(floor(vec2(az * 132.0, el * 330.0))) > 0.83) c = hash1(vec2(cell, 9.0)) > 0.5 ? ${v3('#ffc56e')} : ${v3('#ff8f9c')};
    }
  }
  return c;
}

const vec2 HAZE_AT = vec2(${f((glow.centre || [0, 0])[0])}, ${f((glow.centre || [0, 0])[1])});   // the middle of the haze, on the ground
float thick(vec3 p) {
  return clamp((${f(glow.reach)} - length(p.xz - HAZE_AT)) * 0.6, 0.0, 1.0) * clamp((${f(glow.top)} - p.y) * 0.8, 0.0, 1.0) * step(0.0, p.y) *
    (0.8 + 0.2 * sin(0.9 * p.x + 1.3 * p.z + u_drift) * sin(1.7 * p.y - 0.6 * p.z));
}
float phase(float c) { return ${f(1 - glow.anisotropy ** 2)} / pow(${f(1 + glow.anisotropy ** 2)} - ${f(2 * glow.anisotropy)} * c, 1.5); }
// the part of a stretch of a line of sight that lies inside a ball
bool within(vec3 eye, vec3 d, vec2 stretch, vec3 c, float r, out float t0, out float t1) {
  vec3 u = c - eye; float tc = dot(u, d), b = dot(u, u) - tc * tc;
  if (b >= r * r) return false;
  float h = sqrt(r * r - b); t0 = max(stretch.x, tc - h); t1 = min(stretch.y, tc + h);
  return t1 > t0;
}
/* The haze along a line of sight as far as \`stop\`: the lamplight it sends this way, and how much of what lies beyond
   it hides. */
vec4 haze(vec3 eye, vec3 d, float stop) {
  // the stretch of it that is in the haze at all: over the ground, under the haze's top, within its reach
  vec2 span = vec2(0.0, stop);
  if (abs(d.y) > 1e-5) { vec2 t = vec2(-eye.y, ${f(glow.top)} - eye.y) / d.y; span = vec2(max(span.x, min(t.x, t.y)), min(span.y, max(t.x, t.y))); }
  else if (eye.y < 0.0 || eye.y > ${f(glow.top)}) return vec4(0.0);
  vec2 from = eye.xz - HAZE_AT;
  float qa = dot(d.xz, d.xz), qb = dot(from, d.xz), qc = dot(from, from) - ${f(glow.reach * glow.reach)};
  if (qa > 1e-8) {
    float disc = qb * qb - qa * qc;
    if (disc <= 0.0) return vec4(0.0);
    span = vec2(max(span.x, (-qb - sqrt(disc)) / qa), min(span.y, (-qb + sqrt(disc)) / qa));
  } else if (qc > 0.0) return vec4(0.0);
  if (span.y <= span.x) return vec4(0.0);
  float t0, t1, depth = 0.0, whole = (span.y - span.x) / 12.0;
  for (int k = 0; k < 12; k++) depth += thick(eye + d * (span.x + (float(k) + 0.5) * whole)) * whole;
  vec3 lit = vec3(0.0);
  for (int i = 0; i < ${P}; i++) if (dot(u_lampLight[i].rgb, LUMA) > 0.001 && within(eye, d, span, u_lamp[i].xyz, u_lamp[i].w, t0, t1)) {
    float dt = (t1 - t0) / 10.0, sum = 0.0;
    for (int k = 0; k < 10; k++) {
      vec3 p = eye + d * (t0 + (float(k) + 0.5) * dt), to = u_lamp[i].xyz - p;
      float r = length(to), fall = 1.0 - r / u_lamp[i].w;
      if (p.y < u_lampLight[i].w) sum += thick(p) * fall * fall * phase(dot(d, to / r));
    }
    lit += u_lampLight[i].rgb * (sum * dt);
  }
  if (within(eye, d, span, u_beam.xyz, u_beam.w, t0, t1)) {
    float dt = (t1 - t0) / 30.0, sum = 0.0;
    for (int k = 0; k < 30; k++) {
      vec3 p = eye + d * (t0 + (float(k) + 0.5) * dt), to = u_beam.xyz - p;
      float r = length(to), fall = 1.0 - r / u_beam.w, c = -dot(to / r, u_beamAxis.xyz);
      sum += thick(p) * fall * phase(dot(d, to / r)) * smoothstep(u_beamAxis.w, u_beamLight.w, c);
    }
    lit += u_beamLight.rgb * (sum * dt);
  }
  return vec4(lit * u_mist, 1.0 - exp(-${f(glow.density)} * depth));
}
// which of the scene's colours a pixel of Ink's is, its notes left off (0: none of them)
int colourOf(ivec3 texel) {
  ivec3 key = texel & ivec3(${kept.join(', ')});
  for (int i = 1; i < ${N}; i++) if (u_inked[i] == key) return i;
  return 0;
}
vec3 nearest(vec3 c) {
  vec3 pick = c; float best = 1e9;
  for (int i = 1; i < ${N}; i++) {
    vec3 df = c - u_colour[i]; float dist = dot(df * df, LUMA);
    if (dist < best) { best = dist; pick = u_colour[i]; }
  }
  return pick;
}
${wet ? `
// what the mirror shows at a pixel of this picture (the mirrored picture is upside down), and whether it shows anything
vec4 mirrored(ivec2 p) {
  ivec3 texel = ivec3(texelFetch(u_under, ivec2(clamp(p.x, 0, int(u_size.x) - 1), int(u_size.y) - 1 - clamp(p.y, 0, int(u_size.y) - 1)), 0).rgb * 255.0 + 0.5);
  int i = colourOf(texel);
  return i > 0 ? vec4(u_colour[i], 1.0) : vec4(0.0);
}` : ''}
void main() {
  ivec2 at = ivec2(gl_FragCoord.xy);
  ivec3 seen = ivec3(texelFetch(u_scene, at, 0).rgb * 255.0 + 0.5);
  vec3 d = normalize(u_right * ((gl_FragCoord.x / u_size.x * 2.0 - 1.0) * u_lens.x) + u_up * ((gl_FragCoord.y / u_size.y * 2.0 - 1.0) * u_lens.y) - u_back);
  ivec2 cell = ivec2(at.x, int(u_size.y) - 1 - at.y);
  float rank = (BAYER[(cell.x & 3) + ((cell.y & 3) << 2)] + 0.5) / 16.0, rank2 = (BAYER[((cell.x + 2) & 3) + (((cell.y + 1) & 3) << 2)] + 0.5) / 16.0;
  if (seen == ivec3(0)) {
    // nothing there: the evening, and over it the haze's glow, laid on in a few steps
    vec4 h = haze(u_eye, d, 1e9);
    vec3 c = sky(d, rank, rank2) * (1.0 - 0.6 * h.a);
    o = vec4(c + floor(h.rgb * 7.0 + rank) / 7.0, 1.0);
    return;
  }
  int kind = seen.r & 3, far = ((seen.b & 15) << 2) | (seen.g & 3), index = colourOf(seen);
  vec3 c = index > 0 ? u_colour[index] : vec3(seen) / 255.0;
  o = vec4(c, 1.0);
  if (kind == ${GLOWS} || index == 0) return;   // what glows keeps the colour it has
  bool changed = false;
  // where the pixel is in the scene: on the ground, exactly; anything else, to the nearest step of the distances noted
  float along = (u_far.x + (float(far) + 0.5) * u_far.y) / -dot(d, u_back);
  bool ground = (kind == ${ROAD} || kind == ${POOL}) && d.y < -0.001;
  if (ground) along = (${f(wet ? wet.at : 0)} - u_eye.y) / d.y;
  vec3 p = u_eye + d * along;
${wet ? `  if (ground) {
    vec4 shown;
    if (kind == ${POOL}) {
      // (still water, but not glass: it shivers a little, each shiver a whole number of times round in the loop)
      vec2 slope = 1.3 * vec2(sin(p.x * 9.0 + u_time * ${f(lap(10))}) + sin(p.z * 5.0 - u_time * ${f(lap(6))}), sin(p.z * 11.0 + u_time * ${f(lap(7))}));
      shown = mirrored(at + ivec2(floor(vec2(dot(slope, u_right.xz), dot(slope, u_up.xz)) + 0.5)));
    } else {
      shown = 0.4 * mirrored(at) + 0.15 * (mirrored(at + ivec2(${Math.round(wet.road.blur)}, 0)) + mirrored(at - ivec2(${Math.round(wet.road.blur)}, 0)) +
        mirrored(at + ivec2(0, ${Math.round(wet.road.blur)})) + mirrored(at - ivec2(0, ${Math.round(wet.road.blur)})));
    }
    // where nothing stands to be mirrored, the sky is
    vec3 above = sky(vec3(d.x, -d.y, d.z), rank, rank2);
    vec3 image = shown.a > 0.0 ? mix(above, shown.rgb / shown.a, shown.a) : above;
    float graze = 1.0 - clamp(-d.y, 0.0, 1.0);
    float share = kind == ${POOL} ? (${f(wet.pool.f0)} + ${f(1 - wet.pool.f0)} * pow(graze, ${f(wet.pool.power ?? 5)})) * ${f(wet.pool.strength)}
                              : (${f(wet.road.f0)} + ${f(1 - wet.road.f0)} * pow(graze, ${f(wet.road.power ?? 5)})) * ${f(wet.road.strength)};
    // (the road gives back the sky less than it gives back a lit thing standing on it)
    if (shown.a <= 0.0 && kind == ${ROAD}) share *= 0.5;
    c = mix(c, image * (kind == ${POOL} ? u_poolTint : u_roadTint), share);
    changed = true;
  }` : ''}
  // the lamps that flash, on what they reach
  vec3 tint = vec3(0.0);
  for (int i = 0; i < ${Wn}; i++) {
    float k = max(0.0, 1.0 - length(u_wash[i].xyz - p) / u_wash[i].w);
    tint += u_washLight[i] * (k * k);
  }
  if (dot(tint, LUMA) > 0.004) {
    // (they show on what is in shade. What the sun or a lamp has already lit bright takes little more from them and
    // keeps its own colour: a white car in the sun does not turn blue)
    float top = max(max(c.r, c.g), max(c.b, 0.05)), room = 1.0 - 0.75 * smoothstep(0.45, 1.0, top);
    c = c * min(1.0 + 0.5 * dot(tint, vec3(1.0)), max(1.0, 1.0 / top)) + tint * 0.3 * room;
    changed = true;
  }
  // the searchlight, on what stands in it
  vec3 tb = p - u_beam.xyz; float lb = length(tb);
  float spot = smoothstep(u_beamAxis.w, u_beamLight.w, dot(tb / lb, u_beamAxis.xyz)) * clamp(1.6 - 1.6 * lb / u_beam.w, 0.0, 1.0);
  if (spot > 0.02) {
    // (a colour is brightened by no more than leaves its strongest part whole: past that it only turns toward white,
    // and what was already bright, the oranges, the seats, would lose its colour)
    float top = max(max(c.r, c.g), max(c.b, 0.05));
    c = c * min(1.0 + 0.8 * spot, max(1.0, 1.0 / top)) + spot * 0.03 * vec3(1.0, 0.95, 0.8);
    changed = true;
  }
  // the haze between the eye and what is seen
  vec4 h = haze(u_eye, d, along);
  float glare = dot(h.rgb, LUMA);
  if (glare > 0.003) {
    // (seen from close by a lamp, the haze in front of a thing would bleach it: it is held to about what the halo itself shows)
    if (glare > 0.12) h.rgb *= (0.12 + 0.1 * (1.0 - exp((0.12 - glare) / 0.2))) / glare;
    c = c * (1.0 - h.a) + h.rgb * (1.0 - 0.85 * smoothstep(0.4, 0.9, max(max(c.r, c.g), c.b)));   // (and little of it over what is bright already: a sunlit wall keeps its colour behind a lamp's halo)
    changed = true;
  }
  // and it ends as the nearest of the scene's own colours, as Ink ends every pixel
  if (changed) o.rgb = nearest(c);
}`;
  const compile = (type, source) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
    return shader;
  };
  const program = gl.createProgram();
  gl.attachShader(program, compile(gl.VERTEX_SHADER, '#version 300 es\nvoid main() { gl_Position = vec4(gl_VertexID == 1 ? 3.0 : -1.0, gl_VertexID == 2 ? 3.0 : -1.0, 0.0, 1.0); }'));
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragment));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
  gl.useProgram(program);
  const U = name => gl.getUniformLocation(program, name);
  gl.bindVertexArray(gl.createVertexArray());
  // two textures: Ink's picture, and its mirrored picture
  const texture = unit => {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
    for (const [key, value] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]])
      gl.texParameteri(gl.TEXTURE_2D, key, value);
  };
  texture(0); texture(1);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
  gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  // what does not change from frame to frame
  const unit = v => { const l = Math.hypot(...v); return v.map(n => n / l); }, cos = deg => Math.cos((deg * Math.PI) / 180);
  gl.uniform1i(U('u_scene'), 0); gl.uniform1i(U('u_under'), 1);
  gl.uniform3fv(U('u_mist'), rgb(glow.color).map(v => v * glow.density));
  gl.uniform4fv(U('u_lamp'), glow.points.flatMap(p => [...p.at, p.radius]));
  gl.uniform4fv(U('u_wash'), glow.wash.flatMap(p => [...p.at, p.radius]));
  gl.uniform3iv(U('u_inked'), inked.slice(0, N).flatMap(bytes));
  gl.uniform3fv(U('u_colour'), web.colours.flatMap(rgb));
  // the sun as it is drawn: on its own bearing, but nearly down
  const flat = Math.hypot(SUN[0], SUN[2]), low = 0.1;
  gl.uniform3fv(U('u_sun'), [(SUN[0] / flat) * Math.cos(low), Math.sin(low), (SUN[2] / flat) * Math.cos(low)]);
  if (wet) {
    gl.uniform3fv(U('u_roadTint'), rgb(wet.road.color));
    gl.uniform3fv(U('u_poolTint'), rgb(wet.pool.color));
  }
  const at = {
    size: U('u_size'), lens: U('u_lens'), far: U('u_far'), eye: U('u_eye'), right: U('u_right'), up: U('u_up'), back: U('u_back'),
    drift: U('u_drift'), time: U('u_time'), light: U('u_lampLight'), wash: U('u_washLight'),
    beam: U('u_beam'), beamAxis: U('u_beamAxis'), beamLight: U('u_beamLight')
  };
  return {
    draw(scene, under, w, h, { target: aim, yaw, pitch, dist }, lens, t) {
      if (target.width !== w) target.width = w;
      if (target.height !== h) target.height = h;
      gl.viewport(0, 0, w, h);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);                     // row 0 of a picture's texture is its bottom row
      gl.activeTexture(gl.TEXTURE0);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, scene);
      if (under) {
        gl.activeTexture(gl.TEXTURE1);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, under);
      }
      const sy = Math.sin(yaw), cy = Math.cos(yaw), sp = Math.sin(pitch), cp = Math.cos(pitch);
      const back = [cp * sy, sp, cp * cy];
      gl.uniform2f(at.size, w, h);
      gl.uniform2f(at.lens, (lens * w) / h, lens);
      gl.uniform2f(at.far, dist - REACH, (2 * REACH) / STEPS);
      gl.uniform3f(at.eye, aim[0] + dist * back[0], aim[1] + dist * back[1], aim[2] + dist * back[2]);
      gl.uniform3f(at.right, cy, 0, -sy);
      gl.uniform3f(at.up, -sp * sy, cp, -sp * cy);
      gl.uniform3fv(at.back, back);
      gl.uniform1f(at.drift, t * glow.drift);
      gl.uniform1f(at.time, ((t % LOOP) + LOOP) % LOOP);
      // every lamp as it is at this moment: some of them flash
      const pulse = glow.pulse(t), now = p => (p.pulse ? pulse[p.pulse] : 1);
      gl.uniform4fv(at.light, glow.points.flatMap(p => [...rgb(p.color).map(v => v * p.intensity * now(p)), p.under ?? 1e9]));
      gl.uniform3fv(at.wash, glow.wash.flatMap(p => rgb(p.color).map(v => v * p.strength * now(p))));
      // the searchlight: from the helicopter, wherever that has got to, to where it is looking
      const { from, to } = beamAt(t), axis = unit([to[0] - from[0], to[1] - from[1], to[2] - from[2]]), b = glow.beam;
      gl.uniform4fv(at.beam, [...from, b.radius]);
      gl.uniform4fv(at.beamAxis, [...axis, cos(b.outerAngle)]);
      gl.uniform4fv(at.beamLight, [...rgb(b.color).map(v => v * b.intensity), cos(b.innerAngle)]);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
  };
}
