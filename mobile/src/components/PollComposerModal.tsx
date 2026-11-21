import React, { useEffect, useState } from "react";
import { Modal, View, Text, TextInput, Image, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { CircleArrowDown, Plus, Camera } from "lucide-react-native";
import * as ImagePicker from "expo-image-picker";
import { showAlert } from "./CustomAlert";

interface Props {
  visible: boolean;
  // Secenek fotograflari yuklenirken true - geri/gonder butonlarini
  // kilitler (bkz. DMScreen.tsx sendPoll - FilePreviewModal'daki
  // "uploading" ile AYNI mantik).
  sending?: boolean;
  onCancel: () => void;
  onSend: (question: string, options: string[], optionImages: (string | null)[]) => void;
}

const MAX_OPTIONS = 10;
const TEXT = "#F5F0E6";
const MUTED = "#9A8F80";

/** "Anket" ek menusunden acilan ekran - ust bar Konum/Dosya Gönder ile AYNI
 * (geri ok sol ustte, gonder oku sag ustte - en az 2 dolu secenek + soru
 * yazilinca aktif olur); altindaki soru/secenek kutulari ise kullanicinin
 * "gönderi oluşturma ekranındaki anket ekranıyla aynı olsa" istegiyle
 * UserProfileScreen.tsx'teki gonderi anketi (pollQuestionInput/
 * pollOptionInput/pollOptionImageButton/pollAddOptionButton) ile BIREBIR
 * AYNI gorunumde. Soru + en az 2 (en fazla 10) secenek yazilir, "Seçenek
 * Ekle" ile yeni satir eklenir, bir secenegin "×" ikonuna basinca (en az 2
 * kalacak sekilde) kaldirilir.
 *
 * Kullanici: "Ama o ankette fotoğraf ekleme özelliğide vardı" - gonderi
 * anketindeki (composerPollOptionImages) ile AYNI sekilde her secenegin
 * KENDI (opsiyonel) fotografi olabilir - kutucuga basinca Fotoğraf Çek/Seç
 * secenekleri sunan bir uyari (bkz. showAlert) acilir. */
export default function PollComposerModal({ visible, sending = false, onCancel, onSend }: Props) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [images, setImages] = useState<(string | null)[]>([null, null]);

  useEffect(() => {
    if (!visible) {
      setQuestion("");
      setOptions(["", ""]);
      setImages([null, null]);
    }
  }, [visible]);

  const entries = options.map((o, i) => ({ text: o.trim(), image: images[i] ?? null })).filter((e) => e.text.length > 0);
  const filledOptions = entries.map((e) => e.text);
  const filledImages = entries.map((e) => e.image);
  const canSend = !sending && question.trim().length > 0 && filledOptions.length >= 2;

  function changeOption(index: number, text: string) {
    setOptions((prev) => prev.map((o, i) => (i === index ? text : o)));
  }
  function addOption() {
    if (options.length >= MAX_OPTIONS) return;
    setOptions((prev) => [...prev, ""]);
    setImages((prev) => [...prev, null]);
  }
  function removeOption(index: number) {
    if (options.length <= 2) return;
    setOptions((prev) => prev.filter((_, i) => i !== index));
    setImages((prev) => prev.filter((_, i) => i !== index));
  }
  function setOptionImage(index: number, uri: string | null) {
    setImages((prev) => prev.map((u, i) => (i === index ? uri : u)));
  }
  async function takePhoto(index: number) {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      showAlert(t("dm.permissionRequiredTitle"), t("dm.cameraPermissionRequiredBody"));
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.8 });
    if (result.canceled || !result.assets?.[0]) return;
    setOptionImage(index, result.assets[0].uri);
  }
  async function pickFromGallery(index: number) {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      showAlert(t("dm.permissionRequiredTitle"), t("dm.permissionRequiredBody"));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8 });
    if (result.canceled || !result.assets?.[0]) return;
    setOptionImage(index, result.assets[0].uri);
  }
  function pickOptionImage(index: number) {
    showAlert(t("dm.pollOptionImageTitle"), undefined, [
      { text: t("userProfile.takePhoto"), onPress: () => takePhoto(index) },
      { text: t("userProfile.bannerPhotoPick"), onPress: () => pickFromGallery(index) },
      { text: t("common.cancel"), style: "cancel" },
    ]);
  }
  function handleSend() {
    if (!canSend) return;
    onSend(question.trim(), filledOptions, filledImages);
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCancel} statusBarTranslucent>
      <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={[styles.header, { paddingTop: insets.top + 40 }]}>
          <TouchableOpacity style={styles.headerBtn} onPress={onCancel} disabled={sending} hitSlop={10}>
            <View style={{ transform: [{ rotate: "90deg" }] }}>
              <CircleArrowDown size={22} color="#FFFFFF" />
            </View>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t("dm.pollComposerTitle")}</Text>
          <TouchableOpacity style={styles.headerBtn} onPress={handleSend} disabled={!canSend} hitSlop={10}>
            <View style={{ transform: [{ rotate: "180deg" }] }}>
              <CircleArrowDown size={22} color={canSend ? "#FFFFFF" : "rgba(255,255,255,0.4)"} />
            </View>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.body} contentContainerStyle={{ paddingBottom: insets.bottom + 24 }} keyboardShouldPersistTaps="handled">
          <TextInput
            style={styles.questionInput}
            value={question}
            onChangeText={setQuestion}
            placeholder={t("dm.pollQuestionPlaceholder")}
            placeholderTextColor={MUTED}
            multiline
            maxLength={300}
          />

          {options.map((opt, i) => (
            <View key={i} style={styles.optionRow}>
              <TouchableOpacity onPress={() => pickOptionImage(i)} style={styles.optionImageButton} activeOpacity={0.8}>
                {images[i] ? (
                  <>
                    <Image source={{ uri: images[i]! }} style={styles.optionImage} />
                    <TouchableOpacity style={styles.optionImageRemove} onPress={() => setOptionImage(i, null)} hitSlop={8}>
                      <Text style={styles.removeBtnTextSmall}>×</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <Camera size={16} color={MUTED} />
                )}
              </TouchableOpacity>
              <TextInput
                style={styles.optionInput}
                value={opt}
                onChangeText={(text) => changeOption(i, text)}
                placeholder={t("dm.pollOptionPlaceholder", { number: i + 1 })}
                placeholderTextColor={MUTED}
                maxLength={100}
              />
              {options.length > 2 && (
                <TouchableOpacity style={styles.removeBtn} onPress={() => removeOption(i)} hitSlop={8}>
                  <Text style={styles.removeBtnText}>×</Text>
                </TouchableOpacity>
              )}
            </View>
          ))}

          {options.length < MAX_OPTIONS && (
            <TouchableOpacity style={styles.addOptionBtn} onPress={addOption} activeOpacity={0.8}>
              <Plus size={16} color="#FFFFFF" />
              <Text style={styles.addOptionText}>{t("dm.pollAddOption")}</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
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
  body: { flex: 1, paddingHorizontal: 16 },
  questionInput: {
    color: TEXT,
    fontSize: 15,
    fontWeight: "600",
    backgroundColor: "#0A0F14",
    borderWidth: 1,
    borderColor: "#FFFFFF",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 16,
    marginBottom: 14,
    outlineWidth: 0,
    outlineStyle: "none",
  } as any,
  optionRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  optionImageButton: {
    width: 52,
    height: 52,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#404040",
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    overflow: "visible",
  },
  optionImage: { width: 52, height: 52, borderRadius: 10 },
  optionImageRemove: {
    position: "absolute",
    top: -4,
    right: -4,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#000000",
    borderWidth: 1,
    borderColor: "#404040",
    alignItems: "center",
    justifyContent: "center",
  },
  removeBtnTextSmall: { color: TEXT, fontSize: 10, lineHeight: 11, fontWeight: "700" },
  optionInput: {
    flex: 1,
    color: TEXT,
    fontSize: 14,
    fontWeight: "600",
    backgroundColor: "#0A0F14",
    borderWidth: 1,
    borderColor: "#FFFFFF",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    outlineWidth: 0,
    outlineStyle: "none",
  } as any,
  removeBtn: { width: 24, height: 24, alignItems: "center", justifyContent: "center" },
  removeBtnText: { color: TEXT, fontSize: 13, lineHeight: 14, fontWeight: "700" },
  addOptionBtn: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", marginTop: 2, marginBottom: 18 },
  addOptionText: { color: "#FFFFFF", fontSize: 13, fontWeight: "700" },
});
