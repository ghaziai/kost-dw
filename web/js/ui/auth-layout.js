// Tata letak halaman masuk/daftar: panel sambutan + kartu formulir, dengan tombol tema.
import { h } from './dom.js';
import { brand, themeButton } from './chrome.js';

export function authLayout(card) {
  return h('div', { class: 'auth-page' },
    h('aside', { class: 'auth-side' },
      brand(),
      h('h2', null, 'Cari kost, hubungi pemilik, kelola sewa — satu tempat.'),
      h('p', null, 'Penyewa bisa melihat semua kost dan menghubungi pemiliknya. Pemilik mendapat dasbor analitik dari Data Warehouse.'),
      h('ul', null,
        h('li', null, 'Lihat kamar kosong dan harga semua kost'),
        h('li', null, 'Hubungi pemilik lewat WhatsApp atau telepon'),
        h('li', null, 'Pantau tagihan dan ajukan pengaduan'))),
    h('div', { class: 'auth-main' },
      h('div', { class: 'auth-tools' }, h('a', { class: 'btn btn-sm btn-ghost', href: '#/publik' }, '← Beranda'), themeButton()),
      h('div', { class: 'auth-wrap' }, card)));
}
