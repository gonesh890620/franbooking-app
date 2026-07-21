import { google, sheets_v4 } from "googleapis";
import fs from "fs";

let sheetsClient: sheets_v4.Sheets | null = null;

function parseServiceAccount() {
  const filePath = process.env.GOOGLE_SERVICE_ACCOUNT_FILE;
  if (filePath) {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (parsed.private_key) {
      parsed.private_key = String(parsed.private_key).replace(/\\n/g, "\n");
    }
    return parsed;
  }
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not configured");
  const parsed = JSON.parse(raw);
  if (parsed.private_key) {
    parsed.private_key = String(parsed.private_key).replace(/\\n/g, "\n");
  }
  return parsed;
}

export async function getSheetsClient() {
  if (sheetsClient) return sheetsClient;
  const credentials = parseServiceAccount();
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"]
  });
  sheetsClient = google.sheets({ version: "v4", auth });
  return sheetsClient;
}

export function quoteSheetName(name: string) {
  return `'${name.replace(/'/g, "''")}'`;
}

export function colName(indexZeroBased: number) {
  let n = indexZeroBased + 1;
  let name = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    name = String.fromCharCode(65 + rem) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

export async function getValues(spreadsheetId: string, range: string) {
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
    valueRenderOption: "UNFORMATTED_VALUE",
    dateTimeRenderOption: "FORMATTED_STRING"
  });
  return res.data.values || [];
}

export async function updateValues(spreadsheetId: string, range: string, values: unknown[][]) {
  const sheets = await getSheetsClient();
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: "USER_ENTERED",
    requestBody: { values }
  });
}

export async function appendValues(spreadsheetId: string, range: string, values: unknown[][]) {
  const sheets = await getSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values }
  });
}

export async function listSheetTitles(spreadsheetId: string) {
  const sheets = await getSheetsClient();
  const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties.title" });
  return (meta.data.sheets || [])
    .map((s) => s.properties?.title || "")
    .filter(Boolean);
}

export async function findSheetTitle(spreadsheetId: string, candidates: string[]) {
  const titles = await listSheetTitles(spreadsheetId);
  for (const candidate of candidates) {
    const found = titles.find((title) => title.toLowerCase() === candidate.toLowerCase());
    if (found) return found;
  }
  return titles[0] || candidates[0];
}

export async function findSheetTitleExact(spreadsheetId: string, candidates: string[]): Promise<string | null> {
  const titles = await listSheetTitles(spreadsheetId);
  for (const candidate of candidates) {
    const found = titles.find((title) => title.toLowerCase() === candidate.toLowerCase());
    if (found) return found;
  }
  return null;
}

export async function getSheetIdByTitle(spreadsheetId: string, title: string) {
  const sheets = await getSheetsClient();
  const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties" });
  const found = (meta.data.sheets || []).find((s) => s.properties?.title === title);
  return found?.properties?.sheetId;
}

// rowNumber is 1-based (matching the Sheets UI / A1 notation row numbers).
export async function deleteSheetRow(spreadsheetId: string, title: string, rowNumber: number) {
  const sheetId = await getSheetIdByTitle(spreadsheetId, title);
  if (typeof sheetId !== "number") throw new Error(`Sheet tab not found: ${title}`);
  const sheets = await getSheetsClient();
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{
        deleteDimension: {
          range: { sheetId, dimension: "ROWS", startIndex: rowNumber - 1, endIndex: rowNumber }
        }
      }]
    }
  });
}
