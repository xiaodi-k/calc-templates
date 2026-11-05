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
    if(this.id==='dimensionInputs')for(const m of s.matchAll(/<input ([^>]+)>/g)){const n=new Element('input',m[1]);n.dataset.dim=m[1].match(/data-dim="([^"]+)"/)[1];dimensions[n.dataset.dim]=n;}
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
const context={document:doc,window:{print(){printed++;}},console};
vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(root,'steel-beam-column-core.js'),'utf8'),context);vm.runInContext(source,context);
function fire(id,event,target=nodes[id]){for(const fn of events[id+':'+event]||[])fn({target,preventDefault(){}});}
function change(id,value){nodes[id].value=value;fire('inputs','input',nodes[id]);fire('inputs','change',nodes[id]);}
function section(value){fire('inputs','change',{name:'section',type:'radio',value});}
function dim(key,value){dimensions[key].value=value;fire('inputs','input',dimensions[key]);}
assert.match(nodes.report.innerHTML,/8.2.5/);assert.match(nodes.checks.innerHTML,/10.481/);assert.match(nodes.status.innerHTML,/不满足/);
change('Mx','1');change('My','1');assert.match(nodes.status.innerHTML,/范围内满足/);
change('N','');assert.equal(nodes.checks.innerHTML,'');assert.equal(nodes.report.innerHTML,'');assert.match(nodes.status.textContent,/轴压力/);
change('N','100');assert.notEqual(nodes.report.innerHTML,'');assert.equal(nodes.status.className,'');
section('chs');assert(nodes.betaInputs.hidden);assert.match(nodes.report.innerHTML,/8.2.4/);assert.match(nodes.report.innerHTML,/圆管/);assert.doesNotMatch(nodes.checks.innerHTML,/绕 y 轴稳定/);
dim('t','100');assert.equal(nodes.report.innerHTML,'');assert.match(nodes.status.textContent,/一半/);
dim('t','8');assert.notEqual(nodes.report.innerHTML,'');
change('bmx','');assert.notEqual(nodes.report.innerHTML,'','hidden coefficients ignored for circular mode');
section('shs');assert(!nodes.betaInputs.hidden);assert.equal(nodes.report.innerHTML,'','empty visible coefficient rejected');
change('bmx','1');assert.match(nodes.report.innerHTML,/方管/);assert.match(nodes.report.innerHTML,/0.7/);
dim('B','500');dim('t','5');assert.match(nodes.warnings.innerHTML,/超过 S3/);assert.match(nodes.status.innerHTML,/不满足/);
section('i');assert.equal(dimensions.H.value,'100');assert.equal(dimensions.tf.value,'8');
change('N','10000');assert.match(nodes.checks.innerHTML,/超出范围/);assert.match(nodes.warnings.innerHTML,/欧拉临界力/);
fire('reset','click');assert.equal(nodes.N.value,'100');assert.equal(nodes.Mx.value,'50');assert.match(nodes.report.innerHTML,/工字钢/);
fire('print','click');assert.equal(printed,1);
for(const m of html.matchAll(/(?:src|href)="(steel-beam-column-[^"]+)"/g))assert.ok(fs.existsSync(path.join(root,m[1].split('?')[0])));
for(const s of [source,fs.readFileSync(path.join(root,'steel-beam-column-core.js'),'utf8')])assert(!/\bfetch\(|localStorage|XMLHttpRequest/.test(s),'no network or persistent data');
assert.match(fs.readFileSync(path.join(root,'developing.html'),'utf8'),/href="steel-beam-column-demo.html"/);
assert.match(fs.readFileSync(path.join(root,'index.html'),'utf8'),/2 个 demo/);
console.log('PASS DOM contracts: initialization, edits, invalid/stale-result clearing, 3 section modes, dimensions, hidden coefficients, local failure, Euler failure, reset, print, local links. Browser/layout unverified.');
