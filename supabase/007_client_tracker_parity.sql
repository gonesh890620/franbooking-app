-- Client Tracker full parity (Add/Update/Archive Client, Mark Ledger Sent,
-- Ledger CSV export, Slot/Vacation check follow-ups). Adds the handful of
-- Master-Tracker-adjacent fields GAS keeps in separate tabs (Accounts,
-- Customer_Roles) directly onto campaigns instead — this port treats each
-- client/campaign as one Supabase row, so a join table isn't needed. Also
-- adds client_feedback (GAS's "Client Feedback" sheet: Positive/Negative/No
-- Show buckets per client), which nothing has read from Supabase before now.

alter table campaigns add column if not exists account_connect_date date;
alter table campaigns add column if not exists acct_authority text;
alter table campaigns add column if not exists cycle_ledger_email text;
alter table campaigns add column if not exists calendly_email text;
alter table campaigns add column if not exists distribution_list text;
alter table campaigns add column if not exists crm text;
alter table campaigns add column if not exists crm_name text;
alter table campaigns add column if not exists crm_address text;
alter table campaigns add column if not exists archived boolean not null default false;
alter table campaigns add column if not exists archived_at timestamptz;
alter table campaigns add column if not exists archive_reason text;
alter table campaigns add column if not exists archived_by text;

create table if not exists client_feedback (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id),
  client_name text,
  category text,
  feedback_date date,
  legacy_row integer,
  created_at timestamptz not null default now()
);

alter table client_feedback enable row level security;
