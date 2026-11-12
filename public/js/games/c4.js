// 4 på stribe on screen: the two players, the board, and the buttons that fit the moment.
// renderC4(tv, ctx) returns the elements for the sheet. tv is the table as the server sends it; ctx gives
// me (my user id), mem (members by id), send(message), now() (the server's clock), tease(user id), close().
import { h, bust, icon } from '../ui.js';
import { ECON } from '../../shared/defs.js';

const COLOURS = ['#e2403a', '#f2c33f'], NAMES = ['Rød', 'Gul'];
const shown = new Map();      // table id -> "game:moves" of the newest move this browser has let fall

function robotIcon(size) {
  return icon(size, c => {
    c.beginPath(); c.arc(0, 0, 15, 0, 7); c.fillStyle = '#3a3152'; c.fill();
    c.lineWidth = 1.6; c.strokeStyle = '#17121f';
    c.beginPath(); c.moveTo(0, -9.5); c.lineTo(0, -12.5); c.stroke(); c.beginPath(); c.arc(0, -13, 1.6, 0, 7); c.fillStyle = '#ffd45e'; c.fill(); c.stroke();
    c.beginPath(); c.roundRect(-9, -9.5, 18, 15, 5); c.fillStyle = '#b9c8d8'; c.fill(); c.stroke();
    c.beginPath(); c.roundRect(-6.5, -7, 13, 8.5, 2.6); c.fillStyle = '#1d2b3a'; c.fill();
    c.fillStyle = '#7fe0ff'; for (const s of [-1, 1]) { c.beginPath(); c.arc(s * 3, -3.4, 1.4, 0, 7); c.fill(); }
    c.beginPath(); c.arc(0, -1.6, 2.2, 0.2 * Math.PI, 0.8 * Math.PI); c.strokeStyle = '#7fe0ff'; c.lineWidth = 0.9; c.stroke();
    c.beginPath(); c.roundRect(-7, 6.5, 14, 9, 3); c.fillStyle = '#8fa3b8'; c.fill(); c.strokeStyle = '#17121f'; c.lineWidth = 1.6; c.stroke();
  });
}

function status(tv) {
  const me = tv.me, s = tv.seats;
  if (tv.phase === 'open') return ['Venter på en modspiller …', ''];
  if (tv.phase === 'play') {
    if (tv.turn === me) return ['Din tur: vælg en kolonne', 'win'];
    return [me >= 0 ? 'Venter på ' + s[tv.turn].n + ' …' : s[tv.turn].n + ' har turen', ''];
  }
  const r = tv.res, gain = me >= 0 ? r.pay[me] : 0, plus = gain ? ' +' + gain + ' jetoner' : '';
  if (r.draw) return ['Uafgjort.' + plus, ''];
  const w = r.win[0];
  if (me < 0) return [s[w].n + ' vandt' + (r.why === 'resign' ? ', fordi ' + s[r.by].n + ' gav op.' : r.why === 'time' ? ' på tid.' : '.'), ''];
  if (w === me) return [(r.why === 'resign' ? s[r.by].n + ' gav op. Du vandt!' : r.why === 'time' ? 'Du tog sejren på tid.' : 'Du vandt!') + plus, 'win'];
  return [(r.why === 'resign' ? 'Du gav op.' : r.why === 'time' ? s[w].n + ' tog sejren på tid.' : s[w].n + ' vandt.') + plus, 'lose'];
}

export function renderC4(tv, ctx) {
  const me = tv.me, s = tv.seats, v = tv.v, mine = me >= 0, send = (t, extra) => ctx.send({ t, id: tv.id, ...extra });
  const out = [];

  // the two players
  const player = i => {
    const seat = s[i];
    if (!seat) return h('div', { class: 'pl' }, h('div', {}, h('b', {}, 'Ledig plads'), h('span', {}, h('i', { style: 'background:' + COLOURS[i] }), NAMES[i])));
    const m = seat.u ? ctx.mem.get(seat.u) : null, can = seat.u && seat.u !== ctx.me && m && m.on;
    return h('button', { class: 'pl' + (tv.phase === 'play' && tv.turn === i ? ' turn' : ''), disabled: !can, title: can ? 'Dril ' + seat.n : '', onclick: () => can && ctx.tease(seat.u) },
      seat.bot ? robotIcon(42) : m ? bust(m.look, 42) : robotIcon(42),
      h('div', { style: 'min-width:0' }, h('b', {}, seat.u === ctx.me ? 'Dig' : seat.n), h('span', {}, h('i', { style: 'background:' + COLOURS[i] }), NAMES[i] + (seat.left ? ' · gået' : ''))));
  };
  out.push(h('div', { class: 'duel' }, player(0), h('div', { class: 'vs' }, tv.stake ? h('span', { class: 'pot' }, (tv.phase === 'over' ? tv.stake * 2 : tv.pot) + ' jetoner') : null, 'mod'), player(1)));

  const [text, tone] = status(tv);
  out.push(h('div', { class: 'status ' + tone }, text));

  // the board
  const b = v ? v.b : new Array(42).fill(0), go = tv.phase === 'play' && tv.turn === me;
  const key = tv.n + ':' + (v ? v.n : 0), fresh = v && v.n > 0 && shown.get(tv.id) !== key && shown.has(tv.id);
  shown.set(tv.id, key);
  const board = h('div', { class: 'c4' + (go ? ' go' : '') });
  for (let c = 0; c < 7; c++) {
    const full = !!b[35 + c], col = h('button', { class: 'col' + (full ? ' full' : ''), 'aria-label': 'Kolonne ' + (c + 1), disabled: !go || full, onclick: () => go && !full && send('tact', { a: { c } }) });
    for (let r = 5; r >= 0; r--) {
      const i = r * 7 + c, hole = h('div', { class: 'hole' });
      if (b[i]) {
        const d = h('div', { class: 'disc p' + b[i] + (v.last === i ? ' last' : '') + (v.line && v.line.includes(i) ? ' win' : '') + (fresh && v.last === i ? ' drop' : '') });
        d.style.setProperty('--rows', 6 - r);
        hole.append(d);
      }
      col.append(hole);
    }
    board.append(col);
  }
  out.push(h('div', { class: 'c4wrap' }, board));

  // what one can do now
  const row = h('div', { class: 'row' });
  if (tv.phase === 'open' && mine) {
    if (tv.host === ctx.me && !tv.stake) {
      out.push(h('div', { class: 'sec' }, 'Spil mod robotten'));
      out.push(h('div', { class: 'row' }, ['Let', 'Mellem', 'Svær'].map((n, i) => h('button', { class: 'btn alt small', onclick: () => send('tbot', { level: i + 1 }) }, n))));
    }
    const here = [...ctx.mem.values()].filter(m => m.on && m.id !== ctx.me && !m.dnd);
    if (here.length) {
      out.push(h('div', { class: 'sec' }, 'Bed en ven om at sætte sig'));
      out.push(h('div', { class: 'row' }, here.slice(0, 8).map(m => h('button', { class: 'btn alt small', onclick: e => { ctx.send({ t: 'tinv', id: tv.id, u: m.id }); e.currentTarget.disabled = true; e.currentTarget.textContent = m.name + ' er spurgt'; } }, m.name))));
    } else out.push(h('p', { class: 'hint' }, 'Bordet står klar i klubhuset. Den første, der sætter sig, spiller mod dig – også hvis du lukker her imens.'));
    row.append(h('button', { class: 'btn alt', onclick: () => { send('tleave'); ctx.close(); } }, tv.stake ? 'Forlad bordet (indsatsen kommer tilbage)' : 'Forlad bordet'));
  } else if (tv.phase === 'play' && mine) {
    const waited = ctx.now() - tv.turnAt, other = s[tv.turn];
    if (tv.turn !== me && other && !other.bot && waited >= ECON.claimHours * 3600e3) row.append(h('button', { class: 'btn teal', onclick: () => send('tclaim') }, 'Tag sejren (' + other.n + ' har ikke rykket i ' + ECON.claimHours + ' timer)'));
    let sure = false;
    row.append(h('button', { class: 'btn alt', onclick: e => { if (sure) return send('tact', { a: { resign: true } }); sure = true; e.currentTarget.textContent = 'Sikker? Tryk igen for at give op'; e.currentTarget.classList.replace('alt', 'danger'); } }, 'Giv op'));
    row.append(h('button', { class: 'btn alt', onclick: ctx.close }, 'Luk (spillet venter)'));
  } else if (tv.phase === 'over' && mine) {
    const other = s.find(q => q.u !== ctx.me), gone = s.some(q => q.left), iAgreed = tv.again.includes(ctx.me), theyAgreed = other && other.u && tv.again.includes(other.u);
    if (!gone) row.append(h('button', { class: 'btn', disabled: iAgreed, onclick: () => send('tagain') },
      iAgreed ? 'Venter på ' + other.n + ' …' : theyAgreed ? 'Revanche! ' + other.n + ' er klar' : tv.stake ? 'Revanche (indsats ' + tv.stake + ')' : 'Revanche'));
    row.append(h('button', { class: 'btn alt', onclick: () => { send('tleave'); ctx.close(); } }, 'Forlad bordet'));
  } else row.append(h('button', { class: 'btn alt', onclick: ctx.close }, 'Luk'));
  out.push(row);
  return out;
}
