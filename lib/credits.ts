import { getSupabaseAdmin } from "./supabaseAdmin";

const BAL_COL: Record<string, string> = {
  nurture: "nurture_balance",
  outreach: "outreach_balance",
  profile: "profile_balance"
};

async function findUserId(email: string) {
  const { data } = await (getSupabaseAdmin() as any)
    .from("app_users")
    .select("id")
    .eq("email", String(email || "").toLowerCase().trim())
    .maybeSingle();
  return data?.id || null;
}

// Mirrors GAS checkAndDecrementCredit_ — returns false (no decrement) when
// the balance is already at/below zero.
export async function checkAndDecrementCredit(email: string, type: "nurture" | "outreach" | "profile") {
  const userId = await findUserId(email);
  if (!userId) return false;
  const col = BAL_COL[type];
  const supabase = getSupabaseAdmin() as any;
  const { data: current } = await supabase.from("recruiter_credits").select(col).eq("user_id", userId).maybeSingle();
  const bal = Number(current?.[col] || 0);
  if (bal <= 0) return false;
  await supabase.from("recruiter_credits").update({ [col]: bal - 1 }).eq("user_id", userId);
  return true;
}

// Refunds one credit — used when an AI call fails after the credit was
// already decremented, matching GAS's refund-on-error behavior.
export async function refundCredit(email: string, type: "nurture" | "outreach" | "profile") {
  const userId = await findUserId(email);
  if (!userId) return;
  const col = BAL_COL[type];
  const supabase = getSupabaseAdmin() as any;
  const { data: current } = await supabase.from("recruiter_credits").select(col).eq("user_id", userId).maybeSingle();
  const bal = Number(current?.[col] || 0);
  await supabase.from("recruiter_credits").update({ [col]: bal + 1 }).eq("user_id", userId);
}
