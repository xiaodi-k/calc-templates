// Public feedback API. Secrets stay in Supabase Edge Function environment.
// TURNSTILE_SECRET and ADMIN_EMAIL must be configured before submissions work.
const ORIGIN = "https://xiaodi-k.github.io";
const headers = {"Access-Control-Allow-Origin": ORIGIN, "Access-Control-Allow-Methods":"GET,POST,OPTIONS", "Access-Control-Allow-Headers":"content-type,authorization,apikey", "Vary":"Origin", "Content-Type":"application/json; charset=utf-8", "Cache-Control":"no-store"};
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers});
const base=Deno.env.get("SUPABASE_URL")||"";
const key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const turnstileSecret=Deno.env.get("TURNSTILE_SECRET")||"";
const adminEmail=(Deno.env.get("ADMIN_EMAIL")||"").trim().toLowerCase();
async function db(path:string,method:string,body?:unknown) {
  const r=await fetch(base+"/rest/v1/"+path,{method,headers:{"apikey":key,"Authorization":"Bearer "+key,"Content-Type":"application/json","Prefer":"return=representation"},body:body===undefined?undefined:JSON.stringify(body)});
  const data=await r.json().catch(()=>null);
  if(!r.ok) throw new Error("Database request failed "+r.status);
  return data;
}
async function verifiedAdmin(req:Request) {
  const token=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"");
  if(!adminEmail||!token) return false;
  const r=await fetch(base+"/auth/v1/user",{headers:{"apikey":key,"Authorization":"Bearer "+token}});
  if(!r.ok) return false;
  const user=await r.json();
  return Boolean(user.id&&user.email_confirmed_at&&String(user.email||"").toLowerCase()===adminEmail);
}
async function captchaOk(token:string,ip:string) {
  if(!turnstileSecret||!token) return false;
  const form=new FormData();form.set("secret",turnstileSecret);form.set("response",token);if(ip)form.set("remoteip",ip);
  const r=await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify",{method:"POST",body:form});
  if(!r.ok) return false;
  const result=await r.json();
  return result.success===true&&result.hostname==="xiaodi-k.github.io";
}
function field(x:unknown,max:number) {return typeof x==="string"?x.trim().slice(0,max+1):"";}

const BUCKET = "feedback-attachments";
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_FILES = 3;
const MAX_JSON_BYTES = 12000;
const MAX_MULTIPART_BYTES = MAX_FILES * MAX_FILE_BYTES + 65536;
const EXTENSIONS = new Set("png jpg jpeg gif webp pdf doc docx xls xlsx ppt pptx dwg dxf zip rar 7z mcd xmcd xmcdz mcdx mct xmct mctx".split(" "));
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Attachment = { id: string; name: string; size: number };
class ClientError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}
async function boundedBody(req: Request, max: number) {
  if (Number(req.headers.get("content-length") || 0) > max) throw new ClientError("附件或请求过大", 413);
  const reader = req.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > max) { await reader.cancel(); throw new ClientError("附件或请求过大", 413); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}
async function parseSubmission(req: Request) {
  const contentType = req.headers.get("content-type") || "";
  const multipart = /^multipart\/form-data(?:;|$)/i.test(contentType);
  if (!multipart && !/^application\/json(?:;|$)/i.test(contentType)) throw new ClientError("不支持的请求格式", 415);
  const bytes = await boundedBody(req, multipart ? MAX_MULTIPART_BYTES : MAX_JSON_BYTES);
  let data: Record<string, unknown>, files: File[] = [];
  try {
    if (multipart) {
      const form = await new Response(bytes, { headers: { "Content-Type": contentType } }).formData();
      const payloads = form.getAll("payload");
      if (payloads.length !== 1 || typeof payloads[0] !== "string" || new TextEncoder().encode(payloads[0]).length > MAX_JSON_BYTES)
        throw new ClientError("留言内容格式不正确");
      for (const [name, value] of form.entries()) {
        if (name === "attachments" && value instanceof File) files.push(value);
        else if (name !== "payload") throw new ClientError("附件字段不正确");
      }
      data = JSON.parse(payloads[0]);
    } else data = JSON.parse(new TextDecoder().decode(bytes));
  } catch (error) {
    if (error instanceof ClientError) throw error;
    throw new ClientError("留言内容格式不正确");
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new ClientError("留言内容格式不正确");
  if (files.length > MAX_FILES) throw new ClientError("每条留言或回复最多添加 3 个附件");
  return { data, files };
}
async function validateFile(file: File) {
  const name = file.name.normalize("NFC");
  if (!name || name.length > 160 || /[\\/\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/.test(name))
    throw new ClientError("附件名称过长或含不支持的字符");
  const extension = name.split(".").pop()?.toLowerCase() || "";
  if (!EXTENSIONS.has(extension)) throw new ClientError("不支持此附件格式：" + name);
  if (!file.size) throw new ClientError("不能上传空文件：" + name);
  if (file.size > MAX_FILE_BYTES) throw new ClientError("每个附件不能超过 5 MB", 413);
  const b = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const starts = (...signature: number[]) => signature.every((n, i) => b[i] === n);
  const zip = starts(0x50,0x4b,3,4) || starts(0x50,0x4b,5,6) || starts(0x50,0x4b,7,8);
  const ole = starts(0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1);
  const text = new TextDecoder().decode(b);
  const signatures: Record<string, boolean> = {
    png: starts(137,80,78,71,13,10,26,10), jpg: starts(255,216,255), jpeg: starts(255,216,255),
    gif: text.startsWith("GIF87a") || text.startsWith("GIF89a"),
    webp: text.startsWith("RIFF") && text.slice(8,12) === "WEBP",
    pdf: text.startsWith("%PDF-"), doc: ole, xls: ole, ppt: ole,
    docx: zip || ole, xlsx: zip || ole, pptx: zip || ole, zip,
    rar: starts(0x52,0x61,0x72,0x21,0x1a,7), "7z": starts(0x37,0x7a,0xbc,0xaf,0x27,0x1c),
    dwg: /^AC10\d\d/.test(text)
  };
  // Mathcad and DXF have multiple legacy encodings. Keep their original bytes;
  // never parse XML, expand archives, evaluate worksheets or render uploads inline.
  if (extension in signatures && !signatures[extension]) throw new ClientError("附件内容与扩展名不匹配：" + name);
  return name;
}
const storageHeaders = () => ({ apikey: key, Authorization: "Bearer " + key });
let bucketReady = false;
async function ensureBucket() {
  if (bucketReady) return;
  let response = await fetch(base + "/storage/v1/bucket/" + BUCKET, { headers: storageHeaders() });
  // Storage can return 400 or 404 for a missing bucket.
  if (!response.ok && [400,404].includes(response.status)) {
    const created = await fetch(base + "/storage/v1/bucket", {
      method: "POST", headers: { ...storageHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ id: BUCKET, name: BUCKET, public: false, file_size_limit: MAX_FILE_BYTES, allowed_mime_types: ["application/octet-stream"] })
    });
    if (!created.ok && ![400,409].includes(created.status)) throw new Error("Bucket creation failed");
    response = await fetch(base + "/storage/v1/bucket/" + BUCKET, { headers: storageHeaders() });
  }
  if (!response.ok) throw new Error("Bucket unavailable");
  const bucket = await response.json();
  if (bucket.public !== false || Number(bucket.file_size_limit) !== MAX_FILE_BYTES)
    throw new ClientError("附件存储配置需要管理员检查", 503);
  bucketReady = true;
}
async function cleanup(paths: string[]) {
  if (!paths.length) return;
  try {
    const r = await fetch(base + "/storage/v1/object/" + BUCKET, {
      method: "DELETE", headers: { ...storageHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ prefixes: paths })
    });
    if (!r.ok) throw new Error("Cleanup failed");
  } catch { console.error("feedback-attachments: unpublished upload cleanup failed"); }
}
async function download(req: Request) {
  const url = new URL(req.url);
  const kind = url.searchParams.get("kind"), message = url.searchParams.get("message") || "", attachment = url.searchParams.get("attachment") || "";
  if (!["thread","reply"].includes(kind || "") || !uuid.test(message) || !uuid.test(attachment)) throw new ClientError("附件地址无效");
  const table = kind === "thread" ? "feedback_threads" : "feedback_replies";
  const rows = await db(table + "?id=eq." + message + "&hidden=eq.false&select=attachments" + (kind === "reply" ? ",thread_id" : "") + "&limit=1", "GET");
  const row = rows?.[0];
  const item = row?.attachments?.find((file: Attachment) => file.id === attachment);
  if (!item) throw new ClientError("附件不存在或留言已隐藏", 404);
  if (kind === "reply") {
    const parent = await db("feedback_threads?id=eq." + row.thread_id + "&hidden=eq.false&select=id&limit=1", "GET");
    if (!parent?.length) throw new ClientError("附件不存在或留言已隐藏", 404);
  }
  const r = await fetch(base + "/storage/v1/object/authenticated/" + BUCKET + "/" + kind + "/" + message + "/" + attachment, { headers: storageHeaders() });
  if (!r.ok) throw new ClientError("附件暂时无法下载", r.status === 404 ? 404 : 502);
  const filename = encodeURIComponent(item.name).replace(/['()*]/g, (c: string) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
  return new Response(r.body, { status: 200, headers: {
    ...headers, "Content-Type": "application/octet-stream",
    "Content-Disposition": "attachment; filename=\"attachment\"; filename*=UTF-8''" + filename,
    "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox",
    "Access-Control-Expose-Headers": "Content-Disposition"
  } });
}
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (!["GET","POST"].includes(req.method)) return json({ error: "Method not allowed" }, 405);
  if (req.method === "POST" && req.headers.get("origin") !== ORIGIN) return json({ error: "Origin not allowed" }, 403);
  if (!base || !key) return json({ error: "服务尚未配置" }, 503);
  try {
    if (req.method === "GET") return await download(req);
    const { data, files } = await parseSubmission(req);
    const action = data.action;
    if (action === "admin_status" || action === "delete") {
      if (!await verifiedAdmin(req)) throw new ClientError("请使用管理员账号重新登录", 403);
      if (files.length) throw new ClientError("管理操作不能包含附件");
      if (action === "admin_status") return json({ok:true,is_admin:true});
      const kind = data.kind, messageId = field(data.message_id, 40);
      if (!["thread", "reply"].includes(String(kind)) || !uuid.test(messageId))
        throw new ClientError("请选择有效的留言或回复");
      const table = kind === "thread" ? "feedback_threads" : "feedback_replies";
      // One atomic update. Reply RLS also checks the parent, including replies
      // submitted concurrently with deleting a thread. Repeating this is safe.
      const rows = await db(table + "?id=eq." + messageId + "&select=id", "PATCH", {hidden:true});
      if (!rows?.length) throw new ClientError("留言或回复不存在", 404);
      return json({ok:true,id:messageId});
    }
    if (action !== "thread" && action !== "reply") throw new ClientError("无效操作");
    const nickname = field(data.nickname,40) || "匿名用户", title = field(data.title,120), body = field(data.body,4000), threadId = field(data.thread_id,40);
    if (nickname.length>40 || body.length<2 || body.length>4000 || action==="thread"&&(title.length<2||title.length>120) || action==="reply"&&!uuid.test(threadId))
      throw new ClientError("请检查标题、昵称和正文长度");
    const names = await Promise.all(files.map(validateFile));
    const isAdmin = await verifiedAdmin(req);
    if (!isAdmin) {
      if (!turnstileSecret) throw new ClientError("留言功能正在等待管理员配置人机验证",503);
      const ip = (req.headers.get("x-forwarded-for")||"").split(",")[0].trim();
      if (!await captchaOk(field(data.turnstile_token,2048),ip)) throw new ClientError("人机验证失败，请重试",403);
      const digest = await crypto.subtle.digest("SHA-256",new TextEncoder().encode(ip+"|"+(Deno.env.get("RATE_LIMIT_SALT")||turnstileSecret)));
      const fingerprint = Array.from(new Uint8Array(digest)).map(x=>x.toString(16).padStart(2,"0")).join("");
      if (await db("rpc/feedback_take_slot","POST",{p_fingerprint:fingerprint,p_limit:5}) !== true) throw new ClientError("提交太频繁，请稍后再试",429);
    }
    if (action === "reply") {
      const exists = await db("feedback_threads?id=eq."+threadId+"&hidden=eq.false&select=id&limit=1","GET");
      if (!exists?.length) throw new ClientError("留言不存在或已隐藏",404);
    }
    const id = crypto.randomUUID(), uploaded: string[] = [], attachments: Attachment[] = [];
    const table = action === "thread" ? "feedback_threads" : "feedback_replies";
    let insertAttempted = false;
    try {
      if (files.length) await ensureBucket();
      for (let i=0; i<files.length; i++) {
        const attachmentId = crypto.randomUUID(), path = action+"/"+id+"/"+attachmentId;
        // Include the attempted path so a lost upload response can also be cleaned.
        uploaded.push(path);
        const r = await fetch(base+"/storage/v1/object/"+BUCKET+"/"+path,{
          method:"POST",headers:{...storageHeaders(),"Content-Type":"application/octet-stream","x-upsert":"false","Cache-Control":"no-store"},body:files[i]
        });
        if (!r.ok) throw new Error("Upload failed");
        attachments.push({id:attachmentId,name:names[i],size:files[i].size});
      }
      const payload = action==="thread" ? {id,nickname,title,body,attachments} : {id,nickname:isAdmin?"管理员":nickname,body,thread_id:threadId,is_admin:isAdmin,attachments};
      insertAttempted = true;
      await db(table,"POST",payload);
      return json({ok:true,id},201);
    } catch (error) {
      // An insert may have committed even if its HTTP response was lost. Check
      // before removing blobs; if the database is unreachable, leave private blobs.
      let mayHaveSaved = false;
      if (insertAttempted) {
        try {
          const rows = await db(table+"?id=eq."+id+"&select=id&limit=1","GET");
          if (rows?.length) return json({ok:true,id},201);
        } catch { mayHaveSaved = true; }
      }
      if (!mayHaveSaved) await cleanup(uploaded);
      throw error;
    }
  } catch (error) {
    if (error instanceof ClientError) return json({error:error.message},error.status);
    console.error("feedback-attachments: request failed");
    return json({error:"提交或下载失败，请稍后重试"},500);
  }
});


