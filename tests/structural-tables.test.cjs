const assert=require('node:assert/strict');const {catalog,selectRows}=require('../structural-tables-data.js');const t=catalog[0];
assert.equal(t.rows.length,36);assert.equal(new Set(t.rows.map(r=>r.diameter)).size,36);
for(const r of t.rows){assert.equal(r.design,r.fuk/2);assert.ok(Math.abs(Math.PI*r.equivalentDiameter**2/4-r.area)<1e-8);assert.ok(r.equivalentDiameter<r.diameter);}
const x=t.rows.find(r=>r.diameter===70);assert.equal(x.fuk,4430);assert.equal(x.design,2215);assert.equal(x.area,2840);assert.equal(x.equivalentDiameter.toFixed(3),'60.133');
assert.equal(t.rows[0].design,16.95);assert.equal(t.rows.at(-1).design,8250);
assert.equal(selectRows(t,'70',2215).length,1);assert.equal(selectRows(t,'70',2216).length,0);assert.equal(selectRows(t,'38','').length,0);assert.equal(selectRows(t,'','').length,36);assert.equal(selectRows(t,'',9000).length,0);assert.throws(()=>selectRows(t,'',-1));assert.throws(()=>selectRows(t,'','bad'));
for(const v of catalog){assert.ok(v.source.file&&v.source.printedPage&&v.source.pdfPage&&v.source.sha256&&v.standard.clause&&v.standard.url);}
console.log('PASS: table coverage, force conversion, inverse-area diameters, thresholds, empty results, invalid input, provenance.');
