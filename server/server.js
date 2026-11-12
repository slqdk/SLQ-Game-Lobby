// SLQ Game Lobby — server. No dependencies: plain Node (20+), data stored as JSON files.
//   PORT=8080 DATA_DIR=/var/lib/slq-game-lobby node server/server.js
//   HOST=127.0.0.1 limits it to one network interface (default: all).
//   TRUSTED_PROXY=203.0.113.7 names a reverse proxy that is not on the server's own network (see clientIp below).
// Pages and three small calls (/api/health, register, login, invite) go over HTTP; everything else over the
// WebSocket at /ws. Behind Nginx Proxy Manager the proxy host needs "Websockets Support" switched on.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import net from 'node:net';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createStore } from './store.js';
import { createHub, LobbyError } from './hub.js';
import { upgrade } from './ws.js';
import { createEagleEye, GameError as EagleEyeError } from './eagleeye.js';
import { createArena } from './arena.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, '..', 'public');
const DATA = process.env.DATA_DIR || path.join(ROOT, '..', 'data');
const PORT = +process.env.PORT || 8080, HOST = process.env.HOST || undefined;
const VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, '..', 'package.json'), 'utf8')).version;

const store = createStore(DATA);
// EagleEye Commander keeps its matches in a folder of its own and tells the lobby when one changes.
let eeChanged = () => {};
const ee = createEagleEye({ dir: path.join(DATA, 'eagleeye'), secret: store.config.secret, changed: (m, g) => eeChanged(m, g) });
// the shooter's matches: the lobby hears when one changes, when a round ends and when somebody is out of one
let arHooks = null;
const arena = createArena({ changed: (...a) => arHooks.arChanged(...a), ended: r => arHooks.arEnded(r), left: (...a) => arHooks.arLeft(...a) });
const hub = createHub({ store, ee, arena, version: VERSION });
eeChanged = hub.eeChanged; arHooks = hub;

// ---------- HTTP ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.ico': 'image/x-icon', '.mp3': 'audio/mpeg',
  '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8' };

// Static files are revalidated on every load (ETag), so an update reaches everyone at once, and text is sent gzipped.
const TEXT = new Set(['.html', '.js', '.css', '.svg', '.json', '.webmanifest']);
const packed = new Map();   // file -> { tag, raw, gz }
// The path of a request, without the query. (Not `new URL`: it throws on a path such as "//".)
const pathOf = req => { const u = String(req.url || '/'), q = u.indexOf('?'); return q < 0 ? u : u.slice(0, q); };
function serveStatic(req, res) {
  let p;
  try { p = decodeURIComponent(pathOf(req)); } catch { res.writeHead(400).end(); return; }
  if (p.includes('\0')) { res.writeHead(400).end(); return; }
  if (p.endsWith('/')) p += 'index.html';
  const file = path.normalize(path.join(PUBLIC, p));
  if (!file.startsWith(PUBLIC + path.sep)) { res.writeHead(403).end(); return; }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain' }).end('404'); return; }
    const ext = path.extname(file), tag = `"${st.size.toString(36)}-${Math.floor(st.mtimeMs).toString(36)}"`;
    const head = { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': ext === '.woff2' || ext === '.mp3' ? 'public, max-age=2592000' : 'no-cache', ETag: tag, Vary: 'Accept-Encoding',
      'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' };     // no-referrer: an invitation code in the address stays here
    // The pages only load their own files and talk to their own server. The lobby may not be put in a frame; the
    // game pages under it (EagleEye Commander) only in the lobby's own, and they write styles into their markup.
    if (ext === '.html') head['Content-Security-Policy'] = file.startsWith(path.join(PUBLIC, 'eagleeye') + path.sep)
      ? "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; frame-ancestors 'self'; base-uri 'none'; form-action 'self'"
      : "default-src 'self'; connect-src 'self' ws: wss:; img-src 'self' data: blob:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";
    if (req.headers['if-none-match'] === tag) { res.writeHead(304, head).end(); return; }
    let c = packed.get(file);
    if (!c || c.tag !== tag) {
      let raw; try { raw = fs.readFileSync(file); } catch { res.writeHead(404, { 'Content-Type': 'text/plain' }).end('404'); return; }
      c = { tag, raw, gz: TEXT.has(ext) && raw.length > 1024 ? zlib.gzipSync(raw, { level: 9 }) : null };
      packed.set(file, c);
    }
    const gz = c.gz && /\bgzip\b/.test(String(req.headers['accept-encoding'] || ''));
    if (gz) head['Content-Encoding'] = 'gzip';
    res.writeHead(200, head).end(req.method === 'HEAD' ? undefined : gz ? c.gz : c.raw);
  });
}

// Who is calling (for the login throttle). A forwarded address is believed only when the caller is a proxy close by:
// on this machine, on one of its own networks, on a private network, or listed in TRUSTED_PROXY (addresses or
// networks, comma separated). Even then only the address that proxy added itself (the last one) counts; the rest of
// the header can be made up by anyone.
let near = null, nearAt = 0;
function nearList() {
  if (near && Date.now() - nearAt < 60000) return near;
  const l = new net.BlockList();
  for (const [a, bits] of [['127.0.0.0', 8], ['10.0.0.0', 8], ['172.16.0.0', 12], ['192.168.0.0', 16], ['169.254.0.0', 16]]) l.addSubnet(a, bits, 'ipv4');
  l.addAddress('::1', 'ipv6'); l.addSubnet('fc00::', 7, 'ipv6'); l.addSubnet('fe80::', 10, 'ipv6');
  for (const list of Object.values(os.networkInterfaces())) for (const i of list || []) {
    const bits = +String(i.cidr || '').split('/')[1];
    if (Number.isInteger(bits)) try { l.addSubnet(i.address, bits, net.isIPv6(i.address) ? 'ipv6' : 'ipv4'); } catch {}
  }
  for (const t of String(process.env.TRUSTED_PROXY || '').split(',').map(x => x.trim()).filter(Boolean)) {
    const [a, bits] = t.split('/'), fam = net.isIPv6(a) ? 'ipv6' : 'ipv4';
    try { if (bits === undefined) l.addAddress(a, fam); else l.addSubnet(a, +bits, fam); } catch { console.error('TRUSTED_PROXY: kan ikke læse "' + t + '"'); }
  }
  near = l; nearAt = Date.now();
  return l;
}
function clientIp(req) {
  let peer = req.socket.remoteAddress || '';
  if (peer.startsWith('::ffff:') && net.isIPv4(peer.slice(7))) peer = peer.slice(7);
  const fwd = String(req.headers['x-forwarded-for'] || '').split(',').map(x => x.trim()).filter(Boolean);
  if (!fwd.length || !net.isIP(peer) || !nearList().check(peer, net.isIPv6(peer) ? 'ipv6' : 'ipv4')) return peer;
  return fwd[fwd.length - 1];
}

// No request may stop the server: whatever goes wrong while answering one is logged and answered with an error.
const server = http.createServer((req, res) => {
  try { handle(req, res); } catch (e) { console.error(e); try { res.writeHead(500).end(); } catch {} }
});
function handle(req, res) {
  const m = /^(\/eagleeye)?\/api\/(\w+)$/.exec(pathOf(req));
  if (!m) return serveStatic(req, res);
  const calls = m[1] ? ee.api : hub.api, op = Object.hasOwn(calls, m[2]) ? calls[m[2]] : null, ip = clientIp(req);
  const send = (code, obj) => res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify(obj));
  if (!op) return send(404, { error: 'Ukendt kald.' });
  let body = '';
  req.on('data', c => { body += c; if (body.length > (m[1] ? 300000 : 20000)) req.destroy(); });
  req.on('end', () => {
    let b;
    try { b = body ? JSON.parse(body) : {}; } catch { return send(400, { error: 'Ugyldigt kald.' }); }
    if (!b || typeof b !== 'object') return send(400, { error: 'Ugyldigt kald.' });
    try { send(200, op(b, ip)); }
    catch (e) {
      if (e instanceof LobbyError || e instanceof EagleEyeError) send(400, { error: e.message });
      else { console.error(e); send(500, { error: 'Serverfejl.' }); }
    }
  });
}

// ---------- WebSocket ----------
const peers = new Set(), perIp = new Map();
const MAX_PEERS = 2000, MAX_PER_IP = 30;
server.on('upgrade', (req, socket, head) => {
  socket.on('error', () => {});
  const ip = clientIp(req);
  if (pathOf(req) !== '/ws' || peers.size >= MAX_PEERS || (perIp.get(ip) || 0) >= MAX_PER_IP) {
    socket.end('HTTP/1.1 ' + (pathOf(req) !== '/ws' ? '404 Not Found' : '503 Service Unavailable') + '\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
    return;
  }
  const peer = upgrade(req, socket, head);
  if (!peer) return;
  const conn = hub.connect(text => peer.send(text), () => peer.close(), ip);
  peers.add(peer); perIp.set(ip, (perIp.get(ip) || 0) + 1);
  peer.conn = conn; peer.since = Date.now();
  peer.onmessage = (data, binary) => { if (!binary) try { hub.message(conn, data); } catch (e) { console.error(e); } };
  peer.onclose = () => {
    peers.delete(peer);
    const n = (perIp.get(ip) || 1) - 1; if (n > 0) perIp.set(ip, n); else perIp.delete(ip);
    try { hub.disconnect(conn); } catch (e) { console.error(e); }
  };
});

// Every 25 seconds: a ping to everybody (it also keeps a proxy from closing a quiet connection), and connections
// that have gone silent, or never said who they are, are dropped.
setInterval(() => {
  const t = Date.now();
  for (const p of peers) {
    if (t - p.alive > 70000 || (!p.conn.user && t - p.since > 20000)) p.socket.destroy(); else p.ping();
  }
}, 25000).unref();
setInterval(() => { try { hub.tidy(); ee.tick(); } catch (e) { console.error(e); } }, 60000).unref();

// What has changed is written within a couple of seconds; on the way out, at once.
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { try { store.flush(); } finally { process.exit(0); } });
process.on('exit', () => { try { store.flush(); } catch {} });

server.listen(PORT, HOST, () => console.log(`SLQ Game Lobby ${VERSION} lytter på http://${HOST || 'localhost'}:${PORT}  (data: ${DATA})`));
