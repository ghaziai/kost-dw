# Pemetaan Teori Workshop Data Warehouse → Implementasi

Dokumen ini menunjukkan **di mana tiap konsep teori muncul di kode** dan **cara membuktikannya** lewat SQL.

## 1. Sumber OLTP (3NF)
7 tabel: `users, properties, rooms, contracts, invoices, payments, complaints` (`db/oltp/01_schema.sql`).

| Konsep | Implementasi |
|---|---|
| Normalisasi 3NF | Tidak ada atribut turunan yang disimpan ganda; relasi lewat FK |
| Integritas | `EXCLUDE USING gist` (kontrak kamar tidak boleh tumpang tindih), *partial unique index* (satu kontrak aktif per penyewa), `UNIQUE(contract_id, period_month)`, `UNIQUE(invoice_id)` pada `payments` |
| Aturan bisnis di DB | fungsi plpgsql `fn_generate_invoices`, `fn_mark_overdue`, `fn_complete_contracts`, `fn_run_billing`, `fn_terminate_contract`, `fn_record_payment` (`db/oltp/02_functions.sql`) |
| Dasar CDC | kolom `updated_at` + trigger `set_updated_at()` + indeks pada tiap tabel; tanpa DELETE transaksi (soft-state) |

## 2. Proses bisnis → laporan (Q-01 … Q-05)
| # | Pertanyaan bisnis | Fakta | Dimensi |
|---|---|---|---|
| Q-01 | Pendapatan diterima per bulan / properti / kelas tarif | `fact_pembayaran` | waktu(bayar), properti, kamar |
| Q-02 | Metode mana paling sering terlambat; tren per bulan | `fact_pembayaran` | metode, waktu(jatuh tempo) |
| Q-03 | Persentase okupansi per bulan & properti | `fact_okupansi_harian` | waktu, properti |
| Q-04 | Pendapatan hilang karena kamar kosong | `fact_okupansi_harian` | waktu, properti |
| Q-05 | Lama penanganan pengaduan & kepatuhan SLA | `fact_pengaduan` | kategori, waktu(diajukan/selesai) |

Dasbor (`web/js/pages/owner/dashboard.js`) menampilkan tag *Fakta × Dimensi* pada tiap laporan.

## 3. Pemodelan dimensional (Kimball 4 langkah)
1. **Proses bisnis:** pembayaran, okupansi, pengaduan.
2. **Grain:** `fact_pembayaran` = satu pembayaran (satu tagihan); `fact_okupansi_harian` = satu kamar × satu hari; `fact_pengaduan` = satu pengaduan.
3. **Dimensi:** 6 dimensi (`dim_waktu, dim_properti, dim_kamar, dim_penyewa, dim_metode_pembayaran, dim_kategori_pengaduan`).
4. **Fakta:** 3 tabel fakta.

### Matriks bus (fakta × dimensi *conformed*)
| | waktu | properti | kamar | penyewa | metode | kategori |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| fact_pembayaran | ✔ (×2 peran) | ✔ | ✔ | ✔ | ✔ | |
| fact_okupansi_harian | ✔ | ✔ | ✔ | ✔ | | |
| fact_pengaduan | ✔ (×3 peran) | ✔ | ✔ | ✔ | | ✔ |

- **Fact constellation (galaxy):** 3 fakta berbagi dimensi → bisa di-*drill across* (mis. properti yang pendapatannya tinggi tetapi pengaduannya lama).
- **Jenis fakta:** `fact_pembayaran` *transaksional*; `fact_okupansi_harian` *periodic snapshot*; `fact_pengaduan` *accumulating snapshot* (tanggal ajukan → tangani → selesai terisi bertahap; `umur_hari` dihitung ulang tiap ETL).
- **Dimensi role-playing:** `dim_waktu` dipakai sebagai `dim_waktu_bayar`, `dim_waktu_jatuh_tempo`, `dim_waktu_diajukan`, `dim_waktu_ditangani`, `dim_waktu_selesai` (view).
- **Degenerate dimension:** `nomor_pembayaran`, `nomor_invoice`, `nomor_kontrak`, `nomor_pengaduan` disimpan langsung di fakta.
- **Unknown member:** `penyewa_key = 0`, `metode_key = 0`, `waktu_key = 99991231` (mis. tanggal selesai pengaduan yang belum selesai) → tidak ada `NULL` di kunci fakta, join tidak kehilangan baris.
- **Aditif vs non-aditif:** ukuran aditif (`nilai_dibayar`, `jumlah_transaksi`, `flag_terisi`, `jumlah_kamar`, `pendapatan_hilang`) dijumlah; **rasio** (okupansi %, % terlambat) dihitung `SUM(pembilang)/SUM(penyebut)` di `server/src/services/analytics.js`, bukan rata-rata rasio.
- **Surrogate key** (`*_key`) terpisah dari *natural/business key* (`*_id`).

### SCD (Slowly Changing Dimension)
| Tipe | Dimensi / atribut | Perilaku |
|---|---|---|
| 0 | `dim_waktu`, `dim_metode`, `dim_kategori` | statis, tidak berubah |
| 1 | nama/alamat properti, nama & telepon penyewa, tipe/deposit kamar | ditimpa (riwayat tidak dipertahankan) |
| **2** | `dim_kamar.tarif_sewa` (dan `kelas_tarif`) | versi baru: `valid_dari`, `valid_sampai`, `baris_aktif`; interval tertutup, fakta memakai versi yang berlaku pada tanggal jatuh tempo (as-of lookup) |

`dim_kamar` adalah hibrida 1+2 dengan 4 langkah SQL berurutan: **A** timpa bila perubahan di hari yang sama, **B** tutup versi lama, **C** sisip versi baru, **D** timpa atribut tipe 1 di semua versi.

## 4. ETL (`etl/`)
| Konsep | Implementasi |
|---|---|
| Extract | Python `COPY` dari OLTP ke `stg.*`; **online extraction** memakai snapshot `REPEATABLE READ READ ONLY` sehingga sumber tetap melayani transaksi |
| **Full vs incremental** | mode `auto`: full bila `etl.watermark` kosong; selain itu incremental |
| **CDC timestamp** | `WHERE updated_at >= watermark` (inklusif → aman dari data yang tertulis di milidetik yang sama; duplikat dibuang oleh upsert idempoten) |
| Staging area | skema `stg` persisten dengan `_batch_id` untuk audit |
| Transform + Load | Native SQL di PostgreSQL (**ELT**): `etl/sql/10…50_*.sql`, urutan **dimensi → fakta** |
| Surrogate key lookup | `LEFT JOIN LATERAL` ke versi dimensi yang berlaku (as-of) |
| Idempoten | `INSERT … ON CONFLICT DO UPDATE … WHERE … IS DISTINCT FROM` → run ulang = 0 baris berubah |
| Atomik | seluruh perubahan DW dalam **satu transaksi**; gagal → rollback, watermark tidak maju |
| Log & audit | `etl.run_log` (mode, waktu, baris diekstrak/dimuat, hasil validasi), `etl_batch_id` di setiap baris DW |
| Data quality | `etl/validate.py`: 13 pemeriksaan rekonsiliasi OLTP↔DW (jumlah, total nilai, tumpang tindih SCD2, konsistensi tarif aktif, …) |
| Pembangunan fakta periodik | okupansi = kalender × kamar × rentang kontrak, jendela hapus-isi hanya untuk hari baru |

## 5. Cara membuktikan (jalankan di `psql -d kost_dw`)
```sql
-- SCD tipe 2: kamar yang tarifnya naik 1 Okt 2026 punya 2 versi
SELECT kamar_id, tarif_sewa, kelas_tarif, valid_dari, valid_sampai, baris_aktif
  FROM dw.dim_kamar WHERE kamar_id IN (SELECT kamar_id FROM dw.dim_kamar GROUP BY 1 HAVING count(*) > 1)
 ORDER BY kamar_id, valid_dari LIMIT 6;

-- Role-playing dimension: 2 peran waktu pada satu fakta
SELECT b.periode_bulan AS bulan_bayar, j.periode_bulan AS bulan_jatuh_tempo, count(*)
  FROM dw.fact_pembayaran f
  JOIN dw.dim_waktu_bayar b ON b.waktu_key = f.waktu_bayar_key
  JOIN dw.dim_waktu_jatuh_tempo j ON j.waktu_key = f.waktu_jatuh_tempo_key
 WHERE b.periode_bulan <> j.periode_bulan GROUP BY 1, 2 ORDER BY 1 DESC LIMIT 5;

-- Unknown member + accumulating snapshot (pengaduan belum selesai)
SELECT nomor_pengaduan, waktu_selesai_key, umur_hari, flag_selesai
  FROM dw.fact_pengaduan WHERE flag_selesai = 0 LIMIT 5;

-- Log ETL
SELECT id, mode, as_of, status, rows_extracted, rows_loaded FROM etl.run_log ORDER BY id;

-- Drill across (3 fakta, dimensi properti yang sama) — pendapatan vs pengaduan per properti
SELECT p.nama_properti, pay.total, pe.jumlah
  FROM dw.dim_properti p
  LEFT JOIN (SELECT properti_key, sum(nilai_dibayar) total FROM dw.fact_pembayaran GROUP BY 1) pay USING (properti_key)
  LEFT JOIN (SELECT properti_key, sum(jumlah_pengaduan) jumlah FROM dw.fact_pengaduan GROUP BY 1) pe USING (properti_key);
```

## 6. Mengapa dasbor tidak real-time?
Dasbor hanya membaca skema `dw`. Transaksi baru di OLTP baru terlihat setelah ETL berikutnya — ini **bukan bug**, melainkan karakter DW: terpisah dari beban OLTP, dimuat per batch, dan konsisten pada titik waktu tertentu (`etl.run_log.as_of`). Status ETL terakhir ditampilkan di atas dasbor.
