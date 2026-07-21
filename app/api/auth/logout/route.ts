import { json } from "@/lib/http";
import { getSession } from "@/lib/auth";
import { logoutRecruiter } from "@/lib/legacyRecruiter";

export async function POST() {
  // Pass the email so the recruiter's memoized Sheets reads are dropped on
  // the way out (see lib/ttlCache.ts) — otherwise a fast re-login could be
  // served from a warm entry belonging to the previous session.
  const session = getSession();
  logoutRecruiter(session?.email || "");
  return json({ ok: true });
}
