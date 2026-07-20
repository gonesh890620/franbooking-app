import { error, json, requireSession } from "@/lib/http";
import { isAdminUser } from "@/lib/roles";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

function roleForType(type: string) {
  const low = String(type || "").toLowerCase();
  if (low.startsWith("op")) return "operations";
  if (low.startsWith("agent")) return "agent";
  if (low === "growth") return "growth";
  if (low === "client") return "client";
  if (low === "admin") return "admin";
  return "recruiter";
}

export async function POST(req: Request) {
  try {
    const session = requireSession();
    if (!isAdminUser(session)) return error("Access denied", 403);
    const body = await req.json();
    const action = String(body.action || "");
    const supabase = getSupabaseAdmin() as any;

    if (action === "create") {
      const email = String(body.email || "").toLowerCase().trim();
      const name = String(body.name || "").trim() || email;
      const legacyType = String(body.type || "PH").trim();
      if (!email) return json({ error: "Email is required" }, 400);
      if (!String(body.password || "").trim()) return json({ error: "Password is required" }, 400);
      const { data: user, error: userError } = await supabase
        .from("app_users")
        .upsert({
          email,
          name,
          role: roleForType(legacyType),
          legacy_type: legacyType,
          legacy_sheet_id: String(body.sheetId || "").trim(),
          status: String(body.status || "approved"),
          password_hash: String(body.password || "").trim(),
          updated_at: new Date().toISOString()
        }, { onConflict: "email" })
        .select("id")
        .single();
      if (userError) return json({ error: userError.message }, 400);
      await supabase.from("recruiter_credits").upsert({
        user_id: user.id,
        nurture_limit: Number(body.nLimit || 0),
        outreach_limit: Number(body.oLimit || 0),
        profile_limit: Number(body.pLimit || 0),
        nurture_balance: Number(body.nLimit || 0),
        outreach_balance: Number(body.oLimit || 0),
        profile_balance: Number(body.pLimit || 0)
      }, { onConflict: "user_id" });
      return json({ ok: true });
    }

    if (action === "status") {
      await supabase.from("app_users").update({
        status: String(body.status || "approved"),
        updated_at: new Date().toISOString()
      }).eq("email", String(body.email || "").toLowerCase().trim());
      return json({ ok: true });
    }

    if (action === "resetPassword") {
      await supabase.from("app_users").update({
        password_hash: String(body.password || "").trim(),
        updated_at: new Date().toISOString()
      }).eq("email", String(body.email || "").toLowerCase().trim());
      return json({ ok: true });
    }

    if (action === "topup") {
      const { data: user } = await supabase.from("app_users").select("id").eq("email", String(body.email || "").toLowerCase().trim()).maybeSingle();
      if (!user?.id) return json({ error: "User not found" }, 404);
      const { data: current } = await supabase.from("recruiter_credits").select("*").eq("user_id", user.id).maybeSingle();
      await supabase.from("recruiter_credits").upsert({
        user_id: user.id,
        nurture_balance: Number(current?.nurture_balance || 0) + Number(body.n || 0),
        outreach_balance: Number(current?.outreach_balance || 0) + Number(body.o || 0),
        profile_balance: Number(current?.profile_balance || 0) + Number(body.p || 0),
        nurture_limit: Math.max(Number(current?.nurture_limit || 0), Number(body.nLimit || 0)),
        outreach_limit: Math.max(Number(current?.outreach_limit || 0), Number(body.oLimit || 0)),
        profile_limit: Math.max(Number(current?.profile_limit || 0), Number(body.pLimit || 0))
      }, { onConflict: "user_id" });
      return json({ ok: true });
    }

    return json({ error: `Unknown admin action: ${action}` }, 404);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Admin action failed";
    return error(message, message === "Unauthorized" ? 401 : 500);
  }
}
