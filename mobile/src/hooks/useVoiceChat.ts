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

  const join = useCallback(async () => {
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
      await livekitReactNative.AudioSession.startAudioSession();
      const room = new livekitClient.Room();
      room.on(livekitClient.RoomEvent.Disconnected, () => setConnected(false));
      await room.connect(res.livekitUrl, res.token);
      await room.localParticipant.setMicrophoneEnabled(true);
      roomRef.current = room;
      setConnected(true);
      setMuted(false);
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
  }, []);

  const toggleMute = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    const next = !muted;
    await room.localParticipant.setMicrophoneEnabled(!next);
    setMuted(next);
  }, [muted]);

  return { connected, muted, error, nativeModuleMissing, join, leave, toggleMute };
}
