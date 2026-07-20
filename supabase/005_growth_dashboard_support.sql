-- Growth dashboard rebuild support (Stage 1: pinned block + Recruiters).
-- Adds fields/tables GAS's Growth panel reads that this port never captured:
-- the "All Appt" master sheet's Responses text (drives recall-reason
-- categorization) and the Wait List tab (prospective clients not yet
-- launched, tracked separately from Master Tracker status buckets).

alter table appointments add column if not exists responses text;

create table if not exists wait_list (
  id uuid primary key default gen_random_uuid(),
  entry_date date,
  client_name text,
  contact_email text,
  eta_launch text,
  notes text,
  legacy_row integer,
  created_at timestamptz not null default now()
);

alter table wait_list enable row level security;
