/* A street-food cart on a wet night — a showcase diorama for Ink Studio.

     npx ink-studio render scene.js --w 1920 --h 1080 --px 4 --t 2
     npx ink-studio turn   scene.js --n 8
   film.mjs films it.

   One unit is about half a metre. It is authored for 48 art pixels a unit (`DETAIL`): at the camera's own distance a
   480 x 270 picture takes in the whole island, and every "px" below is one art pixel there.
   Nothing here remembers the frame before: hung things swing as pendulums on a puppet, and rain, splashes, ripples,
   steam, mist and the camera are worked out from the clock. So any frame can be drawn on its own (`--t 12` is the film
   twelve seconds in), frames can be drawn side by side, and after LOOP seconds it all comes round to where it began.
   `--params '{"still":true}'` holds the camera where it starts; rain, steam, wet, fog: false leave those out.
   `web: true` is for a page that draws it live with Ink Studio's WebGL renderer (page.js), which has
   no mirroring materials and no lit mist: the page does those two itself, from `world.web` and GLOW below. */

const DETAIL = 48, TAU = Math.PI * 2;
/* Everything that moves comes round again after this many seconds, so a film of it can be looped: `every` turns a
   period into the nearest one that divides the loop, `pace` does the same for an angular speed */
const LOOP = 36;
const every = period => LOOP / Math.max(1, Math.round(LOOP / period));
const pace = speed => (Math.max(1, Math.round((speed * LOOP) / TAU)) * TAU) / LOOP;

/* The palette is laid down a ramp at a time, dark to light; C holds each ramp's indices */
const PALETTE = [0x05060c];
const ramp = (...cols) => { const at = PALETTE.length; PALETTE.push(...cols); return cols.map((_, i) => at + i); };
const C = {
  night: ramp(0x0b0f1e, 0x12182c, 0x1c2540, 0x2a355a, 0x3f4e76, 0x62749b),          // asphalt, stone, every shadow side
  warm: ramp(0x2b2236, 0x46364a, 0x6b4549, 0x8a5a4c, 0xb07650, 0xcc8a55, 0xf3c27c), // the same where lamplight reaches
  teal: ramp(0x0b222c, 0x143b48, 0x215c66, 0x388686, 0x6fbaa6),                     // the cart's paint
  tealWarm: ramp(0x5a8a6a, 0xa8b46d, 0xe9d98c),
  red: ramp(0x24080e, 0x52111f, 0x931e26, 0xcd362a, 0xf26a3a),                      // awning stripes, lantern, stools
  glow: ramp(0xff9a3c, 0xffd070, 0xfff3c2),                                         // lamplight itself
  cream: ramp(0x282a44, 0x545376, 0x9c939e, 0xdbc7ad, 0xfff0d2),                    // awning stripes, bowls, paper
  steel: ramp(0x0f131e, 0x242d43, 0x4f5e7e, 0x8fa2ba, 0xd4dfea),
  steelWarm: ramp(0xae8d69, 0xe8c58a, 0xfff1c9),
  wood: ramp(0x170e14, 0x2e1c27, 0x55342e, 0x86563a, 0xbe8850),
  woodWarm: ramp(0xd9a15c, 0xf6d087),
  green: ramp(0x0a2016, 0x174527, 0x2c753a, 0x63b35a),                              // bottles, leaves
  black: ramp(0x04050a, 0x0c0e18, 0x181c2c, 0x282e45),                              // tyres, the cat, bin bags
  rain: ramp(0x475c8c, 0x7d99c6, 0xc7ddf1),                                         // rain, steam, glints
  eye: ramp(0xffe066),
  cone: ramp(0xd9571f, 0xff8b3d),
  flame: ramp(0x5aa2ff)
};
const hex = i => '#' + PALETTE[i].toString(16).padStart(6, '0');
/* for the `web` variant: the bits of a colour the picture keeps. Two colours above are the same in these bits (the
   warm glint on steel and the lightest of the lamplight): there steel takes the lamplight's */
const WEB_BITS = 0xfcfcf0;

const norm = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };

/* where things stand and hang: the sculpt, the puppet, the lights and the rain all read these */
const KERB = -1.3, RAD = 4.3;
const AWN = { x0: -1.05, x1: 1.75, zf: 1.42, zb: -1.2, ridgeZ: 0.0, ridgeY: 3.78, frontY: 3.28, backY: 3.4, over: 0.43, stripes: 11 };
const LAMP = {
  lantern: [-1.72, 2.62, 1.5],     // the paper lantern, on a bracket off the front corner
  bulbs: [0.35, 2.95, 1.2],        // the string of bulbs under the awning's edge, taken as one light
  street: [-2.3, 4.25, -1.75],     // the street lamp's head
  sign: [2.8, 2.61, 1.37]          // the light box, hung from the awning's front rail out past the cloth
};
/* standing water: each pool is a few flat blobs [x, z, rx, rz] run together */
const POOLS = [
  { id: 'pool-front', blobs: [[0.75, 3.0, 1.2, 0.5], [1.6, 3.3, 0.7, 0.36], [-0.1, 3.3, 0.6, 0.3]] },
  { id: 'pool-lantern', blobs: [[-1.55, 1.45, 0.62, 0.34], [-1.1, 1.2, 0.4, 0.22]] },
  { id: 'pool-sign', blobs: [[2.8, 0.25, 0.5, 0.72], [3.1, -0.5, 0.4, 0.38]] }
];
const WATER = 0.012;
/* how the wet ground mirrors: the road faintly and a little blurred, a pool nearly everything, bent by its rings */
const MIRROR = {
  road: { f0: 0.28, power: 4, strength: 0.9, distortion: 0, blur: 1.5, color: '#ffffff' },
  pool: { f0: 0.85, strength: 0.98, distortion: 6, blur: 0.3, color: '#dde4f2' }
};
const RINGS = { amplitude: 0.3, scale: 0.2, speed: 0.85, width: 0.28, damping: 1.1 };
const CAT = [0.3, 0.36, 1.3];     // where the cat sits: on a box under the awning's edge, before the menu, facing the road

/* the scene: sculpted and baked, then set moving */
function build(kit, seed, o) {
  const made = sculpt(kit, seed, o);
  return animate(kit.KIT, made.world, made.moves, made.opt, made.rings);
}

/* The sculpting and the baking: ten seconds' work. It gives the world as it stands still, and what `animate` needs to
   set it moving: `moves` (plain data: which splats each tagged solid became, and the weather), the options it was
   made with, and the pools' ripple fields. */
function sculpt(kit, seed, o = {}) {
  const { makeBuilder, makeSculpt, KIT: K } = kit;
  const opt = { rain: true, steam: true, wet: true, fog: true, web: false, ...(o.controls || {}) };
  /* (the WebGL renderer has room for 64 colours: there the last, the burner's blue, goes without. Its backdrop is pure
     black, a colour nothing else in the picture comes out as, so the page can tell the backdrop from the scene; and the
     low bits of every colour are left clear (WEB_BITS), for the page to have each pixel say what it shows and how far
     off. What the page puts on the screen are the colours as they are written above) */
  const B = makeBuilder(seed, opt.web ? [0x000000, ...PALETTE.slice(1, 64).map(c => c & WEB_BITS)] : PALETTE), S = K.sculpt(makeSculpt(B)), tags = K.deform.tags(S);
  S.pixel = true;
  S.pixelSize(DETAIL);
  // a moon somewhere behind and to the left, kept low so that the lamps make the picture
  S.sun = norm([-0.5, 0.72, -0.48]);
  S.amb = 0.15; S.sky = 0.12; S.sunK = 0.24; S.wob = 0.012;
  S.lights.push({ p: LAMP.lantern, r: 6.2, s: 1.6, sh: true });
  S.lights.push({ p: LAMP.bulbs, r: 4.4, s: 1.0 });
  S.lights.push({ p: LAMP.street, r: 9, s: 1.5, sh: true });
  S.lights.push({ p: LAMP.sign, r: 4.8, s: 1.1 });

  const n = C.night, w = C.warm;
  const stoneLit = [n[2], w[1], w[2], w[3], w[4], w[5]];
  /* (a patterned material's lamp-lit ramp: the film's renderer does not use it, the WebGL renderer does. The scene was
     made by looking at the first, so the second is not given one) */
  const lit = g => (opt.web ? {} : { g });
  const M = {
    paving: { ...K.pixel.masonry({ r: n.slice(1), stone: [13, 8], joint: 2, vary: 0.3, seed: 5 }), ...lit(stoneLit) },
    kerb: { r: n.slice(2), g: stoneLit },
    rock: { r: n.slice(0, 4) },
    line: { r: [C.cream[1], C.cream[2], C.cream[3]], g: [C.cream[2], C.cream[3], C.cream[4]] },
    teal: { r: C.teal, g: [C.teal[1], C.teal[2], C.tealWarm[0], C.tealWarm[0], C.tealWarm[1], C.tealWarm[2]] },
    tealDark: { r: C.teal.slice(0, 3), g: [C.teal[1], C.teal[2], C.tealWarm[0], C.tealWarm[1]] },
    red: { r: C.red, g: [C.red[1], C.red[2], C.red[2], C.red[3], C.red[3], C.red[4]] },
    cream: { r: C.cream, g: [C.cream[1], C.cream[2], C.cream[3], C.cream[3], C.cream[4], C.cream[4]] },
    steel: { r: C.steel, g: [C.steel[1], C.steel[2], C.steel[3], C.steel[3], C.steel[4], opt.web ? C.glow[2] : C.steelWarm[2]] },
    iron: { r: [C.steel[0], C.steel[0], C.steel[1], C.steel[2]], g: [C.steel[1], w[1], w[2], w[3]] },
    planks: { ...K.pixel.planks({ r: C.wood, width: 6, along: 'x', seed: 2 }), ...lit([C.wood[2], C.wood[3], C.woodWarm[0], C.woodWarm[1]]) },
    wood: { r: C.wood, g: [C.wood[2], C.wood[3], C.woodWarm[0], C.woodWarm[1]] },
    bamboo: { r: C.wood.slice(1), g: [C.wood[3], C.wood[4], C.woodWarm[0], C.woodWarm[1]] },
    band: { r: [C.wood[1], C.wood[2]], g: [C.wood[2], C.wood[3]] },
    black: { r: C.black },
    fur: { r: C.black, g: [C.black[1], C.black[2], C.black[3], w[0], w[1]] },     // black stays black under a lamp
    dusk: { r: [C.black[3], w[0]], g: [w[1], w[2]] },                              // the inside of an ear
    nose: { r: [C.red[2]] },
    collar: { r: [C.red[2], C.red[3]], g: [C.red[3], C.red[4]] },
    brass: { r: [C.wood[3], C.woodWarm[0]], g: [C.woodWarm[0], C.woodWarm[1]] },
    pupil: { r: [C.black[0]] },
    green: { r: C.green, g: [C.green[2], C.green[3], C.tealWarm[1], C.tealWarm[2]] },
    blue: { r: n.slice(2), g: [n[3], n[4], n[5], C.rain[1]] },
    cone: { r: [C.red[1], C.red[2], C.cone[0], C.cone[1]] },
    broth: { r: [w[4], w[5], w[6]], g: [w[5], w[6], C.glow[2]] },
    bulb: { r: [C.glow[2]], em: true },
    eye: { r: C.eye, em: true },
    flame: { r: opt.web ? [C.rain[1]] : C.flame, em: true }
  };
  /* The road is wet: it mirrors, faintly, what stands on it. Pools are flat sheets over it that mirror cleanly, and
     ring where the rain lands in them. One mirrored view serves both. */
  const mirror = K.reflection.plane({ id: 'street', at: [0, WATER, 0], select: i => i < mirror.upTo });
  mirror.upTo = Infinity;
  const road = { r: [n[0], n[0], n[1], n[2], n[3]], g: [n[1], w[0], w[1], w[2], w[3], w[4], w[5]], materialId: 'road' };
  const mirrors = opt.wet && !opt.web;   // (in the browser the page does the mirroring: it is given MIRROR and the rings)
  M.road = !mirrors ? road : K.reflection.material(road, 'street', MIRROR.road);
  const pools = POOLS.map(p => ({ ...p, rings: K.ripple.field(RINGS) }));
  for (const p of pools)
    p.mat = !mirrors ? (opt.web ? { r: [n[0], n[1], n[2], n[3]], materialId: 'pool' } : { r: [n[1], n[2], n[3]] }) : K.reflection.material(K.surface.material({ r: [n[0], n[1], n[2], n[3]], materialId: p.id }, {
      normal: p.rings.normal,
      layers: { glint: { type: 'specular', color: hex(C.rain[2]), roughness: [0.12, 0.18], strength: 0.35 } }
    }), 'street', MIRROR.pool);

  const ctx = { S, K, B, M, opt, pools };
  island(ctx);
  cart(ctx);
  canopy(ctx);
  counterTop(ctx);
  seats(ctx);
  cat(ctx);
  street(ctx);
  // what the rain lands on: the sculpt itself, asked before it is baked into dabs
  const shelter = K.atmosphere.occluder(S.modelSource().field.sdf, { bias: 0.02, step: 0.03, steps: 220 });
  S.bake();
  const fx = weather(ctx, shelter);
  fx.rings.forEach((starts, i) => starts.forEach(start => pools[i].rings.add(start)));
  mirror.upTo = fx.first;   // rain and steam are left out of the mirrored view: in it they are only noise

  const world = B.finish({
    cam: { ...camera(0), sway: 0 },
    radius: 7.5, detail: DETAIL, dither: 0,
    look: { pixel: true, outline: true, clean: true, ...(opt.fog && !opt.web && { effectPalettes: MIST_COLOURS }) },
    ...(mirrors && { reflections: [mirror] }),
    ...(opt.fog && !opt.web && mist(K, shelter))
  });
  // rain and steam are drawn a pixel or two wide: they are not specks for the clean-up to take away
  if (fx.count) (world.effectParticles ||= []).push({ first: fx.first, count: fx.count });
  return { world, moves: { tags: Object.fromEntries(Object.entries(tags)), fx }, opt, rings: pools.map(p => p.rings) };
}

/* What sets a baked world moving: the puppet, for what hangs and for the cat, and the weather on its clock. It serves
   a world just sculpted and one taken out of store (see `unpack`) alike. (The puppet marks the splats it carries, in
   the world's own rows: so a world is stored as it is before this, not after.) */
function animate(K, world, moves, opt, rings) {
  swing(K, world, moves.tags);
  const weatherAt = weatherClock(moves.fx), rest = world.data, puppet = world.anim.update;
  world.anim.update = function (dt, t) {
    puppet.call(this, dt, t);
    if (!opt.still) Object.assign(world.cam, camera(t));
    weatherAt(rest, t, eyeOf(world.cam));
  };
  weatherAt(rest, 0, eyeOf(world.cam));
  /* what a page drawing this live needs besides the world: the colours to show (the world's own have their low bits
     cleared), which rows change every frame (rain and steam), and the wet ground's mirror, which it lays in itself:
     the plane, how the road and the pools mirror, the pools' rings, and which colours rain and steam are drawn in
     (a dab of those over the road is not road) */
  if (opt.web) world.web = {
    colours: PALETTE.slice(0, 64), bits: WEB_BITS,
    rows: { first: moves.fx.first, count: moves.fx.count },
    mirror: opt.wet && { at: WATER, ...MIRROR, rings: { ...RINGS, fields: rings },
      weather: [...C.rain, ...C.cream.slice(2), C.glow[2]] }
  };
  return world;
}

/* The film: once round the island in LOOP seconds, slower past the front, closing in as it passes each end of the cart
   and standing back for the front and the back, a little higher behind than before */
function camera(t) {
  const u = (t / LOOP) * TAU;
  return {
    target: [0.1, 1.78 + 0.1 * Math.sin(u) ** 2, 0.1],
    yaw: 0.22 + u - 0.34 * Math.sin(u),
    pitch: 0.335 - 0.055 * Math.cos(u),
    dist: 8.95 + 0.65 * Math.cos(2 * u)
  };
}

const eyeOf = ({ target, yaw, pitch, dist }) =>
  [target[0] + dist * Math.cos(pitch) * Math.sin(yaw), target[1] + dist * Math.sin(pitch), target[2] + dist * Math.cos(pitch) * Math.cos(yaw)];

/* The wet air: a thin mist over the island that only shows where a lamp lights it, so each lamp wears a halo and the
   street lamp throws a cone. Against the night it is drawn in its own few colours, dithered from one to the next. */
const MIST = {
  reach: 6, top: 6.4, density: 0.025, anisotropy: 0.15, color: '#8fa0c0',
  drift: pace(0.5),                                                                  // how fast its thin patches wander
  flame: t => 1 + 0.07 * Math.sin(t * pace(2.3)) + 0.04 * Math.sin(t * pace(5.3) + 1),   // the lantern breathes, as a flame does
  // (`under`, for a page that draws the glow itself: the roof over that lamp, above which it lights no mist. The film's
  // renderer needs no telling: it shadows the mist with the sculpt)
  points: [
    { at: LAMP.lantern, radius: 2.6, intensity: 35, color: '#ff9a3c', castsShadow: false, flame: true },
    { at: LAMP.bulbs, radius: 2.0, intensity: 15, color: '#ffd070', under: AWN.frontY },
    { at: [LAMP.sign[0], LAMP.sign[1], LAMP.sign[2] + 0.3], radius: 1.8, intensity: 18, color: '#ff8a4a', castsShadow: false },
    { at: [LAMP.sign[0], LAMP.sign[1], LAMP.sign[2] - 0.3], radius: 1.8, intensity: 18, color: '#ff8a4a', castsShadow: false }
  ],
  spots: [{ at: [LAMP.street[0], LAMP.street[1] - 0.1, LAMP.street[2]], direction: [0.05, -1, 0.1], innerAngle: 15, outerAngle: 32, radius: 6.5, intensity: 44, color: '#ffd9a0' }]
};
function mist(K, shelter) {
  const D = K.procedural.density, clamp = K.clamp, { reach, top } = MIST;
  const field = D.bounded({
    bounds: { min: [-reach, 0, -reach], max: [reach, top, reach] },
    sample: (x, y, z, t) => clamp((reach - Math.hypot(x, z)) * 0.6, 0, 1) * clamp((top - y) * 0.8, 0, 1) * (0.8 + 0.2 * Math.sin(0.9 * x + 1.3 * z + t * MIST.drift) * Math.sin(1.7 * y - 0.6 * z))
  });
  return {
    atmosphere: [K.atmosphere.field({ id: 'mist', field, density: MIST.density, step: 0.3, anisotropy: MIST.anisotropy, color: MIST.color })],
    volumeLighting: {
      ambient: 0, shadow: shelter,
      points: MIST.points.map(({ flame, intensity, ...light }) => ({ ...light, intensity: flame ? t => intensity * MIST.flame(t) : intensity })),
      spots: MIST.spots
    },
    volumeQuality: { steps: 20, scale: 2 }
  };
}
const MIST_COLOURS = {
  fog: { colors: ['#0a0810', '#170d14', '#28141a', '#40201f', '#613324', '#8a4d2c', '#b86e38'], threshold: 0.04, range: [0.02, 0.35], dither: 0.6 },
  // what glows keeps the colour it has, mist or no mist: the lamps, and the rain and steam, which are drawn as glowing
  emission: { colors: [...C.rain, ...C.cream.slice(2), ...C.glow, C.red[2], C.red[3], C.red[4], C.warm[1], C.warm[3], ...C.eye, ...C.flame].map(hex), mode: 'nearest', threshold: 0.05 }
};

/* the ground: a slab of street cut out of the night. Road in front, a pavement behind the kerb */
function island(ctx) {
  const { S, B, M } = ctx;
  S.lathe([0, -0.75, 0], 0.75, t => RAD * (0.86 + 0.14 * t), M.road, { res: 0.07 });
  const chord = z => Math.sqrt(Math.max(0, RAD * RAD * 0.97 - z * z));
  S.solid([0, 0.07, 0], RAD + 0.2, (x, y, z) => Math.max(Math.hypot(x, z) - RAD * 0.985, z - KERB, Math.abs(y) - 0.07),
    (res, f) => {
      for (let x = -RAD; x <= RAD; x += res) for (let z = -RAD; z <= KERB; z += res) if (Math.hypot(x, z) < RAD * 0.985) f(x, 0.07, z);
    }, M.paving, { res: 0.055, reach: 0.1 });
  S.box([0, 0.07, KERB + 0.07], [chord(KERB), 0.085, 0.08], M.kerb, { res: 0.045, rd: 0.02 });
  for (const p of ctx.pools) for (const [x, z, rx, rz] of p.blobs) S.ball([x, WATER - 0.01, z], [rx, 0.012, rz], p.mat, { res: 0.055 });
  // two dashes of a worn lane line, a manhole, and a drain against the kerb
  for (const x of [-1.5, 0.75]) S.box([x, 0.004, 3.78], [0.5, 0.008, 0.06], M.line, { res: 0.04 });
  S.lathe([3.3, 0, 2.05], 0.016, [0.4, 0.4], M.iron, { res: 0.035 });
  S.torus([3.3, 0.014, 2.05], 0.3, 0.012, M.black, { res: 0.024 });
  for (const a of [0, 1, 2]) S.box([3.3, 0.016, 2.05], [0.26, 0.008, 0.016], M.black, { res: 0.022, ax: B.frame((a * Math.PI) / 3, 0, 0) });
  S.box([2.2, 0.01, KERB + 0.32], [0.42, 0.016, 0.17], M.iron, { res: 0.035 });
  for (let i = 0; i < 6; i++) S.box([1.86 + i * 0.136, 0.022, KERB + 0.32], [0.022, 0.012, 0.13], M.black, { res: 0.025 });
  // broken stone round the rim, so the edge is not a compass line
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * TAU + B.rr(-0.08, 0.08), r = RAD * B.rr(0.9, 0.99), s = B.rr(0.3, 0.6);
    S.rock([Math.cos(a) * r, -0.48 + B.rr(-0.12, 0.08), Math.sin(a) * r], [s, s * B.rr(0.5, 0.8), s * 0.8], M.rock, { res: 0.075 });
  }
}

/* the tricycle: a counter box on two wheels, a third wheel, saddle and handlebars out in front of it */
function cart({ S, K, B, M }) {
  const at = (x, y, z) => [x + 0.35, y, z];
  S.box(at(0, 0.98, 0), [1.35, 0.5, 0.74], M.teal, { res: 0.045, rd: 0.03 });
  // a frame round every panel
  for (const sz of [-1, 1]) {
    for (const y of [1.44, 0.52]) S.box(at(0, y, sz * 0.755), [1.385, 0.05, 0.03], M.tealDark, { res: 0.03 });
    for (const x of [-1.34, -0.45, 0.45, 1.34]) S.box(at(x, 0.98, sz * 0.755), [0.045, 0.47, 0.03], M.tealDark, { res: 0.03 });
  }
  for (const sx of [-1, 1]) for (const z of [-0.71, 0.71]) S.box(at(sx * 1.365, 0.98, z), [0.03, 0.47, 0.045], M.tealDark, { res: 0.03 });
  // the menu board on the front: a cream card with a few lines of red writing
  S.box(at(0, 1.0, 0.79), [0.36, 0.3, 0.02], M.cream, { res: 0.03 });
  for (let j = 0; j < 4; j++) for (const [x, len] of [[-0.2, 0.09], [0.0, 0.07], [0.2, 0.05]])
    S.box(at(x + (j % 2) * 0.03, 1.2 - j * 0.13, 0.815), [len * (j === 3 ? 0.6 : 1), 0.025, 0.008], { r: [C.red[2]] }, { res: 0.022 });
  // a shelf below the front edge of the worktop, where bowls are put down
  S.box(at(-0.85, 1.25, 0.98), [0.45, 0.025, 0.2], M.planks, { res: 0.035 });
  for (const x of [-1.2, -0.5]) S.tube([at(x, 1.24, 1.14), at(x, 0.95, 0.78)], 0.02, 0.02, M.iron, { res: 0.028 });
  S.lathe(at(-0.95, 1.28, 1.0), 0.09, [0.1, 0.17], M.cream, { res: 0.028 });
  // a cloth over the rail at the far end
  S.box(at(1.39, 1.22, 0.3), [0.02, 0.2, 0.16], M.cream, { res: 0.03 });
  S.box(at(1.39, 1.12, 0.3), [0.024, 0.03, 0.165], M.red, { res: 0.03 });
  // back wheels on one axle, with guards
  for (const sz of [-1, 1]) {
    wheel(S, M, at(0.75, 0.42, sz * 0.88), 0.42);
    S.solid(at(0.75, 0.42, sz * 0.88), 0.6, (x, y, z) => Math.max(Math.abs(Math.hypot(x, y) - 0.5) - 0.02, Math.abs(z) - 0.11, -y - 0.06),
      (res, f) => { for (let a = -0.1; a <= Math.PI + 0.1; a += res / 0.5) for (let z = -0.1; z <= 0.1; z += res) f(Math.cos(a) * 0.52, Math.sin(a) * 0.52, z); },
      M.tealDark, { res: 0.035, reach: 0.06 });
  }
  S.tube([at(0.75, 0.42, -0.9), at(0.75, 0.42, 0.9)], 0.035, 0.035, M.iron, { res: 0.035 });
  // the front end
  const fx = -2.25;
  wheel(S, M, at(fx, 0.42, 0), 0.42);
  for (const sz of [-1, 1]) S.tube([at(fx, 0.42, sz * 0.1), at(fx + 0.22, 1.55, sz * 0.1)], 0.03, 0.03, M.steel, { res: 0.03 });
  S.tube([at(fx + 0.2, 1.5, 0), at(fx + 0.24, 1.74, 0)], 0.04, 0.04, M.steel, { res: 0.03 });
  S.tube([at(fx + 0.24, 1.74, -0.42), at(fx + 0.24, 1.74, 0.42)], 0.028, 0.028, M.steel, { res: 0.028 });
  for (const sz of [-1, 1]) S.tube([at(fx + 0.24, 1.74, sz * 0.3), at(fx + 0.24, 1.74, sz * 0.45)], 0.04, 0.04, M.black, { res: 0.028 });
  S.tube([at(fx + 0.22, 1.25, 0), at(-1.35, 0.8, 0)], 0.045, 0.045, M.teal, { res: 0.035 });
  S.tube([at(fx + 0.15, 0.75, 0), at(-1.35, 0.6, 0)], 0.035, 0.035, M.teal, { res: 0.035 });
  S.tube([at(-1.62, 0.78, 0), at(-1.6, 1.42, 0)], 0.035, 0.035, M.steel, { res: 0.03 });
  S.ball(at(-1.6, 1.47, 0), [0.21, 0.06, 0.14], M.black, { res: 0.03 });
  S.solid(at(fx, 0.42, 0), 0.6, (x, y, z) => Math.max(Math.abs(Math.hypot(x, y) - 0.5) - 0.02, Math.abs(z) - 0.09, -y - 0.02, -x - 0.25),
    (res, f) => { for (let a = 0; a <= Math.PI * 0.72; a += res / 0.5) for (let z = -0.08; z <= 0.08; z += res) f(Math.cos(a) * 0.52, Math.sin(a) * 0.52, z); },
    M.teal, { res: 0.035, reach: 0.06 });
  // a basket of greens and a lamp on the bars
  S.box(at(fx + 0.02, 1.52, 0), [0.17, 0.13, 0.2], M.iron, { res: 0.03, rd: 0.02 });
  S.box(at(fx + 0.02, 1.57, 0), [0.14, 0.11, 0.17], M.green, { res: 0.03, rd: 0.02 });
  S.lathe(at(fx - 0.1, 1.74, 0), 0.1, [0.07, 0.05], M.steel, { res: 0.025, ax: [[0, 1, 0], [-1, 0, 0], [0, 0, 1]] });
  // an umbrella, furled, hung by its crook over the back edge of the worktop: clear of the panel, the wheel and the kerb
  const ux = -0.82, uz = -0.95;
  S.tube([[ux, 1.36, uz], [ux + 0.02, 0.2, uz - 0.02]], 0.07, 0.03, M.red, { res: 0.026 });
  S.tube([[ux + 0.02, 0.2, uz - 0.02], [ux + 0.022, 0.08, uz - 0.022]], 0.014, 0.01, M.steel, { res: 0.018 });
  S.torus([ux + 0.008, 0.9, uz - 0.008], 0.052, 0.014, M.cream, { res: 0.02 });
  S.tube([[ux, 1.38, uz], [ux, 1.62, uz], [ux, 1.69, uz + 0.07], [ux, 1.67, uz + 0.15], [ux, 1.6, uz + 0.17]], 0.016, 0.016, M.wood, { res: 0.02 });
}

function wheel(S, M, c, r) {
  S.torus(c, r - 0.07, 0.07, M.black, { res: 0.035, ax: S.AZ });
  S.torus(c, r - 0.15, 0.02, M.steel, { res: 0.028, ax: S.AZ });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI + 0.3, dx = Math.cos(a) * (r - 0.15), dy = Math.sin(a) * (r - 0.15);
    S.tube([[c[0] - dx, c[1] - dy, c[2]], [c[0] + dx, c[1] + dy, c[2]]], 0.012, 0.012, M.steel, { res: 0.024 });
  }
  S.ball(c, [0.07, 0.07, 0.1], M.steel, { res: 0.028 });
}

/* four poles and a ridge, a striped awning of two slopes with a scalloped edge, the lantern, a string of bulbs */
function canopy({ S, K, B, M }) {
  const A = AWN, half = (A.x1 - A.x0) / 2;
  for (const x of [A.x0, A.x1]) {
    S.tube([[x, 1.5, 0.72], [x, A.frontY - 0.02, 0.72]], 0.035, 0.035, M.steel, { res: 0.03 });
    S.tube([[x, 1.5, -0.72], [x, A.backY + 0.1, -0.72]], 0.035, 0.035, M.steel, { res: 0.03 });
    // rafters
    S.tube([[x, A.frontY, A.zf - 0.04], [x, A.ridgeY - 0.05, A.ridgeZ]], 0.028, 0.028, M.steel, { res: 0.028 });
    S.tube([[x, A.ridgeY - 0.05, A.ridgeZ], [x, A.backY, A.zb + 0.04]], 0.028, 0.028, M.steel, { res: 0.028 });
  }
  S.tube([[A.x0 - 0.4, A.ridgeY - 0.05, A.ridgeZ], [A.x1 + 0.4, A.ridgeY - 0.05, A.ridgeZ]], 0.03, 0.03, M.steel, { res: 0.028 });
  // (the front rail runs on past the cloth at one end, braced from the corner pole: the sign hangs there)
  const [sx, sy, sz] = LAMP.sign, rail = [A.frontY - 0.03, A.zf - 0.05];
  S.tube([[A.x0 - 0.4, rail[0], rail[1]], [sx + 0.52, rail[0], rail[1]]], 0.03, 0.03, M.steel, { res: 0.028 });
  S.tube([[A.x1, A.frontY - 0.8, 0.72], [sx - 0.1, rail[0], rail[1]]], 0.022, 0.022, M.steel, { res: 0.026 });
  // the cloth: stripes running over the ridge, each stripe a slab on either slope
  const wide = (2 * half + 2 * A.over) / A.stripes, x00 = A.x0 - A.over;
  const slope = (zA, yA, zB, yB) => {
    const len = Math.hypot(zB - zA, yB - yA), tilt = Math.atan2(yB - yA, zB - zA);
    return { c: [(zA + zB) / 2, (yA + yB) / 2], len, ax: B.frame(0, -tilt, 0) };
  };
  const front = slope(A.ridgeZ, A.ridgeY, A.zf, A.frontY), back = slope(A.zb, A.backY, A.ridgeZ, A.ridgeY);
  for (let i = 0; i < A.stripes; i++) {
    const x = x00 + (i + 0.5) * wide, m = i % 2 ? M.cream : M.red;
    for (const s of [front, back]) S.box([x, s.c[1], s.c[0]], [wide / 2 + 0.004, 0.03, s.len / 2 + 0.02], m, { res: 0.045, ax: s.ax });
    // the valance: a flat tongue of cloth to each stripe, front and back, each free to swing
    for (const [name, y, z, dz] of [['flapF', A.frontY, A.zf, 1], ['flapB', A.backY, A.zb, -1]]) {
      S.box([x, y - 0.08, z + dz * 0.012], [wide / 2 - 0.006, 0.09, 0.012], m, { res: 0.03, tag: name + i });
      S.lathe([x, y - 0.16, z + (dz > 0 ? 0 : -0.024)], 0.024, [wide / 2 - 0.006, wide / 2 - 0.006], m, { res: 0.03, ax: S.AZ, tag: name + i });
    }
  }
  // the paper lantern on a bracket, ribbed, with its tassel
  const [lx, ly, lz] = LAMP.lantern, hang = [lx, A.frontY - 0.1, lz];
  S.tube([[A.x0, A.frontY - 0.12, 0.72], [A.x0 - 0.3, A.frontY - 0.02, 1.2], hang], 0.022, 0.022, M.iron, { res: 0.026 });
  const paper = { r: [C.red[4], C.glow[0], C.glow[1]], em: true, tex: (x, y) => { const v = Math.abs(y - ly) / 0.33; return v < 0.42 ? C.glow[1] : v < 0.8 ? C.glow[0] : C.red[4]; } };
  S.tube([hang, [lx, ly + 0.33, lz]], 0.012, 0.012, M.black, { res: 0.022, tag: 'lantern' });
  S.ball([lx, ly, lz], [0.3, 0.33, 0.3], paper, { res: 0.03, tag: 'lantern', ghost: true });
  for (const v of [-0.66, -0.33, 0, 0.33, 0.66])
    S.torus([lx, ly + v * 0.33, lz], 0.3 * Math.sqrt(1 - v * v) + 0.004, 0.008, { r: [C.red[3]], em: true }, { res: 0.018, tag: 'lantern', ghost: true });
  for (const sy of [-1, 1]) S.lathe([lx, ly + sy * 0.3 - 0.035, lz], 0.07, [0.15, 0.15], M.wood, { res: 0.026, tag: 'lantern' });
  S.tube([[lx, ly - 0.34, lz], [lx, ly - 0.5, lz]], 0.018, 0.018, M.wood, { res: 0.022, tag: 'lantern' });
  S.tube([[lx, ly - 0.5, lz], [lx, ly - 0.78, lz]], 0.04, 0.02, M.red, { res: 0.024, tag: 'tassel' });
  // bulbs on a slack wire under the front edge
  const wire = [];
  for (let i = 0; i <= 14; i++) { const t = i / 14; wire.push([A.x0 - 0.3 + t * (2 * half + 0.6), A.frontY - 0.42 - 0.14 * Math.sin(Math.PI * t), A.zf - 0.16]); }
  S.tube(wire, 0.011, 0.011, M.black, { res: 0.022 });
  for (let i = 2, k = 0; i <= 13; i += 2, k++) {
    S.lathe([wire[i][0], wire[i][1] - 0.055, wire[i][2]], 0.05, [0.03, 0.03], M.black, { res: 0.02, tag: 'bulb' + k });
    S.ball([wire[i][0], wire[i][1] - 0.11, wire[i][2]], 0.062, M.bulb, { res: 0.022, tag: 'bulb' + k, ghost: true });
  }
  // ladles and a strainer hung on the front bar
  [[0.95, 0.5, M.steel], [1.2, 0.42, M.steel], [1.45, 0.56, M.wood]].forEach(([x, len, m], i) => {
    S.tube([[x, A.frontY - 0.06, A.zf - 0.06], [x, A.frontY - 0.06 - len, A.zf - 0.06]], 0.012, 0.012, m, { res: 0.02, tag: 'ladle' + i });
    S.ball([x, A.frontY - 0.1 - len, A.zf - 0.06], [0.075, 0.045, 0.075], M.steel, { res: 0.022, tag: 'ladle' + i });
  });
  // the sign: a light box on two hangers from the rail, so that it goes where the cart goes, and swings a little
  const sign = { tag: 'sign' };
  for (const dx of [-0.3, 0.3]) S.tube([[sx + dx, rail[0], sz], [sx + dx, sy + 0.44, sz]], 0.012, 0.012, M.iron, { res: 0.02, ...sign });
  S.box([sx, sy, sz], [0.46, 0.46, 0.1], M.red, { res: 0.03, rd: 0.03, ...sign });
  for (const s of [1, -1]) {
    S.box([sx, sy, sz + s * 0.095], [0.385, 0.385, 0.02], M.bulb, { res: 0.026, ghost: true, ...sign });
    glyph(S, MIAN, [sx, sy, sz + s * 0.122], 0.057, s, { r: [C.red[3]], em: true }, sign);
  }
}

/* what is on the worktop */
function counterTop({ S, K, B, M }) {
  S.box([0.35, 1.52, 0], [1.46, 0.045, 0.86], M.planks, { res: 0.04, rd: 0.02 });
  // a stock pot on its burner, open, a ladle standing in the broth
  S.lathe([1.2, 1.56, -0.2], 0.07, [0.3, 0.3], M.iron, { res: 0.03 });
  for (let i = 0; i < 9; i++) { const a = (i / 9) * TAU; S.ball([1.2 + Math.cos(a) * 0.27, 1.61, -0.2 + Math.sin(a) * 0.27], [0.03, 0.035, 0.03], M.flame, { res: 0.02, ghost: true }); }
  S.lathe([1.2, 1.64, -0.2], 0.5, [0.36, 0.38], M.steel, { res: 0.035 });
  S.torus([1.2, 2.14, -0.2], 0.385, 0.022, M.steel, { res: 0.026 });
  S.lathe([1.2, 2.07, -0.2], 0.03, [0.345, 0.345], M.broth, { res: 0.03 });
  for (const sz of [-1, 1]) S.box([1.2, 1.98, -0.2 + sz * 0.41], [0.07, 0.022, 0.03], M.steel, { res: 0.022, rd: 0.012 });
  S.tube([[1.08, 2.08, -0.12], [0.76, 2.52, 0.1]], 0.016, 0.016, M.steel, { res: 0.022 });
  // bamboo steamers, three high, the top one open on a ring of buns; its lid beside them
  for (let i = 0; i < 3; i++) {
    S.lathe([0.2, 1.56 + i * 0.19, -0.3], 0.16, [0.34, 0.34], M.bamboo, { res: 0.035 });
    S.torus([0.2, 1.575 + i * 0.19, -0.3], 0.343, 0.01, M.band, { res: 0.022 });
    S.torus([0.2, 1.705 + i * 0.19, -0.3], 0.343, 0.01, M.band, { res: 0.022 });
  }
  for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + 0.3; S.ball([0.2 + Math.cos(a) * 0.19, 2.13, -0.3 + Math.sin(a) * 0.19], [0.085, 0.06, 0.085], M.cream, { res: 0.025 }); }
  S.ball([0.2, 2.14, -0.3], [0.085, 0.065, 0.085], M.cream, { res: 0.025 });
  S.lathe([-0.5, 1.56, -0.5], 0.05, [0.33, 0.33], M.bamboo, { res: 0.03 });
  S.ball([-0.5, 1.61, -0.5], [0.3, 0.07, 0.3], M.bamboo, { res: 0.03 });
  S.ball([-0.5, 1.68, -0.5], [0.05, 0.03, 0.05], M.band, { res: 0.02 });
  // bowls in a stack, a jar of chopsticks, a board with a knife, sauce bottles, a tray of dumplings
  for (let i = 0; i < 6; i++) S.lathe([-0.62, 1.57 + i * 0.05, 0.38], 0.09, [0.11, 0.2], M.cream, { res: 0.028 });
  S.lathe([-0.98, 1.56, 0.52], 0.26, [0.085, 0.085], M.red, { res: 0.028 });
  for (let i = 0; i < 7; i++) S.tube([[-0.98 + B.rr(-0.04, 0.04), 1.7, 0.52 + B.rr(-0.04, 0.04)], [-0.98 + B.rr(-0.13, 0.13), 2.04, 0.52 + B.rr(-0.1, 0.1)]], 0.01, 0.01, M.wood, { res: 0.018 });
  S.box([-0.15, 1.58, 0.45], [0.26, 0.02, 0.19], M.wood, { res: 0.03, rd: 0.015 });
  S.box([-0.1, 1.61, 0.45], [0.16, 0.008, 0.035], M.steel, { res: 0.022, ax: B.frame(0.5, 0, 0) });
  S.ball([-0.3, 1.62, 0.36], [0.07, 0.03, 0.05], M.green, { res: 0.022 });
  [[0.5, M.green], [0.68, M.red], [0.86, M.black]].forEach(([x, m]) => {
    S.lathe([x, 1.56, 0.6], 0.22, [0.065, 0.065], m, { res: 0.025 });
    S.lathe([x, 1.78, 0.6], 0.11, [0.065, 0.024], m, { res: 0.022 });
    S.lathe([x, 1.89, 0.6], 0.04, [0.034, 0.034], M.cream, { res: 0.018 });
  });
  S.box([1.25, 1.585, 0.55], [0.3, 0.02, 0.2], M.steel, { res: 0.028, rd: 0.02 });
  for (let j = 0; j < 2; j++) for (let i = 0; i < 4; i++) S.ball([1.04 + i * 0.14, 1.63, 0.47 + j * 0.16], [0.06, 0.04, 0.05], M.cream, { res: 0.02 });
}

/* a folding table and plastic stools for whoever stops */
function seats({ S, K, B, M }) {
  const tx = -2.3, tz = 2.25, top = 1.18;
  S.box([tx, top, tz], [0.66, 0.03, 0.46], M.steel, { res: 0.035, rd: 0.02 });
  for (const sz of [-1, 1]) {
    S.tube([[tx - 0.54, top - 0.02, tz + sz * 0.36], [tx + 0.44, 0, tz + sz * 0.36]], 0.022, 0.022, M.iron, { res: 0.026 });
    S.tube([[tx + 0.54, top - 0.02, tz + sz * 0.36], [tx - 0.44, 0, tz + sz * 0.36]], 0.022, 0.022, M.iron, { res: 0.026 });
  }
  // a finished bowl, chopsticks across it, a bottle and a glass
  const y = top + 0.03;
  S.lathe([tx - 0.18, y, tz + 0.05], 0.1, [0.12, 0.2], M.cream, { res: 0.026 });
  S.lathe([tx - 0.18, y + 0.06, tz + 0.05], 0.02, [0.17, 0.17], M.broth, { res: 0.024 });
  for (const d of [-0.03, 0.03]) S.tube([[tx - 0.4, y + 0.11, tz + 0.1 + d], [tx + 0.06, y + 0.11, tz - 0.02 + d]], 0.008, 0.008, M.wood, { res: 0.016 });
  S.lathe([tx + 0.33, y, tz - 0.14], 0.26, [0.055, 0.055], M.green, { res: 0.022 });
  S.lathe([tx + 0.33, y + 0.26, tz - 0.14], 0.12, [0.055, 0.02], M.green, { res: 0.02 });
  S.lathe([tx + 0.12, y, tz + 0.22], 0.11, [0.04, 0.05], M.steel, { res: 0.02 });
  stool(S, [tx - 1.0, 0, tz - 0.25], 0.2, M.red);
  stool(S, [tx + 0.1, 0, tz + 1.0], -0.3, M.teal);
  stool(S, [tx + 1.45, 0, tz + 0.95], 0.7, M.red, true);
  // a crate of empties
  S.crate({ at: [-3.3, 0, 0.75], size: [0.3, 0.17, 0.22], mat: M.red, edge: M.red });
  for (let j = 0; j < 2; j++) for (let i = 0; i < 3; i++) S.lathe([-3.48 + i * 0.18, 0.28, 0.66 + j * 0.18], 0.16, [0.05, 0.03], M.green, { res: 0.02 });
}

/* The cat that has come in out of the rain: black, in a white bib and white socks, a red collar with a bell. It sits
   upright on a box in front of the cart, under the bulbs and the awning's edge, facing the road, its tail held up
   beside it with the tip curled over: from the road it shows against the menu. CAT_AT gives where its joints are (the
   puppet turns it about them): measured from where it sits, x to its left, z the way it faces. */
const CAT_AT = {
  neck: [0, 0.66, 0.1],
  ear: s => [s * 0.105, 0.9, 0.1],
  eye: s => [s * 0.085, 0.785, 0.266],
  tail: [[0.03, 0.07, -0.25], [0.2, 0.06, -0.3], [0.31, 0.14, -0.27], [0.35, 0.36, -0.24], [0.34, 0.58, -0.22], [0.3, 0.74, -0.2], [0.22, 0.8, -0.19]]
};
const catPoint = p => [CAT[0] + p[0], CAT[1] + p[1], CAT[2] + p[2]];
function cat({ S, B, M }) {
  const at = (x, y, z) => catPoint([x, y, z]), fine = { res: 0.02 }, head = { res: 0.018, tag: 'catHead' };
  // the box it sits on
  S.crate({ at: [CAT[0], 0, CAT[2] - 0.04], size: [0.27, CAT[1] / 2, 0.31], mat: M.planks, edge: M.wood });
  // haunches, a slim body that narrows up to the chest, the bib on it
  S.ball(at(0, 0.19, -0.1), [0.185, 0.19, 0.225], M.fur, fine);
  S.tube([at(0, 0.22, -0.05), at(0, 0.53, 0.07)], 0.165, 0.105, M.fur, fine);
  S.ball(at(0, 0.44, 0.15), [0.062, 0.13, 0.04], M.cream, fine);
  for (const s of [-1, 1]) {
    // a hind foot tucked forward beside the body, and a straight foreleg down to its paw, each with a white toe
    S.ball(at(s * 0.135, 0.045, 0.1), [0.055, 0.045, 0.105], M.fur, fine);
    S.ball(at(s * 0.135, 0.04, 0.19), [0.046, 0.034, 0.04], M.cream, { res: 0.016 });
    S.tube([at(s * 0.066, 0.44, 0.12), at(s * 0.07, 0.07, 0.19)], 0.044, 0.037, M.fur, fine);
    S.ball(at(s * 0.07, 0.04, 0.215), [0.048, 0.038, 0.06], M.cream, { res: 0.016 });
  }
  // a long neck, collar and bell
  S.tube([at(0, 0.53, 0.07), at(0, 0.67, 0.1)], 0.1, 0.09, M.fur, fine);
  S.torus(at(0, 0.6, 0.086), 0.095, 0.014, M.collar, { res: 0.014 });
  S.ball(at(0, 0.568, 0.188), 0.024, M.brass, { res: 0.012 });
  // the head: skull, cheeks, a white muzzle with a pink nose
  S.ball(at(0, 0.79, 0.12), [0.175, 0.148, 0.16], M.fur, head);
  for (const s of [-1, 1]) S.ball(at(s * 0.105, 0.735, 0.19), [0.07, 0.058, 0.06], M.fur, head);
  S.ball(at(0, 0.722, 0.262), [0.058, 0.038, 0.035], M.cream, { ...head, res: 0.014 });
  S.ball(at(0, 0.746, 0.296), [0.013, 0.01, 0.008], M.nose, { ...head, res: 0.009 });
  for (const s of [-1, 1]) {
    // an ear, dusky inside
    const ear = { res: 0.014, tag: s < 0 ? 'catEarR' : 'catEarL' };
    S.tube([at(s * 0.105, 0.885, 0.1), at(s * 0.15, 1.065, 0.085)], 0.068, 0.008, M.fur, ear);
    S.tube([at(s * 0.11, 0.91, 0.128), at(s * 0.143, 1.025, 0.108)], 0.036, 0.006, M.dusk, ear);
    // an eye: a big yellow almond lying on the skull, turned a little outward as the skull is there, its pupil on it
    const eye = { res: 0.011, tag: s < 0 ? 'catEyeR' : 'catEyeL', ghost: true, ax: B.frame(s * 0.47, 0, 0) };
    const [ex, ey, ez] = CAT_AT.eye(s), out = [s * 0.453, 0, 0.891];
    S.ball(at(ex, ey, ez), [0.05, 0.052, 0.014], M.eye, eye);
    S.ball(at(ex + out[0] * 0.012, ey, ez + out[2] * 0.012), [0.017, 0.042, 0.008], M.pupil, eye);
  }
  // the tail, in three lengths that each turn where they join: out from under it, up, and the curl at the top, which
  // is white at the very tip
  const T = CAT_AT.tail.map(catPoint);
  S.tube([T[0], T[1], T[2]], 0.05, 0.045, M.fur, { res: 0.02, tag: 'catTailA' });
  S.tube([T[2], T[3], T[4]], 0.045, 0.04, M.fur, { res: 0.02, tag: 'catTailB' });
  S.tube([T[4], T[5], T[6]], 0.04, 0.03, M.fur, { res: 0.018, tag: 'catTailC' });
  S.ball(T[6], 0.035, M.cream, { res: 0.016, tag: 'catTailC' });
}

/* the square plastic stool: a seat on four splayed legs with a rail round them; `lying` tips it onto its side */
function stool(S, c, yaw, mat, lying) {
  const H = 0.6, cy = Math.cos(yaw), sy = Math.sin(yaw);
  const T = (x, y, z) => {
    const p = lying ? [x, 0.25 - z, y - H / 2] : [x, y, z];
    return [c[0] + p[0] * cy + p[2] * sy, c[1] + p[1], c[2] - p[0] * sy + p[2] * cy];
  };
  const O = T(0, 0, 0), axis = (x, y, z) => { const p = T(x, y, z); return [p[0] - O[0], p[1] - O[1], p[2] - O[2]]; };
  S.box(T(0, H - 0.03, 0), [0.21, 0.03, 0.21], mat, { res: 0.03, rd: 0.02, ax: [axis(1, 0, 0), axis(0, 1, 0), axis(0, 0, 1)] });
  const foot = [[1, 1], [1, -1], [-1, -1], [-1, 1]];
  foot.forEach(([a, b], i) => {
    S.tube([T(a * 0.16, H - 0.05, b * 0.16), T(a * 0.23, 0, b * 0.23)], 0.036, 0.03, mat, { res: 0.026 });
    const [a2, b2] = foot[(i + 1) % 4];
    S.tube([T(a * 0.2, 0.26, b * 0.2), T(a2 * 0.2, 0.26, b2 * 0.2)], 0.018, 0.018, mat, { res: 0.022 });
  });
}

/* the street's own furniture */
function street({ S, K, B, M }) {
  // lamp post on the pavement, with a few flyers pasted to it and a broom against it
  const x0 = -3.05, z0 = LAMP.street[2], [hx, hy] = LAMP.street;
  S.lathe([x0, 0.14, z0], 0.34, [0.17, 0.085], M.iron, { res: 0.035 });
  S.tube([[x0, 0.45, z0], [x0, hy + 0.1, z0]], 0.065, 0.05, M.iron, { res: 0.035 });
  S.torus([x0, 2.5, z0], 0.06, 0.02, M.iron, { res: 0.024 });
  S.tube([[x0, hy + 0.05, z0], [x0 + 0.08, hy + 0.42, z0], [x0 + 0.4, hy + 0.5, z0], [hx, hy + 0.38, z0]], 0.04, 0.034, M.iron, { res: 0.03 });
  S.lathe([hx, hy + 0.06, z0], 0.2, [0.27, 0.07], M.iron, { res: 0.03 });
  S.ball([hx, hy + 0.03, z0], [0.15, 0.07, 0.15], M.bulb, { res: 0.026, ghost: true });
  S.box([x0 + 0.075, 1.85, z0 + 0.02], [0.01, 0.2, 0.15], M.cream, { res: 0.026 });
  S.box([x0 + 0.075, 1.38, z0 - 0.04], [0.01, 0.15, 0.12], M.red, { res: 0.026 });
  S.box([x0 - 0.01, 1.6, z0 + 0.075], [0.13, 0.17, 0.01], M.cream, { res: 0.026 });
  S.tube([[x0 + 0.5, 0.3, z0 - 0.45], [x0 + 0.1, 2.5, z0 - 0.1]], 0.02, 0.02, M.wood, { res: 0.024 });
  S.tube([[x0 + 0.54, 0.14, z0 - 0.49], [x0 + 0.5, 0.36, z0 - 0.45]], 0.13, 0.045, M.bamboo, { res: 0.026 });
  // bin bags against the kerb
  for (const [x, z, s] of [[-3.5, -0.85, 1], [-3.0, -0.72, 0.74]]) {
    S.ball([x, 0.32 * s, z], [0.36 * s, 0.32 * s, 0.34 * s], M.black, { res: 0.04 });
    S.lathe([x + 0.03, 0.56 * s, z], 0.16 * s, [0.1 * s, 0.03 * s], M.black, { res: 0.024 });
  }
  // gas bottle with its hose, crates, a water butt, a traffic cone, a plant in a pot
  S.lathe([2.55, 0, -0.5], 0.8, t => 0.21 * (t < 0.07 ? 0.85 : t > 0.84 ? Math.sqrt(Math.max(0, 1 - ((t - 0.84) / 0.16) ** 2)) : 1), M.steel, { res: 0.035 });
  S.torus([2.55, 0.84, -0.5], 0.1, 0.02, M.iron, { res: 0.022 });
  S.torus([2.55, 0.42, -0.5], 0.212, 0.012, M.red, { res: 0.022 });
  S.tube([[2.55, 0.86, -0.5], [2.3, 1.1, -0.45], [1.9, 0.9, -0.5], [1.75, 1.2, -0.6]], 0.016, 0.016, M.black, { res: 0.022 });
  S.crate({ at: [3.0, 0.14, -2.1], size: [0.36, 0.28, 0.3], mat: M.planks, edge: M.wood });
  S.crate({ at: [3.05, 0.7, -2.15], size: [0.3, 0.22, 0.26], mat: M.planks, edge: M.wood });
  S.crate({ at: [2.25, 0.14, -2.45], size: [0.3, 0.2, 0.26], mat: M.planks, edge: M.wood });
  S.lathe([0.55, 0.14, -2.35], 1.0, t => 0.36 * (0.86 + 0.14 * Math.sin(Math.PI * t)), M.blue, { res: 0.035 });
  for (const yy of [0.4, 0.9]) S.torus([0.55, yy, -2.35], 0.365, 0.014, M.black, { res: 0.022 });
  S.lathe([0.55, 1.14, -2.35], 0.03, [0.38, 0.38], M.blue, { res: 0.03 });
  S.box([3.3, 0.02, 1.2], [0.2, 0.02, 0.2], M.cone, { res: 0.03 });
  S.lathe([3.3, 0.04, 1.2], 0.58, [0.15, 0.035], M.cone, { res: 0.028 });
  S.lathe([3.3, 0.3, 1.2], 0.1, [0.1, 0.082], M.cream, { res: 0.024 });
  S.lathe([-1.5, 0.14, -2.75], 0.34, [0.2, 0.27], M.wood, { res: 0.03 });
  S.canopy({ at: [-1.5, 0.82, -2.75], size: [0.44, 0.42, 0.44], lobes: 4, mat: M.green, cluster: 5, bump: 1.5, seed: 4 });
}

/* Rain, its splashes, and steam. Each is a small solid dab, put where the clock says before every frame. Solid, not
   soft: over the dark, a soft dab comes out of the palette as a smear. A drop falls down the wind from above the island
   to whatever the sculpt puts in its way, waits a moment out of sight, and falls again; where it lands a flat disc opens
   for an instant, and if that is in a pool a ring spreads from the spot each time. Steam is a few round puffs that
   swell as they leave the pot, cool from cream to grey, and shrink away under the awning.
   `weather` lays the dabs down and says in plain numbers how each is to move (and where and when the pools ring);
   `weatherClock` moves them. They are apart so that a world taken out of store can rain without its sculpt. */
const WIND = norm([0.15, -1, 0.05]), STREAK = 0.1;   // the way a drop falls; how far a streak's middle trails its leading end
function weather({ B, opt }, shelter) {
  const first = B.count(), drops = [], puffs = [], rings = POOLS.map(() => []);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const TOP = 7.6, dab = { nd: true, em: true };
  if (opt.rain) for (let i = 0; i < 640; i++) {
    // aim at a spot on the ground, and start that far back up the wind
    const a = rnd() * TAU, r = Math.sqrt(rnd()) * 5.2, reach = TOP / -WIND[1];
    const from = [Math.cos(a) * r - WIND[0] * reach, TOP, Math.sin(a) * r - WIND[2] * reach];
    const hit = shelter.hitDistance(from[0], from[1], from[2], WIND, reach + 1.6);
    const lands = hit !== Infinity, len = lands ? hit : reach + 1.6;
    const speed = 8.6 + 2 * rnd(), fall = len / speed, phase = rnd();
    const period = LOOP / Math.floor(LOOP / (fall + 0.08 + 0.55 * rnd()));   // its fall, a wait, and a whole number of them to the loop
    const at = from.map((v, k) => v + WIND[k] * len);
    const cool = rnd() < 0.18 ? C.rain[2] : rnd() < 0.5 ? C.rain[1] : C.rain[0], row = B.count();
    // the same drop three times over: as it is in the dark, where lamplight catches it, and close to a lamp
    for (const c of [cool, C.cream[3], C.cream[4]]) B.stick(from[0], from[1], from[2], WIND, 0.08, 0.004, B.P[c], 1.1, dab);
    B.disc(at[0], at[1] + 0.012, at[2], [0, 1, 0], 0.03, 0.005, B.P[C.rain[2]], 1.1, dab);
    drops.push({ row, from, speed, fall, period, phase, lands });
    if (lands && at[1] < 0.06) for (const [k, p] of POOLS.entries())
      if (rings[k].length < 60 && p.blobs.some(([x, z, rx, rz]) => ((at[0] - x) / rx) ** 2 + ((at[2] - z) / rz) ** 2 < 0.8)) {
        // it lands when its own clock reads `fall`: the ring starts then, every time round
        rings[k].push({ at: [at[0], 0, at[2]], start: fall - (phase + 1) * period, repeat: period });
        break;
      }
  }
  const steam = (x, y, z, count, rise, size) => {
    for (let j = 0; j < count; j++) {
      const row = B.count();
      // warm, cooler, cold: one pair is shown, by how far it has risen. Each is a body and a lighter cap on the side we see
      for (const c of [C.cream[4], C.glow[2], C.cream[3], C.cream[4], C.cream[2], C.cream[3]]) B.iso(x, y, z, size, B.P[c], 1.1, dab);
      puffs.push({ row, x: x + (rnd() - 0.5) * 0.24, y, z: z + (rnd() - 0.5) * 0.24, rise: rise * (0.8 + 0.4 * rnd()),
        size: size * (0.75 + 0.5 * rnd()), period: every(1.7 + 1.1 * rnd()), phase: (j + 0.5 * rnd()) / count, turn: rnd() * TAU });
    }
  };
  if (opt.steam) {
    steam(1.2, 2.12, -0.2, 13, 1.45, 0.062);
    steam(0.2, 2.2, -0.3, 10, 1.2, 0.052);
    steam(-2.48, 1.3, 2.3, 4, 0.55, 0.03);
  }
  return { first, count: B.count() - first, drops, puffs, rings };
}

/* the weather's clock: a function that puts every dab where it is at time t. `rest` is the world's splat rows, sixteen
   numbers each (x y z alpha, then the shape: xx xy xz, colour, yy yz zz); `eye` is where it is seen from */
function weatherClock({ drops, puffs }) {
  const ease = v => { v = Math.max(0, Math.min(1, v)); return v * v * (3 - 2 * v); };
  const cycle = v => ((v % 1) + 1) % 1;
  const lamps = [[LAMP.lantern, 2.6], [LAMP.bulbs, 1.8], [[LAMP.street[0], LAMP.street[1] - 0.4, LAMP.street[2]], 3.2], [LAMP.sign, 2.0]];
  return (rest, t, eye) => {
    for (const d of drops) {
      const u = cycle(t / d.period + d.phase) * d.period, q = d.row * 16;
      let shown = -1, x = 0, y = 0, z = 0;
      if (u < d.fall) {
        const s = Math.max(0, d.speed * u - STREAK);   // the dab's middle trails its leading end
        x = d.from[0] + WIND[0] * s; y = d.from[1] + WIND[1] * s; z = d.from[2] + WIND[2] * s;
        let warm = 0;
        for (const [p, reach] of lamps) { const k = 1 - Math.hypot(x - p[0], y - p[1], z - p[2]) / reach; if (k > 0) warm += k * k; }
        shown = warm > 0.3 ? 2 : warm > 0.06 ? 1 : 0;
      }
      for (let k = 0; k < 3; k++) {
        const o = q + k * 16;
        rest[o + 3] = k === shown ? 1.1 : 0;
        if (k === shown) { rest[o] = x; rest[o + 1] = y; rest[o + 2] = z; }
      }
      const v = (u - d.fall) / 0.13, o = q + 48;
      if (d.lands && v >= 0 && v < 1) { const s = 0.02 + 0.045 * v; rest[o + 3] = 1.1; rest[o + 4] = rest[o + 10] = s * s; }
      else rest[o + 3] = 0;
    }
    for (const p of puffs) {
      const k = cycle(t / p.period + p.phase), q = p.row * 16;
      const s = p.size * (0.45 + 1.25 * ease(k / 0.4)) * (1 - ease((k - 0.5) / 0.5));
      const x = p.x + 0.35 * k * k + 0.07 * Math.sin(k * 6 + p.turn), y = p.y + p.rise * k, z = p.z + 0.1 * k * k + 0.07 * Math.cos(k * 5 + p.turn);
      const shown = k < 0.3 ? 0 : k < 0.62 ? 1 : 2;
      // the cap sits a little up and towards the eye, so that it is drawn over its body
      const e = [eye[0] - x, eye[1] - y, eye[2] - z], el = Math.hypot(e[0], e[1], e[2]) || 1;
      for (let c = 0; c < 6; c++) {
        const o = q + c * 16, cap = c & 1, f = cap ? 0.45 * s : 0, r = cap ? 0.62 * s : s;
        rest[o + 3] = c >> 1 === shown && s > 0.012 ? 1.1 : 0;
        rest[o] = x + (e[0] / el) * f - 0.25 * f; rest[o + 1] = y + (e[1] / el) * f + 0.75 * f; rest[o + 2] = z + (e[2] / el) * f;
        rest[o + 4] = rest[o + 8] = rest[o + 10] = r * r;
      }
    }
  };
}

/* Everything that hangs swings a little, each thing at its own length's pace, and the cat does what a cat sitting
   somewhere does. All of it from the clock alone. */
function swing(K, world, tags) {
  const A = AWN, parts = {}, sway = [];
  // (`hinged`: it hangs from two points, so it can only swing one way)
  const hung = (name, pivot, len, amp, hinged) => {
    if (!tags[name]) return;
    parts[name] = { ids: tags[name], pivot };
    const w = Math.sqrt(9.8 / Math.max(0.08, len)) * 0.55;
    sway.push({ name, w: pace(w), w2: pace(w * 0.83), amp, ph: sway.length * 1.7, hinged });
  };
  hung('lantern', [LAMP.lantern[0], A.frontY - 0.1, LAMP.lantern[2]], 0.75, 5);
  if (tags.tassel) parts.tassel = { ids: tags.tassel, pivot: [LAMP.lantern[0], LAMP.lantern[1] - 0.5, LAMP.lantern[2]], parent: 'lantern' };
  hung('sign', [LAMP.sign[0], A.frontY - 0.03, LAMP.sign[2]], 0.64, 3.2, true);
  const wide = (A.x1 - A.x0 + 2 * A.over) / A.stripes;
  for (let i = 0; i < A.stripes; i++) {
    const x = A.x0 - A.over + (i + 0.5) * wide;
    hung('flapF' + i, [x, A.frontY, A.zf], 0.3, 9, true);
    hung('flapB' + i, [x, A.backY, A.zb], 0.3, 8, true);
  }
  for (let k = 0; k < 6; k++) if (tags['bulb' + k]) {
    let x = 0, y = -1e9, z = 0;
    for (const i of tags['bulb' + k]) if (world.data[i * 16 + 1] > y) { x = world.data[i * 16]; y = world.data[i * 16 + 1]; z = world.data[i * 16 + 2]; }
    hung('bulb' + k, [x, y, z], 0.14, 7);
  }
  [[0.95, 0.5], [1.2, 0.42], [1.45, 0.56]].forEach(([x, len], i) => hung('ladle' + i, [x, A.frontY - 0.06, A.zf - 0.06], len, 6));
  // the cat's joints: its head on its neck, ears and eyes on the head, the tail's three lengths one on another
  const joint = (name, at, parent) => { if (tags[name]) parts[name] = { ids: tags[name], pivot: catPoint(at), ...(parent && parts[parent] && { parent }) }; };
  joint('catHead', CAT_AT.neck);
  for (const [side, s] of [['L', 1], ['R', -1]]) { joint('catEar' + side, CAT_AT.ear(s), 'catHead'); joint('catEye' + side, CAT_AT.eye(s), 'catHead'); }
  joint('catTailA', CAT_AT.tail[0]);
  joint('catTailB', CAT_AT.tail[2], 'catTailA');
  joint('catTailC', CAT_AT.tail[4], 'catTailB');
  world.swing = K.puppet(world, {
    parts,
    pose(t, dt, pup) {
      const P = pup.pose;
      // a breath of wind that comes and goes moves everything a little more now and then
      const gust = 0.55 + 0.45 * Math.sin(t * pace(0.7)) * Math.sin(t * pace(0.23) + 1);
      for (const s of sway) {
        const a = s.amp * gust * Math.sin(t * s.w + s.ph), b = s.amp * 0.5 * gust * Math.sin(t * s.w2 + s.ph * 1.3);
        P[s.name] = { rot: s.hinged ? [a, 0, 0] : [a * 0.6, 0, b] };
      }
      if (parts.tassel) P.tassel = { rot: [7 * gust * Math.sin(t * pace(3.1) + 1), 0, 6 * gust * Math.sin(t * pace(2.6))] };
      if (parts.catHead) catPose(P, parts, ((t % LOOP) + LOOP) % LOOP);
    }
  });
}

/* What the cat does in the LOOP seconds, by the clock: mostly it sits. Now and then it looks at something, tilts its
   head, flicks an ear, moves its tail (a slow wave from side to side, the tip flicking out, once curling right over
   and staying so a while), and it blinks every few seconds, once twice over. Angles are degrees; turning the head to
   +y is to its left, tipping it +x is down; the tail's +z is in toward the cat. */
const CAT_DOES = {
  blinks: [3.1, 9.8, 15.9, 16.45, 23.5, 30.2],                      // when an eye begins to close; it is open again 0.3 s on
  looks: [                                                          // from, until, then how far the head goes: [down, left, tilt]
    [4.0, 8.2, [-6, -24, 0]],                                       // up at the lantern
    [14.5, 17.8, [0, 20, 0]],                                       // along the road
    [20.2, 23.4, [0, 9, 13]],                                       // head on one side
    [29.0, 31.2, [10, 0, 0]]                                        // down at the wet
  ],
  flicks: [[9.3, 'L'], [24.1, 'R'], [33.0, 'L'], [33.15, 'R']],     // an ear, and when
  swishes: [1.5, 18.6],                                             // when the tail begins a slow wave, there and back twice
  taps: [9.0, 26.0],                                                // when its tip flicks out and comes back
  curls: [[12.6, 16.6]]                                             // while the tip is curled right over
};
function catPose(P, parts, t) {
  const smooth = v => { v = Math.max(0, Math.min(1, v)); return v * v * (3 - 2 * v); };
  const held = (a, b, e) => smooth((t - a) / e) * (1 - smooth((t - b + e) / e));      // 1 from a to b, eased in and out over e
  const once = (a, d) => (t > a && t < a + d ? Math.sin((Math.PI * (t - a)) / d) : 0);  // one rise and fall, d long
  // the head: where it is looking, and a breath
  const head = [1.2 * Math.sin(t * pace(1.1)), 0, 0];
  for (const [a, b, to] of CAT_DOES.looks) { const k = held(a, b, 0.55); for (let i = 0; i < 3; i++) head[i] += k * to[i]; }
  P.catHead = { rot: head };
  for (const side of ['L', 'R']) {
    // an ear flicks back and out; an eye closes by flattening, and for a moment is not there
    let flick = 0, shut = 0;
    for (const [a, which] of CAT_DOES.flicks) if (which === side) flick += once(a, 0.28);
    for (const a of CAT_DOES.blinks) shut = Math.max(shut, once(a, 0.3));
    if (parts['catEar' + side]) P['catEar' + side] = { rot: [-14 * flick, 0, (side === 'L' ? -22 : 22) * flick] };
    if (parts['catEye' + side]) P['catEye' + side] = shut > 0.8 ? { show: 0 } : { scale: [1, 1 - 0.85 * shut, 1] };
  }
  // the tail: a wave runs up it, each length following the one below a little late; it is never quite still
  const swish = late => { let v = 0; for (const a of CAT_DOES.swishes) v += Math.sin((TAU * (t - a - late)) / 1.3) * held(a + late, a + late + 2.6, 0.6); return v; };
  let tap = 0, curl = 0;
  for (const a of CAT_DOES.taps) tap += once(a, 0.7) - 0.4 * once(a + 0.7, 0.35);
  for (const [a, b] of CAT_DOES.curls) curl += held(a, b, 1.0);
  const idle = Math.sin(t * pace(0.9));
  if (parts.catTailA) P.catTailA = { rot: [0, 4 * swish(0), 0] };
  if (parts.catTailB) P.catTailB = { rot: [0, 0, 9 * swish(0.12) + 1.5 * idle] };
  if (parts.catTailC) P.catTailC = { rot: [0, 0, 22 * swish(0.28) - 34 * tap + 42 * curl + 4 * idle] };
}

/* 面, eleven pixels square */
const MIAN = [
  '###########',
  '.....#.....',
  '###########',
  '#..#...#..#',
  '#..#...#..#',
  '#..#####..#',
  '#..#...#..#',
  '#..#####..#',
  '#..#...#..#',
  '#..#...#..#',
  '###########'
];
/* a bitmap raised on a face that looks along ±Z: each run of '#' in a row is one small slab (mirrored for the back, so that
   it reads the right way round from there too) */
function glyph(S, rows, c, cell, facing, mat, opts) {
  const h = rows.length, wd = rows[0].length;
  rows.forEach((row, j) => {
    for (let i = 0; i < wd; i++) {
      if (row[i] !== '#') continue;
      let k = i;
      while (k + 1 < wd && row[k + 1] === '#') k++;
      S.box([c[0] + facing * ((i + k + 1) / 2 - wd / 2) * cell, c[1] + (h / 2 - j - 0.5) * cell, c[2]], [((k - i + 1) * cell) / 2, cell / 2, 0.012], mat, { res: cell * 0.6, ...opts });
      i = k;
    }
  });
}

const SEED = 23;
module.exports = kit => ({
  id: 'night-stall',
  name: 'Night stall',
  seed: SEED,
  build: (seed, o) => build(kit, seed, o)
});
module.exports.PALETTE = PALETTE;
module.exports.DETAIL = DETAIL;
module.exports.LOOP = LOOP;
module.exports.camera = camera;
/* for a page that draws the mist's glow itself: the mist and its lamps, the colours it is drawn in, and the night behind */
module.exports.GLOW = { ...MIST, ramp: MIST_COLOURS.fog, night: hex(0) };
/* For a page that is to open at once and not sculpt and bake for ten seconds first: `pack` does the sculpting (the
   `web` variant, for a page that turns the view itself) and gives the world that makes as data, { plain, arrays }:
   `plain` survives JSON, `arrays` are the big typed arrays, for the page's builder to store as it likes. `unpack` is
   given the same back, wants only KIT, and returns the world set moving, as `build` would have. */
const PACKED = ['count', 'ramps', 'rampOff', 'pats', 'bg', 'seed', 'pal', 'palName', 'dither', 'fog', 'outline', 'radius', 'cam', 'detail', 'look', 'effectParticles'];
module.exports.pack = kit => {
  const { world, moves, opt } = sculpt(kit, SEED, { controls: { web: true, still: true } });
  return {
    plain: { world: Object.fromEntries(PACKED.map(key => [key, world[key]])), materials: world.renderMetadata.materials, controls: opt, moves },
    arrays: { data: world.data, pix: world.pix, materialIds: world.renderMetadata.materialIds }
  };
};
module.exports.unpack = ({ KIT: K }, { plain, arrays }) => {
  const world = { ...plain.world, data: arrays.data, pix: arrays.pix, moving: new Int32Array(0), back: new Int32Array(0),
    renderMetadata: { materialIds: arrays.materialIds, materials: plain.materials } };
  const rings = plain.moves.fx.rings.map(starts => { const field = K.ripple.field(RINGS); for (const start of starts) field.add(start); return field; });
  return animate(K, world, plain.moves, plain.controls, rings);
};
