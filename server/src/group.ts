import { SupabaseClient } from "@supabase/supabase-js";
import { getSocketIdForUser } from "./dm";

// Grup sohbeti - dm.ts'teki (DM, "Kişi Mesajı") ile BIREBIR AYNI desene
// ulasti: metin/foto/sesli/video/konum/dosya/muzik/kisi/anket/cikartma
// mesaj turleri VE basili tutma menusu (yanitla/sabitle/sil) - bkz.
// 0047-0051 migration'lari. Tek fark: "ilet" icin AYRI bir grup RPC'si
// YOK - bir grup mesaji baska bir kisiye (DM'e) iletilirken var olan
// forward_dm_message RPC'si (0037_dm_message_actions.sql) dogrudan
// kullanilir (bkz. index.ts "group:forwardToDm" - GroupMessage alanlari
// zaten DMMessage ile AYNI isimlerde, dogrudan eslesir).

export interface GroupReply {
  text: string;
  fromName: string;
  kind?: GroupMessage["kind"] | null;
  mediaUrl?: string | null;
  // Yanitlanan mesaj tek-gorunumlukse (bkz. 0052_group_reply_viewonce.sql) -
  // mobile tarafi bu alan true oldugunda mediaUrl'i HIC gondermez (gercek
  // icerik reply'a SIZMASIN diye), ReplyPreviewContent.tsx bunun yerine
  // rozet+tur etiketi gosterir.
  viewOnce?: boolean;
  // SADECE GIF cikartmalarini ("gif-" onekli) tanimak icin - bkz.
  // ReplyPreviewContent.tsx isGifSticker.
  stickerId?: string | null;
}

export interface GroupMessage {
  id: string;
  groupId: string;
  fromUserId: string;
  fromName: string;
  text: string;
  createdAt: number;
  kind: "text" | "photo" | "voice" | "location" | "file" | "video" | "contact" | "poll" | "music" | "sticker";
  mediaUrl: string | null;
  isAdult: boolean;
  durationMs: number | null;
  latitude: number | null;
  longitude: number | null;
  fileName: string | null;
  fileSize: number | null;
  mimeType: string | null;
  sharedUserId: string | null;
  sharedUserName: string | null;
  sharedUserHandle: string | null;
  sharedUserAvatarUrl: string | null;
  pollQuestion: string | null;
  pollOptions: string[] | null;
  pollOptionImages: string[] | null;
  pollVotes: number[] | null;
  myPollVote: number | null;
  stickerId: string | null;
  replyTo: GroupReply | null;
  deletedForEveryone: boolean;
  // "benden sil" uygulanmis satirlar listeye hic girmez (bkz. visibleToMe),
  // bu yuzden DMMessage'daki gibi burada ayri bir alan YOK.
  viewOnce: boolean;
  viewOnceConsumed: boolean;
}

export interface GroupPinnedMessage {
  message: GroupMessage;
  pinnedBy: string;
  pinnedAt: number;
}

export interface GroupMember {
  userId: string;
  name: string;
  handle: string | null;
  avatarUrl: string | null;
  isOnline: boolean;
  isAdmin: boolean;
}

export interface GroupDetail {
  id: string;
  name: string;
  avatarUrl: string | null;
  creatorId: string;
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
    latitude: row.latitude ?? null,
    longitude: row.longitude ?? null,
    fileName: row.file_name ?? null,
    fileSize: row.file_size ?? null,
    mimeType: row.mime_type ?? null,
    sharedUserId: row.shared_user_id ?? null,
    sharedUserName: row.shared_user_name ?? null,
    sharedUserHandle: row.shared_user_handle ?? null,
    sharedUserAvatarUrl: row.shared_user_avatar_url ?? null,
    pollQuestion: row.poll_question ?? null,
    pollOptions: row.poll_options ?? null,
    pollOptionImages: row.poll_option_images ?? null,
    pollVotes: null,
    myPollVote: null,
    stickerId: row.sticker_id ?? null,
    replyTo: row.reply_to_text
      ? {
          text: row.reply_to_text,
          fromName: row.reply_to_from_name,
          kind: row.reply_to_kind ?? null,
          mediaUrl: row.reply_to_media_url ?? null,
          viewOnce: row.reply_to_view_once === true,
          stickerId: row.reply_to_sticker_id ?? null,
        }
      : null,
    deletedForEveryone: row.deleted_for_everyone === true,
    viewOnce: row.view_once === true,
    viewOnceConsumed: row.view_once_consumed_at != null,
  };
}

function visibleToMe(row: any, myUserId: string): boolean {
  return !Array.isArray(row.deleted_for) || !row.deleted_for.includes(myUserId);
}

/** DM'deki attachPollExtras ile AYNI amac - FARKI: grup N kisi oldugu icin
 * (DM'in "en fazla 2 oy" varsayimi burada GECERSIZ) sadece guncel sayimi
 * JS'te topluyoruz, mantik degismiyor. */
async function attachPollExtras(db: SupabaseClient, myUserId: string, messages: GroupMessage[]): Promise<GroupMessage[]> {
  const pollIds = messages.filter((m) => m.kind === "poll").map((m) => m.id);
  if (!pollIds.length) return messages;
  const { data: voteRows } = await db.from("group_poll_votes").select("message_id, user_id, option_index").in("message_id", pollIds);
  const byMessage = new Map<string, { user_id: string; option_index: number }[]>();
  for (const r of voteRows || []) {
    const arr = byMessage.get(r.message_id) || [];
    arr.push({ user_id: r.user_id, option_index: r.option_index });
    byMessage.set(r.message_id, arr);
  }
  return messages.map((m) => {
    if (m.kind !== "poll") return m;
    const rows = byMessage.get(m.id) || [];
    const n = m.pollOptions?.length ?? 0;
    const tally = new Array(n).fill(0);
    for (const r of rows) {
      if (r.option_index >= 0 && r.option_index < n) tally[r.option_index]++;
    }
    const mine = rows.find((r) => r.user_id === myUserId);
    return { ...m, pollVotes: tally, myPollVote: mine ? mine.option_index : null };
  });
}

async function membersWithProfiles(db: SupabaseClient, groupId: string): Promise<GroupMember[]> {
  const { data: memberRows } = await db.from("group_members").select("user_id,is_admin").eq("group_id", groupId);
  const userIds = (memberRows || []).map((r: any) => r.user_id);
  if (!userIds.length) return [];
  const adminByUserId = new Map((memberRows || []).map((r: any) => [r.user_id, Boolean(r.is_admin)]));
  const { data: profiles } = await db.from("profiles").select("id,name,handle,avatar_url").in("id", userIds);
  const profileById = new Map((profiles || []).map((p: any) => [p.id, p]));
  return userIds.map((id: string) => {
    const p = profileById.get(id);
    return {
      userId: id,
      name: p?.name ?? "Kullanici",
      handle: p?.handle ?? null,
      avatarUrl: p?.avatar_url ?? null,
      isOnline: Boolean(getSocketIdForUser(id)),
      isAdmin: adminByUserId.get(id) ?? false,
    };
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
  return { ok: true, group: { id: data.id, name: data.name, avatarUrl: data.avatar_url ?? null, creatorId: data.created_by, members } };
}

export async function setGroupAvatar(db: SupabaseClient, groupId: string, avatarUrl: string): Promise<boolean> {
  const { error } = await db.rpc("set_group_avatar", { gid: groupId, url: avatarUrl });
  return !error;
}

/** Grup ismini degistirir - RPC (SADECE olusturan kisi) zaten yetkisiz
 * istekleri sessizce yok sayiyor (0 satir guncellenir). */
export async function renameGroup(db: SupabaseClient, groupId: string, name: string): Promise<boolean> {
  const { error } = await db.rpc("rename_group", { gid: groupId, new_name: name });
  return !error;
}

/** Bir uyeyi yonetici yapar/yoneticilikten alir - RPC (0055_group_admin_
 * management.sql) yetkisiz/kurucuyu hedefleyen istekleri exception ile
 * reddeder (bkz. asagidaki "error" kontrolu). */
export async function setGroupMemberAdmin(
  db: SupabaseClient,
  groupId: string,
  targetUserId: string,
  admin: boolean
): Promise<boolean> {
  const { error } = await db.rpc("set_group_member_admin", { gid: groupId, target_user: targetUserId, admin });
  return !error;
}

/** Bir uyeyi gruptan cikarir - RPC AYNI sekilde yetkisiz/kurucuyu
 * hedefleyen istekleri reddeder. */
export async function removeGroupMember(db: SupabaseClient, groupId: string, targetUserId: string): Promise<boolean> {
  const { error } = await db.rpc("remove_group_member", { gid: groupId, target_user: targetUserId });
  return !error;
}

/** Konusmayi acar - RLS sayesinde uye DEGILSEM group_conversations sorgusu
 * bos doner (ack "ok:false" olur), ayrica bir "yetkin yok" kontrolu
 * GEREKMEZ. */
export async function openGroup(
  db: SupabaseClient,
  myUserId: string,
  groupId: string
): Promise<{ group: GroupDetail; messages: GroupMessage[]; pinned: GroupPinnedMessage[] } | null> {
  const { data: convo } = await db.from("group_conversations").select("*").eq("id", groupId).maybeSingle();
  if (!convo) return null;
  const [{ data: rows }, members, { data: pinnedRows }] = await Promise.all([
    db.from("group_messages").select("*").eq("group_id", groupId).order("created_at", { ascending: true }),
    membersWithProfiles(db, groupId),
    db.from("group_pinned_messages").select("*, group_messages(*)").eq("group_id", groupId).order("pinned_at", { ascending: true }),
  ]);
  const messages = await attachPollExtras(
    db,
    myUserId,
    (rows || []).filter((r: any) => visibleToMe(r, myUserId)).map(mapMessageRow)
  );
  return {
    group: { id: convo.id, name: convo.name, avatarUrl: convo.avatar_url ?? null, creatorId: convo.created_by, members },
    messages,
    pinned: (pinnedRows || [])
      .filter((r: any) => r.group_messages)
      .map((r: any) => ({ message: mapMessageRow(r.group_messages), pinnedBy: r.pinned_by, pinnedAt: new Date(r.pinned_at).getTime() })),
  };
}

export async function sendGroupMessage(
  db: SupabaseClient,
  groupId: string,
  text: string,
  replyTo: GroupReply | null
): Promise<{ ok: boolean; message?: GroupMessage; error?: string }> {
  const { data, error } = await db.rpc("send_group_message", {
    gid: groupId,
    body: text,
    reply_text: replyTo?.text ?? null,
    reply_from_name: replyTo?.fromName ?? null,
    reply_kind: replyTo?.kind ?? null,
    reply_media_url: replyTo?.mediaUrl ?? null,
    reply_view_once: replyTo?.viewOnce ?? false,
    reply_sticker_id: replyTo?.stickerId ?? null,
  });
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

export async function sendGroupVideo(
  db: SupabaseClient,
  groupId: string,
  mediaUrl: string,
  durationMs?: number,
  caption?: string,
  viewOnce?: boolean
): Promise<{ ok: boolean; message?: GroupMessage; error?: string }> {
  const { data, error } = await db.rpc("send_group_video", {
    gid: groupId,
    media_url: mediaUrl,
    duration_ms: durationMs ?? null,
    caption: caption ?? null,
    view_once: viewOnce ?? false,
  });
  if (error) return { ok: false, error: error.message?.includes("not_member") ? "not_member" : "failed" };
  return { ok: true, message: mapMessageRow(data) };
}

export async function sendGroupLocation(
  db: SupabaseClient,
  groupId: string,
  latitude: number,
  longitude: number
): Promise<{ ok: boolean; message?: GroupMessage; error?: string }> {
  const { data, error } = await db.rpc("send_group_location", { gid: groupId, latitude, longitude });
  if (error) return { ok: false, error: error.message?.includes("not_member") ? "not_member" : "failed" };
  return { ok: true, message: mapMessageRow(data) };
}

export async function sendGroupFile(
  db: SupabaseClient,
  groupId: string,
  mediaUrl: string,
  fileName: string,
  fileSize?: number,
  mimeType?: string,
  caption?: string
): Promise<{ ok: boolean; message?: GroupMessage; error?: string }> {
  const { data, error } = await db.rpc("send_group_file", {
    gid: groupId,
    media_url: mediaUrl,
    file_name: fileName,
    file_size: fileSize ?? null,
    mime_type: mimeType ?? null,
    caption: caption ?? null,
  });
  if (error) return { ok: false, error: error.message?.includes("not_member") ? "not_member" : "failed" };
  return { ok: true, message: mapMessageRow(data) };
}

export async function sendGroupMusic(
  db: SupabaseClient,
  groupId: string,
  mediaUrl: string,
  fileName: string,
  fileSize?: number,
  mimeType?: string,
  caption?: string
): Promise<{ ok: boolean; message?: GroupMessage; error?: string }> {
  const { data, error } = await db.rpc("send_group_music", {
    gid: groupId,
    media_url: mediaUrl,
    file_name: fileName,
    file_size: fileSize ?? null,
    mime_type: mimeType ?? null,
    caption: caption ?? null,
  });
  if (error) return { ok: false, error: error.message?.includes("not_member") ? "not_member" : "failed" };
  return { ok: true, message: mapMessageRow(data) };
}

export async function sendGroupContact(
  db: SupabaseClient,
  groupId: string,
  sharedUserId: string
): Promise<{ ok: boolean; message?: GroupMessage; error?: string }> {
  const { data, error } = await db.rpc("send_group_contact", { gid: groupId, shared_user_id: sharedUserId });
  if (error) return { ok: false, error: error.message?.includes("not_member") ? "not_member" : "failed" };
  return { ok: true, message: mapMessageRow(data) };
}

export async function sendGroupPoll(
  db: SupabaseClient,
  groupId: string,
  question: string,
  options: string[],
  optionImages?: (string | null)[]
): Promise<{ ok: boolean; message?: GroupMessage; error?: string }> {
  const { data, error } = await db.rpc("send_group_poll", {
    gid: groupId,
    question,
    options,
    option_images: optionImages ?? null,
  });
  if (error) return { ok: false, error: error.message?.includes("not_member") ? "not_member" : "failed" };
  const message = mapMessageRow(data);
  message.pollVotes = new Array(message.pollOptions?.length ?? 0).fill(0);
  message.myPollVote = null;
  return { ok: true, message };
}

export async function voteGroupPoll(
  db: SupabaseClient,
  messageId: string,
  optionIndex: number
): Promise<{ ok: boolean; votes?: number[] }> {
  const { data, error } = await db.rpc("vote_group_poll", { message_id: messageId, option_index: optionIndex });
  if (error) return { ok: false };
  return { ok: true, votes: (data?.votes as number[]) ?? [] };
}

export async function sendGroupSticker(
  db: SupabaseClient,
  groupId: string,
  stickerId?: string,
  mediaUrl?: string
): Promise<{ ok: boolean; message?: GroupMessage; error?: string }> {
  const { data, error } = await db.rpc("send_group_sticker", {
    gid: groupId,
    sticker_id: stickerId ?? null,
    media_url: mediaUrl ?? null,
  });
  if (error) return { ok: false, error: error.message?.includes("not_member") ? "not_member" : "failed" };
  return { ok: true, message: mapMessageRow(data) };
}

/** DM'deki consumeMediaOnce ile AYNI mantik - bkz. 0049/0051 migration'lari
 * consume_group_media_once RPC'si. */
export async function consumeGroupMediaOnce(db: SupabaseClient, messageId: string): Promise<GroupMessage | null> {
  const { data, error } = await db.rpc("consume_group_media_once", { message_id: messageId });
  if (error || !data) return null;
  return mapMessageRow(data);
}

export async function deleteGroupMessageForEveryone(db: SupabaseClient, messageId: string): Promise<boolean> {
  const { error } = await db.rpc("delete_group_message_for_everyone", { message_id: messageId });
  return !error;
}

export async function deleteGroupMessageForMe(db: SupabaseClient, messageId: string): Promise<boolean> {
  const { error } = await db.rpc("delete_group_message_for_me", { message_id: messageId });
  return !error;
}

export async function pinGroupMessage(db: SupabaseClient, messageId: string): Promise<boolean> {
  const { error } = await db.rpc("pin_group_message", { message_id: messageId });
  return !error;
}

export async function unpinGroupMessage(db: SupabaseClient, messageId: string): Promise<boolean> {
  const { error } = await db.rpc("unpin_group_message", { message_id: messageId });
  return !error;
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
    if (!visibleToMe(row, myUserId)) continue;
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
