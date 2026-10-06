import { AccessToken, RoomServiceClient } from "livekit-server-sdk";

const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || "";
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || "";
const LIVEKIT_URL = process.env.LIVEKIT_URL || "";

function livekitRoomName(roomCode: string): string {
  return `rave-${roomCode}`;
}

/** Bir kullanicinin belirli bir odaya (sesli sohbet icin) katilmasi icin
 * gecici, imzali bir LiveKit erisim token'i uretir. API secret'imiz asla
 * mobil uygulamaya gitmiyor - sadece bu sunucu tarafinda kaliyor, telefona
 * sadece uretilen (ve sinirli sureli/yetkili) token gidiyor.
 *
 * canPublish: "Herkes mikrofon acabilsin" oda ayari (bkz. rooms.ts
 * micOpenToAll) kapaliysa VE bu kullanici host degilse false gecilir -
 * LiveKit bu durumda mikrofon yayinini SUNUCU TARAFINDA reddeder, sadece
 * istemci tarafinda gizlemekten farkli olarak gercekten engeller. */
export async function createVoiceToken(roomCode: string, participantName: string, socketId: string, canPublish: boolean) {
  if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
    throw new Error(
      "LIVEKIT_API_KEY / LIVEKIT_API_SECRET tanimli degil - .env dosyasina LiveKit hesabindan aldigin bilgileri ekle."
    );
  }
  const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity: socketId,
    name: participantName,
    ttl: "6h",
  });
  at.addGrant({
    room: livekitRoomName(roomCode),
    roomJoin: true,
    canPublish,
    canSubscribe: true,
  });
  return at.toJwt();
}

/** Host "Herkes mikrofon acabilsin" ayarini degistirdiginde, ZATEN sesli
 * sohbete baglanmis olanlarin CANLI iznini de gunceller - aksi halde
 * token'daki eski izin baglanti kesilene kadar (6 saat) gecerli kalirdi.
 * LiveKit yapilandirilmamissa (gelistirme ortami) sessizce atlanir - bu oda
 * ayari LiveKit olmadan da calismaya devam eder (sadece token asamasinda
 * etkili olur). Her katilimci icin ayri ayri "best effort" denenir - biri
 * sesli sohbete hic baglanmamissa LiveKit'in donecegi hata yoksayilir. */
export async function syncVoicePermissions(roomCode: string, socketIds: string[], canPublish: boolean): Promise<void> {
  if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET || !LIVEKIT_URL) return;
  const client = new RoomServiceClient(LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
  const roomName = livekitRoomName(roomCode);
  await Promise.allSettled(
    socketIds.map((identity) => client.updateParticipant(roomName, identity, { permission: { canPublish } }))
  );
}
