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
  return new File(uri).arrayBuffer();
}
