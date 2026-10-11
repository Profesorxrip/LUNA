import { useRef, useState } from "react";
import { PanResponder, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { BlurView } from "expo-blur";
import Icon from "./Icon";
import Avatar from "./Avatar";
import PlatformBadge from "./PlatformBadge";
import { badgeInfoForSource } from "../utils/media";
import type { MediaSource } from "../services/socket";
import { theme } from "../theme";

interface Props {
  source: MediaSource | null;
  positionSeconds: number;
  durationSeconds: number | null;
  canSeek: boolean;
  onSeek: (seconds: number) => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  // Su an oynatilan icin kalici, tek bir "kim sectiyi" bilgimiz yok (bkz.
  // backlog) - odanin liderinin avatari/ismi kullanilir, Rave'deki gibi
  // kompakt barin solunda gorunur.
  hostName: string;
  hostAvatarUrl?: string | null;
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

/** Videonun hemen altinda, Rave'deki kompakt "su an oynatiliyor" bariyla
 * AYNI bilgileri tasiyan tek, seffaf/blurlu bir kutucuk: lideri avatari,
 * video basligi, kanal adi (varsa) + platform adi, ince bir ilerletme
 * cubugu ve tam ekran butonu. VideoSeekBar.tsx'in yerine gecer. */
export default function NowPlayingBar({
  source,
  positionSeconds,
  durationSeconds,
  canSeek,
  onSeek,
  isFullscreen,
  onToggleFullscreen,
  hostName,
  hostAvatarUrl,
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
  const badge = badgeInfoForSource(source);

  return (
    <BlurView intensity={40} tint="dark" style={styles.wrap}>
      <View style={styles.topRow}>
        <Avatar name={hostName} avatarUrl={hostAvatarUrl} size={30} />
        <View style={styles.infoCol}>
          <Text style={styles.title} numberOfLines={1}>
            {source?.label || "—"}
          </Text>
          <View style={styles.subtitleRow}>
            {!!source?.channelName && (
              <Text style={styles.subtitle} numberOfLines={1}>
                {source.channelName}
                {!!badge?.label && " · "}
              </Text>
            )}
            {!!badge && (badge.key || badge.faviconUrl) && <PlatformBadge platform={badge.key} faviconUrl={badge.faviconUrl} size={11} />}
            {!!badge?.label && (
              <Text style={styles.subtitle} numberOfLines={1}>
                {badge.label}
              </Text>
            )}
          </View>
        </View>
        <TouchableOpacity onPress={onToggleFullscreen} hitSlop={10} style={styles.fullscreenTouch}>
          <Icon name={isFullscreen ? "collapse" : "expand"} size={16} color={theme.text} />
        </TouchableOpacity>
      </View>

      <View style={styles.seekRow}>
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
      </View>
    </BlurView>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: 10,
    marginVertical: 8,
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: "rgba(20,20,24,0.45)",
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 4,
  },
  topRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  infoCol: { flex: 1 },
  title: { color: theme.text, fontSize: 13, fontWeight: "700" },
  subtitleRow: { flexDirection: "row", alignItems: "center", gap: 3, marginTop: 1 },
  subtitle: { color: theme.textMuted, fontSize: 11, fontWeight: "600" },
  fullscreenTouch: { padding: 4 },
  seekRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  time: { color: theme.textMuted, fontSize: 10, fontWeight: "600", minWidth: 32 },
  track: { flex: 1, height: 16, justifyContent: "center" },
  trackBg: { height: 3, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.2)" },
  trackFill: { position: "absolute", height: 3, borderRadius: 2, backgroundColor: theme.accent },
  thumb: {
    position: "absolute",
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: theme.accent,
    marginLeft: -5,
  },
});
