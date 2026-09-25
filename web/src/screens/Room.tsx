import { useEffect, useRef, useState, useCallback } from "react";
import { getSocket } from "../services/socket";
import type { RoomState, ChatMessage } from "../services/socket";
import YouTubePlayer from "../components/YouTubePlayer";
import type { YouTubePlayerHandle } from "../components/YouTubePlayer";

interface Props {
  initialRoom: RoomState;
  onLeave: () => void;
}

const DRIFT_TOLERANCE_SECONDS = 2;
const GUEST_RESYNC_INTERVAL_MS = 8000;
const HOST_HEARTBEAT_INTERVAL_MS = 5000;

function extractYouTubeId(input: string): string | null {
  const trimmed = input.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed);
    if (url.hostname.includes("youtu.be")) return url.pathname.slice(1) || null;
    if (url.hostname.includes("youtube.com")) return url.searchParams.get("v");
  } catch {
    /* gecerli URL degil */
  }
  return null;
}

export default function Room({ initialRoom, onLeave }: Props) {
  const socket = getSocket();
  const [room, setRoom] = useState<RoomState>(initialRoom);
  const roomRef = useRef(room);
  roomRef.current = room;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [videoUrlInput, setVideoUrlInput] = useState("");
  const playerRef = useRef<YouTubePlayerHandle>(null);

  const me = room.participants.find((p) => p.socketId === socket.id);
  const isHost = me?.isHost ?? false;

  useEffect(() => {
    function handleRoomState(state: RoomState) {
      setRoom(state);
    }
    function handleChat(msg: ChatMessage) {
      setMessages((prev) => [...prev.slice(-199), msg]);
    }
    function handleKicked() {
      alert("Oda lideri seni odadan cikardi.");
      onLeave();
    }
    socket.on("room:state", handleRoomState);
    socket.on("room:chat", handleChat);
    socket.on("room:kicked", handleKicked);
    return () => {
      socket.off("room:state", handleRoomState);
      socket.off("room:chat", handleChat);
      socket.off("room:kicked", handleKicked);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Misafir surukleme (drift) duzeltmesi
  useEffect(() => {
    if (isHost) return;
    const timer = setInterval(() => {
      const current = roomRef.current;
      if (!current.playback.source || !current.playback.isPlaying || current.buffering.anyoneBuffering) return;
      const elapsed = (Date.now() - current.playback.updatedAtMs) / 1000;
      const expected = current.playback.positionSeconds + elapsed;
      const actual = playerRef.current?.getCurrentTime() ?? 0;
      if (Math.abs(actual - expected) > DRIFT_TOLERANCE_SECONDS) {
        playerRef.current?.seekTo(expected);
      }
    }, GUEST_RESYNC_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [isHost]);

  // Host kalp atisi
  useEffect(() => {
    if (!isHost) return;
    const timer = setInterval(() => {
      const current = roomRef.current;
      if (!current.playback.source || !current.playback.isPlaying) return;
      const actual = playerRef.current?.getCurrentTime() ?? 0;
      socket.emit("playback:update", { positionSeconds: actual, isPlaying: true });
    }, HOST_HEARTBEAT_INTERVAL_MS);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHost]);

  // Misafirde: sunucudan gelen yeni durumu yerel oynaticiya uygula
  useEffect(() => {
    if (isHost) return;
    const { source, isPlaying, positionSeconds } = room.playback;
    if (!source) return;
    playerRef.current?.loadVideo(source.url, positionSeconds);
    if (isPlaying && !room.buffering.anyoneBuffering) playerRef.current?.play();
    else playerRef.current?.pause();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.playback.source?.url, room.playback.isPlaying, room.buffering.anyoneBuffering]);

  const handlePlayerStateChange = useCallback(
    (playing: boolean, currentTime: number) => {
      if (!isHost) return;
      socket.emit("playback:update", { isPlaying: playing, positionSeconds: currentTime });
    },
    [isHost]
  );

  const handleBuffering = useCallback((isBuffering: boolean) => {
    socket.emit("playback:buffering", { isBuffering });
  }, []);

  function loadVideo() {
    const id = extractYouTubeId(videoUrlInput);
    if (!id) {
      alert("Gecerli bir YouTube linki ya da video ID'si gir.");
      return;
    }
    socket.emit("playback:update", { source: { type: "youtube", url: id }, isPlaying: true, positionSeconds: 0 });
    playerRef.current?.loadVideo(id, 0);
    setVideoUrlInput("");
  }

  function sendChat() {
    if (!chatInput.trim()) return;
    socket.emit("chat:send", { text: chatInput });
    setChatInput("");
  }

  function kick(targetSocketId: string) {
    socket.emit("host:kick", { targetSocketId }, () => {});
  }

  function makeLeader(targetSocketId: string) {
    socket.emit("host:transfer", { targetSocketId }, () => {});
  }

  function leave() {
    socket.emit("room:leave");
    onLeave();
  }

  return (
    <div className="room">
      <div className="room-main">
        <div className="room-header">
          <div>
            <strong>{room.title}</strong> <span className="muted">#{room.code}</span>
          </div>
          <button className="link-button" onClick={leave}>
            Ayril
          </button>
        </div>

        <YouTubePlayer
          ref={playerRef}
          videoId={room.playback.source?.type === "youtube" ? room.playback.source.url : null}
          onStateChange={handlePlayerStateChange}
          onBuffering={handleBuffering}
        />
        {room.buffering.anyoneBuffering && (
          <div className="buffering-banner">⏳ {room.buffering.names.join(", ")} icin bekleniyor (tamponlaniyor)...</div>
        )}

        {isHost && (
          <div className="row">
            <input
              placeholder="YouTube linki veya video ID'si"
              value={videoUrlInput}
              onChange={(e) => setVideoUrlInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && loadVideo()}
            />
            <button className="primary" onClick={loadVideo}>
              Yukle
            </button>
          </div>
        )}

        <div className="participants">
          {room.participants.map((p) => (
            <div key={p.socketId} className="participant-chip">
              <span>
                {p.isHost ? "👑 " : ""}
                {p.name}
              </span>
              {isHost && p.socketId !== socket.id && (
                <span className="participant-actions">
                  <button onClick={() => makeLeader(p.socketId)}>Lider yap</button>
                  <button className="danger" onClick={() => kick(p.socketId)}>
                    At
                  </button>
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="chat-panel">
        <div className="chat-messages">
          {messages.map((m, i) => (
            <div key={i} className={m.system ? "chat-system" : "chat-message"}>
              {m.system ? m.text : `${m.from}: ${m.text}`}
            </div>
          ))}
        </div>
        <div className="row">
          <input
            placeholder="Mesaj yaz..."
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendChat()}
          />
          <button className="primary" onClick={sendChat}>
            Gonder
          </button>
        </div>
      </div>
    </div>
  );
}
