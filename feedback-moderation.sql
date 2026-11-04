-- Apply before deploying the administrator delete endpoint.
-- A thread's replies become private in the same transaction as its hidden flag.
alter policy "Read visible replies" on public.feedback_replies using (
  not hidden and exists (
    select 1 from public.feedback_threads t
    where t.id = feedback_replies.thread_id and not t.hidden
  )
);
-- Only the trusted function can change visibility; browsers remain read-only.
grant update (hidden) on public.feedback_threads, public.feedback_replies to service_role;
