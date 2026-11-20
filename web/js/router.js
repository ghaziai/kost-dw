// Router hash sederhana + kerangka (header/nav) per peran. Halaman dimuat malas (dynamic import).
import { h } from './ui/dom.js';
import { store } from './store.js';
import { api } from './api.js';
import { errorBox } from './ui/components.js';
import { brand, themeButton } from './ui/chrome.js';

// public: hanya untuk tamu (login/daftar) | open: boleh dibuka siapa pun | role: khusus peran tersebut
const ROUTES = {
  '/publik': { page: () => import('./pages/public.js'), open: true },
  '/login': { page: () => import('./pages/login.js'), public: true, bare: true },
  '/register': { page: () => import('./pages/register.js'), public: true, bare: true },
  '/owner': { page: () => import('./pages/owner/dashboard.js'), role: 'owner' },
  '/owner/properti': { page: () => import('./pages/owner/properties.js'), role: 'owner' },
  '/owner/kamar': { page: () => import('./pages/owner/rooms.js'), role: 'owner' },
  '/owner/kontrak': { page: () => import('./pages/owner/contracts.js'), role: 'owner' },
  '/owner/tagihan': { page: () => import('./pages/owner/invoices.js'), role: 'owner' },
  '/owner/pengaduan': { page: () => import('./pages/owner/complaints.js'), role: 'owner' },
  '/tenant/kost': { page: () => import('./pages/tenant/kost.js'), role: 'tenant' },
  '/tenant': { page: () => import('./pages/tenant/contracts.js'), role: 'tenant' },
  '/tenant/tagihan': { page: () => import('./pages/tenant/invoices.js'), role: 'tenant' },
  '/tenant/pengaduan': { page: () => import('./pages/tenant/complaints.js'), role: 'tenant' },
};

const NAV = {
  owner: [['/owner', 'Dasbor'], ['/owner/properti', 'Properti'], ['/owner/kamar', 'Kamar'], ['/owner/kontrak', 'Kontrak'], ['/owner/tagihan', 'Tagihan'], ['/owner/pengaduan', 'Pengaduan'], ['/publik', 'Beranda publik']],
  tenant: [['/tenant/kost', 'Cari kost'], ['/tenant', 'Kontrak saya'], ['/tenant/tagihan', 'Tagihan'], ['/tenant/pengaduan', 'Pengaduan'], ['/publik', 'Beranda publik']],
  guest: [['/publik', 'Beranda']],
};

export const home = (user) => (user?.role === 'owner' ? '/owner' : user ? '/tenant' : '/publik');
export const go = (path) => { location.hash = `#${path}`; };

/** Halaman pertama setelah masuk: penyewa tanpa kontrak langsung diarahkan memilih kost. */
export async function landing(user) {
  if (user.role !== 'tenant') return home(user);
  try { return (await api.get('/api/tenant/contracts')).length ? '/tenant' : '/tenant/kost'; } catch { return '/tenant'; }
}

function parseHash() {
  const raw = location.hash.slice(1) || '/';
  const [path, qs = ''] = raw.split('?');
  return { path, query: Object.fromEntries(new URLSearchParams(qs)) };
}

function shell(user, onLogout) {
  const links = NAV[user?.role ?? 'guest'].map(([to, label]) => h('a', { href: `#${to}`, dataset: { to } }, label));
  const view = h('main', { id: 'view' });
  const right = user
    ? [h('span', { class: 'who' }, user.full_name), h('button', { class: 'btn btn-sm', type: 'button', onclick: onLogout }, 'Keluar')]
    : [h('a', { class: 'btn btn-sm', href: '#/login' }, 'Masuk'), h('a', { class: 'btn btn-primary btn-sm', href: '#/register' }, 'Daftar')];
  const root = h('div', null,
    h('header', { class: 'topbar' }, h('div', { class: 'topbar-in' },
      brand(),
      h('nav', { class: 'nav', 'aria-label': 'Menu utama' }, links),
      h('div', { class: 'userbox' }, themeButton(), right))),
    view);
  return { root, view, links };
}

let current = null;     // { role, root, view, links }
let token = 0;          // mencegah render basi bila pengguna berpindah cepat

export async function render(onLogout) {
  const { path, query } = parseHash();
  const route = ROUTES[path];
  const user = store.user;
  const app = document.getElementById('app');

  if (!route) return go(home(user));
  if (!route.open) {
    if (!route.public && !user) return go('/login');
    if (route.public && user) return go(home(user));
    if (route.role && user.role !== route.role) return go(home(user));
  }

  const mine = ++token;
  let host;
  if (route.bare) {
    current = null;
    host = h('div');
    app.replaceChildren(host);
  } else {
    const role = user?.role ?? 'guest';
    if (!current || current.role !== role) {
      current = { role, ...shell(user, onLogout) };
      app.replaceChildren(current.root);
    }
    host = current.view;
    for (const a of current.links) {
      if (a.dataset.to === path) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    }
    host.replaceChildren(h('div', { class: 'loading' }, 'Memuat…'));
  }

  try {
    const mod = await route.page();
    const node = await mod.default({ query, user });
    if (mine !== token) return;
    host.replaceChildren(node);
    window.scrollTo(0, 0);
  } catch (ex) {
    if (mine !== token) return;
    host.replaceChildren(errorBox(ex.message || 'Gagal memuat halaman'));
  }
}

export function resetShell() { current = null; }
