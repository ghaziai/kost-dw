// Repository KATALOG kost (dibaca publik & penyewa) + statistik publik dari DW.
// Kamar "terisi" bila ada kontrak yang rentangnya mencakup tanggal asOf (sama dengan definisi okupansi di DW).
const BUSY = `EXISTS (SELECT 1 FROM contracts c WHERE c.room_id = r.id AND $1::date BETWEEN c.start_date AND c.end_date)`;

export const catalog = {
  async listKost(db, asOf, { q, city, type }) {
    const { rows } = await db.query(
      `SELECT p.id, p.name, p.property_type, p.address, p.city,
              u.full_name AS owner_name, u.business_name, u.phone AS owner_phone,
              count(r.id)::int AS total_rooms,
              count(r.id) FILTER (WHERE NOT ${BUSY})::int AS available_rooms,
              min(r.price) AS min_price, max(r.price) AS max_price
         FROM properties p
         JOIN users u ON u.id = p.owner_id
         LEFT JOIN rooms r ON r.property_id = p.id
        WHERE ($2::text IS NULL OR p.name ILIKE '%' || $2 || '%' OR p.address ILIKE '%' || $2 || '%' OR p.city ILIKE '%' || $2 || '%')
          AND ($3::text IS NULL OR p.city = $3)
          AND ($4::text IS NULL OR p.property_type = $4)
        GROUP BY p.id, u.id
        ORDER BY available_rooms DESC, p.name`, [asOf, q, city, type]);
    return rows;
  },

  async getKost(db, asOf, id) {
    const { rows } = await db.query(
      `SELECT p.id, p.name, p.property_type, p.address, p.city,
              u.full_name AS owner_name, u.business_name, u.phone AS owner_phone
         FROM properties p JOIN users u ON u.id = p.owner_id WHERE p.id = $1`, [id]);
    if (!rows[0]) return null;
    const rooms = await db.query(
      `SELECT r.id, r.room_number, r.room_type, r.price, r.deposit_amount,
              NOT ${BUSY} AS available,
              (SELECT max(c.end_date) + 1 FROM contracts c
                WHERE c.room_id = r.id AND $1::date BETWEEN c.start_date AND c.end_date) AS free_from
         FROM rooms r WHERE r.property_id = $2 ORDER BY r.room_number`, [asOf, id]);
    return { ...rows[0], rooms: rooms.rows };
  },

  async cities(db) {
    const { rows } = await db.query('SELECT DISTINCT city FROM properties ORDER BY city');
    return rows.map((r) => r.city);
  },

  async summary(db, asOf) {
    const total = await db.query(
      `SELECT count(DISTINCT p.id)::int AS kost, count(r.id)::int AS kamar,
              count(r.id) FILTER (WHERE NOT ${BUSY})::int AS kamar_kosong,
              round(avg(r.price))::float AS rerata_tarif, min(r.price)::float AS tarif_min, max(r.price)::float AS tarif_max
         FROM properties p LEFT JOIN rooms r ON r.property_id = p.id`, [asOf]);
    const byCity = await db.query(
      `SELECT p.city AS kota, count(DISTINCT p.id)::int AS kost, count(r.id)::int AS kamar,
              count(r.id) FILTER (WHERE NOT ${BUSY})::int AS kosong
         FROM properties p LEFT JOIN rooms r ON r.property_id = p.id GROUP BY 1 ORDER BY 3 DESC`, [asOf]);
    const byClass = await db.query(
      `SELECT CASE WHEN r.price < 1500000 THEN 'Ekonomi' WHEN r.price < 2500000 THEN 'Standar' ELSE 'Premium' END AS kelas,
              count(*)::int AS kamar, count(*) FILTER (WHERE NOT ${BUSY})::int AS kosong, round(avg(r.price))::float AS rerata
         FROM rooms r GROUP BY 1 ORDER BY 4`, [asOf]);
    return { ...total.rows[0], byCity: byCity.rows, byClass: byClass.rows };
  },
};

// Statistik PUBLIK dari DW: agregat lintas pemilik, tanpa identitas.
export const publicAnalytics = {
  async occupancyMonthly(db, fromKey, toKey) {
    const { rows } = await db.query(
      `SELECT w.periode_bulan AS periode, sum(f.flag_terisi)::int AS hari_terisi, sum(f.jumlah_kamar)::int AS hari_kamar
         FROM dw.fact_okupansi_harian f JOIN dw.dim_waktu w ON w.waktu_key = f.waktu_key
        WHERE f.waktu_key BETWEEN $1 AND $2 GROUP BY 1 ORDER BY 1`, [fromKey, toKey]);
    return rows;
  },
  async service(db) {
    const pay = await db.query(
      `SELECT sum(jumlah_transaksi)::int AS transaksi, sum(flag_terlambat)::int AS terlambat FROM dw.fact_pembayaran`);
    const cmp = await db.query(
      `SELECT sum(jumlah_pengaduan)::int AS jumlah, sum(flag_selesai)::int AS selesai,
              round(avg(total_durasi_hari), 1)::float AS rerata_hari,
              round(100.0 * sum(flag_dalam_sla) / NULLIF(sum(flag_selesai), 0), 1)::float AS persen_sla
         FROM dw.fact_pengaduan`);
    return { pay: pay.rows[0], cmp: cmp.rows[0] };
  },
};
