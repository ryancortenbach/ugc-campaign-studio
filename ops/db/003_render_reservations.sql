begin;
create table if not exists public.render_reservations (
  shot_id bigint primary key references public.shots(id) on delete cascade,
  order_id bigint not null references public.orders(id),
  amount numeric not null check (amount > 0 and amount::text not in ('NaN','Infinity','-Infinity')),
  state text not null check (state in ('held','recorded','released')),
  manual_override boolean not null default false,
  created_at timestamptz not null default now()
);
create or replace function public.protect_held_render_reservation() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if old.state='held' then raise exception 'Reconcile the held render before deleting it'; end if;
  return old;
end;$$;
drop trigger if exists protect_held_render_reservation on public.render_reservations;
create trigger protect_held_render_reservation before delete on public.render_reservations for each row execute function public.protect_held_render_reservation();
revoke all on function public.protect_held_render_reservation() from public,anon,authenticated;
grant execute on function public.protect_held_render_reservation() to service_role;
alter table public.render_reservations enable row level security;
grant all on public.render_reservations to service_role;

create or replace function public.reserve_render_submission(p_shot_id bigint, p_manual boolean default false)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare s public.shots%rowtype; v public.videos%rowtype; o public.orders%rowtype;
  amount numeric; order_used numeric; day_used numeric; cap numeric; automatic boolean;
  reasons jsonb := '[]'::jsonb;
begin
  -- Shared by all render reserve/record/reset operations, independent of order.
  perform pg_catalog.pg_advisory_xact_lock(1296647252,1);
  select * into s from public.shots where id=p_shot_id for update;
  if not found or not (s.status='priced' or (s.status='attention' and s.resume_status is not distinct from 'priced')) then raise exception 'Shot is not awaiting submission'; end if;
  if s.estimate_usd is null or s.estimate_usd <= 0 or s.estimate_usd::text in ('NaN','Infinity','-Infinity') then raise exception 'Finite positive estimate required'; end if;
  select * into v from public.videos where id=s.video_id;
  select * into o from public.orders where id=v.order_id;
  if o.id is null then raise exception 'Order not found'; end if;
  if exists(select 1 from public.shots x where (x.status='submitting' or (x.status='attention' and x.resume_status is not distinct from 'unknown'))
    and not exists(select 1 from public.render_reservations r where r.shot_id=x.id and r.state='held')
    and not exists(select 1 from public.spend z where z.shot_id=x.id and z.provider='higgsfield')) then
    return jsonb_build_object('ok',false,'reasons',jsonb_build_array('unreserved unknown submission requires reconciliation'));
  end if;
  cap := coalesce((select (value #>> '{}')::numeric from public.settings where key='dailyCapUsd'),60);
  automatic := coalesce((select (value #>> '{}')::boolean from public.settings where key='autoApproveRenders'),true);
  if cap < 0 or cap::text in ('NaN','Infinity','-Infinity') or o.budget_usd::text in ('NaN','Infinity','-Infinity') then raise exception 'Invalid budget'; end if;
  amount := ceil(s.estimate_usd*100)/100;
  select coalesce(sum(ceil(usd*100)/100),0) into order_used from public.spend where order_id=o.id;
  select order_used+coalesce(sum(r.amount),0) into order_used from public.render_reservations r where order_id=o.id and state='held' and shot_id<>s.id;
  select coalesce(sum(ceil(usd*100)/100),0) into day_used from public.spend where at>=now()-interval '24 hours';
  -- Unknown held outcomes remain reserved even beyond24hours until explicitly reconciled.
  select day_used+coalesce(sum(r.amount),0) into day_used from public.render_reservations r where state='held' and shot_id<>s.id;
  if order_used::text in ('NaN','Infinity','-Infinity') or day_used::text in ('NaN','Infinity','-Infinity') then raise exception 'Invalid recorded spend'; end if;
  if not coalesce(p_manual,false) then
    if not automatic then reasons:=reasons||jsonb_build_array('auto-approval is off'); end if;
    if order_used+amount>o.budget_usd then reasons:=reasons||jsonb_build_array('order budget would be passed'); end if;
    if day_used+amount>cap then reasons:=reasons||jsonb_build_array('daily cap would be passed'); end if;
  end if;
  if jsonb_array_length(reasons)>0 then return jsonb_build_object('ok',false,'reasons',reasons); end if;
  insert into public.render_reservations(shot_id,order_id,amount,state,manual_override)
    values(s.id,o.id,amount,'held',p_manual)
    on conflict(shot_id) do update set amount=excluded.amount,state='held',manual_override=excluded.manual_override;
  update public.shots set status='submitting',submission_key=coalesce(submission_key,'mint-shot-'||id),lock_until=now()+interval '15 minutes',updated_at=now() where id=s.id returning * into s;
  return jsonb_build_object('ok',true,'shot',to_jsonb(s));
end;$$;

create or replace function public.record_accepted_render(p_shot_id bigint,p_request_id text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare result jsonb;
begin
  perform pg_catalog.pg_advisory_xact_lock(1296647252,1);
  result:=public.reconcile_render_submission(p_shot_id,p_request_id);
  update public.render_reservations set state='recorded' where shot_id=p_shot_id and state='held';
  return result;
end;$$;

create or replace function public.reset_unsubmitted_render(p_shot_id bigint)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare s public.shots%rowtype;
begin
  perform pg_catalog.pg_advisory_xact_lock(1296647252,1);
  select * into s from public.shots where id=p_shot_id for update;
  if not found or s.request_id is not null or not ((s.status='attention' and s.resume_status is not distinct from 'unknown') or (s.status='submitting' and coalesce(s.lock_until,s.updated_at+interval '15 minutes')<=now())) then raise exception 'Only an unknown or stale submission without a saved ID can be reset'; end if;
  update public.render_reservations set state='released' where shot_id=s.id and state='held';
  update public.shots set status='priced',resume_status=null,error=null,lock_until=null,updated_at=now() where id=s.id returning * into s;
  return to_jsonb(s);
end;$$;
revoke all on function public.reserve_render_submission(bigint,boolean), public.record_accepted_render(bigint,text), public.reset_unsubmitted_render(bigint) from public,anon,authenticated;
grant execute on function public.reserve_render_submission(bigint,boolean), public.record_accepted_render(bigint,text), public.reset_unsubmitted_render(bigint) to service_role;
commit;
