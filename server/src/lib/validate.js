import { badRequest } from './errors.js';

// Validator kecil tanpa dependensi. (Di Next.js dapat diganti dengan zod.)
export const v = {
  str(value, name, { min = 1, max = 255, optional = false } = {}) {
    if (value === undefined || value === null || value === '') {
      if (optional) return null;
      throw badRequest(`${name} wajib diisi`);
    }
    const s = String(value).trim();
    if (s.length < min) throw badRequest(`${name} minimal ${min} karakter`);
    if (s.length > max) throw badRequest(`${name} maksimal ${max} karakter`);
    return s;
  },
  int(value, name, { min = -Infinity, max = Infinity, optional = false } = {}) {
    if (value === undefined || value === null || value === '') {
      if (optional) return null;
      throw badRequest(`${name} wajib diisi`);
    }
    const n = Number(value);
    if (!Number.isInteger(n) || n < min || n > max) throw badRequest(`${name} harus bilangan bulat ${min}..${max}`);
    return n;
  },
  money(value, name, { optional = false, allowZero = false } = {}) {
    if (value === undefined || value === null || value === '') {
      if (optional) return null;
      throw badRequest(`${name} wajib diisi`);
    }
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0 || (!allowZero && n === 0) || n > 1e11) throw badRequest(`${name} tidak valid`);
    return Math.round(n * 100) / 100;
  },
  oneOf(value, name, options, { optional = false } = {}) {
    if (value === undefined || value === null || value === '') {
      if (optional) return null;
      throw badRequest(`${name} wajib diisi`);
    }
    if (!options.includes(value)) throw badRequest(`${name} harus salah satu dari: ${options.join(', ')}`);
    return value;
  },
  email(value) {
    const s = v.str(value, 'Email', { max: 150 }).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) throw badRequest('Format email tidak valid');
    return s;
  },
  date(value, name, { optional = false } = {}) {
    if (value === undefined || value === null || value === '') {
      if (optional) return null;
      throw badRequest(`${name} wajib diisi`);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) {
      throw badRequest(`${name} harus berformat YYYY-MM-DD`);
    }
    return value;
  },
  month(value, name, { optional = false } = {}) {
    if (value === undefined || value === null || value === '') {
      if (optional) return null;
      throw badRequest(`${name} wajib diisi`);
    }
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) throw badRequest(`${name} harus berformat YYYY-MM`);
    return value;
  },
  id(value, name = 'ID') {
    return v.int(value, name, { min: 1 });
  },
};
