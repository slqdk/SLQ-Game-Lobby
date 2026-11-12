// Ludo, by the rules most people in Denmark play. Four pieces each; a six brings a piece out of the yard, and a
// six gives another throw. Globes are safe: whoever lands on somebody standing on one goes home instead. A star
// carries the piece on to the next star, and the last star before one's own lane leads straight to the goal. Two
// pieces of one colour on a square cannot be sent home. The goal must be hit exactly; what is thrown too much is
// walked back. With nothing on the board there are three throws to get a six. First with four in the goal wins.
// Two to four players.
//
// The track has 52 squares, counted clockwise; every colour starts 13 squares after the one before it. A piece is
// kept as how far it has come: -1 in the yard, 0 on its own start square, 50 on the last square before its lane,
// 51-55 in the lane, 56 in the goal.
// Moves: { roll } and { move: piece } (0-3). When a throw leaves no choice, the move is made at once.
import { GameError } from './base.js';

export const TRACK = 52, LANE = 51, GOAL = 56, PIECES = 4, TRIES = 3;
export const START = [1, 14, 27, 40];                       // each colour's start square: a globe of its own
export const GLOBES = [9, 22, 35, 48];                      // globes that are safe for everybody
export const STARS = [5, 12, 18, 25, 31, 38, 44, 51];       // every second one lies just before a colour's lane
export const COLORS = { 2: [0, 2], 3: [0, 1, 2], 4: [0, 1, 2, 3] };       // two players sit across from each other
export const abs = (color, rel) => (START[color] + rel) % TRACK;

const alive = s => s.gone.map((g, i) => g ? -1 : i).filter(i => i >= 0);

// The pieces of the other players that stand on a square of the track.
function there(s, seat, a) {
  const out = [];
  for (let i = 0; i < s.n; i++) if (i !== seat && !s.gone[i]) for (let k = 0; k < PIECES; k++) { const p = s.pos[i][k]; if (p >= 0 && p < LANE && abs(s.color[i], p) === a) out.push([i, k]); }
  return out;
}
// A piece comes to rest on a square of the track. A stranger there goes home; but if somebody there stands safely
// (on a globe, on their own start square, or two together), the piece that came goes home itself. A piece that
// comes out of its yard sends home whatever stands on its start square. Returns whether the piece stayed.
function land(s, seat, k, rel, log, out) {
  const a = abs(s.color[seat], rel), on = there(s, seat, a);
  s.pos[seat][k] = rel;
  if (!on.length) return true;
  if (!out && on.some(([i]) => GLOBES.includes(a) || START[s.color[i]] === a || on.filter(o => o[0] === i).length > 1)) { s.pos[seat][k] = -1; log.self = true; return false; }
  for (const [i, j] of on) { log.hit.push([i, j, s.pos[i][j]]); s.pos[i][j] = -1; }
  return true;
}
function next(s) {
  s.phase = 'roll'; s.tries = 0; s.moves = []; s.die = 0;
  for (let k = 1; k <= s.n; k++) { const i = (s.turn + k) % s.n; if (!s.gone[i]) { s.turn = i; return; } }
}
// Move piece k of that seat by the die. `last` tells the screen what happened: the squares the piece went over
// (steps), who was sent home (hit: [seat, piece, where it stood]), whether it went home itself (self).
function go(s, seat, k, d, pick) {
  const from = s.pos[seat][k], log = { n: s.count, seat, die: d, piece: k, from, steps: [], to: from, hit: [], self: false, star: false, pick };
  if (from < 0) { log.steps.push(0); land(s, seat, k, 0, log, true); }
  else {
    let p = from, dir = 1;
    for (let i = 0; i < d; i++) { if (p === GOAL) dir = -1; p += dir; log.steps.push(p); }         // too much: back again
    if (p >= LANE) s.pos[seat][k] = p;
    else if (land(s, seat, k, p, log, false)) {
      const a = abs(s.color[seat], p), st = STARS.indexOf(a);
      if (st >= 0) {                                              // a star: on to the next one, or from the last one into the goal
        const q = p === LANE - 1 ? GOAL : p + (STARS[(st + 1) % STARS.length] - a + TRACK) % TRACK;
        log.star = true; log.steps.push(q);
        if (q === GOAL) s.pos[seat][k] = GOAL; else land(s, seat, k, q, log, false);
      }
    }
  }
  log.to = s.pos[seat][k]; s.last = log; s.moves = [];
  if (s.pos[seat].every(p => p === GOAL)) { s.phase = 'over'; s.winner = seat; s.turn = -1; return; }
  if (d === 6) { s.phase = 'roll'; s.tries = 0; } else next(s);                                    // a six: throw again
}

// ---- what the robot thinks of a position ----
// What a piece is worth by how far it has come. In the lane it is as good as home, short of the last throw.
const worth = p => p < 0 ? 0 : p === GOAL ? 80 : p >= LANE ? 68 : 14 + p;
// How likely a piece is to be sent home before its owner's next turn: every stranger that can reach it with one
// throw (straight, over a star, or out of its yard) counts as one chance in six.
function risk(s, seat, k) {
  const p = s.pos[seat][k];
  if (p <= 0 || p >= LANE) return 0;                              // the yard, one's own start square, the lane and the goal
  const a = abs(s.color[seat], p);
  if (GLOBES.includes(a) || s.pos[seat].filter(x => x === p).length > 1) return 0;
  const star = STARS.indexOf(a), before = star >= 0 ? STARS[(star + STARS.length - 1) % STARS.length] : -1;
  let safe = 1;
  for (let i = 0; i < s.n; i++) {
    if (i === seat || s.gone[i]) continue;
    const c = s.color[i];
    let yard = false;
    for (const q of s.pos[i]) {
      if (q < 0) { yard = yard || START[c] === a; continue; }
      if (q >= LANE) continue;
      const b = abs(c, q), d = (a - b + TRACK) % TRACK, e = before < 0 ? 0 : (before - b + TRACK) % TRACK;
      if (d >= 1 && d <= 6 && q + d < LANE) safe *= 5 / 6;
      if (e >= 1 && e <= 6 && q + e < LANE - 1) safe *= 5 / 6;
    }
    if (yard) safe *= 5 / 6;
  }
  return 1 - safe;
}
function value(s, seat, careful) {
  const w = alive(s).length > 2 ? 0.6 : 1;                        // with several others, one of them losing a piece helps less
  let v = 0;
  for (let i = 0; i < s.n; i++) if (!s.gone[i]) for (let k = 0; k < PIECES; k++) {
    const x = worth(s.pos[i][k]);
    v += i === seat ? x * (1 - (careful ? risk(s, i, k) : 0)) : -w * x;
  }
  return v;
}

export default {
  id: 'ludo', name: 'Ludo', min: 2, max: 4, station: 'games',
  botNames: ['', 'Robot (let)', 'Robot (mellem)', 'Robot (svær)'], botList: ['Bolt', 'Gnist', 'Møtrik'],

  setup(n, opts) {
    return { n, color: COLORS[n].slice(), pos: Array.from({ length: n }, () => [-1, -1, -1, -1]), gone: new Array(n).fill(false), turn: (opts.first || 0) % n, phase: 'roll', die: 0, tries: 0, moves: [], count: 0, last: null, winner: -1 };
  },

  act(s, seat, a, rng) {
    if (s.phase === 'over' || seat !== s.turn) throw new GameError('Det er ikke din tur.');
    if (a && a.roll) {
      if (s.phase !== 'roll') throw new GameError('Du har slået: flyt en brik.');
      const d = 1 + Math.floor(rng() * 6), mine = s.pos[seat];
      s.die = d; s.tries++; s.count++;
      const can = [0, 1, 2, 3].filter(k => mine[k] !== GOAL && (mine[k] >= 0 || d === 6));
      if (!can.length) {
        const more = s.tries < TRIES && mine.every(p => p < 0 || p === GOAL);          // nothing on the board: three throws
        s.last = { n: s.count, seat, die: d, pass: true, more };
        if (!more) next(s);
      } else if (can.every(k => mine[k] === mine[can[0]])) go(s, seat, can[0], d, false);   // no choice: move at once
      else { s.phase = 'move'; s.moves = can; }
    } else if (a && Number.isInteger(a.move)) {
      if (s.phase !== 'move') throw new GameError('Slå terningen først.');
      if (!s.moves.includes(a.move)) throw new GameError('Den brik kan ikke flytte.');
      s.count++;
      go(s, seat, a.move, s.die, true);
    } else throw new GameError('Ukendt træk.');
  },

  // Somebody leaves: their pieces come off the board and the others play on. Alone, the last one has won.
  drop(s, seat) {
    if (s.gone[seat]) return;
    s.gone[seat] = true; s.pos[seat] = [-1, -1, -1, -1];
    const left = alive(s);
    if (left.length === 1) { s.phase = 'over'; s.winner = left[0]; s.turn = -1; s.moves = []; return; }
    if (s.turn === seat) next(s);
  },

  turn: s => s.phase === 'over' ? -1 : s.turn,
  result: s => s.phase === 'over' ? { win: [s.winner], draw: false } : null,
  view: s => s,

  // The robot tries each piece it may move and looks at the board afterwards: how far everybody has come, and (the
  // hard one) how likely its own pieces are to be sent home. The middle one sees what a move wins but not what it
  // risks; the easy one moves whichever piece.
  bot(s, seat, level, rng) {
    if (s.phase !== 'move') return { roll: true };
    if (level <= 1) return { move: s.moves[Math.floor(rng() * s.moves.length)] };
    let best = s.moves[0], top = -Infinity;
    for (const k of s.moves) {
      const t = { ...s, pos: s.pos.map(p => p.slice()), moves: [], last: null };
      go(t, seat, k, s.die, true);
      const v = value(t, seat, level > 2) + rng() * (level > 2 ? 0.5 : 9);
      if (v > top) { top = v; best = k; }
    }
    return { move: best };
  },
};
