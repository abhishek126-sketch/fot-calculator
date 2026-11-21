/* FOT units (update 2.1). Devices print resistance/reactance as cmH2O·s/L (= cmH2O/L/s = cmH2O/(L/s)),
 * hPa·s/L or kPa·s/L (= kPa/(L/s)); AX (reactance area) as cmH2O/L, hPa/L or kPa/L; Fres always in Hz.
 * The reference equations work in cmH2O·s/L (Ducharme's kPa equations are converted inside equations.js), so the
 * app converts what is typed into cmH2O for the equations and shows the results back in the unit chosen.
 * 1 kPa = 10.1972 cmH2O (1000 Pa / 98.0665 Pa per cmH2O); 1 hPa = 1.01972 cmH2O. */
(function (root) {
  'use strict';
  const KPA = 10.1972, HPA = 1.01972;
  const UNITS = {
    cmh2o: { id: 'cmh2o', name: 'cmH₂O·s/L', ascii: 'cmH2O.s/L', ax: 'cmH₂O/L', axAscii: 'cmH2O/L', toCm: 1, note: 'also written cmH2O/L/s or cmH2O/(L/s)' },
    hpa: { id: 'hpa', name: 'hPa·s/L', ascii: 'hPa.s/L', ax: 'hPa/L', axAscii: 'hPa/L', toCm: HPA, note: '1 hPa = 1.0197 cmH2O (almost the same number)' },
    kpa: { id: 'kpa', name: 'kPa·s/L', ascii: 'kPa.s/L', ax: 'kPa/L', axAscii: 'kPa/L', toCm: KPA, note: 'also written kPa/(L/s); 1 kPa = 10.197 cmH2O' }
  };
  const DEFAULT = 'cmh2o';
  const get = id => UNITS[id] || UNITS[DEFAULT];

  /** Value typed in unit `id` -> cmH2O (resistance, reactance, AX). null stays null. */
  const toCm = (v, id) => (v == null || isNaN(v) ? null : v * get(id).toCm);
  /** cmH2O -> unit `id` (for showing predicted values and limits in the unit the doctor uses). */
  const fromCm = (v, id) => (v == null || isNaN(v) ? null : v / get(id).toCm);

  /** Decimal places that suit the unit (kPa values are 10x smaller). */
  const dp = id => (get(id).id === 'kpa' ? 3 : 2);

  /**
   * Plausibility of resistances AFTER conversion to cmH2O (keys r5, rhi). Healthy tall adults are ~2-3, small
   * children up to ~12, severe obstruction rarely above ~25 cmH2O·s/L.
   *  - below 1 cmH2O·s/L while cmH2O/hPa is selected  -> the device probably printed kPa·s/L
   *  - above 30 cmH2O·s/L while kPa is selected        -> the value was probably typed in cmH2O/hPa
   */
  function plausibility(mCm, id) {
    const u = get(id), vals = ['r5', 'rhi'].map(k => mCm[k]).filter(v => v != null && v > 0);
    if (!vals.length) return [];
    if (u.id !== 'kpa' && vals.some(v => v < 1))
      return [`Resistance below 1 ${u.ascii} is not physiological - the device printout is probably in kPa·s/L. Change "Units" to kPa·s/L (or check the value).`];
    if (u.id === 'kpa' && vals.some(v => v > 30))
      return [`Resistance above ${(30 / KPA).toFixed(1)} kPa·s/L is implausibly high - the value was probably typed in cmH2O·s/L or hPa·s/L. Change "Units" (or check the value).`];
    return [];
  }

  const api = { UNITS, DEFAULT, KPA, HPA, get, toCm, fromCm, dp, plausibility };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.FOTUNITS = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
