import { h } from '../../ui/dom.js';
import { api } from '../../api.js';
import { field, formModal, confirmDialog, pageHeader, table, toast, badge } from '../../ui/components.js';
import { rupiah } from '../../ui/format.js';

export default async function roomsPage() {
  const root = h('div');
  const props = await api.get('/api/owner/properties');
  let filter = '';

  const fields = (r = {}) => [
    r.id ? null : field({ label: 'Properti', name: 'property_id', type: 'select', required: true,
      value: filter || props[0]?.id, options: props.map((p) => ({ value: p.id, label: p.name })) }),
    field({ label: 'Nomor kamar', name: 'room_number', value: r.room_number ?? '', required: true, maxlength: 20 }),
    field({ label: 'Tipe', name: 'room_type', value: r.room_type ?? 'Standar', required: true }),
    field({ label: 'Tarif sewa / bulan (Rp)', name: 'price', type: 'number', value: r.price ?? '', required: true, min: 1, step: 1000 }),
    field({ label: 'Deposit (Rp)', name: 'deposit_amount', type: 'number', value: r.deposit_amount ?? 0, min: 0, step: 1000 }),
  ];

  async function refresh() {
    const rows = await api.get('/api/owner/rooms', { propertyId: filter });
    const sel = field({ label: 'Properti', name: 'p', type: 'select', value: filter,
      options: [{ value: '', label: 'Semua properti' }, ...props.map((p) => ({ value: p.id, label: p.name }))] });
    sel.querySelector('select').addEventListener('change', (e) => { filter = e.target.value; refresh(); });
    root.replaceChildren(
      pageHeader('Kamar', 'Kelola kamar dan tarif sewa',
        h('button', { class: 'btn btn-primary', disabled: !props.length, onclick: () => formModal({
          title: 'Tambah kamar', fields: fields(), submitLabel: 'Tambah',
          onSubmit: async (v) => { await api.post('/api/owner/rooms', v); toast('Kamar ditambahkan'); await refresh(); },
        }) }, '+ Tambah kamar')),
      h('div', { class: 'filters' }, sel),
      h('div', { class: 'card' }, table([
        { key: 'property_name', label: 'Properti' },
        { key: 'room_number', label: 'Kamar' },
        { key: 'room_type', label: 'Tipe' },
        { key: 'price', label: 'Tarif / bln', align: 'right', render: (r) => rupiah(r.price) },
        { key: 'deposit_amount', label: 'Deposit', align: 'right', render: (r) => rupiah(r.deposit_amount) },
        { key: 'occupied', label: 'Status', render: (r) => (r.occupied ? badge(`Terisi · ${r.tenant_name}`, 'ok') : badge('Kosong', 'muted')) },
        { key: 'x', label: '', render: (r) => h('div', { class: 'row-actions' },
          h('button', { class: 'btn btn-sm', onclick: () => formModal({
            title: `Ubah kamar ${r.room_number}`, fields: fields(r),
            intro: 'Mengubah tarif membuat versi baru kamar di DW (SCD tipe 2) setelah ETL berikutnya; laporan lama tetap memakai tarif lamanya.',
            onSubmit: async (v) => { await api.put(`/api/owner/rooms/${r.id}`, v); toast('Kamar diperbarui'); await refresh(); },
          }) }, 'Ubah'),
          h('button', { class: 'btn btn-sm', onclick: () => confirmDialog({
            title: 'Hapus kamar', message: `Hapus kamar ${r.room_number}? Kamar yang pernah dikontrak tidak dapat dihapus.`, confirmLabel: 'Hapus', danger: true,
            onConfirm: async () => { await api.del(`/api/owner/rooms/${r.id}`); toast('Kamar dihapus'); await refresh(); },
          }) }, 'Hapus')) },
      ], rows, { emptyText: 'Belum ada kamar.' })));
  }
  await refresh();
  return root;
}
