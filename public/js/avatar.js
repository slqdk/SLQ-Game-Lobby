// Draws avatars: a small cartoon figure built from a "look" (see shared/defs.js). Everything is shapes on a 2D
// canvas, no pictures. The figure stands with its feet at (0, 0), is about 100 units tall and faces the viewer;
// the caller moves and scales the canvas first.
import { LOOK, DRINKS } from '../shared/defs.js';

export const INK = '#2b2233';
const TAU = Math.PI * 2;

// ---------- colour and shape helpers ----------
const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
export function mix(a, b, t) {
  const x = hex(a), y = hex(b);
  return 'rgb(' + x.map((v, i) => Math.round(v + (y[i] - v) * t)).join(',') + ')';
}
export const darker = (h, t = 0.2) => mix(h, '#1a1024', t);
export const lighter = (h, t = 0.2) => mix(h, '#ffffff', t);

const paint = (c, col, lw = 2.2) => { c.fillStyle = col; c.fill(); if (lw) { c.lineWidth = lw; c.strokeStyle = INK; c.stroke(); } };
const ell = (c, x, y, rx, ry, rot = 0) => { c.beginPath(); c.ellipse(x, y, rx, ry, rot, 0, TAU); };
const rrect = (c, x, y, w, h, r) => { c.beginPath(); c.roundRect(x, y, w, h, r); };
const poly = (c, pts) => { c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.closePath(); };
// a thick line with a dark edge: arms and legs
function limb(c, x0, y0, x1, y1, w, col) {
  c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1);
  c.lineWidth = w + 4; c.strokeStyle = INK; c.stroke();
  c.lineWidth = w; c.strokeStyle = col; c.stroke();
}
function star(c, x, y, r, n = 5, inner = 0.45, rot = -Math.PI / 2) {
  c.beginPath();
  for (let i = 0; i < n * 2; i++) { const a = rot + i * Math.PI / n, q = i % 2 ? r * inner : r; c.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q); }
  c.closePath();
}
function heart(c, x, y, r) {
  c.beginPath(); c.moveTo(x, y + r * 0.9);
  c.bezierCurveTo(x - r * 1.5, y - r * 0.2, x - r * 0.7, y - r * 1.25, x, y - r * 0.45);
  c.bezierCurveTo(x + r * 0.7, y - r * 1.25, x + r * 1.5, y - r * 0.2, x, y + r * 0.9);
  c.closePath();
}

function colours(look) {
  const g = (k, i) => LOOK[k][i] || LOOK[k][0];
  return { skin: g('skin', look.skin), hair: g('hairCol', look.hairCol), top: g('topCol', look.topCol), bottom: g('bottomCol', look.bottomCol), shoe: g('shoeCol', look.shoeCol) };
}

// ---------- pose ----------
// st: t (clock, seconds) · walk 0..1 and phase · dir -1..1 (looking left/right) · sit · emote and et (seconds into it)
//     drink (key), fill 0..1, sip 0..1 · buzz 0..6 · talk 0..1 · fx { tomato, pie, snow, water, banana, feather, fart,
//     cloud, chicken, confetti, hug: seconds since it started } · seed (so two avatars do not breathe in step)
function pose(st) {
  const t = st.t || 0, seed = st.seed || 0, w = st.walk || 0, e = st.emote || '', et = st.et || 0, fx = st.fx || {};
  const p = { bob: 0, lean: 0, jump: 0, tilt: 0, face: 'normal', fo: (st.dir || 0) * 2.6, al: 0.14, ar: 0.14, hl: null, hr: null,
    liftL: 0, liftR: 0, shake: 0, spin: 0, lie: 0 };
  if (w > 0.01) {
    const s = Math.sin(st.phase || 0);
    p.liftL = Math.max(0, s) * 5.5 * w; p.liftR = Math.max(0, -s) * 5.5 * w;
    p.bob = Math.abs(s) * 1.5 * w; p.lean = ((st.dir || 0) * 0.05 + s * 0.03) * w;
    p.al = 0.14 + s * 0.3 * w; p.ar = 0.14 - s * 0.3 * w;
  } else p.bob = Math.sin(t * 2.2 + seed) * 0.6;
  if (e === 'wave') { p.ar = 2.5 + Math.sin(et * 11) * 0.32; p.face = 'happy'; }
  else if (e === 'dance') {
    const s = Math.sin(et * 8);
    p.bob = Math.abs(s) * 4; p.lean = Math.sin(et * 4) * 0.13; p.al = 2.0 + s * 0.7; p.ar = 2.0 - s * 0.7;
    p.liftL = Math.max(0, s) * 6; p.liftR = Math.max(0, -s) * 6; p.face = 'happy';
  } else if (e === 'laugh') { p.tilt = -0.1 + Math.sin(et * 22) * 0.03; p.bob = Math.abs(Math.sin(et * 18)) * 1.6; p.al = p.ar = 0.5; p.face = 'laugh'; }
  else if (e === 'cheer') { p.jump = Math.abs(Math.sin(et * 6.5)) * 9; p.al = p.ar = 2.75; p.face = 'happy'; }
  else if (e === 'cry') { p.tilt = 0.07; p.bob = Math.abs(Math.sin(et * 9)) * 0.9; p.hl = [-9, -66]; p.hr = [9, -66]; p.face = 'cry'; }
  else if (e === 'sleep') { p.tilt = 0.2; p.bob = Math.sin(et * 1.6) * 1.2; p.face = 'sleep'; }
  else if (e === 'cheers') { p.ar = 2.35 + Math.sin(et * 9) * 0.06; p.face = 'happy'; }
  // what others did to this one
  // asleep on the floor (a member who is not here): st.lie 0..1, st.lieDir -1 with the head to the left, 1 to the right
  if (st.lie) { p.lie = st.lie; if (st.lie > 0.6) p.face = 'sleep'; p.al = p.ar = 0.14 + 0.1 * st.lie; p.bob = Math.sin(t * 1.25 + seed) * 0.5 * st.lie; }
  if (fx.banana !== undefined) {
    const b = fx.banana;
    p.lie = b < 0.35 ? b / 0.35 : b < 3 ? 1 : Math.max(0, 1 - (b - 3) / 0.6);
    p.face = b < 3 ? 'dizzy' : 'shock'; p.al = p.ar = 1.3;
  }
  if (fx.feather !== undefined) { p.shake = Math.sin(t * 40) * 1.6; p.lean += Math.sin(t * 19) * 0.08; p.al = p.ar = 0.9 + Math.sin(t * 30) * 0.3; p.face = 'laugh'; }
  if (fx.fart !== undefined) { p.face = fx.fart < 0.5 ? 'shock' : 'shy'; if (fx.fart < 0.4) p.jump = Math.sin(fx.fart / 0.4 * Math.PI) * 5; }
  if (fx.snow !== undefined) { p.shake = Math.sin(t * 46) * 0.9; p.face = fx.snow < 1 ? 'shock' : 'sad'; }
  if (fx.water !== undefined) { p.face = fx.water < 1.2 ? 'shock' : 'sad'; if (fx.water > 1.2) p.shake = Math.sin(t * 40) * 0.5; }
  if (fx.tomato !== undefined) p.face = fx.tomato < 1 ? 'shock' : 'sad';
  if (fx.pie !== undefined) p.face = 'shock';
  if (fx.cloud !== undefined) p.face = 'sad';
  if (fx.confetti !== undefined || fx.hug !== undefined) p.face = 'happy';
  if (st.buzz >= 2) p.lean += Math.sin(t * 1.6 + seed) * 0.018 * Math.min(4, st.buzz);
  // a glass in the right hand, lifted to the mouth for a sip
  if (st.drink && !p.hr && e !== 'cheers') {
    const s = st.sip || 0;
    p.hr = [24 - 16 * s, -40 - 21 * s];
  }
  if (st.sit) { p.liftL = p.liftR = 0; }
  if (st.face) p.face = st.face;
  return p;
}

// ---------- the parts ----------
function drawBack(c, look, K, P) {
  if (look.back === 'cape') {
    const sway = Math.sin((P.t || 0) * 2) * 2;
    c.beginPath(); c.moveTo(-13, -52); c.quadraticCurveTo(-27, -30, -24 + sway, -6); c.lineTo(24 + sway, -6); c.quadraticCurveTo(27, -30, 13, -52); c.closePath();
    paint(c, '#c8323c');
  } else if (look.back === 'wings') {
    for (const s of [-1, 1]) {
      c.save(); c.scale(s, 1);
      const f = Math.sin((P.t || 0) * 3) * 0.08;
      c.translate(10, -46); c.rotate(-0.25 + f);
      c.beginPath(); c.moveTo(0, 0); c.bezierCurveTo(14, -26, 36, -24, 38, -8); c.bezierCurveTo(34, -4, 30, 0, 27, 3); c.bezierCurveTo(24, 6, 20, 9, 17, 11); c.bezierCurveTo(12, 13, 5, 10, 0, 6); c.closePath();
      paint(c, '#fbfaf5');
      c.beginPath(); c.moveTo(27, 3); c.quadraticCurveTo(22, -4, 14, -8); c.moveTo(17, 11); c.quadraticCurveTo(13, 3, 7, -1); c.lineWidth = 1.4; c.strokeStyle = '#c9c4d6'; c.stroke();
      c.restore();
    }
  } else if (look.back === 'pack') {
    rrect(c, -21, -54, 42, 31, 10); paint(c, '#4f7fd0');
  }
  // hair that hangs behind the head
  const hair = LOOK.hair[look.hair];
  c.save(); c.translate(0, -73 - P.bob); c.rotate(P.tilt); c.translate(P.shake, 0);
  if (hair === 'long') { c.beginPath(); c.moveTo(-23, -4); c.bezierCurveTo(-28, 14, -27, 30, -19, 33); c.lineTo(19, 33); c.bezierCurveTo(27, 30, 28, 14, 23, -4); c.closePath(); paint(c, K.hair); }
  else if (hair === 'bob') { c.beginPath(); c.moveTo(-23, -6); c.bezierCurveTo(-29, 6, -28, 17, -22, 19); c.lineTo(22, 19); c.bezierCurveTo(28, 17, 29, 6, 23, -6); c.closePath(); paint(c, K.hair); }
  else if (hair === 'pony') { c.beginPath(); c.moveTo(14, -14); c.bezierCurveTo(30, -22, 38, -6, 31, 10); c.bezierCurveTo(29, 15, 24, 14, 25, 8); c.bezierCurveTo(27, 0, 22, -6, 15, -6); c.closePath(); paint(c, K.hair); }
  else if (hair === 'curly') { for (const [x, y, r] of [[-21, -2, 9], [21, -2, 9], [-17, -14, 10], [17, -14, 10]]) { ell(c, x, y, r, r); paint(c, K.hair); } }
  if (look.top === 1) { ell(c, 0, 17, 19, 9); paint(c, darker(K.top, 0.12)); }       // the hood of a hoodie
  c.restore();
}

function drawLegs(c, look, K, P, sit) {
  const bottom = LOOK.bottom[look.bottom], legCol = bottom === 'skirt' ? K.skin : K.bottom;
  for (const s of [-1, 1]) {
    const lift = s < 0 ? P.liftL : P.liftR, hx = s * 7.5 * (P.bw || 1), hy = -27, feet = look.feet;
    let fx = s * 8, fy = -4 - lift;
    if (sit) { fx = s * 9.5; fy = -9; }                 // sitting: the legs hang down in front of the seat
    limb(c, hx, hy, fx, fy, 8.5, legCol);
    if (bottom === 'shorts') limb(c, hx + (fx - hx) * 0.52, hy + (fy - hy) * 0.52, fx, fy, 6.5, K.skin);
    // shoe
    c.save(); c.translate(fx, fy + 1);
    const boot = feet === 'boots' || feet === 'spurs';
    if (boot) { rrect(c, -4.8, -13, 9.6, 12, 2); paint(c, '#7a4a24', 1.8); }                      // the leg of the boot
    c.beginPath(); c.moveTo(-6.5, 4.5); c.quadraticCurveTo(-7.5, -3.5, -1, -4); c.quadraticCurveTo(s * 6 + 1.5, -4, s * 6 + 2, 1.5); c.quadraticCurveTo(s * 6 + 2, 4.5, s * 3, 4.5); c.closePath();
    paint(c, boot ? '#7a4a24' : feet === 'sneakers' ? '#fbfaf5' : K.shoe);
    c.beginPath(); c.moveTo(-6, 3.2); c.lineTo(s * 6 + 1.5, 3.2); c.lineWidth = 1.5; c.strokeStyle = feet === 'sneakers' ? '#d8443c' : 'rgba(255,255,255,.55)'; c.stroke();
    if (feet === 'spurs') { star(c, -s * 7.5, 1, 2.6, 6); paint(c, '#f5c542', 0.9); }
    c.restore();
  }
  if (bottom === 'skirt') {
    c.beginPath(); c.moveTo(-13, -33); c.lineTo(13, -33); c.lineTo(18.5, -15.5); c.quadraticCurveTo(0, -11.5, -18.5, -15.5); c.closePath();
    paint(c, K.bottom);
  }
}

function drawTorso(c, look, K, P) {
  const top = LOOK.top[look.top];
  c.save(); c.scale(P.bw || 1, 1);
  c.beginPath(); c.moveTo(-14.5, -46); c.quadraticCurveTo(-14.5, -54.5, -6, -54.5); c.lineTo(6, -54.5); c.quadraticCurveTo(14.5, -54.5, 14.5, -46);
  if (P.fem) { c.quadraticCurveTo(9.5, -37.5, 13.8, -28); c.quadraticCurveTo(13.8, -24, 9, -24); c.lineTo(-9, -24); c.quadraticCurveTo(-13.8, -24, -13.8, -28); c.quadraticCurveTo(-9.5, -37.5, -14.5, -46); }
  else { c.lineTo(13.5, -28); c.quadraticCurveTo(13.5, -24, 9, -24); c.lineTo(-9, -24); c.quadraticCurveTo(-13.5, -24, -13.5, -28); }
  c.closePath();
  paint(c, K.top);
  c.save(); c.clip();
  if (top === 'stripes') { c.fillStyle = lighter(K.top, 0.62); for (const y of [-47, -39.5, -32]) c.fillRect(-16, y, 32, 3.4); }
  else if (top === 'shirt') {
    c.fillStyle = lighter(K.top, 0.3); c.fillRect(-1.6, -54, 3.2, 31);
    c.fillStyle = INK; for (const y of [-45, -38, -31]) { ell(c, 0, y, 1.1, 1.1); c.fill(); }
  } else if (top === 'hoodie') {
    rrect(c, -8.5, -34, 17, 9, 3.5); c.lineWidth = 1.6; c.strokeStyle = darker(K.top, 0.3); c.stroke();
    c.beginPath(); c.moveTo(-3.2, -54); c.lineTo(-3.2, -44); c.moveTo(3.2, -54); c.lineTo(3.2, -44); c.lineWidth = 1.5; c.strokeStyle = lighter(K.top, 0.6); c.stroke();
  }
  if (LOOK.bottom[look.bottom] !== 'skirt') { c.fillStyle = K.bottom; c.fillRect(-16, -29, 32, 8); c.fillStyle = INK; c.fillRect(-16, -29.9, 32, 1.4); }
  c.restore();
  if (top === 'shirt') { for (const s of [-1, 1]) { poly(c, [[0, -50], [s * 8.5, -55.5], [s * 6.5, -47]]); paint(c, lighter(K.top, 0.35), 1.6); } }
  if (look.back === 'pack') { for (const s of [-1, 1]) { c.beginPath(); c.moveTo(s * 9, -54); c.lineTo(s * 11, -30); c.lineWidth = 3.4; c.strokeStyle = INK; c.stroke(); c.lineWidth = 1.8; c.strokeStyle = '#3a63ad'; c.stroke(); } }
  // from the clothes shop, worn over it
  const over = look.over, cloth = { vest: '#7a4a24', sheriff: '#2a2630', ...COATS }[over];
  if (cloth) {
    if (over === 'tux') { poly(c, [[-4.5, -54], [4.5, -54], [3, -27], [-3, -27]]); paint(c, '#fbfaf5', 1.2); for (const s of [-1, 1]) { poly(c, [[0, -52], [s * 5, -54.5], [s * 5, -49.5]]); paint(c, INK, 0); } }
    for (const s of [-1, 1]) { poly(c, [[s * 3.6, -54.5], [s * 13.6, -53.5], [s * 14.3, -46], [s * 13.2, -26.5], [s * 5.2, -26.5]]); paint(c, cloth, 1.8); }
    if (over === 'duster') for (const s of [-1, 1]) { poly(c, [[s * 5.5, -27.5], [s * 13.5, -27.5], [s * 16, -9.5], [s * 7.5, -9.5]]); paint(c, cloth, 1.8); }
    if (over === 'sheriff') { star(c, 8.5, -44.5, 3.4); paint(c, '#f5c542', 1.1); }
    if (over === 'leather') { c.beginPath(); c.moveTo(-5, -50); c.lineTo(-5, -28); c.moveTo(5, -50); c.lineTo(5, -28); c.lineWidth = 1.2; c.strokeStyle = '#2e1a0e'; c.stroke(); }
  } else if (over === 'poncho') {
    poly(c, [[-7, -55.5], [7, -55.5], [22, -33], [0, -21], [-22, -33]]); paint(c, '#d8743a');
    c.save(); c.clip(); c.lineWidth = 2.6; for (const [d, col] of [[7, '#f5c542'], [13, '#3a7fd0'], [19, '#fbfaf5']]) { c.beginPath(); c.moveTo(-22 - d, -33 + d * 0.3); c.lineTo(0, -21 - d); c.lineTo(22 + d, -33 + d * 0.3); c.strokeStyle = col; c.stroke(); } c.restore();
  }
  c.restore();
}

function hands(P) {
  const w = 14.5 * (P.bw || 1), hl = P.hl || [-w - Math.sin(P.al) * 21, -49 + Math.cos(P.al) * 21], hr = P.hr || [w + Math.sin(P.ar) * 21, -49 + Math.cos(P.ar) * 21];
  return [hl, hr];
}
const COATS = { leather: '#5a3620', duster: '#c2aa80', tux: '#2a2630' };          // what has sleeves, and its colour
function drawArm(c, look, K, s, hand, bw = 1) {
  const top = LOOK.top[look.top], sx = s * 14 * bw, sy = -49.5, coat = COATS[look.over], long = !!coat || top === 'hoodie' || top === 'shirt';
  if (coat) K = { ...K, top: coat };
  limb(c, sx, sy, hand[0], hand[1], 7, long ? K.top : K.skin);
  if (!long) limb(c, sx, sy, sx + (hand[0] - sx) * 0.42, sy + (hand[1] - sy) * 0.42, 8, K.top);
  ell(c, hand[0], hand[1], 4.4, 4.4); paint(c, K.skin, 2);
}

function drawNeck(c, look) {
  if (look.neck === 'scarf') {
    rrect(c, -13, -57.5, 26, 8, 4); paint(c, '#d8443c');
    rrect(c, 4, -52, 8, 17, 3); paint(c, '#d8443c');
    c.fillStyle = '#f4e2c0'; c.fillRect(5, -41, 6, 2); c.fillRect(-9, -55, 3, 4); c.fillRect(-1, -55, 3, 4);
  } else if (look.neck === 'bowtie') {
    for (const s of [-1, 1]) { poly(c, [[0, -51], [s * 9, -56], [s * 9, -46]]); paint(c, '#c8323c', 1.8); }
    ell(c, 0, -51, 2.6, 2.6); paint(c, '#a3262d', 1.6);
  } else if (look.neck === 'chain') {
    c.beginPath(); c.moveTo(-10, -54); c.quadraticCurveTo(0, -38, 10, -54); c.lineWidth = 4.2; c.strokeStyle = INK; c.stroke(); c.lineWidth = 2.2; c.strokeStyle = '#f5c542'; c.stroke();
    ell(c, 0, -44.5, 3.4, 3.4); paint(c, '#f5c542', 1.6);
  } else if (look.neck === 'bandana') {
    rrect(c, -12, -57.5, 24, 6, 3); paint(c, '#c8323c'); poly(c, [[-9, -53], [9, -53], [0, -42]]); paint(c, '#c8323c');
    c.fillStyle = '#fbfaf5'; for (const [x, y] of [[-3, -50], [3, -50], [0, -46.5]]) { ell(c, x, y, 0.9, 0.9); c.fill(); }
  } else if (look.neck === 'bolo') {
    c.beginPath(); c.moveTo(-5, -55); c.lineTo(-1.5, -50); c.lineTo(-2.5, -37); c.moveTo(5, -55); c.lineTo(1.5, -50); c.lineTo(2.5, -37); c.lineWidth = 1.5; c.strokeStyle = INK; c.stroke();
    ell(c, 0, -50, 2.8, 3.2); paint(c, '#2fb8a8', 1.4);
  } else if (look.back === 'cape') { ell(c, 0, -53, 3.2, 3.2); paint(c, '#f5c542', 1.6); }
}

function drawFace(c, look, K, P, st) {
  const t = st.t || 0, fo = P.fo, face = P.face, fx = st.fx || {};
  const blink = ((t + (st.seed || 0) * 1.7) % 4.1) < 0.13;
  const style = LOOK.eyes[look.eyes], ey = 0;
  // cheeks
  const blush = face === 'shy' ? 0.75 : 0.28 + Math.min(0.45, (st.buzz || 0) * 0.11);
  c.fillStyle = 'rgba(240,96,110,' + blush + ')';
  for (const s of [-1, 1]) { ell(c, fo + s * 13.5, 6.5, 4.6, 3); c.fill(); }
  // eyes
  c.lineWidth = 2.1; c.strokeStyle = INK; c.fillStyle = INK;
  const sleepy = (st.buzz || 0) >= 4;
  for (const s of [-1, 1]) {
    const x = fo + s * 8.2, y = ey;
    if (face === 'laugh' || face === 'cry') { c.beginPath(); c.moveTo(x - 3.6 * s, y - 2.6); c.lineTo(x + 2.2 * s, y); c.lineTo(x - 3.6 * s, y + 2.6); c.stroke(); }
    else if (face === 'sleep' || blink) { c.beginPath(); c.moveTo(x - 3.4, y + 0.6); c.quadraticCurveTo(x, y + 2.6, x + 3.4, y + 0.6); c.stroke(); }
    else if (face === 'dizzy') { c.beginPath(); c.moveTo(x - 3, y - 3); c.lineTo(x + 3, y + 3); c.moveTo(x + 3, y - 3); c.lineTo(x - 3, y + 3); c.stroke(); }
    else if (face === 'happy' || style === 'happy') { c.beginPath(); c.moveTo(x - 3.6, y + 1.4); c.quadraticCurveTo(x, y - 4.4, x + 3.6, y + 1.4); c.stroke(); }
    else if (face === 'shock') { ell(c, x, y, 4.4, 4.8); c.fillStyle = '#fff'; c.fill(); c.stroke(); ell(c, x, y, 1.9, 1.9); c.fillStyle = INK; c.fill(); }
    else if (style === 'round') {
      ell(c, x, y, 4.2, 4.5); c.fillStyle = '#fff'; c.fill(); c.lineWidth = 1.7; c.stroke(); c.lineWidth = 2.1;
      ell(c, x + fo * 0.25 + (face === 'shy' ? s * -1.2 : 0), y + 0.4, 2.3, 2.5); c.fillStyle = INK; c.fill();
      ell(c, x + fo * 0.25 + 0.9, y - 0.7, 0.8, 0.8); c.fillStyle = '#fff'; c.fill(); c.fillStyle = INK;
    } else if (style === 'sleepy' || sleepy) {
      ell(c, x, y + 0.6, 3, 2.8); c.fill();
      c.beginPath(); c.moveTo(x - 4.4, y - 0.6); c.lineTo(x + 4.4, y - 0.6); c.lineWidth = 2.4; c.stroke(); c.lineWidth = 2.1;
    } else { ell(c, x, y, 2.7, 3); c.fill(); ell(c, x + 0.9, y - 1, 0.8, 0.8); c.fillStyle = '#fff'; c.fill(); c.fillStyle = INK; }
    if (P.fem && face !== 'laugh' && face !== 'cry') { c.beginPath(); c.moveTo(x + s * 3.2, y - 2.2); c.lineTo(x + s * 5.6, y - 3.8); c.lineWidth = 1.5; c.stroke(); c.lineWidth = 2.1; }      // lashes
    // brows
    const by = y - 7.4 - (face === 'shock' ? 1.8 : 0), slope = face === 'sad' || face === 'cry' || face === 'shy' ? -1.8 : face === 'dizzy' ? 1.2 : 0;
    c.beginPath(); c.moveTo(x - 3.6 * s, by - slope); c.lineTo(x + 3.2 * s, by + slope * 0.4);
    c.lineWidth = 1.9; c.strokeStyle = look.hair === 0 ? INK : darker(K.hair, 0.45); c.stroke(); c.strokeStyle = INK; c.lineWidth = 2.1;
  }
  // beard under the mouth
  const beard = LOOK.beard[look.beard];
  if (beard === 'full') { c.beginPath(); c.moveTo(-19.5, 2); c.quadraticCurveTo(-19, 21, 0, 22.5); c.quadraticCurveTo(19, 21, 19.5, 2); c.quadraticCurveTo(12, 9, fo, 6.5); c.quadraticCurveTo(-12, 9, -19.5, 2); c.closePath(); paint(c, K.hair, 1.8); }
  else if (beard === 'stubble') { c.beginPath(); c.moveTo(-17, 8); c.quadraticCurveTo(-13, 19.5, 0, 20.2); c.quadraticCurveTo(13, 19.5, 17, 8); c.quadraticCurveTo(0, 15, -17, 8); c.closePath(); c.fillStyle = 'rgba(60,45,60,.22)'; c.fill(); }
  // mouth
  const mx = fo, my = 11.2, talk = st.talk || 0;
  c.lineWidth = 2; c.strokeStyle = INK;
  if (face === 'laugh' || face === 'happy' && !talk) {
    const w = face === 'laugh' ? 7 : 5.6, h = face === 'laugh' ? 7 : 4.6;
    c.beginPath(); c.moveTo(mx - w, my - 1.5); c.quadraticCurveTo(mx, my + h * 1.9, mx + w, my - 1.5); c.closePath(); paint(c, '#7a2233', 1.8);
    c.save(); c.clip(); ell(c, mx, my + h + 1, w * 0.7, h * 0.6); c.fillStyle = '#f0808a'; c.fill(); c.restore();
  } else if (face === 'shock' || face === 'sleep') { ell(c, mx, my + 1, face === 'sleep' ? 2 : 3.2, face === 'sleep' ? 2.4 : 4); paint(c, '#7a2233', 1.8); }
  else if (face === 'sad' || face === 'cry' || face === 'dizzy') { c.beginPath(); c.moveTo(mx - 4.6, my + 2.4); c.quadraticCurveTo(mx, my - 2.4, mx + 4.6, my + 2.4); c.stroke(); }
  else if (face === 'shy') { c.beginPath(); c.moveTo(mx - 4, my + 0.5); c.quadraticCurveTo(mx - 2, my + 2, mx, my + 0.5); c.quadraticCurveTo(mx + 2, my - 1, mx + 4, my + 0.5); c.stroke(); }
  else if (talk) { ell(c, mx, my + 0.6, 3.4, 1.2 + Math.abs(Math.sin(t * 17)) * 3); paint(c, '#7a2233', 1.8); }
  else { c.beginPath(); c.moveTo(mx - 4.6, my - 0.6); c.quadraticCurveTo(mx, my + 3.6, mx + 4.6, my - 0.6); c.stroke(); }
  if (beard === 'mustache') { c.beginPath(); c.moveTo(mx, 6.2); c.bezierCurveTo(mx - 3, 3.4, mx - 9, 5, mx - 10.5, 9.5); c.bezierCurveTo(mx - 6, 8.6, mx - 3, 9, mx, 7.6); c.bezierCurveTo(mx + 3, 9, mx + 6, 8.6, mx + 10.5, 9.5); c.bezierCurveTo(mx + 9, 5, mx + 3, 3.4, mx, 6.2); c.closePath(); paint(c, K.hair, 1.6); }
  // tears
  if (face === 'cry') {
    c.fillStyle = '#6cc4f5';
    for (const s of [-1, 1]) for (let k = 0; k < 2; k++) { const u = (t * 1.3 + k * 0.5 + (s > 0 ? 0.25 : 0)) % 1; c.globalAlpha = 1 - u; ell(c, fo + s * (9 + u * 3), 4 + u * 22, 1.9, 2.8); c.fill(); }
    c.globalAlpha = 1;
  }
  void fx;
}

function drawHair(c, look, K) {
  const hair = LOOK.hair[look.hair], col = K.hair;
  if (hair === 'none') return;
  const cap = () => { c.beginPath(); c.moveTo(-21.5, -2); c.bezierCurveTo(-23.5, -30, 23.5, -30, 21.5, -2); };
  if (hair === 'short' || hair === 'pony' || hair === 'bun') {
    cap(); c.bezierCurveTo(17, -8, 12, -11.5, 3, -11); c.bezierCurveTo(-6, -10.5, -15, -9, -21.5, -2); c.closePath(); paint(c, col);
    if (hair === 'bun') { ell(c, 0, -25, 8, 7); paint(c, col); }
  } else if (hair === 'spiky') {
    c.beginPath(); c.moveTo(-21.5, -2); c.lineTo(-25, -15); c.lineTo(-17, -15.5); c.lineTo(-17, -28); c.lineTo(-8, -21); c.lineTo(-2, -32); c.lineTo(5, -21.5); c.lineTo(14, -29); c.lineTo(16, -17); c.lineTo(25, -17); c.lineTo(21.5, -2);
    c.bezierCurveTo(15, -8, 8, -10.5, 0, -8.5); c.bezierCurveTo(-8, -10.5, -15, -8, -21.5, -2); c.closePath(); paint(c, col);
  } else if (hair === 'side') {
    cap(); c.bezierCurveTo(20, -9, 14, -14, 9, -15); c.bezierCurveTo(2, -7, -12, -4.5, -21.5, -2); c.closePath(); paint(c, col);
    c.beginPath(); c.moveTo(9, -15); c.quadraticCurveTo(8, -21, 11, -24); c.lineWidth = 1.5; c.strokeStyle = darker(col, 0.35); c.stroke();
  } else if (hair === 'long') {
    cap(); c.lineTo(22.5, 6); c.bezierCurveTo(19, 1, 17, -6, 12, -10); c.bezierCurveTo(4, -6.5, -4, -6.5, -12, -10); c.bezierCurveTo(-17, -6, -19, 1, -22.5, 6); c.closePath(); paint(c, col);
  } else if (hair === 'bob') {
    cap(); c.lineTo(23, 8); c.bezierCurveTo(19.5, 5, 18.5, -3, 18, -7.5); c.lineTo(-18, -7.5); c.bezierCurveTo(-18.5, -3, -19.5, 5, -23, 8); c.closePath(); paint(c, col);
  } else if (hair === 'curly') {
    for (const [x, y, r] of [[-12, -19, 9.5], [12, -19, 9.5], [0, -23, 10.5], [-20, -9, 7], [20, -9, 7]]) { ell(c, x, y, r, r); paint(c, col); }
    c.beginPath(); c.moveTo(-18, -8); c.bezierCurveTo(-18, -26, 18, -26, 18, -8); c.bezierCurveTo(8, -13, -8, -13, -18, -8); c.closePath(); c.fillStyle = col; c.fill();
  }
}

function drawGlasses(c, look, P) {
  const g = look.glasses, fo = P.fo;
  if (g === 'round') {
    c.lineWidth = 1.9; c.strokeStyle = INK;
    for (const s of [-1, 1]) { ell(c, fo + s * 8.2, 0, 6, 6); c.fillStyle = 'rgba(190,225,255,.28)'; c.fill(); c.stroke(); }
    c.beginPath(); c.moveTo(fo - 2.2, -0.6); c.lineTo(fo + 2.2, -0.6); c.moveTo(fo - 14.2, -1); c.lineTo(-20.5, -2); c.moveTo(fo + 14.2, -1); c.lineTo(20.5, -2); c.stroke();
  } else if (g === 'shades') {
    for (const s of [-1, 1]) { rrect(c, fo + s * 8.4 - 6.6, -4.6, 13.2, 9.6, 3.6); paint(c, '#22202c', 1.8); c.beginPath(); c.moveTo(fo + s * 8.4 - 3.5, -2.4); c.lineTo(fo + s * 8.4 - 0.5, -2.4); c.lineWidth = 1.5; c.strokeStyle = 'rgba(255,255,255,.55)'; c.stroke(); }
    c.beginPath(); c.moveTo(fo - 2, -1.6); c.lineTo(fo + 2, -1.6); c.moveTo(fo - 15, -2); c.lineTo(-20.5, -3); c.moveTo(fo + 15, -2); c.lineTo(20.5, -3); c.lineWidth = 2; c.strokeStyle = INK; c.stroke();
  } else if (g === 'patch') {
    c.beginPath(); c.moveTo(-20, -9); c.lineTo(20.5, -5); c.lineWidth = 2; c.strokeStyle = INK; c.stroke();
    c.beginPath(); c.moveTo(fo + 2.5, -6); c.lineTo(fo + 15, -5); c.quadraticCurveTo(fo + 15, 5.5, fo + 8.5, 6); c.quadraticCurveTo(fo + 2.5, 5.5, fo + 2.5, -6); c.closePath(); paint(c, '#22202c', 1.8);
  } else if (g === 'monocle') {
    ell(c, fo + 8.2, 0, 6.4, 6.4); c.fillStyle = 'rgba(190,225,255,.3)'; c.fill(); c.lineWidth = 2.2; c.strokeStyle = '#d9a520'; c.stroke();
    c.beginPath(); c.moveTo(fo + 13.5, 3.5); c.quadraticCurveTo(21, 14, 17, 24); c.lineWidth = 1.2; c.stroke();
  }
}

// Hats sit on the head: (0, 0) is the middle of the head, its top is at about y = -20.
function drawHat(c, hat, t) {
  if (hat === 'party') {
    c.save(); c.rotate(0.22);
    poly(c, [[-9, -17.5], [9, -17.5], [0, -44]]); paint(c, '#3fb6e0');
    c.save(); c.clip(); c.strokeStyle = '#f5c542'; c.lineWidth = 3.4; for (let k = -1; k < 5; k++) { c.beginPath(); c.moveTo(-14, -18 - k * 7.5); c.lineTo(14, -24 - k * 7.5); c.stroke(); } c.restore();
    ell(c, 0, -45, 3.6, 3.6); paint(c, '#f25a8e', 1.8);
    c.restore();
  } else if (hat === 'cap') {
    c.beginPath(); c.moveTo(-21, -5); c.bezierCurveTo(-23, -30, 23, -30, 21, -5); c.quadraticCurveTo(0, -11, -21, -5); c.closePath(); paint(c, '#d8443c');
    c.beginPath(); c.moveTo(-17, -7.5); c.quadraticCurveTo(0, -13.5, 17, -7.5); c.quadraticCurveTo(22, -1.5, 14, -1.5); c.quadraticCurveTo(0, -6.5, -14, -1.5); c.quadraticCurveTo(-22, -1.5, -17, -7.5); c.closePath(); paint(c, '#a3262d');
    ell(c, 0, -26, 2.2, 1.6); paint(c, '#a3262d', 1.4);
  } else if (hat === 'beanie') {
    c.beginPath(); c.moveTo(-21, -7); c.bezierCurveTo(-22, -34, 22, -34, 21, -7); c.closePath(); paint(c, '#3f8fe0');
    rrect(c, -22.5, -11.5, 45, 8.5, 4); paint(c, '#f4f1ea');
    c.strokeStyle = 'rgba(43,34,51,.35)'; c.lineWidth = 1.2; for (let x = -18; x <= 18; x += 6) { c.beginPath(); c.moveTo(x, -10.5); c.lineTo(x, -4.5); c.stroke(); }
    ell(c, 0, -30, 5.2, 5.2); paint(c, '#f4f1ea', 1.8);
  } else if (hat === 'santa') {
    c.beginPath(); c.moveTo(-20, -8); c.bezierCurveTo(-18, -32, 2, -40, 16, -30); c.bezierCurveTo(26, -23, 30, -10, 28, -1); c.bezierCurveTo(22, -14, 20, -14, 20, -8); c.closePath(); paint(c, '#d8343c');
    rrect(c, -23, -12, 46, 8.5, 4.2); paint(c, '#fbfaf5');
    ell(c, 28.5, 0.5, 5, 5); paint(c, '#fbfaf5', 1.8);
  } else if (hat === 'chef') {
    for (const [x, y, r] of [[-11, -30, 10], [11, -30, 10], [0, -35, 11.5]]) { ell(c, x, y, r, r); paint(c, '#fbfaf5'); }
    rrect(c, -15, -27, 30, 19, 3); c.fillStyle = '#fbfaf5'; c.fill();
    rrect(c, -16.5, -17.5, 33, 10, 2.5); paint(c, '#fbfaf5');
  } else if (hat === 'cowboy') {
    c.beginPath(); c.moveTo(-33, -9); c.bezierCurveTo(-27, -3, -14, -8, 0, -8); c.bezierCurveTo(14, -8, 27, -3, 33, -9); c.bezierCurveTo(27, -16, 14, -13.5, 0, -13.5); c.bezierCurveTo(-14, -13.5, -27, -16, -33, -9); c.closePath(); paint(c, '#a8703c');
    c.beginPath(); c.moveTo(-15, -11.5); c.bezierCurveTo(-17, -32, -6, -31, 0, -27); c.bezierCurveTo(6, -31, 17, -32, 15, -11.5); c.quadraticCurveTo(0, -15, -15, -11.5); c.closePath(); paint(c, '#a8703c');
    c.beginPath(); c.moveTo(-15.3, -15.5); c.quadraticCurveTo(0, -19, 15.3, -15.5); c.lineWidth = 3; c.strokeStyle = '#5a3418'; c.stroke();
  } else if (hat === 'phones') {
    c.beginPath(); c.arc(0, -1, 23.5, Math.PI * 1.08, Math.PI * 1.92); c.lineWidth = 6.4; c.strokeStyle = INK; c.stroke(); c.lineWidth = 3.4; c.strokeStyle = '#3b3f52'; c.stroke();
    for (const s of [-1, 1]) { rrect(c, s * 22.5 - 5, -9, 10, 17, 4.5); paint(c, '#ef4f6a'); }
  } else if (hat === 'pirate') {
    c.beginPath(); c.moveTo(-31, -7.5); c.quadraticCurveTo(-21, -15, -15, -18); c.bezierCurveTo(-11, -36, 11, -36, 15, -18); c.quadraticCurveTo(21, -15, 31, -7.5); c.quadraticCurveTo(0, -17, -31, -7.5); c.closePath(); paint(c, '#2b2a36');
    c.beginPath(); c.moveTo(-28, -8.6); c.quadraticCurveTo(0, -17.2, 28, -8.6); c.lineWidth = 2; c.strokeStyle = '#f5c542'; c.stroke();
    ell(c, 0, -23.5, 4.4, 4.4); paint(c, '#f5c542', 1.6);
  } else if (hat === 'tophat') {
    ell(c, 0, -13, 26, 5.4); paint(c, '#2b2a36');
    rrect(c, -15.5, -43, 31, 30, 2.5); paint(c, '#2b2a36');
    c.fillStyle = '#c8323c'; c.fillRect(-14.4, -21.5, 28.8, 6);
    ell(c, 0, -43, 15.5, 3.6); paint(c, '#3d3b4c');
  } else if (hat === 'viking') {
    for (const s of [-1, 1]) { c.beginPath(); c.moveTo(s * 17, -15); c.bezierCurveTo(s * 30, -16, s * 34, -28, s * 29, -38); c.bezierCurveTo(s * 28, -28, s * 23, -24, s * 15, -24); c.closePath(); paint(c, '#f4ead2'); }
    c.beginPath(); c.moveTo(-21, -6); c.bezierCurveTo(-22, -34, 22, -34, 21, -6); c.closePath(); paint(c, '#a9b4c2');
    rrect(c, -22.5, -10.5, 45, 6.5, 2); paint(c, '#7d8794');
    rrect(c, -2.4, -29, 4.8, 20, 1.5); paint(c, '#7d8794', 1.6);
    for (const x of [-15, 15]) { ell(c, x, -7.2, 1.3, 1.3); c.fillStyle = '#f4ead2'; c.fill(); }
  } else if (hat === 'wizard') {
    c.beginPath(); c.moveTo(-17, -12); c.bezierCurveTo(-10, -30, -4, -44, 9, -52); c.bezierCurveTo(15, -50, 13, -44, 8, -41); c.bezierCurveTo(13, -32, 16, -22, 17, -12); c.closePath(); paint(c, '#4a54c8');
    ell(c, 0, -11.5, 29, 6); paint(c, '#4a54c8');
    c.fillStyle = '#f5c542'; star(c, -3, -24, 3.6); c.fill(); star(c, 7, -33, 2.6); c.fill(); star(c, 5, -17.5, 2); c.fill();
    c.beginPath(); c.moveTo(-17, -13.5); c.quadraticCurveTo(0, -9.5, 17, -13.5); c.lineWidth = 2.6; c.strokeStyle = '#f5c542'; c.stroke();
  } else if (hat === 'halo') {
    const y = -34 + Math.sin(t * 2.4) * 1.2;
    c.save(); c.shadowColor = '#ffe38a'; c.shadowBlur = 8;
    ell(c, 0, y, 15, 4.6); c.lineWidth = 5.6; c.strokeStyle = INK; c.stroke(); c.lineWidth = 3.2; c.strokeStyle = '#ffd84a'; c.stroke();
    c.restore();
  } else if (hat === 'crown') {
    poly(c, [[-17, -11], [-19, -33], [-10, -22.5], [-5, -37], [0, -24], [5, -37], [10, -22.5], [19, -33], [17, -11]]); paint(c, '#f5c542');
    rrect(c, -17.8, -15.5, 35.6, 6, 1.5); paint(c, '#e0a81e', 1.6);
    for (const [x, col] of [[-10, '#e2403a'], [0, '#3fb6e0'], [10, '#58b85f']]) { ell(c, x, -12.5, 2.1, 2.1); paint(c, col, 1.2); }
    for (const x of [-19, -5, 5, 19]) { ell(c, x, x * x > 100 ? -33.5 : -37.5, 2, 2); paint(c, '#fbfaf5', 1.2); }
  } else if (hat === 'bowler') {
    c.beginPath(); c.moveTo(-15, -13); c.quadraticCurveTo(-15, -33, 0, -33); c.quadraticCurveTo(15, -33, 15, -13); c.closePath(); paint(c, '#2a2630');
    rrect(c, -24, -15, 48, 5.5, 2.7); paint(c, '#2a2630'); c.fillStyle = '#6b5a48'; c.fillRect(-14.4, -17.5, 28.8, 3);
  } else if (hat === 'gambler') {
    rrect(c, -14, -27, 28, 14, 2); paint(c, '#2a2630'); rrect(c, -27, -15, 54, 5, 2.5); paint(c, '#2a2630'); c.fillStyle = '#c8323c'; c.fillRect(-13, -18.5, 26, 3.4);
  }
}

// ---------- glasses, bottles and mugs ----------
// A drink standing on (0, 0); `fill` is how much is left (1 full .. 0 empty). About 16 units tall.
export function drawGlass(c, key, fill = 1, t = 0) {
  const d = DRINKS[key];
  if (!d) return;
  c.save(); c.lineJoin = 'round'; c.lineCap = 'round';
  const glass = 'rgba(235,245,255,.42)';
  if (d.glass === 'pint') {
    const shape = () => { c.beginPath(); c.moveTo(-5.4, -15.5); c.lineTo(5.4, -15.5); c.lineTo(4.2, 0); c.lineTo(-4.2, 0); c.closePath(); };
    shape(); c.fillStyle = glass; c.fill();
    c.save(); shape(); c.clip();
    const top = -1 - 12.5 * fill; c.fillStyle = d.col; c.fillRect(-7, top, 14, 16);
    if (d.foam && fill > 0.05) { c.fillStyle = '#fff8e8'; c.fillRect(-7, top - 2.6, 14, 3.4); }
    c.restore();
    shape(); c.lineWidth = 1.6; c.strokeStyle = INK; c.stroke();
    if (d.foam && fill > 0.9) { for (const x of [-3.2, 0.2, 3.4]) { ell(c, x, -16, 2.5, 2.1); paint(c, '#fff8e8', 1.2); } }
  } else if (d.glass === 'bottle') {
    c.beginPath(); c.moveTo(-1.7, -19); c.lineTo(1.7, -19); c.lineTo(1.7, -14); c.quadraticCurveTo(4.4, -11.5, 4.4, -8.5); c.lineTo(4.4, -0.5); c.quadraticCurveTo(4.4, 0, 3.6, 0); c.lineTo(-3.6, 0); c.quadraticCurveTo(-4.4, 0, -4.4, -0.5); c.lineTo(-4.4, -8.5); c.quadraticCurveTo(-4.4, -11.5, -1.7, -14); c.closePath();
    paint(c, d.col, 1.6);
    c.fillStyle = '#f6efdc'; c.fillRect(-3.6, -8.2, 7.2, 4.6);
    c.fillStyle = 'rgba(255,255,255,.4)'; c.fillRect(-3, -12.5, 1.3, 11);
    c.fillStyle = '#d9c36a'; c.fillRect(-2, -20, 4, 1.8);
  } else if (d.glass === 'shot') {
    const shape = () => { c.beginPath(); c.moveTo(-3.4, -7.5); c.lineTo(3.4, -7.5); c.lineTo(2.6, 0); c.lineTo(-2.6, 0); c.closePath(); };
    shape(); c.fillStyle = glass; c.fill();
    c.save(); shape(); c.clip(); c.fillStyle = d.col; c.fillRect(-5, -1 - 5.4 * fill, 10, 8); c.restore();
    shape(); c.lineWidth = 1.5; c.strokeStyle = INK; c.stroke();
  } else if (d.glass === 'tall') {
    const shape = () => rrect(c, -4.2, -17, 8.4, 17, 1.4);
    shape(); c.fillStyle = glass; c.fill();
    c.save(); shape(); c.clip();
    const top = -1 - 14 * fill;
    if (d.col2) { const g = c.createLinearGradient(0, top, 0, 0); g.addColorStop(0, d.col); g.addColorStop(1, d.col2); c.fillStyle = g; } else c.fillStyle = d.col;
    c.fillRect(-6, top, 12, 18);
    c.fillStyle = 'rgba(255,255,255,.5)'; if (fill > 0.3) { c.fillRect(-2.6, top + 1.5, 3, 3); c.fillRect(0.6, top + 5, 2.6, 2.6); }
    c.restore();
    shape(); c.lineWidth = 1.5; c.strokeStyle = INK; c.stroke();
    c.beginPath(); c.moveTo(1.5, -4); c.lineTo(4.5, -21.5); c.lineWidth = 1.5; c.strokeStyle = '#e2403a'; c.stroke();
  } else if (d.glass === 'wine') {
    c.beginPath(); c.moveTo(0, -8); c.lineTo(0, -1); c.moveTo(-3.6, -0.6); c.lineTo(3.6, -0.6); c.lineWidth = 3.2; c.strokeStyle = INK; c.stroke(); c.lineWidth = 1.4; c.strokeStyle = '#e8f1fa'; c.stroke();
    const shape = () => { c.beginPath(); c.moveTo(-4.6, -17.5); c.lineTo(4.6, -17.5); c.quadraticCurveTo(5.2, -8.5, 0, -8); c.quadraticCurveTo(-5.2, -8.5, -4.6, -17.5); c.closePath(); };
    shape(); c.fillStyle = glass; c.fill();
    c.save(); shape(); c.clip(); c.fillStyle = d.col; c.fillRect(-6, -9 - 6 * fill, 12, 10); c.restore();
    shape(); c.lineWidth = 1.5; c.strokeStyle = INK; c.stroke();
  } else if (d.glass === 'mug') {
    c.beginPath(); c.arc(5.4, -6, 3.6, -Math.PI / 2, Math.PI / 2); c.lineWidth = 4.4; c.strokeStyle = INK; c.stroke(); c.lineWidth = 1.8; c.strokeStyle = '#f4f1ea'; c.stroke();
    rrect(c, -5.2, -11.5, 10.4, 11.5, 2); paint(c, '#f4f1ea', 1.6);
    if (fill > 0.05) { ell(c, 0, -10.4, 4, 1.3); c.fillStyle = d.col; c.fill(); }
    if (d.steam && fill > 0.2) {
      c.lineWidth = 1.3; c.strokeStyle = 'rgba(255,255,255,.7)';
      for (const x of [-2, 2]) { const u = (t * 0.7 + (x > 0 ? 0.5 : 0)) % 1; c.globalAlpha = 0.8 * (1 - u); c.beginPath(); c.moveTo(x, -13 - u * 7); c.quadraticCurveTo(x + 2.4, -16 - u * 7, x, -19 - u * 7); c.stroke(); }
      c.globalAlpha = 1;
    }
  }
  c.restore();
}

// ---------- what others have thrown ----------
function drawSplats(c, st, P) {
  const fx = st.fx || {}, t = st.t || 0;
  // on the face (the canvas is at the middle of the head here)
  if (fx.tomato !== undefined) {
    const a = Math.min(1, fx.tomato * 6), drip = Math.min(1, fx.tomato / 5);
    c.globalAlpha = a;
    c.beginPath();
    for (let i = 0; i < 12; i++) { const ang = i / 12 * TAU, r = 10.5 + (i % 2 ? 4.2 : -0.8) + Math.sin(i * 7.3) * 1.6; c.lineTo(2 + Math.cos(ang) * r, -1 + Math.sin(ang) * r * 0.9); }
    c.closePath(); paint(c, '#e2403a', 1.8);
    rrect(c, -4, 4, 4, 6 + drip * 10, 2); paint(c, '#e2403a', 1.5);
    rrect(c, 6, 5, 3.4, 3 + drip * 6, 1.7); paint(c, '#e2403a', 1.5);
    c.fillStyle = '#f7d774'; for (const [x, y] of [[-2, -4], [5, 1], [1, 3], [7, -5]]) { ell(c, x, y, 1.1, 1.6, 0.5); c.fill(); }
    c.globalAlpha = 1;
  }
  if (fx.pie !== undefined) {
    const slide = Math.max(0, fx.pie - 1.6) * 5;
    c.beginPath();
    for (let i = 0; i < 14; i++) { const ang = i / 14 * TAU, r = 17 + (i % 2 ? 3.6 : 0); c.lineTo(Math.cos(ang) * r, 1 + Math.sin(ang) * r * 0.86); }
    c.closePath(); paint(c, '#fffaf0', 1.8);
    for (const [x, y] of [[-7, -3], [7, -3]]) { ell(c, x, y, 2.6, 2.9); c.fillStyle = INK; c.fill(); ell(c, x + 0.8, y - 0.9, 0.8, 0.8); c.fillStyle = '#fff'; c.fill(); }
    c.fillStyle = '#e2403a'; ell(c, 10, 9, 2.6, 2.6); c.fill();
    if (slide < 34) { c.save(); c.translate(0, 8 + slide); ell(c, 0, 0, 15, 5); paint(c, '#c9ccd4', 1.6); ell(c, 0, -1.2, 11, 3.2); paint(c, '#fffaf0', 1.2); c.restore(); }
  }
  if (fx.snow !== undefined) {
    const a = Math.min(1, fx.snow * 6);
    c.globalAlpha = a;
    c.beginPath(); c.moveTo(-17, -15); c.bezierCurveTo(-13, -29, 13, -29, 17, -15); c.quadraticCurveTo(12, -10, 7, -14); c.quadraticCurveTo(3, -8, -2, -14); c.quadraticCurveTo(-8, -9, -17, -15); c.closePath(); paint(c, '#f6fbff', 1.6);
    for (const [x, y, r] of [[-9, 3, 4], [10, -2, 3], [3, 9, 2.4]]) { ell(c, x, y, r, r * 0.85); paint(c, '#f6fbff', 1.3); }
    c.globalAlpha = 1;
  }
  if (fx.water !== undefined) {
    c.fillStyle = '#63bdf2';
    for (let k = 0; k < 7; k++) { const u = (t * 1.1 + k * 0.37) % 1, x = -18 + (k * 53 % 37); c.globalAlpha = (1 - u) * Math.min(1, (12 - fx.water) / 3 + 0.2); c.beginPath(); c.moveTo(x, 6 + u * 60); c.quadraticCurveTo(x + 2.6, 10.5 + u * 60, x, 12 + u * 60); c.quadraticCurveTo(x - 2.6, 10.5 + u * 60, x, 6 + u * 60); c.fill(); }
    c.globalAlpha = 1;
    if (fx.water < 0.7) { const r = 10 + fx.water * 40; c.globalAlpha = 1 - fx.water / 0.7; for (let i = 0; i < 9; i++) { const ang = i / 9 * TAU; ell(c, Math.cos(ang) * r, Math.sin(ang) * r * 0.8, 3, 3); c.fill(); } c.globalAlpha = 1; }
  }
  void P;
}

function drawAura(c, st) {
  const fx = st.fx || {}, t = st.t || 0;
  if (fx.cloud !== undefined) {
    const y = -122 + Math.sin(t * 1.5) * 1.5, a = Math.min(1, fx.cloud * 3);
    c.globalAlpha = a;
    c.strokeStyle = '#63bdf2'; c.lineWidth = 1.8;
    for (let k = 0; k < 8; k++) { const u = (t * 1.6 + k * 0.29) % 1, x = -19 + k * 5.5; c.globalAlpha = a * (1 - u * 0.8); c.beginPath(); c.moveTo(x, y + 9 + u * 30); c.lineTo(x - 1.5, y + 15 + u * 30); c.stroke(); }
    c.globalAlpha = a;
    for (const [x, yy, r] of [[-14, 2, 10], [13, 3, 9], [-2, -5, 13], [4, 5, 10]]) { ell(c, x, y + yy, r, r * 0.8); paint(c, '#77808f', 2); }
    for (const [x, yy, r] of [[-14, 2, 10], [13, 3, 9], [-2, -5, 13], [4, 5, 10]]) { ell(c, x, y + yy, r - 1, r * 0.8 - 1); c.fillStyle = '#77808f'; c.fill(); }
    c.globalAlpha = 1;
  }
  if (fx.fart !== undefined) {
    for (let k = 0; k < 4; k++) {
      const u = fx.fart / 2.2 - k * 0.16;
      if (u < 0 || u > 1) continue;
      c.globalAlpha = (1 - u) * 0.85; ell(c, -20 - u * 24 - k * 5, -26 - u * 16 + (k % 2) * 6, 6 + u * 9, 5 + u * 7); c.fillStyle = '#9ccf4a'; c.fill();
    }
    c.globalAlpha = 1;
  }
  if (fx.feather !== undefined) {
    c.save(); c.translate(22 + Math.sin(t * 16) * 3, -42 + Math.cos(t * 13) * 3); c.rotate(-0.7 + Math.sin(t * 16) * 0.25);
    c.beginPath(); c.moveTo(0, 0); c.bezierCurveTo(7, -6, 9, -17, 2, -26); c.bezierCurveTo(-5, -17, -5, -6, 0, 0); c.closePath(); paint(c, '#fbfaf5', 1.5);
    c.beginPath(); c.moveTo(0, 4); c.lineTo(1.6, -23); c.lineWidth = 1.1; c.strokeStyle = '#b9b3c6'; c.stroke();
    c.restore();
  }
  if (fx.banana !== undefined && fx.banana < 3.2) {
    c.fillStyle = '#f5c542';
    for (let k = 0; k < 3; k++) { const a = t * 4 + k * TAU / 3; star(c, Math.cos(a) * 19, -98 + Math.sin(a) * 5, 4.6); paint(c, '#f5c542', 1.3); }
  }
  if (fx.hug !== undefined) {
    for (let k = 0; k < 4; k++) { const u = (fx.hug / 2.4 + k * 0.25) % 1; c.globalAlpha = Math.sin(u * Math.PI); heart(c, -16 + k * 11 + Math.sin(u * 6 + k) * 3, -96 - u * 26, 4.2 + (k % 2)); paint(c, '#f25a8e', 1.3); }
    c.globalAlpha = 1;
  }
  if (st.emote === 'sleep') {
    c.fillStyle = '#cfd6ff'; c.font = '700 13px Fredoka, sans-serif'; c.textAlign = 'center';
    for (let k = 0; k < 3; k++) { const u = ((st.et || 0) * 0.5 + k / 3) % 1; c.globalAlpha = Math.sin(u * Math.PI); c.save(); c.translate(18 + u * 14, -92 - u * 26); c.scale(0.7 + u * 0.7, 0.7 + u * 0.7); c.fillText('z', 0, 0); c.restore(); }
    c.globalAlpha = 1;
  }
  if ((st.buzz || 0) >= 3 && !st.emote) {
    const u = (t * 0.33 + (st.seed || 0)) % 1;
    if (u < 0.22) { c.globalAlpha = Math.sin(u / 0.22 * Math.PI); c.fillStyle = '#fff'; c.font = '700 11px Fredoka, sans-serif'; c.textAlign = 'center'; c.fillText('hik!', 25, -88 - u * 40); c.globalAlpha = 1; }
  }
}

// ---------- the hen ----------
function drawChicken(c, look, st) {
  const t = st.t || 0, w = st.walk || 0, s = Math.sin(st.phase || 0), peck = w ? 0 : Math.max(0, Math.sin(t * 2.4 + (st.seed || 0))) ** 6;
  c.save(); c.lineJoin = 'round'; c.lineCap = 'round';
  const bob = w ? Math.abs(s) * 2.5 : Math.sin(t * 3) * 0.6;
  // legs
  c.strokeStyle = '#f08a2c'; c.lineWidth = 2.4;
  for (const side of [-1, 1]) {
    const lift = w ? Math.max(0, side * s) * 5 : 0, x = side * 6;
    c.beginPath(); c.moveTo(x, -12); c.lineTo(x, -1 - lift); c.moveTo(x - 4, 0 - lift); c.lineTo(x, -2 - lift); c.lineTo(x + 4, 0 - lift); c.moveTo(x, -2 - lift); c.lineTo(x, 1.5 - lift); c.stroke();
  }
  c.translate(0, -bob);
  // tail, body, wing
  c.beginPath(); c.moveTo(-16, -30); c.quadraticCurveTo(-31, -40, -27, -22); c.quadraticCurveTo(-22, -16, -16, -18); c.closePath(); paint(c, '#fbfaf5');
  ell(c, 0, -24, 19, 15.5); paint(c, '#fbfaf5');
  c.save(); c.translate(-3, -25); c.rotate(w ? s * 0.5 : Math.sin(t * 9) * 0.04);
  c.beginPath(); c.moveTo(-9, -3); c.quadraticCurveTo(2, -9, 10, -1); c.quadraticCurveTo(4, 9, -9, 5); c.closePath(); paint(c, '#ece8df', 1.8);
  c.restore();
  // head
  c.translate(9, -43 + peck * 12); c.rotate(peck * 0.9);
  for (const [x, r] of [[-3.5, 3.2], [0.5, 4], [4.5, 3.2]]) { ell(c, x, -10, r, r + 0.6); paint(c, '#e2403a', 1.8); }
  ell(c, 0, 0, 10.5, 10); paint(c, '#fbfaf5');
  poly(c, [[8.5, -3], [17.5, 0.5], [8.5, 3.5]]); paint(c, '#f5a52c', 1.8);
  ell(c, 7, 7.5, 2.4, 3.6); paint(c, '#e2403a', 1.6);
  ell(c, 3, -2, 1.9, 2.1); c.fillStyle = INK; c.fill();
  if (look.hat) { c.save(); c.translate(0, 2); c.scale(0.5, 0.5); drawHat(c, look.hat, t); c.restore(); }
  c.restore();
}

// ---------- the whole figure ----------
export function drawAvatar(c, look, st = {}) {
  const fx = st.fx || {};
  c.save();
  if (fx.chicken !== undefined) {
    const u = fx.chicken;
    if (u < 0.35) { c.scale(1 + Math.sin(u / 0.35 * Math.PI) * 0.25, 1 - Math.sin(u / 0.35 * Math.PI) * 0.2); }
    drawChicken(c, look, st);
    c.restore();
    return;
  }
  const K = colours(look), P = pose(st);
  P.t = st.t || 0;
  // the body one chose: how wide (slim, ordinary, sturdy), how tall, a man's or a woman's
  P.bw = [1, 0.9, 1.17][look.build | 0] || 1; P.fem = (look.sex | 0) === 1;
  { const hk = [1, 0.94, 1.06][look.height | 0] || 1; c.scale(hk, hk); }
  c.lineJoin = 'round'; c.lineCap = 'round';
  if (st.sit) c.translate(0, 23);                         // the seat is at (0, 0): hips on it, feet below
  if (P.lie) { c.translate(0, -7 * P.lie); c.rotate((st.lieDir || -1) * Math.PI / 2 * P.lie); c.translate(0, 9 * P.lie); }
  c.translate(P.shake, -P.jump);
  c.rotate(P.lean);
  drawBack(c, look, K, P);
  drawLegs(c, look, K, P, st.sit);
  c.save(); c.translate(0, -P.bob);
  const [hl, hr] = hands(P);
  drawTorso(c, look, K, P);
  drawArm(c, look, K, -1, hl, P.bw);
  const sipping = st.drink && (st.sip || 0) > 0.5;
  if (!sipping) drawArm(c, look, K, 1, hr, P.bw);
  drawNeck(c, look);
  // head
  c.save(); c.translate(0, -73); c.rotate(P.tilt);
  for (const s of [-1, 1]) { ell(c, s * 21, 1.5, 4.2, 4.8); paint(c, K.skin); }
  ell(c, 0, 0, 21.5, 19.5); paint(c, K.skin);
  drawFace(c, look, K, P, st);
  drawHair(c, look, K);
  drawGlasses(c, look, P);
  drawSplats(c, st, P);
  if (look.hat) drawHat(c, look.hat, P.t);
  c.restore();
  if (sipping) drawArm(c, look, K, 1, hr, P.bw);
  if (st.drink) {
    c.save(); c.translate(hr[0] + 1.5, hr[1] + 3.5);
    if (st.emote !== 'cheers') c.rotate(-(st.sip || 0) * 0.9);
    drawGlass(c, st.drink, st.fill === undefined ? 1 : st.fill, P.t);
    c.restore();
    ell(c, hr[0], hr[1], 4.4, 4.4); paint(c, K.skin, 2);
  }
  c.restore();
  drawAura(c, st);
  c.restore();
}

// Head and shoulders in a round frame, for lists. `size` is the width and height in CSS pixels.
export function drawBust(canvas, look, size = 40, st = {}) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = canvas.height = Math.round(size * dpr);
  canvas.style.width = canvas.style.height = size + 'px';
  const c = canvas.getContext('2d'), k = size * dpr / 62;
  c.clearRect(0, 0, canvas.width, canvas.height);
  c.save();
  c.beginPath(); c.arc(canvas.width / 2, canvas.height / 2, canvas.width / 2, 0, TAU); c.clip();
  c.fillStyle = st.bg || '#3a3152'; c.fillRect(0, 0, canvas.width, canvas.height);
  c.translate(canvas.width / 2, canvas.height / 2 + 82 * k); c.scale(k, k);
  drawAvatar(c, look, { t: 1, ...st });
  c.restore();
}

// The whole figure on its own canvas (wardrobe, shop). `size` is the height in CSS pixels.
export function drawFigure(canvas, look, size = 180, st = {}) {
  const dpr = Math.min(2, window.devicePixelRatio || 1), w = size * 0.9;
  canvas.width = Math.round(w * dpr); canvas.height = Math.round(size * dpr);
  canvas.style.width = w + 'px'; canvas.style.height = size + 'px';
  const c = canvas.getContext('2d'), k = size * dpr / 132;
  c.clearRect(0, 0, canvas.width, canvas.height);
  c.save(); c.translate(canvas.width / 2, canvas.height - 10 * k); c.scale(k, k);
  ell(c, 0, 1, 24, 6); c.fillStyle = 'rgba(0,0,0,.22)'; c.fill();
  drawAvatar(c, look, st);
  c.restore();
}

// A part of the figure on a square canvas, for the clothes shop: 'body' from the hat to the hips, 'neck' the collar,
// 'feet' the legs and shoes, 'all' the whole figure. [how many of the figure's units fit, the height of the middle]
const PART = { all: [132, -56], body: [80, -58], neck: [62, -66], feet: [52, -17] };
export function drawPart(canvas, look, size = 76, part = 'all') {
  const dpr = Math.min(2, window.devicePixelRatio || 1), [span, mid] = PART[part] || PART.all;
  canvas.width = canvas.height = Math.round(size * dpr);
  canvas.style.width = canvas.style.height = size + 'px';
  const c = canvas.getContext('2d'), k = size * dpr / span;
  c.clearRect(0, 0, canvas.width, canvas.height);
  c.save(); c.translate(canvas.width / 2, canvas.height / 2 - mid * k); c.scale(k, k);
  if (part === 'all' || part === 'feet') { ell(c, 0, 1, 24, 6); c.fillStyle = 'rgba(0,0,0,.22)'; c.fill(); }
  drawAvatar(c, look, { t: 1 });
  c.restore();
}

// ---------- small pictures for menus, and the things that fly ----------
// Drawn around (0, 0), about 24 units across.
export function drawPrank(c, k, t = 0) {
  c.save(); c.lineJoin = 'round'; c.lineCap = 'round';
  if (k === 'snow') { ell(c, 0, 0, 9, 9); paint(c, '#f6fbff'); c.beginPath(); c.arc(0, 0, 5.5, 0.3, 1.6); c.lineWidth = 1.6; c.strokeStyle = '#c3d3e6'; c.stroke(); }
  else if (k === 'tomato') {
    ell(c, 0, 1, 9.5, 8.6); paint(c, '#e2403a');
    c.fillStyle = '#58b85f'; star(c, 0, -6.5, 5.4, 5, 0.35); c.fill(); c.lineWidth = 1.3; c.strokeStyle = INK; c.stroke();
    ell(c, -3.4, -1.5, 2, 2.8, 0.5); c.fillStyle = 'rgba(255,255,255,.5)'; c.fill();
  } else if (k === 'water') {
    c.beginPath(); c.moveTo(0, 9.5); c.bezierCurveTo(-12, 6, -10, -10.5, 0, -10.5); c.bezierCurveTo(10, -10.5, 12, 6, 0, 9.5); c.closePath(); paint(c, '#3f9be8');
    poly(c, [[-2.4, 12.5], [2.4, 12.5], [0, 8.8]]); paint(c, '#3f9be8', 1.5);
    ell(c, -3.6, -3.6, 2, 3.4, 0.5); c.fillStyle = 'rgba(255,255,255,.55)'; c.fill();
  } else if (k === 'pie') {
    c.beginPath(); c.moveTo(-11, 3); c.lineTo(11, 3); c.lineTo(8, 8); c.lineTo(-8, 8); c.closePath(); paint(c, '#c9ccd4');
    for (const [x, y, r] of [[-6, -1, 5], [6, -1, 5], [0, -4, 6.4]]) { ell(c, x, y, r, r * 0.86); paint(c, '#fffaf0'); }
    rrect(c, -10.5, -1, 21, 4.4, 2.2); c.fillStyle = '#fffaf0'; c.fill();
    ell(c, 0, -10, 2.6, 2.6); paint(c, '#e2403a', 1.5);
  } else if (k === 'banana') {
    c.beginPath(); c.moveTo(-10, -7); c.quadraticCurveTo(-4, 9, 11, 5); c.quadraticCurveTo(13, 2.5, 10.5, 1); c.quadraticCurveTo(0, 2.5, -6.5, -8.5); c.closePath(); paint(c, '#f5d142');
    c.fillStyle = '#6b4a2c'; c.fillRect(-11, -9.5, 3.6, 3);
  } else if (k === 'feather') {
    c.rotate(0.6);
    c.beginPath(); c.moveTo(0, 11); c.bezierCurveTo(8, 4, 9, -8, 1, -13); c.bezierCurveTo(-7, -7, -7, 4, 0, 11); c.closePath(); paint(c, '#fbfaf5');
    c.beginPath(); c.moveTo(-0.5, 13); c.lineTo(1, -10); c.lineWidth = 1.3; c.strokeStyle = '#b9b3c6'; c.stroke();
  } else if (k === 'fart') {
    ell(c, -1, 1, 10, 8.4); paint(c, '#f07a9a');
    poly(c, [[8, -1.8], [13, -3.6], [13, 3.2], [8, 2.6]]); paint(c, '#f07a9a', 1.6);
    c.beginPath(); c.arc(-1, 1, 5.4, 3.5, 5.2); c.lineWidth = 1.6; c.strokeStyle = 'rgba(255,255,255,.6)'; c.stroke();
  } else if (k === 'cloud') {
    c.strokeStyle = '#63bdf2'; c.lineWidth = 1.8; for (const x of [-6, 0, 6]) { c.beginPath(); c.moveTo(x, 5); c.lineTo(x - 1.5, 11); c.stroke(); }
    for (const [x, y, r] of [[-6, 0, 6], [6, 0.5, 5.5], [0, -4, 7.5]]) { ell(c, x, y, r, r * 0.84); paint(c, '#8a93a3'); }
    rrect(c, -9, -1.5, 18, 5.4, 2.6); c.fillStyle = '#8a93a3'; c.fill();
  } else if (k === 'chicken') {
    for (const [x, r] of [[-3.6, 3], [0.2, 3.8], [4, 3]]) { ell(c, x, -9, r, r + 0.4); paint(c, '#e2403a', 1.6); }
    ell(c, 0, 1.5, 9.6, 9.2); paint(c, '#fbfaf5');
    poly(c, [[7.5, -1], [14.5, 2], [7.5, 5]]); paint(c, '#f5a52c', 1.6);
    ell(c, 2.6, -0.6, 1.8, 2); c.fillStyle = INK; c.fill();
  } else if (k === 'confetti') {
    poly(c, [[-11, 11], [-3.5, -6.5], [6.5, 3.5]]); paint(c, '#f5c542');
    c.lineWidth = 2; for (const [x, y, col, a] of [[2, -9, '#e2403a', 0.5], [8.5, -5, '#3fb6e0', 2], [10, -10.5, '#58b85f', 1.1], [5, -1, '#f25a8e', 2.8]]) { c.strokeStyle = col; c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * 3.6, y + Math.sin(a) * 3.6); c.stroke(); }
  } else if (k === 'hug') { heart(c, -3, -0.5, 6.5); paint(c, '#f25a8e'); heart(c, 6.5, 4, 4.2); paint(c, '#ff9bbd', 1.6); }
  c.restore();
  void t;
}

// The same for emotes: a face that shows what the emote does.
export function drawEmote(c, k) {
  c.save(); c.lineJoin = 'round'; c.lineCap = 'round';
  const face = (mouth, eyes) => {
    ell(c, 0, 0, 10.5, 10); paint(c, '#f5c96a');
    c.lineWidth = 1.7; c.strokeStyle = INK; c.fillStyle = INK;
    for (const s of [-1, 1]) {
      if (eyes === 'arc') { c.beginPath(); c.moveTo(s * 4 - 2, -1); c.quadraticCurveTo(s * 4, -4, s * 4 + 2, -1); c.stroke(); }
      else if (eyes === 'line') { c.beginPath(); c.moveTo(s * 4 - 2, -1.6); c.lineTo(s * 4 + 2, -1.6); c.stroke(); }
      else if (eyes === 'lt') { c.beginPath(); c.moveTo(s * 4 - 2 * s, -3.4); c.lineTo(s * 4 + 1.4 * s, -1.6); c.lineTo(s * 4 - 2 * s, 0.2); c.stroke(); }
      else { ell(c, s * 4, -1.6, 1.4, 1.7); c.fill(); }
    }
    if (mouth === 'open') { c.beginPath(); c.moveTo(-4.4, 2.2); c.quadraticCurveTo(0, 9.5, 4.4, 2.2); c.closePath(); c.fillStyle = '#7a2233'; c.fill(); c.stroke(); }
    else if (mouth === 'sad') { c.beginPath(); c.moveTo(-3.4, 5.4); c.quadraticCurveTo(0, 2.2, 3.4, 5.4); c.stroke(); }
    else if (mouth === 'o') { ell(c, 0, 4.4, 1.5, 1.9); c.fillStyle = '#7a2233'; c.fill(); }
    else { c.beginPath(); c.moveTo(-3.8, 2.6); c.quadraticCurveTo(0, 6.6, 3.8, 2.6); c.stroke(); }
  };
  if (k === 'wave') { face('smile', 'arc'); c.save(); c.translate(11, -6); c.rotate(0.35); rrect(c, -3.4, -7, 6.8, 9.5, 3); paint(c, '#f5c96a', 1.6); c.restore(); }
  else if (k === 'dance') { face('open', 'arc'); c.fillStyle = INK; for (const [x, y] of [[-12.5, -9], [12.5, -5.5]]) { ell(c, x, y + 4, 1.9, 1.5); c.fill(); c.fillRect(x + 0.9, y - 3.4, 1.3, 7.4); c.fillRect(x + 0.9, y - 3.4, 4, 1.5); } }
  else if (k === 'laugh') { face('open', 'lt'); c.fillStyle = '#63bdf2'; for (const s of [-1, 1]) { ell(c, s * 9.5, -3, 1.6, 2.4, s * 0.6); c.fill(); } }
  else if (k === 'cheer') { face('open', 'arc'); c.fillStyle = '#f25a8e'; star(c, -11, -10, 3); c.fill(); c.fillStyle = '#3fb6e0'; star(c, 11.5, -9, 3.4); c.fill(); c.fillStyle = '#58b85f'; star(c, 0.5, -13.5, 2.4); c.fill(); }
  else if (k === 'cry') { face('sad', 'line'); c.fillStyle = '#63bdf2'; for (const s of [-1, 1]) { ell(c, s * 4.5, 3.4, 1.5, 3); c.fill(); } }
  else if (k === 'sleep') { face('o', 'line'); c.fillStyle = '#cfd6ff'; c.font = '700 9px Fredoka, sans-serif'; c.fillText('z', 8, -7); c.font = '700 7px Fredoka, sans-serif'; c.fillText('z', 13, -11); }
  else if (k === 'cheers') { c.save(); c.translate(-5, 9); c.rotate(-0.25); c.scale(1.05, 1.05); drawGlass(c, 'fadol', 1); c.restore(); c.save(); c.translate(6, 9); c.rotate(0.25); c.scale(1.05, 1.05); drawGlass(c, 'fadol', 1); c.restore(); }
  c.restore();
}
