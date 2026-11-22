import { SupabaseClient } from "@supabase/supabase-js";

// Grup sohbeti - ilk surum, SADECE metin mesaji (bkz. 0047_groups.sql).
// DM'in dm_conversations/dm_messages ciftiyle AYNI desen, dm.ts'teki
// mapRow/openConversation/sendMessage ile birebir paralel - sadece
// mediaUrl/poll/sticker/vb. yok (bunlar DM'de bile onlarca migration'da
// yavas yavas eklendi, grup icin de ileride ayni sekilde eklenebilir).

export interface GroupMessage {
  id: string;
  groupId: string;
  fromUserId: string;
  fromName: string;
  text: string;
  createdAt: number;
  // "text" (varsayilan), "photo", "voice" - bkz. 0048_group_media_messages.sql
  // (DM'deki kind/media_url/is_adult/duration_ms ile AYNI desen).
  kind: "text" | "photo" | "voice";
  mediaUrl: string | null;
  isAdult: boolean;
  durationMs: number | null;
  // "Tek görünümlük" - bkz. 0049_group_voice_view_once.sql (DM'deki
  // view_once/view_once_consumed_at ile AYNI desen). viewOnceConsumed true
  // olunca mediaUrl ARTIK null'dur (sunucu temizledi).
  viewOnce: boolean;
  viewOnceConsumed: boolean;
}

export interface GroupMember {
  userId: string;
  name: string;
  handle: string | null;
  avatarUrl: string | null;
}

export interface GroupDetail {
  id: string;
  name: string;
  avatarUrl: string | null;
  members: GroupMember[];
}

export interface GroupConversationSummary {
  groupId: string;
  name: string;
  avatarUrl: string | null;
  lastMessage: GroupMessage | null;
}

function mapMessageRow(row: any): GroupMessage {
  return {
    id: row.id,
    groupId: row.group_id,
    fromUserId: row.from_user,
    fromName: row.from_name,
    text: row.text,
    createdAt: new Date(row.created_at).getTime(),
    kind: row.kind ?? "text",
    mediaUrl: row.media_url ?? null,
    isAdult: row.is_adult === true,
    durationMs: row.duration_ms ?? null,
    viewOnce: row.view_once === true,
    viewOnceConsumed: row.view_once_consumed_at != null,
  };
}

async function membersWithProfiles(db: SupabaseClient, groupId: string): Promise<GroupMember[]> {
  const { data: memberRows } = await db.from("group_members").select("user_id").eq("group_id", groupId);
  const userIds = (memberRows || []).map((r: any) => r.user_id);
  if (!userIds.length) return [];
  const { data: profiles } = await db.from("profiles").select("id,name,handle,avatar_url").in("id", userIds);
  const profileById = new Map((profiles || []).map((p: any) => [p.id, p]));
  return userIds.map((id: string) => {
    const p = profileById.get(id);
    return { userId: id, name: p?.name ?? "Kullanici", handle: p?.handle ?? null, avatarUrl: p?.avatar_url ?? null };
  });
}

/** Secilen uyelerle (+ben) yeni bir grup olusturur. */
export async function createGroup(
  db: SupabaseClient,
  name: string,
  memberIds: string[]
): Promise<{ ok: boolean; group?: GroupDetail; error?: string }> {
  const { data, error } = await db.rpc("create_group", { group_name: name, member_ids: memberIds });
  if (error || !data) return { ok: false, error: "failed" };
  const members = await membersWithProfiles(db, data.id);
  return { ok: true, group: { id: data.id, name: data.name, avatarUrl: data.avatar_url ?? null, members } };
}

export async function setGroupAvatar(db: SupabaseClient, groupId: string, avatarUrl: string): Promise<boolean> {
  const { error } = await db.rpc("set_group_avatar", { gid: groupId, url: avatarUrl });
  return !error;
}

/** Konusmayi acar - RLS sayesinde uye DEGILSEM group_conversations sorgusu
 * bos doner (ack "ok:false" olur), ayrica bir "yetkin yok" kontrolu
 * GEREKMEZ. */
export async function openGroup(
  db: SupabaseClient,
  groupId: string
): Promise<{ group: GroupDetail; messages: GroupMessage[] } | null> {
  const { data: convo } = await db.from("group_conversations").select("*").eq("id", groupId).maybeSingle();
  if (!convo) return null;
  const [{ data: rows }, members] = await Promise.all([
    db.from("group_messages").select("*").eq("group_id", groupId).order("created_at", { ascending: true }),
    membersWithProfiles(db, groupId),
  ]);
  return {
    group: { id: convo.id, name: convo.name, avatarUrl: convo.avatar_url ?? null, members },
    messages: (rows || []).map(mapMessageRow),
  };
}

export async function sendGroupMessage(
  db: SupabaseClient,
  groupId: string,
  text: string
): Promise<{ ok: boolean; message?: GroupMessage; error?: string }> {
  const { data, error } = await db.rpc("send_group_message", { gid: groupId, body: text });
  if (error) return { ok: false, error: error.message?.includes("not_member") ? "not_member" : "failed" };
  return { ok: true, message: mapMessageRow(data) };
}

export async function sendGroupImage(
  db: SupabaseClient,
  groupId: string,
  mediaUrl: string,
  isAdult: boolean,
  caption?: string,
  viewOnce?: boolean
): Promise<{ ok: boolean; message?: GroupMessage; error?: string }> {
  const { data, error } = await db.rpc("send_group_image", {
    gid: groupId,
    media_url: mediaUrl,
    is_adult: isAdult,
    caption: caption ?? null,
    view_once: viewOnce ?? false,
  });
  if (error) return { ok: false, error: error.message?.includes("not_member") ? "not_member" : "failed" };
  return { ok: true, message: mapMessageRow(data) };
}

export async function sendGroupVoice(
  db: SupabaseClient,
  groupId: string,
  mediaUrl: string,
  durationMs?: number,
  viewOnce?: boolean
): Promise<{ ok: boolean; message?: GroupMessage; error?: string }> {
  const { data, error } = await db.rpc("send_group_voice", {
    gid: groupId,
    media_url: mediaUrl,
    duration_ms: durationMs ?? null,
    view_once: viewOnce ?? false,
  });
  if (error) return { ok: false, error: error.message?.includes("not_member") ? "not_member" : "failed" };
  return { ok: true, message: mapMessageRow(data) };
}

/** DM'deki consumeMediaOnce ile AYNI mantik - bkz. 0049_group_voice_view_once.sql
 * consume_group_media_once RPC'si. */
export async function consumeGroupMediaOnce(db: SupabaseClient, messageId: string): Promise<GroupMessage | null> {
  const { data, error } = await db.rpc("consume_group_media_once", { message_id: messageId });
  if (error || !data) return null;
  return mapMessageRow(data);
}

/** DM listesindeki konusmalarla BIRLESTIRILMEK uzere - uyesi oldugum tum
 * gruplarin son mesaj onizlemesiyle ozeti (bkz. DMListScreen.tsx). */
export async function listMyGroups(db: SupabaseClient, myUserId: string): Promise<GroupConversationSummary[]> {
  const { data: memberRows } = await db.from("group_members").select("group_id").eq("user_id", myUserId);
  const groupIds = (memberRows || []).map((r: any) => r.group_id);
  if (!groupIds.length) return [];

  const [{ data: convos }, { data: messages }] = await Promise.all([
    db.from("group_conversations").select("id,name,avatar_url").in("id", groupIds),
    db.from("group_messages").select("*").in("group_id", groupIds).order("created_at", { ascending: false }),
  ]);

  const lastRowByGroup = new Map<string, any>();
  for (const row of messages || []) {
    if (!lastRowByGroup.has(row.group_id)) lastRowByGroup.set(row.group_id, row);
  }

  return (convos || []).map((c: any) => {
    const lastRow = lastRowByGroup.get(c.id);
    return {
      groupId: c.id,
      name: c.name,
      avatarUrl: c.avatar_url ?? null,
      lastMessage: lastRow ? mapMessageRow(lastRow) : null,
    };
  });
}

export async function groupMemberUserIds(db: SupabaseClient, groupId: string): Promise<string[]> {
  const { data } = await db.from("group_members").select("user_id").eq("group_id", groupId);
  return (data || []).map((r: any) => r.user_id);
}
