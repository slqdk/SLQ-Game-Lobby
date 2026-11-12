// SLQ Game Lobby — the rules both sides agree on: chips, limits, teasing, emotes, avatar looks and the shop.
// The server decides; the browser uses the same lists to draw menus and to check input before sending it.
import { mulberry32 } from './util.js';

export const ECON = {
  start: 500,            // chips a new account starts with
  daily: 100,            // the first visit each day
  win: 25, draw: 10, loss: 5,   // reward for a finished game between people (on top of the pot)
  botWin: 5,             // reward for beating the house robot
  stakes: [0, 10, 25, 50, 100],
  claimHours: 48,        // a player who has waited this long for the other one's move may claim the game
  // EagleEye Commander: for a match that lasted at least `rounds` rounds
  ee: { win: 150, play: 40, botWin: 30, rounds: 3 },
  // The shooter: for a round of at least `minSec` seconds in which one played at least `minPlayed` of them.
  // win/play when people were on both sides, botWin/botPlay against robots only.
  shooter: { win: 40, play: 10, botWin: 10, botPlay: 3, minSec: 90, minPlayed: 60 },
};

export const LIMITS = {
  nameMin: 2, nameMax: 20, passMin: 6, passMax: 100, groupMin: 2, groupMax: 30,
  chat: 240, chatKeep: 200, chatSend: 80, members: 40, groups: 12, tables: 30, ownOpen: 3,
};

// Free: what an avatar can do on its own.
export const EMOTES = {
  wave: { name: 'Vink', dur: 2.4 },
  dance: { name: 'Dans', dur: 4.5 },
  laugh: { name: 'Grin', dur: 2.6 },
  cheer: { name: 'Jubel', dur: 2.4 },
  cry: { name: 'Græd', dur: 3.2 },
  sleep: { name: 'Sov', dur: 5 },
  cheers: { name: 'Skål', dur: 2.2 },
};

// Teasing: what one avatar can do to another. `dur` is how long the victim shows it (seconds), `fly` means
// something is thrown through the room first, `nice` marks the friendly ones.
export const PRANKS = {
  snow: { name: 'Snebold', cost: 5, dur: 8, fly: true },
  tomato: { name: 'Tomat', cost: 5, dur: 10, fly: true },
  water: { name: 'Vandballon', cost: 10, dur: 12, fly: true },
  pie: { name: 'Lagkage', cost: 15, dur: 12, fly: true },
  banana: { name: 'Bananskræl', cost: 10, dur: 4, fly: true },
  feather: { name: 'Kildefjer', cost: 5, dur: 5 },
  fart: { name: 'Pruttepude', cost: 10, dur: 6 },
  cloud: { name: 'Regnsky', cost: 20, dur: 30 },
  chicken: { name: 'Høne', cost: 40, dur: 30 },
  confetti: { name: 'Konfetti', cost: 5, dur: 5, nice: true },
  hug: { name: 'Kram', cost: 0, dur: 3, nice: true },
};
export const PRANK_GAP = 1500;     // milliseconds between two teases from the same player

// ---------- the bar ----------
// What the bar serves, paid with chips. `alc` is how merry one gets from it (below zero: it makes one fresher),
// `glass`, `col` (and `col2`, `foam`, `steam`) say how it is drawn. The whole card is this one list: change it here.
export const DRINKS = {
  fadol: { name: 'Fadøl', cost: 10, kind: 'beer', alc: 1, glass: 'pint', col: '#e9a92b', foam: true },
  pilsner: { name: 'Pilsner', cost: 8, kind: 'beer', alc: 1, glass: 'bottle', col: '#3f8a4a' },
  classic: { name: 'Classic', cost: 10, kind: 'beer', alc: 1, glass: 'pint', col: '#b9641f', foam: true },
  julebryg: { name: 'Julebryg', cost: 12, kind: 'beer', alc: 1.5, glass: 'pint', col: '#8a3a1a', foam: true },
  porter: { name: 'Porter', cost: 14, kind: 'beer', alc: 2, glass: 'pint', col: '#2a1a14', foam: true },
  hvidtol: { name: 'Hvidtøl', cost: 8, kind: 'beer', alc: 0.3, glass: 'bottle', col: '#6b4423' },
  snaps: { name: 'Snaps', cost: 12, kind: 'shot', alc: 2, glass: 'shot', col: '#eef3f1' },
  bitter: { name: 'En lille bitter', cost: 12, kind: 'shot', alc: 2, glass: 'shot', col: '#4a2a18' },
  filur: { name: 'Filur', cost: 20, kind: 'mix', alc: 2, glass: 'tall', col: '#f59a2e', col2: '#e2403a' },
  isbjorn: { name: 'Isbjørn', cost: 20, kind: 'mix', alc: 2, glass: 'tall', col: '#4fc3e8' },
  kirsebar: { name: 'Kirsebærvin', cost: 15, kind: 'mix', alc: 1.5, glass: 'wine', col: '#8e1f3a' },
  glogg: { name: 'Gløgg', cost: 12, kind: 'mix', alc: 1, glass: 'mug', col: '#a3262d', steam: true },
  rod: { name: 'Rød sodavand', cost: 5, kind: 'soft', alc: 0, glass: 'bottle', col: '#d8343c' },
  danskvand: { name: 'Dansk vand', cost: 3, kind: 'soft', alc: -0.5, glass: 'tall', col: '#dff1f7' },
  kakao: { name: 'Kakaomælk', cost: 6, kind: 'soft', alc: 0, glass: 'bottle', col: '#7a4a2c' },
  kaffe: { name: 'Kaffe', cost: 5, kind: 'soft', alc: -1, glass: 'mug', col: '#3a2416', steam: true },
};
export const DRINK_KINDS = { beer: 'Øl', shot: 'Små skarpe', mix: 'Drinks', soft: 'Uden alkohol' };
// A glass lasts `lasts` seconds and is emptied in `sips` sips. Merriness goes from 0 to `buzzMax`, and one step
// of it wears off in `soberMin` minutes. It only changes how the avatar looks.
export const BAR = { lasts: 80, sips: 6, buzzMax: 6, soberMin: 4, gap: 1500 };

// ---------- avatar looks ----------
// A look is a small object of indexes into these lists, plus the worn shop items by key ('' for none).
export const LOOK = {
  skin: ['#fbdcc4', '#f3c7a2', '#e2ab7c', '#c48d5e', '#9c6a42', '#70472c'],
  hair: ['none', 'short', 'spiky', 'side', 'long', 'pony', 'curly', 'bun', 'bob'],
  hairCol: ['#2a2422', '#57391f', '#8b5a2b', '#c58a3a', '#ecd27c', '#b7472f', '#8f9199', '#ece8df', '#3f73da', '#dc5fa6', '#41b06c', '#7d52d4'],
  eyes: ['dot', 'round', 'happy', 'sleepy'],
  beard: ['none', 'stubble', 'mustache', 'full'],
  top: ['tee', 'hoodie', 'shirt', 'stripes'],
  topCol: ['#e2574c', '#f08a3c', '#f2c33f', '#58b85f', '#2f9e8f', '#3d8fe0', '#4a5fd0', '#8a58d6', '#d95fa8', '#f4f1ea', '#8c939c', '#2f333b'],
  bottom: ['pants', 'shorts', 'skirt'],
  bottomCol: ['#34496b', '#2f333b', '#6b4a34', '#8c939c', '#3f7a52', '#a8433c', '#c9b48a', '#5a4a8c'],
  shoeCol: ['#f4f1ea', '#2f333b', '#c5463d', '#3d8fe0', '#6b4a34', '#f2c33f'],
};
export const LOOK_NAMES = {
  skin: 'Hud', hair: 'Frisure', hairCol: 'Hårfarve', eyes: 'Øjne', beard: 'Skæg', top: 'Overdel', topCol: 'Farve på overdel',
  bottom: 'Underdel', bottomCol: 'Farve på underdel', shoeCol: 'Sko',
};
export const STYLE_NAMES = {
  hair: ['Skaldet', 'Kort', 'Strittende', 'Sideskilning', 'Langt', 'Hestehale', 'Krøller', 'Knold', 'Page'],
  eyes: ['Prikker', 'Runde', 'Glade', 'Søvnige'],
  beard: ['Intet', 'Skægstubbe', 'Overskæg', 'Fuldskæg'],
  top: ['T-shirt', 'Hættetrøje', 'Skjorte', 'Striber'],
  bottom: ['Bukser', 'Shorts', 'Nederdel'],
};
export const SLOTS = ['hat', 'glasses', 'neck', 'back'];
export const SLOT_NAMES = { hat: 'Hovedbeklædning', glasses: 'Briller', neck: 'Om halsen', back: 'På ryggen' };

// The shop. Bought once with chips, worn as often as you like.
export const ITEMS = {
  party: { slot: 'hat', name: 'Festhat', cost: 100 },
  cap: { slot: 'hat', name: 'Kasket', cost: 150 },
  beanie: { slot: 'hat', name: 'Strikhue', cost: 150 },
  santa: { slot: 'hat', name: 'Nissehue', cost: 200 },
  chef: { slot: 'hat', name: 'Kokkehue', cost: 250 },
  cowboy: { slot: 'hat', name: 'Cowboyhat', cost: 300 },
  phones: { slot: 'hat', name: 'Høretelefoner', cost: 350 },
  pirate: { slot: 'hat', name: 'Pirathat', cost: 400 },
  tophat: { slot: 'hat', name: 'Høj hat', cost: 500 },
  viking: { slot: 'hat', name: 'Vikingehjelm', cost: 600 },
  wizard: { slot: 'hat', name: 'Troldmandshat', cost: 700 },
  halo: { slot: 'hat', name: 'Glorie', cost: 800 },
  crown: { slot: 'hat', name: 'Krone', cost: 1500 },
  round: { slot: 'glasses', name: 'Runde briller', cost: 150 },
  shades: { slot: 'glasses', name: 'Solbriller', cost: 200 },
  patch: { slot: 'glasses', name: 'Klap for øjet', cost: 200 },
  monocle: { slot: 'glasses', name: 'Monokel', cost: 300 },
  scarf: { slot: 'neck', name: 'Halstørklæde', cost: 150 },
  bowtie: { slot: 'neck', name: 'Butterfly', cost: 150 },
  chain: { slot: 'neck', name: 'Guldkæde', cost: 600 },
  pack: { slot: 'back', name: 'Rygsæk', cost: 250 },
  cape: { slot: 'back', name: 'Kappe', cost: 500 },
  wings: { slot: 'back', name: 'Englevinger', cost: 1200 },
};

const idx = (v, list) => Number.isInteger(v) && v >= 0 && v < list.length ? v : 0;

// Makes any object into a valid look. Shop items stay on only when they are in `owned`.
export function cleanLook(cfg, owned = []) {
  const c = cfg && typeof cfg === 'object' ? cfg : {}, out = {};
  for (const k of Object.keys(LOOK)) out[k] = idx(c[k], LOOK[k]);
  for (const s of SLOTS) {
    const it = typeof c[s] === 'string' && Object.hasOwn(ITEMS, c[s]) ? c[s] : '';
    out[s] = it && ITEMS[it].slot === s && owned.includes(it) ? it : '';
  }
  return out;
}

// A look for somebody new, the same for the same seed.
export function randomLook(seed) {
  const r = mulberry32(seed), out = {};
  for (const k of Object.keys(LOOK)) out[k] = Math.floor(r() * LOOK[k].length);
  out.hair = 1 + Math.floor(r() * (LOOK.hair.length - 1));
  out.hairCol = Math.floor(r() * 7);                 // the natural colours
  out.beard = r() < 0.75 ? 0 : 1 + Math.floor(r() * 3);
  out.bottom = r() < 0.8 ? 0 : 1 + Math.floor(r() * 2);
  for (const s of SLOTS) out[s] = '';
  return out;
}

// Names: letters, digits, space and a few signs. The same test on both sides.
export function nameOk(s, min, max) {
  return typeof s === 'string' && s.length >= min && s.length <= max && /^[\p{L}\p{N}][\p{L}\p{N} _.\-]*$/u.test(s) && !/\s{2}/.test(s) && s === s.trim();
}
