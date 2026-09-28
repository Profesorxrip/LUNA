import { SupabaseClient } from "@supabase/supabase-js";

export async function submitReport(
  db: SupabaseClient,
  targetUserId: string | null,
  targetMessageId: string | null,
  reason: string
): Promise<boolean> {
  const { error } = await db.rpc("submit_report", {
    target_user: targetUserId,
    target_message_id: targetMessageId,
    reason,
  });
  return !error;
}
