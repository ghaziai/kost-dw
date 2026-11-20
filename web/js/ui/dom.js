// Pembuat elemen DOM kecil. Semua teks disisipkan lewat text node (bukan innerHTML) -> aman dari XSS.
const SVG_NS = 'http://www.w3.org/2000/svg';

function applyAttrs(el, attrs) {
  for (const [k, val] of Object.entries(attrs ?? {})) {
    if (val === undefined || val === null || val === false) continue;
    if (k === 'class') el.setAttribute('class', val);
    else if (k.startsWith('on') && typeof val === 'function') el.addEventListener(k.slice(2).toLowerCase(), val);
    else if (k === 'value') el.value = val;
    else if (k === 'dataset') Object.assign(el.dataset, val);
    else el.setAttribute(k, val === true ? '' : String(val));
  }
}

function appendAll(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === undefined || c === null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  applyAttrs(el, attrs);
  appendAll(el, children);
  return el;
}

export function s(tag, attrs, ...children) {
  const el = document.createElementNS(SVG_NS, tag);
  applyAttrs(el, attrs);
  appendAll(el, children);
  return el;
}

export const qs = (sel, root = document) => root.querySelector(sel);
