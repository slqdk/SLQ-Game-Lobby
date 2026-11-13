// SLQ Game Lobby — how fast the mouse turns one's view: in the shooter (looking round, and aiming through the
// scope) and in the clubhouse in 3D. Søren: "I spillet skal man ha mulighed for at stille musehastighed. Både når man
// kigger rundt, og når man sigter."
//
// A setting of this browser (another computer has another mouse), kept in localStorage. 1 is the speed from before
// the setting existed. `aim` is on top of `look`: through the scope one turns `aim` times as fast as one would
// anyway with the scope (which already turns slower, by how much it magnifies).

export const MOUSE = { min: 0.2, max: 3, step: 0.05 };
const KEY = 'slq-mouse';
const fit = v => { const n = Math.round(Math.min(MOUSE.max, Math.max(MOUSE.min, v)) / MOUSE.step) * MOUSE.step; return Math.round(n * 100) / 100; };
const good = v => (typeof v === 'number' || typeof v === 'string') && Number.isFinite(+v) && +v > 0 ? fit(+v) : 1;

export function readMouse() {
  let o = null;
  try { o = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { o = null; }
  if (!o || typeof o !== 'object') o = {};
  return { look: good(o.look ?? 1), aim: good(o.aim ?? 1) };
}
// the setting as it is now; whoever turns a view reads it here (it changes in place when the setting is changed)
export const mouse = readMouse();
export function setMouse(kind, v) {
  if (kind !== 'look' && kind !== 'aim') return mouse;
  mouse[kind] = good(v);
  try { localStorage.setItem(KEY, JSON.stringify({ look: mouse.look, aim: mouse.aim })); } catch { /* no storage: it lasts until the page is closed */ }
  return mouse;
}
export const shown = v => v.toFixed(2).replace('.', ',') + '×';

// A slider for one of the two: a label, the slider and the value. cls: the class of the whole (each page styles its
// own). The change counts at once.
export function mouseSlider(kind, label, cls) {
  const wrap = document.createElement('label'); wrap.className = cls;
  const name = document.createElement('span'); name.textContent = label;
  const val = document.createElement('b'); val.textContent = shown(mouse[kind]);
  const input = document.createElement('input');
  Object.assign(input, { type: 'range', min: String(MOUSE.min), max: String(MOUSE.max), step: String(MOUSE.step), value: String(mouse[kind]) });
  input.addEventListener('input', () => { setMouse(kind, input.value); val.textContent = shown(mouse[kind]); });
  for (const ev of ['click', 'pointerdown', 'mousedown']) input.addEventListener(ev, e => e.stopPropagation());       // (a press on the slider is not a press on the menu behind it)
  wrap.append(name, input, val);
  return wrap;
}
