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

const FILE_COLOR = "#22C55E";

/** Sohbette gelen/giden genel dosya (pdf/zip/vb.) balonu - dokununca
 * cihaza indirip (native: expo-sharing ile "Paylas/Kaydet" sayfasini acar,
 * web: dogrudan yeni sekmede acar) kullaniciya birakir. Ikon kutusunun
 * kosesindeki rozet dosya uzantisini gosterir (orn. "PDF"). */
export default function FileMessageBubble({ uri, fileName, fileSize, mimeType }: Props) {
  const [downloading, setDownloading] = useState(false);
  const Icon = fileIconFor(mimeType, fileName);
  const dotIndex = fileName.lastIndexOf(".");
  const ext = dotIndex > -1 ? fileName.slice(dotIndex + 1, dotIndex + 5).toUpperCase() : "";

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
    <TouchableOpacity style={styles.card} activeOpacity={0.8} onPress={handlePress} disabled={downloading}>
      <View style={styles.iconWrap}>
        {downloading ? (
          <ActivityIndicator size="small" color={FILE_COLOR} />
        ) : (
          <>
            <Icon size={20} color={FILE_COLOR} />
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
      <Download size={16} color="rgba(255,255,255,0.6)" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minWidth: 205,
    maxWidth: 240,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 10,
    padding: 9,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: "rgba(34,197,94,0.18)",
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
  extBadgeText: { color: "#0F172A", fontSize: 7, fontWeight: "800" },
  textCol: { flex: 1, minWidth: 0 },
  name: { color: "#FFFFFF", fontSize: 13, fontWeight: "700" },
  size: { color: "rgba(255,255,255,0.75)", fontSize: 11, marginTop: 1 },
});
