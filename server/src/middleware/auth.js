import { verifyToken } from '../lib/security.js';
import { forbidden, unauthorized } from '../lib/errors.js';

/** Mengisi req.user = { id, role } dari header Authorization: Bearer <token>. */
export function authenticate(req, _res, next) {
  const header = req.get('authorization') ?? '';
  const payload = header.startsWith('Bearer ') ? verifyToken(header.slice(7)) : null;
  if (!payload) return next(unauthorized());
  req.user = { id: payload.sub, role: payload.role };
  next();
}

export const requireRole = (role) => (req, _res, next) =>
  req.user?.role === role ? next() : next(forbidden(`Hanya untuk peran ${role}`));
