import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Icon from "./Icon";
import { SkipBackIcon, SkipForwardIcon } from "./SkipIcons";
import { theme } from "../theme";

interface Props {
  isPlaying: boolean;
  canControlTransport: boolean;
  liked: boolean;
  onToggleLike: () => void;
  // Su an oynayan videoyu begenen TUM katilimcilarin paylasimli sayisi (bkz.
  // server/src/rooms.ts likeVideo) - sadece "liked" (benim begenim) true
  // ikenki kalbin TAM ORTASINA yaziliyor.
  likeCount?: number;
  onPlayPause: () => void;
  onSkip: (deltaSeconds: number) => void;
  // Onceki video / sıradakine gec butonlari artik HER modda HERKESE
  // gorunur - ama "Liderin Secimi" modunda lider DISINDAKI katilimcilar
  // icin canSkip false gelir: butonlar GIZLENMEZ, soluk renkte ve
  // dokunulamaz gosterilir (digerlerinde, "onceki video"nun gercekten
  // donulecek bir video olmamasi durumuyla AYNI muamele).
  canSkip: boolean;
  hasPreviousVideo: boolean;
  onSkipPrevious: () => void;
  onSkipNext: () => void;
  // "Liderin Secimi" DISINDAKI modlarda bu iki buton artik bir COGUNLUK
  // OYU (bkz. RoomScreen.tsx skipToNext/goToPreviousVideo) - showVoteBadges
  // true'yken butonlarin kosesinde kac kisinin o yonde oy verdigini
  // gosteren kucuk bir rozet belirir (0 oyda rozet gizli).
  showVoteBadges?: boolean;
  nextVoteCount?: number;
  previousVoteCount?: number;
  onSettings: () => void;
  // Tam ekran yatay modda alt bar (mikrofon dahil) gizlendigi icin mikrofon
  // kontrolu buraya, ayarlar cark ikonunun SOLUNA, onunla AYNI boyutta
  // (smallIconTouch) tasiniyor - normal (tam ekran olmayan) moddaysa
  // gosterilmiyor, orada zaten alt bardaki buyuk mikrofon butonu var.
  showMic?: boolean;
  micConnected?: boolean;
  micMuted?: boolean;
  onMicPress?: () => void;
  onMicLongPress?: () => void;
  // Tam ekranda NowPlayingBar'in da butonlarla AYNI anda acilip
  // kapanmasini saglamak icin (bkz. RoomScreen.tsx) - bu bilesenin kendi
  // ic "visible" durumunu disariya bildirir.
  onVisibilityChange?: (visible: boolean) => void;
}

const AUTO_HIDE_MS = 3000;

/** Rave'deki gibi videonun UZERINE binen kontroller - normalde gizli,
 * videoya dokununca belirip, OYNATILIYORKEN birkac saniye sonra kendiliginden
 * kayboluyor (duraklatilmisken SABIT kalir - aksi halde devam ettirecek
 * buton gorunmez olurdu). Ust satirda soldan saga: onceki video, begeni
 * (herkese acik), sıradakine gec - ucu de transport kontrolu OLMASA bile
 * ayni gorunup/gizlenen sette. Onceki/sıradaki butonlari ARTIK HER MODDA
 * HERKESE gorunur - "Liderin Secimi" modunda lider DISINDAKI katilimcilar
 * icin sadece soluk/dokunulamaz kalir (canSkip=false), DIGER modlarda
 * HERKES basabilir ve birer COGUNLUK OYUDUR (bkz. showVoteBadges). */
export default function VideoControlsOverlay({
  isPlaying,
  canControlTransport,
  liked,
  onToggleLike,
  likeCount,
  onPlayPause,
  onSkip,
  canSkip,
  hasPreviousVideo,
  onSkipPrevious,
  onSkipNext,
  showVoteBadges,
  nextVoteCount,
  previousVoteCount,
  onSettings,
  showMic,
  micConnected,
  micMuted,
  onMicPress,
  onMicLongPress,
  onVisibilityChange,
}: Props) {
  const [visible, setVisible] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    onVisibilityChange?.(visible);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

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
          <View style={[styles.topRow, styles.frame]}>
            <TouchableOpacity
              style={styles.framedIconTouch}
              onPress={onSkipPrevious}
              disabled={!canSkip || !hasPreviousVideo}
              hitSlop={10}
            >
              <SkipBackIcon
                size={21}
                color={canSkip && hasPreviousVideo ? "#FFFFFF" : "rgba(255,255,255,0.35)"}
                filled={showVoteBadges && !!previousVoteCount}
              />
              {showVoteBadges && !!previousVoteCount && (
                <View style={styles.voteCountBoxBack}>
                  <Text style={styles.voteCountText}>{previousVoteCount}</Text>
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={styles.framedIconTouch} onPress={onToggleLike} hitSlop={10}>
              <Icon name={liked ? "heart" : "heartOutline"} size={21} color={liked ? "#E34848" : "#FFFFFF"} />
              {liked && !!likeCount && (
                <View style={styles.likeCountBox}>
                  <Text style={styles.likeCountText}>{likeCount}</Text>
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={styles.framedIconTouch} onPress={onSkipNext} disabled={!canSkip} hitSlop={10}>
              <SkipForwardIcon size={21} color={canSkip ? "#FFFFFF" : "rgba(255,255,255,0.35)"} filled={showVoteBadges && !!nextVoteCount} />
              {showVoteBadges && !!nextVoteCount && (
                <View style={styles.voteCountBoxForward}>
                  <Text style={styles.voteCountText}>{nextVoteCount}</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.topRightRow}>
            {showMic && (
              <TouchableOpacity style={styles.smallIconTouch} onPress={onMicPress} onLongPress={onMicLongPress} hitSlop={10}>
                <Icon
                  name={micConnected && micMuted ? "micOff" : "mic"}
                  size={18}
                  color={micConnected && micMuted ? "#E34848" : "#FFFFFF"}
                />
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.smallIconTouch} onPress={onSettings} hitSlop={10}>
              <Icon name="settings" size={21} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          {canControlTransport && (
            <View style={styles.centerRow}>
              <TouchableOpacity style={styles.skipTouch} onPress={() => onSkip(-10)} hitSlop={10}>
                <Icon name="rotateCcw" size={22} color="#FFFFFF" />
                <Text style={styles.skipLabel}>10</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.playTouch} onPress={onPlayPause} hitSlop={10}>
                <Icon name={isPlaying ? "pause" : "play"} size={30} color="#FFFFFF" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.skipTouch} onPress={() => onSkip(10)} hitSlop={10}>
                <Icon name="rotateCw" size={22} color="#FFFFFF" />
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
  // NowPlayingBar'daki "hap" cercevesiyle (wrap stili) BIREBIR AYNI gorunum -
  // onceki/begeni/sonraki ve geri-oynat-ileri gruplari artik ayri ayri
  // dairesel butonlar degil, TEK bir cerceve icinde toplaniyor.
  frame: {
    borderRadius: 999,
    backgroundColor: "rgba(20,18,16,0.95)",
    paddingHorizontal: 10,
    paddingVertical: 2,
  },
  smallIconTouch: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(20,18,16,0.95)",
    alignItems: "center",
    justifyContent: "center",
  },
  framedIconTouch: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  // Oy verilince dolan ucgenin TAM ICINE binen sayi - ucgen sol tarafta
  // (skipBack'te sag tarafta) oldugu icin ikonun ortasina degil, ucgenin
  // kendi merkezine denk gelen sabit bir kutunun icinde (hem yatay hem
  // dikey) ortalaniyor, boylece yazi tipi metriklerinden bagimsiz tam
  // ortalanmis oluyor.
  voteCountBoxForward: {
    position: "absolute",
    left: 4.9,
    top: 9,
    width: 14,
    height: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  voteCountBoxBack: {
    position: "absolute",
    left: 13.1,
    top: 9,
    width: 14,
    height: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  voteCountText: { color: "#04140D", fontSize: 9, fontWeight: "800", lineHeight: 11 },
  // Kalp dolunca (liked=true) TAM ORTASINA binen paylasimli begeni sayisi -
  // ucgendeki gibi kaydirmaya gerek yok, kalp zaten kendi kutusunun (framedIconTouch)
  // merkezinde oldugu icin kutunun kendisi de ayni merkezde.
  likeCountBox: {
    position: "absolute",
    left: 9,
    top: 9,
    width: 14,
    height: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  likeCountText: { color: "#FFFFFF", fontSize: 9, fontWeight: "800", lineHeight: 11 },
  centerRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 28 },
  // Ayarlar carkiyla (smallIconTouch) AYNI mantik - tek bir cerceve yerine
  // her butonun kendi tekli, dairesel arka plani var.
  skipTouch: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(20,18,16,0.95)",
    alignItems: "center",
    justifyContent: "center",
  },
  skipLabel: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "700",
    textAlign: "center",
    lineHeight: 44,
  },
  playTouch: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(20,18,16,0.95)",
    alignItems: "center",
    justifyContent: "center",
  },
});
