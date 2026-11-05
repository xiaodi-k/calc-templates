'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const c=require('../steel-beam-column-core.js');
const input={type:'i',process:'rolled',grade:'Q235',H:100,B:100,tw:6,tf:8,N:100,Mx:50,My:50,Lx:2,Ly:2};
const close=(a,b,tol=1e-8)=>assert.ok(Math.abs(a-b)<=tol,`${a} ≠ ${b}`);
test('MSteel supplied report: independent numeric benchmark',()=>{
  // User report contains rounded radii and section properties with root fillets.
  // Inject only these independently given properties; production uses geometry.
  const s={...c.section(input),A:2164.6,Ix:75760.41*50,Iy:26729.48*50,Wx:75760.41,Wy:26729.48,ix:41.833,iy:24.848};
  const r=c.calculate(input,s);
  close(r.strength,2233.574,.0005);close(r.sx,2582.584,.0005);close(r.sy,2586.379,.0005);
  close(r.Npx/1000,1750.4,.05);close(r.Npy/1000,617.6,.05);
  close(r.bx.phi,.866,.0005);close(r.by.phi,.575,.0005);close(r.ltb.phi,.923,.0005);
});
test('analytical rectangular wall and I-section properties',()=>{
  const s=c.section(input);close(s.A,2104);close(s.Ix,3690485.3333333335);close(s.Iy,1334845.3333333333);
  const q=c.section({type:'shs',B:100,t:5});close(q.A,1900);close(q.Ix,2865833.3333333335);close(q.Ix,q.Iy);
  const p=c.section({type:'chs',D:100,t:5});close(p.A,475*Math.PI);close(p.Ix,Math.PI*(100**4-90**4)/64);
});
test('no compression reduces to biaxial strength and bending stability',()=>{
  const r=c.calculate({...input,N:0});close(r.strength,50e6/(1.05*r.s.Wx)+50e6/(1.2*r.s.Wy));
  close(r.sx,50e6/(1.05*r.s.Wx)+50e6/r.s.Wy);close(r.dx,1);
});
test('pure axial compression gives N / phi A in each plane',()=>{
  const r=c.calculate({...input,Mx:0,My:0});close(r.sx,1e5/(r.bx.phi*r.s.A));close(r.sy,1e5/(r.by.phi*r.s.A));
});
test('zero load does not produce NaN or a nonzero utilization',()=>{
  const r=c.calculate({...input,N:0,Mx:0,My:0});assert.ok(r.passing);close(r.strength,0);close(r.sx,0);close(r.sy,0);
});
test('moment signs do not change conservative biaxial envelope',()=>{
  const a=c.calculate(input),b=c.calculate({...input,Mx:-50,My:-50});close(a.strength,b.strength);close(a.sx,b.sx);close(a.sy,b.sy);
});
test('longer lengths reduce stability capacity',()=>{
  const a=c.calculate({...input,N:50,Mx:1,My:1}),b=c.calculate({...input,N:50,Mx:1,My:1,Lx:3,Ly:3});assert.ok(b.sx>a.sx&&b.sy>a.sy);assert.ok(b.by.phi<a.by.phi);
});
test('closed box applies eta=0.7 and no LTB reduction',()=>{
  const r=c.calculate({...input,type:'shs',process:'welded',B:150,t:8});close(r.eta,.7);close(r.ltb.phi,1);
  close(r.sx,r.N/(r.bx.phi*r.s.A)+r.Mx/(r.gx*r.s.Wx*r.dx)+.7*r.My/r.s.Wy);
});
test('circular section uses vector moment, maximum slenderness, beta=1',()=>{
  const p={...input,type:'chs',process:'seamless',D:200,t:10,Mx:3,My:4,Lx:2,Ly:3};
  const r=c.calculate(p),q=c.calculate({...p,Mx:5,My:0}),swap=c.calculate({...p,Lx:3,Ly:2});
  close(r.strength,q.strength);close(r.sx,q.sx);close(r.sx,swap.sx);close(r.sx,r.sy);assert.equal(r.checks.length,3);
  close(r.strength,r.N/r.s.A+5e6/(1.15*r.s.Wx));
});
test('material bands at boundaries and actual fy versus nominal epsilon',()=>{
  assert.equal(c.material('Q235',16).f,215);assert.equal(c.material('Q235',16.01).f,205);
  assert.equal(c.material('Q345',40).f,295);assert.equal(c.material('Q345',40.01).fy,325);
  assert.equal(c.material('Q345',31,true).f,260);assert.equal(c.material('Q345',31,false).f,295);
  close(c.material('Q345',50).epsilon,Math.sqrt(235/345));
});
test('manufacturing and b/h determine buckling curves',()=>{
  assert.deepEqual(c.curves(input,c.section(input),c.material('Q235',8)),['b','c']);
  assert.deepEqual(c.curves({...input,H:200},c.section({...input,H:200}),c.material('Q235',8)),['a','b']);
  assert.deepEqual(c.curves({...input,process:'welded-flame'},c.section(input),c.material('Q235',8)),['b','b']);
  const p={...input,H:300,B:300,tf:40};assert.deepEqual(c.curves(p,c.section(p),c.material('Q235',40)),['b','c']);
});
test('D.0.5 short-slenderness formula and piecewise c/d coefficients',()=>{
  const lambda=.2*Math.PI*Math.sqrt(c.E/235);close(c.buckling(lambda,235,'b').phi,1-.65*.2**2);
  const large=1.06*Math.PI*Math.sqrt(c.E/235);assert.deepEqual(c.buckling(large,235,'c').coefficients,[.73,1.216,.302]);
  for(const curve of ['a','b','c','d'])for(const l of [1,20,50,100,200,500])assert.ok(c.buckling(l,235,curve).phi>0&&c.buckling(l,235,curve).phi<=1);
});
test('C.0.5 has no duplicate 0.6 correction; C.0.1 used outside its scope',()=>{
  const s=c.section(input),m=c.material('Q235',8),short=c.lateral(input,s,m,80);
  close(short.phi,1.07-80**2/44000);
  const long=c.lateral(input,s,m,160);assert.match(long.method,/C.0.1/);assert.ok(long.phi>0&&long.phi<1);
  const raw=4320/160**2*s.A*100/s.Wx*Math.sqrt(1+(160*8/440)**2);close(long.phi,raw>.6?Math.min(1,1.07-.282/raw):raw);
});
test('local plate failure prevents a green capacity conclusion',()=>{
  const r=c.calculate({...input,type:'shs',process:'welded',B:500,t:5,N:1,Mx:.1,My:.1});
  assert.equal(r.local.ok,false);assert.equal(r.passing,false);assert.equal(r.gx,1);assert.ok(r.warnings.some(x=>x.includes('有效截面')));
});
test('zero or negative second-order denominator never gives negative passing ratio',()=>{
  const r=c.calculate({...input,N:10000});assert.equal(r.inRange,false);assert.equal(r.passing,false);assert.equal(r.sx,Infinity);assert.equal(r.sy,Infinity);
});
test('equivalent moment coefficients are applied to their intended terms',()=>{
  const r=c.calculate(input),q=c.calculate({...input,bmx:.6,bmy:.7,btx:.8,bty:.9});
  close(r.sx-q.sx,.4*r.Mx/(r.gx*r.s.Wx*r.dx)+.1*r.My/r.s.Wy,1e-8);
  close(r.sy-q.sy,.2*r.Mx/(r.ltb.phi*r.s.Wx)+.3*r.My/(r.gy*r.s.Wy*r.dy),1e-8);
});
test('invalid inputs are rejected instead of silently clamped',()=>{
  for(const p of [{N:-1},{Mx:NaN},{Ly:0},{Lx:Infinity},{tf:50},{tw:100},{bmx:0},{grade:'Q355'},{process:'cold'},{type:'chs',process:'seamless',D:100,t:50},{type:'chs',process:'seamless',D:200,t:40}])assert.throws(()=>c.calculate({...input,...p}));
});
test('geometric scaling preserves ratios with similarly scaled design actions',()=>{
  const r=c.calculate(input),q=c.calculate({...input,H:200,B:200,tf:16,tw:12,N:400,Mx:400,My:400,Lx:4,Ly:4});
  close(r.strength,q.strength);close(r.sx,q.sx);close(r.sy,q.sy);close(r.local.utilization,q.local.utilization);
});
