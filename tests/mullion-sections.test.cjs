'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const g=require('../mullion-sections.js'),c=require('../steel-beam-column-core.js');
const close=(a,b)=>assert.ok(Math.abs(a-b)<=1e-8*Math.max(1,Math.abs(b)),`${a} != ${b}`);
const load={grade:'Q235',process:'welded',N:100,Mx:5,My:3,Lx:2,Ly:3};
test('all 13 migrated sections have valid default geometry and editable dimensions',()=>{
  assert.equal(Object.keys(g.sections).length,13);
  for(const [type,section] of Object.entries(g.sections)){
    const p=Object.fromEntries(section.dims.map(d=>[d[0],d[2]]));
    const s=g.properties(type,p),svg=g.draw(type,p);
    for(const key of ['A','Ix','Iy','Wx','Wy','ix','iy'])assert(s[key]>0,`${type} ${key}`);
    assert.doesNotMatch(svg,/NaN|undefined/);
    for(const [key] of section.dims)assert(svg.includes('data-dim="'+key+'"'));
  }
});
test('solid circle, rectangle, triangle and rhombus match analytical centroid formulas',()=>{
  let s=g.properties('circle',{D:100});close(s.A,2500*Math.PI);close(s.Ix,Math.PI*100**4/64);
  s=g.properties('rect',{B:70,H:160});close(s.A,70*160);close(s.Ix,70*160**3/12);close(s.Iy,160*70**3/12);
  s=g.properties('stri',{B:140,H:160});close(s.A,140*160/2);close(s.cy,-160/6);close(s.Ix,140*160**3/36);close(s.Iy,160*140**3/48);close(s.Wx,s.Ix/(160*2/3));
  s=g.properties('rhomb',{B:120,H:160});close(s.A,120*160/2);close(s.Ix,120*160**3/48);close(s.Iy,160*120**3/48);
});
test('asymmetric channel and T section use their centroid and farthest fibre',()=>{
  const H=200,B=70,tf=12,tw=8;
  const s=g.properties('csh',{H,B,tf,tw});const webA=(H-2*tf)*tw,A=2*B*tf+webA,cx=webA*(-B/2+tw/2)/A;
  close(s.A,A);close(s.cx,cx);close(s.Wy,s.Iy/(B/2-cx));
  const t=g.properties('tee',{H,B,tf,tw}),ta=B*tf+(H-tf)*tw;
  const cy=(B*tf*(H/2-tf/2)+(H-tf)*tw*(-tf/2))/ta;
  close(t.A,ta);close(t.cy,cy);close(t.Wx,t.Ix/(H/2+cy));
});
test('invalid hollow geometry is rejected instead of silently turning solid',()=>{
  for(const [type,p] of [
    ['tube',{D:100,t:50}],['box',{H:100,B:80,tf:50,tw:5}],
    ['htri',{H:100,B:100,t:40}],['hrhomb',{H:100,B:100,t:40}],
    ['htrap',{H:100,B1:20,B2:80,t:30}],['tee',{H:100,B:80,tf:10,tw:80}]
  ])assert.throws(()=>g.properties(type,p),undefined,type);
  assert.throws(()=>g.properties('rect',{H:NaN,B:50}));
});
test('rectangular box core agrees with polygon integration and thin-wall subtraction',()=>{
  const p={...load,type:'box',H:160,B:70,tf:12,tw:8},s=c.section(p),other=g.properties('box',p);
  close(s.A,3856);close(s.Ix,(70*160**3-54*136**3)/12);close(s.Iy,(160*70**3-136*54**3)/12);
  for(const key of ['A','Ix','Iy','Wx','Wy','ix','iy'])close(s[key],other[key]);
  const r=c.calculate(p);assert.equal(r.local.rows.length,2);close(r.eta,.7);assert.equal(r.bx.curve,'c');
});
test('equal rectangular box exactly preserves the old square-tube calculations',()=>{
  const old=c.calculate({...load,type:'shs',B:150,t:8});
  const now=c.calculate({...load,type:'box',H:150,B:150,tf:8,tw:8});
  for(const key of ['strength','sx','sy','gx','gy','dx','dy','eta'])close(now[key],old[key]);
  close(now.local.utilization,old.local.utilization);assert.equal(now.passing,old.passing);
});
test('rectangular box rotation swaps axes, forces, lengths and stability results',()=>{
  const a=c.calculate({...load,type:'box',H:300,B:200,tf:8,tw:6});
  const b=c.calculate({...load,type:'box',H:200,B:300,tf:6,tw:8,Mx:load.My,My:load.Mx,Lx:load.Ly,Ly:load.Lx});
  close(a.sx,b.sy);close(a.sy,b.sx);close(a.strength,b.strength);close(a.local.utilization,b.local.utilization);
  assert.equal(a.bx.curve,'b');
});
test('box with either plate ratio at or below 20 takes adverse c curve',()=>{
  const r=c.calculate({...load,type:'box',H:300,B:100,tf:5,tw:5});
  assert.equal(r.bx.curve,'c');assert.equal(r.by.curve,'c');
  assert.throws(()=>c.calculate({...load,type:'box',H:100,B:100,tf:50,tw:5}));
});
