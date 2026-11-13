// SLQ Game Lobby — a player in the shooter: the clubhouse avatar as a figure in three dimensions. Skin, hair,
// beard, clothes, shoes and what was bought in the kiosk all come from the same look as in the clubhouse. On a
// team one wears the team's vest over it; robots are made of steel and carry an antenna.
// The feet are at y = 0 and the figure looks along +z (so its right hand is at -x).
//
// What it carries is the arsenal's model of the weapon (weapons.js), made bigger to fit the figure's big hands.
// A firearm is held with both hands in front of the chest or at the shoulder and follows where the player looks;
// the knife is in the right hand, and a swing of it is a real swing of the arm.
import { LOOK } from '../shared/defs.js';
import { channel } from './viewmodel.js';

const hex = s => parseInt(s.slice(1), 16);
const TEAM_COL = { A: 0xcf4a58, B: 0x4a78cf };
// How a weapon is held. s: how much bigger than life it is [across, along the barrel] (the figures have big heads
// and hands; a long weapon is made thicker rather than longer); at: where its grip is, seen from the middle between
// the shoulders (x: to the figure's left, y: up, z: ahead); turn: how far the body is turned to get both hands on it;
// off: where the left hand holds when the weapon has no place for it (from the right hand, in the weapon's own measure).
const HOLD = {
  knife: { s: [2.4, 2.4], turn: 0 },
  pistol: { s: [2.4, 2.4], at: [0.0, -0.05, 0.42], turn: 0, off: [-0.036, -0.014, 0.004] },
  badgun: { s: [2.2, 2.2], at: [0.0, -0.05, 0.42], turn: 0, off: [-0.036, -0.014, 0.004] },
  sniper: { s: [2.0, 1.55], at: [-0.31, 0.02, 0.3], turn: -0.62 },
  bazooka: { s: [1.7, 1.4], at: [-0.4, 0.03, 0.26], turn: -0.7 },
};
// The knife as the others see it: two swings that take turns. Moments: [seconds, the arm forward (x), the arm
// across the body (z), how the body turns with it].
const ARM_REST = [-0.9, 0.15, 0];
const SWINGS = [
  { dur: 0.42, keys: [[0, ...ARM_REST], [0.1, -2.45, -0.4, -0.4], [0.2, -1.2, 0.85, 0.45], [0.29, -0.55, 1.0, 0.35], [0.42, ...ARM_REST]] },
  { dur: 0.42, keys: [[0, ...ARM_REST], [0.1, -1.5, 1.15, 0.45], [0.2, -1.35, -0.25, -0.4], [0.29, -0.9, -0.55, -0.3], [0.42, ...ARM_REST]] },
];
const ARM = 0.55;      // from the shoulder to the middle of the hand

// The torso's outline from the hips (0) to the shoulders (1), as a share of its half width: a man's is straight, a
// woman's has a waist, a sturdy body a belly.
const OUTLINE = {
  straight: [[0, 1], [1, 1]],
  waist: [[0, 0.97], [0.12, 1], [0.28, 0.97], [0.45, 0.89], [0.58, 0.86], [0.72, 0.9], [0.86, 0.96], [0.95, 0.96], [1, 0.9]],
  belly: [[0, 0.93], [0.1, 1], [0.26, 1.05], [0.44, 1.05], [0.62, 0.99], [0.8, 0.92], [0.94, 0.88], [1, 0.82]],
};
function girth(shape, t) {
  const o = OUTLINE[shape];
  for (let i = 1; i < o.length; i++) if (t <= o[i][0]) return o[i - 1][1] + (o[i][1] - o[i - 1][1]) * (t - o[i - 1][0]) / (o[i][0] - o[i - 1][0]);
  return o[o.length - 1][1];
}

// arsenal: makeArsenal() from weapons.js; without it the figures carry nothing.
export function makeFigures(THREE, arsenal) {
  const turned = o => new THREE.LatheGeometry([new THREE.Vector2(0, -0.5), ...o.map(([t, r]) => new THREE.Vector2(r, t - 0.5)), new THREE.Vector2(0, 0.5)], 16);
  // every shape is made once and shared by all figures
  const G = {
    sphere: new THREE.SphereGeometry(1, 18, 14), half: new THREE.SphereGeometry(1, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2),
    cyl: new THREE.CylinderGeometry(1, 1, 1, 14), cone: new THREE.ConeGeometry(1, 1, 12), box: new THREE.BoxGeometry(1, 1, 1),
    torus: new THREE.TorusGeometry(1, 0.22, 8, 18), ring: new THREE.TorusGeometry(1, 0.1, 6, 18), open: new THREE.CylinderGeometry(1, 1, 1, 16, 1, true),
    // a band of a cone (a poncho is a pile of them), a vest (open in front), a coat (open in front, wider at the hem), a badge
    band: new THREE.CylinderGeometry(0.95, 1, 1, 18), vest: new THREE.CylinderGeometry(1, 1, 1, 16, 1, true, 0.32, Math.PI * 2 - 0.64),
    coat: new THREE.CylinderGeometry(1, 1.22, 1, 16, 1, true, 0.26, Math.PI * 2 - 0.52), star: new THREE.CylinderGeometry(1, 1, 1, 5),
    // bodies with a shape of their own, turned from their outline
    waist: turned(OUTLINE.waist), belly: turned(OUTLINE.belly),
  };
  const mat = (c, rough = 0.8, extra) => new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: rough, metalness: 0 }, extra));
  // one part: a shape, scaled and placed
  function part(parent, geo, m, sx, sy, sz, x, y, z, shadow) {
    const o = new THREE.Mesh(geo, m);
    o.scale.set(sx, sy, sz); o.position.set(x, y, z);
    if (shadow) o.castShadow = true;
    parent.add(o);
    return o;
  }

  function hair(head, style, m) {
    const cap = (s = 1.06, y = 0.04) => part(head, G.half, m, 0.42 * s, 0.42 * s, 0.42 * s, 0, y, -0.02);
    if (style === 'short') cap();
    else if (style === 'spiky') { cap(1.03); for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2, c = part(head, G.cone, m, 0.09, 0.26, 0.09, Math.cos(a) * 0.2, 0.44, Math.sin(a) * 0.2 - 0.02); c.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5); } part(head, G.cone, m, 0.1, 0.3, 0.1, 0, 0.5, 0); }
    else if (style === 'side') { cap(); const s = part(head, G.sphere, m, 0.3, 0.14, 0.2, 0.14, 0.3, 0.3); s.rotation.z = -0.35; }
    else if (style === 'long') { cap(); part(head, G.cyl, m, 0.43, 0.62, 0.3, 0, -0.22, -0.18); }
    else if (style === 'pony') { cap(); part(head, G.sphere, m, 0.13, 0.13, 0.13, 0, 0.14, -0.44); const t = part(head, G.cone, m, 0.11, 0.42, 0.11, 0, -0.1, -0.52); t.rotation.x = Math.PI + 0.25; }
    else if (style === 'curly') { for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2, r = i % 2 ? 0.34 : 0.26; part(head, G.sphere, m, 0.17, 0.17, 0.17, Math.cos(a) * r, i % 2 ? 0.2 : 0.36, Math.sin(a) * r - 0.04); } part(head, G.sphere, m, 0.22, 0.2, 0.22, 0, 0.4, -0.02); }
    else if (style === 'bun') { cap(); part(head, G.sphere, m, 0.17, 0.17, 0.17, 0, 0.5, -0.1); }
    else if (style === 'bob') { cap(1.08); const b = part(head, G.open, m, 0.455, 0.36, 0.455, 0, -0.1, -0.06); b.material = m.clone(); b.material.side = THREE.DoubleSide; }
  }

  function hat(head, id) {
    const y = 0.36;
    if (id === 'party') { part(head, G.cone, mat(0xe2574c), 0.2, 0.5, 0.2, 0, y + 0.28, 0); part(head, G.sphere, mat(0xf2c33f), 0.06, 0.06, 0.06, 0, y + 0.55, 0); }
    else if (id === 'cap') { part(head, G.half, mat(0x3d8fe0), 0.45, 0.4, 0.45, 0, 0.1, 0); part(head, G.cyl, mat(0x2f6fb8), 0.26, 0.03, 0.2, 0, 0.16, 0.44); }
    else if (id === 'beanie') { part(head, G.half, mat(0x8a58d6), 0.455, 0.46, 0.455, 0, 0.08, 0); part(head, G.torus, mat(0x6f43b6), 0.42, 0.42, 0.3, 0, 0.1, 0).rotation.x = Math.PI / 2; part(head, G.sphere, mat(0xf4f1ea), 0.09, 0.09, 0.09, 0, 0.56, 0); }
    else if (id === 'santa') { const c = part(head, G.cone, mat(0xd8343c), 0.4, 0.6, 0.4, 0, y + 0.22, -0.05); c.rotation.x = -0.35; part(head, G.torus, mat(0xf4f1ea), 0.42, 0.42, 0.4, 0, 0.16, 0).rotation.x = Math.PI / 2; part(head, G.sphere, mat(0xf4f1ea), 0.09, 0.09, 0.09, 0, y + 0.44, -0.3); }
    else if (id === 'chef') { part(head, G.cyl, mat(0xf4f1ea), 0.3, 0.3, 0.3, 0, y + 0.1, 0); part(head, G.sphere, mat(0xf4f1ea), 0.38, 0.22, 0.38, 0, y + 0.32, 0); }
    else if (id === 'cowboy') { part(head, G.cyl, mat(0x8b5a2b), 0.72, 0.04, 0.6, 0, y - 0.04, 0); part(head, G.cyl, mat(0x8b5a2b), 0.3, 0.3, 0.3, 0, y + 0.1, 0); part(head, G.torus, mat(0x3a2416), 0.3, 0.3, 0.14, 0, y, 0).rotation.x = Math.PI / 2; }
    else if (id === 'phones') { const b = part(head, G.ring, mat(0x2f333b), 0.46, 0.46, 0.5, 0, 0.02, 0); b.rotation.y = Math.PI / 2; for (const s of [-1, 1]) part(head, G.cyl, mat(0xe2574c), 0.14, 0.08, 0.14, s * 0.43, -0.02, 0).rotation.z = Math.PI / 2; }
    else if (id === 'pirate') { part(head, G.cyl, mat(0x2a2422), 0.62, 0.05, 0.5, 0, y - 0.06, 0); part(head, G.half, mat(0x2a2422), 0.36, 0.34, 0.36, 0, y - 0.06, 0); part(head, G.sphere, mat(0xf4f1ea), 0.08, 0.08, 0.03, 0, y + 0.1, 0.34); }
    else if (id === 'tophat') { part(head, G.cyl, mat(0x2f333b), 0.52, 0.04, 0.52, 0, y - 0.04, 0); part(head, G.cyl, mat(0x2f333b), 0.3, 0.5, 0.3, 0, y + 0.22, 0); part(head, G.torus, mat(0xd8343c), 0.3, 0.3, 0.14, 0, y + 0.02, 0).rotation.x = Math.PI / 2; }
    else if (id === 'viking') { part(head, G.half, mat(0x9aa0a6, 0.4, { metalness: 0.6 }), 0.45, 0.42, 0.45, 0, 0.1, 0); for (const s of [-1, 1]) { const c = part(head, G.cone, mat(0xf4ead0), 0.08, 0.36, 0.08, s * 0.46, 0.4, 0); c.rotation.z = -s * 0.5; } }
    else if (id === 'wizard') { part(head, G.cyl, mat(0x4a5fd0), 0.6, 0.04, 0.6, 0, y - 0.05, 0); const c = part(head, G.cone, mat(0x4a5fd0), 0.34, 0.8, 0.34, 0, y + 0.35, -0.03); c.rotation.x = -0.12; part(head, G.sphere, mat(0xf2c33f), 0.05, 0.05, 0.05, 0.12, y + 0.3, 0.26); }
    else if (id === 'bowler') { part(head, G.cyl, mat(0x1d1a22), 0.56, 0.035, 0.52, 0, y - 0.03, 0); part(head, G.half, mat(0x1d1a22), 0.34, 0.34, 0.34, 0, y - 0.03, 0); part(head, G.torus, mat(0x5a4a3a), 0.33, 0.33, 0.1, 0, y, 0).rotation.x = Math.PI / 2; }
    else if (id === 'gambler') { part(head, G.cyl, mat(0x24222a), 0.7, 0.03, 0.66, 0, y - 0.03, 0); part(head, G.cyl, mat(0x24222a), 0.31, 0.2, 0.31, 0, y + 0.07, 0); part(head, G.torus, mat(0xb8323a), 0.31, 0.31, 0.1, 0, y + 0.01, 0).rotation.x = Math.PI / 2; }
    else if (id === 'halo') part(head, G.ring, mat(0xf2c33f, 0.3, { emissive: 0xd9a020, emissiveIntensity: 0.8 }), 0.3, 0.3, 0.3, 0, 0.66, 0).rotation.x = Math.PI / 2;
    else if (id === 'crown') { const gold = mat(0xf2c33f, 0.3, { metalness: 0.7 }); part(head, G.open, gold, 0.3, 0.16, 0.3, 0, y + 0.06, 0).material.side = THREE.DoubleSide; for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; part(head, G.cone, gold, 0.06, 0.16, 0.06, Math.cos(a) * 0.3, y + 0.2, Math.sin(a) * 0.3); } }
  }

  // A drawn name over the head.
  function nameTag(name, colour) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 64;
    const g = c.getContext('2d');
    g.font = '600 34px Fredoka, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 7; g.lineJoin = 'round'; g.strokeStyle = 'rgba(20,16,30,0.85)'; g.strokeText(name, 128, 34, 240);
    g.fillStyle = colour; g.fillText(name, 128, 34, 240);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    s.scale.set(1.7, 0.425, 1); s.position.y = 2.75;
    return s;
  }

  const DOWN = new THREE.Vector3(0, -1, 0), V = new THREE.Vector3(), ch = [0, 0, 0];

  // look: a clubhouse look. opt: { team: 'A' | 'B' | '', bot, name, tag: colour of the name or '' for none,
  // even: everybody the same height (the shooter: what one can hit is the same for all) }
  function make(look, opt = {}) {
    const L = look || {}, pick = (k) => LOOK[k][L[k]] !== undefined ? LOOK[k][L[k]] : LOOK[k][0];
    const skinC = opt.bot ? 0xc3ccd3 : hex(pick('skin')), topC = hex(pick('topCol')), botC = hex(pick('bottomCol')), shoeC = hex(pick('shoeCol')), hairC = hex(pick('hairCol'));
    const skin = mat(skinC, opt.bot ? 0.42 : 0.8, opt.bot ? { metalness: 0.25 } : null), top = mat(topC), bottom = mat(botC), shoe = mat(shoeC), hairM = mat(hairC, 0.9), ink = mat(0x1d1a22, 0.6);
    const root = new THREE.Group(), body = new THREE.Group();
    root.add(body);
    // the body one chose: a man's or a woman's, slim, ordinary or sturdy, short, middling or tall
    const fem = pick('sex') === 'f' && !opt.bot, build = opt.bot ? 'mid' : pick('build'), tall = opt.even || opt.bot ? 1 : { mid: 1, short: 0.93, tall: 1.07 }[pick('height')];
    const wide = { mid: 1, slim: 0.88, big: 1.2 }[build] * (fem ? 0.95 : 1), deep = { mid: 1, slim: 0.9, big: 1.24 }[build], limb = { mid: 1, slim: 0.9, big: 1.12 }[build] * (fem ? 0.92 : 1);
    body.scale.setScalar(tall);

    // legs (they swing from the hip)
    const legs = [];
    for (const s of [-1, 1]) {
      const leg = new THREE.Group(); leg.position.set(s * 0.15 * wide, 0.75, 0); body.add(leg);
      const style = pick('bottom');
      if (style === 'pants') part(leg, G.cyl, bottom, 0.115 * limb, 0.62, 0.115 * limb, 0, -0.33, 0, true);
      else { part(leg, G.cyl, bottom, 0.125 * limb, 0.26, 0.125 * limb, 0, -0.14, 0, true); part(leg, G.cyl, skin, 0.1 * limb, 0.38, 0.1 * limb, 0, -0.45, 0); }
      // what is on the feet: one's own shoes, or something from the clothes shop
      if (L.feet === 'boots' || L.feet === 'spurs') {
        const hide = mat(0x6b3d1e, 0.6);
        part(leg, G.box, hide, 0.2, 0.14, 0.34, 0, -0.685, 0.06); part(leg, G.cyl, hide, 0.13 * limb, 0.3, 0.13 * limb, 0, -0.5, 0); part(leg, G.box, mat(0x3a2110), 0.17, 0.07, 0.09, 0, -0.74, -0.07);
        if (L.feet === 'spurs') { part(leg, G.torus, mat(0xd9b24a, 0.3, { metalness: 0.7 }), 0.1, 0.1, 0.05, 0, -0.66, -0.06).rotation.x = Math.PI / 2; part(leg, G.star, mat(0xd9b24a, 0.3, { metalness: 0.7 }), 0.05, 0.012, 0.05, 0, -0.66, -0.19).rotation.z = Math.PI / 2; }
      } else if (L.feet === 'sneakers') {
        part(leg, G.box, mat(0xf4f1ea), 0.2, 0.12, 0.32, 0, -0.685, 0.05); part(leg, G.box, mat(0xd8343c), 0.205, 0.035, 0.2, 0, -0.67, 0.02); part(leg, G.box, mat(0xfafafa, 0.5), 0.21, 0.04, 0.34, 0, -0.74, 0.05);
      } else part(leg, G.box, shoe, 0.2, 0.13, 0.32, 0, -0.69, 0.05);
      legs.push(leg);
    }
    if (pick('bottom') === 'skirt') part(body, G.cone, bottom, 0.42 * wide, 0.42, 0.42 * deep, 0, 0.72, 0, true);

    // the upper body leans with the aim
    const upper = new THREE.Group(); upper.position.y = 0.7; body.add(upper);
    const TW = 0.33 * wide, TD = 0.3 * deep;                       // half the torso's width and depth
    // a man's body is straight; a woman's narrows to the waist and widens again; a sturdy one has a belly
    const shape = build === 'big' ? 'belly' : fem ? 'waist' : 'straight', TZ = shape === 'belly' ? 0.025 : 0;
    const torso = part(upper, shape === 'belly' ? G.belly : shape === 'waist' ? G.waist : G.cyl, top, TW, 0.68, TD, 0, 0.34, TZ, true);
    const rim = y => girth(shape, y / 0.68), front = y => TZ + TD * rim(y);      // the body's girth and its front at a height above the hips
    const style = pick('top');
    if (style === 'hoodie') { part(upper, G.sphere, top, 0.26, 0.2, 0.2, 0, 0.7, -0.2 * deep); part(upper, G.box, mat(topC, 0.9), 0.3, 0.14, 0.04, 0, 0.2, front(0.2) - 0.012); }
    else if (style === 'shirt') {
      const white = mat(0xf4f1ea);
      for (let i = 0; i < 4; i++) part(upper, G.box, white, 0.05, 0.15, 0.02, 0, 0.11 + i * 0.15, front(0.11 + i * 0.15) - 0.004);
      for (let i = 0; i < 3; i++) part(upper, G.sphere, ink, 0.022, 0.022, 0.022, 0, 0.2 + i * 0.16, front(0.2 + i * 0.16) + 0.008);
    }
    else if (style === 'stripes') for (let i = 0; i < 3; i++) { const y = 0.16 + i * 0.18, o = part(upper, G.ring, mat(0xf4f1ea), TW * rim(y) * 0.95, TD * rim(y) * 0.95, 0.34, 0, y, TZ); o.rotation.x = Math.PI / 2; }
    // from the clothes shop, worn over it: vests, a poncho, jackets, a long coat
    const OVER = { vest: [0x7a4a24, 0], sheriff: [0x24222a, 0], leather: [0x4a2c18, 1], duster: [0xb8a078, 1], tux: [0x1d1a22, 1] }[L.over];
    let sleeveM = null;
    if (OVER) {
      const om = mat(OVER[0], 0.75, { side: THREE.DoubleSide }), long = L.over === 'duster', wideO = shape === 'belly' ? 1.06 : 1;
      const OW = TW * wideO + 0.045, OD = TD * wideO + 0.045, onIt = x => TZ + OD * Math.sqrt(Math.max(0, 1 - (x / OW) ** 2));      // the cloth's front, x from the middle
      part(upper, long ? G.coat : G.vest, om, OW, long ? 1.0 : L.over === 'leather' || L.over === 'tux' ? 0.6 : 0.52, OD, 0, long ? 0.16 : L.over === 'leather' || L.over === 'tux' ? 0.38 : 0.42, TZ, true);
      for (const sd of [-1, 1]) part(upper, G.box, om, 0.12, 0.05, TD * 1.5, sd * TW * 0.62, 0.67, 0);                    // over the shoulders
      if (OVER[1]) sleeveM = om;
      if (L.over === 'sheriff') { const x = 0.2 * wide, star = part(upper, G.star, mat(0xf2c33f, 0.3, { metalness: 0.7 }), 0.07, 0.015, 0.07, x, 0.5, onIt(x) + 0.008); star.rotation.order = 'YXZ'; star.rotation.set(Math.PI / 2, Math.atan2(x / OW, onIt(x) / OD) * 0.8, 0); }
      if (L.over === 'tux') { for (let i = 0; i < 3; i++) part(upper, G.box, mat(0xf8f6f0), 0.16, 0.17, 0.02, 0, 0.23 + i * 0.17, front(0.23 + i * 0.17) + 0.004); for (const sd of [-1, 1]) part(upper, G.cone, mat(0x1d1a22), 0.06, 0.12, 0.035, sd * 0.06, 0.62, front(0.62) + 0.03).rotation.z = sd * Math.PI / 2; }
      if (L.over === 'leather') for (const sd of [-1, 1]) part(upper, G.box, mat(0x2e1a0e), 0.035, 0.5, 0.02, sd * 0.1, 0.4, onIt(0.1) + 0.004);
    } else if (L.over === 'poncho') {
      // from the shoulders out to the hem: a pile of bands, each a little narrower than the one below (the cloth with
      // its woven stripes), and a yoke over the shoulders up to the neck
      const R = TW + 0.34, D = TD + 0.3, n = 6, H = 0.66 / (1 - 0.95 ** n), base = mat(0xc8642a, 0.9), cols = [base, mat(0xf2c33f, 0.9), base, mat(0x2f6fb8, 0.9), mat(0xf4f1ea, 0.9), base];
      let y = -0.04, k = 1;
      for (const m of cols) { const hh = 0.05 * k * H; part(upper, G.band, m, R * k, hh, D * k, 0, y + hh / 2, TZ, true); y += hh; k *= 0.95; }
      part(upper, G.cone, base, R * k, 0.2, D * k, 0, y + 0.1, TZ);
    }
    // on a team: the team's vest
    let vest = null;
    if (opt.team && TEAM_COL[opt.team]) {
      const k = shape === 'belly' ? 1.06 : 1;
      vest = part(upper, G.open, mat(TEAM_COL[opt.team], 0.6, { emissive: TEAM_COL[opt.team], emissiveIntensity: 0.25, side: THREE.DoubleSide }), TW * k + 0.06, 0.46, TD * k + 0.06, 0, 0.4, TZ);
      for (const s of [-1, 1]) part(upper, G.box, vest.material, 0.1, 0.06, TD, s * TW * 0.6, 0.66, 0);
    }
    // arms (they turn at the shoulder; the hand is at the end). arms[0] is the right one.
    const arms = [], hands = [];
    for (const s of [-1, 1]) {
      const arm = new THREE.Group(); arm.position.set(s * (TW * rim(0.6) + 0.08), 0.6, 0); upper.add(arm);
      const sleeve = sleeveM ? 0.5 : style === 'tee' || style === 'stripes' ? 0.24 : 0.5;
      part(arm, G.cyl, sleeveM || top, (sleeveM ? 0.102 : 0.092) * limb, sleeve, (sleeveM ? 0.102 : 0.092) * limb, 0, -sleeve / 2, 0, true);
      if (sleeve < 0.5) part(arm, G.cyl, skin, 0.078 * limb, 0.5 - sleeve, 0.078 * limb, 0, -sleeve - (0.5 - sleeve) / 2, 0);
      hands.push(part(arm, G.sphere, skin, 0.1, 0.1, 0.1, 0, -ARM, 0));
      arms.push(arm);
    }
    // what is held with both hands hangs in `aim`, which follows where one looks; the knife sits in the right hand:
    // its point ahead and a little up when the arm is half raised, the edge down
    const aim = new THREE.Group(); aim.position.set(0, 0.6, 0); aim.rotation.order = 'YXZ'; upper.add(aim);
    const gunHold = new THREE.Group(); gunHold.rotation.y = Math.PI; aim.add(gunHold);         // the arsenal's weapons point along -z
    const knifeHold = new THREE.Group(); arms[0].add(knifeHold);
    knifeHold.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0.866, 0.5), new THREE.Vector3(0, 0.5, -0.866)));

    // head
    const head = new THREE.Group(); head.position.y = 1.08; head.rotation.order = 'YXZ'; upper.add(head);
    const skull = part(head, G.sphere, skin, 0.42, 0.42, 0.42, 0, 0, 0, true);
    const eyes = pick('eyes'), eyeM = opt.bot ? mat(0x7fe8ff, 0.3, { emissive: 0x39c8f0, emissiveIntensity: 1.2 }) : ink;
    const eyeParts = [];
    for (const s of [-1, 1]) {
      if (eyes === 'round' && !opt.bot) part(head, G.sphere, mat(0xffffff, 0.5), 0.085, 0.085, 0.04, s * 0.15, 0.06, 0.375);
      const e = part(head, G.sphere, eyeM, 0.05, eyes === 'happy' || eyes === 'sleepy' ? 0.022 : 0.05, 0.03, s * 0.15, eyes === 'sleepy' ? 0.03 : 0.06, 0.395);
      if (eyes === 'happy') e.rotation.z = s * 0.25;
      eyeParts.push(e);
    }
    const mouth = part(head, G.box, ink, 0.13, 0.028, 0.03, 0, -0.13, 0.39);
    if (fem) for (const s of [-1, 1]) part(head, G.box, ink, 0.07, 0.016, 0.012, s * 0.2, 0.125, 0.372).rotation.z = s * 0.55;      // lashes
    if (!opt.bot) {
      hair(head, pick('hair'), hairM);
      const beard = pick('beard');
      if (beard === 'mustache') part(head, G.box, hairM, 0.2, 0.05, 0.05, 0, -0.07, 0.4);
      else if (beard === 'full') { const b = part(head, G.half, hairM, 0.43, 0.36, 0.43, 0, -0.06, 0.02); b.rotation.x = Math.PI; }
      else if (beard === 'stubble') { const b = part(head, G.half, mat(hairC, 0.9, { transparent: true, opacity: 0.35 }), 0.425, 0.3, 0.425, 0, -0.08, 0.012); b.rotation.x = Math.PI; }
    } else {
      part(head, G.cyl, mat(0x6b7480, 0.4, { metalness: 0.7 }), 0.018, 0.34, 0.018, 0.12, 0.56, 0);
      part(head, G.sphere, mat(0xff5a4a, 0.4, { emissive: 0xff3020, emissiveIntensity: 1 }), 0.055, 0.055, 0.055, 0.12, 0.75, 0);
      for (const s of [-1, 1]) part(head, G.cyl, mat(0x6b7480, 0.4, { metalness: 0.7 }), 0.08, 0.06, 0.08, s * 0.42, 0, 0).rotation.z = Math.PI / 2;
    }
    if (L.hat) hat(head, L.hat);
    if (L.glasses === 'round') for (const s of [-1, 1]) part(head, G.ring, ink, 0.1, 0.1, 0.1, s * 0.15, 0.06, 0.4);
    else if (L.glasses === 'shades') part(head, G.box, ink, 0.5, 0.11, 0.05, 0, 0.07, 0.39);
    else if (L.glasses === 'patch') { part(head, G.sphere, ink, 0.1, 0.1, 0.03, 0.15, 0.06, 0.4); part(head, G.torus, ink, 0.425, 0.425, 0.08, 0, 0.1, 0).rotation.set(Math.PI / 2, 0.25, 0); }
    else if (L.glasses === 'monocle') part(head, G.ring, mat(0xf2c33f, 0.3, { metalness: 0.7 }), 0.11, 0.11, 0.11, 0.15, 0.06, 0.4);
    if (L.neck === 'scarf') part(upper, G.torus, mat(0xd8343c), 0.26, 0.26, 0.5, 0, 0.7, 0).rotation.x = Math.PI / 2;
    else if (L.neck === 'bowtie') for (const s of [-1, 1]) part(upper, G.cone, mat(0xd8343c), 0.07, 0.14, 0.04, s * 0.07, 0.62, Math.max(0.3, front(0.62) + 0.02)).rotation.z = s * Math.PI / 2;
    else if (L.neck === 'bandana') { part(upper, G.torus, mat(0xc8323c), 0.24, 0.24, 0.3, 0, 0.7, 0).rotation.x = Math.PI / 2; part(upper, G.cone, mat(0xc8323c), 0.2, 0.24, 0.05, 0, 0.58, front(0.58) + 0.02).rotation.x = Math.PI; }
    else if (L.neck === 'bolo') { for (const s of [-1, 1]) part(upper, G.cyl, ink, 0.012, 0.3, 0.012, s * 0.035, 0.5, front(0.5) + 0.02).rotation.z = s * 0.1; part(upper, G.sphere, mat(0x2fb8a8, 0.3), 0.045, 0.055, 0.02, 0, 0.64, front(0.62) + 0.03); }
    else if (L.neck === 'chain') part(upper, G.ring, mat(0xf2c33f, 0.3, { metalness: 0.8 }), 0.24, 0.3, 0.24, 0, 0.56, 0.06).rotation.x = Math.PI / 2 - 0.5;
    if (L.back === 'pack') part(upper, G.box, mat(0x58b85f), 0.4, 0.46, 0.2, 0, 0.36, -0.08 - TD, true);
    else if (L.back === 'cape') { const c = part(upper, G.box, mat(0xa3262d, 0.9, { side: THREE.DoubleSide }), 0.62, 0.9, 0.03, 0, 0.14, -0.06 - TD); c.rotation.x = 0.16; }
    else if (L.back === 'wings') for (const s of [-1, 1]) { const w = part(upper, G.sphere, mat(0xf8f6f0, 0.9), 0.3, 0.42, 0.05, s * 0.34, 0.5, -0.34); w.rotation.set(0, s * 0.5, s * 0.5); }

    const tag = opt.tag ? nameTag(opt.name || '', opt.tag) : null;
    if (tag) root.add(tag);

    // ---- moving ----
    // parts: the pieces that move, for whoever poses the figure themselves (the clubhouse does; the shooter uses update)
    const f = { group: root, weaponId: '', walk: 0, flashT: 0, shootT: 0, deadT: -1, tag, tall, parts: { body, upper, head, legs, arms, hands, torso, skull, mouth, eyes: eyeParts } };
    let held = null, hold = HOLD.knife, swingT = -1, swingKind = 0, swingNo = 0, twist = 0, loadK = 0, loadT = 0;
    f.setWeapon = id => {
      if (id === f.weaponId) return;
      f.weaponId = id; hold = HOLD[id] || HOLD.pistol; swingT = -1;
      if (held) held.group.parent.remove(held.group);
      held = arsenal ? arsenal.build(id, { shadow: true }) : null;
      if (!held) return;
      held.group.scale.set(hold.s[0], hold.s[0], hold.s[1]);
      if (id === 'knife') { knifeHold.add(held.group); const a = held.def.hand; knifeHold.position.set(0, -ARM, 0).addScaledVector(V.set(0, 0.5, -0.866), -a[2] * hold.s[1]); }
      else { gunHold.add(held.group); gunHold.position.set(hold.at[0], hold.at[1], hold.at[2]); }
    };
    f.flash = () => { f.flashT = 0.18; };
    // a shot, or a swing of the knife
    f.shoot = () => { f.shootT = 0.15; if (f.weaponId === 'knife') { swingT = 0; swingKind = swingNo++ % 2; } };
    // where the muzzle (or the knife's point) is in the world; false when nothing is carried
    f.muzzle = out => { if (!held) return false; held.group.updateWorldMatrix(true, false); const m = held.def.muzzle; out.set(m[0], m[1], m[2]).applyMatrix4(held.group.matrixWorld); return true; };
    // A hand goes to a place on the weapon (in the weapon's own measure): the arm points there, and gives a little.
    function reach(i, x, y, z) {
      const arm = arms[i], s = hold.s;
      V.set(gunHold.position.x - x * s[0], gunHold.position.y + y * s[0], gunHold.position.z - z * s[1]).applyEuler(aim.rotation).add(aim.position).sub(arm.position);
      const len = V.length(), k = Math.max(0.72, Math.min(1.32, len / ARM));
      arm.quaternion.setFromUnitVectors(DOWN, V.divideScalar(len || 1));
      arm.scale.y = k; hands[i].scale.y = 0.1 / k;
    }
    f.die = () => { if (f.deadT < 0) f.deadT = 0; };
    f.alive = () => { f.deadT = -1; body.rotation.x = 0; body.position.y = 0; root.visible = true; };
    // speed: metres a second over the ground; pitch: where they look; air: off the ground; loading: a magazine is being changed
    f.update = (dt, speed, pitch, air, loading) => {
      if (f.flashT > 0) { f.flashT -= dt; const e = Math.max(0, f.flashT / 0.18) * 0.9; torso.material.emissive.setRGB(e, 0, 0); skull.material.emissive.setRGB(e * 0.7, 0, 0); }
      if (f.deadT >= 0) {
        f.deadT += dt;
        const k = Math.min(1, f.deadT / 0.35);
        body.rotation.x = -k * 1.45; body.position.y = k * 0.22;
        if (tag) tag.visible = false;
        if (f.deadT > 2.6) root.visible = false;
        return;
      }
      if (tag) tag.visible = true;
      f.walk += dt * Math.min(12, speed * 1.9);
      const amp = air ? 0.5 : Math.min(0.85, speed * 0.13), sw = Math.sin(f.walk) * amp;
      legs[0].rotation.x = air ? -0.5 : sw; legs[1].rotation.x = air ? 0.35 : -sw;
      const knife = f.weaponId === 'knife' || !held;
      const kick = f.shootT > 0 ? (f.shootT / 0.15) : 0;
      let turn = hold.turn;
      if (knife) {
        // the right arm holds the knife ahead, or swings it; the left one swings with the walk
        let ax = ARM_REST[0] - pitch * 0.5, az = ARM_REST[1];
        if (swingT >= 0) {
          const S = SWINGS[swingKind];
          swingT += dt;
          channel(S.keys, Math.min(S.dur, swingT), ch);
          ax = ch[0] - pitch * 0.6; az = ch[1]; turn = ch[2];
          if (swingT >= S.dur) swingT = -1;
        }
        twist += (turn - twist) * Math.min(1, dt * 22);
        for (const i of [0, 1]) { arms[i].scale.y = 1; hands[i].scale.y = 0.1; }
        arms[0].rotation.set(ax, 0, az); arms[1].rotation.set(sw * 0.8, 0, 0);
        loadK = 0;
      } else {
        // both hands on the weapon: it follows the eyes, kicks when it fires, and is tipped down while it is loaded
        twist += (turn - twist) * Math.min(1, dt * 10);
        loadK += ((loading ? 1 : 0) - loadK) * Math.min(1, dt * 9); loadT = loading ? loadT + dt : 0;
        const d = held.def, h = d.hand;
        aim.rotation.set(-pitch * 0.85 - kick * 0.2 + loadK * 0.5, -twist, loadK * 0.3);
        gunHold.position.set(hold.at[0], hold.at[1], hold.at[2] - kick * 0.07);
        reach(0, h[0], h[1], h[2]);
        // the left hand: where the weapon is supported, or beside the right one; while loading it works the magazine
        const sup = d.support || [h[0] + hold.off[0], h[1] + hold.off[1], h[2] + hold.off[2]];
        let lx = sup[0], ly = sup[1], lz = sup[2];
        if (loadK > 0.01 && d.magHand) {
          const pv = d.pivots.rocket || [0, 0, 0], out = d.pivots.rocket ? [0, -0.04, -0.26] : d.magOut || [0, -0.15, 0], k = 0.5 + 0.5 * Math.cos(loadT * 7);
          lx += (pv[0] + d.magHand[0] + out[0] * k - lx) * loadK; ly += (pv[1] + d.magHand[1] + out[1] * k - ly) * loadK; lz += (pv[2] + d.magHand[2] + out[2] * k - lz) * loadK;
        }
        reach(1, lx, ly, lz);
      }
      head.rotation.set(-pitch * 0.6, -twist, 0);
      upper.rotation.set(-pitch * 0.15 + (speed > 7 ? 0.12 : 0), twist, 0);
      upper.position.y = 0.7 + (air ? 0 : Math.abs(Math.sin(f.walk)) * amp * 0.05);
      if (f.shootT > 0) f.shootT -= dt;
    };
    // the weapon's shapes and materials belong to the arsenal: they are taken off before the figure's own are freed
    f.dispose = () => { if (held) { held.group.parent.remove(held.group); held = null; } root.traverse(o => { if (o.isSprite) { o.material.map.dispose(); o.material.dispose(); } else if (o.isMesh) o.material.dispose(); }); };
    f.setWeapon('knife');
    return f;
  }
  return { make };
}
