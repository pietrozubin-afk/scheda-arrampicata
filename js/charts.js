// =====================================================================
// charts.js — grafico a linee minimale in SVG (nessuna libreria esterna).
// =====================================================================

function esc(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function shortDate(ts) {
  const d = new Date(ts);
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

/**
 * points: [{ x: timestamp, y: numero, tag?: etichetta sopra il punto }]
 * Ritorna una stringa SVG.
 */
export function lineChart(points, { unit = '', color = 'var(--accent)' } = {}) {
  if (!points.length) {
    return '<p class="muted chart-empty">Ancora nessun dato: completa qualche sessione.</p>';
  }
  const W = 340, H = 170, padL = 36, padR = 14, padT = 22, padB = 26;
  const ys = points.map(p => p.y);
  let min = Math.min(...ys), max = Math.max(...ys);
  if (min === max) { min -= 1; max += 1; }
  const span = max - min;
  min -= span * 0.15; max += span * 0.15;

  // Asse X per indice (sessioni equidistanti): più leggibile con poche sessioni.
  const n = points.length;
  const X = i => n === 1 ? (padL + W - padR) / 2 : padL + (i * (W - padL - padR)) / (n - 1);
  const Y = v => padT + (1 - (v - min) / (max - min)) * (H - padT - padB);

  const path = points.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(p.y).toFixed(1)}`).join(' ');
  const fmt = v => (Math.round(v * 10) / 10).toString();

  const grid = [max, (max + min) / 2, min].map(v =>
    `<line x1="${padL}" x2="${W - padR}" y1="${Y(v)}" y2="${Y(v)}" class="grid"/>` +
    `<text x="${padL - 6}" y="${Y(v) + 4}" text-anchor="end" class="axis">${fmt(v)}</text>`).join('');

  const dots = points.map((p, i) =>
    `<circle cx="${X(i)}" cy="${Y(p.y)}" r="4" fill="${color}"/>` +
    (p.tag ? `<text x="${X(i)}" y="${Y(p.y) - 9}" text-anchor="middle" class="tag">${esc(p.tag)}</text>` : '')).join('');

  const first = points[0], last = points[n - 1];
  const xLabels =
    `<text x="${X(0)}" y="${H - 6}" text-anchor="${n === 1 ? 'middle' : 'start'}" class="axis">${shortDate(first.x)}</text>` +
    (n > 1 ? `<text x="${X(n - 1)}" y="${H - 6}" text-anchor="end" class="axis">${shortDate(last.x)}</text>` : '');

  return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Grafico, ultimo valore ${fmt(last.y)} ${esc(unit)}">
    ${grid}
    <path d="${path}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round"/>
    ${dots}${xLabels}
  </svg>`;
}
