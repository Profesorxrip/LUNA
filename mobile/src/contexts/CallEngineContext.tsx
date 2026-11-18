import React, { createContext, useContext } from "react";
import { View, StyleSheet } from "react-native";
import { useCallEngine } from "../hooks/useCallEngine";
import IncomingCallScreen from "../screens/IncomingCallScreen";
import { navigationRef } from "../navigation/RootNavigator";

type CallEngine = ReturnType<typeof useCallEngine>;

const CallEngineContext = createContext<CallEngine | null>(null);

export function useCallEngineContext(): CallEngine {
  const ctx = useContext(CallEngineContext);
  if (!ctx) throw new Error("useCallEngineContext, CallEngineProvider disinda cagrilamaz.");
  return ctx;
}

/** Uygulamanin KOKUNDE (App.tsx, RootNavigator'in disinda) TEK bir kez
 * render edilir - GERCEK 1'e 1 WebRTC arama motorunu (bkz. useCallEngine.ts)
 * burada TEK bir ornek olarak tutar: hem DM ekranindan arama baslatilabilsin
 * hem de GELEN bir arama, kullanici o an uygulamanin NERESINDE olursa olsun,
 * tam ekran bir overlay olarak (navigasyon agacinin USTUNDE) gosterilebilsin. */
export default function CallEngineProvider({ children }: { children: React.ReactNode }) {
  const engine = useCallEngine();
  const { incomingCall, acceptCall, declineCall } = engine;
  // Gelen arama zaten devam eden bir GRUP aramasiysa (existingMembers dolu),
  // ekranda bildirim olarak ARAYANIN adi/avatari gosterilir - kabul edilince
  // navigasyon yine ARAYANIN bilgileriyle acilir, ekran kendi icinde
  // engine.participants'tan (existingMembers DAHIL) gercek katilimci
  // listesini okuyup grid'i olusturur.

  return (
    <CallEngineContext.Provider value={engine}>
      {children}
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
