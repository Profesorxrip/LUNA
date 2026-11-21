import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Music, Play, Pause } from "lucide-react-native";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { formatDuration } from "../utils/format";

interface Props {
  uri: string;
  title: string;
}

const MUSIC_COLOR = "#C084FC";

/** Sohbette paylasilan muzik balonu - FileMessageBubble ile AYNI kart
 * olcusu/dolgusu, ama indirme yerine expo-audio ile DOGRUDAN (VoiceMessageBubble
 * ile ayni oynatma motoru) calar - sagdaki ikon play/pause olarak degisir. */
export default function MusicMessageBubble({ uri, title }: Props) {
  const player = useAudioPlayer(uri);
  const status = useAudioPlayerStatus(player);
  const displayTitle = title.replace(/\.[^./]+$/, "");
  const duration = status.duration || 0;
  const timeLabel = formatDuration(status.playing || status.currentTime > 0 ? status.currentTime : duration);

  function handlePress() {
    if (status.playing) {
      player.pause();
    } else {
      if (status.currentTime >= duration && duration > 0) player.seekTo(0);
      player.play();
    }
  }

  return (
    <TouchableOpacity style={styles.card} activeOpacity={0.8} onPress={handlePress}>
      <View style={styles.iconWrap}>
        <Music size={22} color={MUSIC_COLOR} />
      </View>
      <View style={styles.textCol}>
        <Text style={styles.name} numberOfLines={1}>
          {displayTitle}
        </Text>
        <Text style={styles.meta}>{timeLabel}</Text>
      </View>
      <View style={styles.playBtn}>
        {status.playing ? <Pause size={14} color="#1B0B2E" /> : <Play size={14} color="#1B0B2E" fill="#1B0B2E" />}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minWidth: 225,
    maxWidth: 260,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 8,
    padding: 12,
  },
  iconWrap: {
    width: 46,
    height: 46,
    borderRadius: 12,
    backgroundColor: "rgba(192,132,252,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  textCol: { flex: 1, minWidth: 0 },
  name: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
  meta: { color: "rgba(255,255,255,0.75)", fontSize: 12, marginTop: 2 },
  playBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: MUSIC_COLOR,
    alignItems: "center",
    justifyContent: "center",
  },
});
