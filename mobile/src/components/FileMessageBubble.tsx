import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { Download } from "lucide-react-native";
import { showAlert } from "./CustomAlert";
import { formatFileSize, fileIconFor } from "../utils/format";
import { downloadOrShareFile } from "../utils/fileDownload";

interface Props {
  uri: string;
  fileName: string;
  fileSize?: number | null;
  mimeType?: string | null;
}

const FILE_COLOR = "#F28B82";

/** Sohbette gelen/giden genel dosya (pdf/zip/vb.) balonu - dokununca
 * cihaza indirip (native: expo-sharing ile "Paylas/Kaydet" sayfasini acar,
 * web: dogrudan yeni sekmede acar) kullaniciya birakir. Ikon kutusunun
 * kosesindeki rozet dosya uzantisini gosterir (orn. "PDF"). */
export default function FileMessageBubble({ uri, fileName, fileSize, mimeType }: Props) {
  const [downloading, setDownloading] = useState(false);
  // Indirme basarili bitince kenardaki ikon TAMAMEN kalkar - ayni dosyayi
  // tekrar indirmek isteyen kullanici her yerden (karta) dokunabilir, sadece
  // o ikon bir daha gosterilmez.
  const [downloaded, setDownloaded] = useState(false);
  const Icon = fileIconFor(mimeType, fileName);
  const dotIndex = fileName.lastIndexOf(".");
  const ext = dotIndex > -1 ? fileName.slice(dotIndex + 1, dotIndex + 5).toUpperCase() : "";

  async function handlePress() {
    if (downloading) return;
    setDownloading(true);
    try {
      await downloadOrShareFile(uri, mimeType);
      setDownloaded(true);
    } catch (err: any) {
      showAlert("İndirilemedi", err?.message || "Dosya indirilirken bir hata oluştu, tekrar dene.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <TouchableOpacity style={styles.card} activeOpacity={0.8} onPress={handlePress} disabled={downloading}>
      <View style={styles.iconWrap}>
        {downloading ? (
          <ActivityIndicator size="small" color={FILE_COLOR} />
        ) : (
          <>
            <Icon size={24} color={FILE_COLOR} />
            {!!ext && (
              <View style={styles.extBadge}>
                <Text style={styles.extBadgeText}>{ext}</Text>
              </View>
            )}
          </>
        )}
      </View>
      <View style={styles.textCol}>
        <Text style={styles.name} numberOfLines={1}>
          {fileName}
        </Text>
        {!!fileSize && <Text style={styles.size}>{formatFileSize(fileSize)}</Text>}
      </View>
      {downloading ? (
        <ActivityIndicator size="small" color="rgba(255,255,255,0.75)" />
      ) : downloaded ? null : (
        <Download size={18} color="rgba(255,255,255,0.6)" />
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minWidth: 225,
    maxWidth: 260,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 8,
    padding: 12,
  },
  iconWrap: {
    width: 46,
    height: 46,
    borderRadius: 12,
    backgroundColor: "rgba(242,139,130,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  extBadge: {
    position: "absolute",
    bottom: -4,
    right: -6,
    backgroundColor: FILE_COLOR,
    borderRadius: 4,
    paddingHorizontal: 3,
    paddingVertical: 1,
  },
  extBadgeText: { color: "#3F1414", fontSize: 7, fontWeight: "800" },
  textCol: { flex: 1, minWidth: 0 },
  name: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
  size: { color: "rgba(255,255,255,0.75)", fontSize: 12, marginTop: 2 },
});
