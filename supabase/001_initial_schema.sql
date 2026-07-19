-- Franbooking migration schema.
-- Supabase/Postgres should become the fast operational database. Google
-- Sheets can remain as a sync/export layer during transition, but should not
-- stay the hot path if the goal is 100+ recruiters with no action delay.

create extension if not exists pgcrypto;

create table if not exists app_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text not null,
  role text not null default 'recruiter',
  legacy_type text,
  legacy_sheet_id text,
  status text not null default 'approved',
  password_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists recruiter_credits (
  user_id uuid primary key references app_users(id) on delete cascade,
  nurture_balance integer not null default 0,
  outreach_balance integer not null default 0,
  profile_balance integer not null default 0,
  nurture_limit integer not null default 0,
  outreach_limit integer not null default 0,
  profile_limit integer not null default 0,
  used_today integer not null default 0,
  used_alltime integer not null default 0,
  last_used_date date
);

create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  status text not null default 'Active',
  event_url text,
  cany_appts integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists recruiter_client_assignments (
  recruiter_id uuid not null references app_users(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  status text,
  event_url text,
  nurture_pct numeric,
  cany_appts integer,
  flag_notes text,
  primary key (recruiter_id, client_id)
);

create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  recruiter_id uuid not null references app_users(id) on delete cascade,
  name text,
  linkedin_url text not null,
  normalized_linkedin_url text not null,
  client_id uuid references clients(id),
  status text,
  next_action text,
  conversation text,
  reply text,
  date_j date,
  date_k date,
  date_l date,
  date_m date,
  source text,
  sales_nav_id text,
  code text,
  tag text,
  cany boolean not null default false,
  legacy_row integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (recruiter_id, normalized_linkedin_url)
);

create index if not exists contacts_due_idx on contacts (recruiter_id, status, date_j, date_k, date_l, date_m);
create index if not exists contacts_linkedin_idx on contacts (normalized_linkedin_url);

create table if not exists outreach_logs (
  id uuid primary key default gen_random_uuid(),
  recruiter_id uuid references app_users(id),
  contact_id uuid references contacts(id),
  prospect_name text,
  linkedin_url text,
  outreach_type text,
  subject text,
  message text,
  created_at timestamptz not null default now()
);

create table if not exists time_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references app_users(id),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  last_activity_at timestamptz not null default now(),
  auto_closed boolean not null default false
);

create table if not exists app_audit_log (
  id bigserial primary key,
  actor_email text,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists idempotency_keys (
  key text primary key,
  actor_email text,
  action text not null,
  response jsonb,
  created_at timestamptz not null default now()
);

create table if not exists sheet_sync_jobs (
  id bigserial primary key,
  job_type text not null,
  status text not null default 'pending',
  payload jsonb not null,
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  run_after timestamptz not null default now()
);

create index if not exists sheet_sync_jobs_pending_idx
  on sheet_sync_jobs (status, run_after, created_at);

alter table app_users enable row level security;
alter table recruiter_credits enable row level security;
alter table clients enable row level security;
alter table recruiter_client_assignments enable row level security;
alter table contacts enable row level security;
alter table outreach_logs enable row level security;
alter table time_logs enable row level security;
alter table app_audit_log enable row level security;
alter table idempotency_keys enable row level security;
alter table sheet_sync_jobs enable row level security;
