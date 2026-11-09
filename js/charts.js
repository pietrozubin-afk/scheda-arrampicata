// =====================================================================
// charts.js — grafici a linee minimali in SVG (nessuna libreria esterna).
// =====================================================================

function esc(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function shortDate(ts) {
  const d = new Date(ts);
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

/**
 * Grafico a una linea.
 * points: [{ x: timestamp, y: numero, tag?: etichetta sopra il punto }]
 */
export function lineChart(points, { unit = '', color = 'var(--accent)' } = {}) {
  return multiLineChart([{ name: '', color, points }], { unit });
}

/**
 * Grafico a più linee che condividono l'asse X (una colonna per sessione).
 * series: [{ name, color, points: [{ x, y, tag? }] }] — tutte con gli stessi x.
 */
export function multiLineChart(series, { unit = '', integer = false } = {}) {
  const base = series[0]?.points || [];
  if (!base.length) {
    return '<p class="muted chart-empty">Ancora nessun dato: completa qualche sessione.</p>';
  }
  const W = 340, H = 170, padL = 36, padR = 14, padT = 22, padB = 26;
  const ys = series.flatMap(s => s.points.map(p => p.y));
  let min = Math.min(...ys), max = Math.max(...ys);
  if (integer) min = Math.min(0, min);
  if (min === max) { min -= 1; max += 1; }
  const span = max - min;
  if (!integer) { min -= span * 0.15; }
  max += span * 0.15;

  // Asse X per indice (sessioni equidistanti): più leggibile con poche sessioni.
  const n = base.length;
  const X = i => n === 1 ? (padL + W - padR) / 2 : padL + (i * (W - padL - padR)) / (n - 1);
  const Y = v => padT + (1 - (v - min) / (max - min)) * (H - padT - padB);
  const fmt = v => integer ? String(Math.round(v)) : (Math.round(v * 10) / 10).toString();

  const grid = [max, (max + min) / 2, min].map(v =>
    `<line x1="${padL}" x2="${W - padR}" y1="${Y(v)}" y2="${Y(v)}" class="grid"/>` +
    `<text x="${padL - 6}" y="${Y(v) + 4}" text-anchor="end" class="axis">${fmt(v)}</text>`).join('');

  const lines = series.map(s => {
    const path = s.points.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(p.y).toFixed(1)}`).join(' ');
    const dots = s.points.map((p, i) =>
      `<circle cx="${X(i)}" cy="${Y(p.y)}" r="4" fill="${s.color}"/>` +
      (p.tag ? `<text x="${X(i)}" y="${Y(p.y) - 9}" text-anchor="middle" class="tag">${esc(p.tag)}</text>` : '')).join('');
    return `<path d="${path}" fill="none" stroke="${s.color}" stroke-width="2.5" stroke-linejoin="round"/>${dots}`;
  }).join('');

  const xLabels =
    `<text x="${X(0)}" y="${H - 6}" text-anchor="${n === 1 ? 'middle' : 'start'}" class="axis">${shortDate(base[0].x)}</text>` +
    (n > 1 ? `<text x="${X(n - 1)}" y="${H - 6}" text-anchor="end" class="axis">${shortDate(base[n - 1].x)}</text>` : '');

  const legend = series.length > 1
    ? `<div class="legend">${series.map(s => `<span><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join('')}</div>`
    : '';
  const last = series.map(s => `${s.name} ${fmt(s.points[n - 1].y)}`).join(', ');

  return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Grafico, ultimi valori: ${esc(last)} ${esc(unit)}">
    ${grid}${lines}${xLabels}
  </svg>${legend}`;
}
