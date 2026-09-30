import { customAlphabet } from "nanoid";

// Oda kodlari icin: karistirilmasi kolay 0/O, 1/I gibi karakterler cikarildi.
const generateRoomCode = customAlphabet("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", 6);

export interface Participant {
  socketId: string;
  name: string;
  isHost: boolean;
  muted: boolean;
  // Sadece gercek girisi yapmis (Supabase) kullanicilarda dolu - Discover
  // kartinda "bu arkadasin" rozetini gosterebilmek icin.
  userId?: string | null;
}

// Ayarlar ekranindaki "GIZLILIK" secenekleri:
// - open: herkese acik, Discover'da herkese gorunur (mevcut varsayilan).
// - nearby: sadece host ile AYNI ULKEDEKI kullanicilara gorunur/katilabilir -
//   gercek GPS/konum entegrasyonumuz olmadigi icin IP tabanli ulke bilgisini
//   (bkz. geoip.ts) kaba bir "yakinlik" olcusu olarak kullaniyoruz.
// - friends: sadece host'un GERCEK arkadaslarina (friendships tablosu)
//   gorunur/katilabilir.
// - invite: Discover'da HIC gorunmez, sadece oda kodu/davet linkiyle
//   katilinabilir (kod zaten dogal davet mekanizmasi).
export type PrivacyLevel = "open" | "nearby" | "friends" | "invite";

// Ayarlar ekranindaki "PLAYBACK" secenekleri:
// - leader: sadece host video secebilir VE oynat/duraklat/sarabilir (varsayilan).
// - playOnly: video secimi hala sadece host'ta, ama HERKES oynat/duraklat/
//   sarabilir (transport kontrolu serbest).
// - autoplay: playOnly ile ayni transport serbestligi - ayrica bir video
//   kuyrugu/otomatik-sonraki-video sistemimiz olmadigi icin su an pratikte
//   playOnly'den farki yok (ileride kuyruk eklenince gercek anlam kazanacak).
// - vote: video secimi lider'e ozel degil - HERKES aday onerebilir, oda oy
//   verir, en cok oyu alan (esitlikte ilk onerilen) otomatik uygulanir.
export type PlaybackMode = "leader" | "playOnly" | "autoplay" | "vote";

export interface PollProposal {
  id: string;
  source: MediaSource;
  proposedByName: string;
}

export interface Poll {
  proposals: PollProposal[];
  votes: Map<string, string>; // voterSocketId -> proposalId
  deadlineMs: number;
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
  // Video oynaticidan (YouTube/HLS) ogrenilir - external (DRM'li) kaynaklarda
  // hep null kalir, cunku o platformlarin gercek suresi bizde bilinmez.
  durationSeconds?: number | null;
}

export interface Room {
  code: string;
  title: string;
  isPublic: boolean;
  privacy: PrivacyLevel;
  playbackMode: PlaybackMode;
  // "nearby" gizliligini kontrol edebilmek icin host'un (giris yapiliminda
  // IP'den tespit edilen) ulkesinin bir kopyasi - profiles tablosuna her
  // kontrolde gitmemek icin.
  hostCountry: string | null;
  autoTranslateChat: boolean;
  poll: Poll | null;
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
  options: { isPublic?: boolean; source: MediaSource },
  hostUserId?: string | null,
  hostCountry?: string | null
): Room {
  let code = generateRoomCode();
  while (rooms.has(code)) code = generateRoomCode(); // cakisma ihtimaline karsi

  // Oda ayri bir isme sahip degil - secilen icerigin ismi (source.label)
  // dogrudan odanin/kartin ismi oluyor (bkz. updatePlayback'teki ayni kural).
  const room: Room = {
    code,
    title: options.source.label || `${hostName}'in odasi`,
    isPublic: options.isPublic ?? true,
    privacy: "open",
    playbackMode: "leader",
    hostCountry: hostCountry ?? null,
    autoTranslateChat: false,
    poll: null,
    hostSocketId,
    participants: new Map([
      [hostSocketId, { socketId: hostSocketId, name: hostName, isHost: true, muted: false, userId: hostUserId ?? null }],
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

export function hostUserIdOf(room: Room): string | null {
  return room.participants.get(room.hostSocketId)?.userId ?? null;
}

export interface DiscoverViewer {
  userId: string | null;
  country: string | null;
  friendIds: Set<string>;
}

function visibleToViewer(room: Room, viewer: DiscoverViewer): boolean {
  const hostId = hostUserIdOf(room);
  if (viewer.userId && hostId === viewer.userId) return true; // kendi odan hep gorunur
  switch (room.privacy) {
    case "open":
      return true;
    case "invite":
      return false;
    case "nearby":
      return Boolean(viewer.country && room.hostCountry && viewer.country === room.hostCountry);
    case "friends":
      return Boolean(hostId && viewer.friendIds.has(hostId));
    default:
      return false;
  }
}

/** Kesif/ana ekranda listelenecek odalarin ozet listesi - GIZLILIK ayarina
 * gore her istemciye FARKLI (kisisellestirilmis) bir liste donebilir:
 * "open" herkese, "nearby" ayni ulkedeki (bkz. hostCountry aciklamasi)
 * kullanicilara, "friends" host'un gercek arkadaslarina, "invite" ise hic
 * kimseye (sadece kod/link ile) gorunur. En yeni olusturulan en basta. */
export function listPublicRooms(viewer: DiscoverViewer) {
  return Array.from(rooms.values())
    .filter((r) => visibleToViewer(r, viewer))
    .sort((a, b) => b.createdAtMs - a.createdAtMs)
    .map((r) => ({
      code: r.code,
      title: r.title,
      participantCount: r.participants.size,
      source: r.playback.source,
      isPublic: r.privacy === "open",
      privacy: r.privacy,
      isPlaying: r.playback.isPlaying,
      positionSeconds: currentPlaybackPosition(r.playback),
      durationSeconds: r.playback.durationSeconds ?? null,
      // Discover kartinda katilimci avatar siramasi kaydirilarak
      // gorulebiliyor - makul bir ust sinira kadar hepsini gonderiyoruz.
      participants: Array.from(r.participants.values())
        .slice(0, 20)
        .map((p) => ({ name: p.name, userId: p.userId ?? null })),
    }));
}

export function getRoom(code: string): Room | undefined {
  return rooms.get(code.toUpperCase());
}

export function joinRoom(code: string, socketId: string, name: string, userId?: string | null): Room | null {
  const room = getRoom(code);
  if (!room) return null;
  room.participants.set(socketId, { socketId, name, isHost: false, muted: false, userId: userId ?? null });
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

/** PLAYBACK ayarina gore video secme yetkisi hep host'ta kalir (vote modu
 * haric - orada secim room:proposeSource/room:vote akisindan gecer).
 * Oynat/duraklat/sarma yetkisi ise playOnly/autoplay modlarinda HERKESE
 * aciliyor. */
export function canSelectSource(room: Room, socketId: string): boolean {
  // "vote" modunda dogrudan kaynak degisimi KAPALI - host dahil herkes
  // room:proposeSource/room:vote akisindan gecmek zorunda.
  if (room.playbackMode === "vote") return false;
  return isHost(room, socketId);
}

export function canControlTransport(room: Room, socketId: string): boolean {
  if (isHost(room, socketId)) return true;
  return room.playbackMode === "playOnly" || room.playbackMode === "autoplay";
}

// Host kontrolu YAPMADAN dogrudan uygular - sadece bu dosya icindeki, zaten
// yetkiyi kendisi kontrol eden cagiranlar (oy sonucu uygulama gibi) icin.
function applyPlayback(room: Room, update: Partial<PlaybackState>) {
  room.playback = { ...room.playback, ...update, updatedAtMs: Date.now() };
  if (update.source?.label) room.title = update.source.label;
}

export function updatePlayback(
  room: Room,
  requesterId: string,
  update: Partial<Pick<PlaybackState, "source" | "isPlaying" | "positionSeconds" | "durationSeconds">>
): boolean {
  if (update.source !== undefined) {
    if (!canSelectSource(room, requesterId)) return false;
  } else if (!canControlTransport(room, requesterId)) {
    return false;
  }
  applyPlayback(room, update);
  return true;
}

export function updateRoomSettings(
  room: Room,
  requesterId: string,
  updates: { privacy?: PrivacyLevel; playbackMode?: PlaybackMode; autoTranslateChat?: boolean },
  hostCountry?: string | null
): boolean {
  if (!isHost(room, requesterId)) return false;
  if (updates.privacy) {
    room.privacy = updates.privacy;
    room.isPublic = updates.privacy === "open";
    if (updates.privacy === "nearby" && hostCountry !== undefined) room.hostCountry = hostCountry;
  }
  if (updates.playbackMode) {
    room.playbackMode = updates.playbackMode;
    // Playback modu degisince yarim kalmis bir oylama varsa anlamsizlasir.
    if (updates.playbackMode !== "vote") room.poll = null;
  }
  if (updates.autoTranslateChat !== undefined) room.autoTranslateChat = updates.autoTranslateChat;
  return true;
}

const POLL_DURATION_MS = 20_000;

/** "Haydi Oylayalım" modunda birisi bir kaynak onerdiginde cagrilir - aktif
 * oylama yoksa yenisini baslatir, varsa aday listesine ekler. */
export function proposeSource(room: Room, source: MediaSource, proposedByName: string): Poll {
  const proposal: PollProposal = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, source, proposedByName };
  if (!room.poll) {
    room.poll = { proposals: [proposal], votes: new Map(), deadlineMs: Date.now() + POLL_DURATION_MS };
  } else {
    room.poll.proposals.push(proposal);
  }
  return room.poll;
}

export function castVote(room: Room, voterSocketId: string, proposalId: string): boolean {
  if (!room.poll) return false;
  if (!room.poll.proposals.some((p) => p.id === proposalId)) return false;
  room.poll.votes.set(voterSocketId, proposalId);
  return true;
}

/** Suresi dolan ya da herkesin oy kullandigi bir oylamayi sonuclandirir -
 * en cok oyu alan aday (esitlikte ilk onerilen) uygulanir. Oy hic
 * kullanilmadiysa ilk oneri kazanir. Aktif oylama yoksa null doner. */
export function resolvePoll(room: Room): MediaSource | null {
  const poll = room.poll;
  if (!poll || poll.proposals.length === 0) {
    room.poll = null;
    return null;
  }
  const counts = new Map<string, number>();
  for (const proposalId of poll.votes.values()) counts.set(proposalId, (counts.get(proposalId) ?? 0) + 1);
  let winner = poll.proposals[0];
  let winnerVotes = counts.get(winner.id) ?? 0;
  for (const p of poll.proposals.slice(1)) {
    const votes = counts.get(p.id) ?? 0;
    if (votes > winnerVotes) {
      winner = p;
      winnerVotes = votes;
    }
  }
  room.poll = null;
  applyPlayback(room, { source: winner.source, isPlaying: winner.source.type !== "external", positionSeconds: 0, durationSeconds: null });
  return winner.source;
}

function serializePoll(room: Room) {
  if (!room.poll) return null;
  return {
    proposals: room.poll.proposals,
    // voterSocketId -> proposalId - istemci kendi socket id'siyle karsilastirip
    // "benim oyum" ve toplam sayaclari kendisi hesaplar.
    votes: Object.fromEntries(room.poll.votes),
    deadlineMs: room.poll.deadlineMs,
  };
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
    privacy: room.privacy,
    playbackMode: room.playbackMode,
    autoTranslateChat: room.autoTranslateChat,
    poll: serializePoll(room),
    hostSocketId: room.hostSocketId,
    participants: Array.from(room.participants.values()),
    playback: { ...room.playback, positionSeconds: currentPlaybackPosition(room.playback) },
    buffering: bufferingState(room),
  };
}
