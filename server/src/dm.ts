import { SupabaseClient } from "@supabase/supabase-js";

export interface DMReply {
  text: string;
  fromName: string;
  // Alinti kutusunda uygun ikonu/kucuk resmi gosterebilmek icin - bkz.
  // 0036_dm_reply_rich.sql. Eski (bu migration'dan ONCE gonderilmis)
  // kayitlarda ikisi de null, istemci duz metne geri doner.
  kind?: DMMessage["kind"] | null;
  mediaUrl?: string | null;
}

export interface DMMessage {
  id: string;
  fromUserId: string;
  fromName: string;
  text: string;
  mediaUrl: string | null;
  isAdult: boolean;
  replyTo: DMReply | null;
  createdAt: number;
  expiresAt: number | null;
  // "photo" (eski kayitlarda da gecerli varsayim - bkz. 0033 migration'daki
  // geriye donuk isaretleme), "voice", "location", "file", "video", "call" -
  // bkz. 0033_dm_message_kinds.sql / 0034_dm_video_messages.sql /
  // 0035_dm_call_messages.sql.
  kind: "text" | "photo" | "voice" | "location" | "file" | "video" | "call";
  durationMs: number | null;
  latitude: number | null;
  longitude: number | null;
  fileName: string | null;
  fileSize: number | null;
  mimeType: string | null;
  // Sadece kind==="call" oldugunda dolu - bkz. 0035_dm_call_messages.sql.
  callIsVideo: boolean | null;
  callStatus: "completed" | "missed" | null;
}

// userId -> socketId. Sadece hangi acik socket'in hangi kullanici oldugunu
// (gercek zamanli event yonlendirmesi icin) tutar - mesaj/iliski verisi
// degildir, bu yuzden RAM'de kalmasi sorun yaratmaz (baglanti kopunca zaten
// anlamsizlasir).
const onlineUsers = new Map<string, string>();

export function setOnline(userId: string, socketId: string) {
  onlineUsers.set(userId, socketId);
}

export function removeOnlineBySocket(socketId: string) {
  for (const [userId, sid] of onlineUsers) {
    if (sid === socketId) onlineUsers.delete(userId);
  }
}

export function getSocketIdForUser(userId: string): string | undefined {
  return onlineUsers.get(userId);
}

function mapRow(row: any): DMMessage {
  return {
    id: row.id,
    fromUserId: row.from_user,
    fromName: row.from_name,
    text: row.text,
    mediaUrl: row.media_url ?? null,
    isAdult: row.is_adult === true,
    replyTo: row.reply_to_text
      ? { text: row.reply_to_text, fromName: row.reply_to_from_name, kind: row.reply_to_kind ?? null, mediaUrl: row.reply_to_media_url ?? null }
      : null,
    createdAt: new Date(row.created_at).getTime(),
    expiresAt: row.expires_at ? new Date(row.expires_at).getTime() : null,
    kind: row.kind ?? "text",
    durationMs: row.duration_ms ?? null,
    latitude: row.latitude ?? null,
    longitude: row.longitude ?? null,
    fileName: row.file_name ?? null,
    fileSize: row.file_size ?? null,
    mimeType: row.mime_type ?? null,
    callIsVideo: row.call_is_video ?? null,
    callStatus: row.call_status ?? null,
  };
}

/** Konusmayi (yoksa olusturarak) acar, gorulmus olarak isaretler ve mesaj
 * gecmisini dondurur. Suresi gecmis mesajlar RPC icinde zaten temizlenir. */
export async function openConversation(
  db: SupabaseClient,
  otherUserId: string
): Promise<{ messages: DMMessage[]; expiresAfterMs: number | null } | null> {
  const { data: convoId, error } = await db.rpc("open_dm", { other_user: otherUserId });
  if (error || !convoId) return null;

  const [{ data: rows }, { data: convoRow }] = await Promise.all([
    db.from("dm_messages").select("*").eq("conversation_id", convoId).order("created_at", { ascending: true }),
    db.from("dm_conversations").select("expires_after_ms").eq("id", convoId).single(),
  ]);

  return {
    messages: (rows || []).map(mapRow),
    expiresAfterMs: convoRow?.expires_after_ms ?? null,
  };
}

/** Son mesaj onizlemesi - dm:open'in aksine konusmayi "gorulmus" saymaz. */
export async function previewConversation(
  db: SupabaseClient,
  myUserId: string,
  otherUserId: string
): Promise<DMMessage | null> {
  const a = myUserId < otherUserId ? myUserId : otherUserId;
  const b = myUserId < otherUserId ? otherUserId : myUserId;
  const { data: convo } = await db.from("dm_conversations").select("id").eq("user_a", a).eq("user_b", b).maybeSingle();
  if (!convo) return null;
  const { data: rows } = await db
    .from("dm_messages")
    .select("*")
    .eq("conversation_id", convo.id)
    .order("created_at", { ascending: false })
    .limit(1);
  return rows && rows[0] ? mapRow(rows[0]) : null;
}

export async function sendMessage(
  db: SupabaseClient,
  toUserId: string,
  text: string,
  replyTo: DMReply | null
): Promise<{ ok: boolean; message?: DMMessage; error?: string }> {
  const { data, error } = await db.rpc("send_dm", {
    to_user: toUserId,
    body: text,
    reply_text: replyTo?.text ?? null,
    reply_from_name: replyTo?.fromName ?? null,
    reply_kind: replyTo?.kind ?? null,
    reply_media_url: replyTo?.mediaUrl ?? null,
  });
  if (error) {
    // RPC 'blocked' exception'ini firlatiyorsa PostgREST bunu error.message'da tasir.
    return { ok: false, error: error.message?.includes("blocked") ? "blocked" : "failed" };
  }
  return { ok: true, message: mapRow(data) };
}

export async function sendImageMessage(
  db: SupabaseClient,
  toUserId: string,
  mediaUrl: string,
  isAdult: boolean,
  caption?: string
): Promise<{ ok: boolean; message?: DMMessage; error?: string }> {
  const { data, error } = await db.rpc("send_dm_image", {
    to_user: toUserId,
    media_url: mediaUrl,
    is_adult: isAdult,
    caption: caption ?? null,
  });
  if (error) {
    return { ok: false, error: error.message?.includes("blocked") ? "blocked" : "failed" };
  }
  return { ok: true, message: mapRow(data) };
}

export async function sendVoiceMessage(
  db: SupabaseClient,
  toUserId: string,
  mediaUrl: string,
  durationMs?: number
): Promise<{ ok: boolean; message?: DMMessage; error?: string }> {
  const { data, error } = await db.rpc("send_dm_voice", {
    to_user: toUserId,
    media_url: mediaUrl,
    duration_ms: durationMs ?? null,
  });
  if (error) {
    return { ok: false, error: error.message?.includes("blocked") ? "blocked" : "failed" };
  }
  return { ok: true, message: mapRow(data) };
}

export async function sendVideoMessage(
  db: SupabaseClient,
  toUserId: string,
  mediaUrl: string,
  durationMs?: number,
  caption?: string
): Promise<{ ok: boolean; message?: DMMessage; error?: string }> {
  const { data, error } = await db.rpc("send_dm_video", {
    to_user: toUserId,
    media_url: mediaUrl,
    duration_ms: durationMs ?? null,
    caption: caption ?? null,
  });
  if (error) {
    return { ok: false, error: error.message?.includes("blocked") ? "blocked" : "failed" };
  }
  return { ok: true, message: mapRow(data) };
}

/** Bir aramanin (sesli/goruntulu) SONUCUNU DM sohbetine kayit duser -
 * arayan ya da arananin HANGISI o anki olayi (kapatma/reddetme/vazgecme)
 * tetikliyorsa ONUN kendi db client'iyla ("me" = auth.uid()) cagrilir, bkz.
 * calls.ts/index.ts kullanim yeri. status "missed" oldugunda duration_ms
 * RPC icinde zaten yoksayilir. */
export async function sendCallMessage(
  db: SupabaseClient,
  toUserId: string,
  isVideo: boolean,
  status: "completed" | "missed",
  durationMs?: number
): Promise<{ ok: boolean; message?: DMMessage; error?: string }> {
  const { data, error } = await db.rpc("send_dm_call", {
    to_user: toUserId,
    is_video: isVideo,
    status,
    duration_ms: durationMs ?? null,
  });
  if (error) {
    return { ok: false, error: "failed" };
  }
  return { ok: true, message: mapRow(data) };
}

export async function sendLocationMessage(
  db: SupabaseClient,
  toUserId: string,
  latitude: number,
  longitude: number
): Promise<{ ok: boolean; message?: DMMessage; error?: string }> {
  const { data, error } = await db.rpc("send_dm_location", {
    to_user: toUserId,
    latitude,
    longitude,
  });
  if (error) {
    return { ok: false, error: error.message?.includes("blocked") ? "blocked" : "failed" };
  }
  return { ok: true, message: mapRow(data) };
}

export async function sendFileMessage(
  db: SupabaseClient,
  toUserId: string,
  mediaUrl: string,
  fileName: string,
  fileSize?: number,
  mimeType?: string
): Promise<{ ok: boolean; message?: DMMessage; error?: string }> {
  const { data, error } = await db.rpc("send_dm_file", {
    to_user: toUserId,
    media_url: mediaUrl,
    file_name: fileName,
    file_size: fileSize ?? null,
    mime_type: mimeType ?? null,
  });
  if (error) {
    return { ok: false, error: error.message?.includes("blocked") ? "blocked" : "failed" };
  }
  return { ok: true, message: mapRow(data) };
}

export interface DMConversationSummary {
  conversationId: string;
  peerId: string;
  peerName: string;
  peerHandle: string | null;
  peerAvatarUrl: string | null;
  lastMessage: DMMessage | null;
  unread: boolean;
  unreadCount: number;
  isFriend: boolean;
  pinned: boolean;
  muted: boolean;
  archived: boolean;
}

/** Alt bardaki DM listesi icin - kullanicinin tum konusmalarini, her
 * birinin karsi tarafi (profil), son mesaji ve "okunmadi" durumuyla
 * birlikte dondurur. Son mesaja gore (en yeniden eskiye) siralanir.
 * "Sohbeti sil" ile gizlenmis (hidden_at) konusmalar - SADECE o tarihten
 * SONRA yeni bir mesaj gelmediyse - listeden tamamen cikarilir. */
export async function listConversations(db: SupabaseClient, myUserId: string): Promise<DMConversationSummary[]> {
  const { data: convos } = await db
    .from("dm_conversations")
    .select("id,user_a,user_b")
    .or(`user_a.eq.${myUserId},user_b.eq.${myUserId}`);
  if (!convos || convos.length === 0) return [];

  const convoIds = convos.map((c: any) => c.id);
  const peerIds = convos.map((c: any) => (c.user_a === myUserId ? c.user_b : c.user_a));

  const [{ data: profiles }, { data: messages }, { data: readStates }, { data: friendRows }] = await Promise.all([
    db.from("profiles").select("id,name,handle,avatar_url").in("id", peerIds),
    db.from("dm_messages").select("*").in("conversation_id", convoIds).order("created_at", { ascending: false }),
    db
      .from("dm_read_state")
      .select("conversation_id,last_seen_at,pinned,muted,archived,manual_unread,hidden_at")
      .in("conversation_id", convoIds)
      .eq("user_id", myUserId),
    db.from("friendships").select("user_a,user_b").or(`user_a.eq.${myUserId},user_b.eq.${myUserId}`),
  ]);

  const friendIds = new Set(
    (friendRows || []).map((r: any) => (r.user_a === myUserId ? r.user_b : r.user_a))
  );
  const profileById = new Map((profiles || []).map((p: any) => [p.id, p]));
  const readStateByConvo = new Map((readStates || []).map((r: any) => [r.conversation_id, r]));
  // mesajlar yeniden eskiye geldigi icin her conversation_id'nin ILK
  // gordugumuz satiri zaten o konusmanin en son mesajidir.
  const lastRowByConvo = new Map<string, any>();
  const unreadCountByConvo = new Map<string, number>();
  for (const row of messages || []) {
    if (!lastRowByConvo.has(row.conversation_id)) lastRowByConvo.set(row.conversation_id, row);
    if (row.from_user === myUserId) continue;
    const lastSeenAt = readStateByConvo.get(row.conversation_id)?.last_seen_at;
    const rowTime = new Date(row.created_at).getTime();
    if (!lastSeenAt || new Date(lastSeenAt).getTime() < rowTime) {
      unreadCountByConvo.set(row.conversation_id, (unreadCountByConvo.get(row.conversation_id) ?? 0) + 1);
    }
  }

  return convos
    .map((c: any) => {
      const peerId = c.user_a === myUserId ? c.user_b : c.user_a;
      const profile = profileById.get(peerId);
      const lastRow = lastRowByConvo.get(c.id);
      const lastMessage = lastRow ? mapRow(lastRow) : null;
      const unreadCount = unreadCountByConvo.get(c.id) ?? 0;
      const readState = readStateByConvo.get(c.id);
      const hiddenAt = readState?.hidden_at ? new Date(readState.hidden_at).getTime() : null;
      const hidden = hiddenAt !== null && (!lastMessage || lastMessage.createdAt <= hiddenAt);
      return {
        conversationId: c.id,
        peerId,
        peerName: profile?.name ?? "Kullanici",
        peerHandle: profile?.handle ?? null,
        peerAvatarUrl: profile?.avatar_url ?? null,
        lastMessage,
        unread: unreadCount > 0 || !!readState?.manual_unread,
        unreadCount,
        isFriend: friendIds.has(peerId),
        pinned: !!readState?.pinned,
        muted: !!readState?.muted,
        archived: !!readState?.archived,
        hidden,
      };
    })
    .filter((c: any) => !c.hidden)
    .map(({ hidden, ...rest }: any) => rest)
    .sort((a, b) => (b.lastMessage?.createdAt ?? 0) - (a.lastMessage?.createdAt ?? 0));
}

export async function setDmPinned(db: SupabaseClient, otherUserId: string, pinned: boolean): Promise<void> {
  await db.rpc("set_dm_pinned", { other_user: otherUserId, p_pinned: pinned });
}

export async function setDmMuted(db: SupabaseClient, otherUserId: string, muted: boolean): Promise<void> {
  await db.rpc("set_dm_muted", { other_user: otherUserId, p_muted: muted });
}

export async function setDmArchived(db: SupabaseClient, otherUserId: string, archived: boolean): Promise<void> {
  await db.rpc("set_dm_archived", { other_user: otherUserId, p_archived: archived });
}

export async function setDmManualUnread(db: SupabaseClient, otherUserId: string, unread: boolean): Promise<void> {
  await db.rpc("set_dm_manual_unread", { other_user: otherUserId, p_unread: unread });
}

export async function hideDmConversation(db: SupabaseClient, otherUserId: string): Promise<void> {
  await db.rpc("hide_dm_conversation", { other_user: otherUserId });
}

export async function setExpiryMs(db: SupabaseClient, otherUserId: string, ms: number | null): Promise<void> {
  await db.rpc("set_dm_expiry", { other_user: otherUserId, ms });
}

export async function markSeen(db: SupabaseClient, otherUserId: string): Promise<void> {
  await db.rpc("mark_dm_seen", { other_user: otherUserId });
}
