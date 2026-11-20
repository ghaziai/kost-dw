-- =============================================================================
-- TAHAP 2c : Fact_Pengaduan (POTRET TERAKUMULASI)
-- Grain : satu pengaduan. Baris dibuat saat pengaduan diajukan, lalu DI-UPDATE setiap
-- kali statusnya berubah (kunci waktu "99991231" = belum terjadi, ukuran NULL = belum diketahui).
-- =============================================================================

-- @step fact_pengaduan
INSERT INTO dw.fact_pengaduan (
  waktu_diajukan_key, waktu_ditangani_key, waktu_selesai_key,
  properti_key, kamar_key, penyewa_key, kategori_key, nomor_pengaduan,
  lag_respons_hari, lag_penyelesaian_hari, total_durasi_hari, umur_hari,
  flag_selesai, flag_dalam_sla, jumlah_pengaduan, etl_batch_id)
SELECT to_char(c.created_at::date, 'YYYYMMDD')::int,
       COALESCE(to_char(c.handled_at::date, 'YYYYMMDD')::int, 99991231),
       COALESCE(to_char(c.resolved_at::date, 'YYYYMMDD')::int, 99991231),
       dpr.properti_key, dk.kamar_key, dp.penyewa_key, kt.kategori_key,
       'CMP-' || lpad(c.id::text, 8, '0'),
       (c.handled_at::date  - c.created_at::date),
       (c.resolved_at::date - c.handled_at::date),
       (c.resolved_at::date - c.created_at::date),
       GREATEST(0, COALESCE(c.resolved_at::date, %(as_of)s::date) - c.created_at::date),
       (c.resolved_at IS NOT NULL)::int,
       (c.resolved_at IS NOT NULL AND (c.resolved_at::date - c.created_at::date) <= kt.sla_hari)::int,
       1, %(batch_id)s
FROM stg.complaints c
JOIN stg.rooms r ON r.id = c.room_id
JOIN dw.dim_properti dpr ON dpr.properti_id = r.property_id
JOIN dw.dim_penyewa  dp  ON dp.penyewa_id  = c.tenant_id
JOIN dw.dim_kategori_pengaduan kt ON kt.kode_kategori = c.category
JOIN LATERAL (
       SELECT k.kamar_key FROM dw.dim_kamar k
        WHERE k.kamar_id = c.room_id
        ORDER BY (c.created_at::date BETWEEN k.valid_dari AND k.valid_sampai) DESC, k.valid_dari ASC
        LIMIT 1
     ) dk ON true
WHERE c._batch_id = %(batch_id)s
ON CONFLICT (nomor_pengaduan) DO UPDATE
   SET waktu_ditangani_key = EXCLUDED.waktu_ditangani_key, waktu_selesai_key = EXCLUDED.waktu_selesai_key,
       lag_respons_hari = EXCLUDED.lag_respons_hari, lag_penyelesaian_hari = EXCLUDED.lag_penyelesaian_hari,
       total_durasi_hari = EXCLUDED.total_durasi_hari, umur_hari = EXCLUDED.umur_hari,
       flag_selesai = EXCLUDED.flag_selesai, flag_dalam_sla = EXCLUDED.flag_dalam_sla,
       etl_batch_id = EXCLUDED.etl_batch_id
 WHERE (dw.fact_pengaduan.waktu_ditangani_key, dw.fact_pengaduan.waktu_selesai_key,
        dw.fact_pengaduan.lag_respons_hari, dw.fact_pengaduan.lag_penyelesaian_hari,
        dw.fact_pengaduan.total_durasi_hari, dw.fact_pengaduan.flag_selesai, dw.fact_pengaduan.flag_dalam_sla)
       IS DISTINCT FROM
       (EXCLUDED.waktu_ditangani_key, EXCLUDED.waktu_selesai_key,
        EXCLUDED.lag_respons_hari, EXCLUDED.lag_penyelesaian_hari,
        EXCLUDED.total_durasi_hari, EXCLUDED.flag_selesai, EXCLUDED.flag_dalam_sla);

-- @step pengaduan_umur_berjalan
-- Umur pengaduan yang masih terbuka bergeser setiap hari (tidak bergantung pada perubahan sumber).
UPDATE dw.fact_pengaduan f
   SET umur_hari = GREATEST(0, %(as_of)s::date - w.tanggal)
  FROM dw.dim_waktu w
 WHERE w.waktu_key = f.waktu_diajukan_key
   AND f.flag_selesai = 0
   AND f.umur_hari IS DISTINCT FROM GREATEST(0, %(as_of)s::date - w.tanggal);
