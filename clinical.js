/* Clinical helpers: height units, BMI (Asian + WHO), smoking exposure.
 * Sources cited in BMI_SOURCES / SMOKE_SOURCES below. No invented medical cut-offs. */
(function (root) {
  'use strict';

  const BMI_SOURCES = {
    asian: 'WHO Expert Consultation. Lancet 2004;363:157-163 (PMID 14726171): for many Asian populations, BMI ≥23 kg/m² = increased risk (overweight trigger); ≥25 kg/m² = high risk (obese trigger). Categories used here: <18.5 underweight; 18.5–22.9 normal; 23–24.9 overweight; ≥25 obese.',
    who: 'WHO adult BMI: <18.5 underweight; 18.5–24.9 normal; 25–29.9 overweight; ≥30 obese.'
  };

  const SMOKE_SOURCES = {
    packYears: 'Cigarette pack-years = (cigarettes/day ÷ 20) × years smoked (standard definition).',
    smokingIndex: 'Indian smoking index (SI) = (sticks/day) × years (cigarettes and/or bidis counted as sticks). Widely used in Indian respiratory literature when bidi–cigarette pack-year equivalence is uncertain.',
    bidiNote: 'No universally accepted conversion of bidi sticks to cigarette pack-years. Bidi exposure is reported as SI (and optionally as “bidi pack-year equivalents” only if the user elects a 1 stick ≈ 1 cigarette assumption — labelled as assumption, not evidence-based equivalence).',
    cannabis: 'Cannabis joint-years = (joints/day) × years; reported separately and never added into tobacco pack-years.'
  };

  function feetInchesToCm(ft, inch) {
    const f = Number(ft) || 0, i = Number(inch) || 0;
    return (f * 12 + i) * 2.54;
  }
  function cmToFeetInches(cm) {
    const total = cm / 2.54;
    const ft = Math.floor(total / 12);
    // 2-decimal inches keeps round-trip within ~0.03 cm
    const inch = Math.round((total - ft * 12) * 100) / 100;
    return { ft, inch };
  }

  function bmi(weightKg, heightCm) {
    if (!weightKg || !heightCm || heightCm <= 0) return null;
    const v = weightKg / Math.pow(heightCm / 100, 2);
    return Math.round(v * 10) / 10;
  }

  function bmiCategoryAsian(v) {
    if (v == null || isNaN(v)) return null;
    if (v < 18.5) return 'Underweight';
    if (v < 23) return 'Normal';
    if (v < 25) return 'Overweight';
    return 'Obese';
  }
  function bmiCategoryWHO(v) {
    if (v == null || isNaN(v)) return null;
    if (v < 18.5) return 'Underweight';
    if (v < 25) return 'Normal';
    if (v < 30) return 'Overweight';
    return 'Obese';
  }

  /**
   * types: array of { type: 'cigarette'|'bidi'|'mixed'|'hookah'|'chillum'|'smokeless'|'other',
   *   perDay: number, years: number, unitLabel?: string }
   * mixed = cig + bidi sticks combined as sticks for SI; cig and bidi portions can be passed separately instead.
   */
  function smokingExposure(status, types, quitYear) {
    const out = {
      status: status || 'never',
      quitYear: quitYear || null,
      cigarettePackYears: 0,
      bidiSmokingIndex: 0,
      tobaccoSmokingIndex: 0, // all smoked tobacco sticks (cig+bidi+mixed)
      hookahYears: 0,
      jointYears: 0,
      smokelessNote: false,
      other: [],
      sources: SMOKE_SOURCES,
      summaryLines: []
    };
    if (!status || status === 'never') {
      out.summaryLines.push('Never smoker');
      return out;
    }
    (types || []).forEach(t => {
      const d = Number(t.perDay) || 0, y = Number(t.years) || 0;
      if (!t.type) return;
      if (t.type === 'cigarette') {
        out.cigarettePackYears += (d / 20) * y;
        out.tobaccoSmokingIndex += d * y;
      } else if (t.type === 'bidi') {
        out.bidiSmokingIndex += d * y;
        out.tobaccoSmokingIndex += d * y;
      } else if (t.type === 'mixed') {
        // mixed cig+bidi treated as sticks/day for SI; also attribute half? Better: full SI as sticks
        out.tobaccoSmokingIndex += d * y;
        out.bidiSmokingIndex += d * y; // labelled as mixed sticks in summary
      } else if (t.type === 'hookah') {
        out.hookahYears += d * y; // sessions/day × years
      } else if (t.type === 'chillum') {
        out.jointYears += d * y;
      } else if (t.type === 'smokeless') {
        out.smokelessNote = true;
        out.other.push(`Smokeless tobacco: ${d}/day × ${y} y (not converted to pack-years)`);
      } else if (t.type === 'other') {
        out.other.push(`Other: ${d}/day × ${y} y (${t.unitLabel || 'units'})`);
      }
    });
    const lines = [`Status: ${status}${quitYear ? '; quit year ' + quitYear : ''}`];
    if (out.cigarettePackYears > 0) lines.push(`Cigarette pack-years: ${out.cigarettePackYears.toFixed(2)}`);
    if (out.bidiSmokingIndex > 0) lines.push(`Bidi/mixed smoking index (sticks/day × years): ${out.bidiSmokingIndex.toFixed(1)}`);
    if (out.tobaccoSmokingIndex > 0) lines.push(`Combined tobacco smoking index (all smoked sticks): ${out.tobaccoSmokingIndex.toFixed(1)}`);
    if (out.hookahYears > 0) lines.push(`Hookah-years (sessions/day × years): ${out.hookahYears.toFixed(1)}`);
    if (out.jointYears > 0) lines.push(`Cannabis joint-years: ${out.jointYears.toFixed(2)} (not included in pack-years)`);
    out.other.forEach(x => lines.push(x));
    out.summaryLines = lines;
    return out;
  }

  const api = {
    BMI_SOURCES, SMOKE_SOURCES,
    feetInchesToCm, cmToFeetInches, bmi, bmiCategoryAsian, bmiCategoryWHO, smokingExposure
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.FOTCLIN = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
