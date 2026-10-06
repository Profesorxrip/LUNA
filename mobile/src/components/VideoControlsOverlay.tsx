import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Icon from "./Icon";

interface Props {
  isPlaying: boolean;
  canControlTransport: boolean;
  liked: boolean;
  onToggleLike: () => void;
  onPlayPause: () => void;
  onSkip: (deltaSeconds: number) => void;
  showSkipNext: boolean;
  onSkipNext: () => void;
}

const AUTO_HIDE_MS = 3000;

/** Rave'deki gibi videonun UZERINE binen kontroller - normalde gizli,
 * videoya dokununca belirip, OYNATILIYORKEN birkac saniye sonra kendiliginden
 * kayboluyor (duraklatilmisken SABIT kalir - aksi halde devam ettirecek
 * buton gorunmez olurdu). Begeni (ve "vote" modunda sadece host icin
 * "sıradakine gec") de ayni katmanda, Rave'deki gibi - ikisi de transport
 * kontrolu OLMASA bile (begeni herkese acik) ayni gorunup/gizlenen sette. */
export default function VideoControlsOverlay({
  isPlaying,
  canControlTransport,
  liked,
  onToggleLike,
  onPlayPause,
  onSkip,
  showSkipNext,
  onSkipNext,
}: Props) {
  const [visible, setVisible] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function scheduleAutoHide(playing: boolean) {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (playing) hideTimer.current = setTimeout(() => setVisible(false), AUTO_HIDE_MS);
  }

  function handleToggle() {
    setVisible((v) => {
      const next = !v;
      if (next) scheduleAutoHide(isPlaying);
      return next;
    });
  }

  // Oynat/duraklat durumu disaridan (sunucudan) degisince - gorunurken
  // gizlenme sayacini o yeni duruma gore sifirdan baslatiyoruz.
  useEffect(() => {
    if (visible) scheduleAutoHide(isPlaying);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying]);

  useEffect(
    () => () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    },
    []
  );

  return (
    <TouchableOpacity style={styles.touchArea} activeOpacity={1} onPress={handleToggle}>
      {visible && (
        <>
          <View style={styles.topRow}>
            <TouchableOpacity style={styles.smallIconTouch} onPress={onToggleLike} hitSlop={10}>
              <Icon name={liked ? "heart" : "heartOutline"} size={20} color={liked ? "#E34848" : "#FFFFFF"} />
            </TouchableOpacity>
            {showSkipNext && (
              <TouchableOpacity style={styles.smallIconTouch} onPress={onSkipNext} hitSlop={10}>
                <Icon name="fastForward" size={18} color="#FFFFFF" />
              </TouchableOpacity>
            )}
          </View>

          {canControlTransport && (
            <View style={styles.centerRow}>
              <TouchableOpacity style={styles.skipTouch} onPress={() => onSkip(-10)} hitSlop={10}>
                <Icon name="rotateCcw" size={26} color="#FFFFFF" />
                <Text style={styles.skipLabel}>10</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.playTouch} onPress={onPlayPause} hitSlop={10}>
                <Icon name={isPlaying ? "pause" : "play"} size={30} color="#FFFFFF" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.skipTouch} onPress={() => onSkip(10)} hitSlop={10}>
                <Icon name="rotateCw" size={26} color="#FFFFFF" />
                <Text style={styles.skipLabel}>10</Text>
              </TouchableOpacity>
            </View>
          )}
        </>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  touchArea: { ...StyleSheet.absoluteFill, justifyContent: "center" },
  topRow: { position: "absolute", top: 10, left: 10, flexDirection: "row", gap: 14 },
  smallIconTouch: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(0,0,0,0.4)",
    alignItems: "center",
    justifyContent: "center",
  },
  centerRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 28 },
  skipTouch: { alignItems: "center", justifyContent: "center" },
  skipLabel: { position: "absolute", color: "#FFFFFF", fontSize: 9, fontWeight: "700", top: 10 },
  playTouch: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
});
