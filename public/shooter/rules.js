// SLQ Game Lobby — the shooter's rules that the browser and the server share: weapons, game types, the numbers
// of a match, and the small sums both sides must do alike (where a shot flies, what it hits, how much it hurts).
// The server decides; the browser uses the same rules to show at once what the server will say in a moment.

// Weapons: every firearm shoots a bullet that flies and drops a little. spread in radians, grav = how fast it
// drops, head = headshot factor; damage is full out to fallFull metres and falls to fallMin at fallFar.
// rKick / rYaw = recoil in degrees. One always has the knife; the others are found in the arena.
export const WEAPONS = {
  knife: { name: 'Kniv', melee: true, rate: 0.5, dmg: 60, reach: 2.4 },
  pistol: { name: 'Pistol', magMax: 12, rate: 0.17, reload: 1.1, dmg: 30, speed: 95, grav: 5, spread: 0.020, head: 2.0, fallFull: 25, fallFar: 90, fallMin: 0.6, rKick: 0.9, rYaw: 0.4 },
  sniper: { name: 'Snigskytte', magMax: 5, rate: 1.1, reload: 1.8, zoom: true, dmg: 95, speed: 200, grav: 2, spread: 0.050, spreadADS: 0.0015, head: 2.5, fallFull: 300, fallFar: 320, fallMin: 1.0, rKick: 2.2, rYaw: 0.5 },
  bazooka: { name: 'Bazooka', magMax: 1, rate: 0.9, reload: 2.2, dmg: 120, speed: 40, grav: 6, spread: 0.010, splash: 5.0, rKick: 2.6, rYaw: 0.6 },
  badgun: { name: 'Dårlig pistol', magMax: 8, rate: 0.14, reload: 0.9, dmg: 14, speed: 70, grav: 7, spread: 0.060, head: 1.5, fallFull: 12, fallFar: 50, fallMin: 0.5, rKick: 1.3, rYaw: 0.9 },
};
export const WEAPON_IDS = ['knife', 'pistol', 'sniper', 'bazooka', 'badgun'];      // the number keys 1-5, and how a weapon is named on the wire
export const SHOT_LIFE = 4;          // seconds a bullet flies at most

// Game types. `goal`: stars (Stjernejagt) or kills that win; `time`: seconds until the round is called.
export const MODES = {
  stars: { name: 'Stjernejagt', teams: true, goal: 5, time: 1200, text: 'Tag den gyldne stjerne på toget og få den op i jeres tårn. Første hold med 5 stjerner vinder.' },
  tdm: { name: 'Holdkamp', teams: true, goal: 30, time: 480, text: 'Rødt mod blåt. Første hold med 30 drab vinder.' },
  ffa: { name: 'Alle mod alle', teams: false, goal: 15, time: 480, text: 'Alle mod alle. Første med 15 drab vinder.' },
};
export const MODE_IDS = ['stars', 'tdm', 'ffa'];
export const LEVELS = ['Lette', 'Middel', 'Svære'];        // the robots: 1, 2, 3
export const FILLS = [0, 2, 4, 6, 8];                      // robots fill a match up to this many players

export const ARENA = {
  max: 8,               // people in one match
  perGroup: 2,          // matches at a time in one group
  tick: 50,             // milliseconds between two steps of the server
  countdown: 5, endShow: 12,
  respawn: 3, protect: 2.5,
  pickupBack: 30, healthBack: 15, health: 25,
  starEvery: 60, starFirst: 5, stealTime: 3, deliverTime: 0.8, deliverWait: 30,
  idleKick: 180,        // seconds without moving before a player is put back in the clubhouse
};

// The two teams: where their tower stands (its deck is where stars are kept), and where they come into the arena.
export const TEAMS = {
  A: { name: 'Rødt', cx: -30, cz: -46, deck: 8, baseZ: -52, yaw: Math.PI, col: 0xcf4a58, css: '#ff6b73' },
  B: { name: 'Blåt', cx: 30, cz: 46, deck: 8, baseZ: 52, yaw: 0, col: 0x4a78cf, css: '#6ba3ff' },
};
export const other = team => team === 'A' ? 'B' : 'A';

// The dinos: a team's guards in Stjernejagt. Slow, a bad pistol, they stay near where they came out. When one sees
// somebody to attack, it roars first (`roar` seconds: it stands, and does not shoot yet); it roars again the next
// time only after `calm` seconds with nobody to attack.
export const DINO = { spd: 3.0, range: 34, hold: 15, fire: 0.8, dmg: 8, hp: 60, leash: 18, roar: 1.1, calm: 6, shot: { speed: 70, grav: 6, spread: 0.05, life: 2.5 } };

// What a state message says about somebody, besides where they are.
export const FLAG = { ground: 1, sprint: 2, zoom: 4, use: 8, reload: 16 };

// ---------- sums ----------
// Where somebody looks: yaw 0 is towards -z, a positive pitch is up.
export function aimDir(yaw, pitch) {
  const c = Math.cos(pitch);
  return [-Math.sin(yaw) * c, Math.sin(pitch), -Math.cos(yaw) * c];
}
// The yaw and pitch that look along a direction.
export function dirAim(dx, dy, dz) {
  return [Math.atan2(-dx, -dz), Math.atan2(dy, Math.hypot(dx, dz))];
}
// A direction nudged at random inside a cone of `sp` radians. rnd: a function giving 0..1.
export function spreadDir(d, sp, rnd) {
  if (!sp || sp <= 0) return d;
  let tx = -d[2], ty = 0, tz = d[0];                       // d × up
  let tl = Math.hypot(tx, tz); if (tl < 1e-3) { tx = 1; tz = 0; tl = 1; }
  tx /= tl; tz /= tl;
  const bx = d[1] * tz - d[2] * ty, by = d[2] * tx - d[0] * tz, bz = d[0] * ty - d[1] * tx;      // d × t
  const a = (rnd() * 2 - 1) * sp, c = (rnd() * 2 - 1) * sp;
  const x = d[0] + tx * a + bx * c, y = d[1] + ty * a + by * c, z = d[2] + tz * a + bz * c, l = Math.hypot(x, y, z);
  return [x / l, y / l, z / l];
}
// How much of its damage a bullet still has after `dist` metres.
export function falloff(w, dist) {
  if (!w.fallFull || dist <= w.fallFull) return 1;
  if (dist >= w.fallFar) return w.fallMin;
  return 1 - (1 - w.fallMin) * (dist - w.fallFull) / (w.fallFar - w.fallFull);
}
// Does a point hit somebody who stands with the feet at (ex, ey, ez)? 'head', 'body' or null.
export function zoneAt(ex, ey, ez, px, py, pz) {
  const hx = ex - px, hz = ez - pz;
  if (Math.hypot(hx, (ey + 1.85) - py, hz) < 0.5) return 'head';
  if (hx * hx + hz * hz < 0.36 && py > ey + 0.2 && py < ey + 1.7) return 'body';
  return null;
}
export function dinoAt(dx, dy, dz, px, py, pz) {
  return Math.hypot(dx - px, dz - pz) < 0.7 && py > dy + 0.2 && py < dy + 2.2;
}
// A new flying shot from eye `o` along `d` (both [x, y, z]).
export function newShot(o, d, speed, grav, life) {
  return { x: o[0] + d[0] * 0.6, y: o[1] + d[1] * 0.6, z: o[2] + d[2] * 0.6, vx: d[0] * speed, vy: d[1] * speed, vz: d[2] * speed, grav: grav || 0, life: life || SHOT_LIFE, ox: o[0], oy: o[1], oz: o[2] };
}
// Moves a shot `dt` seconds on, in steps short enough not to jump through a wall or a person. `test(x, y, z)` is
// asked after every step; when it answers with something, the flight ends there and that is returned.
// Returns 'gone' when the shot has flown its time.
export function flyShot(s, dt, test) {
  const n = Math.max(1, Math.ceil(Math.hypot(s.vx, s.vy, s.vz) * dt / 0.3)), h = dt / n;
  for (let i = 0; i < n; i++) {
    s.vy -= s.grav * h;
    s.x += s.vx * h; s.y += s.vy * h; s.z += s.vz * h;
    s.life -= h;
    const r = test(s.x, s.y, s.z);
    if (r) return r;
    if (s.life <= 0) return 'gone';
  }
  return null;
}
// What an explosion at `p` does to somebody whose feet are at (x, y, z): the damage, or 0 when out of reach.
export function splashDmg(w, p, x, y, z, mid = 1) {
  const d = Math.hypot(x - p[0], z - p[2], (y + mid) - p[1]);
  return d < w.splash ? w.dmg * (1 - d / w.splash) : 0;
}
// The names of the robots.
export const BOT_NAMES = ['Bolt', 'Gnist', 'Møtrik', 'Tandhjul', 'Fjeder', 'Skrue', 'Dims', 'Nitte', 'Splint', 'Kugleleje', 'Lodde', 'Spole'];
