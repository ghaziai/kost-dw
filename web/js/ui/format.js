const idr = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });
const num = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 });
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

export const rupiah = (n) => (n === null || n === undefined ? '–' : idr.format(n).replace(/\s/g, ' '));
export const rupiahRingkas = (n) => (n === null || n === undefined ? '–' : `Rp ${ringkas(n)}`);
export const angka =(n) => (n === null || n === undefined ? '–' : num.format(n));
export const persen = (n) => (n === null || n === undefined ? '–' : `${num.format(n)}%`);

/** 346800000 -> "346,8 jt"; 1.2e9 -> "1,2 M" (untuk sumbu grafik & kartu KPI). */
export function ringkas(n) {
  if (n === null || n === undefined) return '–';
  const a = Math.abs(n);
  if (a >= 1e9) return `${num.format(n / 1e9)} M`;
  if (a >= 1e6) return `${num.format(n / 1e6)} jt`;
  if (a >= 1e3) return `${num.format(n / 1e3)} rb`;
  return num.format(n);
}

/** '2026-10' atau '2026-10-01' -> 'Okt 2026' */
export function bulan(ym) {
  if (!ym) return '–';
  const [y, m] = String(ym).split('-');
  return `${MONTHS[Number(m) - 1]} ${y}`;
}
export const bulanPendek = (ym) => (ym ? MONTHS[Number(String(ym).split('-')[1]) - 1] : '–');

/** '2026-10-05' -> '5 Okt 2026' (tanpa konversi zona waktu). */
export function tanggal(d) {
  if (!d) return '–';
  const [y, m, day] = String(d).slice(0, 10).split('-');
  return `${Number(day)} ${MONTHS[Number(m) - 1]} ${y}`;
}

/** Timestamp ISO -> '12 Nov 2026, 21.18' (zona Asia/Jakarta). */
export function waktu(ts) {
  if (!ts) return '–';
  return new Date(ts).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export const LABEL = {
  invoice: { unpaid: 'Belum dibayar', paid: 'Lunas', overdue: 'Terlambat', cancelled: 'Dibatalkan' },
  contract: { active: 'Aktif', completed: 'Selesai', terminated: 'Diakhiri' },
  complaint: { open: 'Baru', in_progress: 'Diproses', resolved: 'Selesai' },
  method: { tunai: 'Tunai', transfer_bank: 'Transfer bank', dompet_digital: 'Dompet digital' },
  category: { listrik: 'Listrik', air: 'Air', furnitur: 'Furnitur', kebersihan: 'Kebersihan', keamanan: 'Keamanan', lainnya: 'Lainnya' },
  propertyType: { putra: 'Putra', putri: 'Putri', campur: 'Campur' },
};
export const TONE = {
  unpaid: 'warn', paid: 'ok', overdue: 'bad', cancelled: 'muted',
  active: 'ok', completed: 'muted', terminated: 'bad',
  open: 'warn', in_progress: 'info', resolved: 'ok',
};
