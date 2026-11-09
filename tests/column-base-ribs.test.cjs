const assert=require('node:assert/strict'),C=require('../column-base/engine.js');
let checks=0;
function test(name,fn){fn();checks++;console.log('PASS',name);}
const row=(r,id)=>r.rows.find(x=>x.id===id);
test('legacy models retain ribbed numerical results',()=>{
 for(const preset of [C.DEFAULT,C.ORIGINAL,C.SCREEN]){
  const old=C.clone(preset);delete old.rib.enabled;
  assert(C.hasRibs(old));assert.deepEqual(C.calculate(old).rows,C.calculate(preset).rows);
 }
});
test('switch removes all rib checks and never supplies a rib-supported plate thickness',()=>{
 const p=C.clone(C.DEFAULT);p.rib.enabled=false;const before=JSON.stringify(p),r=C.calculate(p);
 assert.deepEqual(r.errors,[]);assert.equal(JSON.stringify(p),before);
 assert(!r.rows.some(x=>x.id.startsWith('rib')));assert(!r.allRows.some(x=>x.id.startsWith('rib')));
 for(const q of r.cases){assert.equal(q.ribX,null);assert.equal(q.ribY,null);assert.equal(q.plate.required,null);assert.equal(q.plate.govern,null);assert.deepEqual(q.plate.rows,[]);}
 const plate=row(r,'plate');assert.equal(plate.status,'pending');assert.equal(plate.limit,null);assert.equal(plate.ratio,null);
 assert.deepEqual(C.candidate(p,'plate'),[]);
});
test('inactive rib dimensions and material cannot affect loads, contacts or remaining checks',()=>{
 const p=C.clone(C.DEFAULT),original=C.calculate(p);p.rib.enabled=false;
 for(const k of Object.keys(p.rib))if(k!=='enabled')p.rib[k]=typeof p.rib[k]==='number'?null:'unused';
 const r=C.calculate(p);assert.deepEqual(r.errors,[]);
 for(const x of r.rows.filter(x=>x.id!=='plate'))assert.deepEqual(x,row(original,x.id));
 p.rib.enabled=true;assert(C.calculate(p).errors.length);
});
test('off/on restores dimensions and the exact original result',()=>{
 const p=C.clone(C.ORIGINAL),saved=C.clone(p.rib),original=C.calculate(p).rows;
 p.rib.enabled=false;C.calculate(p);p.rib.enabled=true;
 assert.deepEqual(p.rib,saved);assert.deepEqual(C.calculate(p).rows,original);
});
test('off works with uplift, biaxial eccentricity and optional key independently',()=>{
 const p=C.clone(C.DEFAULT);p.rib.enabled=false;p.key.enabled=false;p.loadPoint={enabled:true,height:500};p.controls.additionalUplift=100;
 p.loads=[{name:'biaxial',N:-100,Vx:20,Vy:30,Mx:4,My:5,seismic:false}];
 const r=C.calculate(p);assert.deepEqual(r.errors,[]);assert.equal(r.cases.length,2);assert.equal(r.cases[0].load.Mx,-11);assert.equal(r.cases[0].load.My,15);
 assert(row(r,'friction'));assert(!row(r,'keyW'));assert.equal(row(r,'plate').status,'pending');
 assert(r.cases.every(q=>q.contact.residual<.01));
});
test('invalid flag rejected and JSON false roundtrips',()=>{
 const p=C.clone(C.DEFAULT);p.rib.enabled='false';assert(C.validate(p).includes('加劲肋开关无效'));
 p.rib.enabled=false;assert.equal(C.clone(p).rib.enabled,false);assert.deepEqual(C.calculate(C.clone(p)).errors,[]);
});
console.log(checks+' optional-rib suites passed');
