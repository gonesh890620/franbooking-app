-- Admin + Login parity support (Phase 2 of the GAS-to-Next.js data/UI cutover).
-- Adds the fields GAS's Access Control ("Recruiters") tab already tracks that
-- app_users does not yet have: approval/expiry window, referral tracking, and
-- remove reason/date.

alter table app_users add column if not exists approved_at date;
alter table app_users add column if not exists expires_at date;
alter table app_users add column if not exists referred_by text;
alter table app_users add column if not exists remove_date date;
alter table app_users add column if not exists remove_reason text;

create index if not exists app_users_referred_by_idx on app_users (referred_by);
