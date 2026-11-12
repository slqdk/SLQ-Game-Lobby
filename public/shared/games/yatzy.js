// Yatzy with five dice, by the rules most people in Denmark play: fifteen fields, three throws a turn, 50 extra
// for 63 or more in the upper half. Two to four players; everybody fills their whole sheet, the highest sum wins.
// Moves: { roll: [hold0..hold4] } (which dice to keep; the first throw of a turn throws all five) and
// { score: field } (write the dice into a field; a field that does not fit gets a zero).
import { GameError } from './base.js';

export const FIELDS = ['ones', 'twos', 'threes', 'fours', 'fives', 'sixes', 'pair', 'twopair', 'three', 'four', 'small', 'large', 'house', 'chance', 'yatzy'];
export const FIELD_NAMES = {
  ones: 'Enere', twos: 'Toere', threes: 'Treere', fours: 'Firere', fives: 'Femmere', sixes: 'Seksere', pair: 'Et par', twopair: 'To par', three: 'Tre ens', four: 'Fire ens',
  small: 'Lille straight', large: 'Stor straight', house: 'Hus', chance: 'Chance', yatzy: 'Yatzy',
};
export const BONUS = 50, BONUS_AT = 63;

// What five dice are worth in a field.
export function scoreOf(field, dice) {
  const c = [0, 0, 0, 0, 0, 0, 0];
  let sum = 0;
  for (const d of dice) { c[d]++; sum += d; }
  const i = FIELDS.indexOf(field);
  if (i < 6) return c[i + 1] * (i + 1);
  const of = n => { for (let v = 6; v >= 1; v--) if (c[v] >= n) return v; return 0; };
  switch (field) {
    case 'pair': return of(2) * 2;
    case 'twopair': { const p = []; for (let v = 6; v >= 1; v--) if (c[v] >= 2) p.push(v); return p.length >= 2 ? (p[0] + p[1]) * 2 : 0; }
    case 'three': return of(3) * 3;
    case 'four': return of(4) * 4;
    case 'small': return c[1] && c[2] && c[3] && c[4] && c[5] ? 15 : 0;
    case 'large': return c[2] && c[3] && c[4] && c[5] && c[6] ? 20 : 0;
    case 'house': return c.includes(3) && c.includes(2) ? sum : 0;
    case 'chance': return sum;
    default: return c.includes(5) ? 50 : 0;
  }
}
// The sums of one sheet.
export function sums(card) {
  let upper = 0, lower = 0;
  FIELDS.forEach((f, i) => { if (f in card) { if (i < 6) upper += card[f]; else lower += card[f]; } });
  const bonus = upper >= BONUS_AT ? BONUS : 0;
  return { upper, bonus, total: upper + bonus + lower };
}
const full = card => FIELDS.every(f => f in card);

function next(s) {
  s.dice = [0, 0, 0, 0, 0]; s.rolls = 0; s.held = [false, false, false, false, false];
  for (let k = 1; k <= s.n; k++) { const i = (s.turn + k) % s.n; if (!s.gone[i] && !full(s.cards[i])) { s.turn = i; return; } }
  s.over = true;
}

// What a field is worth on average when it is filled sensibly: what the robot measures a throw against.
const PAR = { ones: 2.1, twos: 4.2, threes: 6.3, fours: 8.4, fives: 10.5, sixes: 12.6, pair: 9, twopair: 13, three: 11, four: 6, small: 5, large: 6, house: 10, chance: 22, yatzy: 4 };
// How good it is to write these dice into this field now (points beyond the average, with an eye on the bonus).
function worth(card, f, dice) {
  const pts = scoreOf(f, dice), i = FIELDS.indexOf(f);
  let w = pts - PAR[f];
  if (i < 6) { const want = (i + 1) * 3; w += (pts - want) * 0.7; }               // three of each kind is what the bonus needs
  if (f === 'chance') w -= 3;                                                     // keep the chance for a bad turn
  if (f === 'yatzy' && pts) w += 20;
  return w;
}
const bestField = (card, dice) => { let best = null, bw = -1e9; for (const f of FIELDS) if (!(f in card)) { const w = worth(card, f, dice); if (w > bw) { bw = w; best = f; } } return [best, bw]; };

export default {
  id: 'yatzy', name: 'Yatzy', min: 2, max: 4, station: 'dice',
  botNames: ['', 'Robot (let)', 'Robot (mellem)', 'Robot (svær)'], botList: ['Bolt', 'Gnist', 'Møtrik'],

  setup(n, opts) {
    return { n, turn: (opts.first || 0) % n, dice: [0, 0, 0, 0, 0], rolls: 0, held: [false, false, false, false, false], cards: Array.from({ length: n }, () => ({})), gone: new Array(n).fill(false), over: false, last: null };
  },

  act(s, seat, a, rng) {
    if (s.over || seat !== s.turn) throw new GameError('Det er ikke din tur.');
    if (a && a.roll) {
      if (s.rolls >= 3) throw new GameError('Du har slået tre gange. Vælg et felt.');
      const keep = [0, 1, 2, 3, 4].map(i => s.rolls > 0 && Array.isArray(a.roll) && !!a.roll[i]);
      if (keep.every(Boolean)) throw new GameError('Vælg mindst én terning at slå om, eller skriv slaget på blokken.');
      for (let i = 0; i < 5; i++) { s.held[i] = keep[i]; if (!keep[i]) s.dice[i] = 1 + Math.floor(rng() * 6); }
      s.rolls++;
    } else if (a && typeof a.score === 'string') {
      if (!FIELDS.includes(a.score)) throw new GameError('Det felt findes ikke.');
      if (!s.rolls) throw new GameError('Slå først.');
      if (a.score in s.cards[seat]) throw new GameError('Det felt er brugt.');
      const pts = scoreOf(a.score, s.dice);
      s.cards[seat][a.score] = pts;
      s.last = { seat, field: a.score, pts, dice: s.dice.slice() };
      next(s);
    } else throw new GameError('Ukendt træk.');
  },

  // Somebody leaves: the others finish their sheets. Alone at the table, the last one has won.
  drop(s, seat) {
    if (s.gone[seat]) return;
    s.gone[seat] = true;
    const left = s.gone.filter(g => !g).length;
    if (left <= 1) s.over = true;
    else if (s.turn === seat) next(s);
  },

  turn: s => s.over ? -1 : s.turn,
  result(s) {
    if (!s.over) return null;
    const here = s.cards.map((_, i) => i).filter(i => !s.gone[i]), top = Math.max(...here.map(i => sums(s.cards[i]).total));
    const win = here.filter(i => sums(s.cards[i]).total === top);
    return win.length === s.n && s.n > 1 ? { win: [], draw: true } : { win, draw: false };
  },
  view: s => s,

  // The robot: after a throw it tries every way of keeping dice, throws the rest a number of times in its head,
  // and keeps what gives the best field on average. The easy one tries fewer times and looks less far.
  bot(s, seat, level, rng) {
    const card = s.cards[seat];
    if (!s.rolls) return { roll: [] };
    const [field, now] = bestField(card, s.dice);
    if (s.rolls >= 3) return { score: field };
    const tries = [0, 10, 28, 90][level];
    let bestMask = -1, best = now + (level === 1 ? 2 : 0.5);                    // stopping early must be clearly worse than going on
    for (let mask = 0; mask < 31; mask++) {                                    // 31 = keep all five: that is "stop"
      let total = 0;
      for (let k = 0; k < tries; k++) {
        const d = s.dice.slice();
        for (let i = 0; i < 5; i++) if (!(mask & (1 << i))) d[i] = 1 + Math.floor(rng() * 6);
        let w = bestField(card, d)[1];
        if (s.rolls === 1 && level > 2) {                                        // one more throw after this one: keep the best again, simply
          const c = [0, 0, 0, 0, 0, 0, 0]; for (const x of d) c[x]++;
          let v = 1; for (let x = 2; x <= 6; x++) if (c[x] > c[v] || (c[x] === c[v] && x > v)) v = x;
          const d2 = d.map(x => x === v ? x : 1 + Math.floor(rng() * 6));
          w = Math.max(w, bestField(card, d2)[1]);
        }
        total += w;
      }
      const avg = total / tries;
      if (avg > best) { best = avg; bestMask = mask; }
    }
    if (bestMask < 0) return { score: field };
    return { roll: [0, 1, 2, 3, 4].map(i => !!(bestMask & (1 << i))) };
  },
};
