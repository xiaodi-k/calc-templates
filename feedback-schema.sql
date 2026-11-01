-- Public feedback data model. Run in Supabase SQL Editor.
-- Anonymous writes are intentionally NOT granted: use a server-side Edge Function
-- with Turnstile verification and rate limiting before enabling submissions.
create table if not exists public.feedback_threads (
  id uuid primary key default gen_random_uuid(),
  nickname text not null default '匿名用户' check (char_length(nickname) between 1 and 40),
  title text not null check (char_length(title) between 1 and 120),
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now(),
  hidden boolean not null default false
);
create table if not exists public.feedback_replies (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.feedback_threads(id) on delete cascade,
  parent_id uuid references public.feedback_replies(id) on delete set null,
  nickname text not null default '匿名用户' check (char_length(nickname) between 1 and 40),
  body text not null check (char_length(body) between 1 and 4000),
  is_admin boolean not null default false,
  created_at timestamptz not null default now(),
  hidden boolean not null default false
);
create index if not exists feedback_threads_recent on public.feedback_threads(created_at desc);
create index if not exists feedback_replies_thread on public.feedback_replies(thread_id, created_at);
alter table public.feedback_threads enable row level security;
alter table public.feedback_replies enable row level security;
create policy "Read visible threads" on public.feedback_threads for select to anon, authenticated using (not hidden);
create policy "Read visible replies" on public.feedback_replies for select to anon, authenticated using (not hidden);
-- No insert/update/delete policies: only trusted backend can write.
