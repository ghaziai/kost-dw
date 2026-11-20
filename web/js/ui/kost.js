// Komponen katalog kost: kartu, daftar kamar, dan kontak pemilik (dipakai halaman publik & penyewa).
import { h } from './dom.js';
import { api } from '../api.js';
import { modal, empty, errorBox } from './components.js';
import { icons, waIcon } from './chrome.js';
import { rupiah, rupiahRingkas, tanggal, LABEL } from './format.js';

const COVERS = ['#0d7a70,#14a393', '#3b5bdb,#5c7cfa', '#c2255c,#e64980', '#e8590c,#f59f00', '#6741d9,#9775fa', '#2b8a3e,#51cf66'];
const cover = (id) => `linear-gradient(135deg, ${COVERS[id % COVERS.length].split(',').join(', ')})`;

/** Nomor telepon Indonesia -> format internasional untuk wa.me (0812… -> 62812…). */
export function waLink(phone, text) {
  let d = String(phone ?? '').replace(/\D/g, '');
  if (d.startsWith('0')) d = `62${d.slice(1)}`;
  return `https://wa.me/${d}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}

export function priceText(k) {
  if (k.min_price === null || k.min_price === undefined) return 'Belum ada kamar';
  return k.min_price === k.max_price ? rupiah(k.min_price) : `${rupiahRingkas(k.min_price)} – ${rupiahRingkas(k.max_price)}`;
}

/**
 * Kartu kost. mode 'tenant' -> tombol "Lihat kamar & kontak"; mode 'public' -> ajakan masuk.
 */
export function kostCard(k, { onOpen, cta }) {
  const pct = k.total_rooms ? Math.round((100 * (k.total_rooms - k.available_rooms)) / k.total_rooms) : 0;
  return h('article', { class: 'kost-card' },
    h('div', { class: 'kost-cover', style: `background:${cover(k.id)}` }, h('span', { class: 'chip' }, LABEL.propertyType[k.property_type] ?? k.property_type)),
    h('div', { class: 'kost-body' },
      h('h3', null, k.name),
      h('div', { class: 'kost-meta' }, `${k.address}, ${k.city}`),
      h('div', { class: 'kost-price' }, priceText(k), h('small', null, ' / bulan')),
      h('div', null,
        h('div', { class: 'meter', role: 'img', 'aria-label': `${pct}% kamar terisi` }, h('i', { style: `width:${pct}%` })),
        h('div', { class: 'kost-meta', style: 'margin-top:4px' },
          k.available_rooms > 0 ? `${k.available_rooms} dari ${k.total_rooms} kamar tersedia` : `Penuh (${k.total_rooms} kamar)`)),
      h('div', { class: 'kost-foot' },
        k.available_rooms > 0 ? h('span', { class: 'badge badge-ok' }, 'Ada kamar kosong') : h('span', { class: 'badge badge-muted' }, 'Penuh'),
        cta ? cta(k) : h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: () => onOpen(k) }, 'Lihat kamar & kontak'))));
}

export const kostGrid = (list, opts) => (list.length
  ? h('div', { class: 'kost-grid' }, list.map((k) => kostCard(k, opts)))
  : empty('Tidak ada kost yang cocok dengan pencarian Anda.'));

/** Filter pencarian: mengembalikan { node, values() }. */
export function searchBar({ cities, onChange }) {
  const q = h('input', { type: 'search', placeholder: 'Cari nama, alamat, atau kota…', 'aria-label': 'Cari kost', maxlength: 80 });
  const city = h('select', { 'aria-label': 'Kota' }, h('option', { value: '' }, 'Semua kota'), cities.map((c) => h('option', { value: c }, c)));
  const type = h('select', { 'aria-label': 'Jenis kost' }, h('option', { value: '' }, 'Semua jenis'),
    Object.entries(LABEL.propertyType).map(([v, l]) => h('option', { value: v }, l)));
  let timer;
  const fire = () => { clearTimeout(timer); timer = setTimeout(() => onChange({ q: q.value.trim(), city: city.value, type: type.value }), 220); };
  for (const el of [q, city, type]) el.addEventListener('input', fire);
  return h('div', { class: 'toolbar' }, q, city, type);
}

/** Modal detail kost: daftar kamar + kontak pemilik (hanya bila `contact` = true, yaitu penyewa login). */
export async function openKostDetail(k, { fetchPath, user }) {
  const body = h('div', null, h('div', { class: 'loading' }, 'Memuat…'));
  modal({ title: k.name, body, wide: true });
  try {
    const d = await api.get(fetchPath(k.id));
    const phone = d.owner_phone;
    const hello = (room) => `Halo${d.owner_name ? ` ${d.owner_name}` : ''}, saya ${user.full_name}. Saya melihat ${d.name} (${d.city}) di Kost-DW dan tertarik dengan ${room ? `kamar ${room.room_number} (${rupiah(room.price)}/bulan)` : 'kamar yang tersedia'}. Apakah masih tersedia?`;
    const wa = (room, label = 'Hubungi via WhatsApp') => h('a', { class: 'btn btn-wa btn-sm', href: waLink(phone, hello(room)), target: '_blank', rel: 'noopener noreferrer' }, waIcon(), label);
    const free = d.rooms.filter((r) => r.available);
    body.replaceChildren(
      h('div', { class: 'contact-box' },
        h('div', { class: 'muted' }, 'Pemilik kost'),
        h('div', { class: 'who' }, d.owner_name, d.business_name ? ` · ${d.business_name}` : ''),
        h('div', null, `Telepon / WhatsApp: `, h('a', { href: `tel:${String(phone).replace(/[^\d+]/g, '')}` }, phone)),
        h('div', { class: 'muted' }, `${d.address}, ${d.city}`),
        h('div', { class: 'contact-actions' }, wa(free[0] ?? null, free.length ? 'Tanya kamar tersedia' : 'Tanya waiting list'),
          h('a', { class: 'btn btn-sm', href: `tel:${String(phone).replace(/[^\d+]/g, '')}` }, 'Telepon'))),
      h('h3', { style: 'margin-bottom:4px' }, `Kamar (${free.length} tersedia dari ${d.rooms.length})`),
      d.rooms.length ? h('div', null, d.rooms.map((r) => h('div', { class: 'room-row' },
        h('div', { class: 'r-info' },
          h('b', null, `Kamar ${r.room_number} · ${r.room_type}`),
          h('span', { class: 'muted' }, `${rupiah(r.price)} / bulan · deposit ${rupiah(r.deposit_amount)}`)),
        h('div', { style: 'display:flex;gap:8px;align-items:center;flex-wrap:wrap' },
          r.available ? h('span', { class: 'badge badge-ok' }, 'Tersedia') : h('span', { class: 'badge badge-muted' }, r.free_from ? `Kosong mulai ${tanggal(r.free_from)}` : 'Terisi'),
          r.available ? wa(r, 'Tanya kamar ini') : null)))) : empty('Belum ada kamar terdaftar.'));
  } catch (ex) { body.replaceChildren(errorBox(ex.message)); }
}
