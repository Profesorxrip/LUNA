import { Platform } from "react-native";
import * as Crypto from "expo-crypto";

/** GERCEK uygulama-katmani uctan uca sifreleme (E2EE) icin yardimcilar.
 *
 * Mimari: WebRTC zaten her baglantida ZORUNLU olarak DTLS-SRTP ile tasima
 * katmani sifrelemesi yapar VE bu projede LiveKit/SFU YOK (bkz.
 * useCallEngine.ts basindaki aciklama) - yani ses/goruntu zaten sunucudan
 * HICBIR ZAMAN GECMEZ. Buraya eklenen katman, bunun USTUNE, Signal/
 * WhatsApp'in yaptigi gibi her bir KODLANMIS KAREYI (encoded frame) SRTP'den
 * ONCE (gonderirken) / SONRA (alirken) AYRICA AES-GCM ile sifreler - boylece
 * sinyal sunucusu teorik olarak ele gecirilse/kotuye kullanilsa bile, karelerin
 * kendisini cozecek anahtara ASLA sahip olamaz (anahtar hic sunucuya
 * gonderilmez, sadece ECDH ACIK anahtarlari - ki bunlardan ozel anahtar
 * turetilemez - sinyal uzerinden tasinir).
 *
 * MITM UYARISI + GUVENLIK KODU: Kotu niyetli bir sinyal sunucusu TEORIK
 * olarak SDP icindeki DTLS parmak izini (fingerprint) degistirip kendini
 * araya sokmaya calisabilir (Signal/WhatsApp'in da DOGRULANMAMIS
 * durumundaki ayni risk). Bunu kullanicinin KENDI gozlemleyebilecegi hale
 * getirmek icin, HER IKI tarafin kendi yerel+uzak SDP'sinden okudugu DTLS
 * parmak izlerinden (bkz. extractDtlsFingerprint) BIREBIR AYNI 12 haneli bir
 * "guvenlik kodu" hesaplanir (bkz. computeSecurityCodeFromFingerprints) -
 * kullanici bu kodu sesli/baska bir kanaldan dogrularsa, sunucunun SDP'ye
 * dokunmadigindan (dolayisiyla GERCEK WebRTC sifrelemesinin - DTLS-SRTP -
 * dogru kisiyle kuruldugundan) emin olabilir. Bu kod DTLS parmak izine
 * dayandigi icin PLATFORM FARKI GOZETMEZ (web VEYA native, ikisinde de
 * hesaplanabilir) - ayrica ECDH anahtar ciftine (asagidaki
 * generateCallKeyPair/deriveSharedKey) BAGLI DEGILDIR, o sadece ek kare
 * sifrelemesinin (asagida) kendi anahtarini turetmek icindir (bkz.
 * CallMoreOptionsSheet.tsx'teki "Dogrula" ekrani).
 *
 * Platform kapsami: Insertable Streams (RTCRtpSender/Receiver.
 * createEncodedStreams) SADECE web'de (Chromium) var - react-native-webrtc
 * bunu desteklemiyor (bkz. node_modules/@livekit/react-native-webrtc
 * RTCRtpSender.d.ts - boyle bir metod yok). Native'de bu yuzden ek kare
 * sifrelemesi SESSIZCE devre disi kalir, GERCEK WebRTC tasima sifrelemesi
 * (DTLS-SRTP) aynen devam eder - kullaniciya bu durum dogru/durust bir
 * sekilde bildirilir (bkz. e2eeFrameLayerSupported + UI'daki fallback metni).
 */

const IV_BYTES = 12;

export function e2eeFrameLayerSupported(): boolean {
  if (Platform.OS !== "web") return false;
  const g = globalThis as any;
  if (!g?.crypto?.subtle) return false;
  try {
    const pc = new g.RTCPeerConnection();
    const sender = pc.addTransceiver("audio").sender;
    const ok = typeof sender.createEncodedStreams === "function";
    pc.close();
    return ok;
  } catch {
    return false;
  }
}

function bufToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function base64ToBuf(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

export interface CallKeyPair {
  keyPair: CryptoKeyPair;
  publicKeyBase64: string;
}

/** Her arama icin TEK SEFERLIK (gecici/ephemeral) bir ECDH anahtar cifti -
 * "forward secrecy" saglar: bir aramanin anahtari ele gecse bile GECMIS veya
 * GELECEK baska bir aramayi cozmeye yaramaz. */
export async function generateCallKeyPair(): Promise<CallKeyPair> {
  const keyPair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
    "deriveKey",
    "deriveBits",
  ]);
  const raw = await crypto.subtle.exportKey("raw", keyPair.publicKey);
  return { keyPair, publicKeyBase64: bufToBase64(raw) };
}

/** Karsi tarafin ACIK anahtarini + kendi OZEL anahtarimizi kullanarak o
 * kisiyle PAYLASILAN simetrik AES-GCM anahtarini turetir - bu anahtar HICBIR
 * ZAMAN agdan GECMEZ, sadece iki istemcinin kendi tarafinda hesaplanir. */
export async function deriveSharedKey(
  myPrivateKey: CryptoKey,
  remotePublicKeyBase64: string
): Promise<CryptoKey> {
  const remotePublicKey = await crypto.subtle.importKey(
    "raw",
    base64ToBuf(remotePublicKeyBase64),
    { name: "ECDH", namedCurve: "P-256" },
    false,
    []
  );
  return crypto.subtle.deriveKey(
    { name: "ECDH", public: remotePublicKey },
    myPrivateKey,
    { name: "AES-GCM", length: 128 },
    false,
    ["encrypt", "decrypt"]
  );
}

/** Bir SDP metninden DTLS sertifika parmak izini okur (orn.
 * "a=fingerprint:sha-256 AB:CD:...") - WebRTC spesifikasyonu geregi HER SDP'de
 * (offer VEYA answer, web VEYA native) bulunur, bu yuzden platform farki
 * gozetmeden GUVENLIK KODU hesaplamak icin ideal bir girdidir. */
export function extractDtlsFingerprint(sdp: string): string | null {
  const match = sdp.match(/a=fingerprint:\S+\s+([0-9A-Fa-f:]+)/);
  return match ? match[1].toUpperCase() : null;
}

/** Iki tarafin da ayni sirada gorecegi, insan tarafindan sesli/yazili
 * dogrulanabilir 12 haneli "guvenlik kodu" - WhatsApp'in arama dogrulama
 * koduyla AYNI fikir, ama anahtar yerine GERCEK DTLS parmak izlerinden
 * turetilir (bkz. dosya basindaki aciklama). Iki parmak izi SIRALANARAK
 * (lexicographic) birlestirilip hash'lendigi icin kimin "ben" kimin "karsi
 * taraf" oldugu fark etmez, HER IKI taraf da BIREBIR AYNI kodu hesaplar (MITM
 * yoksa). expo-crypto kullanildigi icin web VE native'de AYNI SEKILDE calisir. */
export async function computeSecurityCodeFromFingerprints(fpA: string, fpB: string): Promise<string> {
  const [first, second] = [fpA, fpB].sort();
  const hex = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${first}|${second}`, {
    encoding: Crypto.CryptoEncoding.HEX,
  });
  // Ilk 12 hex karakterden (48 bit) 12 haneli bir sayisal kod uret - 3 grup x
  // 4 hane (BigInt kullaniliyor, Number 48 bitlik degerler icin guvenli
  // olmakla birlikte acik/tutarli olmasi icin).
  const num = BigInt(`0x${hex.slice(0, 12)}`);
  const digits = (num % 10n ** 12n).toString().padStart(12, "0");
  return `${digits.slice(0, 4)} ${digits.slice(4, 8)} ${digits.slice(8, 12)}`;
}

async function encryptFrame(key: CryptoKey, data: ArrayBuffer): Promise<ArrayBuffer> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data);
  const out = new Uint8Array(IV_BYTES + ciphertext.byteLength);
  out.set(iv, 0);
  out.set(new Uint8Array(ciphertext), IV_BYTES);
  return out.buffer;
}

async function decryptFrame(key: CryptoKey, data: ArrayBuffer): Promise<ArrayBuffer> {
  const bytes = new Uint8Array(data);
  const iv = bytes.slice(0, IV_BYTES);
  const ciphertext = bytes.slice(IV_BYTES);
  return crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
}

/** Giden (gonderilen) bir RTCRtpSender'in KODLANMIS karelerini, SRTP'ye
 * girmeden hemen once AES-GCM ile sifreler. `getKey` bir fonksiyon olarak
 * verilir cunku anahtar degisimi (offer/answer) track eklenmeden/baslamadan
 * BITMEMIS olabilir - her karede GUNCEL anahtar sorulur, henuz yoksa kare
 * sifrelenmeden (acik) gonderilir (karsi taraf da ayni gecis anini ayni
 * sekilde atlatir, bkz. attachReceiverDecryption). */
export function attachSenderEncryption(sender: any, getKey: () => CryptoKey | null): void {
  if (typeof sender.createEncodedStreams !== "function") return;
  try {
    const { readable, writable } = sender.createEncodedStreams();
    const transform = new TransformStream({
      async transform(frame: any, controller: any) {
        const key = getKey();
        if (key) {
          try {
            frame.data = await encryptFrame(key, frame.data);
          } catch {
            // Sifreleme basarisiz olursa bu kareyi DUSUR (hic gonderme) -
            // sifresiz kare asla aga cikmaz.
            return;
          }
        }
        controller.enqueue(frame);
      },
    });
    readable.pipeThrough(transform).pipeTo(writable).catch(() => {});
  } catch {
    // Bu tarayici/surum createEncodedStreams'i tam desteklemiyor olabilir -
    // sessizce atla, GERCEK WebRTC tasima sifrelemesi (DTLS-SRTP) zaten var.
  }
}

/** Gelen bir RTCRtpReceiver'in SRTP'den YENI COZULMUS kodlanmis karelerini,
 * decode edilmeden once AES-GCM ile cozer. */
export function attachReceiverDecryption(receiver: any, getKey: () => CryptoKey | null): void {
  if (typeof receiver.createEncodedStreams !== "function") return;
  try {
    const { readable, writable } = receiver.createEncodedStreams();
    const transform = new TransformStream({
      async transform(frame: any, controller: any) {
        const key = getKey();
        if (key) {
          try {
            frame.data = await decryptFrame(key, frame.data);
          } catch {
            // Cozulemeyen (orn. anahtar degisimi tam bitmeden gelen ilk
            // birkac kare) bir kareyi OYNATMAYA calismak yerine DUSUR - kisa
            // bir kesinti olur, sonraki kareler normal akar.
            return;
          }
        }
        controller.enqueue(frame);
      },
    });
    readable.pipeThrough(transform).pipeTo(writable).catch(() => {});
  } catch {
    // bkz. attachSenderEncryption'daki ayni aciklama.
  }
}
