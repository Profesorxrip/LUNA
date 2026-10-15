import React, { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { StyleSheet } from "react-native";
import { WebView } from "react-native-webview";

export interface YouTubePlayerHandle {
  play: () => void;
  pause: () => void;
  seekTo: (seconds: number) => void;
  loadVideo: (videoId: string, startSeconds?: number) => void;
  getCurrentTime: () => Promise<number>;
  // volume: 0..1 - YouTube IFrame API 0-100 bekledigi icin icerde *100 yapilir.
  setVolume: (volume: number) => void;
  setPlaybackRate: (rate: number) => void;
  // quality: "default"(Otomatik)/"hd1080"/"hd720"/"large"(480p)/"medium"(360p) -
  // bkz. VideoSettingsSheet.tsx QUALITY_OPTIONS. YouTube, video icin o kalite
  // mevcut degilse sessizce yoksayar (resmi IFrame API davranisi).
  setQuality: (quality: string) => void;
  // Videonun GERCEKTEN altyazisi yoksa hicbir gorsel etkisi olmaz (YouTube
  // IFrame API'nin captions modulu boyle calisir) - bu bizim kontrolumuzde degil.
  setSubtitlesEnabled: (enabled: boolean) => void;
  // index: onDubTracksChange ile bildirilen listedeki sira. "multiaudio"
  // modulu YouTube'un RESMI IFrame API dokumantasyonunda YOK - native
  // uygulamadaki "Ses Parçası" ozelligiyle ayni sey ama BELGELENMEMIS bir
  // ic modul uzerinden deneniyor (bkz. asagidaki onApiChange). Calismazsa
  // sessizce hicbir etkisi olmaz.
  setDubTrack: (index: number) => void;
}

interface Props {
  videoId: string | null;
  onStateChange?: (isPlaying: boolean, currentTime: number) => void;
  onBuffering?: (isBuffering: boolean) => void;
  onDuration?: (seconds: number) => void;
  onEnded?: () => void;
  fullscreen?: boolean;
  // Bu SPESIFIK videonun GERCEKTEN altyazi track'i var mi - VideoSettingsSheet
  // "Altyazılar" satirini sadece bu true oldugunda gosterebilsin diye
  // (bkz. asagidaki onApiChange/captions tracklist sorgusu).
  onCaptionsAvailabilityChange?: (available: boolean) => void;
  // Bu videoda gercekten BIRDEN FAZLA ses parcasi (dublaj) varsa dil
  // etiketlerinin listesi - bkz. setDubTrack yorumu, BELGELENMEMIS API.
  onDubTracksChange?: (labels: string[]) => void;
}

// YouTube IFrame API'sini yukleyip play/pause/seekTo komutlarini
// React Native tarafindan postMessage ile kontrol edebilecegimiz basit bir
// HTML sayfasi. player durumu degistiginde (oynat/durdur) React Native'e
// geri mesaj gonderiyor.
//
// DIKKAT: ilk video artik buraya DOGRUDAN (sablonla) gomuluyor, RN'den
// postMessage ile "loadVideo" beklemiyor. Eskiden WebView'in "onLoadEnd"i
// (HTML belgesinin kendisi hazir oldugunda) ateslenir ateslenmez RN hemen
// postMessage ile ilk videoyu gondermeye calisiyordu - ama o an disaridaki
// "https://www.youtube.com/iframe_api" script'i HENUZ inip calismamis
// olabiliyordu (onYouTubeIframeAPIReady henuz hic cagrilmamis, "player"
// degiskeni hala undefined), bu durumda handleMessage'daki "if (!player)
// return" o ilk mesaji SESSIZCE cope atiyordu - video HICBIR ZAMAN
// acilmiyordu (ekranda duz siyah kalirdi). videoId'yi dogrudan player
// constructor'ina gomerek bu yarisi tamamen ortadan kaldiriyoruz - oynatici
// HAZIR oldugu anda zaten DOGRU videoyla olusuyor.
function buildPlayerHtml(initialVideoId: string | null): string {
  return `
<!DOCTYPE html>
<html>
<head><style>
  html,body{margin:0;padding:0;width:100%;height:100%;background:#000;overflow:hidden;}
  #player{width:100%;height:100%;}
</style></head>
<body>
  <div id="player"></div>
  <script src="https://www.youtube.com/iframe_api"></script>
  <script>
    var player;
    var dubTracks = [];
    function onYouTubeIframeAPIReady() {
      player = new YT.Player('player', {
        height: '100%',
        width: '100%',
        videoId: ${JSON.stringify(initialVideoId || "")},
        // controls:0 - YouTube'un kendi oynat/duraklat/sarma cubugu YERINE
        // artik RoomScreen'deki ozel VideoControlsOverlay kullaniliyor
        // (Rave'deki gibi) - iki ayri kontrol seti ust uste gorunmesin diye.
        playerVars: { playsinline: 1, controls: 0 },
        events: {
          onReady: function () {
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'duration', seconds: player.getDuration() }));
            // Altyazi modulunu SESSIZCE yukluyoruz - bu bir track'i GOSTERMEZ,
            // sadece onApiChange'in tracklist'i sorgulayabilmesi icin gerekli
            // (bkz. onApiChange asagida).
            player.loadModule('captions');
            // "multiaudio" RESMI dokumante edilmemis bir modul - varsa
            // (video gercekten birden fazla ses parcasiyla yuklenmisse)
            // onApiChange'de tracklist doluyor, yoksa try/catch sessizce
            // yutuyor ve dublaj hep "Kullanılamıyor" kaliyor.
            try {
              player.loadModule('multiaudio');
            } catch (e) {}
          },
          onApiChange: function () {
            try {
              var tracks = player.getOption('captions', 'tracklist') || [];
              window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'captionsAvailable', available: tracks.length > 0 }));
            } catch (e) {}
            try {
              dubTracks = player.getOption('multiaudio', 'tracklist') || [];
              var labels = dubTracks.map(function (t, i) {
                return (t && (t.languageName || t.languageCode)) || ('Dil ' + (i + 1));
              });
              window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'dubTracksAvailable', labels: labels }));
            } catch (e) {}
          },
          onStateChange: function (e) {
            if (e.data === YT.PlayerState.BUFFERING) {
              window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'buffering', isBuffering: true }));
              return;
            }
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'buffering', isBuffering: false }));
            if (e.data === YT.PlayerState.PLAYING || e.data === YT.PlayerState.PAUSED) {
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'stateChange', isPlaying: e.data === YT.PlayerState.PLAYING, currentTime: player.getCurrentTime(),
              }));
              window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'duration', seconds: player.getDuration() }));
            }
            if (e.data === YT.PlayerState.ENDED) {
              window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ended' }));
            }
          },
        },
      });
    }
    document.addEventListener('message', handleMessage);
    window.addEventListener('message', handleMessage);
    function handleMessage(event) {
      var msg = JSON.parse(event.data);
      if (!player) return;
      if (msg.type === 'play') player.playVideo();
      if (msg.type === 'pause') player.pauseVideo();
      if (msg.type === 'seekTo') player.seekTo(msg.seconds, true);
      if (msg.type === 'loadVideo') {
        player.loadVideoById(msg.videoId, msg.startSeconds || 0);
        // Yeni video - eski videonun altyazi/dublaj durumunu hemen temizleyip
        // yeni video icin tekrar sorguluyoruz (bkz. onApiChange).
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'captionsAvailable', available: false }));
        dubTracks = [];
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'dubTracksAvailable', labels: [] }));
        player.loadModule('captions');
        try {
          player.loadModule('multiaudio');
        } catch (e) {}
      }
      if (msg.type === 'setDubTrack') {
        try {
          if (dubTracks[msg.index]) player.setOption('multiaudio', 'audioTrack', dubTracks[msg.index]);
        } catch (e) {}
      }
      if (msg.type === 'setVolume') player.setVolume(msg.volume);
      if (msg.type === 'setPlaybackRate') player.setPlaybackRate(msg.rate);
      if (msg.type === 'setQuality') player.setPlaybackQuality(msg.quality);
      if (msg.type === 'setSubtitles') {
        if (msg.enabled) player.loadModule('captions');
        else player.unloadModule('captions');
      }
      if (msg.type === 'getCurrentTime') {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'currentTime', requestId: msg.requestId, currentTime: player.getCurrentTime(),
        }));
      }
    }
  </script>
</body>
</html>
`;
}

const YouTubePlayer = forwardRef<YouTubePlayerHandle, Props>(
  (
    { videoId, onStateChange, onBuffering, onDuration, onEnded, fullscreen, onCaptionsAvailabilityChange, onDubTracksChange },
    ref
  ) => {
  const webviewRef = useRef<WebView>(null);
  const pendingRequests = useRef(new Map<string, (time: number) => void>());
  // Sadece ILK videoId'yi HTML'e gomuyoruz (bkz. buildPlayerHtml yorumu) -
  // sonraki video degisiklikleri DrmWebViewPlayer.tsx'teki currentUri ile
  // AYNI mantikla, WebView'i yeniden mount etmeden postMessage/loadVideo
  // uzerinden yapiliyor, bu yuzden state tek sefer (lazy initializer)
  // hesaplaniyor, videoId prop'u sonradan degisse bile HTML yeniden
  // uretilmiyor.
  //
  // "source" nesnesinin KENDISI de (sadece HTML string'i degil) tek sefer
  // hesaplanip sabit tutuluyor - "source={{ html: ..., baseUrl: ... }}"
  // SATIR ICINDE yazilsaydi, RoomScreen'in her yeniden render'inda (orn.
  // host'un 5 saniyede bir pozisyon bildirdigi kalp atisi - bkz.
  // HOST_HEARTBEAT_INTERVAL_MS) YENI bir nesne olusurdu; react-native-webview
  // bunu "kaynak degisti" sanip WebView'i sessizce BASTAN YUKLUYORDU - video
  // birkac saniyede bir basa sariyordu. Ayni nesne referansi korununca
  // WebView bir daha yeniden yuklenmiyor.
  const [playerSource] = useState(() => ({ html: buildPlayerHtml(videoId), baseUrl: "https://luna.app" }));
  // Su an oynaticiya YUKLENMIS gercek video - ilk video zaten HTML'e gomulu
  // oldugu icin buradan basliyor. RoomScreen.tsx'teki hem selectSource()'un
  // DOGRUDAN cagrisi HEM de reaktif efekt (appliedSourceUrlRef) AYNI videoyu
  // birbirinden habersiz iki kez yukleyebiliyordu - biri baslatiyor, bir an
  // sonra digeri ayniyi tekrar "loadVideoById" ile SIFIRDAN baslatiyordu
  // (video 2-3sn oynayip basa sariyormus gibi gorunuyordu). DrmWebViewPlayer.
  // tsx'teki "currentUri" ile AYNI korunma: zaten yuklu olan videoyu TEKRAR
  // istenirse sessizce yoksayiyoruz.
  const loadedVideoIdRef = useRef(videoId);

  function postToPlayer(message: object) {
    webviewRef.current?.postMessage(JSON.stringify(message));
  }

  useImperativeHandle(ref, () => ({
    play: () => postToPlayer({ type: "play" }),
    pause: () => postToPlayer({ type: "pause" }),
    seekTo: (seconds: number) => postToPlayer({ type: "seekTo", seconds }),
    loadVideo: (id: string, startSeconds = 0) => {
      if (id === loadedVideoIdRef.current) return;
      loadedVideoIdRef.current = id;
      postToPlayer({ type: "loadVideo", videoId: id, startSeconds });
    },
    setVolume: (volume: number) => postToPlayer({ type: "setVolume", volume: Math.round(volume * 100) }),
    setPlaybackRate: (rate: number) => postToPlayer({ type: "setPlaybackRate", rate }),
    setQuality: (quality: string) => postToPlayer({ type: "setQuality", quality }),
    setSubtitlesEnabled: (enabled: boolean) => postToPlayer({ type: "setSubtitles", enabled }),
    setDubTrack: (index: number) => postToPlayer({ type: "setDubTrack", index }),
    getCurrentTime: () =>
      new Promise<number>((resolve, reject) => {
        const requestId = Math.random().toString(36).slice(2);
        pendingRequests.current.set(requestId, resolve);
        postToPlayer({ type: "getCurrentTime", requestId });
        // 2sn icinde cevap gelmezse 0 ile COZMUYORUZ artik - bu sahte "0"
        // degeri, RoomScreen.tsx'teki host kalp atisi tarafindan GERCEK bir
        // olcummus gibi sunucuya "positionSeconds: 0" diye yayinlaniyordu,
        // bu da (bazi durumlarda) videonun basa sarmis GIBI gorunmesine yol
        // aciyordu. Artik zaman asiminda reddediyoruz, cagiran taraf o
        // turu sessizce atlayip bir sonraki kalp atisinda tekrar dener.
        setTimeout(() => {
          if (pendingRequests.current.has(requestId)) {
            pendingRequests.current.delete(requestId);
            reject(new Error("getCurrentTime timeout"));
          }
        }, 2000);
      }),
  }));

  return (
    <WebView<{}>
      ref={webviewRef}
      source={playerSource}
      style={[styles.webview, fullscreen && styles.webviewFullscreen]}
      javaScriptEnabled
      allowsInlineMediaPlayback
      mediaPlaybackRequiresUserAction={false}
      onMessage={(event) => {
        try {
          const data = JSON.parse(event.nativeEvent.data);
          if (data.type === "stateChange" && onStateChange) {
            onStateChange(data.isPlaying, data.currentTime);
          } else if (data.type === "buffering") {
            onBuffering?.(data.isBuffering);
          } else if (data.type === "currentTime") {
            const resolver = pendingRequests.current.get(data.requestId);
            if (resolver) {
              resolver(data.currentTime);
              pendingRequests.current.delete(data.requestId);
            }
          } else if (data.type === "duration") {
            if (data.seconds > 0) onDuration?.(data.seconds);
          } else if (data.type === "ended") {
            onEnded?.();
          } else if (data.type === "captionsAvailable") {
            onCaptionsAvailabilityChange?.(data.available);
          } else if (data.type === "dubTracksAvailable") {
            onDubTracksChange?.(data.labels);
          }
        } catch {
          // yoksay - beklenmeyen mesaj formati
        }
      }}
    />
  );
  }
);

export default YouTubePlayer;

const styles = StyleSheet.create({
  webview: { width: "100%", aspectRatio: 16 / 9, backgroundColor: "#000" },
  webviewFullscreen: { flex: 1, aspectRatio: undefined },
});
