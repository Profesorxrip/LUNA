import React, { useEffect, useRef, useState } from "react";
import {
  Modal,
  View,
  Image,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  PanResponder,
  Animated,
  ScrollView,
} from "react-native";
import { useTranslation } from "react-i18next";
import { captureRef } from "react-native-view-shot";
import * as ImageManipulator from "expo-image-manipulator";
import Svg, { Path } from "react-native-svg";
import { RotateCw, ArrowLeftRight, Crop, PenLine, Type, Plus, X, Undo2, FaceGrinning, Trash2 } from "lucide-react-native";
import { useFonts, Inter_700Bold } from "@expo-google-fonts/inter";
import { Sora_700Bold } from "@expo-google-fonts/sora";
import { BebasNeue_400Regular } from "@expo-google-fonts/bebas-neue";
import { theme } from "../theme";
import Icon from "./Icon";

interface Props {
  visible: boolean;
  images: string[];
  uploading: boolean;
  uploadProgress: number;
  onCancel: () => void;
  onRemoveImage: (index: number) => void;
  onAddMore: () => void;
  onReplaceImage: (index: number, uri: string) => void;
  onSend: (caption: string) => void;
}

const DRAW_COLORS = ["#FFFFFF", "#FF3B30", "#FFD60A", "#34C759", "#0A84FF"];
const EMOJI_QUICK = ["😀", "😂", "😍", "😎", "🥳", "😢", "😮", "🔥", "❤️", "👍", "🙏", "🎉", "😡", "😴", "🤔", "👀"];
const STICKER_COLORS = ["#FFFFFF", "#000000", "#FF3B30", "#FFD60A", "#34C759", "#0A84FF", "#BF5AF2", "#FF2D55"];
const STICKER_FONTS: { id: string; label: string; family?: string }[] = [
  { id: "default", label: "Aa" },
  { id: "inter", label: "Aa", family: "Inter_700Bold" },
  { id: "sora", label: "Aa", family: "Sora_700Bold" },
  { id: "bebas", label: "AA", family: "BebasNeue_400Regular" },
];

interface StrokePath {
  d: string;
  color: string;
}
interface TextSticker {
  id: string;
  text: string;
  x: number;
  y: number;
  color: string;
  font?: string;
}
interface ImageEdits {
  paths: StrokePath[];
  stickers: TextSticker[];
}
const EMPTY_EDITS: ImageEdits = { paths: [], stickers: [] };

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}
function distance(a: { pageX: number; pageY: number }, b: { pageX: number; pageY: number }) {
  return Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
}

/** Resimdeki bir metin etiketi - kendi PanResponder'iyla surukleniyor. Her
 * render'da YENIDEN olusturuluyor (useRef/useMemo YOK) ki "grant" aninda
 * HER ZAMAN guncel x/y'yi yakalasin (eski/durgun closure sorunu olmasin). */
function StickerView({
  sticker,
  editing,
  placeholder,
  onDrag,
  onStartEdit,
  onChangeText,
  onFinishEdit,
  onDelete,
  onDragStart,
  onDragMove,
  onDragEnd,
}: {
  sticker: TextSticker;
  editing: boolean;
  placeholder: string;
  onDrag: (id: string, x: number, y: number) => void;
  onStartEdit: (id: string) => void;
  onChangeText: (id: string, text: string) => void;
  onFinishEdit: () => void;
  onDelete: (id: string) => void;
  onDragStart: () => void;
  onDragMove: (pageX: number, pageY: number) => void;
  onDragEnd: (id: string, pageX: number, pageY: number) => void;
}) {
  const grantTime = useRef(0);
  const moved = useRef(false);
  // Kullanici: "O metni yazdıktan sonra istediğimiz yere oynatabiliyoruz
  // değilmi" - ONCEKI halde Text, kendi dokunusunu KENDI uzerine alan bir
  // TouchableOpacity'nin icindeydi, bu yuzden ustteki surukleme View'i hic
  // devreye giremiyordu (surukleme calismiyordu). Tek bir PanResponder'la
  // hem durma/tiklama (duzenlemeye gir), hem uzun basma (sil), hem de
  // surukleme ayni yerde ayirt ediliyor.
  //
  // Onemli: bu bilesen setState sonrasi HER render'da yeniden olusturuluyor
  // (bkz. dosya basindaki not), ve react-native-web'de PanResponder'in HER
  // YENIDEN OLUSTURULMASI gesture'in baslangic referans noktasini da
  // SIFIRLIYOR - yani gestureState.dx/dy, ilk dokunustan beri TOPLAM kayma
  // DEGIL, SADECE bir onceki "move" karesinden bu yana olan KUCUK artis.
  // Bu yuzden pozisyonu "grant anindaki konum + toplam dx" yerine her
  // seferinde "GUNCEL konum + bu karenin dx'i" ile guncelliyoruz.
  const responder = PanResponder.create({
    onStartShouldSetPanResponder: () => !editing,
    onMoveShouldSetPanResponder: () => !editing,
    onPanResponderGrant: () => {
      grantTime.current = Date.now();
      moved.current = false;
    },
    onPanResponderMove: (evt, g) => {
      if (Math.abs(g.dx) > 3 || Math.abs(g.dy) > 3) {
        if (!moved.current) onDragStart();
        moved.current = true;
      }
      onDrag(sticker.id, sticker.x + g.dx, sticker.y + g.dy);
      if (moved.current) onDragMove(evt.nativeEvent.pageX, evt.nativeEvent.pageY);
    },
    onPanResponderRelease: (evt) => {
      if (!moved.current) {
        if (Date.now() - grantTime.current > 350) onDelete(sticker.id);
        else onStartEdit(sticker.id);
        return;
      }
      // Kullanici: "Yazıyı sürükleyip çöp kovasına atabilelim" - surukleme
      // bittigi an sayfa koordinatini (pageX/Y) ust bilesene bildiriyoruz,
      // o da cop kutusunun olculmus konumuyla karsilastirip gerekirse siliyor.
      onDragEnd(sticker.id, evt.nativeEvent.pageX, evt.nativeEvent.pageY);
    },
    // Ustteki onizlemenin pinch-zoom/pan/kaydir-kapat PanResponder'i, bu
    // sticker'in GRANT ettigi responder'i ilk "move" aninda geri
    // isteyip ALIYORDU (RNW'de onPanResponderTerminationRequest varsayilan
    // true oldugu icin) - bu yuzden tek bir piksel bile surukleme GERCEKTE
    // calismiyordu. Artik reddediyoruz, surukleme gesture'i sonuna kadar
    // bu sticker'da kaliyor.
    onPanResponderTerminationRequest: () => false,
  });

  const dynamicTextStyle = { color: sticker.color, fontFamily: sticker.font, fontWeight: sticker.font ? undefined : ("800" as const) };

  return (
    <View style={[styles.stickerWrap, { left: sticker.x, top: sticker.y }]} {...responder.panHandlers}>
      {editing ? (
        <TextInput
          autoFocus
          value={sticker.text}
          onChangeText={(txt) => onChangeText(sticker.id, txt)}
          onBlur={onFinishEdit}
          onSubmitEditing={onFinishEdit}
          placeholder={placeholder}
          placeholderTextColor="rgba(255,255,255,0.5)"
          style={[styles.stickerInput, dynamicTextStyle]}
        />
      ) : (
        <Text style={[styles.stickerText, dynamicTextStyle]}>{sticker.text}</Text>
      )}
    </View>
  );
}

/** Chat/DM'e fotograf gondermeden once GOSTERILEN onay ekrani - secilen
 * fotograf(lar)in tam ekran onizlemesi. "+18 icerik" isareti burada manuel
 * bir anahtar DEGIL - sunucu, fotografi nsfwjs ile kendisi siniflandiriyor
 * (bkz. server/src/nsfwDetector.ts) ve alici tarafta gerekirse bulanik
 * gosteriyor (bkz. ChatImageBubble.tsx).
 *
 * - Coklu fotograf: alttaki kucuk resim seridi (serideki kareye dokunarak
 *   gezdiriliyor, buyuk resimde kaydirarak degil).
 * - Kirpma (kare)/dondurme/cevirme: expo-image-manipulator ile GERCEK,
 *   hemen uygulanan (pikselleri degistiren) donusumler.
 * - Cizim: react-native-svg ile GERCEK serbest-el cizim (PanResponder'la
 *   parmak izleniyor), birkac renk secenegi.
 * - Metin etiketi: suruklenebilir, dokununca duzenlenebilir, renk/font
 *   secilebilir, cop kutusuna suruklenip silinebilir.
 * - Cizim/etiketler, baska bir resme gecerken ya da gonderirken
 *   react-native-view-shot ile o anki goruntuye "yakiliyor" (flatten).
 * - Zoom/pan + asagi kaydirip kapatma: react-native-gesture-handler/
 *   reanimated EKLEMEDEN, cekirdek React Native'in Animated + PanResponder'i
 *   ile (bu kadar buyuk iki yeni native bagimliligi eklemenin riskini
 *   almamak icin bilincli bir tercih).
 * - Gercek yukleme yuzdesi: supabase-js'in upload()'i ilerleme sunmuyor,
 *   bkz. utils/uploadWithProgress.ts (XMLHttpRequest ile).
 * - Emoji: yazi alaninin yanindaki yuz ikonuyla acilan kompakt bir izgara.
 */
export default function SendMediaSheet({
  visible,
  images,
  uploading,
  uploadProgress,
  onCancel,
  onRemoveImage,
  onAddMore,
  onReplaceImage,
  onSend,
}: Props) {
  const { t } = useTranslation();
  useFonts({ Inter_700Bold, Sora_700Bold, BebasNeue_400Regular });
  const [activeIndex, setActiveIndex] = useState(0);
  const [caption, setCaption] = useState("");
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [drawColor, setDrawColor] = useState(DRAW_COLORS[0]);
  const [editingStickerId, setEditingStickerId] = useState<string | null>(null);
  // Kullanici: "...rengini ve fontunu değiltirebildiğimiz bir alanda
  // olmalı" - renk/font araclari "editingStickerId" (sadece metin kutusu
  // odaktayken) yerine "selectedStickerId"ye bagli: boylece bir renge
  // dokununca TextInput blur olup editingStickerId sifirlansa bile
  // (tarayicinin dogal davranisi) arac cubugu KAYBOLMUYOR - sticker hala
  // "secili" kalip rengi/fontu degistirilebiliyor. Bos bir yere dokununca
  // (previewResponder'in "tap" algilamasi) secim kaldiriliyor.
  const [selectedStickerId, setSelectedStickerId] = useState<string | null>(null);
  const [editsByIndex, setEditsByIndex] = useState<Record<number, ImageEdits>>({});
  const [currentPath, setCurrentPath] = useState("");
  const [busy, setBusy] = useState(false);
  // Kullanici: "Evet ortada başlasın" - yeni metin etiketinin GERCEKTEN
  // fotografin (resizeMode="contain" ile letterbox'lanmis olabilen) ortasinda
  // baslayabilmesi icin onizleme alaninin GERCEK olculerini onLayout ile
  // olcuyoruz - "contain" modunda kapsayicinin tam ortasi HER ZAMAN
  // gorunur resmin bir parcasidir, oran ne olursa olsun.
  const [areaSize, setAreaSize] = useState({ width: 0, height: 0 });
  const viewShotRef = useRef<View>(null);
  const prevIndexRef = useRef(0);

  // Kullanici: "Yazıyı sürükleyip çöp kovasına atabilelim" - bir sticker
  // suruklenirken ekranda beliren cop kutusu ve uzerine mi geldigini
  // izlemek icin durum + olculmus (pageX/Y) konumu.
  const [draggingSticker, setDraggingSticker] = useState(false);
  const [overTrash, setOverTrash] = useState(false);
  const trashRef = useRef<View>(null);
  const trashBox = useRef({ x: 0, y: 0, width: 0, height: 0 });

  const pan = useRef(new Animated.ValueXY()).current;
  const scale = useRef(new Animated.Value(1)).current;
  const lastScale = useRef(1);
  const lastPan = useRef({ x: 0, y: 0 });
  const lastDistance = useRef<number | null>(null);

  useEffect(() => {
    if (!visible) {
      setCaption("");
      setActiveIndex(0);
      prevIndexRef.current = 0;
      setEditsByIndex({});
      setDrawing(false);
      setEditingStickerId(null);
      setSelectedStickerId(null);
      setEmojiOpen(false);
      resetZoom();
    }
  }, [visible]);

  useEffect(() => {
    if (activeIndex >= images.length && images.length > 0) setActiveIndex(images.length - 1);
  }, [images.length, activeIndex]);

  function resetZoom() {
    pan.setValue({ x: 0, y: 0 });
    scale.setValue(1);
    lastScale.current = 1;
    lastPan.current = { x: 0, y: 0 };
  }

  const edits = editsByIndex[activeIndex] ?? EMPTY_EDITS;

  function setEditsForIndex(index: number, next: ImageEdits) {
    setEditsByIndex((prev) => ({ ...prev, [index]: next }));
  }

  function hasEdits(index: number) {
    const e = editsByIndex[index];
    return !!e && (e.paths.length > 0 || e.stickers.length > 0);
  }

  // Aktif resmi degistirmeden once uzerindeki cizim/etiketleri GERCEKTEN
  // piksellere "yakip" (flatten) sonra o anlik goruntuyu kalici hale getiriyor.
  async function flattenIndex(index: number) {
    if (!hasEdits(index) || !viewShotRef.current) return;
    try {
      const uri = await captureRef(viewShotRef, { format: "jpg", quality: 0.9 });
      onReplaceImage(index, uri);
      setEditsByIndex((prev) => {
        const next = { ...prev };
        delete next[index];
        return next;
      });
    } catch (err) {
      console.error("duzenlemeler goruntuye yakilamadi:", err);
    }
  }

  async function goToIndex(nextIndex: number) {
    if (nextIndex === activeIndex) return;
    await flattenIndex(activeIndex);
    setActiveIndex(nextIndex);
    setDrawing(false);
    setEditingStickerId(null);
    setSelectedStickerId(null);
    resetZoom();
  }

  async function rotateActive() {
    const uri = images[activeIndex];
    if (!uri || busy) return;
    setBusy(true);
    try {
      const result = await ImageManipulator.manipulateAsync(uri, [{ rotate: 90 }], { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG });
      onReplaceImage(activeIndex, result.uri);
    } catch (err) {
      console.error("dondurme basarisiz:", err);
    } finally {
      setBusy(false);
    }
  }

  async function flipActive() {
    const uri = images[activeIndex];
    if (!uri || busy) return;
    setBusy(true);
    try {
      const result = await ImageManipulator.manipulateAsync(uri, [{ flip: ImageManipulator.FlipType.Horizontal }], {
        compress: 0.9,
        format: ImageManipulator.SaveFormat.JPEG,
      });
      onReplaceImage(activeIndex, result.uri);
    } catch (err) {
      console.error("cevirme basarisiz:", err);
    } finally {
      setBusy(false);
    }
  }

  async function cropActiveSquare() {
    const uri = images[activeIndex];
    if (!uri || busy) return;
    setBusy(true);
    try {
      const size = await new Promise<{ width: number; height: number }>((resolve, reject) => {
        Image.getSize(uri, (width, height) => resolve({ width, height }), reject);
      });
      const side = Math.min(size.width, size.height);
      const originX = Math.round((size.width - side) / 2);
      const originY = Math.round((size.height - side) / 2);
      const result = await ImageManipulator.manipulateAsync(uri, [{ crop: { originX, originY, width: side, height: side } }], {
        compress: 0.9,
        format: ImageManipulator.SaveFormat.JPEG,
      });
      onReplaceImage(activeIndex, result.uri);
    } catch (err) {
      console.error("kirpma basarisiz:", err);
    } finally {
      setBusy(false);
    }
  }

  function addTextSticker() {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    // Bos etiketin kabaca yarisi kadar (yaklasik) genislik/yukseklik dusup
    // KENDI kutusunu da merkeze alıyoruz, yoksa sol-ust kosesi merkezde kalirdi.
    const sticker: TextSticker = {
      id,
      text: "",
      x: Math.max(0, areaSize.width / 2 - 40),
      y: Math.max(0, areaSize.height / 2 - 14),
      color: STICKER_COLORS[0],
      font: undefined,
    };
    setEditsForIndex(activeIndex, { ...edits, stickers: [...edits.stickers, sticker] });
    setEditingStickerId(id);
    setSelectedStickerId(id);
  }

  // Varolan bir etikete kisa dokununca HEM duzenlemeye giriyor HEM de
  // "secili" yapiyor (renk/font araci bu sticker uzerinde calisir).
  function startEditingSticker(id: string) {
    setEditingStickerId(id);
    setSelectedStickerId(id);
  }

  // Bos birakilan bir etiketi (yeni eklenip hic yazilmadan disarisina
  // dokunulmus olabilir) duzenleme bitince otomatik kaldiriyoruz.
  function finishEditingSticker(id: string) {
    setEditingStickerId(null);
    setEditsByIndex((prev) => {
      const current = prev[activeIndex];
      if (!current) return prev;
      const target = current.stickers.find((s) => s.id === id);
      if (target && target.text.trim() === "") {
        return { ...prev, [activeIndex]: { ...current, stickers: current.stickers.filter((s) => s.id !== id) } };
      }
      return prev;
    });
  }

  function dragSticker(id: string, x: number, y: number) {
    setEditsForIndex(activeIndex, { ...edits, stickers: edits.stickers.map((s) => (s.id === id ? { ...s, x, y } : s)) });
  }
  function changeStickerText(id: string, text: string) {
    setEditsForIndex(activeIndex, { ...edits, stickers: edits.stickers.map((s) => (s.id === id ? { ...s, text } : s)) });
  }
  function changeStickerColor(id: string, color: string) {
    setEditsForIndex(activeIndex, { ...edits, stickers: edits.stickers.map((s) => (s.id === id ? { ...s, color } : s)) });
  }
  function changeStickerFont(id: string, font: string | undefined) {
    setEditsForIndex(activeIndex, { ...edits, stickers: edits.stickers.map((s) => (s.id === id ? { ...s, font } : s)) });
  }
  function deleteSticker(id: string) {
    setEditsForIndex(activeIndex, { ...edits, stickers: edits.stickers.filter((s) => s.id !== id) });
    setSelectedStickerId((cur) => (cur === id ? null : cur));
  }
  // Kullanici: "Yazıyı sürükleyip çöp kovasına atabilelim" - surukleme
  // bittigindeki sayfa koordinati (pageX/Y), ekranda sabit duran cop
  // kutusunun olculmus sinirlari icine dusuyorsa sticker'i sil.
  function isOverTrash(pageX: number, pageY: number) {
    const b = trashBox.current;
    if (!b.width) return false;
    const pad = 24;
    return pageX >= b.x - pad && pageX <= b.x + b.width + pad && pageY >= b.y - pad && pageY <= b.y + b.height + pad;
  }
  function handleStickerDragStart() {
    setDraggingSticker(true);
  }
  function handleStickerDragMove(pageX: number, pageY: number) {
    setOverTrash(isOverTrash(pageX, pageY));
  }
  function handleStickerDragEnd(id: string, pageX: number, pageY: number) {
    const hit = isOverTrash(pageX, pageY);
    setDraggingSticker(false);
    setOverTrash(false);
    if (hit) deleteSticker(id);
  }
  function undoLastStroke() {
    setEditsForIndex(activeIndex, { ...edits, paths: edits.paths.slice(0, -1) });
  }

  // Cizim katmani - SADECE "drawing" acikken dokunuslari yakalar, aktif
  // index/renk her render'da GUNCEL (useRef/useMemo yok, bilinçli).
  const drawResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => drawing,
    onMoveShouldSetPanResponder: () => drawing,
    onPanResponderGrant: (evt) => {
      const { locationX, locationY } = evt.nativeEvent;
      setCurrentPath(`M${locationX.toFixed(1)},${locationY.toFixed(1)}`);
    },
    onPanResponderMove: (evt) => {
      const { locationX, locationY } = evt.nativeEvent;
      setCurrentPath((prev) => `${prev} L${locationX.toFixed(1)},${locationY.toFixed(1)}`);
    },
    onPanResponderRelease: () => {
      setCurrentPath((prev) => {
        if (prev) setEditsForIndex(activeIndex, { ...edits, paths: [...edits.paths, { d: prev, color: drawColor }] });
        return "";
      });
    },
  });

  // Onizlemenin pinch-zoom + pan + asagi-kaydirip-kapatma hareketi - tek bir
  // PanResponder, iki parmakli kiistirmede olcek, tek parmakta (olcek 1
  // iken) asagi kaydirinca kapatma, buyutulmusken kaydirma.
  const previewResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => !drawing,
    onMoveShouldSetPanResponder: () => !drawing,
    onPanResponderGrant: () => {
      lastDistance.current = null;
    },
    onPanResponderMove: (evt, gestureState) => {
      const touches = evt.nativeEvent.touches;
      if (touches.length === 2) {
        const dist = distance(touches[0] as any, touches[1] as any);
        if (lastDistance.current == null) lastDistance.current = dist;
        scale.setValue(clamp(lastScale.current * (dist / lastDistance.current), 1, 4));
      } else {
        pan.setValue({ x: lastPan.current.x + gestureState.dx, y: lastPan.current.y + gestureState.dy });
      }
    },
    onPanResponderRelease: (_, gestureState) => {
      lastDistance.current = null;
      // Bos bir yere (sticker disina) kisa dokununca secili etiketi
      // birak - renk/font araci da bununla birlikte kapanir.
      if (Math.abs(gestureState.dx) < 6 && Math.abs(gestureState.dy) < 6) setSelectedStickerId(null);
      scale.stopAnimation((currentScale) => {
        if (currentScale <= 1.04) {
          if (gestureState.dy > 110 && Math.abs(gestureState.dx) < 90) {
            onCancel();
            return;
          }
          Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start();
          Animated.spring(scale, { toValue: 1, useNativeDriver: false }).start();
          lastScale.current = 1;
          lastPan.current = { x: 0, y: 0 };
        } else {
          lastScale.current = clamp(currentScale, 1, 4);
          pan.stopAnimation((p: any) => {
            lastPan.current = { x: p.x, y: p.y };
          });
        }
      });
    },
  });

  async function handleSend() {
    await flattenIndex(activeIndex);
    onSend(caption.trim());
  }

  const activeUri = images[activeIndex];

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCancel} statusBarTranslucent>
      <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.iconTouch} onPress={onCancel} disabled={uploading} hitSlop={10}>
            <Icon name="close" size={22} color={theme.text} />
          </TouchableOpacity>
          {images.length > 1 && (
            <Text style={styles.counterText}>
              {activeIndex + 1}/{images.length}
            </Text>
          )}
          <View style={styles.toolbarRow}>
            <TouchableOpacity style={styles.iconTouch} onPress={rotateActive} disabled={busy || uploading} hitSlop={6}>
              <RotateCw size={20} color={theme.text} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconTouch} onPress={flipActive} disabled={busy || uploading} hitSlop={6}>
              <ArrowLeftRight size={20} color={theme.text} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconTouch} onPress={cropActiveSquare} disabled={busy || uploading} hitSlop={6}>
              <Crop size={20} color={theme.text} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.iconTouch, drawing && styles.iconTouchActive]}
              onPress={() => setDrawing((d) => !d)}
              disabled={uploading}
              hitSlop={6}
            >
              <PenLine size={20} color={theme.text} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconTouch} onPress={addTextSticker} disabled={uploading} hitSlop={6}>
              <Type size={20} color={theme.text} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.previewWrap}>
          <View
            ref={viewShotRef}
            collapsable={false}
            style={styles.shotArea}
            onLayout={(e) => setAreaSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
            {...(drawing ? drawResponder.panHandlers : previewResponder.panHandlers)}
          >
            {activeUri && (
              <Animated.Image
                source={{ uri: activeUri }}
                style={[styles.preview, { transform: [{ translateX: pan.x }, { translateY: pan.y }, { scale }] }]}
                resizeMode="contain"
              />
            )}
            <Svg width="100%" height="100%" style={StyleSheet.absoluteFill} pointerEvents="none">
              {edits.paths.map((p, i) => (
                <Path key={i} d={p.d} stroke={p.color} strokeWidth={4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
              ))}
              {!!currentPath && <Path d={currentPath} stroke={drawColor} strokeWidth={4} fill="none" strokeLinecap="round" strokeLinejoin="round" />}
            </Svg>
            {edits.stickers.map((s) => (
              <StickerView
                key={s.id}
                sticker={s}
                editing={editingStickerId === s.id}
                placeholder={t("sendMedia.stickerDefaultText")}
                onDrag={dragSticker}
                onStartEdit={startEditingSticker}
                onChangeText={changeStickerText}
                onFinishEdit={() => finishEditingSticker(s.id)}
                onDelete={deleteSticker}
                onDragStart={handleStickerDragStart}
                onDragMove={handleStickerDragMove}
                onDragEnd={handleStickerDragEnd}
              />
            ))}
            {busy && (
              <View style={styles.busyOverlay}>
                <ActivityIndicator color="#FFFFFF" />
              </View>
            )}
          </View>
          {draggingSticker && (
            <View
              ref={trashRef}
              testID="sticker-trash"
              style={[styles.trashButton, overTrash && styles.trashButtonHot]}
              onLayout={() =>
                trashRef.current?.measureInWindow((x, y, width, height) => {
                  trashBox.current = { x, y, width, height };
                })
              }
            >
              <Trash2 size={24} color="#FFFFFF" />
            </View>
          )}
        </View>

        {!drawing && selectedStickerId && edits.stickers.some((s) => s.id === selectedStickerId) && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.stickerToolsScroll} contentContainerStyle={styles.stickerToolsRow}>
            {STICKER_COLORS.map((c) => {
              const activeSticker = edits.stickers.find((s) => s.id === selectedStickerId);
              return (
                <TouchableOpacity
                  key={c}
                  testID={`sticker-color-${c}`}
                  style={[styles.colorDot, { backgroundColor: c }, activeSticker?.color === c && styles.colorDotActive]}
                  onPress={() => changeStickerColor(selectedStickerId, c)}
                />
              );
            })}
            <View style={styles.stickerToolsDivider} />
            {STICKER_FONTS.map((f) => {
              const activeSticker = edits.stickers.find((s) => s.id === selectedStickerId);
              return (
                <TouchableOpacity
                  key={f.id}
                  testID={`sticker-font-${f.id}`}
                  style={[styles.fontChip, activeSticker?.font === f.family && styles.fontChipActive]}
                  onPress={() => changeStickerFont(selectedStickerId, f.family)}
                >
                  <Text style={[styles.fontChipText, f.family ? { fontFamily: f.family } : null]}>{f.label}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        {drawing && (
          <View style={styles.drawToolsRow}>
            {DRAW_COLORS.map((c) => (
              <TouchableOpacity
                key={c}
                style={[styles.colorDot, { backgroundColor: c }, drawColor === c && styles.colorDotActive]}
                onPress={() => setDrawColor(c)}
              />
            ))}
            <TouchableOpacity style={styles.iconTouch} onPress={undoLastStroke} disabled={edits.paths.length === 0} hitSlop={6}>
              <Undo2 size={20} color={edits.paths.length === 0 ? "rgba(255,255,255,0.3)" : theme.text} />
            </TouchableOpacity>
          </View>
        )}

        {images.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.thumbStripScroll} contentContainerStyle={styles.thumbStrip}>
            {images.map((uri, i) => (
              <TouchableOpacity key={`${uri}-${i}`} style={[styles.thumbCell, i === activeIndex && styles.thumbCellActive]} onPress={() => goToIndex(i)}>
                <Image source={{ uri }} style={styles.thumbImage} />
                <TouchableOpacity style={styles.thumbRemove} onPress={() => onRemoveImage(i)} hitSlop={6}>
                  <X size={11} color="#FFFFFF" />
                </TouchableOpacity>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.thumbAdd} onPress={onAddMore}>
              <Plus size={20} color={theme.text} />
            </TouchableOpacity>
          </ScrollView>
        )}

        {emojiOpen && (
          <View style={styles.emojiGrid}>
            {EMOJI_QUICK.map((e) => (
              <TouchableOpacity key={e} style={styles.emojiCell} onPress={() => setCaption((prev) => prev + e)}>
                <Text style={styles.emojiCellText}>{e}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View style={styles.composerRow}>
          <TouchableOpacity style={styles.emojiToggle} onPress={() => setEmojiOpen((o) => !o)} hitSlop={6}>
            <FaceGrinning size={22} color={theme.textMuted} />
          </TouchableOpacity>
          <View style={styles.captionBox}>
            <TextInput
              style={styles.captionInput}
              value={caption}
              onChangeText={setCaption}
              placeholder={t("sendMedia.captionPlaceholder")}
              placeholderTextColor="rgba(245,245,247,0.45)"
              editable={!uploading}
              multiline
              maxLength={1000}
            />
          </View>
          <TouchableOpacity style={styles.sendCircle} onPress={handleSend} disabled={uploading || images.length === 0} hitSlop={6}>
            {uploading ? <Text style={styles.sendProgressText}>{uploadProgress}%</Text> : <Icon name="send" size={20} color="#FFFFFF" />}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#000000" },
  header: { paddingTop: 50, paddingHorizontal: 14, paddingBottom: 8, flexDirection: "row", alignItems: "center", gap: 6 },
  iconTouch: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 18 },
  iconTouchActive: { backgroundColor: "rgba(255,255,255,0.18)" },
  counterText: { color: theme.textMuted, fontSize: 12, fontWeight: "700" },
  toolbarRow: { flexDirection: "row", marginLeft: "auto", gap: 2 },
  previewWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  shotArea: { width: "100%", height: "100%", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  preview: { width: "100%", height: "100%" },
  busyOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.35)" },
  stickerWrap: { position: "absolute" },
  stickerText: { color: "#FFFFFF", fontSize: 20, fontWeight: "800", textShadowColor: "rgba(0,0,0,0.6)", textShadowRadius: 4, textShadowOffset: { width: 0, height: 1 } },
  // Kullanici: "Altındaki beyaz çizgiyi kaldırsak" - alt cizgi KALDIRILDI.
  stickerInput: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "800",
    minWidth: 60,
    padding: 0,
    outlineWidth: 0,
    outlineStyle: "none",
  } as any,
  trashButton: {
    position: "absolute",
    bottom: 14,
    alignSelf: "center",
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(40,40,40,0.85)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  trashButtonHot: { backgroundColor: "#FF3B30", borderColor: "#FF3B30", transform: [{ scale: 1.15 }] },
  drawToolsRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 18, paddingBottom: 10 },
  colorDot: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: "transparent" },
  colorDotActive: { borderColor: "#FFFFFF" },
  stickerToolsScroll: { maxHeight: 48, marginBottom: 6 },
  stickerToolsRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 18 },
  stickerToolsDivider: { width: 1, height: 22, backgroundColor: "rgba(255,255,255,0.2)" },
  fontChip: {
    minWidth: 36,
    height: 32,
    paddingHorizontal: 8,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.1)",
    borderWidth: 1.5,
    borderColor: "transparent",
  },
  fontChipActive: { borderColor: "#FFFFFF", backgroundColor: "rgba(255,255,255,0.2)" },
  fontChipText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  thumbStripScroll: { maxHeight: 70, marginBottom: 6 },
  thumbStrip: { flexDirection: "row", gap: 8, paddingHorizontal: 18, alignItems: "center" },
  thumbCell: { width: 54, height: 54, borderRadius: 10, overflow: "hidden", borderWidth: 2, borderColor: "transparent" },
  thumbCellActive: { borderColor: theme.accent },
  thumbImage: { width: "100%", height: "100%" },
  thumbRemove: { position: "absolute", top: 2, right: 2, width: 16, height: 16, borderRadius: 8, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center" },
  thumbAdd: { width: 54, height: 54, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.1)", alignItems: "center", justifyContent: "center" },
  emojiGrid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 14, paddingBottom: 6, gap: 2 },
  emojiCell: { width: "12.5%", aspectRatio: 1, alignItems: "center", justifyContent: "center" },
  emojiCellText: { fontSize: 22 },
  composerRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 18, paddingBottom: 24, paddingTop: 8 },
  emojiToggle: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  captionBox: { flex: 1, backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 18, paddingHorizontal: 14, paddingVertical: 6, maxHeight: 70, justifyContent: "center" },
  captionInput: {
    color: theme.text,
    fontSize: 14,
    paddingVertical: 0,
    includeFontPadding: false,
    textAlignVertical: "center",
    outlineWidth: 0,
    outlineStyle: "none",
  } as any,
  sendCircle: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: theme.accent },
  sendProgressText: { color: "#FFFFFF", fontSize: 11, fontWeight: "800" },
});
