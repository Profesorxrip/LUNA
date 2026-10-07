import { SupabaseClient } from "@supabase/supabase-js";

export type FriendStatus = "none" | "outgoing" | "incoming" | "friends" | "blocked";

export interface FriendUser {
  userId: string;
  name: string;
  handle: string | null;
  avatarUrl: string | null;
}

export async function getFriendStatus(db: SupabaseClient, otherUserId: string): Promise<FriendStatus> {
  const { data, error } = await db.rpc("get_friend_status", { other_user: otherUserId });
  if (error) return "none";
  return (data as FriendStatus) || "none";
}

export async function sendRequest(db: SupabaseClient, toUserId: string): Promise<boolean> {
  const { data, error } = await db.rpc("send_friend_request", { target: toUserId });
  return !error && Boolean(data);
}

export async function cancelRequest(db: SupabaseClient, toUserId: string): Promise<void> {
  await db.rpc("cancel_friend_request", { target: toUserId });
}

export async function respondRequest(db: SupabaseClient, fromUserId: string, accept: boolean): Promise<void> {
  await db.rpc("respond_friend_request", { requester: fromUserId, accept });
}

export async function removeFriend(db: SupabaseClient, userId: string): Promise<void> {
  await db.rpc("remove_friend", { other_user: userId });
}

export async function blockUser(db: SupabaseClient, userId: string): Promise<void> {
  await db.rpc("block_user", { target: userId });
}

export async function unblockUser(db: SupabaseClient, userId: string): Promise<void> {
  await db.rpc("unblock_user", { target: userId });
}

export async function listFriends(db: SupabaseClient, myUserId: string): Promise<FriendUser[]> {
  const { data: rows } = await db
    .from("friendships")
    .select("user_a,user_b")
    .or(`user_a.eq.${myUserId},user_b.eq.${myUserId}`);
  const otherIds = (rows || []).map((r) => (r.user_a === myUserId ? r.user_b : r.user_a));
  const profiles = await profilesFor(db, otherIds);
  return otherIds.map((id) => ({
    userId: id,
    name: profiles.get(id)?.name || "Kullanici",
    handle: profiles.get(id)?.handle ?? null,
    avatarUrl: profiles.get(id)?.avatarUrl ?? null,
  }));
}

export async function listIncoming(
  db: SupabaseClient,
  myUserId: string
): Promise<{ userId: string; name: string; handle: string | null; avatarUrl: string | null; createdAt: number }[]> {
  const { data: rows } = await db
    .from("friend_requests")
    .select("from_user,created_at")
    .eq("to_user", myUserId);
  const ids = (rows || []).map((r) => r.from_user);
  const profiles = await profilesFor(db, ids);
  return (rows || []).map((r) => ({
    userId: r.from_user,
    name: profiles.get(r.from_user)?.name || "Kullanici",
    handle: profiles.get(r.from_user)?.handle ?? null,
    avatarUrl: profiles.get(r.from_user)?.avatarUrl ?? null,
    createdAt: new Date(r.created_at).getTime(),
  }));
}

export async function listOutgoing(
  db: SupabaseClient,
  myUserId: string
): Promise<{ userId: string; name: string; handle: string | null; avatarUrl: string | null; createdAt: number }[]> {
  const { data: rows } = await db
    .from("friend_requests")
    .select("to_user,created_at")
    .eq("from_user", myUserId);
  const ids = (rows || []).map((r) => r.to_user);
  const profiles = await profilesFor(db, ids);
  return (rows || []).map((r) => ({
    userId: r.to_user,
    name: profiles.get(r.to_user)?.name || "Kullanici",
    handle: profiles.get(r.to_user)?.handle ?? null,
    avatarUrl: profiles.get(r.to_user)?.avatarUrl ?? null,
    createdAt: new Date(r.created_at).getTime(),
  }));
}

export async function listBlocked(db: SupabaseClient, myUserId: string): Promise<FriendUser[]> {
  const { data: rows } = await db.from("blocks").select("blocked").eq("blocker", myUserId);
  const ids = (rows || []).map((r) => r.blocked);
  const profiles = await profilesFor(db, ids);
  return ids.map((id) => ({
    userId: id,
    name: profiles.get(id)?.name || "Kullanici",
    handle: profiles.get(id)?.handle ?? null,
    avatarUrl: profiles.get(id)?.avatarUrl ?? null,
  }));
}

export async function setUserName(db: SupabaseClient, userId: string, name: string): Promise<void> {
  // RLS: sadece kendi profilini guncelleyebilir (profiles_update_own policy).
  await db.from("profiles").update({ name }).eq("id", userId);
}

export interface PublicProfile {
  userId: string;
  name: string;
  handle: string | null;
  avatarUrl: string | null;
  bio: string | null;
  country: string | null;
  createdAt: number;
  statVisibility: Record<string, boolean>;
  galleryVisible: boolean;
  videosVisible: boolean;
  bioVisible: boolean;
  statsVisible: boolean;
  defaultAutoTranslate: boolean;
}

const PUBLIC_PROFILE_COLUMNS =
  "id,name,handle,avatar_url,bio,country,created_at,stat_visibility,gallery_visible,videos_visible,bio_visible,stats_visible,default_auto_translate";

function rowToPublicProfile(row: any): PublicProfile {
  return {
    userId: row.id,
    name: row.name || "Kullanici",
    handle: row.handle,
    avatarUrl: row.avatar_url,
    bio: row.bio,
    country: row.country,
    createdAt: new Date(row.created_at).getTime(),
    statVisibility: row.stat_visibility || {},
    galleryVisible: row.gallery_visible !== false,
    videosVisible: row.videos_visible !== false,
    bioVisible: row.bio_visible !== false,
    statsVisible: row.stats_visible !== false,
    defaultAutoTranslate: row.default_auto_translate === true,
  };
}

// profiles_select_all RLS politikasi herkesin herkesin profilini okumasina
// izin veriyor (isim/handle/avatar/bio/ulke zaten herkese acik bilgiler) -
// bu yuzden burada ekstra bir yetki kontrolune gerek yok.
export async function getPublicProfile(db: SupabaseClient, userId: string): Promise<PublicProfile | null> {
  const { data } = await db.from("profiles").select(PUBLIC_PROFILE_COLUMNS).eq("id", userId).maybeSingle();
  if (!data) return null;
  return rowToPublicProfile(data);
}

// Oda onizleme ekraninda katilimci listesini (gercek isim/handle/avatar/ulke
// ile) tek sorguda doldurmak icin - namesFor'un genisletilmis hali.
export async function profilesFor(db: SupabaseClient, ids: string[]): Promise<Map<string, PublicProfile>> {
  const map = new Map<string, PublicProfile>();
  if (ids.length === 0) return map;
  const { data } = await db.from("profiles").select(PUBLIC_PROFILE_COLUMNS).in("id", ids);
  for (const row of data || []) {
    map.set(row.id, rowToPublicProfile(row));
  }
  return map;
}

// Kullanicinin ulkesi henuz bilinmiyorsa IP'den best-effort doldurur -
// zaten biliniyorsa tekrar sorgu atmadan onu döndürür (gereksiz dis servis
// cagrisi yapmamak icin).
export async function ensureCountry(db: SupabaseClient, userId: string, ip: string, lookup: (ip: string) => Promise<string | null>): Promise<string | null> {
  const { data } = await db.from("profiles").select("country").eq("id", userId).maybeSingle();
  if (data?.country) return data.country;
  const country = await lookup(ip);
  if (country) await db.from("profiles").update({ country }).eq("id", userId);
  return country;
}

// ensureCountry ile AYNI "bir kere ogren, kalici sakla" mantigi - "Yakindakiler"
// artik ulke degil il (+ komsu il) bazinda eslestirdigi icin (bkz.
// turkeyProvinces.ts). SADECE "Konumu Gizle" KAPALI olan (paylasmayi secen)
// kullanicilar icin cagrilir (bkz. index.ts user:identify) - gizli olanlarda
// hic calistirilmaz, il hep null kalir.
export async function ensureCity(db: SupabaseClient, userId: string, ip: string, lookup: (ip: string) => Promise<string | null>): Promise<string | null> {
  const { data } = await db.from("profiles").select("city").eq("id", userId).maybeSingle();
  if (data?.city) return data.city;
  const city = await lookup(ip);
  if (city) await db.from("profiles").update({ city }).eq("id", userId);
  return city;
}
