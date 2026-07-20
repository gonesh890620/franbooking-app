import { config as loadDotenv } from "dotenv";
import crypto from "crypto";
import { getSupabaseAdmin } from "../lib/supabaseAdmin";
import { getValues, quoteSheetName } from "../lib/sheets";
import { cleanClientName, normalizeDateCell, normalizeLi, RC } from "../lib/legacyMaps";

loadDotenv({ path: ".env.local" });
loadDotenv();

type Row = unknown[];
type Supabase = any;

const env = (name: string, fallback = "") => process.env[name] || fallback;
const ACCESS_SHEET_ID = env("ACCESS_SHEET_ID", "11f1JoawE4n5YLhDuT8HRx2CaciCpNUi0uDxCerf_w4A");
const CAMPAIGN_SHEET_ID = env("CAMPAIGN_SHEET_ID", "1iVmXVT65j7HiUIp3ef6OvMuV1FdgFgg_B1YT-eM0r6c");
const TEMPLATE_SHEET_ID = env("TEMPLATE_SHEET_ID", "1W8pG1SWl_dMIGziSSGRC2HUkqcsGZSl3mb8mymqJG_k");
const MASTER_DB_ID = env("MASTER_DB_ID", "1Vf6UDslylUn8z0pcG7FQdIhc9sWckO7wRyrmyRx4idQ");
const APPT_SHEET_ID = env("APPT_SHEET_ID", "1z3RBPj-J8Ro_wbnRUDLnKuZ-M-jaQ8GMkCUBy7mEHBg");
const SALESNAV_INV_SHEET_ID = env("SALESNAV_INV_SHEET_ID", "1zxzS4TSZUnQOqmkegX3P1Kx356vMyibOtcr1QSnobX4");
const TIME_LOG_ID = env("TIME_LOG_ID", "11MLXf1-eieikzbnTMq8xZKtj4tBXd6DNkooZAVHDhG8");
const FEEDBACK_SHEET_ID = env("FEEDBACK_SHEET_ID", "1-pvyUCMuLVXILbWlp9QZNFNcGu9kdYmmuHUHOS428AU");
const APPLICANT_SHEET_ID = env("APPLICANT_SHEET_ID", "1rR5WJGmIBfW6J8UVZvUQnh-HwgOZ0m0o7RKhjjFQXUc");
const DAILY_TASK_SHEET_ID = env("DAILY_TASK_SHEET_ID", "1Xtv_gOjubw1cbcqYYvhcO2z3JoZkGcz78Xu-c4kSBP4");
const COST_SHEET_ID = env("COST_SHEET_ID", "1fSpaXJ5FjNaijDo-KoPsRVMiq9etuKYkyrjSuAn_jk8");

const arg = (name: string) => process.argv.includes(`--${name}`);
const DRY_RUN = arg("dry-run");

function text(row: Row, idx: number) {
  return String(row[idx] ?? "").trim();
}

function num(row: Row, idx: number) {
  const n = Number(row[idx] ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function int(row: Row, idx: number) {
  const n = parseInt(String(row[idx] ?? "0"), 10);
  return Number.isFinite(n) ? n : 0;
}

function date(row: Row, idx: number) {
  return normalizeDateCell(row[idx]) || null;
}

function boolYes(value: unknown) {
  return /^(yes|true|1)$/i.test(String(value ?? "").trim());
}

function hashRow(row: Row) {
  return crypto.createHash("sha1").update(JSON.stringify(row)).digest("hex");
}

// Time Log cells can come back as a full timestamp (Last Activity) or a
// bare time-of-day (Start/End Time) depending on how the sheet cell is
// formatted. Combine with the row's own Date column when the value has no
// real date component, matching GAS's own noon-anchored fallback intent.
function parseTimeLogTimestamp(dateStr: string, raw: unknown): string | null {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  const direct = new Date(value);
  if (!Number.isNaN(direct.getTime()) && direct.getFullYear() > 1971) {
    return direct.toISOString();
  }
  const match = value.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?/i);
  if (!match || !dateStr) return null;
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const seconds = match[3] ? parseInt(match[3], 10) : 0;
  const meridiem = match[4]?.toUpperCase();
  if (meridiem === "PM" && hours < 12) hours += 12;
  if (meridiem === "AM" && hours === 12) hours = 0;
  const combined = new Date(`${dateStr}T00:00:00Z`);
  combined.setUTCHours(hours, minutes, seconds, 0);
  return combined.toISOString();
}

async function rows(spreadsheetId: string, tab: string, range = "A:AZ") {
  const values = await getValues(spreadsheetId, `${quoteSheetName(tab)}!${range}`);
  return values.slice(1);
}

async function upsertMany(supabase: Supabase, table: string, records: Record<string, unknown>[], onConflict?: string) {
  const filtered = records.filter(Boolean);
  if (!filtered.length) {
    console.log(`${table}: 0`);
    return [];
  }
  console.log(`${table}: ${filtered.length}${DRY_RUN ? " (dry run)" : ""}`);
  if (DRY_RUN) return filtered;
  const query = supabase.from(table).upsert(filtered, onConflict ? { onConflict } : undefined).select();
  const { data, error } = await query;
  if (error) throw new Error(`${table}: ${error.message}`);
  return data || [];
}

function uniqueBy<T>(items: T[], keyFn: (item: T) => string) {
  const map = new Map<string, T>();
  for (const item of items) {
    const key = keyFn(item);
    if (!key) continue;
    if (!map.has(key)) map.set(key, item);
  }
  return Array.from(map.values());
}

async function insertMany(supabase: Supabase, table: string, records: Record<string, unknown>[]) {
  const filtered = records.filter(Boolean);
  if (!filtered.length) {
    console.log(`${table}: 0`);
    return [];
  }
  console.log(`${table}: ${filtered.length}${DRY_RUN ? " (dry run)" : ""}`);
  if (DRY_RUN) return filtered;
  const { data, error } = await supabase.from(table).insert(filtered).select();
  if (error) throw new Error(`${table}: ${error.message}`);
  return data || [];
}

async function userMaps(supabase: Supabase) {
  const { data, error } = await supabase.from("app_users").select("id,email,name");
  if (error) throw error;
  const byEmail = new Map<string, string>();
  const byName = new Map<string, string>();
  (data || []).forEach((u: any) => {
    if (u.email) byEmail.set(String(u.email).toLowerCase(), u.id);
    if (u.name) byName.set(String(u.name).toLowerCase(), u.id);
  });
  return { byEmail, byName };
}

async function clientMaps(supabase: Supabase) {
  const { data, error } = await supabase.from("clients").select("id,name");
  if (error) throw error;
  const byName = new Map<string, string>();
  (data || []).forEach((c: any) => {
    if (c.name) byName.set(cleanClientName(c.name).toLowerCase(), c.id);
  });
  return { byName };
}

async function migrateUsers(supabase: Supabase) {
  const data = await rows(ACCESS_SHEET_ID, "Recruiters", "A:T");
  const users = data
    .filter((r) => text(r, RC.EMAIL))
    .map((r) => {
      const type = text(r, RC.TYPE) || "PH";
      const low = type.toLowerCase();
      const role = low.startsWith("op") ? "operations" : low.startsWith("agent") ? "agent" : low === "growth" ? "growth" : low === "client" ? "client" : "recruiter";
      return {
        email: text(r, RC.EMAIL).toLowerCase(),
        name: text(r, RC.NAME) || text(r, RC.EMAIL),
        role,
        legacy_type: type,
        legacy_sheet_id: text(r, RC.SHEET_ID),
        status: text(r, RC.STATUS) || "approved",
        password_hash: text(r, RC.PASSWORD),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
    });
  await upsertMany(supabase, "app_users", users, "email");
  const maps = await userMaps(supabase);
  const credits = data
    .filter((r) => text(r, RC.EMAIL))
    .map((r) => ({
      user_id: maps.byEmail.get(text(r, RC.EMAIL).toLowerCase()),
      nurture_balance: int(r, RC.N_BAL),
      outreach_balance: int(r, RC.O_BAL),
      profile_balance: int(r, RC.P_BAL),
      nurture_limit: int(r, RC.N_LIMIT),
      outreach_limit: int(r, RC.O_LIMIT),
      profile_limit: int(r, RC.P_LIMIT),
      used_today: int(r, RC.USED_TODAY),
      used_alltime: int(r, RC.USED_ALLTIME),
      last_used_date: date(r, RC.LAST_UPD)
    }))
    .filter((r) => r.user_id);
  await upsertMany(supabase, "recruiter_credits", credits, "user_id");
}

async function migrateClientsAndCampaigns(supabase: Supabase) {
  const mt = await rows(CAMPAIGN_SHEET_ID, "Master Tracker", "A:X");
  const clients = mt
    .filter((r) => cleanClientName(text(r, 0)))
    .map((r) => ({
      name: cleanClientName(text(r, 0)),
      status: text(r, 14) || text(r, 8) || "Active",
      cany_appts: int(r, 23),
      updated_at: new Date().toISOString()
    }));
  await upsertMany(supabase, "clients", clients, "name");
  const cm = await clientMaps(supabase);
  const campaigns = mt
    .filter((r) => cleanClientName(text(r, 0)))
    .map((r, idx) => ({
      client_id: cm.byName.get(cleanClientName(text(r, 0)).toLowerCase()),
      campaign_name: cleanClientName(text(r, 0)),
      campaign_id: text(r, 1),
      quota: int(r, 2),
      results_total: int(r, 3),
      results_remaining: int(r, 4),
      quota_complete_pct: num(r, 5),
      leads_last_7_days: int(r, 6),
      target_avg_leads_day: num(r, 7),
      campaign_status: text(r, 8),
      paused_reason: text(r, 9),
      action_taken: text(r, 10),
      cycle: int(r, 11),
      charge_amount: num(r, 12),
      payment: text(r, 13),
      cycle_commitment: text(r, 14),
      current_cycle_start: date(r, 15),
      payment_notes: text(r, 16),
      quota_notes: text(r, 17),
      account_id: text(r, 18),
      account_name: text(r, 19),
      vertical: text(r, 20),
      package_type: text(r, 21),
      launch_date: date(r, 22),
      legacy_row: idx + 2,
      updated_at: new Date().toISOString()
    }));
  await insertMany(supabase, "campaigns", campaigns);
}

async function migrateDtcLinks(supabase: Supabase) {
  const cm = await clientMaps(supabase);
  const data = await rows(CAMPAIGN_SHEET_ID, "Client DTC URL", "A:J");
  const records = data
    .filter((r) => cleanClientName(text(r, 0)))
    .map((r, idx) => ({
      client_id: cm.byName.get(cleanClientName(text(r, 0)).toLowerCase()),
      event_url: text(r, 2),
      google_user_email: text(r, 3),
      password_label: text(r, 4),
      tenant: text(r, 5),
      tenant_pd: text(r, 6),
      about_li: text(r, 8),
      webprofile: text(r, 9),
      legacy_row: idx + 2
    }))
    .filter((r) => r.client_id || r.event_url);
  await insertMany(supabase, "client_dtc_links", records);
  const clientUpdates = records.filter((r) => r.client_id && r.event_url).map((r) => ({ id: r.client_id, event_url: r.event_url }));
  await upsertMany(supabase, "clients", clientUpdates, "id");
}

async function migrateRecruiterOwnedSheets(supabase: Supabase) {
  if (arg("skip-fu")) {
    console.log("skipping recruiter-owned FU Trackers");
    return;
  }
  const accessRows = await rows(ACCESS_SHEET_ID, "Recruiters", "A:T");
  const users = await userMaps(supabase);

  for (const recRow of accessRows) {
    const email = text(recRow, RC.EMAIL).toLowerCase();
    const sheetId = text(recRow, RC.SHEET_ID);
    const recruiterId = users.byEmail.get(email);
    if (!email || !sheetId || !recruiterId) continue;
    console.log(`recruiter sheet: ${email}`);

    try {
      const dailyRows = await rows(sheetId, "Daily Assignment", "A:F");
      const assignmentClientNames = dailyRows.map((r) => cleanClientName(text(r, 0))).filter(Boolean);
      await upsertMany(supabase, "clients", assignmentClientNames.map((name) => ({ name, status: "Active" })), "name");
      const clients = await clientMaps(supabase);
      const assignments = dailyRows
        .filter((r) => cleanClientName(text(r, 0)))
        .map((r) => ({
          recruiter_id: recruiterId,
          client_id: clients.byName.get(cleanClientName(text(r, 0)).toLowerCase()),
          status: text(r, 1),
          event_url: text(r, 2),
          nurture_pct: num(r, 3),
          cany_appts: int(r, 4),
          flag_notes: text(r, 5)
        }))
        .filter((r) => r.client_id);
      await upsertMany(supabase, "recruiter_client_assignments", assignments, "recruiter_id,client_id");
    } catch (e) {
      console.warn(`${email}: Daily Assignment skipped: ${e instanceof Error ? e.message : e}`);
    }

    try {
      const fuRows = await rows(sheetId, "FU Tracker", "A:R");
      const clients = await clientMaps(supabase);
      const contactsRaw = fuRows
        .filter((r) => text(r, 1) || text(r, 2))
        .map((r, idx) => {
          const clientName = cleanClientName(text(r, 3));
          const li = text(r, 2);
          return {
            recruiter_id: recruiterId,
            recruiter_name: text(recRow, RC.NAME) || email,
            recruiter_email: email,
            name: text(r, 1),
            linkedin_url: li,
            normalized_linkedin_url: normalizeLi(li) || `legacy-row-${sheetId}-${idx + 2}`,
            client_id: clients.byName.get(clientName.toLowerCase()),
            status: text(r, 5) || text(r, 8),
            next_action: text(r, 6),
            conversation: text(r, 7),
            reply: text(r, 8),
            date_j: date(r, 9),
            date_k: date(r, 10),
            date_l: date(r, 11),
            date_m: date(r, 12),
            source: text(r, 13),
            sales_nav_id: text(r, 14),
            code: text(r, 15),
            tag: text(r, 16),
            cany: boolYes(r[17]),
            legacy_row: idx + 2,
            updated_at: new Date().toISOString()
          };
        });
      const contacts = uniqueBy(
        contactsRaw,
        (contact) => `${contact.recruiter_id}:${contact.normalized_linkedin_url}`
      );
      const dropped = contactsRaw.length - contacts.length;
      if (dropped > 0) console.log(`${email}: skipped ${dropped} duplicate contact rows by LinkedIn URL`);
      await upsertMany(supabase, "contacts", contacts, "recruiter_id,normalized_linkedin_url");
    } catch (e) {
      console.warn(`${email}: FU Tracker skipped: ${e instanceof Error ? e.message : e}`);
    }

    try {
      const targetRows = await rows(sheetId, "Target Area", "A:G");
      const targetAreas = targetRows
        .filter((r) => text(r, 1) || text(r, 2) || text(r, 4) || text(r, 5))
        .map((r, idx) => ({
          recruiter_id: recruiterId,
          assign_date: date(r, 0),
          zip_code: text(r, 1),
          city: text(r, 2),
          state: text(r, 3),
          sales_nav_id: text(r, 4),
          profile_name: text(r, 5),
          best_cst_time: text(r, 6),
          legacy_row: idx + 2,
          updated_at: new Date().toISOString()
        }));
      await upsertMany(supabase, "recruiter_target_areas", targetAreas, "recruiter_id,legacy_row");
    } catch (e) {
      console.warn(`${email}: Target Area skipped: ${e instanceof Error ? e.message : e}`);
    }

    try {
      let necessaryRows: Row[] = [];
      for (const tab of ["Necessary Things", "necessary things", "Necessary things"]) {
        try {
          necessaryRows = await rows(sheetId, tab, "A:Z");
          if (necessaryRows.length) break;
        } catch {
          // try next known casing
        }
      }
      const necessary = necessaryRows
        .filter((r) => r.some((cell) => String(cell ?? "").trim()))
        .map((r, idx) => ({
          recruiter_id: recruiterId,
          item_date: date(r, 0),
          description: text(r, 1),
          payment_status: text(r, 2),
          raw_data: r,
          legacy_row: idx + 2,
          updated_at: new Date().toISOString()
        }));
      await upsertMany(supabase, "recruiter_necessary_things", necessary, "recruiter_id,legacy_row");
    } catch (e) {
      console.warn(`${email}: Necessary Things skipped: ${e instanceof Error ? e.message : e}`);
    }
  }
}

async function migrateTemplates(supabase: Supabase) {
  const copy = await rows(TEMPLATE_SHEET_ID, "Copy", "A:Z");
  const nurture = await rows(TEMPLATE_SHEET_ID, "Nurture Copy", "A:Z");
  const templates = [
    ...copy.map((r, idx) => ({
      template_area: "outreach",
      template_type: text(r, 0) || text(r, 1) || "InMail",
      subject: text(r, 1),
      body: text(r, 2) || text(r, 1),
      code: text(r, 3),
      legacy_row: idx + 2
    })),
    ...nurture.map((r, idx) => ({
      template_area: "nurture",
      template_type: text(r, 0) || "Interested",
      subject: "",
      body: text(r, 1) || text(r, 2),
      code: text(r, 2),
      legacy_row: idx + 2
    }))
  ].filter((r) => r.body);
  await insertMany(supabase, "templates", templates);

  const unsure = await rows(TEMPLATE_SHEET_ID, "Unsure Template", "A:C");
  await insertMany(supabase, "unsure_criteria", unsure.filter((r) => text(r, 1)).map((r, idx) => ({
    code: text(r, 0),
    criteria: text(r, 1),
    response: text(r, 2),
    legacy_row: idx + 2
  })));
}

async function migrateWaitList(supabase: Supabase) {
  const data = await rows(CAMPAIGN_SHEET_ID, "Wait List", "A:E");
  const records = data.filter((r) => text(r, 1)).map((r, idx) => ({
    entry_date: date(r, 0),
    client_name: text(r, 1),
    contact_email: text(r, 2),
    eta_launch: text(r, 3),
    notes: text(r, 4),
    legacy_row: idx + 2
  }));
  await insertMany(supabase, "wait_list", records);
}

async function migrateLeadsLedger(supabase: Supabase) {
  const users = await userMaps(supabase);
  const clients = await clientMaps(supabase);
  const data = await rows(CAMPAIGN_SHEET_ID, "Leads Ledger", "A:U");
  const records = data.filter((r) => text(r, 0) || text(r, 3) || text(r, 10)).map((r, idx) => {
    const clientName = cleanClientName(text(r, 0));
    const recruiterName = text(r, 17);
    return {
      campaign_name: text(r, 0),
      contact_name: text(r, 3),
      contact_email: text(r, 4),
      phone: text(r, 5),
      company: text(r, 8),
      title: text(r, 9),
      linkedin_url: text(r, 10),
      location: text(r, 11),
      state: text(r, 12),
      date_created: date(r, 13),
      recruiter_name: recruiterName,
      recruiter_id: users.byName.get(recruiterName.toLowerCase()) || users.byEmail.get(recruiterName.toLowerCase()),
      client_id: clients.byName.get(clientName.toLowerCase()),
      campaign_id: text(r, 18),
      legacy_row: idx + 2
    };
  });
  await insertMany(supabase, "leads_ledger", records);
}

async function migrateMasterDb(supabase: Supabase) {
  const users = await userMaps(supabase);
  const data = await rows(MASTER_DB_ID, "Sheet1", "A:H");
  const records = data.filter((r) => text(r, 1) || text(r, 2)).map((r) => {
    const recruiterName = text(r, 6);
    return {
      recruiter_id: users.byName.get(recruiterName.toLowerCase()),
      prospect_name: text(r, 1),
      linkedin_url: text(r, 2),
      outreach_type: text(r, 5),
      subject: text(r, 6),
      message: text(r, 7),
      created_at: date(r, 0) || new Date().toISOString()
    };
  });
  await insertMany(supabase, "outreach_logs", records);
}

async function migrateAppointments(supabase: Supabase) {
  const users = await userMaps(supabase);
  const clients = await clientMaps(supabase);
  const data = await rows(APPT_SHEET_ID, "All Appt", "A:U");
  const records = data.filter((r) => text(r, 0) || text(r, 2) || text(r, 3)).map((r, idx) => {
    const clientName = cleanClientName(text(r, 0));
    const recruiterName = text(r, 14);
    return {
      invitee_name: text(r, 2),
      invitee_email: text(r, 3).toLowerCase(),
      linkedin_url: text(r, 4),
      client_name: text(r, 0),
      client_id: clients.byName.get(clientName.toLowerCase()),
      location: text(r, 5),
      timezone: text(r, 6),
      event_created_at: date(r, 10),
      event_start_at: date(r, 11),
      event_end_at: date(r, 12),
      responses: text(r, 9),
      identity_check: text(r, 14),
      canceled: text(r, 15),
      cancellation_reason: text(r, 16),
      canceled_by: text(r, 17),
      on_leads_ledger: text(r, 18),
      processing_sheet_url: text(r, 19),
      sent_to_client: text(r, 20),
      recruiter_name: recruiterName,
      recruiter_id: users.byName.get(recruiterName.toLowerCase()),
      status: text(r, 14) || text(r, 20) ? "processed" : "pending",
      legacy_row: idx + 2
    };
  });
  await insertMany(supabase, "appointments", records);
}

async function migrateTimeAndFeedback(supabase: Supabase) {
  const users = await userMaps(supabase);
  const timeRows = await rows(TIME_LOG_ID, "Recruiters", "A:G");
  await insertMany(supabase, "time_logs", timeRows.filter((r) => text(r, 2)).map((r) => {
    const rowDate = date(r, 0) || new Date().toISOString().slice(0, 10);
    const startedAt = parseTimeLogTimestamp(rowDate, r[3]) || `${rowDate}T00:00:00Z`;
    const endedAt = parseTimeLogTimestamp(rowDate, r[4]);
    // Last Activity (Col F) drives the Recruiter Status "Inactive 5+ Days"
    // bucket — falling back to noon on the row's date mirrors GAS's own
    // fallback so a sheet without this column doesn't look artificially stale.
    const lastActivityAt = parseTimeLogTimestamp(rowDate, r[5]) || `${rowDate}T12:00:00Z`;
    return {
      user_id: users.byName.get(text(r, 2).toLowerCase()),
      started_at: startedAt,
      ended_at: endedAt,
      last_activity_at: lastActivityAt,
      auto_closed: Boolean(text(r, 6))
    };
  }));

  const leaveRows = await rows(FEEDBACK_SHEET_ID, "Leave Status", "A:G");
  await insertMany(supabase, "leave_requests", leaveRows.filter((r) => text(r, 1)).map((r) => ({
    legacy_id: int(r, 0),
    user_id: users.byEmail.get(text(r, 1).toLowerCase()),
    email: text(r, 1).toLowerCase(),
    name: text(r, 2),
    leave_date: date(r, 3),
    duration_days: int(r, 4),
    reason: text(r, 5),
    submitted_date: date(r, 6)
  })));

  const feedbackRows = await rows(FEEDBACK_SHEET_ID, "Feedback", "A:K");
  await insertMany(supabase, "daily_feedback", feedbackRows.filter((r) => text(r, 1)).map((r) => ({
    legacy_id: int(r, 0),
    user_id: users.byEmail.get(text(r, 1).toLowerCase()),
    email: text(r, 1).toLowerCase(),
    name: text(r, 2),
    submitted_date: date(r, 3),
    salesnav_all: boolYes(r[4]),
    salesnav_no_count: int(r, 5),
    salesnav_no_reason: text(r, 6),
    unusual: text(r, 7),
    responses_today: int(r, 8),
    comments: text(r, 9),
    reviewed: boolYes(r[10])
  })));
}

async function migrateSalesNavApplicantsTasksFinance(supabase: Supabase) {
  const users = await userMaps(supabase);
  const sni = await rows(SALESNAV_INV_SHEET_ID, "Sales Nav Inventory", "A:L");
  await insertMany(supabase, "sales_nav_inventory", sni.filter((r) => text(r, 1) || text(r, 3)).map((r, idx) => ({
    date_added: date(r, 0),
    vendor: text(r, 1),
    recruiter_name: text(r, 2),
    recruiter_email: text(r, 3).toLowerCase(),
    price: num(r, 4),
    status: text(r, 5),
    payment_status: text(r, 6),
    expires_at: date(r, 7),
    days_left: int(r, 8),
    salesnav_id: text(r, 9),
    expire_status: text(r, 10),
    notes: text(r, 11),
    legacy_row: idx + 2
  })));

  const applicants = await rows(APPLICANT_SHEET_ID, "Applicants", "A:N");
  const insertedApplicants = await insertMany(supabase, "applicants", applicants.filter((r) => text(r, 3)).map((r) => ({
    legacy_id: int(r, 0),
    date_applied: date(r, 1),
    platform: text(r, 2),
    name: text(r, 3),
    email: text(r, 4).toLowerCase(),
    phone: text(r, 5),
    linkedin_url: text(r, 6),
    position: text(r, 7),
    status: text(r, 8),
    assigned_agent_id: users.byEmail.get(text(r, 9).toLowerCase()),
    assigned_agent_name: text(r, 10),
    notes: text(r, 11),
    created_date: date(r, 12),
    updated_date: date(r, 13)
  })));
  const applicantByLegacy = new Map<number, string>();
  insertedApplicants.forEach((a: any) => {
    if (a.legacy_id) applicantByLegacy.set(Number(a.legacy_id), a.id);
  });

  const agentLogs = await rows(APPLICANT_SHEET_ID, "Agent Log", "A:AP");
  await insertMany(supabase, "agent_logs", agentLogs.filter((r) => text(r, 0)).map((r) => ({
    applicant_id: applicantByLegacy.get(int(r, 0)),
    legacy_applicant_id: int(r, 0),
    applicant_name: text(r, 1),
    agent_id: users.byEmail.get(text(r, 2).toLowerCase()),
    agent_email: text(r, 2).toLowerCase(),
    agent_name: text(r, 3),
    assigned_date: date(r, 4),
    checklist: { raw: r.slice(5, 42) },
    answers: {},
    notes: text(r, 26),
    updated_date: date(r, 27)
  })));

  const tasks = await rows(DAILY_TASK_SHEET_ID, "Tasks", "A:L");
  await insertMany(supabase, "team_tasks", tasks.filter((r) => text(r, 1)).map((r) => ({
    legacy_id: text(r, 0),
    title: text(r, 1),
    description: text(r, 2),
    topic: text(r, 3),
    priority: text(r, 4),
    eta: date(r, 5),
    eta_text: date(r, 5) ? "" : text(r, 5),
    status: text(r, 6),
    created_date: date(r, 7),
    completed_date: date(r, 8),
    source: text(r, 9),
    assigned_user_id: users.byEmail.get(text(r, 10).toLowerCase()),
    assigned_email: text(r, 10).toLowerCase(),
    assigned_name: text(r, 11)
  })));

  const recurring = await rows(DAILY_TASK_SHEET_ID, "Recurring Tasks", "A:J");
  await insertMany(supabase, "recurring_team_tasks", recurring.filter((r) => text(r, 1)).map((r) => ({
    legacy_id: text(r, 0),
    title: text(r, 1),
    description: text(r, 2),
    topic: text(r, 3),
    priority: text(r, 4),
    days_of_month: text(r, 5).split(",").map((x) => parseInt(x.trim(), 10)).filter(Number.isFinite),
    active: boolYes(r[6]) || text(r, 6).toLowerCase() === "active",
    last_generated: date(r, 7),
    assigned_user_id: users.byEmail.get(text(r, 8).toLowerCase()),
    assigned_email: text(r, 8).toLowerCase(),
    assigned_name: text(r, 9)
  })));

  const costs = await rows(COST_SHEET_ID, "Purchase", "A:F");
  await insertMany(supabase, "costs", costs.filter((r) => text(r, 0) || text(r, 2)).map((r, idx) => ({
    date: date(r, 0),
    amount: num(r, 1),
    description: text(r, 2),
    notes: text(r, 3),
    use_method: text(r, 4),
    comments: text(r, 5),
    legacy_row: idx + 2
  })));

  const clients = await clientMaps(supabase);
  const payments = await rows(CAMPAIGN_SHEET_ID, "Client Payment", "A:H");
  await insertMany(supabase, "client_payments", payments.filter((r) => text(r, 2) || text(r, 4)).map((r, idx) => ({
    date_issue: date(r, 0),
    date_paid: date(r, 1),
    client_id: clients.byName.get(cleanClientName(text(r, 2)).toLowerCase()),
    client_name: text(r, 2),
    invoice_ref: text(r, 3),
    cycle: int(r, 4),
    total_billed: num(r, 5),
    status: text(r, 6),
    charged_by: text(r, 7),
    legacy_row: idx + 2
  })));
}

async function resetImportedTables(supabase: Supabase) {
  if (!arg("reset")) return;
  const tables = [
    "client_payments", "costs", "recurring_team_tasks", "team_tasks", "agent_logs", "applicants",
    "sales_nav_inventory", "daily_feedback", "leave_requests", "time_logs", "appointments",
    "outreach_logs", "leads_ledger", "unsure_criteria", "templates", "client_dtc_links",
    "campaigns", "recruiter_necessary_things", "recruiter_target_areas", "contacts",
    "recruiter_client_assignments", "recruiter_credits", "clients", "app_users", "wait_list"
  ];
  if (DRY_RUN) {
    console.log(`would reset: ${tables.join(", ")}`);
    return;
  }
  const keyByTable: Record<string, string> = {
    recruiter_credits: "user_id",
    recruiter_client_assignments: "recruiter_id"
  };
  for (const table of tables) {
    console.log(`clearing ${table}`);
    const key = keyByTable[table] || "id";
    const { error } = await supabase.from(table).delete().neq(key, "00000000-0000-0000-0000-000000000000");
    if (error) console.warn(`${table}: ${error.message}`);
  }
}

async function main() {
  const supabase = getSupabaseAdmin() as any;
  if (arg("only-fu")) {
    await migrateRecruiterOwnedSheets(supabase);
    console.log("FU/Daily Assignment/Target Area/Necessary Things migration finished.");
    return;
  }
  await resetImportedTables(supabase);
  await migrateUsers(supabase);
  await migrateClientsAndCampaigns(supabase);
  await migrateDtcLinks(supabase);
  await migrateRecruiterOwnedSheets(supabase);
  await migrateTemplates(supabase);
  await migrateWaitList(supabase);
  await migrateLeadsLedger(supabase);
  await migrateMasterDb(supabase);
  await migrateAppointments(supabase);
  await migrateTimeAndFeedback(supabase);
  await migrateSalesNavApplicantsTasksFinance(supabase);
  console.log("Migration finished.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
