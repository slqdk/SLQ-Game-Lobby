// SLQ Game Lobby — the shooter's matches. A match lives in the server's memory (not on disk) for as long as
// somebody plays it. Every player moves themselves in their own browser and tells the server where they are 20
// times a second; the server passes that on, and it alone decides what counts: health, kills, pickups, the
// stars and the rounds. A shooter says whom a bullet hit (they see it first), and the server checks that it is
// plausible before anybody is hurt. Robots and dinos live here on the server.
// The lobby (hub.js) hands in the people and the messages; this file knows nothing about sockets.
import { buildWorld, nullThree, EYE, ARENA_W, ARENA_D } from '../public/shooter/world.js';
import { WEAPONS, WEAPON_IDS, MODES, MODE_IDS, FILLS, ARENA, TEAMS, DINO, FLAG, SHOT_LIFE, BOT_NAMES, other, aimDir, spreadDir, falloff, zoneAt, dinoAt, newShot, flyShot, splashDmg } from '../public/shooter/rules.js';
import { randomLook } from '../public/shared/defs.js';
import { hashText } from '../public/shared/util.js';
import { buildNav } from './arena-nav.js';
import { thinkBot, newBrain, resetBrain } from './arena-bots.js';

export class ArenaError extends Error {}
const fail = msg => { throw new ArenaError(msg); };
const J = JSON.stringify;
const r2 = v => Math.round(v * 100) / 100, r3 = v => Math.round(v * 1000) / 1000;
const clampN = (v, a, b) => v < a ? a : v > b ? b : v;
const num = v => typeof v === 'number' && Number.isFinite(v);
const vec3 = a => Array.isArray(a) && a.length === 3 && num(a[0]) && num(a[1]) && num(a[2]) ? [a[0], a[1], a[2]] : null;

// The messages that come many times a second (hub.js gives them a budget of their own).
export const FAST = new Set(['as', 'af', 'ah', 'ae', 'ap']);

// changed(gid, sum | null, id): a match of that group is new, different or gone.
// ended(result): a round is over; returns { uid: chips } for what the lobby paid out.
// left(uid, gid): somebody is out of their match (left, thrown out for standing still, or the match is gone).
export function createArena({ now = () => Date.now(), rand = Math.random, timer = true, changed = () => {}, ended = () => ({}), left = () => {} } = {}) {
  const matches = new Map();      // id -> match
  const byUser = new Map();       // user id -> { m, e }: the match somebody is in, and who they are there
  let nextId = 1, clock = null, last = 0, nav = null;

  // Where robots can walk: the same for every match, made when the first one starts.
  function getNav() {
    if (!nav) { const N = nullThree(); nav = buildNav(buildWorld(N, N, N), [[0, -52, 0], [0, 52, 0]]); }
    return nav;
  }

  const humansOf = m => [...m.ents.values()].filter(e => e.kind === 'human');
  const botsOf = m => [...m.ents.values()].filter(e => e.kind === 'bot');
  const sum = m => ({ id: m.id, mode: m.mode, level: m.level, fill: m.fill, state: m.state, who: humansOf(m).map(e => e.uid), bots: botsOf(m).length, at: m.t0 });
  const ofGroup = gid => [...matches.values()].filter(m => m.gid === gid).map(sum);
  const enemy = (m, a, b) => a !== b && (!m.teams || a.team !== b.team);

  function cast(m, obj, except = 0) {
    const s = J(obj);
    for (const e of m.ents.values()) if (e.send && e.id !== except) { try { e.send(s); } catch { /* a closed socket */ } }
  }

  // ---------- who is in a match ----------
  function newEnt(m, kind, name, look) {
    const e = {
      id: m.nextEnt++, kind, name, look, team: '', uid: 0, send: null,
      x: 0, y: 0, z: 0, yaw: 0, pitch: 0, flags: FLAG.ground, w: 0, car: -1, along: 0, across: 0,
      hp: 100, alive: false, respawnT: 0, protectT: 0, owned: 1, kills: 0, deaths: 0, played: 0, seq: 0,
      hist: [], shots: new Map(), fired: [-1e9, -1e9, -1e9, -1e9, -1e9], stealT: 0, movedAt: now(), stateAt: 0, bad: 0,
    };
    m.ents.set(e.id, e);
    return e;
  }
  const pub = e => ({ id: e.id, n: e.name, look: e.look, team: e.team, bot: e.kind === 'bot' ? 1 : 0, k: e.kills, d: e.deaths, alive: e.alive ? 1 : 0 });
  function count(m, team, kind) { let n = 0; for (const e of m.ents.values()) if (e.team === team && (!kind || e.kind === kind)) n++; return n; }
  function pickTeam(m) {
    if (!m.teams) return '';
    const ha = count(m, 'A', 'human'), hb = count(m, 'B', 'human');
    if (ha !== hb) return ha < hb ? 'A' : 'B';
    const a = count(m, 'A'), b = count(m, 'B');
    return a !== b ? (a < b ? 'A' : 'B') : rand() < 0.5 ? 'A' : 'B';
  }
  function dropEnt(m, e) { m.ents.delete(e.id); cast(m, { t: 'aent', del: [e.id] }); }

  function addBot(m, team) {
    const used = new Set([...m.ents.values()].map(e => e.name)), name = BOT_NAMES.find(n => !used.has(n)) || 'Robot ' + m.nextEnt;
    const e = newEnt(m, 'bot', name, randomLook(hashText(name) + m.id * 7919));
    e.team = team; e.brain = newBrain(m.level, rand); e.inp = { mx: 0, mz: 0, sprint: false, jump: false };
    e.walker = m.world.newWalker(0, 0, 0); e.mag = WEAPON_IDS.map(id => WEAPONS[id].magMax || 0); e.reloadT = 0; e.fireCd = 0; e.use = false;
    cast(m, { t: 'aent', add: [pub(e)] });
    spawn(m, e);
  }
  // Robots fill the match up to `fill` players, and make room when people come. The sides are kept even.
  function balance(m) {
    const want = Math.max(0, Math.min(m.fill, ARENA.max) - humansOf(m).length);
    while (botsOf(m).length > want) {
      const from = m.teams ? (count(m, 'A') >= count(m, 'B') ? 'A' : 'B') : '', list = botsOf(m).reverse();
      dropEnt(m, list.find(x => x.team === from) || list[0]);
    }
    while (botsOf(m).length < want) addBot(m, m.teams ? (count(m, 'A') <= count(m, 'B') ? 'A' : 'B') : '');
    if (m.teams) for (let i = 0; i < 4; i++) {
      const a = count(m, 'A'), b = count(m, 'B');
      if (Math.abs(a - b) < 2) break;
      const big = a > b ? 'A' : 'B', e = botsOf(m).find(x => x.team === big);
      if (!e) break;
      e.team = other(big); cast(m, { t: 'aent', add: [pub(e)] }); spawn(m, e);
    }
  }

  // ---------- coming into the arena ----------
  function spawnPoint(m, e) {
    if (m.teams) { const t = TEAMS[e.team]; return [rand() * 12 - 6, 0, t.baseZ, t.yaw]; }
    // everybody against everybody: somewhere on the ground, as far from the others as a few tries find
    const nv = getNav();
    let best = null, bd = -1;
    for (let i = 0; i < 40; i++) {
      const n = Math.floor(rand() * nv.size), x = nv.x[n], z = nv.z[n];
      if (Math.abs(nv.y[n]) > 0.05 || Math.abs(x) > 39 || Math.abs(z) > 51) continue;
      if ((Math.abs(Math.abs(x) - 30) < 3 && Math.abs(z) < 28) || (Math.abs(Math.abs(z) - 27) < 3 && Math.abs(x) < 31)) continue;     // not on the track
      let near = 1e9;
      for (const v of m.ents.values()) if (v !== e && v.alive) near = Math.min(near, Math.hypot(v.x - x, v.z - z));
      if (near > bd) { bd = near; best = [x, 0, z, Math.atan2(x, z)]; }
    }
    return best || [0, 0, 50, 0];
  }
  function place(m, e, x, y, z, yaw) {
    e.x = x; e.y = y; e.z = z; e.car = -1; e.seq++; e.hist.length = 0; e.flags = FLAG.ground; e.stealT = 0;
    if (yaw !== undefined) { e.yaw = yaw; e.pitch = 0; }
    if (e.walker) Object.assign(e.walker, m.world.newWalker(x, z, y));
  }
  function spawn(m, e) {
    const p = spawnPoint(m, e);
    place(m, e, p[0], p[1], p[2], p[3]);
    e.hp = 100; e.alive = true; e.protectT = ARENA.protect; e.respawnT = 0;
    if (e.brain) { resetBrain(e.brain); e.reloadT = 0; e.fireCd = 0.4; e.mag = WEAPON_IDS.map(id => WEAPONS[id].magMax || 0); }
    cast(m, { t: 'asp', id: e.id, p: [r2(e.x), r2(e.y), r2(e.z), r3(e.yaw)], q: e.seq, hp: 100, own: e.owned });
  }

  // ---------- rounds ----------
  const roundMsg = m => ({
    t: 'ast', state: m.state, left: r2(m.left), time: Math.round(m.time), round: m.round, stars: [m.stars.A, m.stars.B], kills: [m.kills.A, m.kills.B],
    train: m.trainStar ? 1 : 0, wait: m.deliver ? m.deliver.team : '', pk: m.pickups.map(p => p.on ? 1 : 0), hp: m.packs.map(p => p.on ? 1 : 0), win: m.winner, rows: m.rows,
  });
  function startRound(m) {
    m.round++; m.state = 'countdown'; m.left = ARENA.countdown; m.time = 0; m.winner = null; m.rows = null;
    m.stars = { A: 0, B: 0 }; m.kills = { A: 0, B: 0 }; m.trainStar = false; m.starT = ARENA.starEvery - ARENA.starFirst; m.deliver = null;
    m.pickups = m.world.PICKUPS.map(() => ({ on: true, back: 0 })); m.packs = m.world.HEALTH_PACKS.map(() => ({ on: true, back: 0 }));
    if (m.dinos && m.dinos.length) cast(m, { t: 'adino', del: m.dinos.map(d => d.id) });
    m.dinos = []; m.dinoGrant = { A: 0, B: 0 }; m.dinoBack = { A: 0, B: 0 }; m.shots = []; m.thiefAt = {}; m.starAt = 0;
    for (const e of m.ents.values()) { e.kills = 0; e.deaths = 0; e.owned = 1; e.w = 0; e.played = 0; }
    cast(m, roundMsg(m));
    for (const e of m.ents.values()) spawn(m, e);
  }
  function endRound(m, winner) {
    m.state = 'ended'; m.left = ARENA.endShow; m.winner = winner;
    const hs = humansOf(m).filter(e => e.played >= 30);
    const opposed = m.teams ? hs.some(e => e.team === 'A') && hs.some(e => e.team === 'B') : hs.length >= 2;
    const rows = [...m.ents.values()].map(e => ({ id: e.id, uid: e.uid, name: e.name, team: e.team, bot: e.kind === 'bot', kills: e.kills, deaths: e.deaths, played: Math.round(e.played),
      won: winner !== null && (m.teams ? e.team === winner : e.id === winner) }));
    let paid = {};
    try { paid = ended({ gid: m.gid, id: m.id, mode: m.mode, teams: m.teams, secs: Math.round(m.time), winner, opposed, stars: [m.stars.A, m.stars.B], kills: [m.kills.A, m.kills.B], rows }) || {}; }
    catch (err) { console.error('arena:', err); }
    m.rows = rows.map(r => ({ id: r.id, k: r.kills, d: r.deaths, won: r.won ? 1 : 0, chips: paid[r.uid] || 0 }));
    cast(m, roundMsg(m));
    changed(m.gid, sum(m));
  }
  // Time is up: whoever is ahead wins, nobody when it is level.
  function timeUp(m) {
    if (m.mode === 'stars') return endRound(m, m.stars.A === m.stars.B ? null : m.stars.A > m.stars.B ? 'A' : 'B');
    if (m.mode === 'tdm') return endRound(m, m.kills.A === m.kills.B ? null : m.kills.A > m.kills.B ? 'A' : 'B');
    const list = [...m.ents.values()].sort((a, b) => b.kills - a.kills);
    endRound(m, list.length && list[0].kills > 0 && (list.length < 2 || list[0].kills > list[1].kills) ? list[0].id : null);
  }

  // ---------- being hurt ----------
  // by: a player or robot, a dino ({ dino: true, team }), or null.
  function hurt(m, v, dmg, by, wi, head) {
    if (m.state !== 'active' || !v.alive || v.protectT > 0) return;
    dmg = Math.round(dmg);
    if (dmg <= 0) return;
    v.hp -= dmg;
    const from = by ? [r2(by.x), r2(by.z)] : null;
    cast(m, { t: 'ahit', to: v.id, by: by && !by.dino ? by.id : 0, hp: Math.max(0, v.hp), dmg, hs: head ? 1 : 0, from });
    if (v.hp > 0) return;
    v.alive = false; v.deaths++; v.respawnT = ARENA.respawn; v.stealT = 0;
    if (v.brain) resetBrain(v.brain);
    const killer = by && !by.dino && by !== v ? by : null;
    if (killer) { killer.kills++; if (m.teams) m.kills[killer.team]++; }
    cast(m, { t: 'akill', to: v.id, by: killer ? killer.id : 0, kd: by && by.dino ? by.team : '', self: by === v ? 1 : 0, w: wi, hs: head ? 1 : 0 });
    if (m.mode === 'tdm' && killer && m.kills[killer.team] >= MODES.tdm.goal) endRound(m, killer.team);
    else if (m.mode === 'ffa' && killer && killer.kills >= MODES.ffa.goal) endRound(m, killer.id);
  }
  function hurtDino(m, d, dmg, by, wi) {
    if (m.state !== 'active' || d.hp <= 0) return;
    d.hp -= dmg;
    cast(m, { t: 'adh', id: d.id, by: by ? by.id : 0 });
    if (d.hp > 0) return;
    if (by) by.kills++;
    cast(m, { t: 'akill', to: 0, vd: d.team, by: by ? by.id : 0, w: wi, hs: 0 });
  }
  // An explosion: everybody near it on the other side is hurt, and so is whoever fired it.
  function explode(m, p, w, by, wi) {
    cast(m, { t: 'abm', p: p.map(r2), by: by.id }, by.send ? by.id : 0);
    for (const v of [...m.ents.values()]) {
      if (!v.alive || (v !== by && !enemy(m, by, v))) continue;
      const dmg = splashDmg(w, p, v.x, v.y, v.z);
      if (dmg > 0) hurt(m, v, dmg, by, wi, false);
    }
    for (const d of m.dinos) if (d.team !== by.team) { const dmg = splashDmg(w, p, d.x, d.y, d.z, 0.9); if (dmg > 0) hurtDino(m, d, dmg, by, wi); }
  }
  // The knife: the nearest one on the other side within reach and in front (where they were a moment ago counts too).
  function melee(m, e, o, d, w) {
    let best = null, bd = 1e9;
    const tryAt = (v, x, y, z) => {
      const tx = x - o[0], ty = y + 1.1 - o[1], tz = z - o[2], len = Math.hypot(tx, ty, tz);
      if (len < w.reach && len < bd && (tx * d[0] + ty * d[1] + tz * d[2]) / (len || 1) > 0.5) { best = v; bd = len; }
    };
    for (const v of m.ents.values()) {
      if (!v.alive || !enemy(m, e, v)) continue;
      tryAt(v, v.x, v.y, v.z);
      for (let i = v.hist.length - 1; i >= 0 && m.ms - v.hist[i][0] < 300; i--) tryAt(v, v.hist[i][1], v.hist[i][2], v.hist[i][3]);
    }
    for (const dn of m.dinos) if (dn.team !== e.team) tryAt(dn, dn.x, dn.y, dn.z);
    if (!best) return;
    if (best.dino) hurtDino(m, best, w.dmg, e, 0); else hurt(m, best, w.dmg, e, 0, false);
  }
  // Was somebody at (or near) this point during the last moments? A shooter sees the others a little late.
  function wasNear(m, v, p) {
    const ok = (x, y, z) => Math.hypot(x - p[0], z - p[2]) < 1.5 && p[1] > y - 0.5 && p[1] < y + 2.7;
    if (ok(v.x, v.y, v.z)) return true;
    for (let i = v.hist.length - 1; i >= 0 && m.ms - v.hist[i][0] < 800; i--) if (ok(v.hist[i][1], v.hist[i][2], v.hist[i][3])) return true;
    return false;
  }

  // ---------- what the players' browsers say ----------
  function onState(m, e, msg) {
    const d = msg.d;
    if (!e.alive || msg.q !== e.seq || !Array.isArray(d) || d.length < 8) return;
    for (let i = 0; i < 8; i++) if (!num(d[i])) return;
    const x = clampN(d[0], -ARENA_W / 2, ARENA_W / 2), z = clampN(d[2], -ARENA_D / 2, ARENA_D / 2), y = clampN(d[1], -6, 16);
    const t = now(), dt = Math.min(1, (t - (e.stateAt || t - 50)) / 1000), moved = Math.hypot(x - e.x, z - e.z);
    if (moved > 30 * dt + 2.5 && ++e.bad < 20) return;         // too far at once: not believed, unless they keep saying so
    e.bad = 0; e.stateAt = t;
    if (moved > 0.05 || Math.abs(d[3] - e.yaw) > 0.01) e.movedAt = t;
    e.x = x; e.y = y; e.z = z; e.yaw = d[3]; e.pitch = clampN(d[4], -1.6, 1.6); e.flags = d[5] & 31;
    const wi = d[6] | 0;
    e.w = wi >= 0 && wi < WEAPON_IDS.length && (e.owned & (1 << wi)) ? wi : 0;
    const car = d[7] | 0;
    if (car >= 0 && car < m.world.trainCars.length && num(d[8]) && num(d[9])) { e.car = car; e.along = clampN(d[8], -4, 4); e.across = clampN(d[9], -2, 2); } else e.car = -1;
  }
  function onFire(m, e, msg) {
    if (m.state !== 'active' || !e.alive) return;
    const wi = msg.w | 0, w = WEAPONS[WEAPON_IDS[wi]];
    if (!w || !(e.owned & (1 << wi)) || m.ms - e.fired[wi] < w.rate * 700) return;
    let o = vec3(msg.o); const d = vec3(msg.d);
    if (!d) return;
    const l = Math.hypot(d[0], d[1], d[2]); if (l < 0.5) return;
    d[0] /= l; d[1] /= l; d[2] /= l;
    if (!o || Math.hypot(o[0] - e.x, o[2] - e.z) > 4 || Math.abs(o[1] - e.y - EYE) > 3) o = [e.x, e.y + EYE, e.z];
    e.fired[wi] = m.ms; e.protectT = 0;
    if (w.melee) { cast(m, { t: 'af', by: e.id, w: wi }, e.id); melee(m, e, o, d, w); return; }
    e.shots.set(msg.i, { w: wi, o, t: m.ms, done: false });
    if (e.shots.size > 60) e.shots.delete(e.shots.keys().next().value);
    cast(m, { t: 'af', by: e.id, w: wi, o: o.map(r2), d: d.map(r3) }, e.id);
  }
  // The shot the browser talks about, when it can have reached point p by now.
  function shotOf(m, e, msg, p) {
    const s = e.shots.get(msg.i);
    if (!s || s.done || !p || m.ms - s.t > SHOT_LIFE * 1000 + 600) return null;
    const w = WEAPONS[WEAPON_IDS[s.w]], dist = Math.hypot(p[0] - s.o[0], p[1] - s.o[1], p[2] - s.o[2]);
    if (dist > w.speed * SHOT_LIFE + 5 || (m.ms - s.t) / 1000 < dist / w.speed * 0.6 - 0.3) return null;
    s.dist = dist;
    return s;
  }
  function onHit(m, e, msg) {
    const p = vec3(msg.p), s = shotOf(m, e, msg, p);
    if (!s) return;
    const w = WEAPONS[WEAPON_IDS[s.w]];
    if (w.splash) return;
    s.done = true;
    if (msg.to >= 1000) {
      const d = m.dinos.find(x => x.id === msg.to);
      if (d && d.team !== e.team && Math.hypot(d.x - p[0], d.z - p[2]) < 2.2) hurtDino(m, d, w.dmg * falloff(w, s.dist), e, s.w);
      return;
    }
    const v = m.ents.get(msg.to);
    if (!v || !v.alive || !enemy(m, e, v) || !wasNear(m, v, p)) return;
    const head = msg.z === 1 && w.head > 1;
    hurt(m, v, w.dmg * falloff(w, s.dist) * (head ? w.head : 1), e, s.w, head);
  }
  function onBoom(m, e, msg) {
    const p = vec3(msg.p), s = shotOf(m, e, msg, p);
    if (!s || !WEAPONS[WEAPON_IDS[s.w]].splash) return;
    s.done = true;
    if (e.alive || m.ms - s.t < SHOT_LIFE * 1000) explode(m, p, WEAPONS[WEAPON_IDS[s.w]], e, s.w);
  }
  function onPing(m, e, msg) { if (num(msg.c)) e.send(J({ t: 'ap', c: msg.c, s: Math.round(now() - m.t0) })); }
  // Over to the other side: only when that does not leave the people more unevenly spread.
  function onTeam(m, e) {
    if (!m.teams || m.state === 'ended') return;
    const to = other(e.team);
    if (count(m, to, 'human') > count(m, e.team, 'human') - 1) { e.send(J({ t: 'amsg', k: 'full' })); return; }
    e.team = to;
    cast(m, { t: 'aent', add: [pub(e)] });
    spawn(m, e); balance(m);
  }
  const HANDLERS = { as: onState, af: onFire, ah: onHit, ae: onBoom, ap: onPing, at: onTeam };
  function msg(uid, mm) {
    const r = byUser.get(uid), h = Object.hasOwn(HANDLERS, mm.t) ? HANDLERS[mm.t] : null;
    if (r && h) h(r.m, r.e, mm);
  }

  // ---------- robots shooting ----------
  // Returns true when a shot went off.
  function botFire(m, e) {
    if (m.state !== 'active' || e.fireCd > 0) return false;
    const w = WEAPONS[WEAPON_IDS[e.w]], o = [e.x, e.y + EYE, e.z], aimAt = aimDir(e.yaw, e.pitch);
    if (w.melee) { e.fireCd = w.rate; e.protectT = 0; cast(m, { t: 'af', by: e.id, w: e.w }); melee(m, e, o, aimAt, w); return true; }
    if (e.reloadT > 0) return false;
    if (e.mag[e.w] <= 0) { e.reloadT = w.reload; return false; }
    e.mag[e.w]--; e.fireCd = w.rate * (1.15 + rand() * 0.5); e.protectT = 0;
    const moving = Math.hypot(e.inp.mx, e.inp.mz) > 0.1;
    const sp = w.spreadADS != null && !moving ? w.spreadADS : w.spread * (!e.walker.grounded ? 2.6 : moving ? 1.7 : 1);
    const d = spreadDir(aimAt, sp, rand);
    m.shots.push(Object.assign(newShot(o, d, w.speed, w.grav), { by: e, wi: e.w, team: e.team }));
    cast(m, { t: 'af', by: e.id, w: e.w, o: o.map(r2), d: d.map(r3) });
    if (e.mag[e.w] <= 0) e.reloadT = w.reload;
    return true;
  }

  // ---------- dinos (Stjernejagt): as in the stand-alone shooter, now on the server ----------
  function spawnDino(m, team) {
    const x = rand() * 36 - 18, z = (team === 'A' ? -38 : 38) + (rand() * 4 - 2);   // spredt langs holdets frontlinje
    const d = { id: m.nextDino++, dino: true, team, x, z, hx: x, hz: z, y: 0, yaw: 0, hp: DINO.hp, fireCd: rand(), wanderT: 0, wanderYaw: rand() * 6.28 };
    m.dinos.push(d);
    cast(m, { t: 'adino', add: [[d.id, team, r2(x), r2(z)]] });
  }
  function moveDino(m, d, vx, vz, dt) {
    d.x += vx * dt; d.z += vz * dt;
    d.x = clampN(d.x, -ARENA_W / 2 + 0.6, ARENA_W / 2 - 0.6); d.z = clampN(d.z, -ARENA_D / 2 + 0.6, ARENA_D / 2 - 0.6);
    const cs = m.world.colliders;
    for (let j = 0; j < cs.length; j++) {               // skub ud af murene i jordhøjde (kan ikke klatre)
      const c = cs[j]; if (c.base > 1.4) continue;
      if (d.x > c.minX - 0.5 && d.x < c.maxX + 0.5 && d.z > c.minZ - 0.5 && d.z < c.maxZ + 0.5) {
        const l = d.x - (c.minX - 0.5), r = (c.maxX + 0.5) - d.x, u = d.z - (c.minZ - 0.5), o = (c.maxZ + 0.5) - d.z, mn = Math.min(l, r, u, o);
        if (mn === l) d.x = c.minX - 0.5; else if (mn === r) d.x = c.maxX + 0.5; else if (mn === u) d.z = c.minZ - 0.5; else d.z = c.maxZ + 0.5;
      }
    }
  }
  function updateDino(m, d, dt) {
    let t = null, bd = 1e18;
    for (const v of m.ents.values()) if (v.alive && v.team !== d.team) { const q = (d.x - v.x) * (d.x - v.x) + (d.z - v.z) * (d.z - v.z); if (q < bd) { bd = q; t = v; } }
    if (t && bd < DINO.range * DINO.range) {
      d.yaw = Math.atan2(t.x - d.x, t.z - d.z);
      if (bd > DINO.hold * DINO.hold) moveDino(m, d, Math.sin(d.yaw) * DINO.spd, Math.cos(d.yaw) * DINO.spd, dt);
      d.fireCd -= dt;
      if (d.fireCd <= 0 && m.world.losClear(d.x, 1.5, d.z, t.x, t.y + 1.0, t.z)) {
        const o = [d.x, 1.5, d.z], l = Math.hypot(t.x - d.x, t.y + 1.0 - 1.5, t.z - d.z) || 1;
        const dir = spreadDir([(t.x - d.x) / l, (t.y - 0.5) / l, (t.z - d.z) / l], DINO.shot.spread, rand);
        m.shots.push(Object.assign(newShot(o, dir, DINO.shot.speed, DINO.shot.grav, DINO.shot.life), { by: d, team: d.team, dmg: DINO.dmg }));
        cast(m, { t: 'af', dino: d.id, o: o.map(r2), d: dir.map(r3) });
        d.fireCd = DINO.fire;
      }
    } else {
      d.wanderT -= dt; if (d.wanderT <= 0) { d.wanderYaw = rand() * 6.28; d.wanderT = 1.5 + rand() * 2.5; }
      d.yaw = d.wanderYaw; moveDino(m, d, Math.sin(d.yaw) * DINO.spd * 0.6, Math.cos(d.yaw) * DINO.spd * 0.6, dt);
    }
    const dh = Math.hypot(d.x - d.hx, d.z - d.hz);   // hold dinoen nær sit spawn (leash)
    if (dh > DINO.leash) { const k = DINO.leash / dh; d.x = d.hx + (d.x - d.hx) * k; d.z = d.hz + (d.z - d.hz) * k; }
  }
  function updateDinos(m, dt) {
    const alive = t => m.dinos.filter(d => d.team === t).length;
    for (const t of ['A', 'B']) {
      if (m.dinoGrant[t] > 0 && alive(t) < 2) { spawnDino(m, t); m.dinoGrant[t]--; }        // nye stjerner giver dino med det samme
      if (m.dinoBack[t] > 0) {                                                             // respawn 10 s efter drab (kun hvis stjerne samlet)
        m.dinoBack[t] -= dt;
        if (m.dinoBack[t] <= 0) { if (alive(t) < 2 && m.stars[t] > 0) spawnDino(m, t); m.dinoBack[t] = (alive(t) < 2 && m.stars[t] > 0) ? 10 : 0; }
      }
    }
    for (let i = m.dinos.length - 1; i >= 0; i--) {
      const d = m.dinos[i];
      if (d.hp <= 0) { m.dinos.splice(i, 1); cast(m, { t: 'adino', del: [d.id] }); if (m.stars[d.team] > 0 && m.dinoBack[d.team] <= 0) m.dinoBack[d.team] = 10; continue; }
      updateDino(m, d, dt);
    }
  }

  // ---------- the golden stars (Stjernejagt) ----------
  const starMsg = (m, ev, team, by) => ({ t: 'astar', s: [m.stars.A, m.stars.B], train: m.trainStar ? 1 : 0, wait: m.deliver ? m.deliver.team : '', ev, team: team || '', by: by || 0 });
  function updateStars(m, dt) {
    const w = m.world;
    if (m.deliver) {
      // the star hangs over the team's tower: somebody of the team must stand in the middle of the deck for a moment
      const d = m.deliver, t = TEAMS[d.team];
      let near = false;
      for (const e of m.ents.values()) if (e.alive && e.team === d.team && Math.hypot(e.x - t.cx, e.z - t.cz) < 2.6 && e.y > t.deck - 1.2) near = true;
      d.wait += dt; d.dwell = near ? d.dwell + dt : 0;
      if (d.dwell >= ARENA.deliverTime) {
        m.deliver = null; m.starT = 0;
        m.stars[d.team] = Math.min(MODES.stars.goal, m.stars[d.team] + 1); m.dinoGrant[d.team]++;       // hver NY stjerne giver holdet én dino
        cast(m, starMsg(m, 'score', d.team, d.by));
        if (m.stars[d.team] >= MODES.stars.goal) return endRound(m, d.team);
      } else if (d.wait > ARENA.deliverWait) { m.deliver = null; m.starT = 0; cast(m, starMsg(m, 'lost', d.team)); }
    } else {
      m.starT += dt;
      if (!m.trainStar && m.starT >= ARENA.starEvery) { m.trainStar = true; m.starT = 0; m.starAt = m.time; cast(m, starMsg(m, 'new')); }
      if (m.trainStar) {
        const c = w.bazCar;
        for (const e of m.ents.values()) {
          if (!e.alive || !(e.flags & FLAG.use) || Math.hypot(e.x - c.cx, e.z - c.cz) >= 3.6 || Math.abs(e.y - w.TRAIN.DECK) >= 2.2) continue;
          // taken: the star flies to the top of the team's tower, and so does whoever took it
          const t = TEAMS[e.team];
          m.trainStar = false; m.deliver = { team: e.team, by: e.id, dwell: 0, wait: 0 };
          place(m, e, t.cx, t.deck + 0.35, t.cz);
          cast(m, { t: 'asp', id: e.id, p: [r2(e.x), r2(e.y), r2(e.z), r3(e.yaw)], q: e.seq, tp: 1 });
          cast(m, starMsg(m, 'take', e.team, e.id));
          break;
        }
      }
    }
    // stealing: hold E on top of the other team's tower
    for (const e of m.ents.values()) {
      if (!e.alive) continue;
      const en = other(e.team), t = TEAMS[en];
      if (m.stars[en] > 0 && (e.flags & FLAG.use) && Math.hypot(e.x - t.cx, e.z - t.cz) < 4.5 && e.y > t.deck - 1.5) {
        if (!e.stealT) cast(m, starMsg(m, 'thief', en, e.id));
        e.stealT += dt;
        if (e.stealT >= ARENA.stealTime) { e.stealT = 0; m.stars[en]--; cast(m, starMsg(m, 'steal', en, e.id)); }
      } else e.stealT = 0;
    }
  }

  // ---------- one step of a match ----------
  function step(m, dt) {
    const w = m.world;
    m.ms = now() - m.t0;
    w.setTrain(m.ms / 1000 * w.TRAIN.SPEED);
    if (m.state === 'countdown') { m.left -= dt; if (m.left <= 0) { m.state = 'active'; m.left = 0; if (m.mode === 'stars') { spawnDino(m, 'A'); spawnDino(m, 'B'); } cast(m, roundMsg(m)); changed(m.gid, sum(m)); } }
    else if (m.state === 'ended') { m.left -= dt; if (m.left <= 0) { startRound(m); changed(m.gid, sum(m)); } }
    else { m.time += dt; if (m.time >= MODES[m.mode].time) timeUp(m); }

    // everybody's clocks; the robots think and walk
    const ctx = { m, world: w, nav: getNav(), rand, enemy: (a, b) => enemy(m, a, b), fire: e => botFire(m, e), paths: { left: 2 } };
    for (const e of [...m.ents.values()]) {
      if (!e.alive) { if (m.state !== 'ended') { e.respawnT -= dt; if (e.respawnT <= 0) spawn(m, e); } continue; }
      if (e.protectT > 0) e.protectT -= dt;
      if (m.state === 'active') e.played += dt;
      if (e.kind === 'bot' && m.state !== 'ended') {
        e.fireCd -= dt;
        if (e.reloadT > 0) { e.reloadT -= dt; if (e.reloadT <= 0) e.mag[e.w] = WEAPONS[WEAPON_IDS[e.w]].magMax || 0; }
        thinkBot(ctx, e, dt);
        const wk = e.walker;
        for (let i = 0; i < 2; i++) { w.stepPlayer(wk, e.inp, dt / 2); e.inp.jump = false; }
        e.x = wk.x; e.y = wk.y; e.z = wk.z; e.car = wk.onCar; e.along = wk.carAlong; e.across = wk.carAcross;
        e.flags = (wk.grounded ? FLAG.ground : 0) | (e.inp.sprint ? FLAG.sprint : 0) | (e.use ? FLAG.use : 0) | (e.reloadT > 0 ? FLAG.reload : 0);
      }
      e.hist.push([m.ms, e.x, e.y, e.z]);
      if (e.hist.length > 24) e.hist.shift();
    }

    // weapons and health that lie ready
    for (let i = 0; i < w.PICKUPS.length; i++) {
      const p = w.PICKUPS[i], st = m.pickups[i];
      if (!st.on) { st.back -= dt; if (st.back <= 0) { st.on = true; cast(m, { t: 'apk', i, on: 1 }); } continue; }
      const wi = WEAPON_IDS.indexOf(p.type);
      for (const e of m.ents.values()) {
        if (!e.alive || (e.owned & (1 << wi)) || Math.hypot(e.x - p.x, e.z - p.z) >= 1.4 || Math.abs(e.y - (p.y || 0)) >= 2.0) continue;
        st.on = false; st.back = ARENA.pickupBack; e.owned |= 1 << wi;
        cast(m, { t: 'apk', i, on: 0, by: e.id, w: wi });
        break;
      }
    }
    for (let i = 0; i < w.HEALTH_PACKS.length; i++) {
      const p = w.HEALTH_PACKS[i], st = m.packs[i];
      if (!st.on) { st.back -= dt; if (st.back <= 0) { st.on = true; cast(m, { t: 'ahp', i, on: 1 }); } continue; }
      for (const e of m.ents.values()) {
        if (!e.alive || e.hp >= 100 || (m.teams && e.team !== p.team) || Math.hypot(e.x - p.x, e.z - p.z) >= 1.4 || Math.abs(e.y) >= 2.0) continue;
        st.on = false; st.back = ARENA.healthBack; e.hp = Math.min(100, e.hp + ARENA.health);
        cast(m, { t: 'ahp', i, on: 0, by: e.id, hp: e.hp });
        break;
      }
    }

    if (m.state === 'active' && m.mode === 'stars') { updateStars(m, dt); if (m.state === 'active') updateDinos(m, dt); }

    // the bullets of robots and dinos
    for (let i = m.shots.length - 1; i >= 0; i--) {
      const s = m.shots[i];
      const r = flyShot(s, dt, (x, y, z) => {
        for (const v of m.ents.values()) {
          if (!v.alive || v === s.by || (m.teams ? v.team === s.team : false)) continue;
          const zn = zoneAt(v.x, v.y, v.z, x, y, z);
          if (zn) return { v, zn };
        }
        if (!s.by.dino) for (const d of m.dinos) if (d.team !== s.team && dinoAt(d.x, d.y, d.z, x, y, z)) return { d };
        return w.hitWorld(x, y, z) ? 'wall' : null;
      });
      if (!r) continue;
      m.shots.splice(i, 1);
      if (m.state !== 'active') continue;
      if (s.dmg) { if (r.v) hurt(m, r.v, s.dmg, s.by, 4, false); continue; }                  // a dino's bullet
      const wd = WEAPONS[WEAPON_IDS[s.wi]], by = m.ents.get(s.by.id) === s.by ? s.by : null;
      if (!by) continue;
      if (wd.splash) explode(m, [s.x, s.y, s.z], wd, by, s.wi);
      else if (r.v || r.d) {
        const dmg = wd.dmg * falloff(wd, Math.hypot(s.x - s.ox, s.y - s.oy, s.z - s.oz));
        if (r.v) hurt(m, r.v, dmg * (r.zn === 'head' ? wd.head : 1), by, s.wi, r.zn === 'head'); else hurtDino(m, r.d, dmg, by, s.wi);
      }
    }

    // standing still for a long time: back to the clubhouse
    if (m.state === 'active') for (const e of humansOf(m)) if (now() - e.movedAt > ARENA.idleKick * 1000) leave(e.uid, 'idle');

    // where everybody is
    const p = [];
    for (const e of m.ents.values()) {
      if (!e.alive) continue;
      const a = [e.id, r2(e.x), r2(e.y), r2(e.z), r3(e.yaw), r3(e.pitch), e.flags | (e.protectT > 0 ? 32 : 0), e.w];
      if (e.car >= 0) a.push(e.car, r2(e.along), r2(e.across));
      p.push(a);
    }
    const snap = { t: 'ax', s: Math.round(m.ms), p };
    if (m.dinos.length) snap.d = m.dinos.map(d => [d.id, r2(d.x), r2(d.z), r3(d.yaw)]);
    cast(m, snap);
  }
  function tick(dt) {
    for (const m of [...matches.values()]) {
      try { step(m, dt); }
      catch (err) { console.error('arena:', err); for (const e of humansOf(m)) leave(e.uid, 'error'); matches.delete(m.id); }
    }
  }
  function startClock() {
    if (!timer || clock) return;
    last = now();
    clock = setInterval(() => { const t = now(), dt = clampN((t - last) / 1000, 0.001, 0.25); last = t; tick(dt); }, ARENA.tick);
    if (clock.unref) clock.unref();
  }

  // ---------- in and out ----------
  function enter(m, user, send) {
    const e = newEnt(m, 'human', user.name, user.look);
    e.uid = user.id; e.team = pickTeam(m);
    byUser.set(user.id, { m, e });
    cast(m, { t: 'aent', add: [pub(e)] });
    balance(m);
    e.send = send;
    send(J(info(m, e)));
    spawn(m, e);
    changed(m.gid, sum(m));
  }
  const info = (m, e) => ({ t: 'ain', id: m.id, you: e.id, mode: m.mode, level: m.level, fill: m.fill, ms: Math.round(now() - m.t0), ents: [...m.ents.values()].map(pub),
    dinos: m.dinos.map(d => [d.id, d.team, r2(d.x), r2(d.z)]), st: roundMsg(m) });

  function create(gid, user, send, opts = {}) {
    if (ofGroup(gid).length >= ARENA.perGroup) fail('Der er allerede ' + ARENA.perGroup + ' kampe i gang i arkaden. Gå med i en af dem.');
    leave(user.id);
    const N = nullThree(), mode = MODE_IDS.includes(opts.mode) ? opts.mode : 'stars';
    const m = { id: nextId++, gid, mode, teams: MODES[mode].teams, level: [1, 2, 3].includes(opts.level) ? opts.level : 2, fill: FILLS.includes(opts.fill) ? opts.fill : 4,
      world: buildWorld(N, N, N), ents: new Map(), nextEnt: 1, nextDino: 1000, t0: now(), ms: 0, round: 0, rows: null, dinos: [] };
    matches.set(m.id, m);
    getNav();
    startRound(m);
    enter(m, user, send);
    startClock();
    return m.id;
  }
  function join(gid, id, user, send) {
    const m = matches.get(id);
    if (!m || m.gid !== gid) fail('Den kamp er slut.');
    const cur = byUser.get(user.id);
    if (cur && cur.m === m) { cur.e.send = send; send(J(info(m, cur.e))); return m.id; }       // back again (the page was reloaded)
    if (humansOf(m).length >= ARENA.max) fail('Kampen er fuld.');
    leave(user.id);
    enter(m, user, send);
    return m.id;
  }
  function leave(uid, why = '') {
    const r = byUser.get(uid);
    if (!r) return false;
    const { m, e } = r;
    byUser.delete(uid);
    try { e.send(J({ t: 'aout', why })); } catch { /* gone already */ }
    e.send = null;
    dropEnt(m, e);
    if (!humansOf(m).length) { matches.delete(m.id); changed(m.gid, null, m.id); if (clock && !matches.size) { clearInterval(clock); clock = null; } }
    else { balance(m); changed(m.gid, sum(m)); }
    left(uid, m.gid);
    return true;
  }
  function dropGroup(gid) { for (const m of [...matches.values()]) if (m.gid === gid) for (const e of humansOf(m)) leave(e.uid, 'gone'); }

  return { ofGroup, create, join, leave, msg, dropGroup, tick, of: uid => byUser.get(uid) || null, size: () => matches.size, _debug: { matches, getNav } };
}
