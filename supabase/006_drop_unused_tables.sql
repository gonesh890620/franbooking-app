-- Removes schema that was never populated and never read/written anywhere
-- in app/ or lib/ — confirmed via a full grep audit of every .from("table")
-- call across the codebase, cross-checked against scripts/migrate-sheets.ts.
-- These are the "zero risk" candidates only: never populated, so there is no
-- data to lose. (A separate, larger candidate list — recruiter_client_assignments,
-- client_dtc_links, recruiter_target_areas, recruiter_necessary_things,
-- recurring_team_tasks — DOES hold real synced data and was deliberately
-- left alone; revisit only with explicit confirmation.)

drop view if exists fu_tracker_master;

-- legacy_row_links has a foreign key to legacy_sources(source_key), so it
-- must be dropped first (child before parent).
drop table if exists legacy_row_links;
drop table if exists legacy_sources;
drop table if exists client_accounts;
drop table if exists recruiter_payments;
