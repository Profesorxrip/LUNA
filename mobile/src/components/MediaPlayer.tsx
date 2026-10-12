import { forwardRef, useImperativeHandle, useRef } from "react";
import { Linking, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import type { MediaSource } from "../services/socket";
import { theme } from "../theme";
import YouTubePlayer, { YouTubePlayerHandle } from "./YouTubePlayer";
import HlsPlayer, { HlsPlayerHandle } from "./HlsPlayer";

/** Kaynak turune gore dogru oynaticiya yonlendiren tek bir bilesen.
 * "external" (Netflix/Prime/Disney+/HBO Max/Twitch kanal sayfasi vb.)
 * icin oynatici GOSTERILMEZ - sadece platformu acan bir buton gosterilir,
 * senkron/play-pause kontrolu yapilmaz (bkz. rooms.ts'teki aciklama). */
export interface MediaPlayerHandle {
  play: () => void;
  pause: () => void;
  seekTo: (seconds: number) => void;
  loadVideo: (url: string, startSeconds?: number) => void;
  getCurrentTime: () => Promise<number>;
  // volume: 0..1 - "external" (DRM'li) kaynaklarda gercek bir oynaticimiz
  // olmadigi icin no-op (bkz. asagidaki "external" render dali).
  setVolume: (volume: number) => void;
  // Video Ayarlari sayfasindaki ("sağ üstteki çark") kisisel/yerel
  // tercihler - sunucuya gonderilmez, diger katilimcilari ETKILEMEZ.
  // setPlaybackRate hem YouTube hem HLS/mp4'te calisir. setQuality/
  // setSubtitlesEnabled SADECE YouTube'da anlamli (bkz. YouTubePlayer.tsx) -
  // diger kaynak turlerinde no-op.
  setPlaybackRate: (rate: number) => void;
  setQuality: (quality: string) => void;
  setSubtitlesEnabled: (enabled: boolean) => void;
}

interface Props {
  source: MediaSource | null;
  onStateChange?: (isPlaying: boolean, currentTime: number) => void;
  onBuffering?: (isBuffering: boolean) => void;
  onDuration?: (seconds: number) => void;
  onEnded?: () => void;
  // Tam ekran yatay moddaysa (bkz. RoomScreen) sabit 16:9 kutu yerine
  // verilen TUM alani (artik ekranin tamami) doldurur.
  fullscreen?: boolean;
}

const MediaPlayer = forwardRef<MediaPlayerHandle, Props>(({ source, onStateChange, onBuffering, onDuration, onEnded, fullscreen }, ref) => {
  const youtubeRef = useRef<YouTubePlayerHandle>(null);
  const hlsRef = useRef<HlsPlayerHandle>(null);

  useImperativeHandle(ref, () => ({
    play: () => (source?.type === "youtube" ? youtubeRef.current?.play() : hlsRef.current?.play()),
    pause: () => (source?.type === "youtube" ? youtubeRef.current?.pause() : hlsRef.current?.pause()),
    seekTo: (seconds) => (source?.type === "youtube" ? youtubeRef.current?.seekTo(seconds) : hlsRef.current?.seekTo(seconds)),
    loadVideo: (url, startSeconds) =>
      source?.type === "youtube" ? youtubeRef.current?.loadVideo(url, startSeconds) : hlsRef.current?.loadVideo(url, startSeconds),
    getCurrentTime: async () => {
      if (source?.type === "youtube") return (await youtubeRef.current?.getCurrentTime()) ?? 0;
      return hlsRef.current?.getCurrentTime() ?? 0;
    },
    setVolume: (volume) => (source?.type === "youtube" ? youtubeRef.current?.setVolume(volume) : hlsRef.current?.setVolume(volume)),
    setPlaybackRate: (rate) =>
      source?.type === "youtube" ? youtubeRef.current?.setPlaybackRate(rate) : hlsRef.current?.setPlaybackRate(rate),
    setQuality: (quality) => {
      if (source?.type === "youtube") youtubeRef.current?.setQuality(quality);
    },
    setSubtitlesEnabled: (enabled) => {
      if (source?.type === "youtube") youtubeRef.current?.setSubtitlesEnabled(enabled);
    },
  }));

  if (!source) {
    return (
      <View style={[styles.placeholder, fullscreen && styles.placeholderFullscreen]}>
        <Text style={styles.placeholderText}>Henuz bir medya secilmedi</Text>
      </View>
    );
  }

  if (source.type === "external") {
    return (
      <View style={[styles.placeholder, fullscreen && styles.placeholderFullscreen]}>
        <Text style={styles.placeholderIcon}>🔗</Text>
        <Text style={styles.placeholderTitle}>{source.label || "Harici platform"}</Text>
        <Text style={styles.placeholderText}>
          Bu platform DRM korumasi kullandigi icin otomatik senkron desteklenmiyor. Kendi hesabinla acip
          izleyebilirsin - sohbet ve sesli sohbet odada acik kalmaya devam eder.
        </Text>
        <TouchableOpacity style={styles.openButton} onPress={() => Linking.openURL(source.url)}>
          <Text style={styles.openButtonText}>{source.label} 'i Ac</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (source.type === "youtube") {
    return (
      <YouTubePlayer
        ref={youtubeRef}
        videoId={source.url}
        onStateChange={onStateChange}
        onBuffering={onBuffering}
        onDuration={onDuration}
        onEnded={onEnded}
        fullscreen={fullscreen}
      />
    );
  }

  // hls / mp4
  return (
    <HlsPlayer
      ref={hlsRef}
      url={source.url}
      onStateChange={onStateChange}
      onBuffering={onBuffering}
      onDuration={onDuration}
      onEnded={onEnded}
      fullscreen={fullscreen}
    />
  );
});

const styles = StyleSheet.create({
  placeholder: {
    width: "100%",
    aspectRatio: 16 / 9,
    backgroundColor: theme.surface,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    gap: 8,
  },
  placeholderFullscreen: { flex: 1, aspectRatio: undefined, height: "100%" },
  placeholderIcon: { fontSize: 32 },
  placeholderTitle: { color: theme.text, fontSize: 18, fontWeight: "700" },
  placeholderText: { color: theme.textMuted, fontSize: 13, textAlign: "center" },
  openButton: { marginTop: 8, backgroundColor: theme.accent, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 20 },
  openButtonText: { color: "#04140D", fontWeight: "700" },
});

export default MediaPlayer;
