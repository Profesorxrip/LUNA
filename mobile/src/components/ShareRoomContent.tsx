import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Linking, Share } from "react-native";
import * as Clipboard from "expo-clipboard";
import { LinearGradient } from "expo-linear-gradient";
import FontAwesome5 from "@expo/vector-icons/FontAwesome5";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
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

  // Instagram'in DM/hikaye paylasimini METIN ile ONCEDEN doldurabilecek
  // resmi bir URL semasi yok (sadece fotograf/hikaye icin var) - bu yuzden
  // davet metnini kopyalayip uygulamayi aciyoruz, kullanici bir sohbete
  // yapistiriyor (Instagram'in kendi kisitlamasi, LUNA'nin degil).
  function openInstagram() {
    Clipboard.setStringAsync(inviteText);
    Linking.openURL("instagram://").catch(() => Linking.openURL("https://instagram.com").catch(() => {}));
    showAlert("Kopyalandı", "Davet metni kopyalandı - Instagram'da bir sohbete yapıştırabilirsin.");
  }

  function openX() {
    Linking.openURL(`https://twitter.com/intent/tweet?text=${encodeURIComponent(inviteText)}`).catch(() =>
      showAlert("Açılamadı", "X açılamadı.")
    );
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
            <FontAwesome5 name="whatsapp" size={22} color="#FFFFFF" />
          </View>
          <Text style={styles.appLabel}>WhatsApp</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.appButton} onPress={openTelegram}>
          <View style={[styles.appIconCircle, { backgroundColor: "#229ED9" }]}>
            <FontAwesome5 name="telegram-plane" size={22} color="#FFFFFF" />
          </View>
          <Text style={styles.appLabel}>Telegram</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.appButton} onPress={openInstagram}>
          <LinearGradient
            colors={["#F9CE34", "#EE2A7B", "#6228D7"]}
            start={{ x: 0, y: 1 }}
            end={{ x: 1, y: 0 }}
            style={styles.appIconCircle}
          >
            <FontAwesome5 name="instagram" size={22} color="#FFFFFF" />
          </LinearGradient>
          <Text style={styles.appLabel}>Instagram</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.appButton} onPress={openX}>
          <View style={[styles.appIconCircle, styles.appIconBlack]}>
            <FontAwesome6 name="x-twitter" size={20} color="#FFFFFF" />
          </View>
          <Text style={styles.appLabel}>X</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.appButton} onPress={openSystemShare}>
          <View style={[styles.appIconCircle, styles.appIconDark]}>
            <Icon name="shareBox" size={22} color={TEXT} />
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
  // Ekranin solundan sagina kadar yayilsin diye - "Diger" boylece en sagda kalir.
  appsRow: { flexDirection: "row", justifyContent: "space-between" },
  appButton: { alignItems: "center", gap: 6 },
  // Telefonun kendi uygulama ikonlari gibi YUVARLAK degil, kose yumusatilmis
  // kare ("squircle").
  appIconCircle: { width: 52, height: 52, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  // Siyaha yakin butonlar (X, Diger) saf siyah arka planda kaybolmasin diye
  // ince beyaz bir cerceve.
  appIconDark: { backgroundColor: "#2A2A2E", borderWidth: 1, borderColor: "rgba(255,255,255,0.35)" },
  // X'in gercek marka rengi saf siyah - ekran da siyah oldugu icin ayirt
  // edilebilsin diye SADECE ince beyaz cerceve ekleniyor, arka plan gri
  // DEGIL (bkz. kullanicinin duzeltmesi).
  appIconBlack: { backgroundColor: "#000000", borderWidth: 1, borderColor: "rgba(255,255,255,0.35)" },
  appLabel: { color: TEXT, fontSize: 12, fontWeight: "600" },
});
