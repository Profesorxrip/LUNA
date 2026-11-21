import AsyncStorage from "@react-native-async-storage/async-storage";
import type { PickedFileAsset, RecentFileEntry } from "./recentFiles";

export type { PickedFileAsset, RecentFileEntry };

const STORAGE_KEY = "luna:recentMusic";
const MAX_ENTRIES = 15;

/** "Müzik" ekranindaki "Son Müzikler" listesi - recentFiles.ts ile AYNI
 * desen (cihazda AsyncStorage'da, sunucuya gitmez), ama kullanicinin
 * "aynı dosya ekranı gibi çalışsın" istegiyle dosya listesinden AYRI
 * tutulmasi icin kendi depolama anahtariyla. */
export async function getRecentMusic(): Promise<RecentFileEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as RecentFileEntry[]) : [];
  } catch {
    return [];
  }
}

export async function addRecentMusic(asset: PickedFileAsset): Promise<RecentFileEntry[]> {
  const existing = await getRecentMusic();
  const next = [{ ...asset, pickedAt: Date.now() }, ...existing.filter((f) => f.uri !== asset.uri)].slice(0, MAX_ENTRIES);
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // yoksay - yerel onbellek, kritik degil
  }
  return next;
}
