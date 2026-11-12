// SLQ Game Lobby — the minds of the shooter's robots. A robot is a player like any other in a match (arena.js):
// it walks with the arena's own movement rules, sees only what is in its line of sight, and its bullets fly like
// everybody's. Here it is decided where it wants to go, whom it aims at, and when it pulls the trigger.
import { EYE } from '../public/shooter/world.js';
import { WEAPONS, WEAPON_IDS, TEAMS, FLAG, ARENA, other, dirAim } from '../public/shooter/rules.js';

// How good a robot is, by level: aiming error (radians), seconds before it reacts, how fast it turns (radians a
// second), pauses between bursts, how often it side-steps in a fight, how well it leads a moving target, how far it sees.
const SKILL = [null,
  { err: 0.085, react: 0.8, turn: 3.0, pause: [0.5, 1.1], strafe: 0.2, lead: 0.3, far: 32, head: 0 },
  { err: 0.045, react: 0.45, turn: 5.5, pause: [0.25, 0.6], strafe: 0.6, lead: 0.7, far: 46, head: 0.1 },
  { err: 0.02, react: 0.26, turn: 9.0, pause: [0.1, 0.3], strafe: 0.9, lead: 1.0, far: 60, head: 0.3 }];
// The distance a robot likes to keep with each weapon: [too close, too far].
const RANGE = { knife: [0, 0], pistol: [7, 22], sniper: [24, 70], bazooka: [10, 30], badgun: [4, 13] };

export function newBrain(level, rand) {
  return {
    level, goal: null, path: null, pi: 0, aheadT: 0, ahead: -1, thinkT: rand() * 0.2, planT: 0,
    target: null, vis: false, lostT: 0, reactT: 0, lastSeen: null,
    err: [0, 0], errT: 0, strafe: rand() < 0.5 ? 1 : -1, strafeT: 0, moveDir: null, pauseT: 0, idleT: 0,
    stuckT: 0, lastD: 1e9, thief: false, sx: 0, sz: 0, sT: 0,
  };
}
export function resetBrain(b) {
  b.goal = null; b.path = null; b.pi = 0; b.ahead = -1; b.target = null; b.vis = false; b.lostT = 0; b.lastSeen = null; b.moveDir = null; b.stuckT = 0; b.lastD = 1e9; b.planT = 0; b.thief = false;
}

const has = (e, id) => (e.owned & (1 << WEAPON_IDS.indexOf(id))) !== 0;
const dist2 = (a, x, z) => (a.x - x) * (a.x - x) + (a.z - z) * (a.z - z);
const angDiff = (a, b) => { let d = (a - b) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };

// ctx: { m (the match), world, nav, rand, enemy(a, b), fire(e), paths: { left } }
export function thinkBot(ctx, e, dt) {
  const b = e.brain, inp = e.inp;
  inp.mx = 0; inp.mz = 0; inp.sprint = false; inp.jump = false; e.use = false;
  b.thinkT -= dt; b.planT -= dt; b.reactT -= dt; b.pauseT -= dt; b.strafeT -= dt; b.errT -= dt; b.aheadT -= dt;
  if (b.thinkT <= 0) { b.thinkT = 0.13 + ctx.rand() * 0.06; look(ctx, e); plan(ctx, e); }
  const fighting = b.target && b.vis;
  if (fighting) fightMove(ctx, e, dt); else follow(ctx, e, dt, true);
  aim(ctx, e, dt);
  special(ctx, e, dt);
  // standing on one spot for seconds without a fight or a reason to wait: think again
  const g = b.goal, waits = g && (g.kind === 'star' || g.kind === 'steal' || g.kind === 'deliver');
  if (fighting || waits || Math.hypot(e.x - b.sx, e.z - b.sz) > 0.6) { b.sx = e.x; b.sz = e.z; b.sT = 0; }
  else if ((b.sT += dt) > 3) { b.goal = null; b.path = null; b.sT = 0; b.planT = 0; }
}

// ---------- seeing ----------
function look(ctx, e) {
  const b = e.brain, m = ctx.m, sk = SKILL[b.level], w = ctx.world, ey = e.y + EYE - 0.1;
  const cand = [];
  for (const v of m.ents.values()) {
    if (!v.alive || !ctx.enemy(e, v)) continue;
    const d = Math.hypot(v.x - e.x, v.z - e.z, v.y - e.y);
    if (d < sk.far) cand.push([d * (v === b.target ? 0.6 : 1), v]);
  }
  for (const dn of m.dinos) {
    if (dn.team === e.team) continue;
    const d = Math.hypot(dn.x - e.x, dn.z - e.z);
    if (d < 28) cand.push([d * (dn === b.target ? 0.8 : 1.4), dn]);
  }
  cand.sort((p, q) => p[0] - q[0]);
  let seen = null;
  for (let i = 0; i < cand.length && i < 3 && !seen; i++) {
    const v = cand[i][1];
    if (w.losClear(e.x, ey, e.z, v.x, v.y + (v.dino ? 1.2 : 1.3), v.z)) seen = v;
  }
  if (seen) {
    if (b.target !== seen || !b.vis) b.reactT = sk.react * (0.7 + ctx.rand() * 0.6) * (b.target === seen ? 0.4 : 1);
    b.target = seen; b.vis = true; b.lostT = 0; b.lastSeen = [seen.x, seen.y, seen.z];
  } else {
    b.vis = false;
    if (b.target) { b.lostT += 0.16; if (b.lostT > 2 || b.target.hp <= 0 || b.target.alive === false) b.target = null; }
  }
}

// ---------- what to do ----------
function plan(ctx, e) {
  const b = e.brain, m = ctx.m, w = ctx.world, g = b.goal;
  // a goal is kept until it is reached, gone, or grown old
  if (g) {
    const near = dist2(e, g.x, g.z) < (g.r || 1) * (g.r || 1) && Math.abs(e.y - g.y) < 1.5;
    if (g.kind === 'weapon' && (!m.pickups[g.i].on || has(e, w.PICKUPS[g.i].type))) b.goal = null;
    else if (g.kind === 'health' && (!m.packs[g.i].on || e.hp >= 90)) b.goal = null;
    else if (g.kind === 'star' && !m.trainStar) b.goal = null;
    else if (g.kind === 'steal' && (m.stars[other(e.team)] <= 0 || m.state !== 'active')) { b.goal = null; b.thief = false; }
    else if (g.kind === 'deliver' && !(m.deliver && m.deliver.team === e.team)) b.goal = null;
    else if (g.kind === 'hunt' && (near || b.planT <= 0)) b.goal = null;
    else if (g.kind === 'roam' && near) b.goal = null;
  }
  const onlyKnife = e.owned === 1, gun = !onlyKnife;
  let want = null;
  // 0. the team's star hangs over the tower: whoever took it (or stands up there anyway) puts it in place
  if (m.deliver && m.deliver.team === e.team && (!g || g.kind !== 'deliver')) {
    const t = TEAMS[e.team];
    if (m.deliver.by === e.id || (Math.hypot(e.x - t.cx, e.z - t.cz) < 7 && e.y > t.deck - 1.5)) want = { kind: 'deliver', x: t.cx + 0.3, y: t.deck - 0.02, z: t.cz + 0.3, r: 1.2 };
  }
  // 1. hurt: to the team's health pack, when there is one
  if (!want && e.hp < 45 && (!g || (g.kind !== 'health' && g.kind !== 'deliver'))) {
    for (let i = 0; i < w.HEALTH_PACKS.length; i++) {
      const hp = w.HEALTH_PACKS[i];
      if (m.packs[i].on && (!m.teams || hp.team === e.team) && dist2(e, hp.x, hp.z) < 60 * 60) want = { kind: 'health', i, x: hp.x, y: 0, z: hp.z, r: 0.8 };
    }
  }
  // 2. no firearm: fetch the nearest one that lies ready
  if (!want && (!g || g.kind === 'hunt' || g.kind === 'roam') && (onlyKnife || (ctx.rand() < 0.02 && !has(e, 'pistol')))) {
    let bd = 1e9;
    for (let i = 0; i < w.PICKUPS.length; i++) {
      const p = w.PICKUPS[i];
      if (!m.pickups[i].on || has(e, p.type) || (p.y && b.level < 2)) continue;
      const d = Math.hypot(e.x - p.x, e.z - p.z) + (p.y ? 45 : 0) + (p.type === 'badgun' && gun ? 200 : 0) + ((i * 7 + e.id * 13) % 5) * 3;
      if (d < bd) { bd = d; want = { kind: 'weapon', i, x: p.x, y: p.y || 0, z: p.z, r: 0.7 }; }
    }
  }
  if (!want && (!b.goal || b.goal.kind === 'hunt' || b.goal.kind === 'roam') && m.mode === 'stars' && m.state === 'active') {
    // 3. the star on the train: the two of the team that are nearest go for it
    if (m.trainStar && gun && m.time - m.starAt > [0, 20, 12, 6][b.level]) {      // they are a little slow to notice: people get a head start
      const c = w.bazCar; let closer = 0;
      for (const v of m.ents.values()) if (v !== e && v.alive && v.team === e.team && dist2(v, c.cx, c.cz) < dist2(e, c.cx, c.cz)) closer++;
      if (closer < 2) want = trackSpot(ctx, e);
    }
    // 4. now and then one robot of a team tries to steal a star from the other tower (the better robots more often,
    //    the easy ones never), when the others have at least two
    if (!want && b.level >= 2 && gun && m.stars[other(e.team)] >= 2 && m.time - (m.thiefAt[e.team] || -99) > 50 && ctx.rand() < (b.level === 3 ? 0.012 : 0.005)) {
      let thieves = 0;
      for (const v of m.ents.values()) if (v.brain && v.team === e.team && v.brain.thief) thieves++;
      if (!thieves) { const t = TEAMS[other(e.team)]; b.thief = true; m.thiefAt[e.team] = m.time; want = { kind: 'steal', x: t.cx + 0.6, y: t.deck - 0.02, z: t.cz + 0.6, r: 1.6 }; }
    }
  }
  // 5. otherwise: towards the enemy (where one was seen last, or where the nearest one is), now and then somewhere else
  if (!want && !b.goal) {
    if (b.lastSeen && !b.target) { want = { kind: 'hunt', x: b.lastSeen[0], y: b.lastSeen[1], z: b.lastSeen[2], r: 2.5 }; b.lastSeen = null; }
    else {
      let bd = 1e9, bv = null;
      if (ctx.rand() >= 0.25) for (const v of m.ents.values()) if (v.alive && ctx.enemy(e, v)) { const d = dist2(e, v.x, v.z); if (d < bd) { bd = d; bv = v; } }
      if (bv) want = { kind: 'hunt', x: bv.x, y: bv.y, z: bv.z, r: 2.5 };
      else {                                                // a stroll to somewhere on the ground
        const nav = ctx.nav; let n = 0;
        for (let k = 0; k < 8; k++) { n = Math.floor(ctx.rand() * nav.size); if (Math.abs(nav.y[n]) < 0.1) break; }
        want = { kind: 'roam', x: nav.x[n], y: nav.y[n], z: nav.z[n], r: 2 };
      }
    }
    b.planT = 3 + ctx.rand() * 2;
  }
  if (want) setGoal(ctx, e, want);
  else if (b.goal && !b.path && ctx.paths.left > 0) setGoal(ctx, e, b.goal);
}

// A place beside the track where the train will pass: the nearest one to the robot.
function trackSpot(ctx, e) {
  const w = ctx.world, nav = ctx.nav;
  let best = null, bd = 1e9;
  for (let s = 0; s < w.LOOP_L; s += 6) {
    const p = w.loopAt(s);
    for (const side of [1, -1]) {
      const x = p.x - p.dz * 2.7 * side, z = p.z + p.dx * 2.7 * side, d = dist2(e, x, z);
      if (d < bd && nav.near(x, 0, z, 0.6) >= 0) { bd = d; best = { kind: 'star', x, y: 0, z, r: 0.7 }; }
    }
  }
  return best;
}

function setGoal(ctx, e, goal) {
  const b = e.brain, nav = ctx.nav;
  b.goal = goal; b.path = null; b.pi = 0; b.ahead = -1; b.stuckT = 0; b.lastD = 1e9;
  if (ctx.paths.left <= 0) return;                       // a path is found on a later turn
  ctx.paths.left--;
  const a = nav.near(e.x, e.y, e.z, 2.5), z = nav.near(goal.x, goal.y, goal.z, 3);
  b.path = a >= 0 && z >= 0 ? nav.path(a, z) : null;
  if (!b.path) b.goal = null;
}

// ---------- walking ----------
// Steers along the path: at a place a few steps ahead when the way there is straight, else at the next one.
function follow(ctx, e, dt, run) {
  const b = e.brain, nav = ctx.nav, inp = e.inp, p = b.path;
  if (!p || !b.goal) return;
  // tick off the places that are reached
  while (b.pi < p.length) {
    const n = p[b.pi], dx = nav.x[n] - e.x, dz = nav.z[n] - e.z;
    if (dx * dx + dz * dz < 0.16 && Math.abs(nav.y[n] - e.y) < 0.45) { b.pi++; b.ahead = -1; b.lastD = 1e9; b.stuckT = 0; } else break;
  }
  if (b.pi >= p.length) {
    // at the end of the path: the last bit straight at the goal when the way is free, else this is as near as it gets
    const g = b.goal, dx = g.x - e.x, dz = g.z - e.z, d = Math.hypot(dx, dz);
    if (d > 0.25 && d < 4 && Math.abs(g.y - e.y) < 1.2 && nav.straight(e.x, e.y, e.z, g.x, g.z, g.y)) { inp.mx = dx / d; inp.mz = dz / d; }
    else { b.path = null; if (d > (g.r || 1) && (g.kind === 'hunt' || g.kind === 'roam' || g.kind === 'weapon' || g.kind === 'health')) b.goal = null; }
    return;
  }
  if (b.aheadT <= 0 || b.ahead < b.pi) {
    b.aheadT = 0.2; b.ahead = b.pi;
    for (const k of [7, 4, 2]) {
      const j = Math.min(p.length - 1, b.pi + k), n = p[j];
      if (j > b.pi && Math.abs(nav.y[n] - e.y) < 0.4 && nav.straight(e.x, e.y, e.z, nav.x[n], nav.z[n], nav.y[n])) { b.ahead = j; break; }
    }
  }
  const n = p[b.ahead], dx = nav.x[n] - e.x, dz = nav.z[n] - e.z, d = Math.hypot(dx, dz) || 1;
  inp.mx = dx / d; inp.mz = dz / d;
  inp.sprint = run && p.length - b.pi > 12 && e.y < 0.6 && e.y > -0.2;
  // stuck: no nearer for a while -> a hop, then a new path
  const dn = Math.hypot(nav.x[p[b.pi]] - e.x, nav.z[p[b.pi]] - e.z);
  if (dn < b.lastD - 0.02) { b.lastD = dn; b.stuckT = 0; }
  else {
    b.stuckT += dt;
    if (b.stuckT > 0.5 && b.stuckT < 0.6) { inp.jump = true; b.ahead = b.pi; b.aheadT = 0.6; }
    if (b.stuckT > 1.4) { b.path = null; b.stuckT = 0; b.lastD = 1e9; }
  }
}

// In a fight: close in, back off or side-step, by the weapon in hand. Without a firearm: at them with the knife
// when they are near, else carry on to wherever the robot was going (a weapon, most likely).
function fightMove(ctx, e, dt) {
  const b = e.brain, t = b.target, inp = e.inp, nav = ctx.nav, sk = SKILL[b.level];
  const dx = t.x - e.x, dz = t.z - e.z, d = Math.hypot(dx, dz) || 1, id = WEAPON_IDS[e.w], rg = RANGE[id];
  const g = b.goal;
  if (e.owned === 1) {
    if (d < 9 && Math.abs(t.y - e.y) < 1.5) { inp.mx = dx / d; inp.mz = dz / d; inp.sprint = d > 3; }
    else follow(ctx, e, dt, true);
    return;
  }
  if (g && (g.kind === 'health' || g.kind === 'star' || g.kind === 'steal' || g.kind === 'deliver' || (g.kind === 'weapon' && d > 12))) { follow(ctx, e, dt, true); return; }
  if (b.strafeT <= 0) {
    b.strafeT = 0.5 + ctx.rand() * 1.0;
    if (ctx.rand() < 0.5) b.strafe = -b.strafe;
    // where to: forwards when too far, backwards when too close, sideways now and then
    let fx = 0, fz = 0;
    if (d > rg[1]) { fx = dx / d; fz = dz / d; } else if (d < rg[0]) { fx = -dx / d; fz = -dz / d; }
    if (ctx.rand() < sk.strafe || (!fx && !fz && ctx.rand() < 0.5)) { fx += -dz / d * b.strafe * 0.9; fz += dx / d * b.strafe * 0.9; }
    const l = Math.hypot(fx, fz);
    b.moveDir = null;
    if (l > 0.1 && !(id === 'sniper' && d <= rg[1] && d >= rg[0])) {
      fx /= l; fz /= l;
      if (nav.straight(e.x, e.y, e.z, e.x + fx * 1.6, e.z + fz * 1.6, e.y)) b.moveDir = [fx, fz];
      else if (nav.straight(e.x, e.y, e.z, e.x - fx * 1.6, e.z - fz * 1.6, e.y) && d <= rg[1]) { b.moveDir = [-fx, -fz]; b.strafe = -b.strafe; }
    }
    if (d > rg[1] + 8 && !b.moveDir) { b.goal = null; }                   // cannot get nearer in a straight line: plan a path
  }
  if (b.moveDir) { inp.mx = b.moveDir[0]; inp.mz = b.moveDir[1]; inp.sprint = d > rg[1] + 6; }
  else if (d > rg[1]) follow(ctx, e, dt, true);
  if (b.level === 3 && ctx.rand() < 0.01) inp.jump = true;
}

// ---------- aiming and shooting ----------
function aim(ctx, e, dt) {
  const b = e.brain, sk = SKILL[b.level], t = b.target, inp = e.inp;
  let wantYaw, wantPitch = 0, fireOk = false;
  if (t && (b.vis || b.lostT < 0.6)) {
    pickWeapon(e, Math.hypot(t.x - e.x, t.z - e.z, t.y - e.y));
    const w = WEAPONS[WEAPON_IDS[e.w]], ex = e.x, ey = e.y + EYE, ez = e.z;
    let tx = t.x, ty = t.y + (t.dino ? 1.1 : (b.headShot ? 1.8 : 1.15)), tz = t.z;
    const d = Math.hypot(tx - ex, ty - ey, tz - ez);
    if (!w.melee) {
      const fly = d / w.speed, h = t.hist, old = h && h.length > 4 ? h[h.length - 5] : null;
      if (old) { const k = sk.lead * fly / Math.max(0.05, (ctx.m.ms - old[0]) / 1000); tx += (t.x - old[1]) * k; tz += (t.z - old[3]) * k; }
      ty += 0.5 * w.grav * fly * fly * (b.level === 1 ? 0.5 : 1);
    }
    if (b.errT <= 0) {
      b.errT = 0.3 + ctx.rand() * 0.35; b.headShot = ctx.rand() < sk.head;
      const moving = Math.hypot(inp.mx, inp.mz) > 0.1 ? 1.5 : 1;
      b.err = [(ctx.rand() + ctx.rand() - 1) * sk.err * moving, (ctx.rand() + ctx.rand() - 1) * sk.err * 0.6 * moving];
    }
    const a = dirAim(tx - ex, ty - ey, tz - ez);
    wantYaw = a[0] + b.err[0]; wantPitch = a[1] + b.err[1];
    fireOk = b.vis && b.reactT <= 0 && (!w.melee || d < w.reach - 0.2) && d < sk.far + 10;
  } else if (Math.hypot(inp.mx, inp.mz) > 0.1) wantYaw = Math.atan2(-inp.mx, -inp.mz);
  else wantYaw = e.yaw;
  const dy = angDiff(wantYaw, e.yaw), dp = wantPitch - e.pitch, max = sk.turn * dt * (t ? 1 : 0.6);
  e.yaw += Math.abs(dy) < max ? dy : Math.sign(dy) * max;
  e.pitch += Math.abs(dp) < max ? dp : Math.sign(dp) * max;
  if (fireOk && Math.abs(dy) < Math.max(0.05, sk.err * 2) && Math.abs(dp) < 0.12 && b.pauseT <= 0) {
    if (ctx.fire(e) && ctx.rand() < 0.3) b.pauseT = sk.pause[0] + ctx.rand() * (sk.pause[1] - sk.pause[0]);
    b.idleT = 0;
  } else if (!t) {
    // nothing to shoot at: fill the magazine
    b.idleT += dt;
    const id = WEAPON_IDS[e.w], w = WEAPONS[id];
    if (b.idleT > 1.5 && !w.melee && e.mag[e.w] < w.magMax && e.reloadT <= 0) { e.reloadT = w.reload; b.idleT = 0; }
  }
}

function pickWeapon(e, d) {
  const ok = id => has(e, id) && (e.mag[WEAPON_IDS.indexOf(id)] > 0 || e.reloadT <= 0);
  let id = 'knife';
  if (d < 2.3 && e.reloadT > 0) id = 'knife';
  else if (ok('sniper') && d > 22) id = 'sniper';
  else if (ok('bazooka') && d > 9 && d < 45) id = 'bazooka';
  else if (ok('pistol')) id = 'pistol';
  else if (ok('badgun')) id = 'badgun';
  else if (ok('sniper')) id = 'sniper';
  else if (ok('bazooka') && d > 7) id = 'bazooka';
  const i = WEAPON_IDS.indexOf(id);
  if (i !== e.w) { e.w = i; e.reloadT = 0; e.fireCd = Math.max(e.fireCd, 0.25); }
}

// ---------- the star and the towers ----------
function special(ctx, e, dt) {
  const b = e.brain, g = b.goal, m = ctx.m, w = ctx.world;
  if (!g) return;
  if (g.kind === 'star' && m.trainStar) {
    // waiting by the track: when the star's wagon comes past, a hop and a grab
    const c = w.bazCar, d = Math.hypot(e.x - c.cx, e.z - c.cz);
    if (d < 3.5) { e.use = true; if (e.y < 0.05) e.inp.jump = true; }
    if (dist2(e, g.x, g.z) < 1 && d > 3.5) { e.inp.mx = 0; e.inp.mz = 0; }
  } else if (g.kind === 'steal') {
    const t = TEAMS[other(e.team)];
    if (Math.hypot(e.x - t.cx, e.z - t.cz) < 4.2 && e.y > t.deck - 1.4) { e.use = true; if (!b.vis) { e.inp.mx = 0; e.inp.mz = 0; } }
  }
}
export const _test = { SKILL, RANGE, FLAG, ARENA };
