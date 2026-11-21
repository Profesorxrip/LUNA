import React from "react";
import { Modal, View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { CircleArrowDown } from "lucide-react-native";
import { fileIconFor, formatFileSize } from "../utils/format";

interface Props {
  visible: boolean;
  fileName: string;
  fileSize?: number | null;
  mimeType?: string | null;
  uploading: boolean;
  uploadProgress: number;
  onCancel: () => void;
  onSend: () => void;
}

/** "Dosya" secilince GOSTERILEN onay ekrani - Galeriden Sec/Konum Gonder
 * ile AYNI tam ekranli, lacivert temali, ayni baslik dilini (geri ok sol
 * ustte, gonder oku sag ustte) paylasan bir sayfa. Eskiden dosya secilir
 * secilmez ONIZLEMESIZ dogrudan gonderiliyordu - kullanici adini/boyutunu
 * gormeden "Gönder"e basmis oluyordu, simdi once burada goruyor. */
export default function FilePreviewModal({
  visible,
  fileName,
  fileSize,
  mimeType,
  uploading,
  uploadProgress,
  onCancel,
  onSend,
}: Props) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const Icon = fileIconFor(mimeType, fileName);
  const ext = fileName.split(".").pop()?.toUpperCase() || "";

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCancel} statusBarTranslucent>
      <View style={styles.screen}>
        <View style={[styles.header, { paddingTop: insets.top + 40 }]}>
          <TouchableOpacity style={styles.headerBtn} onPress={onCancel} disabled={uploading} hitSlop={10}>
            <View style={{ transform: [{ rotate: "90deg" }] }}>
              <CircleArrowDown size={22} color="#FFFFFF" />
            </View>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t("dm.filePreviewTitle")}</Text>
          <TouchableOpacity style={styles.headerBtn} onPress={onSend} disabled={uploading} hitSlop={10}>
            <View style={{ transform: [{ rotate: "180deg" }] }}>
              <CircleArrowDown size={22} color={uploading ? "rgba(255,255,255,0.4)" : "#FFFFFF"} />
            </View>
          </TouchableOpacity>
        </View>

        <View style={styles.body}>
          <View style={styles.iconWrap}>
            <Icon size={44} color="#FFFFFF" />
          </View>
          <Text style={styles.fileName} numberOfLines={3}>
            {fileName}
          </Text>
          <Text style={styles.fileMeta}>
            {[ext, formatFileSize(fileSize)].filter(Boolean).join(" · ")}
          </Text>

          {uploading && (
            <View style={styles.progressWrap}>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${uploadProgress}%` }]} />
              </View>
              <Text style={styles.progressText}>{uploadProgress}%</Text>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#15202B" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  headerBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  headerTitle: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  body: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 40 },
  iconWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: "rgba(14,165,233,0.18)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  fileName: { color: "#FFFFFF", fontSize: 17, fontWeight: "700", textAlign: "center" },
  fileMeta: { color: "rgba(255,255,255,0.55)", fontSize: 13, marginTop: 6 },
  progressWrap: { width: "100%", marginTop: 28, alignItems: "center", gap: 8 },
  progressTrack: { width: "100%", height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.12)", overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: "#0EA5E9", borderRadius: 3 },
  progressText: { color: "rgba(255,255,255,0.7)", fontSize: 12, fontWeight: "600" },
});
