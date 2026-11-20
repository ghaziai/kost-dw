// Komponen UI generik yang dipakai semua halaman.
import { h } from './dom.js';
import { TONE } from './format.js';

// ------------------------------------------------------------------ toast
export function toast(message, tone = 'ok') {
  let box = document.getElementById('toasts');
  if (!box) { box = h('div', { id: 'toasts', 'aria-live': 'polite' }); document.body.append(box); }
  const el = h('div', { class: `toast toast-${tone}`, role: 'status' }, message);
  box.append(el);
  setTimeout(() => el.remove(), 4000);
}

// ------------------------------------------------------------------ badge & header
export const badge = (text, tone = 'muted') => h('span', { class: `badge badge-${tone}` }, text);
export const statusBadge = (status, labels) => badge(labels[status] ?? status, TONE[status] ?? 'muted');

export function pageHeader(title, subtitle, ...actions) {
  return h('div', { class: 'page-head' },
    h('div', null, h('h1', null, title), subtitle ? h('p', { class: 'muted' }, subtitle) : null),
    actions.length ? h('div', { class: 'actions' }, actions) : null);
}

export const empty = (text) => h('div', { class: 'empty' }, text);
export const errorBox = (text) => h('div', { class: 'alert alert-bad', role: 'alert' }, text);

// ------------------------------------------------------------------ tabel
/**
 * columns: [{ key, label, render?(row) -> Node|string, align?: 'right', cls? }]
 * Pada layar sempit tabel digulir horizontal di dalam pembungkusnya (bukan halaman).
 */
export function table(columns, rows, { emptyText = 'Belum ada data' } = {}) {
  if (!rows.length) return empty(emptyText);
  const head = h('tr', null, columns.map((c) => h('th', { class: c.align === 'right' ? 'num' : '' }, c.label)));
  const body = rows.map((row) =>
    h('tr', null, columns.map((c) =>
      h('td', { class: [c.align === 'right' ? 'num' : '', c.cls ?? ''].join(' ').trim(), 'data-label': c.label },
        c.render ? c.render(row) : (row[c.key] ?? '–')))));
  return h('div', { class: 'table-wrap' }, h('table', null, h('thead', null, head), h('tbody', null, body)));
}

// ------------------------------------------------------------------ form
/**
 * field({ label, name, type, value, options, required, hint, ...atribut })
 * type: text|number|email|password|date|month|select|textarea
 */
export function field({ label, name, type = 'text', value = '', options, required = false, hint, full = false, ...attrs }) {
  const id = `f-${name}-${Math.random().toString(36).slice(2, 7)}`;
  let input;
  if (type === 'select') {
    input = h('select', { id, name, required }, options.map((o) =>
      h('option', { value: o.value, selected: String(o.value) === String(value) }, o.label)));
  } else if (type === 'textarea') {
    input = h('textarea', { id, name, required, rows: 3, ...attrs }, value);
  } else {
    input = h('input', { id, name, type, value, required, ...attrs });
  }
  return h('div', { class: full ? 'field full' : 'field' },
    h('label', { for: id }, label, required ? h('span', { class: 'req', 'aria-hidden': 'true' }, ' *') : null),
    input,
    hint ? h('small', { class: 'muted' }, hint) : null);
}

export function readForm(form) {
  const out = {};
  for (const [k, val] of new FormData(form).entries()) out[k] = typeof val === 'string' ? val.trim() : val;
  return out;
}

// ------------------------------------------------------------------ modal (elemen <dialog>)
export function modal({ title, body, actions = [], wide = false }) {
  const dlg = h('dialog', { class: `modal${wide ? ' modal-wide' : ''}`, 'aria-labelledby': 'modal-title' },
    h('div', { class: 'modal-head' },
      h('h2', { id: 'modal-title' }, title),
      h('button', { type: 'button', class: 'btn-icon', 'aria-label': 'Tutup', onclick: () => dlg.close() }, '×')),
    h('div', { class: 'modal-body' }, body),
    actions.length ? h('div', { class: 'modal-foot' }, actions) : null);
  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal();
  return dlg;
}

/**
 * Modal berisi formulir. onSubmit(values) boleh async; error ditampilkan di dalam modal
 * dan modal tetap terbuka agar pengguna dapat memperbaiki isiannya.
 */
export function formModal({ title, fields, submitLabel = 'Simpan', onSubmit, intro, wide }) {
  const err = h('div', { class: 'alert alert-bad', role: 'alert', hidden: true });
  const submit = h('button', { type: 'submit', class: 'btn btn-primary' }, submitLabel);
  const form = h('form', { novalidate: false },
    intro ? h('p', { class: 'muted' }, intro) : null,
    err, h('div', { class: 'form-grid' }, fields),
    h('div', { class: 'modal-foot' },
      h('button', { type: 'button', class: 'btn', onclick: () => dlg.close() }, 'Batal'), submit));
  const dlg = modal({ title, body: form, wide });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.hidden = true;
    submit.disabled = true;
    try {
      await onSubmit(readForm(form));
      dlg.close();
    } catch (ex) {
      err.textContent = ex.message;
      err.hidden = false;
    } finally {
      submit.disabled = false;
    }
  });
  return dlg;
}

export function confirmDialog({ title, message, confirmLabel = 'Ya, lanjutkan', danger = false, onConfirm }) {
  const err = h('div', { class: 'alert alert-bad', role: 'alert', hidden: true });
  const ok = h('button', { type: 'button', class: `btn ${danger ? 'btn-danger' : 'btn-primary'}` }, confirmLabel);
  const dlg = modal({
    title,
    body: h('div', null, err, h('p', null, message)),
    actions: [h('button', { type: 'button', class: 'btn', onclick: () => dlg.close() }, 'Batal'), ok],
  });
  ok.addEventListener('click', async () => {
    ok.disabled = true;
    try { await onConfirm(); dlg.close(); } catch (ex) { err.textContent = ex.message; err.hidden = false; } finally { ok.disabled = false; }
  });
}

/** Jalankan aksi async dengan tombol dinonaktifkan + toast hasilnya. */
export async function withToast(promiseFn, okMessage) {
  try {
    const result = await promiseFn();
    if (okMessage) toast(okMessage);
    return result;
  } catch (ex) {
    toast(ex.message, 'bad');
    throw ex;
  }
}
