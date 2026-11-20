import { h } from '../ui/dom.js';
import { field, readForm } from '../ui/components.js';
import { api } from '../api.js';
import { store } from '../store.js';
import { go, landing } from '../router.js';
import { authLayout } from '../ui/auth-layout.js';

export default function loginPage() {
  const err = h('div', { class: 'alert alert-bad', role: 'alert', hidden: true });
  const btn = h('button', { class: 'btn btn-primary', type: 'submit' }, 'Masuk');
  const form = h('form', null, err,
    field({ label: 'Email', name: 'email', type: 'email', required: true, autocomplete: 'username' }),
    field({ label: 'Password', name: 'password', type: 'password', required: true, autocomplete: 'current-password' }),
    btn);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.hidden = true; btn.disabled = true;
    try {
      const session = await api.post('/api/auth/login', readForm(form));
      store.save(session);
      go(await landing(session.user));
    } catch (ex) { err.textContent = ex.message; err.hidden = false; } finally { btn.disabled = false; }
  });
  return authLayout(h('div', { class: 'card' },
    h('h1', null, 'Masuk'),
    h('p', { class: 'muted' }, 'Selamat datang kembali di Kost-DW'),
    form,
    h('p', { class: 'demo muted' }, 'Demo — owner: ', h('code', null, 'budi@kost.test'), ' · penyewa: ', h('code', null, 'penyewa01@kost.test'), ' · password: ', h('code', null, 'demo1234')),
    h('p', { class: 'demo' }, 'Belum punya akun? ', h('a', { href: '#/register' }, 'Daftar'))));
}
