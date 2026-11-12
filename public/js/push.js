// Notifications on this device. The service worker (sw.js) shows what the server pushes; this module asks for the
// permission, subscribes the browser with the server's key, and tells the server which browser to send to.
const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = () => (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
const bytes = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - s.length % 4) % 4)), c => c.charCodeAt(0));
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
const wanted = () => { try { return localStorage.getItem('slq-push') === '1'; } catch { return false; } };
const want = v => { try { if (v) localStorage.setItem('slq-push', '1'); else localStorage.removeItem('slq-push'); } catch {} };
let reg = null, endpoint = '';

// Once, when the page starts. onOpen(search) is called when a notification is tapped while the clubhouse is open.
export function pushStart(onOpen) {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  navigator.serviceWorker.register('sw.js').then(r => { reg = r; }, () => {});
  navigator.serviceWorker.addEventListener('message', e => { if (e.data && e.data.slq === 'open') onOpen(String(e.data.q || '')); });
}

// Where this device stands: 'on', 'off', 'denied' (blocked in the browser), 'home' (an iPhone or iPad where the
// clubhouse must be put on the home screen first), 'https' (the page is not served securely), 'none' (the browser
// cannot), or '' when the server does not send notifications at all.
export async function pushState(key) {
  if (!key) return '';
  if (!window.isSecureContext) return 'https';
  if (!supported()) return isIOS() && !standalone() ? 'home' : 'none';
  if (Notification.permission === 'denied') return 'denied';
  try {
    const r = reg || await navigator.serviceWorker.getRegistration(), sub = r ? await r.pushManager.getSubscription() : null;
    return sub && wanted() && Notification.permission === 'granted' ? 'on' : 'off';
  } catch { return 'off'; }
}

async function subscription(key, make) {
  const r = reg || (reg = await navigator.serviceWorker.ready), k = bytes(key);
  let sub = await r.pushManager.getSubscription();
  if (sub && sub.options && sub.options.applicationServerKey && !same(new Uint8Array(sub.options.applicationServerKey), k)) { await sub.unsubscribe(); sub = null; }      // made for another server's key
  if (!sub && make) sub = await r.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: k });
  return sub;
}
const tell = (send, sub) => { endpoint = sub.endpoint; send({ t: 'psub', sub: sub.toJSON(), origin: location.origin }); };

// Switch notifications on for this device. Call it from a tap. Throws an Error whose text can be shown.
export async function pushOn(key, send) {
  if (!supported()) throw new Error('Denne browser kan ikke vise beskeder.');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error(perm === 'denied' ? 'Beskeder er blokeret for denne side. Tillad dem i browserens indstillinger.' : 'Du skal sige ja til beskeder, før de kan slås til.');
  let sub;
  try { sub = await subscription(key, true); } catch (e) { throw new Error('Browseren kunne ikke melde sig til beskeder' + (e && e.message ? ' (' + e.message + ')' : '') + '.'); }
  want(true);
  tell(send, sub);
}
// Switch them off (also when logging out: the next account on this browser must not get this one's messages).
export async function pushOff(send) {
  want(false);
  if (endpoint) { send({ t: 'punsub', endpoint }); endpoint = ''; }
  try {
    const r = reg || await navigator.serviceWorker.getRegistration(), sub = r ? await r.pushManager.getSubscription() : null;
    if (sub) { send({ t: 'punsub', endpoint: sub.endpoint }); await sub.unsubscribe(); }
  } catch {}
}
// After logging in: tell the server about this device again. It may have forgotten it, or the browser may have got
// a new address from its push service.
export async function pushSync(key, send) {
  if (!key || !supported() || !window.isSecureContext || !wanted() || Notification.permission !== 'granted') return;
  try { const sub = await subscription(key, true); if (sub) tell(send, sub); } catch {}
}
