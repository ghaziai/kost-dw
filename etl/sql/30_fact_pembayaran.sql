-- =============================================================================
-- TAHAP 2a : Fact_Pembayaran (TRANSAKSIONAL)
-- Grain : satu baris per pembayaran (satu tagihan lunas).
-- Incremental: hanya pembayaran yang disentuh batch ini; upsert via nomor_pembayaran.
-- Lookup kamar_key memakai versi SCD2 yang berlaku pada JATUH TEMPO tagihan, sehingga
-- tarif historis tidak "tertimpa" oleh kenaikan tarif berikutnya.
-- =============================================================================

-- @step fact_pembayaran
INSERT INTO dw.fact_pembayaran (
  waktu_bayar_key, waktu_jatuh_tempo_key, penyewa_key, properti_key, kamar_key, metode_key,
  nomor_pembayaran, nomor_invoice, nomor_kontrak, periode_tagihan,
  nilai_tagihan, nilai_dibayar, selisih_pembayaran, hari_keterlambatan, flag_terlambat,
  jumlah_transaksi, etl_batch_id)
SELECT to_char(p.paid_at::date, 'YYYYMMDD')::int,
       to_char(i.due_date, 'YYYYMMDD')::int,
       dp.penyewa_key, dpr.properti_key, dk.kamar_key, COALESCE(dm.metode_key, 0),
       'PAY-' || lpad(p.id::text, 8, '0'),
       'INV-' || lpad(i.id::text, 8, '0'),
       'KTR-' || lpad(c.id::text, 8, '0'),
       to_char(i.period_month, 'YYYY-MM'),
       i.amount, p.amount, p.amount - i.amount,
       GREATEST(0, p.paid_at::date - i.due_date),
       (p.paid_at::date > i.due_date)::int,
       1, %(batch_id)s
FROM stg.payments p
JOIN stg.invoices  i   ON i.id = p.invoice_id
JOIN stg.contracts c   ON c.id = i.contract_id
JOIN stg.rooms     r   ON r.id = c.room_id
JOIN dw.dim_penyewa  dp  ON dp.penyewa_id  = c.tenant_id
JOIN dw.dim_properti dpr ON dpr.properti_id = r.property_id
JOIN LATERAL (
       SELECT k.kamar_key FROM dw.dim_kamar k
        WHERE k.kamar_id = c.room_id
        ORDER BY (i.due_date BETWEEN k.valid_dari AND k.valid_sampai) DESC, k.valid_dari ASC
        LIMIT 1
     ) dk ON true
LEFT JOIN dw.dim_metode_pembayaran dm ON dm.kode_metode = p.method
WHERE p._batch_id = %(batch_id)s
ON CONFLICT (nomor_pembayaran) DO UPDATE
   SET waktu_bayar_key = EXCLUDED.waktu_bayar_key, waktu_jatuh_tempo_key = EXCLUDED.waktu_jatuh_tempo_key,
       penyewa_key = EXCLUDED.penyewa_key, properti_key = EXCLUDED.properti_key, kamar_key = EXCLUDED.kamar_key,
       metode_key = EXCLUDED.metode_key, nilai_tagihan = EXCLUDED.nilai_tagihan,
       nilai_dibayar = EXCLUDED.nilai_dibayar, selisih_pembayaran = EXCLUDED.selisih_pembayaran,
       hari_keterlambatan = EXCLUDED.hari_keterlambatan, flag_terlambat = EXCLUDED.flag_terlambat,
       etl_batch_id = EXCLUDED.etl_batch_id
 WHERE (dw.fact_pembayaran.waktu_bayar_key, dw.fact_pembayaran.waktu_jatuh_tempo_key, dw.fact_pembayaran.penyewa_key,
        dw.fact_pembayaran.properti_key, dw.fact_pembayaran.kamar_key, dw.fact_pembayaran.metode_key,
        dw.fact_pembayaran.nilai_tagihan, dw.fact_pembayaran.nilai_dibayar, dw.fact_pembayaran.hari_keterlambatan)
       IS DISTINCT FROM
       (EXCLUDED.waktu_bayar_key, EXCLUDED.waktu_jatuh_tempo_key, EXCLUDED.penyewa_key,
        EXCLUDED.properti_key, EXCLUDED.kamar_key, EXCLUDED.metode_key,
        EXCLUDED.nilai_tagihan, EXCLUDED.nilai_dibayar, EXCLUDED.hari_keterlambatan);
