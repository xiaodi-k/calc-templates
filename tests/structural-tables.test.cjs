const assert=require('node:assert/strict');const {catalog,selectRows}=require('../structural-tables-data.js');const t=catalog[0];
assert.equal(t.rows.length,36);assert.equal(new Set(t.rows.map(r=>r.diameter)).size,36);
for(const r of t.rows){assert.equal(r.design,r.fuk/2);assert.ok(Math.abs(Math.PI*r.equivalentDiameter**2/4-r.area)<1e-8);assert.ok(r.equivalentDiameter<r.diameter);}
const x=t.rows.find(r=>r.diameter===70);assert.equal(x.fuk,4430);assert.equal(x.design,2215);assert.equal(x.area,2840);assert.equal(x.equivalentDiameter.toFixed(3),'60.133');
assert.equal(t.rows[0].design,16.95);assert.equal(t.rows.at(-1).design,8250);
assert.equal(selectRows(t,'70',2215).length,1);assert.equal(selectRows(t,'70',2216).length,0);assert.equal(selectRows(t,'38','').length,0);assert.equal(selectRows(t,'','').length,36);assert.equal(selectRows(t,'',9000).length,0);assert.throws(()=>selectRows(t,'',-1));assert.throws(()=>selectRows(t,'','bad'));
for(const v of catalog){assert.ok(v.source.file&&v.source.printedPage&&(v.source.sha256||v.source.evidence)&&v.standard.clause&&v.standard.url);}
console.log('PASS: table coverage, force conversion, inverse-area diameters, thresholds, empty results, invalid input, provenance.');

const k=catalog.find(t=>t.id==='kinlong-stainless-2021-p97');
assert.equal(k.rows.length,20);assert.equal(new Set(k.rows.map(r=>r.diameter)).size,20);
assert.deepEqual(k.rows.map(r=>r.diameter),[30,32,34,36,38,40,42,45,48,52,56,60,65,70,75,80,85,90,95,100]);
for(const r of k.rows){assert.equal(r.design,r.fuk/2);assert.ok(Math.abs(Math.PI*r.equivalentDiameter**2/4-r.area)<1e-8);assert.equal(r.modulus,'1.30 ± 0.10');assert.equal(r.weight,undefined);}
assert.equal(k.rows[0].fuk,693.74);assert.equal(k.rows.at(-1).fuk,7350.99);
assert.equal(k.rows.find(r=>r.diameter===70).area,2889.67);
assert.equal(k.rows.find(r=>r.diameter===70).design,1801.71);
assert.equal(selectRows(k,'70',1801.71).length,1);assert.equal(selectRows(k,'70',1801.72).length,0);
assert.notEqual(k.forceLabel,t.forceLabel);assert.equal(k.source.pdfPage,null);
console.log('PASS: KINLONG 20 specifications, source semantics, conversions and thresholds.');
