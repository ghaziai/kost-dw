import { h } from '../../ui/dom.js';
import { api } from '../../api.js';
import { pageHeader, table, statusBadge } from '../../ui/components.js';
import { rupiah, tanggal, bulan, LABEL } from '../../ui/format.js';

export default async function tenantInvoicesPage() {
  const rows = await api.get('/api/tenant/invoices');
  return h('div', null,
    pageHeader('Tagihan saya', 'Pembayaran dikonfirmasi oleh pemilik kost setelah Anda membayar (tunai/transfer)'),
    h('div', { class: 'card' }, table([
      { key: 'period_month', label: 'Bulan', render: (r) => bulan(r.period_month) },
      { key: 'room_number', label: 'Kamar', render: (r) => `${r.property_name} · ${r.room_number}` },
      { key: 'due_date', label: 'Jatuh tempo', render: (r) => tanggal(r.due_date) },
      { key: 'amount', label: 'Jumlah', align: 'right', render: (r) => rupiah(r.amount) },
      { key: 'status', label: 'Status', render: (r) => statusBadge(r.status, LABEL.invoice) },
      { key: 'paid_at', label: 'Dibayar', render: (r) => (r.paid_at ? `${tanggal(r.paid_at.slice(0, 10))} · ${LABEL.method[r.method]}` : '–') },
    ], rows, { emptyText: 'Belum ada tagihan.' })));
}
