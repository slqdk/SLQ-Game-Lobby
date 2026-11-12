// Ludo on screen: the board, the pieces that hop along it, the die, and a line about what just happened.
// renderLudo(tv, ctx) returns the elements for the sheet (see c4.js for what tv and ctx are).
import { h } from '../ui.js';
import { ECON } from '../../shared/defs.js';
import { LANE, GOAL, START, GLOBES, STARS, abs } from '../../shared/games/ludo.js';
import { face, list, waiting } from './common.js';
import { die } from './yatzy.js';

// The board is 15 x 15 squares. The track's 52 squares as [column, row], clockwise from the left arm's upper row.
const CELL = [];
{
  const run = (x, y, dx, dy, n) => { for (let i = 0; i < n; i++) CELL.push([x + dx * i, y + dy * i]); };
  run(0, 6, 1, 0, 6); run(6, 5, 0, -1, 6); run(7, 0, 0, 0, 1); run(8, 0, 0, 1, 6); run(9, 6, 1, 0, 6); run(14, 7, 0, 0, 1);
  run(14, 8, -1, 0, 6); run(8, 9, 0, 1, 6); run(7, 14, 0, 0, 1); run(6, 14, 0, -1, 6); run(5, 8, -1, 0, 6); run(0, 7, 0, 0, 1);
}
const LANES = [[1, 7, 1, 0], [7, 1, 0, 1], [13, 7, -1, 0], [7, 13, 0, -1]];        // per colour: the first lane square and the direction
const YARD = [[0, 0], [9, 0], [9, 9], [0, 9]];                                     // the corner of each colour's yard (6 x 6)
const SPOT = [[2, 2], [4, 2], [2, 4], [4, 4]];                                     // where the four pieces wait in a yard
const HOME = [[6.55, 7.5], [7.5, 6.55], [8.45, 7.5], [7.5, 8.45]];                 // where they gather in the goal
const COLOR_NAMES = ['rød', 'grøn', 'gul', 'blå'];

// The middle of the place where a piece stands, in squares from the board's upper left corner.
function where(color, pos, k) {
  if (pos < 0) return [YARD[color][0] + SPOT[k][0], YARD[color][1] + SPOT[k][1]];
  if (pos === GOAL) { const o = (k - 1.5) * 0.42; return color % 2 ? [HOME[color][0] + o, HOME[color][1]] : [HOME[color][0], HOME[color][1] + o]; }
  if (pos >= LANE) { const l = LANES[color], i = pos - LANE; return [l[0] + l[2] * i + 0.5, l[1] + l[3] * i + 0.5]; }
  const c = CELL[abs(color, pos)];
  return [c[0] + 0.5, c[1] + 0.5];
}
const pct = ([x, y]) => ({ left: x / 15 * 100 + '%', top: y / 15 * 100 + '%' });

// yards: per colour { name, turn, gone } for the colours that are in the game
function board(yards) {
  const g = h('div', { class: 'g' });
  const put = (el, x, y, w = 1) => { el.style.gridColumn = (x + 1) + ' / span ' + w; el.style.gridRow = (y + 1) + ' / span ' + w; g.append(el); };
  YARD.forEach(([x, y], c) => { const o = yards[c]; put(h('div', { class: 'yard lc' + c + (o && o.turn ? ' turn' : '') + (o && o.gone ? ' gone' : '') }, SPOT.map(sp => { const i = h('i'); Object.assign(i.style, { left: sp[0] / 6 * 100 + '%', top: sp[1] / 6 * 100 + '%' }); return i; }), o ? h('span', { class: 'who' }, o.name) : null), x, y, 6); });
  CELL.forEach(([x, y], a) => { const st = START.indexOf(a); put(h('div', { class: 'sq' + (st >= 0 ? ' start globe lc' + st : GLOBES.includes(a) ? ' globe' : STARS.includes(a) ? ' star' : '') }), x, y); });
  LANES.forEach((l, c) => { for (let i = 0; i < 5; i++) put(h('div', { class: 'sq lane lc' + c }), l[0] + l[2] * i, l[1] + l[3] * i); });
  put(h('div', { class: 'goal' }), 6, 6, 3);
  return g;
}

const seen = new Map();          // table id -> the last throw this browser has shown (so that a move is only played once)
const still = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function renderLudo(tv, ctx) {
  if (tv.phase === 'open') return waiting(tv, ctx, { max: 4, about: 'Ludo: en sekser bringer en brik ud, og en sekser giver et slag til. På en globus står man sikkert, en stjerne sender brikken videre til den næste stjerne, og to brikker på samme felt kan ikke slås hjem. Den første med fire brikker i mål vinder.', start: 'Start spillet' });
  const me = tv.me, s = tv.seats, v = tv.v, mine = me >= 0, over = tv.phase === 'over', send = (t, extra) => ctx.send({ t, id: tv.id, ...extra });
  const name = i => s[i].u === ctx.me ? 'Du' : s[i].n, act = a => send('tact', { a }), out = [];
  const go = !over && v.turn === me, L = v.last, key = tv.n + ':' + v.count;
  const fresh = seen.has(tv.id) && seen.get(tv.id) !== key, moved = fresh && L && L.n === v.count && !L.pass;
  seen.set(tv.id, key);

  // ---- what is going on ----
  let text, tone = '';
  if (over) {
    const w = tv.res.win[0], gain = mine ? tv.res.pay[me] : 0;
    text = (w === me ? 'Du vandt!' : s[w].n + ' vandt.') + (gain ? ' +' + gain + ' jetoner' : ''); tone = w === me ? 'win' : mine ? 'lose' : '';
  } else if (go && v.phase === 'move') { text = 'Du slog ' + v.die + ': vælg en brik' + (v.die === 6 ? ' (og slå igen bagefter)' : ''); tone = 'win'; }
  else if (go) { text = L && L.seat === me && L.pass ? 'Du slog ' + L.die + '. Prøv igen: forsøg ' + (v.tries + 1) + ' af 3' : L && L.seat === me && L.die === 6 ? 'En sekser: slå igen' : 'Din tur: slå terningen'; tone = 'win'; }
  else text = s[v.turn].n + (v.phase === 'move' ? ' slog ' + v.die + ' og vælger en brik …' : ' har turen');
  out.push(h('div', { class: 'status ' + tone }, text));

  // ---- the board and the pieces ----
  const yards = {};
  s.forEach((q, i) => { yards[v.color[i]] = { name: i === me ? 'Dig' : q.n, turn: !over && v.turn === i, gone: v.gone[i] }; });
  const bd = h('div', { class: 'ld' }, board(yards)), groups = {}, toks = {};
  v.pos.forEach((ps, i) => { if (!v.gone[i]) ps.forEach((p, k) => { if (p >= 0 && p < GOAL) { const id = where(v.color[i], p, k).join(); (groups[id] = groups[id] || []).push(i + ':' + k); } }); });
  const at = (i, k) => {                                       // pieces that share a square stand a little apart
    const p = v.pos[i][k], w = where(v.color[i], p, k);
    if (p < 0 || p === GOAL) return w;
    const gr = groups[w.join()], j = gr.indexOf(i + ':' + k) - (gr.length - 1) / 2;
    return [w[0] + j * 0.27, w[1] - j * 0.1];
  };
  v.pos.forEach((ps, i) => {
    if (v.gone[i]) return;
    ps.forEach((p, k) => {
      const can = go && v.phase === 'move' && i === me && v.moves.includes(k);
      const el = h('button', { class: 'tok lc' + v.color[i] + (can ? ' can' : ''), disabled: !can, 'aria-label': (i === me ? 'Din brik' : s[i].n + ': brik') + (can ? ', kan flyttes' : ''), onclick: can ? () => act({ move: k }) : null });
      Object.assign(el.style, pct(at(i, k)));
      toks[i + ':' + k] = el; bd.append(el);
    });
  });
  // the move that was just made: the piece hops along the squares it went over, and whoever was hit goes home after
  if (moved && !still() && toks[L.seat + ':' + L.piece] && toks[L.seat + ':' + L.piece].animate) {
    const c = v.color[L.seat], frames = [where(c, L.from, L.piece), ...L.steps.map(p => where(c, p, L.piece))];
    if (L.self) frames.push(where(c, -1, L.piece));
    frames[frames.length - 1] = at(L.seat, L.piece);
    const dur = Math.min(650, 85 * frames.length + 120), tok = toks[L.seat + ':' + L.piece];        // done before a robot's next throw
    tok.classList.add('moving');
    tok.animate(frames.map(pct), { duration: dur, easing: 'ease-in-out' });
    for (const [i, k, rel] of L.hit) {
      const el = toks[i + ':' + k], from = pct(where(v.color[i], rel, k));
      if (el) el.animate([{ ...from, offset: 0 }, { ...from, offset: dur / (dur + 280) }, { ...pct(at(i, k)), offset: 1 }], { duration: dur + 280, easing: 'ease-in' });
    }
  }
  out.push(bd);

  // ---- the die, and what one can do ----
  const shown = v.phase === 'move' ? v.die : L ? L.die : 0, rolled = fresh && !(L && L.n === v.count && L.pick);
  const bar = h('div', { class: 'ld-bar' }, die(shown, 'small' + (rolled ? ' rolled' : '')));
  if (go && v.phase === 'roll') bar.append(h('button', { class: 'btn', onclick: () => act({ roll: true }) }, 'Slå terningen'));
  else if (go) bar.append(h('span', { class: 'hint' }, 'Tryk på en af de brikker, der blinker.'));
  out.push(bar);
  if (L && !(go && L.seat === me && L.pass && L.more)) {
    const who = name(L.seat), hit = list([...new Set((L.hit || []).map(x => x[0]))].map(i => i === me ? 'dig' : s[i].n));
    out.push(h('p', { class: 'hint center' }, who + (L.pass ? ' slog ' + L.die + ' og kunne ikke flytte.'
      : L.self ? ' slog ' + L.die + ' og landede hos en, der stod sikkert: brikken røg hjem.'
      : hit ? ' slog ' + L.die + ' og slog ' + hit + ' hjem.'
      : L.to === GOAL ? ' slog ' + L.die + ' og fik en brik i mål.'
      : L.from < 0 ? ' slog en sekser og satte en brik i spil.'
      : L.star ? ' slog ' + L.die + ' og fløj videre fra stjernen.'
      : ' slog ' + L.die + '.')));
  } else if (!L && mine) out.push(h('p', { class: 'hint center' }, 'Du er ' + COLOR_NAMES[v.color[me]] + '. ' + list(s.map((q, i) => i === me ? null : q.n + ' er ' + COLOR_NAMES[v.color[i]]).filter(Boolean)) + '.'));

  // ---- everybody, their colour, and how many pieces are in the goal ----
  out.push(h('div', { class: 'my-who ld-who' }, s.map((q, i) => h('div', { class: 'p lc' + v.color[i] + (v.turn === i ? ' turn' : '') + (v.gone[i] ? ' out' : '') + (i === me ? ' me' : ''), title: name(i) + ' er ' + COLOR_NAMES[v.color[i]] },
    face(q, ctx, 34), h('b', {}, name(i)), h('span', { class: 'lives' }, v.pos[i].map(p => h('i', { class: p === GOAL ? 'on' : '' })))))));

  // ---- what one can do besides playing ----
  const row = h('div', { class: 'row' });
  if (over && mine) {
    const left = s.some(q => q.left), iAgreed = tv.again.includes(ctx.me), waitingFor = s.filter(q => q.u && !tv.again.includes(q.u)).map(q => q.n);
    if (!left) row.append(h('button', { class: 'btn', disabled: iAgreed, onclick: () => send('tagain') }, iAgreed ? 'Venter på ' + list(waitingFor) + ' …' : tv.stake ? 'Et spil til (indsats ' + tv.stake + ')' : 'Et spil til'));
    row.append(h('button', { class: 'btn alt', onclick: () => { send('tleave'); ctx.close(); } }, 'Forlad bordet'));
  } else if (mine && !over) {
    const other = s[v.turn];
    if (!go && other && !other.bot && ctx.now() - tv.turnAt >= ECON.claimHours * 3600e3) row.append(h('button', { class: 'btn teal', onclick: () => send('tclaim') }, other.n + ' har ikke slået i ' + ECON.claimHours + ' timer: spil videre uden'));
    let sure = false;
    row.append(h('button', { class: 'btn alt small', onclick: e => { if (sure) return send('tact', { a: { resign: true } }); sure = true; e.currentTarget.textContent = 'Sikker? Dine brikker tages af brættet'; e.currentTarget.classList.replace('alt', 'danger'); } }, 'Giv op'));
    row.append(h('button', { class: 'btn alt small', onclick: ctx.close }, 'Luk (spillet venter)'));
  } else row.append(h('button', { class: 'btn alt', onclick: ctx.close }, 'Luk'));
  out.push(row);
  return out;
}
