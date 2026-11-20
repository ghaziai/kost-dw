import { oltp } from '../db.js';
import { users } from '../repositories/oltp.js';
import { hashPassword, verifyPassword, signToken } from '../lib/security.js';
import { v } from '../lib/validate.js';
import { HttpError, unauthorized } from '../lib/errors.js';

const publicUser = (u) => ({
  id: u.id, role: u.role, full_name: u.full_name, email: u.email, phone: u.phone, business_name: u.business_name,
});

export async function register(body) {
  const role = v.oneOf(body.role ?? 'tenant', 'Peran', ['tenant', 'owner']);
  const password = v.str(body.password, 'Password', { min: 8, max: 100 });
  const user = await users.create(oltp, {
    role,
    full_name: v.str(body.full_name, 'Nama lengkap', { min: 3, max: 150 }),
    email: v.email(body.email),
    phone: v.str(body.phone, 'Telepon', { min: 8, max: 20 }),
    password_hash: hashPassword(password),
    business_name: role === 'owner' ? v.str(body.business_name, 'Nama usaha', { max: 150, optional: true }) : null,
  });
  return { token: signToken({ sub: user.id, role: user.role }), user: publicUser(user) };
}

export async function login(body) {
  const email = v.email(body.email);
  const password = v.str(body.password, 'Password', { max: 100 });
  const user = await users.findByEmail(oltp, email);
  if (!user || !verifyPassword(password, user.password_hash)) throw unauthorized('Email atau password salah');
  return { token: signToken({ sub: user.id, role: user.role }), user: publicUser(user) };
}

export async function me(userId) {
  const user = await users.findById(oltp, userId);
  if (!user) throw new HttpError(401, 'Akun tidak ditemukan');
  return publicUser(user);
}
