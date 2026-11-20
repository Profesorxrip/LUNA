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
import { LinearGradient } from "expo-linear-gradient";
import { captureRef } from "react-native-view-shot";
import * as ImageManipulator from "expo-image-manipulator";
import Svg, { Path } from "react-native-svg";
import { RotateCw, ArrowLeftRight, Crop, PenLine, Type, Plus, X, Check, FaceGrinning, Trash2, Send, CircleArrowDown } from "lucide-react-native";
import { MicrophoneIcon } from "react-native-heroicons/outline";
import { useFonts, Inter_700Bold } from "@expo-google-fonts/inter";
import { Sora_700Bold } from "@expo-google-fonts/sora";
import { BebasNeue_400Regular } from "@expo-google-fonts/bebas-neue";
import { Rubik_700Bold } from "@expo-google-fonts/rubik";
import { Oswald_700Bold } from "@expo-google-fonts/oswald";
import { Pacifico_400Regular } from "@expo-google-fonts/pacifico";
import { PlayfairDisplay_700Bold } from "@expo-google-fonts/playfair-display";
import { Poppins_700Bold } from "@expo-google-fonts/poppins";
import { Caveat_700Bold } from "@expo-google-fonts/caveat";
import { RobotoMono_700Bold } from "@expo-google-fonts/roboto-mono";
import { Lobster_400Regular } from "@expo-google-fonts/lobster";
import { Anton_400Regular } from "@expo-google-fonts/anton";
import { DancingScript_700Bold } from "@expo-google-fonts/dancing-script";
import { PermanentMarker_400Regular } from "@expo-google-fonts/permanent-marker";
import { theme } from "../theme";

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

const EMOJI_QUICK = ["😀", "😂", "😍", "😎", "🥳", "😢", "😮", "🔥", "❤️", "👍", "🙏", "🎉", "😡", "😴", "🤔", "👀"];
const STICKER_COLORS = [
  "#FFFFFF", "#000000", "#9CA3AF", "#FF3B30", "#FF9F0A", "#FFD60A",
  "#34C759", "#06D6A0", "#0A84FF", "#5AC8FA", "#6366F1", "#BF5AF2",
  "#FF2D55", "#F472B6",
];
// Kullanici: "Renk paleti profesyonellikten uzak, kendi renklerimizi
// oluşturamıyoruz" - gokkusagi dugmesi artik sabit bir renk listesi degil,
// GERCEK bir HSV secici (doygunluk/parlaklik karesi + ton cubugu + hex
// girisi) acıyor, bkz. asagidaki hsvToRgb/rgbToHex/hexToHsv ve picker
// state'i (pickerHue/pickerSat/pickerVal/pickerHexText).
const STICKER_FONTS: { id: string; label: string; family?: string }[] = [
  { id: "default", label: "Aa" },
  { id: "inter", label: "Aa", family: "Inter_700Bold" },
  { id: "sora", label: "Aa", family: "Sora_700Bold" },
  { id: "bebas", label: "AA", family: "BebasNeue_400Regular" },
  { id: "rubik", label: "Aa", family: "Rubik_700Bold" },
  { id: "oswald", label: "Aa", family: "Oswald_700Bold" },
  { id: "poppins", label: "Aa", family: "Poppins_700Bold" },
  { id: "anton", label: "AA", family: "Anton_400Regular" },
  { id: "playfair", label: "Aa", family: "PlayfairDisplay_700Bold" },
  { id: "pacifico", label: "Aa", family: "Pacifico_400Regular" },
  { id: "lobster", label: "Aa", family: "Lobster_400Regular" },
  { id: "dancing", label: "Aa", family: "DancingScript_700Bold" },
  { id: "caveat", label: "Aa", family: "Caveat_700Bold" },
  { id: "marker", label: "Aa", family: "PermanentMarker_400Regular" },
  { id: "mono", label: "Aa", family: "RobotoMono_700Bold" },
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

// Kullanici: "Kendi renklerimizi felan oluşturamamız çok kötü" - sabit 28
// renklik bir izgara yerine GERCEK bir HSV renk secici (doygunluk/parlaklik
// karesi + ton cubugu + hex girisi) - herhangi bir rengi uretebiliyoruz.
function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}
function rgbToHex(r: number, g: number, b: number): string {
  return (
    "#" +
    [r, g, b]
      .map((n) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase()
  );
}
function hexToRgb(hex: string): [number, number, number] | null {
  const clean = hex.replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return null;
  const m = clean.match(/.{1,2}/g);
  if (!m) return null;
  const [r, g, b] = m.map((h) => parseInt(h, 16));
  return [r, g, b];
}
function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === rn) h = 60 * (((gn - bn) / d) % 6);
    else if (max === gn) h = 60 * ((bn - rn) / d + 2);
    else h = 60 * ((rn - gn) / d + 4);
  }
  if (h < 0) h += 360;
  const s = max === 0 ? 0 : d / max;
  return [h, s, max];
}
function hexToHsv(hex: string): [number, number, number] {
  const rgb = hexToRgb(hex);
  if (!rgb) return [0, 0, 1];
  return rgbToHsv(...rgb);
}

type Rect = { x: number; y: number; width: number; height: number };

// "contain" resizeMode'daki bir Image'in GERCEKTEN kapladigi (letterbox
// haric) alani hesapliyor - elle kirpma cercevesinin sinirlarini (imgRect)
// bulmak icin.
function computeContainRect(origW: number, origH: number, containerW: number, containerH: number): Rect {
  if (!origW || !origH || !containerW || !containerH) return { x: 0, y: 0, width: containerW, height: containerH };
  const scale = Math.min(containerW / origW, containerH / origH);
  const width = origW * scale;
  const height = origH * scale;
  return { x: (containerW - width) / 2, y: (containerH - height) / 2, width, height };
}

const CROP_MIN_SIZE = 60;

function clampCropRect(rect: Rect, bounds: Rect): Rect {
  let { x, y, width, height } = rect;
  width = clamp(width, CROP_MIN_SIZE, bounds.width);
  height = clamp(height, CROP_MIN_SIZE, bounds.height);
  x = clamp(x, bounds.x, bounds.x + bounds.width - width);
  y = clamp(y, bounds.y, bounds.y + bounds.height - height);
  return { x, y, width, height };
}

// Kose tutamaclarindan biri suruklenince cercevenin o kosesini buyutup
// kuculturken KARSI kenari SABIT tutuyor (klasik kirpma araci davranisi).
function resizeCropRect(rect: Rect, corner: "tl" | "tr" | "bl" | "br", dx: number, dy: number, bounds: Rect): Rect {
  let { x, y, width, height } = rect;
  if (corner === "tl") {
    x += dx;
    y += dy;
    width -= dx;
    height -= dy;
  } else if (corner === "tr") {
    y += dy;
    width += dx;
    height -= dy;
  } else if (corner === "bl") {
    x += dx;
    width -= dx;
    height += dy;
  } else {
    width += dx;
    height += dy;
  }
  if (width < CROP_MIN_SIZE) {
    if (corner === "tl" || corner === "bl") x -= CROP_MIN_SIZE - width;
    width = CROP_MIN_SIZE;
  }
  if (height < CROP_MIN_SIZE) {
    if (corner === "tl" || corner === "tr") y -= CROP_MIN_SIZE - height;
    height = CROP_MIN_SIZE;
  }
  if (x < bounds.x) {
    width -= bounds.x - x;
    x = bounds.x;
  }
  if (y < bounds.y) {
    height -= bounds.y - y;
    y = bounds.y;
  }
  if (x + width > bounds.x + bounds.width) width = bounds.x + bounds.width - x;
  if (y + height > bounds.y + bounds.height) height = bounds.y + bounds.height - y;
  width = Math.max(width, CROP_MIN_SIZE);
  height = Math.max(height, CROP_MIN_SIZE);
  return { x, y, width, height };
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
  useFonts({
    Inter_700Bold,
    Sora_700Bold,
    BebasNeue_400Regular,
    Rubik_700Bold,
    Oswald_700Bold,
    Pacifico_400Regular,
    PlayfairDisplay_700Bold,
    Poppins_700Bold,
    Caveat_700Bold,
    RobotoMono_700Bold,
    Lobster_400Regular,
    Anton_400Regular,
    DancingScript_700Bold,
    PermanentMarker_400Regular,
  });
  const [activeIndex, setActiveIndex] = useState(0);
  const [caption, setCaption] = useState("");
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [drawColor, setDrawColor] = useState("#FFFFFF");
  const [editingStickerId, setEditingStickerId] = useState<string | null>(null);
  // Kullanici: "...rengini ve fontunu değiltirebildiğimiz bir alanda
  // olmalı" - renk/font araclari "editingStickerId" (sadece metin kutusu
  // odaktayken) yerine "selectedStickerId"ye bagli: boylece bir renge
  // dokununca TextInput blur olup editingStickerId sifirlansa bile
  // (tarayicinin dogal davranisi) arac cubugu KAYBOLMUYOR - sticker hala
  // "secili" kalip rengi/fontu degistirilebiliyor. Bos bir yere dokununca
  // (previewResponder'in "tap" algilamasi) secim kaldiriliyor.
  const [selectedStickerId, setSelectedStickerId] = useState<string | null>(null);
  const [colorPaletteOpen, setColorPaletteOpen] = useState(false);
  // Renk paleti HEM metin etiketi HEM de cizim rengi icin kullanilan ORTAK
  // bir sheet - hangisini degistirecegini bu anahtar belirliyor.
  const [colorPickerTarget, setColorPickerTarget] = useState<"sticker" | "draw">("sticker");
  // Gercek HSV secici - ton (0-359), doygunluk/parlaklik (0-1) ve bunlardan
  // turetilen hex. svSize/hueBarSize dokunma konumunu orana cevirmek icin
  // onLayout ile olculuyor (ekran genisligine gore degisebilir).
  const [pickerHue, setPickerHue] = useState(0);
  const [pickerSat, setPickerSat] = useState(1);
  const [pickerVal, setPickerVal] = useState(1);
  const [pickerHexText, setPickerHexText] = useState("#FF0000");
  const [svSize, setSvSize] = useState({ width: 1, height: 1 });
  const [hueBarWidth, setHueBarWidth] = useState(1);
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

  // Kullanici: "Kırpma işi çıkarmalı, insanlar eliyle ayarlayabilmeli" -
  // tek dokunuşla ortadan kare kırpma yerine GERCEK, elle suruklenip
  // kosalerinden buyutulup kuculebilen bir kirpma cercevesi. "cropRect"
  // ve "imgRect" shotArea'nin KENDI yerel piksel uzayinda (areaSize ile
  // AYNI olcek) - imgRect, "contain" modunda resmin GERCEKTEN kapladigi
  // (harf kutusu/letterbox haric) alan; cropRect kullanicinin surukledigi
  // cerceve, her zaman imgRect icine sikistiriliyor.
  const [cropping, setCropping] = useState(false);
  const [cropRect, setCropRect] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const [imgRect, setImgRect] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const [cropOrigSize, setCropOrigSize] = useState({ width: 1, height: 1 });

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

  // Kullanici: "Fotoğraf kırpma alanı tam bir ekran olmalı" - kirpma
  // moduna girerken alt mesaj cubugu/emoji gibi alanlar gizleniyor, bu
  // da onizleme alaninin (areaSize) BUYUMESINE sebep oluyor. imgRect/
  // cropRect o anki areaSize ile hesaplanmisti, bu yuzden boyut
  // degisince (composer kaybolup previewWrap genisleyince) GUNCEL,
  // GENISLEMIS alana gore yeniden hesaplaniyor.
  useEffect(() => {
    if (!cropping || !areaSize.width || !areaSize.height) return;
    const rect = computeContainRect(cropOrigSize.width, cropOrigSize.height, areaSize.width, areaSize.height);
    setImgRect(rect);
    setCropRect(rect);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cropping, areaSize.width, areaSize.height]);

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

  // "T" ve kalemde oldugu gibi kirpma da bir MOD: ikona basinca cerceve
  // belirir, kullanici kenarlarindan/kosalerinden eliyle ayarlar, Tamam'a
  // basinca GERCEKTEN kirpilir (ImageManipulator ile, piksel bazinda).
  async function enterCropMode() {
    const uri = images[activeIndex];
    if (!uri || busy || !areaSize.width || !areaSize.height) return;
    try {
      const size = await new Promise<{ width: number; height: number }>((resolve, reject) => {
        Image.getSize(uri, (width, height) => resolve({ width, height }), reject);
      });
      setCropOrigSize(size);
      const rect = computeContainRect(size.width, size.height, areaSize.width, areaSize.height);
      setImgRect(rect);
      setCropRect(rect);
      setCropping(true);
    } catch (err) {
      console.error("kirpma modu acilamadi:", err);
    }
  }
  function cancelCropMode() {
    setCropping(false);
  }
  async function confirmCrop() {
    const uri = images[activeIndex];
    if (!uri || busy) return;
    setBusy(true);
    try {
      const scale = imgRect.width / cropOrigSize.width;
      const originX = clamp(Math.round((cropRect.x - imgRect.x) / scale), 0, cropOrigSize.width - 1);
      const originY = clamp(Math.round((cropRect.y - imgRect.y) / scale), 0, cropOrigSize.height - 1);
      const width = clamp(Math.round(cropRect.width / scale), 1, cropOrigSize.width - originX);
      const height = clamp(Math.round(cropRect.height / scale), 1, cropOrigSize.height - originY);
      const result = await ImageManipulator.manipulateAsync(uri, [{ crop: { originX, originY, width, height } }], {
        compress: 0.9,
        format: ImageManipulator.SaveFormat.JPEG,
      });
      onReplaceImage(activeIndex, result.uri);
      setCropping(false);
    } catch (err) {
      console.error("kirpma basarisiz:", err);
    } finally {
      setBusy(false);
    }
  }
  // NOT useRef: dosyadaki diger surukleme responder'lariyla (StickerView,
  // HSV secici) AYNI sebepten - her render'da YENIDEN kuruluyor ki
  // cropRect/imgRect KAPANISLARI her zaman GUNCEL olsun, ve gestureState.dx/dy
  // bu yuzden TOPLAM degil bir onceki kareden bu yana olan KUCUK artis.
  const cropMoveResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderMove: (_evt, g) => {
      setCropRect((prev) => clampCropRect({ ...prev, x: prev.x + g.dx, y: prev.y + g.dy }, imgRect));
    },
  });
  function makeCropCornerResponder(corner: "tl" | "tr" | "bl" | "br") {
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (_evt, g) => {
        setCropRect((prev) => resizeCropRect(prev, corner, g.dx, g.dy, imgRect));
      },
    });
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
  // HSV secicideki kare/ton cubugu suruklenirken CANLI olarak cagriliyor -
  // hem secili etiketin gercek rengini (onizleme icin) hem de picker'in
  // kendi hue/sat/val + hex durumunu gunceller.
  function applyPickerHsv(h: number, s: number, v: number) {
    setPickerHue(h);
    setPickerSat(s);
    setPickerVal(v);
    const [r, g, b] = hsvToRgb(h, s, v);
    const hex = rgbToHex(r, g, b);
    setPickerHexText(hex);
    if (colorPickerTarget === "draw") setDrawColor(hex);
    else if (selectedStickerId) changeStickerColor(selectedStickerId, hex);
  }
  function applyPickerHex(text: string) {
    setPickerHexText(text);
    const clean = text.startsWith("#") ? text : `#${text}`;
    const rgb = hexToRgb(clean);
    if (!rgb) return;
    const [h, s, v] = rgbToHsv(...rgb);
    setPickerHue(h);
    setPickerSat(s);
    setPickerVal(v);
    if (colorPickerTarget === "draw") setDrawColor(clean.toUpperCase());
    else if (selectedStickerId) changeStickerColor(selectedStickerId, clean.toUpperCase());
  }
  // NOT useRef: StickerView'daki ayni notla ayni sebepten (bkz. dosya
  // basi) - bu PanResponder'lar her render'da YENIDEN kuruluyor ki
  // pickerHue/Sat/Val/svSize/hueBarWidth KAPANISLARI her zaman GUNCEL olsun.
  const svResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (evt) => {
      const { locationX, locationY } = evt.nativeEvent;
      applyPickerHsv(pickerHue, clamp(locationX / svSize.width, 0, 1), clamp(1 - locationY / svSize.height, 0, 1));
    },
    onPanResponderMove: (evt) => {
      const { locationX, locationY } = evt.nativeEvent;
      applyPickerHsv(pickerHue, clamp(locationX / svSize.width, 0, 1), clamp(1 - locationY / svSize.height, 0, 1));
    },
  });
  const hueResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (evt) => {
      applyPickerHsv(clamp(evt.nativeEvent.locationX / hueBarWidth, 0, 1) * 359, pickerSat, pickerVal);
    },
    onPanResponderMove: (evt) => {
      applyPickerHsv(clamp(evt.nativeEvent.locationX / hueBarWidth, 0, 1) * 359, pickerSat, pickerVal);
    },
  });
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
      <KeyboardAvoidingView style={[styles.screen, cropping && styles.screenCropping]} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        {!cropping && (
          <View style={styles.header}>
            <TouchableOpacity style={styles.iconTouch} onPress={onCancel} disabled={uploading} hitSlop={10}>
              <View style={{ transform: [{ rotate: "90deg" }] }}>
                <CircleArrowDown size={22} color={theme.text} />
              </View>
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
              <TouchableOpacity style={styles.iconTouch} onPress={enterCropMode} disabled={busy || uploading} hitSlop={6}>
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
        )}

        <View style={styles.previewWrap}>
          <View
            ref={viewShotRef}
            collapsable={false}
            style={[styles.shotArea, cropping && styles.shotAreaCropped]}
            onLayout={(e) => setAreaSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
            {...(cropping ? {} : drawing ? drawResponder.panHandlers : previewResponder.panHandlers)}
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
            {cropping && (
              <>
                {/* Cerceve DISINDAKI 4 bolgeyi karartiyor - "delikli" bir
                    maske yerine, cercevenin disini kaplayan 4 ayri dikdortgen. */}
                <View pointerEvents="none" style={[styles.cropDim, { left: 0, top: 0, width: areaSize.width, height: cropRect.y }]} />
                <View
                  pointerEvents="none"
                  style={[
                    styles.cropDim,
                    { left: 0, top: cropRect.y + cropRect.height, width: areaSize.width, height: areaSize.height - cropRect.y - cropRect.height },
                  ]}
                />
                <View pointerEvents="none" style={[styles.cropDim, { left: 0, top: cropRect.y, width: cropRect.x, height: cropRect.height }]} />
                <View
                  pointerEvents="none"
                  style={[
                    styles.cropDim,
                    { left: cropRect.x + cropRect.width, top: cropRect.y, width: areaSize.width - cropRect.x - cropRect.width, height: cropRect.height },
                  ]}
                />
                {/* Cercevenin KENDISI - suruklenince TASIR (kose tutamaclari HARIC). */}
                <View
                  style={[styles.cropFrame, { left: cropRect.x, top: cropRect.y, width: cropRect.width, height: cropRect.height }]}
                  {...cropMoveResponder.panHandlers}
                >
                  <View style={[styles.cropGridLine, { left: "33.333%", top: 0, bottom: 0, width: 1 }]} />
                  <View style={[styles.cropGridLine, { left: "66.666%", top: 0, bottom: 0, width: 1 }]} />
                  <View style={[styles.cropGridLine, { top: "33.333%", left: 0, right: 0, height: 1 }]} />
                  <View style={[styles.cropGridLine, { top: "66.666%", left: 0, right: 0, height: 1 }]} />
                </View>
                {([
                  ["tl", cropRect.x, cropRect.y],
                  ["tr", cropRect.x + cropRect.width, cropRect.y],
                  ["bl", cropRect.x, cropRect.y + cropRect.height],
                  ["br", cropRect.x + cropRect.width, cropRect.y + cropRect.height],
                ] as const).map(([corner, cx, cy]) => {
                  // Cercevenin disina tasip shotArea'nin (overflow:hidden)
                  // kenarinda KIRPILMAMASI icin parantez kollari HER ZAMAN
                  // kose noktasindan cercevenin ICINE dogru uzaniyor - disari
                  // degil (bkz. asagidaki isTop/isLeft'e gore left/top 0|16).
                  const isTop = corner === "tl" || corner === "tr";
                  const isLeft = corner === "tl" || corner === "bl";
                  return (
                    <View key={corner} style={[styles.cropHandle, { left: cx - 16, top: cy - 16 }]} {...makeCropCornerResponder(corner).panHandlers}>
                      <View style={[styles.cropBracketH, { top: 14 }, isLeft ? { left: 16 } : { left: 0 }]} />
                      <View style={[styles.cropBracketV, { left: 14 }, isTop ? { top: 16 } : { top: 0 }]} />
                    </View>
                  );
                })}
              </>
            )}
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

        {!drawing && !cropping && selectedStickerId && edits.stickers.some((s) => s.id === selectedStickerId) && (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.stickerToolsScroll} contentContainerStyle={styles.stickerToolsRow}>
              {STICKER_COLORS.map((c) => {
                return (
                  <TouchableOpacity
                    key={c}
                    testID={`sticker-color-${c}`}
                    style={[styles.colorDot, { backgroundColor: c, borderColor: c === "#FFFFFF" ? "#000000" : "#FFFFFF" }]}
                    onPress={() => changeStickerColor(selectedStickerId, c)}
                  />
                );
              })}
              <TouchableOpacity
                testID="sticker-color-rainbow"
                onPress={() => {
                  const activeSticker = edits.stickers.find((s) => s.id === selectedStickerId);
                  const [h, s, v] = hexToHsv(activeSticker?.color ?? "#FF0000");
                  setPickerHue(h);
                  setPickerSat(s);
                  setPickerVal(v);
                  setPickerHexText((activeSticker?.color ?? "#FF0000").toUpperCase());
                  setColorPickerTarget("sticker");
                  setColorPaletteOpen(true);
                }}
                style={[styles.colorDot, { borderColor: "#FFFFFF" }]}
              >
                <LinearGradient
                  colors={["#FF3B30", "#FFD60A", "#34C759", "#0A84FF", "#BF5AF2", "#FF2D55"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />
              </TouchableOpacity>
            </ScrollView>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.stickerToolsScroll} contentContainerStyle={styles.stickerToolsRow}>
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
          </>
        )}

        {drawing && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.stickerToolsScroll} contentContainerStyle={styles.stickerToolsRow}>
            {STICKER_COLORS.map((c) => (
              <TouchableOpacity
                key={c}
                testID={`draw-color-${c}`}
                style={[styles.colorDot, { backgroundColor: c, borderColor: c === "#FFFFFF" ? "#000000" : "#FFFFFF" }]}
                onPress={() => setDrawColor(c)}
              />
            ))}
            <TouchableOpacity
              testID="draw-color-rainbow"
              onPress={() => {
                const [h, s, v] = hexToHsv(drawColor);
                setPickerHue(h);
                setPickerSat(s);
                setPickerVal(v);
                setPickerHexText(drawColor.toUpperCase());
                setColorPickerTarget("draw");
                setColorPaletteOpen(true);
              }}
              style={[styles.colorDot, { borderColor: "#FFFFFF" }]}
            >
              <LinearGradient
                colors={["#FF3B30", "#FFD60A", "#34C759", "#0A84FF", "#BF5AF2", "#FF2D55"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
            </TouchableOpacity>
          </ScrollView>
        )}

        {cropping && (
          <View style={styles.cropToolsRow}>
            <TouchableOpacity testID="crop-cancel" style={styles.cropActionBtn} onPress={cancelCropMode} disabled={busy} hitSlop={8}>
              <X size={20} color={theme.text} />
            </TouchableOpacity>
            <Text style={styles.cropHintText}>{t("sendMedia.cropHint")}</Text>
            <TouchableOpacity
              testID="crop-confirm"
              style={[styles.cropActionBtn, styles.cropActionBtnConfirm]}
              onPress={confirmCrop}
              disabled={busy}
              hitSlop={8}
            >
              <Check size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        )}

        {images.length > 1 && !cropping && (
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

        {emojiOpen && !cropping && (
          <View style={styles.emojiGrid}>
            {EMOJI_QUICK.map((e) => (
              <TouchableOpacity key={e} style={styles.emojiCell} onPress={() => setCaption((prev) => prev + e)}>
                <Text style={styles.emojiCellText}>{e}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {!cropping && (
          <View style={styles.composerRow}>
            <View style={styles.captionBox}>
              <TouchableOpacity onPress={() => setEmojiOpen((o) => !o)} hitSlop={6}>
                <FaceGrinning size={22} color="#9A8F80" />
              </TouchableOpacity>
              <TextInput
                style={styles.captionInput}
                value={caption}
                onChangeText={setCaption}
                placeholder={t("sendMedia.captionPlaceholder")}
                placeholderTextColor="#9A8F80"
                editable={!uploading}
                maxLength={1000}
              />
            </View>
            <TouchableOpacity style={styles.sendCircle} onPress={handleSend} disabled={uploading || images.length === 0} hitSlop={6}>
              {uploading ? (
                <Text style={styles.sendProgressText}>{uploadProgress}%</Text>
              ) : caption.trim() ? (
                <Send size={20} color="#141210" />
              ) : (
                <MicrophoneIcon size={22.5} color="#141210" strokeWidth={2} />
              )}
            </TouchableOpacity>
          </View>
        )}

        <Modal visible={colorPaletteOpen} transparent animationType="slide" onRequestClose={() => setColorPaletteOpen(false)} statusBarTranslucent>
          <TouchableOpacity style={styles.paletteOverlay} activeOpacity={1} onPress={() => setColorPaletteOpen(false)}>
            <TouchableOpacity activeOpacity={1} style={styles.paletteCard}>
              <View style={styles.sheetHandleTop} />

              {/* Doygunluk (sat) / parlaklik (val) karesi - saf ton rengi
                  uzerine beyaz->seffaf (yatay) ve seffaf->siyah (dikey) iki
                  gradyan bindirilerek klasik HSV karesi elde ediliyor. */}
              <View
                style={styles.svSquare}
                onLayout={(e) => setSvSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
                {...svResponder.panHandlers}
              >
                <View style={[StyleSheet.absoluteFill, { backgroundColor: rgbToHex(...hsvToRgb(pickerHue, 1, 1)) }]} />
                <LinearGradient colors={["#FFFFFF", "rgba(255,255,255,0)"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
                <LinearGradient colors={["rgba(0,0,0,0)", "#000000"]} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} />
                <View
                  pointerEvents="none"
                  style={[
                    styles.svThumb,
                    { left: pickerSat * svSize.width - 10, top: (1 - pickerVal) * svSize.height - 10, backgroundColor: pickerHexText },
                  ]}
                />
              </View>

              {/* Ton (hue) cubugu - tam renk spektrumu */}
              <View style={styles.hueBar} onLayout={(e) => setHueBarWidth(e.nativeEvent.layout.width)} {...hueResponder.panHandlers}>
                <LinearGradient
                  colors={["#FF0000", "#FFFF00", "#00FF00", "#00FFFF", "#0000FF", "#FF00FF", "#FF0000"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={StyleSheet.absoluteFill}
                />
                <View pointerEvents="none" style={[styles.hueThumb, { left: (pickerHue / 360) * hueBarWidth - 11 }]} />
              </View>

              {/* Canli onizleme + hex girisi - istenilen rengi dogrudan da yazabiliyoruz */}
              <View style={styles.hexRow}>
                <View style={[styles.hexPreview, { backgroundColor: pickerHexText }]} />
                <TextInput
                  style={styles.hexInput}
                  value={pickerHexText}
                  onChangeText={applyPickerHex}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  maxLength={7}
                  placeholder="#FFFFFF"
                  placeholderTextColor="#6B7280"
                />
              </View>

              <View style={styles.paletteQuickRow}>
                {STICKER_COLORS.map((c) => (
                  <TouchableOpacity
                    key={c}
                    testID={`palette-color-${c}`}
                    style={[styles.paletteSwatch, { backgroundColor: c, borderColor: c === "#FFFFFF" ? "#000000" : "#FFFFFF" }]}
                    onPress={() => applyPickerHsv(...hexToHsv(c))}
                  />
                ))}
              </View>

              <LinearGradient colors={["#FFFFFF", "#38BDF8"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.paletteDoneGradientBorder}>
                <TouchableOpacity style={styles.paletteDoneBtnDark} onPress={() => setColorPaletteOpen(false)}>
                  <Text style={styles.paletteDoneBtnDarkText}>{t("sendMedia.colorPaletteDone")}</Text>
                </TouchableOpacity>
              </LinearGradient>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#000000" },
  // Kullanici: "Alttaki alanda gri olmalı" - gri artik previewWrap'a degil
  // KOKTEKI screen'e uygulaniyor, boylece hem onizlemenin kenarlari HEM DE
  // alttaki iptal/onay satirinin ARKA PLANI ayni gri.
  screenCropping: { backgroundColor: "#2C2C2E" },
  header: { paddingTop: 50, paddingHorizontal: 14, paddingBottom: 8, flexDirection: "row", alignItems: "center", gap: 6 },
  iconTouch: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 18 },
  iconTouchActive: { backgroundColor: "rgba(255,255,255,0.18)" },
  counterText: { color: theme.textMuted, fontSize: 12, fontWeight: "700" },
  toolbarRow: { flexDirection: "row", marginLeft: "auto", gap: 2 },
  previewWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  shotArea: { width: "100%", height: "100%", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  // Kullanici: "ekran içinde ekrandan biraz küçük bir çerçeve olmalı ve
  // fotoğraf onun içine sığmalı" - shotArea'nin KENDISI bu sabit cerceve;
  // fotograf "contain" ile KENDI oranini koruyarak bu cercevenin ICINE
  // kuculup sigiyor (cerceve fotografin sekline gore DEGISMIYOR, tam tersi).
  // "Çerçeveyi biraz küçültürmüsün" - 92%'den 86%'ya kucultuldu. Kullanici
  // "alttaki alan gri olmali" derken EKRANIN ALT KISMINI (cropToolsRow'un
  // arka plani, bkz. screenCropping) kastetti - cercevenin KENDI ICI
  // (fotografin oturdugu "sahne") SIYAH kalmaya devam ediyor.
  shotAreaCropped: { width: "86%", height: "86%", backgroundColor: "#000000" },
  preview: { width: "100%", height: "100%" },
  busyOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.35)" },
  // Elle kirpma cercevesi - disini karartan 4 dikdortgen, cercevenin
  // kendisi (suruklenince tasir) + ic izgara, ve 4 kose tutamaci.
  cropDim: { position: "absolute", backgroundColor: "rgba(0,0,0,0.55)" },
  cropFrame: { position: "absolute", borderWidth: 2, borderColor: "#FFFFFF" },
  cropGridLine: { position: "absolute", backgroundColor: "rgba(255,255,255,0.35)" },
  // Kullanici: "kenarları kalın olsa şeklini korusa" - yuvarlak nokta
  // yerine kalin "L" seklinde kose parantezleri (klasik kirpma UI dili),
  // her biri kendi koordinatindaki (top/bottom + left/right) iki kalin
  // cubuktan olusuyor.
  cropHandle: { position: "absolute", width: 32, height: 32 },
  cropBracketH: { position: "absolute", width: 16, height: 4, backgroundColor: "#FFFFFF", borderRadius: 2 },
  cropBracketV: { position: "absolute", width: 4, height: 16, backgroundColor: "#FFFFFF", borderRadius: 2 },
  cropToolsRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 18, paddingBottom: 10, gap: 10 },
  cropActionBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.12)",
    transform: [{ translateY: -15 }],
  },
  cropActionBtnConfirm: { backgroundColor: theme.accent },
  cropHintText: { color: "#FFFFFF", fontSize: 12.5, flex: 1, textAlign: "center", transform: [{ translateY: -15 }] },
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
  // Kullanici: "hepsinin beyaz çerçevesi olsun beyaz olanında siyah" - her
  // rengin KENDI varsayilan cercevesi artik beyaz (beyaz rengin kendisi
  // SIYAH, yoksa fark edilmez); secili olan ise accent renginde, daha
  // kalin bir cerceveyle ayirt ediliyor (bkz. kullanim yerlerindeki
  // borderColor hesaplamasi).
  colorDot: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, overflow: "hidden" },
  colorDotActive: { borderColor: theme.accent, borderWidth: 3 },
  stickerToolsScroll: { maxHeight: 48, marginBottom: 6 },
  stickerToolsRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 18 },
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
  composerRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingBottom: 24, paddingTop: 8 },
  // Ana DM ekranindaki mesaj cubuguyla (inputPill) AYNI stil - koyu lacivert
  // hap, emoji ikonu icerde solda, metin yaninda (bkz. DMScreen.tsx).
  captionBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#15202B",
    borderRadius: 27.5,
    height: 55,
    paddingLeft: 14,
    paddingRight: 10,
  },
  captionInput: {
    flex: 1,
    color: theme.text,
    fontSize: 14,
    paddingTop: 7,
    paddingBottom: 6,
    outlineWidth: 0,
    outlineStyle: "none",
  } as any,
  sendCircle: { width: 55, height: 55, borderRadius: 27.5, alignItems: "center", justifyContent: "center", backgroundColor: "#FFFFFF" },
  sendProgressText: { color: "#141210", fontSize: 11, fontWeight: "800" },
  // Gokkusagi dugmesiyle acilan tam renk paleti - DM ekranindaki sheet
  // diliyle (sheetOverlay/sheetCard) AYNI stil.
  paletteOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  paletteCard: {
    backgroundColor: "#15202B",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingTop: 18,
    paddingBottom: 30,
    paddingHorizontal: 20,
    alignItems: "stretch",
  },
  sheetHandleTop: { width: 40, height: 4, borderRadius: 2, backgroundColor: "#3A4C5E", marginBottom: 18, alignSelf: "center" },
  paletteSwatch: { width: 36, height: 36, borderRadius: 18, borderWidth: 2 },
  // HSV secici: doygunluk/parlaklik karesi - onizleme icindeki thumb'in
  // kendi borderWidth'i (beyaz halka) icindeki renk dolgusu CANLI secimi gosterir.
  svSquare: { width: "100%", height: 180, borderRadius: 14, overflow: "hidden", marginBottom: 14 },
  svThumb: {
    position: "absolute",
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 3,
    borderColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  hueBar: { width: "100%", height: 24, borderRadius: 12, overflow: "hidden", marginBottom: 16 },
  hueThumb: {
    position: "absolute",
    top: 1,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 3,
    borderColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  hexRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 18 },
  hexPreview: { width: 36, height: 36, borderRadius: 8, borderWidth: 1, borderColor: "rgba(255,255,255,0.2)" },
  hexInput: {
    flex: 1,
    color: theme.text,
    fontSize: 16,
    fontWeight: "700",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    outlineWidth: 0,
    outlineStyle: "none",
  } as any,
  paletteQuickRow: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 20 },
  // Sikayet formundaki gonder dugmesiyle (DMScreen.tsx reportSubmitGradientBorder)
  // AYNI stil - mavi-beyaz gradyan cerceve, icinde siyah dolgu.
  paletteDoneGradientBorder: { borderRadius: 10, padding: 2 },
  paletteDoneBtnDark: { backgroundColor: "#000000", borderRadius: 8, paddingVertical: 14, alignItems: "center" },
  paletteDoneBtnDarkText: { color: "#FFFFFF", fontSize: 14, fontWeight: "800", letterSpacing: 0.2, textTransform: "uppercase" },
});
