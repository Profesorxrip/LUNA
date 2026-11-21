import React, { useEffect, useRef, useState } from "react";
import { Modal, View, Text, Image, TextInput, TouchableOpacity, StyleSheet, PanResponder, ScrollView, LayoutChangeEvent } from "react-native";
import { useTranslation } from "react-i18next";
import { useVideoPlayer, VideoView } from "expo-video";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Path } from "react-native-svg";
import { CircleArrowDown, Play, Send, RotateCw, Crop, PenLine, Type, X, Check, FaceGrinning } from "lucide-react-native";
import Icon from "./Icon";
import { VoiceOnceRingIcon, VoiceOnceFilledIcon } from "./CustomIcons";
import { theme } from "../theme";
import { formatDuration, formatFileSize } from "../utils/format";
import { getVideoThumbnails, getFileSizeBytes, getVideoNaturalSize } from "../utils/videoThumbnails";
import { clamp, STICKER_COLORS } from "../utils/colorMath";
import { computeContainRect, clampCropRect, resizeCropRect, type Rect } from "../utils/cropMath";
import { STICKER_FONTS, useStickerFonts } from "../utils/stickerFonts";
import type { StrokePath, TextSticker } from "../utils/mediaEditorTypes";
import StickerView from "./StickerView";
import ColorPalettePickerModal from "./ColorPalettePickerModal";

export interface VideoSendMeta {
  muted: boolean;
  speed: number;
  trimStartMs: number;
  trimEndMs: number;
  rotationDeg: number;
  cropRegion: Rect | null;
  viewOnce: boolean;
  // Kullanici: "en sağ altında gif tuşu olsun ... gife çevirerek
  // atabilelim" - GERCEK bir .gif dosyasina donusturme YOK (bkz. bu
  // dosyanin basindaki "GERCEK dosya baytlarini degistiren... native
  // kutuphane YOK" notu) - trim/rotation/crop ile AYNI yontem: sadece
  // "GIF gibi davransin" (sessiz, otomatik oynayan, dongude) META VERISI.
  isGif: boolean;
}

interface Props {
  visible: boolean;
  uri: string | null;
  uploading: boolean;
  uploadProgress: number;
  onCancel: () => void;
  onSend: (caption: string, meta: VideoSendMeta) => void;
}

const TRIM_MIN_GAP = 0.5; // saniye - kirpma penceresi en az bu kadar genis olmali
const THUMBNAIL_COUNT = 8;
const EMOJI_QUICK = ["😀", "😂", "😍", "😎", "🥳", "😢", "😮", "🔥", "❤️", "👍", "🙏", "🎉", "😡", "😴", "🤔", "👀"];

/** Video gonderme oncesi onizleme/duzenleme ekrani - SendMediaSheet'teki
 * fotograf editoruyle AYNI gorsel dil VE AYNI arac seti (dondur/cevir/kirp/
 * ciz/yazi - ayni renk paleti + font sistemi, bkz. ColorPalettePickerModal/
 * StickerView/utils/colorMath-cropMath-stickerFonts), artı videoya OZGU
 * kirpma/kesme/sessize alma/hiz kontrolleri.
 *
 * GERCEK dosya baytlarini degistiren (transcode eden) bir native kutuphane
 * (FFmpeg vb.) bu projede YOK. Bu yuzden:
 * - Kirpma (kesme) araligi, dondurme, cevirme ve kare-kirpma GERCEKTEN bu
 *   onizlemede uygulanir/gorunur (CSS transform + clip matematigiyle,
 *   piksel transcode OLMADAN) ve mesajla birlikte METADATA olarak gider;
 *   aliciyi gosteren oynaticinin (VideoMessageBubble/VideoViewerModal) da
 *   bu metadatayi uygulayacak sekilde guncellenmesi AYRI bir adim.
 * - Cizim/metin etiketi katmanlari sadece bu onizlemede calisir (video
 *   dosyasina "yakilamaz" - fotografin aksine burada captureRef/flatten
 *   islemi anlamli degildir), gonderilen videoya dahil edilmezler.
 */
export default function SendVideoSheet({ visible, uri, uploading, uploadProgress, onCancel, onSend }: Props) {
  const { t } = useTranslation();
  useStickerFonts();
  const [caption, setCaption] = useState("");
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [viewOnce, setViewOnce] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [isGif, setIsGif] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [trackWidth, setTrackWidth] = useState(1);
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [fileSizeBytes, setFileSizeBytes] = useState<number | null>(null);
  const draggingHandleRef = useRef<"start" | "end" | null>(null);
  const seekingRef = useRef(false);
  const thumbsLoadedForRef = useRef<string | null>(null);

  // Dondur/cevir/kirp/ciz/yazi - fotograf editoruyle AYNI arac seti.
  const [rotationDeg, setRotationDeg] = useState(0);
  const [areaSize, setAreaSize] = useState({ width: 0, height: 0 });
  const [cropping, setCropping] = useState(false);
  const [cropRect, setCropRect] = useState<Rect>({ x: 0, y: 0, width: 0, height: 0 });
  const [imgRect, setImgRect] = useState<Rect>({ x: 0, y: 0, width: 0, height: 0 });
  const [videoNatSize, setVideoNatSize] = useState({ width: 16, height: 9 });
  // Onaylanmis kirpma - videonun DOGAL karesine gore 0..1 oranlarinda
  // (cozunurlukten bagimsiz, oynaticida AYNI oranla yeniden uygulanabilir).
  const [cropRegion, setCropRegion] = useState<Rect | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [drawColor, setDrawColor] = useState("#FFFFFF");
  const [paths, setPaths] = useState<StrokePath[]>([]);
  const [currentPath, setCurrentPath] = useState("");
  const [stickers, setStickers] = useState<TextSticker[]>([]);
  const [editingStickerId, setEditingStickerId] = useState<string | null>(null);
  const [selectedStickerId, setSelectedStickerId] = useState<string | null>(null);
  const [colorPaletteOpen, setColorPaletteOpen] = useState(false);
  const [colorPickerTarget, setColorPickerTarget] = useState<"sticker" | "draw">("sticker");
  const [colorPaletteInitialHex, setColorPaletteInitialHex] = useState("#FF0000");
  const [draggingSticker, setDraggingSticker] = useState(false);
  const [overTrash, setOverTrash] = useState(false);
  const trashRef = useRef<View>(null);
  const trashBox = useRef({ x: 0, y: 0, width: 0, height: 0 });

  const player = useVideoPlayer(uri || "", (p) => {
    p.muted = false;
    p.loop = false;
    p.timeUpdateEventInterval = 0.2;
  });

  useEffect(() => {
    if (!visible) {
      setCaption("");
      setEmojiOpen(false);
      setViewOnce(false);
      setPlaying(false);
      setMuted(false);
      setIsGif(false);
      setSpeed(1);
      setRotationDeg(0);
      setCropping(false);
      setCropRegion(null);
      setDrawing(false);
      setPaths([]);
      setStickers([]);
      setEditingStickerId(null);
      setSelectedStickerId(null);
      player.playbackRate = 1;
      player.muted = false;
      return;
    }
    if (uri) player.play();
  }, [visible, uri]);

  useEffect(() => {
    setThumbnails([]);
    setFileSizeBytes(null);
    thumbsLoadedForRef.current = null;
    if (!uri) return;
    getFileSizeBytes(uri).then(setFileSizeBytes);
  }, [uri]);

  useEffect(() => {
    if (!uri || duration <= 0 || thumbsLoadedForRef.current === uri) return;
    thumbsLoadedForRef.current = uri;
    getVideoThumbnails(uri, THUMBNAIL_COUNT, duration).then(setThumbnails);
  }, [uri, duration]);

  useEffect(() => {
    const statusSub = player.addListener("statusChange", (e) => {
      if (e.status === "readyToPlay" && player.duration > 0) {
        setDuration(player.duration);
        setTrimEnd((prev) => (prev > 0 ? prev : player.duration));
      }
    });
    const playingSub = player.addListener("playingChange", (e) => setPlaying(e.isPlaying));
    const timeSub = player.addListener("timeUpdate", () => {
      if (seekingRef.current) return;
      const t = player.currentTime;
      setCurrentTime(t);
      // Kullanici: kirpma penceresinin GERCEKTEN uygulanmasi - oynatma
      // bitis noktasina ulasinca basa (trimStart'a) donuyor.
      if (trimEnd > 0 && t >= trimEnd - 0.05) {
        player.currentTime = trimStart;
      }
    });
    return () => {
      statusSub.remove();
      playingSub.remove();
      timeSub.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player, trimStart, trimEnd]);

  function togglePlay() {
    if (playing) player.pause();
    else {
      if (player.currentTime < trimStart || player.currentTime >= trimEnd) player.currentTime = trimStart;
      player.play();
    }
  }

  function toggleMute() {
    setMuted((m) => {
      player.muted = !m;
      return !m;
    });
  }

  // GIF'ler sessiz olur - acilinca sesi otomatik kapatir (bkz. asagida
  // mute dugmesinin isGif acikken disabled olmasi).
  function toggleGif() {
    setIsGif((g) => {
      const next = !g;
      if (next) {
        setMuted(true);
        player.muted = true;
      }
      return next;
    });
  }

  function handleTrackLayout(e: LayoutChangeEvent) {
    setTrackWidth(Math.max(1, e.nativeEvent.layout.width));
  }

  function xToTime(x: number) {
    const ratio = Math.max(0, Math.min(1, x / trackWidth));
    return ratio * duration;
  }
  function timeToX(time: number) {
    return duration > 0 ? (time / duration) * trackWidth : 0;
  }

  // Tek bir PanResponder, tum kirpma cubugunun uzerinde - dokunulan ANDA
  // hangi tutamaca (baslangic/bitis) daha yakinsa O suruklenmeye baslaniyor,
  // SimpleSlider ile AYNI "locationX dogrudan konuma cevrilir" deseni
  // (dx/artis TABANLI degil - boylece re-render'larda referans kaymasi
  // sorunu olmaz).
  const trimResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (evt) => {
      seekingRef.current = true;
      const x = evt.nativeEvent.locationX;
      const startX = timeToX(trimStart);
      const endX = timeToX(trimEnd);
      draggingHandleRef.current = Math.abs(x - startX) <= Math.abs(x - endX) ? "start" : "end";
      player.pause();
    },
    onPanResponderMove: (evt) => {
      const t = xToTime(evt.nativeEvent.locationX);
      if (draggingHandleRef.current === "start") {
        setTrimStart(Math.min(t, trimEnd - TRIM_MIN_GAP));
      } else {
        setTrimEnd(Math.max(t, trimStart + TRIM_MIN_GAP));
      }
    },
    onPanResponderRelease: () => {
      seekingRef.current = false;
      draggingHandleRef.current = null;
      player.currentTime = trimStart;
    },
  });

  function rotateVideo() {
    setRotationDeg((d) => (d + 90) % 360);
  }
  async function enterCropMode() {
    if (!uri || !areaSize.width || !areaSize.height) return;
    player.pause();
    const natSize = await getVideoNaturalSize(uri, player.videoTrack?.size ?? null);
    setVideoNatSize(natSize);
    const rect = computeContainRect(natSize.width, natSize.height, areaSize.width, areaSize.height);
    setImgRect(rect);
    if (cropRegion) {
      setCropRect({
        x: rect.x + cropRegion.x * rect.width,
        y: rect.y + cropRegion.y * rect.height,
        width: cropRegion.width * rect.width,
        height: cropRegion.height * rect.height,
      });
    } else {
      setCropRect(rect);
    }
    setCropping(true);
  }
  function cancelCropMode() {
    setCropping(false);
  }
  function confirmCrop() {
    setCropRegion({
      x: clamp((cropRect.x - imgRect.x) / imgRect.width, 0, 1),
      y: clamp((cropRect.y - imgRect.y) / imgRect.height, 0, 1),
      width: clamp(cropRect.width / imgRect.width, 0.05, 1),
      height: clamp(cropRect.height / imgRect.height, 0.05, 1),
    });
    setCropping(false);
  }
  // NOT useRef: dosyadaki diger surukleme responder'lariyla AYNI sebepten -
  // her render'da YENIDEN kuruluyor ki cropRect/imgRect KAPANISLARI her
  // zaman GUNCEL olsun.
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
    const sticker: TextSticker = {
      id,
      text: "",
      x: Math.max(0, areaSize.width / 2 - 40),
      y: Math.max(0, areaSize.height / 2 - 14),
      color: STICKER_COLORS[0],
      font: undefined,
    };
    setStickers((prev) => [...prev, sticker]);
    setEditingStickerId(id);
    setSelectedStickerId(id);
  }
  function startEditingSticker(id: string) {
    setEditingStickerId(id);
    setSelectedStickerId(id);
  }
  function finishEditingSticker(id: string) {
    setEditingStickerId(null);
    setStickers((prev) => {
      const target = prev.find((s) => s.id === id);
      if (target && target.text.trim() === "") return prev.filter((s) => s.id !== id);
      return prev;
    });
  }
  function dragSticker(id: string, x: number, y: number) {
    setStickers((prev) => prev.map((s) => (s.id === id ? { ...s, x, y } : s)));
  }
  function changeStickerText(id: string, text: string) {
    setStickers((prev) => prev.map((s) => (s.id === id ? { ...s, text } : s)));
  }
  function changeStickerColor(id: string, color: string) {
    setStickers((prev) => prev.map((s) => (s.id === id ? { ...s, color } : s)));
  }
  function changeStickerFont(id: string, font: string | undefined) {
    setStickers((prev) => prev.map((s) => (s.id === id ? { ...s, font } : s)));
  }
  function deleteSticker(id: string) {
    setStickers((prev) => prev.filter((s) => s.id !== id));
    setSelectedStickerId((cur) => (cur === id ? null : cur));
  }
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

  function handlePaletteChangeHex(hex: string) {
    if (colorPickerTarget === "draw") setDrawColor(hex);
    else if (selectedStickerId) changeStickerColor(selectedStickerId, hex);
  }

  // Cizim katmani - SADECE "drawing" acikken dokunuslari yakalar.
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
        if (prev) setPaths((p) => [...p, { d: prev, color: drawColor }]);
        return "";
      });
    },
  });

  // Bos bir yere kisa dokununca oynat/duraklat, cizim ACIKKEN devreye
  // girmiyor (o zaman drawResponder calisir).
  const tapToggleResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => !drawing,
    onMoveShouldSetPanResponder: () => false,
    onPanResponderRelease: (_evt, g) => {
      if (Math.abs(g.dx) < 6 && Math.abs(g.dy) < 6) togglePlay();
    },
  });

  function handleSend() {
    onSend(caption.trim(), {
      muted: isGif ? true : muted,
      speed,
      trimStartMs: Math.round(trimStart * 1000),
      trimEndMs: Math.round((trimEnd || duration) * 1000),
      rotationDeg,
      cropRegion,
      viewOnce,
      isGif,
    });
  }

  const videoTransform = [{ rotate: `${rotationDeg}deg` }];

  // Kirpma onaylandiktan SONRA normal onizlemede (duzenleme modu disinda)
  // GERCEKTEN kirpilmis gibi gostermek icin - gercek transcode olmadan,
  // videoyu buyutup (cropRegion oranina gore) kirpilan bolge disini
  // "overflow: hidden" ile kesiyoruz (klasik dijital yakinlastirma/kirpma).
  function renderCroppedStage(region: Rect) {
    const cropPixelW = region.width * videoNatSize.width;
    const cropPixelH = region.height * videoNatSize.height;
    const disp = computeContainRect(cropPixelW, cropPixelH, areaSize.width, areaSize.height);
    const virtualW = disp.width / region.width;
    const virtualH = disp.height / region.height;
    const offsetX = -region.x * virtualW;
    const offsetY = -region.y * virtualH;
    return (
      <View
        style={[
          styles.cropClipBox,
          { left: disp.x, top: disp.y, width: disp.width, height: disp.height, transform: videoTransform },
        ]}
      >
        <View style={{ position: "absolute", left: offsetX, top: offsetY, width: virtualW, height: virtualH }}>
          {!!uri && <VideoView style={styles.video} player={player} nativeControls={false} contentFit="fill" pointerEvents="none" />}
        </View>
      </View>
    );
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCancel} statusBarTranslucent>
      <View style={[styles.screen, cropping && styles.screenCropping]}>
          <View
            style={[styles.stageArea, cropping && styles.stageAreaCropped]}
            collapsable={false}
            onLayout={(e) => setAreaSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
            {...(cropping ? {} : drawing ? drawResponder.panHandlers : tapToggleResponder.panHandlers)}
          >
            {cropping ? (
              <View style={[StyleSheet.absoluteFill, { transform: videoTransform }]}>
                {!!uri && <VideoView style={styles.video} player={player} nativeControls={false} contentFit="contain" pointerEvents="none" />}
              </View>
            ) : cropRegion ? (
              renderCroppedStage(cropRegion)
            ) : (
              <View style={[StyleSheet.absoluteFill, { transform: videoTransform }]}>
                {!!uri && <VideoView style={styles.video} player={player} nativeControls={false} contentFit="contain" pointerEvents="none" />}
              </View>
            )}

            <Svg width="100%" height="100%" style={StyleSheet.absoluteFill} pointerEvents="none">
              {paths.map((p, i) => (
                <Path key={i} d={p.d} stroke={p.color} strokeWidth={4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
              ))}
              {!!currentPath && <Path d={currentPath} stroke={drawColor} strokeWidth={4} fill="none" strokeLinecap="round" strokeLinejoin="round" />}
            </Svg>
            {stickers.map((s) => (
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

            {!cropping && !playing && (
              <View pointerEvents="none" style={styles.playOverlay}>
                <Play size={30} color="#FFFFFF" fill="#FFFFFF" />
              </View>
            )}

            {cropping && (
              <>
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
          </View>
          {draggingSticker && (
            <View
              ref={trashRef}
              style={[styles.trashButton, overTrash && styles.trashButtonHot]}
              onLayout={() =>
                trashRef.current?.measureInWindow((x, y, width, height) => {
                  trashBox.current = { x, y, width, height };
                })
              }
            >
              <Text style={styles.trashIcon}>🗑</Text>
            </View>
          )}

        {!cropping && (
          <View style={styles.topChromeAbs}>
            <View style={styles.header}>
              <TouchableOpacity style={styles.iconTouch} onPress={onCancel} disabled={uploading} hitSlop={10}>
                <View style={{ transform: [{ rotate: "90deg" }] }}>
                  <CircleArrowDown size={22} color={theme.text} />
                </View>
              </TouchableOpacity>
              <View style={styles.toolbarRow}>
                <TouchableOpacity style={styles.iconTouch} onPress={rotateVideo} disabled={uploading} hitSlop={6}>
                  <RotateCw size={20} color={theme.text} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.iconTouch} onPress={enterCropMode} disabled={uploading} hitSlop={6}>
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

            <View style={styles.trimSection}>
              <View style={styles.filmstrip} onLayout={handleTrackLayout} {...trimResponder.panHandlers}>
                <View style={styles.filmstripRow}>
                  {Array.from({ length: THUMBNAIL_COUNT }).map((_, idx) => (
                    <View key={idx} style={styles.thumbFrame}>
                      {thumbnails[idx] ? (
                        <Image source={{ uri: thumbnails[idx] }} style={styles.thumbImg} />
                      ) : (
                        <View style={[styles.thumbImg, styles.thumbPlaceholder]} />
                      )}
                    </View>
                  ))}
                </View>
                <View pointerEvents="none" style={[styles.dimOverlay, { left: 0, width: timeToX(trimStart) }]} />
                <View
                  pointerEvents="none"
                  style={[styles.dimOverlay, { left: timeToX(trimEnd || duration), width: trackWidth - timeToX(trimEnd || duration) }]}
                />
                <View
                  pointerEvents="none"
                  style={[
                    styles.selectionBox,
                    { left: timeToX(trimStart), width: Math.max(2, timeToX(trimEnd || duration) - timeToX(trimStart)) },
                  ]}
                />
                {duration > 0 && <View pointerEvents="none" style={[styles.trimPlayhead, { left: timeToX(currentTime) }]} />}
                <View pointerEvents="none" style={[styles.trimHandle, { left: timeToX(trimStart) - 9 }]} />
                <View pointerEvents="none" style={[styles.trimHandle, { left: timeToX(trimEnd || duration) - 9 }]} />
              </View>
            </View>

            <View style={styles.toolsRow}>
              <View style={styles.infoGroup}>
                <TouchableOpacity onPress={toggleMute} disabled={isGif} hitSlop={6} style={[styles.soundIconTouch, isGif && styles.soundIconTouchDisabled]}>
                  {muted ? <Icon name="sesKapali1" size={19} color={theme.text} /> : <Icon name="sesAcik1" size={19} color={theme.text} />}
                </TouchableOpacity>
                <Text style={styles.infoText}>
                  {formatDuration(duration)}
                  {fileSizeBytes ? ` • ${formatFileSize(fileSizeBytes)}` : ""}
                </Text>
              </View>
              <TouchableOpacity style={[styles.gifToggle, isGif && styles.gifToggleActive]} onPress={toggleGif} hitSlop={6}>
                <Text style={[styles.gifToggleText, isGif && styles.gifToggleTextActive]}>GIF</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {!cropping && (
          <View style={styles.bottomChromeAbs}>
            {!drawing && selectedStickerId && stickers.some((s) => s.id === selectedStickerId) && (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.stickerToolsScroll} contentContainerStyle={styles.stickerToolsRow}>
              {STICKER_COLORS.map((c) => (
                <TouchableOpacity
                  key={c}
                  style={[styles.colorDot, { backgroundColor: c, borderColor: c === "#FFFFFF" ? "#000000" : "#FFFFFF" }]}
                  onPress={() => changeStickerColor(selectedStickerId, c)}
                />
              ))}
              <TouchableOpacity
                onPress={() => {
                  const activeSticker = stickers.find((s) => s.id === selectedStickerId);
                  setColorPaletteInitialHex((activeSticker?.color ?? "#FF0000").toUpperCase());
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
                const activeSticker = stickers.find((s) => s.id === selectedStickerId);
                return (
                  <TouchableOpacity
                    key={f.id}
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
                    style={[styles.colorDot, { backgroundColor: c, borderColor: c === "#FFFFFF" ? "#000000" : "#FFFFFF" }]}
                    onPress={() => setDrawColor(c)}
                  />
                ))}
                <TouchableOpacity
                  onPress={() => {
                    setColorPaletteInitialHex(drawColor.toUpperCase());
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
                <TouchableOpacity
                  onPress={() => setViewOnce((v) => !v)}
                  disabled={uploading}
                  hitSlop={6}
                  style={{ transform: [{ translateX: -8 }, { translateY: 1 }] }}
                >
                  {viewOnce ? <VoiceOnceFilledIcon size={50} color="#FFFFFF" /> : <VoiceOnceRingIcon size={50} color="#9A8F80" />}
                </TouchableOpacity>
              </View>
              <TouchableOpacity style={styles.sendCircle} onPress={handleSend} disabled={uploading || !uri} hitSlop={6}>
                {uploading ? (
                  <Text style={styles.sendProgressText}>{uploadProgress}%</Text>
                ) : (
                  <Send size={20} color="#141210" />
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {cropping && (
          <View style={styles.cropToolsRowAbs}>
            <View style={styles.cropToolsRow}>
              <TouchableOpacity testID="video-crop-cancel" style={styles.cropActionBtn} onPress={cancelCropMode} hitSlop={8}>
                <X size={20} color={theme.text} />
              </TouchableOpacity>
              <Text style={styles.cropHintText}>{t("sendMedia.cropHint")}</Text>
              <TouchableOpacity testID="video-crop-confirm" style={[styles.cropActionBtn, styles.cropActionBtnConfirm]} onPress={confirmCrop} hitSlop={8}>
                <Check size={20} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          </View>
        )}

        <ColorPalettePickerModal
          visible={colorPaletteOpen}
          initialHex={colorPaletteInitialHex}
          onChangeHex={handlePaletteChangeHex}
          onClose={() => setColorPaletteOpen(false)}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#000000", alignItems: "center", justifyContent: "center" },
  screenCropping: { backgroundColor: "#2C2C2E" },
  // Üst (başlık+kırpma çubuğu) ve alt (araçlar+mesaj kutusu) bloklar artık
  // videonun üstüne YÜZEN mutlak-konumlu katmanlar - böylece video GERÇEKTEN
  // tüm ekranı kaplayıp ortalanıyor, bu bloklar onun boyunu KISALTMIYOR.
  topChromeAbs: { position: "absolute", top: 0, left: 0, right: 0, backgroundColor: "#000000" },
  bottomChromeAbs: { position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: "#000000" },
  cropToolsRowAbs: { position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: "#000000" },
  header: { paddingTop: 50, paddingHorizontal: 14, paddingBottom: 8, flexDirection: "row", alignItems: "center", gap: 6 },
  iconTouch: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 18 },
  iconTouchActive: { backgroundColor: "rgba(255,255,255,0.18)" },
  toolbarRow: { flexDirection: "row", marginLeft: "auto", gap: 2 },
  stageArea: { width: "100%", height: "100%", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  stageAreaCropped: { width: "86%", height: "86%", backgroundColor: "#000000" },
  video: { width: "100%", height: "100%" },
  cropClipBox: { position: "absolute", overflow: "hidden" },
  playOverlay: {
    position: "absolute",
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  cropDim: { position: "absolute", backgroundColor: "rgba(0,0,0,0.55)" },
  cropFrame: { position: "absolute", borderWidth: 2, borderColor: "#FFFFFF" },
  cropGridLine: { position: "absolute", backgroundColor: "rgba(255,255,255,0.35)" },
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
  trashIcon: { fontSize: 22 },
  colorDot: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, overflow: "hidden" },
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
  trimSection: { paddingHorizontal: 18, paddingBottom: 10 },
  filmstrip: { height: 56, borderRadius: 8, overflow: "hidden" },
  filmstripRow: { flex: 1, flexDirection: "row" },
  thumbFrame: { flex: 1, height: "100%" },
  thumbImg: { width: "100%", height: "100%" },
  thumbPlaceholder: { backgroundColor: "#2A2A2E" },
  dimOverlay: { position: "absolute", top: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.55)" },
  selectionBox: { position: "absolute", top: 0, bottom: 0, borderWidth: 2, borderColor: "#FFFFFF", borderRadius: 8 },
  trimPlayhead: { position: "absolute", top: -2, bottom: -2, width: 2, backgroundColor: "#FFFFFF" },
  trimHandle: { position: "absolute", top: 10, width: 18, height: 36, borderRadius: 9, backgroundColor: "#FFFFFF" },
  toolsRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 18, paddingBottom: 14, paddingTop: 12, gap: 12 },
  infoGroup: { flexDirection: "row", alignItems: "center", gap: 8 },
  soundIconTouch: { transform: [{ translateY: -2 }] },
  soundIconTouchDisabled: { opacity: 0.35 },
  infoText: { color: theme.textMuted, fontSize: 12.5, fontVariant: ["tabular-nums"] },
  // Kullanici: "en sağ altında gif tuşu olsun basınca dolu gözüksün" -
  // ses dugmesiyle AYNI satirin (toolsRow, space-between) sag ucunda.
  gifToggle: {
    height: 26,
    paddingHorizontal: 10,
    borderRadius: 13,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.5)",
    alignItems: "center",
    justifyContent: "center",
    transform: [{ translateY: -4 }],
  },
  gifToggleActive: { backgroundColor: "#FFFFFF", borderColor: "#FFFFFF" },
  gifToggleText: { color: "#FFFFFF", fontSize: 11, fontWeight: "800", letterSpacing: 0.5 },
  gifToggleTextActive: { color: "#141210" },
  emojiGrid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 14, paddingBottom: 6, gap: 2 },
  emojiCell: { width: "12.5%", aspectRatio: 1, alignItems: "center", justifyContent: "center" },
  emojiCellText: { fontSize: 22 },
  composerRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingBottom: 24, paddingTop: 8 },
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
});
