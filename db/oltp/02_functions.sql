-- =============================================================================
-- OLTP : fungsi bisnis (logika penagihan & pembayaran di dalam database)
-- Ditaruh di database agar (a) atomik, (b) dapat dijadwalkan dengan pg_cron
-- pada Supabase, (c) tidak ikut berubah saat backend ditulis ulang.
-- Kode kesalahan khusus 'KSxxx' dipetakan backend menjadi status HTTP xxx.
-- =============================================================================

SET timezone = 'Asia/Jakarta';

-- ---------------------------------------------------------------------------
-- Terbitkan tagihan bulanan (PB: penagihan periodik).
-- Menerbitkan tagihan untuk setiap bulan kontrak yang sudah tiba (<= p_as_of).
-- Idempoten berkat UNIQUE (contract_id, period_month).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_generate_invoices(
  p_as_of       date,
  p_owner_id    bigint DEFAULT NULL,
  p_contract_id bigint DEFAULT NULL
) RETURNS integer AS $$
DECLARE n integer;
BEGIN
  INSERT INTO invoices (contract_id, period_month, due_date, amount)
  SELECT c.id,
         m.period,
         m.period + (c.due_day - 1),
         c.rent_amount
  FROM contracts c
  JOIN rooms r      ON r.id = c.room_id
  JOIN properties p ON p.id = r.property_id
  CROSS JOIN LATERAL (
    SELECT (date_trunc('month', c.start_date)::date + make_interval(months => i))::date AS period
    FROM generate_series(
      0,
      (EXTRACT(YEAR FROM c.end_date)::int * 12 + EXTRACT(MONTH FROM c.end_date)::int)
      - (EXTRACT(YEAR FROM c.start_date)::int * 12 + EXTRACT(MONTH FROM c.start_date)::int)
    ) AS i
  ) m
  WHERE m.period <= date_trunc('month', p_as_of)::date
    AND (p_owner_id    IS NULL OR p.owner_id = p_owner_id)
    AND (p_contract_id IS NULL OR c.id       = p_contract_id)
  ON CONFLICT (contract_id, period_month) DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- AB-08: tagihan yang lewat jatuh tempo tanpa pembayaran menjadi 'overdue'.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_mark_overdue(p_as_of date, p_owner_id bigint DEFAULT NULL)
RETURNS integer AS $$
DECLARE n integer;
BEGIN
  UPDATE invoices i
     SET status = 'overdue'
    FROM contracts c, rooms r, properties p
   WHERE c.id = i.contract_id AND r.id = c.room_id AND p.id = r.property_id
     AND i.status = 'unpaid'
     AND i.due_date < p_as_of
     AND (p_owner_id IS NULL OR p.owner_id = p_owner_id);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- Kontrak yang masa sewanya sudah lewat menjadi 'completed'.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_complete_contracts(p_as_of date, p_owner_id bigint DEFAULT NULL)
RETURNS integer AS $$
DECLARE n integer;
BEGIN
  UPDATE contracts c
     SET status = 'completed'
    FROM rooms r, properties p
   WHERE r.id = c.room_id AND p.id = r.property_id
     AND c.status = 'active'
     AND c.end_date < p_as_of
     AND (p_owner_id IS NULL OR p.owner_id = p_owner_id);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- Paket penagihan harian (dipanggil tombol "Jalankan penagihan" atau cron).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_run_billing(p_as_of date, p_owner_id bigint DEFAULT NULL)
RETURNS TABLE (invoices_issued integer, invoices_overdue integer, contracts_completed integer) AS $$
BEGIN
  invoices_issued      := fn_generate_invoices(p_as_of, p_owner_id);
  invoices_overdue     := fn_mark_overdue(p_as_of, p_owner_id);
  contracts_completed  := fn_complete_contracts(p_as_of, p_owner_id);
  RETURN NEXT;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- Akhiri kontrak lebih awal. Tagihan bulan setelah tanggal berakhir dibatalkan.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_terminate_contract(p_contract_id bigint, p_owner_id bigint, p_date date)
RETURNS contracts AS $$
DECLARE c contracts;
BEGIN
  SELECT k.* INTO c
    FROM contracts k
    JOIN rooms r ON r.id = k.room_id
    JOIN properties p ON p.id = r.property_id
   WHERE k.id = p_contract_id AND p.owner_id = p_owner_id
   FOR UPDATE OF k;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kontrak tidak ditemukan' USING ERRCODE = 'KS404';
  END IF;
  IF c.status <> 'active' THEN
    RAISE EXCEPTION 'Hanya kontrak berstatus active yang dapat diakhiri' USING ERRCODE = 'KS409';
  END IF;

  UPDATE contracts
     SET status = 'terminated',
         end_date = GREATEST(start_date, LEAST(end_date, p_date))
   WHERE id = p_contract_id
   RETURNING * INTO c;

  UPDATE invoices
     SET status = 'cancelled'
   WHERE contract_id = p_contract_id
     AND status IN ('unpaid', 'overdue')
     AND period_month > date_trunc('month', c.end_date)::date;
  RETURN c;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- Catat pembayaran manual (tunai / transfer yang dikonfirmasi owner).
-- Insert payments + ubah invoice menjadi 'paid' dalam satu transaksi.
-- Status 'paid' tetap dipakai walau terlambat; keterlambatan diukur di DW
-- dari selisih paid_at dan due_date.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_record_payment(
  p_invoice_id bigint,
  p_owner_id   bigint,
  p_method     payment_method,
  p_paid_at    timestamptz,
  p_note       text DEFAULT NULL
) RETURNS payments AS $$
DECLARE inv invoices; pay payments;
BEGIN
  SELECT i.* INTO inv
    FROM invoices i
    JOIN contracts c  ON c.id = i.contract_id
    JOIN rooms r      ON r.id = c.room_id
    JOIN properties p ON p.id = r.property_id
   WHERE i.id = p_invoice_id AND p.owner_id = p_owner_id
   FOR UPDATE OF i;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tagihan tidak ditemukan' USING ERRCODE = 'KS404';
  END IF;
  IF inv.status NOT IN ('unpaid', 'overdue') THEN
    RAISE EXCEPTION 'Tagihan berstatus % tidak dapat dibayar', inv.status USING ERRCODE = 'KS409';
  END IF;

  -- created_at/updated_at = WAKTU PENULISAN (now()), bukan paid_at. Pembayaran yang
  -- dicatat mundur (backdate) tetap terdeteksi CDC karena updated_at selalu maju.
  INSERT INTO payments (invoice_id, amount, method, paid_at, recorded_by, note)
  VALUES (inv.id, inv.amount, p_method, p_paid_at, p_owner_id, p_note)
  RETURNING * INTO pay;

  UPDATE invoices SET status = 'paid' WHERE id = inv.id;
  RETURN pay;
END;
$$ LANGUAGE plpgsql;
