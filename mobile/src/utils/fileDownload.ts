import { Platform } from "react-native";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";

/** Genel bir dosyayi (pdf/zip/vb.) cihaza indirir - native'de expo-sharing
 * ile "Paylaş/Kaydet" sayfasını açar, web'de doğrudan yeni sekmede açar.
 * FileMessageBubble (sohbet balonu) ve DmInfoScreen'deki "Dosyalar"
 * satırı AYNI fonksiyonu kullanır. */
export async function downloadOrShareFile(uri: string, mimeType?: string | null): Promise<void> {
  if (Platform.OS === "web") {
    window.open(uri, "_blank");
    return;
  }
  const downloaded = await File.downloadFileAsync(uri, Paths.cache);
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(downloaded.uri, { mimeType: mimeType || undefined });
  }
}
