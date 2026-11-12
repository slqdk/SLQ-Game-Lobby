// SLQ Game Lobby — service worker. Its only job is notifications: it shows what the server pushes, and opens the
// clubhouse at the right table when one is tapped. It caches nothing, so every page still comes from the server.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = {}; }
  const text = (x, max) => typeof x === 'string' ? x.slice(0, max) : '';
  e.waitUntil(self.registration.showNotification(text(d.t, 80) || 'SLQ Game Lobby', {
    body: text(d.b, 200), tag: text(d.tag, 60) || 'slq', renotify: true, lang: 'da',
    icon: 'icons/icon-192.png', badge: 'icons/badge-96.png', data: { u: text(d.u, 200) },
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const scope = self.registration.scope, target = new URL((e.notification.data && e.notification.data.u) || './', scope);
  if (!target.href.startsWith(scope)) return;                       // only the clubhouse's own pages
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const open = all.find(c => c.url.startsWith(scope) && !c.url.slice(scope.length).includes('/'));       // the clubhouse itself, not a game page under it
    if (!open) return self.clients.openWindow(target.href);
    open.postMessage({ slq: 'open', q: target.search });
    return open.focus();
  })());
});
