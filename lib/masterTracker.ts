import { CONFIG } from "./config";
import { appendValues, colName, deleteSheetRow, findSheetTitle, getValues, quoteSheetName, updateValues } from "./sheets";

const MASTER_TRACKER_TAB_CANDIDATES = ["Master Tracker", "master tracker"];

export const MASTER_TRACKER_COL = {
  CLIENT_CAMPAIGN: 0,
  CAMPAIGN_ID: 1,
  QUOTA: 2,
  RESULTS_TOTAL: 3,
  RESULTS_REMAINING: 4,
  QUOTA_COMPLETE_PCT: 5,
  LEADS_LAST7: 6,
  TARGET_AVG_LEADS_DAY: 7,
  CAMPAIGN_STATUS: 8,
  PAUSED_REASON: 9,
  ACTION_TAKEN: 10,
  CYCLE: 11,
  CHARGE_AMT: 12,
  PAYMENT: 13,
  CURRENT_STATUS: 14,
  CURRENT_CYCLE_START: 15,
  PAYMENT_NOTES: 16,
  QUOTA_NOTES: 17,
  ACCOUNT_ID: 18,
  ACCOUNT_NAME: 19,
  VERTICAL: 20,
  PACKAGE_TYPE: 21,
  LAUNCH_DATE: 22
} as const;

async function getMasterTrackerSheet() {
  const title = await findSheetTitle(CONFIG.campaignSheetId, MASTER_TRACKER_TAB_CANDIDATES);
  return { spreadsheetId: CONFIG.campaignSheetId, title };
}

async function findMasterTrackerRow(clientName: string) {
  const clean = String(clientName || "").trim();
  if (!clean) return null;
  const sheet = await getMasterTrackerSheet();
  const rows = await getValues(sheet.spreadsheetId, `${quoteSheetName(sheet.title)}!A2:A`);
  const idx = rows.findIndex((row) => String(row[0] || "").trim().toLowerCase() === clean.toLowerCase());
  if (idx < 0) return null;
  return { ...sheet, rowNumber: idx + 2 };
}

// Mirrors GAS apiCeoUpdateClient's Current Status + Paused Reason write
// (Col O / Col J) — the "Active/Paused" operational status, not the
// last-7-days Campaign Status indicator in Col I, which is not hand-editable.
export async function updateMasterTrackerClientStatus(clientName: string, currentStatus: string, pausedReason = "") {
  const found = await findMasterTrackerRow(clientName);
  if (!found) return { ok: false, reason: "Client not found in Master Tracker" };
  const reasonCol = colName(MASTER_TRACKER_COL.PAUSED_REASON);
  const statusCol = colName(MASTER_TRACKER_COL.CURRENT_STATUS);
  await updateValues(found.spreadsheetId, `${quoteSheetName(found.title)}!${reasonCol}${found.rowNumber}`, [[pausedReason]]);
  await updateValues(found.spreadsheetId, `${quoteSheetName(found.title)}!${statusCol}${found.rowNumber}`, [[currentStatus]]);
  return { ok: true };
}

// Mirrors GAS buildPausedReasonValue_ — the "| ETA <value>" suffix is parsed
// back out client-side (regex) to decide when to show the Vacation-check
// badge, so this format must stay in sync with that regex.
export function buildPausedReasonValue(reason: string, vacationEta: string) {
  const dateStamp = new Date().toISOString().slice(0, 10);
  if (reason === "PAUSED Vacation") {
    return `${dateStamp}: ${reason} | ETA ${String(vacationEta || "").trim() || "TBD"}`;
  }
  return `${dateStamp}: ${reason}`;
}

// Mirrors GAS apiCeoAddClient's Master Tracker append (row shape A–W).
export async function appendMasterTrackerRow(fields: {
  fullName: string; campaignId: number; quota: number; targetAvgLeadsDay: number | ""; cycle: number;
  chargeAmt: string | number; payment: string; currentStatus: string; currentCycleStart: string;
  pausedReason: string; actionTaken: string; paymentNotes: string; quotaNotes: string;
  accountId: number; accountName: string; vertical: string; packageType: string; launchDate: string;
}) {
  const sheet = await getMasterTrackerSheet();
  const row = [
    fields.fullName, fields.campaignId, fields.quota, 0, fields.quota, 0, 0,
    fields.targetAvgLeadsDay, "", fields.pausedReason, fields.actionTaken, fields.cycle,
    fields.chargeAmt, fields.payment, fields.currentStatus, fields.currentCycleStart,
    fields.paymentNotes, fields.quotaNotes, fields.accountId, fields.accountName,
    fields.vertical, fields.packageType, fields.launchDate
  ];
  await appendValues(sheet.spreadsheetId, `${quoteSheetName(sheet.title)}!A:W`, [row]);
}

// Mirrors GAS apiCeoUpdateClient's setIfProvided pattern — only touches
// fields actually present in `updates`.
export async function updateMasterTrackerFields(clientName: string, updates: Partial<Record<keyof typeof MASTER_TRACKER_COL, string | number>>) {
  const found = await findMasterTrackerRow(clientName);
  if (!found) return { ok: false, reason: "Client not found in Master Tracker" };
  for (const key of Object.keys(updates) as Array<keyof typeof MASTER_TRACKER_COL>) {
    const col = colName(MASTER_TRACKER_COL[key]);
    await updateValues(found.spreadsheetId, `${quoteSheetName(found.title)}!${col}${found.rowNumber}`, [[updates[key]]]);
  }
  return { ok: true };
}

// Mirrors GAS apiCeoLogSlotCheck / apiCeoLogVacationCheck — prepends a
// timestamped line to the existing Action Taken text (never overwrites),
// and optionally reactivates the client (clears Paused Reason, sets Active).
export async function appendMasterTrackerActionTaken(clientName: string, line: string, reactivate: boolean) {
  const found = await findMasterTrackerRow(clientName);
  if (!found) return { ok: false, reason: "Client not found in Master Tracker" };
  const actionCol = colName(MASTER_TRACKER_COL.ACTION_TAKEN);
  const existingRows = await getValues(found.spreadsheetId, `${quoteSheetName(found.title)}!${actionCol}${found.rowNumber}`);
  const existing = String(existingRows[0]?.[0] || "").trim();
  const updated = existing ? `${line}\n${existing}` : line;
  await updateValues(found.spreadsheetId, `${quoteSheetName(found.title)}!${actionCol}${found.rowNumber}`, [[updated]]);
  if (reactivate) {
    const statusCol = colName(MASTER_TRACKER_COL.CURRENT_STATUS);
    const reasonCol = colName(MASTER_TRACKER_COL.PAUSED_REASON);
    await updateValues(found.spreadsheetId, `${quoteSheetName(found.title)}!${statusCol}${found.rowNumber}`, [["Active"]]);
    await updateValues(found.spreadsheetId, `${quoteSheetName(found.title)}!${reasonCol}${found.rowNumber}`, [[""]]);
  }
  return { ok: true };
}

// Mirrors GAS apiCeoArchiveClient's Master Tracker side: the row is removed
// entirely (Supabase side keeps the full archived record — see
// lib/clientTracker.ts — so nothing is lost, this just stops it showing in
// the live Sheet Master Tracker view other legacy tooling may still open).
export async function deleteMasterTrackerRow(clientName: string) {
  const found = await findMasterTrackerRow(clientName);
  if (!found) return { ok: false, reason: "Client not found in Master Tracker" };
  await deleteSheetRow(found.spreadsheetId, found.title, found.rowNumber);
  return { ok: true };
}
