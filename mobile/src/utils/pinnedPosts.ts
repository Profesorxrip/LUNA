import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "pinned_post_ids";

// pinnedHistory.ts'deki Gecmis/Begenilenler "Sabitle"siyle AYNI desen -
// cihaz bazli, sadece bu postId'yi listenin basina tasimak icin,
// sunucuya YAZILMAZ (Gonderiler VE Etiketler sekmesi ayni setini paylasir).
export async function getPinnedPostIds(): Promise<Set<string>> {
  const stored = await AsyncStorage.getItem(STORAGE_KEY);
  if (!stored) return new Set();
  try {
    return new Set(JSON.parse(stored));
  } catch {
    return new Set();
  }
}

export async function togglePinnedPost(postId: string): Promise<Set<string>> {
  const ids = await getPinnedPostIds();
  if (ids.has(postId)) ids.delete(postId);
  else ids.add(postId);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(ids)));
  return ids;
}
