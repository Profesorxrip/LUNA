import AsyncStorage from "@react-native-async-storage/async-storage";

export interface CustomGif {
  id: string;
  // customStickers.ts ile AYNI mantik: chat-media bucket'indan donen
  // GERCEK public URL (bkz. DMScreen createGif) - yerel degil, karsi taraf
  // da gorebilsin diye.
  url: string;
}

const STORAGE_KEY = "luna:customGifs";

/** "Kendi GIF'ini ekle" ile eklenen kisisel GIF'ler - customStickers.ts ile
 * AYNI AsyncStorage deseni, ama ayri bir anahtar/liste (cikartma ve gif
 * sekmelerinde ayri gosterilsinler diye). */
export async function getCustomGifs(): Promise<CustomGif[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as CustomGif[]) : [];
  } catch {
    return [];
  }
}

export async function addCustomGif(url: string): Promise<CustomGif[]> {
  const existing = await getCustomGifs();
  const next = [{ id: `custom-gif-${Date.now()}`, url }, ...existing];
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // yoksay - yerel onbellek, kritik degil
  }
  return next;
}
