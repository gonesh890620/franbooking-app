-- Operational FU tracker cutover support.
-- Run this after 001_initial_schema.sql and 002_full_legacy_mapping.sql.

alter table contacts add column if not exists recruiter_name text;
alter table contacts add column if not exists recruiter_email text;
alter table contacts add column if not exists calendar_url text;
alter table contacts add column if not exists outreach_type text;
alter table contacts add column if not exists last_nurture_type text;
alter table contacts add column if not exists last_synced_to_sheet_at timestamptz;

create index if not exists contacts_recruiter_name_idx on contacts (recruiter_name);
create index if not exists contacts_recruiter_email_idx on contacts (recruiter_email);
create index if not exists contacts_status_updated_idx on contacts (status, updated_at);

create or replace view fu_tracker_master as
select
  c.id,
  c.recruiter_name,
  c.recruiter_email,
  c.name,
  c.linkedin_url,
  c.client_id,
  cl.name as client_name,
  c.calendar_url,
  c.status,
  c.next_action,
  c.conversation,
  c.reply,
  c.date_j,
  c.date_k,
  c.date_l,
  c.date_m,
  c.source,
  c.sales_nav_id,
  c.code,
  c.tag,
  c.cany,
  c.legacy_row,
  c.created_at,
  c.updated_at
from contacts c
left join clients cl on cl.id = c.client_id;
