// SLQ Game Lobby — the clubhouse in three dimensions: the saloon (saloon/place.js), the members as figures
// (saloon/people.js), a camera that follows one's own figure, looks through its eyes or shows the whole room from
// the front, and a flat layer on top for names, speech, signs and whatever flies through the air.
// It answers to the same calls as the flat clubhouse (room.js), so main.js can use either.
// The room's own measure is kept: x across, y the depth from the back wall, z the height. On the way to the
// graphics card that becomes (x, z, y).
import * as THREE from '../shooter/vendor/three.module.min.js';
import { ROOM, STATIONS, STATION, pathLen, posAt } from '../shared/room.js';
import { PRANKS, EMOTES, BAR } from '../shared/defs.js';
import { drawPrank, INK } from './avatar.js';
import { play } from './sfx.js';
import { makeKit } from './saloon/kit.js';
import { buildSaloon, WALL_H, SEAT_H } from './saloon/place.js';
import { makePeople } from './saloon/people.js';

const TAU = Math.PI * 2, FONT = 'Fredoka, system-ui, sans-serif';
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const WORDS = { snow: 'BRRR!', tomato: 'SPLAT!', water: 'PLASK!', pie: 'KLASK!', banana: 'HOVSA!', feather: 'KILDE KILDE!', fart: 'PRUUT!', cloud: 'ØV!', chicken: 'GOK!', confetti: 'HURRA!', hug: 'KRAM!' };
const SOUNDS = { snow: 'puff', tomato: 'splat', water: 'splash', pie: 'splat', banana: 'slip', feather: 'giggle', fart: 'fart', cloud: 'rain', chicken: 'cluck', confetti: 'pop', hug: 'heart' };
export const VIEWS = ['follow', 'eyes', 'over'];        // behind one's figure, through its eyes, the whole room from the front

// canvas: where the saloon is drawn. over: a canvas on top of it for names, speech and signs.
// hooks: { onActor(id), onStation(station), onFloor(x, y), onView(view) }
export function createRoom3D(canvas, over, hooks) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1;
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x130f1c);
  const camera = new THREE.PerspectiveCamera(50, 1, 0.08, 200); camera.rotation.order = 'YXZ'; scene.add(camera);
  scene.add(new THREE.HemisphereLight(0xffe9cc, 0x4a3324, 1.15), new THREE.AmbientLight(0xffffff, 0.22));
  const sun = new THREE.DirectionalLight(0xfff0d8, 1.5); sun.position.set(8, 13, 17); sun.target.position.set(16, 0, 5); scene.add(sun, sun.target);
  const kit = makeKit(THREE), saloon = buildSaloon(THREE, kit, ''), people = makePeople(THREE);
  scene.add(saloon.root);
  for (const [x, y, z] of saloon.lamps) { const l = new THREE.PointLight(0xffc27a, 16, 13, 1.8); l.position.set(x, y + 0.2, z); scene.add(l); }
  const c = over.getContext('2d');
  const actors = new Map(), fx = [];
  let me = 0, T = 0, last = 0, raf = 0, running = false, cw = 100, ch = 100, dpr = 1;
  let labels = {}, hover = null, hintUntil = 0, music = false, down = null, groupName = '';
  const casino = { pot: 0, lines: [], spin: {} }, spins = [];
  // the camera: which view, where it looks (yaw: 0 looks at the back wall), how far behind the figure it hangs
  const cam = { view: 'follow', yaw: 0, pitch: 0.36, dist: 6.4, panX: ROOM.w / 2, free: false, eyeY: 1.75, upp: 0.03 };
  const keys = new Set(); let walkAt = 0;
  const V = new THREE.Vector3(), V2 = new THREE.Vector3(), ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), HIT = new THREE.Vector3(), SPH = new THREE.Sphere();

  function resize() {
    const r = canvas.getBoundingClientRect();
    cw = Math.max(50, r.width); ch = Math.max(50, r.height);
    dpr = Math.min(cw < 700 ? 1.5 : 2, window.devicePixelRatio || 1);
    renderer.setPixelRatio(dpr); renderer.setSize(cw, ch, false);
    over.width = Math.round(cw * dpr); over.height = Math.round(ch * dpr);
    camera.aspect = cw / ch; camera.updateProjectionMatrix();
  }

  // ---------- the members ----------
  function actor(m) {
    const p = m.p && m.p.length ? m.p : [[ROOM.spawn[0], ROOM.spawn[1]]];
    const a = { id: m.id, name: m.name, look: m.look, dnd: m.dnd, path: p, len: pathLen(p), dist: 0, x: p[0][0], y: p[0][1], sit: m.sit || null, seated: false,
      moving: false, walk: 0, phase: 0, hop: 0, emote: '', emoteAt: 0, fxs: {}, drink: null, buzz: m.buzz || 0, buzzAt: T, bubble: null, net: m.busy === 'slot' || m.busy === 'bj' ? m.net || 0 : null,
      talkUntil: 0, seed: (m.id * 2.399) % 6.28, born: T, head: 0, want: 0, fig: people.person(m.look) };       // head: which way the figure looks (0: out into the room, at the viewer)
    if (a.sit && p.length < 2) { a.seated = true; faceSeat(a); a.head = a.want; }
    for (const [k, left] of m.fx || []) if (PRANKS[k]) a.fxs[k] = T - Math.max(0, PRANKS[k].dur - left / 1000);
    if (m.drink) a.drink = { k: m.drink[0], t0: T - (BAR.lasts - m.drink[1] / 1000) };
    scene.add(a.fig.group);
    return a;
  }
  const drop = a => { scene.remove(a.fig.group); a.fig.dispose(); };
  const seatOf = a => a.seated && a.sit && STATION[a.sit[0]] ? STATION[a.sit[0]] : null;
  const seatKind = st => st.on ? 'sofa' : st.high ? 'high' : 'low';
  function place(a) {            // where the figure stands or sits: [x, y, z]
    const st = seatOf(a);
    if (!st) return [a.x + (a.moving && a.buzz >= 3 ? Math.sin(T * 2.3 + a.seed) * 0.1 * Math.min(1, (a.buzz - 2) / 3) : 0), a.y, 0];
    const q = st.seats[a.sit[1]] || st.use;
    return [q[0], q[1], SEAT_H[seatKind(st)]];
  }
  // a seated figure looks at its table; on the sofa it looks out into the room
  function faceSeat(a) {
    const st = STATION[a.sit && a.sit[0]]; if (!st) return;
    const q = st.seats && st.seats[a.sit[1]]; if (!q) return;
    const cx = st.box ? st.box[0] + st.box[2] / 2 : st.round[0], cy = st.box ? st.box[1] + st.box[3] / 2 : st.round[1];
    a.want = st.on ? 0 : Math.atan2(cx - q[0], cy - q[1]);
  }
  const buzzNow = a => Math.max(0, a.buzz - (T - a.buzzAt) / (BAR.soberMin * 60));
  const isHen = a => a.fxs.chicken !== undefined && T >= a.fxs.chicken;
  // (a seated figure's hips are on the seat; a tall one's head is higher up)
  const topOf = a => isHen(a) ? 1.15 : (seatOf(a) ? 1.5 * a.fig.tall : 2.25 * a.fig.tall) + (a.look.hat ? 0.3 : 0);
  const headOf = a => { const [x, y, z] = place(a); return [x, y, z + (isHen(a) ? 0.85 : seatOf(a) ? 1.1 * a.fig.tall : 1.78 * a.fig.tall)]; };

  function step(a, dt) {
    if (a.dist < a.len) {
      const ox = a.x, oy = a.y;
      a.dist = Math.min(a.len, a.dist + ROOM.speed * dt);
      const q = posAt(a.path, a.dist);
      a.x = q[0]; a.y = q[1]; a.moving = a.dist < a.len;
      if (Math.abs(a.x - ox) + Math.abs(a.y - oy) > 1e-4) a.want = Math.atan2(a.x - ox, a.y - oy);
      if (!a.moving) {
        if (a.sit) { a.seated = true; a.hop = 0.28; faceSeat(a); }
        else {                                                        // stopped by a piece of furniture: turn to it
          let best = 2.3 * 2.3;
          for (const s of STATIONS) { if (!s.use || !s.name) continue; const d = (s.use[0] - a.x) ** 2 + (s.use[1] - a.y) ** 2; if (d < best && d < 1.2) { best = d; const cx = s.box ? s.box[0] + s.box[2] / 2 : s.round ? s.round[0] : s.wall ? s.wall[0] + s.wall[2] / 2 : s.floor[0], cy = s.box ? s.box[1] + s.box[3] / 2 : s.round ? s.round[1] : s.wall ? 0 : s.floor[1]; if (!s.floor) a.want = Math.atan2(cx - a.x, cy - a.y); } }
        }
      }
    } else a.moving = false;
    a.walk += ((a.moving ? 1 : 0) - a.walk) * Math.min(1, dt * 12);
    if (a.walk > 0.02) a.phase += dt * 11;
    let dh = a.want - a.head; dh = Math.atan2(Math.sin(dh), Math.cos(dh)); a.head += dh * Math.min(1, dt * 10);
    if (a.hop > 0) a.hop = Math.max(0, a.hop - dt);
    if (a.emote && T - a.emoteAt > EMOTES[a.emote].dur) a.emote = '';
    for (const k of Object.keys(a.fxs)) if (T - a.fxs[k] > PRANKS[k].dur) delete a.fxs[k];
    if (a.drink && T - a.drink.t0 > BAR.lasts) a.drink = null;
    if (a.bubble && T > a.bubble.until) a.bubble = null;
    if (a.id === me && a.moving) cam.free = false;
  }
  function show(a) {
    const [x, y, z] = place(a), st = seatOf(a), fxs = {};
    for (const key of Object.keys(a.fxs)) if (T >= a.fxs[key]) fxs[key] = T - a.fxs[key];
    let fill = 1, sip = 0;
    if (a.drink) {
      const el = T - a.drink.t0, per = BAR.lasts / BAR.sips, n = Math.floor(el / per), u = el - n * per;
      fill = Math.max(0, 1 - n / BAR.sips);
      if (u > per - 1.6) sip = Math.sin((u - (per - 1.6)) / 1.6 * Math.PI) ** 0.6;
      if (a.sipAt && T - a.sipAt < 1.6) sip = Math.max(sip, Math.sin((T - a.sipAt) / 1.6 * Math.PI) ** 0.6);
    }
    a.sipNow = sip; a.fillNow = fill;
    const hop = a.hop > 0 ? Math.sin((1 - a.hop / 0.28) * Math.PI) * 0.16 : 0, grow = Math.min(1, (T - a.born) * 4);
    const g = a.fig.group;
    g.position.set(x, hop, y); g.rotation.y = a.head; g.scale.setScalar(grow);
    a.fig.pose({ phase: a.phase, walk: a.walk, seed: a.seed, emote: a.emote, drink: a.drink, talk: T < a.talkUntil },
      { T, seat: st ? seatKind(st) : '', seatY: z, fill, sip, buzz: buzzNow(a), fx: fxs, et: T - a.emoteAt, hen: isHen(a), first: cam.view === 'eyes' && a.id === me });
  }

  // ---------- the camera ----------
  const mine = () => actors.get(me);
  function aim(dt) {
    const a = mine(), W = ROOM.w, D = ROOM.d;
    const [ax, ay, az] = a ? place(a) : [W / 2, D / 2, 0];
    saloon.upper.visible = true; saloon.near.visible = true;
    if (cam.view === 'over') {
      // the whole room from the front: far away through a long lens, so that it looks nearly flat
      camera.fov = 26; const el = 0.5, vt = Math.tan(camera.fov / 2 * Math.PI / 180), hw = vt * camera.aspect;
      const needV = (D * Math.sin(el) + WALL_H * Math.cos(el)) / 2 + 0.6, dV = needV / vt, dW = (W / 2 + 0.6) / hw;
      const whole = dW < dV * 1.5, dist = whole ? Math.max(dV, dW) : dV;      // nearly fits: show the whole room, a little smaller
      cam.upp = 2 * dist * vt / ch;                                  // room units per pixel, for dragging the picture sideways
      const half = dist * hw - 0.8, want = whole ? W / 2 : cam.free ? cam.panX : clamp(ax, half, W - half);
      cam.panX += (clamp(want, Math.min(half, W / 2), Math.max(W - half, W / 2)) - cam.panX) * (cam.free ? 1 : Math.min(1, dt * 5));
      const ty = 1.25, tz = D * 0.47;
      camera.position.set(cam.panX, ty + Math.sin(el) * dist, tz + Math.cos(el) * dist); camera.rotation.set(-el, 0, 0);
      saloon.upper.visible = false; saloon.near.visible = false;
    } else if (cam.view === 'eyes' && a) {
      camera.fov = 68;
      const ey = az + (seatOf(a) ? 1.2 : cam.eyeY) * a.fig.tall + (a.hop > 0 ? 0.05 : 0);
      camera.position.set(ax - Math.sin(cam.yaw) * 0.12, ey, ay - Math.cos(cam.yaw) * 0.12); camera.rotation.set(cam.pitch, cam.yaw, 0);
    } else {
      camera.fov = 52;
      const tx = ax, ty = az + (seatOf(a || {}) ? 1.2 : 1.55), tz = ay, cp = Math.cos(cam.pitch), dx = Math.sin(cam.yaw) * cp, dy = Math.sin(cam.pitch), dz = Math.cos(cam.yaw) * cp;
      // the camera stays inside the two end walls and the back wall (it may look in through the front wall and the ceiling)
      let t = cam.dist;
      if (dx > 0) t = Math.min(t, (W - 0.4 - tx) / dx); else if (dx < 0) t = Math.min(t, (0.4 - tx) / dx);
      if (dz < 0) t = Math.min(t, (0.45 - tz) / dz);
      if (dy < 0) t = Math.min(t, (0.3 - ty) / dy);
      t = Math.max(0.6, t);
      camera.position.set(tx + dx * t, ty + dy * t, tz + dz * t); camera.rotation.set(-cam.pitch, cam.yaw, 0);
      if (camera.position.z > D - 0.15) saloon.near.visible = false;
      if (camera.position.y > WALL_H - 0.5) saloon.upper.visible = false;
    }
    camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
  }
  // a point in the room -> where it is in the picture: [x, y, pixels per unit there, in front of the camera]
  function P(x, y, z) {
    V.set(x, z, y).project(camera);
    const sx = (V.x * 0.5 + 0.5) * cw, sy = (-V.y * 0.5 + 0.5) * ch, front = V.z < 1 && V.z > -1;
    V2.set(x, z + 1, y).project(camera);
    return [sx, sy, Math.max(4, Math.abs((-V2.y * 0.5 + 0.5) * ch - sy)), front];
  }

  // ---------- the flat layer: names, speech, signs ----------
  function wrap(text, maxW) {
    const words = text.split(' '), lines = [];
    let cur = '';
    for (let w of words) {
      while (c.measureText(w).width > maxW) { let n = w.length; while (n > 1 && c.measureText(w.slice(0, n)).width > maxW) n--; if (cur) { lines.push(cur); cur = ''; } lines.push(w.slice(0, n)); w = w.slice(n); }
      const t = cur ? cur + ' ' + w : w;
      if (c.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t;
    }
    if (cur) lines.push(cur);
    if (lines.length > 4) { lines.length = 4; lines[3] = lines[3].replace(/.{0,2}$/, '…'); }
    return lines;
  }
  function drawTag(a, placed) {
    if (cam.view === 'eyes' && a.id === me) return;
    const [x, y, z] = place(a), [cx, py, k, front] = P(x, y, z + topOf(a));
    if (!front || cx < -80 || cx > cw + 80) return;
    const size = clamp(k * 0.25, 11, 15);
    let top = py - 4;
    c.font = '600 ' + size + 'px ' + FONT; c.textAlign = 'center'; c.textBaseline = 'middle';
    const name = a.name + (a.dnd ? ' ·zz' : ''), w = c.measureText(name).width + size * 1.1, h = size * 1.55;
    for (let n = 0; n < 4 && placed.some(q => Math.abs(q[0] - cx) < (q[2] + w) / 2 - 2 && Math.abs(q[1] - top) < h); n++) top -= h + 2;
    placed.push([cx, top, w]);
    c.beginPath(); c.roundRect(cx - w / 2, top - h, w, h, h / 2); c.fillStyle = a.id === me ? 'rgba(255,179,71,.94)' : 'rgba(28,23,40,.72)'; c.fill();
    c.fillStyle = a.id === me ? '#2b1a08' : '#fff'; c.fillText(name, cx, top - h / 2 + 0.5);
    if (a.net !== null) {
      const t = (a.net > 0 ? '+' : '') + a.net, nw = c.measureText(t).width + size * 1.1;
      c.beginPath(); c.roundRect(cx - nw / 2, top - h * 2 - 2, nw, h, h / 2); c.fillStyle = a.net > 0 ? '#1f7a4a' : a.net < 0 ? '#a8323c' : 'rgba(28,23,40,.86)'; c.fill();
      c.fillStyle = '#fff'; c.fillText(t, cx, top - h * 1.5 - 1.5);
      top -= h + 2;
    }
    if (a.bubble) {
      const b = a.bubble, fs = clamp(k * 0.28, 12.5, 15.5), lh = fs * 1.28, pop = Math.min(1, (T - b.at) * 7), fade = Math.min(1, (b.until - T) * 3);
      c.font = '500 ' + fs + 'px ' + FONT;
      if (!b.lines || b.fs !== fs) { b.lines = wrap(b.text, Math.min(210, cw * 0.5)); b.fs = fs; b.w = Math.max(...b.lines.map(l => c.measureText(l).width)); }
      const bw = b.w + fs * 1.3, bh = b.lines.length * lh + fs * 0.7, bx = clamp(cx - bw / 2, 4, cw - bw - 4), by = top - h - 9 - bh;
      c.save(); c.globalAlpha = fade; c.translate(cx, top - h - 4); c.scale(pop, pop); c.translate(-cx, -(top - h - 4));
      c.beginPath(); c.roundRect(bx, by, bw, bh, 11); c.fillStyle = '#fffaf0'; c.fill(); c.lineWidth = 2; c.strokeStyle = INK; c.stroke();
      c.beginPath(); c.moveTo(cx - 6, by + bh - 1); c.lineTo(cx, by + bh + 7); c.lineTo(cx + 6, by + bh - 1); c.fillStyle = '#fffaf0'; c.fill();
      c.beginPath(); c.moveTo(cx - 6, by + bh); c.lineTo(cx, by + bh + 7); c.lineTo(cx + 6, by + bh); c.stroke();
      c.fillStyle = INK; c.textAlign = 'left';
      b.lines.forEach((l, i) => c.fillText(l, bx + fs * 0.65, by + fs * 0.35 + lh * (i + 0.5)));
      c.restore();
    }
  }
  // The sign over a piece of furniture: its name, or what is going on there ({ head, text, hot }, see room.js).
  function drawLabel(sg, strong) {
    const st = STATION[sg[0]], l = labels[st.id], lab = typeof l === 'string' ? { text: l } : l, [mid, py, k, front] = P(sg[1], sg[3], sg[2] + (st.lift || 0));
    if (!front || mid < 12 || mid > cw - 12) return;
    const text = lab ? lab.text : st.name, head = lab && lab.head ? lab.head.toUpperCase() : '', size = clamp(k * 0.26, 11, 15), hs = Math.max(10, size * 0.74);
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = '600 ' + size + 'px ' + FONT;
    let tw = c.measureText(text).width;
    if (head) { c.font = '700 ' + hs + 'px ' + FONT; tw = Math.max(tw, c.measureText(head).width); }
    const w = tw + size * 1.4, h = size * 1.7 + (head ? hs * 1.1 : 0), cx = clamp(mid, w / 2 + 4, cw - w / 2 - 4), y = Math.max(h + 2, py);
    const hot = !!(lab && lab.hot), glow = hot ? 0.5 + 0.5 * Math.sin(T * 4.5) : 0;
    c.globalAlpha = strong || hot ? 1 : 0.9;
    if (hot) { c.shadowColor = 'rgba(255,196,84,' + (0.45 + 0.45 * glow) + ')'; c.shadowBlur = 5 + 11 * glow; }
    c.beginPath(); c.roundRect(cx - w / 2, y - h, w, h, Math.min(h / 2, size * 0.95)); c.fillStyle = hot ? '#ffd772' : lab ? '#ffb347' : 'rgba(28,23,40,.86)'; c.fill();
    c.shadowBlur = 0;
    if (head) { c.fillStyle = 'rgba(43,26,8,.7)'; c.fillText(head, cx, y - h + hs * 0.98); }
    c.font = '600 ' + size + 'px ' + FONT; c.fillStyle = lab ? '#2b1a08' : '#fff'; c.fillText(text, cx, y - size * 0.85 + (head ? -0.5 : 0.5));
    c.globalAlpha = 1;
  }

  // ---------- things in the air ----------
  function burst(x, y, z, n, opt) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, sp = (opt.speed || 2) * (0.4 + Math.random() * 0.8);
      fx.push({ kind: 'p', shape: opt.shape || 'dot', x, y, z, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.6, vz: (opt.up || 1.5) + Math.random() * 1.2, g: opt.g === undefined ? 7 : opt.g,
        t: 0, life: (opt.life || 0.8) * (0.6 + Math.random() * 0.6), col: opt.cols[i % opt.cols.length], size: (opt.size || 0.08) * (0.6 + Math.random() * 0.8), rot: Math.random() * 6, vr: (Math.random() - 0.5) * 12 });
    }
  }
  function word(text, x, y, z, col = '#fff') { fx.push({ kind: 'w', text, x, y, z, t: 0, life: 1.3, col }); }
  function landSpin(q) {
    const a = actors.get(q.id);
    if (!a) return;
    if (a.net !== null) a.net = q.net;
    const [x, y, z] = headOf(a), d = q.win - q.bet;
    fx.push({ kind: 'w', text: (d > 0 ? '+' : '') + d, x, y, z: z + 1.0, t: 0, life: q.win >= q.bet * 10 && q.win ? 2.4 : 1.6, big: d > 0, col: d > 0 ? '#ffd45e' : d < 0 ? '#ff9a8c' : '#fff' });
    if (q.win > 0) burst(x, y, z + 0.2, Math.min(40, 6 + Math.round(q.win / Math.max(1, q.bet || 1)) * 2), { cols: ['#ffd45e', '#ffb347', '#fff1c4'], speed: 2.2, up: 2.2, size: 0.07, life: 1.0 });
    if (q.win > 0 && q.id !== me) play('coin');
  }
  function land(k, a) {
    a.fxs[k] = T;
    if (k === 'chicken') a.emote = '';
    const [x, y, z] = headOf(a);
    play(SOUNDS[k]);
    word(WORDS[k], x, y, z + 0.9, k === 'hug' || k === 'confetti' ? '#ffd3e6' : '#fff');
    if (k === 'tomato') burst(x, y, z, 14, { cols: ['#e2403a', '#c8323c', '#f7d774'], speed: 2.4 });
    else if (k === 'snow') burst(x, y, z, 16, { cols: ['#fff', '#dcebfa'], speed: 2.2 });
    else if (k === 'water') burst(x, y, z, 26, { cols: ['#63bdf2', '#9fd8fa'], speed: 3, life: 0.9 });
    else if (k === 'pie') burst(x, y, z, 14, { cols: ['#fffaf0', '#f4e6c8'], speed: 2 });
    else if (k === 'chicken') burst(x, y, z - 0.4, 18, { cols: ['#fff', '#ece8df'], speed: 2.4, shape: 'feather', g: 2.5, life: 1.5 });
    else if (k === 'confetti') for (let i = 0; i < 46; i++) fx.push({ kind: 'p', shape: 'rect', x: x + (Math.random() - 0.5) * 1.6, y: y + (Math.random() - 0.5) * 1.0, z: z + 1.2 + Math.random() * 0.8, vx: (Math.random() - 0.5) * 0.8, vy: (Math.random() - 0.5) * 0.6, vz: -0.3 - Math.random(), g: 1.2, t: 0, life: 2 + Math.random(), col: ['#e2403a', '#f2c33f', '#3fb6e0', '#58b85f', '#f25a8e', '#fff'][i % 6], size: 0.07, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 10 });
    else if (k === 'banana') burst(x, y, 0.3, 6, { cols: ['#f5d142'], speed: 1.6, shape: 'star' });
    else if (k === 'fart') burst(x, y, 0.8, 9, { cols: ['#9ccf4a', '#b9e06a'], speed: 1, g: -0.6, life: 1.4, size: 0.16 });
    else if (k === 'hug') burst(x, y, z + 0.3, 7, { cols: ['#f25a8e', '#ff9ab8'], speed: 0.8, g: -1.2, life: 1.6, size: 0.1, shape: 'heart', up: 0.4 });
  }
  function drawFx(dt) {
    for (let i = fx.length - 1; i >= 0; i--) {
      const f = fx[i];
      f.t += dt;
      if (f.kind === 'fly') {
        const to = actors.get(f.to);
        if (!to) { fx.splice(i, 1); continue; }
        const u = Math.min(1, f.t / f.dur), [tx, ty, tz] = headOf(to);
        const [px, py, k, front] = P(f.x + (tx - f.x) * u, f.y + (ty - f.y) * u, f.z + (tz - f.z) * u + Math.sin(u * Math.PI) * 1.4);
        if (front) { c.save(); c.translate(px, py); c.rotate(f.t * 9); c.scale(k * 0.03, k * 0.03); drawPrank(c, f.k); c.restore(); }
        if (u >= 1) { fx.splice(i, 1); land(f.k, to); }
        continue;
      }
      if (f.t >= f.life) { fx.splice(i, 1); continue; }
      const u = f.t / f.life;
      if (f.kind === 'w') {
        const [px, py, k, front] = P(f.x, f.y, f.z + u * 0.7);
        if (!front) continue;
        const size = clamp(k * 0.42, 15, 26) * (f.big ? 1.3 : 1) * (0.6 + Math.min(1, f.t * 8) * 0.4);
        c.save(); c.globalAlpha = Math.min(1, (1 - u) * 2.5); c.translate(px, py); c.rotate(-0.08);
        c.font = '700 ' + size + 'px ' + FONT; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round';
        c.lineWidth = size * 0.28; c.strokeStyle = INK; c.strokeText(f.text, 0, 0); c.fillStyle = f.col; c.fillText(f.text, 0, 0);
        c.restore();
        continue;
      }
      f.x += f.vx * dt; f.y += (f.vy || 0) * dt; f.z += f.vz * dt; f.vz -= f.g * dt; f.rot += f.vr * dt;
      if (f.z < 0 && f.g > 0) { f.z = 0; f.vz = 0; f.vx *= 0.5; f.vy = (f.vy || 0) * 0.5; }
      const [px, py, k, front] = P(f.x, f.y, f.z);
      if (!front) continue;
      c.save(); c.globalAlpha = Math.min(1, (1 - u) * 3); c.translate(px, py); c.rotate(f.rot);
      const r = Math.min(40, f.size * k);
      c.fillStyle = f.col;
      if (f.shape === 'rect') c.fillRect(-r, -r * 0.5, r * 2, r);
      else if (f.shape === 'star') { c.beginPath(); for (let j = 0; j < 10; j++) { const a = j * Math.PI / 5, q = j % 2 ? r * 0.5 : r * 1.2; c.lineTo(Math.cos(a) * q, Math.sin(a) * q); } c.fill(); }
      else if (f.shape === 'feather') { c.beginPath(); c.ellipse(0, 0, r * 1.6, r * 0.6, 0, 0, TAU); c.fill(); }
      else if (f.shape === 'heart') { c.rotate(-f.rot); c.beginPath(); c.moveTo(0, r * 0.9); c.bezierCurveTo(-r * 1.6, -r * 0.3, -r * 0.5, -r * 1.3, 0, -r * 0.4); c.bezierCurveTo(r * 0.5, -r * 1.3, r * 1.6, -r * 0.3, 0, r * 0.9); c.fill(); }
      else if (f.shape === 'note') { c.rotate(-f.rot); c.font = '700 ' + Math.max(10, r * 3) + 'px ' + FONT; c.textAlign = 'center'; c.fillText(f.text, 0, 0); }
      else { c.beginPath(); c.arc(0, 0, r, 0, TAU); c.fill(); }
      c.restore();
    }
  }

  // ---------- every frame ----------
  let noteT = 0;
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = clamp((now - last) / 1000 || 0, 0, 0.1);
    last = now; T += dt;
    for (const a of actors.values()) step(a, dt);
    walkKeys();
    for (let i = spins.length - 1; i >= 0; i--) if (T >= spins[i].at) { const q = spins[i]; spins.splice(i, 1); landSpin(q); }
    for (const a of actors.values()) show(a);
    aim(dt);
    // the barkeeper looks at whoever stands nearest the bar
    let near = null, nd = 30;
    for (const a of actors.values()) { const d = (a.x - 10.9) ** 2 + (a.y - 2.4) ** 2; if (d < nd) { nd = d; near = [a.x, a.y]; } }
    saloon.tick(dt, T, near);
    if (music && (noteT += dt) > 0.45) { noteT = 0; const n = saloon.notes; fx.push({ kind: 'p', shape: 'note', text: Math.random() < 0.5 ? '♪' : '♫', x: n[0] + (Math.random() - 0.5) * 0.5, y: n[2], z: n[1] - 0.2, vx: (Math.random() - 0.5) * 0.4, vy: 0.2, vz: 0.7, g: 0, t: 0, life: 1.8, col: '#ffe9a8', size: 0.1, rot: 0, vr: 0 }); }
    hand.tick(dt);
    renderer.render(scene, camera);
    // the flat layer
    c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, cw, ch); c.lineJoin = 'round'; c.lineCap = 'round';
    drawFx(dt);
    const placed = [], list = [...actors.values()].map(a => [a, camera.position.distanceToSquared(V.set(a.x, 1.5, a.y))]).sort((p, q) => q[1] - p[1]);
    for (const [a] of list) drawTag(a, placed);
    const showAll = T < hintUntil;
    for (const sg of saloon.signs) if (hover === sg[0] || labels[sg[0]] || showAll) drawLabel(sg, hover === sg[0]);
  }

  // ---------- one's own hand with the glass, seen through one's own eyes ----------
  const hand = (() => {
    const g = new THREE.Group(); camera.add(g); g.visible = false;
    let k = '', ves = null, skin = null;
    // the hand closes round the glass from the right; the forearm runs down and back out of the picture
    const fist = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 10), new THREE.MeshStandardMaterial({ color: 0xe2ab7c, roughness: 0.8 })); fist.position.set(0.085, 0.12, 0.03); fist.scale.set(0.8, 1, 1.1); g.add(fist);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.6, 10), fist.material), dir = new THREE.Vector3(0.38, -0.55, 0.74).normalize();
    arm.position.copy(fist.position).addScaledVector(dir, 0.32); arm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir); g.add(arm);
    return { tick() {
      const a = mine(), on = cam.view === 'eyes' && a && a.drink && !isHen(a);
      g.visible = !!on;
      if (!on) return;
      if (a.drink.k !== k) { if (ves) g.remove(ves.g); ves = people.vessel(a.drink.k); k = a.drink.k; g.add(ves.g); ves.g.scale.setScalar(1.15); }
      if (skin !== a.look.skin) { skin = a.look.skin; fist.material.color.copy(a.fig.parts.skull.material.color); }
      const s = a.sipNow || 0;
      g.position.set(0.36 - 0.3 * s, -0.42 + 0.24 * s, -0.74 + 0.3 * s); g.rotation.set(0.85 * s, 0, 0.05);
      if (ves.drink && ves.kind !== 'mug' && ves.kind !== 'wine') { const f = clamp(a.fillNow, 0.04, 1); ves.drink.scale.y = ves.full * f; ves.drink.position.y = ves.base + ves.full * f / 2; }
    } };
  })();

  // ---------- clicks, dragging, keys ----------
  const local = e => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  function pick(px, py) {
    ndc.set(px / cw * 2 - 1, -(py / ch) * 2 + 1); ray.setFromCamera(ndc, camera);
    let best = null, bd = 1e9;
    for (const a of actors.values()) {
      if (cam.view === 'eyes' && a.id === me) continue;
      const [x, y, z] = place(a), hen = isHen(a);
      for (const [dy, r] of hen ? [[0.55, 0.5]] : [[z + (seatOf(a) ? 1.1 : 1.75), 0.5], [z + 0.8, 0.42]]) {
        SPH.center.set(x, dy, y); SPH.radius = r;
        if (ray.ray.intersectSphere(SPH, HIT)) { const d = HIT.distanceTo(ray.ray.origin); if (d < bd) { bd = d; best = { actor: a }; } }
      }
    }
    for (const q of saloon.picks) if (STATION[q.id].name && ray.ray.intersectBox(q.box, HIT)) { const d = HIT.distanceTo(ray.ray.origin); if (d < bd - 0.01) { bd = d; best = { station: STATION[q.id] }; } }
    if (ray.ray.direction.y < -0.001) {
      const t = -ray.ray.origin.y / ray.ray.direction.y, fx2 = ray.ray.origin.x + ray.ray.direction.x * t, fz = ray.ray.origin.z + ray.ray.direction.z * t;
      if (t < bd && fx2 > 0.2 && fx2 < ROOM.w - 0.2 && fz > 0.2 && fz < ROOM.d - 0.2) best = { floor: [fx2, fz] };
    }
    return best;
  }
  canvas.addEventListener('pointerdown', e => { try { canvas.setPointerCapture(e.pointerId); } catch {} down = { x: e.clientX, y: e.clientY, yaw: cam.yaw, pitch: cam.pitch, pan: cam.panX, moved: false, id: e.pointerId }; });
  canvas.addEventListener('pointermove', e => {
    if (down && down.id === e.pointerId) {
      const dx = e.clientX - down.x, dy = e.clientY - down.y;
      if (Math.abs(dx) + Math.abs(dy) > 9) down.moved = true;
      if (!down.moved) return;
      // dragging takes hold of the picture: it follows the finger
      if (cam.view === 'over') { cam.panX = down.pan - dx * cam.upp; cam.free = true; }
      else if (cam.view === 'eyes') { cam.yaw = down.yaw + dx * 0.004; cam.pitch = clamp(down.pitch + dy * 0.004, -1.2, 1.2); }
      else { cam.yaw = down.yaw - dx * 0.006; cam.pitch = clamp(down.pitch + dy * 0.006, -0.05, 1.3); }
      return;
    }
    if (e.pointerType !== 'mouse') return;
    const hit = pick(...local(e));
    hover = hit && hit.station ? hit.station.id : null;
    canvas.style.cursor = hit && (hit.station || hit.actor) ? 'pointer' : 'default';
  });
  canvas.addEventListener('pointerleave', () => { hover = null; });
  canvas.addEventListener('pointerup', e => {
    const d = down; down = null;
    if (!d || d.moved) return;
    const [px, py] = local(e), hit = pick(px, py);
    if (!hit) return;
    if (hit.actor) hooks.onActor(hit.actor.id, [px, py]);
    else if (hit.station) hooks.onStation(hit.station);
    else { hooks.onFloor(hit.floor[0], hit.floor[1]); fx.push({ kind: 'p', shape: 'dot', x: hit.floor[0], y: hit.floor[1], z: 0.03, vx: 0, vz: 0, g: 0, t: 0, life: 0.4, col: 'rgba(255,255,255,.75)', size: 0.09, rot: 0, vr: 0 }); }
  });
  canvas.addEventListener('pointercancel', () => { down = null; });
  canvas.addEventListener('wheel', e => { if (cam.view === 'follow') { cam.dist = clamp(cam.dist * (e.deltaY > 0 ? 1.12 : 0.89), 2.2, 11); e.preventDefault(); } }, { passive: false });
  // walking with the keys: a little way ahead at a time, the way the camera looks
  const KEY = { KeyW: [0, 1], ArrowUp: [0, 1], KeyS: [0, -1], ArrowDown: [0, -1], KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0] };
  function walkKeys() {
    if (!keys.size || T < walkAt) return;
    const a = mine(); if (!a) return;
    let sx = 0, sf = 0; for (const k of keys) { sx += KEY[k][0]; sf += KEY[k][1]; }
    if (!sx && !sf) return;
    const yaw = cam.view === 'over' ? 0 : cam.yaw, l = Math.hypot(sx, sf), fx2 = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
    const [x, y] = place(a), tx = clamp(x + (fx2 * sf + rx * sx) / l * 1.7, 0.4, ROOM.w - 0.4), ty = clamp(y + (fz * sf + rz * sx) / l * 1.7, 0.4, ROOM.d - 0.4);
    walkAt = T + 0.22; hooks.onFloor(tx, ty);
  }
  const typing = () => { const e = document.activeElement; return e && (e.tagName === 'INPUT' || e.tagName === 'TEXTAREA' || e.isContentEditable); };
  const keyDown = e => { if (!running || typing() || e.ctrlKey || e.metaKey || e.altKey || !hooks.keysOn()) return; if (KEY[e.code]) { keys.add(e.code); e.preventDefault(); } else if (e.code === 'KeyV') api.setView(VIEWS[(VIEWS.indexOf(cam.view) + 1) % VIEWS.length]); else if (e.code === 'KeyE' || e.code === 'Space') { if (hooks.onSip) hooks.onSip(); e.preventDefault(); } };
  const keyUp = e => keys.delete(e.code);
  document.addEventListener('keydown', keyDown); document.addEventListener('keyup', keyUp); window.addEventListener('blur', () => keys.clear());

  // ---------- what main.js calls (the same as on the flat clubhouse) ----------
  const api = {
    resize,
    start() { if (running) return; running = true; resize(); last = performance.now(); raf = requestAnimationFrame(frame); },
    stop() { running = false; cancelAnimationFrame(raf); keys.clear(); },
    setMusic(on) { music = !!on; saloon.setMusic(music); },
    setName(name) { if (name !== groupName) { groupName = name; saloon.setName(name); } },
    setLabels(l) { labels = l; },
    hint(seconds = 7) { hintUntil = T + seconds; },
    spot: id => { const sg = saloon.signs.find(q => q[0] === id), st = STATION[id]; const q = P(sg[1], sg[3], st.wall ? sg[2] - 0.6 : Math.max(0.3, (st.h || 0.4) * 0.6)); return [q[0], q[1]]; },
    here: id => actors.has(id),
    sitting: id => { const a = actors.get(id); return a && a.sit ? a.sit[0] : ''; },
    count: () => actors.size,
    view: () => cam.view,
    setView(v) { if (!VIEWS.includes(v)) return; cam.view = v; cam.free = false; if (v === 'eyes') { const a = mine(); cam.pitch = 0; if (a) cam.yaw = a.head + Math.PI; } else if (v === 'follow') { cam.pitch = 0.36; } if (hooks.onView) hooks.onView(v); },
    setRoom(members, myId) {
      me = myId; for (const a of actors.values()) drop(a); actors.clear(); fx.length = 0; cam.free = false;
      for (const m of members) if (m.on) actors.set(m.id, actor(m));
      const a = actors.get(me);
      if (a) { a.born = T - 1; cam.panX = a.x; }
    },
    join(m) { const old = actors.get(m.id); if (old) drop(old); actors.set(m.id, actor(m)); if (m.id !== me) { play('door'); saloon.swing(); } },
    leave(id) { const a = actors.get(id); if (a) { const [x, y] = place(a); burst(x, y, 1, 10, { cols: ['#fff', '#e9e3f5'], speed: 1.6, g: -0.5, size: 0.12 }); drop(a); saloon.swing(); } actors.delete(id); },
    patch(m) {
      const a = actors.get(m.id);
      if (!a) return;
      if (m.look) { a.look = m.look; drop(a); a.fig = people.person(m.look); scene.add(a.fig.group); }
      if (m.name) a.name = m.name; if ('dnd' in m) a.dnd = m.dnd;
      if ('busy' in m) a.net = m.busy === 'slot' || m.busy === 'bj' ? (m.net ?? a.net ?? 0) : null;
    },
    setCasino(o) { Object.assign(casino, o); saloon.setCasino(casino); },
    spin(id, station, bet, win, net, ms) { casino.spin[station] = T + ms / 1000; saloon.spin(station, ms / 1000, T); spins.push({ at: T + ms / 1000, id, bet, win, net }); },
    result(id, bet, win, net, ms) { spins.push({ at: T + ms / 1000, id, bet, win, net }); },
    move(id, path, sit) {
      const a = actors.get(id);
      if (!a || !path || !path.length) return;
      const wasSeated = a.seated, dx = a.x - path[0][0], dy = a.y - path[0][1], off = Math.sqrt(dx * dx + dy * dy);
      a.path = !wasSeated && off > 0.05 && off < 2 ? [[a.x, a.y], ...path] : path;
      a.len = pathLen(a.path); a.dist = 0; a.sit = sit || null; a.seated = false;
      a.x = a.path[0][0]; a.y = a.path[0][1];
      if (a.len < 0.01 && a.sit) { a.seated = true; a.hop = 0.28; faceSeat(a); }
      if (wasSeated) a.hop = 0.2;
    },
    say(id, text) {
      const a = actors.get(id);
      if (!a) return;
      a.bubble = { text: (a.fxs.chicken !== undefined ? 'Gok gok! ' : '') + text, at: T, until: T + clamp(3.5 + text.length * 0.06, 4, 9) };
      a.talkUntil = T + clamp(text.length * 0.07, 0.8, 3);
    },
    emote(id, k) {
      const a = actors.get(id);
      if (!a || a.fxs.chicken !== undefined) return;
      if (k === 'sip') { if (a.drink) a.sipAt = T; return; }             // a mouthful of what is in the glass, when one wants it
      if (!EMOTES[k]) return;
      a.emote = k; a.emoteAt = T; if (id === me || k === 'cheers') play(k === 'cheers' ? 'clink' : 'pop');
    },
    prank(k, from, to) {
      const a = actors.get(from), b = actors.get(to);
      if (!b || !PRANKS[k]) return;
      if (PRANKS[k].fly && a) {
        const [x, y, z] = place(a);
        a.emote = 'wave'; a.emoteAt = T - 1.9; a.want = Math.atan2(b.x - a.x, b.y - a.y);
        fx.push({ kind: 'fly', k, x, y, z: z + 1.4, to, t: 0, dur: 0.55 });
        play('throw');
      } else { land(k, b); if (k === 'hug' && a) a.fxs.hug = T; }
    },
    drink(k, from, to, buzz) {
      to.forEach((id, i) => {
        const a = actors.get(id);
        if (!a) return;
        a.drink = { k, t0: T }; a.buzz = buzz[i] || 0; a.buzzAt = T;
        const [x, y, z] = place(a);
        burst(x + 0.3, y, z + 1.1, 5, { cols: ['#fff8e8', '#ffd45e'], speed: 0.9, size: 0.05, life: 0.5 });
      });
      play(to.length > 1 ? 'cheers' : 'pour');
      if (to.length > 1) { const a = actors.get(from); if (a) { const [x, y, z] = place(a); word('SKÅL!', x, y, z + 2.5, '#ffd45e'); } }
    },
    screenOf(id) { const a = actors.get(id); if (!a) return null; const [x, y, z] = place(a), q = P(x, y, z + topOf(a)); return [q[0], q[1]]; },
    // the members as they stand right now, in the shape the server sends them: for handing the room over to the other way of showing it
    snapshot() {
      return [...actors.values()].map(a => ({ id: a.id, name: a.name, look: a.look, dnd: a.dnd, on: true, p: a.dist < a.len ? [[a.x, a.y], a.path[a.path.length - 1]] : [[a.x, a.y]], sit: a.sit,
        fx: Object.keys(a.fxs).map(k => [k, Math.max(0, (PRANKS[k].dur - (T - a.fxs[k])) * 1000)]), drink: a.drink ? [a.drink.k, Math.max(0, (BAR.lasts - (T - a.drink.t0)) * 1000)] : null, buzz: buzzNow(a), busy: a.net !== null ? 'slot' : '', net: a.net || 0 }));
    },
    dispose() { api.stop(); document.removeEventListener('keydown', keyDown); document.removeEventListener('keyup', keyUp); for (const a of actors.values()) drop(a); actors.clear(); saloon.dispose(); renderer.dispose(); },
    _debug: { actors, fx, cam, camera, scene, renderer, pick, P, place, saloon, THREE },
  };
  return api;
}
