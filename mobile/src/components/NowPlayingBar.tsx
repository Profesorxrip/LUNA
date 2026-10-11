import { useRef, useState } from "react";
import { PanResponder, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Icon from "./Icon";
import Avatar from "./Avatar";
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
 * AYNI dizilim: lideri avatari EN SOLDA, bar boyunca dikey ortalanmis -
 * saginda ustte video basligi + "Kanal (Platform)" + tam ekran butonu,
 * altinda ilerletme cubugu (avatarin ALTINDAN degil, SAGINDAN baslar).
 * Yuvarlak koseli, hafif seffaf, kenarlardan bosluklu bir kutucuk.
 * VideoSeekBar.tsx'in yerine gecer. */
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
  // Rave'deki gibi TEK satir: "Kanal (Platform)" - kanal adi yoksa (YouTube
  // disindaki kaynaklar) sadece "(Platform)" kalir.
  const subtitle = source?.channelName && badge?.label
    ? `${source.channelName} (${badge.label})`
    : source?.channelName || (badge?.label ? `(${badge.label})` : "");

  return (
    <View style={styles.wrap}>
      <Avatar name={hostName} avatarUrl={hostAvatarUrl} size={38} />
      <View style={styles.rightCol}>
        <View style={styles.infoCol}>
          <Text style={styles.title} numberOfLines={1}>
            {source?.label || "—"}
          </Text>
          {!!subtitle && (
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          )}
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
      </View>
      {/* wrap'in dogrudan cocugu - alignItems:"center" sayesinde rightCol'un
          (baslik+ilerletme cubugu) TAM ortasina, Rave'deki gibi bar
          boyunca dikey ortalanmis olarak oturur. */}
      <TouchableOpacity onPress={onToggleFullscreen} hitSlop={8} style={styles.fullscreenTouch}>
        <Icon name={isFullscreen ? "collapse" : "expand"} size={16} color={theme.text} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  // FriendsScreen.tsx'teki alt sekme cubuguyla (tabBar) BIREBIR AYNI
  // "hap" cercevesi (borderRadius:30, ayni arkaplan rengi/opakligi) -
  // sadece bu barin icerigine gore sagasola uzatilmis hali.
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 10,
    marginVertical: 8,
    borderRadius: 30,
    backgroundColor: "rgba(20,18,16,0.95)",
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  rightCol: { flex: 1, gap: 3, marginLeft: 10 },
  infoCol: {},
  title: { color: theme.text, fontSize: 12, fontWeight: "700" },
  subtitle: { color: theme.textMuted, fontSize: 10, fontWeight: "600", marginTop: 1 },
  fullscreenTouch: {
    width: 24,
    height: 24,
    borderRadius: 12,
    marginLeft: 4,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  seekRow: { flexDirection: "row", alignItems: "center", gap: 8 },
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
