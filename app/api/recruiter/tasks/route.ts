import { error, json, requireSession } from "@/lib/http";
import { getDailyTasks } from "@/lib/legacyRecruiter";

export async function GET() {
  try {
    const session = requireSession();
    return json(await getDailyTasks(session.email));
  } catch (e) {
    return error(e instanceof Error ? e.message : "Could not load tasks", 500);
  }
}
