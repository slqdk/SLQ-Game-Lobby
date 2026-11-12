// The clubhouse as both sides know it: its size, the furniture, where one can walk, and how to get from A to B.
// Units are "steps": the room is 24 wide (x, left to right) and 13 deep (y, from the back wall towards the viewer).
// The server finds every path and sends it along; the browser uses the same code to start walking at once.

export const ROOM = { w: 24, d: 13, cell: 0.5, speed: 4.4, spawn: [22.0, 2.1], pad: 0.32 };

// kind      what using it does (the browser decides how)
// box       [x, y, w, d] footprint that blocks walking          round  [cx, cy, rx, ry] the same for round things
// wall      [x, z, w, h] something hanging on the back wall     floor  [cx, cy, r] something painted on the floor
// h         height                                              use    where an avatar stands to use it
// seats     [x, y] of each seat; `on` means the seats are on the furniture itself (the sofa)
export const STATIONS = [
  { id: 'wardrobe', kind: 'wardrobe', name: 'Garderoben', box: [0.9, 0.2, 2.2, 0.9], h: 2.7, use: [2.0, 1.9] },
  { id: 'kiosk', kind: 'shop', name: 'Kiosken', box: [3.9, 0.2, 3.2, 1.1], h: 1.15, use: [5.5, 2.1] },
  { id: 'bar', kind: 'bar', name: 'Baren', box: [8.2, 0.2, 5.4, 1.2], h: 1.3, use: [10.9, 2.7], high: true,
    seats: [[8.95, 2.0], [10.25, 2.0], [11.55, 2.0], [12.85, 2.0]] },
  { id: 'board', kind: 'scores', name: 'Opslagstavlen', wall: [14.4, 1.2, 2.2, 1.55], use: [15.5, 1.3] },
  { id: 'arcade', kind: 'game', name: 'Arkaden', games: ['shooter'], box: [17.3, 0.2, 1.4, 1.1], h: 2.6, use: [18.0, 2.1] },
  { id: 'jukebox', kind: 'sound', name: 'Musikboksen', box: [19.2, 0.2, 1.1, 0.85], h: 1.9, use: [19.75, 1.8] },
  { id: 'door', kind: 'door', name: 'Udgangen', wall: [21.2, 0, 1.6, 2.65], use: [22.0, 1.2] },
  { id: 'games', kind: 'game', name: 'Brætspilsbordet', games: ['c4', 'ludo'], box: [3.9, 5.3, 2.8, 1.7], h: 0.9, use: [5.3, 7.8],
    seats: [[3.25, 6.4], [7.35, 6.4], [5.3, 4.8], [5.3, 7.6]] },
  { id: 'dice', kind: 'game', name: 'Terningebordet', games: ['yatzy', 'meyer'], round: [11.6, 5.9, 1.25, 1.25], h: 0.9, use: [11.6, 7.8],
    seats: [[9.85, 6.0], [13.35, 6.0], [10.6, 4.4], [12.6, 4.4], [10.6, 7.5], [12.6, 7.5]] },
  { id: 'cards', kind: 'game', name: 'Kortbordet', games: ['poker'], round: [17.9, 6.4, 2.0, 1.1], h: 0.9, use: [17.9, 8.15],
    seats: [[15.3, 6.5], [20.5, 6.5], [16.9, 4.8], [18.9, 4.8], [16.9, 8.0], [18.9, 8.0]] },
  { id: 'command', kind: 'game', name: 'Kommandobordet', games: ['eagleeye'], box: [9.3, 9.8, 2.9, 1.6], h: 0.95, use: [10.75, 12.1],
    seats: [[8.65, 10.7], [12.85, 10.7], [10.75, 9.3], [10.75, 11.95]] },
  { id: 'sofa', kind: 'sit', name: 'Sofaen', box: [18.4, 10.3, 4.2, 1.2], h: 1.45, use: [20.5, 12.1], on: true,
    seats: [[19.35, 11.1], [20.5, 11.1], [21.65, 11.1]] },
  { id: 'dance', kind: 'dance', name: 'Dansegulvet', floor: [4.2, 10.4, 1.9], use: [4.2, 10.4] },
  { id: 'plant1', kind: 'decor', round: [0.95, 12.05, 0.42, 0.42], h: 1.6 },
  { id: 'plant2', kind: 'decor', round: [23.25, 1.0, 0.38, 0.38], h: 1.6 },
  { id: 'lamp', kind: 'decor', round: [23.3, 10.9, 0.28, 0.28], h: 2.6 },
];
export const STATION = Object.fromEntries(STATIONS.map(s => [s.id, s]));

const r2 = v => Math.round(v * 100) / 100;
const P = ROOM.pad;

// Can an avatar stand with its feet at this point?
function blockedAt(x, y) {
  if (!(x >= 0.45 && x <= ROOM.w - 0.45 && y >= 0.55 && y <= ROOM.d - 0.35)) return true;
  for (const s of STATIONS) {
    if (s.box) { const [bx, by, bw, bd] = s.box; if (x > bx - P && x < bx + bw + P && y > by - P * 0.6 && y < by + bd + P * 0.8) return true; }
    else if (s.round) { const [cx, cy, rx, ry] = s.round, dx = (x - cx) / (rx + P), dy = (y - cy) / (ry + P * 0.8); if (dx * dx + dy * dy < 1) return true; }
  }
  return false;
}
export const isFree = (x, y) => !blockedAt(x, y);

// The walk grid: one flag per cell, set when the middle of the cell is blocked.
const C = ROOM.cell, GW = Math.round(ROOM.w / C), GH = Math.round(ROOM.d / C);
const grid = new Uint8Array(GW * GH);
for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) grid[j * GW + i] = blockedAt((i + 0.5) * C, (j + 0.5) * C) ? 1 : 0;
const cellFree = (i, j) => i >= 0 && j >= 0 && i < GW && j < GH && !grid[j * GW + i];

// The free cell closest to a point (the cell itself when it is free).
function cellNear(x, y) {
  const ci = Math.min(GW - 1, Math.max(0, Math.floor(x / C))), cj = Math.min(GH - 1, Math.max(0, Math.floor(y / C)));
  if (cellFree(ci, cj)) return [ci, cj];
  let best = null, bd = Infinity;
  for (let ring = 1; ring < Math.max(GW, GH); ring++) {
    for (let j = cj - ring; j <= cj + ring; j++) for (let i = ci - ring; i <= ci + ring; i++) {
      if (Math.max(Math.abs(i - ci), Math.abs(j - cj)) !== ring || !cellFree(i, j)) continue;
      const dx = (i + 0.5) * C - x, dy = (j + 0.5) * C - y, d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = [i, j]; }
    }
    if (best && ring * C > Math.sqrt(bd)) break;      // nothing further out can be closer
  }
  return best || [ci, cj];
}

// The point itself when one can stand there, otherwise the nearest spot where one can.
export function nearestFree(x, y) {
  x = Math.min(ROOM.w, Math.max(0, +x || 0)); y = Math.min(ROOM.d, Math.max(0, +y || 0));
  if (isFree(x, y) && isFree(r2(x), r2(y))) return [r2(x), r2(y)];
  const [i, j] = cellNear(x, y);
  return [r2((i + 0.5) * C), r2((j + 0.5) * C)];
}

function lineFree(a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], n = Math.ceil(Math.sqrt(dx * dx + dy * dy) / 0.1);
  for (let k = 1; k < n; k++) if (blockedAt(a[0] + dx * k / n, a[1] + dy * k / n)) return false;
  return true;
}

function astar(si, sj, gi, gj) {
  const N = GW * GH, cost = new Float32Array(N).fill(Infinity), from = new Int32Array(N).fill(-1), done = new Uint8Array(N);
  const start = sj * GW + si, goal = gj * GW + gi, open = [start];
  const h = n => { const dx = Math.abs(n % GW - gi), dy = Math.abs(Math.floor(n / GW) - gj); return Math.max(dx, dy) + 0.4142 * Math.min(dx, dy); };
  cost[start] = 0;
  while (open.length) {
    let bi = 0, bf = Infinity;
    for (let k = 0; k < open.length; k++) { const f = cost[open[k]] + h(open[k]); if (f < bf) { bf = f; bi = k; } }
    const cur = open[bi]; open[bi] = open[open.length - 1]; open.pop();
    if (cur === goal) break;
    if (done[cur]) continue;
    done[cur] = 1;
    const ci = cur % GW, cj = Math.floor(cur / GW);
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue;
      const ni = ci + di, nj = cj + dj;
      if (!cellFree(ni, nj) || (di && dj && (!cellFree(ci + di, cj) || !cellFree(ci, cj + dj)))) continue;   // no cutting corners
      const n = nj * GW + ni, c = cost[cur] + (di && dj ? 1.4142 : 1);
      if (c < cost[n]) { cost[n] = c; from[n] = cur; open.push(n); }
    }
  }
  if (from[goal] < 0 && goal !== start) return null;
  const cells = [];
  for (let n = goal; n >= 0; n = from[n]) cells.push(n);
  return cells.reverse();
}

// A walkable path from one point to another: a short list of [x, y] corners, the first one being `from`.
// A target one cannot stand on is replaced by the nearest spot where one can.
export function findPath(from, to) {
  const a = [r2(+from[0] || 0), r2(+from[1] || 0)], b = nearestFree(to[0], to[1]), pts = [a];
  if (!isFree(a[0], a[1])) pts.push(nearestFree(a[0], a[1]));       // standing up from a seat: step out first
  const s = pts[pts.length - 1];
  if (s[0] === b[0] && s[1] === b[1]) return pts.length > 1 ? pts : [a, b];
  if (lineFree(s, b)) { pts.push(b); return pts; }
  const [si, sj] = cellNear(s[0], s[1]), [gi, gj] = cellNear(b[0], b[1]);
  const cells = astar(si, sj, gi, gj);
  if (!cells) { pts.push(b); return pts; }                          // cannot happen in a connected room; walk straight
  const mid = cells.map(n => [(n % GW + 0.5) * C, (Math.floor(n / GW) + 0.5) * C]);
  const all = [s, ...mid, b];
  for (let i = 0; i < all.length - 1;) {                            // keep only the corners that are needed
    let j = all.length - 1;
    while (j > i + 1 && !lineFree(all[i], all[j])) j--;
    pts.push([r2(all[j][0]), r2(all[j][1])]);
    i = j;
  }
  return pts;
}

export function pathLen(p) {
  let l = 0;
  for (let i = 1; i < p.length; i++) { const dx = p[i][0] - p[i - 1][0], dy = p[i][1] - p[i - 1][1]; l += Math.sqrt(dx * dx + dy * dy); }
  return l;
}

// Where one is after walking `dist` along a path: [x, y, dx] (dx: walking left or right at that moment).
export function posAt(p, dist) {
  if (p.length < 2 || dist <= 0) return [p[0][0], p[0][1], 0];
  for (let i = 1; i < p.length; i++) {
    const dx = p[i][0] - p[i - 1][0], dy = p[i][1] - p[i - 1][1], l = Math.sqrt(dx * dx + dy * dy);
    if (dist <= l && l > 0) return [p[i - 1][0] + dx * dist / l, p[i - 1][1] + dy * dist / l, dx];
    dist -= l;
  }
  const e = p[p.length - 1];
  return [e[0], e[1], 0];
}

// The rest of a path from a distance on (what a newcomer needs to see somebody who is already walking).
export function pathFrom(p, dist) {
  if (dist <= 0) return p;
  for (let i = 1; i < p.length; i++) {
    const dx = p[i][0] - p[i - 1][0], dy = p[i][1] - p[i - 1][1], l = Math.sqrt(dx * dx + dy * dy);
    if (dist < l) return [[r2(p[i - 1][0] + dx * dist / l), r2(p[i - 1][1] + dy * dist / l)], ...p.slice(i)];
    dist -= l;
  }
  return [p[p.length - 1]];
}

export const _debug = { grid, GW, GH, blockedAt };
