import React, { useState } from "react";
import { Modal, View, Text, Image, TouchableOpacity, Switch, StyleSheet, ActivityIndicator } from "react-native";
import { theme } from "../theme";

interface Props {
  visible: boolean;
  imageUri: string | null;
  uploading: boolean;
  onCancel: () => void;
  onSend: (isAdult: boolean) => void;
}

/** Chat/DM'e fotograf gondermeden once GOSTERILEN onay ekrani - secilen
 * fotografin onizlemesi + "+18 icerik" anahtari burada. Gonderilince alici
 * tarafta isaretliyse bulanik gosterilir (bkz. ChatImageBubble.tsx). */
export default function SendMediaSheet({ visible, imageUri, uploading, onCancel, onSend }: Props) {
  const [isAdult, setIsAdult] = useState(false);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          {imageUri && <Image source={{ uri: imageUri }} style={styles.preview} resizeMode="cover" />}
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>Bu görsel +18 içerik</Text>
            <Switch
              value={isAdult}
              onValueChange={setIsAdult}
              trackColor={{ false: theme.border, true: theme.danger }}
              thumbColor="#FFFFFF"
              disabled={uploading}
            />
          </View>
          <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onCancel} disabled={uploading}>
              <Text style={styles.cancelBtnText}>Vazgeç</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.sendBtn} onPress={() => onSend(isAdult)} disabled={uploading}>
              {uploading ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Text style={styles.sendBtnText}>Gönder</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "center", alignItems: "center", padding: 24 },
  sheet: { width: "100%", maxWidth: 340, backgroundColor: "#1C1C1E", borderRadius: 16, padding: 16, gap: 14 },
  preview: { width: "100%", aspectRatio: 1, borderRadius: 12, backgroundColor: theme.surfaceAlt },
  toggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  toggleLabel: { color: theme.text, fontSize: 14, fontWeight: "600" },
  buttonRow: { flexDirection: "row", gap: 10 },
  cancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: "center", backgroundColor: theme.surfaceAlt },
  cancelBtnText: { color: theme.textMuted, fontWeight: "700" },
  sendBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: "center", backgroundColor: theme.accent },
  sendBtnText: { color: "#FFFFFF", fontWeight: "700" },
});
