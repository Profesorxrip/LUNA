import { customAlphabet } from "nanoid";

// Oda kodlari icin: karistirilmasi kolay 0/O, 1/I gibi karakterler cikarildi.
const generateRoomCode = customAlphabet("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", 6);

export interface Participant {
  socketId: string;
  name: string;
  isHost: boolean;
  muted: boolean;
}

/** Oynatilan medyanin turu:
 * - youtube: url alaninda YouTube video ID'si tutulur, senkron tam calisir.
 * - hls/mp4: url alaninda dogrudan stream linki tutulur, senkron tam calisir.
 * - external: Netflix/Prime/Disney+/HBO Max gibi DRM'li platformlar - bunlar
 *   sadece harici olarak acilir (link/uygulama), OTOMATIK PLAY/PAUSE/SEEK
 *   SENKRONU YAPILMAZ (bu platformlarin kullanim sartlarini ihlal eder).
 *   Sohbet/sesli sohbet odada acik kalmaya devam eder. */
export type SourceType = "youtube" | "hls" | "mp4" | "external";

export interface MediaSource {
  type: SourceType;
  url: string;
  label?: string; // orn. "Netflix" - harici platformlarda gosterim icin
  coverUrl?: string; // host'un yapistirdigi kapak gorseli linki - Kesif kartinda gosterilir
}

export interface PlaybackState {
  source: MediaSource | null;
  isPlaying: boolean;
  positionSeconds: number; // en son bilinen konum
  updatedAtMs: number; // positionSeconds'in okundugu an (Date.now())
}

export interface Room {
  code: string;
  title: string;
  isPublic: boolean;
  hostSocketId: string;
  participants: Map<string, Participant>;
  playback: PlaybackState;
  createdAtMs: number;
  bufferingSocketIds: Set<string>;
}

const rooms = new Map<string, Room>();

export function createRoom(
  hostSocketId: string,
  hostName: string,
  options: { isPublic?: boolean; source: MediaSource }
): Room {
  let code = generateRoomCode();
  while (rooms.has(code)) code = generateRoomCode(); // cakisma ihtimaline karsi

  // Oda ayri bir isme sahip degil - secilen icerigin ismi (source.label)
  // dogrudan odanin/kartin ismi oluyor (bkz. updatePlayback'teki ayni kural).
  const room: Room = {
    code,
    title: options.source.label || `${hostName}'in odasi`,
    isPublic: options.isPublic ?? true,
    hostSocketId,
    participants: new Map([
      [hostSocketId, { socketId: hostSocketId, name: hostName, isHost: true, muted: false }],
    ]),
    playback: {
      source: options.source,
      isPlaying: options.source.type !== "external",
      positionSeconds: 0,
      updatedAtMs: Date.now(),
    },
    createdAtMs: Date.now(),
    bufferingSocketIds: new Set(),
  };
  rooms.set(code, room);
  return room;
}

/** Kesif/ana ekranda listelenecek acik (public) odalarin ozet listesi -
 * en yeni olusturulan en basta olacak sekilde siralanir (Rave'deki
 * "Acik" bolumune benzer). */
export function listPublicRooms() {
  return Array.from(rooms.values())
    .filter((r) => r.isPublic)
    .sort((a, b) => b.createdAtMs - a.createdAtMs)
    .map((r) => ({
      code: r.code,
      title: r.title,
      participantCount: r.participants.size,
      source: r.playback.source,
      // Discover kartinda katilimci avatar siramasi kaydirilarak
      // gorulebiliyor - makul bir ust sinira kadar hepsini gonderiyoruz.
      participants: Array.from(r.participants.values())
        .slice(0, 20)
        .map((p) => ({ name: p.name })),
    }));
}

export function getRoom(code: string): Room | undefined {
  return rooms.get(code.toUpperCase());
}

export function joinRoom(code: string, socketId: string, name: string): Room | null {
  const room = getRoom(code);
  if (!room) return null;
  room.participants.set(socketId, { socketId, name, isHost: false, muted: false });
  return room;
}

/** Katilimci odadan ayrilir. Ayrilan host ise, odadaki EN ESKI (Map ekleme
 * sirasindaki ilk) katilimciya liderlik otomatik devredilir - kimse kalmazsa
 * oda tamamen silinir. */
export function leaveRoom(code: string, socketId: string): { room: Room | null; newHostId: string | null; roomDeleted: boolean } {
  const room = getRoom(code);
  if (!room) return { room: null, newHostId: null, roomDeleted: false };

  const wasHost = room.hostSocketId === socketId;
  room.participants.delete(socketId);
  room.bufferingSocketIds.delete(socketId);

  if (room.participants.size === 0) {
    rooms.delete(room.code);
    return { room: null, newHostId: null, roomDeleted: true };
  }

  let newHostId: string | null = null;
  if (wasHost) {
    const next = room.participants.values().next().value as Participant;
    next.isHost = true;
    room.hostSocketId = next.socketId;
    newHostId = next.socketId;
  }
  return { room, newHostId, roomDeleted: false };
}

export function isHost(room: Room, socketId: string): boolean {
  return room.hostSocketId === socketId;
}

export function transferHost(room: Room, requesterId: string, targetId: string): boolean {
  if (!isHost(room, requesterId)) return false;
  const current = room.participants.get(requesterId);
  const target = room.participants.get(targetId);
  if (!current || !target) return false;
  current.isHost = false;
  target.isHost = true;
  room.hostSocketId = targetId;
  return true;
}

export function kickParticipant(room: Room, requesterId: string, targetId: string): boolean {
  if (!isHost(room, requesterId) || requesterId === targetId) return false;
  room.bufferingSocketIds.delete(targetId);
  return room.participants.delete(targetId);
}

/** Bir katilimci "tamponlaniyor" (buffering) bildirimini acip kapatir.
 * Herhangi biri tamponlaniyorsa TUM odanin videosu, o kisi yetisene kadar
 * "beklemede" sayilir - boylece yavas internetli biri geride kalmaz. */
export function setBuffering(room: Room, socketId: string, isBuffering: boolean) {
  if (isBuffering) room.bufferingSocketIds.add(socketId);
  else room.bufferingSocketIds.delete(socketId);
}

export function bufferingState(room: Room) {
  const names = Array.from(room.bufferingSocketIds)
    .map((id) => room.participants.get(id)?.name)
    .filter((n): n is string => Boolean(n));
  return { anyoneBuffering: room.bufferingSocketIds.size > 0, names };
}

export function updatePlayback(
  room: Room,
  requesterId: string,
  update: Partial<Pick<PlaybackState, "source" | "isPlaying" | "positionSeconds">>
): boolean {
  if (!isHost(room, requesterId)) return false;
  room.playback = { ...room.playback, ...update, updatedAtMs: Date.now() };
  // Oda ayri bir isme sahip degil - hangi icerik aciliyorsa odanin/kartin
  // ismi de o oluyor (orn. YouTube video basligi, ya da Netflix'te izlenen
  // dizinin/filmin host tarafindan girilen adi).
  if (update.source?.label) room.title = update.source.label;
  return true;
}

/** isPlaying ise, updatedAtMs'ten beri gecen sureyi ekleyerek "su an" olmasi
 * gereken gercek konumu hesaplar - oynatma sirasinda her hareket icin ayri
 * bir sync event'i beklemeden yeni katilanlarin dogru yerden baslamasi icin. */
export function currentPlaybackPosition(playback: PlaybackState): number {
  if (!playback.isPlaying) return playback.positionSeconds;
  const elapsed = (Date.now() - playback.updatedAtMs) / 1000;
  return playback.positionSeconds + elapsed;
}

export function roomToPublicState(room: Room) {
  return {
    code: room.code,
    title: room.title,
    isPublic: room.isPublic,
    hostSocketId: room.hostSocketId,
    participants: Array.from(room.participants.values()),
    playback: { ...room.playback, positionSeconds: currentPlaybackPosition(room.playback) },
    buffering: bufferingState(room),
  };
}
