import AsyncStorage from "@react-native-async-storage/async-storage";

export interface PickedFileAsset {
  uri: string;
  name: string;
  size?: number | null;
  mimeType?: string | null;
}

export interface RecentFileEntry extends PickedFileAsset {
  pickedAt: number;
}

const STORAGE_KEY = "luna:recentFiles";
const MAX_ENTRIES = 15;

/** "Dosya" ekranindaki "Son Dosyalar" listesi - cihazdan secilen dosyalar
 * (expo-document-picker varsayilan olarak uygulamanin ONBELLEK dizinine
 * KOPYALAYIP file:// URI'si dondurur, bu yuzden daha sonra tekrar
 * gosterilebilir) burada, cihazda (AsyncStorage) yerel olarak saklanir -
 * sunucuya gitmez, sadece BU cihazdaki hizli tekrar-secim listesidir. */
export async function getRecentFiles(): Promise<RecentFileEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as RecentFileEntry[]) : [];
  } catch {
    return [];
  }
}

export async function addRecentFile(asset: PickedFileAsset): Promise<RecentFileEntry[]> {
  const existing = await getRecentFiles();
  const next = [{ ...asset, pickedAt: Date.now() }, ...existing.filter((f) => f.uri !== asset.uri)].slice(0, MAX_ENTRIES);
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // yoksay - yerel onbellek, kritik degil
  }
  return next;
}
