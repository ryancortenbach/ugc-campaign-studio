begin;
-- Stop rather than alter historical ledger data if duplicates already exist.
-- Apply only after an operator audits duplicate Higgsfield shot charges.
create unique index if not exists spend_higgsfield_shot_unique
  on public.spend (shot_id) where provider = 'higgsfield' and shot_id is not null;

create or replace function public.reconcile_render_submission(p_shot_id bigint, p_request_id text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  s public.shots%rowtype;
  v public.videos%rowtype;
  charged public.spend%rowtype;
begin
  if p_request_id is null or p_request_id !~ '^[a-zA-Z0-9_.:-]{1,200}$' then
    raise exception 'Invalid provider request ID';
  end if;
  select * into s from public.shots where id = p_shot_id for update;
  if not found then raise exception 'Shot not found'; end if;
  if s.status = 'queued' and s.request_id = p_request_id then return to_jsonb(s); end if;
  if s.status <> 'attention' or s.resume_status is distinct from 'unknown' then
    raise exception 'Only an unknown submission can be reconciled';
  end if;
  if s.estimate_usd is null or s.estimate_usd <= 0
     or s.estimate_usd::text in ('NaN', 'Infinity', '-Infinity') then
    raise exception 'A finite positive render estimate is required';
  end if;
  select * into v from public.videos where id = s.video_id;
  if not found then raise exception 'Video not found'; end if;
  insert into public.spend(provider, usd, order_id, video_id, shot_id, note)
    values ('higgsfield', s.estimate_usd, v.order_id, v.id, s.id, 'reconciled render estimate')
    on conflict (shot_id) where provider = 'higgsfield' and shot_id is not null do nothing;
  select * into charged from public.spend where provider = 'higgsfield' and shot_id = s.id;
  if charged.usd is distinct from s.estimate_usd or charged.order_id is distinct from v.order_id or charged.video_id is distinct from v.id then raise exception 'Recorded render estimate or ownership differs'; end if;
  update public.shots set status = 'queued', request_id = p_request_id,
    resume_status = null, error = null, lock_until = null, updated_at = now()
    where id = s.id returning * into s;
  return to_jsonb(s);
end;
$$;
revoke all on function public.reconcile_render_submission(bigint, text) from public, anon, authenticated;
grant execute on function public.reconcile_render_submission(bigint, text) to service_role;
commit;
