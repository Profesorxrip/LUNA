import React, { useEffect, useRef, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Platform } from "react-native";
import { useTranslation } from "react-i18next";
import { Plus, Cast, MoreVertical, Phone, Minimize2, Bluetooth } from "lucide-react-native";
import { MicrophoneIcon as MicrophoneOutline } from "react-native-heroicons/outline";
import { VideoIcon as AppVideoIcon, VideoOffIcon as AppVideoOffIcon } from "../components/CustomIcons";
import { theme } from "../theme";
import Avatar from "../components/Avatar";
import AppBackground from "../components/AppBackground";
import Icon from "../components/Icon";
import { showAlert } from "../components/CustomAlert";
import CallMoreOptionsSheet from "../components/CallMoreOptionsSheet";
import { useConnectionQuality } from "../hooks/useConnectionQuality";
import type { DMPeer } from "./DMScreen";
import type { CallEngineApi } from "../hooks/useCallEngine";

// GERCEK aramada (web) "Hoparlor" menusunu tarayicinin KENDI bildigi ses
// cikisi cihazlariyla (enumerateDevices) doldurur - Bluetooth eslenmisse
// O DA listede gercekten gorunur. VideoCallScreen.tsx'teki ayni isimli
// yardimciyla BIREBIR ayni mantik (iki dosya arasi baglanti kurmamak icin
// kucuk/pure oldugundan buraya da kopyalandi).
function buildRealOutputOptions(audioOutputs: MediaDeviceInfo[]) {
  return audioOutputs.map((d) => ({
    key: d.deviceId,
    label: d.label || "Ses çıkışı",
    renderIcon: (c: string) =>
      /bluetooth/i.test(d.label) ? <Bluetooth size={18} color={c} /> : <Icon name="sesAcik1" size={18} color={c} />,
  }));
}

const OUTPUT_MUTED = "rgba(255,255,255,0.55)";

/** Karsi taraftan gelen GERCEK ses akisini calar - CameraView'in web
 * karsiligi olan video.tsx'teki ScreenShareVideo ile AYNI mantik (duz DOM
 * <audio> elementine web disinda erisim yok), SADECE sesli oldugu icin
 * gorsel bir karsiligi yok, "muted" de FALSE (ScreenShareVideo'nun kendi
 * paylasimini sessize almasinin aksine, burada karsi tarafi GERCEKTEN
 * duymamiz gerekiyor). */
function RemoteAudioPlayer({ stream, realCall }: { stream: MediaStream | null; realCall?: CallEngineApi }) {
  const audioRef = useRef<any>(null);
  useEffect(() => {
    const el = audioRef.current;
    if (!el || !stream) return;
    el.srcObject = stream;
    el.play?.().catch(() => {});
    // Secili ses cikisi (hoparlor/kulaklik/Bluetooth) degisince bu
    // elemana da GERCEKTEN uygulanabilsin diye motora kaydediliyor.
    realCall?.registerMediaElement(el);
    return () => realCall?.unregisterMediaElement(el);
  }, [stream, realCall]);
  if (Platform.OS !== "web" || !stream) return null;
  return React.createElement("audio", { ref: audioRef, autoPlay: true });
}

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
  // Ekran paylasimi SADECE goruntulu arama ekraninda (VideoCallScreen) GERCEK
  // olarak var - sesli aramada "Paylaş" butonu bu yuzden kendi paylasim
  // ozelligini yeniden yazmak yerine, onayla goruntulu aramaya GECIS yapiyor
  // (bkz. handleSharePress). Verilmezse eski "yakinda" uyarisina duser.
  onSwitchToVideo?: () => void;
  // GERCEK arama motoruyla (bkz. useCallEngine.ts + CallEngineContext.tsx)
  // baglanti durumu/akislar - SADECE RootNavigator.tsx'teki gercek
  // VoiceCallRoute'tan verilir. Verilmezse (bkz. __DevHarness.tsx'teki saf
  // GORSEL/stil testleri) ekran eski mockup davranisina (2.5sn sonra
  // kendiliginden "baglandi" olma) doner - boylece bu dosyadaki butun
  // GORSEL testler GERCEK bir arama/sunucu olmadan da calismaya devam eder.
  realCall?: CallEngineApi;
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
  onSwitchToVideo,
  realCall,
}: Props) {
  const { t } = useTranslation();
  const [connectedMock, setConnectedMock] = useState(false);
  const connected = realCall ? realCall.phase === "connected" : connectedMock;
  const [elapsedMock, setElapsedMock] = useState(0);
  // GERCEK aramada sure artik motorun kendisinde (bkz. useCallEngine.ts
  // elapsedSeconds) tutuluyor - bu ekran kucultulup (bkz. RootNavigator.tsx
  // onMinimize) UNMOUNT olsa bile sure SIFIRLANMAZ, dogru kaldigi yerden
  // devam eder (MinimizedCallBanner da AYNI degeri okur).
  const elapsed = realCall ? realCall.elapsedSeconds : elapsedMock;
  const [mutedInternal, setMutedInternal] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [speakerOnInternal, setSpeakerOnInternal] = useState(false);
  const [moreVisible, setMoreVisible] = useState(false);
  const [noiseReduction, setNoiseReduction] = useState(false);
  const connectionQualityMock = useConnectionQuality(connected);
  // GERCEK aramada artik sahte ping RTT'si DEGIL, dogrudan gercek
  // RTCPeerConnection.getStats() olcumu (bkz. useCallEngine.ts
  // measureConnectionQuality) kullanilir.
  const connectionQuality = realCall ? realCall.connectionQuality : connectionQualityMock;
  const muted = mutedProp ?? mutedInternal;
  // Gercek aramada "Sessiz" artik SADECE GORSEL bir ikon degil - yerel
  // mikrofon track'ini GERCEKTEN kapatip aciyor (karsi taraf gercekten
  // duymuyor/duyuyor).
  const toggleMute =
    onToggleMute ??
    (() => {
      setMutedInternal((m) => {
        const next = !m;
        realCall?.localStream?.getAudioTracks().forEach((track) => {
          track.enabled = !next;
        });
        return next;
      });
    });
  const speakerOn = speakerOnProp ?? speakerOnInternal;
  const toggleSpeaker = onToggleSpeaker ?? (() => setSpeakerOnInternal((s) => !s));
  const endedRef = useRef(false);
  const [outputMenuVisible, setOutputMenuVisible] = useState(false);

  // GERCEK aramada hoparlor butonu artik GERCEK ses cikisini degistiriyor:
  // web'de tarayicinin kendi cihaz listesini (Bluetooth dahil) acip
  // setSinkId ile uygular, native'de expo-audio ile kulaklik/hoparlor
  // yonlendirmesini GERCEKTEN degistirir (bkz. useCallEngine.ts
  // refreshAudioOutputs/setAudioOutputId/setSpeakerRoute).
  const OUTPUT_OPTIONS = realCall ? buildRealOutputOptions(realCall.audioOutputs) : [];
  const speakerButtonActive = realCall
    ? Platform.OS === "web"
      ? !!realCall.audioOutputId
      : realCall.speakerOn
    : speakerOn;
  const showBluetoothIconOnButton =
    !!realCall &&
    Platform.OS === "web" &&
    /bluetooth/i.test(realCall.audioOutputs.find((d) => d.deviceId === realCall.audioOutputId)?.label || "");

  function handleSpeakerPress() {
    if (realCall) {
      if (Platform.OS === "web") {
        realCall.refreshAudioOutputs();
        setOutputMenuVisible((v) => !v);
      } else {
        realCall.setSpeakerRoute(!realCall.speakerOn);
      }
      return;
    }
    toggleSpeaker();
  }

  function selectOutput(key: string) {
    setOutputMenuVisible(false);
    realCall?.setAudioOutputId(key);
  }

  function placeholder() {
    showAlert(t("profile.comingSoon"));
  }

  function handleSharePress() {
    if (!onSwitchToVideo) {
      placeholder();
      return;
    }
    showAlert(t("dm.switchToVideoTitle"), t("dm.switchToVideoBody"), [
      { text: t("dm.switchToVideoCancel"), style: "cancel" },
      { text: t("dm.switchToVideoConfirm"), onPress: onSwitchToVideo },
    ]);
  }

  useEffect(() => {
    // Gercek aramada baglanti durumu zaten realCall.phase'den geliyor -
    // bu sahte zamanlayici SADECE realCall verilmedigi (saf GORSEL test)
    // durumunda calisir.
    if (realCall) return;
    const connectTimer = setTimeout(() => {
      if (!endedRef.current) setConnectedMock(true);
    }, 2500);
    return () => clearTimeout(connectTimer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (realCall || !connected) return;
    const interval = setInterval(() => setElapsedMock((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, [realCall, connected]);

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
      {!!realCall && <RemoteAudioPlayer stream={realCall.remoteStreams[peer.userId] ?? null} realCall={realCall} />}

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
              <MicrophoneOutline size={30} color={muted ? theme.danger : "#FFFFFF"} strokeWidth={1.8} />
            </TouchableOpacity>
            <Text style={styles.controlLabel}>{t("dm.callMute")}</Text>
          </View>
          <View style={styles.controlItem}>
            <TouchableOpacity
              style={[styles.controlButton, cameraOn && styles.controlButtonActive]}
              onPress={async () => {
                // Gercek aramada kamera butonu sesli aramayi GERCEKTEN
                // goruntulu aramaya yukseltir (bkz. useCallEngine.ts
                // upgradeToVideo - yeni bir video track karsi tarafa
                // GERCEKTEN eklenir) ve goruntulu arama ekranina gecer.
                if (realCall) {
                  await realCall.upgradeToVideo();
                  onSwitchToVideo?.();
                  return;
                }
                setCameraOn((c) => !c);
              }}
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
              style={[styles.controlButton, speakerButtonActive && styles.controlButtonActive]}
              onPress={handleSpeakerPress}
            >
              {showBluetoothIconOnButton ? (
                <Bluetooth size={30} color={speakerButtonActive ? theme.bg : "#FFFFFF"} />
              ) : (
                <Icon name="sesAcik1" size={30} color={speakerButtonActive ? theme.bg : "#FFFFFF"} />
              )}
            </TouchableOpacity>
            <Text style={styles.controlLabel}>{t("dm.callSpeaker")}</Text>
          </View>
          <View style={styles.controlItem}>
            <TouchableOpacity style={styles.controlButton} onPress={handleSharePress}>
              <Cast size={30} color="#FFFFFF" />
            </TouchableOpacity>
            <Text style={styles.controlLabel}>{t("dm.callShareLabel")}</Text>
          </View>
          <View style={styles.controlItem}>
            <TouchableOpacity style={styles.controlButton} onPress={() => setMoreVisible(true)}>
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

      <CallMoreOptionsSheet
        visible={moreVisible}
        onClose={() => setMoreVisible(false)}
        noiseReduction={noiseReduction}
        onToggleNoiseReduction={() => {
          setNoiseReduction((n) => {
            const next = !n;
            if (realCall) realCall.setNoiseSuppression(next);
            return next;
          });
        }}
        quality={connectionQuality}
      />

      {outputMenuVisible && (
        <TouchableOpacity style={styles.outputMenuBackdrop} activeOpacity={1} onPress={() => setOutputMenuVisible(false)}>
          <View style={styles.outputMenuWrap} pointerEvents="box-none">
            <TouchableOpacity activeOpacity={1} style={styles.outputMenuCard} onPress={() => {}}>
              {OUTPUT_OPTIONS.map((opt) => {
                const selected = realCall?.audioOutputId === opt.key;
                const color = selected ? "#FFFFFF" : OUTPUT_MUTED;
                return (
                  <TouchableOpacity
                    key={opt.key}
                    style={[styles.outputMenuRow, selected && styles.outputMenuRowSelected]}
                    onPress={() => selectOutput(opt.key)}
                  >
                    {opt.renderIcon(color)}
                    <Text style={[styles.outputMenuLabel, { color }]}>{opt.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      )}
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
  outputMenuBackdrop: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  outputMenuWrap: { position: "absolute", bottom: 144, left: 0, right: 0, alignItems: "center" },
  outputMenuCard: {
    backgroundColor: "#1E293B",
    borderRadius: 14,
    paddingVertical: 6,
    minWidth: 190,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  outputMenuRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, paddingHorizontal: 14, marginHorizontal: 6, borderRadius: 12 },
  outputMenuRowSelected: { backgroundColor: "rgba(14,165,233,0.18)" },
  outputMenuLabel: { fontSize: 14, fontWeight: "600", flex: 1 },
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
