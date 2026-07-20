import { error, json, requireSession } from "@/lib/http";
import { isSuperAdmin } from "@/lib/roles";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { CONFIG } from "@/lib/config";

function roleForType(type: string) {
  const low = String(type || "").toLowerCase();
  if (low.startsWith("op")) return "operations";
  if (low.startsWith("agent")) return "agent";
  if (low === "growth") return "growth";
  if (low === "client") return "client";
  if (low === "admin") return "admin";
  return "recruiter";
}

// 3 words + 2-digit number — same style/generator as GAS's generatePassword_,
// easy for an admin to read out loud or paste into a welcome message.
function generatePassword() {
  const words = [
    "Blue", "Red", "Sun", "Oak", "Fox", "Ace", "Bolt", "Dart", "Edge", "Fern",
    "Gold", "Hawk", "Ice", "Jade", "King", "Lime", "Moon", "Nova", "Pine", "Quiz",
    "Rain", "Star", "Tide", "Volt", "Wave", "Zeal", "Arch", "Bear", "Crew", "Dawn"
  ];
  const w1 = words[Math.floor(Math.random() * words.length)];
  const w2 = words[Math.floor(Math.random() * words.length)];
  const n = String(Math.floor(Math.random() * 90) + 10);
  return `${w1}${w2}${n}`;
}

function expiresAtIso() {
  return new Date(Date.now() + CONFIG.accessDays * 86400000).toISOString().slice(0, 10);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export async function POST(req: Request) {
  try {
    const session = requireSession();
    if (!isSuperAdmin(session)) return error("Access denied", 403);
    const body = await req.json();
    const action = String(body.action || "");
    const supabase = getSupabaseAdmin() as any;

    if (action === "create") {
      const email = String(body.email || "").toLowerCase().trim();
      const name = String(body.name || "").trim() || email;
      const legacyType = String(body.type || "PH").trim();
      const referredBy = String(body.referredBy || "").toLowerCase().trim();
      if (!email) return json({ error: "Email is required" }, 400);
      const finalPassword = String(body.password || "").trim() || generatePassword();
      const today = todayIso();
      const nLimit = Number(body.nLimit || CONFIG.defaultNurtureLimit);
      const oLimit = Number(body.oLimit || CONFIG.defaultOutreachLimit);
      const pLimit = Number(body.pLimit || CONFIG.defaultProfileLimit);
      const { data: user, error: userError } = await supabase
        .from("app_users")
        .upsert({
          email,
          name,
          role: roleForType(legacyType),
          legacy_type: legacyType,
          legacy_sheet_id: String(body.sheetId || "").trim(),
          status: "approved",
          approved_at: today,
          expires_at: expiresAtIso(),
          password_hash: finalPassword,
          ...(referredBy ? { referred_by: referredBy } : {}),
          updated_at: new Date().toISOString()
        }, { onConflict: "email" })
        .select("id")
        .single();
      if (userError) return json({ error: userError.message }, 400);
      await supabase.from("recruiter_credits").upsert({
        user_id: user.id,
        nurture_limit: nLimit,
        outreach_limit: oLimit,
        profile_limit: pLimit,
        nurture_balance: nLimit,
        outreach_balance: oLimit,
        profile_balance: pLimit
      }, { onConflict: "user_id" });
      return json({ ok: true, email, generatedPassword: finalPassword });
    }

    // Approves a pending signup (distinct from "create", which both creates
    // and approves in one step) — mirrors GAS apiAdminApprove.
    if (action === "approve") {
      const email = String(body.email || "").toLowerCase().trim();
      if (!email) return json({ error: "Email is required" }, 400);
      const referredBy = String(body.referredBy || "").toLowerCase().trim();
      const nLimit = Number(body.nLimit || CONFIG.defaultNurtureLimit);
      const oLimit = Number(body.oLimit || CONFIG.defaultOutreachLimit);
      const pLimit = Number(body.pLimit || CONFIG.defaultProfileLimit);
      const { data: user, error: userError } = await supabase
        .from("app_users")
        .update({
          status: "approved",
          approved_at: todayIso(),
          expires_at: expiresAtIso(),
          legacy_type: String(body.type || "PH").trim(),
          ...(referredBy ? { referred_by: referredBy } : {}),
          updated_at: new Date().toISOString()
        })
        .eq("email", email)
        .select("id")
        .single();
      if (userError || !user) return json({ error: userError?.message || "User not found" }, 404);
      await supabase.from("recruiter_credits").upsert({
        user_id: user.id,
        nurture_limit: nLimit,
        outreach_limit: oLimit,
        profile_limit: pLimit,
        nurture_balance: nLimit,
        outreach_balance: oLimit,
        profile_balance: pLimit
      }, { onConflict: "user_id" });
      return json({ ok: true });
    }

    // Restores a removed user and refreshes the access-expiry window,
    // matching GAS apiAdminRestore.
    if (action === "restore") {
      await supabase.from("app_users").update({
        status: "approved",
        expires_at: expiresAtIso(),
        updated_at: new Date().toISOString()
      }).eq("email", String(body.email || "").toLowerCase().trim());
      return json({ ok: true });
    }

    // Removing access requires a reason, matching GAS apiAdminRemove.
    if (action === "remove") {
      const reason = String(body.reason || "").trim();
      if (!reason) return json({ error: "A reason is required to remove access." }, 400);
      await supabase.from("app_users").update({
        status: "removed",
        remove_date: todayIso(),
        remove_reason: reason,
        updated_at: new Date().toISOString()
      }).eq("email", String(body.email || "").toLowerCase().trim());
      return json({ ok: true });
    }

    // Generates a fresh random password server-side and returns it so the
    // admin can hand it to the user right away, matching GAS
    // apiAdminResetPassword (no more typing a password into a prompt).
    if (action === "resetPassword") {
      const newPassword = generatePassword();
      await supabase.from("app_users").update({
        password_hash: newPassword,
        updated_at: new Date().toISOString()
      }).eq("email", String(body.email || "").toLowerCase().trim());
      return json({ ok: true, newPassword });
    }

    // Per-type limit set (overwrite) + balance top-up (additive), matching
    // GAS apiAdminSetLimit. Any of n/o/p left undefined/blank is untouched.
    if (action === "topup") {
      const { data: user } = await supabase.from("app_users").select("id").eq("email", String(body.email || "").toLowerCase().trim()).maybeSingle();
      if (!user?.id) return json({ error: "User not found" }, 404);
      const { data: current } = await supabase.from("recruiter_credits").select("*").eq("user_id", user.id).maybeSingle();
      const patch: Record<string, unknown> = { user_id: user.id };
      const applyType = (field: "n" | "o" | "p", limitCol: string, balCol: string) => {
        const raw = body[field];
        if (raw === undefined || raw === null || String(raw).trim() === "") {
          patch[limitCol] = current?.[limitCol] ?? 0;
          patch[balCol] = current?.[balCol] ?? 0;
          return;
        }
        const value = Number(raw) || 0;
        patch[limitCol] = value;
        patch[balCol] = Number(current?.[balCol] || 0) + value;
      };
      applyType("n", "nurture_limit", "nurture_balance");
      applyType("o", "outreach_limit", "outreach_balance");
      applyType("p", "profile_limit", "profile_balance");
      await supabase.from("recruiter_credits").upsert(patch, { onConflict: "user_id" });
      return json({ ok: true });
    }

    // Buckets every user by role and reports how many have ever been
    // approved vs. currently active, matching GAS apiAdminGetStaffReport.
    if (action === "staffReport") {
      const { data: users } = await supabase.from("app_users").select("role,legacy_type,status,approved_at");
      const roleOrder = ["Recruiter", "Operation", "Growth", "Client", "Agent"];
      const stats: Record<string, { approvedBefore: number; currentActive: number }> = {};
      roleOrder.forEach((r) => { stats[r] = { approvedBefore: 0, currentActive: 0 }; });
      const bucket = (type: string) => {
        const t = String(type || "PH").toLowerCase().trim();
        if (t.startsWith("op")) return "Operation";
        if (t.startsWith("agent")) return "Agent";
        if (t === "growth") return "Growth";
        if (t === "client") return "Client";
        return "Recruiter";
      };
      (users || []).forEach((u: any) => {
        const role = bucket(u.legacy_type || u.role);
        if (u.approved_at) stats[role].approvedBefore++;
        if (String(u.status || "").toLowerCase().trim() === "approved") stats[role].currentActive++;
      });
      return json({ ok: true, roles: stats, roleOrder });
    }

    // Recent audit-log activity + total AI spend, matching GAS
    // apiAdminGetActivity (Activity sheet -> app_audit_log/ai_cost_logs).
    if (action === "activityLog") {
      const [{ data: activities }, { data: costRows }] = await Promise.all([
        supabase.from("app_audit_log").select("id,actor_email,action,details,created_at").order("created_at", { ascending: false }).limit(200),
        supabase.from("ai_cost_logs").select("cost")
      ]);
      const totalCost = (costRows || []).reduce((sum: number, row: any) => sum + Number(row.cost || 0), 0);
      return json({ ok: true, activities: activities || [], totalCost: Number(totalCost.toFixed(4)) });
    }

    return json({ error: `Unknown admin action: ${action}` }, 404);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Admin action failed";
    return error(message, message === "Unauthorized" ? 401 : 500);
  }
}
