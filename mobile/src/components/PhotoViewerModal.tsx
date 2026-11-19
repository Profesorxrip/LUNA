import React, { useEffect, useRef, useState } from "react";
import {
  Modal,
  View,
  Animated,
  PanResponder,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Platform,
  Dimensions,
  GestureResponderEvent,
  PanResponderGestureState,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { ChevronLeft } from "lucide-react-native";
import { File, Paths } from "expo-file-system";
import Icon from "./Icon";
import { showAlert } from "./CustomAlert";

interface Props {
  uri: string | null;
  onClose: () => void;
}

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const DOUBLE_TAP_SCALE = 2.5;
const DOUBLE_TAP_DELAY_MS = 280;
// Asagi/yukari bu kadar piksel surukleyince (ya da yeterince hizli birakinca)
// kapanir - Telegram/Instagram'daki "surukle kapat" hissini taklit eder.
const DISMISS_DISTANCE = 120;
const DISMISS_VELOCITY = 1.1;
const DISMISS_FADE_RANGE = 300;

function touchDistance(touches: GestureResponderEvent["nativeEvent"]["touches"]): number {
  const [a, b] = touches;
  return Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
}

/** Profil galerisi, oda sohbeti ve DM'de paylasilan bir fotografa tek
 * dokununca acilan ortak TAM EKRAN (edge-to-edge) gorunum - iki parmakla
 * YAKINLASTIRMA, YAKINLASTIRILMISKEN SURUKLEME, cift dokununca HIZLI ZOOM,
 * ve yakinlastirilmamisken asagi/yukari SURUKLEYEREK KAPATMA destekler
 * (ekstra bir jest/animasyon kutuphanesi EKLEMEDEN, sadece React Native'in
 * kendi PanResponder + Animated API'siyle - bkz. UserProfileScreen.tsx
 * DragToCloseSheet'teki BENZER PanResponder kullanimi). Indir native'de
 * expo-media-library ile galeriye kaydediyor, web'de tarayicinin kendi
 * indirme davranisina birakiyor. */
export default function PhotoViewerModal({ uri, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const [downloading, setDownloading] = useState(false);
  const [loading, setLoading] = useState(true);
  const { width: screenW, height: screenH } = Dimensions.get("window");

  const scale = useRef(new Animated.Value(1)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  // Kapatma suruklemesi AYRI bir deger - yakinlastirilmisken kaydirmayla
  // (translateX/Y) KARISMASIN diye (ikisi ayni anda AKTIF olmaz ama
  // birbirinden BAGIMSIZ kalmalari, geri kalan fotograf konumunu
  // BOZMADAN suruklemeyi iptal edip eski yerine (0) donebilmeyi saglar).
  const dismissY = useRef(new Animated.Value(0)).current;

  // PanResponder callback'leri Animated.Value'nin GUNCEL sayisal degerine
  // senkron erisemez (sadece addListener ile ASENKRON) - bu yuzden "su an
  // YERLESMIS" (bir sonraki jestin BASLANGIC noktasi olan) deger burada,
  // duz bir referansta ayrica tutuluyor.
  const committed = useRef({ scale: 1, x: 0, y: 0 });
  const gesture = useRef<{
    mode: "none" | "pinch" | "pan" | "dismiss";
    startDistance: number;
    startScale: number;
    startX: number;
    startY: number;
  }>({ mode: "none", startDistance: 0, startScale: 1, startX: 0, startY: 0 });
  const lastTapAtRef = useRef(0);

  function resetTransform(animated: boolean) {
    committed.current = { scale: 1, x: 0, y: 0 };
    if (animated) {
      Animated.parallel([
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 8 }),
        Animated.spring(translateX, { toValue: 0, useNativeDriver: true, friction: 8 }),
        Animated.spring(translateY, { toValue: 0, useNativeDriver: true, friction: 8 }),
      ]).start();
    } else {
      scale.setValue(1);
      translateX.setValue(0);
      translateY.setValue(0);
    }
    dismissY.setValue(0);
  }

  // Her YENI fotograf acildiginda (ya da kapanip tekrar acildiginda) eski
  // zoom/kaydirma durumu KALMASIN - sifirdan baslar.
  useEffect(() => {
    resetTransform(false);
    setLoading(!!uri);
  }, [uri]);

  function clampTranslate(x: number, y: number, s: number) {
    const maxX = Math.max(0, (screenW * (s - 1)) / 2);
    const maxY = Math.max(0, (screenH * (s - 1)) / 2);
    return { x: Math.min(maxX, Math.max(-maxX, x)), y: Math.min(maxY, Math.max(-maxY, y)) };
  }

  function zoomTo(targetScale: number) {
    const clamped = Math.min(MAX_SCALE, Math.max(MIN_SCALE, targetScale));
    const t = clampTranslate(committed.current.x, committed.current.y, clamped);
    committed.current = { scale: clamped, x: t.x, y: t.y };
    Animated.parallel([
      Animated.spring(scale, { toValue: clamped, useNativeDriver: true, friction: 7 }),
      Animated.spring(translateX, { toValue: t.x, useNativeDriver: true, friction: 7 }),
      Animated.spring(translateY, { toValue: t.y, useNativeDriver: true, friction: 7 }),
    ]).start();
  }

  // Cift dokunma: HENUZ yakinlastirilmamissa DOUBLE_TAP_SCALE'e, zaten
  // yakinlastirilmissa 1x'e geri doner (cogu foto goruntuleyicinin
  // standart davranisi).
  function handleDoubleTap() {
    zoomTo(committed.current.scale > MIN_SCALE + 0.05 ? MIN_SCALE : DOUBLE_TAP_SCALE);
  }

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        const touches = evt.nativeEvent.touches;
        if (touches.length === 2) {
          gesture.current.mode = "pinch";
          gesture.current.startDistance = touchDistance(touches);
          gesture.current.startScale = committed.current.scale;
          return;
        }
        const now = Date.now();
        if (now - lastTapAtRef.current < DOUBLE_TAP_DELAY_MS) {
          handleDoubleTap();
          lastTapAtRef.current = 0;
          gesture.current.mode = "none";
          return;
        }
        lastTapAtRef.current = now;
        gesture.current.mode = committed.current.scale > MIN_SCALE + 0.05 ? "pan" : "dismiss";
        gesture.current.startX = committed.current.x;
        gesture.current.startY = committed.current.y;
      },
      onPanResponderMove: (evt: GestureResponderEvent, g: PanResponderGestureState) => {
        const touches = evt.nativeEvent.touches;
        if (touches.length === 2) {
          if (gesture.current.mode !== "pinch") {
            gesture.current.mode = "pinch";
            gesture.current.startDistance = touchDistance(touches);
            gesture.current.startScale = committed.current.scale;
          }
          const factor = gesture.current.startDistance > 0 ? touchDistance(touches) / gesture.current.startDistance : 1;
          const nextScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, gesture.current.startScale * factor));
          committed.current.scale = nextScale;
          scale.setValue(nextScale);
          return;
        }
        if (gesture.current.mode === "pan") {
          const t = clampTranslate(gesture.current.startX + g.dx, gesture.current.startY + g.dy, committed.current.scale);
          committed.current.x = t.x;
          committed.current.y = t.y;
          translateX.setValue(t.x);
          translateY.setValue(t.y);
        } else if (gesture.current.mode === "dismiss") {
          dismissY.setValue(g.dy);
        }
      },
      onPanResponderRelease: (_evt, g: PanResponderGestureState) => {
        if (gesture.current.mode === "pinch") {
          if (committed.current.scale < MIN_SCALE + 0.05) {
            resetTransform(true);
          } else {
            const t = clampTranslate(committed.current.x, committed.current.y, committed.current.scale);
            committed.current.x = t.x;
            committed.current.y = t.y;
            Animated.parallel([
              Animated.spring(translateX, { toValue: t.x, useNativeDriver: true, friction: 7 }),
              Animated.spring(translateY, { toValue: t.y, useNativeDriver: true, friction: 7 }),
            ]).start();
          }
        } else if (gesture.current.mode === "dismiss") {
          if (Math.abs(g.dy) > DISMISS_DISTANCE || Math.abs(g.vy) > DISMISS_VELOCITY) {
            Animated.timing(dismissY, {
              toValue: g.dy > 0 ? screenH : -screenH,
              duration: 180,
              useNativeDriver: true,
            }).start(onClose);
          } else {
            Animated.spring(dismissY, { toValue: 0, useNativeDriver: true, friction: 7 }).start();
          }
        }
        gesture.current.mode = "none";
      },
    })
  ).current;

  const dismissOpacity = dismissY.interpolate({
    inputRange: [-DISMISS_FADE_RANGE, 0, DISMISS_FADE_RANGE],
    outputRange: [0.25, 1, 0.25],
    extrapolate: "clamp",
  });
  const dismissScale = dismissY.interpolate({
    inputRange: [-DISMISS_FADE_RANGE, 0, DISMISS_FADE_RANGE],
    outputRange: [0.85, 1, 0.85],
    extrapolate: "clamp",
  });

  async function downloadPhoto(url: string) {
    if (downloading) return;
    setDownloading(true);
    try {
      if (Platform.OS === "web") {
        window.open(url, "_blank");
        return;
      }
      // expo-media-library'nin yeni sinif tabanli API'sinin web karsiligi yok
      // (paket import edilir edilmez native modulu arayip cokuyor) - sadece
      // native'de calisan bu dalda DINAMIK import ediyoruz.
      const MediaLibrary = await import("expo-media-library");
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== "granted") {
        showAlert("İzin gerekli", "Fotoğrafı galerine kaydetmek için fotoğraf iznine ihtiyacımız var.");
        return;
      }
      const downloaded = await File.downloadFileAsync(url, Paths.cache);
      await MediaLibrary.Asset.create(downloaded.uri);
      showAlert("Kaydedildi", "Fotoğraf galerine kaydedildi.");
    } catch (err: any) {
      showAlert("Kaydedilemedi", err?.message || "Fotoğraf kaydedilirken bir hata oluştu, tekrar dene.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <Modal visible={!!uri} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.screen}>
        <Animated.View
          style={[styles.imageWrap, { opacity: dismissOpacity }]}
          {...panResponder.panHandlers}
        >
          {uri && (
            <Animated.Image
              source={{ uri }}
              style={[
                styles.image,
                {
                  transform: [
                    { translateX },
                    { translateY: Animated.add(translateY, dismissY) },
                    { scale: Animated.multiply(scale, dismissScale) },
                  ],
                },
              ]}
              resizeMode="contain"
              onLoadStart={() => setLoading(true)}
              onLoadEnd={() => setLoading(false)}
              onError={() => setLoading(false)}
            />
          )}
        </Animated.View>
        {loading && (
          <View style={[StyleSheet.absoluteFill, styles.loadingOverlay]} pointerEvents="none">
            <ActivityIndicator color="#FFFFFF" size="large" />
          </View>
        )}
        <LinearGradient
          colors={["rgba(0,0,0,0.75)", "transparent"]}
          style={[styles.topGradient, { height: insets.top + 84 }]}
          pointerEvents="none"
        />
        <View style={[styles.topBar, { paddingTop: insets.top + 10 }]}>
          <TouchableOpacity style={styles.iconBtn} onPress={onClose} hitSlop={10}>
            <ChevronLeft size={20} color="#FFFFFF" strokeWidth={2.5} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => uri && downloadPhoto(uri)}
            disabled={downloading}
            hitSlop={10}
          >
            {downloading ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Icon name="download" size={18} color="#FFFFFF" />
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#000000" },
  imageWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  image: { width: "100%", height: "100%" },
  loadingOverlay: { alignItems: "center", justifyContent: "center" },
  topGradient: { position: "absolute", top: 0, left: 0, right: 0 },
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingBottom: 10,
  },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(30,30,30,0.7)", alignItems: "center", justifyContent: "center" },
});
