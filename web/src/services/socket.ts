import { io } from "socket.io-client";
import type { Socket } from "socket.io-client";

// Sunucunun adresi - production'da kendi sunucu URL'inle degistir.
export const SERVER_URL = (import.meta as any).env?.VITE_SERVER_URL || "http://localhost:3000";

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(SERVER_URL, { transports: ["websocket"] });
  }
  return socket;
}

export interface Participant {
  socketId: string;
  name: string;
  isHost: boolean;
  muted: boolean;
}

export type SourceType = "youtube" | "hls" | "mp4" | "external";

export interface MediaSource {
  type: SourceType;
  url: string;
  label?: string;
}

export interface PlaybackState {
  source: MediaSource | null;
  isPlaying: boolean;
  positionSeconds: number;
  updatedAtMs: number;
}

export interface BufferingState {
  anyoneBuffering: boolean;
  names: string[];
}

export interface RoomState {
  code: string;
  title: string;
  isPublic: boolean;
  hostSocketId: string;
  participants: Participant[];
  playback: PlaybackState;
  buffering: BufferingState;
}

export interface ChatMessage {
  system: boolean;
  from?: string;
  text: string;
  ts: number;
}

export interface ReactionEvent {
  emoji: string;
  from: string;
  ts: number;
}

export interface PublicRoomSummary {
  code: string;
  title: string;
  participantCount: number;
  source: MediaSource | null;
}
