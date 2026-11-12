# SLQ Game Lobby — handoff

Status after the first session (12 Nov 2026): v0.1.0 is on `main`; v0.2.0 (EagleEye Commander in the clubhouse) is pull request #1; v0.3.0 (the shooter in the arcade) is pull request #2 on top of it (it contains #1); v0.4.0 (poker) is pull request #3 on top of that; v0.5.0 (Yatzy) is pull request #4 on top of poker; v0.6.0 (Meyer) is a pull request on top of Yatzy. Each contains the ones before it. Read this first when continuing in a new chat.

- The code lives in **https://github.com/slqdk/SLQ-Game-Lobby** (public, branch `main`). Søren's server pulls from `main` with `lobby-update`, so `main` must always work; larger work goes on a branch and a pull request.
- It runs in a Proxmox LXC behind Nginx Proxy Manager, which needs **Websockets Support** switched on (see the README).
- The user interface is Danish; code and comments are English.
- Sister project: EagleEye Commander (https://github.com/slqdk/EagleEye-Commander), the round-based strategy game that is to move into the clubhouse later.

## What Søren asked for

A friends' lobby that his games become part of. Friends make a group with an admin; they get a lobby where their avatars hang out together; they play together while online (the lobby shows who is online and who plays what); they chat and tease each other's avatars. Most games turn based: 4 på stribe, poker; plus the shooter from his "SLQ Website" project, which is to be improved a lot and built in. Everything runs on his Proxmox.

His answers to the questions asked:

- The lobby is a **2D clubhouse**: a drawn room seen obliquely from above, avatars walk by click or tap, the games stand as furniture, it works on a phone.
- More games from the start: **Yatzy, Ludo, Meyer**.
- The shooter needs all four: network through the server, figures and graphics, game feel, bots and game modes.
- **Chips for everything**: won in games, spent on teasing and avatar clothes; poker uses the same chips.
- Added while the first version was being built: **a bar** where one sits and buys beer and drinks. He will send his own card later; "take something Danish to start with".

## What exists (v0.1.0)

Accounts, groups (owner, admins, invitation link), the clubhouse with avatars, chat with bubbles, emotes, eleven kinds of teasing, the bar with sixteen drinks, the kiosk with 23 things to wear, the wardrobe, the notice board, chips, and 4 på stribe (friend or robot, stake, rematch, give up, claim after 48 hours). Installer for Proxmox with the commands `lobby-update`, `lobby-code` and `lobby-password`. Self test with 251 checks.

**v0.2.0** adds EagleEye Commander at the command table (see "EagleEye Commander in the lobby" below).

**v0.3.0** adds the shooter in the arcade (see "The shooter in the arcade" below).

**v0.4.0** adds poker at the card table (see "Poker" below).

**v0.5.0** adds Yatzy at the dice table (see "Yatzy" below).

**v0.6.0** adds Meyer at the dice table (see "Meyer" below).

The furniture for the rest stands in the room and answers "Kommer snart": Ludo (board-game table).

## Decisions made without asking (tell Søren, change if he wants)

- **Login** is a name and a password. A new account needs a code: a group's invitation, or the **installation code** (made on first start, shown by the installer and by `lobby-code`), which also gives the right to create groups.
- **One wallet per player**, not per group: chips, bought things, the avatar and the counters follow the account. Members, roles, chat and tables belong to the group.
- **One connection per account**: opening the lobby somewhere else pauses the first place ("Åbnet et andet sted").
- **Chips**: 500 to start, 100 on the first visit each day, 25 / 10 / 5 for winning / drawing / losing a game against a person, 5 for beating the robot. Stakes 0, 10, 25, 50, 100, paid when sitting down, back if one leaves before the start; the winner takes the pot. No stakes against the robot. A game with fewer than three moves each earns no reward (giving up at once is not a chip machine).
- **Games wait**: a game of 4 på stribe stays on its table when both close it; "Din tur" shows as a badge and a toast. After 48 hours without a move the one waiting may take the win. Tables tidy themselves away (waiting a day, finished a few minutes, untouched a month with the stakes back).
- **Teasing** costs 0-40 chips, is only looks, wears off (5-30 seconds), and needs both to be in the room. "Forstyr ikke" blocks teasing, invitations and bought drinks, and also stops one from teasing.
- **The bar**: one must be at the bar to order. A drink for oneself, for somebody, or a round for everybody in the room (not those on "forstyr ikke"). A glass lasts 80 seconds. Merriness (0-6) only changes how the avatar looks (rosy cheeks, a sway, "hik!", sleepy eyes), wears off one step every four minutes, and coffee or water takes it down. The card uses general Danish names, no brands; Søren will replace it (it is one list, see below).
- **The robot** behind the bar and at the game tables is the same house robot.
- The **shooter's source is not in this repository yet**. The version Søren attached (one 2,000-line `shooter.js` on three.js r160, an HTML shell, and a framework note that is older than the code) stays in his SLQ Website project until milestone 3 starts; it has to be attached again then. Its `js/net.js` and `rtc.php` were never attached and are not needed (see milestone 3).

## How it works

### Server

`server/server.js` serves the pages, a few HTTP calls (`/api/health`, `register`, `login`, `invite`, and `admin` for `tools/admin.mjs`, which proves itself with the secret in the data folder) and upgrades `/ws`. `server/ws.js` is the WebSocket protocol written out (no packages). `server/store.js` keeps everything in memory and writes JSON files a moment after a change and on SIGTERM. `server/hub.js` is the lobby itself and knows nothing about sockets or files, which is what the self test uses.

Logins are signed tokens `<user id>.<generation>.<signature>`; changing the password raises the generation, so every other login stops working. Passwords are scrypt hashes.

Everything a browser sends is checked in `hub.js` against the lists in `public/shared/defs.js`; the browser is never trusted with prices, positions or rules.

### Messages over the WebSocket (JSON, `t` is the kind)

From the browser:

| | |
|---|---|
| `hello {token}` | first message; answered by `welcome` |
| `enter {g}` / `leave` | into a group's clubhouse / back to the group list |
| `move {x,y}`, `sit {st}` | walk; sit on the sofa or at the bar |
| `say {s}`, `emote {k}`, `prank {k,to}`, `drink {k,to}` | `to` of a drink: nothing (oneself), a user id, or `'all'` |
| `look {look}`, `buy {k,wear}`, `dnd {on}`, `pass {old,pass}` | avatar, kiosk, do not disturb, new password |
| `gnew {name,code}`, `gjoin {code}`, `grename`, `ginvite`, `gkick {u}`, `grole {u,role}`, `gleave`, `gdel` | groups; `role` is `member`, `admin` or `owner` (hands the group over) |
| `tnew {game,stake,bot,invite}`, `tjoin {id}`, `tbot {id,level}`, `tinv {id,u}`, `tstart {id}` | tables |
| `tact {id,a}`, `tagain {id}`, `tclaim {id}`, `tleave {id}`, `topen {id}`, `tclose` | `a` is the game's own action, or `{resign:true}` |

From the server: `welcome`, `groups`, `room` (everything about the clubhouse at once), `on` / `off` / `mem` / `gone` (members), `g` (group changed), `out` (no longer in the group), `mv` (somebody walks: the path, and the seat they are heading for), `chat`, `emo`, `prank`, `drink`, `me` (one's own chips, things, look), `tb` / `tbx` (a table changed / is gone), `tv` (the table one has open, with what one's seat may see), `inv` (an invitation to a table), `err` (a text for the player), `bye` (`login`: log in again; `other`: opened somewhere else), `token` (after a password change).

### The room

`public/shared/room.js` holds the room for both sides: 24 x 13 "steps", the furniture (`STATIONS`: footprint, where to stand, seats), a walk grid of half steps, and `findPath`. The server finds every path and sends it; browsers only play it back, so nothing has to agree to the last decimal.

Drawing (`roomart.js`): x runs across, depth runs down the screen at 0.7, height straight up. Wall and floor are painted once into one picture; every piece of furniture into its own; each frame draws them and the avatars sorted by depth. The bartender, the dance floor, the arcade screen, the music box and the clock are drawn live.

Avatars (`avatar.js`) are about 100 units tall with their feet at (0, 0). A look is a small object of indexes into the lists in `defs.js` plus worn things by key; `cleanLook` makes anything from a browser valid.

### EagleEye Commander in the lobby (v0.2.0)

Søren asked for EagleEye Commander to be integrated, after the shooter; it was done first because it is the smaller job.

- `public/eagleeye/` is a **copy of EagleEye Commander 2.5.0** (the `v2.5` branch of its own repository: radar attacks, spying, minefields, the A-bomb; pull request #4 there, not merged when the copy was taken). From now on this copy is where the game lives for the lobby; the stand-alone repository and Søren's stand-alone site were not touched. Changes made to the copy:
  - the two fonts are served from `public/eagleeye/fonts/` instead of Google's servers;
  - `js/main.js` has a clubhouse mode (`EMBED`: the page is in a frame): no front page for online play, no invitation code, "Til klubhuset" instead of "Til forsiden", and `#traening` in the address shows the skirmish menu; opened outside a frame the page goes to the lobby;
  - `index.html` lost the links to the fonts and the web manifest.
- `server/eagleeye.js` is the game's old server turned into a module: the same engine (`public/eagleeye/shared`), one JSON file per match in `<data>/eagleeye/`, deadlines checked once a minute. A match carries `lobby: { gid, users: { <user id>: <player id> }, paid }`.
- The game page talks to `/eagleeye/api/state|act|replay` with a login `<code>.<player id>.<signature>` that is valid for one general in one match. The lobby hands it out (`eopen`) to the account that general belongs to, and the page finds it in the tab's session storage (`jf2-cur`), which is how the game always remembered its match. `create`, `join` and `login` on that path answer "open the match from the command table".
- Lobby messages: `enew {name}`, `ejoin {code}`, `eopen {code}`, `eclose`, `eleave {code}` (before the start), `edrop {code}` (the host before the start or after the end; an admin at any time). The room message carries `ee: [...]`, changes arrive as `ee` and `eex`. While the game is open the avatar sits at the command table (`busy: 'ee'`, the same mechanism the shooter will use).
- Everything else happens on the game's own pre-start page: map, size, money, deadline, AI generals, start.
- Chips: when a match that lasted at least three rounds ends, the winners get 150 and the other players 40 (30 for beating only AI generals), once.
- The page has its own content security policy (it writes styles into its markup) and may only be framed by the lobby itself.

### The shooter in the arcade (v0.3.0)

Søren asked for the shooter to be "improved a lot" and built in, on all four fronts: network through the server, figures and graphics, game feel, robots and game types. He was not going to test for a while, so it was built in one go.

**What was kept.** The arena, the train, the golden stars, the dinos and the five weapons of the stand-alone shooter, with their numbers. The arena, the train and the movement functions were moved over as they were, Danish comments and all (`public/shooter/world.js`; the textures, sounds, view model and small props likewise, in `tex.js`, `sfx.js`, `viewmodel.js`, `fx.js`). Do not "improve" `groundUnder`, `pushOut`, `moveHoriz` or the order of things in `stepPlayer`.

**What is new.**
- *One arena for both sides.* `buildWorld(THREE, scene, texLib)` builds the picture in the browser; the server calls it with `nullThree()` (a stand-in that answers everything with itself) and gets only the colliders, surfaces, ceilings and the train. The self test compares the two builds number for number.
- *The server decides* (`server/arena.js`): a match lives in memory while somebody plays it. Each browser moves its own player (the same `stepPlayer`) and says where it is 20 times a second (`as`); the server passes that on in one message per step (`ax`) and decides health, kills, respawn, pickups, health packs, stars, dinos and rounds. A shooter's browser flies its own bullets and says what they hit (`ah`, `ae` for explosions); the server checks that the shot exists, was fired with a weapon the player has, can have flown that far by now, and that the victim was near that point during the last 0.8 seconds, and works out the damage itself. No host any more, and no WebRTC.
- *The train runs by the clock*: every browser works its place out from the match clock (synchronised with small pings), so it is in the same spot for everybody. Somebody riding it is sent as "wagon and place on it", so they do not slide about on other people's screens.
- *Robots* (`arena-nav.js`, `arena-bots.js`): a grid of standing places half a metre apart, joined where a walker really gets from one to the next with the arena's own movement rules (about 35,000 places, built in 0.3 s when the first match starts). Robots follow paths on it, see only along a free line of sight, aim with an error and a reaction time that depend on their level, fetch weapons, health, the star on the train, and now and then steal a star from the other tower. They fill a match up to the chosen number and leave when people come; teams are kept even.
- *Three game types*: Stjernejagt (the old rules: star on the train every 60 s, taken with E, carried to the tower top by itself, five stars win, stealing by holding E for 3 s on the other tower; a star not put in place within 30 s is lost), Holdkamp (first team to 30 kills or 8 minutes), Alle mod alle (first to 15 kills or 8 minutes). Rounds follow each other until the last person leaves.
- *The players are the clubhouse avatars* in 3D (`figure.js`: skin, hair, beard, clothes, shoes, hats, glasses and the rest of the kiosk), with the team's vest over the clothes; robots are steel with an antenna.
- *Feel*: speed eases in and out, a jump is still taken just after an edge, the weapon sways, bobs and kicks, the view dips on landing and shakes near explosions, hit markers (yellow for the head), an arc showing where a hit came from, a kill list, three seconds out after a death and 2.5 seconds of protection after coming back, hold the mouse button to keep firing, a scope picture for the sniper.
- *Faster drawing*: the arena's 1,800 still meshes are joined into 27 when the game starts (`merge.js`), shadows are redrawn every second or third frame, and there are four graphics steps; the game steps down by itself when it runs under 36 frames a second.

**Bugs of the stand-alone version that were fixed on the way.** Bullets moved once a frame and could jump through walls and people (a sniper bullet covers 3 m in a frame); now they fly in steps of 0.3 m. One row of deck tiles hung over the first of the upper tower steps and shoved everybody sideways there; those four tiles per tower are gone. The knife did nothing to other players. Other players' figures faced backwards. Dinos could shoot through thin walls (line of sight was sampled every 0.7 m).

**Messages** (all start with `a`). From the browser: `anew {mode, fill, level}`, `ajoin {id}`, `aleave`, `at` (change sides), and many times a second `as` (where I am), `af` (fired), `ah` (hit), `ae` (explosion), `ap` (ping): these five have a message budget of their own in `hub.js`. To the browser: `ain` (everything about the match on the way in), `aout`, `aent` (players in and out), `asp` (spawn or teleport), `ax` (where everybody is), `af`, `ahit`, `akill`, `abm` (explosion), `apk`/`ahp` (pickups), `astar`, `ast` (round state and the final table), `adino`, `adh`, `ap`, `amsg`. The group's room gets `ar`/`arx` when a match changes or is gone, and the room message carries `arenas: [...]`.

**Chips**: for a round of at least 90 seconds in which one played at least 60: 40 for winning and 10 for playing when people stood on both sides; 10 and 3 against robots only (`ECON.shooter`). Standing still for three minutes sends one back to the clubhouse.

**Decisions made without asking**: one starts every round with the knife only and keeps what one picks up until the round ends (as before); a weapon one already has is left for the others; robots take 6, 12 or 20 seconds (by level) to notice a new star, so people get a head start; robots never jump off edges (they take the stairs); a match holds eight players, a group two matches at a time; no friendly fire; one cannot change sides so that all people end up on one team.

### Poker (v0.4.0)

Søren chose Texas Hold'em. It is built as a **small tournament** (a "sit and go"), because that is what the tables already were: everybody pays the same buy-in, the winner takes the pot, a rematch needs everybody. A loose table where one sits down with one's own chips and leaves at will was not built; it would reuse the rules and the screen, and needs seats that come and go and chips moving between wallet and table in `hub.js`.

- **The rules** (`public/shared/games/poker.js`): two to six players, 1,000 poker chips each, blinds from 5/10 rising every eighth hand (`BLINDS`, `HANDS_PER_LEVEL`), no limit. The state is plain data: stacks, who is out, the deck, the board, hole cards, what everybody has bet in this round (`bet`) and this hand (`total`), who folded, who is all in, who has spoken since the last real raise (`acted`), `toCall`, `minRaise`, `turn`, and `last` (the result of the hand that just ended, shown for a few seconds). Moves: `{fold}`, `{call}` (a check when nothing is owed), `{raise: n}` (raise *to* n), and `{next}` (deal the next hand). A raise must be at least as big as the last one; an all-in smaller than that does not let those who have already spoken raise again. Side pots are worked out from `total` at the end of the hand; what nobody could match goes back. With two players the dealer has the small blind and speaks first before the flop.
- `handValue(cards)` turns the best five of up to seven cards into one number; `handName` gives the Danish name. `equity()` deals the rest of the cards many times and is what the robots judge a hand by (120, 220 or 360 deals by level; the easy robot also misjudges and calls too much, the hard one raises more and bluffs a little).
- **What the tables learned** (`hub.js`, described in `games/base.js`): `botList` (names for several robots at one table; a robot table starts when it is full or when the host says so), `drop(state, seat)` (somebody leaves and the others play on; when only robots are left the table is closed), and `clock(state)` (when nobody acts in time the lobby makes the move the game asks for). The clock is `t.wake = { at, seat, a }` on the table, stored with it, and `hub.tick()` (once a second from `server.js`) makes the moves that are due. Poker asks for 40 seconds per decision (then a check, or a fold when a bet is owed), 4 seconds for somebody who has let the clock run out twice in a row, and 7 seconds between hands. `tclaim` (taking the win after 48 hours) is refused for games with a clock.
- **The screen** (`public/js/games/poker.js`): the table with the seats around it (one's own at the bottom), cards, bets, the dealer button, what everybody last did, the clock, and Fold / Check or Call / a slider with Min, ½ pot, Pot and All-in. Spectators see no hole cards; the server never sends them (`view`).
- Chips: the buy-ins go to the winner; the usual rewards on top (25 for winning, 5 for the others; 5 for beating robots). A tournament that is over in fewer than three moves per seat earns no reward.
- Decisions made without asking: a tournament and not a loose table; winner takes all (no second prize); robots only at tables without a buy-in (as in 4 på stribe); everybody still in at the end shows their cards (no mucking); somebody who leaves loses their poker chips (they are taken out of play); the poker words are the English ones players use (fold, check, call, raise, all-in), the hands have Danish names.

### Yatzy (v0.5.0)

Five dice and the sheet most people in Denmark use (Søren did not answer "five or six dice", so five): the six upper fields with 50 extra from 63, one pair, two pairs, three and four of a kind, small straight (1-5, 15 points), large straight (2-6, 20), house, chance, Yatzy (50). Two to four players, with or without a stake, robots at tables without one.

- `public/shared/games/yatzy.js`: moves are `{roll: [five booleans: which dice to keep]}` (the first throw of a turn throws all five; three throws a turn) and `{score: field}`. The dice are thrown on the server. Everything is open, so `view` hides nothing. `drop` takes a player out and the others finish; alone at the table one has won. No clock: like 4 på stribe it can be played one turn now and the next tomorrow, and after 48 hours any other player can pass the slow one (`tclaim` drops them when the game has `drop`).
- The robot tries every way of keeping dice, throws the rest in its head (10, 28 or 90 times by level; the hard one also looks one throw further), and keeps what gives the best field on average, measured against what each field is normally worth (`PAR`). It averages about 195, 215 and 220 points.
- `public/js/games/yatzy.js`: the dice (tap to keep), the sheet with one column per player, one's own open fields as buttons showing what the throw would give. `public/js/games/common.js` holds what the screens for more than two share (the table before the start, faces); poker still has its own copy of the pre-start screen.

### Meyer (v0.6.0)

The lying game with two dice and a cup, two to six players, six lives each; the last one alive wins.

- `public/shared/games/meyer.js`. A throw is kept as its place in the row from lowest to highest (`rankOf`): 32, 41 … 65, the pairs 11 to 66, Lille Meyer (31), Meyer (21). Moves: `{roll}` (throw and look), then `{say: n}` (the same as the last claim or higher; it need not be true), `{blind}` ("det eller derover": throw without looking and pass it on with the same claim), `{lift}`, and `{next}` after a lift. Lifting a lie costs the liar a life, lifting the truth costs the lifter one; a round where Meyer was claimed costs two. Whoever lost begins the next round. The first of a round must throw and look.
- `view` hides the cup from everybody and one's own throw from the others; a lift puts the dice in `last`.
- A clock like poker's (40 seconds; when it runs out the truth is said for one, or the least that is allowed, or the cup is passed on unseen), and 6 seconds to look at a lifted cup.
- The robot estimates how likely the last claim is a lie from what the claimant had to beat (`prev.need`: somebody who had to beat 65 has probably thrown too low) and from how lies tend to land just above that; then it weighs what lifting risks against what throwing on risks. The hard one lies with claims a real throw could have been; the easy one lifts at random and always says the least that will pass; the middle one is the two mixed. Of six robots, two of each, the hard ones win about three times as often as the easy ones.
- Decisions made without asking: "the same or higher" (not strictly higher); six lives; Meyer costs two for whoever loses that round; Lille Meyer is just the second highest throw (no special rule); no rule about what the loser must do.

### Adding a game

1. `public/shared/games/<id>.js`: an object with `id`, `name`, `min`, `max`, `station` (the furniture), `setup`, `act`, `turn`, `result`, `view`, `bot` (see `base.js`; `c4.js` is the example). The state must be plain data. `view(state, seat)` is where hidden cards or dice are kept from the others.
2. Register it in `public/shared/games/index.js` (and take it out of `SOON`).
3. `public/js/games/<id>.js`: `render(tv, ctx)` returns the elements for the sheet; register it in `RENDER` in `main.js`.
4. Put the id in the `games` list of its furniture in `room.js` if it is not there.

The table code in `hub.js` (seats, stakes, start, rematch, leaving, robots, tidying) is written for any number of seats, but only two-player games have run through it. Things to look at for more players: `leaveSeat` during a game ends it with the others as winners (a leaver should probably be replaced by a robot), `tclaim` assumes one opponent, and the pot is split evenly among the winners with the rest to the first.

### Changing the bar, the shop, the prices

`public/shared/defs.js`: `DRINKS`, `ITEMS`, `PRANKS`, `ECON`, `BAR`. A new drink needs no drawing code as long as it uses one of the glass shapes in `drawGlass` (`avatar.js`). A new thing to wear needs a few lines in `drawHat` / `drawGlasses` / `drawNeck` / `drawBack`.

## What comes next

- **Milestone 2**: Ludo (poker is done in v0.4.0, Yatzy in v0.5.0, Meyer in v0.6.0). Dice games need the server's random numbers (`rand` is already handed to `setup`/`act`), Meyer needs `view` to hide the dice (poker shows how). The tables now handle more than two seats, robots with names, leaving in the middle and a clock (see "Poker"). Poker itself could get a loose table (sit down with one's own chips, leave at will) and a second prize.
- ~~Milestone 3: the shooter~~ done in v0.3.0. Left to do there: controls for phones (touch sticks), text chat inside a match, the clubhouse's teasing inside a match, more arenas (the arena is one module, `world.js`), spectating, and tuning after real play: how good the robots are, how eager they are for the star, the rewards.
- ~~Milestone 4: EagleEye Commander in the clubhouse~~ done in v0.2.0. Left to do there: the game still polls its server every few seconds (the lobby's WebSocket could tell it at once), and the clubhouse avatar is not shown inside the game.

## Not verified, and known gaps

1. **No real people have used it.** Everything was driven by scripts: two and three browsers (desktop and a phone-sized touch screen) through registration, the invitation link, walking, chat, teasing, the bar, the kiosk, the wardrobe and whole games, plus restart of the server in the middle of a game.
2. **The sound has not been heard** (built in a container without audio). The effects are short synthesised blips; levels and character need a human ear.
3. **Real phones** (Safari on iOS in particular) have not been tried: only Chromium with a phone's screen size and touch.
4. **Behind Nginx Proxy Manager** it has not run. The WebSocket code was tested directly and with a browser; what the page says when the WebSocket is blocked was tested by blocking it.
5. **Balance of the chips** is a guess: prices against rewards, and whether 100 a day is too much or too little.
6. **A forgotten password** is fixed on the server only: `lobby-password <name>` prints a new random one (and `lobby-password` alone lists the accounts). There is no "I forgot my password" on the page, because the lobby has no e-mail addresses.
7. **No notification when one is away** (it is your turn, somebody is in the clubhouse). The page shows it when one opens it.
8. The avatar always faces the viewer; walking sideways leans and turns the face a little, but there is no real side view.
9. Two tables at the same piece of furniture share its label; with many games at once the avatars run out of stools and stand next to the table.
10. The robot at 4 på stribe thinks for up to about 30 ms on the server's only thread, and so does the first shooter match after a start (0.3 s for the robots' walking grid); a shooter match steps 20 times a second, so a long think shows as a short hitch there.
11. **The shooter has never run on a real graphics card.** It was driven by scripts in a headless browser with a software renderer at one to three frames a second: starting from the arcade, joining, walking, picking up a pistol, shooting somebody else, dying, coming back, the table, leaving; and whole matches of robots against each other on the server. How it *feels* (movement, recoil, the mouse, the frame rate, whether the robots are fun) nobody has tried. Catching the mouse (pointer lock) was not tested either; the scripts play without it.
12. The shooter's sounds are the old ones plus a few new blips, unheard like the rest.
13. **Poker has only been played by scripts and robots**: thousands of tournaments of random and robot players on the server (no chip appears or disappears), and one person with four robots in a browser at desk and phone size. Whether the robots are fun to play against, and whether 40 seconds and blinds every eighth hand feel right, nobody has tried.
14. In the shooter a shooter's own browser says what its bullets hit. The server checks that it is plausible, not that it is true: fine among friends, not against cheats.
