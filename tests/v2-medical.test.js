// Update 2.0 medical review: adult R19 / R5-19 (De et al. Lung India 2020 Table 2), adult study range 18-81 y,
// caution over 60 y, kPa unit warning, child BMI (adult cut-offs not applicable).
const test = require('node:test'), assert = require('node:assert');
const E = require('../equations.js');
const C = require('../clinical.js');
const near = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) < tol, `${a} vs ${b}`);

test('adult men: R19 and R5-19 exactly as De 2020 Table 2 (whole-breath, SEE)', () => {
  const p = E.ADULT.predict('male', 40, 170, 70);
  near(p.r19.pred, 8.077 - 0.040 * 170 + 0.02 * 70);
  near(p.r19.uln, p.r19.pred + 1.645 * 0.639);
  near(p.r5_19.pred, 2.685 - 0.02 * 170 + 0.012 * 70 + 0.004 * 40);
  near(p.r5_19.uln, p.r5_19.pred + 1.645 * 0.399);
});

test('adult women: R19 and R5-19 exactly as De 2020 Table 2', () => {
  const p = E.ADULT.predict('female', 40, 155, 60);
  near(p.r19.pred, 8.683 - 0.038 * 155 + 0.019 * 60);
  near(p.r19.z(p.r19.pred + 0.745), 1);
  near(p.r5_19.pred, 2.158 - 0.013 * 155 + 0.009 * 60);
  near(p.r5_19.z(p.r5_19.pred + 0.527), 1);
});

test('adult R5 / X5 still exactly as Table 2 (unchanged)', () => {
  const m = E.ADULT.predict('male', 35, 170, 70), f = E.ADULT.predict('female', 35, 155, 60);
  near(m.r5.pred, 10.035 - 0.057 * 170 + 0.036 * 70 + 0.008 * 35);
  near(m.x5.pred, -3.334 + 0.018 * 170 - 0.009 * 70 - 0.004 * 35);
  near(f.r5.pred, 9.697 - 0.046 * 155 + 0.033 * 60);
  near(f.x5.pred, -4.40 + 0.020 * 155);
});

test('predicted adult values are physiological (compare with the paper\'s means)', () => {
  // Paper: men R19 2.83 +/- 0.69, R5-19 0.39 +/- 0.43 at mean 168 cm / ~71 kg
  const p = E.ADULT.predict('male', 43, 168, 71);
  assert.ok(p.r19.pred > 2.3 && p.r19.pred < 3.4, String(p.r19.pred));
  assert.ok(p.r5_19.pred > 0.1 && p.r5_19.pred < 0.8, String(p.r5_19.pred));
});

test('both adult reference sets now carry R19 and R5-19; Antlia stays approximate', () => {
  for (const id of ['de_lungindia', 'antlia']) {
    const d = E.ADULT_DEVICES[id], p = d.predict('male', 40, 170, 70);
    assert.ok(p.r19 && p.r5_19, id);
  }
  assert.equal(E.ADULT_DEVICES.antlia.approx, true);
  assert.equal(E.ADULT_DEVICES.de_lungindia.rLabel, 'R19');
  assert.equal(E.ADULT_DEVICES.antlia.rLabel, 'R20');
});

test('adult study range 18-81 y; caution over 60 y', () => {
  const d = E.ADULT_DEVICES.de_lungindia;
  assert.equal(E.rangeWarnings(d, 45, 165).length, 0);
  assert.equal(E.rangeWarnings(d, 85, 165).length, 1);
  assert.equal(E.rangeCautions(d, 45).length, 0);
  assert.equal(E.rangeCautions(d, 70).length, 1);
  assert.equal(E.rangeCautions(d, 85).length, 0, 'beyond 81 is a range warning, not a caution');
  assert.equal(E.rangeWarnings(E.ADULT_DEVICES.antlia, 85, 165).length, 1);
});

test('kPa unit warning for resistance < 1 cmH2O.s/L only', () => {
  assert.equal(E.unitWarnings({ r5: 0.42, rhi: 0.35 }).length, 1);
  assert.equal(E.unitWarnings({ r5: 3.1, rhi: 2.6 }).length, 0);
  assert.equal(E.unitWarnings({ r5: null, rhi: null }).length, 0);
});

test('children: adult BMI cut-offs are not applied', () => {
  const kid = C.bmiCategories(24, 12);
  assert.equal(kid.child, true);
  assert.match(kid.note, /BMI-for-age/);
  const adult = C.bmiCategories(24, 30);
  assert.equal(adult.asian, 'Overweight');
  assert.equal(adult.who, 'Normal');
});
