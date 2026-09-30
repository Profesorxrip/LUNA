import React, { forwardRef, useImperativeHandle, useRef } from "react";
import { StyleSheet } from "react-native";
import { WebView } from "react-native-webview";

export interface YouTubePlayerHandle {
  play: () => void;
  pause: () => void;
  seekTo: (seconds: number) => void;
  loadVideo: (videoId: string, startSeconds?: number) => void;
  getCurrentTime: () => Promise<number>;
}

interface Props {
  videoId: string | null;
  onStateChange?: (isPlaying: boolean, currentTime: number) => void;
  onBuffering?: (isBuffering: boolean) => void;
  onDuration?: (seconds: number) => void;
}

// YouTube IFrame API'sini yukleyip play/pause/seekTo komutlarini
// React Native tarafindan postMessage ile kontrol edebilecegimiz basit bir
// HTML sayfasi. player durumu degistiginde (oynat/durdur) React Native'e
// geri mesaj gonderiyor.
const PLAYER_HTML = `
<!DOCTYPE html>
<html>
<head><style>body,html{margin:0;padding:0;background:#000;}</style></head>
<body>
  <div id="player"></div>
  <script src="https://www.youtube.com/iframe_api"></script>
  <script>
    var player;
    function onYouTubeIframeAPIReady() {
      player = new YT.Player('player', {
        height: '100%',
        width: '100%',
        playerVars: { playsinline: 1, controls: 1 },
        events: {
          onReady: function () {
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'duration', seconds: player.getDuration() }));
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
      if (msg.type === 'loadVideo') player.loadVideoById(msg.videoId, msg.startSeconds || 0);
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

const YouTubePlayer = forwardRef<YouTubePlayerHandle, Props>(({ videoId, onStateChange, onBuffering, onDuration }, ref) => {
  const webviewRef = useRef<WebView>(null);
  const pendingRequests = useRef(new Map<string, (time: number) => void>());

  function postToPlayer(message: object) {
    webviewRef.current?.postMessage(JSON.stringify(message));
  }

  useImperativeHandle(ref, () => ({
    play: () => postToPlayer({ type: "play" }),
    pause: () => postToPlayer({ type: "pause" }),
    seekTo: (seconds: number) => postToPlayer({ type: "seekTo", seconds }),
    loadVideo: (id: string, startSeconds = 0) => postToPlayer({ type: "loadVideo", videoId: id, startSeconds }),
    getCurrentTime: () =>
      new Promise<number>((resolve) => {
        const requestId = Math.random().toString(36).slice(2);
        pendingRequests.current.set(requestId, resolve);
        postToPlayer({ type: "getCurrentTime", requestId });
        // 2sn icinde cevap gelmezse takilip kalmamak icin 0 ile coz
        setTimeout(() => {
          if (pendingRequests.current.has(requestId)) {
            pendingRequests.current.get(requestId)!(0);
            pendingRequests.current.delete(requestId);
          }
        }, 2000);
      }),
  }));

  return (
    <WebView<{}>
      ref={webviewRef}
      source={{ html: PLAYER_HTML }}
      style={styles.webview}
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
          }
        } catch {
          // yoksay - beklenmeyen mesaj formati
        }
      }}
      onLoadEnd={() => {
        if (videoId) postToPlayer({ type: "loadVideo", videoId });
      }}
    />
  );
});

export default YouTubePlayer;

const styles = StyleSheet.create({
  webview: { width: "100%", aspectRatio: 16 / 9, backgroundColor: "#000" },
});
