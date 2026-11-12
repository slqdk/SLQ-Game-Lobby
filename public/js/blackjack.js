// The blackjack table on screen: the dealer at the top, the five seats along the rim, and below the table what one
// can do. renderBlackjack(v, ctx) returns the elements for the sheet. v is the table as the server shows it (see
// shared/blackjack.js; the dealer's hidden card is -1); ctx = { me, mem, chips(), clock, send, leave }.
import { h, bust } from './ui.js';
import { robotIcon } from './games/c4.js';
import { cardEl } from './games/poker.js';
import { BETS, SEATS, total, options, dealerMs } from '../shared/blackjack.js';

const num = n => String(n).replace(/\B(?=(\d{3})+$)/g, '.'), signed = n => (n > 0 ? '+' : '') + num(n);

// Which cards lay on the table at the last drawing, so that only the new ones are dealt with a flourish.
let seen = { round: -1, cards: {} };
export const resetBlackjack = () => { seen = { round: -1, cards: {} }; };

export function renderBlackjack(v, ctx) {
  const me = v.seats.findIndex(q => q && q.u === ctx.me && !q.gone), mine = me >= 0 ? v.seats[me] : null, out = [];
  const old = seen.round === v.round ? seen.cards : {}, now = {};
  // The cards of one hand. A card that was not there before is dealt; one that lay face down is turned over.
  const cards = (list, key, delay) => {
    const was = old[key] || [];
    now[key] = list.slice();
    return h('div', { class: 'bj-cards' + (list.length > 6 ? ' bj-n7' : list.length > 4 ? ' bj-n5' : '') }, list.map((c, i) => {
      const el = cardEl(c);
      if (i >= was.length || was[i] !== c) { el.classList.add(was[i] === -1 ? 'bj-flip' : 'bj-new'); el.style.animationDelay = delay(i, was.length).toFixed(2) + 's'; }
      return el;
    }));
  };

  // ---- the dealer ----
  const dWas = old.d || [], drew = v.dealer.some((c, i) => i >= dWas.length || dWas[i] !== c);
  const wait = v.phase === 'show' && drew ? dealerMs(v.dealer.length) / 1000 : 0;       // the dealer plays first, then the results show
  const step = v.dealer.length > 2 ? (dealerMs(v.dealer.length) - 400) / (v.dealer.length - 1) / 1000 : 0.45;
  const late = el => { if (wait) { el.classList.add('bj-late'); el.style.animationDelay = wait.toFixed(2) + 's'; } return el; };
  const dt = v.dealer.length ? total(v.hidden ? [v.dealer[0]] : v.dealer).t : 0;
  const dTot = !dt ? null : h('span', { class: 'bj-tot' + (!v.hidden && dt > 21 ? ' bust' : !v.hidden && dt === 21 ? ' top' : '') }, v.hidden ? dt + ' + ?' : dt > 21 ? 'Over 21' : dt === 21 && v.dealer.length === 2 ? 'Blackjack' : String(dt));
  const felt = h('div', { class: 'bj-felt' }, h('div', { class: 'bj-dealer' }, h('div', { class: 'bj-who' }, robotIcon(30), h('b', {}, 'Dealeren')),
    v.dealer.length ? cards(v.dealer, 'd', (i, n) => n >= 2 ? Math.max(0, i - 1) * step : 0.3 + i * 0.22) : h('span', { class: 'bj-none' }, v.seats.some(q => q && !q.gone) ? 'Læg jeres indsatser' : 'Bordet er ledigt'),
    dTot && !v.hidden ? late(dTot) : dTot));

  // ---- the seats ----
  const seats = h('div', { class: 'bj-seats' });
  for (let i = 0; i < SEATS; i++) {
    const q = v.seats[i];
    if (!q) { seats.append(h('button', { class: 'bj-seat bj-free' + (me >= 0 ? ' bj-idle' : ''), disabled: me >= 0, onclick: () => ctx.send({ t: 'bjsit', seat: i }) }, h('i'), h('span', {}, me >= 0 ? 'Ledig' : 'Sæt dig'))); continue; }
    const m = ctx.mem.get(q.u), turn = v.phase === 'play' && v.turn === i, hands = h('div', { class: 'bj-hands' });
    q.hands.forEach((hd, k) => {
      const t = total(hd.cards), d = hd.pay - hd.bet;
      hands.append(h('div', { class: 'bj-hand' + (turn && q.cur === k ? ' cur' : '') }, cards(hd.cards, i + ':' + k, (j, n) => (j - n) * 0.22),
        h('div', { class: 'bj-line' }, h('span', { class: 'bj-tot' + (t.t > 21 ? ' bust' : t.t === 21 ? ' top' : '') }, t.t > 21 ? 'Over' : t.soft && t.t < 21 && !hd.done ? (t.t - 10) + '/' + t.t : String(t.t)),
          h('span', { class: 'bj-bet' }, num(hd.bet)),
          hd.res ? late(h('span', { class: 'bj-res ' + hd.res }, hd.res === 'bj' ? 'Blackjack ' + signed(d) : hd.res === 'push' ? 'Lige' : signed(d))) : null)));
    });
    if (!q.hands.length) hands.append(h('div', { class: 'bj-hand' }, h('span', { class: 'bj-bet' + (q.bet ? '' : ' none') }, q.bet ? num(q.bet) : v.phase === 'bet' ? 'satser …' : 'står over')));
    seats.append(h('div', { class: 'bj-seat' + (turn ? ' turn' : '') + (i === me ? ' me' : '') + (q.gone ? ' gone' : '') }, hands,
      h('div', { class: 'bj-who' }, m ? bust(m.look, 30) : robotIcon(30), h('b', {}, q.u === ctx.me ? 'Dig' : q.n),
        late(h('span', { class: 'bj-net' + (q.net > 0 ? ' up' : q.net < 0 ? ' down' : '') }, q.gone ? 'er gået' : signed(q.net))))));
  }
  felt.append(seats);
  out.push(felt);
  now.d = v.dealer.slice();
  seen = { round: v.round, cards: now };

  // ---- what is going on ----
  const turnSeat = v.phase === 'play' && v.turn >= 0 ? v.seats[v.turn] : null, opts = me >= 0 ? options(v, me) : [], full = v.seats.every(q => q);
  let text, tone = '';
  if (v.phase === 'bet') text = me < 0 ? (full ? 'Bordet er fuldt. Du kan se med herfra.' : 'Sæt dig på en ledig plads for at spille med.') : mine.bet ? 'Din indsats: ' + num(mine.bet) + '. Kortene gives, når alle har satset.' : 'Vælg din indsats.';
  else if (opts.length) { const hd = mine.hands[mine.cur]; text = 'Din tur: du har ' + total(hd.cards).t + (mine.hands.length > 1 ? ' på hånd ' + (mine.cur + 1) : '') + ', dealeren viser ' + (dt === 11 ? 'et es' : dt) + '.'; tone = 'win'; }
  else if (v.phase === 'play') text = turnSeat ? (turnSeat.gone ? 'Dealeren trækker …' : turnSeat.n + ' spiller …') : 'Dealeren trækker …';
  else if (mine && mine.hands.length) { const d = mine.back - mine.staked; text = d > 0 ? 'Du vandt ' + num(d) + ' jetoner.' : d < 0 ? 'Du tabte ' + num(-d) + ' jetoner.' : 'Du fik din indsats tilbage.'; tone = d > 0 ? 'win' : d < 0 ? 'lose' : ''; }
  else text = 'Runden er slut. Den næste begynder om lidt.';
  out.push(v.phase === 'show' ? late(h('div', { class: 'status ' + tone }, text)) : h('div', { class: 'status ' + tone }, text));
  const bar = h('div', { class: 'pk-clock' }, h('i'));
  if (ctx.clock > 0 && (opts.length || (v.phase === 'bet' && (me < 0 || !mine.bet)) || (v.phase === 'play' && turnSeat))) bar.firstChild.style.animationDuration = ctx.clock + 's'; else bar.classList.add('bj-off');
  out.push(bar);

  // ---- what one can do ----
  const row = h('div', { class: 'bj-act' });
  if (me >= 0 && v.phase === 'bet') {
    const chips = ctx.chips() + mine.bet;
    row.append(...BETS.map(b => h('button', { class: 'btn' + (mine.bet === b ? '' : ' alt'), disabled: b > chips, 'aria-pressed': String(mine.bet === b), onclick: () => ctx.send({ t: 'bjbet', bet: b }) }, num(b))));
    if (mine.bet) row.append(h('button', { class: 'btn alt small', onclick: () => ctx.send({ t: 'bjbet', bet: 0 }) }, 'Tag tilbage'));
  } else if (opts.length) {
    const hd = mine.hands[mine.cur], poor = ctx.chips() < hd.bet, act = a => ctx.send({ t: 'bjact', a }), why = poor ? 'Du har ikke jetoner til det' : '';
    row.append(h('button', { class: 'btn teal', onclick: () => act('hit') }, 'Træk'), h('button', { class: 'btn', onclick: () => act('stand') }, 'Stå'));
    if (opts.includes('double')) row.append(h('button', { class: 'btn alt', disabled: poor, title: why, onclick: () => act('double') }, 'Doblér +' + num(hd.bet)));
    if (opts.includes('split')) row.append(h('button', { class: 'btn alt', disabled: poor, title: why, onclick: () => act('split') }, 'Split +' + num(hd.bet)));
  }
  row.append(h('button', { class: 'btn alt small bj-leave', onclick: ctx.leave }, me < 0 ? 'Luk' : v.phase === 'play' && mine.hands.length ? 'Rejs dig (hånden står)' : 'Rejs dig'));
  out.push(row);
  out.push(h('p', { class: 'hint center' }, 'Blackjack giver 3 til 2. Dealeren står på 17. Doblér på de to første kort, og split et par én gang.'));
  return out;
}
