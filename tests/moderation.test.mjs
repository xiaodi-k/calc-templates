import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';

const source = stripTypeScriptTypes(readFileSync(new URL('../supabase/functions/feedback-submit-attachments/index.ts', import.meta.url), 'utf8'));
const id = '11111111-1111-4111-8111-111111111111';
const admin = {id:'test-user',email:'admin@example.invalid',email_confirmed_at:'2026-01-01'};
function app(options={}) {
  let handler;
  const calls=[];
  const fetch=async (url,init={})=>{
    calls.push({url,init});
    if(url.endsWith('/auth/v1/user'))return Response.json(options.user??admin,{status:options.authStatus??200});
    if(init.method==='PATCH')return Response.json(options.missing?[]:[{id}],{status:options.patchStatus??200});
    throw Error('Unexpected network request');
  };
  const env={SUPABASE_URL:'https://fixture.invalid',SUPABASE_SERVICE_ROLE_KEY:'test-service',ADMIN_EMAIL:admin.email};
  vm.runInNewContext(source,{Deno:{env:{get:key=>env[key]},serve:fn=>handler=fn},fetch,Request,Response,FormData,File,TextEncoder,TextDecoder,Uint8Array,URL,crypto:webcrypto,console:{error(){}}});
  return {calls,async request(data={action:'delete',kind:'thread',message_id:id},options={}){
    const headers={'Content-Type':'application/json',Origin:options.origin??'https://xiaodi-k.github.io'};
    if(options.token!==null)headers.Authorization='Bearer '+(options.token??'admin-test');
    const response=await handler(new Request('https://fixture.invalid/function',{method:'POST',headers,body:JSON.stringify(data)}));
    return {status:response.status,body:await response.json()};
  }};
}
let passed=0;
async function test(name,fn){await fn();passed++;console.log('PASS '+name);}
const mutations=a=>a.calls.filter(c=>c.init.method==='PATCH');

await test('anonymous and spoofed admin flags cannot delete',async()=>{
  const a=app();assert.equal((await a.request({action:'delete',kind:'thread',message_id:id,is_admin:true,nickname:'管理员'},{token:null})).status,403);
  assert.equal(a.calls.length,0);
});
await test('invalid token, ordinary users and unconfirmed admin email are denied',async()=>{
  for(const options of [{authStatus:401},{user:{...admin,email:'member@example.invalid'}},{user:{...admin,email_confirmed_at:null}}]){
    const a=app(options);assert.equal((await a.request()).status,403);assert.equal(mutations(a).length,0);
  }
});
await test('server verifies admin status without writes or captcha',async()=>{
  const a=app();const r=await a.request({action:'admin_status'});assert.equal(r.status,200);assert.equal(r.body.is_admin,true);assert.equal(a.calls.length,1);
});
await test('thread and reply delete update only their hidden flag',async()=>{
  for(const kind of ['thread','reply']){
    const a=app();const r=await a.request({action:'delete',kind,message_id:id});assert.equal(r.status,200);
    const [write]=mutations(a);assert.equal(mutations(a).length,1);
    assert.equal(write.url,`https://fixture.invalid/rest/v1/feedback_${kind==='thread'?'threads':'replies'}?id=eq.${id}&select=id`);
    assert.deepEqual(JSON.parse(write.init.body),{hidden:true});
    assert.equal(a.calls[0].url,'https://fixture.invalid/auth/v1/user');
  }
});
await test('repeat deletion is idempotent',async()=>{
  const a=app();assert.equal((await a.request()).status,200);assert.equal((await a.request()).status,200);
  assert.deepEqual(JSON.parse(mutations(a)[0].init.body),JSON.parse(mutations(a)[1].init.body));
});
await test('invalid target and filter injection cannot mutate rows',async()=>{
  for(const data of [{kind:'users',message_id:id},{kind:'thread',message_id:id+'&id=not.is.null'},{kind:'reply',message_id:''}]){
    const a=app();assert.equal((await a.request({action:'delete',...data})).status,400);assert.equal(mutations(a).length,0);
  }
});
await test('wrong origin is denied before identity or database access',async()=>{
  const a=app();assert.equal((await a.request(undefined,{origin:'https://attacker.invalid'})).status,403);assert.equal(a.calls.length,0);
});
await test('missing rows and failed writes are not reported as deleted',async()=>{
  assert.equal((await app({missing:true}).request()).status,404);
  assert.equal((await app({patchStatus:500}).request()).status,500);
});
console.log(`${passed} moderation tests passed; all network calls mocked.`);
