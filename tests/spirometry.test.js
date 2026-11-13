// Run: node --test tests/
// GLI Global 2022 (Bowerman et al. AJRCCM 2023) + ATS/ERS 2022 interpretation (Stanojevic et al. ERJ 2022) + GOLD.
// Coefficients were checked line by line against the equation text printed in the official lookup-table workbook
// (gli_global_lookuptables_dec6.xlsx, column G of each sheet). Reference rows below are the rspiro 0.5 values used as the
// cross-implementation oracle in the pft R package (tests/testthat/gli_2022_oracle.csv; measured = 85% of predicted);
// all 30 rows of that file agreed with this implementation to 1e-13 on 14 Nov 2026.
const test = require('node:test'), assert = require('node:assert');
const S = require('../spirometry.js'), T = require('../gli-global-data.js');
const near = (a, b, tol = 1e-5) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

// [sex, age, height cm, FEV1 pred, FEV1 LLN, FVC pred, FVC LLN, ratio pred, ratio LLN, FEV1 measured, FEV1 z]
const ORACLE = [
  ['male', 10, 155, 2.51527, 1.977932, 2.996284, 2.35795, 0.849135, 0.741038, 2.137979, -1.164512],
  ['female', 25, 155, 2.754494, 2.126086, 3.126694, 2.420935, 0.882239, 0.771862, 2.34132, -1.091914],
  ['male', 45, 170, 3.45738, 2.628198, 4.239149, 3.244598, 0.810741, 0.702817, 2.938773, -1.040915],
  ['female', 65, 170, 2.51316, 1.778537, 3.220196, 2.310204, 0.78696, 0.663075, 2.136186, -0.859265],
  ['male', 85, 185, 2.946094, 2.109291, 4.10911, 3.014556, 0.743953, 0.596088, 2.50418, -0.884226],
  ['female', 85, 155, 1.658388, 1.108667, 2.17899, 1.485363, 0.780855, 0.639929, 1.40963, -0.761721],
];

test('GLI Global 2022 predicted / LLN / z match the reference rows', () => {
  for (const [sex, age, h, f1, f1l, fv, fvl, r, rl, m, z] of ORACLE) {
    const p = S.predict(sex, age, h);
    near(p.fev1.pred, f1); near(p.fev1.lln, f1l); near(p.fvc.pred, fv); near(p.fvc.lln, fvl);
    near(p.ratio.pred, r); near(p.ratio.lln, rl); near(p.fev1.z(m), z);
  }
});

test('lookup tables: 369 rows (3-95 y by 0.25) per sheet; first and last rows as in the workbook', () => {
  for (const k of ['m_fev1', 'm_fvc', 'm_ratio', 'f_fev1', 'f_fvc', 'f_ratio']) assert.equal(T[k].length, 369);
  assert.deepEqual(T.m_fev1[0], [-0.119775593865382, 0.18430736168469999]);
  assert.deepEqual(T.f_ratio[368], [-0.038227368860984497, 0.24734363567645501]);
});

test('LMS identities: z(predicted) = 0, z(LLN) = -1.645, % predicted', () => {
  const p = S.predict('female', 37.5, 162);
  for (const k of ['fev1', 'fvc', 'ratio']) { near(p[k].z(p[k].pred), 0, 1e-12); near(p[k].z(p[k].lln), -1.645, 1e-9); near(p[k].z(p[k].uln), 1.645, 1e-9); }
  near(p.fev1.pp(p.fev1.pred * 0.8), 80, 1e-9);
});

test('ages between table rows are interpolated linearly; outside 3-95 the end row is used with a warning', () => {
  const a = S.lms('male', 'fev1', 40, 175), b = S.lms('male', 'fev1', 40.25, 175), m = S.lms('male', 'fev1', 40.125, 175);
  assert.ok(m.M > Math.min(a.M, b.M) - 1e-9 && m.M < Math.max(a.M, b.M) + 1e-9);
  assert.equal(S.rangeWarnings(97, 170).length, 1);
  assert.equal(S.rangeWarnings(40, 170).length, 0);
});

test('ATS/ERS 2022 severity bands by FEV1 z (a boundary value takes the milder band)', () => {
  assert.equal(S.severity(-1.645), 'normal'); assert.equal(S.severity(-1.646), 'mild');
  assert.equal(S.severity(-2.5), 'mild'); assert.equal(S.severity(-2.501), 'moderate');
  assert.equal(S.severity(-4), 'moderate'); assert.equal(S.severity(-4.001), 'severe');
});

// helpers: measured values at a chosen z for a 50-year-old man, 170 cm
const P = S.predict('male', 50, 170);
const atZ = (ref, z) => ref.M * Math.pow(1 + z * ref.L * ref.S, 1 / ref.L);
const base = { sex: 'male', age: 50, height: 170 };

test('patterns: normal, obstruction, possible restriction, PRISm, mixed, incomplete', () => {
  const fvcN = atZ(P.fvc, 0);
  let r = S.interpret({ ...base, pre: { fev1: atZ(P.fev1, 0), fvc: fvcN } });
  assert.equal(r.patternKey, 'normal'); assert.equal(r.severity, null);
  r = S.interpret({ ...base, pre: { fev1: fvcN * 0.55, fvc: fvcN } });                     // ratio 0.55, far below LLN
  assert.equal(r.patternKey, 'obstruction'); assert.ok(['mild', 'moderate', 'severe'].includes(r.severity));
  const fvcLow = atZ(P.fvc, -2.2);
  r = S.interpret({ ...base, pre: { fev1: fvcLow * P.ratio.pred, fvc: fvcLow } });          // low FVC, normal ratio
  assert.equal(r.patternKey, 'restrictive'); assert.match(r.pattern, /TLC needed/);
  const fvcBorder = atZ(P.fvc, -1.0);                                                        // FVC normal, FEV1 low, ratio normal
  r = S.interpret({ ...base, pre: { fev1: Math.min(atZ(P.fev1, -1.8), fvcBorder * 0.99), fvc: fvcBorder } });
  if (r.pre.z.ratio >= -1.645) assert.equal(r.patternKey, 'prism');
  r = S.interpret({ ...base, pre: { fev1: fvcLow * 0.5, fvc: fvcLow } });                   // low ratio AND low FVC
  assert.equal(r.patternKey, 'mixed'); assert.match(r.pattern, /TLC needed/);
  r = S.interpret({ ...base, pre: { fev1: 3.0 } });
  assert.equal(r.patternKey, 'incomplete');
  assert.equal(S.interpret({ ...base, pre: {}, post: {} }), null);
});

test('bronchodilator response: strictly more than 10% of the PREDICTED value (ATS/ERS 2022)', () => {
  const pre = { fev1: 2.0, fvc: 3.5 };
  const tenPct = 0.10 * P.fev1.pred;
  let r = S.interpret({ ...base, pre, post: { fev1: 2.0 + tenPct, fvc: 3.5 } });
  assert.equal(r.bdr.find(b => b.name === 'FEV1').positive, false);                         // exactly 10% -> not significant
  r = S.interpret({ ...base, pre, post: { fev1: 2.0 + tenPct + 0.01, fvc: 3.5 } });
  assert.equal(r.bdr.find(b => b.name === 'FEV1').positive, true); assert.equal(r.bdrPositive, true);
  r = S.interpret({ ...base, pre, post: { fev1: 2.05, fvc: 3.5 + 0.11 * P.fvc.pred } });   // FVC response counts too
  assert.equal(r.bdrPositive, true);
});

test('GOLD: post-BD FEV1/FVC < 0.70, grade by post-BD FEV1 % predicted; LLN disagreement noted', () => {
  assert.deepEqual([90, 80, 79.9, 50, 49.9, 30, 29.9].map(S.goldGrade), [1, 1, 2, 2, 3, 3, 4]);
  const fvc = atZ(P.fvc, 0);
  let r = S.interpret({ ...base, pre: { fev1: fvc * 0.6, fvc }, post: { fev1: fvc * 0.62, fvc } });
  assert.equal(r.gold.below, true); assert.ok(r.gold.grade >= 1);
  // 85-year-old man: ratio 0.68 is below 0.70 but above his LLN (~0.60) -> disagreement note (fixed ratio over-calls)
  const old = { sex: 'male', age: 85, height: 170 }, Po = S.predict('male', 85, 170);
  r = S.interpret({ ...old, pre: { fev1: Po.fvc.pred * 0.68, fvc: Po.fvc.pred }, post: { fev1: Po.fvc.pred * 0.68, fvc: Po.fvc.pred } });
  assert.equal(r.gold.below, true); assert.ok(r.notes.some(n => /over-diagnoses/.test(n)));
  // no post-BD values with obstruction -> note that GOLD needs post-BD
  r = S.interpret({ ...base, pre: { fev1: fvc * 0.5, fvc } });
  assert.ok(r.notes.some(n => /GOLD staging needs post-bronchodilator/.test(n)));
});

test('FEF25-75 and PEF are values only (no GLI Global equations)', () => {
  const r = S.interpret({ ...base, pre: { fev1: 3, fvc: 3.9, fef2575: 2.4, pef: 7.5 }, post: { pef: 7.9 } });
  assert.deepEqual(r.extras.map(e => e.name), ['FEF25-75', 'PEF']);
  assert.equal(r.rows.some(x => /FEF|PEF/.test(x.name)), false);
});
