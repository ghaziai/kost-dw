# Panduan Migrasi ke Next.js + Supabase

Fondasi dibuat berlapis agar tiap bagian punya padanan langsung di stack tujuan.

## Peta komponen
| Sekarang | Menjadi | Catatan |
|---|---|---|
| `db/oltp/*.sql` | Migrasi Supabase (`supabase/migrations`) | skema `public`; `btree_gist` tersedia di Supabase |
| `users` + `password_hash` | `auth.users` (Supabase Auth) + tabel `profiles(id uuid → auth.users, role, full_name, phone, business_name)` | hapus `scrypt` & token HMAC buatan sendiri |
| `owner_id` scoping di repository | **Row Level Security** | contoh di bawah |
| Fungsi `fn_*` plpgsql | tetap; panggil via `supabase.rpc()` / Server Action; jadwalkan dengan **pg_cron** | `fn_run_billing` harian |
| `server/src/routes` | Route Handlers (`app/api/**/route.ts`) atau Server Actions | handler tipis, sama seperti sekarang |
| `server/src/services` | `lib/services/*.ts` (dipakai Server Actions/Route Handlers) | logika tidak berubah |
| `server/src/repositories` | `lib/repositories/*.ts` memakai `supabase-js` atau `postgres`/Drizzle | SQL dapat dipindah apa adanya |
| `lib/validate.js` | **zod** | bentuk aturan sama (`str/int/money/oneOf/date/month`) |
| `lib/errors.js` (KSxxx → HTTP) | tetap; petakan kode error Postgres dari `rpc()` | |
| `web/js/pages/*` | Server/Client Components di `app/(owner)/…`, `app/(tenant)/…` | halaman = fungsi `render(ctx)` → komponen React |
| `web/js/ui/charts.js` | komponen React SVG yang sama, atau Recharts | data sudah berbentuk siap-grafik |
| `web/js/api.js` | `fetch` ke Route Handlers / panggilan langsung dari Server Component | |

## Database: satu proyek Supabase, beberapa skema
```
public  → 7 tabel OLTP
dw      → dimensi & fakta       (db/dw/01_schema.sql, 02_static_rows.sql)
stg     → staging
etl     → run_log, watermark
```
Skema `dw/stg/etl` **tidak** diekspos ke Data API (Settings → API → *Exposed schemas* hanya `public`). Dasbor membaca DW lewat fungsi `public.analytics_*` (`SECURITY DEFINER`, memfilter `auth.uid()`) atau Route Handler server-side dengan *service role*.

## ETL di Supabase
Pilih salah satu:
1. **SQL-only (disarankan):** karena OLTP dan DW kini satu database, tahap *extract* Python menjadi `INSERT … SELECT` ke `stg.*` (`WHERE updated_at >= watermark`); `etl/sql/*.sql` dipakai apa adanya. Bungkus dalam fungsi `etl.run(p_as_of date)` dan jadwalkan `pg_cron`.
2. **Edge Function** (Deno/TypeScript) yang memanggil `rpc('etl_run')` bila perlu orkestrasi/notifikasi.

Perubahan kecil pada SQL ETL: ganti nama tabel sumber `stg.*` ← `public.*` dan hilangkan parameter `%(batch_id)s` menjadi variabel plpgsql.

## Contoh RLS (pengganti scoping `owner_id`)
```sql
alter table properties enable row level security;
create policy owner_properties on properties
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

alter table rooms enable row level security;
create policy owner_rooms on rooms for all using (
  exists (select 1 from properties p where p.id = rooms.property_id and p.owner_id = auth.uid()));

alter table invoices enable row level security;
create policy tenant_own_invoices on invoices for select using (
  exists (select 1 from contracts c where c.id = invoices.contract_id and c.tenant_id = auth.uid()));
create policy owner_invoices on invoices for select using (
  exists (select 1 from contracts c join rooms r on r.id = c.room_id join properties p on p.id = r.property_id
           where c.id = invoices.contract_id and p.owner_id = auth.uid()));
```
Penulisan (pembayaran, penerbitan tagihan) tetap lewat fungsi `SECURITY DEFINER` yang memeriksa `auth.uid()` sebagai pemilik, seperti parameter `ownerId` sekarang.

## Perubahan tipe kunci
`bigint identity` → boleh tetap, atau `uuid` untuk `profiles.id` (wajib, mengikuti `auth.users`). Jika `users.id` menjadi uuid, ubah kolom FK (`owner_id`, `tenant_id`, `recorded_by`) dan `dim_properti.pemilik_id`, `dim_penyewa.penyewa_id` mengikuti.

## Urutan migrasi yang disarankan
1. Pindahkan skema + fungsi OLTP ke migrasi Supabase; ganti `users` → `profiles` + RLS.
2. Pindahkan skema `dw/stg/etl`; ubah ekstraksi menjadi SQL-only; jadwalkan `pg_cron`.
3. Buat `lib/services` dan `lib/repositories` TypeScript dengan menyalin logika service saat ini (satu file ↔ satu file).
4. Port halaman satu per satu (login → tenant → owner → dasbor). Gunakan `npm run smoke` sebagai daftar periksa perilaku yang harus sama.
5. Pertahankan data seed (`db/seed`) untuk lingkungan staging.

## Hal yang perlu dibenahi saat produksi
Rate limit & lockout login, verifikasi email (Supabase Auth), audit log akses, backup, CDC berbasis log bila perlu menangkap DELETE, serta pengujian otomatis (Vitest + Playwright).
