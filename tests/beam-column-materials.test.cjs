'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const C=require('../beam-column-materials.js'),S=require('../steel-beam-column-core.js');
const box={type:'box',H:200,B:160,tf:16,tw:16,N:40,Mx:2,My:1,Lx:2,Ly:2,bmx:1,bmy:1};
const stainless={...box,family:'stainless',grade:'S30408',process:'ss-welded'};
const aluminium={...box,family:'aluminium',grade:'AL6061T6',process:'al-unwelded',product:'profile'};
function close(a,b,tol=1e-8){assert.ok(Math.abs(a-b)<=tol*Math.max(1,Math.abs(b)),`${a} != ${b}`);}
test('all six stainless and four aluminium grades match the mullion catalogue',()=>{
  const text=fs.readFileSync(path.join(__dirname,'../mullion.html'),'utf8');
  const ss=[...text.matchAll(/id:\s*'(S\d{5})'/g)].map(x=>x[1]);
  const al=[...text.matchAll(/id:\s*'(AL\w+)'/g)].map(x=>x[1]);
  assert.deepEqual([...C.grades.stainless].sort(),ss.sort());
  assert.deepEqual([...C.grades.aluminium].sort(),al.sort());
  for(const g of [...ss,...al]){const m=C.material({...aluminium,...(ss.includes(g)?stainless:{}),grade:g,product:g==='AL5083'?'tube':'profile'},{tmax:16});const row=text.split('\n').find(x=>x.includes("id: '"+g+"'"));assert.match(row,new RegExp('E: *'+m.E));assert.match(row,new RegExp('f: *'+m.f+'[,]'));}
});
test('material values distinguish nominal proof strength, design strength and product',()=>{
  for(const [grade,f,fy,E] of [['S30408',175,205,193000],['S30403',145,170,193000],['S31608',175,205,193000],['S31603',145,170,193000],['S22053',385,450,200000],['S22253',385,450,200000]]){
    const m=C.material({...stainless,grade},{tmax:16});assert.deepEqual([m.f,m.fy,m.E],[f,fy,E]);
  }
  for(const [grade,f,fy,hardening] of [['AL6061T6',200,240,'weak'],['AL6063T5',90,110,'strong'],['AL6063T6',150,180,'weak'],['AL5083',90,110,'strong']]){
    const m=C.material({...aluminium,grade,product:grade==='AL5083'?'tube':'profile'},{tmax:16});assert.deepEqual([m.f,m.fy,m.hardening],[f,fy,hardening]);
  }
  const tube=C.material({...aluminium,grade:'AL6063T6',product:'tube'},{tmax:16});close(tube.f,141.666666666667);assert.equal(tube.fy,170);
  assert.throws(()=>C.material({...aluminium,grade:'AL5083'},{tmax:16}),/未列/);
  assert.throws(()=>C.material({...aluminium,grade:'AL6063T5',product:'tube'},{tmax:16}),/未列/);
  assert.throws(()=>C.material({...aluminium,type:'i',product:'tube'},{tmax:16}),/管材数据仅用于/);
  assert.throws(()=>C.material({...aluminium,product:'verified',f02:NaN},{tmax:16}),/f0.2/);
  const proof=C.material({...aluminium,product:'verified',f02:180},{tmax:16});assert.equal(proof.f,150);
  assert.equal(C.material({...aluminium,product:'verified',f02:400},{tmax:16}).f,200);
});
test('CECS 5.2.2 curves: manufacturing route and stainless family matter',()=>{
  const m=C.material(stainless,{tmax:16}),d=C.material({...stainless,grade:'S22053'},{tmax:16});
  assert.deepEqual(C.ssCurve({...stainless,type:'i'},m,'y'),[.89,.26]);
  assert.deepEqual(C.ssCurve({...stainless,type:'i'},d,'y'),[.69,.37]);
  assert.deepEqual(C.ssCurve({...stainless,type:'chs',process:'ss-cold'},m,'x'),[.36,0]);
  assert.deepEqual(C.ssCurve({...stainless,process:'ss-cold'},d,'x'),[.6,.56]);
  assert.deepEqual(C.ssCurve({...stainless,type:'chs',process:'ss-other'},d,'x'),[.89,.26]);
  // Independently evaluated with 40-digit decimal arithmetic, q = 1.2508.
  close(C.perry(1,.66,.24),.499467423839482386576,1e-12);
  assert.equal(C.perry(.1,.66,.24),1);
});
test('GB Appendix B uses both published tables and interpolation without extrapolation',()=>{
  for(const [grade,points] of [['AL6061T6',[[0,1],[9,.996],[10,.993],[50,.710],[60,.583],[100,.254],[150,.119]]],['AL6063T5',[[0,1],[6,.996],[10,.970],[50,.615],[60,.507],[100,.234],[150,.113]]]]){
    const m=C.material({...aluminium,grade},{tmax:16});
    for(const [index,phi] of points)close(C.buckling(index/Math.sqrt(m.fy/240),m).phi,phi);
    close(C.buckling(50.5/Math.sqrt(m.fy/240),m).phi,grade==='AL6061T6'?.704:.6095);
    assert.equal(C.buckling(150.01/Math.sqrt(m.fy/240),m).outOfTable,true);
  }
});
test('independent short square-tube checks recover exact axial stress at negligible slenderness',()=>{
  const p={...stainless,type:'box',H:100,B:100,tf:10,tw:10,Lx:.01,Ly:.01,N:36,Mx:0,My:0};
  const r=C.calculate(p);assert.equal(r.s.A,3600);close(r.strength,10);close(r.sx,10);close(r.sy,10);
  const a=C.calculate({...p,family:'aluminium',grade:'AL6061T6',process:'al-unwelded',product:'profile'});
  close(a.sx,10);close(a.checks[0].value,.05);
});
test('standard-specific Euler divisors, second-order multipliers and plasticity',()=>{
  const r=C.calculate(stainless),a=C.calculate(aluminium);
  close(r.NEx/r.Npx,1.165);close(a.NEx/a.Npx,1.2);
  close(r.ax,r.bx.phi);assert.equal(a.ax,.75);
  assert.equal(C.calculate({...aluminium,grade:'AL6063T5'}).ax,.9);
  close(r.NEx/a.NEx,193000/70000);
  for(const base of [stainless,aluminium]){
    const v=C.calculate({...base,type:'i',H:200,B:100,tf:16,tw:12});
    assert.equal(v.gx,1);assert.equal(v.gy,base.family==='stainless'?1:1.05);
    assert.ok(v.ltb.x.phi<1);assert.ok(v.ltb.x.Mcr>0&&v.ltb.y.Mcr>0);
    assert.ok(v.ltb.y.phi<=1);assert.ok(v.ltb.J>0&&v.ltb.Iw>0);
  }
});
test('independent biaxial box benchmark: 100x100x10, lambda x/y=50, N=36 kN, M=1/0.5 kNm',()=>{
  // 40-digit Decimal reference: A=3600, Ix=Iy=4920000, Wx=Wy=98400.
  // The length fixes the AL Appendix B lookup exactly at 50 (phi=.710).
  const p={type:'box',H:100,B:100,tf:10,tw:10,N:36,Mx:1,My:.5,Lx:50*Math.sqrt(4920000/3600)/1000,Ly:50*Math.sqrt(4920000/3600)/1000};
  const ss=C.calculate({...stainless,...p}),al=C.calculate({...aluminium,...p});
  close(ss.bx.phi,.8096052464775381);close(ss.NEx,2742960.4551507545);close(ss.dx,.9876210960411379);
  close(ss.strength,25.24390243902439);close(ss.sx,26.198589486050224);close(ss.sy,24.610509903187274);
  close(al.bx.phi,.710);close(al.NEx,994856.1236298073);close(al.dx,.9674324766863914);
  close(al.strength,25.24390243902439);close(al.sx,28.14613176032470);close(al.sy,26.450685254947647);
});
test('every listed grade passes a valid compact section and fails a large compression case',()=>{
  for(const [family,base] of [['stainless',stainless],['aluminium',aluminium]])for(const grade of C.grades[family]){
    const p={...base,grade,product:grade==='AL5083'?'tube':'profile'};
    assert.equal(C.calculate(p).passing,true,grade);
    const failed=C.calculate({...p,N:100000});assert.equal(failed.passing,false);assert.equal(failed.sx,Infinity);
  }
});
test('all three original shapes retain numerical checks for either material',()=>{
  for(const base of [stainless,aluminium])for(const type of ['i','box','chs']){
    const r=C.calculate({...base,type,H:200,B:100,tf:16,tw:12,D:120,t:12,process:base.family==='stainless'?(type==='chs'?'ss-cold':'ss-welded'):'al-unwelded'});
    assert.equal(r.available,true);assert.equal(r.checks.length,4);
    assert.ok(Number.isFinite(r.sx)&&Number.isFinite(r.sy));
  }
});
test('thin sections, out-of-table slenderness and HAZ cannot yield a false pass',()=>{
  for(const base of [stainless,aluminium]){
    const r=C.calculate({...base,tf:2,tw:2,N:0,Mx:0,My:0});
    assert.equal(r.available,false);assert.equal(r.passing,false);assert.equal(r.strength,null);assert.equal(r.sx,null);assert.deepEqual(r.checks.map(v=>v.id),['local']);
    const huge=C.calculate({...base,Lx:1000,Ly:1000});assert.equal(huge.passing,false);
  }
  assert.throws(()=>C.calculate({...aluminium,process:'al-welded'}),/热影响区/);
  const max=C.calculate({...aluminium,Lx:1000});assert.equal(max.sx,null);assert.ok(max.warnings.some(w=>/表格上限/.test(w)));
  assert.throws(()=>C.calculate({...stainless,process:'rolled'}),/制造工艺/);
  assert.throws(()=>C.calculate({...aluminium,grade:'S30408'}),/不匹配/);
});
test('CECS and aluminium local plate limits include grade/process changes and exact boundary',()=>{
  const a=C.material(aluminium,{tmax:16}),s=C.material(stainless,{tmax:16});
  assert.equal(C.local({...box,H:247,tw:10,tf:16},a).rows[1].limit,21.5);
  const boundary=C.local({...box,H:247,tw:10,tf:16},a);close(boundary.rows[1].ratio,21.5);assert.equal(boundary.ok,true);
  assert.equal(C.local({...box,H:247.001,tw:10,tf:16},a).ok,false);
  assert.equal(C.local(stainless,s).rows[0].limit,32);
  assert.equal(C.local({...stainless,process:'ss-cold'},s).rows[0].limit,44);
  assert.equal(C.local({...stainless,type:'chs',D:900,t:10},s).ok,true);
  assert.equal(C.local({...stainless,type:'chs',D:900.1,t:10},s).ok,false);
});
test('load signs, input validation and beta limits do not bypass safety gates',()=>{
  close(C.calculate({...stainless,Mx:-2,My:-1}).sx,C.calculate(stainless).sx);
  for(const [key,value] of [['N',NaN],['Lx',0],['Mx',Infinity],['bmx',.19],['bmy',1.01]])assert.throws(()=>C.calculate({...stainless,[key]:value}));
  assert.throws(()=>C.calculate({...aluminium,bmx:.29}));
  // Hidden carbon-only coefficients are not used in either new method.
  close(C.calculate({...stainless,btx:NaN,bty:NaN}).sx,C.calculate(stainless).sx);
});
test('carbon steel calculations remain identical through the dispatcher',()=>{
  for(const grade of C.grades.steel){const p={...box,grade,process:'welded'};assert.deepEqual(C.calculate(p),S.calculate(p));}
});
