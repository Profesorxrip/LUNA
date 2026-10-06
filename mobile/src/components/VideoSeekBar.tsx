import { useRef, useState } from "react";
import { PanResponder, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Icon from "./Icon";
import { theme } from "../theme";

interface Props {
  positionSeconds: number;
  durationSeconds: number | null;
  canSeek: boolean;
  onSeek: (seconds: number) => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
}

function formatTime(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Videonun HEMEN ALTINDA, solup kaybolmayan (VideoControlsOverlay'den
 * farkli olarak) kalici ilerletme cubugu - Rave'deki "su an oynatiliyor"
 * barindaki surukleyerek atlama ve tam ekran butonunun karsiligi. */
export default function VideoSeekBar({
  positionSeconds,
  durationSeconds,
  canSeek,
  onSeek,
  isFullscreen,
  onToggleFullscreen,
}: Props) {
  const [dragFraction, setDragFraction] = useState<number | null>(null);
  const barWidthRef = useRef(0);

  const duration = durationSeconds && durationSeconds > 0 ? durationSeconds : 0;
  const liveFraction = duration > 0 ? Math.min(1, Math.max(0, positionSeconds / duration)) : 0;
  const fraction = dragFraction ?? liveFraction;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => canSeek && duration > 0,
      onMoveShouldSetPanResponder: () => canSeek && duration > 0,
      onPanResponderGrant: (evt) => {
        if (barWidthRef.current > 0) setDragFraction(Math.min(1, Math.max(0, evt.nativeEvent.locationX / barWidthRef.current)));
      },
      onPanResponderMove: (evt) => {
        if (barWidthRef.current > 0) setDragFraction(Math.min(1, Math.max(0, evt.nativeEvent.locationX / barWidthRef.current)));
      },
      onPanResponderRelease: () => {
        setDragFraction((frac) => {
          if (frac !== null) onSeek(frac * duration);
          return null;
        });
      },
    })
  ).current;

  const displaySeconds = dragFraction !== null ? dragFraction * duration : positionSeconds;

  return (
    <View style={styles.row}>
      <Text style={styles.time}>{formatTime(displaySeconds)}</Text>
      <View
        style={styles.track}
        onLayout={(e) => {
          barWidthRef.current = e.nativeEvent.layout.width;
        }}
        {...(canSeek ? panResponder.panHandlers : {})}
      >
        <View style={styles.trackBg} />
        <View style={[styles.trackFill, { width: `${fraction * 100}%` }]} />
        {canSeek && <View style={[styles.thumb, { left: `${fraction * 100}%` }]} />}
      </View>
      <Text style={styles.time}>{duration > 0 ? formatTime(duration) : "--:--"}</Text>
      <TouchableOpacity onPress={onToggleFullscreen} hitSlop={10} style={styles.fullscreenTouch}>
        <Icon name={isFullscreen ? "collapse" : "expand"} size={18} color={theme.text} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 6 },
  time: { color: theme.textMuted, fontSize: 11, fontWeight: "600", minWidth: 36 },
  track: { flex: 1, height: 20, justifyContent: "center" },
  trackBg: { height: 3, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.2)" },
  trackFill: { position: "absolute", height: 3, borderRadius: 2, backgroundColor: theme.accent },
  thumb: {
    position: "absolute",
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: theme.accent,
    marginLeft: -6,
  },
  fullscreenTouch: { padding: 4 },
});
