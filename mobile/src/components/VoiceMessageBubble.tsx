import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Play, Pause } from "lucide-react-native";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { formatDuration } from "../utils/format";

interface Props {
  uri: string;
  durationMs?: number | null;
}

/** Sohbette gelen/giden sesli mesaj balonu - duz bir play/pause dugmesi +
 * ilerleme cubugu + sure. expo-audio'nun kendi oynatma durumunu
 * (useAudioPlayerStatus) izler, kendi "playing" state'ini TUTMAZ. */
export default function VoiceMessageBubble({ uri, durationMs }: Props) {
  const player = useAudioPlayer(uri);
  const status = useAudioPlayerStatus(player);
  const duration = status.duration || (durationMs ? durationMs / 1000 : 0);
  const progress = duration > 0 ? Math.min(1, status.currentTime / duration) : 0;

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
        {status.playing ? <Pause size={16} color="#FFFFFF" /> : <Play size={16} color="#FFFFFF" />}
      </View>
      <View style={styles.trackWrap}>
        <View style={styles.track}>
          <View style={[styles.trackFill, { width: `${progress * 100}%` }]} />
        </View>
        <Text style={styles.time}>{formatDuration(status.playing || status.currentTime > 0 ? status.currentTime : duration)}</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 10, minWidth: 180, paddingVertical: 4 },
  playBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  trackWrap: { flex: 1, gap: 4 },
  track: { height: 3, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.25)", overflow: "hidden" },
  trackFill: { height: "100%", backgroundColor: "#FFFFFF" },
  time: { color: "rgba(255,255,255,0.85)", fontSize: 11 },
});
