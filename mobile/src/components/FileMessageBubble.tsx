import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { showAlert } from "./CustomAlert";
import { formatFileSize, fileIconFor } from "../utils/format";
import { downloadOrShareFile } from "../utils/fileDownload";

interface Props {
  uri: string;
  fileName: string;
  fileSize?: number | null;
  mimeType?: string | null;
}

/** Sohbette gelen/giden genel dosya (pdf/zip/vb.) balonu - dokununca
 * cihaza indirip (native: expo-sharing ile "Paylas/Kaydet" sayfasini acar,
 * web: dogrudan yeni sekmede acar) kullaniciya birakir. */
export default function FileMessageBubble({ uri, fileName, fileSize, mimeType }: Props) {
  const [downloading, setDownloading] = useState(false);
  const Icon = fileIconFor(mimeType, fileName);

  async function handlePress() {
    if (downloading) return;
    setDownloading(true);
    try {
      await downloadOrShareFile(uri, mimeType);
    } catch (err: any) {
      showAlert("İndirilemedi", err?.message || "Dosya indirilirken bir hata oluştu, tekrar dene.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <TouchableOpacity style={styles.row} activeOpacity={0.8} onPress={handlePress} disabled={downloading}>
      <View style={styles.iconWrap}>{downloading ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Icon size={18} color="#FFFFFF" />}</View>
      <View style={styles.textCol}>
        <Text style={styles.name} numberOfLines={1}>
          {fileName}
        </Text>
        {!!fileSize && <Text style={styles.size}>{formatFileSize(fileSize)}</Text>}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 10, minWidth: 180, maxWidth: 240, paddingVertical: 4 },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  textCol: { flex: 1, minWidth: 0 },
  name: { color: "#FFFFFF", fontSize: 13, fontWeight: "700" },
  size: { color: "rgba(255,255,255,0.75)", fontSize: 11, marginTop: 1 },
});
