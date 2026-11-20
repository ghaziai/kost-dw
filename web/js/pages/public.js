// Beranda PUBLIK (tanpa login): statistik pasar kost dari Data Warehouse + daftar kost.
// Kontak pemilik sengaja TIDAK ditampilkan di sini; pengunjung diajak mendaftar sebagai penyewa.
import { h } from '../ui/dom.js';
import { api } from '../api.js';
import { store } from '../store.js';
import { empty } from '../ui/components.js';
import { icons } from '../ui/chrome.js';
import { kostGrid, searchBar } from '../ui/kost.js';
import { barChart, lineChart, hBarChart } from '../ui/charts.js';
import { rupiahRingkas, persen, angka, tanggal } from '../ui/format.js';

const stat = (icon, value, label) => h('div', { class: 'stat' },
  h('div', { class: 's-ico' }, icons[icon]()), h('div', { class: 's-val' }, value), h('div', { class: 's-label' }, label));

export default async function publicPage() {
  const user = store.user;
  const [stats, cities, kost] = await Promise.all([
    api.get('/api/public/stats'), api.get('/api/public/cities'), api.get('/api/public/kost')]);
  const sm = stats.summary;
  const occRate = sm.kamar ? Math.round((100 * (sm.kamar - sm.kamar_kosong)) / sm.kamar) : null;

  // Tamu/owner diajak mendaftar; penyewa login diarahkan ke katalog yang memuat kontak.
  const cta = () => h('a', { class: 'btn btn-primary btn-sm', href: user?.role === 'tenant' ? '#/tenant/kost' : '#/register' },
    user?.role === 'tenant' ? 'Lihat kontak' : 'Daftar untuk menghubungi');
  const list = h('div', null, kostGrid(kost, { cta }));
  const refresh = async (f) => list.replaceChildren(kostGrid(await api.get('/api/public/kost', f), { cta }));

  const hero = h('section', { class: 'hero' },
    h('h1', null, 'Temukan kost yang pas, hubungi pemiliknya langsung.'),
    h('p', null, `${angka(sm.kost)} kost dan ${angka(sm.kamar)} kamar terdata. Saat ini ${angka(sm.kamar_kosong)} kamar masih kosong, mulai ${rupiahRingkas(sm.tarif_min)} per bulan.`),
    h('div', { class: 'actions' },
      user?.role === 'tenant'
        ? h('a', { class: 'btn btn-light btn-lg', href: '#/tenant/kost' }, 'Pilih kost & hubungi pemilik')
        : user ? h('a', { class: 'btn btn-light btn-lg', href: '#/owner' }, 'Buka dasbor saya')
          : [h('a', { class: 'btn btn-light btn-lg', href: '#/register' }, 'Daftar sebagai penyewa'),
            h('a', { class: 'btn btn-ghost btn-lg', href: '#/login' }, 'Masuk')]));

  const how = h('div', { class: 'steps' },
    h('div', { class: 'step' }, h('b', null, 'Daftar gratis'), h('span', { class: 'muted' }, 'Buat akun penyewa dalam semenit.')),
    h('div', { class: 'step' }, h('b', null, 'Pilih kost'), h('span', { class: 'muted' }, 'Bandingkan harga, lokasi, dan kamar yang masih kosong.')),
    h('div', { class: 'step' }, h('b', null, 'Hubungi pemilik'), h('span', { class: 'muted' }, 'Kirim pesan WhatsApp otomatis atau telepon langsung.')),
    h('div', { class: 'step' }, h('b', null, 'Sewa & kelola'), h('span', { class: 'muted' }, 'Setelah kontrak dibuat pemilik, pantau tagihan dan pengaduan di sini.')));

  const svc = stats.service;
  return h('div', null,
    hero,
    h('div', { class: 'stat-grid' },
      stat('home', angka(sm.kost), 'Kost terdaftar'),
      stat('bed', angka(sm.kamar_kosong), `Kamar kosong dari ${angka(sm.kamar)}`),
      stat('coin', rupiahRingkas(sm.rerata_tarif), 'Rata-rata tarif / bulan'),
      stat('chart', persen(occRate), 'Kamar terisi saat ini'),
      stat('star', persen(svc.persenTepatWaktu), 'Pembayaran tepat waktu')),

    h('div', { class: 'section-title' }, h('h2', null, 'Daftar kost'), h('p', { class: 'muted' }, 'Urut dari yang paling banyak kamar kosong')),
    searchBar({ cities, onChange: (f) => refresh(f).catch(() => {}) }),
    list,

    h('div', { class: 'section-title' }, h('h2', null, 'Pasar kost sekilas'),
      h('p', { class: 'muted' }, `Data Warehouse · diperbarui ETL terakhir · hari ini ${tanggal(stats.asOf)}`)),
    h('div', { class: 'grid-2' },
      h('div', { class: 'card' }, h('h3', { class: 'c-title' }, 'Tingkat hunian 12 bulan terakhir (%)'),
        stats.occupancy.length ? lineChart(stats.occupancy.map((o) => o.periode), [{ name: 'Okupansi', values: stats.occupancy.map((o) => o.persen) }],
          { fmt: (x) => `${Math.round(x)}%`, max: 100, label: 'Okupansi semua kost per bulan' }) : empty('Belum ada data')),
      h('div', { class: 'card' }, h('h3', { class: 'c-title' }, 'Kamar kosong per kelas tarif'),
        sm.byClass.length ? barChart(sm.byClass.map((c) => ({ label: `${c.kelas}`, value: c.kosong })), { fmt: (x) => angka(x), label: 'Kamar kosong per kelas tarif', labelFmt: (x) => x }) : empty('Belum ada data')),
      h('div', { class: 'card' }, h('h3', { class: 'c-title' }, 'Jumlah kamar per kota'),
        sm.byCity.length ? hBarChart(sm.byCity.map((c) => ({ label: c.kota, value: c.kamar })), { fmt: (x) => angka(x), label: 'Jumlah kamar per kota', cls: 's2' }) : empty('Belum ada data')),
      h('div', { class: 'card' }, h('h3', { class: 'c-title' }, 'Kualitas layanan pemilik'),
        h('div', { class: 'stat-grid', style: 'grid-template-columns:repeat(2,1fr)' },
          stat('check', persen(svc.persenTepatWaktu), 'Bayar sewa tepat waktu'),
          stat('star', svc.rerataHariSelesai === null ? '–' : `${angka(svc.rerataHariSelesai)} hr`, 'Rata-rata penyelesaian pengaduan'),
          stat('chart', persen(svc.pengaduanSelesaiPersen), `Pengaduan selesai (${angka(svc.pengaduan)} total)`),
          stat('check', persen(svc.persenDalamSla), 'Selesai dalam SLA')))),

    h('div', { class: 'section-title' }, h('h2', null, 'Cara kerja')),
    how,
    h('p', { class: 'footer', style: 'margin-top:32px' }, 'Kost-DW · proyek latihan Workshop Data Warehouse'));
}
