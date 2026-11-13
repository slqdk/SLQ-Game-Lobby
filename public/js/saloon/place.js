// SLQ Game Lobby — the clubhouse as a saloon in three dimensions: the room and everything that stands in it.
// Every piece of furniture stands exactly where shared/room.js says (the server's paths go round those footprints):
// the room's x is x here, its depth (0 at the back wall) is z, and y is up. The walls and the ceiling only show
// their inside, so a camera outside the room looks straight in, as into a doll's house.
//
// A western saloon with a casino wing: a long bar with a brass rail and the house robot behind it, a general store,
// a wardrobe, a notice board, a shooting-gallery cabinet (the arcade), a self-playing piano (the music box), swing
// doors, tables for board games, dice, cards and the map, a sofa, a dance floor, and to the right the casino with
// three one-armed bandits, the chalk board and the blackjack table.
import { ROOM, CASINO_X, STATION, STATIONS } from '../../shared/room.js';
import { buildOutside } from './outside.js';

export const WALL_H = 4.4;
export const SEAT_H = { low: 0.52, high: 0.86, sofa: 0.5 };       // how high one sits on a chair, a bar stool, the sofa
// The windows: how wide, from the sill to the top, and where along the two end walls (z) and the front wall (x).
// The walls have real openings there, and one for the door: one looks out through them (outside.js).
export const WINDOWS = { w: 1.9, y0: 1.5, y1: 3.4, ends: [3.2, 9.6], front: [5, 12, 19, 28] };

const OAK = [0.34, 0.19, 0.09], DARK = [0.17, 0.085, 0.04], PINE = [0.56, 0.37, 0.19], BRASS = [0.82, 0.58, 0.18], IRON = [0.06, 0.06, 0.07], FELT = [0.05, 0.27, 0.13],
  WINE = [0.36, 0.05, 0.06], CREAM = [0.86, 0.79, 0.62], LEATHER = [0.33, 0.12, 0.06], STEEL = [0.45, 0.48, 0.52], PAPER = [0.9, 0.86, 0.74], GLASS = [0.35, 0.5, 0.56];

// ---------- seats at the tables ----------
// The room's plan (shared/room.js) says where each seat is; it leaves a good step between seat and table, so that
// one can walk up to it. Here a chair is turned to face its table and stands close to it: pushed in under the edge
// while nobody uses it, pulled out a little for whoever sits there. The bar's stools stand a little nearer the bar.
export const GAP = { sit: 0.4, tucked: 0.1, bar: 0.45 };      // from the table's edge to the middle of whoever sits

// A table's outline as it is built below: a box, or a round. The blackjack table is half a round with the house's
// side straight; the players' curve has its own middle and reach.
function outlineOf(st) {
  if (st.box) return { box: [st.box[0], st.box[1], st.box[0] + st.box[2], st.box[1] + st.box[3]], cx: st.box[0] + st.box[2] / 2, cz: st.box[1] + st.box[3] / 2 };
  const [cx, cz, rx, rz] = st.round;
  return st.kind === 'blackjack' ? { cx, cz: cz - rz * 0.55, rx, rz: rz * 1.55 } : { cx, cz, rx, rz };
}
// Seat i of a station: where the plan has it (x, z), which way it faces (dx, dz: straight at the table's edge) and
// how far it is from that edge.
export function seatLine(st, i) {
  const q = st.seats[i], o = outlineOf(st);
  let dx = o.cx - q[0], dz = o.cz - q[1], far;
  const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
  if (o.box) {
    const [x0, z0, x1, z1] = o.box, inX = q[0] > x0 && q[0] < x1, inZ = q[1] > z0 && q[1] < z1;
    if (inX && !inZ) { dx = 0; dz = Math.sign(o.cz - q[1]); } else if (inZ && !inX) { dz = 0; dx = Math.sign(o.cx - q[0]); }      // at a side: straight at it
    const tx = dx > 1e-6 ? (x0 - q[0]) / dx : dx < -1e-6 ? (x1 - q[0]) / dx : -1e9, tz = dz > 1e-6 ? (z0 - q[1]) / dz : dz < -1e-6 ? (z1 - q[1]) / dz : -1e9;
    far = Math.max(tx, tz);
  } else {
    // at a round table: straight at the nearest bit of the edge, which on an oval is not the same as at its middle
    const e = 1 / Math.hypot(dx / o.rx, dz / o.rz), ex = -dx * e, ez = -dz * e;      // where the line to the middle crosses the edge
    let nx = -ex / (o.rx * o.rx), nz = -ez / (o.rz * o.rz); const n = Math.hypot(nx, nz); nx /= n; nz /= n;
    const px = q[0] - o.cx, pz = q[1] - o.cz, A = nx * nx / (o.rx * o.rx) + nz * nz / (o.rz * o.rz), B = 2 * (px * nx / (o.rx * o.rx) + pz * nz / (o.rz * o.rz)), C = px * px / (o.rx * o.rx) + pz * pz / (o.rz * o.rz) - 1, disc = B * B - 4 * A * C;
    if (disc >= 0) { dx = nx; dz = nz; far = (-B - Math.sqrt(disc)) / (2 * A); } else far = L - e;
  }
  return { x: q[0], z: q[1], dx, dz, far: Math.max(0, far) };
}
// Where one sits on seat i, and which way one looks: [x, z, angle]. Not for the sofa (null): its seats are on it.
export function seatSpot(st, i) {
  if (!st || st.on || !st.seats || !st.seats[i] || !(st.box || st.round)) return null;
  const l = seatLine(st, i), k = Math.max(0, l.far - (st.high ? GAP.bar : GAP.sit));
  return [l.x + l.dx * k, l.z + l.dz * k, Math.atan2(l.dx, l.dz)];
}

export function buildSaloon(THREE, kit, groupName = '') {
  const { batch, at, along, picture, tone, wood } = kit;
  const root = new THREE.Group(), upper = new THREE.Group();     // `upper`: the ceiling and what hangs from it (hidden when one looks in from above)
  root.add(upper);
  const solid = batch(), glow = batch(), high = batch(), highGlow = batch(), near = batch(), floorB = batch(), carpetB = batch(), paperB = batch(), paper2B = batch(), wainB = batch();
  const roofB = batch(), gableB = batch();          // the boards under the roof and on the two gables (both in `upper`)
  const paneB = batch();                            // windows and doorway filled with plain daylight: for the view from above, where there is no outdoors
  const W = ROOM.w, D = ROOM.d, CX = CASINO_X, H = WALL_H;
  const picks = [], signs = [];          // what one can click: { id, box }; where each sign hangs: station id -> [x, y, z]
  const live = {};                       // what moves: filled in below
  const texts = [];                      // painted words: { x, y, z, w, h, face, text, ink }
  const word = (text, x, y, z, w, h, face = 'z+', ink = '#f1d9a0', up = false) => texts.push({ text, x, y, z, w, h, face, ink, up });
  const rnd = (() => { let s = 20261113; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; })();

  // ---------- pictures ----------
  const planks = picture(512, 512, (g, w, h) => {
    g.fillStyle = '#7a4f2c'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 8; i++) {
      const y = i * 64, k = 0.82 + rnd() * 0.36;
      g.fillStyle = 'rgb(' + (122 * k | 0) + ',' + (79 * k | 0) + ',' + (44 * k | 0) + ')'; g.fillRect(0, y, w, 62);
      g.fillStyle = 'rgba(40,20,8,.55)'; g.fillRect(0, y + 62, w, 2);
      for (let j = 0; j < 26; j++) { g.fillStyle = 'rgba(' + (rnd() < 0.5 ? '50,26,10' : '170,120,70') + ',' + (0.05 + rnd() * 0.1).toFixed(2) + ')'; g.fillRect(rnd() * w, y + 4 + rnd() * 54, 30 + rnd() * 140, 1 + rnd() * 1.5); }
      const sx = (i * 197 + 60) % w; g.fillStyle = 'rgba(40,20,8,.6)'; g.fillRect(sx, y, 2, 62);                       // where two boards meet
      if (i % 3 === 1) { g.fillStyle = 'rgba(50,26,10,.5)'; g.beginPath(); g.ellipse((sx + 230) % w, y + 30, 9, 5, 0, 0, 6.3); g.fill(); }
    }
  }, true);
  const carpet = picture(256, 256, (g, w, h) => {
    g.fillStyle = '#7a1a26'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#8f2531'; for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) if ((x + y) % 2) g.fillRect(x * 64, y * 64, 64, 64);
    g.fillStyle = '#d9a441';
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { const cx = x * 64 + 32, cy = y * 64 + 32; g.beginPath(); g.moveTo(cx, cy - 10); g.lineTo(cx + 7, cy); g.lineTo(cx, cy + 10); g.lineTo(cx - 7, cy); g.fill(); }
    g.fillStyle = 'rgba(217,164,65,.5)'; for (let y = 0; y <= 4; y++) for (let x = 0; x <= 4; x++) { g.beginPath(); g.arc(x * 64, y * 64, 3, 0, 6.3); g.fill(); }
  }, true);
  const paperPic = (base, fig) => picture(256, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    g.fillStyle = fig;
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      const cx = x * 64 + (y % 2 ? 32 : 0), cy = y * 64 + 32;
      for (const dx of [0, w]) { g.beginPath(); g.ellipse(cx + dx - (cx > w ? w : 0), cy - 9, 5, 12, 0, 0, 6.3); g.fill(); g.beginPath(); g.ellipse(cx + dx - 9, cy + 6, 4, 9, -0.7, 0, 6.3); g.fill(); g.beginPath(); g.ellipse(cx + dx + 9, cy + 6, 4, 9, 0.7, 0, 6.3); g.fill(); g.fillRect(cx + dx - 1.5, cy + 2, 3, 18); }
    }
    g.fillStyle = 'rgba(0,0,0,.08)'; for (let x = 0; x < w; x += 4) g.fillRect(x, 0, 1, h);
  }, true);
  const paper = paperPic('#5d2a2e', '#74383a'), paper2 = paperPic('#1f4a3a', '#2d6450');
  const boards = picture(256, 256, (g, w, h) => {
    for (let i = 0; i < 8; i++) { const k = 0.8 + rnd() * 0.4; g.fillStyle = 'rgb(' + (92 * k | 0) + ',' + (52 * k | 0) + ',' + (26 * k | 0) + ')'; g.fillRect(i * 32, 0, 31, h); g.fillStyle = 'rgba(30,14,6,.7)'; g.fillRect(i * 32 + 31, 0, 1, h); }
    g.fillStyle = 'rgba(30,14,6,.5)'; g.fillRect(0, 0, w, 10); g.fillStyle = 'rgba(255,220,170,.12)'; g.fillRect(0, 10, w, 4);
  }, true);

  // ---------- the room itself: floor, walls that show their inside only, ceiling with beams ----------
  const WAIN = 1.15;
  floorB.quad([0, 0, D], [CX, 0, D], [CX, 0, 0], [0, 0, 0], [1, 1, 1], 0, D / 4, CX / 4, 0);
  carpetB.quad([CX, 0, D], [W, 0, D], [W, 0, 0], [CX, 0, 0], [1, 1, 1], 0, D / 2, (W - CX) / 2, 0);
  const WIN = WINDOWS;
  const wall = (a, b, len, B2, holes = []) => {                    // a, b: the two bottom corners, seen from inside from left to right; holes: [from, to, bottom, top] along it
    const ux = (b[0] - a[0]) / len, uz = (b[1] - a[1]) / len, at2 = (s, y) => [a[0] + ux * s, y, a[1] + uz * s];
    const piece = (s0, s1, y0, y1) => {                            // boards below the rail, paper above it
      const lo = Math.min(y1, WAIN), hi = Math.max(y0, WAIN);
      if (s1 - s0 < 1e-6) return;
      if (lo > y0) wainB.quad(at2(s0, y0), at2(s1, y0), at2(s1, lo), at2(s0, lo), [1, 1, 1], s0 / 1.6, y0 / WAIN, s1 / 1.6, lo / WAIN);
      if (y1 > hi) B2.quad(at2(s0, hi), at2(s1, hi), at2(s1, y1), at2(s0, y1), [1, 1, 1], s0 / 2, (hi - WAIN) / 2, s1 / 2, (y1 - WAIN) / 2);
    };
    let s = 0;
    for (const [h0, h1, y0, y1] of holes.slice().sort((p, q) => p[0] - q[0])) { piece(s, h0, 0, H); piece(h0, h1, 0, y0); piece(h0, h1, y1, H); s = h1; }
    piece(s, len, 0, H);
  };
  const winHoles = (list, sOf) => list.map(v => [sOf(v) - WIN.w / 2, sOf(v) + WIN.w / 2, WIN.y0, WIN.y1]);
  { const [dx, , dw, dh] = STATION.door.wall;
    wall([0, 0], [CX, 0], CX, paperB, [[dx, dx + dw, 0, dh]]); wall([CX, 0], [W, 0], W - CX, paper2B); }                                                  // the back wall, with the doorway
  const WD = STATION.cabin.west;                                   // the door to the cabins in the west end: [from z, bottom, width, height]
  wall([0, D], [0, 0], D, paperB, [...winHoles(WIN.ends, z => D - z), [D - WD[0] - WD[2], D - WD[0], 0, WD[3]]]); wall([W, 0], [W, D], D, paper2B, winHoles(WIN.ends, z => z));                              // the two ends
  wall([CX, D], [0, D], CX, paperB, winHoles(WIN.front.filter(x => x < CX), x => CX - x)); wall([W, D], [CX, D], W - CX, paper2B, winHoles(WIN.front.filter(x => x > CX), x => W - x));      // the front wall (only seen from inside)
  // the rail between boards and paper, and a skirting board
  for (const [x0, z0, x1, z1] of [[0, 0, W, 0], [0, 0, 0, STATION.cabin.west[0] - 0.08], [0, STATION.cabin.west[0] + STATION.cabin.west[2] + 0.08, 0, D], [W, 0, W, D], [0, D, W, D]]) {
    const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz), inx = z0 === 0 && z1 === 0 ? 0 : x0 === 0 && x1 === 0 ? 0.04 : x0 === W && x1 === W ? -0.04 : 0, inz = z0 === 0 && z1 === 0 ? 0.04 : z0 === D && z1 === D ? -0.04 : 0;
    const B2 = z0 === D && z1 === D ? near : solid;                // (the front wall's go with the front wall)
    B2.box((x0 + x1) / 2 + inx, WAIN, (z0 + z1) / 2 + inz, dx ? len : 0.08, 0.09, dz ? len : 0.08, DARK);
    B2.box((x0 + x1) / 2 + inx, 0.09, (z0 + z1) / 2 + inz, dx ? len : 0.07, 0.18, dz ? len : 0.07, DARK);
  }
  // ---------- the roof, open to the ridge (all of it in `upper`) ----------
  // Søren: "loft til kip i huset, så vi får en bedre træ stemning". Boards under the two slopes, and what carries
  // them, all in the round: a log along the top of each long wall, a truss every four steps (a tie beam across, two
  // rafters up to the ridge, a post in the middle and two struts), the ridge log and two more logs on each slope,
  // and light rafters between. The two ends are boarded gables with a round window.
  const RIDGE = H + 3.3, MID = D / 2, RUN = Math.hypot(MID, RIDGE - H), PITCH = Math.atan2(RIDGE - H, MID);
  const roofY = z => H + (RIDGE - H) * (1 - Math.abs(z - MID) / MID);          // the height of the boards over a place
  {
    const BOARD = [1.5, 1.24, 0.92], log = wood(tone(PINE, 0.82), 0.1), old = wood(tone(OAK, 1.25), 0.1);
    roofB.quad([0, H, 0], [W, H, 0], [W, RIDGE, MID], [0, RIDGE, MID], BOARD, 0, 0, W / 2.4, RUN / 2.4);
    roofB.quad([W, H, D], [0, H, D], [0, RIDGE, MID], [W, RIDGE, MID], BOARD, 0, 0, W / 2.4, RUN / 2.4);
    // the gables: upright boards, seen from inside
    const gable = (x, flip) => {
      const pts = [[0, H], [D, H], [MID, RIDGE]];
      // ... with a round hole for the window: one sees the sky through it
      const shape = new THREE.Shape(pts.map(q => new THREE.Vector2(q[0], q[1]))), ring = new THREE.Path(); ring.absarc(MID, H + 1.25, 0.78, 0, Math.PI * 2, true); shape.holes.push(ring);
      const sg = new THREE.ShapeGeometry(shape, 24), sp = sg.attributes.position;
      for (let i = 0; i < sg.index.count; i += 3) for (const j of flip ? [0, 1, 2] : [0, 2, 1]) { const q = sg.index.getX(i + j), z = sp.getX(q), y = sp.getY(q); gableB.vert(x, y, z, flip ? -1 : 1, 0, 0, z / 1.6, (y - H) / 1.2, [1.2, 1.05, 0.86]); }
      sg.dispose();
      const e = flip ? -1 : 1, gx = x + e * 0.06;
      // the window's frame, with a cross in it
      high.add(new THREE.TorusGeometry(0.8, 0.07, 6, 24), at(gx, H + 1.25, MID, 0, Math.PI / 2, 0), old);
      high.box(gx, H + 1.25, MID, 0.05, 1.6, 0.07, old); high.box(gx, H + 1.25, MID, 0.05, 0.07, 1.6, old);
      // the last truss stands against the gable
      truss(x + e * 0.2, true);
    };
    const truss = (x, half) => {
      high.rod(x, H, 0.04, x, H, D - 0.04, 0.2, log, 10);                                                          // the tie beam
      for (const sd of [-1, 1]) {
        const z0 = MID + sd * (MID - 0.2), zm = MID + sd * MID / 2;
        high.rod(x, roofY(z0) - 0.1, z0, x, RIDGE - 0.42, MID + sd * 0.12, 0.17, log, 10);                         // a rafter
        high.rod(x, H + 0.16, MID + sd * 0.3, x, roofY(zm) - 0.42, zm, 0.11, log, 8);                              // a strut
        high.box(x, roofY(z0) - 0.02, z0 + sd * 0.02, 0.44, 0.07, 0.3, IRON, sd * PITCH);                         // an iron strap at its foot (a turn about x by +a tips the far end down)
      }
      high.rod(x, H + 0.1, MID, x, RIDGE - 0.3, MID, 0.15, log, 10);                                               // the post in the middle
      high.box(x, H + 0.3, MID, 0.4, 0.09, 0.36, IRON); high.box(x, RIDGE - 0.62, MID, 0.4, 0.09, 0.4, IRON);      // straps round its foot and its head
      if (!half) for (const sd of [-1, 1]) for (const dz of [-1, 1]) high.ball(x + sd * 0.2, H + 0.3, MID + dz * 0.1, 0.035, IRON);
    };
    for (let x = 4; x < W; x += 4) truss(x, false);
    gable(0, false); gable(W, true);
    // logs the whole length of the house: one on each long wall, the ridge, two on each slope
    high.rod(0, H - 0.02, 0.14, W, H - 0.02, 0.14, 0.17, log, 10); near.rod(0, H - 0.02, D - 0.14, W, H - 0.02, D - 0.14, 0.17, log, 10);
    high.rod(0, RIDGE - 0.26, MID, W, RIDGE - 0.26, MID, 0.17, log, 10);
    for (const sd of [-1, 1]) for (const k of [1 / 3, 2 / 3]) { const z = MID + sd * MID * k; high.rod(0, roofY(z) - 0.2, z, W, roofY(z) - 0.2, z, 0.12, log, 8); }
    // light rafters under the boards, one every step
    for (let x = 1; x < W; x += 1) if (x % 4) for (const sd of [-1, 1]) high.box(x, (H + RIDGE) / 2 - 0.06, MID + sd * MID / 2, 0.09, 0.11, RUN - 0.1, old, sd * PITCH);
    // something over the casino's end: a pair of antlers on a shield (a hunting lodge has them)
    for (const [x, e] of [[0.12, 1], [W - 0.12, -1]]) {
      high.box(x, H + 0.1, MID, 0.05, 0.5, 0.42, old);
      for (const sd of [-1, 1]) {
        const pts = [[0, 0.06], [0.16, 0.34], [0.12, 0.66], [0.3, 0.92]];
        for (let i = 0; i < 3; i++) high.rod(x + e * 0.05, H + 0.16 + pts[i][1], MID + sd * (0.08 + pts[i][0]), x + e * 0.07, H + 0.16 + pts[i + 1][1], MID + sd * (0.08 + pts[i + 1][0]), 0.028 - i * 0.004, [0.86, 0.8, 0.66], 5);
        for (const [i, dy, dz] of [[1, 0.2, 0.2], [2, 0.22, -0.12]]) high.rod(x + e * 0.06, H + 0.16 + pts[i][1], MID + sd * (0.08 + pts[i][0]), x + e * 0.08, H + 0.16 + pts[i][1] + dy, MID + sd * (0.08 + pts[i][0] + dz), 0.018, [0.86, 0.8, 0.66], 5);
      }
    }
  }
  // the opening to the casino: two posts and a beam with a sign
  solid.box(CX, H / 2, 0.2, 0.36, H, 0.36, wood(OAK)); near.box(CX, H / 2, D - 0.2, 0.36, H, 0.36, wood(OAK));
  high.box(CX, H - 0.55, D / 2, 0.3, 0.5, D, wood(OAK));

  // windows in the two ends and in the front wall: a frame with bars, and the wall's own thickness round the opening
  const windowAt = (x, z, facing) => {                                // facing: 'x+' on the left wall, 'x-' on the right, 'z-' on the front
    const along2 = facing === 'z-', w = WIN.w, h = WIN.y1 - WIN.y0, y = WIN.y0 + h / 2, e = facing === 'x+' ? 0.03 : facing === 'x-' ? -0.03 : 0, ez = along2 ? -0.03 : 0;
    const pane = (du, dv, pw, ph, col, B2, out, deep = 0.02) => B2.box(x + e * out + (along2 ? du : 0), y + dv, z + ez * out + (along2 ? 0 : du), along2 ? pw : deep, ph, along2 ? deep : pw, col);
    const S2 = along2 ? near : solid;
    if (!along2) pane(0, 0, w, h, [2.2, 2.0, 1.55], paneB, 1);
    for (const du of [-w / 2, 0, w / 2]) pane(du, 0, 0.09, h + 0.1, DARK, S2, 2);
    for (const dv of [-h / 2, 0, h / 2]) pane(0, dv, w + 0.1, 0.09, DARK, S2, 2);
    pane(0, -h / 2 - 0.07, w + 0.3, 0.07, DARK, S2, 3);
    // the opening goes through a wall of logs: its four sides, just outside the wall's own face
    const log = wood(tone(OAK, 0.9));
    for (const dv of [-h / 2 - 0.035, h / 2 + 0.035]) pane(0, dv, w + 0.14, 0.07, log, S2, -4.6, 0.27);
    for (const du of [-w / 2 - 0.035, w / 2 + 0.035]) pane(du, 0, 0.07, h, log, S2, -4.6, 0.27);
  };
  for (const z of WIN.ends) { windowAt(0, z, 'x+'); windowAt(W, z, 'x-'); }
  for (const x of WIN.front) windowAt(x, D, 'z-');

  // lamps: wagon wheels with lanterns over the room, and a fine one over the casino
  const lamps = [];
  const wheelLamp = (x, z, y, r, fine) => {
    high.add(new THREE.TorusGeometry(r, 0.05, 6, 28), at(x, y, z, Math.PI / 2, 0, 0), fine ? BRASS : wood(OAK));
    for (let k = 0; k < 6; k++) { const a = k / 6 * 6.283; high.rod(x, y, z, x + Math.cos(a) * r, y, z + Math.sin(a) * r, 0.03, fine ? BRASS : DARK); high.cyl(x + Math.cos(a) * r, y + 0.03, z + Math.sin(a) * r, 0.07, 0.2, fine ? BRASS : IRON, 8); highGlow.ball(x + Math.cos(a) * r, y + 0.3, z + Math.sin(a) * r, 0.055, [2.6, 1.5, 0.5], 1, 1.7, 1, 8); high.cyl(x + Math.cos(a) * r, y + 0.22, z + Math.sin(a) * r, 0.045, 0.2, [0.9, 0.86, 0.7], 8, 0.05); }
    for (let k = 0; k < 3; k++) { const a = k / 3 * 6.283; high.rod(x + Math.cos(a) * r * 0.6, y, z + Math.sin(a) * r * 0.6, x, H - 0.55, z, 0.015, IRON, 4); }
    high.rod(x, H - 0.55, z, x, H - 0.2, z, 0.02, IRON, 5);                    // the chain up to the tie beam
    high.cyl(x, y - 0.08, z, 0.12, 0.16, fine ? BRASS : DARK, 8);
    lamps.push([x, y, z]);
  };
  wheelLamp(8, MID, 3.15, 1.1); wheelLamp(16, MID, 3.15, 1.1); wheelLamp(28, MID, 3.2, 0.9, true);      // each under a truss

  // ---------- small things used many times ----------
  const leg = (x, z, h, r = 0.045, col = DARK) => solid.cyl(x, 0, z, r, h, col, 6);
  const stool = (x, z, hi) => {
    const sh = hi ? SEAT_H.high : SEAT_H.low;
    solid.cyl(x, sh - 0.07, z, 0.27, 0.07, hi ? WINE : wood(PINE), 14);
    for (let k = 0; k < 4; k++) { const a = k / 4 * 6.283 + 0.785; solid.rod(x + Math.cos(a) * 0.2, sh - 0.07, z + Math.sin(a) * 0.2, x + Math.cos(a) * 0.27, 0, z + Math.sin(a) * 0.27, 0.028, hi ? BRASS : DARK); }
    if (hi) solid.add(new THREE.TorusGeometry(0.23, 0.014, 5, 16), at(x, 0.3, z, Math.PI / 2, 0, 0), BRASS);
  };
  // A chair, standing at the place of whoever sits on it (the middle of the seat is a little behind that), facing
  // +z. Every chair is the same shape, drawn many times over (one mesh for all of them, each with its own place).
  const chairs = [];
  const chairShape = fine => {
    const B = batch(), frame = wood(fine ? DARK : OAK, 0.1), pad = fine ? WINE : LEATHER, sh = SEAT_H.low;
    B.box(0, sh - 0.045, -0.06, 0.52, 0.055, 0.54, frame); B.box(0, sh - 0.014, -0.05, 0.44, 0.03, 0.44, pad);
    for (const sd of [-1, 1]) {
      B.rod(sd * 0.215, sh - 0.06, 0.17, sd * 0.24, 0, 0.21, 0.036, frame);                                         // front leg
      B.rod(sd * 0.215, sh - 0.06, -0.28, sd * 0.24, 0, -0.35, 0.036, frame);                                       // back leg
      B.rod(sd * 0.215, sh - 0.06, -0.3, sd * 0.205, 1.03, -0.4, 0.034, frame);                                     // and the post of the back above it
      B.ball(sd * 0.205, 1.045, -0.402, fine ? 0.05 : 0.042, fine ? BRASS : frame);
      B.rod(sd * 0.228, 0.23, 0.19, sd * 0.228, 0.23, -0.32, 0.02, frame);                                          // a rung along the side
    }
    B.box(0, 0.93, -0.386, 0.45, 0.17, 0.04, frame, -0.17, 0, 0); B.box(0, 0.71, -0.345, 0.43, 0.07, 0.035, frame, -0.17, 0, 0);      // the back: a broad rail and a slat
    B.rod(-0.228, 0.2, 0.19, 0.228, 0.2, 0.19, 0.02, frame); B.rod(-0.228, 0.26, -0.32, 0.228, 0.26, -0.32, 0.02, frame);             // rungs in front and behind
    return B;
  };
  const pickBox = (id, x0, y0, z0, x1, y1, z1) => picks.push({ id, box: new THREE.Box3(new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, z1)) });
  const bottle = (x, y, z, col, s = 1) => { solid.cyl(x, y, z, 0.045 * s, 0.17 * s, col, 7); solid.cyl(x, y + 0.17 * s, z, 0.045 * s, 0.05 * s, col, 7, 0.018 * s); solid.cyl(x, y + 0.22 * s, z, 0.018 * s, 0.07 * s, col, 6); };
  const BOTTLES = [[0.1, 0.32, 0.12], [0.45, 0.2, 0.06], [0.5, 0.36, 0.1], [0.08, 0.14, 0.3], [0.5, 0.06, 0.06], [0.6, 0.55, 0.4], [0.2, 0.1, 0.05]];

  for (const st of STATIONS) {
    const b = st.box, r = st.round;
    if (st.seats && !st.on) st.seats.forEach((q, i) => {
      if (st.high) { const sp = seatSpot(st, i); stool(sp[0], sp[1], true); }
      else chairs.push({ key: st.id + ':' + i, line: seatLine(st, i), fine: st.kind === 'blackjack', pull: 0, want: 0, n: 0 });
    });
    if (b) pickBox(st.id, b[0], 0, b[1], b[0] + b[2], st.h, b[1] + b[3]);
    else if (r) pickBox(st.id, r[0] - r[2], 0, r[1] - r[3], r[0] + r[2], st.h, r[1] + r[3]);
    else if (st.wall) pickBox(st.id, st.wall[0], st.wall[1], 0, st.wall[0] + st.wall[2], st.wall[1] + st.wall[3], 0.25);
    else if (st.floor) pickBox(st.id, st.floor[0] - st.floor[2], 0, st.floor[1] - st.floor[2], st.floor[0] + st.floor[2], 0.06, st.floor[1] + st.floor[2]);
    else if (st.west) pickBox(st.id, 0, st.west[1], st.west[0], 0.3, st.west[1] + st.west[3], st.west[0] + st.west[2]);
    if (st.west) { signs.push([st.id, 0.25, st.west[1] + st.west[3] + 0.15, st.west[0] + st.west[2] / 2]); continue; }
    if (st.name) signs.push([st.id, b ? b[0] + b[2] / 2 : r ? r[0] : st.wall ? st.wall[0] + st.wall[2] / 2 : st.floor[0], st.wall ? st.wall[1] + st.wall[3] + 0.15 : (st.h || 0.1) + 0.35, b ? b[1] + b[3] / 2 : r ? r[1] : st.wall ? 0.1 : st.floor[1]]);
  }

  // ---------- by the back wall's west end: a bench and a row of coat pegs (the wardrobe has moved into the cabin) ----------
  { const [x, z, w, d] = STATION.hall.box, cx = x + w / 2, seat = wood(tone(PINE, 0.9));
    solid.box(cx, 0.46, z + d / 2, w, 0.07, d, seat); for (const s2 of [-1, 1]) solid.box(cx + s2 * (w / 2 - 0.1), 0.23, z + d / 2, 0.08, 0.46, d - 0.08, wood(OAK));
    solid.box(cx, 0.2, z + d / 2, w - 0.3, 0.05, d - 0.15, wood(OAK));
    solid.box(cx, 1.72, 0.04, w + 0.1, 0.14, 0.05, wood(OAK));
    for (let i = 0; i < 5; i++) { const px = x + 0.2 + i * (w - 0.4) / 4; solid.rod(px, 1.72, 0.07, px, 1.76, 0.2, 0.018, BRASS, 5); solid.ball(px, 1.77, 0.21, 0.025, BRASS); }
    solid.box(x + 0.2, 1.38, 0.17, 0.32, 0.62, 0.1, [0.4, 0.27, 0.16]); solid.box(x + 0.2, 1.55, 0.2, 0.12, 0.3, 0.06, [0.6, 0.1, 0.1]);       // a coat and a scarf
    solid.cyl(x + 0.2 + 2 * (w - 0.4) / 4, 1.64, 0.25, 0.26, 0.03, LEATHER, 14); solid.cyl(x + 0.2 + 2 * (w - 0.4) / 4, 1.66, 0.25, 0.13, 0.16, LEATHER, 12, 0.11);       // a hat on a peg
    solid.box(x + w - 0.2, 0.62, z + 0.25, 0.3, 0.26, 0.26, [0.55, 0.4, 0.22]);       // a bag on the bench
  }

  // ---------- the clothes shop (the 'kiosk' of the code): a counter, a till, shelves with goods, a dummy in a vest ----------
  { const [x, z, w, d] = STATION.kiosk.box, h = STATION.kiosk.h, cx = x + w / 2;
    solid.box(cx, h / 2, z + d - 0.3, w, h, 0.6, wood(PINE)); solid.box(cx, h + 0.03, z + d - 0.28, w + 0.12, 0.06, 0.72, wood(DARK));
    for (let i = 0; i < 4; i++) solid.box(x + 0.4 + i * (w - 0.8) / 3, h / 2, z + d + 0.01, 0.62, h - 0.3, 0.02, wood(tone(PINE, 0.8)));
    // the till
    solid.box(cx + 0.9, h + 0.2, z + d - 0.3, 0.42, 0.28, 0.36, BRASS); solid.box(cx + 0.9, h + 0.42, z + d - 0.4, 0.36, 0.18, 0.14, BRASS); glow.box(cx + 0.9, h + 0.43, z + d - 0.32, 0.26, 0.09, 0.01, [0.9, 0.9, 0.8]);
    // a tailor's dummy in a leather vest on the counter
    { const px = cx + 0.36, pz = z + d - 0.3, y0 = h + 0.06;
      solid.cyl(px, y0, pz, 0.1, 0.03, DARK, 10); solid.cyl(px, y0 + 0.03, pz, 0.02, 0.1, DARK, 6);
      solid.add(new THREE.CylinderGeometry(0.15, 0.11, 0.36, 12), at(px, y0 + 0.31, pz), CREAM); solid.ball(px, y0 + 0.5, pz, 0.15, CREAM, 1, 0.4, 0.8);
      solid.add(new THREE.CylinderGeometry(0.162, 0.125, 0.3, 12, 1, true, 0.4, Math.PI * 2 - 0.8), at(px, y0 + 0.32, pz), LEATHER); }
    // on the counter: a jar of sweets, a pair of glasses, a hat
    solid.cyl(cx - 1.0, h + 0.06, z + d - 0.3, 0.12, 0.24, GLASS, 10); for (let i = 0; i < 7; i++) solid.ball(cx - 1.0 + (rnd() - 0.5) * 0.14, h + 0.1 + rnd() * 0.12, z + d - 0.3 + (rnd() - 0.5) * 0.14, 0.035, [[0.8, 0.15, 0.2], [0.9, 0.7, 0.1], [0.2, 0.6, 0.3]][i % 3], 1, 1, 1, 6);
    solid.cyl(cx - 0.2, h + 0.06, z + d - 0.25, 0.3, 0.025, [0.5, 0.33, 0.16], 16); solid.cyl(cx - 0.2, h + 0.085, z + d - 0.25, 0.15, 0.17, [0.5, 0.33, 0.16], 12, 0.13);
    // shelves on the wall behind, full of things
    for (let s = 0; s < 3; s++) {
      const y = 1.5 + s * 0.6;
      solid.box(cx, y, z + 0.12, w - 0.2, 0.05, 0.3, wood(DARK));
      for (let i = 0; i < 9; i++) {
        const px = x + 0.3 + i * (w - 0.6) / 8, k = (i + s * 2) % 4;
        if (k === 0) solid.cyl(px, y + 0.025, z + 0.14, 0.09, 0.2, [[0.7, 0.2, 0.15], [0.2, 0.4, 0.6], [0.8, 0.65, 0.2]][(i + s) % 3], 8);
        else if (k === 1) solid.box(px, y + 0.14, z + 0.14, 0.2, 0.23, 0.18, [[0.7, 0.55, 0.3], [0.35, 0.5, 0.3], [0.6, 0.3, 0.3]][(i + s) % 3]);
        else if (k === 2) bottle(px, y + 0.025, z + 0.14, BOTTLES[(i + s) % BOTTLES.length], 1.1);
        else { solid.cyl(px, y + 0.025, z + 0.14, 0.13, 0.02, LEATHER, 12); solid.cyl(px, y + 0.045, z + 0.14, 0.07, 0.1, [[0.2, 0.2, 0.22], [0.6, 0.5, 0.35], LEATHER][(i + s) % 3], 10); }
      }
    }
    for (const s of [-1, 1]) solid.box(cx + s * (w / 2 - 0.08), 2.0, z + 0.12, 0.08, 1.9, 0.3, wood(DARK));
    // its name on a board
    solid.box(cx, 3.42, z + 0.1, 2.3, 0.5, 0.06, wood(PINE)); word('TØJBUTIK', cx, 3.42, z + 0.135, 2.2, 0.42);
  }

  // ---------- the bar ----------
  // A U that opens towards the back wall: a counter along the front and down both sides, the keeper in the aisle
  // inside, the back bar against the wall, and overhead a gantry on four posts where the beer mugs hang.
  { const [x, z, w, d] = STATION.bar.box, CT = STATION.bar.counter, h = 1.22, cx = x + w / 2, x1 = x + w, fz = z + d;      // fz: the front of the counter
    const BACK = 0.74, GATE = 1.42;                    // where the back bar ends; where the right arm begins (the keeper's way in lies between)
    const oak = wood(OAK), dark = wood(DARK, 0.06), top = (px, pz, sx, sz) => { solid.box(px, h + 0.035, pz, sx, 0.07, sz, dark); };
    // the counter: three bodies, their tops with a rounded lip outwards, panels on every outer face
    solid.box(cx, h / 2, fz - CT / 2, w, h, CT, oak); top(cx, fz - CT / 2 + 0.04, w + 0.16, CT + 0.08);
    solid.box(x + CT / 2, h / 2, (BACK + fz - CT) / 2, CT, h, fz - CT - BACK, oak); top(x + CT / 2 - 0.04, (BACK + fz - CT) / 2, CT + 0.08, fz - CT - BACK);
    solid.box(x1 - CT / 2, h / 2, (GATE + fz - CT) / 2, CT, h, fz - CT - GATE, oak); top(x1 - CT / 2 + 0.04, (GATE + fz - CT) / 2, CT + 0.08, fz - CT - GATE);
    solid.box(x1 - CT / 2 + 0.04, h + 0.035, (BACK + GATE) / 2, CT + 0.08, 0.05, GATE - BACK - 0.02, dark);                       // the flap over the way in
    for (const s of [-1, 1]) solid.cyl(x1 - CT / 2 + s * 0.2, h + 0.045, GATE + 0.01, 0.022, 0.035, BRASS, 6);                    // its hinges
    solid.rod(x - 0.08, h + 0.05, fz + 0.085, x1 + 0.08, h + 0.05, fz + 0.085, 0.045, dark, 8);
    for (const [px, z0] of [[x - 0.085, BACK], [x1 + 0.085, BACK]]) solid.rod(px, h + 0.05, z0, px, h + 0.05, fz + 0.085, 0.045, dark, 8);
    const panel = (px, pz, len, face) => {
      const dx = face === 'z' ? 0 : face, sx = face === 'z' ? len : 0.024, sz = face === 'z' ? 0.024 : len;
      solid.box(px + dx * 0.012, h / 2 + 0.03, pz + (face === 'z' ? 0.012 : 0), sx, h - 0.36, sz, wood(tone(OAK, 0.78)));
      solid.box(px + dx * 0.026, h / 2 + 0.03, pz + (face === 'z' ? 0.026 : 0), face === 'z' ? len - 0.16 : 0.012, h - 0.52, face === 'z' ? 0.012 : len - 0.16, wood(tone(OAK, 1.14)));
    };
    for (let i = 0; i < 8; i++) panel(x + 0.5 + i * (w - 1.0) / 7, fz, 0.62, 'z');
    for (const pz of [1.22, 1.9]) panel(x, pz, 0.52, -1);
    panel(x1, 1.9, 0.52, 1);
    solid.box(cx, 0.09, fz + 0.006, w, 0.18, 0.014, DARK);                                                                     // a dark foot to the counter
    for (const px of [x + 0.03, x1 - 0.03]) solid.box(px, h / 2 - 0.01, fz - 0.03, 0.2, h - 0.02, 0.2, wood(DARK));      // the corner posts
    // the foot rail, round the front and both corners
    const rail = [[x - 0.22, 1.0], [x - 0.22, fz + 0.22], [x1 + 0.22, fz + 0.22], [x1 + 0.22, 1.5]];
    for (let i = 0; i < 3; i++) solid.rod(rail[i][0], 0.24, rail[i][1], rail[i + 1][0], 0.24, rail[i + 1][1], 0.032, BRASS, 8);
    for (const q of rail.slice(1, 3)) solid.ball(q[0], 0.24, q[1], 0.045, BRASS);
    for (let i = 0; i < 6; i++) { const px = x + 0.5 + i * (w - 1.0) / 5; solid.rod(px, 0.24, fz + 0.22, px, 0.24, fz + 0.01, 0.018, BRASS, 5); }
    for (const [px, sx] of [[x - 0.22, 1], [x1 + 0.22, -1]]) solid.rod(px, 0.24, 1.7, px + sx * 0.21, 0.24, 1.7, 0.018, BRASS, 5);
    solid.cyl(x - 0.5, 0, fz + 0.45, 0.1, 0.16, BRASS, 10, 0.15);                                                              // a spittoon by the rail
    // on the counter: the draught beer (a brass column with four taps towards the keeper, and a drip tray), and a smaller one
    const zc = fz - CT / 2 - 0.04, HANDLES = [[0.7, 0.1, 0.1], [0.08, 0.08, 0.08], [0.85, 0.8, 0.68], [0.1, 0.36, 0.16]];
    const taps = (px, n) => {
      const half = (n - 1) * 0.085;
      solid.cyl(px, h + 0.07, zc, 0.055, 0.44, BRASS, 10); solid.cyl(px, h + 0.07, zc, 0.09, 0.03, BRASS, 10);
      solid.box(px, h + 0.52, zc, half * 2 + 0.2, 0.08, 0.1, BRASS); solid.ball(px, h + 0.6, zc, 0.045, BRASS);
      for (let i = 0; i < n; i++) { const tx = px - half + i * 0.17; solid.rod(tx, h + 0.5, zc, tx, h + 0.42, zc - 0.13, 0.02, BRASS, 6); solid.cyl(tx, h + 0.56, zc + 0.02, 0.026, 0.15, HANDLES[i % 4], 6, 0.034); }
      solid.box(px, h + 0.085, zc - 0.15, half * 2 + 0.3, 0.03, 0.2, [0.3, 0.3, 0.32]); solid.box(px, h + 0.102, zc - 0.15, half * 2 + 0.24, 0.006, 0.15, [0.12, 0.12, 0.13]);
    };
    taps(cx - 1.1, 4); taps(cx + 1.9, 2);
    // glasses waiting to be filled, two that are full, nuts, a bell
    const mug = (B, px, py, pz, full, turn = 0) => {
      B.cyl(px, py, pz, 0.058, 0.15, full ? [0.82, 0.55, 0.12] : GLASS, 9, 0.062);
      if (full) B.cyl(px, py + 0.15, pz, 0.064, 0.035, [0.97, 0.95, 0.88], 9);
      B.add(new THREE.TorusGeometry(0.045, 0.012, 5, 10, Math.PI), at(px + Math.cos(turn) * 0.06, py + 0.075, pz + Math.sin(turn) * 0.06, 0, -turn, -Math.PI / 2), full ? [0.9, 0.88, 0.8] : GLASS);
    };
    for (let i = 0; i < 6; i++) mug(solid, cx - 0.35 + i * 0.15, h + 0.07, zc - 0.12, false, 0.6);
    mug(solid, cx + 0.95, h + 0.07, fz - 0.2, true, 2.2); mug(solid, cx - 2.3, h + 0.07, fz - 0.22, true, 0.9);
    for (const px of [cx + 0.2, cx - 2.75]) { solid.cyl(px, h + 0.07, fz - 0.2, 0.13, 0.07, [0.5, 0.3, 0.15], 10, 0.16); solid.cyl(px, h + 0.13, fz - 0.2, 0.13, 0.012, [0.72, 0.5, 0.26], 10); }
    solid.add(new THREE.SphereGeometry(0.07, 10, 6, 0, 6.283, 0, 1.57), at(cx + 2.7, h + 0.07, fz - 0.24), BRASS); solid.cyl(cx + 2.7, h + 0.14, fz - 0.24, 0.012, 0.03, BRASS, 5);
    solid.box(cx - 1.9, h + 0.09, fz - 0.2, 0.2, 0.04, 0.2, [0.92, 0.9, 0.84]);                                               // napkins
    // down the left side: two that somebody left; down the right: an oil lamp at the corner
    mug(solid, x + 0.3, h + 0.07, 1.5, false, 3.0);
    for (const px of [x + 0.34, x1 - 0.34]) { solid.cyl(px, h + 0.07, fz - 0.34, 0.07, 0.06, BRASS, 8, 0.05); glow.cyl(px, h + 0.13, fz - 0.34, 0.05, 0.16, [1.5, 1.05, 0.5], 8, 0.03); solid.cyl(px, h + 0.29, fz - 0.34, 0.035, 0.02, BRASS, 6); }

    // the back bar: cupboards with a worktop, the mirror between columns, shelves of bottles, a cornice and the name
    const bw = w - 1.1, by = 0.98;
    solid.box(cx, by / 2, z + 0.24, bw, by, 0.6, oak); solid.box(cx, by + 0.03, z + 0.26, bw + 0.1, 0.06, 0.68, dark);
    for (let i = 0; i < 7; i++) { const px = cx - bw / 2 + 0.4 + i * (bw - 0.8) / 6; solid.box(px, by / 2 + 0.02, z + 0.546, 0.62, by - 0.3, 0.02, wood(tone(OAK, 0.8))); solid.box(px, by / 2 + 0.02, z + 0.56, 0.46, by - 0.46, 0.012, wood(tone(OAK, 1.14))); solid.ball(px + 0.24, by / 2, z + 0.575, 0.022, BRASS); }
    solid.box(cx, 2.5, z - 0.12, 2.9, 1.9, 0.1, wood(DARK)); glow.box(cx, 2.5, z - 0.062, 2.56, 1.56, 0.01, [0.4, 0.48, 0.5]);
    for (const [gx, gw] of [[-0.75, 0.16], [-0.45, 0.06], [0.55, 0.22]]) glow.quad([cx + gx - gw, 1.74, z - 0.055], [cx + gx + gw, 1.74, z - 0.055], [cx + gx + gw + 0.55, 3.26, z - 0.055], [cx + gx - gw + 0.55, 3.26, z - 0.055], [0.5, 0.58, 0.6]);      // the light in the glass
    for (const s of [-1, 1]) for (const k of [1.56, 2.72]) { const px = cx + s * k; solid.cyl(px, by + 0.06, z + 0.02, 0.085, 2.34, wood(OAK), 10); solid.box(px, by + 0.13, z + 0.02, 0.24, 0.14, 0.24, wood(DARK)); solid.box(px, 3.32, z + 0.02, 0.26, 0.14, 0.26, wood(DARK)); for (const y of [1.6, 2.9]) solid.add(new THREE.TorusGeometry(0.09, 0.022, 5, 12), at(px, y, z + 0.02, Math.PI / 2, 0, 0), BRASS); }
    for (const s of [-1, 1]) for (let sh = 0; sh < 3; sh++) {
      const y = 1.56 + sh * 0.56, sx = cx + s * 2.14;
      solid.box(sx, y, z - 0.03, 0.98, 0.045, 0.28, wood(DARK));
      for (let i = 0; i < 6; i++) bottle(sx - 0.4 + i * 0.16, y + 0.022, z - 0.02, BOTTLES[(i * 3 + sh + (s > 0 ? 2 : 0)) % BOTTLES.length], 1.2);
    }
    solid.box(cx, 3.46, z + 0.0, bw + 0.5, 0.18, 0.34, wood(OAK)); solid.box(cx, 3.58, z + 0.02, bw + 0.7, 0.07, 0.4, wood(DARK, 0.06));
    for (let i = 0; i < 22; i++) solid.box(cx - bw / 2 - 0.1 + i * (bw + 0.2) / 21, 3.34, z + 0.14, 0.1, 0.07, 0.06, wood(tone(OAK, 1.2)));        // dentils under the cornice
    solid.box(cx, 3.88, z - 0.08, 2.3, 0.54, 0.08, wood(DARK)); solid.box(cx, 3.88, z - 0.05, 2.14, 0.42, 0.04, wood(tone(OAK, 0.8))); word('BAR', cx, 3.88, z - 0.025, 1.8, 0.44, 'z+', '#ffcf6a');
    // on the worktop: three kegs on their sides with a tap each, the till, a row of bottles
    for (let i = 0; i < 3; i++) {
      const kx = cx - 2.1 + i * 0.6, ky = by + 0.3;
      solid.rod(kx, ky, z + 0.0, kx, ky, z + 0.52, 0.22, wood(PINE), 12); solid.cyl(kx, by + 0.06, z + 0.26, 0.26, 0.06, wood(DARK), 4);
      for (const kz of [0.1, 0.42]) solid.add(new THREE.TorusGeometry(0.225, 0.016, 5, 14), at(kx, ky, z + kz), IRON);
      solid.rod(kx, ky - 0.1, z + 0.52, kx, ky - 0.1, z + 0.6, 0.02, BRASS, 6); solid.rod(kx, ky - 0.1, z + 0.6, kx, ky - 0.17, z + 0.6, 0.016, BRASS, 5);
    }
    solid.box(cx + 1.75, by + 0.2, z + 0.3, 0.44, 0.28, 0.4, BRASS); solid.box(cx + 1.75, by + 0.4, z + 0.2, 0.44, 0.14, 0.2, BRASS); solid.box(cx + 1.75, by + 0.5, z + 0.2, 0.3, 0.08, 0.02, [0.92, 0.9, 0.84]);
    for (let i = 0; i < 12; i++) solid.ball(cx + 1.62 + (i % 4) * 0.085, by + 0.345, z + 0.4 + ((i / 4) | 0) * 0.045, 0.016, [0.9, 0.88, 0.8]);
    for (let i = 0; i < 9; i++) bottle(cx - 0.6 + i * 0.16, by + 0.06, z + 0.12, BOTTLES[(i * 2 + 1) % BOTTLES.length], 1.25);
    // two barrels in the corner inside, out of the keeper's way
    for (const [px, pz, hh] of [[x + CT + 0.32, 1.02, 0.8]]) { solid.cyl(px, 0, pz, 0.28, hh, wood(PINE), 12, 0.24); for (const y of [0.16, hh - 0.16]) solid.add(new THREE.TorusGeometry(0.285, 0.02, 5, 14), at(px, y, pz, Math.PI / 2, 0, 0), IRON); }

    // overhead: four posts carry a frame over the counter, and under it the beer mugs hang by their handles
    const GY = 2.52, posts = [[x + 0.14, fz - 0.14], [x1 - 0.14, fz - 0.14], [x + 0.14, BACK + 0.16], [x1 - 0.14, GATE + 0.16]];
    for (const [px, pz] of posts) { high.cyl(px, h + 0.07, pz, 0.055, GY - h - 0.07, wood(DARK), 8); for (const y of [h + 0.2, GY - 0.14]) high.add(new THREE.TorusGeometry(0.06, 0.024, 5, 10), at(px, y, pz, Math.PI / 2, 0, 0), BRASS); high.box(px, h + 0.1, pz, 0.16, 0.06, 0.16, wood(DARK)); }
    high.box(cx, GY + 0.11, fz - 0.14, w + 0.2, 0.22, 0.3, oak); high.box(cx, GY + 0.245, fz - 0.14, w + 0.34, 0.05, 0.42, dark);
    for (const px of [x + 0.14, x1 - 0.14]) { high.box(px, GY + 0.11, (z - 0.1 + fz - 0.29) / 2, 0.3, 0.22, fz - 0.29 - z + 0.1, oak); high.box(px, GY + 0.245, (z - 0.1 + fz - 0.29) / 2, 0.42, 0.05, fz - 0.29 - z + 0.1, dark); }
    word('FADØL', cx, GY + 0.11, fz + 0.012, 1.5, 0.19, 'z+', '#ffcf6a', true);
    const hang = (ax, az, bx, bz, n) => {
      high.rod(ax, GY - 0.07, az, bx, GY - 0.07, bz, 0.014, BRASS, 6);
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n, px = ax + (bx - ax) * t, pz = az + (bz - az) * t, turn = az === bz ? 0 : Math.PI / 2;
        high.rod(px, GY - 0.07, pz, px, GY - 0.185, pz, 0.008, BRASS, 4);
        mug(high, px - Math.cos(turn) * 0.06, GY - 0.3, pz - Math.sin(turn) * 0.06, false, turn);
      }
    };
    hang(x + 0.5, fz - 0.2, x1 - 0.5, fz - 0.2, 20); hang(x + 0.2, BACK + 0.5, x + 0.2, fz - 0.55, 4); hang(x1 - 0.2, GATE + 0.45, x1 - 0.2, fz - 0.55, 3);
    live.bartender = [cx, 0, (BACK + fz - CT) / 2 + 0.02, 1.65]; live.aisle = [x + CT, BACK + 0.06, x1 - CT, fz - CT];      // (the aisle: the worktop's edge to the counter's back)      // where the keeper stands in the aisle, and how far to each side it goes
  }

  // ---------- the notice board, with the group's name on a board over it ----------
  { const [x, y, w, h] = STATION.board.wall, cx = x + w / 2;
    solid.box(cx, y + h / 2, 0.05, w, h, 0.07, wood(DARK)); solid.box(cx, y + h / 2, 0.09, w - 0.2, h - 0.2, 0.02, [0.6, 0.45, 0.28]);
    for (const [px, py, pw, ph, rot, col] of [[-0.6, 0.3, 0.6, 0.78, 0.04, PAPER], [0.28, 0.35, 0.5, 0.42, -0.06, [0.95, 0.9, 0.6]], [0.42, -0.28, 0.7, 0.5, 0.03, PAPER], [-0.3, -0.42, 0.5, 0.36, -0.1, [0.8, 0.86, 0.9]]]) {
      solid.box(cx + px, y + h / 2 + py, 0.105, pw, ph, 0.006, col, 0, 0, rot); solid.ball(cx + px, y + h / 2 + py + ph / 2 - 0.05, 0.115, 0.022, [0.7, 0.1, 0.1], 1, 1, 1, 6);
    }
    // a cup for the best, drawn large on the middle paper
    solid.cyl(cx - 0.6, y + h / 2 + 0.1, 0.11, 0.05, 0.03, BRASS, 8); solid.cyl(cx - 0.6, y + h / 2 + 0.16, 0.11, 0.07, 0.16, BRASS, 10, 0.12);
    live.nameSign = [cx, y + h + 0.5, 0.12, 3.0, 0.5];
    solid.box(cx, y + h + 0.5, 0.08, 3.1, 0.56, 0.06, wood(PINE)); for (const s of [-1, 1]) solid.rod(cx + s * 1.3, y + h + 0.78, 0.08, cx + s * 1.3, y + h + 1.2, 0.08, 0.012, IRON, 4);
  }

  // ---------- the arcade: a shooting gallery in a cabinet ----------
  { const [x, z, w, d] = STATION.arcade.box, h = 2.5, cx = x + w / 2;
    solid.box(cx, h / 2, z + d / 2 - 0.1, w, h, d - 0.2, wood(tone(WINE, 0.8))); solid.box(cx, 1.0, z + d - 0.1, w, 0.16, 0.5, wood(DARK));
    solid.box(cx, 0.5, z + d - 0.06, w - 0.1, 1.0, 0.12, wood(tone(WINE, 0.6)));
    glow.box(cx, 1.62, z + d - 0.19, w - 0.3, 0.86, 0.01, [0.1, 0.2, 0.16]); live.arcade = [cx, 1.62, z + d - 0.18, w - 0.34, 0.8];
    solid.box(cx, 2.24, z + d - 0.12, w, 0.4, 0.2, wood(DARK)); word('ARKADE', cx, 2.24, z + d - 0.015, w - 0.14, 0.3, 'z+', '#ffcf6a');
    for (const s of [-1, 1]) solid.box(cx + s * (w / 2 - 0.04), 1.55, z + d - 0.12, 0.08, 1.1, 0.24, wood(DARK));
    solid.cyl(cx - 0.3, 1.08, z + d + 0.0, 0.02, 0.16, IRON, 6); solid.ball(cx - 0.3, 1.27, z + d, 0.05, [0.8, 0.1, 0.1], 1, 1, 1, 8);
    for (let i = 0; i < 3; i++) solid.cyl(cx + 0.05 + i * 0.16, 1.08, z + d + 0.02, 0.045, 0.03, [[0.9, 0.7, 0.1], [0.2, 0.5, 0.8], [0.8, 0.2, 0.2]][i], 8);
  }

  // ---------- the music box: a piano that plays by itself, with a horn on top ----------
  { const [x, z, w, d] = STATION.jukebox.box, cx = x + w / 2, bz = z + 0.32;
    solid.box(cx, 0.66, bz, w, 1.32, 0.5, wood(DARK, 0.08)); solid.box(cx, 1.35, bz, w + 0.08, 0.06, 0.56, wood(OAK));
    solid.box(cx, 0.78, bz + 0.36, w, 0.09, 0.3, wood(DARK, 0.08));                                                       // the key bed
    for (const s of [-1, 1]) { solid.box(cx + s * (w / 2 - 0.04), 0.38, bz + 0.38, 0.08, 0.76, 0.1, wood(DARK)); }
    glow.box(cx, 1.08, bz + 0.256, w - 0.3, 0.24, 0.01, [0.85, 0.8, 0.62]);                                               // the paper roll behind its little window
    live.roll = [cx, 1.08, bz + 0.262, w - 0.3, 0.24]; live.keys = [cx, 0.835, bz + 0.4, w - 0.12];
    for (const s of [-1, 1]) solid.box(cx + s * 0.36, 0.3, bz + 0.26, 0.2, 0.3, 0.02, BRASS);                               // the pedals' brass plates
    // the horn
    solid.cyl(cx + 0.2, 1.38, bz, 0.05, 0.3, BRASS, 8);
    solid.add(new THREE.CylinderGeometry(0.34, 0.05, 0.6, 16, 1, true), at(cx + 0.02, 1.86, bz + 0.2, 0.9, 0, 0.35), (px, py, pz, n) => tone(BRASS, 0.9 + 0.2 * n.y));
    solid.cyl(cx - 0.3, 1.38, bz - 0.05, 0.06, 0.2, [0.6, 0.12, 0.12], 8); solid.ball(cx - 0.3, 1.63, bz - 0.05, 0.08, [3, 2.2, 1], 1, 1.4, 1, 8);          // a lamp in a red glass
    live.notes = [cx, 2.1, bz + 0.3];
  }

  // ---------- the way out: swing doors, and the yard behind them ----------
  { const [x, , w, h] = STATION.door.wall, cx = x + w / 2, log = wood(tone(OAK, 0.9));
    paneB.box(cx, h / 2, 0.012, w - 0.1, h, 0.01, [2.4, 2.1, 1.5]);
    for (const s of [-1, 1]) solid.box(cx + s * (w / 2 + 0.035), h / 2, -0.14, 0.07, h, 0.27, log);        // the doorway through the wall of logs
    solid.box(cx, h + 0.035, -0.14, w + 0.14, 0.07, 0.27, log);
    for (const s of [-1, 1]) solid.box(cx + s * (w / 2), h / 2, 0.08, 0.14, h, 0.16, wood(DARK));
    solid.box(cx, h + 0.07, 0.08, w + 0.28, 0.14, 0.16, wood(DARK));
    live.doors = [-1, 1].map(s => ({ x: cx + s * (w / 2 - 0.07), s, w: w / 2 - 0.1 }));
    solid.box(cx, h + 0.42, 0.07, 0.9, 0.36, 0.05, wood(PINE)); word('UD', cx, h + 0.42, 0.1, 0.84, 0.3);
  }

  // ---------- the door to the cabins, in the west end: one's own cabin is out there among the pines ----------
  { const [z0, , w, h] = STATION.cabin.west, cz = z0 + w / 2, log = wood(tone(OAK, 0.9));
    for (const s2 of [-1, 1]) solid.box(-0.135, h / 2, cz + s2 * (w / 2 + 0.035), 0.27, h, 0.07, log);      // the wall's thickness round it
    solid.box(-0.135, h + 0.035, cz, 0.27, 0.07, w + 0.14, log);
    for (const s2 of [-1, 1]) solid.box(0.04, h / 2 + 0.03, cz + s2 * (w / 2 + 0.06), 0.06, h + 0.06, 0.12, wood(DARK));
    solid.box(0.04, h + 0.1, cz, 0.06, 0.14, w + 0.28, wood(DARK));
    solid.box(0.05, h + 0.45, cz, 0.05, 0.38, 1.3, wood(PINE)); word('HYTTERNE', 0.08, h + 0.45, cz, 1.2, 0.3, 'x+');
    solid.box(0.06, 1.95, cz - w / 2 - 0.25, 0.12, 0.24, 0.12, IRON); glow.box(0.08, 1.95, cz - w / 2 - 0.25, 0.08, 0.17, 0.08, [2.4, 1.5, 0.6]);      // a lantern (on the side away from the board)
    live.westDoor = { x: -0.12, z: z0, w, h };
  }
  { const [z0, y0, w, h] = STATION.cabins.west;                      // the board's frame (what is on it: setCabins)
    for (const [dy, dz, hh, ww] of [[h / 2 + 0.04, 0, 0.08, w + 0.16], [-h / 2 - 0.04, 0, 0.08, w + 0.16], [0, w / 2 + 0.04, h, 0.08], [0, -w / 2 - 0.04, h, 0.08]]) solid.box(0.04, y0 + h / 2 + dy, z0 + w / 2 + dz, 0.06, hh, ww, wood(DARK));
    live.cabinBoard = [0.03, y0 + h / 2, z0 + w / 2, w, h];
  }

  // ---------- tables ----------
  // the board-game table: four in a row standing up, the ludo board lying down
  { const [x, z, w, d] = STATION.games.box, h = STATION.games.h, cx = x + w / 2, cz = z + d / 2;
    solid.box(cx, h - 0.04, cz, w, 0.08, d, wood(PINE)); for (const sx of [-1, 1]) for (const sz of [-1, 1]) leg(cx + sx * (w / 2 - 0.14), cz + sz * (d / 2 - 0.14), h - 0.08, 0.06, wood(OAK));
    solid.box(cx - 0.55, h + 0.36, cz - 0.1, 1.0, 0.72, 0.07, [0.1, 0.24, 0.6]);
    for (let i = 0; i < 6; i++) for (let j = 0; j < 5; j++) solid.add(new THREE.CylinderGeometry(0.055, 0.055, 0.078, 10), at(cx - 0.97 + i * 0.168, h + 0.09 + j * 0.135, cz - 0.1, Math.PI / 2, 0, 0), (i * 7 + j * 3) % 5 < 2 ? [0.85, 0.12, 0.1] : (i + j * 2) % 3 ? [0.92, 0.75, 0.1] : [0.03, 0.05, 0.15]);
    solid.box(cx + 0.75, h + 0.012, cz + 0.05, 0.86, 0.02, 0.86, CREAM);
    for (const [px, pz, col] of [[-1, -1, [0.8, 0.15, 0.12]], [1, -1, [0.15, 0.5, 0.2]], [1, 1, [0.9, 0.75, 0.1]], [-1, 1, [0.15, 0.35, 0.75]]]) solid.box(cx + 0.75 + px * 0.27, h + 0.026, cz + 0.05 + pz * 0.27, 0.28, 0.008, 0.28, col);
    solid.box(cx, 0.012, cz, w + 2.0, 0.02, d + 1.9, [0.42, 0.09, 0.08]); solid.box(cx, 0.016, cz, w + 1.6, 0.02, d + 1.5, [0.55, 0.14, 0.1]);        // the rug it stands on
  }
  // the dice table: a leather cup and dice
  { const [cx, cz, rx] = STATION.dice.round, h = STATION.dice.h;
    solid.cyl(cx, h - 0.07, cz, rx, 0.07, wood(PINE), 28); solid.cyl(cx, h - 0.012, cz, rx - 0.12, 0.015, FELT, 28); solid.cyl(cx, 0.06, cz, 0.16, h - 0.13, wood(OAK), 10); solid.cyl(cx, 0, cz, 0.55, 0.07, wood(OAK), 14, 0.2);
    solid.cyl(cx - 0.25, h, cz + 0.1, 0.1, 0.2, LEATHER, 10, 0.12);
    for (const [px, pz, a] of [[0.18, -0.12, 0.3], [0.34, 0.14, 1.1], [0.02, 0.3, 0.7]]) solid.box(cx + px, h + 0.05, cz + pz, 0.09, 0.09, 0.09, CREAM, 0, a, 0);
  }
  // the card table: green cloth in a padded rim, cards and chips
  { const [cx, cz, rx, rz] = STATION.cards.round, h = STATION.cards.h, k = rz / rx;
    solid.add(new THREE.CylinderGeometry(rx, rx, 0.09, 36), at(cx, h - 0.045, cz, 0, 0, 0, 1, 1, k), wood(DARK)); solid.add(new THREE.CylinderGeometry(rx - 0.14, rx - 0.14, 0.02, 36), at(cx, h + 0.006, cz, 0, 0, 0, 1, 1, (rz - 0.14) / (rx - 0.14)), FELT);
    solid.add(new THREE.TorusGeometry(rx - 0.07, 0.055, 6, 36), at(cx, h, cz, Math.PI / 2, 0, 0, 1, k, 1), LEATHER);
    for (const sx of [-1, 1]) { solid.cyl(cx + sx * rx * 0.5, 0.06, cz, 0.13, h - 0.15, wood(OAK), 10); solid.cyl(cx + sx * rx * 0.5, 0, cz, 0.4, 0.07, wood(OAK), 12, 0.18); }
    for (let i = 0; i < 5; i++) solid.box(cx - 0.36 + i * 0.18, h + 0.02, cz - 0.05, 0.14, 0.004, 0.2, i < 3 ? PAPER : [0.55, 0.1, 0.12], 0, (i - 2) * 0.06, 0);
    for (const [px, pz, col, n] of [[0.7, 0.3, [0.8, 0.12, 0.1], 5], [0.84, 0.22, [0.1, 0.3, 0.7], 3], [-0.8, 0.26, [0.08, 0.08, 0.08], 4], [-0.66, 0.36, [0.9, 0.85, 0.75], 6], [0.1, 0.42, [0.1, 0.5, 0.2], 3]]) solid.cyl(cx + px, h + 0.016, cz + pz, 0.055, 0.018 * n, (x2, y2) => (Math.floor((y2 - h - 0.016) / 0.018) % 2 ? tone(col, 1.25) : col), 10);
  }
  // the command table: the map with its flags
  { const [x, z, w, d] = STATION.command.box, h = STATION.command.h, cx = x + w / 2, cz = z + d / 2;
    solid.box(cx, h - 0.05, cz, w, 0.1, d, wood(OAK)); for (const sx of [-1, 1]) for (const sz of [-1, 1]) leg(cx + sx * (w / 2 - 0.16), cz + sz * (d / 2 - 0.16), h - 0.1, 0.07, wood(DARK));
    solid.box(cx, h + 0.008, cz, w - 0.3, 0.012, d - 0.3, [0.2, 0.42, 0.62]);
    for (const [px, pz, sx, sz] of [[-0.6, -0.1, 0.7, 0.42], [0.5, 0.2, 0.62, 0.36], [0.0, -0.36, 0.3, 0.16], [-0.1, 0.34, 0.4, 0.15]]) solid.add(new THREE.SphereGeometry(1, 10, 6, 0, 6.283, 0, 1.57), at(cx + px, h + 0.014, cz + pz, 0, 0, 0, sx, 0.05, sz), [0.36, 0.55, 0.25]);
    for (const [px, pz, col] of [[-0.7, -0.15, [0.85, 0.15, 0.12]], [-0.4, 0.0, [0.85, 0.15, 0.12]], [0.5, 0.25, [0.15, 0.35, 0.8]], [0.7, 0.1, [0.15, 0.35, 0.8]]]) { solid.cyl(cx + px, h + 0.03, cz + pz, 0.008, 0.24, IRON, 4); solid.box(cx + px + 0.06, h + 0.23, cz + pz, 0.12, 0.08, 0.005, col); }
    solid.rod(cx - 1.0, h + 0.03, cz + 0.5, cx - 0.6, h + 0.03, cz + 0.56, 0.02, BRASS, 6);                                // a spy-glass
  }
  // the sofa: buttoned leather, its back to the room's back wall
  { const [x, z, w, d] = STATION.sofa.box, cx = x + w / 2;
    solid.box(cx, 0.26, z + d / 2 + 0.1, w - 0.3, 0.3, d - 0.2, WINE); solid.box(cx, 0.08, z + d / 2, w - 0.1, 0.16, d, wood(DARK));
    solid.box(cx, 0.78, z + 0.2, w - 0.3, 0.86, 0.3, WINE, -0.1, 0, 0);
    for (const s of [-1, 1]) { solid.box(cx + s * (w / 2 - 0.16), 0.5, z + d / 2, 0.32, 0.64, d, WINE); solid.add(new THREE.CylinderGeometry(0.17, 0.17, d, 10), at(cx + s * (w / 2 - 0.16), 0.84, z + d / 2, Math.PI / 2, 0, 0), WINE); }
    for (let i = 0; i < 3; i++) solid.box(x + 0.95 + i * 1.15, 0.45, z + d / 2 + 0.12, 1.08, 0.12, d - 0.34, tone(WINE, 1.25));
    for (let i = 0; i < 7; i++) for (let j = 0; j < 2; j++) solid.ball(x + 0.6 + i * 0.5, 0.62 + j * 0.34, z + 0.37 - j * 0.035, 0.03, BRASS, 1, 1, 1, 6);
    solid.box(cx + 1.2, 0.5, z + d / 2 + 0.15, 0.4, 0.3, 0.36, [0.85, 0.6, 0.15], 0.2, 0.4, 0.1);                           // a cushion
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) solid.cyl(cx + sx * (w / 2 - 0.2), 0, z + d / 2 + sz * (d / 2 - 0.1), 0.06, 0.1, BRASS, 8);
  }
  // the dance floor: a round of light boards with a star, and lights at its rim
  { const [cx, cz, r] = STATION.dance.floor;
    solid.cyl(cx, 0.0, cz, r, 0.03, wood(tone(PINE, 1.25)), 40); solid.add(new THREE.TorusGeometry(r, 0.035, 5, 44), at(cx, 0.03, cz, Math.PI / 2, 0, 0), BRASS);
    const star = new THREE.Shape(); for (let i = 0; i < 10; i++) { const a = i / 10 * 6.283 + 0.314, q = i % 2 ? 0.5 : 1.25; if (i) star.lineTo(Math.cos(a) * q, Math.sin(a) * q); else star.moveTo(Math.cos(a) * q, Math.sin(a) * q); }
    solid.add(new THREE.ShapeGeometry(star), at(cx, 0.034, cz, -Math.PI / 2, 0, 0), [0.7, 0.2, 0.15]);
    live.dance = []; for (let k = 0; k < 10; k++) { const a = k / 10 * 6.283; live.dance.push([cx + Math.cos(a) * (r + 0.02), 0.07, cz + Math.sin(a) * (r + 0.02)]); }
  }

  // ---------- green things and a lamp ----------
  const cactus = (x, z, s = 1) => {
    solid.cyl(x, 0, z, 0.3 * s, 0.4 * s, [0.6, 0.3, 0.18], 12, 0.36 * s); solid.cyl(x, 0.38 * s, z, 0.33 * s, 0.03, [0.2, 0.12, 0.06], 12);
    const green = (px, py, pz, n) => tone([0.16, 0.42, 0.18], 0.85 + 0.3 * Math.abs(Math.sin(Math.atan2(n.z, n.x) * 5)));
    solid.cyl(x, 0.4 * s, z, 0.15 * s, 1.15 * s, green, 10); solid.ball(x, 1.55 * s, z, 0.15 * s, green, 1, 1, 1, 10);
    for (const [sx, y0, hh] of [[-1, 0.9, 0.42], [1, 0.7, 0.55]]) { solid.rod(x, y0 * s, z, x + sx * 0.3 * s, y0 * s, z, 0.085 * s, green, 8); solid.cyl(x + sx * 0.3 * s, y0 * s - 0.04, z, 0.085 * s, hh * s, green, 8); solid.ball(x + sx * 0.3 * s, (y0 + hh) * s - 0.04, z, 0.085 * s, green, 1, 1, 1, 8); }
    solid.ball(x + 0.05, 1.7 * s, z + 0.02, 0.07 * s, [0.9, 0.35, 0.5], 1, 0.7, 1, 8);
  };
  cactus(STATION.plant1.round[0], STATION.plant1.round[1], 1); cactus(STATION.plant2.round[0], STATION.plant2.round[1], 0.9); cactus(STATION.plant3.round[0], STATION.plant3.round[1], 1);
  { const [x, z] = STATION.lamp.round;
    solid.cyl(x, 0, z, 0.22, 0.05, BRASS, 12); solid.cyl(x, 0.05, z, 0.025, 1.85, BRASS, 6);
    solid.add(new THREE.CylinderGeometry(0.16, 0.36, 0.42, 14, 1, true), at(x, 2.1, z), (px, py, pz, n) => [2.4, 1.7, 0.8]); glow.ball(x, 2.02, z, 0.08, [4, 3.2, 1.6]);
  }

  // ---------- the casino wing ----------
  STATIONS.filter(st => st.kind === 'slot').forEach((st, i) => {
    const [x, z, w, d] = st.box, cx = x + w / 2, col = [[0.75, 0.1, 0.12], [0.12, 0.35, 0.7], [0.85, 0.4, 0.55]][i], fz = z + d;
    solid.box(cx, 0.55, z + d / 2, w, 1.1, d, wood(DARK)); solid.box(cx, 1.6, z + d / 2 - 0.08, w - 0.08, 1.0, d - 0.16, col);
    solid.add(new THREE.CylinderGeometry(w / 2 - 0.04, w / 2 - 0.04, d - 0.16, 16, 1, false, -Math.PI / 2, Math.PI), at(cx, 2.1, z + d / 2 - 0.08, Math.PI / 2, 0, 0), col);
    solid.box(cx, 1.62, fz - 0.14, w - 0.3, 0.5, 0.04, BRASS); glow.box(cx, 1.62, fz - 0.115, w - 0.4, 0.4, 0.01, [0.95, 0.93, 0.85]);
    solid.box(cx, 1.12, fz - 0.06, w - 0.2, 0.08, 0.3, BRASS); solid.box(cx, 0.72, fz - 0.02, w - 0.5, 0.2, 0.1, [0.02, 0.02, 0.02]); solid.box(cx, 0.6, fz + 0.06, w - 0.36, 0.05, 0.22, BRASS);
    solid.rod(cx + w / 2 - 0.02, 1.3, fz - 0.3, cx + w / 2 + 0.16, 1.3, fz - 0.3, 0.03, STEEL, 6);
    (live.slots = live.slots || {})[st.id] = { reels: [cx, 1.62, fz - 0.108, w - 0.42, 0.38], arm: [cx + w / 2 + 0.16, 1.3, fz - 0.3], col, bulbs: [] };
    word(['KIRSEBÆR', 'ROBOT', 'GRISEN'][i], cx, 2.2, fz - 0.135, w - 0.3, 0.24, 'z+', '#fff3c4');
    for (let k = 0; k < 7; k++) { const a = Math.PI * (k / 6), bx = cx - Math.cos(a) * (w / 2 - 0.1), by = 2.1 + Math.sin(a) * (w / 2 - 0.1); live.slots[st.id].bulbs.push([bx, by, fz - 0.15]); }
  });
  { const [x, y, w, h] = STATION.casino.wall, cx = x + w / 2;
    solid.box(cx, y + h / 2, 0.05, w + 0.16, h + 0.16, 0.07, wood(OAK)); live.board = [cx, y + h / 2, 0.092, w, h];
    solid.box(cx, y - 0.1, 0.1, w * 0.7, 0.04, 0.1, wood(OAK)); solid.box(cx - 0.3, y - 0.06, 0.12, 0.12, 0.03, 0.03, CREAM);
  }
  // the blackjack table: half a round, the house's side straight
  { const [cx, cz, rx, rz] = STATION.blackjack.round, h = STATION.blackjack.h, z0 = cz - rz * 0.55;
    const half = (r, hh, y, col, sz) => solid.add(new THREE.CylinderGeometry(r, r, hh, 30, 1, false, -Math.PI / 2, Math.PI), at(cx, y, z0, 0, 0, 0, 1, 1, sz), col);
    half(rx, 0.09, h - 0.045, wood(DARK), (rz * 1.55) / rx); half(rx - 0.16, 0.02, h + 0.006, FELT, (rz * 1.55 - 0.16) / (rx - 0.16));
    solid.box(cx, h - 0.045, z0 - 0.1, rx * 2, 0.09, 0.22, wood(DARK));
    for (const sx of [-1, 1]) { solid.cyl(cx + sx * rx * 0.55, 0.06, z0 + 0.5, 0.12, h - 0.15, wood(OAK), 10); solid.cyl(cx + sx * rx * 0.55, 0, z0 + 0.5, 0.38, 0.07, wood(OAK), 12, 0.16); }
    for (let i = 0; i < 5; i++) { const a = Math.PI * (0.14 + i * 0.18), px = cx - Math.cos(a) * (rx - 0.62), pz = z0 + Math.sin(a) * (rz * 1.55 - 0.62) * 0.92; solid.box(px, h + 0.018, pz, 0.26, 0.004, 0.34, [0.09, 0.36, 0.19], 0, Math.PI / 2 - a, 0); }
    solid.box(cx + rx - 0.75, h + 0.08, z0 + 0.12, 0.3, 0.14, 0.2, [0.05, 0.05, 0.06]); solid.box(cx, h + 0.02, z0 + 0.14, 0.5, 0.01, 0.2, PAPER);
    for (const [px, col] of [[-0.9, [0.8, 0.12, 0.1]], [-0.74, [0.1, 0.3, 0.7]], [-0.58, [0.08, 0.08, 0.08]]]) solid.cyl(cx + px, h + 0.016, z0 + 0.14, 0.055, 0.08, col, 10);
    live.dealer = [cx, 0, cz - rz + 0.2];                          // inside the table's footprint, so that nobody walks through the dealer
  }
  // the casino's name over the opening
  high.box(CX + 0.02, H - 1.2, D / 2, 0.08, 0.7, 3.4, wood(DARK)); word('KASINO', CX - 0.03, H - 1.2, D / 2, 3.2, 0.58, 'x-', '#ffcf6a', true);
  // wanted bills on the walls: the house robot, for cheating at dice
  live.bills = [[0.02, 1.85, STATION.cabin.west[0] - 0.75, 'x+'], [W - 0.02, 1.9, 6.4, 'x-'], [23.3, 2.6, 0.03, 'z+']];

  // ---------- painted words and bills: one sheet for all of them ----------
  const AT = 1024, ROW = 64, quads = batch(), quadsHigh = batch();
  const sheet = picture(AT, AT, g => {
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    texts.forEach((t, i) => {
      const cw = Math.min(AT, Math.round(ROW * t.w / t.h)), cy = i * (ROW + 4);
      g.font = '700 ' + Math.round(ROW * 0.8) + 'px Fredoka, system-ui, sans-serif';
      const k = Math.min(1.25, (cw - 14) / Math.max(1, g.measureText(t.text).width));
      g.save(); g.translate(cw / 2, cy + ROW / 2 + 2); g.scale(k, 1);
      g.lineWidth = 11; g.strokeStyle = 'rgba(28,12,5,.92)'; g.strokeText(t.text, 0, 3); g.fillStyle = t.ink; g.fillText(t.text, 0, 0);
      g.restore();
      t.cell = [0, cy, cw, ROW];
    });
    // a wanted bill: the house robot, for cheating at dice
    const bx = 760, by = 700, bw = 240, bh = 310;
    g.fillStyle = '#e6d5a8'; g.fillRect(bx, by, bw, bh); g.strokeStyle = '#5a3a1a'; g.lineWidth = 5; g.strokeRect(bx + 8, by + 8, bw - 16, bh - 16);
    g.fillStyle = '#3a2410'; g.font = '700 38px Fredoka, system-ui, sans-serif'; g.fillText('EFTERLYST', bx + bw / 2, by + 44);
    g.fillStyle = '#b9c8d8'; g.beginPath(); g.roundRect(bx + 60, by + 86, 120, 92, 22); g.fill(); g.strokeStyle = '#3a2410'; g.lineWidth = 4; g.stroke();
    g.fillStyle = '#1d2b3a'; g.beginPath(); g.roundRect(bx + 74, by + 100, 92, 60, 12); g.fill();
    g.fillStyle = '#7fe0ff'; for (const sx of [-1, 1]) { g.beginPath(); g.ellipse(bx + bw / 2 + sx * 22, by + 124, 9, 11, 0, 0, 6.3); g.fill(); }
    g.strokeStyle = '#7fe0ff'; g.lineWidth = 4; g.beginPath(); g.arc(bx + bw / 2, by + 132, 16, 0.2 * Math.PI, 0.8 * Math.PI); g.stroke();
    g.strokeStyle = '#3a2410'; g.beginPath(); g.moveTo(bx + bw / 2, by + 86); g.lineTo(bx + bw / 2, by + 66); g.stroke(); g.fillStyle = '#e2403a'; g.beginPath(); g.arc(bx + bw / 2, by + 62, 7, 0, 6.3); g.fill();
    g.fillStyle = '#3a2410'; g.font = '600 24px Fredoka, system-ui, sans-serif'; g.fillText('for snyd i Meyer', bx + bw / 2, by + 214);
    g.font = '700 30px Fredoka, system-ui, sans-serif'; g.fillText('DUSØR: 1 JETON', bx + bw / 2, by + 262);
    live.billCell = [bx, by, bw, bh];
  });
  const facing = (x, y, z, w, h, face, e = 0) => face === 'x-' ? [[x - e, y - h / 2, z - w / 2], [x - e, y - h / 2, z + w / 2], [x - e, y + h / 2, z + w / 2], [x - e, y + h / 2, z - w / 2]]
    : face === 'x+' ? [[x + e, y - h / 2, z + w / 2], [x + e, y - h / 2, z - w / 2], [x + e, y + h / 2, z - w / 2], [x + e, y + h / 2, z + w / 2]]
      : [[x - w / 2, y - h / 2, z + e], [x + w / 2, y - h / 2, z + e], [x + w / 2, y + h / 2, z + e], [x - w / 2, y + h / 2, z + e]];
  const onSheet = (B, c, x, y, z, w, h, face) => { const q = facing(x, y, z, w, h, face); B.quad(q[0], q[1], q[2], q[3], [1, 1, 1], c[0] / AT, 1 - (c[1] + c[3]) / AT, (c[0] + c[2]) / AT, 1 - c[1] / AT); };
  for (const t of texts) onSheet(t.up ? quadsHigh : quads, t.cell, t.x, t.y, t.z, t.w, t.h, t.face);
  for (const [x, y, z, face] of live.bills) onSheet(quads, live.billCell, x, y, z, 0.62, 0.8, face);

  // ---------- into meshes ----------
  const lambert = o => new THREE.MeshLambertMaterial(Object.assign({ vertexColors: true }, o)), basic = o => new THREE.MeshBasicMaterial(Object.assign({ vertexColors: true }, o));
  const solidMat = lambert(), glowMat = basic();
  const meshes = [solid.mesh(solidMat, root, 'solid'), glow.mesh(glowMat, root, 'glow'), floorB.mesh(lambert({ map: planks }), root, 'floor'), carpetB.mesh(lambert({ map: carpet }), root, 'carpet'),
    paperB.mesh(lambert({ map: paper }), root, 'paper'), paper2B.mesh(lambert({ map: paper2 }), root, 'paper2'), wainB.mesh(lambert({ map: boards }), root, 'boards'),
    quads.mesh(basic({ map: sheet, transparent: true, depthWrite: false }), root, 'words')];
  const chairSets = [false, true].map(fine => {
    const list = chairs.filter(c => c.fine === fine), geo = chairShape(fine).mesh(solidMat).geometry, m = new THREE.InstancedMesh(geo, solidMat, Math.max(1, list.length));
    m.count = list.length; m.frustumCulled = false; m.name = fine ? 'chairsFine' : 'chairs';
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    list.forEach((c, n) => { c.n = n; c.set = m; });
    root.add(m);
    return m;
  });
  const CM = new THREE.Matrix4();
  const placeChair = c => {
    const l = c.line, k = Math.max(0, l.far - (GAP.tucked + (GAP.sit - GAP.tucked) * c.pull));
    CM.makeRotationY(Math.atan2(l.dx, l.dz)).setPosition(l.x + l.dx * k, 0, l.z + l.dz * k);
    c.set.setMatrixAt(c.n, CM); c.set.instanceMatrix.needsUpdate = true;
  };
  for (const c of chairs) placeChair(c);
  const nearGroup = new THREE.Group(); root.add(nearGroup);                       // what is on the front wall (hidden when one looks in through it)
  meshes.push(roofB.mesh(meshes[2].material, upper, 'roof'), gableB.mesh(meshes[6].material, upper, 'gables'));
  meshes.push(high.mesh(solidMat, upper, 'high'), highGlow.mesh(glowMat, upper, 'highGlow'), near.mesh(solidMat, nearGroup, 'near'), quadsHigh.mesh(meshes[7].material, upper, 'wordsHigh'));
  // What is outside the windows and the door. From above (the whole room at once) there is no outdoors: then the
  // openings are filled with plain daylight instead. The one who holds the camera says which (room3d.js).
  const panes = new THREE.Group(); panes.visible = false; root.add(panes); meshes.push(paneB.mesh(glowMat, panes, 'panes'));
  const outside = buildOutside(THREE, kit, { W, D, H, RIDGE, door: [STATION.door.wall[0], STATION.door.wall[2]], west: [STATION.cabin.west[0] + STATION.cabin.west[2] / 2, STATION.cabin.west[2], STATION.cabin.west[3]] }); root.add(outside.group);
  // The saloon from outside: what one sees of it from one's cabin. Boards on the walls, a roof of shingles, warm light
  // in the windows; the round windows in the gables and the door to the cabins. Only the outer side of each face is
  // drawn, so from inside it costs nothing; the front wall's outside is hidden with `near`, the roof with `upper`.
  const shell = new THREE.Group(), shellNear = new THREE.Group(), shellUp = new THREE.Group(); root.add(shell, shellNear, shellUp);
  {
    const OUT = 0.27, lit = outside.lit, tint = (nx, nz, x, y, z) => lit([1, 1, 1])(x, y, z, { x: nx, y: 0, z: nz }), GR = -0.22;
    const siding = picture(256, 256, (g, w, h) => {
      for (let i = 0; i < 8; i++) { const k = 0.82 + rnd() * 0.3; g.fillStyle = 'rgb(' + (128 * k | 0) + ',' + (72 * k | 0) + ',' + (44 * k | 0) + ')'; g.fillRect(i * 32, 0, 32, h); for (let j = 0; j < 8; j++) { g.fillStyle = 'rgba(' + (rnd() < 0.5 ? '60,30,14' : '200,150,110') + ',.12)'; g.fillRect(i * 32 + 4 + rnd() * 22, rnd() * h, 1.5, 30 + rnd() * 70); } }
      for (let i = 0; i < 8; i++) { g.fillStyle = 'rgba(40,20,10,.55)'; g.fillRect(i * 32 - 3, 0, 6, h); g.fillStyle = 'rgba(255,220,180,.12)'; g.fillRect(i * 32 + 3, 0, 2, h); }
    }, true);
    const shingles = picture(256, 256, (g, w, h) => {
      g.fillStyle = '#2a2624'; g.fillRect(0, 0, w, h);
      for (let r = 0; r < 8; r++) for (let i = 0; i < 9; i++) { const x = i * 32 - (r % 2) * 16, k = 0.8 + rnd() * 0.4; g.fillStyle = 'rgb(' + (64 * k | 0) + ',' + (56 * k | 0) + ',' + (52 * k | 0) + ')'; g.fillRect(x + 1, r * 32 + 1, 30, 30); g.fillStyle = 'rgba(0,0,0,.4)'; g.fillRect(x, r * 32 + 28, 32, 4); }
    }, true);
    const sideB = batch(), sideNearB = batch(), roofOut = batch(), trimB = batch(), trimNearB = batch();
    // a wall's outside from its bottom corners a to b (seen from outside, left to right), with openings [from, to, bottom, top]
    const outWall = (B, a, b, holes, nx, nz) => {
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / len, uz = (b[1] - a[1]) / len, P = (q, y) => [a[0] + ux * q, y, a[1] + uz * q], col = tint(nx, nz, (a[0] + b[0]) / 2, 2, (a[1] + b[1]) / 2);
      const piece = (q0, q1, y0, y1) => { if (q1 - q0 > 1e-6 && y1 - y0 > 1e-6) B.quad(P(q0, y0), P(q1, y0), P(q1, y1), P(q0, y1), col, q0 / 2.4, y0 / 2.4, q1 / 2.4, y1 / 2.4); };
      let q = 0;
      for (const [h0, h1, y0, y1] of holes.slice().sort((p2, p3) => p2[0] - p3[0])) { piece(q, h0, GR, H); piece(h0, h1, GR, y0); piece(h0, h1, y1, H); q = h1; }
      piece(q, len, GR, H);
    };
    const winsAt = (list, qOf) => list.map(v => [qOf(v) - WIN.w / 2, qOf(v) + WIN.w / 2, WIN.y0, WIN.y1]);
    const [bx, , bw, bh] = STATION.door.wall;
    outWall(sideB, [-OUT, -OUT], [-OUT, D + OUT], [...winsAt(WIN.ends, z => z + OUT), [WD[0] + OUT, WD[0] + WD[2] + OUT, 0, WD[3]]], -1, 0);      // the west end, with the door to the cabins
    outWall(sideB, [W + OUT, D + OUT], [W + OUT, -OUT], winsAt(WIN.ends, z => D + OUT - z), 1, 0);
    outWall(sideB, [W + OUT, -OUT], [-OUT, -OUT], [[W + OUT - bx - bw, W + OUT - bx, 0, bh]], 0, -1);                                         // the back, with the swing doors
    outWall(sideNearB, [-OUT, D + OUT], [W + OUT, D + OUT], winsAt(WIN.front, x => x + OUT), 0, 1);
    // the gables' outside, with the round window
    for (const [x, face] of [[-OUT, -1], [W + OUT, 1]]) {
      const shape = new THREE.Shape([[-OUT, H], [D + OUT, H], [MID, RIDGE + 0.2]].map(q => new THREE.Vector2(q[0], q[1]))), ring = new THREE.Path(); ring.absarc(MID, H + 1.25, 0.86, 0, Math.PI * 2, true); shape.holes.push(ring);
      const sg = new THREE.ShapeGeometry(shape, 24), sp = sg.attributes.position, col = tint(face, 0, x, H + 1, MID);
      for (let i = 0; i < sg.index.count; i += 3) for (const j of face < 0 ? [0, 1, 2] : [0, 2, 1]) { const q = sg.index.getX(i + j), z = sp.getX(q), y = sp.getY(q); sideB.vert(x, y, z, face, 0, 0, z / 2.4, y / 2.4, col); }
      sg.dispose();
      trimB.add(new THREE.TorusGeometry(0.86, 0.07, 6, 24), at(x + face * 0.02, H + 1.25, MID, 0, Math.PI / 2, 0), lit([0.86, 0.8, 0.68])); trimB.add(new THREE.CircleGeometry(0.82, 20), at(x - face * 0.03, H + 1.25, MID, 0, face * Math.PI / 2, 0), [1.35, 0.88, 0.42]);
    }
    // warm light in the windows, and light boards round them, at the corners and under the eaves
    const TR = lit([0.86, 0.8, 0.68]), WARM = [1.35, 0.88, 0.42];
    const paneOut = (B, x, z, along, nx, nz, w, y0, y1) => {
      const P2 = (du, y, pw, ph, out, col) => along === 'z' ? B.box(x + nx * out, y, z + du, 0.04, ph, pw, col) : B.box(x + du, y, z + nz * out, pw, ph, 0.04, col);
      // the glass: one sheet that faces out (from inside one looks through it, at the valley)
      const gx = x - nx * 0.06, gz = z - nz * 0.06, rx = nz, rz = -nx, hw = w / 2;
      B.quad([gx - rx * hw, y0, gz - rz * hw], [gx + rx * hw, y0, gz + rz * hw], [gx + rx * hw, y1, gz + rz * hw], [gx - rx * hw, y1, gz - rz * hw], WARM);
      for (const s2 of [-1, 1]) P2(s2 * (w / 2 + 0.06), (y0 + y1) / 2, 0.12, y1 - y0 + 0.24, 0.03, TR);
      P2(0, y1 + 0.08, w + 0.36, 0.14, 0.03, TR); P2(0, y0 - 0.07, w + 0.36, 0.12, 0.05, TR);
    };
    for (const z of WIN.ends) { paneOut(trimB, -OUT, z, 'z', -1, 0, WIN.w, WIN.y0, WIN.y1); paneOut(trimB, W + OUT, z, 'z', 1, 0, WIN.w, WIN.y0, WIN.y1); }
    for (const x of WIN.front) paneOut(trimNearB, x, D + OUT, 'x', 0, 1, WIN.w, WIN.y0, WIN.y1);
    trimB.box(bx + bw / 2, bh / 2, -OUT + 0.06, bw, bh, 0.04, [0.5, 0.36, 0.22]);               // behind the swing doors (seen from outside, when nobody is in the saloon)
    for (const s2 of [-1, 1]) trimB.box(-OUT - 0.03, WD[3] / 2 + 0.03, WD[0] + WD[2] / 2 + s2 * (WD[2] / 2 + 0.07), 0.06, WD[3] + 0.06, 0.14, TR);
    trimB.box(-OUT - 0.03, WD[3] + 0.1, WD[0] + WD[2] / 2, 0.06, 0.16, WD[2] + 0.42, TR);
    for (const [x, z] of [[-OUT, -OUT], [W + OUT, -OUT]]) trimB.box(x, (GR + H) / 2, z, 0.2, H - GR, 0.2, TR);
    for (const [x, z] of [[-OUT, D + OUT], [W + OUT, D + OUT]]) trimNearB.box(x, (GR + H) / 2, z, 0.2, H - GR, 0.2, TR);
    // the roof: shingles from the eaves (out over the walls) to the ridge, a board along its edges and a cap on the ridge
    const OH = 0.6, slope = (RIDGE - H) / MID, eave = -OUT - OH, yE = H + 0.22 - (OUT + OH) * slope, yR = RIDGE + 0.32, ex0 = -OUT - 0.45, ex1 = W + OUT + 0.45, runL = Math.hypot(MID - eave, yR - yE);
    roofOut.quad([ex1, yE, eave], [ex0, yE, eave], [ex0, yR, MID], [ex1, yR, MID], tint(0, -1, W / 2, yE, 0), 0, 0, (ex1 - ex0) / 2.4, runL / 2.4);
    roofOut.quad([ex0, yE, D - eave], [ex1, yE, D - eave], [ex1, yR, MID], [ex0, yR, MID], lit([1, 1, 1])(W / 2, yE, D, { x: 0, y: 0.8, z: 0.6 }), 0, 0, (ex1 - ex0) / 2.4, runL / 2.4);
    for (const [z0, z1] of [[eave, MID], [D - eave, MID]]) for (const x of [ex0, ex1]) { const dz = z1 - z0, dy = yR - yE, l = Math.hypot(dz, dy); trimB.box(x, (yE + yR) / 2 - 0.1, (z0 + z1) / 2, 0.06, 0.24, l, TR, Math.atan2(-dy, dz), 0, 0); }
    trimB.box(W / 2, yR + 0.05, MID, ex1 - ex0, 0.12, 0.34, lit([0.2, 0.19, 0.18]));
    const shM = new THREE.MeshBasicMaterial({ vertexColors: true, map: siding }), roM = new THREE.MeshBasicMaterial({ vertexColors: true, map: shingles }), trM = new THREE.MeshBasicMaterial({ vertexColors: true });
    meshes.push(sideB.mesh(shM, shell, 'shell'), sideNearB.mesh(shM, shellNear, 'shellNear'), trimB.mesh(trM, shell, 'trim'), trimNearB.mesh(trM, shellNear, 'trimNear'));
    const roofMesh = roofOut.mesh(roM, shellUp, 'shellRoof'); meshes.push(roofMesh);
    // the roof's own top: drawn last of the saloon's things, so that the valley does not show through where a lower
    // thing stands in front of it (the outdoors are drawn after the room)
    shell.userData.pics = [siding, shingles];
  }
  // the door to the cabins: a leaf of planks on two iron straps, the same from both sides (it swings in when somebody goes through)
  const westLeaf = (() => {
    const B = batch(), { w, h } = live.westDoor;
    for (let i = 0; i < 6; i++) B.box(0, h / 2, (i + 0.5) * w / 6, 0.07, h - 0.02, w / 6 - 0.012, wood(tone(PINE, 0.7 + (i % 2) * 0.12), 0.15));
    for (const y of [0.45, h - 0.45]) B.box(0, y, w / 2, 0.11, 0.12, w - 0.1, wood(DARK));
    B.box(0, h / 2, w / 2, 0.1, h * 0.72, 0.1, wood(DARK), Math.atan2(w - 0.2, h - 0.9), 0, 0);
    for (const y of [0.45, h - 0.45]) for (const sx of [-1, 1]) B.box(sx * 0.06, y, 0.3, 0.012, 0.07, 0.55, IRON);
    for (const sx of [-1, 1]) { B.box(sx * 0.07, 1.05, w - 0.15, 0.04, 0.04, 0.14, IRON); B.ball(sx * 0.1, 1.05, w - 0.2, 0.035, IRON); }
    const m = B.mesh(solidMat, shell, 'westDoor'); m.matrixAutoUpdate = true; m.position.set(live.westDoor.x, 0, live.westDoor.z); meshes.push(m);
    return { m, a: 0, v: 0 };
  })();


  // ---------- what changes: boards one writes on, screens, reels, the piano's roll ----------
  const screen = (w, h, x, y, z, sw, sh, face = 'z+', o = {}) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const B = batch(), q = facing(x, y, z, sw, sh, face); B.quad(q[0], q[1], q[2], q[3], [1, 1, 1]);
    const m = B.mesh(new THREE.MeshBasicMaterial(Object.assign({ map: tex }, o)), root); meshes.push(m);
    return { g: c.getContext('2d'), w, h, tex, mesh: m, done() { tex.needsUpdate = true; } };
  };
  const FONT = 'Fredoka, system-ui, sans-serif';
  // the group's name over the notice board
  const nameS = screen(512, 84, ...live.nameSign.slice(0, 3), live.nameSign[3], live.nameSign[4], 'z+', { transparent: true, depthWrite: false });
  function setName(name) {
    const g = nameS.g; g.clearRect(0, 0, 512, 84);
    g.font = '700 54px ' + FONT; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    const k = Math.min(1, 480 / Math.max(1, g.measureText(name || 'Saloonen').width));
    g.save(); g.translate(256, 44); g.scale(k, 1); g.lineWidth = 9; g.strokeStyle = 'rgba(40,20,8,.9)'; g.strokeText(name || 'Saloonen', 0, 2); g.fillStyle = '#3a2410'; g.fillText(name || 'Saloonen', 0, 0); g.restore();
    nameS.done();
  }
  // the board by the door: who is in their cabin
  const cabinS = screen(512, 640, ...live.cabinBoard, 'x+');
  function setCabins(list) {
    const g = cabinS.g, W2 = 512, H2 = 640;
    g.fillStyle = '#3b2412'; g.fillRect(0, 0, W2, H2);
    for (let i = 0; i < 9; i++) { g.fillStyle = 'rgba(' + (i % 2 ? '255,210,150' : '0,0,0') + ',.06)'; g.fillRect(0, i * 72, W2, 70); }
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#f1d9a0'; g.font = '700 58px ' + FONT; g.fillText('I HYTTERNE', W2 / 2, 62);
    g.fillStyle = 'rgba(241,217,160,.4)'; g.fillRect(40, 104, W2 - 80, 4);
    const rows = list.slice(0, 7);
    if (!rows.length) { g.fillStyle = '#a99579'; g.font = '500 38px ' + FONT; g.fillText('Ingen lige nu', W2 / 2, 330); }
    rows.forEach((r, i) => {
      const y = 160 + i * 66, n = r.name.length > 13 ? r.name.slice(0, 12) + '…' : r.name;
      g.textAlign = 'left'; g.fillStyle = r.sleep ? '#a99579' : '#fff3d6'; g.font = '600 42px ' + FONT; g.fillText(n, 70, y);
      g.fillStyle = r.sleep ? '#8f8bd9' : '#ffc94d'; g.beginPath(); g.arc(42, y, 9, 0, 6.3); g.fill();
      if (r.sleep) { g.textAlign = 'right'; g.font = '600 30px ' + FONT; g.fillStyle = '#9d97e6'; g.fillText('sover', W2 - 40, y + 2); }
    });
    if (list.length > rows.length) { g.textAlign = 'center'; g.fillStyle = '#a99579'; g.font = '500 32px ' + FONT; g.fillText('og ' + (list.length - rows.length) + ' til', W2 / 2, 160 + 7 * 66); }
    cabinS.done();
  }
  // the chalk board in the casino (who is up and down today), and the jackpot over the last machine
  const boardS = screen(256, 234, ...live.board.slice(0, 3), live.board[3], live.board[4]);
  const jp = STATION.slot3.box, potS = screen(256, 96, jp[0] + jp[2] / 2, 3.1, 0.2, 1.5, 0.56);
  function setCasino(o) {
    let g = boardS.g;
    g.fillStyle = '#20302a'; g.fillRect(0, 0, 256, 234); g.textBaseline = 'middle';
    g.font = '700 30px ' + FONT; g.textAlign = 'center'; g.fillStyle = '#ffcf6a'; g.fillText('I DAG', 128, 28);
    const rows = (o.lines || []).slice(0, 4);
    g.font = '600 24px ' + FONT;
    if (!rows.length) { g.fillStyle = '#9fb3a8'; g.fillText('Ingen har spillet', 128, 124); }
    rows.forEach(([name, net], i) => { const y = 78 + i * 42; g.textAlign = 'left'; g.fillStyle = '#eef3ee'; g.fillText(name.length > 9 ? name.slice(0, 8) + '…' : name, 16, y); g.textAlign = 'right'; g.fillStyle = net > 0 ? '#8fe89a' : net < 0 ? '#ff9a8c' : '#eef3ee'; g.fillText((net > 0 ? '+' : '') + net, 240, y); });
    boardS.done();
    g = potS.g; g.fillStyle = '#2a1830'; g.fillRect(0, 0, 256, 96); g.strokeStyle = '#d9a441'; g.lineWidth = 6; g.strokeRect(3, 3, 250, 90);
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '700 24px ' + FONT; g.fillStyle = '#ffb347'; g.fillText('JACKPOT', 128, 26);
    g.font = '700 42px ' + FONT; g.fillStyle = '#ffe9a8'; g.fillText(String(o.pot || 0).replace(/\B(?=(\d{3})+$)/g, '.'), 128, 62);
    potS.done();
  }
  // the arcade's screen: targets in a row and a sight
  const arcS = screen(128, 128, live.arcade[0], live.arcade[1], live.arcade[2], live.arcade[3], live.arcade[4]);
  function paintArcade(t) {
    const g = arcS.g; g.fillStyle = '#10261c'; g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#3d7a4a'; g.fillRect(0, 96, 128, 32);
    for (let i = 0; i < 4; i++) { const x = ((i * 40 + t * 22) % 168) - 20, up = Math.sin(t * 2 + i) > -0.3; if (up) { g.fillStyle = '#f4ead0'; g.beginPath(); g.arc(x, 78, 11, 0, 6.3); g.fill(); g.fillStyle = '#d8343c'; g.beginPath(); g.arc(x, 78, 6, 0, 6.3); g.fill(); } g.fillStyle = '#7a5a2c'; g.fillRect(x - 2, 88, 4, 10); }
    const sx = 64 + Math.sin(t * 0.9) * 34, sy = 66 + Math.cos(t * 1.3) * 12; g.strokeStyle = '#ffd45e'; g.lineWidth = 2; g.beginPath(); g.arc(sx, sy, 9, 0, 6.3); g.moveTo(sx - 14, sy); g.lineTo(sx + 14, sy); g.moveTo(sx, sy - 14); g.lineTo(sx, sy + 14); g.stroke();
    arcS.done();
  }
  // the reels of the three machines
  const SYM = [['7', '#e2403a'], ['★', '#f2c33f'], ['♦', '#3d8fe0'], ['♥', '#f25a8e'], ['●', '#58b85f']];
  const reels = {};
  for (const [id, m] of Object.entries(live.slots)) reels[id] = { s: screen(96, 36, m.reels[0], m.reels[1], m.reels[2], m.reels[3], m.reels[4]), until: 0, shown: -1, seed: id.charCodeAt(4) * 7 };
  function paintReels(r, t, spinning) {
    const g = r.s.g; g.fillStyle = '#f4efe2'; g.fillRect(0, 0, 96, 36);
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '700 26px ' + FONT;
    for (let i = 0; i < 3; i++) {
      if (spinning) { for (let k = 0; k < 5; k++) { g.fillStyle = SYM[(k + i + Math.floor(t * 20)) % SYM.length][1]; g.globalAlpha = 0.45; g.fillRect(i * 32 + 5, ((k * 9 + t * 160 + i * 5) % 44) - 6, 22, 5); } g.globalAlpha = 1; }
      else { const q = SYM[(r.seed + i * 3 + r.shown * (i + 2)) % SYM.length]; g.fillStyle = q[1]; g.fillText(q[0], i * 32 + 16, 19); }
      if (i) { g.fillStyle = '#b9b0a0'; g.fillRect(i * 32 - 1, 0, 2, 36); }
    }
    r.s.done();
  }
  // the piano's roll of paper with holes in it
  const rollS = screen(64, 64, live.roll[0], live.roll[1], live.roll[2], live.roll[3], live.roll[4]);
  { const g = rollS.g; g.fillStyle = '#e9dfc0'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#4a3a22'; for (let i = 0; i < 46; i++) g.fillRect(4 + (i * 13 % 56), (i * 29) % 64, 3, 3 + (i % 4) * 3); rollS.tex.wrapT = THREE.RepeatWrapping; rollS.done(); }
  // its keys: white with black ones between, and a few that are down while it plays
  const keyB = batch(), KW = live.keys[3], NK = 22;
  for (let i = 0; i < NK; i++) keyB.box(live.keys[0] - KW / 2 + (i + 0.5) * KW / NK, live.keys[1], live.keys[2], KW / NK - 0.006, 0.02, 0.2, CREAM);
  for (let i = 0; i < NK - 1; i++) if (![2, 6].includes(i % 7)) keyB.box(live.keys[0] - KW / 2 + (i + 1) * KW / NK, live.keys[1] + 0.016, live.keys[2] - 0.04, KW / NK * 0.55, 0.022, 0.12, IRON);
  meshes.push(keyB.mesh(solidMat, root, 'keys'));
  const down = []; for (let i = 0; i < 4; i++) { const B = batch(); B.box(0, 0, 0, KW / NK - 0.006, 0.006, 0.2, [0.55, 0.5, 0.4]); const m = B.mesh(solidMat, root); m.matrixAutoUpdate = true; m.visible = false; meshes.push(m); down.push(m); }

  // the swing doors
  const doors = live.doors.map(d => {
    const B = batch(), w = d.w, dir = -d.s;                              // the leaf reaches from its hinge towards the middle
    for (let i = 0; i < 5; i++) B.box(dir * (i + 0.5) * w / 5, 1.25 + (i === 0 || i === 4 ? -0.05 : 0.04), 0, w / 5 - 0.012, 0.9 - (i === 0 || i === 4 ? 0.1 : 0), 0.04, wood(tone(PINE, 0.85 + (i % 2) * 0.2)));
    B.box(dir * w / 2, 0.82, 0, w, 0.07, 0.05, wood(DARK)); B.box(dir * w / 2, 1.62, 0, w, 0.07, 0.05, wood(DARK));
    const m = B.mesh(solidMat, root, 'door'); m.matrixAutoUpdate = true; m.position.set(d.x, 0, 0.14); meshes.push(m);
    return { m, s: d.s, a: 0, v: 0 };
  });
  // lights that take turns: round the machines, round the dance floor
  const bulbs = [0, 1].map(k => {
    const B = batch(); let n = 0;
    for (const m of Object.values(live.slots)) for (const q of m.bulbs) if (n++ % 2 === k) B.ball(q[0], q[1], q[2], 0.04, [3, 2.4, 1], 1, 1, 1, 6);
    for (const q of live.dance) if (n++ % 2 === k) B.ball(q[0], q[1], q[2], 0.05, [3, 1.6, 0.7], 1, 1, 1, 6);
    const m = B.mesh(new THREE.MeshBasicMaterial({ vertexColors: true }), root, 'bulbs'); meshes.push(m);
    return m;
  });

  // ---------- the house robots: one keeps the bar, one deals the cards ----------
  function robot(x, z, face, o = {}) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = face; root.add(g);
    const steel = [0.5, 0.58, 0.66], B = batch();
    B.cyl(0, 0.0, 0, 0.3, 0.5, [0.2, 0.22, 0.26], 12, 0.24); B.add(new THREE.CylinderGeometry(0.34, 0.3, 0.72, 14), at(0, 1.02, 0), steel); B.ball(0, 0.62, 0, 0.26, [0.3, 0.33, 0.38], 1, 0.5, 1);
    for (const s of [-1, 1]) B.add(new THREE.ConeGeometry(0.07, 0.16, 4), at(s * 0.08, 1.3, 0.32, 0, 0, s * Math.PI / 2), [0.7, 0.1, 0.12]);
    B.ball(0, 1.3, 0.33, 0.035, [0.5, 0.06, 0.08]);
    if (o.apron) B.box(0, 0.9, 0.3, 0.44, 0.5, 0.03, [0.9, 0.88, 0.8]);
    else B.box(0, 1.06, 0.31, 0.3, 0.4, 0.03, [0.1, 0.1, 0.12]);
    meshes.push(B.mesh(solidMat, g));
    const head = new THREE.Group(); head.position.y = 1.72; g.add(head);
    const HB = batch();
    HB.box(0, 0, 0, 0.74, 0.54, 0.5, [0.66, 0.74, 0.82]); HB.cyl(0, 0.27, 0, 0.012, 0.2, IRON, 4);
    for (const s of [-1, 1]) HB.add(new THREE.CylinderGeometry(0.07, 0.07, 0.06, 8), at(s * 0.4, 0, 0, 0, 0, Math.PI / 2), [0.35, 0.4, 0.46]);
    if (o.hat === 'bowler') { HB.cyl(0, 0.27, 0, 0.36, 0.03, IRON, 14); HB.add(new THREE.SphereGeometry(0.25, 12, 8, 0, 6.283, 0, 1.57), at(0, 0.29, 0), IRON); }
    else if (o.hat === 'visor') { HB.add(new THREE.CylinderGeometry(0.38, 0.38, 0.04, 14, 1, false, -1.2, 2.4), at(0, 0.2, 0.08), [0.1, 0.45, 0.25]); HB.add(new THREE.TorusGeometry(0.34, 0.03, 5, 16), at(0, 0.2, 0, Math.PI / 2, 0, 0), [0.1, 0.45, 0.25]); }
    meshes.push(HB.mesh(solidMat, head));
    const FB = batch(); FB.box(0, 0, 0.251, 0.58, 0.36, 0.01, [0.03, 0.06, 0.1]);
    for (const s of [-1, 1]) FB.add(new THREE.CircleGeometry(0.055, 10), at(s * 0.14, 0.03, 0.26, 0, 0, 0, 1, 1.2, 1), [0.5, 1.9, 2.4]);
    FB.add(new THREE.TorusGeometry(0.09, 0.012, 4, 10, Math.PI * 0.7), at(0, -0.03, 0.26, 0, 0, Math.PI * 1.15), [0.5, 1.9, 2.4]);
    const face2 = FB.mesh(glowMat, head); meshes.push(face2);
    const tipB = batch(); tipB.ball(0, 0.5, 0, 0.05, [3, 0.5, 0.3], 1, 1, 1, 8); const tip = tipB.mesh(new THREE.MeshBasicMaterial({ vertexColors: true }), head); meshes.push(tip);
    const arms = [-1, 1].map(s => { const a = new THREE.Group(); a.position.set(s * 0.36, 1.26, 0.02); g.add(a); const AB = batch(); AB.rod(0, 0, 0, 0, -0.3, 0.12, 0.05, steel); AB.rod(0, -0.3, 0.12, 0, -0.34, 0.42, 0.045, steel); AB.ball(0, -0.34, 0.44, 0.07, [0.3, 0.33, 0.38]);
      if (o.glass && s > 0) AB.cyl(0, -0.3, 0.44, 0.05, 0.14, GLASS, 8, 0.06);
      if (o.glass && s < 0) AB.box(0, -0.3, 0.5, 0.16, 0.02, 0.14, [0.9, 0.9, 0.85]);
      if (o.cards && s > 0) for (let i = 0; i < 3; i++) AB.box((i - 1) * 0.05, -0.26, 0.5, 0.09, 0.13, 0.004, PAPER, 0, 0, (i - 1) * -0.25);
      meshes.push(AB.mesh(solidMat, a)); return a; });
    return { g, head, arms, tip, x, z };
  }
  const keeper = robot(live.bartender[0], live.bartender[2], 0, { apron: true, hat: 'bowler', glass: true });
  const dealer = robot(live.dealer[0], live.dealer[2], 0, { hat: 'visor', cards: true });

  setName(groupName); setCasino({}); paintArcade(0); for (const r of Object.values(reels)) paintReels(r, 0, false);
  let arcT = 0, music = false, keyT = 0, hold = 0;
  return {
    root, upper, near: nearGroup, outside: outside.group, panes, shell, shellNear, shellUp, picks, signs, lamps, notes: live.notes, setName, setCasino, setCabins,
    // somebody goes through the door to the cabins: it swings in and closes again
    swingWest() { westLeaf.v = 4.2; },
    setMusic(on) { music = !!on; if (!on) for (const m of down) m.visible = false; },
    // a machine turns for `secs` seconds
    spin(id, secs, t) { const r = reels[id]; if (r) { r.until = t + secs; r.shown++; } },
    swing() { for (const d of doors) d.v = 5 * d.s; },
    // somebody stands in the doorway: the doors are held open, outwards, so that one can look out
    doorway(open) { hold = open ? 1.3 : 0; },
    // which seats are in use (somebody sits there or is on the way): a Set of 'station:seat'
    seats(used) { for (const c of chairs) c.want = used.has(c.key) ? 1 : 0; },
    chairs, live,
    // who the barkeeper looks at: [x, z] or null
    tick(dt, t, look) {
      // the robots: the keeper goes to and fro and polishes a glass, the dealer shuffles
      const [bx, , bw] = STATION.bar.box;
      keeper.g.position.x = live.bartender[0] + Math.sin(t * 0.3) * live.bartender[3];
      keeper.arms[0].rotation.set(-0.2 + Math.sin(t * 7) * 0.12, 0.5, 0); keeper.arms[1].rotation.set(-0.25, -0.45, 0);
      const want = look ? Math.atan2(look[0] - keeper.g.position.x, look[1] - keeper.z) : Math.sin(t * 0.5) * 0.4;
      keeper.head.rotation.y += (Math.max(-1.1, Math.min(1.1, want)) - keeper.head.rotation.y) * Math.min(1, dt * 4);
      keeper.g.position.y = Math.abs(Math.sin(t * 2.2)) * 0.02;
      dealer.arms[0].rotation.set(-0.3, 0.4 + Math.sin(t * 3) * 0.1, 0); dealer.arms[1].rotation.set(-0.3 + Math.sin(t * 6) * 0.06, -0.4, 0); dealer.head.rotation.y = Math.sin(t * 0.6) * 0.5;
      for (const r of [keeper, dealer]) r.tip.visible = Math.sin(t * 4 + r.x) > 0;
      // lights in turn
      const k = Math.floor(t * 2.5) % 2; bulbs[0].material.color.setScalar(k ? 1 : 0.22); bulbs[1].material.color.setScalar(k ? 0.22 : 1);
      // the reels
      for (const r of Object.values(reels)) { const on = t < r.until; if (on) paintReels(r, t, true); else if (r.was) paintReels(r, t, false); r.was = on; }
      // the arcade's screen now and then, the piano while it plays
      if ((arcT += dt) > 0.12) { arcT = 0; paintArcade(t); }
      if (music) {
        rollS.tex.offset.y = (t * 0.25) % 1;
        if ((keyT += dt) > 0.13) { keyT = 0; for (const m of down) { m.visible = Math.random() < 0.7; m.position.set(live.keys[0] - KW / 2 + (Math.floor(Math.random() * NK) + 0.5) * KW / NK, live.keys[1] + 0.006, live.keys[2]); } }
      }
      // chairs are pulled out for whoever comes to sit, and pushed in again afterwards
      for (const c of chairs) if (c.pull !== c.want) { c.pull += (c.want - c.pull) * Math.min(1, dt * 7); if (Math.abs(c.want - c.pull) < 0.004) c.pull = c.want; placeChair(c); }
      outside.tick(dt, t);
      // the door to the cabins swings in and falls shut again (it never opens outwards)
      { const d = westLeaf; d.v += (-d.a * 14 - d.v * 3.2) * dt; d.a = Math.max(0, d.a + d.v * dt); if (d.a === 0 && d.v < 0) d.v = 0; d.m.rotation.y = d.a; }
      // the doors swing back by themselves (or out to where they are held)
      for (const d of doors) { d.v += ((-d.s * hold - d.a) * 30 - d.v * (hold ? 7 : 2.2)) * dt; d.a += d.v * dt; d.m.rotation.y = d.a; }
    },
    dispose() { outside.dispose(); for (const t of shell.userData.pics || []) t.dispose(); for (const m of chairSets) { m.geometry.dispose(); m.dispose(); } for (const m of meshes) { m.geometry.dispose(); if (m.material.map && m.material.map !== planks) m.material.map.dispose(); m.material.dispose(); } for (const t of [planks, carpet, paper, paper2, boards, sheet]) t.dispose(); },
  };
}
