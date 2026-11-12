// SLQ Game Lobby — the shooter in the browser. One player's view of a match: it draws the arena, moves the
// player with the arena's own movement rules, shows the others where the server says they are, and tells the
// server where one is and what one shoots. Health, kills, pickups, stars and rounds are the server's to decide
// (server/arena.js); what is shown here before the server has answered (a hit marker, a bullet hole) is a guess.
import * as THREE from './vendor/three.module.min.js';
import { buildWorld, EYE } from './world.js';
import { makeTextures } from './tex.js';
import { makeSfx } from './sfx.js';
import { makeFx } from './fx.js';
import { makeViewModel } from './viewmodel.js';
import { makeFigures } from './figure.js';
import { mergeStatic } from './merge.js';
import { WEAPONS, WEAPON_IDS, MODES, ARENA, TEAMS, FLAG, LEVELS, other, aimDir, spreadDir, zoneAt, dinoAt, newShot, flyShot } from './rules.js';

const SENS = 0.0022, PITCH_MAX = 1.5, BASE_FOV = 78, ZOOM_FOV = 32, INTERP = 100;      // INTERP: how far behind the others are shown (ms)
const DEG = Math.PI / 180;
const TAG = { A: '#ff9aa0', B: '#9cc2ff', '': '#ffd98a' };
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const angLerp = (a, b, t) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return a + d * t; };

// root: the element the game fills. info: the server's 'ain' message. send(obj): to the server.
// sound: start with sound on. leave(): the player wants back to the clubhouse.
export function startGame({ root, info, send, sound = true, leave }) {
  const you = info.you, mode = MODES[info.mode], teams = mode.teams;

  // ---------- the page ----------
  const canvas = el('canvas', 'sh-canvas');
  const hud = el('div', 'sh-hud');
  const H = {};
  for (const [k, cls] of Object.entries({ cross: 'sh-cross', hit: 'sh-hit', score: 'sh-score', feed: 'sh-feed', note: 'sh-note', big: 'sh-big', dmg: 'sh-dmg', arrow: 'sh-arrow', scope: 'sh-scope', stat: 'sh-stat', dead: 'sh-dead', shield: 'sh-shield' })) hud.append(H[k] = el('div', cls));
  for (let i = 0; i < 4; i++) H.cross.append(el('i'));
  H.health = el('div', 'sh-health'); H.hpBar = el('i'); H.hpNum = el('b', '', '100');
  const bar = el('div', 'sh-bar'); bar.append(H.hpBar); H.health.append(bar, H.hpNum); hud.append(H.health);
  H.weapon = el('div', 'sh-weapon'); H.wName = el('b'); H.wAmmo = el('span'); H.slots = el('div', 'sh-slots');
  WEAPON_IDS.forEach((id, i) => { const s = el('i', '', String(i + 1)); s.title = WEAPONS[id].name; H.slots.append(s); });
  H.weapon.append(H.wName, H.wAmmo, H.slots); hud.append(H.weapon);
  const board = el('div', 'sh-board'); board.hidden = true;
  const menu = el('div', 'sh-menu');
  root.replaceChildren(canvas, hud, board, menu);

  // ---------- three.js ----------
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x8fb7d6); scene.fog = new THREE.Fog(0x8fb7d6, 70, 230);
  const camera = new THREE.PerspectiveCamera(BASE_FOV, 16 / 9, 0.08, 500);
  scene.add(camera);
  scene.add(new THREE.HemisphereLight(0xbcd7ef, 0x41474e, 0.85));
  const sun = new THREE.DirectionalLight(0xfff1d8, 2.4);
  sun.position.set(34, 54, 26); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 10; sun.shadow.camera.far = 160; sun.shadow.camera.left = -46; sun.shadow.camera.right = 46; sun.shadow.camera.top = 46; sun.shadow.camera.bottom = -46;
  sun.shadow.bias = -0.0004;
  scene.add(sun, new THREE.AmbientLight(0xffffff, 0.18));

  const world = buildWorld(THREE, scene, makeTextures(THREE));
  // everything that stands still is joined into a few big pieces (the wagons of the train move, so they are left)
  const merged = mergeStatic(THREE, scene, new Set(world.trainCars.map(c => c.grp)));
  const fx = makeFx(THREE, scene, world.PICKUPS, world.HEALTH_PACKS);
  const vm = makeViewModel(THREE, camera);
  const figures = makeFigures(THREE);
  const euler = new THREE.Euler(0, 0, 0, 'YXZ'), YUP = new THREE.Vector3(0, 1, 0), V = new THREE.Vector3();

  // How fine the picture is: the lines drawn at most, whether there are shadows, and how often they are redrawn.
  const QUALITY = [{ name: 'Lavest', maxH: 480, shadows: 0 }, { name: 'Lav', maxH: 720, shadows: 3 }, { name: 'Mellem', maxH: 1080, shadows: 2 }, { name: 'Høj', maxH: 1440, shadows: 1 }];
  let quality = 2;
  try { const q = localStorage.getItem('slq-shooter-q'); if (q !== null && QUALITY[+q]) quality = +q; } catch { /* no storage */ }
  sun.shadow.autoUpdate = false;
  function resize() {
    const w = Math.max(320, root.clientWidth), h = Math.max(200, root.clientHeight), dpr = window.devicePixelRatio || 1, q = QUALITY[quality];
    renderer.setPixelRatio(Math.max(0.4, Math.min(dpr, q.maxH / h, 2))); renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    sun.castShadow = q.shadows > 0;
  }
  const ro = new ResizeObserver(resize); ro.observe(root); resize();

  // ---------- me ----------
  const me = world.newWalker(0, TEAMS.B.baseZ, 0);
  me.yaw = 0; me.pitch = 0;
  const my = { hp: 100, alive: false, seq: -1, owned: 1, w: 0, mags: WEAPON_IDS.map(id => WEAPONS[id].magMax || 0), fireCd: 0, reload: 0, zoom: false, protect: 0, team: '', deadT: 0, killer: '' };
  const sfx = makeSfx(me);
  if (!sound && !sfx.isMuted()) sfx.toggleMute(); else if (sound && sfx.isMuted()) sfx.toggleMute();
  const keys = {};
  let running = false, forceRun = false, frozen = false, stopped = false, mouseDown = false, jumpBuf = 0, recoilLeft = 0, bobT = 0, dip = 0, shake = 0, kick = 0, swayX = 0, swayY = 0, stepAcc = 0, useHeld = 0;
  let offset = info.ms - performance.now(), bestRtt = 1e9, ping = 0, pingT = 0, pings = 0, sendT = 0, shotId = 1, frames = 0, frameNo = 0, fpsT = 0, fps = 60, slowT = 0;
  const serverNow = () => performance.now() + offset;

  // ---------- the match ----------
  const ents = new Map(), dinos = new Map(), shots = [], effects = [], feed = [];
  let state = 'countdown', left = 0, timeAt = 0, time0 = 0, stars = [0, 0], tkills = [0, 0], trainStar = false, wait = '', winner = null, rows = null, lastBeep = -1, noteT = 0, bigT = 0, hitT = 0, dmgT = 0, arrowT = 0, boardKey = false;
  const trainStarMesh = fx.makeStar(1.6); trainStarMesh.visible = false; scene.add(trainStarMesh);
  const towerStars = { A: [], B: [] };
  const bulletGeo = new THREE.CylinderGeometry(0.028, 0.028, 0.5, 6), bulletMat = new THREE.MeshStandardMaterial({ color: 0xffd27a, emissive: 0xffa838, emissiveIntensity: 0.9 });
  const rocketGeo = new THREE.SphereGeometry(0.18, 10, 8), rocketMat = new THREE.MeshStandardMaterial({ color: 0x333333, emissive: 0x552200, emissiveIntensity: 0.4 });
  const dinoBulletMat = new THREE.MeshStandardMaterial({ color: 0xffaa55, emissive: 0xff6622, emissiveIntensity: 0.85 });
  const boomGeo = new THREE.SphereGeometry(0.4, 16, 12);

  const isEnemy = e => e.id !== you && (!teams || e.team !== my.team);
  const nameOf = id => { const e = ents.get(id); return e ? e.name : '?'; };

  function setEnt(a) {
    const old = ents.get(a.id);
    if (old && old.fig) { scene.remove(old.fig.group); old.fig.dispose(); }
    const e = { id: a.id, name: a.n, look: a.look, team: a.team, bot: !!a.bot, k: old ? old.k : a.k || 0, d: old ? old.d : a.d || 0, alive: !!a.alive, buf: [], pos: { x: 0, y: -50, z: 0 }, fig: null, protect: false };
    if (a.id === you) { my.team = a.team; }
    else {
      const friend = teams && a.team === my.team;
      e.fig = figures.make(a.look, { team: a.team, bot: e.bot, name: a.n, tag: TAG[teams ? a.team : ''] });
      e.fig.friend = friend; e.fig.group.visible = false;
      scene.add(e.fig.group);
    }
    ents.set(a.id, e);
  }
  function delEnt(id) { const e = ents.get(id); if (e && e.fig) { scene.remove(e.fig.group); e.fig.dispose(); } ents.delete(id); }
  // when I change sides, friend and foe change for everybody
  function retag() { for (const e of ents.values()) if (e.fig) e.fig.friend = teams && e.team === my.team; }

  function setDino(id, team, x, z) {
    const g = fx.buildDino(team); g.position.set(x, 0, z); scene.add(g);
    dinos.set(id, { id, team, group: g, x, z, yaw: 0, tx: x, tz: z, tyaw: 0, flash: 0 });
  }
  function syncTowerStars() {
    ['A', 'B'].forEach((t, ti) => {
      const arr = towerStars[t], T = TEAMS[t];
      while (arr.length < stars[ti]) { const i = arr.length, a = i * (Math.PI * 2 / 5), s = fx.makeStar(1.0); s.position.set(T.cx + Math.cos(a) * 1.9, T.deck + 1.3, T.cz + Math.sin(a) * 1.9); scene.add(s); arr.push(s); }
      while (arr.length > stars[ti]) { const s = arr.pop(); scene.remove(s); s.geometry.dispose(); }
    });
  }

  // ---------- words on the screen ----------
  function note(text, secs = 1.6) { H.note.textContent = text; H.note.style.opacity = '1'; noteT = secs; }
  function big(text, secs = 1.2, cls = '') { H.big.textContent = text; H.big.className = 'sh-big ' + cls; H.big.style.opacity = '1'; bigT = secs; }
  function addFeed(a, aTeam, w, b, bTeam, hs) {
    const row = el('div'), who = (n, t) => { const s = el('b', t === 'A' ? 'rd' : t === 'B' ? 'bl' : '', n); return s; };
    if (a) row.append(who(a, aTeam));
    row.append(el('span', '', (hs ? '◎ ' : '') + w));
    row.append(who(b, bTeam));
    H.feed.append(row); feed.push({ row, t: 6 });
    while (feed.length > 5) feed.shift().row.remove();
  }
  function scoreLine() {
    const tl = Math.max(0, Math.ceil(mode.time - (state === 'active' ? time0 + (performance.now() - timeAt) / 1000 : time0)));
    const clock = Math.floor(tl / 60) + ':' + String(tl % 60).padStart(2, '0');
    H.score.replaceChildren();
    if (teams) {
      const v = info.mode === 'stars' ? stars : tkills, star = info.mode === 'stars' ? ' ★ ' : ' ';
      H.score.append(el('b', 'rd', 'RØD'), el('span', 'st', star), el('b', '', String(v[0])), el('span', '', ' — '), el('b', '', String(v[1])), el('span', 'st', star), el('b', 'bl', 'BLÅ'), el('em', '', clock));
    } else {
      let lead = null; for (const e of ents.values()) if (!lead || e.k > lead.k) lead = e;
      const mine = ents.get(you);
      H.score.append(el('b', '', 'Du: ' + (mine ? mine.k : 0)), el('span', '', '  ·  '), el('b', '', 'Fører: ' + (lead ? lead.name + ' ' + lead.k : '–')), el('em', '', clock));
    }
  }
  function weaponHud() {
    const id = WEAPON_IDS[my.w], w = WEAPONS[id];
    H.wName.textContent = w.name;
    H.wAmmo.textContent = w.melee ? '' : my.reload > 0 ? 'lader …' : my.mags[my.w] + ' / ' + w.magMax;
    [...H.slots.children].forEach((s, i) => { s.className = (my.owned & (1 << i) ? 'own' : '') + (i === my.w ? ' on' : ''); });
    vm.set(id);
  }
  function healthHud() { H.hpBar.style.width = Math.max(0, my.hp) + '%'; H.hpNum.textContent = String(Math.max(0, my.hp)); H.health.classList.toggle('low', my.hp <= 35); }
  function drawBoard() {
    const list = [...ents.values()], col = (title, cls, t, score) => {
      const c = el('div', 'col ' + cls); c.append(el('div', 'hd', title + (score !== null ? '   ' + score : '')));
      const head = el('div', 'row lbl'); head.append(el('span', '', 'spiller'), el('span', '', 'drab / død')); c.append(head);
      list.filter(e => t === null || e.team === t).sort((a, b) => b.k - a.k || a.d - b.d).forEach(e => {
        const r = el('div', 'row' + (e.id === you ? ' me' : '')), paid = rows && rows.find(x => x.id === e.id);
        r.append(el('span', '', (e.bot ? '🤖 ' : '') + e.name + (paid && paid.chips ? '  +' + paid.chips + ' jetoner' : '')), el('span', 'kd', e.k + ' / ' + e.d));
        c.append(r);
      });
      return c;
    };
    board.replaceChildren();
    let title = mode.name + ' · robotter: ' + (info.fill ? LEVELS[info.level - 1].toLowerCase() : 'ingen');
    if (state === 'ended') title = winner === null ? 'Uafgjort' : teams ? TEAMS[winner].name.toUpperCase() + ' HOLD VANDT!' : nameOf(winner) + ' vandt!';
    board.append(el('div', 'title' + (state === 'ended' ? ' win' : ''), title));
    const cols = el('div', 'cols');
    if (teams) { const v = info.mode === 'stars' ? stars : tkills, u = info.mode === 'stars' ? '★ ' : ''; cols.append(col('Rødt hold', 'rd', 'A', u + v[0]), col('Blåt hold', 'bl', 'B', u + v[1])); }
    else cols.append(col('Alle mod alle', '', null, null));
    board.append(cols);
    if (state === 'ended') board.append(el('div', 'next', 'Næste runde om lidt …'));
  }
  function showBoard(on) { if (on) drawBoard(); board.hidden = !on; }

  // ---------- the menu (when the mouse is free) ----------
  function drawMenu() {
    menu.replaceChildren();
    const box = el('div', 'box');
    box.append(el('h2', '', mode.name), el('p', '', mode.text));
    const keysList = el('div', 'keys');
    for (const [k, t] of [['W A S D', 'gå'], ['Shift', 'løb'], ['Mellemrum', 'hop'], ['Mus', 'sigt og skyd'], ['Højre museknap', 'kikkert (snigskytte)'], ['1–5 / hjul', 'skift våben'], ['R', 'lad'], ['E', info.mode === 'stars' ? 'tag / stjæl stjerne' : '—'], ['Tab', 'stillingen'], ['M', 'lyd til/fra'], ['T', 'grafik'], ['Esc', 'denne menu']]) {
      if (t === '—') continue;
      const r = el('div'); r.append(el('kbd', '', k), el('span', '', t)); keysList.append(r);
    }
    box.append(keysList);
    const go = el('button', 'btn big', my.seq < 0 ? 'Venter på banen …' : 'Spil');
    go.addEventListener('click', e => { e.stopPropagation(); lock(); });
    const row = el('div', 'row');
    if (teams) { const b = el('button', 'btn alt small', 'Skift til ' + TEAMS[other(my.team || 'A')].name.toLowerCase() + ' hold'); b.addEventListener('click', e => { e.stopPropagation(); send({ t: 'at' }); }); row.append(b); }
    const snd = el('button', 'btn alt small', 'Lyd: ' + (sfx.isMuted() ? 'fra' : 'til')); snd.addEventListener('click', e => { e.stopPropagation(); sfx.unlock(); sfx.toggleMute(); drawMenu(); }); row.append(snd);
    const ql = el('button', 'btn alt small', 'Grafik: ' + QUALITY[quality].name.toLowerCase()); ql.addEventListener('click', e => { e.stopPropagation(); setQuality((quality + 1) % QUALITY.length); drawMenu(); }); row.append(ql);
    const out = el('button', 'btn alt small', 'Tilbage til klubhuset'); out.addEventListener('click', e => { e.stopPropagation(); leave(); }); row.append(out);
    box.append(go, row);
    menu.append(box);
  }
  function setQuality(q) { quality = q; try { localStorage.setItem('slq-shooter-q', String(q)); } catch { /* no storage */ } resize(); }
  function lock() { sfx.unlock(); try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch { /* the browser said no: the menu stays */ } }
  function setRunning(on) {
    running = on;
    menu.hidden = on; hud.classList.toggle('paused', !on);
    if (!on) { for (const k of Object.keys(keys)) keys[k] = false; mouseDown = false; setZoom(false); drawMenu(); }
  }

  // ---------- input ----------
  const onLock = () => setRunning(document.pointerLockElement === canvas || forceRun);
  const onMove = e => {
    if (!running || !my.alive) return;
    const k = SENS * (my.zoom ? ZOOM_FOV / BASE_FOV : 1);
    me.yaw -= e.movementX * k; me.pitch = Math.max(-PITCH_MAX, Math.min(PITCH_MAX, me.pitch - e.movementY * k));
    swayX = Math.max(-1, Math.min(1, swayX + e.movementX * 0.004)); swayY = Math.max(-1, Math.min(1, swayY + e.movementY * 0.004));
  };
  const onDown = e => { if (!running) return; if (e.button === 0) { mouseDown = true; fire(true); } if (e.button === 2) setZoom(true); };
  const onUp = e => { if (e.button === 0) mouseDown = false; if (e.button === 2) setZoom(false); };
  const onMenu = e => { if (running) e.preventDefault(); };
  function setZoom(on) {
    my.zoom = !!on && !!WEAPONS[WEAPON_IDS[my.w]].zoom && my.alive;
    H.scope.style.opacity = my.zoom ? '1' : '0'; vm.group.visible = !my.zoom;
  }
  function switchTo(i) {
    if (i === my.w || !(my.owned & (1 << i)) || !my.alive) return;
    my.w = i; my.reload = 0; my.fireCd = Math.max(my.fireCd, 0.2); setZoom(false); weaponHud();
  }
  const onKey = e => {
    if (stopped) return;
    if (['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    if (e.repeat) return;
    keys[e.code] = true;
    if (e.code === 'Tab') { boardKey = true; showBoard(true); return; }
    if (e.code === 'KeyM') { note(sfx.toggleMute() ? 'Lyd: fra' : 'Lyd: til'); return; }
    if (!running) return;
    if (e.code === 'Space') jumpBuf = 0.14;
    if (e.code.startsWith('Digit')) switchTo(+e.code.slice(5) - 1);
    if (e.code === 'KeyR') reload();
    if (e.code === 'KeyT') { setQuality((quality + 1) % QUALITY.length); note('Grafik: ' + QUALITY[quality].name.toLowerCase()); }
  };
  const onKeyUp = e => { keys[e.code] = false; if (e.code === 'Tab') { boardKey = false; if (state !== 'ended') showBoard(false); } };
  const onWheel = e => {
    if (!running) return;
    const list = WEAPON_IDS.map((_, i) => i).filter(i => my.owned & (1 << i));
    switchTo(list[(list.indexOf(my.w) + (e.deltaY > 0 ? 1 : list.length - 1)) % list.length]);
  };
  const onVis = () => { last = performance.now(); };
  document.addEventListener('pointerlockchange', onLock);
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mousedown', onDown);
  document.addEventListener('mouseup', onUp);
  document.addEventListener('contextmenu', onMenu);
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('wheel', onWheel, { passive: true });
  document.addEventListener('visibilitychange', onVis);
  menu.addEventListener('click', () => lock());

  // ---------- shooting ----------
  function reload() {
    const w = WEAPONS[WEAPON_IDS[my.w]];
    if (w.melee || my.reload > 0 || my.mags[my.w] >= w.magMax) return;
    my.reload = w.reload; sfx.reloadS(); weaponHud();
  }
  // first: the trigger was just pulled (the knife and an empty click need that; the rest fires as long as it is held)
  function fire(first) {
    if (!my.alive || my.fireCd > 0 || my.reload > 0) return;
    if (state !== 'active') { if (first) note('Vent til runden er i gang'); return; }
    const id = WEAPON_IDS[my.w], w = WEAPONS[id], o = [me.x, me.y + EYE, me.z];
    if (w.melee) {
      if (!first) return;
      my.fireCd = w.rate; kick = 1; sfx.shoot('knife');
      send({ t: 'af', w: my.w, o: o.map(r2), d: aimDir(me.yaw, me.pitch).map(r3), i: shotId++ });
      return;
    }
    if (my.mags[my.w] <= 0) { if (first) sfx.empty(); reload(); return; }
    my.mags[my.w]--; my.fireCd = w.rate; my.protect = 0;
    // rekyl: kast kameraet op + lidt til siden, 60 % giver sig igen
    me.pitch = Math.min(PITCH_MAX, me.pitch + w.rKick * DEG); me.yaw += (Math.random() - 0.5) * 2 * w.rYaw * DEG; recoilLeft += w.rKick * DEG * 0.6;
    let sp = w.spread;
    if (my.zoom && w.spreadADS != null) sp = w.spreadADS; else if (!me.grounded) sp *= 2.6; else if (Math.hypot(me.vx, me.vz) > 1) sp *= 1.7;
    const d = spreadDir(aimDir(me.yaw, me.pitch), sp, Math.random), s = newShot(o, d, w.speed, w.grav);
    addShot(s, !!w.splash, { own: true, wi: my.w, id: shotId });
    send({ t: 'af', w: my.w, o: o.map(r2), d: d.map(r3), i: shotId++ });
    sfx.shoot(id); kick = 1;
    fx.flashMuzzle(V.set(o[0] + d[0] * 0.9, o[1] + d[1] * 0.9, o[2] + d[2] * 0.9));
    if (my.mags[my.w] <= 0) reload();
    weaponHud();
  }
  const r2 = v => Math.round(v * 100) / 100, r3 = v => Math.round(v * 1000) / 1000;
  function addShot(s, rocket, extra, material) {
    const mesh = new THREE.Mesh(rocket ? rocketGeo : bulletGeo, material || (rocket ? rocketMat : bulletMat));
    mesh.position.set(s.x, s.y, s.z); scene.add(mesh);
    shots.push(Object.assign({ s, mesh, rocket }, extra));
  }
  function boom(p, mine) {
    sfx.explosion(p[0], p[2]);
    V.set(p[0], p[1], p[2]);
    fx.spawnParticles(V, 0xffa040, 24, 9, 0.8, 1.4); fx.spawnParticles(V, 0x555555, 14, 5, 1.2, 1.6);
    const m = new THREE.Mesh(boomGeo, new THREE.MeshBasicMaterial({ color: 0xffa030, transparent: true, opacity: 0.9 }));
    m.position.copy(V); scene.add(m); effects.push({ obj: m, t: 0, ttl: 0.32, grow: 5 });
    const d = Math.hypot(me.x - p[0], me.y + 1 - p[1], me.z - p[2]);
    if (d < 18) shake = Math.max(shake, (mine ? 0.5 : 1) * (1 - d / 18));
  }
  function updateShots(dt) {
    for (let i = shots.length - 1; i >= 0; i--) {
      const sh = shots[i], s = sh.s;
      const r = flyShot(s, dt, (x, y, z) => {
        if (sh.own) {
          for (const e of ents.values()) { if (!e.alive || !e.fig || !isEnemy(e) || e.protect) continue; const zn = zoneAt(e.pos.x, e.pos.y, e.pos.z, x, y, z); if (zn) return { e, zn }; }
          for (const d of dinos.values()) if (d.team !== my.team && dinoAt(d.x, 0, d.z, x, y, z)) return { d };
        } else if (sh.hostile && my.alive && zoneAt(me.x, me.y, me.z, x, y, z)) return 'me';
        return world.hitWorld(x, y, z) ? 'wall' : null;
      });
      sh.mesh.position.set(s.x, s.y, s.z);
      if (!sh.rocket) sh.mesh.quaternion.setFromUnitVectors(YUP, V.set(s.vx, s.vy, s.vz).normalize());
      if (!r) continue;
      const p = [r2(s.x), r2(s.y), r2(s.z)];
      if (sh.own) {
        if (sh.rocket) { send({ t: 'ae', i: sh.id, p }); boom(p, true); }
        else if (r.e) { send({ t: 'ah', i: sh.id, to: r.e.id, z: r.zn === 'head' ? 1 : 0, p }); marker(r.zn === 'head'); }
        else if (r.d) { send({ t: 'ah', i: sh.id, to: r.d.id, z: 0, p }); marker(false); }
      }
      if (r !== 'gone' && !sh.rocket) { fx.spawnParticles(V.set(s.x, s.y, s.z), 0xffcc88, 5, 3.5, 0.45, 1.2); if (r === 'wall') sfx.impact(s.x, s.z); }
      scene.remove(sh.mesh); shots.splice(i, 1);
    }
    for (let i = effects.length - 1; i >= 0; i--) {
      const e = effects[i]; e.t += dt;
      const k = e.t / e.ttl; e.obj.scale.setScalar(1 + k * e.grow * 2.2); e.obj.material.opacity = 0.9 * (1 - k);
      if (e.t >= e.ttl) { scene.remove(e.obj); e.obj.material.dispose(); effects.splice(i, 1); }
    }
  }
  function marker(head) { H.hit.className = 'sh-hit' + (head ? ' head' : ''); H.hit.style.opacity = '1'; hitT = 0.12; if (head) sfx.headshot(); else sfx.hit(); }

  // ---------- what the server says ----------
  function applyState(m, fresh) {
    const was = state;
    state = m.state; left = m.left; time0 = m.time; timeAt = performance.now(); stars = m.stars; tkills = m.kills; trainStar = !!m.train; wait = m.wait; winner = m.win; rows = m.rows;
    m.pk.forEach((on, i) => { fx.pickups[i].mesh.visible = !!on; });
    m.hp.forEach((on, i) => { fx.healthPacks[i].mesh.visible = !!on; });
    syncTowerStars();
    if (state === 'countdown' && (was !== 'countdown' || fresh)) {
      for (const e of ents.values()) { e.k = 0; e.d = 0; }
      while (feed.length) feed.shift().row.remove();
      showBoard(false); lastBeep = -1;
      if (!fresh) note('Ny runde');
    }
    if (state === 'active' && was !== 'active' && !fresh) { big('GO!', 1, 'go'); sfx.beep(0); }
    if (state === 'ended' && was !== 'ended') {
      if (rows) for (const r of rows) { const e = ents.get(r.id); if (e) { e.k = r.k; e.d = r.d; } }
      const mine = rows && rows.find(r => r.id === you), won = mine && mine.won;
      big(winner === null ? 'UAFGJORT' : won ? 'I VANDT!'.replace('I', teams ? 'I' : 'DU') : teams ? TEAMS[winner].name.toUpperCase() + ' HOLD VANDT' : nameOf(winner).toUpperCase() + ' VANDT', 4, won ? 'go' : '');
      if (won) sfx.winS(); else sfx.lose();
      showBoard(true);
    }
    scoreLine();
  }
  const STAR_TEXT = {
    new: () => '⭐ Ny stjerne på toget!',
    take: m => '⭐ ' + nameOf(m.by) + ' tog stjernen' + (m.team === my.team ? ' – aflever den midt på tårnets top!' : ''),
    score: m => '⭐ ' + TEAMS[m.team].name + ' hold scorede!',
    lost: m => '⭐ ' + TEAMS[m.team].name + ' hold fik ikke afleveret stjernen',
    thief: m => m.team === my.team ? '⚠ ' + nameOf(m.by) + ' er ved at stjæle jeres stjerne!' : '',
    steal: m => '⭐ ' + TEAMS[m.team].name + ' hold mistede en stjerne!',
  };
  const on = {
    aent(m) {
      const mine = my.team;
      for (const a of m.add || []) setEnt(a);
      for (const id of m.del || []) delEnt(id);
      if (my.team !== mine) { retag(); for (const e of [...ents.values()]) if (e.id !== you) setEnt({ id: e.id, n: e.name, look: e.look, team: e.team, bot: e.bot, alive: e.alive }); if (!running) drawMenu(); }
      scoreLine();
    },
    asp(m) {
      const e = ents.get(m.id);
      if (!e) return;
      e.alive = true;
      if (m.id !== you) { e.buf.length = 0; e.fig.alive(); e.fig.group.visible = false; return; }
      Object.assign(me, world.newWalker(m.p[0], m.p[2], m.p[1]));
      my.seq = m.q;
      if (m.tp) return;
      me.yaw = m.p[3]; me.pitch = 0; recoilLeft = 0;
      my.alive = true; my.hp = m.hp; my.owned = m.own; my.protect = ARENA.protect; my.reload = 0; my.fireCd = 0.3;
      my.mags = WEAPON_IDS.map(id => WEAPONS[id].magMax || 0);
      if (!(my.owned & (1 << my.w))) my.w = 0;
      H.dead.style.opacity = '0'; healthHud(); weaponHud(); setZoom(false);
      if (!running) drawMenu();
    },
    ax(m) {
      for (const a of m.p) {
        const e = ents.get(a[0]);
        if (!e) continue;
        if (a[0] === you) { my.protect = a[6] & 32 ? Math.max(my.protect, 0.1) : 0; continue; }
        e.alive = true; e.protect = !!(a[6] & 32);
        e.buf.push({ t: m.s, x: a[1], y: a[2], z: a[3], yaw: a[4], pitch: a[5], f: a[6], w: a[7], car: a.length > 8 ? a[8] : -1, al: a[9] || 0, ac: a[10] || 0 });
        if (e.buf.length > 14) e.buf.shift();
      }
      if (m.d) for (const a of m.d) { const d = dinos.get(a[0]); if (d) { d.tx = a[1]; d.tz = a[2]; d.tyaw = a[3]; } }
    },
    af(m) {
      if (m.dino) {
        const d = dinos.get(m.dino);
        addShot(newShot(m.o, m.d, 70, 6, 2.5), false, { hostile: !d || d.team !== my.team }, dinoBulletMat);
        sfx.dinoShot(m.o[0], m.o[2]);
        return;
      }
      const e = ents.get(m.by);
      if (!e || !e.fig) return;
      e.fig.shoot();
      const w = WEAPONS[WEAPON_IDS[m.w]];
      if (!w || w.melee || !m.o) return;
      addShot(newShot(m.o, m.d, w.speed, w.grav), !!w.splash, {});
      sfx.remoteShot(m.o[0], m.o[2], !!w.splash);
      fx.flashMuzzle(V.set(m.o[0] + m.d[0] * 0.9, m.o[1] + m.d[1] * 0.9, m.o[2] + m.d[2] * 0.9), 14);
    },
    ahit(m) {
      if (m.to === you) {
        my.hp = m.hp; healthHud(); dmgT = 0.5; shake = Math.max(shake, 0.25);
        if (my.hp > 0) sfx.hurt();
        if (m.from) { arrowT = 1.2; H.arrow.dataset.x = m.from[0]; H.arrow.dataset.z = m.from[1]; }
      } else { const e = ents.get(m.to); if (e && e.fig) e.fig.flash(); }
      if (m.by === you && m.to !== you && hitT <= 0) marker(!!m.hs);          // the knife and explosions are only known from here
    },
    akill(m) {
      const wn = m.kd ? 'Dårlig pistol' : m.self ? 'Bazooka' : WEAPONS[WEAPON_IDS[m.w]] ? WEAPONS[WEAPON_IDS[m.w]].name : '';
      const k = ents.get(m.by), v = ents.get(m.to);
      if (m.vd) { addFeed(k ? k.name : '', k ? k.team : '', wn, '🦖 Dino', m.vd, false); if (k) k.k++; }
      else if (v) {
        addFeed(m.kd ? '🦖 Dino' : m.self ? '' : k ? k.name : '', m.kd || (k ? k.team : ''), wn, v.name, v.team, !!m.hs);
        v.d++; v.alive = false; if (k) { k.k++; if (teams && info.mode === 'tdm') tkills[k.team === 'A' ? 0 : 1]++; }
        if (v.fig) v.fig.die();
      }
      if (m.to === you) {
        my.alive = false; my.deadT = ARENA.respawn; my.hp = 0; healthHud(); setZoom(false); sfx.death();
        my.killer = m.kd ? 'en dino' : m.self ? 'din egen bazooka' : k ? k.name : '';
        H.dead.style.opacity = '1';
      } else if (m.by === you) { sfx.kill(); big(m.vd ? 'Dino nedlagt' : (m.hs ? 'Hovedskud! ' : '') + (v ? v.name : '') + ' nedlagt', 1.4, 'kill'); }
      scoreLine();
      if (!board.hidden) drawBoard();
    },
    abm(m) { boom(m.p, false); },
    apk(m) {
      fx.pickups[m.i].mesh.visible = !!m.on;
      if (m.on || m.by !== you) return;
      my.owned |= 1 << m.w; my.mags[m.w] = WEAPONS[WEAPON_IDS[m.w]].magMax;
      my.w = m.w; my.reload = 0; setZoom(false); weaponHud(); sfx.pickup();
      note('Samlede op: ' + WEAPONS[WEAPON_IDS[m.w]].name);
    },
    ahp(m) {
      fx.healthPacks[m.i].mesh.visible = !!m.on;
      if (!m.on && m.by === you) { my.hp = m.hp; healthHud(); sfx.heal(); note('+' + ARENA.health + ' liv'); }
    },
    astar(m) {
      stars = m.s; trainStar = !!m.train; wait = m.wait; syncTowerStars(); scoreLine();
      const text = STAR_TEXT[m.ev] ? STAR_TEXT[m.ev](m) : '';
      if (text) note(text, 3);
      if (m.ev === 'new' || m.ev === 'take') sfx.star(); else if (m.ev === 'score') sfx.deliver(); else if (m.ev === 'thief' && m.team === my.team) sfx.beep(1);
    },
    ast(m) { applyState(m, false); },
    adino(m) {
      for (const a of m.add || []) setDino(a[0], a[1], a[2], a[3]);
      for (const id of m.del || []) { const d = dinos.get(id); if (d) { scene.remove(d.group); dinos.delete(id); } }
    },
    adh(m) { const d = dinos.get(m.id); if (d) d.flash = 0.1; },
    ap(m) {
      const rtt = performance.now() - m.c;
      if (rtt < 0 || rtt > 2000) return;
      ping = Math.round(rtt);
      if (rtt <= bestRtt * 1.3 + 5) { bestRtt = Math.min(bestRtt, rtt); const o = m.s + rtt / 2 - performance.now(); offset = pings < 3 ? o : offset + (o - offset) * 0.3; }
      pings++;
    },
    amsg(m) { if (m.k === 'full') note('Det andet hold har folk nok', 2.5); },
  };

  // ---------- one frame ----------
  let last = performance.now(), raf = 0;
  function frame() {
    if (stopped) return;
    raf = requestAnimationFrame(frame);
    const nowT = performance.now(), real = (nowT - last) / 1000;
    let dt = real; last = nowT;
    if (dt > 0.05) dt = 0.05; if (dt <= 0) return;
    const sn = serverNow();
    world.setTrain(sn / 1000 * world.TRAIN.SPEED);

    // --- me ---
    if (my.fireCd > 0) my.fireCd -= dt;
    if (my.reload > 0) { my.reload -= dt; if (my.reload <= 0) { my.reload = 0; my.mags[my.w] = WEAPONS[WEAPON_IDS[my.w]].magMax; weaponHud(); } }
    if (recoilLeft > 0) { const r = recoilLeft * Math.min(1, 12 * dt); me.pitch -= r; recoilLeft -= r; }
    const inp = { mx: 0, mz: 0, sprint: false, jump: false };
    if (my.alive && !frozen) {
      if (running) {
        const fwd = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0), str = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
        const fxx = -Math.sin(me.yaw), fz = -Math.cos(me.yaw), mx = fxx * fwd - fz * str, mz = fz * fwd + fxx * str, len = Math.hypot(mx, mz);
        if (len > 0.001) { inp.mx = mx / len; inp.mz = mz / len; }
        inp.sprint = !!(keys.ShiftLeft || keys.ShiftRight) && !my.zoom;
        if (jumpBuf > 0) { jumpBuf -= dt; inp.jump = true; }
        if (mouseDown) fire(false);
      }
      const px = me.x, pz = me.z, n = dt > 0.02 ? 2 : 1;
      for (let i = 0; i < n; i++) {
        world.stepPlayer(me, inp, dt / n);
        if (me.jumped) { jumpBuf = 0; inp.jump = false; sfx.jump(); }
        if (me.landed > 7) { sfx.land(); dip = Math.min(0.28, me.landed * 0.02); }
      }
      const moved = Math.hypot(me.x - px, me.z - pz), speed = moved / dt;
      if (me.grounded && moved > 0.002 && me.onCar < 0) { stepAcc += moved; bobT += moved * 1.5; if (stepAcc >= 2.1) { stepAcc = 0; sfx.step(); } } else if (!me.grounded) stepAcc = 1.4;
      // sending where I am
      sendT += dt;
      if (sendT >= 0.05 && my.seq >= 0) {
        sendT = 0;
        const use = running && keys.KeyE;
        const flags = (me.grounded ? FLAG.ground : 0) | (inp.sprint && speed > 7 ? FLAG.sprint : 0) | (my.zoom ? FLAG.zoom : 0) | (use ? FLAG.use : 0) | (my.reload > 0 ? FLAG.reload : 0);
        const d = [r2(me.x), r2(me.y), r2(me.z), r3(me.yaw), r3(me.pitch), flags, my.w, me.onCar];
        if (me.onCar >= 0) d.push(r2(me.carAlong), r2(me.carAcross));
        send({ t: 'as', q: my.seq, d });
      }
    } else if (my.deadT > 0) my.deadT -= dt;
    if (my.protect > 0) my.protect -= dt;

    // --- the camera ---
    dip *= Math.exp(-dt * 9); shake *= Math.exp(-dt * 7); kick *= Math.exp(-dt * 14); swayX *= Math.exp(-dt * 8); swayY *= Math.exp(-dt * 8);
    const bob = my.alive && me.grounded ? Math.sin(bobT * 2) * 0.03 * Math.min(1, Math.hypot(me.vx, me.vz) / 6) : 0;
    const deadK = my.alive || frozen ? 0 : Math.min(1, (ARENA.respawn - my.deadT) / 0.4);
    camera.position.set(me.x + (Math.random() - 0.5) * shake * 0.12, me.y + EYE + bob - dip - deadK * 1.25 + (Math.random() - 0.5) * shake * 0.12, me.z);
    euler.set(me.pitch + (Math.random() - 0.5) * shake * 0.03, me.yaw, deadK * 0.9, 'YXZ');
    camera.quaternion.setFromEuler(euler);
    const fovT = my.zoom ? ZOOM_FOV : BASE_FOV + (inp.sprint && Math.hypot(me.vx, me.vz) > 7.5 ? 5 : 0);
    if (Math.abs(camera.fov - fovT) > 0.05) { camera.fov += (fovT - camera.fov) * Math.min(1, dt * 14); camera.updateProjectionMatrix(); }
    // the weapon in my hands: it sways, bobs, kicks, and dips while it is loaded
    const g = vm.group;
    if (my.reload > 0) { const s = Math.sin(Math.min(1, 1 - my.reload / WEAPONS[WEAPON_IDS[my.w]].reload) * Math.PI); g.rotation.set(s * 0.7, s * 0.25, 0); g.position.set(0, -s * 0.06, s * 0.02); }
    else { g.rotation.set(kick * 0.09 + swayY * 0.03, swayX * 0.04, 0); g.position.set(Math.sin(bobT) * 0.006 - swayX * 0.01, Math.abs(Math.cos(bobT)) * 0.006 - 0.006 + swayY * 0.008, kick * 0.045); }
    g.visible = my.alive && !my.zoom;

    // --- the others ---
    const rt = sn - INTERP;
    for (const e of ents.values()) {
      const f = e.fig, b = e.buf;
      if (!f) { e.pos.x = me.x; e.pos.y = me.y; e.pos.z = me.z; continue; }
      if (!e.alive) { f.update(dt, 0, 0, false); continue; }
      if (!b.length) continue;
      let i = b.length - 1;
      while (i > 0 && b[i].t > rt) i--;
      const a = b[i], c = b[Math.min(b.length - 1, i + 1)], span = c.t - a.t, k = span > 0 ? Math.max(0, Math.min(1.5, (rt - a.t) / span)) : 0;
      let x, z, sp;
      if (a.car >= 0 && c.car === a.car) {
        const w = world.carWorld(world.trainCars[a.car], a.al + (c.al - a.al) * k, a.ac + (c.ac - a.ac) * k);
        x = w.x; z = w.z; sp = span > 0 ? Math.hypot(c.al - a.al, c.ac - a.ac) / span * 1000 : 0;
      } else { x = a.x + (c.x - a.x) * k; z = a.z + (c.z - a.z) * k; sp = span > 0 ? Math.hypot(c.x - a.x, c.z - a.z) / span * 1000 : 0; }
      const y = a.y + (c.y - a.y) * k;
      e.pos.x = x; e.pos.y = y; e.pos.z = z;
      f.group.position.set(x, y, z);
      f.group.rotation.y = angLerp(a.yaw, c.yaw, Math.min(1, k)) + Math.PI;
      f.setWeapon(WEAPON_IDS[c.w] || 'knife');
      f.update(dt, sp, a.pitch + (c.pitch - a.pitch) * Math.min(1, k), !(c.f & FLAG.ground));
      f.group.visible = !e.protect || Math.floor(nowT / 110) % 2 === 0;
      if (f.tag) f.tag.visible = f.friend || Math.hypot(x - me.x, z - me.z) < 22;
    }
    for (const d of dinos.values()) {
      const k = 1 - Math.exp(-dt * 12), mv = Math.hypot(d.tx - d.x, d.tz - d.z) > 0.02;
      d.x += (d.tx - d.x) * k; d.z += (d.tz - d.z) * k; d.yaw = angLerp(d.yaw, d.tyaw, k);
      d.group.position.set(d.x, mv ? Math.abs(Math.sin(nowT * 0.008)) * 0.09 : 0, d.z); d.group.rotation.y = d.yaw;
      const em = d.group.children[0].material.emissive;
      if (d.flash > 0) { d.flash -= dt; em.setRGB(Math.max(0, d.flash / 0.1) * 0.9, 0, 0); } else em.setRGB(0, 0, 0);
    }

    // --- things ---
    updateShots(dt);
    fx.updateParticles(dt); fx.tickMuzzle(dt);
    for (const p of fx.pickups) p.mesh.rotation.y += dt * 1.6;
    for (const p of fx.healthPacks) p.mesh.rotation.y += dt * 1.4;
    for (const t of ['A', 'B']) for (const s of towerStars[t]) s.rotation.y += dt * 1.3;
    const hover = Math.sin(nowT * 0.004) * 0.15;
    if (trainStar) { const c = world.bazCar; trainStarMesh.visible = true; trainStarMesh.position.set(c.cx, world.TRAIN.DECK + 1.1 + hover, c.cz); trainStarMesh.rotation.y += dt * 2.0; }
    else if (wait) { const T = TEAMS[wait]; trainStarMesh.visible = true; trainStarMesh.position.set(T.cx, T.deck + 1.4 + hover, T.cz); trainStarMesh.rotation.y += dt * 2.5; }
    else trainStarMesh.visible = false;
    let tv = 0; for (const c of world.trainCars) tv = Math.max(tv, 1 - Math.hypot(me.x - c.cx, me.z - c.cz) / 26);
    sfx.trainVol(Math.max(0, tv));

    // --- the screen ---
    let prompt = '';
    if (my.alive && info.mode === 'stars' && state === 'active') {
      const c = world.bazCar, en = other(my.team), T = TEAMS[en], mineT = TEAMS[my.team];
      if (trainStar && Math.hypot(me.x - c.cx, me.z - c.cz) < 3.6) prompt = Math.abs(me.y - world.TRAIN.DECK) < 2.2 ? 'Tryk E: tag stjernen' : 'Hop op til stjernen og tryk E';
      else if (wait === my.team && Math.hypot(me.x - mineT.cx, me.z - mineT.cz) < 7 && me.y > mineT.deck - 1.5) prompt = Math.hypot(me.x - mineT.cx, me.z - mineT.cz) < 2.6 ? 'Afleverer …' : 'Gå til midten af tårnets top for at aflevere stjernen';
      else if (stars[en === 'A' ? 0 : 1] > 0 && Math.hypot(me.x - T.cx, me.z - T.cz) < 4.5 && me.y > T.deck - 1.5) {
        if (keys.KeyE && running) { useHeld += dt; prompt = 'Stjæler … ' + Math.max(0, ARENA.stealTime - useHeld).toFixed(1) + ' s'; } else { useHeld = 0; prompt = 'Hold E: stjæl en stjerne'; }
      } else useHeld = 0;
    }
    if (prompt) { H.note.textContent = prompt; H.note.style.opacity = '1'; noteT = 0.15; }
    else if (noteT > 0) { noteT -= dt; if (noteT <= 0) H.note.style.opacity = '0'; }
    if (state === 'countdown') {
      left -= dt;
      const n = Math.max(0, Math.ceil(left));
      if (n !== lastBeep && n > 0) { lastBeep = n; big(String(n), 0.9, 'count'); sfx.beep(n); }
    }
    if (bigT > 0) { bigT -= dt; if (bigT <= 0) H.big.style.opacity = '0'; }
    if (hitT > 0) { hitT -= dt; if (hitT <= 0) H.hit.style.opacity = '0'; }
    if (dmgT > 0) dmgT -= dt;
    H.dmg.style.opacity = String(Math.max(0, Math.min(0.75, dmgT * 1.5)) + (my.alive && my.hp <= 35 ? 0.18 : 0));
    if (arrowT > 0) {
      arrowT -= dt;
      const ang = Math.atan2(+H.arrow.dataset.x - me.x, +H.arrow.dataset.z - me.z) - (me.yaw + Math.PI);
      H.arrow.style.opacity = String(Math.min(1, arrowT)); H.arrow.style.transform = 'translate(-50%, -50%) rotate(' + (-ang) + 'rad)';
    } else H.arrow.style.opacity = '0';
    H.shield.style.opacity = my.alive && my.protect > 0 ? '1' : '0';
    if (!my.alive && my.seq >= 0) H.dead.textContent = (my.killer ? 'Ramt af ' + my.killer + '. ' : '') + (state === 'ended' ? '' : 'Tilbage om ' + Math.max(0, Math.ceil(my.deadT)) + ' …');
    const w = WEAPONS[WEAPON_IDS[my.w]];
    const gap = 5 + (w.melee ? 0 : (my.zoom && w.spreadADS != null ? 0 : w.spread * (me.grounded ? (Math.hypot(me.vx, me.vz) > 1 ? 1.7 : 1) : 2.6)) * 320) + kick * 6;
    H.cross.style.setProperty('--gap', gap.toFixed(1) + 'px'); H.cross.style.opacity = my.zoom || !my.alive ? '0' : '1';
    for (let i = feed.length - 1; i >= 0; i--) { feed[i].t -= dt; if (feed[i].t <= 0) { feed[i].row.remove(); feed.splice(i, 1); } else if (feed[i].t < 1) feed[i].row.style.opacity = String(feed[i].t); }

    // --- upkeep ---
    pingT -= dt;
    if (pingT <= 0) { pingT = pings < 5 ? 0.4 : 2; send({ t: 'ap', c: Math.round(performance.now() * 10) / 10 }); }
    frames++; frameNo++; fpsT += real;
    if (fpsT >= 0.5) {
      fps = frames / fpsT; frames = 0;
      H.stat.textContent = Math.round(fps) + ' fps · ' + ping + ' ms';
      if (state !== 'countdown') scoreLine();
      // too slow for a while: a step down in graphics (as far as it takes)
      if (fps < 36 && quality > 0 && !document.hidden) { slowT += fpsT; if (slowT >= 4) { slowT = 0; setQuality(quality - 1); note('Grafikken er sat ned til «' + QUALITY[quality].name.toLowerCase() + '», så det kører jævnt (T skifter)', 3.5); } } else slowT = 0;
      fpsT = 0;
    }
    const sh = QUALITY[quality].shadows;
    if (sh && frameNo % sh === 0) sun.shadow.needsUpdate = true;
    renderer.render(scene, camera);
  }

  // ---------- start and stop ----------
  for (const a of info.ents) setEnt(a);
  retag();
  for (const d of info.dinos) setDino(d[0], d[1], d[2], d[3]);
  applyState(info.st, true);
  healthHud(); weaponHud(); setRunning(false);
  raf = requestAnimationFrame(frame);

  function stop() {
    if (stopped) return;
    stopped = true; cancelAnimationFrame(raf); ro.disconnect();
    document.removeEventListener('pointerlockchange', onLock); document.removeEventListener('mousemove', onMove); document.removeEventListener('mousedown', onDown);
    document.removeEventListener('mouseup', onUp); document.removeEventListener('contextmenu', onMenu); document.removeEventListener('visibilitychange', onVis);
    window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKeyUp); window.removeEventListener('wheel', onWheel);
    if (document.pointerLockElement === canvas) document.exitPointerLock();
    sfx.stop();
    scene.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) { for (const m of Array.isArray(o.material) ? o.material : [o.material]) { if (m.map) m.map.dispose(); m.dispose(); } } });
    renderer.dispose(); try { renderer.forceContextLoss(); } catch { /* already gone */ }
    root.replaceChildren();
  }
  return {
    on(m) { const f = on[m.t]; if (f) f(m); },
    stop,
    // for the test scripts: play without the mouse being caught
    _debug: { me, my, ents, dinos, world, keys, shots, THREE, camera, scene, renderer, merged, fire, run(v) { forceRun = v; setRunning(v || document.pointerLockElement === canvas); }, freeze(v) { frozen = v; }, state: () => ({ state, left, stars, tkills, trainStar, wait, fps, ping, offset }) },
  };
}
