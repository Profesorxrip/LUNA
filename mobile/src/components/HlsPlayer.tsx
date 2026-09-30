import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { StyleSheet, View } from "react-native";
import { useVideoPlayer, VideoView } from "expo-video";

/** .m3u8 (HLS) ve .mp4 dogrudan stream linkleri icin native oynatici.
 * expo-video, react-native-video'nun aksine Expo Go'da CALISIR (ozel
 * "development build" gerektirmez) ve HLS'i native olarak destekler. */
export interface HlsPlayerHandle {
  play: () => void;
  pause: () => void;
  seekTo: (seconds: number) => void;
  loadVideo: (url: string, startSeconds?: number) => void;
  getCurrentTime: () => number;
}

interface Props {
  url: string | null;
  onStateChange?: (isPlaying: boolean, currentTime: number) => void;
  onBuffering?: (isBuffering: boolean) => void;
  onDuration?: (seconds: number) => void;
  onEnded?: () => void;
}

const HlsPlayer = forwardRef<HlsPlayerHandle, Props>(({ url, onStateChange, onBuffering, onDuration, onEnded }, ref) => {
  const player = useVideoPlayer(url, (p) => {
    p.loop = false;
    p.timeUpdateEventInterval = 1;
  });

  // NOT: "url" prop'u degistiginde kaynagi burada AYRICA replaceAsync ile
  // degistirmiyoruz - bunu yapan iki cagiran da (RoomScreen'deki senkron
  // efekti ve selectSource) zaten asagidaki imperative loadVideo() metodunu
  // dogrudan cagiriyor. Burada AYRICA bir useEffect ile url'i izleyip
  // replaceAsync cagirmak, imperative loadVideo() ile AYNI ANDA calisan
  // ikinci bir replaceAsync/play() zinciri yaratip birbirini yariyordu
  // ("play() interrupted by pause()", video kalici pause'da kalirdi).

  // player instance'i sabit kaldigi icin listener'lari SADECE bir kez
  // kuruyoruz - callback'lerin GUNCEL halini her zaman gorebilmek icin ref
  // uzerinden cagiriyoruz, aksi halde (ornegin onEnded icindeki
  // room.playbackMode kontrolu gibi) mount anindaki ESKI kapali degerlerle
  // sonsuza kadar calisirlardi (oda "vote" moduna sonradan gecse bile
  // handleEnded hep ilk render'daki "leader" degerini gorurdu).
  const callbacksRef = useRef({ onStateChange, onBuffering, onDuration, onEnded });
  callbacksRef.current = { onStateChange, onBuffering, onDuration, onEnded };

  useEffect(() => {
    const playingSub = player.addListener("playingChange", (e) => {
      callbacksRef.current.onStateChange?.(e.isPlaying, player.currentTime);
    });
    const statusSub = player.addListener("statusChange", (e) => {
      // "loading" durumu = tamponlaniyor (buffering).
      callbacksRef.current.onBuffering?.(e.status === "loading");
      if (e.status === "readyToPlay" && player.duration > 0) callbacksRef.current.onDuration?.(player.duration);
    });
    // Video dogal olarak sonuna geldiginde (loop=false) tetiklenir.
    const endSub = player.addListener("playToEnd", () => {
      callbacksRef.current.onEnded?.();
    });
    return () => {
      playingSub.remove();
      statusSub.remove();
      endSub.remove();
    };
  }, [player]);

  useImperativeHandle(ref, () => ({
    play: () => player.play(),
    pause: () => player.pause(),
    seekTo: (seconds: number) => {
      player.currentTime = seconds;
    },
    loadVideo: (newUrl: string, startSeconds = 0) => {
      player
        .replaceAsync(newUrl)
        .then(() => {
          player.currentTime = startSeconds;
          player.play();
        })
        .catch(() => {});
    },
    getCurrentTime: () => player.currentTime,
  }));

  return (
    <View style={styles.container}>
      <VideoView style={styles.video} player={player} nativeControls contentFit="contain" />
    </View>
  );
});

const styles = StyleSheet.create({
  container: { width: "100%", aspectRatio: 16 / 9, backgroundColor: "#000" },
  video: { width: "100%", height: "100%" },
});

export default HlsPlayer;
