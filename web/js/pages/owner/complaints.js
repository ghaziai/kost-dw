import { h } from '../../ui/dom.js';
import { api } from '../../api.js';
import { field, formModal, pageHeader, table, toast, statusBadge } from '../../ui/components.js';
import { tanggal, LABEL } from '../../ui/format.js';

export default async function complaintsPage() {
  const root = h('div');
  let status = '';

  async function refresh() {
    const rows = await api.get('/api/owner/complaints', { status });
    const sel = field({ label: 'Status', name: 's', type: 'select', value: status,
      options: [{ value: '', label: 'Semua' }, ...Object.entries(LABEL.complaint).map(([value, label]) => ({ value, label }))] });
    sel.querySelector('select').addEventListener('change', (e) => { status = e.target.value; refresh(); });

    const act = (r) => {
      if (r.status === 'open') {
        return h('button', { class: 'btn btn-sm', onclick: async () => {
          try { await api.patch(`/api/owner/complaints/${r.id}`, { status: 'in_progress' }); toast('Pengaduan diproses'); await refresh(); } catch (ex) { toast(ex.message, 'bad'); }
        } }, 'Proses');
      }
      if (r.status === 'in_progress') {
        return h('button', { class: 'btn btn-sm btn-primary', onclick: () => formModal({
          title: 'Selesaikan pengaduan', submitLabel: 'Tandai selesai', intro: r.description,
          fields: [field({ label: 'Catatan penyelesaian', name: 'resolution_note', type: 'textarea', maxlength: 500, full: true })],
          onSubmit: async (v) => { await api.patch(`/api/owner/complaints/${r.id}`, { status: 'resolved', ...v }); toast('Pengaduan selesai'); await refresh(); },
        }) }, 'Selesaikan');
      }
      return null;
    };

    root.replaceChildren(
      pageHeader('Pengaduan', 'Keluhan dari penyewa'),
      h('div', { class: 'filters' }, sel),
      h('div', { class: 'card' }, table([
        { key: 'created_at', label: 'Diajukan', render: (r) => tanggal(r.created_at.slice(0, 10)) },
        { key: 'tenant_name', label: 'Penyewa' },
        { key: 'room_number', label: 'Kamar', render: (r) => `${r.property_name} · ${r.room_number}` },
        { key: 'category', label: 'Kategori', render: (r) => LABEL.category[r.category] },
        { key: 'description', label: 'Keluhan' },
        { key: 'status', label: 'Status', render: (r) => statusBadge(r.status, LABEL.complaint) },
        { key: 'x', label: '', render: act },
      ], rows, { emptyText: 'Tidak ada pengaduan.' })));
  }
  await refresh();
  return root;
}
