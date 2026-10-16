import { forwardRef, useImperativeHandle, useRef } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { MediaSource } from "../services/socket";
import { theme } from "../theme";
import YouTubePlayer, { YouTubePlayerHandle } from "./YouTubePlayer";
import HlsPlayer, { HlsPlayerHandle } from "./HlsPlayer";
import DrmWebViewPlayer, { DrmWebViewPlayerHandle } from "./DrmWebViewPlayer";

/** Kaynak turune gore dogru oynaticiya yonlendiren tek bir bilesen.
 * "external" (Netflix/Prime/Disney+/HBO Max/Twitch vb.) icin ARTIK gercek
 * bir oynatici VAR - DrmWebViewPlayer.tsx, platformu uygulama ICINDE bir
 * WebView'de acip GERCEK senkron (oynat/durdur/saniye) sagliyor (Rave'in de
 * yaptigi gibi - bkz. extension/ klasorundeki masaustu tarayici eklentisi,
 * AYNI teknik, AYNI playback:update protokolu). */
export interface MediaPlayerHandle {
  play: () => void;
  pause: () => void;
  seekTo: (seconds: number) => void;
  loadVideo: (url: string, startSeconds?: number) => void;
  // undefined: bir olcum ALINAMADI (orn. YouTube'un WebView'inden zaman
  // asiminda cevap gelmedi) - cagiran taraf (RoomScreen.tsx) bunu "0" GIBI
  // gercek bir deger sanip sunucuya yanlislikla yayinlamamali, bu yuzden
  // sahte bir "0" DONDURMUYORUZ, actual ALINAMADIGINI acikca bildiriyoruz.
  getCurrentTime: () => Promise<number | undefined>;
  // volume: 0..1 - "external" (DRM'li) kaynaklarda gercek bir oynaticimiz
  // olmadigi icin no-op (bkz. asagidaki "external" render dali).
  setVolume: (volume: number) => void;
  // Video Ayarlari sayfasindaki ("sağ üstteki çark") kisisel/yerel
  // tercihler - sunucuya gonderilmez, diger katilimcilari ETKILEMEZ.
  // setPlaybackRate hem YouTube hem HLS/mp4'te calisir. setQuality/
  // setSubtitlesEnabled SADECE YouTube'da anlamli (bkz. YouTubePlayer.tsx) -
  // diger kaynak turlerinde no-op.
  setPlaybackRate: (rate: number) => void;
  // SADECE YouTube'da anlamli (IFrame API'nin kalite secimi) - hls/mp4'te
  // kalite kullanici tarafindan secilemez (bkz. onVideoResolutionChange).
  setQuality: (quality: string) => void;
  // YouTube'da BELGELENMEMIS bir API (captions modulu), hls/mp4'te ise
  // expo-video'nun RESMI subtitleTrack API'si uzerinden GERCEK bir track
  // secip/kaldiriyor (bkz. HlsPlayer.tsx).
  setSubtitlesEnabled: (enabled: boolean) => void;
  // YouTube'da BELGELENMEMIS bir API (multiaudio modulu), hls/mp4'te ise
  // expo-video'nun RESMI audioTrack API'si uzerinden GERCEK bir ses parcasi
  // seciyor (bkz. HlsPlayer.tsx).
  setDubTrack: (index: number) => void;
  // Ayarlar/Profil ekranindaki "Başka Ses Çalarken Sessize Al" tercihinin
  // video panelinden de ANINDA uygulanmasi icin - SADECE hls/mp4'te anlamli
  // (expo-video'nun audioMixingMode'u, bkz. HlsPlayer.tsx), YouTube WebView'i
  // ve "external" (DRM) icin boyle bir native ses oturumu API'si olmadigindan
  // no-op (tercih yine de AsyncStorage'a kaydedilip bir sonraki hls/mp4
  // videoda gecerli olur).
  setMuteOtherAudio: (enabled: boolean) => void;
}

interface Props {
  source: MediaSource | null;
  onStateChange?: (isPlaying: boolean, currentTime: number) => void;
  onBuffering?: (isBuffering: boolean) => void;
  onDuration?: (seconds: number) => void;
  onEnded?: () => void;
  // SADECE "external" (DRM) kaynaklarda gelir - host, uygulama ICI
  // WebView'de Netflix/Disney+ vb. icinde BASKA bir basliga gecince
  // (bkz. DrmWebViewPlayer.tsx) - RoomScreen bunu yeni "source.url" olarak
  // sunucuya bildirir, boylece takipcilerin WebView'i de ayni sayfaya gider.
  onUrlChange?: (url: string) => void;
  // Tam ekran yatay moddaysa (bkz. RoomScreen) sabit 16:9 kutu yerine
  // verilen TUM alani (artik ekranin tamami) doldurur.
  fullscreen?: boolean;
  // Su an oynayan videonun GERCEKTEN altyazisi var mi - YouTube'da captions
  // tracklist'inden (bkz. YouTubePlayer.tsx), hls/mp4'te expo-video'nun
  // RESMI availableSubtitleTracks'inden (bkz. HlsPlayer.tsx) gelir.
  onSubtitlesAvailabilityChange?: (available: boolean) => void;
  // Bu videoda gercekten birden fazla ses parcasi (dublaj) varsa dil
  // etiketlerinin listesi - YouTube'da BELGELENMEMIS "multiaudio" modulunden,
  // hls/mp4'te expo-video'nun RESMI availableAudioTracks'inden gelir.
  onDubTracksChange?: (labels: string[]) => void;
  // SADECE hls/mp4'te gelir (YouTube kendi secilebilir kalite listesini
  // kullanmaya devam eder) - su an oynayan video track'inin GERCEK
  // cozunurlugu, KULLANICI SECEMEZ (bkz. HlsPlayer.tsx onVideoResolutionChange).
  onVideoResolutionChange?: (size: { width: number; height: number } | null) => void;
}

const MediaPlayer = forwardRef<MediaPlayerHandle, Props>(
  (
    {
      source,
      onStateChange,
      onBuffering,
      onDuration,
      onEnded,
      onUrlChange,
      fullscreen,
      onSubtitlesAvailabilityChange,
      onDubTracksChange,
      onVideoResolutionChange,
    },
    ref
  ) => {
  const youtubeRef = useRef<YouTubePlayerHandle>(null);
  const hlsRef = useRef<HlsPlayerHandle>(null);
  const drmRef = useRef<DrmWebViewPlayerHandle>(null);

  // Uc oynatici turu de AYNI imzaya sahip (bkz. MediaPlayerHandle) - hangi
  // ref'in "aktif" oldugunu TEK bir yerde secip, asagidaki her metodun
  // kendi ternary'sini tekrarlamasini onluyoruz.
  function active(): { play: () => void; pause: () => void; seekTo: (s: number) => void; loadVideo: (u: string, s?: number) => void; getCurrentTime: () => number | Promise<number>; setVolume: (v: number) => void; setPlaybackRate: (r: number) => void; setSubtitlesEnabled: (e: boolean) => void; setDubTrack: (i: number) => void } | null {
    if (source?.type === "youtube") return youtubeRef.current;
    if (source?.type === "external") return drmRef.current;
    return hlsRef.current;
  }

  useImperativeHandle(ref, () => ({
    play: () => active()?.play(),
    pause: () => active()?.pause(),
    seekTo: (seconds) => active()?.seekTo(seconds),
    loadVideo: (url, startSeconds) => active()?.loadVideo(url, startSeconds),
    getCurrentTime: async () => {
      try {
        return await active()?.getCurrentTime();
      } catch {
        // YouTubePlayer.tsx: zaman asiminda artik reddediyor (reject), 0
        // ile sessizce cozmuyor - burada da ayni "olcum yok" anlamina gelen
        // undefined'a ceviriyoruz, 0'a DEGIL.
        return undefined;
      }
    },
    setVolume: (volume) => active()?.setVolume(volume),
    setPlaybackRate: (rate) => active()?.setPlaybackRate(rate),
    setQuality: (quality) => {
      if (source?.type === "youtube") youtubeRef.current?.setQuality(quality);
    },
    setSubtitlesEnabled: (enabled) => active()?.setSubtitlesEnabled(enabled),
    setDubTrack: (index) => active()?.setDubTrack(index),
    setMuteOtherAudio: (enabled) => {
      if (source?.type === "hls" || source?.type === "mp4") hlsRef.current?.setMuteOtherAudio(enabled);
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
      <DrmWebViewPlayer
        ref={drmRef}
        url={source.url}
        label={source.label}
        onStateChange={onStateChange}
        onBuffering={onBuffering}
        onDuration={onDuration}
        onEnded={onEnded}
        onUrlChange={onUrlChange}
        fullscreen={fullscreen}
      />
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
        onCaptionsAvailabilityChange={onSubtitlesAvailabilityChange}
        onDubTracksChange={onDubTracksChange}
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
      onSubtitlesAvailabilityChange={onSubtitlesAvailabilityChange}
      onDubTracksChange={onDubTracksChange}
      onVideoResolutionChange={onVideoResolutionChange}
    />
  );
  }
);

const styles = StyleSheet.create({
  // flex:1 - genislik/aspectRatio hesabina GUVENMIYORUZ artik, parent
  // (mediaSection) zaten kesin piksel 16:9 boyutunda (bkz. RoomScreen.tsx) -
  // bu kutu sadece onu doldursun yeter.
  placeholder: {
    flex: 1,
    backgroundColor: theme.surface,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    gap: 8,
  },
  placeholderFullscreen: { flex: 1, height: "100%" },
  placeholderText: { color: theme.textMuted, fontSize: 13, textAlign: "center" },
});

export default MediaPlayer;
