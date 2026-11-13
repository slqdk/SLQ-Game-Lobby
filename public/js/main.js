// SLQ Game Lobby — the browser side: screens, menus, and what each message from the server means.
import { api, createSocket } from './net.js';
import { createRoom } from './room.js';
import { $, h, icon, bust, whole, sheet, toast } from './ui.js';
import { drawBust, drawFigure, drawPrank, drawEmote, drawGlass } from './avatar.js';
import { play, unlock, soundOn, setSound, musicOn, setMusic } from './sfx.js';
import { playTune, stopTune, playing } from './music.js';
import { pushStart, pushState, pushOn, pushOff, pushSync } from './push.js';
import { renderC4 } from './games/c4.js';
import { renderPoker } from './games/poker.js';
import { renderYatzy } from './games/yatzy.js';
import { renderMeyer } from './games/meyer.js';
import { renderLudo } from './games/ludo.js';
import { slotView } from './slots.js';
import { renderBlackjack, resetBlackjack } from './blackjack.js';
import { dealerMs } from '../shared/blackjack.js';
import { MACHINES, MACHINE_IDS } from '../shared/slots.js';
import { ECON, LIMITS, EMOTES, PRANKS, JUKE, ITEMS, DRINKS, DRINK_KINDS, LOOK, LOOK_NAMES, LOOK_PAGES, STYLE_NAMES, SLOT_NAMES, randomLook } from '../shared/defs.js';
import { ROOM, STATION, pathLen, findPath } from '../shared/room.js';
import { GAMES, SOON } from '../shared/games/index.js';
import { MODES, MODE_IDS, LEVELS, FILLS } from '../shooter/rules.js';
import { mouseSlider } from './mouse.js';

const load = k => { try { return localStorage.getItem(k) || ''; } catch { return ''; } };
const save = (k, v) => { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch {} };

const st = {
  token: load('slq-token'), gid: load('slq-group'), invite: '',
  me: null, groups: [], g: null, mem: new Map(), tables: new Map(), ee: new Map(), arenas: new Map(), game: null, gameQ: null,
  view: 'boot', sock: null, skew: 0, tv: null, everOpen: false, leaving: false, hinted: false,
  juke: null,          // the tune the music box is playing: { k, by, at }
};
const RENDER = { c4: renderC4, ludo: renderLudo, poker: renderPoker, yatzy: renderYatzy, meyer: renderMeyer };
const BUSY = { ee: 'EagleEye Commander', shooter: 'skydespillet' };
const app = $('#app');
let room = null, flat = null, deep = null, demoTimer = 0, jukeEnd = 0, jukeRetry = 0, jukeTries = 0;       // room: the clubhouse on screen, flat (room.js) or in 3D (room3d.js)

const now = () => Date.now() + st.skew;
const send = m => st.sock && st.sock.send(m);
const mine = () => st.me ? st.me.id : 0, me = mine;
const here = () => [...st.mem.values()].filter(m => m.on);
const isAdmin = () => { const m = st.mem.get(mine()); return !!m && (m.role === 'owner' || m.role === 'admin'); };
const two = n => String(n).padStart(2, '0');
const clock = ms => { const d = new Date(ms); return two(d.getHours()) + '.' + two(d.getMinutes()); };
function ago(ms) {
  if (!ms) return 'aldrig';
  const diff = now() - ms, d = new Date(ms), day = x => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  if (diff < 90e3) return 'lige nu';
  if (diff < 3600e3) return 'for ' + Math.round(diff / 60e3) + ' min. siden';
  const days = Math.round((day(new Date(now())) - day(d)) / 864e5);
  if (days <= 0) return 'i dag kl. ' + clock(ms);
  if (days === 1) return 'i går kl. ' + clock(ms);
  if (days < 7) return ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'][d.getDay()] + ' kl. ' + clock(ms);
  return 'd. ' + d.getDate() + '. ' + ['jan.', 'feb.', 'mar.', 'apr.', 'maj', 'jun.', 'jul.', 'aug.', 'sep.', 'okt.', 'nov.', 'dec.'][d.getMonth()];
}
const cost = n => n ? String(n) : 'Gratis';

function setView(v) {
  st.view = v; app.dataset.view = v;
  if (v !== 'room') { st.juke = null; sheet.close(); $('#friends').hidden = true; app.classList.remove('chat-open'); if (!$('#embed').hidden) { $('#embed').hidden = true; $('#embedBox').replaceChildren(); } }
  requestAnimationFrame(() => room && room.resize());
  musicSync();
}

// ---------- the clubhouse behind the welcome screen: a few made-up guests ----------
function demo() {
  const mk = (id, name, p, extra = {}) => ({ id, name, on: true, look: randomLook(-id * 131 + 7), p, ...extra });
  room.setName('');
  room.setRoom([
    mk(-1, 'Ane', [STATION.bar.seats[1]], { sit: ['bar', 1], drink: ['fadol', 70000] }), mk(-2, 'Bo', [STATION.bar.seats[4]], { sit: ['bar', 4], drink: ['filur', 60000] }),
    mk(-3, 'Cille', [[3.25, 6.4]], { sit: ['games', 0] }), mk(-4, 'Dan', [[7.35, 6.4]], { sit: ['games', 1] }),
    mk(-5, 'Eva', [[4.4, 10.6]]), mk(-6, 'Finn', [[20.25, 12.25]], { sit: ['sofa', 1] }), mk(-7, 'Gry', [[14.6, 8.4]]),
  ], 0);
  clearInterval(demoTimer);
  let n = 0;
  demoTimer = setInterval(() => {
    n++;
    room.emote(-5, 'dance');
    if (n % 3 === 1) room.emote(-7, 'wave');
    if (n % 4 === 2) room.emote(-1, 'cheers');
    if (n % 5 === 3) room.move(-7, findPath([14.6, 8.4], [12 + Math.random() * 6, 7.6 + Math.random() * 3]), null);
  }, 4200);
}

// ---------- welcome: log in, or make an account ----------
let authMode = 'login';
function showWelcome() {
  setView('welcome');
  if (!demoTimer) demo();
  setAuthMode(st.invite ? 'register' : 'login');
  const note = $('#inviteNote');
  note.hidden = true;
  if (st.invite) {
    $('#authForm').code.value = st.invite;
    api('invite', { code: st.invite }).then(r => { note.textContent = r.by + ' har inviteret dig til «' + r.group + '» (' + r.members + (r.members === 1 ? ' medlem' : ' medlemmer') + '). Lav en konto, eller log ind, så er du med.'; note.hidden = false; })
      .catch(e => { note.textContent = e.message; note.hidden = false; });
  }
}
function setAuthMode(m) {
  authMode = m;
  for (const b of document.querySelectorAll('#welcome .tabs button')) b.classList.toggle('on', b.dataset.tab === m);
  $('#codeRow').hidden = m !== 'register' || !!st.invite;
  $('#authGo').textContent = m === 'login' ? 'Log ind' : 'Opret konto';
  $('#authForm').pass.autocomplete = m === 'login' ? 'current-password' : 'new-password';
  $('#authError').hidden = true;
}
for (const b of document.querySelectorAll('#welcome .tabs button')) b.addEventListener('click', () => setAuthMode(b.dataset.tab));
$('#authForm').addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.currentTarget, err = $('#authError'), go = $('#authGo');
  err.hidden = true; go.disabled = true;
  try {
    const r = await api(authMode, { name: f.name.value.trim(), pass: f.pass.value, code: f.code.value });
    st.token = r.token; save('slq-token', r.token);
    f.pass.value = '';
    connect();
  } catch (x) { err.textContent = x.message; err.hidden = false; }
  go.disabled = false;
});

function logout() {
  pushOff(send);                    // the next account on this browser must not get this one's notifications
  if (st.sock) st.sock.stop();
  st.sock = null; st.token = ''; st.me = null; st.gid = ''; st.g = null;
  save('slq-token', ''); save('slq-group', '');
  demo(); showWelcome();
}
$('#btnLogout').addEventListener('click', logout);

// ---------- groups ----------
function showGroups() {
  setView('groups');
  if (!demoTimer) demo();
  $('#groupForm').hidden = true;
  const list = $('#groupList');
  list.replaceChildren(...st.groups.map(g => h('button', { class: 'item', onclick: () => enter(g.id) },
    h('div', { class: 't' }, h('b', {}, g.name), h('span', {}, g.n + (g.n === 1 ? ' medlem' : ' medlemmer') + (g.on ? ' · ' + g.on + ' er inde nu' : ''))),
    g.turn ? h('b', { class: 'badge', title: 'Din tur' }, g.turn) : null, h('span', { class: 'dot' + (g.on ? ' on' : '') }))));
  if (!st.groups.length) list.append(h('p', { class: 'empty' }, 'Du er ikke med i en gruppe endnu. Lav en selv, eller brug koden fra en invitation.'));
}
let groupMode = 'new';
function groupForm(mode) {
  groupMode = mode;
  const f = $('#groupForm');
  f.hidden = false; $('#groupError').hidden = true;
  $('#gfNameRow').hidden = mode !== 'new';
  $('#gfCodeRow').hidden = mode === 'new' && st.me && st.me.creator;
  $('#gfCodeLabel').textContent = mode === 'new' ? 'Installationskode' : 'Invitationskode';
  $('#groupGo').textContent = mode === 'new' ? 'Opret' : 'Gå med';
  (mode === 'new' ? f.name : f.code).focus();
}
$('#btnNewGroup').addEventListener('click', () => groupForm('new'));
$('#btnJoinGroup').addEventListener('click', () => groupForm('join'));
$('#groupCancel').addEventListener('click', () => { $('#groupForm').hidden = true; });
$('#groupForm').addEventListener('submit', e => {
  e.preventDefault();
  const f = e.currentTarget;
  send(groupMode === 'new' ? { t: 'gnew', name: f.name.value.trim(), code: f.code.value } : { t: 'gjoin', code: f.code.value });
});
function enter(gid) { st.gid = gid; save('slq-group', gid); send({ t: 'enter', g: gid }); }

// ---------- the connection ----------
function connect() {
  if (st.sock) st.sock.stop();
  st.everOpen = false;
  st.sock = createSocket({
    getToken: () => st.token,
    onMessage: m => { const f = on[m.t]; if (f) f(m); else if (m.t[0] === 'a') arenaMsg(m); },
    onState(state, tries) {
      const lost = $('#lost');
      if (state === 'open') { st.everOpen = true; lost.hidden = true; return; }
      if (state !== 'lost') { lost.hidden = true; return; }
      if (arenaOpen()) { closeArena(); toast('Forbindelsen røg, så du er tilbage i klubhuset.'); }
      lost.hidden = st.view === 'boot';
      $('#lostText').textContent = st.everOpen || tries < 3 ? 'Forbinder igen …'
        : 'Kan ikke få forbindelse til klubhuset. Kører siden bag Nginx Proxy Manager, skal «Websockets Support» være slået til.';
      if (st.view === 'boot' && tries >= 2) showWelcome();
    },
  });
}

const on = {
  welcome(m) {
    st.me = m.me; st.groups = m.groups; st.skew = m.now - Date.now();
    updateMe();
    if (m.bonus) { toast('Dagens jetoner: +' + m.bonus, { kind: 'good', pic: chipIcon() }); play('coin'); }
    if (st.invite) { send({ t: 'gjoin', code: st.invite }); return; }
    const want = st.groups.find(g => g.id === st.gid) || (st.groups.length === 1 ? st.groups[0] : null);
    if (want) enter(want.id); else showGroups();
  },
  bye(m) {
    if (st.sock) st.sock.stop();
    st.sock = null;
    if (m.why === 'login') { st.token = ''; save('slq-token', ''); showWelcome(); toast('Log ind igen.', { kind: 'err' }); return; }
    sheet.open({ title: 'Åbnet et andet sted', body: [h('p', {}, 'Du er logget ind fra en anden fane eller enhed, så denne er sat på pause.'), h('button', { class: 'btn big', onclick: () => { sheet.close(); connect(); } }, 'Brug klubhuset her')] });
  },
  token(m) { st.token = m.token; save('slq-token', m.token); toast('Kodeordet er skiftet.', { kind: 'good' }); sheet.close(); },
  err(m) {
    if (st.view === 'groups' && (m.re === 'gnew' || m.re === 'gjoin')) { const e = $('#groupError'); e.textContent = m.msg; e.hidden = false; if (st.invite) { st.invite = ''; try { sessionStorage.removeItem('slq-invite'); } catch {} } return; }
    if (m.re === 'gjoin' && st.invite) { st.invite = ''; try { sessionStorage.removeItem('slq-invite'); } catch {} showGroups(); }
    if (m.re === 'enter') { st.gid = ''; save('slq-group', ''); showGroups(); }
    toast(m.msg, { kind: 'err' }); play('error');
  },
  me(m) {
    const before = st.me ? st.me.chips : m.me.chips, was = !!(st.me && st.me.fresh);
    st.me = m.me;
    if (was && !m.me.fresh) roomTips();                 // the figure is built: now the first words about the room
    const mem = st.mem.get(mine());
    if (mem) { mem.chips = m.me.chips; mem.look = m.me.look; mem.stats = m.me.stats; mem.dnd = m.me.dnd; }
    updateMe(m.me.chips - before);
  },
  groups(m) {
    st.groups = m.groups;
    if (m.go) { st.invite = ''; try { sessionStorage.removeItem('slq-invite'); } catch {} enter(m.go); return; }
    if (st.view === 'groups') showGroups();
    else if (st.view === 'room' && (st.leaving || !st.groups.some(g => g.id === st.gid))) { st.leaving = false; st.g = null; demo(); showGroups(); }
    else if (st.view !== 'room') showGroups();
  },
  out() { st.g = null; toast('Du er ikke længere inde i den gruppe.'); demo(); showGroups(); },

  room(m) {
    clearInterval(demoTimer); demoTimer = 0;
    st.g = m.g; st.skew = m.now - Date.now();
    st.mem = new Map(m.mem.map(x => [x.id, x]));
    st.tables = new Map(m.tables.map(t => [t.id, t]));
    st.ee = new Map((m.ee || []).map(x => [x.code, x]));
    st.arenas = new Map((m.arenas || []).map(x => [x.id, x]));
    closeArena();
    room.setName(m.g.name);
    room.setRoom(m.mem, mine());
    if (m.up) room.wake(mine(), m.up);                                     // back again: one gets up from where one lay
    room.setOwner(st.me.name); cabinsChanged();
    if (m.home) homeGo(2, null, true);                                    // back again, and one was at home: one wakes up in one's bed
    st.juke = m.juke || null;
    useView(viewWanted());
    $('#groupName').textContent = m.g.name;
    $('#chatlog').replaceChildren();
    for (const c of m.chat) addChat(c, true);
    setView('room');
    if (!st.hinted) $('#friends').hidden = true;                           // the room fills the screen now: the list opens from the top bar
    renderFriends(); tablesChanged();
    if (st.tv) send({ t: 'topen', id: st.tv.id });            // back after a lost connection: the game is still open here
    // a new account builds its figure first (the first words about the room wait for that); an old one is told
    // once that there is more to choose now
    roomTips();
    if (st.me.fresh) setTimeout(() => { if (st.view === 'room' && st.me.fresh && !sheet.isOpen) openWardrobe(true); }, 400);
    else if (!load('slq-figure-tip')) { save('slq-figure-tip', '1'); toast('Nyt i garderoben: vælg køn, krop og højde. Og der er veste, jakker og støvler i tøjbutikken.', { actions: [['Åbn garderoben', () => openWardrobe()]], ms: 14000 }); }
    goWant();
  },
  g(m) {
    if (!st.g) return;
    Object.assign(st.g, m.g);
    if (m.g.name) { $('#groupName').textContent = m.g.name; room.setName(m.g.name); }
    if (sheet.kind === 'menu') openMenu();
  },
  on(m) { st.mem.set(m.m.id, m.m); room.join(m.m); renderFriends(); cabinsChanged(); },
  // somebody goes into their own cabin, comes out of it, or goes to sleep in it
  cabin(m) {
    const x = st.mem.get(m.u); if (x) x.cabin = m.in;
    if (m.u === mine()) homeGo(m.in, m.p, false); else room.cabin(m.u, m.in, m.p);
    cabinsChanged();
  },
  off(m) { const x = st.mem.get(m.u); if (x) { x.on = false; x.seen = m.seen; x.open = 0; x.rest = m.rest; } if (m.rest) room.sleep(m.u, m.rest); else room.leave(m.u); renderFriends(); cabinsChanged(); },      // (gone: lies down and sleeps where they were, or in their cabin)
  mem(m) {
    const x = st.mem.get(m.m.id);
    if (x) Object.assign(x, m.m); else if (m.m.name) st.mem.set(m.m.id, m.m);
    room.patch(m.m);
    renderFriends();
    if (sheet.kind === 'menu') openMenu(); else if (sheet.kind === 'scores') openScores();
  },
  gone(m) { st.mem.delete(m.u); room.leave(m.u); renderFriends(); cabinsChanged(); if (sheet.kind === 'menu') openMenu(); },
  mv(m) { room.move(m.u, m.p, m.sit); },
  chat(m) {
    addChat(m.m);
    if (m.m.u) { room.say(m.m.u, m.m.s); if (m.m.u !== mine()) play('chat'); }
  },
  emo(m) { room.emote(m.u, m.k); },
  juke(m) { st.juke = m.k ? { k: m.k, by: m.by, at: m.at } : null; musicSync(); tablesChanged(); if (sheet.kind === 'juke') openJuke(); },
  prank(m) {
    room.prank(m.k, m.from, m.to);
    if (m.to === mine()) { const a = st.mem.get(m.from); toast((a ? a.name : 'Nogen') + ' ' + TEASED[m.k] + '!', { pic: icon(34, c => drawPrank(c, m.k)), ms: 3600 }); }
  },
  drink(m) {
    room.drink(m.k, m.from, m.to, m.buzz);
    if (m.from !== mine() && m.to.includes(mine())) { const a = st.mem.get(m.from); toast((a ? a.name : 'Nogen') + ' har givet dig: ' + DRINKS[m.k].name + '. Skål!', { kind: 'good', pic: glassIcon(m.k, 34) }); }
  },

  // EagleEye Commander: a match of the group changed, is gone, or is handed to this player to open
  ee(m) {
    const x = m.m, old = st.ee.get(x.code), mine = x.players.find(p => p.u === me());
    st.ee.set(x.code, x);
    tablesChanged();
    if (mine && old && x.phase === 'play' && x.round > old.round && !embedOpen()) { toast('Slaget i runde ' + old.round + ' af «' + x.name + '» er udkæmpet.', { actions: [['Åbn', () => send({ t: 'eopen', code: x.code })]], ms: 9000 }); play('turn'); }
    else if (mine && old && old.phase === 'lobby' && x.phase === 'play' && !embedOpen()) toast('«' + x.name + '» er startet. Din general venter på ordrer.', { actions: [['Åbn', () => send({ t: 'eopen', code: x.code })]], ms: 9000 });
    if (sheet.kind === 'station') reopen();
  },
  eex(m) { st.ee.delete(m.code); tablesChanged(); if (sheet.kind === 'station') reopen(); },
  eopen(m) { sheet.close(); openEmbed('EagleEye Commander', 'eagleeye/index.html', m.token); },

  // the shooter: a match of the group changed or is gone; this player is let into one, or is out of it again
  ar(m) { st.arenas.set(m.m.id, m.m); if (sheet.kind === 'station' || sheet.kind === 'tables') reopen(); },
  arx(m) { st.arenas.delete(m.id); if (sheet.kind === 'station' || sheet.kind === 'tables') reopen(); },
  ain(m) { openArena(m); },
  aout(m) { closeArena(m.why); },

  tb(m) {
    const t = m.tb, old = st.tables.get(t.id), wasMine = old && old.phase === 'play' && old.seats[old.turn] && old.seats[old.turn].u === mine();
    st.tables.set(t.id, t);
    tablesChanged();
    const isMine = t.phase === 'play' && t.seats[t.turn] && t.seats[t.turn].u === mine();
    if (isMine && !wasMine && !(st.tv && st.tv.id === t.id)) {
      const other = t.seats.find(s => s.u !== mine());
      toast('Din tur i ' + GAMES[t.game].name + (other ? ' mod ' + other.n : '') + '.', { actions: [['Åbn', () => openTable(t.id)]], ms: 9000 });
      play('turn');
    }
    if (sheet.kind === 'station' || sheet.kind === 'tables') reopen();
  },
  tbx(m) {
    st.tables.delete(m.id);
    tablesChanged();
    if (st.tv && st.tv.id === m.id) { st.tv = null; if (sheet.kind === 'table') sheet.close(); }
    if (sheet.kind === 'station' || sheet.kind === 'tables') reopen();
  },
  tv(m) {
    const tv = m.tv, old = st.tv && st.tv.id === tv.id ? st.tv : null;
    st.tv = tv;
    if (old && tv.v && old.v && (tv.v.n !== old.v.n || tv.n !== old.n) && tv.v.n > 0) play('drop');
    if (tv.phase === 'over' && (!old || old.phase !== 'over') && tv.me >= 0) play(tv.res.draw ? 'turn' : tv.res.win.includes(tv.me) ? 'win' : 'lose');
    else if (old && tv.phase === 'play' && tv.turn === tv.me && old.turn !== tv.me) play('turn');
    showTable();
  },
  inv(m) {
    const a = st.mem.get(m.from), g = GAMES[m.game];
    if (!a || !g) return;
    play('turn');
    toast(a.name + ' vil spille ' + g.name + ' med dig' + (m.stake ? ' om ' + m.stake + ' jetoner' : '') + '.', { pic: bust(a.look, 34), actions: [['Ja', () => send({ t: 'tjoin', id: m.id })], ['Nej tak', null]] });
  },
};

const TEASED = { snow: 'kastede en snebold efter dig', tomato: 'kastede en tomat efter dig', water: 'ramte dig med en vandballon', pie: 'gav dig en lagkage i ansigtet',
  banana: 'lagde en bananskræl foran dig', feather: 'kilder dig med en fjer', fart: 'lagde en pruttepude under dig', cloud: 'sendte en regnsky efter dig',
  chicken: 'forvandlede dig til en høne', confetti: 'kastede konfetti over dig', hug: 'gav dig et kram' };

// ---------- top bar ----------
const chipIcon = (size = 26) => icon(size, c => { c.beginPath(); c.arc(0, 0, 12, 0, 7); c.fillStyle = '#ffb347'; c.fill(); c.lineWidth = 2.4; c.strokeStyle = '#17121f'; c.stroke(); c.beginPath(); c.arc(0, 0, 7, 0, 7); c.setLineDash([3.6, 2.8]); c.lineWidth = 1.8; c.stroke(); });
const glassIcon = (k, size = 52) => icon(size, c => { c.translate(0, 10); c.scale(1.25, 1.25); drawGlass(c, k, 1, 1); });
function updateMe(delta = 0) {
  if (!st.me) return;
  if (st.hold != null) { $('#chipCount').textContent = st.hold; return; }          // a slot machine is turning: the counter waits for the reels
  $('#chipCount').textContent = st.me.chips;
  drawBust($('#meBust'), st.me.look, 36);
  if (delta) { const c = $('#btnChips'); c.classList.remove('bump'); void c.offsetWidth; c.classList.add('bump'); if (delta > 0) play('coin'); }
}
function tablesChanged() {
  const eeTurns = [...st.ee.values()].filter(eeMyTurn).length;
  const turns = [...st.tables.values()].filter(t => t.phase === 'play' && t.seats[t.turn] && t.seats[t.turn].u === mine()).length + eeTurns, b = $('#turnBadge');
  b.hidden = !turns; b.textContent = turns;
  // what is going on at each piece of furniture, shown over it: of several tables the one that matters most to me
  const labels = {}, at = {};
  for (const t of st.tables.values()) { const g = GAMES[t.game]; if (g && t.phase !== 'over') (at[g.station] = at[g.station] || []).push(t); }
  for (const [sid, ts] of Object.entries(at)) { ts.sort((p, q) => rank(p) - rank(q) || p.id - q.id); labels[sid] = tableSign(ts[0], ts.length - 1); }
  if (st.bj && st.bj.n) labels.blackjack = { head: 'Blackjack', text: st.bj.n + ' ved bordet' };
  const wars = [...st.ee.values()].filter(x => x.phase === 'play'), mineWar = wars.find(eeMyTurn);
  if (mineWar) labels.command = { head: 'EagleEye Commander', text: 'Din tur i «' + mineWar.name + '»', hot: true };
  else if (wars.length) labels.command = { head: 'EagleEye Commander', text: wars.length === 1 ? '«' + wars[0].name + '» · runde ' + wars[0].round : wars.length + ' kampe i gang' };
  if (st.juke) labels.jukebox = { text: '♫ ' + JUKE.tunes[st.juke.k] };
  room.setLabels(labels);
  renderFriends();
}
const eeMyTurn = x => x.phase === 'play' && x.players.some(p => p.u === mine() && p.alive && !p.ready);
// The sign over a table's furniture. The games are played over days and the chairs are mostly empty, so it says
// what the game waits for (and for whom) rather than who "sits" there. `more`: other games at the same furniture.
function tableSign(t, more) {
  const g = GAMES[t.game], me = mine(), nm = x => x.n.replace(/ \(.*/, ''), seated = t.seats.some(x => x.u === me), many = g.max > 2, turn = t.seats[t.turn];
  const others = t.seats.filter(x => x.u !== me).map(nm), all = t.seats.map(nm);
  let text, hot = false;
  if (t.phase === 'open') text = t.seats[0].u === me ? (many ? 'Du venter på spillere' : 'Du venter på en modspiller') : all[0] + (many ? ' søger spillere' : ' søger en modspiller');
  else if (turn && turn.u === me) { text = 'Din tur' + (others.length === 1 ? ' mod ' + others[0] : ''); hot = true; }
  else if (seated) text = turn ? nm(turn) + ' har turen' : 'I gang';
  else text = all.length === 2 ? all.join(' mod ') : all.length === 3 ? all[0] + ', ' + all[1] + ' og ' + all[2] + ' spiller' : all.length + ' spiller';
  return { head: g.name + (more ? ' · +' + more + ' spil' : ''), text, hot };
}

// ---------- who is here ----------
function statusOf(m) {
  if (!m.on) return ['sidst set ' + ago(m.seen), ''];
  const t = m.open ? st.tables.get(m.open) : null;
  if (t && GAMES[t.game]) return [(t.seats.some(s => s.u === m.id) ? 'spiller ' : 'ser på ') + GAMES[t.game].name, 'play'];
  const net = m.net ? ' (' + (m.net > 0 ? '+' : '') + m.net + ')' : '';
  if (m.busy === 'slot') return ['ved ' + (MACHINES[m.slot] ? MACHINES[m.slot].name : 'en slotmaskine') + net, 'play'];
  if (m.busy === 'bj') return ['ved blackjackbordet' + net, 'play'];
  if (m.busy) return ['spiller ' + (BUSY[m.busy] || 'et spil'), 'play'];
  if (m.cabin) return [m.cabin === 2 ? 'sover i sin hytte' : 'hjemme i sin hytte', ''];
  return [m.dnd ? 'vil ikke forstyrres' : 'i klubhuset', ''];
}
const busts = new Map();
function bustOf(m, size) {
  const key = m.id + ':' + size + ':' + JSON.stringify(m.look);
  if (!busts.has(key)) { if (busts.size > 300) busts.clear(); busts.set(key, bust(m.look, size)); }
  const src = busts.get(key), cv = h('canvas', { width: src.width, height: src.height, style: 'width:' + size + 'px;height:' + size + 'px' });
  cv.getContext('2d').drawImage(src, 0, 0);
  return cv;
}
function renderFriends() {
  const all = [...st.mem.values()], inside = all.filter(m => m.on).sort((a, b) => a.name.localeCompare(b.name, 'da')), away = all.filter(m => !m.on).sort((a, b) => (b.seen || 0) - (a.seen || 0));
  $('#onlineCount').textContent = inside.length + '/' + all.length;
  if ($('#friends').hidden) return;
  const rowOf = m => {
    const [text, cls] = statusOf(m);
    return h('button', { class: 'friend' + (m.on ? '' : ' off'), onclick: () => openActor(m.id) }, bustOf(m, 38),
      h('div', { class: 'who' }, h('div', { class: 'nm' }, m.name + (m.id === mine() ? ' (dig)' : ''), m.role !== 'member' ? h('span', { class: 'role' }, m.role === 'owner' ? 'ejer' : 'admin') : null), h('div', { class: 'stt ' + cls }, text)));
  };
  $('#friendList').replaceChildren(h('div', { class: 'sep' }, 'Inde nu'), ...inside.map(rowOf), ...(away.length ? [h('div', { class: 'sep' }, 'Ikke her')] : []), ...away.map(rowOf));
}
$('#btnFriends').addEventListener('click', () => { $('#friends').hidden = !$('#friends').hidden; renderFriends(); });
document.querySelector('[data-close="friends"]').addEventListener('click', () => { $('#friends').hidden = true; });

// ---------- chat ----------
function addChat(c, old = false) {
  const log = $('#chatlog'), stick = log.scrollHeight - log.scrollTop - log.clientHeight < 60;
  const el = h('div', { class: 'msg' + (c.u ? (c.u === mine() ? ' me' : '') : ' sys') + (old ? ' old' : '') }, c.u ? h('b', {}, c.n) : null, c.s, h('time', {}, clock(c.t)));
  log.append(el);
  while (log.children.length > 150) log.firstChild.remove();
  if (!old) setTimeout(() => el.classList.add('old'), 45000);
  if (stick || old || c.u === mine()) log.scrollTop = log.scrollHeight;
}
$('#chatForm').addEventListener('submit', e => {
  e.preventDefault();
  const i = $('#chatInput'), s = i.value.trim();
  if (!s) return;
  if (send({ t: 'say', s })) { i.value = ''; if (document.pointerLockElement) i.blur(); }      // the mouse is caught, as in the shooter: back to walking by the keys
});
$('#chatInput').addEventListener('keydown', e => { if (e.key === 'Escape') e.target.blur(); });
$('#btnChat').addEventListener('click', () => { app.classList.toggle('chat-open'); const log = $('#chatlog'); log.scrollTop = log.scrollHeight; });
document.addEventListener('keydown', e => {
  if (st.view !== 'room' || sheet.isOpen || arenaOpen() || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === 'Enter' && document.activeElement !== $('#chatInput')) { $('#chatInput').focus(); e.preventDefault(); }
});

// ---------- the clubhouse in 3D, or flat ----------
// Four ways to see it: 'follow' (the camera behind one's figure), 'eyes' (through its eyes), 'over' (the whole saloon
// from the front) and 'flat' (the drawn clubhouse of old). The first three are the same saloon in 3D (room3d.js,
// fetched when first needed); whoever is shown at the moment is handed over when one switches.
const viewWanted = () => { const v = load('slq-room'); return ['follow', 'eyes', 'over', 'flat'].includes(v) ? v : matchMedia('(max-width: 760px), (pointer: coarse)').matches ? 'over' : 'follow'; };
const keysOn = () => st.view === 'room' && !sheet.isOpen && !arenaOpen() && $('#embed').hidden;
const sip = () => send({ t: 'emote', k: 'sip' });
// the view was chosen (by a button, or by V in the saloon): remembered, and shown on the buttons
function viewChosen(v) { save('slq-room', v); viewMarks(v); }
// which button is lit; in one's cabin there is no overview and no flat clubhouse
function viewMarks(v) { const inHome = !!(deep && deep.homeNow()) || !!st.goingHome; for (const b of $('#viewBar').children) { b.classList.toggle('on', b.dataset.view === v); b.disabled = inHome && (b.dataset.view === 'over' || b.dataset.view === 'flat'); } }
let viewBusy = false;
async function useView(v, keep = true) {
  if (viewBusy) return;
  if (deep && deep.homeNow() && (v === 'over' || v === 'flat')) return;
  viewBusy = true;
  try {
    if (v !== 'flat' && !deep) {
      try { const mod = await import('./room3d.js'); deep = mod.createRoom3D($('#room3d'), $('#roomOver'), { onActor, onStation, onFloor, onStep, keysOn, onSip: sip, onView: v => { if (!(deep && deep.homeNow())) viewChosen(v); else viewMarks(v); }, onHome }); deep.setOwner(st.me ? st.me.name : ''); }
      catch (e) { console.error(e); toast('Saloonen i 3D kunne ikke starte i denne browser. Du får den flade klub.'); v = 'flat'; }
    }
    const next = v === 'flat' ? flat : deep;
    if (next !== room) {
      const who = room.snapshot(), was = room;
      was.stop();
      room = next;
      room.setName(st.g ? st.g.name : ''); room.setRoom(who, st.g ? mine() : 0); cabinsChanged();
      $('#room').hidden = v !== 'flat'; $('#room3d').hidden = $('#roomOver').hidden = v === 'flat';
      room.start(); room.resize();
      if (st.g) { tablesChanged(); casinoChanged(); }
      musicSync();
    }
    if (v !== 'flat') { deep.setView(v); roomTips(); }
    if (keep) viewChosen(v); else viewMarks(v);
    $('#viewBar').hidden = false;
  } finally { viewBusy = false; }
}

// ---------- clicks in the room ----------
function onFloor(x, y) {
  if (st.view !== 'room') return;
  if (app.classList.contains('chat-open')) app.classList.remove('chat-open');
  send({ t: 'move', x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 });
}
// walking by the keys: one's own figure has already moved; the server is told where it is now ("t" first: the server knows these by how they begin)
function onStep(x, y) { if (st.view === 'room') send({ t: 'step', x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 }); }
function onActor(id) {
  if (st.view !== 'room') return;
  if (id === mine()) openSelf(); else openActor(id);
}
function goTo(sn) { if (sn.use) send({ t: 'move', x: sn.use[0] + (Math.random() - 0.5) * 0.8, y: sn.use[1] + Math.random() * 0.3 }); }
function onStation(sn) {
  if (st.view !== 'room') return;
  if (sn.kind === 'game') { goTo(sn); openStation(sn); }
  else if (sn.kind === 'bar') { send({ t: 'sit', st: 'bar' }); openBar(); }
  else if (sn.kind === 'shop') { goTo(sn); openShop(); }
  else if (sn.kind === 'cabin') goCabin();
  else if (sn.kind === 'cabins') { goTo(sn); openCabins(); }
  else if (sn.kind === 'scores') { goTo(sn); openScores(); }
  else if (sn.kind === 'slot') send({ t: 'sopen', m: sn.machine });
  else if (sn.kind === 'casino') { goTo(sn); openCasino(); }
  else if (sn.kind === 'blackjack') openBlackjack();
  else if (sn.kind === 'door') { goTo(sn); openMenu(); }
  else if (sn.kind === 'sit') send({ t: 'sit', st: sn.id });
  else if (sn.kind === 'sound') { goTo(sn); openJuke(); }
  else if (sn.kind === 'dance') {
    const [cx, cy, r] = sn.floor, a = Math.random() * 6.28, d = Math.random() * r * 0.7, to = [cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.8];
    send({ t: 'move', x: to[0], y: to[1] });
    setTimeout(() => send({ t: 'emote', k: 'dance' }), 400 + pathLen(findPath(ROOM.spawn, to)) / ROOM.speed * 400);
  }
}

// ---------- one's own cabin ----------
// Søren: "en dør i den ene ende af huset. Den dør skal føre figuren til ens egen personlige træhytte ... Man skal ikke
// kunne gå ud af døren i klubhuset, men hvis man trykker E på døren, så kommer man direkte ind i sin egen hytte".
// Who is in their cabin: whoever went in, and whoever is not in the clubhouse without lying asleep on its floor.
function cabinList() {
  const out = [];
  for (const m of st.mem.values()) { if (m.on && m.cabin) out.push({ name: m.name, sleep: m.cabin === 2 }); else if (!m.on && !m.rest) out.push({ name: m.name, sleep: true }); }
  return out.sort((a, b) => (a.sleep - b.sleep) || a.name.localeCompare(b.name, 'da'));
}
function cabinsChanged() { if (room && st.mem) room.setCabins(cabinList()); if (sheet.kind === 'cabins') openCabins(); }
function openCabins() {
  const list = cabinList();
  sheet.open({ title: 'I hytterne', kind: 'cabins', body: [
    list.length ? h('div', {}, list.map(r => h('div', { class: 'who2' }, h('b', {}, r.name), h('span', {}, r.sleep ? 'sover' : 'er i sin hytte')))) : h('p', { class: 'hint' }, 'Ingen er i deres hytte lige nu.'),
    h('p', { class: 'hint' }, 'Døren ved siden af tavlen fører til din egen hytte.'),
    h('button', { class: 'btn', onclick: () => { sheet.close(); goCabin(); } }, 'Gå hjem i din hytte')] });
}
// to the door, and in when one is there
function goCabin() {
  const sn = STATION.cabin, near = () => { const q = room.where(mine()); return q && Math.hypot(q[0] - sn.use[0], q[1] - sn.use[1]) < 1.6; };
  clearInterval(st.cabinWait);
  if (near()) return send({ t: 'cabin', in: 1 });
  send({ t: 'move', x: sn.use[0], y: sn.use[1] });
  let n = 0;
  st.cabinWait = setInterval(() => { if (++n > 80 || st.view !== 'room') return clearInterval(st.cabinWait); if (near()) { clearInterval(st.cabinWait); send({ t: 'cabin', in: 1 }); } }, 200);
}
// the server says one goes in (1, or 2 asleep in the bed) or out (0). The cabin is only in 3D: from the flat
// clubhouse, 3D is used while one is at home, and the flat one again after.
async function homeGo(inn, path, instant) {
  if (inn) {
    if (room !== deep || !deep) {
      st.homeFlat = room === flat; st.goingHome = true;
      await useView(load('slq-room') === 'eyes' ? 'eyes' : 'follow', false);
      st.goingHome = false;
      if (room !== deep) { send({ t: 'cabin', in: 0 }); return; }        // (no 3D in this browser: straight out again)
    }
    room.cabin(mine(), inn, path, instant);
    viewMarks(deep.view());
    if (!load('slq-home-tip')) { save('slq-home-tip', '1'); toast('Velkommen hjem! Det her er din egen hytte. Klædeskabet har dit tøj, og du kan sove i sengen. Gå ud ad døren for at komme over i klubhuset.', { ms: 12000 }); }
  } else {
    room.cabin(mine(), 0, path);
    setTimeout(() => { viewMarks(deep ? deep.view() : 'flat'); if (st.homeFlat) { st.homeFlat = false; useView('flat'); } }, 700);
  }
}
function onHome(what) {
  if (what === 'out') send({ t: 'cabin', in: 0 });
  else if (what === 'sleep') send({ t: 'cabin', in: 1, sleep: 1 });
  else if (what === 'wake') send({ t: 'cabin', in: 1, sleep: 0 });
  else if (what === 'wardrobe') openWardrobe();
}

// ---------- sheets: other people, oneself, emotes ----------
function tiles(list, big) { return h('div', { class: 'tiles' + (big ? ' big' : '') }, list); }
function prankTile(k, to) {
  const p = PRANKS[k], poor = st.me.chips < p.cost;
  return h('button', { class: 'tile' + (poor ? ' poor' : ''), onclick: () => { send({ t: 'prank', k, to }); sheet.close(); } },
    icon(52, c => drawPrank(c, k)), h('span', { class: 'n' }, p.name), h('span', { class: 'c' + (p.cost ? '' : ' free') }, cost(p.cost)));
}
function openActor(id) {
  const m = st.mem.get(id);
  if (!m) return;
  if (id === mine()) return openSelf();
  const [text] = statusOf(m), wins = Object.values(m.stats || {}).reduce((n, s) => n + (s && s.w || 0), 0);
  const body = [h('div', { class: 'who2' }, bust(m.look, 60), h('div', {}, h('b', {}, text[0].toUpperCase() + text.slice(1)), h('span', {}, m.chips + ' jetoner · ' + wins + (wins === 1 ? ' sejr' : ' sejre'))))];
  if (m.on && m.cabin) body.push(h('p', { class: 'hint' }, m.name + (m.cabin === 2 ? ' sover i sin hytte' : ' er hjemme i sin hytte') + '. Der er man i fred – men du kan stadig skrive i chatten.'));
  else if (m.on && m.dnd) body.push(h('p', { class: 'hint' }, m.name + ' vil ikke forstyrres lige nu.'));
  else if (m.on) {
    const keys = Object.keys(PRANKS);
    body.push(h('div', { class: 'sec' }, 'Dril'), tiles(keys.filter(k => !PRANKS[k].nice).map(k => prankTile(k, id))));
    body.push(h('div', { class: 'sec' }, 'Vær sød'), tiles(keys.filter(k => PRANKS[k].nice).map(k => prankTile(k, id))));
    let stake = 0;
    const seg = h('div', { class: 'seg' }, ECON.stakes.map(v => h('button', { class: v === 0 ? 'on' : '', disabled: st.me.chips < v, onclick: e => { stake = v; for (const b of seg.children) b.classList.toggle('on', b === e.currentTarget); } }, v ? String(v) : 'Ingen indsats')));
    body.push(h('div', { class: 'sec' }, 'Udfordr til 4 på stribe'), seg, h('button', { class: 'btn', onclick: () => { sheet.close(); send({ t: 'tnew', game: 'c4', stake, invite: id }); } }, 'Udfordr ' + m.name));
  } else body.push(h('p', { class: 'hint' }, m.rest ? m.name + ' sover her i klubhuset, til ' + (LOOK.sex[m.look && m.look.sex] === 'f' ? 'hun' : 'han') + ' kommer igen.' : m.name + ' er ikke i klubhuset lige nu.'));
  sheet.open({ title: m.name, body, kind: 'actor' });
}
function emoteTiles() {
  return tiles(Object.keys(EMOTES).map(k => h('button', { class: 'tile', onclick: () => { send({ t: 'emote', k }); sheet.close(); } }, icon(52, c => drawEmote(c, k)), h('span', { class: 'n' }, EMOTES[k].name))));
}
function dndSwitch() {
  const b = h('button', { class: 'switch' + (st.me.dnd ? ' on' : ''), onclick: () => { st.me.dnd = !st.me.dnd; b.classList.toggle('on', st.me.dnd); send({ t: 'dnd', on: st.me.dnd }); } },
    h('span', {}, 'Forstyr ikke', h('small', {}, 'Ingen kan drille dig eller byde dig op – og du kan heller ikke drille.')), h('i'));
  return b;
}
function openSelf() {
  sheet.open({ title: st.me.name, kind: 'self', body: [h('div', { class: 'sec' }, 'Fagter'), emoteTiles(),
    room.sitting(mine()) === 'bar' ? h('button', { class: 'btn', onclick: openBar }, 'Bestil i baren') : null,
    h('button', { class: 'btn alt', onclick: () => { sheet.close(); sip(); } }, 'Tag en tår af glasset'), dndSwitch(),
    deep && matchMedia('(pointer: fine)').matches ? mouseSlider('look', 'Musehastighed i 3D', 'slider') : null,
    h('div', { class: 'row' }, h('button', { class: 'btn alt', onclick: () => openWardrobe() }, 'Garderoben'), h('button', { class: 'btn alt', onclick: openShop }, 'Tøjbutikken'))] });
}
$('#btnEmote').addEventListener('click', () => sheet.open({ title: 'Fagter', kind: 'emote', body: emoteTiles() }));
$('#btnMe').addEventListener('click', openSelf);
$('#btnChips').addEventListener('click', () => sheet.open({ title: 'Jetoner', kind: 'chips', body: [
  h('div', { class: 'who2' }, chipIcon(56), h('div', {}, h('b', {}, st.me.chips + ' jetoner'), h('span', {}, 'Dine, i alle dine grupper'))),
  h('p', { class: 'hint' }, 'Du får ' + ECON.daily + ' hver dag, du kigger forbi, og ' + ECON.win + ' for at vinde et spil mod en ven (' + ECON.loss + ' for at være med). Spiller I om en indsats, tager vinderen puljen.'),
  h('p', { class: 'hint' }, 'Brug dem i baren, i tøjbutikken og på at drille de andre.')] }));

// ---------- the wardrobe: where one builds one's figure ----------
// Body, head and plain clothes are free; what was bought in the clothes shop is put on here too. The figure is shown
// in 3D (figview.js) and can be turned; without WebGL it is the flat drawing. `first`: the first time (a new account).
// The first words about the room, once: how to walk, and how to look round in three dimensions. A newcomer who is
// building a figure gets them afterwards.
function roomTips() {
  if (!st.g || st.view !== 'room' || !room || (st.me && st.me.fresh)) return;
  if (!st.hinted) { st.hinted = true; room.hint(9); if (viewWanted() === 'flat' || viewWanted() === 'over' || !matchMedia('(pointer: fine)').matches) toast('Tryk på gulvet for at gå. Tryk på møblerne og på de andre for at bruge dem.', { ms: 7000 }); }
  if (room === deep && load('slq-3d-tip') !== '2') {
    save('slq-3d-tip', '2');
    toast(matchMedia('(pointer: fine)').matches ? 'Styr som i skydespillet: klik i saloonen, så ser musen sig om. W A S D går, E bruger det, du ser på, mellemrum tager en tår. Esc slipper musen, V skifter visning.'
      : 'Træk for at se dig om, og tryk på gulvet for at gå. Tryk på møblerne og på de andre for at bruge dem.', { ms: 12000 });
  }
}

function openWardrobe(first = false) {
  const look = { ...st.me.look }, fig2 = h('canvas', { hidden: true }), figBox = h('div', { class: 'fig' }, fig2), turnHint = h('p', { class: 'hint center', style: 'margin-top:8px' }, 'Træk i figuren for at dreje den.');
  let raf = 0, timer = 0, view = null, page = 0, gone = false;
  const t0 = performance.now(), draw2 = () => { drawFigure(fig2, look, 210, { t: (performance.now() - t0) / 1000 }); raf = requestAnimationFrame(draw2); };
  // the figure in three dimensions, to be turned round; where the browser cannot do that, the drawn one
  import('./figview.js').then(m => gone ? null : m.makeFigView(figBox, look)).then(v => { if (v && gone) v.dispose(); else view = v; }).catch(() => { if (!gone) { fig2.hidden = false; turnHint.hidden = true; draw2(); } });
  const changed = () => { if (view) view.set(look); clearTimeout(timer); timer = setTimeout(() => send({ t: 'look', look }), 300); };
  const opts = h('div', { class: 'opts' }), tabs = h('div', { class: 'seg' });
  const PAGES = [...LOOK_PAGES, ['Udstyr', null]];
  const build = () => {
    tabs.replaceChildren(...PAGES.map(([name], i) => h('button', { class: i === page ? 'on' : '', onclick: () => { page = i; build(); } }, name)));
    const rows = [], keys = PAGES[page][1];
    if (keys) for (const k of keys) {
      if (STYLE_NAMES[k]) rows.push(h('div', { class: 'opt' }, h('span', {}, LOOK_NAMES[k]), h('div', { class: 'pick' }, STYLE_NAMES[k].map((n, i) => h('button', { class: look[k] === i ? 'on' : '', onclick: () => { look[k] = i; changed(); build(); } }, n)))));
      else rows.push(h('div', { class: 'opt' }, h('span', {}, LOOK_NAMES[k]), h('div', { class: 'sw' }, LOOK[k].map((col, i) => h('button', { class: look[k] === i ? 'on' : '', style: 'background:' + col, 'aria-label': LOOK_NAMES[k] + ' ' + (i + 1), onclick: () => { look[k] = i; changed(); build(); } })))));
    } else {
      for (const slot of SHOP_ORDER) {
        const own = st.me.items.filter(k => ITEMS[k] && ITEMS[k].slot === slot);
        if (own.length) rows.push(h('div', { class: 'opt' }, h('span', {}, SLOT_NAMES[slot]), h('div', { class: 'pick' }, h('button', { class: look[slot] ? '' : 'on', onclick: () => { look[slot] = ''; changed(); build(); } }, 'Intet'), own.map(k => h('button', { class: look[slot] === k ? 'on' : '', onclick: () => { look[slot] = k; changed(); build(); } }, ITEMS[k].name)))));
      }
      if (!rows.length) rows.push(h('p', { class: 'hint' }, 'Du har ikke købt noget endnu. Hatte, briller, veste, jakker og støvler findes i tøjbutikken.'));
      rows.push(h('button', { class: 'btn alt', onclick: openShop }, 'Gå i tøjbutikken'));
    }
    if (first && page < PAGES.length - 1) rows.push(h('button', { class: 'btn', onclick: () => { page++; build(); $('#sheet').scrollTop = 0; } }, 'Næste: ' + PAGES[page + 1][0].toLowerCase()));
    else if (first) rows.push(h('button', { class: 'btn', onclick: () => sheet.close() }, 'Færdig – ind i saloonen'));
    opts.replaceChildren(...rows);
  };
  build();
  if (first) save('slq-figure-tip', '1');
  sheet.open({ title: first ? 'Lav din figur' : 'Garderoben', wide: true, kind: 'wardrobe',
    closed: () => {
      gone = true; cancelAnimationFrame(raf); clearTimeout(timer); if (view) view.dispose();
      send({ t: 'look', look, done: true });
      if (first && page < PAGES.length - 1) toast('Du kan altid lave din figur færdig i garderoben.', { actions: [['Åbn garderoben', () => openWardrobe()]], ms: 9000 });
    },
    body: h('div', { class: 'wardrobe' },
      h('div', { class: 'figcol' }, figBox, h('div', { class: 'row', style: 'margin-top:10px' },
        h('button', { class: 'btn alt small', onclick: () => { const r = randomLook(Math.floor(Math.random() * 1e9)); for (const k of Object.keys(LOOK)) look[k] = r[k]; changed(); build(); } }, 'Tilfældig'),
        first ? null : h('button', { class: 'btn alt small', onclick: openShop }, 'Tøjbutikken')),
        turnHint),
      h('div', {}, first ? h('p', { class: 'hint' }, 'Velkommen! Vælg krop, hoved og tøj. Du kan altid lave det om i garderoben, og i tøjbutikken kan du købe mere for dine jetoner.') : null, tabs, opts)) });
}

// ---------- the clothes shop (the station is still called 'kiosk' in the code) ----------
// clothes first; and which part of the figure a thing is shown on (the rest are shown on a face)
const SHOP_ORDER = ['over', 'feet', 'hat', 'neck', 'glasses', 'back'], SHOP_PART = { over: 'body', back: 'body', neck: 'neck', feet: 'feet' };
function openShop() {
  let asking = '';
  const build = () => {
    const body = [h('p', { class: 'hint' }, 'Du har ' + st.me.chips + ' jetoner. Det du køber, er dit for altid.')];
    for (const slot of SHOP_ORDER) {
      body.push(h('div', { class: 'sec' }, SLOT_NAMES[slot]));
      body.push(tiles(Object.keys(ITEMS).filter(k => ITEMS[k].slot === slot).map(k => {
        const it = ITEMS[k], own = st.me.items.includes(k), worn = st.me.look[slot] === k, poor = !own && st.me.chips < it.cost;
        return h('button', { class: 'tile' + (worn ? ' worn' : '') + (poor ? ' poor' : ''), onclick: () => {
          if (own) { send({ t: 'look', look: { ...st.me.look, [slot]: worn ? '' : k } }); asking = ''; }
          else if (poor) { toast('Du mangler ' + (it.cost - st.me.chips) + ' jetoner til ' + it.name.toLowerCase() + '.', { kind: 'err' }); return; }
          else if (asking !== k) { asking = k; build(); return; }
          else { send({ t: 'buy', k, wear: true }); asking = ''; }
        } }, SHOP_PART[slot] ? whole({ ...st.me.look, [slot]: k }, 76, SHOP_PART[slot]) : bust({ ...st.me.look, [slot]: k }, 76, { bg: '#40365a' }), h('span', { class: 'n' }, it.name),
        h('span', { class: 'c' + (own ? ' own' : '') }, own ? (worn ? 'Har du på' : 'Tag på') : asking === k ? 'Køb for ' + it.cost + '?' : String(it.cost)));
      }), true));
    }
    return body;
  };
  sheet.open({ title: 'Tøjbutikken', wide: true, kind: 'shop', body: build() });
  shopRefresh = () => { if (sheet.kind === 'shop') sheet.fill(build()); };
}
let shopRefresh = () => {};

// ---------- the bar ----------
function openBar() {
  let to = 0;
  const build = () => {
    const others = here().filter(m => m.id !== mine() && !m.dnd), n = to === 'all' ? others.length + 1 : 1;
    const seg = h('div', { class: 'seg' },
      h('button', { class: to === 0 ? 'on' : '', onclick: () => { to = 0; sheet.fill(build()); } }, 'Til mig'),
      others.length ? h('button', { class: to === 'all' ? 'on' : '', onclick: () => { to = 'all'; sheet.fill(build()); } }, 'En omgang til alle (' + (others.length + 1) + ')') : null,
      others.slice(0, 6).map(m => h('button', { class: to === m.id ? 'on' : '', onclick: () => { to = m.id; sheet.fill(build()); } }, 'Til ' + m.name)));
    const body = [h('p', { class: 'hint' }, 'Bartenderen tager imod jetoner. Du har ' + st.me.chips + '.'), seg];
    for (const kind of Object.keys(DRINK_KINDS)) {
      body.push(h('div', { class: 'sec' }, DRINK_KINDS[kind]));
      body.push(tiles(Object.keys(DRINKS).filter(k => DRINKS[k].kind === kind).map(k => {
        const d = DRINKS[k], price = d.cost * n;
        return h('button', { class: 'tile' + (st.me.chips < price ? ' poor' : ''), onclick: () => send({ t: 'drink', k, to }) }, glassIcon(k), h('span', { class: 'n' }, d.name), h('span', { class: 'c' }, String(price)));
      })));
    }
    return body;
  };
  sheet.open({ title: 'Baren', kind: 'bar', body: build() });
  barRefresh = () => { if (sheet.kind === 'bar') sheet.fill(build()); };
}
let barRefresh = () => {};

// ---------- the music box ----------
// The tune that is on in the clubhouse (st.juke) is heard by those who are in the room with sound and music
// switched on; the notes over the box show for everybody. Called whenever any of that may have changed.
function musicSync(again) {
  clearTimeout(jukeEnd); clearTimeout(jukeRetry);
  if (!again) jukeTries = 0;
  let j = st.juke;
  const into = j ? Math.max(0, (Date.now() + st.skew - j.at) / 1000) : 0;
  if (j && into >= JUKE.secs) { j = st.juke = null; if (st.view === 'room') { tablesChanged(); if (sheet.kind === 'juke') openJuke(); } }      // it has played out
  if (room) room.setMusic(!!j && st.view === 'room');
  if (j) jukeEnd = setTimeout(musicSync, (JUKE.secs - into) * 1000 + 100);
  const id = j && st.view === 'room' && $('#arena').hidden && soundOn() && musicOn() ? j.k + '@' + j.at : '';
  if (!id) stopTune();
  // (the sound may need a moment after it has been switched on: a few more tries)
  else if (playing() !== id && !playTune(j.k, into, JUKE.secs, id) && jukeTries++ < 6) jukeRetry = setTimeout(() => musicSync(true), 250);
}
function soundSwitch(then) {
  const b = h('button', { class: 'switch' + (soundOn() ? ' on' : ''), onclick: () => { setSound(!soundOn()); b.classList.toggle('on', soundOn()); musicSync(); if (then) then(); } }, h('span', {}, 'Lyd', h('small', {}, 'Alt, hvad der kan høres i klubhuset.')), h('i'));
  return b;
}
function musicSwitch(then) {
  const b = h('button', { class: 'switch' + (musicOn() ? ' on' : ''), onclick: () => { setMusic(!musicOn()); b.classList.toggle('on', musicOn()); musicSync(); if (then) then(); } }, h('span', {}, 'Musik', h('small', {}, 'Det, musikboksen spiller.')), h('i'));
  return b;
}
function openJuke() {
  const j = st.juke, by = j && st.mem.get(j.by), again = () => { if (sheet.kind === 'juke') openJuke(); };
  const tunes = Object.entries(JUKE.tunes).map(([k, name]) => {
    const on = !!j && j.k === k;
    return h('button', { class: 'tune' + (on ? ' on' : ''), onclick: () => send({ t: 'juke', k }) }, h('i', {}, on ? '♫' : '▶'),
      h('span', {}, h('b', {}, name), on ? h('small', {}, 'Spiller nu' + (by ? ' · sat på af ' + (by.id === mine() ? 'dig' : by.name) : '')) : null));
  });
  sheet.open({ title: 'Musikboksen', kind: 'juke', body: [
    h('p', { class: 'hint' }, 'Sæt en melodi på. Alle i klubhuset hører den samme, og den spiller i ' + Math.round(JUKE.secs / 60) + ' minutter.'),
    h('div', { class: 'tunes' }, tunes),
    j ? h('button', { class: 'btn alt', onclick: () => send({ t: 'juke', k: '' }) }, 'Stop musikken') : null,
    h('div', { class: 'sec' }, 'Hos dig'), soundSwitch(again), musicSwitch(again),
    !soundOn() || !musicOn() ? h('p', { class: 'hint' }, 'Du har slået ' + (soundOn() ? 'musikken' : 'lyden') + ' fra, så du hører ikke, hvad boksen spiller.') : null,
  ] });
}

// ---------- the notice board ----------
function openScores() {
  const all = [...st.mem.values()];
  const board = (title, val, unit) => {
    const top = all.map(m => [m, val(m)]).filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]).slice(0, 5);
    return [h('div', { class: 'sec' }, title), top.length ? h('div', {}, top.map(([m, v], i) => h('div', { class: 'rank' }, h('span', { class: 'p' }, i + 1), bustOf(m, 30), h('span', {}, m.name), h('span', { class: 'v' }, v + (unit || ''))))) : h('p', { class: 'hint' }, 'Ingen endnu.')];
  };
  const stat = k => m => (m.stats && m.stats[k]) || 0;
  sheet.open({ title: 'Opslagstavlen', kind: 'scores', body: [
    ...board('Flest jetoner', m => m.chips),
    ...board('Sejre i 4 på stribe', m => (m.stats && m.stats.c4 && m.stats.c4.w) || 0),
    ...board('Vundne pokerturneringer', m => (m.stats && m.stats.poker && m.stats.poker.w) || 0),
    ...board('Sejre i Yatzy', m => (m.stats && m.stats.yatzy && m.stats.yatzy.w) || 0),
    ...board('Sejre i Meyer', m => (m.stats && m.stats.meyer && m.stats.meyer.w) || 0),
    ...board('Sejre i Ludo', m => (m.stats && m.stats.ludo && m.stats.ludo.w) || 0),
    ...board('Drab i skydespillet', m => (m.stats && m.stats.sh && m.stats.sh.k) || 0),
    ...board('Vundne runder i skydespillet', m => (m.stats && m.stats.sh && m.stats.sh.w) || 0),
    ...board('Sejre i EagleEye Commander', m => (m.stats && m.stats.ee && m.stats.ee.w) || 0),
    ...board('Største gevinst på en slotmaskine', m => (m.stats && m.stats.slots && m.stats.slots.best) || 0),
    ...board('Største gevinst på en hånd blackjack', m => (m.stats && m.stats.bj && m.stats.bj.best) || 0),
    ...board('Mest vundet i kasinoet (netto)', m => casinoEver(m).won - casinoEver(m).bet),
    ...board('Flest omgange givet i baren', stat('rounds')),
    ...board('Største drillepind', stat('teased')),
    ...board('Mest drillet', stat('gotTeased')),
  ].flat() });
}

// ---------- tables ----------
function tableRow(t) {
  const g = GAMES[t.game], seated = t.seats.some(s => s.u === mine()), myTurn = t.phase === 'play' && t.seats[t.turn] && t.seats[t.turn].u === mine();
  const names = t.seats.map(s => s.u === mine() ? 'dig' : s.n);
  let title, sub, label;
  const many = g.max > 2, full = t.seats.length >= g.max, vs = names.length > 2 ? names.slice(0, -1).join(', ') + ' og ' + names[names.length - 1] : names.join(' mod ');
  if (t.phase === 'open') { title = many ? (names[0] === 'dig' ? 'Dit bord' : t.seats[0].n + 's bord') + ' venter på spillere (' + t.seats.length + ' af ' + g.max + ')' : names[0] === 'dig' ? 'Dit bord venter på en modspiller' : t.seats[0].n + ' venter på en modspiller'; sub = t.stake ? 'Indsats ' + t.stake + ' jetoner' : 'Ingen indsats'; label = seated ? 'Åbn' : full ? 'Se' : 'Sæt dig'; }
  else if (t.phase === 'play') { title = vs[0].toUpperCase() + vs.slice(1); sub = myTurn ? 'Din tur' : t.seats[t.turn] ? t.seats[t.turn].n + ' har turen' + (many ? '' : ' · ' + ago(t.turnAt)) : 'I gang'; label = seated ? 'Fortsæt' : 'Se med'; }
  else { title = vs[0].toUpperCase() + vs.slice(1); sub = t.res.draw ? 'Uafgjort' : t.seats[t.res.win[0]].n + ' vandt'; label = 'Se'; }
  return h('div', { class: 'trow' + (myTurn ? ' turn' : '') }, h('div', { class: 't' }, h('b', {}, title), h('span', {}, g.name + ' · ' + sub)),
    h('button', { class: 'btn small' + (myTurn || (t.phase === 'open' && !seated) ? '' : ' alt'), onclick: () => (t.phase === 'open' && !seated && !full ? send({ t: 'tjoin', id: t.id }) : openTable(t.id)) }, label));
}
const rank = t => (t.phase === 'play' && t.seats[t.turn] && t.seats[t.turn].u === mine() ? 0 : t.seats.some(s => s.u === mine()) ? 1 : t.phase === 'open' ? 2 : t.phase === 'play' ? 3 : 4);
function newGame(gid) {
  const g = GAMES[gid];
  let stake = 0;
  const seg = h('div', { class: 'seg' }, ECON.stakes.map(v => h('button', { class: v === 0 ? 'on' : '', disabled: st.me.chips < v, onclick: e => { stake = v; for (const b of seg.children) b.classList.toggle('on', b === e.currentTarget); bots.hidden = !!v; } }, v ? String(v) : 'Ingen indsats')));
  const bots = h('div', { class: 'row' }, h('span', { class: 'hint' }, g.max > 2 ? 'Eller med robotter ved bordet (den første):' : 'Eller mod robotten:'), ['Let', 'Mellem', 'Svær'].map((n, i) => h('button', { class: 'btn alt small', onclick: () => send({ t: 'tnew', game: gid, stake: 0, bot: i + 1 }) }, n)));
  return [h('div', { class: 'sec' }, 'Nyt spil: ' + g.name), seg, h('button', { class: 'btn', onclick: () => send({ t: 'tnew', game: gid, stake }) }, g.max > 2 ? 'Stil et bord op og vent på vennerne' : 'Stil et bord op og vent på en ven'), bots];
}
let reopen = () => {};
function openStation(sn) {
  const build = () => {
    const body = [];
    for (const gid of sn.games) {
      if (gid === 'eagleeye') { body.push(...eagleSection()); continue; }
      if (gid === 'shooter') { body.push(...arenaSection()); continue; }
      if (!GAMES[gid]) { body.push(h('div', { class: 'trow soon' }, h('div', { class: 't' }, h('b', {}, SOON[gid] || gid), h('span', {}, 'Kommer snart')))); continue; }
      body.push(...newGame(gid));
      const list = [...st.tables.values()].filter(t => t.game === gid).sort((a, b) => rank(a) - rank(b) || b.at - a.at);
      if (list.length) body.push(h('div', { class: 'sec' }, 'Borde i gang'), ...list.map(tableRow));
    }
    return body;
  };
  sheet.open({ title: sn.name, kind: 'station', body: build() });
  reopen = () => sheet.fill(build());
}
function openTables() {
  const build = () => {
    const list = [...st.tables.values()].filter(t => GAMES[t.game]).sort((a, b) => rank(a) - rank(b) || b.at - a.at);
    const shoot = [...st.arenas.values()].map(arenaRow);
    if (st.bj && st.bj.n) shoot.push(h('div', { class: 'trow' }, h('div', { class: 't' }, h('b', {}, 'Blackjack'), h('span', {}, st.bj.n + ' ved bordet i kasinoet')), h('button', { class: 'btn small alt', onclick: openBlackjack }, 'Gå derhen')));
    return [list.length || shoot.length ? [...shoot, ...list.map(tableRow)] : h('p', { class: 'empty' }, 'Der er ingen spil i gang lige nu.'), ...newGame('c4'),
      h('p', { class: 'hint' }, 'De andre spil står ved deres egne borde i klubhuset: Ludo ved brætspilsbordet, poker ved kortbordet, Yatzy og Meyer ved terningebordet, skydespillet i arkaden, EagleEye Commander ved kommandobordet, og slotmaskinerne og blackjack i kasinofløjen.')].flat();
  };
  sheet.open({ title: 'Spil', kind: 'tables', body: build() });
  reopen = () => sheet.fill(build());
}
$('#btnTables').addEventListener('click', openTables);

// ---------- EagleEye Commander at the command table ----------
function eagleRow(x) {
  const mineP = x.players.find(p => p.u === mine()), names = x.players.map(p => p.u === mine() ? 'dig' : p.n).join(', '), turn = eeMyTurn(x);
  const waiting = x.players.filter(p => !p.ai && p.alive && !p.ready && p.u !== mine()).map(p => p.n);
  let sub, btn = null;
  if (x.phase === 'lobby') { sub = 'Venter på start · ' + names; btn = mineP ? ['Åbn', 'eopen'] : x.players.length < 6 ? ['Gå med', 'ejoin'] : null; }
  else if (x.phase === 'play') { sub = 'Runde ' + x.round + (mineP ? (turn ? ' · din tur' : waiting.length ? ' · venter på ' + waiting.join(', ') : ' · slaget er på vej') : ' · ' + names); btn = mineP ? ['Åbn', 'eopen'] : null; }
  else { sub = 'Slut' + (x.winner && x.winner.length ? ' · ' + x.winner.join(' og ') + ' vandt' : ''); btn = mineP ? ['Se', 'eopen'] : null; }
  const canDrop = isAdmin() || (x.host === mine() && x.phase !== 'play');
  return h('div', { class: 'trow' + (turn ? ' turn' : '') }, h('div', { class: 't' }, h('b', {}, x.name), h('span', {}, sub)),
    canDrop ? h('button', { class: 'btn small alt', onclick: e => confirmBtn(e.currentTarget, 'Fjern?', () => send({ t: 'edrop', code: x.code })) }, 'Fjern') : null,
    x.phase === 'lobby' && mineP && x.host !== mine() ? h('button', { class: 'btn small alt', onclick: () => send({ t: 'eleave', code: x.code }) }, 'Forlad') : null,
    btn ? h('button', { class: 'btn small' + (turn || btn[1] === 'ejoin' ? '' : ' alt'), onclick: () => send({ t: btn[1], code: x.code }) }, btn[0]) : null);
}
function eagleSection() {
  const order = x => (eeMyTurn(x) ? 0 : x.players.some(p => p.u === mine()) ? (x.phase === 'over' ? 3 : 1) : x.phase === 'lobby' ? 2 : 4);
  const list = [...st.ee.values()].sort((a, b) => order(a) - order(b) || b.at - a.at);
  const name = h('input', { maxLength: 24, value: 'Operation Ørneøje', 'aria-label': 'Kampens navn' });
  return [h('div', { class: 'sec' }, 'EagleEye Commander'),
    h('p', { class: 'hint' }, 'Byg basen, høst malmen og send hæren af sted. Når alle har meldt klar, udkæmpes runden – også hen over flere dage. Kort, størrelse og AI-generaler vælger værten, når kampen er lavet.'),
    h('div', { class: 'row' }, name, h('button', { class: 'btn', style: 'flex:none', onclick: () => send({ t: 'enew', name: name.value }) }, 'Ny kamp')),
    list.length ? h('div', { class: 'sec' }, 'Gruppens kampe') : null, ...list.map(eagleRow),
    h('button', { class: 'btn alt', onclick: () => { sheet.close(); openEmbed('EagleEye Commander · træning', 'eagleeye/index.html#traening', ''); } }, 'Øv dig alene mod AI')];
}

// ---------- the shooter in the arcade ----------
// A match is shown on top of the clubhouse, on the same connection; the game itself (three.js and all) is only
// fetched when somebody plays.
const arenaPick = { mode: 'stars', fill: 4, level: 2 };
function arenaRow(x) {
  const names = x.who.map(id => id === mine() ? 'dig' : (st.mem.get(id) || { name: '?' }).name).join(', ');
  return h('div', { class: 'trow' }, h('div', { class: 't' }, h('b', {}, 'Skydespillet · ' + MODES[x.mode].name),
    h('span', {}, names + (x.bots ? ' + ' + x.bots + (x.bots === 1 ? ' robot' : ' robotter') : '') + (x.state === 'ended' ? ' · runden er lige slut' : ''))),
    h('button', { class: 'btn small', onclick: () => send({ t: 'ajoin', id: x.id }) }, 'Gå med'));
}
function arenaSection() {
  const seg = (list, key) => h('div', { class: 'seg' }, list.map(([v, n]) => h('button', { class: arenaPick[key] === v ? 'on' : '', onclick: () => { arenaPick[key] = v; reopen(); } }, n)));
  const list = [...st.arenas.values()];
  return [h('div', { class: 'sec' }, 'Skydespillet'),
    h('p', { class: 'hint' }, 'Første person i 3D, med mus og tastatur (ikke på telefon endnu). Man kan gå med i en kamp, mens den er i gang, og robotterne giver plads, når der kommer folk.'),
    matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches ? h('p', { class: 'hint' }, 'Denne enhed har ingen mus, så her kan man kun kigge på banen, ikke spille.') : null,
    list.length ? [h('div', { class: 'sec' }, 'Kampe i gang'), ...list.map(arenaRow)] : null,
    h('div', { class: 'sec' }, 'Ny kamp'),
    seg(MODE_IDS.map(id => [id, MODES[id].name]), 'mode'),
    h('p', { class: 'hint' }, MODES[arenaPick.mode].text),
    h('div', { class: 'sec' }, 'Robotter'),
    seg(FILLS.map(f => [f, f ? 'Fyld op til ' + f : 'Ingen']), 'fill'),
    arenaPick.fill ? seg(LEVELS.map((n, i) => [i + 1, n]), 'level') : null,
    h('button', { class: 'btn', onclick: () => send({ t: 'anew', mode: arenaPick.mode, fill: arenaPick.fill, level: arenaPick.level }) }, 'Start kampen')].flat();
}
const arenaOpen = () => !$('#arena').hidden;
function arenaMsg(m) { if (st.game) st.game.on(m); else if (st.gameQ) st.gameQ.push(m); }
async function openArena(info) {
  const root = $('#arena');
  sheet.close();
  if (st.game) { st.game.stop(); st.game = null; }
  root.replaceChildren(h('div', { class: 'sh-wait' }, 'Henter banen …'));
  root.hidden = false;
  room.stop(); musicSync();
  const q = st.gameQ = [];
  try {
    const mod = await import('../shooter/game.js');
    if (st.gameQ !== q) return;                         // left (or started again) while it was being fetched
    st.game = mod.startGame({ root, info, send, sound: soundOn(), leave: () => send({ t: 'aleave' }) });
    for (const m of q) st.game.on(m);
    st.gameQ = null;
  } catch (e) {
    console.error(e);
    if (st.gameQ === q) { send({ t: 'aleave' }); closeArena(); toast('Skydespillet kunne ikke starte i denne browser (det kræver WebGL).'); }
  }
}
function closeArena(why) {
  st.gameQ = null;
  if (st.game) { st.game.stop(); st.game = null; }
  const root = $('#arena');
  if (root.hidden) return;
  root.hidden = true; root.replaceChildren();
  if (st.view === 'room') room.start();
  musicSync();
  if (why === 'idle') toast('Du stod stille længe og er tilbage i klubhuset.');
  else if (why === 'error') toast('Kampen gik i stykker. Start en ny i arkaden.');
}

// ---------- a game with a page of its own, in a frame over the clubhouse ----------
// The login for the match goes into this tab's session storage, where the game's page looks for it.
const embedOpen = () => !$('#embed').hidden;
function openEmbed(title, url, token) {
  try { if (token) sessionStorage.setItem('jf2-cur', token); else sessionStorage.removeItem('jf2-cur'); } catch {}
  $('#embedTitle').textContent = title;
  $('#embedBox').replaceChildren(h('iframe', { src: url, title, allow: 'autoplay; fullscreen' }));
  $('#embed').hidden = false;
  room.stop();
}
function closeEmbed() {
  if (!embedOpen()) return;
  $('#embed').hidden = true;
  $('#embedBox').replaceChildren();
  try { sessionStorage.removeItem('jf2-cur'); } catch {}
  send({ t: 'eclose' });
  room.start();
}
$('#embedX').addEventListener('click', closeEmbed);
window.addEventListener('message', e => { if (e.origin === location.origin && e.data && e.data.slq === 'ee-close') closeEmbed(); });

function openTable(id) { send({ t: 'topen', id }); }
function showTable() {
  const tv = st.tv, g = tv && GAMES[tv.game];
  if (!g) return;
  const ctx = { me: mine(), mem: st.mem, send, now, tease: openTeaseFromTable, close: () => sheet.close() };
  const body = RENDER[tv.game](tv, ctx);
  if (sheet.kind === 'table' && sheet.isOpen) sheet.fill(body, g.name);
  else sheet.open({ title: g.name, kind: 'table', body, closed: () => { if (st.tv && !teasing) { send({ t: 'tclose' }); st.tv = null; } } });
}
// Teasing somebody from the game: the tease menu takes the sheet for a moment, then the game comes back.
let teasing = false;
function openTeaseFromTable(id) {
  const m = st.mem.get(id);
  if (!m || !m.on) return;
  teasing = true;
  const back = () => { teasing = false; if (st.tv) showTable(); };
  const tile = k => { const p = PRANKS[k]; return h('button', { class: 'tile' + (st.me.chips < p.cost ? ' poor' : ''), onclick: () => { send({ t: 'prank', k, to: id }); sheet.close(); } }, icon(52, c => drawPrank(c, k)), h('span', { class: 'n' }, p.name), h('span', { class: 'c' + (p.cost ? '' : ' free') }, cost(p.cost))); };
  sheet.open({ title: 'Dril ' + m.name, kind: 'tease', closed: () => setTimeout(back, 0), body: [m.dnd ? h('p', { class: 'hint' }, m.name + ' vil ikke forstyrres lige nu.') : tiles(Object.keys(PRANKS).map(tile)), h('button', { class: 'btn alt', onclick: () => sheet.close() }, 'Tilbage til spillet')] });
}

// ---------- the menu: group and account ----------
function copyText(text, input) {
  const done = () => toast('Linket er kopieret. Send det til dem, der skal med.', { kind: 'good' });
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, () => { input.select(); toast('Markér linket og kopiér det.'); });
  else { input.select(); try { document.execCommand('copy'); done(); } catch { toast('Markér linket og kopiér det.'); } }
}
function openMenu() {
  const g = st.g, me = st.mem.get(mine()), owner = me && me.role === 'owner', body = [];
  if (!g) return;
  if (isAdmin() && g.invite) {
    const link = location.origin + location.pathname + '?i=' + g.invite, inp = h('input', { readOnly: true, value: link, onfocus: e => e.currentTarget.select() });
    body.push(h('div', { class: 'sec' }, 'Invitér venner'), inp, h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => copyText(link, inp) }, 'Kopiér link'),
      h('button', { class: 'btn alt', onclick: () => send({ t: 'ginvite' }) }, 'Lav et nyt link')), h('p', { class: 'hint' }, 'Alle med linket kan komme med i gruppen. Et nyt link gør det gamle ugyldigt.'));
  }
  body.push(h('div', { class: 'sec' }, 'Medlemmer (' + st.mem.size + ')'));
  body.push(h('div', {}, [...st.mem.values()].sort((a, b) => a.name.localeCompare(b.name, 'da')).map(m => {
    const acts = [];
    if (m.id !== mine()) {
      if (owner) acts.push(h('button', { class: 'btn alt small', onclick: () => send({ t: 'grole', u: m.id, role: m.role === 'admin' ? 'member' : 'admin' }) }, m.role === 'admin' ? 'Ikke admin' : 'Gør til admin'));
      if (owner || (isAdmin() && m.role === 'member')) acts.push(h('button', { class: 'btn danger small', onclick: e => confirmBtn(e.currentTarget, 'Tag ud?', () => send({ t: 'gkick', u: m.id })) }, 'Tag ud'));
    }
    return h('div', { class: 'friend' + (m.on ? '' : ' off') }, bustOf(m, 34), h('div', { class: 'who' }, h('div', { class: 'nm' }, m.name, m.role !== 'member' ? h('span', { class: 'role' }, m.role === 'owner' ? 'ejer' : 'admin') : null)), acts);
  })));
  if (isAdmin()) {
    const nm = h('input', { value: g.name, maxLength: LIMITS.groupMax });
    body.push(h('div', { class: 'sec' }, 'Gruppens navn'), h('div', { class: 'row' }, nm, h('button', { class: 'btn alt', style: 'flex:none', onclick: () => send({ t: 'grename', name: nm.value.trim() }) }, 'Gem')));
  }
  body.push(h('div', { class: 'sec' }, 'Dig'));
  body.push(soundSwitch(), musicSwitch(), dndSwitch(), pushRow());
  const pw = h('form', { hidden: true, onsubmit: e => { e.preventDefault(); send({ t: 'pass', old: e.currentTarget.old.value, pass: e.currentTarget.pass.value }); } },
    h('label', {}, 'Nuværende kodeord', h('input', { name: 'old', type: 'password', autocomplete: 'current-password', required: true })),
    h('label', {}, 'Nyt kodeord', h('input', { name: 'pass', type: 'password', autocomplete: 'new-password', minLength: LIMITS.passMin, required: true })), h('button', { class: 'btn' }, 'Skift kodeord'));
  body.push(h('div', { class: 'row' }, h('button', { class: 'btn alt', onclick: () => { pw.hidden = !pw.hidden; } }, 'Skift kodeord'),
    h('button', { class: 'btn alt', onclick: () => { st.leaving = true; send({ t: 'leave' }); } }, 'Skift gruppe'), h('button', { class: 'btn alt', onclick: logout }, 'Log ud')), pw);
  body.push(h('div', { class: 'sec' }, 'Gruppen'));
  if (owner) {
    const others = [...st.mem.values()].filter(m => m.id !== mine());
    if (others.length) {
      const sel = h('select', {}, others.map(m => h('option', { value: m.id }, m.name)));
      body.push(h('div', { class: 'row' }, sel, h('button', { class: 'btn alt', style: 'flex:none', onclick: e => confirmBtn(e.currentTarget, 'Sikker?', () => send({ t: 'grole', u: +sel.value, role: 'owner' })) }, 'Giv gruppen videre')));
    }
    body.push(h('button', { class: 'btn danger', onclick: e => confirmBtn(e.currentTarget, 'Slet gruppen og alt i den?', () => send({ t: 'gdel' })) }, 'Slet gruppen'));
  } else body.push(h('button', { class: 'btn danger', onclick: e => confirmBtn(e.currentTarget, 'Forlad gruppen?', () => send({ t: 'gleave' })) }, 'Forlad gruppen'));
  body.push(h('p', { class: 'hint' }, 'SLQ Game Lobby ' + (st.version || '')));
  if (sheet.kind === 'menu' && sheet.isOpen) sheet.fill(body); else sheet.open({ title: g.name, kind: 'menu', body });
}
// A button that asks once more before it does something that cannot be undone.
function confirmBtn(b, text, f) {
  if (b.dataset.sure) return f();
  b.dataset.sure = '1'; const was = b.textContent; b.textContent = text;
  setTimeout(() => { if (b.isConnected) { delete b.dataset.sure; b.textContent = was; } }, 4000);
}
$('#btnMenu').addEventListener('click', openMenu);

// what a change to oneself means for the sheet that is open
const meBefore = on.me;
on.me = m => { meBefore(m); shopRefresh(); barRefresh(); };
const welcomeBefore = on.welcome;
on.welcome = m => { st.version = m.version; st.pushKey = m.push || ''; welcomeBefore(m); awayNow = null; reportVis(); pushSync(st.pushKey, send); };

// ---------- the casino ----------
const num = n => String(n).replace(/\B(?=(\d{3})+$)/g, '.'), signed = n => (n > 0 ? '+' : '') + num(n);
// What the room shows of it: the jackpot over the pig machine and the board with who is up and down today.
function casinoChanged() {
  if (!room || !st.g) return;
  const lines = [...st.mem.values()].filter(m => m.today && (m.today[0] || m.today[1])).map(m => [m.name, m.today[1] - m.today[0]]).sort((a, b) => b[1] - a[1]);
  room.setCasino({ pot: st.pot || 0, lines });
  if (sheet.kind === 'casino') openCasino();
}
// What somebody has staked and won in the casino in all: the machines and the blackjack table together.
function casinoEver(m) {
  const s = (m.stats && m.stats.slots) || {}, b = (m.stats && m.stats.bj) || {}, sub = [];
  if (s.n) sub.push(num(s.n) + ' spin');
  if (b.n) sub.push(num(b.n) + (b.n === 1 ? ' hånd' : ' hænder') + ' blackjack');
  const best = Math.max(s.best || 0, b.best || 0);
  if (best) sub.push('største gevinst ' + num(best));
  return { n: (s.n || 0) + (b.n || 0), bet: (s.bet || 0) + (b.bet || 0), won: (s.won || 0) + (b.won || 0), sub: sub.join(' · ') };
}
// The board on the wall: the jackpot, and what everybody has staked and won, today and in all.
function openCasino() {
  const all = [...st.mem.values()], net = v => h('b', { class: v > 0 ? 'up' : v < 0 ? 'down' : '' }, signed(v));
  const today = all.filter(m => m.today && (m.today[0] || m.today[1])).sort((a, b) => (b.today[1] - b.today[0]) - (a.today[1] - a.today[0]));
  const ever = all.map(m => [m, casinoEver(m)]).filter(x => x[1].n).sort((a, b) => (b[1].won - b[1].bet) - (a[1].won - a[1].bet));
  const row = (m, sub, a, b) => h('div', { class: 'cs-row' }, bustOf(m, 30), h('span', { class: 'n' }, m.name, h('small', {}, sub)), h('span', {}, num(a)), h('span', {}, num(b)), net(b - a));
  const head = () => h('div', { class: 'cs-row head' }, h('span'), h('span'), h('span', {}, 'Satset'), h('span', {}, 'Vundet'), h('span', {}, 'Netto'));
  const where = m => !m.on ? '' : m.busy === 'slot' && MACHINES[m.slot] ? 'ved ' + MACHINES[m.slot].name + ' nu' : m.busy === 'bj' ? 'ved blackjackbordet nu' : '';
  const body = [
    h('div', { class: 'cs-pot' }, h('span', {}, 'Jackpot på Sparegrisen'), h('b', {}, num(st.pot || 0))),
    h('div', { class: 'sec' }, 'I dag'),
    today.length ? h('div', {}, head(), today.map(m => row(m, where(m), m.today[0], m.today[1]))) : h('p', { class: 'empty' }, 'Ingen har spillet i kasinoet i dag.'),
    h('div', { class: 'sec' }, 'I alt'),
    ever.length ? h('div', {}, head(), ever.map(([m, e]) => row(m, e.sub, e.bet, e.won))) : h('p', { class: 'empty' }, 'Ingen har prøvet kasinoet endnu.'),
    h('div', { class: 'sec' }, 'Spil'),
    h('div', { class: 'row' }, MACHINE_IDS.map(id => h('button', { class: 'btn alt', onclick: () => send({ t: 'sopen', m: id }) }, MACHINES[id].name)), h('button', { class: 'btn alt', onclick: openBlackjack }, 'Blackjack')),
    h('p', { class: 'hint' }, 'Alle i klubhuset ser hvert spin og hver runde blackjack, mens det sker: tallet, der stiger op fra den, der spiller, er gevinsten eller tabet, og tallet over navnet er, hvad de står til.'),
  ];
  if (sheet.kind === 'casino' && sheet.isOpen) sheet.fill(body); else sheet.open({ title: 'Kasinoet', kind: 'casino', body });
}
// The server has let one walk up to a machine: open it.
on.slot = m => {
  if (!MACHINES[m.m]) return;
  if (st.slot) st.slot.close();
  const view = st.slot = slotView(m.m, { send, chips: () => st.me.chips, hold: v => { st.hold = v; $('#chipCount').textContent = v; }, release: d => { st.hold = null; updateMe(d > 0 ? -1 : d); } });
  st.pot = m.pot;
  sheet.open({ title: MACHINES[m.m].name, kind: 'slot', body: view.el, closed: () => { view.close(); if (st.slot === view) { st.slot = null; send({ t: 'sclose' }); } if (st.hold != null) { st.hold = null; updateMe(); } } });
  view.init(m);
};
const later = (ms, f) => setTimeout(() => { if (st.g) f(); }, ms);
on.spun = m => {
  const mach = MACHINES[m.m], me = st.mem.get(mine());
  if (!mach) return;
  if (st.slot && st.slot.id === m.m) st.slot.spun(m); else { st.hold = null; updateMe(); }
  room.spin(mine(), mach.station, m.was ? 0 : m.bet, m.win, m.net, mach.spinMs);
  later(mach.spinMs, () => { if (me) { me.net = m.net; me.today = m.today; } st.pot = m.pot; casinoChanged(); renderFriends(); });
};
// somebody else's spin: seen in the room when their reels stop
on.spin = m => {
  const mach = MACHINES[m.m], x = st.mem.get(m.u);
  if (!mach) return;
  room.spin(m.u, mach.station, m.bet, m.win, m.net, mach.spinMs);
  later(mach.spinMs, () => { if (x) { x.net = m.net; x.today = m.today; } st.pot = m.pot; if (st.slot) st.slot.setPot(m.pot); casinoChanged(); renderFriends(); });
};
const errBefore = on.err;
on.err = m => { if (m.re === 'spin' && st.slot) st.slot.refused(); errBefore(m); };
const roomBefore = on.room;
on.room = m => { st.pot = m.pot || 0; st.slot = null; st.hold = null; st.bj = m.bj || null; if (sheet.kind === 'bj') sheet.close(); roomBefore(m); casinoChanged(); };

// ---------- blackjack ----------
// The table in the casino wing: everybody plays against the house. The sheet shows the table for as long as it is
// open, also to somebody who only watches; closing it is leaving the table.
function openBlackjack() {
  if (sheet.kind === 'bj') return;
  st.bjv = null; resetBlackjack();
  sheet.open({ title: 'Blackjack', kind: 'bj', wide: true, body: h('p', { class: 'empty' }, 'Henter bordet …'), closed: () => { st.bjv = null; send({ t: 'bjclose' }); } });
  send({ t: 'bjopen' });
}
function drawBlackjack() {
  if (sheet.kind !== 'bj' || !st.bjv) return;
  const left = Math.max(0, st.bjv.clock - (performance.now() - st.bjv.at) / 1000);
  sheet.fill(renderBlackjack(st.bjv.v, { me: mine(), mem: st.mem, chips: () => st.me.chips, clock: left, send, leave: () => sheet.close() }));
}
const bjTurn = v => v.phase === 'play' && v.turn >= 0 && v.seats[v.turn] && v.seats[v.turn].u === mine() && !v.seats[v.turn].gone;
on.bj = m => {
  if (sheet.kind !== 'bj') return;
  const before = st.bjv && bjTurn(st.bjv.v);
  st.bjv = { v: m.v, clock: m.clock, at: performance.now() };
  drawBlackjack();
  if (bjTurn(m.v) && !before) play('turn');
};
// how many sit at the table: the sign over it in the room
on.bjs = m => { st.bj = m.s; tablesChanged(); if (sheet.kind === 'tables') reopen(); };
// A round is over: what it gave each player rises from their heads when the dealer has drawn, and the board on the
// wall follows. One's own chip counter waits for the dealer too.
on.bjres = m => {
  const ms = dealerMs(m.cards);
  for (const r of m.r) {
    room.result(r.u, r.bet, r.win, r.net, ms);
    if (r.u === mine() && st.hold == null) { st.hold = $('#chipCount').textContent; later(ms, () => { st.hold = null; updateMe(r.win - r.bet > 0 ? 1 : -1); if (r.win < r.bet) play('lose'); }); }
  }
  later(ms, () => { for (const r of m.r) { const x = st.mem.get(r.u); if (x) { x.net = r.net; x.today = r.today; } } casinoChanged(); renderFriends(); });
};
const meBefore2 = on.me;
on.me = m => { meBefore2(m); if (st.bjv && st.bjv.v.phase !== 'show') drawBlackjack(); };

// ---------- notifications ----------
// The server only sends a notification to somebody who is not looking: the page tells it whether it is in front
// (a visible tab in a window that has the focus, touched within the last five minutes; a game page counts as touching).
let seenAt = Date.now(), awayNow = null;
const isAway = () => document.visibilityState !== 'visible' || !document.hasFocus() || (!embedOpen() && Date.now() - seenAt > 5 * 60e3);
function reportVis() { const a = isAway(); if (a !== awayNow && send({ t: 'vis', on: !a })) awayNow = a; }
// A notification that was tapped names a group and a table (or an EagleEye match): go there.
function openFrom(search) {
  const q = new URLSearchParams(search), clean = v => (v || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6), g = clean(q.get('g'));
  if (!g) return;
  st.want = { g, t: +q.get('t') || 0, e: clean(q.get('e')) };
  if (st.g && st.g.id === g) goWant();                                         // already in that clubhouse
  else if (st.me && st.groups.some(x => x.id === g)) enter(g);                 // logged in, but somewhere else
  else { st.gid = g; save('slq-group', g); }                                   // not logged in yet: the welcome goes there
}
function goWant() {
  const w = st.want;
  if (!w || !st.g || st.g.id !== w.g) return;
  st.want = null;
  if (w.t && st.tables.has(w.t)) openTable(w.t);
  else if (w.e && st.ee.has(w.e)) send({ t: 'eopen', code: w.e });
}
const PUSH_TEXT = {
  on: 'Du får en besked, når det er din tur, eller nogen byder dig op, og klubhuset ikke er fremme.',
  off: 'Få en besked, når det er din tur, eller nogen byder dig op, mens du er væk.',
  denied: 'Beskeder er blokeret for denne side. Tillad dem i browserens indstillinger for siden.',
  home: 'På iPhone og iPad: tryk på Del og «Føj til hjemmeskærm», og åbn klubhuset derfra. Så kan beskeder slås til.',
  https: 'Beskeder virker kun, når klubhuset åbnes over https.',
  none: 'Denne browser kan ikke vise beskeder.',
};
// The switch in the menu: notifications on this device, and a button to try them.
function pushRow() {
  const box = h('div', { class: 'pushrow' });
  const draw = async () => {
    const s = await pushState(st.pushKey);
    if (!s) return box.replaceChildren();
    const sw = h('button', { class: 'switch' + (s === 'on' ? ' on' : ''), id: 'pushSwitch', disabled: s !== 'on' && s !== 'off', onclick: async () => {
      sw.disabled = true;
      try { if (s === 'on') await pushOff(send); else await pushOn(st.pushKey, send); } catch (e) { toast(e.message, { kind: 'err' }); }
      draw();
    } }, h('span', {}, 'Beskeder på denne enhed', h('small', {}, PUSH_TEXT[s])), h('i'));
    box.replaceChildren(...(s === 'on' ? [sw, h('button', { class: 'btn alt small', id: 'pushTest', onclick: () => send({ t: 'ptest' }) }, 'Send en prøvebesked')] : [sw]));
  };
  draw();
  return box;
}
on.psub = () => {};
on.ptest = m => {
  if (m.ok) toast('Prøvebeskeden er sendt' + (m.ok > 1 ? ' til ' + m.ok + ' enheder' : '') + '. Den dukker op om et øjeblik.', { kind: 'good' });
  else toast('Beskedtjenesten tog ikke imod beskeden (svar ' + m.bad.join(', ') + ').', { kind: 'err' });
};

// ---------- start ----------
async function boot() {
  try { await Promise.race([document.fonts.load('600 16px Fredoka'), new Promise(r => setTimeout(r, 1500))]); } catch {}
  room = flat = createRoom($('#room'), { onActor, onStation, onFloor });
  for (const b of $('#viewBar').children) b.addEventListener('click', () => useView(b.dataset.view));
  new ResizeObserver(() => room.resize()).observe($('#stage'));
  // Sound is made, or woken, by any press or key (see sfx.js). A tune that waited for that starts then.
  const press = () => { unlock(); if (st.juke && !playing()) setTimeout(musicSync, 120); };
  for (const ev of ['pointerdown', 'pointerup', 'touchend', 'keydown']) document.addEventListener(ev, press, { capture: true, passive: true });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { room.start(); musicSync(); } else room.stop(); });
  // an invitation in the address: remember it, and take it out of the address bar
  const q = new URLSearchParams(location.search), code = (q.get('i') || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  try { if (code) sessionStorage.setItem('slq-invite', code); st.invite = code || sessionStorage.getItem('slq-invite') || ''; } catch { st.invite = code; }
  openFrom(location.search);
  if (location.search) history.replaceState(null, '', location.pathname);
  pushStart(openFrom);
  document.addEventListener('visibilitychange', reportVis);
  for (const ev of ['focus', 'blur']) window.addEventListener(ev, reportVis);
  for (const ev of ['pointerdown', 'keydown']) window.addEventListener(ev, () => { seenAt = Date.now(); if (awayNow) reportVis(); }, { passive: true });
  setInterval(reportVis, 30000);
  demo();
  room.start();
  if (st.token) connect(); else showWelcome();
  window.SLQ = { st, get room() { return room; }, send };
}
boot();
