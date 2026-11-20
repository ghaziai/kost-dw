// Service ANALITIK: merangkai hasil query DW menjadi payload dasbor.
// Rasio (okupansi %, % terlambat) selalu dihitung dari JUMLAH ukuran aditif, bukan rata-rata rasio
// (rasio bersifat non-aditif).
import { dw } from '../db.js';
import { analytics } from '../repositories/analytics.js';
import { v } from '../lib/validate.js';
import { badRequest } from '../lib/errors.js';
import { monthStartKey, monthEndKey } from '../lib/dates.js';

const pct = (a, b) => (b > 0 ? Math.round((10000 * a) / b) / 100 : null);

export async function meta(ownerId) {
  const m = await analytics.meta(dw, ownerId);
  return { periodeMin: m.range.periode_min, periodeMax: m.range.periode_max, etlRuns: m.etlRuns };
}

export async function dashboard(ownerId, query) {
  const m = await analytics.meta(dw, ownerId);
  const from = query.from ? v.month(query.from, 'from') : m.range.periode_min;
  const to = query.to ? v.month(query.to, 'to') : m.range.periode_max;
  if (!from || !to) return { empty: true };
  if (from > to) throw badRequest('Periode awal tidak boleh setelah periode akhir');
  const p = {
    ownerId,
    fromKey: monthStartKey(from),
    toKey: monthEndKey(to),
    propertyId: query.propertyId ? v.id(query.propertyId, 'propertyId') : null,
  };

  const [revMonthly, revProp, revClass, occ, lateMethod, lateMonthly, cmpCat, cmpProp] = await Promise.all([
    analytics.revenueMonthly(dw, p), analytics.revenueByProperty(dw, p), analytics.revenueByTariffClass(dw, p),
    analytics.occupancyMonthly(dw, p), analytics.lateByMethod(dw, p), analytics.lateMonthly(dw, p),
    analytics.complaintsByCategory(dw, p), analytics.complaintsByProperty(dw, p),
  ]);

  // --- okupansi & pendapatan hilang: agregasi lintas properti per periode (dari ukuran aditif)
  const byPeriod = new Map();
  const byProperty = new Map();
  for (const r of occ) {
    const a = byPeriod.get(r.periode) ?? { periode: r.periode, hari_terisi: 0, hari_kamar: 0, potensi: 0, realisasi: 0, hilang: 0 };
    a.hari_terisi += r.hari_terisi; a.hari_kamar += r.hari_kamar; a.potensi += r.potensi; a.realisasi += r.realisasi; a.hilang += r.hilang;
    byPeriod.set(r.periode, a);
    const b = byProperty.get(r.properti) ?? { properti: r.properti, hari_terisi: 0, hari_kamar: 0, hilang: 0 };
    b.hari_terisi += r.hari_terisi; b.hari_kamar += r.hari_kamar; b.hilang += r.hilang;
    byProperty.set(r.properti, b);
  }
  const occupancyMonthly = [...byPeriod.values()].map((a) => ({ ...a, persen: pct(a.hari_terisi, a.hari_kamar) }));
  const occupancyByProperty = [...byProperty.values()].map((b) => ({ ...b, persen: pct(b.hari_terisi, b.hari_kamar) }));
  const occupancyMatrix = occ.map((r) => ({
    periode: r.periode, properti: r.properti, persen: pct(r.hari_terisi, r.hari_kamar),
  }));

  // --- KPI ringkas
  const sum = (arr, k) => Math.round(arr.reduce((s, r) => s + (r[k] ?? 0), 0) * 100) / 100;
  const trx = sum(lateMethod, 'transaksi');
  const lateTrx = sum(lateMethod, 'terlambat');
  const resolved = sum(cmpCat, 'selesai');
  const weightedDur = cmpCat.reduce((s, r) => s + (r.rerata_durasi ?? 0) * r.selesai, 0);
  const kpi = {
    pendapatan: sum(revMonthly, 'total'),
    transaksi: sum(revMonthly, 'transaksi'),
    okupansiPersen: pct(sum(occupancyMonthly, 'hari_terisi'), sum(occupancyMonthly, 'hari_kamar')),
    pendapatanHilang: sum(occupancyMonthly, 'hilang'),
    persenTerlambat: pct(lateTrx, trx),
    rerataDurasiPengaduan: resolved ? Math.round((100 * weightedDur) / resolved) / 100 : null,
    pengaduanTerbuka: sum(cmpCat, 'terbuka'),
  };

  return {
    filter: { from, to, propertyId: p.propertyId },
    kpi,
    revenue: { monthly: revMonthly, byProperty: revProp, byTariffClass: revClass },
    occupancy: { monthly: occupancyMonthly, byProperty: occupancyByProperty, matrix: occupancyMatrix },
    lostRevenue: { monthly: occupancyMonthly.map(({ periode, potensi, realisasi, hilang }) => ({ periode, potensi, realisasi, hilang })),
                   byProperty: occupancyByProperty.map(({ properti, hilang }) => ({ properti, hilang })).sort((a, b) => b.hilang - a.hilang) },
    latePayment: { byMethod: lateMethod, monthly: lateMonthly },
    complaints: { byCategory: cmpCat, byProperty: cmpProp },
  };
}
