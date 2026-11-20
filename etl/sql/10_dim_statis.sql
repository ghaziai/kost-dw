-- =============================================================================
-- TAHAP 1a : dimensi statis / referensi (idempoten, aman dijalankan berulang)
-- Parameter: %(batch_id)s, %(as_of)s, %(okupansi_from)s  (diisi run_etl.py)
-- =============================================================================

-- @step dim_waktu
-- Dim_Waktu tipe 0: dibangkitkan dari kalender (2025-01-01 s.d. 2028-12-31)
INSERT INTO dw.dim_waktu (waktu_key, tanggal, hari, hari_dalam_minggu, nama_hari, minggu_ke, bulan, nama_bulan,
                          kuartal, tahun, periode_bulan, jumlah_hari_bulan, hari_kerja)
SELECT to_char(d, 'YYYYMMDD')::int,
       d,
       EXTRACT(DAY FROM d)::smallint,
       EXTRACT(ISODOW FROM d)::smallint,
       (ARRAY['Senin','Selasa','Rabu','Kamis','Jumat','Sabtu','Minggu'])[EXTRACT(ISODOW FROM d)::int],
       EXTRACT(WEEK FROM d)::smallint,
       EXTRACT(MONTH FROM d)::smallint,
       (ARRAY['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober',
              'November','Desember'])[EXTRACT(MONTH FROM d)::int],
       EXTRACT(QUARTER FROM d)::smallint,
       EXTRACT(YEAR FROM d)::smallint,
       to_char(d, 'YYYY-MM'),
       EXTRACT(DAY FROM (date_trunc('month', d)::date + INTERVAL '1 month' - INTERVAL '1 day'))::smallint,
       EXTRACT(ISODOW FROM d) < 6
FROM (SELECT DATE '2025-01-01' + i AS d FROM generate_series(0, 1460) AS i) cal
ON CONFLICT (waktu_key) DO NOTHING;

-- @step dim_metode
INSERT INTO dw.dim_metode_pembayaran (kode_metode, nama_metode, kategori_metode)
VALUES ('tunai', 'Tunai', 'Tunai'),
       ('transfer_bank', 'Transfer Bank', 'Non-Tunai'),
       ('dompet_digital', 'Dompet Digital', 'Non-Tunai')
ON CONFLICT (kode_metode) DO UPDATE
   SET nama_metode = EXCLUDED.nama_metode, kategori_metode = EXCLUDED.kategori_metode
 WHERE (dw.dim_metode_pembayaran.nama_metode, dw.dim_metode_pembayaran.kategori_metode)
       IS DISTINCT FROM (EXCLUDED.nama_metode, EXCLUDED.kategori_metode);

-- @step dim_kategori
-- Atribut kelompok & SLA tidak ada di OLTP: didefinisikan sebagai data referensi DW.
INSERT INTO dw.dim_kategori_pengaduan (kode_kategori, nama_kategori, kelompok, sla_hari)
VALUES ('listrik',    'Listrik',    'Utilitas',   7),
       ('air',        'Air',        'Utilitas',   3),
       ('furnitur',   'Furnitur',   'Fasilitas', 14),
       ('kebersihan', 'Kebersihan', 'Lingkungan', 3),
       ('keamanan',   'Keamanan',   'Lingkungan', 2),
       ('lainnya',    'Lainnya',    'Lainnya',   14)
ON CONFLICT (kode_kategori) DO UPDATE
   SET nama_kategori = EXCLUDED.nama_kategori, kelompok = EXCLUDED.kelompok, sla_hari = EXCLUDED.sla_hari
 WHERE (dw.dim_kategori_pengaduan.nama_kategori, dw.dim_kategori_pengaduan.kelompok, dw.dim_kategori_pengaduan.sla_hari)
       IS DISTINCT FROM (EXCLUDED.nama_kategori, EXCLUDED.kelompok, EXCLUDED.sla_hari);
