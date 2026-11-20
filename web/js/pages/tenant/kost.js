// Penyewa: memilih kost dan menghubungi pemilik. Ini halaman pertama setelah penyewa mendaftar.
import { h } from '../../ui/dom.js';
import { api } from '../../api.js';
import { pageHeader } from '../../ui/components.js';
import { kostGrid, searchBar, openKostDetail } from '../../ui/kost.js';

export default async function tenantKostPage({ user }) {
  const [cities, kost, contracts] = await Promise.all([
    api.get('/api/public/cities'), api.get('/api/tenant/kost'), api.get('/api/tenant/contracts')]);
  const noContract = contracts.length === 0;

  const open = (k) => openKostDetail(k, { fetchPath: (id) => `/api/tenant/kost/${id}`, user });
  const list = h('div', null, kostGrid(kost, { onOpen: open }));
  const refresh = async (f) => list.replaceChildren(kostGrid(await api.get('/api/tenant/kost', f), { onOpen: open }));

  return h('div', null,
    noContract ? h('div', { class: 'welcome' },
      h('div', null, h('b', null, `Selamat datang, ${user.full_name.split(' ')[0]}!`),
        h('div', null, 'Anda belum memiliki kontrak. Pilih kost di bawah, lalu hubungi pemiliknya lewat WhatsApp atau telepon. Setelah pemilik membuat kontrak atas nama Anda, tagihan dan pengaduan akan muncul di menu.'))) : null,
    pageHeader('Cari kost', `${kost.length} kost terdaftar · klik "Lihat kamar & kontak" untuk menghubungi pemilik`),
    searchBar({ cities, onChange: (f) => refresh(f).catch(() => {}) }),
    list);
}
