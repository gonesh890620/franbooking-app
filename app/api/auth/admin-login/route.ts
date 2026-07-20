import { error, json } from "@/lib/http";
import { CONFIG } from "@/lib/config";
import { setSession } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const username = String(body.username || "").trim();
    const password = String(body.password || "").trim();
    if (username !== CONFIG.adminUsername || password !== CONFIG.adminPassword) {
      return error("Invalid credentials", 401);
    }
    setSession({ email: CONFIG.adminUsername.toLowerCase(), name: "Admin", type: "superadmin" });
    return json({ ok: true, page: "/admin" });
  } catch (e) {
    return error(e instanceof Error ? e.message : "Admin login failed", 500);
  }
}
