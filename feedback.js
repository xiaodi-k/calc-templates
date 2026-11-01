(() => {
"use strict";
const config=window.FEEDBACK_CONFIG||{};
const base=config.supabaseUrl||"";
const publishable=config.publishableKey||"";
const endpoint=base+"/functions/v1/feedback-submit";
const $=id=>document.getElementById(id);
const list=$("feedback-list"),status=$("feedback-status"),count=$("feedback-count");
const form=$("feedback-form"),notice=$("feedback-form-status");
let replyTo=null,authToken="",widgetId=null,busy=false;
const date=v=>new Intl.DateTimeFormat("zh-CN",{timeZone:"Asia/Shanghai",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(v));
function el(tag,cls,value){const n=document.createElement(tag);if(cls)n.className=cls;if(value!==undefined)n.textContent=String(value);return n;}
function button(label,handler,cls="feedback-button"){const b=el("button",cls,label);b.type="button";b.addEventListener("click",handler);return b;}
function showForm(threadId=null){replyTo=threadId;form.hidden=false;$("feedback-form-title").textContent=threadId?"回复留言":"发表新留言";$("feedback-title-field").hidden=Boolean(threadId);notice.textContent="";form.scrollIntoView({behavior:"smooth",block:"nearest"});}
function resetCaptcha(){if(widgetId!==null&&window.turnstile)window.turnstile.reset(widgetId);}
function captchaReady(){
  if(!config.turnstileSiteKey){notice.textContent="留言暂未开放：管理员需要配置 Turnstile Site Key。";return;}
  if(!window.turnstile){setTimeout(captchaReady,400);return;}
  if(widgetId===null)widgetId=window.turnstile.render("#feedback-turnstile",{sitekey:config.turnstileSiteKey,theme:"auto"});
}
function message(nick,body,created,admin=false){
 const wrap=el("article","feedback-message"+(admin?" is-admin":""));
 const meta=el("div","feedback-message-meta");
 meta.append(el("strong","feedback-author",nick||"匿名用户"),el("span","feedback-badge"+(admin?" admin":""),admin?"管理员":"成员"),el("time","feedback-date",date(created)));
 wrap.append(meta,el("p","feedback-body",body));return wrap;
}
async function read(table,query){
 const r=await fetch(base+"/rest/v1/"+table+"?"+query,{headers:{"apikey":publishable},cache:"no-store"});
 if(!r.ok)throw Error("读取失败（"+r.status+"）");return r.json();
}
async function load(){
 if(busy)return;busy=true;$("feedback-refresh").disabled=true;status.textContent="正在加载留言…";
 try{
 const [threads,replies]=await Promise.all([
 read("feedback_threads","select=id,nickname,title,body,created_at&order=created_at.desc&limit=100"),
 read("feedback_replies","select=id,thread_id,nickname,body,is_admin,created_at&order=created_at.asc&limit=1000")]);
 const grouped=new Map();for(const r of replies){if(!grouped.has(r.thread_id))grouped.set(r.thread_id,[]);grouped.get(r.thread_id).push(r);}
 list.replaceChildren();
 for(const t of threads){
 const details=el("details","feedback-thread");details.dataset.id=t.id;
 const summary=el("summary");summary.append(el("span","feedback-preview",t.body.split(/\r?\n/).find(x=>x.trim())||t.title),el("time","feedback-date",date(t.created_at)),el("span","feedback-chevron"),el("span","feedback-summary-meta",(t.nickname||"匿名用户")+" · "+(grouped.get(t.id)||[]).length+" 条回复"));
 const inner=el("div","feedback-conversation");inner.append(el("h3","feedback-subject",t.title),message(t.nickname,t.body,t.created_at));
 for(const r of grouped.get(t.id)||[])inner.append(message(r.nickname,r.body,r.created_at,r.is_admin));
 inner.append(button("回复此留言",()=>showForm(t.id),"feedback-button primary"));
 details.append(summary,inner);list.append(details);
 }
 if(!threads.length)list.append(el("div","feedback-empty","还没有留言，欢迎提出第一条建议。"));
 count.textContent="· "+threads.length+" 条留言";status.textContent="已同步 · "+new Intl.DateTimeFormat("zh-CN",{timeZone:"Asia/Shanghai",hour:"2-digit",minute:"2-digit"}).format(new Date());
 }catch(e){status.textContent="留言读取失败："+e.message;}finally{busy=false;$("feedback-refresh").disabled=false;}
}
$("feedback-new").addEventListener("click",()=>showForm());
$("feedback-cancel").addEventListener("click",()=>{form.hidden=true;replyTo=null;});
$("feedback-refresh").addEventListener("click",load);
form.addEventListener("submit",async event=>{
 event.preventDefault();const title=$("feedback-subject").value.trim(),body=$("feedback-body-input").value.trim(),nickname=$("feedback-nickname").value.trim()||"匿名用户";
 if(body.length<2||(!replyTo&&title.length<2)){notice.textContent="请填写至少2个字的标题及正文。";return;}
 const token=authToken?"":(widgetId!==null&&window.turnstile?window.turnstile.getResponse(widgetId):"");
 if(!authToken&&!token){notice.textContent="请先完成人机验证。";return;}
 $("feedback-submit").disabled=true;notice.textContent="正在提交…";
 try{
 const r=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json",...(authToken?{"Authorization":"Bearer "+authToken}:{})},body:JSON.stringify({action:replyTo?"reply":"thread",thread_id:replyTo,nickname,title,body,turnstile_token:token})});
 const result=await r.json();if(!r.ok)throw Error(result.error||"提交失败");
 notice.textContent="提交成功";form.reset();form.hidden=true;replyTo=null;resetCaptcha();await load();
 }catch(e){notice.textContent=e.message;resetCaptcha();}finally{$("feedback-submit").disabled=false;}
});
$("feedback-admin-form").addEventListener("submit",async e=>{
 e.preventDefault();const email=$("feedback-admin-email").value,password=$("feedback-admin-password").value;
 try{
 const r=await fetch(base+"/auth/v1/token?grant_type=password",{method:"POST",headers:{"Content-Type":"application/json","apikey":publishable},body:JSON.stringify({email,password})});
 const data=await r.json();if(!r.ok||!data.access_token)throw Error("登录失败，请检查账号密码");
 authToken=data.access_token;$("feedback-admin-password").value="";$("feedback-admin-status").textContent="已登录（管理员权限由服务器核验）";$("feedback-logout").hidden=false;
 }catch(e){$("feedback-admin-status").textContent=e.message;}
});
$("feedback-logout").addEventListener("click",()=>{authToken="";$("feedback-logout").hidden=true;$("feedback-admin-status").textContent="已退出";});
if(!base||!publishable){status.textContent="留言服务尚未配置。";$("feedback-new").disabled=true;return;}
captchaReady();load();
})();
