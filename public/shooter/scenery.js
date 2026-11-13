// SLQ Game Lobby — what makes the shooter's arena look alive. The arena itself (world.js) is walls, floors and
// stairs: boxes, because that is what one walks on and hides behind. This file dresses it up, in the browser
// only: hedges and trees of leaves that move in the wind, a meadow with tufts, flowers and worn paths, paving in
// the two teams' yards, houses with roof timbers, shutters, flower boxes and smoking chimneys, a vaulted tunnel
// with lamps, flags on the towers, the steam train, a town around it all, a sky with clouds, birds and butterflies.
//
// Nothing here can be walked on, bumped into or hit: that is decided by world.js alone, and the server never
// loads this file. world.js notes what there is to dress up in `world.decor` (and leaves out its own plain
// picture of those things); dressWorld() reads that. Everything is built once, into a few big meshes.
import { mulberry32 } from '../shared/util.js';

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, k) => a + (b - a) * k;
const sstep = (a, b, x) => { const k = clamp((x - a) / (b - a), 0, 1); return k * k * (3 - 2 * k); };
function hash3(x, y, z) { let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 1440670441); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
// soft noise, 0..1, the same for everybody
export function noise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), fx = x - xi, fy = y - yi, fz = z - zi;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
  const a = lerp(lerp(hash3(xi, yi, zi), hash3(xi + 1, yi, zi), u), lerp(hash3(xi, yi + 1, zi), hash3(xi + 1, yi + 1, zi), u), v);
  const b = lerp(lerp(hash3(xi, yi, zi + 1), hash3(xi + 1, yi, zi + 1), u), lerp(hash3(xi, yi + 1, zi + 1), hash3(xi + 1, yi + 1, zi + 1), u), v);
  return lerp(a, b, w);
}

// world: buildWorld()'s answer (with `decor`). texLib: makeTextures(). opt: { anisotropy: the renderer's best
// filtering for pictures seen at a slant }. Returns { tick(dt, t), setDetail(n), smokers, meshes, haze (the colour
// of the horizon, for the fog) }.
export function dressWorld(THREE, scene, world, texLib, opt = {}) {
  const D = world.decor, TEX = texLib.TEX, rnd = mulberry32(20261112), time = { value: 0 }, ANISO = Math.min(8, opt.anisotropy || 1);
  const V = new THREE.Vector3(), V2 = new THREE.Vector3(), Q = new THREE.Quaternion(), E = new THREE.Euler(), S3 = new THREE.Vector3(), M4 = new THREE.Matrix4(), UP = new THREE.Vector3(0, 1, 0);
  const WHITE = [1, 1, 1];
  // where a shape goes: place, turning (radians about x, y, z) and size
  const at = (x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) => M4.compose(V.set(x, y, z), Q.setFromEuler(E.set(rx, ry, rz)), S3.set(sx, sy, sz));
  // ... or standing at a place and pointing along a line (a beam, a trunk)
  const along = (x, y, z, dx, dy, dz, sx = 1, sy = sx, sz = sx) => M4.compose(V.set(x, y, z), Q.setFromUnitVectors(UP, V2.set(dx, dy, dz).normalize()), S3.set(sx, sy, sz));

  // ---------- many shapes in one mesh ----------
  // Every corner carries a colour (multiplied with the picture on the material) and how much it moves in the wind.
  function makeBatch() {
    const P = [], N = [], U = [], C = [], S = [], v = new THREE.Vector3(), n = new THREE.Vector3(), nm = new THREE.Matrix3();
    return {
      vert(x, y, z, nx, ny, nz, u, w, c, s) { P.push(x, y, z); N.push(nx, ny, nz); U.push(u, w); C.push(c[0], c[1], c[2]); S.push(s || 0); },
      // a shape, placed with a matrix. o: { col: [r, g, b] or (x, y, z, n) => [r, g, b], sway: number or (x, y, z) => number,
      // uv: metres per repeat of the picture (laid on by the way each face looks) }
      add(geo, m, o = {}) {
        const g = geo.index ? geo.toNonIndexed() : geo, p = g.attributes.position, nn = g.attributes.normal, t = g.attributes.uv;
        nm.getNormalMatrix(m);
        for (let i = 0; i < p.count; i++) {
          v.fromBufferAttribute(p, i).applyMatrix4(m); n.fromBufferAttribute(nn, i).applyMatrix3(nm).normalize();
          P.push(v.x, v.y, v.z); N.push(n.x, n.y, n.z);
          if (o.uv) { const k = 1 / o.uv; if (Math.abs(n.y) > 0.7) U.push(v.x * k, v.z * k); else if (Math.abs(n.x) > Math.abs(n.z)) U.push(v.z * k, v.y * k); else U.push(v.x * k, v.y * k); }
          else U.push(t ? t.getX(i) : 0, t ? t.getY(i) : 0);
          const c = typeof o.col === 'function' ? o.col(v.x, v.y, v.z, n) : o.col || WHITE;
          C.push(c[0], c[1], c[2]);
          S.push(typeof o.sway === 'function' ? o.sway(v.x, v.y, v.z) : o.sway || 0);
        }
        if (g !== geo) g.dispose();
        geo.dispose();
      },
      get size() { return P.length / 9; },
      mesh(material, o = {}) {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
        g.setAttribute('aSway', new THREE.Float32BufferAttribute(S, 1));
        const mesh = new THREE.Mesh(g, material);
        mesh.castShadow = !!o.cast; mesh.receiveShadow = o.receive !== false; mesh.matrixAutoUpdate = false; mesh.name = o.name || '';
        if (o.order != null) mesh.renderOrder = o.order;
        scene.add(mesh);
        return mesh;
      },
    };
  }

  // ---------- materials ----------
  // wind: every corner with a sway moves a little, in waves that travel across the arena
  function windy(material) {
    material.onBeforeCompile = sh => {
      sh.uniforms.uTime = time;
      sh.vertexShader = 'uniform float uTime;\nattribute float aSway;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        float wph = uTime * 1.25 + transformed.x * 0.31 + transformed.z * 0.23;
        transformed.x += (sin(wph) * 0.07 + sin(wph * 2.9 + transformed.y * 1.7) * 0.018) * aSway;
        transformed.z += (cos(wph * 0.83) * 0.05 + cos(wph * 3.3 + transformed.y * 1.3) * 0.014) * aSway;`);
    };
    return material;
  }
  const picture = draw => { const t = texLib.makeTex(draw); t.anisotropy = ANISO; return t; };
  const copyOf = t => { const c = t.clone(); c.repeat.set(1, 1); c.anisotropy = ANISO; c.needsUpdate = true; return c; };
  // leaves: small pointed ovals in many greens over dark gaps
  const leafTex = picture((g, w, h) => {
    g.fillStyle = '#1c3314'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 1500; i++) {
      const x = rnd() * w, y = rnd() * h, a = rnd() * 6.283, l = 5 + rnd() * 6, k = 0.55 + rnd() * 0.75, yel = rnd() * 0.35;
      for (const [ox, oy] of [[0, 0], [w, 0], [-w, 0], [0, h], [0, -h]]) {
        g.save(); g.translate(x + ox, y + oy); g.rotate(a);
        g.fillStyle = 'rgb(' + (52 + yel * 70) * k + ',' + 104 * k + ',' + (36 - yel * 20) * k + ')';
        g.beginPath(); g.ellipse(0, 0, l, l * 0.45, 0, 0, 6.283); g.fill();
        g.strokeStyle = 'rgba(190,230,130,0.28)'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(-l * 0.8, 0); g.lineTo(l * 0.8, 0); g.stroke();
        g.restore();
      }
    }
  });
  // small strokes every which way in light greys: grass when the corners are green, earth when they are brown, gravel when grey
  const turfTex = picture((g, w, h) => {
    g.fillStyle = '#cdcdc2'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 4200; i++) {
      const x = rnd() * w, y = rnd() * h, a = rnd() * 6.283, l = 2 + rnd() * 5, k = rnd();
      g.strokeStyle = k < 0.5 ? 'rgba(60,66,50,' + (0.08 + rnd() * 0.2).toFixed(2) + ')' : 'rgba(255,255,240,' + (0.1 + rnd() * 0.22).toFixed(2) + ')';
      g.lineWidth = 1 + rnd() * 1.2; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
    }
    for (let i = 0; i < 500; i++) { g.fillStyle = 'rgba(' + (rnd() < 0.5 ? '40,44,30' : '255,255,245') + ',' + (0.1 + rnd() * 0.18).toFixed(2) + ')'; g.beginPath(); g.arc(rnd() * w, rnd() * h, 1 + rnd() * 2.5, 0, 6.283); g.fill(); }
  });
  // stones laid in rows, each a little different, with dark joints
  const paveTex = picture((g, w, h) => {
    g.fillStyle = '#5d5a55'; g.fillRect(0, 0, w, h);
    const rows = 8, rh = h / rows;
    for (let r = 0; r < rows; r++) {
      let x = -rnd() * 30;
      while (x < w) {
        const bw = 26 + rnd() * 22, k = 150 + rnd() * 70 | 0;
        g.fillStyle = 'rgb(' + k + ',' + (k - 3) + ',' + (k - 9) + ')';
        g.beginPath(); g.roundRect(x + 1.5, r * rh + 1.5, bw - 3, rh - 3, 4); g.fill();
        g.fillStyle = 'rgba(255,255,255,0.1)'; g.fillRect(x + 4, r * rh + 3, bw - 9, 2);
        x += bw;
      }
    }
    for (let i = 0; i < 900; i++) { g.fillStyle = 'rgba(' + (rnd() < 0.5 ? '0,0,0' : '255,255,255') + ',' + (rnd() * 0.08).toFixed(3) + ')'; g.fillRect(rnd() * w, rnd() * h, 2, 2); }
  });
  // leaves and blades are seen from both sides and lit the same from both (the corner's own way of facing counts)
  const bothSides = material => { const first = material.onBeforeCompile; material.onBeforeCompile = sh => { first(sh); sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n\tnormal = normalize( vNormal );'); }; return material; };
  const leafMat = bothSides(windy(new THREE.MeshLambertMaterial({ map: leafTex, vertexColors: true, side: THREE.DoubleSide })));
  const bladeMat = bothSides(windy(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })));
  const solidMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
  const turfMat = new THREE.MeshStandardMaterial({ map: turfTex, vertexColors: true, roughness: 1, metalness: 0 });
  const paveMat = new THREE.MeshStandardMaterial({ map: paveTex, vertexColors: true, roughness: 0.95, metalness: 0 });
  const leaves = makeBatch(), twigs = makeBatch(), solid = makeBatch(), turf = makeBatch(), pave = makeBatch(), blades = makeBatch();

  // ---------- leaves ----------
  // A block of leaves: a box with rounded edges and a bumpy skin (a hedge, a bush). It stands on the ground at y0.
  // o: cell (how fine), round, amp (how bumpy), bush (how much the top heaves), tint, sway
  function leafBlock(x0, x1, z0, z1, y0, y1, o = {}) {
    const cell = o.cell || 0.5, h = y1 - y0, hx = (x1 - x0) / 2, hz = (z1 - z0) / 2, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const r = Math.min(o.round || 0.45, hx, hz, h * 0.6), amp = o.amp == null ? 0.2 : o.amp, bush = o.bush || 0, tint = o.tint || WHITE, sw = o.sway == null ? 0.5 : o.sway, seed = rnd() * 50;
    const nx = Math.max(2, Math.round(2 * hx / cell)), ny = Math.max(2, Math.round(h / cell)), nz = Math.max(2, Math.round(2 * hz / cell));
    const bump = (x, y, z, up) => amp * (noise(x * 0.8 + seed, y * 0.8, z * 0.8) * 0.95 + noise(x * 2.3, y * 2.3 + seed, z * 2.3) * 0.45 - 0.5) + (up > 0 ? bush * up * noise(x * 0.42, seed, z * 0.42) : 0);
    const out = [0, 0, 0, 0, 0, 0];
    // a point on the box's own skin (from its middle; y from the ground) → the leaf there and the way it faces
    const skin = (px, py, pz) => {
      const qx = clamp(px, -hx + r, hx - r), qz = clamp(pz, -hz + r, hz - r), qy = Math.min(py, h - r);
      let dx = px - qx, dy = py - qy, dz = pz - qz;
      const len = Math.hypot(dx, dy, dz) || 1;
      dx /= len; dy /= len; dz /= len;
      const sx = cx + qx + dx * r, sy = y0 + qy + dy * r, sz = cz + qz + dz * r;
      // two ways along the skin, to see how the bumps lean
      let ax = -dz, ay = 0, az = dx; const al = Math.hypot(ax, az);
      if (al < 1e-4) { ax = 1; az = 0; } else { ax /= al; az /= al; }
      const bx = dy * az - dz * ay, by = dz * ax - dx * az, bz = dx * ay - dy * ax, e = 0.12;
      const a = bump(sx, sy, sz, dy), ga = (bump(sx + ax * e, sy + ay * e, sz + az * e, dy) - bump(sx - ax * e, sy - ay * e, sz - az * e, dy)) / (2 * e), gb = (bump(sx + bx * e, sy + by * e, sz + bz * e, dy) - bump(sx - bx * e, sy - by * e, sz - bz * e, dy)) / (2 * e);
      let fx = dx - ga * ax - gb * bx, fy = dy - ga * ay - gb * by, fz = dz - ga * az - gb * bz; const fl = Math.hypot(fx, fy, fz) || 1;
      out[0] = sx + dx * a; out[1] = Math.max(y0, sy + dy * a); out[2] = sz + dz * a; out[3] = fx / fl; out[4] = fy / fl; out[5] = fz / fl;
      return out;
    };
    const corner = (px, py, pz) => {
      const s = skin(px, py, pz), x = s[0], y = s[1], z = s[2], rel = (y - y0) / h;
      const k = (0.6 + 0.55 * noise(x * 0.5 + 9, y * 0.5, z * 0.5)) * (0.66 + 0.34 * Math.min(1, rel / 0.5)), warm = noise(x * 0.21, 5, z * 0.21);
      return [x, y, z, s[3], s[4], s[5], x * 0.4 + y * 0.23, z * 0.4 + y * 0.31, [k * (0.84 + warm * 0.36) * tint[0], k * tint[1], k * (0.84 - warm * 0.3) * tint[2]], sw * (0.15 + 0.85 * rel)];
    };
    const tri = (a, b, c) => { for (const q of [a, b, c]) leaves.vert(q[0], q[1], q[2], q[3], q[4], q[5], q[6], q[7], q[8], q[9]); };
    // a sheet of the skin: f(i, j) gives the box point; it is turned so that it faces outwards
    const sheet = (n1, n2, f) => {
      const g = [];
      for (let j = 0; j <= n2; j++) for (let i = 0; i <= n1; i++) { const p = f(i / n1, j / n2); g.push(corner(p[0], p[1], p[2])); }
      for (let j = 0; j < n2; j++) for (let i = 0; i < n1; i++) {
        const a = g[j * (n1 + 1) + i], b = g[j * (n1 + 1) + i + 1], c = g[(j + 1) * (n1 + 1) + i + 1], d = g[(j + 1) * (n1 + 1) + i];
        const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
        const fwd = (uy * vz - uz * vy) * a[3] + (uz * vx - ux * vz) * a[4] + (ux * vy - uy * vx) * a[5] > 0;
        if (fwd) { tri(a, b, c); tri(a, c, d); } else { tri(a, c, b); tri(a, d, c); }
      }
    };
    // sprigs: a few leaves that stick out of the skin, so that the outline is leaves and not a smooth blanket.
    // per: how many on a square metre; they flutter more than the hedge sways.
    const sprigs = (area, per, f) => {
      for (let q = Math.round(area * per); q > 0; q--) {
        const p = f(rnd(), rnd()), c = corner(p[0], p[1], p[2]), nxx = c[3], nyy = c[4], nzz = c[5];
        let ax = -nzz, az = nxx; const al = Math.hypot(ax, az) || 1; ax /= al; az /= al;
        const bx = nyy * az, by = nzz * ax - nxx * az, bz = -nyy * ax;
        for (let l = 0; l < 3; l++) {
          const a = rnd() * 6.283, tip = 0.5 + rnd() * 0.8, len = 0.15 + rnd() * 0.17, wd = 0.04 + rnd() * 0.035, ca = Math.cos(a), sa = Math.sin(a);
          const dx = nxx * Math.cos(tip) + (ax * ca + bx * sa) * Math.sin(tip), dy = nyy * Math.cos(tip) + by * sa * Math.sin(tip) + 0.25, dz = nzz * Math.cos(tip) + (az * ca + bz * sa) * Math.sin(tip);
          const sx = -ax * sa + bx * ca, sy = by * ca, sz = -az * sa + bz * ca, k = 0.85 + rnd() * 0.5, col0 = [c[8][0] * 0.8, c[8][1] * 0.8, c[8][2] * 0.8], col1 = [c[8][0] * 1.5 * k, c[8][1] * 1.55 * k, c[8][2] * 1.2 * k], sww = c[9] * 1.6 + 0.35;
          const b0 = [c[0] - nxx * 0.04, c[1] - nyy * 0.04, c[2] - nzz * 0.04], m0 = [b0[0] + dx * len * 0.5, b0[1] + dy * len * 0.5, b0[2] + dz * len * 0.5], t0 = [b0[0] + dx * len, b0[1] + dy * len, b0[2] + dz * len];
          const put = (pp, cc, u, v, s) => twigs.vert(pp[0], pp[1], pp[2], nxx, nyy, nzz, c[6] + u, c[7] + v, cc, s);
          const e1 = [m0[0] + sx * wd, m0[1] + sy * wd, m0[2] + sz * wd], e2 = [m0[0] - sx * wd, m0[1] - sy * wd, m0[2] - sz * wd];
          put(b0, col0, 0, 0, sww * 0.6); put(e1, col1, 0.03, 0.02, sww); put(t0, col1, 0.06, 0, sww * 1.3);
          put(b0, col0, 0, 0, sww * 0.6); put(t0, col1, 0.06, 0, sww * 1.3); put(e2, col1, 0.03, -0.02, sww);
        }
      }
    };
    const per = o.sprigs || 0, faces = o.faces || ['top', '-z', '+z', '-x', '+x'];
    for (const f of faces) {
      const fn = f === 'top' ? (u, v) => [-hx + 2 * hx * u, h, -hz + 2 * hz * v] : f === '-z' ? (u, v) => [-hx + 2 * hx * u, h * v, -hz] : f === '+z' ? (u, v) => [-hx + 2 * hx * u, h * v, hz] : f === '-x' ? (u, v) => [-hx, h * v, -hz + 2 * hz * u] : (u, v) => [hx, h * v, -hz + 2 * hz * u];
      const n1 = f === '-x' || f === '+x' ? nz : nx, n2 = f === 'top' ? nz : ny, area = (f === '-x' || f === '+x' ? 2 * hz : 2 * hx) * (f === 'top' ? 2 * hz : h);
      sheet(n1, n2, fn);
      if (per && (!o.sprigFaces || o.sprigFaces.includes(f))) sprigs(area, per, fn);
    }
  }
  // A ball of leaves (the crown of a tree, a round bush): rx, ry, rz its half sizes; rough: how lumpy
  const ICO = new THREE.IcosahedronGeometry(1, 1), ICO0 = new THREE.IcosahedronGeometry(1, 0);
  function leafBall(cx, cy, cz, rx, ry, rz, tint, sw, rough = 1, coarse = false) {
    const s1 = rnd() * 40, s2 = rnd() * 40, icoP = (coarse ? ICO0 : ICO).attributes.position;
    for (let i = 0; i < icoP.count; i++) {
      const x = icoP.getX(i), y = icoP.getY(i), z = icoP.getZ(i), f = 1 + 0.62 * rough * (noise(x * 1.5 + s1, y * 1.5 + s2, z * 1.5) - 0.5);
      const px = cx + x * rx * f, py = cy + y * ry * f, pz = cz + z * rz * f, nl = Math.hypot(x / rx, y / ry, z / rz) || 1;
      const k = 0.7 + 0.34 * y + 0.3 * (noise(px * 0.6, py * 0.6, pz * 0.6) - 0.5);
      leaves.vert(px, py, pz, x / rx / nl, y / ry / nl, z / rz / nl, px * 0.3 + py * 0.2, pz * 0.3 + py * 0.26, [k * tint[0], k * tint[1], k * tint[2]], sw * (0.55 + 0.45 * y));
    }
  }

  // ---------- trees ----------
  const KINDS = ['round', 'round', 'round', 'tall', 'birch', 'pine', 'pine'];
  function tree(x, z, s, kind, far) {
    const lean = (rnd() - 0.5) * 0.22, dir = rnd() * 6.283, pine = kind === 'pine';
    const hT = (pine ? 1.9 : kind === 'tall' ? 3.4 : kind === 'birch' ? 3.3 : 2.5 + rnd() * 1.1) * s, r0 = (kind === 'birch' ? 0.19 : 0.31) * s;
    const bark = kind === 'birch' ? [0.82, 0.8, 0.74] : pine ? [0.3, 0.2, 0.13] : [0.36, 0.27, 0.18];
    const tx = x + Math.cos(dir) * lean * hT, tz = z + Math.sin(dir) * lean * hT;
    const barkCol = (px, py, pz) => { const k = 0.75 + 0.5 * noise(px * 3, py * 1.2, pz * 3); return [bark[0] * k, bark[1] * k, bark[2] * k]; };
    solid.add(new THREE.CylinderGeometry(r0 * 0.55, r0 * 1.15, hT * 1.06, 7, 2), along((x + tx) / 2, hT * 0.5, (z + tz) / 2, tx - x, hT, tz - z), { col: barkCol });
    const g = 0.86 + rnd() * 0.34, yel = rnd();
    const tint = pine ? [0.5 * g, 0.86 * g, 0.72 * g] : kind === 'birch' ? [1.25 * g, 1.3 * g, 0.8 * g] : [(0.95 + yel * 0.35) * g, 1.08 * g, (0.95 - yel * 0.3) * g];
    if (pine) {
      // four skirts, each a cone, the lowest the widest
      for (let i = 0; i < 4; i++) {
        const k = i / 3, rad = (2.0 - k * 1.3) * s, hh = 2.0 * s, y = hT * 0.75 + i * 1.15 * s;
        const cone = new THREE.ConeGeometry(rad, hh, 9, 2);
        leaves.add(cone, at(tx, y + hh / 2, tz, 0, rnd() * 3, 0), { col: (px, py, pz, n) => { const q = 0.62 + 0.4 * noise(px * 0.9, py * 0.9, pz * 0.9) + n.y * 0.15; return [q * tint[0], q * tint[1], q * tint[2]]; }, sway: 0.12 + k * 0.3, uv: 2.4 });
      }
      return;
    }
    const top = hT + (kind === 'tall' ? 2.0 : 1.1) * s, n = kind === 'tall' ? 3 : kind === 'birch' ? 4 : 5 + (rnd() * 3 | 0);
    if (kind === 'tall') { for (let i = 0; i < 3; i++) leafBall(tx + (rnd() - 0.5) * 0.4 * s, top - 1.6 * s + i * 1.5 * s, tz + (rnd() - 0.5) * 0.4 * s, (1.35 - Math.abs(i - 1) * 0.3) * s, 1.5 * s, (1.35 - Math.abs(i - 1) * 0.3) * s, tint, 0.5 + i * 0.25); return; }
    const big = (kind === 'birch' ? 1.25 : 1.85) * s;
    leafBall(tx, top, tz, big, big * 0.85, big, tint, 0.8);
    for (let i = 0; i < n; i++) {
      const a = i / n * 6.283 + rnd(), d = big * (0.62 + rnd() * 0.3), rr = big * (0.5 + rnd() * 0.24), t2 = [tint[0] * (0.9 + rnd() * 0.2), tint[1] * (0.9 + rnd() * 0.2), tint[2] * (0.9 + rnd() * 0.2)];
      leafBall(tx + Math.cos(a) * d, top + (rnd() - 0.45) * big * 0.75, tz + Math.sin(a) * d, rr, rr * 0.82, rr, t2, 0.6 + rnd() * 0.5, 1, !!far);
      if (i < 2) solid.add(new THREE.CylinderGeometry(r0 * 0.14, r0 * 0.34, d * 1.1, 5, 1), along(tx + Math.cos(a) * d * 0.5, hT + (top - hT) * 0.35, tz + Math.sin(a) * d * 0.5, Math.cos(a) * d, (top - hT) * 0.9, Math.sin(a) * d), { col: barkCol });
    }
  }

  // ---------- the hedges of the arena, and the green around it ----------
  const AW = 42.5, AD = 55;
  for (const hd of D.hedges) {
    if (hd.edge) {
      // the hedge around the arena: fat, and bushy on top; it grows outwards from where one can stand
      const out = 1.9, t = hd.top + 0.15;
      const oo = f => ({ cell: 0.62, bush: 0.75, amp: 0.26, round: 0.7, sprigs: 2.6, sprigFaces: [f] });
      if (hd.edge === 'N') leafBlock(-AW - out, AW + out, hd.z1 - out, hd.z1 + 0.06, 0, t, oo('+z'));
      else if (hd.edge === 'S') leafBlock(-AW - out, AW + out, hd.z0 - 0.06, hd.z0 + out, 0, t, oo('-z'));
      else if (hd.edge === 'W') leafBlock(hd.x1 - out, hd.x1 + 0.06, -AD, AD, 0, t, oo('+x'));
      else leafBlock(hd.x0 - 0.06, hd.x0 + out, -AD, AD, 0, t, oo('-x'));
    } else leafBlock(hd.x0 - 0.1, hd.x1 + 0.1, hd.z0 - 0.1, hd.z1 + 0.1, 0, hd.top + 0.12, { cell: 0.46, bush: 0.6, amp: 0.24, round: 0.6, sprigs: 7 });
  }
  // outside: a belt of trees, another further out, and bushes between them
  (function () {
    const J = () => (rnd() - 0.5) * 3.2, ring = (m, step, s0, s1) => {
      const TX = AW + m, TZ = AD + m, far = m > 15;
      for (let x = -TX; x <= TX; x += step) { tree(x + J(), -TZ + J(), s0 + rnd() * s1, KINDS[rnd() * KINDS.length | 0], far); tree(x + J(), TZ + J(), s0 + rnd() * s1, KINDS[rnd() * KINDS.length | 0], far); }
      for (let z = -TZ + step; z < TZ; z += step) { tree(-TX + J(), z + J(), s0 + rnd() * s1, KINDS[rnd() * KINDS.length | 0], far); tree(TX + J(), z + J(), s0 + rnd() * s1, KINDS[rnd() * KINDS.length | 0], far); }
    };
    ring(9, 8, 0.85, 0.6); ring(21, 13, 1.25, 0.9);
    for (let i = 0; i < 46; i++) {
      const side = i % 4, tpos = (rnd() - 0.5) * 2, m = 4.5 + rnd() * 11, w = 1.2 + rnd() * 2.4, d = 1.0 + rnd() * 1.6, hh = 0.8 + rnd() * 1.0;
      const x = side < 2 ? tpos * (AW + 8) : (side === 2 ? -1 : 1) * (AW + m), z = side < 2 ? (side ? -1 : 1) * (AD + m) : tpos * (AD + 8);
      leafBlock(x - w / 2, x + w / 2, z - d / 2, z + d / 2, 0, hh, { cell: 0.55, amp: 0.3, bush: 0.5, round: 0.8, tint: [0.9 + rnd() * 0.3, 1.05, 0.85 + rnd() * 0.2] });
    }
  })();

  // ---------- the ground ----------
  const holes = D.holes, inRect = (x, z, r, pad = 0) => x >= r.minX - pad && x <= r.maxX + pad && z >= r.minZ - pad && z <= r.maxZ + pad;
  const track = []; for (let s = 0; s < world.LOOP_L; s += 1) track.push(world.loopAt(s));
  const trackDist = (x, z) => { let m = 1e9; for (const p of track) { const d = (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z); if (d < m) m = d; } return Math.sqrt(m); };
  const walls = world.colliders.filter(c => c.base <= 0.3 && c.top >= 0.5);
  const wallDist = (x, z) => { let m = 1e9; for (const c of walls) { const dx = Math.max(c.minX - x, 0, x - c.maxX), dz = Math.max(c.minZ - z, 0, z - c.maxZ), d = dx * dx + dz * dz; if (d < m) { m = d; if (!m) break; } } return Math.sqrt(m); };
  const segDist = (x, z, a, b) => { const ux = b[0] - a[0], uz = b[1] - a[1], k = clamp(((x - a[0]) * ux + (z - a[1]) * uz) / (ux * ux + uz * uz), 0, 1); return Math.hypot(x - a[0] - ux * k, z - a[1] - uz * k); };
  // where feet have worn the grass away: trails, and a round patch where there is something to fetch or a door
  const TRAILS = [[[-36, -31], [-35, -12], [-34.3, 0], [-35, 12], [-36, 31]], [[36, -31], [35, -12], [34.3, 0], [35, 12], [36, 31]],
    [[-12, -31], [-11.5, -20], [-9.6, -7], [-9.3, 0], [-9.6, 7], [-11.5, 20], [-12, 31]], [[12, -31], [11.5, -20], [9.6, -7], [9.3, 0], [9.6, 7], [11.5, 20], [12, 31]],
    [[-9.4, 4], [-3, 4.2], [0, 4], [3, 4.2], [9.4, 4]], [[-9.4, -4], [0, -3.9], [9.4, -4]], [[-20, 14], [-11.4, 15]], [[20, 14], [11.4, 15]], [[-20, -14], [-11.4, -15]], [[20, -14], [11.4, -15]],
    [[-26, -31], [-24, -22], [-20, -14]], [[26, 31], [24, 22], [20, 14]], [[26, -31], [24, -22], [20, -14]], [[-26, 31], [-24, 22], [-20, 14]]];
  const WEAR = world.PICKUPS.filter(p => !p.y).map(p => [p.x, p.z, 2.3]).concat(D.towers.filter(t => t.short).map(t => [t.cx + 7.6 * Math.cos(t.doorDeg * Math.PI / 180), t.cz + 7.6 * Math.sin(t.doorDeg * Math.PI / 180), 2.8]));
  const worn = (x, z) => {
    let k = 0;
    for (const t of TRAILS) for (let i = 0; i < t.length - 1; i++) k = Math.max(k, 1 - sstep(0.5, 1.9, segDist(x, z, t[i], t[i + 1]) + (noise(x * 0.6, 3, z * 0.6) - 0.5) * 1.3));
    for (const w of WEAR) k = Math.max(k, 1 - sstep(w[2] * 0.45, w[2], Math.hypot(x - w[0], z - w[1]) + (noise(x * 0.7, 7, z * 0.7) - 0.5) * 1.2));
    return k;
  };
  const bedHalf = world.TRAIN.CW / 2 + 0.85;
  // the colour of the ground at a place in the meadow
  const meadow = (x, z) => {
    const big = noise(x * 0.07 + 20, 0, z * 0.07), fine = noise(x * 0.5, 2, z * 0.5), dry = sstep(0.55, 0.85, noise(x * 0.045 + 60, 1, z * 0.045)), w = worn(x, z) * (0.75 + 0.25 * fine);
    const g = [lerp(0.26, 0.44, big) + dry * 0.24, lerp(0.46, 0.62, big) + fine * 0.1 + dry * 0.06, lerp(0.15, 0.21, big) + dry * 0.04];
    const e = [0.5 + fine * 0.1, 0.4 + fine * 0.07, 0.27 + fine * 0.04];
    return [lerp(g[0], e[0], w), lerp(g[1], e[1], w), lerp(g[2], e[2], w)];
  };
  const yard = base => (x, z) => { const k = 0.8 + 0.34 * noise(x * 0.16, 4, z * 0.16), moss = sstep(0.62, 0.9, noise(x * 0.3 + 11, 6, z * 0.3)) * 0.5; return [lerp(base[0] * k, 0.36, moss), lerp(base[1] * k, 0.5, moss), lerp(base[2] * k, 0.26, moss)]; };
  // a flat piece of ground, cut into squares so that the colour can change across it
  function ground(B, r, y, colour, per, step = 1.6) {
    const nx = Math.max(1, Math.ceil((r.maxX - r.minX) / step)), nz = Math.max(1, Math.ceil((r.maxZ - r.minZ) / step)), k = 1 / per;
    const pt = (i, j) => { const x = lerp(r.minX, r.maxX, i / nx), z = lerp(r.minZ, r.maxZ, j / nz); return [x, z, colour(x, z)]; };
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const a = pt(i, j), b = pt(i + 1, j), c = pt(i + 1, j + 1), d = pt(i, j + 1);
      for (const q of [a, d, c, a, c, b]) B.vert(q[0], y, q[1], 0, 1, 0, q[0] * k, q[1] * k, q[2]);
    }
  }
  const ZMID = 31;
  for (const r of D.subtract({ minX: -AW + 0.15, maxX: AW - 0.15, minZ: -ZMID, maxZ: ZMID }, holes)) ground(turf, r, 0.03, meadow, 3.2);
  for (const r of D.subtract({ minX: -AW + 0.15, maxX: AW - 0.15, minZ: -AD + 0.15, maxZ: -ZMID }, holes)) ground(pave, r, 0.03, yard([0.86, 0.6, 0.52]), 2.6);
  for (const r of D.subtract({ minX: -AW + 0.15, maxX: AW - 0.15, minZ: ZMID, maxZ: AD - 0.15 }, holes)) ground(pave, r, 0.03, yard([0.56, 0.66, 0.84]), 2.6);
  // inside the towers the floor is stone
  for (const tw of D.towers) for (let i = -10; i < 10; i++) for (let j = -10; j < 10; j++) {
    const x0 = tw.cx + i * 0.6, z0 = tw.cz + j * 0.6, mx = x0 + 0.3, mz = z0 + 0.3;
    if (Math.hypot(mx - tw.cx, mz - tw.cz) > 5.9 || holes.some(h => inRect(mx, mz, h, 0.3))) continue;
    ground(pave, { minX: x0, maxX: x0 + 0.6, minZ: z0, maxZ: z0 + 0.6 }, 0.045, (x, z) => { const k = 0.6 + 0.2 * noise(x * 0.5, 13, z * 0.5); return [k, k * 0.97, k * 0.92]; }, 2.6, 1);
  }
  // a kerb where the meadow meets a yard
  for (const z of [-ZMID, ZMID]) for (let x = -AW + 0.4; x < AW - 0.4; x += 1.02) solid.add(new THREE.BoxGeometry(0.98, 0.09, 0.3), at(x + 0.5, 0.045, z), { col: () => { const k = 0.62 + rnd() * 0.16; return [k, k * 0.98, k * 0.94]; } });
  // the bed of the track: gravel under the sleepers
  for (let i = 0; i < track.length; i++) {
    const a = track[i], b = track[(i + 1) % track.length], gcol = (x, z) => { const k = 0.48 + 0.2 * noise(x * 0.9, 8, z * 0.9); return [k, k * 0.95, k * 0.86]; };
    const p = [[a.x - a.dz * bedHalf, a.z + a.dx * bedHalf], [a.x + a.dz * bedHalf, a.z - a.dx * bedHalf], [b.x + b.dz * bedHalf, b.z - b.dx * bedHalf], [b.x - b.dz * bedHalf, b.z + b.dx * bedHalf]];
    for (const q of [p[0], p[3], p[2], p[0], p[2], p[1]]) turf.vert(q[0], 0.045, q[1], 0, 1, 0, q[0] * 0.9, q[1] * 0.9, gcol(q[0], q[1]));
  }

  // tufts of grass, flowers and stones. A tuft is a few blades; a blade is one long triangle that bends in the wind.
  const free = (x, z, pad) => !holes.some(h => inRect(x, z, h, 0.3)) && !D.houses.some(h => inRect(x, z, h.rect, 0.1)) && !D.towers.some(t => Math.hypot(x - t.cx, z - t.cz) < 6.3) && wallDist(x, z) > pad;
  function tuft(x, z, size, tone) {
    const n = 4 + (rnd() * 4 | 0);
    for (let i = 0; i < n; i++) {
      const a = rnd() * 6.283, d = rnd() * 0.14 * size, bx = x + Math.cos(a) * d, bz = z + Math.sin(a) * d, hh = (0.1 + rnd() * 0.2) * size, wd = 0.02 + rnd() * 0.018, la = rnd() * 6.283, ln = hh * (0.15 + rnd() * 0.5);
      const k = 0.8 + rnd() * 0.35, c0 = [0.3 * k * tone[0], 0.5 * k * tone[1], 0.17 * k * tone[2]], c1 = [0.52 * k * tone[0], 0.76 * k * tone[1], 0.28 * k * tone[2]];
      const px = Math.cos(la + 1.57) * wd, pz = Math.sin(la + 1.57) * wd;
      blades.vert(bx - px, 0.03, bz - pz, 0, 1, 0, 0, 0, c0, 0); blades.vert(bx + px, 0.03, bz + pz, 0, 1, 0, 0, 0, c0, 0);
      blades.vert(bx + Math.cos(la) * ln, 0.03 + hh, bz + Math.sin(la) * ln, 0, 1, 0, 0, 0, c1, 0.9 + rnd() * 0.8);
    }
  }
  const PETALS = [[1, 1, 0.96], [1, 0.86, 0.2], [0.95, 0.25, 0.2], [0.45, 0.5, 0.95], [0.85, 0.5, 0.9], [1, 0.62, 0.25]];
  // a flower: a stalk from y0 and a six-cornered head
  function flower(x, z, col, y0 = 0.03, hh = 0.16 + rnd() * 0.2) {
    const sw = y0 > 0.5 ? 0.25 : 1 + rnd() * 0.5, r = 0.035 + rnd() * 0.025, stem = [0.25, 0.45, 0.16], tilt = (rnd() - 0.5) * 0.12, heart = col[1] > 0.8 && col[2] < 0.5 ? [0.6, 0.35, 0.1] : [1, 0.82, 0.2];
    blades.vert(x - 0.012, y0, z, 0, 1, 0, 0, 0, stem, 0); blades.vert(x + 0.012, y0, z, 0, 1, 0, 0, 0, stem, 0); blades.vert(x + tilt, y0 + hh, z, 0, 1, 0, 0, 0, stem, sw);
    for (let i = 0; i < 6; i++) {
      const a0 = i / 6 * 6.283, a1 = (i + 1) / 6 * 6.283;
      blades.vert(x + tilt, y0 + 0.01 + hh, z, 0, 1, 0, 0, 0, heart, sw);
      blades.vert(x + tilt + Math.cos(a0) * r, y0 + hh, z + Math.sin(a0) * r, 0, 1, 0, 0, 0, col, sw); blades.vert(x + tilt + Math.cos(a1) * r, y0 + hh, z + Math.sin(a1) * r, 0, 1, 0, 0, 0, col, sw);
    }
  }
  const ROCK = new THREE.IcosahedronGeometry(1, 0);
  function stone(x, z, s) {
    const sd = rnd() * 30, g = 0.42 + rnd() * 0.2, rp = ROCK.attributes.position, m = at(x, s * 0.25, z, 0, rnd() * 6, 0, s, s * (0.5 + rnd() * 0.3), s * (0.7 + rnd() * 0.5)).clone();
    const geo = ROCK.clone(), gp = geo.attributes.position;
    for (let i = 0; i < rp.count; i++) { const f = 0.75 + 0.5 * noise(rp.getX(i) * 1.3 + sd, rp.getY(i) * 1.3, rp.getZ(i) * 1.3); gp.setXYZ(i, rp.getX(i) * f, rp.getY(i) * f, rp.getZ(i) * f); }
    geo.computeVertexNormals();
    solid.add(geo, m, { col: (px, py, pz, n) => { const k = g * (0.8 + 0.3 * n.y); return [k, k * 0.98, k * 0.93]; } });
  }
  for (let i = 0; i < 9500; i++) {
    const x = (rnd() * 2 - 1) * (AW - 0.5), z = (rnd() * 2 - 1) * (ZMID - 0.3);
    if (trackDist(x, z) < bedHalf + 0.15 || !free(x, z, 0.12) || rnd() < worn(x, z) * 1.25) continue;
    const dry = sstep(0.55, 0.85, noise(x * 0.045 + 60, 1, z * 0.045));
    tuft(x, z, 0.75 + rnd() * 0.7 + (wallDist(x, z) < 0.6 ? 0.5 : 0), [1 + dry * 0.55, 1 + dry * 0.15, 1]);
  }
  // in the yards the grass keeps to the foot of the walls and hedges
  for (let i = 0; i < 9000; i++) {
    const x = (rnd() * 2 - 1) * (AW - 0.4), z = (rnd() < 0.5 ? -1 : 1) * (ZMID + rnd() * (AD - ZMID - 0.4)), d = wallDist(x, z);
    if (d < 0.06 || d > 0.42 || !free(x, z, 0.05)) continue;
    tuft(x, z, 0.6 + rnd() * 0.7, WHITE);
  }
  for (let i = 0; i < 70; i++) {
    const x = (rnd() * 2 - 1) * (AW - 2), z = (rnd() * 2 - 1) * (ZMID - 2), col = PETALS[rnd() * PETALS.length | 0], n = 8 + (rnd() * 12 | 0);
    if (worn(x, z) > 0.3 || trackDist(x, z) < bedHalf + 1) continue;
    for (let k = 0; k < n; k++) { const fx = x + (rnd() - 0.5) * 2.4, fz = z + (rnd() - 0.5) * 2.4; if (free(fx, fz, 0.15) && trackDist(fx, fz) > bedHalf + 0.2) flower(fx, fz, col); }
  }
  for (let i = 0; i < 70; i++) {
    const x = (rnd() * 2 - 1) * (AW - 1), z = (rnd() * 2 - 1) * (ZMID - 1), td = trackDist(x, z);
    if (!free(x, z, 0.25) || td < bedHalf - 0.2 && td > 0.4 || worn(x, z) > 0.5) continue;
    stone(x, z, td < bedHalf + 1.2 ? 0.08 + rnd() * 0.08 : 0.1 + rnd() * 0.16);
  }

  // ---------- shapes and materials for what people have built ----------
  const TB = {};
  // a batch with one of the arena's pictures on it (brick, wood, concrete), by name
  const tb = name => (TB[name] || (TB[name] = { b: makeBatch(), mat: new THREE.MeshStandardMaterial({ map: copyOf(TEX[name]), vertexColors: true, roughness: 0.95, metalness: 0 }) })).b;
  const TL = {}, tbLit = name => (TL[name] || (TL[name] = { b: makeBatch(), mat: new THREE.MeshBasicMaterial({ map: copyOf(TEX[name]), vertexColors: true }) })).b;
  const glowTex = picture((g, w, h) => { const r = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); r.addColorStop(0, '#ffffff'); r.addColorStop(0.3, '#8a8a8a'); r.addColorStop(0.65, '#2a2a2a'); r.addColorStop(1, '#000000'); g.fillStyle = r; g.fillRect(0, 0, w, h); });
  glowTex.wrapS = glowTex.wrapT = THREE.ClampToEdgeWrapping;
  const glowMat = new THREE.MeshBasicMaterial({ map: glowTex, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: THREE.DoubleSide });
  const litMat = new THREE.MeshBasicMaterial({ vertexColors: true });      // what shines by itself: bulbs, lanterns
  const shadeMat = new THREE.MeshBasicMaterial({ color: 0x0b1018, alphaMap: glowTex, transparent: true, opacity: 0.6, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  const glow = makeBatch(), lit = makeBatch(), shade = makeBatch(), smokers = [];
  const box = (B, x, y, z, w, h, d, o = {}) => B.add(new THREE.BoxGeometry(w, h, d), at(x, y, z, o.rx || 0, o.ry || 0, o.rz || 0), o);
  // a flat piece with three or four corners; n: the way it shall face; col: a colour or (x, y, z) => colour
  function flat(B, pts, n, col, uvk = 0.5) {
    const a = pts[0], b = pts[1], d = pts[pts.length - 1];
    const fx = (b[1] - a[1]) * (d[2] - a[2]) - (b[2] - a[2]) * (d[1] - a[1]), fy = (b[2] - a[2]) * (d[0] - a[0]) - (b[0] - a[0]) * (d[2] - a[2]), fz = (b[0] - a[0]) * (d[1] - a[1]) - (b[1] - a[1]) * (d[0] - a[0]);
    const fl = Math.hypot(fx, fy, fz) || 1, flip = fx * n[0] + fy * n[1] + fz * n[2] < 0, N = flip ? [-fx / fl, -fy / fl, -fz / fl] : [fx / fl, fy / fl, fz / fl];
    const order = pts.length === 3 ? (flip ? [0, 2, 1] : [0, 1, 2]) : (flip ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3]);
    for (const i of order) {
      const p = pts[i], c = typeof col === 'function' ? col(p[0], p[1], p[2]) : col;
      const u = Math.abs(N[1]) > 0.7 ? p[0] : Math.abs(N[0]) > Math.abs(N[2]) ? p[2] : p[0], v = Math.abs(N[1]) > 0.7 ? p[2] : p[1];
      B.vert(p[0], p[1], p[2], N[0], N[1], N[2], u * uvk, v * uvk, c);
    }
  }
  // light fallen on a floor
  const pool = (x, y, z, r, col) => { const q = [[x - r, z - r, 0, 0], [x + r, z - r, 1, 0], [x + r, z + r, 1, 1], [x - r, z + r, 0, 1]]; for (const i of [0, 2, 1, 0, 3, 2]) glow.vert(q[i][0], y, q[i][1], 0, 1, 0, q[i][2], q[i][3], col); };
  // a leaf of ivy: a six-cornered scrap that lies against a wall. n: the way the wall faces, t: a way along it
  function ivyLeaf(x, y, z, n, t, r, tint) {
    const k = 0.6 + rnd() * 0.7, col = [0.5 * k * tint[0], 0.95 * k * tint[1], 0.42 * k * tint[2]], a0 = rnd() * 6, tip = 0.03 + rnd() * 0.07;
    for (let i = 0; i < 6; i++) {
      const pt = q => { const a = a0 + q / 6 * 6.283, rr = r * (0.7 + 0.3 * ((q * 7) % 3) / 2); return [x + t[0] * Math.cos(a) * rr + n[0] * tip * (q % 2), y + Math.sin(a) * rr, z + t[2] * Math.cos(a) * rr + n[2] * tip * (q % 2)]; };
      const p1 = pt(i), p2 = pt(i + 1);
      leaves.vert(x + n[0] * tip, y, z + n[2] * tip, n[0], 0.25, n[2], x * 0.4 + y * 0.2, z * 0.4 + y * 0.3, col, 0.18);
      leaves.vert(p1[0], p1[1], p1[2], n[0], 0.25, n[2], p1[0] * 0.4 + p1[1] * 0.2, p1[2] * 0.4 + p1[1] * 0.3, col, 0.3);
      leaves.vert(p2[0], p2[1], p2[2], n[0], 0.25, n[2], p2[0] * 0.4 + p2[1] * 0.2, p2[2] * 0.4 + p2[1] * 0.3, col, 0.3);
    }
  }

  // ---------- the houses ----------
  // Every house has a roof. world.js has made it solid (the slopes stop bullets); here is what one sees: tiles laid
  // in courses, slate or thatch, brick gables, a wooden ceiling with beams and a lamp, a plank floor, shutters and
  // flower boxes at the windows, doors standing open, a lantern over the door, ivy, and a chimney that smokes.
  const SHUTTER = [[0.2, 0.42, 0.3], [0.2, 0.34, 0.55], [0.62, 0.3, 0.2], [0.75, 0.6, 0.2], [0.3, 0.45, 0.48], [0.5, 0.22, 0.25]], TRIMC = [0.88, 0.86, 0.8];
  D.houses.forEach((H, hi) => {
    const cx = H.cx, cz = H.cz, alongX = H.alongX, span = H.span, rise = H.rise, eave = H.eave, half = H.half, wallH = H.wallH, wallT = H.wallT;
    const hw = H.w / 2, hd = H.d / 2, top = H.o.top || 'tile', ridge = eave + rise, hs = span - H.ov, hl = half - H.ov, slopeLen = Math.hypot(span, rise);
    // a point of the roof: u across (-1 and 1 are the eaves, 0 the ridge), v along the ridge, lift over the slope
    const R = (u, v, lift = 0) => { const c = u * span, y = eave + rise * (1 - Math.abs(u)) + lift; return alongX ? [cx + v, y, cz + c] : [cx + c, y, cz + v]; };
    // a point given across (c), up (y) and along the ridge (v)
    const G = (c, y, v) => alongX ? [cx + v, y, cz + c] : [cx + c, y, cz + v];
    const slopeN = s => alongX ? [0, span / slopeLen, s * rise / slopeLen] : [s * rise / slopeLen, span / slopeLen, 0];
    const outN = s => alongX ? [0, 0, s] : [s, 0, 0], endN = e => alongX ? [e, 0, 0] : [0, 0, e];
    if (top !== 'thatch') {
      const base = top === 'slate' ? [0.33, 0.37, 0.44] : [0.76, 0.35, 0.24], nc = Math.round(slopeLen / 0.42), nt = Math.round(2 * half / 0.5), tw = 2 * half / nt, st = 0.05;
      for (const s of [-1, 1]) {
        const n = slopeN(s);
        for (let i = 0; i < nc; i++) {
          const u0 = s * (1 - i / nc), u1 = s * (1 - (i + 1) / nc), cuts = [-half];
          for (let j = 0; j < nt; j++) { const c = -half + tw * (j + (i % 2 ? 0.5 : 1)); if (c < half - 0.01) cuts.push(c); }
          cuts.push(half);
          for (let j = 0; j < cuts.length - 1; j++) {
            const v0 = cuts[j], v1 = cuts[j + 1], k = 0.78 + rnd() * 0.42, moss = rnd() < 0.07 ? 0.55 : 0, jl = (rnd() - 0.5) * 0.014;
            const col = [lerp(base[0] * k, 0.3, moss), lerp(base[1] * k, 0.42, moss), lerp(base[2] * k, 0.2, moss)];
            flat(solid, [R(u0, v0, st + jl), R(u0, v1, st + jl), R(u1, v1, jl), R(u1, v0, jl)], n, col);
            flat(solid, [R(u0, v0, st + jl), R(u0, v1, st + jl), R(u0, v1, -0.03), R(u0, v0, -0.03)], outN(s), [col[0] * 0.55, col[1] * 0.55, col[2] * 0.55]);
          }
        }
        flat(solid, [R(s, -half, -0.11), R(s, half, -0.11), R(0, half, -0.11), R(0, -half, -0.11)], [-n[0], -n[1], -n[2]], [0.34, 0.27, 0.2]);
        // a board under the eaves, and boards along the gables' edges
        const ep = R(s, 0, -0.1); solid.add(new THREE.BoxGeometry(alongX ? 2 * half : 0.05, 0.17, alongX ? 0.05 : 2 * half), at(ep[0], ep[1], ep[2]), { col: TRIMC });
        for (const e of [-1, 1]) { const m = R(s * 0.5, e * (half - 0.03), -0.06), dv = alongX ? [0, -rise, s * span] : [s * span, -rise, 0]; solid.add(new THREE.BoxGeometry(alongX ? 0.06 : 0.2, slopeLen + 0.08, alongX ? 0.2 : 0.06), along(m[0], m[1], m[2], dv[0], dv[1], dv[2]), { col: TRIMC }); }
      }
      // the ridge: a row of round tiles
      solid.add(new THREE.CylinderGeometry(0.16, 0.16, 2 * half + 0.06, 7, Math.round(4 * half)), along(cx, ridge + 0.01, cz, alongX ? 1 : 0, 0, alongX ? 0 : 1), { col: (x, y, z) => { const k = 0.7 + 0.45 * hash3(Math.floor((alongX ? x : z) / 0.45), hi, 7); return [base[0] * k, base[1] * k, base[2] * k]; } });
    } else {
      // thatch: thick, soft, round over the ridge, ragged at the edges, with crossed sticks along the top
      const nu = 22, nv = Math.max(6, Math.round(2 * half / 0.22)), hv = half + 0.06, grid = [];
      for (let iv = 0; iv <= nv; iv++) for (let iu = 0; iu <= nu; iu++) {
        const u = -1.06 + 2.12 * iu / nu, v = -hv + 2 * hv * iv / nv, au = Math.abs(u), soft = Math.sqrt(u * u + 0.012) - 0.1095 * Math.max(0, 1 - au), c = u * span, p = G(c, 0, v);
        const rag = (iu === 0 || iu === nu) ? (noise(v * 2.2, hi, 4) - 0.5) * 0.16 : 0;
        p[1] = eave + rise * (1 - soft) + 0.13 + 0.1 * noise(p[0] * 1.2, 2 + hi, p[2] * 1.2) + rag;
        const k = (0.5 + 0.55 * noise(v * 7.5, hi, c * 0.4) + 0.2 * noise(v * 19, c * 2, hi)) * (1 - 0.32 * sstep(0.72, 1.06, au)), moss = sstep(0.6, 0.85, noise(p[0] * 0.5 + 40, 9, p[2] * 0.5)) * (u < 0 ? 0.55 : 0.15);
        grid.push({ p, col: [lerp(0.74 * k, 0.36, moss), lerp(0.57 * k, 0.46, moss), lerp(0.29 * k, 0.22, moss)] });
      }
      const at2 = (iu, iv) => grid[clamp(iv, 0, nv) * (nu + 1) + clamp(iu, 0, nu)];
      const nrm = (iu, iv) => { const a = at2(iu + 1, iv).p, b = at2(iu - 1, iv).p, c = at2(iu, iv + 1).p, d = at2(iu, iv - 1).p; let x = (a[1] - b[1]) * (c[2] - d[2]) - (a[2] - b[2]) * (c[1] - d[1]), y = (a[2] - b[2]) * (c[0] - d[0]) - (a[0] - b[0]) * (c[2] - d[2]), z = (a[0] - b[0]) * (c[1] - d[1]) - (a[1] - b[1]) * (c[0] - d[0]); if (y < 0) { x = -x; y = -y; z = -z; } const l = Math.hypot(x, y, z) || 1; return [x / l, y / l, z / l]; };
      for (let iv = 0; iv < nv; iv++) for (let iu = 0; iu < nu; iu++) {
        const q = [[iu, iv], [iu + 1, iv], [iu + 1, iv + 1], [iu, iv + 1]].map(e => ({ g: at2(e[0], e[1]), n: nrm(e[0], e[1]) }));
        const up = (q[1].g.p[2] - q[0].g.p[2]) * (q[3].g.p[0] - q[0].g.p[0]) - (q[1].g.p[0] - q[0].g.p[0]) * (q[3].g.p[2] - q[0].g.p[2]) > 0;
        for (const i of up ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]) solid.vert(q[i].g.p[0], q[i].g.p[1], q[i].g.p[2], q[i].n[0], q[i].n[1], q[i].n[2], 0, 0, q[i].g.col);
      }
      // the cut edges: thick at the eaves and at the gables
      for (let iv = 0; iv < nv; iv++) for (const iu of [0, nu]) { const a = at2(iu, iv).p, b = at2(iu, iv + 1).p, s = iu ? 1 : -1, o = outN(s); flat(solid, [a, b, [b[0] - o[0] * 0.14, b[1] - 0.36, b[2] - o[2] * 0.14], [a[0] - o[0] * 0.14, a[1] - 0.36, a[2] - o[2] * 0.14]], o, (x, y) => { const k = 0.45 + 0.25 * noise(x * 3, y * 6, hi); return [0.8 * k, 0.64 * k, 0.36 * k]; }); }
      for (let iu = 0; iu < nu; iu++) for (const iv of [0, nv]) { const a = at2(iu, iv).p, b = at2(iu + 1, iv).p; flat(solid, [a, b, [b[0], b[1] - 0.32, b[2]], [a[0], a[1] - 0.32, a[2]]], endN(iv ? 1 : -1), (x, y, z) => { const k = 0.5 + 0.3 * noise(x * 3, y * 6, z * 3); return [0.8 * k, 0.64 * k, 0.36 * k]; }); }
      for (let v = -half + 0.5; v < half - 0.3; v += 0.85) for (const s of [-1, 1]) {
        const m = R(s * 0.085, v + s * 0.05, 0.2), dv = alongX ? [0, rise, -s * span] : [-s * span, rise, 0];
        solid.add(new THREE.BoxGeometry(0.075, 1.3, 0.075), along(m[0], m[1], m[2], dv[0], dv[1], dv[2]), { col: [0.42, 0.3, 0.19] });
      }
    }
    // the gables: brick up to the roof, with a round hole for air
    const wy = eave + rise * H.ov / span - 0.09;
    for (const e of [-1, 1]) for (const face of [0, 1]) {
      const v = e * (hl - (face ? wallT : 0) + (face ? 0 : wallT * 0.5) - wallT * 0.5), n = endN(face ? -e : e), B = tb(H.tex);
      flat(B, [G(-hs, wallH, v), G(hs, wallH, v), G(hs, wy, v), G(-hs, wy, v)], n, WHITE);
      flat(B, [G(-hs, wy, v), G(hs, wy, v), G(0, ridge - 0.1, v)], n, WHITE);
      if (!face) { const p = G(0, wallH + (ridge - wallH) * 0.42, v + e * 0.012); solid.add(new THREE.CircleGeometry(0.36, 14), at(p[0], p[1], p[2], 0, alongX ? e * Math.PI / 2 : (e > 0 ? 0 : Math.PI), 0), { col: TRIMC }); const q = G(0, wallH + (ridge - wallH) * 0.42, v + e * 0.02); solid.add(new THREE.CircleGeometry(0.26, 14), at(q[0], q[1], q[2], 0, alongX ? e * Math.PI / 2 : (e > 0 ? 0 : Math.PI), 0), { col: [0.06, 0.06, 0.07] }); }
    }
    // inside: the ceiling, its beams, a lamp and the light it throws, and a floor of planks
    const inner = { minX: cx - hw + wallT / 2, maxX: cx + hw - wallT / 2, minZ: cz - hd + wallT / 2, maxZ: cz + hd - wallT / 2 }, W = tb('wood');
    const warm = (x, y, z) => { const k = 0.2 + 0.6 / (1 + ((x - cx) * (x - cx) + (z - cz) * (z - cz)) / 9); return [k, k * 0.86, k * 0.66]; };
    { const C2 = tbLit('wood'), nx2 = Math.ceil((inner.maxX - inner.minX) / 1.3), nz2 = Math.ceil((inner.maxZ - inner.minZ) / 1.3);
      for (let j = 0; j < nz2; j++) for (let i = 0; i < nx2; i++) { const x0 = lerp(inner.minX, inner.maxX, i / nx2), x1 = lerp(inner.minX, inner.maxX, (i + 1) / nx2), z0 = lerp(inner.minZ, inner.maxZ, j / nz2), z1 = lerp(inner.minZ, inner.maxZ, (j + 1) / nz2); flat(C2, [[x0, wallH - 0.012, z0], [x1, wallH - 0.012, z0], [x1, wallH - 0.012, z1], [x0, wallH - 0.012, z1]], [0, -1, 0], warm, 0.45); }
      for (const k of [-0.56, 0, 0.56]) { const p = G(0, wallH - 0.14, k * hl); C2.add(new THREE.BoxGeometry(alongX ? 0.2 : 2 * hs, 0.26, alongX ? 2 * hs : 0.2, alongX ? 1 : 6, 1, alongX ? 6 : 1), at(p[0], p[1], p[2]), { uv: 1.3, col: (x, y, z) => { const c = warm(x, y, z); return [c[0] * 0.62, c[1] * 0.6, c[2] * 0.58]; } }); } }
    box(solid, cx, wallH - 0.5, cz, 0.025, 0.5, 0.025, { col: [0.08, 0.08, 0.08] });
    solid.add(new THREE.ConeGeometry(0.3, 0.2, 12, 1, true), at(cx, wallH - 0.78, cz), { col: [0.12, 0.2, 0.16] });
    lit.add(new THREE.SphereGeometry(0.085, 10, 8), at(cx, wallH - 0.86, cz), { col: [1.7, 1.45, 0.85] });
    if (!holes.some(h => inRect(cx, cz, h))) pool(cx, 0.05, cz, 3.6, [0.55, 0.42, 0.2]);
    for (const r of D.subtract(inner, holes)) ground(W, r, 0.036, (x, z) => { const k = 0.78 + 0.25 * noise(x * 0.8, 12, z * 0.8); return [k, k * 0.9, k * 0.78]; }, 2.2, 2);
    // the four walls from outside: shutters and flower boxes, doors, a lantern, ivy
    const SIDES = [['north', 'x', cz - hd, cx - hw, cx + hw, 0, -1], ['south', 'x', cz + hd, cx - hw, cx + hw, 0, 1], ['west', 'z', cx - hw, cz - hd, cz + hd, -1, 0], ['east', 'z', cx + hw, cz - hd, cz + hd, 1, 0]];
    const shut = SHUTTER[(hi * 5 + 2) % SHUTTER.length];
    SIDES.forEach(([name, axis, fixed, from, to, nx, nz], si) => {
      const kind = H.o[name] || 'full', P = (a, e) => axis === 'x' ? [a, fixed + nz * e] : [fixed + nx * e, a], ry = axis === 'x' ? 0 : Math.PI / 2, tdir = axis === 'x' ? [1, 0, 0] : [0, 0, 1];
      const sb = (B, a, y, e, len, hh, dep, o) => { const p = P(a, e); B.add(new THREE.BoxGeometry(len, hh, dep), at(p[0], y, p[1], 0, ry, 0), o); };
      if (kind === 'window') {
        const L = to - from, n = Math.max(1, Math.floor(L / 4)), sp = L / n, mid = (H.sill + H.head) / 2, hh = H.head - H.sill;
        for (let i = 0; i < n; i++) {
          const c = from + sp * (i + 0.5), fc = PETALS[(hi + si + i) % PETALS.length];
          for (const s of [-1, 1]) {
            const k = 0.9 + rnd() * 0.2;
            sb(solid, c + s * 1.05, mid, wallT / 2 + 0.035, 0.62, hh + 0.08, 0.05, { col: [shut[0] * k, shut[1] * k, shut[2] * k] });
            for (const y of [H.sill + 0.22, H.head - 0.22]) sb(solid, c + s * 1.05, y, wallT / 2 + 0.066, 0.56, 0.06, 0.02, { col: [shut[0] * 0.6, shut[1] * 0.6, shut[2] * 0.6] });
            sb(solid, c + s * 0.735, mid, 0, 0.07, hh, wallT + 0.1, { col: TRIMC });
          }
          sb(solid, c, H.sill - 0.19, wallT / 2 + 0.15, 1.3, 0.2, 0.25, { col: [0.55, 0.3, 0.2] });
          for (let q = 0; q < 8; q++) {
            const p = P(c - 0.56 + q * 0.16 + (rnd() - 0.5) * 0.06, wallT / 2 + 0.15 + (rnd() - 0.5) * 0.1);
            if (q % 2) leafBall(p[0], H.sill - 0.05, p[1], 0.17, 0.12, 0.15, [1.15, 1.3, 0.9], 0.5, 0.5, true);
            flower(p[0] + (rnd() - 0.5) * 0.08, p[1] + (rnd() - 0.5) * 0.08, fc, H.sill + 0.0, 0.1 + rnd() * 0.12);
          }
        }
      } else if (kind === 'door' && to - from > H.doorW + 0.4) {
        const mid = (from + to) / 2;
        for (const s of [-1, 1]) {
          const a = mid + s * (H.doorW / 2 + 0.22 + 0.74);
          sb(W, a, 1.56, wallT / 2 + 0.05, 1.46, 3.06, 0.07, { uv: 0.9, col: [0.72, 0.6, 0.5] });
          for (const y of [0.55, 2.6]) sb(solid, a, y, wallT / 2 + 0.095, 1.34, 0.1, 0.02, { col: [0.12, 0.12, 0.13] });
        }
        const lp = P(mid, wallT / 2 + 0.2);
        box(solid, lp[0], 3.62, lp[1], 0.26, 0.05, 0.26, { col: [0.1, 0.1, 0.1] }); box(solid, lp[0], 3.36, lp[1], 0.2, 0.04, 0.2, { col: [0.1, 0.1, 0.1] });
        box(lit, lp[0], 3.49, lp[1], 0.15, 0.2, 0.15, { col: [1.5, 1.15, 0.55] });
      } else if (kind === 'full' && (hi + si) % 2 === 0) {
        const sd = hi * 9.7 + si * 3.1, n3 = [nx, 0, nz];
        for (let q = 0; q < 520; q++) {
          const a = from + rnd() * (to - from), y = 0.1 + rnd() * (wallH - 0.2);
          if (noise(a * 0.5 + sd, y * 0.5, sd) + (1 - y / wallH) * 0.3 < 0.66) continue;
          const p = P(a, wallT / 2 + 0.02 + rnd() * 0.05);
          ivyLeaf(p[0], y, p[1], n3, tdir, 0.16 + rnd() * 0.17, WHITE);
        }
      }
    });
    // the chimney
    const cv = (hi % 2 ? 1 : -1) * hl * 0.5, cc = 0.75, cp = G(cc, 0, cv), ctop = ridge + 0.8, cbot = eave + rise * (1 - (cc + 0.4) / span) - 0.2;
    tb(H.tex).add(new THREE.BoxGeometry(0.74, ctop - cbot, 0.74), at(cp[0], (ctop + cbot) / 2, cp[2]), { uv: 2 });
    box(solid, cp[0], ctop + 0.05, cp[2], 0.92, 0.1, 0.92, { col: [0.62, 0.6, 0.56] });
    solid.add(new THREE.CylinderGeometry(0.13, 0.15, 0.34, 9), at(cp[0], ctop + 0.27, cp[2]), { col: [0.5, 0.27, 0.19] });
    if (hi % 3 !== 2) smokers.push({ x: cp[0], y: ctop + 0.5, z: cp[2], every: 0.33, size: 0.16, ttl: 3.2, rise: 0.85 });
  });

  // ---------- under the ground ----------
  // The tunnel between the two cellars: brick walls, a vault over the straight stretches with a stone rib every few
  // metres, lamps, pipes, puddles and a drip. Its light is worked out here once and painted on (brighter by a lamp
  // and where daylight falls in, dim between): it looks the same with and without shadows, and costs nothing.
  const T = D.tunnel, FY = T.floorY, CY = T.ceilY, LAMPS = [], drips = [];
  for (const r of T.runs) { const len = r.to - r.from, n = Math.max(1, Math.round(len / 9)); for (let i = 0; i < n; i++) { const a = r.from + len * (i + 0.5) / n; LAMPS.push(r.axis === 'z' ? { x: r.at, y: CY - 0.42, z: a, p: 0.8, r: 1.9, c: [1, 0.78, 0.48], bulb: true } : { x: a, y: CY - 0.42, z: r.at, p: 0.8, r: 1.9, c: [1, 0.78, 0.48], bulb: true }); } }
  for (const c of [[8, -4.5], [-10, -4.5]]) LAMPS.push({ x: c[0], y: CY - 0.2, z: c[1], p: 0.75, r: 1.9, c: [1, 0.78, 0.48], bulb: true });
  for (const m of T.mouths) LAMPS.push({ x: m[0], y: FY + 2.2, z: m[1], p: 1.1, r: 2.4, c: [0.8, 0.9, 1] });
  const lightAt = (x, y, z, tint) => {
    let r = 0.07, g = 0.075, b = 0.09;
    for (const L of LAMPS) { const k = L.p / (1 + ((x - L.x) * (x - L.x) + (y - L.y) * (y - L.y) + (z - L.z) * (z - L.z)) / (L.r * L.r)); r += k * L.c[0]; g += k * L.c[1]; b += k * L.c[2]; }
    return [Math.min(1.5, r) * tint[0], Math.min(1.5, g) * tint[1], Math.min(1.5, b) * tint[2]];
  };
  const dimMat = name => new THREE.MeshBasicMaterial({ map: copyOf(TEX[name]), vertexColors: true, side: THREE.DoubleSide });
  const tunWall = makeBatch(), tunFloor = makeBatch(), BRICK = [1.0, 0.88, 0.76], STONE = [0.6, 0.57, 0.52];
  // a sheet given by a rule: f(u, v) is the place; lit by the lamps; the picture is laid on by su, sv metres
  const sheetOf = (B, nu, nv, f, tint, uvk = 1) => {
    const g = [];
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) { const p = f(i / nu, j / nv); g.push([p[0], p[1], p[2], p[3], p[4], lightAt(p[0], p[1], p[2], tint)]); }
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) for (const q of [0, 1, nu + 2, 0, nu + 2, nu + 1]) { const p = g[j * (nu + 1) + i + q]; B.vert(p[0], p[1], p[2], 0, 1, 0, p[3] * uvk, p[4] * uvk, p[5]); }
  };
  { const done = []; for (const f of T.floors) { for (const r of D.subtract(f, done)) { ground(tunFloor, r, FY, (x, z) => lightAt(x, FY, z, [0.8, 0.78, 0.74]), 2.4, 1.1); ground(tunWall, r, CY, (x, z) => lightAt(x, CY, z, [0.62, 0.56, 0.5]), 2, 1.5); } done.push(f); } }
  for (const w of T.walls) {
    const len = w.to - w.from, n = Math.max(1, Math.ceil(len / 1.1));
    for (const s of [-1, 1]) sheetOf(tunWall, n, 3, (u, v) => { const a = w.from + len * u, y = FY + (CY - FY) * v, e = w.fixed + s * 0.15; return w.along === 'x' ? [a, y, e, a, y] : [e, y, a, a, y]; }, BRICK);
    for (const a of [w.from, w.to]) sheetOf(tunWall, 1, 3, (u, v) => { const e = w.fixed - 0.15 + 0.3 * u, y = FY + (CY - FY) * v; return w.along === 'x' ? [a, y, e, e, y] : [e, y, a, e, y]; }, BRICK);
  }
  // a frame of stone where a corridor meets a tower's shaft and is wider than the way in: two jambs from the floor
  // to the street and a lintel. It closes the slit beside the shaft's wall (one saw the sky through it) and covers
  // the wall's end, which lay in the same plane as the corridor's bricks and flickered.
  for (const d of T.doors) {
    const stone = (x, y, z, nn) => { const k = 0.5 + 0.26 * Math.abs(nn.x) + 0.08 * nn.y; return lightAt(x, y, z, [STONE[0] * k, STONE[1] * k, STONE[2] * k]); };
    for (const [z0, z1] of [[d.from - 0.05, d.open + 0.05], [d.to - 0.07, d.to + 0.07]]) lit.add(new THREE.BoxGeometry(0.46, -FY, z1 - z0), at(d.x, FY / 2, (z0 + z1) / 2), { col: stone });
    lit.add(new THREE.BoxGeometry(0.5, 0.66, d.to - d.from + 0.16), at(d.x, -0.33, (d.from + d.to) / 2), { col: stone });
  }
  const SPRING = FY + 1.95, CROWN = CY - 0.1;
  T.runs.forEach((r, ri) => {
    const len = r.to - r.from, n = Math.ceil(len / 1.2), P = (c, y, a) => r.axis === 'z' ? [r.at + c, y, a] : [a, y, r.at + c];
    // the vault
    sheetOf(tunWall, 10, n, (u, v) => { const th = Math.PI * u, c = r.half * Math.cos(th), y = SPRING + (CROWN - SPRING) * Math.sin(th), a = r.from + len * v, p = P(c, y, a); return [p[0], p[1], p[2], a, th * 1.4]; }, [0.95, 0.76, 0.66]);
    // ribs of stone, each on two pillars
    const nr = Math.max(2, Math.round(len / 3.7));
    for (let i = 0; i < nr; i++) {
      const a = r.from + len * (i + 0.5) / nr, wd = 0.17, inn = 0.11;
      for (const e of [0, 1, 2]) sheetOf(lit, 10, 1, (u, v) => { const th = Math.PI * u, k = e === 0 ? inn : inn * v, aa = e === 0 ? a - wd + 2 * wd * v : a + (e === 1 ? -wd : wd), p = P((r.half - k) * Math.cos(th), SPRING + (CROWN - SPRING - k) * Math.sin(th), aa); return [p[0], p[1], p[2], 0, 0]; }, STONE);
      for (const s of [-1, 1]) { const p = P(s * (r.half - inn / 2), (FY + SPRING) / 2, a); lit.add(new THREE.BoxGeometry(r.axis === 'z' ? inn : 2 * wd, SPRING - FY, r.axis === 'z' ? 2 * wd : inn), at(p[0], p[1], p[2]), { col: (x, y, z, nn) => { const k = 0.72 + 0.28 * Math.abs(r.axis === 'z' ? nn.x : nn.z); return lightAt(x, y, z, [STONE[0] * k, STONE[1] * k, STONE[2] * k]); } }); }
    }
    // two pipes along one wall, held by brackets
    if (ri !== 1) for (const [y, pr, col, off] of [[SPRING + 0.12, 0.05, [0.62, 0.32, 0.22], 0.14], [SPRING - 0.08, 0.032, [0.5, 0.52, 0.55], 0.1]]) {
      const p = P(-r.half + off, y, (r.from + r.to) / 2);
      lit.add(new THREE.CylinderGeometry(pr, pr, len, 7, Math.ceil(len / 1.5)), along(p[0], p[1], p[2], r.axis === 'z' ? 0 : 1, 0, r.axis === 'z' ? 1 : 0), { col: (x, yy, z, nn) => { const k = 0.55 + 0.45 * (0.5 + 0.5 * nn.y); return lightAt(x, yy, z, [col[0] * k, col[1] * k, col[2] * k]); } });
    }
    // puddles, and a drip into one of them
    for (let i = 0; i < 3; i++) {
      const a = r.from + len * (0.2 + 0.3 * i + (rnd() - 0.5) * 0.1), c = (rnd() - 0.5) * 1.2, p = P(c, FY + 0.012, a), sx = 0.5 + rnd() * 0.5, sz = 0.4 + rnd() * 0.5;
      for (const q of [[-1, -1, 0, 0], [1, 1, 1, 1], [1, -1, 1, 0], [-1, -1, 0, 0], [-1, 1, 0, 1], [1, 1, 1, 1]]) shade.vert(p[0] + q[0] * sx, p[1], p[2] + q[1] * sz, 0, 1, 0, q[2], q[3], WHITE);
      if (i === 1) drips.push({ x: p[0], z: p[2], period: 1.6 + rnd() * 1.6, phase: rnd() * 3 });
    }
  });
  for (const L of LAMPS) if (L.bulb) {
    box(lit, L.x, L.y + 0.2, L.z, 0.05, 0.3, 0.05, { col: [0.05, 0.05, 0.05] });
    lit.add(new THREE.CylinderGeometry(0.16, 0.2, 0.07, 10), at(L.x, L.y + 0.07, L.z), { col: [0.1, 0.11, 0.1] });
    lit.add(new THREE.SphereGeometry(0.09, 10, 8), at(L.x, L.y - 0.02, L.z), { col: [1.9, 1.6, 0.95] });
    pool(L.x, FY + 0.02, L.z, 1.5, [0.2, 0.14, 0.06]);
  }
  // the water that falls: a drop, and a ring where it lands
  const dropGeo = new THREE.SphereGeometry(0.03, 6, 5), ringGeo = new THREE.RingGeometry(0.8, 1, 16).rotateX(-Math.PI / 2);
  for (const d of drips) {
    d.drop = new THREE.Mesh(dropGeo, new THREE.MeshBasicMaterial({ color: 0xbfd6e6 })); d.drop.scale.y = 2.2;
    d.ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xa9c4d6, transparent: true, opacity: 0, depthWrite: false })); d.ring.position.set(d.x, FY + 0.02, d.z);
    scene.add(d.drop, d.ring);
  }

  // the stairs down to the cellars: steps of stone laid over the slope one walks on
  for (const st of D.stairs) {
    const alongZ = st.dir === '+z' || st.dir === '-z', up = st.dir === '+z' || st.dir === '+x' ? 1 : -1, len = alongZ ? st.d : st.w, wid = alongZ ? st.w : st.d, n = Math.max(2, Math.round((st.hi - st.lo) / 0.19)), C = tb('concrete');
    for (let k = 0; k < n; k++) {
      const a0 = (alongZ ? st.cz : st.cx) - up * len / 2 + up * len * k / n, a1 = a0 + up * len / n, am = (a0 + a1) / 2, y = st.lo + (st.hi - st.lo) * (k + 0.5) / n, hh = y - st.lo + 0.3, tone = 0.8 + rnd() * 0.25;
      C.add(new THREE.BoxGeometry(alongZ ? wid : len / n, hh, alongZ ? len / n : wid), at(alongZ ? st.cx : am, y - hh / 2, alongZ ? am : st.cz), { uv: 1.6, col: [tone, tone * 0.98, tone * 0.94] });
      const e = a0 + up * 0.03;      // the worn front edge of the step
      box(solid, alongZ ? st.cx : e, y + 0.004, alongZ ? e : st.cz, alongZ ? wid : 0.07, 0.012, alongZ ? 0.07 : wid, { col: [0.4, 0.4, 0.39] });
    }
  }

  // ---------- the towers ----------
  // Rings of stone around the wall (it reads as round, not as twenty-four flat pieces), ivy up one side, a lantern
  // on either side of the door, and a flag in the wind: the team's colour on its own tower, a pennant on the two
  // in the middle.
  const flags = makeBatch(), rad = d => d * Math.PI / 180;
  D.towers.forEach((tw, ti) => {
    const stoneCol = (x, y, z) => { const k = 0.6 + 0.2 * noise(x * 1.5, y * 3, z * 1.5); return [k, k * 0.97, k * 0.9]; };
    for (const y of tw.short ? [tw.sill, tw.band] : [tw.sill, tw.band, tw.top]) solid.add(new THREE.TorusGeometry(tw.R + 0.21, 0.14, 5, 40), at(tw.cx, y, tw.cz, Math.PI / 2, 0, 0), { col: stoneCol });
    const back = tw.doorDeg + 150 + ti * 37;
    for (let q = 0; q < 820; q++) {
      const a = rad(back + (rnd() - 0.5) * 70), y = 0.1 + rnd() * (tw.sill - 0.3);
      if (noise(a * 6 + ti * 5, y * 0.5, ti) + (1 - y / tw.sill) * 0.32 < 0.68) continue;
      const rr = tw.R + 0.24 + rnd() * 0.05;
      ivyLeaf(tw.cx + rr * Math.cos(a), y, tw.cz + rr * Math.sin(a), [Math.cos(a), 0, Math.sin(a)], [-Math.sin(a), 0, Math.cos(a)], 0.16 + rnd() * 0.18, WHITE);
    }
    for (const s of [-1, 1]) {
      const a = rad(tw.doorDeg + s * 20), x = tw.cx + (tw.R + 0.36) * Math.cos(a), z = tw.cz + (tw.R + 0.36) * Math.sin(a);
      box(solid, x, 2.88, z, 0.26, 0.05, 0.26, { col: [0.1, 0.1, 0.1] }); box(solid, x, 2.6, z, 0.2, 0.04, 0.2, { col: [0.1, 0.1, 0.1] });
      box(lit, x, 2.74, z, 0.15, 0.22, 0.15, { col: [1.5, 1.15, 0.55] });
    }
    // the flag: a pole on the wall, on the side towards the middle of the arena
    const fa = Math.atan2(-tw.cz, -tw.cx) + (tw.short ? 1.2 : 0), px = tw.cx + tw.R * Math.cos(fa), pz = tw.cz + tw.R * Math.sin(fa), base = tw.short ? tw.top + 1.1 : tw.top, ph = tw.short ? 2.4 : 3.6;
    solid.add(new THREE.CylinderGeometry(0.045, 0.06, ph, 6), at(px, base + ph / 2, pz), { col: [0.82, 0.8, 0.74] });
    solid.add(new THREE.SphereGeometry(0.1, 8, 6), at(px, base + ph + 0.06, pz), { col: [0.9, 0.72, 0.2] });
    const fw = tw.short ? 1.5 : 2.3, fh = tw.short ? 0.8 : 1.35, col = tw.short ? [0.95, 0.78, 0.18] : tw.cz < 0 ? [0.86, 0.2, 0.24] : [0.2, 0.4, 0.9], dx = -Math.sin(fa), dz = Math.cos(fa), nu = 9, nv = 4;
    const fp = (i, j) => { const u = i / nu, v = j / nv, taper = tw.short ? 1 - u * 0.9 : 1, y = base + ph - 0.1 - fh * (0.5 + (v - 0.5) * taper); return [px + dx * u * fw, y, pz + dz * u * fw, u, (j === 0 || j === nv) && !tw.short ? 0.92 : 1]; };
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) for (const q of [[i, j], [i + 1, j], [i + 1, j + 1], [i, j], [i + 1, j + 1], [i, j + 1]]) { const p = fp(q[0], q[1]); flags.vert(p[0], p[1], p[2], dz, 0, -dx, 0, 0, [col[0] * p[4], col[1] * p[4], col[2] * p[4]], p[3]); }
  });
  // the two piers by the track: a cap of stone, and ivy
  for (const p of D.piers || []) {
    box(solid, p.cx, p.top - 0.05, p.cz, p.w + 0.24, 0.14, p.d + 0.24, { col: (x, y, z) => { const k = 0.62 + 0.14 * noise(x * 2, y, z * 2); return [k, k * 0.97, k * 0.9]; } });
    for (let q = 0; q < 700; q++) {
      const side = q % 4, u = rnd(), y = 0.1 + rnd() * (p.top - 0.4);
      if (noise(u * 3 + side * 9 + p.cx, y * 0.5, 2) + (1 - y / p.top) * 0.3 < 0.66) continue;
      const n = side === 0 ? [0, 0, -1] : side === 1 ? [0, 0, 1] : side === 2 ? [-1, 0, 0] : [1, 0, 0], t = side < 2 ? [1, 0, 0] : [0, 0, 1];
      const x = side < 2 ? p.cx + (u - 0.5) * p.w : p.cx + n[0] * (p.w / 2 + 0.03 + rnd() * 0.04), z = side < 2 ? p.cz + n[2] * (p.d / 2 + 0.03 + rnd() * 0.04) : p.cz + (u - 0.5) * p.d;
      ivyLeaf(x, y, z, n, t, 0.16 + rnd() * 0.18, WHITE);
    }
  }
  const flagMat = bothSides(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  { const first = flagMat.onBeforeCompile; flagMat.onBeforeCompile = sh => {
    first(sh); sh.uniforms.uTime = time;
    sh.vertexShader = 'uniform float uTime;\nattribute float aSway;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      transformed += normal * sin(uTime * 5.5 - aSway * 6.0 + position.x * 0.7) * 0.2 * aSway;
      transformed.y -= aSway * aSway * (0.16 + 0.1 * sin(uTime * 1.7 + position.z));`);
  }; }

  // ---------- the town around the arena ----------
  // Three rows of houses beyond the trees, the far ones taller and paler in the haze, all in one mesh with one
  // picture of windows. Among them a church, a works with two smoking chimneys, a water tower, a building site with
  // a crane that turns, a big wheel that turns, and two balloons that drift past. Lamps blink on the tall roofs.
  const SUNV = new THREE.Vector3(34, 54, 26).normalize(), CELLS = 8;
  const sunlit = n => 0.52 + 0.5 * Math.max(0, n.x * SUNV.x + n.y * SUNV.y + n.z * SUNV.z);
  const tinted = c => (x, y, z, n) => { const k = sunlit(n); return [c[0] * k, c[1] * k, c[2] * k]; };
  const townTex = picture((g, w) => {
    const n = w / CELLS;
    g.fillStyle = '#fff'; g.fillRect(0, 0, w, w);
    for (let j = 0; j < CELLS; j++) for (let i = 0; i < CELLS; i++) {
      const x = i * n, y = j * n, r = rnd(), wx = x + n * 0.22, wy = y + n * 0.18, ww = n * 0.56, wh = n * 0.6;
      g.fillStyle = 'rgba(0,0,0,' + (rnd() * 0.07).toFixed(3) + ')'; g.fillRect(x, y, n, n);          // the wall is a little uneven
      g.fillStyle = r < 0.1 ? '#ffe7a0' : r < 0.2 ? '#c9d3d8' : ['#33414f', '#3d4e60', '#465a6d'][rnd() * 3 | 0]; g.fillRect(wx, wy, ww, wh);
      const sky = g.createLinearGradient(0, wy, 0, wy + wh); sky.addColorStop(0, 'rgba(200,226,246,.5)'); sky.addColorStop(0.7, 'rgba(200,226,246,0)');
      g.fillStyle = sky; g.fillRect(wx, wy, ww, wh);                                                   // the sky in the glass
      g.fillStyle = 'rgba(255,255,255,.55)'; g.fillRect(wx + ww / 2 - n * 0.02, wy, n * 0.04, wh); g.fillRect(wx, wy + wh * 0.4, ww, n * 0.035);
      g.fillStyle = 'rgba(0,0,0,.22)'; g.fillRect(wx - n * 0.03, wy + wh, ww + n * 0.06, n * 0.06);     // the sill and its shadow
    }
  });
  const town = makeBatch(), spin = makeBatch(), ring = makeBatch(), balloons = makeBatch(), beacons = [[], []], farSmoke = [], crane = {}, wheel = {};
  // a wall or roof with four corners, a..b along the bottom, the picture from (u0, v0) to (u1, v1)
  const quad = (B, a, b, c, d, n, u0, v0, u1, v1, col, top = col) => {
    for (const [p, u, v, cc] of [[a, u0, v0, col], [b, u1, v0, col], [c, u1, v1, top], [a, u0, v0, col], [c, u1, v1, top], [d, u0, v1, top]]) B.vert(p[0], p[1], p[2], n.x, n.y, n.z, u, v, cc);
  };
  const NV = new THREE.Vector3();
  // A house: a box with windows on its four walls, standing at (cx, cz), turned `rot`, from y0 up to y1.
  // o: { bay, floor: metres per window, roof: colour (a flat roof is laid on), gable: height of a pitched roof }
  function house(cx, cz, w, d, y0, y1, rot, wall, o = {}) {
    const c = Math.cos(rot), s = Math.sin(rot), P = (lx, y, lz) => [cx + lx * c + lz * s, y, cz - lx * s + lz * c], hw = w / 2, hd = d / 2, bay = o.bay || 3.3, fl = o.floor || 3.4;
    for (const [x0, z0, x1, z1, nx, nz] of [[-hw, hd, hw, hd, 0, 1], [hw, hd, hw, -hd, 1, 0], [hw, -hd, -hw, -hd, 0, -1], [-hw, -hd, -hw, hd, -1, 0]]) {
      NV.set(nx * c + nz * s, 0, -nx * s + nz * c);
      const len = nx ? d : w, nb = Math.max(1, Math.round(len / bay)), nf = Math.max(1, Math.round((y1 - y0) / fl)), u0 = rnd() * CELLS | 0, v0 = rnd() * CELLS | 0, k = sunlit(NV);
      quad(town, P(x0, y0, z0), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z0), NV, u0 / CELLS, v0 / CELLS, (u0 + nb) / CELLS, (v0 + nf) / CELLS, [wall[0] * k * 0.84, wall[1] * k * 0.84, wall[2] * k * 0.84], [wall[0] * k, wall[1] * k, wall[2] * k]);
    }
    const roof = o.roof || [0.36, 0.37, 0.4];
    if (o.gable) {                                               // a pitched roof, the ridge along the house
      const yr = y1 + o.gable, e = 0.5;
      for (const sg of [1, -1]) {
        NV.set(sg * o.gable * s, hd, sg * o.gable * c).normalize(); const k = sunlit(NV), cc = [roof[0] * k, roof[1] * k, roof[2] * k];
        const a = P(-sg * (hw + e), y1 - 0.2, sg * (hd + e)), b = P(sg * (hw + e), y1 - 0.2, sg * (hd + e)), t1 = P(sg * (hw + e), yr, 0), t0 = P(-sg * (hw + e), yr, 0);
        quad(town, a, b, t1, t0, NV, 0, 0, 0, 0, cc);
        NV.set(sg * c, 0, -sg * s); const kk = sunlit(NV), wc = [wall[0] * kk, wall[1] * kk, wall[2] * kk], g0 = P(sg * hw, y1, sg * hd), g1 = P(sg * hw, y1, -sg * hd), g2 = P(sg * hw, yr, 0);
        for (const p of [g0, g1, g2]) town.vert(p[0], p[1], p[2], NV.x, NV.y, NV.z, 0, 0, wc);
      }
    } else { NV.set(0, 1, 0); const k = sunlit(NV); quad(town, P(-hw, y1, hd), P(hw, y1, hd), P(hw, y1, -hd), P(-hw, y1, -hd), NV, 0, 0, 0, 0, [roof[0] * k, roof[1] * k, roof[2] * k]); }
    return P;
  }
  // something without windows: any shape, one colour, lit by the sun
  const plain = (B, geo, m, col) => { geo.deleteAttribute('uv'); B.add(geo, m, { col: tinted(col) }); };
  const WALLS = [[0.68, 0.62, 0.54], [0.62, 0.36, 0.28], [0.72, 0.64, 0.46], [0.5, 0.56, 0.64], [0.76, 0.72, 0.66], [0.54, 0.5, 0.47], [0.68, 0.5, 0.34], [0.54, 0.6, 0.5], [0.44, 0.5, 0.6], [0.7, 0.36, 0.26], [0.74, 0.58, 0.26], [0.66, 0.44, 0.44], [0.34, 0.52, 0.52]];
  const ROOFS = [[0.36, 0.37, 0.4], [0.5, 0.3, 0.24], [0.3, 0.32, 0.34], [0.46, 0.48, 0.5]], STEEL = [0.5, 0.52, 0.55], DARK = [0.2, 0.21, 0.23];
  // where a row stands: an oval around the arena, `m` metres outside it; a is the angle seen from the middle
  const oval = (m, a) => [(AW + m) * Math.cos(a), (AD + m) * Math.sin(a)], facing = (x, z) => Math.atan2(-x, -z);
  const deg = Math.PI / 180;
  // what stands out, by the angle it is seen at from the middle (0 is +x, 90 is +z): [angle, row, kind]
  const SIGHTS = [[28, 0, 'church'], [112, 0, 'wheel'], [158, 1, 'tank'], [206, 0, 'works'], [262, 1, 'site'], [318, 0, 'tank']];
  const mast = (x, y, z, h, lamp) => { plain(town, new THREE.CylinderGeometry(0.12, 0.2, h, 5), at(x, y + h / 2, z), STEEL); beacons[lamp].push(x, y + h + 0.3, z); };
  [[60, 17, 36], [96, 26, 58], [134, 42, 96]].forEach(([m, h0, h1], row) => {
    const per = 2 * Math.PI * Math.hypot(AW + m, AD + m) / Math.SQRT2;
    for (let run = rnd() * 8; run < per;) {
      const a = run / per * 2 * Math.PI, w = (row === 2 ? 11 : 13) + rnd() * (row === 2 ? 9 : 17), d = 11 + rnd() * 9, gap = rnd() < 0.18 ? 9 + rnd() * 16 : 1.5 + rnd() * 5;
      run += w + gap;
      if (SIGHTS.some(q => q[1] === row && Math.abs(((a / deg - q[0]) % 360 + 540) % 360 - 180) < (row ? 9 : 12))) continue;       // room for a sight
      const [x, z] = oval(m + (rnd() - 0.5) * 12, a + (w / 2) / per * 2 * Math.PI), rot = facing(x, z) + (rnd() - 0.5) * 0.3, h = h0 + (h1 - h0) * Math.pow(rnd(), row === 2 ? 1.1 : 1.6);
      const wall = WALLS[rnd() * WALLS.length | 0], roof = ROOFS[rnd() * ROOFS.length | 0], kind = rnd();
      if (row === 2 || (row === 1 && kind < 0.45)) {
        // a tall house that steps in towards the top, with a mast and a lamp
        const glass = rnd() < 0.4, wl = glass ? [0.5, 0.62, 0.74] : wall, o = glass ? { bay: 2.2, floor: 3.1, roof } : { roof }, h2 = h * (0.62 + rnd() * 0.16);
        house(x, z, w, d, 0, h2, rot, wl, o);
        if (rnd() < 0.75) { house(x, z, w * 0.72, d * 0.72, h2, h, rot, wl, o); if (rnd() < 0.6) { const h3 = h + 4 + rnd() * 7; house(x, z, w * 0.4, d * 0.4, h, h3, rot, wl, o); mast(x, h3, z, 6 + rnd() * 8, row & 1); } else if (rnd() < 0.7) mast(x, h, z, 8 + rnd() * 10, row & 1); }
        else { plain(town, new THREE.BoxGeometry(w * 0.3, 2.6, d * 0.3), at(x, h2 + 1.3, z, 0, rot, 0), roof); if (h2 > 40) mast(x, h2 + 2.6, z, 7, row & 1); }
      } else if (kind < 0.78 || row === 1) {
        // a block of flats with a flat roof and things on it: a stair house, a tank on legs, a row of chimneys
        const P = house(x, z, w, d, 0, h, rot, wall, { roof });
        const q = P((rnd() - 0.5) * w * 0.5, 0, (rnd() - 0.5) * d * 0.4); plain(town, new THREE.BoxGeometry(3.4, 2.6, 3), at(q[0], h + 1.3, q[2], 0, rot, 0), [wall[0] * 0.9, wall[1] * 0.9, wall[2] * 0.9]);
        if (rnd() < 0.45) { const t = P(w * 0.28, 0, -d * 0.2); plain(town, new THREE.CylinderGeometry(1.5, 1.5, 2.6, 9), at(t[0], h + 3.1, t[2]), [0.5, 0.36, 0.26]); plain(town, new THREE.ConeGeometry(1.7, 1.1, 9), at(t[0], h + 4.95, t[2]), DARK); for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) plain(town, new THREE.BoxGeometry(0.2, 1.8, 0.2), at(t[0] + lx, h + 0.9, t[2] + lz), DARK); }
        else for (let k = 0; k < 3; k++) { const t = P(-w * 0.3 + k * 1.6, 0, d * 0.25); plain(town, new THREE.BoxGeometry(0.8, 1.5 + (k % 2) * 0.5, 0.8), at(t[0], h + 0.8, t[2], 0, rot, 0), [0.5, 0.33, 0.27]); }
      } else {
        // an old house with a pitched roof of tiles
        house(x, z, w, d * 0.8, 0, h * 0.8, rot, wall, { roof: [0.56, 0.3, 0.22], gable: 3.5 + rnd() * 3 });
      }
    }
  });
  for (const [ang, row, kind] of SIGHTS) {
    const a = ang * deg, [x, z] = oval([60, 96, 134][row], a), rot = facing(x, z), c = Math.cos(rot), s = Math.sin(rot), L = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
    if (kind === 'church') {
      const stone = [0.82, 0.8, 0.74], tiles = [0.5, 0.28, 0.22];
      house(x, z, 26, 11, 0, 15, rot, stone, { bay: 4.4, floor: 15, roof: tiles, gable: 7 });
      const t = L(-16.5, 0); house(t[0], t[1], 8, 8, 0, 31, rot, stone, { bay: 4, floor: 7.5, roof: tiles });
      plain(town, new THREE.ConeGeometry(6.1, 17, 4), at(t[0], 39.5, t[1], 0, rot + Math.PI / 4, 0), [0.3, 0.5, 0.44]);
      plain(town, new THREE.SphereGeometry(0.7, 8, 6), at(t[0], 48.4, t[1]), [0.9, 0.72, 0.3]);
    } else if (kind === 'tank') {
      // a water tower: a round tank on a ring of legs
      const y = 30 + row * 16;
      plain(town, new THREE.CylinderGeometry(6.5, 5.2, 7, 14), at(x, y, z), [0.74, 0.78, 0.8]); plain(town, new THREE.ConeGeometry(6.9, 3, 14), at(x, y + 5, z), [0.46, 0.3, 0.26]);
      plain(town, new THREE.CylinderGeometry(1, 1, y, 8), at(x, y / 2, z), STEEL);
      for (let k = 0; k < 6; k++) { const q = k / 6 * 6.283; plain(town, new THREE.CylinderGeometry(0.3, 0.3, y + 1, 5), along(x + Math.cos(q) * 5.6, y / 2 - 1.5, z + Math.sin(q) * 5.6, -Math.cos(q) * 0.11, 1, -Math.sin(q) * 0.11), STEEL); }
      beacons[1].push(x, y + 7.2, z);
    } else if (kind === 'works') {
      // a works: a long shed with a saw-toothed roof and two tall chimneys that smoke
      const brick = [0.62, 0.38, 0.3];
      house(x, z, 44, 17, 0, 15, rot, brick, { bay: 5.5, floor: 7.5, roof: DARK });
      for (let k = 0; k < 6; k++) { const q = L(-18.3 + k * 7.3, 0), e = L(-14.9 + k * 7.3, 0); plain(town, new THREE.BoxGeometry(7.6, 0.3, 17.4), at(q[0], 16.2, q[1], 0, rot, 0.34), [0.4, 0.42, 0.45]); plain(town, new THREE.BoxGeometry(0.3, 2.6, 17.4), at(e[0], 16.2, e[1], 0, rot, 0), [0.62, 0.74, 0.82]); }
      for (const [lx, hh] of [[-27, 52], [-33, 43]]) {
        const q = L(lx, 3);
        plain(town, new THREE.CylinderGeometry(1.5, 2.5, hh, 10), at(q[0], hh / 2, q[1]), brick); plain(town, new THREE.CylinderGeometry(1.75, 1.75, 1.4, 10), at(q[0], hh - 2.5, q[1]), [0.85, 0.84, 0.8]);
        farSmoke.push([q[0], hh + 0.5, q[1]]); beacons[0].push(q[0] + 1.9, hh - 0.5, q[1]);
      }
    } else if (kind === 'site') {
      // a building site: the frame of a house going up, and a crane whose arm turns
      const con = [0.72, 0.71, 0.68];
      for (let f = 0; f < 9; f++) plain(town, new THREE.BoxGeometry(22, 0.5, 16), at(x, 4.5 + f * 4.4, z, 0, rot, 0), con);
      for (const lx of [-10.5, -3.5, 3.5, 10.5]) for (const lz of [-7.5, 0, 7.5]) { const q = L(lx, lz); plain(town, new THREE.BoxGeometry(0.7, 40, 0.7), at(q[0], 20, q[1], 0, rot, 0), con); }
      const q = L(17, 2), H = 62, yel = [0.92, 0.7, 0.16];
      for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) plain(town, new THREE.BoxGeometry(0.35, H, 0.35), at(q[0] + lx, H / 2, q[1] + lz), yel);
      for (let y = 3; y < H; y += 3.2) for (const sg of [-1, 1]) { plain(town, new THREE.BoxGeometry(2.9, 0.22, 0.22), at(q[0], y, q[1] + sg, 0, 0, sg * 0.8), yel); plain(town, new THREE.BoxGeometry(0.22, 0.22, 2.9), at(q[0] + sg, y + 1.6, q[1], sg * 0.8, 0, 0), yel); }
      // the arm: built around its own middle (the top of the mast), turned as a whole every frame
      plain(spin, new THREE.BoxGeometry(46, 1.1, 1.1), at(13, 2.6, 0), yel); plain(spin, new THREE.BoxGeometry(46, 0.25, 0.25), at(13, 4.3, 0, 0, 0, 0), yel);
      for (let k = -9; k <= 35; k += 4) plain(spin, new THREE.BoxGeometry(0.2, 1.9, 0.2), at(k, 3.45, 0, 0, 0, k % 8 ? 0.5 : -0.5), yel);
      plain(spin, new THREE.BoxGeometry(4, 3, 2.6), at(-8.5, 1.9, 0), [0.6, 0.6, 0.6]); plain(spin, new THREE.BoxGeometry(2.4, 2.4, 2.4), at(0, 1.2, 1.9), [0.86, 0.88, 0.9]);
      plain(spin, new THREE.BoxGeometry(0.35, 9, 0.35), at(0, 6.5, 0), yel); plain(spin, new THREE.BoxGeometry(0.1, 26, 0.1), at(27, -10.5, 0), DARK); plain(spin, new THREE.BoxGeometry(1.1, 0.9, 1.1), at(27, -23.6, 0), DARK);
      crane.pos = [q[0], H, q[1]]; beacons[0].push(q[0], H + 11.4, q[1]);
    } else {
      // the big wheel: two legs on either side and a hub; the wheel itself turns (its own mesh)
      const R = 23, hub = R + 5;
      for (const sg of [-1, 1]) for (const lx of [-1, 1]) { const b = L(lx * 11, sg * 2.4), t = L(0, sg * 2.4); plain(town, new THREE.CylinderGeometry(0.5, 0.6, Math.hypot(11, hub), 6), along((b[0] + t[0]) / 2, hub / 2, (b[1] + t[1]) / 2, t[0] - b[0], hub, t[1] - b[1]), [0.88, 0.88, 0.9]); }
      plain(town, new THREE.CylinderGeometry(1.1, 1.1, 6, 10), along(x, hub, z, s, 0, c), STEEL);
      wheel.pos = [x, hub, z]; wheel.rot = rot;
      // (built lying in its own plane: x across, y up; it is stood where it belongs and turned every frame)
      const rim = [0.9, 0.3, 0.3];
      for (const sg of [-1, 1]) { plain(ring, new THREE.TorusGeometry(R, 0.32, 5, 40), at(0, 0, sg * 1.6), rim); plain(ring, new THREE.TorusGeometry(R * 0.55, 0.2, 4, 28), at(0, 0, sg * 1.6), [0.92, 0.92, 0.94]); }
      for (let k = 0; k < 16; k++) {
        const q = k / 16 * 6.283, cx = Math.cos(q), cy = Math.sin(q);
        for (const sg of [-1, 1]) plain(ring, new THREE.BoxGeometry(R, 0.16, 0.16), at(cx * R / 2, cy * R / 2, sg * 1.6, 0, 0, q), [0.92, 0.92, 0.94]);
        plain(ring, new THREE.CylinderGeometry(0.12, 0.12, 3.2, 4), at(cx * R, cy * R, 0, Math.PI / 2, 0, 0), STEEL);
        plain(ring, new THREE.SphereGeometry(1.5, 8, 6), at(cx * (R + 0.2), cy * (R + 0.2), 0, 0, 0, 0, 1, 0.9, 1), [[0.95, 0.76, 0.2], [0.3, 0.6, 0.86], [0.9, 0.36, 0.3], [0.4, 0.74, 0.5]][k % 4]);
      }
    }
  }
  // two balloons: striped, each with a basket; they go round far out, slowly
  for (const [a, r, y, c1, c2] of [[0.9, 118, 62, [0.9, 0.3, 0.26], [0.96, 0.9, 0.78]], [4.1, 150, 88, [0.2, 0.5, 0.8], [0.96, 0.8, 0.3]]]) {
    const x = Math.cos(a) * r, z = Math.sin(a) * r, stripes = (px, py, pz, n) => { const k = sunlit(n) * 1.05, c = Math.floor((Math.atan2(n.z, n.x) / 6.2832 + 0.5) * 12) % 2 ? c1 : c2; return [c[0] * k, c[1] * k, c[2] * k]; };
    const env = new THREE.SphereGeometry(7, 16, 12); env.deleteAttribute('uv'); balloons.add(env, at(x, y, z, 0, 0, 0, 1, 1.12, 1), { col: stripes });
    const neck = new THREE.CylinderGeometry(4.6, 1.5, 5.5, 16, 1, true); neck.deleteAttribute('uv'); balloons.add(neck, at(x, y - 8.6, z), { col: stripes });
    plain(balloons, new THREE.BoxGeometry(1.7, 1.3, 1.7), at(x, y - 13.6, z), [0.5, 0.36, 0.22]);
    for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) plain(balloons, new THREE.CylinderGeometry(0.04, 0.04, 2.6, 3), along(x + lx * 0.95, y - 11.9, z + lz * 0.95, lx * 0.22, 1, lz * 0.22), DARK);
  }

  // ---------- the train ----------
  // A small steam train: a tank engine in green with brass, a tender with coal, and a covered van. One still walks
  // on a flat top 2.2 m up on each (world.js; the engine's cab roof half a metre higher): the tanks beside the
  // boiler, the tender's lid and the van's roof boards are that top. Wheels turn and the engine's rods go round by
  // how far the train has run. Everything is built in the wagon's own measure: z forwards, x across, y up.
  const TR = world.TRAIN, DK = TR.DECK, CAB = TR.CAB, trainMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.25 });
  const GREEN = [0.04, 0.2, 0.09], GREEN_D = [0.03, 0.13, 0.06], BLACK = [0.03, 0.03, 0.035], IRON = [0.09, 0.09, 0.1], RED = [0.5, 0.05, 0.04], BRASS = [0.8, 0.52, 0.14], BRIGHT = [0.55, 0.57, 0.6], CREAM = [0.85, 0.72, 0.4], GOLD = [1.0, 0.68, 0.12], PLANK = [0.3, 0.13, 0.08];
  const X1 = (x, y, z) => along(x, y, z, 1, 0, 0), Z1 = (x, y, z) => along(x, y, z, 0, 0, 1), RX = new THREE.Matrix4(), M5 = new THREE.Matrix4();
  const turning = [], engine = {};
  const starShape = new THREE.Shape(); for (let i = 0; i < 10; i++) { const a = i / 10 * 6.2832 + Math.PI / 2, r = i % 2 ? 0.42 : 1; if (i) starShape.lineTo(Math.cos(a) * r, Math.sin(a) * r); else starShape.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
  // a mesh of the train's own, hung on a wagon (or left to be moved every frame)
  const hang = (B, grp, moving) => { const m = B.mesh(trainMat, { cast: true }); grp.add(m); m.matrixAutoUpdate = !!moving; m.frustumCulled = !moving; return m; };
  // One axle with a spoked wheel at either end. o: { r, pin: how far out the crank pin sits (0: none), quarter: the
  // far wheel's pin is a quarter turn ahead }
  function axle(grp, y, z, o) {
    const B = makeBatch(), R = o.r, XW = TR.CW / 2 - 0.12, col = o.col || RED;
    for (const sd of [-1, 1]) {
      RX.makeRotationX(sd > 0 && o.quarter ? Math.PI / 2 : 0);
      const put = (geo, m, c) => B.add(geo, M5.copy(RX).multiply(m), { col: c });
      put(new THREE.CylinderGeometry(R, R, 0.15, 26, 1, true), X1(sd * XW, 0, 0), BRIGHT);                                   // the tyre
      put(new THREE.CylinderGeometry(R + 0.035, R + 0.035, 0.03, 26, 1, true), X1(sd * (XW - 0.06), 0, 0), BRIGHT);           // its flange
      put(new THREE.RingGeometry(R - 0.075, R + 0.035, 26), at(sd * (XW + 0.076), 0, 0, 0, sd * Math.PI / 2, 0), BRIGHT);
      put(new THREE.RingGeometry(R - 0.15, R - 0.07, 26), at(sd * (XW + 0.05), 0, 0, 0, sd * Math.PI / 2, 0), col);
      put(new THREE.CircleGeometry(R + 0.03, 20), at(sd * (XW - 0.076), 0, 0, 0, -sd * Math.PI / 2, 0), IRON);                // the back of the wheel
      for (let k = 0; k < (o.spokes || 10); k++) { const a = k / (o.spokes || 10) * 6.2832, q = (R - 0.1) / 2 + 0.04; put(new THREE.BoxGeometry(0.05, R - 0.16, 0.045 + 0.02 * (R > 0.45)), at(sd * (XW + 0.03), Math.cos(a) * q, Math.sin(a) * q, a, 0, 0), col); }
      put(new THREE.CylinderGeometry(0.12, 0.12, 0.2, 12), X1(sd * (XW + 0.01), 0, 0), col);
      put(new THREE.CircleGeometry(0.07, 10), at(sd * (XW + 0.112), 0, 0, 0, sd * Math.PI / 2, 0), BRIGHT);
      if (o.pin) {
        put(new THREE.RingGeometry(R - 0.34, R - 0.075, 10, 1, Math.PI * 1.5 - 0.62, 1.24), at(sd * (XW + 0.062), 0, 0, 0, sd * Math.PI / 2, 0), col);   // the weight opposite the pin
        put(new THREE.CylinderGeometry(0.055, 0.055, 0.22, 8), X1(sd * (XW + 0.16), o.pin, 0), BRIGHT);
      }
    }
    B.add(new THREE.CylinderGeometry(0.07, 0.07, 2 * XW, 8), X1(0, 0, 0), { col: IRON });
    const m = hang(B, grp, true); m.position.set(0, y, z);
    turning.push({ m, r: R });
    return m;
  }
  // what every wagon has: a plate to stand the body on, buffer beams with buffers, a hook, steps
  function underframe(B, top, len) {
    box(B, 0, top - 0.04, 0, TR.CW, 0.08, len, { col: IRON });
    for (const sd of [-1, 1]) {
      box(B, sd * (TR.CW / 2 - 0.005), top - 0.1, 0, 0.03, 0.12, len, { col: RED });                       // the red edge
      box(B, sd * 1.12, top - 0.33, 0, 0.08, 0.5, len - 0.7, { col: BLACK });                             // the frames
      box(B, 0, top - 0.24, sd * (len / 2 - 0.07), TR.CW, 0.4, 0.14, { col: RED });                        // a buffer beam
      box(B, 0, top - 0.3, sd * (len / 2 + 0.13), 0.1, 0.12, 0.3, { col: IRON });                          // the hook
      for (const bx of [-0.86, 0.86]) {
        B.add(new THREE.CylinderGeometry(0.085, 0.11, 0.24, 10), Z1(bx, top - 0.24, sd * (len / 2 + 0.12)), { col: IRON });
        B.add(new THREE.CylinderGeometry(0.2, 0.2, 0.05, 14), Z1(bx, top - 0.24, sd * (len / 2 + 0.265)), { col: BRIGHT });
      }
    }
  }
  // a frame of thin lining on a side that faces x, and a gold star in the middle of it
  function lining(B, x, y0, y1, z0, z1, star) {
    const sd = Math.sign(x), e = 0.09;
    for (const y of [y0 + e, y1 - e]) box(B, x + sd * 0.006, y, (z0 + z1) / 2, 0.012, 0.028, z1 - z0 - 2 * e, { col: CREAM });
    for (const z of [z0 + e, z1 - e]) box(B, x + sd * 0.006, (y0 + y1) / 2, z, 0.012, y1 - y0 - 2 * e, 0.028, { col: CREAM });
    if (star) { const g = new THREE.ShapeGeometry(starShape); g.deleteAttribute('uv'); B.add(g, at(x + sd * 0.012, (y0 + y1) / 2, (z0 + z1) / 2, 0, sd * Math.PI / 2, 0, star), { col: GOLD }); }
  }
  // a plate over the gap to the next wagon, level with the top one walks on
  const gangway = (B, len) => { box(B, 0, DK - 0.025, -len / 2 - 0.36, 1.5, 0.05, 0.86, { col: IRON }); for (const sd of [-1, 1]) box(B, sd * 0.72, DK + 0.0, -len / 2 - 0.36, 0.05, 0.07, 0.86, { col: BRIGHT }); };

  for (const car of world.trainCars) {
    const B = makeBatch(), L = TR.CL, W = TR.CW, g = car.grp;
    if (car.kind === 'baz') {
      // ----- the engine -----
      const R = 0.5, AY = 0.2 + R, PL = AY + R + 0.08, PIN = 0.23, BY = 1.5, BR = DK - BY + 0.015;      // wheel, axle height, the plate's top, the boiler
      underframe(B, PL, L);
      // the boiler between the tanks, with bands; the smokebox in front of it with its door
      B.add(new THREE.CylinderGeometry(BR, BR, 2.95, 22, 1, true), Z1(0, BY, 0.575), { col: GREEN });
      for (const z of [-0.3, 0.75, 1.75]) B.add(new THREE.CylinderGeometry(BR + 0.012, BR + 0.012, 0.05, 22, 1, true), Z1(0, BY, z), { col: BRASS });
      B.add(new THREE.CylinderGeometry(BR + 0.04, BR + 0.04, 0.85, 22, 1, true), Z1(0, BY, 2.475), { col: BLACK });
      B.add(new THREE.CircleGeometry(BR + 0.04, 22), at(0, BY, 2.9), { col: BLACK });
      B.add(new THREE.SphereGeometry(BR + 0.04, 22, 6, 0, 6.2832, 0, 1.05), M5.copy(Z1(0, BY, 2.795)).scale(V2.set(1, 0.28, 1)), { col: BLACK });      // the round door, a little domed
      B.add(new THREE.TorusGeometry(BR - 0.12, 0.02, 5, 22), at(0, BY, 2.93), { col: BRIGHT });
      for (const a of [0.5, -0.9]) box(B, 0, BY, 3.012, 0.035, 0.42, 0.03, { col: BRIGHT, rz: a });                      // the door's two handles
      for (const y of [BY + 0.3, BY - 0.3]) box(B, -0.36, y, 2.97, 0.8, 0.045, 0.02, { col: IRON });                     // its hinges
      // the chimney with its brass cap, the brass dome, two safety valves and a whistle
      B.add(new THREE.CylinderGeometry(0.19, 0.25, 0.72, 16), at(0, DK + 0.4, 2.45), { col: BLACK });
      B.add(new THREE.CylinderGeometry(0.26, 0.37, 0.1, 16, 1, true), at(0, DK + 0.09, 2.45), { col: BLACK });
      B.add(new THREE.CylinderGeometry(0.3, 0.2, 0.16, 16), at(0, DK + 0.84, 2.45), { col: BRASS });
      B.add(new THREE.CircleGeometry(0.25, 16), at(0, DK + 0.925, 2.45, -Math.PI / 2, 0, 0), { col: [0.005, 0.005, 0.005] });
      B.add(new THREE.SphereGeometry(0.33, 18, 12), at(0, DK + 0.16, 1.25, 0, 0, 0, 1, 1.2, 1), { col: BRASS });
      B.add(new THREE.CylinderGeometry(0.36, 0.38, 0.06, 18), at(0, DK + 0.02, 1.25), { col: BRASS });
      for (const sx of [-0.12, 0.12]) { B.add(new THREE.CylinderGeometry(0.045, 0.06, 0.26, 8), at(sx, DK + 0.13, 0.15), { col: BRASS }); B.add(new THREE.SphereGeometry(0.05, 8, 6), at(sx, DK + 0.27, 0.15), { col: BRASS }); }
      B.add(new THREE.CylinderGeometry(0.03, 0.03, 0.3, 6), at(0.42, CAB.h + DK + 0.15, CAB.to - 0.25), { col: BRASS }); B.add(new THREE.CylinderGeometry(0.06, 0.06, 0.12, 8), at(0.42, CAB.h + DK + 0.3, CAB.to - 0.25), { col: BRASS });
      // the tanks beside the boiler: their tops are where one walks
      for (const sd of [-1, 1]) {
        box(B, sd * 1.145, (PL + DK) / 2, 0.55, 0.71, DK - PL, 2.9, { col: GREEN });
        box(B, sd * 1.145, DK - 0.004, 0.55, 0.69, 0.012, 2.88, { col: GREEN_D });                                       // the lid, a shade darker
        B.add(new THREE.CylinderGeometry(0.11, 0.11, 0.05, 12), at(sd * 1.15, DK + 0.02, 1.6), { col: BRASS });          // the filler
        lining(B, sd * 1.5, PL, DK, -0.9, 2.0, 0.24);
        B.add(new THREE.CylinderGeometry(0.018, 0.018, 2.7, 6), Z1(sd * 1.52, DK - 0.14, 0.55), { col: BRASS });         // a handrail along the tank
      }
      // the cab: sheets with round windows front and back, open sides with handrails, a roof one can stand on
      const c0 = CAB.from, c1 = CAB.to, RY = DK + CAB.h, cm = (c0 + c1) / 2;
      for (const [z, f] of [[c1 - 0.03, 1], [c0 + 0.03, -1]]) {
        box(B, 0, (PL + RY) / 2, z, W - 0.04, RY - PL, 0.06, { col: GREEN });
        for (const sx of [-0.98, 0.98]) { B.add(new THREE.RingGeometry(0.13, 0.17, 16), at(sx, DK + 0.25, z + f * 0.034, 0, f > 0 ? 0 : Math.PI, 0), { col: BRASS }); B.add(new THREE.CircleGeometry(0.13, 16), at(sx, DK + 0.25, z + f * 0.033, 0, f > 0 ? 0 : Math.PI, 0), { col: [0.02, 0.03, 0.05] }); }
      }
      for (const sd of [-1, 1]) {
        box(B, sd * (W / 2 - 0.03), PL + 0.4, cm, 0.06, 0.8, c1 - c0, { col: GREEN });                                   // the lower side sheet
        for (const z of [c0 + 0.16, c1 - 0.16]) box(B, sd * (W / 2 - 0.03), (PL + 0.8 + RY) / 2, z, 0.06, RY - PL - 0.8, 0.32, { col: GREEN });
        lining(B, sd * 1.5, PL, PL + 0.8, c0, c1, 0);
        for (const z of [c0 + 0.34, c1 - 0.34]) B.add(new THREE.CylinderGeometry(0.02, 0.02, RY - PL - 0.85, 6), at(sd * 1.51, (PL + 0.8 + RY) / 2, z), { col: BRASS });
        box(B, sd * 1.62, 0.56, cm, 0.3, 0.04, 0.5, { col: IRON }); box(B, sd * 1.52, 0.86, cm, 0.04, 0.62, 0.06, { col: IRON });      // a step up to the cab
      }
      box(B, 0, RY - 0.03, cm - 0.02, W + 0.16, 0.06, c1 - c0 + 0.12, { col: [0.05, 0.05, 0.055] });                      // the roof
      for (const z of [c0 - 0.05, c1 + 0.01]) box(B, 0, RY + 0.01, z, W + 0.18, 0.025, 0.05, { col: BRIGHT });
      // inside: the boiler's back with the fire door aglow, two gauges, the regulator
      B.add(new THREE.CircleGeometry(BR, 20), at(0, BY, c1 - 0.065, 0, Math.PI, 0), { col: BLACK });
      box(B, 0, BY - 0.25, c1 - 0.08, 0.42, 0.3, 0.03, { col: [5, 1.6, 0.25] }); box(B, 0, BY - 0.25, c1 - 0.075, 0.5, 0.38, 0.02, { col: IRON });
      for (const sx of [-0.3, 0.3]) B.add(new THREE.CircleGeometry(0.07, 10), at(sx, BY + 0.38, c1 - 0.07, 0, Math.PI, 0), { col: [0.9, 0.9, 0.85] });
      box(B, 0.1, BY + 0.15, c1 - 0.14, 0.5, 0.035, 0.035, { col: BRASS, rz: 0.4 });
      box(B, 0, PL + 0.02, cm, W - 0.2, 0.04, c1 - c0 - 0.1, { col: [0.2, 0.12, 0.07] });                                 // the wooden floor
      // the cylinders with their steam chests, and the bars the crosshead slides between
      for (const sd of [-1, 1]) {
        B.add(new THREE.CylinderGeometry(0.27, 0.27, 0.86, 16, 1, true), Z1(sd * 1.5, AY + 0.03, 2.25), { col: GREEN });
        for (const [z, f] of [[2.68, 0], [1.82, Math.PI]]) B.add(new THREE.CircleGeometry(0.27, 16), at(sd * 1.5, AY + 0.03, z, 0, f, 0), { col: BRIGHT });
        box(B, sd * 1.5, AY + 0.4, 2.25, 0.32, 0.22, 0.7, { col: BLACK });
        for (const dy of [0.12, -0.12]) box(B, sd * 1.585, AY + dy, 1.5, 0.05, 0.04, 0.66, { col: BRIGHT });
        box(B, sd * 1.5, AY + 0.22, 1.2, 0.2, 0.3, 0.05, { col: IRON });
        box(B, sd * 1.3, 0.42, 2.9, 0.04, 0.34, 0.1, { col: IRON });                                                       // a guard iron ahead of the wheels
      }
      // a lamp in front
      box(B, 0, PL + 0.16, L / 2 - 0.12, 0.2, 0.26, 0.18, { col: BLACK }); B.add(new THREE.CircleGeometry(0.075, 12), at(0, PL + 0.17, L / 2 - 0.028), { col: [6, 5.2, 3] });
      gangway(B, L);
      hang(B, g);
      // what moves: three axles, and on either side a coupling rod, a connecting rod and a crosshead
      const AZ = [-1.5, -0.1, 1.3], CL2 = 1.62;
      for (const z of AZ) axle(g, AY, z, { r: R, pin: PIN, quarter: true });
      engine.r = R; engine.sides = [-1, 1].map(sd => {
        const cr = makeBatch(), cn = makeBatch(), ch = makeBatch();
        box(cr, 0, 0, 0, 0.05, 0.1, AZ[2] - AZ[0], { col: BRIGHT }); for (const z of AZ) cr.add(new THREE.CylinderGeometry(0.095, 0.095, 0.06, 10), X1(0, 0, z - AZ[1]), { col: BRIGHT });
        box(cn, 0, 0, CL2 / 2, 0.045, 0.085, CL2, { col: BRIGHT }); cn.add(new THREE.CylinderGeometry(0.1, 0.1, 0.055, 10), X1(0, 0, 0), { col: BRIGHT }); cn.add(new THREE.CylinderGeometry(0.07, 0.07, 0.055, 10), X1(0, 0, CL2), { col: BRIGHT });
        box(ch, 0, 0, 0, 0.1, 0.2, 0.17, { col: IRON }); ch.add(new THREE.CylinderGeometry(0.028, 0.028, 0.62, 6), Z1(-0.08 * sd, 0.03, 0.39), { col: BRIGHT });
        return { x: sd * 1.515, x2: sd * 1.585, ph: sd > 0 ? Math.PI / 2 : 0, cr: hang(cr, g, true), cn: hang(cn, g, true), ch: hang(ch, g, true) };
      });
      engine.at = (th) => { for (const s of engine.sides) { const a = th + s.ph, py = PIN * Math.cos(a), pz = PIN * Math.sin(a); s.cr.position.set(s.x, AY + py, AZ[1] + pz); s.cn.position.set(s.x2, AY + py, AZ[1] + pz); s.cn.rotation.x = Math.asin(py / CL2); s.ch.position.set(s.x2, AY, AZ[1] + pz + Math.sqrt(CL2 * CL2 - py * py)); } };
    } else if (car.kind === 'tender') {
      // ----- the tender: water in the tank, coal on top at the front -----
      const R = 0.4, AY = 0.2 + R, PL = AY + R + 0.08, TY = DK - 0.1;
      underframe(B, PL, L);
      box(B, 0, (PL + TY) / 2, 0, W - 0.1, TY - PL, L - 0.3, { col: GREEN });
      for (const sd of [-1, 1]) { B.add(new THREE.CylinderGeometry(0.06, 0.06, L - 0.3, 8), Z1(sd * (W / 2 - 0.05), TY, 0), { col: GREEN }); B.add(new THREE.CylinderGeometry(0.06, 0.06, W - 0.1, 8), X1(0, TY, sd * (L / 2 - 0.15)), { col: GREEN }); lining(B, sd * (W / 2 - 0.05), PL, TY, -L / 2 + 0.15, L / 2 - 0.15, 0.27); }
      box(B, 0, DK - 0.05, -1.6, W - 0.22, 0.1, 2.5, { col: GREEN_D });                                                    // the lid over the water
      B.add(new THREE.CylinderGeometry(0.24, 0.26, 0.07, 14), at(0, DK + 0.03, -2.1), { col: BRASS });
      // the coal: a heap of lumps, a little higher than the top one walks on
      const coal = new THREE.IcosahedronGeometry(1, 3), cp = coal.attributes.position;
      for (let i = 0; i < cp.count; i++) { const x = cp.getX(i), y = cp.getY(i), z = cp.getZ(i), k = 0.86 + 0.34 * noise(x * 3.1 + 5, y * 3.1, z * 3.1) + 0.1 * noise(x * 9, y * 9 + 3, z * 9); cp.setXYZ(i, x * k, y * k, z * k); }
      coal.computeVertexNormals(); coal.deleteAttribute('uv');
      box(B, 0, TY + 0.004, 1.25, W - 0.24, 0.012, 3.2, { col: [0.02, 0.02, 0.022] });
      B.add(coal, at(0, DK - 0.36, 1.2, 0, 0, 0, 1.02, 0.42, 1.2), { col: (x, y, z) => { const k = 0.02 + 0.05 * noise(x * 14, y * 14, z * 14); return [k, k, k * 1.1]; } });
      for (const sd of [-1, 1]) { for (const y of [0.14, 0.3]) B.add(new THREE.CylinderGeometry(0.02, 0.02, 3.1, 6), Z1(sd * (W / 2 - 0.08), DK + y, 1.25), { col: IRON }); for (const z of [-0.3, 1.25, 2.8]) B.add(new THREE.CylinderGeometry(0.025, 0.025, 0.36, 6), at(sd * (W / 2 - 0.08), DK + 0.14, z), { col: IRON }); }
      gangway(B, L);
      hang(B, g);
      for (const z of [-1.95, 0, 1.95]) axle(g, AY, z, { r: R, spokes: 8 });
    } else {
      // ----- the van: boards, iron straps, a sliding door on either side, a roof with a walk along its top -----
      const R = 0.4, AY = 0.2 + R, PL = AY + R + 0.08, EY = DK - 0.09, HW = W / 2 - 0.07, HL = L / 2 - 0.14;
      underframe(B, PL, L);
      box(B, 0, (PL + EY) / 2, 0, 2 * HW - 0.06, EY - PL, 2 * HL - 0.06, { col: [0.03, 0.02, 0.015] });                    // the dark behind the boards
      const board = (x, z, w, d, k) => box(B, x, (PL + EY) / 2, z, w, EY - PL, d, { col: [PLANK[0] * k, PLANK[1] * k, PLANK[2] * k] });
      for (const sd of [-1, 1]) {
        for (let i = 0; i < 30; i++) { const z = -HL + (i + 0.5) * (2 * HL / 30); if (Math.abs(z) > 0.78) board(sd * HW, z, 0.05, 2 * HL / 30 - 0.012, 0.78 + rnd() * 0.44); }
        for (let i = 0; i < 8; i++) board(sd * (HW + 0.04), -0.75 + (i + 0.5) * 0.1875, 0.05, 0.176, 0.9 + rnd() * 0.4);    // the door, a board's thickness out
        box(B, sd * (HW + 0.075), EY - 0.07, 0.75, 0.03, 0.04, 3.1, { col: IRON }); box(B, sd * (HW + 0.075), PL + 0.06, 0.75, 0.03, 0.04, 3.1, { col: IRON });      // the rails it slides on
        box(B, sd * (HW + 0.08), (PL + EY) / 2, -0.62, 0.03, 0.2, 0.04, { col: BRIGHT });                                 // its handle
        for (const z of [-HL + 0.03, -0.82, 0.82, HL - 0.03]) box(B, sd * (HW + 0.03), (PL + EY) / 2, z, 0.035, EY - PL, 0.07, { col: IRON });
        for (const [zc, f] of [[-(HL + 0.82) / 2, 1], [(HL + 0.82) / 2, -1]]) box(B, sd * (HW + 0.032), (PL + EY) / 2, zc, 0.03, 0.05, Math.hypot(HL - 0.82, EY - PL) - 0.1, { col: IRON, rx: f * Math.atan2(EY - PL, HL - 0.82) });
        for (let i = 0; i < 14; i++) { const x = -HW + (i + 0.5) * (2 * HW / 14); box(B, x, (PL + EY) / 2, sd * HL, 2 * HW / 14 - 0.012, EY - PL, 0.05, { col: [PLANK[0] * (0.8 + rnd() * 0.4), PLANK[1] * (0.8 + rnd() * 0.4), PLANK[2] * (0.8 + rnd() * 0.4)] }); }
        for (const x of [-HW, HW]) box(B, x, (PL + EY) / 2, sd * (HL + 0.03), 0.07, EY - PL, 0.035, { col: IRON });
      }
      // the roof: a low arch of tarred cloth over ribs, and boards along the middle to walk on
      const N = 10, RISE = 0.07, top = x => EY + 0.02 + RISE * (1 - (x / (HW + 0.12)) * (x / (HW + 0.12)));
      for (let i = 0; i < N; i++) {
        const x0 = -(HW + 0.12) + i * 2 * (HW + 0.12) / N, x1 = x0 + 2 * (HW + 0.12) / N, y0 = top(x0), y1 = top(x1), z0 = -HL - 0.12, z1 = HL + 0.12, n = NV.set(y0 - y1, x1 - x0, 0).normalize();
        for (const p of [[x0, y0, z1], [x1, y1, z1], [x1, y1, z0], [x0, y0, z1], [x1, y1, z0], [x0, y0, z0]]) B.vert(p[0], p[1], p[2], n.x, n.y, n.z, 0, 0, [0.045, 0.047, 0.052]);
      }
      for (const z of [-HL - 0.12, HL + 0.12]) box(B, 0, EY + 0.0, z, 2 * HW + 0.24, 0.07, 0.03, { col: IRON });
      for (const x of [-0.26, 0, 0.26]) box(B, x, DK - 0.012, 0, 0.24, 0.024, 2 * HL + 0.1, { col: [0.36, 0.25, 0.14] });
      // a red lamp at the tail
      box(B, 0.9, PL + 0.5, -L / 2 + 0.04, 0.16, 0.22, 0.14, { col: BLACK }); B.add(new THREE.CircleGeometry(0.06, 12), at(0.9, PL + 0.5, -L / 2 - 0.032, 0, Math.PI, 0), { col: [7, 0.5, 0.3] });
      hang(B, g);
      for (const z of [-1.8, 1.8]) axle(g, AY, z, { r: R, spokes: 8, col: IRON });
    }
  }

  // ---------- the sky ----------
  // One big dome that follows the eye: blue that pales towards the haze at the horizon, the sun with warmth around
  // it, and clouds worked out for every point of the sky (soft heaps that drift, lit from the sun's side, with thin
  // streaks high above). The far end of the arena and the town fade into the same haze (`haze` is also the fog).
  const haze = new THREE.Color(0xc5d6e2);
  const skyMat = new THREE.ShaderMaterial({
    uniforms: { uTime: time, uSun: { value: SUNV }, uZen: { value: new THREE.Color(0x2f6fc0) }, uMid: { value: new THREE.Color(0x6fa6de) }, uHor: { value: haze } },
    vertexShader: 'varying vec3 vDir;\nvoid main() {\n\tvDir = position;\n\tvec4 p = viewMatrix * vec4(position, 0.0);\n\tgl_Position = projectionMatrix * vec4(p.xyz, 1.0);\n\tgl_Position.z = gl_Position.w;\n}',
    fragmentShader: [
      'uniform float uTime; uniform vec3 uSun, uZen, uMid, uHor; varying vec3 vDir;',
      'float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }',
      'float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }',
      'float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * noise(p); p = p * 2.03 + vec2(17.0, 9.2); a *= 0.5; } return s; }',
      'void main() {',
      '\tvec3 d = normalize(vDir); float h = max(d.y, 0.0), sd = max(dot(d, uSun), 0.0);',
      '\tvec3 col = mix(uHor, uMid, smoothstep(0.0, 0.3, h)); col = mix(col, uZen, smoothstep(0.22, 0.95, h));',
      '\tcol += vec3(1.0, 0.74, 0.46) * pow(sd, 5.0) * 0.16 * (1.0 - 0.5 * h);',            // warmth on the sun's side of the sky
      '\tif (d.y > 0.012) {',
      '\t\tvec2 p = d.xz / (d.y + 0.13), w = vec2(uTime * 0.007, uTime * 0.003);',
      '\t\tfloat n = fbm(p * 0.8 + w), cov = smoothstep(0.47, 0.72, n + 0.1 * fbm(p * 3.3 - w * 2.0));',
      '\t\tfloat lit = clamp((n - fbm((p + normalize(uSun.xz) * 0.16) * 0.8 + w)) * 3.2 + 0.6, 0.0, 1.0);',      // thinner towards the sun: bright
      '\t\tvec3 cl = mix(vec3(0.52, 0.58, 0.69), vec3(1.0, 0.985, 0.96), lit) + vec3(1.0, 0.8, 0.55) * pow(sd, 8.0) * 0.2;',
      '\t\tfloat far = smoothstep(0.012, 0.2, d.y);',
      '\t\tfloat high = smoothstep(0.52, 0.86, fbm(p * vec2(0.3, 1.5) + vec2(7.0, 3.0) + w * 0.4)) * 0.3;',
      '\t\tcol = mix(col, vec3(0.93, 0.95, 0.98), high * far * (1.0 - cov));',
      '\t\tcol = mix(col, mix(uHor, cl, 0.4 + 0.6 * far), cov * far * 0.94);',
      '\t}',
      '\tcol += vec3(1.0, 0.9, 0.72) * pow(sd, 120.0) * 0.5 + vec3(1.0, 0.96, 0.86) * smoothstep(0.99935, 0.9997, sd) * 2.5;',      // the glow and the disc
      '\tgl_FragColor = vec4(col, 1.0);',
      '\t#include <tonemapping_fragment>',
      '\t#include <colorspace_fragment>',
      '}'].join('\n'),
    side: THREE.BackSide, depthWrite: false, fog: false,
  });
  const skyGeo = new THREE.SphereGeometry(1, 32, 20); skyGeo.deleteAttribute('uv'); skyGeo.deleteAttribute('normal');
  const sky = new THREE.Mesh(skyGeo, skyMat); sky.frustumCulled = false; sky.renderOrder = 900; sky.matrixAutoUpdate = false; scene.add(sky);       // drawn after the solid things: only where sky shows
  // lamps that blink on the tall roofs, in two beats
  const lamps = beacons.map((list, i) => {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(list, 3));
    const p = new THREE.Points(g, new THREE.PointsMaterial({ map: glowTex, color: 0xff3a2a, size: 7, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); p.frustumCulled = false; p.userData.beat = i; scene.add(p);
    return p;
  });
  // the smoke of the works' chimneys: puffs that rise, drift with the wind and thin out. Each puff is a square that
  // faces the eye; where it is in its life is worked out from the clock on the graphics card.
  const smokeMat = new THREE.ShaderMaterial({
    uniforms: { uTime: time, uHor: { value: haze } },
    vertexShader: 'attribute vec2 aCorner; attribute float aPhase; uniform float uTime; varying float vA; varying vec2 vC;\nvoid main() {\n\tfloat k = fract(uTime * 0.04 + aPhase);\n\tvec3 p = position + vec3(k * 30.0 + sin(aPhase * 40.0 + k * 5.0) * 3.0 * k, k * 44.0, k * 13.0 + cos(aPhase * 31.0 + k * 4.0) * 3.0 * k);\n\tvec4 mv = modelViewMatrix * vec4(p, 1.0);\n\tmv.xy += aCorner * mix(2.2, 11.0, sqrt(k));\n\tgl_Position = projectionMatrix * mv;\n\tvA = smoothstep(0.0, 0.06, k) * (1.0 - k) * 0.5; vC = aCorner;\n}',
    fragmentShader: 'uniform vec3 uHor; varying float vA; varying vec2 vC;\nvoid main() {\n\tfloat a = smoothstep(1.0, 0.25, length(vC)) * vA;\n\tif (a < 0.004) discard;\n\tgl_FragColor = vec4(mix(vec3(0.6, 0.6, 0.6), uHor, 0.3), a);\n\t#include <tonemapping_fragment>\n\t#include <colorspace_fragment>\n}',
    transparent: true, depthWrite: false, fog: false,
  });
  { const P = [], Cn = [], Ph = [], N = 14;
    for (const q of farSmoke) for (let i = 0; i < N; i++) for (const c of [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]]) { P.push(q[0], q[1], q[2]); Cn.push(c[0], c[1]); Ph.push(i / N + q[0] * 0.013); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('aCorner', new THREE.Float32BufferAttribute(Cn, 2)); g.setAttribute('aPhase', new THREE.Float32BufferAttribute(Ph, 1));
    const m = new THREE.Mesh(g, smokeMat); m.frustumCulled = false; m.renderOrder = 3; scene.add(m); }
  // what flaps: a few corners, each with its own beat (in the uv: where in the beat, how fast)
  const flapMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
  flapMat.onBeforeCompile = sh => { sh.uniforms.uTime = time; sh.vertexShader = 'uniform float uTime;\nattribute float aSway;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n\ttransformed.y += sin(uTime * uv.y + uv.x) * aSway;'); };
  flapMat.defines = { USE_UV: '' };
  const flyer = (tris, beat, speed) => {
    const g = new THREE.BufferGeometry(), P = [], C = [], S = [], U = [], N = [];
    for (const t of tris) { P.push(t[0], t[1], t[2]); C.push(t[3], t[4], t[5]); S.push(t[6]); U.push(beat, speed); N.push(0, 1, 0); }
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); g.setAttribute('aSway', new THREE.Float32BufferAttribute(S, 1));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    const m = new THREE.Mesh(g, flapMat); m.frustumCulled = false; scene.add(m);
    return m;
  };
  const birds = [], flies = [];
  for (let i = 0; i < 7; i++) {
    const c = 0.1 + rnd() * 0.1, w = 0.34, T3 = [[0, 0, 0.42, c, c, c, 0], [0.07, 0, 0, c, c, c, 0], [-0.07, 0, 0, c, c, c, 0], [0.07, 0, 0, c, c, c, 0], [0, 0, -0.46, c, c, c, 0], [-0.07, 0, 0, c, c, c, 0]];
    for (const s of [-1, 1]) T3.push([s * 0.06, 0, 0.14, c, c, c, 0], [s * 0.06, 0, -0.12, c, c, c, 0], [s * 0.85, 0, -0.06, c * 1.6, c * 1.6, c * 1.7, w]);
    birds.push({ m: flyer(T3, rnd() * 6, 7 + rnd() * 3), cx: (rnd() - 0.5) * 40, cz: (rnd() - 0.5) * 60, r: 16 + rnd() * 30, y: 15 + rnd() * 18, w: (0.14 + rnd() * 0.12) * (rnd() < 0.5 ? -1 : 1), a: rnd() * 6.283 });
  }
  for (let i = 0; i < 9; i++) {
    const col = PETALS[1 + (i % (PETALS.length - 1))], d = [col[0] * 0.5, col[1] * 0.5, col[2] * 0.5], T3 = [];
    for (const s of [-1, 1]) T3.push([0, 0, 0.05, d[0], d[1], d[2], 0], [0, 0, -0.03, d[0], d[1], d[2], 0], [s * 0.1, 0, 0.08, col[0], col[1], col[2], 0.085], [0, 0, -0.01, d[0], d[1], d[2], 0], [0, 0, -0.06, d[0], d[1], d[2], 0], [s * 0.075, 0, -0.08, col[0], col[1], col[2], 0.065]);
    const x = (rnd() * 2 - 1) * (AW - 6), z = (rnd() * 2 - 1) * (ZMID - 5);
    flies.push({ m: flyer(T3, rnd() * 6, 17 + rnd() * 8), x, z, p: [rnd() * 6, rnd() * 6, rnd() * 6, rnd() * 6], lx: x, lz: z });
  }

  // ---------- into the picture ----------
  const meshes = {
    leaves: leaves.mesh(leafMat, { cast: true, name: 'leaves' }), twigs: twigs.mesh(leafMat, { name: 'twigs' }), solid: solid.mesh(solidMat, { cast: true, name: 'solid' }),
    turf: turf.mesh(turfMat, { name: 'turf' }), pave: pave.mesh(paveMat, { name: 'pave' }), blades: blades.mesh(bladeMat, { name: 'blades' }),
    lit: lit.mesh(litMat, { receive: false, name: 'lit' }), glow: glow.mesh(glowMat, { receive: false, name: 'glow', order: 2 }),
  };
  for (const [name, t] of Object.entries(TB)) meshes[name] = t.b.mesh(t.mat, { cast: true, name });
  for (const [name, t] of Object.entries(TL)) meshes[name + 'Lit'] = t.b.mesh(t.mat, { receive: false, name: name + 'Lit' });
  meshes.tunWall = tunWall.mesh(dimMat('brickTan'), { receive: false, name: 'tunWall' }); meshes.tunFloor = tunFloor.mesh(dimMat('concrete'), { receive: false, name: 'tunFloor' });
  meshes.shade = shade.mesh(shadeMat, { receive: false, name: 'shade', order: 1 });
  meshes.flags = flags.mesh(flagMat, { cast: true, name: 'flags' });
  const townMat = new THREE.MeshBasicMaterial({ map: townTex, vertexColors: true });
  meshes.town = town.mesh(townMat, { receive: false, name: 'town' });
  // what turns or drifts out there: the crane's arm, the big wheel, the balloons
  const craneArm = spin.mesh(townMat, { receive: false, name: 'crane' }), bigWheel = ring.mesh(townMat, { receive: false, name: 'wheel' }), drift = balloons.mesh(townMat, { receive: false, name: 'balloons' });
  for (const m of [craneArm, bigWheel, drift]) { m.matrixAutoUpdate = true; m.frustumCulled = false; }
  if (crane.pos) craneArm.position.fromArray(crane.pos);
  if (wheel.pos) bigWheel.position.fromArray(wheel.pos);
  ICO.dispose(); ICO0.dispose(); ROCK.dispose();

  return {
    meshes, smokers, haze,
    // every frame. t: seconds, any clock that runs evenly
    tick(dt, t) {
      time.value = t;
      { const head = world.trainHead(); for (const w of turning) w.m.rotation.x = head / w.r; if (engine.at) engine.at(head / engine.r); }
      craneArm.rotation.y = 0.6 + 1.3 * Math.sin(t * 0.045);
      bigWheel.rotation.set(0, wheel.rot || 0, t * 0.07, 'YXZ');
      drift.rotation.y = t * 0.0045; drift.position.y = 2.5 * Math.sin(t * 0.11);
      for (const p of lamps) p.material.opacity = (t * 0.55 + p.userData.beat * 0.5) % 1 < 0.28 ? 1 : 0.12;
      for (const b of birds) {
        const a = b.a + t * b.w, s = Math.sign(b.w);
        b.m.position.set(b.cx + Math.cos(a) * b.r, b.y + Math.sin(t * 0.3 + b.a) * 1.5, b.cz + Math.sin(a) * b.r);
        b.m.rotation.set(0, Math.atan2(-Math.sin(a) * s, Math.cos(a) * s), -s * 0.3, 'YXZ');
      }
      for (const f of flies) {
        const p = f.p, x = f.x + 2.2 * Math.sin(t * 0.45 + p[0]) + 0.6 * Math.sin(t * 1.7 + p[1]), z = f.z + 2.2 * Math.cos(t * 0.38 + p[2]) + 0.6 * Math.sin(t * 1.3 + p[3]);
        f.m.position.set(x, 0.5 + 0.28 * Math.sin(t * 1.9 + p[0]) + 0.08 * Math.sin(t * 5.3 + p[1]), z);
        if (Math.abs(x - f.lx) + Math.abs(z - f.lz) > 1e-4) f.m.rotation.y = Math.atan2(x - f.lx, z - f.lz);
        f.lx = x; f.lz = z;
      }
      for (const d of drips) {
        const k = ((t + d.phase) % d.period) / d.period;
        d.drop.visible = k < 0.42; d.ring.visible = k >= 0.42 && k < 0.8;
        if (d.drop.visible) { const f = k / 0.42; d.drop.position.set(d.x, CY - 0.3 + (FY - CY + 0.3) * f * f, d.z); }
        else if (d.ring.visible) { const f = (k - 0.42) / 0.38; d.ring.scale.setScalar(0.08 + f * 0.45); d.ring.material.opacity = 0.7 * (1 - f); }
      }
    },
    // how much of the small stuff is drawn: 0 the least (no tufts, flowers, sprigs on the hedges or butterflies)
    setDetail(n) { meshes.blades.visible = meshes.twigs.visible = n > 0; for (const f of flies) f.m.visible = n > 0; },
    count() { let n = 0; for (const m of Object.values(meshes)) n += m.geometry.attributes.position.count / 3; return n; },
  };
}
