// SLQ Game Lobby — what there is to see out of the saloon's windows and door: a ranch yard in a valley, a corral with
// horses, a barn, a mill that pumps water, pines, a ring of mountains with snow on the tops, and a sky late in the
// day. Own drawing, all of it built on the spot. Søren: "Der må også gerne være noget at se ud af vinduerne og døren".
//
// Measures as in the saloon (kit.js): the house stands on x 0..W, z 0..D; the door is in the back wall (z = 0) and
// the front wall (z = D) is the one the viewer looks in through. The camera is always inside the house or in front
// of it (as far out as z = D + 12), so nothing taller than grass stands in front of the house within that reach:
// it would come between the camera and the room.
//
// Nothing out here takes the saloon's lamps: the light is painted on, the same for everything (a low sun in front of
// the house and to the left, and the blue of the sky in the shade), so that it is one evening out there. The house
// throws its shadow over the yard behind it, where the door is; the pines throw theirs across the grass.

export function buildOutside(THREE, kit, o) {
  const { batch, at, along, picture, wood } = kit, { W, D, H, RIDGE } = o, [DX, DW] = o.door, DC = DX + DW / 2;
  const CX = W / 2, CZ = D / 2, GROUND = -0.22, R = 232, TAU = Math.PI * 2;
  const group = new THREE.Group(); group.name = 'outside';
  const rnd = (() => { let s = 20261114; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; })();
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  // numbers that look like chance but are the same every time: one for each crossing of a grid, and smooth in between
  const hash = (i, j) => { let h = Math.imul(i | 0, 374761393) + Math.imul(j | 0, 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const noise = (x, y) => {
    const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    return (hash(i, j) * (1 - u) + hash(i + 1, j) * u) * (1 - v) + (hash(i, j + 1) * (1 - u) + hash(i + 1, j + 1) * u) * v;
  };
  const fbm = (x, y) => noise(x, y) * 0.5 + noise(x * 2.1 + 7.3, y * 2.1 - 3.1) * 0.3 + noise(x * 4.3 - 1.7, y * 4.3 + 9.2) * 0.2;
  const ridge = (x, y) => { const n = 1 - Math.abs(2 * noise(x, y) - 1), m = 1 - Math.abs(2 * noise(x * 2.3 + 11, y * 2.3 + 5) - 1); return n * n * 0.72 + n * m * 0.28; };

  // ---------- the light ----------
  const SUN = (() => { const v = [-0.5, 0.3, 0.81], l = Math.hypot(...v); return v.map(q => q / l); })();      // where the sun stands
  const SKYL = [0.42, 0.5, 0.72], SUNL = [1.65, 1.2, 0.72];                                                  // what the sky gives, and the sun on top of it
  const SX = -SUN[0] / SUN[1], SZ = -SUN[2] / SUN[1];              // where a thing's shadow falls, for each unit it stands above the ground
  const lightOn = (nx, ny, nz, shade = false) => { const l = shade ? 0 : Math.max(0, nx * SUN[0] + ny * SUN[1] + nz * SUN[2]), k = 0.78 + 0.22 * ny; return [SKYL[0] * k + SUNL[0] * l, SKYL[1] * k + SUNL[1] * l, SKYL[2] * k + SUNL[2] * l]; };
  // does the house stand between a place and the sun? (the house: its walls and the two slopes of its roof)
  const HK = (RIDGE - H) / (D / 2);
  const inShade = (x, y, z) => {
    let t0 = 0.01, t1 = 1e9;
    const slab = (p, d, hi) => { let a = -p / d, b = (hi - p) / d; if (a > b) [a, b] = [b, a]; t0 = Math.max(t0, a); t1 = Math.min(t1, b); };
    const under = (p, d, max) => { const t = (max - p) / d; if (d > 0) t1 = Math.min(t1, t); else t0 = Math.max(t0, t); };
    slab(x, SUN[0], W); slab(z, SUN[2], D);
    under(y - HK * z, SUN[1] - HK * SUN[2], H); under(y + HK * z, SUN[1] + HK * SUN[2], H + HK * D);
    return t1 > t0;
  };
  // the sky in a direction: warm along the horizon, blue above, and a glow round the sun
  const ZEN = [0.06, 0.16, 0.46], MIDS = [0.19, 0.4, 0.82], HOR = [0.78, 0.55, 0.42], GLOW = [1.5, 0.8, 0.32];
  const skyAt = (x, y, z, glow = 1) => {
    const e = Math.max(0, y), c = mix(mix(HOR, MIDS, sstep(-0.02, 0.13, e)), ZEN, sstep(0.12, 0.85, e)), s = Math.max(0, x * SUN[0] + y * SUN[1] + z * SUN[2]), g = (Math.pow(s, 8) * 0.3 + Math.pow(s, 60) * 1.1) * glow;
    return [c[0] + GLOW[0] * g, c[1] + GLOW[1] * g, c[2] + GLOW[2] * g];
  };
  // far things fade into the air: towards the colour of the sky behind them
  const hazed = (c, x, z) => { const dx = x - CX, dz = z - CZ, d = Math.hypot(dx, dz), k = clamp((d - 55) / 280, 0, 0.5); return k > 0 ? mix(c, skyAt(dx / d, 0.04, dz / d, 0.4), k) : c; };
  // a colour (or a colour for each place) in this light, for the things that stand out there
  const lit = base => (x, y, z, n) => {
    const b = typeof base === 'function' ? base(x, y, z, n) : base, L = lightOn(n.x, n.y, n.z, inShade(x, y + 0.02, z));
    return hazed([b[0] * L[0], b[1] * L[1], b[2] * L[2]], x, z);
  };

  // ---------- the land: a valley floor, hills with woods on them, and peaks with snow all the way round ----------
  const height = (x, z) => {
    const r = Math.hypot(x - CX, z - CZ), foot = sstep(58, 112, r), peak = sstep(98, 186, r);
    return GROUND + foot * (2.5 + 12 * fbm(x / 38 + 3.1, z / 38 + 8.7)) + peak * (12 + 74 * ridge(x / 58 + 1.3, z / 58 - 4.2));
  };
  const GRASS = [0.27, 0.32, 0.1], DRY = [0.47, 0.41, 0.16], LUSH = [0.15, 0.26, 0.08], DIRT = [0.4, 0.29, 0.19], DIRT2 = [0.52, 0.4, 0.27];
  const ROCK = [0.33, 0.3, 0.31], ROCK2 = [0.47, 0.42, 0.39], SNOW = [0.93, 0.95, 1], WOODS = [0.055, 0.125, 0.065], WOODS2 = [0.1, 0.18, 0.08];
  const LANDK = 1.22;                                              // (the land's picture of straws is a little dark; this makes up for it)
  const grassAt = (x, z) => mix(mix(GRASS, DRY, clamp(fbm(x / 31 + 5.2, z / 31 - 2.8) * 1.7 - 0.35, 0, 1)), LUSH, noise(x / 6.3 + 9.1, z / 6.3 + 4.4) * 0.4);
  const straws = picture(256, 256, (g, w, h) => {
    g.fillStyle = '#eaeaea'; g.fillRect(0, 0, w, h);
    const wrap = (x, y, far, draw) => { for (const ox of x < far ? [0, w] : x > w - far ? [0, -w] : [0]) for (const oy of y < far ? [0, h] : y > h - far ? [0, -h] : [0]) draw(x + ox, y + oy); };      // (so that it can lie side by side with itself)
    for (let i = 0; i < 70; i++) { const r = 12 + rnd() * 26, dark = rnd() < 0.5; wrap(rnd() * w, rnd() * h, r, (x, y) => { const q = g.createRadialGradient(x, y, 0, x, y, r); q.addColorStop(0, dark ? 'rgba(70,74,66,.16)' : 'rgba(255,255,255,.22)'); q.addColorStop(1, dark ? 'rgba(70,74,66,0)' : 'rgba(255,255,255,0)'); g.fillStyle = q; g.fillRect(x - r, y - r, r * 2, r * 2); }); }
    for (let i = 0; i < 1300; i++) {
      const l = 3 + rnd() * 7, lean = (rnd() - 0.5) * 4;
      g.strokeStyle = rnd() < 0.55 ? 'rgba(50,56,48,' + (0.05 + rnd() * 0.1).toFixed(2) + ')' : 'rgba(255,255,255,' + (0.1 + rnd() * 0.2).toFixed(2) + ')'; g.lineWidth = 1 + rnd() * 1.4;
      wrap(rnd() * w, rnd() * h, 12, (x, y) => { g.beginPath(); g.moveTo(x, y); g.lineTo(x + lean, y - l); g.stroke(); });
    }
  }, true);
  straws.anisotropy = 4;
  // a three-cornered piece of land, lying the right way up; colOf(corner, how it faces, the three corners) -> colour
  const tri = (B, p, q, r, colOf) => {
    const ux = q[0] - p[0], uy = q[1] - p[1], uz = q[2] - p[2], vx = r[0] - p[0], vy = r[1] - p[1], vz = r[2] - p[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    if (ny < 0) { [q, r] = [r, q]; nx = -nx; ny = -ny; nz = -nz; }
    const n = [nx, ny, nz];
    for (const v of [p, q, r]) B.vert(v[0], v[1], v[2], nx, ny, nz, v[0] / 4.5, v[2] / 4.5, colOf(v, n, p, q, r));
  };
  // Near the house the land has a picture of straws on it; far away it has not (seen from the valley the picture would
  // lie nearly edge-on on the steep sides, and flicker), and goes with the things that stand on the land.
  const landB = batch(), T = batch(), FAR = 72;
  const landCol = K => (v, n, p, q, r) => {
    const cx = (p[0] + q[0] + r[0]) / 3, cy = (p[1] + q[1] + r[1]) / 3, cz = (p[2] + q[2] + r[2]) / 3, d = Math.hypot(cx - CX, cz - CZ);
    let base;
    if (d < 60) base = grassAt(v[0], v[2]);                                                  // the valley floor: grass, smoothly
    else {
      const w = fbm(cx / 24 + 1.7, cz / 24 + 6.1);
      if (cy > 37 + w * 18 - (n[1] - 0.6) * 14) base = SNOW;                                // high up, and most where it is not too steep
      else if (cy > 19 + w * 14 || n[1] < 0.56) base = mix(ROCK, ROCK2, w);
      else base = noise(cx / 17 + 3, cz / 17 + 8) > 0.66 ? grassAt(cx, cz) : mix(WOODS, WOODS2, w);      // woods, with a clearing here and there
    }
    const L = lightOn(n[0], n[1], n[2]);
    return hazed([base[0] * L[0] * K, base[1] * L[1] * K, base[2] * L[2] * K], cx, cz);
  };
  const nearCol = landCol(LANDK), farCol = landCol(1);
  const land3 = (p, q, r) => { const far = Math.hypot((p[0] + q[0] + r[0]) / 3 - CX, (p[2] + q[2] + r[2]) / 3 - CZ) > FAR; tri(far ? T : landB, p, q, r, far ? farCol : nearCol); };
  {
    const RINGS = [3.5, 8, 13, 19, 26, 34, 43, 53, 64, 76, 89, 102, 115, 128, 141, 154, 166, 177, 187, 196], NT = 144;
    const grid = RINGS.map((r0, k) => Array.from({ length: NT }, (_, i) => {
      const loose = k > 5 && k < RINGS.length - 1 ? 1 : 0;                                   // the corners wander a little, so that it does not look ruled
      const a = (i + (k % 2) / 2 + loose * (hash(i, k) - 0.5) * 0.6) / NT * TAU, r = r0 + loose * (hash(i + 77, k + 31) - 0.5) * 0.45 * ((RINGS[k + 1] || r0) - r0);
      const x = CX + Math.cos(a) * r, z = CZ + Math.sin(a) * r;
      return [x, height(x, z), z];
    }));
    for (let k = 0; k + 1 < RINGS.length; k++) for (let i = 0; i < NT; i++) {
      const a0 = grid[k][i], a1 = grid[k][(i + 1) % NT], b0 = grid[k + 1][i], b1 = grid[k + 1][(i + 1) % NT];
      if (k % 2) { land3(a0, b1, b0); land3(a0, a1, b1); }      // (the rings stand half a step apart, turn and turn about)
      else { land3(a0, a1, b0); land3(a1, b1, b0); }
    }
  }
  // what lies on the grass: the trodden yard behind the house, the path to the barn, a lake in front
  const decalB = batch(), flatL = lightOn(0, 1, 0), onFlat = c => [c[0] * flatL[0] * LANDK, c[1] * flatL[1] * LANDK, c[2] * flatL[2] * LANDK];
  const grassHere = (x, z) => onFlat(grassAt(x, z)), dirtHere = (x, z) => onFlat(mix(DIRT, DIRT2, noise(x / 2.1 + 4, z / 2.1 + 1)));
  const DV = (x, z, c, lift = 0.02) => [x, GROUND + lift, z, c];
  const lay = (...ps) => { for (let i = 1; i + 1 < ps.length; i++) tri(decalB, ps[0], ps[i], ps[i + 1], v => v[3]); };      // a flat piece; each corner [x, y, z, colour]
  const pathX = z => DC - 5 * sstep(-13.5, -47, z);                // the path: straight out of the door to the gate, then over to the barn
  const LAKE = [CX - 13, D + 41, 25, 8.5], inLake = (x, z) => ((x - LAKE[0]) / (LAKE[2] * 1.25)) ** 2 + ((z - LAKE[1]) / (LAKE[3] * 1.4)) ** 2 < 1;
  {
    const n = 22, ring = (grass, f) => Array.from({ length: n }, (_, i) => { const a = i / n * TAU, w = 1 + (hash(i, grass ? 901 : 900) - 0.5) * 0.3, x = DC + Math.cos(a) * 8 * f * w, z = -6 + Math.sin(a) * 5.2 * f * w; return DV(x, z, grass ? grassHere(x, z) : dirtHere(x, z)); });
    const inner = ring(false, 0.66), outer = ring(true, 1), mid = DV(DC, -6, dirtHere(DC, -6));
    for (let i = 0; i < n; i++) { const j = (i + 1) % n; lay(mid, inner[i], inner[j]); lay(inner[i], outer[i], outer[j], inner[j]); }
    let prev = null;
    for (let z = -9; z >= -47.6; z -= 1.25) {
      const x = pathX(z) + (noise(z / 5, 3.3) - 0.5) * 0.5, wi = 0.62 + (hash(z * 8, 5) - 0.5) * 0.2, wo = wi + 0.55 + (hash(z * 8, 9) - 0.5) * 0.25;
      const row = [DV(x - wo, z, grassHere(x - wo, z), 0.03), DV(x - wi, z, dirtHere(x - wi, z), 0.03), DV(x + wi, z, dirtHere(x + wi, z), 0.03), DV(x + wo, z, grassHere(x + wo, z), 0.03)];
      if (prev) for (let i = 0; i < 3; i++) lay(prev[i], prev[i + 1], row[i + 1], row[i]);
      prev = row;
    }
    const [lx, lz, rx, rz] = LAKE, m = 30, rim = Array.from({ length: m }, (_, i) => { const a = i / m * TAU, w = 1 + (hash(i, 700) - 0.5) * 0.28; return [Math.cos(a) * rx * w, Math.sin(a) * rz * w]; });
    const SHORE = [0.27, 0.38, 0.6], WATER = [0.5, 0.64, 0.9], lmid = DV(lx, lz, WATER, 0.03);               // the sky lies in it
    for (let i = 0; i < m; i++) {
      const p = rim[i], q = rim[(i + 1) % m];
      const p1 = DV(lx + p[0], lz + p[1], SHORE, 0.03), q1 = DV(lx + q[0], lz + q[1], SHORE, 0.03), p0 = DV(lx + p[0] * 0.72, lz + p[1] * 0.72, WATER, 0.03), q0 = DV(lx + q[0] * 0.72, lz + q[1] * 0.72, WATER, 0.03);
      lay(lmid, p0, q0); lay(p0, p1, q1, q0);
    }
    // ... and the sun, as a streak of glitter on the line from the house towards it
    { const t = (lz - CZ) / SUN[2], gx = CX + SUN[0] * t, ux = SUN[0] / Math.hypot(SUN[0], SUN[2]), uz = SUN[2] / Math.hypot(SUN[0], SUN[2]), half = rz * 0.62, G0 = [1.9, 1.5, 1.0], G1 = [0.75, 0.75, 0.9];
      const P = (a, side, c) => DV(gx + ux * a - uz * side, lz + uz * a + ux * side, c, 0.04);
      lay(P(-half, 0, G1), P(-half * 0.2, 1.1, G1), P(half, 1.6, G1), P(half, -1.6, G1), P(-half * 0.2, -1.1, G1)); lay(P(-half * 0.8, 0, G0), P(0, 0.5, G0), P(half * 0.95, 0.7, G0), P(half * 0.95, -0.7, G0), P(0, -0.5, G0)); }
  }
  // shadows on the valley floor: of the house, and of what else stands there
  const shadowB = batch(), WHITE = [1, 1, 1];
  const hull = pts => {
    pts = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cr = (c, a, b) => (a[0] - c[0]) * (b[1] - c[1]) - (a[1] - c[1]) * (b[0] - c[0]);
    const half = list => { const h = []; for (const p of list) { while (h.length > 1 && cr(h[h.length - 2], h[h.length - 1], p) <= 0) h.pop(); h.push(p); } h.pop(); return h; };
    return half(pts).concat(half(pts.slice().reverse()));
  };
  const shadow = pts => {                                          // of a thing given by its corners: [x, how high above the ground, z]
    const h = hull(pts.map(p => [p[0] + p[1] * SX, p[2] + p[1] * SZ]));
    if (h.length < 3 || h.some(p => Math.hypot(p[0] - CX, p[1] - CZ) > 57)) return;      // (not on the hills: this is a flat sheet)
    for (let i = 1; i + 1 < h.length; i++) tri(shadowB, [h[0][0], GROUND + 0.045, h[0][1]], [h[i][0], GROUND + 0.045, h[i][1]], [h[i + 1][0], GROUND + 0.045, h[i + 1][1]], () => WHITE);
  };
  const boxShadow = (x0, z0, x1, z1, top) => shadow([[x0, 0, z0], [x1, 0, z0], [x1, 0, z1], [x0, 0, z1], [x0, top, z0], [x1, top, z0], [x1, top, z1], [x0, top, z1]]);
  { const e = H - GROUND, t = RIDGE - GROUND; shadow([[0, 0, 0], [W, 0, 0], [W, 0, D], [0, 0, D], [0, e, 0], [W, e, 0], [W, e, D], [0, e, D], [0, t, CZ], [W, t, CZ]]); }

  // ---------- what stands on the land ----------
  const OLD = [0.44, 0.37, 0.3], BARK = [0.2, 0.125, 0.08], DARKW = [0.2, 0.11, 0.06];
  const old = lit(wood(OLD, 0.2));
  const rail = (x0, y0, z0, x1, y1, z1, r = 0.045) => { const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0, l = Math.hypot(dx, dy, dz); T.add(new THREE.CylinderGeometry(r, r, l, 4, 1, true), along((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, dx, dy, dz), old); };
  // a fence of posts and two rails, from one place to another
  const fence = (x0, z0, x1, z1) => {
    const L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(L / 2.6));
    for (let i = 0; i <= n; i++) {
      const x = x0 + (x1 - x0) * i / n, z = z0 + (z1 - z0) * i / n, y = height(x, z);
      T.box(x, y + 0.62, z, 0.13, 1.3, 0.13, old);
      if (i < n) { const xb = x0 + (x1 - x0) * (i + 1) / n, zb = z0 + (z1 - z0) * (i + 1) / n, yb = height(xb, zb); for (const hh of [0.5, 0.98]) rail(x, y + hh + (hash(i, hh * 50) - 0.5) * 0.07, z, xb, yb + hh + (hash(i + 1, hh * 50) - 0.5) * 0.07, zb); }
    }
  };
  // the foot of the front wall, seen when one looks in from the front
  T.box(W / 2, GROUND / 2 - 0.005, D + 0.07, W + 0.3, -GROUND, 0.14, lit(wood(DARKW)));
  // the porch behind the door: boards, two steps down, posts and a little roof; a barrel and a bench
  {
    const PD = 2.6, deck = lit(wood([0.5, 0.36, 0.22], 0.22)), post = lit(wood([0.34, 0.2, 0.1]));
    for (let x = DC - 2.7; x < DC + 2.69; x += 0.27) T.box(x + 0.135, -0.06, -PD / 2, 0.255, 0.1, PD, deck);
    T.box(DC, -0.14, -PD - 0.02, 5.44, 0.17, 0.06, post);
    T.box(DC, -0.105, -PD - 0.25, 2.4, 0.09, 0.44, deck); T.box(DC, -0.17, -PD - 0.66, 2.4, 0.09, 0.44, deck);
    for (const s of [-1, 1]) T.box(DC + s * 2.55, 1.5, -PD + 0.12, 0.16, 3.02, 0.16, post);
    T.box(DC, 2.95, -PD + 0.12, 5.5, 0.16, 0.16, post);
    T.box(DC, 3.2, -PD / 2 - 0.22, 5.9, 0.07, PD + 0.36, lit(wood([0.3, 0.2, 0.12], 0.2)), -0.16);              // (it stops at the wall: nothing of it inside the room)
    const bx = DC + 1.95, bz = -0.75;
    T.cyl(bx, -0.01, bz, 0.3, 0.86, lit(wood([0.45, 0.28, 0.14], 0.25)), 12, 0.3); T.cyl(bx, 0.2, bz, 0.345, 0.5, lit(wood([0.5, 0.31, 0.15], 0.25)), 12, 0.345);
    for (const y of [0.16, 0.66]) T.cyl(bx, y, bz, 0.352, 0.05, lit([0.08, 0.08, 0.09]), 12);
    T.box(DC - 1.75, 0.44, -0.42, 1.5, 0.07, 0.4, deck); for (const s of [-1, 1]) T.box(DC - 1.75 + s * 0.62, 0.21, -0.42, 0.07, 0.44, 0.36, post);
    // a rail to tie a horse to
    for (const s of [-1, 1]) T.box(DC - 3.9 + s * 1.3, GROUND + 0.58, -5.4, 0.14, 1.2, 0.14, old);
    rail(DC - 5.4, GROUND + 1.05, -5.4, DC - 2.4, GROUND + 1.05, -5.4, 0.06);
  }
  // the fence round the yard, with a gateway where the path goes out: two tall posts, a log across and a board with a horseshoe
  const FX0 = -34, FX1 = W + 34, FZ0 = -13.5, FZ1 = D + 15.5, GW = 1.9;
  fence(FX0, FZ0, DC - GW, FZ0); fence(DC + GW, FZ0, FX1, FZ0); fence(FX0, FZ1, FX1, FZ1); fence(FX0, FZ0, FX0, FZ1); fence(FX1, FZ0, FX1, FZ1);
  {
    const log = lit(wood([0.4, 0.27, 0.16], 0.2));
    for (const s of [-1, 1]) { T.cyl(DC + s * GW, GROUND, FZ0, 0.16, 4.5, log, 8, 0.13); shadow([[DC + s * GW - 0.15, 0, FZ0], [DC + s * GW + 0.15, 0, FZ0], [DC + s * GW - 0.13, 4.5, FZ0], [DC + s * GW + 0.13, 4.5, FZ0]]); }
    T.rod(DC - GW - 0.7, GROUND + 4.2, FZ0, DC + GW + 0.7, GROUND + 4.2, FZ0, 0.13, log, 8);
    for (const s of [-1, 1]) T.rod(DC + s * 0.8, GROUND + 4.1, FZ0, DC + s * 0.8, GROUND + 3.72, FZ0, 0.018, lit([0.08, 0.08, 0.09]), 4);
    T.box(DC, GROUND + 3.47, FZ0, 2.0, 0.52, 0.07, lit(wood([0.5, 0.36, 0.22], 0.2)));
    T.add(new THREE.TorusGeometry(0.15, 0.036, 5, 12, 4.4), at(DC, GROUND + 3.48, FZ0 + 0.045, 0, 0, Math.PI - 0.63), lit([0.1, 0.1, 0.11]));
  }
  // the corral, and three horses in it
  const COR = [DC - 16, -30, DC - 4, -18];
  fence(COR[0], COR[1], COR[2], COR[1]); fence(COR[2], COR[1], COR[2], COR[3]); fence(COR[2], COR[3], COR[0], COR[3]); fence(COR[0], COR[3], COR[0], COR[1]);
  const PM = new THREE.Matrix4(), LM = new THREE.Matrix4(), V3 = new THREE.Vector3();
  const horse = (x, z, yaw, coat, hair, graze) => {
    PM.makeRotationY(yaw).scale(V3.set(0.95, 0.95, 0.95)).setPosition(x, GROUND, z);
    const put = (geo, m, c = coat) => T.add(geo, LM.multiplyMatrices(PM, m), lit(c));
    put(new THREE.SphereGeometry(0.5, 10, 7), at(0, 1.3, 0, 0, 0, 0, 1.22, 0.8, 0.72));                                   // the barrel
    put(new THREE.SphereGeometry(0.4, 8, 6), at(0.44, 1.36, 0, 0, 0, 0, 1, 1.05, 0.86));                                   // the chest
    put(new THREE.SphereGeometry(0.43, 8, 6), at(-0.42, 1.38, 0, 0, 0, 0, 1, 1, 0.9));                                     // the rump
    const nb = graze ? [0.62, 1.34] : [0.62, 1.5], nd = graze ? [0.62, -0.78] : [0.52, 0.85], nl = 0.86, nt = [nb[0] + nd[0] * nl, nb[1] + nd[1] * nl];
    put(new THREE.CylinderGeometry(0.14, 0.25, nl + 0.1, 8), along(nb[0] + nd[0] * nl / 2, nb[1] + nd[1] * nl / 2, 0, nd[0], nd[1], 0));      // the neck
    const hd = graze ? [0.35, -0.94] : [0.8, -0.6], hl = 0.56, ux = -hd[1], uy = hd[0];                                      // the head, and which way is up on it
    put(new THREE.CylinderGeometry(0.08, 0.155, hl, 8), along(nt[0] + hd[0] * hl * 0.42, nt[1] + hd[1] * hl * 0.42, 0, hd[0], hd[1], 0));
    for (const s of [-1, 1]) put(new THREE.ConeGeometry(0.045, 0.15, 5), along(nt[0] + ux * 0.14 - hd[0] * 0.07, nt[1] + uy * 0.14 - hd[1] * 0.07, s * 0.08, ux, uy, s * 0.25));
    put(new THREE.BoxGeometry(0.1, nl * 0.95, 0.06), along(nb[0] + nd[0] * nl / 2 - nd[1] * 0.2, nb[1] + nd[1] * nl / 2 + nd[0] * 0.2, 0, nd[0], nd[1], 0), hair);      // the mane
    for (const lx of [0.46, -0.5]) for (const s of [-1, 1]) {
      put(new THREE.CylinderGeometry(0.09, 0.055, 1.0, 6), at(lx, 0.55, s * 0.17));
      put(new THREE.CylinderGeometry(0.065, 0.075, 0.1, 6), at(lx, 0.05, s * 0.17), [0.05, 0.04, 0.035]);
    }
    put(new THREE.CylinderGeometry(0.1, 0.05, 0.85, 6), along(-0.97, 1.08, 0, -0.28, -0.96, 0), hair);                         // the tail
    const c = Math.cos(yaw) * 0.95, s2 = Math.sin(yaw) * 0.95, at2 = (lx, ly, lz) => [x + lx * c + lz * s2, ly * 0.95, z - lx * s2 + lz * c];
    shadow([at2(-0.9, 0.1, -0.2), at2(0.9, 0.1, 0.2), at2(-0.9, 0.1, 0.2), at2(0.9, 0.1, -0.2), at2(-0.85, 1.7, -0.3), at2(0.8, 1.7, 0.3), at2(-0.85, 1.7, 0.3), at2(0.8, 1.7, -0.3), at2(nt[0] + 0.3, Math.max(0.2, nt[1]), 0)]);
  };
  horse(DC - 12.5, -22.5, 0.5, [0.21, 0.1, 0.05], [0.04, 0.03, 0.025], false);
  horse(DC - 8, -26, -2.3, [0.055, 0.047, 0.045], [0.025, 0.022, 0.022], true);
  horse(DC - 6.6, -20.6, 2.5, [0.46, 0.33, 0.16], [0.62, 0.56, 0.44], true);
  // the barn where the path ends: red boards, pale trim, a hay loft over the big door
  {
    const bx = DC - 5, bz = -52, bw = 12, bd = 9, bh = 4.7, rh = 3.5, fz = bz + bd / 2, y0 = GROUND - 0.1;
    const RED = lit([0.26, 0.055, 0.04]), TRIM = lit([0.9, 0.84, 0.7]), ROOF = lit([0.2, 0.2, 0.24]), DIM = lit([0.045, 0.04, 0.04]);
    T.box(bx, y0 + bh / 2, bz, bw, bh, bd, RED);
    for (const s of [1, -1]) for (const [x, y] of [[bx - s * bw / 2, y0 + bh], [bx + s * bw / 2, y0 + bh], [bx, y0 + bh + rh]]) T.vert(x, y, bz + s * bd / 2, 0, 0, s, 0, 0, RED(x, y, bz + s * bd / 2, { x: 0, y: 0, z: s }));
    const ang = Math.atan2(rh, bw / 2), run = Math.hypot(rh, bw / 2) + 0.7;
    for (const s of [-1, 1]) T.box(bx + s * (bw / 4 + 0.3), y0 + bh + rh / 2 - 0.11, bz, run, 0.14, bd + 1.2, ROOF, 0, 0, -s * ang);
    T.box(bx, y0 + 1.85, fz + 0.04, 3.6, 3.5, 0.08, lit([0.21, 0.05, 0.035]));
    for (const [dx, w, h, dy] of [[0, 3.86, 0.14, 3.6], [-1.86, 0.14, 3.6, 1.85], [1.86, 0.14, 3.6, 1.85], [0, 0.1, 3.5, 1.85]]) T.box(bx + dx, y0 + dy, fz + 0.09, w, h, 0.05, TRIM);
    for (const s of [-1, 1]) for (const k of [-1, 1]) T.box(bx + s * 0.93, y0 + 1.85, fz + 0.085, 0.1, 3.85, 0.04, TRIM, 0, 0, k * 0.46);
    T.box(bx, y0 + bh + 1.05, fz + 0.04, 1.3, 1.4, 0.08, DIM);
    for (const [dx, w, h, dy] of [[0, 1.5, 0.12, 1.8], [0, 1.5, 0.12, 0.3], [-0.7, 0.12, 1.5, 1.05], [0.7, 0.12, 1.5, 1.05]]) T.box(bx + dx, y0 + bh + dy, fz + 0.09, w, h, 0.05, TRIM);
    for (const s of [-1, 1]) T.box(bx + s * (bw / 2 - 0.07), y0 + bh / 2, fz + 0.03, 0.16, bh, 0.06, TRIM);
  }
  // the mill that pumps water: a tower of thin legs, a wheel that turns in the wind (a mesh of its own), a tail; and the tank beside it
  const flat = new THREE.MeshBasicMaterial({ vertexColors: true });
  let wheel;
  {
    const mx = DC + 7, mz = -28, TOP = 9.4, hy = GROUND + TOP + 0.95, GALV = lit([0.5, 0.52, 0.57]), C4 = [[-1, -1], [1, -1], [1, 1], [-1, 1]], LV = [0.06, 0.34, 0.62, 0.9];
    const leg = (sx, sz, t) => [mx + sx * (1.2 - 0.95 * t), GROUND + TOP * t, mz + sz * (1.2 - 0.95 * t)];
    for (const [sx, sz] of C4) T.rod(...leg(sx, sz, 0), ...leg(sx, sz, 1), 0.05, GALV, 5);
    LV.forEach((t, j) => C4.forEach((c, i) => { const d = C4[(i + 1) % 4]; T.rod(...leg(...c, t), ...leg(...d, t), 0.03, GALV, 4); if (j + 1 < LV.length) T.rod(...leg(...c, t), ...leg(...d, LV[j + 1]), 0.022, GALV, 4); }));
    T.box(mx, GROUND + TOP + 0.04, mz, 1.0, 0.08, 1.0, old);
    T.cyl(mx, GROUND + TOP, mz, 0.07, 1.05, GALV, 6);
    T.rod(mx, hy, mz + 0.3, mx, hy, mz - 2.2, 0.035, GALV, 5);
    T.box(mx, hy, mz - 2.3, 0.03, 0.85, 1.15, GALV); T.box(mx, hy, mz - 2.76, 0.045, 0.85, 0.24, lit([0.55, 0.1, 0.07]));
    const WB = batch(), M1 = new THREE.Matrix4(), M2 = new THREE.Matrix4();
    const metal = (x, y, z, n) => { const L = lightOn(n.x, n.y, n.z); return [0.5 * L[0], 0.52 * L[1], 0.57 * L[2]]; };
    for (let i = 0; i < 16; i++) WB.add(new THREE.BoxGeometry(0.3, 1.2, 0.02), M1.makeRotationZ(i / 16 * TAU).multiply(M2.makeTranslation(0, 1.08, 0)).multiply(M2.makeRotationY(0.4)), metal);
    WB.add(new THREE.TorusGeometry(1.7, 0.03, 4, 28), at(0, 0, 0), metal); WB.add(new THREE.TorusGeometry(0.48, 0.03, 4, 16), at(0, 0, 0), metal);
    WB.add(new THREE.CylinderGeometry(0.11, 0.11, 0.34, 8), at(0, 0, 0, Math.PI / 2, 0, 0), metal);
    wheel = WB.mesh(flat, group, 'millwheel'); wheel.matrixAutoUpdate = true; wheel.position.set(mx, hy, mz + 0.42); wheel.renderOrder = 13;
    const tx = mx + 3.4, tz = mz - 1.2, stave = lit(wood([0.5, 0.37, 0.24], 0.25));
    for (const [sx, sz] of C4) T.box(tx + sx * 0.8, GROUND + 0.95, tz + sz * 0.8, 0.14, 1.9, 0.14, old);
    T.cyl(tx, GROUND + 1.9, tz, 1.25, 1.5, stave, 14, 1.3); T.cyl(tx, GROUND + 3.4, tz, 1.38, 0.5, lit([0.26, 0.22, 0.2]), 14, 0.08);
    for (const y of [2.2, 3.1]) T.cyl(tx, GROUND + y, tz, 1.3, 0.06, lit([0.08, 0.08, 0.09]), 14);
  }
  // pines: three skirts and a trunk near by, a single cone far away; never where something else is
  const pines = [];
  const clearAt = (x, z) => {
    if (x > -11 && x < W + 11 && z > -9 && z < D + 16) return false;                         // the house, and the ground in front of it where the camera may be
    if (x > -14 && x < W + 14 && z >= D + 16 && z < LAKE[1] + 14) return false;              // open grass from the front windows down to the lake
    if (z < 0 && z > -50 && Math.abs(x - pathX(z)) < 3.4) return false;                      // the path
    if (x > COR[0] - 1.5 && x < COR[2] + 1.5 && z > COR[1] - 1.5 && z < COR[3] + 1.5) return false;
    if (Math.hypot(x - DC + 5, z + 52) < 10.5 || Math.hypot(x - DC - 8.5, z + 28.5) < 4.5 || inLake(x, z)) return false;
    return pines.every(p => Math.hypot(p[0] - x, p[1] - z) > 3.2);
  };
  const pine = (x, z, h, far) => {
    const y = height(x, z), r = h * (0.2 + rnd() * 0.05), k = 0.8 + rnd() * 0.5, g = [0.055 * k, 0.15 * k, 0.07 * k];
    if (far) { T.add(new THREE.CylinderGeometry(0, r * 1.1, h, 5, 1, true), at(x, y + h / 2 + 0.2, z, 0, rnd() * 6, 0), lit(g)); return; }
    pines.push([x, z]);
    T.cyl(x, y, z, h * 0.028, h * 0.3, lit(BARK), 6, h * 0.02);
    for (let i = 0; i < 3; i++) {
      const hh = h * (0.47 - i * 0.06), yb = y + h * (0.15 + i * 0.25);
      T.add(new THREE.CylinderGeometry(0, r * (1 - i * 0.26), hh, 7), at(x, yb + hh / 2, z, 0, rnd() * 6, 0), lit((px, py, pz, n) => { const t = n.y < -0.5 ? 0.4 : 0.62 + 0.5 * (1 - (py - yb) / hh); return [g[0] * t, g[1] * t, g[2] * t]; }));
    }
    if (y < GROUND + 0.05 && !inShade(x, GROUND + h * 0.4, z)) shadow([[x - r, h * 0.17, z], [x + r, h * 0.17, z], [x, h * 0.17, z - r], [x, h * 0.17, z + r], [x, h, z], [x - 0.25, 0, z], [x + 0.25, 0, z]]);
  };
  for (const [x, z, h] of [[-17, 2.5, 12], [-23, 10, 14.5], [-14, 15.5, 10], [-29, -5, 13], [W + 15, 1, 13], [W + 21, 8.5, 11], [W + 13, 14, 14], [W + 27, -3, 12],
    [3, -19, 13], [-6, -15.5, 11], [W + 6, -17, 12.5], [W - 2, -21, 10], [-17, D + 19, 12], [-22, D + 31, 10.5], [W + 16, D + 20, 13], [W + 21, D + 32, 11], [-9, D + 62, 12], [W - 6, D + 60, 13.5]]) pine(x, z, h, false);
  for (let i = 0; i < 400 && pines.length < 96; i++) { const a = rnd() * TAU, r = 22 + rnd() * 58, x = CX + Math.cos(a) * r, z = CZ + Math.sin(a) * r; if (clearAt(x, z) && noise(x / 19 + 2, z / 19 + 7) > 0.42) pine(x, z, 8 + rnd() * 6.5, false); }
  for (let i = 0; i < 900; i++) { const a = rnd() * TAU, r = 66 + rnd() * 74, x = CX + Math.cos(a) * r, z = CZ + Math.sin(a) * r; if (height(x, z) < 21 && noise(x / 17 + 3, z / 17 + 8) <= 0.66) pine(x, z, 7 + rnd() * 6, true); }

  // ---------- the sky: a dome, the sun and its glow, clouds that drift, two birds that sail round ----------
  const skyB = batch(); skyB.add(new THREE.SphereGeometry(R, 36, 24), at(CX, 0, CZ), (x, y, z) => skyAt((x - CX) / R, y / R, (z - CZ) / R));
  const sunB = batch(), sp = new THREE.Vector3(CX + SUN[0] * (R - 10), SUN[1] * (R - 10), CZ + SUN[2] * (R - 10));
  for (const [rad, c] of [[52, [0.5, 0.27, 0.1]], [16, [1.3, 0.85, 0.38]], [6, [7, 5.6, 3.6]]]) sunB.add(new THREE.RingGeometry(0.01, rad, 30, 6), new THREE.Matrix4().lookAt(new THREE.Vector3(CX, 0, CZ), sp, new THREE.Vector3(0, 1, 0)).setPosition(sp), (x, y, z) => { const f = Math.max(0, 1 - Math.hypot(x - sp.x, y - sp.y, z - sp.z) / rad) ** 2; return [c[0] * f, c[1] * f, c[2] * f]; });
  const cloudB = batch(), cloudCol = (x, y, z, n) => { const l = clamp(n.y * 0.55 + 0.45 + (n.x * SUN[0] + n.z * SUN[2]) * 0.2, 0, 1); return [0.5 + 1.2 * l, 0.5 + 0.95 * l, 0.68 + 0.6 * l]; };
  for (let i = 0; i < 13; i++) {
    const a = i / 13 * TAU + rnd() * 0.35, r = 120 + rnd() * 75, y = 55 + rnd() * 55, s = 9 + rnd() * 9, n = 4 + (rnd() * 3 | 0);
    for (let j = 0; j < n; j++) { const u = (j - (n - 1) / 2) / n * 2.6, rr = s * (1 - Math.abs(u) * 0.38) * (0.75 + rnd() * 0.4); cloudB.ball(Math.cos(a) * r - Math.sin(a) * u * s, y + rr * 0.3 + rnd() * 2, Math.sin(a) * r + Math.cos(a) * u * s, rr, cloudCol, 1.25, 0.56, 1, 8); }
  }
  const birdB = batch(), DUSK = [0.07, 0.055, 0.05];
  birdB.box(0, 0, 0, 0.17, 0.11, 0.66, DUSK); birdB.box(0, 0, -0.44, 0.3, 0.02, 0.26, DUSK);
  for (const s of [-1, 1]) { birdB.box(s * 0.66, 0.05, 0.03, 1.22, 0.025, 0.4, DUSK, 0, 0, s * 0.13); birdB.box(s * 1.45, 0.2, -0.03, 0.56, 0.02, 0.28, DUSK, 0, s * 0.25, s * 0.36); }

  // ---------- into meshes (drawn after the room, so that what the walls hide costs nothing) ----------
  const sky = skyB.mesh(new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, depthWrite: false }), group, 'sky'); sky.renderOrder = 10;
  const sun = sunB.mesh(new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }), group, 'sun'); sun.renderOrder = 10;
  const land = landB.mesh(new THREE.MeshBasicMaterial({ vertexColors: true, map: straws }), group, 'land'); land.renderOrder = 11;
  const decals = decalB.mesh(new THREE.MeshBasicMaterial({ vertexColors: true, map: straws, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -8 }), group, 'paths'); decals.renderOrder = 12;
  // the shadows darken what they fall on, each place once only however many of them lie there
  const shadows = shadowB.mesh(new THREE.MeshBasicMaterial({ color: new THREE.Color(0.36, 0.43, 0.62), blending: THREE.MultiplyBlending, transparent: true, depthWrite: false, toneMapped: false,
    stencilWrite: true, stencilRef: 1, stencilFunc: THREE.NotEqualStencilFunc, stencilZPass: THREE.ReplaceStencilOp, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -12 }), group, 'shadows'); shadows.renderOrder = 12;
  const things = T.mesh(flat, group, 'ranch'); things.renderOrder = 13;
  const clouds = new THREE.Group(); clouds.position.set(CX, 0, CZ); group.add(clouds);
  const cloudMesh = cloudB.mesh(flat, clouds, 'clouds'); cloudMesh.renderOrder = 13;
  const birds = [[DC - 12, -44, 24, 27, 0.16, 0], [-30, 22, 17, 36, -0.13, 2]].map(([cx, cz, r, y, w, a0]) => {
    const m = new THREE.Mesh(birds0(), flat); m.renderOrder = 13; m.scale.setScalar(1.35); group.add(m);
    return { m, cx, cz, r, y, w, a0 };
  });
  function birds0() { return birds0.g || (birds0.g = birdB.mesh(flat).geometry); }
  const meshes = [sky, sun, land, decals, shadows, things, cloudMesh, wheel];

  return {
    group,
    tick(dt, t) {
      wheel.rotation.z = -t * 1.3;
      clouds.rotation.y = t * 0.004;
      birds.forEach((b, i) => { const a = t * b.w + b.a0; b.m.position.set(b.cx + Math.cos(a) * b.r, b.y + Math.sin(a * 0.37 + i) * 2, b.cz + Math.sin(a) * b.r); b.m.rotation.set(0, (b.w < 0 ? Math.PI : 0) - a, b.w < 0 ? 0.32 : -0.32); });
    },
    dispose() { for (const m of meshes) { m.geometry.dispose(); if (m.material !== flat) m.material.dispose(); } birds0().dispose(); flat.dispose(); straws.dispose(); },
  };
}
