// SLQ Game Lobby — where the shooter's robots can walk. The arena is covered with a grid of standing places, and
// two places are joined when a walker really gets from one to the other: every step is tried with the arena's
// own movement rules (world.js), so stairs, doors, ramps and cellars come out by themselves and a path
// found here can be walked. Built once, when the first match with robots starts (about a tenth of a second).
import { STEP } from '../public/shooter/world.js';

const CELL = 0.5;                    // metres between two standing places
const DIRS = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
const BUCKET = 4, MARGIN = 1.3;      // the arena is cut in squares of this size while building, to try fewer walls
const MAX_DROP = 0.6;                // a robot steps down a stair, never off an edge: whether a jump down lands where
                                     // it should is not something this simple walk can tell

export function buildNav(world, seeds) {
  const W = 85, D = 110, ox = -W / 2, oz = -D / 2;
  const nxCells = Math.round(W / CELL) + 1, nzCells = Math.round(D / CELL) + 1;
  const X = [], Y = [], Z = [], E = [];          // per place: position, and its (up to 8) neighbours or -1
  const cellOf = new Map();                      // cell number -> the places in it (one per storey)
  const cellNo = (ix, iz) => iz * nxCells + ix;

  function placeAt(ix, iz, y, make) {
    const k = cellNo(ix, iz);
    let list = cellOf.get(k);
    if (list) for (const n of list) if (Math.abs(Y[n] - y) < 0.3) return n;
    if (!make) return -1;
    const n = X.length;
    X.push(ox + ix * CELL); Z.push(oz + iz * CELL); Y.push(y); E.push(-1, -1, -1, -1, -1, -1, -1, -1);
    if (!list) cellOf.set(k, list = []);
    list.push(n);
    return n;
  }

  // A walk in small steps from (ax, ay, az) towards (bx, bz), steering at the goal all the way: the height where
  // it arrives, or NaN when it does not get there. The feet follow the ground: up a step at most, down as far as
  // it goes. A place only counts when one can also stand still on it (nothing overhead shoves the walker away).
  const p = { x: 0, y: 0, z: 0 };
  function walk(ax, ay, az, bx, bz) {
    p.x = ax; p.y = ay; p.z = az;
    const max = Math.ceil(Math.hypot(bx - ax, bz - az) / 0.25) + 2;
    for (let i = 0; i < max; i++) {
      const dx = bx - p.x, dz = bz - p.z, d = Math.hypot(dx, dz);
      if (d < 0.02) break;
      const s = Math.min(d, 0.25);
      world.moveHoriz(p, dx / d * s, dz / d * s);
      let g = world.groundUnder(p.x, p.z, p.y);
      if (g < p.y - STEP) {
        // an edge: a crack narrower than a stride is walked across (as the real walker does), anything else is a drop
        const ux = dx / d, uz = dz / d;
        if (world.groundUnder(p.x + ux * 0.25, p.z + uz * 0.25, p.y) >= p.y - 0.1 || world.groundUnder(p.x + ux * 0.45, p.z + uz * 0.45, p.y) >= p.y - 0.1) g = p.y;
        else if (g < p.y - MAX_DROP) return NaN;
      }
      p.y = g;
    }
    if (world.groundUnder(p.x, p.z, p.y) < p.y - STEP) return NaN;      // ended over a crack: nowhere to stand
    world.moveHoriz(p, 0, 0);
    return Math.hypot(bx - p.x, bz - p.z) < 0.05 ? p.y : NaN;
  }

  // ---- flood from the seeds, one square of the arena at a time (so only the walls nearby are tried) ----
  const allC = world.colliders.slice(), allS = world.surfaces.slice();
  const bw = Math.ceil(W / BUCKET), bd = Math.ceil(D / BUCKET), pending = new Map();
  const bucketOf = n => Math.min(bd - 1, Math.floor((Z[n] - oz) / BUCKET)) * bw + Math.min(bw - 1, Math.floor((X[n] - ox) / BUCKET));
  const queue = n => { const b = bucketOf(n); let l = pending.get(b); if (!l) pending.set(b, l = []); l.push(n); };
  try {
    for (const s of seeds) {
      const ix = Math.round((s[0] - ox) / CELL), iz = Math.round((s[1] - oz) / CELL);
      const y = world.groundUnder(ox + ix * CELL, oz + iz * CELL, s[2] || 0);
      if (placeAt(ix, iz, y, false) < 0) queue(placeAt(ix, iz, y, true));
    }
    while (pending.size) {
      const [b, list] = pending.entries().next().value;
      pending.delete(b);
      const x0 = ox + (b % bw) * BUCKET - MARGIN, x1 = x0 + BUCKET + 2 * MARGIN, z0 = oz + Math.floor(b / bw) * BUCKET - MARGIN, z1 = z0 + BUCKET + 2 * MARGIN;
      const inside = r => r.maxX >= x0 && r.minX <= x1 && r.maxZ >= z0 && r.minZ <= z1;
      world.colliders.length = 0; for (const c of allC) if (inside(c)) world.colliders.push(c);
      world.surfaces.length = 0; for (const s of allS) if (inside(s)) world.surfaces.push(s);
      for (let qi = 0; qi < list.length; qi++) {
        const a = list[qi], ix = Math.round((X[a] - ox) / CELL), iz = Math.round((Z[a] - oz) / CELL);
        for (let d = 0; d < 8; d++) {
          const jx = ix + DIRS[d][0], jz = iz + DIRS[d][1];
          if (jx < 1 || jz < 1 || jx >= nxCells - 1 || jz >= nzCells - 1) continue;
          const y = walk(X[a], Y[a], Z[a], ox + jx * CELL, oz + jz * CELL);
          if (Number.isNaN(y)) continue;
          let n = placeAt(jx, jz, y, false);
          if (n < 0) { n = placeAt(jx, jz, y, true); if (bucketOf(n) === b) list.push(n); else queue(n); }
          E[a * 8 + d] = n;
        }
      }
    }
  } finally {
    world.colliders.length = 0; for (const c of allC) world.colliders.push(c);
    world.surfaces.length = 0; for (const s of allS) world.surfaces.push(s);
  }

  const N = X.length, nx = Float32Array.from(X), ny = Float32Array.from(Y), nz = Float32Array.from(Z), edges = Int32Array.from(E);

  // The place nearest to a point, on the same storey (or -1 when there is none within a couple of metres).
  function near(x, y, z, reach = 2) {
    const ix = Math.round((x - ox) / CELL), iz = Math.round((z - oz) / CELL), r = Math.ceil(reach / CELL);
    let best = -1, bd2 = 1e9;
    for (let ring = 0; ring <= r; ring++) {
      for (let dz = -ring; dz <= ring; dz++) for (let dx = -ring; dx <= ring; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue;
        const jx = ix + dx, jz = iz + dz;
        if (jx < 0 || jz < 0 || jx >= nxCells || jz >= nzCells) continue;
        const list = cellOf.get(cellNo(jx, jz)); if (!list) continue;
        for (const n of list) {
          const hy = ny[n] - y; if (hy > STEP + 0.3 || hy < -1.6) continue;
          const d2 = (nx[n] - x) ** 2 + (nz[n] - z) ** 2 + hy * hy * 4;
          if (d2 < bd2) { bd2 = d2; best = n; }
        }
      }
      if (best >= 0 && ring * CELL > Math.sqrt(bd2)) break;
    }
    return best;
  }

  // ---- a short way (A*, leaning towards the goal: a little longer than the shortest, found much sooner) ----
  const gCost = new Float32Array(N), from = new Int32Array(N), mark = new Int32Array(N), done = new Int32Array(N);
  const hf = new Float32Array(N * 8 + 8), hn = new Int32Array(N * 8 + 8);
  let run = 0;
  const cost = (a, b) => {
    const dy = ny[b] - ny[a];
    return Math.hypot(nx[b] - nx[a], nz[b] - nz[a]) + (dy < -1 ? 0.5 - dy * 0.15 : Math.abs(dy) * 0.5);
  };
  function path(a, b) {
    if (a < 0 || b < 0) return null;
    if (a === b) return [a];
    run++;
    let size = 0;
    const bx = nx[b], by = ny[b], bz = nz[b];
    const h = n => 1.4 * Math.hypot(nx[n] - bx, nz[n] - bz, ny[n] - by);
    const push = (n, f) => {
      let i = size++;
      while (i > 0) { const up = (i - 1) >> 1; if (hf[up] <= f) break; hf[i] = hf[up]; hn[i] = hn[up]; i = up; }
      hf[i] = f; hn[i] = n;
    };
    const pop = () => {
      const top = hn[0], f = hf[--size], n = hn[size];
      let i = 0;
      for (;;) {
        let c = 2 * i + 1; if (c >= size) break;
        if (c + 1 < size && hf[c + 1] < hf[c]) c++;
        if (hf[c] >= f) break;
        hf[i] = hf[c]; hn[i] = hn[c]; i = c;
      }
      hf[i] = f; hn[i] = n;
      return top;
    };
    gCost[a] = 0; from[a] = -1; mark[a] = run; push(a, h(a));
    while (size) {
      const n = pop();
      if (n === b) { const out = []; for (let k = b; k >= 0; k = from[k]) out.push(k); return out.reverse(); }
      if (done[n] === run) continue;
      done[n] = run;
      for (let d = 0; d < 8; d++) {
        const m = edges[n * 8 + d]; if (m < 0 || done[m] === run) continue;
        const g = gCost[n] + cost(n, m);
        if (mark[m] === run && g >= gCost[m]) continue;
        mark[m] = run; gCost[m] = g; from[m] = n; push(m, g + h(m));
      }
    }
    return null;
  }

  // Can a walker go straight from one point to another (same rules as the grid, all walls)?
  function straight(ax, ay, az, bx, bz, by) {
    const y = walk(ax, ay, az, bx, bz);
    return !Number.isNaN(y) && Math.abs(y - by) < 0.6;
  }

  return { size: N, x: nx, y: ny, z: nz, edges, near, path, straight, cell: CELL };
}
