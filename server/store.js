// Storage: everything lives in memory and is written to JSON files shortly after it changes.
//   <data>/config.json        the key that signs logins, and the installation code
//   <data>/users.json         the accounts
//   <data>/groups/<id>.json   one file per group: members, chat, tables
// A file that cannot be read stops the server at start: better that than quietly starting over an empty one.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';     // no 0/O or 1/I
export function randomCode(n) {
  let c = '';
  for (const b of crypto.randomBytes(n)) c += CODE_CHARS[b % CODE_CHARS.length];
  return c;
}

export function createStore(dir, { delay = 1500 } = {}) {
  const gdir = path.join(dir, 'groups');
  fs.mkdirSync(gdir, { recursive: true });
  const read = (file, dflt) => {
    let text;
    try { text = fs.readFileSync(file, 'utf8'); } catch (e) { if (e.code === 'ENOENT') return dflt; throw e; }
    try { return JSON.parse(text); } catch (e) { throw new Error('Kan ikke læse ' + file + ': ' + e.message); }
  };
  const write = (file, obj, mode) => {
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(obj), mode ? { mode } : undefined);
    fs.renameSync(tmp, file);
  };

  const cfile = path.join(dir, 'config.json');
  let config = read(cfile, null);
  if (!config || !config.secret || !config.code) {
    config = { secret: crypto.randomBytes(32).toString('hex'), code: randomCode(4) + '-' + randomCode(4), ...(config || {}) };
    write(cfile, config, 0o600);
  }

  const ufile = path.join(dir, 'users.json');
  const udata = read(ufile, { next: 1, list: [] });
  const users = new Map(udata.list.map(u => [u.id, u]));
  let nextUser = udata.next;

  const groups = new Map();
  for (const f of fs.readdirSync(gdir)) {
    if (!/^[A-Z0-9]{6}\.json$/.test(f)) continue;
    const g = read(path.join(gdir, f), null);
    if (g && g.id === f.slice(0, -5)) groups.set(g.id, g);
  }

  const dirty = new Set();       // 'users', or a group id
  let timer = null;
  function flush() {
    if (timer) { clearTimeout(timer); timer = null; }
    for (const k of dirty) {
      try {
        if (k === 'users') write(ufile, { next: nextUser, list: [...users.values()] }, 0o600);
        else if (groups.has(k)) write(path.join(gdir, k + '.json'), groups.get(k));
      } catch (e) { console.error('Kan ikke gemme', k, e.message); continue; }
      dirty.delete(k);
    }
  }
  function touch(k) {
    dirty.add(k);
    if (!timer && delay >= 0) { timer = setTimeout(flush, delay); timer.unref(); }
  }

  return {
    config, users, groups, flush,
    newUserId: () => nextUser++,
    saveUsers: () => touch('users'),
    saveGroup: g => touch(g.id),
    newGroupId() { for (;;) { const id = randomCode(6); if (!groups.has(id)) return id; } },
    dropGroup(id) {
      groups.delete(id); dirty.delete(id);
      try { fs.unlinkSync(path.join(gdir, id + '.json')); } catch {}
    },
  };
}
