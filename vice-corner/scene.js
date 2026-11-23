/* A street corner in a sunset crime city — a diorama for Ink Studio, after the night stall.

     npx ink-studio render vice-corner/scene.js --w 1920 --h 1080 --px 4 --t 2
     npx ink-studio turn   vice-corner/scene.js --n 8

   The sun is going down behind a corner store. A lowrider is parked at the kerb with nobody in it, bouncing on its
   hydraulics, three of five stars lit over it. A police car noses out of the side street, a helicopter holds the car
   in its searchlight, an alligator takes the crossing. The only face on the corner is the one on the billboard.
   It is a whole block, made to be walked round: behind the store is an alley, with the store's back door, a vending
   machine, a skip, and a ladder to the roof; and on the roof, behind the billboard, what whoever had the lowrider
   left there. (One of each big thing: the corner is too small to hold two police cars.)
   (There are two figures made for it further down, a girl and somebody filming her. They are left out: figures this
   small do not hold their detail. `people: true` among the controls sculpts them again, where they stood.)

   One unit is about half a metre of a toy street. It is authored for 36 art pixels a unit (`DETAIL`): at the camera's own
   distance a 480 x 270 picture takes in the whole corner. As in the night stall, nothing remembers the frame before:
   everything that moves is worked out from the clock, so any frame can be drawn on its own, and after LOOP seconds it
   all comes round to where it began.
   `web: true` is for a page that draws it live with Ink Studio's WebGL renderer (page.js). That renderer has no
   mirroring materials and no lit haze: the page does those itself, and paints the sky, from `world.web` and GLOW. */

const DETAIL = 36, TAU = Math.PI * 2;
const LOOP = 36;
const every = period => LOOP / Math.max(1, Math.round(LOOP / period));
const pace = speed => (Math.max(1, Math.round((speed * LOOP) / TAU)) * TAU) / LOOP;

/* The palette, a ramp at a time, dark to light. Every ramp starts in the dusk's purple and ends in the sunset's gold,
   by way of its own colour: so a thing's shadow side is cool and its sunlit side warm, without a second ramp. */
const PALETTE = [0x241a42];   // (what is behind everything in a still drawn here; the page paints a sky there)
const ramp = (...cols) => { const at = PALETTE.length; PALETTE.push(...cols); return cols.map((_, i) => at + i); };
const C = {
  dusk: ramp(0x1a1433, 0x2b1f4d, 0x443068, 0x624787, 0x8a63a3),   // asphalt, concrete, every shadow side
  warm: ramp(0xb9789a, 0xe79a8f, 0xffc48a, 0xffe3a8),             // the same where the low sun or a lamp reaches
  wall: ramp(0x24375c, 0x2f6a80, 0x4fa59a, 0x9bdcb0),             // the store's stucco
  pink: ramp(0x7a1f5e, 0xd4358c, 0xff6fb5, 0xffc4e0),             // neon, trim, the flamingo
  cyan: ramp(0x1f9fc0, 0x7af0ff),                                 // the other neon
  purple: ramp(0x2a0f52, 0x4a1b8a, 0x7430c4, 0xa55ae8),           // the lowrider's candy paint
  gold: ramp(0x9a5f16, 0xf0b428, 0xfff0a0),                       // rims, the chain, the stars that are lit
  steel: ramp(0x2c3350, 0x59668c, 0x9aa7c7, 0xdfe8f7),            // chrome, glass, the police car's white
  black: ramp(0x0a0814),                                          // tyres, bars
  skin: ramp(0xc97f72, 0xf5b598, 0xffdcc4),
  hair: ramp(0x3b1f1c, 0x5e3424, 0x86502f, 0xb37946, 0xd9a268),   // her hair, and wood, trunks, crates
  cocoa: ramp(0x2a1418),                                          // her dress at its darkest
  cream: ramp(0x6e5a7a, 0xa8909e, 0xe0cbb8, 0xfff2dc),            // apron, socks, paint lines, paper
  red: ramp(0x4a0d1e, 0x8e1b2c, 0xd42c34, 0xff6a4a),              // her bows, the cola cup, the red lamp
  orange: ramp(0xa3440f, 0xe8741a, 0xffa02e, 0xffd166),           // the oranges
  green: ramp(0x10302e, 0x22643d, 0x4fa348, 0xa9de6a),            // palms, leaves, banknotes, the alligator
  blue: ramp(0x1b2a6b, 0x2f55d6, 0x6fa5ff),                       // the blue lamp, dark glass
  glow: ramp(0xffb347, 0xffe08a, 0xfffbe0)                        // lamplight itself
};
const hex = i => '#' + PALETTE[i].toString(16).padStart(6, '0');
/* for the `web` variant: the bits of a colour the picture keeps (the page notes things in the others). No two colours
   above may be the same in these bits */
const WEB_BITS = 0xfcfcf0;
{
  const seen = new Map();
  PALETTE.slice(1).forEach((c, i) => {
    const k = c & WEB_BITS;
    if (seen.has(k) || k === 0) throw new Error(`palette: colours ${seen.get(k)} and ${i + 1} are the same to the page`);
    seen.set(k, i + 1);
  });
  if (PALETTE.length > 64) throw new Error('palette: the page has room for 64 colours, this is ' + PALETTE.length);
}

const norm = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const clamp01 = v => Math.max(0, Math.min(1, v));
const smooth = v => { v = clamp01(v); return v * v * (3 - 2 * v); };

/* ── where things stand ─────────────────────────────────────────────────────────────────────────────────────────────
   x runs along the main street (the camera's right), z comes toward the camera, y is up. The store is at the back on
   the left; the side street runs away to the back on the right. */
const SLAB = { x0: -5.4, x1: 5.4, z0: -7.7, z1: 3.7 };
const KERB = -0.55;                       // the main street's kerb: pavement behind it (z less), road before it
const SIDE = { x0: 2.15, x1: 4.25 };      // the side street, kerb to kerb: it runs the whole depth of the slab
const ALLEY = -5.15;                      // the kerb behind the store: its block before it, the service alley behind, out to the slab's back edge
const STORE = { x0: -4.5, x1: 1.35, zf: -1.95, zb: -4.5, top: 3.4 };
const WINDOW = { x0: -4.05, x1: -1.25, y0: 0.78, y1: 2.3 };
const DOOR = { x0: -0.6, x1: 0.5, y1: 2.3 };
const BACK_DOOR = { x0: -0.35, x1: 0.45, y1: 2.15 };       // in the store's back wall, on the alley
const BACK_WINDOW = { x: -3.6, y: 2.3, hw: 0.42, hh: 0.26 };
const CAR = { at: [-1.1, 0, 0.5], yaw: Math.PI };          // the lowrider: its nose to the left
const COP = { at: [3.2, 0, -3.55], yaw: -Math.PI / 2 };    // the police car: its nose toward the camera
const GIRL = { at: [-2.45, 0, 2.08], yaw: 0, scale: 1.25 };   // (where she stood, when the figures are asked for)
const HELI = { at: [-1.4, 5.45, 0.45], yaw: -2.13 };       // over the lowrider, its nose out toward the road
const MARK = [-0.95, 0.8, 0.55];                           // what the searchlight is held on: the lowrider's open cabin
const STARS_AT = [-1.0, 1.97, 0.6];                        // the middle of the row of stars over it: close over it, clear of the store's signs
const SUN = norm([0.05, 0.26, -1]);                        // low and straight behind the store: its shadow lies down the street
const LAMP = {
  window: [-2.65, 1.6, -1.45],            // what the shop window throws on the pavement
  door: [-0.05, 1.3, -1.5],
  hours: [-0.05, 2.95, -1.6],             // the 24H sign over the door
  flamingo: [0.78, 4.35, -1.9],
  street: [2.55, 4.3, -0.45],             // the street lamp's head, out over the corner
  beam: [-1.8, 3.3, 1.9],                 // the searchlight's pool: baked as a lamp held over the lowrider's near side
  under: [-1.1, 0.14, 0.5],               // the neon under the lowrider
  heads: [-4.0, 0.42, 0.5],               // what its headlamps throw ahead of it
  cop: [3.2, 0.5, -0.8],                  // and the police car's
  board: [-2.9, 3.85, -2.3],              // the lamps under the billboard
  back: [0.05, 2.5, -4.95],               // the lamp over the back door
  yard: [-2.35, 3.0, -5.5],               // a floodlight on an arm out from the back wall, over the alley
  rear: [3.7, 4.3, -6.3],                 // a second street lamp's head, over where the alley meets the side street
  cola: [0.93, 1.2, -5.45]                // what the vending machine by the back door throws
};
/* standing water: each pool is a few flat blobs [x, z, rx, rz] run together */
const POOLS = [
  { id: 'pool-front', blobs: [[-3.0, 3.0, 0.95, 0.42], [-2.1, 3.25, 0.6, 0.3], [-3.7, 2.7, 0.5, 0.3]] },
  { id: 'pool-mid', blobs: [[0.9, 2.5, 0.8, 0.45], [1.6, 2.2, 0.5, 0.28]] },
  { id: 'pool-corner', blobs: [[3.1, 0.75, 0.75, 0.5], [3.7, 1.25, 0.45, 0.3]] },
  { id: 'pool-alley', blobs: [[-1.7, -6.55, 0.95, 0.42], [-0.75, -6.25, 0.5, 0.3], [-2.55, -6.85, 0.45, 0.25], [-4.6, -6.5, 0.5, 0.36], [1.75, -5.85, 0.5, 0.28]] }
];
const WATER = 0.012;
const MIRROR = {
  road: { f0: 0.14, power: 3.5, strength: 0.85, distortion: 0, blur: 1.5, color: '#ffffff' },
  pool: { f0: 0.82, strength: 0.98, distortion: 0, blur: 0.3, color: '#f0e4f4' }
};

/* the scene: sculpted and baked, then set moving */
function build(kit, seed, o) {
  const made = sculpt(kit, seed, o);
  return animate(kit.KIT, made.world, made.moves, made.opt);
}

/* a group of solids made about its own origin and facing its own +x or +z, then stood in the scene turned by `yaw`.
   `make` is handed the transform ({ point, inverse, direction }), for a material that must know where it is */
function xform(at, yaw, k = 1) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return {
    scale: k,
    point: ([x, y, z]) => [at[0] + k * (x * c + z * s), at[1] + k * y, at[2] + k * (-x * s + z * c)],
    inverse: ([X, Y, Z]) => { const x = (X - at[0]) / k, z = (Z - at[2]) / k; return [x * c - z * s, (Y - at[1]) / k, x * s + z * c]; },
    direction: ([x, y, z]) => [x * c + z * s, y, -x * s + z * c]
  };
}
function placed(S, at, yaw, make, k = 1) {
  const xf = xform(at, yaw, k);
  S.transformSolids(xf, () => { make(xf); });
  return xf;
}

function sculpt(kit, seed, o = {}) {
  const { makeBuilder, makeSculpt, KIT: K } = kit;
  const opt = { wet: true, fog: true, web: false, people: false, ...(o.controls || {}) };
  const B = makeBuilder(seed, opt.web ? [0x000000, ...PALETTE.slice(1, 64).map(c => c & WEB_BITS)] : PALETTE), S = K.sculpt(makeSculpt(B)), tags = K.deform.tags(S);
  S.pixel = true;
  S.pixelSize(DETAIL);
  S.sun = SUN;
  S.amb = 0.2; S.sky = 0.24; S.sunK = 1.0; S.wob = 0.012;
  S.lights.push({ p: LAMP.window, r: 3.8, s: 1.0 });
  S.lights.push({ p: LAMP.door, r: 2.4, s: 0.8 });
  S.lights.push({ p: LAMP.hours, r: 1.4, s: 0.5 });
  S.lights.push({ p: LAMP.flamingo, r: 2.2, s: 0.6 });
  S.lights.push({ p: LAMP.street, r: 6.5, s: 1.05, sh: true });
  S.lights.push({ p: LAMP.beam, r: 6.6, s: 1.05, sh: true });
  S.lights.push({ p: LAMP.heads, r: 2.1, s: 0.8 });
  S.lights.push({ p: LAMP.cop, r: 2.8, s: 0.9 });
  S.lights.push({ p: LAMP.board, r: 2.6, s: 0.9 });
  S.lights.push({ p: LAMP.back, r: 2.4, s: 0.8 });
  S.lights.push({ p: LAMP.yard, r: 5.2, s: 0.8, sh: true });
  S.lights.push({ p: LAMP.rear, r: 6.0, s: 0.95, sh: true });
  S.lights.push({ p: LAMP.cola, r: 1.9, s: 0.6 });

  /* The materials. Ink's WebGL renderer has room for 64 ramps in all (every different `r` and `g` below is one), so
     things share them where they can: there is one cream, one dark red, one of each wood. */
  const d = C.dusk, w = C.warm, H = C.hair, G = C.green, R = C.red, cr = C.cream, st = C.steel;
  const lit = g => (opt.web ? {} : { g });   // (a patterned material's lamp-lit ramp: as in the night stall, only the film's renderer is given it)
  const stone = [d[1], d[2], d[3], w[0], w[1]], dark = { r: [C.black[0], d[0], d[0], d[1]], g: [d[0], d[1], d[2]] };
  const cream = { r: [cr[0], cr[1], cr[2], cr[3]], g: [cr[1], cr[2], cr[3]] };
  const M = {
    road: { r: [d[0], d[0], d[1], d[2], w[0], w[1]], g: [d[1], d[2], d[3], d[4], w[0], w[1]], materialId: 'road' },
    paving: { ...K.pixel.masonry({ r: stone, stone: [11, 7], joint: 2, vary: 0.3, seed: 5 }), ...lit([d[3], d[4], w[0], w[1], w[2]]), materialId: 'paving' },
    kerb: { r: stone, materialId: 'paving' },
    rock: { r: [d[1], d[1], d[2], d[3]] },
    line: cream, cream,
    yellow: { r: [d[2], C.gold[0], C.gold[1]] },
    gold: { r: [C.gold[0], C.gold[0], C.gold[1], C.gold[2]], g: [C.gold[0], C.gold[1], C.gold[2]] },
    wall: { r: [d[1], C.wall[0], C.wall[1], C.wall[2], C.wall[3]], g: [C.wall[1], C.wall[2], C.wall[3], w[3]] },
    wallDark: { r: [d[0], d[1], C.wall[0], C.wall[1]] },
    trim: { r: [C.pink[0], C.pink[0], C.pink[1], C.pink[2], C.pink[3]], g: [C.pink[1], C.pink[2], C.pink[3]] },
    plinth: dark, sign: dark,
    steel: { r: [st[0], st[0], st[1], st[2], st[3]], g: [st[1], st[2], st[3], C.glow[2]] },
    iron: { r: [C.black[0], d[0], st[0], st[1]], g: [st[0], st[1], st[2]] },
    black: { r: [C.black[0], C.black[0], d[0], d[1]] },
    glass: { r: [C.blue[0], C.blue[0], st[0], st[1], st[2]] },
    white: { r: [cr[0], st[1], st[2], st[3], cr[3]], g: [st[2], st[3], cr[3]] },
    wood: { r: [H[0], H[1], H[2], H[3], H[4]], g: [H[2], H[3], H[4]] },
    trunk: { r: [H[0], H[0], H[1], H[2], H[3]], g: [H[2], H[3], H[4]] },
    leaf: { r: [G[0], G[0], G[1], G[2], G[3]], g: [G[1], G[2], G[3]] },
    hide: { r: [G[0], G[0], G[1], G[1], G[2]], g: [G[1], G[2], G[3]] },                  // the alligator, and her holdall
    red: { r: [R[0], R[1], R[2], R[3]], g: [R[1], R[2], R[3]] },
    bow: { r: [R[0], R[0], R[1], R[1], R[2]], g: [R[1], R[2], R[3]] },
    orange: { r: [C.orange[0], C.orange[1], C.orange[2], C.orange[3]], g: [C.orange[1], C.orange[2], C.orange[3]] },
    purple: { r: [C.purple[0], C.purple[1], C.purple[2], C.purple[2], C.purple[3], C.pink[3]], g: [C.purple[1], C.purple[2], C.purple[3], C.purple[3], C.pink[3]] },
    blue: { r: [C.blue[0], C.blue[0], C.blue[1]] },
    cyan: { r: [C.cyan[0], C.cyan[0], C.cyan[1]] },
    skin: { r: [C.skin[0], C.skin[0], C.skin[1], C.skin[2], C.skin[2]], g: [C.skin[1], C.skin[2], C.skin[2], cr[3]] },
    hair: { r: [H[0], H[0], H[1], H[1], H[2]], g: [H[1], H[2], H[2], H[3]] },
    tips: { r: [H[0], H[1], H[2], H[3], H[3]], g: [H[2], H[3], H[3], H[4]] },
    frock: { r: [C.cocoa[0], C.cocoa[0], H[0], H[1], H[2]], g: [H[0], H[1], H[2]] },
    // what glows (a glowing dab is one colour, and takes no ramp)
    neonPink: { r: [C.pink[2]], em: true },
    neonHot: { r: [C.pink[3]], em: true },
    neonCyan: { r: [C.cyan[1]], em: true },
    bulb: { r: [C.glow[2]], em: true },
    amber: { r: [C.glow[0]], em: true }
  };
  /* the road is wet: where the page (or the film) can, it mirrors what stands on it. Pools are flat sheets over it */
  const pools = POOLS.map(p => ({ ...p, mat: { r: [d[0], d[1], d[2], d[3]], materialId: 'pool' } }));

  const ctx = { S, K, B, M, opt, pools };
  const only = opt.only ? String(opt.only).split(',') : null, wants = name => !only || only.includes(name);
  island(ctx);
  if (wants('store')) { store(ctx); roof(ctx); }
  if (wants('street')) street(ctx);
  if (wants('alley')) alley(ctx);
  if (wants('palms')) palms(ctx);
  if (wants('car')) lowrider(ctx);
  if (wants('cop')) police(ctx);
  if (wants('heli')) helicopter(ctx);
  if (wants('stars')) stars(ctx);
  if (opt.people && wants('girl')) girl(ctx);
  if (wants('gator')) alligator(ctx);
  if (opt.people && wants('fan')) bystander(ctx);
  S.bake();

  const fx = air(ctx);
  const world = B.finish({
    cam: { ...camera(0), sway: 0 },
    radius: 11, detail: DETAIL, dither: 0,
    look: { pixel: true, outline: true, clean: true }
  });
  // what is in the air is drawn a pixel or two wide: those are not specks for the clean-up to take away
  if (fx.count) (world.effectParticles ||= []).push({ first: fx.first, count: fx.count });
  return { world, moves: { tags: Object.fromEntries(Object.entries(tags)), fx }, opt };
}

/* What sets a baked world moving: one puppet, posed from the clock alone. It serves a world just sculpted and one
   taken out of store (see `unpack`) alike. */
function animate(K, world, moves, opt) {
  rig(K, world, moves.tags);
  const puppet = world.anim.update, airAt = airClock(moves.fx), rest = world.data;
  world.anim.update = function (dt, t) {
    puppet.call(this, dt, t);
    if (!opt.still) Object.assign(world.cam, camera(t));
    airAt(rest, t);
  };
  airAt(rest, 0);
  if (opt.web) world.web = {
    colours: PALETTE.slice(0, 64), bits: WEB_BITS,
    rows: { first: moves.fx.first, count: moves.fx.count },
    mirror: opt.wet && { at: WATER, ...MIRROR }
  };
  return world;
}

/* ── what happens, by the clock ─────────────────────────────────────────────────────────────────────────────────────
   Each of these is a plain function of the time, so the page can ask them too (it lights the haze and the road by them). */
const wrap = t => (t >= 0 && t < LOOP ? t : ((t % LOOP) + LOOP) % LOOP);   // (a time already in the loop is left exactly as it is)
const once = (t, a, d) => (t > a && t < a + d ? Math.sin((Math.PI * (t - a)) / d) : 0);            // one rise and fall, d long
const held = (t, a, b, e) => smooth((t - a) / e) * (1 - smooth((t - b + e) / e));                 // 1 from a to b, eased over e
/* the police car's lamps: red and blue turn about, each a double blink, one lamp to each beat of the music (music.mjs:
   a beat is 0.45 s, so the two lamps take 0.9). And the store's alarm, slower */
const FLASH = every(0.9);
function flash(t) {
  const u = (wrap(t) / FLASH) % 1, blink = v => (v < 0.16 || (v > 0.24 && v < 0.4) ? 1 : 0);
  return { red: blink(u), blue: blink((u + 0.5) % 1), alarm: (wrap(t) / every(1.2)) % 1 < 0.5 ? 1 : 0 };
}
/* the lowrider: a set of hops on its front wheels, then a rest, four times round the loop. The angle its nose is up
   by, in degrees */
function hop(t) {
  const tt = wrap(t) % (LOOP / 4), beat = LOOP / 4 / 10;
  if (tt >= beat * 6) return 0.5 * Math.sin((tt - beat * 6) * 9) * Math.exp(-(tt - beat * 6) * 2.2);   // settling
  const u = (tt / beat) % 1;
  return 6.2 * (u < 0.16 ? smooth(u / 0.16) : Math.max(0, 1 - ((u - 0.16) / 0.5) ** 1.6)) + (u > 0.72 ? -0.9 * Math.sin(((u - 0.72) / 0.28) * Math.PI) : 0);
}
/* the helicopter: where it has drifted to from HELI.at, and how it leans (it hangs nose down, watching) */
function hover(t) {
  return {
    pos: [0.3 * Math.sin(t * pace(0.42)), 0.16 * Math.sin(t * pace(0.75) + 1), 0.22 * Math.sin(t * pace(0.3) + 2)],
    dip: 0.2 + 0.035 * Math.sin(t * pace(0.6) + 0.5), roll: 0.05 * Math.sin(t * pace(0.42) + 1.4)
  };
}
/* the searchlight: from the lamp under the helicopter's chin to a spot that wanders a little about the lowrider */
function beam(t) {
  const h = hover(t), xf = xform(HELI.at, HELI.yaw), from = xf.point(HELI_AT.lamp).map((v, i) => v + h.pos[i]);
  const to = [MARK[0] + 0.22 * Math.sin(t * pace(0.5) + 1), MARK[1], MARK[2] + 0.14 * Math.sin(t * pace(0.83))];
  return { from, to };
}
/* the fourth star: lit for a while, twice in the loop, coming on with a stutter. It comes and goes on beats of the
   music, which rings a little bell each time (music.mjs reads these) */
const FOURTH = [[9.9, 17.1], [27, 31.5]];
function fourth(t) {
  const u = wrap(t);
  for (const [a, b] of FOURTH) if (u >= a && u < b) return u - a < 0.5 ? (Math.floor((u - a) * 12) % 2 ? 0 : 1) : 1;
  return 0;
}

/* the flamingo's tube is old: it goes out for an instant now and then */
const neon = t => ([6.1, 6.32, 19.4, 19.52, 19.75, 30.8].some(a => wrap(t) > a && wrap(t) < a + 0.07) ? 0 : 1);

/* For a page that draws the evening haze and the lamps' light in it itself: a thin haze over the corner, the lamps that
   show in it (`pulse` names the clock a lamp goes by), the searchlight's beam, and the lamps whose light the page lays
   over what it falls on, since they flash (`wash`). */
const COP_BAR = [-0.31, 0.31].map(z => xform(COP.at, COP.yaw).point([0.0, 1.5, z]));
const GLOW = {
  centre: [0, -2], reach: 10.6, top: 8.5, density: 0.016, anisotropy: 0.25, color: '#d8b4e2', drift: pace(0.4),
  points: [
    { at: LAMP.flamingo, radius: 2.3, intensity: 16, color: '#ff6fb5', pulse: 'neon' },
    { at: [-0.1, 2.9, STORE.zf + 0.35], radius: 1.7, intensity: 11, color: '#7af0ff' },
    { at: [-2.65, 1.5, STORE.zf + 0.4], radius: 2.6, intensity: 12, color: '#ffe08a', under: 2.45 },
    { at: [-0.05, 1.3, STORE.zf + 0.3], radius: 1.9, intensity: 10, color: '#ffe08a' },
    { at: [LAMP.street[0], LAMP.street[1] - 0.25, LAMP.street[2]], radius: 3.2, intensity: 16, color: '#ffd9a0' },
    { at: COP_BAR[0], radius: 3.6, intensity: 34, color: '#ff3838', pulse: 'red' },
    { at: COP_BAR[1], radius: 3.6, intensity: 34, color: '#3d6cff', pulse: 'blue' },
    { at: [1.02, 2.68, STORE.zf + 0.2], radius: 1.4, intensity: 14, color: '#ff5040', pulse: 'alarm' },
    { at: LAMP.under, radius: 1.7, intensity: 10, color: '#ff6fb5' },
    { at: LAMP.board, radius: 2.2, intensity: 8, color: '#ffe08a' },
    { at: LAMP.cop, radius: 1.9, intensity: 10, color: '#ffe9b0' },
    { at: LAMP.heads, radius: 1.7, intensity: 9, color: '#ffe9b0' },
    { at: [LAMP.rear[0], LAMP.rear[1] - 0.25, LAMP.rear[2]], radius: 3.0, intensity: 14, color: '#ffd9a0' },
    { at: [LAMP.back[0], LAMP.back[1], LAMP.back[2] - 0.1], radius: 1.5, intensity: 8, color: '#ffe08a' },
    { at: [LAMP.yard[0], LAMP.yard[1] - 0.15, LAMP.yard[2]], radius: 1.6, intensity: 6, color: '#ffe9b0' },
    { at: LAMP.cola, radius: 1.5, intensity: 8, color: '#ff8fc4' }
  ],
  beam: { radius: 10, innerAngle: 9, outerAngle: 15, intensity: 38, color: '#fff3d0' },
  wash: [
    { at: COP_BAR[0], radius: 8.5, strength: 0.55, color: '#ff3040', pulse: 'red' },
    { at: COP_BAR[1], radius: 8.5, strength: 0.55, color: '#3058ff', pulse: 'blue' },
    { at: [1.02, 2.68, STORE.zf + 0.3], radius: 2.4, strength: 0.5, color: '#ff4030', pulse: 'alarm' },
    { at: LAMP.under, radius: 2.5, strength: 0.7, color: '#ff4fa8' },
    { at: LAMP.flamingo, radius: 2.4, strength: 0.4, color: '#ff4fa8', pulse: 'neon' }
  ],
  pulse: t => ({ ...flash(t), neon: neon(t) })
};

function rig(K, world, tags) {
  const parts = {}, has = n => tags[n] && tags[n].length;
  const part = (name, pivot, parent) => { if (has(name)) parts[name] = { ids: tags[name], ...(pivot && { pivot }), ...(parent && parts[parent] && { parent }) }; };
  const car = xform(CAR.at, CAR.yaw), heli = xform(HELI.at, HELI.yaw), she = xform(GIRL.at, GIRL.yaw, GIRL.scale);
  part('carBody', car.point(CAR_AXLE));
  part('heli', HELI.at);
  part('heliRotor', heli.point(HELI_AT.hub), 'heli');
  part('heliTail', heli.point(HELI_AT.tail), 'heli');
  for (const name of ['copRedOn', 'copRedOff', 'copBlueOn', 'copBlueOff', 'alarmOn', 'alarmOff', 'flamingo']) part(name);
  part('girlHead', she.point(GIRL_AT.neck));
  part('girlSip', she.point(GIRL_AT.elbow));
  STARS.forEach((x, i) => { for (const suffix of i === 3 ? ['On', 'Off'] : ['']) part('star' + i + suffix, [STARS_AT[0] + x, STARS_AT[1], STARS_AT[2]]); });
  const fronds = [];
  for (const p of PALMS) for (let f = 0; f < p.fronds; f++) { const name = 'palm' + p.id + f; part(name, palmTop(p)); if (parts[name]) fronds.push({ name, ph: f * 2.1 + p.seed, a: (f / p.fronds) * TAU }); }
  for (const name of ['shoeA', 'shoeB']) if (has(name)) {
    let x = 0, y = -1e9, z = 0;
    for (const i of tags[name]) if (world.data[i * 16 + 1] > y) { x = world.data[i * 16]; y = world.data[i * 16 + 1]; z = world.data[i * 16 + 2]; }
    part(name, [x, y, z]);
  }
  const gator = xform(GATOR.at, GATOR.yaw), fan = xform(FAN.at, FAN.yaw, FAN.scale);
  part('gator', GATOR.at);
  part('gatorJaw', gator.point(GATOR_AT.jaw), 'gator');
  part('gatorTail1', gator.point(GATOR_AT.tail[0]), 'gator');
  part('gatorTail2', gator.point(GATOR_AT.tail[1]), 'gatorTail1');
  part('fanHead', fan.point([0, 0.92, 0]));
  part('fanArms', fan.point([0, 0.86, 0.02]));
  const heliSide = heli.direction([0, 0, 1]), heliNose = heli.direction([1, 0, 0]);
  world.rig = K.puppet(world, {
    parts,
    pose(t, dt, pup) {
      const P = pup.pose, u = wrap(t), M3 = K.M;
      // the lowrider: its nose is at -x, so lifting it turns the body the negative way about z
      if (parts.carBody) P.carBody = { rot: [0.8 * Math.sin(u * pace(1.3)) * (hop(u) > 0.5 ? 1 : 0.3), 0, -hop(u)] };
      // the helicopter
      const h = hover(u);
      if (parts.heli) P.heli = { pos: h.pos, turn: M3.mul(M3.rot(heliSide, h.dip), M3.rot(heliNose, h.roll)) };
      if (parts.heliRotor) P.heliRotor = { rot: [0, (u * 360 * 2.5) % 360, 0] };
      if (parts.heliTail) P.heliTail = { turn: M3.rot(heliSide, (u * TAU * 3) % TAU) };
      // lamps: each is shown lit or unlit
      const f = flash(u), lamp = (name, on) => { if (parts[name + 'On']) P[name + 'On'] = { show: on ? 1 : 0 }; if (parts[name + 'Off']) P[name + 'Off'] = { show: on ? 0 : 1 }; };
      lamp('copRed', f.red); lamp('copBlue', f.blue); lamp('alarm', f.alarm);
      // the flamingo's tube is old: it goes out for an instant now and then
      if (parts.flamingo) P.flamingo = { show: neon(u) };
      // her: she looks about a little, and now and then takes a pull at the cola
      const sip = held(u, 5.2, 7.6, 0.6) + held(u, 22.5, 25, 0.6);
      // (her arm is too short to bring the cup up: she tips it, which brings the straw across to her mouth, and leans to it)
      if (parts.girlHead) P.girlHead = { rot: [5 * sip + 1.2 * Math.sin(u * pace(1.1)) - 9 * held(u, 13, 16.5, 0.8), 9 * Math.sin(u * pace(0.35)) * (1 - sip) + 9 * sip, 2.5 * Math.sin(u * pace(0.55) + 1) * (1 - sip)] };
      if (parts.girlSip) P.girlSip = { rot: [-6 * sip, 0, 35 * sip] };
      // the stars turn, each at its own moment, and bob; and go up with the lowrider's nose
      STARS.forEach((x, i) => {
        const pose = { rot: [0, 32 * Math.sin(u * pace(1.6) + i * 1.1), 6 * Math.sin(u * pace(1.1) + i * 2.3)], pos: [0, 0.05 * Math.sin(u * pace(1.4) + i * 1.3) + 0.02 * Math.max(0, hop(u)), 0] };
        if (i === 3) { const on = fourth(u); if (parts.star3On) P.star3On = { ...pose, show: on }; if (parts.star3Off) P.star3Off = { ...pose, show: on ? 0 : 1 }; }
        else if (parts['star' + i]) P['star' + i] = pose;
      });
      // the alligator: along its path, swinging as it goes; its jaw drops once, where it stops to look about
      const g = stroll(u);
      if (parts.gator) P.gator = g.show ? { pos: [g.at[0] - GATOR.at[0], g.y || 0, g.at[1] - GATOR.at[2]], rot: [0, (g.turn * 180) / Math.PI + 5 * g.pace * Math.sin(u * pace(4.2)), 2.5 * g.pace * Math.sin(u * pace(4.2) + 1)], scale: g.size } : { show: 0 };
      for (const [name, k] of [['gatorTail1', 0], ['gatorTail2', 0.9]]) if (parts[name]) P[name] = g.show ? { rot: [0, (10 + 8 * g.pace) * Math.sin(u * pace(4.2) - 1 - k), 0] } : { show: 0 };
      if (parts.gatorJaw) P.gatorJaw = g.show ? { rot: [0, 0, -22 * held(u, 19.2, 20.9, 0.5)] } : { show: 0 };
      // the one with the phone: he keeps her in the frame, and bounces a little
      if (parts.fanHead) P.fanHead = { rot: [3 * Math.sin(u * pace(1.9)), 7 * Math.sin(u * pace(0.6)), 0] };
      if (parts.fanArms) P.fanArms = { rot: [2.5 * Math.sin(u * pace(1.9) + 0.6), 6 * Math.sin(u * pace(0.6) + 0.4), 0], pos: [0, 0.015 * Math.sin(u * pace(3.8)), 0] };
      // palms in the evening wind, and under the helicopter's
      const gust = 0.6 + 0.4 * Math.sin(u * pace(0.5)) * Math.sin(u * pace(0.21) + 1);
      for (const fr of fronds) { const a = 4.5 * gust * Math.sin(u * pace(1.5) + fr.ph); P[fr.name] = { rot: [a * Math.sin(fr.a), 0, -a * Math.cos(fr.a)] }; }
      for (const [name, w, ph] of [['shoeA', pace(2.4), 0], ['shoeB', pace(2.0), 1.3]]) if (parts[name]) P[name] = { rot: [7 * gust * Math.sin(u * w + ph), 0, 5 * gust * Math.sin(u * w * 0.5 + ph)] };
    }
  });
}

/* The film: once round the corner in LOOP seconds. It starts, and the page opens, low on the road off the lowrider's
   nose, looking up the street: low enough that the roofs stand against the sky. */
function camera(t) {
  const u = (t / LOOP) * TAU;
  return {
    // (it looks at a point behind the store's front, so that the corner stays in the picture all the way round; from
    // the front that is the same picture as looking at the lowrider from nearer. Going round to the back it looks
    // further back, at the middle of the block, and stands further off: the alley is then the near side, and it would
    // be cut off at the edges of the picture)
    target: [-0.22, 2.02 + 0.1 * Math.sin(u) ** 2, -1.05 - 0.95 * (1 - Math.cos(u)) / 2],
    yaw: -0.36 + u - 0.3 * Math.sin(u),
    pitch: 0.085 + 0.06 * (1 - Math.cos(u)),
    dist: 15.1 + 0.6 * (1 - Math.cos(2 * u)) / 2 + 1.6 * (1 - Math.cos(u)) / 2
  };
}

/* ── the ground ─────────────────────────────────────────────────────────────────────────────────────────────────────
   A slab of a block cut out of the evening: the main street in front, a side street down the right of it from front
   to back, an alley behind; the store's block of pavement between the three, and a strip of pavement across the side
   street. */
function island(ctx) {
  const { S, B, M } = ctx;
  const { x0, x1, z0, z1 } = SLAB, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, hx = (x1 - x0) / 2, hz = (z1 - z0) / 2;
  S.box([cx, -0.5, cz], [hx - 0.12, 0.42, hz - 0.12], M.rock, { res: 0.11, rd: 0.3 });
  S.box([cx, -0.06, cz], [hx, 0.06, hz], M.road, { res: 0.062, rd: 0.03 });
  // broken stone under the rim, so the edge is not a ruled line
  for (let i = 0; i < 34; i++) {
    const along = i / 34, side = Math.floor(along * 4), f = (along * 4) % 1, s = B.rr(0.35, 0.7);
    const p = side === 0 ? [x0 + f * (x1 - x0), z1] : side === 1 ? [x1, z1 - f * (z1 - z0)] : side === 2 ? [x1 - f * (x1 - x0), z0] : [x0, z0 + f * (z1 - z0)];
    S.rock([p[0] * 0.97, -0.55 + B.rr(-0.15, 0.08), p[1] * 0.97 + cz * 0.03], [s, s * B.rr(0.5, 0.8), s * 0.8], M.rock, { res: 0.1 });
  }
  // pavement: a kerb stone under it a little bigger all round, so the road sees a lighter edge
  const R = 0.5, T = 0.09;
  // (a block of it. `road` names the sides that have road along them, of f(ront) b(ack) l(eft) r(ight): those get the
  // kerb's edge. `round` names the corners that are rounded, each by its two sides)
  const pave = (ax0, ax1, az0, az1, road, round) => {
    for (const [grow, top, mat, res] of [[0.06, T - 0.012, M.kerb, 0.05], [0, T, M.paving, 0.055]]) {
      const g = side => (road.includes(side) ? grow : 0), X0 = ax0 - g('l'), X1 = ax1 + g('r'), Z0 = az0 - g('b'), Z1 = az1 + g('f'), r = R + grow;
      const has = c => round.includes(c), box = (xa, xb, za, zb) => S.box([(xa + xb) / 2, top / 2, (za + zb) / 2], [(xb - xa) / 2, top / 2, (zb - za) / 2], mat, { res });
      const left = has('fl') || has('bl'), right = has('fr') || has('br');
      box(X0 + (left ? r : 0), X1 - (right ? r : 0), Z0, Z1);
      if (left) box(X0, X0 + r, Z0 + (has('bl') ? r : 0), Z1 - (has('fl') ? r : 0));
      if (right) box(X1 - r, X1, Z0 + (has('br') ? r : 0), Z1 - (has('fr') ? r : 0));
      for (const c of round) S.lathe([c[1] === 'l' ? X0 + r : X1 - r, 0, c[0] === 'f' ? Z1 - r : Z0 + r], top, [r, r], mat, { res });
    }
  };
  pave(x0 + 0.02, SIDE.x0, ALLEY, KERB, 'frb', ['fr', 'br']);
  pave(SIDE.x1, x1 - 0.02, z0 + 0.02, KERB, 'fl', ['fl']);
  for (const p of ctx.pools) for (const [x, z, rx, rz] of p.blobs) S.ball([x, WATER - 0.01, z], [rx, 0.012, rz], p.mat, { res: 0.062 });
  // the crossing over the side street, a broken yellow line down the main one, a manhole, a drain at the corner
  for (let i = 0; i < 4; i++) S.box([SIDE.x0 + 0.27 + i * 0.52, 0.004, -1.25], [0.13, 0.008, 0.52], M.line, { res: 0.045 });
  for (let x = -4.6; x < 5; x += 1.55) S.box([x, 0.004, 2.72], [0.42, 0.008, 0.05], M.yellow, { res: 0.045 });
  S.lathe([1.35, 0, 1.55], 0.016, [0.38, 0.38], M.iron, { res: 0.04 });
  S.torus([1.35, 0.014, 1.55], 0.29, 0.014, M.black, { res: 0.03 });
  for (const a of [0, 1, 2]) S.box([1.35, 0.016, 1.55], [0.25, 0.008, 0.018], M.black, { res: 0.028, ax: B.frame((a * Math.PI) / 3, 0, 0) });
  S.box([1.1, 0.01, KERB + 0.2], [0.36, 0.016, 0.13], M.iron, { res: 0.04 });
  for (let i = 0; i < 5; i++) S.box([0.82 + i * 0.14, 0.022, KERB + 0.2], [0.024, 0.012, 0.1], M.black, { res: 0.03 });
  // the alley: a manhole where it meets the side street, a drain by its kerb, and a line across the side street's end
  S.lathe([1.6, 0, -7.0], 0.016, [0.34, 0.34], M.iron, { res: 0.04 });
  S.torus([1.6, 0.014, -7.0], 0.26, 0.014, M.black, { res: 0.03 });
  for (const a of [0, 1, 2]) S.box([1.6, 0.016, -7.0], [0.22, 0.008, 0.018], M.black, { res: 0.028, ax: B.frame((a * Math.PI) / 3, 0, 0) });
  S.box([-4.5, 0.01, ALLEY - 0.2], [0.36, 0.016, 0.13], M.iron, { res: 0.04 });
  for (let i = 0; i < 5; i++) S.box([-4.78 + i * 0.14, 0.022, ALLEY - 0.2], [0.024, 0.012, 0.1], M.black, { res: 0.03 });
  for (let i = 0; i < 3; i++) S.box([SIDE.x0 + 0.38 + i * 0.67, 0.004, -7.3], [0.24, 0.008, 0.05], M.yellow, { res: 0.045 });
}

/* ── the store ──────────────────────────────────────────────────────────────────────────────────────────────────────
   One storey of teal stucco with a pink cornice: a barred window full of light, an open door, a striped awning, a dark
   band for the sign with 24H in neon over the door. */
function store(ctx) {
  const { S, K, B, M } = ctx;
  const { x0, x1, zf, zb, top } = STORE, cx = (x0 + x1) / 2, hx = (x1 - x0) / 2, cz = (zf + zb) / 2, hz = (zf - zb) / 2;
  const T = 0.09;
  // what is cut out of it: the shop window, a shelf's depth; the doorway, deep enough to walk into
  const W = WINDOW, D = DOOR, BD = BACK_DOOR, BW = BACK_WINDOW, held = { hold: true };
  S.join('cut', S.box([cx, (top + T) / 2, cz], [hx, (top - T) / 2, hz], M.wall, held), [
    S.box([(W.x0 + W.x1) / 2, (W.y0 + W.y1) / 2, zf - 0.1], [(W.x1 - W.x0) / 2, (W.y1 - W.y0) / 2, 0.24], M.wallDark, held),
    S.box([(D.x0 + D.x1) / 2, (T + D.y1) / 2, zf - 0.55], [(D.x1 - D.x0) / 2, (D.y1 - T) / 2, 0.7], M.wallDark, held),
    // (and at the back: a door set a little into the wall, a small window high up)
    S.box([(BD.x0 + BD.x1) / 2, (T + BD.y1) / 2, zb + 0.05], [(BD.x1 - BD.x0) / 2, (BD.y1 - T) / 2, 0.13], M.wallDark, held),
    S.box([BW.x, BW.y, zb + 0.05], [BW.hw, BW.hh, 0.15], M.wallDark, held)
  ], { res: 0.062, r: 0.01, inner: M.wallDark.r });
  // the shop behind the glass: shelves of things in rows, all of it lit. And the same glow at the back of the doorway
  const goods = [C.red[2], C.cyan[1], C.orange[2], C.cream[3], C.pink[2], C.green[2], C.gold[1], C.blue[1]];
  const shelves = {
    r: [C.glow[1]], em: true,
    tex: (x, y) => {
      const v = (y - W.y0) / 0.31, row = Math.floor(v), f = v - row;
      if (f < 0.16) return C.hair[2];                                   // the shelf's edge
      if (f > 0.78) return C.glow[2];                                   // the lit back above the goods
      const k = Math.floor((x - W.x0) / 0.115), h = Math.abs(Math.sin(k * 12.9898 + row * 78.233) * 43758.5453) % 1;
      return h < 0.14 ? C.glow[1] : goods[Math.floor(h * 97) % goods.length];
    }
  };
  S.box([(W.x0 + W.x1) / 2, (W.y0 + W.y1) / 2, zf - 0.33], [(W.x1 - W.x0) / 2 - 0.01, (W.y1 - W.y0) / 2 - 0.01, 0.012], shelves, { res: 0.036, ghost: true });
  S.box([(D.x0 + D.x1) / 2, (T + D.y1) / 2, zf - 1.22], [(D.x1 - D.x0) / 2 - 0.01, (D.y1 - T) / 2, 0.012], { r: [C.glow[1]], em: true, tex: (x, y) => (y > 1.75 ? C.glow[2] : y < 0.5 ? C.glow[0] : C.glow[1]) }, { res: 0.045, ghost: true });
  // the window's frame, and bars before it: this is not a street to leave glass bare on
  const frame = (ax0, ax1, y0, y1, z, t, mat) => {
    S.box([(ax0 + ax1) / 2, y1 + t / 2, z], [(ax1 - ax0) / 2 + t, t / 2, 0.035], mat, { res: 0.036 });
    S.box([(ax0 + ax1) / 2, y0 - t / 2, z], [(ax1 - ax0) / 2 + t, t / 2, 0.045], mat, { res: 0.036 });
    for (const x of [ax0 - t / 2, ax1 + t / 2]) S.box([x, (y0 + y1) / 2, z], [t / 2, (y1 - y0) / 2, 0.035], mat, { res: 0.036 });
  };
  frame(W.x0, W.x1, W.y0, W.y1, zf + 0.02, 0.07, M.steel);
  for (let x = W.x0 + 0.2; x < W.x1 - 0.05; x += 0.3) S.tube([[x, W.y0, zf + 0.05], [x, W.y1, zf + 0.05]], 0.022, 0.022, M.black, { res: 0.026 });
  for (const y of [W.y0 + 0.42, W.y1 - 0.42]) S.tube([[W.x0, y, zf + 0.06], [W.x1, y, zf + 0.06]], 0.02, 0.02, M.black, { res: 0.026 });
  frame(D.x0, D.x1, T + 0.01, D.y1, zf + 0.02, 0.07, M.steel);
  // the door itself: two sheets of glass that slide, stuck open, a hand's width of each showing
  for (const x of [D.x0 + 0.09, D.x1 - 0.09]) S.box([x, (T + D.y1) / 2, zf - 0.06], [0.09, (D.y1 - T) / 2, 0.015], M.glass, { res: 0.04 });
  // a dark foot to the wall, and the band the signs are on
  S.box([cx, 0.33, zf + 0.025], [hx + 0.03, 0.24, 0.03], M.plinth, { res: 0.05 });
  S.box([x1 + 0.025, 0.33, cz], [0.03, 0.24, hz], M.plinth, { res: 0.05 });
  const band = { y: 2.9, h: 0.25 };
  S.box([cx, band.y, zf + 0.04], [hx + 0.04, band.h, 0.05], M.sign, { res: 0.045 });
  S.box([x1 + 0.04, band.y, cz], [0.05, band.h, hz], M.sign, { res: 0.045 });
  // neon lines along the band, round the corner
  for (const [y, mat] of [[band.y + band.h + 0.03, M.neonPink], [band.y - band.h - 0.03, M.neonCyan]]) {
    S.tube([[x0, y, zf + 0.11], [x1 + 0.11, y, zf + 0.11], [x1 + 0.11, y, zb + 0.1]], 0.024, 0.024, mat, { res: 0.03, ghost: true });
  }
  // 24H, in strokes of tube, over the door
  const stroke = (pts, mat) => S.tube(pts.map(([x, y]) => [-0.86 + x * 1.45, band.y - 0.19 + y * 1.3, zf + 0.12]), 0.021, 0.021, mat, { res: 0.022, ghost: true });
  stroke([[0, 0.24], [0.06, 0.29], [0.18, 0.29], [0.24, 0.23], [0.22, 0.16], [0, 0], [0.25, 0]], M.neonCyan);                     // 2
  stroke([[0.58, 0], [0.58, 0.29]], M.neonCyan); stroke([[0.58, 0.29], [0.38, 0.1], [0.66, 0.1]], M.neonCyan);                    // 4
  stroke([[0.82, 0], [0.82, 0.29]], M.neonPink); stroke([[1.06, 0], [1.06, 0.29]], M.neonPink); stroke([[0.82, 0.15], [1.06, 0.15]], M.neonPink);   // H
  // the cornice, and a low wall round the roof
  for (const [y, h, out, mat] of [[top - 0.05, 0.07, 0.07, M.trim], [top + 0.14, 0.12, 0.03, M.wall]]) {
    S.box([cx, y, zf + out / 2], [hx + out, h, out / 2 + 0.06], mat, { res: 0.05 });
    S.box([x1 + out / 2, y, cz], [out / 2 + 0.06, h, hz], mat, { res: 0.05 });
    S.box([x0 - out / 2, y, cz], [out / 2 + 0.06, h, hz], mat, { res: 0.05 });
    S.box([cx, y, zb - out / 2], [hx + out, h, out / 2 + 0.06], mat, { res: 0.05 });
  }
  S.box([cx, top + 0.01, cz], [hx - 0.1, 0.02, hz - 0.1], M.plinth, { res: 0.07 });
  // the awning over the window: pink and cream stripes, sloping out, a straight valance along its edge
  const stripe = (x, t) => { const k = Math.floor((x - W.x0 + 0.2) / 0.31) % 2 === 0; return S.pick(k ? [C.pink[0], C.pink[1], C.pink[2], C.pink[3]] : [C.cream[0], C.cream[1], C.cream[2], C.cream[3]], clamp01(t)); };
  const cloth = { r: [C.pink[1], C.pink[2]], tex: (x, y, z, ny, t) => stripe(x, t) };
  S.box([(W.x0 + W.x1) / 2, 2.5, zf + 0.4], [(W.x1 - W.x0) / 2 + 0.2, 0.025, 0.44], cloth, { res: 0.04, ax: B.frame(0, 0.33, 0) });
  S.box([(W.x0 + W.x1) / 2, 2.29, zf + 0.81], [(W.x1 - W.x0) / 2 + 0.2, 0.085, 0.015], cloth, { res: 0.036 });
  for (const x of [W.x0 - 0.18, W.x1 + 0.18]) S.tube([[x, 2.36, zf + 0.8], [x, 2.1, zf + 0.04]], 0.016, 0.016, M.steel, { res: 0.026 });
  // a box on the wall with a red lamp on it: the alarm. Its lamp is two, lit and unlit: the puppet shows one
  S.box([1.02, 2.5, zf + 0.07], [0.11, 0.13, 0.06], M.cream, { res: 0.03, rd: 0.02 });
  S.ball([1.02, 2.68, zf + 0.09], [0.06, 0.06, 0.06], { r: [C.red[3]], em: true }, { res: 0.022, tag: 'alarmOn', ghost: true });
  S.ball([1.02, 2.68, zf + 0.09], [0.058, 0.058, 0.058], M.bow, { res: 0.022, tag: 'alarmOff' });
  // something sprayed on the wall beside the door: a mandarin in a crown, and under it who did it
  decal(S, GRAFFITI, { at: [0.98, 1.52, zf + 0.012], cell: 0.062, key: { o: C.orange[2], O: C.orange[1], g: C.green[2], y: C.gold[1], p: C.pink[2] } });
  // an air conditioner and a pipe down the wall round the side
  S.box([x1 + 0.2, 2.25, -3.3], [0.2, 0.26, 0.42], M.steel, { res: 0.045, rd: 0.02 });
  for (let i = 0; i < 4; i++) S.box([x1 + 0.405, 2.12 + i * 0.09, -3.3], [0.01, 0.018, 0.36], M.iron, { res: 0.03 });
  S.tube([[x1 + 0.07, top, -2.3], [x1 + 0.07, 0.1, -2.3]], 0.04, 0.04, M.steel, { res: 0.036 });

  // ── round the back, on the alley, where the low sun is ──
  const bdx = (BD.x0 + BD.x1) / 2;
  // the wall's dark foot, along the back and the left side too
  S.box([cx, 0.33, zb - 0.025], [hx + 0.03, 0.24, 0.03], M.plinth, { res: 0.05 });
  S.box([x0 - 0.025, 0.33, cz], [0.03, 0.24, hz], M.plinth, { res: 0.05 });
  // the back door: red, shut, a wired pane in it with a light on behind, a kick plate, a bar to push. A step under it,
  // and over it a lamp
  S.box([bdx, (T + BD.y1) / 2, zb + 0.16], [(BD.x1 - BD.x0) / 2 - 0.01, (BD.y1 - T) / 2, 0.02], M.red, { res: 0.04 });
  frame(BD.x0, BD.x1, T + 0.01, BD.y1, zb - 0.02, 0.07, M.steel);
  S.box([bdx, 1.62, zb + 0.132], [0.14, 0.17, 0.008], { r: [C.glow[1]], em: true }, { res: 0.03, ghost: true });
  S.box([bdx, 0.3, zb + 0.132], [(BD.x1 - BD.x0) / 2 - 0.03, 0.16, 0.008], M.steel, { res: 0.034 });
  S.box([bdx, 1.08, zb + 0.115], [0.26, 0.03, 0.02], M.steel, { res: 0.026 });
  S.box([bdx, T + 0.05, zb - 0.26], [0.62, 0.05, 0.24], M.kerb, { res: 0.045, rd: 0.02 });
  S.box([bdx, BD.y1 + 0.33, zb - 0.06], [0.11, 0.075, 0.06], M.iron, { res: 0.03, rd: 0.02 });
  S.ball([bdx, BD.y1 + 0.3, zb - 0.13], [0.075, 0.06, 0.05], M.bulb, { res: 0.022, ghost: true });
  // a floodlight high on the wall, on an arm, turned down at the alley
  S.tube([[LAMP.yard[0], 2.92, zb - 0.02], [LAMP.yard[0], 3.2, zb - 0.5], [LAMP.yard[0], 3.14, zb - 0.94]], 0.022, 0.022, M.iron, { res: 0.026 });
  S.box([LAMP.yard[0], 3.1, zb - 1.0], [0.12, 0.045, 0.09], M.iron, { res: 0.028, rd: 0.02 });
  S.box([LAMP.yard[0], 3.05, zb - 1.0], [0.095, 0.012, 0.07], M.bulb, { res: 0.022, ghost: true });
  // the small window: frosted, lit, barred
  S.box([BW.x, BW.y, zb + 0.19], [BW.hw - 0.01, BW.hh - 0.01, 0.012], { r: [C.glow[1]], em: true, tex: (x, y) => (y > BW.y + BW.hh * 0.3 ? C.glow[2] : C.glow[1]) }, { res: 0.036, ghost: true });
  frame(BW.x - BW.hw, BW.x + BW.hw, BW.y - BW.hh, BW.y + BW.hh, zb - 0.02, 0.06, M.steel);
  for (let x = BW.x - BW.hw + 0.17; x < BW.x + BW.hw - 0.05; x += 0.25) S.tube([[x, BW.y - BW.hh, zb - 0.05], [x, BW.y + BW.hh, zb - 0.05]], 0.02, 0.02, M.black, { res: 0.026 });
  // the same hand as beside the front door, with more room: the mandarin in its crown, and the name
  decal(S, GRAFFITI, { at: [-1.7, 1.42, zb - 0.022], cell: 0.1, res: 0.026, key: { o: C.orange[2], O: C.orange[1], g: C.green[2], y: C.gold[1], p: C.pink[2] }, flip: -1 });
  // a meter in a grey box, its pipe up the wall; a downpipe at the far end; a ladder to the roof, its foot out of reach
  S.box([-2.78, 1.35, zb - 0.07], [0.13, 0.18, 0.07], M.steel, { res: 0.034, rd: 0.015 });
  S.tube([[-2.78, 1.5, zb - 0.05], [-2.78, top + 0.1, zb - 0.05]], 0.022, 0.022, M.steel, { res: 0.026 });
  S.tube([[x0 + 0.2, top + 0.05, zb - 0.06], [x0 + 0.2, 0.14, zb - 0.06], [x0 + 0.2, 0.11, zb - 0.22]], 0.045, 0.045, M.steel, { res: 0.034 });
  const lad = -0.64;
  for (const dx of [-0.15, 0.15]) S.tube([[lad + dx, 0.75, zb - 0.14], [lad + dx, top + 0.55, zb - 0.14], [lad + dx, top + 0.62, zb + 0.02], [lad + dx, top + 0.26, zb + 0.16]], 0.022, 0.022, M.steel, { res: 0.026 });
  for (let y = 0.85; y < top + 0.5; y += 0.23) S.tube([[lad - 0.15, y, zb - 0.14], [lad + 0.15, y, zb - 0.14]], 0.016, 0.016, M.steel, { res: 0.022 });
  for (const y of [1.6, top - 0.3]) for (const dx of [-0.15, 0.15]) S.tube([[lad + dx, y, zb - 0.14], [lad + dx, y, zb]], 0.016, 0.016, M.iron, { res: 0.022 });
  // the vending machine: the cola's own, lit from inside. Its name over rows of cans, and the slot they come out of
  const vx = 0.93, vz = zb - 0.32, cans = [C.red[2], C.cyan[1], C.orange[2], C.pink[2], C.green[2], C.gold[1]];
  S.box([vx, T + 0.9, vz], [0.31, 0.9, 0.27], M.sign, { res: 0.045, rd: 0.03 });
  S.box([vx, T + 1.12, vz - 0.275], [0.25, 0.56, 0.008], {
    r: [C.glow[1]], em: true,
    tex: (x, y) => {
      if (y > T + 1.42) return C.pink[3];                                         // the head of it, where the name is
      const v = (y - (T + 0.58)) / 0.21, row = Math.floor(v), u = (vx + 0.25 - x) / 0.1, k = Math.floor(u);
      if (v - row < 0.2 || u - k < 0.22) return C.glow[2];
      return cans[(k * 5 + row * 3 + 60) % cans.length];
    }
  }, { res: 0.026, ghost: true });
  decal(S, lettering('COLA', 'p'), { at: [vx, T + 1.55, vz - 0.29], cell: 0.03, key: { p: C.pink[0] }, glow: true, flip: -1 });
  S.box([vx, T + 0.33, vz - 0.275], [0.2, 0.09, 0.008], M.black, { res: 0.03 });
  // painted on the left wall, big, and a little faded: what the store would like you to drink
  decal(S, lettering('COLA', 'w'), { at: [x0 - 0.022, 2.25, cz - 0.1], cell: 0.13, res: 0.03, key: { w: C.cream[2] }, face: 'x', flip: 1 });
}

/* a picture typed a pixel at a time and stuck flat on a face: each letter a colour, '.' nothing. `at` is its middle,
   `face` the axis it looks along ('z' or 'x': in a placed group's own space when its transform `xf` is given), `flip`
   -1 turns it to read from the other side */
function decal(S, rows, { at, cell, key, glow, face = 'z', flip = 1, xf, tag, res }) {
  const h = rows.length, wd = Math.max(...rows.map(r => r.length));
  const colourAt = (X, Y, Z) => {
    const [x, y, z] = xf ? xf.inverse([X, Y, Z]) : [X, Y, Z];
    const u = face === 'z' ? x - at[0] : z - at[2];
    const i = Math.floor((flip * u) / cell + wd / 2), j = Math.floor((at[1] - y) / cell + h / 2);
    const ch = j >= 0 && j < h && i >= 0 && i < rows[j].length ? rows[j][i] : '.';
    return ch === '.' || ch === ' ' ? -1 : key[ch];
  };
  const half = face === 'z' ? [(wd * cell) / 2, (h * cell) / 2, 0.006] : [0.006, (h * cell) / 2, (wd * cell) / 2];
  S.box(at, half, { r: [Object.values(key)[0]], ...(glow && { em: true }), tex: colourAt }, { res: res || cell * 0.42, ghost: true, ...(tag && { tag }) });
}
/* capitals three pixels wide and five high, for a number plate and a door */
const FONT = {
  C: ['###', '#..', '#..', '#..', '###'], A: ['###', '#.#', '###', '#.#', '#.#'], P: ['###', '#.#', '###', '#..', '#..'],
  Y: ['#.#', '#.#', '###', '.#.', '.#.'], O: ['###', '#.#', '#.#', '#.#', '###'], L: ['#..', '#..', '#..', '#..', '###'],
  I: ['###', '.#.', '.#.', '.#.', '###'], E: ['###', '#..', '##.', '#..', '###']
};
const lettering = (word, ch = '#') => [0, 1, 2, 3, 4].map(j => [...word].map(c => FONT[c][j].replace(/#/g, ch)).join('.'));
const GRAFFITI = [
  '....y..y..y....',
  '....yy.y.yy....',
  '....yyyyyyy....',
  '.....g.........',
  '....ogg.oo.....',
  '...ooooooooo...',
  '..ooooooooOoo..',
  '..oooooooOOoo..',
  '..ooooooooOOo..',
  '...oooooOOOo...',
  '....oooOOOo....',
  '...............',
  ...lettering('CAPY', 'p')
];

/* ── on the roof ────────────────────────────────────────────────────────────────────────────────────────────────────
   A billboard for a cola nobody sells, and a flamingo in neon on a mast at the corner. */
function roof(ctx) {
  const { S, K, B, M } = ctx;
  const top = STORE.top;
  // the billboard: a board on two legs, turned a little toward the street corner, a walkway and three lamps under it
  const bx = -2.95, bz = -3.0, by = 4.72, yaw = -0.22, cell = 0.095, rows = BOARD.length, cols = BOARD[0].length;
  const U = [Math.cos(yaw), 0, -Math.sin(yaw)], Wd = [Math.sin(yaw), 0, Math.cos(yaw)];
  const on = (u, y, wz) => [bx + U[0] * u + Wd[0] * wz, y, bz + U[2] * u + Wd[2] * wz];
  const frameAx = B.frame(yaw, 0, 0), hw = (cols * cell) / 2, hh = (rows * cell) / 2;
  for (const u of [-0.9, 0.9]) S.tube([on(u, top, -0.12), on(u, by + hh, -0.12)], 0.05, 0.05, M.iron, { res: 0.04 });
  S.tube([on(-0.9, top + 0.5, -0.12), on(0.9, by - hh, -0.12)], 0.022, 0.022, M.iron, { res: 0.03 });
  S.box(on(0, by, -0.03), [hw + 0.07, hh + 0.07, 0.035], M.iron, { res: 0.045, ax: frameAx });
  const art = {
    r: [C.cream[3]],
    tex: (x, y, z) => {
      const u = (x - bx) * U[0] + (z - bz) * U[2], i = Math.floor(u / cell + cols / 2), j = Math.floor((by + hh - y) / cell);
      const ch = j >= 0 && j < rows && i >= 0 && i < cols ? BOARD[j][i] : 'k';
      return BOARD_KEY[ch];
    }
  };
  S.box(on(0, by, 0.02), [hw, hh, 0.015], art, { res: 0.034, ax: frameAx, ghost: true });
  S.box(on(0, by - hh - 0.16, 0.2), [hw + 0.05, 0.02, 0.2], M.iron, { res: 0.04, ax: frameAx });
  for (const u of [-0.95, 0, 0.95]) {
    S.tube([on(u, by - hh - 0.14, 0.3), on(u, by - hh - 0.05, 0.52)], 0.016, 0.016, M.iron, { res: 0.024 });
    S.ball(on(u, by - hh - 0.03, 0.55), [0.06, 0.045, 0.06], M.bulb, { res: 0.022, ghost: true });
  }
  // behind it: stays from the legs back to the roof, rails across its back, a ladder up one side
  for (const u of [-0.9, 0.9]) S.tube([on(u, by + hh * 0.5, -0.14), on(u, top + 0.04, -1.2)], 0.036, 0.036, M.iron, { res: 0.036 });
  for (const y of [by - hh * 0.55, by + hh * 0.55]) S.box(on(0, y, -0.09), [hw + 0.05, 0.035, 0.03], M.steel, { res: 0.036, ax: frameAx });
  for (const u of [-hw * 0.5, 0, hw * 0.5]) S.box(on(u, by, -0.09), [0.03, hh + 0.05, 0.03], M.steel, { res: 0.036, ax: frameAx });
  for (const du of [-0.13, 0.13]) S.tube([on(1.2 + du, top + 0.03, -0.24), on(1.2 + du, by + hh + 0.1, -0.24)], 0.02, 0.02, M.steel, { res: 0.026 });
  for (let y = top + 0.25; y < by + hh + 0.05; y += 0.23) S.tube([on(1.07, y, -0.24), on(1.33, y, -0.24)], 0.015, 0.015, M.steel, { res: 0.022 });
  // and on the roof behind it, where the street cannot see: what whoever had the lowrider left
  stash(ctx, on(0.2, top + 0.03, -0.85), yaw);
  // the flamingo: one line of pink tube on a frame, standing on one leg, on a mast at the corner of the roof
  const fx = 0.78, fz = -2.2, fy = 3.95;
  S.tube([[fx, top, fz - 0.06], [fx, fy + 1.35, fz - 0.06]], 0.045, 0.04, M.iron, { res: 0.036 });
  for (const y of [fy + 0.15, fy + 1.2]) S.tube([[fx - 0.5, y, fz - 0.06], [fx + 0.5, y, fz - 0.06]], 0.018, 0.018, M.iron, { res: 0.026 });
  const neon = (pts, mat, r = 0.034) => {
    S.tube(pts.map(([x, y]) => [fx + x, fy + y, fz]), r, r, mat, { res: 0.028, ghost: true, tag: 'flamingo' });
    S.tube(pts.map(([x, y]) => [fx + x, fy + y, fz]), r * 0.8, r * 0.8, M.trim, { res: 0.028 });   // the tube itself, for when it flickers out
  };
  neon([[0.02, 0.62], [-0.16, 0.7], [-0.36, 0.66], [-0.46, 0.5], [-0.38, 0.36], [-0.14, 0.32], [0.1, 0.4], [0.14, 0.56], [0.02, 0.62]], M.neonPink);   // the body
  neon([[0.1, 0.52], [0.26, 0.66], [0.3, 0.86], [0.2, 1.0], [0.16, 1.14], [0.24, 1.26], [0.38, 1.28]], M.neonPink);                                  // the neck, an S
  neon([[0.38, 1.28], [0.5, 1.22], [0.5, 1.1]], M.neonHot, 0.03);                                                                                     // head and bill
  neon([[-0.12, 0.33], [-0.1, 0.0]], M.neonPink, 0.028);                                                                                              // the leg it stands on
  neon([[-0.24, 0.34], [-0.34, 0.2], [-0.14, 0.14]], M.neonPink, 0.028);                                                                              // the one tucked up
  neon([[-0.22, 0.0], [0.04, 0.0]], M.neonCyan, 0.028);                                                                                               // the water it stands in
  // what else a flat roof collects: a vent, a tank on legs, a dish
  S.lathe([-0.4, top, -3.6], 0.42, [0.14, 0.14], M.steel, { res: 0.04 });
  S.lathe([-0.4, top + 0.42, -3.6], 0.1, [0.2, 0.08], M.steel, { res: 0.036 });
  S.box([-4.0, top + 0.26, -3.85], [0.3, 0.2, 0.34], M.steel, { res: 0.045, rd: 0.03 });
  for (let i = 0; i < 3; i++) S.box([-4.0, top + 0.18 + i * 0.1, -3.5], [0.24, 0.016, 0.012], M.iron, { res: 0.03 });
}
/* what somebody left on the roof: a holdall, its zip open on oranges and banknotes, and a cola. Made at its own
   middle on the ground, the bag along x. */
function stash(ctx, at, yaw) {
  const { S, B, M } = ctx;
  placed(S, at, yaw, xf => {
    S.tube([[-0.32, 0.2, 0], [0.32, 0.2, 0]], 0.2, 0.19, M.hide, { res: 0.026 });
    for (const x of [-0.2, 0.2]) S.torus([x, 0.2, 0], 0.2, 0.016, M.black, { res: 0.02, ax: S.AX });
    S.box([0, 0.39, 0], [0.24, 0.012, 0.06], M.black, { res: 0.02 });                                  // the zip, open
    for (const [x, y, z] of [[-0.12, 0.43, 0.01], [0.04, 0.45, -0.02], [0.17, 0.42, 0.02]]) S.ball([x, y, z], 0.08, M.orange, { res: 0.022 });
    for (const [x, a] of [[-0.26, 0.5], [-0.31, -0.3], [0.27, 0.9], [0.31, 0.1]]) S.box([x, 0.43, 0.03 * Math.sin(a * 5)], [0.075, 0.006, 0.04], M.leaf, { res: 0.014, ax: B.frame(a, 0.5, 0.35) });   // banknotes
    for (const [x, z, a] of [[0.64, 0.22, 0.4], [0.5, -0.32, 1.3], [-0.6, 0.3, 2.2]]) S.box([x, 0.012, z], [0.08, 0.006, 0.042], M.leaf, { res: 0.014, ax: B.frame(a, 0, 0) });          // some that got out
    // the cola: a red cup with a cream band, a lid, a straw
    const cup = { r: M.red.r, g: M.red.g, tex: (X, Y, Z, ny, t) => { const y = xf.inverse([X, Y, Z])[1]; return y > 0.1 && y < 0.17 ? S.pick([C.cream[2], C.cream[3]], clamp01(t)) : S.pick([C.red[1], C.red[2], C.red[3]], clamp01(t)); } };
    S.lathe([-0.64, 0, -0.18], 0.26, [0.07, 0.095], cup, { res: 0.02 });
    S.lathe([-0.64, 0.26, -0.18], 0.022, [0.1, 0.1], M.cream, { res: 0.02 });
    S.tube([[-0.64, 0.27, -0.18], [-0.62, 0.45, -0.2]], 0.013, 0.013, M.cream, { res: 0.014 });
  });
}
/* the billboard: her face in the sunglasses, and the cola's name. k dark ground, p pink, c cyan, w cream, y gold,
   o orange, g green, h hair, H light hair, s skin, S blush, b black, r red */
const BOARD_KEY = {
  k: C.dusk[0], p: C.pink[2], c: C.cyan[1], w: C.cream[3], y: C.gold[1], o: C.orange[2], g: C.green[2],
  h: C.hair[1], H: C.hair[3], s: C.skin[2], S: C.pink[2], b: C.black[0], r: C.red[2]
};
const BOARD = [
  'kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk',
  'kkkkkkgokkkkkkkkkkkkkkkkkkkkkkk',
  'kkkkkgooookkkkkkkkkkkkkkkkkkkkk',
  'kkhhkoooookhhkkkwwwkwwwkwwwkwkw',
  'khHhhhooohhhHhkkwkkkwkwkwkwkwkw',
  'khhhhhhhhhhhhhkkwkkkwwwkwwwkkwk',
  'kkhhHhhhhhHhhkkkwkkkwkwkwkkkkwk',
  'kkhhsssssssshhkkwwwkwkwkwkkkkwk',
  'kkhbbbbsbbbbbhkkkkkkkkkkkkkkkkk',
  'kkhbcbbsbbpbbhkkpppkpppkpkkkppp',
  'kkhsbbsssbbshhkkpkkkpkpkpkkkpkp',
  'kkhsSsssssSshhkkpkkkpkpkpkkkppp',
  'kkhhssrrssshhkkkpkkkpkpkpkkkpkp',
  'kkhhhsssshhhhkkkpppkpppkpppkpkp',
  'kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk'
];

/* ── the street's own furniture ─────────────────────────────────────────────────────────────────────────────────────*/
function street(ctx) {
  const { S, K, B, M } = ctx;
  const T = 0.09, zf = STORE.zf;
  // the street lamp at the corner, its head out over the crossing
  const lx = 1.86, lz = -0.8, [hx, hy, hz] = LAMP.street;
  S.lathe([lx, T, lz], 0.3, [0.15, 0.08], M.iron, { res: 0.04 });
  S.tube([[lx, T + 0.25, lz], [lx, hy + 0.05, lz]], 0.06, 0.045, M.iron, { res: 0.04 });
  S.tube([[lx, hy, lz], [lx + 0.1, hy + 0.36, lz + 0.06], [lx + 0.42, hy + 0.42, lz + 0.26], [hx, hy + 0.3, hz]], 0.038, 0.032, M.iron, { res: 0.034 });
  S.lathe([hx, hy + 0.02, hz], 0.18, [0.26, 0.08], M.iron, { res: 0.034 });
  S.ball([hx, hy, hz], [0.15, 0.07, 0.15], M.bulb, { res: 0.028, ghost: true });
  // the fruit stand that stood by the door, on its side now, and what was on it
  const sx = -0.92, sz = zf + 0.5;
  S.crate({ at: [sx, T + 0.02, sz], size: [0.42, 0.2, 0.28], mat: M.wood, edge: M.trunk });
  S.box([sx - 0.2, T + 0.3, sz + 0.3], [0.5, 0.02, 0.3], M.wood, { res: 0.04, ax: B.frame(0.3, 0.9, 0.2) });
  for (const [x, z] of [[-0.42, 0.02], [0.42, -0.05]]) S.tube([[sx + x, T, sz + z], [sx + x * 1.3, T + 0.5, sz + z + 0.35]], 0.022, 0.022, M.trunk, { res: 0.028 });
  for (const [x, y, z] of ORANGES) S.ball([x, y + 0.085, z], 0.085, M.orange, { res: 0.026 });
  // a supermarket trolley lying in the road, where whoever had it let go
  trolley(ctx, [-4.55, 0, 0.5], 0.5);
  // a pole with a wire across to the roof, and somebody's trainers hung on it by the laces
  const px = -5.05, pz = -0.88, wy = 4.9;
  S.tube([[px, T, pz], [px, wy + 0.5, pz]], 0.075, 0.055, M.trunk, { res: 0.045 });
  S.box([px, wy + 0.12, pz], [0.05, 0.04, 0.52], M.trunk, { res: 0.04 });
  for (const z of [-0.42, 0.42]) S.lathe([px, wy + 0.16, pz + z], 0.09, [0.035, 0.03], M.steel, { res: 0.026 });
  const wire = (z, to, sag) => { const pts = []; for (let i = 0; i <= 10; i++) { const t = i / 10; pts.push([px + (to[0] - px) * t, wy + 0.2 + (to[1] - wy - 0.2) * t - sag * Math.sin(Math.PI * t), pz + z + (to[2] - pz - z) * t]); } S.tube(pts, 0.011, 0.011, M.black, { res: 0.026 }); return pts; };
  wire(-0.42, [STORE.x0 + 0.3, STORE.top + 0.3, -3.6], 0.3);
  const front = wire(0.42, [STORE.x0 + 0.25, STORE.top + 0.3, STORE.zf - 0.25], 0.22), hang = front[4];
  for (const [dx, len, mat] of [[-0.06, 0.34, M.red], [0.07, 0.48, M.cream]]) {
    const tag = dx < 0 ? 'shoeA' : 'shoeB', x = hang[0] + dx, z = hang[2];
    S.tube([[x, hang[1], z], [x, hang[1] - len, z]], 0.008, 0.008, M.cream, { res: 0.02, tag });
    S.ball([x, hang[1] - len - 0.05, z + 0.03], [0.05, 0.05, 0.1], mat, { res: 0.022, tag });
    S.box([x, hang[1] - len - 0.095, z + 0.03], [0.05, 0.014, 0.105], M.cream, { res: 0.022, tag });
  }
  // a hedge on the far corner (something has been living in it), a hydrant, bin bags by the store's wall
  S.canopy({ at: [4.85, T + 0.42, -1.55], size: [0.52, 0.46, 0.95], lobes: 5, mat: M.leaf, cluster: 5, bump: 1.5, seed: 9 });
  S.lathe([4.7, T, 0.0], 0.34, [0.1, 0.085], M.red, { res: 0.034 });
  S.ball([4.7, T + 0.36, 0.0], [0.1, 0.07, 0.1], M.red, { res: 0.03 });
  for (const sgn of [-1, 1]) S.lathe([4.7 + sgn * 0.12, T + 0.22, 0.0], 0.07, [0.045, 0.045], M.red, { res: 0.026, ax: S.AX });
  for (const [x, z, s] of [[-4.2, -1.45, 1], [-3.75, -1.6, 0.76]]) {
    S.ball([x, T + 0.3 * s, z], [0.34 * s, 0.3 * s, 0.32 * s], M.black, { res: 0.045 });
    S.lathe([x + 0.03, T + 0.52 * s, z], 0.15 * s, [0.09 * s, 0.03 * s], M.black, { res: 0.028 });
  }
}
/* where the oranges ended up: [x, ground height, z]. By the stand, across the pavement, off the kerb, down the road */
const ORANGES = [
  [-1.25, 0.09, -1.0], [-0.62, 0.09, -0.95], [-1.05, 0.09, -1.2], [-0.3, 0.09, -0.8], [-0.95, 0.26, -1.42], [-1.7, 0.09, -0.85], [0.1, 0.09, -0.72],
  [-0.6, 0, -0.3], [1.7, 0, -0.1], [0.3, 0, 0.0], [2.25, 0, 0.35], [1.55, 0, 0.9], [-0.2, 0, 1.75], [0.6, 0, 1.6],
  [-1.6, 0, 2.3], [-2.95, 0, 2.5], [-1.95, 0, 2.75], [2.9, 0, 1.5], [-3.6, 0, 1.9], [0.1, 0, 3.1]
];

/* a wire trolley on its side: a basket of mesh in a frame of rod, a red handle, castors in the air. (Mesh drawn rod by
   rod is noise at this size: each side is one thin sheet, and its material leaves out the holes.) */
function trolley({ S, B, M }, at, yaw) {
  placed(S, at, yaw, xf => {
    const L = 0.6, Wd = 0.36, H = 0.38, y0 = 0.03;     // lying on its side: what was up now runs along z
    const mesh = axis => ({ r: [C.steel[0], C.steel[1], C.steel[2]], tex: (X, Y, Z, ny, t) => {
      const [x, y, z] = xf.inverse([X, Y, Z]), a = axis === 'x' ? y : x, b = axis === 'z' ? y : z;
      const on = ((a / 0.1) % 1 + 1) % 1 < 0.3 || ((b / 0.1) % 1 + 1) % 1 < 0.3;
      return on ? S.pick([C.steel[0], C.steel[1], C.steel[1], C.steel[2]], clamp01(t)) : -1;
    } });
    for (const y of [y0, y0 + Wd]) S.box([0, y, H / 2], [L / 2, 0.008, H / 2], mesh('y'), { res: 0.022, ghost: true });
    for (const x of [-L / 2, L / 2]) S.box([x, y0 + Wd / 2, H / 2], [0.008, Wd / 2, H / 2], mesh('x'), { res: 0.022, ghost: true });
    S.box([0, y0 + Wd / 2, 0], [L / 2, Wd / 2, 0.008], mesh('z'), { res: 0.022, ghost: true });
    const rod = (a, b, r = 0.02, mat = M.steel) => S.tube([a, b], r, r, mat, { res: 0.024 });
    for (const z of [0, H]) for (const y of [y0, y0 + Wd]) rod([-L / 2, y, z], [L / 2, y, z]);
    for (const z of [0, H]) for (const x of [-L / 2, L / 2]) rod([x, y0, z], [x, y0 + Wd, z]);
    for (const x of [-L / 2, L / 2]) for (const y of [y0, y0 + Wd]) rod([x, y, 0], [x, y, H]);
    for (const y of [y0, y0 + Wd]) rod([-L / 2, y, H], [-L / 2 - 0.16, y, H + 0.16]);
    rod([-L / 2 - 0.16, y0, H + 0.16], [-L / 2 - 0.16, y0 + Wd, H + 0.16], 0.028, M.red);
    for (const x of [-L / 2 + 0.08, L / 2 - 0.08]) for (const y of [y0 + 0.04, y0 + Wd - 0.04]) {
      rod([x, y, 0], [x, y, -0.12], 0.016, M.iron);
      S.torus([x, y, -0.15], 0.045, 0.024, M.black, { res: 0.022 });
    }
  });
}

/* ── the alley ──────────────────────────────────────────────────────────────────────────────────────────────────────
   What is kept round the back of a store: a skip with one lid up, the bags that did not fit, crates from the fruit
   man; a second street lamp where the alley meets the side street, and a mail box under it. */
function alley(ctx) {
  const { S, K, B, M } = ctx;
  const T = 0.09, zb = STORE.zb;
  // the skip: against the wall under the small window, its front to the alley; one lid shut, one thrown back, full
  placed(S, [-3.62, T, zb - 0.38], 0, () => {
    S.box([0, 0.42, 0], [0.56, 0.36, 0.3], M.hide, { res: 0.04, rd: 0.03 });
    for (const x of [-0.3, 0.3]) S.box([x, 0.42, -0.305], [0.04, 0.3, 0.02], M.hide, { res: 0.034 });
    S.box([0, 0.76, -0.3], [0.58, 0.035, 0.035], M.hide, { res: 0.034 });
    S.box([-0.28, 0.8, 0], [0.29, 0.02, 0.31], M.black, { res: 0.034 });
    S.box([0.28, 1.06, 0.33], [0.29, 0.02, 0.3], M.black, { res: 0.034, ax: B.frame(0, -1.35, 0) });
    for (const [x, y, z, r] of [[0.16, 0.84, -0.05, 0.17], [0.38, 0.8, 0.08, 0.15], [0.3, 0.9, -0.12, 0.12]]) S.ball([x, y, z], [r, r * 0.8, r], M.black, { res: 0.034 });
    for (const [x, z] of [[-0.45, -0.24], [0.45, -0.24], [-0.45, 0.24], [0.45, 0.24]]) S.ball([x, 0.03, z], 0.05, M.black, { res: 0.024 });
  });
  for (const [x, z, k] of [[-2.9, zb - 0.3, 0.9], [-4.3, zb - 0.34, 0.7]]) {
    S.ball([x, T + 0.3 * k, z], [0.34 * k, 0.3 * k, 0.32 * k], M.black, { res: 0.045 });
    S.lathe([x + 0.03, T + 0.52 * k, z], 0.15 * k, [0.09 * k, 0.03 * k], M.black, { res: 0.028 });
  }
  // crates from the fruit man, stacked on the corner of the block by the side street; some of what was in them
  const kx = 1.72, kz = zb - 0.22;
  S.crate({ at: [kx, T + 0.01, kz], size: [0.3, 0.14, 0.24], mat: M.wood, edge: M.trunk });
  S.crate({ at: [kx + 0.04, T + 0.29, kz + 0.02], size: [0.3, 0.14, 0.24], mat: M.wood, edge: M.trunk });
  S.crate({ at: [kx - 0.05, T + 0.01, kz + 0.56], size: [0.3, 0.14, 0.24], mat: M.wood, edge: M.trunk });
  for (const [dx, dy, dz] of [[-0.14, 0, -0.08], [0.1, 0, -0.1], [0, 0, 0.1], [0.16, 0, 0.08], [-0.16, 0, 0.1], [0.02, 0.1, 0]]) S.ball([kx + 0.04 + dx, T + 0.62 + dy, kz + 0.02 + dz], 0.085, M.orange, { res: 0.026 });
  for (const [x, z] of [[1.2, -5.5], [2.0, -5.9], [0.75, -5.3], [2.75, -6.9]]) S.ball([x, 0.085, z], 0.085, M.orange, { res: 0.026 });
  // the second street lamp, on the far pavement, its head out over where the alley comes in
  const lx = 4.62, lz = -6.55, [hx, hy, hz] = LAMP.rear;
  S.lathe([lx, T, lz], 0.3, [0.15, 0.08], M.iron, { res: 0.04 });
  S.tube([[lx, T + 0.25, lz], [lx, hy + 0.05, lz]], 0.06, 0.045, M.iron, { res: 0.04 });
  S.tube([[lx, hy, lz], [lx - 0.12, hy + 0.36, lz + 0.03], [lx - 0.55, hy + 0.42, lz + 0.15], [hx, hy + 0.3, hz]], 0.038, 0.032, M.iron, { res: 0.034 });
  S.lathe([hx, hy + 0.02, hz], 0.18, [0.26, 0.08], M.iron, { res: 0.034 });
  S.ball([hx, hy, hz], [0.15, 0.07, 0.15], M.bulb, { res: 0.028, ghost: true });
  // a mail box under it
  S.box([4.75, T + 0.54, -5.45], [0.2, 0.3, 0.2], M.blue, { res: 0.036, rd: 0.09 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) S.tube([[4.75 + sx * 0.14, T, -5.45 + sz * 0.14], [4.75 + sx * 0.14, T + 0.28, -5.45 + sz * 0.14]], 0.022, 0.022, M.blue, { res: 0.026 });
  S.box([4.54, T + 0.64, -5.45], [0.012, 0.03, 0.13], M.black, { res: 0.022 });
}

/* ── palms ──────────────────────────────────────────────────────────────────────────────────────────────────────────
   A leaning trunk ringed with old leaf scars, and a crown of fronds, each a few flat blades end to end along a curve
   that rises from the top and falls away. Every frond has its own name: the puppet swings it. */
const PALMS = [
  { id: 'A', at: [-4.95, -3.45], h: 6.3, lean: [-0.75, 0.25], fronds: 11, len: 2.0, seed: 3 },
  { id: 'B', at: [4.8, -0.25], h: 5.3, lean: [0.55, 0.3], fronds: 10, len: 1.75, seed: 8 },
  { id: 'C', at: [4.95, -3.7], h: 4.4, lean: [0.3, -0.25], fronds: 9, len: 1.5, seed: 13 },
  { id: 'D', at: [-5.0, -4.85], h: 5.0, lean: [-0.4, -0.65], fronds: 10, len: 1.7, seed: 21 }
];
const palmTop = p => [p.at[0] + p.lean[0], p.h, p.at[1] + p.lean[1]];
function palms(ctx) {
  const { S, K, B, M } = ctx;
  for (const p of PALMS) {
    let seed = p.seed * 7919;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    const top = palmTop(p), pts = [];
    for (let i = 0; i <= 6; i++) { const t = i / 6, k = t * t; pts.push([p.at[0] + p.lean[0] * k, 0.09 + (p.h - 0.09) * t, p.at[1] + p.lean[1] * k]); }
    const rings = { r: M.trunk.r, g: M.trunk.g, mod: (x, y) => (Math.floor(y / 0.17) % 2 ? -0.09 : 0.03) };
    S.tube(pts, t => 0.2 - 0.09 * Math.min(1, t * 1.6), 0, rings, { res: 0.045 });
    S.lathe([p.at[0], 0.09, p.at[1]], 0.16, [0.3, 0.2], M.trunk, { res: 0.045 });
    S.ball([top[0], top[1] + 0.02, top[2]], [0.2, 0.2, 0.2], M.trunk, { res: 0.04 });
    for (let k = 0; k < 3; k++) { const a = rnd() * TAU; S.ball([top[0] + Math.cos(a) * 0.17, top[1] - 0.2, top[2] + Math.sin(a) * 0.17], 0.1, M.wood, { res: 0.032 }); }
    for (let f = 0; f < p.fronds; f++) {
      const a = (f / p.fronds) * TAU + rnd() * 0.35, len = p.len * (0.82 + 0.36 * rnd()), rise = 0.25 + 0.5 * rnd(), droop = 1.0 + 0.7 * rnd();
      const dir = [Math.cos(a), Math.sin(a)], at = s => { const u = s * len; return [top[0] + dir[0] * u * (1 - 0.18 * s * s), top[1] + 0.08 + rise * u * 0.8 - droop * s * s * len * 0.52, top[2] + dir[1] * u * (1 - 0.18 * s * s)]; };
      const N = 4, tag = 'palm' + p.id + f;
      for (let k = 0; k < N; k++) {
        const s0 = k / N, s1 = (k + 1) / N, a0 = at(s0), a1 = at(s1), mid = a0.map((v, i) => (v + a1[i]) / 2);
        const U = norm([a1[0] - a0[0], a1[1] - a0[1], a1[2] - a0[2]]), Wd = norm([-dir[1], 0, dir[0]]);
        const V = norm([U[1] * Wd[2] - U[2] * Wd[1], U[2] * Wd[0] - U[0] * Wd[2], U[0] * Wd[1] - U[1] * Wd[0]]);
        const half = Math.hypot(a1[0] - a0[0], a1[1] - a0[1], a1[2] - a0[2]) / 2, wide = 0.3 * Math.sin(Math.PI * (0.12 + 0.8 * (s0 + s1) / 2)) + 0.05;
        // (darker lines across a blade, a few pixels apart: its leaflets)
        const blade = { r: M.leaf.r, g: M.leaf.g, mod: (x, y, z) => (Math.floor(((x - top[0]) * dir[0] + (z - top[2]) * dir[1]) / 0.085) % 2 ? -0.12 : 0.02) };
        S.ball(mid, [half * 1.18, 0.035, wide], blade, { res: 0.042, ax: [U, V.map(v => -v), Wd], tag });
      }
      S.tube([at(0), at(0.33), at(0.66), at(1)], 0.028, 0.012, M.trunk, { res: 0.03, tag });
    }
  }
}


/* a wheel in its own space: its axle along z, `out` the side that shows (+1 or -1) */
function wheel(S, M, c, r, out, rim, cap) {
  S.torus(c, r - 0.1, 0.1, M.black, { res: 0.036, ax: S.AZ });
  S.torus([c[0], c[1], c[2] + out * 0.075], r - 0.14, 0.032, M.cream, { res: 0.028, ax: S.AZ });
  S.lathe([c[0], c[1], c[2] + (out > 0 ? 0.02 : -0.08)], 0.06, [r - 0.17, r - 0.17], rim, { res: 0.03, ax: S.AZ });
  S.ball([c[0], c[1], c[2] + out * 0.09], [0.07, 0.07, 0.04], cap, { res: 0.024 });
}

/* ── the lowrider ───────────────────────────────────────────────────────────────────────────────────────────────────
   Long, low and flat, in candy purple: fins, chrome at both ends, gold wire wheels in white-wall tyres, no roof, white
   seats, the back one loaded with crates of oranges. It is made nose to +x and stood nose to the left. All of it but the
   wheels is one part, 'carBody', which the puppet rocks on the back axle. */
const CAR_AXLE = [-1.38, 0.36, 0];
function lowrider(ctx) {
  const { S, K, B, M } = ctx;
  placed(S, CAR.at, CAR.yaw, xf => {
    const body = { tag: 'carBody' }, held = { hold: true };
    // the shell, the cabin scooped out of it, a well for each wheel
    S.join('cut', S.box([0, 0.5, 0], [2.2, 0.3, 0.88], M.purple, { ...held, rd: 0.1 }), [
      S.box([-0.3, 0.9, 0], [0.98, 0.3, 0.7], M.black, { ...held, rd: 0.06 }),
      ...[-1.38, 1.38].flatMap(x => [-1, 1].map(sd => S.lathe([x, 0.36, sd > 0 ? 0.5 : -0.9], 0.4, [0.44, 0.44], M.black, { ...held, ax: S.AZ })))
    ], { res: 0.044, r: 0.01, inner: M.black.r, ...body });
    // a ridge down the bonnet, fins at the back that rise as they go
    S.box([1.4, 0.8, 0], [0.75, 0.03, 0.2], M.purple, { res: 0.04, rd: 0.03, ...body });
    for (const sd of [-1, 1]) {
      S.box([-1.55, 0.85, sd * 0.8], [0.68, 0.085, 0.07], M.purple, { res: 0.036, rd: 0.03, ax: B.frame(0, 0, -0.14), ...body });
      S.ball([-2.2, 0.86, sd * 0.8], [0.06, 0.09, 0.06], { r: [C.red[3]], em: true }, { res: 0.022, ghost: true, ...body });     // tail lamps
      S.box([0, 0.5, sd * 0.888], [2.0, 0.02, 0.012], M.steel, { res: 0.03, ...body });                                         // a chrome spear along the side
      S.box([0, 0.775, sd * 0.86], [1.95, 0.016, 0.02], M.trim, { res: 0.03, ...body });                                        // and a pink line under the sill
      S.tube([[-1.9, 0.17, sd * 0.78], [1.9, 0.17, sd * 0.78]], 0.022, 0.022, M.neonPink, { res: 0.028, ghost: true, ...body }); // the neon under it
    }
    // chrome: grille and bumper in front, twin lamps each side; a bumper behind
    S.box([2.2, 0.5, 0], [0.04, 0.13, 0.5], M.steel, { res: 0.034, ...body });
    for (let i = 0; i < 6; i++) S.box([2.245, 0.5, -0.42 + i * 0.168], [0.01, 0.11, 0.022], M.iron, { res: 0.026, ...body });
    for (const sd of [-1, 1]) for (const z of [0.6, 0.76]) {
      S.torus([2.22, 0.56, sd * z], 0.07, 0.022, M.steel, { res: 0.022, ax: S.AX, ...body });
      S.ball([2.23, 0.56, sd * z], [0.03, 0.062, 0.062], M.bulb, { res: 0.022, ghost: true, ...body });
    }
    for (const x of [2.28, -2.28]) {
      S.box([x, 0.3, 0], [0.06, 0.065, 0.9], M.steel, { res: 0.034, rd: 0.04, ...body });
      for (const sd of [-1, 1]) S.ball([x + Math.sign(x) * 0.05, 0.32, sd * 0.42], [0.05, 0.09, 0.05], M.steel, { res: 0.026, ...body });
    }
    // the windscreen: chrome posts leaning back, a sheet of glass between them
    for (const sd of [-1, 1]) S.tube([[0.78, 0.78, sd * 0.78], [0.54, 1.26, sd * 0.72]], 0.03, 0.03, M.steel, { res: 0.028, ...body });
    S.tube([[0.54, 1.26, -0.72], [0.54, 1.26, 0.72]], 0.03, 0.03, M.steel, { res: 0.028, ...body });
    S.box([0.66, 1.02, 0], [0.012, 0.24, 0.72], M.glass, { res: 0.036, ax: B.frame(0, 0, 0.46), ...body });
    // inside: two white benches, the wheel on the left, and the back seat full of oranges
    for (const x of [0.12, -0.8]) {
      S.box([x, 0.64, 0], [0.2, 0.06, 0.64], M.cream, { res: 0.036, rd: 0.04, ...body });
      S.box([x - 0.2, 0.86, 0], [0.07, 0.19, 0.64], M.cream, { res: 0.036, rd: 0.05, ax: B.frame(0, 0, 0.16), ...body });
    }
    S.tube([[0.62, 0.78, -0.4], [0.42, 0.98, -0.4]], 0.02, 0.02, M.steel, { res: 0.022, ...body });
    S.torus([0.4, 1.0, -0.4], 0.13, 0.022, M.cream, { res: 0.022, ax: B.frame(0, 0, -0.9), ...body });
    for (const z of [-0.33, 0.33]) {
      S.crate({ at: [-0.72, 0.7, z], size: [0.26, 0.13, 0.24], mat: M.wood, edge: M.trunk });
      for (const [dx, dy, dz] of [[-0.12, 0, -0.1], [0.1, 0, -0.08], [-0.02, 0, 0.1], [0.14, 0, 0.12], [-0.14, 0, 0.12], [0, 0.11, 0], [0.1, 0.1, 0.06]])
        S.ball([-0.72 + dx, 1.02 + dy, z + dz], 0.085, M.orange, { res: 0.026, ...body });
    }
    // number plates: its own name, front and back
    const plate = (x, facing) => {
      S.box([x, 0.33, 0], [0.012, 0.085, 0.3], M.cream, { res: 0.026, ...body });
      decal(S, lettering('CAPY'), { at: [x + facing * 0.016, 0.33, 0], cell: 0.03, key: { '#': C.purple[1] }, face: 'x', flip: -facing, xf, tag: 'carBody' });
    };
    plate(2.35, 1); plate(-2.35, -1);
    // wheels: these stay on the road
    for (const x of [-1.38, 1.38]) for (const sd of [-1, 1]) wheel(S, M, [x, 0.36, sd * 0.78], 0.36, sd, M.gold, M.steel);
  });
}

/* ── the police car ─────────────────────────────────────────────────────────────────────────────────────────────────
   The whole of one, nosing out of the side street: white, a blue panel on bonnet and boot, a push bar, a bar of lamps
   on the roof. The lamps are made twice, lit and unlit, and the puppet shows one of each. Made nose to +x, stood nose
   to the camera. */
function police(ctx) {
  const { S, K, B, M } = ctx;
  placed(S, COP.at, COP.yaw, xf => {
    const held = { hold: true }, white = M.white;
    // the shell, a well for each wheel; the cabin on it
    const wells = [-1.4, 1.4].flatMap(x => [-1, 1].map(sd => S.lathe([x, 0.36, sd > 0 ? 0.48 : -0.88], 0.4, [0.44, 0.44], M.black, { ...held, ax: S.AZ })));
    S.join('cut', S.box([0, 0.52, 0], [2.12, 0.3, 0.86], white, { ...held, rd: 0.09 }), wells, { res: 0.044, r: 0.01, inner: M.black.r });
    S.box([-0.2, 1.08, 0], [0.77, 0.27, 0.74], white, { res: 0.044, rd: 0.1 });
    S.box([1.5, 0.83, 0], [0.56, 0.012, 0.6], M.blue, { res: 0.036 });     // a blue panel on the bonnet
    S.box([-1.6, 0.83, 0], [0.42, 0.012, 0.6], M.blue, { res: 0.036 });    // and one on the boot
    // glass: the windscreen and the back window leaning in, two windows in each side
    S.box([0.64, 1.07, 0], [0.02, 0.22, 0.66], M.glass, { res: 0.036, ax: B.frame(0, 0, 0.42) });
    S.box([-1.04, 1.07, 0], [0.02, 0.22, 0.66], M.glass, { res: 0.036, ax: B.frame(0, 0, -0.42) });
    for (const sd of [-1, 1]) for (const x of [0.17, -0.56]) S.box([x, 1.1, sd * 0.745], [0.3, 0.15, 0.012], M.glass, { res: 0.036 });
    // what it says on the doors and across the back, and a blue line along each side
    for (const sd of [-1, 1]) {
      decal(S, lettering('POLICE'), { at: [0.05, 0.62, sd * 0.868], cell: 0.042, key: { '#': C.blue[0] }, face: 'z', flip: sd, xf });
      S.box([0, 0.4, sd * 0.866], [0.92, 0.03, 0.01], M.blue, { res: 0.03 });
    }
    decal(S, lettering('POLICE'), { at: [-2.128, 0.66, 0], cell: 0.04, key: { '#': C.blue[0] }, face: 'x', flip: 1, xf });
    // in front: lamps and grille, a bumper, and the push bar before it
    S.box([2.12, 0.55, 0], [0.02, 0.1, 0.44], M.iron, { res: 0.03 });
    for (const sd of [-1, 1]) S.ball([2.11, 0.57, sd * 0.64], [0.03, 0.08, 0.13], M.bulb, { res: 0.024, ghost: true });
    S.box([2.14, 0.3, 0], [0.06, 0.07, 0.88], M.iron, { res: 0.034, rd: 0.04 });
    for (const sd of [-1, 1]) S.tube([[2.24, 0.2, sd * 0.3], [2.26, 0.82, sd * 0.3]], 0.03, 0.03, M.black, { res: 0.028 });
    for (const y of [0.42, 0.74]) S.tube([[2.25, y, -0.46], [2.25, y, 0.46]], 0.028, 0.028, M.black, { res: 0.028 });
    // behind: tail lamps, a plate, a bumper, an aerial on the boot
    for (const sd of [-1, 1]) S.ball([-2.115, 0.6, sd * 0.66], [0.03, 0.075, 0.14], { r: [C.red[3]], em: true }, { res: 0.024, ghost: true });
    S.box([-2.128, 0.4, 0], [0.012, 0.07, 0.24], M.cream, { res: 0.026 });
    S.box([-2.14, 0.3, 0], [0.06, 0.07, 0.88], M.iron, { res: 0.034, rd: 0.04 });
    S.tube([[-1.75, 0.82, 0.5], [-1.95, 1.7, 0.5]], 0.014, 0.01, M.black, { res: 0.02 });
    // the bar of lamps: red on the driver's side, blue on the other
    S.box([0.0, 1.38, 0], [0.11, 0.035, 0.62], M.black, { res: 0.03 });
    for (const [lamp, z, on, off] of [['Red', -0.31, C.red[3], M.bow], ['Blue', 0.31, C.blue[2], M.blue]]) {
      S.box([0.0, 1.47, z], [0.1, 0.06, 0.27], { r: [on], em: true }, { res: 0.026, rd: 0.03, ghost: true, tag: 'cop' + lamp + 'On' });
      S.box([0.0, 1.47, z], [0.097, 0.057, 0.267], off, { res: 0.026, rd: 0.03, tag: 'cop' + lamp + 'Off' });
    }
    S.box([0.0, 1.47, 0], [0.105, 0.065, 0.035], M.steel, { res: 0.026 });
    for (const x of [-1.4, 1.4]) for (const sd of [-1, 1]) wheel(S, M, [x, 0.36, sd * 0.76], 0.36, sd, M.iron, M.steel);
  });
}

/* ── the helicopter ─────────────────────────────────────────────────────────────────────────────────────────────────
   A small one, white over blue, a searchlight under its chin. One part, 'heli', with the two rotors hung on it. */
const HELI_AT = { hub: [-0.1, 0.9, 0], tail: [-2.28, 0.46, 0.11], lamp: [0.7, -0.5, 0] };
function helicopter(ctx) {
  const { S, K, B, M } = ctx;
  const xf = placed(S, HELI.at, HELI.yaw, xf => {
    const body = { tag: 'heli' };
    const skin = { r: M.white.r, tex: (X, Y, Z, ny, t) => { const y = Y - HELI.at[1]; return y < -0.14 ? S.pick([C.blue[0], C.blue[0], C.blue[1], C.blue[1], C.blue[2]], clamp01(t)) : y < -0.06 ? C.gold[1] : S.pick([C.cream[0], C.steel[1], C.steel[2], C.steel[3], C.cream[3]], clamp01(t)); } };
    S.ball([0.1, 0, 0], [0.9, 0.52, 0.5], skin, { res: 0.04, ...body });
    S.ball([0.52, 0.08, 0], [0.5, 0.4, 0.44], M.glass, { res: 0.036, ...body });   // the bubble
    S.box([-0.15, 0.5, 0], [0.42, 0.14, 0.26], M.steel, { res: 0.036, rd: 0.09, ...body });
    S.tube([[-0.6, 0.18, 0], [-2.3, 0.42, 0]], 0.17, 0.065, skin, { res: 0.036, ...body });
    S.box([-2.32, 0.66, 0], [0.15, 0.3, 0.03], M.blue, { res: 0.03, ax: B.frame(0, 0, 0.35), ...body });
    S.box([-1.95, 0.4, 0], [0.12, 0.02, 0.3], M.blue, { res: 0.03, ...body });
    // the skids
    for (const sd of [-1, 1]) {
      S.tube([[-0.55, -0.66, sd * 0.42], [0.75, -0.66, sd * 0.42], [0.95, -0.58, sd * 0.42]], 0.03, 0.03, M.iron, { res: 0.028, ...body });
      for (const x of [-0.3, 0.5]) S.tube([[x, -0.35, sd * 0.3], [x, -0.66, sd * 0.42]], 0.024, 0.024, M.iron, { res: 0.026, ...body });
    }
    // the searchlight under the chin, its lens downward
    S.ball(HELI_AT.lamp, [0.14, 0.14, 0.14], M.iron, { res: 0.026, ...body });
    S.ball([HELI_AT.lamp[0] + 0.03, HELI_AT.lamp[1] - 0.09, 0], [0.1, 0.07, 0.1], M.bulb, { res: 0.022, ghost: true, ...body });
    // the rotors: a mast and four blades over it; two small ones at the tail
    S.tube([[-0.1, 0.6, 0], [-0.1, 0.9, 0]], 0.04, 0.04, M.iron, { res: 0.028, ...body });
    S.ball(HELI_AT.hub, [0.1, 0.05, 0.1], M.iron, { res: 0.026, tag: 'heliRotor' });
    for (const yaw of [0, Math.PI / 2]) S.box(HELI_AT.hub, [1.75, 0.012, 0.075], M.black, { res: 0.04, ax: B.frame(yaw, 0, 0), tag: 'heliRotor' });
    S.box(HELI_AT.tail, [0.03, 0.34, 0.012], M.black, { res: 0.03, tag: 'heliTail' });
    S.box(HELI_AT.tail, [0.34, 0.03, 0.012], M.black, { res: 0.03, tag: 'heliTail' });
  });
  return xf;
}


/* ── her ────────────────────────────────────────────────────────────────────────────────────────────────────────────
   (Not in the scene as it stands: sculpted only when the controls say `people: true`. The stars and the searchlight
   that were hers are the lowrider's now, whether she is there or not.)
   Two heads high. Long brown hair that lightens to its ends, round ears, a mandarin with two leaves on top; a dark brown
   frock with puffed sleeves, a cream apron with a mandarin printed on it, a dark red bow at the throat and a bigger one
   behind; big amber eyes, a blush, a cat's small mouth. Tonight also: a gold chain with a mandarin on it, a cup of cola
   in one hand, a holdall of oranges and banknotes over the other shoulder, and a water pistol in the apron pocket.
   She is made at her own feet, facing +z. What is on her head is one part ('girlHead'); the forearm with the cup is
   another ('girlSip'). */
const GIRL_AT = { neck: [0, 0.98, 0], elbow: [0.37, 0.71, 0.07], crown: [0, 1.2, 0.02] };
/* an eye: where its middle is on her (x to either side); half the width, height and depth of the lens it is painted
   on, and half the width and height it is seen to have from in front; and its colours */
const EYE = { x: 0.148, y: 1.108, z: 0.33, half: [0.074, 0.088, 0.034], seen: [0.068, 0.086], dark: C.cocoa[0], deep: C.orange[0], iris: C.orange[1], low: C.orange[2], light: C.glow[2] };
function girl(ctx) {
  const { S, K, B, M } = ctx;
  const { skin, hair, tips, frock, bow } = M, holdall = M.hide;
  placed(S, GIRL.at, GIRL.yaw, xf => {
    const own = (X, Y, Z) => xf.inverse([X, Y, Z])[1];   // how high a place is on her, in her own measure
    const fine = { res: 0.022 }, head = { res: 0.02, tag: 'girlHead' }, sip = { res: 0.02, tag: 'girlSip' };
    for (const s of [-1, 1]) {
      // shoe, sock with its turned-over top, a short leg
      S.ball([s * 0.11, 0.055, 0.035], [0.085, 0.055, 0.135], frock, fine);
      S.tube([[s * 0.11, 0.08, 0], [s * 0.105, 0.25, 0]], 0.064, 0.062, M.cream, fine);
      S.torus([s * 0.105, 0.25, 0], 0.062, 0.018, M.cream, { res: 0.018 });
      S.tube([[s * 0.105, 0.25, 0], [s * 0.1, 0.46, 0]], 0.056, 0.066, skin, fine);
    }
    // the skirt: a bell, with a dark red line near the hem and a cream frill under it
    const hem = 0.39, waist = 0.75, bell = t => 0.2 + 0.24 * Math.pow(1 - t, 0.75);
    const cloth = { r: frock.r, g: frock.g, tex: (X, Y, Z, ny, t) => { const y = own(X, Y, Z); return y < hem + 0.045 ? S.pick(M.cream.r, clamp01(t)) : y < hem + 0.085 ? S.pick(bow.r, clamp01(t)) : S.pick(frock.r, clamp01(t)); } };
    S.lathe([0, hem, 0], waist - hem, bell, cloth, { res: 0.024 });
    for (let i = 0; i < 18; i++) { const a = (i / 18) * TAU; S.ball([Math.cos(a) * 0.435, hem - 0.005, Math.sin(a) * 0.435], [0.05, 0.035, 0.05], M.cream, { res: 0.02 }); }
    // body, puffed sleeves, collar
    S.ball([0, 0.85, 0], [0.19, 0.17, 0.15], frock, fine);
    for (const s of [-1, 1]) {
      S.ball([s * 0.25, 0.9, 0], [0.115, 0.105, 0.11], frock, fine);
      S.torus([s * 0.3, 0.83, 0.01], 0.06, 0.022, M.cream, { res: 0.018, ax: B.frame(0, 0, s * 0.5) });
      S.ball([s * 0.075, 0.965, 0.09], [0.085, 0.032, 0.075], M.cream, { res: 0.018 });
    }
    // the apron: a bib, a band, and a rounded skirt of it with a frill and the mandarin on it; its pocket, and what is in that
    S.box([0, 0.83, 0.14], [0.1, 0.085, 0.025], M.cream, { res: 0.02, rd: 0.02 });
    S.torus([0, waist, 0], 0.2, 0.028, M.cream, { res: 0.02 });
    S.ball([0, 0.6, 0.255], [0.215, 0.185, 0.13], M.cream, fine);
    for (let i = 0; i <= 10; i++) { const a = Math.PI * (1.08 + (0.84 * i) / 10); S.ball([Math.cos(a) * 0.215, 0.6 + Math.sin(a) * 0.185, 0.285 + 0.05 * Math.sin(a) ** 2], [0.04, 0.04, 0.03], M.cream, { res: 0.018 }); }
    S.ball([-0.03, 0.6, 0.385], [0.06, 0.058, 0.02], M.orange, { res: 0.016 });
    S.ball([-0.015, 0.665, 0.378], [0.03, 0.016, 0.012], M.leaf, { res: 0.012 });
    S.box([0.13, 0.56, 0.365], [0.055, 0.05, 0.02], M.cream, { res: 0.016, rd: 0.01 });
    S.box([0.135, 0.66, 0.385], [0.028, 0.07, 0.022], M.orange, { res: 0.016, rd: 0.01 });
    S.box([0.175, 0.725, 0.385], [0.07, 0.026, 0.022], M.orange, { res: 0.016, rd: 0.01 });
    S.ball([0.25, 0.725, 0.385], 0.022, M.leaf, { res: 0.012 });
    // the bow at her throat, and the chain over it with its mandarin
    for (const s of [-1, 1]) {
      S.ball([s * 0.07, 0.93, 0.17], [0.07, 0.045, 0.035], bow, { res: 0.018 });
      S.tube([[s * 0.01, 0.915, 0.18], [s * 0.05, 0.82, 0.185]], 0.026, 0.02, bow, { res: 0.018 });
    }
    S.ball([0, 0.93, 0.185], 0.03, bow, { res: 0.016 });
    S.torus([0, 0.87, 0.1], 0.155, 0.02, M.gold, { res: 0.018, ax: B.frame(0, 1.05, 0) });
    S.ball([0, 0.735, 0.22], 0.042, M.orange, { res: 0.016 });
    // the big bow behind, its tails down over the skirt
    for (const s of [-1, 1]) {
      S.ball([s * 0.15, 0.78, -0.22], [0.15, 0.095, 0.05], bow, { res: 0.02, ax: B.frame(0, 0, s * 0.25) });
      S.tube([[s * 0.03, 0.74, -0.24], [s * 0.1, 0.56, -0.36], [s * 0.13, 0.44, -0.43]], 0.055, 0.04, bow, { res: 0.02 });
    }
    S.ball([0, 0.76, -0.24], 0.05, bow, { res: 0.018 });
    // her right arm, up to the strap on her shoulder; and the holdall hung from it down her back, its zip open
    S.tube([[-0.27, 0.87, 0], [-0.39, 0.75, 0.1], [-0.27, 0.97, 0.13]], 0.05, 0.047, skin, fine);
    S.ball([-0.27, 0.98, 0.135], 0.06, skin, { res: 0.018 });
    S.tube([[-0.27, 0.99, 0.15], [-0.31, 1.04, 0.02], [-0.42, 1.04, -0.16], [-0.5, 0.98, -0.26]], 0.02, 0.02, M.black, { res: 0.018 });
    S.tube([[-0.56, 1.0, -0.2], [-0.26, 0.6, -0.44]], 0.175, 0.165, holdall, { res: 0.024 });
    for (const f of [0.22, 0.78]) S.torus([-0.56 + 0.3 * f, 1.0 - 0.4 * f, -0.2 - 0.24 * f], 0.172, 0.014, M.black, { res: 0.018, ax: B.frame(0.9, 0.62, 0) });
    for (const [x, y, z] of [[-0.6, 1.12, -0.17], [-0.5, 1.15, -0.25], [-0.66, 1.07, -0.27]]) S.ball([x, y, z], 0.075, M.orange, { res: 0.02 });
    for (const [x, y, z, a] of [[-0.56, 1.2, -0.14, 0.4], [-0.68, 1.15, -0.2, -0.5], [-0.46, 1.18, -0.3, 1.1]]) S.box([x, y, z], [0.07, 0.006, 0.034], M.leaf, { res: 0.014, ax: B.frame(a, 0.5, 0.3) });
    // her left arm: down to the elbow, and from there the forearm, the hand and the cup, which the puppet lifts
    S.tube([[0.27, 0.87, 0], GIRL_AT.elbow], 0.05, 0.048, skin, fine);
    S.tube([GIRL_AT.elbow, [0.31, 0.8, 0.26]], 0.048, 0.046, skin, sip);
    S.ball([0.31, 0.81, 0.27], 0.058, skin, sip);
    const cup = { r: [C.red[1], C.red[2], C.red[3]], g: [C.red[2], C.red[3], C.red[3]], tex: (X, Y, Z, ny, t) => { const y = own(X, Y, Z); return y > 0.84 && y < 0.9 ? S.pick([C.cream[2], C.cream[3]], clamp01(t)) : S.pick([C.red[1], C.red[2], C.red[3]], clamp01(t)); } };
    S.lathe([0.31, 0.75, 0.33], 0.22, [0.058, 0.08], cup, sip);
    S.lathe([0.31, 0.97, 0.33], 0.02, [0.086, 0.086], M.cream, sip);
    S.tube([[0.31, 0.98, 0.33], [0.29, 1.13, 0.32]], 0.012, 0.012, M.cream, { res: 0.014, tag: 'girlSip' });
    // the head: hair all over it, and the face standing a little proud of the hair in front
    S.ball([0, 1.24, -0.03], [0.385, 0.37, 0.385], hair, head);
    S.ball([0, 1.17, 0.07], [0.32, 0.31, 0.31], skin, head);
    for (const [x, len] of [[-0.24, 0.13], [-0.13, 0.17], [-0.01, 0.15], [0.11, 0.18], [0.23, 0.13]])   // a fringe, down to her eyes
      S.tube([[x * 0.9, 1.47, 0.24], [x, 1.4, 0.345 - Math.abs(x) * 0.25], [x * 1.04, 1.4 - len, 0.375 - Math.abs(x) * 0.34]], 0.07, 0.045, hair, head);
    for (const s of [-1, 1]) {
      // a lock down each side of the face; an ear, lighter inside
      S.tube([[s * 0.31, 1.3, 0.14], [s * 0.345, 1.08, 0.17]], 0.075, 0.062, hair, head);
      S.tube([[s * 0.345, 1.08, 0.17], [s * 0.31, 0.9, 0.2], [s * 0.335, 0.74, 0.19]], 0.062, 0.04, tips, head);
      S.ball([s * 0.27, 1.51, -0.03], [0.115, 0.115, 0.07], hair, head);
      S.ball([s * 0.265, 1.505, 0.025], [0.065, 0.065, 0.03], tips, { ...head, res: 0.016 });
    }
    // the hair down her back: one mass, then waves of it, lighter the lower they go
    S.ball([0, 0.98, -0.21], [0.4, 0.42, 0.22], hair, head);
    for (let i = 0; i < 9; i++) {
      const a = Math.PI * (1.02 + (0.96 * i) / 8), cx = Math.cos(a), cz = Math.sin(a), wave = i % 2 ? 0.05 : -0.05;
      S.tube([[cx * 0.3, 1.0, cz * 0.24 - 0.06], [cx * (0.38 + wave), 0.82, cz * 0.3 - 0.1], [cx * (0.42 - wave), 0.67, cz * 0.33 - 0.12], [cx * (0.4 + wave), 0.55, cz * 0.33 - 0.13]], 0.105, 0.05, tips, head);
    }
    // the mandarin: a stalk, two leaves
    S.ball([0, 1.665, 0], [0.14, 0.125, 0.14], M.orange, head);
    S.tube([[0, 1.78, 0], [0.01, 1.83, 0]], 0.016, 0.014, M.leaf, { res: 0.012, tag: 'girlHead' });
    for (const s of [-1, 1]) S.ball([s * 0.075, 1.825, 0.01], [0.085, 0.022, 0.05], M.leaf, { res: 0.016, ax: B.frame(0, 0, s * 0.45), tag: 'girlHead' });
    // her eyes: big, round and amber, a light in each. Each is painted on a shallow lens of its own that lies on the
    // face, turned the way the face is turned there; what is painted is laid out as it is seen from in front of her,
    // which is where a face is drawn for. (They are made as things that glow only so that the page leaves their
    // colours as they are under the searchlight and the flashing lamps.)
    for (const s of [-1, 1]) {
      const c = [s * EYE.x, EYE.y, EYE.z];
      const eye = {
        r: [EYE.dark], em: true,
        tex: (X, Y, Z) => {
          const p = xf.inverse([X, Y, Z]), u = (p[0] - c[0]) / EYE.seen[0], v = (p[1] - c[1]) / EYE.seen[1];
          if (Math.hypot(u + 0.36, v - 0.2) < 0.25) return EYE.light;                // the light in it: to the same side in both
          if (v > 0.4) return EYE.dark;                                             // the lid's line, and the lashes
          if (Math.hypot(u, v) > 0.85 && v > -0.4) return EYE.dark;                 // its rim, left open underneath
          if (Math.hypot(u / 0.42, (v - 0.08) / 0.46) < 1) return EYE.dark;         // the pupil
          return v > 0 ? EYE.deep : v > -0.5 ? EYE.iris : EYE.low;                  // the iris, lighter the lower
        }
      };
      S.ball(c, EYE.half, eye, { res: 0.011, ghost: true, ax: B.frame(s * 0.46, 0.18, 0), tag: 'girlHead' });
      // a blush on the cheek under it, lying on the cheek as the eye does
      S.ball([s * 0.204, 0.997, 0.245], [0.05, 0.028, 0.014], { r: [C.pink[2]], em: true }, { res: 0.012, ghost: true, ax: B.frame(s * 0.83, 0.59, 0), tag: 'girlHead' });
      // her mouth: small, a cat's, half of it to each side
      S.tube([[s * 0.032, 1.006, 0.352], [s * 0.017, 0.994, 0.346], [0, 1.004, 0.353]], 0.007, 0.007, bow, { res: 0.008, tag: 'girlHead' });
    }
  }, GIRL.scale);
}

/* ── the stars ──────────────────────────────────────────────────────────────────────────────────────────────────────
   Five in a row over the lowrider, each rocking on its own, three lit; they jump when it does. The fourth is made lit
   and unlit, to come and go. Each has a dark star a little bigger behind its face, front and back: an outline,
   whatever is behind it. */
const STARS = [-1.1, -0.55, 0, 0.55, 1.1];
function stars(ctx) {
  const { S, K, M } = ctx;
  const star = K.poly2.star(5, 0.24, 0.11, Math.PI / 2), rim = K.poly2.star(5, 0.31, 0.155, Math.PI / 2);
  STARS.forEach((x, i) => {
    const c = [STARS_AT[0] + x, STARS_AT[1], STARS_AT[2]];
    for (const kind of i < 3 ? [''] : i === 3 ? ['On', 'Off'] : ['']) {
      const tag = 'star' + i + kind, lit = i < 3 || kind === 'On';
      S.extrude(rim, c, 0.05, M.black, { res: 0.024, tag });
      S.extrude(star, c, 0.09, lit ? { r: [C.gold[2]], em: true } : M.rock, { res: 0.022, rd: 0.012, ...(lit && { ghost: true }), tag });
    }
  });
}


/* ── the alligator ──────────────────────────────────────────────────────────────────────────────────────────────────
   It comes out of the hedge on the far corner, takes the crossing, and walks into the store. Made nose to +x at its own
   middle, low to the ground; stood at the start of its walk, nose to the left. One part ('gator') that the puppet takes
   along GATOR_PATH, with its jaw and two lengths of tail hung on it. */
const GATOR = { at: [5.0, 0, -1.25], yaw: Math.PI };
const GATOR_AT = { jaw: [0.68, 0.1, 0], tail: [[-0.45, 0.16, 0], [-0.9, 0.12, 0.04]] };
/* where it is and when: [seconds, x, z, how big]. It starts small inside the hedge and ends small deep in the doorway,
   because neither is big enough to hide all of it */
const GATOR_PATH = [
  [0, 5.0, -1.25, 0.5], [3, 4.3, -1.25, 1], [15.5, 2.05, -1.25, 1], [18.5, 1.3, -1.2, 1], [21.5, 1.25, -1.2, 1],
  [25.5, 0.45, -1.32, 1], [28.5, -0.05, -1.85, 1], [32, -0.05, -2.75, 0.55], [33, -0.05, -3.0, 0.3]
];
/* where the walk has got to at time t: place, heading (radians from its starting one), size, and whether it is to be seen */
function stroll(t) {
  const u = wrap(t), P = GATOR_PATH, last = P[P.length - 1];
  if (u >= last[0]) return { at: [last[1], last[2]], turn: -Math.PI / 2, size: last[3], show: 0, pace: 0 };
  let k = 0;
  while (u >= P[k + 1][0]) k++;
  const f = smooth((u - P[k][0]) / (P[k + 1][0] - P[k][0])), mix = i => P[k][i] + (P[k + 1][i] - P[k][i]) * f;
  // its heading: the way it is going, eased from the way it was going on the stretch before
  const way = i => Math.atan2(-(P[i + 1][2] - P[i][2]), P[i + 1][1] - P[i][1]);       // (the angle about y that turns +x that way)
  const here = way(k), was = k ? way(k - 1) : here, moved = Math.hypot(P[k + 1][1] - P[k][1], P[k + 1][2] - P[k][2]);
  const ease = smooth(Math.min(1, (u - P[k][0]) / 1.2)), head = moved < 0.2 ? was : was + shortest(was, here) * ease;
  return { at: [mix(1), mix(2)], turn: head - Math.PI, size: mix(3), show: 1, pace: moved < 0.2 ? 0 : 1, y: mix(1) < SIDE.x0 + 0.1 ? 0.09 * smooth((SIDE.x0 + 0.1 - mix(1)) / 0.3) : 0 };
}
const shortest = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
function alligator(ctx) {
  const { S, K, B, M } = ctx;
  const hide = M.hide, belly = M.leaf;
  placed(S, GATOR.at, GATOR.yaw, xf => {
    const body = { res: 0.026, tag: 'gator' };
    S.ball([0, 0.17, 0], [0.52, 0.15, 0.21], hide, body);
    S.ball([0.6, 0.17, 0], [0.24, 0.12, 0.17], hide, body);
    S.ball([0.93, 0.15, 0], [0.26, 0.055, 0.11], hide, body);                     // the top of the snout
    S.ball([1.14, 0.19, 0], [0.05, 0.035, 0.07], hide, body);                     // nostrils
    for (let i = 0; i < 9; i++) S.ball([-0.42 + i * 0.11, 0.31 - 0.02 * Math.abs(i - 4), 0], [0.05, 0.04, 0.09], hide, { res: 0.02, tag: 'gator' });
    for (const sd of [-1, 1]) {
      S.ball([0.56, 0.28, sd * 0.1], 0.055, hide, { res: 0.018, tag: 'gator' });
      S.ball([0.6, 0.285, sd * 0.13], [0.022, 0.03, 0.022], { r: [C.gold[2]], em: true }, { res: 0.012, ghost: true, tag: 'gator' });
      for (const x of [0.32, -0.3]) {
        S.tube([[x, 0.14, sd * 0.16], [x + 0.03, 0.09, sd * 0.32], [x + 0.08, 0.03, sd * 0.36]], 0.055, 0.045, hide, { res: 0.022, tag: 'gator' });
        S.ball([x + 0.12, 0.025, sd * 0.37], [0.07, 0.025, 0.055], hide, { res: 0.02, tag: 'gator' });
      }
      for (let i = 0; i < 5; i++) S.ball([0.76 + i * 0.085, 0.105, sd * (0.1 - i * 0.008)], [0.014, 0.022, 0.012], M.cream, { res: 0.01, tag: 'gator' });   // teeth
    }
    S.ball([0.9, 0.075, 0], [0.24, 0.035, 0.095], belly, { res: 0.022, tag: 'gatorJaw' });
    S.tube([GATOR_AT.tail[0], GATOR_AT.tail[1]], 0.15, 0.085, hide, { res: 0.026, tag: 'gatorTail1' });
    S.tube([GATOR_AT.tail[1], [-1.36, 0.06, -0.03]], 0.085, 0.018, hide, { res: 0.024, tag: 'gatorTail2' });
    for (let i = 0; i < 6; i++) { const f = i / 6, tag = i < 3 ? 'gatorTail1' : 'gatorTail2'; S.ball([-0.52 - f * 0.78, 0.27 - f * 0.17, 0.01], [0.045, 0.04, 0.03], hide, { res: 0.018, tag }); }
  });
}

/* ── somebody filming ───────────────────────────────────────────────────────────────────────────────────────────────
   (Not in the scene as it stands either: `people: true` again.)
   On the pavement by the pole, in a cap and a loud shirt, a phone held up at her in both hands. Made facing +z. */
const FAN = { at: [-4.42, 0.09, -0.98], yaw: 0.52, scale: 1.1 };
function bystander(ctx) {
  const { S, K, B, M } = ctx;
  const skin = M.tips;
  const shirt = { r: [C.pink[0], C.pink[1], C.pink[2], C.pink[3]], g: [C.pink[1], C.pink[2], C.pink[3]], tex: (X, Y, Z, ny, t) => (Math.abs(Math.sin(X * 23.1 + Y * 17.3) * Math.cos(Z * 19.7 + Y * 11.1)) > 0.8 ? C.gold[1] : S.pick([C.pink[0], C.pink[1], C.pink[2], C.pink[3]], clamp01(t))) };
  placed(S, FAN.at, FAN.yaw, xf => {
    const fine = { res: 0.024 };
    for (const s of [-1, 1]) {
      S.ball([s * 0.1, 0.05, 0.03], [0.08, 0.05, 0.12], M.cream, fine);
      S.tube([[s * 0.1, 0.08, 0], [s * 0.1, 0.34, 0]], 0.055, 0.06, skin, fine);
      S.tube([[s * 0.1, 0.34, 0], [s * 0.09, 0.56, 0]], 0.085, 0.09, M.blue, fine);        // shorts
    }
    S.ball([0, 0.74, 0], [0.2, 0.2, 0.15], shirt, fine);
    S.ball([0, 1.1, 0.01], [0.24, 0.23, 0.23], skin, { res: 0.022, tag: 'fanHead' });
    S.ball([0, 1.2, -0.01], [0.25, 0.16, 0.245], M.cyan, { res: 0.022, tag: 'fanHead' });   // a cap, its peak forward
    S.box([0, 1.17, 0.27], [0.14, 0.018, 0.1], M.cyan, { res: 0.02, rd: 0.012, tag: 'fanHead' });
    // both arms up and forward, and the phone between the hands: its screen toward him, lit
    for (const s of [-1, 1]) S.tube([[s * 0.2, 0.84, 0.02], [s * 0.22, 0.98, 0.2], [s * 0.1, 1.14, 0.36]], 0.045, 0.04, skin, { res: 0.02, tag: 'fanArms' });
    S.box([0, 1.18, 0.4], [0.13, 0.075, 0.014], M.black, { res: 0.018, tag: 'fanArms' });
    S.box([0, 1.18, 0.384], [0.115, 0.062, 0.004], { r: [C.cyan[1]], em: true }, { res: 0.016, ghost: true, tag: 'fanArms' });
    S.ball([0.09, 1.21, 0.417], 0.016, { r: [C.glow[2]], em: true }, { res: 0.01, ghost: true, tag: 'fanArms' });        // its little light
  }, FAN.scale);
}

/* ── what the helicopter has put in the air ─────────────────────────────────────────────────────────────────────────
   Banknotes out of the open car and bits of palm, going round and up in the rotor's wash. Each is one flat dab, put where
   the clock says before every frame, as the night stall's rain is: `air` lays them down and says in plain numbers how
   each is to move, `airClock` moves them. */
function air({ B }) {
  const first = B.count(), bits = [];
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const dab = { nd: true, em: true };
  for (let i = 0; i < 44; i++) {
    const note = i < 30, n = norm([rnd() - 0.5, 0.4 + rnd(), rnd() - 0.5]);
    const colour = note ? [C.green[2], C.green[3], C.green[2], C.cream[2]][i % 4] : [C.green[1], C.hair[2]][i % 2];
    const row = B.count();
    B.disc(0, -9, 0, n, note ? 0.055 : 0.04, 0.012, B.P[colour], 1.1, dab);
    bits.push({
      row, turns: (1 + Math.floor(rnd() * 3)) * (rnd() < 0.5 ? 1 : -1), a0: rnd() * TAU,                 // times round the column in a loop, and where it starts
      r: 0.5 + 1.7 * rnd(), lifts: 2 + Math.floor(rnd() * 3), phase: rnd(), wob: rnd() * TAU,        // how far out; times up the column in a loop
      low: 0.25 + 0.5 * rnd(), high: 2.6 + 2.2 * rnd()
    });
  }
  return { first, count: B.count() - first, bits };
}
/* the column they go round: from over the lowrider up toward the helicopter */
const COLUMN = [MARK[0] - 0.25, MARK[2] + 0.35];
function airClock({ bits }) {
  return (rest, t) => {
    const u = wrap(t) / LOOP;
    for (const b of bits) {
      const k = (u * b.lifts + b.phase) % 1, a = b.a0 + u * TAU * b.turns + 0.5 * Math.sin(u * TAU * 5 + b.wob), q = b.row * 16;
      const r = b.r * (0.55 + 0.6 * k) + 0.12 * Math.sin(u * TAU * 7 + b.wob);
      rest[q] = COLUMN[0] + Math.cos(a) * r;
      rest[q + 1] = b.low + (b.high - b.low) * k + 0.1 * Math.sin(u * TAU * 9 + b.wob);
      rest[q + 2] = COLUMN[1] + Math.sin(a) * r * 0.8;
      rest[q + 3] = k < 0.04 || k > 0.96 ? 0 : 1.1;       // (it is gone for a moment at the top, and begins again at the bottom)
    }
  };
}

const SEED = 31;
module.exports = kit => ({
  id: 'vice-corner',
  name: 'Vice corner',
  seed: SEED,
  build: (seed, o) => build(kit, seed, o)
});
module.exports.PALETTE = PALETTE;
module.exports.DETAIL = DETAIL;
module.exports.LOOP = LOOP;
module.exports.camera = camera;
module.exports.GLOW = GLOW;
module.exports.beam = beam;
module.exports.SUN = SUN;
module.exports.FOURTH = FOURTH;
module.exports.FLASH = FLASH;
module.exports.SCENE = { LAMP, COP, CAR, MARK, HELI, STORE, hex: Object.fromEntries(Object.entries(C).map(([k, v]) => [k, v.map(hex)])) };
/* For a page that is to open at once and not sculpt and bake first: `pack` does the sculpting (the `web` variant, for a
   page that turns the view itself) and gives the world that makes as data, { plain, arrays }; `unpack` is given the
   same back, wants only KIT, and returns the world set moving, as `build` would have. */
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
  return animate(K, world, plain.moves, plain.controls);
};
