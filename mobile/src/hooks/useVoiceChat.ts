import { useCallback, useRef, useState } from "react";
import { getSocket } from "../services/socket";

/** LiveKit'e baglanip mikrofon yayinini acan/kapatan basit bir hook.
 *
 * ONEMLI: LiveKit/react-native-webrtc GERCEK NATIVE (derlenmis) kod
 * icerdigi icin Expo Go'da CALISMAZ - sadece bir "development build"
 * (npx expo prebuild + expo run:android, ya da EAS Build) icinde calisir.
 * Bu yuzden ilgili moduller burada EN USTTE degil, join() cagrildigi ANDA
 * dinamik olarak (require ile) yukleniyor - boylece Expo Go'da uygulamanin
 * geri kalani (video senkronu, sohbet) SORUNSUZ acilir, sadece "sesli
 * sohbete katil" butonuna basildiginda anlamli bir hata mesaji gorulur. */
export function useVoiceChat() {
  const roomRef = useRef<any>(null);
  const [connected, setConnected] = useState(false);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nativeModuleMissing, setNativeModuleMissing] = useState(false);
  // Diger katilimcilarin (identity = socketId, bkz. server/src/livekit.ts
  // createVoiceToken) o ANKI mikrofon durumu - "izni var ama acmamis" (gri)
  // ile "izni var VE acik" (beyaz) ayrimi icin (bkz. ParticipantsModal.tsx).
  // Sunucu bunu BILMEZ (LiveKit baglantisi tamamen istemciler arasi), bu
  // yuzden SADECE sesli sohbete fiilen baglanmis birinin cihazinda dolu olur.
  const [remoteMicOn, setRemoteMicOn] = useState<Record<string, boolean>>({});
  // O an KONUSAN katilimcilarin (ses seviyesine gore LiveKit'in kendi
  // "active speaker" tespiti) identity listesi - mikrofon ikonunun
  // etrafindaki dalgalanma animasyonu icin (bkz. ParticipantsModal.tsx
  // SpeakingPulse). Yerel katilimci da (kendimiz) bu listeye LiveKit
  // tarafindan otomatik dahil edilir.
  const [speakingIds, setSpeakingIds] = useState<string[]>([]);
  // "Sessize Al" (bkz. ProfileOptionsSheet.tsx) - belirli bir katilimcinin
  // sesini SADECE BENIM icin kisan kimlikler (LiveKit identity = socketId,
  // bkz. server/src/livekit.ts). Katilimci henuz ses yayinina baslamamissa
  // setVolume hemen uygulanacak bir audioTrackPublication bulamaz - bu
  // yuzden kimligi burada da saklayip TrackSubscribed'da tekrar uyguluyoruz.
  const mutedIdentitiesRef = useRef<Set<string>>(new Set());

  const join = useCallback(async (startMuted = false) => {
    setError(null);
    let livekitReactNative: typeof import("@livekit/react-native");
    let livekitClient: typeof import("livekit-client");
    try {
      livekitReactNative = require("@livekit/react-native");
      livekitClient = require("livekit-client");
      livekitReactNative.registerGlobals();
    } catch (err: any) {
      setNativeModuleMissing(true);
      setError(
        "Sesli sohbet bu ortamda calismiyor - LiveKit'in WebRTC modulu Expo Go'da " +
          "desteklenmiyor. README'deki 'development build' adimini (expo prebuild + " +
          "expo run:android, ya da EAS Build) tamamlaman gerekiyor."
      );
      return;
    }

    const socket = getSocket();
    const res: any = await new Promise((resolve) => socket.emit("voice:token", {}, resolve));
    if (!res.ok) {
      setError(res.error || "Sesli sohbet token'i alinamadi.");
      return;
    }

    try {
      mutedIdentitiesRef.current = new Set();
      await livekitReactNative.AudioSession.startAudioSession();
      const room = new livekitClient.Room();
      room.on(livekitClient.RoomEvent.Disconnected, () => {
        setConnected(false);
        setRemoteMicOn({});
        setSpeakingIds([]);
      });
      room.on(livekitClient.RoomEvent.TrackSubscribed, (track: any, _pub: any, participant: any) => {
        if (track?.kind === livekitClient.Track.Kind.Audio && mutedIdentitiesRef.current.has(participant.identity)) {
          track.setVolume?.(0);
        }
      });
      // Mikrofon ikonunun gri/beyaz ayrimi (bkz. yukaridaki remoteMicOn
      // yorumu) - bir katilimci mikrofonunu acip/kapattikca LiveKit bu
      // ikisini tetikler (yerel katilimcinin kendi degisimi zaten setMuted
      // ile ayri takip ediliyor, burasi SADECE uzak katilimcilar icin).
      room.on(livekitClient.RoomEvent.TrackMuted, (pub: any, participant: any) => {
        if (pub?.kind === livekitClient.Track.Kind.Audio && participant?.identity) {
          setRemoteMicOn((prev) => ({ ...prev, [participant.identity]: false }));
        }
      });
      room.on(livekitClient.RoomEvent.TrackUnmuted, (pub: any, participant: any) => {
        if (pub?.kind === livekitClient.Track.Kind.Audio && participant?.identity) {
          setRemoteMicOn((prev) => ({ ...prev, [participant.identity]: true }));
        }
      });
      room.on(livekitClient.RoomEvent.ParticipantConnected, (participant: any) => {
        setRemoteMicOn((prev) => ({ ...prev, [participant.identity]: !!participant.isMicrophoneEnabled }));
      });
      room.on(livekitClient.RoomEvent.ParticipantDisconnected, (participant: any) => {
        setRemoteMicOn((prev) => {
          const next = { ...prev };
          delete next[participant.identity];
          return next;
        });
        setSpeakingIds((prev) => prev.filter((id) => id !== participant.identity));
      });
      room.on(livekitClient.RoomEvent.ActiveSpeakersChanged, (speakers: any[]) => {
        setSpeakingIds(speakers.map((p: any) => p.identity));
      });
      await room.connect(res.livekitUrl, res.token);
      // Biz baglanmadan ONCE odada zaten bulunan katilimcilarin o anki
      // mikrofon durumunu da baslangicta dolduruyoruz (yoksa ilk
      // TrackMuted/Unmuted tetiklenene kadar hepsi "bilinmiyor" gorunurdu).
      const initialMicOn: Record<string, boolean> = {};
      room.remoteParticipants.forEach((p: any) => {
        initialMicOn[p.identity] = !!p.isMicrophoneEnabled;
      });
      setRemoteMicOn(initialMicOn);
      // "Herkes mikrofon acabilsin" kapaliysa (bkz. RoomScreen.tsx
      // handleMicPress) host disindakiler SESSIZ (sadece dinleyici) olarak
      // baglanir - sunucu zaten LiveKit token'inda canPublish'i kapatiyor
      // (bkz. server/src/livekit.ts), bu sadece baglanti anindaki ilk
      // durumu dogru yansitmak icin.
      await room.localParticipant.setMicrophoneEnabled(!startMuted);
      roomRef.current = room;
      setConnected(true);
      setMuted(startMuted);
    } catch (err: any) {
      setError(err?.message || "Sesli sohbete baglanilamadi.");
    }
  }, []);

  const leave = useCallback(async () => {
    if (!roomRef.current) return;
    await roomRef.current.disconnect();
    roomRef.current = null;
    try {
      const { AudioSession } = require("@livekit/react-native");
      await AudioSession.stopAudioSession();
    } catch {
      // native modul zaten yoksa yapacak bir sey yok
    }
    setConnected(false);
    setRemoteMicOn({});
    setSpeakingIds([]);
  }, []);

  const toggleMute = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    const next = !muted;
    await room.localParticipant.setMicrophoneEnabled(!next);
    setMuted(next);
  }, [muted]);

  // Diger katilimcilarin sesini (kendi mikrofonunu degil) kisar/acar - LiveKit
  // her uzak ses parcasinda (RemoteAudioTrack) bir setVolume(0..1) sunuyor.
  const setRemoteVolume = useCallback((volume: number) => {
    const room = roomRef.current;
    if (!room) return;
    room.remoteParticipants.forEach((participant: any) => {
      participant.audioTrackPublications?.forEach((pub: any) => {
        pub.track?.setVolume?.(volume);
      });
    });
  }, []);

  // "Sessize Al" - sadece TEK bir katilimcinin sesini (benim icin) kisar/
  // acar, setRemoteVolume'un aksine (o HERKESI birden etkiler, bkz. yukarisi).
  const setParticipantVolume = useCallback((identity: string, volume: number) => {
    if (volume <= 0) mutedIdentitiesRef.current.add(identity);
    else mutedIdentitiesRef.current.delete(identity);
    const room = roomRef.current;
    if (!room) return;
    const participant = room.remoteParticipants?.get?.(identity);
    participant?.audioTrackPublications?.forEach((pub: any) => {
      pub.track?.setVolume?.(volume);
    });
  }, []);

  return {
    connected,
    muted,
    error,
    nativeModuleMissing,
    join,
    leave,
    toggleMute,
    setRemoteVolume,
    setParticipantVolume,
    remoteMicOn,
    speakingIds,
  };
}
