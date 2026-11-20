import { h } from '../../ui/dom.js';
import { api } from '../../api.js';
import { field, formModal, pageHeader, table, toast, statusBadge, empty } from '../../ui/components.js';
import { tanggal, LABEL } from '../../ui/format.js';

export default async function tenantComplaintsPage() {
  const root = h('div');
  async function refresh() {
    const [rows, rooms] = await Promise.all([api.get('/api/tenant/complaints'), api.get('/api/tenant/rooms')]);
    root.replaceChildren(
      pageHeader('Pengaduan saya', 'Laporkan keluhan tentang kamar Anda',
        h('button', { class: 'btn btn-primary', disabled: !rooms.length, title: rooms.length ? '' : 'Anda belum menyewa kamar', onclick: () => formModal({
          title: 'Ajukan pengaduan', submitLabel: 'Kirim',
          fields: [
            field({ label: 'Kamar', name: 'room_id', type: 'select', required: true, options: rooms.map((r) => ({ value: r.room_id, label: `${r.property_name} · ${r.room_number}` })) }),
            field({ label: 'Kategori', name: 'category', type: 'select', required: true, options: Object.entries(LABEL.category).map(([value, label]) => ({ value, label })) }),
            field({ label: 'Keluhan', name: 'description', type: 'textarea', required: true, minlength: 5, maxlength: 1000, full: true }),
          ],
          onSubmit: async (v) => { await api.post('/api/tenant/complaints', v); toast('Pengaduan terkirim'); await refresh(); },
        }) }, '+ Ajukan pengaduan')),
      h('div', { class: 'card' }, rows.length ? table([
        { key: 'created_at', label: 'Diajukan', render: (r) => tanggal(r.created_at.slice(0, 10)) },
        { key: 'room_number', label: 'Kamar', render: (r) => `${r.property_name} · ${r.room_number}` },
        { key: 'category', label: 'Kategori', render: (r) => LABEL.category[r.category] },
        { key: 'description', label: 'Keluhan' },
        { key: 'status', label: 'Status', render: (r) => statusBadge(r.status, LABEL.complaint) },
        { key: 'resolution_note', label: 'Catatan penyelesaian' },
      ], rows) : empty('Belum ada pengaduan.')));
  }
  await refresh();
  return root;
}
