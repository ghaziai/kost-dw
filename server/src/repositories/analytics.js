// Repository ANALITIK: hanya membaca skema `dw` (bintang/konstelasi fakta), tidak pernah menyentuh OLTP.
// Setiap query: 1 tabel fakta + paling banyak beberapa dimensi (bandingkan dengan 5 join di OLTP).
// Pembatas keamanan: p.pemilik_id = $1 (owner hanya melihat propertinya sendiri).
//
// Parameter bersama:  $1 owner_id | $2 kunci waktu awal (yyyymmdd) | $3 kunci waktu akhir | $4 properti_id (opsional)

const OWNER_RANGE = `p.pemilik_id = $1 AND ($4::bigint IS NULL OR p.properti_id = $4)`;

export const analytics = {
  // ---------------------------------------------------------------- metadata & ETL
  async meta(db, ownerId) {
    const range = await db.query(
      `SELECT min(w.periode_bulan) AS periode_min, max(w.periode_bulan) AS periode_max
         FROM dw.fact_okupansi_harian f
         JOIN dw.dim_waktu w ON w.waktu_key = f.waktu_key
         JOIN dw.dim_properti p ON p.properti_key = f.properti_key
        WHERE p.pemilik_id = $1`, [ownerId]);
    const etl = await db.query(
      `SELECT id, mode, as_of, started_at, finished_at, status, rows_extracted, rows_loaded, validation
         FROM etl.run_log ORDER BY id DESC LIMIT 5`);
    return { range: range.rows[0], etlRuns: etl.rows };
  },

  // ---------------------------------------------------------------- Q-01 / Q-06 pendapatan (Fact_Pembayaran)
  async revenueMonthly(db, p) {
    const { rows } = await db.query(
      `SELECT w.periode_bulan AS periode, sum(f.nilai_dibayar) AS total, sum(f.jumlah_transaksi)::int AS transaksi
         FROM dw.fact_pembayaran f
         JOIN dw.dim_waktu_bayar w ON w.waktu_key = f.waktu_bayar_key
         JOIN dw.dim_properti p ON p.properti_key = f.properti_key
        WHERE ${OWNER_RANGE} AND f.waktu_bayar_key BETWEEN $2 AND $3
        GROUP BY 1 ORDER BY 1`, [p.ownerId, p.fromKey, p.toKey, p.propertyId]);
    return rows;
  },
  async revenueByProperty(db, p) {
    const { rows } = await db.query(
      `SELECT p.nama_properti AS properti, p.kota, sum(f.nilai_dibayar) AS total, sum(f.jumlah_transaksi)::int AS transaksi
         FROM dw.fact_pembayaran f
         JOIN dw.dim_properti p ON p.properti_key = f.properti_key
        WHERE ${OWNER_RANGE} AND f.waktu_bayar_key BETWEEN $2 AND $3
        GROUP BY 1, 2 ORDER BY 3 DESC`, [p.ownerId, p.fromKey, p.toKey, p.propertyId]);
    return rows;
  },
  async revenueByTariffClass(db, p) {
    const { rows } = await db.query(
      `SELECT k.kelas_tarif AS kelas, sum(f.nilai_dibayar) AS total, sum(f.jumlah_transaksi)::int AS transaksi
         FROM dw.fact_pembayaran f
         JOIN dw.dim_kamar k ON k.kamar_key = f.kamar_key
         JOIN dw.dim_properti p ON p.properti_key = f.properti_key
        WHERE ${OWNER_RANGE} AND f.waktu_bayar_key BETWEEN $2 AND $3
        GROUP BY 1 ORDER BY 2 DESC`, [p.ownerId, p.fromKey, p.toKey, p.propertyId]);
    return rows;
  },

  // ---------------------------------------------------------------- Q-03 / Q-04 okupansi (Fact_Okupansi_Harian)
  async occupancyMonthly(db, p) {
    const { rows } = await db.query(
      `SELECT w.periode_bulan AS periode, p.properti_id, p.nama_properti AS properti,
              sum(f.flag_terisi)::int AS hari_terisi, sum(f.jumlah_kamar)::int AS hari_kamar,
              sum(f.potensi_pendapatan) AS potensi, sum(f.realisasi_pendapatan) AS realisasi,
              sum(f.pendapatan_hilang) AS hilang
         FROM dw.fact_okupansi_harian f
         JOIN dw.dim_waktu w ON w.waktu_key = f.waktu_key
         JOIN dw.dim_properti p ON p.properti_key = f.properti_key
        WHERE ${OWNER_RANGE} AND f.waktu_key BETWEEN $2 AND $3
        GROUP BY 1, 2, 3 ORDER BY 1, 3`, [p.ownerId, p.fromKey, p.toKey, p.propertyId]);
    return rows;
  },

  // ---------------------------------------------------------------- Q-02 keterlambatan per metode (Fact_Pembayaran)
  async lateByMethod(db, p) {
    const { rows } = await db.query(
      `SELECT m.nama_metode AS metode, m.kategori_metode AS kategori,
              sum(f.jumlah_transaksi)::int AS transaksi, sum(f.flag_terlambat)::int AS terlambat,
              round(100.0 * sum(f.flag_terlambat) / NULLIF(sum(f.jumlah_transaksi), 0), 1) AS persen_terlambat,
              round(avg(f.hari_keterlambatan), 2) AS rerata_hari_semua,
              round(avg(f.hari_keterlambatan) FILTER (WHERE f.flag_terlambat = 1), 2) AS rerata_hari_terlambat,
              max(f.hari_keterlambatan) AS maks_hari
         FROM dw.fact_pembayaran f
         JOIN dw.dim_metode_pembayaran m ON m.metode_key = f.metode_key
         JOIN dw.dim_properti p ON p.properti_key = f.properti_key
        WHERE ${OWNER_RANGE} AND f.waktu_bayar_key BETWEEN $2 AND $3
        GROUP BY 1, 2 ORDER BY 5 DESC NULLS LAST`, [p.ownerId, p.fromKey, p.toKey, p.propertyId]);
    return rows;
  },
  async lateMonthly(db, p) {
    const { rows } = await db.query(
      `SELECT w.periode_bulan AS periode, sum(f.jumlah_transaksi)::int AS transaksi, sum(f.flag_terlambat)::int AS terlambat,
              round(100.0 * sum(f.flag_terlambat) / NULLIF(sum(f.jumlah_transaksi), 0), 1) AS persen_terlambat
         FROM dw.fact_pembayaran f
         JOIN dw.dim_waktu_jatuh_tempo w ON w.waktu_key = f.waktu_jatuh_tempo_key
         JOIN dw.dim_properti p ON p.properti_key = f.properti_key
        WHERE ${OWNER_RANGE} AND f.waktu_jatuh_tempo_key BETWEEN $2 AND $3
        GROUP BY 1 ORDER BY 1`, [p.ownerId, p.fromKey, p.toKey, p.propertyId]);
    return rows;
  },

  // ---------------------------------------------------------------- Q-05 lama penanganan pengaduan (Fact_Pengaduan)
  async complaintsByCategory(db, p) {
    const { rows } = await db.query(
      `SELECT kt.nama_kategori AS kategori, kt.kelompok, kt.sla_hari,
              sum(f.jumlah_pengaduan)::int AS jumlah, sum(f.flag_selesai)::int AS selesai,
              (sum(f.jumlah_pengaduan) - sum(f.flag_selesai))::int AS terbuka,
              round(avg(f.lag_respons_hari), 2) AS rerata_respons,
              round(avg(f.total_durasi_hari), 2) AS rerata_durasi,
              round(100.0 * sum(f.flag_dalam_sla) / NULLIF(sum(f.flag_selesai), 0), 1) AS persen_dalam_sla
         FROM dw.fact_pengaduan f
         JOIN dw.dim_kategori_pengaduan kt ON kt.kategori_key = f.kategori_key
         JOIN dw.dim_properti p ON p.properti_key = f.properti_key
        WHERE ${OWNER_RANGE} AND f.waktu_diajukan_key BETWEEN $2 AND $3
        GROUP BY 1, 2, 3 ORDER BY 8 DESC NULLS LAST`, [p.ownerId, p.fromKey, p.toKey, p.propertyId]);
    return rows;
  },
  async complaintsByProperty(db, p) {
    const { rows } = await db.query(
      `SELECT p.nama_properti AS properti, sum(f.jumlah_pengaduan)::int AS jumlah, sum(f.flag_selesai)::int AS selesai,
              round(avg(f.total_durasi_hari), 2) AS rerata_durasi,
              (sum(f.jumlah_pengaduan) - sum(f.flag_selesai))::int AS terbuka
         FROM dw.fact_pengaduan f
         JOIN dw.dim_properti p ON p.properti_key = f.properti_key
        WHERE ${OWNER_RANGE} AND f.waktu_diajukan_key BETWEEN $2 AND $3
        GROUP BY 1 ORDER BY 1`, [p.ownerId, p.fromKey, p.toKey, p.propertyId]);
    return rows;
  },
};
