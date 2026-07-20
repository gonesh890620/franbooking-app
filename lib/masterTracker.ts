import { CONFIG } from "./config";
import { colName, findSheetTitle, getValues, quoteSheetName, updateValues } from "./sheets";

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
