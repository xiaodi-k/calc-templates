import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8'),source=readFileSync(new URL('../feedback.js',import.meta.url),'utf8');
const nodes={},calls=[];let deferred=null,released=null,denied=false,restored=false;
class Element {
 constructor(tag){this.tagName=tag.toUpperCase();this.children=[];this.events={};this.dataset={};this.hidden=false;this.disabled=false;this.value='';this.text='';this.className='';this.classList={toggle(){}};}
 set textContent(s){this.text=String(s);this.children=[];}get textContent(){return this.text+this.children.map(c=>c.textContent).join('');}
 append(...nodes){this.children.push(...nodes);}replaceChildren(...nodes){this.text='';this.children=[...nodes];}
 setAttribute(k,v){this[k]=v;}addEventListener(k,fn){(this.events[k]??=[]).push(fn);}async fire(k){for(const fn of this.events[k]||[])await fn({preventDefault(){},target:this});}click(){return this.fire('click');}scrollIntoView(){}reset(){}
 querySelectorAll(selector){return this.children.flatMap(c=>[...(selector==='button[data-restore]'&&c.dataset.restore||selector==='.feedback-delete-button'&&c.className.includes('feedback-delete-button')?[c]:[]),...c.querySelectorAll(selector)]);}
 querySelector(){return this.submit??=new Element('button');}
}
for(const match of html.matchAll(/<([a-z]+)\b([^>]*\bid="([^"]+)"[^>]*)>/g)){assert(!nodes[match[3]],'duplicate id');const n=new Element(match[1]);n.hidden=/\bhidden\b/.test(match[2]);nodes[match[3]]=n;}
const row={id:'11111111-1111-4111-8111-111111111111',nickname:'reader',title:'Deleted title',body:'<img src=x onerror=alert(1)>',created_at:'2026-11-04T00:00:00Z',hidden:true,attachments:[]};
const fetch=async(url,init={})=>{
 const data=init.body?JSON.parse(init.body):null;calls.push({url,data});
 if(url.includes('/auth/'))return Response.json({access_token:'fixture-access'});
 if(url.includes('/rest/'))return Response.json([]);
 if(data.action==='admin_status')return Response.json({is_admin:true});
 if(denied)return Response.json({error:'denied'},{status:403});
 if(data.action==='restore'){restored=true;return Response.json({ok:true});}
 if(data.action==='trash_replies')return Response.json({items:[{...row,hidden:false},{...row,hidden:true}],has_more:false,next_offset:2});
 if(data.action==='trash_list'){
  if(deferred)return new Promise(resolve=>{released=()=>resolve(Response.json({items:[row],has_more:false,next_offset:1}));});
  return Response.json({items:restored?[]:data.kind==='thread'?[row]:[{...row,thread:{title:'Parent',hidden:true}}],has_more:false,next_offset:1});
 }
 throw Error('Unexpected request');
};
const window={FEEDBACK_CONFIG:{supabaseUrl:'https://fixture.invalid',publishableKey:'public-test',turnstileSiteKey:'test'},confirm:()=>true,turnstile:{render:()=>1}};
vm.runInNewContext(source,{window,document:{getElementById:id=>{assert(nodes[id],'missing '+id);return nodes[id];},createElement:tag=>new Element(tag)},fetch,Response,URL,Intl,Date,FormData,console,setTimeout:()=>0});
const settle=async()=>{for(let i=0;i<8;i++)await new Promise(resolve=>setImmediate(resolve));};
const findButton=(root,label)=>{for(const c of root.children){if(c.tagName==='BUTTON'&&c.textContent===label)return c;const found=findButton(c,label);if(found)return found;}};
await settle();assert(nodes['feedback-trash-open'].hidden);await nodes['feedback-trash-open'].click();assert(!calls.some(c=>c.data?.action==='trash_list'));
await nodes['feedback-admin-form'].fire('submit');assert(!nodes['feedback-trash-open'].hidden);await nodes['feedback-trash-open'].click();await settle();assert(!nodes['feedback-trash'].hidden);assert(nodes['feedback-trash-list'].textContent.includes(row.body),'untrusted text remains literal');
await findButton(nodes['feedback-trash-list'],'查看全部回复').click();await settle();assert(nodes['feedback-trash-list'].textContent.includes('随所属留言隐藏'));assert(nodes['feedback-trash-list'].textContent.includes('这条回复也被单独删除'));
await nodes['feedback-trash-reply'].click();await settle();assert(nodes['feedback-trash-list'].textContent.includes('请先在'));assert(!findButton(nodes['feedback-trash-list'],'恢复回复'));
await nodes['feedback-trash-thread'].click();await settle();await findButton(nodes['feedback-trash-list'],'恢复留言').click();await settle();assert(restored);assert(nodes['feedback-trash-list'].textContent.includes('没有已删除'));
restored=false;deferred=true;const pending=nodes['feedback-trash-refresh'].click();await settle();assert(released);await nodes['feedback-logout'].click();released();await pending;await settle();assert(nodes['feedback-trash'].hidden);assert(nodes['feedback-trash-open'].hidden);assert.equal(nodes['feedback-trash-list'].textContent,'','late private response cannot repopulate after logout');
deferred=false;await nodes['feedback-admin-form'].fire('submit');denied=true;await nodes['feedback-trash-open'].click();await settle();assert(nodes['feedback-trash'].hidden);assert.equal(nodes['feedback-trash-list'].textContent,'');assert(nodes['feedback-trash-open'].hidden);
assert(!source.includes('localStorage'));assert(!calls.some(c=>c.url.includes('fixture-access')),'tokens never enter URLs');
console.log('PASS UI: admin-only entry, literal untrusted text, inherited/independent deletion, restore refresh, logout/expired session clears private DOM and ignores late responses. DOM/network mocked.');
