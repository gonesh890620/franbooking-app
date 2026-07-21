import { CONFIG } from "./config";
import { appendValues, colName, findSheetTitle, getValues, quoteSheetName, updateValues } from "./sheets";

// Column maps mirror GAS's VP/VI/VN/VO/VC constants exactly (Code.gs) so the
// dual-written Sheet rows land in the same columns the old system used.
const VP_COL = { ID: 0, NAME: 1, VENDOR: 2, REGISTERED: 3, EXPIRE: 4, SN_CONNECTED: 5, SN_EXPIRE: 6, STATUS: 7, REPLACEMENT_OF: 8, REPLACED_BY: 9, REPLACEMENT_DATE: 10, NOTES: 11, MANAGED_BY: 12, LI_URL: 13, PRICE: 14, LAST_RENEWED: 15 };
const VI_COL = { ID: 0, PROFILE_ID: 1, REPORTED_DATE: 2, ISSUE_TYPE: 3, ISSUE_NOTES: 4, VENDOR_FEEDBACK_DATE: 5, VENDOR_FEEDBACK: 6, FIXED_DATE: 7, SOLVED: 8, FIXED_BY_REPLACEMENT: 9, REPLACEMENT_PROFILE_ID: 10, VENDOR_ETA: 11, VENDOR: 12, FOLLOWUP_COUNT: 13, LAST_FOLLOWUP_AT: 14 };
const VN_COL = { ID: 0, NAME: 1, CONTACT_PERSON: 2, EMAIL: 3, SLACK: 4, CHANNEL: 5, NOTES: 6 };
const VO_COL = { ID: 0, VENDOR: 1, REQUESTED_BY: 2, ORDER_DATE: 3, RECEIVED_DATE: 4, STATUS: 5, PRICE: 6, NOTES: 7, PROFILE_NAME: 8, PROFILE_URL: 9, CONNECTIONS: 10, LOCATION: 11 };
const VC_COL = { ID: 0, VENDOR: 1, DATE: 2, CHANNEL: 3, NOTE: 4 };
const CONFIG_TABS = { profiles: "Profiles", issues: "Issues", vendors: "Vendors", orders: "Orders", communications: "Communications" };

async function findRowByCode(tab: string, code: string | number) {
  const title = await findSheetTitle(CONFIG.vendorSheetId, [tab]);
  const rows = await getValues(CONFIG.vendorSheetId, `${quoteSheetName(title)}!A2:A`);
  const idx = rows.findIndex((row) => String(row[0] || "").trim() === String(code));
  if (idx < 0) return null;
  return { spreadsheetId: CONFIG.vendorSheetId, title, rowNumber: idx + 2 };
}

async function updateCells(tab: string, code: string | number, colMap: Record<string, number>, patch: Record<string, unknown>) {
  const found = await findRowByCode(tab, code);
  if (!found) return;
  for (const key of Object.keys(patch)) {
    const col = colMap[key];
    if (col === undefined) continue;
    await updateValues(found.spreadsheetId, `${quoteSheetName(found.title)}!${colName(col)}${found.rowNumber}`, [[patch[key] ?? ""]]);
  }
}

export async function appendVendorProfileToSheet(row: any) {
  const title = await findSheetTitle(CONFIG.vendorSheetId, [CONFIG_TABS.profiles]);
  await appendValues(CONFIG.vendorSheetId, `${quoteSheetName(title)}!A:P`, [[
    row.code, row.name, row.vendor_name, row.registered_date || "", "", row.sn_connected_date || "", "",
    row.status || "Active", row.replacement_of || "", "", "", row.notes || "", row.managed_by || "",
    row.li_profile_url || "", row.price || "", ""
  ]]);
}

export async function updateVendorProfileInSheet(code: string, patch: Record<string, unknown>) {
  const sheetPatch: Record<string, unknown> = {};
  const map: Record<string, keyof typeof VP_COL> = {
    name: "NAME", vendor_name: "VENDOR", registered_date: "REGISTERED", sn_connected_date: "SN_CONNECTED",
    status: "STATUS", replaced_by: "REPLACED_BY", replacement_date: "REPLACEMENT_DATE", notes: "NOTES",
    managed_by: "MANAGED_BY", li_profile_url: "LI_URL", price: "PRICE", last_renewed_date: "LAST_RENEWED"
  };
  Object.keys(patch).forEach((k) => { if (map[k]) sheetPatch[k] = patch[k]; });
  await updateCells(CONFIG_TABS.profiles, code, remapColMap(VP_COL, map), sheetPatch);
}

export async function appendVendorIssueToSheet(row: any) {
  const title = await findSheetTitle(CONFIG.vendorSheetId, [CONFIG_TABS.issues]);
  await appendValues(CONFIG.vendorSheetId, `${quoteSheetName(title)}!A:O`, [[
    row.code, row.profile_code || "", row.reported_date, row.issue_type, row.issue_notes || "",
    "", "", "", row.solved || "No", "", "", "", row.vendor_name || "", row.followup_count || 0, ""
  ]]);
}

export async function updateVendorIssueInSheet(code: number, patch: Record<string, unknown>) {
  const sheetPatch: Record<string, unknown> = {};
  const map: Record<string, keyof typeof VI_COL> = {
    issue_type: "ISSUE_TYPE", issue_notes: "ISSUE_NOTES", vendor_feedback_date: "VENDOR_FEEDBACK_DATE",
    vendor_feedback: "VENDOR_FEEDBACK", fixed_date: "FIXED_DATE", solved: "SOLVED", vendor_eta: "VENDOR_ETA",
    fixed_by_replacement: "FIXED_BY_REPLACEMENT", replacement_profile_code: "REPLACEMENT_PROFILE_ID",
    followup_count: "FOLLOWUP_COUNT", last_followup_at: "LAST_FOLLOWUP_AT"
  };
  Object.keys(patch).forEach((k) => { if (map[k]) sheetPatch[k] = patch[k]; });
  await updateCells(CONFIG_TABS.issues, code, remapColMap(VI_COL, map), sheetPatch);
}

export async function appendVendorToSheet(row: any) {
  const title = await findSheetTitle(CONFIG.vendorSheetId, [CONFIG_TABS.vendors]);
  await appendValues(CONFIG.vendorSheetId, `${quoteSheetName(title)}!A:G`, [[
    row.code, row.name, row.contact_person || "", row.email || "", row.slack || "", row.channel || "", row.notes || ""
  ]]);
}

export async function updateVendorInSheet(code: string, patch: Record<string, unknown>) {
  const sheetPatch: Record<string, unknown> = {};
  const map: Record<string, keyof typeof VN_COL> = { name: "NAME", contact_person: "CONTACT_PERSON", email: "EMAIL", slack: "SLACK", channel: "CHANNEL", notes: "NOTES" };
  Object.keys(patch).forEach((k) => { if (map[k]) sheetPatch[k] = patch[k]; });
  await updateCells(CONFIG_TABS.vendors, code, remapColMap(VN_COL, map), sheetPatch);
}

export async function appendVendorOrderToSheet(row: any) {
  const title = await findSheetTitle(CONFIG.vendorSheetId, [CONFIG_TABS.orders]);
  await appendValues(CONFIG.vendorSheetId, `${quoteSheetName(title)}!A:L`, [[
    row.code, row.vendor_name, row.requested_by || "", row.order_date, "", row.status || "Ordered",
    row.price || "", row.notes || "", row.profile_name || "", row.profile_url || "", row.connections || "", row.location || ""
  ]]);
}

export async function updateVendorOrderInSheet(code: string, patch: Record<string, unknown>) {
  const sheetPatch: Record<string, unknown> = {};
  const map: Record<string, keyof typeof VO_COL> = {
    status: "STATUS", received_date: "RECEIVED_DATE", price: "PRICE", notes: "NOTES",
    profile_name: "PROFILE_NAME", profile_url: "PROFILE_URL", connections: "CONNECTIONS", location: "LOCATION"
  };
  Object.keys(patch).forEach((k) => { if (map[k]) sheetPatch[k] = patch[k]; });
  await updateCells(CONFIG_TABS.orders, code, remapColMap(VO_COL, map), sheetPatch);
}

export async function appendVendorCommunicationToSheet(row: any) {
  const title = await findSheetTitle(CONFIG.vendorSheetId, [CONFIG_TABS.communications]);
  await appendValues(CONFIG.vendorSheetId, `${quoteSheetName(title)}!A:E`, [[row.code, row.vendor_name, row.comm_date, row.channel || "", row.note]]);
}

function remapColMap<T extends Record<string, number>>(cols: T, keyMap: Record<string, keyof T>): Record<string, number> {
  const out: Record<string, number> = {};
  Object.keys(keyMap).forEach((supabaseKey) => { out[supabaseKey] = cols[keyMap[supabaseKey]]; });
  return out;
}
