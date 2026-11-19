import React, { useEffect, useMemo } from "react";
import { View, TouchableOpacity, StyleSheet } from "react-native";
import { Play, Pause } from "lucide-react-native";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { formatDuration } from "../utils/format";

interface Props {
  uri: string;
  durationMs?: number | null;
  // Sure etiketi artik bu bilesenin KENDI icinde cizilmiyor - DMScreen'deki
  // alt bilgi satirina (gonderim saatiyle AYNI hizaya) tasinabilsin diye
  // deger her degistiginde bu callback ile yukari bildiriliyor.
  onTimeLabel?: (label: string) => void;
}

const BAR_COUNT = 24;

// uri'ye gore SABIT (her render'da ayni, mesajdan mesaja farkli) sozde-rastgele
// cubuk yukseklikleri - gercek bir ses analizi yapmiyoruz, sadece gercekci
// goruneb bir waveform deseni uretiyoruz.
function waveformHeights(seed: string): number[] {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const heights: number[] = [];
  for (let i = 0; i < BAR_COUNT; i++) {
    h = (h * 1103515245 + 12345) >>> 0;
    heights.push(4 + ((h >>> 8) % 1000) / 1000 * 14);
  }
  return heights;
}

/** Sohbette gelen/giden sesli mesaj balonu - beyaz dolgulu play/pause dugmesi +
 * mesaja ozel sabit waveform cubuklari (calinan kisim beyaz, kalani soluk).
 * Sure etiketi artik DMScreen'in alt bilgi satirinda (gonderim saatiyle ayni
 * hizada) gosteriliyor - bkz. onTimeLabel. expo-audio'nun kendi oynatma
 * durumunu (useAudioPlayerStatus) izler, kendi "playing" state'ini TUTMAZ. */
export default function VoiceMessageBubble({ uri, durationMs, onTimeLabel }: Props) {
  const player = useAudioPlayer(uri);
  const status = useAudioPlayerStatus(player);
  const duration = status.duration || (durationMs ? durationMs / 1000 : 0);
  const progress = duration > 0 ? Math.min(1, status.currentTime / duration) : 0;
  const heights = useMemo(() => waveformHeights(uri), [uri]);
  const activeBars = Math.round(progress * BAR_COUNT);
  const timeLabel = formatDuration(status.playing || status.currentTime > 0 ? status.currentTime : duration);

  useEffect(() => {
    onTimeLabel?.(timeLabel);
  }, [timeLabel, onTimeLabel]);

  return (
    <TouchableOpacity
      style={styles.row}
      activeOpacity={0.8}
      onPress={() => {
        if (status.playing) {
          player.pause();
        } else {
          if (status.currentTime >= duration && duration > 0) player.seekTo(0);
          player.play();
        }
      }}
    >
      <View style={styles.playBtn}>
        {status.playing ? <Pause size={13} color="#0F172A" /> : <Play size={13} color="#0F172A" fill="#0F172A" />}
      </View>
      <View style={styles.wave}>
        {heights.map((barHeight, i) => (
          <View key={i} style={[styles.bar, { height: barHeight }, i < activeBars && styles.barActive]} />
        ))}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 8, minWidth: 205 },
  playBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  wave: { flex: 1, flexDirection: "row", alignItems: "center", gap: 2.5, height: 18 },
  bar: { flex: 1, borderRadius: 1, backgroundColor: "rgba(255,255,255,0.3)" },
  barActive: { backgroundColor: "#FFFFFF" },
});
