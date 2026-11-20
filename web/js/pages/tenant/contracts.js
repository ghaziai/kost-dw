import { h } from '../../ui/dom.js';
import { api } from '../../api.js';
import { pageHeader, empty, statusBadge } from '../../ui/components.js';
import { rupiah, tanggal, LABEL } from '../../ui/format.js';

export default async function tenantContractsPage() {
  const rows = await api.get('/api/tenant/contracts');
  const row = (label, value) => h('div', { style: 'display:flex;justify-content:space-between;gap:12px;padding:4px 0' }, h('span', { class: 'muted' }, label), h('span', null, value));
  return h('div', null, pageHeader('Kontrak saya', 'Kamar yang Anda sewa'),
    rows.length ? rows.map((c) => h('div', { class: 'card' },
      h('div', { style: 'display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px' },
        h('h2', null, `${c.property_name} · kamar ${c.room_number}`), statusBadge(c.status, LABEL.contract)),
      row('Kota', c.city), row('Tipe kamar', c.room_type),
      row('Periode', `${tanggal(c.start_date)} – ${tanggal(c.end_date)}`),
      row('Sewa / bulan', rupiah(c.rent_amount)), row('Deposit', rupiah(c.deposit_amount)),
      row('Jatuh tempo', `Tanggal ${c.due_day} setiap bulan`),
      c.open_invoices ? h('div', { class: 'alert alert-info', style: 'margin:10px 0 0' }, `${c.open_invoices} tagihan belum dibayar`) : null))
      : h('div', { class: 'card' }, empty('Anda belum memiliki kontrak.'),
        h('div', { style: 'text-align:center' }, h('a', { class: 'btn btn-primary', href: '#/tenant/kost' }, 'Pilih kost & hubungi pemilik'))));
}
