import React, { useState } from "react";
import { Modal, View, Text, TextInput, TouchableOpacity, FlatList, KeyboardAvoidingView, Platform, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { CircleArrowDown, HardDrive, FaceGrinning, Send } from "lucide-react-native";
import { fileIconFor, formatFileSize } from "../utils/format";
import type { PickedFileAsset, RecentFileEntry } from "../utils/recentFiles";

const EMOJI_QUICK = ["😀", "😂", "😍", "😎", "🥳", "😢", "😮", "🔥", "❤️", "👍", "🙏", "🎉", "😡", "😴", "🤔", "👀"];

interface Props {
  visible: boolean;
  // "Müzik" ek menusu de (sadece ses secimi filtreli, kendi Son Müzikler
  // listesiyle) AYNI onizleme+liste ekranini paylasir - verilmezse
  // varsayilan "Dosya Gönder"/"Son Dosyalar"/"N dosya seçildi" kalir.
  title?: string;
  recentSectionLabel?: string;
  selectedCountLabel?: string;
  files: PickedFileAsset[];
  caption: string;
  onChangeCaption: (text: string) => void;
  uploading: boolean;
  uploadProgress: number;
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
 * acikken normal dokunus da isaretler/kaldirir).
 *
 * Kullanici: "Hiç çoklu seçim dosyasını buraya yönlendirmeseydik direk
 * yolluyordu ne güzel" - secim modunda gonder okuna basinca secili
 * dosyalar bu onizleme ekranina HIC UGRAMADAN dogrudan yuklenip
 * gonderilir (bkz. DMScreen.tsx sendFilesDirect). Bu ekran SADECE tek
 * dosyalik akis (Son Dosyalar'a tek dokunus / Dahili Depolama) icin.
 *
 * Kullanici: "Müzik için müzik seçme ekranıda yapalım aynı dosya ekranı
 * gibi çalışsın" - "Müzik" ek menusu de AYNI bu bileseni, SADECE kendi
 * (ses dosyalarina ozel) "Son Müzikler" listesi + "dm:sendMusic"
 * gonderimiyle kullanir (bkz. DMScreen.tsx openMusicPicker/pickMusicFile/
 * recentMusic.ts) - title/recentSectionLabel/selectedCountLabel bunun
 * icin Dosya'nin varsayilanlarini override eder. */
export default function FilePreviewModal({
  visible,
  title,
  recentSectionLabel,
  selectedCountLabel,
  files,
  caption,
  onChangeCaption,
  uploading,
  uploadProgress,
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
  const [emojiOpen, setEmojiOpen] = useState(false);
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
      <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={[styles.header, { paddingTop: insets.top + 40 }]}>
          <TouchableOpacity style={styles.headerBtn} onPress={handleBack} disabled={uploading} hitSlop={10}>
            <View style={{ transform: [{ rotate: "90deg" }] }}>
              <CircleArrowDown size={22} color="#FFFFFF" />
            </View>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>
            {selectionMode && !hasFiles
              ? selectedCountLabel ?? t("dm.fileSelectedCount", { count: selectedUris.length })
              : title ?? t("dm.filePreviewTitle")}
          </Text>
          {hasFiles ? (
            <View style={styles.headerBtn} />
          ) : (
            <TouchableOpacity style={styles.headerBtn} onPress={handleHeaderSend} disabled={!headerSendActive} hitSlop={10}>
              <View style={{ transform: [{ rotate: "180deg" }] }}>
                <CircleArrowDown size={22} color={headerSendActive ? "#FFFFFF" : "rgba(255,255,255,0.4)"} />
              </View>
            </TouchableOpacity>
          )}
        </View>

        {hasFiles && single ? (
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
        ) : null}

        {hasFiles && single && !uploading && (
          <View>
            {emojiOpen && (
              <View style={styles.emojiGrid}>
                {EMOJI_QUICK.map((e) => (
                  <TouchableOpacity key={e} style={styles.emojiCell} onPress={() => onChangeCaption(caption + e)} hitSlop={4}>
                    <Text style={styles.emojiChar}>{e}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            <View style={[styles.composerRow, { paddingBottom: insets.bottom + 12 }]}>
              <View style={styles.captionBox}>
                <TouchableOpacity onPress={() => setEmojiOpen((v) => !v)} hitSlop={6}>
                  <FaceGrinning size={22} color="#9A8F80" />
                </TouchableOpacity>
                <TextInput
                  style={styles.captionInput}
                  value={caption}
                  onChangeText={onChangeCaption}
                  placeholder={t("dm.fileCaptionPlaceholder")}
                  placeholderTextColor="#9A8F80"
                  maxLength={1000}
                />
              </View>
              <TouchableOpacity style={styles.sendCircle} onPress={onSend} hitSlop={6}>
                <Send size={20} color="#141210" />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {!(hasFiles && single) && (
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
                <Text style={styles.sectionLabel}>{recentSectionLabel ?? t("dm.fileRecentSection")}</Text>
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
                        {selectionMode && <View style={[styles.selectBadge, selected && styles.selectBadgeActive]} />}
                      </TouchableOpacity>
                    );
                  }}
                />
              </>
            )}
          </View>
        )}
      </KeyboardAvoidingView>
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
  composerRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingTop: 8 },
  captionBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#1E2A36",
    borderRadius: 27.5,
    height: 55,
    paddingLeft: 14,
    paddingRight: 10,
  },
  captionInput: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 14,
    paddingTop: 7,
    paddingBottom: 6,
    outlineWidth: 0,
    outlineStyle: "none",
  } as any,
  emojiGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 6,
  },
  emojiCell: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  emojiChar: { fontSize: 22 },
  sendCircle: { width: 55, height: 55, borderRadius: 27.5, alignItems: "center", justifyContent: "center", backgroundColor: "#FFFFFF" },
  progressWrap: { width: "100%", marginTop: 28, alignItems: "center", gap: 8 },
  progressTrack: { width: "100%", height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.12)", overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: "#0EA5E9", borderRadius: 3 },
  progressText: { color: "rgba(255,255,255,0.7)", fontSize: 12, fontWeight: "600" },
});
