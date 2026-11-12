# SLQ Game Lobby

A clubhouse for a group of friends. Each group gets a drawn room where everybody's avatar hangs out: you walk around, chat, tease each other, sit at the bar, and sit down at a table to play. The room shows who is in and who plays what.

In this first version:

- **Groups** with an owner, admins and an invitation link. An account is a name and a password.
- **The clubhouse**: a 2D room seen from the front and a little from above. Click or tap the floor to walk, the furniture to use it, another avatar to tease or challenge. Works with a mouse and on a phone.
- **Avatars** you put together yourself (skin, hair, face, clothes), plus hats, glasses and more from the kiosk.
- **Chips** (jetoner): one wallet per player. 100 for showing up each day, a reward for every finished game against a friend, and the pot when you play for a stake. Spent in the bar, in the kiosk and on teasing.
- **Teasing**: snowball, tomato, water balloon, cream pie, banana peel, tickle feather, whoopee cushion, rain cloud, turning somebody into a hen; and the friendly ones, confetti and a hug. Only looks, and it wears off. "Forstyr ikke" switches it off both ways.
- **The bar**: sit on a stool and buy for yourself, for a friend, or a round for everybody. The glass stays in the avatar's hand, and a few too many show.
- **4 på stribe** against a friend (live, or one move now and the next tomorrow), with or without a stake, or against the house robot in three strengths.
- The furniture for what comes next already stands in the room: Ludo, Yatzy, Meyer, poker, the shooter and EagleEye Commander.

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

## Data and backup

Everything is JSON in the data folder (`/var/lib/slq-game-lobby` when installed):

- `config.json`: the key that signs logins, and the installation code
- `users.json`: accounts (names, salted password hashes, chips, looks, counters)
- `groups/<id>.json`: one file per group with members, the last 200 chat lines and the tables

Back up by copying the folder, or the whole container. None of it belongs in git (`.gitignore` keeps `data/` out). Deleting `config.json` logs everybody out and makes a new installation code.

## Changing the bar

The whole card is one list, `DRINKS` in `public/shared/defs.js`: name, price, kind (`beer`, `shot`, `mix`, `soft`), how merry it makes one (`alc`, below zero sobers up) and how it is drawn (`glass`: `pint`, `bottle`, `shot`, `tall`, `wine`, `mug`; `col`, optional `col2`, `foam`, `steam`). Prices for teasing and the shop are in the same file (`PRANKS`, `ITEMS`), the chip rules in `ECON`.

## How it is built

```
server/server.js      HTTP: pages, /api/health, register, login, invite. WebSocket at /ws.
server/ws.js          the WebSocket protocol (RFC 6455), written out: no packages needed
server/hub.js         the lobby itself: accounts, groups, the room, chat, chips, teasing, bar, tables
server/store.js       JSON files, written a moment after something changes and on shutdown
public/shared/        rules both sides use: defs.js (prices, looks, limits), room.js (the room, where
                      one can walk, path finding), games/ (one module per game: rules and robot)
public/js/main.js     screens, menus, and what each message from the server means
public/js/room.js     the room on screen: who is where, walking, bubbles, things flying
public/js/roomart.js  how the room and the furniture look
public/js/avatar.js   how avatars, hats, glasses of beer and thrown tomatoes look
public/js/games/      one module per game for the screen
deploy/               installer, service file, Proxmox helper
tools/selftest.mjs    the self test
tools/admin.mjs       what lobby-password runs: list accounts, give somebody a new password
```

All graphics are drawn by code; there are no picture files. Sounds are made with WebAudio. The font is Fredoka (SIL Open Font License, see `public/fonts/Fredoka-OFL.txt`).

`HANDOFF.md` has the decisions, the message protocol, how to add a game, and what is not built yet.
