import React, { useEffect, useState } from "react";
import { Modal, View, Text, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { CircleArrowDown, Plus, X } from "lucide-react-native";

interface Props {
  visible: boolean;
  onCancel: () => void;
  onSend: (question: string, options: string[]) => void;
}

const MAX_OPTIONS = 10;

/** "Anket" ek menusunden acilan ekran - Konum/Dosya Gönder ile AYNI tam
 * ekranli, lacivert temali, ayni baslik dilini (geri ok sol ustte, gonder
 * oku sag ustte - en az 2 dolu secenek + soru yazilinca aktif olur)
 * paylasan bir sayfa. Soru + en az 2 (en fazla 10) secenek yazilir, "Seçenek
 * Ekle" ile yeni satir eklenir, bir secenegin "x" ikonuna basinca (en az 2
 * kalacak sekilde) kaldirilir. */
export default function PollComposerModal({ visible, onCancel, onSend }: Props) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);

  useEffect(() => {
    if (!visible) {
      setQuestion("");
      setOptions(["", ""]);
    }
  }, [visible]);

  const filledOptions = options.map((o) => o.trim()).filter(Boolean);
  const canSend = question.trim().length > 0 && filledOptions.length >= 2;

  function changeOption(index: number, text: string) {
    setOptions((prev) => prev.map((o, i) => (i === index ? text : o)));
  }
  function addOption() {
    if (options.length >= MAX_OPTIONS) return;
    setOptions((prev) => [...prev, ""]);
  }
  function removeOption(index: number) {
    if (options.length <= 2) return;
    setOptions((prev) => prev.filter((_, i) => i !== index));
  }
  function handleSend() {
    if (!canSend) return;
    onSend(question.trim(), filledOptions);
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCancel} statusBarTranslucent>
      <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={[styles.header, { paddingTop: insets.top + 40 }]}>
          <TouchableOpacity style={styles.headerBtn} onPress={onCancel} hitSlop={10}>
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
            placeholderTextColor="rgba(255,255,255,0.4)"
            multiline
            maxLength={300}
          />

          <Text style={styles.sectionLabel}>{t("dm.pollOptionsLabel")}</Text>
          {options.map((opt, i) => (
            <View key={i} style={styles.optionRow}>
              <TextInput
                style={styles.optionInput}
                value={opt}
                onChangeText={(text) => changeOption(i, text)}
                placeholder={t("dm.pollOptionPlaceholder", { number: i + 1 })}
                placeholderTextColor="rgba(255,255,255,0.4)"
                maxLength={100}
              />
              {options.length > 2 && (
                <TouchableOpacity style={styles.removeBtn} onPress={() => removeOption(i)} hitSlop={8}>
                  <X size={16} color="rgba(255,255,255,0.6)" />
                </TouchableOpacity>
              )}
            </View>
          ))}

          {options.length < MAX_OPTIONS && (
            <TouchableOpacity style={styles.addOptionBtn} onPress={addOption} activeOpacity={0.8}>
              <Plus size={16} color="#0EA5E9" />
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
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
    backgroundColor: "#1E2A36",
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 70,
    marginTop: 16,
    outlineWidth: 0,
    outlineStyle: "none",
  } as any,
  sectionLabel: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 24,
    marginBottom: 10,
  },
  optionRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  optionInput: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 14,
    backgroundColor: "#1E2A36",
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    outlineWidth: 0,
    outlineStyle: "none",
  } as any,
  removeBtn: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  addOptionBtn: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10 },
  addOptionText: { color: "#0EA5E9", fontSize: 14, fontWeight: "700" },
});
