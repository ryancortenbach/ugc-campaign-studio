-- Mint Labs human panel storage (Supabase project "mint-labs-panel").
-- Tables are closed to the anon and authenticated roles: RLS is on and there are no table policies.
-- The public task page reaches the data only through the two SECURITY DEFINER functions below.
-- The Mint Labs server uses the service key, which bypasses RLS.

create table if not exists public.panels(
  token text primary key,
  brand text not null,
  clip_url text not null,
  offer_pdf_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.panel_responses(
  id bigserial primary key,
  token text not null references public.panels(token) on delete cascade,
  submission_id text not null,
  participant_id text,
  answers jsonb not null,
  created_at timestamptz not null default now()
);
create unique index if not exists panel_responses_submission_id_key on public.panel_responses(submission_id);
create index if not exists panel_responses_token_idx on public.panel_responses(token);

alter table public.panels enable row level security;
alter table public.panel_responses enable row level security;
alter table public.panels force row level security;
alter table public.panel_responses force row level security;
revoke all on public.panels, public.panel_responses from anon, authenticated;
revoke all on sequence public.panel_responses_id_seq from anon, authenticated;

-- What the task page shows. Returns nothing for an unknown token.
create or replace function public.get_panel(p_token text)
returns table(brand text, clip_url text, offer_pdf_url text)
language sql
security definer
set search_path = public
stable
as $$
  select p.brand, p.clip_url, p.offer_pdf_url
  from public.panels p
  where p.token = p_token
  limit 1;
$$;

-- Stores one participant response. answers must be exactly:
--   stop_scrolling, real_customer, check_out, clear_product : whole numbers 1 to 10
--   improve : text, 1 to 1000 characters
-- One response per submission_id. Returns {ok:true} or {ok:false,error:<code>}.
create or replace function public.submit_panel_response(p_token text, p_submission_id text, p_participant_id text, p_answers jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  k text;
  v jsonb;
  n numeric;
  rating_keys constant text[] := array['stop_scrolling','real_customer','check_out','clear_product'];
begin
  if p_token is null or not exists (select 1 from public.panels where token = p_token) then
    return jsonb_build_object('ok', false, 'error', 'unknown_panel');
  end if;
  if p_submission_id is null or length(btrim(p_submission_id)) = 0 or length(p_submission_id) > 200 then
    return jsonb_build_object('ok', false, 'error', 'bad_submission_id');
  end if;
  if p_participant_id is not null and length(p_participant_id) > 200 then
    return jsonb_build_object('ok', false, 'error', 'bad_participant_id');
  end if;
  if p_answers is null or jsonb_typeof(p_answers) <> 'object' then
    return jsonb_build_object('ok', false, 'error', 'bad_answers');
  end if;
  if (select count(*) from jsonb_object_keys(p_answers)) <> 5 then
    return jsonb_build_object('ok', false, 'error', 'bad_answers');
  end if;
  foreach k in array rating_keys loop
    v := p_answers -> k;
    if v is null or jsonb_typeof(v) <> 'number' then
      return jsonb_build_object('ok', false, 'error', 'bad_answers');
    end if;
    n := (p_answers ->> k)::numeric;
    if n <> floor(n) or n < 1 or n > 10 then
      return jsonb_build_object('ok', false, 'error', 'bad_answers');
    end if;
  end loop;
  v := p_answers -> 'improve';
  if v is null or jsonb_typeof(v) <> 'string' or length(btrim(p_answers ->> 'improve')) < 1 or length(p_answers ->> 'improve') > 1000 then
    return jsonb_build_object('ok', false, 'error', 'bad_answers');
  end if;
  begin
    insert into public.panel_responses(token, submission_id, participant_id, answers)
    values (p_token, p_submission_id, p_participant_id, p_answers);
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'duplicate');
  end;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.get_panel(text) from public;
revoke all on function public.submit_panel_response(text, text, text, jsonb) from public;
grant execute on function public.get_panel(text) to anon;
grant execute on function public.submit_panel_response(text, text, text, jsonb) to anon;

-- Public bucket for the personalized offer PDFs, one file per panel at offers/<token>.pdf.
-- Reading is public by URL. Writing needs the service key (no storage policies are added for anon).
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('offers', 'offers', true, 15728640, array['application/pdf'])
on conflict (id) do update set public = true;
