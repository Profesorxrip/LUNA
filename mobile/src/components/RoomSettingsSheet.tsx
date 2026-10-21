import React, { useState } from "react";
import { Modal, View, Text, TouchableOpacity, StyleSheet, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import type { PrivacyLevel, PlaybackMode } from "../services/socket";
import Icon, { IconName } from "./Icon";
import SimpleSlider from "./SimpleSlider";
import Toggle from "./Toggle";
import { theme } from "../theme";

interface Props {
  visible: boolean;
  onClose: () => void;
  isHost: boolean;
  privacy: PrivacyLevel;
  playbackMode: PlaybackMode;
  autoTranslateChat: boolean;
  isAdult: boolean;
  // Hesabimin geneline uygulanan "Yetiskin Icerigini Gizle" tercihi (bkz.
  // ProfileScreen.tsx) - burada da gosterilmesinin tek amaci, bir sey
  // izlerken Profil'e gitmeden (odadan cikmadan) ANINDA ac/kapa yapabilmek;
  // "isAdult"tan FARKLI - o ROOM'un kendisinin isaretlenmesi (sadece host),
  // bu ise BENIM kisisel goruntuleme tercihim (herkes degistirebilir).
  hideAdultContent: boolean;
  onChangePrivacy: (p: PrivacyLevel) => void;
  onChangePlaybackMode: (m: PlaybackMode) => void;
  onToggleAutoTranslate: (v: boolean) => void;
  onToggleAdult: (v: boolean) => void;
  onToggleHideAdultContent: (v: boolean) => void;
  micConnected: boolean;
  micMuted: boolean;
  onMicPress: () => void;
  onLeaveVoice: () => void;
  // Sesli sohbetteki diger katilimcilarin sesi (mikrofon/telefon ikonlari
  // arasindaki cubuk).
  voiceVolume: number;
  onVoiceVolumeChange: (v: number) => void;
  // Su an izlenen videonun/medyanin sesi - ayri bir cubuk (bkz. RoomScreen.tsx).
  videoVolume: number;
  onVideoVolumeChange: (v: number) => void;
  // Panel videonun ALT KENARINDA baslasin diye (bkz. RoomScreen.tsx
  // topBarHeight + videoNaturalHeight) - video gizlendiginde (videoHidden)
  // bu deger topBarHeight'a duser, panel en yukari kadar cikar.
  topOffset: number;
}

// Kaydirici tam sola cekilince dokunma hassasiyeti yuzunden TAM 0 yerine
// 0.00x gibi degerler de gelebiliyor - ikon degisimini "kapali" GORUNEN her
// durumda tetiklemek icin kucuk bir esik kullaniyoruz.
const VOLUME_MUTE_THRESHOLD = 0.02;

function getPrivacyOptions(t: (key: string) => string): { key: PrivacyLevel; icon: IconName; label: string }[] {
  return [
    { key: "open", icon: "worldOpen", label: t("roomSettings.privacyOpen") },
    { key: "nearby", icon: "radar", label: t("roomSettings.privacyNearby") },
    { key: "friends", icon: "people", label: t("roomSettings.privacyFriends") },
    { key: "invite", icon: "inviteKey", label: t("roomSettings.privacyInvite") },
  ];
}

function getPrivacyDesc(t: (key: string) => string): Record<PrivacyLevel, string> {
  return {
    open: t("roomSettings.privacyOpenDesc"),
    nearby: t("roomSettings.privacyNearbyDesc"),
    friends: t("roomSettings.privacyFriendsDesc"),
    invite: t("roomSettings.privacyInviteDesc"),
  };
}

function getPlaybackOptions(t: (key: string) => string): { key: PlaybackMode; icon: IconName; label: string }[] {
  return [
    { key: "leader", icon: "crownFilled", label: t("roomSettings.playbackLeader") },
    { key: "playOnly", icon: "playOnlyControl", label: t("roomSettings.playbackPlayOnly") },
    { key: "autoplay", icon: "autoplayQueue", label: t("roomSettings.playbackAutoplay") },
    { key: "vote", icon: "voteBox", label: t("roomSettings.playbackVote") },
  ];
}

function getPlaybackDesc(t: (key: string) => string): Record<PlaybackMode, string> {
  return {
    leader: t("roomSettings.playbackLeaderDesc"),
    playOnly: t("roomSettings.playbackPlayOnlyDesc"),
    autoplay: t("roomSettings.playbackAutoplayDesc"),
    vote: t("roomSettings.playbackVoteDesc"),
  };
}

/** Rave'deki oda ici Ayarlar ekranina benzer panel - GIZLILIK/PLAYBACK
 * satirlarina basinca 4 secenek yatay olarak acilir (sadece lider
 * degistirebilir, misafirler sadece mevcut degeri gorur). */
export default function RoomSettingsSheet({
  visible,
  onClose,
  isHost,
  privacy,
  playbackMode,
  autoTranslateChat,
  isAdult,
  hideAdultContent,
  onChangePrivacy,
  onChangePlaybackMode,
  onToggleAutoTranslate,
  onToggleAdult,
  onToggleHideAdultContent,
  micConnected,
  micMuted,
  onMicPress,
  onLeaveVoice,
  voiceVolume,
  onVoiceVolumeChange,
  videoVolume,
  onVideoVolumeChange,
  topOffset,
}: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [expanded, setExpanded] = useState<"privacy" | "playback" | "mic" | null>(null);

  const PRIVACY_OPTIONS = getPrivacyOptions(t);
  const PRIVACY_DESC = getPrivacyDesc(t);
  const PLAYBACK_OPTIONS = getPlaybackOptions(t);
  const PLAYBACK_DESC = getPlaybackDesc(t);
  const currentPrivacy = PRIVACY_OPTIONS.find((o) => o.key === privacy)!;
  const currentPlayback = PLAYBACK_OPTIONS.find((o) => o.key === playbackMode)!;
  const micOpen = micConnected && !micMuted;

  function toggle(section: "privacy" | "playback" | "mic") {
    if (!isHost) return;
    setExpanded((cur) => (cur === section ? null : section));
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose} statusBarTranslucent>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity
          activeOpacity={1}
          style={[styles.sheet, { top: topOffset, paddingBottom: 30 + insets.bottom }]}
          onPress={() => {}}
        >
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={styles.header}>{t("roomSettings.header")}</Text>

            <TouchableOpacity style={styles.row} onPress={() => toggle("privacy")} disabled={!isHost}>
              <View style={styles.rowText}>
                <Text style={styles.rowLabel}>{t("roomSettings.access")}</Text>
                <Text style={styles.rowDesc}>{PRIVACY_DESC[privacy]}</Text>
              </View>
              {isHost && <Icon name={expanded === "privacy" ? "chevronRight" : "chevronLeft"} size={16} color={theme.textMuted} />}
              <View style={styles.rowValue}>
                <Icon name={currentPrivacy.icon} size={26} color={theme.text} />
                <Text style={styles.rowValueLabel}>{currentPrivacy.label.replace("\n", " ")}</Text>
              </View>
            </TouchableOpacity>
            {expanded === "privacy" && (
              <View style={styles.optionsRow}>
                {PRIVACY_OPTIONS.map((opt) => (
                  <TouchableOpacity
                    key={opt.key}
                    style={styles.optionItem}
                    onPress={() => {
                      onChangePrivacy(opt.key);
                      setExpanded(null);
                    }}
                  >
                    <Icon name={opt.icon} size={28} color={opt.key === privacy ? theme.accent : theme.text} />
                    <Text style={[styles.optionLabel, opt.key === privacy && { color: theme.accent }]}>{opt.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <TouchableOpacity style={styles.row} onPress={() => toggle("playback")} disabled={!isHost}>
              <View style={styles.rowText}>
                <Text style={styles.rowLabel}>{t("roomSettings.control")}</Text>
                <Text style={styles.rowDesc}>{PLAYBACK_DESC[playbackMode]}</Text>
              </View>
              {isHost && <Icon name={expanded === "playback" ? "chevronRight" : "chevronLeft"} size={16} color={theme.textMuted} />}
              <View style={styles.rowValue}>
                <Icon name={currentPlayback.icon} size={26} color={theme.text} />
                <Text style={styles.rowValueLabel}>{currentPlayback.label.replace("\n", " ")}</Text>
              </View>
            </TouchableOpacity>
            {expanded === "playback" && (
              <View style={styles.optionsRow}>
                {PLAYBACK_OPTIONS.map((opt) => (
                  <TouchableOpacity
                    key={opt.key}
                    style={styles.optionItem}
                    onPress={() => {
                      onChangePlaybackMode(opt.key);
                      setExpanded(null);
                    }}
                  >
                    <Icon name={opt.icon} size={28} color={opt.key === playbackMode ? theme.accent : theme.text} />
                    <Text style={[styles.optionLabel, opt.key === playbackMode && { color: theme.accent }]}>{opt.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Buradaki mikrofon butonu KISISEL degil, ODA GENELI bir anahtar -
                sadece lider basabilir (bkz. handleMicPress -> voice:hostMicOpen):
                lider kapatinca kendi mikrofonu DISINDAKI acik mikrofonlar
                otomatik susturulur, lider acinca herkes kendi mikrofonunu
                acma IZNINE kavusur (fiziksel olarak baskasinin cihazindaki
                mikrofonu ONAYI olmadan dogrudan acmak mumkun degil). Katilimcilarin
                KENDI mikrofonunu acip kapatmasi icin ayri (VideoControlsOverlay'deki)
                kisisel mikrofon butonu var. */}
            <TouchableOpacity style={styles.row} onPress={() => toggle("mic")} disabled={!isHost}>
              <View style={styles.rowText}>
                <Text style={styles.rowLabel}>{t("roomSettings.micRowLabel")}</Text>
                <Text style={styles.rowDesc}>
                  {micOpen ? t("roomSettings.micOpenDesc") : t("roomSettings.micClosedDesc")}
                </Text>
              </View>
              {isHost && <Icon name={expanded === "mic" ? "chevronRight" : "chevronLeft"} size={16} color={theme.textMuted} />}
              <View style={styles.rowValue}>
                <Icon name={micOpen ? "mic" : "micOff"} size={26} color={theme.text} />
                <Text style={styles.rowValueLabel}>{micOpen ? t("roomSettings.on") : t("roomSettings.off")}</Text>
              </View>
            </TouchableOpacity>
            {expanded === "mic" && (
              <View style={styles.optionsRow}>
                <TouchableOpacity
                  style={styles.optionItem}
                  onPress={() => {
                    if (!micOpen) onMicPress();
                    setExpanded(null);
                  }}
                >
                  <Icon name="mic" size={28} color={micOpen ? theme.accent : theme.text} />
                  <Text style={[styles.optionLabel, micOpen && { color: theme.accent }]}>{t("roomSettings.on")}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.optionItem}
                  onPress={() => {
                    if (micOpen) onMicPress();
                    setExpanded(null);
                  }}
                >
                  <Icon name="micOff" size={28} color={!micOpen ? theme.accent : theme.text} />
                  <Text style={[styles.optionLabel, !micOpen && { color: theme.accent }]}>{t("roomSettings.off")}</Text>
                </TouchableOpacity>
              </View>
            )}

            <Text style={styles.volumeLabel}>{t("roomSettings.voiceVolumeLabel")}</Text>
            <View style={[styles.volumeRow, styles.volumeRowNoTopBorder]}>
              <Icon name={voiceVolume <= VOLUME_MUTE_THRESHOLD ? "phoneOff" : "phoneDevice"} size={20} color={theme.textMuted} />
              <View style={styles.volumeSlider}>
                <SimpleSlider value={voiceVolume} onValueChange={onVoiceVolumeChange} />
              </View>
              <TouchableOpacity onPress={onLeaveVoice} hitSlop={8}>
                <Icon name="phoneDevice" size={20} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            {/* Video/medya sesi - sesli sohbet cubugunun hemen altinda, AYNI
                gorsel stil - tek fark sagda "ayril" degil sabit bir ikon. */}
            <Text style={styles.volumeLabel}>{t("roomSettings.videoVolumeLabel")}</Text>
            <View style={[styles.volumeRow, styles.volumeRowNoTopBorder]}>
              <Icon name="volumeOff" size={20} color={theme.textMuted} />
              <View style={styles.volumeSlider}>
                <SimpleSlider value={videoVolume} onValueChange={onVideoVolumeChange} />
              </View>
              <Icon name={videoVolume <= VOLUME_MUTE_THRESHOLD ? "volumeOff" : "volume"} size={20} color="#FFFFFF" />
            </View>

            <View style={styles.translateRow}>
              <View style={styles.translateLabelRow}>
                <Icon name="language" size={18} color={theme.text} />
                <Text style={styles.translateLabel}>{t("roomSettings.autoTranslateLabel")}</Text>
              </View>
              <Toggle value={autoTranslateChat} onValueChange={onToggleAutoTranslate} />
            </View>

            <View style={styles.translateRow}>
              <View style={styles.translateLabelRow}>
                <Icon name="adultOff" size={18} color={theme.text} />
                <Text style={styles.translateLabel}>{t("roomSettings.hideAdultLabel")}</Text>
              </View>
              <Toggle value={hideAdultContent} onValueChange={onToggleHideAdultContent} />
            </View>

          </ScrollView>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)" },
  // Panel artik sabit bir yuzde yukseklik yerine, videonun ALT KENARINDAN
  // (topOffset, inline style ile verilir) ekranin gercek altina kadar
  // uzaniyor - koseler de video ile ayni hizada SIVRI (yuvarlatma yok).
  sheet: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: "100%",
    maxWidth: 480,
    alignSelf: "center",
    backgroundColor: "#1C1C1E",
    paddingTop: 18,
    paddingBottom: 30,
  },
  // DIKKAT: yatay padding artik "sheet"te DEGIL, her satirin KENDI
  // stilinde - boylece asagidaki ayirici cizgiler (borderTopWidth) sheet'in
  // TAM kenarina kadar uzaniyor, sadece icerik (yazi/ikon) ortalanmis kaliyor.
  header: { color: theme.textMuted, fontSize: 12, fontWeight: "700", letterSpacing: 1, marginBottom: 8, paddingHorizontal: 20 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderTopWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    gap: 10,
  },
  rowText: { flex: 1 },
  rowLabel: { color: theme.text, fontSize: 17, fontWeight: "700" },
  rowDesc: { color: theme.textMuted, fontSize: 12, marginTop: 2 },
  rowValue: { alignItems: "center", width: 70, gap: 4 },
  rowValueLabel: { color: theme.textMuted, fontSize: 9, fontWeight: "700", textAlign: "center" },
  optionsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  optionItem: { alignItems: "center", width: 70, gap: 6 },
  optionLabel: { color: theme.text, fontSize: 9, fontWeight: "700", textAlign: "center" },
  volumeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderTopWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  // Etiketli cubuklarda (bkz. "SOHBET SESİ") ust ayirici cizgiyi/bosluk
  // ustteki Text zaten veriyor - ayni cubukta IKI kez gorunmesin diye.
  volumeRowNoTopBorder: { borderTopWidth: 0, paddingTop: 0 },
  volumeLabel: {
    color: theme.textMuted,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
    textAlign: "center",
    paddingHorizontal: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  volumeSlider: { flex: 1 },
  translateRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderTopWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  translateLabelRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  translateLabel: { color: theme.text, fontSize: 14, fontWeight: "600" },
});
