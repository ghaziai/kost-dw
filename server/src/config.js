// Konfigurasi aplikasi (dibaca dari environment; lihat .env.example)
export const config = {
  port: Number(process.env.PORT ?? 3000),
  oltpUrl: process.env.OLTP_DATABASE_URL ?? 'postgresql:///kost_oltp',
  dwUrl: process.env.DW_DATABASE_URL ?? 'postgresql:///kost_dw',
  tokenSecret: process.env.TOKEN_SECRET ?? 'ganti-secret-ini-sebelum-dipakai',
  tokenTtlSeconds: 8 * 60 * 60,
  // Tanggal "hari ini" aplikasi. Isi APP_TODAY=YYYY-MM-DD untuk simulasi/demo.
  appToday: process.env.APP_TODAY || null,
};
