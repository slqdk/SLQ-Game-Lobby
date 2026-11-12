// 4 på stribe: seven columns, six rows, two players. Rules and the house robot; no drawing here.
// The board is 42 numbers (0 empty, 1 and 2 the players), row 0 at the bottom: index = row * 7 + column.
import { GameError } from './base.js';

const W = 7, H = 6, DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]];

function lineThrough(b, idx) {
  const who = b[idx], c0 = idx % W, r0 = Math.floor(idx / W);
  for (const [dc, dr] of DIRS) {
    const line = [idx];
    for (const sign of [1, -1]) {
      for (let k = 1; k < 4; k++) {
        const c = c0 + dc * k * sign, r = r0 + dr * k * sign;
        if (c < 0 || c >= W || r < 0 || r >= H || b[r * W + c] !== who) break;
        line.push(r * W + c);
      }
    }
    if (line.length >= 4) return line.sort((x, y) => x - y);
  }
  return null;
}

function drop(b, col, who) {
  for (let r = 0; r < H; r++) if (!b[r * W + col]) { b[r * W + col] = who; return r * W + col; }
  return -1;
}

// ---------- the robot ----------
// Every window of four cells, made once.
const WINDOWS = [];
for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) for (const [dc, dr] of DIRS) {
  const cells = [];
  for (let k = 0; k < 4; k++) { const cc = c + dc * k, rr = r + dr * k; if (cc < 0 || cc >= W || rr < 0 || rr >= H) break; cells.push(rr * W + cc); }
  if (cells.length === 4) WINDOWS.push(cells);
}
const ORDER = [3, 2, 4, 1, 5, 0, 6];

// Does the piece at `i` complete four? (the search asks this for every position, so it makes no lists)
function wins(b, i, who) {
  const c0 = i % W, r0 = (i - c0) / W;
  for (const [dc, dr] of DIRS) {
    let n = 1;
    for (let c = c0 + dc, r = r0 + dr; c >= 0 && c < W && r >= 0 && r < H && b[r * W + c] === who; c += dc, r += dr) n++;
    for (let c = c0 - dc, r = r0 - dr; c >= 0 && c < W && r >= 0 && r < H && b[r * W + c] === who; c -= dc, r -= dr) n++;
    if (n >= 4) return true;
  }
  return false;
}

// How good the position looks for `me` without looking ahead: open lines of two and three, and the middle column.
function evaluate(b, me) {
  let s = 0;
  for (const w of WINDOWS) {
    let mine = 0, theirs = 0;
    for (let k = 0; k < 4; k++) { const v = b[w[k]]; if (v === me) mine++; else if (v) theirs++; }
    if (mine && theirs) continue;
    if (mine) s += mine === 3 ? 40 : mine === 2 ? 6 : 1;
    else if (theirs) s -= theirs === 3 ? 40 : theirs === 2 ? 6 : 1;
  }
  for (let r = 0; r < H; r++) { const v = b[r * W + 3]; if (v === me) s += 3; else if (v) s -= 3; }
  return s;
}

// Negamax with cut-offs: the value of the position for `who`, who is to move. `st` counts positions, so a search
// that takes too long can be given up (st.out). A four that can be made at once is always seen, also at the leaves.
function search(b, top, who, depth, alpha, beta, left, st) {
  if (!left) return 0;
  for (let c = 0; c < W; c++) {
    const r = top[c];
    if (r >= H) continue;
    const i = r * W + c;
    b[i] = who; const w = wins(b, i, who); b[i] = 0;
    if (w) return 100000 + depth;
  }
  if (++st.n > st.max) { st.out = true; return 0; }
  if (depth <= 0) return evaluate(b, who);
  let best = -Infinity;
  for (let k = 0; k < W; k++) {
    const c = ORDER[k], r = top[c];
    if (r >= H) continue;
    b[r * W + c] = who; top[c]++;
    const v = -search(b, top, 3 - who, depth - 1, -beta, -alpha, left - 1, st);
    top[c]--; b[r * W + c] = 0;
    if (st.out) return 0;
    if (v > best) best = v;
    if (v > alpha) alpha = v;
    if (alpha >= beta) break;
  }
  return best;
}

// The value of each open column for `me`, looking `depth` moves further: [[column, value]...], exact for the best
// columns and a ceiling for the rest. `order` is the columns to try, best guess first. null: the search was given up.
function rate(b, top, me, depth, left, st, order) {
  const out = [];
  let alpha = -Infinity;
  for (const c of order) {
    const r = top[c], i = r * W + c;
    b[i] = me; top[c]++;
    const v = wins(b, i, me) ? 1e6 : -search(b, top, 3 - me, depth, -Infinity, 1 - alpha, left - 1, st);
    top[c]--; b[i] = 0;
    if (st.out) return null;
    out.push([c, v]);
    if (v > alpha) alpha = v;
  }
  return out.sort((x, y) => y[1] - x[1]);
}

export default {
  id: 'c4', name: '4 på stribe', min: 2, max: 2, station: 'games', seatNames: ['Rød', 'Gul'],
  botNames: ['', 'Robotten (let)', 'Robotten (mellem)', 'Robotten (svær)'],

  setup(n, opts) {
    return { b: new Array(W * H).fill(0), turn: opts.first ? 1 : 0, n: 0, last: -1, line: null, over: false };
  },

  act(s, seat, a) {
    if (s.over) throw new GameError('Spillet er slut.');
    if (seat !== s.turn) throw new GameError('Det er ikke din tur.');
    const c = a && a.c;
    if (!Number.isInteger(c) || c < 0 || c >= W) throw new GameError('Vælg en kolonne.');
    const i = drop(s.b, c, seat + 1);
    if (i < 0) throw new GameError('Kolonnen er fuld.');
    s.n++; s.last = i;
    s.line = lineThrough(s.b, i);
    if (s.line || s.n === W * H) s.over = true; else s.turn = 1 - s.turn;
  },

  turn: s => s.over ? -1 : s.turn,
  result: s => !s.over ? null : s.line ? { win: [s.turn], draw: false } : { win: [], draw: true },
  view: s => s,

  // level 1 sees what the next move can do and often just picks a column, 2 looks three moves ahead,
  // 3 looks as far as it gets within a fixed number of positions (so a move never holds the server up)
  bot(s, seat, level, rng) {
    const me = seat + 1, b = Int8Array.from(s.b), top = new Int8Array(W);
    for (let c = 0; c < W; c++) { let r = 0; while (r < H && b[r * W + c]) r++; top[c] = r; }
    const open = ORDER.filter(c => top[c] < H), left = W * H - s.n;
    if (level <= 1 && rng() < 0.3) {
      for (const c of open) { const i = top[c] * W + c; b[i] = me; const w = wins(b, i, me); b[i] = 0; if (w) return { c }; }     // never miss a win
      return { c: open[Math.floor(rng() * open.length)] };
    }
    const st = { n: 0, max: level >= 3 ? 14000 : 1e9, out: false };
    let rated = rate(b, top, me, level <= 1 ? 0 : 2, left, st, open);
    for (let d = 3; level >= 3 && d < left; d++) {
      const deeper = rate(b, top, me, d, left, st, rated.map(q => q[0]));
      if (!deeper) break;
      rated = deeper;
      if (rated[0][1] > 90000 || rated[0][1] < -90000) break;      // the end is settled: no need to look further
    }
    let best = -Infinity, pick = [];
    for (const [c, v] of rated) { if (v > best + 0.5) { best = v; pick = [c]; } else if (Math.abs(v - best) <= 0.5) pick.push(c); }
    return { c: pick[Math.floor(rng() * pick.length)] };
  },
};
