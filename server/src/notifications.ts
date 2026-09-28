import { SupabaseClient } from "@supabase/supabase-js";

export type PushPlatform = "ios" | "android" | "web";

export async function registerPushToken(db: SupabaseClient, userId: string, token: string, platform: PushPlatform): Promise<void> {
  await db.from("push_tokens").upsert({ user_id: userId, token, platform }, { onConflict: "user_id,token" });
}

export async function unregisterPushToken(db: SupabaseClient, token: string): Promise<void> {
  await db.from("push_tokens").delete().eq("token", token);
}

/** Hedef kullanicinin push token'larini getirir - sadece cagiran ile
 * gercek bir iliskisi varsa (bkz. migration'daki get_push_tokens_for_user). */
async function tokensFor(db: SupabaseClient, targetUserId: string): Promise<string[]> {
  const { data, error } = await db.rpc("get_push_tokens_for_user", { target: targetUserId });
  if (error || !data) return [];
  return data as string[];
}

/** Expo Push API'sine bildirim gonderir - roadmap AŞAMA 9. Bu sandbox'ta
 * exp.host'a agin acilamamasi nedeniyle canli test edilemedi (ayni
 * Supabase kisitlamasi); kod yolu dogru ama teslimat gercek bir ortamda
 * dogrulanmali. Hata durumunda sessizce basarisiz olur - bildirim
 * gonderilememesi hicbir zaman ana ozelligi (DM/arkadaslik) bozmamali. */
async function sendExpoPush(tokens: string[], title: string, body: string, data?: Record<string, unknown>): Promise<void> {
  if (tokens.length === 0) return;
  try {
    await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(tokens.map((to) => ({ to, title, body, data }))),
    });
  } catch (err) {
    console.warn("Push bildirimi gonderilemedi (agirlikli olarak yoksayildi):", (err as Error).message);
  }
}

/** Sadece ALICI o an cevrimdisiyse (aktif socket'i yoksa) push gonderir -
 * cevrimiciyse zaten gercek zamanli socket event'i yeterli. */
export async function notifyIfOffline(
  db: SupabaseClient,
  targetUserId: string,
  isOnline: boolean,
  title: string,
  body: string,
  data?: Record<string, unknown>
): Promise<void> {
  if (isOnline) return;
  const tokens = await tokensFor(db, targetUserId);
  await sendExpoPush(tokens, title, body, data);
}
