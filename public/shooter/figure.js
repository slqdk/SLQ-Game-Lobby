// SLQ Game Lobby — a player in the shooter: the clubhouse avatar as a figure in three dimensions. Skin, hair,
// beard, clothes, shoes and what was bought in the kiosk all come from the same look as in the clubhouse. On a
// team one wears the team's vest over it; robots are made of steel and carry an antenna.
// The feet are at y = 0 and the figure looks along +z.
import { LOOK } from '../shared/defs.js';

const hex = s => parseInt(s.slice(1), 16);
const TEAM_COL = { A: 0xcf4a58, B: 0x4a78cf };

export function makeFigures(THREE) {
  // every shape is made once and shared by all figures
  const G = {
    sphere: new THREE.SphereGeometry(1, 18, 14), half: new THREE.SphereGeometry(1, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2),
    cyl: new THREE.CylinderGeometry(1, 1, 1, 14), cone: new THREE.ConeGeometry(1, 1, 12), box: new THREE.BoxGeometry(1, 1, 1),
    torus: new THREE.TorusGeometry(1, 0.22, 8, 18), ring: new THREE.TorusGeometry(1, 0.1, 6, 18), open: new THREE.CylinderGeometry(1, 1, 1, 16, 1, true),
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

  // Simple weapons for the hand of somebody else (the long axis is +z, the grip at the origin).
  function buildWeapon(g, id) {
    while (g.children.length) g.remove(g.children[0]);
    const dark = mat(0x2a2c30, 0.6);
    const box = (w, hh, d, x, y, z, m) => part(g, G.box, m || dark, w, hh, d, x, y, z);
    const cyl = (r, len, x, y, z, m) => { part(g, G.cyl, m || dark, r, len, r, x, y, z).rotation.x = Math.PI / 2; };
    if (id === 'knife') box(0.05, 0.09, 0.5, 0, 0, 0.3, mat(0xd0d4d8, 0.3, { metalness: 0.6 }));
    else if (id === 'pistol') { box(0.09, 0.15, 0.26, 0, 0, 0.08); cyl(0.03, 0.22, 0, 0.03, 0.26); }
    else if (id === 'sniper') { cyl(0.035, 1.0, 0, 0.02, 0.45); box(0.1, 0.13, 0.34, 0, -0.03, 0.06); box(0.07, 0.1, 0.2, 0, 0.13, 0.34); }
    else if (id === 'bazooka') { cyl(0.12, 1.0, 0, 0, 0.45, mat(0x3f5a2a, 0.75)); cyl(0.14, 0.12, 0, 0, 0.06); }
    else { box(0.1, 0.14, 0.32, 0, 0, 0.12); cyl(0.028, 0.26, 0, 0.02, 0.34); }
  }

  // look: a clubhouse look. opt: { team: 'A' | 'B' | '', bot, name, tag: colour of the name or '' for none }
  function make(look, opt = {}) {
    const L = look || {}, pick = (k) => LOOK[k][L[k]] !== undefined ? LOOK[k][L[k]] : LOOK[k][0];
    const skinC = opt.bot ? 0xaab4bd : hex(pick('skin')), topC = hex(pick('topCol')), botC = hex(pick('bottomCol')), shoeC = hex(pick('shoeCol')), hairC = hex(pick('hairCol'));
    const skin = mat(skinC, opt.bot ? 0.35 : 0.8, opt.bot ? { metalness: 0.7 } : null), top = mat(topC), bottom = mat(botC), shoe = mat(shoeC), hairM = mat(hairC, 0.9), ink = mat(0x1d1a22, 0.6);
    const root = new THREE.Group(), body = new THREE.Group();
    root.add(body);

    // legs (they swing from the hip)
    const legs = [];
    for (const s of [-1, 1]) {
      const leg = new THREE.Group(); leg.position.set(s * 0.15, 0.75, 0); body.add(leg);
      const style = pick('bottom');
      if (style === 'pants') part(leg, G.cyl, bottom, 0.115, 0.62, 0.115, 0, -0.33, 0, true);
      else { part(leg, G.cyl, bottom, 0.125, 0.26, 0.125, 0, -0.14, 0, true); part(leg, G.cyl, skin, 0.1, 0.38, 0.1, 0, -0.45, 0); }
      part(leg, G.box, shoe, 0.2, 0.13, 0.32, 0, -0.69, 0.05);
      legs.push(leg);
    }
    if (pick('bottom') === 'skirt') part(body, G.cone, bottom, 0.42, 0.42, 0.42, 0, 0.72, 0, true);

    // the upper body leans with the aim
    const upper = new THREE.Group(); upper.position.y = 0.7; body.add(upper);
    const torso = part(upper, G.cyl, top, 0.33, 0.68, 0.3, 0, 0.34, 0, true);
    const style = pick('top');
    if (style === 'hoodie') { part(upper, G.sphere, top, 0.26, 0.2, 0.2, 0, 0.7, -0.2); part(upper, G.box, mat(topC, 0.9), 0.3, 0.14, 0.04, 0, 0.2, 0.29); }
    else if (style === 'shirt') { part(upper, G.box, mat(0xf4f1ea), 0.05, 0.56, 0.02, 0, 0.36, 0.3); for (let i = 0; i < 3; i++) part(upper, G.sphere, ink, 0.022, 0.022, 0.022, 0, 0.2 + i * 0.16, 0.315); }
    else if (style === 'stripes') for (let i = 0; i < 3; i++) part(upper, G.torus, mat(0xf4f1ea), 0.305, 0.28, 0.16, 0, 0.16 + i * 0.18, 0).rotation.x = Math.PI / 2;
    // on a team: the team's vest
    let vest = null;
    if (opt.team && TEAM_COL[opt.team]) {
      vest = part(upper, G.open, mat(TEAM_COL[opt.team], 0.6, { emissive: TEAM_COL[opt.team], emissiveIntensity: 0.25, side: THREE.DoubleSide }), 0.365, 0.46, 0.335, 0, 0.4, 0);
      for (const s of [-1, 1]) part(upper, G.box, vest.material, 0.1, 0.06, 0.3, s * 0.2, 0.66, 0);
    }
    // arms (they turn at the shoulder; the hand is at the end)
    const arms = [];
    for (const s of [-1, 1]) {
      const arm = new THREE.Group(); arm.position.set(s * 0.41, 0.6, 0); upper.add(arm);
      const sleeve = style === 'tee' || style === 'stripes' ? 0.24 : 0.5;
      part(arm, G.cyl, top, 0.092, sleeve, 0.092, 0, -sleeve / 2, 0, true);
      if (sleeve < 0.5) part(arm, G.cyl, skin, 0.078, 0.5 - sleeve, 0.078, 0, -sleeve - (0.5 - sleeve) / 2, 0);
      part(arm, G.sphere, skin, 0.1, 0.1, 0.1, 0, -0.55, 0);
      arms.push(arm);
    }
    const weapon = new THREE.Group(); weapon.position.set(0, -0.58, 0.04); weapon.rotation.x = Math.PI / 2; arms[1].add(weapon);

    // head
    const head = new THREE.Group(); head.position.y = 1.08; upper.add(head);
    const skull = part(head, G.sphere, skin, 0.42, 0.42, 0.42, 0, 0, 0, true);
    const eyes = pick('eyes'), eyeM = opt.bot ? mat(0x7fe8ff, 0.3, { emissive: 0x39c8f0, emissiveIntensity: 1.2 }) : ink;
    for (const s of [-1, 1]) {
      if (eyes === 'round' && !opt.bot) part(head, G.sphere, mat(0xffffff, 0.5), 0.085, 0.085, 0.04, s * 0.15, 0.06, 0.375);
      const e = part(head, G.sphere, eyeM, 0.05, eyes === 'happy' || eyes === 'sleepy' ? 0.022 : 0.05, 0.03, s * 0.15, eyes === 'sleepy' ? 0.03 : 0.06, 0.395);
      if (eyes === 'happy') e.rotation.z = s * 0.25;
    }
    part(head, G.box, ink, 0.13, 0.028, 0.03, 0, -0.13, 0.39);
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
    else if (L.neck === 'bowtie') for (const s of [-1, 1]) part(upper, G.cone, mat(0xd8343c), 0.07, 0.14, 0.04, s * 0.07, 0.62, 0.3).rotation.z = s * Math.PI / 2;
    else if (L.neck === 'chain') part(upper, G.ring, mat(0xf2c33f, 0.3, { metalness: 0.8 }), 0.24, 0.3, 0.24, 0, 0.56, 0.06).rotation.x = Math.PI / 2 - 0.5;
    if (L.back === 'pack') part(upper, G.box, mat(0x58b85f), 0.4, 0.46, 0.2, 0, 0.36, -0.38, true);
    else if (L.back === 'cape') { const c = part(upper, G.box, mat(0xa3262d, 0.9, { side: THREE.DoubleSide }), 0.62, 0.9, 0.03, 0, 0.14, -0.36); c.rotation.x = 0.16; }
    else if (L.back === 'wings') for (const s of [-1, 1]) { const w = part(upper, G.sphere, mat(0xf8f6f0, 0.9), 0.3, 0.42, 0.05, s * 0.34, 0.5, -0.34); w.rotation.set(0, s * 0.5, s * 0.5); }

    const tag = opt.tag ? nameTag(opt.name || '', opt.tag) : null;
    if (tag) root.add(tag);

    // ---- moving ----
    const f = { group: root, weaponId: '', walk: 0, flashT: 0, shootT: 0, deadT: -1, tag };
    f.setWeapon = id => { if (id !== f.weaponId) { f.weaponId = id; buildWeapon(weapon, id); } };
    f.flash = () => { f.flashT = 0.18; };
    f.shoot = () => { f.shootT = 0.15; };
    f.die = () => { if (f.deadT < 0) f.deadT = 0; };
    f.alive = () => { f.deadT = -1; body.rotation.x = 0; body.position.y = 0; root.visible = true; };
    // speed: metres a second over the ground; pitch: where they look; air: off the ground
    f.update = (dt, speed, pitch, air) => {
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
      const knife = f.weaponId === 'knife';
      const kick = f.shootT > 0 ? (f.shootT / 0.15) : 0;
      arms[1].rotation.x = knife ? -1.0 - kick * 1.1 : -Math.PI / 2 - pitch + kick * 0.35;
      arms[0].rotation.x = knife ? -sw * 0.8 : -1.15 - pitch * 0.7;
      arms[0].rotation.z = knife ? 0 : -0.45;
      head.rotation.x = -pitch * 0.6;
      upper.rotation.x = -pitch * 0.15 + (speed > 7 ? 0.12 : 0);
      upper.position.y = 0.7 + (air ? 0 : Math.abs(Math.sin(f.walk)) * amp * 0.05);
      if (f.shootT > 0) f.shootT -= dt;
    };
    f.dispose = () => { root.traverse(o => { if (o.isSprite) { o.material.map.dispose(); o.material.dispose(); } else if (o.isMesh) o.material.dispose(); }); };
    f.setWeapon('knife');
    return f;
  }
  return { make };
}
