-- =============================================================================
-- DATA WAREHOUSE : baris statis (unknown member) agar kunci asing tidak pernah NULL
-- =============================================================================
SET timezone = 'Asia/Jakarta';

-- Dim_Waktu: 99991231 = "belum terjadi" (mis. pengaduan belum selesai)
INSERT INTO dw.dim_waktu (waktu_key, tanggal, hari, hari_dalam_minggu, nama_hari, minggu_ke,
                          bulan, nama_bulan, kuartal, tahun, periode_bulan, jumlah_hari_bulan, hari_kerja)
VALUES (99991231, DATE '9999-12-31', 31, 5, 'Belum ada', 52, 12, 'Belum ada', 4, 9999, '9999-12', 31, false)
ON CONFLICT (waktu_key) DO NOTHING;

-- Dim_Penyewa: kunci 0 = kamar kosong (dipakai Fact_Okupansi_Harian)
INSERT INTO dw.dim_penyewa (penyewa_key, penyewa_id, nama_lengkap, etl_batch_id)
OVERRIDING SYSTEM VALUE
VALUES (0, 0, '(Kamar kosong)', 0)
ON CONFLICT (penyewa_key) DO NOTHING;

-- Dim_Metode_Pembayaran: kunci 0 = tidak diketahui
INSERT INTO dw.dim_metode_pembayaran (metode_key, kode_metode, nama_metode, kategori_metode)
OVERRIDING SYSTEM VALUE
VALUES (0, 'unknown', 'Tidak diketahui', 'Tidak diketahui')
ON CONFLICT (metode_key) DO NOTHING;
