-- =============================================================================
-- TAHAP 1b : dimensi yang bersumber dari OLTP (dibaca dari staging)
-- Dimensi HARUS dimuat sebelum fakta karena fakta membutuhkan kunci pengganti.
-- =============================================================================

-- @step dim_properti
-- Tipe 1 (timpa). Atribut pemilik didenormalisasi; baris ikut diperbarui jika
-- pemilik (stg.users) berubah walau properti-nya sendiri tidak.
INSERT INTO dw.dim_properti (properti_id, nama_properti, jenis_properti, kota, pemilik_id, nama_pemilik,
                             nama_usaha, etl_batch_id)
SELECT p.id, p.name, p.property_type, p.city, p.owner_id, u.full_name, u.business_name, %(batch_id)s
FROM stg.properties p
JOIN stg.users u ON u.id = p.owner_id
WHERE p._batch_id = %(batch_id)s OR u._batch_id = %(batch_id)s
ON CONFLICT (properti_id) DO UPDATE
   SET nama_properti = EXCLUDED.nama_properti, jenis_properti = EXCLUDED.jenis_properti, kota = EXCLUDED.kota,
       pemilik_id = EXCLUDED.pemilik_id, nama_pemilik = EXCLUDED.nama_pemilik, nama_usaha = EXCLUDED.nama_usaha,
       etl_batch_id = EXCLUDED.etl_batch_id, diperbarui_pada = now()
 WHERE (dw.dim_properti.nama_properti, dw.dim_properti.jenis_properti, dw.dim_properti.kota,
        dw.dim_properti.pemilik_id, dw.dim_properti.nama_pemilik, dw.dim_properti.nama_usaha)
       IS DISTINCT FROM
       (EXCLUDED.nama_properti, EXCLUDED.jenis_properti, EXCLUDED.kota,
        EXCLUDED.pemilik_id, EXCLUDED.nama_pemilik, EXCLUDED.nama_usaha);

-- @step dim_penyewa
-- Tipe 1 (timpa). Hanya users berperan tenant. Baris kunci 0 (kamar kosong) sudah ada.
INSERT INTO dw.dim_penyewa (penyewa_id, nama_lengkap, email, telepon, tanggal_bergabung, etl_batch_id)
SELECT u.id, u.full_name, u.email, u.phone, u.created_at::date, %(batch_id)s
FROM stg.users u
WHERE u.role = 'tenant' AND u._batch_id = %(batch_id)s
ON CONFLICT (penyewa_id) DO UPDATE
   SET nama_lengkap = EXCLUDED.nama_lengkap, email = EXCLUDED.email, telepon = EXCLUDED.telepon,
       tanggal_bergabung = EXCLUDED.tanggal_bergabung, etl_batch_id = EXCLUDED.etl_batch_id,
       diperbarui_pada = now()
 WHERE (dw.dim_penyewa.nama_lengkap, dw.dim_penyewa.email, dw.dim_penyewa.telepon, dw.dim_penyewa.tanggal_bergabung)
       IS DISTINCT FROM
       (EXCLUDED.nama_lengkap, EXCLUDED.email, EXCLUDED.telepon, EXCLUDED.tanggal_bergabung);

-- =============================================================================
-- Dim_Kamar : SCD TIPE 2 pada tarif_sewa  (4 langkah, urutan WAJIB)
--   Kunci alami  : kamar_id       Interval : tertutup [valid_dari, valid_sampai]
--   Tanggal berlaku versi baru = tanggal updated_at baris sumber.
-- =============================================================================

-- @step dim_kamar_a_timpa_hari_sama
-- (a) Perubahan tarif pada hari yang sama dengan awal versi aktif: timpa saja,
--     karena menutup versi akan menghasilkan interval terbalik (valid_sampai < valid_dari).
UPDATE dw.dim_kamar d
   SET tarif_sewa = s.price, kelas_tarif = dw.fn_kelas_tarif(s.price),
       etl_batch_id = %(batch_id)s, diperbarui_pada = now()
  FROM stg.rooms s
 WHERE s._batch_id = %(batch_id)s
   AND d.kamar_id = s.id AND d.baris_aktif
   AND d.tarif_sewa IS DISTINCT FROM s.price
   AND d.valid_dari >= s.updated_at::date;

-- @step dim_kamar_b_tutup_versi_lama
-- (b) Tutup versi aktif yang tarifnya berbeda: valid_sampai = sehari sebelum versi baru.
UPDATE dw.dim_kamar d
   SET valid_sampai = s.updated_at::date - 1, baris_aktif = false,
       etl_batch_id = %(batch_id)s, diperbarui_pada = now()
  FROM stg.rooms s
 WHERE s._batch_id = %(batch_id)s
   AND d.kamar_id = s.id AND d.baris_aktif
   AND d.tarif_sewa IS DISTINCT FROM s.price
   AND d.valid_dari < s.updated_at::date;

-- @step dim_kamar_c_sisip_versi_baru
-- (c) Sisipkan versi baru untuk kamar yang tidak lagi punya baris aktif (kamar baru atau
--     baru saja ditutup). Versi pertama kamar berlaku sejak tanggal kamar dibuat.
INSERT INTO dw.dim_kamar (kamar_id, properti_id, nomor_kamar, tipe_kamar, tarif_sewa, kelas_tarif, nilai_deposit,
                          valid_dari, valid_sampai, baris_aktif, etl_batch_id)
SELECT s.id, s.property_id, s.room_number, s.room_type, s.price, dw.fn_kelas_tarif(s.price), s.deposit_amount,
       CASE WHEN EXISTS (SELECT 1 FROM dw.dim_kamar x WHERE x.kamar_id = s.id)
            THEN s.updated_at::date ELSE s.created_at::date END,
       DATE '9999-12-31', true, %(batch_id)s
FROM stg.rooms s
WHERE s._batch_id = %(batch_id)s
  AND NOT EXISTS (SELECT 1 FROM dw.dim_kamar a WHERE a.kamar_id = s.id AND a.baris_aktif);

-- @step dim_kamar_d_atribut_tipe1
-- (d) Atribut yang tidak dipantau SCD2 ditimpa pada SEMUA versi kamar tersebut (hibrida 1+2).
UPDATE dw.dim_kamar d
   SET properti_id = s.property_id, nomor_kamar = s.room_number, tipe_kamar = s.room_type,
       nilai_deposit = s.deposit_amount, etl_batch_id = %(batch_id)s, diperbarui_pada = now()
  FROM stg.rooms s
 WHERE s._batch_id = %(batch_id)s AND d.kamar_id = s.id
   AND (d.properti_id, d.nomor_kamar, d.tipe_kamar, d.nilai_deposit)
       IS DISTINCT FROM (s.property_id, s.room_number, s.room_type, s.deposit_amount);
