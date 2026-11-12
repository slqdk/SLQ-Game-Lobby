// Yatzy on screen: the dice, the sheet with everybody's column, and the buttons that fit the moment.
// renderYatzy(tv, ctx) returns the elements for the sheet (see c4.js for what tv and ctx are).
import { h } from '../ui.js';
import { ECON } from '../../shared/defs.js';
import { FIELDS, FIELD_NAMES, BONUS_AT, scoreOf, sums } from '../../shared/games/yatzy.js';
import { face, list, waiting } from './common.js';

const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
const keep = new Map();          // table id -> { key, held }: the dice this browser has put aside in the turn that is on

export function die(v, cls, onclick) {
  const d = h('button', { class: 'die ' + cls, disabled: !onclick, 'aria-label': v ? 'Terning ' + v : 'Terning', onclick });
  for (let i = 0; i < 9; i++) d.append(h('i', { class: v && PIPS[v].includes(i) ? 'on' : '' }));
  return d;
}

export function renderYatzy(tv, ctx) {
  if (tv.phase === 'open') return waiting(tv, ctx, { max: 4, about: 'Yatzy med fem terninger: tre slag pr. tur, femten felter, og 50 ekstra for mindst ' + BONUS_AT + ' i den øverste halvdel.', start: 'Start spillet' });
  const me = tv.me, s = tv.seats, v = tv.v, mine = me >= 0, over = tv.phase === 'over', send = (t, extra) => ctx.send({ t, id: tv.id, ...extra });
  const name = i => s[i].u === ctx.me ? 'Du' : s[i].n, go = !over && v.turn === me, out = [];

  // ---- what is going on ----
  let text, tone = '';
  if (over) {
    const r = tv.res, gain = mine ? r.pay[me] : 0, plus = gain ? ' +' + gain + ' jetoner' : '';
    text = r.draw ? 'Uafgjort.' + plus : (r.win.includes(me) ? (r.win.length > 1 ? 'Du delte sejren med ' + list(r.win.filter(i => i !== me).map(name)) + '!' : 'Du vandt!') : list(r.win.map(name)) + ' vandt.') + plus;
    tone = r.win.includes(me) ? 'win' : mine && !r.draw ? 'lose' : '';
  } else if (go) { text = v.rolls === 0 ? 'Din tur: slå terningerne' : v.rolls < 3 ? 'Gem dem, du vil beholde, og slå om – eller skriv slaget på blokken' : 'Skriv slaget i et felt'; tone = 'win'; }
  else text = s[v.turn].n + ' har turen' + (v.rolls ? ' (slag ' + v.rolls + ' af 3)' : '');
  out.push(h('div', { class: 'status ' + tone }, text));

  // ---- the dice ----
  if (!over) {
    const key = tv.n + ':' + v.turn + ':' + v.rolls + ':' + FIELDS.filter(f => f in v.cards[v.turn]).length;
    let k = keep.get(tv.id);
    if (!k || k.key !== key) { k = { key, held: v.held.slice() }; keep.set(tv.id, k); }
    const can = go && v.rolls > 0 && v.rolls < 3, row = h('div', { class: 'dice' });
    const draw = () => {
      row.replaceChildren(...v.dice.map((d, i) => die(d, (go ? k.held[i] : v.held[i]) ? 'held' : '', can ? () => { k.held[i] = !k.held[i]; draw(); } : null)));
      if (roll) { roll.disabled = v.rolls > 0 && k.held.every(Boolean); }
    };
    const roll = go && v.rolls < 3 ? h('button', { class: 'btn', onclick: () => send('tact', { a: { roll: v.rolls ? k.held : [] } }) }, v.rolls === 0 ? 'Slå terningerne' : 'Slå om (' + (3 - v.rolls) + ' tilbage)') : null;
    draw();
    out.push(row);
    if (roll) out.push(h('div', { class: 'row' }, roll));
    if (v.last && !go) out.push(h('p', { class: 'hint center' }, name(v.last.seat) + ' skrev ' + v.last.pts + ' i ' + FIELD_NAMES[v.last.field] + '.'));
  }

  // ---- the sheet ----
  const tbl = h('div', { class: 'yz' }), cols = s.map((_, i) => i);
  tbl.style.setProperty('--cols', String(s.length));
  tbl.append(h('div', { class: 'f head' }), ...cols.map(i => h('div', { class: 'c head' + (i === me ? ' me' : '') + (!over && v.turn === i ? ' turn' : '') + (v.gone[i] ? ' gone' : '') }, face(s[i], ctx, 30), h('b', {}, name(i)))));
  const line = (label, cls, cell) => tbl.append(h('div', { class: 'f ' + cls }, label), ...cols.map(i => cell(i)));
  FIELDS.forEach((f, fi) => {
    line(FIELD_NAMES[f], '', i => {
      const card = v.cards[i];
      if (f in card) return h('div', { class: 'c' + (i === me ? ' me' : '') + (v.last && v.last.seat === i && v.last.field === f ? ' new' : '') }, card[f] ? String(card[f]) : '–');
      if (i === me && go && v.rolls > 0) { const pts = scoreOf(f, v.dice); return h('button', { class: 'c me pick' + (pts ? '' : ' zero'), title: 'Skriv ' + pts + ' i ' + FIELD_NAMES[f], onclick: () => send('tact', { a: { score: f } }) }, String(pts)); }
      return h('div', { class: 'c' + (i === me ? ' me' : '') });
    });
    if (fi === 5) {
      line('Sum', 'sum', i => h('div', { class: 'c sum' + (i === me ? ' me' : '') }, String(sums(v.cards[i]).upper)));
      line('Bonus (fra ' + BONUS_AT + ')', 'sum', i => { const u = sums(v.cards[i]); return h('div', { class: 'c sum' + (i === me ? ' me' : '') }, u.bonus ? '50' : FIELDS.slice(0, 6).every(x => x in v.cards[i]) ? '–' : ''); });
    }
  });
  line('I alt', 'total', i => h('div', { class: 'c total' + (i === me ? ' me' : '') }, String(sums(v.cards[i]).total)));
  out.push(tbl);

  // ---- what one can do besides playing ----
  const row = h('div', { class: 'row' });
  if (over && mine) {
    const gone = s.some(q => q.left), iAgreed = tv.again.includes(ctx.me), waitingFor = s.filter(q => q.u && !tv.again.includes(q.u)).map(q => q.n);
    if (!gone) row.append(h('button', { class: 'btn', disabled: iAgreed, onclick: () => send('tagain') }, iAgreed ? 'Venter på ' + list(waitingFor) + ' …' : tv.stake ? 'Et spil til (indsats ' + tv.stake + ')' : 'Et spil til'));
    row.append(h('button', { class: 'btn alt', onclick: () => { send('tleave'); ctx.close(); } }, 'Forlad bordet'));
  } else if (mine && !over) {
    const other = s[v.turn];
    if (!go && other && !other.bot && ctx.now() - tv.turnAt >= ECON.claimHours * 3600e3) row.append(h('button', { class: 'btn teal', onclick: () => send('tclaim') }, other.n + ' har ikke slået i ' + ECON.claimHours + ' timer: spil videre uden'));
    let sure = false;
    row.append(h('button', { class: 'btn alt small', onclick: e => { if (sure) return send('tact', { a: { resign: true } }); sure = true; e.currentTarget.textContent = 'Sikker? Tryk igen for at give op'; e.currentTarget.classList.replace('alt', 'danger'); } }, 'Giv op'));
    row.append(h('button', { class: 'btn alt small', onclick: ctx.close }, 'Luk (spillet venter)'));
  } else row.append(h('button', { class: 'btn alt', onclick: ctx.close }, 'Luk'));
  out.push(row);
  return out;
}
