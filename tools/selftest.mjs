// SLQ Game Lobby — self test. Runs the lobby logic without sockets (accounts, groups, room, chat, teasing, bar,
// shop, tables), then starts the real server on a spare port and talks WebSocket to it.   node tools/selftest.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createStore } from '../server/store.js';
import { createHub } from '../server/hub.js';
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
let store = createStore(dir, { delay: -1 });
let hub = createHub({ store, version: 'test', now: () => clock, botDelay: 0, rand: rnd });

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
  check('filerne ligger, hvor de skal', files === 'config.json,groups,users.json' && fs.existsSync(path.join(dir, 'groups', GID + '.json')), files);
  check('nøglen og kontiene kan kun læses af tjenesten selv', (fs.statSync(path.join(dir, 'config.json')).mode & 0o077) === 0 && (fs.statSync(path.join(dir, 'users.json')).mode & 0o077) === 0);
  // a new server on the same folder
  store = createStore(dir, { delay: -1 });
  hub = createHub({ store, version: 'test', now: () => clock, botDelay: 0, rand: rnd });
  check('installationskoden er den samme efter genstart', store.config.code === CODE);
  const B2 = client(tokB);
  check('login og jetoner overlever en genstart', B2.last('welcome').me.id === idB && B2.last('welcome').me.chips === chipsB && B2.last('welcome').groups[0].turn === 1);
  B2.send({ t: 'enter', g: GID });
  const room = B2.last('room');
  check('gruppe, chat og bord overlever en genstart', room.g.name === 'Torsdagsklubben' && room.chat.length > 5 && room.tables.length === 1 && room.tables[0].turn === 1 && room.tables[0].pot === 20);
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
