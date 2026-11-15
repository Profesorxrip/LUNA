import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "blank_playlist_urls";

// "Bos playlist" - pinnedHistory.ts'teki AYNI desen: cihaz bazli, sunucuya
// YAZILMAZ. Bir oda acilirken SECILEN videonun url'si buraya eklenir, o
// video dogal olarak bitip oylama acilinca (bkz. RoomScreen.tsx room.poll
// gecisi) buradan kaldirilir - yani bu liste "su an izlemek uzere
// kuyruga alinmis, henuz bitirilmemis" videolari tutar.
export async function getBlankPlaylistUrls(): Promise<Set<string>> {
  const stored = await AsyncStorage.getItem(STORAGE_KEY);
  if (!stored) return new Set();
  try {
    return new Set(JSON.parse(stored));
  } catch {
    return new Set();
  }
}

export async function addToBlankPlaylist(url: string): Promise<Set<string>> {
  const urls = await getBlankPlaylistUrls();
  urls.add(url);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(urls)));
  return urls;
}

export async function removeFromBlankPlaylist(url: string): Promise<Set<string>> {
  const urls = await getBlankPlaylistUrls();
  urls.delete(url);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(urls)));
  return urls;
}

// Bos playlist'in "Sifirla" secenegi - kuyruktaki tum videolari temizler.
export async function clearBlankPlaylist(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
}
