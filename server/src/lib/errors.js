export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
export const badRequest = (m) => new HttpError(400, m);
export const unauthorized = (m = 'Silakan login terlebih dahulu') => new HttpError(401, m);
export const forbidden = (m = 'Anda tidak berhak mengakses sumber daya ini') => new HttpError(403, m);
export const notFound = (m = 'Data tidak ditemukan') => new HttpError(404, m);
export const conflict = (m) => new HttpError(409, m);

// Pesan ramah untuk pelanggaran batasan basis data (nama constraint -> pesan)
const CONSTRAINT_MESSAGES = {
  users_email_uq: 'Email sudah terdaftar',
  users_phone_uq: 'Nomor telepon sudah terdaftar',
  properties_owner_name_uq: 'Anda sudah memiliki properti dengan nama tersebut',
  rooms_number_uq: 'Nomor kamar sudah dipakai pada properti ini',
  contracts_no_overlap: 'Kamar sudah memiliki kontrak pada rentang tanggal tersebut',
  contracts_one_active_per_tenant: 'Penyewa tersebut masih memiliki kontrak berstatus aktif',
  invoices_contract_period_uq: 'Tagihan periode tersebut sudah ada',
  payments_invoice_uq: 'Tagihan ini sudah dibayar',
};

/** Terjemahkan error PostgreSQL menjadi HttpError bila dikenali. */
export function fromPgError(err) {
  if (!err || typeof err.code !== 'string') return null;
  if (err.code.startsWith('KS')) return new HttpError(Number(err.code.slice(2)) || 400, err.message); // RAISE ... ERRCODE 'KS409'
  if (err.code === '23505' || err.code === '23P01') {
    return conflict(CONSTRAINT_MESSAGES[err.constraint] ?? 'Data bertabrakan dengan data yang sudah ada');
  }
  if (err.code === '23503') return conflict('Data masih dipakai oleh data lain atau referensi tidak valid');
  if (err.code === '23514') return badRequest('Nilai tidak memenuhi aturan data: ' + (err.constraint ?? ''));
  if (err.code === '22P02' || err.code === '22007' || err.code === '22008') return badRequest('Format nilai tidak valid');
  return null;
}
