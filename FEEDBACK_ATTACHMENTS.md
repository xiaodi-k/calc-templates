# 留言附件

留言和回复均可附带最多 3 个文件，每个不超过 5 MiB（界面记为 5 MB）。仍需正文；附件与留言一起提交，发布前可逐个移除。失败时保留正文和选择的文件供重试。

支持 PNG、JPG/JPEG、GIF、WebP、PDF、DOC/DOCX、XLS/XLSX、PPT/PPTX、DWG/DXF、ZIP/RAR/7Z，以及 Mathcad 的 MCD、XMCD、XMCDZ、MCDX、MCT、XMCT、MCTX。文件只保存与下载，不转换格式、不运行工作表、不展开压缩包；下载后需相应软件打开。

## 部署顺序

1. 在 Supabase 应用 `feedback-attachments-schema.sql`。它仅添加两个默认空数组的列，兼容现有文字留言。
2. 部署 `supabase/functions/feedback-submit-attachments/index.ts`，将该函数 `verify_jwt` 设为 `false`。函数自行验证匿名 Turnstile 与管理员 Auth 身份，沿用现有 `TURNSTILE_SECRET`、`ADMIN_EMAIL`，无需复制或提交任何 Secret。
3. 首次通过验证的附件请求会使用服务端 Storage API 创建私有桶 `feedback-attachments`，限制 5 MiB、`application/octet-stream`。不为浏览器开通 Storage 写入或直读权限。
4. 在预览站验证上传、下载及隐藏行为后，合并前端变更。`feedback-config.js` 的 `functionName` 指向新接口。原 `feedback-submit` 保留用于旧前端及回退。

## 边界与恢复

- 留言及附件均面向公众，表单明确提示不要上传隐私信息或保密图纸。
- 服务端限制请求实际字节数、文件数、文件大小、扩展名和名称，并核对常见二进制格式文件头；Mathcad/DXF 保留不同版本的原始编码。此校验不等于病毒扫描。
- 所有上传都先验证身份/Turnstile 和限流，再访问私有 Storage。元数据只由服务端写入，不信任客户端给出的附件 ID、存储路径或管理员标记。
- 下载每次检查留言、回复及所属主留言的可见性；仅输出下载流，使用 `attachment`、`application/octet-stream`、`nosniff` 和 `no-store`。隐藏后停止提供新下载，但无法收回访客此前已保存的副本。
- 上传失败或确认数据库未写入时，删除本次尚未发布的私有对象。若数据库响应丢失，会先确认是否已经保存；数据库无法确认时保留私有对象，避免删除已发布附件。可用对象路径中的留言 UUID 排查孤立文件。
- 隐藏留言不会永久删除文件，方便恢复。清理文件必须通过 Storage API，不应直接删除 `storage.objects` 元数据。

## 检查

使用 Node.js 24 运行 `node tests/attachments.test.mjs`。测试拦截全部网络请求，不访问真实 Secret 或写入线上数据。
部署后再在允许的 GitHub Pages 域名下检查真实 Turnstile、主留言与回复上传、下载字节一致、隐藏后 404，以及旧纯文字接口兼容性。
