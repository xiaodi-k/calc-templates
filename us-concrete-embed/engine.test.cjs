'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {DEFAULTS, calculate, interact, paperCases} = require('./engine.js');
const solve = (overrides={}) => calculate({...DEFAULTS,...overrides});
function near(a,b) { assert.ok(Math.abs(a-b)<1e-9*Math.max(1,Math.abs(b)), String(a)+' ≠ '+b); }

test('browser and CommonJS entry points agree',()=>{
  const context={window:{}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'engine.js'),'utf8'),context);
  near(context.window.EmbedEngine.calculate(context.window.EmbedEngine.DEFAULTS).utilization,solve().utilization);
});
test('three load cases exercise ACI 318-25 inch-pound capacities with SI loads',()=>{
  for (const [overrides,n,v,u] of [
    [{},.2655424856888129,.34532971395159967,.34532971395159967],
    [{nu:40,mx:1.8,vy:-22},.3486921529247038,.3798626853467596,.3798626853467596],
    [{nu:12,mx:4.2,vy:18,mode:'contact',tPlus:25,tMinus:0},.41838035259087897,.3107967425564397,.41838035259087897]
  ]) {
    const r=solve(overrides);
    assert.equal(r.status,'pass');
    near(r.etaN,n); near(r.etaV,v); near(r.utilization,u);
    assert.equal(r.checks.length,9);
  }
});
test('group and single-anchor demands refer to the right force distribution',()=>{
  const r=solve({nu:40,mx:1.8,vy:-22});
  near(r.distribution.rows.reduce((s,x)=>s+x.tension,0),40);
  near(r.distribution.rows.reduce((s,x)=>s+x.y*x.tension,0)/1000,1.8);
  near(r.checks.find(x=>x.id==='steelN').demand,r.distribution.rows[2].tension/3);
  near(r.checks.find(x=>x.id==='steelV').demand,22/3);
  near(r.checks.find(x=>x.id==='breakoutN').demand,40);
  near(r.distribution.eccN,45);
});
test('2-row tension boundary, and 3-row contact about either edge',()=>{
  const single=solve({nx:2,ny:2,nu:20,mx:1.4,vy:3});
  assert.equal(single.status,'pass'); assert.equal(single.distribution.activeGroup,'top');
  near(single.distribution.eccN,0); near(single.distribution.maxT,10);
  for(const sign of [-1,1]){
    const r=solve({nu:12,mx:sign*4.2,vy:sign*18,mode:'contact',tPlus:sign>0?25:0,tMinus:sign<0?25:0});
    assert.equal(r.status,'pass');
    assert.equal(r.distribution.activeGroup,sign>0?'top':'bottom');
    near(r.distribution.compression,13); near(r.distribution.eccN,0);
  }
});
test('pure compression and no force',()=>{
  assert.equal(solve({nu:0,mx:0,vy:0}).utilization,0);
  const r=solve({nu:-25,mx:0,vy:0,mode:'contact',tPlus:0,tMinus:0});
  near(r.distribution.compression,25); near(r.utilization,0);
});
test('strongly eccentric loading, invalid geometry, incomplete materials and contact inputs are blocked',()=>{
  for(const bad of [
    {fc:null},{fc:' '},{nu:NaN},{mx:Infinity},{nx:2.2},{ny:1},{left:1},{anchorType:'rebar'},
    {fy:700,fu:420},{d:55},{sx:30},{eh:35},{ductile:null},{straight:170},
    {anchorType:'headed',dh:15},{anchorType:'headed',hef:635.1},
    {nu:0,mx:5},{nu:12,mx:4.2,mode:'contact',tPlus:null,tMinus:0},
    {nu:12,mx:40,mode:'contact',tPlus:25,tMinus:0},
    {nu:0,mx:-1,vy:8,mode:'contact',tPlus:25,tMinus:0},{tPlus:0},
    {mode:'contact',tPlus:11,tMinus:14},{cover:1000},{plateX:2000},{h:180}
  ]) {
    const r=solve(bad);
    assert.equal(r.status,'invalid',JSON.stringify(bad));
    assert.equal(r.utilization,null); assert.equal(r.checks.length,0);
    assert.ok(r.errors.length>0);
  }
});
test('headed and hooked anchors use separate steel shear and pullout equations',()=>{
  const hook=solve(), headed=solve({anchorType:'headed',straight:null,ductile:false});
  near(hook.trace.pullout,.65*.95*.9*35*64*16/1000);
  near(hook.trace.steelV,.65*.6*Math.PI*16**2/4*420/1000);
  near(headed.trace.pullout,.65*.95*8*Math.PI*(28**2-16**2)/4*35/1000);
  near(headed.trace.steelV,.60*Math.PI*16**2/4*420/1000);
  near(solve({eh:200}).trace.eh,4.5*16);
  assert.equal(hook.checks.find(x=>x.id==='sideface').applicable,false);
  assert.equal(solve({anchorType:'headed',left:60}).checks.find(x=>x.id==='sideface').applicable,true);
});
test('three near edges and narrow-member shear face are recalculated with the load direction',()=>{
  const r=solve({left:70,right:70,bottom:70});
  const g=r.trace.tensionGroups.all;
  near(g.he,140/3); near(g.ANco,19600); near(g.design,90.2328067988092);
  const up=solve(), dn=solve({vy:-20});
  assert.equal(up.trace.shearFaces[0].face,'top');
  assert.equal(dn.trace.shearFaces[0].face,'bottom');
  assert.ok(up.trace.shearFaces[0].ca<up.trace.shearFaces[0].far);
  for (const face of up.trace.shearFaces) assert.ok(face.design>0);
});
test('ACI 318-25 §17.8.3 includes small loads and checks the group concrete limit independently',()=>{
  near(interact(.2,.99).ratio,.2**(5/3)+.99**(5/3));
  const base=solve({nu:30,mx:0,vy:5}), n1=30/base.etaN, v1=5/base.etaV;
  const b=solve({nu:n1*.2,vy:v1*.98}); near(b.etaN,.2); assert.equal(b.status,'fail');
  near(b.utilization,.2**(5/3)+.98**(5/3));
  assert.equal(b.governing,'锚群混凝土拉剪组合');
  assert.equal(solve({nu:0,vy:v1*1.01}).status,'fail');
});
test('ACI 318-25 §17.8.4 compares forces on the same individual anchor and excludes pullout from group tension interaction',()=>{
  const r=solve({nu:12,mx:4.2,vy:18,mode:'contact',tPlus:25,tMinus:0});
  const {steel,steelRows,concrete}=r.trace.interaction;
  const expected=Math.max((18/3/r.trace.steelV)**2,(25/3/r.trace.steelN)**2);
  near(steel.ratio,expected);
  near(steelRows[2].demandV,0); near(steelRows[0].demandN,0);
  near(concrete.capacityN,r.trace.cone); assert.ok(r.etaN>concrete.etaN);
  const reversed=solve({nu:12,mx:4.2,vy:-18,mode:'contact',tPlus:25,tMinus:0});
  near(reversed.trace.interaction.steel.ratio,(18/3/r.trace.steelV)**2+(25/3/r.trace.steelN)**2);
});
test('ACI table 21.2.1 and inch-pound equations reproduce basic steel, concrete cone, edge shear and pryout',()=>{
  const t=solve().trace,g=t.tensionGroups.all,f=t.shearFaces[0];
  const kN=.0044482216152605, MPa=.006894757293168361;
  near(g.Nb,24*Math.sqrt(35/MPa)*(165/25.4)**1.5*kN);
  near(g.design,.65*.95*g.ANc/g.ANco*g.psiEd*g.Nb);
  near(f.Vb,Math.min(7*(125/16)**.2*Math.sqrt(16/25.4),9)*Math.sqrt(35/MPa)*(f.ca/25.4)**1.5*kN);
  near(t.pryout,2*.75*t.tensionGroups[t.controllingPry].nominal);
  const deep=solve({anchorType:'headed',hef:279.4,h:400,left:550,right:550,bottom:550,top:550}).trace;
  near(deep.tensionGroups.all.Nb,16*Math.sqrt(35/MPa)*11**(5/3)*kN);
  near(solve({hef:63.5,straight:55}).trace.kcp,2);
  near(solve({hef:63.49,straight:55}).trace.kcp,1);
  near(solve({fy:800,fu:1000}).trace.fut,125000*MPa);
  assert.equal(solve({fc:69}).status,'invalid');
});
test('embedded nut requires effective areas, confirmation and a realistic hexagonal bearing envelope',()=>{
  for(const bad of [{},{aseN:1000},{aseV:1000},{bearingArea:1000},{bearingArea:null},{straight:200}]) {
    const overrides=Object.keys(bad).length?{nutDetailVerified:true,...bad}:bad;
    assert.equal(solve({anchorType:'headedBolt',...overrides}).status,'invalid');
  }
  const t=solve({anchorType:'headedBolt',nutDetailVerified:true,aseN:150,aseV:155,bearingArea:165}).trace;
  near(t.steelN,.75*150*420/1000); near(t.steelV,.65*.6*155*420/1000);
  near(t.pullout,.65*.95*8*165*35/1000); near(t.Abrg,165);
  const close=solve({anchorType:'headedBolt',nutDetailVerified:true,left:60}).trace;
  const s=close.sideControl; near(s.factor,1+280/(6*60));
  near(s.design,.65*.95*160*(60/25.4)*Math.sqrt(165/25.4**2)*Math.sqrt(35/.006894757293168361)*.0044482216152605*s.factor);
  const edge=solve({anchorType:'headed',left:64,bottom:64,mx:-1.8});
  const solo=edge.trace.sideSingle;
  assert.equal(solo.row,1); assert.equal(solo.col,1);
  near(solo.corner,.5); near(solo.demand,edge.distribution.rows[0].perAnchor);
  near(edge.checks.find(c=>c.id==='sidefaceSingle').ratio,solo.demand/solo.design);
  near(edge.trace.interaction.concrete.capacityN,Math.min(edge.trace.cone,edge.trace.sideface));
});
test('general shear coefficient does not require or automatically increase with the welded-attachment plate thickness',()=>{
  const thin=solve({plateThickness:6}), thick=solve({plateThickness:25});
  near(thin.trace.enhancedPlateThreshold,9.525); near(thin.trace.plateThickness,6);
  assert.equal(thin.trace.usesEnhancedShear,false);
  near(thin.trace.shearFaces[0].Vb,thick.trace.shearFaces[0].Vb);
  assert.equal(solve({plateThickness:0}).status,'invalid');
});
test('one-sided phi20 by 100 and opposed bars phi20 by 60 give geometric comparisons only',()=>{
  const base={anchorType:'weldedRebar',d:20};
  for(const [n,len,diam,expected] of [[1,100,20,'pass'],[1,99,20,'fail'],[2,60,20,'pass'],[2,59,20,'fail'],[2,65,19,'pass']]){
    const r=solve({...base,endBarDiameter:diam,endBarCount:n,endBarLength:len});
    assert.equal(r.status,'special'); assert.equal(r.utilization,null);
    assert.equal(r.specialChecks[0].status,diam===20?'pass':'fail'); assert.equal(r.specialChecks[1].status,expected);
    assert.ok(r.specialChecks.find(c=>c.clause.includes('8.3.4'))); assert.ok(r.specialChecks.some(c=>c.status==='review'));
    assert.equal(r.checks.length,0);
  }
  assert.equal(solve({...base,endBarCount:3}).status,'invalid');
});
test('article calculations are independent of the demo geometry',()=>{
  const cases=paperCases();
  near(cases[0].author.sum,.9434328710825237); near(cases[0].withBreakout.utilization,2.0342424870018596);
  near(cases[1].author.sum,1.0442272136836417); near(cases[1].withBreakout.utilization,2.799167794655838);
});
