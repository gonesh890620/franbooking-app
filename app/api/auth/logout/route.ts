import { json } from "@/lib/http";
import { logoutRecruiter } from "@/lib/legacyRecruiter";

export async function POST() {
  logoutRecruiter();
  return json({ ok: true });
}
