-- Full legacy-to-Supabase mapping for Franbooking.
-- This expands beyond the recruiter MVP into the real production target.
-- Existing recruiter-owned FU Trackers can remain as transition sync sources,
-- but the operational app should read/write these tables for speed.

create table if not exists legacy_sources (
  id uuid primary key default gen_random_uuid(),
  source_key text not null unique,
  spreadsheet_id text not null,
  tab_name text,
  description text,
  last_synced_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists legacy_row_links (
  id uuid primary key default gen_random_uuid(),
  source_key text not null references legacy_sources(source_key),
  table_name text not null,
  record_id uuid not null,
  spreadsheet_id text not null,
  tab_name text not null,
  row_number integer not null,
  row_fingerprint text,
  last_synced_at timestamptz not null default now(),
  unique (source_key, tab_name, row_number),
  unique (table_name, record_id, source_key)
);

create table if not exists templates (
  id uuid primary key default gen_random_uuid(),
  template_area text not null,
  template_type text not null,
  subject text,
  body text not null,
  code text,
  active boolean not null default true,
  legacy_row integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists template_rotation_state (
  user_id uuid not null references app_users(id) on delete cascade,
  template_key text not null,
  next_index integer not null default 0,
  last_used_date date,
  primary key (user_id, template_key)
);

create table if not exists unsure_criteria (
  id uuid primary key default gen_random_uuid(),
  code text,
  criteria text not null,
  response text,
  active boolean not null default true,
  legacy_row integer
);

create table if not exists campaigns (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id),
  campaign_name text not null,
  campaign_id text,
  quota integer,
  results_total integer,
  results_remaining integer,
  quota_complete_pct numeric,
  leads_last_7_days integer,
  target_avg_leads_day numeric,
  campaign_status text,
  paused_reason text,
  action_taken text,
  cycle integer,
  charge_amount numeric,
  payment text,
  cycle_commitment text,
  current_cycle_start date,
  payment_notes text,
  quota_notes text,
  account_id text,
  account_name text,
  vertical text,
  package_type text,
  launch_date date,
  legacy_row integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists client_accounts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id),
  account_id text,
  account_name text,
  account_connect_date date,
  authority_name text,
  cycle_ledger_email text,
  calendly_email text,
  distribution_list text,
  crm text,
  crm_name text,
  crm_address text,
  legacy_row integer
);

create table if not exists client_dtc_links (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id),
  event_url text,
  google_user_email text,
  password_label text,
  tenant text,
  tenant_pd text,
  webprofile text,
  about_li text,
  legacy_row integer
);

create table if not exists leads_ledger (
  id uuid primary key default gen_random_uuid(),
  campaign_name text,
  contact_name text,
  contact_email text,
  phone text,
  company text,
  title text,
  linkedin_url text,
  location text,
  state text,
  date_created timestamptz,
  recruiter_name text,
  recruiter_id uuid references app_users(id),
  client_id uuid references clients(id),
  campaign_id text,
  client_feedback text,
  recall text,
  sent_to_client boolean,
  legacy_row integer,
  created_at timestamptz not null default now()
);

create index if not exists leads_ledger_recruiter_date_idx on leads_ledger (recruiter_name, date_created);
create index if not exists leads_ledger_client_date_idx on leads_ledger (client_id, date_created);

create table if not exists appointments (
  id uuid primary key default gen_random_uuid(),
  invitee_name text,
  invitee_email text,
  linkedin_url text,
  client_name text,
  client_id uuid references clients(id),
  location text,
  timezone text,
  event_created_at timestamptz,
  event_start_at timestamptz,
  event_end_at timestamptz,
  identity_check text,
  canceled text,
  cancellation_reason text,
  canceled_by text,
  on_leads_ledger text,
  processing_sheet_url text,
  sent_to_client text,
  recruiter_name text,
  recruiter_id uuid references app_users(id),
  status text not null default 'pending',
  legacy_row integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists sales_nav_inventory (
  id uuid primary key default gen_random_uuid(),
  date_added date,
  vendor text,
  recruiter_name text,
  recruiter_email text,
  price numeric,
  status text,
  payment_status text,
  expires_at date,
  days_left integer,
  salesnav_id text,
  expire_status text,
  notes text,
  legacy_row integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists leave_requests (
  id uuid primary key default gen_random_uuid(),
  legacy_id integer,
  user_id uuid references app_users(id),
  email text not null,
  name text,
  leave_date date not null,
  duration_days integer not null,
  reason text,
  submitted_date date,
  reviewed boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists daily_feedback (
  id uuid primary key default gen_random_uuid(),
  legacy_id integer,
  user_id uuid references app_users(id),
  email text not null,
  name text,
  submitted_date date,
  salesnav_all boolean,
  salesnav_no_count integer,
  salesnav_no_reason text,
  unusual text,
  responses_today integer,
  comments text,
  reviewed boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists applicants (
  id uuid primary key default gen_random_uuid(),
  legacy_id integer,
  date_applied date,
  platform text,
  name text not null,
  email text,
  phone text,
  linkedin_url text,
  position text,
  status text,
  assigned_agent_id uuid references app_users(id),
  assigned_agent_name text,
  notes text,
  created_date date,
  updated_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists agent_logs (
  id uuid primary key default gen_random_uuid(),
  applicant_id uuid references applicants(id) on delete cascade,
  legacy_applicant_id integer,
  applicant_name text,
  agent_id uuid references app_users(id),
  agent_email text,
  agent_name text,
  assigned_date date,
  checklist jsonb not null default '{}'::jsonb,
  answers jsonb not null default '{}'::jsonb,
  notes text,
  updated_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists team_tasks (
  id uuid primary key default gen_random_uuid(),
  legacy_id text,
  title text not null,
  description text,
  topic text,
  priority text,
  eta date,
  eta_text text,
  status text,
  created_date date,
  completed_date date,
  source text,
  assigned_user_id uuid references app_users(id),
  assigned_email text,
  assigned_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists recurring_team_tasks (
  id uuid primary key default gen_random_uuid(),
  legacy_id text,
  title text not null,
  description text,
  topic text,
  priority text,
  days_of_month integer[] not null default '{}',
  active boolean not null default true,
  last_generated date,
  assigned_user_id uuid references app_users(id),
  assigned_email text,
  assigned_name text,
  created_at timestamptz not null default now()
);

create table if not exists costs (
  id uuid primary key default gen_random_uuid(),
  date date,
  amount numeric not null default 0,
  description text,
  notes text,
  use_method text,
  comments text,
  legacy_row integer,
  created_at timestamptz not null default now()
);

create table if not exists client_payments (
  id uuid primary key default gen_random_uuid(),
  date_issue date,
  date_paid date,
  client_id uuid references clients(id),
  client_name text,
  invoice_ref text,
  cycle integer,
  total_billed numeric,
  status text,
  charged_by text,
  legacy_row integer,
  created_at timestamptz not null default now()
);

create table if not exists recruiter_payments (
  id uuid primary key default gen_random_uuid(),
  recruiter_id uuid references app_users(id),
  recruiter_email text,
  recruiter_name text,
  period_start date,
  period_end date,
  amount numeric,
  paid_date date,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists recruiter_target_areas (
  id uuid primary key default gen_random_uuid(),
  recruiter_id uuid not null references app_users(id) on delete cascade,
  assign_date date,
  zip_code text,
  city text,
  state text,
  sales_nav_id text,
  profile_name text,
  best_cst_time text,
  legacy_row integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (recruiter_id, legacy_row)
);

create table if not exists recruiter_necessary_things (
  id uuid primary key default gen_random_uuid(),
  recruiter_id uuid not null references app_users(id) on delete cascade,
  item_date date,
  description text,
  payment_status text,
  raw_data jsonb not null default '[]'::jsonb,
  legacy_row integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (recruiter_id, legacy_row)
);

create table if not exists ai_cost_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references app_users(id),
  email text,
  action text,
  model text,
  input_tokens integer,
  output_tokens integer,
  cost numeric,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table legacy_sources enable row level security;
alter table legacy_row_links enable row level security;
alter table templates enable row level security;
alter table template_rotation_state enable row level security;
alter table unsure_criteria enable row level security;
alter table campaigns enable row level security;
alter table client_accounts enable row level security;
alter table client_dtc_links enable row level security;
alter table leads_ledger enable row level security;
alter table appointments enable row level security;
alter table sales_nav_inventory enable row level security;
alter table leave_requests enable row level security;
alter table daily_feedback enable row level security;
alter table applicants enable row level security;
alter table agent_logs enable row level security;
alter table team_tasks enable row level security;
alter table recurring_team_tasks enable row level security;
alter table costs enable row level security;
alter table client_payments enable row level security;
alter table recruiter_payments enable row level security;
alter table recruiter_target_areas enable row level security;
alter table recruiter_necessary_things enable row level security;
alter table ai_cost_logs enable row level security;
