import { SupabaseClient } from "@supabase/supabase-js";

export interface DMReply {
  text: string;
  fromName: string;
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
    replyTo: row.reply_to_text ? { text: row.reply_to_text, fromName: row.reply_to_from_name } : null,
    createdAt: new Date(row.created_at).getTime(),
    expiresAt: row.expires_at ? new Date(row.expires_at).getTime() : null,
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

export interface DMConversationSummary {
  conversationId: string;
  peerId: string;
  peerName: string;
  peerHandle: string | null;
  peerAvatarUrl: string | null;
  lastMessage: DMMessage | null;
  unread: boolean;
}

/** Alt bardaki DM listesi icin - kullanicinin tum konusmalarini, her
 * birinin karsi tarafi (profil), son mesaji ve "okunmadi" durumuyla
 * birlikte dondurur. Son mesaja gore (en yeniden eskiye) siralanir. */
export async function listConversations(db: SupabaseClient, myUserId: string): Promise<DMConversationSummary[]> {
  const { data: convos } = await db
    .from("dm_conversations")
    .select("id,user_a,user_b")
    .or(`user_a.eq.${myUserId},user_b.eq.${myUserId}`);
  if (!convos || convos.length === 0) return [];

  const convoIds = convos.map((c: any) => c.id);
  const peerIds = convos.map((c: any) => (c.user_a === myUserId ? c.user_b : c.user_a));

  const [{ data: profiles }, { data: messages }, { data: readStates }] = await Promise.all([
    db.from("profiles").select("id,name,handle,avatar_url").in("id", peerIds),
    db.from("dm_messages").select("*").in("conversation_id", convoIds).order("created_at", { ascending: false }),
    db.from("dm_read_state").select("conversation_id,last_seen_at").in("conversation_id", convoIds).eq("user_id", myUserId),
  ]);

  const profileById = new Map((profiles || []).map((p: any) => [p.id, p]));
  const lastSeenByConvo = new Map((readStates || []).map((r: any) => [r.conversation_id, r.last_seen_at]));
  // mesajlar yeniden eskiye geldigi icin her conversation_id'nin ILK
  // gordugumuz satiri zaten o konusmanin en son mesajidir.
  const lastRowByConvo = new Map<string, any>();
  for (const row of messages || []) {
    if (!lastRowByConvo.has(row.conversation_id)) lastRowByConvo.set(row.conversation_id, row);
  }

  return convos
    .map((c: any) => {
      const peerId = c.user_a === myUserId ? c.user_b : c.user_a;
      const profile = profileById.get(peerId);
      const lastRow = lastRowByConvo.get(c.id);
      const lastMessage = lastRow ? mapRow(lastRow) : null;
      const lastSeenAt = lastSeenByConvo.get(c.id);
      const unread =
        !!lastMessage &&
        lastRow.from_user !== myUserId &&
        (!lastSeenAt || new Date(lastSeenAt).getTime() < lastMessage.createdAt);
      return {
        conversationId: c.id,
        peerId,
        peerName: profile?.name ?? "Kullanici",
        peerHandle: profile?.handle ?? null,
        peerAvatarUrl: profile?.avatar_url ?? null,
        lastMessage,
        unread,
      };
    })
    .sort((a, b) => (b.lastMessage?.createdAt ?? 0) - (a.lastMessage?.createdAt ?? 0));
}

export async function setExpiryMs(db: SupabaseClient, otherUserId: string, ms: number | null): Promise<void> {
  await db.rpc("set_dm_expiry", { other_user: otherUserId, ms });
}

export async function markSeen(db: SupabaseClient, otherUserId: string): Promise<void> {
  await db.rpc("mark_dm_seen", { other_user: otherUserId });
}
