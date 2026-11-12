# SLQ Game Lobby — handoff

Status after the first session (12 Nov 2026): v0.1.0 is on `main`; v0.2.0 (EagleEye Commander in the clubhouse) is a pull request. Read this first when continuing in a new chat.

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

The furniture for the rest stands in the room and answers "Kommer snart": Ludo (board-game table), Yatzy and Meyer (dice table), poker (card table, Texas Hold'em: Søren's choice), the shooter (arcade cabinet).

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

### Adding a game

1. `public/shared/games/<id>.js`: an object with `id`, `name`, `min`, `max`, `station` (the furniture), `setup`, `act`, `turn`, `result`, `view`, `bot` (see `base.js`; `c4.js` is the example). The state must be plain data. `view(state, seat)` is where hidden cards or dice are kept from the others.
2. Register it in `public/shared/games/index.js` (and take it out of `SOON`).
3. `public/js/games/<id>.js`: `render(tv, ctx)` returns the elements for the sheet; register it in `RENDER` in `main.js`.
4. Put the id in the `games` list of its furniture in `room.js` if it is not there.

The table code in `hub.js` (seats, stakes, start, rematch, leaving, robots, tidying) is written for any number of seats, but only two-player games have run through it. Things to look at for more players: `leaveSeat` during a game ends it with the others as winners (a leaver should probably be replaced by a robot), `tclaim` assumes one opponent, and the pot is split evenly among the winners with the rest to the first.

### Changing the bar, the shop, the prices

`public/shared/defs.js`: `DRINKS`, `ITEMS`, `PRANKS`, `ECON`, `BAR`. A new drink needs no drawing code as long as it uses one of the glass shapes in `drawGlass` (`avatar.js`). A new thing to wear needs a few lines in `drawHat` / `drawGlasses` / `drawNeck` / `drawBack`.

## What comes next

- **Milestone 2**: Yatzy, Meyer, Ludo, poker. Dice games need the server's random numbers (`rand` is already handed to `setup`/`act`), Meyer and poker need `view` to hide things, poker needs betting with the shared chips (the table's `stake`/`pot` is a fixed buy-in today).
- **Milestone 3**: the shooter. What the attached version is: three.js r160, everything in one file with globals; collision by colliders, surfaces and ceilings (`groundUnder`, `pushOut`, `moveHoriz`, `updatePlayer`, with round towers as the fragile part); an arena with tunnels and a train one can ride; golden stars as the objective (first team to five); dinosaurs that guard; projectile weapons with spread, recoil, falloff and headshots; rounds with a warm-up; players as a cylinder with a ball for a head. Its network is peer to peer over WebRTC with a PHP page for signalling, each player's own browser decides hits, and the lowest id is "host". The plan: keep the arena, train, stars and dinosaurs; move the network to this server (the WebSocket is ready for binary frames; hits and rounds decided by the server); draw players as the lobby avatars in 3D; work on feel (movement, weapons, hit feedback); add bots and modes. Before starting, check whether the robot's 30 ms of thinking on the server's only thread is a problem for a 20-30 Hz game (move it to a worker, or run the shooter as its own process).
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
10. The robot at 4 på stribe thinks for up to about 30 ms on the server's only thread (see milestone 3).
