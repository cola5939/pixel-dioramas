#!/usr/bin/env node
/* The vice corner's music (the scene is scene.js; film.mjs films it). An original piece, written down as MIDI and played
   on instruments made here after General MIDI's: the square lead, the FM electric piano, the warm pad, the synth bass and
   the synth brass, a glockenspiel, a reverse cymbal and a drum machine's kit. Nothing in it is a recording, and it comes
   out the same every time.

     node music.mjs                    out/vice-corner-music.wav (36 s, 48 kHz, 24-bit) and out/vice-corner-music.mid
     node music.mjs --into film.mp4    those, and then the sound put into the film in place of any it had

   Eighties synth-pop in A minor at 133⅓ beats a minute, played dead straight, as a sequencer plays. A beat is 0.45 s,
   and twenty bars of four are the 36-second loop. The music keeps time with the picture: the lowrider hops on every
   other beat, and the kick and the snare fall on those (half time: the kick on the one, the snare on the three); the
   police lamps flash red and blue a beat each; the fourth star comes and goes on a beat, and a bell rings for it.
   The twenty bars are four fives, one to each set of hops: Am F C G and an E7 to turn round on, the third time
   Dm G7 C F E7. In the first five the electric piano's arpeggio is the tune; in the other three the square lead has
   it (the same tune twice, and between them a higher one over brass stabs). Each five ends in a fill, and the last,
   with a cymbal played backwards, leads into the crash that opens the loop again.
   Each part is set to a loudness of its own (BS.1770, in LUFS), and the whole to -14 LUFS under a ceiling of
   -1.5 dBFS. The score is written out as well, as a Standard MIDI File: a track to each part, with its General MIDI
   program, which any MIDI player or DAW will play on its own instruments. */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name, fallback) => { const i = args.indexOf('--' + name); return i < 0 ? fallback : args[i + 1] ?? true; };
const OUT = path.resolve(ROOT, flag('out', 'out/vice-corner-music.wav'));
const MIDI_OUT = path.resolve(ROOT, flag('midi', OUT.replace(/\.wav$/, '') + '.mid'));
const scene = require('./scene.js');

const SR = 48000, LOOP = scene.LOOP, N = LOOP * SR, BEAT = 0.45, BAR = 4 * BEAT, BARS = Math.round(LOOP / BAR), TAU = 2 * Math.PI;
const TARGET = -14, CEILING = -1.5;               // LUFS for the whole, and the most any sample may reach (dBFS)
const LEVELS = {                                  // and for each part on its own (LUFS): the tune and the beat on top
  lead: -19, drums: -18.5, bass: -19.5, brass: -22.5, arp: -23, pad: -24.5, bell: -22.5, swell: -27, verb: -25, echo: -27
};
// (what the picture does on the beat, checked, so that a change to the scene that loses the beat does not go unnoticed)
if (BARS * BAR !== LOOP || Math.abs(scene.FLASH - 2 * BEAT) > 1e-9 || Math.abs(LOOP / 40 - 2 * BEAT) > 1e-9)
  throw new Error("the scene no longer keeps the music's time (its loop, the police lamps or the lowrider's hops)");
for (const t of scene.FOURTH.flat()) if (Math.abs(t / BEAT - Math.round(t / BEAT)) > 1e-9) throw new Error(`the fourth star comes or goes off the beat, at ${t} s`);

const hz = m => 440 * 2 ** ((m - 69) / 12);
const smooth = u => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const R = rng(1986);

/* a two-pole filter (the RBJ cookbook's), as a function of one sample that remembers the ones before */
function biquad(type, f, q = Math.SQRT1_2, db = 0) {
  const w = (TAU * f) / SR, cw = Math.cos(w), al = Math.sin(w) / (2 * q), A = 10 ** (db / 40);
  const k = {
    lp: [(1 - cw) / 2, 1 - cw, (1 - cw) / 2, 1 + al, -2 * cw, 1 - al],
    hp: [(1 + cw) / 2, -(1 + cw), (1 + cw) / 2, 1 + al, -2 * cw, 1 - al],
    bp: [al, 0, -al, 1 + al, -2 * cw, 1 - al],
    peak: [1 + al * A, -2 * cw, 1 - al * A, 1 + al / A, -2 * cw, 1 - al / A]
  }[type];
  return coefficients([k[0] / k[3], k[1] / k[3], k[2] / k[3], k[4] / k[3], k[5] / k[3]]);
}
function coefficients([b0, b1, b2, a1, a2]) {
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  return x => { const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x; y2 = y1; y1 = y; return y; };
}
const series = (...fs) => x => { for (const f of fs) x = f(x); return x; };
/* a two-pole low-pass whose cutoff may move every sample (Zavalishin's state-variable filter): what an analogue synth's
   filter is, swept by its envelope */
function svf() {
  let ic1 = 0, ic2 = 0;
  return (x, fc, q) => {
    const g = Math.tan((Math.PI * Math.min(fc, 0.45 * SR)) / SR), k = 1 / q, a1 = 1 / (1 + g * (g + k)), a2 = g * a1, a3 = g * a2;
    const v3 = x - ic2, v1 = a1 * ic1 + a2 * v3, v2 = ic2 + a2 * ic1 + a3 * v3;
    ic1 = 2 * v1 - ic1; ic2 = 2 * v2 - ic2;
    return v2;
  };
}
/* band-limited waves (PolyBLEP): a saw, and a pulse made of two saws its width apart */
const blep = (t, dt) => (t < dt ? ((t /= dt), t + t - t * t - 1) : t > 1 - dt ? ((t = (t - 1) / dt), t * t + t + t + 1) : 0);
const saw = (p, dt) => 2 * p - 1 - blep(p, dt);
const pulse = (p, dt, width) => saw(p, dt) - saw((p + width) % 1, dt);
const fade = (b, secs) => { const m = Math.min(b.length, Math.round(secs * SR)); for (let i = 0; i < m; i++) b[b.length - 1 - i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / m); return b; };

/* ── the parts, each a loop of N samples a side. A note is laid in where it starts and rings on round the end ── */
const part = () => [new Float32Array(N), new Float32Array(N)];
const S = { lead: part(), arp: part(), pad: part(), bass: part(), brass: part(), bell: part(), swell: part(), drums: part(), verb: part(), echo: part() };
function lay(sound, time, into, pan = 0, sends = {}) {
  const a = ((Math.max(-1, Math.min(1, pan)) + 1) * Math.PI) / 4, gl = Math.cos(a), gr = Math.sin(a);
  const k0 = ((Math.round(time * SR) % N) + N) % N;
  for (const [[L, Rt], g] of [[into, 1], ...Object.entries(sends).map(([name, g]) => [S[name], g])]) {
    const l = gl * g, r = gr * g;
    for (let i = 0, k = k0; i < sound.length; i++, k++) { if (k >= N) k -= N; L[k] += sound[i] * l; Rt[k] += sound[i] * r; }
  }
}

/* ── the instruments, each after the General MIDI program it stands for ── */
/* 81, Lead 1 (square): a square whose width drifts a little, and a second a few cents sharp under it (the chorus a GM
   synth puts on it); a held note is shaken a little once it has sounded a while */
function lead(midi, vel, hold) {
  const f0 = hz(midi), n = Math.ceil((hold + 0.2) * SR), out = new Float32Array(n), lp = svf();
  let p = R(), p2 = R();
  for (let i = 0; i < n; i++) {
    const t = i / SR, wob = hold > 0.5 ? 0.0075 * Math.sin(TAU * 5.6 * (t - 0.22)) * smooth((t - 0.22) / 0.3) : 0;
    const dt = (f0 * (1 + wob)) / SR;
    if ((p += dt) >= 1) p -= 1;
    if ((p2 += dt * 1.0041) >= 1) p2 -= 1;
    const x = pulse(p, dt, 0.5 + 0.07 * Math.sin(TAU * 0.7 * t)) + 0.4 * pulse(p2, dt * 1.0041, 0.5);
    const env = (1 - Math.exp(-t / 0.004)) * (0.8 + 0.2 * Math.exp(-t / 0.12)) * (t > hold ? Math.exp(-(t - hold) / 0.04) : 1);
    out[i] = 0.45 * vel * env * lp(x, 4800, 0.65);
  }
  return fade(out, 0.03);
}
/* 6, Electric Piano 2: the DX7's piano, a sine bent by another at its own pitch, hard at first and soon softer, with the
   brief ring of the tine above it */
function epiano(midi, vel, hold) {
  const f = hz(midi), n = Math.ceil((hold + 0.45) * SR), out = new Float32Array(n);
  const tau = 1.6 * Math.sqrt(261.63 / f), bright = 0.9 + 1.8 * vel, w = (TAU * f) / SR;
  for (let i = 0; i < n; i++) {
    const t = i / SR, ph = w * i;
    const env = (1 - Math.exp(-t / 0.0015)) * Math.exp(-t / tau) * (t > hold ? Math.exp(-(t - hold) / 0.12) : 1);
    const index = bright * Math.exp(-t / 0.25) + 0.35;
    out[i] = 0.6 * vel * env * (Math.sin(ph + index * Math.sin(ph)) + 0.22 * Math.exp(-t / 0.04) * Math.sin(ph * 14));
  }
  return fade(out, 0.02);
}
/* 90, Pad 2 (warm): saws a few cents apart, each through a soft low-pass that breathes, slow to come and slow to go.
   Made a voice at a time, so that the voices can be spread across the stereo */
function padVoice(midi, cents, vel, hold) {
  const f = hz(midi) * 2 ** (cents / 1200), dt = f / SR, n = Math.ceil((hold + 1) * SR), out = new Float32Array(n), lp = svf();
  let p = R();
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    if ((p += dt) >= 1) p -= 1;
    const env = smooth(t / 0.3) * (t > hold ? Math.exp(-(t - hold) / 0.3) : 1);
    out[i] = 0.3 * vel * env * lp(saw(p, dt), 1150 + 350 * Math.sin(TAU * 0.25 * t + midi), 0.75);
  }
  return fade(out, 0.2);
}
/* 39, Synth Bass 1: a saw and a square together, behind a resonant low-pass that opens at each note's start and snaps
   shut. Its oscillators start afresh with every note, as a monophonic synth's do */
function bass(midi, vel, hold) {
  const f0 = hz(midi), dt = f0 / SR, n = Math.ceil((hold + 0.1) * SR), out = new Float32Array(n), a = svf(), b = svf();
  let p = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    if ((p += dt) >= 1) p -= 1;
    const x = saw(p, dt) + 0.35 * pulse(p, dt, 0.5);
    const fc = 180 + 2.5 * f0 + (700 + 1500 * vel) * Math.exp(-t / 0.085);
    const env = (1 - Math.exp(-t / 0.0015)) * (0.72 + 0.28 * Math.exp(-t / 0.14)) * (t > hold ? Math.exp(-(t - hold) / 0.02) : 1);
    out[i] = 0.75 * Math.tanh(1.5 * vel * env * b(a(x, fc, 1.2), fc, 0.71));
  }
  return fade(out, 0.012);
}
/* 63, Synth Brass 1: a saw behind a low-pass that swells open at the start (the blare) and settles back */
function brassVoice(midi, cents, vel, hold) {
  const f = hz(midi) * 2 ** (cents / 1200), dt = f / SR, n = Math.ceil((hold + 0.3) * SR), out = new Float32Array(n), a = svf(), b = svf();
  let p = R();
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    if ((p += dt) >= 1) p -= 1;
    const gone = t > hold ? Math.exp(-(t - hold) / 0.08) : 1, fc = 400 + (2600 + 1800 * vel) * smooth(t / 0.05) * (0.55 + 0.45 * Math.exp(-t / 0.25)) * gone;
    out[i] = 0.35 * vel * smooth(t / 0.012) * gone * b(a(saw(p, dt), fc, 0.9), fc, 0.6);
  }
  return fade(out, 0.05);
}
/* 10, Glockenspiel: a struck bar, whose overtones lie where a bar's do (not a string's), the high ones gone first */
function glock(midi, vel) {
  const f = hz(midi), n = Math.round(1.8 * SR), out = new Float32Array(n);
  const modes = [[1, 1, 1.1], [2.76, 0.35, 0.35], [5.4, 0.15, 0.12], [8.93, 0.06, 0.06]].filter(([r]) => f * r < 0.45 * SR);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let y = 0;
    for (const [r, a, tau] of modes) y += a * Math.sin(TAU * f * r * t) * Math.exp(-t / tau);
    out[i] = 0.5 * vel * y * (1 - Math.exp(-t / 0.0006));
  }
  return fade(out, 0.2);
}
/* 120, Reverse Cymbal: a cymbal's ring played backwards, swelling to the moment it would have been struck */
function reverseCymbal(secs, vel) {
  const n = Math.round(secs * SR), out = new Float32Array(n), air = series(biquad('hp', 3000), biquad('hp', 3000), biquad('peak', 8000, 0.8, 4));
  for (let i = 0; i < n; i++) out[i] = vel * air(R() * 2 - 1) * Math.exp(-i / SR / (secs / 3.5));
  out.reverse();
  return fade(out, 0.005);
}
/* the drums, a drum machine's (General MIDI's notes for them: 36 kick, 38 snare, 39 clap, 42 and 46 the hat shut and
   open, 49 crash, 45 47 50 the toms) */
function kick(vel) {                              // a sine whose pitch falls fast, a click on it, pushed a little
  const n = Math.round(0.5 * SR), out = new Float32Array(n), click = biquad('lp', 4000);
  for (let i = 0, ph = 0; i < n; i++) {
    const t = i / SR;
    ph += (TAU * (48 + 110 * Math.exp(-t / 0.035))) / SR;
    out[i] = vel * ((Math.tanh(1.6 * Math.sin(ph) * Math.exp(-t / 0.28)) / Math.tanh(1.6)) * (1 - Math.exp(-t / 0.001)) + 0.35 * click((R() * 2 - 1) * Math.exp(-t / 0.004)));
  }
  return fade(out, 0.05);
}
function snare(vel) {                             // the eighties' snare: its tone and its rattle, and a room behind them that is cut off short (a gated reverb)
  const n = Math.round(0.45 * SR), out = new Float32Array(n);
  const rattle = series(biquad('hp', 600), biquad('peak', 2400, 0.8, 4)), room = series(biquad('bp', 1700, 0.5), biquad('lp', 6500));
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const body = 0.6 * Math.sin(TAU * 185 * t) * Math.exp(-t / 0.06) + 0.3 * Math.sin(TAU * 330 * t) * Math.exp(-t / 0.04);
    const gate = smooth(t / 0.012) * (t < 0.2 ? 1 : Math.exp(-(t - 0.2) / 0.012));
    out[i] = vel * (1 - Math.exp(-t / 0.0007)) * (body + 1.1 * rattle(R() * 2 - 1) * Math.exp(-t / 0.09) + 0.75 * room(R() * 2 - 1) * gate * (0.6 + 0.4 * Math.exp(-t / 0.15)));
  }
  return fade(out, 0.03);
}
function clap(vel) {                              // three hands not quite together, and the room after them
  const n = Math.round(0.3 * SR), out = new Float32Array(n), band = series(biquad('bp', 1150, 0.9), biquad('hp', 500));
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let e = t >= 0.028 ? 0.55 * Math.exp(-(t - 0.028) / 0.07) : 0;
    for (const s of [0, 0.009, 0.019]) if (t >= s) e = Math.max(e, Math.exp(-(t - s) / 0.006));
    out[i] = 1.6 * vel * band(R() * 2 - 1) * e;
  }
  return fade(out, 0.02);
}
const METAL = [205.3, 304.4, 369.6, 522.7, 540, 800];   // six squares out of tune with each other: the 808's cymbals
function metal(t, k) { let x = 0; for (const f of METAL) x += Math.sin(TAU * f * k * t) > 0 ? 1 : -1; return x / 6; }
function hat(vel, open, until = 1) {              // (an open hat is stopped by the next hat: the two plates closing)
  const n = Math.round(Math.min(open ? 0.5 : 0.08, until) * SR), out = new Float32Array(n), air = series(biquad('bp', 10000, 0.7), biquad('hp', 7000));
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    out[i] = 0.55 * vel * air(metal(t, 1.7) + 0.3 * (R() * 2 - 1)) * Math.exp(-t / (open ? 0.17 : 0.022)) * (1 - Math.exp(-t / 0.0004));
  }
  return fade(out, 0.006);
}
function crash(vel) {
  const n = Math.round(2.2 * SR), out = new Float32Array(n), air = series(biquad('hp', 3500), biquad('peak', 6500, 0.7, 3), biquad('lp', 13000));
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    out[i] = 0.4 * vel * air(0.7 * (R() * 2 - 1) + 0.3 * metal(t, 1.9)) * (Math.exp(-t / 0.65) + 0.4 * Math.exp(-t / 0.08)) * (1 - Math.exp(-t / 0.001));
  }
  return fade(out, 0.3);
}
function tom(f, vel) {                            // a sine that drops into its pitch, and a gated room like the snare's
  const n = Math.round(0.6 * SR), out = new Float32Array(n), room = series(biquad('bp', f * 2.5, 0.6), biquad('lp', 5000));
  for (let i = 0, ph = 0; i < n; i++) {
    const t = i / SR;
    ph += (TAU * f * (1 + 0.6 * Math.exp(-t / 0.05))) / SR;
    const gate = t < 0.22 ? 1 : Math.exp(-(t - 0.22) / 0.015);
    out[i] = vel * (Math.sin(ph) * Math.exp(-t / 0.22) + 0.35 * room(R() * 2 - 1) * Math.exp(-t / 0.1) * gate) * (1 - Math.exp(-t / 0.001));
  }
  return fade(out, 0.04);
}
const DRUM = { 36: kick, 38: snare, 39: clap, 42: v => hat(v, false), 49: crash, 45: v => tom(98, v), 47: v => tom(131, v), 50: v => tom(175, v) };
const DRUM_PAN = { 36: 0, 38: 0, 39: 0.08, 42: 0.3, 46: 0.3, 49: -0.3, 45: 0.35, 47: 0, 50: -0.35 };

/* what each part is in General MIDI: its channel, and its program (counted from 0, as a MIDI file has it) */
const PARTS = {
  lead: { channel: 0, program: 80, name: 'Lead 1 (square)' },
  arp: { channel: 1, program: 5, name: 'Electric Piano 2' },
  pad: { channel: 2, program: 89, name: 'Pad 2 (warm)' },
  bass: { channel: 3, program: 38, name: 'Synth Bass 1' },
  brass: { channel: 4, program: 62, name: 'Synth Brass 1' },
  bell: { channel: 5, program: 9, name: 'Glockenspiel' },
  swell: { channel: 6, program: 119, name: 'Reverse Cymbal' },
  drums: { channel: 9, program: 25, name: 'Drums (TR-808)' }   // (channel 10, the drums'; program 26 is the 808 kit where there are kits)
};
const GATE = { lead: 0.94, brass: 0.95 };          // how much of its written length a note sounds for (the rest: all of it)

/* ── the score: what each part plays, as a MIDI file has it, in beats from the start of the loop ── */
const score = [];
const play = (part, note, beat, beats, vel) => score.push({ part, note, beat, beats, vel: Math.max(0.05, Math.min(1, vel)) });
const HARMONY = [['Am', 'F', 'C', 'G', 'E7'], ['Am', 'F', 'C', 'G', 'E7'], ['Dm', 'G7', 'C', 'F', 'E7'], ['Am', 'F', 'C', 'G', 'E7']];
const CHORD = {                                    // the pad's four notes, the arpeggio's four, and the bass's root
  Am: { pad: [57, 60, 64, 69], arp: [69, 72, 76, 81], root: 33 },
  F: { pad: [57, 60, 65, 69], arp: [69, 72, 77, 81], root: 29 },
  C: { pad: [55, 60, 64, 67], arp: [67, 72, 76, 79], root: 36 },
  G: { pad: [55, 59, 62, 67], arp: [67, 71, 74, 79], root: 31 },
  G7: { pad: [55, 59, 62, 65], arp: [67, 71, 74, 77], root: 31 },
  Dm: { pad: [57, 62, 65, 69], arp: [69, 74, 77, 81], root: 26 },
  E7: { pad: [56, 59, 62, 64], arp: [68, 71, 74, 76], root: 28 }
};
// the tune: [bar of the five, beat, note, beats, how hard]. A is heard twice, the second time ending on a long E that the
// echo carries round into the start; B, once, between them, higher
const A = [
  [0, 0, 76, 1.5, 0.8], [0, 1.5, 74, 0.5, 0.65], [0, 2, 72, 1, 0.75], [0, 3, 71, 0.5, 0.6], [0, 3.5, 69, 0.5, 0.6],
  [1, 0, 69, 1.5, 0.75], [1, 1.5, 72, 0.5, 0.6], [1, 2, 77, 1.5, 0.8], [1, 3.5, 76, 0.5, 0.6],
  [2, 0, 76, 1.5, 0.8], [2, 1.5, 74, 0.5, 0.65], [2, 2, 72, 1, 0.75], [2, 3, 74, 0.5, 0.6], [2, 3.5, 76, 0.5, 0.65],
  [3, 0, 74, 1.5, 0.8], [3, 1.5, 71, 0.5, 0.6], [3, 2, 67, 1.5, 0.7], [3, 3.5, 69, 0.5, 0.6],
  [4, 0, 71, 1.5, 0.75], [4, 1.5, 72, 0.5, 0.6], [4, 2, 71, 1, 0.7], [4, 3, 68, 1, 0.75]
];
const B = [
  [0, 0, 81, 1.5, 0.85], [0, 1.5, 79, 0.5, 0.65], [0, 2, 77, 1, 0.75], [0, 3, 76, 0.5, 0.6], [0, 3.5, 74, 0.5, 0.6],
  [1, 0, 79, 1.5, 0.8], [1, 1.5, 77, 0.5, 0.65], [1, 2, 74, 1, 0.7], [1, 3, 71, 0.5, 0.6], [1, 3.5, 74, 0.5, 0.6],
  [2, 0, 79, 1.5, 0.8], [2, 1.5, 76, 0.5, 0.65], [2, 2, 72, 1, 0.7], [2, 3, 76, 0.5, 0.6], [2, 3.5, 79, 0.5, 0.65],
  [3, 0, 81, 2, 0.9], [3, 2, 79, 0.5, 0.65], [3, 2.5, 77, 0.5, 0.6], [3, 3, 76, 0.5, 0.6], [3, 3.5, 77, 0.5, 0.65],
  [4, 0, 76, 1.5, 0.8], [4, 1.5, 74, 0.5, 0.6], [4, 2, 71, 1, 0.7], [4, 3, 68, 1, 0.75]
];
const A2 = [
  [0, 0, 76, 1.5, 0.8], [0, 1.5, 74, 0.5, 0.65], [0, 2, 72, 1, 0.75], [0, 3, 71, 0.5, 0.6], [0, 3.5, 72, 0.5, 0.6],
  [1, 0, 69, 1.5, 0.75], [1, 1.5, 72, 0.5, 0.6], [1, 2, 77, 1, 0.8], [1, 3, 76, 0.5, 0.6], [1, 3.5, 72, 0.5, 0.6],
  [2, 0, 76, 1.5, 0.8], [2, 1.5, 74, 0.5, 0.65], [2, 2, 72, 1, 0.75], [2, 3, 67, 1, 0.65],
  [3, 0, 71, 1, 0.7], [3, 1, 74, 1, 0.7], [3, 2, 79, 1.5, 0.8], [3, 3.5, 77, 0.5, 0.6],
  [4, 0, 76, 3, 0.8]
];
const TUNES = [null, A, B, A2];
const DR = { kick: 36, snare: 38, clap: 39, hat: 42, open: 46, crash: 49, tomLo: 45, tomMid: 47, tomHi: 50 };
const ARP6 = [0, 1, 2, 3, 2, 1];                  // up the chord and back, in sixes against the bar's sixteenths
for (let bar = 0; bar < BARS; bar++) {
  const s = Math.floor(bar / 5), k = bar % 5, b0 = bar * 4, c = CHORD[HARMONY[s][k]], fill = k === 4, last = bar === BARS - 1;
  // the pad: the chord, held the bar long
  for (const m of c.pad) play('pad', m, b0, 4, [0.5, 0.45, 0.42, 0.5][s]);
  // the bass: eighths, the root and its octave; at the very end it walks down to the A it begins on
  if (last) [40, 38, 35, 32].forEach((m, i) => play('bass', m, b0 + i, 0.9, [0.9, 0.8, 0.8, 0.85][i]));
  else for (let e = 0; e < 8; e++) play('bass', c.root + [0, 0, 12, 0, 0, 12, 0, 12][e], b0 + e / 2, 0.42, [1, 0.7, 0.85, 0.7, 0.95, 0.7, 0.85, 0.75][e] * (s === 0 ? 0.85 : 1));
  // the electric piano: the arpeggio in sixteenths through the first five and the last; quiet eighths under the tune's
  // first time; nothing under the brass
  if (s === 0 || s === 3) for (let x = 0; x < 16; x++) play('arp', c.arp[ARP6[x % 6]], b0 + x / 4, 0.2, (x % 4 === 0 ? 0.72 : 0.5) * (s === 3 ? 0.8 : 1));
  if (s === 1) for (let x = 0; x < 8; x++) play('arp', c.arp[[0, 2, 1, 3][x % 4]], b0 + x / 2, 0.4, 0.38);
  // the brass: stabs on the one and on the "and" of two through the middle time, and one to open the loop
  if (s === 2) for (const m of c.pad) { play('brass', m, b0, 1.25, 0.75); play('brass', m, b0 + 1.5, 0.75, 0.6); }
  if (bar === 0) for (const m of c.pad) play('brass', m, b0, 1.5, 0.8);
  // the drums, in sixteenths of the bar
  const hit = (name, x, vel) => play('drums', DR[name], b0 + x / 4, 0.25, vel);
  if (k === 0) hit('crash', 0, [0.75, 0.6, 0.85, 0.65][s]);
  hit('kick', 0, 0.95);
  if (!last) hit('snare', 8, 0.9);
  if (s > 0 && !last) hit('clap', 8, 0.55);
  if (!fill) {
    hit('kick', 6, 0.7);
    if (s === 2) hit('kick', 10, 0.6);
    if (k === 1 && s > 0) hit('snare', 15, 0.22);                       // a ghost note into the next bar
    const opens = s === 0 ? [] : s === 2 ? [6, 14] : [14];
    for (let x = 0; x < 16; x += s === 2 ? 1 : 2)                       // eighths; sixteenths in the middle time
      if (opens.includes(x)) hit('open', x, 0.42);
      else hit('hat', x, x % 4 === 2 ? 0.55 : x % 2 ? 0.25 : 0.38);
  } else if (s === 0) {                                                 // the fills: a roll on the snare,
    for (let x = 0; x < 12; x += 2) hit('hat', x, x % 4 === 2 ? 0.5 : 0.35);
    [12, 13, 14, 15].forEach((x, i) => hit('snare', x, 0.45 + 0.12 * i));
  } else if (s === 1) {                                                 // down the toms,
    for (let x = 0; x < 8; x += 2) hit('hat', x, x % 4 === 2 ? 0.5 : 0.35);
    [['tomHi', 10], ['tomHi', 11], ['tomMid', 12], ['tomMid', 13], ['tomLo', 14], ['tomLo', 15]].forEach(([d, x], i) => hit(d, x, 0.7 - (i % 2) * 0.1));
  } else if (s === 2) {                                                 // the snare rolling up into the last time,
    hit('kick', 6, 0.7);
    for (let x = 0; x < 8; x += 2) hit('hat', x, x % 4 === 2 ? 0.5 : 0.35);
    for (let x = 9; x < 16; x++) hit('snare', x, 0.3 + 0.085 * (x - 9));
  } else {                                                              // and the big one, round to the start
    [['snare', 4, 0.8], ['snare', 6, 0.6], ['tomHi', 8, 0.8], ['tomHi', 9, 0.65], ['tomMid', 10, 0.8], ['tomMid', 11, 0.65],
      ['tomLo', 12, 0.85], ['tomLo', 13, 0.7], ['kick', 14, 0.9], ['snare', 14, 0.9], ['snare', 15, 0.75]].forEach(([d, x, v]) => hit(d, x, v));
    play('swell', 60, b0, 4, 0.7);                                       // the cymbal backwards, up to the crash that opens the loop
  }
  // the tune
  if (TUNES[s]) for (const [kk, beat, m, len, vel] of TUNES[s]) if (kk === k) play('lead', m, b0 + beat, len, vel);
}
// the bell for the fourth star: up a fourth as it lights, down as it goes out
for (const [on, off] of scene.FOURTH) {
  const a = Math.round(on / BEAT), b = Math.round(off / BEAT);
  play('bell', 88, a, 0.5, 0.6); play('bell', 93, a + 0.25, 0.75, 0.65);
  play('bell', 93, b, 0.5, 0.35); play('bell', 88, b + 0.25, 0.75, 0.3);
}

/* ── the score played ── */
const hats = score.filter(e => e.part === 'drums' && (e.note === 42 || e.note === 46)).map(e => e.beat).sort((a, b) => a - b);
const kicks = [];
for (const e of score) {
  const t = e.beat * BEAT, hold = e.beats * BEAT * (GATE[e.part] ?? 1), v = e.vel;
  if (e.part === 'lead') lay(lead(e.note, v, hold), t, S.lead, -0.04, { verb: 0.2, echo: 0.32 });
  else if (e.part === 'arp') lay(epiano(e.note, v, hold), t, S.arp, 0.28, { verb: 0.14, echo: 0.2 });
  else if (e.part === 'pad') [-8, 0, 8].forEach((cents, i) => lay(padVoice(e.note, cents, v, hold), t, S.pad, [-0.65, 0, 0.65][i], { verb: 0.28 }));
  else if (e.part === 'bass') lay(bass(e.note, v, hold), t, S.bass, 0);
  else if (e.part === 'brass') [-7, 7].forEach((cents, i) => lay(brassVoice(e.note, cents, v, hold), t, S.brass, [-0.45, 0.45][i], { verb: 0.2 }));
  else if (e.part === 'bell') lay(glock(e.note, v), t, S.bell, e.note > 90 ? 0.4 : -0.4, { verb: 0.45, echo: 0.3 });
  else if (e.part === 'swell') lay(reverseCymbal(hold, v), t, S.swell, -0.25, { verb: 0.15 });
  else {
    if (e.note === 36) kicks.push(t);
    const next = hats.find(b => b > e.beat + 1e-9) ?? hats[0] + BARS * 4;
    const sound = e.note === 46 ? hat(v, true, (next - e.beat) * BEAT) : DRUM[e.note](v);
    lay(sound, t, S.drums, DRUM_PAN[e.note], [38, 39, 45, 47, 50].includes(e.note) ? { verb: 0.12 } : {});
  }
}
// what the kick pushes down a little each time it strikes (the "pumping" of a sidechained synth)
const duck = (depth, tau) => {
  const d = new Float32Array(N).fill(1);
  for (const tk of kicks) {
    const k0 = Math.round(tk * SR);
    for (let i = 0; i < 6 * tau * SR; i++) {
      const t = i / SR, e = (1 - Math.exp(-t / 0.003)) * Math.exp(-t / tau), k = (k0 + i) % N;
      d[k] = Math.min(d[k], 1 - depth * e);
    }
  }
  return d;
};

/* ── the mix. Every part is played three times over and processed so, and the middle time is the one kept: in it the
   filters, the room and the echo are already ringing with what came before, as they are each time round ── */
const M = 3 * N;
const thrice = a => { const b = new Float32Array(M); b.set(a, 0); b.set(a, N); b.set(a, 2 * N); return b; };
const through = (sides, make) => sides.map(side => { const f = make(), b = thrice(side); for (let i = 0; i < M; i++) b[i] = f(b[i]); return b; });
const P = {
  lead: through(S.lead, () => series(biquad('hp', 140), biquad('lp', 9000))),
  arp: through(S.arp, () => series(biquad('hp', 220), biquad('lp', 7500))),
  pad: through(S.pad, () => series(biquad('hp', 160), biquad('lp', 6000))),
  bass: through(S.bass, () => series(biquad('hp', 28), biquad('lp', 3000))),
  brass: through(S.brass, () => series(biquad('hp', 130), biquad('lp', 8000))),
  bell: through(S.bell, () => biquad('hp', 400)),
  swell: through(S.swell, () => biquad('hp', 1500)),
  drums: through(S.drums, () => series(biquad('hp', 30), x => Math.tanh(0.8 * x) / 0.8))
};
for (const [name, d] of [['pad', duck(0.3, 0.16)], ['arp', duck(0.25, 0.16)], ['brass', duck(0.2, 0.12)], ['bass', duck(0.3, 0.06)]])
  for (const side of P[name]) for (let i = 0; i < M; i++) side[i] *= d[i % N];
P.verb = freeverb(thrice(S.verb[0]), thrice(S.verb[1])).map(side => { const f = series(biquad('hp', 250), biquad('lp', 6500)); return side.map(f); });
P.echo = pingpong(thrice(S.echo[0]), thrice(S.echo[1]));

const report = [];
for (const [name, target] of Object.entries(LEVELS)) {
  const was = loudness(P[name]), g = 10 ** ((target - was) / 20);
  for (const side of P[name]) for (let i = 0; i < M; i++) side[i] *= g;
  report.push(`${name} ${was.toFixed(1)} → ${target}`);
}
console.log('parts (LUFS as made → as set):', report.join(', '));
const master = [0, 1].map(c => {
  const b = new Float32Array(M), f = series(biquad('hp', 25), x => Math.tanh(1.05 * x) / 1.05);
  for (const name of Object.keys(LEVELS)) { const x = P[name][c]; for (let i = 0; i < M; i++) b[i] += x[i]; }
  for (let i = 0; i < M; i++) b[i] = f(b[i]);
  return b;
});
// as loud as it should be, and no louder than the ceiling (twice: the limiter takes a little off)
let lufs = loudness(master), most = 0;
for (let pass = 0; pass < 2; pass++) {
  const g = 10 ** ((TARGET - lufs) / 20);
  for (const side of master) for (let i = 0; i < M; i++) side[i] *= g;
  for (const side of master) for (let i = N; i < 2 * N; i++) most = Math.max(most, Math.abs(side[i]));
  const held = limiter(master, CEILING);
  lufs = loudness(held);
  if (pass === 1 || Math.abs(lufs - TARGET) < 0.1) { master[0] = held[0]; master[1] = held[1]; break; }
  most = 0;
}
const keep = master.map(side => side.slice(N, 2 * N));
let peak = 0, seam = 0;
for (const side of keep) for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(side[i]));
for (let c = 0; c < 2; c++) for (let i = 0; i < N - 2000; i++) seam = Math.max(seam, Math.abs(master[c][N + i] - master[c][2 * N + i]));
const over = 20 * Math.log10(most / 10 ** (CEILING / 20));
console.log(`music: ${loudness(master).toFixed(1)} LUFS, sample peak ${(20 * Math.log10(peak)).toFixed(1)} dBFS (` +
  (over > 0 ? `the limiter took up to ${over.toFixed(1)} dB off the loudest moments` : `the limiter had nothing to do: the loudest moment was ${(-over).toFixed(1)} dB under the ceiling`) +
  `); one time round against the next differs by at most ${(20 * Math.log10(seam + 1e-12)).toFixed(0)} dBFS`);
console.log('share of the energy (dB) below 60 Hz, 60–250, 250–1k, 1k–4k, above 4k:', bands(keep).map(v => v.toFixed(1)).join(', '));
writeWav(OUT, keep[0], keep[1]);
console.log('wrote', path.relative(ROOT, OUT));
writeMidi(MIDI_OUT, score);
console.log(`wrote ${path.relative(ROOT, MIDI_OUT)}: ${score.length} notes on ${new Set(score.map(e => e.part)).size} tracks`);

const into = flag('into');
if (into) {
  const film = path.resolve(ROOT, into), tmp = film.replace(/\.mp4$/, '') + '.with-music.mp4';
  const run = list => { const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...list], { stdio: 'inherit' }); if (r.status) throw new Error('ffmpeg stopped with code ' + r.status); };
  // (FFmpeg's own AAC encoder, which marks where its last frame's padding begins, so the sound is exactly the loop's length
  // and a player going round again hears no gap. Cut to the film's length.)
  const length = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=duration', '-of', 'csv=p=0', film]).stdout.toString().trim();
  run(['-i', film, '-i', OUT, '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-ac', '2', '-t', length, '-movflags', '+faststart', tmp]);
  fs.renameSync(tmp, film);
  console.log('put into', path.relative(ROOT, film));
}

/* ── the machinery ── */
/* a room (Freeverb: eight damped combs and four allpasses a side, the right side's a little longer) */
function freeverb(inL, inR, room = 0.82, damp = 0.4) {
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
function pingpong(inL, inR, secs = 0.75 * BEAT, fb = 0.38) {
  const d = Math.round(secs * SR), n = inL.length, bl = new Float32Array(d), br = new Float32Array(d), out = [new Float32Array(n), new Float32Array(n)];
  const tl = series(biquad('hp', 400), biquad('lp', 3200)), tr = series(biquad('hp', 400), biquad('lp', 3200));
  for (let i = 0, k = 0; i < n; i++) {
    const oL = bl[k], oR = br[k];
    out[0][i] = oL; out[1][i] = oR;
    bl[k] = (inL[i] + inR[i]) * 0.5 + fb * tr(oR);
    br[k] = fb * tl(oL);
    if (++k >= d) k = 0;
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
/* the score as a Standard MIDI File (format 1, 480 ticks a beat): a track for the tempo, and one to each part */
function writeMidi(file, events) {
  const PPQ = 480, tick = beats => Math.round(beats * PPQ), end = tick(BARS * 4);
  const vlq = n => { const b = [n & 0x7f]; while ((n >>>= 7)) b.unshift((n & 0x7f) | 0x80); return b; };
  const meta = (type, bytes) => [0xff, type, ...vlq(bytes.length), ...bytes];
  const text = s => [...Buffer.from(s, 'latin1')];
  const chunk = (id, bytes) => { const len = Buffer.alloc(4); len.writeUInt32BE(bytes.length); return Buffer.concat([Buffer.from(id, 'latin1'), len, Buffer.from(bytes)]); };
  // (at the same tick: what sets a track up, then the notes that end, then the notes that start)
  const track = list => {
    list.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const out = [];
    let at = 0;
    for (const [t, , bytes] of list) { out.push(...vlq(t - at), ...bytes); at = t; }
    out.push(...vlq(Math.max(0, end - at)), 0xff, 0x2f, 0x00);         // (every track ends where the loop does)
    return chunk('MTrk', out);
  };
  const us = Math.round(BEAT * 1e6);
  const tracks = [track([
    [0, 0, meta(0x03, text('Vice Corner'))],
    [0, 0, meta(0x51, [(us >> 16) & 255, (us >> 8) & 255, us & 255])],    // 450000 microseconds a beat: 133 1/3 a minute
    [0, 0, meta(0x58, [4, 2, 24, 8])]                                       // four four
  ])];
  for (const [name, p] of Object.entries(PARTS)) {
    const mine = events.filter(e => e.part === name);
    if (!mine.length) continue;
    const ch = p.channel, list = [[0, 0, meta(0x03, text(p.name))], [0, 0, [0xc0 | ch, p.program]]];
    for (const e of mine) {
      const on = tick(e.beat), off = Math.max(on + 1, tick(e.beat + e.beats * (GATE[name] ?? 1)));
      list.push([on, 2, [0x90 | ch, e.note, Math.max(1, Math.round(e.vel * 127))]], [off, 1, [0x80 | ch, e.note, 64]]);
    }
    tracks.push(track(list));
  }
  const head = Buffer.alloc(14);
  head.write('MThd', 0, 'latin1'); head.writeUInt32BE(6, 4); head.writeUInt16BE(1, 8); head.writeUInt16BE(tracks.length, 10); head.writeUInt16BE(PPQ, 12);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.concat([head, ...tracks]));
}
