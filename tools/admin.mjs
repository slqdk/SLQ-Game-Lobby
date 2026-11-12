// SLQ Game Lobby — small jobs for the one who runs the server. It talks to the running lobby on this machine and
// proves who it is with the secret in the data folder, so it must be run as root or as the service's user.
//   node tools/admin.mjs users            who has an account
//   node tools/admin.mjs pass <navn>      a new password for somebody who forgot theirs
// DATA_DIR and PORT say where the lobby keeps its data and listens (the installer's commands fill them in).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const [op, ...rest] = process.argv.slice(2);
const dir = process.env.DATA_DIR || 'data', port = process.env.PORT || 8080;
if (op !== 'users' && op !== 'pass') { console.error('Brug: admin.mjs users | pass <navn>'); process.exit(2); }
let secret;
try { secret = JSON.parse(fs.readFileSync(path.join(dir, 'config.json'), 'utf8')).secret; }
catch (e) { console.error('Kan ikke læse ' + path.join(dir, 'config.json') + ' (' + e.code + '). Kør som root.'); process.exit(1); }
const d = new Date(), day = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const key = crypto.createHmac('sha256', secret).update('admin:' + day).digest('base64url').slice(0, 32);

let r;
try { r = await (await fetch('http://127.0.0.1:' + port + '/api/admin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key, op, name: rest.join(' ') }) })).json(); }
catch { console.error('Lobbyen svarer ikke på port ' + port + '. Kører tjenesten?'); process.exit(1); }
if (r.error) { console.error(r.error); process.exit(1); }
if (op === 'users') {
  const when = t => new Date(t).toLocaleString('da-DK', { dateStyle: 'short', timeStyle: 'short' });
  for (const u of r.users.sort((a, b) => a.name.localeCompare(b.name, 'da'))) console.log(u.name.padEnd(22) + String(u.chips).padStart(6) + ' jetoner   sidst set ' + when(u.seen) + '   ' + (u.groups.join(', ') || '(ingen gruppe)'));
} else {
  console.log('Nyt kodeord til ' + r.name + ':  ' + r.pass);
  console.log('Giv det videre, og bed om, at det bliver skiftet i menuen (☰ → Skift kodeord).');
}
