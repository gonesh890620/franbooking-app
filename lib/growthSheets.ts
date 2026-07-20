import { CONFIG } from "./config";
import { appendValues, findSheetTitle, getValues, quoteSheetName, updateValues } from "./sheets";

// Growth panel actions dual-write: Supabase first (fast read path), then the
// corresponding Google Sheet tab, matching GAS's own source-of-record tabs.

export async function appendCostToSheet(date: string, amount: number, description: string, notes: string, useMethod: string, comments: string) {
  const title = await findSheetTitle(CONFIG.costSheetId, ["Purchase"]);
  await appendValues(CONFIG.costSheetId, `${quoteSheetName(title)}!A:F`, [[date, amount, description, notes, useMethod, comments]]);
}

export async function appendClientPaymentToSheet(dateIssue: string, datePaid: string, clientName: string, invoiceRef: string, cycle: number, totalBilled: number, status: string, chargedBy: string) {
  const title = await findSheetTitle(CONFIG.campaignSheetId, ["Client Payment"]);
  await appendValues(CONFIG.campaignSheetId, `${quoteSheetName(title)}!A:H`, [[dateIssue, datePaid, clientName, invoiceRef, cycle, totalBilled, status, chargedBy]]);
}

export async function appendTaskToSheet(legacyId: string, title: string, description: string, topic: string, priority: string, eta: string, status: string, createdDate: string, assignedEmail: string, assignedName: string) {
  const sheetTitle = await findSheetTitle(CONFIG.dailyTaskSheetId, ["Tasks"]);
  await appendValues(CONFIG.dailyTaskSheetId, `${quoteSheetName(sheetTitle)}!A:L`, [[legacyId, title, description, topic, priority, eta, status, createdDate, "", "Web App", assignedEmail, assignedName]]);
}

async function findTaskRow(legacyId: string) {
  if (!legacyId) return null;
  const sheetTitle = await findSheetTitle(CONFIG.dailyTaskSheetId, ["Tasks"]);
  const rows = await getValues(CONFIG.dailyTaskSheetId, `${quoteSheetName(sheetTitle)}!A2:L`);
  const idx = rows.findIndex((row) => String(row[0] || "") === legacyId);
  if (idx < 0) return null;
  return { spreadsheetId: CONFIG.dailyTaskSheetId, title: sheetTitle, rowNumber: idx + 2 };
}

export async function updateTaskStatusInSheet(legacyId: string, status: string) {
  const found = await findTaskRow(legacyId);
  if (!found) return;
  await updateValues(found.spreadsheetId, `${quoteSheetName(found.title)}!G${found.rowNumber}`, [[status]]);
}

export async function reassignTaskInSheet(legacyId: string, assignedEmail: string, assignedName: string) {
  const found = await findTaskRow(legacyId);
  if (!found) return;
  await updateValues(found.spreadsheetId, `${quoteSheetName(found.title)}!K${found.rowNumber}:L${found.rowNumber}`, [[assignedEmail, assignedName]]);
}
