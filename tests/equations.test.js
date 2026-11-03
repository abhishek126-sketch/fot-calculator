// Run: node --test tests/
// No paper contains a worked example; expected values are hand-computed (Python) from the printed tables.
const test = require('node:test'), assert = require('node:assert');
const { DEVICES, ADULT, rangeWarnings } = require('../equations.js');
const near = (a, b, tol = 0.01) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

test('tremoflo (Ducharme 2022 Table 3, corrected 2024), Ht 130 cm', () => {
  const p = DEVICES.tremoflo.predict('male', 9, 130, 28);
  near(p.r5.pred, 7.157); near(p.x5.pred, -2.949); near(p.ax.pred, 26.489); near(p.fres.pred, 23.706);
  near(p.r5.z(p.r5.pred), 0, 1e-9);                       // median -> z = 0
  near(p.r5.z(p.r5.uln), 1.645, 1e-9);
  // sex has no effect (height-only model)
  near(DEVICES.tremoflo.predict('female', 9, 130).r5.pred, p.r5.pred, 1e-12);
});
test('Resmon Pro (Ducharme 2022 Table 2), Ht 130 cm', () => near(DEVICES.resmon_ducharme.predict('male', 9, 130).r5.pred, 6.240));
test('Resmon Pro (De 2020 Table 2)', () => {
  near(DEVICES.resmon_de.predict('male', 10, 130, 28).r5.pred, 6.983);
  near(DEVICES.resmon_de.predict('female', 10, 130, 28).r5.pred, 6.955);
  const p = DEVICES.resmon_de.predict('male', 10, 130, 28);
  near(p.r5.z(p.r5.pred + 1.288), 1, 1e-9);               // SEE used as SD
});
test('PulmoScan (Aggarwal 2023 Table 2) unchanged from previous app version', () => {
  near(DEVICES.pulmoscan.predict('male', 12, 145, 35, 'indo_european').r5.pred, 7.4054);
  near(DEVICES.pulmoscan.predict('female', 12, 145, 35, 'dravidian').r5.pred, 8.8344827 - 0.1137591 * 12 - 1.6881474, 1e-9);
});
test('adult equations unchanged', () => near(ADULT.predict('male', 35, 170, 70).r5.pred, 10.035 - 0.057 * 170 + 0.036 * 70 + 0.008 * 35, 1e-9));
test('range warnings', () => {
  assert.equal(rangeWarnings(DEVICES.pulmoscan, 7, 120).length, 1);
  assert.equal(rangeWarnings(DEVICES.tremoflo, 9, 95).length, 1);
  assert.equal(rangeWarnings(DEVICES.resmon_de, 10, 140).length, 0);
});
