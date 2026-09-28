import { SupabaseClient } from "@supabase/supabase-js";

export type RoomEventType = "create" | "join" | "leave";

/** Oda olaylarini (analitik/izleme gecmisi icin) Postgres'e kaydeder -
 * roadmap AŞAMA 6. Canli oda/oynatma durumu HALA RAM'de tutuluyor (bu
 * doğru mimari - gercek zamanli senkron icin), bu sadece bir gecmis kaydi.
 * Best-effort: basarisiz olursa oda islevini bozmaz, sessizce yutulur. */
export async function logRoomEvent(
  db: SupabaseClient,
  userId: string,
  roomCode: string,
  eventType: RoomEventType,
  mediaLabel?: string | null
): Promise<void> {
  try {
    await db.from("room_events").insert({
      user_id: userId,
      room_code: roomCode,
      event_type: eventType,
      media_label: mediaLabel || null,
    });
  } catch {
    // best-effort - analitik kaydinin basarisiz olmasi kullaniciyi etkilemez.
  }
}
