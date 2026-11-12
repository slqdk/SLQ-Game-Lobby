// SLQ Game Lobby — self test. Runs the lobby logic without sockets (accounts, groups, room, chat, teasing, bar,
// shop, tables), then starts the real server on a spare port and talks WebSocket to it.   node tools/selftest.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import crypto from 'node:crypto';
import ludo, { START as LSTART, STARS as LSTARS, GLOBES as LGLOBES, GOAL as LGOAL } from '../public/shared/games/ludo.js';
import meyer, { rankOf, rankName, chance as meyerChance, LIVES, MEYER } from '../public/shared/games/meyer.js';
import yatzy, { scoreOf, sums as yzSums, FIELDS } from '../public/shared/games/yatzy.js';
import poker, { handValue, handName, equity, START as PSTART, THINK, SHOW } from '../public/shared/games/poker.js';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createStore } from '../server/store.js';
import { createHub } from '../server/hub.js';
import { createEagleEye } from '../server/eagleeye.js';
import { createArena } from '../server/arena.js';
import { buildNav } from '../server/arena-nav.js';
import { buildWorld, nullThree, EYE } from '../public/shooter/world.js';
import { WEAPONS, MODES, ARENA, TEAMS, FLAG, dirAim, aimDir, falloff, zoneAt, flyShot, newShot } from '../public/shooter/rules.js';
import { ECON, PRANKS, ITEMS, DRINKS, BAR, LOOK, cleanLook, randomLook } from '../public/shared/defs.js';
import { ROOM, STATIONS, STATION, isFree, findPath, pathLen } from '../public/shared/room.js';
import { GAMES } from '../public/shared/games/index.js';
import { mulberry32 } from '../public/shared/util.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0, failedN = 0;
const check = (name, ok, extra = '') => { if (ok) passed++; else { failedN++; console.log('  FEJL: ' + name + (extra ? '  → ' + extra : '')); } };
const section = name => console.log('· ' + name);

// ---------- a lobby in a temporary folder, with a clock we control ----------
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slq-lobby-test-'));
let clock = new Date(2026, 10, 12, 12, 0, 0).getTime();
const rnd = mulberry32(42);
let store = createStore(dir, { delay: -1 }), ee, hub, arena;
function startLobby() {           // the lobby with EagleEye Commander and the shooter in it, as server.js puts them together
  let tell = () => {};
  ee = createEagleEye({ dir: path.join(dir, 'eagleeye'), secret: store.config.secret, now: () => Math.floor(clock / 1000), changed: (m, g) => tell(m, g) });
  arena = createArena({ now: () => clock, rand: rnd, timer: false, changed: (...a) => hub.arChanged(...a), ended: r => hub.arEnded(r), left: (...a) => hub.arLeft(...a) });
  hub = createHub({ store, ee, arena, version: 'test', now: () => clock, botDelay: 0, rand: rnd });
  tell = hub.eeChanged;
}
startLobby();

function client(token, h = hub) {
  const c = { got: [], closed: false, mark: 0 };
  c.conn = h.connect(s => c.got.push(JSON.parse(s)), () => { c.closed = true; h.disconnect(c.conn); }, '10.0.0.9');
  c.send = m => { c.mark = c.got.length; h.message(c.conn, JSON.stringify(m)); return c; };
  c.since = t => c.got.slice(c.mark).filter(m => !t || m.t === t);          // what the last send() led to
  c.last = t => c.got.filter(m => m.t === t).pop();
  c.err = () => (c.since('err')[0] || {}).msg || '';
  c.me = () => c.got.filter(m => m.t === 'me' || m.t === 'welcome').pop().me;       // what this player knows about itself
  if (token) c.send({ t: 'hello', token });
  return c;
}
const throws = f => { try { f(); return ''; } catch (e) { return e.message; } };
const mark = (...cs) => cs.forEach(c => { c.mark = c.got.length; });

section('rummet');
{
  for (const s of STATIONS) {
    if (s.use) check('man kan stå ved ' + s.id, isFree(...s.use));
    for (const q of s.seats || []) if (!s.on) check('pladsen ved ' + s.id + ' er fri gulvplads', isFree(...q));
  }
  check('indgangen er fri', isFree(...ROOM.spawn));
  const r = mulberry32(7); let bad = 0, far = 0;
  for (let k = 0; k < 400; k++) {
    const a = findPath(ROOM.spawn, [r() * ROOM.w, r() * ROOM.d]).pop(), b = [r() * ROOM.w, r() * ROOM.d], p = findPath(a, b);
    for (const q of p) if (!isFree(...q)) bad++;
    if (pathLen(p) > 60) far++;
  }
  check('stier går kun over fri gulvplads', bad === 0, bad + ' punkter');
  check('stier er ikke urimeligt lange', far === 0);
  check('et tilfældigt look er gyldigt', JSON.stringify(cleanLook(randomLook(5), [])) === JSON.stringify(randomLook(5)));
  check('ukendte ting i et look fjernes', cleanLook({ hair: 99, hat: 'crown', skin: -1 }, []).hat === '' && cleanLook({ hair: 99 }, []).hair === 0);
}

section('konti');
const CODE = store.config.code;
let A, B, C, tokA, tokB, tokC, GID, INV;
{
  check('installationskoden har formen XXXX-XXXX', /^[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(CODE), CODE);
  check('forkert kode afvises', /Koden passer ikke/.test(throws(() => hub.api.register({ name: 'Søren', pass: 'hemmelig1', code: 'NOPE' }, '1.1.1.1'))));
  check('for kort kodeord afvises', /mindst 6/.test(throws(() => hub.api.register({ name: 'Søren', pass: '123', code: CODE }, '1.1.1.1'))));
  check('mærkeligt navn afvises', /Navnet skal/.test(throws(() => hub.api.register({ name: '<b>x</b>', pass: 'hemmelig1', code: CODE }, '1.1.1.1'))));
  const r = hub.api.register({ name: 'Søren', pass: 'hemmelig1', code: CODE.toLowerCase().replace('-', ' ') }, '1.1.1.1');
  tokA = r.token;
  check('konto oprettet med installationskoden', r.name === 'Søren' && /^\d+\.\d+\.[\w-]{32}$/.test(tokA));
  check('samme navn kan ikke bruges igen', /optaget/.test(throws(() => hub.api.register({ name: 'søren', pass: 'hemmelig1', code: CODE }, '1.1.1.1'))));
  check('forkert kodeord afvises', /Forkert/.test(throws(() => hub.api.login({ name: 'Søren', pass: 'forkert' }, '1.1.1.2'))));
  check('login virker uanset store og små bogstaver i navnet', hub.api.login({ name: 'SØREN', pass: 'hemmelig1' }, '1.1.1.2').token === tokA);
  for (let i = 0; i < 8; i++) throws(() => hub.api.login({ name: 'Søren', pass: 'x' + i }, '6.6.6.6'));
  check('for mange forkerte forsøg spærrer adressen', /For mange forsøg/.test(throws(() => hub.api.login({ name: 'Søren', pass: 'hemmelig1' }, '6.6.6.6'))));
  const bad = client('1.1.' + 'x'.repeat(32));
  check('et falsk login afvises og lukkes', bad.closed && bad.last('bye').why === 'login');
  A = client(tokA);
  const w = A.last('welcome');
  check('velkomst med startjetoner', w && w.me.chips === ECON.start && w.me.creator === true && w.groups.length === 0 && w.bonus === 0, JSON.stringify(w && w.me.chips));
  check('adgangskoden står ikke i det, der sendes', !JSON.stringify(A.got).includes('hash') && !JSON.stringify(A.got).includes('salt'));
}

section('grupper');
{
  A.send({ t: 'gnew', name: 'Vennerne' });
  GID = A.last('groups').go;
  check('gruppe oprettet', /^[A-Z2-9]{6}$/.test(GID) && A.last('groups').groups[0].role === 'owner');
  A.send({ t: 'enter', g: GID });
  const room = A.last('room');
  INV = room.g.invite;
  check('ejeren ser invitationskoden', /^[A-Z2-9]{8}$/.test(INV));
  check('invitationen kan slås op', hub.api.invite({ code: INV.toLowerCase() }).group === 'Vennerne');
  tokB = hub.api.register({ name: 'Mads', pass: 'kodeord22', code: INV }, '2.2.2.2').token;
  tokC = hub.api.register({ name: 'Jonas K.', pass: 'kodeord33', code: INV }, '3.3.3.3').token;
  check('den der er inde ser nye medlemmer komme til', A.got.filter(m => m.t === 'mem' && m.m.name).length === 2 && A.got.filter(m => m.t === 'chat').length === 2);
  B = client(tokB); C = client(tokC);
  check('inviterede er medlemmer, men kan ikke lave grupper', B.last('welcome').groups.length === 1 && B.last('welcome').me.creator === false);
  B.send({ t: 'gnew', name: 'Min egen' });
  check('ny gruppe kræver installationskoden', /Installationskoden/.test(B.err()));
  B.send({ t: 'enter', g: GID }); C.send({ t: 'enter', g: GID });
  const rb = B.last('room');
  check('medlemmer ser ikke invitationskoden', rb.g.invite === '');
  check('rummet viser tre medlemmer, to inde', rb.mem.length === 3 && rb.mem.filter(m => m.on).length === 2 && C.last('room').mem.filter(m => m.on).length === 3);
  check('de andre får besked, når nogen kommer ind', A.got.filter(m => m.t === 'on').length === 2);
  const stranger = client(hub.api.register({ name: 'Fremmed', pass: 'kodeord44', code: CODE }, '4.4.4.4').token);
  stranger.send({ t: 'enter', g: GID });
  check('man kommer ikke ind i en gruppe, man ikke er med i', /ikke med/.test(stranger.err()));
  stranger.send({ t: 'say', s: 'hej' });
  check('uden for et klubhus kan man ikke skrive', /Gå ind/.test(stranger.err()));
}

section('gå rundt, snak og fagter');
{
  A.send({ t: 'move', x: 5, y: 9 });
  const mv = B.last('mv');
  check('en flytning når de andre med en sti', mv && mv.u === A.last('welcome').me.id && mv.p.length >= 2 && Math.abs(mv.p[mv.p.length - 1][0] - 5) < 0.01);
  A.send({ t: 'move', x: 11.6, y: 5.9 });
  const end = A.last('mv').p.pop();
  check('et mål midt i et bord flyttes til fri gulvplads', isFree(...end) && Math.hypot(end[0] - 11.6, end[1] - 5.9) < 2.2, end.join(','));
  clock += 60000;
  C.send({ t: 'enter', g: GID });
  const am = C.last('room').mem.find(m => m.name === 'Søren');
  check('den der kommer ind senere ser, hvor de andre står', am.p.length === 1 && am.p[0][0] === end[0]);
  A.send({ t: 'say', s: '  Hej   med\u0000 jer \n <b>!</b> ' });
  const msg = C.last('chat').m;
  check('chat når alle, ryddet for mærkelige tegn', msg.s === 'Hej med jer <b>!</b>' && msg.n === 'Søren' && msg.u > 0, JSON.stringify(msg.s));
  A.send({ t: 'say', s: 'x'.repeat(999) });
  check('lange beskeder kortes af', C.last('chat').m.s.length === 240);
  for (let i = 0; i < 6; i++) A.send({ t: 'say', s: 'spam ' + i });
  check('for mange beskeder i træk bremses', /Rolig nu/.test(A.err()));
  clock += 7000;
  B.send({ t: 'emote', k: 'dance' });
  check('fagter når de andre', A.last('emo').k === 'dance');
  B.send({ t: 'emote', k: 'nope' });
  check('ukendte fagter ignoreres', A.got.filter(m => m.t === 'emo').length === 1);
}

section('drillerier');
{
  const idB = B.last('welcome').me.id, idA = A.last('welcome').me.id;
  A.send({ t: 'prank', k: 'tomato', to: idB });
  const pr = C.last('prank');
  check('en tomat koster og ses af alle', pr && pr.k === 'tomato' && pr.from === idA && pr.to === idB && A.me().chips === ECON.start - PRANKS.tomato.cost);
  A.send({ t: 'prank', k: 'pie', to: idB });
  check('man kan ikke drille hele tiden', /øjeblik/.test(A.err()));
  clock += 2000;
  A.send({ t: 'prank', k: 'pie', to: idA });
  check('man kan ikke drille sig selv', /dig selv/.test(A.err()));
  B.send({ t: 'dnd', on: true });
  A.send({ t: 'prank', k: 'pie', to: idB });
  check('«forstyr ikke» beskytter', /forstyrres/.test(A.err()));
  B.send({ t: 'prank', k: 'snow', to: idA });
  check('og spærrer også for selv at drille', /Forstyr ikke/.test(B.err()));
  B.send({ t: 'dnd', on: false });
  clock += 2000;
  A.send({ t: 'prank', k: 'chicken', to: idB });
  C.send({ t: 'enter', g: GID });
  const bm = C.last('room').mem.find(m => m.id === idB);
  check('en nyankommen ser, at Mads er en høne', bm.fx.some(f => f[0] === 'chicken' && f[1] > 20000), JSON.stringify(bm.fx));
  check('drillerier tælles', bm.stats.gotTeased === 2 && C.last('room').mem.find(m => m.id === idA).stats.teased === 2);
  clock += 40000;
  C.send({ t: 'enter', g: GID });
  check('hønen går over igen', C.last('room').mem.find(m => m.id === idB).fx.length === 0);
}

section('kiosken');
{
  const before = A.me().chips;
  A.send({ t: 'buy', k: 'cap', wear: true });
  check('en kasket kan købes og tages på', A.me().chips === before - ITEMS.cap.cost && A.me().look.hat === 'cap' && A.me().items.includes('cap'));
  check('de andre ser kasketten', B.got.filter(m => m.t === 'mem' && m.m.look).pop().m.look.hat === 'cap');
  A.send({ t: 'buy', k: 'cap' });
  check('samme ting kan ikke købes to gange', /allerede/.test(A.err()));
  A.send({ t: 'buy', k: 'crown' });
  check('for dyrt er for dyrt', /ikke jetoner nok/.test(A.err()));
  A.send({ t: 'look', look: { ...A.me().look, hat: 'crown', hair: 3, skin: 2 } });
  check('man kan ikke tage noget på, man ikke ejer', A.me().look.hat === '' && A.me().look.hair === 3);
  A.send({ t: 'look', look: { ...A.me().look, hat: 'cap' } });
  check('men det man ejer', A.me().look.hat === 'cap');
}

section('baren');
{
  const idA = A.last('welcome').me.id, idB = B.last('welcome').me.id, idC = C.last('welcome').me.id;
  A.send({ t: 'move', x: 4, y: 11 });
  clock += 20000;
  A.send({ t: 'drink', k: 'fadol' });
  check('man bestiller ved baren, ikke nede fra dansegulvet', /Gå op til baren/.test(A.err()));
  A.send({ t: 'sit', st: 'bar' });
  const mv = B.last('mv');
  check('man sætter sig på en barstol', mv.sit && mv.sit[0] === 'bar' && mv.sit[1] === 0 && Math.abs(mv.p[mv.p.length - 1][1] - STATION.bar.seats[0][1]) < 0.01);
  B.send({ t: 'sit', st: 'bar' });
  check('den næste får stolen ved siden af', A.last('mv').sit[1] === 1);
  const chips = A.me().chips;
  A.send({ t: 'drink', k: 'fadol' });
  const d = C.last('drink');
  check('en fadøl til sig selv', d.k === 'fadol' && d.to.length === 1 && d.to[0] === idA && d.buzz[0] === 1 && A.me().chips === chips - DRINKS.fadol.cost);
  A.send({ t: 'drink', k: 'snaps', to: 'all' });
  check('bartenderen skal lige have tid', /Bartenderen/.test(A.err()));
  clock += 2000;
  A.send({ t: 'drink', k: 'snaps', to: 'all' });
  const round = C.last('drink');
  check('en omgang til alle', round.to.length === 3 && A.me().chips === chips - DRINKS.fadol.cost - 3 * DRINKS.snaps.cost && /omgang/.test(C.last('chat').m.s), JSON.stringify(round));
  check('omgangen tælles', A.me().stats.rounds === 1 && A.me().stats.drinks === 4);
  clock += 2000;
  A.send({ t: 'drink', k: 'kaffe', to: idC });
  check('en kop kaffe til Jonas gør ham friskere', C.last('drink').to[0] === idC && C.last('drink').buzz[0] === 1);
  C.send({ t: 'enter', g: GID });
  const am = C.last('room').mem.find(m => m.id === idA);
  check('en nyankommen ser glasset og humøret', am.drink && am.drink[0] === 'snaps' && am.drink[1] > 60000 && am.buzz > 2.9 && am.buzz <= 3, JSON.stringify([am.drink, am.buzz]));
  clock += BAR.soberMin * 60e3 * 2;
  C.send({ t: 'enter', g: GID });
  const am2 = C.last('room').mem.find(m => m.id === idA);
  check('det går over igen', am2.drink === null && Math.abs(am2.buzz - 1) < 0.11, JSON.stringify([am2.drink, am2.buzz]));
  A.send({ t: 'drink', k: 'vodka' });
  check('det, der ikke står på kortet, kan ikke købes', /har baren ikke/.test(A.err()));
  A.send({ t: 'move', x: 10, y: 8 }); B.send({ t: 'move', x: 12, y: 8 });
  check('man rejser sig, når man går', A.last('mv').sit === null);
  clock += 20000;
}

section('4 på stribe mellem to');
let TID;
{
  const idA = A.last('welcome').me.id, idB = B.last('welcome').me.id;
  const a0 = A.me().chips, b0 = B.me().chips;
  A.send({ t: 'tnew', game: 'c4', stake: 25, invite: idB });
  TID = A.last('tv').tv.id;
  check('et bord med indsats', A.last('tv').tv.phase === 'open' && A.last('tv').tv.pot === 25 && A.me().chips === a0 - 25);
  check('Søren sætter sig ved brætspilsbordet', A.last('mv').sit[0] === 'games' && A.last('mv').sit[1] === 0);
  check('Mads bliver budt op', B.last('inv') && B.last('inv').id === TID && B.last('inv').stake === 25);
  check('alle ser bordet på listen', C.last('tb').tb.id === TID && C.last('tb').tb.seats.length === 1);
  C.send({ t: 'tact', id: TID, a: { c: 3 } });
  check('en tilskuer kan ikke rykke', /sidder ikke/.test(C.err()));
  B.send({ t: 'tjoin', id: TID });
  let tv = B.last('tv').tv;
  check('spillet starter, når den anden sætter sig', tv.phase === 'play' && tv.pot === 50 && tv.me === 1 && tv.turn === 0 && B.me().chips === b0 - 25);
  check('Mads sidder over for Søren', B.last('mv').sit[0] === 'games' && B.last('mv').sit[1] === 1);
  B.send({ t: 'tact', id: TID, a: { c: 0 } });
  check('man kan ikke rykke uden for tur', /ikke din tur/.test(B.err()));
  A.send({ t: 'move', x: 1, y: 1 });
  check('man bliver siddende, mens bordet er åbent', A.since('mv').length === 0);
  C.send({ t: 'topen', id: TID });
  check('en tilskuer kan se med', C.last('tv').tv.me === -1 && C.last('tv').tv.v.b.length === 42);
  for (const [who, c] of [[A, 3], [B, 0], [A, 3], [B, 1], [A, 3], [B, 2]]) who.send({ t: 'tact', id: TID, a: { c } });
  check('tilskueren følger trækkene', C.last('tv').tv.v.n === 6 && C.last('tv').tv.turn === 0);
  A.send({ t: 'tact', id: TID, a: { c: 9 } });
  check('en kolonne der ikke findes afvises', /Vælg en kolonne/.test(A.err()));
  A.send({ t: 'tact', id: TID, a: { c: 3 } });
  tv = B.last('tv').tv;
  check('fire på stribe vinder', tv.phase === 'over' && tv.res.win[0] === 0 && tv.v.line.join() === '3,10,17,24', JSON.stringify(tv.res));
  check('vinderen får puljen og en belønning', A.me().chips === a0 + 25 + ECON.win && tv.res.pay[0] === 50 + ECON.win, A.me().chips + ' mod ' + (a0 + 25 + ECON.win));
  check('taberen får lidt for at være med', B.me().chips === b0 - 25 + ECON.loss);
  check('resultatet tælles', A.me().stats.c4.w === 1 && A.me().stats.c4.p === 1 && B.me().stats.c4.w === 0 && B.me().stats.c4.p === 1);
  check('og nævnes i chatten', /Søren vandt over Mads i 4 på stribe og fik puljen på 50 jetoner/.test(C.last('chat').m.s), C.last('chat').m.s);
  A.send({ t: 'tact', id: TID, a: { c: 2 } });
  check('efter slut kan der ikke rykkes', /ikke i gang/.test(A.err()));

  A.send({ t: 'tagain', id: TID });
  check('revanche venter på den anden', B.last('tv').tv.phase === 'over' && B.last('tv').tv.again.includes(idA) && A.me().chips === a0 + ECON.win);
  B.send({ t: 'tagain', id: TID });
  tv = A.last('tv').tv;
  check('revanchen starter med den anden først', tv.phase === 'play' && tv.turn === 1 && tv.pot === 50 && tv.n === 2 && tv.v.n === 0);
  B.send({ t: 'tact', id: TID, a: { resign: true } });
  tv = A.last('tv').tv;
  check('at give op giver den anden puljen, men ingen belønning for en kamp uden træk', tv.phase === 'over' && tv.res.why === 'resign' && tv.res.pay[0] === 50 && tv.res.pay[1] === 0 && A.me().stats.c4.p === 1);
  B.send({ t: 'tleave', id: TID });
  check('når en går, kan der ikke spilles igen', A.last('tv').tv.seats[1].left === 1);
  A.send({ t: 'tagain', id: TID });
  check('… og det siges', /er gået/.test(A.err()));
  check('Mads har rejst sig', C.got.filter(m => m.t === 'mem' && m.m.id === idB && 'open' in m.m).pop().m.open === 0);
  A.send({ t: 'tleave', id: TID }); C.send({ t: 'tclose' });
  check('bordet forsvinder, når alle er gået', C.last('tbx').id === TID);
  check('pengene stemmer: det ene er gået til det andet', A.me().chips + B.me().chips === a0 + b0 + ECON.win + ECON.loss);
}

section('uafgjort, opgivelse før start og ventetid');
{
  const idB = B.last('welcome').me.id, a0 = A.me().chips, b0 = B.me().chips;
  A.send({ t: 'tnew', game: 'c4', stake: 10 });
  const id = A.last('tv').tv.id;
  A.send({ t: 'tleave', id });
  check('forlader man et bord, der venter, kommer indsatsen tilbage', A.me().chips === a0 && C.last('tbx').id === id);
  A.send({ t: 'tnew', game: 'c4', stake: 10 });
  const id2 = A.last('tv').tv.id;
  B.send({ t: 'tjoin', id: id2 });
  // a full board without four in a row: columns filled in an order that never lines up
  const order = [0, 1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 0, 2, 3, 2, 3, 2, 3, 3, 2, 3, 2, 3, 2, 4, 5, 4, 5, 4, 5, 5, 4, 5, 4, 5, 4, 6, 6, 6, 6, 6, 6];
  for (let i = 0; i < order.length; i++) (i % 2 ? B : A).send({ t: 'tact', id: id2, a: { c: order[i] } });
  const tv = A.last('tv').tv;
  check('et fuldt bræt uden fire på stribe er uafgjort', tv.phase === 'over' && tv.res.draw && tv.v.n === 42, JSON.stringify(tv.res) + ' ' + A.err() + B.err());
  check('ved uafgjort får begge indsatsen tilbage og lidt til', A.me().chips === a0 + ECON.draw && B.me().chips === b0 + ECON.draw);
  check('uafgjort tælles', A.me().stats.c4.d === 1);
  A.send({ t: 'tleave', id: id2 }); B.send({ t: 'tleave', id: id2 });

  A.send({ t: 'tnew', game: 'c4', stake: 0 });
  const id3 = A.last('tv').tv.id;
  B.send({ t: 'tjoin', id: id3 });
  A.send({ t: 'tact', id: id3, a: { c: 3 } });
  A.send({ t: 'tclose' }); B.send({ t: 'tclose' });
  check('et spil kan ligge og vente på næste træk', C.last('tb').tb.phase === 'play' && C.last('tb').tb.turn === 1);
  A.send({ t: 'tclaim', id: id3 });
  check('man kan ikke tage sejren med det samme', /48 timer/.test(A.err()));
  clock += 47 * 3600e3;
  hub.tidy();
  A.send({ t: 'tclaim', id: id3 });
  check('heller ikke efter 47 timer', /48 timer/.test(A.err()));
  clock += 2 * 3600e3;
  B.send({ t: 'tclaim', id: id3 });
  check('den der selv skal rykke kan ikke tage den', /ikke den anden/.test(B.err()));
  A.send({ t: 'tclaim', id: id3 });
  check('efter 48 timer kan den der venter tage sejren', C.last('tb').tb.phase === 'over' && C.last('tb').tb.res.why === 'time' && /ikke rykkede i tide/.test(C.last('chat').m.s));
  clock += 4 * 60e3; hub.tidy();
  check('et færdigt bord ryddes væk af sig selv', C.last('tbx').id === id3);
  void idB;
}

section('mod robotten');
{
  const a0 = A.me().chips;
  A.send({ t: 'tnew', game: 'c4', stake: 25, bot: 2 });
  check('robotten spiller ikke om jetoner', /Robotten spiller ikke/.test(A.err()) && A.me().chips === a0);
  let wins = 0, games = 0;
  for (const level of [1, 3]) {
    A.send({ t: 'tnew', game: 'c4', stake: 0, bot: level });
    let tv = A.last('tv').tv;
    check('spil mod robot (niveau ' + level + ') starter med det samme', tv.phase === 'play' && tv.seats[1].bot === level && /Robotten/.test(tv.seats[1].n));
    const r = mulberry32(level * 11);
    for (let guard = 0; guard < 60 && tv.phase === 'play'; guard++) {
      check('det er altid menneskets tur, når robotten har svaret', tv.turn === 0);
      const free = [0, 1, 2, 3, 4, 5, 6].filter(c => !tv.v.b[35 + c]);
      A.send({ t: 'tact', id: tv.id, a: { c: free[Math.floor(r() * free.length)] } });
      tv = A.last('tv').tv;
    }
    check('spillet mod robotten bliver færdigt', tv.phase === 'over', JSON.stringify(tv.res));
    games++; if (tv.res.win[0] === 0) wins++;
    A.send({ t: 'tleave', id: tv.id });
  }
  check('robotspil nævnes ikke i chatten', !/Robotten/.test(C.last('chat').m.s));
  check('robotten vinder over tilfældige træk på svært niveau', wins < games, wins + ' af ' + games);
  check('en sejr over robotten giver lidt, et nederlag intet', A.me().chips === a0 + wins * ECON.botWin);
}

section('én forbindelse ad gangen, og at gå offline');
{
  const idA = A.last('welcome').me.id;
  const A2 = client(tokA);
  check('logger man ind et andet sted, lukkes det første', A.closed && A.last('bye').why === 'other' && A2.last('welcome').me.id === idA);
  check('de andre ser, at den første forlod rummet', B.last('off').u === idA);
  A2.send({ t: 'enter', g: GID });
  check('og kom ind igen', B.last('on').m.id === idA);
  A = A2;
  mark(B);
  C.conn.close();
  check('lukker man browseren, ser de andre det', B.last('off').u === C.last('welcome').me.id && B.last('off').seen === clock);
  C = client(tokC); C.send({ t: 'enter', g: GID });
}

section('admin');
{
  const idA = A.last('welcome').me.id, idB = B.last('welcome').me.id, idC = C.last('welcome').me.id;
  B.send({ t: 'grename', name: 'Mads styrer' });
  check('et medlem kan ikke omdøbe gruppen', /admin/.test(B.err()));
  B.send({ t: 'gkick', u: idC });
  check('… eller smide nogen ud', /admin/.test(B.err()));
  A.send({ t: 'grename', name: 'Torsdagsklubben' });
  check('admin kan omdøbe', C.last('g').g.name === 'Torsdagsklubben');
  A.send({ t: 'ginvite' });
  const inv2 = A.last('g').g.invite;
  check('et nyt invitationslink gør det gamle ugyldigt', inv2 !== INV && /findes ikke/.test(throws(() => hub.api.invite({ code: INV }))) && hub.api.invite({ code: inv2 }).group === 'Torsdagsklubben');
  check('kun admin får det nye link', !B.got.some(m => m.t === 'g' && m.g.invite));
  INV = inv2;
  A.send({ t: 'grole', u: idB, role: 'admin' });
  check('ejeren kan gøre en anden til admin, som så ser linket', B.got.filter(m => m.t === 'mem' && m.m.role && m.m.id === idB).pop().m.role === 'admin' && B.last('g').g.invite === INV);
  B.send({ t: 'gkick', u: idA });
  check('en admin kan ikke smide ejeren ud', /ejer/.test(B.err()));
  // Jonas sits at a table with a stake when he is removed
  const c0 = C.me().chips;
  C.send({ t: 'tnew', game: 'c4', stake: 10 });
  B.send({ t: 'gkick', u: idC });
  check('den der tages ud får sin indsats tilbage og sendes ud', C.me().chips === c0 && C.last('out').g === GID && C.last('groups').groups.length === 0);
  check('de andre ser, at han er væk', A.last('gone').u === idC && /taget ud/.test(A.last('chat').m.s));
  C.send({ t: 'enter', g: GID });
  check('og han kan ikke komme ind igen', /ikke med/.test(C.err()));
  C.send({ t: 'gjoin', code: INV });
  check('… før han får et nyt link', C.last('groups').go === GID);
  C.send({ t: 'enter', g: GID });
  A.send({ t: 'gleave' });
  check('ejeren kan ikke bare gå', /Giv gruppen videre/.test(A.err()));
  A.send({ t: 'grole', u: idB, role: 'owner' });
  check('gruppen kan gives videre', C.last('g').g.owner === idB);
  A.send({ t: 'gdel' });
  check('den gamle ejer kan ikke længere slette', /ejer/.test(A.err()));
  B.send({ t: 'grole', u: idA, role: 'owner' });
  check('… og få den tilbage', C.last('g').g.owner === idA);
}

section('kodeord og dagens jetoner');
{
  A.send({ t: 'pass', old: 'forkert', pass: 'nytkodeord' });
  check('kodeordet skiftes ikke uden det gamle', /passer ikke/.test(A.err()));
  A.send({ t: 'pass', old: 'hemmelig1', pass: 'nytkodeord' });
  const t2 = A.last('token').token;
  check('nyt kodeord giver et nyt login', t2 && t2 !== tokA);
  const old = client(tokA);
  check('det gamle login virker ikke længere', old.closed && old.last('bye').why === 'login');
  check('det nye kodeord virker', hub.api.login({ name: 'Søren', pass: 'nytkodeord' }, '9.9.9.9').token === t2);
  tokA = t2;
  const chips = A.me().chips;
  clock += 24 * 3600e3;
  A = client(tokA);
  check('første besøg næste dag giver dagens jetoner', A.last('welcome').bonus === ECON.daily && A.last('welcome').me.chips === chips + ECON.daily);
  A = client(tokA);
  check('men kun én gang om dagen', A.last('welcome').bonus === 0);
  A.send({ t: 'enter', g: GID });
}

section('EagleEye Commander');
let EE;
{
  const idA = A.me().id, idB = B.me().id, a0 = A.me().chips, b0 = B.me().chips;
  A.send({ t: 'enew', name: '  Operation   Test ' });
  const open = A.last('eopen');
  EE = open.code;
  check('en ny kamp åbner med et login til den ene general', /^[A-Z2-9]{6}$/.test(EE) && /^[A-Z0-9]{6}\.\d+\.[\w-]{32}$/.test(open.token));
  check('gruppen ser kampen', C.last('ee').m.code === EE && C.last('ee').m.name === 'Operation Test' && C.last('ee').m.players.length === 1 && C.last('ee').m.host === idA);
  check('værten sætter sig ved kommandobordet', B.last('mv').sit[0] === 'command' && B.got.filter(m => m.t === 'mem' && m.m.busy).pop().m.busy === 'ee');
  A.send({ t: 'move', x: 2, y: 2 });
  check('og bliver siddende, mens kampen er åben', A.since('mv').length === 0);
  B.send({ t: 'ejoin', code: EE });
  const tokB2 = B.last('eopen').token;
  check('en ven går med fra klubhuset', C.last('ee').m.players.length === 2 && C.last('ee').m.players[1].u === idB && tokB2 !== open.token);
  C.send({ t: 'eopen', code: EE });
  check('den der ikke er med kan ikke åbne kampen', /ikke med/.test(C.err()));
  // the game page's own calls, with the login it was handed
  let v = ee.api.state({ token: open.token, rev: -1 }).view;
  check('spillets side ser kampen som sin general', v.me.name === 'Søren' && v.phase === 'lobby' && v.host === v.me.id && v.players.length === 2);
  check('et forfalsket login afvises', /kommandobordet/.test(throws(() => ee.api.state({ token: open.token.slice(0, -3) + 'abc', rev: -1 }))));
  check('spillets egen forside kan ikke lave kampe', /kommandobordet/.test(throws(() => ee.api.create({ game: 'x', name: 'y', pin: '1234' }))) && ee.api.list({}).mine.length === 0);
  check('kun værten kan starte', /værten/.test(throws(() => ee.api.act({ token: tokB2, act: { a: 'start' } }))));
  ee.api.act({ token: open.token, act: { a: 'addBot' } });
  check('en AI-general ses i klubhuset som robot', C.last('ee').m.players.length === 3 && C.last('ee').m.players[2].ai && C.last('ee').m.players[2].u === 0);
  ee.api.act({ token: open.token, act: { a: 'start' } });
  check('kampen starter, og klubhuset ser det', C.last('ee').m.phase === 'play' && C.last('ee').m.round === 1);
  B.send({ t: 'eleave', code: EE });
  check('en kamp i gang kan man ikke forlade', /i gang/.test(B.err()));
  C.send({ t: 'edrop', code: EE });
  check('et almindeligt medlem kan ikke fjerne andres kamp', /værten/.test(C.err()));
  A.send({ t: 'eclose' });
  check('værten rejser sig, når siden lukkes', B.got.filter(m => m.t === 'mem' && 'busy' in m.m && m.m.id === idA).pop().m.busy === '' && B.last('mv').sit === null);
  const A3 = client(tokA);
  check('«din tur» tæller med på gruppelisten', A3.last('welcome').groups[0].turn >= 1);
  A = A3; A.send({ t: 'enter', g: GID });
  check('kampen er med, når man går ind i klubhuset', A.last('room').ee.length === 1 && A.last('room').ee[0].code === EE && A.last('room').ee[0].players[0].ready === false);
  ee.api.act({ token: open.token, act: { a: 'ready', on: true } });
  check('klubhuset ser, hvem der har meldt klar', C.last('ee').m.players[0].ready === true && C.last('ee').m.round === 1);
  ee.api.act({ token: tokB2, act: { a: 'ready', on: true } });
  check('når alle er klar, udkæmpes runden', C.last('ee').m.round === 2 && C.last('ee').m.players[0].ready === false, JSON.stringify(C.last('ee').m));
  // the end of the match: the first rounds earn nothing, a real match pays the winner and the others
  const g = ee._debug.load(EE);
  g.phase = 'over'; g.round = 6; g.winner = { team: 'P1', names: ['Søren'] }; g.rev++;
  v = ee.api.state({ token: open.token, rev: -1 }).view;
  check('en vundet kamp betaler vinderen og de andre', A.me().chips === a0 + ECON.ee.win && B.me().chips === b0 + ECON.ee.play && A.me().stats.ee.w === 1 && B.me().stats.ee.p === 1, A.me().chips + '/' + B.me().chips);
  check('og nævnes i chatten', /Søren vandt «Operation Test» i EagleEye Commander/.test(C.last('chat').m.s));
  g.rev++; ee.api.state({ token: open.token, rev: -1 });
  check('men kun én gang', A.me().chips === a0 + ECON.ee.win);
  // a second match that never starts: leave and remove
  B.send({ t: 'enew', name: 'Kort kamp' });
  const code2 = B.last('eopen').code;
  A.send({ t: 'ejoin', code: code2 });
  B.send({ t: 'eleave', code: code2 });
  check('forlader værten før start, går kampen videre til den næste', C.last('ee').m.code === code2 && C.last('ee').m.host === idA && C.last('ee').m.players.length === 1);
  A.send({ t: 'eleave', code: code2 });
  check('og den sidste, der går, lukker kampen', C.last('eex').code === code2 && !ee.get(code2));
  A.send({ t: 'eclose' }); B.send({ t: 'eclose' });
}

section('skydespillet: banen, og hvor robotterne kan gå');
{
  const N = nullThree(), w = buildWorld(N, N, N);
  const sig = o => crypto.createHash('sha1').update(JSON.stringify(o)).digest('hex').slice(0, 16);
  // Is the arena changed on purpose, this number must be changed with it.
  check('banen har de vægge, gulve og lofter, den plejer', w.colliders.length === 1017 && w.surfaces.length === 534 && w.ceilings.length === 5 && sig([w.colliders, w.surfaces, w.ceilings]) === 'f2574a4bf0300b1c', [w.colliders.length, w.surfaces.length, w.ceilings.length, sig([w.colliders, w.surfaces, w.ceilings])].join(' '));
  // the browser builds it with the real three.js: the same numbers must come out
  const THREE = await import('../public/shooter/vendor/three.module.min.js'), { makeTextures } = await import('../public/shooter/tex.js');
  const hadDoc = 'document' in globalThis;
  if (!hadDoc) globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => N }) };
  const scene = new THREE.Scene(), w3 = buildWorld(THREE, scene, makeTextures(THREE));
  if (!hadDoc) delete globalThis.document;
  check('browserens bane (med three.js) er den samme som serverens', sig([w3.colliders, w3.surfaces, w3.ceilings]) === sig([w.colliders, w.surfaces, w.ceilings]) && scene.children.length > 1000);
  check('toget kører i ring og er samme sted til samme tid', (() => { w.setTrain(50); const a = [w.bazCar.cx, w.bazCar.cz]; w3.setTrain(50); w.setTrain(50 + w.LOOP_L); return Math.hypot(a[0] - w3.bazCar.cx, a[1] - w3.bazCar.cz) < 1e-9 && Math.hypot(a[0] - w.bazCar.cx, a[1] - w.bazCar.cz) < 1e-6; })());

  const nav = buildNav(w, [[0, -52, 0], [0, 52, 0]]);
  check('gå-nettet lader banen være, som den var', sig([w.colliders, w.surfaces]) === sig([w3.colliders, w3.surfaces]));
  const home = nav.near(0, 0, -52), spots = { 'det røde tårns top': [-29.5, 7.98, -45.5], 'det blå tårns top': [30.5, 7.98, 46.5], 'venstre midttårns top': [-15.5, 7.98, 0.5], 'højre midttårns top': [16.5, 7.98, 0.5],
    'den røde kælder': [8, -3.8, -46], 'den blå kælder': [-10, -3.8, 46], 'tunnelen': [-2, -3.8, -4.5] };
  for (const p of w.PICKUPS) spots['våbnet ved ' + p.x + ',' + p.z] = [p.x + (p.y ? 0.5 : 0), p.y ? 7.98 : 0, p.z + (p.y ? 0.5 : 0)];
  for (const p of w.HEALTH_PACKS) spots['førstehjælpen ved ' + p.x + ',' + p.z] = [p.x, 0, p.z];
  for (const [name, [x, y, z]] of Object.entries(spots)) {
    const n = nav.near(x, y, z, 3);
    check('robotter kan gå til ' + name + ' og tilbage', n >= 0 && !!nav.path(home, n) && !!nav.path(n, home));
  }
  // A real walker (the arena's own movement rules) follows the path: steering a little ahead, swaying to both sides.
  // When it gets nowhere it hops and finds a new way, as the robots do. It must arrive, and must not fall on the way.
  function walk(from, to, { sprint, dt, drift }) {
    let path = nav.path(from, to), i = 1, t = 0, stuck = 0, best = 1e9, tries = 0, air = 0;
    const p = w.newWalker(nav.x[from], nav.z[from], nav.y[from]), inp = { mx: 0, mz: 0, sprint, jump: false };
    while (path && i < path.length && t < 45) {
      const n = path[Math.min(path.length - 1, i + (sprint ? 1 : 0))], dx = nav.x[n] - p.x, dz = nav.z[n] - p.z, d = Math.hypot(dx, dz) || 1, sway = Math.sin(t * 2.3) * drift;
      inp.mx = dx / d - dz / d * sway; inp.mz = dz / d + dx / d * sway;
      const l = Math.hypot(inp.mx, inp.mz); inp.mx /= l; inp.mz /= l;
      inp.jump = stuck > 0.5 && stuck < 0.6;
      w.stepPlayer(p, inp, dt); t += dt;
      if (!p.grounded && !inp.jump && p.vy < -4) air += dt;
      while (i < path.length && Math.hypot(nav.x[path[i]] - p.x, nav.z[path[i]] - p.z) < (sprint ? 0.7 : 0.45) && Math.abs(nav.y[path[i]] - p.y) < 0.45) { i++; best = 1e9; stuck = 0; }
      if (i < path.length) { const dn = Math.hypot(nav.x[path[i]] - p.x, nav.z[path[i]] - p.z); if (dn < best - 0.02) { best = dn; stuck = 0; } else stuck += dt; }
      if (stuck > 1.5 && tries++ < 6) { path = nav.path(nav.near(p.x, p.y, p.z, 3), to); i = 1; stuck = 0; best = 1e9; }
    }
    return !!path && i >= path.length && air < 0.25;
  }
  for (const [name, x, z] of [['røde', -30, -46], ['blå', 30, 46], ['venstre midt', -16, 0], ['højre midt', 16, 0]]) {
    const top = nav.near(x + 0.5, 7.98, z + 0.5, 3), base = nav.near(x, 0, z + (z > 0 ? -9 : 9), 3);
    let up = true, down = true;
    for (const o of [{ sprint: false, dt: 1 / 60, drift: 0.25 }, { sprint: true, dt: 1 / 60, drift: 0.25 }, { sprint: false, dt: 1 / 40, drift: -0.25 }, { sprint: true, dt: 1 / 20, drift: 0.2 }]) {
      if (!walk(base, top, o)) up = false;
      if (!walk(top, base, o)) down = false;
    }
    check('op ad trappen i det ' + name + ' tårn, i gang og i løb, med slinger til begge sider', up);
    check('og ned igen', down);
  }
  // bullets
  const pistol = WEAPONS.pistol, d = aimDir(...dirAim(0.3, 0.1, -1));
  check('sigte og retning passer sammen', Math.abs(d[0] - 0.3 / Math.hypot(0.3, 0.1, 1)) < 1e-9 && Math.abs(d[1] - 0.1 / Math.hypot(0.3, 0.1, 1)) < 1e-9);
  check('skaden falder med afstanden', falloff(pistol, 10) === 1 && falloff(pistol, 90) === pistol.fallMin && falloff(pistol, 57.5) > pistol.fallMin && falloff(pistol, 57.5) < 1);
  check('hoved og krop rammes hver for sig', zoneAt(0, 0, 0, 0, 1.9, 0.2) === 'head' && zoneAt(0, 0, 0, 0.3, 1.0, 0) === 'body' && zoneAt(0, 0, 0, 0.9, 1.0, 0) === null);
  // a sniper bullet at 200 m/s must not jump through a wall or a person, even with long steps
  const s1 = newShot([0, 1.5, 40], [0, 0, 1], 200, 0), hit1 = flyShot(s1, 0.05, (x, y, z) => zoneAt(0, 0, 46, x, y, z));
  const s2 = newShot([0, 1.5, 40], [0, 0, 1], 200, 0); let wall = null; for (let k = 0; k < 10 && !wall; k++) wall = flyShot(s2, 0.05, (x, y, z) => w.hitWorld(x, y, z) ? 'wall' : null);
  check('en hurtig kugle springer ikke gennem en person eller ud gennem hækken', hit1 === 'body' && wall === 'wall' && s2.z < 55.5);
}

section('skydespillet: en kamp i arkaden');
{
  const idA = A.me().id, idB = B.me().id, idC = C.me().id;
  for (const c of [A, B, C]) { c.send({ t: 'eclose' }); c.send({ t: 'tclose' }); }
  const tickFor = secs => { for (let i = 0; i < Math.round(secs * 20); i++) { clock += 50; arena.tick(0.05); } };
  const mine = c => arena.of(c.me().id);
  // says where one is (as the browser does 20 times a second)
  const at = (c, x, y, z, yaw = 0, flags = FLAG.ground, w = 0) => { const r = mine(c); c.send({ t: 'as', q: r.e.seq, d: [x, y, z, yaw, 0, flags, w, -1] }); };
  // a long way at once is only believed when it is said for a second (as a browser does after a hiccup)
  const go = (c, x, y, z, yaw = 0, w = 0) => { for (let k = 0; k < 22; k++) { at(c, x, y, z, yaw, FLAG.ground, w); tickFor(0.05); } };
  let shot = 100;
  const shoot = (c, wi, to, zone) => {          // fires at somebody and says where the bullet hit
    const r = mine(c), e = r.e, v = arena.of(to).e, o = [e.x, e.y + EYE, e.z], p = [v.x, v.y + (zone ? 1.85 : 1.1), v.z], l = Math.hypot(p[0] - o[0], p[1] - o[1], p[2] - o[2]);
    c.send({ t: 'af', w: wi, o, d: [(p[0] - o[0]) / l, (p[1] - o[1]) / l, (p[2] - o[2]) / l], i: ++shot });
    tickFor(0.2);
    c.send({ t: 'ah', i: shot, to: v.id, z: zone, p });
  };

  mark(A, B, C);
  A.send({ t: 'anew', mode: 'ffa', fill: 0, level: 2 });
  const ain = A.last('ain');
  check('en ny kamp sender spilleren ind på banen', !!ain && ain.mode === 'ffa' && ain.ents.length === 1 && ain.you === ain.ents[0].id && A.last('asp').id === ain.you);
  check('gruppen ser kampen og hvem der er i den', C.last('ar').m.who.length === 1 && C.last('ar').m.who[0] === idA && C.last('ar').m.mode === 'ffa');
  check('spilleren står ved arkaden imens', C.got.filter(m => m.t === 'mem' && m.m.id === idA).pop().m.busy === 'shooter');
  B.send({ t: 'ajoin', id: ain.id });
  check('en ven går med i kampen', !!B.last('ain') && B.last('ain').ents.length === 2 && A.last('aent').add[0].n === B.me().name && C.last('ar').m.who.length === 2);
  check('uden robotter er der ingen', C.last('ar').m.bots === 0);
  tickFor(ARENA.countdown + 0.2);
  check('efter nedtællingen er runden i gang', A.last('ast').state === 'active');
  check('alle får at vide, hvor de andre er', A.last('ax').p.length === 2 && A.last('ax').s > 0);
  // a shot before one has a firearm does nothing; the knife is always there
  mark(A); at(A, 2, 0, 44, Math.PI); tickFor(0.1);
  check('et langt hop på én gang tror serveren ikke på', Math.abs(mine(A).e.z - 44) > 1);
  go(A, 2, 0, 44, Math.PI); go(B, 2, 0, 50, 0); tickFor(ARENA.protect);
  check('serveren tror på, hvor spillerne siger, de er', Math.abs(mine(A).e.z - 44) < 0.01 && Math.abs(mine(B).e.z - 50) < 0.01);
  mark(A, B); shoot(A, 1, idB, 0);
  check('man kan ikke skyde med et våben, man ikke har', B.since('ahit').length === 0 && mine(B).e.hp === 100);
  // the pistol lies at (-34, 0): walk over it
  go(A, -34, 0, 0); tickFor(0.2);
  check('et våben samles op ved at gå hen over det', (mine(A).e.owned & 2) === 2 && A.last('apk').by === mine(A).e.id && A.last('apk').on === 0);
  go(B, -34, 0, 0); tickFor(0.2);
  check('og er væk for den næste, til det kommer igen', (mine(B).e.owned & 2) === 0);
  tickFor(ARENA.pickupBack);
  check('det kommer igen efter et stykke tid, og så får den næste det', (mine(B).e.owned & 2) === 2);
  go(A, 2, 0, 44, Math.PI, 1); go(B, 2, 0, 50, 0); tickFor(0.3);
  mark(A, B); shoot(A, 1, idB, 0);
  check('et skud, der rammer, giver skade', mine(B).e.hp === 100 - WEAPONS.pistol.dmg && B.last('ahit').hp === 70 && B.last('ahit').by === mine(A).e.id);
  tickFor(0.3); shoot(A, 1, idB, 1);
  check('et hovedskud giver mere', mine(B).e.hp === 70 - WEAPONS.pistol.dmg * WEAPONS.pistol.head);
  // a claim about somebody far from where the bullet is said to have hit is not believed
  tickFor(0.3); mark(B);
  { const e = mine(A).e; A.send({ t: 'af', w: 1, o: [e.x, e.y + EYE, e.z], d: [0, 0, 1], i: ++shot }); tickFor(0.2); A.send({ t: 'ah', i: shot, to: mine(B).e.id, z: 0, p: [20, 1, 30] }); }
  check('en træffer et helt andet sted tæller ikke', B.since('ahit').length === 0);
  tickFor(0.3); mark(B); A.send({ t: 'ah', i: shot, to: mine(B).e.id, z: 0, p: [2, 1.1, 50] });
  check('og samme skud kan ikke ramme to gange', B.since('ahit').length === 0);
  tickFor(0.3); shoot(A, 1, idB, 0);
  const kill = A.last('akill');
  check('den sidste skade slår ihjel, og drabet tælles', !mine(B).e.alive && kill.to === mine(B).e.id && kill.by === mine(A).e.id && mine(A).e.kills === 1 && mine(B).e.deaths === 1);
  tickFor(ARENA.respawn + 0.2);
  check('man kommer tilbage et nyt sted med fuldt liv', mine(B).e.alive && mine(B).e.hp === 100 && B.last('asp').id === mine(B).e.id);
  // the knife
  { const b = mine(B).e; go(A, b.x, b.y, b.z - 1.5, Math.PI, 0); tickFor(ARENA.protect);
    A.send({ t: 'af', w: 0, o: [b.x, b.y + EYE, b.z - 1.5], d: [0, 0, 1], i: ++shot }); }
  check('kniven rammer den, der står lige foran', mine(B).e.hp === 100 - WEAPONS.knife.dmg);
  // standing still for a long time
  mark(C);
  for (let k = 0; k < 4; k++) { const a = mine(A).e; at(A, a.x + 0.2 * (k + 1), a.y, a.z, Math.PI); tickFor(ARENA.idleKick / 4 + 1); }
  check('den, der står stille længe, sendes tilbage til klubhuset', !mine(B) && B.last('aout').why === 'idle' && !!mine(A));
  check('og rejser sig fra arkaden', C.got.filter(m => m.t === 'mem' && m.m.id === idB).pop().m.busy === '');
  A.send({ t: 'aleave' });
  check('når den sidste går, er kampen væk', arena.size() === 0 && C.last('arx').id === ain.id && A.last('aout').why === '');

  // --- with robots, on teams ---
  mark(A, B, C);
  A.send({ t: 'anew', mode: 'tdm', fill: 6, level: 2 });
  const m2 = mine(A).m, botsOf = () => [...m2.ents.values()].filter(e => e.kind === 'bot'), team = t => [...m2.ents.values()].filter(e => e.team === t).length;
  check('robotter fylder op til det ønskede antal, lige mange på hvert hold', botsOf().length === 5 && team('A') === 3 && team('B') === 3 && A.last('ain').ents.filter(e => e.bot).length === 5);
  B.send({ t: 'ajoin', id: A.last('ain').id });
  check('en robot giver plads, når en ven kommer, og vennen kommer på det andet hold', botsOf().length === 4 && team('A') === 3 && team('B') === 3 && mine(B).e.team !== mine(A).e.team);
  mark(A); A.send({ t: 'at' });
  check('man kan ikke skifte hold, så alle mennesker står på samme side', A.since('amsg')[0].k === 'full' && mine(B).e.team !== mine(A).e.team);
  A.send({ t: 'anew', mode: 'stars', fill: 0, level: 1 });
  check('en ny kamp tager en ud af den gamle', mine(A).m !== m2 && [...m2.ents.values()].filter(e => e.kind === 'human').length === 1 && botsOf().length === 5);
  C.send({ t: 'anew', mode: 'ffa', fill: 0, level: 1 });
  check('en gruppe kan have to kampe ad gangen, ikke tre', /allerede 2 kampe/.test(C.err()));
  A.send({ t: 'aleave' });
  // B and the robots: a whole round is played out
  const a0 = B.me().chips, start = clock;
  let ended = null;
  for (let k = 0; k < 20 * 60 * 12 && !ended; k++) {
    clock += 50; arena.tick(0.05);
    if (k % 20 === 0 && mine(B) && mine(B).e.alive) { const e = mine(B).e; at(B, e.x + (k % 40 ? 0.3 : -0.3), e.y, e.z, k / 100); }
    const st = B.last('ast'); if (st && st.state === 'ended') ended = st;
  }
  check('robotterne spiller en runde til ende', !!ended && (ended.kills[0] >= MODES.tdm.goal || ended.kills[1] >= MODES.tdm.goal || (clock - start) / 1000 >= MODES.tdm.time), ended ? JSON.stringify(ended.kills) : 'ingen ende');
  check('alle står på tavlen bagefter', !!ended && ended.rows.length === 6 && ended.rows.reduce((n, r) => n + r.k, 0) >= 20);
  const mineRow = ended && ended.rows.find(r => r.id === mine(B).e.id), paid = B.me().chips - a0;
  check('mod robotter alene giver en runde den lille belønning', !!mineRow && paid === mineRow.chips && (paid === ECON.shooter.botWin || paid === ECON.shooter.botPlay), String(paid));
  check('runden står i spillerens tal', B.me().stats.sh && B.me().stats.sh.p === 1);
  tickFor(ARENA.endShow + 0.5);
  check('en ny runde begynder af sig selv', B.last('ast').state === 'countdown' && B.last('ast').round === 2);
  // the connection drops: out of the match
  B.conn.close();
  check('når forbindelsen ryger, er spilleren ude af kampen', arena.size() === 0);
  B = client(tokB); B.send({ t: 'enter', g: GID });
}

section('poker: reglerne');
{
  const C = t => t.split(' ').map(x => '23456789TJQKA'.indexOf(x[0]) + 'shdc'.indexOf(x[1]) * 13);
  const named = [['As Ks Qs Js Ts 2h 3d', 'Royal straight flush'], ['9s 8s 7s 6s 5s Ah Ad', 'Straight flush'], ['9s 9h 9d 9c Ks 2h 3d', 'Fire ens'], ['9s 9h 9d Kc Ks 2h 3d', 'Fuldt hus'], ['As 9s 7s 4s 2s Kh Kd', 'Flush'],
    ['5s 4h 3d 2c Ah Kd Qd', 'Straight'], ['9s 9h 9d Kc Qs 2h 3d', 'Tre ens'], ['9s 9h Kd Kc Qs 2h 3d', 'To par'], ['9s 9h Kd Jc Qs 2h 3d', 'Et par'], ['9s 7h Kd Jc Qs 2h 3d', 'Højt kort'], ['9s 9h 9d Kc Ks Kh 3d', 'Fuldt hus']];
  check('hver slags hånd bliver kaldt det rigtige', named.every(([t, n]) => handName(handValue(C(t))) === n));
  const order = ['9s 7h Kd Jc Qs 2h 3d', '9s 9h Kd Jc Qs 2h 3d', '9s 9h Kd Kc Qs 2h 3d', '9s 9h 9d Kc Qs 2h 3d', '5s 4h 3d 2c Ah Kd Qd', 'Ts 9h 8d 7c 6h 2d 2s', 'As 9s 7s 4s 2s Kh Kd', '9s 9h 9d Kc Ks 2h 3d', 'Ks Kh Kd 9c 9s 2h 3d', '9s 9h 9d 9c Ks 2h 3d', 'As 2s 3s 4s 5s 9h 9d', '9s 8s 7s 6s 5s Ah Ad', 'As Ks Qs Js Ts 2h 3d'];
  check('hænderne står i den rigtige rækkefølge', order.every((t, i) => i === 0 || handValue(C(t)) > handValue(C(order[i - 1]))));
  check('det højeste sidekort afgør, og ens hænder er lige gode', handValue(C('As Kh 9d 5c 3s 2h 7d')) > handValue(C('As Qh 9d 5c 3s 2h 7d')) && handValue(C('As Kh Qd Jc Ts 2h 3d')) === handValue(C('Ah Kd Qc Js Th 4h 5d')));
  { const st = { hole: [C('As Ah')], board: [] }; const e = equity(st, 0, 1, 600, rnd); check('to esser vinder omkring 85 % mod én tilfældig hånd', e > 0.78 && e < 0.92, e.toFixed(3)); }

  // two players: the dealer has the small blind and speaks first before the flop, last after it
  let s = poker.setup(2, { first: 0 }, rnd);
  check('to spillere: giveren har lille blind og taler først', s.dealer === 0 && s.bet[0] === 5 && s.bet[1] === 10 && s.turn === 0 && s.stacks[0] === PSTART - 5);
  poker.act(s, 0, { call: true }, rnd);
  check('store blind må tale, selv om alle har betalt', s.street === 0 && s.turn === 1);
  poker.act(s, 1, { call: true }, rnd);
  check('efter floppet taler den, der ikke giver, først', s.street === 1 && s.board.length === 3 && s.turn === 1 && s.toCall === 0);
  const v0 = poker.view(s, 0), v1 = poker.view(s, 1), vs = poker.view(s, -1);
  check('man ser sine egne kort, ikke de andres, og aldrig bunken', v0.hole[0][0] >= 0 && v0.hole[1][0] === -1 && v1.hole[0][0] === -1 && vs.hole[0][0] === -1 && vs.hole[1][0] === -1 && !('deck' in JSON.parse(JSON.stringify(v0))));
  check('kun den, der har turen, får at vide, hvad der kan gøres', !!v1.can && !v0.can && v1.can.call === 0 && v1.can.min === 10 && v1.can.max === PSTART - 10);
  const refused = a => { try { poker.act(s, s.turn, a, rnd); return false; } catch { return true; } };
  check('en for lille og en for stor forhøjelse afvises', refused({ raise: 5 }) && refused({ raise: PSTART }) && (() => { try { poker.act(s, 0, { call: true }, rnd); return false; } catch { return true; } })());
  poker.act(s, 1, { raise: 40 }, rnd);
  check('efter et bud på 40 skal en forhøjelse mindst være til 80', poker.view(s, 0).can.min === 80 && poker.view(s, 0).can.call === 40);
  poker.act(s, 0, { fold: true }, rnd);
  check('når alle andre folder, tager den sidste potten uden at vise kort', s.phase === 'show' && s.stacks[1] === PSTART + 10 && s.stacks[0] === PSTART - 10 && Object.keys(s.last.shown).length === 0);
  poker.act(s, -1, { next: true }, rnd);
  check('næste hånd: giveren flytter', s.phase === 'bet' && s.dealer === 1 && s.hands === 2);

  // side pots, with the cards laid out by hand: seat 0 has 100 and the best hand, seat 1 has 300, seat 2 has 1000
  s = poker.setup(3, { first: 0 }, rnd);
  s.stacks = [100 - s.total[0], 300 - s.total[1], 1000 - s.total[2]];
  s.hole = [C('As Ah'), C('Ks Kh'), C('Qs Qh')]; s.deck = C('2c 3c 4d 9h 8d 7c 2s 3d');           // the board: 3d 2s 7c, 8d, 9h
  while (s.phase === 'bet') { const i = s.turn, max = s.bet[i] + s.stacks[i]; poker.act(s, i, max > s.toCall && !s.acted[i] ? { raise: max } : { call: true }, rnd); }
  check('sidepuljer: den med færrest jetoner kan kun vinde det, alle har kunnet matche', s.stacks[0] === 300 && s.stacks[1] === 400 && s.stacks[2] === 700 && s.last.pots[0].amount === 300 && s.last.pots[1].amount === 400, JSON.stringify(s.stacks));
  check('alle, der er med til sidst, viser deres kort', Object.keys(s.last.shown).length === 3 && handName(s.last.vals[0]) === 'Et par');
  // a big blind who cannot cover the blind: what the small blind paid beyond that comes back
  s = poker.setup(2, { first: 0 }, rnd);
  s.stacks[1] = 0; s.bet[1] = 4; s.total[1] = 4; s.allin[1] = true;                                  // as if the big blind had only 4
  poker.act(s, 0, { fold: true }, rnd);
  check('en blind større end modstanderens all-in kommer tilbage', s.stacks[0] === PSTART - 4 && s.stacks[1] === 8);

  // many tournaments of players who do anything allowed (and try what is not): no chip appears or disappears
  let ok = true, why = '';
  for (let k = 0; k < 150 && ok; k++) {
    const n = 2 + k % 5, g = poker.setup(n, { first: k }, rnd); let expect = n * PSTART, steps = 0;
    while (!poker.result(g) && steps++ < 50000 && ok) {
      if (g.phase === 'show') poker.act(g, -1, { next: true }, rnd);
      else if (k % 3 === 0 && rnd() < 0.01 && g.out.filter(o => !o).length > 2) { const who = Math.floor(rnd() * n); if (!g.out[who]) { expect -= g.stacks[who]; poker.drop(g, who, rnd); } }
      else {
        const i = g.turn, can = poker.view(g, i).can, q = rnd();
        if (q < 0.05) { try { poker.act(g, (i + 1) % n, { call: true }, rnd); ok = false; why = 'uden for tur'; } catch { /* refused, as it should be */ } }
        if (q < 0.15) poker.act(g, i, { fold: true }, rnd); else if (q < 0.65 || !can.max) poker.act(g, i, { call: true }, rnd); else poker.act(g, i, { raise: can.min + Math.floor(rnd() * (can.max - can.min + 1)) }, rnd);
      }
      const total = g.stacks.reduce((a, b) => a + b, 0) + (g.phase === 'bet' ? g.total.reduce((a, b) => a + b, 0) : 0);
      if (total !== expect || g.stacks.some(x => x < 0)) { ok = false; why = 'jetoner ' + total + ' i stedet for ' + expect; }
    }
    if (ok && (!poker.result(g) || g.stacks[g.winner] !== expect)) { ok = false; why = 'ingen vinder med det hele'; }
  }
  check('150 turneringer med tilfældige træk og spillere, der går: ingen jetoner opstår eller forsvinder', ok, why);
  // robots against each other: every tournament ends, and the better robots win more
  const wins = [0, 0, 0, 0];
  for (let k = 0; k < 45; k++) {
    const lv = [0, 1, 2, 3, 4, 5].map(i => [1, 2, 3][(i + k) % 3]), g = poker.setup(6, { first: k }, rnd); let steps = 0;
    while (!poker.result(g) && steps++ < 20000) { if (g.phase === 'show') poker.act(g, -1, { next: true }, rnd); else poker.act(g, g.turn, poker.bot(g, g.turn, lv[g.turn], rnd), rnd); }
    if (poker.result(g)) wins[lv[g.winner]]++;
  }
  check('robotterne spiller turneringer til ende, og de svære vinder flere end de lette', wins[1] + wins[2] + wins[3] === 45 && wins[3] > wins[1], wins.join(' '));
}

section('poker: et bord i klubhuset');
{
  for (const c of [A, B, C]) c.send({ t: 'tclose' });
  const tv = c => c.last('tv').tv, state = id => store.groups.get(GID).tables[id].state, tbl = id => store.groups.get(GID).tables[id];
  mark(A, B, C);
  A.send({ t: 'tnew', game: 'poker', stake: 0, bot: 2 });
  const id = tv(A).id;
  check('et pokerbord med en robot venter på flere', tv(A).phase === 'open' && tv(A).seats.length === 2 && tv(A).seats[1].bot === 2);
  A.send({ t: 'tbot', id, level: 3 }); A.send({ t: 'tbot', id, level: 1 });
  check('flere robotter ved samme bord har hver sit navn', tv(A).seats.length === 4 && new Set(tv(A).seats.map(q => q.n)).size === 4);
  B.send({ t: 'tstart', id });
  check('kun den, der lavede bordet, kan starte', /lavet bordet/.test(B.err()) && tv(A).phase === 'open');
  A.send({ t: 'tstart', id });
  check('turneringen går i gang, og robotterne trækker selv', tv(A).phase === 'play' && tv(A).v.hands === 1 && (tv(A).turn === 0 || tv(A).v.phase === 'show'));
  check('man ser sine egne kort og de andres bagsider', tv(A).v.hole[0][0] >= 0 && tv(A).v.hole.slice(1).every(h => h === null || h[0] === -1) && !('deck' in tv(A).v));
  B.send({ t: 'topen', id });
  check('en tilskuer ser ingen kort', tv(B).me === -1 && tv(B).v.hole.every(h => h === null || h[0] === -1));
  B.send({ t: 'tjoin', id });
  check('man kan ikke sætte sig, når turneringen er i gang', /allerede i gang/.test(B.err()));
  B.send({ t: 'tclose' });
  // the clock: nobody home
  const nextTurn = () => { for (let k = 0; k < 400 && tbl(id) && tbl(id).phase === 'play' && state(id).turn !== 0; k++) { clock += 1000; hub.tick(); } };
  nextTurn();
  check('uret er sat, når det er ens tur', tv(A).turn === 0 && tv(A).clock > THINK - 2 && tv(A).clock <= THINK);
  const h0 = state(id).hands, need0 = state(id).toCall > state(id).bet[0];
  clock += (THINK - 1) * 1000; hub.tick();
  check('før tiden er gået, sker der ikke noget', state(id).turn === 0 && state(id).hands === h0);
  clock += 2000; hub.tick();
  check('når tiden er gået, foldes der (eller checkes) for en', state(id).away[0] === 1 && (need0 ? state(id).folded[0] : state(id).said[0] === 'check' || state(id).turn !== 0 || state(id).hands > h0));
  nextTurn();
  A.send({ t: 'tact', id, a: { call: true } });
  check('et træk fra en selv nulstiller fraværet', state(id).away[0] === 0);
  // from one hand to the next
  for (let k = 0; k < 600 && tbl(id).phase === 'play' && state(id).phase !== 'show'; k++) { if (state(id).turn === 0) A.send({ t: 'tact', id, a: { fold: true } }); else { clock += 1000; hub.tick(); } }
  const hBefore = state(id).hands;
  check('efter en hånd vises resultatet et øjeblik', state(id).phase === 'show' && tbl(id).wake.seat === -1);
  clock += (SHOW + 1) * 1000; hub.tick();
  check('og så gives den næste hånd af sig selv', state(id).hands === hBefore + 1 || tbl(id).phase === 'over');
  A.send({ t: 'tclaim', id });
  check('man kan ikke tage sejren på tid i poker', /uret/.test(A.err()));
  mark(C); A.send({ t: 'tleave', id });
  check('når det sidste menneske går, lukker robotbordet', !tbl(id) && C.last('tbx').id === id);

  // three people and a stake
  const chips = c => store.users.get(c.me().id).chips, before = [chips(A), chips(B), chips(C)];
  A.send({ t: 'tnew', game: 'poker', stake: 10 });
  const id2 = tv(A).id;
  B.send({ t: 'tjoin', id: id2 }); C.send({ t: 'tjoin', id: id2 });
  A.send({ t: 'tbot', id: id2, level: 1 });
  check('robotter spiller ikke om jetoner', /jetoner/.test(A.err()) && tv(A).seats.length === 3);
  A.send({ t: 'tstart', id: id2 });
  check('indskuddene ligger i puljen', tv(A).pot === 30 && chips(A) === before[0] - 10 && chips(B) === before[1] - 10 && tv(A).phase === 'play');
  const who = [A, B, C];
  // B leaves in the middle: the two others play on
  const seatB = tv(B).me; B.send({ t: 'tleave', id: id2 });
  check('en, der går midt i turneringen, er ude, og de andre spiller videre', tbl(id2).phase === 'play' && state(id2).out[seatB] && tbl(id2).seats[seatB].left === 1);
  mark(A, B, C);
  for (let k = 0; k < 3000 && tbl(id2).phase === 'play'; k++) {
    const st = state(id2);
    if (st.phase === 'show') { clock += (SHOW + 1) * 1000; hub.tick(); continue; }
    const i = st.turn, max = st.bet[i] + st.stacks[i];
    // quietly at first (a tournament over in a couple of moves earns no reward), then everything in
    who[i].send({ t: 'tact', id: id2, a: tbl(id2).moves > 12 && !st.acted[i] && max > st.toCall ? { raise: max } : { call: true } });
  }
  const res = tbl(id2).res, wSeat = res && res.win[0], winner = res && who[wSeat], loser = res && who.find((c, i) => i !== wSeat && i !== seatB);
  check('turneringen slutter med én vinder, som får puljen og belønningen', !!res && tbl(id2).phase === 'over' && chips(winner) === before[who.indexOf(winner)] - 10 + 30 + ECON.win && res.pay[wSeat] === 30 + ECON.win);
  check('taberne får trøstepræmien, og det tæller i tallene', chips(loser) === before[who.indexOf(loser)] - 10 + ECON.loss && winner.me().stats.poker.w === 1 && loser.me().stats.poker.p === 1);
  check('resultatet står i samtalen', /vandt over .* og .* i Poker og fik puljen på 30 jetoner/.test(C.last('chat').m.s), C.last('chat').m.s);
  winner.send({ t: 'tagain', id: id2 });
  check('en ny turnering kræver, at ingen er gået', /gået fra bordet/.test(winner.err()));
  for (const c of [A, C]) c.send({ t: 'tleave', id: id2 });
}

section('yatzy');
{
  const T = [['ones', [1, 1, 3, 4, 1], 3], ['sixes', [6, 6, 6, 6, 6], 30], ['pair', [3, 3, 5, 5, 6], 10], ['pair', [1, 2, 3, 4, 5], 0], ['twopair', [3, 3, 5, 5, 6], 16], ['twopair', [3, 3, 3, 3, 6], 0], ['three', [4, 4, 4, 2, 4], 12],
    ['four', [4, 4, 4, 2, 4], 16], ['small', [1, 2, 3, 4, 5], 15], ['small', [2, 3, 4, 5, 6], 0], ['large', [2, 3, 4, 5, 6], 20], ['house', [2, 2, 5, 5, 5], 19], ['house', [5, 5, 5, 5, 5], 0], ['chance', [1, 2, 3, 4, 6], 16], ['yatzy', [4, 4, 4, 4, 4], 50], ['yatzy', [4, 4, 4, 4, 5], 0]];
  check('hvert felt giver de point, det skal', T.every(([f, d, p]) => scoreOf(f, d) === p));
  check('bonus på 50 fra 63 i den øverste halvdel', yzSums({ ones: 3, twos: 6, threes: 9, fours: 12, fives: 15, sixes: 18 }).total === 113 && yzSums({ ones: 3, twos: 6, threes: 9, fours: 12, fives: 15, sixes: 12, chance: 20 }).total === 77);
  let s = yatzy.setup(2, { first: 1 }, rnd);
  const no = (seat, a) => { try { yatzy.act(s, seat, a, rnd); return false; } catch { return true; } };
  check('man kan ikke skrive noget, før man har slået, og ikke uden for tur', s.turn === 1 && no(1, { score: 'chance' }) && no(0, { roll: [] }));
  yatzy.act(s, 1, { roll: [true, true, true, true, true] }, rnd);
  check('første slag slår alle fem, uanset hvad man beder om', s.rolls === 1 && s.dice.every(d => d >= 1 && d <= 6) && s.held.every(h => !h));
  const d0 = s.dice.slice(); yatzy.act(s, 1, { roll: [true, false, true, false, false] }, rnd);
  check('gemte terninger bliver liggende', s.dice[0] === d0[0] && s.dice[2] === d0[2] && s.rolls === 2);
  check('man kan ikke slå om uden at slå noget om', no(1, { roll: [true, true, true, true, true] }) && s.rolls === 2);
  yatzy.act(s, 1, { roll: [] }, rnd);
  check('efter tre slag skal der skrives', no(1, { roll: [] }) && s.rolls === 3);
  const sum = s.dice.reduce((a, b) => a + b, 0); yatzy.act(s, 1, { score: 'chance' }, rnd);
  check('slaget skrives, og turen går videre', s.cards[1].chance === sum && s.turn === 0 && s.rolls === 0 && s.last.field === 'chance');
  yatzy.act(s, 0, { roll: [] }, rnd); yatzy.act(s, 0, { score: 'yatzy' }, rnd); yatzy.act(s, 1, { roll: [] }, rnd);
  check('et felt kan kun bruges én gang', no(1, { score: 'chance' }));
  // whole games of robots: every sheet is filled, and the better robots score more
  const avg = [0, 0, 0, 0];
  for (const level of [1, 3]) for (let g = 0; g < 14; g++) {
    s = yatzy.setup(3, { first: g }, rnd); let moves = 0;
    while (!yatzy.result(s) && moves++ < 2000) yatzy.act(s, s.turn, yatzy.bot(s, s.turn, level, rnd), rnd);
    if (!yatzy.result(s) || !s.cards.every(c => FIELDS.every(f => f in c))) avg[0]++;
    avg[level] += s.cards.reduce((a, c) => a + yzSums(c).total, 0) / 3 / 14;
  }
  check('robotterne fylder hele blokken, og den svære får flere point end den lette', avg[0] === 0 && avg[3] > avg[1] + 8 && avg[1] > 150, avg.map(x => x.toFixed(0)).join(' '));
  // somebody leaves: the others go on; alone, one has won
  s = yatzy.setup(3, { first: 0 }, rnd); yatzy.drop(s, 0, rnd);
  check('går den, der har turen, får den næste den', s.turn === 1 && !yatzy.result(s));
  yatzy.drop(s, 2, rnd);
  check('er man alene tilbage, har man vundet', yatzy.result(s).win.join() === '1');

  // at the dice table in the clubhouse: two people and a robot
  for (const c of [A, B, C]) c.send({ t: 'tclose' });
  const tv = c => c.last('tv').tv, tbl = id => store.groups.get(GID).tables[id];
  mark(A, B, C);
  A.send({ t: 'tnew', game: 'yatzy', stake: 0 });
  const id = tv(A).id;
  B.send({ t: 'tjoin', id }); A.send({ t: 'tbot', id, level: 2 }); A.send({ t: 'tstart', id });
  check('yatzy ved terningebordet med en ven og en robot', tv(A).phase === 'play' && tv(A).seats.length === 3 && tv(A).seats[2].bot === 2 && tv(A).v.cards.length === 3);
  const who = [A, B];
  for (let k = 0; k < 400 && tbl(id).phase === 'play'; k++) { const st = tbl(id).state, i = st.turn; clock += 400; who[i].send({ t: 'tact', id, a: yatzy.bot(st, i, 2, rnd) }); }
  const res = tbl(id).res;
  check('spillet går til ende, robotten slår selv, og nogen vinder', tbl(id).phase === 'over' && !!res && (res.win.length >= 1 || res.draw) && tbl(id).state.cards.every(c => FIELDS.every(f => f in c)));
  check('det tæller i tallene', A.me().stats.yatzy.p === 1 && B.me().stats.yatzy.p === 1);
  for (const c of [A, B]) c.send({ t: 'tleave', id });
  // a slow player can be passed after 48 hours, and the game goes on
  A.send({ t: 'tnew', game: 'yatzy', stake: 0 }); const id2 = tv(A).id;
  B.send({ t: 'tjoin', id: id2 }); C.send({ t: 'tjoin', id: id2 }); A.send({ t: 'tstart', id: id2 });
  const slow = tbl(id2).state.turn, other = [A, B, C][(slow + 1) % 3];
  other.send({ t: 'tclaim', id: id2 });
  check('man kan ikke springe en over med det samme', /timer/.test(other.err()) && tbl(id2).state.turn === slow);
  clock += 49 * 3600e3; other.send({ t: 'tclaim', id: id2 });
  check('efter 48 timer spilles der videre uden den, der ikke slår', tbl(id2).phase === 'play' && tbl(id2).state.gone[slow] && tbl(id2).state.turn !== slow && tbl(id2).seats[slow].left === 1);
  for (const c of [A, B, C]) c.send({ t: 'tleave', id: id2 });
}

section('meyer');
{
  const row = [[3, 2], [4, 1], [6, 5], [1, 1], [6, 6], [3, 1], [2, 1]].map(d => rankOf(d[0], d[1]));
  check('slagene står i den rigtige rækkefølge: 32 lavest, så parrene, Lille Meyer og Meyer', row.every((r, i) => i === 0 || r > row[i - 1]) && rankOf(1, 2) === MEYER && rankName(rankOf(5, 6)) === '65' && rankName(rankOf(4, 4)) === 'Par 4');
  check('to terninger giver Meyer to ud af 36 gange', Math.abs(meyerChance(MEYER) - 2 / 36) < 1e-9 && meyerChance(0) === 1);
  let s = meyer.setup(3, { first: 0 }, rnd);
  const no = (seat, a) => { try { meyer.act(s, seat, a, rnd); return false; } catch { return true; } };
  check('den første i en runde skal slå og kigge', no(0, { lift: true }) && no(0, { blind: true }) && no(1, { roll: true }));
  meyer.act(s, 0, { roll: true }, rnd);
  check('kun den, der slog, ser slaget', Array.isArray(meyer.view(s, 0).mine) && meyer.view(s, 1).mine === 1 && meyer.view(s, -1).mine === 1);
  s.mine = [4, 3]; meyer.act(s, 0, { say: rankOf(5, 4) }, rnd);                       // a lie: 43 under the cup, "54" said
  check('man må lyve, og ingen ser, hvad der ligger under bægeret', s.turn === 1 && s.prev.said === rankOf(5, 4) && meyer.view(s, 1).cup === 1 && meyer.view(s, 0).cup === 1);
  meyer.act(s, 1, { roll: true }, rnd); s.mine = [6, 1];
  check('man skal sige det samme eller højere', no(1, { say: rankOf(5, 3) }));
  meyer.act(s, 1, { say: rankOf(6, 1) }, rnd);                                        // true
  meyer.act(s, 2, { lift: true }, rnd);
  check('løfter man, og det passede, mister man selv et liv', s.phase === 'show' && !s.last.lie && s.last.loser === 2 && s.lives[2] === LIVES - 1 && s.last.cup.join() === '6,1');
  meyer.act(s, -1, { next: true }, rnd);
  check('taberen begynder næste runde', s.turn === 2 && s.phase === 'turn' && !s.prev);
  meyer.act(s, 2, { roll: true }, rnd); s.mine = [3, 2]; meyer.act(s, 2, { say: MEYER }, rnd);     // a lie, and the big one
  meyer.act(s, 0, { lift: true }, rnd);
  check('en løgn bliver afsløret, og Meyer koster to liv', s.last.lie && s.last.loser === 2 && s.lives[2] === LIVES - 3 && s.last.lost === 2);
  meyer.act(s, -1, { next: true }, rnd);
  meyer.act(s, 2, { roll: true }, rnd); s.mine = [4, 1]; meyer.act(s, 2, { say: rankOf(4, 1) }, rnd);
  meyer.act(s, 0, { blind: true }, rnd);
  check('«det eller derover»: bægeret går videre uset med samme melding', s.turn === 1 && s.prev.blind && s.prev.said === rankOf(4, 1) && s.prev.seat === 0);
  s.cup = [3, 2]; meyer.act(s, 1, { lift: true }, rnd);
  check('lå der mindre under det usete slag, mister den, der sendte det videre', s.last.loser === 0 && s.last.blind);
  // robots: every game ends with one alive, and the hard ones win more than the easy ones
  const wins = [0, 0, 0, 0]; let ended = 0;
  for (let g = 0; g < 90; g++) {
    const lv = [0, 1, 2, 3, 4, 5].map(i => [1, 2, 3][(i + g) % 3]); s = meyer.setup(6, { first: g }, rnd); let steps = 0;
    while (!meyer.result(s) && steps++ < 20000) { if (s.phase === 'show') meyer.act(s, -1, { next: true }, rnd); else meyer.act(s, s.turn, meyer.bot(s, s.turn, lv[s.turn], rnd), rnd); }
    if (meyer.result(s) && s.lives.filter(x => x > 0).length === 1) { ended++; wins[lv[s.winner]]++; }
  }
  check('robotterne spiller til én er tilbage, og de svære vinder flest', ended === 90 && wins[3] > wins[1], wins.join(' '));

  // at the dice table: two people and a robot, with the clock
  for (const c of [A, B, C]) c.send({ t: 'tclose' });
  const tv = c => c.last('tv').tv, tbl = id => store.groups.get(GID).tables[id];
  mark(A, B, C);
  A.send({ t: 'tnew', game: 'meyer', stake: 0 }); const id = tv(A).id;
  B.send({ t: 'tjoin', id }); A.send({ t: 'tbot', id, level: 1 }); A.send({ t: 'tstart', id });
  check('meyer ved terningebordet', tv(A).phase === 'play' && tv(A).v.lives.join() === '6,6,6' && tv(A).clock > 0);
  const who = [A, B], first = tbl(id).state.turn;
  if (first < 2) {
    who[first].send({ t: 'tact', id, a: { roll: true } });
    check('den, der slog, får sit slag at se; den anden gør ikke', Array.isArray(tv(who[first]).v.mine) && tv(who[1 - first]).v.mine === 1);
    clock += 41000; hub.tick();
    check('siger man ikke noget i tide, bliver sandheden sagt for en', tbl(id).state.prev && tbl(id).state.prev.seat === first && tbl(id).state.away[first] === 1);
  }
  for (let k = 0; k < 3000 && tbl(id).phase === 'play'; k++) {
    const st = tbl(id).state; clock += 500;
    if (st.phase === 'show') { clock += 7000; hub.tick(); } else if (st.turn < 2) who[st.turn].send({ t: 'tact', id, a: meyer.bot(st, st.turn, 3, rnd) });
  }
  check('spillet ender med én vinder', tbl(id).phase === 'over' && tbl(id).state.lives.filter(x => x > 0).length === 1 && A.me().stats.meyer.p === 1);
  for (const c of [A, B]) c.send({ t: 'tleave', id });
}

section('ludo');
{
  const dice = (...ds) => { let i = 0; return () => (ds[Math.min(i++, ds.length - 1)] - 0.5) / 6; };       // a die that falls as we say
  const no = (st, seat, a) => { try { ludo.act(st, seat, a, rnd); return false; } catch { return true; } };
  const Y = [-1, -1, -1, -1], at = (turn, pos) => { const t = ludo.setup(4, { first: turn }, rnd); t.pos = pos.map(p => p.slice()); return t; };
  check('banen har otte stjerner og fire globusser, og hver farve møder dem i samme afstand', LSTARS.length === 8 && LGLOBES.length === 4 && [0, 1, 2, 3].every(c => LSTARS.map(a => (a - LSTART[c] + 52) % 52).sort((x, y) => x - y).join() === '4,11,17,24,30,37,43,50'));
  let s = ludo.setup(4, { first: 0 }, rnd);
  ludo.act(s, 0, { roll: true }, dice(3));
  check('uden brikker ude har man tre slag til en sekser', s.turn === 0 && s.phase === 'roll' && s.last.pass && s.last.more && s.tries === 1);
  ludo.act(s, 0, { roll: true }, dice(2)); ludo.act(s, 0, { roll: true }, dice(5));
  check('efter tre slag uden sekser går turen videre', s.turn === 1 && s.tries === 0 && s.last.pass && !s.last.more);
  ludo.act(s, 1, { roll: true }, dice(6));
  check('en sekser bringer en brik ud, og man slår igen', s.pos[1].join() === '0,-1,-1,-1' && s.turn === 1 && s.phase === 'roll' && s.last.from === -1 && !s.last.pick);
  ludo.act(s, 1, { roll: true }, dice(6));
  check('er der et valg, vælger man selv', s.phase === 'move' && s.moves.join() === '0,1,2,3' && no(s, 1, { roll: true }) && no(s, 0, { move: 0 }) && no(s, 1, { move: 7 }));
  ludo.act(s, 1, { move: 0 }, rnd);
  check('brikken flytter terningens øjne', s.pos[1][0] === 6 && s.last.steps.join() === '1,2,3,4,5,6' && s.last.pick && s.turn === 1);
  ludo.act(s, 1, { roll: true }, dice(3));
  check('er der intet valg, flyttes brikken af sig selv, og turen går videre', s.pos[1][0] === 9 && s.turn === 2 && s.phase === 'roll');
  s = at(0, [[16, -1, -1, -1], [6, -1, -1, -1], Y, Y]); ludo.act(s, 0, { roll: true }, dice(3));
  check('lander man på en andens brik, ryger den hjem', s.pos[0][0] === 19 && s.pos[1][0] === -1 && s.last.hit.join() === '1,0,6');
  s = at(0, [[16, -1, -1, -1], [6, 6, -1, -1], Y, Y]); ludo.act(s, 0, { roll: true }, dice(3));
  check('to brikker på samme felt står sikkert: den, der lander der, ryger selv hjem', s.pos[0][0] === -1 && s.pos[1].join() === '6,6,-1,-1' && s.last.self);
  s = at(0, [[18, -1, -1, -1], [8, -1, -1, -1], Y, Y]); ludo.act(s, 0, { roll: true }, dice(3));
  check('på en globus står man sikkert', s.pos[0][0] === -1 && s.pos[1][0] === 8 && s.last.self);
  s = at(0, [[2, -1, -1, -1], Y, [37, -1, -1, -1], Y]); ludo.act(s, 0, { roll: true }, dice(2));
  check('en stjerne sender brikken videre til den næste, og den, der står dér, ryger hjem', s.pos[0][0] === 11 && s.pos[2][0] === -1 && s.last.star && s.last.steps.join() === '3,4,11');
  s = at(0, [[47, 3, -1, -1], Y, Y, Y]); ludo.act(s, 0, { roll: true }, dice(3)); ludo.act(s, 0, { move: 0 }, rnd);
  check('stjernen foran ens egen bane fører lige i mål', s.pos[0][0] === LGOAL && s.last.steps.join() === '48,49,50,56');
  s = at(0, [[54, LGOAL, LGOAL, LGOAL], Y, Y, Y]); ludo.act(s, 0, { roll: true }, dice(4));
  check('målet skal rammes præcist: det, man slår for meget, går man tilbage', s.pos[0][0] === 54 && s.last.steps.join() === '55,56,55,54' && s.turn === 1);
  s.turn = 0; ludo.act(s, 0, { roll: true }, dice(2));
  check('fire brikker i mål vinder spillet', s.phase === 'over' && ludo.result(s).win.join() === '0' && ludo.turn(s) === -1);
  s = at(0, [Y, [39, 39, -1, -1], Y, Y]); ludo.act(s, 0, { roll: true }, dice(6));
  check('en brik, der kommer ud, slår alt hjem fra sit startfelt', s.pos[0].filter(p => p === 0).length === 1 && s.pos[1].join() === '-1,-1,-1,-1' && s.last.hit.length === 2 && s.turn === 0);
  s = at(1, [[0, -1, -1, -1], [36, -1, -1, -1], Y, Y]); ludo.act(s, 1, { roll: true }, dice(3));
  check('på sit eget startfelt står man sikkert', s.pos[1][0] === -1 && s.pos[0][0] === 0 && s.last.self);
  s = at(1, [[5, -1, -1, -1], [7, -1, -1, -1], [9, -1, -1, -1], Y]); ludo.drop(s, 1);
  check('går en fra, tages brikkerne af brættet, og de andre spiller videre', s.gone[1] && s.pos[1].join() === '-1,-1,-1,-1' && s.turn === 2 && !ludo.result(s));
  ludo.drop(s, 2); ludo.drop(s, 3);
  check('er der kun én tilbage, har den vundet', ludo.result(s).win.join() === '0');
  check('to spillere sidder over for hinanden på brættet', ludo.setup(2, {}, rnd).color.join() === '0,2' && ludo.setup(3, {}, rnd).color.join() === '0,1,2');
  // robots: every game ends with four pieces in the goal, and the hard one wins more often than the easy one
  const wins = [0, 0, 0, 0]; let ended = 0, acts = 0;
  for (let g = 0; g < 60; g++) {
    const lv = [0, 1, 2, 3].map(i => [1, 2, 3, 2][(i + g) % 4]); s = ludo.setup(4, { first: g }, rnd); let steps = 0;
    while (!ludo.result(s) && steps++ < 50000) { ludo.act(s, s.turn, ludo.bot(s, s.turn, lv[s.turn], rnd), rnd); acts++; }
    if (ludo.result(s) && s.pos[s.winner].every(p => p === LGOAL) && s.pos.flat().every(p => p >= -1 && p <= LGOAL)) { ended++; wins[lv[s.winner]]++; }
  }
  check('robotterne spiller til en har fire brikker i mål, og den svære vinder oftere end den lette', ended === 60 && wins[3] > wins[1], wins.join(' ') + ' (' + Math.round(acts / 60) + ' handlinger pr. spil)');

  // at the board-game table: two people and a robot
  for (const c of [A, B, C]) c.send({ t: 'tclose' });
  const tv = c => c.last('tv').tv, tbl = id => store.groups.get(GID).tables[id];
  mark(A, B, C);
  A.send({ t: 'tnew', game: 'ludo', stake: 0 }); const id = tv(A).id;
  B.send({ t: 'tjoin', id }); A.send({ t: 'tbot', id, level: 2 }); A.send({ t: 'tstart', id });
  check('ludo ved brætspilsbordet med en ven og en robot', tv(A).phase === 'play' && tv(A).seats.length === 3 && tv(A).seats[2].bot === 2 && tv(A).v.color.join() === '0,1,2' && GAMES.ludo.station === 'games');
  const who = [A, B];
  for (let k = 0; k < 20000 && tbl(id).phase === 'play'; k++) { const st = tbl(id).state, i = st.turn; clock += 400; who[i].send({ t: 'tact', id, a: ludo.bot(st, i, 3, rnd) }); }
  const res = tbl(id).res;
  check('spillet går til ende, robotten flytter selv, og vinderen har fire brikker i mål', tbl(id).phase === 'over' && !!res && res.win.length === 1 && tbl(id).state.pos[res.win[0]].every(p => p === LGOAL));
  check('det tæller i tallene', A.me().stats.ludo.p === 1 && B.me().stats.ludo.p === 1 && A.me().stats.ludo.w + B.me().stats.ludo.w === (res.win[0] < 2 ? 1 : 0));
  for (const c of [A, B]) c.send({ t: 'tleave', id });
  // a slow player can be passed after 48 hours: the pieces come off, and the game goes on
  A.send({ t: 'tnew', game: 'ludo', stake: 0 }); const id2 = tv(A).id;
  B.send({ t: 'tjoin', id: id2 }); C.send({ t: 'tjoin', id: id2 }); A.send({ t: 'tstart', id: id2 });
  const slow = tbl(id2).state.turn, other = [A, B, C][(slow + 1) % 3];
  clock += 49 * 3600e3; other.send({ t: 'tclaim', id: id2 });
  check('efter 48 timer spilles der videre uden den, der ikke slår', tbl(id2).phase === 'play' && tbl(id2).state.gone[slow] && tbl(id2).state.turn !== slow && tbl(id2).seats[slow].left === 1, other.err());
  for (const c of [A, B, C]) c.send({ t: 'tleave', id: id2 });
}

section('glemt kodeord');
{
  check('uden nøglen er der ingen adgang', /Ingen adgang/.test(throws(() => hub.api.admin({ key: 'x'.repeat(32), op: 'users' }, '7.7.7.7'))));
  const list = hub.api.admin({ key: hub.adminKey(), op: 'users' }, '127.0.0.1').users;
  check('den der passer serveren kan se kontiene', list.length === 4 && list.some(u => u.name === 'Mads' && u.groups[0] === 'Torsdagsklubben'));
  check('adgangskoder er ikke med på listen', !JSON.stringify(list).includes('hash'));
  const r = hub.api.admin({ key: hub.adminKey(), op: 'pass', name: 'mads' }, '127.0.0.1');
  check('et nyt kodeord laves til den, der har glemt sit', r.name === 'Mads' && /^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/.test(r.pass), JSON.stringify(r));
  check('den gamle forbindelse lukkes', B.closed && B.last('bye').why === 'login');
  check('det gamle kodeord virker ikke længere', /Forkert/.test(throws(() => hub.api.login({ name: 'Mads', pass: 'kodeord22' }, '8.8.4.4'))));
  tokB = hub.api.login({ name: 'Mads', pass: r.pass }, '8.8.4.4').token;
  B = client(tokB); B.send({ t: 'enter', g: GID });
  check('men det nye gør', B.last('room').g.id === GID);
}

section('gemt på disken');
{
  const idB = B.last('welcome').me.id;
  A.send({ t: 'tnew', game: 'c4', stake: 10 });
  const id = A.last('tv').tv.id;
  B.send({ t: 'tjoin', id });
  A.send({ t: 'tact', id, a: { c: 2 } });
  const chipsB = B.me().chips;
  store.flush();
  const files = fs.readdirSync(dir).sort().join(',');
  check('filerne ligger, hvor de skal', files === 'config.json,eagleeye,groups,users.json' && fs.existsSync(path.join(dir, 'groups', GID + '.json')), files);
  check('nøglen og kontiene kan kun læses af tjenesten selv', (fs.statSync(path.join(dir, 'config.json')).mode & 0o077) === 0 && (fs.statSync(path.join(dir, 'users.json')).mode & 0o077) === 0);
  // a new server on the same folder
  store = createStore(dir, { delay: -1 });
  startLobby();
  check('installationskoden er den samme efter genstart', store.config.code === CODE);
  const B2 = client(tokB);
  check('login og jetoner overlever en genstart', B2.last('welcome').me.id === idB && B2.last('welcome').me.chips === chipsB && B2.last('welcome').groups[0].turn === 1);
  B2.send({ t: 'enter', g: GID });
  const room = B2.last('room');
  check('gruppe, chat og bord overlever en genstart', room.g.name === 'Torsdagsklubben' && room.chat.length > 5 && room.tables.length === 1 && room.tables[0].turn === 1 && room.tables[0].pot === 20);
  check('EagleEye-kampen overlever en genstart, og logins til den gælder stadig', room.ee.length === 1 && room.ee[0].code === EE && room.ee[0].phase === 'over'
    && ee.api.state({ token: ee.token(GID, EE, idB), rev: -1 }).view.me.name === 'Mads');
  B2.send({ t: 'topen', id });
  B2.send({ t: 'tact', id, a: { c: 2 } });
  check('spillet fortsætter, hvor det slap', B2.last('tv').tv.v.n === 2 && B2.last('tv').tv.turn === 0);
  clock += 31 * 24 * 3600e3; hub.tidy();
  check('et bord ingen rører i en måned ryddes væk, og indsatsen kommer tilbage', B2.last('tbx').id === id && B2.me().chips === chipsB + 10);
  // the owner deletes the group
  const A2 = client(tokA); A2.send({ t: 'enter', g: GID });
  A2.send({ t: 'gdel' });
  check('ejeren kan slette gruppen, og alle sendes ud', B2.last('out').g === GID && B2.last('groups').groups.length === 0 && !fs.existsSync(path.join(dir, 'groups', GID + '.json')));
  check('invitationen dør med gruppen', /findes ikke/.test(throws(() => hub.api.invite({ code: INV }))));
  check('og dens EagleEye-kampe forsvinder', !ee.get(EE) && fs.readdirSync(path.join(dir, 'eagleeye')).length === 0);
}

// ---------- the real server ----------
section('serveren og WebSocket');
const frame = (op, data, fin = true) => {
  const len = data.length, mask = crypto.randomBytes(4);
  const head = len < 126 ? Buffer.from([(fin ? 0x80 : 0) | op, 0x80 | len]) : len < 65536 ? Buffer.from([(fin ? 0x80 : 0) | op, 0x80 | 126, len >> 8, len & 255])
    : Buffer.concat([Buffer.from([(fin ? 0x80 : 0) | op, 0x80 | 127, 0, 0, 0, 0]), (() => { const b = Buffer.alloc(4); b.writeUInt32BE(len); return b; })()]);
  const body = Buffer.from(data); for (let i = 0; i < len; i++) body[i] ^= mask[i & 3];
  return Buffer.concat([head, mask, body]);
};
function rawSocket(port) {
  return new Promise((resolve, reject) => {
    const s = net.connect(port, '127.0.0.1'), key = crypto.randomBytes(16).toString('base64');
    let buf = Buffer.alloc(0), ready = false; const frames = [], waiters = [];
    const pump = () => {
      for (;;) {
        if (buf.length < 2) break;
        let len = buf[1] & 0x7f, off = 2;
        if (len === 126) { if (buf.length < 4) break; len = buf.readUInt16BE(2); off = 4; } else if (len === 127) { if (buf.length < 10) break; len = buf.readUInt32BE(6); off = 10; }
        if (buf.length < off + len) break;
        frames.push({ op: buf[0] & 15, masked: !!(buf[1] & 0x80), data: buf.subarray(off, off + len) }); buf = buf.subarray(off + len);
      }
      while (waiters.length && frames.length) waiters.shift()(frames.shift());
    };
    s.on('data', d => {
      buf = Buffer.concat([buf, d]);
      if (!ready) {
        const i = buf.indexOf('\r\n\r\n'); if (i < 0) return;
        const head = buf.subarray(0, i).toString(); buf = buf.subarray(i + 4); ready = true;
        const want = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
        resolve({ s, head, okKey: head.includes('Sec-WebSocket-Accept: ' + want), write: b => s.write(b),
          next: (ms = 3000) => new Promise((res, rej) => { if (frames.length) return res(frames.shift()); const t = setTimeout(() => rej(new Error('ingen ramme')), ms); waiters.push(f => { clearTimeout(t); res(f); }); }),
          closed: new Promise(res => s.on('close', res)) });
      }
      pump();
    });
    s.on('error', reject);
    s.write('GET /ws HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ' + key + '\r\nSec-WebSocket-Version: 13\r\n\r\n');
  });
}
{
  const port = 18000 + Math.floor(Math.random() * 2000), data = fs.mkdtempSync(path.join(os.tmpdir(), 'slq-lobby-srv-'));
  const child = spawn(process.execPath, [path.join(ROOT, 'server', 'server.js')], { env: { ...process.env, PORT: String(port), DATA_DIR: data, HOST: '127.0.0.1' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; child.stdout.on('data', d => { out += d; }); child.stderr.on('data', d => { out += d; });
  try {
    for (let i = 0; i < 50 && !out.includes('lytter'); i++) await new Promise(r => setTimeout(r, 100));
    check('serveren starter', out.includes('lytter'), out);
    const base = 'http://127.0.0.1:' + port;
    const post = async (op, body) => (await fetch(base + '/api/' + op, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json();
    const h = await post('health', {});
    check('/api/health svarer', h.ok === true && h.users === 0 && typeof h.version === 'string');
    const page = await fetch(base + '/');
    check('forsiden kan hentes', page.status === 200 && /SLQ Game Lobby/.test(await page.text()));
    check('filer uden for public kan ikke hentes', (await fetch(base + '/..%2fpackage.json')).status !== 200 && (await fetch(base + '/%2e%2e/server/hub.js')).status !== 200);
    check('ukendte kald afvises', (await fetch(base + '/api/nope', { method: 'POST', body: '{}' })).status === 404);
    const code = JSON.parse(fs.readFileSync(path.join(data, 'config.json'), 'utf8')).code;
    const reg = await post('register', { name: 'Net', pass: 'kodeord99', code });
    check('konto over HTTP', typeof reg.token === 'string', JSON.stringify(reg));
    check('fejl kommer som tekst', /Forkert/.test((await post('login', { name: 'Net', pass: 'nej' })).error));

    const ws = await rawSocket(port);
    check('håndtrykket er rigtigt', ws.head.startsWith('HTTP/1.1 101') && ws.okKey, ws.head);
    ws.write(frame(1, Buffer.from(JSON.stringify({ t: 'hello', token: reg.token }))));
    let f = await ws.next();
    const w = JSON.parse(f.data.toString());
    check('velkomst over WebSocket, uden maske fra serveren', f.op === 1 && !f.masked && w.t === 'welcome' && w.me.name === 'Net');
    ws.write(frame(9, Buffer.from('hej')));
    f = await ws.next();
    check('ping besvares med pong', f.op === 10 && f.data.toString() === 'hej');
    // a message in three fragments with a ping in between
    const text = Buffer.from(JSON.stringify({ t: 'gnew', name: 'Brudstykker', pad: 'æøå'.repeat(60) }));
    ws.write(frame(1, text.subarray(0, 10), false)); ws.write(frame(9, Buffer.alloc(0))); ws.write(frame(0, text.subarray(10, 150), false)); ws.write(frame(0, text.subarray(150), true));
    f = await ws.next(); check('ping midt i en opdelt besked', f.op === 10);
    f = await ws.next();
    const g = JSON.parse(f.data.toString());
    check('en opdelt besked samles rigtigt', g.t === 'groups' && g.groups[0].name === 'Brudstykker', f.data.toString().slice(0, 80));
    await ws.next();      // the 'me' that follows
    // a long message (16-bit length) both ways
    ws.write(frame(1, Buffer.from(JSON.stringify({ t: 'enter', g: g.go }))));
    f = await ws.next();
    check('rummet kommer over WebSocket', JSON.parse(f.data.toString()).t === 'room');
    ws.write(frame(1, Buffer.from(JSON.stringify({ t: 'say', s: 'ø'.repeat(400) }))));
    f = await ws.next();
    check('lange beskeder (16-bit længde) går igennem', JSON.parse(f.data.toString()).m.s === 'ø'.repeat(240));
    // an unmasked frame is a protocol error
    const ws2 = await rawSocket(port);
    ws2.write(Buffer.from([0x81, 2, 104, 105]));
    f = await ws2.next();
    check('en ramme uden maske lukker forbindelsen (1002)', f.op === 8 && f.data.readUInt16BE(0) === 1002);
    await ws2.closed;
    // too big
    const ws3 = await rawSocket(port);
    ws3.write(frame(1, Buffer.alloc(70000, 97)).subarray(0, 14));
    f = await ws3.next();
    check('en for stor besked afvises (1009)', f.op === 8 && f.data.readUInt16BE(0) === 1009);
    // close handshake
    ws.write(frame(8, Buffer.from([3, 232])));
    f = await ws.next();
    check('luk besvares med luk', f.op === 8 && f.data.readUInt16BE(0) === 1000);
    await ws.closed;
    // the browser's own client, when this Node has one
    if (typeof WebSocket === 'function') {
      const got = await new Promise((res, rej) => {
        const c = new WebSocket('ws://127.0.0.1:' + port + '/ws'); const t = setTimeout(() => rej(new Error('tavs')), 4000);
        c.onopen = () => c.send(JSON.stringify({ t: 'hello', token: reg.token }));
        c.onmessage = e => { clearTimeout(t); c.close(); res(JSON.parse(e.data)); };
        c.onerror = () => rej(new Error('fejl'));
      });
      check('Nodes egen WebSocket-klient kan tale med serveren', got.t === 'welcome' && got.groups.length === 1);
    }
    check('en forkert sti giver ikke en WebSocket', await new Promise(res => { const s = net.connect(port, '127.0.0.1'); s.write('GET /nope HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: abc\r\nSec-WebSocket-Version: 13\r\n\r\n'); s.on('data', d => { res(String(d).startsWith('HTTP/1.1 404')); s.destroy(); }); s.on('error', () => res(false)); }));
    child.kill('SIGTERM');
    await new Promise(r => child.on('exit', r));
    const users = JSON.parse(fs.readFileSync(path.join(data, 'users.json'), 'utf8'));
    check('ved stop skrives alt til disken', users.list.length === 1 && users.list[0].name === 'Net' && fs.readdirSync(path.join(data, 'groups')).length === 1);
    check('serveren skrev ingen fejl', !/Error|TypeError|at .*\(/.test(out), out);
  } finally { child.kill(); fs.rmSync(data, { recursive: true, force: true }); }
}

fs.rmSync(dir, { recursive: true, force: true });
console.log(failedN ? `\n${failedN} FEJL, ${passed} ok` : `\nalt ok (${passed} tjek)`);
process.exit(failedN ? 1 : 0);
