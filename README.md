# Kost-DW — Sistem Manajemen Kost + Data Warehouse

Proyek latihan **Workshop Data Warehouse** (non-komersial). Satu aplikasi kecil yang lengkap dari ujung ke ujung:
**OLTP** (aplikasi kost) → **ETL** (Python + Native SQL) → **Data Warehouse** (bintang/konstelasi fakta) → **dasbor analitik**.

| Lapisan | Teknologi | Lokasi |
|---|---|---|
| Frontend | HTML + CSS + JavaScript murni (ES modules, hash-router, grafik SVG buatan sendiri) | `web/` |
| Backend API | Node.js 22 + Express + `pg` (routes → services → repositories) | `server/` |
| OLTP | PostgreSQL 15+ (3NF, constraint, fungsi bisnis plpgsql) | `db/oltp/` |
| ETL | Python 3 + psycopg; transformasi & muat = SQL | `etl/` |
| Data Warehouse | PostgreSQL (skema `dw`, `stg`, `etl`) | `db/dw/` |

## Fitur
**2 peran, 10 fitur inti**

- **Owner:** (1) kelola properti, (2) kelola kamar & ubah tarif, (3) buat/akhiri kontrak, (4) tagihan bulanan otomatis, (5) catat pembayaran manual (tunai/transfer/dompet digital — dikonfirmasi owner, tanpa payment gateway), (6) tangani pengaduan, (7) **dasbor analitik** dengan 5 laporan dari DW.
- **Penyewa:** (8) lihat kontrak, (9) lihat tagihan & riwayat bayar, (10) ajukan & pantau pengaduan.
- Umum: registrasi & login.

**Lapisan data:** 7 tabel OLTP → 3 tabel fakta + 6 dimensi. Detail pemetaan teori ada di [`docs/TEORI_WDW.md`](docs/TEORI_WDW.md).

## Prasyarat
Node.js ≥ 22, Python ≥ 3.10 dengan `psycopg[binary]` (`pip install "psycopg[binary]"`), PostgreSQL ≥ 15 (klien `psql`, `createdb`, `dropdb` harus bisa dipakai oleh user OS Anda).

## Mulai cepat
```bash
npm install
cp .env.example .env            # sesuaikan bila perlu
scripts/demo.sh                 # buat DB + seed + 3x ETL (± 1 menit)
npm start                       # http://localhost:3000
```
Akun demo (password `demo1234`): owner `budi@kost.test` / `siti@kost.test`, penyewa `penyewa01@kost.test` … `penyewaNN@kost.test`.

### Mode Supabase (proyek "Kost", org AIHO GROUP)
Skema OLTP (`public`) + DW (`dw`, `stg`, `etl`) sudah dipasang di proyek Supabase `fooxsvwnaqbfnnqpokht` (RLS aktif tanpa policy, fungsi `fn_*` tidak bisa dipanggil lewat Data API; backend terhubung langsung sebagai `postgres`). Satu database dipakai bersama, jadi `OLTP_DATABASE_URL` = `DW_DATABASE_URL`.
1. `npm install` dan `pip install "psycopg[binary]"`
2. Di `.env`, ganti `[DB-PASSWORD]` pada kedua URL dengan password database Supabase.
3. `scripts/seed_supabase.sh` (seed + 3x ETL; menolak jalan bila `public.users` sudah berisi)
4. `npm start` → http://localhost:3000

`APP_TODAY=2026-11-12` di `.env.example` mengunci "hari ini" aplikasi agar demo konsisten dengan data seed. Hapus barisnya untuk memakai tanggal sebenarnya.

Uji otomatis (server harus berjalan, DB hasil `demo.sh`): `npm run smoke` — 26 pemeriksaan API. Setelah smoke test jalankan `scripts/demo.sh` lagi bila ingin data bersih.

## Beranda publik, katalog kost, dan tema
- **Beranda publik** (`#/publik`, tanpa login): statistik pasar dari DW (okupansi 12 bulan, kamar kosong per kelas tarif, kualitas layanan, agregat lintas pemilik) + daftar kost. Kontak pemilik **tidak** ditampilkan; pengunjung diajak mendaftar. API: `/api/public/*` (statistik di-cache 60 dtk).
- **Penyewa**: setelah daftar langsung ke **Cari kost** (`#/tenant/kost`): semua kost, kamar tersedia, harga, dan kontak pemilik (WhatsApp dengan pesan otomatis / telepon). API: `/api/tenant/kost[/:id]`.
- **Tema** terang / gelap / ikuti sistem lewat tombol di header (disimpan di `localStorage`).
- Keputusan teknologi: tetap Express + JS murni (bukan Next.js) karena hambatan performa ada di query DB, bukan framework; respons digzip (`compression`).
- Koneksi Supabase terverifikasi memakai `certs/supabase-ca.crt` (atau `DB_SSL_CA`).

## Skenario demo untuk presentasi
1. Buka **Dasbor** → catat angka pendapatan & okupansi.
2. Buka **Tagihan** → *Catat bayar* satu tagihan. Kembali ke Dasbor: **angka belum berubah** (DW diperbarui per batch, bukan real-time).
3. Jalankan `scripts/run_etl.sh --as-of 2026-11-12` → refresh Dasbor: angka berubah (incremental load).
4. Buka **Kamar** → ubah tarif satu kamar → ETL lagi → di DW kamar itu punya **dua versi** (SCD tipe 2): pendapatan lama tetap memakai tarif lama.
5. Jalankan ETL sekali lagi: `0 baris` berubah (idempoten).

Pernyataan SQL untuk membuktikannya ada di `docs/TEORI_WDW.md` (bagian *Cara membuktikan*).

## Struktur
```
db/oltp/      01_schema.sql, 02_functions.sql      skema transaksi + fungsi bisnis
db/dw/        01_schema.sql, 02_static_rows.sql    dimensi, fakta, staging, log ETL
db/seed/      data simulasi deterministik          (dibuat oleh scripts/generate_seed.py)
etl/          run_etl.py, validate.py, sql/*.sql   ekstraksi, orkestrasi, transform+muat, rekonsiliasi
server/src/   routes/ services/ repositories/ middleware/ lib/
web/          index.html, css/, js/ (pages/, ui/)
scripts/      setup_db.sh, demo.sh, run_etl.sh, smoke_test.mjs, generate_seed.py
docs/         TEORI_WDW.md, MIGRASI_NEXTJS_SUPABASE.md
```

## Perintah ETL
```bash
scripts/run_etl.sh --as-of 2026-11-12                               # otomatis: full bila watermark kosong, selain itu incremental
scripts/run_etl.sh --mode full --rebuild-okupansi-from 2026-01-01   # bangun ulang
```
Kode keluar: `0` sukses, `1` gagal (rollback, watermark tidak maju), `2` validasi rekonsiliasi gagal.

## Keterbatasan yang disengaja (bahan diskusi)
- CDC berbasis timestamp **tidak menangkap DELETE** dan hanya melihat versi terakhir antara dua run ETL → aplikasi memakai *soft-state* dan ETL sebaiknya dijalankan rutin. Alternatif produksi: CDC log (WAL/Debezium).
- Riwayat tarif sebelum ETL pertama tidak dapat direkonstruksi; SCD2 baru mulai dari run pertama.
- Snapshot okupansi untuk hari yang sudah tertutup tidak dihitung ulang kecuali `--rebuild-okupansi-from`.
- Kontrak yang berlaku **surut** pada kamar yang sudah lama (hari yang sudah dimuat) tidak otomatis dihitung ulang; jalankan `--rebuild-okupansi-from`. Untuk kamar baru, versi pertama `dim_kamar` diperluas ke tanggal kontrak paling awal (lihat komentar di `etl/sql/40_fact_okupansi.sql`).
- Token auth buatan sendiri (HMAC) dan tanpa rate-limit — cukup untuk latihan; ganti dengan Supabase Auth saat migrasi.
