// SLQ Game Lobby — the shooter's sounds as they are played. Every sound is worked out once (sounds.js: no sound
// files) and kept. Played, it is given its place: how far away (fainter, duller, a little later), to which side,
// and with the arena's echo on top. Everything goes through one squeeze, so that a firefight does not crackle.
// `ear` is whoever listens: an object with x, z and yaw (the player).
import { SOUNDS, renderSound, arenaEcho } from './sounds.js';

const SHOT_VOL = { pistol: 0.85, sniper: 1, bazooka: 0.9, badgun: 0.7 }, SHOT_SPEED = { pistol: 95, sniper: 200, bazooka: 40, badgun: 70 };

export function makeSfx(ear) {
  let ctx = null, master = null, out = null, echo = null, muted = false, trainSrc = null, trainGain = null, played = 0;
  let mine = { kind: 'm', rate: 1 };                           // the player's own voice
  const bufs = new Map(), VOL = 0.85, last = {};
  try { muted = localStorage.getItem('slqShooterMute') === '1'; } catch (e) { }
  function ensure() {
    try {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false;
        ctx = new AC();
        master = ctx.createGain(); master.gain.value = muted ? 0 : VOL;
        const squeeze = ctx.createDynamicsCompressor();
        squeeze.threshold.value = -16; squeeze.knee.value = 12; squeeze.ratio.value = 5; squeeze.attack.value = 0.003; squeeze.release.value = 0.2;
        master.connect(squeeze); squeeze.connect(ctx.destination);
        out = ctx.createGain(); out.connect(master);
        try {                                                  // what the arena gives back
          const ir = arenaEcho(ctx.sampleRate), b = ctx.createBuffer(2, ir[0].length, ctx.sampleRate); b.copyToChannel(ir[0], 0); b.copyToChannel(ir[1], 1);
          echo = ctx.createConvolver(); echo.normalize = false; echo.buffer = b;          // (arenaEcho gives back as much as it gets: how much of it is heard is set where a sound is played)
          const eg = ctx.createGain(); eg.gain.value = 0.7; echo.connect(eg); eg.connect(master);
        } catch (e) { echo = null; }
        warm();
      }
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    } catch (e) { return false; }
  }
  // a take of a sound, made the first time it is wanted
  function buffer(name, take) {
    const s = SOUNDS[name]; if (!s) return null;
    const v = take === undefined ? Math.floor(Math.random() * s[1]) : take % s[1], key = name + ':' + v;
    let b = bufs.get(key);
    if (!b) { const x = renderSound(name, ctx.sampleRate, v); b = ctx.createBuffer(1, x.length, ctx.sampleRate); b.copyToChannel(x, 0); bufs.set(key, b); }
    return b;
  }
  // ... but the ones a fight needs at once are made a few at a time while the menu is still up
  function warm() {
    const list = Object.keys(SOUNDS).filter(n => !/^(win|lose)$/.test(n));       // (in the order they are written there: weapons and hits first)
    (function next() { if (!ctx) return; const n = list.shift(); if (!n) return; try { for (let v = 0; v < SOUNDS[n][1]; v++) buffer(n, v); } catch (e) { } setTimeout(next, 25); })();
  }
  // One sound, now. o: vol; rate (pitch and speed); vary (how much the pitch may differ from time to time);
  // pan (-1 left .. 1 right); lp (the top above this pitch is taken away); wet (how much of the arena's echo);
  // delay (seconds); take (which one of its takes: else any)
  function play(name, o = {}) {
    if (muted || !ensure()) return;
    const vol = o.vol === undefined ? 1 : o.vol; if (!(vol > 0.004)) return;
    let b; try { b = buffer(name, o.take); } catch (e) { return; }
    if (!b) return;
    const t = ctx.currentTime + (o.delay || 0), src = ctx.createBufferSource(); src.buffer = b;
    src.playbackRate.value = (o.rate || 1) * (1 + (Math.random() - 0.5) * (o.vary === undefined ? 0.06 : o.vary));
    let node = src;
    if (o.lp && o.lp < 15000) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = Math.max(180, o.lp); f.Q.value = 0.5; node.connect(f); node = f; }
    const g = ctx.createGain(); g.gain.value = vol; node.connect(g);
    if (o.pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, o.pan)); g.connect(p); p.connect(out); } else g.connect(out);
    const wet = o.wet === undefined ? 0.16 : o.wet;
    if (echo && wet > 0) { const w = ctx.createGain(); w.gain.value = vol * wet; node.connect(w); w.connect(echo); }
    src.start(t); played++;
  }
  // A sound at a place in the arena. o as for play, and: near (as loud as it gets within this distance), far (gone
  // beyond this), wetMax (never more of the echo than this). Further off it is fainter and duller, has more of the
  // echo in it and comes a little later; it comes from the side it is on, and from behind it is a little duller still.
  function at(name, x, z, o = {}) {
    const dx = x - ear.x, dz = z - ear.z, d = Math.hypot(dx, dz), far = o.far || 90, near = o.near || 7; if (d > far) return;
    const k = near / Math.max(near, d) * (1 - (d / far) ** 2);
    const fx = -Math.sin(ear.yaw || 0), fz = -Math.cos(ear.yaw || 0), side = d > 0.3 ? (dx * -fz + dz * fx) / d : 0, front = d > 0.3 ? (dx * fx + dz * fz) / d : 1;
    play(name, Object.assign({}, o, { vol: (o.vol === undefined ? 1 : o.vol) * k, pan: side * 0.8, lp: (o.lp || 16000) / (1 + d / 22) * (front < 0 ? 0.8 + 0.2 * (1 + front) : 1),
      wet: Math.min(o.wetMax || 0.7, (o.wet === undefined ? 0.15 : o.wet) + d / 110), delay: (o.delay || 0) + Math.min(0.3, d / 340) }));
    return d;
  }
  const once = (key, gap) => { const t = ctx ? ctx.currentTime : 0; if (last[key] !== undefined && t - last[key] < gap) return false; last[key] = t; return true; };
  // a bullet that passes close by the ear is heard passing: from where it was fired (x, z) along dir, at its speed
  function passing(x, z, dir, speed) {
    if (!dir) return;
    const l = Math.hypot(dir[0], dir[2]); if (l < 0.2) return;
    const ux = dir[0] / l, uz = dir[2] / l, ex = ear.x - x, ez = ear.z - z, along = ex * ux + ez * uz; if (along < 3 || along > 150) return;
    const off = ex * uz - ez * ux;                                 // how far to the side of its line the ear is
    if (Math.abs(off) > 2.6 || Math.abs(off) < 0.25) return;       // (nearer than that it hits, and is heard as that)
    const fx = -Math.sin(ear.yaw || 0), fz = -Math.cos(ear.yaw || 0), px = x + ux * along - ear.x, pz = z + uz * along - ear.z, pd = Math.hypot(px, pz) || 1;
    play('whiz', { vol: 0.5 * (1 - Math.abs(off) / 3), pan: (px * -fz + pz * fx) / pd * 0.9, delay: along / (speed * l || 80), wet: 0.05, vary: 0.2 });
  }
  // what the hands do with a weapon (the view model says when): a swing of the knife, magazines, the slide, the bolt
  const GEAR = {
    swish: () => play('swish', { vol: 0.7, wet: 0.08 }),
    switch: () => { play('cloth', { vol: 0.5, wet: 0.04 }); play('clack', { vol: 0.3, delay: 0.1, rate: 0.9, wet: 0.04 }); },
    magOut: () => { play('clunk', { vol: 0.5, rate: 1.1, wet: 0.05 }); play('cloth', { vol: 0.25, delay: 0.03, wet: 0.04 }); },
    magIn: () => { play('clunk', { vol: 0.6, rate: 1.25, wet: 0.05 }); play('clack', { vol: 0.5, delay: 0.05, wet: 0.05 }); },
    slide: () => play('slide', { vol: 0.6, wet: 0.05 }),
    boltUp: () => play('clack', { vol: 0.5, rate: 1.15, wet: 0.05 }),
    boltBack: () => play('slide', { vol: 0.55, rate: 0.85, wet: 0.05 }),
    boltFwd: () => { play('slide', { vol: 0.6, wet: 0.05 }); play('clunk', { vol: 0.4, delay: 0.07, rate: 1.3, wet: 0.05 }); },
    rocketIn: () => { play('cloth', { vol: 0.5, rate: 0.7, wet: 0.05 }); play('clunk', { vol: 0.7, delay: 0.22, rate: 0.8, wet: 0.08 }); },
  };
  return {
    unlock: function () { ensure(); },
    toggleMute: function () { muted = !muted; try { localStorage.setItem('slqShooterMute', muted ? '1' : '0'); } catch (e) { } if (master) master.gain.value = muted ? 0 : VOL; return muted; },
    isMuted: function () { return muted; },
    // the player's own voice, and anybody's: { kind: 'm' | 'f' | 'r', rate }
    setVoice: function (v) { if (v) mine = v; },
    // ---- weapons ----
    shoot: function (w) { play('shot_' + w, { vol: SHOT_VOL[w] || 0.8, wet: 0.22, vary: 0.05 }); },
    gear: function (name) { if (GEAR[name]) GEAR[name](); },
    empty: function () { play('click', { vol: 0.5, wet: 0.03 }); },
    knifeHit: function () { play('knifehit', { vol: 0.85, wet: 0.06 }); },
    remoteSwish: function (x, z) { at('swish', x, z, { vol: 0.6, far: 20, near: 3 }); },
    // somebody else fires: wid the weapon, dir the way the bullet goes (it may pass close by)
    remoteShot: function (x, z, wid, dir) { at('shot_' + wid, x, z, { vol: (SHOT_VOL[wid] || 0.8) * 1.05, far: 170, near: 10, wet: 0.2, vary: 0.07 }); passing(x, z, dir, SHOT_SPEED[wid]); },
    explosion: function (x, z) { at('explosion', x, z, { vol: 1.3, far: 240, near: 16, wet: 0.3, vary: 0.1 }); },
    impact: function (x, z) { at(Math.random() < 0.22 ? 'ricochet' : 'impact', x, z, { vol: 0.5, far: 42, near: 5, vary: 0.2 }); },
    // ---- somebody is hit, somebody goes down ----
    hit: function () { play('hit', { vol: 0.6, wet: 0.04, vary: 0.05 }); },
    headshot: function () { play('headshot', { vol: 0.7, wet: 0.1, vary: 0.02 }); },
    kill: function () { play('kill', { vol: 0.5, wet: 0.12, vary: 0 }); },
    hurt: function () { play('hurt', { vol: 0.9, wet: 0.05 }); if (once('ow', 0.45)) play('grunt_' + mine.kind, { vol: 0.35, rate: mine.rate, delay: 0.04, wet: 0.08 }); },
    death: function () { play('cry_' + mine.kind, { vol: 0.6, rate: mine.rate, wet: 0.15 }); play('fall', { vol: 0.8, delay: 0.5, wet: 0.1 }); },
    // a bullet lands in somebody else; a voice at a place: what = 'grunt' (hit) or 'cry' (down)
    remoteHit: function (x, z, head) { at('thud', x, z, { vol: 0.75, far: 46, near: 5, vary: 0.15 }); if (head) at('headshot', x, z, { vol: 0.22, far: 30, near: 4 }); },
    voice: function (what, x, z, v) { v = v || mine; at(what + '_' + v.kind, x, z, { vol: what === 'cry' ? 0.6 : 0.42, rate: v.rate, far: what === 'cry' ? 70 : 46, near: 6 }); if (what === 'cry') at('fall', x, z, { vol: 0.7, far: 40, near: 5, delay: 0.5 }); },
    // ---- the dinos ----
    // (a long sound with the arena's echo on it sounds as if it were in a tub: a roar gets little of it)
    dinoRoar: function (x, z) { at('dino_roar', x, z, { vol: 0.7, far: 130, near: 12, wet: 0.04, wetMax: 0.16, vary: 0.06 }); },
    dinoHurt: function (x, z) { at('dino_hurt', x, z, { vol: 0.5, far: 60, near: 7, vary: 0.12 }); },
    dinoDie: function (x, z) { at('dino_die', x, z, { vol: 0.75, far: 90, near: 9, wet: 0.05, wetMax: 0.16 }); at('fall', x, z, { vol: 0.8, far: 40, near: 5, delay: 0.4, rate: 0.8 }); },
    dinoShot: function (x, z, dir) { at('shot_badgun', x, z, { vol: 0.8, far: 120, near: 9, rate: 0.9, vary: 0.08 }); passing(x, z, dir, 70); },
    // ---- feet ----
    jump: function () { play('jump', { vol: 0.25, wet: 0.04 }); },
    land: function () { play('land', { vol: 0.4, wet: 0.06 }); },
    step: function () { play('step', { vol: 0.2, wet: 0.05, vary: 0.14 }); },
    // ---- what the game says ----
    star: function () { play('star', { vol: 0.45, vary: 0 }); },
    deliver: function () { play('deliver', { vol: 0.5, vary: 0 }); },
    thief: function () { play('thief', { vol: 0.5, vary: 0 }); },
    winS: function () { play('win', { vol: 0.55, vary: 0 }); },
    lose: function () { play('lose', { vol: 0.55, vary: 0 }); },
    beep: function (n) { if (n > 0) play('count', { vol: 0.5, vary: 0, wet: 0.1 }); else play('go', { vol: 0.55, vary: 0 }); },
    pickup: function () { play('pickup', { vol: 0.5, vary: 0.02, wet: 0.06 }); },
    heal: function () { play('heal', { vol: 0.45, vary: 0 }); },
    // the train is heard as long as it is near: v from 0 (not at all) to 1 (beside it)
    trainVol: function (v) {
      if (!ctx || (muted && !trainSrc)) return;
      try {
        if (!trainSrc) { trainSrc = ctx.createBufferSource(); trainSrc.buffer = buffer('train', 0); trainSrc.loop = true; trainGain = ctx.createGain(); trainGain.gain.value = 0; trainSrc.connect(trainGain); trainGain.connect(out); trainSrc.start(); }
        trainGain.gain.setTargetAtTime(v * 0.45, ctx.currentTime, 0.12);
      } catch (e) { }
    },
    stop: function () { if (ctx) { try { ctx.close(); } catch (e) { } } ctx = null; master = null; out = null; echo = null; trainSrc = null; trainGain = null; bufs.clear(); },
    _debug: { played: () => played, state: () => ctx ? ctx.state : 'none', kept: () => bufs.size },
  };
}
