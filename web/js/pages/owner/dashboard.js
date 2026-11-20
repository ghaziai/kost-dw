// Dasbor analitik owner — SELURUH data berasal dari Data Warehouse (skema dw), bukan dari tabel OLTP.
// Setiap laporan diberi tag "Fakta × Dimensi" agar terlihat kaitannya dengan matriks bus.
import { h } from '../../ui/dom.js';
import { api } from '../../api.js';
import { field, pageHeader, table, empty, badge } from '../../ui/components.js';
import { barChart, lineChart, hBarChart, heatmap } from '../../ui/charts.js';
import { ringkas, persen, angka, bulanPendek, waktu } from '../../ui/format.js';

const kpi = (label, value, sub) => h('div', { class: 'kpi' },
  h('div', { class: 'k-label' }, label), h('div', { class: 'k-value' }, value), h('div', { class: 'k-sub' }, sub ?? ' '));

function report({ id, title, question, tag, children }) {
  return h('section', { class: 'card report', 'aria-labelledby': `r-${id}` },
    h('div', { class: 'report-head' }, h('h2', { id: `r-${id}` }, `${id} · ${title}`), h('span', { class: 'report-tag' }, tag)),
    h('p', { class: 'q' }, question),
    h('div', { class: 'report-grid' }, children));
}
const panel = (title, node) => h('div', null, h('h3', null, title), node);

export default async function dashboardPage() {
  const root = h('div');
  const props = await api.get('/api/owner/properties');
  const meta = await api.get('/api/owner/analytics/meta');
  const state = { from: meta.periodeMin, to: meta.periodeMax, propertyId: '' };

  async function draw() {
    const d = await api.get('/api/owner/analytics', { from: state.from, to: state.to, propertyId: state.propertyId });
    body.replaceChildren(d.empty ? empty('Data warehouse masih kosong. Jalankan ETL terlebih dahulu (scripts/run_etl.sh).') : build(d));
  }

  const f = h('form', { class: 'filters', onsubmit: async (e) => {
    e.preventDefault();
    const v = Object.fromEntries(new FormData(e.target));
    Object.assign(state, { from: v.from, to: v.to, propertyId: v.propertyId });
    try { await draw(); } catch (ex) { body.replaceChildren(h('div', { class: 'alert alert-bad', role: 'alert' }, ex.message)); }
  } },
    field({ label: 'Dari bulan', name: 'from', type: 'month', value: state.from, required: true, min: meta.periodeMin, max: meta.periodeMax }),
    field({ label: 'Sampai bulan', name: 'to', type: 'month', value: state.to, required: true, min: meta.periodeMin, max: meta.periodeMax }),
    field({ label: 'Properti', name: 'propertyId', type: 'select', value: '', options: [{ value: '', label: 'Semua properti' }, ...props.map((p) => ({ value: p.id, label: p.name }))] }),
    h('button', { class: 'btn btn-primary', type: 'submit' }, 'Terapkan'));

  const last = meta.etlRuns.find((r) => r.status === 'success');
  const etl = h('p', { class: 'etl-line' },
    last ? ['Data terakhir diperbarui oleh ETL ', h('b', null, waktu(last.finished_at)), ` (mode ${last.mode}, data sampai ${last.as_of}). `] : 'Belum ada ETL yang berhasil. ',
    'Transaksi yang baru dicatat muncul di sini setelah ETL berikutnya dijalankan.');

  const body = h('div', null, h('div', { class: 'loading' }, 'Memuat laporan…'));
  root.append(pageHeader('Dasbor Analitik', 'Dibaca dari Data Warehouse (skema dw)'), etl, h('div', { style: 'height:12px' }), f, body);
  await draw();
  return root;
}

function build(d) {
  const { kpi: k } = d;
  const monthsRev = d.revenue.monthly;
  const occ = d.occupancy;

  const kpis = h('div', { class: 'kpis' },
    kpi('Pendapatan diterima', `Rp ${ringkas(k.pendapatan)}`, `${angka(k.transaksi)} pembayaran`),
    kpi('Okupansi rata-rata', persen(k.okupansiPersen), 'hari-kamar terisi ÷ tersedia'),
    kpi('Pendapatan hilang', `Rp ${ringkas(k.pendapatanHilang)}`, 'dari kamar kosong'),
    kpi('Bayar terlambat', persen(k.persenTerlambat), 'dari seluruh pembayaran'),
    kpi('Penanganan pengaduan', k.rerataDurasiPengaduan === null ? '–' : `${angka(k.rerataDurasiPengaduan)} hari`, `${k.pengaduanTerbuka} masih terbuka`));

  // ---- Q-01 pendapatan
  const q1 = report({
    id: 'Q-01', title: 'Pendapatan per bulan',
    question: 'Berapa pendapatan sewa yang benar-benar diterima tiap bulan, dari properti dan kelas tarif mana?',
    tag: 'Fact_Pembayaran × Dim_Waktu(bayar) × Dim_Properti × Dim_Kamar',
    children: [
      panel('Per bulan (Rp)', monthsRev.length ? barChart(monthsRev.map((m) => ({ label: m.periode, value: m.total })), { label: 'Pendapatan per bulan', labelFmt: bulanPendek }) : empty('Tidak ada data')),
      panel('Per properti', d.revenue.byProperty.length ? hBarChart(d.revenue.byProperty.map((p) => ({ label: p.properti, value: p.total })), { label: 'Pendapatan per properti' }) : empty('Tidak ada data')),
      panel('Per kelas tarif kamar', d.revenue.byTariffClass.length ? hBarChart(d.revenue.byTariffClass.map((p) => ({ label: p.kelas, value: p.total })), { label: 'Pendapatan per kelas tarif', cls: 's2' }) : empty('Tidak ada data')),
    ],
  });

  // ---- Q-03 okupansi
  const matrix = occ.matrix.filter((c) => c.persen !== null).map((c) => ({ x: c.periode, y: c.properti, v: c.persen }));
  const q3 = report({
    id: 'Q-03', title: 'Tingkat okupansi',
    question: 'Berapa persen kamar terisi tiap bulan, dan properti mana yang paling sering kosong?',
    tag: 'Fact_Okupansi_Harian × Dim_Waktu × Dim_Properti',
    children: [
      panel('Okupansi per bulan (%)', occ.monthly.length ? lineChart(occ.monthly.map((m) => m.periode), [{ name: 'Okupansi', values: occ.monthly.map((m) => m.persen) }], { fmt: (x) => `${Math.round(x)}%`, max: 100, label: 'Okupansi per bulan' }) : empty('Tidak ada data')),
      panel('Properti × bulan (%)', matrix.length ? heatmap(matrix, { label: 'Okupansi per properti dan bulan' }) : empty('Tidak ada data')),
    ],
  });

  // ---- Q-04 pendapatan hilang
  const lost = d.lostRevenue;
  const q4 = report({
    id: 'Q-04', title: 'Pendapatan hilang',
    question: 'Berapa potensi sewa yang tidak terealisasi karena kamar kosong?',
    tag: 'Fact_Okupansi_Harian (potensi − realisasi)',
    children: [
      panel('Potensi vs realisasi (Rp)', lost.monthly.length ? lineChart(lost.monthly.map((m) => m.periode), [
        { name: 'Potensi', values: lost.monthly.map((m) => m.potensi) },
        { name: 'Realisasi (kontrak terisi)', values: lost.monthly.map((m) => m.realisasi) }], { label: 'Potensi dan realisasi pendapatan' }) : empty('Tidak ada data')),
      panel('Kehilangan per properti', lost.byProperty.length ? hBarChart(lost.byProperty.map((p) => ({ label: p.properti, value: p.hilang })), { label: 'Pendapatan hilang per properti', cls: 's3' }) : empty('Tidak ada data')),
    ],
  });

  // ---- Q-02 keterlambatan
  const late = d.latePayment;
  const q2 = report({
    id: 'Q-02', title: 'Keterlambatan pembayaran',
    question: 'Metode pembayaran apa yang paling sering terlambat, dan apakah membaik dari bulan ke bulan?',
    tag: 'Fact_Pembayaran × Dim_Metode_Pembayaran × Dim_Waktu(jatuh tempo)',
    children: [
      panel('% terlambat per metode', late.byMethod.length ? hBarChart(late.byMethod.map((m) => ({ label: m.metode, value: m.persen_terlambat ?? 0 })), { fmt: (x) => `${angka(x)}%`, max: 100, label: 'Persentase terlambat per metode', cls: 's1' }) : empty('Tidak ada data')),
      panel('% terlambat per bulan jatuh tempo', late.monthly.length ? lineChart(late.monthly.map((m) => m.periode), [{ name: '% terlambat', values: late.monthly.map((m) => m.persen_terlambat) }], { fmt: (x) => `${Math.round(x)}%`, max: 100, label: 'Persentase terlambat per bulan' }) : empty('Tidak ada data')),
      h('div', { style: 'grid-column:1/-1' }, table([
        { key: 'metode', label: 'Metode' },
        { key: 'transaksi', label: 'Transaksi', align: 'right' },
        { key: 'terlambat', label: 'Terlambat', align: 'right' },
        { key: 'persen_terlambat', label: '% terlambat', align: 'right', render: (r) => persen(r.persen_terlambat) },
        { key: 'rerata_hari_terlambat', label: 'Rerata hari (yang terlambat)', align: 'right', render: (r) => angka(r.rerata_hari_terlambat) },
        { key: 'maks_hari', label: 'Maks hari', align: 'right' },
      ], late.byMethod)),
    ],
  });

  // ---- Q-05 pengaduan
  const cm = d.complaints;
  const q5 = report({
    id: 'Q-05', title: 'Penanganan pengaduan',
    question: 'Berapa lama rata-rata pengaduan diselesaikan, dan kategori mana yang paling sering melampaui SLA?',
    tag: 'Fact_Pengaduan × Dim_Kategori_Pengaduan × Dim_Waktu(diajukan/selesai)',
    children: [
      panel('Rata-rata hari sampai selesai', cm.byCategory.some((c) => c.rerata_durasi !== null) ? hBarChart(cm.byCategory.filter((c) => c.rerata_durasi !== null).map((c) => ({ label: c.kategori, value: c.rerata_durasi })), { fmt: (x) => `${angka(x)} hr`, label: 'Rata-rata durasi pengaduan', cls: 's2' }) : empty('Belum ada pengaduan selesai')),
      h('div', null, h('h3', null, 'Rincian kategori'), table([
        { key: 'kategori', label: 'Kategori' },
        { key: 'jumlah', label: 'Jumlah', align: 'right' },
        { key: 'terbuka', label: 'Terbuka', align: 'right' },
        { key: 'sla_hari', label: 'SLA (hr)', align: 'right' },
        { key: 'persen_dalam_sla', label: 'Dalam SLA', align: 'right', render: (r) => (r.persen_dalam_sla === null ? '–' : badge(persen(r.persen_dalam_sla), r.persen_dalam_sla >= 80 ? 'ok' : r.persen_dalam_sla >= 50 ? 'warn' : 'bad')) },
      ], cm.byCategory, { emptyText: 'Tidak ada pengaduan pada periode ini' })),
    ],
  });

  return h('div', null, kpis, q1, q2, q3, q4, q5);
}
