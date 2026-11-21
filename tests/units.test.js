// Update 2.1: FOT unit flexibility (cmH2O.s/L, hPa.s/L, kPa.s/L). The same measurement typed in any unit must give the
// same z-score and interpretation.
const test = require('node:test'), assert = require('node:assert');
const U = require('../units.js');
const E = require('../equations.js');
const near = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) < tol, `${a} vs ${b}`);

test('conversion factors: 1 kPa = 10.1972 cmH2O, 1 hPa = 1.01972 cmH2O (98.0665 Pa per cmH2O)', () => {
  near(U.toCm(1, 'kpa'), 1000 / 98.0665, 1e-4);
  near(U.toCm(1, 'hpa'), 100 / 98.0665, 1e-5);
  near(U.toCm(3.2, 'cmh2o'), 3.2);
  assert.equal(U.KPA, E.K, 'same kPa factor as the Ducharme equations');
});

test('round trip and null handling', () => {
  for (const id of ['cmh2o', 'hpa', 'kpa']) near(U.fromCm(U.toCm(-1.234, id), id), -1.234);
  assert.equal(U.toCm(null, 'kpa'), null);
  assert.equal(U.fromCm(undefined, 'kpa'), null);
  assert.equal(U.get('nonsense').id, 'cmh2o');
});

test('same patient typed in kPa / hPa / cmH2O gives the same z-scores (adult De 2020)', () => {
  const p = E.ADULT.predict('male', 50, 168, 70);
  const cm = { r5: 4.6, r19: 3.1, x5: -2.1 };
  for (const id of ['hpa', 'kpa']) {
    for (const k of ['r5', 'r19', 'x5']) {
      const typed = cm[k] / U.get(id).toCm;            // what the device would print in that unit
      near(p[k].z(U.toCm(typed, id)), p[k].z(cm[k]), 1e-9);
    }
  }
});

test('same child typed in kPa: tremoflo log/sqrt models give identical z (R5, AX)', () => {
  const p = E.DEVICES.tremoflo.predict('male', 10, 138);
  near(p.r5.z(U.toCm(0.735, 'kpa')), p.r5.z(0.735 * U.KPA));
  near(p.ax.z(U.toCm(2.5, 'kpa')), p.ax.z(2.5 * U.KPA));
});

test('plausibility: kPa value with cmH2O selected, and cmH2O value with kPa selected', () => {
  assert.equal(U.plausibility({ r5: U.toCm(0.42, 'cmh2o') }, 'cmh2o').length, 1, '0.42 cmH2O is not physiological');
  assert.equal(U.plausibility({ r5: U.toCm(0.42, 'hpa') }, 'hpa').length, 1);
  assert.equal(U.plausibility({ r5: U.toCm(0.42, 'kpa') }, 'kpa').length, 0, '0.42 kPa = 4.3 cmH2O is normal');
  assert.equal(U.plausibility({ r5: U.toCm(4.5, 'kpa') }, 'kpa').length, 1, '4.5 kPa = 46 cmH2O: probably typed in cmH2O');
  assert.equal(U.plausibility({ r5: U.toCm(4.5, 'cmh2o') }, 'cmh2o').length, 0);
  assert.equal(U.plausibility({}, 'kpa').length, 0);
});

test('kPa values get 3 decimals, others 2; AX unit is pressure per litre', () => {
  assert.equal(U.dp('kpa'), 3); assert.equal(U.dp('cmh2o'), 2); assert.equal(U.dp('hpa'), 2);
  assert.equal(U.get('kpa').ax, 'kPa/L'); assert.equal(U.get('cmh2o').ax, 'cmH₂O/L');
});
