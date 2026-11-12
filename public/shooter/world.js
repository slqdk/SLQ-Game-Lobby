// SLQ Game Lobby — the shooter's arena: every wall, floor and stair, the train, and the rules for walking on them.
// The browser builds it with three.js and gets the picture as well; the server builds it with a stand-in for
// three.js (nullThree) and gets only the numbers. Both walk on exactly the same geometry.
//
// Most of this file is the arena of the stand-alone shooter, moved here unchanged (Danish comments and all).
// The round towers and their stairs took many attempts to get right: leave the geometry and the movement
// functions (groundUnder, pushOut, moveHoriz and the order of things in stepPlayer) as they are, and run
// `npm test` after any change: it walks every staircase up and down.
import { mulberry32 } from '../shared/util.js';

export const EYE = 1.7, RAD = 0.35, STEP = 0.55;
export const WALK = 6.0, SPRINT = 9.5, JUMP = 7.2, GRAV = -22.0;
export const ARENA_W = 85, ARENA_D = 110;           // X ∈ [-42.5,42.5], Z ∈ [-55,55]
const WALL_H = 4.0, WALL_T = 0.4, WIN_SILL = 1.1, DOOR_W = 3.0, COVER_H = 1.5;

// A stand-in for three.js where nothing is drawn: whatever is asked of it, it answers with itself.
export function nullThree() {
  const f = function () {};
  const p = new Proxy(f, {
    get: (t, k) => k === 'isNull' ? true : k === 'length' ? 0 : k === Symbol.toPrimitive ? () => 0 : p,
    set: () => true, apply: () => p, construct: () => p,
  });
  return p;
}

// THREE: three.js or nullThree(). scene: where the meshes go. texLib: makeTextures(THREE) from tex.js (or nullThree()).
export function buildWorld(THREE, scene, texLib) {
  const HEADLESS = !!THREE.isNull, TEX = texLib.TEX, makeTex = texLib.makeTex, tint = texLib.tint;
  const rnd = mulberry32(85110);          // the same greenery for everybody

  const COL = {
    floor: 0x363d45, floorLow: 0x2a2f37, red: 0x7e2e2e, blue: 0x294676, mid: 0x6f671f,
    wall: 0x939aa2, wallLow: 0x767c85, win: 0xa7adb5, roof: 0x4f555d, ramp: 0xa5854f, crate: 0x8f7140,
    dummy: 0xcf4a58, dummyHead: 0xe07a84,
    pistol: 0x66ccff, bazooka: 0xff8844, knife: 0xdfe3e6,
  };

  /* ---- verden: colliders (lodrette vægge) + surfaces (gåbare flader) ------ */
  const colliders = [];   // {minX,maxX,minZ,maxZ, top}
  const surfaces = [];    // flad: {minX,maxX,minZ,maxZ, h}  |  rampe: {..., lo,hi,dir}
  const ceilings = [];    // {minX,maxX,minZ,maxZ, bot} — hovedstøds-grænse (tunneller)

  function rectOf(cx, cz, w, d) { return { minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 }; }
  function mat(color, rough, tex, rx, ry) {
    const m = new THREE.MeshStandardMaterial({ color: tex && TEX[tex] ? 0xffffff : color, roughness: rough == null ? 0.95 : rough, metalness: 0.0 });
    if (tex && TEX[tex]) { const t = TEX[tex].clone(); t.needsUpdate = true; t.repeat.set(rx || 1, ry || 1); m.map = t; }
    return m;
  }

  function addBox(cx, cz, w, d, base, top, color, opts) {
    opts = opts || {};
    const h = top - base;
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, opts.rough, opts.tex, opts.trx != null ? opts.trx : Math.max(w, d) / 2, opts.try != null ? opts.try : Math.max(h, 0.8) / 2));
    m.position.set(cx, base + h / 2, cz);
    m.castShadow = true; m.receiveShadow = true;
    scene.add(m);
    if (opts.solid !== false) colliders.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2, base: base, top: top });
    if (opts.walkable !== false) surfaces.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2, h: top });
    return m;
  }
  // gulvplade uden kollision (kun visuel farvezone)
  function addFloorPatch(cx, cz, w, d, color, y) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ color: color, roughness: 1.0, transparent: true, opacity: 0.55 }));
    m.rotation.x = -Math.PI / 2; m.position.set(cx, y == null ? 0.02 : y, cz);
    m.receiveShadow = true;
    scene.add(m);
  }
  // tag: gåbar flade + visuel plade, INGEN lodret kollision
  function addRoof(cx, cz, w, d, h) {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(w, 0.2, d), mat(COL.roof, 0.9, 'concrete', w / 2, d / 2));
    slab.position.set(cx, h - 0.1, cz); slab.castShadow = true; slab.receiveShadow = true; scene.add(slab);
    surfaces.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2, h: h });
  }
  // rampe: gåbar skråflade + visuel skråplade, INGEN lodret kollision
  function addRamp(cx, cz, w, d, lo, hi, dir) {
    const len = (dir === '+x' || dir === '-x') ? w : d;
    const ang = Math.atan2(hi - lo, len);
    const slab = new THREE.Mesh(new THREE.BoxGeometry(w, 0.18, d), mat(COL.ramp, 0.95, 'wood', Math.max(w, d) / 2, 1));
    slab.position.set(cx, (lo + hi) / 2, cz);
    if (dir === '+x') slab.rotation.z = ang;
    else if (dir === '-x') slab.rotation.z = -ang;
    else if (dir === '+z') slab.rotation.x = -ang;
    else slab.rotation.x = ang;
    scene.add(slab);
    slab.castShadow = true; slab.receiveShadow = true;
    surfaces.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2, lo: lo, hi: hi, dir: dir });
  }

  /* Bygning: fire sider. Hver side: 'full' | 'window' | 'door' | 'open'.
     'window' = lav mur (skyd/kig hen over). 'door' = fuld mur med central åbning. */
  function wallSeg(along, fixed, from, to, base, top, color, tex) {
    const len = to - from, mid = (from + to) / 2;
    if (len <= 0.05) return;
    if (along === 'x') addBox(mid, fixed, len, WALL_T, base, top, color, { tex: tex });
    else addBox(fixed, mid, WALL_T, len, base, top, color, { tex: tex });
  }
  const TRIM = 0xe9e4d8; // hvid kant (vindueskarme/dørkarme)
  function trimBox(along, fixed, at, len, dep, base, top) {
    if (along === 'x') addBox(at, fixed, len, dep, base, top, TRIM, { solid: false, walkable: false });
    else addBox(fixed, at, dep, len, base, top, TRIM, { solid: false, walkable: false });
  }
  function buildSide(side, kind, tex) {
    const s = side; // {along, fixed, from, to}
    if (kind === 'open') return;
    if (kind === 'window') {
      const L = s.to - s.from, HEAD = 2.3;
      wallSeg(s.along, s.fixed, s.from, s.to, 0, WIN_SILL, COL.wall, tex);       // brystning
      wallSeg(s.along, s.fixed, s.from, s.to, HEAD, WALL_H, COL.wall, tex);      // mur over vinduerne
      const n = Math.max(1, Math.floor(L / 4)), sp = L / n;                       // rigtige vinduesåbninger
      let prev = s.from;
      for (let i = 0; i < n; i++) {
        const c = s.from + sp * (i + 0.5);
        wallSeg(s.along, s.fixed, prev, c - 0.7, WIN_SILL, HEAD, COL.wall, tex); // murpille
        trimBox(s.along, s.fixed, c, 1.5, WALL_T + 0.1, WIN_SILL, WIN_SILL + 0.07); // sålbænk
        trimBox(s.along, s.fixed, c, 1.5, WALL_T + 0.1, HEAD - 0.02, HEAD + 0.05);  // overkarm
        prev = c + 0.7;
      }
      wallSeg(s.along, s.fixed, prev, s.to, WIN_SILL, HEAD, COL.wall, tex);
      return;
    }
    if (kind === 'door') {
      const mid = (s.from + s.to) / 2;
      if (s.to - s.from <= DOOR_W + 0.4) { return; } // for kort -> lad stå åben
      wallSeg(s.along, s.fixed, s.from, mid - DOOR_W / 2, 0, WALL_H, COL.wall, tex);
      wallSeg(s.along, s.fixed, mid + DOOR_W / 2, s.to, 0, WALL_H, COL.wall, tex);
      trimBox(s.along, s.fixed, mid - DOOR_W / 2 - 0.1, 0.2, WALL_T + 0.1, 0, WALL_H * 0.97); // dørkarm v.
      trimBox(s.along, s.fixed, mid + DOOR_W / 2 + 0.1, 0.2, WALL_T + 0.1, 0, WALL_H * 0.97); // dørkarm h.
      return;
    }
    wallSeg(s.along, s.fixed, s.from, s.to, 0, WALL_H, COL.wall, tex); // full
  }
  // saddeltag (kun udseende — ingen kollision/gåflade); ryg langs den lange akse
  function addGableRoof(cx, cz, w, d) {
    const ov = 0.35, th = 0.12;
    const alongX = w >= d;
    const span = (alongX ? d : w) / 2 + ov;
    const rise = Math.min(2.2, span * 0.75);
    const len = (alongX ? w : d) + ov * 2;
    const slope = Math.hypot(span, rise);
    const ang = Math.atan2(rise, span);
    for (let s = -1; s <= 1; s += 2) {
      const panel = new THREE.Mesh(
        new THREE.BoxGeometry(alongX ? len : slope, th, alongX ? slope : len),
        mat(0xffffff, 0.9, 'tile', len / 2, slope / 2)
      );
      panel.castShadow = true; panel.receiveShadow = true;
      if (alongX) { panel.position.set(cx, WALL_H + rise / 2, cz + s * span / 2); panel.rotation.x = s * ang; }
      else { panel.position.set(cx + s * span / 2, WALL_H + rise / 2, cz); panel.rotation.z = -s * ang; }
      scene.add(panel);
    }
  }
  function addBuilding(cx, cz, w, d, o) {
    o = o || {};
    const tex = o.tex || 'plaster';
    const hw = w / 2, hd = d / 2;
    buildSide({ along: 'x', fixed: cz - hd, from: cx - hw, to: cx + hw }, o.north || 'full', tex);
    buildSide({ along: 'x', fixed: cz + hd, from: cx - hw, to: cx + hw }, o.south || 'full', tex);
    buildSide({ along: 'z', fixed: cx - hw, from: cz - hd, to: cz + hd }, o.west || 'full', tex);
    buildSide({ along: 'z', fixed: cx + hw, from: cz - hd, to: cz + hd }, o.east || 'full', tex);
    if (o.gable) addGableRoof(cx, cz, w, d);
    if (o.roof) addRoof(cx, cz, w, d, WALL_H);
    if (o.roofRamp) {
      // udvendig rampe op til tagkant på valgt side
      const rl = WALL_H * 2.4;
      if (o.roofRamp === 'east') addRamp(cx + hw + rl / 2, cz, rl, Math.min(d, 6), 0, WALL_H, '-x');
      else if (o.roofRamp === 'west') addRamp(cx - hw - rl / 2, cz, rl, Math.min(d, 6), 0, WALL_H, '+x');
      else if (o.roofRamp === 'north') addRamp(cx, cz - hd - rl / 2, Math.min(w, 6), rl, 0, WALL_H, '+z');
      else addRamp(cx, cz + hd + rl / 2, Math.min(w, 6), rl, 0, WALL_H, '-z');
    }
  }

  /* ---- byg banen (efter tegningen) --------------------------------------- */
  // ---- flerlags-gulv: huller (pits/kældre) skæres ud af basisgulvet --------
  const HOLES = [];
  function splitRectByHole(r, h) {
    if (h.maxX <= r.minX || h.minX >= r.maxX || h.maxZ <= r.minZ || h.minZ >= r.maxZ) return [r];
    const parts = [];
    if (h.minX > r.minX) parts.push({ minX: r.minX, maxX: h.minX, minZ: r.minZ, maxZ: r.maxZ });
    if (h.maxX < r.maxX) parts.push({ minX: h.maxX, maxX: r.maxX, minZ: r.minZ, maxZ: r.maxZ });
    const a = Math.max(r.minX, h.minX), b = Math.min(r.maxX, h.maxX);
    if (h.minZ > r.minZ) parts.push({ minX: a, maxX: b, minZ: r.minZ, maxZ: h.minZ });
    if (h.maxZ < r.maxZ) parts.push({ minX: a, maxX: b, minZ: h.maxZ, maxZ: r.maxZ });
    return parts;
  }
  function subtractRects(base, holes) {
    let rects = [base];
    for (let i = 0; i < holes.length; i++) { const nx = []; for (let j = 0; j < rects.length; j++) { const ps = splitRectByHole(rects[j], holes[i]); for (let k = 0; k < ps.length; k++) nx.push(ps[k]); } rects = nx; }
    return rects;
  }
  function addFloorRect(r, color, y, tex) {
    const w = r.maxX - r.minX, d = r.maxZ - r.minZ;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat(color, 1.0, tex, w / 2, d / 2));
    m.rotation.x = -Math.PI / 2; m.position.set((r.minX + r.maxX) / 2, y, (r.minZ + r.maxZ) / 2);
    m.receiveShadow = true; scene.add(m);
    surfaces.push({ minX: r.minX, maxX: r.maxX, minZ: r.minZ, maxZ: r.maxZ, h: y });
  }
  function pitWallSeg(along, fixed, from, to, depth) {
    const len = to - from; if (len <= 0.05) return;
    const mid = (from + to) / 2;
    if (along === 'x') addBox(mid, fixed, len, WALL_T, -depth, 0, COL.wallLow, { tex: 'concrete' });
    else addBox(fixed, mid, WALL_T, len, -depth, 0, COL.wallLow, { tex: 'concrete' });
  }
  function pitSegs(from, to, gaps) {
    let segs = [[from, to]];
    for (let i = 0; i < gaps.length; i++) {
      const g = gaps[i], nx = [];
      for (let j = 0; j < segs.length; j++) {
        const s = segs[j];
        if (g[1] <= s[0] || g[0] >= s[1]) { nx.push(s); continue; }
        if (g[0] > s[0]) nx.push([s[0], g[0]]);
        if (g[1] < s[1]) nx.push([g[1], s[1]]);
      }
      segs = nx;
    }
    return segs.filter(function (s) { return s[1] - s[0] > 0.15; });
  }
  function buildPitSide(side, r, cx, cz, depth, stairSide, sw, openings) {
    const t = WALL_T, gaps = [];
    if (side === stairSide) gaps.push(side === 'N' || side === 'S' ? [cx - sw / 2, cx + sw / 2] : [cz - sw / 2, cz + sw / 2]);
    for (let i = 0; i < openings.length; i++) if (openings[i].side === side) gaps.push([openings[i].from, openings[i].to]);
    if (side === 'N' || side === 'S') {
      const fixed = side === 'N' ? r.minZ + t / 2 : r.maxZ - t / 2;
      pitSegs(r.minX, r.maxX, gaps).forEach(function (s) { pitWallSeg('x', fixed, s[0], s[1], depth); });
    } else {
      const fixed = side === 'W' ? r.minX + t / 2 : r.maxX - t / 2;
      pitSegs(r.minZ, r.maxZ, gaps).forEach(function (s) { pitWallSeg('z', fixed, s[0], s[1], depth); });
    }
  }
  // pit/kælder: sænket rum, trappe på stairSide ('N'|'S'|'E'|'W'); openings = tunnelåbninger
  function addPit(cx, cz, w, d, depth, stairSide, openings) {
    const r = rectOf(cx, cz, w, d), sw = 4.0, op = openings || [];
    HOLES.push(r);
    addFloorRect(r, COL.floorLow, -depth, 'concrete');
    buildPitSide('N', r, cx, cz, depth, stairSide, sw, op);
    buildPitSide('S', r, cx, cz, depth, stairSide, sw, op);
    buildPitSide('W', r, cx, cz, depth, stairSide, sw, op);
    buildPitSide('E', r, cx, cz, depth, stairSide, sw, op);
    if (stairSide === 'N') { const run = Math.min(depth * 1.5, d - 0.6); addRamp(cx, r.minZ + run / 2, Math.min(w, sw), run, -depth, 0, '-z'); }
    else if (stairSide === 'S') { const run = Math.min(depth * 1.5, d - 0.6); addRamp(cx, r.maxZ - run / 2, Math.min(w, sw), run, -depth, 0, '+z'); }
    else if (stairSide === 'W') { const run = Math.min(depth * 1.5, w - 0.6); addRamp(r.minX + run / 2, cz, run, Math.min(d, sw), -depth, 0, '-x'); }
    else { const run = Math.min(depth * 1.5, w - 0.6); addRamp(r.maxX - run / 2, cz, run, Math.min(d, sw), -depth, 0, '+x'); }
    // luk hullet under trappen (ellers kigger man ud i tomrummet under gaden — den "blå væg")
    const g2 = Math.min(w, sw);
    if (stairSide === 'N') addBox(cx, r.minZ + 0.2, g2, 0.4, -depth, -0.02, COL.wallLow, { tex: 'concrete', solid: false, walkable: false });
    else if (stairSide === 'S') addBox(cx, r.maxZ - 0.2, g2, 0.4, -depth, -0.02, COL.wallLow, { tex: 'concrete', solid: false, walkable: false });
    else if (stairSide === 'W') addBox(r.minX + 0.2, cz, 0.4, Math.min(d, sw), -depth, -0.02, COL.wallLow, { tex: 'concrete', solid: false, walkable: false });
    else addBox(r.maxX - 0.2, cz, 0.4, Math.min(d, sw), -depth, -0.02, COL.wallLow, { tex: 'concrete', solid: false, walkable: false });
  }

  // kældre i indgangshusene — trapper mod bagvæggen, tunnelåbning mod midten
  addPit(8, -46, 6, 6, 3.8, 'N', [{ side: 'S', from: 6.5, to: 9.5 }]);        // rødt indgangshus
  addPit(-10, 46, 6, 6, 3.8, 'S', [{ side: 'N', from: -11.5, to: -8.5 }]);    // blåt indgangshus

  /* ---- hemmelig tunnel: kælder <-> kælder, under gadeplan, med to hjørner ---- */
  const TUN_D = 3.8, TUN_CEIL = -0.4;
  function tunnelPiece(minX, maxX, minZ, maxZ) {
    addFloorRect({ minX: minX, maxX: maxX, minZ: minZ, maxZ: maxZ }, COL.floorLow, -TUN_D, 'concrete');
    addBox((minX + maxX) / 2, (minZ + maxZ) / 2, maxX - minX, maxZ - minZ, TUN_CEIL, -0.1, COL.wallLow, { solid: false, walkable: false, tex: 'concrete' });
    ceilings.push({ minX: minX, maxX: maxX, minZ: minZ, maxZ: maxZ, bot: TUN_CEIL });
  }
  function tunnelWall(along, fixed, from, to) {
    if (to - from <= 0.15) return;
    if (along === 'x') addBox((from + to) / 2, fixed, to - from, 0.3, -TUN_D, TUN_CEIL, COL.wallLow, { walkable: false, tex: 'concrete' });
    else addBox(fixed, (from + to) / 2, 0.3, to - from, -TUN_D, TUN_CEIL, COL.wallLow, { walkable: false, tex: 'concrete' });
  }
  tunnelPiece(6.5, 9.5, -43, -3);      // ben 1: syd fra rød kælder
  tunnelPiece(-11.5, 6.5, -6, -3);     // ben 2: vest (hjørne 1)
  tunnelPiece(-11.5, -8.5, -3, 43);    // ben 3: nord til blå kælder (hjørne 2)
  tunnelWall('z', 6.65, -43, -6);      // ben 1 vest — åbning ved hjørne 1
  tunnelWall('z', 9.35, -43, -4.7);    // ben 1 øst — åbning mod HØJRE-tårnets gren (z -4.7..-3)
  tunnelWall('x', -5.85, -11.5, 6.5);  // ben 2 nordvæg
  tunnelWall('x', -3.15, -8.5, 9.5);   // ben 2 sydvæg — åbning ved hjørne 2
  tunnelWall('z', -11.35, -6, -3);     // ben2/3 vestvæg (syd for venstre-gren)
  tunnelWall('z', -11.35, 3, 43);      // ben 3 vestvæg (nord for venstre-gren) — åbning z -3..3
  tunnelWall('z', -8.65, -3, 43);      // ben 3 østvæg

  /* ---- grene: hovedtunnel -> midttårnenes kælder-skakter ---- */
  // HØJRE midttårn (16,0): korridor fra ben1 (x9.2) til skakten (x11.6) ved z[-4.7,-3]
  tunnelPiece(9.2, 11.7, -4.7, -3);
  tunnelWall('x', -4.85, 9.2, 11.7);   // sydvæg
  tunnelWall('x', -2.85, 9.5, 11.7);   // nordvæg (øst for ben1's åbning)
  // VENSTRE midttårn (-16,0): skakten (x-11.6) klods op ad ben3 (x-11.5) — kort forbindelse ved z[-3,3]
  tunnelPiece(-11.7, -8.5, -3, 3);     // delt gulv/loft ind i ben3
  tunnelWall('x', 3.15, -11.7, -11.3); // nordvæg på forbindelsen (vest for ben3)
  tunnelWall('x', -3.15, -11.7, -11.3);// sydvæg på forbindelsen
  // gulv-huller så spiralen kan fortsætte NED inde i tårnene
  HOLES.push(rectOf(-16, 0, 8.4, 8.4));
  HOLES.push(rectOf(16, 0, 8.4, 8.4));

  // basisgulv = arena minus huller
  subtractRects(rectOf(0, 0, ARENA_W, ARENA_D), HOLES).forEach(function (r) { addFloorRect(r, COL.floor, 0, 'asphalt'); });
  // farvezoner: rød spawn, neutral (gul) midterzone, blå spawn
  function zonePatch(cx, cz, w, d, color) {
    subtractRects(rectOf(cx, cz, w, d), HOLES).forEach(function (r) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(r.maxX - r.minX, r.maxZ - r.minZ),
        new THREE.MeshStandardMaterial({ color: color, roughness: 1.0, transparent: true, opacity: 0.5 }));
      m.rotation.x = -Math.PI / 2; m.position.set((r.minX + r.maxX) / 2, 0.03, (r.minZ + r.maxZ) / 2);
      m.receiveShadow = true; scene.add(m);
    });
  }
  zonePatch(0, -43, ARENA_W - 2, 24, COL.red);      // rød holdzone
  zonePatch(0, 43, ARENA_W - 2, 24, COL.blue);       // blå holdzone
  zonePatch(0, 0, ARENA_W - 2, 62, COL.mid);         // neutral (gul) zone

  // ydervægge — lav, klippet HÆK (grøn) i stedet for beton, så det ligner en have-kant
  const OUTER_WALL_H = 2.5;
  addBox(0, -ARENA_D / 2, ARENA_W, WALL_T, 0, OUTER_WALL_H, 0xffffff, { tex: 'hedge', trx: ARENA_W / 4, try: 1.2 });
  addBox(0, ARENA_D / 2, ARENA_W, WALL_T, 0, OUTER_WALL_H, 0xffffff, { tex: 'hedge', trx: ARENA_W / 4, try: 1.2 });
  addBox(-ARENA_W / 2, 0, WALL_T, ARENA_D, 0, OUTER_WALL_H, 0xffffff, { tex: 'hedge', trx: ARENA_D / 4, try: 1.2 });
  addBox(ARENA_W / 2, 0, WALL_T, ARENA_D, 0, OUTER_WALL_H, 0xffffff, { tex: 'hedge', trx: ARENA_D / 4, try: 1.2 });

  if (!HEADLESS) {
  /* ======================= MILJØ / BAGGRUND (kun pynt, ingen kollision) =====
   * Blå himmel-kuppel, en by-silhuet hele vejen rundt bag murene, og et bælte af
   * træer + hække på græs udenfor. */
  // -- stor græsflade under alt (ses udenfor murene) --
  (function () {
    const grass = makeTex(function (g, w, h) {
      g.fillStyle = '#4f6a33'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 1500; i++) { g.fillStyle = 'rgba(' + (rnd() < 0.5 ? '30,52,20' : '120,150,72') + ',' + (rnd() * 0.5).toFixed(2) + ')'; g.fillRect(rnd() * w, rnd() * h, 2, 3); }
    });
    grass.repeat.set(48, 48); grass.wrapS = grass.wrapT = THREE.RepeatWrapping;
    // græs KUN udenfor arenaen (ellers dækker den kælder-hullerne -> de så grønne ud)
    subtractRects({ minX: -310, maxX: 310, minZ: -310, maxZ: 310 }, [rectOf(0, 0, ARENA_W, ARENA_D)]).forEach(function (r) {
      const w = r.maxX - r.minX, d = r.maxZ - r.minZ, t = grass.clone(); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(w / 13, d / 13); t.needsUpdate = true;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ color: 0xffffff, map: t, roughness: 1 }));
      m.rotation.x = -Math.PI / 2; m.position.set((r.minX + r.maxX) / 2, -0.05, (r.minZ + r.maxZ) / 2); m.receiveShadow = true; scene.add(m);
    });
  })();
  // -- himmel-kuppel med lodret gradient --
  (function () {
    const skyTex = makeTex(function (g, w, h) {
      const grd = g.createLinearGradient(0, 0, 0, h);
      grd.addColorStop(0.0, '#3f78c4'); grd.addColorStop(0.55, '#84b3e2'); grd.addColorStop(1.0, '#d3e5f3');
      g.fillStyle = grd; g.fillRect(0, 0, w, h);
    });
    skyTex.wrapS = skyTex.wrapT = THREE.ClampToEdgeWrapping;
    const sky = new THREE.Mesh(new THREE.SphereGeometry(300, 24, 16), new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false, depthWrite: false }));
    sky.renderOrder = -2; scene.add(sky);
  })();
  // -- by-silhuet hele vejen rundt (tegnet på canvas) --
  (function () {
    const cw = 2048, ch = 512, c = document.createElement('canvas'); c.width = cw; c.height = ch;
    const g = c.getContext('2d'); g.clearRect(0, 0, cw, ch);
    const pal = ['#6b7480', '#7d8794', '#5f6a76', '#8a94a0', '#727c88', '#565f6b', '#94795e'];
    let x = 0;
    while (x < cw) {
      const bw = 44 + rnd() * 96, bh = 120 + rnd() * 320, col = pal[(rnd() * pal.length) | 0];
      g.fillStyle = col; g.fillRect(x, ch - bh, bw, bh);
      g.fillStyle = 'rgba(0,0,0,0.16)'; g.fillRect(x, ch - bh, bw, 5);                   // tag-skygge
      for (let wy = ch - bh + 14; wy < ch - 12; wy += 18) for (let wx = x + 7; wx < x + bw - 9; wx += 15) {
        g.fillStyle = rnd() < 0.34 ? 'rgba(255,226,150,0.85)' : 'rgba(22,28,36,0.7)';
        g.fillRect(wx, wy, 7, 10);                                                        // vinduer
      }
      x += bw + 5 + rnd() * 12;
    }
    const cityTex = new THREE.CanvasTexture(c); cityTex.colorSpace = THREE.SRGBColorSpace;
    cityTex.wrapS = THREE.RepeatWrapping; cityTex.wrapT = THREE.ClampToEdgeWrapping; cityTex.repeat.set(3, 1);
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(116, 116, 44, 48, 1, true),
      new THREE.MeshBasicMaterial({ map: cityTex, side: THREE.BackSide, transparent: true, fog: false, depthWrite: false }));
    cyl.position.y = 20; cyl.renderOrder = -1; scene.add(cyl);
  })();
  // -- træer + hække udenfor murene (delte geometrier/materialer, ingen skygge) --
  (function () {
    const barkMat = mat(0x5b4326, 0.9), leaf = [mat(0x3f6b2e, 0.9), mat(0x4f7d33, 0.9), mat(0x35602a, 0.9)], hedgeMat = mat(0x395a24, 0.9);
    const trunkGeo = new THREE.CylinderGeometry(0.34, 0.5, 3.0, 7), foliaGeo = new THREE.IcosahedronGeometry(2.2, 0);
    const hedgeGX = new THREE.BoxGeometry(3.1, 1.3, 1.4), hedgeGZ = new THREE.BoxGeometry(1.4, 1.3, 3.1);
    function tree(x, z) {
      const s = 0.8 + rnd() * 0.6, t = new THREE.Group();
      const tr = new THREE.Mesh(trunkGeo, barkMat); tr.position.y = 1.5 * s; tr.scale.setScalar(s); t.add(tr);
      const f = new THREE.Mesh(foliaGeo, leaf[(rnd() * 3) | 0]); f.position.y = 4.2 * s; f.scale.setScalar(s * (0.85 + rnd() * 0.5)); f.rotation.y = rnd() * 3; t.add(f);
      const f2 = new THREE.Mesh(foliaGeo, leaf[(rnd() * 3) | 0]); f2.position.set(0.7 * s, 5.2 * s, 0.3 * s); f2.scale.setScalar(s * 0.6); t.add(f2);
      t.position.set(x, 0, z); t.traverse(function (o) { o.castShadow = false; o.receiveShadow = false; }); scene.add(t);
    }
    function hedge(x, z, alongX) {
      const h = new THREE.Mesh(alongX ? hedgeGX : hedgeGZ, hedgeMat);
      h.position.set(x, 0.65, z); scene.add(h);
    }
    const HX = ARENA_W / 2 + 5, HZ = ARENA_D / 2 + 5, TX = ARENA_W / 2 + 10, TZ = ARENA_D / 2 + 10, J = function () { return (rnd() - 0.5) * 3; };
    for (let x = -HX; x <= HX; x += 3.1) { hedge(x, -HZ, true); hedge(x, HZ, true); }
    for (let z = -HZ + 3.1; z < HZ; z += 3.1) { hedge(-HX, z, false); hedge(HX, z, false); }
    for (let x = -TX; x <= TX; x += 8) { tree(x + J(), -TZ + J()); tree(x + J(), TZ + J()); }
    for (let z = -TZ + 8; z < TZ; z += 8) { tree(-TX + J(), z + J()); tree(TX + J(), z + J()); }
  })();
  }

  /* ---- RØD holdzone: 2 kampbygninger (døre udad = mod -Z, væk fra midten) ---- */
  // Sammen med indgangshuset (8,-46) = 3 bygninger + tårnet (-30,-46). Spredt ud over
  // bredden, fri af tårn-fodaftryk (x[-36,-24]) og kælder-indgangshuset (x[4,12]).
  addBuilding(-5, -42, 10, 10, { north: 'door', east: 'window', west: 'window', south: 'full', tex: 'brickRed' });
  addBuilding(28, -41, 12, 10, { north: 'door', west: 'window', east: 'full', south: 'window', tex: 'brickTan', gable: true });

  /* ---- BLÅ holdzone: 2 kampbygninger (døre udad = mod +Z) ---- */
  // Sammen med indgangshuset (-10,46) = 3 bygninger + tårnet (30,46). Bevidst IKKE
  // spejlet af rød: fri af tårn-fodaftryk (x[24,36]) og kælder-indgangshuset (x[-14,-6]).
  addBuilding(-34, 42, 12, 10, { south: 'door', east: 'window', west: 'full', north: 'window', tex: 'brickRed' });
  addBuilding(13, 42, 10, 10, { south: 'door', east: 'window', west: 'window', north: 'full', tex: 'brickTan' });

  // INDGANGSHUSE — dør mod bagvæggen (væk fra banen), kælder på tunnelnettet
  addBuilding(8, -46, 8, 8, { north: 'door', south: 'window', east: 'window', west: 'window', tex: 'brickRed' });
  addBuilding(-10, 46, 8, 8, { south: 'door', north: 'window', east: 'window', west: 'window', tex: 'brickTan' });

  /* ===== RUNDT UDKIGSTÅRN ===== 12 m i diameter (R=6), mur til 11 m for fuld
   * dækning, dæk i 8 m, spindeltrappe (én omgang, 20 trin). Skydeskår i muren i
   * dækhøjde (8.8–9.9) så en snigskytte kan skyde ud men er dækket af muren. */
  function addRoundTower(cx, cz, doorDeg, tex, opt) {
    opt = opt || {};
    const R = 6, SILL = 4.7, BAND = 5.9, DECK = 7.98, DECKTOP = 8;
    const WALLTOP = opt.short ? 8.6 : 11;        // korte midttårne: mur kun lidt over dækket
    const NOTCH_LO = 8.8, NOTCH_HI = 9.9;
    const rd = function (d) { return d * Math.PI / 180; };
    const angDist = function (a, b) { return Math.abs(((a - b) % 360 + 540) % 360 - 180); };
    // 28 trin, én omgang. De øverste trin (over 5.86 m) skal ende i den ÅBNE lysning, ellers
    // rammer man dækket med hovedet. Bredde/radius valgt så trinene overlapper (man falder ikke af).
    const N_STEP = 28, R_STEP = 4.0, STEP_W = 2.1, RISE = DECK / N_STEP, A_STEP = 360 / N_STEP;
    const aStart = doorDeg + 27;
    const kHigh = Math.ceil(5.86 / RISE) - 1;
    let _sx = 0, _sy = 0;
    for (let k = kHigh; k < N_STEP; k++) { const a = aStart + k * A_STEP; _sx += Math.cos(rd(a)); _sy += Math.sin(rd(a)); }
    const wellCtr = (Math.atan2(_sy, _sx) * 180 / Math.PI + 360) % 360;
    let _wmax = 0;
    for (let k = kHigh; k < N_STEP; k++) { const a = ((aStart + k * A_STEP) % 360 + 360) % 360; _wmax = Math.max(_wmax, angDist(a, wellCtr)); }
    const WELL = _wmax + 14;
    // ---- visuel rund væg (24-kant) ----
    const segs = 24, chord = 2 * R * Math.sin(Math.PI / segs) + 0.08;
    for (let i = 0; i < segs; i++) {
      const a = i * 15 + 7.5, x = cx + R * Math.cos(rd(a)), z = cz + R * Math.sin(rd(a));
      if (angDist(a, doorDeg) > 16) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(chord, SILL, 0.4), mat(COL.wall, 0.95, tex, chord / 2, SILL / 2));
        m.position.set(x, SILL / 2, z); m.rotation.y = rd(90 - a); m.castShadow = m.receiveShadow = true; scene.add(m);
      }
      // øvre bånd, delt af skydeskår-rækken i dækhøjde (kun høje tårne)
      if (opt.short) {
        const m2 = new THREE.Mesh(new THREE.BoxGeometry(chord, WALLTOP - BAND, 0.4), mat(COL.wall, 0.95, tex, chord / 2, (WALLTOP - BAND) / 2));
        m2.position.set(x, (BAND + WALLTOP) / 2, z); m2.rotation.y = rd(90 - a); m2.castShadow = m2.receiveShadow = true; scene.add(m2);
      } else {
        const mA = new THREE.Mesh(new THREE.BoxGeometry(chord, NOTCH_LO - BAND, 0.4), mat(COL.wall, 0.95, tex, chord / 2, (NOTCH_LO - BAND) / 2));
        mA.position.set(x, (BAND + NOTCH_LO) / 2, z); mA.rotation.y = rd(90 - a); mA.castShadow = mA.receiveShadow = true; scene.add(mA);
        const notchOpen = (i % 2 === 0) && angDist(a, wellCtr) > 58;
        if (!notchOpen) {
          const mN = new THREE.Mesh(new THREE.BoxGeometry(chord, NOTCH_HI - NOTCH_LO, 0.4), mat(COL.wall, 0.95, tex, chord / 2, 0.5));
          mN.position.set(x, (NOTCH_LO + NOTCH_HI) / 2, z); mN.rotation.y = rd(90 - a); mN.castShadow = true; scene.add(mN);
        }
        const mB = new THREE.Mesh(new THREE.BoxGeometry(chord, WALLTOP - NOTCH_HI, 0.4), mat(COL.wall, 0.95, tex, chord / 2, (WALLTOP - NOTCH_HI) / 2));
        mB.position.set(x, (NOTCH_HI + WALLTOP) / 2, z); mB.rotation.y = rd(90 - a); mB.castShadow = mB.receiveShadow = true; scene.add(mB);
      }
    }
    // ---- kollisionsring ----
    for (let i = 0; i < 36; i++) {
      const a = i * 10, x = cx + R * Math.cos(rd(a)), z = cz + R * Math.sin(rd(a));
      if (angDist(a, doorDeg) > 21) colliders.push({ minX: x - 0.5, maxX: x + 0.5, minZ: z - 0.5, maxZ: z + 0.5, base: 0, top: SILL });
      colliders.push({ minX: x - 0.5, maxX: x + 0.5, minZ: z - 0.5, maxZ: z + 0.5, base: BAND, top: WALLTOP });
    }
    for (let s = -1; s <= 1; s += 2) {
      const a = doorDeg + s * 23, x = cx + R * Math.cos(rd(a)), z = cz + R * Math.sin(rd(a));
      colliders.push({ minX: x - 0.45, maxX: x + 0.45, minZ: z - 0.45, maxZ: z + 0.45, base: 0, top: SILL });
    }
    // ---- spindeltrappe (28 brede overlappende trin, én omgang til dæk 8) ----
    // + indervæg (spindel/newel) langs trappens indre kant, så man IKKE kan falde ned i lysningen.
    for (let k = 0; k < N_STEP; k++) {
      const a = aStart + k * A_STEP, h = RISE * (k + 1);
      addBox(cx + R_STEP * Math.cos(rd(a)), cz + R_STEP * Math.sin(rd(a)), STEP_W, STEP_W, Math.max(0, h - 0.24), h, COL.roof, { tex: 'wood' });
      // indervæg: lav mur på trinnets indvendige side (r=2.6), rækker op over trinnet
      const rx = cx + 2.6 * Math.cos(rd(a)), rz = cz + 2.6 * Math.sin(rd(a));
      addBox(rx, rz, 1.2, 1.2, Math.max(0, h - 0.24), h + 1.2, COL.wall, { tex: tex, walkable: false });
    }
    // ---- dæk med åben trappelysning ----
    // (clubhouse) On the steps where a walker's head reaches the deck slab, no deck tile may come within a body's
    // width: one tile row used to hang over the first of them and shoved everybody sideways on the way up.
    const headSteps = [];
    for (let k = 0; k < N_STEP; k++) {
      const h = RISE * (k + 1), a = aStart + k * A_STEP;
      if (h + 1.9 > DECK - 0.22 && h + STEP < DECK) headSteps.push([cx + R_STEP * Math.cos(rd(a)), cz + R_STEP * Math.sin(rd(a))]);
    }
    const overStairs = function (tx, tz) { const r = 0.45 + STEP_W / 2 + RAD; return headSteps.some(function (s) { return Math.abs(tx - s[0]) < r && Math.abs(tz - s[1]) < r; }); };
    for (let ix = -6; ix <= 6; ix++) for (let iz = -6; iz <= 6; iz++) {
      const tx = cx + ix * 0.9, tz = cz + iz * 0.9, rr = Math.hypot(ix * 0.9, iz * 0.9);
      if (rr + 0.64 > R - 0.3) continue;
      const ta = (Math.atan2(iz, ix) * 180 / Math.PI + 360) % 360;
      if (rr >= 1.6 && angDist(ta, wellCtr) <= WELL) continue;
      if (overStairs(tx, tz)) continue;
      addBox(tx, tz, 0.9, 0.9, DECK - 0.22, DECK, COL.roof, { tex: 'concrete' });
    }
    // ren dækkant hele vejen rundt (skjuler de takkede fliseender -> læses som en cirkel)
    const rimSegs = 32, rimChord = 2 * (R - 0.35) * Math.sin(Math.PI / rimSegs) + 0.06;
    for (let i = 0; i < rimSegs; i++) {
      const a = i * (360 / rimSegs), x = cx + (R - 0.35) * Math.cos(rd(a)), z = cz + (R - 0.35) * Math.sin(rd(a));
      const m = new THREE.Mesh(new THREE.BoxGeometry(rimChord, 0.24, 0.5), mat(COL.roof, 0.9, 'concrete', 1, 1));
      m.position.set(x, DECK - 0.11, z); m.rotation.y = rd(90 - a); m.castShadow = m.receiveShadow = true; scene.add(m);
    }
    // indvendig kant rundt om trappelysningen (så hullet ser bevidst ud, ikke ødelagt)
    for (let da = -WELL; da <= WELL; da += 11) {
      const a = wellCtr + da, x = cx + 2.15 * Math.cos(rd(a)), z = cz + 2.15 * Math.sin(rd(a));
      addBox(x, z, 0.5, 0.5, DECK, DECK + 0.5, COL.roof, { tex: 'concrete', walkable: false });
    }
    if (opt.short) {
      // korte tårne: lav sammenhængende borg-kant + tinder ovenpå (skydeskår imellem)
      const bSegs = 28;
      for (let i = 0; i < bSegs; i++) {
        const a = i * (360 / bSegs); if (angDist(a, wellCtr) <= WELL) continue;
        const x = cx + 5.55 * Math.cos(rd(a)), z = cz + 5.55 * Math.sin(rd(a));
        const chord = 2 * 5.55 * Math.sin(Math.PI / bSegs) + 0.06;
        const low = new THREE.Mesh(new THREE.BoxGeometry(chord, 0.5, 0.45), mat(COL.wall, 0.9, tex, 1, 1));
        low.position.set(x, DECK + 0.25, z); low.rotation.y = rd(90 - a); low.castShadow = true; scene.add(low);
        colliders.push({ minX: x - 0.6, maxX: x + 0.6, minZ: z - 0.6, maxZ: z + 0.6, base: DECK, top: DECK + 0.5 });
        if (i % 2 === 0) {   // tinde
          const mer = new THREE.Mesh(new THREE.BoxGeometry(chord * 0.7, 0.6, 0.45), mat(COL.wall, 0.9, tex, 1, 1));
          mer.position.set(x, DECK + 0.8, z); mer.rotation.y = rd(90 - a); mer.castShadow = true; scene.add(mer);
          colliders.push({ minX: x - 0.5, maxX: x + 0.5, minZ: z - 0.5, maxZ: z + 0.5, base: DECK + 0.5, top: DECK + 1.1 });
        }
      }
    }
    // ---- indvendigt lys ----
    const l1 = new THREE.PointLight(0xffe2b8, 26, 16); l1.position.set(cx, 5.0, cz); scene.add(l1);
    const l2 = new THREE.PointLight(0xffe2b8, 14, 11); l2.position.set(cx, 2.0, cz); scene.add(l2);
  }
  // holdtårne (høje, fuld dækning) — SOLID mur mod fjenden (banen), dør + trappelysning
  // mod egen bagvæg (så man kommer ind bagfra og er dækket mod fjenden).
  addRoundTower(-30, -46, 270, 'brickTan');   // rødt hold — dør mod -z (bagvæggen)
  addRoundTower(30, 46, 90, 'brickRed');       // blåt hold — dør mod +z (bagvæggen)

  // midttårne (korte, snigskytte-spawn ovenpå) — flankerer neutralzonen
  addRoundTower(-16, 0, 0, 'brickTan', { short: true });
  addRoundTower(16, 0, 180, 'brickRed', { short: true });

  /* ---- midttårnenes kælder-skakt: den runde spindeltrappe FORTSÆTTER ned under jorden
   * til tunnelgulvet (-3.8), i en firkantet skakt med åbning mod grenen til hovedtunnelen. */
  function addTowerBasement(cx, cz, doorDeg, tex, gapSide) {
    const rd = function (d) { return d * Math.PI / 180; };
    const RISE = 8 / 28, A_STEP = 360 / 28, aStart = doorDeg + 27;
    const R_DOWN = 3.5, W_DOWN = 2.9, N_DOWN = Math.ceil(TUN_D / RISE), W = 4.4;   // brede trin: når helt ud til skaktvæggen (intet fald-hul)
    // nedadgående spiral: TYNDE trin (som op-spiralen) — solide blokke spærrede opstigningen
    for (let k = 1; k <= N_DOWN; k++) {
      const a = aStart - k * A_STEP, h = Math.max(-TUN_D + 0.02, -RISE * k);
      addBox(cx + R_DOWN * Math.cos(rd(a)), cz + R_DOWN * Math.sin(rd(a)), W_DOWN, W_DOWN, h - 0.24, h, COL.ramp, { tex: 'wood' });
    }
    // (gulv-ringen fjernet — spilleren går ind via dørens asfalt-kant og videre på spiralen)
    // skaktvægge (firkant ±W) fra bund til jord, med åbning på gren-siden
    const seg = function (fixed, from, to, axis) { if (to - from < 0.1) return; if (axis === 'x') addBox((from + to) / 2, fixed, to - from, 0.3, -TUN_D, 0, COL.wallLow, { tex: 'concrete', walkable: false }); else addBox(fixed, (from + to) / 2, 0.3, to - from, -TUN_D, 0, COL.wallLow, { tex: 'concrete', walkable: false }); };
    seg(cz - W, cx - W, cx + W, 'x'); seg(cz + W, cx - W, cx + W, 'x');           // nord/syd
    if (gapSide === '+x') { seg(cx - W, cz - W, cz + W, 'z'); seg(cx + W, cz - W, cz - 3, 'z'); seg(cx + W, cz + 3, cz + W, 'z'); }  // åbning +x, z[-3,3]
    else { seg(cx + W, cz - W, cz + W, 'z'); seg(cx - W, cz - W, cz - 4.7, 'z'); seg(cx - W, cz - 3, cz + W, 'z'); }                 // åbning -x, z[-4.7,-3]
    addFloorRect({ minX: cx - W, maxX: cx + W, minZ: cz - W, maxZ: cz + W }, 0x71767f, -TUN_D, 'concrete');  // skaktbund (lysere)
    const l = new THREE.PointLight(0xffe2b8, 30, 17); l.position.set(cx, -1.4, cz); scene.add(l);
    const l2 = new THREE.PointLight(0xfff0d8, 22, 12); l2.position.set(cx, -3.4, cz); scene.add(l2);   // gulv-lys: lyser trinnenes undersider op
  }
  addTowerBasement(-16, 0, 0, 'brickTan', '+x');    // venstre — gren mod ben3 (+x)
  addTowerBasement(16, 0, 180, 'brickRed', '-x');   // højre — gren mod ben1 (-x)

  /* ---- KRYDSMUR i midten er nu en LAV TRÆRÆKKE (hæk-tekstur + busket top), halv
   * højde. Deler stadig neutralzonen som lav dækning. De to boarding-stubbe (±25.5)
   * forbliver BETON i fuld højde — de er spring-vejen op til toget. */
  const XWALL_H = 4.5, TREELINE_H = XWALL_H / 2;
  const tlFoliaGeo = new THREE.IcosahedronGeometry(1.3, 0);
  const tlLeaf = [mat(0x3f6b2e, 0.9), mat(0x4f7d33, 0.9), mat(0x35602a, 0.9)];
  function treeline(cx, cz, w, d, topY) {
    addBox(cx, cz, w, d, 0, topY, 0xffffff, { tex: 'hedge', trx: Math.max(w, d) / 4, try: topY / 2 });
    const along = w >= d, L = (along ? w : d) - 1.0, n = Math.max(1, Math.round(L / 1.6));
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n - 0.5;
      const x = cx + (along ? t * L : (rnd() - 0.5) * 0.7), z = cz + (along ? (rnd() - 0.5) * 0.7 : t * L);
      const f = new THREE.Mesh(tlFoliaGeo, tlLeaf[(rnd() * tlLeaf.length) | 0]);
      f.position.set(x, topY + 0.5 + rnd() * 0.35, z); f.scale.setScalar(0.7 + rnd() * 0.35);
      f.castShadow = false; scene.add(f);
    }
  }
  treeline(0, -15, 3, 18, TREELINE_H);
  treeline(0, 15, 3, 18, TREELINE_H);
  treeline(0, 0, 16, 3, TREELINE_H);                                   // midt (mellem tårnene)
  // boarding-stubbe (beton, fuld højde — uændret)
  addBox(25.5, 0, 4.0, 3, 0, XWALL_H, COL.wall, { tex: 'concrete' });   // højre: tårn(16) -> tog(30)
  addBox(-25.5, 0, 4.0, 3, 0, XWALL_H, COL.wall, { tex: 'concrete' });  // venstre (spejlet)

  /* ============================ TOG / TRAIN ================================
   * Rulleret rundstrækning (afrundet rektangel) om neutralzonen. Vognene er
   * MASSIVE + GÅBARE og BÆRER spilleren — ny bevægende-platform-fysik, som
   * motoren ikke havde før. Bagerste vogn er en RAMPE (lavt bagtrin 0.4 m op til
   * dæk 2.4 m), så man kan hoppe på det kørende tog og gå op. Bazooka ligger på
   * forreste vogn. Kørsel med uret set oppefra. Ringen er FRI af tårne/mure/huse
   * (lodrette rails x=±30, top/bund z=±27, hjørneradius 8). */
  const TRAIN = { RX: 30, RZ: 27, CR: 8, CL: 6.0, CW: 3.0, DECK: 2.2, RAMP_LO: 0.35, SPEED: 9.0, GAP: 0.7, BRIDGE: 0.55 };
  const _seg = [];
  (function buildLoop() {
    const RX = TRAIN.RX, RZ = TRAIN.RZ, CR = TRAIN.CR, sx = RX - CR, sz = RZ - CR;
    const S = function (x0, z0, dx, dz, len) { _seg.push({ t: 's', x0: x0, z0: z0, dx: dx, dz: dz, len: len }); };
    const A = function (cx, cz, a0) { _seg.push({ t: 'a', cx: cx, cz: cz, a0: a0, r: CR, len: (Math.PI / 2) * CR }); };
    S(-sx, -RZ, 1, 0, 2 * sx);        // top -> +x
    A(sx, -sz, -Math.PI / 2);         // hjørne top-højre
    S(RX, -sz, 0, 1, 2 * sz);         // højre -> +z
    A(sx, sz, 0);                     // hjørne bund-højre
    S(sx, RZ, -1, 0, 2 * sx);         // bund -> -x
    A(-sx, sz, Math.PI / 2);          // hjørne bund-venstre
    S(-RX, sz, 0, -1, 2 * sz);        // venstre -> -z
    A(-sx, -sz, Math.PI);             // hjørne top-venstre
  })();
  const LOOP_L = _seg.reduce(function (a, s) { return a + s.len; }, 0);
  function loopAt(s) {
    s = ((s % LOOP_L) + LOOP_L) % LOOP_L;
    for (let i = 0; i < _seg.length; i++) {
      const g = _seg[i];
      if (s <= g.len) {
        if (g.t === 's') return { x: g.x0 + g.dx * s, z: g.z0 + g.dz * s, dx: g.dx, dz: g.dz };
        const a = g.a0 + s / g.r;
        return { x: g.cx + g.r * Math.cos(a), z: g.cz + g.r * Math.sin(a), dx: -Math.sin(a), dz: Math.cos(a) };
      }
      s -= g.len;
    }
    const g = _seg[_seg.length - 1];
    return { x: g.x0 + g.dx * g.len, z: g.z0 + g.dz * g.len, dx: g.dx, dz: g.dz };
  }
  // synlige skinner + sveller (kun pynt — ingen kollision). Lang akse = lokal Z, rot.y=atan2(dx,dz).
  (function drawTrack() {                     // KUN pynt. Delte materialer+geometri, ingen skygger -> billigt.
    const sleeperMat = mat(0x4a4640, 0.9), railMat = mat(0x9aa0a6, 0.4);
    const n = Math.round(LOOP_L / 3.0);
    const sg = new THREE.BoxGeometry(TRAIN.CW + 1.0, 0.12, 0.5);
    const rg = new THREE.BoxGeometry(0.12, 0.14, LOOP_L / n + 0.3);
    for (let i = 0; i < n; i++) {
      const p = loopAt((i / n) * LOOP_L), ry = Math.atan2(p.dx, p.dz);
      const sl = new THREE.Mesh(sg, sleeperMat); sl.position.set(p.x, 0.06, p.z); sl.rotation.y = ry; scene.add(sl);
      for (let rail = -1; rail <= 1; rail += 2) {
        const nx = -p.dz, nz = p.dx, off = rail * (TRAIN.CW * 0.5 - 0.1);
        const rs = new THREE.Mesh(rg, railMat); rs.position.set(p.x + nx * off, 0.15, p.z + nz * off); rs.rotation.y = ry; scene.add(rs);
      }
    }
  })();
  // ---- vogn-mesh (KUN pynt — kollision bruger CL×CW-fodaftryk med dæk-top = DECK).
  //      Små hjul tuckede ind, lav chassis, buffere; forreste vogn = lille lokomotiv.
  //      Kørsel = +lokal Z (= front). Boarding sker via en separat platform (ikke rampe).
  const wheelMat = mat(0x17181a, 0.5), steelMat = mat(0x3a3f45, 0.5), darkMat = mat(0x2a2c30, 0.6);
  function buildCarMesh(kind, col) {
    const CL = TRAIN.CL, CW = TRAIN.CW, D = TRAIN.DECK, g = new THREE.Group(), wr = 0.34;
    for (let a = -1; a <= 1; a++) for (let s = -1; s <= 1; s += 2) {     // 3 aksler x 2 sider, små hjul
      const wh = new THREE.Mesh(new THREE.CylinderGeometry(wr, wr, 0.18, 14), wheelMat);
      wh.rotation.z = Math.PI / 2; wh.position.set(s * (CW / 2 - 0.12), wr, a * CL * 0.32); g.add(wh);
    }
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(CW - 0.2, 0.3, CL - 0.2), darkMat);
    chassis.position.y = wr + 0.2; g.add(chassis);
    for (let e = -1; e <= 1; e += 2) for (let s = -1; s <= 1; s += 2) {  // buffere
      const bf = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.28, 8), steelMat);
      bf.rotation.x = Math.PI / 2; bf.position.set(s * 0.8, wr + 0.3, e * (CL / 2 + 0.12)); g.add(bf);
    }
    const floorY = wr + 0.35, bodyH = D - floorY;
    const body = new THREE.Mesh(new THREE.BoxGeometry(CW, bodyH, CL), mat(col, 0.8, 'concrete', 1, 1));
    body.position.y = floorY + bodyH / 2; body.castShadow = true; g.add(body);
    for (let s = -1; s <= 1; s += 2) {                                   // lave sidekarme i kropsfarve
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.34, CL - 0.3), mat(col, 0.8, 'concrete', 1, 1));
      rail.position.set(s * (CW / 2 - 0.05), D + 0.17, 0); g.add(rail);
    }
    if (kind === 'baz') {                                                // forreste = lokomotiv-agtig
      const cab = new THREE.Mesh(new THREE.BoxGeometry(CW - 0.4, 0.9, 1.4), mat(0x552019, 0.75, 'concrete', 1, 1));
      cab.position.set(0, D + 0.45, CL / 2 - 0.9); cab.castShadow = true; g.add(cab);
      const win = new THREE.Mesh(new THREE.BoxGeometry(CW - 0.36, 0.32, 1.42), mat(0x10131a, 0.3));
      win.position.set(0, D + 0.58, CL / 2 - 0.9); g.add(win);
      const funnel = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.6, 10), mat(0x161616, 0.6));
      funnel.position.set(0, D + 0.5, CL / 2 - 1.8); funnel.castShadow = true; g.add(funnel);
      const mnt = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.18, 0.8), steelMat);
      mnt.position.set(0, D + 0.09, -0.6); g.add(mnt);                   // bazooka-mount
    }
    return g;
  }
  const CARDEFS = [{ kind: 'baz', col: 0x7a3b2e }, { kind: 'flat', col: 0x45505b }, { kind: 'flat', col: 0x50565e }];
  const trainCars = CARDEFS.map(function (d, i) {
    const g = buildCarMesh(d.kind, d.col);
    scene.add(g);
    return { grp: g, kind: d.kind, off: i * (TRAIN.CL + TRAIN.GAP), cx: 0, cz: 0, dx: 1, dz: 0 };
  });
  let trainHead = 0;
  const bazCar = trainCars[0];
  function updateTrain(dt) {
    trainHead += TRAIN.SPEED * dt;
    for (let i = 0; i < trainCars.length; i++) {
      const c = trainCars[i], p = loopAt(trainHead - c.off);
      c.cx = p.x; c.cz = p.z; c.dx = p.dx; c.dz = p.dz;
      c.grp.position.set(p.x, 0, p.z); c.grp.rotation.y = Math.atan2(p.dx, p.dz);
    }
  }
  // lokalt vogn-koordinatsystem: along = langs kørsel, across = på tværs (venstre positiv)
  function carLocal(c, x, z) { const ex = x - c.cx, ez = z - c.cz; return { along: ex * c.dx + ez * c.dz, across: ex * (-c.dz) + ez * c.dx }; }
  function carWorld(c, along, across) { return { x: c.cx + along * c.dx + across * (-c.dz), z: c.cz + along * c.dz + across * c.dx }; }
  function carTopLocal(c, along) { if (c.kind !== 'ramp') return TRAIN.DECK; const t = clamp((along + TRAIN.CL / 2) / TRAIN.CL, 0, 1); return TRAIN.RAMP_LO + (TRAIN.DECK - TRAIN.RAMP_LO) * t; }
  // højeste togflade under fødderne (indenfor STEP) + hvilken vogn. BRIDGE bygger bro over koblingsgabet.
  function trainGround(x, z, feetY) {
    let best = -Infinity, car = -1;
    for (let i = 0; i < trainCars.length; i++) {
      const c = trainCars[i], lc = carLocal(c, x, z);
      if (Math.abs(lc.along) <= TRAIN.CL / 2 + TRAIN.BRIDGE && Math.abs(lc.across) <= TRAIN.CW / 2) {
        const h = carTopLocal(c, lc.along);
        if (h <= feetY + STEP + 0.001 && h > best) { best = h; car = i; }
      }
    }
    return { h: best, car: car };
  }
  // skub spilleren ud af en vogns side (orienteret rektangel), KUN hvor vogntoppen dér
  // er højere end fod+STEP — så man kan træde op på rampens lave bagende og gå på dækket.
  function trainPush(x, z, feetY) {
    let nx = x, nz = z;
    for (let i = 0; i < trainCars.length; i++) {
      const c = trainCars[i], lc = carLocal(c, nx, nz);
      const hl = TRAIN.CL / 2 + RAD, hw = TRAIN.CW / 2 + RAD;
      if (Math.abs(lc.along) >= hl || Math.abs(lc.across) >= hw) continue;
      const topHere = carTopLocal(c, clamp(lc.along, -TRAIN.CL / 2, TRAIN.CL / 2));
      if (topHere <= feetY + STEP) continue;
      const cxL = clamp(lc.along, -TRAIN.CL / 2, TRAIN.CL / 2), czL = clamp(lc.across, -TRAIN.CW / 2, TRAIN.CW / 2);
      const ddx = lc.along - cxL, ddz = lc.across - czL, d2 = ddx * ddx + ddz * ddz;
      if (d2 > RAD * RAD) continue;
      let alongN = lc.along, acrossN = lc.across;
      if (d2 > 1e-8) { const d = Math.sqrt(d2), k = (RAD - d) / d; alongN = lc.along + ddx * k; acrossN = lc.across + ddz * k; }
      else {
        const tl = lc.along + TRAIN.CL / 2, tr = TRAIN.CL / 2 - lc.along, tb = lc.across + TRAIN.CW / 2, tf = TRAIN.CW / 2 - lc.across, m = Math.min(tl, tr, tb, tf);
        if (m === tl) alongN = -TRAIN.CL / 2 - RAD; else if (m === tr) alongN = TRAIN.CL / 2 + RAD; else if (m === tb) acrossN = -TRAIN.CW / 2 - RAD; else acrossN = TRAIN.CW / 2 + RAD;
      }
      const w = carWorld(c, alongN, acrossN); nx = w.x; nz = w.z;
    }
    return { x: nx, z: nz };
  }

  /* ---- våben-pickups i midten (gul zone) --------------------------------- */
  const PICKUPS = [
    { type: 'sniper', x: -16, z: 0, y: 8, color: 0x66ccff },   // på venstre midttårn
    { type: 'sniper', x: 16, z: 0, y: 8, color: 0x66ccff },    // på højre midttårn
    { type: 'bazooka', x: 0, z: 4, color: COL.bazooka },       // central sprække (fri af murene)
    { type: 'pistol', x: -34, z: 0, color: COL.pistol },        // venstre bane (udenfor ringen)
    { type: 'pistol', x: 34, z: 0, color: COL.pistol },         // højre bane
    { type: 'badgun', x: -20, z: 14, color: 0x9a9a5a },         // 4 dårlige våben i de fri hjørne-lommer
    { type: 'badgun', x: 20, z: 14, color: 0x9a9a5a },
    { type: 'badgun', x: -20, z: -14, color: 0x9a9a5a },
    { type: 'badgun', x: 20, z: -14, color: 0x9a9a5a },
  ];

  /* ---- holdenes health-pakker: inde i hvert holds hus. +25 liv, KUN eget hold,
   * respawn hvert 15. s. (Rødt = A, blåt = B.) */
  const HEALTH_PACKS = [
    { team: 'A', x: -5, z: -42, col: 0xcf4a58 },   // inde i rødt holds hus
    { team: 'B', x: 13, z: 42, col: 0x4a78cf },    // inde i blåt holds hus
  ];

  /* ---- kollision / højde -------------------------------------------------- */
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function inRect(x, z, r) { return x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ; }
  function surfaceHeight(s, x, z) {
    if (s.dir === undefined) return s.h;
    const t = (s.dir === '+x') ? (x - s.minX) / (s.maxX - s.minX)
      : (s.dir === '-x') ? (s.maxX - x) / (s.maxX - s.minX)
        : (s.dir === '+z') ? (z - s.minZ) / (s.maxZ - s.minZ)
          : (s.maxZ - z) / (s.maxZ - s.minZ);
    return s.lo + (s.hi - s.lo) * clamp(t, 0, 1);
  }
  function groundUnder(x, z, feetY) {
    let best = -Infinity; // flerlags: kun flader tæller (huller kan gå under 0)
    for (let i = 0; i < surfaces.length; i++) {
      const s = surfaces[i];
      if (!inRect(x, z, s)) continue;
      const h = surfaceHeight(s, x, z);
      if (h <= feetY + STEP + 0.001 && h > best) best = h;
    }
    return best === -Infinity ? 0 : best;
  }
  function pushOut(px, pz, c) {
    const cx = clamp(px, c.minX, c.maxX), cz = clamp(pz, c.minZ, c.maxZ);
    const dx = px - cx, dz = pz - cz, d2 = dx * dx + dz * dz;
    if (d2 > RAD * RAD) return null;
    if (d2 > 1e-8) { const d = Math.sqrt(d2); const k = (RAD - d) / d; return { x: px + dx * k, z: pz + dz * k }; }
    const tl = px - c.minX, tr = c.maxX - px, tb = pz - c.minZ, tf = c.maxZ - pz;
    const m = Math.min(tl, tr, tb, tf);
    if (m === tl) return { x: c.minX - RAD, z: pz };
    if (m === tr) return { x: c.maxX + RAD, z: pz };
    if (m === tb) return { x: px, z: c.minZ - RAD };
    return { x: px, z: c.maxZ + RAD };
  }
  function moveHoriz(p, dx, dz) {
    let nx = p.x + dx, nz = p.z + dz;
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < colliders.length; i++) {
        const c = colliders[i];
        if (c.top <= p.y + STEP) continue;         // lavt nok til at træde op på
        if (c.base >= p.y + 1.9) continue;         // højt nok til at gå under (fx gade over tunnel)
        const r = pushOut(nx, nz, c);
        if (r) { nx = r.x; nz = r.z; }
      }
    }
    p.x = clamp(nx, -ARENA_W / 2 + RAD, ARENA_W / 2 - RAD);
    p.z = clamp(nz, -ARENA_D / 2 + RAD, ARENA_D / 2 - RAD);
  }


  // ======================= added for the clubhouse =======================
  // The train by the clock: everybody works its place out from the match clock, so it is in the same spot for all.
  function setTrain(head) {
    trainHead = head;
    for (let i = 0; i < trainCars.length; i++) {
      const c = trainCars[i], p = loopAt(trainHead - c.off);
      c.cx = p.x; c.cz = p.z; c.dx = p.dx; c.dz = p.dz;
      c.grp.position.set(p.x, 0, p.z); c.grp.rotation.y = Math.atan2(p.dx, p.dz);
    }
  }
  setTrain(0);

  // Somebody who walks here: a player in the browser, a robot on the server.
  function newWalker(x, z, y) { return { x: x, y: y || 0, z: z, vx: 0, vz: 0, vy: 0, grounded: true, air: 0, onCar: -1, carAlong: 0, carAcross: 0 }; }

  // One step of walking. `inp` = { mx, mz: where to (flat, length 0..1), sprint, jump }. The order of things is the
  // stand-alone shooter's updatePlayer, line for line; new is only that the speed eases in and out instead of
  // jumping (`vx`, `vz`), and that a jump is still taken a moment after walking off an edge.
  function stepPlayer(p, inp, dt) {
    // BÆR: stod vi på en vogn sidste frame, så klæb til vores lokale plet på den NYE vogn-position
    if (p.onCar >= 0 && p.onCar < trainCars.length) {
      const c = trainCars[p.onCar], w = carWorld(c, p.carAlong, p.carAcross);
      p.x = clamp(w.x, -ARENA_W / 2 + RAD, ARENA_W / 2 - RAD);
      p.z = clamp(w.z, -ARENA_D / 2 + RAD, ARENA_D / 2 - RAD);
    }
    const speed = inp.sprint ? SPRINT : WALK, k = Math.min(1, (p.grounded ? 16 : 3.5) * dt);
    p.vx += (inp.mx * speed - p.vx) * k; p.vz += (inp.mz * speed - p.vz) * k;
    if (p.vx * p.vx + p.vz * p.vz > 0.0004) moveHoriz(p, p.vx * dt, p.vz * dt); else { p.vx = 0; p.vz = 0; }
    // tog-sider: massive vogne skubber dig / du kan ikke gå ind i en vogn nedefra
    const tp = trainPush(p.x, p.z, p.y);
    p.x = clamp(tp.x, -ARENA_W / 2 + RAD, ARENA_W / 2 - RAD);
    p.z = clamp(tp.z, -ARENA_D / 2 + RAD, ARENA_D / 2 - RAD);

    p.jumped = false;
    if (inp.jump && (p.grounded || (p.air < 0.12 && p.vy <= 0))) { p.vy = JUMP; p.grounded = false; p.air = 1; p.jumped = true; }
    p.vy += GRAV * dt;
    let ny = p.y + p.vy * dt;
    let g = groundUnder(p.x, p.z, p.y);
    let standCar = -1;
    const tg = trainGround(p.x, p.z, p.y);   // vogntoppe tæller som grund
    if (tg.car >= 0 && tg.h > g) { g = tg.h; standCar = tg.car; }
    p.landed = 0;
    if (ny <= g) { if (!p.grounded) p.landed = -p.vy; ny = g; p.vy = 0; p.grounded = true; }
    else if (p.grounded && (p.y - g) <= STEP && p.vy <= 0) { ny = g; p.vy = 0; p.grounded = true; }
    else { p.grounded = false; standCar = -1; }
    for (let ci = 0; ci < ceilings.length; ci++) {
      const c = ceilings[ci];
      if (p.x >= c.minX && p.x <= c.maxX && p.z >= c.minZ && p.z <= c.maxZ && ny < c.bot && ny + 1.9 > c.bot) {
        ny = c.bot - 1.9; if (p.vy > 0) p.vy = 0;
      }
    }
    p.y = ny;
    p.air = p.grounded ? 0 : p.air + dt;
    // opdater vogn-tilhør: gem vores lokale plet, så BÆR virker næste frame
    if (standCar >= 0 && p.grounded) {
      const c = trainCars[standCar], lc = carLocal(c, p.x, p.z);
      p.onCar = standCar; p.carAlong = lc.along; p.carAcross = lc.across;
    } else p.onCar = -1;
  }

  // Is this point inside something solid: a wall, the ground, or outside the arena? (What stops a bullet.)
  function hitWorld(px, py, pz) {
    if (py <= groundUnder(px, pz, py)) return true;
    for (let j = 0; j < colliders.length; j++) { const c = colliders[j]; if (py > c.base && py < c.top && px >= c.minX && px <= c.maxX && pz >= c.minZ && pz <= c.maxZ) return true; }
    return Math.abs(px) > ARENA_W / 2 || Math.abs(pz) > ARENA_D / 2;
  }
  // fri sigtelinje? (ingen mur imellem) — finer steps than before, so thin walls are not jumped over
  function losClear(ax, ay, az, bx, by, bz) {
    const dx = bx - ax, dy = by - ay, dz = bz - az, len = Math.hypot(dx, dy, dz), steps = Math.max(2, Math.ceil(len / 0.3));
    for (let s = 1; s < steps; s++) {
      const t = s / steps, x = ax + dx * t, y = ay + dy * t, z = az + dz * t;
      for (let j = 0; j < colliders.length; j++) { const c = colliders[j]; if (y > c.base && y < c.top && x >= c.minX && x <= c.maxX && z >= c.minZ && z <= c.maxZ) return false; }
    }
    return true;
  }

  return {
    colliders: colliders, surfaces: surfaces, ceilings: ceilings, COL: COL,
    TRAIN: TRAIN, LOOP_L: LOOP_L, loopAt: loopAt, trainCars: trainCars, bazCar: bazCar, setTrain: setTrain, trainHead: function () { return trainHead; },
    carLocal: carLocal, carWorld: carWorld, trainGround: trainGround, trainPush: trainPush,
    PICKUPS: PICKUPS, HEALTH_PACKS: HEALTH_PACKS,
    clamp: clamp, groundUnder: groundUnder, moveHoriz: moveHoriz, newWalker: newWalker, stepPlayer: stepPlayer, hitWorld: hitWorld, losClear: losClear,
  };
}
