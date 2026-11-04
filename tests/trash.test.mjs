import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';
const source=stripTypeScriptTypes(readFileSync(new URL('../supabase/functions/feedback-submit-attachments/index.ts',import.meta.url),'utf8'));
const tid='11111111-1111-4111-8111-111111111111',rid='22222222-2222-4222-8222-222222222222',aid='33333333-3333-4333-8333-333333333333';
function app({user='admin',hidden=true,count=1}={}){
 let handler;const calls=[],threads=Array.from({length:count},(_,i)=>({id:i?`11111111-1111-4111-8111-${String(i).padStart(12,'0')}`:tid,title:'deleted',hidden,attachments:[{id:aid,name:'test.pdf',size:3}]}));
 const replies=[{id:rid,thread_id:tid,hidden:true,body:'individually deleted',attachments:[{id:aid,name:'test.pdf',size:3}]},{id:aid,thread_id:tid,hidden:false,body:'hidden by parent'}];
 const fetch=async(url,init={})=>{
  calls.push({url,init});const u=new URL(url);
  if(u.pathname==='/auth/v1/user')return Response.json({id:'user',email:user==='admin'?'admin@example.invalid':'member@example.invalid',email_confirmed_at:user==='unconfirmed'?null:'2026-01-01'},{status:user==='expired'?401:200});
  if(u.pathname.includes('/storage/'))return new Response('PDF');
  let rows=u.pathname.endsWith('feedback_threads')?threads:replies;
  for(const field of ['id','thread_id','hidden']){const filter=u.searchParams.get(field);if(filter?.startsWith('eq.'))rows=rows.filter(r=>String(r[field])===filter.slice(3));if(filter?.startsWith('in.('))rows=rows.filter(r=>filter.slice(4,-1).split(',').includes(r[field]));}
  if(init.method==='PATCH')for(const r of rows)Object.assign(r,JSON.parse(init.body));
  const start=Number(u.searchParams.get('offset')||0),limit=Number(u.searchParams.get('limit')||1000);
  return Response.json(rows.slice(start,start+limit));
 };
 const env={SUPABASE_URL:'https://fixture.invalid',SUPABASE_SERVICE_ROLE_KEY:'service-test',ADMIN_EMAIL:'admin@example.invalid'};
 vm.runInNewContext(source,{Deno:{env:{get:k=>env[k]},serve:fn=>handler=fn},fetch,Request,Response,FormData,File,TextEncoder,TextDecoder,Uint8Array,URL,console:{error(){}}});
 return {calls,threads,replies,async request(data,{token='test-token',origin='https://xiaodi-k.github.io',get=false}={}){
  const headers={'Content-Type':'application/json',Origin:origin};if(token)headers.Authorization='Bearer '+token;
  const response=await handler(new Request('https://fixture.invalid/function'+(get?`?kind=thread&message=${tid}&attachment=${aid}&private=true`:''),{method:get?'GET':'POST',headers,...(!get?{body:JSON.stringify(data)}:{})}));
  return {status:response.status,headers:response.headers,body:response.headers.get('content-type')?.includes('application/json')?await response.json():await response.text()};
 }};
}
const actions=['trash_list','trash_replies','restore','trash_attachment'];
for(const action of actions){
 const data={action,kind:'thread',message_id:tid,attachment_id:aid,is_admin:true};
 const anon=app();assert.equal((await anon.request(data,{token:null})).status,403);assert.equal(anon.calls.length,0);
 for(const user of ['member','expired','unconfirmed']){const a=app({user});assert.equal((await a.request(data)).status,403);assert.equal(a.calls.length,1);}
 const otherOrigin=app();assert.equal((await otherOrigin.request(data,{origin:'https://evil.invalid'})).status,403);assert.equal(otherOrigin.calls.length,0);
}
const paging=app({count:24});let page=await paging.request({action:'trash_list',kind:'thread',offset:0});assert.equal(page.body.items.length,20);assert.equal(page.body.has_more,true);page=await paging.request({action:'trash_list',kind:'thread',offset:20});assert.equal(page.body.items.length,4);assert.equal(page.body.has_more,false);
const a=app();let r=await a.request({action:'trash_list',kind:'reply'});assert.equal(r.body.items.length,1);assert.equal(r.body.items[0].thread.hidden,true);
r=await a.request({action:'trash_replies',kind:'thread',message_id:tid});assert.equal(r.body.items.length,2);assert(r.body.items.some(x=>!x.hidden));
assert.equal((await a.request({action:'restore',kind:'reply',message_id:rid})).status,409);assert.equal(a.calls.filter(x=>x.init.method==='PATCH').length,0);
assert.equal((await a.request({action:'restore',kind:'thread',message_id:tid})).status,200);assert.equal(a.threads[0].hidden,false);assert.equal(a.replies[0].hidden,true);assert.equal(a.replies[1].hidden,false);
assert.equal((await a.request({action:'restore',kind:'reply',message_id:rid})).status,200);assert.equal(a.replies[0].hidden,false);assert.equal((await a.request({action:'restore',kind:'reply',message_id:rid})).status,200);
const files=app();assert.equal((await files.request(null,{get:true})).status,404);r=await files.request({action:'trash_attachment',kind:'thread',message_id:tid,attachment_id:aid});assert.equal(r.status,200);assert(r.headers.get('content-disposition').startsWith('attachment;'));assert.equal(r.headers.get('cache-control'),'no-store');assert.equal(r.body,'PDF');
for(const data of [{action:'trash_list',kind:'users'},{action:'trash_list',kind:'thread',offset:'0&hidden=eq.false'},{action:'trash_list',kind:'thread',offset:-1},{action:'trash_replies',kind:'thread',message_id:'bad'},{action:'restore',kind:'thread',message_id:tid+'&id=not.is.null'},{action:'trash_attachment',kind:'thread',message_id:tid,attachment_id:'../secret'}])assert.equal((await app().request(data)).status,400);
assert.equal((await app().request({action:'restore',kind:'thread',message_id:aid})).status,404);
console.log('PASS trash: all admin routes deny anonymous/member/expired/unconfirmed users; pagination, parent visibility, restoration isolation/idempotence, private attachments and malformed targets. All network calls mocked.');
