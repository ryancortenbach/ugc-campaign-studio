-- Mint Labs fulfillment: a paid Whop order becomes delivered videos.
-- Row level security is on with no policies, so only the server's service role key can read or write.

create table if not exists orders (
  id bigint generated always as identity primary key,
  token text not null unique,
  package text not null check (package in ('starter','campaign')),
  videos_total int not null check (videos_total between 1 and 30),
  budget_usd numeric not null check (budget_usd >= 0),
  status text not null default 'awaiting_brief',
  buyer_email text,
  buyer_name text,
  whop_payment_id text unique,
  whop_membership_id text,
  whop_plan_id text,
  amount_usd numeric,
  brief jsonb,
  creative jsonb,
  note text,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists videos (
  id bigint generated always as identity primary key,
  order_id bigint not null references orders(id) on delete cascade,
  idx int not null,
  status text not null default 'queued',
  angle jsonb,
  plan jsonb,
  checks jsonb,
  revisions int not null default 0,
  review_note text,
  final_path text,
  final_bytes bigint,
  error text,
  attempts int not null default 0,
  resume_status text,
  lock_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id, idx)
);

create table if not exists shots (
  id bigint generated always as identity primary key,
  video_id bigint not null references videos(id) on delete cascade,
  idx int not null,
  status text not null default 'draft',
  title text,
  endpoint text not null,
  input jsonb not null,
  dialogue text,
  start_s numeric not null default 0,
  duration_s numeric not null default 5,
  checks jsonb,
  estimate_usd numeric,
  submission_key text,
  request_id text,
  clip_path text,
  error text,
  attempts int not null default 0,
  resume_status text,
  lock_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (video_id, idx)
);

create table if not exists events (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  order_id bigint,
  video_id bigint,
  shot_id bigint,
  level text not null default 'info' check (level in ('info','attention')),
  title text not null,
  data jsonb
);

create table if not exists spend (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  provider text not null,
  usd numeric not null check (usd >= 0),
  order_id bigint,
  video_id bigint,
  shot_id bigint,
  note text
);

create table if not exists outbox (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  kind text not null,
  to_email text,
  subject text not null,
  body text not null,
  order_id bigint,
  status text not null default 'pending' check (status in ('pending','sent','skipped')),
  sent_at timestamptz
);

-- Whop retries a delivery with the same webhook-id, so seen ids are stored and skipped.
create table if not exists webhook_events (
  id text primary key,
  at timestamptz not null default now(),
  type text,
  summary jsonb
);

create table if not exists settings (
  key text primary key,
  value jsonb not null
);

create index if not exists videos_status on videos (status);
create index if not exists shots_status on shots (status);
create index if not exists shots_video on shots (video_id);
create index if not exists events_at on events (at desc);
create index if not exists spend_at on spend (at);

alter table orders enable row level security;
alter table videos enable row level security;
alter table shots enable row level security;
alter table events enable row level security;
alter table spend enable row level security;
alter table outbox enable row level security;
alter table webhook_events enable row level security;
alter table settings enable row level security;

-- Clips and finished videos. Private: the server hands out short-lived signed links.
insert into storage.buckets (id, name, public, file_size_limit)
values ('fulfillment', 'fulfillment', false, 52428800)
on conflict (id) do nothing;

-- Lets the minute heartbeat run without a shared secret: only one tick per window gets the lease.
create table if not exists leases (
  name text primary key,
  until timestamptz not null
);
alter table leases enable row level security;

create or replace function acquire_lease(p_name text, p_seconds int) returns boolean
language sql set search_path = public as $$
  with got as (
    insert into leases (name, until) values (p_name, now() + make_interval(secs => p_seconds))
    on conflict (name) do update set until = excluded.until where leases.until < now()
    returning 1
  )
  select exists (select 1 from got);
$$;
revoke all on function acquire_lease(text, int) from public, anon, authenticated;

-- The server reaches these tables as service_role through the Data API. New tables are not exposed automatically, so grant it here.
grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on function acquire_lease(text, int) to service_role;
