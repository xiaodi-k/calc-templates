'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {plate,weld,bearing,rebar,snapshot,restore,appendRecord,syncPlateThickness}=require('./supplement.js');
const plateSample={b:100,t:14,Fy:250,Mu:.5};
const weldSample={w:6,L:100,Fexx:490,n:2,V:30,qPeak:'',mode:'center'};
const bearingSample={fc:30,A1:6000,Bu:30};
const hook={no:5,fy:280,fc:35,s:110,cSide:70,cTB:70,location:'continuous',Din:100,tail:200,avail:320};
function near(a,b){assert.ok(Math.abs(a-b)<1e-9*Math.max(1,Math.abs(b)),String(a)+' vs '+b);}
test('independent steel, weld and bearing examples match hand calculations',()=>{
  const p=plate(plateSample), w=weld(weldSample), b=bearing(bearingSample);
  assert.equal(p.status,'pass');near(p.checks[0].capacity,.735);near(p.ratio,.5/.735);
  near(p.requiredThickness,Math.sqrt(3e6/22500));near(p.providedThickness,14);
  assert.equal(w.status,'pass');near(w.checks[0].capacity,.75*.60*490*6/Math.sqrt(2));near(w.checks[0].demand,150);
  assert.equal(b.status,'pass');near(b.checks[0].capacity,99.45);near(b.ratio,30/99.45);
});
test('plate and concrete compression inputs distinguish absence from a real zero',()=>{
  assert.equal(plate({...plateSample,Mu:''}).status,'invalid');
  assert.equal(plate({...plateSample,Mu:null}).status,'invalid');
  assert.equal(plate({...plateSample,Mu:0}).ratio,0);
  assert.equal(plate({...plateSample,b:10}).status,'invalid');
  assert.equal(plate({...plateSample,Mu:.736}).status,'fail');
  assert.equal(bearing({...bearingSample,A1:0}).status,'invalid');
  assert.equal(bearing({...bearingSample,Bu:0}).status,'pass');
  assert.equal(bearing({...bearingSample,Bu:100}).status,'fail');
});
test('weld checks handle eccentric demand, long welds and pure torque',()=>{
  assert.equal(weld({...weldSample,mode:'eccentric'}).status,'invalid');
  assert.equal(weld({...weldSample,mode:'eccentric',qPeak:100}).checks[0].demand,150);
  assert.equal(weld({...weldSample,mode:'eccentric',qPeak:1200,V:0}).status,'fail');
  assert.equal(weld({...weldSample,qPeak:'bad'}).status,'invalid');
  for(const p of [{n:0},{n:1.3},{L:23},{L:601},{V:-1},{Fexx:null}]) assert.equal(weld({...weldSample,...p}).status,'invalid');
  assert.equal(weld({...weldSample,L:24}).status,'pass');assert.equal(weld({...weldSample,L:600}).status,'pass');
});
test('90 degree hook development uses separate bend, tail and development checks',()=>{
  const h=rebar(hook);
  const mpaPerPsi=.006894757293168361;
  const calc=(280/mpaPerPsi)*15.9/(50*Math.sqrt(35/mpaPerPsi));
  assert.equal(h.status,'pass');near(h.checks[0].demand,95.4);near(h.checks[1].demand,190.8);
  near(h.checks[2].demand,Math.max(152.4,8*15.9,calc));
  near(h.hook.coefficient,50*Math.sqrt(mpaPerPsi));
  near(rebar({...hook,no:3}).checks[2].demand,152.4);
  assert.equal(rebar({...hook,tail:80}).status,'fail');
  assert.equal(rebar({...hook,Din:90}).status,'fail');
  assert.equal(rebar({...hook,avail:140}).status,'fail');
});
test('rebar material, detailing and end confinement limits',()=>{
  for (const p of [{no:7,fy:280},{no:9},{no:5.5},{fc:17},{fy:500},{location:'X'},
    {location:'end',cSide:63.49,cTB:63.49},{Din:''}]) assert.equal(rebar({...hook,...p}).status,'invalid');
  assert.notEqual(rebar({...hook,location:'end',cSide:63.5,cTB:60}).status,'invalid');
  assert.notEqual(rebar({...hook,no:8,fy:420}).status,'invalid');
  near(rebar({...hook,fc:100}).hook.effectiveFc,68.94757293168361);
  near(rebar({...hook,fc:100}).hook.calculated,rebar({...hook,fc:68.94757293168361}).hook.calculated);
});
test('snapshots are detached, restricted to known fields and can clear previous sections',()=>{
  const doc={};
  assert.deepEqual(snapshot(doc),{});
  restore(doc,{steel:{values:{...plateSample,unexpected:99,Mu:'0.5'},source:'外部名称'},constructor:{bad:true}});
  const old=snapshot(doc);
  assert.deepEqual(Object.keys(old),['steel']);
  assert.equal(old.steel.source,'独立输入');assert.equal(old.steel.values.Mu,.5);
  assert.equal(Object.hasOwn(old.steel.values,'unexpected'),false);
  old.steel.values.Mu=900;
  assert.equal(snapshot(doc).steel.values.Mu,.5);
  syncPlateThickness(doc,30);
  assert.equal(snapshot(doc).steel.values.t,14);
  restore(doc,{steel:{...old.steel,linkedThickness:true}});
  syncPlateThickness(doc,30);
  assert.equal(snapshot(doc).steel.values.t,30);
  restore(doc,{rebar:{values:{...hook,positionX:'bad'},source:'独立演示算例'}});
  assert.deepEqual(Object.keys(snapshot(doc)),['rebar']);
  assert.equal(snapshot(doc).rebar.source,'独立演示算例');
  restore(doc,{rebar:{values:{...hook,tail:80},source:'独立演示算例'}});
  assert.equal(snapshot(doc).rebar.source,'已修改的独立算例');
  for(const replacement of [{},null,undefined]){restore(doc,old);restore(doc,replacement);assert.deepEqual(snapshot(doc),{});}
});
test('record output labels independent scenarios, retains incomplete checks, excludes empty blocks',()=>{
  function node(tag){
    return {tag,children:[],textContent:'',append(...children){this.children.push(...children);},
      replaceChildren(){this.children=[];},text(){return this.textContent+this.children.map(c=>c.text()).join(' ');}};
  }
  const calls=[];
  const doc={createElement:node,defaultView:{EmbedReportMath:{supplement(doc,detail,id,values,result){calls.push([id,result.status]);}}}},parent=node('main');
  const record={steel:{values:{Mu:0,...plateSample,Bu:2000,A1:6000,fc:30},source:'独立输入'},
    rebar:{values:{...hook,tail:80},source:'已修改的独立算例'}};
  assert.equal(appendRecord(doc,parent,record),3);
  assert.deepEqual(calls,[['plate','pass'],['bearing','fail'],['hook','fail']]);
  for(const pattern of [/独立工况/,/弯矩/,/本项满足/,/本项超限/,/已修改的独立算例/,/190.8/,/17.1.7/])assert.match(parent.text(),pattern);
  assert.doesNotMatch(parent.text(),/焊缝群受力/);
  restore(doc,{steel:{values:{Mu:1},source:'独立输入'}});
  const partial=node('main');assert.equal(appendRecord(doc,partial),1);assert.match(partial.text(),/待补充/);
  const empty=node('main');assert.equal(appendRecord(doc,empty,{steel:{values:{fc:35}}}),0);
});
