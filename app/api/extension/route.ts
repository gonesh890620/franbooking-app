import { error, json } from "@/lib/http";
import {
  bootstrapRecruiter,
  getClients,
  getContacts,
  getDailyTasks,
  getUsage,
  loginRecruiter,
  markStatus,
  saveNurture,
  saveOutreach
} from "@/lib/legacyRecruiter";

function param(url: URL, key: string) {
  return url.searchParams.get(key) || "";
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const api = param(url, "api");
  const email = param(url, "email");
  try {
    if (api === "login") return json(await loginRecruiter(email, param(url, "password")));
    if (api === "bootstrap") return json(await bootstrapRecruiter(email));
    if (api === "usage") return json(await getUsage(email));
    if (api === "tasks") return json(await getDailyTasks(email));
    if (api === "clients") return json(await getClients(email));
    if (api === "contacts") return json(await getContacts(email, param(url, "q")));
    if (api === "saveNurture") {
      return json(await saveNurture(
        email,
        param(url, "li"),
        param(url, "reply"),
        param(url, "nType"),
        param(url, "convo"),
        param(url, "client"),
        param(url, "source")
      ));
    }
    if (api === "saveOutreach") {
      return json(await saveOutreach(email, {
        name: param(url, "name"),
        li: param(url, "li"),
        outType: param(url, "outType") || "InMail",
        content: param(url, "content"),
        subject: param(url, "subject"),
        code: param(url, "code"),
        salesNavId: param(url, "salesNavId"),
        isCany: param(url, "isCany") === "1" || param(url, "isCany") === "true"
      }));
    }
    if (api === "markNotInterested") {
      return json(await markStatus(email, param(url, "li"), "Not Interested", "No action - Non-responsive"));
    }
    if (api === "markProfileRestricted") {
      return json(await markStatus(email, param(url, "li"), "Profile Restricted", "No Action-Closed"));
    }
    return json({ error: `Unknown or not-yet-migrated extension API: ${api}` }, 404);
  } catch (e) {
    return error(e instanceof Error ? e.message : "Extension API failed", 500);
  }
}
