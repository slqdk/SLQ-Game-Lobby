// What every game module shares. A game is an object:
//   id, name, min, max (players), station (the furniture it is played at), seatNames, botNames (by level, optional)
//   setup(players, opts, rng) -> state      opts.first: the seat that begins
//   act(state, seat, action, rng)           changes the state, or throws a GameError with a text for the player
//   turn(state) -> seat whose move it is, -1 when nobody's
//   result(state) -> null while it runs, else { win: [seats], draw }
//   view(state, seat) -> what that seat may see (seat -1: a spectator)
//   bot(state, seat, level, rng) -> an action
// A game for more than two may also have:
//   botList: names for several robots at one table
//   drop(state, seat, rng): that player leaves in the middle and the game goes on without them
//   clock(state) -> null or { secs, seat, a }: when nothing happens for `secs` seconds, the lobby makes move `a`
//                   for `seat` (-1: for nobody in particular, such as dealing the next hand)
// The state must be plain data: it is stored as JSON between moves.
export class GameError extends Error {}
