import { config } from '../config.js';

/** "Hari ini" menurut aplikasi (APP_TODAY bila diisi, selain itu tanggal Asia/Jakarta). */
export function today() {
  if (config.appToday) return config.appToday;
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
}

/** Hari terakhir bulan dari 'YYYY-MM' + offset bulan (offset 0 = bulan itu sendiri). */
export function lastDayOfMonth(yyyyMm, plusMonths = 0) {
  const [y, m] = yyyyMm.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + plusMonths + 1, 0));
  return d.toISOString().slice(0, 10);
}

/** Kunci Dim_Waktu (yyyymmdd) untuk awal / akhir bulan 'YYYY-MM'. */
export const monthStartKey = (yyyyMm) => Number(yyyyMm.replace('-', '') + '01');
export const monthEndKey = (yyyyMm) => Number(yyyyMm.replace('-', '') + '31');
