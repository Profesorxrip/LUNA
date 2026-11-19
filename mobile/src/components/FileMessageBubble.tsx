import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Platform, ActivityIndicator } from "react-native";
import { FileText, Image as ImageIcon, FileArchive, File as FileIcon } from "lucide-react-native";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { showAlert } from "./CustomAlert";

interface Props {
  uri: string;
  fileName: string;
  fileSize?: number | null;
  mimeType?: string | null;
}

function formatSize(bytes?: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function iconFor(mimeType?: string | null, fileName?: string) {
  const ext = fileName?.split(".").pop()?.toLowerCase();
  if (mimeType?.startsWith("image/")) return ImageIcon;
  if (ext === "zip" || ext === "rar" || ext === "7z") return FileArchive;
  if (mimeType === "application/pdf" || ext === "pdf" || ext === "doc" || ext === "docx" || ext === "txt") return FileText;
  return FileIcon;
}

/** Sohbette gelen/giden genel dosya (pdf/zip/vb.) balonu - dokununca
 * cihaza indirip (native: expo-sharing ile "Paylas/Kaydet" sayfasini acar,
 * web: dogrudan yeni sekmede acar) kullaniciya birakir. */
export default function FileMessageBubble({ uri, fileName, fileSize, mimeType }: Props) {
  const [downloading, setDownloading] = useState(false);
  const Icon = iconFor(mimeType, fileName);

  async function handlePress() {
    if (downloading) return;
    if (Platform.OS === "web") {
      window.open(uri, "_blank");
      return;
    }
    setDownloading(true);
    try {
      const downloaded = await File.downloadFileAsync(uri, Paths.cache);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(downloaded.uri, { mimeType: mimeType || undefined });
      } else {
        showAlert("İndirildi", `Dosya indirildi: ${downloaded.uri}`);
      }
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
        {!!fileSize && <Text style={styles.size}>{formatSize(fileSize)}</Text>}
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
