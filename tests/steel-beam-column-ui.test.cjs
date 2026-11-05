/* DOM contract tests, not a browser/layout test. No third-party dependencies. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.join(__dirname,'..'),html=fs.readFileSync(path.join(root,'steel-beam-column-demo.html'),'utf8');
const source=fs.readFileSync(path.join(root,'steel-beam-column-demo.js'),'utf8');
const nodes={},dimensions={},events={};let printed=0;
class Element {
  constructor(tag,attrs=''){this.tagName=tag;this.hidden=false;this.dataset={};this.className='';this.type=(attrs.match(/type="([^"]+)"/)||[])[1]||'';this.name=(attrs.match(/name="([^"]+)"/)||[])[1]||'';this.value=(attrs.match(/value="([^"]*)"/)||[])[1]||'';this.initial=this.value;this._html='';this.textContent='';this.options=[];}
  set innerHTML(s){this._html=s;
    if(this.tagName==='select') {this.options=Array.from(s.matchAll(/<option(?: value="([^"]*)")?>([^<]*)<\/option>/g),m=>({value:m[1]??m[2],textContent:m[2]}));this.value=this.options[0]?.value||'';}
    if(this.id==='secPrev'){
      for(const key of Object.keys(dimensions))delete dimensions[key];
      for(const m of s.matchAll(/<input ([^>]+)>/g)){const n=new Element('input',m[1]);n.dataset.dim=m[1].match(/data-dim="([^"]+)"/)[1];dimensions[n.dataset.dim]=n;}
    }
  }
  get innerHTML(){return this._html;}
  get selectedOptions(){return this.options.filter(x=>x.value===this.value);}
  addEventListener(name,fn){(events[this.id+':'+name]??=[]).push(fn);}
  matches(selector){return selector==='[data-dim]'&&!!this.dataset.dim;}
  reset(){for(const n of Object.values(nodes))if(n.tagName==='input')n.value=n.initial;nodes.grade.value='Q235';}
}
for(const m of html.matchAll(/<([a-z]+)\b([^>]*\bid="([^"]+)"[^>]*)>/g)){assert(!nodes[m[3]],'duplicate id');const n=new Element(m[1],m[2]);n.id=m[3];nodes[n.id]=n;}
for(const m of html.matchAll(/<select id="([^"]+)">([\s\S]*?)<\/select>/g))nodes[m[1]].innerHTML=m[2];
const doc={getElementById:id=>{assert(nodes[id],`missing ${id}`);return nodes[id];}};
const context={document:doc,window:{print(){printed++;}},console,structuredClone};
vm.createContext(context);
for(const file of ['mullion-sections.js','steel-beam-column-core.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context);
vm.runInContext(source,context);
function fire(id,event,target=nodes[id]){for(const fn of events[id+':'+event]||[])fn({target,preventDefault(){}});}
function change(id,value){nodes[id].value=value;fire('inputs','input',nodes[id]);fire('inputs','change',nodes[id]);}
function section(value){fire('inputs','change',{name:'section-type',type:'radio',value,matches(){return false;}});}
function dim(key,value,commit=true){dimensions[key].value=value;fire('inputs','input',dimensions[key]);if(commit)fire('inputs','change',dimensions[key]);}
assert.match(nodes.report.innerHTML,/8.2.5/);assert.equal(dimensions.H.value,'200');assert.match(nodes.status.innerHTML,/不满足/);
assert.equal((nodes.sec.innerHTML.match(/name="section-type"/g)||[]).length,13);
assert.equal((nodes.sec.innerHTML.match(/ checked/g)||[]).length,1);
// Support is visible before selection, expressed in text and accessible labels.
const options=Array.from(nodes.sec.innerHTML.matchAll(/<label class="section-option ([^"]+)"[^>]*>([\s\S]*?)<\/label>/g));
assert.equal(options.filter(m=>m[1]==='supported').length,3);
assert.equal(options.filter(m=>m[1]==='pending').length,10);
for(const [,state,markup] of options){
  const key=markup.match(/value="([^"]+)"/)[1];
  assert.equal(state,['tube','box','ibeam'].includes(key)?'supported':'pending');
  assert.match(markup,state==='supported'?/可验算/:/待开发/);
  assert.match(markup,state==='supported'?/aria-label="[^\"]*可进行压弯验算/:/aria-label="[^\"]*暂不支持压弯验算/);
}
change('Mx','1');change('My','1');assert.match(nodes.status.innerHTML,/范围内满足/);
change('N','');assert.equal(nodes.checks.innerHTML,'');assert.equal(nodes.report.innerHTML,'');assert.match(nodes.status.textContent,/轴压力/);
change('N','100');assert.notEqual(nodes.report.innerHTML,'');assert.equal(nodes.status.className,'');
section('tube');assert(nodes.betaInputs.hidden);assert.match(nodes.report.innerHTML,/8.2.4/);assert.match(nodes.report.innerHTML,/圆管/);assert.doesNotMatch(nodes.checks.innerHTML,/绕 y 轴稳定/);
dim('t','100');assert.equal(nodes.report.innerHTML,'');assert.match(nodes.status.textContent,/一半/);
dim('t','8');assert.notEqual(nodes.report.innerHTML,'');
change('bmx','');assert.notEqual(nodes.report.innerHTML,'','hidden coefficients ignored for circular mode');
section('box');assert(!nodes.betaInputs.hidden);assert.equal(nodes.report.innerHTML,'','empty visible coefficient rejected');
change('bmx','1');assert.match(nodes.report.innerHTML,/箱型/);assert.match(nodes.report.innerHTML,/0.7/);
dim('B','500');dim('tf','5');assert.match(nodes.warnings.innerHTML,/超过 S3/);assert.match(nodes.status.innerHTML,/不满足/);
section('ibeam');assert.equal(dimensions.H.value,'200');assert.equal(dimensions.tf.value,'12');
dim('H','240.',false);assert.equal(dimensions.H.value,'240.','typing does not rebuild focused field');
dim('H','240.5');section('tube');section('ibeam');assert.equal(dimensions.H.value,'240.5','per-section dimensions persist');
for(const [key,definition] of Object.entries(context.MullionSections.sections)){
  section(key);
  for(const [dimKey] of definition.dims)assert.ok(dimensions[dimKey],`${key}: ${dimKey} editor`);
  assert.doesNotMatch(nodes.secPrev.innerHTML,/NaN|undefined/);
  if(!['tube','box','ibeam'].includes(key)){
    assert.match(nodes.sectionAvailability.textContent,/仅支持截面参数/);
    assert.equal(nodes.calculate.textContent,'更新截面参数');
    assert.match(nodes.status.innerHTML,/稳定计算待补充/);assert.equal(nodes.checks.innerHTML,'');
    assert.match(nodes.report.innerHTML,/截面参数/);assert.equal(nodes.process.disabled,true);
    assert.doesNotMatch(nodes.status.innerHTML,/满足/);
    const [key0]=definition.dims[0];const value=dimensions[key0].value;
    dim(key0,'');assert.equal(nodes.report.innerHTML,'');dim(key0,value);assert.match(nodes.report.innerHTML,/截面参数/);
  }
}
section('ibeam');assert.equal(nodes.process.disabled,false);
assert.equal(nodes.calculate.textContent,'更新计算');
assert.match(nodes.sectionAvailability.textContent,/支持强度、整体稳定及局部稳定/);
change('N','10000');assert.match(nodes.checks.innerHTML,/超出范围/);assert.match(nodes.warnings.innerHTML,/欧拉临界力/);
fire('reset','click');assert.equal(nodes.N.value,'100');assert.equal(nodes.Mx.value,'50');assert.equal(dimensions.H.value,'200');assert.match(nodes.report.innerHTML,/对称工字形/);
assert.match(nodes.sec.innerHTML,/value="ibeam"[^>]* checked/);
// All three supported choices execute the calculation core and full report,
// for both a passing load case and a clearly failing compression case.
for(const key of ['tube','box','ibeam']){
  section(key);change('N','10');change('Mx','0.1');change('My','0.1');
  assert.match(nodes.status.innerHTML,/范围内满足/,key);
  assert.match(nodes.checks.innerHTML,/截面强度/);assert.match(nodes.checks.innerHTML,/稳定/);
  assert.match(nodes.report.innerHTML,/欧拉力/);assert.match(nodes.report.innerHTML,/计算过程/);
  assert.equal(nodes.calculate.textContent,'更新计算');
  change('N','10000');assert.match(nodes.status.innerHTML,/不满足/,key);
}
fire('reset','click');
fire('print','click');assert.equal(printed,1);
for(const m of html.matchAll(/(?:src|href)="(steel-beam-column-[^"]+)"/g))assert.ok(fs.existsSync(path.join(root,m[1].split('?')[0])));
for(const s of [source,fs.readFileSync(path.join(root,'steel-beam-column-core.js'),'utf8')])assert(!/\bfetch\(|localStorage|XMLHttpRequest/.test(s),'no network or persistent data');
assert.match(fs.readFileSync(path.join(root,'developing.html'),'utf8'),/href="steel-beam-column-demo.html"/);
assert.match(fs.readFileSync(path.join(root,'index.html'),'utf8'),/2 个 demo/);
console.log('PASS DOM contracts: 13 section modes and dimensions, pending stability never passes, invalid/stale-result clearing, per-section state, decimal typing, rectangular box, hidden coefficients, reset, print, local links. Browser/layout unverified.');
