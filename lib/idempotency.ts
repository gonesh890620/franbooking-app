import { getSupabaseAdmin } from "./supabaseAdmin";

export async function withIdempotency<T>(
  key: string | null,
  actorEmail: string,
  action: string,
  run: () => Promise<T>
): Promise<T> {
  if (!key) return run();
  const supabase = getSupabaseAdmin();
  const existing = await supabase
    .from("idempotency_keys")
    .select("response")
    .eq("key", key)
    .maybeSingle();
  const existingData = existing.data as { response?: T } | null;
  if (existingData?.response) return existingData.response;

  const response = await run();
  await supabase.from("idempotency_keys").insert({
    key,
    actor_email: actorEmail,
    action,
    response
  });
  return response;
}

export async function enqueueSheetSync(jobType: string, payload: Record<string, unknown>) {
  const supabase = getSupabaseAdmin();
  await supabase.from("sheet_sync_jobs").insert({
    job_type: jobType,
    payload
  });
}
