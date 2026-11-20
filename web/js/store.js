// Penyimpanan sesi. localStorage dibungkus try/catch (bisa gagal di mode privat); fallback ke memori.
const KEY = 'kostdw.session';
let memory = null;

function read() {
  try { return JSON.parse(localStorage.getItem(KEY)); } catch { return memory; }
}

export const store = {
  today: null,                       // tanggal "hari ini" aplikasi (dari /api/meta)
  get session() { return read() ?? memory; },
  get user() { return this.session?.user ?? null; },
  get token() { return this.session?.token ?? null; },
  save(session) {
    memory = session;
    try { localStorage.setItem(KEY, JSON.stringify(session)); } catch { /* abaikan */ }
  },
  clear() {
    memory = null;
    try { localStorage.removeItem(KEY); } catch { /* abaikan */ }
  },
};
