import { error, json } from "@/lib/http";
import { getSession, setSession } from "@/lib/auth";

export async function POST() {
  const session = getSession();
  if (!session || !session.impersonatorEmail) return error("Not impersonating", 400);
  setSession({ email: session.impersonatorEmail, name: session.impersonatorName || session.impersonatorEmail, type: "growth" });
  return json({ ok: true, page: "/growth" });
}
