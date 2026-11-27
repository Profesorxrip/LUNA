import React, { useState } from "react";
import { Modal, View, Text, TouchableOpacity, StyleSheet, ScrollView, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import type { PrivacyLevel, PlaybackMode } from "../services/socket";
import Icon, { IconName } from "./Icon";
import VerticalVolumeBar from "./VerticalVolumeBar";
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
  // Odanin mikrofon politikasi (bkz. server/src/rooms.ts micOpenToAll) -
  // KISISEL bir durum DEGIL, SADECE lider degistirebilir (bkz.
  // onSetMicOpenToAll/RoomScreen.tsx setRoomMicLock -> "voice:hostMicOpen").
  micOpenToAll: boolean;
  onSetMicOpenToAll: (open: boolean) => void;
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
    { key: "friends", icon: "friendsUsers", label: t("roomSettings.privacyFriends") },
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
  micOpenToAll,
  onSetMicOpenToAll,
  onLeaveVoice,
  voiceVolume,
  onVoiceVolumeChange,
  videoVolume,
  onVideoVolumeChange,
  topOffset,
}: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const [expanded, setExpanded] = useState<"privacy" | "playback" | "mic" | null>(null);

  const PRIVACY_OPTIONS = getPrivacyOptions(t);
  const PRIVACY_DESC = getPrivacyDesc(t);
  const PLAYBACK_OPTIONS = getPlaybackOptions(t);
  const PLAYBACK_DESC = getPlaybackDesc(t);
  const currentPrivacy = PRIVACY_OPTIONS.find((o) => o.key === privacy)!;
  const currentPlayback = PLAYBACK_OPTIONS.find((o) => o.key === playbackMode)!;
  const micOpen = micOpenToAll;

  function toggle(section: "privacy" | "playback" | "mic") {
    if (!isHost) return;
    setExpanded((cur) => (cur === section ? null : section));
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose} statusBarTranslucent>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity
          activeOpacity={1}
          style={[
            styles.sheet,
            { top: topOffset, height: Math.max(0, windowHeight - topOffset), paddingBottom: 30 + insets.bottom },
          ]}
          onPress={() => {}}
        >
          {/* Deneme: hap şeklinde sürükleme tutamacı. */}
          <View style={styles.dragHandle} />
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={styles.header}>GİZLİLİK</Text>

            {/* Deneme: Erişim kutusu (başlık satırı) gizlendi, seçenekler sürekli açık duruyor. */}
            {true && (
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
                    <Icon name={opt.icon} size={28} color={opt.key === privacy ? theme.text : theme.textMuted} />
                    <Text style={[styles.optionLabel, opt.key !== privacy && { color: theme.textMuted }]}>{opt.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Deneme: Kontrol kutusu (başlık satırı) gizlendi, seçenekler sürekli açık duruyor. */}
            <Text style={styles.header}>KONTROL</Text>
            {true && (
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
                    <Icon name={opt.icon} size={28} color={opt.key === playbackMode ? theme.text : theme.textMuted} />
                    <Text style={[styles.optionLabel, opt.key !== playbackMode && { color: theme.textMuted }]}>{opt.label}</Text>
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
            {/* Deneme: Sohbet kutusu (başlık satırı) gizlendi, seçenekler sürekli açık duruyor. */}
            <Text style={styles.header}>GENEL</Text>
            {true && (
              <View style={[styles.optionsRow, { marginTop: 5 }]}>
                <View style={styles.optionItem} />
                <View style={styles.optionItem} />
                <TouchableOpacity
                  style={[styles.optionItem, !isHost && styles.optionItemDisabled]}
                  disabled={!isHost}
                  onPress={() => {
                    if (!micOpen) onSetMicOpenToAll(true);
                    setExpanded(null);
                  }}
                >
                  <Icon name="mic" size={28} color={micOpen ? theme.text : theme.textMuted} />
                  <Text style={[styles.optionLabel, !micOpen && { color: theme.textMuted }]}>{t("roomSettings.micOnOptionLabel")}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.optionItem, !isHost && styles.optionItemDisabled]}
                  disabled={!isHost}
                  onPress={() => {
                    if (micOpen) onSetMicOpenToAll(false);
                    setExpanded(null);
                  }}
                >
                  <Icon name="micOff" size={28} color={!micOpen ? theme.text : theme.textMuted} />
                  <Text style={[styles.optionLabel, micOpen && { color: theme.textMuted }]}>{t("roomSettings.micOffOptionLabel")}</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Deneme: ses çubukları yatay kaydırıcı yerine dikey hap (kapsül). */}
            <View style={styles.verticalVolumeRow}>
              <View style={styles.verticalVolumeItem}>
                <VerticalVolumeBar
                  value={voiceVolume}
                  onValueChange={onVoiceVolumeChange}
                  icon={voiceVolume <= VOLUME_MUTE_THRESHOLD ? "phoneOff" : "phoneDevice"}
                  muted={voiceVolume <= VOLUME_MUTE_THRESHOLD}
                />
                <Text style={styles.volumeLabel}>{t("roomSettings.voiceVolumeLabel")}</Text>
              </View>
              <View style={styles.verticalVolumeItem}>
                <VerticalVolumeBar
                  value={videoVolume}
                  onValueChange={onVideoVolumeChange}
                  icon={videoVolume <= VOLUME_MUTE_THRESHOLD ? "sesKapali1" : "sesAcik1"}
                  muted={videoVolume <= VOLUME_MUTE_THRESHOLD}
                />
                <Text style={styles.volumeLabel}>{t("roomSettings.videoVolumeLabel")}</Text>
              </View>
              {/* Deneme: iki toggle küçültülüp ses çubuklarının yanına sıkıştırıldı. */}
              <View style={[styles.compactToggles, { marginTop: 70 }]}>
                <View style={[styles.compactToggleRow, { marginTop: 10 }, !isHost && styles.optionItemDisabled]}>
                  <View style={styles.compactToggleIcon}>
                    <Icon name="language" size={18} color={autoTranslateChat ? theme.text : theme.textMuted} />
                  </View>
                  <Text
                    style={[styles.compactToggleLabel, !autoTranslateChat && { color: theme.textMuted }]}
                    numberOfLines={2}
                  >
                    {t("roomSettings.autoTranslateLabel")}
                  </Text>
                  <View style={styles.compactToggleSwitch}>
                    <Toggle value={autoTranslateChat} onValueChange={onToggleAutoTranslate} disabled={!isHost} />
                  </View>
                </View>
                <View style={[styles.compactToggleRow, { marginTop: 5 }]}>
                  <View style={styles.compactToggleIcon}>
                    <Icon name="adultOff" size={18} color={hideAdultContent ? theme.text : theme.textMuted} />
                  </View>
                  <Text
                    style={[styles.compactToggleLabel, !hideAdultContent && { color: theme.textMuted }]}
                    numberOfLines={2}
                  >
                    {t("roomSettings.hideAdultLabel")}
                  </Text>
                  <View style={styles.compactToggleSwitch}>
                    <Toggle value={hideAdultContent} onValueChange={onToggleHideAdultContent} />
                  </View>
                </View>
              </View>
            </View>

          </ScrollView>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "transparent" },
  // Panel artik sabit bir yuzde yukseklik yerine, videonun ALT KENARINDAN
  // (topOffset, inline style ile verilir) ekranin gercek altina kadar
  // uzaniyor - koseler de video ile ayni hizada SIVRI (yuvarlatma yok).
  sheet: {
    position: "absolute",
    top: 0,
    width: "100%",
    maxWidth: 480,
    alignSelf: "center",
    backgroundColor: "#122238",
    paddingTop: 18,
    paddingBottom: 30,
  },
  // Deneme: panelin en üstünde, hap şeklinde bir sürükleme tutamacı.
  dragHandle: {
    alignSelf: "center",
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.3)",
    marginBottom: 10,
  },
  // DIKKAT: yatay padding artik "sheet"te DEGIL, her satirin KENDI
  // stilinde - boylece asagidaki ayirici cizgiler (borderTopWidth) sheet'in
  // TAM kenarina kadar uzaniyor, sadece icerik (yazi/ikon) ortalanmis kaliyor.
  header: { color: "#FFFFFF", fontSize: 12, fontWeight: "700", letterSpacing: 1, marginBottom: 8, paddingHorizontal: 20, paddingLeft: 34 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 20,
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
  optionItemDisabled: { opacity: 0.4 },
  optionLabel: { color: theme.text, fontSize: 9, fontWeight: "700", textAlign: "center" },
  volumeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  volumeRowNoTopBorder: { paddingTop: 0 },
  volumeLabel: {
    color: theme.textMuted,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
    textAlign: "center",
    paddingHorizontal: 20,
    paddingTop: 1,
  },
  volumeSlider: { flex: 1 },
  verticalVolumeRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "flex-start",
    gap: 20,
    paddingHorizontal: 20,
    paddingTop: 4,
    marginTop: -81,
  },
  verticalVolumeItem: { alignItems: "center", gap: 10, width: 70 },
  translateRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  translateLabelRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  translateLabel: { color: theme.text, fontSize: 14, fontWeight: "600" },
  // Deneme: "Sohbeti otomatik çevir" / "Yetişkin içeriğini gizle" küçültülüp
  // ses çubuklarının yanındaki boş alana sıkıştırıldı.
  compactToggles: { flex: 1, minWidth: 0, gap: 12, justifyContent: "flex-start", alignSelf: "flex-start", marginTop: 65 },
  compactToggleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  compactToggleIcon: { marginLeft: -5 },
  compactToggleLabel: {
    flex: 1,
    minWidth: 0,
    color: theme.text,
    fontSize: 9,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  compactToggleSwitch: { transform: [{ scale: 0.6 }] },
});
