import React from "react";
import { Modal, View, Text, TouchableOpacity, FlatList, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { CircleArrowDown, HardDrive, Check } from "lucide-react-native";
import { fileIconFor, formatFileSize } from "../utils/format";
import type { PickedFileAsset, RecentFileEntry } from "../utils/recentFiles";

interface Props {
  visible: boolean;
  files: PickedFileAsset[];
  uploading: boolean;
  uploadProgress: number;
  uploadIndex: number;
  recentFiles: RecentFileEntry[];
  selectionMode: boolean;
  selectedUris: string[];
  onPressRecent: (file: RecentFileEntry) => void;
  onLongPressRecent: (file: RecentFileEntry) => void;
  onExitSelection: () => void;
  onConfirmSelection: () => void;
  onPickFile: () => void;
  onBackToList: () => void;
  onCancel: () => void;
  onSend: () => void;
}

/** "Dosya" secilince GOSTERILEN ekran - Galeriden Sec/Konum Gonder ile
 * AYNI tam ekranli, lacivert temali, ayni baslik dilini (geri ok sol
 * ustte, gonder oku sag ustte) paylasan bir sayfa.
 *
 * Kullanici: "dosyalarımız gözüksün altalta birde dahili depolama tuşu
 * olsun" - henuz dosya secilmemisse (1) "Dahili Depolama" butonu -
 * cihazin GERCEK sistem dosya tarayicisini acar, (2) altinda bu
 * cihazda DAHA ONCE secilmis dosyalarin listesi (Son Dosyalar).
 *
 * Kullanici: "Basılı tutunca seçsin galerideki gibi... toplu
 * yollayabilelim" - GalleryPickerModal ile AYNI desen: Son Dosyalar
 * satirina TEK dokunus o dosyayi DOGRUDAN onizlemeye gotursun, UZUN
 * basis coklu SECIM modunu acip o satiri isaretler (secim modu
 * acikken normal dokunus da isaretler/kaldirir). Secili dosyalar
 * basliktaki gonder okuyla onizlemeye tasinir, oradan topluca
 * gonderilir. */
export default function FilePreviewModal({
  visible,
  files,
  uploading,
  uploadProgress,
  uploadIndex,
  recentFiles,
  selectionMode,
  selectedUris,
  onPressRecent,
  onLongPressRecent,
  onExitSelection,
  onConfirmSelection,
  onPickFile,
  onBackToList,
  onCancel,
  onSend,
}: Props) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const hasFiles = files.length > 0;
  const single = files.length === 1 ? files[0] : null;
  const SingleIcon = single ? fileIconFor(single.mimeType, single.name) : null;
  const singleExt = single ? single.name.split(".").pop()?.toUpperCase() || "" : "";
  const canConfirmSelection = selectionMode && selectedUris.length > 0;

  function handleBack() {
    if (hasFiles) onBackToList();
    else if (selectionMode) onExitSelection();
    else onCancel();
  }

  function handleHeaderSend() {
    if (hasFiles) onSend();
    else if (canConfirmSelection) onConfirmSelection();
  }

  const headerSendActive = !uploading && (hasFiles || canConfirmSelection);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleBack} statusBarTranslucent>
      <View style={styles.screen}>
        <View style={[styles.header, { paddingTop: insets.top + 40 }]}>
          <TouchableOpacity style={styles.headerBtn} onPress={handleBack} disabled={uploading} hitSlop={10}>
            <View style={{ transform: [{ rotate: "90deg" }] }}>
              <CircleArrowDown size={22} color="#FFFFFF" />
            </View>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>
            {selectionMode && !hasFiles ? t("dm.fileSelectedCount", { count: selectedUris.length }) : t("dm.filePreviewTitle")}
          </Text>
          <TouchableOpacity style={styles.headerBtn} onPress={handleHeaderSend} disabled={!headerSendActive} hitSlop={10}>
            <View style={{ transform: [{ rotate: "180deg" }] }}>
              <CircleArrowDown size={22} color={headerSendActive ? "#FFFFFF" : "rgba(255,255,255,0.4)"} />
            </View>
          </TouchableOpacity>
        </View>

        {hasFiles ? (
          single ? (
            <View style={styles.body}>
              <View style={styles.iconWrap}>{SingleIcon && <SingleIcon size={44} color="#FFFFFF" />}</View>
              <Text style={styles.fileName} numberOfLines={3}>
                {single.name}
              </Text>
              <Text style={styles.fileMeta}>{[singleExt, formatFileSize(single.size)].filter(Boolean).join(" · ")}</Text>

              {uploading && (
                <View style={styles.progressWrap}>
                  <View style={styles.progressTrack}>
                    <View style={[styles.progressFill, { width: `${uploadProgress}%` }]} />
                  </View>
                  <Text style={styles.progressText}>{uploadProgress}%</Text>
                </View>
              )}
            </View>
          ) : (
            <View style={styles.listScreen}>
              <Text style={styles.sectionLabel}>{t("dm.fileSelectedCount", { count: files.length })}</Text>
              <FlatList
                data={files}
                keyExtractor={(item) => item.uri}
                contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
                renderItem={({ item }) => {
                  const RowIcon = fileIconFor(item.mimeType, item.name);
                  const rowExt = item.name.split(".").pop()?.toUpperCase() || "";
                  return (
                    <View style={styles.recentRow}>
                      <View style={styles.recentIconWrap}>
                        <RowIcon size={18} color="#FFFFFF" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.recentName} numberOfLines={1}>
                          {item.name}
                        </Text>
                        <Text style={styles.recentMeta}>{[rowExt, formatFileSize(item.size)].filter(Boolean).join(" · ")}</Text>
                      </View>
                    </View>
                  );
                }}
              />
              {uploading && (
                <View style={styles.progressWrap}>
                  <View style={styles.progressTrack}>
                    <View style={[styles.progressFill, { width: `${uploadProgress}%` }]} />
                  </View>
                  <Text style={styles.progressText}>
                    {uploadIndex}/{files.length} · {uploadProgress}%
                  </Text>
                </View>
              )}
            </View>
          )
        ) : (
          <View style={styles.listScreen}>
            {!selectionMode && (
              <TouchableOpacity style={styles.storageBtn} onPress={onPickFile} activeOpacity={0.85}>
                <View style={styles.storageIconWrap}>
                  <HardDrive size={20} color="#FFFFFF" />
                </View>
                <Text style={styles.storageBtnText}>{t("dm.fileInternalStorage")}</Text>
              </TouchableOpacity>
            )}

            {recentFiles.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>{t("dm.fileRecentSection")}</Text>
                <FlatList
                  data={recentFiles}
                  keyExtractor={(item) => item.uri}
                  contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
                  renderItem={({ item }) => {
                    const RowIcon = fileIconFor(item.mimeType, item.name);
                    const rowExt = item.name.split(".").pop()?.toUpperCase() || "";
                    const selected = selectedUris.includes(item.uri);
                    return (
                      <TouchableOpacity
                        style={styles.recentRow}
                        onPress={() => onPressRecent(item)}
                        onLongPress={() => onLongPressRecent(item)}
                        delayLongPress={350}
                      >
                        <View style={styles.recentIconWrap}>
                          <RowIcon size={18} color="#FFFFFF" />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.recentName} numberOfLines={1}>
                            {item.name}
                          </Text>
                          <Text style={styles.recentMeta}>{[rowExt, formatFileSize(item.size)].filter(Boolean).join(" · ")}</Text>
                        </View>
                        {selectionMode && (
                          <View style={[styles.selectBadge, selected && styles.selectBadgeActive]}>
                            {selected && <Check size={13} color="#000000" strokeWidth={3} />}
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  }}
                />
              </>
            )}
          </View>
        )}
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

  listScreen: { flex: 1, paddingHorizontal: 16 },
  storageBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: "rgba(14,165,233,0.14)",
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 20,
  },
  storageIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#0EA5E9",
    alignItems: "center",
    justifyContent: "center",
  },
  storageBtnText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
  sectionLabel: { color: "rgba(255,255,255,0.5)", fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 },
  recentRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
  recentIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  recentName: { color: "#FFFFFF", fontSize: 14, fontWeight: "600" },
  recentMeta: { color: "rgba(255,255,255,0.5)", fontSize: 12, marginTop: 2 },
  selectBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.25)",
  },
  selectBadgeActive: { backgroundColor: "#FFFFFF", borderColor: "#FFFFFF" },

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
