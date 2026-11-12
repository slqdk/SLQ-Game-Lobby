// Poker: Texas Hold'em without a limit, played as a small tournament. Everybody starts with the same number of
// poker chips, the blinds rise every few hands, and whoever has all the chips at the end wins (and takes the
// buy-ins, which the table in the lobby holds). Two to six players.
//
// A card is a number 0-51: rank = card % 13 (0 is the two, 12 the ace), suit = floor(card / 13).
// What a player may do on their turn: { fold }, { call } (which is a check when there is nothing to call) or
// { raise: n }, where n is what their bet of this betting round is raised TO. { next } deals the next hand.
import { GameError } from './base.js';

export const START = 1000, HANDS_PER_LEVEL = 8, THINK = 40, SHOW = 7;
export const BLINDS = [[5, 10], [10, 20], [15, 30], [25, 50], [40, 80], [60, 120], [100, 200], [150, 300], [200, 400], [300, 600], [500, 1000], [1000, 2000]];
export const HAND_NAMES = ['Højt kort', 'Et par', 'To par', 'Tre ens', 'Straight', 'Flush', 'Fuldt hus', 'Fire ens', 'Straight flush'];
export const RANK_NAMES = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const P5 = 13 ** 5;

// The best five of up to seven cards as one number: the higher, the better hand.
export function handValue(cards) {
  const cnt = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], suits = [0, 0, 0, 0], bySuit = [0, 0, 0, 0];
  let mask = 0;
  for (let i = 0; i < cards.length; i++) { const r = cards[i] % 13, s = (cards[i] / 13) | 0; cnt[r]++; suits[s]++; bySuit[s] |= 1 << r; mask |= 1 << r; }
  const straight = m => { for (let hi = 12; hi >= 4; hi--) if (((m >> (hi - 4)) & 31) === 31) return hi; return (m & 0x100F) === 0x100F ? 3 : -1; };     // ace to five counts, with the five on top
  const enc = (cat, a = 0, b = 0, c = 0, d = 0, e = 0) => ((((cat * 13 + a) * 13 + b) * 13 + c) * 13 + d) * 13 + e;
  const top = (m, n) => { const out = []; for (let r = 12; r >= 0 && out.length < n; r--) if (m & (1 << r)) out.push(r); return out; };
  let fs = -1;
  for (let s = 0; s < 4; s++) if (suits[s] >= 5) fs = s;
  if (fs >= 0) { const st = straight(bySuit[fs]); if (st >= 0) return enc(8, st); }
  let four = -1; const three = [], pairs = [];
  for (let r = 12; r >= 0; r--) { if (cnt[r] === 4) four = r; else if (cnt[r] === 3) three.push(r); else if (cnt[r] === 2) pairs.push(r); }
  if (four >= 0) return enc(7, four, top(mask & ~(1 << four), 1)[0]);
  if (three.length && (three.length > 1 || pairs.length)) return enc(6, three[0], three.length > 1 ? Math.max(three[1], pairs.length ? pairs[0] : -1) : pairs[0]);
  if (fs >= 0) { const t = top(bySuit[fs], 5); return enc(5, t[0], t[1], t[2], t[3], t[4]); }
  const st = straight(mask);
  if (st >= 0) return enc(4, st);
  if (three.length) { const k = top(mask & ~(1 << three[0]), 2); return enc(3, three[0], k[0], k[1]); }
  if (pairs.length >= 2) return enc(2, pairs[0], pairs[1], top(mask & ~(1 << pairs[0]) & ~(1 << pairs[1]), 1)[0]);
  if (pairs.length) { const k = top(mask & ~(1 << pairs[0]), 3); return enc(1, pairs[0], k[0], k[1], k[2]); }
  const k = top(mask, 5);
  return enc(0, k[0], k[1], k[2], k[3], k[4]);
}
// What a hand is called, from its value.
export function handName(v) {
  const cat = Math.floor(v / P5), a = Math.floor(v / 13 ** 4) % 13;
  return cat === 8 && a === 12 ? 'Royal straight flush' : HAND_NAMES[cat];
}

const seats = s => s.stacks.map((_, i) => i);
const nextIn = (s, from, ok) => { for (let k = 1; k <= s.n; k++) { const i = (from + k) % s.n; if (ok(i)) return i; } return -1; };
const alive = (s, i) => !s.out[i];                             // still in the tournament
const live = (s, i) => !s.out[i] && !s.folded[i];              // still in this hand
const canAct = (s, i) => live(s, i) && !s.allin[i];            // and has chips left to bet with
const sum = a => a.reduce((x, y) => x + y, 0);

function put(s, i, amount) {
  const a = Math.min(amount, s.stacks[i]);
  s.stacks[i] -= a; s.bet[i] += a; s.total[i] += a;
  if (s.stacks[i] === 0) s.allin[i] = true;
  return a;
}

function deal(s, rng) {
  const lvl = BLINDS[Math.min(BLINDS.length - 1, Math.floor(s.hands / HANDS_PER_LEVEL))];
  s.sb = lvl[0]; s.bb = lvl[1]; s.hands++;
  const d = [...Array(52).keys()];
  for (let i = 51; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; }
  s.deck = d; s.board = []; s.street = 0; s.phase = 'bet'; s.last = null;
  s.bet = s.stacks.map(() => 0); s.total = s.stacks.map(() => 0); s.folded = s.out.slice(); s.allin = s.stacks.map(() => false);
  s.acted = s.stacks.map(() => false); s.said = s.stacks.map(() => '');
  s.hole = s.out.map(o => o ? null : [s.deck.pop(), s.deck.pop()]);
  // two players: the dealer has the small blind and speaks first before the flop
  const two = seats(s).filter(i => alive(s, i)).length === 2;
  const sb = two ? s.dealer : nextIn(s, s.dealer, i => alive(s, i)), bb = nextIn(s, sb, i => alive(s, i));
  put(s, sb, s.sb); put(s, bb, s.bb);
  s.said[sb] = 'lille blind'; s.said[bb] = 'stor blind';
  s.toCall = s.bb; s.minRaise = s.bb; s.turn = bb;
  advance(s, rng);
}

// After something happened: who is next, or the next cards, or the end of the hand.
function advance(s, rng) {
  if (seats(s).filter(i => live(s, i)).length === 1) return award(s, null);
  const actors = seats(s).filter(i => canAct(s, i));
  const must = i => !s.acted[i] || s.bet[i] < s.toCall;
  // somebody alone with chips has nobody to bet against: they only act when they still owe a call
  const next = actors.length === 1 ? (s.bet[actors[0]] < s.toCall ? actors[0] : -1) : nextIn(s, s.turn, i => canAct(s, i) && must(i));
  if (next >= 0) { s.turn = next; return; }
  for (;;) {                                           // the betting round is over: the next cards
    if (s.street === 3) { const val = {}; for (const i of seats(s)) if (live(s, i)) val[i] = handValue(s.hole[i].concat(s.board)); return award(s, val); }
    s.street++;
    for (let k = s.street === 1 ? 3 : 1; k > 0; k--) s.board.push(s.deck.pop());
    s.bet = s.stacks.map(() => 0); s.toCall = 0; s.minRaise = s.bb; s.acted = s.stacks.map(() => false);
    s.said = s.said.map((t, i) => s.folded[i] || s.allin[i] ? t : '');
    if (seats(s).filter(i => canAct(s, i)).length >= 2) { s.turn = nextIn(s, s.dealer, i => canAct(s, i)); return; }
  }
}

// The hand is over: the pots go to the best hands (val: every remaining player's hand value, or null when
// everybody else folded), busted players are out, and the tournament ends when one is left.
function award(s, val) {
  const all = seats(s), won = all.map(() => 0), pots = [];
  const levels = [...new Set(all.filter(i => live(s, i)).map(i => s.total[i]))].sort((a, b) => a - b);
  let prev = 0;
  for (const lv of levels) {                           // one pot per level somebody is all in at
    let amount = 0;
    for (const i of all) amount += Math.max(0, Math.min(s.total[i], lv) - prev);
    const elig = all.filter(i => live(s, i) && s.total[i] >= lv);
    let best = -1, win = [];
    if (!val) win = elig;
    else for (const i of elig) { if (val[i] > best) { best = val[i]; win = [i]; } else if (val[i] === best) win.push(i); }
    const share = Math.floor(amount / win.length);
    let rest = amount - share * win.length;
    // chips that cannot be split go to the winners sitting first after the dealer
    for (const i of win.slice().sort((a, b) => (a - s.dealer - 1 + s.n) % s.n - (b - s.dealer - 1 + s.n) % s.n)) { won[i] += share + (rest > 0 ? 1 : 0); if (rest > 0) rest--; }
    if (amount > 0) pots.push({ amount, win });
    prev = lv;
  }
  // what somebody put in beyond what anybody left in the hand could match comes back (a blind against a smaller
  // all-in); from somebody who has left the table it goes to the winner instead
  for (const i of all) if (s.total[i] > prev) won[s.out[i] ? pots[pots.length - 1].win[0] : i] += s.total[i] - prev;
  const bust = [];
  for (const i of all) { s.stacks[i] += won[i]; if (!s.out[i] && s.stacks[i] === 0) { s.out[i] = true; bust.push(i); } }
  const shown = {}, vals = {};
  if (val) for (const i of all) if (live(s, i) || bust.includes(i) && !s.folded[i]) { shown[i] = s.hole[i]; vals[i] = val[i]; }
  s.last = { board: s.board.slice(), shown, vals, won, net: all.map(i => won[i] - s.total[i]), pots, bust };
  s.bet = all.map(() => 0); s.turn = -1;
  const left = all.filter(i => alive(s, i));
  if (left.length === 1) { s.phase = 'over'; s.winner = left[0]; } else s.phase = 'show';
}

// The chance (0-1) that a seat's hand wins at the showdown against `opp` unknown hands, by dealing the rest many times.
export function equity(s, seat, opp, n, rng) {
  const known = new Set(s.hole[seat].concat(s.board)), rest = [];
  for (let c = 0; c < 52; c++) if (!known.has(c)) rest.push(c);
  const missing = 5 - s.board.length, need = missing + 2 * opp;
  let win = 0;
  for (let k = 0; k < n; k++) {
    for (let i = 0; i < need; i++) { const j = i + Math.floor(rng() * (rest.length - i)), t = rest[i]; rest[i] = rest[j]; rest[j] = t; }
    const board = s.board.concat(rest.slice(0, missing)), mine = handValue(s.hole[seat].concat(board));
    let ties = 0, lost = false;
    for (let o = 0; o < opp && !lost; o++) { const v = handValue([rest[missing + o * 2], rest[missing + o * 2 + 1]].concat(board)); if (v > mine) lost = true; else if (v === mine) ties++; }
    if (!lost) win += 1 / (ties + 1);
  }
  return win / n;
}

export default {
  id: 'poker', name: 'Poker', min: 2, max: 6, station: 'cards',
  botNames: ['', 'Robot (let)', 'Robot (mellem)', 'Robot (svær)'], botList: ['Bolt', 'Gnist', 'Møtrik', 'Tandhjul', 'Fjeder'],

  setup(n, opts, rng) {
    const s = { n, stacks: new Array(n).fill(START), out: new Array(n).fill(false), away: new Array(n).fill(0), dealer: (opts.first || 0) % n, hands: 0, winner: -1 };
    deal(s, rng);
    return s;
  },

  act(s, seat, a, rng) {
    if (a && a.next) {
      if (s.phase !== 'show') throw new GameError('Hånden er ikke slut endnu.');
      s.dealer = nextIn(s, s.dealer, i => alive(s, i));
      return deal(s, rng);
    }
    if (s.phase !== 'bet' || seat !== s.turn) throw new GameError('Det er ikke din tur.');
    if (!a || typeof a !== 'object') throw new GameError('Ukendt træk.');
    const need = s.toCall - s.bet[seat], max = s.bet[seat] + s.stacks[seat];
    if (a.fold) { s.folded[seat] = true; s.said[seat] = 'fold'; }
    else if (a.call || (Number.isInteger(a.raise) && a.raise <= s.toCall && a.raise === max)) {
      if (need > 0) { put(s, seat, need); s.said[seat] = s.allin[seat] ? 'all-in' : 'call'; } else s.said[seat] = 'check';
    } else if (Number.isInteger(a.raise)) {
      // somebody who has already spoken and now only faces an all-in smaller than a real raise may not raise again
      if (s.acted[seat]) throw new GameError('Her kan du kun calle eller folde.');
      const min = Math.min(max, s.toCall + s.minRaise);
      if (a.raise < min || a.raise > max) throw new GameError(min === max ? 'Du kan kun gå all-in (' + max + ').' : 'Indsatsen skal være mellem ' + min + ' og ' + max + '.');
      const size = a.raise - s.toCall, opened = s.toCall === 0;
      put(s, seat, a.raise - s.bet[seat]);
      if (size >= s.minRaise) { s.minRaise = size; for (let j = 0; j < s.n; j++) if (j !== seat) s.acted[j] = false; }        // a real raise: everybody speaks again
      s.toCall = a.raise;
      s.said[seat] = s.allin[seat] ? 'all-in' : opened ? 'bet ' + a.raise : 'raise til ' + a.raise;
    } else throw new GameError('Ukendt træk.');
    s.acted[seat] = true;
    s.away[seat] = a.auto ? s.away[seat] + 1 : 0;
    advance(s, rng);
  },

  // Somebody leaves the tournament: their hand is folded and their chips are out of play.
  drop(s, seat, rng) {
    if (s.out[seat]) return;
    const inHand = s.phase === 'bet' && !s.folded[seat];
    s.out[seat] = true; s.folded[seat] = true; s.stacks[seat] = 0; s.said[seat] = 'gået';
    const left = seats(s).filter(i => alive(s, i));
    if (s.phase === 'bet') {
      if (s.turn === seat || seats(s).filter(i => live(s, i)).length === 1 || inHand && !seats(s).some(i => canAct(s, i) && (!s.acted[i] || s.bet[i] < s.toCall))) advance(s, rng);
    } else if (left.length === 1) { s.phase = 'over'; s.winner = left[0]; }
  },

  turn: s => s.phase === 'bet' ? s.turn : -1,
  result: s => s.phase === 'over' ? { win: [s.winner], draw: false } : null,

  // What the lobby does when nobody acts: fold (or check) for a player who does not answer, and deal the next hand.
  clock(s) {
    if (s.phase === 'show') return { secs: SHOW, seat: -1, a: { next: true } };
    if (s.phase !== 'bet') return null;
    const i = s.turn;
    return { secs: s.away[i] >= 2 ? 4 : THINK, seat: i, a: s.toCall > s.bet[i] ? { fold: true, auto: true } : { call: true, auto: true } };
  },

  // Nobody sees the deck or the others' cards; folded cards are gone.
  view(s, seat) {
    const v = { ...s, deck: undefined, pot: sum(s.total || []) };
    v.hole = s.hole.map((h, i) => !h || s.out[i] && !(s.last && s.last.shown[i]) ? null : i === seat ? h : s.folded[i] ? null : [-1, -1]);
    if (seat >= 0 && s.hole[seat] && !s.folded[seat] && s.board.length) v.mine = handName(handValue(s.hole[seat].concat(s.board)));
    if (s.phase === 'bet' && seat === s.turn) {
      const need = s.toCall - s.bet[seat], max = s.bet[seat] + s.stacks[seat], may = !s.acted[seat] && max > s.toCall;
      v.can = { call: Math.min(Math.max(0, need), s.stacks[seat]), min: may ? Math.min(max, s.toCall + s.minRaise) : 0, max: may ? max : 0 };
    }
    return v;
  },

  // The robot: it works out its chance by dealing the rest of the cards a few hundred times, and compares it with
  // what a call costs. The easy one misjudges its hand and calls too much; the hard one raises more and bluffs a little.
  bot(s, seat, level, rng) {
    const need = s.toCall - s.bet[seat], stack = s.stacks[seat], pot = sum(s.total), max = s.bet[seat] + stack, may = !s.acted[seat] && max > s.toCall;
    const opp = seats(s).filter(i => i !== seat && live(s, i)).length;
    const e = Math.max(0, Math.min(1, equity(s, seat, Math.min(opp, 3), [0, 120, 220, 360][level], rng) + (rng() * 2 - 1) * [0, 0.10, 0.05, 0.02][level]));
    const fair = 1 / (Math.min(opp, 3) + 1), odds = need > 0 ? need / (pot + need) : 0;
    const to = frac => Math.max(Math.min(max, s.toCall + s.minRaise), Math.min(max, Math.round((s.toCall + Math.max(s.minRaise, pot * frac)) / s.sb) * s.sb));
    if (may) {
      if (e > fair + [0, 0.30, 0.22, 0.18][level] && rng() < [0, 0.5, 0.75, 0.85][level]) return { raise: to(e > 0.8 ? 1 : 0.6) };
      if (level >= 2 && stack <= s.bb * 8 && e > fair + 0.1) return { raise: max };                 // few chips left: all in with something decent
      if (need <= 0 && e > fair + 0.08 && rng() < [0, 0.2, 0.4, 0.5][level]) return { raise: to(0.5) };
      if (need <= 0 && level === 3 && rng() < 0.1) return { raise: to(0.6) };                       // a bluff now and then
    }
    if (need <= 0) return { call: true };
    if (e > odds + [0, -0.06, 0, 0.03][level] || (need <= s.bb && e > fair - 0.12)) return { call: true };
    return { fold: true };
  },
};
