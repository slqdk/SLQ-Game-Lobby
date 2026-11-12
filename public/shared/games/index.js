// The games the clubhouse knows. `soon` lists what the furniture promises but is not built yet.
import c4 from './c4.js';
import poker from './poker.js';
import yatzy from './yatzy.js';

export const GAMES = { c4, poker, yatzy };
export const SOON = {
  ludo: 'Ludo', meyer: 'Meyer',
};
export { GameError } from './base.js';
