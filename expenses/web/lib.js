// Shared formula + UI helpers for the protocol-expenses simulator.
// Ported from the 2026-05-retreat repo. Config is BAKED IN at build time
// (see build-web.ts) — `CFG` is assigned from the embedded blob, no fetch.

let CFG = null;

// Config is injected as a global `__EXPENSES_CONFIG__` by the built page.
async function loadConfig() {
  if (CFG) return CFG;
  CFG = __EXPENSES_CONFIG__;
  return CFG;
}

const fmt = {
  dot: n => n >= 1e9 ? (n/1e9).toFixed(2) + 'B' : n >= 1e6 ? (n/1e6).toFixed(1) + 'M' : n >= 1e3 ? (n/1e3).toFixed(1) + 'k' : Math.round(n).toLocaleString(),
  usd: n => '$' + (n >= 1e9 ? (n/1e9).toFixed(2) + 'B' : n >= 1e6 ? (n/1e6).toFixed(1) + 'M' : n >= 1e3 ? (n/1e3).toFixed(1) + 'k' : Math.round(n).toLocaleString()),
  pct: n => (n*100).toFixed(2) + '%',
};

// ───── Issuance curve ─────
// Ref 1710 stepped curve: TI(t) = target - (target - initial) * (1 - r)^(t/p)
function tiNew(year) {
  const c = CFG.issuance_curve;
  const yearsSince = Math.max(0, year - 2026);
  const steps = yearsSince / c.step_period_years;
  return c.hard_cap_dot - (c.hard_cap_dot - c.march_2026_ti_dot) * Math.pow(1 - c.bi_annual_rate, steps);
}

// Average yearly emission across the 2-year curve step starting at `year`.
// Matches forum-cited "55.8M post-transition" rate for the 2026-2027 period.
function yearlyEmission(year) {
  const c = CFG.issuance_curve;
  const step = c.step_period_years || 2;
  return (tiNew(year + step) - tiNew(year)) / step;
}

// Self-stake incentive curve — mirrors reward.rs::incentive_weight
function incentiveWeight(s) {
  const { optimum_dot: T, hard_cap_dot: C, slope_factor: k } = CFG.self_stake_curve;
  if (s <= 0) return 0;
  if (T === 0 && C === 0) return 0;
  if (s <= T) return Math.sqrt(s);
  const k2 = k * k;
  if (s <= C) return Math.sqrt(T + k2 * (s - T));
  return Math.sqrt(T + k2 * (C - T));
}

// ───── Slider helper ─────
function sliderInput(parent, cfg, value, onChange) {
  const div = document.createElement('div');
  div.className = 'input-row';
  const fmtVal = (v) => {
    if (cfg.unit === '%') return v + '%';
    if (cfg.unit === '$') return '$' + (+v).toLocaleString();
    if (typeof v === 'number' && v >= 1000) return v.toLocaleString();
    return String(v);
  };
  div.innerHTML = `
    <label>
      <span>${cfg.label}</span>
      <span class="val">${fmtVal(value)}</span>
    </label>
    <input type="range" min="${cfg.min}" max="${cfg.max}" step="${cfg.step}" value="${value}">
  `;
  const valSpan = div.querySelector('.val');
  const inp = div.querySelector('input');
  inp.oninput = () => {
    const v = +inp.value;
    valSpan.textContent = fmtVal(v);
    onChange(v);
  };
  parent.appendChild(div);
  return inp;
}
