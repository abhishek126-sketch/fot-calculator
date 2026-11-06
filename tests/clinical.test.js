const test = require('node:test'), assert = require('node:assert');
const C = require('../clinical.js');
const S = require('../storage.js');

test('feet/inches <-> cm', () => {
  assert.ok(Math.abs(C.feetInchesToCm(5, 7) - 170.18) < 0.01);
  const fi = C.cmToFeetInches(170.18);
  assert.equal(fi.ft, 5);
  assert.ok(Math.abs(fi.inch - 7) < 0.05);
  assert.ok(Math.abs(C.feetInchesToCm(fi.ft, fi.inch) - 170.18) < 0.05);
});

test('BMI Asian and WHO categories', () => {
  assert.equal(C.bmi(70, 170), 24.2);
  assert.equal(C.bmiCategoryAsian(22.9), 'Normal');
  assert.equal(C.bmiCategoryAsian(23), 'Overweight');
  assert.equal(C.bmiCategoryAsian(25), 'Obese');
  assert.equal(C.bmiCategoryAsian(18.4), 'Underweight');
  assert.equal(C.bmiCategoryWHO(24.2), 'Normal');
  assert.equal(C.bmiCategoryWHO(25), 'Overweight');
  assert.equal(C.bmiCategoryWHO(30), 'Obese');
  assert.match(C.BMI_SOURCES.asian, /Lancet 2004/);
});

test('cigarette pack-years', () => {
  const e = C.smokingExposure('current', [{ type: 'cigarette', perDay: 20, years: 10 }]);
  assert.equal(e.cigarettePackYears, 10);
  assert.equal(e.jointYears, 0);
});

test('bidi smoking index separate from pack-years', () => {
  const e = C.smokingExposure('current', [{ type: 'bidi', perDay: 10, years: 5 }]);
  assert.equal(e.cigarettePackYears, 0);
  assert.equal(e.bidiSmokingIndex, 50);
  assert.equal(e.tobaccoSmokingIndex, 50);
});

test('cannabis joint-years not mixed into pack-years', () => {
  const e = C.smokingExposure('former', [
    { type: 'cigarette', perDay: 10, years: 4 },
    { type: 'chillum', perDay: 2, years: 3 }
  ], 2020);
  assert.equal(e.cigarettePackYears, 2);
  assert.equal(e.jointYears, 6);
  assert.equal(e.quitYear, 2020);
  assert.ok(e.summaryLines.some(l => /joint-years/i.test(l)));
  assert.ok(!e.summaryLines.some(l => /pack-years: 8/.test(l)));
});

test('smokeless is note only', () => {
  const e = C.smokingExposure('current', [{ type: 'smokeless', perDay: 5, years: 2 }]);
  assert.equal(e.cigarettePackYears, 0);
  assert.equal(e.smokelessNote, true);
});

test('storage compare pct and delta z', () => {
  const prev = { testDate: '2024-01-01', measured: { r5: 5, x5: -1.5 }, z: { r5: 1.0, x5: -1.0 } };
  const curr = { testDate: '2025-01-01', measured: { r5: 4, x5: -1.0 }, z: { r5: 0.5, x5: -0.5 } };
  const c = S.compare(prev, curr);
  const r5 = c.rows.find(r => r.param === 'r5');
  assert.ok(Math.abs(r5.pctChange - (-20)) < 1e-9);
  assert.ok(Math.abs(r5.deltaZ - (-0.5)) < 1e-9);
  assert.match(c.note, /MCID/i);
});

test('storage patientKey prefers id', () => {
  assert.equal(S.patientKey('UH1', 'Bob'), 'uh1');
  assert.equal(S.patientKey('', 'Bob'), 'bob');
});
