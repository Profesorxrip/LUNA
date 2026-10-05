import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "hide_location";

let cached: boolean | null = null;

/** Ayarlar ekranindaki "Konumu Gizle" - cihaz bazli bir tercih oldugu icin
 * AsyncStorage'da tutuluyor. Acikken (varsayilan) RoomScreen'deki
 * "Haritayi Goster" hicbir zaman GPS konumu istemez/gondermez - kapatirsa
 * (Kapali secilirse) oda haritasini actiginda gercek konumu digerlerine
 * gosterilir (bkz. RoomScreen.tsx showMap). */
export async function isHideLocationEnabled(): Promise<boolean> {
  if (cached !== null) return cached;
  const stored = await AsyncStorage.getItem(STORAGE_KEY);
  // Varsayilan ACIK (gizli) - kullanici bilincli olarak kapatmadikca konumu
  // hic paylasilmaz.
  cached = stored === null ? true : stored === "1";
  return cached;
}

export async function setHideLocationEnabled(enabled: boolean): Promise<void> {
  cached = enabled;
  await AsyncStorage.setItem(STORAGE_KEY, enabled ? "1" : "0");
}
