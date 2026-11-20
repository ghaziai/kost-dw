import { HttpError, fromPgError } from '../lib/errors.js';

export const notFoundHandler = (req, _res, next) => next(new HttpError(404, `Rute ${req.method} ${req.path} tidak ada`));

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, _req, res, _next) {
  const mapped = err instanceof HttpError ? err : fromPgError(err);
  if (mapped) return res.status(mapped.status).json({ error: mapped.message });
  if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Body JSON tidak valid' });
  console.error(err);
  res.status(500).json({ error: 'Terjadi kesalahan pada server' });
}

/** Bungkus handler async agar error diteruskan ke errorHandler. */
export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
