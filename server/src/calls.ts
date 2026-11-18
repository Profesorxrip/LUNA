import { customAlphabet } from "nanoid";

// Karistirilmasi kolay 0/O, 1/I gibi karakterler cikarildi (bkz. rooms.ts
// generateRoomCode ile ayni mantik, sadece burada disariya hic
// gosterilmedigi icin harf+rakam karisik, daha uzun bir kimlik yeterli).
const generateCallId = customAlphabet("abcdefghijkmnpqrstuvwxyz23456789", 16);

// Sunucu KENDI gercek bir WebRTC medya sunucusu (SFU/TURN) DEGIL - sadece
// istemcilerin birbirini bulup dogrudan (peer-to-peer) baglanabilmesi icin
// SDP teklif/cevap + ICE aday mesajlarini KARSI TARAFA ILETEN bir
// "sinyallesme" katmani (bkz. mobile/src/hooks/useCallEngine.ts - asil ses/
// goruntu GERCEK WebRTC ile dogrudan cihazlar arasinda akar, buradan GECMEZ).
//
// Coklu kisi (grup) aramasi "mesh" topolojisiyle calisir: N katilimcili bir
// aramada her katilimci DIGER N-1 katilimciyla AYRI AYRI bir RTCPeerConnection
// kurar (toplam N*(N-1)/2 baglanti). Sunucu burada SADECE kim kimin
// SDP/ICE mesajini almasi gerektigini (callId + toUserId) bilip ileten bir
// anahtar/santral gorevi gorur - hicbir medya onun uzerinden gecmez. Bu
// yaklasim kucuk gruplar (birkac kisi) icin iyi calisir; cok kalabalik
// gruplarda (10+ kisi) her cihazin N-1 baglanti+yayin yapmasi gerektigi icin
// bant genisligi/CPU acisindan pahali olmaya baslar (bkz. LiveKit/SFU gibi
// cozumler - su an bilinçli olarak kullanilmiyor, bkz. kullanicinin tercihi).
export interface ActiveCall {
  callId: string;
  isVideo: boolean;
  creatorId: string;
  // userId -> socketId - cagirilmis (henuz cevap vermemis/"ringing") VEYA
  // zaten kabul etmis HERKES. Birinin aramayi tamamen birakmasi/disconnect
  // olmasi burdan silinmesi demektir.
  members: Map<string, string>;
  // members icindeki hangi userId'ler GERCEKTEN kabul edip mesh baglantisina
  // girdi - yeni birine "call:peer-joined" SADECE bu kumedeki (zaten
  // baglanmis) kisilere gonderilir, cunku mesh baglantisi sadece onlarla
  // kurulacak.
  accepted: Set<string>;
}

// Mesh topolojisi N*(N-1)/2 baglanti gerektirdigi icin (bkz. yukaridaki
// aciklama) kalabalik gruplarda her cihazin bant genisligi/CPU yuku hizla
// artar - gercek bir SFU olmadan GUVENLI sayilan bir ust sinir (8 kisi =
// cihaz basina en fazla 7 es zamanli baglanti).
export const MAX_CALL_MEMBERS = 8;

const activeCalls = new Map<string, ActiveCall>();
// Bir kullanici ayni anda en fazla TEK bir aramada (cagrilmis ya da kabul
// etmis olarak) olabilir - "mesgul" kontrolu ve disconnect temizligi icin.
const callIdByUserId = new Map<string, string>();

export function isUserBusy(userId: string): boolean {
  return callIdByUserId.has(userId);
}

export function startCall(
  creatorId: string,
  creatorSocketId: string,
  calleeId: string,
  calleeSocketId: string,
  isVideo: boolean
): ActiveCall {
  const callId = generateCallId();
  const call: ActiveCall = {
    callId,
    isVideo,
    creatorId,
    members: new Map([
      [creatorId, creatorSocketId],
      [calleeId, calleeSocketId],
    ]),
    // Araayi baslatan zaten "aramada" sayilir - kendi kendine teklif/cevap
    // beklemesine gerek yok, sadece calleeId kabul edince mesh kurulur.
    accepted: new Set([creatorId]),
  };
  activeCalls.set(callId, call);
  callIdByUserId.set(creatorId, callId);
  callIdByUserId.set(calleeId, callId);
  return call;
}

export function getCall(callId: string): ActiveCall | undefined {
  return activeCalls.get(callId);
}

export function acceptCall(callId: string, userId: string): ActiveCall | undefined {
  const call = activeCalls.get(callId);
  if (!call || !call.members.has(userId)) return undefined;
  call.accepted.add(userId);
  return call;
}

// "Arama Ekle" - zaten aramada (accepted) olan biri yeni bir kisiyi davet
// eder. toUserId "ringing" olarak members'a eklenir, henuz accepted'a degil.
export function addMember(callId: string, toUserId: string, toSocketId: string): ActiveCall | undefined {
  const call = activeCalls.get(callId);
  if (!call) return undefined;
  call.members.set(toUserId, toSocketId);
  callIdByUserId.set(toUserId, callId);
  return call;
}

export interface RemoveResult {
  call: ActiveCall;
  // Bu kullanici cikarildiktan sonra GERIYE KALAN tek (varsa) kisinin
  // userId'si - o kisiye de "call:ended" gonderip yalniz kalan bir arama
  // ekraninda takili kalmasini onlemek icin (bkz. index.ts kullanim yeri).
  lastRemainingUserId: string | null;
  callDeleted: boolean;
}

export function removeMember(callId: string, userId: string): RemoveResult | undefined {
  const call = activeCalls.get(callId);
  if (!call) return undefined;
  call.members.delete(userId);
  call.accepted.delete(userId);
  callIdByUserId.delete(userId);
  const callDeleted = call.members.size === 0;
  if (callDeleted) activeCalls.delete(callId);
  const lastRemainingUserId = call.members.size === 1 ? Array.from(call.members.keys())[0] : null;
  return { call, lastRemainingUserId, callDeleted };
}

// Kullanicinin baglantisi kopunca (disconnect) - o an icinde oldugu aramayi
// (varsa) bulup kendisini cikarir.
export function endCallForUser(userId: string): RemoveResult | undefined {
  const callId = callIdByUserId.get(userId);
  if (!callId) return undefined;
  return removeMember(callId, userId);
}
