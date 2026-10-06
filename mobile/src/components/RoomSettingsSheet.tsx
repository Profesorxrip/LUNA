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
  onChangePrivacy: (p: PrivacyLevel) => void;
  onChangePlaybackMode: (m: PlaybackMode) => void;
  onToggleAutoTranslate: (v: boolean) => void;
  onToggleAdult: (v: boolean) => void;
  micConnected: boolean;
  micMuted: boolean;
  onMicPress: () => void;
  onLeaveVoice: () => void;
  volume: number;
  onVolumeChange: (v: number) => void;
  onReport: () => void;
}

const PRIVACY_OPTIONS: { key: PrivacyLevel; icon: IconName; label: string }[] = [
  { key: "open", icon: "globe", label: "AÇIK" },
  { key: "nearby", icon: "pin", label: "YAKINDAKİLER" },
  { key: "friends", icon: "people", label: "SADECE\nARKADAŞLAR" },
  { key: "invite", icon: "invite", label: "SADECE\nDAVET İLE" },
];

const PRIVACY_DESC: Record<PrivacyLevel, string> = {
  open: "Odaya herkes katılabilir",
  nearby: "Sadece yakınındaki kullanıcılar katılabilir",
  friends: "Sadece arkadaşların katılabilir",
  invite: "Sadece davet linki/koduyla katılınır",
};

const PLAYBACK_OPTIONS: { key: PlaybackMode; icon: IconName; label: string }[] = [
  { key: "leader", icon: "crown", label: "LİDERİN\nSEÇİMİ" },
  { key: "playOnly", icon: "play", label: "SADECE\nOYNAT" },
  { key: "autoplay", icon: "fastForward", label: "OTOMATİK\nOYNAT" },
  { key: "vote", icon: "check", label: "HAYDİ\nOYLAYALIM" },
];

const PLAYBACK_DESC: Record<PlaybackMode, string> = {
  leader: "Sadece lider video seçebilir",
  playOnly: "Video secimi liderde, herkes oynatıp durdurabilir",
  autoplay: "Video secimi liderde, herkes oynatıp durdurabilir",
  vote: "Herkes video önerir, oda oylar",
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
  onChangePrivacy,
  onChangePlaybackMode,
  onToggleAutoTranslate,
  onToggleAdult,
  micConnected,
  micMuted,
  onMicPress,
  onLeaveVoice,
  volume,
  onVolumeChange,
  onReport,
}: Props) {
  const [expanded, setExpanded] = useState<"privacy" | "playback" | null>(null);

  const currentPrivacy = PRIVACY_OPTIONS.find((o) => o.key === privacy)!;
  const currentPlayback = PLAYBACK_OPTIONS.find((o) => o.key === playbackMode)!;

  function toggle(section: "privacy" | "playback") {
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
                <Text style={styles.rowLabel}>GİZLİLİK</Text>
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
                <Text style={styles.rowLabel}>PLAYBACK</Text>
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

            <TouchableOpacity style={styles.row} onPress={onMicPress}>
              <View style={styles.rowText}>
                <Text style={styles.rowLabel}>Ses</Text>
                <Text style={styles.rowDesc}>{!micConnected ? "Sesli sohbete katilinmadi" : micMuted ? "Mikrofonlar kapatildi" : "Mikrofon acik"}</Text>
              </View>
              <View style={styles.rowValue}>
                <Icon name={micConnected && !micMuted ? "mic" : "micOff"} size={26} color={theme.text} />
                <Text style={styles.rowValueLabel}>{micConnected && !micMuted ? "AÇIK" : "KAPALI"}</Text>
              </View>
            </TouchableOpacity>

            <View style={styles.volumeRow}>
              <Icon name="mic" size={18} color={theme.textMuted} />
              <View style={styles.volumeSlider}>
                <SimpleSlider value={volume} onValueChange={onVolumeChange} />
              </View>
              <TouchableOpacity onPress={onLeaveVoice} hitSlop={8}>
                <Icon name="phone" size={22} color={micConnected ? theme.danger : theme.textMuted} />
              </TouchableOpacity>
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
              <Text style={styles.translateLabel}>18+ içerik</Text>
              <Switch
                value={isAdult}
                onValueChange={onToggleAdult}
                trackColor={{ false: theme.border, true: theme.danger }}
                thumbColor="#FFFFFF"
              />
            </View>

            <TouchableOpacity style={styles.row} onPress={onReport}>
              <View style={styles.rowText}>
                <Text style={[styles.rowLabel, styles.reportLabel]}>Bu odayı şikayet et</Text>
              </View>
              <Icon name="warning" size={22} color={theme.danger} />
            </TouchableOpacity>
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
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 30,
    maxHeight: "78%",
  },
  header: { color: theme.textMuted, fontSize: 12, fontWeight: "700", letterSpacing: 1, marginBottom: 8 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
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
    paddingBottom: 16,
  },
  optionItem: { alignItems: "center", width: 70, gap: 6 },
  optionLabel: { color: theme.text, fontSize: 9, fontWeight: "700", textAlign: "center" },
  volumeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  volumeSlider: { flex: 1 },
  translateRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 16,
    borderTopWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  translateLabel: { color: theme.text, fontSize: 14, fontWeight: "600" },
  reportLabel: { color: theme.danger, fontSize: 15 },
});
