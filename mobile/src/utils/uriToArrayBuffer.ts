import { Platform } from "react-native";
import { File } from "expo-file-system";

/** Galeriden secilen bir fotografi (expo-image-picker URI'si) Supabase
 * Storage'a yuklemeden once ArrayBuffer'a cevirir.
 *
 * RN'nin fetch() polyfill'i yerel (file://) URI'leri NATIVE'de (ozellikle
 * bazi Android cihazlarda) SESSIZCE eksik/bozuk veri dondurebiliyor -
 * upload HATASIZ "basariyla" tamamlanip Supabase'e gecersiz/0 byte'lik bir
 * dosya yaziyordu, bu yuzden galeri/sohbet/profil fotograflari hicbir
 * yerde ACILAMIYORDU (kullanici bildirdi, URL'i acinca kirik resim ikonu
 * cikiyordu). Native'de bunun yerine expo-file-system'in GERCEK dosya
 * sisteminden okuyan File.arrayBuffer()'ini kullaniyoruz - web'de
 * expo-file-system desteklenmedigi icin (ve web'de bu sorun zaten yok,
 * blob URL'leri fetch ile guvenilir okunuyor) eski fetch yontemi kaliyor.
 */
export async function uriToArrayBuffer(uri: string): Promise<ArrayBuffer> {
  if (Platform.OS === "web") {
    const res = await fetch(uri);
    return res.arrayBuffer();
  }
  // GEÇİCİ TEŞHİS - gercek cihazlarda yuklenen fotograflarin 14 byte gibi
  // anlamsiz kucuk boyutlarda gitmesi sorununu izlemek icin. Hem yeni
  // (File.arrayBuffer) hem eski (fetch) yontemin sonuclarini kiyasliyoruz.
  console.log("[FOTO-TESHIS] uri:", uri);
  try {
    const file = new File(uri);
    console.log("[FOTO-TESHIS] File.exists:", file.exists, "File.size:", file.size);
    const buf = await file.arrayBuffer();
    console.log("[FOTO-TESHIS] File.arrayBuffer() byteLength:", buf.byteLength);
    if (buf.byteLength > 1000) return buf;
    console.log("[FOTO-TESHIS] File.arrayBuffer() COK KUCUK, fetch ile deneniyor...");
  } catch (err) {
    console.log("[FOTO-TESHIS] File.arrayBuffer() HATA:", err);
  }
  try {
    const res = await fetch(uri);
    const buf = await res.arrayBuffer();
    console.log("[FOTO-TESHIS] fetch(uri).arrayBuffer() byteLength:", buf.byteLength);
    return buf;
  } catch (err) {
    console.log("[FOTO-TESHIS] fetch(uri) HATA:", err);
    throw err;
  }
}
