// Small sound effects, made on the spot with WebAudio (no sound files). Browsers allow no sound before the player
// has pressed something, and some put the sound to sleep again when the page has been away: so `unlock` is called
// on every press and key, and makes or wakes the sound as long as it is switched on.
let ctx = null, master = null, on = true, music = true, pressAt = -1e9;
try { on = localStorage.getItem('slq-sound') !== '0'; music = localStorage.getItem('slq-music') !== '0'; } catch {}

export const soundOn = () => on;
export const musicOn = () => music;
// Switching the sound on happens in a press, so the sound can be made right there (it used to wait for a first
// press that had already been spent while the sound was off).
export function setSound(v) { on = !!v; try { localStorage.setItem('slq-sound', on ? '1' : '0'); } catch {} if (on) { unlock(); play('pop'); } }
export function setMusic(v) { music = !!v; try { localStorage.setItem('slq-music', music ? '1' : '0'); } catch {} }
export function unlock() { pressAt = performance.now(); if (!on) return; try { audio(); } catch {} }
// where the music goes: the running sound and its main volume, or nothing while there is no sound to play on
export const output = () => on && ctx && ctx.state === 'running' ? { ctx, master } : null;

function audio() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = 0.45; master.connect(ctx.destination);
  }
  if (ctx.state !== 'running') ctx.resume();
  return ctx;
}

// one note: frequency (and where it slides to), length, wave shape, loudness, delay
function tone(f, dur, { type = 'sine', vol = 0.3, to = 0, at = 0, attack = 0.005 } = {}) {
  const a = ctx, t0 = a.currentTime + at, o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t0);
  if (to) o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(vol, t0 + attack); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(master); o.start(t0); o.stop(t0 + dur + 0.02);
}
// a burst of noise through a filter
let noiseBuf = null;
function noise(dur, { vol = 0.3, f = 1000, to = 0, kind = 'lowpass', q = 0.8, at = 0 } = {}) {
  const a = ctx, t0 = a.currentTime + at;
  if (!noiseBuf) { noiseBuf = a.createBuffer(1, a.sampleRate, a.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  const src = a.createBufferSource(), fl = a.createBiquadFilter(), g = a.createGain();
  src.buffer = noiseBuf; src.loop = true;
  fl.type = kind; fl.Q.value = q; fl.frequency.setValueAtTime(f, t0); if (to) fl.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(vol, t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(fl); fl.connect(g); g.connect(master); src.start(t0); src.stop(t0 + dur + 0.02);
}

const SOUNDS = {
  pop: () => tone(520, 0.09, { to: 900, vol: 0.25 }),
  click: () => tone(1100, 0.03, { type: 'square', vol: 0.06 }),
  chat: () => { tone(880, 0.07, { vol: 0.14 }); tone(1175, 0.09, { vol: 0.14, at: 0.07 }); },
  coin: () => { tone(988, 0.08, { type: 'triangle', vol: 0.22 }); tone(1319, 0.22, { type: 'triangle', vol: 0.22, at: 0.08 }); },
  drop: () => { tone(240, 0.13, { to: 110, vol: 0.4 }); noise(0.05, { vol: 0.2, f: 2500 }); },
  turn: () => { tone(784, 0.25, { vol: 0.2 }); tone(1176, 0.3, { vol: 0.12, at: 0.05 }); },
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, { type: 'triangle', vol: 0.25, at: i * 0.1 })),
  lose: () => [392, 330, 262].forEach((f, i) => tone(f, 0.28, { type: 'triangle', vol: 0.2, at: i * 0.14 })),
  error: () => tone(190, 0.16, { type: 'square', vol: 0.1 }),
  door: () => { tone(190, 0.08, { vol: 0.25 }); tone(170, 0.1, { vol: 0.2, at: 0.11 }); },
  throw: () => noise(0.24, { vol: 0.16, f: 500, to: 2200, kind: 'bandpass', q: 1.5 }),
  splat: () => { noise(0.2, { vol: 0.4, f: 900 }); tone(160, 0.2, { to: 60, vol: 0.35 }); },
  splash: () => { noise(0.4, { vol: 0.3, f: 1800, to: 600, kind: 'highpass' }); tone(700, 0.08, { to: 1300, vol: 0.1, at: 0.12 }); tone(900, 0.08, { to: 1500, vol: 0.08, at: 0.2 }); },
  puff: () => noise(0.22, { vol: 0.3, f: 700 }),
  slip: () => { tone(320, 0.26, { to: 1000, vol: 0.2 }); tone(120, 0.18, { to: 55, vol: 0.4, at: 0.3 }); noise(0.1, { vol: 0.25, f: 600, at: 0.3 }); },
  giggle: () => [760, 920, 760, 940, 780].forEach((f, i) => tone(f, 0.07, { vol: 0.14, at: i * 0.09 })),
  fart: () => { tone(96, 0.5, { type: 'sawtooth', to: 58, vol: 0.28 }); tone(140, 0.12, { type: 'sawtooth', to: 90, vol: 0.2, at: 0.36 }); },
  rain: () => noise(0.9, { vol: 0.13, f: 3000, kind: 'highpass' }),
  cluck: () => { tone(520, 0.07, { type: 'square', to: 380, vol: 0.1 }); tone(520, 0.07, { type: 'square', to: 380, vol: 0.1, at: 0.12 }); tone(820, 0.16, { type: 'square', to: 560, vol: 0.1, at: 0.26 }); },
  heart: () => { tone(523, 0.16, { vol: 0.2 }); tone(659, 0.24, { vol: 0.2, at: 0.12 }); },
  clink: () => { tone(2200, 0.28, { vol: 0.14 }); tone(3140, 0.22, { vol: 0.08 }); },
  cheers: () => { SOUNDS.clink(); tone(2500, 0.28, { vol: 0.12, at: 0.14 }); tone(3400, 0.2, { vol: 0.07, at: 0.14 }); },
  pour: () => { noise(0.5, { vol: 0.14, f: 400, to: 1500, kind: 'bandpass', q: 3 }); tone(500, 0.4, { to: 1100, vol: 0.05 }); },
};

export function play(name) {
  if (!on || !ctx || !SOUNDS[name]) return;
  try {
    // asleep: wake it, and only let through a sound that answers a press just made (the rest would all sound at
    // once when it wakes)
    if (ctx.state !== 'running') { ctx.resume(); if (performance.now() - pressAt > 800) return; }
    SOUNDS[name]();
  } catch {}
}
