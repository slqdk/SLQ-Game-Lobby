// SLQ Game Lobby — the inside of one's own log cabin (shared/cabin.js has its plan; outside.js builds what one sees of
// it from the saloon). Søren sent photos of lodges as a mood: honey-coloured round logs, a stone fireplace with a log
// mantel, log furniture with leather and plaid, a log bed with a red blanket. This is our own cabin in that spirit.
//
// Everything stands where the plan says: x across, the plan's y is z here, y is up; the cabin stands in the valley
// west of the saloon, so its x is negative. The walls show their inside only; looking out of a window one sees the
// valley (outside.js) and the saloon's outside (place.js).
import { CABIN, CABIN_THING, BED } from '../../shared/cabin.js';

const IRON = [0.06, 0.06, 0.07], LEATHER = [0.36, 0.17, 0.08], CREAM = [0.9, 0.84, 0.72], RED = [0.55, 0.07, 0.07], BRASS = [0.82, 0.58, 0.18];
const PINE = [0.62, 0.38, 0.16], LOG = [0.55, 0.33, 0.14], DARK = [0.2, 0.1, 0.05];

export function buildCabin(THREE, kit) {
  const { batch, at, picture, tone, wood } = kit;
  const inside = new THREE.Group(); inside.name = 'cabin'; inside.visible = false;
  const upper = new THREE.Group(); inside.add(upper);                 // the roof and what hangs from it (hidden when the camera is up there)
  const [ix0, iz0, ix1, iz1] = CABIN.in, H = CABIN.wallH, R = H + CABIN.ridge, MID = CABIN.mid, W = ix1 - ix0, D = iz1 - iz0;
  const roofY = z => H + CABIN.ridge * (1 - Math.abs(z - MID) / (MID - iz0));
  const rnd = (() => { let s = 20261113; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; })();
  const solid = batch(), glow = batch(), high = batch(), glowHigh = batch(), logsB = batch(), floorB = batch(), boardsB = batch(), stoneB = batch(), rugB = batch(), plaidB = batch(), paintB = batch();
  const live = {};

  // ---------- pictures ----------
  // the walls: round logs of honey-coloured pine, light chinking between them, the grain and a knot here and there
  const LOGH = 0.3, LOGS_PER = 7;                                  // a log's height; the picture holds seven of them (2.1 m) and 2.4 m of wall
  const logs = picture(512, 448, (g, w, h) => {
    const lh = h / LOGS_PER;
    for (let i = 0; i < LOGS_PER; i++) {
      const y = i * lh, k = 0.9 + rnd() * 0.2;
      const gr = g.createLinearGradient(0, y, 0, y + lh);
      gr.addColorStop(0, 'rgb(' + (120 * k | 0) + ',' + (70 * k | 0) + ',' + (32 * k | 0) + ')'); gr.addColorStop(0.3, 'rgb(' + (205 * k | 0) + ',' + (135 * k | 0) + ',' + (66 * k | 0) + ')');
      gr.addColorStop(0.55, 'rgb(' + (222 * k | 0) + ',' + (152 * k | 0) + ',' + (78 * k | 0) + ')'); gr.addColorStop(1, 'rgb(' + (110 * k | 0) + ',' + (62 * k | 0) + ',' + (28 * k | 0) + ')');
      g.fillStyle = gr; g.fillRect(0, y, w, lh);
      for (let j = 0; j < 40; j++) { g.fillStyle = 'rgba(' + (rnd() < 0.5 ? '90,46,16' : '250,200,130') + ',' + (0.06 + rnd() * 0.1).toFixed(2) + ')'; g.fillRect(rnd() * w, y + lh * (0.15 + rnd() * 0.7), 30 + rnd() * 160, 1 + rnd()); }
      if (rnd() < 0.7) { const kx = rnd() * w, ky = y + lh * (0.35 + rnd() * 0.3); g.fillStyle = 'rgba(80,40,14,.65)'; g.beginPath(); g.ellipse(kx, ky, 5 + rnd() * 4, 3 + rnd() * 2, 0, 0, 6.3); g.fill(); g.strokeStyle = 'rgba(120,64,24,.4)'; g.lineWidth = 1.5; g.beginPath(); g.ellipse(kx, ky, 10, 6, 0, 0, 6.3); g.stroke(); }
      if (rnd() < 0.4) { const jx = rnd() * w; g.fillStyle = 'rgba(60,30,10,.7)'; g.fillRect(jx, y + 3, 3, lh - 6); }       // where two logs meet
      g.fillStyle = '#d9cbb0'; g.fillRect(0, y + lh - 3, w, 4); g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(0, y + lh - 4, w, 1);       // the chinking
    }
  }, true);
  const floorPic = picture(512, 512, (g, w, h) => {
    g.fillStyle = '#7a4a24'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 6; i++) {
      const y = i * h / 6, k = 0.85 + rnd() * 0.3;
      g.fillStyle = 'rgb(' + (150 * k | 0) + ',' + (88 * k | 0) + ',' + (40 * k | 0) + ')'; g.fillRect(0, y, w, h / 6 - 3);
      for (let j = 0; j < 22; j++) { g.fillStyle = 'rgba(' + (rnd() < 0.5 ? '70,36,12' : '210,150,90') + ',' + (0.06 + rnd() * 0.1).toFixed(2) + ')'; g.fillRect(rnd() * w, y + 4 + rnd() * (h / 6 - 12), 40 + rnd() * 180, 1 + rnd() * 1.5); }
      const sx = (i * 173 + 90) % w; g.fillStyle = 'rgba(40,20,8,.6)'; g.fillRect(sx, y, 3, h / 6 - 3);
      g.fillStyle = 'rgba(30,20,10,.7)'; for (const nx of [sx + 12, sx - 12]) { g.beginPath(); g.arc((nx + w) % w, y + 14, 2.2, 0, 6.3); g.fill(); g.beginPath(); g.arc((nx + w) % w, y + h / 6 - 16, 2.2, 0, 6.3); g.fill(); }
    }
  }, true);
  const boardsPic = picture(256, 256, (g, w, h) => {
    for (let i = 0; i < 8; i++) { const k = 0.85 + rnd() * 0.3; g.fillStyle = 'rgb(' + (196 * k | 0) + ',' + (140 * k | 0) + ',' + (84 * k | 0) + ')'; g.fillRect(i * 32, 0, 31, h); g.fillStyle = 'rgba(70,36,12,.55)'; g.fillRect(i * 32 + 30, 0, 2, h); for (let j = 0; j < 6; j++) { g.fillStyle = 'rgba(110,60,20,.15)'; g.fillRect(i * 32 + 3 + rnd() * 24, rnd() * h, 1.5, 30 + rnd() * 80); } }
  }, true);
  // stones in grey and brown, set in dark mortar
  const stonePic = picture(512, 512, (g, w, h) => {
    g.fillStyle = '#3a342e'; g.fillRect(0, 0, w, h);
    let y = 0;
    while (y < h) {
      const rh = 34 + rnd() * 30; let x = -rnd() * 40;
      while (x < w) {
        const sw = 40 + rnd() * 70, k = 0.75 + rnd() * 0.5, brown = rnd() < 0.4;
        const c0 = brown ? [128, 104, 82] : [122, 118, 112], cx = x + sw / 2, cy = y + rh / 2;
        const gr = g.createRadialGradient(cx - sw * 0.15, cy - rh * 0.2, 2, cx, cy, sw * 0.6);
        gr.addColorStop(0, 'rgb(' + c0.map(v => Math.min(255, v * k * 1.25) | 0) + ')'); gr.addColorStop(1, 'rgb(' + c0.map(v => v * k * 0.7 | 0) + ')');
        g.fillStyle = gr; g.beginPath(); g.roundRect(x + 3, y + 3, sw - 6, rh - 6, 10 + rnd() * 8); g.fill();
        x += sw;
      }
      y += rh;
    }
  }, true);
  // a woven rug: a border, stripes and a row of diamonds (our own pattern)
  const rugPic = picture(512, 384, (g, w, h) => {
    g.fillStyle = '#7d1f1b'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#e8d6b0'; g.fillRect(14, 14, w - 28, h - 28); g.fillStyle = '#7d1f1b'; g.fillRect(26, 26, w - 52, h - 52);
    for (const [y, c] of [[60, '#2f3a56'], [h - 74, '#2f3a56'], [92, '#c58a2c'], [h - 104, '#c58a2c']]) { g.fillStyle = c; g.fillRect(26, y, w - 52, 14); }
    g.fillStyle = '#e8d6b0';
    for (let i = 0; i < 6; i++) { const cx = 70 + i * (w - 140) / 5, cy = h / 2; g.beginPath(); g.moveTo(cx, cy - 46); g.lineTo(cx + 30, cy); g.lineTo(cx, cy + 46); g.lineTo(cx - 30, cy); g.fill(); g.fillStyle = '#2f3a56'; g.beginPath(); g.moveTo(cx, cy - 22); g.lineTo(cx + 14, cy); g.lineTo(cx, cy + 22); g.lineTo(cx - 14, cy); g.fill(); g.fillStyle = '#e8d6b0'; }
    g.fillStyle = 'rgba(0,0,0,.1)'; for (let x = 0; x < w; x += 3) g.fillRect(x, 0, 1, h);
  });
  const plaidPic = picture(128, 128, (g, w, h) => {
    g.fillStyle = '#9d1f1f'; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(20,10,10,.75)'; for (let i = 0; i < 4; i++) { g.fillRect(i * 32, 0, 16, h); g.fillRect(0, i * 32, w, 16); }
    g.fillStyle = 'rgba(255,220,180,.18)'; for (let i = 0; i < 4; i++) { g.fillRect(i * 32 + 24, 0, 2, h); g.fillRect(0, i * 32 + 24, w, 2); }
  }, true);
  // over the mantel: a painting of our own, mountains over a lake at the end of the day
  const paintingPic = picture(384, 256, (g, w, h) => {
    const sky = g.createLinearGradient(0, 0, 0, h * 0.6); sky.addColorStop(0, '#41598a'); sky.addColorStop(0.6, '#d9926a'); sky.addColorStop(1, '#f2c27a'); g.fillStyle = sky; g.fillRect(0, 0, w, h);
    g.fillStyle = '#f8e2a8'; g.beginPath(); g.arc(w * 0.68, h * 0.48, 16, 0, 6.3); g.fill();
    const ridge = (y0, amp, col, seed) => { g.fillStyle = col; g.beginPath(); g.moveTo(0, h); for (let x = 0; x <= w; x += 8) g.lineTo(x, y0 - Math.abs(Math.sin(x * 0.021 + seed) * amp) - Math.abs(Math.sin(x * 0.053 + seed * 2)) * amp * 0.4); g.lineTo(w, h); g.fill(); };
    ridge(h * 0.55, 70, '#6f6a86', 1); g.fillStyle = 'rgba(255,255,255,.75)'; ridge(h * 0.36, 26, 'rgba(240,240,250,.0)', 1);
    ridge(h * 0.62, 40, '#4c5a54', 2.3);
    g.fillStyle = '#7e9bb0'; g.fillRect(0, h * 0.7, w, h * 0.12); g.fillStyle = 'rgba(248,226,168,.5)'; g.fillRect(w * 0.6, h * 0.71, w * 0.16, 3);
    g.fillStyle = '#2c3b2a'; g.fillRect(0, h * 0.82, w, h * 0.18);
    for (let i = 0; i < 9; i++) { const x = 20 + i * 44 + rnd() * 10, s = 26 + rnd() * 22; g.fillStyle = '#1f2c20'; g.beginPath(); g.moveTo(x, h * 0.84 - s); g.lineTo(x + s * 0.35, h * 0.86); g.lineTo(x - s * 0.35, h * 0.86); g.fill(); }
    g.strokeStyle = 'rgba(0,0,0,.15)'; for (let i = 0; i < 60; i++) { g.lineWidth = 1 + rnd() * 2; g.beginPath(); const x = rnd() * w, y = rnd() * h; g.moveTo(x, y); g.lineTo(x + 6 + rnd() * 10, y + rnd() * 3); g.stroke(); }
  });

  // ---------- the room: floor, log walls with their openings, the roof open to the ridge ----------
  floorB.quad([ix0, 0, iz1], [ix1, 0, iz1], [ix1, 0, iz0], [ix0, 0, iz0], [1, 1, 1], 0, D / 2.6, W / 2.6, 0);
  // a wall from its bottom corners a to b (seen from inside, from left to right), with openings [from, to, bottom, top] along it
  const wall = (a, b, holes = []) => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / len, uz = (b[1] - a[1]) / len, P = (s, y) => [a[0] + ux * s, y, a[1] + uz * s];
    const piece = (s0, s1, y0, y1) => { if (s1 - s0 > 1e-6 && y1 - y0 > 1e-6) logsB.quad(P(s0, y0), P(s1, y0), P(s1, y1), P(s0, y1), [1, 1, 1], s0 / 2.4, y0 / 2.1, s1 / 2.4, y1 / 2.1); };
    let s = 0;
    for (const [h0, h1, y0, y1] of holes.slice().sort((p, q) => p[0] - q[0])) { piece(s, h0, 0, H); piece(h0, h1, 0, y0); piece(h0, h1, y1, H); s = h1; }
    piece(s, len, 0, H);
  };
  const holesOn = (side, sOf) => CABIN.windows.filter(q => q[0] === side).map(([, at, w, y0, y1]) => [sOf(at) - w / 2, sOf(at) + w / 2, y0, y1]);
  const dw = CABIN.door.w, dh = CABIN.door.h;
  wall([ix1, iz0], [ix1, iz1], [...holesOn('front', z => z - iz0), [CABIN.door.y - iz0 - dw / 2, CABIN.door.y - iz0 + dw / 2, 0, dh]]);       // the front, with the door
  wall([ix0, iz1], [ix0, iz0], holesOn('back', z => iz1 - z));
  wall([ix0, iz0], [ix1, iz0], holesOn('y0', x => x - ix0));
  wall([ix1, iz1], [ix0, iz1], holesOn('y1', x => ix1 - x));
  // the two gables, logs as well
  for (const [x, flip] of [[ix1, false], [ix0, true]]) {
    const pts = flip ? [[iz1, H], [iz0, H], [MID, R]] : [[iz0, H], [iz1, H], [MID, R]];
    for (const [z, y] of pts) logsB.vert(x, y, z, flip ? 1 : -1, 0, 0, (flip ? iz1 - z : z - iz0) / 2.4, y / 2.1, [1, 1, 1]);
  }
  // the roof boards, from the eaves up to the ridge
  boardsB.quad([ix0, H, iz0], [ix1, H, iz0], [ix1, R, MID], [ix0, R, MID], [1, 1, 1], 0, 0, W / 2, (MID - iz0) * 1.12 / 2);
  boardsB.quad([ix1, H, iz1], [ix0, H, iz1], [ix0, R, MID], [ix1, R, MID], [1, 1, 1], 0, 0, W / 2, (MID - iz0) * 1.12 / 2);
  // round timber under them: a log on top of each long wall, the ridge, a purlin each side, two tie beams with king posts
  const log = wood(tone(LOG, 0.95), 0.12), old = wood(tone(LOG, 0.8), 0.12);
  high.rod(ix0, H - 0.05, iz0 + 0.12, ix1, H - 0.05, iz0 + 0.12, 0.15, log, 10); high.rod(ix0, H - 0.05, iz1 - 0.12, ix1, H - 0.05, iz1 - 0.12, 0.15, log, 10);
  high.rod(ix0, R - 0.22, MID, ix1, R - 0.22, MID, 0.16, log, 10);
  for (const sd of [-1, 1]) { const z = MID + sd * (MID - iz0) / 2; high.rod(ix0, roofY(z) - 0.17, z, ix1, roofY(z) - 0.17, z, 0.11, old, 8); }
  for (const x of [ix0 + W / 3, ix0 + W * 2 / 3]) {
    high.rod(x, H, iz0 + 0.05, x, H, iz1 - 0.05, 0.14, log, 10);
    high.rod(x, H + 0.08, MID, x, R - 0.3, MID, 0.11, log, 8);
    for (const sd of [-1, 1]) high.rod(x, H + 0.1, MID + sd * 0.15, x, roofY(MID + sd * 1.6) - 0.3, MID + sd * 1.6, 0.08, old, 6);
    high.box(x, H + 0.22, MID, 0.3, 0.07, 0.3, IRON);
  }
  // the openings: frames and sills of dark wood, and the logs' thickness round them
  const frameAt = (side, along, w, y0, y1, door) => {
    const isX = side === 'front' || side === 'back', x = side === 'front' ? ix1 : side === 'back' ? ix0 : along, z = isX ? along : side === 'y0' ? iz0 : iz1;
    const n = side === 'front' ? -1 : side === 'back' ? 1 : side === 'y0' ? 1 : -1;      // into the room
    const B = (du, y, dw2, dh2, dd, col, out = 0) => isX ? solid.box(x + n * (out + dd / 2), y, z + du, dd, dh2, dw2, col) : solid.box(x + du, y, z + n * (out + dd / 2), dw2, dh2, dd, col);
    const reveal = wood(tone(LOG, 0.7), 0.1);
    B(0, y1 + 0.04, w + 0.12, 0.08, 0.05, wood(DARK)); if (!door) B(0, y0 - 0.04, w + 0.24, 0.06, 0.16, wood(DARK));
    for (const s of [-1, 1]) B(s * (w / 2 + 0.03), (y0 + y1) / 2, 0.06, y1 - y0 + 0.1, 0.05, wood(DARK));
    for (const s of [-1, 1]) B(s * (w / 2 + 0.03), (y0 + y1) / 2, 0.06, y1 - y0, 0.25, reveal, -0.25);
    B(0, y1 + 0.03, w + 0.12, 0.06, 0.25, reveal, -0.25); if (!door) B(0, y0 - 0.03, w + 0.12, 0.06, 0.25, reveal, -0.25);
    if (!door) { B(0, (y0 + y1) / 2, 0.05, y1 - y0, 0.03, wood(DARK), -0.12); B(0, (y0 + y1) / 2, w, 0.05, 0.03, wood(DARK), -0.12); }      // the bars of the window
  };
  for (const [side, along, w, y0, y1] of CABIN.windows) frameAt(side, along, w, y0, y1, false);
  frameAt('front', CABIN.door.y, dw, 0, dh, true);
  // the door: planks, two iron hinges and a latch; a carved board with one's name over it
  { const x = ix1 + 0.02, z = CABIN.door.y;
    for (let i = 0; i < 5; i++) solid.box(x - 0.03, dh / 2, z - dw / 2 + (i + 0.5) * dw / 5, 0.05, dh - 0.02, dw / 5 - 0.012, wood(tone(PINE, 0.75 + (i % 2) * 0.12), 0.15));
    for (const y of [0.4, dh - 0.4]) solid.box(x - 0.065, y, z, 0.02, 0.1, dw * 0.85, wood(DARK));
    solid.box(x - 0.08, 1.05, z - dw / 2 + 0.16, 0.03, 0.22, 0.05, IRON); solid.box(x - 0.1, 1.05, z - dw / 2 + 0.24, 0.04, 0.04, 0.16, IRON);
    live.sign = [x - 0.06, dh + 0.42, z];
  }

  // ---------- the fireplace: stones from the floor to the roof, a log for a mantel, and the fire ----------
  { const t = CABIN_THING.fire, [x0, z0, w, d] = t.box, cz = z0 + d / 2, top = 1.4;
    const bx1 = x0 + w - 0.1, ow = 0.9, oh = 0.85, od = 0.5;                                    // the front of the stones; the opening of the firebox
    const stone = (xa, xb, ya, yb, za, zb) => stoneB.add(new THREE.BoxGeometry(xb - xa, yb - ya, zb - za), at((xa + xb) / 2, (ya + yb) / 2, (za + zb) / 2), [1, 1, 1], 1.1);
    stone(x0, bx1, 0, top, z0, cz - ow / 2); stone(x0, bx1, 0, top, cz + ow / 2, z0 + d); stone(x0, bx1, oh, top, cz - ow / 2, cz + ow / 2); stone(x0, bx1 - od, 0, oh, cz - ow / 2, cz + ow / 2);
    const cx0 = x0, cx1 = x0 + 0.66, cw = d * 0.8;                                               // the chimney, up through the roof
    stone(cx0, cx1, top, roofY(cz) + 0.05, cz - cw / 2, cz + cw / 2);
    const soot = [0.05, 0.035, 0.03];
    solid.box(bx1 - od + 0.01, oh / 2, cz, 0.02, oh, ow, soot); for (const s2 of [-1, 1]) solid.box(bx1 - od / 2, oh / 2, cz + s2 * (ow / 2 - 0.01), od, oh, 0.02, soot); solid.box(bx1 - od / 2, oh - 0.01, cz, od, 0.02, ow, soot);
    glow.box(bx1 - od + 0.03, 0.32, cz, 0.02, 0.42, ow * 0.7, [0.55, 0.17, 0.04]);              // the glow at the back of it
    stoneB.add(new THREE.BoxGeometry(0.65, 0.1, d + 0.3), at(bx1 + 0.325, 0.05, cz), [1, 1, 1], 1.1);       // the hearth
    solid.rod(bx1 + 0.06, top + 0.02, z0 - 0.12, bx1 + 0.06, top + 0.02, z0 + d + 0.12, 0.13, wood(tone(LOG, 0.85), 0.15), 10);      // the mantel
    // on it: two candle lanterns and a clock
    for (const s2 of [-1, 1]) { solid.box(bx1 + 0.05, top + 0.25, cz + s2 * 0.8, 0.13, 0.22, 0.13, IRON); glow.box(bx1 + 0.05, top + 0.25, cz + s2 * 0.8, 0.09, 0.15, 0.09, [2.4, 1.5, 0.6]); }
    solid.cyl(bx1 + 0.05, top + 0.14, cz + 0.4, 0.09, 0.24, wood(DARK), 10); glow.add(new THREE.CircleGeometry(0.07, 14), at(bx1 + 0.145, top + 0.26, cz + 0.4, 0, Math.PI / 2, 0), [1.2, 1.1, 0.9]);
    // andirons and logs in the fire, and embers; the flames move (see tick)
    const fxc = bx1 - od / 2;
    for (const s2 of [-1, 1]) solid.box(fxc, 0.13, cz + s2 * 0.3, 0.32, 0.06, 0.04, IRON);
    for (const [dz, dy, r] of [[-0.12, 0.2, 0.07], [0.14, 0.2, 0.07], [0.0, 0.31, 0.06]]) solid.rod(fxc - 0.1, dy, cz + dz - 0.32, fxc + 0.08, dy + 0.02, cz + dz + 0.32, r, wood([0.2, 0.1, 0.05]), 7);
    for (let i = 0; i < 9; i++) glow.ball(fxc - 0.08 + rnd() * 0.14, 0.16 + rnd() * 0.08, cz - 0.3 + rnd() * 0.6, 0.03 + rnd() * 0.02, [2.6, 0.8, 0.15]);
    live.fire = [fxc, 0.55, cz];
    // the painting over the mantel, on the chimney, in a wide frame
    const pw = 1.25, ph = 0.84, py = 2.35, px = cx1 + 0.015;
    paintB.quad([px, py - ph / 2, cz + pw / 2], [px, py - ph / 2, cz - pw / 2], [px, py + ph / 2, cz - pw / 2], [px, py + ph / 2, cz + pw / 2], [1, 1, 1]);
    for (const [dy, dz, hh, ww] of [[ph / 2 + 0.05, 0, 0.1, pw + 0.2], [-ph / 2 - 0.05, 0, 0.1, pw + 0.2], [0, pw / 2 + 0.05, ph, 0.1], [0, -pw / 2 - 0.05, ph, 0.1]]) solid.box(px + 0.01, py + dy, cz + dz, 0.05, hh, ww, wood([0.42, 0.26, 0.1]));
    // a woodpile beside it
    { const [wx, wz, ww, wd] = CABIN_THING.wood.box;
      for (let r = 0; r < 3; r++) for (let i = 0; i < 5 - r; i++) { const y = 0.1 + r * 0.17, z = wz + 0.14 + i * 0.21 + r * 0.1; solid.add(new THREE.CylinderGeometry(0.085, 0.085, ww - 0.05, 8), at(wx + ww / 2, y, z, 0, 0, Math.PI / 2), (px, py, pz, n) => Math.abs(n.x) > 0.7 ? [0.68, 0.5, 0.3] : [0.34, 0.2, 0.1]); }
      solid.rod(wx + 0.1, 0.02, wz + 0.04, wx + 0.1, 0.75, wz + 0.04, 0.012, IRON, 4); solid.box(wx + 0.1, 0.83, wz + 0.04, 0.02, 0.1, 0.12, IRON);       // a poker leaning there
    }
  }
  // ---------- the bed: a frame of round logs, a red blanket, white pillows, a plaid at the foot ----------
  { const [x0, z0, w, d] = CABIN_THING.bed.box, cx = x0 + w / 2, frame = wood(tone(LOG, 1.05), 0.14);
    for (const [px, pz, top] of [[x0 + 0.08, z0 + 0.1, 1.35], [x0 + w - 0.08, z0 + 0.1, 1.35], [x0 + 0.08, z0 + d - 0.08, 0.75], [x0 + w - 0.08, z0 + d - 0.08, 0.75]]) { solid.cyl(px, 0, pz, 0.08, top, frame, 10); solid.ball(px, top + 0.04, pz, 0.09, frame, 1, 1, 1, 10); }
    for (const y of [0.5, 1.25]) solid.rod(x0 + 0.08, y, z0 + 0.1, x0 + w - 0.08, y, z0 + 0.1, 0.06, frame, 8);
    for (let i = 1; i < 6; i++) solid.rod(x0 + 0.08 + i * (w - 0.16) / 6, 0.5, z0 + 0.1, x0 + 0.08 + i * (w - 0.16) / 6, 1.25, z0 + 0.1, 0.04, frame, 6);       // the headboard
    for (const y of [0.4, 0.62]) solid.rod(x0 + 0.08, y, z0 + d - 0.08, x0 + w - 0.08, y, z0 + d - 0.08, 0.05, frame, 8);
    for (const s of [-1, 1]) solid.rod(cx + s * (w / 2 - 0.08), 0.32, z0 + 0.1, cx + s * (w / 2 - 0.08), 0.32, z0 + d - 0.08, 0.06, frame, 8);
    solid.box(cx, 0.43, z0 + d / 2 + 0.02, w - 0.22, 0.22, d - 0.26, CREAM);                     // the mattress
    for (const s of [-1, 1]) solid.box(cx + s * 0.36, 0.6, z0 + 0.38, 0.62, 0.15, 0.36, [0.95, 0.94, 0.9]);       // two pillows
    solid.box(cx, 0.555, z0 + d * 0.6, w - 0.12, 0.05, d * 0.68, RED); for (const s of [-1, 1]) solid.box(cx + s * (w / 2 - 0.07), 0.42, z0 + d * 0.6, 0.03, 0.27, d * 0.68, tone(RED, 0.8));       // the blanket
    plaidB.add(new THREE.BoxGeometry(w - 0.1, 0.07, 0.42), at(cx, 0.6, z0 + d - 0.36), [1, 1, 1], 0.4);       // a plaid folded at the foot
    // the covers pulled up over whoever sleeps here (shown only then)
    // (from the chest to just past the feet, thick enough that the legs are under it)
    const len = 1.3, B = batch(); B.box(0, 0.21, 0, w - 0.18, 0.42, len, RED); B.ball(0, 0.36, 0, 0.5, RED, w - 0.24, 0.34, len - 0.1, 12);
    live.covers = { B, at: [cx, 0.5, BED.y + 0.12 - len / 2] };
  }
  { const [x0, z0, w, d] = CABIN_THING.stand.box, cx = x0 + w / 2, cz = z0 + d / 2;           // a night stand with a lamp and a book
    solid.box(cx, 0.3, cz, w, 0.6, d, wood(PINE)); solid.box(cx, 0.4, cz + d / 2, w - 0.08, 0.16, 0.02, wood(tone(PINE, 0.8))); solid.ball(cx, 0.4, cz + d / 2 + 0.02, 0.02, BRASS);
    solid.cyl(cx - 0.05, 0.6, cz, 0.06, 0.25, [0.6, 0.3, 0.12], 10); glow.cyl(cx - 0.05, 0.85, cz, 0.16, 0.2, [2.0, 1.45, 0.85], 14, 0.1); live.bedLamp = [cx - 0.05, 0.95, cz];
    solid.box(cx + 0.14, 0.62, cz + 0.05, 0.16, 0.04, 0.22, [0.2, 0.3, 0.45]);
  }
  // ---------- the wardrobe: a big pine cupboard with iron handles ----------
  { const [x0, z0, w, d] = CABIN_THING.wardrobe.box, cx = x0 + w / 2, h = CABIN_THING.wardrobe.h, front = z0 - 0.01, pw = wood(PINE, 0.14);
    solid.box(cx, h / 2, z0 + d / 2, w, h, d, pw);
    solid.box(cx, h + 0.06, z0 + d / 2 - 0.03, w + 0.14, 0.12, d + 0.08, wood(tone(PINE, 0.7))); solid.box(cx, 0.06, z0 + d / 2 - 0.02, w + 0.06, 0.12, d + 0.04, wood(tone(PINE, 0.7)));
    for (const s of [-1, 1]) {
      solid.box(cx + s * w / 4, h / 2 + 0.04, front, w / 2 - 0.08, h - 0.36, 0.03, wood(tone(PINE, 1.12), 0.14));
      for (const y of [0.5, h - 0.55]) solid.box(cx + s * w / 4, y, front - 0.02, w / 2 - 0.2, 0.06, 0.02, wood(tone(PINE, 0.85)));
      solid.box(cx + s * 0.08, h / 2, front - 0.04, 0.03, 0.26, 0.03, IRON);
    }
    // a hat on top, and a pair of boots beside it
    solid.cyl(cx - 0.4, h + 0.12, z0 + 0.32, 0.3, 0.03, [0.3, 0.2, 0.12], 14); solid.cyl(cx - 0.4, h + 0.15, z0 + 0.32, 0.15, 0.17, [0.3, 0.2, 0.12], 12, 0.13);
    for (const s of [-1, 1]) { solid.box(x0 + w + 0.2 + s * 0.09, 0.2, z0 + 0.25, 0.09, 0.4, 0.13, [0.25, 0.13, 0.06]); solid.box(x0 + w + 0.2 + s * 0.09, 0.05, z0 + 0.18, 0.09, 0.1, 0.26, [0.25, 0.13, 0.06]); }
  }
  // ---------- by the fire: the sofa, the armchair, a table and the rug ----------
  { const [rx, rz] = [-24.35, 7.0];
    rugB.quad([rx - 1.4, 0.006, rz + 1.05], [rx + 1.4, 0.006, rz + 1.05], [rx + 1.4, 0.006, rz - 1.05], [rx - 1.4, 0.006, rz - 1.05], [1, 1, 1]);
  }
  { const [x0, z0, w, d] = CABIN_THING.sofa.box, frame = wood(tone(LOG, 1.1), 0.14), back = x0 + w - 0.1;      // it faces the fire (towards -x)
    for (const [px, pz] of [[x0 + 0.08, z0 + 0.08], [x0 + 0.08, z0 + d - 0.08], [back, z0 + 0.08], [back, z0 + d - 0.08]]) solid.cyl(px, 0, pz, 0.07, 0.62, frame, 10);
    for (const s of [0, 1]) { const z = s ? z0 + d - 0.08 : z0 + 0.08; solid.rod(x0 + 0.02, 0.64, z, back + 0.06, 0.64, z, 0.075, frame, 10); }       // the arms
    solid.rod(back, 0.95, z0 + 0.05, back, 0.95, z0 + d - 0.05, 0.08, frame, 10); solid.rod(x0 + 0.08, 0.22, z0 + 0.08, x0 + 0.08, 0.22, z0 + d - 0.08, 0.05, frame, 8);
    for (let i = 0; i < 2; i++) { const z = z0 + 0.12 + (i + 0.5) * (d - 0.24) / 2; solid.box(x0 + w / 2 - 0.05, 0.42, z, w - 0.25, 0.16, (d - 0.24) / 2 - 0.03, LEATHER); solid.box(back - 0.16, 0.68, z, 0.22, 0.5, (d - 0.24) / 2 - 0.05, tone(LEATHER, 0.92), 0, 0, -0.12); }
    for (const [dz, ang] of [[0.28, 0.3], [d - 0.3, -0.25]]) plaidB.add(new THREE.BoxGeometry(0.14, 0.4, 0.4), at(back - 0.3, 0.72, z0 + dz, 0, ang, -0.25), [1, 1, 1], 0.35);       // two plaid pillows
  }
  { const [x0, z0, w, d] = CABIN_THING.chair.box, cx = x0 + w / 2, cz = z0 + d / 2, a = CABIN_THING.chair.sit[2], L = LEATHER;      // a leather armchair, turned towards the fire
    const ca = Math.cos(a), sa = Math.sin(a), part = (lx, ly, lz, bw, bh, bd, col) => solid.box(cx + lx * ca + lz * sa, ly, cz - lx * sa + lz * ca, bw, bh, bd, col, 0, a, 0);
    part(0, 0.26, 0, w - 0.1, 0.32, d - 0.1, tone(L, 0.9)); part(0, 0.47, 0.03, w - 0.3, 0.12, d - 0.25, L);
    part(0, 0.75, -d / 2 + 0.14, w - 0.12, 0.62, 0.2, tone(L, 0.95)); for (const s2 of [-1, 1]) part(s2 * (w / 2 - 0.1), 0.58, 0.02, 0.18, 0.3, d - 0.2, tone(L, 0.85));
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) part(sx * (w / 2 - 0.12), 0.05, sz * (d / 2 - 0.12), 0.07, 0.1, 0.07, wood(DARK));
  }
  { const [x0, z0, w, d] = CABIN_THING.table.box, cx = x0 + w / 2, cz = z0 + d / 2, slab = wood([0.55, 0.33, 0.15], 0.2);      // a table of a log slab
    solid.cyl(cx, 0.38, cz, w / 2, 0.08, slab, 16); for (let i = 0; i < 3; i++) { const a = i / 3 * 6.283; solid.rod(cx + Math.cos(a) * 0.28, 0, cz + Math.sin(a) * 0.28, cx + Math.cos(a) * 0.18, 0.38, cz + Math.sin(a) * 0.18, 0.035, wood(DARK), 6); }
    solid.cyl(cx + 0.12, 0.46, cz - 0.1, 0.045, 0.1, [0.85, 0.82, 0.76], 10); solid.box(cx - 0.12, 0.475, cz + 0.12, 0.2, 0.04, 0.26, [0.45, 0.12, 0.1]);       // a mug and a book
    solid.cyl(cx - 0.05, 0.46, cz - 0.15, 0.03, 0.08, CREAM, 8); glow.ball(cx - 0.05, 0.57, cz - 0.15, 0.018, [3, 1.8, 0.6], 1, 1.6, 1, 6);       // a candle
  }
  { const [x0, z0, w, d] = CABIN_THING.lamp.box, cx = x0 + w / 2, cz = z0 + d / 2;           // a floor lamp of a crooked branch
    solid.cyl(cx, 0, cz, 0.16, 0.05, IRON, 10); solid.rod(cx, 0.05, cz, cx + 0.04, 0.8, cz - 0.03, 0.03, wood(LOG), 6); solid.rod(cx + 0.04, 0.8, cz - 0.03, cx, 1.45, cz, 0.028, wood(LOG), 6);
    glow.cyl(cx, 1.38, cz, 0.24, 0.3, [2.1, 1.5, 0.85], 14, 0.14); live.floorLamp = [cx, 1.5, cz];
  }
  { const [x0, z0, w, d] = CABIN_THING.shelf.box, h = CABIN_THING.shelf.h, x1 = x0 + w;      // a shelf of books by the fire
    solid.box(x0 + w / 2, h / 2, z0 + 0.03, w, h, 0.06, wood(PINE)); solid.box(x0 + w / 2, h / 2, z0 + d - 0.03, w, h, 0.06, wood(PINE)); solid.box(x0 + 0.03, h / 2, z0 + d / 2, 0.06, h, d, wood(tone(PINE, 0.8)));
    for (let k = 0; k < 4; k++) {
      const y = 0.05 + k * h / 4; solid.box(x0 + w / 2, y, z0 + d / 2, w, 0.04, d, wood(PINE));
      let z = z0 + 0.1;
      while (z < z0 + d - 0.18) { const bw = 0.04 + rnd() * 0.05, bh = 0.2 + rnd() * 0.14, c = [[0.45, 0.12, 0.1], [0.15, 0.25, 0.4], [0.2, 0.35, 0.2], [0.7, 0.55, 0.3], [0.3, 0.2, 0.15]][Math.floor(rnd() * 5)]; if (k === 3 && z > z0 + d / 2) break; solid.box(x1 - 0.2, y + 0.02 + bh / 2, z + bw / 2, 0.28, bh, bw, c); z += bw + 0.005; }
    }
    solid.box(x1 - 0.2, h - 0.35, z0 + d - 0.32, 0.16, 0.24, 0.16, IRON); glow.box(x1 - 0.2, h - 0.35, z0 + d - 0.32, 0.12, 0.17, 0.12, [2.4, 1.5, 0.6]);       // a lantern
  }
  // ---------- on the walls: antlers over the door, snowshoes over the bed, coats by the door ----------
  { const x = ix1 - 0.04, z = CABIN.door.y, y = dh + 0.85, bone = [0.86, 0.8, 0.66];
    solid.box(x, y, z, 0.05, 0.38, 0.34, wood(DARK));
    for (const sd of [-1, 1]) {
      const pts = [[0, 0.04], [0.15, 0.3], [0.1, 0.58], [0.28, 0.82]];
      for (let i = 0; i < 3; i++) solid.rod(x - 0.04, y + 0.05 + pts[i][1] * 0.8, z + sd * (0.07 + pts[i][0]), x - 0.06, y + 0.05 + pts[i + 1][1] * 0.8, z + sd * (0.07 + pts[i + 1][0]), 0.025 - i * 0.004, bone, 5);
      solid.rod(x - 0.05, y + 0.05 + pts[1][1] * 0.8, z + sd * 0.22, x - 0.07, y + 0.4, z + sd * 0.4, 0.016, bone, 5);
    }
  }
  { const z = iz0 + 0.05, cx = CABIN_THING.bed.box[0] + CABIN_THING.bed.box[2] / 2;
    for (const s of [-1, 1]) {
      const g = new THREE.TorusGeometry(0.22, 0.02, 5, 18); g.scale(1, 1.9, 1);
      solid.add(g, at(cx + s * 0.13, 2.05, z, 0, 0, s * 0.35), wood([0.5, 0.32, 0.14]));
      for (let i = -2; i <= 2; i++) solid.box(cx + s * 0.13 + i * 0.06 * Math.cos(s * 0.35), 2.05 + i * 0.06 * Math.sin(s * 0.35), z, 0.012, 0.6, 0.012, [0.8, 0.72, 0.55], 0, 0, s * 0.35);
    }
  }
  { const x = ix1 - 0.05, z = CABIN.door.y + 0.95;
    solid.box(x, 1.75, z, 0.04, 0.08, 0.6, wood(DARK)); for (const dz of [-0.2, 0, 0.2]) solid.rod(x, 1.75, z + dz, x - 0.1, 1.79, z + dz, 0.015, IRON, 4);
    solid.box(x - 0.08, 1.38, z - 0.2, 0.1, 0.62, 0.3, [0.45, 0.32, 0.18]); solid.box(x - 0.08, 1.45, z + 0.2, 0.06, 0.55, 0.14, [0.6, 0.1, 0.1]);       // a coat and a scarf
  }
  // ---------- light from the roof: an iron ring with candles ----------
  { const x = (ix0 + ix1) / 2 + 0.6, z = MID, y = H + 0.35, r = 0.45;
    high.add(new THREE.TorusGeometry(r, 0.025, 5, 24), at(x, y, z, Math.PI / 2, 0, 0), IRON);
    for (let k = 0; k < 6; k++) { const a = k / 6 * 6.283; high.cyl(x + Math.cos(a) * r, y, z + Math.sin(a) * r, 0.03, 0.12, CREAM, 6); highGlowBall(x + Math.cos(a) * r, y + 0.18, z + Math.sin(a) * r); }
    for (let k = 0; k < 3; k++) { const a = k / 3 * 6.283; high.rod(x + Math.cos(a) * r, y, z + Math.sin(a) * r, x, R - 0.4, z, 0.008, IRON, 3); }
    live.ceilLamp = [x, y + 0.2, z];
  }
  function highGlowBall(x, y, z) { glowHigh.ball(x, y, z, 0.03, [3, 1.9, 0.7], 1, 1.7, 1, 6); }

  // ---------- into meshes ----------
  const lambert = o => new THREE.MeshLambertMaterial(Object.assign({ vertexColors: true }, o)), basic = o => new THREE.MeshBasicMaterial(Object.assign({ vertexColors: true }, o));
  const solidMat = lambert(), glowMat = basic(), mats = [solidMat, glowMat], pics = [logs, floorPic, boardsPic, stonePic, rugPic, plaidPic, paintingPic];
  const mk = (B, mat, parent, name) => { if (!mats.includes(mat)) mats.push(mat); return B.mesh(mat, parent, name); };
  const meshes = [mk(solid, solidMat, inside, 'things'), mk(glow, glowMat, inside, 'lights'), mk(logsB, lambert({ map: logs }), inside, 'logs'), mk(floorB, lambert({ map: floorPic }), inside, 'floor'),
    mk(stoneB, lambert({ map: stonePic }), inside, 'stones'), mk(rugB, lambert({ map: rugPic }), inside, 'rug'), mk(plaidB, lambert({ map: plaidPic }), inside, 'plaid'), mk(paintB, lambert({ map: paintingPic }), inside, 'painting'),
    mk(boardsB, lambert({ map: boardsPic }), upper, 'roof'), mk(high, solidMat, upper, 'beams'), mk(glowHigh, glowMat, upper, 'candles')];
  // the covers over whoever sleeps in the bed
  const covers = live.covers.B.mesh(solidMat, inside, 'covers'); covers.matrixAutoUpdate = true; covers.position.set(...live.covers.at); covers.visible = false; meshes.push(covers);
  // the flames: a few glowing tongues that sway and flicker
  const flames = [];
  for (let i = 0; i < 5; i++) {
    const g = new THREE.ConeGeometry(0.07 + rnd() * 0.04, 0.32 + rnd() * 0.18, 7), m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.45 + rnd() * 0.25, 0.08), transparent: true, opacity: 0.85, depthWrite: false }));
    m.position.set(live.fire[0] - 0.05 + rnd() * 0.08, 0.38, live.fire[2] - 0.25 + i * 0.12); inside.add(m); flames.push({ m, s: rnd() * 6, k: 0.8 + rnd() * 0.4 }); meshes.push(m);
  }
  // the carved board over the door with one's name: "Sørens hytte"
  const signC = document.createElement('canvas'); signC.width = 512; signC.height = 96;
  const signT = new THREE.CanvasTexture(signC); signT.colorSpace = THREE.SRGBColorSpace;
  const signM = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.28), new THREE.MeshLambertMaterial({ map: signT })); signM.position.set(...live.sign); signM.rotation.y = -Math.PI / 2; inside.add(signM); meshes.push(signM);
  function setOwner(name) {
    const g = signC.getContext('2d'), n = String(name || '').trim();
    g.fillStyle = '#7a4a22'; g.fillRect(0, 0, 512, 96);
    for (let i = 0; i < 30; i++) { g.fillStyle = 'rgba(' + (i % 2 ? '60,30,10' : '170,110,60') + ',.18)'; g.fillRect((i * 97) % 512, (i * 37) % 96, 120, 2); }
    g.strokeStyle = '#3d220e'; g.lineWidth = 6; g.strokeRect(3, 3, 506, 90);
    const text = (n ? n + (/[sxz]$/i.test(n) ? "' " : 's ') : '') + 'hytte';
    g.font = '700 52px Fredoka, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    let size = 52; while (g.measureText(text).width > 470 && size > 24) { size -= 2; g.font = '700 ' + size + 'px Fredoka, system-ui, sans-serif'; }
    g.fillStyle = 'rgba(255,230,190,.35)'; g.fillText(text, 257, 51); g.fillStyle = '#2e1808'; g.fillText(text, 256, 49);
    signT.needsUpdate = true;
  }
  setOwner('');

  return {
    group: inside, upper,
    // where the lights of the room go when one is here (room3d.js moves the saloon's lamps here): [x, y, z, colour, strength, reach]
    lights: [[live.fire[0] + 0.3, 0.8, live.fire[2], 0xff8a3a, 14, 9], [live.ceilLamp[0], live.ceilLamp[1] - 0.3, live.ceilLamp[2], 0xffc27a, 10, 10], [live.floorLamp[0] - 0.2, live.floorLamp[1], live.floorLamp[2] - 0.3, 0xffcf8a, 6, 7]],
    fire: live.fire, roofY,
    setOwner,
    sleeping(on) { covers.visible = !!on; },
    tick(dt, t) {
      for (const f of flames) { const k = f.k * (0.75 + 0.25 * Math.sin(t * 9 + f.s) + 0.12 * Math.sin(t * 23 + f.s * 2)); f.m.scale.set(1, k, 1); f.m.position.y = 0.3 + 0.16 * k; f.m.rotation.z = Math.sin(t * 3.1 + f.s) * 0.18; f.m.rotation.x = Math.sin(t * 2.3 + f.s) * 0.12; }
    },
    // how bright the fire is now (for its light): 0.7 to 1.15
    flicker: t => 0.9 + 0.15 * Math.sin(t * 7.3) + 0.08 * Math.sin(t * 17.1 + 1) + 0.05 * Math.sin(t * 31.7 + 2),
    dispose() { for (const m of meshes) m.geometry.dispose(); for (const m of mats) m.dispose(); for (const f of flames) f.m.material.dispose(); signM.material.dispose(); signT.dispose(); for (const p of pics) p.dispose(); },
  };
}
