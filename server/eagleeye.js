// EagleEye Commander inside the lobby. The game's own rules (public/eagleeye/shared) run here as they did on its
// own server; what is different is who may come in: a match belongs to a group, and its generals are lobby
// accounts, so there are no invitation codes or PINs. The game page talks to /eagleeye/api/<op> with a login that
// is valid for one general in one match, handed out by the lobby (hub.js) to the account that general belongs to.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { newGame, addPlayer, act, maybeResolve, view, replayOf, upgrade, GameError } from '../public/eagleeye/shared/engine.js';

export { GameError };
const CODE = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

// changed(meta, game): called whenever a match was saved in a new state (the lobby tells the group, pays out).
export function createEagleEye({ dir, secret, now = () => Math.floor(Date.now() / 1000), changed = () => {} }) {
  fs.mkdirSync(dir, { recursive: true });
  // Every match is one JSON file. `index` holds a few facts about each; `games` the ones in use right now.
  const games = new Map(), usedAt = new Map(), index = new Map();
  const fileOf = code => path.join(dir, code + '.json');
  const validCode = c => /^[A-Z0-9]{6}$/.test(c);
  const meta = g => ({
    code: g.code, name: g.name, phase: g.phase, round: g.round, created: g.created || 0, deadline: g.deadline || 0, host: g.host,
    gid: g.lobby.gid, users: g.lobby.users, paid: !!g.lobby.paid,
    players: g.players.map(p => ({ id: p.id, name: p.name, kind: p.kind, alive: p.alive, ready: p.ready })),
    winner: g.winner ? g.winner.names : null,
  });
  function read(code) {
    const g = upgrade(JSON.parse(fs.readFileSync(fileOf(code), 'utf8')));
    g.code = code; g.savedRev = g.rev;
    if (!g.lobby) g.lobby = { gid: '', users: {} };
    return g;
  }
  function load(code) {
    code = String(code || '').toUpperCase().trim();
    if (!validCode(code) || !index.has(code)) return null;
    usedAt.set(code, Date.now());
    if (games.has(code)) return games.get(code);
    try { const g = read(code); games.set(code, g); return g; } catch { return null; }
  }
  function save(g) {
    const tmp = fileOf(g.code) + '.tmp', { savedRev, ...data } = g;
    fs.writeFileSync(tmp, JSON.stringify(data)); fs.renameSync(tmp, fileOf(g.code));
    g.savedRev = g.rev; index.set(g.code, meta(g)); usedAt.set(g.code, Date.now());
    try { changed(index.get(g.code), g); } catch (e) { console.error('eagleeye:', e); }
  }
  // Deadlines pass and rounds are fought when somebody looks, and once a minute for everybody else.
  function touch(g) { maybeResolve(g, now()); if (g.savedRev !== g.rev) save(g); }
  function newCode() {
    for (;;) { let c = ''; for (const b of crypto.randomBytes(6)) c += CODE[b % CODE.length]; if (!index.has(c) && !fs.existsSync(fileOf(c))) return c; }
  }
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.json') || !validCode(f.slice(0, -5))) continue;
    try { index.set(f.slice(0, -5), meta(read(f.slice(0, -5)))); } catch (e) { console.error('Kan ikke læse', f, e.message); }
  }

  // ---------- the login of one general in one match ----------
  const sign = s => crypto.createHmac('sha256', secret).update('ee:' + s).digest('base64url').slice(0, 32);
  const tokenFor = (code, pid) => { const body = code + '.' + pid; return body + '.' + sign(body); };
  function fromToken(tok) {
    const m = /^([A-Z0-9]{6})\.(\d+)\.([\w-]{32})$/.exec(String(tok || ''));
    if (!m || !crypto.timingSafeEqual(Buffer.from(sign(m[1] + '.' + m[2])), Buffer.from(m[3]))) throw new GameError('Åbn kampen fra kommandobordet i klubhuset.');
    const g = load(m[1]); if (!g) throw new GameError('Kampen findes ikke længere.');
    const p = g.players.find(q => q.id === +m[2]); if (!p) throw new GameError('Du er ikke længere med i den kamp.');
    return [g, p];
  }

  // ---------- what the game page calls ----------
  const closed = () => { throw new GameError('Kampe laves og åbnes fra kommandobordet i klubhuset.'); };
  const api = {
    health: () => ({ ok: true, v: 2, lobby: true }),
    list: () => ({ mine: [], open: [], now: now() }),
    create: closed, join: closed, login: closed,
    state(b) {
      const [g, p] = fromToken(b.token); touch(g);
      return b.rev === g.rev ? { same: true, now: now() } : { view: view(g, p.id, now()) };
    },
    act(b) {
      const [g, p] = fromToken(b.token); touch(g);
      act(g, p.id, b.act || {}, now()); touch(g);
      return { view: view(g, p.id, now()) };
    },
    replay(b) { const [g] = fromToken(b.token); return { snap: replayOf(g) }; },
  };

  // ---------- what the lobby calls ----------
  const fail = msg => { throw new GameError(msg); };
  const mine = (code, gid) => { const m = index.get(String(code || '')); return m && m.gid === gid ? load(m.code) : null; };

  return {
    api,
    // the matches of one group, newest first
    ofGroup: gid => [...index.values()].filter(m => m.gid === gid).sort((a, b) => b.created - a.created),
    get: code => index.get(code) || null,

    // A new match with the account as its first general (and host). Everything else is set on the game's own
    // pre-start page: map, size, money, robots.
    create(gid, uid, userName, title) {
      const g = newGame({ name: String(title || '').replace(/\s+/g, ' ').trim().slice(0, 24) || 'Operation Ørneøje', seed: crypto.randomBytes(4).readUInt32LE(0), now: now(), roundHours: 24, peace: 2, open: false });
      g.code = newCode(); g.lobby = { gid, users: {} };
      const p = addPlayer(g, { name: userName, now: now() });
      g.lobby.users[uid] = p.id;
      index.set(g.code, meta(g)); games.set(g.code, g); save(g);
      return g.code;
    },
    join(gid, code, uid, userName) {
      const g = mine(code, gid) || fail('Kampen findes ikke længere.');
      if (g.lobby.users[uid]) return g.code;
      const p = addPlayer(g, { name: userName, now: now() });
      g.lobby.users[uid] = p.id;
      save(g);
      return g.code;
    },
    // Out of a match that has not started. The host leaving hands the match to the next person, or ends it.
    leave(gid, code, uid) {
      const g = mine(code, gid), pid = g && g.lobby.users[uid];
      if (!pid) return;
      if (g.phase !== 'lobby') fail('Kampen er i gang. Man kan ikke forlade den, kun tabe den.');
      g.players = g.players.filter(p => p.id !== pid); delete g.lobby.users[uid];
      const next = g.players.find(p => p.kind === 'human');
      if (!next) return this.drop(gid, code);
      if (g.host === pid) g.host = next.id;
      g.rev++; save(g);
    },
    // Removes a match (the lobby decides who may).
    drop(gid, code) {
      const m = index.get(String(code || ''));
      if (!m || m.gid !== gid) return false;
      index.delete(m.code); games.delete(m.code); usedAt.delete(m.code);
      try { fs.unlinkSync(fileOf(m.code)); } catch {}
      return true;
    },
    dropGroup(gid) { for (const m of [...index.values()]) if (m.gid === gid) this.drop(gid, m.code); },
    // The login that lets the game page act as this account's general, or '' when the account is not in the match.
    token(gid, code, uid) {
      const m = index.get(String(code || ''));
      return m && m.gid === gid && m.users[uid] ? tokenFor(m.code, m.users[uid]) : '';
    },
    // Marks a finished match as paid out (once), so a restart does not pay again.
    markPaid(code) { const g = load(code); if (g && !g.lobby.paid) { g.lobby.paid = true; const { savedRev, ...data } = g; fs.writeFileSync(fileOf(code), JSON.stringify(data)); index.set(code, meta(g)); } },

    // Once a minute: deadlines also pass when nobody is looking; matches nobody uses leave the memory.
    tick() {
      const t = now();
      for (const m of [...index.values()]) {
        if (m.phase !== 'play' || !m.deadline || t < m.deadline) continue;
        const g = load(m.code); if (g) { try { touch(g); } catch (e) { console.error(m.code, e); } }
      }
      for (const [code, g] of games) {
        const idle = Date.now() - (usedAt.get(code) || 0);
        if (idle > (g.phase === 'over' ? 600e3 : 6 * 3600e3)) { games.delete(code); usedAt.delete(code); }
      }
    },
    _debug: { load, tokenFor },
  };
}
