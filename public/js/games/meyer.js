// Meyer on screen: who sits there and how many lives they have, the cup and what was said about it, and the
// buttons that fit the moment. renderMeyer(tv, ctx) returns the elements for the sheet (see c4.js).
import { h } from '../ui.js';
import { LIVES, MEYER, rankOf, rankName } from '../../shared/games/meyer.js';
import { face, waiting } from './common.js';
import { die } from './yatzy.js';

export function renderMeyer(tv, ctx) {
  if (tv.phase === 'open') return waiting(tv, ctx, { max: 6, about: 'Meyer: to terninger under et bæger går rundt. Sig det samme som den før dig eller højere, sandt eller ej. Den næste tror på det eller løfter bægeret. Alle har seks liv, og Meyer koster to.', start: 'Start spillet' });
  const me = tv.me, s = tv.seats, v = tv.v, mine = me >= 0, over = tv.phase === 'over', send = (t, extra) => ctx.send({ t, id: tv.id, ...extra });
  const name = i => s[i].u === ctx.me ? 'Du' : s[i].n, obj = i => s[i].u === ctx.me ? 'dig' : s[i].n, act = a => send('tact', { a }), out = [];
  const go = !over && v.turn === me, said = v.prev ? rankName(v.prev.said) : '';

  // ---- everybody and their lives ----
  out.push(h('div', { class: 'my-who' }, s.map((q, i) => h('div', { class: 'p' + (v.turn === i ? ' turn' : '') + (v.out[i] ? ' out' : '') + (i === me ? ' me' : '') }, face(q, ctx, 38), h('b', {}, name(i)),
    h('span', { class: 'lives', title: v.lives[i] + ' liv' }, Array.from({ length: LIVES }, (_, k) => h('i', { class: k < v.lives[i] ? 'on' : '' })))))));

  // ---- the cup, and what is known about it ----
  const L = v.last, shown = (v.phase === 'show' || over) && L;
  const cup = h('div', { class: 'my-cup' + (shown ? ' up' : '') }, h('div', { class: 'cupshape' }),
    shown ? h('div', { class: 'under' }, die(L.cup[0], 'small'), die(L.cup[1], 'small')) : go && v.phase === 'say' ? h('div', { class: 'under' }, die(v.mine[0], 'small'), die(v.mine[1], 'small')) : null);
  out.push(cup);
  let text, tone = '';
  if (shown) {
    const lost = L.lost === 2 ? 'to liv' : 'et liv';
    text = name(L.lifter) + ' løftede bægeret: der lå ' + rankName(L.real) + ', og ' + (L.blind ? obj(L.by) + ' sendte det videre uset som ' : obj(L.by) + ' sagde ') + rankName(L.said) + '. '
      + (L.lie ? 'Det passede ikke: ' : 'Det passede: ') + name(L.loser) + (L.loser === me ? ' mister ' : ' mister ') + lost + (v.out[L.loser] ? ' og er ude.' : '.');
    tone = L.loser === me ? 'lose' : '';
    if (over) { const w = tv.res.win[0], gain = mine ? tv.res.pay[me] : 0; text += ' ' + (w === me ? 'Du vandt!' : s[w].n + ' vandt.') + (gain ? ' +' + gain + ' jetoner' : ''); tone = w === me ? 'win' : mine ? 'lose' : ''; }
  } else if (over) { const w = tv.res.win[0]; text = w === me ? 'Du vandt!' : s[w].n + ' vandt.'; tone = w === me ? 'win' : ''; }
  else if (go && v.phase === 'say') { text = 'Du slog ' + rankName(rankOf(v.mine[0], v.mine[1])) + '. Hvad siger du?' + (v.prev ? ' (mindst ' + said + ')' : ''); tone = 'win'; }
  else if (go) { text = v.prev ? name(v.prev.seat) + (v.prev.blind ? ' sender bægeret videre uden at kigge: ' + said + ' eller derover.' : ' siger: ' + said + '.') + ' Tror du på det?' : 'Du begynder runden: slå, og sig, hvad du har.'; tone = 'win'; }
  else text = (v.prev ? name(v.prev.seat) + (v.prev.blind ? ' sendte videre uset: ' + said + ' eller derover. ' : ' siger: ' + said + '. ') : '') + s[v.turn].n + (v.phase === 'say' ? ' har slået og kigger …' : ' har bægeret …');
  out.push(h('div', { class: 'status ' + tone }, text));

  // ---- what one can do ----
  if (go) {
    const clock = h('div', { class: 'pk-clock' }, h('i'));
    if (tv.clock > 0) clock.firstChild.style.animationDuration = tv.clock + 's';
    out.push(clock);
    if (v.phase === 'say') {
      const real = rankOf(v.mine[0], v.mine[1]), min = v.prev ? v.prev.said : 0, grid = h('div', { class: 'my-say' });
      for (let r = min; r <= MEYER; r++) grid.append(h('button', { class: 'btn small ' + (r === real ? '' : 'alt'), title: r === real ? 'Det er sandt' : 'Det er løgn', onclick: () => act({ say: r }) }, rankName(r)));
      out.push(grid, h('p', { class: 'hint center' }, real >= min ? 'Den gule er sandheden. Alt andet er løgn.' : 'Dit slag er for lavt: du må lyve.'));
    } else if (v.prev) {
      out.push(h('div', { class: 'pk-act' }, h('button', { class: 'btn', onclick: () => act({ lift: true }) }, 'Løft bægeret'), h('button', { class: 'btn teal', onclick: () => act({ roll: true }) }, 'Tro på det og slå')),
        h('div', { class: 'row' }, h('button', { class: 'btn alt', onclick: () => act({ blind: true }) }, 'Det eller derover (slå uden at kigge)')));
    } else out.push(h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => act({ roll: true }) }, 'Slå terningerne')));
  } else if (v.phase === 'show' && mine) out.push(h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => act({ next: true }) }, 'Næste runde')));

  const row = h('div', { class: 'row' });
  if (over && mine) {
    const gone = s.some(q => q.left), iAgreed = tv.again.includes(ctx.me);
    if (!gone) row.append(h('button', { class: 'btn', disabled: iAgreed, onclick: () => send('tagain') }, iAgreed ? 'Venter på de andre …' : tv.stake ? 'Et spil til (indsats ' + tv.stake + ')' : 'Et spil til'));
    row.append(h('button', { class: 'btn alt', onclick: () => { send('tleave'); ctx.close(); } }, 'Forlad bordet'));
  } else if (mine && !over) {
    let sure = false;
    row.append(h('button', { class: 'btn alt small', onclick: e => { if (sure) { send('tleave'); return ctx.close(); } sure = true; e.currentTarget.textContent = 'Sikker? Tryk igen for at gå'; e.currentTarget.classList.replace('alt', 'danger'); } }, 'Forlad spillet'));
    row.append(h('button', { class: 'btn alt small', onclick: ctx.close }, 'Luk (uret går videre)'));
  } else row.append(h('button', { class: 'btn alt', onclick: ctx.close }, 'Luk'));
  out.push(row);
  return out;
}
