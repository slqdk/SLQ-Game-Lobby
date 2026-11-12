// What the game screens for more than two players share: faces, and the table before the game has started.
import { h, bust } from '../ui.js';
import { robotIcon } from './c4.js';

export const face = (seat, ctx, size) => { const m = seat.u ? ctx.mem.get(seat.u) : null; return seat.bot || !m ? robotIcon(size) : bust(m.look, size); };
export const list = n => n.length > 2 ? n.slice(0, -1).join(', ') + ' og ' + n[n.length - 1] : n.join(' og ');

// The table while it waits: who sits there, robots (only without a stake), friends to ask, start, leave.
// o: { max, about (a line about the game), start (the text on the start button) }
export function waiting(tv, ctx, o) {
  const s = tv.seats, mine = tv.me >= 0, send = (t, extra) => ctx.send({ t, id: tv.id, ...extra }), out = [];
  out.push(h('div', { class: 'status' }, s.length < 2 ? 'Venter på spillere …' : s.length + ' ved bordet. ' + (tv.host === ctx.me ? 'Start, når I er klar.' : 'Venter på, at ' + s[0].n + ' starter.')));
  out.push(h('div', { class: 'pk-wait' }, s.map(q => h('div', { class: 'pk-who' }, face(q, ctx, 44), h('b', {}, q.u === ctx.me ? 'Dig' : q.n))),
    Array.from({ length: o.max - s.length }, () => h('div', { class: 'pk-who free' }, h('span', {}), h('b', {}, 'Ledig')))));
  out.push(h('p', { class: 'hint' }, o.about + (tv.stake ? ' Indsatsen er ' + tv.stake + ' jetoner pr. spiller, og vinderen tager puljen.' : '')));
  if (mine) {
    if (tv.host === ctx.me) {
      if (!tv.stake && s.length < o.max) {
        out.push(h('div', { class: 'sec' }, 'Sæt en robot ved bordet'));
        out.push(h('div', { class: 'row' }, ['Let', 'Mellem', 'Svær'].map((n, i) => h('button', { class: 'btn alt small', onclick: () => send('tbot', { level: i + 1 }) }, n))));
      }
      out.push(h('button', { class: 'btn', disabled: s.length < 2, onclick: () => send('tstart') }, o.start));
    }
    const here = [...ctx.mem.values()].filter(m => m.on && m.id !== ctx.me && !m.dnd && !s.some(q => q.u === m.id));
    if (here.length && s.length < o.max) {
      out.push(h('div', { class: 'sec' }, 'Bed en ven om at sætte sig'));
      out.push(h('div', { class: 'row' }, here.slice(0, 8).map(m => h('button', { class: 'btn alt small', onclick: e => { ctx.send({ t: 'tinv', id: tv.id, u: m.id }); e.currentTarget.disabled = true; e.currentTarget.textContent = m.name + ' er spurgt'; } }, m.name))));
    }
    out.push(h('div', { class: 'row' }, h('button', { class: 'btn alt', onclick: () => { send('tleave'); ctx.close(); } }, tv.stake ? 'Forlad bordet (indsatsen kommer tilbage)' : 'Forlad bordet')));
  } else out.push(h('div', { class: 'row' }, s.length < o.max ? h('button', { class: 'btn', onclick: () => send('tjoin') }, tv.stake ? 'Sæt dig (indsats ' + tv.stake + ')' : 'Sæt dig') : null, h('button', { class: 'btn alt', onclick: ctx.close }, 'Luk')));
  return out;
}
