// Katalog kost. Versi PUBLIK tidak memuat kontak pemilik; versi PENYEWA (login) memuatnya.
import { oltp, dw } from '../db.js';
import { catalog, publicAnalytics } from '../repositories/catalog.js';
import { v } from '../lib/validate.js';
import { notFound } from '../lib/errors.js';
import { today } from '../lib/dates.js';

const PRIVATE = ['owner_name', 'owner_phone'];
const strip = (o) => { const c = { ...o }; for (const k of PRIVATE) delete c[k]; return c; };

function filters(query) {
  return {
    q: v.str(query.q, 'Kata kunci', { max: 80, optional: true }),
    city: v.str(query.city, 'Kota', { max: 100, optional: true }),
    type: v.oneOf(query.type, 'Jenis', ['putra', 'putri', 'campur'], { optional: true }),
  };
}

export async function listKost(query, { withContact }) {
  const rows = await catalog.listKost(oltp, today(), filters(query));
  return withContact ? rows : rows.map(strip);
}

export async function getKost(idRaw, { withContact }) {
  const kost = await catalog.getKost(oltp, today(), v.id(idRaw, 'ID kost'));
  if (!kost) throw notFound('Kost tidak ditemukan');
  return withContact ? kost : strip(kost);
}

export const cities = () => catalog.cities(oltp);

// Statistik publik di-cache 60 detik: dibaca banyak pengunjung, berubah lambat.
let cache = { at: 0, key: '', data: null };
const pct = (a, b) => (b > 0 ? Math.round((1000 * a) / b) / 10 : null);

export async function publicStats() {
  const asOf = today();
  if (cache.data && cache.key === asOf && Date.now() - cache.at < 60_000) return cache.data;
  const [y, m] = asOf.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 12, 1)).toISOString().slice(0, 7);
  const [summary, svc, occ] = await Promise.all([
    catalog.summary(oltp, asOf),
    publicAnalytics.service(dw),
    publicAnalytics.occupancyMonthly(dw, Number(start.replace('-', '') + '01'), Number(asOf.slice(0, 7).replace('-', '') + '31')),
  ]);
  const data = {
    asOf,
    summary,
    occupancy: occ.map((o) => ({ periode: o.periode, persen: pct(o.hari_terisi, o.hari_kamar) })),
    service: {
      persenTepatWaktu: svc.pay.transaksi ? pct(svc.pay.transaksi - svc.pay.terlambat, svc.pay.transaksi) : null,
      pengaduan: svc.cmp.jumlah ?? 0,
      pengaduanSelesaiPersen: svc.cmp.jumlah ? pct(svc.cmp.selesai, svc.cmp.jumlah) : null,
      rerataHariSelesai: svc.cmp.rerata_hari,
      persenDalamSla: svc.cmp.persen_sla,
    },
  };
  cache = { at: Date.now(), key: asOf, data };
  return data;
}
