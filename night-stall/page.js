// The night stall on its own: drag to turn it, scroll to come closer. Nothing else is on the page.
// build-page.mjs packs this, the scene (scene.js) and the Ink Studio toolkit into one HTML
// file that opens straight from disk. The toolkit arrives first as a plain script, so its names are already in scope.
// The scene comes with it already sculpted and baked (that is done when the page is built), so the page opens at once.
//
// Ink Studio's WebGL renderer draws the scene itself, live: the sculpt, the rain and steam, what swings. Two things
// the film's (CPU) renderer does it has no means for, and those are done here, in one small pass over Ink's picture:
//   the lit mist      How much lamplight the mist along a line of sight scatters this way is the same sum the film's
//                     renderer does. Where Ink has drawn nothing (its backdrop, pure black in the scene's `web`
//                     variant) the sum runs right through, and the pixel is one of the mist's own few colours,
//                     dithered: the lamps' halos. Where it has drawn something the sum stops there, and is added to
//                     what is drawn: things behind a lamp are seen through its haze.
//   the wet ground    Ink draws the scene a second time from under the ground looking up, which is what a mirror
//                     lying on the road shows, and the pass lays that picture into the pixels that are road or pool,
//                     by as much as the film does, a pool's bent by the rings the rain makes in it.
// For that the pass has to know, of each pixel, what it shows and how far off it is. Ink's render graph can add a
// number of its own to every pixel a chosen set of splats shows: here it adds, into the low bits of a pixel's colour
// (which the scene's `web` palette leaves clear), a note of each splat's kind and of its distance from the eye.
// Either way a pixel ends as one of the scene's own colours, as everything else in the picture is.
/* global KIT, PixelLook, RenderStages, makeBuilder, makeSculpt */
import { createRenderer } from '@shapeshift-labs/ink-studio/webgl.mjs';
import makeScene from './scene.js';

const { LOOP, GLOW, camera: filmCamera } = makeScene;
const FRAME = [480, 270], LENS = Math.tan((19 * Math.PI) / 180);   // the film's picture in art pixels, and its lens (half its angle of view, as a tangent)
const NEAR = 5.5, FAR = 13, LOW = 0.1, HIGH = 1.25;
const REACH = 5.5, STEPS = 64;              // how far from where the eye looks anything in the scene is; distances are noted in 64 steps across that
const ROAD = 1, POOL = 2, GLOWS = 3;        // a splat's kind, as noted
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
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
   sculpted and baked here as the film's is, which is ten seconds' work, and the page says so meanwhile. */
async function getWorld() {
  const stored = query.has('live') || typeof DecompressionStream !== 'function' ? null : await storedScene();
  if (stored) try {
    return makeScene.unpack({ KIT }, { plain: stored.plain, arrays: await unsqueeze(stored.layout, stored.arrays) });
  } catch (e) {
    console.warn('The stored scene could not be read, so it is built here instead.', e);
  }
  say('正在搭建场景，大约需要 10 秒…\nBuilding the scene, about 10 seconds…');
  await new Promise(seen => requestAnimationFrame(() => requestAnimationFrame(seen)));
  const scene = makeScene({ makeBuilder, makeSculpt, KIT });
  return scene.build(scene.seed, { controls: { still: true, web: true, ...JSON.parse(query.get('params') || '{}') } });
}

/* What build-stall-viewer.mjs stores of the scene, baked, its big arrays packed small, as { plain, layout, arrays }:
   in the page itself (the file that opens from disk), or published beside it (the Artifact), in which case the page
   began to fetch it before its scripts. Null if there is none. */
async function storedScene() {
  const baked = document.getElementById('baked'), packed = document.getElementById('baked-arrays');
  if (baked && packed) {
    const { plain, layout } = JSON.parse(baked.textContent), arrays = packed.textContent;
    baked.remove(); packed.remove();   // (megabytes of text the page has no more use for)
    return { plain, layout, arrays };
  }
  return window.__stallScene ?? null;
}

/* The store's arrays again: gunzipped, and each put back from a byte of every number at a time, and within that a
   column at a time, into numbers in rows (`squeeze` in build-stall-viewer.mjs, undone). */
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
  const named = name => (wet ? KIT.renderGraph.selection(world, { material: name }) : notes.kind);
  const road = named('road'), pool = named('pool');
  for (let i = 0; i < world.count; i++)
    notes.kind[i + 1] = 85 * (Math.round(world.data[i * 16 + 11]) & 32 ? GLOWS : wet && road[i + 1] ? ROAD : wet && pool[i + 1] ? POOL : 0);
  const kit = Object.create(KIT);
  kit.renderGraph = { ...KIT.renderGraph, selection: (w, select) => notes[select.tag] };
  const renderer = createRenderer(ink, { toolkit: { KIT: kit, PixelLook, RenderStages } });
  let below, mirror;
  if (wet) {
    // the mirrored view is of the same world without its ground (the eye is under it) and without rain and steam
    const data = world.data.slice(), { first, count } = world.web.rows, floor = wet.at + 0.02;
    for (let i = 0; i < world.count; i++) if (data[i * 16 + 1] < floor || (i >= first && i < first + count)) data[i * 16 + 3] = 0;
    below = { ...world, data, effectParticles: undefined };
    mirror = createRenderer(under, { toolkit: { KIT, PixelLook, RenderStages } });
  }
  const finish = createFinish(canvas, GLOW, world.web, world.pal);

  // the view starts where the film does
  const home = filmCamera(0);
  const view = { target: home.target.slice(), yaw: home.yaw, pitch: home.pitch, dist: home.dist };
  // a pass of the render graph that adds, to every pixel, its splat's note times `most` (so the note lands in those bits)
  const add = (tag, most) => ({ id: tag, type: 'composite', select: { tag }, layer: { source: { w: 1, h: 1, rgba: new Uint8Array([...most, 255]) }, blend: 'add' } });
  // (damp: Ink holds back a pixel that changes for a frame only, to steady a picture in motion: that eats falling rain)
  const frameOptions = { stepAnimation: false, damp: false, renderGraph: { passes: [add('kind', [3, 0, 0]), add('far-low', [0, 3, 0]), add('far-high', [0, 0, 15])] } };
  let time = 0, last = performance.now(), paused = false, drawn = false, noted = '';

  // rain and steam are rewritten every frame: those are the only rows of the splat table to send again
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

  function draw() {
    /* An art pixel is a whole number of screen pixels, so the picture stays crisp: the most that still lets the window
       hold nearly all of the film's frame, each way. And an art pixel takes in as much of the scene as it does in the
       film, whatever the window (the scene is drawn for that: finer or coarser, and a line of rain is no longer a line):
       so a taller window sees more above and below, through a wider lens. */
    const px = Math.max(1, Math.floor(Math.min(innerWidth / (0.9 * FRAME[0]), innerHeight / (0.9 * FRAME[1]))));
    const w = Math.max(16, Math.ceil(innerWidth / px)), h = Math.max(16, Math.ceil(innerHeight / px));
    const lens = Math.min(0.62, (LENS * h) / FRAME[1]), fov = 2 * Math.atan(lens);
    canvas.style.width = w * px + 'px'; canvas.style.height = h * px + 'px';
    // the scene asks where the eye is (steam turns its lit side to it)
    Object.assign(world.cam, view);
    world.anim.update(1 / 60, time);
    noteDistances(view);
    const { target, yaw, pitch, dist } = view;
    renderer.render(world, { width: w, height: h, time, ...(drawn && { changedRows }), camera: { target, yaw, pitch, dist, fov }, ...frameOptions });
    // the same eye put through the ground: as far under the mirror as it is over it, looking up by as much as it looks
    // down. (Its picture comes out upside down, which the pass that uses it allows for.)
    if (below) mirror.render(below, {
      width: w, height: h, time, ...(drawn && { changedRows: [] }), outline: false, clean: false, stepAnimation: false, damp: false,
      camera: { target: [target[0], 2 * world.web.mirror.at - target[1], target[2]], yaw, pitch: -pitch, dist, fov }
    });
    finish.draw(ink, below && under, w, h, view, lens, time);
    if (!drawn) { drawn = true; note.remove(); }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (!paused) time = (time + dt) % LOOP;
    draw();
  }
  requestAnimationFrame(frame);

  // for looking at it from the console
  window.__stall = {
    world, view, renderer, frameOptions, draw, filmCamera, ink, under, notes,
    get time() { return time; }, set time(t) { time = t; },
    get paused() { return paused; }, set paused(v) { paused = v; }
  };
}

/* The pass that finishes Ink's picture. `mist` is the scene's GLOW (a cylinder of mist over the island, thinning to its
   edge and top; its lamps; the colours it is drawn in); `web` is the scene's world.web (the colours to show, how the
   wet ground mirrors); `inked` the colours as Ink has them, their low bits clear. */
function createFinish(target, mist, web, inked) {
  const gl = target.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false });
  if (!gl) throw new Error('WebGL 2');
  const P = mist.points.length, R = mist.ramp.colors.length, N = web.colours.length, spot = mist.spots[0];
  const wet = web.mirror, rings = wet?.rings, DROPS = 256, kept = bytes(web.bits);
  const f = v => (Number.isInteger(v) ? v + '.0' : String(v));
  const fragment = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D u_scene, u_under;
uniform highp sampler2D u_drops;                // a texel to each ring: where on the ground, how far it has spread, how strong
uniform int u_dropCount;
uniform vec2 u_size, u_lens, u_far;             // (u_far: the nearest distance noted, and the size of a step)
uniform vec3 u_eye, u_right, u_up, u_back;
uniform float u_drift;
uniform vec4 u_lamp[${P}], u_lampLight[${P}];   // where and how far it reaches; its colour times its strength, and a ceiling
uniform vec4 u_beam, u_beamAxis, u_beamLight;   // the street lamp: where and reach; its axis and the cosine of its edge; colour, cosine of its core
uniform vec3 u_ramp[${R}], u_night, u_mist;
uniform ivec3 u_inked[${N}];                    // the scene's colours as Ink has them,
uniform vec3 u_colour[${N}];                    // and as they are shown
${wet ? `uniform int u_weather[${wet.weather.length}]; uniform vec3 u_roadTint, u_poolTint;` : ''}
out vec4 o;
const float BAYER[16] = float[16](0., 8., 2., 10., 12., 4., 14., 6., 3., 11., 1., 9., 15., 7., 13., 5.);
const vec3 LUMA = vec3(0.30, 0.55, 0.15);

float thick(vec3 p) {
  return clamp((${f(mist.reach)} - length(p.xz)) * 0.6, 0.0, 1.0) * clamp((${f(mist.top)} - p.y) * 0.8, 0.0, 1.0) * step(0.0, p.y) *
    (0.8 + 0.2 * sin(0.9 * p.x + 1.3 * p.z + u_drift) * sin(1.7 * p.y - 0.6 * p.z));
}
float phase(float c) { return ${f(1 - mist.anisotropy ** 2)} / pow(${f(1 + mist.anisotropy ** 2)} - ${f(2 * mist.anisotropy)} * c, 1.5); }
// the part of a stretch of a line of sight that lies inside a ball
bool within(vec3 eye, vec3 d, vec2 stretch, vec3 c, float r, out float t0, out float t1) {
  vec3 u = c - eye; float tc = dot(u, d), b = dot(u, u) - tc * tc;
  if (b >= r * r) return false;
  float h = sqrt(r * r - b); t0 = max(stretch.x, tc - h); t1 = min(stretch.y, tc + h);
  return t1 > t0;
}
/* The mist along a line of sight as far as \`stop\`: the lamplight it sends this way, and how much of what lies beyond
   it hides. */
vec4 haze(vec3 eye, vec3 d, float stop) {
  // the stretch of it that is in the mist at all: over the ground, under the mist's top, within its reach
  vec2 span = vec2(0.0, stop);
  if (abs(d.y) > 1e-5) { vec2 t = vec2(-eye.y, ${f(mist.top)} - eye.y) / d.y; span = vec2(max(span.x, min(t.x, t.y)), min(span.y, max(t.x, t.y))); }
  else if (eye.y < 0.0 || eye.y > ${f(mist.top)}) return vec4(0.0);
  float qa = dot(d.xz, d.xz), qb = dot(eye.xz, d.xz), qc = dot(eye.xz, eye.xz) - ${f(mist.reach * mist.reach)};
  if (qa > 1e-8) {
    float disc = qb * qb - qa * qc;
    if (disc <= 0.0) return vec4(0.0);
    span = vec2(max(span.x, (-qb - sqrt(disc)) / qa), min(span.y, (-qb + sqrt(disc)) / qa));
  } else if (qc > 0.0) return vec4(0.0);
  if (span.y <= span.x) return vec4(0.0);
  float t0, t1, depth = 0.0, whole = (span.y - span.x) / 16.0;
  for (int k = 0; k < 16; k++) depth += thick(eye + d * (span.x + (float(k) + 0.5) * whole)) * whole;
  vec3 lit = vec3(0.0);
  for (int i = 0; i < ${P}; i++) if (within(eye, d, span, u_lamp[i].xyz, u_lamp[i].w, t0, t1)) {
    float dt = (t1 - t0) / 12.0, sum = 0.0;
    for (int k = 0; k < 12; k++) {
      vec3 p = eye + d * (t0 + (float(k) + 0.5) * dt), to = u_lamp[i].xyz - p;
      float r = length(to), fall = 1.0 - r / u_lamp[i].w;
      if (p.y < u_lampLight[i].w) sum += thick(p) * fall * fall * phase(dot(d, to / r));
    }
    lit += u_lampLight[i].rgb * (sum * dt);
  }
  if (within(eye, d, span, u_beam.xyz, u_beam.w, t0, t1)) {
    float dt = (t1 - t0) / 28.0, sum = 0.0;
    for (int k = 0; k < 28; k++) {
      vec3 p = eye + d * (t0 + (float(k) + 0.5) * dt), to = u_beam.xyz - p;
      float r = length(to), fall = 1.0 - r / u_beam.w, c = -dot(to / r, u_beamAxis.xyz);
      sum += thick(p) * fall * fall * phase(dot(d, to / r)) * smoothstep(u_beamAxis.w, u_beamLight.w, c);
    }
    lit += u_beamLight.rgb * (sum * dt);
  }
  return vec4(lit * u_mist, 1.0 - exp(-${f(mist.density)} * depth));
}
// how far up the mist's ramp of colours a line of sight comes that meets nothing; less than nought where the mist is
// too thin to show at all
float glow(vec3 eye, vec3 d) {
  vec4 h = haze(eye, d, 1e9);
  if (h.a < ${f(mist.ramp.threshold)}) return -1.0;
  return clamp((dot(u_night * (1.0 - h.a) + h.rgb, LUMA) - ${f(mist.ramp.range[0])}) / ${f(mist.ramp.range[1] - mist.ramp.range[0])}, 0.0, 1.0) * ${f(R - 1)};
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
// how the rain's rings tilt the water at a place on the ground
vec2 tilt(vec2 g) {
  vec2 slope = vec2(0.0);
  for (int i = 0; i < u_dropCount; i++) {
    vec4 drop = texelFetch(u_drops, ivec2(i, 0), 0);
    vec2 u = g - drop.xy; float r = length(u), travel = r - drop.z;
    if (r < 1e-6 || abs(travel) >= ${f(rings.width)}) continue;
    slope += u * (sin(6.2831853 * travel / ${f(rings.scale)}) * (1.0 - smoothstep(0.0, 1.0, (abs(travel) / ${f(rings.width)} - 0.2) / 0.8)) *
      smoothstep(0.0, 1.0, drop.z / ${f(rings.scale * 0.25)}) * exp(-${f(rings.damping)} * r) / r * drop.w);
  }
  return ${f(rings.amplitude)} * slope;
}
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
  if (seen == ivec3(0)) {
    // nothing there: the night, or the mist's glow in its own colours
    float rank = (BAYER[(at.x & 3) + (((int(u_size.y) - 1 - at.y) & 3) << 2)] + 0.5) / 16.0, g = glow(u_eye, d);
    o = vec4(g < 0.0 ? u_night : u_ramp[int(clamp(floor(g + (rank - 0.5) * ${f(mist.ramp.dither)} + 0.5), 0.0, ${f(R - 1)}))], 1.0);
    return;
  }
  int kind = seen.r & 3, far = ((seen.b & 15) << 2) | (seen.g & 3), index = colourOf(seen);
  vec3 c = index > 0 ? u_colour[index] : vec3(seen) / 255.0;
  o = vec4(c, 1.0);
  if (kind == ${GLOWS} || index == 0) return;   // what glows keeps the colour it has, mist or no mist
  bool changed = false;
${wet ? `  bool plain = true;   // (a dab of rain or steam in front of the wet ground is not the ground)
  for (int i = 0; i < ${wet.weather.length}; i++) if (index == u_weather[i]) plain = false;
  if ((kind == ${ROAD} || kind == ${POOL}) && plain && d.y < -0.001) {
    vec4 shown;
    if (kind == ${POOL}) {
      vec2 slope = tilt((u_eye + d * ((${f(wet.at)} - u_eye.y) / d.y)).xz) * ${f(wet.pool.distortion)};
      shown = mirrored(at + ivec2(floor(vec2(dot(slope, u_right.xz), dot(slope, u_up.xz)) + 0.5)));
    } else {
      shown = 0.4 * mirrored(at) + 0.15 * (mirrored(at + ivec2(${Math.round(wet.road.blur)}, 0)) + mirrored(at - ivec2(${Math.round(wet.road.blur)}, 0)) +
        mirrored(at + ivec2(0, ${Math.round(wet.road.blur)})) + mirrored(at - ivec2(0, ${Math.round(wet.road.blur)})));
    }
    if (shown.a <= 0.0) {
      // nothing stands there to be mirrored: then it is the night, which shows only where the mist glows
      float g = glow(vec3(u_eye.x, ${f(2 * wet.at)} - u_eye.y, u_eye.z), vec3(d.x, -d.y, d.z));
      if (g >= 0.75) {
        int i = int(min(g, ${f(R - 1.001)}));
        shown = vec4(mix(u_ramp[i], u_ramp[i + 1], g - float(i)), 1.0) * smoothstep(0.75, 2.5, g);
      }
    }
    if (shown.a > 0.0) {
      float graze = 1.0 - clamp(-d.y, 0.0, 1.0);
      float share = kind == ${POOL} ? (${f(wet.pool.f0)} + ${f(1 - wet.pool.f0)} * pow(graze, ${f(wet.pool.power ?? 5)})) * ${f(wet.pool.strength)}
                                : (${f(wet.road.f0)} + ${f(1 - wet.road.f0)} * pow(graze, ${f(wet.road.power ?? 5)})) * ${f(wet.road.strength)};
      c = mix(c, shown.rgb / shown.a * (kind == ${POOL} ? u_poolTint : u_roadTint), share * shown.a);
      changed = true;
    }
  }` : ''}
  // the mist between the eye and what is seen
  vec4 h = haze(u_eye, d, (u_far.x + (float(far) + 0.5) * u_far.y) / -dot(d, u_back));
  float glare = dot(h.rgb, LUMA);
  if (glare > 0.003) {
    // (seen from close by a lamp, the haze in front of a thing would bleach it: it is held to about what the halo itself shows)
    if (glare > 0.3) h.rgb *= (0.3 + 0.2 * (1.0 - exp((0.3 - glare) / 0.2))) / glare;
    c = c * (1.0 - h.a) + h.rgb;
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
  // three textures: Ink's picture, its mirrored picture, and the rings
  const texture = unit => {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
    for (const [key, value] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]])
      gl.texParameteri(gl.TEXTURE_2D, key, value);
  };
  texture(0); texture(1);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
  texture(2);
  const drops = new Float32Array(DROPS * 4);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, DROPS, 1, 0, gl.RGBA, gl.FLOAT, drops);
  gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  // what does not change from frame to frame
  gl.uniform1i(U('u_scene'), 0); gl.uniform1i(U('u_under'), 1); gl.uniform1i(U('u_drops'), 2);
  gl.uniform3fv(U('u_ramp'), mist.ramp.colors.flatMap(rgb));
  gl.uniform3fv(U('u_night'), rgb(mist.night));
  gl.uniform3fv(U('u_mist'), rgb(mist.color).map(v => v * mist.density));
  gl.uniform4fv(U('u_lamp'), mist.points.flatMap(p => [...p.at, p.radius]));
  const unit = v => { const l = Math.hypot(...v); return v.map(n => n / l); }, cos = deg => Math.cos((deg * Math.PI) / 180);
  gl.uniform4fv(U('u_beam'), [...spot.at, spot.radius]);
  gl.uniform4fv(U('u_beamAxis'), [...unit(spot.direction), cos(spot.outerAngle)]);
  gl.uniform4fv(U('u_beamLight'), [...rgb(spot.color).map(v => v * spot.intensity), cos(spot.innerAngle)]);
  gl.uniform3iv(U('u_inked'), inked.slice(0, N).flatMap(bytes));
  gl.uniform3fv(U('u_colour'), web.colours.flatMap(rgb));
  if (wet) {
    gl.uniform1iv(U('u_weather'), wet.weather);
    gl.uniform3fv(U('u_roadTint'), rgb(wet.road.color));
    gl.uniform3fv(U('u_poolTint'), rgb(wet.pool.color));
  }
  const at = { size: U('u_size'), lens: U('u_lens'), far: U('u_far'), eye: U('u_eye'), right: U('u_right'), up: U('u_up'), back: U('u_back'), drift: U('u_drift'), light: U('u_lampLight'), drops: U('u_dropCount') };
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
        // every ring on the water at this moment, from all the pools
        let n = 0;
        for (const field of rings.fields) {
          const now = field.frame(t);
          drops.set(now.drops.subarray(0, Math.min(now.count, DROPS - n) * 4), n * 4);
          n = Math.min(DROPS, n + now.count);
        }
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.activeTexture(gl.TEXTURE2);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, DROPS, 1, gl.RGBA, gl.FLOAT, drops);
        gl.uniform1i(at.drops, n);
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
      gl.uniform1f(at.drift, t * mist.drift);
      // (a lamp under a roof lights no mist above it: `under` is that roof's height)
      gl.uniform4fv(at.light, mist.points.flatMap(p => [...rgb(p.color).map(v => v * p.intensity * (p.flame ? mist.flame(t) : 1)), p.under ?? 1e9]));
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
  };
}
