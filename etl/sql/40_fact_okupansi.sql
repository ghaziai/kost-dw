-- =============================================================================
-- TAHAP 2b : Fact_Okupansi_Harian (POTRET PERIODIK)
-- Grain : satu kamar pada satu hari kalender.
-- Dibangkitkan dari KALENDER x KAMAR (bukan dari baris sumber tertentu); status
-- terisi/kosong diturunkan dari rentang tanggal kontrak (bukan dari status terkini).
-- Jendela [okupansi_from, as_of] dihapus lalu dibangun ulang -> idempoten.
-- =============================================================================

-- @step okupansi_hapus_jendela
DELETE FROM dw.fact_okupansi_harian
 WHERE waktu_key >= to_char(%(okupansi_from)s::date, 'YYYYMMDD')::int;

-- @step okupansi_isi
-- Kontrak boleh berlaku SURUT (mis. kamar baru didaftarkan tanggal 12 tetapi kontraknya mulai tanggal 1).
-- Karena itu versi SCD2 PERTAMA sebuah kamar diperluas ke belakang sampai tanggal mulai kontrak paling awal
-- (CTE rm); tanpa ini hari-hari tersebut hilang dari fakta dan rekonsiliasi okupansi gagal.
WITH rm AS (
  SELECT k.kamar_id,
         min(k.valid_dari) AS first_valid,
         (SELECT min(c.start_date) FROM stg.contracts c WHERE c.room_id = k.kamar_id) AS first_contract
    FROM dw.dim_kamar k
   GROUP BY k.kamar_id)
INSERT INTO dw.fact_okupansi_harian (
  waktu_key, properti_key, kamar_key, penyewa_key, jumlah_kamar, flag_terisi, flag_kosong,
  tarif_harian, potensi_pendapatan, realisasi_pendapatan, pendapatan_hilang, etl_batch_id)
SELECT w.waktu_key,
       dp.properti_key,
       k.kamar_key,                                   -- versi SCD2 yang berlaku pada hari itu
       COALESCE(pn.penyewa_key, 0),                   -- 0 = kamar kosong
       1,
       (c.id IS NOT NULL)::int,
       (c.id IS NULL)::int,
       round(k.tarif_sewa / w.jumlah_hari_bulan, 2),
       round(k.tarif_sewa / w.jumlah_hari_bulan, 2),
       CASE WHEN c.id IS NOT NULL THEN round(c.rent_amount / w.jumlah_hari_bulan, 2) ELSE 0 END,
       CASE WHEN c.id IS NULL THEN round(k.tarif_sewa / w.jumlah_hari_bulan, 2) ELSE 0 END,
       %(batch_id)s
FROM dw.dim_waktu w
CROSS JOIN rm
JOIN dw.dim_kamar k      ON k.kamar_id = rm.kamar_id
                        AND (w.tanggal BETWEEN k.valid_dari AND k.valid_sampai
                             OR (k.valid_dari = rm.first_valid AND w.tanggal < k.valid_dari
                                 AND w.tanggal >= rm.first_contract))
JOIN dw.dim_properti dp  ON dp.properti_id = k.properti_id
LEFT JOIN stg.contracts c ON c.room_id = k.kamar_id AND w.tanggal BETWEEN c.start_date AND c.end_date
LEFT JOIN dw.dim_penyewa pn ON pn.penyewa_id = c.tenant_id
WHERE w.tanggal BETWEEN %(okupansi_from)s::date AND %(as_of)s::date;
