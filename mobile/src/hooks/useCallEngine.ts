import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import { getSocket } from "../services/socket";
import { GOOD_MS, MEDIUM_MS, type ConnectionQuality } from "./useConnectionQuality";
import {
  generateCallKeyPair,
  deriveSharedKey,
  computeSecurityCode,
  attachSenderEncryption,
  attachReceiverDecryption,
  e2eeFrameLayerSupported,
  type CallKeyPair,
} from "../utils/callEncryption";

export type CallPhase = "idle" | "ringing-out" | "ringing-in" | "connecting" | "connected" | "ended";

export interface ParticipantInfo {
  userId: string;
  name: string;
  avatarUrl: string | null;
}

export interface IncomingCallInfo {
  callId: string;
  fromUserId: string;
  fromName: string;
  fromAvatarUrl: string | null;
  isVideo: boolean;
  // Bu arama zaten devam eden bir grup aramasiysa (bkz. "Arama Ekle"),
  // ARAYAN DISINDA aramada zaten kabul etmis olan diger herkes - kabul
  // edince katilimci listesini (isim/avatar) hemen gosterebilmek icin.
  existingMembers: ParticipantInfo[];
}

// Google'in HERKESE ACIK, ucretsiz STUN sunuculari - sadece cihazlarin
// birbirinin GERCEK (NAT arkasindaki) adresini bulmasina yardim eder, ses/
// goruntu bu sunuculardan GECMEZ (bkz. dosya basindaki aciklama).
const ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }];

function getWebRTCGlobals(): { RTCPeerConnection: any; mediaDevices: any } | null {
  if (Platform.OS === "web") {
    const g = globalThis as any;
    if (!g?.RTCPeerConnection || !g?.navigator?.mediaDevices) return null;
    return { RTCPeerConnection: g.RTCPeerConnection, mediaDevices: g.navigator.mediaDevices };
  }
  // Native (telefon): LiveKit'in SFU'sunu KULLANMIYORUZ, sadece
  // @livekit/react-native-webrtc paketinin ALTINDAKI ham WebRTC modulunu
  // (zaten projede var olan "Odalar" sesli sohbet ozelligiyle AYNI paket) -
  // bkz. useVoiceChat.ts'teki ayni "dinamik require" deseni: Expo Go'da
  // native modul bulunmadigindan burasi hata firlatir, biz de yakalayip
  // anlamli bir mesaj gosteririz.
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const rnWebrtc = require("@livekit/react-native-webrtc");
    rnWebrtc.registerGlobals?.();
    return { RTCPeerConnection: rnWebrtc.RTCPeerConnection, mediaDevices: rnWebrtc.mediaDevices };
  } catch {
    return null;
  }
}

/** GERCEK (mockup DEGIL) coklu-kisi WebRTC arama motoru.
 *
 * Sunucu (bkz. server/src/calls.ts) sadece "kim kimle aramada" durumunu VE
 * WebRTC'nin kendi SDP teklif/cevap + ICE aday mesajlarini DOGRU KISIYE
 * ILETIR (relay) - ses/goruntu akisinin kendisi HICBIR ZAMAN sunucudan
 * GECMEZ. N kisilik bir aramada her katilimci DIGER N-1 katilimciyla AYRI
 * bir RTCPeerConnection kurar ("mesh" topolojisi - bkz. calls.ts basindaki
 * aciklama, neden boyle ve ne zaman yetersiz kalabilecegi).
 *
 * Rol kurali (glare'i onlemek icin): aramada ZATEN olan taraf, YENI katilan
 * birine HER ZAMAN teklif (offer) gonderir; yeni katilan taraf HER ZAMAN
 * sadece cevap (answer) uretir. Boylece kim kime teklif gonderecegi hicbir
 * zaman belirsiz olmaz.
 */
export function useCallEngine() {
  const [incomingCall, setIncomingCall] = useState<IncomingCallInfo | null>(null);
  const [phase, setPhase] = useState<CallPhase>("idle");
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  // Benim DISIMDAKI katilimcilar (isim/avatar) - render icin.
  const [participants, setParticipants] = useState<ParticipantInfo[]>([]);
  // userId -> o kisiden gelen GERCEK uzak akis.
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [error, setError] = useState<string | null>(null);

  const [cameraEnabled, setCameraEnabledState] = useState(true);
  const [micEnabled, setMicEnabledState] = useState(true);
  const [cameraFacing, setCameraFacing] = useState<"user" | "environment">("user");
  const [isSharingScreen, setIsSharingScreen] = useState(false);
  // Aramadaki DIGER kisilerden kimler su an GERCEKTEN ekran paylasiyor -
  // sunucudan gelen "call:state" sinyaline (bkz. asagidaki dinleyici)
  // dayanir, kesinlikle simule/disaridan verilen bir deger DEGIL.
  const [screenSharingPeers, setScreenSharingPeers] = useState<Set<string>>(new Set());
  // Web'de GERCEK ses cikisi (hoparlor/kulaklik/Bluetooth DAHIL) cihaz
  // listesi - navigator.mediaDevices.enumerateDevices() tarayicinin bildigi
  // TUM cikis cihazlarini (Bluetooth eslenmisse ONU DA) dondurur.
  const [audioOutputs, setAudioOutputs] = useState<MediaDeviceInfo[]>([]);
  const [audioOutputId, setAudioOutputIdState] = useState<string | null>(null);
  const [speakerOn, setSpeakerOnState] = useState(false);
  // GERCEK baglanti kalitesi - ping/sunucu RTT'si DEGIL, dogrudan aktif
  // RTCPeerConnection'lardan RTCPeerConnection.getStats() ile okunan
  // aday-cifti RTT'si ve ses paket kaybi (bkz. asagidaki
  // measureConnectionQuality/polling efekti).
  const [connectionQuality, setConnectionQuality] = useState<ConnectionQuality>("good");
  // GERCEK uygulama-katmani uctan uca sifreleme (bkz. utils/callEncryption.ts
  // basindaki aciklama) - e2eeSupported bu CIHAZDA/tarayicida Insertable
  // Streams olup olmadigini (SADECE web/Chromium) bir kere kontrol eder;
  // securityCodes, her peer icin DOGRULANABILIR guvenlik kodunu tutar.
  const [e2eeSupported] = useState(() => e2eeFrameLayerSupported());
  const [securityCodes, setSecurityCodes] = useState<Record<string, string>>({});

  const callIdRef = useRef<string | null>(null);
  const isVideoRef = useRef(false);
  const localStreamRef = useRef<MediaStream | null>(null);
  // Ekran paylasimi baslamadan ONCEKI kamera video track'i - paylasim
  // bitince GERCEKTEN kameraya geri donebilmek icin saklanir (bkz.
  // stopScreenShare). Ekran paylasim track'i de ayri tutulur.
  const cameraTrackRef = useRef<MediaStreamTrack | null>(null);
  const screenTrackRef = useRef<MediaStreamTrack | null>(null);
  const peersRef = useRef<Map<string, any>>(new Map());
  const remoteDescSetRef = useRef<Set<string>>(new Set());
  const pendingIceRef = useRef<Map<string, any[]>>(new Map());
  // RemoteCallVideo/RemoteAudioPlayer gibi bilesenlerin kendilerini
  // kaydettigi GERCEK <video>/<audio> DOM elementleri - ses cikisi
  // degistirilince (bkz. setAudioOutputId) HEPSINE setSinkId uygulanir.
  const mediaElementsRef = useRef<Set<any>>(new Set());
  // Bu arama icin TEK SEFERLIK (gecici) ECDH anahtar cifti - bkz.
  // utils/callEncryption.ts. peerKeysRef, her peer ile ECDH sonucu turetilen
  // PAYLASILAN simetrik anahtari tutar (agdan hic GECMEZ).
  const myKeyPairRef = useRef<CallKeyPair | null>(null);
  const peerKeysRef = useRef<Map<string, CryptoKey>>(new Map());

  const resetAll = useCallback(() => {
    peersRef.current.forEach((pc) => {
      try {
        pc.close?.();
      } catch {
        // baglanti zaten kapanmis olabilir
      }
    });
    peersRef.current.clear();
    remoteDescSetRef.current.clear();
    pendingIceRef.current.clear();
    callIdRef.current = null;
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    screenTrackRef.current?.stop();
    screenTrackRef.current = null;
    cameraTrackRef.current = null;
    setLocalStream(null);
    setRemoteStreams({});
    setParticipants([]);
    setIncomingCall(null);
    setPhase("idle");
    setIsSharingScreen(false);
    setScreenSharingPeers(new Set());
    setCameraEnabledState(true);
    setMicEnabledState(true);
    setConnectionQuality("good");
    myKeyPairRef.current = null;
    peerKeysRef.current.clear();
    setSecurityCodes({});
  }, []);

  // GERCEK baglanti kalitesi olcumu: ping tabanli sahte bir RTT DEGIL,
  // dogrudan aktif her RTCPeerConnection'in getStats() raporundan "nominated"
  // aday ciftinin GERCEK round-trip suresini ve ses inbound-rtp paket
  // kaybini okur - mesh'teki EN KOTU (en yuksek RTT/kayip) peer, gosterilen
  // genel kaliteyi belirler. useConnectionQuality.ts'teki eski ping tabanli
  // olcumle AYNI esikleri (GOOD_MS/MEDIUM_MS) kullanir, boylece iki farkli
  // "iyi/orta/kotu" tanimi olusmaz.
  const measureConnectionQuality = useCallback(async () => {
    const peers = peersRef.current;
    if (peers.size === 0) return;
    let worstRttMs = 0;
    let worstLossRatio = 0;
    for (const pc of peers.values()) {
      try {
        const stats = await pc.getStats();
        stats.forEach((report: any) => {
          if (report.type === "candidate-pair" && report.state === "succeeded" && report.nominated !== false) {
            if (typeof report.currentRoundTripTime === "number") {
              const rttMs = report.currentRoundTripTime * 1000;
              if (rttMs > worstRttMs) worstRttMs = rttMs;
            }
          }
          if (report.type === "inbound-rtp" && (report.kind === "audio" || report.mediaType === "audio")) {
            const lost = report.packetsLost ?? 0;
            const received = report.packetsReceived ?? 0;
            const total = lost + received;
            if (total > 0) {
              const ratio = lost / total;
              if (ratio > worstLossRatio) worstLossRatio = ratio;
            }
          }
        });
      } catch {
        // Bu peer icin istatistik alinamadi (ornegin tam o anda kapandi) -
        // digerleriyle devam, genel olcumu durdurmaya gerek yok.
      }
    }
    const quality: ConnectionQuality =
      worstLossRatio > 0.08 || worstRttMs > MEDIUM_MS
        ? "poor"
        : worstLossRatio > 0.02 || worstRttMs > GOOD_MS
          ? "medium"
          : "good";
    setConnectionQuality(quality);
  }, []);

  useEffect(() => {
    if (phase !== "connected") return;
    measureConnectionQuality();
    const id = setInterval(measureConnectionQuality, 4000);
    return () => clearInterval(id);
  }, [phase, measureConnectionQuality]);

  async function ensureLocalMedia(isVideo: boolean): Promise<MediaStream> {
    if (localStreamRef.current) return localStreamRef.current;
    const webrtc = getWebRTCGlobals();
    if (!webrtc) throw new Error("Bu cihazda gercek zamanli arama (WebRTC) su an desteklenmiyor.");
    const stream: MediaStream = await webrtc.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: isVideo ? { facingMode: cameraFacing } : false,
    });
    localStreamRef.current = stream;
    cameraTrackRef.current = stream.getVideoTracks()[0] || null;
    setLocalStream(stream);
    return stream;
  }

  function getVideoSender(pc: any): any {
    return pc.getSenders?.().find((s: any) => s.track && s.track.kind === "video");
  }

  async function flushPendingIce(userId: string, pc: any) {
    const queued = pendingIceRef.current.get(userId) || [];
    pendingIceRef.current.delete(userId);
    for (const candidate of queued) {
      try {
        await pc.addIceCandidate(candidate);
      } catch {
        // gecersiz/eski bir aday - gormezden gel
      }
    }
  }

  // Bu aramada DAHA ONCE olusturulmadiysa, TEK SEFERLIK ECDH anahtar ciftini
  // olusturur (bkz. utils/callEncryption.ts - forward secrecy icin her arama
  // KENDI anahtarini kullanir). e2eeSupported false ise (native/eski
  // tarayici) null doner - bu durumda ek kare sifrelemesi hic denenmez,
  // SADECE WebRTC'nin zaten var olan tasima sifrelemesi (DTLS-SRTP) gecerli
  // olur.
  async function ensureMyKeyPair(): Promise<CallKeyPair | null> {
    if (!e2eeSupported) return null;
    if (myKeyPairRef.current) return myKeyPairRef.current;
    const kp = await generateCallKeyPair();
    myKeyPairRef.current = kp;
    return kp;
  }

  // Karsi tarafin ACIK anahtarini alinca (offer VEYA answer icinde) PAYLASILAN
  // simetrik anahtari turetir VE iki tarafin da karsilastirabilecegi
  // GUVENLIK KODUNU hesaplar (bkz. CallMoreOptionsSheet.tsx'teki "Dogrula").
  async function deriveAndStoreKey(peerId: string, remotePubKeyBase64: string, myKeyPair: CallKeyPair) {
    if (peerKeysRef.current.has(peerId)) return;
    try {
      const key = await deriveSharedKey(myKeyPair.keyPair.privateKey, remotePubKeyBase64);
      peerKeysRef.current.set(peerId, key);
      const code = await computeSecurityCode(myKeyPair.publicKeyBase64, remotePubKeyBase64);
      setSecurityCodes((prev) => ({ ...prev, [peerId]: code }));
    } catch {
      // Anahtar turetme basarisiz olursa bu peer icin ek kare sifrelemesi
      // devre disi kalir (getKey() hep null doner) - arama yine de GERCEK
      // WebRTC tasima sifrelemesiyle (DTLS-SRTP) devam eder.
    }
  }

  function createPeerForUser(userId: string, stream: MediaStream) {
    const webrtc = getWebRTCGlobals();
    if (!webrtc) throw new Error("Bu cihazda gercek zamanli arama (WebRTC) su an desteklenmiyor.");
    // encodedInsertableStreams: SADECE web'de (Chromium) anlamli olan eski
    // Insertable Streams bayragi - native'de bu alani hic GONDERMEYIZ (bkz.
    // utils/callEncryption.ts - react-native-webrtc'nin boyle bir API'si yok).
    const pc = new webrtc.RTCPeerConnection(
      e2eeSupported ? { iceServers: ICE_SERVERS, encodedInsertableStreams: true } : { iceServers: ICE_SERVERS }
    );
    stream.getTracks().forEach((track) => {
      const sender = pc.addTrack(track, stream);
      attachSenderEncryption(sender, () => peerKeysRef.current.get(userId) ?? null);
    });
    pc.onicecandidate = (ev: any) => {
      if (ev.candidate) {
        const candidate = ev.candidate.toJSON ? ev.candidate.toJSON() : ev.candidate;
        getSocket().emit("call:webrtc-ice", { callId: callIdRef.current, toUserId: userId, candidate });
      }
    };
    pc.ontrack = (ev: any) => {
      const remote = ev.streams?.[0];
      if (remote) setRemoteStreams((prev) => ({ ...prev, [userId]: remote }));
      if (ev.receiver) attachReceiverDecryption(ev.receiver, () => peerKeysRef.current.get(userId) ?? null);
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") setPhase("connected");
    };
    peersRef.current.set(userId, pc);
    return pc;
  }

  function removePeer(userId: string) {
    const pc = peersRef.current.get(userId);
    try {
      pc?.close?.();
    } catch {
      // baglanti zaten kapanmis olabilir
    }
    peersRef.current.delete(userId);
    remoteDescSetRef.current.delete(userId);
    pendingIceRef.current.delete(userId);
    peerKeysRef.current.delete(userId);
    setSecurityCodes((prev) => {
      if (!(userId in prev)) return prev;
      const next = { ...prev };
      delete next[userId];
      return next;
    });
    setRemoteStreams((prev) => {
      if (!(userId in prev)) return prev;
      const next = { ...prev };
      delete next[userId];
      return next;
    });
    setParticipants((prev) => prev.filter((p) => p.userId !== userId));
  }

  const startCall = useCallback(async (toUserId: string, isVideo: boolean): Promise<boolean> => {
    setError(null);
    isVideoRef.current = isVideo;
    const socket = getSocket();
    const res: any = await new Promise((resolve) => socket.emit("call:invite", { toUserId, isVideo }, resolve));
    if (!res?.ok) {
      setError(res?.error || "Arama baslatilamadi.");
      return false;
    }
    callIdRef.current = res.callId;
    setPhase("ringing-out");
    try {
      await ensureLocalMedia(isVideo);
    } catch (err: any) {
      setError(err?.message || "Kameraya/mikrofona erisilemedi.");
    }
    return true;
  }, []);

  const acceptCall = useCallback(async () => {
    const call = incomingCall;
    if (!call) return;
    setIncomingCall(null);
    callIdRef.current = call.callId;
    isVideoRef.current = call.isVideo;
    setPhase("connecting");
    const socket = getSocket();
    const res: any = await new Promise((resolve) => socket.emit("call:accept", { callId: call.callId }, resolve));
    if (!res?.ok) {
      setError("Arama artik gecerli degil.");
      resetAll();
      return;
    }
    const existing: ParticipantInfo[] = res.existingMembers || call.existingMembers || [];
    setParticipants(existing);
    try {
      await ensureLocalMedia(res.isVideo ?? call.isVideo);
      // Simdi aramada zaten olan herkesin teklifini (offer) bekliyoruz - bkz.
      // asagidaki "call:webrtc-offer" dinleyicisi. Teklifi HER ZAMAN aramada
      // ONCE olan taraf gonderir (bkz. dosya basindaki rol aciklamasi).
    } catch (err: any) {
      setError(err?.message || "Kameraya/mikrofona erisilemedi.");
      socket.emit("call:end", { callId: call.callId });
      resetAll();
    }
  }, [incomingCall, resetAll]);

  const declineCall = useCallback(() => {
    if (!incomingCall) return;
    getSocket().emit("call:decline", { callId: incomingCall.callId });
    setIncomingCall(null);
  }, [incomingCall]);

  const addToCall = useCallback(async (toUserId: string): Promise<boolean> => {
    const callId = callIdRef.current;
    if (!callId) return false;
    const res: any = await new Promise((resolve) => getSocket().emit("call:group-add", { callId, toUserId }, resolve));
    if (!res?.ok) setError(res?.error || "Kisi eklenemedi.");
    return !!res?.ok;
  }, []);

  // Sesli aramayi GERCEKTEN goruntulu aramaya yukseltir - yeni bir kamera
  // track'i alinip TUM aktif peer baglantilarina EKLENIR (addTrack, daha
  // once video YOKTU) ve HER biri icin manuel bir yeniden-teklif (offer)
  // gonderilir ("renegotiation" - karsi tarafin AYNI onOffer dinleyicisi
  // zaten var olan baglantiyi GUNCELLER, yeni bir baglanti ACMAZ).
  const upgradeToVideo = useCallback(async (): Promise<boolean> => {
    if (isVideoRef.current) return true;
    const webrtc = getWebRTCGlobals();
    if (!webrtc || !localStreamRef.current) return false;
    try {
      const newStream: MediaStream = await webrtc.mediaDevices.getUserMedia({ video: { facingMode: cameraFacing } });
      const videoTrack = newStream.getVideoTracks()[0];
      if (!videoTrack) return false;
      localStreamRef.current.addTrack(videoTrack);
      cameraTrackRef.current = videoTrack;
      isVideoRef.current = true;
      setCameraEnabledState(true);
      const socket = getSocket();
      for (const [userId, pc] of peersRef.current) {
        const sender = pc.addTrack(videoTrack, localStreamRef.current);
        // Bu peer ile anahtar degisimi zaten ses baglantisi kurulurken
        // (onPeerJoined/onOffer) tamamlanmisti - burada sadece YENI video
        // sender'ina AYNI (zaten var olan) anahtari uygulayan sifrelemeyi
        // bagliyoruz, yeniden anahtar degisimine gerek yok.
        attachSenderEncryption(sender, () => peerKeysRef.current.get(userId) ?? null);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit("call:webrtc-offer", { callId: callIdRef.current, toUserId: userId, sdp: offer });
      }
      setLocalStream(localStreamRef.current);
      return true;
    } catch {
      return false;
    }
  }, [cameraFacing]);

  // Mikrofonu GERCEKTEN ac/kapat - track.enabled=false olunca karsi taraf
  // GERCEKTEN hicbir ses almaz (sadece ikon degismiyor).
  const setMicEnabled = useCallback((enabled: boolean) => {
    setMicEnabledState(enabled);
    localStreamRef.current?.getAudioTracks().forEach((t) => {
      t.enabled = enabled;
    });
  }, []);

  // Kamerayi GERCEKTEN ac/kapat - track.enabled=false olunca karsi taraf
  // GERCEKTEN siyah/durgun bir goruntu alir (kendi "Avatar" yedegimiz zaten
  // bunu dogru yansitir, bkz. VideoCallScreen.tsx renderSelfCameraFeed).
  const setCameraEnabled = useCallback((enabled: boolean) => {
    setCameraEnabledState(enabled);
    if (cameraTrackRef.current) cameraTrackRef.current.enabled = enabled;
  }, []);

  // Gurultu azaltmayi GERCEK mikrofon track'ine uygular (applyConstraints) -
  // ayri/sahte bir ikinci getUserMedia cagrisi YOK, dogrudan karsi tarafa
  // giden SES bundan etkilenir.
  const setNoiseSuppression = useCallback(async (enabled: boolean) => {
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (!track?.applyConstraints) return;
    try {
      await track.applyConstraints({ noiseSuppression: enabled, echoCancellation: true, autoGainControl: true });
    } catch {
      // Cihaz/tarayici bu constraint'i desteklemiyor olabilir - sessizce yoksay.
    }
  }, []);

  // On/arka kamera GERCEKTEN degisir: yeni bir getUserMedia ile TAZE bir
  // video track alinip, aktif TUM peer baglantilarinda (ve kendi
  // localStream'imizde) replaceTrack ile degistirilir - yeniden
  // teklif/cevap (renegotiation) GEREKMEZ, ayni "kind" oldugu surece
  // replaceTrack bunu sessizce halleder.
  const flipCamera = useCallback(async () => {
    const webrtc = getWebRTCGlobals();
    if (!webrtc || !localStreamRef.current || isSharingScreen) return;
    const nextFacing = cameraFacing === "user" ? "environment" : "user";
    try {
      const newStream: MediaStream = await webrtc.mediaDevices.getUserMedia({
        video: { facingMode: nextFacing },
        audio: false,
      });
      const newTrack = newStream.getVideoTracks()[0];
      if (!newTrack) return;
      newTrack.enabled = cameraEnabled;
      const oldTrack = cameraTrackRef.current;
      if (oldTrack) {
        localStreamRef.current.removeTrack(oldTrack);
        oldTrack.stop();
      }
      localStreamRef.current.addTrack(newTrack);
      cameraTrackRef.current = newTrack;
      setCameraFacing(nextFacing);
      peersRef.current.forEach((pc) => {
        const sender = getVideoSender(pc);
        sender?.replaceTrack?.(newTrack);
      });
      // localStream state'i AYNI obje referansi degistigi icin degil, yeni
      // bir render tetiklemek icin yeniden set ediliyor (tuketen taraflar
      // genelde track'leri degil stream'i prop olarak tutuyor).
      setLocalStream(localStreamRef.current);
    } catch {
      // Izin reddedildi/ikinci bir kamera yok - sessizce yoksay.
    }
  }, [cameraFacing, cameraEnabled, isSharingScreen]);

  // GERCEK ekran paylasimi: getDisplayMedia ile alinan video track, TUM
  // aktif peer baglantilarinda kameranin YERINE gecer (replaceTrack) - karsi
  // taraf GERCEKTEN ekranimi gorur. "call:state" ile herkese "ben ekran
  // paylasiyorum" sinyali de gonderilir (bkz. asagidaki call:state
  // dinleyicisi - karsi tarafta screenSharingPeers'i doldurur).
  const startScreenShare = useCallback(async (target: "screen" | "window" = "screen"): Promise<boolean> => {
    const webrtc = getWebRTCGlobals();
    const mediaDevices = (globalThis as any)?.navigator?.mediaDevices;
    if (Platform.OS !== "web" || !mediaDevices?.getDisplayMedia || !webrtc) {
      setError("Ekran paylasimi bu cihazda desteklenmiyor.");
      return false;
    }
    try {
      const screenStream: MediaStream = await mediaDevices.getDisplayMedia({
        video: { displaySurface: target === "screen" ? "monitor" : "window" },
        audio: false,
      });
      const screenTrack = screenStream.getVideoTracks()[0];
      if (!screenTrack) return false;
      screenTrack.addEventListener("ended", () => {
        // Kullanici tarayicinin KENDI "paylasimi durdur" dugmesine basti -
        // bizim stopScreenShare'imizi cagirip kameraya GERCEKTEN geri don.
        stopScreenShareRef.current?.();
      });
      const oldTrack = localStreamRef.current?.getVideoTracks()[0] || cameraTrackRef.current;
      if (localStreamRef.current && oldTrack) {
        localStreamRef.current.removeTrack(oldTrack);
      }
      localStreamRef.current?.addTrack(screenTrack);
      screenTrackRef.current = screenTrack;
      peersRef.current.forEach((pc) => {
        const sender = getVideoSender(pc);
        sender?.replaceTrack?.(screenTrack);
      });
      setIsSharingScreen(true);
      setLocalStream(localStreamRef.current);
      if (callIdRef.current) getSocket().emit("call:state", { callId: callIdRef.current, sharingScreen: true });
      return true;
    } catch {
      // Kullanici tarayicinin kendi secim penceresinden vazgecti/izin reddetti.
      return false;
    }
  }, []);

  const stopScreenShare = useCallback(() => {
    if (!screenTrackRef.current) return;
    localStreamRef.current?.removeTrack(screenTrackRef.current);
    screenTrackRef.current.stop();
    screenTrackRef.current = null;
    if (cameraTrackRef.current && localStreamRef.current) {
      localStreamRef.current.addTrack(cameraTrackRef.current);
      peersRef.current.forEach((pc) => {
        const sender = getVideoSender(pc);
        sender?.replaceTrack?.(cameraTrackRef.current);
      });
    }
    setIsSharingScreen(false);
    setLocalStream(localStreamRef.current);
    if (callIdRef.current) getSocket().emit("call:state", { callId: callIdRef.current, sharingScreen: false });
  }, []);
  const stopScreenShareRef = useRef(stopScreenShare);
  stopScreenShareRef.current = stopScreenShare;

  // Web: GERCEK ses cikisi cihaz listesi (Bluetooth DAHIL, varsa). Native'de
  // bu liste yok (bkz. setSpeakerRoute - orada basit hoparlor/kulaklik
  // anahtari kullanilir, native'de spesifik Bluetooth cihaz secimi icin
  // isletim sistemi zaten otomatik oncelik veriyor).
  const refreshAudioOutputs = useCallback(async (): Promise<MediaDeviceInfo[]> => {
    const md = (globalThis as any)?.navigator?.mediaDevices;
    if (Platform.OS !== "web" || !md?.enumerateDevices) return [];
    try {
      const devices: MediaDeviceInfo[] = await md.enumerateDevices();
      const outputs = devices.filter((d) => d.kind === "audiooutput");
      setAudioOutputs(outputs);
      return outputs;
    } catch {
      return [];
    }
  }, []);

  const registerMediaElement = useCallback(
    (el: any) => {
      if (!el) return;
      mediaElementsRef.current.add(el);
      if (audioOutputId && el.setSinkId) el.setSinkId(audioOutputId).catch(() => {});
    },
    [audioOutputId]
  );
  const unregisterMediaElement = useCallback((el: any) => {
    mediaElementsRef.current.delete(el);
  }, []);

  const setAudioOutputId = useCallback((id: string) => {
    setAudioOutputIdState(id);
    mediaElementsRef.current.forEach((el) => {
      el.setSinkId?.(id).catch(() => {});
    });
  }, []);

  // Native (telefon): hoparlor <-> kulaklik arasinda GERCEKTEN gecis -
  // expo-audio'nun setAudioModeAsync'i (zaten projede var olan resmi Expo
  // paketi, ekstra native kod GEREKMEZ). allowsRecording:true sart (bkz.
  // expo-audio Audio.types.d.ts shouldRouteThroughEarpiece aciklamasi) -
  // Bluetooth baglıysa isletim sistemi zaten onu ONCELIKLI olarak kullanir,
  // bu anahtar sadece hoparlor/kulaklik (dahili) arasinda secim yapar.
  const setSpeakerRoute = useCallback(async (onSpeaker: boolean) => {
    setSpeakerOnState(onSpeaker);
    if (Platform.OS === "web") return;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { setAudioModeAsync } = require("expo-audio");
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
        interruptionMode: "doNotMix",
        shouldRouteThroughEarpiece: !onSpeaker,
      });
    } catch {
      // expo-audio native modulu yuklenemedi (orn. Expo Go) - sessizce yoksay.
    }
  }, []);

  const endCall = useCallback(() => {
    const callId = callIdRef.current;
    if (callId) {
      getSocket().emit(phase === "ringing-out" ? "call:cancel" : "call:end", { callId });
    }
    resetAll();
  }, [phase, resetAll]);

  useEffect(() => {
    const socket = getSocket();

    function onIncoming(data: IncomingCallInfo) {
      setIncomingCall(data);
      setPhase("ringing-in");
    }

    // Aramada ZATEN olan taraf olarak: yeni biri katildi - onlara BIZ teklif
    // (offer) gondeririz (bkz. dosya basindaki rol aciklamasi). Bu, orijinal
    // 1'e 1 aramada "karsi taraf kabul etti" anini da KAPSAR (arayan icin
    // callee de boylece "yeni katilan biri" sayilir, ayri bir "accepted"
    // event'ine gerek yok).
    async function onPeerJoined({ userId, name, avatarUrl }: { callId: string; userId: string; name: string; avatarUrl: string | null }) {
      if (!callIdRef.current) return;
      setParticipants((prev) => (prev.some((p) => p.userId === userId) ? prev : [...prev, { userId, name, avatarUrl }]));
      try {
        const stream = await ensureLocalMedia(isVideoRef.current);
        setPhase((p) => (p === "ringing-out" ? "connecting" : p));
        const myKeyPair = await ensureMyKeyPair();
        const pc = createPeerForUser(userId, stream);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit("call:webrtc-offer", {
          callId: callIdRef.current,
          toUserId: userId,
          sdp: offer,
          pubKey: myKeyPair?.publicKeyBase64,
        });
      } catch (err: any) {
        setError(err?.message || "Kameraya/mikrofona erisilemedi.");
      }
    }

    function onPeerLeft({ userId }: { callId: string; userId: string }) {
      removePeer(userId);
      setScreenSharingPeers((prev) => {
        if (!prev.has(userId)) return prev;
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
    }

    // Karsi taraf ekran paylasimini ac/kapatti - bkz. dosya basindaki
    // startScreenShare/stopScreenShare (server/src/index.ts call:state).
    function onCallState({ userId, sharingScreen }: { callId: string; userId: string; sharingScreen: boolean }) {
      setScreenSharingPeers((prev) => {
        const next = new Set(prev);
        if (sharingScreen) next.add(userId);
        else next.delete(userId);
        return next;
      });
    }

    function onDeclined({ userId }: { callId: string; userId?: string }) {
      // Grup aramasinda "decline" SADECE o kisinin katilmadigi anlamina
      // gelir - geri kalan arama devam eder (bkz. userId varsa onu cikar).
      if (userId && peersRef.current.size > 0) {
        removePeer(userId);
        return;
      }
      resetAll();
    }
    function onCancelled() {
      resetAll();
    }
    function onEnded() {
      resetAll();
    }

    async function onOffer({
      callId,
      fromUserId,
      sdp,
      pubKey,
    }: {
      callId: string;
      fromUserId: string;
      sdp: any;
      pubKey?: string;
    }) {
      if (callIdRef.current !== callId) return;
      try {
        const stream = await ensureLocalMedia(isVideoRef.current);
        const myKeyPair = await ensureMyKeyPair();
        if (pubKey && myKeyPair) await deriveAndStoreKey(fromUserId, pubKey, myKeyPair);
        let pc = peersRef.current.get(fromUserId);
        if (!pc) pc = createPeerForUser(fromUserId, stream);
        await pc.setRemoteDescription(sdp);
        remoteDescSetRef.current.add(fromUserId);
        await flushPendingIce(fromUserId, pc);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit("call:webrtc-answer", {
          callId,
          toUserId: fromUserId,
          sdp: answer,
          pubKey: myKeyPair?.publicKeyBase64,
        });
        setPhase((p) => (p === "connecting" || p === "ringing-in" ? "connecting" : p));
      } catch (err: any) {
        setError(err?.message || "Kameraya/mikrofona erisilemedi.");
      }
    }

    async function onAnswer({
      callId,
      fromUserId,
      sdp,
      pubKey,
    }: {
      callId: string;
      fromUserId: string;
      sdp: any;
      pubKey?: string;
    }) {
      if (callIdRef.current !== callId) return;
      const pc = peersRef.current.get(fromUserId);
      if (!pc) return;
      if (pubKey && myKeyPairRef.current) await deriveAndStoreKey(fromUserId, pubKey, myKeyPairRef.current);
      await pc.setRemoteDescription(sdp);
      remoteDescSetRef.current.add(fromUserId);
      await flushPendingIce(fromUserId, pc);
    }

    async function onIce({ callId, fromUserId, candidate }: { callId: string; fromUserId: string; candidate: any }) {
      if (callIdRef.current !== callId) return;
      const pc = peersRef.current.get(fromUserId);
      if (!pc || !remoteDescSetRef.current.has(fromUserId)) {
        const queue = pendingIceRef.current.get(fromUserId) || [];
        queue.push(candidate);
        pendingIceRef.current.set(fromUserId, queue);
        return;
      }
      try {
        await pc.addIceCandidate(candidate);
      } catch {
        // gecersiz/eski bir aday - gormezden gel
      }
    }

    socket.on("call:incoming", onIncoming);
    socket.on("call:peer-joined", onPeerJoined);
    socket.on("call:peer-left", onPeerLeft);
    socket.on("call:declined", onDeclined);
    socket.on("call:cancelled", onCancelled);
    socket.on("call:ended", onEnded);
    socket.on("call:webrtc-offer", onOffer);
    socket.on("call:webrtc-answer", onAnswer);
    socket.on("call:webrtc-ice", onIce);
    socket.on("call:state", onCallState);
    return () => {
      socket.off("call:incoming", onIncoming);
      socket.off("call:peer-joined", onPeerJoined);
      socket.off("call:peer-left", onPeerLeft);
      socket.off("call:declined", onDeclined);
      socket.off("call:cancelled", onCancelled);
      socket.off("call:ended", onEnded);
      socket.off("call:webrtc-offer", onOffer);
      socket.off("call:webrtc-answer", onAnswer);
      socket.off("call:webrtc-ice", onIce);
      socket.off("call:state", onCallState);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetAll]);

  return {
    incomingCall,
    phase,
    localStream,
    participants,
    remoteStreams,
    error,
    startCall,
    acceptCall,
    declineCall,
    addToCall,
    endCall,
    upgradeToVideo,
    connectionQuality,
    // GERCEK uctan uca sifreleme (bkz. utils/callEncryption.ts):
    e2eeSupported,
    securityCodes,
    // Gercek yerel kontroller:
    micEnabled,
    setMicEnabled,
    cameraEnabled,
    setCameraEnabled,
    cameraFacing,
    flipCamera,
    setNoiseSuppression,
    isSharingScreen,
    startScreenShare,
    stopScreenShare,
    screenSharingPeers,
    // Ses cikisi:
    audioOutputs,
    audioOutputId,
    refreshAudioOutputs,
    setAudioOutputId,
    speakerOn,
    setSpeakerRoute,
    registerMediaElement,
    unregisterMediaElement,
  };
}

// VideoCallScreen/VoiceCallScreen'in "realCall" prop'u icin ortak tip -
// RootNavigator.tsx engine'in TAMAMINI buraya verir, boylece her yeni
// kontrol eklendiginde prop arayuzunu tekrar tekrar genisletmek gerekmez.
export type CallEngineApi = ReturnType<typeof useCallEngine>;
