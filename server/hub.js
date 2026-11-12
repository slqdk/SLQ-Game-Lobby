// The lobby itself: accounts, groups, the clubhouse room, chat, chips, teasing and the game tables.
// It knows nothing about sockets or files: server.js hands it a store, connections ({ send(text), close() })
// and the messages that arrive. That also makes it easy to test (tools/selftest.mjs).
import crypto from 'node:crypto';
import { ECON, LIMITS, EMOTES, PRANKS, PRANK_GAP, ITEMS, DRINKS, BAR, cleanLook, randomLook, nameOk } from '../public/shared/defs.js';
import { ROOM, STATION, findPath, posAt, pathFrom, nearestFree } from '../public/shared/room.js';
import { GAMES, GameError } from '../public/shared/games/index.js';
import { hashText } from '../public/shared/util.js';
import { randomCode } from './store.js';
import { GameError as EagleEyeError } from './eagleeye.js';

export class LobbyError extends Error {}
const fail = msg => { throw new LobbyError(msg); };
const J = JSON.stringify;
const norm = c => String(c ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
// An entry of one of the fixed lists, by a key from the browser (only a text counts as a key).
const pick = (list, k) => typeof k === 'string' && Object.hasOwn(list, k) ? list[k] : null;
const HOUR = 3600e3;

// ee: the EagleEye Commander matches (server/eagleeye.js), or null to run without that game.
export function createHub({ store, ee = null, version = '', now = () => Date.now(), botDelay = [700, 1500], rand = Math.random }) {
  const conns = new Map();        // user id -> the connection that user is on (one at a time)
  const rooms = new Map();        // group id -> Map(user id -> presence): who is in that clubhouse right now
  const invites = new Map();      // invite code -> group id
  const byName = new Map();       // lower-case name -> user
  const fails = new Map(), made = new Map();     // per address: wrong passwords and codes, new accounts
  const buzz = new Map();         // user id -> { v, at }: how merry the bar has made somebody (it wears off; not stored)

  for (const u of store.users.values()) byName.set(u.name.toLowerCase(), u);
  for (const g of store.groups.values()) invites.set(g.invite, g.id);

  // ---------- accounts ----------
  const sign = s => crypto.createHmac('sha256', store.config.secret).update(s).digest('base64url').slice(0, 32);
  const tokenFor = u => { const body = u.id + '.' + u.gen; return body + '.' + sign(body); };
  function userFromToken(tok) {
    const m = /^(\d+)\.(\d+)\.([\w-]{32})$/.exec(String(tok ?? ''));
    if (!m || !crypto.timingSafeEqual(Buffer.from(sign(m[1] + '.' + m[2])), Buffer.from(m[3]))) return null;
    const u = store.users.get(+m[1]);
    return u && u.gen === +m[2] ? u : null;
  }
  const hashPass = (pass, salt = crypto.randomBytes(12).toString('hex')) => ({ salt, hash: crypto.scryptSync(pass, salt, 32).toString('hex') });
  const passOk = (u, pass) => typeof pass === 'string' && pass.length <= LIMITS.passMax
    && crypto.timingSafeEqual(Buffer.from(hashPass(pass, u.salt).hash), Buffer.from(u.hash));
  const checkPass = p => typeof p === 'string' && p.length >= LIMITS.passMin && p.length <= LIMITS.passMax ? p : fail('Kodeordet skal være mindst ' + LIMITS.passMin + ' tegn.');
  const today = () => { const d = new Date(now()); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };

  function throttle(ip) {
    const f = fails.get(ip);
    if (f && f.n >= 8 && now() - f.at < 600e3) fail('For mange forsøg. Vent ti minutter.');
    if (f && now() - f.at >= 600e3) fails.delete(ip);
  }
  function failed(ip) { const f = fails.get(ip) || { n: 0, at: now() }; f.n++; fails.set(ip, f); }

  const mine = u => ({ id: u.id, name: u.name, chips: u.chips, items: u.items, look: u.look, stats: u.stats, dnd: !!u.dnd, creator: !!u.creator });
  const groupsOf = uid => [...store.groups.values()].filter(g => g.members[uid]);
  const roleOf = (g, uid) => g.owner === uid ? 'owner' : g.members[uid] ? g.members[uid].role : '';
  const isAdmin = (g, uid) => roleOf(g, uid) === 'owner' || roleOf(g, uid) === 'admin';
  const groupList = u => groupsOf(u.id).map(g => ({
    id: g.id, name: g.name, role: roleOf(g, u.id), n: Object.keys(g.members).length, on: rooms.has(g.id) ? rooms.get(g.id).size : 0,
    turn: Object.values(g.tables).filter(t => myTurn(t, u.id)).length + (ee ? ee.ofGroup(g.id).filter(m => eeTurn(m, u.id)).length : 0),
  }));

  const api = {
    health: () => ({ ok: true, version, users: store.users.size, groups: store.groups.size, online: conns.size }),

    // What an invitation leads to, shown before somebody makes an account.
    invite(b) {
      const g = store.groups.get(invites.get(norm(b.code)));
      if (!g) fail('Invitationen findes ikke længere. Bed om et nyt link.');
      return { group: g.name, members: Object.keys(g.members).length, by: store.users.get(g.owner).name };
    },

    // A new account needs a code: an invitation to a group, or the installation code (which also lets one make groups).
    register(b, ip) {
      throttle(ip);
      const name = String(b.name ?? '').trim(), code = norm(b.code);
      if (!nameOk(name, LIMITS.nameMin, LIMITS.nameMax)) fail('Navnet skal være ' + LIMITS.nameMin + '–' + LIMITS.nameMax + ' tegn: bogstaver, tal, mellemrum, punktum eller bindestreg.');
      const pass = checkPass(b.pass);
      const creator = code && code === norm(store.config.code), g = creator ? null : store.groups.get(invites.get(code));
      if (!creator && !g) { failed(ip); fail('Koden passer ikke. Brug linket fra din invitation, eller installationskoden.'); }
      if (byName.has(name.toLowerCase())) fail('Navnet er optaget. Vælg et andet.');
      if (g && Object.keys(g.members).length >= LIMITS.members) fail('Gruppen er fuld.');
      const m = made.get(ip);
      if (m && now() - m.at < HOUR && m.n >= 10) fail('Der er lavet mange konti herfra. Vent en times tid.');
      if (!m || now() - m.at >= HOUR) made.set(ip, { n: 1, at: now() }); else m.n++;
      const id = store.newUserId();
      const u = { id, name, ...hashPass(pass), gen: 1, created: now(), creator: !!creator, chips: ECON.start, items: [],
        look: randomLook(hashText(name) + id * 7919), stats: {}, daily: today(), seen: now(), dnd: false };
      store.users.set(id, u); byName.set(name.toLowerCase(), u); store.saveUsers();
      if (g) addMember(g, u);
      return { token: tokenFor(u), id, name };
    },

    login(b, ip) {
      throttle(ip);
      const u = byName.get(String(b.name ?? '').trim().toLowerCase());
      if (!u || !passOk(u, b.pass)) { failed(ip); fail('Forkert navn eller kodeord.'); }
      return { token: tokenFor(u), id: u.id, name: u.name };
    },

    // For the one who runs the server (tools/admin.mjs): needs a key made from the secret in config.json.
    //   users: who has an account · pass: a new, random password for somebody who forgot theirs
    admin(b, ip) {
      throttle(ip);
      const key = sign('admin:' + today());
      if (typeof b.key !== 'string' || b.key.length !== key.length || !crypto.timingSafeEqual(Buffer.from(b.key), Buffer.from(key))) { failed(ip); fail('Ingen adgang.'); }
      if (b.op === 'users') return { users: [...store.users.values()].map(u => ({ name: u.name, seen: u.seen, chips: u.chips, groups: groupsOf(u.id).map(g => g.name) })) };
      if (b.op === 'pass') {
        const u = byName.get(String(b.name ?? '').trim().toLowerCase());
        if (!u) fail('Der er ingen konto med det navn.');
        const pass = randomCode(4).toLowerCase() + '-' + randomCode(4).toLowerCase() + '-' + randomCode(4).toLowerCase();
        Object.assign(u, hashPass(pass));
        u.gen++; store.saveUsers();
        const c = conns.get(u.id);
        if (c) { c.send(J({ t: 'bye', why: 'login' })); c.close(); }
        return { name: u.name, pass };
      }
      fail('Ukendt kommando.');
    },
  };

  // ---------- connections ----------
  function connect(send, close, ip = '') {
    return { send, close, ip, user: null, gid: null, budget: 60, budgetAt: now(), said: [], emoAt: 0, prankAt: 0, drinkAt: 0, invAt: 0, badCodes: 0 };
  }

  function message(conn, text) {
    const t = now();
    conn.budget = Math.min(60, conn.budget + (t - conn.budgetAt) / 1000 * 25); conn.budgetAt = t;
    if (--conn.budget < 0) { if (conn.budget < -200) conn.close(); return; }       // talking too fast: not heard
    let m;
    try { m = JSON.parse(text); } catch { return; }
    if (!m || typeof m !== 'object' || typeof m.t !== 'string') return;
    const h = Object.hasOwn(on, m.t) ? on[m.t] : null;
    if (!h || (!conn.user && m.t !== 'hello')) return;
    try { h(conn, m); }
    catch (e) {
      if (!(e instanceof LobbyError)) console.error(e);
      conn.send(J({ t: 'err', msg: e instanceof LobbyError ? e.message : 'Serverfejl.', re: m.t }));
    }
  }

  function disconnect(conn) {
    const u = conn.user;
    if (!u || conns.get(u.id) !== conn) return;
    leaveRoom(conn);
    conns.delete(u.id); conn.user = null;
    u.seen = now(); store.saveUsers();
  }

  // ---------- the room ----------
  const cast = (gid, obj, except = 0) => {
    const room = rooms.get(gid);
    if (!room) return;
    const s = J(obj);
    for (const p of room.values()) if (p.u.id !== except) p.conn.send(s);
  };
  const presOf = conn => conn.gid && rooms.has(conn.gid) ? rooms.get(conn.gid).get(conn.user.id) : null;
  const need = conn => presOf(conn) || fail('Gå ind i klubhuset først.');
  const groupOf = conn => store.groups.get(conn.gid);
  const here = p => posAt(p.path, (now() - p.t0) / 1000 * ROOM.speed);

  function member(g, uid) {
    const u = store.users.get(uid), p = rooms.has(g.id) ? rooms.get(g.id).get(uid) : null;
    const out = { id: uid, name: u.name, role: roleOf(g, uid), look: u.look, chips: u.chips, dnd: !!u.dnd, seen: u.seen, stats: u.stats, on: !!p };
    if (p) {
      out.p = pathFrom(p.path, (now() - p.t0) / 1000 * ROOM.speed); out.sit = p.sit; out.open = p.open; out.busy = p.busy;
      out.fx = Object.entries(p.fx).filter(e => e[1] > now()).map(e => [e[0], e[1] - now()]);
      out.drink = p.drink && p.drink[1] > now() ? [p.drink[0], p.drink[1] - now()] : null; out.buzz = buzzOf(uid);
    }
    return out;
  }

  // Merriness: goes up with what one drinks and wears off by itself.
  const buzzOf = uid => { const b = buzz.get(uid); return b ? Math.round(Math.max(0, b.v - (now() - b.at) / (BAR.soberMin * 60e3)) * 10) / 10 : 0; };
  const addBuzz = (uid, d) => buzz.set(uid, { v: Math.min(BAR.buzzMax, Math.max(0, buzzOf(uid) + d)), at: now() });
  // At the bar: on a bar stool, or standing in front of the counter (also while still walking up to it).
  function atBar(p) {
    const st = STATION.bar, e = p.path[p.path.length - 1];
    return (p.sit && p.sit[0] === 'bar') || (e[0] > st.box[0] - 1.5 && e[0] < st.box[0] + st.box[2] + 1.5 && e[1] < st.use[1] + 1.6);
  }

  function leaveRoom(conn) {
    const gid = conn.gid, room = rooms.get(gid);
    conn.gid = null;
    if (!room || !conn.user || !room.has(conn.user.id) || room.get(conn.user.id).conn !== conn) return;
    room.delete(conn.user.id);
    conn.user.seen = now();
    cast(gid, { t: 'off', u: conn.user.id, seen: now() });
    if (!room.size) rooms.delete(gid);
  }

  // Sends somebody walking. `sit` ([station, seat]) makes them sit down when they get there.
  function walk(gid, p, to, sit = null) {
    const [x, y] = here(p);
    p.path = findPath([x, y], to); p.t0 = now(); p.sit = sit;
    cast(gid, { t: 'mv', u: p.u.id, p: p.path, sit });
  }
  function standUp(gid, p) {
    if (!p.sit) return;
    const [x, y] = here(p);
    p.path = [[x, y]]; p.t0 = now(); p.sit = null;
    cast(gid, { t: 'mv', u: p.u.id, p: p.path, sit: null });
  }
  function freeSeat(gid, st, uid, want = -1) {
    const taken = new Set();
    for (const q of rooms.get(gid).values()) if (q.sit && q.sit[0] === st.id && q.u.id !== uid) taken.add(q.sit[1]);
    if (want >= 0 && want < st.seats.length && !taken.has(want)) return want;
    for (let i = 0; i < st.seats.length; i++) if (!taken.has(i)) return i;
    return -1;
  }

  // Busy with something that is played on a page of its own (EagleEye Commander, the shooter): the avatar goes to
  // that piece of furniture and stays there until the player comes back.
  function occupy(g, p, stationId, what) {
    if (p.open) closeTable(g, p);
    if (p.busy === what) return;
    p.busy = what;
    const st = STATION[stationId], seat = st.seats ? freeSeat(g.id, st, p.u.id) : -1;
    if (seat >= 0) walk(g.id, p, st.seats[seat], [st.id, seat]);
    else walk(g.id, p, [st.use[0] + (rand() - 0.5) * 2, st.use[1] + rand() * 0.7]);
    cast(g.id, { t: 'mem', m: { id: p.u.id, busy: what } });
  }
  function release(g, p) {
    if (!p.busy) return;
    p.busy = ''; standUp(g.id, p);
    cast(g.id, { t: 'mem', m: { id: p.u.id, busy: '' } });
  }

  // Tells a player what changed about them, and the room how many chips they have now.
  function pushMe(u) {
    store.saveUsers();
    const c = conns.get(u.id);
    if (!c) return;
    c.send(J({ t: 'me', me: mine(u) }));
    if (c.gid) cast(c.gid, { t: 'mem', m: { id: u.id, chips: u.chips, stats: u.stats } }, u.id);
  }

  function addChat(g, u, s) {
    const msg = { id: ++g.chatSeq, u: u ? u.id : 0, n: u ? u.name : '', s, t: now() };
    g.chat.push(msg);
    if (g.chat.length > LIMITS.chatKeep) g.chat.splice(0, g.chat.length - LIMITS.chatKeep);
    store.saveGroup(g);
    cast(g.id, { t: 'chat', m: msg });
  }

  // ---------- groups ----------
  const newInvite = () => { for (;;) { const c = randomCode(8); if (!invites.has(c) && c !== norm(store.config.code)) return c; } };

  function addMember(g, u) {
    g.members[u.id] = { role: 'member', joined: now() };
    store.saveGroup(g);
    cast(g.id, { t: 'mem', m: member(g, u.id) });
    addChat(g, null, u.name + ' er kommet med i gruppen.');
  }

  // Takes somebody out of a group: off the tables, out of the room, off the list.
  function removeMember(g, uid, text) {
    for (const t of Object.values(g.tables)) { const seat = t.seats.findIndex(s => s.u === uid && !s.left); if (seat >= 0) leaveSeat(g, t, seat); }
    const room = rooms.get(g.id), p = room && room.get(uid);
    if (p) {
      room.delete(uid); p.conn.gid = null;
      p.conn.send(J({ t: 'out', g: g.id }));
      if (!room.size) rooms.delete(g.id);
    }
    delete g.members[uid];
    store.saveGroup(g);
    cast(g.id, { t: 'gone', u: uid });
    if (text) addChat(g, null, text);
    const c = conns.get(uid);
    if (c) c.send(J({ t: 'groups', groups: groupList(store.users.get(uid)) }));
  }

  function deleteGroup(g) {
    for (const t of Object.values(g.tables)) refund(t);
    if (ee) ee.dropGroup(g.id);
    const room = rooms.get(g.id), people = Object.keys(g.members).map(Number);
    if (room) for (const p of room.values()) { p.conn.gid = null; p.conn.send(J({ t: 'out', g: g.id })); }
    rooms.delete(g.id); invites.delete(g.invite); store.dropGroup(g.id);
    for (const uid of people) { const c = conns.get(uid); if (c) c.send(J({ t: 'groups', groups: groupList(store.users.get(uid)) })); }
  }

  // ---------- tables ----------
  const myTurn = (t, uid) => t.phase === 'play' && (s => s >= 0 && t.seats[s].u === uid)(GAMES[t.game].turn(t.state));
  const others = (t, seat) => t.seats.map((_, i) => i).filter(i => i !== seat);
  const tableOf = (g, id) => (Number.isInteger(id) && Object.hasOwn(g.tables, id) && g.tables[id]) || fail('Bordet findes ikke længere.');

  const tableSum = t => ({
    id: t.id, game: t.game, phase: t.phase, stake: t.stake, pot: t.pot, host: t.host, n: t.n,
    seats: t.seats.map(s => ({ u: s.u, n: s.n, bot: s.bot || 0, left: s.left ? 1 : 0 })),
    turn: t.phase === 'play' ? GAMES[t.game].turn(t.state) : -1, turnAt: t.turnAt, at: t.endAt || t.created,
    res: t.res || null, again: Object.keys(t.again || {}).map(Number),
  });
  const tableView = (t, uid) => {
    const seat = t.seats.findIndex(s => s.u === uid);
    return { ...tableSum(t), me: seat, v: t.state ? GAMES[t.game].view(t.state, seat) : null };
  };
  function pushTable(g, t) {
    store.saveGroup(g);
    const room = rooms.get(g.id);
    if (!room) return;
    cast(g.id, { t: 'tb', tb: tableSum(t) });
    for (const p of room.values()) if (p.open === t.id) p.conn.send(J({ t: 'tv', tv: tableView(t, p.u.id) }));
  }
  function dropTable(g, t) {
    delete g.tables[t.id];
    store.saveGroup(g);
    const room = rooms.get(g.id);
    if (!room) return;
    for (const p of room.values()) if (p.open === t.id) { p.open = 0; standUp(g.id, p); cast(g.id, { t: 'mem', m: { id: p.u.id, open: 0 } }); }
    cast(g.id, { t: 'tbx', id: t.id });
  }
  const give = (uid, n) => { const u = store.users.get(uid); if (u && n) { u.chips += n; pushMe(u); } };
  // Hands back what is on the table: the stakes while it waits or runs, the rematch stakes when it is over.
  function refund(t) {
    if (t.phase === 'over') for (const uid of Object.keys(t.again || {})) give(+uid, t.stake);
    else for (const s of t.seats) if (s.u) give(s.u, t.stake);
    t.pot = 0; t.again = {};
  }

  function sitDown(t, u) {
    u.chips -= t.stake; t.pot += t.stake;
    t.seats.push({ u: u.id, n: u.name });
    pushMe(u);
  }

  function start(g, t) {
    t.state = GAMES[t.game].setup(t.seats.length, { first: t.first % t.seats.length }, rand);
    t.phase = 'play'; t.turnAt = now(); t.res = null; t.again = {}; t.moves = 0; t.endAt = 0; t.n++;
    botSoon(g, t);
  }

  function play(g, t, seat, a) {
    try { GAMES[t.game].act(t.state, seat, a, rand); }
    catch (e) { if (e instanceof GameError) fail(e.message); throw e; }
    t.turnAt = now(); t.moves++;
    const res = GAMES[t.game].result(t.state);
    if (res) finish(g, t, res); else { pushTable(g, t); botSoon(g, t); }
  }

  // The game is over: pay out the pot, add the rewards, count the result, tell the room.
  function finish(g, t, res) {
    const game = GAMES[t.game], robot = t.seats.some(s => s.bot), winners = res.draw ? t.seats.map((_, i) => i) : res.win;
    const share = winners.length ? Math.floor(t.pot / winners.length) : 0, rest = t.pot - share * winners.length;
    const real = t.moves >= t.seats.length * 3;       // a game given up at once earns nothing
    const pay = t.seats.map((s, i) => {
      const u = s.u && store.users.get(s.u);
      if (!u) return 0;
      const won = !res.draw && res.win.includes(i);
      let gain = winners.includes(i) ? share + (i === winners[0] ? rest : 0) : 0;
      if (real) gain += robot ? (won ? ECON.botWin : 0) : res.draw ? ECON.draw : won ? ECON.win : ECON.loss;
      const st = u.stats[t.game] || (u.stats[t.game] = { p: 0, w: 0, d: 0 });
      if (real) { st.p++; if (res.draw) st.d++; else if (won) st.w++; }
      u.chips += gain;
      pushMe(u);
      return gain;
    });
    t.phase = 'over'; t.pot = 0; t.endAt = now(); t.again = {};
    t.res = { win: res.win, draw: !!res.draw, why: res.why || '', by: res.by ?? -1, pay };
    if (!robot) {
      const names = l => l.map(i => t.seats[i].n).join(' og '), los = others(t, -1).filter(i => !res.win.includes(i));
      const pot = share ? ' og fik puljen på ' + (share + rest) + ' jetoner' : '';
      addChat(g, null, res.draw ? names(winners) + ' spillede uafgjort i ' + game.name + '.'
        : res.why === 'resign' ? names(los) + ' gav op mod ' + names(res.win) + ' i ' + game.name + '.'
        : res.why === 'time' ? names(res.win) + ' fik sejren i ' + game.name + ', fordi ' + names(los) + ' ikke rykkede i tide.'
        : names(res.win) + ' vandt over ' + names(los) + ' i ' + game.name + pot + '.');
    }
    pushTable(g, t);
  }

  // The house robot thinks a moment, then moves.
  function botSoon(g, t) {
    if (t.phase !== 'play') return;
    const game = GAMES[t.game], seat = game.turn(t.state);
    if (seat < 0 || !t.seats[seat].bot) return;
    const run = () => {
      if (g.tables[t.id] !== t || t.phase !== 'play' || game.turn(t.state) !== seat) return;
      try { play(g, t, seat, game.bot(t.state, seat, t.seats[seat].bot, rand)); } catch (e) { console.error('robot:', e); }
    };
    if (!botDelay) run();
    else { const tm = setTimeout(run, botDelay[0] + rand() * (botDelay[1] - botDelay[0])); if (tm.unref) tm.unref(); }
  }

  // Leaving a seat: before the start the stake comes back, during a game it is giving up.
  function leaveSeat(g, t, seat) {
    const s = t.seats[seat];
    if (t.phase === 'open') {
      t.seats.splice(seat, 1); t.pot -= t.stake; give(s.u, t.stake);
      if (!t.seats.some(q => q.u)) return dropTable(g, t);
      if (t.host === s.u) t.host = t.seats.find(q => q.u).u;
      return pushTable(g, t);
    }
    if (t.phase === 'play') { s.left = 1; return finish(g, t, { win: others(t, seat), draw: false, why: 'resign', by: seat }); }
    s.left = 1; refund(t);
    if (t.seats.every(q => !q.u || q.left)) dropTable(g, t); else pushTable(g, t);
  }

  // Opening a table puts one's avatar on a seat at that piece of furniture.
  function openTable(g, p, t) {
    if (p.busy) release(g, p);
    if (p.open !== t.id) {
      p.open = t.id;
      const st = STATION[GAMES[t.game].station], seat = freeSeat(g.id, st, p.u.id, t.seats.findIndex(s => s.u === p.u.id));
      if (seat >= 0) walk(g.id, p, st.seats[seat], [st.id, seat]);
      else walk(g.id, p, [st.use[0] + (rand() - 0.5) * 2.4, st.use[1] + rand() * 0.8]);
      cast(g.id, { t: 'mem', m: { id: p.u.id, open: t.id } });
    }
    p.conn.send(J({ t: 'tv', tv: tableView(t, p.u.id) }));
  }
  function closeTable(g, p) {
    if (!p.open) return;
    p.open = 0; standUp(g.id, p);
    cast(g.id, { t: 'mem', m: { id: p.u.id, open: 0 } });
  }

  // ---------- EagleEye Commander ----------
  // A match belongs to the group; its generals are accounts. The game runs on its own page (public/eagleeye) with
  // a login for that one general, which the lobby hands to the account when it opens the match.
  const eeUser = (m, pid) => { for (const uid of Object.keys(m.users)) if (m.users[uid] === pid) return +uid; return 0; };
  const eeTurn = (m, uid) => m.phase === 'play' && m.players.some(p => p.id === m.users[uid] && p.alive && !p.ready);
  const eeSum = m => ({ code: m.code, name: m.name, phase: m.phase, round: m.round, deadline: m.deadline, at: m.created, host: eeUser(m, m.host), winner: m.winner,
    players: m.players.map(p => ({ u: eeUser(m, p.id), n: p.name, ai: p.kind === 'ai', alive: p.alive, ready: p.ready })) });
  const eeTry = f => { try { return f(); } catch (e) { if (e instanceof EagleEyeError) fail(e.message); throw e; } };
  const eeNeed = () => ee || fail('EagleEye Commander er ikke med på denne server.');
  function eeOpen(conn, p, g, code) {
    const token = eeNeed().token(g.id, code, conn.user.id);
    if (!token) fail('Du er ikke med i den kamp.');
    occupy(g, p, 'command', 'ee');
    conn.send(J({ t: 'eopen', code, token }));
  }
  // A match was saved in a new state: tell the group, and pay out when it has ended.
  function eeChanged(m, game) {
    cast(m.gid, { t: 'ee', m: eeSum(m) });
    if (game.phase !== 'over' || m.paid) return;
    ee.markPaid(m.code);
    if (game.round < ECON.ee.rounds) return;
    const humans = game.players.filter(p => p.kind === 'human').length, names = new Set(game.winner ? game.winner.names : []);
    for (const uid of Object.keys(m.users)) {
      const u = store.users.get(+uid), p = game.players.find(q => q.id === m.users[uid]);
      if (!u || !p) continue;
      const won = names.has(p.name), st = u.stats.ee || (u.stats.ee = { p: 0, w: 0 });
      st.p++; if (won) st.w++;
      u.chips += humans > 1 ? (won ? ECON.ee.win : ECON.ee.play) : won ? ECON.ee.botWin : 0;
      pushMe(u);
    }
    const g = store.groups.get(m.gid);
    if (g && humans > 1 && names.size) addChat(g, null, [...names].join(' og ') + ' vandt «' + game.name + '» i EagleEye Commander.');
  }

  // ---------- messages from the browser ----------
  const on = {
    hello(conn, m) {
      if (conn.user) return;
      const u = userFromToken(m.token);
      if (!u) { conn.send(J({ t: 'bye', why: 'login' })); conn.close(); return; }
      const old = conns.get(u.id);
      if (old) { old.send(J({ t: 'bye', why: 'other' })); leaveRoom(old); old.user = null; old.close(); }
      conn.user = u; conns.set(u.id, conn);
      let bonus = 0;
      if (u.daily !== today()) { u.daily = today(); u.chips += ECON.daily; bonus = ECON.daily; }
      u.seen = now(); store.saveUsers();
      conn.send(J({ t: 'welcome', me: mine(u), groups: groupList(u), bonus, now: now(), version }));
    },

    enter(conn, m) {
      const u = conn.user, g = store.groups.get(String(m.g));
      if (!g || !g.members[u.id]) fail('Du er ikke med i den gruppe.');
      leaveRoom(conn);
      if (!rooms.has(g.id)) rooms.set(g.id, new Map());
      const spot = nearestFree(ROOM.spawn[0] + (rand() - 0.5) * 2, ROOM.spawn[1] + rand() * 0.9);
      rooms.get(g.id).set(u.id, { conn, u, path: [spot], t0: now(), sit: null, open: 0, busy: '', fx: {}, drink: null });
      conn.gid = g.id;
      cast(g.id, { t: 'on', m: member(g, u.id) }, u.id);
      conn.send(J({
        t: 'room', g: { id: g.id, name: g.name, owner: g.owner, invite: isAdmin(g, u.id) ? g.invite : '' },
        mem: Object.keys(g.members).map(id => member(g, +id)), chat: g.chat.slice(-LIMITS.chatSend),
        tables: Object.values(g.tables).map(tableSum), ee: ee ? ee.ofGroup(g.id).map(eeSum) : [], now: now(),
      }));
    },

    leave(conn) { leaveRoom(conn); conn.send(J({ t: 'groups', groups: groupList(conn.user) })); },

    move(conn, m) {
      const p = presOf(conn), x = +m.x, y = +m.y;
      if (!p || p.open || p.busy || !Number.isFinite(x) || !Number.isFinite(y)) return;      // at a game one sits still
      walk(conn.gid, p, [x, y]);
    },

    sit(conn, m) {
      const p = presOf(conn), st = pick(STATION, m.st);
      if (!p || p.open || p.busy || !st || (st.kind !== 'sit' && st.kind !== 'bar')) return;
      if (p.sit && p.sit[0] === st.id) return;
      const seat = freeSeat(conn.gid, st, conn.user.id);
      if (seat >= 0) return walk(conn.gid, p, st.seats[seat], [st.id, seat]);
      if (st.kind !== 'bar') fail('Der er ikke plads lige nu.');
      walk(conn.gid, p, [st.use[0] + (rand() - 0.5) * 4, st.use[1] + rand() * 0.6]);        // a full bar: stand at it
    },

    // The bar: a glass for oneself, for somebody else, or a round for everybody in the clubhouse.
    drink(conn, m) {
      const p = need(conn), g = groupOf(conn), u = conn.user, room = rooms.get(conn.gid), def = pick(DRINKS, m.k);
      if (!def) fail('Det har baren ikke.');
      if (!atBar(p)) fail('Gå op til baren for at bestille.');
      if (now() - conn.drinkAt < BAR.gap) fail('Bartenderen skynder sig alt, hvad den kan …');
      let to = [p];
      if (m.to === 'all') to = [...room.values()].filter(q => q === p || !q.u.dnd);
      else if (m.to && +m.to !== u.id) {
        const q = room.get(+m.to);
        if (!q) fail('Det går kun, når den anden er i klubhuset.');
        if (q.u.dnd) fail(q.u.name + ' vil ikke forstyrres lige nu.');
        to = [q];
      }
      if (u.chips < def.cost * to.length) fail('Du har ikke jetoner nok.');
      conn.drinkAt = now();
      u.chips -= def.cost * to.length;
      u.stats.drinks = (u.stats.drinks || 0) + to.length;
      if (to.length > 1) u.stats.rounds = (u.stats.rounds || 0) + 1;
      for (const q of to) { q.drink = [m.k, now() + BAR.lasts * 1000]; addBuzz(q.u.id, def.alc); }
      cast(conn.gid, { t: 'drink', k: m.k, from: u.id, to: to.map(q => q.u.id), buzz: to.map(q => buzzOf(q.u.id)) });
      if (to.length > 1) addChat(g, null, u.name + ' giver en omgang: ' + def.name + ' til alle. Skål!');
      pushMe(u);
    },

    say(conn, m) {
      need(conn);
      const s = String(m.s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, LIMITS.chat);
      if (!s) return;
      conn.said = conn.said.filter(t => t > now() - 6000);
      if (conn.said.length >= 6) fail('Rolig nu. Vent et øjeblik med at skrive mere.');
      conn.said.push(now());
      addChat(groupOf(conn), conn.user, s);
    },

    emote(conn, m) {
      if (!presOf(conn) || !pick(EMOTES, m.k) || now() - conn.emoAt < 600) return;
      conn.emoAt = now();
      cast(conn.gid, { t: 'emo', u: conn.user.id, k: m.k });
    },

    prank(conn, m) {
      need(conn);
      const u = conn.user, def = pick(PRANKS, m.k), to = rooms.get(conn.gid).get(+m.to);
      if (!def) fail('Det drilleri findes ikke.');
      if (!to) fail('Det går kun, når den anden er i klubhuset.');
      if (to.u.id === u.id) fail('Du kan ikke drille dig selv.');
      if (u.dnd) fail('Slå «Forstyr ikke» fra, før du driller andre.');
      if (to.u.dnd) fail(to.u.name + ' vil ikke forstyrres lige nu.');
      if (now() - conn.prankAt < PRANK_GAP) fail('Lige et øjeblik …');
      if (u.chips < def.cost) fail('Du har ikke jetoner nok.');
      conn.prankAt = now();
      u.chips -= def.cost;
      u.stats.teased = (u.stats.teased || 0) + 1; to.u.stats.gotTeased = (to.u.stats.gotTeased || 0) + 1;
      to.fx[m.k] = now() + def.dur * 1000 + (def.fly ? 700 : 0);
      cast(conn.gid, { t: 'prank', k: m.k, from: u.id, to: to.u.id });
      pushMe(u); pushMe(to.u);
    },

    look(conn, m) {
      const u = conn.user;
      u.look = cleanLook(m.look, u.items);
      pushMe(u);
      if (conn.gid) cast(conn.gid, { t: 'mem', m: { id: u.id, look: u.look } });
    },

    buy(conn, m) {
      const u = conn.user, it = pick(ITEMS, m.k);
      if (!it) fail('Den vare findes ikke.');
      if (u.items.includes(m.k)) fail('Den har du allerede.');
      if (u.chips < it.cost) fail('Du har ikke jetoner nok.');
      u.chips -= it.cost; u.items.push(m.k);
      if (m.wear) u.look = cleanLook({ ...u.look, [it.slot]: m.k }, u.items);
      pushMe(u);
      if (conn.gid) cast(conn.gid, { t: 'mem', m: { id: u.id, look: u.look } });
    },

    dnd(conn, m) {
      const u = conn.user;
      u.dnd = !!m.on;
      pushMe(u);
      if (conn.gid) cast(conn.gid, { t: 'mem', m: { id: u.id, dnd: u.dnd } });
    },

    pass(conn, m) {
      const u = conn.user;
      if (!passOk(u, m.old)) fail('Det nuværende kodeord passer ikke.');
      Object.assign(u, hashPass(checkPass(m.pass)));
      u.gen++; store.saveUsers();                       // every other login of this account stops working
      conn.send(J({ t: 'token', token: tokenFor(u) }));
    },

    // ----- groups -----
    gnew(conn, m) {
      const u = conn.user, name = String(m.name ?? '').trim();
      if (!nameOk(name, LIMITS.groupMin, LIMITS.groupMax)) fail('Gruppens navn skal være ' + LIMITS.groupMin + '–' + LIMITS.groupMax + ' tegn.');
      if (!u.creator) {
        if (!norm(m.code) || norm(m.code) !== norm(store.config.code)) { if (++conn.badCodes > 8) conn.close(); fail('Installationskoden passer ikke.'); }
        u.creator = true;
      }
      if (groupsOf(u.id).length >= LIMITS.groups) fail('Du er med i for mange grupper.');
      const g = { id: store.newGroupId(), name, created: now(), owner: u.id, invite: newInvite(), members: { [u.id]: { role: 'admin', joined: now() } },
        chat: [], chatSeq: 0, tables: {}, tableSeq: 0 };
      store.groups.set(g.id, g); invites.set(g.invite, g.id);
      store.saveGroup(g); store.saveUsers();
      conn.send(J({ t: 'groups', groups: groupList(u), go: g.id }));
      conn.send(J({ t: 'me', me: mine(u) }));
    },

    gjoin(conn, m) {
      const u = conn.user, g = store.groups.get(invites.get(norm(m.code)));
      if (!g) { if (++conn.badCodes > 8) conn.close(); fail('Invitationen findes ikke længere. Bed om et nyt link.'); }
      if (!g.members[u.id]) {
        if (Object.keys(g.members).length >= LIMITS.members) fail('Gruppen er fuld.');
        if (groupsOf(u.id).length >= LIMITS.groups) fail('Du er med i for mange grupper.');
        addMember(g, u);
      }
      conn.send(J({ t: 'groups', groups: groupList(u), go: g.id }));
    },

    grename(conn, m) {
      need(conn);
      const g = groupOf(conn), name = String(m.name ?? '').trim();
      if (!isAdmin(g, conn.user.id)) fail('Kun gruppens admin kan det.');
      if (!nameOk(name, LIMITS.groupMin, LIMITS.groupMax)) fail('Gruppens navn skal være ' + LIMITS.groupMin + '–' + LIMITS.groupMax + ' tegn.');
      g.name = name; store.saveGroup(g);
      cast(g.id, { t: 'g', g: { name } });
    },

    // A new invitation link; the old one stops working.
    ginvite(conn) {
      need(conn);
      const g = groupOf(conn);
      if (!isAdmin(g, conn.user.id)) fail('Kun gruppens admin kan det.');
      invites.delete(g.invite); g.invite = newInvite(); invites.set(g.invite, g.id); store.saveGroup(g);
      for (const p of rooms.get(g.id).values()) if (isAdmin(g, p.u.id)) p.conn.send(J({ t: 'g', g: { invite: g.invite } }));
    },

    gkick(conn, m) {
      need(conn);
      const g = groupOf(conn), me = conn.user.id, uid = +m.u, role = roleOf(g, uid);
      if (!isAdmin(g, me)) fail('Kun gruppens admin kan det.');
      if (!role || uid === me) fail('Det medlem findes ikke.');
      if (role === 'owner' || (role === 'admin' && g.owner !== me)) fail('Det kan kun gruppens ejer.');
      removeMember(g, uid, store.users.get(uid).name + ' er taget ud af gruppen.');
    },

    grole(conn, m) {
      need(conn);
      const g = groupOf(conn), uid = +m.u;
      if (g.owner !== conn.user.id) fail('Det kan kun gruppens ejer.');
      if (!g.members[uid] || uid === g.owner) fail('Det medlem findes ikke.');
      if (m.role === 'owner') { g.owner = uid; g.members[uid].role = 'admin'; g.members[conn.user.id].role = 'admin'; }
      else g.members[uid].role = m.role === 'admin' ? 'admin' : 'member';
      store.saveGroup(g);
      for (const id of [uid, conn.user.id]) cast(g.id, { t: 'mem', m: { id, role: roleOf(g, id) } });
      for (const p of rooms.get(g.id).values()) p.conn.send(J({ t: 'g', g: { owner: g.owner, invite: isAdmin(g, p.u.id) ? g.invite : '' } }));
    },

    gleave(conn, m) {
      const u = conn.user, g = store.groups.get(String(m.g ?? conn.gid));
      if (!g || !g.members[u.id]) fail('Du er ikke med i den gruppe.');
      if (g.owner === u.id) {
        if (Object.keys(g.members).length > 1) fail('Giv gruppen videre til en anden, før du går. Eller slet den.');
        return deleteGroup(g);
      }
      removeMember(g, u.id, u.name + ' har forladt gruppen.');
    },

    gdel(conn, m) {
      const g = store.groups.get(String(m.g ?? conn.gid));
      if (!g || g.owner !== conn.user.id) fail('Det kan kun gruppens ejer.');
      deleteGroup(g);
    },

    // ----- tables -----
    tnew(conn, m) {
      const p = need(conn), g = groupOf(conn), u = conn.user, game = pick(GAMES, m.game);
      if (!game) fail('Det spil er ikke klar endnu.');
      const stake = ECON.stakes.includes(m.stake) ? m.stake : 0, level = [1, 2, 3].includes(m.bot) ? m.bot : 0;
      if (level && stake) fail('Robotten spiller ikke om jetoner. Vælg «ingen indsats».');
      if (Object.keys(g.tables).length >= LIMITS.tables) fail('Der er for mange borde i gang. Spil et færdigt først.');
      if (Object.values(g.tables).filter(t => t.host === u.id && t.phase === 'open').length >= LIMITS.ownOpen) fail('Du har allerede borde, der venter på spillere.');
      if (u.chips < stake) fail('Du har ikke jetoner nok til den indsats.');
      const t = { id: ++g.tableSeq, game: game.id, stake, pot: 0, host: u.id, seats: [], phase: 'open', state: null, first: 0, turnAt: 0,
        created: now(), endAt: 0, n: 0, moves: 0, res: null, again: {} };
      g.tables[t.id] = t;
      sitDown(t, u);
      if (level) { t.seats.push({ u: 0, n: game.botNames[level], bot: level }); if (t.seats.length >= game.min) start(g, t); }
      openTable(g, p, t);
      pushTable(g, t);
      const guest = rooms.get(g.id).get(+m.invite);
      if (guest && guest.u.id !== u.id && !guest.u.dnd && !level) guest.conn.send(J({ t: 'inv', id: t.id, from: u.id, game: t.game, stake }));
    },

    tjoin(conn, m) {
      const p = need(conn), g = groupOf(conn), u = conn.user, t = tableOf(g, m.id), game = GAMES[t.game];
      if (!t.seats.some(s => s.u === u.id)) {
        if (t.phase !== 'open') fail('Spillet er allerede i gang.');
        if (t.seats.length >= game.max) fail('Bordet er fuldt.');
        if (u.chips < t.stake) fail('Du har ikke jetoner nok til indsatsen.');
        sitDown(t, u);
        if (t.seats.length === game.max) start(g, t);
        pushTable(g, t);
      }
      openTable(g, p, t);
    },

    // Asks somebody who is in the clubhouse to come and sit at one's table.
    tinv(conn, m) {
      need(conn);
      const g = groupOf(conn), u = conn.user, t = tableOf(g, m.id), guest = rooms.get(g.id).get(+m.u);
      if (t.phase !== 'open' || !t.seats.some(s => s.u === u.id)) fail('Bordet venter ikke længere på spillere.');
      if (!guest || guest.u.id === u.id) fail('Det går kun, når den anden er i klubhuset.');
      if (guest.u.dnd) fail(guest.u.name + ' vil ikke forstyrres lige nu.');
      if (now() - conn.invAt < 3000) fail('Lige et øjeblik …');
      conn.invAt = now();
      guest.conn.send(J({ t: 'inv', id: t.id, from: u.id, game: t.game, stake: t.stake }));
    },

    tbot(conn, m) {
      need(conn);
      const g = groupOf(conn), t = tableOf(g, m.id), game = GAMES[t.game], level = [1, 2, 3].includes(m.level) ? m.level : 2;
      if (t.host !== conn.user.id || t.phase !== 'open') fail('Det kan kun den, der har lavet bordet, før spillet er i gang.');
      if (t.stake) fail('Robotten spiller ikke om jetoner. Lav et bord uden indsats.');
      if (t.seats.length >= game.max) fail('Bordet er fuldt.');
      t.seats.push({ u: 0, n: game.botNames[level], bot: level });
      if (t.seats.length === game.max) start(g, t);
      pushTable(g, t);
    },

    tstart(conn, m) {
      need(conn);
      const g = groupOf(conn), t = tableOf(g, m.id);
      if (t.host !== conn.user.id || t.phase !== 'open') fail('Det kan kun den, der har lavet bordet.');
      if (t.seats.length < GAMES[t.game].min) fail('Der mangler spillere.');
      start(g, t); pushTable(g, t);
    },

    tact(conn, m) {
      need(conn);
      const g = groupOf(conn), t = tableOf(g, m.id), seat = t.seats.findIndex(s => s.u === conn.user.id);
      if (seat < 0) fail('Du sidder ikke ved det bord.');
      if (t.phase !== 'play') fail('Spillet er ikke i gang.');
      if (m.a && m.a.resign) return finish(g, t, { win: others(t, seat), draw: false, why: 'resign', by: seat });
      play(g, t, seat, m.a);
    },

    // Waited long enough for the other one: take the game.
    tclaim(conn, m) {
      need(conn);
      const g = groupOf(conn), t = tableOf(g, m.id), seat = t.seats.findIndex(s => s.u === conn.user.id);
      if (seat < 0 || t.phase !== 'play') fail('Spillet er ikke i gang.');
      const turn = GAMES[t.game].turn(t.state);
      if (turn === seat || turn < 0 || t.seats[turn].bot) fail('Det er ikke den anden, der skal rykke.');
      if (now() - t.turnAt < ECON.claimHours * HOUR) fail('Du kan tage sejren, når den anden har haft ' + ECON.claimHours + ' timer til sit træk.');
      finish(g, t, { win: [seat], draw: false, why: 'time', by: turn });
    },

    // One more game at the same table: everybody has to say yes (and put the stake in again).
    tagain(conn, m) {
      need(conn);
      const g = groupOf(conn), u = conn.user, t = tableOf(g, m.id);
      if (t.phase !== 'over' || !t.seats.some(s => s.u === u.id)) fail('Det bord kan ikke spilles igen.');
      if (t.seats.some(s => s.left)) fail('Den anden er gået fra bordet.');
      if (t.again[u.id]) return;
      if (u.chips < t.stake) fail('Du har ikke jetoner nok til indsatsen.');
      u.chips -= t.stake; t.pot += t.stake; t.again[u.id] = 1;
      pushMe(u);
      if (t.seats.every(s => !s.u || t.again[s.u])) { t.first++; start(g, t); }
      pushTable(g, t);
    },

    tleave(conn, m) {
      const p = need(conn), g = groupOf(conn), t = tableOf(g, m.id), seat = t.seats.findIndex(s => s.u === conn.user.id && !s.left);
      if (p.open === t.id) closeTable(g, p);
      if (seat >= 0) leaveSeat(g, t, seat);
    },

    // ----- EagleEye Commander -----
    enew(conn, m) {
      const p = need(conn), g = groupOf(conn), u = conn.user;
      if (eeNeed().ofGroup(g.id).filter(x => x.phase !== 'over').length >= 8) fail('Der er mange kampe i gang. Gør en færdig, eller fjern en, først.');
      eeOpen(conn, p, g, eeTry(() => ee.create(g.id, u.id, u.name, m.name)));
    },
    ejoin(conn, m) {
      const p = need(conn), g = groupOf(conn), u = conn.user;
      eeOpen(conn, p, g, eeTry(() => eeNeed().join(g.id, String(m.code ?? ''), u.id, u.name)));
    },
    eopen(conn, m) { const p = need(conn); eeOpen(conn, p, groupOf(conn), String(m.code ?? '')); },
    eclose(conn) { const p = presOf(conn); if (p && p.busy === 'ee') release(groupOf(conn), p); },
    // Out of a match that has not started yet.
    eleave(conn, m) { need(conn); eeTry(() => eeNeed().leave(conn.gid, String(m.code ?? ''), conn.user.id)); if (!ee.get(String(m.code ?? ''))) cast(conn.gid, { t: 'eex', code: String(m.code ?? '') }); },
    // Removes a match: its host before the start or after the end, a group admin at any time.
    edrop(conn, m) {
      need(conn);
      const g = groupOf(conn), x = eeNeed().get(String(m.code ?? ''));
      if (!x || x.gid !== g.id) fail('Kampen findes ikke længere.');
      if (!isAdmin(g, conn.user.id) && !(eeUser(x, x.host) === conn.user.id && x.phase !== 'play')) fail('Det kan kun værten (før start eller efter slut) eller en admin.');
      ee.drop(g.id, x.code);
      cast(g.id, { t: 'eex', code: x.code });
    },

    topen(conn, m) { const p = need(conn), g = groupOf(conn), t = tableOf(g, m.id); if (p.open && p.open !== t.id) closeTable(g, p); openTable(g, p, t); },
    tclose(conn) { const p = presOf(conn); if (p) closeTable(groupOf(conn), p); },
  };

  // ---------- housekeeping ----------
  // Tables nobody uses any more are cleared away: one that waited a day for players, one that ended a while ago,
  // one where nobody has moved for a month.
  function tidy() {
    const t0 = now();
    for (const g of store.groups.values()) {
      const room = rooms.get(g.id);
      for (const t of Object.values(g.tables)) {
        const watched = room && [...room.values()].some(p => p.open === t.id);
        const old = t.phase === 'open' ? t0 - t.created > 24 * HOUR
          : t.phase === 'over' ? t0 - t.endAt > (watched ? 30 * 60e3 : 3 * 60e3)
          : t0 - t.turnAt > 30 * 24 * HOUR;
        if (old) { refund(t); dropTable(g, t); }
      }
    }
    for (const [ip, f] of fails) if (t0 - f.at >= 600e3) fails.delete(ip);
    for (const [ip, m] of made) if (t0 - m.at >= HOUR) made.delete(ip);
  }

  // After a restart: robots whose move it was carry on.
  for (const g of store.groups.values()) for (const t of Object.values(g.tables)) botSoon(g, t);

  return { api, connect, message, disconnect, tidy, eeChanged, online: () => conns.size, adminKey: () => sign('admin:' + today()) };
}
