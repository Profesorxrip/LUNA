import { customAlphabet } from "nanoid";
import { areNeighboringProvinces, normalizeProvince } from "./turkeyProvinces";

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
  // Katilim anindaki profil sorgusuyla DOLDURULUP burada ONBELLEKLENIR -
  // oda durumu (room:state) her degistiginde tekrar DB'ye gitmeden senkron
  // yayinlanabilsin diye (bkz. index.ts room:create / room:join).
  avatarUrl?: string | null;
  // Oda haritasinda ("Haritayi Goster") gosterilecek GERCEK GPS konumu -
  // SADECE katilimci kendi Ayarlar'indaki "Konumu Gizle"yi KAPATIP
  // paylasmayi secerse dolar (bkz. index.ts "room:location"), hicbir yerde
  // kalici saklanmaz, oda hafizadan silinince bu da gider.
  location?: { lat: number; lng: number } | null;
  // Discover'daki "Açık" bolumunde siralama icin - bir arkadasimin bu odaya
  // EN SON NE ZAMAN GIRDIGINI bulabilmek icin (bkz. mostRecentFriendJoinMs).
  joinedAtMs: number;
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
  // "Yakindakiler" artik ulke degil il (+ komsu il) bazinda eslesiyor (bkz.
  // turkeyProvinces.ts) - host "Konumu Gizle"yi actiysa hep null kalir,
  // bu durumda oda Yakindakiler ile HICBIR ZAMAN bulunamaz.
  hostCity: string | null;
  autoTranslateChat: boolean;
  poll: Poll | null;
  hostSocketId: string;
  participants: Map<string, Participant>;
  playback: PlaybackState;
  createdAtMs: number;
  bufferingSocketIds: Set<string>;
  // Oda sohbetinde bir mesaja cift-tiklayinca eklenen tepkiler - mesajlar
  // gibi kalici degil, sadece oda hafizadayken yasiyor (messageId -> socketId -> tepki).
  messageReactions: Map<string, Map<string, { emoji: string; fromName: string }>>;
  // Host odayi "18+ icerik" olarak isaretleyebilir - Ayarlar ekranindaki
  // "Yetiskin Icerigini Gizle" acik olan kullanicilarin Discover listesinde
  // bu oda hic gorunmez (bkz. visibleToViewer).
  isAdult: boolean;
  // Bu odada su ana kadar oynatilmis onceki kaynaklarin yigini (mevcut
  // oynayan HARIC) - "onceki videoya don" ozelligi icin (bkz. goToPreviousVideo).
  // Geriye donulunce TEKRAR bu yigina eklenmez (applyPlayback'in recordHistory=false
  // cagrisi), yoksa ileri-geri yapildikca ayni video sonsuza kadar birikirdi.
  videoHistory: MediaSource[];
}

const rooms = new Map<string, Room>();

export function createRoom(
  hostSocketId: string,
  hostName: string,
  options: { isPublic?: boolean; source: MediaSource },
  hostUserId?: string | null,
  hostCountry?: string | null,
  hostAvatarUrl?: string | null,
  // Host'un Ayarlar ekranindaki "Chat mesajlarini otomatik cevir" tercihi -
  // yeni actigi HER odanin baslangic degeri bu oluyor (host yine de
  // RoomSettingsSheet'ten oda bazinda degistirebilir).
  defaultAutoTranslate?: boolean,
  // Host odayi acarken "18+ icerik" olarak isaretlemis mi - RoomSettingsSheet'ten
  // sonradan da degistirilebilir (bkz. updateRoomSettings).
  isAdult?: boolean,
  // Host'un (Konumu Gizle kapaliysa IP'den tespit edilen) ili - "Yakindakiler"
  // icin (bkz. hostCity aciklamasi).
  hostCity?: string | null
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
    hostCity: hostCity ?? null,
    autoTranslateChat: defaultAutoTranslate ?? false,
    poll: null,
    hostSocketId,
    participants: new Map([
      [
        hostSocketId,
        {
          socketId: hostSocketId,
          name: hostName,
          isHost: true,
          muted: false,
          userId: hostUserId ?? null,
          avatarUrl: hostAvatarUrl ?? null,
          joinedAtMs: Date.now(),
        },
      ],
    ]),
    playback: {
      source: options.source,
      isPlaying: options.source.type !== "external",
      positionSeconds: 0,
      updatedAtMs: Date.now(),
    },
    createdAtMs: Date.now(),
    bufferingSocketIds: new Set(),
    messageReactions: new Map(),
    isAdult: isAdult ?? false,
    videoHistory: [],
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
  // "Yakindakiler" icin (bkz. hostCity) - viewer "Konumu Gizle"yi actiysa
  // hep null gelir, bu durumda viewer "Yakindakiler" odalarini HIC GOREMEZ
  // (kendi ili bilinmedigi icin eslestirilemiyor).
  city?: string | null;
  friendIds: Set<string>;
  // Ayarlar ekranindaki "Yetiskin Icerigini Gizle" tercihi - aciksa 18+
  // isaretli odalar bu bakan icin Discover'da (kendi odasi haric) hic gorunmez.
  hideAdultContent?: boolean;
  // Bana birinin ozel olarak davet ettigi odalar (kod -> davet zamani) -
  // gizlilik tipinden BAGIMSIZ olarak Discover'in en ustundeki "Davetliler"
  // bolumune dusuyor (bkz. index.ts "room:invite", pendingInvites).
  invitedCodes?: Map<string, number>;
}

function visibleToViewer(room: Room, viewer: DiscoverViewer): boolean {
  const hostId = hostUserIdOf(room);
  if (viewer.userId && hostId === viewer.userId) return true; // kendi odan hep gorunur
  if (room.isAdult && viewer.hideAdultContent) return false;
  switch (room.privacy) {
    case "open":
      return true;
    case "invite":
      return false;
    case "nearby": {
      // Konumu Gizle'yi acan taraf (host ya da viewer, farketmez) null
      // city tasir - bu durumda eslestirme HICBIR ZAMAN olmaz, "yakindakiler"
      // gizli konumlu kullanicilari hic yakalamaz.
      if (!viewer.city || !room.hostCity) return false;
      const viewerCity = normalizeProvince(viewer.city);
      const hostCity = normalizeProvince(room.hostCity);
      return viewerCity === hostCity || areNeighboringProvinces(viewerCity, hostCity);
    }
    case "friends":
      return Boolean(hostId && viewer.friendIds.has(hostId));
    default:
      return false;
  }
}

function mapRoomSummary(r: Room) {
  return {
    code: r.code,
    title: r.title,
    participantCount: r.participants.size,
    source: r.playback.source,
    isPublic: r.privacy === "open",
    privacy: r.privacy,
    isPlaying: r.playback.isPlaying,
    positionSeconds: currentPlaybackPosition(r.playback),
    durationSeconds: r.playback.durationSeconds ?? null,
    isAdult: r.isAdult,
    // Discover kartinda katilimci avatar siramasi kaydirilarak
    // gorulebiliyor - makul bir ust sinira kadar hepsini gonderiyoruz.
    participants: Array.from(r.participants.values())
      .slice(0, 20)
      .map((p) => ({ name: p.name, userId: p.userId ?? null })),
  };
}

export interface DiscoverSections {
  invited: ReturnType<typeof mapRoomSummary>[];
  friends: ReturnType<typeof mapRoomSummary>[];
  nearby: ReturnType<typeof mapRoomSummary>[];
  open: ReturnType<typeof mapRoomSummary>[];
}

/** Kesif/ana ekran artik TEK bir liste degil, 4 ayri bolum donduruyor:
 *
 * 1. "invited" - biri beni bu odaya OZEL OLARAK davet etmisse, odanin
 *    GERCEK gizlilik tipinden BAGIMSIZ olarak burada (en son davet en
 *    ustte). Kendi odan ya da zaten "friends"/"nearby" ile normalde
 *    gorebilecegin bir oda olsa bile davetliysen SADECE burada gorunur
 *    (tekrar asagida de listelenmez).
 * 2. "friends" - gizliligi "Sadece Arkadaslar" ve host'un gercek arkadasin
 *    oldugu odalar, en yeni acilan en ustte (oda acilma zamanina gore).
 * 3. "nearby" - gizliligi "Yakindakiler" ve il/komsu il eslesen odalar,
 *    yine en yeni acilan en ustte.
 * 4. "open" - gizliligi "Acik" olan odalar. Once icinde en az bir
 *    ARKADASIM olan odalar (aralarinda: bir arkadasimin EN SON o odaya
 *    GIRDIGI ana gore, en yeni en ustte), sonra arkadassiz odalar
 *    (katilimci sayisina gore, en kalabalik en ustte).
 */
export function listPublicRooms(viewer: DiscoverViewer): DiscoverSections {
  const invited: Room[] = [];
  const friends: Room[] = [];
  const nearby: Room[] = [];
  const open: Room[] = [];

  for (const room of rooms.values()) {
    if (viewer.invitedCodes?.has(room.code)) {
      invited.push(room);
      continue;
    }
    if (!visibleToViewer(room, viewer)) continue;
    if (room.privacy === "friends") friends.push(room);
    else if (room.privacy === "nearby") nearby.push(room);
    else open.push(room); // "open" ya da (kendi "invite" odan gibi nadir bir kenar durum) varsayilan
  }

  invited.sort((a, b) => (viewer.invitedCodes!.get(b.code) ?? 0) - (viewer.invitedCodes!.get(a.code) ?? 0));
  friends.sort((a, b) => b.createdAtMs - a.createdAtMs);
  nearby.sort((a, b) => b.createdAtMs - a.createdAtMs);
  open.sort((a, b) => {
    const aFriendMs = mostRecentFriendJoinMs(a, viewer.friendIds);
    const bFriendMs = mostRecentFriendJoinMs(b, viewer.friendIds);
    if (Boolean(aFriendMs) !== Boolean(bFriendMs)) return aFriendMs ? -1 : 1; // arkadasli oda hep once
    if (aFriendMs && bFriendMs) return bFriendMs - aFriendMs; // ikisi de arkadasli: en son giren once
    return b.participants.size - a.participants.size; // ikisi de arkadassiz: en kalabalik once
  });

  return {
    invited: invited.map(mapRoomSummary),
    friends: friends.map(mapRoomSummary),
    nearby: nearby.map(mapRoomSummary),
    open: open.map(mapRoomSummary),
  };
}

export function getRoom(code: string): Room | undefined {
  return rooms.get(code.toUpperCase());
}

/** Profil ekraninda "su an acik odasi" karti icin: hedef kullanici (targetUserId)
 * su an katilimcisi oldugu bir oda var mi, ve varsa o oda bu BAKAN (viewer)
 * icin Kesif'teki ile AYNI gizlilik kuralina gore gorunur mu? Gorunmuyorsa
 * (ya da hic oda yoksa) null doner - kart hic gosterilmez. Donus sekli
 * listPublicRooms'un her ogesiyle AYNI (Discover karti bileseni dogrudan
 * yeniden kullanilabilsin diye). */
export function findActiveRoomForUser(targetUserId: string, viewer: DiscoverViewer) {
  const room = Array.from(rooms.values()).find((r) =>
    Array.from(r.participants.values()).some((p) => p.userId === targetUserId)
  );
  if (!room || !visibleToViewer(room, viewer)) return null;
  return mapRoomSummary(room);
}

export function joinRoom(
  code: string,
  socketId: string,
  name: string,
  userId?: string | null,
  avatarUrl?: string | null
): Room | null {
  const room = getRoom(code);
  if (!room) return null;
  room.participants.set(socketId, {
    socketId,
    name,
    isHost: false,
    muted: false,
    userId: userId ?? null,
    avatarUrl: avatarUrl ?? null,
    joinedAtMs: Date.now(),
  });
  return room;
}

/** Discover'daki "Acik" bolumunde siralama icin - bu odaya bir arkadasimin
 * EN SON ne zaman girdigini bulur (yoksa 0 doner, yani "arkadasi yok"). */
function mostRecentFriendJoinMs(room: Room, friendIds: Set<string>): number {
  let latest = 0;
  for (const p of room.participants.values()) {
    if (p.userId && friendIds.has(p.userId) && p.joinedAtMs > latest) latest = p.joinedAtMs;
  }
  return latest;
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

/** Oda haritasi icin - katilimci KENDI tercihiyle (Konumu Gizle kapaliysa)
 * GPS konumunu gonderdiginde burada tutulur (bkz. index.ts "room:location").
 * null gonderilirse (orn. haritayi kapatirken) konum temizlenir. */
export function setParticipantLocation(room: Room, socketId: string, location: { lat: number; lng: number } | null) {
  const participant = room.participants.get(socketId);
  if (participant) participant.location = location;
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
// recordHistory=false SADECE goToPreviousVideo'nun kendisinden gelir - geriye
// donus videoHistory yigininin KENDISINI tuketiyor, tekrar oraya eklenmez.
function applyPlayback(room: Room, update: Partial<PlaybackState>, recordHistory = true) {
  if (recordHistory && update.source && room.playback.source && !sourcesMatch(room.playback.source, update.source)) {
    room.videoHistory.push(room.playback.source);
  }
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

// "Onceki video" - sadece host, ve odada gercekten daha once oynatilmis bir
// video varsa kullanilabilir (vote modunda bile - bu, oylamadan BAGIMSIZ bir
// "geri don" eylemi, yeni bir secim/oy degil).
export function canGoToPreviousVideo(room: Room, requesterId: string): boolean {
  return room.videoHistory.length > 0 && isHost(room, requesterId);
}

export function goToPreviousVideo(room: Room, requesterId: string): MediaSource | null {
  if (!canGoToPreviousVideo(room, requesterId)) return null;
  const previous = room.videoHistory.pop()!;
  applyPlayback(
    room,
    { source: previous, isPlaying: previous.type !== "external", positionSeconds: 0, durationSeconds: null },
    false
  );
  return previous;
}

export function updateRoomSettings(
  room: Room,
  requesterId: string,
  updates: { privacy?: PrivacyLevel; playbackMode?: PlaybackMode; autoTranslateChat?: boolean; isAdult?: boolean },
  hostCountry?: string | null,
  hostCity?: string | null
): boolean {
  if (!isHost(room, requesterId)) return false;
  if (updates.privacy) {
    room.privacy = updates.privacy;
    room.isPublic = updates.privacy === "open";
    if (updates.privacy === "nearby" && hostCountry !== undefined) room.hostCountry = hostCountry;
    if (updates.privacy === "nearby" && hostCity !== undefined) room.hostCity = hostCity;
  }
  if (updates.playbackMode) {
    room.playbackMode = updates.playbackMode;
    // Playback modu degisince yarim kalmis bir oylama varsa anlamsizlasir.
    if (updates.playbackMode !== "vote") room.poll = null;
  }
  if (updates.autoTranslateChat !== undefined) room.autoTranslateChat = updates.autoTranslateChat;
  if (updates.isAdult !== undefined) room.isAdult = updates.isAdult;
  return true;
}

// Rave'deki gibi: video dogal olarak bitince herkese 10 saniyelik bir
// "sirada ne olsun" penceresi aciliyor.
export const POLL_DURATION_MS = 10_000;

function sourcesMatch(a: MediaSource, b: MediaSource): boolean {
  return a.type === b.type && a.url === b.url;
}

/** "Haydi Oylayalım" modunda normal medya secme ekranindan (YouTube'da
 * alakali/onerilen videolar dahil, ya da herhangi bir platform) birisi bir
 * kaynak SECTIGINDE cagrilir - bu secimin KENDISI o kisinin OYUDUR. Ayni
 * kaynagi (ayni url) baskasi da secmisse yeni bir aday ACILMAZ, mevcut
 * adaya oy eklenir - "ayni videoya kim daha cok oy verirse o kazanir"
 * mantigi boyle calisiyor. Aktif oylama yoksa yenisini baslatir (elle
 * "+ oner" ile, video sonu disinda da baslatilabilir). */
export function proposeSource(room: Room, source: MediaSource, proposedByName: string, voterSocketId: string): Poll {
  if (!room.poll) {
    room.poll = { proposals: [], votes: new Map(), deadlineMs: Date.now() + POLL_DURATION_MS };
  }
  let proposal = room.poll.proposals.find((p) => sourcesMatch(p.source, source));
  if (!proposal) {
    proposal = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, source, proposedByName };
    room.poll.proposals.push(proposal);
  }
  room.poll.votes.set(voterSocketId, proposal.id);
  return room.poll;
}

/** Video dogal olarak bitince (bkz. index.ts "playback:ended") "Haydi
 * Oylayalim" modunda otomatik olarak yeni (bos) bir oylama penceresi acar -
 * herkesin ekraninda medya secme ekrani otomatik acilir, secilen ilk video
 * aday olur, ayni videoyu secenler ona oy vermis sayilir. */
export function startVideoEndedPoll(room: Room): Poll {
  room.poll = { proposals: [], votes: new Map(), deadlineMs: Date.now() + POLL_DURATION_MS };
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
    isAdult: room.isAdult,
    poll: serializePoll(room),
    hostSocketId: room.hostSocketId,
    participants: Array.from(room.participants.values()),
    playback: { ...room.playback, positionSeconds: currentPlaybackPosition(room.playback) },
    buffering: bufferingState(room),
    hasPreviousVideo: room.videoHistory.length > 0,
  };
}
