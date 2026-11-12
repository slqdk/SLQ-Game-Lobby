// SLQ Game Lobby — the weapon in one's own hands: the model from the arsenal, the two arms that hold it, and
// how it all moves: it sways and bobs with the walk, kicks when it fires, the knife is swung in three different
// ways, magazines go out and in, the bolt is worked, and a weapon comes up from below when one changes to it.
//
// It is drawn in a scene of its own, after the arena and on top of it, with a narrower lens: so the barrel never
// sticks through a wall one stands close to, and the weapon is not stretched at the edge of a wide picture.
// Everything here is in the eye's own space: x to the right, y up, -z ahead.
//
// The moves are plain tables of moments (`KNIFE`, `RELOAD` below): a time, where the weapon is, and for the
// knife which way the point and the edge face. `poseAt` reads them; the self test reads them too.

const smooth = k => k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k);
const lerp = (a, b, k) => a + (b - a) * k;

// Where each weapon rests: p the place of its grip, r how it is turned (radians about x, y, z).
// knife: `tip` and `edge` are the ways the point and the cutting edge face instead.
export const REST = {
  knife: { p: [0.165, -0.175, -0.4], tip: [-0.42, 0.62, -0.66], edge: [-0.25, -0.62, -0.74] },
  pistol: { p: [0.105, -0.108, -0.33], r: [0.02, 0.07, 0] },
  badgun: { p: [0.11, -0.112, -0.31], r: [0.03, 0.08, -0.16] },
  sniper: { p: [0.105, -0.178, -0.3], r: [0.03, 0.05, 0] },
  bazooka: { p: [0.2, -0.212, -0.22], r: [0.035, 0.05, 0] },
};
// The knife's three swings. Each moment: [seconds, x, y, z, tip x, y, z, edge x, y, z]. The first and the last
// moment are filled in with the resting pose. `cut` is when the blade passes the middle: the sound, and the lean
// of the camera (`lean`, to the side the blade goes).
export const KNIFE = [
  { name: 'slash', dur: 0.44, cut: 0.15, lean: -1, keys: [
    [0.085, 0.3, -0.05, -0.34, 0.55, 0.7, -0.45, -0.6, 0.1, -0.8],
    [0.165, 0.02, -0.13, -0.45, -0.5, 0.6, -0.62, -0.8, -0.45, 0.25],
    [0.24, -0.27, -0.2, -0.37, -0.9, 0.15, -0.4, -0.25, -0.75, 0.6],
    [0.33, -0.1, -0.26, -0.36, -0.6, 0.45, -0.66, -0.3, -0.6, -0.74]] },
  { name: 'backhand', dur: 0.44, cut: 0.155, lean: 1, keys: [
    [0.085, -0.14, -0.2, -0.36, -0.75, 0.45, -0.5, 0.45, 0.35, -0.82],
    [0.165, 0.06, -0.12, -0.46, -0.05, 0.75, -0.66, 0.92, 0.05, -0.38],
    [0.24, 0.33, -0.02, -0.36, 0.7, 0.6, -0.38, 0.5, -0.6, 0.62],
    [0.33, 0.26, -0.13, -0.38, 0.1, 0.75, -0.65, 0.05, -0.6, -0.8]] },
  { name: 'stab', dur: 0.42, cut: 0.17, lean: 0, keys: [
    [0.09, 0.2, -0.15, -0.21, -0.2, 0.16, -0.97, 0.0, -0.99, -0.12],
    [0.175, 0.05, -0.13, -0.52, -0.28, 0.36, -0.89, 0.0, -0.93, -0.37],
    [0.25, 0.06, -0.135, -0.49, -0.3, 0.37, -0.88, 0.0, -0.93, -0.37],
    [0.33, 0.15, -0.15, -0.36, -0.3, 0.4, -0.86, -0.1, -0.86, -0.5]] },
];
// Loading. Times are parts of the whole (0..1; the weapon's reload time in rules.js is the whole). Channels:
//   rig   [t, x, y, z, rx, ry, rz]   how the weapon is moved and turned from where it rests
//   mag   [t, out]                   the magazine (or the rocket): 0 in place, 1 pulled clear, 2 gone below
//   left  [t, where]                 the left hand: 0 away (below), 1 on the magazine, 2 supporting the weapon
//   bolt  [t, lift, back, hand]      the bolt or slide: lift 0..1 (turned up), back 0..1 (pulled back); hand 1: the right hand goes to it
//                                    (not used: a fist around the small knob looked wrong, so the rifle leans over and the bolt is seen moving)
//   say   [t, sound]                 a sound at that moment
export const RELOAD = {
  pistol: {
    rig: [[0, 0, 0, 0, 0, 0, 0], [0.13, -0.05, 0.075, 0.03, 0.5, 0.15, -0.6], [0.6, -0.05, 0.07, 0.03, 0.48, 0.15, -0.55], [0.66, -0.05, 0.09, 0.03, 0.52, 0.15, -0.55], [0.8, -0.015, 0.02, 0.01, 0.12, 0.04, -0.15], [1, 0, 0, 0, 0, 0, 0]],
    mag: [[0, 0], [0.11, 0], [0.24, 1], [0.3, 2], [0.36, 2], [0.37, 1.25], [0.5, 1], [0.6, 0.12], [0.64, 0], [1, 0]],
    left: [[0, 0], [0.3, 0], [0.37, 1], [0.66, 1], [0.8, 0], [1, 0]],
    bolt: [[0, 0, 0, 0], [1, 0, 0, 0]],
    say: [[0.11, 'magOut'], [0.62, 'magIn'], [0.82, 'slide']],
  },
  badgun: {
    rig: [[0, 0, 0, 0, 0, 0, 0], [0.12, -0.05, 0.07, 0.02, 0.45, 0.12, -0.45], [0.5, -0.05, 0.065, 0.02, 0.42, 0.12, -0.42], [0.56, -0.05, 0.09, 0.03, 0.5, 0.12, -0.42], [0.7, -0.01, 0.03, 0.01, 0.14, 0.02, -0.1], [0.78, 0, 0.005, 0.02, 0.04, 0, 0.1], [1, 0, 0, 0, 0, 0, 0]],
    mag: [[0, 0], [0.1, 0], [0.2, 1], [0.27, 2], [0.32, 2], [0.33, 1.3], [0.44, 1], [0.52, 0.1], [0.55, 0], [1, 0]],
    left: [[0, 0], [0.26, 0], [0.33, 1], [0.58, 1], [0.7, 0], [1, 0]],
    bolt: [[0, 0, 0, 0], [0.7, 0, 0, 0], [0.78, 0, 1, 0], [0.86, 0, 0, 0], [1, 0, 0, 0]],
    say: [[0.1, 'magOut'], [0.53, 'magIn'], [0.78, 'slide']],
  },
  sniper: {
    rig: [[0, 0, 0, 0, 0, 0, 0], [0.1, -0.03, 0.11, 0.02, 0.42, -0.02, -0.55], [0.5, -0.03, 0.11, 0.02, 0.4, -0.02, -0.52], [0.6, 0.0, 0.0, -0.09, 0.05, 0.1, 0.34], [0.92, 0.0, 0.0, -0.09, 0.05, 0.1, 0.34], [1, 0, 0, 0, 0, 0, 0]],
    mag: [[0, 0], [0.12, 0], [0.22, 1], [0.28, 2], [0.33, 2], [0.34, 1.3], [0.42, 1], [0.49, 0.1], [0.52, 0], [1, 0]],
    left: [[0, 2], [0.06, 2], [0.13, 1], [0.24, 1], [0.3, 0], [0.33, 0], [0.36, 1], [0.54, 1], [0.62, 2], [1, 2]],
    bolt: [[0, 0, 0, 0], [0.61, 0, 0, 0], [0.67, 1, 0, 0], [0.75, 1, 1, 0], [0.84, 1, 0, 0], [0.91, 0, 0, 0], [1, 0, 0, 0]],
    say: [[0.12, 'magOut'], [0.5, 'magIn'], [0.64, 'boltUp'], [0.72, 'boltBack'], [0.82, 'boltFwd']],
  },
  bazooka: {
    rig: [[0, 0, 0, 0, 0, 0, 0], [0.16, -0.05, -0.03, 0.02, -0.07, 0.4, 0.12], [0.7, -0.05, -0.03, 0.02, -0.07, 0.4, 0.12], [0.76, -0.05, -0.025, 0.05, -0.06, 0.4, 0.12], [0.88, -0.01, -0.005, 0.01, -0.01, 0.1, 0.02], [1, 0, 0, 0, 0, 0, 0]],
    mag: [[0, 2], [0.3, 2], [0.31, 1.6], [0.5, 1], [0.68, 0.1], [0.72, 0], [1, 0]],
    left: [[0, 2], [0.1, 2], [0.2, 0], [0.3, 0], [0.34, 1], [0.74, 1], [0.84, 2], [1, 2]],
    bolt: [[0, 0, 0, 0], [1, 0, 0, 0]],
    say: [[0.72, 'rocketIn']],
  },
};
// After a shot from the bolt rifle the bolt is worked: [seconds, lift, back]; the right hand is on it meanwhile.
export const BOLT_CYCLE = { to: 0.98, keys: [[0.16, 0, 0, 0], [0.3, 0, 0, 0], [0.42, 1, 0, 0], [0.54, 1, 1, 0], [0.7, 1, 0, 0], [0.82, 0, 0, 0], [0.97, 0, 0, 0]], say: [[0.4, 'boltUp'], [0.5, 'boltBack'], [0.66, 'boltFwd']],
  rig: [[0.14, 0, 0, 0, 0, 0, 0], [0.32, 0.0, 0.0, -0.09, 0.05, 0.1, 0.34], [0.82, 0.0, 0.0, -0.09, 0.05, 0.1, 0.34], [0.98, 0, 0, 0, 0, 0, 0]] };
// How hard each firearm kicks: back (m), up (radians), how fast it comes home, how much it wanders sideways.
const KICK = { pistol: [0.05, 0.16, 15, 0.03], badgun: [0.035, 0.11, 18, 0.07], sniper: [0.1, 0.2, 7.5, 0.03], bazooka: [0.13, 0.17, 5.5, 0.04] };

// The value of a channel at time t: the moments on either side, eased between. n: how many numbers after the time.
export function channel(keys, t, out) {
  const n = keys[0].length - 1;
  let i = 0;
  while (i < keys.length - 2 && t >= keys[i + 1][0]) i++;
  const a = keys[i], b = keys[Math.min(keys.length - 1, i + 1)], k = b[0] > a[0] ? smooth((t - a[0]) / (b[0] - a[0])) : 0;
  for (let j = 0; j < n; j++) out[j] = lerp(a[j + 1], b[j + 1], k);
  return out;
}
// A knife swing at `t` seconds: the place [x, y, z], the point's way and the edge's way (not yet of length 1).
export function knifeAt(kind, t, out) {
  const sw = KNIFE[kind], R = REST.knife, rest = [0, ...R.p, ...R.tip, ...R.edge], end = rest.slice();
  end[0] = sw.dur;
  return channel([rest, ...sw.keys, end], Math.max(0, Math.min(sw.dur, t)), out);
}

// arsenal: makeArsenal(). opt: { skin, sleeve (colours), bare (short sleeves), sound(name) }
export function makeViewModel(THREE, arsenal, opt = {}) {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(56, 16 / 9, 0.02, 20);
  scene.add(camera);
  scene.add(new THREE.HemisphereLight(0xcfe2f5, 0x4a4f55, 1.0));
  const sun = new THREE.DirectionalLight(0xfff1d8, 2.2), sunDir = new THREE.Vector3(34, 54, 26).normalize();
  scene.add(sun, sun.target, new THREE.AmbientLight(0xffffff, 0.22));
  const root = new THREE.Group(), pose = new THREE.Group(), shells = new THREE.Group();
  camera.add(root, shells); root.add(pose);
  const say = opt.sound || (() => {});

  const armR = arsenal.arm(1, opt.skin == null ? 0xe2b08a : opt.skin, opt.sleeve == null ? 0x3d6fb0 : opt.sleeve, !!opt.bare);
  const armL = arsenal.arm(-1, opt.skin == null ? 0xe2b08a : opt.skin, opt.sleeve == null ? 0x3d6fb0 : opt.sleeve, !!opt.bare);
  pose.add(armR.group, armL.group);
  const ELBOW_R = new THREE.Vector3(0.33, -0.56, 0.16), ELBOW_L = new THREE.Vector3(-0.3, -0.56, 0.08), tmpV = new THREE.Vector3(), tmpW = new THREE.Vector3();

  // the fire at the muzzle, its light on the weapon, smoke, and the empty shells
  const flash = new THREE.Mesh(arsenal.flashGeo, arsenal.flashMat.clone()), flashLight = new THREE.PointLight(0xffc266, 0, 1.6);
  flash.visible = false; pose.add(flash, flashLight);
  const smokeGeo = new THREE.SphereGeometry(1, 8, 6), smoke = [], shellList = [];
  for (let i = 0; i < 5; i++) { const m = new THREE.Mesh(smokeGeo, new THREE.MeshBasicMaterial({ color: 0x8a8a84, transparent: true, opacity: 0, depthWrite: false })); m.visible = false; camera.add(m); smoke.push({ m, t: 0, ttl: 0, v: new THREE.Vector3(), s0: 0.02 }); }
  for (let i = 0; i < 6; i++) { const m = new THREE.Mesh(arsenal.shellGeo, arsenal.materials.brass); m.visible = false; shells.add(m); shellList.push({ m, t: 0, v: new THREE.Vector3(), w: new THREE.Vector3() }); }
  // the smear behind a swung blade: three faint copies where it was a moment ago
  const ghosts = [];

  let id = '', weapon = null, want = '', wantFull = true, drawK = 1, holster = false;
  let swing = null, swingNo = 0, lastSwing = -9, clock = 0, hitT = 0;
  let reload = null, bolt = null, slideT = -1, slideLock = false, flashT = 0, loaded = true;
  const kick = { z: 0, rx: 0, ry: 0, rz: 0, vz: 0, vrx: 0, vry: 0, vrz: 0 };
  let sprintK = 0, airY = 0, visible = true, leanT = 0, leanDir = 0;
  const said = new Set(), ch = new Array(9).fill(0), q1 = new THREE.Quaternion(), e1 = new THREE.Euler(), m1 = new THREE.Matrix4(), vx = new THREE.Vector3(), vy = new THREE.Vector3(), vz = new THREE.Vector3();
  const api = { scene, camera, lean: 0 };

  // the turning that makes the knife's point face `tip` and its edge face `edge`
  function knifeQuat(out, tx, ty, tz, ex, ey, ez) {
    vz.set(-tx, -ty, -tz).normalize();                          // the model's z looks away from the point
    vy.set(-ex, -ey, -ez); vy.addScaledVector(vz, -vy.dot(vz)).normalize();      // its y looks away from the edge
    vx.crossVectors(vy, vz);
    return out.setFromRotationMatrix(m1.makeBasis(vx, vy, vz));
  }
  function place(arm, at) { arm.group.position.set(at[0], at[1], at[2]); arm.group.rotation.set(at[3], at[4], at[5]); }

  function swap(next) {
    if (weapon) { pose.remove(weapon.group); for (const g of ghosts) { root.remove(g); g.material.dispose(); } ghosts.length = 0; }
    id = next; weapon = arsenal.build(id);
    pose.add(weapon.group);
    const d = weapon.def;
    place(armR, d.hand); weapon.group.add(armR.group);
    armL.group.visible = !!d.support;
    if (d.support) { place(armL, d.support); weapon.group.add(armL.group); } else pose.add(armL.group);
    flash.position.set(d.muzzle[0], d.muzzle[1], d.muzzle[2]); flashLight.position.copy(flash.position).z += 0.06;
    flash.scale.setScalar(id === 'bazooka' ? 2.4 : id === 'sniper' ? 1.5 : id === 'badgun' ? 0.75 : 1);
    if (id === 'knife') {
      const s = d.shapes.body.find(x => x.mat === 'blade');
      for (let i = 0; i < 5; i++) { const g = new THREE.Mesh(s.geo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false })); g.visible = false; root.add(g); ghosts.push(g); }
    }
    swing = null; reload = null; bolt = null; slideT = -1; said.clear();
    loaded = wantFull; slideLock = !wantFull && id === 'pistol';
    if (weapon.parts.rocket) weapon.parts.rocket.visible = loaded;
  }

  // ---- what the game tells ----
  // next: the weapon. instant: no coming up from below. full: is there a round in it (false: it comes up empty)
  api.set = (next, instant, full = true) => {
    wantFull = full;
    if (!id || instant) { swap(next); want = ''; drawK = instant ? 1 : 0; holster = false; return; }
    if (next === id && !want) return;
    want = next === id ? '' : next; holster = !!want;
    if (want) say('switch');
  };
  api.current = () => want || id;
  // a shot: `last` when the magazine is empty after it
  api.fire = last => {
    const k = KICK[id];
    if (!k || !weapon) return;
    kick.vz += k[0] * 26; kick.vrx += k[1] * 26; kick.vry += (Math.random() - 0.5) * k[3] * 40; kick.vrz += (Math.random() - 0.5) * k[3] * 60;
    flashT = id === 'bazooka' ? 0.09 : 0.055; flash.rotation.z = Math.random() * Math.PI; flash.visible = true;
    reload = null;
    if (id === 'pistol') { slideT = 0; slideLock = !!last; shell(0); }
    else if (id === 'badgun') { slideT = 0; shell(0); if (Math.random() < 0.35) puff(0.03, 0.35, 0.5); }
    else if (id === 'sniper') { if (!last) { bolt = { t: 0 }; said.clear(); } puff(0.04, 0.5, 0.4); }
    else if (id === 'bazooka') { loaded = false; if (weapon.parts.rocket) weapon.parts.rocket.visible = false; puff(0.09, 0.9, 0.8); puff(0.06, 0.7, 0.5); }
  };
  // the knife is swung: which of the three (two slashes take turns; the third quick one in a row is a stab)
  api.swing = () => {
    const quick = clock - lastSwing < 0.95;
    swingNo = quick ? swingNo + 1 : 0;
    const kind = swingNo % 3 === 2 ? 2 : swingNo % 3;
    swing = { kind, t: 0, said: false };
    lastSwing = clock; leanDir = KNIFE[kind].lean;
    return kind;
  };
  api.hit = () => { hitT = 0.09; kick.vz -= 0.9; };
  api.reload = secs => { if (!RELOAD[id]) return; reload = { t: 0, dur: Math.max(0.3, secs) }; bolt = null; said.clear(); };
  api.loaded = () => { loaded = true; slideLock = false; if (weapon && weapon.parts.rocket) weapon.parts.rocket.visible = true; };
  api.reset = () => { swing = null; reload = null; bolt = null; slideT = -1; slideLock = false; loaded = true; kick.z = kick.rx = kick.ry = kick.rz = kick.vz = kick.vrx = kick.vry = kick.vrz = 0; drawK = 0; holster = false; want = ''; if (weapon && weapon.parts.rocket) weapon.parts.rocket.visible = true; };
  Object.defineProperty(api, 'visible', { get: () => visible, set: v => { visible = !!v; } });

  function shell(delay) {
    const d = weapon.def; if (!d.eject) return;
    const s = shellList.find(x => !x.m.visible) || shellList[0];
    s.m.visible = true; s.t = -delay;
    weapon.group.updateWorldMatrix(true, false);
    camera.worldToLocal(s.m.position.set(d.eject[0], d.eject[1], d.eject[2]).applyMatrix4(weapon.group.matrixWorld));
    s.v.set(0.9 + Math.random() * 0.5, 0.9 + Math.random() * 0.4, 0.15 + Math.random() * 0.3);
    s.w.set(Math.random() * 20 - 10, Math.random() * 20 - 10, Math.random() * 20 - 10);
    s.m.rotation.set(Math.random() * 3, Math.random() * 3, 0);
  }
  function puff(size, ttl, speed) {
    const s = smoke.find(x => !x.m.visible); if (!s || !weapon) return;
    const d = weapon.def;
    weapon.group.updateWorldMatrix(true, false);
    camera.worldToLocal(s.m.position.set(d.muzzle[0], d.muzzle[1], d.muzzle[2]).applyMatrix4(weapon.group.matrixWorld));
    s.m.visible = true; s.t = 0; s.ttl = ttl; s.s0 = size; s.v.set((Math.random() - 0.5) * 0.15, 0.12 + Math.random() * 0.1, -speed * 0.3);
  }

  // ---- every frame ----
  // s: { bob (the walk's swing), move (0..1 how fast one walks), sprint, vy, dip, swayX, swayY }
  api.update = (dt, s) => {
    clock += dt;
    if (!weapon) return;
    // changing weapon: down, the other one in, up
    if (holster) { drawK -= dt / 0.11; if (drawK <= 0) { drawK = 0; holster = false; swap(want); want = ''; } }
    else if (drawK < 1) drawK = Math.min(1, drawK + dt / 0.2);
    const d = weapon.def, R = REST[id] || REST.pistol, P = pose.position, parts = weapon.parts;
    sprintK += ((s.sprint ? 1 : 0) - sprintK) * Math.min(1, dt * 9);
    airY += (Math.max(-0.035, Math.min(0.035, -(s.vy || 0) * 0.004)) - airY) * Math.min(1, dt * 10);

    // -- the weapon itself --
    let lean = 0;
    if (id === 'knife') {
      if (swing) {
        swing.t += dt;
        const sw = KNIFE[swing.kind];
        if (!swing.said && swing.t >= sw.cut - 0.06) { swing.said = true; say('swish'); leanT = 0.2; }
        knifeAt(swing.kind, swing.t, ch);
        if (swing.t >= sw.dur) swing = null;
      } else knifeAt(0, 0, ch);
      P.set(ch[0], ch[1], ch[2]); knifeQuat(pose.quaternion, ch[3], ch[4], ch[5], ch[6], ch[7], ch[8]);
      // the smear: where the blade was a moment ago, while it is fast
      ghosts.forEach((g, i) => {
        const back = (i + 1) * 0.008, fast = swing && swing.t > 0.07 && swing.t < 0.3;
        g.visible = !!fast;
        if (fast) { knifeAt(swing.kind, swing.t - back, ch); g.position.set(ch[0], ch[1], ch[2]); knifeQuat(g.quaternion, ch[3], ch[4], ch[5], ch[6], ch[7], ch[8]); g.material.opacity = 0.17 - i * 0.03; }
      });
    } else {
      P.set(R.p[0], R.p[1], R.p[2]); e1.set(R.r[0], R.r[1], R.r[2]);
      let magOut = loaded || id !== 'bazooka' ? 0 : 2, left = d.support ? 2 : 0, lift = 0, back = 0, onBolt = 0;
      if (reload) {
        reload.t += dt;
        const u = Math.min(1, reload.t / reload.dur), T = RELOAD[id];
        channel(T.rig, u, ch); P.x += ch[0]; P.y += ch[1]; P.z += ch[2]; e1.x += ch[3]; e1.y += ch[4]; e1.z += ch[5];
        magOut = channel(T.mag, u, ch)[0]; left = channel(T.left, u, ch)[0];
        channel(T.bolt, u, ch); lift = ch[0]; back = ch[1]; onBolt = ch[2];
        for (const [t, name] of T.say) if (u >= t && !said.has(name)) { said.add(name); if (name !== 'slide' || slideLock || id === 'badgun') say(name); if (name === 'slide') slideLock = false; if (name === 'rocketIn' || name === 'magIn') loaded = true; if (name === 'boltBack') shell(0); }
        if (u >= 1) reload = null;
      } else if (bolt) {
        bolt.t += dt;
        channel(BOLT_CYCLE.rig, bolt.t, ch); P.x += ch[0]; P.y += ch[1]; P.z += ch[2]; e1.x += ch[3]; e1.y += ch[4]; e1.z += ch[5];
        channel(BOLT_CYCLE.keys, bolt.t, ch); lift = ch[0]; back = ch[1]; onBolt = ch[2];
        for (const [t, name] of BOLT_CYCLE.say) if (bolt.t >= t && !said.has(name)) { said.add(name); say(name); if (name === 'boltBack') shell(0); }
        if (bolt.t >= BOLT_CYCLE.to) bolt = null;
      }
      pose.quaternion.setFromEuler(e1);
      // the slide of the pistol and the bolt of the bad one: back at once, home again (or held back, empty)
      if (slideT >= 0) { slideT += dt; if (slideT > 0.1) slideT = -1; }
      const blow = slideT >= 0 ? (slideT < 0.028 ? slideT / 0.028 : Math.max(0, 1 - (slideT - 0.028) / 0.07)) : 0;
      if (parts.slide) parts.slide.position.z = 0.034 * Math.max(blow, slideLock ? 1 : 0);
      if (parts.bolt && id === 'badgun') parts.bolt.position.z = 0.032 * Math.max(blow, back);
      if (parts.bolt && id === 'sniper') { parts.bolt.rotation.z = lift * 1.05; parts.bolt.position.z = back * 0.078; }
      // the magazine or the rocket: out along its way, then down and away
      const mg = parts.mag || parts.rocket;
      if (mg) {
        const home = mg.userData.home;
        if (parts.rocket) { const k = Math.min(1, magOut), far = Math.max(0, magOut - 1); mg.position.set(home[0] - far * 0.16, home[1] - far * 0.3, home[2] - k * 0.36 - far * 0.05); mg.visible = magOut < 1.95 && (loaded || !!reload); }
        else { const k = Math.min(1, magOut), far = Math.max(0, magOut - 1), o = d.magOut; mg.position.set(home[0] + o[0] * k - far * 0.05, home[1] + o[1] * k - far * 0.34, home[2] + o[2] * k + far * 0.04); mg.visible = magOut < 1.95; }
      }
      // the right hand: on the grip, or on the bolt while it is worked
      if (onBolt > 0 && d.boltHand) {
        const b = d.boltHand, h = d.hand;
        tmpV.set(b[0], b[1] - d.pivots.bolt[1], b[2]).applyAxisAngle(vz.set(0, 0, 1), lift * 1.05); tmpV.y += d.pivots.bolt[1]; tmpV.z += back * 0.078;
        armR.group.position.set(lerp(h[0], tmpV.x, onBolt), lerp(h[1], tmpV.y, onBolt), lerp(h[2], tmpV.z, onBolt));
        armR.group.rotation.set(lerp(h[3], b[3], onBolt), lerp(h[4], b[4], onBolt), lerp(h[5], b[5], onBolt));
      } else place(armR, d.hand);
      // the left hand: away, on the magazine, or holding the weapon up
      if (left <= 0.001 && !d.support) armL.group.visible = false;
      else {
        armL.group.visible = true;
        const sup = d.support || [-0.02, -0.2, -0.05, 0, 0, 0], away = [sup[0] - 0.12, -0.42, sup[2] + 0.16, 0.3, 0, 0.3];
        let mx = away[0], my = away[1], mz = away[2], mrx = 0.2, mry = 0, mrz = 0.2;
        if (mg && d.magHand) { const o = d.magHand, home = mg.userData.home; mx = mg.position.x - home[0] + o[0] + (parts.rocket ? home[0] : 0); my = mg.position.y - home[1] + o[1] + (parts.rocket ? home[1] : 0); mz = mg.position.z - home[2] + o[2] + (parts.rocket ? home[2] : 0); mrx = o[3]; mry = o[4]; mrz = o[5]; }
        const a = left <= 1 ? away : [mx, my, mz, mrx, mry, mrz], b = left <= 1 ? [mx, my, mz, mrx, mry, mrz] : sup, k = smooth(left <= 1 ? left : left - 1);
        armL.group.position.set(lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k));
        armL.group.rotation.set(lerp(a[3], b[3], k), lerp(a[4], b[4], k), lerp(a[5], b[5], k));
        if (armL.group.parent !== weapon.group) weapon.group.add(armL.group);
      }
    }
    if (leanT > 0) { leanT -= dt; lean = leanDir * Math.sin(Math.max(0, leanT) / 0.2 * Math.PI) * 0.03; }
    api.lean = lean;

    // -- how the whole of it rides along: the kick, the walk, a run, a landing, the hand that lags behind the eye --
    const K = KICK[id] || [0, 0, 16, 0], st = K[2] * K[2], dm = 2 * K[2] * 0.82;
    for (const [p, v] of [['z', 'vz'], ['rx', 'vrx'], ['ry', 'vry'], ['rz', 'vrz']]) { kick[v] += (-st * kick[p] - dm * kick[v]) * dt; kick[p] += kick[v] * dt; }
    if (hitT > 0) hitT -= dt;
    const gun = id !== 'knife', down = 1 - smooth(drawK), mv = s.move || 0, bob = s.bob || 0;
    const sx = gun ? [-0.05, -0.04, 0.05, -0.42, 0.62, 0.22] : [-0.02, -0.05, 0.04, -0.3, 0.15, 0.12];
    root.position.set(
      Math.sin(bob) * 0.0065 * mv - (s.swayX || 0) * 0.012 + sx[0] * sprintK + (hitT > 0 ? (Math.random() - 0.5) * 0.012 : 0),
      (Math.abs(Math.cos(bob)) - 1) * 0.007 * mv + (s.swayY || 0) * 0.008 + Math.sin(clock * 1.7) * 0.0022 - (s.dip || 0) * 0.35 + airY + sx[1] * sprintK - down * 0.26,
      kick.z + sx[2] * sprintK + down * 0.05);
    // the turning (kick, lag, run, coming up) is about the grip: the weapon tips in the hand, it does not swing round the eye
    q1.setFromEuler(e1.set(kick.rx + (s.swayY || 0) * 0.05 + sx[3] * sprintK - down * 1.1, kick.ry + (s.swayX || 0) * 0.07 + sx[4] * sprintK, kick.rz + Math.sin(clock * 1.1) * 0.006 + Math.sin(bob) * 0.02 * mv + sx[5] * sprintK));
    pose.quaternion.premultiply(q1);
    for (const g of ghosts) if (g.visible) g.quaternion.premultiply(q1);

    // -- the fire, the smoke, the shells --
    if (flashT > 0) { flashT -= dt; flash.material.opacity = Math.max(0, flashT / 0.055) * 0.95; flashLight.intensity = Math.max(0, flashT / 0.055) * 2.2; if (flashT <= 0) { flash.visible = false; flashLight.intensity = 0; } }
    for (const p of smoke) { if (!p.m.visible) continue; p.t += dt; const k = p.t / p.ttl; if (k >= 1) { p.m.visible = false; continue; } p.m.position.addScaledVector(p.v, dt); p.m.scale.setScalar(p.s0 * (1 + k * 3.2)); p.m.material.opacity = 0.42 * (1 - k); }
    for (const c of shellList) { if (!c.m.visible) continue; c.t += dt; if (c.t < 0) continue; if (c.t > 0.75) { c.m.visible = false; continue; } c.v.y -= 5.2 * dt; c.m.position.addScaledVector(c.v, dt); c.m.rotation.x += c.w.x * dt; c.m.rotation.y += c.w.y * dt; c.m.rotation.z += c.w.z * dt; }
  };

  // Draws the hands and the weapon over the picture of the arena. main: the game's camera.
  api.render = (renderer, main) => {
    if (!visible || !weapon) return;
    camera.position.copy(main.position); camera.quaternion.copy(main.quaternion);
    if (camera.aspect !== main.aspect) { camera.aspect = main.aspect; camera.updateProjectionMatrix(); }
    sun.position.copy(camera.position).addScaledVector(sunDir, 30); sun.target.position.copy(camera.position);
    camera.updateMatrixWorld(true);
    arsenal.aimArm(armR, tmpW.copy(ELBOW_R).applyMatrix4(camera.matrixWorld));
    if (armL.group.visible) arsenal.aimArm(armL, tmpW.copy(ELBOW_L).applyMatrix4(camera.matrixWorld));
    const auto = renderer.autoClear;
    renderer.autoClear = false; renderer.clearDepth();
    renderer.render(scene, camera);
    renderer.autoClear = auto;
  };
  api.dispose = () => { armR.dispose(); armL.dispose(); smokeGeo.dispose(); for (const p of smoke) p.m.material.dispose(); for (const g of ghosts) g.material.dispose(); flash.material.dispose(); };
  api._debug = { pose, root, armR, armL, get weapon() { return weapon; }, get state() { return { id, want, drawK, swing, reload, bolt, slideT, slideLock, loaded }; } };
  return api;
}
