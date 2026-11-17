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

const f=catalog.find(t=>t.id==='fatzer-flc-2017-p25');
assert.equal(f.rows.length,23);assert.equal(new Set(f.rows.map(r=>r.diameter)).size,23);
assert.deepEqual(f.rows.map(r=>r.diameter),Array.from({length:23},(_,i)=>25+5*i));
for(const r of f.rows){
  assert.equal(r.fmin,r.fuk);assert.equal(r.design,r.fuk/2);
  assert.ok(Math.abs(Math.PI*r.equivalentDiameter**2/4-r.area)<1e-8);
  assert.ok(r.equivalentDiameter<r.diameter);assert.equal(r.socket,'树脂或金属浇注');
}
// Independent checkpoints read from FATZER 06-2017 printed p.25, including the nonuniform 125/130 mm force step.
for(const [d,fuk,area,ea,weight] of [[25,596,440,70.1,3.8],[60,3590,2424,414,21],[70,4890,3444,547,30],[125,15800,10636,1712,91],[130,16200,11385,1835,97],[135,17400,12368,1979,106]]){
  const r=f.rows.find(x=>x.diameter===d);assert.deepEqual([r.fuk,r.area,r.ea,r.weight],[fuk,area,ea,weight]);
}
assert.equal(f.rows.find(r=>r.diameter===70).design,2445);
assert.equal(selectRows(f,'70',2445).length,1);assert.equal(selectRows(f,'70',2446).length,0);
assert.equal(selectRows(f,'26','').length,0);assert.equal(selectRows(f,'140','').length,0);
assert.equal(selectRows(f,'',8701).length,0);assert.equal(selectRows(f,'',8700).length,1);
assert.equal(f.source.printedPage,25);assert.equal(f.source.pdfPage,26);assert.equal(f.source.sha256,t.source.sha256);
assert.equal(f.standard.factor,2);assert.equal(f.standard.clause,'5.6.1');
assert.ok(f.scope.includes('包含内部填充物'));assert.ok(f.scope.includes('不适用于不锈钢 FLC'));
assert.ok(f.productStandards.some(s=>s.includes('10264-3')));assert.ok(f.productStandards.some(s=>s.includes('13411-4')));
assert.equal(new Set(catalog.map(t=>t.id)).size,3);
console.log('PASS: FLC 23 specifications, original-source checkpoints, independent EA, conversions, no interpolation and product provenance.');
