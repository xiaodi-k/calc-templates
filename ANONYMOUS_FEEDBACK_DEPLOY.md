# 公开匿名留言板上线清单

已完成：Supabase 数据库、RLS、限流表和原子限流 RPC；Edge Function `feedback-submit` 已部署；GitHub Pages 前端在本 PR 中实现。**未配置密钥前匿名提交会安全地拒绝，不会绕过验证。**

## 站长需要完成的配置

1. 在 [Cloudflare Turnstile](https://dash.cloudflare.com/) 创建一个 Managed Widget，允许域名 `xiaodi-k.github.io`。取得 **Site Key** 和 **Secret Key**。
2. 在 Supabase Dashboard → 项目 `calc-templates-feedback` → Edge Functions → Secrets，添加：
   - `TURNSTILE_SECRET` = Cloudflare Secret Key
   - `ADMIN_EMAIL` = 管理员用于 Supabase Auth 的邮箱
   不要把 Secret Key、数据库密码或 Service Role Key 提交到 GitHub，也不要发在聊天里。
3. 将公开的 **Site Key** 填入 `feedback-config.js` 的 `turnstileSiteKey`。公开 Site Key 可以提交到 GitHub。
4. 在 Supabase Authentication 中创建/邀请管理员用户，并确保该用户的邮箱经过验证。管理员在网页底部登录后，回复由后端识别为管理员。管理员权限不由昵称决定。
5. 在合并前检查：匿名发表新留言、匿名回复、管理员登录及回复、手机布局、恶意 HTML 作为纯文本显示、刷新与限流（同一来源每小时最多五条）。原有 GitHub Issues 保留为历史记录。
6. 确认后合并 PR，等待 GitHub Pages 发布。

## 当前技术边界

- 无 GitHub 账号即可留言；提交需 Turnstile 验证。
- 匿名用户不能证明自己是此前留言的作者，因此公开回复不保证原作者身份。
- 读取默认最新 100 条主留言和 1000 条回复；更多历史数据需分页增强。
- 管理员登录令牌仅保存在当前网页内存，刷新需重新登录；管理员邮件由服务端环境变量验证。
- 如果 `TURNSTILE_SECRET` 或 Site Key 未设置，投稿会被拒绝而不是不安全地放行。
- 生产站点的计算模块未修改。
