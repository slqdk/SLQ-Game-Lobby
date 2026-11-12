// Web Push without dependencies: the keys that identify this server to the push services (VAPID, RFC 8292), the
// encryption of a message for one browser (RFC 8291, content coding "aes128gcm"), and the request that hands it
// to that browser's push service. The lobby (hub.js) decides when a message is sent and to whom.
//   PUSH_CONTACT=mailto:somebody@example.com   whom a push service may write to about this server (optional;
//                                              without it the lobby's own address is given)
//   PUSH_HOSTS=push.example.com                more push services than the ones the big browsers use (optional)
import crypto from 'node:crypto';
import https from 'node:https';

const b64 = x => Buffer.from(x).toString('base64url');
const unb64 = s => Buffer.from(String(s), 'base64url');
const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();

// The push services of Chrome and everything built on it (Edge, Brave, Samsung), Firefox, Edge's older service and
// Safari. A subscription that points anywhere else is refused: otherwise an account could make the server send
// requests to an address of its own choosing.
const HOSTS = ['fcm.googleapis.com', 'android.googleapis.com', '.push.services.mozilla.com', '.notify.windows.com', '.push.apple.com'];

// The body of a push message: `plain` encrypted for the browser whose keys are p256dh and auth (both base64url,
// as the browser gives them). asPrivate and salt are only given by the self test, to repeat the RFC's example.
export function encrypt(plain, p256dh, auth, { asPrivate = null, salt = null } = {}) {
  const ua = unb64(p256dh), ecdh = crypto.createECDH('prime256v1');
  if (asPrivate) ecdh.setPrivateKey(unb64(asPrivate)); else ecdh.generateKeys();
  const as = ecdh.getPublicKey();                                             // 65 bytes: this message's own key
  const ikm = hmac(hmac(unb64(auth), ecdh.computeSecret(ua)), Buffer.concat([Buffer.from('WebPush: info\0'), ua, as, Buffer.from([1])]));
  const s = salt ? unb64(salt) : crypto.randomBytes(16), prk = hmac(s, ikm);
  const cek = hmac(prk, Buffer.from('Content-Encoding: aes128gcm\0\x01')).subarray(0, 16);
  const nonce = hmac(prk, Buffer.from('Content-Encoding: nonce\0\x01')).subarray(0, 12);
  const c = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const sealed = Buffer.concat([c.update(Buffer.concat([Buffer.from(plain), Buffer.from([2])])), c.final(), c.getAuthTag()]);      // 2: the last record
  const head = Buffer.alloc(21);
  s.copy(head, 0); head.writeUInt32BE(4096, 16); head[20] = as.length;
  return Buffer.concat([head, as, sealed]);
}

function httpsPost(url, headers, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method: 'POST', headers, timeout: 10000 }, res => { res.resume(); res.on('end', () => resolve({ status: res.statusCode })); res.on('error', reject); });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    req.end(body);
  });
}

// config: the store's config (the keys are kept there as config.vapid); save(): writes it.
export function createPush({ config, save, contact = '', hosts = [], now = () => Date.now(), post = httpsPost }) {
  if (!config.vapid || !config.vapid.d) {
    const jwk = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).privateKey.export({ format: 'jwk' });
    config.vapid = { x: jwk.x, y: jwk.y, d: jwk.d };
    save();
  }
  const v = config.vapid, list = HOSTS.concat(hosts.map(h => String(h).trim().toLowerCase()).filter(Boolean));
  const privateKey = crypto.createPrivateKey({ key: { kty: 'EC', crv: 'P-256', x: v.x, y: v.y, d: v.d }, format: 'jwk' });
  const key = b64(Buffer.concat([Buffer.from([4]), unb64(v.x), unb64(v.y)]));       // what a browser subscribes with
  const tokens = new Map();                                                         // push service + contact -> { auth, exp }

  function allowed(endpoint) {
    let u;
    try { u = new URL(String(endpoint)); } catch { return false; }
    if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443')) return false;
    const h = u.hostname.toLowerCase();
    return list.some(x => x[0] === '.' ? h.endsWith(x) : h === x);
  }
  // Who is sending: a token signed with the server's key, good for twelve hours and for one push service.
  function vapid(endpoint, origin = '') {
    const aud = new URL(endpoint).origin, sub = contact || origin || aud, id = aud + ' ' + sub, t0 = Math.floor(now() / 1000);
    let tk = tokens.get(id);
    if (!tk || tk.exp - t0 < 3600) {
      const exp = t0 + 12 * 3600, text = b64(JSON.stringify({ typ: 'JWT', alg: 'ES256' })) + '.' + b64(JSON.stringify({ aud, exp, sub }));
      tk = { exp, auth: 'vapid t=' + text + '.' + b64(crypto.sign('sha256', Buffer.from(text), { key: privateKey, dsaEncoding: 'ieee-p1363' })) + ', k=' + key };
      tokens.set(id, tk);
      if (tokens.size > 200) tokens.delete(tokens.keys().next().value);
    }
    return tk.auth;
  }
  // sub: { e: endpoint, p: p256dh, a: auth, o: the lobby's address as that browser sees it }. Resolves to the push
  // service's answer: 201 is fine, 404 and 410 mean that the subscription is gone, -1 that nothing came back.
  async function send(sub, payload, { ttl = 86400, urgent = false, topic = '' } = {}) {
    if (!allowed(sub.e)) return 0;
    try {
      const body = encrypt(Buffer.from(JSON.stringify(payload)), sub.p, sub.a);
      const headers = { 'Content-Type': 'application/octet-stream', 'Content-Encoding': 'aes128gcm', 'Content-Length': body.length, TTL: String(ttl), Urgency: urgent ? 'high' : 'normal', Authorization: vapid(sub.e, sub.o) };
      if (topic) headers.Topic = b64(crypto.createHash('sha256').update(topic).digest()).slice(0, 24);        // a newer message of the same kind replaces one that still waits
      return (await post(sub.e, headers, body)).status;
    } catch { return -1; }
  }
  return { key, allowed, vapid, send };
}
