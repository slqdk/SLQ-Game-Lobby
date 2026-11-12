// SLQ Game Lobby — the shooter's sounds, made with WebAudio as they are needed (no sound files).
// The first part is the stand-alone shooter's sound set, moved here unchanged. `ear` is whoever listens:
// an object with x and z (the player), so that far-away sounds are fainter.
export function makeSfx(ear) {

  let ctx = null, master = null, muted = false, trainSrc = null, trainGain = null, stepHi = false;
  try { muted = localStorage.getItem('slqShooterMute') === '1'; } catch (e) { }
  function ensure() {
    try {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false;
        ctx = new AC(); master = ctx.createGain(); master.gain.value = muted ? 0 : 0.5; master.connect(ctx.destination);
      }
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    } catch (e) { return false; }
  }
  function noiseBuf(dur) { const sr = ctx.sampleRate, b = ctx.createBuffer(1, Math.max(64, (sr * dur) | 0), sr), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return b; }
  function env(t0, a, peak, dec) { const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(peak, t0 + a); g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + dec); return g; }
  function bang(vol, dur, cutoff, thump, delay) {              // støj-baseret skud/slag
    if (!ensure() || vol <= 0.01) return; const t = ctx.currentTime + (delay || 0);
    const src = ctx.createBufferSource(); src.buffer = noiseBuf(dur + 0.05);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cutoff;
    const g = env(t, 0.004, vol, dur); src.connect(f); f.connect(g); g.connect(master); src.start(t);
    if (thump) { const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(36, t + 0.25); const og = env(t, 0.005, thump, 0.32); o.connect(og); og.connect(master); o.start(t); o.stop(t + 0.45); }
  }
  function tone(freq, dur, vol, type, slideTo, delay) {
    if (!ensure() || vol <= 0.01) return; const t = ctx.currentTime + (delay || 0);
    const o = ctx.createOscillator(); o.type = type || 'square'; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = env(t, 0.006, vol, dur); o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.08);
  }
  function att(x, z, max) { return Math.max(0, 1 - Math.hypot(ear.x - x, ear.z - z) / max); }
  return {
    unlock: function () { ensure(); },
    toggleMute: function () { muted = !muted; try { localStorage.setItem('slqShooterMute', muted ? '1' : '0'); } catch (e) { } if (master) master.gain.value = muted ? 0 : 0.5; return muted; },
    shoot: function (w) {
      if (w === 'pistol') bang(0.5, 0.14, 2600, 0.10);
      else if (w === 'sniper') bang(0.75, 0.45, 1500, 0.30);
      else if (w === 'bazooka') { bang(0.45, 0.35, 900, 0.22); tone(240, 0.5, 0.2, 'sawtooth', 60); }
      else if (w === 'badgun') bang(0.32, 0.10, 1900, 0.05);
      else tone(700, 0.09, 0.14, 'triangle', 220);            // kniv-svisj
    },
    reloadS: function () { tone(1300, 0.03, 0.16, 'square'); tone(900, 0.03, 0.16, 'square', 0, 0.13); },
    hit: function () { tone(2300, 0.045, 0.22, 'triangle'); },
    hurt: function () { bang(0.4, 0.12, 700, 0.15); },
    death: function () { tone(330, 0.16, 0.3, 'sawtooth', 160); tone(180, 0.3, 0.3, 'sawtooth', 80, 0.14); },
    explosion: function (x, z) { const v = 0.25 + 0.6 * att(x, z, 70); bang(v, 0.7, 700, v * 0.7); },
    impact: function (x, z) { const v = 0.12 * att(x, z, 26); if (v > 0.015) bang(v, 0.05, 2200, 0); },
    dinoShot: function (x, z) { const v = 0.3 * att(x, z, 45); if (v > 0.02) tone(620, 0.1, v, 'sawtooth', 170); },
    remoteShot: function (x, z, bz) { const v = 0.55 * att(x, z, 75); if (v > 0.02) bang(v, bz ? 0.3 : 0.13, bz ? 900 : 2200, v * 0.25); },
    star: function () { tone(660, 0.09, 0.25, 'triangle'); tone(880, 0.09, 0.25, 'triangle', 0, 0.09); tone(1320, 0.14, 0.28, 'triangle', 0, 0.18); },
    deliver: function () { tone(523, 0.1, 0.26, 'triangle'); tone(659, 0.1, 0.26, 'triangle', 0, 0.1); tone(784, 0.1, 0.26, 'triangle', 0, 0.2); tone(1047, 0.22, 0.3, 'triangle', 0, 0.3); },
    winS: function () { tone(523, 0.16, 0.3, 'square'); tone(659, 0.16, 0.3, 'square', 0, 0.16); tone(784, 0.16, 0.3, 'square', 0, 0.32); tone(1047, 0.4, 0.34, 'square', 0, 0.48); },
    beep: function (n) { if (n > 0) tone(880, 0.09, 0.3, 'square'); else tone(1320, 0.4, 0.36, 'square'); },
    jump: function () { tone(300, 0.1, 0.1, 'sine', 470); },
    land: function () { bang(0.16, 0.07, 500, 0.05); },
    step: function () { stepHi = !stepHi; bang(0.07, 0.045, stepHi ? 950 : 780, 0); },
    trainVol: function (v) {
      if (!ctx) return;
      if (!trainSrc) { trainSrc = ctx.createOscillator(); trainSrc.type = 'sawtooth'; trainSrc.frequency.value = 46; const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 130; trainGain = ctx.createGain(); trainGain.gain.value = 0; trainSrc.connect(f); f.connect(trainGain); trainGain.connect(master); trainSrc.start(); }
      trainGain.gain.value = v * 0.2;
    },
    // ---- added for the clubhouse ----
    headshot: function () { tone(2900, 0.05, 0.25, 'triangle'); tone(3700, 0.09, 0.2, 'triangle', 0, 0.045); },
    kill: function () { tone(880, 0.07, 0.24, 'square'); tone(1320, 0.13, 0.24, 'square', 0, 0.07); },
    pickup: function () { tone(520, 0.06, 0.2, 'triangle', 780); tone(780, 0.09, 0.2, 'triangle', 0, 0.06); },
    heal: function () { tone(440, 0.1, 0.2, 'sine', 660); tone(660, 0.15, 0.2, 'sine', 0, 0.1); },
    empty: function () { tone(1500, 0.02, 0.12, 'square'); },
    lose: function () { tone(392, 0.2, 0.28, 'square'); tone(330, 0.2, 0.28, 'square', 0, 0.2); tone(262, 0.45, 0.3, 'square', 0, 0.4); },
    isMuted: function () { return muted; },
    stop: function () { if (ctx) { try { ctx.close(); } catch (e) { } } ctx = null; master = null; trainSrc = null; trainGain = null; },
  };
}
