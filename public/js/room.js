// The clubhouse on screen: who is where, walking, sitting, talking, teasing — and what a click on it means.
// main.js feeds it what the server says (members, moves, chat, teasing, drinks) and gets clicks back through hooks.
import { ROOM, STATIONS, STATION, pathLen, posAt } from '../shared/room.js';
import { PRANKS, EMOTES, BAR } from '../shared/defs.js';
import { drawAvatar, drawPrank, INK } from './avatar.js';
import { KY, VIEW_H, V, paintBackground, paintStation, paintStool, paintLive, paintBartender, boundsOf, seatHeight } from './roomart.js';
import { play } from './sfx.js';

const TAU = Math.PI * 2, FONT = 'Fredoka, system-ui, sans-serif';
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const WORDS = { snow: 'BRRR!', tomato: 'SPLAT!', water: 'PLASK!', pie: 'KLASK!', banana: 'HOVSA!', feather: 'KILDE KILDE!', fart: 'PRUUT!', cloud: 'ØV!', chicken: 'GOK!', confetti: 'HURRA!', hug: 'KRAM!' };
const SOUNDS = { snow: 'puff', tomato: 'splat', water: 'splash', pie: 'splat', banana: 'slip', feather: 'giggle', fart: 'fart', cloud: 'rain', chicken: 'cluck', confetti: 'pop', hug: 'heart' };

export function createRoom(canvas, hooks) {
  const c = canvas.getContext('2d');
  const actors = new Map();              // user id -> what is drawn for that member (only those who are here)
  const fx = [];                         // things in the air: thrown objects, particles, words
  let me = 0, T = 0, last = 0, raf = 0, running = false;
  let s = 40, dpr = 1, cw = 0, ch = 0, ox = 0, oy = 0, camX = 0, camFree = false;
  let bg = null, pieces = [], stools = {}, builtFor = '', groupName = '';
  let labels = {}, hover = null, hintUntil = 0, soundOn = true, down = null;

  // ---------- layout and the pictures that are kept ----------
  function resize() {
    const r = canvas.getBoundingClientRect();
    cw = Math.max(50, r.width); ch = Math.max(50, r.height);
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
    s = ch / VIEW_H;
    if (ROOM.w * s > cw && ROOM.w * s < cw * 1.22) s = cw / ROOM.w;       // nearly fits: show the whole room
    s = clamp(s, 18, 96);
    oy = Math.max(0, (ch - VIEW_H * s) / 2);
    build();
  }
  function sheet(w, h, k, draw) {
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.ceil(w * k)); cv.height = Math.max(1, Math.ceil(h * k));
    const g = cv.getContext('2d'); g.scale(k, k); g.lineJoin = 'round'; g.lineCap = 'round';
    draw(g);
    return cv;
  }
  function build() {
    const k = s * dpr, key = k.toFixed(3) + '|' + groupName;
    if (builtFor === key) return;
    builtFor = key;
    bg = sheet(ROOM.w, VIEW_H, k, g => paintBackground(g, groupName));
    pieces = [];
    for (const st of STATIONS) {
      if (!st.box && !st.round) continue;
      const b = boundsOf(st), cv = sheet(b[2] - b[0], b[3] - b[1], k, g => { g.translate(-b[0], -b[1]); paintStation(g, st); });
      pieces.push({ key: st.box ? st.box[1] + st.box[3] : st.round[1] + st.round[3] * 0.5, cv, x: b[0], y: b[1], w: b[2] - b[0], h: b[3] - b[1] });
      for (const q of st.on ? [] : st.seats || []) pieces.push({ key: q[1], stool: st.high ? 'high' : 'low', x: q[0] - 0.5, y: V(q[1]) - 1.0, w: 1, h: 1.2 });
    }
    for (const kind of ['low', 'high']) stools[kind] = sheet(1, 1.2, k, g => { g.translate(0.5, 1.0 - V(0)); paintStool(g, 0, 0, kind === 'high'); });
    pieces.push({ key: STATION.bar.box[1] + 0.3, live: 'bartender' });
  }

  // ---------- actors ----------
  function actor(m) {
    const p = m.p && m.p.length ? m.p : [[ROOM.spawn[0], ROOM.spawn[1]]];
    const a = { id: m.id, name: m.name, look: m.look, dnd: m.dnd, path: p, len: pathLen(p), dist: 0, x: p[0][0], y: p[0][1], sit: m.sit || null, seated: false,
      moving: false, walk: 0, phase: 0, dir: 0, dirT: 0, hop: 0, emote: '', emoteAt: 0, fxs: {}, drink: null, buzz: m.buzz || 0, buzzAt: T, bubble: null,
      talkUntil: 0, seed: (m.id * 2.399) % 6.28, born: T };
    if (a.sit && p.length < 2) a.seated = true;
    for (const [k, left] of m.fx || []) if (PRANKS[k]) a.fxs[k] = T - Math.max(0, PRANKS[k].dur - left / 1000);
    if (m.drink) a.drink = { k: m.drink[0], t0: T - (BAR.lasts - m.drink[1] / 1000) };
    return a;
  }
  const seatOf = a => a.seated && a.sit && STATION[a.sit[0]] ? STATION[a.sit[0]] : null;
  function place(a) {            // where the avatar is drawn: [x, y, z, sort key]
    const st = seatOf(a);
    if (!st) return [a.x + (a.moving && a.buzz >= 3 ? Math.sin(T * 2.3 + a.seed) * 0.1 * Math.min(1, (a.buzz - 2) / 3) : 0), a.y, 0, a.y];
    const q = st.seats[a.sit[1]] || st.use;
    return [q[0], q[1], seatHeight(st), st.on ? st.box[1] + st.box[3] + 0.02 : q[1] + 0.01];
  }
  const buzzNow = a => Math.max(0, a.buzz - (T - a.buzzAt) / (BAR.soberMin * 60));
  const isHen = a => a.fxs.chicken !== undefined && T >= a.fxs.chicken;
  // how far the top of the head is above the spot the avatar is drawn at (a hen is small, a seated one lower)
  const topOf = a => isHen(a) ? 1.05 : (seatOf(a) ? 1.62 : 2.08) + (a.look.hat ? 0.34 : 0);

  function step(a, dt) {
    if (a.dist < a.len) {
      a.dist = Math.min(a.len, a.dist + ROOM.speed * dt);
      const [x, y, dx] = posAt(a.path, a.dist);
      a.x = x; a.y = y; a.moving = a.dist < a.len;
      if (Math.abs(dx) > 0.01) a.dirT = Math.sign(dx);
      if (!a.moving && a.sit) { a.seated = true; a.hop = 0.28; }
    } else a.moving = false;
    a.walk += ((a.moving ? 1 : 0) - a.walk) * Math.min(1, dt * 12);
    if (a.walk > 0.02) a.phase += dt * 11;
    a.dir += ((a.moving ? a.dirT : 0) - a.dir) * Math.min(1, dt * 8);
    if (a.hop > 0) a.hop = Math.max(0, a.hop - dt);
    if (a.emote && T - a.emoteAt > EMOTES[a.emote].dur) a.emote = '';
    for (const k of Object.keys(a.fxs)) if (T - a.fxs[k] > PRANKS[k].dur) delete a.fxs[k];
    if (a.drink && T - a.drink.t0 > BAR.lasts) a.drink = null;
    if (a.bubble && T > a.bubble.until) a.bubble = null;
    if (a.id === me && a.moving) camFree = false;
  }

  // ---------- drawing ----------
  const X = x => ox + x * s, Y = (y, z = 0) => oy + V(y, z) * s;

  function drawActor(a) {
    const [x, y, z] = place(a), k = s * 0.02, st = seatOf(a);
    const hop = a.hop > 0 ? Math.sin((1 - a.hop / 0.28) * Math.PI) * 0.22 : 0;
    const fxs = {};
    for (const key of Object.keys(a.fxs)) if (T >= a.fxs[key]) fxs[key] = T - a.fxs[key];
    let drink = '', fill = 1, sip = 0;
    if (a.drink) {
      const el = T - a.drink.t0, per = BAR.lasts / BAR.sips, n = Math.floor(el / per), u = el - n * per;
      drink = a.drink.k; fill = Math.max(0, 1 - n / BAR.sips);
      if (u > per - 1.6) sip = Math.sin((u - (per - 1.6)) / 1.6 * Math.PI) ** 0.6;
    }
    if (!st && !fxs.banana) { c.beginPath(); c.ellipse(X(x), Y(y), s * 0.42, s * 0.13, 0, 0, TAU); c.fillStyle = 'rgba(30,15,30,.22)'; c.fill(); }
    c.save();
    c.translate(X(x), Y(y, z + hop));
    const grow = Math.min(1, (T - a.born) * 4);
    c.scale(k * grow, k * grow);
    drawAvatar(c, a.look, { t: T, seed: a.seed, walk: a.walk, phase: a.phase, dir: a.dir, sit: !!st, emote: a.emote, et: T - a.emoteAt, fx: fxs,
      drink, fill, sip, buzz: buzzNow(a), talk: T < a.talkUntil ? 1 : 0 });
    c.restore();
  }

  function wrap(text, maxW) {
    const words = text.split(' '), lines = [];
    let cur = '';
    for (let w of words) {
      while (c.measureText(w).width > maxW) {            // a word longer than the bubble: cut it
        let n = w.length; while (n > 1 && c.measureText(w.slice(0, n)).width > maxW) n--;
        if (cur) { lines.push(cur); cur = ''; }
        lines.push(w.slice(0, n)); w = w.slice(n);
      }
      const t = cur ? cur + ' ' + w : w;
      if (c.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t;
    }
    if (cur) lines.push(cur);
    if (lines.length > 4) { lines.length = 4; lines[3] = lines[3].replace(/.{0,2}$/, '…'); }
    return lines;
  }

  function drawTag(a, placed) {
    const [x, y, z] = place(a), size = clamp(s * 0.25, 11, 15), cx = X(x);
    let top = Y(y, z + topOf(a)) - s * 0.08;
    c.font = '600 ' + size + 'px ' + FONT; c.textAlign = 'center'; c.textBaseline = 'middle';
    const name = a.name + (a.dnd ? ' ·zz' : ''), w = c.measureText(name).width + size * 1.1, h = size * 1.55;
    // two people close together: the second name goes above the first instead of on top of it
    for (let n = 0; n < 4 && placed.some(q => Math.abs(q[0] - cx) < (q[2] + w) / 2 - 2 && Math.abs(q[1] - top) < h); n++) top -= h + 2;
    placed.push([cx, top, w]);
    c.beginPath(); c.roundRect(cx - w / 2, top - h, w, h, h / 2); c.fillStyle = a.id === me ? 'rgba(255,179,71,.94)' : 'rgba(28,23,40,.72)'; c.fill();
    c.fillStyle = a.id === me ? '#2b1a08' : '#fff'; c.fillText(name, cx, top - h / 2 + 0.5);
    if (a.bubble) {
      const b = a.bubble, fs = clamp(s * 0.28, 12.5, 15.5), lh = fs * 1.28, age = T - b.at, pop = Math.min(1, age * 7), fade = Math.min(1, (b.until - T) * 3);
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

  function drawLabel(st, strong) {
    const b = hitBox(st), text = labels[st.id] || st.name, size = clamp(s * 0.26, 11, 15);
    c.font = '600 ' + size + 'px ' + FONT; c.textAlign = 'center'; c.textBaseline = 'middle';
    const mid = X((b[0] + b[2]) / 2);
    if (mid < 12 || mid > cw - 12) return;                       // the furniture is outside the picture: no label piling up at the edge
    const w = c.measureText(text).width + size * 1.4, h = size * 1.7, cx = clamp(mid, w / 2 + 4, cw - w / 2 - 4), y = Math.max(h + 2, oy + b[1] * s - 6);
    c.globalAlpha = strong ? 1 : 0.9;
    c.beginPath(); c.roundRect(cx - w / 2, y - h, w, h, h / 2); c.fillStyle = labels[st.id] ? '#ffb347' : 'rgba(28,23,40,.86)'; c.fill();
    c.fillStyle = labels[st.id] ? '#2b1a08' : '#fff'; c.fillText(text, cx, y - h / 2 + 0.5);
    c.globalAlpha = 1;
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = clamp((now - last) / 1000 || 0, 0, 0.1);          // the first frame can carry a time from before start()
    last = now; T += dt;
    for (const a of actors.values()) step(a, dt);
    // camera: the whole room when it fits, otherwise follow one's own avatar
    const roomW = ROOM.w * s, mine = actors.get(me);
    if (roomW <= cw) { ox = (cw - roomW) / 2; camX = 0; }
    else {
      if (mine && !camFree && !down) { const target = clamp(place(mine)[0] * s - cw / 2, 0, roomW - cw); camX += (target - camX) * Math.min(1, dt * 5); }
      camX = clamp(camX, 0, roomW - cw); ox = -camX;
    }
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, cw, ch);
    if (!bg) return;
    c.drawImage(bg, ox, oy, roomW, VIEW_H * s);
    c.save(); c.translate(ox, oy); c.scale(s, s); c.lineJoin = 'round'; c.lineCap = 'round'; paintLive(c, T, soundOn); c.restore();
    // furniture and people, the ones at the back first
    const list = pieces.map(p => ({ key: p.key, p }));
    for (const a of actors.values()) list.push({ key: place(a)[3], a });
    list.sort((u, v) => u.key - v.key);
    for (const it of list) {
      if (it.a) drawActor(it.a);
      else if (it.p.live) { c.save(); c.translate(ox, oy); c.scale(s, s); paintBartender(c, T); c.restore(); }
      else c.drawImage(it.p.stool ? stools[it.p.stool] : it.p.cv, X(it.p.x), oy + it.p.y * s, it.p.w * s, it.p.h * s);
    }
    drawFx(dt);
    const placed = [];
    for (const it of list) if (it.a) drawTag(it.a, placed);
    const showAll = T < hintUntil;
    for (const st of STATIONS) {
      if (!st.name) continue;
      if (hover === st || labels[st.id] || showAll) drawLabel(st, hover === st);
    }
  }

  // ---------- things in the air ----------
  function burst(x, y, z, n, opt) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, sp = (opt.speed || 2) * (0.4 + Math.random() * 0.8);
      fx.push({ kind: 'p', shape: opt.shape || 'dot', x, y, z, vx: Math.cos(a) * sp, vz: (opt.up || 1.5) + Math.sin(a) * sp * 0.6 + Math.random(), g: opt.g === undefined ? 7 : opt.g,
        t: 0, life: (opt.life || 0.8) * (0.6 + Math.random() * 0.6), col: opt.cols[i % opt.cols.length], size: (opt.size || 0.08) * (0.6 + Math.random() * 0.8), rot: Math.random() * 6, vr: (Math.random() - 0.5) * 12 });
    }
  }
  function word(text, x, y, z, col = '#fff') { fx.push({ kind: 'w', text, x, y, z, t: 0, life: 1.3, col }); }
  const headOf = a => { const [x, y, z] = place(a); return [x, y, z + (isHen(a) ? 0.85 : seatOf(a) ? 1.02 : 1.48)]; };

  function land(k, a) {
    a.fxs[k] = T;
    if (k === 'chicken') a.emote = '';
    const [x, y, z] = headOf(a);
    play(SOUNDS[k]);
    word(WORDS[k], x, y, z + 1.0, k === 'hug' || k === 'confetti' ? '#ffd3e6' : '#fff');
    if (k === 'tomato') burst(x, y, z, 14, { cols: ['#e2403a', '#c8323c', '#f7d774'], speed: 2.4 });
    else if (k === 'snow') burst(x, y, z, 16, { cols: ['#fff', '#dcebfa'], speed: 2.2 });
    else if (k === 'water') burst(x, y, z, 22, { cols: ['#63bdf2', '#9fd8fa'], speed: 3, life: 0.9 });
    else if (k === 'pie') burst(x, y, z, 14, { cols: ['#fffaf0', '#f4e6c8'], speed: 2 });
    else if (k === 'chicken') burst(x, y, z - 0.4, 18, { cols: ['#fff', '#ece8df'], speed: 2.4, shape: 'feather', g: 2.5, life: 1.5 });
    else if (k === 'confetti') for (let i = 0; i < 46; i++) fx.push({ kind: 'p', shape: 'rect', x: x + (Math.random() - 0.5) * 1.6, y, z: z + 1.4 + Math.random() * 0.8, vx: (Math.random() - 0.5) * 0.8, vz: -0.3 - Math.random(), g: 1.2, t: 0, life: 2 + Math.random(), col: ['#e2403a', '#f2c33f', '#3fb6e0', '#58b85f', '#f25a8e', '#b07cff'][i % 6], size: 0.07 + Math.random() * 0.05, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 16 });
    else if (k === 'banana') burst(x, y, 0.2, 6, { cols: ['#f5d142'], speed: 1.6, shape: 'star' });
    else if (k === 'fart') burst(x - 0.3, y, 0.7, 8, { cols: ['#9ccf4a', '#b9e06a'], speed: 1, g: -0.6, life: 1.4, size: 0.14 });
  }

  function drawFx(dt) {
    for (let i = fx.length - 1; i >= 0; i--) {
      const f = fx[i];
      f.t += dt;
      if (f.kind === 'fly') {
        const to = actors.get(f.to);
        if (!to) { fx.splice(i, 1); continue; }
        const u = Math.min(1, f.t / f.dur), [tx, ty, tz] = headOf(to);
        const x = f.x + (tx - f.x) * u, y = f.y + (ty - f.y) * u, z = f.z + (tz - f.z) * u + Math.sin(u * Math.PI) * 1.4;
        c.save(); c.translate(X(x), Y(y, z)); c.rotate(f.t * 9); c.scale(s * 0.03, s * 0.03); drawPrank(c, f.k); c.restore();
        if (u >= 1) { fx.splice(i, 1); land(f.k, to); }
        continue;
      }
      if (f.t >= f.life) { fx.splice(i, 1); continue; }
      const u = f.t / f.life;
      if (f.kind === 'w') {
        const size = clamp(s * 0.42, 15, 26) * (0.6 + Math.min(1, f.t * 8) * 0.4);
        c.save(); c.globalAlpha = Math.min(1, (1 - u) * 2.5); c.translate(X(f.x), Y(f.y, f.z + u * 0.7)); c.rotate(-0.08);
        c.font = '700 ' + size + 'px ' + FONT; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round';
        c.lineWidth = size * 0.28; c.strokeStyle = INK; c.strokeText(f.text, 0, 0); c.fillStyle = f.col; c.fillText(f.text, 0, 0);
        c.restore();
        continue;
      }
      f.x += f.vx * dt; f.z += f.vz * dt; f.vz -= f.g * dt; f.rot += f.vr * dt;
      if (f.z < 0 && f.g > 0) { f.z = 0; f.vz = 0; f.vx *= 0.5; }
      c.save(); c.globalAlpha = Math.min(1, (1 - u) * 3); c.translate(X(f.x), Y(f.y, f.z)); c.rotate(f.rot);
      const r = f.size * s;
      c.fillStyle = f.col;
      if (f.shape === 'rect') c.fillRect(-r, -r * 0.5, r * 2, r);
      else if (f.shape === 'star') { c.beginPath(); for (let j = 0; j < 10; j++) { const a = j * Math.PI / 5, q = j % 2 ? r * 0.5 : r * 1.2; c.lineTo(Math.cos(a) * q, Math.sin(a) * q); } c.fill(); }
      else if (f.shape === 'feather') { c.beginPath(); c.ellipse(0, 0, r * 1.6, r * 0.6, 0, 0, TAU); c.fill(); }
      else { c.beginPath(); c.arc(0, 0, r, 0, TAU); c.fill(); }
      c.restore();
    }
  }

  // ---------- clicks ----------
  // The part of a piece of furniture one can click: [left, top, right, bottom] in room units (picture space).
  function hitBox(st) {
    if (st.wall) { const [x, z, w, h] = st.wall; return [x, V(0, z + h), x + w, V(0, z)]; }
    if (st.floor) { const [cx, cy, r] = st.floor; return [cx - r, V(cy - r), cx + r, V(cy + r)]; }
    if (st.box) { const [x, y, w, d] = st.box; return [x, V(y, st.h), x + w, V(y + d)]; }
    const [cx, cy, rx, ry] = st.round; return [cx - rx, V(cy - ry, st.h), cx + rx, V(cy + ry)];
  }
  function pick(px, py) {
    let best = null;
    for (const a of actors.values()) {
      const [x, y, z, key] = place(a), ax = X(x), ay = Y(y, z);
      if (Math.abs(px - ax) < s * 0.5 && py < ay + s * (seatOf(a) ? 0.5 : 0.1) && py > ay - s * (topOf(a) + 0.1) && (!best || key > best.key)) best = { actor: a, key };
    }
    if (best) return best;
    const u = (px - ox) / s, v = (py - oy) / s;
    for (const st of STATIONS) {
      if (!st.name) continue;
      const b = hitBox(st);
      if (u >= b[0] && u <= b[2] && v >= b[1] && v <= b[3]) { const key = st.box ? st.box[1] + st.box[3] : st.round ? st.round[1] : 0; if (!best || key > best.key) best = { station: st, key }; }
    }
    if (best) return best;
    const y = (v - V(0)) / KY;
    if (u >= 0 && u <= ROOM.w && y >= -0.3 && y <= ROOM.d + 0.4) return { floor: [clamp(u, 0, ROOM.w), clamp(y, 0, ROOM.d)] };
    return null;
  }
  const local = e => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };

  canvas.addEventListener('pointerdown', e => {
    if (e.button) return;
    down = { x: e.clientX, cam: camX, moved: false };
    try { canvas.setPointerCapture(e.pointerId); } catch {}
  });
  canvas.addEventListener('pointermove', e => {
    if (down) {
      const dx = e.clientX - down.x;
      if (Math.abs(dx) > 9) down.moved = true;
      if (down.moved && ROOM.w * s > cw) { camX = clamp(down.cam - dx, 0, ROOM.w * s - cw); camFree = true; }
      return;
    }
    if (e.pointerType !== 'mouse') return;
    const hit = pick(...local(e));
    hover = hit && hit.station ? hit.station : null;
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
    else { hooks.onFloor(hit.floor[0], hit.floor[1]); fx.push({ kind: 'p', shape: 'dot', x: hit.floor[0], y: hit.floor[1], z: 0.02, vx: 0, vz: 0, g: 0, t: 0, life: 0.35, col: 'rgba(255,255,255,.7)', size: 0.09, rot: 0, vr: 0 }); }
  });
  canvas.addEventListener('pointercancel', () => { down = null; });

  // ---------- what main.js calls ----------
  return {
    resize,
    start() { if (running) return; running = true; resize(); last = performance.now(); raf = requestAnimationFrame(frame); },
    stop() { running = false; cancelAnimationFrame(raf); },
    setSound(on) { soundOn = on; },
    setName(name) { groupName = name; if (running) build(); },
    setLabels(l) { labels = l; },
    hint(seconds = 7) { hintUntil = T + seconds; },
    here: id => actors.has(id),
    count: () => actors.size,

    // the whole room at once (on entering), and one member coming, changing or going
    setRoom(members, myId) {
      me = myId; actors.clear(); fx.length = 0; camFree = false;
      for (const m of members) if (m.on) actors.set(m.id, actor(m));
      const mine = actors.get(me);
      if (mine) { mine.born = T - 1; camX = clamp(mine.x * s - cw / 2, 0, Math.max(0, ROOM.w * s - cw)); }
    },
    join(m) { actors.set(m.id, actor(m)); if (m.id !== me) play('door'); },
    leave(id) { const a = actors.get(id); if (a) { const [x, y] = place(a); burst(x, y, 1, 10, { cols: ['#fff', '#e9e3f5'], speed: 1.6, g: -0.5, size: 0.12 }); } actors.delete(id); },
    patch(m) { const a = actors.get(m.id); if (!a) return; if (m.look) a.look = m.look; if (m.name) a.name = m.name; if ('dnd' in m) a.dnd = m.dnd; },

    move(id, path, sit) {
      const a = actors.get(id);
      if (!a || !path || !path.length) return;
      const wasSeated = a.seated, dx = a.x - path[0][0], dy = a.y - path[0][1], off = Math.sqrt(dx * dx + dy * dy);
      // start from where the avatar is drawn now, so it does not jump (unless it gets up from a seat)
      a.path = !wasSeated && off > 0.05 && off < 2 ? [[a.x, a.y], ...path] : path;
      a.len = pathLen(a.path); a.dist = 0; a.sit = sit || null; a.seated = false;
      a.x = a.path[0][0]; a.y = a.path[0][1];
      if (a.len < 0.01 && a.sit) { a.seated = true; a.hop = 0.28; }
      if (wasSeated) a.hop = 0.2;
    },
    say(id, text) {
      const a = actors.get(id);
      if (!a) return;
      const hen = a.fxs.chicken !== undefined;
      a.bubble = { text: (hen ? 'Gok gok! ' : '') + text, at: T, until: T + clamp(3.5 + text.length * 0.06, 4, 9) };
      a.talkUntil = T + clamp(text.length * 0.07, 0.8, 3);
    },
    emote(id, k) { const a = actors.get(id); if (a && EMOTES[k] && a.fxs.chicken === undefined) { a.emote = k; a.emoteAt = T; if (id === me || k === 'cheers') play(k === 'cheers' ? 'clink' : 'pop'); } },

    prank(k, from, to) {
      const a = actors.get(from), b = actors.get(to);
      if (!b || !PRANKS[k]) return;
      if (PRANKS[k].fly && a) {
        const [x, y, z] = place(a);
        a.emote = 'wave'; a.emoteAt = T - 1.9;                       // a quick throwing arm
        fx.push({ kind: 'fly', k, x, y, z: z + 1.3, to, t: 0, dur: 0.55 });
        play('throw');
      } else {
        land(k, b);
        if (k === 'hug' && a) { a.fxs.hug = T; }
      }
    },
    drink(k, from, to, buzz) {
      to.forEach((id, i) => {
        const a = actors.get(id);
        if (!a) return;
        a.drink = { k, t0: T }; a.buzz = buzz[i] || 0; a.buzzAt = T;
        const [x, y, z] = place(a);
        burst(x + 0.4, y, z + 1.0, 5, { cols: ['#fff8e8', '#ffd45e'], speed: 0.9, size: 0.05, life: 0.5 });
      });
      play(to.length > 1 ? 'cheers' : 'pour');
      if (to.length > 1) { const a = actors.get(from); if (a) { const [x, y, z] = place(a); word('SKÅL!', x, y, z + 2.4, '#ffd45e'); } }
    },
    // where on the canvas an avatar's head is (for a menu next to it)
    screenOf(id) { const a = actors.get(id); if (!a) return null; const [x, y, z] = place(a); return [X(x), Y(y, z + topOf(a))]; },
    _debug: { actors, get s() { return s; }, pick, X, Y, place },
  };
}
