import React, { useEffect, useRef, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { Plus, MicOff, Cast, MoreVertical, Phone, Minimize2 } from "lucide-react-native";
import { MicrophoneIcon as MicrophoneOutline } from "react-native-heroicons/outline";
import { VideoIcon as AppVideoIcon, VideoOffIcon as AppVideoOffIcon } from "../components/CustomIcons";
import { theme } from "../theme";
import Avatar from "../components/Avatar";
import AppBackground from "../components/AppBackground";
import Icon from "../components/Icon";
import { showAlert } from "../components/CustomAlert";
import type { DMPeer } from "./DMScreen";

interface Props {
  peer: DMPeer;
  peerAvatarUrl: string | null;
  onEnd: () => void;
  // Verilmezse sol ustteki kucultme butonu "yakinda" uyarisi gosterir -
  // verilince (bkz. __DevHarness.tsx) ekran kucultulup ustte banner olarak
  // devam ediyor, arama gercekte bitmiyor.
  onMinimize?: () => void;
  // Minimize edilen banner'in isim/sure gosterebilmesi icin - sayac burada
  // (VoiceCallScreen) tutuluyor, ekran gizliyken bile mount kalip calismaya
  // devam ediyor, parent sadece bu callback'le durumu aynaliyor.
  onStateChange?: (connected: boolean, elapsedSeconds: number) => void;
  // Sessiz/hoparlor durumu da MinimizedCallBanner'dan kontrol edilebilsin
  // diye disaridan kontrollu YAPILABILIR hale getirildi - verilmezse
  // (RootNavigator.tsx gibi kullanimlarda) ekran kendi ic state'ini kullanir.
  muted?: boolean;
  onToggleMute?: () => void;
  speakerOn?: boolean;
  onToggleSpeaker?: () => void;
  // Verilmezse "Arama Ekle" butonu "yakinda" uyarisi gosterir - verilince
  // (bkz. __DevHarness.tsx) aramaya kisi eklemek icin FriendsScreen'in
  // davet modu acilir.
  onAddCall?: () => void;
}

export function formatElapsed(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Sesli arama ekrani - su an sadece GORSEL bir mockup: gercek bir sinyal/
 * WebRTC baglantisi YOK (bkz. useVoiceChat.ts - o hook oda/grup sesli
 * sohbeti icin, 1'e 1 DM aramasi icin ayri bir sunucu akisi gerekir). 2.5sn
 * sonra "baglandi" durumuna gecip yerel bir sayac baslatarak gercek bir
 * aramanin GORUNUMUNU taklit ediyor. */
export default function VoiceCallScreen({
  peer,
  peerAvatarUrl,
  onEnd,
  onMinimize,
  onStateChange,
  muted: mutedProp,
  onToggleMute,
  speakerOn: speakerOnProp,
  onToggleSpeaker,
  onAddCall,
}: Props) {
  const { t } = useTranslation();
  const [connected, setConnected] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [mutedInternal, setMutedInternal] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [speakerOnInternal, setSpeakerOnInternal] = useState(false);
  const muted = mutedProp ?? mutedInternal;
  const toggleMute = onToggleMute ?? (() => setMutedInternal((m) => !m));
  const speakerOn = speakerOnProp ?? speakerOnInternal;
  const toggleSpeaker = onToggleSpeaker ?? (() => setSpeakerOnInternal((s) => !s));
  const endedRef = useRef(false);

  function placeholder() {
    showAlert(t("profile.comingSoon"));
  }

  useEffect(() => {
    const connectTimer = setTimeout(() => {
      if (!endedRef.current) setConnected(true);
    }, 2500);
    return () => clearTimeout(connectTimer);
  }, []);

  useEffect(() => {
    if (!connected) return;
    const interval = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, [connected]);

  useEffect(() => {
    onStateChange?.(connected, elapsed);
  }, [connected, elapsed, onStateChange]);

  function handleEnd() {
    endedRef.current = true;
    onEnd();
  }

  return (
    <View style={styles.screen}>
      <AppBackground />

      <TouchableOpacity style={styles.minimizeButton} onPress={onMinimize ?? placeholder} hitSlop={10}>
        <Minimize2 size={30} color="#FFFFFF" />
      </TouchableOpacity>

      <Text style={styles.statusTop}>{connected ? formatElapsed(elapsed) : t("dm.callRinging")}</Text>

      <View style={styles.center}>
        <Text style={styles.name}>{peer.name}</Text>
        {!!peer.handle && <Text style={styles.handle}>@{peer.handle}</Text>}
        <View style={styles.avatarWrap}>
          <Avatar name={peer.name} avatarUrl={peerAvatarUrl} size={128} ring={false} />
        </View>
      </View>

      <View style={styles.bottomButtonsWrap}>
      <View style={styles.controlsGrid}>
        <View style={[styles.controlRow, styles.controlRowTop]}>
          <View style={styles.controlItem}>
            <TouchableOpacity style={styles.controlButton} onPress={onAddCall ?? placeholder}>
              <Plus size={30} color="#FFFFFF" />
            </TouchableOpacity>
            <Text style={styles.controlLabel}>{t("dm.callAddLabel")}</Text>
          </View>
          <View style={styles.controlItem}>
            <TouchableOpacity
              style={[styles.controlButton, muted && styles.controlButtonActive]}
              onPress={toggleMute}
            >
              {muted ? (
                <MicOff size={30} color={theme.bg} />
              ) : (
                <MicrophoneOutline size={30} color="#FFFFFF" strokeWidth={1.8} />
              )}
            </TouchableOpacity>
            <Text style={styles.controlLabel}>{t("dm.callMute")}</Text>
          </View>
          <View style={styles.controlItem}>
            <TouchableOpacity
              style={[styles.controlButton, cameraOn && styles.controlButtonActive]}
              onPress={() => setCameraOn((c) => !c)}
            >
              <View style={{ transform: [{ translateY: 1 }] }}>
                {cameraOn ? <AppVideoIcon size={28} color={theme.bg} /> : <AppVideoOffIcon size={28} color="#FFFFFF" />}
              </View>
            </TouchableOpacity>
            <Text style={styles.controlLabel}>{t("dm.callVideoLabel")}</Text>
          </View>
        </View>
        <View style={styles.controlRow}>
          <View style={styles.controlItem}>
            <TouchableOpacity
              style={[styles.controlButton, speakerOn && styles.controlButtonActive]}
              onPress={toggleSpeaker}
            >
              <Icon name={speakerOn ? "sesAcik1" : "sesKapali1"} size={30} color={speakerOn ? theme.bg : "#FFFFFF"} />
            </TouchableOpacity>
            <Text style={styles.controlLabel}>{t("dm.callSpeaker")}</Text>
          </View>
          <View style={styles.controlItem}>
            <TouchableOpacity style={styles.controlButton} onPress={placeholder}>
              <Cast size={30} color="#FFFFFF" />
            </TouchableOpacity>
            <Text style={styles.controlLabel}>{t("dm.callShareLabel")}</Text>
          </View>
          <View style={styles.controlItem}>
            <TouchableOpacity style={styles.controlButton} onPress={placeholder}>
              <MoreVertical size={30} color="#FFFFFF" />
            </TouchableOpacity>
            <Text style={styles.controlLabel}>{t("dm.callMoreLabel")}</Text>
          </View>
        </View>
      </View>

      <View style={styles.endRow}>
        <TouchableOpacity style={styles.endButton} onPress={handleEnd}>
          <View style={{ transform: [{ rotate: "135deg" }] }}>
            <Phone size={30} color="#FFFFFF" />
          </View>
        </TouchableOpacity>
      </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "transparent" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 6 },
  name: { color: theme.text, fontSize: 35, fontWeight: "700", marginBottom: 16, transform: [{ translateY: -50 }] },
  handle: { color: theme.textMuted, fontSize: 14, transform: [{ translateY: -50 }] },
  avatarWrap: { transform: [{ translateY: -10 }] },
  statusTop: { color: theme.textMuted, fontSize: 15, textAlign: "center", paddingTop: 60 },
  minimizeButton: { position: "absolute", top: 54, left: 18, zIndex: 1 },
  bottomButtonsWrap: { transform: [{ translateY: -5 }] },
  controlsGrid: { alignItems: "center", gap: 28, marginBottom: 64, transform: [{ translateY: 30 }] },
  controlRow: { flexDirection: "row", gap: 36 },
  controlRowTop: { transform: [{ translateY: -20 }] },
  controlButton: {
    width: 80,
    height: 80,
    borderRadius: 30,
    backgroundColor: "rgba(255,255,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  controlButtonActive: { backgroundColor: "#FFFFFF" },
  controlItem: { alignItems: "center", gap: 8 },
  controlLabel: { color: theme.textMuted, fontSize: 12, fontWeight: "600" },
  endRow: { alignItems: "center", paddingBottom: 56 },
  endButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: theme.danger,
    alignItems: "center",
    justifyContent: "center",
  },
});
