import { error, json } from "@/lib/http";
import { loginRecruiter } from "@/lib/legacyRecruiter";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const result = await loginRecruiter(String(body.email || ""), String(body.password || ""));
    return json(result, result.ok ? 200 : 401);
  } catch (e) {
    return error(e instanceof Error ? e.message : "Login failed", 500);
  }
}
