import { getSupabaseAdmin } from "../lib/supabaseAdmin";
import { LEGACY_SOURCES } from "../lib/legacyManifest";
import { getValues, quoteSheetName } from "../lib/sheets";

async function main() {
  const supabase = getSupabaseAdmin() as any;
  for (const source of LEGACY_SOURCES) {
    const spreadsheetId = process.env[source.env];
    if (!spreadsheetId) {
      console.log(`skip ${source.key}: missing ${source.env}`);
      continue;
    }
    console.log(`reading ${source.key} (${source.tab})`);
    const rows = await getValues(spreadsheetId, `${quoteSheetName(source.tab)}!A:Z`);
    await supabase.from("legacy_sources").upsert({
      source_key: source.key,
      spreadsheet_id: spreadsheetId,
      tab_name: source.tab,
      description: source.description,
      last_synced_at: new Date().toISOString()
    }, { onConflict: "source_key" });
    console.log(`${source.key}: ${Math.max(rows.length - 1, 0)} data rows available for ${source.target}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
