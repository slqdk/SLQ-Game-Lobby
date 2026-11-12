// Poker on screen: the table with everybody around it, the cards, and the buttons that fit the moment.
// renderPoker(tv, ctx) returns the elements for the sheet (see c4.js for what tv and ctx are).
import { h, bust } from '../ui.js';
import { robotIcon } from './c4.js';
import { RANK_NAMES, handName, START } from '../../shared/games/poker.js';

const SUITS = ['♠', '♥', '♦', '♣'];
// Where the seats are around the table (percent of its width and height), counted from one's own seat at the bottom.
const PLACES = {
  2: [[50, 100], [50, 0]],
  3: [[50, 100], [10, 22], [90, 22]],
  4: [[50, 100], [2, 50], [50, 0], [98, 50]],
  5: [[50, 100], [3, 64], [24, 3], [76, 3], [97, 64]],
  6: [[50, 100], [3, 68], [14, 8], [50, 0], [86, 8], [97, 68]],
};

const card = (c, cls = '') => c < 0 ? h('div', { class: 'card back ' + cls })
  : h('div', { class: 'card ' + (c >= 13 && c < 39 ? 'red ' : '') + cls, 'aria-label': RANK_NAMES[c % 13] + SUITS[(c / 13) | 0] }, h('b', {}, RANK_NAMES[c % 13]), h('i', {}, SUITS[(c / 13) | 0]));
const list = n => n.length > 2 ? n.slice(0, -1).join(', ') + ' og ' + n[n.length - 1] : n.join(' og ');

export function renderPoker(tv, ctx) {
  const me = tv.me, s = tv.seats, v = tv.v, mine = me >= 0, send = (t, extra) => ctx.send({ t, id: tv.id, ...extra });
  const name = i => s[i].u === ctx.me ? 'Du' : s[i].n, out = [];
  const face = (seat, size) => { const m = seat.u ? ctx.mem.get(seat.u) : null; return seat.bot || !m ? robotIcon(size) : bust(m.look, size); };

  // ---- before the start: who sits here, robots, friends ----
  if (tv.phase === 'open') {
    out.push(h('div', { class: 'status' }, s.length < 2 ? 'Venter på spillere …' : s.length + ' ved bordet. ' + (tv.host === ctx.me ? 'Start, når I er klar.' : 'Venter på, at ' + s[0].n + ' starter.')));
    out.push(h('div', { class: 'pk-wait' }, s.map(q => h('div', { class: 'pk-who' }, face(q, 44), h('b', {}, q.u === ctx.me ? 'Dig' : q.n))),
      Array.from({ length: 6 - s.length }, () => h('div', { class: 'pk-who free' }, h('span', {}), h('b', {}, 'Ledig')))));
    out.push(h('p', { class: 'hint' }, 'Texas Hold\'em som turnering: alle begynder med ' + START + ' pokerjetoner, blinds stiger for hver ottende hånd, og den sidste med jetoner vinder' + (tv.stake ? ' puljen på ' + tv.stake + ' jetoner pr. spiller.' : '.')));
    if (mine) {
      if (tv.host === ctx.me) {
        if (!tv.stake && s.length < 6) {
          out.push(h('div', { class: 'sec' }, 'Sæt en robot ved bordet'));
          out.push(h('div', { class: 'row' }, ['Let', 'Mellem', 'Svær'].map((n, i) => h('button', { class: 'btn alt small', onclick: () => send('tbot', { level: i + 1 }) }, n))));
        }
        out.push(h('button', { class: 'btn', disabled: s.length < 2, onclick: () => send('tstart') }, 'Start turneringen'));
      }
      const here = [...ctx.mem.values()].filter(m => m.on && m.id !== ctx.me && !m.dnd && !s.some(q => q.u === m.id));
      if (here.length && s.length < 6) {
        out.push(h('div', { class: 'sec' }, 'Bed en ven om at sætte sig'));
        out.push(h('div', { class: 'row' }, here.slice(0, 8).map(m => h('button', { class: 'btn alt small', onclick: e => { ctx.send({ t: 'tinv', id: tv.id, u: m.id }); e.currentTarget.disabled = true; e.currentTarget.textContent = m.name + ' er spurgt'; } }, m.name))));
      }
      out.push(h('div', { class: 'row' }, h('button', { class: 'btn alt', onclick: () => { send('tleave'); ctx.close(); } }, tv.stake ? 'Forlad bordet (indskuddet kommer tilbage)' : 'Forlad bordet')));
    } else out.push(h('div', { class: 'row' }, s.length < 6 ? h('button', { class: 'btn', onclick: () => send('tjoin') }, tv.stake ? 'Sæt dig (indskud ' + tv.stake + ')' : 'Sæt dig') : null, h('button', { class: 'btn alt', onclick: ctx.close }, 'Luk')));
    return out;
  }

  // ---- the table ----
  const last = v.last, show = v.phase !== 'bet' && last, over = tv.phase === 'over';
  out.push(h('div', { class: 'pk-top' }, h('span', {}, 'Blinds ' + v.sb + '/' + v.bb), h('span', {}, 'Hånd ' + v.hands), tv.stake ? h('span', { class: 'pot' }, 'Pulje ' + (over ? tv.stake * s.length : tv.pot) + ' jetoner') : null));
  const felt = h('div', { class: 'pk-felt' }), base = mine ? me : 0, pos = PLACES[s.length] || PLACES[6];
  s.forEach((seat, i) => {
    const p = pos[(i - base + s.length) % s.length], gone = v.out[i], folded = !gone && v.folded[i], turn = v.phase === 'bet' && v.turn === i;
    const shown = show && last.shown[i], cards = shown || v.hole[i];
    const m = seat.u ? ctx.mem.get(seat.u) : null, can = seat.u && seat.u !== ctx.me && m && m.on;
    const el = h('div', { class: 'pk-seat' + (turn ? ' turn' : '') + (gone ? ' out' : folded ? ' fold' : '') + (i === me ? ' me' : '') + (show && last.won[i] > 0 ? ' won' : '') });
    el.style.left = p[0] + '%'; el.style.top = p[1] + '%';
    const who = h('button', { class: 'who', disabled: !can, title: can ? 'Dril ' + seat.n : '', onclick: () => can && ctx.tease(seat.u) }, face(seat, i === me ? 46 : 38),
      h('span', {}, h('b', {}, name(i)), h('em', {}, gone ? (seat.left ? 'gået' : 'ude') : String(v.stacks[i]))));
    el.append(who);
    if (cards && !gone || shown) el.append(h('div', { class: 'cards' }, cards.map(c => card(c, i === me || shown ? '' : 'small'))));
    const said = show ? (last.won[i] > 0 ? '+' + last.won[i] : shown && last.vals[i] !== undefined ? handName(last.vals[i]) : '') : v.said[i];
    if (said) el.append(h('div', { class: 'said' }, said));
    if (v.phase === 'bet' && v.bet[i] > 0) el.append(h('div', { class: 'chip' }, String(v.bet[i])));
    if (v.dealer === i && !gone) el.append(h('div', { class: 'dealer', title: 'Giver' }, 'D'));
    felt.append(el);
  });
  const boardCards = show ? last.board : v.board;
  felt.append(h('div', { class: 'pk-mid' }, h('div', { class: 'potline' }, v.phase === 'bet' ? 'I potten: ' + v.pot : ''),
    h('div', { class: 'board' }, [0, 1, 2, 3, 4].map(k => boardCards[k] !== undefined ? card(boardCards[k]) : h('div', { class: 'card empty' })))));
  out.push(h('div', { class: 'pk-wrap' }, felt));

  // ---- what is going on ----
  let text = '', tone = '';
  if (over) {
    const w = tv.res.win[0], gain = mine ? tv.res.pay[me] : 0;
    text = (w === me ? 'Du vandt turneringen!' : s[w].n + ' vandt turneringen.') + (gain ? ' +' + gain + ' jetoner' : ''); tone = w === me ? 'win' : mine ? 'lose' : '';
  } else if (show) {
    const all = s.map((_, i) => i), gain = all.filter(i => last.net[i] > 0), best = gain.length ? gain : all.filter(i => last.won[i] > 0);
    text = list(best.map(name)) + (best.length > 1 ? ' delte potten' : ' vandt ' + last.won[best[0]]) + (last.vals[best[0]] !== undefined ? ' med ' + handName(last.vals[best[0]]).toLowerCase() : '') + '.'
      + (last.bust.length ? ' ' + list(last.bust.map(name)) + ' er ude.' : '');
    tone = best.includes(me) ? 'win' : '';
  } else if (v.turn === me) { text = v.can.call ? 'Din tur: ' + v.can.call + ' for at være med' : 'Din tur'; tone = 'win'; }
  else text = (mine && v.out[me] ? 'Du er ude. ' : '') + s[v.turn].n + ' tænker …';
  out.push(h('div', { class: 'status ' + tone }, text));
  if (mine && !v.out[me] && v.mine && v.phase === 'bet') out.push(h('div', { class: 'pk-mine' }, 'Du har: ' + v.mine.toLowerCase()));

  // ---- what one can do ----
  if (v.phase === 'bet' && v.turn === me) {
    const can = v.can, clock = h('div', { class: 'pk-clock' }, h('i'));
    if (tv.clock > 0) clock.firstChild.style.animationDuration = tv.clock + 's';
    out.push(clock);
    const act = a => send('tact', { a });
    const row = h('div', { class: 'pk-act' }, h('button', { class: 'btn alt', onclick: () => act({ fold: true }) }, 'Fold'),
      h('button', { class: 'btn teal', onclick: () => act({ call: true }) }, can.call ? (can.call >= v.stacks[me] ? 'All-in ' : 'Call ') + can.call : 'Check'));
    out.push(row);
    if (can.max) {
      const opened = v.toCall > 0, range = h('input', { type: 'range', min: can.min, max: can.max, step: Math.max(1, Math.min(v.sb, can.max - can.min)), value: can.min, 'aria-label': 'Indsats' });
      const go = h('button', { class: 'btn' });
      const set = n => { const val = Math.max(can.min, Math.min(can.max, Math.round(n))); range.value = val; go.textContent = val >= can.max ? 'All-in ' + val : (opened ? 'Raise til ' : 'Bet ') + val; go.dataset.v = val; };
      range.addEventListener('input', () => set(+range.value));
      go.addEventListener('click', () => act({ raise: +go.dataset.v }));
      set(can.min);
      const quick = [['Min', can.min], ['½ pot', v.toCall + v.pot / 2], ['Pot', v.toCall + v.pot], ['All-in', can.max]];
      out.push(h('div', { class: 'pk-raise' }, range, go), h('div', { class: 'row' }, quick.map(([n, val]) => h('button', { class: 'btn alt small', onclick: () => set(val) }, n))));
    }
  } else if (show && !over && mine) out.push(h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => send('tact', { a: { next: true } }) }, 'Næste hånd')));

  const row = h('div', { class: 'row' });
  if (over && mine) {
    const gone = s.some(q => q.left), iAgreed = tv.again.includes(ctx.me), waiting = s.filter(q => q.u && !tv.again.includes(q.u)).map(q => q.n);
    if (!gone) row.append(h('button', { class: 'btn', disabled: iAgreed, onclick: () => send('tagain') }, iAgreed ? 'Venter på ' + list(waiting) + ' …' : tv.stake ? 'En turnering til (indskud ' + tv.stake + ')' : 'En turnering til'));
    row.append(h('button', { class: 'btn alt', onclick: () => { send('tleave'); ctx.close(); } }, 'Forlad bordet'));
  } else if (mine && !over) {
    let sure = false;
    row.append(h('button', { class: 'btn alt small', onclick: e => { if (sure) { send('tleave'); return ctx.close(); } sure = true; e.currentTarget.textContent = v.out[me] ? 'Tryk igen for at gå' : 'Sikker? Dine pokerjetoner er tabt'; e.currentTarget.classList.replace('alt', 'danger'); } }, 'Forlad turneringen'));
    row.append(h('button', { class: 'btn alt small', onclick: ctx.close }, 'Luk (uret går videre)'));
  } else row.append(h('button', { class: 'btn alt', onclick: ctx.close }, 'Luk'));
  out.push(row);
  return out;
}
