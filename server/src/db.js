import fs from 'node:fs';
import os from 'node:os';
import pg from 'pg';
import { config } from './config.js';

// bigint -> Number, numeric -> Number, date -> string 'YYYY-MM-DD' (hindari pergeseran zona waktu)
pg.types.setTypeParser(20, (v) => Number(v));
pg.types.setTypeParser(1700, (v) => parseFloat(v));
pg.types.setTypeParser(1082, (v) => v);

// Bila URL tidak memuat user (mis. postgresql:///kost_oltp untuk Postgres lokal), pakai PGUSER / user OS seperti libpq.
const defaultUser = process.env.PGUSER || os.userInfo().username;
const hasUser = (url) => /^[a-z]+:\/\/[^/@]+@/i.test(url);
// Supabase memakai CA sendiri. Simpan sertifikatnya di certs/supabase-ca.crt (atau set DB_SSL_CA=path).
// Bila ada, koneksi diverifikasi penuh; sslmode dibuang dari URL agar opsi ssl di bawah yang berlaku.
const caPath = process.env.DB_SSL_CA || new URL('../../certs/supabase-ca.crt', import.meta.url);
const ca = fs.existsSync(caPath) ? fs.readFileSync(caPath, 'utf8') : null;
function common(url) {
  const base = { options: '-c timezone=Asia/Jakarta', max: 10 };
  if (ca && /[?&]sslmode=/.test(url)) {
    url = url.replace(/([?&])sslmode=[^&]*&?/, '$1').replace(/[?&]$/, '');
    base.ssl = { ca, rejectUnauthorized: true };
  }
  if (hasUser(url)) return { connectionString: url, ...base };
  // Tanpa user di URL: pecah manual agar user OS dipakai dan soket Unix lokal tetap bisa dipakai.
  const u = new URL(url);
  return {
    ...base,
    user: defaultUser,
    database: decodeURIComponent(u.pathname.slice(1)),
    host: u.hostname || process.env.PGHOST || '/var/run/postgresql',  // kosong = soket Unix lokal (seperti libpq)
    ...(u.port ? { port: Number(u.port) } : {}),
  };
}

/** Pool basis data OLTP (transaksi aplikasi). */
export const oltp = new pg.Pool(common(config.oltpUrl));
/** Pool basis data DW (hanya BACA: lapisan analitik). */
export const dw = new pg.Pool(common(config.dwUrl));

/** Jalankan fn dalam satu transaksi; rollback otomatis bila terjadi error. */
export async function withTx(pool, fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
