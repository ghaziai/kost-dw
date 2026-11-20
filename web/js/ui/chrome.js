// Elemen kerangka bersama: logo, ikon, dan tombol tema (terang / gelap / sistem).
import { h, s } from './dom.js';

const KEY = 'kostdw.theme';
const MODES = ['system', 'light', 'dark'];
const NAMES = { system: 'Tema: ikuti sistem', light: 'Tema: terang', dark: 'Tema: gelap' };

export function getTheme() {
  try { const t = localStorage.getItem(KEY); return MODES.includes(t) ? t : 'system'; } catch { return 'system'; }
}
export function applyTheme(mode) {
  const root = document.documentElement;
  if (mode === 'system') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', mode);
  try { if (mode === 'system') localStorage.removeItem(KEY); else localStorage.setItem(KEY, mode); } catch { /* abaikan */ }
}

const svg = (paths) => s('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' }, paths.map((d) => s('path', { d })));
export const icons = {
  home: () => svg(['M3 11 12 4l9 7', 'M5 10v10h14V10']),
  bed: () => svg(['M3 18V7', 'M3 14h18v4', 'M21 14v-2a3 3 0 0 0-3-3h-7v5']),
  check: () => svg(['M20 6 9 17l-5-5']),
  coin: () => svg(['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'M9 10h4.5a1.5 1.5 0 0 1 0 3H10.5a1.5 1.5 0 0 0 0 3H15', 'M12 7v2m0 8v2']),
  pin: () => svg(['M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z', 'M12 12a2.4 2.4 0 1 0 0-4.8 2.4 2.4 0 0 0 0 4.8z']),
  chart: () => svg(['M4 20V4', 'M4 20h16', 'M8 16v-5', 'M13 16V8', 'M18 16v-9']),
  star: () => svg(['m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z']),
};
const waIcon = () => s('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' },
  s('path', { d: 'M12 3a9 9 0 0 0-7.8 13.5L3 21l4.6-1.2A9 9 0 1 0 12 3z' }));
export { waIcon };

export function brand() {
  return h('a', { class: 'brand', href: '#/publik', 'aria-label': 'Kost-DW, beranda' },
    h('span', { class: 'brand-mark' }, s('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' }, s('path', { d: 'M5 12 12 6l7 6v7H5z' }))),
    h('span', null, 'Kost', h('b', null, '-DW')));
}

const THEME_ICONS = {
  system: ['M4 5h16v11H4z', 'M9 20h6', 'M12 16v4'],
  light: ['M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z', 'M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4'],
  dark: ['M21 12.8A8.5 8.5 0 1 1 11.2 3 6.7 6.7 0 0 0 21 12.8z'],
};

export function themeButton() {
  const btn = h('button', { class: 'theme-btn', type: 'button' });
  const paint = () => {
    const mode = getTheme();
    btn.replaceChildren(svg(THEME_ICONS[mode]));
    btn.title = `${NAMES[mode]} (klik untuk ganti)`;
    btn.setAttribute('aria-label', btn.title);
  };
  btn.addEventListener('click', () => {
    applyTheme(MODES[(MODES.indexOf(getTheme()) + 1) % MODES.length]);
    paint();
  });
  paint();
  return btn;
}
