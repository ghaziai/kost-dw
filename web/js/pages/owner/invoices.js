import { h } from '../../ui/dom.js';
import { api } from '../../api.js';
import { field, formModal, pageHeader, table, toast, statusBadge, modal } from '../../ui/components.js';
import { rupiah, tanggal, bulan, LABEL } from '../../ui/format.js';
import { store } from '../../store.js';

export default async function invoicesPage() {
  const root = h('div');
  const f = { status: '', month: '' };

  const payForm = (inv, refresh) => formModal({
    title: `Catat pembayaran · ${inv.tenant_name}`, submitLabel: 'Catat pembayaran',
    intro: `${inv.property_name} · kamar ${inv.room_number} · ${bulan(inv.period_month)} · ${rupiah(inv.amount)}. Pembayaran dikonfirmasi manual oleh owner (tanpa payment gateway).`,
    fields: [
      field({ label: 'Metode', name: 'method', type: 'select', required: true, options: Object.entries(LABEL.method).map(([value, label]) => ({ value, label })) }),
      field({ label: 'Tanggal bayar', name: 'paid_date', type: 'date', value: store.today, max: store.today, required: true }),
      field({ label: 'Catatan', name: 'note', maxlength: 300, full: true }),
    ],
    onSubmit: async (v) => { await api.post(`/api/owner/invoices/${inv.id}/payments`, v); toast('Pembayaran dicatat'); await refresh(); },
  });

  async function refresh() {
    const rows = await api.get('/api/owner/invoices', f);
    const status = field({ label: 'Status', name: 'status', type: 'select', value: f.status,
      options: [{ value: '', label: 'Semua' }, ...Object.entries(LABEL.invoice).map(([value, label]) => ({ value, label }))] });
    const month = field({ label: 'Bulan tagihan', name: 'month', type: 'month', value: f.month });
    status.querySelector('select').addEventListener('change', (e) => { f.status = e.target.value; refresh(); });
    month.querySelector('input').addEventListener('change', (e) => { f.month = e.target.value; refresh(); });

    root.replaceChildren(
      pageHeader('Tagihan & Pembayaran', 'Tagihan bulanan terbit otomatis dari kontrak aktif',
        h('button', { class: 'btn btn-primary', onclick: () => formModal({
          title: 'Jalankan penagihan', submitLabel: 'Jalankan',
          intro: 'Menerbitkan tagihan bulan berjalan untuk semua kontrak aktif, menandai tagihan lewat jatuh tempo sebagai "Terlambat", dan menyelesaikan kontrak yang sudah berakhir. Aman dijalankan berulang.',
          fields: [field({ label: 'Per tanggal', name: 'as_of', type: 'date', value: store.today, required: true })],
          onSubmit: async (v) => {
            const r = await api.post('/api/owner/billing/run', v);
            toast(`Penagihan selesai: ${r.invoices_issued ?? 0} tagihan baru, ${r.invoices_overdue ?? 0} terlambat, ${r.contracts_completed ?? 0} kontrak selesai`);
            await refresh();
          },
        }) }, 'Jalankan penagihan')),
      h('div', { class: 'filters' }, status, month),
      h('div', { class: 'card' }, table([
        { key: 'period_month', label: 'Bulan', render: (r) => bulan(r.period_month) },
        { key: 'tenant_name', label: 'Penyewa' },
        { key: 'room_number', label: 'Kamar', render: (r) => `${r.property_name} · ${r.room_number}` },
        { key: 'due_date', label: 'Jatuh tempo', render: (r) => tanggal(r.due_date) },
        { key: 'amount', label: 'Jumlah', align: 'right', render: (r) => rupiah(r.amount) },
        { key: 'status', label: 'Status', render: (r) => statusBadge(r.status, LABEL.invoice) },
        { key: 'paid_at', label: 'Dibayar', render: (r) => (r.paid_at ? `${tanggal(r.paid_at.slice(0, 10))} · ${LABEL.method[r.method]}` : '–') },
        { key: 'x', label: '', render: (r) => (['unpaid', 'overdue'].includes(r.status)
          ? h('button', { class: 'btn btn-sm btn-primary', onclick: () => payForm(r, refresh) }, 'Catat bayar') : null) },
      ], rows, { emptyText: 'Tidak ada tagihan untuk filter ini.' })));
  }
  await refresh();
  return root;
}
