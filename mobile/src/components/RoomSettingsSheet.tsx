import React, { useState } from "react";
import { Modal, View, Text, TouchableOpacity, StyleSheet, Switch, ScrollView } from "react-native";
import type { PrivacyLevel, PlaybackMode } from "../services/socket";
import Icon, { IconName } from "./Icon";
import SimpleSlider from "./SimpleSlider";
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
}

// Kaydirici tam sola cekilince dokunma hassasiyeti yuzunden TAM 0 yerine
// 0.00x gibi degerler de gelebiliyor - ikon degisimini "kapali" GORUNEN her
// durumda tetiklemek icin kucuk bir esik kullaniyoruz.
const VOLUME_MUTE_THRESHOLD = 0.02;

const PRIVACY_OPTIONS: { key: PrivacyLevel; icon: IconName; label: string }[] = [
  { key: "open", icon: "worldOpen", label: "HERKESE\nAÇIK" },
  { key: "nearby", icon: "radar", label: "YAKIN\nÇEVRE" },
  { key: "friends", icon: "people", label: "ARKADAŞ\nÇEMBERİ" },
  { key: "invite", icon: "inviteKey", label: "ANAHTARLI\nKAPI" },
];

const PRIVACY_DESC: Record<PrivacyLevel, string> = {
  open: "Odanın kapısı herkese açık, davetsiz de gelinir",
  nearby: "Sadece senin civarındaki kullanıcılar bulup katılabilir",
  friends: "Kapı yalnızca arkadaş listendekilere açık",
  invite: "Kapı sadece elinde davet anahtarı (link/kod) olana açılır",
};

const PLAYBACK_OPTIONS: { key: PlaybackMode; icon: IconName; label: string }[] = [
  { key: "leader", icon: "crownFilled", label: "KOMUTA\nLİDER'DE" },
  { key: "playOnly", icon: "playOnlyControl", label: "HERKES\nOYNATIR" },
  { key: "autoplay", icon: "autoplayQueue", label: "AKIŞ\nDURMAZ" },
  { key: "vote", icon: "voteBox", label: "ODA\nOYLASIN" },
];

const PLAYBACK_DESC: Record<PlaybackMode, string> = {
  leader: "Hangi videonun oynayacağına sadece lider karar verir",
  playOnly: "Video seçimi liderde, oynat/durdur herkesin elinde",
  autoplay: "Kesintisiz izleme, sıradaki video kendiliğinden gelir",
  vote: "Herkes video önerir, en çok oyu alan oynar",
};

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
}: Props) {
  const [expanded, setExpanded] = useState<"privacy" | "playback" | "mic" | null>(null);

  const currentPrivacy = PRIVACY_OPTIONS.find((o) => o.key === privacy)!;
  const currentPlayback = PLAYBACK_OPTIONS.find((o) => o.key === playbackMode)!;
  const micOpen = micConnected && !micMuted;

  function toggle(section: "privacy" | "playback" | "mic") {
    if (!isHost) return;
    setExpanded((cur) => (cur === section ? null : section));
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={styles.sheet} onPress={() => {}}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={styles.header}>AYARLAR</Text>

            <TouchableOpacity style={styles.row} onPress={() => toggle("privacy")} disabled={!isHost}>
              <View style={styles.rowText}>
                <Text style={styles.rowLabel}>ERİŞİM</Text>
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
                <Text style={styles.rowLabel}>KONTROL</Text>
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
                <Text style={styles.rowLabel}>SOHBET</Text>
                <Text style={styles.rowDesc}>
                  {micOpen ? "Sesli sohbet açık, herkes mikrofonunu açabilir" : "Sesli sohbet kapalı, kimse mikrofonunu açamaz"}
                </Text>
              </View>
              {isHost && <Icon name={expanded === "mic" ? "chevronRight" : "chevronLeft"} size={16} color={theme.textMuted} />}
              <View style={styles.rowValue}>
                <Icon name={micOpen ? "mic" : "micOff"} size={26} color={theme.text} />
                <Text style={styles.rowValueLabel}>{micOpen ? "AÇIK" : "KAPALI"}</Text>
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
                  <Text style={[styles.optionLabel, micOpen && { color: theme.accent }]}>AÇIK</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.optionItem}
                  onPress={() => {
                    if (micOpen) onMicPress();
                    setExpanded(null);
                  }}
                >
                  <Icon name="micOff" size={28} color={!micOpen ? theme.accent : theme.text} />
                  <Text style={[styles.optionLabel, !micOpen && { color: theme.accent }]}>KAPALI</Text>
                </TouchableOpacity>
              </View>
            )}

            <Text style={styles.volumeLabel}>SOHBET SESİ</Text>
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
            <Text style={styles.volumeLabel}>VİDEO SESİ</Text>
            <View style={[styles.volumeRow, styles.volumeRowNoTopBorder]}>
              <Icon name="volumeMedium" size={20} color={theme.textMuted} />
              <View style={styles.volumeSlider}>
                <SimpleSlider value={videoVolume} onValueChange={onVideoVolumeChange} />
              </View>
              <Icon name={videoVolume <= VOLUME_MUTE_THRESHOLD ? "volumeOff" : "volume"} size={20} color="#FFFFFF" />
            </View>

            <View style={styles.translateRow}>
              <Text style={styles.translateLabel}>Sohbeti otomatik çevir</Text>
              <Switch
                value={autoTranslateChat}
                onValueChange={onToggleAutoTranslate}
                trackColor={{ false: theme.border, true: theme.accent }}
                thumbColor="#FFFFFF"
              />
            </View>

            <View style={styles.translateRow}>
              <Text style={[styles.translateLabel, !isHost && styles.translateLabelDisabled]}>
                Bu oda 18+ içerik barındırıyor
              </Text>
              <Switch
                value={isAdult}
                onValueChange={onToggleAdult}
                disabled={!isHost}
                trackColor={{ false: theme.border, true: theme.danger }}
                thumbColor="#FFFFFF"
              />
            </View>

            <View style={styles.translateRow}>
              <Text style={styles.translateLabel}>Yetişkin içeriğini gizle</Text>
              <Switch
                value={hideAdultContent}
                onValueChange={onToggleHideAdultContent}
                trackColor={{ false: theme.border, true: theme.accent }}
                thumbColor="#FFFFFF"
              />
            </View>

          </ScrollView>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: "#1C1C1E",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 18,
    paddingBottom: 30,
    maxHeight: "78%",
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
  translateLabel: { color: theme.text, fontSize: 14, fontWeight: "600" },
  translateLabelDisabled: { color: theme.textMuted },
});
