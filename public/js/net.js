// Talking to the server: a few plain calls over HTTP (log in, make an account, look up an invitation), and one
// WebSocket for everything else. The socket says hello with the login by itself and comes back when it drops.
export async function api(op, body) {
  let r;
  try { r = await fetch('api/' + op, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) }); }
  catch { throw new Error('Kan ikke få fat i serveren. Er du på nettet?'); }
  let j;
  try { j = await r.json(); } catch { throw new Error('Serveren svarede ikke rigtigt (' + r.status + ').'); }
  if (j.error) throw new Error(j.error);
  return j;
}

// onState('open' | 'lost' | 'stopped', failed attempts in a row)
export function createSocket({ getToken, onMessage, onState }) {
  const url = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + location.pathname.replace(/[^/]*$/, '') + 'ws';
  let ws = null, tries = 0, stopped = false, timer = null;
  function open() {
    if (stopped) return;
    clearTimeout(timer);
    let sock;
    try { sock = new WebSocket(url); } catch { return again(); }
    ws = sock;
    sock.onopen = () => { if (ws !== sock) return; tries = 0; sock.send(JSON.stringify({ t: 'hello', token: getToken() })); onState('open', 0); };
    sock.onmessage = e => { if (ws !== sock) return; let m; try { m = JSON.parse(e.data); } catch { return; } if (m && typeof m.t === 'string') onMessage(m); };
    sock.onclose = () => { if (ws === sock) { ws = null; again(); } };
    sock.onerror = () => {};
  }
  function again() {
    if (stopped) return;
    tries++;
    onState('lost', tries);
    timer = setTimeout(open, Math.min(15000, 600 * 2 ** Math.min(tries, 5)) * (0.7 + Math.random() * 0.6));
  }
  // a phone that wakes up, or a network that comes back: do not wait for the timer
  const wake = () => { if (!stopped && !ws && document.visibilityState === 'visible') { clearTimeout(timer); open(); } };
  document.addEventListener('visibilitychange', wake);
  window.addEventListener('online', wake);
  open();
  return {
    send(obj) { if (ws && ws.readyState === 1) { ws.send(JSON.stringify(obj)); return true; } return false; },
    stop() { stopped = true; clearTimeout(timer); document.removeEventListener('visibilitychange', wake); window.removeEventListener('online', wake); if (ws) { const s = ws; ws = null; try { s.close(); } catch {} } onState('stopped', 0); },
    get ready() { return !!ws && ws.readyState === 1; },
  };
}
