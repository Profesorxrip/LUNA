import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Modal, Linking, Share } from "react-native";
import * as Clipboard from "expo-clipboard";
import Icon from "./Icon";
import { showAlert } from "./CustomAlert";

const ACCENT = "#0EA5E9";
const BG = "#000000";
const TEXT = "#F5F0E6";
const MUTED = "#9A8F80";

interface Props {
  visible: boolean;
  onClose: () => void;
  roomCode: string;
  roomTitle: string;
}

/** Katilimcilar panelindeki davet ekraninin "Paylas" sekmesine basinca acilir
 * - odanin kodunu kopyalanabilir sekilde gosterir, WhatsApp/Telegram'a
 * dogrudan URL semalariyla gonderir, "Diger" ise cihazin kendi (native)
 * paylasim sayfasini acar (mesaj alanindaki paylas ikonuyla ayni, bkz.
 * RoomScreen.tsx shareRoom). */
export default function ShareRoomScreen({ visible, onClose, roomCode, roomTitle }: Props) {
  const [copied, setCopied] = useState(false);
  const inviteText = `LUNA'da "${roomTitle}" odama katıl! Kod: ${roomCode}`;

  async function copyCode() {
    await Clipboard.setStringAsync(inviteText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function openWhatsapp() {
    Linking.openURL(`whatsapp://send?text=${encodeURIComponent(inviteText)}`).catch(() =>
      showAlert("Açılamadı", "WhatsApp yüklü değil gibi görünüyor.")
    );
  }

  function openTelegram() {
    Linking.openURL(`https://t.me/share/url?url=${encodeURIComponent(inviteText)}`).catch(() =>
      showAlert("Açılamadı", "Telegram açılamadı.")
    );
  }

  function openSystemShare() {
    Share.share({ message: inviteText }).catch(() => {});
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.screen}>
        <View style={styles.header}>
          <View style={styles.iconTouch} />
          <Text style={styles.headerTitle}>Paylaş</Text>
          <TouchableOpacity style={styles.iconTouch} onPress={onClose} hitSlop={8}>
            <Icon name="close" size={30} color={TEXT} />
          </TouchableOpacity>
        </View>

        <View style={styles.codeBox}>
          <View style={styles.codeTextWrap}>
            <Text style={styles.codeLabel}>Oda Kodu</Text>
            <Text style={styles.codeValue}>{roomCode}</Text>
          </View>
          <TouchableOpacity style={styles.copyButton} onPress={copyCode} hitSlop={8}>
            <Icon name={copied ? "check" : "clipboard"} size={20} color={copied ? ACCENT : TEXT} />
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionLabel}>Uygulamayla paylaş</Text>
        <View style={styles.appsRow}>
          <TouchableOpacity style={styles.appButton} onPress={openWhatsapp}>
            <View style={[styles.appIconCircle, { backgroundColor: "#25D366" }]}>
              <Icon name="chatBubble" size={26} color="#FFFFFF" />
            </View>
            <Text style={styles.appLabel}>WhatsApp</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.appButton} onPress={openTelegram}>
            <View style={[styles.appIconCircle, { backgroundColor: "#229ED9" }]}>
              <Icon name="send" size={24} color="#FFFFFF" />
            </View>
            <Text style={styles.appLabel}>Telegram</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.appButton} onPress={openSystemShare}>
            <View style={[styles.appIconCircle, { backgroundColor: "#2A2A2E" }]}>
              <Icon name="shareBox" size={24} color={TEXT} />
            </View>
            <Text style={styles.appLabel}>Diğer</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 12,
  },
  iconTouch: { width: 38, height: 38, justifyContent: "center", alignItems: "center" },
  headerTitle: { color: TEXT, fontSize: 16, fontWeight: "700" },
  codeBox: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#141210",
    borderRadius: 14,
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  codeTextWrap: { flex: 1 },
  codeLabel: { color: MUTED, fontSize: 12, fontWeight: "600" },
  codeValue: { color: TEXT, fontSize: 22, fontWeight: "700", letterSpacing: 2, marginTop: 2 },
  copyButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#26262B",
    alignItems: "center",
    justifyContent: "center",
  },
  sectionLabel: { color: MUTED, fontSize: 12, fontWeight: "600", marginHorizontal: 16, marginTop: 28, marginBottom: 14 },
  appsRow: { flexDirection: "row", gap: 24, marginHorizontal: 16 },
  appButton: { alignItems: "center", gap: 6 },
  appIconCircle: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center" },
  appLabel: { color: TEXT, fontSize: 12, fontWeight: "600" },
});
