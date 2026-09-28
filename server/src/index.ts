import "dotenv/config";
import express from "express";
import cors from "cors";
import http from "http";
import { Server, Socket } from "socket.io";
import {
  createRoom,
  getRoom,
  joinRoom,
  leaveRoom,
  kickParticipant,
  transferHost,
  updatePlayback,
  roomToPublicState,
  listPublicRooms,
  setBuffering,
  isHost,
  MediaSource,
} from "./rooms";
import { createVoiceToken } from "./livekit";
import {
  openConversation,
  previewConversation,
  sendMessage,
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
} from "./social";
import { verifyAccessToken, clientForUser, isSupabaseConfigured } from "./supabase";
import { submitReport } from "./moderation";
import { logRoomEvent } from "./analytics";
import { registerPushToken, unregisterPushToken, notifyIfOffline, PushPlatform } from "./notifications";
import { isNonEmptyString, isOptionalString, isBoolean, isFiniteNumber, isOneOf } from "./validate";

const SOURCE_TYPES = ["youtube", "hls", "mp4", "external"] as const;

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

function broadcastRoom(code: string) {
  const room = getRoom(code);
  if (room) io.to(code).emit("room:state", roomToPublicState(room));
}

/** Kesif/ana ekrandaki acik oda listesini TUM baglı istemcilere yayinlar -
 * bir oda acildiginda/kapandiginda/katilimci sayisi ya da video degistiginde
 * cagrilir, boylece Discover ekrani canli guncellenir. */
function broadcastRoomsList() {
  io.emit("rooms:list", listPublicRooms());
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
  const allow = makeRateLimiter();

  socket.on("rooms:list", (_data, ack) => {
    ack?.(listPublicRooms());
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
    setOnline(myUserId, socket.id);
    await setUserName(myDb, myUserId, myName);
    ack?.({ ok: true, userId: myUserId, name: myName });
  });

  function requireAuth(ack?: (res: any) => void): boolean {
    if (!myUserId || !myDb) {
      ack?.({ ok: false, error: "Once giris yapmalisin." });
      return false;
    }
    return true;
  }

  socket.on("friend:status", async ({ withUserId }: { withUserId: string }, ack) => {
    if (!requireAuth(ack) || !isNonEmptyString(withUserId, 200)) return ack?.({ ok: false });
    ack?.({ ok: true, status: await getFriendStatus(myDb!, withUserId) });
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
    (
      { name, isPublic, source }: { name: string; isPublic?: boolean; source: MediaSource },
      ack
    ) => {
      if (!isValidMediaSource(source)) return ack?.({ ok: false, error: "Gecersiz medya kaynagi." });
      if (!isOptionalString(name, 60)) return ack?.({ ok: false, error: "Gecersiz isim." });
      if (isPublic !== undefined && !isBoolean(isPublic)) return ack?.({ ok: false, error: "Gecersiz istek." });
      if (!allow("room:create", 10, 60_000)) return ack?.({ ok: false, error: "Cok fazla oda acildi, biraz bekle." });
      // Oda, icerik secilmeden var olamaz - odanin/kartin ismi de secilen
      // icerigin ismi (source.label) oluyor, ayri bir oda basligi girilmiyor.
      const room = createRoom(socket.id, name || myName || "Host", { isPublic, source });
      currentRoomCode = room.code;
      socket.join(room.code);
      ack?.({ ok: true, room: roomToPublicState(room) });
      broadcastRoomsList();
      if (myDb && myUserId) logRoomEvent(myDb, myUserId, room.code, "create", source.label).catch(() => {});
    }
  );

  socket.on("room:join", ({ code, name }: { code: string; name: string }, ack) => {
    if (!isNonEmptyString(code, 12)) return ack?.({ ok: false, error: "Oda bulunamadi. Kodu kontrol et." });
    if (!isOptionalString(name, 60)) return ack?.({ ok: false, error: "Gecersiz isim." });
    if (!allow("room:join", 20, 60_000)) return ack?.({ ok: false, error: "Cok fazla deneme, biraz bekle." });
    const room = joinRoom(code, socket.id, name || myName || "Misafir");
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
      text: `${name || "Misafir"} odaya katildi.`,
      ts: Date.now(),
    });
    if (myDb && myUserId) logRoomEvent(myDb, myUserId, room.code, "join", room.playback.source?.label).catch(() => {});
  });

  socket.on("room:leave", () => {
    handleLeave();
  });

  socket.on("disconnect", () => {
    handleLeave();
    removeOnlineBySocket(socket.id);
  });

  function handleLeave() {
    if (!currentRoomCode) return;
    const { room, newHostId, roomDeleted } = leaveRoom(currentRoomCode, socket.id);
    const code = currentRoomCode;
    currentRoomCode = null;
    if (myDb && myUserId) logRoomEvent(myDb, myUserId, code, "leave").catch(() => {});
    if (roomDeleted || !room) return;
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
    (update: { source?: MediaSource | null; isPlaying?: boolean; positionSeconds?: number }) => {
      if (!currentRoomCode) return;
      if (update.source && !isValidMediaSource(update.source)) return;
      if (update.isPlaying !== undefined && !isBoolean(update.isPlaying)) return;
      if (update.positionSeconds !== undefined && !isFiniteNumber(update.positionSeconds, 0, 10_000_000)) return;
      const room = getRoom(currentRoomCode);
      if (!room) return;
      const applied = updatePlayback(room, socket.id, update);
      if (applied) {
        broadcastRoom(currentRoomCode);
        if (update.source !== undefined) broadcastRoomsList();
        // Rave'deki gibi: yeni bir medya secildiginde sohbet akisina
        // "Simdi X oynatiliyor" seklinde bir sistem mesaji dusuyor.
        if (update.source) {
          io.to(currentRoomCode).emit("room:chat", {
            system: true,
            text: `Simdi ${update.source.label || update.source.type} oynatiliyor`,
            ts: Date.now(),
          });
        }
      }
    }
  );

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

  socket.on("chat:send", ({ text }: { text: string }) => {
    if (!currentRoomCode || !isNonEmptyString(text, 1000)) return;
    if (!allow("chat:send", 20, 10_000)) return;
    const room = getRoom(currentRoomCode);
    const participant = room?.participants.get(socket.id);
    io.to(currentRoomCode).emit("room:chat", {
      system: false,
      from: participant?.name || "?",
      text: text.trim().slice(0, 1000),
      ts: Date.now(),
    });
  });

  socket.on("host:kick", ({ targetSocketId }: { targetSocketId: string }, ack) => {
    if (!currentRoomCode || !isNonEmptyString(targetSocketId, 100)) return ack?.({ ok: false });
    const room = getRoom(currentRoomCode);
    if (!room) return ack?.({ ok: false });
    const ok = kickParticipant(room, socket.id, targetSocketId);
    if (ok) {
      io.sockets.sockets.get(targetSocketId)?.leave(currentRoomCode);
      io.to(targetSocketId).emit("room:kicked");
      broadcastRoom(currentRoomCode);
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
