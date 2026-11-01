# Public feedback migration (draft)

The current homepage uses GitHub Issues and requires GitHub login to post. This branch starts a separate, opt-in Supabase-backed public feedback implementation. **The production site is unchanged.**

## Architecture
- GitHub Pages: static frontend, public thread list, collapsed preview, replies, timestamps.
- Supabase Postgres: feedback_threads and feedback_replies (see feedback-schema.sql).
- Supabase Edge Function: validate Cloudflare Turnstile token server-side, enforce IP-based throttling and content limits, write with service-role credentials stored ONLY in Edge Function secrets.
- Admin: Supabase Auth identity, verified server-side; never trust is_admin from browser.
- Keep historical GitHub Issues linked as an archive. Do not delete existing feedback.

## Required owner setup
1. Create a Supabase project and execute feedback-schema.sql.
2. Configure Turnstile for xiaodi-k.github.io and obtain site key and secret.
3. Provide the Supabase project URL and publishable/anon key (both are public client configuration, **never send service-role key or Turnstile secret in chat**).
4. Configure server secrets in Supabase dashboard, deploy Edge Function, and test rate limiting, XSS escaping, admin-only flags, mobile layout and anonymous posting before switching index.html.

## Security
Public read-only RLS is enabled. Anonymous direct table writes are disabled deliberately. Do not expose service-role key in GitHub Pages. Do not enable permissive anonymous INSERT policies as a shortcut.
