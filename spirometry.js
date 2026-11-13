/* Spirometry: GLI Global (2022) race-neutral reference values + ATS/ERS 2022 interpretation + GOLD fixed ratio.
 * Every coefficient and cut-off below is copied from the source cited next to it. Do not edit without re-checking it.
 *
 * Reference equations (FEV1, FVC, FEV1/FVC only - GLI Global has no FEF25-75 or PEF equations):
 *   Bowerman C, Bhakta NR, Brazzale D, et al. A race-neutral approach to the interpretation of lung function
 *   measurements. Am J Respir Crit Care Med 2023;207(6):768-774. doi:10.1164/rccm.202205-0963OC.
 *   LMS model:  M = exp(a0 + a1*ln(height cm) + a2*ln(age) + Mspline)   (predicted = M, the median)
 *               S = exp(p0 + p1*ln(age) + Sspline)                       L = constant or q0 + q1*ln(age)
 *               z = ((measured/M)^L - 1) / (L*S)      LLN = M*(1 - 1.645*L*S)^(1/L)   ULN with +1.645
 *   Splines: GLI lookup tables (gli-global-data.js), age 3-95 y by 0.25 y, linearly interpolated between the two
 *   bracketing ages. Coefficients as implemented in rspiro (getLMS_GLIgl.R) and checked against the official GLI
 *   calculator (tests/spirometry.test.js).
 * Interpretation:
 *   Stanojevic S, Kaminsky DA, Miller MR, et al. ERS/ATS technical standard on interpretive strategies for routine lung
 *   function tests. Eur Respir J 2022;60:2101499. doi:10.1183/13993003.01499-2021.
 *     - abnormal = below the LLN (z < -1.645); obstruction = FEV1/FVC z < -1.645
 *     - severity of impairment by FEV1 z-score: >= -1.645 normal; to -2.5 mild; to -4 moderate; below -4 severe
 *       (paper's box: -1.65 to -2.5 mild, -2.51 to -4 moderate, < -4.1 severe; a value on a boundary takes the milder band)
 *     - low FVC with normal FEV1/FVC: restriction cannot be confirmed by spirometry (needs TLC); FEV1/FVC normal with low
 *       FEV1 = preserved ratio impaired spirometry (PRISm)
 *     - bronchodilator response: change in FEV1 or FVC > 10% of the PREDICTED value
 *   GOLD 2025 report (Global Initiative for Chronic Obstructive Lung Disease): persistent airflow limitation = POST-BD
 *   FEV1/FVC < 0.70; severity grades by post-BD FEV1 % predicted: GOLD 1 >= 80, 2 50-79, 3 30-49, 4 < 30.
 * Valid only for acceptable and repeatable manoeuvres (ATS/ERS 2019 spirometry standard). */
(function (root) {
  'use strict';
  const TABLES = (typeof module !== 'undefined' && module.exports) ? require('./gli-global-data.js') : root.GLI_GLOBAL_TABLES;
  const Z = 1.645, AGE_MIN = 3, AGE_MAX = 95;

  // Bowerman et al. 2023 coefficients (rspiro getLMS_GLIgl.R). height in cm, age in years.
  const COEF = {
    male: {
      fev1: { a: [-11.399108, 2.462664, -0.011394], p: [-2.256278, 0.080729], L: () => 1.22703 },
      fvc: { a: [-12.629131, 2.727421, 0.009174], p: [-2.195595, 0.068466], L: () => 0.9346 },
      ratio: { a: [1.022608, -0.218592, -0.027586], p: [-2.882025, 0.068889], L: age => 3.8243 - 0.3328 * Math.log(age) }
    },
    female: {
      fev1: { a: [-10.901689, 2.385928, -0.076386], p: [-2.364047, 0.129402], L: () => 1.21388 },
      fvc: { a: [-12.055901, 2.621579, -0.035975], p: [-2.310148, 0.120428], L: () => 0.899 },
      ratio: { a: [0.9189568, -0.1840671, -0.0461306], p: [-3.171582, 0.144358], L: age => 6.6490 - 0.9920 * Math.log(age) }
    }
  };

  function spline(sex, param, age) {
    const t = TABLES[(sex === 'female' ? 'f_' : 'm_') + param];
    const pos = (Math.min(Math.max(age, AGE_MIN), AGE_MAX) - AGE_MIN) / 0.25, i = Math.floor(pos), f = pos - i;
    if (i >= t.length - 1) return t[t.length - 1];
    return [t[i][0] + (t[i + 1][0] - t[i][0]) * f, t[i][1] + (t[i + 1][1] - t[i][1]) * f];
  }

  /** L, M, S for one parameter ('fev1' | 'fvc' | 'ratio'). */
  function lms(sex, param, age, heightCm) {
    const c = COEF[sex === 'female' ? 'female' : 'male'][param], [ms, ss] = spline(sex, param, age);
    const la = Math.log(age), lh = Math.log(heightCm);
    return { L: c.L(age), M: Math.exp(c.a[0] + c.a[1] * lh + c.a[2] * la + ms), S: Math.exp(c.p[0] + c.p[1] * la + ss) };
  }
  const refOf = ({ L, M, S }) => ({
    pred: M, L, M, S,
    lln: M * Math.pow(1 - Z * L * S, 1 / L),
    uln: M * Math.pow(1 + Z * L * S, 1 / L),
    z: m => (m > 0 ? (Math.pow(m / M, L) - 1) / (L * S) : NaN),
    pp: m => m / M * 100
  });

  /** Predicted values for FEV1 (L), FVC (L) and FEV1/FVC (ratio, 0-1). */
  function predict(sex, age, heightCm) {
    return { fev1: refOf(lms(sex, 'fev1', age, heightCm)), fvc: refOf(lms(sex, 'fvc', age, heightCm)), ratio: refOf(lms(sex, 'ratio', age, heightCm)) };
  }

  function rangeWarnings(age, heightCm) {
    const w = [];
    if (age < AGE_MIN || age > AGE_MAX) w.push(`Age ${age} y is outside the GLI Global range (${AGE_MIN}-${AGE_MAX} y); the nearest table age is used.`);
    if (heightCm < 80 || heightCm > 220) w.push(`Height ${heightCm} cm looks implausible for spirometry reference values - please check.`);
    return w;
  }

  // ATS/ERS 2022 severity by FEV1 z-score
  function severity(z) {
    if (z == null || Number.isNaN(z)) return null;
    if (z >= -Z) return 'normal';            // at or above the LLN (z -1.645)
    if (z >= -2.5) return 'mild';
    if (z >= -4) return 'moderate';
    return 'severe';
  }
  const SEV_LABEL = { normal: 'Normal', mild: 'Mild', moderate: 'Moderate', severe: 'Severe' };
  function goldGrade(pp) { return pp == null ? null : pp >= 80 ? 1 : pp >= 50 ? 2 : pp >= 30 ? 3 : 4; }

  /**
   * in: { sex, age, height, pre: {fev1, fvc, fef2575, pef}, post: {fev1, fvc, fef2575, pef} } - volumes in L, flows in L/s.
   * Returns null when no FEV1/FVC was entered.
   */
  function interpret(inp) {
    const pre = inp.pre || {}, post = inp.post || {};
    const has = v => typeof v === 'number' && isFinite(v) && v > 0;
    if (!has(pre.fev1) && !has(pre.fvc) && !has(post.fev1) && !has(post.fvc)) return null;
    const P = predict(inp.sex, inp.age, inp.height), out = { ref: P, rows: [], lines: [], notes: [], warnings: rangeWarnings(inp.age, inp.height) };
    const phase = (label, v) => {
      const r = { label, fev1: has(v.fev1) ? v.fev1 : null, fvc: has(v.fvc) ? v.fvc : null };
      r.ratio = r.fev1 != null && r.fvc != null ? r.fev1 / r.fvc : null;
      r.z = { fev1: r.fev1 != null ? P.fev1.z(r.fev1) : null, fvc: r.fvc != null ? P.fvc.z(r.fvc) : null, ratio: r.ratio != null ? P.ratio.z(r.ratio) : null };
      r.pp = { fev1: r.fev1 != null ? P.fev1.pp(r.fev1) : null, fvc: r.fvc != null ? P.fvc.pp(r.fvc) : null, ratio: r.ratio != null ? P.ratio.pp(r.ratio) : null };
      return r;
    };
    const A = phase('Pre-BD', pre), B = (has(post.fev1) || has(post.fvc)) ? phase('Post-BD', post) : null;
    out.pre = A; out.post = B;
    // table rows (screen + PDF): measured, predicted, LLN, z, % predicted for each phase
    const add = (name, unit, key, ph, dp) => {
      const m = ph[key]; if (m == null) return;
      const ref = P[key], z = ph.z[key], low = z < -Z;
      out.rows.push({ name: `${name}${ph.label === 'Post-BD' ? ' (post-BD)' : ''}`, unit, meas: m, pred: ref.pred, lln: ref.lln, z, pp: ph.pp[key], dp,
        interp: low ? 'Below LLN' : 'Normal', severity: low ? 'abnormal' : 'normal' });
    };
    for (const ph of [A, B].filter(Boolean)) { add('FEV1', 'L', 'fev1', ph, 2); add('FVC', 'L', 'fvc', ph, 2); add('FEV1/FVC', '', 'ratio', ph, 2); }
    // FEF25-75 and PEF: values only (no GLI Global equations; ATS/ERS 2022: not used to diagnose)
    out.extras = [];
    [['FEF25-75', 'L/s', 'fef2575'], ['PEF', 'L/s', 'pef']].forEach(([n, u, k]) => {
      if (has(pre[k])) out.extras.push({ name: n, unit: u, meas: pre[k], post: has(post[k]) ? post[k] : null });
      else if (has(post[k])) out.extras.push({ name: n, unit: u, meas: null, post: post[k] });
    });

    // ---- ATS/ERS 2022 pattern (on the pre-BD test; post-BD used when no pre-BD values were entered) ----
    const X = (A.fev1 != null || A.fvc != null) ? A : B;
    const zR = X.z.ratio, zV = X.z.fvc, z1 = X.z.fev1;
    const obstr = zR != null && zR < -Z, lowFVC = zV != null && zV < -Z, lowFEV1 = z1 != null && z1 < -Z;
    let pattern, patternKey;
    if (zR == null) { pattern = 'FEV1/FVC not available - enter both FEV1 and FVC to classify the pattern'; patternKey = 'incomplete'; }
    else if (obstr && lowFVC) { pattern = 'Obstruction with low FVC (possible mixed defect or air trapping) - TLC needed to separate them'; patternKey = 'mixed'; }
    else if (obstr) { pattern = 'Obstruction (FEV1/FVC below LLN)'; patternKey = 'obstruction'; }
    else if (lowFVC) { pattern = 'Low FVC with normal FEV1/FVC - possible restriction; spirometry cannot confirm it (TLC needed)' + (lowFEV1 ? '; PRISm pattern (preserved ratio, impaired spirometry)' : ''); patternKey = 'restrictive'; }
    else if (lowFEV1) { pattern = 'PRISm - preserved ratio impaired spirometry (low FEV1, normal FEV1/FVC)'; patternKey = 'prism'; }
    else { pattern = 'Normal spirometry (FEV1, FVC and FEV1/FVC at or above the LLN)'; patternKey = 'normal'; }
    const sev = patternKey === 'normal' || patternKey === 'incomplete' ? null : severity(z1);
    out.pattern = pattern; out.patternKey = patternKey; out.patternFrom = X.label;
    out.severity = sev; out.severityLabel = sev ? `${SEV_LABEL[sev]} (FEV1 z ${z1.toFixed(2)})` : null;
    out.lines.push(`Pattern (ATS/ERS 2022, ${X.label}): ${pattern}.`);
    if (sev) out.lines.push(`Severity (ATS/ERS 2022, by FEV1 z-score): ${SEV_LABEL[sev]} (z ${z1.toFixed(2)}; mild -1.645 to -2.5, moderate -2.5 to -4, severe below -4).`);

    // ---- bronchodilator response: ATS/ERS 2022, change > 10% of the predicted value in FEV1 or FVC ----
    out.bdr = [];
    if (B) for (const [k, n] of [['fev1', 'FEV1'], ['fvc', 'FVC']]) {
      if (A[k] == null || B[k] == null) continue;
      const d = B[k] - A[k], pctPred = d / P[k].pred * 100, pctBase = d / A[k] * 100;
      // strictly greater than 10% (tiny tolerance so an exact 10.000% is not tipped over by floating-point error)
      out.bdr.push({ name: n, pre: A[k], post: B[k], change: d, pctPred, pctBase, positive: pctPred > 10 + 1e-9 });
    }
    if (out.bdr.length) {
      const pos = out.bdr.filter(b => b.positive);
      out.bdrPositive = pos.length > 0;
      out.lines.push(`Bronchodilator response (ATS/ERS 2022, > 10% of predicted): ${pos.length ? 'POSITIVE in ' + pos.map(b => `${b.name} (+${b.pctPred.toFixed(1)}% of predicted)`).join(' and ') : 'not significant (' + out.bdr.map(b => `${b.name} ${b.pctPred >= 0 ? '+' : ''}${b.pctPred.toFixed(1)}%`).join(', ') + ' of predicted)'}.`);
    }

    // ---- GOLD 2025: post-BD FEV1/FVC < 0.70; grade by post-BD FEV1 % predicted ----
    if (B && B.ratio != null) {
      const below = B.ratio < 0.70, grade = below ? goldGrade(B.pp.fev1) : null;
      out.gold = { ratio: B.ratio, below, grade, fev1pp: B.pp.fev1 };
      out.lines.push(`GOLD (post-BD FEV1/FVC ${B.ratio.toFixed(2)}): ${below ? `< 0.70 - persistent airflow limitation${grade ? `, GOLD ${grade} (post-BD FEV1 ${B.pp.fev1.toFixed(0)}% predicted)` : ''}; COPD only with a compatible clinical picture` : '>= 0.70 - no airflow limitation by the fixed ratio'}.`);
      const lnnLow = B.z.ratio < -Z;
      if (below !== lnnLow) out.notes.push(below
        ? 'Fixed ratio and LLN disagree: post-BD FEV1/FVC is below 0.70 but above the LLN. The fixed ratio over-diagnoses obstruction in older adults - interpret with the clinical picture.'
        : 'Fixed ratio and LLN disagree: post-BD FEV1/FVC is 0.70 or more but below the LLN. The fixed ratio under-diagnoses obstruction in younger adults - the LLN finding is the more reliable one.');
    } else if (patternKey === 'obstruction' || patternKey === 'mixed') {
      out.notes.push('GOLD staging needs post-bronchodilator FEV1 and FVC.');
    }
    out.notes.push('Interpretation assumes acceptable and repeatable manoeuvres (ATS/ERS 2019). FEF25-75 and PEF are shown as values only: GLI Global has no equations for them and ATS/ERS 2022 does not use them for diagnosis.');
    return out;
  }

  const CITE = {
    gli: 'GLI Global 2022 (race-neutral): Bowerman C et al. Am J Respir Crit Care Med 2023;207:768-774',
    ats: 'ATS/ERS 2022 interpretation: Stanojevic S et al. Eur Respir J 2022;60:2101499',
    gold: 'GOLD 2025 report: post-BD FEV1/FVC < 0.70; GOLD 1-4 by post-BD FEV1 % predicted'
  };
  const api = { predict, lms, interpret, severity, goldGrade, rangeWarnings, CITE, AGE_MIN, AGE_MAX, Z };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.FOTSPIRO = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
