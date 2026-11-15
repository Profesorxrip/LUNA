import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "watched_media_urls";

// blankPlaylist.ts'teki "su an kuyrukta" listesinin TAM TERSI - burada bir
// video dogal olarak bitince (bkz. RoomScreen.tsx room.poll gecisi) eklenen
// url'ler tutulur, MediaPickerSheet.tsx'teki Dizi/Film playlist'i bu
// listedeki url'leri GOSTERMEZ (izlenen bir video "izlenecekler" listesinden
// dustugu icin). Cihaz bazli, sunucuya YAZILMAZ.
export async function getWatchedMediaUrls(): Promise<Set<string>> {
  const stored = await AsyncStorage.getItem(STORAGE_KEY);
  if (!stored) return new Set();
  try {
    return new Set(JSON.parse(stored));
  } catch {
    return new Set();
  }
}

export async function markMediaWatched(url: string): Promise<Set<string>> {
  const urls = await getWatchedMediaUrls();
  urls.add(url);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(urls)));
  return urls;
}

// Dizi/Film playlist'inin "Sifirla" secenegi - izlenip dustugu icin
// gorunmeyen tum videolari geri getirir.
export async function clearWatchedMedia(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
}
