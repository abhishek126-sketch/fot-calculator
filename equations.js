/* FOT reference equations by device. Every coefficient below is copied from the
 * printed table cited next to it. Do not edit without re-checking the source.
 * App units: resistance/reactance cmH2O/L/s, AX cmH2O/L, Fres Hz.
 * 1 kPa = 10.1972 cmH2O (used for Ducharme 2022 equations, which are in kPa). */
(function (root) {
  'use strict';
  const K = 10.1972, Z = 1.645;

  // Linear model in app units: pred +/- Z*sd
  const lin = (mu, sd, k = 1) => ({ pred: mu * k, lln: (mu - Z * sd) * k, uln: (mu + Z * sd) * k,
    z: m => (m / k - mu) / sd });
  // ln-transformed model (Ducharme: ln(Rrs) ~ N(mu, sigma)); pred = median exp(mu)
  const logm = (mu, sd, k = 1) => ({ pred: Math.exp(mu) * k, lln: Math.exp(mu - Z * sd) * k,
    uln: Math.exp(mu + Z * sd) * k, z: m => (m > 0 ? (Math.log(m / k) - mu) / sd : NaN) });
  // sqrt-transformed model (Ducharme: sqrt(AX) linear, SEE)
  const sqrtm = (mu, sd, k = 1) => ({ pred: mu * mu * k, lln: Math.max(0, mu - Z * sd) ** 2 * k,
    uln: (mu + Z * sd) ** 2 * k, z: m => (m >= 0 ? (Math.sqrt(m / k) - mu) / sd : NaN) });
  const q = (a, b, c, h) => a + b * h + c * h * h;

  const DEVICES = {
    pulmoscan: {
      label: 'PulmoScan (Cognita Labs / CSIR-IGIB handheld FOT)',
      ref: 'Aggarwal M, Garg NM, Agrawal A, Sardana V. Indian J Pediatr 2023;90(1):61-68. doi:10.1007/s12098-022-04176-2 (Table 2, p.67)',
      short: 'Aggarwal et al. 2023 (Indian, PulmoScan)',
      age: [9, 19], height: null, rLabel: 'R20', needsEthnicity: true, needsWeight: true,
      params: ['r5', 'r20', 'x5'],
      predict(sex, age, ht, wt, eth) {
        const DR = eth === 'dravidian' ? 1 : 0, MD = eth === 'mixed' ? 1 : 0;
        if (sex === 'female') return {
          r5: lin(8.8344827 - 0.1137591 * age - 1.6881474 * DR - 0.8102314 * MD, 1.483),
          r20: lin(20.73084363 - 0.20055837 * age - 0.07730760 * ht + 0.03110263 * wt - 0.29523585 * DR - 1.54658968 * MD, 1.828),
          x5: lin(-16.38333893 + 0.07841934 * ht - 1.03452124 * DR + 2.03995200 * MD, 1.434) };
        return {
          r5: lin(18.48199557 - 0.08317625 * age - 0.07854747 * ht + 0.03745560 * wt - 1.17853282 * DR - 1.07899031 * MD, 1.329),
          r20: lin(24.90873346 - 0.21488111 * age - 0.10401326 * ht + 0.03282684 * wt - 0.08969708 * DR - 1.56407450 * MD, 1.488),
          x5: lin(-21.6628413 + 0.1184544 * ht - 0.0259044 * wt - 0.6991041 * DR + 1.4647050 * MD, 1.216) };
      }
    },
    resmon_de: {
      label: 'Resmon Pro Full (Restech/MGC) - Indian children',
      ref: 'De S, Banerjee N, Tiwari RR. Indian J Pediatr 2020;87(3):192-199. doi:10.1007/s12098-019-03116-x (Table 2, p.196; whole-breath, SEE)',
      short: 'De et al. 2020 (Indian, Resmon Pro Full)',
      age: [5, 17], height: [96, 178], rLabel: 'R19', needsEthnicity: false, needsWeight: true,
      params: ['r5', 'r19', 'r5_19', 'x5'],
      predict(sex, age, ht, wt) {
        if (sex === 'female') return {
          r5: lin(18.025 - 0.072 * ht - 0.171 * age, 1.491),
          r19: lin(14.194 - 0.050 * ht - 0.163 * age, 1.102),
          r5_19: lin(4.699 - 0.028 * ht, 1.013),
          x5: lin(-6.544 + 0.035 * ht, 0.743) };
        return {
          r5: lin(18.683 - 0.09 * ht, 1.288),
          r19: lin(13.233 - 0.044 * ht - 0.161 * age, 0.932),
          r5_19: lin(6.077 - 0.046 * ht + 0.073 * age + 0.013 * wt, 0.644),
          x5: lin(-6.182 + 0.039 * ht - 0.074 * age, 0.619) };
      }
    },
    resmon_ducharme: {
      label: 'Resmon Pro Full (5-11-19 Hz) - Canadian multi-ethnic children',
      ref: 'Ducharme FM, Smyrnova A, Lawson CC, Miles LM. Pediatr Pulmonol 2022;57:2092-2102. doi:10.1002/ppul.25984 (Table 2, p.2097; GAMLSS mu/sigma, kPa)',
      short: 'Ducharme et al. 2022 (Canadian, Resmon Pro Full)',
      age: [3, 17], height: [100, 189], rLabel: 'R19', needsEthnicity: false, needsWeight: false,
      params: ['r5', 'r19', 'r5_19', 'x5'],
      predict(sex, age, h) {
        return {
          r5: logm(q(-0.1509337, 0.0080947, -0.0000824, h), 0.2686874 - 0.0011421 * h, K),
          r19: logm(q(0.1562894, -0.0032993, -0.0000289, h), 0.2308085 - 0.0010078 * h, K),
          r5_19: lin(0.5082932 - 0.0028301 * h, 0.2117816 - 0.0009223 * h, K),
          x5: lin(q(-1.2117906, 0.0106890, -0.0000240, h), 0.2143459 - 0.0010743 * h, K) };
      }
    },
    tremoflo: {
      label: 'tremoflo C-100 (Thorasys), 5-37 Hz - Canadian multi-ethnic children',
      ref: 'Ducharme FM et al. Pediatr Pulmonol 2022;57:2092-2102. doi:10.1002/ppul.25984, Table 3 as corrected in Pediatr Pulmonol 2025;60:e27409 (doi:10.1002/ppul.27409); GAMLSS mu/sigma, kPa',
      short: 'Ducharme et al. 2022/2024 corr. (Canadian, tremoflo C-100)',
      age: [3, 17], height: [100, 189], rLabel: 'R19', needsEthnicity: false, needsWeight: false,
      params: ['r5', 'r19', 'r5_19', 'x5', 'ax', 'fres'],
      predict(sex, age, h) {
        return {
          r5: logm(q(-0.0251772, 0.0080913, -0.0000817, h), 0.3131217 - 0.0013188 * h, K),
          r19: logm(q(0.4188948, -0.0049662, -0.0000246, h), 0.2632939 - 0.0011178 * h, K),
          r5_19: lin(0.5829830 - 0.0031635 * h, 0.2520296 - 0.0011147 * h, K),
          x5: lin(q(-1.1334595, 0.0084314, -0.0000149, h), 0.2105421 - 0.0009932 * h, K),
          ax: sqrtm(4.2293625 - 0.0201357 * h, 0.378, K),
          fres: lin(q(12.1902218, 0.3074905, -0.0016839, h), 3.5470232 + 0.0081112 * h) };
      }
    }
  };

  const ADULT = {
    label: 'Indian adult (Resmon Pro Full) — De et al., Lung India 2020;37:30-36', short: 'Indian Adult (De et al., Lung India 2020;37:30-36)',
    params: ['r5', 'x5'],
    predict(sex, age, ht, wt) {
      if (sex === 'male') return { r5: lin(10.035 - 0.057 * ht + 0.036 * wt + 0.008 * age, 0.961),
        x5: lin(-3.334 + 0.018 * ht - 0.009 * wt - 0.004 * age, 0.529) };
      return { r5: lin(9.697 - 0.046 * ht + 0.033 * wt, 0.991), x5: lin(-4.40 + 0.020 * ht, 0.646) };
    }
  };


  const Z_CUT = 1.645;
  /** One-sided disease rules (ERS/King 2020): R/AX/Fres abnormal if z>+1.645; X5 if z<-1.645. */
  function interpretZ(kind, z) {
    if (z === null || z === undefined || Number.isNaN(z)) return { interp: 'No reference', severity: 'muted' };
    if (kind === 'x') {
      if (z < -Z_CUT) return { interp: 'Below LLN (more negative, abnormal)', severity: 'abnormal' };
      if (z > Z_CUT) return { interp: 'Above ULN (less negative), not an obstruction sign', severity: 'caution' };
      return { interp: 'Normal', severity: 'normal' };
    }
    // resistance, AX, Fres (with equation)
    if (z > Z_CUT) return { interp: 'Above ULN (abnormal)', severity: 'abnormal' };
    if (z < -Z_CUT) return { interp: 'Below LLN', severity: 'caution' };
    return { interp: 'Normal', severity: 'normal' };
  }

  function rangeWarnings(dev, age, ht) {
    const w = [];
    if (dev.age && (age < dev.age[0] || age > dev.age[1]))
      w.push(`Age ${age} y is outside the study range (${dev.age[0]}-${dev.age[1]} y).`);
    if (dev.height && (ht < dev.height[0] || ht > dev.height[1]))
      w.push(`Height ${ht} cm is outside the study range (${dev.height[0]}-${dev.height[1]} cm).`);
    return w;
  }

  const api = { DEVICES, ADULT, K, Z_CUT, interpretZ, rangeWarnings };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.FOTEQ = api;
})(this);
