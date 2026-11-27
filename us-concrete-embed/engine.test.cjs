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
test('three spreadsheet examples match fully recalculated governing values',()=>{
  for (const [overrides,n,v,u] of [
    [{},.23526673728784503,.34050779522684055,.47981211042890465],
    [{nu:40,mx:1.8,vy:-22},.3089361196709076,.3745585747495246,.5695789120170268],
    [{nu:12,mx:4.2,vy:18,mode:'contact',tPlus:25,tMinus:0},.369071239606954,.30645701570415645,.5629402127592587]
  ]) {
    const r=solve(overrides);
    assert.equal(r.status,'pass');
    near(r.etaN,n); near(r.etaV,v); near(r.utilization,u);
    assert.equal(r.checks.length,8);
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
    {anchorType:'headed',dh:15},{anchorType:'headed',hef:280},
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
  near(hook.trace.pullout,.70*.9*35*64*16/1000);
  near(hook.trace.steelV,.65*.6*Math.PI*16**2/4*420/1000);
  near(headed.trace.pullout,.70*8*Math.PI*(28**2-16**2)/4*35/1000);
  near(headed.trace.steelV,.60*Math.PI*16**2/4*420/1000);
  near(solve({eh:200}).trace.eh,4.5*16);
  assert.equal(hook.checks.find(x=>x.id==='sideface').applicable,false);
  assert.equal(solve({anchorType:'headed',left:60}).checks.find(x=>x.id==='sideface').applicable,true);
});
test('three near edges and narrow-member shear face are recalculated with the load direction',()=>{
  const r=solve({left:70,right:70,bottom:70});
  const g=r.trace.tensionGroups.all;
  near(g.he,140/3); near(g.ANco,19600); near(g.design,101.84458748505);
  const up=solve(), dn=solve({vy:-20});
  assert.equal(up.trace.shearFaces[0].face,'top');
  assert.equal(dn.trace.shearFaces[0].face,'bottom');
  assert.ok(up.trace.shearFaces[0].ca<up.trace.shearFaces[0].far);
  for (const face of up.trace.shearFaces) assert.ok(face.design>0);
});
test('ACI §17.8 checks both individual limits and crossing the 0.2 threshold',()=>{
  assert.equal(interact(.2,.99).required,false);
  assert.equal(interact(.201,.99).required,true);
  near(interact(.22,.99).ratio,1.21/1.2);
  const base=solve({nu:30,mx:0,vy:5}), n1=30/base.etaN, v1=5/base.etaV;
  const b=solve({nu:n1*.2,vy:v1*.98}); near(b.etaN,.2); near(b.utilization,.98);
  assert.equal(solve({nu:n1*.22,vy:v1*.99}).status,'fail');
  assert.equal(solve({nu:0,vy:v1*1.01}).status,'fail');
});
test('article calculations are independent of the demo geometry',()=>{
  const cases=paperCases();
  near(cases[0].author.sum,.9434328710825237); near(cases[0].withBreakout.utilization,2.0342424870018596);
  near(cases[1].author.sum,1.0442272136836417); near(cases[1].withBreakout.utilization,2.799167794655838);
});
