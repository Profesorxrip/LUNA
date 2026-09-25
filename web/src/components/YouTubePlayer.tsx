import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

export interface YouTubePlayerHandle {
  play: () => void;
  pause: () => void;
  seekTo: (seconds: number) => void;
  loadVideo: (videoId: string, startSeconds?: number) => void;
  getCurrentTime: () => number;
}

interface Props {
  videoId: string | null;
  onStateChange?: (isPlaying: boolean, currentTime: number) => void;
  onBuffering?: (isBuffering: boolean) => void;
}

let apiLoadPromise: Promise<void> | null = null;

/** YouTube IFrame API script'ini SADECE BIR KEZ yukler (birden fazla
 * oynatici/rerender'da tekrar tekrar eklenmesini onler). */
function loadYouTubeApi(): Promise<void> {
  if (window.YT && window.YT.Player) return Promise.resolve();
  if (apiLoadPromise) return apiLoadPromise;
  apiLoadPromise = new Promise((resolve) => {
    const prevCallback = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prevCallback?.();
      resolve();
    };
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);
  });
  return apiLoadPromise;
}

const YouTubePlayer = forwardRef<YouTubePlayerHandle, Props>(({ videoId, onStateChange, onBuffering }, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const readyRef = useRef(false);
  const pendingVideoId = useRef<string | null>(videoId);

  useEffect(() => {
    let cancelled = false;
    loadYouTubeApi().then(() => {
      if (cancelled || !containerRef.current) return;
      playerRef.current = new window.YT.Player(containerRef.current, {
        height: "100%",
        width: "100%",
        playerVars: { playsinline: 1 },
        events: {
          onReady: () => {
            readyRef.current = true;
            if (pendingVideoId.current) playerRef.current.loadVideoById(pendingVideoId.current);
          },
          onStateChange: (e: any) => {
            const YT = window.YT;
            if (e.data === YT.PlayerState.BUFFERING) onBuffering?.(true);
            else onBuffering?.(false);
            if (e.data === YT.PlayerState.PLAYING || e.data === YT.PlayerState.PAUSED) {
              onStateChange?.(e.data === YT.PlayerState.PLAYING, playerRef.current.getCurrentTime());
            }
          },
        },
      });
    });
    return () => {
      cancelled = true;
      playerRef.current?.destroy?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    pendingVideoId.current = videoId;
    if (readyRef.current && videoId && playerRef.current) {
      playerRef.current.loadVideoById(videoId);
    }
  }, [videoId]);

  useImperativeHandle(ref, () => ({
    play: () => playerRef.current?.playVideo(),
    pause: () => playerRef.current?.pauseVideo(),
    seekTo: (seconds: number) => playerRef.current?.seekTo(seconds, true),
    loadVideo: (id: string, startSeconds = 0) => playerRef.current?.loadVideoById(id, startSeconds),
    getCurrentTime: () => playerRef.current?.getCurrentTime?.() ?? 0,
  }));

  return (
    <div style={{ width: "100%", aspectRatio: "16 / 9", background: "#000" }}>
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
    </div>
  );
});

export default YouTubePlayer;
