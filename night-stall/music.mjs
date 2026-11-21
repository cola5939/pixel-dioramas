#!/usr/bin/env node
/* The night stall's music (the scene is scene.js; film.mjs films it). An original piece,
   worked out here sample by sample: nothing in it is a recording, and it comes out the same every time.

     node music.mjs                    out/night-stall-music.wav: 36 s, 48 kHz, 24-bit
     node music.mjs --into film.mp4    that, and then put into the film in place of any sound it had

   Lo-fi at 80 beats a minute in D. Twelve bars of four beats are 36 seconds, the film's loop, and the music loops with
   it: whatever rings on past the end (a string, the room) comes in again at the start, so the join is not heard.
   A guzheng plays the tune. Its strings are tuned to D's pentatonic (D E F♯ A B), and it plays as one is played: it
   sweeps up the strings where a phrase begins, presses a string to slide up into a note, shakes the long ones. Under
   it an electric piano, a soft bass and a slow, lazy beat; under all of it the rain, and the crackle of an old record.
   The chords go IV V iii vi (G△9 A9sus4 F♯m7 Bm11), three times round. The beat comes in softly in the third bar,
   fully in the fifth, and falls away in the last, so the loop begins again quietly.
   The strings are Karplus–Strong, the piano is FM, drums and rain are shaped noise. Each part is set to a loudness
   of its own (BS.1770, in LUFS), and the whole to -16 LUFS under a ceiling of -2 dBFS. */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name, fallback) => { const i = args.indexOf('--' + name); return i < 0 ? fallback : args[i + 1] ?? true; };
const OUT = path.resolve(ROOT, flag('out', 'out/night-stall-music.wav'));

const SR = 48000, LOOP = 36, N = LOOP * SR, BEAT = 60 / 80, BAR = 4 * BEAT, TAU = 2 * Math.PI;
const TARGET = -16, CEILING = -2;                 // LUFS for the whole, and the most any sample may reach (dBFS)
const LEVELS = {                                  // and for each part on its own (LUFS): the tune on top, the rain well under
  zheng: -18, keys: -20, drums: -20, bass: -21, verb: -25, echo: -29, rain: -27, drops: -33, vinyl: -36
};
const hz = m => 440 * 2 ** ((m - 69) / 12);
const at = (bar, beat) => bar * BAR + beat * BEAT;
const smooth = u => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));

function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const R = rng(2611);
const jitter = ms => ((R() - 0.5) * 2 * ms) / 1000;     // a player is never quite on the grid

/* a two-pole filter (the RBJ cookbook's), as a function of one sample that remembers the ones before */
function biquad(type, f, q = Math.SQRT1_2, db = 0) {
  const w = (TAU * f) / SR, cw = Math.cos(w), al = Math.sin(w) / (2 * q), A = 10 ** (db / 40), sq = 2 * Math.sqrt(A) * al;
  const k = {
    lp: [(1 - cw) / 2, 1 - cw, (1 - cw) / 2, 1 + al, -2 * cw, 1 - al],
    hp: [(1 + cw) / 2, -(1 + cw), (1 + cw) / 2, 1 + al, -2 * cw, 1 - al],
    bp: [al, 0, -al, 1 + al, -2 * cw, 1 - al],
    peak: [1 + al * A, -2 * cw, 1 - al * A, 1 + al / A, -2 * cw, 1 - al / A],
    highshelf: [A * (A + 1 + (A - 1) * cw + sq), -2 * A * (A - 1 + (A + 1) * cw), A * (A + 1 + (A - 1) * cw - sq),
      A + 1 - (A - 1) * cw + sq, 2 * (A - 1 - (A + 1) * cw), A + 1 - (A - 1) * cw - sq]
  }[type];
  return coefficients([k[0] / k[3], k[1] / k[3], k[2] / k[3], k[4] / k[3], k[5] / k[3]]);
}
function coefficients([b0, b1, b2, a1, a2]) {
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  return x => { const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x; y2 = y1; y1 = y; return y; };
}
const series = (...fs) => x => { for (const f of fs) x = f(x); return x; };
/* white noise made pink (Paul Kellet's filter): as much in each octave as in the next */
function pink() {
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  return w => {
    b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
    const y = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926; return y;
  };
}
const fade = (b, secs) => { const m = Math.min(b.length, Math.round(secs * SR)); for (let i = 0; i < m; i++) b[b.length - 1 - i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / m); return b; };

/* ── the parts, each a loop of N samples a side. A note is laid in where it starts and rings on round the end ── */
const part = () => [new Float32Array(N), new Float32Array(N)];
const S = { keys: part(), zheng: part(), bass: part(), drums: part(), verb: part(), echo: part(), rain: part(), drops: part(), vinyl: part() };
function lay(sound, time, into, pan = 0, sends = {}) {
  const a = ((Math.max(-1, Math.min(1, pan)) + 1) * Math.PI) / 4, gl = Math.cos(a), gr = Math.sin(a);
  const k0 = ((Math.round(time * SR) % N) + N) % N;
  for (const [[L, Rt], g] of [[into, 1], ...Object.entries(sends).map(([name, g]) => [S[name], g])]) {
    const l = gl * g, r = gr * g;
    for (let i = 0, k = k0; i < sound.length; i++, k++) { if (k >= N) k -= N; L[k] += sound[i] * l; Rt[k] += sound[i] * r; }
  }
}

/* ── the instruments ── */
/* an electric piano: a sine bent by another at its own pitch, hard at first and soon softer (FM), with the brief
   ring of the tine above it; lower notes sound longer, and the damper takes a note off when it is let go */
function epiano(midi, vel, hold) {
  const f = hz(midi) * (1 + (R() - 0.5) * 0.0012), n = Math.ceil((hold + 0.5) * SR), out = new Float32Array(n);
  const tau = 2.2 * Math.sqrt(261.63 / f), bright = 0.7 + 1.6 * vel, w = (TAU * f) / SR;
  for (let i = 0; i < n; i++) {
    const t = i / SR, ph = w * i;
    const env = (1 - Math.exp(-t / 0.0015)) * Math.exp(-t / tau) * (t > hold ? Math.exp(-(t - hold) / 0.08) : 1);
    const index = bright * Math.exp(-t / 0.3) + 0.3;
    out[i] = vel * env * (Math.sin(ph + index * Math.sin(ph)) + 0.2 * Math.exp(-t / 0.05) * Math.sin(ph * 7.1));
  }
  return fade(out, 0.02);
}
/* A guzheng string (Karplus–Strong). Plucked with a pick near the bridge: a period of bright noise, less what a
   pluck there cannot excite, goes round a loop as long as the string's period, losing a little at each turn, its
   highs first. `path` bends it ([seconds, cents] points: the left hand pressing the string beyond the bridge);
   `vib` shakes it (at, depth in cents, rate) */
function zheng(midi, vel, o = {}) {
  const f0 = hz(midi), n = Math.ceil((o.ring ?? 2.4) * SR), out = new Float32Array(n);
  const size = 2 ** Math.ceil(Math.log2((SR / f0) * 1.6 + 8)), mask = size - 1, line = new Float32Array(size);
  const period = SR / f0, burst = Math.round(period), p = Math.max(1, Math.round(period * 0.17));
  const noise = Array.from({ length: burst }, () => R() * 2 - 1), ex = new Float32Array(burst);
  let mean = 0;
  for (let i = 0; i < burst; i++) { ex[i] = noise[i] - (i >= p ? noise[i - p] : 0); mean += ex[i] / burst; }
  for (let i = 0; i < burst; i++) ex[i] = (ex[i] - mean) * vel * 0.7;
  const t60 = 3.4 * (293.66 / f0) ** 0.55, s = 0.4, path = o.path ?? [[0, 0]], vib = o.vib;
  const bend = t => {
    if (t <= path[0][0]) return path[0][1];
    for (let k = 1; k < path.length; k++) {
      const [ta, ca] = path[k - 1], [tb, cb] = path[k];
      if (t < tb) return ca + (cb - ca) * smooth((t - ta) / (tb - ta));
    }
    return path[path.length - 1][1];
  };
  for (let i = 0, w = 0; i < n; i++, w++) {
    const t = i / SR;
    let c = bend(t);
    if (vib && t > vib.at) c += vib.depth * Math.sin(TAU * vib.rate * (t - vib.at)) * smooth((t - vib.at) / 0.4);
    const f = f0 * 2 ** (c / 1200), D = SR / f - s, g = 10 ** (-3 / (t60 * f));
    const rp = w - D, i0 = Math.floor(rp), fr = rp - i0;
    const a = line[i0 & mask] * (1 - fr) + line[(i0 + 1) & mask] * fr, b = line[(i0 - 1) & mask] * (1 - fr) + line[i0 & mask] * fr;
    const y = g * ((1 - s) * a + s * b) + (i < burst ? ex[i] : 0);
    line[w & mask] = y;
    out[i] = y;
  }
  return fade(out, 0.25);
}
/* a round, soft bass: a sine with a little of its octave and twelfth, gently squashed */
function bassNote(midi, vel, hold) {
  const f = hz(midi), n = Math.ceil((hold + 0.3) * SR), out = new Float32Array(n), w = (TAU * f) / SR, k = Math.tanh(1.5);
  for (let i = 0; i < n; i++) {
    const t = i / SR, ph = w * i;
    const env = (1 - Math.exp(-t / 0.005)) * (0.55 + 0.45 * Math.exp(-t / 0.22)) * (t > hold ? Math.exp(-(t - hold) / 0.06) : 1);
    out[i] = Math.tanh(1.5 * vel * env * (Math.sin(ph) + 0.3 * Math.sin(2 * ph) + 0.12 * Math.sin(3 * ph))) / k;
  }
  return fade(out, 0.03);
}
function kick(vel) {
  const n = Math.round(0.6 * SR), out = new Float32Array(n), click = biquad('lp', 3000);
  for (let i = 0, ph = 0; i < n; i++) {
    const t = i / SR;
    ph += (TAU * (52 + 70 * Math.exp(-t / 0.04))) / SR;
    out[i] = vel * (Math.sin(ph) * Math.exp(-t / 0.22) * (1 - Math.exp(-t / 0.0015)) + 0.3 * click((R() * 2 - 1) * Math.exp(-t / 0.003)));
  }
  return fade(out, 0.05);
}
function snare(vel) {
  const n = Math.round(0.35 * SR), out = new Float32Array(n), tone = series(biquad('bp', 1900, 0.7), biquad('hp', 400));
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const body = 0.55 * Math.sin((TAU * 190 * i) / SR) * Math.exp(-t / 0.05) + 0.25 * Math.sin((TAU * 320 * i) / SR) * Math.exp(-t / 0.035);
    out[i] = vel * (1 - Math.exp(-t / 0.0008)) * (body + 1.4 * tone(R() * 2 - 1) * Math.exp(-t / 0.11));
  }
  return fade(out, 0.04);
}
function hat(vel, open) {
  const n = Math.round((open ? 0.45 : 0.09) * SR), out = new Float32Array(n);
  const air = series(biquad('hp', 7000), biquad('hp', 7000), biquad('peak', 10000, 1, 4));
  for (let i = 0; i < n; i++) { const t = i / SR; out[i] = vel * 0.45 * air(R() * 2 - 1) * Math.exp(-t / (open ? 0.16 : 0.028)) * (1 - Math.exp(-t / 0.0005)); }
  return fade(out, 0.01);
}
/* a raindrop striking something: a tick that rings for a few milliseconds */
function drip(freq, tau, amp) {
  const n = Math.ceil(6 * tau * SR), out = new Float32Array(n), w = (TAU * freq) / SR;
  for (let i = 0; i < n; i++) { const t = i / SR; out[i] = amp * Math.sin(w * i) * Math.exp(-t / tau) * (1 - Math.exp(-t / 0.0004)); }
  return out;
}

/* ── the score ── */
const [D4, E4, Fs4, A4, B4, D5, E5, Fs5, A5, B5] = [62, 64, 66, 69, 71, 74, 76, 78, 81, 83];
const CHORDS = [                                          // the piano's hands (no root: that is the bass's), and the bass
  { keys: [59, 62, 66, 69], root: 43 },                   // G△9      B D F♯ A over G
  { keys: [59, 62, 64, 67], root: 45, then: [59, 61, 64, 67] },   // A9sus4  B D E G over A, the D falling to C♯ at the third beat
  { keys: [57, 61, 64, 66], root: 42 },                   // F♯m7     A C♯ E F♯ over F♯
  { keys: [57, 62, 64, 66], root: 35 }                    // Bm11     A D E F♯ over B
];
const SHAKE = { vib: { at: 0.32, depth: 16, rate: 5.2 } };         // a long note, shaken
const INTO = { path: [[0, -200], [0.11, 0]] };                     // plucked a tone low and pressed up into the note
const TUNE = [                                                     // bar, beat, note, beats, how hard, how
  [0, 1, E5, 0.5, 0.5], [0, 1.5, D5, 0.5, 0.42], [0, 2, B4, 1, 0.55], [0, 3, A4, 1, 0.5],
  [1, 0.5, B4, 0.5, 0.42], [1, 1, D5, 1.5, 0.55, { path: [[0, 0], [0.3, 0], [0.46, 200]] }], [1, 2.5, E5, 0.5, 0.48], [1, 3, B4, 0.5, 0.44], [1, 3.5, A4, 0.5, 0.4],
  [2, 0, A4, 1.5, 0.55, SHAKE], [2, 1.5, Fs4, 0.5, 0.45], [2, 2, E4, 1, 0.5], [2, 3, Fs4, 0.5, 0.45], [2, 3.5, A4, 0.5, 0.45],
  [3, 0, B4, 2, 0.55, SHAKE], [3, 2.5, A4, 0.5, 0.45], [3, 3, Fs4, 1, 0.5],
  [4, 0, Fs5, 1, 0.62, INTO], [4, 1, A5, 0.5, 0.55], [4, 1.5, Fs5, 0.5, 0.5], [4, 2, E5, 0.75, 0.55], [4, 2.75, D5, 0.25, 0.42], [4, 3, E5, 1, 0.55],
  [5, 0, E5, 0.5, 0.5], [5, 0.5, D5, 0.5, 0.45], [5, 1, B4, 1, 0.5], [5, 2, D5, 0.5, 0.5], [5, 2.5, E5, 0.5, 0.5], [5, 3, A5, 1, 0.58, SHAKE],
  [6, 0, A5, 1.5, 0.6, SHAKE], [6, 1.5, B5, 0.5, 0.5], [6, 2, A5, 0.5, 0.5], [6, 2.5, Fs5, 0.5, 0.5], [6, 3, E5, 1, 0.55],
  [7, 0, Fs5, 2, 0.58, { ...INTO, ...SHAKE }], [7, 2, E5, 0.5, 0.5], [7, 2.5, D5, 0.5, 0.45], [7, 3, B4, 0.5, 0.45], [7, 3.5, D5, 0.5, 0.45],
  [8, 0, E5, 1, 0.55], [8, 1, Fs5, 0.5, 0.5], [8, 1.5, E5, 0.5, 0.45], [8, 2, D5, 1, 0.5], [8, 3, B4, 0.5, 0.45], [8, 3.5, D5, 0.5, 0.45],
  [9, 0, E5, 1.5, 0.55, INTO], [9, 1.5, D5, 0.5, 0.45], [9, 2, B4, 0.5, 0.45], [9, 2.5, A4, 0.5, 0.45], [9, 3, B4, 1, 0.5, SHAKE],
  [10, 0, A4, 1, 0.5], [10, 1, Fs4, 1, 0.5], [10, 2, E4, 0.5, 0.45], [10, 2.5, Fs4, 0.5, 0.45], [10, 3, A4, 1, 0.5],
  [11, 0, B4, 2.5, 0.55, { ...INTO, ...SHAKE }], [11, 3, A4, 0.5, 0.32], [11, 3.5, Fs4, 0.5, 0.28]
];
const zhengPan = m => 0.18 + (m - 74) * 0.012;                    // low strings a little left of the high ones
for (const [bar, beat, m, len, vel, how = {}] of TUNE)
  lay(zheng(m, vel * (0.92 + 0.16 * R()), { ...how, ring: Math.min(2.6, len * BEAT + 1.2) }), at(bar, beat) + jitter(10), S.zheng, zhengPan(m), { verb: 0.32, echo: 0.2 });
// the sweep up the strings that opens the loop, and the one that leads into the fifth bar
const sweep = (start, notes) => notes.forEach((m, k) =>
  lay(zheng(m, 0.2 + (0.3 * k) / (notes.length - 1), { ring: 1.4 }), start + k * 0.028, S.zheng, zhengPan(m), { verb: 0.4, echo: 0.06 }));
sweep(0, [D4, E4, Fs4, A4, B4, D5, E5, Fs5]);
sweep(at(4, 0) - 7 * 0.028, [D4, E4, Fs4, A4, B4, D5, E5]);

const kicks = [];
for (let bar = 0; bar < 12; bar++) {
  const c = CHORDS[bar % 4], t0 = bar * BAR, full = bar >= 4 && bar <= 10;
  // the piano: a chord to the bar while it begins and ends, otherwise on the beat, just before the second, and on the "and" of the third
  const hits = full ? [[0, 1.3, 0.55], [1.75, 0.5, 0.3], [2.5, 1.4, 0.45]] : c.then && bar < 4 ? [[0, 2.4, 0.42], [2.5, 1.4, 0.36]] : [[0, 3.8, 0.42]];
  for (const [beat, hold, vel] of hits) {
    const notes = c.then && beat >= 2.5 ? c.then : c.keys, start = t0 + beat * BEAT + 0.012 + jitter(8);   // (a touch behind the beat, the notes rolled up)
    notes.forEach((m, k) => lay(epiano(m, vel * (0.9 + 0.2 * R()), hold * BEAT), start + k * 0.016, S.keys, -0.12, { verb: 0.25 }));
  }
  // the bass: the root held while it begins and ends, otherwise the root, its octave and the root again
  const bass = full ? [[0, c.root, 2, 0.8], [2.5, c.root + 12, 0.4, 0.5], [3, c.root, 0.85, 0.7]] : [[0, c.root, 3.95, 0.7]];
  for (const [beat, m, len, vel] of bass) lay(bassNote(m, vel, len * BEAT), t0 + beat * BEAT + jitter(5), S.bass, 0);
  // the beat
  if (bar < 2) continue;
  const soft = bar < 4, last = bar === 11;
  const K = (beat, vel) => { const t = t0 + beat * BEAT + jitter(4); kicks.push(t); lay(kick(vel), t, S.drums, 0); };
  const Sn = (beat, vel) => lay(snare(vel), t0 + (beat + 0.02) * BEAT + jitter(6), S.drums, -0.05, { verb: 0.12 });
  K(0, soft ? 0.55 : 0.85);
  if (!last) K(2.5, soft ? 0.45 : 0.72);
  if (full && bar % 2 === 1) K(1.75, 0.45);
  Sn(1, soft ? 0.32 : 0.68);
  if (!last) Sn(3, soft ? 0.32 : 0.68);
  if (bar === 6 || bar === 10) Sn(3.75, 0.18);
  for (let e = 0; e < 8; e++) {                                   // eighths, the off-beats late (swung)
    if (soft && e % 2 === 0) continue;                             // (while the beat comes in, only the off-beats, quietly)
    if (last && e >= 4) break;
    const vel = soft ? 0.18 : (e % 2 ? 0.3 : 0.42) * (0.85 + 0.3 * R());
    lay(hat(vel, e === 7 && (bar === 6 || bar === 10)), t0 + (e * 0.5 + (e % 2 ? 0.07 : 0)) * BEAT + jitter(5), S.drums, 0.28);
  }
}

// the rain: a hiss that is different on either side, ticks all over, and now and then a heavier drop off the awning
const RAIN = rng(77);
for (const side of S.rain) for (let i = 0; i < N; i++) side[i] = RAIN() * 2 - 1;
for (let i = 0; i < LOOP * 70; i++)
  lay(drip(1200 * (5.5 / 1.2) ** RAIN(), 0.002 + 0.005 * RAIN(), 0.02 + 0.06 * RAIN() ** 3), RAIN() * LOOP, S.drops, RAIN() * 2 - 1);
for (let i = 0; i < LOOP * 2.5; i++)
  lay(drip(650 + 500 * RAIN(), 0.012 + 0.01 * RAIN(), 0.06 + 0.08 * RAIN()), RAIN() * LOOP, S.drops, RAIN() * 1.2 - 0.6);
// the record: a faint hiss, crackle, and the odd pop
const VINYL = rng(1979);
for (const side of S.vinyl) for (let i = 0; i < N; i++) side[i] = (VINYL() * 2 - 1) * 0.03;
for (let i = 0; i < LOOP * 6; i++) {
  const k = Math.floor(VINYL() * N), a = (VINYL() < 0.5 ? -1 : 1) * (0.1 + 0.9 * VINYL() ** 4);
  S.vinyl[0][k] += a; S.vinyl[1][k] += a * (0.6 + 0.4 * VINYL());
}
for (let i = 0; i < LOOP * 0.3; i++) {
  const pop = new Float32Array(96), lp = biquad('lp', 1500);
  for (let j = 0; j < pop.length; j++) pop[j] = lp((VINYL() * 2 - 1) * (1 - j / pop.length)) * 0.5;
  lay(pop, VINYL() * LOOP, S.vinyl, VINYL() * 0.6 - 0.3);
}
// the piano ducks a little under each kick
const duck = new Float32Array(N).fill(1);
for (const tk of kicks) {
  const k0 = Math.round(tk * SR);
  for (let i = 0; i < 0.5 * SR; i++) {
    const t = i / SR, e = (1 - Math.exp(-t / 0.004)) * Math.exp(-t / 0.16), k = (((k0 + i) % N) + N) % N;
    duck[k] = Math.min(duck[k], 1 - 0.2 * e);
  }
}

/* ── the mix. Every part is played three times over and processed so, and the middle time is the one kept: in it the
   filters, the room and the echo are already ringing with what came before, as they are each time round ── */
const M = 3 * N;
const thrice = a => { const b = new Float32Array(M); b.set(a, 0); b.set(a, N); b.set(a, 2 * N); return b; };
const through = (sides, make) => sides.map(side => { const f = make(), b = thrice(side); for (let i = 0; i < M; i++) b[i] = f(b[i]); return b; });
const P = {
  keys: through(S.keys, () => series(biquad('hp', 120), biquad('lp', 3800))),
  zheng: through(S.zheng, () => series(biquad('hp', 90), biquad('peak', 240, 1, 2.5), biquad('highshelf', 6500, 0.7, -3))),
  bass: through(S.bass, () => series(biquad('hp', 30), biquad('lp', 650))),
  drums: through(S.drums, () => series(biquad('hp', 35), biquad('lp', 7500), x => Math.tanh(0.8 * x) / 0.8)),
  rain: through(S.rain, () => series(pink(), biquad('hp', 300), biquad('lp', 6500), biquad('peak', 2200, 0.8, 3))),
  drops: through(S.drops, () => series(biquad('hp', 500), biquad('lp', 8000))),
  vinyl: through(S.vinyl, () => series(biquad('hp', 1000), biquad('lp', 7000)))
};
for (let i = 0; i < M; i++) {                                      // the piano turns slowly from side to side (126 times a loop)
  const d = duck[i % N], p = 0.22 * Math.sin((TAU * 3.5 * i) / SR);
  P.keys[0][i] *= d * (1 - p); P.keys[1][i] *= d * (1 + p);
}
P.verb = freeverb(thrice(S.verb[0]), thrice(S.verb[1])).map(side => { const f = series(biquad('hp', 220), biquad('lp', 5500)); return side.map(f); });
P.echo = pingpong(thrice(S.echo[0]), thrice(S.echo[1]));

const report = [];
for (const [name, target] of Object.entries(LEVELS)) {
  const was = loudness(P[name]), g = 10 ** ((target - was) / 20);
  for (const side of P[name]) for (let i = 0; i < M; i++) side[i] *= g;
  report.push(`${name} ${was.toFixed(1)} → ${target}`);
}
console.log('parts (LUFS as made → as set):', report.join(', '));
// the music goes onto tape (a slow wow, a faint flutter, a little warmth); the rain and the record are in the room
const music = [0, 1].map(c => { const b = new Float32Array(M); for (const name of ['keys', 'zheng', 'bass', 'drums', 'verb', 'echo']) { const x = P[name][c]; for (let i = 0; i < M; i++) b[i] += x[i]; } return b; });
const taped = tape(music).map(side => { const f = series(x => Math.tanh(1.1 * x) / 1.1, biquad('lp', 12000), biquad('hp', 25)); return side.map(f); });
const master = [0, 1].map(c => { const b = taped[c]; for (const name of ['rain', 'drops', 'vinyl']) { const x = P[name][c]; for (let i = 0; i < M; i++) b[i] += x[i]; } return b; });
// as loud as it should be, and no louder than the ceiling (twice: the limiter takes a little off)
let lufs = loudness(master);
for (let pass = 0; pass < 2; pass++) {
  const g = 10 ** ((TARGET - lufs) / 20);
  for (const side of master) for (let i = 0; i < M; i++) side[i] *= g;
  const held = limiter(master, CEILING);
  lufs = loudness(held);
  if (pass === 1 || Math.abs(lufs - TARGET) < 0.1) { master[0] = held[0]; master[1] = held[1]; break; }
}
const keep = master.map(side => side.slice(N, 2 * N));
let peak = 0, seam = 0;
for (const side of keep) for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(side[i]));
for (let c = 0; c < 2; c++) for (let i = 0; i < N - 2000; i++) seam = Math.max(seam, Math.abs(master[c][N + i] - master[c][2 * N + i]));
console.log(`music: ${loudness(master).toFixed(1)} LUFS, sample peak ${(20 * Math.log10(peak)).toFixed(1)} dBFS; one time round against the next differs by at most ${(20 * Math.log10(seam + 1e-12)).toFixed(0)} dBFS`);
console.log('share of the energy (dB) below 60 Hz, 60–250, 250–1k, 1k–4k, above 4k:', bands(keep).map(v => v.toFixed(1)).join(', '));
writeWav(OUT, keep[0], keep[1]);
console.log('wrote', path.relative(ROOT, OUT));

const into = flag('into');
if (into) {
  const film = path.resolve(ROOT, into), tmp = film.replace(/\.mp4$/, '') + '.with-music.mp4';
  const run = list => { const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...list], { stdio: 'inherit' }); if (r.status) throw new Error('ffmpeg stopped with code ' + r.status); };
  // (FFmpeg's own AAC encoder, which marks where its last frame's padding begins, so the sound is exactly the loop's length
  // and a player going round again hears no gap: Apple's leaves 11 ms of silence at the end. Cut to the film's length.)
  const length = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=duration', '-of', 'csv=p=0', film]).stdout.toString().trim();
  run(['-i', film, '-i', OUT, '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-ac', '2', '-t', length, '-movflags', '+faststart', tmp]);
  fs.renameSync(tmp, film);
  console.log('put into', path.relative(ROOT, film));
}

/* ── the machinery ── */
/* a room (Freeverb: eight damped combs and four allpasses a side, the right side's a little longer) */
function freeverb(inL, inR, room = 0.84, damp = 0.42) {
  const scale = SR / 44100, combs = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617], passes = [556, 441, 341, 225];
  const side = spread => ({
    combs: combs.map(t => ({ buf: new Float32Array(Math.round((t + spread) * scale)), i: 0, store: 0 })),
    passes: passes.map(t => ({ buf: new Float32Array(Math.round((t + spread) * scale)), i: 0 }))
  });
  const sides = [side(0), side(23)], n = inL.length, out = [new Float32Array(n), new Float32Array(n)];
  for (let k = 0; k < n; k++) {
    const x = (inL[k] + inR[k]) * 0.015;
    for (let s = 0; s < 2; s++) {
      let y = 0;
      for (const c of sides[s].combs) { const o = c.buf[c.i]; c.store = o * (1 - damp) + c.store * damp; c.buf[c.i] = x + c.store * room; if (++c.i >= c.buf.length) c.i = 0; y += o; }
      for (const a of sides[s].passes) { const b = a.buf[a.i], o = b - y; a.buf[a.i] = y + b * 0.5; if (++a.i >= a.buf.length) a.i = 0; y = o; }
      out[s][k] = y;
    }
  }
  return out;
}
/* an echo that goes from one side to the other, a dotted eighth apart, darker each time */
function pingpong(inL, inR, secs = 0.75 * BEAT, fb = 0.42) {
  const d = Math.round(secs * SR), n = inL.length, bl = new Float32Array(d), br = new Float32Array(d), out = [new Float32Array(n), new Float32Array(n)];
  const tl = series(biquad('hp', 400), biquad('lp', 2600)), tr = series(biquad('hp', 400), biquad('lp', 2600));
  for (let i = 0, k = 0; i < n; i++) {
    const oL = bl[k], oR = br[k];
    out[0][i] = oL; out[1][i] = oR;
    bl[k] = (inL[i] + inR[i]) * 0.5 + fb * tr(oR);
    br[k] = fb * tl(oL);
    if (++k >= d) k = 0;
  }
  return out;
}
/* tape: the sound read a few milliseconds late, the lateness wandering (a wow 18 times a loop, a flutter 216 times) */
function tape([L, Rt]) {
  const n = L.length, out = [new Float32Array(n), new Float32Array(n)], base = 0.008 * SR;
  for (let i = 0; i < n; i++) {
    const t = i / SR, d = base + 0.0009 * SR * Math.sin(TAU * 0.5 * t) + 0.00005 * SR * Math.sin(TAU * 6 * t + 1.3);
    const p = i - d, j = Math.floor(p), u = p - j;
    for (let c = 0; c < 2; c++) {
      const x = c ? Rt : L, xm = x[j - 1] ?? 0, x0 = x[j] ?? 0, x1 = x[j + 1] ?? 0, x2 = x[j + 2] ?? 0;
      const c1 = 0.5 * (x1 - xm), c2 = xm - 2.5 * x0 + 2 * x1 - 0.5 * x2, c3 = 0.5 * (x2 - xm) + 1.5 * (x0 - x1);
      out[c][i] = ((c3 * u + c2) * u + c1) * u + x0;
    }
  }
  return out;
}
/* loudness of the middle time round (ITU-R BS.1770: K-weighted, in 400 ms blocks, gated), in LUFS */
function loudness([L, Rt], from = N, to = 2 * N) {
  const z = new Float64Array(Math.floor((to - from) / 4800));
  for (const side of [L, Rt]) {
    const k = series(coefficients([1.53512485958697, -2.69169618940638, 1.19839281085285, -1.69065929318241, 0.73248077421585]),
      coefficients([1, -2, 1, -1.99004745483398, 0.99007225036621]));
    for (let i = 0; i < to; i++) { const y = k(side[i]); if (i >= from) { const q = Math.floor((i - from) / 4800); if (q < z.length) z[q] += y * y; } }
  }
  const of = e => -0.691 + 10 * Math.log10(e), mean = a => a.reduce((s, e) => s + e, 0) / a.length;
  let blocks = [];
  for (let q = 0; q + 4 <= z.length; q++) blocks.push((z[q] + z[q + 1] + z[q + 2] + z[q + 3]) / 19200);
  blocks = blocks.filter(e => of(e) > -70);
  if (!blocks.length) return -Infinity;
  const gate = of(mean(blocks)) - 10;
  return of(mean(blocks.filter(e => of(e) > gate)));
}
/* a limiter that sees what is coming: the gain each sample needs, held over 4 ms either side, eased over 2 ms, and let
   back up over 80 ms */
function limiter([L, Rt], ceiling) {
  const n = L.length, r = Math.round(0.004 * SR), half = r >> 1, c = 10 ** (ceiling / 20), rel = Math.exp(-1 / (0.08 * SR));
  const need = new Float32Array(n);
  for (let i = 0; i < n; i++) { const p = Math.max(Math.abs(L[i]), Math.abs(Rt[i])); need[i] = p > c ? c / p : 1; }
  const held = new Float32Array(n), dq = new Int32Array(n);
  for (let j = 0, head = 0, tail = 0; j < n + r; j++) {
    if (j < n) { while (tail > head && need[dq[tail - 1]] >= need[j]) tail--; dq[tail++] = j; }
    const i = j - r;
    if (i >= 0) { while (dq[head] < i - r) head++; held[i] = need[dq[head]]; }
  }
  const sum = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) sum[i + 1] = sum[i] + held[i];
  const out = [new Float32Array(n), new Float32Array(n)];
  for (let i = 0, g = 1; i < n; i++) {
    const a = Math.max(0, i - half), b = Math.min(n, i + half + 1), avg = (sum[b] - sum[a]) / (b - a);
    g = Math.min(avg, g + (avg - g) * (1 - rel));
    out[0][i] = L[i] * g; out[1][i] = Rt[i] * g;
  }
  return out;
}
/* how the energy is shared out across the spectrum (of the two sides together), in dB of the whole */
function bands([L, Rt]) {
  const edges = [[null, 60], [60, 250], [250, 1000], [1000, 4000], [4000, null]], e = edges.map(() => 0);
  let all = 0;
  for (const side of [L, Rt]) {
    for (let i = 0; i < side.length; i++) all += side[i] * side[i];
    edges.forEach(([lo, hi], k) => {
      const f = series(...(lo ? [biquad('hp', lo), biquad('hp', lo)] : []), ...(hi ? [biquad('lp', hi), biquad('lp', hi)] : []));
      for (let i = 0; i < side.length; i++) { const y = f(side[i]); e[k] += y * y; }
    });
  }
  return e.map(v => 10 * Math.log10(v / all));
}
function writeWav(file, L, Rt) {
  const n = L.length, data = Buffer.alloc(n * 6), head = Buffer.alloc(44);
  head.write('RIFF', 0); head.writeUInt32LE(36 + data.length, 4); head.write('WAVE', 8); head.write('fmt ', 12);
  head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(2, 22); head.writeUInt32LE(SR, 24);
  head.writeUInt32LE(SR * 6, 28); head.writeUInt16LE(6, 32); head.writeUInt16LE(24, 34); head.write('data', 36); head.writeUInt32LE(data.length, 40);
  for (let i = 0, o = 0; i < n; i++) for (const side of [L, Rt]) { data.writeIntLE(Math.round(Math.max(-1, Math.min(1, side[i])) * 8388607), o, 3); o += 3; }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.concat([head, data]));
}
