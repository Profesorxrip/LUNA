import React, { createContext, useContext, useEffect, useState } from "react";
import { View, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { useCallEngine } from "../hooks/useCallEngine";
import IncomingCallScreen from "../screens/IncomingCallScreen";
import MinimizedCallBanner from "../components/MinimizedCallBanner";
import { formatElapsed } from "../screens/VoiceCallScreen";
import { navigationRef, subscribeCurrentRouteName } from "../navigation/RootNavigator";

type CallEngine = ReturnType<typeof useCallEngine>;
export interface CallEngineContextValue extends CallEngine {
  // GERCEK kucultme durumu - VoiceCallScreen/VideoCallScreen'in "kucult"
  // butonu buraya yazar (bkz. RootNavigator.tsx onMinimize), engine'in
  // KENDISI degil CallEngineProvider bu bilgiyi tutar cunku kucultulmus
  // banner da onun render ettigi bir overlay (bkz. asagisi).
  callMinimized: boolean;
  setCallMinimized: (minimized: boolean) => void;
  // Belirli bir EKRANIN KENDISI (orn. CreateRoomScreen.tsx, platform secme
  // IZGARASINDAN bir ALT ekrana - youtube/weburl/history/liked/external -
  // gecince) banner'i GECICI olarak bastirmak icin - route adina gore
  // (bkz. asagidaki HIDE_BANNER_ROUTES) tum ekran icin sabit bir karardan
  // FARKLI olarak, bu ekranin KENDI ic durumuna gore degisir.
  bannerSuppressedByScreen: boolean;
  setBannerSuppressedByScreen: (suppressed: boolean) => void;
}

const CallEngineContext = createContext<CallEngineContextValue | null>(null);

// Banner'in HER ZAMAN GIZLENDIGI ekranlar - "Room": zaten kendi sesli/
// goruntulu oda arayuzu var, ustune bir de 1'e 1 arama banner'i binmesin
// diye (bkz. RootNavigator.tsx subscribeCurrentRouteName). "Create" TAB'inin
// kendisi burada YOK - platform secme IZGARASINDA banner gorunmeli, sadece
// alt ekranlarinda (bkz. bannerSuppressedByScreen, CreateRoomScreen.tsx)
// gizlenmeli.
const HIDE_BANNER_ROUTES = new Set(["Room"]);

export function useCallEngineContext(): CallEngineContextValue {
  const ctx = useContext(CallEngineContext);
  if (!ctx) throw new Error("useCallEngineContext, CallEngineProvider disinda cagrilamaz.");
  return ctx;
}

/** Uygulamanin KOKUNDE (App.tsx, RootNavigator'in disinda) TEK bir kez
 * render edilir - GERCEK 1'e 1 WebRTC arama motorunu (bkz. useCallEngine.ts)
 * burada TEK bir ornek olarak tutar: hem DM ekranindan arama baslatilabilsin
 * hem de GELEN bir arama, kullanici o an uygulamanin NERESINDE olursa olsun,
 * tam ekran bir overlay olarak (navigasyon agacinin USTUNDE) gosterilebilsin.
 *
 * AYNI sekilde, arama ekrani "kucultulunce" (bkz. RootNavigator.tsx
 * onMinimize) GERCEK arama/baglanti HIC KESILMEZ (useCallEngine burada,
 * RootNavigator'in disinda yasadigi icin ekran degisse de motor calismaya
 * devam eder) - sadece VoiceCall/VideoCall ekrani navigasyon yiginindan
 * kaldirilir ve yerine, kullanici uygulamanin NERESINDE olursa olsun GORUNEN
 * bu kucuk banner gelir (bkz. asagidaki MinimizedCallBanner). Banner'a
 * dokununca AYNI ekrana geri donulur - useRealCallWiring zaten "phase idle
 * degilse yeniden davet gonderme" kuralina sahip oldugu icin bu GERCEKTEN
 * ayni (kesintisiz) aramaya geri donmek olur, yeni bir arama BASLATMAZ. */
export default function CallEngineProvider({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const engine = useCallEngine();
  const { incomingCall, acceptCall, declineCall, phase, participants, elapsedSeconds, isVideoCall, micEnabled, setMicEnabled, speakerOn, setSpeakerRoute, endCall } = engine;
  const [callMinimized, setCallMinimized] = useState(false);
  const [onHiddenRoute, setOnHiddenRoute] = useState(false);
  const [bannerSuppressedByScreen, setBannerSuppressedByScreen] = useState(false);

  // Arama tamamen bitince (phase "idle"e donunce) kucultulmus banner da
  // kendiliginden kapanir - bir sonraki aramada BOS yere acik kalmasin diye.
  useEffect(() => {
    if (phase === "idle") setCallMinimized(false);
  }, [phase]);

  useEffect(() => subscribeCurrentRouteName((name) => setOnHiddenRoute(!!name && HIDE_BANNER_ROUTES.has(name))), []);

  const contextValue: CallEngineContextValue = {
    ...engine,
    callMinimized,
    setCallMinimized,
    bannerSuppressedByScreen,
    setBannerSuppressedByScreen,
  };
  // Gelen arama zaten devam eden bir GRUP aramasiysa (existingMembers dolu),
  // ekranda bildirim olarak ARAYANIN adi/avatari gosterilir - kabul edilince
  // navigasyon yine ARAYANIN bilgileriyle acilir, ekran kendi icinde
  // engine.participants'tan (existingMembers DAHIL) gercek katilimci
  // listesini okuyup grid'i olusturur.

  // Kucultulmus banner SADECE 1'e 1 aramada (tek katilimci) gosterilir -
  // grup aramasi icin banner'in kimi gosterecegi belirsiz olurdu, bkz.
  // MinimizedCallBanner.tsx'in tek bir isim/avatar alan tasarimi. "ringing-in"
  // (henuz cevaplanmamis gelen arama) zaten tam ekran IncomingCallScreen ile
  // gosterildigi icin burada HARIC tutulur.
  const minimizedPeer = participants.length === 1 ? participants[0] : null;
  const showMinimizedBanner =
    callMinimized && phase !== "idle" && phase !== "ringing-in" && !!minimizedPeer && !onHiddenRoute && !bannerSuppressedByScreen;

  return (
    <CallEngineContext.Provider value={contextValue}>
      <View style={{ flex: 1 }}>
        {showMinimizedBanner && minimizedPeer && (
          <MinimizedCallBanner
            name={minimizedPeer.name}
            avatarUrl={minimizedPeer.avatarUrl}
            elapsedLabel={phase === "connected" ? formatElapsed(elapsedSeconds) : t("dm.callRinging")}
            muted={!micEnabled}
            onToggleMute={() => setMicEnabled(!micEnabled)}
            speakerOn={speakerOn}
            onToggleSpeaker={() => setSpeakerRoute(!speakerOn)}
            onEndCall={() => {
              endCall();
              setCallMinimized(false);
            }}
            onPress={() => {
              setCallMinimized(false);
              if (navigationRef.isReady()) {
                navigationRef.navigate(isVideoCall ? "VideoCall" : "VoiceCall", {
                  peer: { userId: minimizedPeer.userId, name: minimizedPeer.name },
                  peerAvatarUrl: minimizedPeer.avatarUrl,
                });
              }
            }}
          />
        )}
        {/* Banner GORUNURKEN icerik normal akista banner'in TAM altina
            degil, biraz YUKARI cekilerek (-36) kasitli kucuk bir bindirme
            yapilir - __DevHarness.tsx'teki AYNI tasarim (bkz. oradaki
            marginTop aciklamasi + MinimizedCallBanner.tsx'teki zIndex notu,
            bindirmeye ragmen banner'in tiklanabilir kalmasini saglar). */}
        <View style={{ flex: 1, marginTop: showMinimizedBanner ? -36 : 0 }}>{children}</View>
      </View>
      {incomingCall && (
        <View style={StyleSheet.absoluteFill}>
          <IncomingCallScreen
            peer={{ userId: incomingCall.fromUserId, name: incomingCall.fromName }}
            peerAvatarUrl={incomingCall.fromAvatarUrl}
            onAccept={() => {
              const { fromUserId, fromName, fromAvatarUrl, isVideo } = incomingCall;
              acceptCall();
              if (navigationRef.isReady()) {
                navigationRef.navigate(isVideo ? "VideoCall" : "VoiceCall", {
                  peer: { userId: fromUserId, name: fromName },
                  peerAvatarUrl: fromAvatarUrl,
                });
              }
            }}
            onDecline={declineCall}
          />
        </View>
      )}
    </CallEngineContext.Provider>
  );
}
