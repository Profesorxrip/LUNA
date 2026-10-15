import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { StyleSheet, View } from "react-native";
import { useVideoPlayer, VideoView, type AudioTrack, type SubtitleTrack } from "expo-video";
import { isMuteOnOtherAudioEnabled, audioMixingModeFor } from "../utils/audioSettings";

/** .m3u8 (HLS) ve .mp4 dogrudan stream linkleri icin native oynatici.
 * expo-video, react-native-video'nun aksine Expo Go'da CALISIR (ozel
 * "development build" gerektirmez) ve HLS'i native olarak destekler. */
export interface HlsPlayerHandle {
  play: () => void;
  pause: () => void;
  seekTo: (seconds: number) => void;
  loadVideo: (url: string, startSeconds?: number) => void;
  getCurrentTime: () => number;
  setVolume: (volume: number) => void;
  setPlaybackRate: (rate: number) => void;
  // Asagidaki ucu de expo-video'nun RESMI, belgelenmis track API'lerini
  // kullanir (availableSubtitleTracks/availableAudioTracks, bkz. "sourceLoad"
  // event'i asagida) - YouTube'daki gibi tahmin/belgelenmemis bir API degil.
  // SADECE native'de (iOS/Android) gercek veri doner - web'de expo-video'nun
  // KENDI implementasyonu (VideoPlayer.web.tsx) bu alanlari hep bos birakir.
  setSubtitlesEnabled: (enabled: boolean) => void;
  setDubTrack: (index: number) => void;
}

interface Props {
  url: string | null;
  onStateChange?: (isPlaying: boolean, currentTime: number) => void;
  onBuffering?: (isBuffering: boolean) => void;
  onDuration?: (seconds: number) => void;
  onEnded?: () => void;
  fullscreen?: boolean;
  // Video GERCEKTEN altyazi track'i iceriyorsa true - bkz. yukaridaki yorum.
  onSubtitlesAvailabilityChange?: (available: boolean) => void;
  // Video GERCEKTEN birden fazla ses parcasiyla (dublaj) geldiyse dil
  // etiketlerinin listesi - MediaPlayer.tsx'teki "dub" kavramiyla AYNI
  // (YouTube'daki setDubTrack ile ayni imzayi paylasir).
  onDubTracksChange?: (labels: string[]) => void;
  // Su an oynayan video track'inin GERCEK cozunurlugu - HLS/mp4'te kalite
  // KULLANICI TARAFINDAN SECILEMEZ (expo-video'da videoTrack salt-okunur,
  // secim adaptif/otomatik) - bu yuzden YouTube'daki gibi bir liste yerine
  // sadece bilgi amacli gosterilir (bkz. VideoSettingsSheet.tsx).
  onVideoResolutionChange?: (size: { width: number; height: number } | null) => void;
}

const HlsPlayer = forwardRef<HlsPlayerHandle, Props>(
  (
    {
      url,
      onStateChange,
      onBuffering,
      onDuration,
      onEnded,
      fullscreen,
      onSubtitlesAvailabilityChange,
      onDubTracksChange,
      onVideoResolutionChange,
    },
    ref
  ) => {
  const player = useVideoPlayer(url, (p) => {
    p.loop = false;
    p.timeUpdateEventInterval = 1;
    // Ayarlar ekranindaki "Baska Ses Calarken Sessize Al" - acikken LUNA
    // baska uygulamalarin sesiyle ayni anda calabiliyor (bkz. src/utils/audioSettings.ts).
    isMuteOnOtherAudioEnabled().then((enabled) => {
      p.audioMixingMode = audioMixingModeFor(enabled);
    });
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
  const callbacksRef = useRef({
    onStateChange,
    onBuffering,
    onDuration,
    onEnded,
    onSubtitlesAvailabilityChange,
    onDubTracksChange,
    onVideoResolutionChange,
  });
  callbacksRef.current = {
    onStateChange,
    onBuffering,
    onDuration,
    onEnded,
    onSubtitlesAvailabilityChange,
    onDubTracksChange,
    onVideoResolutionChange,
  };
  // "moov" atomu dosyanin SONUNDA olan (faststart olmayan) mp4'lerde
  // tarayici suresi "readyToPlay" anina kadar cozemeyebilir - bu yuzden
  // sureyi sadece o tek gecisde degil, her timeUpdate tik'inde de kontrol
  // edip degistiginde (0'dan gecerli bir degere) bildiriyoruz.
  const lastDurationRef = useRef(0);
  // setSubtitlesEnabled/setDubTrack cagrilirken GERCEK track nesnesini
  // (sadece bir index degil) player'a geri vermemiz gerekiyor - bu yuzden
  // sourceLoad'dan gelen listeleri burada saklıyoruz.
  const subtitleTracksRef = useRef<SubtitleTrack[]>([]);
  const audioTracksRef = useRef<AudioTrack[]>([]);

  useEffect(() => {
    const playingSub = player.addListener("playingChange", (e) => {
      callbacksRef.current.onStateChange?.(e.isPlaying, player.currentTime);
    });
    const statusSub = player.addListener("statusChange", (e) => {
      // "loading" durumu = tamponlaniyor (buffering).
      callbacksRef.current.onBuffering?.(e.status === "loading");
      if (e.status === "readyToPlay" && player.duration > 0 && player.duration !== lastDurationRef.current) {
        lastDurationRef.current = player.duration;
        callbacksRef.current.onDuration?.(player.duration);
      }
    });
    const timeSub = player.addListener("timeUpdate", () => {
      if (player.duration > 0 && player.duration !== lastDurationRef.current) {
        lastDurationRef.current = player.duration;
        callbacksRef.current.onDuration?.(player.duration);
      }
    });
    // Video dogal olarak sonuna geldiginde (loop=false) tetiklenir.
    const endSub = player.addListener("playToEnd", () => {
      callbacksRef.current.onEnded?.();
    });
    // Video GERCEKTEN birden fazla altyazi/ses parcasiyla (orn. bir HLS
    // master playlist) yuklendiginde TEK seferde hepsini bildirir - bkz.
    // HlsPlayerHandle yorumu (RESMI, belgelenmis expo-video API'si).
    const sourceLoadSub = player.addListener("sourceLoad", (e) => {
      subtitleTracksRef.current = e.availableSubtitleTracks;
      audioTracksRef.current = e.availableAudioTracks;
      callbacksRef.current.onSubtitlesAvailabilityChange?.(e.availableSubtitleTracks.length > 0);
      callbacksRef.current.onDubTracksChange?.(e.availableAudioTracks.map((t) => t.label || t.language));
      const current = e.availableVideoTracks.find((t) => t.id === player.videoTrack?.id) || e.availableVideoTracks[0];
      callbacksRef.current.onVideoResolutionChange?.(current ? current.size : null);
    });
    const videoTrackSub = player.addListener("videoTrackChange", (e) => {
      callbacksRef.current.onVideoResolutionChange?.(e.videoTrack ? e.videoTrack.size : null);
    });
    return () => {
      playingSub.remove();
      statusSub.remove();
      timeSub.remove();
      endSub.remove();
      sourceLoadSub.remove();
      videoTrackSub.remove();
    };
  }, [player]);

  useImperativeHandle(ref, () => ({
    play: () => player.play(),
    pause: () => player.pause(),
    seekTo: (seconds: number) => {
      player.currentTime = seconds;
    },
    loadVideo: (newUrl: string, startSeconds = 0) => {
      // Yeni video - eskisinin altyazi/dublaj durumu gecerli degil, "sourceLoad"
      // yeni video icin GERCEK durumu bildirene kadar "yok" varsay.
      subtitleTracksRef.current = [];
      audioTracksRef.current = [];
      callbacksRef.current.onSubtitlesAvailabilityChange?.(false);
      callbacksRef.current.onDubTracksChange?.([]);
      callbacksRef.current.onVideoResolutionChange?.(null);
      player
        .replaceAsync(newUrl)
        .then(() => {
          player.currentTime = startSeconds;
          player.play();
        })
        .catch(() => {});
    },
    getCurrentTime: () => player.currentTime,
    setVolume: (volume: number) => {
      player.volume = volume;
    },
    setPlaybackRate: (rate: number) => {
      player.playbackRate = rate;
    },
    setSubtitlesEnabled: (enabled: boolean) => {
      try {
        if (!enabled) {
          player.subtitleTrack = null;
          return;
        }
        const tracks = subtitleTracksRef.current;
        const preferred = tracks.find((t) => t.isDefault) || tracks[0];
        if (preferred) player.subtitleTrack = preferred;
      } catch {
        // yoksay - ornegin web'de bu alanlar hep bos/no-op
      }
    },
    setDubTrack: (index: number) => {
      try {
        const track = audioTracksRef.current[index];
        if (track) player.audioTrack = track;
      } catch {
        // yoksay
      }
    },
  }));

  return (
    <View style={[styles.container, fullscreen && styles.containerFullscreen]}>
      {/* nativeControls=false - artik RoomScreen'deki ozel VideoControlsOverlay
          kullaniliyor (Rave'deki gibi) - iki ayri kontrol seti ust uste
          gorunmesin diye.
          surfaceType="textureView" - Android'de varsayilan "surfaceView"
          kendi native katmaninda cizildigi icin VideoControlsOverlay/
          NowPlayingBar gibi UZERINE binen View'ler (ozellikle tam ekran
          yatay modda) gorunmeyebiliyordu - expo-video'nun kendi
          dokumantasyonu ("overlapping video views") bu TAM senaryo icin
          textureView'i oneriyor. */}
      <VideoView style={styles.video} player={player} nativeControls={false} contentFit="contain" surfaceType="textureView" />
    </View>
  );
  }
);

const styles = StyleSheet.create({
  // flex:1 - genislik/aspectRatio hesabina GUVENMIYORUZ artik, parent
  // (mediaSection) zaten kesin piksel 16:9 boyutunda (bkz. RoomScreen.tsx) -
  // bu kutu sadece onu doldursun yeter.
  container: { flex: 1, backgroundColor: "#000" },
  containerFullscreen: { flex: 1 },
  video: { width: "100%", height: "100%" },
});

export default HlsPlayer;
