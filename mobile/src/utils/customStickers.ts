import AsyncStorage from "@react-native-async-storage/async-storage";

export interface CustomSticker {
  id: string;
  // Yuklendigi anda chat-media bucket'indan donen GERCEK public URL -
  // bkz. 0046_dm_custom_stickers.sql. Bundle edilmis hazir paketlerin
  // aksine (bkz. stickerPacks.ts) kullanicinin "Çıkartma oluştur" ile
  // kendi yukledigi gorseldir, bu yuzden karsi taraf da gorebilsin diye
  // yerel bir dosya yolu DEGIL, uzak bir URL tasir.
  url: string;
}

const STORAGE_KEY = "luna:customStickers";

/** "Çıkartma oluştur" ile eklenen kisisel cikartmalar - recentFiles.ts/
 * recentMusic.ts ile AYNI AsyncStorage deseni, cihaza ozel/yerel liste. */
export async function getCustomStickers(): Promise<CustomSticker[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as CustomSticker[]) : [];
  } catch {
    return [];
  }
}

export async function addCustomSticker(url: string): Promise<CustomSticker[]> {
  const existing = await getCustomStickers();
  const next = [{ id: `custom-${Date.now()}`, url }, ...existing];
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // yoksay - yerel onbellek, kritik degil
  }
  return next;
}
