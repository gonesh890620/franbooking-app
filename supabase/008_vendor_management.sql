-- Vendor Management: Vendors, Profiles, Issues, Orders, Communications.
-- Ported from GAS's dedicated Vendor spreadsheet (5 tabs) into Supabase as
-- the single source of truth, per the established Growth-panel architecture.
-- `code` columns hold the human-readable IDs (VN001/VP001/ORD001) GAS used,
-- generated the same way (max existing numeric suffix + 1) so anyone cross-
-- referencing the old sheet's IDs can still recognize them.

create table if not exists vendors (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  contact_person text,
  email text,
  slack text,
  channel text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists vendor_profiles (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  vendor_name text not null,
  registered_date date,
  sn_connected_date date,
  status text not null default 'Active',
  replacement_of text,
  replaced_by text,
  replacement_date date,
  notes text,
  managed_by text,
  li_profile_url text,
  price numeric,
  last_renewed_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists vendor_issues (
  id uuid primary key default gen_random_uuid(),
  code integer not null unique,
  profile_code text,
  vendor_name text,
  reported_date date,
  issue_type text,
  issue_notes text,
  vendor_feedback_date date,
  vendor_feedback text,
  fixed_date date,
  solved text not null default 'No',
  fixed_by_replacement text,
  replacement_profile_code text,
  vendor_eta date,
  followup_count integer not null default 0,
  last_followup_at text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists vendor_orders (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  vendor_name text not null,
  requested_by text,
  order_date date,
  received_date date,
  status text not null default 'Ordered',
  price numeric,
  notes text,
  profile_name text,
  profile_url text,
  connections text,
  location text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists vendor_communications (
  id uuid primary key default gen_random_uuid(),
  code integer not null unique,
  vendor_name text not null,
  comm_date date,
  channel text,
  note text not null,
  created_at timestamptz not null default now()
);

alter table vendors enable row level security;
alter table vendor_profiles enable row level security;
alter table vendor_issues enable row level security;
alter table vendor_orders enable row level security;
alter table vendor_communications enable row level security;

-- Recruiter Payments (per-cycle payout log — "Recruiter Payments" tab lives
-- in the Cost sheet in GAS; Supabase is the source of truth here too).
create table if not exists recruiter_payments_log (
  id uuid primary key default gen_random_uuid(),
  paid_date date not null,
  recruiter_name text not null,
  recruiter_email text not null,
  recruiter_type text,
  cycle_key text not null,
  cycle_label text,
  cycle_start date,
  cycle_end date,
  own_appts integer not null default 0,
  own_bill numeric not null default 0,
  referral_appts integer not null default 0,
  referral_bill numeric not null default 0,
  total_bill numeric not null default 0,
  invoice_id text not null,
  paid_by text,
  method text,
  created_at timestamptz not null default now()
);
alter table recruiter_payments_log enable row level security;

-- Wise account (payout address) per recruiter — GAS stores this as Col T on
-- Access Control; app_users is this port's Access Control equivalent.
alter table app_users add column if not exists wise_account text;
