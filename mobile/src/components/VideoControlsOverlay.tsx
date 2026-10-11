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
  // Onceki videoya don - SADECE lidere gorunur (showSkipPrevious), ama
  // gorunse bile gercekten donulecek bir video yoksa (ilk videoysa)
  // GIZLENMEZ, soluk renkte ve dokunulamaz gosterilir (hasPreviousVideo).
  showSkipPrevious: boolean;
  hasPreviousVideo: boolean;
  onSkipPrevious: () => void;
  showSkipNext: boolean;
  onSkipNext: () => void;
  onSettings: () => void;
}

const AUTO_HIDE_MS = 3000;

/** Rave'deki gibi videonun UZERINE binen kontroller - normalde gizli,
 * videoya dokununca belirip, OYNATILIYORKEN birkac saniye sonra kendiliginden
 * kayboluyor (duraklatilmisken SABIT kalir - aksi halde devam ettirecek
 * buton gorunmez olurdu). Ust satirda soldan saga: onceki video (sadece
 * lider), begeni (herkese acik), sıradakine gec (sadece lider) - ucu de
 * transport kontrolu OLMASA bile ayni gorunup/gizlenen sette. */
export default function VideoControlsOverlay({
  isPlaying,
  canControlTransport,
  liked,
  onToggleLike,
  onPlayPause,
  onSkip,
  showSkipPrevious,
  hasPreviousVideo,
  onSkipPrevious,
  showSkipNext,
  onSkipNext,
  onSettings,
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
            {showSkipPrevious && (
              <TouchableOpacity
                style={styles.smallIconTouch}
                onPress={onSkipPrevious}
                disabled={!hasPreviousVideo}
                hitSlop={10}
              >
                <Icon name="fastBackward" size={18} color={hasPreviousVideo ? "#FFFFFF" : "rgba(255,255,255,0.35)"} />
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.smallIconTouch} onPress={onToggleLike} hitSlop={10}>
              <Icon name={liked ? "heart" : "heartOutline"} size={20} color={liked ? "#E34848" : "#FFFFFF"} />
            </TouchableOpacity>
            {showSkipNext && (
              <TouchableOpacity style={styles.smallIconTouch} onPress={onSkipNext} hitSlop={10}>
                <Icon name="fastForward" size={18} color="#FFFFFF" />
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.topRightRow}>
            <TouchableOpacity style={styles.smallIconTouch} onPress={onSettings} hitSlop={10}>
              <Icon name="settings" size={18} color="#FFFFFF" />
            </TouchableOpacity>
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
  topRightRow: { position: "absolute", top: 10, right: 10, flexDirection: "row", gap: 14 },
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
