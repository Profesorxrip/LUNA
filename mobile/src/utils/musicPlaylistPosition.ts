import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "music_playlist_last_played_url";

// Muzik playlist'inde "en son kaldigimiz yer" - blankPlaylist.ts/pinnedHistory.ts
// ile AYNI desen, cihaz bazli. Dizi/Film'in aksine muzik parcalari
// BITIRILDIKTEN SONRA da listede kalmaya devam eder (bkz. MediaPickerSheet.tsx
// musicPlaylist - watchedMediaUrls filtresi muzige UYGULANMAZ), bu yuzden
// "nerede kaldik" ayri bir isaretleyiciyle tutuluyor.
export async function getLastPlayedMusicUrl(): Promise<string | null> {
  return AsyncStorage.getItem(STORAGE_KEY);
}

export async function setLastPlayedMusicUrl(url: string): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, url);
}

export async function resetLastPlayedMusicUrl(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
}

/** Playlist'i (sira korunarak) bastan sona "devam ettirmek" icin: en son
 * kaldigimiz url listede bulunursa bir SONRAKI parca, o url listenin SON
 * parcasiysa (ya da listede hic bulunamazsa/hic calinmamissa) listenin
 * BASINA donulur - "tum playlist bittiginde en basa geri donsun" istegi. */
export function getNextMusicTrackUrl(orderedUrls: string[], lastPlayedUrl: string | null): string | null {
  if (orderedUrls.length === 0) return null;
  if (!lastPlayedUrl) return orderedUrls[0];
  const index = orderedUrls.indexOf(lastPlayedUrl);
  if (index === -1 || index === orderedUrls.length - 1) return orderedUrls[0];
  return orderedUrls[index + 1];
}
