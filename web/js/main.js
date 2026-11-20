import { api, setUnauthorizedHandler } from './api.js';
import { store } from './store.js';
import { render, resetShell, go } from './router.js';

function logout() {
  store.clear();
  resetShell();
  go('/publik');
  render(logout);
}

setUnauthorizedHandler(logout);
window.addEventListener('hashchange', () => render(logout));

try {
  store.today = (await api.get('/api/meta')).today;
} catch { store.today = new Date().toISOString().slice(0, 10); }

render(logout);
