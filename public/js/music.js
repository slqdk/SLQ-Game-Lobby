// SLQ Game Lobby — the music box's tunes: pieces of our own, played with WebAudio by a small sequencer (no sound
// files, and nobody else's melodies). Everybody in the clubhouse hears the same tune at the same place: the server
// says which one was put on and when, and each browser works out how far into it that is.
//
// A tune is written bar by bar. `chords` has one chord for each bar ('D7,G7' shares a bar between two); `tune` has
// the melody of each bar as notes with a length in eighths after a colon ('g5:2' is a quarter note, '-' a rest).
// `style` says how the chords are played underneath. The names of the tunes are in shared/defs.js (JUKE).
import { output } from './sfx.js';

const TUNES = {
  // a honky-tonk piano: left hand jumps between bass and chord, right hand in pushed rhythms
  rag: {
    bpm: 176, beats: 4, style: 'stride', lead: 'piano',
    chords: 'C C G7 G7 G7 G7 C C  C C7 F Fm C A7 D7,G7 C  E7 E7 A7 A7 D7 D7 G7 G7  C C7 F Fm C A7 D7,G7 C',
    tune: [
      'e5 g5:2 e5 c6:2 a5 g5', 'e5:2 c5 e5 g5:4', 'f5 g5:2 f5 b5:2 a5 g5', 'f5:2 d5 f5 g5:4',
      'd5 f5:2 d5 b5:2 g5 f5', 'd5:2 b4 d5 f5:4', 'e5 g5:2 e5 c6:2 d6 e6', 'c6:4 - g5 a5 b5',
      'c6 e6:2 c6 g5:2 e5 g5', 'bb5:2 g5 e5 c6:4', 'a5 c6:2 a5 f5:2 a5 c6', 'ab5:2 f5 ab5 c6:4',
      'g5 c6:2 g5 e5:2 g5 c6', 'c#6:2 a5 e5 g5:4', 'a5 f#5 d5 f#5 g5 b5 d6 f6', 'e6:2 c6 g5 c6:2 -:2',
      'b5:3 g#5 e5:2 g#5 b5', 'd6:2 b5 g#5 b5:4', 'a5:3 c#6 e6:2 c#6 a5', 'g5:2 e5 c#5 e5:4',
      'a5:3 f#5 d5:2 f#5 a5', 'c6:2 a5 f#5 a5:4', 'g5:3 b5 d6:2 b5 g5', 'f5:2 d5 b4 d5 g5 a5 b5',
      'c6 e6:2 c6 g5:2 e5 g5', 'bb5:2 g5 e5 c6:4', 'a5 c6:2 a5 f5:2 a5 c6', 'ab5:2 f5 ab5 c6:4',
      'g5 c6:2 g5 e5:2 g5 c6', 'c#6:2 a5 e5 g5:4', 'a5 f#5 d5 f#5 g5 b5 d6 f6', 'e6:2 c6 g5 c6:2 -:2',
    ],
  },
  // a slow waltz: a mouth organ over a strummed guitar
  waltz: {
    bpm: 112, beats: 3, style: 'waltz', lead: 'harp',
    chords: 'G G D7 D7 D7 D7 G G  G G7 C C G D7 G G  Em Em C C G G D7 D7  G G7 C Cm G D7 G G',
    tune: [
      'd5:2 g5:2 b5:2', 'a5:4 g5:2', 'f#5:2 a5:2 c6:2', 'b5:4 a5:2',
      'd5:2 f#5:2 a5:2', 'c6:3 b5 a5:2', 'b5:6', 'g5:4 d5:2',
      'd5:2 g5:2 b5:2', 'd6:4 b5:2', 'c6:2 e6:2 d6:2', 'c6:4 a5:2',
      'b5:2 d6:2 b5:2', 'a5:3 g5 f#5:2', 'g5:6', '-:4 b5:2',
      'e6:4 b5:2', 'g5:4 b5:2', 'e6:2 d6:2 c6:2', 'g5:4 a5:2',
      'b5:4 g5:2', 'd5:4 g5:2', 'a5:2 b5:2 a5:2', 'f#5:4 d5:2',
      'd5:2 g5:2 b5:2', 'd6:4 f6:2', 'e6:2 c6:2 e6:2', 'eb6:4 c6:2',
      'd6:2 b5:2 g5:2', 'a5:3 b5 a5:2', 'g5:6', '-:6',
    ],
  },
  // twelve bars, twice: a rolling bass and a piano that answers itself
  blues: {
    bpm: 116, beats: 4, style: 'shuffle', lead: 'piano', swing: 0.17,
    chords: 'A7 D7 A7 A7 D7 D7 A7 A7 E7 D7 A7 E7  A7 D7 A7 A7 D7 D7 A7 A7 E7 D7 A7 A7',
    tune: [
      '- a4 c5 d5 e5:2 g5 e5', 'd5:2 c5 a4 c5:4', '- a4 c5 d5 eb5 e5 g5 a5', 'g5:2 e5 c5 a4:4',
      '- d5 f#5 a5 c6:2 a5 f#5', 'c6:2 a5 f#5 d5:4', '- a4 c5 d5 e5:2 g5 e5', 'a5:3 g5 e5:4',
      'b5:2 g#5 e5 b5:2 d6:2', 'c6:2 a5 f#5 a5:2 c6:2', 'a5 g5 e5 d5 c5 a4:3', '-:2 e5 g#5 b5:2 e5:2',
      'a5:2 - a5 c6 a5 g5 e5', 'f#5:2 - f#5 a5 f#5 d5 c5', 'e5:2 - e5 g5 e5 d5 c5', 'a4:3 c5 d5 eb5 e5:2',
      'f#5 a5:2 f#5 c6 a5:2 f#5', 'd5:2 f#5 a5 c6:4', 'e5 g5:2 e5 a5 g5:2 e5', 'c5:2 d5 eb5 e5:4',
      'g#5:2 b5:2 d6:2 b5:2', 'f#5:2 a5:2 c6:2 a5:2', 'a5 g5 e5 d5 c5 a4 c5 d5', 'a4:6 -:2',
    ],
  },
  // by the camp fire: somebody whistles, somebody picks a guitar
  fire: {
    bpm: 96, beats: 4, style: 'pick', lead: 'whistle',
    chords: 'Am Am G G F F E7 E7  Am Am C C Dm E7 Am Am',
    tune: [
      'a5:4 c6:2 e6:2', 'd6:3 c6 a5:4', 'g5:4 b5:2 d6:2', 'c6:3 b5 g5:4',
      'f5:4 a5:2 c6:2', 'a5:3 g5 f5:4', 'e5:4 g#5:2 b5:2', 'd6:3 b5 g#5:4',
      'a5:2 e6:2 d6 c6 a5:2', 'c6:2 a5:6', 'g5:2 e6:2 d6 c6 g5:2', 'c6:2 e6:6',
      'f6:3 e6 d6:2 a5:2', 'g#5:2 b5:2 e6:3 d6', 'c6:2 b5:2 a5:4', '-:8',
    ],
  },
};

// ---------- reading a tune ----------
const STEP = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
const semi = (l, acc) => STEP[l] + (acc === '#' ? 1 : acc === 'b' ? -1 : 0);
const midi = n => { const m = /^([a-g])([#b]?)(\d)$/.exec(n); return semi(m[1], m[2]) + (+m[3] + 1) * 12; };          // 'a4' is 69
const freq = m => 440 * 2 ** ((m - 69) / 12);
const KINDS = { '': [0, 4, 7], m: [0, 3, 7], 7: [0, 4, 7, 10], m7: [0, 3, 7, 10], dim: [0, 3, 6, 9] };
// A chord by name: its tones close together from g3 up, its bass note (between e2 and d#3), the other bass note a
// left hand jumps to (the fifth, below when there is room), and four steps for a bass that walks.
function chord(name) {
  const m = /^([A-G])([#b]?)(.*)$/.exec(name), root = semi(m[1].toLowerCase(), m[2]), steps = KINDS[m[3]];
  const from = (lo, s) => lo + ((root + s - lo) % 12 + 12) % 12, bass = from(40, 0);
  return { tones: steps.map(st => from(55, st)).sort((p, q) => p - q), bass, alt: bass - 5 >= 38 ? bass - 5 : bass + 7, walk: [bass, bass + steps[1], bass + 7, bass + 9] };
}
// Everything that sounds in one round of the tune: { at (in beats), d (length in beats), v (what plays it), n }.
function score(tune) {
  const B = tune.beats, ev = [], bars = tune.chords.trim().split(/\s+/), sw = tune.swing || 0;
  const swung = b => { const f = b % 1; return Math.abs(f - 0.5) < 0.01 ? b + sw : b; };
  bars.forEach((names, i) => {
    const t = i * B, cs = names.split(',').map(chord), a = cs[0], z = cs[cs.length - 1], odd = i % 2;
    if (tune.style === 'stride') {
      ev.push({ at: t, d: 1, v: 'bass', n: a.bass }, { at: t + 1, d: 0.6, v: 'comp', n: a.tones }, { at: t + 2, d: 1, v: 'bass', n: cs.length > 1 ? z.bass : a.alt }, { at: t + 3, d: 0.6, v: 'comp', n: z.tones });
      ev.push({ at: t + 1, v: 'brush', n: 0.5 }, { at: t + 3, v: 'brush', n: 0.5 });
    } else if (tune.style === 'waltz') {
      ev.push({ at: t, d: 2, v: 'bass', n: odd ? a.alt : a.bass }, { at: t + 1, d: 1, v: 'strum', n: a.tones }, { at: t + 2, d: 1, v: 'strum', n: a.tones });
    } else if (tune.style === 'shuffle') {
      const w = a.walk, walk = odd ? [w[0] + 12, w[3], w[2], w[1]] : w;
      walk.forEach((n, k) => ev.push({ at: t + k, d: 0.9, v: 'bass', n }));
      ev.push({ at: swung(t + 1.5), d: 0.4, v: 'comp', n: a.tones }, { at: swung(t + 3.5), d: 0.4, v: 'comp', n: a.tones });
      for (let k = 0; k < 4; k++) { ev.push({ at: t + k, v: 'brush', n: k % 2 ? 0.8 : 0.35 }); if (k % 2) ev.push({ at: swung(t + k + 0.5), v: 'brush', n: 0.3 }); }
    } else {                                                    // picked: a bass note, then the chord one string at a time
      ev.push({ at: t, d: 2, v: 'pluck', n: a.bass }, { at: t + 2, d: 2, v: 'pluck', n: a.alt });
      [0, 1, 2, 0, 1, 2].forEach((q, k) => ev.push({ at: t + (k < 3 ? k + 1 : k + 2) / 2, d: 1.5, v: 'pluck', n: a.tones[q] + (k === 4 ? 12 : 0) }));
    }
    let at = t;
    for (const tok of tune.tune[i].trim().split(/\s+/)) {
      const [n, len = '1'] = tok.split(':'), d = +len / 2;
      if (n !== '-') ev.push({ at: swung(at), d: d - (swung(at) - at), v: tune.lead, n: midi(n) });
      at += d;
    }
    if (Math.abs(at - t - B) > 0.001) throw new Error('bar ' + (i + 1) + ' is ' + (at - t) + ' beats long');
  });
  if (tune.tune.length !== bars.length) throw new Error('chords and melody are not equally long');
  ev.sort((p, q) => p.at - q.at);
  return { ev, beats: bars.length * B };
}
const scores = {};
const scoreOf = k => scores[k] || (scores[k] = score(TUNES[k]));
export const tuneIds = () => Object.keys(TUNES);
export const tuneBeats = k => scoreOf(k).beats;                 // (also reads the tune through: the self test uses it)

// ---------- the instruments ----------
let noiseBuf = null;
function noiseOf(ctx) {
  if (!noiseBuf || noiseBuf.sampleRate !== ctx.sampleRate) { noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  return noiseBuf;
}
const osc = (ctx, type, f, det, to, t, end) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = det; o.connect(to); o.start(t); o.stop(end); return o; };
const gain = (ctx, v, to) => { const g = ctx.createGain(); g.gain.value = v; g.connect(to); return g; };
// a note that is struck and dies away
function struck(ctx, out, t, peak, len, hold = 0.3) {
  const g = gain(ctx, 0.0001, out);
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + 0.006);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak * hold), t + Math.min(0.14, len * 0.4)); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  return g;
}
// a note that is blown: swells, holds, lets go
function blown(ctx, out, t, peak, dur, rise = 0.05) {
  const g = gain(ctx, 0.0001, out), end = t + Math.max(rise + 0.04, dur * 0.94);
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + rise); g.gain.setValueAtTime(peak, end - 0.03); g.gain.linearRampToValueAtTime(0.0001, end + 0.05);
  return [g, end + 0.08];
}
function vibrato(ctx, o, t, end, depth, rate = 5.4) {
  const l = ctx.createOscillator(), lg = ctx.createGain();
  l.frequency.value = rate; lg.gain.setValueAtTime(0.0001, t); lg.gain.linearRampToValueAtTime(depth, t + 0.3);
  l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(end);
}
export const VOICE = {
  // the saloon's piano: a little out of tune with itself
  piano(ctx, out, t, d, n, v = 1) {
    const f = freq(n), len = Math.min(1.5, d + 0.35), lp = ctx.createBiquadFilter(), g = struck(ctx, out, t, 0.2 * v, len);
    lp.type = 'lowpass'; lp.frequency.setValueAtTime(Math.min(9000, f * 7 + 600), t); lp.frequency.exponentialRampToValueAtTime(Math.min(3200, f * 2.2 + 300), t + 0.35); lp.connect(g);
    osc(ctx, 'triangle', f, 0, lp, t, t + len + 0.05); osc(ctx, 'triangle', f, -11, gain(ctx, 0.55, lp), t, t + len + 0.05); osc(ctx, 'square', f, 6, gain(ctx, 0.13, lp), t, t + len + 0.05);
  },
  comp(ctx, out, t, d, ns) { ns.forEach((n, i) => VOICE.piano(ctx, out, t + i * 0.004, d, n, 0.32)); },
  bass(ctx, out, t, d, n) {
    const f = freq(n), len = Math.min(0.7, d + 0.12), g = struck(ctx, out, t, 0.34, len, 0.5);
    osc(ctx, 'sine', f, 0, g, t, t + len + 0.05); osc(ctx, 'triangle', f * 2, 0, gain(ctx, 0.22, g), t, t + len + 0.05);
  },
  pluck(ctx, out, t, d, n, v = 1) {
    const f = freq(n), len = Math.min(1.6, d + 0.5), lp = ctx.createBiquadFilter(), g = struck(ctx, out, t, 0.15 * v, len, 0.35);
    lp.type = 'lowpass'; lp.Q.value = 1.2; lp.frequency.setValueAtTime(Math.min(8000, f * 6), t); lp.frequency.exponentialRampToValueAtTime(f * 1.6, t + 0.3); lp.connect(g);
    osc(ctx, 'sawtooth', f, 0, lp, t, t + len + 0.05); osc(ctx, 'triangle', f, 5, gain(ctx, 0.6, lp), t, t + len + 0.05);
  },
  strum(ctx, out, t, d, ns) { ns.forEach((n, i) => VOICE.pluck(ctx, out, t + i * 0.018, d, n, 0.5)); },
  // a mouth organ: reedy, with a wobble
  harp(ctx, out, t, d, n) {
    const f = freq(n), bp = ctx.createBiquadFilter(), [g, end] = blown(ctx, out, t, 0.34, d, 0.045);
    bp.type = 'bandpass'; bp.Q.value = 0.7; bp.frequency.value = Math.min(5000, f * 2.4); bp.connect(g);
    for (const o of [osc(ctx, 'square', f, 0, gain(ctx, 0.5, bp), t, end), osc(ctx, 'sawtooth', f, 9, gain(ctx, 0.45, bp), t, end)]) vibrato(ctx, o, t, end, f * 0.006, 5.8);
    osc(ctx, 'sawtooth', f * 2, -7, gain(ctx, 0.14, bp), t, end);
  },
  // whistling: nearly a pure tone, slid up to, with breath in it
  whistle(ctx, out, t, d, n) {
    const f = freq(n), [g, end] = blown(ctx, out, t, 0.2, d, 0.06);
    const o = osc(ctx, 'sine', f, 0, g, t, end);
    o.frequency.setValueAtTime(f * 0.965, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.07);
    vibrato(ctx, o, t + 0.12, end, f * 0.009, 5.2);
    osc(ctx, 'sine', f * 2, 0, gain(ctx, 0.06, g), t, end);
    const src = ctx.createBufferSource(), bp = ctx.createBiquadFilter();
    src.buffer = noiseOf(ctx); src.loop = true; bp.type = 'bandpass'; bp.Q.value = 9; bp.frequency.value = f; src.connect(bp); bp.connect(gain(ctx, 0.5, g)); src.start(t); src.stop(end);
  },
  brush(ctx, out, t, d, v) {
    const src = ctx.createBufferSource(), hp = ctx.createBiquadFilter(), g = gain(ctx, 0.0001, out);
    src.buffer = noiseOf(ctx); src.loop = true; hp.type = 'highpass'; hp.frequency.value = 4500;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.07 * v, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    src.connect(hp); hp.connect(g); src.start(t); src.stop(t + 0.12);
  },
};

// ---------- playing ----------
const VOL = 0.75, AHEAD = 1.2;
let cur = null;

// Puts tune `k` on, `ago` seconds into its `secs` seconds. `id` names this playing of it (see `playing`).
// False when there is no sound to play on (yet).
export function playTune(k, ago, secs, id = k) {
  stopTune();
  const o = output();
  if (!o || !TUNES[k] || ago >= secs - 0.5) return false;
  const { ctx, master } = o, now = ctx.currentTime, bus = ctx.createGain(), sc = scoreOf(k), spb = 60 / TUNES[k].bpm, end = now - ago + secs;
  bus.connect(master);
  bus.gain.setValueAtTime(0.0001, now); bus.gain.linearRampToValueAtTime(VOL, now + (ago > 0.4 ? 0.7 : 0.03));
  if (end - 3 > now + 0.8) bus.gain.setValueAtTime(VOL, end - 3);
  bus.gain.linearRampToValueAtTime(0.0001, end);                // it fades out at the end
  const pos = Math.max(0, ago) / spb, loop = Math.floor(pos / sc.beats), into = pos - loop * sc.beats;
  let i = sc.ev.findIndex(e => e.at >= into - 0.001), lp = loop;
  if (i < 0) { i = 0; lp++; }
  cur = { id, k, ctx, bus, sc, spb, t0: now - ago, wall0: performance.now() - ago * 1000, end, secs, i, loop: lp, timer: setInterval(pump, 200) };
  pump();
  return true;
}
function pump() {
  const c = cur;
  if (!c) return;
  const now = c.ctx.currentTime;
  if (!output() || now >= c.end) return stopTune();
  // the sound has been asleep (the page was away): find the place again
  const wall = (performance.now() - c.wall0) / 1000;
  if (Math.abs(wall - (now - c.t0)) > 0.35) { playTune(c.k, wall, c.secs, c.id); return; }
  for (;;) {
    const e = c.sc.ev[c.i], t = c.t0 + (c.loop * c.sc.beats + e.at) * c.spb;
    if (t > now + AHEAD || t > c.end - 0.1) break;
    if (t > now - 0.03) VOICE[e.v](c.ctx, c.bus, Math.max(t, now), (e.d || 0) * c.spb, e.n);
    if (++c.i >= c.sc.ev.length) { c.i = 0; c.loop++; }
  }
}
export function stopTune() {
  const c = cur;
  if (!c) return;
  cur = null; clearInterval(c.timer);
  try {
    const t = c.ctx.currentTime;
    c.bus.gain.cancelScheduledValues(t); c.bus.gain.setValueAtTime(Math.min(VOL, Math.max(0.0001, c.bus.gain.value)), t); c.bus.gain.linearRampToValueAtTime(0.0001, t + 0.15);
    setTimeout(() => { try { c.bus.disconnect(); } catch {} }, 500);
  } catch {}
}
export const playing = () => cur ? cur.id : '';
