import { io, Socket } from "socket.io-client";

// Gercek cihazdan test ederken mobile/.env dosyasina
// EXPO_PUBLIC_SERVER_URL=http://<sunucu-cihazinin-LAN-IP'si>:3000 yaz -
// "localhost" telefonun KENDI icini gosterir, sunucuyu calistiran
// cihazi degil. .env yoksa/tanimli degilse localhost'a duser.
export const SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL || "http://localhost:3000";

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

/** Oynatilan medyanin turu - bkz. sunucu tarafi rooms.ts:
 * - youtube: url = video ID, tam senkron.
 * - hls/mp4: url = dogrudan stream linki, tam senkron (native HLS oynatici).
 * - external: Netflix/Prime/Disney+/HBO Max gibi DRM'li platformlar - sadece
 *   harici acilir, OTOMATIK SENKRON YOK (platform kullanim sartlari geregi). */
export type SourceType = "youtube" | "hls" | "mp4" | "external";

export interface MediaSource {
  type: SourceType;
  url: string;
  label?: string;
  coverUrl?: string; // orn. Netflix/harici icerikte host'un yapistirdigi kapak gorseli linki
}

export interface PlaybackState {
  source: MediaSource | null;
  isPlaying: boolean;
  positionSeconds: number;
  updatedAtMs: number;
  durationSeconds?: number | null;
}

export interface BufferingState {
  anyoneBuffering: boolean;
  names: string[];
}

// Ayarlar ekranindaki GIZLILIK/PLAYBACK secenekleri - bkz. server/src/rooms.ts
// ayni isimli tiplerin aciklamalari (ayni anlama geliyorlar).
export type PrivacyLevel = "open" | "nearby" | "friends" | "invite";
export type PlaybackMode = "leader" | "playOnly" | "autoplay" | "vote";

export interface PollProposal {
  id: string;
  source: MediaSource;
  proposedByName: string;
}

export interface Poll {
  proposals: PollProposal[];
  votes: Record<string, string>; // voterSocketId -> proposalId
  deadlineMs: number;
}

export interface RoomState {
  code: string;
  title: string;
  isPublic: boolean;
  privacy: PrivacyLevel;
  playbackMode: PlaybackMode;
  autoTranslateChat: boolean;
  poll: Poll | null;
  hostSocketId: string;
  participants: Participant[];
  playback: PlaybackState;
  buffering: BufferingState;
}

export interface ChatMessage {
  system: boolean;
  from?: string;
  fromSocketId?: string;
  text: string;
  ts: number;
  /** "text" her zaman duz bir yedek ozet tasir (bildirim/erisilebilirlik icin) -
   * "kind" verilmisse istemci asagidaki alanlarla Rave'deki gibi zengin
   * (ikonlu, kalin isimli) bir sistem mesaji ciziyor. */
  kind?: "nowPlaying" | "kicked" | "settings" | "joined";
  title?: string; // nowPlaying
  targetName?: string; // kicked, joined
  byName?: string; // kicked, settings
  settingLabel?: string; // settings - orn. "Gizlilik"
  settingValue?: string; // settings - orn. "Açık"
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
  isPublic: boolean;
  privacy: PrivacyLevel;
  isPlaying: boolean;
  positionSeconds: number;
  durationSeconds: number | null;
  participants: { name: string; userId: string | null }[];
}

export interface RoomParticipantDetail {
  userId: string | null;
  name: string;
  handle: string | null;
  avatarUrl: string | null;
  country: string | null;
  isHost: boolean;
}

export type FriendStatus = "none" | "outgoing" | "incoming" | "friends" | "blocked";

export interface FriendUser {
  userId: string;
  name: string;
}

export interface DMReply {
  text: string;
  fromName: string;
}

export interface DMMessage {
  id: string;
  fromUserId: string;
  fromName: string;
  text: string;
  mediaUrl?: string;
  replyTo: DMReply | null;
  createdAt: number;
  expiresAt: number | null;
}
