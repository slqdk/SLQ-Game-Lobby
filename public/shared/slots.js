// The slot machines of the casino wing: their reels, what pays what, and what one spin gives. Both sides read this
// file: the server spins (with its own dice) and pays; the browser shows the same reels and the pay table.
//
// A reel is a strip of symbols that turns; a spin stops every reel at a place of its own, picked evenly. Three rows
// of each reel are seen: the stop itself in the middle, its neighbours above and below.
//   cherry  three reels, one line (the middle row). Low stakes, small wins often.
//   robot   five reels, ten lines, a joker that stands in for anything, and wrenches that give free spins.
//   pig     three reels, one line, seldom and big; a share of every stake goes into the group's jackpot.

const strip = (text, names) => [...text].map(ch => names[ch]);
const CHERRY = { 7: 'seven', C: 'cherry', L: 'lemon', P: 'plum', B: 'bell', S: 'star' };
const ROBOT = { N: 'nut', S: 'screw', G: 'gear', F: 'spring', B: 'battery', O: 'oil', R: 'robot', W: 'wild', X: 'wrench' };
const PIG = { G: 'pig', R: 'bar', M: 'coins', K: 'clover', H: 'shoe', X: 'blank' };

export const SYMBOL_NAMES = {
  seven: 'Syver', cherry: 'Kirsebær', lemon: 'Citron', plum: 'Blomme', bell: 'Klokke', star: 'Stjerne',
  nut: 'Møtrik', screw: 'Skrue', gear: 'Tandhjul', spring: 'Fjeder', battery: 'Batteri', oil: 'Oliekande', robot: 'Robot', wild: 'Joker', wrench: 'Skruenøgle',
  pig: 'Gris', bar: 'Guldbarre', coins: 'Mønter', clover: 'Firkløver', shoe: 'Hestesko', blank: 'Nitte',
};

// The ten lines of the five-reel machine: which row (0 top, 1 middle, 2 bottom) of each reel a line goes through.
export const LINES = [[1, 1, 1, 1, 1], [0, 0, 0, 0, 0], [2, 2, 2, 2, 2], [0, 1, 2, 1, 0], [2, 1, 0, 1, 2], [0, 0, 1, 0, 0], [2, 2, 1, 2, 2], [1, 0, 0, 0, 1], [1, 2, 2, 2, 1], [1, 0, 1, 2, 1]];

export const MACHINES = {
  cherry: {
    id: 'cherry', name: 'Kirsebærhaven', station: 'slot1', bets: [1, 2, 5, 10, 25], spinMs: 1500,
    about: 'Tre hjul og én linje. Små indsatser, og tit en lille gevinst.',
    reels: ['C7LPCBCSLPCBLCPCS', '7CSPCLCBPLCSBCPLC', '7PCLPBSLP7CPLBPS'].map(t => strip(t, CHERRY)),
    // three of a kind on the line; cherries also pay from the left when there are only two, or one
    three: { seven: 100, star: 40, bell: 20, plum: 12, lemon: 8, cherry: 6 }, two: { cherry: 3 }, one: { cherry: 1 },
  },
  robot: {
    id: 'robot', name: 'Robotværkstedet', station: 'slot2', bets: [10, 20, 50, 100], spinMs: 2200, lines: 10,
    about: 'Fem hjul og ti linjer. Jokeren står for alt andet, og tre skruenøgler giver gratis spins med dobbelt gevinst.',
    reels: ['NSGXFSNBSOGFSNSGFBSONGSFSNGBFSOR', 'SNSWXFOGBSNSFGRNSOBFSGWNSFSGNOBSFG', 'NSWGFXSNBSOGFSNSGFWBSOXNGSFSNGBFSOR', 'SFGRNSOBFSGWNSFSGNOBSFGSNSWXFOGBSN', 'NSGXFSBOGNSFSGFNSBOSGFNSGBSFOR'].map(t => strip(t, ROBOT)),
    // per line, for three, four and five of a kind from the left, in stakes per line
    pays: { robot: [40, 150, 750], oil: [25, 80, 300], battery: [20, 60, 200], gear: [10, 30, 100], spring: [10, 30, 100], screw: [5, 20, 60], nut: [5, 20, 60] },
    wild: 'wild', scatter: 'wrench', frees: [10, 15, 25], freeMult: 2,          // free spins for three, four, five wrenches anywhere
  },
  pig: {
    id: 'pig', name: 'Sparegrisen', station: 'slot3', bets: [10, 25, 50], spinMs: 1700,
    about: 'Tre hjul og én linje. Sjældne, store gevinster – og tre grise tømmer gruppens jackpot.',
    reels: ['GHKMXHRHXKHGHMXHKHX', 'XHKHXMHXHKHXRHMKGXH', 'KGXHMKRXHKXKHMKXHKX'].map(t => strip(t, PIG)),
    three: { bar: 150, coins: 40, clover: 15, shoe: 8 }, any: { pig: [0, 2, 10] },        // one or two pigs anywhere on the line
    jackpot: 'pig', share: 0.04, seed: 1000,            // 4 % of every stake goes into the pot, which starts at 1000
  },
};
export const MACHINE_IDS = Object.keys(MACHINES);

// The symbols seen on reel i when it has stopped at `stop`: [above, on the line, below].
export const windowOf = (m, i, stop) => { const r = m.reels[i], n = r.length; return [r[(stop - 1 + n) % n], r[stop], r[(stop + 1) % n]]; };

// What a line of five pays, in stakes per line: [symbol, how many, pay] or null.
function lineOf(m, syms) {
  let k = 0;
  while (k < syms.length && syms[k] === m.wild) k++;
  let best = k >= 3 ? ['robot', k, m.pays.robot[k - 3]] : null;                 // jokers alone count as robots
  if (k < syms.length && m.pays[syms[k]]) {
    const s = syms[k];
    let n = k;
    while (n < syms.length && (syms[n] === s || syms[n] === m.wild)) n++;
    if (n >= 3 && (!best || m.pays[s][n - 3] > best[2])) best = [s, n, m.pays[s][n - 3]];
  }
  return best;
}

// What the reels pay where they have stopped. bet: the whole stake of the spin. free: a free spin (five-reel machine).
// Returns { stops, win, lines: [{ line, sym, n, pay }], frees (free spins won), jack (the jackpot is hit) }.
export function settle(id, bet, stops, free = false) {
  const m = MACHINES[id], out = { stops, win: 0, lines: [], frees: 0, jack: false };
  if (m.lines) {
    const win = m.reels.map((_, i) => windowOf(m, i, stops[i])), coin = bet / m.lines * (free ? m.freeMult : 1);
    LINES.forEach((rows, line) => {
      const hit = lineOf(m, rows.map((r, i) => win[i][r]));
      if (hit) { const pay = Math.round(hit[2] * coin); out.win += pay; out.lines.push({ line, sym: hit[0], n: hit[1], pay }); }
    });
    const wrenches = win.flat().filter(s => s === m.scatter).length;
    if (!free && wrenches >= 3) out.frees = m.frees[Math.min(5, wrenches) - 3];
    return out;
  }
  const [a, b, c] = stops.map((s, i) => m.reels[i][s]);
  let pay = 0, sym = '', n = 0;
  if (a === b && b === c && m.jackpot === a) { out.jack = true; sym = a; n = 3; }
  else if (a === b && b === c && m.three[a]) { pay = m.three[a]; sym = a; n = 3; }
  else if (m.any) { for (const s of Object.keys(m.any)) { const k = (a === s) + (b === s) + (c === s); if (m.any[s][k]) { pay = m.any[s][k]; sym = s; n = k; } } }
  else if (m.two && a === b && m.two[a]) { pay = m.two[a]; sym = a; n = 2; }
  else if (m.one && m.one[a]) { pay = m.one[a]; sym = a; n = 1; }
  if (pay || out.jack) { out.win = pay * bet; out.lines.push({ line: 0, sym, n, pay: out.win }); }
  return out;
}
export const spin = (id, bet, rng, free = false) => settle(id, bet, MACHINES[id].reels.map(r => Math.floor(rng() * r.length)), free);

// How much of the stakes a machine pays back in the long run, worked out exactly from its reels:
// { base (ordinary wins), free (free spins), pot (what goes into the jackpot), total, hit (how often a spin pays; three reels only), jack (the chance of the jackpot) }.
export function returnOf(id) {
  const m = MACHINES[id];
  if (!m.lines) {
    let sum = 0, hit = 0, jack = 0, n = 0;
    for (let a = 0; a < m.reels[0].length; a++) for (let b = 0; b < m.reels[1].length; b++) for (let c = 0; c < m.reels[2].length; c++) {
      const r = settle(id, 1, [a, b, c]);
      n++; sum += r.win; if (r.win || r.jack) hit++; if (r.jack) jack++;
    }
    const pot = m.share || 0;
    return { base: sum / n, free: 0, pot, total: sum / n + pot, hit: hit / n, jack: jack / n };
  }
  // every row of a reel shows each place of the strip equally often, so one line is worth the same as any other
  const kinds = [...new Set(m.reels.flat())], share = m.reels.map(r => kinds.map(k => r.filter(s => s === k).length / r.length));
  let line = 0;
  const walk = (i, syms, w) => {
    if (i === m.reels.length) { const hit = lineOf(m, syms); if (hit) line += w * hit[2]; return; }
    kinds.forEach((k, j) => { if (share[i][j]) walk(i + 1, [...syms, k], w * share[i][j]); });
  };
  walk(0, [], 1);
  // how many wrenches the fifteen places show: per reel exactly, then all reels together
  let dist = [1];
  m.reels.forEach((r, i) => {
    const per = [0, 0, 0, 0];
    for (let s = 0; s < r.length; s++) per[windowOf(m, i, s).filter(x => x === m.scatter).length] += 1 / r.length;
    const next = new Array(dist.length + 3).fill(0);
    dist.forEach((p, a) => per.forEach((q, b) => { next[a + b] += p * q; }));
    dist = next;
  });
  const frees = dist.reduce((a, p, k) => a + (k >= 3 ? p * m.frees[Math.min(5, k) - 3] : 0), 0);
  return { base: line, free: frees * m.freeMult * line, pot: 0, total: line * (1 + frees * m.freeMult), hit: 0, jack: 0, trigger: dist.slice(3).reduce((a, b) => a + b, 0) };
}
