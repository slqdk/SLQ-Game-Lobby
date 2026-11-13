// SLQ Game Lobby — the people in the saloon: the same figure as in the shooter (shooter/figure.js builds it from
// the look), posed here for clubhouse life: walking, sitting, a glass in the hand that one drinks from, gestures,
// and everything teasing does (snow on the head, a tomato in the face, a cream pie, a rain cloud, being a hen ...).
// A figure looks along +z and its right arm is arms[0].
import { makeFigures } from '../../shooter/figure.js';
import { DRINKS } from '../../shared/defs.js';

const ARM = 0.55, HIP = 0.75;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

export function makePeople(THREE) {
  const figs = makeFigures(THREE, null);
  const DOWN = new THREE.Vector3(0, -1, 0), V = new THREE.Vector3();
  const G = {
    sphere: new THREE.SphereGeometry(1, 14, 10), half: new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), cyl: new THREE.CylinderGeometry(1, 1, 1, 12), open: new THREE.CylinderGeometry(1, 0.86, 1, 12, 1, true),
    cone: new THREE.ConeGeometry(1, 1, 10), box: new THREE.BoxGeometry(1, 1, 1), disc: new THREE.CircleGeometry(1, 20), torus: new THREE.TorusGeometry(1, 0.2, 6, 12),
  };
  const mat = (c, o) => new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.7, metalness: 0 }, o));
  const M = {
    glass: mat(0xcfe6ee, { transparent: true, opacity: 0.32, roughness: 0.15, depthWrite: false }), foam: mat(0xfff8e8), white: mat(0xfaf6ee), snow: mat(0xf4f8ff, { roughness: 0.9 }), tomato: mat(0xd8322c), cream: mat(0xfff4dc),
    cloud: mat(0x8d94a3, { roughness: 1 }), rain: new THREE.MeshBasicMaterial({ color: 0x8fd0ff }), comb: mat(0xd8343c), beak: mat(0xf2a53a), ink: mat(0x1d1a22), brown: mat(0x5a3418), steam: new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false }),
    shadow: new THREE.MeshBasicMaterial({ color: 0x1a0d08, transparent: true, opacity: 0.3, depthWrite: false }),
  };
  const liquids = new Map();
  const liquid = c => { if (!liquids.has(c)) liquids.set(c, mat(parseInt(c.slice(1), 16), { roughness: 0.3 })); return liquids.get(c); };
  const part = (parent, geo, m, sx, sy, sz, x, y, z) => { const o = new THREE.Mesh(geo, m); o.scale.set(sx, sy, sz); o.position.set(x, y, z); parent.add(o); return o; };

  // What is in the hand: built to stand on the hand's palm, y up. Returns the group and the piece that is the drink
  // itself (it sinks as the glass is emptied).
  function vessel(k) {
    const d = DRINKS[k] || DRINKS.fadol, g = new THREE.Group(), col = liquid(d.col);
    let drink = null, full = 0.2;
    if (d.glass === 'bottle') { part(g, G.cyl, col, 0.045, 0.2, 0.045, 0, 0.1, 0); part(g, G.cone, col, 0.045, 0.08, 0.045, 0, 0.24, 0); part(g, G.cyl, col, 0.018, 0.1, 0.018, 0, 0.28, 0); part(g, G.cyl, M.foam, 0.047, 0.07, 0.047, 0, 0.11, 0); }
    else if (d.glass === 'shot') { full = 0.07; drink = part(g, G.cyl, col, 0.028, full, 0.028, 0, 0.045, 0); part(g, G.open, M.glass, 0.036, 0.1, 0.036, 0, 0.05, 0); }
    else if (d.glass === 'wine') { full = 0.08; part(g, G.cyl, M.glass, 0.045, 0.012, 0.045, 0, 0.006, 0); part(g, G.cyl, M.glass, 0.008, 0.11, 0.008, 0, 0.06, 0); drink = part(g, G.half, col, 0.06, full, 0.06, 0, 0.2, 0); drink.rotation.x = Math.PI; part(g, G.open, M.glass, 0.065, 0.12, 0.065, 0, 0.18, 0); }
    else if (d.glass === 'mug') { full = 0.13; part(g, G.cyl, M.white, 0.065, 0.15, 0.065, 0, 0.075, 0); drink = part(g, G.cyl, col, 0.056, 0.01, 0.056, 0, 0.148, 0); part(g, G.torus, M.white, 0.045, 0.045, 0.045, 0.075, 0.08, 0).rotation.y = 0; }
    else if (d.glass === 'tall') { full = 0.2; drink = part(g, G.cyl, col, 0.042, full, 0.042, 0, 0.11, 0); if (d.col2) part(g, G.cyl, liquid(d.col2), 0.043, 0.05, 0.043, 0, 0.04, 0); part(g, G.open, M.glass, 0.05, 0.24, 0.05, 0, 0.12, 0); part(g, G.cyl, M.white, 0.006, 0.26, 0.006, 0.02, 0.17, 0).rotation.z = -0.25; }
    else { full = 0.2; drink = part(g, G.cyl, col, 0.058, full, 0.058, 0, 0.11, 0); if (d.foam) part(drink, G.cyl, M.foam, 1.04, 0.2, 1.04, 0, 0.6, 0); part(g, G.open, M.glass, 0.068, 0.25, 0.068, 0, 0.125, 0); part(g, G.torus, M.glass, 0.05, 0.07, 0.05, 0.085, 0.13, 0); }
    let steam = null;
    if (d.steam) { steam = new THREE.Group(); g.add(steam); for (let i = 0; i < 3; i++) part(steam, G.sphere, M.steam, 0.03, 0.03, 0.03, 0, 0.2, 0); }
    return { g, drink, full, base: drink ? drink.position.y - (d.glass === 'mug' ? 0 : full / 2) : 0, steam, kind: d.glass };
  }

  // One member. look: the clubhouse look.
  function person(look) {
    const f = figs.make(look, {}), P = f.parts, root = f.group;
    const hold = new THREE.Group(); P.upper.add(hold);                     // what is held: it follows the right hand, and stays upright
    const shadow = part(root, G.disc, M.shadow, 0.46, 0.46, 1, 0, 0.012, 0); shadow.rotation.x = -Math.PI / 2;
    for (const i of [0, 1]) P.legs[i].rotation.order = 'XZY';
    let ves = null, vesK = '', hen = null, cloud = null, extras = {};
    const mouth0 = P.mouth.scale.clone(), eye0 = P.eyes.map(e => e.scale.clone());
    // a hand goes to a place (in the upper body's own measure): the arm points there and gives a little
    function armTo(i, x, y, z) {
      const arm = P.arms[i];
      V.set(x, y, z).sub(arm.position);
      const len = V.length(), k = clamp(len / ARM, 0.75, 1.3);
      arm.quaternion.setFromUnitVectors(DOWN, V.divideScalar(len || 1));
      arm.scale.y = k; P.hands[i].scale.y = 0.1 / k;
      return k;
    }
    const armHang = (i, rx, rz) => { const arm = P.arms[i]; arm.rotation.set(rx, 0, rz); arm.scale.y = 1; P.hands[i].scale.y = 0.1; };
    const extra = (name, make) => extras[name] || (extras[name] = make());
    const hide = name => { if (extras[name]) extras[name].visible = false; };

    function makeHen() {
      const g = new THREE.Group(); root.add(g);
      part(g, G.sphere, M.white, 0.34, 0.3, 0.42, 0, 0.5, 0); part(g, G.sphere, M.white, 0.2, 0.24, 0.16, 0, 0.62, -0.42).rotation.x = 0.5;
      const head = new THREE.Group(); head.position.set(0, 0.84, 0.3); g.add(head);
      part(head, G.sphere, M.white, 0.17, 0.17, 0.17, 0, 0, 0); part(head, G.cone, M.beak, 0.05, 0.14, 0.05, 0, -0.02, 0.2).rotation.x = Math.PI / 2;
      for (let i = 0; i < 3; i++) part(head, G.sphere, M.comb, 0.05, 0.07, 0.05, 0, 0.17, -0.07 + i * 0.07);
      part(head, G.sphere, M.comb, 0.035, 0.07, 0.03, 0, -0.14, 0.13);
      for (const s of [-1, 1]) { part(head, G.sphere, M.ink, 0.025, 0.025, 0.02, s * 0.1, 0.04, 0.12); part(g, G.sphere, M.white, 0.06, 0.2, 0.26, s * 0.32, 0.5, -0.02); }
      const legs = [-1, 1].map(s => { const l = new THREE.Group(); l.position.set(s * 0.12, 0.26, 0); g.add(l); part(l, G.cyl, M.beak, 0.018, 0.26, 0.018, 0, -0.13, 0); part(l, G.box, M.beak, 0.1, 0.02, 0.14, 0, -0.26, 0.04); return l; });
      return { g, head, legs };
    }
    function makeCloud() {
      const g = new THREE.Group(); root.add(g); g.position.y = 2.9;
      for (const [x, y, z, r] of [[0, 0, 0, 0.34], [-0.3, -0.04, 0.02, 0.24], [0.3, -0.03, -0.02, 0.26], [0.1, 0.14, 0, 0.24], [-0.14, 0.1, 0.05, 0.2]]) part(g, G.sphere, M.cloud, r, r * 0.8, r, x, y, z);
      const drops = []; for (let i = 0; i < 9; i++) drops.push(part(g, G.box, M.rain, 0.012, 0.09, 0.012, 0, 0, 0));
      return { g, drops };
    }

    // a: the member as the room keeps it (see room3d.js). o: { T, seat: 'low' | 'high' | 'sofa' | '', seatY, fill, sip, buzz, fx: { name: age }, hen, first: this is oneself seen through one's own eyes }
    function pose(a, o) {
      const T = o.T, fx = o.fx, ph = a.phase, walk = a.walk, seed = a.seed;
      const isHen = o.hen;
      if (isHen && !hen) hen = makeHen();
      if (hen) hen.g.visible = !!isHen;
      P.body.visible = !isHen && !o.first;
      shadow.visible = !o.seat;
      if (isHen) {
        const hop = Math.abs(Math.sin(ph * 1.2)) * 0.07 * walk;
        hen.g.position.y = hop; hen.g.rotation.z = Math.sin(ph * 1.2) * 0.12 * walk;
        hen.head.rotation.x = walk > 0.2 ? Math.sin(ph * 2.4) * 0.3 : Math.max(0, Math.sin(T * 2.2 + seed)) ** 6 * 1.1;
        hen.legs[0].rotation.x = Math.sin(ph * 1.2) * 0.7 * walk; hen.legs[1].rotation.x = -Math.sin(ph * 1.2) * 0.7 * walk;
      }
      // ----- the body -----
      const body = P.body, upper = P.upper, head = P.head;
      let by = 0, lean = 0, twist = 0, sway = Math.sin(T * 1.7 + seed) * 0.035 * Math.min(1, o.buzz / 3), tilt = 0, shake = 0, jump = 0;
      let legA = Math.sin(ph) * 0.75 * walk, legB = -legA, legZ = 0;
      let face = 'calm', headX = Math.sin(T * 0.7 + seed) * 0.03, headY = Math.sin(T * 0.43 + seed * 2) * 0.12 * (1 - walk), headZ = 0;
      // the arms: hanging and swinging, unless something else is said below. [i] = [x rot, z rot] or a place for the hand
      let armR = [-legA * 0.8, -0.1], armL = [legA * 0.8, 0.1], handR = null, handL = null;
      if (o.seat) {
        by = o.seatY - HIP + 0.06; legA = legB = o.seat === 'high' ? -0.95 : -1.3; legZ = 0.12;
        armR = [-0.55, -0.12]; armL = [-0.55, 0.12]; lean = 0.04;
        if (o.seat === 'sofa') { lean = -0.12; armR = [-0.25, -0.3]; armL = [-0.25, 0.3]; }
      }
      by += Math.abs(Math.sin(ph)) * 0.04 * walk;
      // ----- a glass in the right hand -----
      const want = a.drink ? a.drink.k : '';
      if (want !== vesK) { if (ves) hold.remove(ves.g); ves = want ? vessel(want) : null; vesK = want; if (ves) hold.add(ves.g); }
      let glassTilt = 0;
      if (ves) {
        const s = o.sip;
        handR = [-0.34 + 0.3 * s, 0.3 + 0.5 * s, 0.36 + 0.06 * s]; glassTilt = -0.85 * s;
        if (o.seat && !s) handR = [-0.36, 0.32, 0.42];
        headX -= 0.22 * s;
        if (ves.drink) { const k = clamp(o.fill, 0.04, 1); ves.drink.scale.y = ves.kind === 'wine' ? ves.full * (0.3 + 0.7 * k) : ves.kind === 'mug' ? 0.01 : ves.full * k; if (ves.kind !== 'wine' && ves.kind !== 'mug') ves.drink.position.y = ves.base + ves.full * k / 2; }
        if (ves.steam) ves.steam.children.forEach((p, i) => { const u = (T * 0.5 + i / 3) % 1; p.position.set(Math.sin(u * 6 + i) * 0.03, 0.18 + u * 0.22, 0); p.scale.setScalar(0.02 + u * 0.03); });
      }
      // ----- gestures -----
      const e = a.emote, et = o.et;
      if (e === 'wave') { const w = Math.sin(et * 11) * 0.35; if (ves) handL = [0.5 + w * 0.3, 1.22, 0.12]; else handR = [-0.5 - w * 0.3, 1.22, 0.12]; face = 'happy'; headZ = (ves ? -1 : 1) * 0.08; }
      else if (e === 'dance') { const b = et * 7.5; jump = Math.abs(Math.sin(b)) * 0.13; twist = Math.sin(b * 0.5) * 0.5; tilt = Math.sin(b) * 0.1; handL = [0.52, 0.75 + Math.sin(b) * 0.4, 0.22]; if (!ves) handR = [-0.52, 0.75 - Math.sin(b) * 0.4, 0.22]; legA = Math.sin(b) * 0.4; legB = -legA; face = 'happy'; headZ = Math.sin(b) * 0.12; }
      else if (e === 'laugh') { shake = Math.sin(et * 30) * 0.02; lean = -0.14; headX = -0.25; face = 'laugh'; handL = [0.2, 0.3, 0.34]; }
      else if (e === 'cheer') { jump = Math.abs(Math.sin(et * 6.5)) * 0.2; handL = [0.42, 1.3, 0.05]; if (!ves) handR = [-0.42, 1.3, 0.05]; else handR = [-0.4, 1.2, 0.2]; face = 'laugh'; }
      else if (e === 'cry') { lean = 0.22; headX = 0.3; shake = Math.sin(et * 22) * 0.012; handL = [0.14, 0.92, 0.36]; if (!ves) handR = [-0.14, 0.92, 0.36]; face = 'sad'; }
      else if (e === 'sleep') { lean = 0.12; headX = 0.32; headZ = 0.3; headY = 0; face = 'sleep'; by -= 0.02 + Math.sin(et * 1.6) * 0.012; }
      else if (e === 'cheers' && ves) { const k = Math.sin(clamp(et / 2.2, 0, 1) * Math.PI); handR = [-0.3, 0.3 + 0.85 * k, 0.4 + 0.12 * k]; face = 'happy'; }
      // ----- what teasing does -----
      if (fx.banana !== undefined) {                                 // slips, lies on the back, gets up again
        const b = fx.banana, down = b < 0.35 ? b / 0.35 : b < 2.6 ? 1 : Math.max(0, 1 - (b - 2.6) / 0.7);
        tilt = 0; lean = -1.45 * down; by += -0.5 * down + 0.2 * Math.sin(Math.min(1, b / 0.35) * Math.PI); legA = -0.6 * down + legA * (1 - down); legB = -0.3 * down + legB * (1 - down);
        if (down > 0.5) { handR = handL = null; armR = [-2.4, -0.5]; armL = [-2.4, 0.5]; face = 'shock'; }
      }
      if (fx.feather !== undefined) { shake = Math.sin(T * 40) * 0.03; tilt = Math.sin(T * 19) * 0.08; armL = [-2.6 + Math.sin(T * 30) * 0.3, 0.5]; if (!ves) armR = [-2.6 - Math.sin(T * 30) * 0.3, -0.5]; handL = null; face = 'laugh'; }
      if (fx.fart !== undefined) { face = fx.fart < 0.5 ? 'shock' : 'shy'; if (fx.fart < 0.4) jump = Math.sin(fx.fart / 0.4 * Math.PI) * 0.25; }
      if (fx.snow !== undefined) { shake = Math.sin(T * 46) * 0.016; face = fx.snow < 1 ? 'shock' : 'sad'; }
      if (fx.water !== undefined) { face = fx.water < 1.2 ? 'shock' : 'sad'; if (fx.water > 1.2) shake = Math.sin(T * 40) * 0.01; }
      if (fx.tomato !== undefined) face = fx.tomato < 1 ? 'shock' : 'sad';
      if (fx.pie !== undefined) face = 'shock';
      if (fx.cloud !== undefined) face = 'sad';
      if (fx.confetti !== undefined || fx.hug !== undefined) face = 'happy';
      if (a.talk && face === 'calm') face = 'talk';

      body.position.set(shake, by + jump, 0); body.rotation.set(lean, twist, sway + tilt);
      upper.rotation.set(0, 0, 0); upper.position.y = 0.7;
      head.rotation.set(headX, headY, headZ);
      P.legs[0].rotation.set(legA, 0, -legZ); P.legs[1].rotation.set(legB, 0, legZ);
      let kR = 1;
      if (handR) kR = armTo(0, handR[0], handR[1], handR[2]); else armHang(0, armR[0], armR[1]);
      if (handL) armTo(1, handL[0], handL[1], handL[2]); else armHang(1, armL[0], armL[1]);
      if (ves) {                                                     // the glass sits in the right hand, upright whatever the arm does, and tips when one drinks
        const arm = P.arms[0];
        V.copy(DOWN).applyQuaternion(arm.quaternion).multiplyScalar(ARM * kR + 0.04).add(arm.position);
        hold.position.set(V.x + 0.02, V.y - 0.1, V.z + 0.03); hold.rotation.set(glassTilt, 0, 0);
      }
      // ----- the face -----
      const blink = (T + seed) % 3.9 < 0.12, m = P.mouth.scale, open = face === 'talk' ? 1 + Math.abs(Math.sin(T * 13 + seed)) * 2.2 : face === 'laugh' ? 3.2 : face === 'shock' ? 3.6 : face === 'sleep' ? 1.6 : 1;
      m.set(mouth0.x * (face === 'shock' || face === 'sleep' ? 0.45 : face === 'happy' || face === 'laugh' ? 1.35 : face === 'sad' || face === 'shy' ? 0.7 : 1), mouth0.y * open, mouth0.z);
      P.eyes.forEach((ey, i) => ey.scale.y = eye0[i].y * (blink || face === 'sleep' || face === 'laugh' ? 0.15 : face === 'shock' ? 1.4 : face === 'happy' ? 0.6 : 1));

      // ----- things on the figure -----
      if (fx.snow !== undefined) { const s = extra('snow', () => { const g = new THREE.Group(); head.add(g); part(g, G.half, M.snow, 0.46, 0.3, 0.46, 0, 0.12, 0); for (const [x, z] of [[0.2, 0.3], [-0.26, 0.24], [0.02, 0.42]]) part(g, G.sphere, M.snow, 0.09, 0.08, 0.09, x, 0.16, z); return g; }); s.visible = true; s.scale.setScalar(Math.min(1, fx.snow * 6) * Math.min(1, (8 - fx.snow) * 2 + 0.2)); } else hide('snow');
      if (fx.tomato !== undefined) { const s = extra('tomato', () => { const g = new THREE.Group(); head.add(g); part(g, G.sphere, M.tomato, 0.2, 0.17, 0.05, 0.05, 0.02, 0.4); for (const [x, y] of [[-0.1, 0.12], [0.2, -0.08], [0.0, -0.16], [0.16, 0.14]]) part(g, G.sphere, M.tomato, 0.06, 0.07, 0.03, x, y, 0.4); g.userData.drip = part(g, G.sphere, M.tomato, 0.035, 0.09, 0.03, 0.08, -0.1, 0.41); return g; }); s.visible = true; s.userData.drip.position.y = -0.1 - Math.min(0.22, fx.tomato * 0.035); } else hide('tomato');
      if (fx.pie !== undefined) { const s = extra('pie', () => { const g = new THREE.Group(); head.add(g); part(g, G.sphere, M.cream, 0.36, 0.36, 0.09, 0, 0, 0.38); part(g, G.torus, mat(0xd9a05a), 0.33, 0.33, 0.12, 0, 0, 0.36); return g; }); s.visible = true; s.position.y = -Math.max(0, fx.pie - 1.6) * 0.06; s.rotation.z = Math.max(0, fx.pie - 1.6) * 0.03; } else hide('pie');
      if (fx.cloud !== undefined) {
        if (!cloud) cloud = makeCloud();
        cloud.g.visible = true; cloud.g.position.set(0, (isHen ? 1.7 : 2.9 + by) + Math.sin(T * 1.5) * 0.03, 0); cloud.g.scale.setScalar(Math.min(1, fx.cloud * 3));
        cloud.drops.forEach((d, i) => { const u = (T * 1.3 + i * 0.37) % 1; d.position.set(-0.3 + (i * 53 % 37) / 37 * 0.6, -0.2 - u * 0.9, ((i * 17) % 5 - 2) * 0.06); d.visible = u < 0.9; });
      } else if (cloud) cloud.g.visible = false;
    }
    function dispose() { f.dispose(); }
    return { group: root, pose, dispose, parts: P };
  }
  // the glass one sees in one's own hand when looking through one's own eyes
  return { person, vessel, materials: M };
}
