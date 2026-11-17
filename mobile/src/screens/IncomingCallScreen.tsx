import React, { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Animated, PanResponder } from "react-native";
import { useTranslation } from "react-i18next";
import { Phone } from "lucide-react-native";
import { theme } from "../theme";
import Avatar from "../components/Avatar";
import AppBackground from "../components/AppBackground";
import type { DMPeer } from "./DMScreen";

interface Props {
  peer: DMPeer;
  peerAvatarUrl: string | null;
  onAccept: () => void;
  onDecline: () => void;
}

// Kaydirma mesafeleri - DMScreen.tsx'teki yanitlama (reply) kaydirmasiyla
// AYNI mantik: elin ortadaki tutamaci sola/saga ittigi mesafe, tetiklenme
// esigi ve en fazla gidebilecegi nokta.
const SWIPE_TRIGGER = 100;
const SWIPE_MAX = 160;
const HANDLE_SIZE = 72;

/** Gelen sesli arama ekrani - VoiceCallScreen ile AYNI ust kisim (isim/
 * handle/avatar yerlesimi), alt kisimda ise ortadaki tutamaci kirmizi
 * (reddet) ya da yesil (kabul et) tarafa kaydirarak yanitlaniyor. Su an
 * sadece GORSEL bir mockup - gercek bir sinyal/WebRTC baglantisi YOK
 * (bkz. VoiceCallScreen.tsx). */
export default function IncomingCallScreen({ peer, peerAvatarUrl, onAccept, onDecline }: Props) {
  const { t } = useTranslation();
  const translateX = useRef(new Animated.Value(0)).current;
  // Tutamacin GERCEK ikon rengi (stroke) - Animated.Value interpolate'i
  // sadece style prop'larini (transform/backgroundColor) animasyonlu
  // GUNCELLEYEBILIR, lucide ikonunun "color" prop'u duz bir string bekler -
  // bu yuzden esigi gecince NORMAL state ile degistiriliyor (surekli degil,
  // sadece bolge degisince render tetikleniyor).
  const [handleZone, setHandleZone] = useState<"left" | "center" | "right">("center");

  useEffect(() => {
    const id = translateX.addListener(({ value }) => {
      const next = value <= -SWIPE_MAX ? "left" : value >= SWIPE_MAX ? "right" : "center";
      setHandleZone((prev) => (prev === next ? prev : next));
    });
    return () => translateX.removeListener(id);
  }, [translateX]);

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_evt, g) => Math.abs(g.dx) > 6,
      onPanResponderMove: (_evt, g) => {
        translateX.setValue(Math.max(-SWIPE_MAX, Math.min(SWIPE_MAX, g.dx)));
      },
      onPanResponderRelease: (_evt, g) => {
        if (g.dx >= SWIPE_TRIGGER) {
          onAccept();
          return;
        }
        if (g.dx <= -SWIPE_TRIGGER) {
          onDecline();
          return;
        }
        Animated.spring(translateX, { toValue: 0, useNativeDriver: true, bounciness: 6 }).start();
      },
      onPanResponderTerminate: () => {
        Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
      },
    })
  ).current;

  const declineOpacity = translateX.interpolate({
    inputRange: [-SWIPE_TRIGGER, 0],
    outputRange: [1, 0.45],
    extrapolate: "clamp",
  });
  const acceptOpacity = translateX.interpolate({
    inputRange: [0, SWIPE_TRIGGER],
    outputRange: [0.45, 1],
    extrapolate: "clamp",
  });
  // Tutamacin icindeki ikonun donusu - sol ucta "Reddet" ikonuyla (135deg),
  // sag ucta "Kabul Et" ikonuyla (0deg, dondurulmemis) AYNI acida duruyor -
  // ama SADECE tutamac GERCEKTEN o ikonun UZERINE gelince (SWIPE_MAX, yani
  // gidebilecegi en uc nokta), tetiklenme esigi (SWIPE_TRIGGER) gecilir
  // gecilmez DEGIL.
  const handleIconRotate = translateX.interpolate({
    inputRange: [-SWIPE_MAX, 0, SWIPE_MAX],
    outputRange: ["135deg", "90deg", "0deg"],
    extrapolate: "clamp",
  });
  // Tutamac her zaman beyaz kalir - renk degisimi arkaplanda degil,
  // SADECE icindeki ikonun kendisinde: en uca gelince yesil/kirmizi olur.
  const handleIconColor = handleZone === "right" ? "#22C55E" : handleZone === "left" ? theme.danger : theme.bg;

  return (
    <View style={styles.screen}>
      <AppBackground />

      <Text style={styles.statusTop}>{t("dm.incomingCallStatus")}</Text>

      <View style={styles.center}>
        <Text style={styles.name}>{peer.name}</Text>
        {!!peer.handle && <Text style={styles.handle}>@{peer.handle}</Text>}
        <View style={styles.avatarWrap}>
          <Avatar name={peer.name} avatarUrl={peerAvatarUrl} size={220} ring={false} />
        </View>
      </View>

      <View style={styles.swipeWrap}>
        <View style={styles.track}>
          <Animated.View style={[styles.trackIcon, { opacity: declineOpacity }]}>
            <View style={{ transform: [{ rotate: "135deg" }] }}>
              <Phone size={30} color={theme.danger} />
            </View>
          </Animated.View>
          <Animated.View style={[styles.trackIcon, { opacity: acceptOpacity }]}>
            <Phone size={30} color="#22C55E" />
          </Animated.View>
          <Animated.View
            style={[styles.dragHandle, { transform: [{ translateX }] }]}
            {...pan.panHandlers}
          >
            <Animated.View style={{ transform: [{ rotate: handleIconRotate }] }}>
              <Phone size={36} color={handleIconColor} />
            </Animated.View>
          </Animated.View>
        </View>
        <Text style={styles.swipeHint}>{t("dm.swipeToAnswer")}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "transparent" },
  center: { flex: 1, alignItems: "center", gap: 6 },
  name: { color: theme.text, fontSize: 35, fontWeight: "700", marginTop: 14 },
  handle: { color: theme.textMuted, fontSize: 14 },
  dragHandle: {
    position: "absolute",
    top: 4,
    left: "50%",
    marginLeft: -HANDLE_SIZE / 2,
    width: HANDLE_SIZE,
    height: HANDLE_SIZE,
    borderRadius: HANDLE_SIZE / 2,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  statusTop: { color: theme.textMuted, fontSize: 15, textAlign: "center", paddingTop: 60 },
  swipeWrap: { alignItems: "center", gap: 14, paddingBottom: 72 },
  track: {
    width: 400,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(255,255,255,0.12)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 22,
  },
  trackIcon: { alignItems: "center", justifyContent: "center" },
  swipeHint: { color: theme.textMuted, fontSize: 13, fontWeight: "600" },
});
