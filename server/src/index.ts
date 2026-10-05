import "dotenv/config";
import express from "express";
import cors from "cors";
import http from "http";
import { randomUUID } from "crypto";
import { Server, Socket } from "socket.io";
import {
  createRoom,
  getRoom,
  joinRoom,
  leaveRoom,
  kickParticipant,
  transferHost,
  updatePlayback,
  updateRoomSettings,
  proposeSource,
  startVideoEndedPoll,
  castVote,
  resolvePoll,
  roomToPublicState,
  listPublicRooms,
  findActiveRoomForUser,
  hostUserIdOf,
  setBuffering,
  setParticipantLocation,
  isHost,
  MediaSource,
  PrivacyLevel,
  PlaybackMode,
  POLL_DURATION_MS,
} from "./rooms";
import { createVoiceToken } from "./livekit";
import {
  openConversation,
  previewConversation,
  sendMessage,
  sendImageMessage,
  setExpiryMs,
  markSeen,
  setOnline,
  removeOnlineBySocket,
  getSocketIdForUser,
  DMReply,
} from "./dm";
import {
  setUserName,
  getFriendStatus,
  sendRequest,
  cancelRequest,
  respondRequest,
  removeFriend,
  blockUser,
  unblockUser,
  listFriends,
  listIncoming,
  listOutgoing,
  listBlocked,
  getPublicProfile,
  profilesFor,
  ensureCountry,
  ensureCity,
} from "./social";
import { verifyAccessToken, clientForUser, isSupabaseConfigured, publicReadClient } from "./supabase";
import { lookupCountry, lookupCity, clientIpFromHandshake } from "./geoip";
import { submitReport } from "./moderation";
import { logRoomEvent } from "./analytics";
import { registerPushToken, unregisterPushToken, notifyIfOffline, PushPlatform } from "./notifications";
import { isNonEmptyString, isOptionalString, isBoolean, isFiniteNumber, isOneOf } from "./validate";
import { translateToLanguages } from "./translate";

const SOURCE_TYPES = ["youtube", "hls", "mp4", "external"] as const;

// Sohbet akisindaki "ayar degisti" sistem mesajlarinda gosterilen Turkce
// etiketler - RoomSettingsSheet.tsx'teki secenek isimleriyle tutarli.
const PRIVACY_LABEL: Record<PrivacyLevel, string> = {
  open: "Açık",
  nearby: "Yakındakiler",
  friends: "Sadece Arkadaşlar",
  invite: "Sadece Davet ile",
};
const PLAYBACK_MODE_LABEL: Record<PlaybackMode, string> = {
  leader: "Liderin Seçimi",
  playOnly: "Sadece Oynat",
  autoplay: "Otomatik Oynat",
  vote: "Haydi Oylayalım",
};

function isValidMediaSource(value: unknown): value is MediaSource {
  if (!value || typeof value !== "object") return false;
  const s = value as Record<string, unknown>;
  return (
    isOneOf(s.type, SOURCE_TYPES) &&
    isNonEmptyString(s.url, 2000) &&
    isOptionalString(s.label, 200) &&
    isOptionalString(s.coverUrl, 2000)
  );
}

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true, supabase: isSupabaseConfigured() }));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// "yakindakiler"/"arkadaslar" gizlilik seviyeleri her istemciye FARKLI bir
// Discover listesi gerektirir (bkz. rooms.ts listPublicRooms) - bu yuzden
// her socket'in kimligini burada da (kendi baglanti kapsaminin disinda,
// TUM istemcilere kisisellestirilmis yayin yapabilmek icin) tutuyoruz.
interface ConnMeta {
  userId: string | null;
  country: string | null;
  // "Yakindakiler" icin il bilgisi - "Konumu Gizle" aciksa hep null kalir
  // (bkz. rooms.ts visibleToViewer, turkeyProvinces.ts).
  city: string | null;
  db: ReturnType<typeof clientForUser> | null;
  // Ayarlar ekranindaki "Yetiskin Icerigini Gizle" tercihi - Discover
  // listesini kisisellestirirken kullanilir (bkz. rooms.ts visibleToViewer).
  hideAdultContent: boolean;
  // Uygulamanin su anki dili (i18n) - "Chat Mesajlarini Otomatik Cevir"
  // acikken bir mesaji KIME hangi dile cevirecegimizi bulmak icin (bkz.
  // "chat:send"). Misafirler de (giris yapmamis) bildirebilir.
  language: string;
}
const connectionMeta = new Map<string, ConnMeta>();

// Her oda kodu icin en fazla bir aktif oylama sayacı (setTimeout) - oda
// silinince veya playback modu degisince temizlenir.
const pollTimers = new Map<string, NodeJS.Timeout>();

function broadcastRoom(code: string) {
  const room = getRoom(code);
  if (room) io.to(code).emit("room:state", roomToPublicState(room));
}

/** Kesif/ana ekrandaki oda listesini TUM baglı istemcilere yayinlar - ama
 * gizlilik seviyeleri (yakindakiler/arkadaslar) yuzunden HERKESE AYNI liste
 * gonderilemez, bu yuzden her socket icin ayri ayri kisisellestirilmis bir
 * liste hesaplanip SADECE o socket'e gonderilir. Bir oda acildiginda/
 * kapandiginda/katilimci sayisi ya da video degistiginde cagrilir. */
async function broadcastRoomsList() {
  for (const [socketId, meta] of connectionMeta) {
    const friendIds = meta.userId && meta.db ? new Set((await listFriends(meta.db, meta.userId)).map((f) => f.userId)) : new Set<string>();
    io.to(socketId).emit(
      "rooms:list",
      listPublicRooms({ userId: meta.userId, country: meta.country, city: meta.city, friendIds, hideAdultContent: meta.hideAdultContent })
    );
  }
}

function clearPollTimer(code: string) {
  const t = pollTimers.get(code);
  if (t) {
    clearTimeout(t);
    pollTimers.delete(code);
  }
}

/** "Haydi Oylayalım" suresi dolunca (ya da herkes oy kullaninca) cagrilir -
 * en cok oyu alan aday uygulanir ve oda/Discover'a yayinlanir. */
function resolvePollAndBroadcast(code: string) {
  clearPollTimer(code);
  const room = getRoom(code);
  if (!room || !room.poll) return;
  const winner = resolvePoll(room);
  broadcastRoom(code);
  broadcastRoomsList();
  if (winner) {
    const title = winner.label || winner.type;
    io.to(code).emit("room:chat", {
      system: true,
      kind: "nowPlaying",
      title,
      text: `Oylama bitti: simdi ${title} oynatiliyor`,
      ts: Date.now(),
    });
  }
}

/** Basit sabit-pencereli rate limit: ayni socket'in ayni event'i pencere
 * basina belirli sayidan fazla gondermesini engeller (spam/abuse koruma -
 * roadmap AŞAMA 10 Socket.io guvenlik checklist). */
function makeRateLimiter() {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return function allow(key: string, max: number, windowMs: number): boolean {
    const now = Date.now();
    const entry = hits.get(key);
    if (!entry || now > entry.resetAt) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      return true;
    }
    if (entry.count >= max) return false;
    entry.count += 1;
    return true;
  };
}

io.on("connection", (socket: Socket) => {
  let currentRoomCode: string | null = null;
  let myUserId: string | null = null;
  let myName = "Misafir";
  let myDb: ReturnType<typeof clientForUser> | null = null;
  let myCountry: string | null = null;
  let myCity: string | null = null;
  let myHideLocation = true;
  let myHideAdultContent = false;
  let myLanguage = "tr";
  const allow = makeRateLimiter();

  // Giris yapmamis (anonim) bir istemci de Discover'da "acik" odalari
  // gorebilmeli - bu yuzden HERKES (identify olsun olmasin) buraya kaydedilir.
  connectionMeta.set(socket.id, { userId: null, country: null, city: null, db: null, hideAdultContent: false, language: myLanguage });

  socket.on("rooms:list", async (_data, ack) => {
    const friendIds = myUserId && myDb ? new Set((await listFriends(myDb, myUserId)).map((f) => f.userId)) : new Set<string>();
    ack?.(listPublicRooms({ userId: myUserId, country: myCountry, city: myCity, friendIds, hideAdultContent: myHideAdultContent }));
  });

  // Ozelden mesajlasma / arkadaslik icin: kullanici Supabase access token'ini
  // gonderir, sunucu bunu DOGRULAR ve GERCEK kullanici id'sini kendisi
  // belirler. Client'in "ben buyum" dedigi bir id ASLA kabul edilmez -
  // aksi halde biri baskasinin id'sini bilerek onun DM'lerini/arkadaslik
  // isteklerini yonetebilirdi (roadmap AŞAMA 4, IDOR).
  socket.on("user:identify", async ({ accessToken }: { accessToken: string }, ack) => {
    if (!accessToken) return ack?.({ ok: false, error: "accessToken gerekli." });
    const user = await verifyAccessToken(accessToken);
    if (!user) return ack?.({ ok: false, error: "Gecersiz oturum." });

    myUserId = user.id;
    myName = user.email ? user.email.split("@")[0] : "Kullanici";
    myDb = clientForUser(accessToken);
    connectionMeta.set(socket.id, { userId: myUserId, country: myCountry, city: myCity, db: myDb, hideAdultContent: myHideAdultContent, language: myLanguage });
    setOnline(myUserId, socket.id);
    await setUserName(myDb, myUserId, myName);
    ack?.({ ok: true, userId: myUserId, name: myName });

    // Kayitli "Yetiskin Icerigini Gizle" tercihini yukle - kritik degil,
    // basarisiz olursa/gecikirse akisi bloklamaz (ulke tespiti gibi).
    myDb
      .from("profiles")
      .select("hide_adult_content")
      .eq("id", myUserId)
      .maybeSingle()
      .then(
        ({ data }) => {
          myHideAdultContent = data?.hide_adult_content === true;
          const meta = connectionMeta.get(socket.id);
          if (meta) meta.hideAdultContent = myHideAdultContent;
        },
        () => {}
      );

    // Ulke bilgisi kritik degil - basarisiz olursa/gecikirse akisi bloklamaz.
    const ip = clientIpFromHandshake(socket.handshake);
    ensureCountry(myDb, myUserId, ip, lookupCountry)
      .then((country) => {
        myCountry = country;
        const meta = connectionMeta.get(socket.id);
        if (meta) meta.country = country;
      })
      .catch(() => {});

    // Kayitli "Konumu Gizle" tercihini yukle - SADECE kapaliysa (paylasmayi
    // sectiyse) il tespiti (ensureCity) calistirilir, aciksa (varsayilan) il
    // hic sorgulanmaz - "Yakindakiler" bu kullaniciyi hic yakalayamaz.
    myDb
      .from("profiles")
      .select("hide_location, city")
      .eq("id", myUserId)
      .maybeSingle()
      .then(({ data }) => {
        myHideLocation = data?.hide_location !== false; // varsayilan: gizli
        if (myHideLocation) return;
        if (data?.city) {
          myCity = data.city;
          const meta = connectionMeta.get(socket.id);
          if (meta) meta.city = myCity;
          return;
        }
        ensureCity(myDb!, myUserId!, ip, lookupCity)
          .then((city) => {
            myCity = city;
            const meta = connectionMeta.get(socket.id);
            if (meta) meta.city = city;
          })
          .catch(() => {});
      }, () => {});
  });

  function requireAuth(ack?: (res: any) => void): boolean {
    if (!myUserId || !myDb) {
      ack?.({ ok: false, error: "Once giris yapmalisin." });
      return false;
    }
    return true;
  }

  // Ayarlar ekranindaki "Yetiskin Icerigini Gizle" - GERCEK deger hem
  // kaydediliyor hem de bu baglantinin Discover listesini ANINDA
  // kisisellestirmek icin bellekte guncelleniyor (bkz. broadcastRoomsList).
  socket.on("profile:hideAdultContent", async ({ enabled }: { enabled: boolean }, ack) => {
    if (!requireAuth(ack) || !isBoolean(enabled)) return ack?.({ ok: false });
    myHideAdultContent = enabled;
    const meta = connectionMeta.get(socket.id);
    if (meta) meta.hideAdultContent = enabled;
    await myDb!.from("profiles").update({ hide_adult_content: enabled }).eq("id", myUserId);
    ack?.({ ok: true });
    broadcastRoomsList();
  });

  // Ayarlar ekranindaki "Konumu Gizle" - GERCEK deger hem kaydediliyor hem
  // bu baglantinin "Yakindakiler" eslesmesini ANINDA guncelliyor. Kapatilirsa
  // (paylasmayi SECERSE) il hemen tespit edilir; acilirsa (gizlerse) bilinen
  // il DE siliniyor - "gizle" dedikten sonra eski ilin DB'de kalmasi mantiksiz.
  socket.on("profile:hideLocation", async ({ enabled }: { enabled: boolean }, ack) => {
    if (!requireAuth(ack) || !isBoolean(enabled)) return ack?.({ ok: false });
    myHideLocation = enabled;
    if (enabled) {
      myCity = null;
      const meta = connectionMeta.get(socket.id);
      if (meta) meta.city = null;
      await myDb!.from("profiles").update({ hide_location: true, city: null }).eq("id", myUserId);
    } else {
      await myDb!.from("profiles").update({ hide_location: false }).eq("id", myUserId);
      const ip = clientIpFromHandshake(socket.handshake);
      ensureCity(myDb!, myUserId!, ip, lookupCity)
        .then((city) => {
          myCity = city;
          const meta = connectionMeta.get(socket.id);
          if (meta) meta.city = city;
        })
        .catch(() => {});
    }
    ack?.({ ok: true });
  });

  // Uygulamanin su anki dili - "Chat Mesajlarini Otomatik Cevir" acik bir
  // odada bir mesaji HANGI dillere cevirecegimizi bulmak icin (bkz.
  // "chat:send"). Giris yapmamis MISAFIRLER de chat'e yazip okudugu icin
  // requireAuth YOK - herkes bildirebilir. Client bunu App.tsx acilisinda
  // ve Ayarlar'da dil degistirince gonderir (bkz. mobile/src/i18n/index.ts).
  socket.on("profile:language", ({ lang }: { lang: string }) => {
    if (!isNonEmptyString(lang, 10)) return;
    myLanguage = lang;
    const meta = connectionMeta.get(socket.id);
    if (meta) meta.language = lang;
  });

  socket.on("friend:status", async ({ withUserId }: { withUserId: string }, ack) => {
    if (!requireAuth(ack) || !isNonEmptyString(withUserId, 200)) return ack?.({ ok: false });
    ack?.({ ok: true, status: await getFriendStatus(myDb!, withUserId) });
  });

  // Bir katilimcinin avatarina basildiginda profilini acmak icin - isim,
  // handle, avatar, bio ve ulke herkese acik bilgiler (profiles_select_all).
  socket.on("user:profile", async ({ userId }: { userId: string }, ack) => {
    if (!isNonEmptyString(userId, 200)) return ack?.({ ok: false, error: "Gecersiz kullanici." });
    const db = myDb || publicReadClient();
    if (!db) return ack?.({ ok: false, error: "Sunucu yapilandirilmamis." });
    const profile = await getPublicProfile(db, userId);
    if (!profile) return ack?.({ ok: false, error: "Kullanici bulunamadi." });
    // Gercek cevrimici durumu - getSocketIdForUser dolu donerse o kullanici
    // su an bagli bir socket'e sahip demektir (bkz. dm.ts online Map'i).
    ack?.({ ok: true, profile: { ...profile, isOnline: Boolean(getSocketIdForUser(userId)) } });
  });

  // Profildeki GERCEK "LUNA Suresi / En Uzun Oturum / En Buyuk Odaniz /
  // Gunluk Saatler" - supabase/migrations/0003_profile_stats_and_history.sql
  // icindeki get_user_activity_stats RPC'si room_events'i hesaplayarak
  // bu dort degeri dondurur (herkese acik - profil sayfasinda gosteriliyor).
  socket.on("user:activityStats", async ({ userId }: { userId: string }, ack) => {
    if (!isNonEmptyString(userId, 200)) return ack?.({ ok: false, error: "Gecersiz kullanici." });
    const db = myDb || publicReadClient();
    if (!db) return ack?.({ ok: false, error: "Sunucu yapilandirilmamis." });
    const { data, error } = await db.rpc("get_user_activity_stats", { target: userId, days: 9 });
    if (error || !data || !data[0]) return ack?.({ ok: false, error: "Istatistikler alinamadi." });
    const row = data[0];
    ack?.({
      ok: true,
      stats: {
        totalHours: Number(row.total_hours) || 0,
        longestSessionHours: Number(row.longest_session_hours) || 0,
        biggestRoom: Number(row.biggest_room) || 0,
        daily: row.daily || {},
      },
    });
  });

  // Gercek arkadas SAYISI - get_friend_count RPC'si RLS'i (friendships_
  // select_involved sadece kendi iliskini gormene izin verir) guvenli bir
  // sekilde bypass eder, sadece SAYI doner, listeyi degil.
  socket.on("user:friendCount", async ({ userId }: { userId: string }, ack) => {
    if (!isNonEmptyString(userId, 200)) return ack?.({ ok: false, error: "Gecersiz kullanici." });
    const db = myDb || publicReadClient();
    if (!db) return ack?.({ ok: false, error: "Sunucu yapilandirilmamis." });
    const { data, error } = await db.rpc("get_friend_count", { target: userId });
    if (error) return ack?.({ ok: false, error: "Sayi alinamadi." });
    ack?.({ ok: true, count: Number(data) || 0 });
  });

  // Profildeki GERCEK "Galeri"/"Videolar" - get_user_room_history RPC'si
  // target KENDISI degilse, SADECE target'in profilinde galeri/video
  // gorunurlugu aciksa veri dondurur (gizlilik "goz" ikonuyla gercekten
  // kontrol edilebiliyor artik).
  socket.on("user:roomHistory", async ({ userId }: { userId: string }, ack) => {
    if (!isNonEmptyString(userId, 200)) return ack?.({ ok: false, error: "Gecersiz kullanici." });
    const db = myDb || publicReadClient();
    if (!db) return ack?.({ ok: false, error: "Sunucu yapilandirilmamis." });
    const { data, error } = await db.rpc("get_user_room_history", { target: userId, max_rows: 12 });
    if (error) return ack?.({ ok: false, error: "Gecmis alinamadi." });
    ack?.({
      ok: true,
      history: (data || []).map((row: any) => ({
        eventId: row.event_id,
        roomCode: row.room_code,
        mediaLabel: row.media_label,
        mediaCoverUrl: row.media_cover_url,
        mediaType: row.media_type,
        participantCount: row.participant_count || 0,
        createdAt: new Date(row.created_at).getTime(),
      })),
    });
  });

  // "Begenilenler" sekmesi - kullanicinin KENDI gecmisinden kalp ikonuyla
  // isaretledigi altkume (bkz. 0008_video_likes_and_best.sql).
  socket.on("user:likedHistory", async ({ userId }: { userId: string }, ack) => {
    if (!isNonEmptyString(userId, 200)) return ack?.({ ok: false, error: "Gecersiz kullanici." });
    const db = myDb || publicReadClient();
    if (!db) return ack?.({ ok: false, error: "Sunucu yapilandirilmamis." });
    const { data, error } = await db.rpc("get_user_liked_history", { target: userId, max_rows: 12 });
    if (error) return ack?.({ ok: false, error: "Begenilenler alinamadi." });
    ack?.({
      ok: true,
      history: (data || []).map((row: any) => ({
        eventId: row.event_id,
        roomCode: row.room_code,
        mediaLabel: row.media_label,
        mediaCoverUrl: row.media_cover_url,
        mediaType: row.media_type,
        participantCount: row.participant_count || 0,
        createdAt: new Date(row.created_at).getTime(),
      })),
    });
  });

  // Profildeki "su an acik odasi" karti - hedef kullanici gercekten acik
  // bir odada mi, VE o oda bu BAKAN icin Kesif'teki ile AYNI gizlilik
  // kuralina gore gorunur mu (bkz. rooms.ts findActiveRoomForUser). Boylece
  // "sadece arkadaslarim gorsun" diyen biri gizlilige uygun kalir.
  socket.on("user:activeRoom", async ({ userId }: { userId: string }, ack) => {
    if (!isNonEmptyString(userId, 200)) return ack?.({ ok: false, error: "Gecersiz kullanici." });
    const friendIds = myUserId && myDb ? new Set((await listFriends(myDb, myUserId)).map((f) => f.userId)) : new Set<string>();
    const room = findActiveRoomForUser(userId, { userId: myUserId, country: myCountry, city: myCity, friendIds });
    ack?.({ ok: true, room });
  });

  socket.on("friends:list", async (_data, ack) => {
    if (!requireAuth(ack)) return;
    ack?.({
      ok: true,
      friends: await listFriends(myDb!, myUserId!),
      incoming: await listIncoming(myDb!, myUserId!),
      outgoing: await listOutgoing(myDb!, myUserId!),
      blocked: await listBlocked(myDb!, myUserId!),
    });
  });

  socket.on("friend:request", async ({ toUserId }: { toUserId: string }, ack) => {
    if (!requireAuth(ack) || !isNonEmptyString(toUserId, 200)) return ack?.({ ok: false });
    if (!allow("friend:request", 20, 60_000)) return ack?.({ ok: false, error: "Cok fazla istek, biraz bekle." });
    const ok = await sendRequest(myDb!, toUserId);
    ack?.({ ok });
    if (ok) {
      const peerSocketId = getSocketIdForUser(toUserId);
      if (peerSocketId) io.to(peerSocketId).emit("friend:incoming", { fromUserId: myUserId, fromName: myName });
      notifyIfOffline(myDb!, toUserId, Boolean(peerSocketId), "Yeni arkadaşlık isteği", `${myName} sana arkadaşlık isteği gönderdi`).catch(() => {});
    }
  });

  socket.on("friend:cancel", async ({ toUserId }: { toUserId: string }, ack) => {
    if (!requireAuth(ack) || !isNonEmptyString(toUserId, 200)) return ack?.({ ok: false });
    await cancelRequest(myDb!, toUserId);
    ack?.({ ok: true });
    const peerSocketId = getSocketIdForUser(toUserId);
    if (peerSocketId) io.to(peerSocketId).emit("friend:cancelled", { byUserId: myUserId });
  });

  socket.on(
    "friend:respond",
    async ({ fromUserId, accept }: { fromUserId: string; accept: boolean }, ack) => {
      if (!requireAuth(ack) || !isNonEmptyString(fromUserId, 200) || !isBoolean(accept)) return ack?.({ ok: false });
      await respondRequest(myDb!, fromUserId, accept);
      ack?.({ ok: true });
      const peerSocketId = getSocketIdForUser(fromUserId);
      if (peerSocketId) {
        io.to(peerSocketId).emit(accept ? "friend:accepted" : "friend:declined", {
          byUserId: myUserId,
          byName: myName,
        });
      }
    }
  );

  socket.on("friend:remove", async ({ userId }: { userId: string }, ack) => {
    if (!requireAuth(ack) || !isNonEmptyString(userId, 200)) return ack?.({ ok: false });
    await removeFriend(myDb!, userId);
    ack?.({ ok: true });
    const peerSocketId = getSocketIdForUser(userId);
    if (peerSocketId) io.to(peerSocketId).emit("friend:removed", { byUserId: myUserId });
  });

  socket.on("friend:block", async ({ userId }: { userId: string }, ack) => {
    if (!requireAuth(ack) || !isNonEmptyString(userId, 200)) return ack?.({ ok: false });
    await blockUser(myDb!, userId);
    ack?.({ ok: true });
  });

  socket.on("friend:unblock", async ({ userId }: { userId: string }, ack) => {
    if (!requireAuth(ack) || !isNonEmptyString(userId, 200)) return ack?.({ ok: false });
    await unblockUser(myDb!, userId);
    ack?.({ ok: true });
  });

  // Arkadaslar listesinde son mesaj onizlemesi gostermek icin - dm:open'in
  // aksine "gorundu" isaretlemez, sadece son mesaji dondurur.
  socket.on("dm:preview", async ({ withUserId }: { withUserId: string }, ack) => {
    if (!requireAuth(ack) || !isNonEmptyString(withUserId, 200)) return ack?.({ ok: false });
    const lastMessage = await previewConversation(myDb!, myUserId!, withUserId);
    ack?.({ ok: true, lastMessage });
  });

  socket.on("dm:open", async ({ withUserId }: { withUserId: string }, ack) => {
    if (!requireAuth(ack) || !isNonEmptyString(withUserId, 200)) return ack?.({ ok: false });
    const result = await openConversation(myDb!, withUserId);
    if (!result) return ack?.({ ok: false, error: "Konusma acilamadi." });
    ack?.({ ok: true, messages: result.messages, expiresAfterMs: result.expiresAfterMs });
    const peerSocketId = getSocketIdForUser(withUserId);
    if (peerSocketId) io.to(peerSocketId).emit("dm:seen", { byUserId: myUserId, at: Date.now() });
  });

  socket.on(
    "dm:send",
    async ({ toUserId, text, replyTo }: { toUserId: string; text: string; replyTo?: DMReply | null }, ack) => {
      if (!requireAuth(ack) || !isNonEmptyString(toUserId, 200) || !isNonEmptyString(text, 1000)) {
        return ack?.({ ok: false });
      }
      const validReplyTo =
        replyTo && isNonEmptyString(replyTo.text, 1000) && isNonEmptyString(replyTo.fromName, 200)
          ? replyTo
          : null;
      if (!allow("dm:send", 30, 10_000)) return ack?.({ ok: false, error: "Cok hizli mesaj gonderiyorsun." });
      const result = await sendMessage(myDb!, toUserId, text, validReplyTo);
      if (!result.ok || !result.message) {
        return ack?.({ ok: false, error: result.error === "blocked" ? "Bu kullaniciya mesaj gonderemezsin." : "Mesaj gonderilemedi." });
      }
      ack?.({ ok: true, message: result.message });
      const peerSocketId = getSocketIdForUser(toUserId);
      if (peerSocketId) io.to(peerSocketId).emit("dm:message", { fromUserId: myUserId, message: result.message });
      notifyIfOffline(myDb!, toUserId, Boolean(peerSocketId), myName, text.trim().slice(0, 120)).catch(() => {});
    }
  );

  // DM'de GERCEK fotograf gonderme - client fotografi "chat-media" storage
  // bucket'ina kendisi yukler (bkz. 0015_chat_media.sql), buraya sadece
  // ortaya cikan public URL'i ve "+18 isaretle" tercihini gonderir.
  socket.on(
    "dm:sendImage",
    async ({ toUserId, mediaUrl, isAdult }: { toUserId: string; mediaUrl: string; isAdult?: boolean }, ack) => {
      if (!requireAuth(ack) || !isNonEmptyString(toUserId, 200) || !isNonEmptyString(mediaUrl, 2000)) {
        return ack?.({ ok: false });
      }
      if (isAdult !== undefined && !isBoolean(isAdult)) return ack?.({ ok: false });
      if (!allow("dm:send", 30, 10_000)) return ack?.({ ok: false, error: "Cok hizli mesaj gonderiyorsun." });
      const result = await sendImageMessage(myDb!, toUserId, mediaUrl, isAdult === true);
      if (!result.ok || !result.message) {
        return ack?.({ ok: false, error: result.error === "blocked" ? "Bu kullaniciya mesaj gonderemezsin." : "Mesaj gonderilemedi." });
      }
      ack?.({ ok: true, message: result.message });
      const peerSocketId = getSocketIdForUser(toUserId);
      if (peerSocketId) io.to(peerSocketId).emit("dm:message", { fromUserId: myUserId, message: result.message });
      notifyIfOffline(myDb!, toUserId, Boolean(peerSocketId), myName, "📷 Fotoğraf gönderdi").catch(() => {});
    }
  );

  // DM'de bir mesaja CIFT TIKLAYINCA gonderilen tepki - oda sohbetindeki
  // message:react'in aksine burada sadece 2 taraf oldugu icin sunucu hicbir
  // state tutmaz, anlik olarak karsi tarafa iletir (emoji:null tepkinin
  // geri alindigini/toggle oldugunu belirtir).
  socket.on(
    "dm:react",
    (
      { withUserId, messageId, emoji }: { withUserId: string; messageId: string; emoji: string | null },
      ack
    ) => {
      if (!requireAuth(ack) || !isNonEmptyString(withUserId, 200) || !isNonEmptyString(messageId, 100)) {
        return ack?.({ ok: false });
      }
      if (emoji !== null && !isNonEmptyString(emoji, 8)) return ack?.({ ok: false });
      if (!allow("dm:react", 40, 10_000)) return ack?.({ ok: false });
      ack?.({ ok: true });
      const peerSocketId = getSocketIdForUser(withUserId);
      if (peerSocketId) io.to(peerSocketId).emit("dm:reaction", { fromUserId: myUserId, messageId, emoji });
    }
  );

  socket.on("dm:setExpiry", async ({ withUserId, ms }: { withUserId: string; ms: number | null }, ack) => {
    if (!requireAuth(ack) || !isNonEmptyString(withUserId, 200)) return ack?.({ ok: false });
    if (ms !== null && !isFiniteNumber(ms, 1000, 365 * 24 * 60 * 60 * 1000)) return ack?.({ ok: false });
    await setExpiryMs(myDb!, withUserId, ms);
    ack?.({ ok: true });
    const peerSocketId = getSocketIdForUser(withUserId);
    if (peerSocketId) io.to(peerSocketId).emit("dm:expiry", { byUserId: myUserId, ms });
  });

  socket.on(
    "room:create",
    async (
      { name, isPublic, source }: { name: string; isPublic?: boolean; source: MediaSource },
      ack
    ) => {
      if (!isValidMediaSource(source)) return ack?.({ ok: false, error: "Gecersiz medya kaynagi." });
      if (!isOptionalString(name, 60)) return ack?.({ ok: false, error: "Gecersiz isim." });
      if (isPublic !== undefined && !isBoolean(isPublic)) return ack?.({ ok: false, error: "Gecersiz istek." });
      if (!allow("room:create", 10, 60_000)) return ack?.({ ok: false, error: "Cok fazla oda acildi, biraz bekle." });
      const hostProfile = myUserId && myDb ? await getPublicProfile(myDb, myUserId) : null;
      // Oda, icerik secilmeden var olamaz - odanin/kartin ismi de secilen
      // icerigin ismi (source.label) oluyor, ayri bir oda basligi girilmiyor.
      const room = createRoom(
        socket.id,
        name || myName || "Host",
        { isPublic, source },
        myUserId,
        myCountry,
        hostProfile?.avatarUrl ?? null,
        hostProfile?.defaultAutoTranslate ?? false,
        undefined,
        myCity
      );
      currentRoomCode = room.code;
      socket.join(room.code);
      ack?.({ ok: true, room: roomToPublicState(room) });
      broadcastRoomsList();
      if (myDb && myUserId)
        // DIKKAT: source.label BOS olabilir (orn. ozel bir URL yapistirilip
        // baslik otomatik tespit edilemediginde) - room.title ise HER ZAMAN
        // dolu (createRoom icinde "source.label || hostName'in odasi" diye
        // garantileniyor). Bunun yerine source.label kullanilirsa media_label
        // null kalir ve get_user_room_history bu kaydi SESSIZCE atlar - "izledim
        // ama Gecmis'te gorunmuyor" hatasina yol acar.
        logRoomEvent(myDb, myUserId, room.code, "create", room.title, {
          participantCount: room.participants.size,
          coverUrl: source.coverUrl,
          type: source.type,
          url: source.url,
        }).catch(() => {});
    }
  );

  // Karta uzun basinca acilan oda onizleme ekrani icin - odaya KATILMADAN
  // (socket.join yok, oda katilimci sayisini etkilemez) mevcut katilimcilarin
  // gercek isim/handle/avatar/ulke bilgilerini tek sorguda getirir.
  socket.on("room:participants", async ({ code }: { code: string }, ack) => {
    if (!isNonEmptyString(code, 12)) return ack?.({ ok: false, error: "Oda bulunamadi." });
    const room = getRoom(code);
    if (!room) return ack?.({ ok: false, error: "Oda bulunamadi." });

    const participants = Array.from(room.participants.values());
    const userIds = participants.map((p) => p.userId).filter((id): id is string => Boolean(id));
    const db = myDb || publicReadClient();
    const profiles = db ? await profilesFor(db, userIds) : new Map();

    ack?.({
      ok: true,
      participantCount: participants.length,
      participants: participants.map((p) => {
        const profile = p.userId ? profiles.get(p.userId) : undefined;
        return {
          userId: p.userId ?? null,
          name: profile?.name || p.name,
          handle: profile?.handle ?? null,
          avatarUrl: profile?.avatarUrl ?? null,
          country: profile?.country ?? null,
          isHost: p.isHost,
        };
      }),
    });
  });

  socket.on("room:join", async ({ code, name }: { code: string; name?: string }, ack) => {
    if (!isNonEmptyString(code, 12)) return ack?.({ ok: false, error: "Oda bulunamadi. Kodu kontrol et." });
    if (!isOptionalString(name, 60)) return ack?.({ ok: false, error: "Gecersiz isim." });
    if (!allow("room:join", 20, 60_000)) return ack?.({ ok: false, error: "Cok fazla deneme, biraz bekle." });

    const target = getRoom(code);
    if (!target) return ack?.({ ok: false, error: "Oda bulunamadi. Kodu kontrol et." });

    // GIZLILIK kontrolu: "invite" haric hepsi kod bilinse bile burada
    // engellenebilir - "invite" zaten Discover'da hic gorunmedigi icin
    // koda ulasmak basli basina davet sayilir.
    const hostId = hostUserIdOf(target);
    // DIKKAT: myUserId/hostId ikisi de null olabilir (giris yapmamis host'un
    // kendi odasi) - "host === ben" kontrolu SADECE gercek (dolu) bir id
    // eslesmesiyle gecerli olmali, iki null'u birbirine esit SAYMAMALI.
    const isHostIdentity = Boolean(myUserId) && myUserId === hostId;
    if (target.privacy === "friends" && !isHostIdentity) {
      if (!myUserId || !myDb) return ack?.({ ok: false, error: "Bu odaya katilmak icin giris yapmalisin." });
      const status = await getFriendStatus(myDb, hostId || "");
      if (status !== "friends") return ack?.({ ok: false, error: "Bu oda sadece host'un arkadaslarina acik." });
    } else if (target.privacy === "nearby" && !isHostIdentity) {
      if (!myCountry || !target.hostCountry || myCountry !== target.hostCountry) {
        return ack?.({ ok: false, error: "Bu oda sadece yakinindaki kullanicilara acik." });
      }
    }

    const joinAvatarUrl = myUserId && myDb ? (await getPublicProfile(myDb, myUserId))?.avatarUrl ?? null : null;
    const room = joinRoom(code, socket.id, name || myName || "Misafir", myUserId, joinAvatarUrl);
    if (!room) {
      ack?.({ ok: false, error: "Oda bulunamadi. Kodu kontrol et." });
      return;
    }
    currentRoomCode = room.code;
    socket.join(room.code);
    ack?.({ ok: true, room: roomToPublicState(room) });
    broadcastRoom(room.code);
    broadcastRoomsList();
    io.to(room.code).emit("room:chat", {
      system: true,
      kind: "joined",
      targetName: name || "Misafir",
      targetAvatarUrl: joinAvatarUrl,
      text: `${name || "Misafir"} odaya katildi.`,
      ts: Date.now(),
    });
    if (myDb && myUserId)
      // room.title (yukaridaki "create" ile ayni sebep) - source.label BOS
      // olabilir, room.title HER ZAMAN dolu.
      logRoomEvent(myDb, myUserId, room.code, "join", room.title, {
        participantCount: room.participants.size,
        coverUrl: room.playback.source?.coverUrl,
        type: room.playback.source?.type,
        url: room.playback.source?.url,
      }).catch(() => {});
  });

  socket.on("room:leave", () => {
    handleLeave();
  });

  socket.on("disconnect", () => {
    handleLeave();
    removeOnlineBySocket(socket.id);
    connectionMeta.delete(socket.id);
  });

  function handleLeave() {
    if (!currentRoomCode) return;
    const { room, newHostId, roomDeleted } = leaveRoom(currentRoomCode, socket.id);
    const code = currentRoomCode;
    currentRoomCode = null;
    if (myDb && myUserId) logRoomEvent(myDb, myUserId, code, "leave").catch(() => {});
    if (roomDeleted || !room) {
      clearPollTimer(code);
      return;
    }
    if (newHostId) {
      io.to(code).emit("room:chat", {
        system: true,
        text: "Lider ayrildi, liderlik baska bir katilimciya devredildi.",
        ts: Date.now(),
      });
    }
    broadcastRoom(code);
    broadcastRoomsList();
  }

  socket.on(
    "playback:update",
    (update: { source?: MediaSource | null; isPlaying?: boolean; positionSeconds?: number; durationSeconds?: number }) => {
      if (!currentRoomCode) return;
      if (update.source && !isValidMediaSource(update.source)) return;
      if (update.isPlaying !== undefined && !isBoolean(update.isPlaying)) return;
      if (update.positionSeconds !== undefined && !isFiniteNumber(update.positionSeconds, 0, 10_000_000)) return;
      if (update.durationSeconds !== undefined && !isFiniteNumber(update.durationSeconds, 0, 10_000_000)) return;
      const room = getRoom(currentRoomCode);
      if (!room) return;
      const applied = updatePlayback(room, socket.id, update);
      if (applied) {
        broadcastRoom(currentRoomCode);
        if (update.source !== undefined) broadcastRoomsList();
        // Rave'deki gibi: yeni bir medya secildiginde sohbet akisina
        // "Simdi X oynatiliyor" seklinde zengin (kalin basliklı) bir sistem
        // mesaji dusuyor - istemci "kind: nowPlaying" ile kalp butonu da ekliyor.
        if (update.source) {
          const title = update.source.label || update.source.type;
          io.to(currentRoomCode).emit("room:chat", {
            system: true,
            kind: "nowPlaying",
            title,
            text: `Simdi ${title} oynatiliyor`,
            ts: Date.now(),
          });
        }
      }
    }
  );

  // Ayarlar ekrani: GIZLILIK / PLAYBACK / sohbet otomatik ceviri / 18+ icerik - sadece host.
  socket.on(
    "room:settings",
    async (
      updates: { privacy?: PrivacyLevel; playbackMode?: PlaybackMode; autoTranslateChat?: boolean; isAdult?: boolean },
      ack
    ) => {
      if (!currentRoomCode) return ack?.({ ok: false, error: "Bir odada degilsin." });
      if (updates.privacy && !isOneOf(updates.privacy, ["open", "nearby", "friends", "invite"] as const))
        return ack?.({ ok: false, error: "Gecersiz gizlilik degeri." });
      if (updates.playbackMode && !isOneOf(updates.playbackMode, ["leader", "playOnly", "autoplay", "vote"] as const))
        return ack?.({ ok: false, error: "Gecersiz playback degeri." });
      if (updates.autoTranslateChat !== undefined && !isBoolean(updates.autoTranslateChat))
        return ack?.({ ok: false, error: "Gecersiz istek." });
      if (updates.isAdult !== undefined && !isBoolean(updates.isAdult))
        return ack?.({ ok: false, error: "Gecersiz istek." });
      const room = getRoom(currentRoomCode);
      if (!room) return ack?.({ ok: false, error: "Oda bulunamadi." });
      const applied = updateRoomSettings(room, socket.id, updates, myCountry, myCity);
      if (!applied) return ack?.({ ok: false, error: "Sadece lider ayarlari degistirebilir." });
      if (updates.playbackMode && updates.playbackMode !== "vote") clearPollTimer(currentRoomCode);
      ack?.({ ok: true });
      broadcastRoom(currentRoomCode);
      broadcastRoomsList();
      // Rave'deki gibi: bir ayar degistiginde sohbet akisina ozel ikonlu
      // (disli) bir sistem mesaji dusuyor (bkz. RoomScreen.tsx "settings" render dali).
      const byName = room.participants.get(socket.id)?.name || myName;
      if (updates.privacy) {
        const value = PRIVACY_LABEL[updates.privacy];
        io.to(currentRoomCode).emit("room:chat", {
          system: true,
          kind: "settings",
          byName,
          settingLabel: "Gizlilik",
          settingValue: value,
          text: `${byName} gizliligi "${value}" yapti.`,
          ts: Date.now(),
        });
      }
      if (updates.playbackMode) {
        const value = PLAYBACK_MODE_LABEL[updates.playbackMode];
        io.to(currentRoomCode).emit("room:chat", {
          system: true,
          kind: "settings",
          byName,
          settingLabel: "Oynatma modu",
          settingValue: value,
          text: `${byName} oynatma modunu "${value}" yapti.`,
          ts: Date.now(),
        });
      }
      if (updates.autoTranslateChat !== undefined) {
        const value = updates.autoTranslateChat ? "Açık" : "Kapalı";
        io.to(currentRoomCode).emit("room:chat", {
          system: true,
          kind: "settings",
          byName,
          settingLabel: "Sohbet çevirisi",
          settingValue: value,
          text: `${byName} sohbet cevirisini "${value}" yapti.`,
          ts: Date.now(),
        });
      }
      if (updates.isAdult !== undefined) {
        const value = updates.isAdult ? "Açık" : "Kapalı";
        io.to(currentRoomCode).emit("room:chat", {
          system: true,
          kind: "settings",
          byName,
          settingLabel: "18+ içerik",
          settingValue: value,
          text: `${byName} 18+ icerik isaretini "${value}" yapti.`,
          ts: Date.now(),
        });
      }
    }
  );

  // "Haydi Oylayalım" modunda normal medya secme ekranindan bir video/
  // platform SECER - bu secim o kisinin OYUDUR (bkz. rooms.ts proposeSource
  // aciklamasi). Aktif oylama yoksa 10sn'lik yenisini baslatir.
  socket.on("room:proposeSource", ({ source }: { source: MediaSource }, ack) => {
    if (!currentRoomCode) return ack?.({ ok: false, error: "Bir odada degilsin." });
    if (!isValidMediaSource(source)) return ack?.({ ok: false, error: "Gecersiz medya kaynagi." });
    const room = getRoom(currentRoomCode);
    if (!room) return ack?.({ ok: false, error: "Oda bulunamadi." });
    if (room.playbackMode !== "vote") return ack?.({ ok: false, error: "Oylama modu acik degil." });
    const wasActive = Boolean(room.poll);
    const proposerName = room.participants.get(socket.id)?.name || myName;
    proposeSource(room, source, proposerName, socket.id);
    if (!wasActive) {
      pollTimers.set(currentRoomCode, setTimeout(() => resolvePollAndBroadcast(currentRoomCode!), POLL_DURATION_MS));
    }
    ack?.({ ok: true });
    // Odadaki HERKES zaten secim/oy kullandiysa suresi dolmasini beklemeden
    // hemen sonuclandir (room:vote handler'indaki ayni mantik).
    if (room.poll && room.poll.votes.size >= room.participants.size) {
      resolvePollAndBroadcast(currentRoomCode);
    } else {
      broadcastRoom(currentRoomCode);
    }
  });

  // Video dogal olarak bittiginde (sadece host'un oynaticisindan gelir)
  // "Haydi Oylayalim" modundaysak otomatik olarak yeni bir "sirada ne
  // olsun" penceresi aciyoruz - herkesin ekraninda medya secme ekrani
  // otomatik acilacak (bkz. RoomScreen.tsx room.poll useEffect'i).
  socket.on("playback:ended", () => {
    if (!currentRoomCode) return;
    const room = getRoom(currentRoomCode);
    if (!room || !isHost(room, socket.id) || room.playbackMode !== "vote" || room.poll) return;
    startVideoEndedPoll(room);
    pollTimers.set(currentRoomCode, setTimeout(() => resolvePollAndBroadcast(currentRoomCode!), POLL_DURATION_MS));
    broadcastRoom(currentRoomCode);
  });

  socket.on("room:vote", ({ proposalId }: { proposalId: string }, ack) => {
    if (!currentRoomCode) return ack?.({ ok: false, error: "Bir odada degilsin." });
    if (!isNonEmptyString(proposalId, 100)) return ack?.({ ok: false, error: "Gecersiz oy." });
    const room = getRoom(currentRoomCode);
    if (!room) return ack?.({ ok: false, error: "Oda bulunamadi." });
    const applied = castVote(room, socket.id, proposalId);
    if (!applied) return ack?.({ ok: false, error: "Aktif bir oylama yok." });
    ack?.({ ok: true });
    // Odadaki HERKES oy kullandiysa suresi dolmasini beklemeden hemen sonuclandir.
    if (room.poll && room.poll.votes.size >= room.participants.size) {
      resolvePollAndBroadcast(currentRoomCode);
    } else {
      broadcastRoom(currentRoomCode);
    }
  });

  /** Bir kullanicinin videosu yukleniyorsa (yavas internet), diger herkese
   * haber verilir - istemciler bunu goruce kendi videosunu GECICI olarak
   * durdurup, tamponlanan kisi yetisince otomatik devam edebilir. */
  socket.on("playback:buffering", ({ isBuffering }: { isBuffering: boolean }) => {
    if (!currentRoomCode) return;
    const room = getRoom(currentRoomCode);
    if (!room) return;
    setBuffering(room, socket.id, isBuffering);
    broadcastRoom(currentRoomCode);
  });

  // Oda haritasi ("Haritayi Goster") icin GERCEK GPS konumu - sadece
  // katilimci Ayarlar'daki "Konumu Gizle"yi KAPATIP paylasmayi SECTIYSE
  // client bunu hic gondermez (bkz. mobile RoomScreen.tsx showMap).
  // Hicbir yerde kalici saklanmaz, sadece oda hafizasinda tutulur.
  socket.on("room:location", ({ lat, lng }: { lat: number | null; lng: number | null }) => {
    if (!currentRoomCode) return;
    const room = getRoom(currentRoomCode);
    if (!room) return;
    if (lat === null && lng === null) {
      setParticipantLocation(room, socket.id, null);
    } else {
      if (!isFiniteNumber(lat, -90, 90) || !isFiniteNumber(lng, -180, 180)) return;
      setParticipantLocation(room, socket.id, { lat, lng });
    }
    broadcastRoom(currentRoomCode);
  });

  /** Video uzerinde ucusan emoji reaksiyonlari - sunucu hicbir state tutmaz,
   * sadece odadaki DIGER herkese anlik olarak iletir (kimin gonderdigi bilgisiyle). */
  socket.on("reaction:send", ({ emoji }: { emoji: string }) => {
    if (!currentRoomCode || !emoji || typeof emoji !== "string" || emoji.length > 8) return;
    if (!allow("reaction:send", 40, 10_000)) return;
    const room = getRoom(currentRoomCode);
    const participant = room?.participants.get(socket.id);
    socket.to(currentRoomCode).emit("room:reaction", {
      emoji,
      from: participant?.name || "?",
      ts: Date.now(),
    });
  });

  socket.on("chat:send", ({ text, replyTo }: { text: string; replyTo?: DMReply | null }) => {
    if (!currentRoomCode || !isNonEmptyString(text, 1000)) return;
    if (!allow("chat:send", 20, 10_000)) return;
    const validReplyTo =
      replyTo && isNonEmptyString(replyTo.text, 1000) && isNonEmptyString(replyTo.fromName, 200) ? replyTo : null;
    const room = getRoom(currentRoomCode);
    const participant = room?.participants.get(socket.id);
    const messageId = randomUUID();
    const trimmedText = text.trim().slice(0, 1000);
    io.to(currentRoomCode).emit("room:chat", {
      id: messageId,
      system: false,
      from: participant?.name || "?",
      fromSocketId: socket.id,
      fromAvatarUrl: participant?.avatarUrl ?? null,
      text: trimmedText,
      replyTo: validReplyTo,
      ts: Date.now(),
    });

    // "Chat Mesajlarini Otomatik Cevir" acikken - mesaj GECIKMEDEN (cevirisiz)
    // gonderildi, ceviriler arka planda hazirlanip ayri bir event'le
    // (room:chatTranslation) mesaja SONRADAN eklenir (bkz. message:react ile
    // ayni "id ile sonradan guncelle" deseni). Odadaki her FARKLI dil icin
    // TEK istek atilir, gonderenin kendi dili disinda.
    if (room?.autoTranslateChat) {
      const fromLang = connectionMeta.get(socket.id)?.language ?? "tr";
      const targetLangs = new Set(
        Array.from(room.participants.keys())
          .map((sid) => connectionMeta.get(sid)?.language)
          .filter((lang): lang is string => Boolean(lang))
      );
      translateToLanguages(trimmedText, fromLang, targetLangs)
        .then((translations) => {
          if (Object.keys(translations).length === 0) return;
          io.to(currentRoomCode!).emit("room:chatTranslation", { messageId, translations });
        })
        .catch(() => {});
    }
  });

  // Oda sohbetinde GERCEK fotograf gonderme - oda mesajlari hic kalici
  // olmadigi icin (bkz. rooms.ts) burada DB yok, sadece client'in "chat-media"
  // bucket'ina yukledigi public URL'i digerlerine anlik olarak iletiyoruz.
  socket.on("chat:sendImage", ({ mediaUrl, isAdult }: { mediaUrl: string; isAdult?: boolean }) => {
    if (!currentRoomCode || !isNonEmptyString(mediaUrl, 2000)) return;
    if (isAdult !== undefined && !isBoolean(isAdult)) return;
    if (!allow("chat:send", 20, 10_000)) return;
    const room = getRoom(currentRoomCode);
    const participant = room?.participants.get(socket.id);
    io.to(currentRoomCode).emit("room:chat", {
      id: randomUUID(),
      system: false,
      from: participant?.name || "?",
      fromSocketId: socket.id,
      fromAvatarUrl: participant?.avatarUrl ?? null,
      text: "📷 Fotoğraf",
      mediaUrl,
      isAdult: isAdult === true,
      ts: Date.now(),
    });
  });

  // Oda sohbetinde bir mesaja CIFT TIKLAYINCA gonderilen tepki - DM'deki
  // message:react ile ayni mantik, ama hicbir yerde kalici olarak
  // saklanmiyor (oda hafizadan silinince bu tepkiler de gider). Ayni emoji
  // ile ikinci cift-tik tepkiyi geri kaldirir (toggle).
  socket.on("message:react", ({ messageId, emoji }: { messageId: string; emoji: string }) => {
    if (!currentRoomCode || !isNonEmptyString(messageId, 100) || !isNonEmptyString(emoji, 8)) return;
    if (!allow("message:react", 40, 10_000)) return;
    const room = getRoom(currentRoomCode);
    if (!room) return;
    const fromName = room.participants.get(socket.id)?.name || "?";
    let forMessage = room.messageReactions.get(messageId);
    if (!forMessage) {
      forMessage = new Map();
      room.messageReactions.set(messageId, forMessage);
    }
    const existing = forMessage.get(socket.id);
    if (existing && existing.emoji === emoji) {
      forMessage.delete(socket.id);
    } else {
      forMessage.set(socket.id, { emoji, fromName });
    }
    const reactions = Array.from(forMessage.entries()).map(([fromSocketId, r]) => ({
      fromSocketId,
      emoji: r.emoji,
      fromName: r.fromName,
    }));
    io.to(currentRoomCode).emit("room:messageReaction", { messageId, reactions });
  });

  socket.on("host:kick", ({ targetSocketId }: { targetSocketId: string }, ack) => {
    if (!currentRoomCode || !isNonEmptyString(targetSocketId, 100)) return ack?.({ ok: false });
    const room = getRoom(currentRoomCode);
    if (!room) return ack?.({ ok: false });
    // Katilimci kickParticipant() ile odadan silinmeden ONCE isimlerini al -
    // silindikten sonra room.participants'ta artik bulunamaz.
    const targetName = room.participants.get(targetSocketId)?.name || "Misafir";
    const byName = room.participants.get(socket.id)?.name || myName;
    const ok = kickParticipant(room, socket.id, targetSocketId);
    if (ok) {
      io.sockets.sockets.get(targetSocketId)?.leave(currentRoomCode);
      io.to(targetSocketId).emit("room:kicked");
      broadcastRoom(currentRoomCode);
      // Rave'deki gibi: odadan atma sohbet akisinda ozel ikonlu bir sistem
      // mesaji olarak gorunur (bkz. RoomScreen.tsx "kicked" render dali).
      io.to(currentRoomCode).emit("room:chat", {
        system: true,
        kind: "kicked",
        targetName,
        byName,
        text: `${targetName}, ${byName} tarafindan atildi.`,
        ts: Date.now(),
      });
    }
    ack?.({ ok });
  });

  socket.on("host:transfer", ({ targetSocketId }: { targetSocketId: string }, ack) => {
    if (!currentRoomCode || !isNonEmptyString(targetSocketId, 100)) return ack?.({ ok: false });
    const room = getRoom(currentRoomCode);
    if (!room) return ack?.({ ok: false });
    const ok = transferHost(room, socket.id, targetSocketId);
    if (ok) broadcastRoom(currentRoomCode);
    ack?.({ ok });
  });

  // Kullanici raporlama (roadmap AŞAMA 11 - Moderasyon). Su an sadece kayit
  // altina aliyor; goruntuleme/aksiyon almak icin ayri bir admin arayuzu
  // gerekir (bu asamanin kapsami disinda).
  socket.on(
    "report:submit",
    async ({ targetUserId, targetMessageId, reason }: { targetUserId?: string; targetMessageId?: string; reason: string }, ack) => {
      if (!requireAuth(ack) || !isNonEmptyString(reason, 500)) return ack?.({ ok: false });
      if (!isOptionalString(targetUserId, 200) || !isOptionalString(targetMessageId, 200)) return ack?.({ ok: false });
      if (!allow("report:submit", 10, 60_000)) return ack?.({ ok: false, error: "Cok fazla rapor, biraz bekle." });
      const ok = await submitReport(myDb!, targetUserId || null, targetMessageId || null, reason);
      ack?.({ ok });
    }
  );

  // Ayarlar ekranindaki "Hesabi Sil" - GERCEK ve GERI ALINAMAZ bir silme.
  // delete_own_account() RPC'si (bkz. migration 0012) sadece caginin KENDI
  // auth.uid()'sini silebiliyor, ON DELETE CASCADE sayesinde profil/DM/
  // arkadaslik/galeri gibi butun bagimli veriler de otomatik siliniyor.
  socket.on("account:delete", async (_data, ack) => {
    if (!requireAuth(ack)) return;
    if (!allow("account:delete", 3, 60_000)) return ack?.({ ok: false, error: "Cok fazla deneme, biraz bekle." });
    const { error } = await myDb!.rpc("delete_own_account");
    ack?.({ ok: !error, error: error?.message });
  });

  // Push bildirim token kaydi (roadmap AŞAMA 9). Gercek teslimat icin
  // mobil tarafin expo-notifications ile gercek bir cihaz/token elde
  // etmesi gerekir - bu sadece sunucu tarafi altyapisi.
  socket.on(
    "push:registerToken",
    async ({ token, platform }: { token: string; platform: PushPlatform }, ack) => {
      if (!requireAuth(ack) || !isNonEmptyString(token, 300) || !isOneOf(platform, ["ios", "android", "web"])) {
        return ack?.({ ok: false });
      }
      await registerPushToken(myDb!, myUserId!, token, platform);
      ack?.({ ok: true });
    }
  );

  socket.on("push:unregisterToken", async ({ token }: { token: string }, ack) => {
    if (!requireAuth(ack) || !isNonEmptyString(token, 300)) return ack?.({ ok: false });
    await unregisterPushToken(myDb!, token);
    ack?.({ ok: true });
  });

  socket.on("voice:token", async (_data, ack) => {
    if (!currentRoomCode) return ack?.({ ok: false, error: "Once bir odaya katil." });
    const room = getRoom(currentRoomCode);
    const participant = room?.participants.get(socket.id);
    try {
      const token = await createVoiceToken(currentRoomCode, participant?.name || "Misafir", socket.id);
      ack?.({ ok: true, token, livekitUrl: process.env.LIVEKIT_URL || "" });
    } catch (err: any) {
      ack?.({ ok: false, error: err.message });
    }
  });
});

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
server.listen(PORT, () => {
  console.log(`rave-clone server dinliyor: http://localhost:${PORT}`);
  if (!isSupabaseConfigured()) {
    console.warn("UYARI: SUPABASE_URL / SUPABASE_ANON_KEY tanimli degil - arkadaslik/DM ozellikleri calismayacak.");
  }
});
