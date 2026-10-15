import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type ReactNode } from "react";
import { Animated, StyleSheet, View } from "react-native";
import { getSocket } from "../services/socket";
import type { ReactionEvent } from "../services/socket";

export interface ReactionsOverlayHandle {
  sendReaction: (emoji: string) => void;
}

interface FloatingReaction {
  id: number;
  emoji: string;
  left: number;
  anim: Animated.Value;
}

/** Video/medya alaninin uzerine ucusan emoji reaksiyonlari icin saydam bir
 * katman cizer. Gonderme kontrolu disaridan (RoomScreen'deki alt bar) `ref`
 * uzerinden `sendReaction(emoji)` cagrilarak yapilir - boylece emoji secim
 * satiri Rave'deki gibi mesaj kutusunun yanina yerlestirilebilir. */
const ReactionsOverlay = forwardRef<ReactionsOverlayHandle, { children: ReactNode; fullscreen?: boolean }>(({ children, fullscreen }, ref) => {
  const [floating, setFloating] = useState<FloatingReaction[]>([]);
  const idRef = useRef(0);

  function spawn(emoji: string) {
    const id = idRef.current++;
    const anim = new Animated.Value(0);
    const left = 10 + Math.random() * 70;
    setFloating((prev) => [...prev, { id, emoji, left, anim }]);
    Animated.timing(anim, { toValue: 1, duration: 1800, useNativeDriver: true }).start(() => {
      setFloating((prev) => prev.filter((f) => f.id !== id));
    });
  }

  useEffect(() => {
    const socket = getSocket();
    function handleReaction(ev: ReactionEvent) {
      spawn(ev.emoji);
    }
    socket.on("room:reaction", handleReaction);
    return () => {
      socket.off("room:reaction", handleReaction);
    };
  }, []);

  useImperativeHandle(ref, () => ({
    sendReaction: (emoji: string) => {
      getSocket().emit("reaction:send", { emoji });
      spawn(emoji);
    },
  }));

  return (
    <View style={[styles.mediaWrap, fullscreen && styles.mediaWrapFullscreen]}>
      {children}
      <View style={styles.overlay} pointerEvents="none">
        {floating.map((f) => (
          <Animated.Text
            key={f.id}
            style={[
              styles.floatingEmoji,
              {
                left: `${f.left}%` as any,
                opacity: f.anim.interpolate({ inputRange: [0, 0.8, 1], outputRange: [1, 1, 0] }),
                transform: [
                  { translateY: f.anim.interpolate({ inputRange: [0, 1], outputRange: [0, -140] }) },
                  { scale: f.anim.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0.5, 1.2, 1] }) },
                ],
              },
            ]}
          >
            {f.emoji}
          </Animated.Text>
        ))}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  // flex:1 artik HER ZAMAN (normal ekranda da) - mediaSection'in artik
  // kesin piksel genislik/yukseklige sahip oldugunu (bkz. RoomScreen.tsx
  // estimatedVideoWidth) biliyoruz, bu yuzden alt bilesenlerin (WebView'ler)
  // KENDI aspectRatio hesabina guvenmesine hic gerek yok - sadece bu
  // kapsayiciyi doldurmalari yeterli.
  mediaWrap: { position: "relative", flex: 1 },
  mediaWrapFullscreen: { flex: 1 },
  overlay: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0 },
  floatingEmoji: { position: "absolute", bottom: 10, fontSize: 28 },
});

export default ReactionsOverlay;
