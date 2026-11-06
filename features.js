/* UI wiring for height units, BMI, smoking, save/compare (uses FOTCLIN + FOTSTORE). */
(function (root) {
  'use strict';
  const $ = id => document.getElementById(id);
  const num = id => { const v = parseFloat($(id).value); return isNaN(v) ? null : v; };

  const TYPE_LABELS = {
    cigarette: 'Cigarette', bidi: 'Bidi', mixed: 'Mixed (cig+bidi)',
    hookah: 'Hookah', chillum: 'Chillum/ganja', smokeless: 'Smokeless tobacco', other: 'Other'
  };
  const UNIT_HINT = {
    cigarette: 'cig/day', bidi: 'bidi/day', mixed: 'sticks/day',
    hookah: 'sessions/day', chillum: 'joints/day', smokeless: 'uses/day', other: 'units/day'
  };

  function heightUnit() {
    const r = document.querySelector('input[name="htUnit"]:checked');
    return r ? r.value : 'cm';
  }

  function syncHeightToCm() {
    if (heightUnit() === 'ft') {
      const ft = num('heightFt'), inch = num('heightIn');
      if (ft !== null || inch !== null) {
        const cm = Math.round(FOTCLIN.feetInchesToCm(ft || 0, inch || 0) * 10) / 10;
        const cur = num('height');
        if (cur == null || Math.abs(cur - cm) >= 0.05) $('height').value = cm.toString();
      }
    }
  }

  function onHeightUnitChange() {
    const u = heightUnit();
    $('htCmWrap').style.display = u === 'cm' ? 'block' : 'none';
    $('htFtWrap').classList.toggle('on', u === 'ft');
    if (u === 'ft') {
      const cm = num('height');
      if (cm != null) {
        const fi = FOTCLIN.cmToFeetInches(cm);
        $('heightFt').value = fi.ft;
        $('heightIn').value = fi.inch;
      }
    } else {
      syncHeightToCm();
    }
    updateHeightBothLabel();
    if (typeof calculate === 'function') calculate();
  }

  function onHeightCmInput() {
    const cm = num('height');
    if (cm != null) {
      const fi = FOTCLIN.cmToFeetInches(cm);
      $('heightFt').value = fi.ft;
      $('heightIn').value = fi.inch;
    }
    updateHeightBothLabel();
    if (typeof calculate === 'function') calculate();
  }

  function onHeightFtInput() {
    syncHeightToCm();
    updateHeightBothLabel();
    if (typeof calculate === 'function') calculate();
  }

  function updateHeightBothLabel() {
    const el = $('htBoth');
    if (!el) return;
    const cm = num('height');
    if (cm == null) { el.textContent = ''; return; }
    const fi = FOTCLIN.cmToFeetInches(cm);
    el.textContent = `${cm} cm  =  ${fi.ft} ft ${fi.inch} in (equations use cm)`;
  }

  function getBmiInfo(weight, height) {
    const v = FOTCLIN.bmi(weight, height);
    if (v == null) return null;
    return {
      value: v,
      asian: FOTCLIN.bmiCategoryAsian(v),
      who: FOTCLIN.bmiCategoryWHO(v),
      sources: FOTCLIN.BMI_SOURCES
    };
  }

  function updateBmiField() {
    const w = num('weight'), h = num('height');
    const info = getBmiInfo(w, h);
    const out = $('bmiOut'), cite = $('bmiCite');
    if (!out) return;
    if (!info) {
      out.value = '';
      if (cite) cite.textContent = '';
      return;
    }
    out.value = `${info.value} kg/m² — Asian/Indian: ${info.asian}; WHO: ${info.who}`;
    if (cite) cite.textContent = 'Asian cut-offs: WHO Expert Consultation, Lancet 2004;363:157-163.';
  }

  function selectedSmokeTypes() {
    return Array.from(document.querySelectorAll('#smokeTypeChecks input[type=checkbox]:checked')).map(c => c.value);
  }

  function onSmokeChange() {
    const st = $('smokeStatus').value;
    $('quitYearWrap').style.display = st === 'former' ? 'block' : 'none';
    $('smokeTypesWrap').style.display = (st === 'never') ? 'none' : 'block';
    if (st === 'never') {
      $('smokeDetailRows').innerHTML = '';
      $('smokeSummary').textContent = 'Never smoker';
      if (typeof calculate === 'function') calculate();
      return;
    }
    const types = selectedSmokeTypes();
    const box = $('smokeDetailRows');
    const have = new Set(Array.from(box.querySelectorAll('[data-type]')).map(r => r.dataset.type));
    // remove unchecked
    Array.from(box.querySelectorAll('[data-type]')).forEach(row => {
      if (!types.includes(row.dataset.type)) row.remove();
    });
    types.forEach(t => {
      if (have.has(t)) return;
      const div = document.createElement('div');
      div.className = 'smoke-row';
      div.dataset.type = t;
      div.innerHTML = `<div><label>${TYPE_LABELS[t] || t} (${UNIT_HINT[t] || '/day'})</label>
        <input type="number" class="perDay" min="0" step="0.1" placeholder="${UNIT_HINT[t]}" oninput="updateSmokeSummary()"></div>
        <div><label>Years</label><input type="number" class="years" min="0" step="0.1" placeholder="years" oninput="updateSmokeSummary()"></div>
        <div></div>`;
      box.appendChild(div);
    });
    updateSmokeSummary();
  }

  function updateSmokeSummary() {
    const exp = getSmokeExposure();
    $('smokeSummary').textContent = exp.summaryLines.join(' · ');
    if (typeof calculate === 'function') calculate();
  }

  function getSmokeExposure() {
    const status = $('smokeStatus').value;
    const quitYear = status === 'former' ? (num('quitYear') || $('quitYear').value || null) : null;
    if (status === 'never') return FOTCLIN.smokingExposure('never', [], null);
    const types = [];
    $('smokeDetailRows').querySelectorAll('[data-type]').forEach(row => {
      types.push({
        type: row.dataset.type,
        perDay: parseFloat(row.querySelector('.perDay').value) || 0,
        years: parseFloat(row.querySelector('.years').value) || 0
      });
    });
    return FOTCLIN.smokingExposure(status, types, quitYear);
  }

  function buildSnapshot() {
    syncHeightToCm();
    const r = typeof evaluate === 'function' ? evaluate() : null;
    if (!r) return null;
    const measured = { r5: num('r5'), rhi: num('rhi'), x5: num('x5'), ax: num('ax'), fres: num('fres'),
      r5post: num('r5post'), x5post: num('x5post'), axpost: num('axpost') };
    const z = {};
    r.rows.forEach(row => {
      const key = row.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (row.name === 'R5') z.r5 = row.z;
      else if (row.name.startsWith('R19') || row.name.startsWith('R20')) z.rhi = row.z;
      else if (row.name === 'X5') z.x5 = row.z;
      else if (row.name === 'AX') z.ax = row.z;
      else if (row.name === 'Fres') z.fres = row.z;
    });
    return {
      ptId: $('ptId').value.trim(),
      ptName: $('ptName').value.trim(),
      testDate: $('testDate').value,
      age: r.age, sex: r.sex, height: r.height, weight: r.weight,
      heightFtIn: r.heightFtIn,
      bmi: r.bmiInfo,
      smoke: r.smoke,
      device: $('device').value.trim(),
      ped: r.ped, devId: r.devId, eth: r.eth,
      measured, z,
      rows: r.rows.map(x => ({ name: x.name, meas: x.meas, pred: x.pred, z: x.z, interp: x.interp })),
      refShort: r.refShort, deviceLabel: r.deviceLabel
    };
  }

  function saveCurrentTest() {
    const snap = buildSnapshot();
    if (!snap) { $('saveMsg').textContent = 'Enter age, height and weight (and preferably measured values) before saving.'; return; }
    if (!snap.ptId && !snap.ptName) {
      $('saveMsg').textContent = 'Enter Patient ID or name so the test can be filed under a patient key.';
      return;
    }
    FOTSTORE.saveTest(snap);
    $('saveMsg').textContent = `Saved for “${FOTSTORE.patientKey(snap.ptId, snap.ptName)}” on ${snap.testDate || 'no date'}. Local first.`;
    refreshCompareSelect();
    if (window.FOTDRIVE) FOTDRIVE.onSaveHook();
  }

  function exportTests() {
    const blob = new Blob([FOTSTORE.exportJSON()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'fot-calc-backup.json';
    a.click();
    URL.revokeObjectURL(a.href);
    $('saveMsg').textContent = 'Backup downloaded.';
  }

  function importTests(ev) {
    const f = ev.target.files && ev.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const m = FOTSTORE.importJSON(String(reader.result));
        $('saveMsg').textContent = 'Import complete' + (m && m.conflictCount ? ` (${m.conflictCount} conflict(s) kept both)` : '') + '.';
        refreshCompareSelect();
        if (window.FOTDRIVE) FOTDRIVE.onSaveHook();
      } catch (e) {
        $('saveMsg').textContent = 'Import failed: ' + e.message;
      }
    };
    reader.readAsText(f);
    ev.target.value = '';
  }

  function refreshCompareSelect() {
    const wrap = $('compareWrap');
    const sel = $('prevTestSelect');
    if (!wrap || !sel) return;
    const list = FOTSTORE.listForPatient($('ptId').value, $('ptName').value);
    sel.innerHTML = '';
    if (!list.length) {
      wrap.style.display = 'none';
      return;
    }
    wrap.style.display = 'block';
    list.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.id;
      const n = (t.rows && t.rows.length) ? t.rows.length + ' params' : 'saved';
      opt.textContent = `${t.testDate || '?'} — ${t.deviceLabel || t.devId || ''} (${n}) [${t.id}]`;
      sel.appendChild(opt);
    });
  }

  let lastCompare = null;

  function runComparison() {
    const snap = buildSnapshot();
    if (!snap) { $('compareOut').innerHTML = '<p class="muted">Enter current patient data first.</p>'; return; }
    const list = FOTSTORE.listForPatient(snap.ptId, snap.ptName);
    const id = $('prevTestSelect').value;
    const prev = list.find(t => t.id === id);
    if (!prev) { $('compareOut').innerHTML = '<p class="muted">Select a previous test.</p>'; return; }
    const cmp = FOTSTORE.compare(prev, snap);
    lastCompare = { prev, curr: snap, cmp };
    $('cmpPdfBtn').disabled = false;
    const f2 = v => (v === null || v === undefined || isNaN(v)) ? '-' : Number(v).toFixed(2);
    let html = `<h3 style="margin:0 0 8px;font-size:14px;">Comparison: ${esc(prev.testDate || '?')} → ${esc(snap.testDate || 'current')}</h3>`;
    html += `<p class="muted">${esc(cmp.note)}</p>`;
    html += `<table style="width:100%;border-collapse:collapse;font-size:13px;"><thead><tr>
      <th style="text-align:left;border-bottom:1px solid #cbd5e1;padding:4px;">Param</th>
      <th style="text-align:right;border-bottom:1px solid #cbd5e1;padding:4px;">Prev</th>
      <th style="text-align:right;border-bottom:1px solid #cbd5e1;padding:4px;">Curr</th>
      <th style="text-align:right;border-bottom:1px solid #cbd5e1;padding:4px;">%Δ</th>
      <th style="text-align:right;border-bottom:1px solid #cbd5e1;padding:4px;">Prev z</th>
      <th style="text-align:right;border-bottom:1px solid #cbd5e1;padding:4px;">Curr z</th>
      <th style="text-align:right;border-bottom:1px solid #cbd5e1;padding:4px;">Δz</th>
    </tr></thead><tbody>`;
    const labels = { r5: 'R5', rhi: 'R19/R20', x5: 'X5', ax: 'AX', fres: 'Fres' };
    cmp.rows.forEach(row => {
      html += `<tr>
        <td style="padding:4px;">${labels[row.param] || row.param}</td>
        <td style="text-align:right;padding:4px;">${f2(row.prev)}</td>
        <td style="text-align:right;padding:4px;">${f2(row.curr)}</td>
        <td style="text-align:right;padding:4px;">${row.pctChange == null ? '-' : f2(row.pctChange) + '%'}</td>
        <td style="text-align:right;padding:4px;">${f2(row.prevZ)}</td>
        <td style="text-align:right;padding:4px;">${f2(row.currZ)}</td>
        <td style="text-align:right;padding:4px;">${f2(row.deltaZ)}</td>
      </tr>`;
    });
    html += '</tbody></table>';
    $('compareOut').innerHTML = html;
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }

  function downloadComparisonPDF() {
    if (!lastCompare) { alert('Run a comparison first.'); return; }
    if (!window.jspdf || !window.jspdf.jsPDF) { alert('PDF library not loaded.'); return; }
    const { prev, curr, cmp } = lastCompare;
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 14;
    const blue = [30, 58, 138];
    const f2 = v => (v === null || v === undefined || isNaN(v)) ? '-' : Number(v).toFixed(2);
    doc.setFillColor(...blue); doc.rect(0, 0, W, 26, 'F');
    doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(18);
    doc.text('FOT Comparison Report', M, 12);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(11);
    doc.text(($('rptHeader').value.trim() || 'Dr Abhishek Singh, Pulmonologist'), M, 20);
    doc.setTextColor(0);
    const body = [
      ['Patient', (curr.ptName || '-') + ' / ' + (curr.ptId || '-')],
      ['Previous date', prev.testDate || '-', 'Current date', curr.testDate || '-'],
      ['Height', (curr.height || '-') + ' cm', 'Weight', (curr.weight || '-') + ' kg'],
      ['BMI', curr.bmi ? (curr.bmi.value + ' Asian:' + curr.bmi.asian) : '-']
    ];
    doc.autoTable({
      startY: 32, theme: 'plain', margin: { left: M, right: M },
      body: [
        ['Patient', (curr.ptName || '-') + ' / ID ' + (curr.ptId || '-')],
        ['Previous test', String(prev.testDate || '-'), 'Current test', String(curr.testDate || '-')],
        ['Height / Weight', `${curr.height} cm / ${curr.weight} kg`, 'BMI', curr.bmi ? `${curr.bmi.value} (${curr.bmi.asian})` : '-']
      ],
      styles: { fontSize: 10, cellPadding: 1.4 },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 36 }, 2: { fontStyle: 'bold', cellWidth: 36 } }
    });
    let y = doc.lastAutoTable.finalY + 6;
    const labels = { r5: 'R5', rhi: 'R19/R20', x5: 'X5', ax: 'AX', fres: 'Fres' };
    const rows = cmp.rows.map(r => [
      labels[r.param] || r.param,
      f2(r.prev), f2(r.curr),
      r.pctChange == null ? '-' : f2(r.pctChange) + '%',
      f2(r.prevZ), f2(r.currZ), f2(r.deltaZ)
    ]);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(...blue);
    doc.text('Side-by-side values', M, y); doc.setTextColor(0);
    doc.autoTable({
      startY: y + 3, margin: { left: M, right: M },
      head: [['Parameter', 'Prev', 'Curr', '% change', 'Prev z', 'Curr z', 'Δz']],
      body: rows,
      headStyles: { fillColor: blue }, styles: { fontSize: 9.5, cellPadding: 2 }
    });
    y = doc.lastAutoTable.finalY + 6;
    const note = doc.setFontSize(8.5).splitTextToSize(cmp.note, W - 2 * M);
    doc.setTextColor(100); doc.text(note, M, y); y += note.length * 4 + 4;
    doc.setTextColor(0);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
    doc.text('No published visit-to-visit MCID thresholds are flagged as “significant” here.', M, y);
    y += 6;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
    doc.setTextColor(100);
    doc.text(doc.splitTextToSize('Local storage only; nothing uploaded. For clinical decision support only.', W - 2 * M), M, y);
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const gen = `${pad(now.getDate())}-${pad(now.getMonth() + 1)}-${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
    for (let i = 1; i <= doc.getNumberOfPages(); i++) {
      doc.setPage(i); doc.setFontSize(8); doc.setTextColor(120);
      doc.text('Generated: ' + gen, M, H - 8);
      doc.text(`Page ${i} of ${doc.getNumberOfPages()}`, W - M, H - 8, { align: 'right' });
    }
    const safe = s => String(s || '').replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
    doc.save(`FOT_Comparison_${safe(curr.ptName) || 'Patient'}_${curr.testDate || 'now'}.pdf`);
  }

  Object.assign(root, {
    syncHeightToCm, onHeightUnitChange, onHeightCmInput, onHeightFtInput,
    updateHeightBothLabel, getBmiInfo, updateBmiField,
    onSmokeChange, updateSmokeSummary, getSmokeExposure,
    buildSnapshot, saveCurrentTest, exportTests, importTests,
    refreshCompareSelect, runComparison, downloadComparisonPDF
  });
})(typeof globalThis !== 'undefined' ? globalThis : window);
