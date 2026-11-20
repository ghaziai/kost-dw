import { h } from '../../ui/dom.js';
import { api } from '../../api.js';
import { field, formModal, confirmDialog, pageHeader, table, toast } from '../../ui/components.js';
import { LABEL } from '../../ui/format.js';

export default async function propertiesPage() {
  const root = h('div');

  const fields = (p = {}) => [
    field({ label: 'Nama properti', name: 'name', value: p.name ?? '', required: true, minlength: 3 }),
    field({ label: 'Jenis', name: 'property_type', type: 'select', value: p.property_type ?? 'campur',
      options: Object.entries(LABEL.propertyType).map(([value, label]) => ({ value, label })) }),
    field({ label: 'Kota', name: 'city', value: p.city ?? '', required: true }),
    field({ label: 'Alamat', name: 'address', value: p.address ?? '', required: true }),
  ];

  async function refresh() {
    const rows = await api.get('/api/owner/properties');
    root.replaceChildren(
      pageHeader('Properti', 'Bangunan kost yang Anda kelola',
        h('button', { class: 'btn btn-primary', onclick: () => formModal({
          title: 'Tambah properti', fields: fields(), submitLabel: 'Tambah',
          onSubmit: async (v) => { await api.post('/api/owner/properties', v); toast('Properti ditambahkan'); await refresh(); },
        }) }, '+ Tambah properti')),
      h('div', { class: 'card' }, table([
        { key: 'name', label: 'Nama' },
        { key: 'property_type', label: 'Jenis', render: (r) => LABEL.propertyType[r.property_type] },
        { key: 'city', label: 'Kota' },
        { key: 'address', label: 'Alamat' },
        { key: 'room_count', label: 'Kamar', align: 'right' },
        { key: 'x', label: '', render: (r) => h('div', { class: 'row-actions' },
          h('button', { class: 'btn btn-sm', onclick: () => formModal({
            title: `Ubah ${r.name}`, fields: fields(r),
            intro: 'Mengubah nama/alamat tidak menambah baris baru di DW: atribut ini ditimpa (SCD tipe 1).',
            onSubmit: async (v) => { await api.put(`/api/owner/properties/${r.id}`, v); toast('Properti diperbarui'); await refresh(); },
          }) }, 'Ubah'),
          h('button', { class: 'btn btn-sm', onclick: () => confirmDialog({
            title: 'Hapus properti', message: `Hapus "${r.name}"? Properti harus tidak memiliki kamar.`, confirmLabel: 'Hapus', danger: true,
            onConfirm: async () => { await api.del(`/api/owner/properties/${r.id}`); toast('Properti dihapus'); await refresh(); },
          }) }, 'Hapus')) },
      ], rows, { emptyText: 'Belum ada properti. Tambahkan yang pertama.' })));
  }
  await refresh();
  return root;
}
