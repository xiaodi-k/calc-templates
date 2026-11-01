(() => {
"use strict";
const config=window.FEEDBACK_CONFIG||{};
const base=config.supabaseUrl||"";
const publishable=config.publishableKey||"";
const endpoint=base+"/functions/v1/"+(config.functionName||"feedback-submit");
const allowedExtensions=new Set('png jpg jpeg gif webp pdf doc docx xls xlsx ppt pptx dwg dxf zip rar 7z mcd xmcd xmcdz mcdx mct xmct mctx'.split(' '));
const maxFileSize=5*1024*1024,maxFiles=3;
const $=id=>document.getElementById(id);
const list=$("feedback-list"),status=$("feedback-status"),count=$("feedback-count");
const form=$("feedback-form"),notice=$("feedback-form-status");
let replyTo=null,authToken="",widgetId=null,busy=false,submitting=false,selectedFiles=[];
const date=v=>new Intl.DateTimeFormat("zh-CN",{timeZone:"Asia/Shanghai",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(v));
function el(tag,cls,value){const n=document.createElement(tag);if(cls)n.className=cls;if(value!==undefined)n.textContent=String(value);return n;}
function button(label,handler,cls="feedback-button"){const b=el("button",cls,label);b.type="button";b.addEventListener("click",handler);return b;}
function showForm(threadId=null){if(submitting)return;if(threadId!==replyTo){clearFiles();}replyTo=threadId;form.hidden=false;$("feedback-form-title").textContent=threadId?"回复留言":"发表新留言";$("feedback-title-field").hidden=Boolean(threadId);notice.textContent="";form.scrollIntoView({behavior:"smooth",block:"nearest"});}
const fileSize=n=>n<1024*1024?Math.max(1,Math.ceil(n/1024))+" KB":(n/1024/1024).toFixed(1)+" MB";
function renderFiles(){
 const ul=$("feedback-selected-files");ul.replaceChildren();
 selectedFiles.forEach((file,index)=>{const li=el("li","feedback-selected-file");const remove=button("移除",()=>{selectedFiles.splice(index,1);renderFiles();$("feedback-file-status").textContent="";});remove.setAttribute("aria-label","移除附件 "+file.name);remove.disabled=submitting;li.append(el("span","feedback-file-name",file.name+" · "+fileSize(file.size)),remove);ul.append(li);});
}
function clearFiles(){selectedFiles=[];$("feedback-files").value="";$("feedback-file-status").textContent="";renderFiles();}
$("feedback-choose-files").addEventListener("click",()=>$("feedback-files").click());
$("feedback-files").addEventListener("change",()=>{
 const incoming=Array.from($("feedback-files").files||[]);$("feedback-files").value="";
 const unique=incoming.filter(f=>!selectedFiles.some(x=>x.name===f.name&&x.size===f.size&&x.lastModified===f.lastModified));
 let error=selectedFiles.length+unique.length>maxFiles?"每条留言或回复最多添加 3 个附件。":"";
 for(const f of unique){if(!allowedExtensions.has(f.name.split('.').pop().toLowerCase()))error="不支持此文件格式："+f.name;else if(f.size===0)error="不能上传空文件："+f.name;else if(f.size>maxFileSize)error="每个附件不能超过 5 MB："+f.name;if(error)break;}
 if(error){$("feedback-file-status").textContent=error;return;}
 selectedFiles.push(...unique);renderFiles();$("feedback-file-status").textContent=selectedFiles.length?"已选择 "+selectedFiles.length+" / 3 个附件":"";
});
function attachments(items,kind,messageId){
 const ul=el("ul","feedback-attachments");ul.setAttribute("aria-label","留言附件");
 for(const file of Array.isArray(items)?items:[]){if(!/^[0-9a-f-]{36}$/i.test(file.id))continue;const li=el("li");const link=el("a","feedback-attachment",file.name+" · "+fileSize(file.size));link.href=endpoint+"?kind="+kind+"&message="+encodeURIComponent(messageId)+"&attachment="+encodeURIComponent(file.id);link.download=file.name;link.rel="noopener noreferrer";link.setAttribute("aria-label","下载附件 "+file.name);li.append(link);ul.append(li);}
 return ul;
}
function resetCaptcha(){if(widgetId!==null&&window.turnstile)window.turnstile.reset(widgetId);}
function captchaReady(){
  if(!config.turnstileSiteKey){notice.textContent="留言暂未开放：管理员需要配置 Turnstile Site Key。";return;}
  if(!window.turnstile){setTimeout(captchaReady,400);return;}
  if(widgetId===null)widgetId=window.turnstile.render("#feedback-turnstile",{sitekey:config.turnstileSiteKey,theme:"auto"});
}
function message(nick,body,created,admin=false,files=[],kind="thread",messageId=""){
 const wrap=el("article","feedback-message"+(admin?" is-admin":""));
 const meta=el("div","feedback-message-meta");
 meta.append(el("strong","feedback-author",nick||"匿名用户"),el("span","feedback-badge"+(admin?" admin":""),admin?"管理员":"成员"),el("time","feedback-date",date(created)));
 wrap.append(meta,el("p","feedback-body",body));if(files?.length)wrap.append(attachments(files,kind,messageId));return wrap;
}
async function read(table,query){
 const r=await fetch(base+"/rest/v1/"+table+"?"+query,{headers:{"apikey":publishable},cache:"no-store"});
 if(!r.ok)throw Error("读取失败（"+r.status+"）");return r.json();
}
async function load(){
 if(busy)return;busy=true;$("feedback-refresh").disabled=true;status.textContent="正在加载留言…";
 try{
 const [threads,replies]=await Promise.all([
 read("feedback_threads","select=id,nickname,title,body,created_at,attachments&order=created_at.desc&limit=100"),
 read("feedback_replies","select=id,thread_id,nickname,body,is_admin,created_at,attachments&order=created_at.asc&limit=1000")]);
 const grouped=new Map();for(const r of replies){if(!grouped.has(r.thread_id))grouped.set(r.thread_id,[]);grouped.get(r.thread_id).push(r);}
 list.replaceChildren();
 for(const t of threads){
 const details=el("details","feedback-thread");details.dataset.id=t.id;
 const summary=el("summary");summary.append(el("span","feedback-preview",t.body.split(/\r?\n/).find(x=>x.trim())||t.title),el("time","feedback-date",date(t.created_at)),el("span","feedback-chevron"),el("span","feedback-summary-meta",(t.nickname||"匿名用户")+" · "+(grouped.get(t.id)||[]).length+" 条回复"));
 const inner=el("div","feedback-conversation");inner.append(el("h3","feedback-subject",t.title),message(t.nickname,t.body,t.created_at,false,t.attachments,"thread",t.id));
 for(const r of grouped.get(t.id)||[])inner.append(message(r.nickname,r.body,r.created_at,r.is_admin,r.attachments,"reply",r.id));
 inner.append(button("回复此留言",()=>showForm(t.id),"feedback-button primary"));
 details.append(summary,inner);list.append(details);
 }
 if(!threads.length)list.append(el("div","feedback-empty","还没有留言，欢迎提出第一条建议。"));
 count.textContent="· "+threads.length+" 条留言";status.textContent="已同步 · "+new Intl.DateTimeFormat("zh-CN",{timeZone:"Asia/Shanghai",hour:"2-digit",minute:"2-digit"}).format(new Date());
 }catch(e){status.textContent="留言读取失败："+e.message;}finally{busy=false;$("feedback-refresh").disabled=false;}
}
$("feedback-new").addEventListener("click",()=>showForm());
$("feedback-cancel").addEventListener("click",()=>{if(submitting)return;form.hidden=true;replyTo=null;clearFiles();});
$("feedback-refresh").addEventListener("click",load);
form.addEventListener("submit",async event=>{
 event.preventDefault();if(submitting)return;const title=$("feedback-subject").value.trim(),body=$("feedback-body-input").value.trim(),nickname=$("feedback-nickname").value.trim()||"匿名用户";
 if(body.length<2||(!replyTo&&title.length<2)){notice.textContent="请填写至少2个字的标题及正文。";return;}
 const token=authToken?"":(widgetId!==null&&window.turnstile?window.turnstile.getResponse(widgetId):"");
 if(!authToken&&!token){notice.textContent="请先完成人机验证。";return;}
 submitting=true;for(const control of form.querySelectorAll('input,textarea,button'))control.disabled=true;$("feedback-new").disabled=true;notice.textContent=selectedFiles.length?"正在上传附件并提交，请保持页面打开…":"正在提交…";
 try{
 const payload={action:replyTo?"reply":"thread",thread_id:replyTo,nickname,title,body,turnstile_token:token};
 const requestHeaders=authToken?{"Authorization":"Bearer "+authToken}:{};let requestBody;
 if(selectedFiles.length){requestBody=new FormData();requestBody.append("payload",JSON.stringify(payload));for(const file of selectedFiles)requestBody.append("attachments",file,file.name);}else{requestHeaders["Content-Type"]="application/json";requestBody=JSON.stringify(payload);}
 const r=await fetch(endpoint,{method:"POST",headers:requestHeaders,body:requestBody});
 const result=await r.json();if(!r.ok)throw Error(result.error||"提交失败");
 notice.textContent="提交成功";form.reset();clearFiles();form.hidden=true;replyTo=null;resetCaptcha();await load();
 }catch(e){notice.textContent=e.message;resetCaptcha();}finally{submitting=false;for(const control of form.querySelectorAll('input,textarea,button'))control.disabled=false;$("feedback-new").disabled=false;}
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
