// Klien HTTP tunggal. Semua halaman memanggil API lewat sini (satu titik untuk token & penanganan error).
import { store } from './store.js';

export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

async function request(method, path, { query, body } = {}) {
  const url = new URL(path, location.origin);
  for (const [k, val] of Object.entries(query ?? {})) if (val !== undefined && val !== null && val !== '') url.searchParams.set(k, val);
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (store.token) headers.Authorization = `Bearer ${store.token}`;

  let res;
  try {
    res = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new ApiError(0, 'Tidak dapat terhubung ke server');
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && store.token) onUnauthorized();
    throw new ApiError(res.status, data.error ?? `Permintaan gagal (${res.status})`);
  }
  return data;
}

export const api = {
  get: (path, query) => request('GET', path, { query }),
  post: (path, body) => request('POST', path, { body: body ?? {} }),
  put: (path, body) => request('PUT', path, { body }),
  patch: (path, body) => request('PATCH', path, { body }),
  del: (path) => request('DELETE', path),
};
