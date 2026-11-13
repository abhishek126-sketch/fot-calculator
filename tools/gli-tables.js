'use strict';
// Regenerates gli-global-data.js from the GLI Global lookup-table workbook (gli_global_lookuptables_dec6.xlsx).
// Usage: unzip the .xlsx into a folder, then: node tools/gli-tables.js <unzipped-folder>
// Reads the six sheets (Male FEV1, Male FVC, Male FEV1 FVC, Female FEV1, Female FVC, Female FEV1 FVC), checks the age grid
// (3..95 by 0.25) and that Lspline is 0, and prints the [Mspline, Sspline] rows as JSON for gli-global-data.js.
const fs = require('fs'), path = require('path');
const dir = process.argv[2]; if (!dir) { console.error('usage: node tools/gli-tables.js <unzipped-xlsx-folder>'); process.exit(1); }
const ss = [...fs.readFileSync(path.join(dir, 'xl/sharedStrings.xml'), 'utf8').matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m => m[1].replace(/<[^>]+>/g, ''));
const names = ['m_fev1', 'm_fvc', 'm_ratio', 'f_fev1', 'f_fvc', 'f_ratio'], out = {};
names.forEach((name, i) => {
  const x = fs.readFileSync(path.join(dir, `xl/worksheets/sheet${i + 1}.xml`), 'utf8'), rows = [];
  for (const rm of x.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells = {};
    for (const c of rm[1].matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const v = (/<v>([\s\S]*?)<\/v>/.exec(c[3] || '') || [])[1]; if (v == null) continue;
      cells[c[1]] = /t="s"/.test(c[2]) ? ss[+v] : v;
    }
    rows.push(cells);
  }
  const data = rows.slice(1).filter(r => r.A != null);
  data.forEach((r, k) => { if (Math.abs(+r.A - (3 + k * 0.25)) > 1e-9) throw new Error(`${name}: age grid broken at row ${k}`); if (+r.D !== 0) throw new Error(`${name}: Lspline not 0`); });
  if (data.length !== 369) throw new Error(`${name}: ${data.length} rows, expected 369`);
  out[name] = data.map(r => [+r.B, +r.C]);
});
console.log(JSON.stringify(out));
