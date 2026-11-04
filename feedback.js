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
let isAdmin=false,deleting=false,authenticating=false,reloadRequested=false;
let adminEpoch=0,trashRequest=0,trashKind="thread",trashOffset=0,trashMore=false,trashNext=0,trashLoading=false,restoring=false;
const trash=$("feedback-trash"),trashList=$("feedback-trash-list"),trashStatus=$("feedback-trash-status");
const date=v=>new Intl.DateTimeFormat("zh-CN",{timeZone:"Asia/Shanghai",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(v));
function el(tag,cls,value){const n=document.createElement(tag);if(cls)n.className=cls;if(value!==undefined)n.textContent=String(value);return n;}
function button(label,handler,cls="feedback-button"){const b=el("button",cls,label);b.type="button";b.addEventListener("click",handler);return b;}
function updateAdminControls(){
 for(const control of list.querySelectorAll(".feedback-delete-button")){
  control.hidden=!isAdmin;control.disabled=deleting||submitting;
 }
 $("feedback-trash-open").hidden=!isAdmin;
 $("feedback-trash-prev").disabled=trashLoading||restoring||trashOffset===0;
 $("feedback-trash-next").disabled=trashLoading||restoring||!trashMore;
 for(const control of trash.querySelectorAll("button[data-restore]"))control.disabled=restoring||trashLoading;
}
function clearAdmin(message="已退出"){
 adminEpoch++;trashRequest++;trash.hidden=true;trashList.replaceChildren();trashStatus.textContent="";trashOffset=0;trashLoading=false;restoring=false;
 authToken="";isAdmin=false;$("feedback-logout").hidden=true;
 $("feedback-admin-status").textContent=message;updateAdminControls();
}
async function adminRequest(payload,binary=false){
 if(!isAdmin||!authToken)throw Error("请先登录管理员账号");
 const epoch=adminEpoch,token=authToken;
 const response=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+token},body:JSON.stringify(payload),cache:"no-store"});
 const data=binary&&response.ok?await response.blob():await response.json();
 if(epoch!==adminEpoch||!isAdmin)throw Error("管理员会话已变化");
 if(!response.ok){if([401,403].includes(response.status))clearAdmin("登录已失效，请重新登录管理员账号");throw Error(data.error||"操作失败，请重试");}
 return data;
}
function trashMessage(row,kind,inDeletedThread=false){
 const article=el("article","feedback-trash-item");
 const meta=el("div","feedback-message-meta");
 meta.append(el("strong","feedback-author",row.nickname||"匿名用户"),el("time","feedback-date","发表于 "+date(row.created_at)));
 article.append(meta);
 if(kind==="thread")article.append(el("h4","feedback-subject",row.title));
 if(kind==="reply"&&!inDeletedThread)article.append(el("p","feedback-trash-context","所属留言："+(row.thread?.title||"留言不存在")+(row.thread?.hidden?"（已删除）":"")));
 article.append(el("p","feedback-body",row.body));
 if(inDeletedThread)article.append(el("p","feedback-trash-context",row.hidden?"这条回复也被单独删除；恢复留言后仍保留在回收站。":"随所属留言隐藏，恢复留言后自动重新显示。"));
 if(row.attachments?.length){
  const files=el("ul","feedback-attachments");
  for(const file of row.attachments){const li=el("li"),download=button(file.name+" · "+fileSize(file.size),async()=>{
   const epoch=adminEpoch;download.disabled=true;
   try{const blob=await adminRequest({action:"trash_attachment",kind,message_id:row.id,attachment_id:file.id},true);if(epoch!==adminEpoch)return;const url=URL.createObjectURL(blob),a=el("a");a.href=url;a.download=file.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
   catch(e){if(epoch===adminEpoch)trashStatus.textContent=e.message;}finally{download.disabled=false;}
  },"feedback-button feedback-attachment");li.append(download);files.append(li);}article.append(files);
 }
 if(!inDeletedThread){
  const actions=el("div","feedback-thread-actions");
  if(kind==="thread"||row.thread&&!row.thread.hidden){const restore=button(kind==="thread"?"恢复留言":"恢复回复",()=>restoreMessage(kind,row.id),"feedback-button primary");restore.dataset.restore="true";actions.append(restore);}
  else actions.append(el("span","feedback-trash-context","请先在「已删除留言」中恢复所属留言。"));
  if(kind==="thread"){
   const replies=el("div","feedback-trash-replies");let offset=0;
   const more=button("查看全部回复",async()=>{
    const epoch=adminEpoch,request=trashRequest;more.disabled=true;
    try{const data=await adminRequest({action:"trash_replies",kind:"thread",message_id:row.id,offset});if(epoch!==adminEpoch||request!==trashRequest)return;
     for(const item of data.items)replies.append(trashMessage(item,"reply",true));
     if(!data.items.length&&offset===0)replies.append(el("p","feedback-trash-context","这条留言没有回复。"));offset=data.next_offset;more.hidden=!data.has_more;more.textContent="加载更多回复";
    }catch(e){if(epoch===adminEpoch&&request===trashRequest)trashStatus.textContent=e.message;}finally{more.disabled=false;}
   });actions.append(more);article.append(actions,replies);
  }else article.append(actions);
 }
 return article;
}
async function loadTrash(offset=0){
 if(!isAdmin)return;const epoch=adminEpoch,request=++trashRequest;trashOffset=offset;trashLoading=true;trashMore=false;trashList.replaceChildren();trashStatus.textContent="正在加载回收站…";updateAdminControls();
 for(const kind of ["thread","reply"]){const tab=$("feedback-trash-"+kind);tab.setAttribute("aria-pressed",String(trashKind===kind));tab.classList.toggle("primary",trashKind===kind);}
 try{const data=await adminRequest({action:"trash_list",kind:trashKind,offset});if(epoch!==adminEpoch||request!==trashRequest)return;
  for(const row of data.items)trashList.append(trashMessage(row,trashKind));
  if(!data.items.length)trashList.append(el("div","feedback-empty","这里没有已删除的"+(trashKind==="thread"?"留言。":"回复。")));
  trashMore=data.has_more;trashNext=data.next_offset;trashStatus.textContent=data.items.length?"第 "+(offset+1)+"–"+(offset+data.items.length)+" 条 · 按发表时间排序":"回收站已同步";
 }catch(e){if(epoch===adminEpoch&&request===trashRequest)trashStatus.textContent="回收站读取失败："+e.message;}
 finally{if(epoch===adminEpoch&&request===trashRequest){trashLoading=false;updateAdminControls();}}
}
async function restoreMessage(kind,id){
 if(restoring||!isAdmin)return;
 if(!window.confirm(kind==="thread"?"恢复这条留言及其原本正常的回复？单独删除的回复仍留在回收站。":"恢复这条回复，让它重新公开显示？"))return;
 const epoch=adminEpoch;restoring=true;updateAdminControls();trashStatus.textContent="正在恢复…";
 try{await adminRequest({action:"restore",kind,message_id:id});if(epoch!==adminEpoch)return;await Promise.all([loadTrash(0),load()]);if(epoch===adminEpoch)$("feedback-admin-status").textContent="已恢复，公开留言列表已刷新";}
 catch(e){if(epoch===adminEpoch)trashStatus.textContent=e.message;}
 finally{if(epoch===adminEpoch){restoring=false;updateAdminControls();}}
}
$("feedback-trash-open").addEventListener("click",()=>{if(!isAdmin)return;trash.hidden=false;loadTrash(0);});
$("feedback-trash-close").addEventListener("click",()=>{trashRequest++;trash.hidden=true;trashList.replaceChildren();trashLoading=false;});
$("feedback-trash-refresh").addEventListener("click",()=>loadTrash(0));
$("feedback-trash-prev").addEventListener("click",()=>loadTrash(Math.max(0,trashOffset-20)));
$("feedback-trash-next").addEventListener("click",()=>{if(trashMore)loadTrash(trashNext);});
for(const kind of ["thread","reply"])$("feedback-trash-"+kind).addEventListener("click",()=>{trashKind=kind;loadTrash(0);});
function deleteButton(kind,id){
 const control=button(kind==="thread"?"删除整条留言":"删除回复",()=>deleteMessage(kind,id),"feedback-button feedback-delete-button");
 control.hidden=!isAdmin;control.disabled=deleting||submitting;return control;
}
async function deleteMessage(kind,id){
 if(deleting||submitting||!isAdmin||!authToken)return;
 const prompt=kind==="thread"?"确定删除整条留言吗？这条留言及其全部回复和附件将不再公开展示。":"确定删除这条回复吗？该回复及其附件将不再公开展示。";
 if(!window.confirm(prompt))return;
 deleting=true;updateAdminControls();$("feedback-admin-status").textContent="正在删除…";
 try{
  const response=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+authToken},body:JSON.stringify({action:"delete",kind,message_id:id})});
  const result=await response.json();
  if(!response.ok){
   if([401,403].includes(response.status))clearAdmin("登录已失效，请重新登录管理员账号");
   throw Error(result.error||"删除失败，请重试");
  }
  if(kind==="thread"&&replyTo===id){form.hidden=true;replyTo=null;form.reset();clearFiles();}
  if(isAdmin)$("feedback-admin-status").textContent=kind==="thread"?"已删除整条留言及其公开回复":"已删除回复";
  await load();
 }catch(error){$("feedback-admin-status").textContent=error.message;}
 finally{deleting=false;updateAdminControls();}
}
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
 if(kind==="reply")meta.append(deleteButton(kind,messageId));
 wrap.append(meta,el("p","feedback-body",body));if(files?.length)wrap.append(attachments(files,kind,messageId));return wrap;
}
async function read(table,query){
 const r=await fetch(base+"/rest/v1/"+table+"?"+query,{headers:{"apikey":publishable},cache:"no-store"});
 if(!r.ok)throw Error("读取失败（"+r.status+"）");return r.json();
}
async function load(){
 if(busy){reloadRequested=true;return;}busy=true;$("feedback-refresh").disabled=true;status.textContent="正在加载留言…";
 try{
 const [threads,replies]=await Promise.all([
 read("feedback_threads","select=id,nickname,title,body,created_at,attachments&order=created_at.desc&limit=100"),
 read("feedback_replies","select=id,thread_id,nickname,body,is_admin,created_at,attachments&order=created_at.asc&limit=1000")]);
 const grouped=new Map();for(const r of replies){if(!grouped.has(r.thread_id))grouped.set(r.thread_id,[]);grouped.get(r.thread_id).push(r);}
 const openIds=new Set(Array.from(list.querySelectorAll("details[open]"),item=>item.dataset.id));
 list.replaceChildren();
 for(const t of threads){
 const details=el("details","feedback-thread");details.dataset.id=t.id;
 details.open=openIds.has(t.id);
 const summary=el("summary");summary.append(el("span","feedback-preview",t.body.split(/\r?\n/).find(x=>x.trim())||t.title),el("time","feedback-date",date(t.created_at)),el("span","feedback-chevron"),el("span","feedback-summary-meta",(t.nickname||"匿名用户")+" · "+(grouped.get(t.id)||[]).length+" 条回复"));
 const inner=el("div","feedback-conversation");inner.append(el("h3","feedback-subject",t.title),message(t.nickname,t.body,t.created_at,false,t.attachments,"thread",t.id));
 for(const r of grouped.get(t.id)||[])inner.append(message(r.nickname,r.body,r.created_at,r.is_admin,r.attachments,"reply",r.id));
 const actions=el("div","feedback-thread-actions");
 actions.append(button("回复此留言",()=>showForm(t.id),"feedback-button primary"),deleteButton("thread",t.id));
 inner.append(actions);
 details.append(summary,inner);list.append(details);
 }
 if(!threads.length)list.append(el("div","feedback-empty","还没有留言，欢迎提出第一条建议。"));
 count.textContent="· "+threads.length+" 条留言";status.textContent="已同步 · "+new Intl.DateTimeFormat("zh-CN",{timeZone:"Asia/Shanghai",hour:"2-digit",minute:"2-digit"}).format(new Date());
 }catch(e){status.textContent="留言读取失败："+e.message;}finally{
  busy=false;$("feedback-refresh").disabled=false;
  if(reloadRequested){reloadRequested=false;await load();}
 }
}
$("feedback-new").addEventListener("click",()=>showForm());
$("feedback-cancel").addEventListener("click",()=>{if(submitting)return;form.hidden=true;replyTo=null;clearFiles();});
$("feedback-refresh").addEventListener("click",load);
form.addEventListener("submit",async event=>{
 event.preventDefault();if(submitting)return;const title=$("feedback-subject").value.trim(),body=$("feedback-body-input").value.trim(),nickname=$("feedback-nickname").value.trim()||"匿名用户";
 if(body.length<2||(!replyTo&&title.length<2)){notice.textContent="请填写至少2个字的标题及正文。";return;}
 const token=authToken?"":(widgetId!==null&&window.turnstile?window.turnstile.getResponse(widgetId):"");
 if(!authToken&&!token){notice.textContent="请先完成人机验证。";return;}
 submitting=true;updateAdminControls();for(const control of form.querySelectorAll('input,textarea,button'))control.disabled=true;$("feedback-new").disabled=true;notice.textContent=selectedFiles.length?"正在上传附件并提交，请保持页面打开…":"正在提交…";
 try{
 const payload={action:replyTo?"reply":"thread",thread_id:replyTo,nickname,title,body,turnstile_token:token};
 const requestHeaders=authToken?{"Authorization":"Bearer "+authToken}:{};let requestBody;
 if(selectedFiles.length){requestBody=new FormData();requestBody.append("payload",JSON.stringify(payload));for(const file of selectedFiles)requestBody.append("attachments",file,file.name);}else{requestHeaders["Content-Type"]="application/json";requestBody=JSON.stringify(payload);}
 const r=await fetch(endpoint,{method:"POST",headers:requestHeaders,body:requestBody});
 const result=await r.json();if(!r.ok)throw Error(result.error||"提交失败");
 notice.textContent="提交成功";form.reset();clearFiles();form.hidden=true;replyTo=null;resetCaptcha();await load();
 }catch(e){notice.textContent=e.message;resetCaptcha();}finally{submitting=false;updateAdminControls();for(const control of form.querySelectorAll('input,textarea,button'))control.disabled=false;$("feedback-new").disabled=false;}
});
$("feedback-admin-form").addEventListener("submit",async e=>{
 e.preventDefault();if(authenticating)return;authenticating=true;
 const loginButton=$("feedback-admin-form").querySelector('button[type="submit"]');loginButton.disabled=true;
 clearAdmin("正在核验管理员身份…");
 const loginEpoch=adminEpoch;
 const email=$("feedback-admin-email").value,password=$("feedback-admin-password").value;
 try{
 const r=await fetch(base+"/auth/v1/token?grant_type=password",{method:"POST",headers:{"Content-Type":"application/json","apikey":publishable},body:JSON.stringify({email,password})});
 const data=await r.json();if(!r.ok||!data.access_token)throw Error("登录失败，请检查账号密码");
 $("feedback-admin-password").value="";
 const check=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+data.access_token},body:JSON.stringify({action:"admin_status"})});
 const identity=await check.json();
 if(loginEpoch!==adminEpoch)return;
 if(!check.ok||identity.is_admin!==true)throw Error(identity.error||"当前账号没有管理员权限");
 authToken=data.access_token;isAdmin=true;$("feedback-admin-status").textContent="已登录管理员，可管理留言及回收站";$("feedback-logout").hidden=false;updateAdminControls();
 }catch(e){if(loginEpoch===adminEpoch)clearAdmin(e.message);}finally{authenticating=false;loginButton.disabled=false;}
});
$("feedback-logout").addEventListener("click",()=>clearAdmin());
if(!base||!publishable){status.textContent="留言服务尚未配置。";$("feedback-new").disabled=true;return;}
captchaReady();load();
})();

