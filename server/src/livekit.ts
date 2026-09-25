import { AccessToken } from "livekit-server-sdk";

const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || "";
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || "";

/** Bir kullanicinin belirli bir odaya (sesli sohbet icin) katilmasi icin
 * gecici, imzali bir LiveKit erisim token'i uretir. API secret'imiz asla
 * mobil uygulamaya gitmiyor - sadece bu sunucu tarafinda kaliyor, telefona
 * sadece uretilen (ve sinirli sureli/yetkili) token gidiyor. */
export async function createVoiceToken(roomCode: string, participantName: string, socketId: string) {
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
    room: `rave-${roomCode}`,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
  });
  return at.toJwt();
}
