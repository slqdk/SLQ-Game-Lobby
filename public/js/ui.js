// Small building blocks for the pages around the clubhouse: elements, little drawings, sheets and toasts.
// Everything a player has typed is put in as text, never as HTML.
import { drawBust } from './avatar.js';

export const $ = sel => document.querySelector(sel);

// h('button', { class: 'btn', onclick: f }, 'Text', child, ...)
export function h(tag, props, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === false || v === null || v === undefined) continue;
    if (k === 'class') e.className = v;
    else if (k === 'style') e.style.cssText = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k in e) e[k] = v;
    else e.setAttribute(k, v);
  }
  for (const kid of kids.flat(3)) if (kid !== null && kid !== undefined && kid !== false) e.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return e;
}

// A small square canvas with a drawing centred in it: draw(c) works in units of about 30 across.
export function icon(size, draw, units = 30) {
  const dpr = Math.min(2, window.devicePixelRatio || 1), cv = document.createElement('canvas');
  cv.width = cv.height = Math.round(size * dpr);
  cv.style.width = cv.style.height = size + 'px';
  const c = cv.getContext('2d');
  c.translate(cv.width / 2, cv.height / 2); c.scale(size * dpr / units, size * dpr / units);
  c.lineJoin = 'round'; c.lineCap = 'round';
  draw(c);
  return cv;
}

export function bust(look, size = 40, st) {
  const cv = document.createElement('canvas');
  drawBust(cv, look, size, st);
  return cv;
}

// ---------- the sheet: one at a time ----------
let onClose = null;
const clean = body => [body].flat(3).filter(x => x !== null && x !== undefined && x !== false);
export const sheet = {
  kind: '',
  open({ title, body, wide = false, kind = '', closed = null }) {
    if (onClose) { const f = onClose; onClose = null; f(); }
    sheet.kind = kind; onClose = closed;
    $('#sheetTitle').textContent = title;
    $('#sheet').classList.toggle('wide', wide);
    $('#sheetBody').replaceChildren(...clean(body));
    $('#sheetWrap').hidden = false;
    $('#sheet').scrollTop = 0;
  },
  // replace what is in the open sheet without the closing/opening around it
  fill(body, title) { if (title) $('#sheetTitle').textContent = title; $('#sheetBody').replaceChildren(...clean(body)); },
  close() {
    if ($('#sheetWrap').hidden) return;
    $('#sheetWrap').hidden = true; sheet.kind = '';
    $('#sheetBody').replaceChildren();
    if (onClose) { const f = onClose; onClose = null; f(); }
  },
  get isOpen() { return !$('#sheetWrap').hidden; },
};
$('#sheetX').addEventListener('click', () => sheet.close());
$('#sheetWrap').addEventListener('pointerdown', e => { if (e.target === $('#sheetWrap')) sheet.close(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && sheet.isOpen) sheet.close(); });

// ---------- toasts ----------
// toast('text', { kind: 'err' | 'good', pic: canvas, actions: [['Ja', f], ['Nej', g]], ms })
export function toast(text, opt = {}) {
  const box = $('#toasts'), el = h('div', { class: 'toast ' + (opt.kind || '') }, opt.pic || null, h('div', { class: 'tx' }, text));
  const gone = () => { if (!el.isConnected) return; el.classList.add('out'); setTimeout(() => el.remove(), 260); };
  for (const [label, f] of opt.actions || []) el.append(h('button', { class: 'btn small' + (f ? '' : ' alt'), onclick: () => { gone(); if (f) f(); } }, label));
  box.append(el);
  while (box.children.length > 4) box.firstChild.remove();
  setTimeout(gone, opt.ms || (opt.actions ? 20000 : 4200));
  return gone;
}
