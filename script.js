/* ================================================================
   Expense Analyzer — script.js
   Modular Vanilla JS: data loading, filtering, KPIs, charts, insights
   ================================================================ */

'use strict';

/* ────────────────────────────────────────────────────────────────
   § 1. CONSTANTS & CONFIG
   ──────────────────────────────────────────────────────────────── */

/** Category display configuration */
const CAT_CONFIG = {
  'Makanan':      { color: '#f59e0b', icon: '🍜', cssClass: 'makanan' },
  'Transportasi': { color: '#3b82f6', icon: '🚌', cssClass: 'transportasi' },
  'Tagihan':      { color: '#0ea5e9', icon: '💡', cssClass: 'tagihan' },
  'Hiburan':      { color: '#ec4899', icon: '🎬', cssClass: 'hiburan' },
  'Belanja':      { color: '#f97316', icon: '🛍️', cssClass: 'belanja' },
  'Pendidikan':   { color: '#8b5cf6', icon: '📚', cssClass: 'pendidikan' },
  'Kesehatan':    { color: '#10b981', icon: '💊', cssClass: 'kesehatan' },
};

/** Month names in Indonesian */
const MONTH_ID = ['Januari','Februari','Maret','April','Mei','Juni',
                  'Juli','Agustus','September','Oktober','November','Desember'];

/** Chart.js global defaults */
Chart.defaults.font.family = "'Inter', -apple-system, 'Segoe UI', system-ui, sans-serif";
Chart.defaults.font.size   = 12;
Chart.defaults.color       = '#64748b';

/* ────────────────────────────────────────────────────────────────
   § 2. STATE
   ──────────────────────────────────────────────────────────────── */

/** Application state — all mutable data lives here */
const state = {
  raw:       [],   // all 200 transactions from JSON
  filtered:  [],   // transactions after applying filters
  meta:      {},   // owner info from JSON
  charts:    {},   // Chart.js instances (keyed by id)
};

/* ────────────────────────────────────────────────────────────────
   § 3. FORMATTERS
   ──────────────────────────────────────────────────────────────── */

/**
 * Format a number as Indonesian Rupiah.
 * @param {number} n
 * @returns {string}  e.g. "Rp 1.250.000"
 */
function fmtRupiah(n) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency', currency: 'IDR', maximumFractionDigits: 0
  }).format(n);
}

/**
 * Format a date string (YYYY-MM-DD) to Indonesian long format.
 * @param {string} d
 * @returns {string}  e.g. "15 Jul 2026"
 */
function fmtDate(d) {
  return new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

/**
 * Return "Mei 2026" from "2026-05".
 */
function fmtMonthKey(ym) {
  const [y, m] = ym.split('-');
  return MONTH_ID[parseInt(m, 10) - 1] + ' ' + y;
}

/* ────────────────────────────────────────────────────────────────
   § 4. DATA LOADING
   ──────────────────────────────────────────────────────────────── */

/**
 * Fetch and parse expenses.json, then boot the app.
 */
async function loadData() {
  try {
    const res  = await fetch('./expenses.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();

    state.meta = json.meta;
    state.raw  = json.expenses.map(e => ({
      ...e,
      _date: new Date(e.date),           // pre-parsed Date for comparisons
      _ym:   e.date.slice(0, 7),         // "2026-05" — year-month key
    }));

    bootApp();
  } catch (err) {
    console.error('[ExpenseAnalyzer] Failed to load data:', err);
    showErrorBanner();
  }
}

/* ────────────────────────────────────────────────────────────────
   § 5. FILTER ENGINE
   ──────────────────────────────────────────────────────────────── */

/**
 * Read current filter values from the DOM and return a filter object.
 */
function getFilters() {
  return {
    category:      document.getElementById('f-category').value,
    paymentMethod: document.getElementById('f-payment').value,
    dateFrom:      document.getElementById('f-date-from').value,   // "YYYY-MM-DD"
    dateTo:        document.getElementById('f-date-to').value,
  };
}

/**
 * Apply current filters to state.raw → state.filtered.
 * Called on every filter change.
 */
function applyFilters() {
  const f = getFilters();

  state.filtered = state.raw.filter(e => {
    if (f.category      && e.category       !== f.category)      return false;
    if (f.paymentMethod && e.payment_method !== f.paymentMethod) return false;
    if (f.dateFrom      && e.date < f.dateFrom)                  return false;
    if (f.dateTo        && e.date > f.dateTo)                    return false;
    return true;
  });
}

/**
 * Reset all filter inputs to their default (empty) state.
 */
function resetFilters() {
  ['f-category','f-payment','f-date-from','f-date-to'].forEach(id => {
    document.getElementById(id).value = '';
  });
  applyFilters();
  renderAll();
  showToast('Filter direset.');
}

/* ────────────────────────────────────────────────────────────────
   § 6. AGGREGATION HELPERS
   ──────────────────────────────────────────────────────────────── */

/** Sum all amounts in a transaction array. */
const sumAmount = arr => arr.reduce((s, e) => s + e.amount, 0);

/** Group transactions by a key-returning function. Returns { key: [tx, …] } */
function groupBy(arr, keyFn) {
  return arr.reduce((acc, e) => {
    const k = keyFn(e);
    (acc[k] = acc[k] || []).push(e);
    return acc;
  }, {});
}

/** Return sorted [ [key, total], … ] by total descending. */
function sortedTotals(groupObj) {
  return Object.entries(groupObj)
    .map(([k, v]) => [k, sumAmount(v)])
    .sort((a, b) => b[1] - a[1]);
}

/* ────────────────────────────────────────────────────────────────
   § 7. KPI RENDERING
   ──────────────────────────────────────────────────────────────── */

function renderKPIs() {
  const data  = state.filtered;
  const total = sumAmount(data);

  // KPI 1 — Total Pengeluaran
  document.getElementById('kpi-total').textContent = fmtRupiah(total);

  // KPI 2 — Rata-rata per Hari
  const uniqueDays = new Set(data.map(e => e.date)).size;
  const daily      = uniqueDays > 0 ? total / uniqueDays : 0;
  document.getElementById('kpi-daily').textContent = fmtRupiah(Math.round(daily));

  // KPI 3 — Kategori Terbesar
  const catGroup   = groupBy(data, e => e.category);
  const catSorted  = sortedTotals(catGroup);
  if (catSorted.length > 0) {
    const [topCat, topAmt] = catSorted[0];
    const m = CAT_CONFIG[topCat] || {};
    document.getElementById('kpi-top-cat').textContent      = `${m.icon || ''} ${topCat}`;
    document.getElementById('kpi-top-cat-sub').textContent  = fmtRupiah(topAmt);
  } else {
    document.getElementById('kpi-top-cat').textContent     = '—';
    document.getElementById('kpi-top-cat-sub').textContent = '';
  }

  // KPI 4 — Jumlah Transaksi
  document.getElementById('kpi-count').textContent = data.length;
}

/* ────────────────────────────────────────────────────────────────
   § 8. CHART HELPERS
   ──────────────────────────────────────────────────────────────── */

/**
 * Safely destroy an existing Chart.js instance before re-creating.
 * @param {string} id  - key in state.charts
 */
function destroyChart(id) {
  if (state.charts[id]) {
    state.charts[id].destroy();
    state.charts[id] = null;
  }
}

/** Shared tooltip callback for Rupiah values. */
const rupiahTooltip = {
  callbacks: {
    label: ctx => ` ${fmtRupiah(ctx.raw ?? ctx.parsed.y ?? 0)}`
  }
};

/* ────────────────────────────────────────────────────────────────
   § 9. CHART: SPENDING TREND (Line — per month)
   ──────────────────────────────────────────────────────────────── */

function renderChartTrend() {
  destroyChart('trend');

  // Group filtered data by year-month key ("2026-05")
  const grouped = groupBy(state.filtered, e => e._ym);
  const sortedKeys = Object.keys(grouped).sort();
  const labels = sortedKeys.map(fmtMonthKey);
  const values = sortedKeys.map(k => sumAmount(grouped[k]));

  const ctx = document.getElementById('chart-trend').getContext('2d');

  // Gradient fill
  const grad = ctx.createLinearGradient(0, 0, 0, 280);
  grad.addColorStop(0, 'rgba(99,102,241,0.25)');
  grad.addColorStop(1, 'rgba(99,102,241,0)');

  state.charts.trend = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Total Pengeluaran',
        data: values,
        borderColor: '#6366f1',
        backgroundColor: grad,
        borderWidth: 2.5,
        pointRadius: 5,
        pointHoverRadius: 7,
        pointBackgroundColor: '#6366f1',
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
        tension: 0.35,
        fill: true,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          ...rupiahTooltip,
          displayColors: false,
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { maxRotation: 30 }
        },
        y: {
          grid: { color: '#f1f5f9' },
          ticks: {
            callback: v => 'Rp ' + (v / 1_000_000).toFixed(1) + 'jt'
          },
          beginAtZero: true,
        }
      }
    }
  });
}

/* ────────────────────────────────────────────────────────────────
   § 10. CHART: KATEGORI (Doughnut)
   ──────────────────────────────────────────────────────────────── */

function renderChartCategory() {
  destroyChart('category');

  const grouped = groupBy(state.filtered, e => e.category);
  const sorted  = sortedTotals(grouped);
  const labels  = sorted.map(([k]) => k);
  const values  = sorted.map(([, v]) => v);
  const colors  = labels.map(l => (CAT_CONFIG[l] || {}).color || '#6b7280');

  const ctx = document.getElementById('chart-category').getContext('2d');

  state.charts.category = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: colors,
        borderWidth: 3,
        borderColor: '#ffffff',
        hoverBorderWidth: 0,
        hoverOffset: 10,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '65%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: { boxWidth: 10, padding: 14, font: { size: 11 } }
        },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.label}: ${fmtRupiah(ctx.raw)}`
          }
        }
      }
    }
  });

  // Render category breakdown list below chart
  renderCategoryList(sorted);
}

/** Renders the progress-bar breakdown below the doughnut chart. */
function renderCategoryList(sorted) {
  const total = sorted.reduce((s, [, v]) => s + v, 0);
  const el    = document.getElementById('category-list');

  if (sorted.length === 0) {
    el.innerHTML = '<p class="text-muted text-sm" style="padding:8px 0">Tidak ada data.</p>';
    return;
  }

  el.innerHTML = sorted.map(([cat, amt]) => {
    const pct = total > 0 ? ((amt / total) * 100).toFixed(1) : 0;
    const m   = CAT_CONFIG[cat] || { color: '#6b7280', icon: '📌' };
    return `
      <li class="cat-list-item">
        <span class="cat-dot" style="background:${m.color}"></span>
        <div class="cat-info">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <span class="cat-name">${m.icon} ${cat}</span>
            <span class="text-xs text-muted">${fmtRupiah(amt)} · ${pct}%</span>
          </div>
          <div class="progress-bar-bg cat-bar-wrap" style="margin-top:4px">
            <div class="progress-bar-fill" style="width:${pct}%;background:${m.color}"></div>
          </div>
        </div>
      </li>`;
  }).join('');
}

/* ────────────────────────────────────────────────────────────────
   § 11. CHART: NEEDS vs WANTS (Doughnut)
   ──────────────────────────────────────────────────────────────── */

function renderChartNeedsWants() {
  destroyChart('nw');

  const needs = sumAmount(state.filtered.filter(e => e.type === 'Needs'));
  const wants = sumAmount(state.filtered.filter(e => e.type === 'Wants'));

  // Update label badges
  const total = needs + wants;
  document.getElementById('nw-needs-pct').textContent = total ? ((needs / total) * 100).toFixed(1) + '%' : '—';
  document.getElementById('nw-wants-pct').textContent = total ? ((wants / total) * 100).toFixed(1) + '%' : '—';
  document.getElementById('nw-needs-amt').textContent = fmtRupiah(needs);
  document.getElementById('nw-wants-amt').textContent = fmtRupiah(wants);

  const ctx = document.getElementById('chart-nw').getContext('2d');

  state.charts.nw = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Needs (Kebutuhan)', 'Wants (Keinginan)'],
      datasets: [{
        data: [needs, wants],
        backgroundColor: ['#10b981', '#f43f5e'],
        borderWidth: 3,
        borderColor: '#ffffff',
        hoverOffset: 8,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '60%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: { boxWidth: 10, padding: 14 }
        },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.label}: ${fmtRupiah(ctx.raw)}`
          }
        }
      }
    }
  });
}

/* ────────────────────────────────────────────────────────────────
   § 12. CHART: PAYMENT METHOD (Bar — horizontal)
   ──────────────────────────────────────────────────────────────── */

function renderChartPayment() {
  destroyChart('payment');

  const grouped = groupBy(state.filtered, e => e.payment_method);
  const sorted  = sortedTotals(grouped);
  const labels  = sorted.map(([k]) => k);
  const values  = sorted.map(([, v]) => v);
  const COLORS  = ['#6366f1','#f59e0b','#10b981','#3b82f6','#ec4899','#f97316'];

  const ctx = document.getElementById('chart-payment').getContext('2d');

  state.charts.payment = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Total',
        data: values,
        backgroundColor: labels.map((_, i) => COLORS[i % COLORS.length] + 'cc'),
        borderRadius: 6,
        borderSkipped: false,
        barThickness: 28,
      }]
    },
    options: {
      indexAxis: 'y',        // horizontal bar
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          ...rupiahTooltip,
          displayColors: false,
        }
      },
      scales: {
        x: {
          grid: { color: '#f1f5f9' },
          ticks: { callback: v => 'Rp ' + (v / 1_000_000).toFixed(1) + 'jt' },
          beginAtZero: true,
        },
        y: { grid: { display: false } }
      }
    }
  });
}

/* ────────────────────────────────────────────────────────────────
   § 13. TOP 10 TABLE
   ──────────────────────────────────────────────────────────────── */

function renderTop10() {
  const top10 = [...state.filtered]
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 10);

  const tbody = document.getElementById('top10-body');

  if (top10.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty-state">Tidak ada data untuk filter ini.</td></tr>`;
    return;
  }

  const rankClass = i => i === 0 ? 'rank-1' : i === 1 ? 'rank-2' : i === 2 ? 'rank-3' : 'rank-n';

  tbody.innerHTML = top10.map((e, i) => {
    const m    = CAT_CONFIG[e.category] || { icon: '📌', cssClass: 'other' };
    const type = e.type === 'Needs'
      ? `<span class="badge badge-needs">Needs</span>`
      : `<span class="badge badge-wants">Wants</span>`;
    return `
      <tr>
        <td><span class="rank-badge ${rankClass(i)}">${i + 1}</span></td>
        <td>
          <div style="font-weight:600;font-size:13px">${e.description}</div>
          <div class="text-xs text-muted" style="margin-top:2px">${fmtDate(e.date)}</div>
        </td>
        <td><span class="badge badge-${m.cssClass}">${m.icon} ${e.category}</span></td>
        <td style="font-weight:700;font-size:13px;white-space:nowrap">${fmtRupiah(e.amount)}</td>
        <td>${type}</td>
      </tr>`;
  }).join('');
}

/* ────────────────────────────────────────────────────────────────
   § 14. INSIGHT ENGINE
   ──────────────────────────────────────────────────────────────── */

/**
 * Generate 3 data-driven insight sentences from state.filtered.
 */
function renderInsights() {
  const data  = state.filtered;
  const total = sumAmount(data);
  const el    = document.getElementById('insight-list');

  if (data.length === 0) {
    el.innerHTML = `<div class="insight-item"><span class="insight-num">!</span>Tidak ada data untuk ditampilkan. Coba reset filter.</div>`;
    return;
  }

  const insights = [];

  // ── Insight 1: Top category & its share ──
  const catGroup  = groupBy(data, e => e.category);
  const catSorted = sortedTotals(catGroup);
  const [topCat, topAmt] = catSorted[0];
  const topPct    = ((topAmt / total) * 100).toFixed(1);
  const m         = CAT_CONFIG[topCat] || {};
  insights.push(
    `Kategori <strong>${m.icon || ''} ${topCat}</strong> menyedot porsi terbesar pengeluaranmu — ` +
    `<strong>${fmtRupiah(topAmt)}</strong> atau <strong>${topPct}%</strong> dari total. ` +
    (topCat === 'Makanan' ? 'Pertimbangkan meal-prep untuk menekan biaya makan.'
     : topCat === 'Hiburan' ? 'Coba evaluasi langganan digital yang jarang digunakan.'
     : topCat === 'Belanja' ? 'Biasakan wishlist 7 hari sebelum membeli barang non-esensial.'
     : 'Pantau terus agar tidak melebihi alokasi yang kamu tetapkan.')
  );

  // ── Insight 2: Needs vs Wants ratio ──
  const needsTotal = sumAmount(data.filter(e => e.type === 'Needs'));
  const wantsTotal = sumAmount(data.filter(e => e.type === 'Wants'));
  const wantsPct   = total > 0 ? ((wantsTotal / total) * 100).toFixed(1) : 0;
  const wantsOK    = wantsPct <= 30;
  insights.push(
    `Rasio <strong>Needs vs Wants</strong>: kebutuhan <strong>${fmtRupiah(needsTotal)}</strong> ` +
    `vs keinginan <strong>${fmtRupiah(wantsTotal)}</strong> (${wantsPct}% dari total). ` +
    (wantsOK
      ? '✅ Sesuai prinsip 50/30/20 — proporsi keinginanmu sudah terkendali dengan baik!'
      : '⚠️ Porsi keinginan melebihi 30% — coba terapkan metode 50/30/20 untuk menyeimbangkan.')
  );

  // ── Insight 3: Month with highest spending ──
  const ymGroup   = groupBy(data, e => e._ym);
  const ymSorted  = sortedTotals(ymGroup);
  const [topYM, topYMAmt] = ymSorted[0];
  const [lowYM, lowYMAmt] = ymSorted[ymSorted.length - 1];
  const diff = topYMAmt - lowYMAmt;
  insights.push(
    `Pengeluaran tertinggi terjadi di <strong>${fmtMonthKey(topYM)}</strong> ` +
    `(<strong>${fmtRupiah(topYMAmt)}</strong>), sedangkan terendah di ` +
    `<strong>${fmtMonthKey(lowYM)}</strong> (<strong>${fmtRupiah(lowYMAmt)}</strong>). ` +
    `Selisihnya <strong>${fmtRupiah(diff)}</strong> — ` +
    (diff > 500_000
      ? 'fluktuasi cukup besar; periksa transaksi besar di bulan puncak.'
      : 'pengeluaranmu relatif stabil antar bulan. Pertahankan!')
  );

  el.innerHTML = insights
    .map((text, i) => `
      <div class="insight-item fade-up-${i + 1}">
        <span class="insight-num">${i + 1}</span>
        <span>${text}</span>
      </div>`)
    .join('');
}

/* ────────────────────────────────────────────────────────────────
   § 15. MASTER RENDER
   ──────────────────────────────────────────────────────────────── */

/**
 * Re-render all KPIs, charts, table, and insights.
 * Called after filters change or on initial load.
 */
function renderAll() {
  renderKPIs();
  renderChartTrend();
  renderChartCategory();
  renderChartNeedsWants();
  renderChartPayment();
  renderTop10();
  renderInsights();
}

/* ────────────────────────────────────────────────────────────────
   § 16. TOAST NOTIFICATION
   ──────────────────────────────────────────────────────────────── */

let _toastTimer = null;

/**
 * Show a brief toast at the bottom-right corner.
 * @param {string} msg
 * @param {'success'|'warn'|'error'} [type='success']
 */
function showToast(msg, type = 'success') {
  const el  = document.getElementById('toast');
  const dot = el.querySelector('.toast-dot');
  const txt = el.querySelector('.toast-text');

  const colors = { success: '#22c55e', warn: '#f59e0b', error: '#ef4444' };
  dot.style.background = colors[type] || colors.success;
  txt.textContent = msg;

  el.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('show'), 3000);
}

/* ────────────────────────────────────────────────────────────────
   § 17. FILTER DROPDOWNS — POPULATION
   ──────────────────────────────────────────────────────────────── */

/**
 * Populate category and payment-method select dropdowns
 * from the actual raw data.
 */
function populateFilterDropdowns() {
  const categories = [...new Set(state.raw.map(e => e.category))].sort();
  const payments   = [...new Set(state.raw.map(e => e.payment_method))].sort();

  const catSel = document.getElementById('f-category');
  categories.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c;
    opt.textContent = `${(CAT_CONFIG[c] || {}).icon || ''} ${c}`;
    catSel.appendChild(opt);
  });

  const paySel = document.getElementById('f-payment');
  payments.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p;
    opt.textContent = p;
    paySel.appendChild(opt);
  });
}

/* ────────────────────────────────────────────────────────────────
   § 18. DATE RANGE PRESETS
   ──────────────────────────────────────────────────────────────── */

/**
 * Set the date-from and date-to inputs based on a preset.
 * @param {string} preset  'all' | '3m' | '1m'
 */
function applyDatePreset(preset) {
  const dates = state.raw.map(e => e.date).sort();
  if (dates.length === 0) return;

  const maxDate = dates[dates.length - 1];
  let minDate   = dates[0];

  if (preset === '3m') {
    const d = new Date(maxDate);
    d.setMonth(d.getMonth() - 2);
    d.setDate(1);
    minDate = d.toISOString().slice(0, 10);
  } else if (preset === '1m') {
    const d = new Date(maxDate);
    d.setDate(1);
    minDate = d.toISOString().slice(0, 10);
  }

  document.getElementById('f-date-from').value = preset === 'all' ? '' : minDate;
  document.getElementById('f-date-to').value   = preset === 'all' ? '' : maxDate;
  applyFilters();
  renderAll();
}

/* ────────────────────────────────────────────────────────────────
   § 19. ERROR BANNER
   ──────────────────────────────────────────────────────────────── */

function showErrorBanner() {
  const main = document.getElementById('app-main');
  main.innerHTML = `
    <div class="card" style="text-align:center;padding:40px 24px;border-color:#fecaca;background:#fff5f5">
      <div style="font-size:40px;margin-bottom:12px">⚠️</div>
      <h2 style="color:#dc2626;font-size:16px;margin-bottom:8px">Gagal Memuat Data</h2>
      <p style="color:#64748b;font-size:13px;max-width:380px;margin:0 auto">
        Pastikan file <code>expenses.json</code> tersedia di direktori yang sama
        dan buka aplikasi melalui server lokal
        (<code>npx serve .</code> atau VS Code Live Server).
      </p>
    </div>`;
}

/* ────────────────────────────────────────────────────────────────
   § 20. BOOT — INITIAL SETUP
   ──────────────────────────────────────────────────────────────── */

function bootApp() {
  // Populate header metadata
  document.getElementById('nav-avatar').textContent  = state.meta.avatar  || '?';
  document.getElementById('nav-period').textContent  = state.meta.period  || '';
  document.getElementById('greeting-name').textContent = state.meta.owner || 'Pengguna';

  // Set date range default (full range)
  const dates = state.raw.map(e => e.date).sort();
  if (dates.length > 0) {
    document.getElementById('f-date-from').value = dates[0];
    document.getElementById('f-date-to').value   = dates[dates.length - 1];
  }

  // Populate filter options
  populateFilterDropdowns();

  // Apply initial filter (full dataset)
  applyFilters();

  // Initial render
  renderAll();

  // ── Wire up filter change events ──
  ['f-category', 'f-payment', 'f-date-from', 'f-date-to'].forEach(id => {
    document.getElementById(id).addEventListener('change', () => {
      applyFilters();
      renderAll();
      showToast('Filter diterapkan.');
    });
  });

  // ── Reset button ──
  document.getElementById('btn-reset').addEventListener('click', resetFilters);

  // ── Date preset buttons ──
  document.querySelectorAll('[data-preset]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-preset]').forEach(b => b.classList.remove('btn-primary'));
      btn.classList.add('btn-primary');
      applyDatePreset(btn.dataset.preset);
    });
  });
}

/* ────────────────────────────────────────────────────────────────
   § 21. ENTRY POINT
   ──────────────────────────────────────────────────────────────── */
loadData();
