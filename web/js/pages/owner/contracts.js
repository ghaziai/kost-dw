import { h } from '../../ui/dom.js';
import { api } from '../../api.js';
import { field, formModal, confirmDialog, pageHeader, table, toast, statusBadge } from '../../ui/components.js';
import { rupiah, tanggal, LABEL } from '../../ui/format.js';
import { store } from '../../store.js';

export default async function contractsPage() {
  const root = h('div');
  let status = '';

  async function openCreate() {
    const [rooms, tenants] = await Promise.all([api.get('/api/owner/rooms'), api.get('/api/owner/tenants')]);
    const free = rooms.filter((r) => !r.occupied);
    const roomField = field({ label: 'Kamar (kosong hari ini)', name: 'room_id', type: 'select', required: true,
      options: free.map((r) => ({ value: r.id, label: `${r.property_name} · ${r.room_number} · ${rupiah(r.price)}` })) });
    const rent = field({ label: 'Nilai sewa / bulan (Rp)', name: 'rent_amount', type: 'number', required: true, min: 1, step: 1000, value: free[0]?.price ?? '' });
    const dep = field({ label: 'Deposit (Rp)', name: 'deposit_amount', type: 'number', min: 0, step: 1000, value: free[0]?.deposit_amount ?? 0 });
    roomField.querySelector('select').addEventListener('change', (e) => {
      const r = free.find((x) => String(x.id) === e.target.value);
      if (r) { rent.querySelector('input').value = r.price; dep.querySelector('input').value = r.deposit_amount; }
    });
    formModal({
      title: 'Kontrak baru', submitLabel: 'Buat kontrak', wide: true,
      intro: 'Tagihan bulan berjalan langsung terbit. Tagihan bulan berikutnya terbit lewat "Jalankan penagihan".',
      fields: [
        roomField,
        field({ label: 'Penyewa', name: 'tenant_id', type: 'select', required: true,
          options: tenants.map((t) => ({ value: t.id, label: `${t.full_name} (${t.email})${t.has_active_contract ? ' · punya kontrak aktif' : ''}` })) }),
        field({ label: 'Mulai bulan', name: 'start_month', type: 'month', required: true, value: store.today.slice(0, 7) }),
        field({ label: 'Durasi (bulan)', name: 'months', type: 'number', required: true, min: 1, max: 24, value: 6 }),
        rent, dep,
        field({ label: 'Jatuh tempo (tanggal)', name: 'due_day', type: 'number', min: 1, max: 28, value: 5 }),
      ],
      onSubmit: async (v) => { await api.post('/api/owner/contracts', v); toast('Kontrak dibuat'); await refresh(); },
    });
  }

  async function refresh() {
    const rows = await api.get('/api/owner/contracts', { status });
    const sel = field({ label: 'Status', name: 's', type: 'select', value: status,
      options: [{ value: '', label: 'Semua' }, ...Object.entries(LABEL.contract).map(([value, label]) => ({ value, label }))] });
    sel.querySelector('select').addEventListener('change', (e) => { status = e.target.value; refresh(); });
    root.replaceChildren(
      pageHeader('Kontrak', 'Kontrak sewa penyewa',
        h('button', { class: 'btn btn-primary', onclick: () => openCreate().catch((ex) => toast(ex.message, 'bad')) }, '+ Kontrak baru')),
      h('div', { class: 'filters' }, sel),
      h('div', { class: 'card' }, table([
        { key: 'tenant_name', label: 'Penyewa' },
        { key: 'room_number', label: 'Kamar', render: (r) => `${r.property_name} · ${r.room_number}` },
        { key: 'start_date', label: 'Periode', render: (r) => `${tanggal(r.start_date)} – ${tanggal(r.end_date)}` },
        { key: 'rent_amount', label: 'Sewa / bln', align: 'right', render: (r) => rupiah(r.rent_amount) },
        { key: 'status', label: 'Status', render: (r) => statusBadge(r.status, LABEL.contract) },
        { key: 'x', label: '', render: (r) => (r.status === 'active' ? h('button', { class: 'btn btn-sm', onclick: () => formModal({
          title: 'Akhiri kontrak lebih awal', submitLabel: 'Akhiri kontrak',
          intro: `Kontrak ${r.tenant_name} (kamar ${r.room_number}). Tagihan setelah tanggal berakhir dibatalkan.`,
          fields: [field({ label: 'Tanggal berakhir', name: 'date', type: 'date', required: true, value: store.today, min: r.start_date, max: r.end_date })],
          onSubmit: async (v) => { await api.post(`/api/owner/contracts/${r.id}/terminate`, v); toast('Kontrak diakhiri'); await refresh(); },
        }) }, 'Akhiri') : null) },
      ], rows, { emptyText: 'Belum ada kontrak.' })));
  }
  await refresh();
  return root;
}
