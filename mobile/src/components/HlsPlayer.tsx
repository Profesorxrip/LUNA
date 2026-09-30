import { forwardRef, useEffect, useImperativeHandle } from "react";
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
}

const HlsPlayer = forwardRef<HlsPlayerHandle, Props>(({ url, onStateChange, onBuffering, onDuration }, ref) => {
  const player = useVideoPlayer(url, (p) => {
    p.loop = false;
    p.timeUpdateEventInterval = 1;
  });

  // Oynatici olusturulduktan sonra url degisirse (kullanici baska bir link
  // yuklediginde) kaynagi degistir - player instance'i sabit kalir.
  useEffect(() => {
    if (url) player.replaceAsync(url).catch(() => {});
  }, [url, player]);

  useEffect(() => {
    const playingSub = player.addListener("playingChange", (e) => {
      onStateChange?.(e.isPlaying, player.currentTime);
    });
    const statusSub = player.addListener("statusChange", (e) => {
      // "loading" durumu = tamponlaniyor (buffering).
      onBuffering?.(e.status === "loading");
      if (e.status === "readyToPlay" && player.duration > 0) onDuration?.(player.duration);
    });
    return () => {
      playingSub.remove();
      statusSub.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      <VideoView style={styles.video} player={player} nativeControls={false} contentFit="contain" />
    </View>
  );
});

const styles = StyleSheet.create({
  container: { width: "100%", aspectRatio: 16 / 9, backgroundColor: "#000" },
  video: { width: "100%", height: "100%" },
});

export default HlsPlayer;
