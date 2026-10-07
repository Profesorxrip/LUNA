import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Linking, Share } from "react-native";
import * as Clipboard from "expo-clipboard";
import FontAwesome5 from "@expo/vector-icons/FontAwesome5";
import Icon from "./Icon";
import { showAlert } from "./CustomAlert";

const ACCENT = "#0EA5E9";
const TEXT = "#F5F0E6";
const MUTED = "#9A8F80";

interface Props {
  roomCode: string;
  roomTitle: string;
}

/** Davet ekraninin "Paylas" sekmesinin (FriendsScreen.tsx) icerigi - AYRI bir
 * ekran DEGIL, digerleri (Arkadaslar/Son Zamanlarda) gibi ayni sekme
 * cubugunun altinda gosterilen bir panel. Odanin GERCEK, tiklaninca dogrudan
 * odaya goturen linkini ("luna://room/KOD" - app.json'daki "scheme" ve
 * RootNavigator.tsx'teki Linking dinleyicisi sayesinde calisir) kopyalanabilir
 * sekilde gosterir, WhatsApp/Telegram'a GERCEK URL semalariyla gonderir,
 * "Diger" ise cihazin kendi (native) paylasim sayfasini acar. */
export default function ShareRoomContent({ roomCode, roomTitle }: Props) {
  const [copied, setCopied] = useState(false);
  const roomLink = `luna://room/${roomCode}`;
  const inviteText = `LUNA'da "${roomTitle}" odama katıl! ${roomLink}`;

  async function copyLink() {
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
    const caption = encodeURIComponent(`LUNA'da "${roomTitle}" odama katıl!`);
    Linking.openURL(`https://t.me/share/url?url=${encodeURIComponent(roomLink)}&text=${caption}`).catch(() =>
      showAlert("Açılamadı", "Telegram açılamadı.")
    );
  }

  function openSystemShare() {
    Share.share({ message: inviteText }).catch(() => {});
  }

  return (
    <View style={styles.container}>
      <View style={styles.linkBox}>
        <View style={styles.linkTextWrap}>
          <Text style={styles.linkLabel}>Oda Linki</Text>
          <Text style={styles.linkValue} numberOfLines={1}>
            {roomLink}
          </Text>
        </View>
        <TouchableOpacity style={styles.copyButton} onPress={copyLink} hitSlop={8}>
          <Icon name={copied ? "check" : "clipboard"} size={20} color={copied ? ACCENT : TEXT} />
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionLabel}>Uygulamayla paylaş</Text>
      <View style={styles.appsRow}>
        <TouchableOpacity style={styles.appButton} onPress={openWhatsapp}>
          <View style={[styles.appIconCircle, { backgroundColor: "#25D366" }]}>
            <FontAwesome5 name="whatsapp" size={26} color="#FFFFFF" />
          </View>
          <Text style={styles.appLabel}>WhatsApp</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.appButton} onPress={openTelegram}>
          <View style={[styles.appIconCircle, { backgroundColor: "#229ED9" }]}>
            <FontAwesome5 name="telegram-plane" size={24} color="#FFFFFF" />
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
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 16, paddingTop: 12 },
  linkBox: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#141210",
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 16,
    gap: 12,
  },
  linkTextWrap: { flex: 1 },
  linkLabel: { color: MUTED, fontSize: 12, fontWeight: "600" },
  linkValue: { color: TEXT, fontSize: 16, fontWeight: "700", marginTop: 2 },
  copyButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#26262B",
    alignItems: "center",
    justifyContent: "center",
  },
  sectionLabel: { color: MUTED, fontSize: 12, fontWeight: "600", marginTop: 28, marginBottom: 14 },
  appsRow: { flexDirection: "row", gap: 24 },
  appButton: { alignItems: "center", gap: 6 },
  appIconCircle: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center" },
  appLabel: { color: TEXT, fontSize: 12, fontWeight: "600" },
});
