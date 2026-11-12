// What every game module shares. A game is an object:
//   id, name, min, max (players), station (the furniture it is played at), seatNames, botNames (by level, optional)
//   setup(players, opts, rng) -> state      opts.first: the seat that begins
//   act(state, seat, action, rng)           changes the state, or throws a GameError with a text for the player
//   turn(state) -> seat whose move it is, -1 when nobody's
//   result(state) -> null while it runs, else { win: [seats], draw }
//   view(state, seat) -> what that seat may see (seat -1: a spectator)
//   bot(state, seat, level, rng) -> an action
// The state must be plain data: it is stored as JSON between moves.
export class GameError extends Error {}
