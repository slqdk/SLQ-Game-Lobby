// SLQ Game Lobby — the shooter's sounds, worked out sample by sample (no sound files, and no need of a browser:
// the self test makes every one of them too). A sound is a recipe that fills a row of numbers: noise through
// filters that move, tones that fall, a mouth of resonances for a voice. sfx.js plays them: near or far, left or
// right, with the arena's echo on top.
//
// Søren: "the sounds in the shooter is very primitive.. like bliips ... Make much better ingame sounds when a shot
// is fired, and a guy is hit / died", and "Dinoen må gerne brøle inden den går til angreb".
//
// A shot is built the way a real one is heard: a crack of a millisecond or two, a blast whose top closes quickly,
// a body lower down, a thump one feels, the shot coming back from walls and houses, the rolling after it, and the
// weapon's own mechanism. A voice is a buzz from the throat through three or four resonances that move as the mouth
// does. All of it is our own making.

const TAU = Math.PI * 2;
// numbers that look like chance but are the same every time
export const rng = seed => { let a = (seed >>> 0) || 1; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), a | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

// ---------- the tools ----------
const val = (v, t, i) => typeof v === 'function' ? v(t, i) : v;              // a number, or a number for each moment
// a row of samples from a rule for each moment: f(seconds, index)
const fill = (sr, secs, f) => { const n = Math.max(1, Math.round(sr * secs)), x = new Float32Array(n); for (let i = 0; i < n; i++) x[i] = f(i / sr, i); return x; };
const noise = (sr, secs, rnd) => fill(sr, secs, () => rnd() * 2 - 1);
// a filter whose place can move while it works ('lp' lets the low through, 'hp' the high, 'bp' a band round freq)
function filt(x, sr, mode, freq, q = 0.707) {
  const y = new Float32Array(x.length), moves = typeof freq === 'function' || typeof q === 'function';
  let ic1 = 0, ic2 = 0, g = 0, k = 0, a1 = 0, a2 = 0, a3 = 0;
  const set = t => { g = Math.tan(Math.PI * Math.min(0.49, Math.max(8 / sr, val(freq, t) / sr))); k = 1 / val(q, t); a1 = 1 / (1 + g * (g + k)); a2 = g * a1; a3 = g * a2; };
  set(0);
  for (let i = 0; i < x.length; i++) {
    if (moves && (i & 15) === 0) set(i / sr);
    const v3 = x[i] - ic2, v1 = a1 * ic1 + a2 * v3, v2 = ic2 + a2 * ic1 + a3 * v3; ic1 = 2 * v1 - ic1; ic2 = 2 * v2 - ic2;
    y[i] = mode === 'lp' ? v2 : mode === 'bp' ? k * v1 : x[i] - k * v1 - v2;
  }
  return y;
}
const gain = (x, sr, f) => { for (let i = 0; i < x.length; i++) x[i] *= val(f, i / sr, i); return x; };      // louder and softer over time (in place)
const dec = (tau, up = 0.0006) => t => Math.min(1, t / up) * Math.exp(-t / tau);                             // struck: up at once, then dying away
const hump = (up, hold, down) => t => t < up ? t / up : t < up + hold ? 1 : Math.exp(-(t - up - hold) / down);
const fall = (f0, f1, tau) => t => f1 + (f0 - f1) * Math.exp(-t / tau);                                      // a pitch (or a filter) on its way from f0 to f1
const tone = (sr, secs, freq, wave = Math.sin) => { let p = 0; return fill(sr, secs, t => { p += val(freq, t) / sr; return wave(p * TAU); }); };
const add = (dst, src, at = 0, g = 1) => { const o = Math.round(at); for (let i = Math.max(0, -o); i < src.length && i + o < dst.length; i++) dst[i + o] += src[i] * g; return dst; };
const drive = (x, d) => { for (let i = 0; i < x.length; i++) x[i] = Math.tanh(x[i] * d); return x; };          // pressed hard, it gets rough
const peak = x => { let m = 0; for (let i = 0; i < x.length; i++) { const a = Math.abs(x[i]); if (a > m) m = a; } return m; };
// as loud as it may be, and a soft end so that it does not stop with a click
const finish = (x, sr, level = 0.9, out = 0.02) => { const m = peak(x) || 1, n = x.length, f = Math.min(n, Math.round(out * sr)); for (let i = 0; i < n; i++) x[i] *= level / m; for (let i = 0; i < f; i++) x[n - 1 - i] *= i / f; return x; };
const blank = (sr, secs) => new Float32Array(Math.round(sr * secs));
const unit = x => { const m = peak(x) || 1; for (let i = 0; i < x.length; i++) x[i] /= m; return x; };
// A layer of noise through a filter, shaped over time; and a layer of tone. Both are 1 at their loudest, whatever
// the filter let through, so that the numbers they are mixed by mean the same for all of them.
const hiss = (sr, rnd, secs, mode, f, q, e) => unit(gain(filt(noise(sr, secs, rnd), sr, mode, f, q), sr, e));
const hum = (sr, secs, f, e) => gain(tone(sr, secs, f), sr, e);
// something small and hard of metal: three tones that do not belong together, gone in a moment, and a tick
const click = (sr, rnd, f, tau = 0.006) => {
  const x = fill(sr, tau * 8, t => (Math.sin(TAU * f * t) + 0.6 * Math.sin(TAU * f * 1.47 * t + 1) + 0.4 * Math.sin(TAU * f * 2.09 * t + 2)) * Math.exp(-t / tau) * 0.5);
  return add(x, gain(filt(noise(sr, 0.004, rnd), sr, 'hp', 3000), sr, dec(0.001, 0.0001)), 0, 0.8);
};

// ---------- shots ----------
// o: dur; crack [how much, above which pitch, how long]; blast [how much, top from, top to, how fast, how long];
// body [how much, pitch, how narrow, how long]; thump [how much, from, to, how fast, how long];
// echo [[when, how much, how dull], ...]; tail [how much, top from, top to, how long]; mech [[when, pitch, how much], ...]
function gunshot(sr, rnd, o) {
  const out = blank(sr, o.dur), head = blank(sr, Math.min(o.dur, 0.5));
  add(head, hiss(sr, rnd, 0.03, 'hp', o.crack[1], 0.707, dec(o.crack[2], 0.0002)), 0, o.crack[0]);
  add(head, hiss(sr, rnd, 0.45, 'lp', fall(o.blast[1], o.blast[2], o.blast[3]), 0.707, dec(o.blast[4])), 0, o.blast[0]);
  add(head, hiss(sr, rnd, 0.45, 'bp', o.body[1], o.body[2], dec(o.body[3], 0.002)), 0, o.body[0]);
  add(head, hum(sr, 0.5, fall(o.thump[1], o.thump[2], o.thump[3]), dec(o.thump[4], 0.003)), 0, o.thump[0]);
  add(out, unit(head));
  // the shot comes back from walls and houses: later, duller, fainter
  for (const [t, g, lp] of o.echo || []) add(out, filt(head, sr, 'lp', lp), t * sr, g);
  // ... and rolls on: low noise that swells and sinks a little as it dies away
  if (o.tail) {
    const [g, lp0, lp1, tau] = o.tail, swell = unit(filt(noise(sr, o.dur, rnd), sr, 'lp', 9));
    add(out, hiss(sr, rnd, o.dur, 'lp', fall(lp0, lp1, tau * 0.6), 0.707, (t, i) => (1 - Math.exp(-t / 0.03)) * Math.exp(-t / tau) * (0.5 + 0.9 * Math.abs(swell[i]))), 0.012 * sr, g);
  }
  for (const [t, f, g] of o.mech || []) add(out, click(sr, rnd, f * (0.95 + rnd() * 0.1)), t * sr, g);
  if (o.more) o.more(out);
  return finish(drive(out, o.drive || 1.6), sr, 0.92, 0.03);
}
const SHOT = {
  pistol: { dur: 0.8, crack: [0.8, 1800, 0.0016], blast: [1, 9000, 1100, 0.012, 0.032], body: [0.8, 700, 1.1, 0.05], thump: [0.5, 160, 55, 0.02, 0.04],
    echo: [[0.055, 0.2, 2200], [0.13, 0.13, 1500], [0.23, 0.08, 1000]], tail: [0.16, 2400, 350, 0.22], mech: [[0.05, 2300, 0.05], [0.085, 3100, 0.06]], drive: 2 },
  sniper: { dur: 1.8, crack: [0.9, 1200, 0.003], blast: [1, 10000, 700, 0.02, 0.07], body: [0.9, 330, 0.9, 0.11], thump: [0.7, 120, 38, 0.035, 0.13],
    echo: [[0.09, 0.3, 1800], [0.2, 0.22, 1300], [0.36, 0.15, 900], [0.6, 0.09, 700]], tail: [0.28, 2000, 250, 0.5], drive: 2.4 },
  badgun: { dur: 0.42, crack: [0.6, 2600, 0.001], blast: [0.8, 7000, 1800, 0.008, 0.016], body: [1, 1150, 2.8, 0.028], thump: [0.2, 220, 120, 0.015, 0.025],
    echo: [[0.06, 0.12, 2500]], tail: [0.06, 2500, 600, 0.09], mech: [[0.035, 1900, 0.06]], drive: 1.3 },
};
// the bad pistol has a spring in it that sings a little
const badgun = (sr, rnd) => gunshot(sr, rnd, Object.assign({}, SHOT.badgun, { more: out => add(out, hum(sr, 0.25, fall(830, 640, 0.05), dec(0.05, 0.002)), 0.004 * sr, 0.1) }));
// sparks and things that rain down: now and then a snap
const snaps = (sr, rnd, secs, often) => { const x = noise(sr, secs, rnd); for (let i = 0; i < x.length; i++) x[i] = rnd() < often ? x[i] * 2 : 0; return x; };
// the bazooka: a thump as the rocket leaves, the fire behind it, and the rocket hissing away
function bazooka(sr, rnd) {
  const out = blank(sr, 1.15);
  add(out, hum(sr, 0.6, fall(95, 36, 0.05), dec(0.15, 0.004)), 0, 0.8);
  add(out, hiss(sr, rnd, 0.5, 'lp', fall(3200, 380, 0.05), 0.707, dec(0.1, 0.002)), 0, 1);
  add(out, hiss(sr, rnd, 1.1, 'bp', t => 500 + 2300 * Math.min(1, t / 0.12) - 1200 * Math.min(1, Math.max(0, t - 0.12) / 0.8), 1.4, hump(0.06, 0.05, 0.3)), 0.01 * sr, 0.7);
  add(out, unit(gain(filt(snaps(sr, rnd, 1, 0.004), sr, 'hp', 2500), sr, hump(0.02, 0.1, 0.35))), 0.02 * sr, 0.3);
  return finish(drive(unit(out), 1.6), sr, 0.9, 0.05);
}
// it goes off: a crack, a punch one feels, the blast, a long rumble, and things that rain down
function explosion(sr, rnd) {
  const out = blank(sr, 2.4);
  add(out, hiss(sr, rnd, 0.05, 'hp', 900, 0.707, dec(0.005, 0.0002)), 0, 0.8);
  add(out, hum(sr, 0.9, fall(90, 30, 0.1), dec(0.24, 0.004)), 0, 0.9);
  add(out, hiss(sr, rnd, 1.6, 'lp', fall(5200, 240, 0.12), 0.707, dec(0.36, 0.002)), 0, 1);
  add(out, hiss(sr, rnd, 2.3, 'lp', 110, 0.707, t => (1 - Math.exp(-t / 0.05)) * Math.exp(-t / 0.8)), 0.02 * sr, 0.9);
  add(out, unit(gain(filt(snaps(sr, rnd, 1.6, 0.0035), sr, 'bp', 2400, 0.8), sr, hump(0.05, 0.15, 0.45))), 0.12 * sr, 0.3);
  for (const [t, g, lp] of [[0.14, 0.3, 900], [0.33, 0.2, 600]]) add(out, filt(out.slice(0, Math.round(0.4 * sr)), sr, 'lp', lp), t * sr, g);
  return finish(drive(unit(out), 2.2), sr, 0.94, 0.1);
}

// ---------- the knife, and what bullets do on their way ----------
const swish = (sr, rnd) => { const out = hiss(sr, rnd, 0.24, 'bp', t => 600 + 2800 * Math.sin(Math.PI * Math.min(1, t / 0.2)) ** 2, 2.2, t => Math.sin(Math.PI * Math.min(1, t / 0.22)) ** 2); add(out, hiss(sr, rnd, 0.08, 'hp', 6000, 0.707, hump(0.02, 0.01, 0.02)), 0.07 * sr, 0.15); return finish(out, sr, 0.8); };
const knifeHit = (sr, rnd) => { const out = blank(sr, 0.22); add(out, hum(sr, 0.15, fall(130, 58, 0.025), dec(0.04, 0.002)), 0, 0.7); add(out, hiss(sr, rnd, 0.1, 'bp', 900, 1.2, dec(0.022, 0.001)), 0, 0.9); add(out, hiss(sr, rnd, 0.14, 'bp', fall(2200, 500, 0.035), 3, dec(0.04, 0.004)), 0.01 * sr, 0.5); return finish(drive(unit(out), 1.6), sr, 0.9); };
// a bullet into a wall: a tick and a puff of dust
const impact = (sr, rnd) => { const out = blank(sr, 0.14); add(out, hiss(sr, rnd, 0.01, 'hp', 2500, 0.707, dec(0.0015, 0.0001)), 0, 0.8); add(out, hiss(sr, rnd, 0.12, 'bp', 900 + rnd() * 900, 1.1, dec(0.022, 0.001)), 0, 0.9); add(out, hum(sr, 0.06, fall(260, 120, 0.01), dec(0.015, 0.001)), 0, 0.35); return finish(out, sr, 0.85); };
// ... or off it again, singing
const ricochet = (sr, rnd) => { const f0 = 2600 + rnd() * 900, f = t => (900 + (f0 - 900) * Math.exp(-t / 0.16)) * (1 + 0.012 * Math.sin(TAU * 31 * t)), out = blank(sr, 0.5); add(out, impact(sr, rnd), 0, 0.8); add(out, hum(sr, 0.48, f, hump(0.004, 0.02, 0.13)), 0.004 * sr, 0.3); add(out, hiss(sr, rnd, 0.48, 'bp', f, 18, hump(0.004, 0.02, 0.12)), 0.004 * sr, 0.55); return finish(out, sr, 0.8); };
// a bullet past one's ear
const whiz = (sr, rnd) => { const out = hiss(sr, rnd, 0.16, 'bp', fall(5200, 1100, 0.045), 5, t => Math.sin(Math.PI * Math.min(1, t / 0.14)) ** 1.5); add(out, hiss(sr, rnd, 0.006, 'hp', 4000, 0.707, dec(0.001, 0.0001)), 0.03 * sr, 0.5); return finish(out, sr, 0.8); };

// ---------- somebody is hit ----------
// what the one who shot hears: the bullet landing (a knock with something dry and hard on top), not a beep
const hitMark = (sr, rnd) => { const out = blank(sr, 0.12); add(out, hum(sr, 0.09, fall(150, 72, 0.015), dec(0.028, 0.001)), 0, 0.35); add(out, hiss(sr, rnd, 0.08, 'bp', 1400, 1, dec(0.018, 0.0006)), 0, 0.9); add(out, click(sr, rnd, 1900, 0.007), 0.002 * sr, 0.6); add(out, click(sr, rnd, 2700, 0.005), 0.013 * sr, 0.4); return finish(drive(unit(out), 1.5), sr, 0.9); };
// a hit on the head: it rings
const headMark = (sr, rnd) => { const out = blank(sr, 0.32); add(out, hiss(sr, rnd, 0.02, 'hp', 3000, 0.707, dec(0.002, 0.0001)), 0, 0.7); add(out, hum(sr, 0.08, fall(170, 80, 0.015), dec(0.025, 0.001)), 0, 0.5); add(out, hiss(sr, rnd, 0.06, 'bp', 1400, 1, dec(0.014, 0.0006)), 0, 0.6); for (const [f, g, tau] of [[2090, 1, 0.07], [3160, 0.6, 0.05], [4670, 0.4, 0.035], [1240, 0.35, 0.045]]) add(out, fill(sr, 0.3, t => Math.sin(TAU * f * t) * Math.exp(-t / tau) * Math.min(1, t / 0.0005)), 0.001 * sr, g * 0.45); return finish(out, sr, 0.9); };
// a bullet into somebody near by, heard from outside
const thud = (sr, rnd) => { const out = blank(sr, 0.16); add(out, hum(sr, 0.12, fall(140, 60, 0.02), dec(0.035, 0.0015)), 0, 0.7); add(out, hiss(sr, rnd, 0.1, 'bp', 520 + rnd() * 200, 1, dec(0.022, 0.001)), 0, 0.9); add(out, hiss(sr, rnd, 0.05, 'bp', fall(2400, 900, 0.012), 2, dec(0.012, 0.0006)), 0, 0.5); return finish(drive(unit(out), 1.5), sr, 0.9); };
// one is hit oneself: a punch one feels more than hears, and the head ringing a little
const hurt = (sr, rnd) => { const out = blank(sr, 0.4); add(out, hum(sr, 0.3, fall(105, 44, 0.035), dec(0.07, 0.002)), 0, 0.9); add(out, hiss(sr, rnd, 0.2, 'lp', fall(1400, 260, 0.03), 0.707, dec(0.045, 0.001)), 0, 0.9); add(out, hiss(sr, rnd, 0.012, 'hp', 2500, 0.707, dec(0.0015, 0.0001)), 0, 0.5); add(out, hum(sr, 0.38, 3100, hump(0.02, 0.03, 0.12)), 0.01 * sr, 0.03); return finish(drive(unit(out), 2), sr, 0.92); };
// a body goes down
const bodyFall = (sr, rnd) => { const out = blank(sr, 0.5); for (const [t, g] of [[0, 1], [0.13, 0.55]]) { add(out, hum(sr, 0.2, fall(95, 48, 0.03), dec(0.06, 0.003)), t * sr, g * 0.7); add(out, hiss(sr, rnd, 0.2, 'lp', 420, 0.707, dec(0.05, 0.004)), t * sr, g * 0.9); } add(out, hiss(sr, rnd, 0.3, 'bp', 2200, 0.8, hump(0.02, 0.03, 0.08)), 0.02 * sr, 0.12); return finish(drive(unit(out), 1.5), sr, 0.85, 0.05); };

// ---------- voices ----------
// A buzz from the throat whose pitch moves, through the resonances of a mouth that moves, and breath.
// o: dur; f0(u) in Hz (u goes 0..1 through the sound); vow [[u, F1, F2, F3], ...]: the mouth at those moments;
// amp(u); growl(u) 0..1: every other pulse weaker and all of it rattling; breath; pitch, form: a higher or deeper
// voice; robot: through a ring that makes it metal
function voice(sr, rnd, o) {
  const n = Math.round(sr * o.dur), src = new Float32Array(n), pk = o.pitch || 1, fk = o.form || 1;
  let p = rnd(), jit = 0, sub = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr, u = i / n, g = val(o.growl, u) || 0;
    if ((i & 63) === 0) jit += (rnd() - 0.5) * 0.03 - jit * 0.25;             // the pitch is never quite steady
    p += o.f0(u) * pk * (1 + jit + (o.vib || 0) * u * Math.sin(TAU * 6.2 * t)) / sr;
    if (p >= 1) { p -= 1; sub ^= 1; }
    src[i] = (2 * p - 1) * (1 - 0.55 * g * sub) * (1 - 0.45 * g * (0.5 + 0.5 * Math.sin(TAU * (o.rattle || 43) * t))) + (rnd() * 2 - 1) * (0.04 + (val(o.breath, u) || 0) + 0.22 * g);
  }
  const tilt = filt(src, sr, 'lp', 2600 * fk, 0.6), out = new Float32Array(n), v = o.vow;
  const F = j => t => { const u = t * sr / n; let a = 0; while (a + 2 < v.length && u > v[a + 1][0]) a++; const A = v[a], B = v[Math.min(v.length - 1, a + 1)], w = B[0] > A[0] ? Math.min(1, Math.max(0, (u - A[0]) / (B[0] - A[0]))) : 0; return (A[j] + (B[j] - A[j]) * w) * fk; };
  for (const [j, g, q] of [[1, 1, 7], [2, 0.7, 9], [3, 0.35, 11]]) add(out, filt(tilt, sr, 'bp', F(j), q), 0, g);
  add(out, filt(tilt, sr, 'bp', 3400 * fk, 8), 0, 0.12);
  add(out, filt(src, sr, 'lp', 330 * fk, 0.8), 0, o.chest === undefined ? 0.3 : o.chest);          // the chest under the mouth: the voice's own pitch
  gain(out, sr, (t, i) => o.amp(i / n));
  if (o.robot) gain(out, sr, t => 0.35 + 0.65 * Math.sin(TAU * 86 * t));
  return finish(drive(out, o.drive || 1.5), sr, 0.9, 0.03);
}
const inOut = (up, down) => u => Math.min(1, u / up) * Math.min(1, (1 - u) / down);
const line = (...pts) => u => { let a = 0; while (a + 2 < pts.length && u > pts[a + 1][0]) a++; const A = pts[a], B = pts[Math.min(pts.length - 1, a + 1)]; return B[0] > A[0] ? A[1] + (B[1] - A[1]) * Math.min(1, Math.max(0, (u - A[0]) / (B[0] - A[0]))) : A[1]; };
const UH = [640, 1190, 2390], AH = [750, 1150, 2500], AE = [700, 1650, 2450], OH = [500, 850, 2450], OO = [320, 800, 2250], EH = [550, 1750, 2500];
// the kinds of voice: a man, a woman, a robot (the arena's robots)
export const VOICES = { m: { pitch: 1, form: 1 }, f: { pitch: 1.72, form: 1.17 }, r: { pitch: 0.92, form: 1.04, robot: true } };
// hit: a short sound that is knocked out of one ("uh!", "agh!", "oof")
const GRUNT = [
  { dur: 0.17, f0: line([0, 158], [1, 116]), vow: [[0, ...UH], [1, ...UH]], amp: inOut(0.06, 0.6), growl: 0.25, breath: 0.1 },
  { dur: 0.22, f0: line([0, 178], [0.3, 170], [1, 118]), vow: [[0, ...AE], [1, ...UH]], amp: inOut(0.05, 0.5), growl: 0.45, breath: 0.12 },
  { dur: 0.26, f0: line([0, 142], [1, 98]), vow: [[0, ...OH], [0.6, ...OO], [1, ...OO]], amp: inOut(0.05, 0.45), growl: 0.2, breath: line([0, 0.05], [0.6, 0.1], [1, 0.9]) },
];
// down: a cry that falls ("aaargh", "uuaah", "eyaagh")
const CRY = [
  { dur: 0.75, f0: line([0, 150], [0.2, 186], [1, 92]), vow: [[0, ...AH], [0.55, ...AH], [1, ...UH]], amp: inOut(0.04, 0.4), growl: line([0, 0.2], [1, 0.75]), breath: line([0, 0.08], [0.7, 0.1], [1, 0.5]) },
  { dur: 0.9, f0: line([0, 128], [0.25, 162], [1, 78]), vow: [[0, ...OH], [0.3, ...AH], [1, ...UH]], amp: inOut(0.05, 0.45), growl: line([0, 0.3], [1, 0.6]), breath: 0.1, vib: 0.035 },
  { dur: 0.62, f0: line([0, 215], [0.18, 262], [1, 120]), vow: [[0, ...EH], [0.25, ...AE], [1, ...UH]], amp: inOut(0.03, 0.4), growl: line([0, 0.15], [1, 0.7]), breath: 0.1 },
];
const speak = (list, kind) => (sr, rnd, v) => voice(sr, rnd, Object.assign({}, list[v % list.length], VOICES[kind]));

// ---------- the dino ----------
// It roars before it attacks: a deep rattling throat that opens wide, a scream on top in the middle, and a rumble.
function dinoRoar(sr, rnd, v) {
  const dur = 1.12, low = voice(sr, rnd, { dur, f0: line([0, 78], [0.25, 132 + v * 10], [0.6, 118], [1, 62]), vow: [[0, 330, 880, 2200], [0.3, 640, 1300, 2500], [0.7, 560, 1150, 2400], [1, 380, 900, 2200]],
    amp: line([0, 0], [0.07, 1], [0.7, 0.9], [1, 0]), growl: line([0, 0.9], [0.4, 0.7], [1, 1]), breath: 0.18, rattle: 31, drive: 2.6 });
  const high = voice(sr, rnd, { dur, f0: line([0, 330], [0.3, 520 + v * 30], [0.65, 450], [1, 240]), vow: [[0, 1300, 2300, 3300], [0.4, 1700, 2700, 3600], [1, 1200, 2200, 3200]],
    amp: line([0, 0], [0.15, 0.5], [0.4, 1], [0.75, 0.5], [1, 0]), growl: 0.8, breath: 0.25, rattle: 57, drive: 2 });
  const out = blank(sr, dur + 0.1);
  add(out, low, 0, 1); add(out, high, 0, 0.42);
  add(out, gain(tone(sr, dur, line([0, 52], [0.3, 64], [1, 44])), sr, t => Math.sin(Math.PI * Math.min(1, t / dur)) ** 0.7 * (0.75 + 0.25 * Math.sin(TAU * 27 * t))), 0, 0.5);
  add(out, gain(filt(noise(sr, dur, rnd), sr, 'bp', line([0, 900], [0.3, 2000], [1, 900]), 0.9), sr, t => Math.sin(Math.PI * Math.min(1, t / dur)) ** 1.5), 0, 0.2);
  return finish(drive(out, 1.7), sr, 0.93, 0.06);
}
const dinoHurt = (sr, rnd, v) => voice(sr, rnd, { dur: 0.24, f0: line([0, 300], [0.3, 520 + v * 40], [1, 360]), vow: [[0, 900, 2100, 3000], [1, 1100, 2300, 3200]], amp: inOut(0.05, 0.5), growl: 0.7, breath: 0.2, rattle: 61, drive: 2 });
const dinoDie = (sr, rnd) => voice(sr, rnd, { dur: 0.95, f0: line([0, 250], [0.15, 300], [1, 84]), vow: [[0, 800, 1900, 2900], [0.4, 600, 1300, 2500], [1, 360, 900, 2200]], amp: inOut(0.04, 0.5), growl: line([0, 0.5], [1, 1]), breath: line([0, 0.15], [1, 0.6]), rattle: 29, vib: 0.05, drive: 2.2 });

// ---------- feet, hands and the weapon's mechanism ----------
const step = (sr, rnd) => { const out = blank(sr, 0.17); add(out, hiss(sr, rnd, 0.1, 'lp', 260 + 140 * rnd(), 0.707, dec(0.02, 0.003)), 0, 0.9); add(out, hum(sr, 0.1, fall(118, 68, 0.02), dec(0.028, 0.002)), 0, 0.35); for (let k = 0, m = 4 + Math.floor(rnd() * 4); k < m; k++) add(out, hiss(sr, rnd, 0.012, 'bp', 1800 + 3200 * rnd(), 2, dec(0.003, 0.0004)), (0.004 + rnd() * 0.08) * sr, 0.12 + 0.2 * rnd()); return finish(out, sr, 0.8); };
const jump = (sr, rnd) => finish(hiss(sr, rnd, 0.16, 'bp', t => 280 + 900 * Math.min(1, t / 0.12), 1.2, t => Math.sin(Math.PI * Math.min(1, t / 0.15)) ** 1.3), sr, 0.7);
const land = (sr, rnd) => { const out = blank(sr, 0.25); add(out, hum(sr, 0.2, fall(100, 50, 0.03), dec(0.05, 0.002)), 0, 0.7); add(out, hiss(sr, rnd, 0.15, 'lp', 520, 0.707, dec(0.035, 0.002)), 0, 0.9); add(out, step(sr, rnd), 0.012 * sr, 0.4); return finish(drive(unit(out), 1.3), sr, 0.85); };
const clack = (sr, rnd) => { const out = blank(sr, 0.09); add(out, click(sr, rnd, 1650, 0.007), 0, 0.9); add(out, hiss(sr, rnd, 0.05, 'bp', 2400, 1.5, dec(0.007, 0.0004)), 0, 0.7); add(out, hum(sr, 0.04, fall(420, 300, 0.01), dec(0.01, 0.0006)), 0, 0.3); return finish(out, sr, 0.85); };
const clunk = (sr, rnd) => { const out = blank(sr, 0.16); add(out, click(sr, rnd, 720, 0.014), 0, 0.9); add(out, hiss(sr, rnd, 0.1, 'bp', 1100, 1.2, dec(0.016, 0.0006)), 0, 0.8); add(out, hum(sr, 0.1, fall(210, 130, 0.02), dec(0.03, 0.001)), 0, 0.5); return finish(out, sr, 0.85); };
const slide = (sr, rnd) => { const out = blank(sr, 0.14); add(out, hiss(sr, rnd, 0.1, 'bp', fall(5200, 2600, 0.03), 3, hump(0.004, 0.03, 0.02)), 0, 0.5); add(out, clack(sr, rnd), 0.055 * sr, 1); return finish(out, sr, 0.85); };
const dryClick = (sr, rnd) => finish(add(click(sr, rnd, 2500, 0.004), hum(sr, 0.02, 380, dec(0.004, 0.0003)), 0, 0.3), sr, 0.7);
const cloth = (sr, rnd) => finish(hiss(sr, rnd, 0.16, 'bp', t => 500 + 700 * Math.sin(Math.PI * Math.min(1, t / 0.15)), 1, t => Math.sin(Math.PI * Math.min(1, t / 0.15)) ** 2), sr, 0.6);

// ---------- what the game says without words: struck tones (a bell and a wooden bar), not beeps ----------
// one note: a tone whose colour is brightest as it is struck
const note = (sr, f, dur, bright = 1) => fill(sr, dur, t => (Math.sin(TAU * f * t + Math.sin(TAU * f * 3.01 * t) * 1.5 * bright * Math.exp(-t / (dur * 0.1))) * Math.exp(-t / (dur * 0.3)) + 0.22 * Math.sin(TAU * f * 2 * t) * Math.exp(-t / (dur * 0.2)) + 0.1 * Math.sin(TAU * f * 0.5 * t) * Math.exp(-t / (dur * 0.35))) * Math.min(1, t / 0.002));
// notes: [pitch, when, how long, how loud, how bright]
const tune = (sr, notes, ring = 0.35) => { const out = blank(sr, Math.max(...notes.map(q => q[1] + q[2])) + ring); for (const [f, t, d, g = 1, b = 1] of notes) add(out, note(sr, f, d + ring, b), t * sr, g); return finish(out, sr, 0.85, 0.04); };
const knock = (sr, rnd, f) => { const out = blank(sr, 0.16); add(out, fill(sr, 0.15, t => (Math.sin(TAU * f * t) + 0.5 * Math.sin(TAU * f * 2.76 * t)) * Math.exp(-t / 0.03)), 0, 0.7); add(out, hiss(sr, rnd, 0.01, 'bp', f * 2, 2, dec(0.002, 0.0002)), 0, 0.5); return finish(out, sr, 0.8); };
const TUNES = {
  star: [[659, 0, 0.1], [880, 0.09, 0.1], [1319, 0.18, 0.2, 1.1]],
  deliver: [[523, 0, 0.1], [659, 0.1, 0.1], [784, 0.2, 0.1], [1047, 0.3, 0.3, 1.1], [1319, 0.3, 0.3, 0.5]],
  win: [[523, 0, 0.16], [659, 0.16, 0.16], [784, 0.32, 0.16], [1047, 0.48, 0.5, 1.1], [784, 0.48, 0.5, 0.6], [1319, 0.64, 0.4, 0.7]],
  lose: [[392, 0, 0.2, 1, 0.6], [330, 0.2, 0.2, 1, 0.6], [262, 0.4, 0.5, 1, 0.5], [156, 0.4, 0.5, 0.6, 0.4]],
  go: [[880, 0, 0.3, 1, 1.2], [1319, 0, 0.3, 0.8, 1.2], [1760, 0.02, 0.3, 0.6, 1]],
  kill: [[784, 0.02, 0.1, 0.9, 1.2], [1175, 0.09, 0.22, 1, 1.2]],
  pickup: [[587, 0.05, 0.07, 0.7, 0.7], [880, 0.11, 0.12, 0.8, 0.8]],
  heal: [[440, 0, 0.14, 0.8, 0.4], [554, 0.09, 0.14, 0.8, 0.4], [659, 0.18, 0.25, 0.9, 0.5]],
  thief: [[622, 0, 0.12, 1, 1.3], [587, 0.14, 0.2, 1, 1.3]],
};
const kill = (sr, rnd) => { const out = tune(sr, TUNES.kill); add(out, hum(sr, 0.12, fall(160, 70, 0.02), dec(0.035, 0.001)), 0, 0.6); add(out, hiss(sr, rnd, 0.06, 'bp', 1200, 1, dec(0.012, 0.0005)), 0, 0.4); return finish(out, sr, 0.85, 0.04); };
const pickup = (sr, rnd) => { const out = tune(sr, TUNES.pickup); add(out, clunk(sr, rnd), 0, 0.9); add(out, clack(sr, rnd), 0.06 * sr, 0.6); return finish(out, sr, 0.85, 0.04); };
// the train: a low rumble, the wheels over the joints of the rails, and steam four times to the turn. It goes round
// (the end runs into the beginning)
function train(sr, rnd) {
  const dur = 2, n = Math.round(sr * dur), out = new Float32Array(n), rum = unit(filt(noise(sr, dur + 0.3, rnd), sr, 'lp', 95)), over = Math.round(0.3 * sr);
  for (let i = 0; i < n; i++) out[i] = (rum[i + over] * (i < over ? i / over : 1) + (i < over ? rum[i + n] * (1 - i / over) : 0)) * 0.7;       // the rumble, joined end to beginning
  const ring = (src, at, g) => { const o = Math.round(at * sr); for (let i = 0; i < src.length; i++) out[(o + i) % n] += src[i] * g; };
  for (let k = 0; k < 4; k++) ring(hiss(sr, rnd, 0.3, 'bp', 700, 0.8, hump(0.02, 0.04, 0.07)), k * 0.5 + 0.04, k % 2 ? 0.3 : 0.42);
  for (const t of [0.2, 0.34, 1.2, 1.34]) ring(clunk(sr, rnd), t, 0.3);
  return finish(out, sr, 0.8, 0);
}

// ---------- every sound by name: [recipe, how many different takes of it] ----------
export const SOUNDS = {
  shot_pistol: [(sr, rnd) => gunshot(sr, rnd, SHOT.pistol), 3], shot_sniper: [(sr, rnd) => gunshot(sr, rnd, SHOT.sniper), 2], shot_badgun: [badgun, 3], shot_bazooka: [bazooka, 2],
  explosion: [explosion, 2], swish: [swish, 2], knifehit: [knifeHit, 2], impact: [impact, 3], ricochet: [ricochet, 3], whiz: [whiz, 3],
  hit: [hitMark, 2], headshot: [headMark, 1], thud: [thud, 3], hurt: [hurt, 2], fall: [bodyFall, 2],
  grunt_m: [speak(GRUNT, 'm'), 3], grunt_f: [speak(GRUNT, 'f'), 3], grunt_r: [speak(GRUNT, 'r'), 3], cry_m: [speak(CRY, 'm'), 3], cry_f: [speak(CRY, 'f'), 3], cry_r: [speak(CRY, 'r'), 3],
  dino_roar: [dinoRoar, 2], dino_hurt: [dinoHurt, 2], dino_die: [dinoDie, 1],
  step: [step, 4], jump: [jump, 1], land: [land, 2], clack: [clack, 3], clunk: [clunk, 2], slide: [slide, 2], click: [dryClick, 1], cloth: [cloth, 2],
  star: [sr => tune(sr, TUNES.star), 1], deliver: [sr => tune(sr, TUNES.deliver), 1], win: [sr => tune(sr, TUNES.win, 0.6), 1], lose: [sr => tune(sr, TUNES.lose, 0.5), 1],
  go: [sr => tune(sr, TUNES.go, 0.5), 1], count: [(sr, rnd) => knock(sr, rnd, 880), 1], kill: [kill, 1], pickup: [pickup, 1], heal: [sr => tune(sr, TUNES.heal, 0.4), 1], thief: [sr => tune(sr, TUNES.thief), 1],
  train: [train, 1],
};
const seedOf = (name, v) => { let h = 2166136261; for (const c of name) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return (h ^ Math.imul(v + 1, 40503)) >>> 0; };
// one take of a sound: the same numbers every time it is asked for
export function renderSound(name, sr = 44100, take = 0) {
  const s = SOUNDS[name]; if (!s) return null;
  const v = ((take % s[1]) + s[1]) % s[1];
  return s[0](sr, rng(seedOf(name, v)), v);
}
// What the arena gives back: for the browser to lay over everything that sounds (a "convolution reverb" wants the
// sound of a single clap in the place). Left and right, not alike: a few early claps off the houses, then a tail
// in which the top dies first.
export function arenaEcho(sr = 44100, secs = 1.5, seed = 7) {
  return [0, 1].map(ch => {
    const rnd = rng(seed + ch * 101), bright = gain(noise(sr, secs, rnd), sr, t => Math.exp(-t / 0.16)), dull = gain(filt(noise(sr, secs, rnd), sr, 'lp', 1300), sr, t => Math.exp(-t / 0.42) * 1.6), out = blank(sr, secs);
    add(out, bright, 0.012 * sr, 0.5); add(out, dull, 0.012 * sr, 0.5);
    for (const t of [0.023, 0.041, 0.067, 0.097, 0.139]) out[Math.round((t + rnd() * 0.006) * sr)] += (rnd() < 0.5 ? -1 : 1) * (1.6 - t * 8);
    gain(out, sr, t => Math.min(1, t / 0.004));
    let e = 0; for (let i = 0; i < out.length; i++) e += out[i] * out[i];
    const k = 1 / Math.sqrt(e || 1); for (let i = 0; i < out.length; i++) out[i] *= k;
    return finish(out, sr, peak(out), 0.1);
  });
}
