import { h } from '../ui/dom.js';
import { field, readForm } from '../ui/components.js';
import { api } from '../api.js';
import { store } from '../store.js';
import { go } from '../router.js';
import { authLayout } from '../ui/auth-layout.js';

export default function registerPage() {
  const err = h('div', { class: 'alert alert-bad', role: 'alert', hidden: true });
  const btn = h('button', { class: 'btn btn-primary', type: 'submit' }, 'Daftar');
  const biz = field({ label: 'Nama usaha kost', name: 'business_name', hint: 'Opsional', maxlength: 150 });
  biz.hidden = true;
  const role = field({ label: 'Daftar sebagai', name: 'role', type: 'select', value: 'tenant',
    options: [{ value: 'tenant', label: 'Penyewa' }, { value: 'owner', label: 'Pemilik kost (owner)' }] });
  role.querySelector('select').addEventListener('change', (e) => { biz.hidden = e.target.value !== 'owner'; });
  const form = h('form', null, err, role,
    field({ label: 'Nama lengkap', name: 'full_name', required: true, minlength: 3 }),
    field({ label: 'Email', name: 'email', type: 'email', required: true, autocomplete: 'username' }),
    field({ label: 'Telepon', name: 'phone', type: 'tel', required: true, minlength: 8 }),
    biz,
    field({ label: 'Password', name: 'password', type: 'password', required: true, minlength: 8, hint: 'Minimal 8 karakter', autocomplete: 'new-password' }),
    btn);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.hidden = true; btn.disabled = true;
    try {
      const session = await api.post('/api/auth/register', readForm(form));
      store.save(session);
      go(session.user.role === 'tenant' ? '/tenant/kost' : '/owner');   // penyewa baru: langsung pilih kost
    } catch (ex) { err.textContent = ex.message; err.hidden = false; } finally { btn.disabled = false; }
  });
  return authLayout(h('div', { class: 'card' },
    h('h1', null, 'Daftar akun'), h('p', { class: 'muted' }, 'Penyewa: setelah daftar Anda langsung bisa memilih kost dan menghubungi pemilik.'), form,
    h('p', { class: 'demo' }, 'Sudah punya akun? ', h('a', { href: '#/login' }, 'Masuk'))));
}
