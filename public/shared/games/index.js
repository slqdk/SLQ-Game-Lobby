// The games the clubhouse knows. `soon` lists what the furniture promises but is not built yet.
import c4 from './c4.js';
import poker from './poker.js';
import yatzy from './yatzy.js';
import meyer from './meyer.js';
import ludo from './ludo.js';

export const GAMES = { c4, ludo, poker, yatzy, meyer };
export const SOON = {
  blackjack: 'Blackjack',
};
export { GameError } from './base.js';
