// A slot machine on screen: the reels that turn and stop where the server says, the stake, and the pay table.
// slotView(id, ctx) builds it once and keeps it (the reels are moving, so it is not drawn afresh for every message).
//   ctx.send(message)        to the server
//   ctx.chips()              what the player has
//   ctx.hold(shown)          the chip counter waits for the reels: show this number meanwhile
//   ctx.release(delta)       the reels have stopped: show the real number again
import { h } from './ui.js';
import { play } from './sfx.js';
import { MACHINES, LINES, SYMBOL_NAMES, windowOf, returnOf } from '../shared/slots.js';

// ---------- the symbols, drawn as small pictures ----------
const NS = 'http://www.w3.org/2000/svg', INK = '#17121f';
const P = (d, fill, w = 2) => ['path', { d, fill, stroke: INK, 'stroke-width': w, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }];
const C = (cx, cy, r, fill, w = 2) => ['circle', { cx, cy, r, fill, stroke: INK, 'stroke-width': w }];
const E = (cx, cy, rx, ry, fill, rot = 0, w = 2) => ['ellipse', { cx, cy, rx, ry, fill, stroke: INK, 'stroke-width': w, transform: 'rotate(' + rot + ' ' + cx + ' ' + cy + ')' }];
const R = (x, y, width, height, rx, fill, w = 2, rot = '') => ['rect', { x, y, width, height, rx, fill, stroke: INK, 'stroke-width': w, transform: rot }];
const L = (d, col, w) => ['path', { d, fill: 'none', stroke: col, 'stroke-width': w, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }];
const shine = (cx, cy, r = 2) => ['circle', { cx, cy, r, fill: 'rgba(255,255,255,.8)' }];
const ring = (n, cx, cy, r1, r2, turn = 0) => 'M' + Array.from({ length: n * 2 }, (_, i) => { const a = (i / (n * 2)) * Math.PI * 2 + turn, r = i % 2 ? r2 : r1; return (cx + Math.cos(a) * r).toFixed(1) + ' ' + (cy + Math.sin(a) * r).toFixed(1); }).join(' L') + ' Z';
const gear = () => { const pts = []; for (let i = 0; i < 8; i++) for (const [da, r] of [[-0.14, 11], [-0.1, 15.5], [0.1, 15.5], [0.14, 11]]) { const a = i / 8 * Math.PI * 2 + da; pts.push((20 + Math.cos(a) * r).toFixed(1) + ' ' + (20 + Math.sin(a) * r).toFixed(1)); } return 'M' + pts.join(' L') + ' Z'; };
const ART = {
  seven: [P('M8 7 L32 7 L32 14 C25 20 22 27 21 35 L12 35 C13 26 17 20 23 15 L8 15 Z', '#e2403a'), L('M11 10 L29 10', 'rgba(255,255,255,.55)', 2)],
  cherry: [L('M13 26 C13 16 19 10 27 6 M26 27 C24 18 25 12 27 6', '#2f7d4f', 2.6), P('M27 6 C31 2 36 4 38 9 C33 11 29 9 27 6 Z', '#58b85f'), C(13, 28, 7.5, '#e2403a'), C(27, 29, 7.5, '#d8343c'), shine(10.5, 25.5), shine(24.5, 26.5)],
  lemon: [E(20, 21, 15, 10.5, '#f7d84a', -24), P('M5 27 L3 30 L7 31 Z', '#f7d84a'), P('M35 15 L38 12 L34 11 Z', '#f7d84a'), L('M13 18 C17 14 22 13 27 14', 'rgba(255,255,255,.7)', 2.4)],
  plum: [L('M21 11 C21 8 23 6 25 5', '#6b4423', 2.6), P('M25 5 C29 3 33 5 34 9 C30 10 27 8 25 5 Z', '#58b85f'), C(20, 23, 12.5, '#8a58d6'), L('M20 12 C17 18 17 28 20 35', 'rgba(60,30,110,.45)', 2), shine(14, 18, 2.6)],
  bell: [C(20, 6.5, 2.6, '#f2c33f'), P('M20 7 C13 7 10 13 10 20 C10 25 8 27 6 30 L34 30 C32 27 30 25 30 20 C30 13 27 7 20 7 Z', '#f2c33f'), C(20, 33, 3.2, '#b9641f'), L('M14 13 C13 16 13 19 13 22', 'rgba(255,255,255,.7)', 2.4)],
  star: [P(ring(5, 20, 21, 16, 7, -Math.PI / 2), '#ffd45e'), L('M15 17 L18 15', 'rgba(255,255,255,.8)', 2.4)],
  nut: [P(ring(3, 20, 20, 15.5, 15.5, 0), '#c9d0d8'), C(20, 20, 6.5, '#4a4458'), L('M11 14 L16 11', 'rgba(255,255,255,.75)', 2.4)],
  screw: [P('M16 15 L24 15 L23 33 L20 37 L17 33 Z', '#aab3bd'), L('M16.5 20 L23.5 22 M16.8 25 L23.2 27 M17 30 L23 32', INK, 1.6), R(8, 6, 24, 9.5, 3.5, '#dfe7ec'), L('M13 10.7 L27 10.7', INK, 2.4)],
  gear: [P(gear(), '#ffb347'), C(20, 20, 5.2, '#4a4458'), L('M12 12 L15 10', 'rgba(255,255,255,.7)', 2.4)],
  spring: [L('M9 7 L31 7 L9 13.5 L31 20 L9 26.5 L31 33 L9 33', INK, 6.5), L('M9 7 L31 7 L9 13.5 L31 20 L9 26.5 L31 33 L9 33', '#7fe0c3', 3)],
  battery: [R(32, 16, 4.5, 9, 1.5, '#c9d0d8'), R(6, 11, 26, 19, 3.5, '#58b85f'), P('M21 13 L14 22 L19 22 L17 29 L25 19 L20 19 Z', '#ffd45e', 1.6)],
  oil: [P('M24 19 L35 10 L37 13 L27 24 Z', '#c9d0d8'), L('M10 18 C10 10 20 10 20 18', INK, 5.5), L('M10 18 C10 10 20 10 20 18', '#aab3bd', 2.4), P('M7 18 L25 18 L27 33 L5 33 Z', '#e2574c'), P('M36 17 C38 20 39 22 36.5 24 C34 22 34.5 20 36 17 Z', '#f2c33f', 1.4), L('M10 22 L10 29', 'rgba(255,255,255,.6)', 2.4)],
  robot: [L('M20 11 L20 6', INK, 2.4), C(20, 4.6, 2.6, '#e2403a'), R(4.5, 17, 4, 8, 1.5, '#8fa0ad'), R(31.5, 17, 4, 8, 1.5, '#8fa0ad'), R(8, 11, 24, 21, 5.5, '#c9d6de'), C(14.5, 19.5, 3.8, '#fff'), C(25.5, 19.5, 3.8, '#fff'), ['circle', { cx: 15, cy: 20, r: 1.7, fill: INK }], ['circle', { cx: 25, cy: 20, r: 1.7, fill: INK }], R(13, 26, 14, 3.4, 1.7, '#2b2a36', 1.4)],
  wild: [C(20, 20, 16, '#8a58d6'), P(ring(12, 20, 20, 13.5, 11.5), '#a37cf0', 1.2), P('M22 7 L11 22 L18 22 L15 34 L29 17 L21.5 17 Z', '#ffd45e')],
  wrench: [R(17, 14, 6.5, 22, 2.5, '#aab3bd', 2, 'rotate(40 20 20)'), ['path', { d: 'M11 4 C10 13 15 17 20 17 C25 17 30 13 29 4 L24.5 4 L24.5 10 L15.5 10 L15.5 4 Z', fill: '#dfe7ec', stroke: INK, 'stroke-width': 2, 'stroke-linejoin': 'round', transform: 'rotate(40 20 20)' }]],
  pig: [P('M8 13 L7 5 L16 10 Z', '#f27aa6'), P('M32 13 L33 5 L24 10 Z', '#f27aa6'), C(20, 22, 13.5, '#ff9fc0'), E(20, 26.5, 6.5, 4.8, '#f27aa6'), ['circle', { cx: 17.8, cy: 26.5, r: 1.2, fill: INK }], ['circle', { cx: 22.2, cy: 26.5, r: 1.2, fill: INK }], ['circle', { cx: 14.5, cy: 18.5, r: 1.8, fill: INK }], ['circle', { cx: 25.5, cy: 18.5, r: 1.8, fill: INK }]],
  bar: [P('M7 30 L12 16 L28 16 L33 30 Z', '#f2c33f'), P('M12 16 L15.5 10.5 L27 10.5 L28 16 Z', '#ffe08a'), P('M28 16 L27 10.5 L31.5 24 L33 30 Z', '#d9a521'), L('M14 21 L26 21', 'rgba(255,255,255,.55)', 2.2)],
  coins: [E(20, 30, 12.5, 5, '#d9a521'), E(20, 27, 12.5, 5, '#f2c33f'), E(20, 22, 12.5, 5, '#d9a521'), E(20, 19, 12.5, 5, '#f2c33f'), E(20, 14, 12.5, 5, '#d9a521'), E(20, 11, 12.5, 5, '#ffe08a'), L('M12 10 C15 8.5 19 8.2 23 8.6', 'rgba(255,255,255,.8)', 1.8)],
  clover: [L('M20 22 C22 28 25 33 29 36', '#2f7d4f', 3), C(13.5, 14.5, 7, '#3fa55a'), C(26.5, 14.5, 7, '#3fa55a'), C(13.5, 26.5, 7, '#3fa55a'), C(26.5, 26.5, 7, '#3fa55a'), ['circle', { cx: 20, cy: 20.5, r: 4.5, fill: '#3fa55a' }], shine(11, 12, 1.8)],
  shoe: [P('M8 7 C8 26 12 35 20 35 C28 35 32 26 32 7 L25.5 7 C25.5 21 23.5 27.5 20 27.5 C16.5 27.5 14.5 21 14.5 7 Z', '#aab3bd'), ...[[11.3, 12], [12.6, 21], [28.7, 12], [27.4, 21], [16, 30], [24, 30]].map(([x, y]) => ['circle', { cx: x, cy: y, r: 1.3, fill: INK }])],
  blank: [['rect', { x: 13, y: 18.4, width: 14, height: 3.2, rx: 1.6, fill: '#cfc8dc' }]],
};
export function symbol(name) {
  const s = document.createElementNS(NS, 'svg');
  s.setAttribute('viewBox', '0 0 40 40'); s.setAttribute('role', 'img'); s.setAttribute('aria-label', SYMBOL_NAMES[name] || name);
  for (const [tag, attrs] of ART[name] || []) { const e = document.createElementNS(NS, tag); for (const k of Object.keys(attrs)) if (attrs[k] !== '') e.setAttribute(k, attrs[k]); s.append(e); }
  return s;
}
const cell = name => h('div', { class: 'sl-cell' }, symbol(name));
const num = n => String(n).replace(/\B(?=(\d{3})+$)/g, '.');
const signed = n => (n > 0 ? '+' : '') + num(n);

// ---------- one machine ----------
export function slotView(id, ctx) {
  const m = MACHINES[id], n = m.reels.length, max = m.bets[m.bets.length - 1];
  let stops = m.reels.map(r => Math.floor(Math.random() * r.length)), busy = false, free = 0, freeBet = 0, pot = 0, net = 0, waitTimer = 0, alive = true;
  let bet = 0, paysBox = null;
  try { bet = +(localStorage.getItem('slq-bet-' + id) || 0); } catch {}
  if (!m.bets.includes(bet)) bet = m.bets[Math.min(1, m.bets.length - 1)];

  const strips = m.reels.map((_, i) => h('div', { class: 'sl-strip' }, windowOf(m, i, stops[i]).map(cell)));
  const win = h('div', { class: 'sl-win' }, strips.map(sp => h('div', { class: 'sl-reel' }, sp)), n === 3 ? h('i', { class: 'sl-line' }) : null);
  const status = h('div', { class: 'status sl-status' }), betRow = h('div', { class: 'sl-bets' }), go = h('button', { class: 'btn big sl-go' }, 'Spin');
  const info = h('p', { class: 'hint center sl-info' });
  const root = h('div', { class: 'sl sl-' + id + (n === 5 ? ' five' : '') }, win, status, betRow, go, info, pays());

  function setStatus(text, tone = '') { status.textContent = text; status.className = 'status sl-status ' + tone; }
  function drawBets() {
    const chips = ctx.chips();
    betRow.replaceChildren(h('span', { class: 'sl-lbl' }, 'Indsats'), ...m.bets.map(b => h('button', { class: 'btn small' + (b === bet ? '' : ' alt'), disabled: busy || free > 0 || b > chips, onclick: () => { bet = b; try { localStorage.setItem('slq-bet-' + id, String(b)); } catch {} drawBets(); drawPays(); } }, num(b))));
    go.disabled = busy || (free <= 0 && bet > chips);
    go.textContent = free > 0 ? 'Gratis spin (' + free + ' tilbage)' : 'Spin for ' + num(bet);
    info.replaceChildren('Du står til ', h('b', { class: net > 0 ? 'up' : net < 0 ? 'down' : '' }, signed(net)), ' ved maskinerne',
      ...(m.jackpot ? [' · Jackpot ', h('b', { class: 'pot' }, num(pot)), bet < max && free <= 0 ? ' (ved indsats ' + bet + ': ' + num(Math.floor(pot * bet / max)) + ')' : ''] : []), '.');
  }

  // the pay table: what each row of symbols gives at the stake that is chosen
  function drawPays() {
    if (!paysBox) return;
    const row = (syms, text) => h('div', { class: 'sl-pay' }, h('span', { class: 'sy' }, syms.map(s => s ? h('i', {}, symbol(s)) : h('i', { class: 'any' }))), h('b', {}, text));
    const rows = [];
    if (m.lines) {
      const coin = bet / m.lines;
      rows.push(h('p', { class: 'hint' }, 'Ti linjer, hver med ' + num(coin) + ' i indsats. En linje tæller fra venstre: tre, fire eller fem ens.'));
      for (const s of Object.keys(m.pays)) rows.push(row([s, s, s], m.pays[s].map(p => num(p * coin)).join(' · ')));
      rows.push(row([m.wild], 'Jokeren står for alle andre end skruenøglen.'));
      rows.push(row([m.scatter, m.scatter, m.scatter], 'Tre, fire eller fem skruenøgler hvor som helst: ' + m.frees.join(', ') + ' gratis spins med dobbelt gevinst.'));
      rows.push(h('div', { class: 'sl-lines' }, LINES.map((l, k) => h('div', { class: 'ln', title: 'Linje ' + (k + 1) }, [0, 1, 2].map(r => h('div', {}, l.map(x => h('i', { class: x === r ? 'on' : '' }))))))));
    } else {
      for (const s of Object.keys(m.three)) rows.push(row([s, s, s], num(m.three[s] * bet)));
      if (m.two) for (const s of Object.keys(m.two)) rows.push(row([s, s, null], num(m.two[s] * bet)));
      if (m.one) for (const s of Object.keys(m.one)) rows.push(row([s, null, null], num(m.one[s] * bet)));
      if (m.any) for (const s of Object.keys(m.any)) { rows.push(row([s, s, null], num(m.any[s][2] * bet) + ' (to et sted på linjen)')); rows.push(row([s, null, null], num(m.any[s][1] * bet) + ' (én et sted på linjen)')); }
      if (m.jackpot) rows.unshift(row([m.jackpot, m.jackpot, m.jackpot], 'Jackpotten: hele puljen ved indsats ' + max + ', ellers en tilsvarende andel.'));
      rows.push(h('p', { class: 'hint' }, 'Kun den midterste linje tæller.' + (m.share ? ' ' + Math.round(m.share * 100) + ' % af hver indsats går i gruppens jackpot.' : '')));
    }
    rows.push(h('p', { class: 'hint' }, 'I længden betaler maskinen ' + (returnOf(id).total * 100).toFixed(1).replace('.', ',') + ' % af indsatserne tilbage.'));
    paysBox.replaceChildren(...rows);
  }
  function pays() {
    paysBox = h('div', {});
    const d = h('details', { class: 'sl-pays' }, h('summary', {}, 'Gevinsttabel'), paysBox);
    d.addEventListener('toggle', () => { if (d.open) drawPays(); });
    return d;
  }

  // The reels turn downwards and stop one after the other, the last one when m.spinMs has passed.
  function turn(to, done) {
    const gap = n === 5 ? 260 : 320;
    strips.forEach((sp, i) => {
      const r = m.reels[i], len = r.length, extra = 10 + i * 4, old = windowOf(m, i, stops[i]);
      const seq = [...windowOf(m, i, to[i]), ...Array.from({ length: extra }, (_, k) => r[(to[i] + 2 + k) % len]), ...old];
      sp.replaceChildren(...seq.map(cell));
      const from = -(seq.length - 3) / seq.length * 100, dur = Math.max(400, m.spinMs - (n - 1 - i) * gap);
      const a = sp.animate([{ transform: 'translateY(' + from + '%)' }, { transform: 'translateY(0)' }], { duration: dur, easing: 'cubic-bezier(.16,.62,.3,1.045)', fill: 'both' });
      a.onfinish = () => { if (!alive) return; sp.replaceChildren(...windowOf(m, i, to[i]).map(cell)); a.cancel(); play('click'); if (i === n - 1) done(); };
    });
    stops = to;
  }
  function mark(lines) {
    const cells = strips.map(sp => [...sp.children]);
    for (const l of lines) {
      if (m.lines) LINES[l.line].slice(0, l.n).forEach((r, i) => cells[i][r] && cells[i][r].classList.add('hit'));
      else cells.forEach((c, i) => { if (c[1] && (l.n === 3 || (m.any ? m.reels[i][stops[i]] === l.sym : i < l.n))) c[1].classList.add('hit'); });
    }
  }

  function spin() {
    if (busy || !alive) return;
    const stake = free > 0 ? 0 : bet;
    if (stake > ctx.chips()) return;
    busy = true; setStatus(free > 0 ? 'Gratis spin …' : '', ''); drawBets();
    ctx.hold(ctx.chips() - stake);
    if (!ctx.send({ t: 'spin', m: id, bet })) { busy = false; ctx.release(0); setStatus('Ingen forbindelse lige nu.', 'lose'); drawBets(); return; }
    clearTimeout(waitTimer);
    waitTimer = setTimeout(() => { if (busy && alive) { busy = false; ctx.release(0); setStatus('Maskinen svarede ikke. Prøv igen.', 'lose'); drawBets(); } }, 4000);
  }
  go.addEventListener('click', spin);

  drawBets();
  return {
    id, el: root,
    // the server's first word about this machine: the jackpot, free spins that were left from last time
    init(s) { pot = s.pot; free = s.free; freeBet = s.bet; net = s.net || 0; if (free > 0) setStatus('Du har ' + free + ' gratis spin til gode (indsats ' + num(freeBet) + ').', 'win'); else setStatus('Tryk på Spin.'); drawBets(); go.focus(); },
    setPot(v) { pot = v; if (!busy) drawBets(); },
    refused() { clearTimeout(waitTimer); if (busy) { busy = false; ctx.release(0); drawBets(); } },
    // the answer to a spin: where the reels stop and what that paid
    spun(s) {
      clearTimeout(waitTimer);
      if (!alive) return;
      turn(s.stops, () => {
        busy = false; pot = s.pot; net = s.net; free = s.free; if (s.frees) freeBet = s.bet;
        mark(s.lines);
        ctx.release(s.win - (s.was ? 0 : s.bet));
        if (s.jack) { setStatus('JACKPOT! ' + num(s.win) + ' jetoner', 'win jack'); play('win'); setTimeout(() => play('win'), 450); }
        else if (s.frees) { setStatus((s.win ? '+' + num(s.win) + ' · ' : '') + s.frees + ' gratis spins med dobbelt gevinst!', 'win'); play('win'); }
        else if (s.win) { setStatus('+' + num(s.win) + ' jetoner' + (s.was ? ' (gratis spin)' : ''), 'win'); play(s.win >= s.bet * 10 ? 'win' : 'coin'); }
        else setStatus(s.was && !free ? 'De gratis spins er brugt.' : 'Ingen gevinst.', '');
        drawBets();
        if (free > 0) waitTimer = setTimeout(spin, s.win ? 1300 : 800);          // free spins run by themselves
      });
    },
    close() { alive = false; clearTimeout(waitTimer); },
  };
}
