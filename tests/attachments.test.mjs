import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';

const code = stripTypeScriptTypes(readFileSync(new URL('../supabase/functions/feedback-submit-attachments/index.ts', import.meta.url), 'utf8'));
const origin = 'https://xiaodi-k.github.io';
const id = '11111111-1111-4111-8111-111111111111';
const attachmentId = '22222222-2222-4222-8222-222222222222';
const valid = { action:'thread', title:'附件测试', body:'仅供测试', turnstile_token:'fixture-token' };
const pdf = name => new File(['%PDF-1.4\nfixture'], name ?? '测试.pdf', {type:'application/pdf'});
const user = {id:'fixture-user',email:'admin@example.invalid',email_confirmed_at:'2026-11-01T00:00:00Z'};
function app(options={}) {
  let handler, uploadCount=0;
  const calls=[];
  const env={SUPABASE_URL:'https://fixture.invalid',SUPABASE_SERVICE_ROLE_KEY:'fixture-service',TURNSTILE_SECRET:'fixture-captcha',ADMIN_EMAIL:user.email,...options.env};
  const fetch=async(url,init={})=>{
    calls.push({url,init});
    if(url.endsWith('/auth/v1/user'))return Response.json(options.user||{}, {status:options.user?200:401});
    if(url.includes('siteverify'))return Response.json(options.captcha??{success:true,hostname:'xiaodi-k.github.io'});
    if(url.endsWith('/rpc/feedback_take_slot'))return Response.json(options.allowed??true);
    if(url.includes('/storage/v1/bucket/'))return Response.json({public:options.publicBucket??false,file_size_limit:5242880});
    if(url.includes('/storage/v1/object/authenticated/'))return new Response('%PDF-1.4\nfixture');
    if(url.endsWith('/storage/v1/object/feedback-attachments')&&init.method==='DELETE')return Response.json([]);
    if(url.includes('/storage/v1/object/')&&init.method==='POST'){uploadCount++;return Response.json({}, {status:options.failUpload===uploadCount?500:200});}
    if(/\/feedback_(threads|replies)$/.test(url)){
      if(options.lostInsertResponse)throw Error('simulated network error');
      return Response.json([{id}],{status:options.failInsert?500:201});
    }
    if(url.includes('select=attachments'))return Response.json(options.hidden?[]:[{attachments:[{id:attachmentId,name:'测试.pdf',size:16}],thread_id:id}]);
    if(url.includes('hidden=eq.false'))return Response.json(options.parentHidden?[]:[{id}]);
    if(url.includes('&select=id'))return Response.json(options.lostInsertResponse?[{id}]:[]);
    throw Error('Unexpected mock URL');
  };
  vm.runInNewContext(code,{Deno:{env:{get:k=>env[k]},serve:fn=>handler=fn},fetch,Request,Response,FormData,File,TextEncoder,TextDecoder,Uint8Array,URL,crypto:webcrypto,console:{error(){}}});
  return {calls,async request(data=valid,files=[],extra={}){
    let body, headers={Origin:extra.origin??origin};
    if(extra.token)headers.Authorization='Bearer '+extra.token;
    if(files.length||extra.multipart){body=new FormData();body.append('payload',JSON.stringify(data));for(const file of files)body.append('attachments',file,file.name);}
    else {headers['Content-Type']='application/json';body=JSON.stringify(data);}
    if(extra.body!==undefined)body=extra.body;
    if(extra.length)headers['Content-Length']=String(extra.length);
    const method=extra.method||'POST';
    const req=new Request('https://fixture.invalid/functions/v1/feedback-submit-attachments'+(extra.query||''),{method,headers,...(!['GET','OPTIONS'].includes(method)?{body}: {})});
    const response=await handler(req);
    return {status:response.status,headers:response.headers,text:await response.text()};
  }};
}
const writes=a=>a.calls.filter(c=>c.init.method==='POST'&&/\/feedback_(threads|replies)$/.test(c.url));
const uploads=a=>a.calls.filter(c=>c.init.method==='POST'&&c.url.includes('/storage/v1/object/'));
let passed=0;
async function test(name,fn){await fn();passed++;console.log('PASS '+name);}
await test('text-only submission remains compatible',async()=>{const a=app();assert.equal((await a.request()).status,201);assert.equal(uploads(a).length,0);assert.deepEqual(JSON.parse(writes(a)[0].init.body).attachments,[]);});
await test('multipart publishes metadata and private bytes only after verification',async()=>{const a=app();assert.equal((await a.request(valid,[pdf()])).status,201);const p=JSON.parse(writes(a)[0].init.body);assert.equal(p.attachments[0].name,'测试.pdf');assert.equal(p.attachments[0].size,16);assert.equal(p.attachments[0].path,undefined);assert(a.calls.findIndex(c=>c.url.includes('siteverify'))<a.calls.findIndex(c=>c.url.includes('/storage/')));assert.equal(uploads(a)[0].init.headers['Content-Type'],'application/octet-stream');});
await test('Word Excel PPT CAD Mathcad and archives are supported',async()=>{
 const officeZip=['docx','xlsx','pptx','zip'].map(ext=>new File([new Uint8Array([80,75,3,4,0,0])],'fixture.'+ext));
 const officeOle=['doc','xls','ppt'].map(ext=>new File([new Uint8Array([208,207,17,224,161,177,26,225])],'fixture.'+ext));
 const cadMath=['dxf','mcd','xmcd','xmcdz','mcdx','mct','xmct','mctx'].map(ext=>new File(['fixture bytes'],'fixture.'+ext));
 const special=[new File(['AC1032fixture'],'fixture.dwg'),new File([new Uint8Array([82,97,114,33,26,7,1,0])],'fixture.rar'),new File([new Uint8Array([55,122,188,175,39,28])],'fixture.7z')];
 for(const f of [...officeZip,...officeOle,...cadMath,...special])assert.equal((await app().request(valid,[f])).status,201,f.name);
});
await test('rejects count, size, empty file and unapproved extensions',async()=>{
 const cases=[[Array.from({length:4},(_,i)=>pdf(i+'.pdf')),400],[[new File([new Uint8Array(5242881)],'large.pdf')],413],[[new File([],'empty.pdf')],400],[[new File(['hello'],'script.html')],400],[[new File(['hello'],'program.exe')],400],[[new File(['%PDF-fake'],'fake.png')],400],[[pdf('../path.pdf')],400]];
 for(const [files,status] of cases){const a=app();assert.equal((await a.request(valid,files)).status,status);assert.equal(uploads(a).length,0);assert.equal(writes(a).length,0);}
});
await test('request byte limit and malformed payload fail before writes',async()=>{
 for(const extra of [{body:'x'.repeat(12001)},{length:16000000}]){const a=app();assert.equal((await a.request(valid,[],extra)).status,413);assert.equal(a.calls.length,0);}
 for(const data of [null,[],{...valid,title:'x'}])assert.equal((await app().request(data)).status,400);
 assert.equal((await app().request(valid,[],{body:'{' })).status,400);
});
await test('captcha, hostname, origin and rate limit cannot be bypassed with attachments',async()=>{
 for(const options of [{captcha:{success:false}},{captcha:{success:true,hostname:'wrong.invalid'}},{allowed:false}]){const a=app(options);assert([403,429].includes((await a.request({...valid,is_admin:true},[pdf()])).status));assert.equal(uploads(a).length,0);}
 const a=app();assert.equal((await a.request(valid,[pdf()],{origin:'https://wrong.invalid'})).status,403);assert.equal(a.calls.length,0);
 assert.equal((await app({env:{TURNSTILE_SECRET:''}}).request(valid,[pdf()])).status,503);
});
await test('admin attachments use verified server identity, anonymous cannot forge it',async()=>{
 const a=app({user});assert.equal((await a.request({...valid,action:'reply',thread_id:id,nickname:'Spoofed'},[pdf()],{token:'fixture-admin'})).status,201);const p=JSON.parse(writes(a)[0].init.body);assert.equal(p.is_admin,true);assert.equal(p.nickname,'管理员');assert(!a.calls.some(c=>c.url.includes('siteverify')));
 const b=app();await b.request({...valid,action:'reply',thread_id:id,is_admin:true},[pdf()]);assert.equal(JSON.parse(writes(b)[0].init.body).is_admin,false);
});
await test('reply to hidden thread and accidentally public bucket are rejected',async()=>{const a=app({parentHidden:true});assert.equal((await a.request({...valid,action:'reply',thread_id:id},[pdf()])).status,404);assert.equal(uploads(a).length,0);assert.equal((await app({publicBucket:true}).request(valid,[pdf()])).status,503);});
await test('partial upload and failed database save clean unpublished files',async()=>{
 for(const options of [{failUpload:2},{failInsert:true}]){const a=app(options);assert.equal((await a.request(valid,[pdf('a.pdf'),pdf('b.pdf')])).status,500);const cleanup=a.calls.find(c=>c.init.method==='DELETE');assert.equal(JSON.parse(cleanup.init.body).prefixes.length,2);}
});
await test('lost insert response preserves already-published attachments',async()=>{const a=app({lostInsertResponse:true});assert.equal((await a.request(valid,[pdf()])).status,201);assert(!a.calls.some(c=>c.init.method==='DELETE'));});
await test('download forces attachment and never caches or returns service credentials',async()=>{const a=app();const r=await a.request(null,[],{method:'GET',query:'?kind=thread&message='+id+'&attachment='+attachmentId});assert.equal(r.status,200);assert.equal(r.headers.get('content-type'),'application/octet-stream');assert.match(r.headers.get('content-disposition'),/^attachment;/);assert.equal(r.headers.get('cache-control'),'no-store');assert.equal(r.headers.get('x-content-type-options'),'nosniff');assert.equal(r.text,'%PDF-1.4\nfixture');assert(!r.text.includes('fixture-service'));});
await test('hidden message or parent blocks file retrieval',async()=>{for(const options of [{hidden:true},{parentHidden:true}]){const a=app(options);assert.equal((await a.request(null,[],{method:'GET',query:'?kind=reply&message='+id+'&attachment='+attachmentId})).status,404);assert(!a.calls.some(c=>c.url.includes('/storage/')));}});
await test('malformed and path traversal download IDs are rejected',async()=>{const a=app();assert.equal((await a.request(null,[],{method:'GET',query:'?kind=thread&message=../secret&attachment='+attachmentId})).status,400);assert.equal(a.calls.length,0);});
await test('frontend and backend supported extensions stay aligned',async()=>{const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');const js=readFileSync(new URL('../feedback.js',import.meta.url),'utf8');const accepted=html.match(/multiple accept="([^"]+)"/)[1].split(',').map(x=>x.slice(1)).sort();const front=js.match(/new Set\('([^']+)'\.split/)[1].split(' ').sort();const back=code.match(/new Set\("([^"]+)"\.split/)[1].split(' ').sort();assert.deepEqual(accepted,front);assert.deepEqual(front,back);});
console.log(`${passed} tests passed; all requests mocked, no real credentials or network writes.`);
