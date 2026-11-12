# SLQ Game Lobby

A clubhouse for a group of friends. Each group gets a drawn room where everybody's avatar hangs out: you walk around, chat, tease each other, sit at the bar, and sit down at a table to play. The room shows who is in and who plays what.

What is in it:

- **Groups** with an owner, admins and an invitation link. An account is a name and a password.
- **The clubhouse**: a 2D room seen from the front and a little from above. Click or tap the floor to walk, the furniture to use it, another avatar to tease or challenge. Works with a mouse and on a phone.
- **Avatars** you put together yourself (skin, hair, face, clothes), plus hats, glasses and more from the kiosk.
- **Chips** (jetoner): one wallet per player. 100 for showing up each day, a reward for every finished game against a friend, and the pot when you play for a stake. Spent in the bar, in the kiosk and on teasing.
- **Teasing**: snowball, tomato, water balloon, cream pie, banana peel, tickle feather, whoopee cushion, rain cloud, turning somebody into a hen; and the friendly ones, confetti and a hug. Only looks, and it wears off. "Forstyr ikke" switches it off both ways.
- **The bar**: sit on a stool and buy for yourself, for a friend, or a round for everybody. The glass stays in the avatar's hand, and a few too many show.
- **4 på stribe** against a friend (live, or one move now and the next tomorrow), with or without a stake, or against the house robot in three strengths.
- **EagleEye Commander** at the command table: the round-based strategy game, with the group's matches listed in the clubhouse and no codes or PINs (the lobby account is the general).
- **The shooter** in the arcade: a first-person game in 3D for up to eight, with the clubhouse avatars as the players. Three game types (Stjernejagt with the train, the golden stars and the dinos; Holdkamp; Alle mod alle), robots in three strengths that fill the empty places, and one can walk into a match that is already running. The weapons are models built by code (a knife, a pistol, a bolt rifle with a scope, a rocket launcher and a home-made pistol): one sees one's own hands swing the knife, change magazines and work the bolt, the others carry the same weapons, and they lie ready in the arena as themselves. The arena is a small town: houses with roofs of tile, slate and thatch, hedges and trees whose leaves move in the wind, a meadow with flowers and worn paths, a vaulted brick tunnel with lamps, flags on the towers, clouds, birds and a train that smokes. Mouse and keyboard; not for phones yet.
- **Poker** at the card table: Texas Hold'em without a limit as a small tournament for two to six. Everybody starts with 1,000 poker chips, the blinds rise every eighth hand, and the last one with chips takes the buy-ins. A clock keeps it moving (40 seconds per decision), and robots in three strengths can fill the seats at tables without a buy-in.
- **Yatzy** at the dice table: five dice, the Danish sheet with fifteen fields and the bonus for 63, two to four players, live or one turn now and the next tomorrow, with or without robots.
- **Meyer** at the dice table: two dice under a cup, say the same as the one before or higher (true or not), believe it or lift the cup. Six lives each, Meyer costs two, two to six players, a clock, robots that lie and doubt.
- **The casino wing**: the clubhouse is eight steps wider, with three slot machines where one stakes one's chips. Kirsebærhaven (three reels, one line, small stakes), Robotværkstedet (five reels, ten lines, a joker and free spins) and Sparegrisen (three reels, and a jackpot that belongs to the group and grows with every stake). Everybody in the clubhouse sees every spin as it happens: the result rises from the player, a tally over the name shows what they are up or down, and the board on the wall keeps today's score.
- **Blackjack** at the table in the casino wing: up to five play against the house, each with a stake of their own (10 to 200). Six decks, the dealer stands on 17, blackjack pays 3 to 2, one may double on the first two cards and split a pair once. Anybody can stand by and watch every card, and what each round gave rises from the players in the clubhouse like at the machines.
- **Notifications** on phone and computer when it is your turn, when somebody asks you to a table, or when a new round has begun in EagleEye Commander, and the clubhouse is not in front of you. Switched on per device in the ☰ menu.
- **Ludo** at the board-game table: two to four players, a six to get out, globes and stars, two together stand safely, an exact throw into the goal. The pieces hop along the board, robots in three levels, and like Yatzy it can be played over days.

No dependencies: Node 20 or newer and a browser. The user interface is in Danish.

## Run it

```
node server/server.js            # http://localhost:8080
PORT=8090 DATA_DIR=/var/lib/slq-game-lobby node server/server.js
```

| Setting | Default | Meaning |
|---|---|---|
| `PORT` | `8080` | Port to listen on |
| `DATA_DIR` | `./data` | Where accounts, groups and the login key are kept |
| `HOST` | all interfaces | Listen on one address only, e.g. `127.0.0.1` |
| `TRUSTED_PROXY` | none | Extra reverse-proxy addresses or networks, comma separated (see "Behind a reverse proxy") |
| `PUSH` | on | `off` runs without notifications |
| `PUSH_CONTACT` | the lobby's own address | Whom a push service may contact about this server, e.g. `mailto:you@example.com` (see "Notifications") |
| `PUSH_HOSTS` | none | More push services than the big browsers' own, comma separated host names |

The installed service runs on Danish time (`TZ=Europe/Copenhagen` in `deploy/slq-game-lobby.service`): that decides when a new day starts for the daily chips.

The first start writes `config.json` in the data folder with the **installation code** (`XXXX-XXXX`). Whoever makes an account with that code may create groups; everybody else joins through a group's invitation link.

`npm test` runs the self test: the lobby logic without sockets, then the real server on a spare port with a hand-made WebSocket client.

## Install on Proxmox

A small unprivileged LXC is plenty: 1 core, 512 MB memory, 2-4 GB disk.

**A. In a container you have made yourself** (Debian 12/13 or Ubuntu 22.04/24.04). In the container's console, as root:

```
apt-get update && apt-get install -y curl ca-certificates
curl -fsSL https://raw.githubusercontent.com/slqdk/SLQ-Game-Lobby/main/deploy/install.sh | bash
```

The same from the shell of the Proxmox host, here for a container with the number 121 (use your own):

```
pct exec 121 -- bash -c "apt-get update && apt-get install -y curl ca-certificates && curl -fsSL https://raw.githubusercontent.com/slqdk/SLQ-Game-Lobby/main/deploy/install.sh | bash"
```

**B. Let a script make the container too.** In the shell of the Proxmox host:

```
curl -fsSL https://raw.githubusercontent.com/slqdk/SLQ-Game-Lobby/main/deploy/proxmox-lxc.sh | bash
# with a fixed address:
curl -fsSL https://raw.githubusercontent.com/slqdk/SLQ-Game-Lobby/main/deploy/proxmox-lxc.sh | IP=192.168.1.50/24 GW=192.168.1.1 bash
```

It takes the next free container number, downloads the Debian template if needed, creates an unprivileged container (`CTID`, `CT_NAME`, `IP`, `GW`, `BRIDGE`, `STORAGE`, `DISK`, `MEMORY`, `CORES` can be set, see the top of the script) and runs the installer in it.

What `deploy/install.sh` does:

- installs git, curl and Node.js (the distribution's own if it is 20 or newer, otherwise Node 24 from NodeSource);
- clones this repository to `/opt/slq-game-lobby`;
- creates the system user `slqlobby` and the data folder `/var/lib/slq-game-lobby`;
- installs and starts the systemd service `slq-game-lobby` on port 8080, and checks that it answers;
- adds the commands `lobby-update`, `lobby-code` and `lobby-password`;
- prints the address and the installation code.

Other choices go in front of `bash`: `curl ... | PORT=9000 bash` (also `APP_DIR`, `DATA_DIR`, `BRANCH`).

**Afterwards**

| | In the container | From the Proxmox host |
|---|---|---|
| Update to the newest version | `lobby-update` | `pct exec 121 -- lobby-update` |
| Show the installation code | `lobby-code` | `pct exec 121 -- lobby-code` |
| A new password for somebody who forgot theirs | `lobby-password Mads` | `pct exec 121 -- lobby-password Mads` |
| List the accounts | `lobby-password` | `pct exec 121 -- lobby-password` |
| Log | `journalctl -u slq-game-lobby -f` | |
| Restart | `systemctl restart slq-game-lobby` | |

An update keeps accounts, groups and games. People who are in the clubhouse are back within a few seconds: the page reconnects by itself and games carry on where they were.

## First start

1. Open the address. Choose **Opret konto**, pick a name and a password, and put the installation code in the field **Kode**.
2. **Opret en gruppe** and give it a name. You are its owner.
3. Open the ☰ menu (or walk to the door) and copy the **invitation link**. Send it to your friends. Whoever opens it makes an account and lands in the clubhouse. They do not need the installation code.
4. A new link can be made at any time; the old one then stops working. Members can be made admins or taken out from the same menu.

## Behind a reverse proxy (Nginx Proxy Manager)

Proxy host: Scheme `http`, Forward Hostname/IP = the container's address, Forward Port `8080`.

- **Switch "Websockets Support" on.** Everything in the clubhouse goes over one WebSocket (`/ws`). Without it the page says so after a few attempts.
- Leave "Cache Assets" off: the server sends its own cache headers, and an update should reach everybody at once.
- Use HTTPS on the proxy (the SSL tab, "Force SSL"). Passwords are sent to the server when logging in.
- The server sends a ping every 25 seconds, so the proxy's 60 second idle limit never closes a quiet connection.

The login throttle (eight wrong attempts from an address, then ten minutes' wait) needs the visitor's real address. A forwarded address is believed when the proxy is on the same machine, on a private network, or on one of the server's own networks. A proxy somewhere else is named with `TRUSTED_PROXY=203.0.113.7` (addresses or networks, comma separated) in the service file.

## Notifications

Everybody switches them on for themselves, per device: ☰ menu, **Beskeder på denne enhed**. The button **Send en prøvebesked** next to it shows at once whether a message gets through.

- They need **HTTPS** (browsers only allow them on a secure page), so they work through the reverse proxy and not on `http://<address>:8080`.
- On **iPhone and iPad** the clubhouse must first be put on the home screen (Share, "Føj til hjemmeskærm") and opened from there; Safari only gives notifications to such pages. Android, Windows, macOS and Linux browsers need nothing extra.
- A message is sent when it is your turn at a table where another person is waiting, when somebody asks you to a table, when a game you sat in has ended, and when a new round has begun in EagleEye Commander; only to somebody who is not looking at the clubhouse (no page open, the tab hidden, the window behind another, or untouched for five minutes), and once per table until they have been back at it.
- The server must be able to reach the browsers' push services on the internet (port 443 outwards): Google's for Chrome, Edge, Brave and Samsung, Mozilla's for Firefox, Apple's for Safari. Messages are encrypted for the one browser; the push service cannot read them.
- The server's key pair for this is made at the first start and kept in `config.json`. If that file is lost, everybody has to switch notifications on again.

## Data and backup

Everything is JSON in the data folder (`/var/lib/slq-game-lobby` when installed):

- `config.json`: the key that signs logins, the installation code, and the key pair for notifications
- `users.json`: accounts (names, salted password hashes, chips, looks, counters, the browsers that get notifications)
- `groups/<id>.json`: one file per group with members, the last 200 chat lines and the tables
- `eagleeye/<code>.json`: one file per EagleEye Commander match

Back up by copying the folder, or the whole container. None of it belongs in git (`.gitignore` keeps `data/` out). Deleting `config.json` logs everybody out and makes a new installation code.

## Changing the slot machines

The three machines are in `public/shared/slots.js`: their reels (one letter per symbol), what three of a kind pay, the stakes one can choose, and for Sparegrisen the share of each stake that goes into the jackpot (`share`) and what the jackpot starts at (`seed`). `returnOf(id)` works out exactly what a machine pays back in the long run; `npm test` fails if one of them leaves the span of 95 to 96.5 %, so a change to the reels or the pay table shows at once.

## Changing the bar

The whole card is one list, `DRINKS` in `public/shared/defs.js`: name, price, kind (`beer`, `shot`, `mix`, `soft`), how merry it makes one (`alc`, below zero sobers up) and how it is drawn (`glass`: `pint`, `bottle`, `shot`, `tall`, `wine`, `mug`; `col`, optional `col2`, `foam`, `steam`). Prices for teasing and the shop are in the same file (`PRANKS`, `ITEMS`), the chip rules in `ECON`.

## The shooter

Walk to the arcade cabinet, pick a game type and how many robots, and start; friends join from the same cabinet or from "Spil" in the top bar. The game opens over the clubhouse and needs WebGL, a mouse and a keyboard. Esc frees the mouse and shows the menu: the keys, sound, graphics (four steps; it steps down by itself when the picture stutters), changing sides and the way back to the clubhouse.

The server decides everything that counts (health, kills, pickups, stars, rounds) and runs the robots and the dinos; each browser moves its own player and says where it is twenty times a second. Weapons, game types, times and the robots' names are in `public/shooter/rules.js`; how good the robots are is `SKILL` in `server/arena-bots.js`; the rewards are `ECON.shooter` in `public/shared/defs.js`. The arena itself is `public/shooter/world.js`: after any change there, run `npm test`, which walks every tower staircase up and down and compares the server's arena with the browser's. What one only looks at (leaves, grass, roof tiles, lamps, flags, clouds) is `public/shooter/scenery.js`; the server never loads it, and nothing in it can be walked on or hit.

## How it is built

```
server/server.js      HTTP: pages, /api/health, register, login, invite. WebSocket at /ws.
server/ws.js          the WebSocket protocol (RFC 6455), written out: no packages needed
server/hub.js         the lobby itself: accounts, groups, the room, chat, chips, teasing, bar, tables
server/store.js       JSON files, written a moment after something changes and on shutdown
server/eagleeye.js    EagleEye Commander's matches: the game's own rules, with lobby accounts as generals
server/arena.js       the shooter's matches: who is where, health, kills, pickups, stars, dinos, rounds
server/arena-nav.js   where the shooter's robots can walk (worked out by trying every step in the arena)
server/arena-bots.js  the robots' minds: where to go, whom to aim at, when to shoot
public/shared/        rules both sides use: defs.js (prices, looks, limits), room.js (the room, where
                      one can walk, path finding), games/ (one module per game: rules and robot)
public/js/main.js     screens, menus, and what each message from the server means
public/js/room.js     the room on screen: who is where, walking, bubbles, things flying
public/js/roomart.js  how the room and the furniture look
public/js/avatar.js   how avatars, hats, glasses of beer and thrown tomatoes look
public/js/games/      one module per game for the screen
public/eagleeye/      EagleEye Commander 2.5.0 (its page, rules, graphics, voices), opened in a frame
public/shooter/       the shooter: world.js (the arena and how one walks in it, used by the server too),
                      rules.js (weapons, game types, numbers), game.js (the game in the browser),
                      scenery.js (what one only looks at: leaves, grass, roofs, lamps, flags, clouds),
                      weapons.js (the weapons as models), viewmodel.js (the weapon in one's own hands
                      and how it moves), figure.js (avatars in 3D), and three.js r160 in vendor/
deploy/               installer, service file, Proxmox helper
tools/selftest.mjs    the self test
tools/admin.mjs       what lobby-password runs: list accounts, give somebody a new password
```

All graphics are drawn by code; there are no picture files. The shooter draws with three.js r160 (MIT licence, in `public/shooter/vendor/`). Sounds are made with WebAudio, except the recorded radio voices of EagleEye Commander (`public/eagleeye/audio/voices.mp3`). The fonts are Fredoka, and Lilita One and Barlow Semi Condensed in EagleEye Commander (all SIL Open Font License, see the `fonts` folders); they are served from here, so no page asks another server for anything.

`HANDOFF.md` has the decisions, the message protocol, how to add a game, and what is not built yet.
