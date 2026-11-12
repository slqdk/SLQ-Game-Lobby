// Blackjack against the house, for up to five at the table in the casino wing. Six decks in the shoe; the dealer
// stands on every 17; a blackjack pays 3 to 2; one may double on the first two cards (also after a split) and split
// a pair once (split aces get one card each, and 21 on a split hand is not a blackjack). The dealer has one card
// open and one hidden, and looks at the hidden one when the open one is an ace or worth ten: with a blackjack the
// round ends at once, before anybody has doubled or split.
//
// The table is one object kept with the group. A round: 'bet' (stakes are placed) -> 'play' (each hand in turn)
// -> 'show' (the dealer has drawn, every hand has its result) -> 'bet' again. The lobby moves the chips and keeps
// the clock; this file only knows the cards. Cards are 0-51 as in poker: rank = c % 13 (0 is a two, 8 a ten,
// 9-11 jack, queen and king, 12 an ace), suit = floor(c / 13).
export class BlackjackError extends Error {}
const fail = msg => { throw new BlackjackError(msg); };

export const BETS = [10, 20, 50, 100, 200], SEATS = 5, DECKS = 6, CUT = 78;
export const T_BET = 15, T_TURN = 25, T_SHOW = 4;            // seconds: to place stakes once the first is down, per decision, to look at the result
// How long the dealer takes to turn the hidden card and draw, in ms. The screen shows it card by card; what the round
// gave is shown when that is over, and the time to look at the result is counted from then.
export const dealerMs = cards => Math.min(3500, (Math.max(2, cards) - 1) * 450 + 400);

const pip = c => { const r = c % 13; return r === 12 ? 11 : r >= 8 ? 10 : r + 2; };
// What a hand counts: { t: the best total, soft: an ace still counts eleven }.
export function total(cards) {
  let t = 0, aces = 0;
  for (const c of cards) { const v = pip(c); t += v; if (v === 11) aces++; }
  while (t > 21 && aces) { t -= 10; aces--; }
  return { t, soft: aces > 0 };
}
const natural = h => h.cards.length === 2 && !h.split && total(h.cards).t === 21;

export const newTable = () => ({ phase: 'bet', seats: new Array(SEATS).fill(null), dealer: [], hidden: false, shoe: [], turn: -1, round: 0, at: 0, paid: false });
const seated = s => s.seats.filter(q => q && !q.gone);
// Everybody at the table has put a stake down: the cards can be dealt without waiting for the clock.
export const ready = s => s.phase === 'bet' && seated(s).length > 0 && seated(s).every(q => q.bet > 0);
export const anyBet = s => s.seats.some(q => q && q.bet > 0);

function draw(s, rng) {
  if (!s.shoe.length) reshuffle(s, rng);
  return s.shoe.pop();
}
function reshuffle(s, rng) {
  const cards = [];
  for (let d = 0; d < DECKS; d++) for (let c = 0; c < 52; c++) cards.push(c);
  for (let i = cards.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [cards[i], cards[j]] = [cards[j], cards[i]]; }
  s.shoe = cards;
}

export function sit(s, i, u, n) {
  if (!Number.isInteger(i) || i < 0 || i >= SEATS) fail('Den plads findes ikke.');
  if (s.seats.some(q => q && q.u === u && !q.gone)) fail('Du sidder allerede ved bordet.');
  if (s.seats[i]) fail('Den plads er optaget.');
  s.seats[i] = { u, n, bet: 0, last: 0, hands: [], cur: 0, net: 0, gone: false };
}
// Somebody leaves the table. While stakes are being placed, the stake comes back (returned). In the middle of a
// round the hands stay and are played out by themselves (they stand); the seat is freed when the round is over.
export function leave(s, i, rng) {
  const q = s.seats[i];
  if (!q) return 0;
  if (s.phase === 'bet' || !q.hands.length) { s.seats[i] = null; return s.phase === 'bet' ? q.bet : 0; }
  q.gone = true;
  if (s.phase === 'play') { for (const h of q.hands) h.done = true; if (s.turn === i) next(s, rng); }
  return 0;
}
// A stake for the coming round (0 takes it back). Returns how many chips that costs now (less than nothing: back).
export function bet(s, i, amount) {
  const q = s.seats[i];
  if (!q || q.gone) fail('Sæt dig ved bordet først.');
  if (s.phase !== 'bet') fail('Runden er i gang. Vent til den næste.');
  if (amount !== 0 && !BETS.includes(amount)) fail('Den indsats tager bordet ikke.');
  const d = amount - q.bet;
  q.bet = amount;
  return d;
}

// The cards are dealt: two to every stake, two to the dealer (one hidden).
export function deal(s, rng) {
  if (s.phase !== 'bet' || !anyBet(s)) return;
  if (s.shoe.length < CUT) reshuffle(s, rng);
  s.round++; s.paid = false;
  for (const q of s.seats) {
    if (!q) continue;
    q.hands = q.bet > 0 ? [{ cards: [draw(s, rng), draw(s, rng)], bet: q.bet, done: false, dbl: false, split: false, res: '', pay: 0 }] : [];
    q.cur = 0; if (q.bet) q.last = q.bet;
    for (const h of q.hands) if (natural(h)) h.done = true;
  }
  s.dealer = [draw(s, rng), draw(s, rng)]; s.hidden = true; s.phase = 'play'; s.turn = -1;
  if (pip(s.dealer[0]) >= 10 && total(s.dealer).t === 21) return settle(s);          // the dealer looked: blackjack
  next(s, rng);
}
// Whose hand is next; when nobody is left, the dealer draws and the round is settled.
function next(s, rng) {
  for (let i = Math.max(0, s.turn); i < SEATS; i++) {
    const q = s.seats[i];
    if (!q) continue;
    const k = q.hands.findIndex(h => !h.done);
    if (k >= 0) { s.turn = i; q.cur = k; return; }
  }
  s.turn = -1;
  const live = s.seats.some(q => q && q.hands.some(h => total(h.cards).t <= 21 && !natural(h)));
  if (live) while (total(s.dealer).t < 17) s.dealer.push(draw(s, rng));               // stands on every 17
  settle(s);
}
function settle(s) {
  const d = total(s.dealer).t, dn = s.dealer.length === 2 && d === 21;
  s.hidden = false; s.phase = 'show'; s.turn = -1;
  for (const q of s.seats) {
    if (!q) continue;
    let back = 0, staked = 0;
    for (const h of q.hands) {
      const p = total(h.cards).t;
      h.done = true;
      if (natural(h)) { h.res = dn ? 'push' : 'bj'; h.pay = dn ? h.bet : h.bet * 2.5; }
      else if (p > 21) { h.res = 'bust'; h.pay = 0; }
      else if (dn) { h.res = 'lose'; h.pay = 0; }
      else if (d > 21 || p > d) { h.res = 'win'; h.pay = h.bet * 2; }
      else if (p === d) { h.res = 'push'; h.pay = h.bet; }
      else { h.res = 'lose'; h.pay = 0; }
      back += h.pay; staked += h.bet;
    }
    q.net += back - staked; q.back = back; q.staked = staked;
  }
}

// What a move costs in further chips (doubling and splitting put the stake down once more).
export function cost(s, i, a) {
  const q = s.seats[i], h = q && q.hands[q.cur];
  return h && (a === 'double' || a === 'split') ? h.bet : 0;
}
// What the player whose turn it is may do with the hand in front of them.
export function options(s, i) {
  const q = s.seats[i], h = q && q.hands[q.cur];
  if (s.phase !== 'play' || s.turn !== i || !h || h.done) return [];
  const two = h.cards.length === 2, out = ['hit', 'stand'];
  if (two) out.push('double');
  if (two && q.hands.length === 1 && pip(h.cards[0]) === pip(h.cards[1])) out.push('split');
  return out;
}
export function act(s, i, a, rng) {
  if (s.phase !== 'play' || s.turn !== i) fail('Det er ikke din tur.');
  if (!options(s, i).includes(a)) fail('Det kan du ikke med den hånd.');
  const q = s.seats[i], h = q.hands[q.cur];
  if (a === 'stand') h.done = true;
  else if (a === 'hit') { h.cards.push(draw(s, rng)); if (total(h.cards).t >= 21) h.done = true; }
  else if (a === 'double') { h.bet *= 2; h.dbl = true; h.cards.push(draw(s, rng)); h.done = true; }
  else {
    const aces = pip(h.cards[0]) === 11, mk = c => ({ cards: [c, draw(s, rng)], bet: h.bet, done: aces, dbl: false, split: true, res: '', pay: 0 });
    q.hands = [mk(h.cards[0]), mk(h.cards[1])];
    for (const x of q.hands) if (total(x.cards).t === 21) x.done = true;
    q.cur = 0;
  }
  if (q.hands[q.cur].done) next(s, rng);
}
// The clock ran out: stakes are down -> deal; somebody thinks too long -> their hand stands; the result has been
// looked at -> clear the table for the next round (those who left are gone, the stakes are off).
export function timeout(s, rng) {
  if (s.phase === 'bet') return deal(s, rng);
  if (s.phase === 'play') { const q = s.seats[s.turn]; if (q) { q.hands[q.cur].done = true; next(s, rng); } return; }
  for (let i = 0; i < SEATS; i++) {
    const q = s.seats[i];
    if (!q) continue;
    if (q.gone) { s.seats[i] = null; continue; }
    q.hands = []; q.bet = 0; q.cur = 0; q.back = 0; q.staked = 0;
  }
  s.dealer = []; s.hidden = false; s.phase = 'bet'; s.turn = -1; s.paid = false;
}

// What everybody may see: not the dealer's hidden card, and not the shoe.
export const view = s => ({ ...s, shoe: s.shoe.length, dealer: s.hidden ? [s.dealer[0], -1] : s.dealer });
