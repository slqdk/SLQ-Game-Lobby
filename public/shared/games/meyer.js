// Meyer: the dice game where one may lie. Two dice under a cup go round the table. Whoever has the cup throws,
// looks, and says what lies under it: the same as the one before said, or higher. It need not be true. The next
// one believes it and throws on, or lifts the cup: was it a lie, the liar loses a life, else the one who lifted.
// One can also throw without looking and pass it on as "that or more". Everybody has six lives; a round where
// Meyer was said costs two. The last one alive wins. Two to six players.
//
// What a throw is worth, lowest first: 32, 41, 42, 43, 51 ... 65, then the pairs 11 to 66, then Lille Meyer (31)
// and Meyer (21). A throw is kept as its place in that row (0-20).
// Moves: { roll } (throw and look), { say: n } (after a throw), { blind } (throw unseen, "that or more"),
// { lift }, and { next } (after a lift: on to the next round).
import { GameError } from './base.js';

export const LIVES = 6, THINK = 40, SHOW = 6, MEYER = 20, LITTLE = 19;
const PLAIN = [32, 41, 42, 43, 51, 52, 53, 54, 61, 62, 63, 64, 65];
export const rankOf = (a, b) => { const hi = Math.max(a, b), lo = Math.min(a, b), k = hi * 10 + lo; return k === 21 ? MEYER : k === 31 ? LITTLE : hi === lo ? 12 + hi : PLAIN.indexOf(k); };
export const rankName = r => r === MEYER ? 'Meyer' : r === LITTLE ? 'Lille Meyer' : r >= 13 ? 'Par ' + (r - 12) : String(PLAIN[r]);
// Of the 36 ways two dice can fall: how many are worth at least r.
const WAYS = r => { let n = 0; for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) if (rankOf(a, b) >= r) n++; return n; };
export const chance = r => WAYS(r) / 36;

const throwDice = rng => [1 + Math.floor(rng() * 6), 1 + Math.floor(rng() * 6)];
const nextAlive = (s, from) => { for (let k = 1; k <= s.n; k++) { const i = (from + k) % s.n; if (!s.out[i]) return i; } return -1; };

export default {
  id: 'meyer', name: 'Meyer', min: 2, max: 6, station: 'dice',
  botNames: ['', 'Robot (let)', 'Robot (mellem)', 'Robot (svær)'], botList: ['Bolt', 'Gnist', 'Møtrik', 'Tandhjul', 'Fjeder'],

  setup(n, opts) {
    return { n, lives: new Array(n).fill(LIVES), out: new Array(n).fill(false), away: new Array(n).fill(0), turn: (opts.first || 0) % n, phase: 'turn', prev: null, cup: null, mine: null, last: null, rounds: 0, winner: -1 };
  },

  act(s, seat, a, rng) {
    if (!a || typeof a !== 'object') throw new GameError('Ukendt træk.');
    if (a.next) {
      if (s.phase !== 'show') throw new GameError('Runden er ikke slut.');
      s.phase = 'turn'; s.prev = null; s.cup = null; s.mine = null; s.rounds++;
      s.turn = s.out[s.last.loser] ? nextAlive(s, s.last.loser) : s.last.loser;            // whoever lost begins the next round
      return;
    }
    if (seat !== s.turn || (s.phase !== 'turn' && s.phase !== 'say')) throw new GameError('Det er ikke din tur.');
    s.away[seat] = a.auto ? s.away[seat] + 1 : 0;
    if (s.phase === 'say') {
      if (!Number.isInteger(a.say) || a.say < 0 || a.say > MEYER) throw new GameError('Sig, hvad der ligger under bægeret.');
      if (s.prev && a.say < s.prev.said) throw new GameError('Du skal sige ' + rankName(s.prev.said) + ' eller højere.');
      s.prev = { seat, said: a.say, blind: false, need: s.prev ? s.prev.said : -1 }; s.cup = s.mine; s.mine = null; s.phase = 'turn'; s.turn = nextAlive(s, seat);
    } else if (a.roll) { s.mine = throwDice(rng); s.phase = 'say'; }
    else if (a.blind) {
      if (!s.prev) throw new GameError('Den første i en runde skal kigge og sige noget.');
      s.cup = throwDice(rng); s.prev = { seat, said: s.prev.said, blind: true, need: s.prev.said }; s.turn = nextAlive(s, seat);
    } else if (a.lift) {
      if (!s.prev) throw new GameError('Der er ikke noget at løfte endnu.');
      const real = rankOf(s.cup[0], s.cup[1]), lie = real < s.prev.said, loser = lie ? s.prev.seat : seat, lost = Math.min(s.lives[loser], s.prev.said === MEYER ? 2 : 1);
      s.lives[loser] -= lost;
      if (s.lives[loser] <= 0) s.out[loser] = true;
      s.last = { cup: s.cup, real, said: s.prev.said, by: s.prev.seat, blind: s.prev.blind, lifter: seat, lie, loser, lost };
      s.cup = null; s.prev = null;
      const left = s.out.map((o, i) => o ? -1 : i).filter(i => i >= 0);
      if (left.length === 1) { s.phase = 'over'; s.winner = left[0]; s.turn = -1; } else { s.phase = 'show'; s.turn = -1; }
    } else throw new GameError('Ukendt træk.');
  },

  // Somebody leaves: out of the game, and the cup starts afresh with the next one.
  drop(s, seat) {
    if (s.out[seat]) return;
    s.out[seat] = true; s.lives[seat] = 0;
    const left = s.out.map((o, i) => o ? -1 : i).filter(i => i >= 0);
    if (left.length === 1) { s.phase = 'over'; s.winner = left[0]; s.turn = -1; return; }
    if (s.phase === 'show') { if (s.last.loser === seat) s.last.loser = nextAlive(s, seat); return; }
    if (s.turn === seat || (s.prev && s.prev.seat === seat)) { const from = s.turn === seat ? seat : s.turn; s.prev = null; s.cup = null; s.mine = null; s.phase = 'turn'; s.turn = s.out[from] ? nextAlive(s, from) : from; }
  },

  turn: s => s.phase === 'turn' || s.phase === 'say' ? s.turn : -1,
  result: s => s.phase === 'over' ? { win: [s.winner], draw: false } : null,

  clock(s) {
    if (s.phase === 'show') return { secs: SHOW, seat: -1, a: { next: true } };
    if (s.phase === 'over') return null;
    const i = s.turn, secs = s.away[i] >= 2 ? 4 : THINK;
    // nobody home: say what is true (or the least that is allowed), pass the cup on unseen, or begin the round
    if (s.phase === 'say') return { secs, seat: i, a: { say: Math.max(rankOf(s.mine[0], s.mine[1]), s.prev ? s.prev.said : 0), auto: true } };
    return { secs, seat: i, a: s.prev ? { blind: true, auto: true } : { roll: true, auto: true } };
  },

  // Nobody sees what is under the cup; only the one who threw sees their own throw.
  view(s, seat) { return { ...s, cup: s.cup ? 1 : null, mine: s.mine && seat === s.turn ? s.mine : s.mine ? 1 : null }; },

  // The robot asks itself how likely the last claim is a lie: did the one before have to beat something hard (then
  // they probably threw too low and lied just above it), or is it a throw one simply gets now and then? Then it
  // weighs what lifting risks against what throwing on risks. The easy one lifts at random and lies clumsily.
  bot(s, seat, lvl, rng) {
    const level = lvl === 2 ? (rng() < 0.25 ? 1 : 3) : lvl;            // the middle one plays now like the easy one, now like the hard one
    const pv = s.prev, prev = pv ? pv.said : -1;
    if (s.phase === 'say') {
      const real = rankOf(s.mine[0], s.mine[1]);
      if (real >= prev) {                                             // true and good enough: say it, now and then a little more
        if (level >= 2 && real < 12 && rng() < 0.1) return { say: Math.min(MEYER - 2, real + 1 + Math.floor(rng() * 2)) };
        return { say: real };
      }
      // too low: a lie. The easy one says the least that will pass (which gives it away), the middle one a little
      // above, the hard one something that a real throw could well have been
      const top = prev >= LITTLE ? MEYER : MEYER - 2, least = Math.max(prev, 0);
      if (level === 3) for (let k = 0; k < 12; k++) { const r = rankOf(1 + Math.floor(rng() * 6), 1 + Math.floor(rng() * 6)); if (r >= least && r <= top) return { say: r }; }
      return { say: Math.min(top, least + (level === 1 ? 0 : Math.floor(rng() * 3))) };
    }
    if (!pv) return { roll: true };
    let lie;
    if (pv.blind) lie = 1 - chance(prev);                             // nobody has seen it: as likely as the dice make it
    else {
      const exact = (WAYS(prev) - WAYS(prev + 1)) / 36;               // they threw exactly that and said so
      const forced = pv.need >= 0 ? 1 - chance(pv.need) : 0;          // they threw too low and had to lie
      const here = forced * (prev - pv.need <= 2 ? 0.34 : 0.03) + 0.04;
      lie = here / (here + exact);
    }
    if (level === 1) return lie > 0.85 || rng() < 0.33 ? { lift: true } : { roll: true };       // the easy one mostly believes what it hears
    // what each choice risks: lifting loses when the claim was true; throwing loses when the throw is too low and
    // the lie is lifted (the higher the claim, the more often it is); an unseen throw is lifted when it is unlikely
    const safe = chance(prev), fuzz = (rng() - 0.5) * 0.04;
    const riskLift = 1 - lie, riskRoll = (1 - safe) * (0.5 + 0.45 * (1 - safe)), riskBlind = (1 - safe) * (safe > 0.5 ? 0.35 : 0.95);
    if (riskLift + fuzz < Math.min(riskRoll, riskBlind)) return { lift: true };
    return riskBlind < riskRoll && rng() < 0.5 ? { blind: true } : { roll: true };
  },
};
