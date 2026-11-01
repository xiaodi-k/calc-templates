-- Additive change: the existing text-only frontend/API continue to work.
alter table public.feedback_threads add column if not exists attachments jsonb not null default '[]'::jsonb
  check (jsonb_typeof(attachments) = 'array' and jsonb_array_length(attachments) <= 3);
alter table public.feedback_replies add column if not exists attachments jsonb not null default '[]'::jsonb
  check (jsonb_typeof(attachments) = 'array' and jsonb_array_length(attachments) <= 3);
-- Existing RLS, SELECT-only browser grants and server-only INSERT grants remain.
-- The private Storage bucket is provisioned through the Storage API after the
-- first verified upload, never by directly editing storage schema metadata.
