// SLQ Game Lobby — the browser side: screens, menus, and what each message from the server means.
import { api, createSocket } from './net.js';
import { createRoom } from './room.js';
import { $, h, icon, bust, sheet, toast } from './ui.js';
import { drawBust, drawFigure, drawPrank, drawEmote, drawGlass } from './avatar.js';
import { play, unlock, soundOn, setSound } from './sfx.js';
import { renderC4 } from './games/c4.js';
import { ECON, LIMITS, EMOTES, PRANKS, ITEMS, DRINKS, DRINK_KINDS, LOOK, LOOK_NAMES, STYLE_NAMES, SLOTS, SLOT_NAMES, randomLook } from '../shared/defs.js';
import { ROOM, pathLen, findPath } from '../shared/room.js';
import { GAMES, SOON } from '../shared/games/index.js';
import { MODES, MODE_IDS, LEVELS, FILLS } from '../shooter/rules.js';

const load = k => { try { return localStorage.getItem(k) || ''; } catch { return ''; } };
const save = (k, v) => { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch {} };

const st = {
  token: load('slq-token'), gid: load('slq-group'), invite: '',
  me: null, groups: [], g: null, mem: new Map(), tables: new Map(), ee: new Map(), arenas: new Map(), game: null, gameQ: null,
  view: 'boot', sock: null, skew: 0, tv: null, everOpen: false, leaving: false, hinted: false,
};
const RENDER = { c4: renderC4 };
const BUSY = { ee: 'EagleEye Commander', shooter: 'skydespillet' };
const app = $('#app');
let room = null, demoTimer = 0;

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
  if (v !== 'room') { sheet.close(); $('#friends').hidden = true; app.classList.remove('chat-open'); if (!$('#embed').hidden) { $('#embed').hidden = true; $('#embedBox').replaceChildren(); } }
  requestAnimationFrame(() => room && room.resize());
}

// ---------- the clubhouse behind the welcome screen: a few made-up guests ----------
function demo() {
  const mk = (id, name, p, extra = {}) => ({ id, name, on: true, look: randomLook(-id * 131 + 7), p, ...extra });
  room.setName('');
  room.setRoom([
    mk(-1, 'Ane', [[10.25, 2]], { sit: ['bar', 1], drink: ['fadol', 70000] }), mk(-2, 'Bo', [[12.85, 2]], { sit: ['bar', 3], drink: ['filur', 60000] }),
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
    const before = st.me ? st.me.chips : m.me.chips;
    st.me = m.me;
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
    room.setSound(soundOn());
    $('#groupName').textContent = m.g.name;
    $('#chatlog').replaceChildren();
    for (const c of m.chat) addChat(c, true);
    setView('room');
    if (!st.hinted) $('#friends').hidden = window.innerWidth < 1680;       // room for the list beside the clubhouse only on a wide screen
    renderFriends(); tablesChanged();
    if (st.tv) send({ t: 'topen', id: st.tv.id });            // back after a lost connection: the game is still open here
    if (!st.hinted) { st.hinted = true; room.hint(9); toast('Tryk på gulvet for at gå. Tryk på møblerne og på de andre for at bruge dem.', { ms: 7000 }); }
  },
  g(m) {
    if (!st.g) return;
    Object.assign(st.g, m.g);
    if (m.g.name) { $('#groupName').textContent = m.g.name; room.setName(m.g.name); }
    if (sheet.kind === 'menu') openMenu();
  },
  on(m) { st.mem.set(m.m.id, m.m); room.join(m.m); renderFriends(); },
  off(m) { const x = st.mem.get(m.u); if (x) { x.on = false; x.seen = m.seen; x.open = 0; } room.leave(m.u); renderFriends(); },
  mem(m) {
    const x = st.mem.get(m.m.id);
    if (x) Object.assign(x, m.m); else if (m.m.name) st.mem.set(m.m.id, m.m);
    room.patch(m.m);
    renderFriends();
    if (sheet.kind === 'menu') openMenu(); else if (sheet.kind === 'scores') openScores();
  },
  gone(m) { st.mem.delete(m.u); room.leave(m.u); renderFriends(); if (sheet.kind === 'menu') openMenu(); },
  mv(m) { room.move(m.u, m.p, m.sit); },
  chat(m) {
    addChat(m.m);
    if (m.m.u) { room.say(m.m.u, m.m.s); if (m.m.u !== mine()) play('chat'); }
  },
  emo(m) { room.emote(m.u, m.k); },
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
  $('#chipCount').textContent = st.me.chips;
  drawBust($('#meBust'), st.me.look, 36);
  if (delta) { const c = $('#btnChips'); c.classList.remove('bump'); void c.offsetWidth; c.classList.add('bump'); if (delta > 0) play('coin'); }
}
function tablesChanged() {
  const eeTurns = [...st.ee.values()].filter(eeMyTurn).length;
  const turns = [...st.tables.values()].filter(t => t.phase === 'play' && t.seats[t.turn] && t.seats[t.turn].u === mine()).length + eeTurns, b = $('#turnBadge');
  b.hidden = !turns; b.textContent = turns;
  // what is going on at each piece of furniture, shown over it
  const labels = {};
  for (const t of st.tables.values()) {
    const g = GAMES[t.game];
    if (!g || t.phase === 'over') continue;
    const names = t.seats.map(s => s.n.replace(/ \(.*/, ''));
    labels[g.station] = t.phase === 'open' ? names[0] + ' venter på en modspiller' : names.join(' mod ');
  }
  const wars = [...st.ee.values()].filter(x => x.phase === 'play');
  if (wars.length) labels.command = wars.length === 1 ? '«' + wars[0].name + '» · runde ' + wars[0].round : wars.length + ' kampe i gang';
  room.setLabels(labels);
  renderFriends();
}
const eeMyTurn = x => x.phase === 'play' && x.players.some(p => p.u === mine() && p.alive && !p.ready);

// ---------- who is here ----------
function statusOf(m) {
  if (!m.on) return ['sidst set ' + ago(m.seen), ''];
  const t = m.open ? st.tables.get(m.open) : null;
  if (t && GAMES[t.game]) return [(t.seats.some(s => s.u === m.id) ? 'spiller ' : 'ser på ') + GAMES[t.game].name, 'play'];
  if (m.busy) return ['spiller ' + (BUSY[m.busy] || 'et spil'), 'play'];
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
  if (send({ t: 'say', s })) i.value = '';
});
$('#btnChat').addEventListener('click', () => { app.classList.toggle('chat-open'); const log = $('#chatlog'); log.scrollTop = log.scrollHeight; });
document.addEventListener('keydown', e => {
  if (st.view !== 'room' || sheet.isOpen || arenaOpen() || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === 'Enter' && document.activeElement !== $('#chatInput')) { $('#chatInput').focus(); e.preventDefault(); }
});

// ---------- clicks in the room ----------
function onFloor(x, y) {
  if (st.view !== 'room') return;
  if (app.classList.contains('chat-open')) app.classList.remove('chat-open');
  send({ t: 'move', x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 });
}
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
  else if (sn.kind === 'wardrobe') { goTo(sn); openWardrobe(); }
  else if (sn.kind === 'scores') { goTo(sn); openScores(); }
  else if (sn.kind === 'door') { goTo(sn); openMenu(); }
  else if (sn.kind === 'sit') send({ t: 'sit', st: sn.id });
  else if (sn.kind === 'sound') { goTo(sn); setSound(!soundOn()); room.setSound(soundOn()); toast(soundOn() ? 'Lyden er slået til.' : 'Lyden er slået fra.'); }
  else if (sn.kind === 'dance') {
    const [cx, cy, r] = sn.floor, a = Math.random() * 6.28, d = Math.random() * r * 0.7, to = [cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.8];
    send({ t: 'move', x: to[0], y: to[1] });
    setTimeout(() => send({ t: 'emote', k: 'dance' }), 400 + pathLen(findPath(ROOM.spawn, to)) / ROOM.speed * 400);
  }
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
  if (m.on && m.dnd) body.push(h('p', { class: 'hint' }, m.name + ' vil ikke forstyrres lige nu.'));
  else if (m.on) {
    const keys = Object.keys(PRANKS);
    body.push(h('div', { class: 'sec' }, 'Dril'), tiles(keys.filter(k => !PRANKS[k].nice).map(k => prankTile(k, id))));
    body.push(h('div', { class: 'sec' }, 'Vær sød'), tiles(keys.filter(k => PRANKS[k].nice).map(k => prankTile(k, id))));
    let stake = 0;
    const seg = h('div', { class: 'seg' }, ECON.stakes.map(v => h('button', { class: v === 0 ? 'on' : '', disabled: st.me.chips < v, onclick: e => { stake = v; for (const b of seg.children) b.classList.toggle('on', b === e.currentTarget); } }, v ? String(v) : 'Ingen indsats')));
    body.push(h('div', { class: 'sec' }, 'Udfordr til 4 på stribe'), seg, h('button', { class: 'btn', onclick: () => { sheet.close(); send({ t: 'tnew', game: 'c4', stake, invite: id }); } }, 'Udfordr ' + m.name));
  } else body.push(h('p', { class: 'hint' }, m.name + ' er ikke i klubhuset lige nu.'));
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
    room.sitting(mine()) === 'bar' ? h('button', { class: 'btn', onclick: openBar }, 'Bestil i baren') : null, dndSwitch(),
    h('div', { class: 'row' }, h('button', { class: 'btn alt', onclick: openWardrobe }, 'Garderoben'), h('button', { class: 'btn alt', onclick: openShop }, 'Kiosken'))] });
}
$('#btnEmote').addEventListener('click', () => sheet.open({ title: 'Fagter', kind: 'emote', body: emoteTiles() }));
$('#btnMe').addEventListener('click', openSelf);
$('#btnChips').addEventListener('click', () => sheet.open({ title: 'Jetoner', kind: 'chips', body: [
  h('div', { class: 'who2' }, chipIcon(56), h('div', {}, h('b', {}, st.me.chips + ' jetoner'), h('span', {}, 'Dine, i alle dine grupper'))),
  h('p', { class: 'hint' }, 'Du får ' + ECON.daily + ' hver dag, du kigger forbi, og ' + ECON.win + ' for at vinde et spil mod en ven (' + ECON.loss + ' for at være med). Spiller I om en indsats, tager vinderen puljen.'),
  h('p', { class: 'hint' }, 'Brug dem i baren, i kiosken og på at drille de andre.')] }));

// ---------- the wardrobe ----------
function openWardrobe() {
  const look = { ...st.me.look }, fig = h('canvas');
  let t0 = performance.now(), raf = 0, timer = 0;
  const draw = () => { drawFigure(fig, look, 210, { t: (performance.now() - t0) / 1000 }); raf = requestAnimationFrame(draw); };
  const push = () => { clearTimeout(timer); timer = setTimeout(() => send({ t: 'look', look }), 250); };
  const opts = h('div');
  const build = () => {
    const rows = [];
    for (const k of Object.keys(LOOK)) {
      if (STYLE_NAMES[k]) rows.push(h('div', { class: 'opt' }, h('span', {}, LOOK_NAMES[k]), h('div', { class: 'pick' }, STYLE_NAMES[k].map((n, i) => h('button', { class: look[k] === i ? 'on' : '', onclick: () => { look[k] = i; push(); build(); } }, n)))));
      else rows.push(h('div', { class: 'opt' }, h('span', {}, LOOK_NAMES[k]), h('div', { class: 'sw' }, LOOK[k].map((col, i) => h('button', { class: look[k] === i ? 'on' : '', style: 'background:' + col, 'aria-label': LOOK_NAMES[k] + ' ' + (i + 1), onclick: () => { look[k] = i; push(); build(); } })))));
    }
    for (const slot of SLOTS) {
      const own = st.me.items.filter(k => ITEMS[k] && ITEMS[k].slot === slot);
      rows.push(h('div', { class: 'opt' }, h('span', {}, SLOT_NAMES[slot]), own.length
        ? h('div', { class: 'pick' }, h('button', { class: look[slot] ? '' : 'on', onclick: () => { look[slot] = ''; push(); build(); } }, 'Intet'), own.map(k => h('button', { class: look[slot] === k ? 'on' : '', onclick: () => { look[slot] = k; push(); build(); } }, ITEMS[k].name)))
        : h('div', { class: 'hint' }, 'Du har ikke noget endnu. Kig i kiosken.')));
    }
    opts.replaceChildren(...rows);
  };
  build(); draw();
  sheet.open({ title: 'Garderoben', wide: true, kind: 'wardrobe', closed: () => { cancelAnimationFrame(raf); clearTimeout(timer); send({ t: 'look', look }); },
    body: h('div', { class: 'wardrobe' },
      h('div', {}, h('div', { class: 'fig' }, fig), h('div', { class: 'row', style: 'margin-top:10px' },
        h('button', { class: 'btn alt small', onclick: () => { const r = randomLook(Math.floor(Math.random() * 1e9)); for (const k of Object.keys(LOOK)) look[k] = r[k]; push(); build(); } }, 'Tilfældig'),
        h('button', { class: 'btn alt small', onclick: openShop }, 'Kiosken'))),
      opts) });
}

// ---------- the kiosk ----------
function openShop() {
  let asking = '';
  const build = () => {
    const body = [h('p', { class: 'hint' }, 'Du har ' + st.me.chips + ' jetoner. Det du køber, er dit for altid.')];
    for (const slot of SLOTS) {
      body.push(h('div', { class: 'sec' }, SLOT_NAMES[slot]));
      body.push(tiles(Object.keys(ITEMS).filter(k => ITEMS[k].slot === slot).map(k => {
        const it = ITEMS[k], own = st.me.items.includes(k), worn = st.me.look[slot] === k, poor = !own && st.me.chips < it.cost;
        return h('button', { class: 'tile' + (worn ? ' worn' : '') + (poor ? ' poor' : ''), onclick: () => {
          if (own) { send({ t: 'look', look: { ...st.me.look, [slot]: worn ? '' : k } }); asking = ''; }
          else if (poor) { toast('Du mangler ' + (it.cost - st.me.chips) + ' jetoner til ' + it.name.toLowerCase() + '.', { kind: 'err' }); return; }
          else if (asking !== k) { asking = k; build(); return; }
          else { send({ t: 'buy', k, wear: true }); asking = ''; }
        } }, bust({ ...st.me.look, [slot]: k }, 76, { bg: '#40365a' }), h('span', { class: 'n' }, it.name),
        h('span', { class: 'c' + (own ? ' own' : '') }, own ? (worn ? 'Har du på' : 'Tag på') : asking === k ? 'Køb for ' + it.cost + '?' : String(it.cost)));
      }), true));
    }
    return body;
  };
  sheet.open({ title: 'Kiosken', wide: true, kind: 'shop', body: build() });
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
    ...board('Drab i skydespillet', m => (m.stats && m.stats.sh && m.stats.sh.k) || 0),
    ...board('Vundne runder i skydespillet', m => (m.stats && m.stats.sh && m.stats.sh.w) || 0),
    ...board('Sejre i EagleEye Commander', m => (m.stats && m.stats.ee && m.stats.ee.w) || 0),
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
  if (t.phase === 'open') { title = names[0] === 'dig' ? 'Dit bord venter på en modspiller' : t.seats[0].n + ' venter på en modspiller'; sub = t.stake ? 'Indsats ' + t.stake + ' jetoner' : 'Ingen indsats'; label = seated ? 'Åbn' : 'Sæt dig'; }
  else if (t.phase === 'play') { title = names.join(' mod '); title = title[0].toUpperCase() + title.slice(1); sub = myTurn ? 'Din tur' : t.seats[t.turn].n + ' har turen · ' + ago(t.turnAt); label = seated ? 'Fortsæt' : 'Se med'; }
  else { title = names.join(' mod '); title = title[0].toUpperCase() + title.slice(1); sub = t.res.draw ? 'Uafgjort' : t.seats[t.res.win[0]].n + ' vandt'; label = 'Se'; }
  return h('div', { class: 'trow' + (myTurn ? ' turn' : '') }, h('div', { class: 't' }, h('b', {}, title), h('span', {}, g.name + ' · ' + sub)),
    h('button', { class: 'btn small' + (myTurn || (t.phase === 'open' && !seated) ? '' : ' alt'), onclick: () => (t.phase === 'open' && !seated ? send({ t: 'tjoin', id: t.id }) : openTable(t.id)) }, label));
}
const rank = t => (t.phase === 'play' && t.seats[t.turn] && t.seats[t.turn].u === mine() ? 0 : t.seats.some(s => s.u === mine()) ? 1 : t.phase === 'open' ? 2 : t.phase === 'play' ? 3 : 4);
function newGame(gid) {
  const g = GAMES[gid];
  let stake = 0;
  const seg = h('div', { class: 'seg' }, ECON.stakes.map(v => h('button', { class: v === 0 ? 'on' : '', disabled: st.me.chips < v, onclick: e => { stake = v; for (const b of seg.children) b.classList.toggle('on', b === e.currentTarget); bots.hidden = !!v; } }, v ? String(v) : 'Ingen indsats')));
  const bots = h('div', { class: 'row' }, h('span', { class: 'hint' }, 'Eller mod robotten:'), ['Let', 'Mellem', 'Svær'].map((n, i) => h('button', { class: 'btn alt small', onclick: () => send({ t: 'tnew', game: gid, stake: 0, bot: i + 1 }) }, n)));
  return [h('div', { class: 'sec' }, 'Nyt spil: ' + g.name), seg, h('button', { class: 'btn', onclick: () => send({ t: 'tnew', game: gid, stake }) }, 'Stil et bord op og vent på en ven'), bots];
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
    return [list.length || shoot.length ? [...shoot, ...list.map(tableRow)] : h('p', { class: 'empty' }, 'Der er ingen spil i gang lige nu.'), ...newGame('c4'),
      h('p', { class: 'hint' }, 'Skydespillet står i arkaden, og EagleEye Commander ved kommandobordet. Yatzy, Meyer, Ludo og poker får deres egne borde senere.')].flat();
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
  room.stop();
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
  const snd = h('button', { class: 'switch' + (soundOn() ? ' on' : ''), onclick: () => { setSound(!soundOn()); room.setSound(soundOn()); snd.classList.toggle('on', soundOn()); } }, h('span', {}, 'Lyd'), h('i'));
  body.push(snd, dndSwitch());
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
on.welcome = m => { st.version = m.version; welcomeBefore(m); };

// ---------- start ----------
async function boot() {
  try { await Promise.race([document.fonts.load('600 16px Fredoka'), new Promise(r => setTimeout(r, 1500))]); } catch {}
  room = createRoom($('#room'), { onActor, onStation, onFloor });
  room.setSound(soundOn());
  new ResizeObserver(() => room.resize()).observe($('#stage'));
  document.addEventListener('pointerdown', unlock, { once: true });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') room.start(); else room.stop(); });
  // an invitation in the address: remember it, and take it out of the address bar
  const q = new URLSearchParams(location.search), code = (q.get('i') || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  try { if (code) sessionStorage.setItem('slq-invite', code); st.invite = code || sessionStorage.getItem('slq-invite') || ''; } catch { st.invite = code; }
  if (code) history.replaceState(null, '', location.pathname);
  demo();
  room.start();
  if (st.token) connect(); else showWelcome();
  window.SLQ = { st, room, send };
}
boot();
