// How the clubhouse looks: wall, floor and every piece of furniture, drawn with shapes (no pictures).
// The room is seen obliquely from the front: x runs left to right, depth (y) runs down the screen at KY of its
// length, height (z) runs straight up. All drawing here is in room units; the caller scales the canvas.
import { ROOM, STATIONS, STATION, CASINO_X } from '../shared/room.js';
import { INK, mix, darker, lighter, drawGlass } from './avatar.js';

export const KY = 0.7, WALL = 3.4, FRONT = 0.4;
export const VIEW_H = WALL + ROOM.d * KY + FRONT;        // the height of the whole picture, in units
export const V = (y, z = 0) => WALL + y * KY - z;        // where a point of the room lands vertically
const LW = 0.045, TAU = Math.PI * 2;
const FONT = 'Fredoka, system-ui, sans-serif';

const paint = (c, col, lw = LW) => { c.fillStyle = col; c.fill(); if (lw) { c.lineWidth = lw; c.strokeStyle = INK; c.stroke(); } };
const rrect = (c, x, y, w, h, r = 0.06) => { c.beginPath(); c.roundRect(x, y, w, h, r); };
const ell = (c, x, y, rx, ry) => { c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, TAU); };
const poly = (c, pts) => { c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.closePath(); };
const line = (c, x0, y0, x1, y1, col, lw = LW) => { c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.lineWidth = lw; c.strokeStyle = col; c.stroke(); };
// Text in room units. It is set at 100 px and scaled down, because browsers do not agree on fonts smaller than a pixel.
function text(c, s, x, y, size, col, weight = 600, stroke = '') {
  c.save(); c.translate(x, y); c.scale(size / 100, size / 100);
  c.font = weight + ' 100px ' + FONT; c.textAlign = 'center'; c.textBaseline = 'middle';
  if (stroke) { c.lineWidth = 7; c.strokeStyle = stroke; c.strokeText(s, 0, 0); }
  c.fillStyle = col; c.fillText(s, 0, 0);
  c.restore();
}
function textWidth(c, s, size, weight = 600) { c.font = weight + ' 100px ' + FONT; return c.measureText(s).width * size / 100; }
// a box standing on the floor: its front face and its top
function box(c, x, y, w, d, h, top, front, r = 0.07) {
  rrect(c, x, V(y + d, h), w, h, r); paint(c, front);
  rrect(c, x, V(y, h), w, d * KY, r); paint(c, top);
}
const rnd = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

// ---------- wall and floor (drawn once, then kept as a picture) ----------
export function paintBackground(c, groupName) {
  const W = ROOM.w, D = ROOM.d;
  // wall
  const g = c.createLinearGradient(0, 0, 0, WALL); g.addColorStop(0, '#41607c'); g.addColorStop(1, '#365069');
  c.fillStyle = g; c.fillRect(0, 0, W, WALL);
  c.fillStyle = 'rgba(255,255,255,.035)'; for (let x = 0; x < W; x += 0.8) c.fillRect(x, 0, 0.4, WALL);
  // panelling along the bottom of the wall
  c.fillStyle = '#7d5238'; c.fillRect(0, WALL - 1.05, W, 1.05);
  c.fillStyle = 'rgba(0,0,0,.14)'; for (let x = 0.3; x < W; x += 0.6) c.fillRect(x, WALL - 0.95, 0.035, 0.85);
  c.fillStyle = '#93664a'; c.fillRect(0, WALL - 1.12, W, 0.13);
  c.fillStyle = '#5e3b28'; c.fillRect(0, WALL - 0.13, W, 0.13);
  c.fillStyle = '#2b3d54'; c.fillRect(0, 0, W, 0.2);
  // the casino wing has a wallpaper of its own, behind a gilded post
  { const x0 = CASINO_X, w = W - x0, top = 0.2, bot = WALL - 1.12;
    c.fillStyle = '#5c2140'; c.fillRect(x0, top, w, bot - top);
    c.save(); c.beginPath(); c.rect(x0, top, w, bot - top); c.clip();
    c.strokeStyle = 'rgba(255,214,120,.14)'; c.lineWidth = 0.028; c.beginPath();
    for (let k = -6; k < w + 6; k += 0.55) { c.moveTo(x0 + k, top); c.lineTo(x0 + k + (bot - top), bot); c.moveTo(x0 + k + (bot - top), top); c.lineTo(x0 + k, bot); }
    c.stroke(); c.restore();
    rrect(c, x0 - 0.13, 0.2, 0.26, WALL - 0.2, 0.04); paint(c, '#c9983f', 0.035);
    for (const y of [0.2, WALL - 0.26]) { rrect(c, x0 - 0.2, y, 0.4, 0.26, 0.04); paint(c, '#e2b655', 0.035); }
  }
  // floor boards
  for (let r = 0; r * 0.5 < D; r++) {
    const y0 = V(r * 0.5), h = 0.5 * KY;
    c.fillStyle = r % 2 ? '#c38d58' : '#cb9660'; c.fillRect(0, y0, W, h);
    for (let x = -(rnd(r) * 3); x < W;) {
      const len = 2.2 + rnd(r * 13 + x) * 2.4;
      c.fillStyle = 'rgba(120,70,30,' + (0.05 + rnd(x * 7 + r) * 0.1) + ')'; c.fillRect(x, y0, len, h);
      c.fillStyle = 'rgba(70,40,20,.35)'; c.fillRect(x + len - 0.02, y0, 0.04, h);
      x += len;
    }
    c.fillStyle = 'rgba(70,40,20,.28)'; c.fillRect(0, y0 + h - 0.025, W, 0.035);
  }
  const sh = c.createLinearGradient(0, WALL, 0, WALL + 0.8); sh.addColorStop(0, 'rgba(30,15,30,.38)'); sh.addColorStop(1, 'rgba(30,15,30,0)');
  c.fillStyle = sh; c.fillRect(0, WALL, W, 0.8);
  c.fillStyle = '#5a3a28'; c.fillRect(0, V(D), W, FRONT); c.fillStyle = '#3d2618'; c.fillRect(0, V(D) + 0.12, W, FRONT);

  // the carpet of the casino wing
  { const x0 = CASINO_X + 0.35, w = W - CASINO_X - 0.7, y0 = V(0.6), h = (D - 1.05) * KY;
    rrect(c, x0, y0, w, h, 0.3); paint(c, '#7a2440');
    rrect(c, x0 + 0.24, y0 + 0.2, w - 0.48, h - 0.4, 0.2); c.lineWidth = 0.07; c.strokeStyle = '#e2b655'; c.stroke();
    c.fillStyle = 'rgba(226,182,85,.3)';
    for (let j = 0; j < 9; j++) for (let i = 0; i < 9; i++) { const x = x0 + 0.85 + i * 0.75 + (j % 2) * 0.375, y = y0 + 0.62 + j * 0.86; if (x > x0 + w - 0.7 || y > y0 + h - 0.5) continue; poly(c, [[x, y - 0.09], [x + 0.13, y], [x, y + 0.09], [x - 0.13, y]]); c.fill(); }
  }
  // rugs
  rrect(c, 2.7, V(4.3), 5.2, 4.0 * KY, 0.25); paint(c, '#b8433c');
  rrect(c, 2.95, V(4.3) + 0.2, 4.7, 4.0 * KY - 0.4, 0.15); c.lineWidth = 0.07; c.strokeStyle = '#f0c987'; c.stroke();
  rrect(c, 3.15, V(4.3) + 0.36, 4.3, 4.0 * KY - 0.72, 0.1); c.lineWidth = 0.03; c.strokeStyle = 'rgba(240,201,135,.6)'; c.stroke();
  ell(c, 20.5, V(12.1), 2.9, 0.95); paint(c, '#2f8f86'); ell(c, 20.5, V(12.1), 2.5, 0.75); c.lineWidth = 0.06; c.strokeStyle = '#bfe6d8'; c.stroke();
  ell(c, 17.9, V(6.4), 3.2, 2.1 * KY + 0.25); c.fillStyle = 'rgba(60,30,60,.16)'; c.fill();
  // the dance floor's frame (its tiles are drawn live)
  const [dx, dy, dr] = STATION.dance.floor;
  rrect(c, dx - dr - 0.12, V(dy - dr) - 0.08, dr * 2 + 0.24, dr * 2 * KY + 0.16, 0.12); paint(c, '#2a2238');

  // shadows under the furniture
  c.fillStyle = 'rgba(40,20,40,.2)';
  for (const s of STATIONS) {
    if (s.box) { const [x, y, w, d] = s.box; rrect(c, x - 0.12, V(y) + 0.1, w + 0.24, d * KY + 0.16, 0.2); c.fill(); }
    else if (s.round) { const [cx, cy, rx, ry] = s.round; ell(c, cx, V(cy) + 0.1, rx * 0.95, ry * KY * 0.95); c.fill(); }
    for (const q of s.on ? [] : s.seats || []) { ell(c, q[0], V(q[1]) + 0.04, 0.36, 0.2); c.fill(); }
  }

  // string of lights along the top of the wall
  c.beginPath();
  for (let x = 0; x <= W; x += 0.1) { const y = 0.32 + Math.abs(Math.sin(x / 2.4 * Math.PI)) * -0.14 + 0.14; x ? c.lineTo(x, y) : c.moveTo(x, y); }
  c.lineWidth = 0.03; c.strokeStyle = '#1f2a3a'; c.stroke();
  const cols = ['#ffd45e', '#ff7e6b', '#7fe0c3', '#ffb347', '#ff8fc7', '#8fc9ff'];
  for (let i = 0, x = 0.3; x < W; x += 0.6, i++) {
    const y = 0.32 + Math.abs(Math.sin(x / 2.4 * Math.PI)) * -0.14 + 0.14 + 0.09;
    c.save(); c.shadowColor = cols[i % cols.length]; c.shadowBlur = 14; ell(c, x, y, 0.07, 0.09); c.fillStyle = cols[i % cols.length]; c.fill(); c.restore();
  }

  // behind the kiosk: shelves with hat boxes
  { const [x, , w] = STATION.kiosk.box;
    for (const z of [1.75, 2.4]) { c.fillStyle = '#5e3b28'; c.fillRect(x + 0.2, V(0, z), w - 0.4, 0.07); }
    const things = [[0.45, 1.75, '#e2574c', 0.42, 0.3], [1.0, 1.75, '#f2c33f', 0.36, 0.38], [1.55, 1.75, '#3d8fe0', 0.44, 0.26], [2.15, 1.75, '#8a58d6', 0.36, 0.34], [2.65, 1.75, '#58b85f', 0.3, 0.28]];
    for (const [ox, z, col, bw, bh] of things) { rrect(c, x + ox, V(0, z + bh), bw, bh, 0.04); paint(c, col, 0.035); c.fillStyle = 'rgba(255,255,255,.5)'; c.fillRect(x + ox, V(0, z + bh * 0.62), bw, 0.05); }
  }
  // behind the bar: bottles on two shelves and a neon sign
  { const [x, , w] = STATION.bar.box;
    rrect(c, x + 0.25, V(0, 2.62), w - 0.5, 1.22, 0.06); paint(c, '#2c1a14', 0.04);
    for (const z of [1.5, 2.05]) { c.fillStyle = '#7d5238'; c.fillRect(x + 0.25, V(0, z), w - 0.5, 0.07); }
    const bc = ['#3f8a4a', '#b9641f', '#e8f1fa', '#8e1f3a', '#3d8fe0', '#f2c33f', '#6b4423', '#d8343c', '#58b85f', '#a8703c'];
    for (let i = 0; i < 17; i++) for (const [z, off] of [[1.57, 0], [2.12, 0.14]]) {
      const bx = x + 0.5 + i * 0.275 + off, col = bc[Math.floor(rnd(i * 3.1 + z) * bc.length)], tall = 0.3 + rnd(i + z * 5) * 0.14;
      if (bx > x + w - 0.5) continue;
      rrect(c, bx - 0.065, V(0, z + tall), 0.13, tall, 0.03); paint(c, col, 0.025);
      c.fillStyle = col; c.fillRect(bx - 0.028, V(0, z + tall + 0.1), 0.056, 0.11); c.lineWidth = 0.02; c.strokeRect(bx - 0.028, V(0, z + tall + 0.1), 0.056, 0.11);
      c.fillStyle = 'rgba(255,255,255,.75)'; c.fillRect(bx - 0.05, V(0, z + tall * 0.55), 0.1, 0.07);
    }
    c.save(); c.shadowColor = '#ff5fa2'; c.shadowBlur = 22;
    text(c, 'BAR', x + w / 2, V(0, 3.0), 0.5, '#ffd3e6', 700, '#ff7eb6');
    rrect(c, x + w / 2 - 0.85, V(0, 3.3), 1.7, 0.58, 0.2); c.lineWidth = 0.04; c.strokeStyle = '#7fe0ff'; c.shadowColor = '#4fc3e8'; c.stroke();
    c.restore();
  }
  // the notice board
  { const [x, z, w, h] = STATION.board.wall;
    rrect(c, x, V(0, z + h), w, h, 0.07); paint(c, '#8a5a36');
    rrect(c, x + 0.1, V(0, z + h) + 0.1, w - 0.2, h - 0.2, 0.04); paint(c, '#d2a368', 0.03);
    rrect(c, x + 0.22, V(0, z + h) + 0.2, 0.78, 1.0, 0.03); paint(c, '#fbf6ea', 0.025);
    text(c, 'TOP', x + 0.61, V(0, z + h) + 0.36, 0.19, '#b8433c', 700);
    for (let i = 0; i < 4; i++) { c.fillStyle = '#b9b0a0'; c.fillRect(x + 0.32, V(0, z + h) + 0.52 + i * 0.15, 0.58 - i * 0.07, 0.05); }
    rrect(c, x + 1.15, V(0, z + h) + 0.24, 0.8, 0.55, 0.03); paint(c, '#ffe9a8', 0.025);
    c.save(); c.translate(x + 1.55, V(0, z + h) + 0.5); c.fillStyle = '#e0a81e'; c.beginPath(); c.moveTo(-0.14, -0.15); c.lineTo(0.14, -0.15); c.quadraticCurveTo(0.13, 0.08, 0, 0.1); c.quadraticCurveTo(-0.13, 0.08, -0.14, -0.15); c.fill(); c.fillRect(-0.03, 0.08, 0.06, 0.1); c.fillRect(-0.1, 0.16, 0.2, 0.05); c.restore();
    rrect(c, x + 1.2, V(0, z + h) + 0.9, 0.7, 0.4, 0.03); paint(c, '#cfe8ff', 0.025);
    for (const [px, py, col] of [[0.61, 0.24, '#e2403a'], [1.55, 0.28, '#3d8fe0'], [1.55, 0.94, '#58b85f']]) { ell(c, x + px, V(0, z + h) + py, 0.045, 0.045); paint(c, col, 0.02); }
  }
  // the group's name on a banner over the notice board
  if (groupName) {
    const cx = STATION.board.wall[0] + STATION.board.wall[2] / 2, y = V(0, 3.02);
    const tw = textWidth(c, groupName, 0.3, 700), w = Math.min(3.6, Math.max(1.6, tw + 0.5));
    poly(c, [[cx - w / 2, y - 0.2], [cx + w / 2, y - 0.2], [cx + w / 2 + 0.14, y], [cx + w / 2, y + 0.2], [cx - w / 2, y + 0.2], [cx - w / 2 - 0.14, y]]); paint(c, '#f4e6c8', 0.035);
    c.save(); c.translate(cx, y + 0.01); if (tw > w - 0.3) c.scale((w - 0.3) / tw, 1); text(c, groupName, 0, 0, 0.3, '#5a2f3c', 700); c.restore();
  }
  // the door, with its sign
  { const [x, , w, h] = STATION.door.wall;
    rrect(c, x - 0.1, V(0, h), w + 0.2, h, 0.05); paint(c, '#243449');
    rrect(c, x, V(0, h - 0.1), w, h - 0.1, 0.04); paint(c, '#b25a3c', 0.04);
    rrect(c, x + 0.2, V(0, h - 0.35), w - 0.4, 0.8, 0.05); paint(c, '#cfe8ff', 0.035);
    line(c, x + w / 2, V(0, h - 0.35), x + w / 2, V(0, h - 1.15), INK, 0.03); line(c, x + 0.2, V(0, h - 0.75), x + w - 0.2, V(0, h - 0.75), INK, 0.03);
    rrect(c, x + 0.2, V(0, 1.2), w - 0.4, 1.0, 0.05); c.lineWidth = 0.035; c.strokeStyle = 'rgba(43,34,51,.45)'; c.stroke();
    ell(c, x + w - 0.22, V(0, 1.2), 0.075, 0.075); paint(c, '#f5c542', 0.03);
    rrect(c, x + w / 2 - 0.36, V(0, h + 0.42), 0.72, 0.3, 0.05); paint(c, '#2f9e63', 0.035);
    text(c, 'UD', x + w / 2, V(0, h + 0.26), 0.2, '#eafff2', 700);
  }
  // the door to the cabins (in 3D it is in the west end; here it is at the left of the back wall), and the board beside it
  { const [x, , w, h] = STATION.cabin.flat;
    rrect(c, x - 0.1, V(0, h), w + 0.2, h, 0.05); paint(c, '#3a2a1c');
    rrect(c, x, V(0, h - 0.08), w, h - 0.08, 0.04); paint(c, '#9a6a3c', 0.04);
    for (let i = 1; i < 5; i++) line(c, x + i * w / 5, V(0, h - 0.12), x + i * w / 5, V(0, 0.05), 'rgba(43,26,14,.5)', 0.025);
    for (const y of [0.5, h - 0.5]) { rrect(c, x + 0.06, V(0, y + 0.05), w - 0.12, 0.1, 0.02); paint(c, '#2b2233', 0.02); }
    ell(c, x + w - 0.2, V(0, 1.15), 0.07, 0.07); paint(c, '#2b2233', 0.03);
    rrect(c, x + w / 2 - 0.62, V(0, h + 0.44), 1.24, 0.32, 0.05); paint(c, '#c88a4a', 0.035);
    text(c, 'HYTTERNE', x + w / 2, V(0, h + 0.27), 0.19, '#3a2410', 700);
    const [bx, bz, bw, bh] = STATION.cabins.flat;
    rrect(c, bx - 0.06, V(0, bz + bh + 0.06), bw + 0.12, bh + 0.12, 0.05); paint(c, '#2b1a0e');
    rrect(c, bx, V(0, bz + bh), bw, bh, 0.03); paint(c, '#4a2e18', 0.03);
  }
  // the casino: a neon sign over the machines, the plate that shows the jackpot, and the board (their numbers are drawn live)
  { const a = STATION.slot1.box, b = STATION.slot3.box, cx = (a[0] + b[0] + b[2]) / 2;
    c.save(); c.shadowColor = '#ffb347'; c.shadowBlur = 22;
    text(c, 'KASINO', cx, V(0, 3.0), 0.5, '#fff1c4', 700, '#ff9d3d');
    rrect(c, cx - 1.35, V(0, 3.3), 2.7, 0.58, 0.2); c.lineWidth = 0.04; c.strokeStyle = '#ff7eb6'; c.shadowColor = '#ff5fa2'; c.stroke();
    c.restore();
    const [x, z, w, h] = STATION.casino.wall;
    rrect(c, x - 0.09, V(0, z + h) - 0.09, w + 0.18, h + 0.18, 0.09); paint(c, '#c9983f');
    rrect(c, x, V(0, z + h), w, h, 0.05); paint(c, '#1b1426', 0.035);
  }
  // a clock face over the music box (the hands are drawn live) and a poster by the door
  { const [x, , w] = STATION.jukebox.box; ell(c, x + w / 2, V(0, 2.62), 0.36, 0.36); paint(c, '#fbf6ea'); ell(c, x + w / 2, V(0, 2.62), 0.3, 0.3); c.lineWidth = 0.02; c.strokeStyle = '#b9b0a0'; c.stroke();
    for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; line(c, x + w / 2 + Math.cos(a) * 0.25, V(0, 2.62) + Math.sin(a) * 0.25, x + w / 2 + Math.cos(a) * 0.29, V(0, 2.62) + Math.sin(a) * 0.29, INK, i % 3 ? 0.015 : 0.03); } }
  { const x = 23.05, y = V(0, 2.75);
    rrect(c, x, y, 0.8, 1.1, 0.03); paint(c, '#ffe9a8', 0.035);
    c.save(); c.translate(x + 0.4, y + 0.48);
    for (const [ox, oy, col, r] of [[-0.14, -0.1, '#e2574c', 0.17], [0.12, 0.06, '#3d8fe0', 0.2], [-0.06, 0.2, '#58b85f', 0.13]]) { rrect(c, ox - r, oy - r, r * 2, r * 2, 0.04); paint(c, col, 0.025); c.fillStyle = '#fff'; for (const [px, py] of [[-0.4, -0.4], [0.4, 0.4], [0, 0]]) { ell(c, ox + px * r, oy + py * r, r * 0.16, r * 0.16); c.fill(); } }
    c.restore();
    text(c, 'SPIL', x + 0.4, y + 0.95, 0.17, '#5a2f3c', 700);
  }
}

// ---------- furniture (each piece is drawn once and kept as a picture) ----------
// How far a piece reaches above its footprint, so its picture is big enough: [height, extra at the sides].
const REACH = { wardrobe: [3.3, 0.2], kiosk: [3.1, 0.35], bar: [1.9, 0.2], arcade: [2.9, 0.15], jukebox: [2.3, 0.15], games: [2.0, 0.2], dice: [1.5, 0.2], cards: [1.4, 0.2],
  command: [1.7, 0.2], sofa: [1.7, 0.2], plant1: [2.3, 0.6], plant2: [2.3, 0.6], plant3: [2.3, 0.6], lamp: [3.4, 1.1],
  slot1: [2.8, 0.34], slot2: [2.8, 0.34], slot3: [2.8, 0.34], blackjack: [1.5, 0.2] };

// The part of the picture a piece of furniture covers: [left, top, right, bottom] in room units.
export function boundsOf(s) {
  if (s.wall) { const [x, z, w, h] = s.wall; return [x - 0.1, V(0, z + h) - 0.1, x + w + 0.1, V(0, z) + 0.05]; }
  if (s.floor) { const [cx, cy, r] = s.floor; return [cx - r - 0.15, V(cy - r) - 0.1, cx + r + 0.15, V(cy + r) + 0.1]; }
  const [h, side] = REACH[s.id] || [s.h + 0.3, 0.2];
  if (s.box) { const [x, y, w, d] = s.box; return [x - side, V(y, h), x + w + side, V(y + d) + 0.18]; }
  const [cx, cy, rx, ry] = s.round; return [cx - rx - side, V(cy - ry, h), cx + rx + side, V(cy + ry) + 0.18];
}

function table(c, x, y, w, d, h, top, edge) {
  for (const [lx, ly] of [[x + 0.12, y + 0.12], [x + w - 0.24, y + 0.12], [x + 0.12, y + d - 0.14], [x + w - 0.24, y + d - 0.14]]) { rrect(c, lx, V(ly, h - 0.1), 0.12, h - 0.1, 0.03); paint(c, edge, 0.035); }
  rrect(c, x, V(y + d, h), w, 0.16, 0.05); paint(c, edge);
  rrect(c, x, V(y, h), w, d * KY, 0.08); paint(c, top);
  rrect(c, x + 0.1, V(y, h) + 0.08, w - 0.2, d * KY - 0.16, 0.05); c.lineWidth = 0.025; c.strokeStyle = 'rgba(255,255,255,.22)'; c.stroke();
}
function roundTable(c, cx, cy, rx, ry, h, top, edge) {
  ell(c, cx, V(cy), rx * 0.42, ry * KY * 0.42); paint(c, edge);
  rrect(c, cx - 0.13, V(cy, h - 0.1), 0.26, h - 0.1, 0.05); paint(c, edge);
  ell(c, cx, V(cy, h - 0.14), rx, ry * KY); paint(c, edge);
  ell(c, cx, V(cy, h), rx, ry * KY); paint(c, top);
}

const PIECES = {
  wardrobe(c, s) {
    const [x, y, w, d] = s.box, h = s.h, f = V(y + d, h);
    box(c, x, y, w, d, h, '#5fb0a8', '#3f8f8a');
    rrect(c, x + 0.1, f + 0.12, w / 2 - 0.14, h - 0.42, 0.05); paint(c, '#36807b', 0.035);
    const m = c.createLinearGradient(x, f, x + w / 2, f + h); m.addColorStop(0, '#e9f7ff'); m.addColorStop(0.5, '#b9dcf2'); m.addColorStop(1, '#dff1fb');
    rrect(c, x + 0.2, f + 0.22, w / 2 - 0.34, h - 0.62, 0.2); paint(c, m, 0.035);
    line(c, x + 0.36, f + 0.5, x + 0.6, f + 0.3, 'rgba(255,255,255,.9)', 0.05); line(c, x + 0.36, f + 0.75, x + 0.75, f + 0.42, 'rgba(255,255,255,.7)', 0.03);
    rrect(c, x + w / 2 + 0.04, f + 0.12, w / 2 - 0.14, h - 0.42, 0.05); paint(c, '#36807b', 0.035);
    // a coat hanger on the door
    c.save(); c.translate(x + w * 0.75, f + 0.75);
    c.beginPath(); c.moveTo(-0.3, 0.14); c.lineTo(0, -0.08); c.lineTo(0.3, 0.14); c.closePath(); c.lineWidth = 0.045; c.strokeStyle = '#f4e6c8'; c.stroke();
    c.beginPath(); c.arc(0, -0.15, 0.07, 0.5 * Math.PI, 1.9 * Math.PI); c.stroke(); c.restore();
    for (const kx of [w / 2 - 0.13, w / 2 + 0.13]) { ell(c, x + kx, f + h * 0.5, 0.05, 0.05); paint(c, '#f5c542', 0.025); }
    rrect(c, x + 0.05, f + h - 0.24, w - 0.1, 0.18, 0.04); paint(c, '#36807b', 0.035);
    // a hat box and a hat on top
    rrect(c, x + 0.3, V(y + 0.3, h + 0.34), 0.8, 0.34, 0.05); paint(c, '#f4e6c8', 0.035); c.fillStyle = '#d8443c'; c.fillRect(x + 0.3, V(y + 0.3, h + 0.2), 0.8, 0.07);
    ell(c, x + 1.6, V(y + 0.3, h + 0.04), 0.4, 0.1); paint(c, '#2b2a36', 0.035); rrect(c, x + 1.37, V(y + 0.3, h + 0.36), 0.46, 0.33, 0.1); paint(c, '#2b2a36', 0.035);
  },

  kiosk(c, s) {
    const [x, y, w, d] = s.box, h = s.h, f = V(y + d, h);
    for (const px of [x + 0.08, x + w - 0.16]) { rrect(c, px, V(y + 0.15, 2.5), 0.08, 2.5 - h + 0.3, 0.02); paint(c, '#f4e6c8', 0.03); }
    box(c, x, y, w, d, h, '#f1d9a8', '#e0683f');
    c.save(); rrect(c, x, f, w, h, 0.07); c.clip(); c.fillStyle = 'rgba(255,255,255,.2)'; for (let i = 0; i < 9; i++) c.fillRect(x + 0.2 + i * 0.4, f, 0.2, h); c.restore();
    rrect(c, x + w / 2 - 0.8, f + 0.3, 1.6, 0.52, 0.12); paint(c, '#3a2433', 0.04);
    text(c, 'TØJBUTIK', x + w / 2, f + 0.57, 0.21, '#ffe9a8', 700);
    // things on the counter: a hat on a stand, sunglasses, a till
    const ty = V(y + 0.55, h);
    line(c, x + 0.55, ty, x + 0.55, ty - 0.3, INK, 0.05); ell(c, x + 0.55, ty, 0.14, 0.05); paint(c, '#8a5a36', 0.03);
    ell(c, x + 0.55, ty - 0.3, 0.3, 0.08); paint(c, '#a8703c', 0.035); rrect(c, x + 0.38, ty - 0.52, 0.34, 0.24, 0.1); paint(c, '#a8703c', 0.035);
    for (const gx of [1.25, 1.52]) { rrect(c, x + gx - 0.11, ty - 0.1, 0.22, 0.14, 0.05); paint(c, '#22202c', 0.03); }
    line(c, x + 1.36, ty - 0.04, x + 1.41, ty - 0.04, INK, 0.03);
    rrect(c, x + w - 0.95, ty - 0.36, 0.6, 0.38, 0.05); paint(c, '#8c939c', 0.035); rrect(c, x + w - 0.87, ty - 0.52, 0.44, 0.2, 0.03); paint(c, '#cfe8ff', 0.03);
    // awning
    const ay = V(y, 2.5) - 0.42, aw = w + 0.5, ax = x - 0.25;
    c.save(); c.beginPath(); c.moveTo(ax + 0.2, ay); c.lineTo(ax + aw - 0.2, ay); c.lineTo(ax + aw, ay + 0.62); c.lineTo(ax, ay + 0.62); c.closePath(); c.clip();
    for (let i = 0; i < 10; i++) { c.fillStyle = i % 2 ? '#fbf6ea' : '#d8443c'; c.fillRect(ax + i * aw / 10, ay, aw / 10 + 0.01, 0.7); }
    c.restore();
    c.beginPath(); c.moveTo(ax + 0.2, ay); c.lineTo(ax + aw - 0.2, ay); c.lineTo(ax + aw, ay + 0.62); c.lineTo(ax, ay + 0.62); c.closePath(); c.lineWidth = LW; c.strokeStyle = INK; c.stroke();
    for (let i = 0; i < 10; i++) { c.beginPath(); c.arc(ax + (i + 0.5) * aw / 10, ay + 0.62, aw / 20, 0, Math.PI); c.closePath(); paint(c, i % 2 ? '#fbf6ea' : '#d8443c', 0.035); }
  },

  bar(c, s) {
    // a U that opens towards the back wall: a counter down both sides and along the front; the keeper stands inside
    const [x, y, w, d] = s.box, h = s.h, t = s.counter, fy = y + d - t, f = V(y + d, h);
    box(c, x, y + 0.55, t, d - 0.55 - t, h, '#3f2318', '#6a3d27', 0.06); box(c, x + w - t, y + 1.2, t, d - 1.2 - t, h, '#3f2318', '#6a3d27', 0.06);
    box(c, x, fy, w, t, h, '#3f2318', '#6a3d27', 0.06);
    for (let i = 0; i < 6; i++) { rrect(c, x + 0.16 + i * (w - 0.32) / 6 + 0.05, f + 0.26, (w - 0.32) / 6 - 0.1, h - 0.62, 0.05); paint(c, '#59311f', 0.03); }
    rrect(c, x - 0.06, f - 0.03, w + 0.12, 0.17, 0.06); paint(c, '#4a2a1c');
    line(c, x + 0.3, V(fy, h) + 0.12, x + w - 0.9, V(fy, h) + 0.12, 'rgba(255,255,255,.2)', 0.06);
    // foot rail
    line(c, x + 0.1, f + h - 0.2, x + w - 0.1, f + h - 0.2, INK, 0.1); line(c, x + 0.1, f + h - 0.2, x + w - 0.1, f + h - 0.2, '#e0b04a', 0.055);
    for (let i = 0; i <= 5; i++) line(c, x + 0.25 + i * (w - 0.5) / 5, f + h - 0.2, x + 0.25 + i * (w - 0.5) / 5, f + h - 0.05, '#b88a30', 0.05);
    // the taps: a brass column with four handles
    const tx = x + w / 2 - 1.1, ty = V(fy + 0.3, h);
    rrect(c, tx - 0.09, ty - 0.62, 0.18, 0.62, 0.04); paint(c, '#d9b04a', 0.035); rrect(c, tx - 0.46, ty - 0.7, 0.92, 0.15, 0.06); paint(c, '#e6c460', 0.035);
    [['#b8433c', -0.33], ['#2a2a2e', -0.11], ['#e9e2cf', 0.11], ['#2f7d4f', 0.33]].forEach(([col, o]) => { rrect(c, tx + o - 0.045, ty - 0.98, 0.09, 0.3, 0.03); paint(c, col, 0.03); line(c, tx + o, ty - 0.55, tx + o, ty - 0.44, INK, 0.05); });
    rrect(c, tx - 0.5, ty - 0.04, 1.0, 0.07, 0.02); paint(c, '#8c939c', 0.03);
    // glasses standing on the counter
    for (const [gx, k] of [[w / 2 - 0.2, 'fadol'], [w / 2 + 0.1, 'fadol'], [w - 1.25, 'filur'], [w - 0.95, 'kirsebar']]) { c.save(); c.translate(x + gx, V(fy + 0.4, h)); c.scale(0.021, 0.021); drawGlass(c, k, k === 'fadol' ? 1 : 0.8); c.restore(); }
    // a bowl of peanuts
    ell(c, x + w / 2 + 1.0, V(fy + 0.35, h) - 0.03, 0.2, 0.08); paint(c, '#f4e6c8', 0.03); ell(c, x + w / 2 + 1.0, V(fy + 0.35, h) - 0.06, 0.15, 0.05); c.fillStyle = '#c99a5e'; c.fill();
  },

  arcade(c, s) {
    const [x, y, w, d] = s.box, h = s.h, f = V(y + d, h);
    box(c, x, y, w, d, h, '#6a5fd0', '#4b3fa8');
    rrect(c, x + 0.1, f + 0.08, w - 0.2, 0.42, 0.06); paint(c, '#ffd45e', 0.035);
    text(c, 'ARKADE', x + w / 2, f + 0.3, 0.24, '#5a2f3c', 700);
    rrect(c, x + 0.14, f + 0.6, w - 0.28, 0.78, 0.07); paint(c, '#141021', 0.04);
    poly(c, [[x + 0.04, f + 1.52], [x + w - 0.04, f + 1.52], [x + w + 0.07, f + 1.82], [x - 0.07, f + 1.82]]); paint(c, '#362c80');
    line(c, x + 0.4, f + 1.66, x + 0.4, f + 1.5, INK, 0.07); ell(c, x + 0.4, f + 1.47, 0.09, 0.09); paint(c, '#e2403a', 0.03);
    for (const [bx, col] of [[0.8, '#f2c33f'], [1.02, '#58b85f']]) { ell(c, x + bx, f + 1.66, 0.075, 0.05); paint(c, col, 0.03); }
    rrect(c, x + w / 2 - 0.22, f + 2.0, 0.44, 0.36, 0.04); paint(c, '#362c80', 0.035); c.fillStyle = '#f2c33f'; c.fillRect(x + w / 2 - 0.03, f + 2.1, 0.06, 0.14);
    line(c, x + 0.06, f + 0.6, x + 0.06, f + 1.5, '#ff7eb6', 0.04); line(c, x + w - 0.06, f + 0.6, x + w - 0.06, f + 1.5, '#7fe0ff', 0.04);
  },

  jukebox(c, s) {
    const [x, y, w, d] = s.box, h = s.h, f = V(y + d, h), cx = x + w / 2;
    rrect(c, x, V(y, h - 0.5), w, d * KY + 0.2, 0.3); paint(c, '#a85a38');
    c.beginPath(); c.moveTo(x, f + h); c.lineTo(x, f + 0.55); c.arc(cx, f + 0.55, w / 2, Math.PI, 0); c.lineTo(x + w, f + h); c.closePath(); paint(c, '#8a4a2e');
    c.beginPath(); c.arc(cx, f + 0.57, w / 2 - 0.2, Math.PI, 0); c.lineTo(cx + w / 2 - 0.2, f + 0.95); c.lineTo(cx - w / 2 + 0.2, f + 0.95); c.closePath(); paint(c, '#1d1730', 0.035);
    ell(c, cx, f + 0.72, 0.2, 0.2); paint(c, '#2b2a36', 0.03); ell(c, cx, f + 0.72, 0.07, 0.07); paint(c, '#e2403a', 0.02);
    rrect(c, x + 0.15, f + 1.08, w - 0.3, 0.66, 0.08); paint(c, '#3a2433', 0.035);
    c.strokeStyle = 'rgba(255,233,168,.55)'; c.lineWidth = 0.02; for (let i = 1; i < 7; i++) { c.beginPath(); c.moveTo(x + 0.15 + i * (w - 0.3) / 7, f + 1.12); c.lineTo(x + 0.15 + i * (w - 0.3) / 7, f + 1.7); c.stroke(); }
  },

  games(c, s) {
    const [x, y, w, d] = s.box, h = s.h;
    table(c, x, y, w, d, h, '#c08a52', '#8a5a36');
    // the 4-in-a-row rack, standing on the table
    const bx = x + w / 2 - 0.62, by = V(y + d * 0.45, h);
    for (const fx of [bx - 0.05, bx + 1.2]) { rrect(c, fx, by - 0.06, 0.1, 0.1, 0.02); paint(c, '#2f5fc0', 0.03); }
    rrect(c, bx, by - 0.86, 1.24, 0.84, 0.06); paint(c, '#3d7fe0');
    const disc = ['', '#e2403a', '#f2c33f'], grid = ['0000000', '0000000', '0001000', '0012000', '0121200', '1212100'];
    for (let r = 0; r < 6; r++) for (let k = 0; k < 7; k++) { const v = +grid[r][k]; ell(c, bx + 0.11 + k * 0.17, by - 0.76 + r * 0.132, 0.058, 0.052); paint(c, v ? disc[v] : '#1f3f86', 0.018); }
    // a ludo board lying flat
    const lx = x + 0.2, ly = V(y + d * 0.72, h);
    rrect(c, lx, ly - 0.28, 0.62, 0.42, 0.04); paint(c, '#fbf6ea', 0.03);
    for (const [ox, oy, col] of [[0.04, -0.25, '#e2403a'], [0.4, -0.25, '#3d8fe0'], [0.04, -0.04, '#58b85f'], [0.4, -0.04, '#f2c33f']]) { c.fillStyle = col; c.fillRect(lx + ox, ly + oy, 0.18, 0.14); }
    // two dice
    for (const [dx2, dy2] of [[w - 0.55, 0.3], [w - 0.32, 0.42]]) { rrect(c, x + dx2, by + dy2 - 0.3, 0.15, 0.14, 0.03); paint(c, '#fbf6ea', 0.025); ell(c, x + dx2 + 0.075, by + dy2 - 0.23, 0.02, 0.02); c.fillStyle = INK; c.fill(); }
  },

  dice(c, s) {
    const [cx, cy, rx, ry] = s.round, h = s.h, ty = V(cy, h);
    roundTable(c, cx, cy, rx, ry, h, '#b07a48', '#7d5238');
    ell(c, cx, ty, rx * 0.74, ry * KY * 0.74); paint(c, '#2f7d6a', 0.035);
    // the dice cup, tipped over, and the dice
    c.save(); c.translate(cx - 0.35, ty - 0.05); c.rotate(-0.5);
    c.beginPath(); c.moveTo(-0.17, 0.2); c.lineTo(-0.13, -0.2); c.lineTo(0.13, -0.2); c.lineTo(0.17, 0.2); c.closePath(); paint(c, '#6b3f28', 0.035); ell(c, 0, 0.2, 0.17, 0.06); paint(c, '#3d2218', 0.03); c.restore();
    for (const [ox, oy, n] of [[0.1, 0.06, 5], [0.42, -0.1, 2], [0.36, 0.2, 6]]) {
      rrect(c, cx + ox - 0.1, ty + oy - 0.09, 0.2, 0.17, 0.035); paint(c, '#fbf6ea', 0.03);
      c.fillStyle = INK;
      const pips = { 2: [[-1, -1], [1, 1]], 5: [[-1, -1], [1, 1], [0, 0], [-1, 1], [1, -1]], 6: [[-1, -1], [1, 1], [-1, 0], [1, 0], [-1, 1], [1, -1]] }[n];
      for (const [px, py] of pips) { ell(c, cx + ox + px * 0.055, ty + oy - 0.005 + py * 0.045, 0.018, 0.016); c.fill(); }
    }
  },

  cards(c, s) {
    const [cx, cy, rx, ry] = s.round, h = s.h, ty = V(cy, h);
    roundTable(c, cx, cy, rx, ry, h, '#6b3f28', '#4a2a1c');
    ell(c, cx, ty, rx - 0.17, ry * KY - 0.12); paint(c, '#2f8a55', 0.035);
    ell(c, cx, ty, rx - 0.45, ry * KY - 0.3); c.lineWidth = 0.02; c.strokeStyle = 'rgba(255,255,255,.25)'; c.stroke();
    // cards face down, three in the middle, and chips
    for (const [ox, oy, rot] of [[-0.42, 0, -0.08], [-0.14, 0, 0], [0.14, 0, 0.06]]) { c.save(); c.translate(cx + ox, ty + oy); c.rotate(rot); rrect(c, -0.12, -0.13, 0.24, 0.26, 0.03); paint(c, '#fbf6ea', 0.025); rrect(c, -0.08, -0.09, 0.16, 0.18, 0.02); c.fillStyle = '#b8433c'; c.fill(); c.restore(); }
    for (const [ox, oy, col, n] of [[0.62, -0.08, '#e2403a', 4], [0.86, 0.02, '#3d8fe0', 3], [0.7, 0.16, '#f2c33f', 2], [-1.1, 0.1, '#58b85f', 3], [-0.9, -0.16, '#2b2a36', 2]]) {
      for (let k = 0; k < n; k++) { ell(c, cx + ox, ty + oy - k * 0.045, 0.1, 0.055); paint(c, col, 0.022); }
      ell(c, cx + ox, ty + oy - (n - 1) * 0.045, 0.055, 0.03); c.lineWidth = 0.015; c.strokeStyle = 'rgba(255,255,255,.7)'; c.stroke();
    }
  },

  command(c, s) {
    const [x, y, w, d] = s.box, h = s.h, ty = V(y, h);
    table(c, x, y, w, d, h, '#6f7d58', '#4c5a3c');
    rrect(c, x + 0.2, ty + 0.12, w - 0.4, d * KY - 0.24, 0.05); paint(c, '#5fa9d6', 0.03);
    c.save(); rrect(c, x + 0.2, ty + 0.12, w - 0.4, d * KY - 0.24, 0.05); c.clip();
    c.fillStyle = '#86b860';
    c.beginPath(); c.moveTo(x + 0.2, ty + 0.3); c.bezierCurveTo(x + 0.9, ty + 0.2, x + 1.0, ty + 0.7, x + 0.6, ty + 0.85); c.bezierCurveTo(x + 0.4, ty + 1.0, x + 0.3, ty + 0.9, x + 0.2, ty + 1.0); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(x + 1.5, ty + 0.1); c.bezierCurveTo(x + 1.3, ty + 0.5, x + 1.9, ty + 0.6, x + 2.1, ty + 0.9); c.bezierCurveTo(x + 2.4, ty + 1.1, x + 2.8, ty + 0.9, x + 2.8, ty + 0.1); c.closePath(); c.fill();
    c.strokeStyle = 'rgba(255,255,255,.3)'; c.lineWidth = 0.012; for (let i = 1; i < 6; i++) { c.beginPath(); c.moveTo(x + i * 0.5, ty); c.lineTo(x + i * 0.5, ty + 1.2); c.stroke(); } for (let i = 1; i < 4; i++) { c.beginPath(); c.moveTo(x, ty + i * 0.28); c.lineTo(x + w, ty + i * 0.28); c.stroke(); }
    c.restore();
    for (const [fx, fy, col] of [[0.7, 0.55, '#e2403a'], [2.1, 0.5, '#3d6fd6'], [1.75, 0.82, '#3d6fd6'], [0.5, 0.86, '#e2403a']]) {
      line(c, x + fx, ty + fy, x + fx, ty + fy - 0.3, INK, 0.03); poly(c, [[x + fx, ty + fy - 0.3], [x + fx + 0.2, ty + fy - 0.23], [x + fx, ty + fy - 0.16]]); paint(c, col, 0.022);
    }
  },

  sofa(c, s) {
    const [x, y, w, d] = s.box, f = V(y + d);
    rrect(c, x + 0.1, V(y, 1.45), w - 0.2, 1.0, 0.22); paint(c, '#8a3f6a');
    for (const fx of [x + 0.3, x + w - 0.42]) { rrect(c, fx, f - 0.1, 0.12, 0.14, 0.03); paint(c, '#5e3b28', 0.03); }
    rrect(c, x + 0.3, f - 0.62, w - 0.6, 0.56, 0.1); paint(c, '#7a3560');
    rrect(c, x + 0.3, V(y + 0.3, 0.58), w - 0.6, (d - 0.3) * KY + 0.02, 0.12); paint(c, '#a6507f');
    for (let i = 1; i < 3; i++) line(c, x + 0.3 + i * (w - 0.6) / 3, V(y + 0.3, 0.58) + 0.05, x + 0.3 + i * (w - 0.6) / 3, f - 0.1, 'rgba(43,34,51,.4)', 0.03);
    for (const ax of [x, x + w - 0.48]) { rrect(c, ax, f - 1.02, 0.48, 1.0, 0.16); paint(c, '#8a3f6a'); rrect(c, ax, V(y + 0.2, 0.98), 0.48, (d - 0.2) * KY + 0.06, 0.16); paint(c, '#9c4a78'); }
    // a cushion
    c.save(); c.translate(x + 0.95, V(y + 0.35, 0.95)); c.rotate(-0.2); rrect(c, -0.26, -0.22, 0.52, 0.44, 0.1); paint(c, '#f2c33f', 0.035); c.restore();
  },

  plant1(c, s) { plant(c, s, 0); },
  plant2(c, s) { plant(c, s, 1); },
  plant3(c, s) { plant(c, s, 0); },

  slot1(c, s) { cabinet(c, s); },
  slot2(c, s) { cabinet(c, s); },
  slot3(c, s) { cabinet(c, s); },

  blackjack(c, s) {
    const [cx, cy, rx, ry] = s.round, h = s.h, ty = V(cy, h), ky = ry * KY;
    roundTable(c, cx, cy, rx, ry, h, '#6b3f28', '#4a2a1c');
    ell(c, cx, ty, rx - 0.17, ky - 0.12); paint(c, '#1f7a5a', 0.035);
    c.beginPath(); c.ellipse(cx, ty - 0.1, rx - 0.75, ky - 0.36, 0, 0.12 * Math.PI, 0.88 * Math.PI); c.lineWidth = 0.025; c.strokeStyle = 'rgba(255,224,150,.7)'; c.stroke();
    // the dealer's side: a tray of chips and the shoe the cards come from
    rrect(c, cx - 0.62, ty - ky + 0.2, 1.24, 0.17, 0.04); paint(c, '#2b2a36', 0.03);
    ['#e2403a', '#3d8fe0', '#f2c33f', '#58b85f', '#fbf6ea', '#2b2a36'].forEach((col, i) => { rrect(c, cx - 0.56 + i * 0.195, ty - ky + 0.225, 0.15, 0.12, 0.02); paint(c, col, 0.018); });
    poly(c, [[cx + 0.86, ty - ky + 0.42], [cx + 1.22, ty - ky + 0.5], [cx + 1.22, ty - ky + 0.3], [cx + 0.86, ty - ky + 0.22]]); paint(c, '#b25a3c', 0.03);
    // a place for each of the five seats
    for (const [ox, oy, rot] of [[-1.3, 0.02, 0.5], [-0.68, 0.3, 0.22], [0, 0.4, 0], [0.68, 0.3, -0.22], [1.3, 0.02, -0.5]]) {
      c.save(); c.translate(cx + ox, ty + oy); c.rotate(rot); rrect(c, -0.11, -0.12, 0.22, 0.24, 0.03); c.lineWidth = 0.02; c.strokeStyle = 'rgba(255,255,255,.55)'; c.stroke(); c.restore();
    }
    // two cards lying face up in front of the dealer
    for (const [ox, rot, col] of [[-0.14, -0.1, '#d2323a'], [0.12, 0.08, '#1d1a22']]) { c.save(); c.translate(cx + ox, ty - 0.08); c.rotate(rot); rrect(c, -0.11, -0.13, 0.22, 0.26, 0.03); paint(c, '#fbf6ea', 0.022); ell(c, 0, 0, 0.04, 0.045); c.fillStyle = col; c.fill(); c.restore(); }
  },

  lamp(c, s) {
    const [cx, cy] = s.round, by = V(cy);
    const g = c.createRadialGradient(cx, by - 2.2, 0.1, cx, by - 2.2, 1.05); g.addColorStop(0, 'rgba(255,224,150,.45)'); g.addColorStop(1, 'rgba(255,224,150,0)');
    c.fillStyle = g; c.fillRect(cx - 1.1, by - 3.3, 2.2, 2.2);
    ell(c, cx, by, 0.26, 0.1); paint(c, '#3a2433');
    line(c, cx, by, cx, by - 2.0, INK, 0.09); line(c, cx, by, cx, by - 2.0, '#8c939c', 0.045);
    poly(c, [[cx - 0.26, by - 2.55], [cx + 0.26, by - 2.55], [cx + 0.44, by - 1.95], [cx - 0.44, by - 1.95]]); paint(c, '#ffe9a8');
  },
};

// A slot machine: the cabinet with its sign, the window for the reels (which are drawn live), the shelf with the
// button, the tray, and the arm at the side.
const SLOT_ART = {
  slot1: { body: '#d8474f', dark: '#a83241', trim: '#ffd45e', label: 'KIRSEBÆR', dots: ['#e2403a', '#f2c33f', '#8a58d6', '#ffd45e', '#58b85f'] },
  slot2: { body: '#3f8fa8', dark: '#2a6a80', trim: '#dfe7ec', label: 'ROBOT', dots: ['#c9d0d8', '#f2c33f', '#ff7e6b', '#7fe0c3', '#8fc9ff'] },
  slot3: { body: '#e889a8', dark: '#c0607f', trim: '#ffd45e', label: 'GRISEN', dots: ['#ff9fc0', '#f2c33f', '#58b85f', '#c9d0d8', '#ffd45e'] },
};
function cabinet(c, s) {
  const [x, y, w, d] = s.box, h = s.h, f = V(y + d, h), a = SLOT_ART[s.id];
  box(c, x, y, w, d, h, a.body, a.dark);
  rrect(c, x + 0.06, f + 0.07, w - 0.12, 0.4, 0.12); paint(c, a.trim, 0.035);
  text(c, a.label, x + w / 2, f + 0.28, a.label.length > 6 ? 0.165 : 0.2, '#5a2f3c', 700);
  rrect(c, x + 0.1, f + 0.56, w - 0.2, 0.66, 0.07); paint(c, '#171220', 0.04);
  poly(c, [[x + 0.03, f + 1.32], [x + w - 0.03, f + 1.32], [x + w + 0.06, f + 1.58], [x - 0.06, f + 1.58]]); paint(c, lighter(a.dark, 0.12));
  ell(c, x + w / 2, f + 1.45, 0.17, 0.075); paint(c, '#f2c33f', 0.03);
  rrect(c, x + 0.22, f + 1.74, w - 0.44, 0.2, 0.05); paint(c, '#171220', 0.035);
  rrect(c, x + 0.14, f + 2.04, w - 0.28, 0.27, 0.07); paint(c, darker(a.dark, 0.25), 0.035);
  line(c, x + w + 0.01, f + 1.3, x + w + 0.19, f + 0.78, INK, 0.1); line(c, x + w + 0.01, f + 1.3, x + w + 0.19, f + 0.78, '#c9d0d8', 0.055);
  ell(c, x + w + 0.2, f + 0.72, 0.105, 0.105); paint(c, '#e2403a', 0.03);
  for (const o of [0.1, w - 0.1]) { ell(c, x + o, f + 0.52, 0.035, 0.035); c.fillStyle = a.trim; c.fill(); }
}

function plant(c, s, kind) {
  const [cx, cy] = s.round, by = V(cy);
  const leaf = (a, len, col) => { c.save(); c.translate(cx, by - 0.62); c.rotate(a); c.beginPath(); c.moveTo(0, 0); c.bezierCurveTo(0.24, -len * 0.4, 0.2, -len * 0.85, 0, -len); c.bezierCurveTo(-0.2, -len * 0.85, -0.24, -len * 0.4, 0, 0); c.closePath(); paint(c, col, 0.035); line(c, 0, -0.05, 0, -len * 0.85, 'rgba(0,0,0,.2)', 0.02); c.restore(); };
  const cols = kind ? ['#3f9a5a', '#58b86f', '#2f7d4f'] : ['#58b86f', '#3f9a5a', '#7ccf7a'];
  [-1.0, 1.0, -0.5, 0.5, 0].forEach((a, i) => leaf(a, 1.05 + (i % 2) * 0.25 + (i === 4 ? 0.45 : 0), cols[i % 3]));
  poly(c, [[cx - 0.36, by - 0.68], [cx + 0.36, by - 0.68], [cx + 0.26, by], [cx - 0.26, by]]); paint(c, '#c8643c');
  rrect(c, cx - 0.4, by - 0.74, 0.8, 0.15, 0.04); paint(c, '#d8784c');
}

export function paintStation(c, s) { if (PIECES[s.id]) PIECES[s.id](c, s); }

// A stool, standing at (x, y); bar stools are taller.
export function paintStool(c, x, y, high) {
  const h = high ? 0.78 : 0.5, by = V(y), col = high ? '#3a2433' : '#8a5a36', top = high ? '#c8433c' : '#c08a52';
  for (const o of [-0.2, 0.2]) line(c, x + o * 0.7, by - h + 0.06, x + o * 1.15, by + 0.02, INK, 0.085);
  for (const o of [-0.2, 0.2]) line(c, x + o * 0.7, by - h + 0.06, x + o * 1.15, by + 0.02, col, 0.045);
  if (high) { line(c, x - 0.2, by - 0.26, x + 0.2, by - 0.26, INK, 0.07); line(c, x - 0.2, by - 0.26, x + 0.2, by - 0.26, '#e0b04a', 0.035); }
  ell(c, x, by - h + 0.08, 0.34, 0.15); paint(c, darker(top, 0.25));
  ell(c, x, by - h, 0.34, 0.15); paint(c, top);
}
export const seatHeight = s => s.on ? 0.42 : s.high ? 0.7 : 0.44;

// ---------- the things that move (drawn every frame) ----------
export function paintLive(c, t, music, casino, cabins) {
  // dance floor tiles
  const [dx, dy, dr] = STATION.dance.floor, n = 4, tw = dr * 2 / n;
  const cols = ['#ff5fa2', '#4fc3e8', '#ffd45e', '#7fe08a', '#b07cff'];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const k = Math.floor(t * 1.6 + i * 1.7 + j * 2.3) % cols.length, pulse = 0.55 + 0.45 * Math.sin(t * 3.2 + i + j * 2);
    c.fillStyle = mix('#2a2238', cols[k], 0.35 + 0.5 * pulse);
    rrect(c, dx - dr + i * tw + 0.04, V(dy - dr + j * tw) + 0.03, tw - 0.08, tw * KY - 0.06, 0.05); c.fill();
  }
  // the casino: the jackpot over the pig machine, and the board with who is up and down today
  if (casino) {
    const [px, , pw] = STATION.slot3.box, cx = px + pw / 2, glow = 0.75 + 0.25 * Math.sin(t * 3);
    rrect(c, cx - 0.72, V(0, 2.5), 1.44, 0.56, 0.1); c.fillStyle = '#2a1830'; c.fill(); c.lineWidth = 0.04; c.strokeStyle = mix('#8a5a1f', '#ffd45e', glow); c.stroke();
    text(c, 'JACKPOT', cx, V(0, 2.5) + 0.15, 0.13, '#ffb347', 700);
    text(c, String(casino.pot || 0).replace(/\B(?=(\d{3})+$)/g, '.'), cx, V(0, 2.5) + 0.37, 0.24, '#ffe9a8', 700);
    for (let i = 0; i < 7; i++) { ell(c, cx - 0.6 + i * 0.2, V(0, 2.5) - 0.045, 0.035, 0.035); c.fillStyle = (Math.floor(t * 3) + i) % 2 ? '#ffd45e' : '#7a5a1f'; c.fill(); }
    const [x, z, w, h] = STATION.casino.wall, top = V(0, z + h);
    text(c, 'I DAG', x + w / 2, top + 0.2, 0.17, '#ffb347', 700);
    const rows = (casino.lines || []).slice(0, 4);
    if (!rows.length) text(c, 'Ingen har spillet', x + w / 2, top + h / 2 + 0.1, 0.13, '#8d84a0', 600);
    rows.forEach(([name, net], i) => {
      const y = top + 0.5 + i * 0.3, short = name.length > 9 ? name.slice(0, 8) + '…' : name, col = net > 0 ? '#7fe08a' : net < 0 ? '#ff8f80' : '#e9e3f5';
      c.textAlign = 'left'; text(c, short, x + 0.12, y, 0.15, '#e9e3f5', 600); c.textAlign = 'right'; text(c, (net > 0 ? '+' : '') + net, x + w - 0.12, y, 0.16, col, 700); c.textAlign = 'center';
    });
  }
  // who is in their cabin: on the board by the door to the cabins
  if (cabins) {
    const [x, z, w, h] = STATION.cabins.flat, top = V(0, z + h);
    text(c, 'I HYTTERNE', x + w / 2, top + 0.16, 0.13, '#f1d9a0', 700);
    const rows = cabins.slice(0, 4);
    if (!rows.length) text(c, 'Ingen', x + w / 2, top + h / 2 + 0.08, 0.12, '#a99579', 600);
    rows.forEach((r, i) => { const y = top + 0.42 + i * 0.22, short = r.name.length > 9 ? r.name.slice(0, 8) + '…' : r.name; c.textAlign = 'left'; text(c, short, x + 0.1, y, 0.12, r.sleep ? '#a99579' : '#fff3d6', 600); c.textAlign = 'center'; if (r.sleep) text(c, 'z', x + w - 0.1, y, 0.12, '#9d97e6', 700); });
    if (cabins.length > rows.length) text(c, '+' + (cabins.length - rows.length), x + w / 2, top + h - 0.08, 0.1, '#a99579', 600);
  }
  // the clock
  { const [x, , w] = STATION.jukebox.box, cx = x + w / 2, cy = V(0, 2.62), d = new Date(), hh = d.getHours() % 12 + d.getMinutes() / 60, mm = d.getMinutes() + d.getSeconds() / 60;
    const ha = hh / 12 * TAU - Math.PI / 2, ma = mm / 60 * TAU - Math.PI / 2;
    line(c, cx, cy, cx + Math.cos(ha) * 0.15, cy + Math.sin(ha) * 0.15, INK, 0.04); line(c, cx, cy, cx + Math.cos(ma) * 0.23, cy + Math.sin(ma) * 0.23, INK, 0.028);
    ell(c, cx, cy, 0.03, 0.03); c.fillStyle = '#e2403a'; c.fill(); }
}

// What moves on a piece of furniture itself (drawn right after its picture, so it is not hidden behind it).
export const OVER = new Set(['arcade', 'jukebox', 'slot1', 'slot2', 'slot3']);
export function paintOver(c, id, t, music, casino) {
  if (id === 'arcade') {
  { const [x, y, w, d] = STATION.arcade.box, f = V(y + d, STATION.arcade.h), sx = x + 0.2, sy = f + 0.66, sw = w - 0.4, sh = 0.66;
    c.save(); rrect(c, sx, sy, sw, sh, 0.04); c.clip();
    c.fillStyle = '#16233f'; c.fillRect(sx, sy, sw, sh); c.fillStyle = '#2f7d4f'; c.fillRect(sx, sy + sh * 0.66, sw, sh);
    for (let i = 0; i < 3; i++) { const u = (t * 0.25 + i / 3) % 1, tx = sx + sw * (0.15 + 0.7 * ((i * 0.37 + 0.2) % 1)), ty = sy + sh * (0.62 - u * 0.25), r = 0.035 + u * 0.05; ell(c, tx, ty, r, r); c.fillStyle = i ? '#ff7e6b' : '#ffd45e'; c.fill(); }
    const cxh = sx + sw / 2 + Math.sin(t * 1.3) * sw * 0.25, cyh = sy + sh * 0.45 + Math.cos(t * 1.7) * sh * 0.14;
    c.strokeStyle = '#eafff2'; c.lineWidth = 0.02; c.beginPath(); c.moveTo(cxh - 0.08, cyh); c.lineTo(cxh + 0.08, cyh); c.moveTo(cxh, cyh - 0.08); c.lineTo(cxh, cyh + 0.08); c.stroke();
    c.fillStyle = 'rgba(255,255,255,.05)'; for (let yy = 0; yy < sh; yy += 0.06) c.fillRect(sx, sy + yy, sw, 0.02);
    c.restore(); }
    return;
  }
  if (id === 'jukebox') {
  { const [x, y, w, d] = STATION.jukebox.box, f = V(y + d, STATION.jukebox.h), cx = x + w / 2;
    for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(cx, f + 0.56, w / 2 - 0.05 - i * 0.05, Math.PI, 0); c.lineWidth = 0.04; c.strokeStyle = 'hsl(' + ((t * 40 + i * 50) % 360) + ' 90% 65%)'; c.stroke(); }
    if (music) for (let i = 0; i < 3; i++) { const u = (t * 0.4 + i / 3) % 1; c.globalAlpha = Math.sin(u * Math.PI); text(c, i % 2 ? '♪' : '♫', cx - 0.34 + i * 0.34 + Math.sin(u * 5 + i) * 0.12, f - 0.1 - u * 0.75, 0.3, '#ffe9a8', 700); c.globalAlpha = 1; } }
    return;
  }
  // a slot machine: three reels in the window. They turn slowly by themselves and fast while somebody plays.
  const st = STATION[id], a = SLOT_ART[id], [x, y, w, d] = st.box, f = V(y + d, st.h), busy = casino && casino.spin && casino.spin[id] > t;
  const wx = x + 0.16, wy = f + 0.62, cw = (w - 0.32 - 0.08) / 3, chh = 0.54;
  for (let i = 0; i < 3; i++) {
    const cx = wx + i * (cw + 0.04);
    rrect(c, cx, wy, cw, chh, 0.04); c.fillStyle = '#fbf6ea'; c.fill();
    c.save(); rrect(c, cx, wy, cw, chh, 0.04); c.clip();
    const speed = busy ? 9 + i * 2 : 0.22, pos = t * speed + i * 1.7 + st.box[0], k = Math.floor(pos), u = pos - k;
    for (let r = -1; r <= 1; r++) {
      const col = a.dots[(((k + r) % a.dots.length) + a.dots.length) % a.dots.length], yy = wy + chh / 2 + (r + (busy ? u : 0)) * chh * 0.62;
      ell(c, cx + cw / 2, yy, cw * 0.3, cw * 0.3); c.fillStyle = col; c.fill(); c.lineWidth = 0.022; c.strokeStyle = INK; c.stroke();
    }
    if (busy) { c.fillStyle = 'rgba(255,255,255,.35)'; c.fillRect(cx, wy, cw, chh); }
    c.restore();
  }
  line(c, wx - 0.02, wy + chh / 2, wx + w - 0.3, wy + chh / 2, 'rgba(226,64,58,.75)', 0.02);
  if (busy) { c.save(); c.globalAlpha = 0.5 + 0.5 * Math.sin(t * 20); for (const o of [0.1, w - 0.1]) { ell(c, x + o, f + 0.52, 0.05, 0.05); c.fillStyle = '#fff6c9'; c.fill(); } c.restore(); }
}

// The bartender: the house robot, standing behind the counter and polishing a glass.
export function paintBartender(c, t) {
  const [x, y, w] = STATION.bar.box, cx = x + w * 0.5 + Math.sin(t * 0.3) * 1.65, by = V(y + 1.15, 0);      // in the aisle inside the U
  c.save(); c.translate(cx, by); c.lineJoin = 'round'; c.lineCap = 'round';
  rrect(c, -0.36, -1.85, 0.72, 0.75, 0.16); paint(c, '#8fa3b8');                    // body
  for (const s of [-1, 1]) { poly(c, [[0, -1.72], [s * 0.19, -1.82], [s * 0.19, -1.62]]); paint(c, '#c8323c', 0.03); }
  ell(c, 0, -1.72, 0.05, 0.05); paint(c, '#a3262d', 0.025);
  line(c, 0, -2.42, 0, -2.62, INK, 0.05); ell(c, 0, -2.66, 0.07, 0.07); paint(c, Math.sin(t * 4) > 0 ? '#ffd45e' : '#e2403a', 0.03);
  rrect(c, -0.4, -2.44, 0.8, 0.58, 0.2); paint(c, '#b9c8d8');                       // head
  rrect(c, -0.3, -2.34, 0.6, 0.36, 0.1); paint(c, '#1d2b3a', 0.03);
  const blink = (t % 3.7) < 0.12;
  c.fillStyle = '#7fe0ff';
  for (const s of [-1, 1]) { if (blink) c.fillRect(s * 0.14 - 0.06, -2.2, 0.12, 0.03); else { ell(c, s * 0.14, -2.2, 0.055, 0.065); c.fill(); } }
  c.beginPath(); c.arc(0, -2.12, 0.09, 0.15 * Math.PI, 0.85 * Math.PI); c.lineWidth = 0.03; c.strokeStyle = '#7fe0ff'; c.stroke();
  // arms: one holds a glass, the other a cloth going round
  const wob = Math.sin(t * 5) * 0.05;
  line(c, 0.36, -1.62, 0.52, -1.42, INK, 0.13); line(c, 0.36, -1.62, 0.52, -1.42, '#8fa3b8', 0.08);
  c.save(); c.translate(0.56, -1.36); c.scale(0.02, 0.02); drawGlass(c, 'fadol', 0); c.restore();
  line(c, -0.36, -1.62, 0.36 + wob, -1.5 + wob, INK, 0.13); line(c, -0.36, -1.62, 0.36 + wob, -1.5 + wob, '#8fa3b8', 0.08);
  rrect(c, 0.3 + wob, -1.6 + wob, 0.2, 0.17, 0.04); paint(c, '#fbf6ea', 0.03);
  c.restore();
}

export { lighter };
