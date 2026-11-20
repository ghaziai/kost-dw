// Grafik SVG buatan sendiri (tanpa pustaka). Warna lewat kelas CSS (.s0..s4) sehingga mengikuti mode gelap.
// Setiap titik data punya <title> sebagai tooltip bawaan browser + teks alternatif.
import { s, h } from './dom.js';
import { ringkas, bulanPendek } from './format.js';

const W = 640;
const M = { t: 12, r: 12, b: 28, l: 52 };

function niceMax(v) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

function wrap(svgEl, label, legend) {
  return h('figure', { class: 'chart' },
    legend ? h('div', { class: 'legend' }, legend.map((l, i) => h('span', null, h('i', { class: `sw s${i}` }), l))) : null,
    svgEl,
    h('figcaption', { class: 'sr-only' }, label));
}

function axisY(max, H, fmt, ticks = 4) {
  const g = s('g', { class: 'axis' });
  for (let i = 0; i <= ticks; i++) {
    const val = (max * i) / ticks;
    const y = M.t + (H - M.t - M.b) * (1 - i / ticks);
    g.append(s('line', { x1: M.l, x2: W - M.r, y1: y, y2: y, class: i === 0 ? 'base' : 'grid' }),
      s('text', { x: M.l - 6, y: y + 4, 'text-anchor': 'end' }, fmt(val)));
  }
  return g;
}

/** Diagram batang vertikal. data: [{ label, value }] */
export function barChart(data, { fmt = ringkas, label = 'Diagram batang', height = 220, labelFmt = (x) => x } = {}) {
  const H = height;
  const max = niceMax(Math.max(...data.map((d) => d.value ?? 0), 0));
  const plotW = W - M.l - M.r;
  const slot = plotW / Math.max(data.length, 1);
  const bw = Math.min(44, slot * 0.62);
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': label, preserveAspectRatio: 'xMidYMid meet' }, axisY(max, H, fmt));
  data.forEach((d, i) => {
    const bh = ((H - M.t - M.b) * (d.value ?? 0)) / max;
    const x = M.l + slot * i + (slot - bw) / 2;
    svg.append(
      s('rect', { x, y: H - M.b - bh, width: bw, height: bh, rx: 2, class: 's0' }, s('title', null, `${d.label}: ${fmt(d.value)}`)),
      s('text', { x: x + bw / 2, y: H - 10, 'text-anchor': 'middle', class: 'tick' }, labelFmt(d.label)));
  });
  return wrap(svg, label);
}

/** Diagram garis. series: [{ name, values: [] }], labels: [] */
export function lineChart(labels, series, { fmt = ringkas, label = 'Diagram garis', height = 220, max: fixedMax, labelFmt = bulanPendek } = {}) {
  const H = height;
  const max = fixedMax ?? niceMax(Math.max(...series.flatMap((x) => x.values.map((v) => v ?? 0)), 0));
  const plotW = W - M.l - M.r;
  const step = labels.length > 1 ? plotW / (labels.length - 1) : 0;
  const px = (i) => (labels.length > 1 ? M.l + step * i : M.l + plotW / 2);
  const py = (v) => H - M.b - ((H - M.t - M.b) * (v ?? 0)) / max;
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': label, preserveAspectRatio: 'xMidYMid meet' }, axisY(max, H, fmt));
  labels.forEach((l, i) => svg.append(s('text', { x: px(i), y: H - 10, 'text-anchor': 'middle', class: 'tick' }, labelFmt(l))));
  series.forEach((ser, si) => {
    const pts = ser.values.map((v, i) => (v === null || v === undefined ? null : [px(i), py(v)]));
    const path = pts.reduce((d, p) => (p ? d + `${d && !d.endsWith('M') ? 'L' : 'M'}${p[0]},${p[1]}` : d), '');
    svg.append(s('path', { d: path, class: `line s${si}` }));
    pts.forEach((p, i) => p && svg.append(
      s('circle', { cx: p[0], cy: p[1], r: 3.5, class: `dot s${si}` }, s('title', null, `${ser.name} · ${labels[i]}: ${fmt(ser.values[i])}`))));
  });
  return wrap(svg, label, series.length > 1 ? series.map((x) => x.name) : null);
}

/** Batang horizontal berperingkat. data: [{ label, value, note? }] */
export function hBarChart(data, { fmt = ringkas, label = 'Diagram batang horizontal', max: fixedMax, cls = 's0' } = {}) {
  const rowH = 30;
  const H = Math.max(data.length * rowH + 8, 40);
  const L = 150;
  const max = fixedMax ?? niceMax(Math.max(...data.map((d) => d.value ?? 0), 0));
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': label, preserveAspectRatio: 'xMidYMid meet' });
  data.forEach((d, i) => {
    const y = 4 + i * rowH;
    const bw = ((W - L - 70) * (d.value ?? 0)) / max;
    const name = d.label.length > 22 ? `${d.label.slice(0, 21)}…` : d.label;
    svg.append(
      s('text', { x: L - 8, y: y + 17, 'text-anchor': 'end', class: 'tick' }, name, s('title', null, d.label)),
      s('rect', { x: L, y: y + 4, width: Math.max(bw, 1), height: 18, rx: 2, class: cls }, s('title', null, `${d.label}: ${fmt(d.value)}`)),
      s('text', { x: L + bw + 6, y: y + 17, class: 'tick val' }, fmt(d.value)));
  });
  return wrap(svg, label);
}

/** Heatmap properti × periode. cells: [{ x: periode, y: properti, v: persen }] */
export function heatmap(cells, { label = 'Heatmap okupansi' } = {}) {
  const xs = [...new Set(cells.map((c) => c.x))].sort();
  const ys = [...new Set(cells.map((c) => c.y))].sort();
  const L = 150;
  const cw = Math.min(54, (W - L - 8) / Math.max(xs.length, 1));
  const ch = 28;
  const H = ys.length * ch + 34;
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': label, preserveAspectRatio: 'xMidYMid meet' });
  xs.forEach((x, i) => svg.append(s('text', { x: L + i * cw + cw / 2, y: 14, 'text-anchor': 'middle', class: 'tick' }, bulanPendek(x))));
  ys.forEach((y, j) => {
    svg.append(s('text', { x: L - 8, y: 34 + j * ch + 17, 'text-anchor': 'end', class: 'tick' }, y.length > 22 ? `${y.slice(0, 21)}…` : y));
    xs.forEach((x, i) => {
      const c = cells.find((k) => k.x === x && k.y === y);
      const v = c?.v ?? null;
      // intensitas 0..1 -> kelas 'h0'..'h4' (skala sekuensial satu warna)
      const lvl = v === null ? 'hn' : `h${Math.min(4, Math.floor(v / 20))}`;
      svg.append(
        s('rect', { x: L + i * cw + 1, y: 34 + j * ch + 1, width: cw - 2, height: ch - 2, rx: 3, class: `cell ${lvl}` }, s('title', null, `${y} · ${x}: ${v === null ? 'tidak ada data' : `${v}%`}`)),
        v === null ? null : s('text', { x: L + i * cw + cw / 2, y: 34 + j * ch + 18, 'text-anchor': 'middle', class: `cell-text ${lvl}` }, Math.round(v)));
    });
  });
  return wrap(svg, label);
}
