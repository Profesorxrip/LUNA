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
  conversationKey,
  getOrCreateConversation,
  addMessage,
  markSeen,
  setOnline,
  removeOnlineBySocket,
  getSocketIdForUser,
  newMessageId,
  pruneExpired,
  setExpiryMs,
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

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true }));

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

io.on("connection", (socket: Socket) => {
  let currentRoomCode: string | null = null;
  let myUserId: string | null = null;
  let myName = "Misafir";

  socket.on("rooms:list", (_data, ack) => {
    ack?.(listPublicRooms());
  });

  // Ozelden mesajlasma (DM) icin: kullanici baglanir baglanmaz kendi kararli
  // kimligini (userId) bildirir, boylece hangi socket'in kim oldugunu
  // biliriz ve mesajlari dogru kisiye yonlendirebiliriz.
  socket.on("user:identify", ({ userId, name }: { userId: string; name?: string }) => {
    if (!userId) return;
    myUserId = userId;
    if (name) myName = name;
    setOnline(userId, socket.id);
    setUserName(userId, myName);
  });

  socket.on("friend:status", ({ withUserId }: { withUserId: string }, ack) => {
    if (!myUserId || !withUserId) return ack?.({ ok: false });
    ack?.({ ok: true, status: getFriendStatus(myUserId, withUserId) });
  });

  socket.on("friends:list", (_data, ack) => {
    if (!myUserId) return ack?.({ ok: false });
    ack?.({
      ok: true,
      friends: listFriends(myUserId),
      incoming: listIncoming(myUserId),
      outgoing: listOutgoing(myUserId),
      blocked: listBlocked(myUserId),
    });
  });

  socket.on("friend:request", ({ toUserId }: { toUserId: string }, ack) => {
    if (!myUserId || !toUserId) return ack?.({ ok: false });
    const ok = sendRequest(myUserId, toUserId);
    ack?.({ ok });
    if (ok) {
      const peerSocketId = getSocketIdForUser(toUserId);
      if (peerSocketId) io.to(peerSocketId).emit("friend:incoming", { fromUserId: myUserId, fromName: myName });
    }
  });

  socket.on("friend:cancel", ({ toUserId }: { toUserId: string }, ack) => {
    if (!myUserId || !toUserId) return ack?.({ ok: false });
    cancelRequest(myUserId, toUserId);
    ack?.({ ok: true });
    const peerSocketId = getSocketIdForUser(toUserId);
    if (peerSocketId) io.to(peerSocketId).emit("friend:cancelled", { byUserId: myUserId });
  });

  socket.on(
    "friend:respond",
    ({ fromUserId, accept }: { fromUserId: string; accept: boolean }, ack) => {
      if (!myUserId || !fromUserId) return ack?.({ ok: false });
      respondRequest(fromUserId, myUserId, accept);
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

  socket.on("friend:remove", ({ userId }: { userId: string }, ack) => {
    if (!myUserId || !userId) return ack?.({ ok: false });
    removeFriend(myUserId, userId);
    ack?.({ ok: true });
    const peerSocketId = getSocketIdForUser(userId);
    if (peerSocketId) io.to(peerSocketId).emit("friend:removed", { byUserId: myUserId });
  });

  socket.on("friend:block", ({ userId }: { userId: string }, ack) => {
    if (!myUserId || !userId) return ack?.({ ok: false });
    blockUser(myUserId, userId);
    ack?.({ ok: true });
  });

  socket.on("friend:unblock", ({ userId }: { userId: string }, ack) => {
    if (!myUserId || !userId) return ack?.({ ok: false });
    unblockUser(myUserId, userId);
    ack?.({ ok: true });
  });

  // Arkadaslar listesinde son mesaj onizlemesi gostermek icin - dm:open'in
  // aksine "gorundu" isaretlemez, sadece son mesaji dondurur.
  socket.on("dm:preview", ({ withUserId }: { withUserId: string }, ack) => {
    if (!myUserId || !withUserId) return ack?.({ ok: false });
    const key = conversationKey(myUserId, withUserId);
    const convo = getOrCreateConversation(key);
    pruneExpired(convo);
    const lastMessage = convo.messages[convo.messages.length - 1] || null;
    ack?.({ ok: true, lastMessage });
  });

  socket.on("dm:open", ({ withUserId }: { withUserId: string }, ack) => {
    if (!myUserId || !withUserId) return ack?.({ ok: false, error: "Once tanimlanmalisin." });
    const key = conversationKey(myUserId, withUserId);
    const convo = getOrCreateConversation(key);
    pruneExpired(convo);
    markSeen(convo, myUserId);
    ack?.({ ok: true, messages: convo.messages, expiresAfterMs: convo.expiresAfterMs });
    const peerSocketId = getSocketIdForUser(withUserId);
    if (peerSocketId) io.to(peerSocketId).emit("dm:seen", { byUserId: myUserId, at: Date.now() });
  });

  socket.on(
    "dm:send",
    ({ toUserId, text, replyTo }: { toUserId: string; text: string; replyTo?: DMReply | null }, ack) => {
      if (!myUserId || !toUserId || !text?.trim()) return ack?.({ ok: false });
      const key = conversationKey(myUserId, toUserId);
      const convo = getOrCreateConversation(key);
      pruneExpired(convo);
      const createdAt = Date.now();
      const message = {
        id: newMessageId(),
        fromUserId: myUserId,
        fromName: myName,
        text: text.trim().slice(0, 1000),
        replyTo: replyTo || null,
        createdAt,
        expiresAt: convo.expiresAfterMs ? createdAt + convo.expiresAfterMs : null,
      };
      addMessage(convo, message);
      ack?.({ ok: true, message });
      const peerSocketId = getSocketIdForUser(toUserId);
      if (peerSocketId) io.to(peerSocketId).emit("dm:message", { fromUserId: myUserId, message });
    }
  );

  socket.on("dm:setExpiry", ({ withUserId, ms }: { withUserId: string; ms: number | null }, ack) => {
    if (!myUserId || !withUserId) return ack?.({ ok: false });
    const key = conversationKey(myUserId, withUserId);
    const convo = getOrCreateConversation(key);
    setExpiryMs(convo, ms);
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
      // Oda, icerik secilmeden var olamaz - odanin/kartin ismi de secilen
      // icerigin ismi (source.label) oluyor, ayri bir oda basligi girilmiyor.
      const room = createRoom(socket.id, name || "Host", { isPublic, source });
      currentRoomCode = room.code;
      socket.join(room.code);
      ack?.({ ok: true, room: roomToPublicState(room) });
      broadcastRoomsList();
    }
  );

  socket.on("room:join", ({ code, name }: { code: string; name: string }, ack) => {
    const room = joinRoom(code, socket.id, name || "Misafir");
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
    if (!currentRoomCode || !emoji) return;
    const room = getRoom(currentRoomCode);
    const participant = room?.participants.get(socket.id);
    socket.to(currentRoomCode).emit("room:reaction", {
      emoji,
      from: participant?.name || "?",
      ts: Date.now(),
    });
  });

  socket.on("chat:send", ({ text }: { text: string }) => {
    if (!currentRoomCode || !text?.trim()) return;
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
    if (!currentRoomCode) return ack?.({ ok: false });
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
    if (!currentRoomCode) return ack?.({ ok: false });
    const room = getRoom(currentRoomCode);
    if (!room) return ack?.({ ok: false });
    const ok = transferHost(room, socket.id, targetSocketId);
    if (ok) broadcastRoom(currentRoomCode);
    ack?.({ ok });
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
});
