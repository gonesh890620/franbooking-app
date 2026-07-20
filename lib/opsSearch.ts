import { CONFIG } from "./config";
import { findSheetTitle, findSheetTitleExact, getValues, quoteSheetName } from "./sheets";
import { cleanClientName, FU } from "./legacyMaps";
import { getSupabaseAdmin } from "./supabaseAdmin";

export type ContactSearchResult = {
  name: string;
  li: string;
  recruiter: string;
  recruiterEmail: string;
  status?: string;
  client?: string;
  type?: string;
  date?: string;
  source: string;
};

// Merged contact search across the shared Master DB sends log and every
// approved recruiter's own FU Tracker sheet — mirrors GAS apiSearchContacts.
// FU Tracker stays Sheets-only per the data architecture, so this reaches
// into each recruiter's sheet directly rather than a Supabase mirror.
export async function searchContacts(query: string): Promise<ContactSearchResult[]> {
  const q = String(query || "").trim().toLowerCase();
  if (q.length < 2) return [];
  const results: ContactSearchResult[] = [];
  const seen = new Set<string>();
  const addResult = (r: ContactSearchResult) => {
    const key = `${r.li}|${r.recruiter}`;
    if (seen.has(key)) return;
    seen.add(key);
    results.push(r);
  };

  try {
    const outreachTitle = await findSheetTitleExact(CONFIG.masterDbId, ["LI Outreach", "Outreach"]);
    if (outreachTitle) {
      const rows = await getValues(CONFIG.masterDbId, `${quoteSheetName(outreachTitle)}!A2:H`);
      for (const row of rows) {
        const name = String(row[3] || "").trim();
        const li = String(row[4] || "").trim();
        if (name.toLowerCase().includes(q) || li.toLowerCase().includes(q)) {
          addResult({
            name,
            li,
            recruiter: String(row[1] || "").trim(),
            recruiterEmail: String(row[2] || "").trim(),
            type: String(row[5] || "").trim(),
            date: String(row[0] || "").slice(0, 10),
            source: "Outreach DB"
          });
        }
      }
    }
  } catch {
    // Best-effort — a broken Master DB tab shouldn't block the FU Tracker search below.
  }

  try {
    const { data: recruiters } = await (getSupabaseAdmin() as any)
      .from("app_users")
      .select("name,email,legacy_sheet_id")
      .eq("status", "approved")
      .not("legacy_sheet_id", "is", null)
      .limit(60);
    for (const rec of recruiters || []) {
      if (results.length >= 40) break;
      const sheetId = String(rec.legacy_sheet_id || "").trim();
      if (!sheetId) continue;
      try {
        const title = await findSheetTitle(sheetId, ["FU Tracker", "FU tracker", "Tracker", "Sheet1"]);
        const rows = await getValues(sheetId, `${quoteSheetName(title)}!A2:R`);
        for (const row of rows) {
          const name = String(row[FU.NAME] || "").trim();
          const li = String(row[FU.LI] || "").trim();
          if (!name.toLowerCase().includes(q) && !li.toLowerCase().includes(q)) continue;
          addResult({
            name,
            li,
            recruiter: String(rec.name || "").trim(),
            recruiterEmail: String(rec.email || "").trim(),
            status: String(row[FU.REPLY] || row[FU.STATUS] || "").trim(),
            client: cleanClientName(String(row[FU.CLIENT] || "")),
            source: "FU Tracker"
          });
          if (results.length >= 40) break;
        }
      } catch {
        // A single recruiter's sheet being unreachable shouldn't fail the whole search.
      }
    }
  } catch {
    // Best-effort.
  }

  return results.slice(0, 40);
}
