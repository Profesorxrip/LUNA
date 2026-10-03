import { SupabaseClient } from "@supabase/supabase-js";

export type RoomEventType = "create" | "join" | "leave";

export interface RoomEventMedia {
  participantCount?: number;
  coverUrl?: string | null;
  type?: string;
  url?: string;
}

/** Oda olaylarini (analitik/izleme gecmisi icin) Postgres'e kaydeder -
 * roadmap AŞAMA 6. Canli oda/oynatma durumu HALA RAM'de tutuluyor (bu
 * doğru mimari - gercek zamanli senkron icin), bu sadece bir gecmis kaydi.
 * participantCount/cover/type/url SADECE "create"/"join" icin anlamli -
 * profildeki GERCEK "LUNA Suresi / En Buyuk Odaniz" istatistikleri ve
 * "Gecmis/Galeri" bu alanlar uzerinden hesaplaniyor (bkz. supabase/
 * migrations/0003_profile_stats_and_history.sql).
 * Best-effort: basarisiz olursa oda islevini bozmaz, sessizce yutulur. */
export async function logRoomEvent(
  db: SupabaseClient,
  userId: string,
  roomCode: string,
  eventType: RoomEventType,
  mediaLabel?: string | null,
  media?: RoomEventMedia
): Promise<void> {
  try {
    await db.from("room_events").insert({
      user_id: userId,
      room_code: roomCode,
      event_type: eventType,
      media_label: mediaLabel || null,
      participant_count: media?.participantCount ?? null,
      media_cover_url: media?.coverUrl ?? null,
      media_type: media?.type ?? null,
      media_url: media?.url ?? null,
    });
  } catch {
    // best-effort - analitik kaydinin basarisiz olmasi kullaniciyi etkilemez.
  }
}
