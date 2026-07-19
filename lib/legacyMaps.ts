export const RC = {
  EMAIL: 0,
  NAME: 1,
  STATUS: 2,
  REGISTERED: 3,
  APPROVED: 4,
  EXPIRES: 5,
  SHEET_ID: 6,
  N_LIMIT: 7,
  O_LIMIT: 8,
  N_BAL: 9,
  O_BAL: 10,
  LAST_UPD: 11,
  TYPE: 12,
  PASSWORD: 13,
  P_LIMIT: 14,
  P_BAL: 15,
  USED_TODAY: 16,
  USED_ALLTIME: 17,
  REFERRED_BY: 18,
  WISE_ACCOUNT: 19
} as const;

export const FU = {
  DATE: 0,
  NAME: 1,
  LI: 2,
  CLIENT: 3,
  CALENDAR: 4,
  STATUS: 5,
  NEXT_ACTION: 6,
  CONVO: 7,
  REPLY: 8,
  DATE_J: 9,
  DATE_K: 10,
  DATE_L: 11,
  DATE_M: 12,
  SOURCE: 13,
  SALES_NAV: 14,
  CODE: 15,
  TAG: 16,
  CANY: 17
} as const;

export type SheetRow = Array<string | number | boolean | null>;

export function cleanClientName(name: string): string {
  return String(name || "")
    .replace(/\s*\([^)]*\)\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeLi(li: string): string {
  return String(li || "").trim().toLowerCase().replace(/\/+$/g, "");
}

export function normalizeDateCell(raw: unknown): string {
  if (!raw) return "";
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return raw.toISOString().slice(0, 10);
  }
  const date = new Date(String(raw));
  if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);
  const str = String(raw).trim();
  return /^\d{4}-\d{2}-\d{2}/.test(str) ? str.slice(0, 10) : "";
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
