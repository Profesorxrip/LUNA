import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Animated,
  PanResponder,
  ActivityIndicator,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Path } from "react-native-svg";
import { MaterialCommunityIcons, MaterialIcons, Ionicons } from "@expo/vector-icons";
import { LockClosedIcon, MicrophoneIcon } from "react-native-heroicons/outline";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import * as Location from "expo-location";
import { useAudioRecorder, useAudioRecorderState, RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync } from "expo-audio";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Camera as CameraIcon, Image as ImageIcon, CircleArrowDown, MoreVertical, Phone, Laugh, Paperclip, Send, MapPin, FileText as FileTextIcon, Trash2, Search, Clock, Bell, BellOff, TriangleAlert, X, Copy, Pin, PinOff, Forward, ChevronUp, Pause, Play } from "lucide-react-native";
import * as Clipboard from "expo-clipboard";
import { theme } from "../theme";
import { useTranslation } from "react-i18next";
import { getSocket, DMMessage, DMReply, DMPinnedMessage } from "../services/socket";
import { supabase } from "../services/supabase";
import Icon from "../components/Icon";
import { VoiceOnceRingIcon, VoiceOnceFilledIcon } from "../components/CustomIcons";
import ReplyPreviewContent from "../components/ReplyPreviewContent";
import { showAlert } from "../components/CustomAlert";
import LoadingView from "../components/LoadingView";
import SendMediaSheet from "../components/SendMediaSheet";
import SendVideoSheet from "../components/SendVideoSheet";
import GalleryPickerModal, { type GalleryPickedAsset } from "../components/GalleryPickerModal";
import CameraFilmstrip, { type FilmstripPickedAsset } from "../components/CameraFilmstrip";
import { uriToArrayBuffer } from "../utils/uriToArrayBuffer";
import { uploadWithProgress } from "../utils/uploadWithProgress";
import { formatMessageTime } from "../utils/time";
import { formatDuration } from "../utils/format";
import ChatImageBubble from "../components/ChatImageBubble";
import PhotoGridBubble from "../components/PhotoGridBubble";
import VideoMessageBubble from "../components/VideoMessageBubble";
import VoiceMessageBubble from "../components/VoiceMessageBubble";
import LocationMessageBubble from "../components/LocationMessageBubble";
import FileMessageBubble from "../components/FileMessageBubble";
import CallMessageBubble from "../components/CallMessageBubble";
import FriendsScreen from "./FriendsScreen";
import Avatar from "../components/Avatar";

function formatRecordingTime(ms: number): string {
  const totalSec = Math.floor(Math.max(0, ms) / 1000);
  const mm = Math.floor(totalSec / 60);
  const ss = totalSec % 60;
  return `${mm}:${ss.toString().padStart(2, "0")}`;
}

// Toplu secimle art arda gonderilen fotograflar sunucuya/diziye hala AYRI
// birer mesaj olarak dusuyor (bkz. sendPickedImage) - sadece GORUNUMDE tek
// bir izgara balonuna toplanabilsinler diye "duz fotograf" sayilan ardisik
// mesajlar burada gruplanir (ayni gonderen, sesli/konum/dosya DEGIL, medyasi
// var).
function isPlainPhotoMessage(m: DMMessage): boolean {
  return m.kind !== "voice" && m.kind !== "location" && m.kind !== "file" && m.kind !== "video" && !!m.mediaUrl;
}

type DMDisplayItem = { type: "single"; message: DMMessage } | { type: "photoGroup"; id: string; fromUserId: string; createdAt: number; photos: DMMessage[] };

function groupConsecutivePhotos(list: DMMessage[]): DMDisplayItem[] {
  const result: DMDisplayItem[] = [];
  let i = 0;
  while (i < list.length) {
    const m = list[i];
    if (isPlainPhotoMessage(m)) {
      let j = i + 1;
      while (j < list.length && isPlainPhotoMessage(list[j]) && list[j].fromUserId === m.fromUserId) {
        const hasRealCaption = !!list[j].text && list[j].text !== "📷 Fotoğraf";
        j++;
        if (hasRealCaption) break;
      }
      const run = list.slice(i, j);
      if (run.length > 1) {
        const last = run[run.length - 1];
        result.push({ type: "photoGroup", id: `${m.id}-group`, fromUserId: m.fromUserId, createdAt: last.createdAt, photos: run });
        i = j;
        continue;
      }
    }
    result.push({ type: "single", message: m });
    i++;
  }
  return result;
}

function getExpiryOptions(t: (key: string) => string): { label: string; ms: number | null }[] {
  return [
    { label: t("dm.expiryOff"), ms: null },
    { label: t("dm.expiry1Hour"), ms: 60 * 60 * 1000 },
    { label: t("dm.expiry1Day"), ms: 24 * 60 * 60 * 1000 },
    { label: t("dm.expiry1Week"), ms: 7 * 24 * 60 * 60 * 1000 },
  ];
}

export interface DMPeer {
  userId: string;
  name: string;
  handle?: string;
}

export interface DmInfoOpenParams {
  peerAvatarUrl: string | null;
  muted: boolean;
  mediaMessages: DMMessage[];
  // Ataç ikonunun actigi "Dosyalar" sekmesi icin - foto DISINDAKI
  // (sesli mesaj/konum/genel dosya) mesajlar. mediaMessages'tan AYRI
  // tutuluyor cunku DmInfoScreen'in iki sekmesi ayri listeler.
  fileMessages: DMMessage[];
  // "Dosyalar" satirindaki "Sohbette Göster" ikonu icin - DMScreen'in
  // KENDI scrollToMessage'ini tasir (bkz. asagidaki fonksiyon).
  onShowInChat: (messageId: string) => void;
  onToggleMute: () => void;
}

interface Props {
  peer: DMPeer;
  onBack: () => void;
  onOpenInfo?: (info: DmInfoOpenParams) => void;
  // Ustteki telefon ikonuna basilinca - GERCEK sesli arama baslatmak icin
  // (bkz. useCallEngine.ts) peer'in avatarini (asagida zaten fetch'lenmis
  // olan peerAvatarUrl state'i) de iletiyoruz, cagiran taraf tekrar
  // sorgulamak zorunda kalmasin diye.
  onStartVoiceCall?: (peerAvatarUrl: string | null) => void;
}

const ACCENT = "#0EA5E9";
// Kullanicinin istegi: kendi mesaj balonumun rengi orijinal canli mavinin
// (ACCENT) biraz matlastirilmis/dusuk doygunluklu hali - diger yerlerde
// (tikler, saat, basliktaki vurgu rengi) hala ACCENT kullanilmaya devam
// ediyor, sadece balonun kendisi matlasiyor.
const BUBBLE_MINE_COLOR = "#2E799E";
// Oda sohbetindeki (RoomScreen.tsx) kaydirarak yanitlama ile AYNI esikler.
const REPLY_SWIPE_TRIGGER = 48;
const REPLY_SWIPE_MAX = 64;
// Artik App.tsx'teki paylasilan AppBackground (degrade) arkada duruyor.
const BG = "transparent";
const TEXT = "#F5F0E6";
const MUTED = "#9A8F80";

// WhatsApp'taki gibi balonun kosesinden fiskiran, yumusak egrili kuyruk -
// keskin kirik cizgili ucgen yerine tek bir bezier egrisiyle ciziliyor.
// "mine": sag-ust kosede, disariya dogru; "theirs": ayna simetrisiyle sol-ust.
function BubbleTail({ color, mine }: { color: string; mine: boolean }) {
  // Ust kenar TAMAMEN YATAY/DUZ (balonun ust kenariyla ayni hizada, x
  // ekseninde duz bir cizgi) - kullanicinin istedigi "duz ust kisim".
  // Sadece disariya fiskiran uc (B) ve alta balonun yan kenarina birlesen
  // kose (C) hafifce yuvarlatilmis; govde 1 birim balonun uzerine
  // bindirilip (bkz. bubbleTailSvgMine/Theirs) centik/bosluk engelleniyor.
  const d = mine
    ? "M0,0 L5.2,0 Q7,0 6.093,1.556 L0.605,10.963 Q0,12 0,10.8 L0,0 Z"
    : "M7,0 L1.8,0 Q0,0 0.907,1.556 L6.395,10.963 Q7,12 7,10.8 L7,0 Z";
  return (
    <Svg
      width={7}
      height={12}
      viewBox="0 0 7 12"
      style={[styles.bubbleTailSvg, mine ? styles.bubbleTailSvgMine : styles.bubbleTailSvgTheirs]}
    >
      <Path d={d} fill={color} />
    </Svg>
  );
}

interface DMBubbleRowProps {
  item: DMMessage;
  isMine: boolean;
  groupedWithPrev: boolean;
  seen: boolean;
  onTap: () => void;
  onReply: () => void;
  onReport: () => void;
  // Yanitla'dan (kaydirma hareketi onReply'i DOGRUDAN cagirir) AYRI - basili
  // tutunca Yanitla/Kopyala/Sabitle/Ilet/Sil secenekli menuyu acar.
  onLongPress: () => void;
  // Tek-gorunumluk sesli mesaj ilk kez oynatilmaya baslandiginda cagirilir -
  // bkz. asagidaki VoiceMessageBubble onPlay kullanimi.
  onConsumeVoiceOnce?: (messageId: string) => void;
  // Tek-gorunumluk foto/video ilk kez TAM EKRAN acildiginda cagirilir - bkz.
  // asagidaki ChatImageBubble/VideoMessageBubble onOpen kullanimi.
  onConsumeMediaOnce?: (messageId: string) => void;
}

// Oda sohbetindeki (RoomScreen.tsx -> ChatBubbleRow) ile AYNI mantik: kendi
// mesajimizi SAGDAN SOLA, karsidakinin mesajini SOLDAN SAGA kaydirinca
// yanitlama (reply) tetikleniyor. Satir translateX ile kaydirilirken
// kenarda bir "reply" ikonu belirip bosalan tarafi gosteriyor.
function DMBubbleRow({ item, isMine, groupedWithPrev, seen, onTap, onReply, onReport, onLongPress, onConsumeVoiceOnce, onConsumeMediaOnce }: DMBubbleRowProps) {
  const { t, i18n } = useTranslation();
  const translateX = useRef(new Animated.Value(0)).current;
  // Sesli mesajin sure etiketi - VoiceMessageBubble artik kendi icinde cizmiyor,
  // gonderim saatiyle AYNI alt satirda gosterebilelim diye buraya tasindi.
  const [voiceTimeLabel, setVoiceTimeLabel] = useState("0:00");

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_evt, g) => Math.abs(g.dx) > 10 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderMove: (_evt, g) => {
        const raw = isMine ? Math.min(0, g.dx) : Math.max(0, g.dx);
        translateX.setValue(Math.max(-REPLY_SWIPE_MAX, Math.min(REPLY_SWIPE_MAX, raw)));
      },
      onPanResponderRelease: (_evt, g) => {
        const raw = isMine ? Math.min(0, g.dx) : Math.max(0, g.dx);
        if (Math.abs(raw) >= REPLY_SWIPE_TRIGGER) onReply();
        Animated.spring(translateX, { toValue: 0, useNativeDriver: true, bounciness: 6 }).start();
      },
      onPanResponderTerminate: () => {
        Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
      },
    })
  ).current;

  const replyHintOpacity = translateX.interpolate({
    inputRange: isMine ? [-REPLY_SWIPE_TRIGGER, 0] : [0, REPLY_SWIPE_TRIGGER],
    outputRange: isMine ? [1, 0] : [0, 1],
    extrapolate: "clamp",
  });

  return (
    <Animated.View
      style={[
        styles.messageRow,
        isMine ? styles.messageRowMine : styles.messageRowTheirs,
        !groupedWithPrev && styles.messageRowNewGroup,
        { transform: [{ translateX }] },
      ]}
      {...pan.panHandlers}
    >
      <Animated.View
        pointerEvents="none"
        style={[styles.replyHint, isMine ? { right: -26 } : { left: -26 }, { opacity: replyHintOpacity }]}
      >
        <Icon name="reply" size={16} color={MUTED} />
      </Animated.View>
      <TouchableOpacity activeOpacity={0.7} onPress={onTap} onLongPress={item.deletedForEveryone ? undefined : onLongPress} style={styles.bubbleWrap}>
          <View
            style={[
              styles.bubble,
              isMine ? styles.bubbleMine : styles.bubbleTheirs,
              !groupedWithPrev && (isMine ? styles.bubbleMineFirst : styles.bubbleTheirsFirst),
              item.kind === "voice" && styles.bubbleVoicePad,
              item.kind === "location" && styles.bubbleLocationPad,
              item.kind === "file" && styles.bubbleFilePad,
              item.kind === "call" && styles.bubbleCallPad,
              item.kind !== "voice" && item.kind !== "location" && item.kind !== "file" && item.mediaUrl && styles.bubblePhotoPad,
            ]}
          >
            {!groupedWithPrev && <BubbleTail color={isMine ? BUBBLE_MINE_COLOR : "#1E293B"} mine={isMine} />}
            {item.isForwarded && !item.deletedForEveryone && (
              <View style={styles.forwardedRow}>
                <Forward size={11} color={isMine ? "rgba(255,255,255,0.75)" : MUTED} />
                <Text style={[styles.forwardedText, { color: isMine ? "rgba(255,255,255,0.75)" : MUTED }]}>{t("dm.forwardedLabel")}</Text>
              </View>
            )}
            {item.replyTo && !item.deletedForEveryone && (
              <View style={styles.replyQuote}>
                <ReplyPreviewContent
                  fromName={item.replyTo.fromName}
                  text={item.replyTo.text}
                  kind={item.replyTo.kind}
                  mediaUrl={item.replyTo.mediaUrl}
                  variant="bubble"
                />
              </View>
            )}
            {item.deletedForEveryone ? (
              <View style={styles.deletedRow}>
                <Trash2 size={13} color={isMine ? "rgba(255,255,255,0.6)" : MUTED} />
                <Text style={[styles.deletedText, { color: isMine ? "rgba(255,255,255,0.6)" : MUTED }]}>{t("dm.deletedMessage")}</Text>
              </View>
            ) : item.kind === "voice" && item.viewOnce && item.viewOnceConsumed ? (
              <View style={styles.deletedRow}>
                <MicrophoneIcon size={14} color={isMine ? "rgba(255,255,255,0.6)" : MUTED} strokeWidth={1.8} />
                <Text style={[styles.deletedText, { color: isMine ? "rgba(255,255,255,0.6)" : MUTED }]}>{t("dm.voiceOnceConsumed")}</Text>
              </View>
            ) : item.kind === "voice" && item.mediaUrl ? (
              <VoiceMessageBubble
                uri={item.mediaUrl}
                durationMs={item.durationMs}
                onTimeLabel={setVoiceTimeLabel}
                onPlay={item.viewOnce ? () => onConsumeVoiceOnce?.(item.id) : undefined}
              />
            ) : item.kind === "location" && item.latitude != null && item.longitude != null ? (
              <LocationMessageBubble latitude={item.latitude} longitude={item.longitude} />
            ) : item.kind === "file" && item.mediaUrl ? (
              <FileMessageBubble
                uri={item.mediaUrl}
                fileName={item.fileName || item.text}
                fileSize={item.fileSize}
                mimeType={item.mimeType}
              />
            ) : item.kind === "video" && item.viewOnce && item.viewOnceConsumed ? (
              <View style={styles.deletedRow}>
                <CameraIcon size={14} color={isMine ? "rgba(255,255,255,0.6)" : MUTED} strokeWidth={1.8} />
                <Text style={[styles.deletedText, { color: isMine ? "rgba(255,255,255,0.6)" : MUTED }]}>{t("dm.mediaOnceConsumed")}</Text>
              </View>
            ) : item.kind === "video" && item.mediaUrl ? (
              <VideoMessageBubble
                uri={item.mediaUrl}
                size={280}
                borderRadius={8}
                senderName={item.fromName}
                sentAt={item.createdAt}
                onReply={onReply}
                onReport={onReport}
                onOpen={item.viewOnce ? () => onConsumeMediaOnce?.(item.id) : undefined}
              />
            ) : item.kind === "call" ? (
              <CallMessageBubble isVideo={!!item.callIsVideo} status={item.callStatus || "completed"} durationMs={item.durationMs ?? null} />
            ) : item.kind === "photo" && item.viewOnce && item.viewOnceConsumed ? (
              <View style={styles.deletedRow}>
                <ImageIcon size={14} color={isMine ? "rgba(255,255,255,0.6)" : MUTED} strokeWidth={1.8} />
                <Text style={[styles.deletedText, { color: isMine ? "rgba(255,255,255,0.6)" : MUTED }]}>{t("dm.mediaOnceConsumed")}</Text>
              </View>
            ) : item.mediaUrl ? (
              <ChatImageBubble
                uri={item.mediaUrl}
                isAdult={item.isAdult}
                size={280}
                borderRadius={8}
                senderName={item.fromName}
                sentAt={item.createdAt}
                onReply={onReply}
                onReport={onReport}
                onOpen={item.viewOnce ? () => onConsumeMediaOnce?.(item.id) : undefined}
              />
            ) : (
              <Text style={styles.bubbleText}>{item.text}</Text>
            )}
            {!item.deletedForEveryone &&
              item.kind !== "voice" &&
              item.kind !== "location" &&
              item.kind !== "file" &&
              item.kind !== "video" &&
              item.mediaUrl &&
              item.text &&
              item.text !== "📷 Fotoğraf" && <Text style={styles.mediaCaption}>{item.text}</Text>}
            <View
              style={[
                styles.metaRow,
                item.kind === "voice" && styles.metaRowVoice,
                item.kind !== "voice" && item.kind !== "location" && item.kind !== "file" && item.mediaUrl && styles.metaRowPhotoOverlay,
                item.kind === "call" && styles.metaRowCallOverlay,
              ]}
            >
              {item.kind === "voice" && <Text style={styles.voiceMetaTime}>{voiceTimeLabel}</Text>}
              <View style={styles.metaRowRight}>
                <Text style={styles.metaTime}>{formatMessageTime(item.createdAt, i18n.language)}</Text>
                {isMine && item.kind !== "call" && (
                  <MaterialIcons
                    name={seen ? "done-all" : "done"}
                    size={16}
                    color={seen ? "#FFFFFF" : "rgba(255,255,255,0.65)"}
                  />
                )}
              </View>
            </View>
          </View>
          {(item.myReaction || item.peerReaction) && (
            <View style={[styles.reactionBadgeRow, isMine ? styles.reactionBadgeRowMine : styles.reactionBadgeRowTheirs]}>
              {item.peerReaction && (
                <View style={styles.reactionBadgeChip}>
                  <Text style={styles.reactionBadgeEmoji}>{item.peerReaction}</Text>
                </View>
              )}
              {item.myReaction && (
                <View style={styles.reactionBadgeChip}>
                  <Text style={styles.reactionBadgeEmoji}>{item.myReaction}</Text>
                </View>
              )}
            </View>
          )}
      </TouchableOpacity>
    </Animated.View>
  );
}

/** Rave'in gercek DM (ozelden mesaj) ekraninin yapisinin bir kopyasi -
 * baslik/avatar/uc nokta menusu, sol/sag balonlar, alinti (reply) onizlemesi,
 * "gorundu" cift tik'i ve alt aksiyon cubugu (etiket/medya/sesli mesaj) -
 * LUNA'nin siyah/yesil temasiyla. */
export default function DMScreen({ peer, onBack, onOpenInfo, onStartVoiceCall }: Props) {
  const { t, i18n } = useTranslation();
  const socket = getSocket();
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [messages, setMessages] = useState<DMMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState("");
  const [replyingTo, setReplyingTo] = useState<DMReply | null>(null);
  const [seenUpTo, setSeenUpTo] = useState(0);
  const [menuVisible, setMenuVisible] = useState(false);
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [expiryVisible, setExpiryVisible] = useState(false);
  const [expiresAfterMs, setExpiresAfterMs] = useState<number | null>(null);
  const [muted, setMuted] = useState(false);
  const [reportVisible, setReportVisible] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [nowTick, setNowTick] = useState(Date.now());
  const [pendingImages, setPendingImages] = useState<string[]>([]);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [videoQueue, setVideoQueue] = useState<{ uri: string; mimeType?: string | null }[]>([]);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [videoUploadProgress, setVideoUploadProgress] = useState(0);
  const [attachSheetVisible, setAttachSheetVisible] = useState(false);
  const [galleryPickerVisible, setGalleryPickerVisible] = useState(false);
  const [quickCaptureActive, setQuickCaptureActive] = useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [quickCameraReady, setQuickCameraReady] = useState(false);
  const [quickCameraFacing, setQuickCameraFacing] = useState<"back" | "front">("back");
  const [quickCameraFlash, setQuickCameraFlash] = useState<"off" | "on">("off");
  const [capturingQuickPhoto, setCapturingQuickPhoto] = useState(false);
  // Kullanici: "...bu fotoğraf çekme ekranı bir de video çekme ekranı
  // ayarlasak" - alt bosluga Fotograf/Video mod secici eklendi, deklansor
  // moda gore ya ANLIK fotograf cekiyor ya da expo-camera'nin GERCEK
  // recordAsync/stopRecording API'siyle video kaydediyor (web'de
  // recordAsync HIC YOK - sadece native'de calisir, bkz. ExpoCamera.web.tsx).
  const [quickCameraMode, setQuickCameraMode] = useState<"photo" | "video">("photo");
  const [isRecordingVideo, setIsRecordingVideo] = useState(false);
  const [recordingElapsedSec, setRecordingElapsedSec] = useState(0);
  const recordingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cameraReadyRef = useRef(false);
  const cameraRef = useRef<CameraView>(null);
  // Dosya (pdf/zip/vb.) gonderme - foto ile AYNI "chat-media" bucket'ina
  // yukleme deseni, ama kendi onizleme/caption ekrani yok, secilince
  // DOGRUDAN gonderilir.
  const [sendingFile, setSendingFile] = useState(false);
  // Sesli mesaj kaydi - expo-audio'nun kendi "ne kadar surdu" sayacini
  // (useAudioRecorderState) kullaniyoruz, kendi zamanlayicimizi KURMUYORUZ.
  // isMeteringEnabled: kilitli kayit cubugundaki ses dalgasi ARTIK SAHTE
  // bir desen degil - recorderState.metering (gercek mikrofon seviyesi,
  // dBFS) 200ms'de bir okunup asagidaki waveHistoryRef'e biriktiriliyor.
  const audioRecorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true });
  const recorderState = useAudioRecorderState(audioRecorder, 200);
  // Son WAVE_BAR_COUNT kadar gercek metering ornegi (0..1 normalize edilmis) -
  // her yeni recorderState tick'inde (durationMillis degisince) bir deger
  // eklenip en eskisi atiliyor, boylece cubuklar soldan saga dogru GERCEK
  // ses seviyesini gosterir. Render govdesinde dogrudan ref mutasyonu -
  // recorderState zaten her 200ms'de bir re-render tetikledigi icin ayri
  // bir state/effect'e gerek yok.
  const WAVE_BAR_COUNT = 40;
  const waveHistoryRef = useRef<number[]>([]);
  const lastMeteringTickRef = useRef(-1);
  const [voiceRecording, setVoiceRecording] = useState(false);
  const [sendingVoice, setSendingVoice] = useState(false);
  // WhatsApp tarzi "basili tutarak kaydet" - parmak YUKARI kaydirilinca
  // kayit kilitlenir (parmagi kaldirmak kaydi KESMEZ, elden serbest devam
  // eder), SOLA kaydirilinca (kilitlenmeden once) kayit iptal olur.
  const [recordingLocked, setRecordingLocked] = useState(false);
  // Kilitli moddayken duraklat/devam et - expo-audio'nun kendi pause()/
  // record() cagrilari (bkz. handlePauseResumeRecording).
  const [recordingPaused, setRecordingPaused] = useState(false);
  // "Tek gorunumluk" sesli mesaj anahtari - kilitli kayit cubugundaki "1"
  // rozetiyle acilip kapatiliyor, gonderirken mesaja eklenir.
  const [voiceOnceView, setVoiceOnceView] = useState(false);
  // Mikrofon dugmesindeki surukleme - kilit ikonu YUKARI, iptal ipucu SOLA
  // kayar (bkz. asagidaki micPan). PanResponder callback'leri her zaman ILK
  // render'daki closure'i gordugu icin "kilitlendi mi" bilgisini STATE
  // yerine ref'te tutuyoruz (recordingLocked state'i gecikmeli olabilir).
  const recordDragX = useRef(new Animated.Value(0)).current;
  const recordDragY = useRef(new Animated.Value(0)).current;
  const recordLockedRef = useRef(false);
  const LOCK_DRAG_THRESHOLD = 70;
  const CANCEL_DRAG_THRESHOLD = 90;
  const micPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        // Web'de parmak/fare yukari surukleyince araya giren metin
        // (orn. "Mesaj yazin...") secilmeye baslayip tarayicinin kendi
        // surukle-sec davranisina kayiyor - bu da PanResponder'in
        // yakalamasini (responder) koparip kaydi erken iptal ediyordu.
        // Surukleme bitene kadar TUM sayfada secimi kapatiyoruz.
        if (Platform.OS === "web" && typeof document !== "undefined") {
          (document.body.style as any).userSelect = "none";
        }
        recordLockedRef.current = false;
        recordDragX.setValue(0);
        recordDragY.setValue(0);
        startVoiceRecording();
      },
      onPanResponderMove: (_evt, g) => {
        if (recordLockedRef.current) return;
        recordDragX.setValue(Math.min(0, g.dx));
        recordDragY.setValue(Math.min(0, g.dy));
        if (-g.dy > LOCK_DRAG_THRESHOLD) {
          recordLockedRef.current = true;
          setRecordingLocked(true);
          Animated.spring(recordDragX, { toValue: 0, useNativeDriver: true }).start();
          Animated.spring(recordDragY, { toValue: 0, useNativeDriver: true }).start();
        }
      },
      onPanResponderRelease: (_evt, g) => {
        if (Platform.OS === "web" && typeof document !== "undefined") {
          (document.body.style as any).userSelect = "";
        }
        if (recordLockedRef.current) return;
        Animated.spring(recordDragX, { toValue: 0, useNativeDriver: true }).start();
        Animated.spring(recordDragY, { toValue: 0, useNativeDriver: true }).start();
        if (-g.dx > CANCEL_DRAG_THRESHOLD) cancelVoiceRecording();
        else sendVoiceRecording();
      },
      onPanResponderTerminate: () => {
        if (Platform.OS === "web" && typeof document !== "undefined") {
          (document.body.style as any).userSelect = "";
        }
        Animated.spring(recordDragX, { toValue: 0, useNativeDriver: true }).start();
        Animated.spring(recordDragY, { toValue: 0, useNativeDriver: true }).start();
        if (!recordLockedRef.current) cancelVoiceRecording();
      },
    })
  ).current;
  const recordCancelHintOpacity = recordDragX.interpolate({
    inputRange: [-CANCEL_DRAG_THRESHOLD, -10, 0],
    outputRange: [0, 1, 1],
    extrapolate: "clamp",
  });
  const recordLockProgress = recordDragY.interpolate({
    inputRange: [-LOCK_DRAG_THRESHOLD, 0],
    outputRange: [1, 0],
    extrapolate: "clamp",
  });
  // Ayarlar ekranindaki "Hizli Tepki" tercihi - bir mesaja CIFT TIKLAYINCA
  // gonderilecek emoji budur (bkz. ProfileScreen.tsx default_reaction_emoji).
  const [quickReactionEmoji, setQuickReactionEmoji] = useState("❤️");
  // Mesaj gecmisi avatar URL'ini TASIMIYOR (dm_messages satirlari sadece
  // gonderi anindaki isim/metni saklar) - bu yuzden iki tarafin GUNCEL profil
  // fotografini ayrica, konusma bazinda bir kez cekip her mesajda kullaniyoruz
  // (RoomScreen.tsx'teki ChatAvatar ile AYNI Avatar bileseni).
  const [myAvatarUrl, setMyAvatarUrl] = useState<string | null>(null);
  const [peerAvatarUrl, setPeerAvatarUrl] = useState<string | null>(null);
  const lastTapRef = useRef<Record<string, number>>({});
  const listRef = useRef<FlatList<DMDisplayItem>>(null);
  // "Sohbette Göster" - kayan listede henuz olcum alinmamis bir mesaja
  // scrollToIndex basarisiz olursa (bkz. FlatList'in onScrollToIndexFailed'i)
  // asagida yaklasik bir offset'e gidip TEKRAR denemek icin hangi mesaji
  // ariyoruz onu hatirliyoruz.
  const pendingScrollMessageId = useRef<string | null>(null);
  const muteStorageKey = `dm_muted_${peer.userId}`;
  // Basili tutma menusu (Yanitla/Kopyala/Sabitle/Ilet/Sil) - bkz.
  // 0037_dm_message_actions.sql. "Sabitleme" burada BIRDEN FAZLA mesaj
  // ayni anda sabit olabilir (headerdaki "sohbeti sabitle" ile KARISTIRMAYIN).
  const [actionMenuMessage, setActionMenuMessage] = useState<DMMessage | null>(null);
  const [pinnedMessages, setPinnedMessages] = useState<DMPinnedMessage[]>([]);
  // Banner her zaman AYNI mesaji degil, sohbetteki konumuna gore SIRAYLA
  // farkli bir sabitlenmis mesaji gosterir (WhatsApp'daki gibi): bu index
  // "orderedPins" (sohbetteki konumuna gore eskiden-yeniye siralanmis) icinde
  // su an GOSTERILEN mesaji isaret eder - baslangicta EN SONuncusu (en
  // yeni). Banner'a her basista o mesaja gidilir VE index bir ONCEKI
  // (daha eski) sabitlenmis mesaja kaydirilir, en basa gelince en yeniye
  // sarar - kullanicinin istegi.
  const [pinnedCursor, setPinnedCursor] = useState(0);
  const [forwardTarget, setForwardTarget] = useState<DMMessage | null>(null);

  // Sabitlenen mesaj SAYISI degistikce (yeni sabitleme/kaldirma) gosterge
  // en yeniye (son indekse) sifirlanir.
  useEffect(() => {
    setPinnedCursor(Math.max(0, pinnedMessages.length - 1));
  }, [pinnedMessages.length]);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getUser().then(({ data }) => {
      if (cancelled || !data.user) return;
      setMyUserId(data.user.id);
      supabase
        .from("profiles")
        .select("default_reaction_emoji, avatar_url")
        .eq("id", data.user.id)
        .maybeSingle()
        .then(({ data: profile }) => {
          if (cancelled) return;
          if (profile?.default_reaction_emoji) setQuickReactionEmoji(profile.default_reaction_emoji);
          if (profile?.avatar_url) setMyAvatarUrl(profile.avatar_url);
        });
      supabase
        .from("profiles")
        .select("avatar_url")
        .eq("id", peer.userId)
        .maybeSingle()
        .then(({ data: profile }) => {
          if (!cancelled && profile?.avatar_url) setPeerAvatarUrl(profile.avatar_url);
        });
      socket.emit("dm:open", { withUserId: peer.userId }, (res: any) => {
        if (res?.ok) {
          setMessages(res.messages);
          setExpiresAfterMs(res.expiresAfterMs ?? null);
          setPinnedMessages(res.pinned || []);
        }
        setLoading(false);
      });
    });
    AsyncStorage.getItem(muteStorageKey).then((v) => {
      if (!cancelled) setMuted(v === "1");
    });
    return () => {
      cancelled = true;
    };
  }, [peer.userId]);

  useEffect(() => {
    function handleMessage({ fromUserId, message }: { fromUserId: string; message: DMMessage }) {
      if (fromUserId !== peer.userId) return;
      setMessages((prev) => [...prev, message]);
    }
    // Arama bitince sunucunun KENDI tarafimizdan ("ben" o olayi tetikledim -
    // kapattim/reddettim/vazgectim) olusturdugu kayit mesaji - normal
    // "dm:message" fromUserId'si her zaman KARSI tarafi varsaydigi icin
    // (bkz. yukarisi) bu durumda isemiyor, bu yuzden ayri bir event (bkz.
    // server/src/index.ts logCallMessage). toUserId, bu mesajin HANGI DM
    // konusmasina ait oldugunu (karsi tarafi) belirtir.
    function handleOwnMessage({ toUserId, message }: { toUserId: string; message: DMMessage }) {
      if (toUserId !== peer.userId) return;
      setMessages((prev) => [...prev, message]);
    }
    function handleSeen({ byUserId, at }: { byUserId: string; at: number }) {
      if (byUserId !== peer.userId) return;
      setSeenUpTo(at);
    }
    function handleExpiry({ byUserId, ms }: { byUserId: string; ms: number | null }) {
      if (byUserId !== peer.userId) return;
      setExpiresAfterMs(ms);
    }
    function handleReaction({
      fromUserId,
      messageId,
      emoji,
    }: {
      fromUserId: string;
      messageId: string;
      emoji: string | null;
    }) {
      if (fromUserId !== peer.userId) return;
      setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, peerReaction: emoji } : m)));
    }
    // Asagidaki uc event (deletedForEveryone/pinned/unpinned) "withUserId"
    // TASIMIYOR - sunucu her iki tarafa da (ben dahil) yayinliyor, bu
    // ekranin ILGILI konusmaya ait olup olmadigi dogal olarak "bu messageId
    // benim mesajlarimda var mi" kontroluyle anlasiliyor (yoksa zaten no-op).
    function handleDeletedForEveryone({ messageId }: { messageId: string }) {
      setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, deletedForEveryone: true } : m)));
    }
    function handlePinned({ messageId }: { messageId: string; pinnedBy: string; pinnedAt: number }) {
      const full = messagesRef.current.find((m) => m.id === messageId);
      if (!full) return;
      setPinnedMessages((prev) =>
        prev.some((p) => p.message.id === messageId) ? prev : [...prev, { message: full, pinnedBy: "", pinnedAt: Date.now() }]
      );
    }
    function handleUnpinned({ messageId }: { messageId: string }) {
      setPinnedMessages((prev) => prev.filter((p) => p.message.id !== messageId));
    }
    // deletedForEveryone/pinned/unpinned ile AYNI gerekce (withUserId yok,
    // sunucu her iki tarafa da yayinliyor) - bkz. consume_dm_voice_once RPC.
    function handleVoiceOnceConsumed({ messageId }: { messageId: string }) {
      setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, viewOnceConsumed: true, mediaUrl: undefined } : m)));
    }
    // handleVoiceOnceConsumed ile AYNI mantik, sadece foto/video icin -
    // bkz. consume_dm_media_once RPC (0039_dm_media_view_once.sql).
    function handleMediaOnceConsumed({ messageId }: { messageId: string }) {
      setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, viewOnceConsumed: true, mediaUrl: undefined } : m)));
    }
    socket.on("dm:message", handleMessage);
    socket.on("dm:message:self", handleOwnMessage);
    socket.on("dm:seen", handleSeen);
    socket.on("dm:expiry", handleExpiry);
    socket.on("dm:reaction", handleReaction);
    socket.on("dm:message:deletedForEveryone", handleDeletedForEveryone);
    socket.on("dm:message:pinned", handlePinned);
    socket.on("dm:message:unpinned", handleUnpinned);
    socket.on("dm:message:voiceOnceConsumed", handleVoiceOnceConsumed);
    socket.on("dm:message:mediaOnceConsumed", handleMediaOnceConsumed);
    return () => {
      socket.off("dm:message", handleMessage);
      socket.off("dm:message:self", handleOwnMessage);
      socket.off("dm:seen", handleSeen);
      socket.off("dm:expiry", handleExpiry);
      socket.off("dm:reaction", handleReaction);
      socket.off("dm:message:deletedForEveryone", handleDeletedForEveryone);
      socket.off("dm:message:pinned", handlePinned);
      socket.off("dm:message:unpinned", handleUnpinned);
      socket.off("dm:message:voiceOnceConsumed", handleVoiceOnceConsumed);
      socket.off("dm:message:mediaOnceConsumed", handleMediaOnceConsumed);
    };
  }, [peer.userId]);

  const messagesRef = useRef<DMMessage[]>([]);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    if (messages.length) listRef.current?.scrollToEnd({ animated: true });
  }, [messages.length]);

  // Kilitli kayit cubugu acilinca (85px'ten 150px'e buyudugu icin) son
  // mesaj onun ALTINDA kalabiliyordu. IKI AYRI SORUN vardi: (1) cubuk
  // BUYUDUGU anda hemen kaydirinca layout henuz yeni yukseklige gore
  // yeniden olculmemis oluyordu, (2) scrollToEnd() - GERCEK olcumle
  // dogrulandi - contentContainerStyle'daki paddingBottom'u (5) HESABA
  // KATMIYOR, her zaman tam o kadar KISA kaliyor (son mesaj kutunun degil,
  // padding'in bitimine kadar kayiyor - yani bosluk hep "gorunmuyormus"
  // gibi kaliyordu). scrollToOffset'e COK BUYUK bir deger vermek, FlatList'i
  // kendi GERCEK (padding dahil) max kaydirma miktarina kirpmaya zorluyor.
  useEffect(() => {
    if (!recordingLocked) return;
    const delays = [0, 16, 50, 120, 250];
    const timeouts = delays.map((ms) =>
      setTimeout(() => listRef.current?.scrollToOffset({ offset: 999999, animated: false }), ms)
    );
    return () => timeouts.forEach(clearTimeout);
  }, [recordingLocked]);

  // Suresi dolan mesajlar ("Sure sonu" ayari) ekranda da zamanla kaybolsun
  // diye periyodik olarak "simdi"yi tazeliyoruz - filtreleme render sirasinda yapiliyor.
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 5000);
    return () => clearInterval(id);
  }, []);

  function placeholder(label: string) {
    showAlert(label, t("profile.comingSoon"));
  }

  function sendMessage() {
    if (!input.trim() || !myUserId) return;
    const text = input.trim();
    const replyTo = replyingTo;
    socket.emit("dm:send", { toUserId: peer.userId, text, replyTo }, (res: any) => {
      if (res?.ok) setMessages((prev) => [...prev, res.message]);
    });
    setInput("");
    setReplyingTo(null);
  }

  // Kullanici: "Galeri sayfası oluşturmalıyız" - uygulama ICI kendi galeri
  // izgara ekranimiz (GalleryPickerModal) her yerde ("Galeriden Seç" ve
  // hizli kamera ekranindaki galeri ikonu) OS'in kendi galerisi yerine
  // acilir. expo-media-library web'de cihaz galerisini LISTELEYEMEDIGI
  // icin (sadece native'de calisir) web'de eski ImagePicker akisina
  // duseriz.
  function pickImage() {
    if (Platform.OS === "web") {
      pickImageViaOsLibrary();
      return;
    }
    setAttachSheetVisible(false);
    setGalleryPickerVisible(true);
  }

  async function pickImageViaOsLibrary() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      showAlert(t("dm.permissionRequiredTitle"), t("dm.permissionRequiredBody"));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images", "videos"],
      quality: 0.7,
      allowsMultipleSelection: true,
      selectionLimit: 10,
    });
    if (result.canceled || !result.assets?.length) return;
    setAttachSheetVisible(false);
    const videos = result.assets.filter((a) => a.type === "video");
    const images = result.assets.filter((a) => a.type !== "video");
    if (images.length) setPendingImages((prev) => [...prev, ...images.map((a) => a.uri)]);
    if (videos.length) setVideoQueue((prev) => [...prev, ...videos.map((a) => ({ uri: a.uri, mimeType: a.mimeType }))]);
  }

  function handleGalleryPickerConfirm(picked: GalleryPickedAsset[]) {
    setGalleryPickerVisible(false);
    const videos = picked.filter((a) => a.type === "video");
    const images = picked.filter((a) => a.type === "image");
    if (images.length) setPendingImages((prev) => [...prev, ...images.map((a) => a.uri)]);
    if (videos.length) setVideoQueue((prev) => [...prev, ...videos.map((a) => ({ uri: a.uri, mimeType: a.mimeType }))]);
  }

  // Kullanici: "...basınca kamerayı açsa nasıl olur" -> "expo-camera ekle,
  // gerçek anlık çekim yap" secildi. Bu, OS'in kendi kamera uygulamasini
  // ACAN ImagePicker.launchCameraAsync akisi (tam kontroller/flash/on-arka
  // kamera degistirme OS'in kendi arayuzunde).
  async function openCamera() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      showAlert(t("dm.permissionRequiredTitle"), t("dm.cameraPermissionRequiredBody"));
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (result.canceled || !result.assets?.[0]) return;
    setAttachSheetVisible(false);
    setPendingImages((prev) => [...prev, result.assets[0].uri]);
  }

  // Kullanici: "ikon dışında kutuya basınca kamerayı açsa" - bu ANLIK çekim
  // yolu, expo-camera'nin KENDI (OS kamera uygulamasini ACMADAN, sheet
  // icinde) CameraView'iyla tam kontrollu (deklansor/on-arka/flas) bir
  // ekran acar.
  async function startQuickCapture() {
    if (!cameraPermission?.granted) {
      const res = await requestCameraPermission();
      if (!res.granted) {
        showAlert(t("dm.permissionRequiredTitle"), t("dm.cameraPermissionRequiredBody"));
        return;
      }
    }
    cameraReadyRef.current = false;
    setQuickCameraReady(false);
    setQuickCameraFacing("back");
    setQuickCameraFlash("off");
    setCapturingQuickPhoto(false);
    setQuickCameraMode("photo");
    setIsRecordingVideo(false);
    setRecordingElapsedSec(0);
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }
    setAttachSheetVisible(false);
    setQuickCaptureActive(true);
  }

  function handleQuickCameraReady() {
    cameraReadyRef.current = true;
    setQuickCameraReady(true);
  }

  function toggleQuickCameraFacing() {
    setQuickCameraFacing((f) => (f === "back" ? "front" : "back"));
  }

  function handleQuickGalleryPress() {
    setQuickCaptureActive(false);
    pickImage();
  }

  // Kamera ekranindaki son fotograf/video seridinde (CameraFilmstrip) bir
  // kucuk resme dokununca - GalleryPickerModal'daki tek tiklama ile AYNI
  // davranis, o TEK ogeyi dogrudan duzenleme/gonderme ekranina gotursun.
  function handleFilmstripPickAsset(asset: FilmstripPickedAsset) {
    setQuickCaptureActive(false);
    handleGalleryPickerConfirm([{ uri: asset.uri, type: asset.type, mimeType: asset.type === "video" ? "video/mp4" : "image/jpeg" }]);
  }

  function toggleQuickCameraFlash() {
    setQuickCameraFlash((f) => (f === "off" ? "on" : "off"));
  }

  function handleQuickShutterPress() {
    if (quickCameraMode === "video") {
      handleQuickVideoShutterPress();
    } else {
      handleQuickPhotoShutterPress();
    }
  }

  // expo-camera web'de "onCameraReady" ilk kareden ONCE de tetiklenebiliyor
  // ("not enough camera data" hatasi) - birkac deneme ile bekliyoruz.
  async function handleQuickPhotoShutterPress() {
    if (capturingQuickPhoto || !quickCameraReady) return;
    setCapturingQuickPhoto(true);
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const photo = await cameraRef.current?.takePictureAsync({ quality: 0.7 });
        if (photo?.uri) {
          setQuickCaptureActive(false);
          setCapturingQuickPhoto(false);
          setAttachSheetVisible(false);
          setPendingImages((prev) => [...prev, photo.uri]);
          return;
        }
      } catch {
        await new Promise((r) => setTimeout(r, 200));
      }
    }
    setCapturingQuickPhoto(false);
  }

  // Ilk basis KAYDI baslatir (recordAsync - sadece "stopRecording()"
  // cagrildiginda ya da maxDuration'a ulasinca COZULEN bir Promise), ikinci
  // basis kaydi durdurur. Web'de recordAsync HIC YOK (expo-camera'nin
  // ExpoCamera.web.tsx dosyasinda tanimli degil) - bu yuzden SADECE
  // native'de calisir.
  async function handleQuickVideoShutterPress() {
    if (!quickCameraReady) return;
    if (isRecordingVideo) {
      cameraRef.current?.stopRecording();
      return;
    }
    setIsRecordingVideo(true);
    setRecordingElapsedSec(0);
    if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current);
    recordingIntervalRef.current = setInterval(() => {
      setRecordingElapsedSec((s) => s + 1);
    }, 1000);
    try {
      const video = await cameraRef.current?.recordAsync({ maxDuration: 60 });
      if (video?.uri) {
        setQuickCaptureActive(false);
        setAttachSheetVisible(false);
        setVideoQueue((prev) => [...prev, { uri: video.uri, mimeType: "video/mp4" }]);
      }
    } catch {
      // kayit basarisiz/iptal - ekran acik kalir, kullanici tekrar deneyebilir
    } finally {
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
        recordingIntervalRef.current = null;
      }
      setIsRecordingVideo(false);
    }
  }

  function removePendingImage(index: number) {
    setPendingImages((prev) => prev.filter((_, i) => i !== index));
  }
  function replacePendingImage(index: number, uri: string) {
    setPendingImages((prev) => prev.map((u, i) => (i === index ? uri : u)));
  }

  // "chat-media" bucket'ina (avatars/gallery ile ayni desen, bkz.
  // 0015_chat_media.sql) kendi klasorune sirayla yukler, GERCEK toplam
  // yukleme yuzdesini hesaplar (bkz. utils/uploadWithProgress.ts), ardindan
  // her biri icin "dm:sendImage" emit eder - yazi (caption) sadece SON
  // fotografa ekleniyor.
  async function sendPickedImage(caption: string, viewOnce: boolean) {
    if (!pendingImages.length || !myUserId) return;
    setUploadingImage(true);
    setUploadProgress(0);
    const total = pendingImages.length;
    try {
      for (let i = 0; i < total; i++) {
        const uri = pendingImages[i];
        const arrayBuffer = await uriToArrayBuffer(uri);
        const ext = uri.split(".").pop()?.toLowerCase().split("?")[0] || "jpg";
        const contentType = ext === "png" ? "image/png" : "image/jpeg";
        const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const path = `${myUserId}/${fileName}`;
        await uploadWithProgress("chat-media", path, arrayBuffer, contentType, (pct) => {
          setUploadProgress(Math.round(((i + pct / 100) / total) * 100));
        });
        const { data: publicUrlData } = supabase.storage.from("chat-media").getPublicUrl(path);
        const isLast = i === total - 1;
        await new Promise<void>((resolve, reject) => {
          socket.emit(
            "dm:sendImage",
            { toUserId: peer.userId, mediaUrl: publicUrlData.publicUrl, caption: isLast ? caption || undefined : undefined, viewOnce },
            (res: any) => {
              if (res?.ok) {
                setMessages((prev) => [...prev, res.message]);
                resolve();
              } else reject(new Error(res?.error || t("dm.imageSendFailedBody")));
            }
          );
        });
      }
      setPendingImages([]);
    } catch (err: any) {
      showAlert(t("dm.sendFailedTitle"), err?.message || t("dm.imageSendErrorBody"));
    } finally {
      setUploadingImage(false);
      setUploadProgress(0);
    }
  }

  // Video - SendVideoSheet'te onizlenip (kirpma/sessize alma/hiz secenekleri
  // AYARLANDIKTAN sonra) gonderiliyor. Gercek dosya kesme/transcode YOK
  // (ffmpeg gibi bir kutuphane bu projede yok) - trim/mute/speed, mesajla
  // birlikte METADATA olarak gonderiliyor; oynatma tarafinda (alici/izleyici)
  // uygulanmasi ayri bir backend/oynatici guncellemesi gerektiriyor.
  async function sendPickedVideo(
    uri: string,
    mimeType: string | null | undefined,
    caption: string,
    meta: {
      muted: boolean;
      speed: number;
      trimStartMs: number;
      trimEndMs: number;
      rotationDeg: number;
      cropRegion: { x: number; y: number; width: number; height: number } | null;
      viewOnce: boolean;
    }
  ) {
    if (!myUserId) return;
    setUploadingVideo(true);
    setVideoUploadProgress(0);
    try {
      const arrayBuffer = await uriToArrayBuffer(uri);
      const ext = uri.split(".").pop()?.toLowerCase().split("?")[0] || "mp4";
      const contentType = mimeType || (ext === "mov" ? "video/quicktime" : "video/mp4");
      const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const path = `${myUserId}/${fileName}`;
      await uploadWithProgress("chat-media", path, arrayBuffer, contentType, (pct) => setVideoUploadProgress(pct));
      const { data: publicUrlData } = supabase.storage.from("chat-media").getPublicUrl(path);
      await new Promise<void>((resolve, reject) => {
        socket.emit(
          "dm:sendVideo",
          {
            toUserId: peer.userId,
            mediaUrl: publicUrlData.publicUrl,
            caption: caption || undefined,
            muted: meta.muted,
            speed: meta.speed,
            trimStartMs: meta.trimStartMs,
            trimEndMs: meta.trimEndMs,
            rotationDeg: meta.rotationDeg,
            cropRegion: meta.cropRegion,
            viewOnce: meta.viewOnce,
          },
          (res: any) => {
            if (res?.ok) {
              setMessages((prev) => [...prev, res.message]);
              resolve();
            } else reject(new Error(res?.error || "Video gönderilemedi."));
          }
        );
      });
      setVideoQueue((prev) => prev.slice(1));
    } catch (err: any) {
      showAlert(t("dm.sendFailedTitle"), err?.message || "Video gönderilirken bir hata oluştu.");
    } finally {
      setUploadingVideo(false);
      setVideoUploadProgress(0);
    }
  }

  // Kullanici: "konumda gözüksün" - ataç menüsundeki "Konum" satiri. Dosya
  // YOK, sadece o anki konumu (tek seferlik, "canli" DEGIL) gonderiyoruz -
  // RoomScreen'in surekli guncellenen oda haritasiyla (room:location)
  // KARISTIRILMASIN.
  async function sendLocation() {
    setAttachSheetVisible(false);
    const perm = await Location.requestForegroundPermissionsAsync();
    if (!perm.granted) {
      showAlert(t("dm.permissionRequiredTitle"), t("dm.locationPermissionRequiredBody"));
      return;
    }
    try {
      const pos = await Location.getCurrentPositionAsync({});
      socket.emit(
        "dm:sendLocation",
        { toUserId: peer.userId, latitude: pos.coords.latitude, longitude: pos.coords.longitude },
        (res: any) => {
          if (res?.ok) setMessages((prev) => [...prev, res.message]);
          else showAlert(t("dm.sendFailedTitle"), res?.error || t("dm.genericSendErrorBody"));
        }
      );
    } catch (err: any) {
      showAlert(t("dm.sendFailedTitle"), err?.message || t("dm.genericSendErrorBody"));
    }
  }

  // Kullanici: "dosya gönderme özelliği ekle" - ataç menüsundeki "Dosya"
  // satiri. Fotograf akisindaki (sendPickedImage) ile AYNI "chat-media"
  // yukleme deseni, ama kendi onizleme/caption ekrani yok - secilince
  // DOGRUDAN gonderilir.
  async function pickAndSendFile() {
    const result = await DocumentPicker.getDocumentAsync({ multiple: false });
    if (result.canceled || !result.assets?.[0] || !myUserId) return;
    setAttachSheetVisible(false);
    const asset = result.assets[0];
    setSendingFile(true);
    try {
      const arrayBuffer = await uriToArrayBuffer(asset.uri);
      const ext = asset.name.split(".").pop()?.toLowerCase() || "bin";
      const path = `${myUserId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      await uploadWithProgress("chat-media", path, arrayBuffer, asset.mimeType || "application/octet-stream", () => {});
      const { data: publicUrlData } = supabase.storage.from("chat-media").getPublicUrl(path);
      socket.emit(
        "dm:sendFile",
        { toUserId: peer.userId, mediaUrl: publicUrlData.publicUrl, fileName: asset.name, fileSize: asset.size, mimeType: asset.mimeType },
        (res: any) => {
          if (res?.ok) setMessages((prev) => [...prev, res.message]);
          else showAlert(t("dm.sendFailedTitle"), res?.error || t("dm.genericSendErrorBody"));
        }
      );
    } catch (err: any) {
      showAlert(t("dm.sendFailedTitle"), err?.message || t("dm.genericSendErrorBody"));
    } finally {
      setSendingFile(false);
    }
  }

  // Mikrofon dugmesi: TIKLAYINCA kayit baslar (composer yerine kayit cubugu
  // gosterilir, bkz. asagidaki JSX), cop kutusuyla vazgecilir, gonder
  // ikonuyla "chat-media"ya yuklenip dm:sendVoice ile gonderilir.
  async function startVoiceRecording() {
    const perm = await requestRecordingPermissionsAsync();
    if (!perm.granted) {
      showAlert(t("dm.permissionRequiredTitle"), t("dm.micPermissionRequiredBody"));
      return;
    }
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await audioRecorder.prepareToRecordAsync();
    audioRecorder.record();
    waveHistoryRef.current = [];
    lastMeteringTickRef.current = -1;
    setVoiceRecording(true);
    setRecordingLocked(false);
    setRecordingPaused(false);
    setVoiceOnceView(false);
  }

  async function cancelVoiceRecording() {
    if (audioRecorder.isRecording) await audioRecorder.stop();
    setVoiceRecording(false);
    setRecordingLocked(false);
    setRecordingPaused(false);
  }

  // Kilitli (elden serbest) moddayken kayda ara ver / devam et - expo-audio
  // sesi diskte TUTUYOR, pause() sonrasi record() ile KALDIGI YERDEN devam
  // ediyor (yeni bir dosya ACMIYOR).
  function pauseResumeRecording() {
    if (recordingPaused) {
      audioRecorder.record();
      setRecordingPaused(false);
    } else {
      audioRecorder.pause();
      setRecordingPaused(true);
    }
  }

  async function sendVoiceRecording() {
    const durationMs = recorderState.durationMillis;
    const viewOnce = voiceOnceView;
    if (audioRecorder.isRecording) await audioRecorder.stop();
    setVoiceRecording(false);
    setRecordingLocked(false);
    setRecordingPaused(false);
    const uri = audioRecorder.uri;
    if (!uri || !myUserId) return;
    setSendingVoice(true);
    try {
      const arrayBuffer = await uriToArrayBuffer(uri);
      const path = `${myUserId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.m4a`;
      await uploadWithProgress("chat-media", path, arrayBuffer, "audio/m4a", () => {});
      const { data: publicUrlData } = supabase.storage.from("chat-media").getPublicUrl(path);
      socket.emit(
        "dm:sendVoice",
        { toUserId: peer.userId, mediaUrl: publicUrlData.publicUrl, durationMs, viewOnce },
        (res: any) => {
          if (res?.ok) setMessages((prev) => [...prev, res.message]);
          else showAlert(t("dm.sendFailedTitle"), res?.error || t("dm.genericSendErrorBody"));
        }
      );
    } catch (err: any) {
      showAlert(t("dm.sendFailedTitle"), err?.message || t("dm.genericSendErrorBody"));
    } finally {
      setSendingVoice(false);
      setVoiceOnceView(false);
    }
  }

  // Tek-gorunumluk sesli mesaj ilk kez oynatilmaya baslandiginda (bkz.
  // VoiceMessageBubble onPlay) cagrilir - sunucuya "tuket" der, basarili
  // olursa HEM alici HEM gonderen sokete yayinlanan "dm:message:
  // voiceOnceConsumed" ile mesaj listesi guncellenir (bkz. yukaridaki
  // handleVoiceOnceConsumed). consumedOnceRef, ag gecikmesi sirasinda
  // ayni mesaja TEKRAR tiklanirsa birden fazla istek atilmasini onler.
  const consumedOnceRef = useRef<Set<string>>(new Set());
  function handleConsumeVoiceOnce(messageId: string) {
    if (consumedOnceRef.current.has(messageId)) return;
    consumedOnceRef.current.add(messageId);
    socket.emit("dm:consumeVoiceOnce", { withUserId: peer.userId, messageId }, (res: any) => {
      if (!res?.ok) consumedOnceRef.current.delete(messageId);
    });
  }

  // handleConsumeVoiceOnce ile AYNI mantik (ayni consumedOnceRef'i paylasir -
  // mesaj id'leri zaten tum turler arasinda benzersiz), sadece foto/video
  // ilk kez TAM EKRAN acildiginda (bkz. ChatImageBubble/VideoMessageBubble
  // onOpen) cagirilir.
  function handleConsumeMediaOnce(messageId: string) {
    if (consumedOnceRef.current.has(messageId)) return;
    consumedOnceRef.current.add(messageId);
    socket.emit("dm:consumeMediaOnce", { withUserId: peer.userId, messageId }, (res: any) => {
      if (!res?.ok) consumedOnceRef.current.delete(messageId);
    });
  }

  function insertMention() {
    setInput((prev) => (prev.endsWith("@") || prev.length === 0 ? prev + "@" : prev + " @"));
  }

  function startReply(message: DMMessage) {
    setReplyingTo({
      text: message.text,
      fromName: message.fromUserId === myUserId ? t("dm.you") : message.fromName,
      kind: message.kind,
      mediaUrl: message.mediaUrl,
    });
  }

  // Basili tutma menusu (Yanitla/Kopyala/Sabitle/Ilet/Sil) - bkz.
  // 0037_dm_message_actions.sql.
  function openActionMenu(message: DMMessage) {
    if (message.deletedForEveryone) return;
    setActionMenuMessage(message);
  }
  function closeActionMenu() {
    setActionMenuMessage(null);
  }
  async function handleCopy(message: DMMessage) {
    closeActionMenu();
    await Clipboard.setStringAsync(message.text || "");
  }
  function handleDeleteForMe(message: DMMessage) {
    closeActionMenu();
    showAlert(t("dm.deleteForMeConfirmTitle"), t("dm.deleteForMeConfirmBody"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("dm.actionDeleteForMe"),
        style: "destructive",
        onPress: () => {
          socket.emit("dm:deleteMessage", { withUserId: peer.userId, messageId: message.id, forEveryone: false }, (res: any) => {
            if (res?.ok) {
              setMessages((prev) => prev.filter((m) => m.id !== message.id));
              setPinnedMessages((prev) => prev.filter((p) => p.message.id !== message.id));
            }
          });
        },
      },
    ]);
  }
  function handleDeleteForEveryone(message: DMMessage) {
    closeActionMenu();
    showAlert(t("dm.deleteForEveryoneConfirmTitle"), t("dm.deleteForEveryoneConfirmBody"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("dm.actionDeleteForEveryone"),
        style: "destructive",
        onPress: () => {
          socket.emit("dm:deleteMessage", { withUserId: peer.userId, messageId: message.id, forEveryone: true }, () => {});
        },
      },
    ]);
  }
  function handlePinToggle(message: DMMessage) {
    closeActionMenu();
    const isPinned = pinnedMessages.some((p) => p.message.id === message.id);
    if (isPinned) {
      socket.emit("dm:unpinMessage", { withUserId: peer.userId, messageId: message.id }, () => {});
    } else {
      socket.emit("dm:pinMessage", { withUserId: peer.userId, messageId: message.id }, () => {});
    }
  }
  // Foto izleyicideki (PhotoViewerModal.tsx) "İlet" ile AYNI ekran:
  // FriendsScreen'i inviteMode + hideInviteExtras ile bir kisi secici olarak
  // acar - kendi arkadas listesini/arama/coklu secimini kendisi yonetir,
  // biz sadece secilen kisilere forwardTarget'i gonderiyoruz.
  function openForwardPicker(message: DMMessage) {
    closeActionMenu();
    setForwardTarget(message);
  }
  function forwardToUsers(userIds: string[]) {
    if (!forwardTarget || userIds.length === 0) return;
    socket.emit("dm:forwardMessage", { toUserIds: userIds, message: forwardTarget }, () => {
      setForwardTarget(null);
    });
  }

  // Medya listesinden (fotograf izleyicideki "Sohbette Göster") ana sohbette
  // o mesaja kaydirir.
  function scrollToMessage(id: string) {
    const index = displayItems.findIndex((d) => (d.type === "single" ? d.message.id === id : d.photos.some((p) => p.id === id)));
    if (index === -1) return;
    pendingScrollMessageId.current = id;
    listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.5 });
  }

  // Bir mesaja CIFT TIKLAYINCA Ayarlar'da secilen hizli tepki emojisini
  // gonderir/geri alir (ayni emojiye ikinci cift-tik tepkiyi kaldirir).
  function handleMessageTap(message: DMMessage) {
    const now = Date.now();
    const last = lastTapRef.current[message.id] || 0;
    lastTapRef.current[message.id] = now;
    if (now - last > 300) return;
    const next = message.myReaction === quickReactionEmoji ? null : quickReactionEmoji;
    setMessages((prev) => prev.map((m) => (m.id === message.id ? { ...m, myReaction: next } : m)));
    socket.emit("dm:react", { withUserId: peer.userId, messageId: message.id, emoji: next });
  }

  function chooseExpiry(ms: number | null) {
    socket.emit("dm:setExpiry", { withUserId: peer.userId, ms }, (res: any) => {
      if (res?.ok) setExpiresAfterMs(ms);
    });
    setExpiryVisible(false);
  }

  async function toggleMute() {
    const next = !muted;
    setMuted(next);
    if (next) await AsyncStorage.setItem(muteStorageKey, "1");
    else await AsyncStorage.removeItem(muteStorageKey);
  }

  function submitReport() {
    const reason = reportReason.trim();
    if (!reason) return;
    socket.emit("report:submit", { targetUserId: peer.userId, reason }, (res: any) => {
      if (res?.ok) showAlert(t("dm.reportSentTitle"), t("dm.reportSentBody"));
      else showAlert(t("dm.reportFailedTitle"), t("dm.reportFailedBody"));
    });
    setReportReason("");
    setReportVisible(false);
  }

  const notExpired = messages.filter((m) => !m.expiresAt || m.expiresAt > nowTick);
  const visibleMessages =
    searchVisible && searchQuery.trim()
      ? notExpired.filter((m) => m.text.toLowerCase().includes(searchQuery.trim().toLowerCase()))
      : notExpired;
  const displayItems = groupConsecutivePhotos(visibleMessages);
  const mediaMessages = notExpired.filter((m) => !!m.mediaUrl && m.kind !== "voice" && m.kind !== "file");
  // Uye bilgisi ekranindaki ataç ikonunun actigi "Dosyalar" sekmesi icin -
  // bkz. DmInfoOpenParams.fileMessages.
  const fileMessages = notExpired.filter((m) => m.kind === "voice" || m.kind === "location" || m.kind === "file");
  const expiryOptions = getExpiryOptions(t);
  const expiryLabel = expiryOptions.find((o) => o.ms === expiresAfterMs)?.label ?? t("dm.expiryOff");

  const menuItems: { label: string; icon: React.ReactNode; danger?: boolean; onPress: () => void }[] = [
    { label: t("dm.menuSearch"), icon: <Search size={16} color={TEXT} />, onPress: () => setSearchVisible(true) },
    { label: t("dm.menuExpiry"), icon: <Clock size={16} color={TEXT} />, onPress: () => setExpiryVisible(true) },
    {
      label: muted ? t("dm.menuUnmute") : t("dm.menuMute"),
      icon: muted ? <Bell size={16} color={TEXT} /> : <BellOff size={16} color={TEXT} />,
      onPress: toggleMute,
    },
    { label: t("dm.menuReport"), icon: <TriangleAlert size={16} color={theme.danger} />, danger: true, onPress: () => setReportVisible(true) },
  ];

  // Basili tutma menusunun icerigi - mesaja gore degisir: "Herkesten Sil"
  // sadece kendi mesajimizda, "Ilet" aramalarda (kind="call") gorunmuyor.
  // Ust bardaki secim-modu ikonlari - bkz. asagidaki header render'i. Tek
  // bir Sil ikonu var (iki ayri cop kutusu yerine): kendi mesajimizsa
  // "benden/herkesten" secimini SORAN bir onay (handleDeleteTap), degilse
  // dogrudan "benden sil" onayi.
  function handleDeleteTap(message: DMMessage) {
    closeActionMenu();
    const isMine = message.fromUserId === myUserId;
    if (!isMine) {
      handleDeleteForMe(message);
      return;
    }
    showAlert(t("dm.deleteChooseTitle"), t("dm.deleteChooseBody"), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("dm.actionDeleteForMe"), style: "destructive", onPress: () => handleDeleteForMe(message) },
      { text: t("dm.actionDeleteForEveryone"), style: "destructive", onPress: () => handleDeleteForEveryone(message) },
    ]);
  }
  const actionMenuItems: { label: string; icon: React.ReactNode; danger?: boolean; onPress: () => void }[] = (() => {
    const m = actionMenuMessage;
    if (!m) return [];
    const isPinned = pinnedMessages.some((p) => p.message.id === m.id);
    // Ikon boyutu ust bardaki sesli arama (Phone) ikonuyla AYNI (25) olsun
    // diye. Yanitla/Ilet, foto izleyicideki (PhotoViewerModal) ile AYNI ikon:
    // "undoArrow" (dogal yonu saga - Ilet), yatayda ters cevrilince Yanitla.
    const items: { label: string; icon: React.ReactNode; danger?: boolean; onPress: () => void }[] = [
      {
        label: t("dm.actionReply"),
        icon: (
          <View style={{ transform: [{ scaleX: -1 }] }}>
            <Icon name="undoArrow" size={25} color={TEXT} />
          </View>
        ),
        // Foto izleyicideki Yanitla ile AYNI: cevap cubugunu acar VE secim
        // modundan (digerleri gibi) cikar - eskiden sadece startReply
        // cagrilip secim modu ACIK kaliyordu.
        onPress: () => {
          startReply(m);
          closeActionMenu();
        },
      },
      { label: t("dm.actionCopy"), icon: <Copy size={25} color={TEXT} />, onPress: () => handleCopy(m) },
      {
        label: isPinned ? t("dm.actionUnpin") : t("dm.actionPin"),
        icon: isPinned ? <PinOff size={25} color={TEXT} /> : <Pin size={25} color={TEXT} />,
        onPress: () => handlePinToggle(m),
      },
    ];
    if (m.kind !== "call") {
      items.push({ label: t("dm.actionForward"), icon: <Icon name="undoArrow" size={25} color={TEXT} />, onPress: () => openForwardPicker(m) });
    }
    items.push({ label: t("dm.actionDeleteForMe"), icon: <Trash2 size={25} color={theme.danger} />, danger: true, onPress: () => handleDeleteTap(m) });
    return items;
  })();

  // Kilitli kayit cubugundaki ses dalgasi icin GERCEK mikrofon seviyesi
  // (recorderState.metering, dBFS - isMeteringEnabled ile acildi) her yeni
  // tick'te (durationMillis degisince) biriktiriliyor. -60dB..0dB araligi
  // 0..1'e, oradan da 4..18px cubuk yuksekligine esleniyor.
  if (voiceRecording && recorderState.durationMillis !== lastMeteringTickRef.current) {
    lastMeteringTickRef.current = recorderState.durationMillis;
    const db = typeof recorderState.metering === "number" ? recorderState.metering : -60;
    const norm = Math.max(0, Math.min(1, (db + 60) / 60));
    waveHistoryRef.current = [...waveHistoryRef.current, norm].slice(-WAVE_BAR_COUNT);
  }
  const waveHeights = Array.from({ length: WAVE_BAR_COUNT }, (_, i) => {
    const idx = waveHistoryRef.current.length - WAVE_BAR_COUNT + i;
    const norm = idx >= 0 ? waveHistoryRef.current[idx] : 0;
    return 4 + norm * 14;
  });

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={styles.header}>
        {actionMenuMessage ? (
          <>
            <TouchableOpacity onPress={closeActionMenu} hitSlop={10} style={{ marginTop: 1 }}>
              <View style={{ transform: [{ rotate: "90deg" }] }}>
                <CircleArrowDown size={22} color="#FFFFFF" />
              </View>
            </TouchableOpacity>
            <View style={styles.headerSelectionCount}>
              <Text style={styles.headerSelectionCountText}>1</Text>
            </View>
            {actionMenuItems.map((item) => (
              <TouchableOpacity key={item.label} onPress={item.onPress} hitSlop={10}>
                {item.icon}
              </TouchableOpacity>
            ))}
          </>
        ) : (
          <>
            <TouchableOpacity onPress={onBack} hitSlop={10} style={{ marginTop: 1 }}>
              <View style={{ transform: [{ rotate: "90deg" }] }}>
                <CircleArrowDown size={22} color="#FFFFFF" />
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.headerProfileTouch}
              activeOpacity={0.75}
              disabled={!onOpenInfo}
              onPress={() =>
                onOpenInfo?.({ peerAvatarUrl, muted, mediaMessages, fileMessages, onShowInChat: scrollToMessage, onToggleMute: toggleMute })
              }
            >
              <View style={{ marginLeft: -1 }}>
                <Avatar name={peer.name} avatarUrl={peerAvatarUrl} size={46} />
              </View>
              <View style={styles.headerTextBlock}>
                <View style={styles.headerNameRow}>
                  <Text style={styles.headerName}>{peer.name}</Text>
                </View>
                {!!peer.handle && <Text style={styles.headerHandle}>@{peer.handle}</Text>}
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => (onStartVoiceCall ? onStartVoiceCall(peerAvatarUrl) : placeholder(t("dm.callAction")))}
              hitSlop={10}
            >
              <Phone size={25} color={TEXT} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setMenuVisible(true)} hitSlop={10}>
              <MoreVertical size={27.5} color={TEXT} />
            </TouchableOpacity>
          </>
        )}
      </View>
      <LinearGradient
        colors={["#FFFFFF", "#38BDF8"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.headerDivider}
      />

      {searchVisible && (
        <View style={styles.searchBar}>
          <Search size={15} color={theme.textMuted} />
          <TextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder={t("dm.searchPlaceholder")}
            placeholderTextColor={theme.textMuted}
            autoFocus
          />
          <TouchableOpacity
            onPress={() => {
              setSearchVisible(false);
              setSearchQuery("");
            }}
            hitSlop={8}
          >
            <X size={16} color={theme.textMuted} />
          </TouchableOpacity>
        </View>
      )}

      {expiresAfterMs !== null && (
        <TouchableOpacity style={styles.expiryBanner} onPress={() => setExpiryVisible(true)}>
          <Icon name="clock" size={13} color={ACCENT} />
          <Text style={styles.expiryBannerText}>{t("dm.expiryBannerText", { duration: expiryLabel })}</Text>
        </TouchableOpacity>
      )}

      {pinnedMessages.length > 0 &&
        (() => {
          // Sohbetteki konumuna gore eskiden yeniye siralanmis liste -
          // pinnedCursor bunun icinde su an gosterilen mesaji isaret eder.
          const orderedPins = [...pinnedMessages].sort((a, b) => a.message.createdAt - b.message.createdAt);
          const cursor = Math.min(pinnedCursor, orderedPins.length - 1);
          const shown = orderedPins[cursor].message;
          return (
            <TouchableOpacity
              style={styles.pinnedBanner}
              activeOpacity={0.75}
              onPress={() => {
                scrollToMessage(shown.id);
                setPinnedCursor(cursor === 0 ? orderedPins.length - 1 : cursor - 1);
              }}
            >
              <View style={styles.pinnedBannerQuote}>
                <Pin size={18} color="#FFFFFF" />
                <View style={styles.pinnedBannerQuoteText}>
                  <ReplyPreviewContent
                    fromName={shown.fromUserId === myUserId ? t("dm.you") : shown.fromName}
                    text={shown.text}
                    kind={shown.kind}
                    mediaUrl={shown.mediaUrl}
                    callIsVideo={shown.callIsVideo}
                    variant="bubble"
                  />
                </View>
                <Text style={styles.pinnedBannerCounter}>
                  {cursor + 1}/{orderedPins.length}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })()}

      <FlatList
        ref={listRef}
        data={displayItems}
        keyExtractor={(d) => (d.type === "single" ? d.message.id : d.id)}
        contentContainerStyle={[styles.listContent, recordingLocked && styles.listContentLocked]}
        onScrollToIndexFailed={(info) => {
          listRef.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: false });
          const id = pendingScrollMessageId.current;
          if (id) setTimeout(() => scrollToMessage(id), 100);
        }}
        ListEmptyComponent={
          loading ? <LoadingView /> : <Text style={styles.mediaEmpty}>{t("dm.noMessagesYet")}</Text>
        }
        ListHeaderComponent={
          <View style={styles.encryptionNoticeWrap}>
            <View style={styles.encryptionNotice}>
              <View style={styles.encryptionNoticeRow}>
                <View style={styles.encryptionNoticeIconWrap}>
                  <LockClosedIcon size={12} color="#FFFFFF" />
                </View>
                <Text style={styles.encryptionNoticeText}>{t("dm.encryptionNotice")}</Text>
              </View>
            </View>
          </View>
        }
        renderItem={({ item: displayItem, index }) => {
          const prevDisplay = displayItems[index - 1];
          const prevFromUserId = prevDisplay ? (prevDisplay.type === "single" ? prevDisplay.message.fromUserId : prevDisplay.fromUserId) : undefined;
          if (displayItem.type === "photoGroup") {
            const isMine = displayItem.fromUserId === myUserId;
            const grouped = !!prevFromUserId && prevFromUserId === displayItem.fromUserId;
            return (
              <View
                style={[
                  styles.messageRow,
                  isMine ? styles.messageRowMine : styles.messageRowTheirs,
                  !grouped && styles.messageRowNewGroup,
                ]}
              >
                <TouchableOpacity
                  activeOpacity={0.85}
                  style={styles.bubbleWrap}
                  onPress={() => {}}
                  onLongPress={() => openActionMenu(displayItem.photos[displayItem.photos.length - 1])}
                >
                  <View
                    style={[
                      styles.bubble,
                      isMine ? styles.bubbleMine : styles.bubbleTheirs,
                      !grouped && (isMine ? styles.bubbleMineFirst : styles.bubbleTheirsFirst),
                      styles.bubblePhotoPad,
                    ]}
                  >
                    {!grouped && <BubbleTail color={isMine ? BUBBLE_MINE_COLOR : "#1E293B"} mine={isMine} />}
                    <PhotoGridBubble
                      photos={displayItem.photos.map((p) => ({ uri: p.mediaUrl! }))}
                      size={280}
                      senderName={displayItem.photos[0].fromName}
                      sentAt={displayItem.createdAt}
                      onReply={() => startReply(displayItem.photos[displayItem.photos.length - 1])}
                      onReport={() => setReportVisible(true)}
                    />
                    <View style={[styles.metaRow, styles.metaRowPhotoOverlay]}>
                      <View style={styles.metaRowRight}>
                        <Text style={styles.metaTime}>{formatMessageTime(displayItem.createdAt, i18n.language)}</Text>
                        {isMine && (
                          <MaterialIcons
                            name={displayItem.createdAt <= seenUpTo ? "done-all" : "done"}
                            size={16}
                            color={displayItem.createdAt <= seenUpTo ? "#FFFFFF" : "rgba(255,255,255,0.65)"}
                          />
                        )}
                      </View>
                    </View>
                  </View>
                </TouchableOpacity>
              </View>
            );
          }
          const item = displayItem.message;
          const isMine = item.fromUserId === myUserId;
          const seen = isMine && item.createdAt <= seenUpTo;
          // Oda sohbetindeki (RoomScreen.tsx) gruplama ile AYNI mantik: arka
          // arkaya gelen mesajlarda gonderici avatari sadece grubun ilkinde
          // gosterilir, devaminda bubble hizasini bozmamak icin ayni genislikte
          // bos bir spacer konur, satirlar arasi bosluk da daraltilir.
          const groupedWithPrevSingle = !!prevFromUserId && prevFromUserId === item.fromUserId;
          return (
            <DMBubbleRow
              item={item}
              isMine={isMine}
              groupedWithPrev={groupedWithPrevSingle}
              seen={seen}
              onTap={() => handleMessageTap(item)}
              onReply={() => startReply(item)}
              onReport={() => setReportVisible(true)}
              onLongPress={() => openActionMenu(item)}
              onConsumeVoiceOnce={handleConsumeVoiceOnce}
              onConsumeMediaOnce={handleConsumeMediaOnce}
            />
          );
        }}
      />

      <View
        style={[
          styles.inputBar,
          replyingTo && styles.inputBarWithReply,
          voiceRecording && recordingLocked && styles.inputBarLockedWrap,
        ]}
      >
        {voiceRecording && !recordingLocked && (
          <Animated.View pointerEvents="none" style={[styles.recordLockHintWrap, { transform: [{ translateY: recordDragY }] }]}>
            <View style={{ marginTop: 5, alignItems: "center" }}>
              <LockClosedIcon size={17} color="#FFFFFF" strokeWidth={2} />
              <ChevronUp size={15} color="#FFFFFF" style={{ marginTop: -2 }} />
            </View>
          </Animated.View>
        )}
        {voiceRecording && recordingLocked ? (
          // Kilitli mod: sagi solu tam kaplayan, 100px yukseklikte, ekranin
          // ALTINA TAM OTURAN tek parca bir cubuk (pill + ayri yuvarlak
          // dugme YOK artik - WhatsApp'in kilitli kayit cubugu gibi).
          <View style={styles.recordingLockedBar}>
            <View style={[styles.recordLockedTopRow, { transform: [{ translateY: -5 }] }]}>
              <View style={{ height: 58, justifyContent: "center", marginLeft: 6.9 }}>
                <Text style={[styles.recordingTimeLocked, { transform: [{ translateY: -1 }] }]}>
                  {formatRecordingTime(recorderState.durationMillis)}
                </Text>
              </View>
              <View style={styles.recordLiveWave}>
                {waveHeights.map((h, i) => (
                  <View key={i} style={[styles.recordLiveWaveBar, { height: h }]} />
                ))}
              </View>
              {/* Tek-gonderimlik anahtari - basilmadan once "G" (noktali
                  halka), basilinca "H" (dolu daire) gorunur - kullanicinin
                  gonderdigi iki referans gorsel, siyah alpha'ya cevrilerek
                  (bkz. CustomIcons.tsx VoiceOnce*Icon). */}
              <TouchableOpacity
                onPress={() => setVoiceOnceView((v) => !v)}
                hitSlop={8}
                style={{ width: 58, height: 58, marginRight: -1.5, alignItems: "center", justifyContent: "center" }}
              >
                {voiceOnceView ? (
                  <VoiceOnceFilledIcon size={58} color="#FFFFFF" />
                ) : (
                  <VoiceOnceRingIcon size={58} color={MUTED} />
                )}
              </TouchableOpacity>
            </View>
            <View style={styles.recordLockedBottomRow}>
              <TouchableOpacity
                onPress={cancelVoiceRecording}
                hitSlop={8}
                style={[styles.inputRoundBtn, { backgroundColor: "#FF4D4F" }]}
              >
                <Trash2 size={20} color="#FFFFFF" />
              </TouchableOpacity>
              <TouchableOpacity onPress={pauseResumeRecording} hitSlop={8} style={styles.recordPausePill}>
                {recordingPaused ? <Play size={20} color={TEXT} /> : <Pause size={20} color={TEXT} />}
                <Text style={[styles.recordPausePillText, { transform: [{ translateY: 1 }] }]}>
                  {recordingPaused ? t("dm.recordResume") : t("dm.recordPause")}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.inputRoundBtn} onPress={sendVoiceRecording} disabled={sendingVoice} hitSlop={8}>
                {sendingVoice ? <ActivityIndicator size="small" color="#141210" /> : <Send size={20} color="#141210" />}
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <>
            {/* Mikrofon dugmesi (asagida) surukleme sirasinda AYNI DOM
                node'unda kalmali - "voiceRecording" true olunca farkli bir
                JSX dalina gecip yeniden mount olursa (eskiden boyleydi)
                tarayici o anda devam eden fare/dokunma yakalamasini
                kaybediyor (PanResponder terminate oluyor, surukleme
                koptugu icin kayit otomatik iptal oluyordu). Bu yuzden pill
                ICERIGI duruma gore degisse de, sag alttaki yuvarlak dugme
                TEK bir JSX konumunda tutuluyor. */}
            <View
              style={[
                styles.inputPill,
                voiceRecording ? styles.inputPillNormal : replyingTo ? styles.inputPillWithReply : styles.inputPillNormal,
                voiceRecording && styles.recordingPill,
              ]}
            >
              {voiceRecording ? (
                <>
                  <TouchableOpacity onPress={cancelVoiceRecording} hitSlop={8}>
                    <Trash2 size={20} color={MUTED} />
                  </TouchableOpacity>
                  <View style={styles.recordingDot} />
                  <Text style={styles.recordingTime}>{formatRecordingTime(recorderState.durationMillis)}</Text>
                  <View style={{ flex: 1 }} />
                  {/* GERCEK sebep marginLeft degil - onceki solundaki
                      "flex:1" bosluk dolduruyucu, bu ogeye verilen HER
                      marginLeft'i otomatik olarak TELAFI EDIP (kendi
                      genisligini o kadar ARTTIRIP) gorsel kaymayi iptal
                      ediyordu. "transform: translateX" ise layout
                      hesabina KATILMADIGI icin (sadece gorsel) bu sorunu
                      yasamiyor - sabit kayma icin AYNI transform dizisine
                      ikinci bir translateX ekleniyor. */}
                  <Animated.Text
                    style={[
                      styles.recordCancelHintText,
                      {
                        opacity: recordCancelHintOpacity,
                        transform: [{ translateX: Animated.add(recordDragX, -15) }],
                      },
                    ]}
                    numberOfLines={1}
                  >
                    {"‹ " + t("dm.recordSlideToCancel")}
                  </Animated.Text>
                </>
              ) : (
                <>
                  {replyingTo && (
                    <View style={styles.replyPreviewCard}>
                      <View style={styles.replyBarAccent} />
                      <View style={styles.replyBarText}>
                        <ReplyPreviewContent
                          fromName={replyingTo.fromName}
                          text={replyingTo.text}
                          kind={replyingTo.kind}
                          mediaUrl={replyingTo.mediaUrl}
                          variant="composer"
                        />
                      </View>
                      <TouchableOpacity onPress={() => setReplyingTo(null)} hitSlop={8} style={styles.replyBarClose}>
                        <Icon name="close" size={16} color={MUTED} />
                      </TouchableOpacity>
                    </View>
                  )}
                  <View style={styles.inputIconsRow}>
                    <TouchableOpacity onPress={insertMention} hitSlop={6}>
                      <Laugh size={25} color="#9CA3AF" />
                    </TouchableOpacity>
                    <TextInput
                      style={styles.input}
                      value={input}
                      onChangeText={setInput}
                      placeholder={t("dm.messagePlaceholder")}
                      placeholderTextColor={MUTED}
                      onSubmitEditing={sendMessage}
                    />
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginLeft: -33 }}>
                      <TouchableOpacity onPress={() => setAttachSheetVisible(true)} hitSlop={6}>
                        <View style={{ transform: [{ rotate: "-45deg" }] }}><Paperclip size={19} color="#9CA3AF" /></View>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={openCamera} hitSlop={6} style={{ marginLeft: 5 }}>
                        <MaterialCommunityIcons name="camera-outline" size={25} color="#9CA3AF" />
                      </TouchableOpacity>
                    </View>
                  </View>
                </>
              )}
            </View>
            {!voiceRecording && input.trim() ? (
              <TouchableOpacity style={styles.inputRoundBtn} onPress={sendMessage} hitSlop={8}>
                <Send size={20} color="#141210" />
              </TouchableOpacity>
            ) : (
              <View style={styles.inputRoundBtn} {...micPan.panHandlers}>
                <MicrophoneIcon size={22.5} color="#141210" strokeWidth={2} />
              </View>
            )}
          </>
        )}
      </View>

      <Modal visible={menuVisible} transparent animationType="fade" onRequestClose={() => setMenuVisible(false)} statusBarTranslucent>
        <TouchableOpacity style={styles.menuOverlay} activeOpacity={1} onPress={() => setMenuVisible(false)}>
          <View style={styles.menuCard}>
            {menuItems.map((item) => (
              <TouchableOpacity
                key={item.label}
                style={styles.menuRow}
                onPress={() => {
                  setMenuVisible(false);
                  item.onPress();
                }}
              >
                {item.icon}
                <Text style={[styles.menuRowText, item.danger && { color: theme.danger }]}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Foto izleyicideki (PhotoViewerModal.tsx) "İlet" ile AYNI ekran -
          FriendsScreen'in kendi arkadas listesi/arama/coklu secimi, sadece
          "Davet Ekle" extra'lari gizli ve kendi basligi/buton metniyle. */}
      <Modal visible={!!forwardTarget} animationType="slide" onRequestClose={() => setForwardTarget(null)} statusBarTranslucent>
        <FriendsScreen
          onBack={() => setForwardTarget(null)}
          onOpenDM={() => {}}
          onOpenParticipant={() => {}}
          inviteMode
          hideInviteExtras
          headerTitle={t("dm.forwardTitle")}
          confirmButtonLabel={(count) => t("dm.forwardSendCount", { count })}
          onSendInvites={forwardToUsers}
        />
      </Modal>

      <Modal visible={expiryVisible} transparent animationType="slide" onRequestClose={() => setExpiryVisible(false)} statusBarTranslucent>
        <TouchableOpacity style={styles.sheetOverlay} activeOpacity={1} onPress={() => setExpiryVisible(false)}>
          <View style={styles.sheetCard}>
            <View style={styles.sheetHandleTop} />
            <Text style={styles.sheetTitle}>{t("dm.menuExpiry")}</Text>
            <Text style={styles.sheetSubtitle}>{t("dm.expirySubtitle")}</Text>
            {expiryOptions.map((opt) => (
              <TouchableOpacity
                key={opt.label}
                style={[styles.sheetRow, expiresAfterMs === opt.ms && styles.sheetRowSelected]}
                onPress={() => chooseExpiry(opt.ms)}
              >
                <Text style={styles.sheetRowText}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal visible={reportVisible} transparent animationType="slide" onRequestClose={() => setReportVisible(false)} statusBarTranslucent>
        <TouchableOpacity style={styles.sheetOverlay} activeOpacity={1} onPress={() => setReportVisible(false)}>
          <TouchableOpacity activeOpacity={1} style={styles.sheetCard}>
            <View style={styles.sheetHandleTop} />
            <Text style={styles.sheetTitle}>{t("dm.reportTitle", { name: peer.name })}</Text>
            <Text style={styles.sheetSubtitle}>{t("dm.reportSubtitle")}</Text>
            <TextInput
              style={styles.reportInput}
              value={reportReason}
              onChangeText={setReportReason}
              placeholder={t("dm.reportPlaceholder")}
              placeholderTextColor={MUTED}
              multiline
              autoFocus
            />
            <LinearGradient
              colors={["#FFFFFF", "#38BDF8"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[styles.reportSubmitGradientBorder, !reportReason.trim() && styles.reportSubmitBtnDisabled]}
            >
              <TouchableOpacity style={styles.reportSubmitBtnDark} onPress={submitReport} disabled={!reportReason.trim()}>
                <Text style={styles.reportSubmitBtnDarkText}>{t("dm.reportSend")}</Text>
              </TouchableOpacity>
            </LinearGradient>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <Modal visible={attachSheetVisible} transparent animationType="slide" onRequestClose={() => setAttachSheetVisible(false)} statusBarTranslucent>
        <TouchableOpacity style={styles.sheetOverlay} activeOpacity={1} onPress={() => setAttachSheetVisible(false)}>
          <TouchableOpacity activeOpacity={1} style={styles.attachSheet}>
            {/* Kullanici: "basınca anlık fotoğraf çekebilse ikon dışında
                kutuya basınca kamerayı açsa" - kucuk ikon GERCEK anlik
                cekim (expo-camera), satirin geri kalani OS'in kendi kamera
                uygulamasini acan tam kontrollu akis. */}
            <TouchableOpacity style={styles.attachRow} onPress={openCamera}>
              <View style={styles.attachIconWrap}>
                <CameraIcon size={20} color={ACCENT} />
                <TouchableOpacity style={styles.attachQuickIcon} onPress={startQuickCapture} hitSlop={6}>
                  <CameraIcon size={12} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
              <Text style={styles.attachRowText}>{t("dm.attachCamera")}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.attachRow} onPress={pickImage}>
              <View style={styles.attachIconWrap}>
                <ImageIcon size={20} color={ACCENT} />
              </View>
              <Text style={styles.attachRowText}>{t("dm.attachGallery")}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.attachRow} onPress={sendLocation}>
              <View style={styles.attachIconWrap}>
                <MapPin size={20} color={ACCENT} />
              </View>
              <Text style={styles.attachRowText}>{t("dm.attachLocation")}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.attachRow} onPress={pickAndSendFile} disabled={sendingFile}>
              <View style={styles.attachIconWrap}>
                {sendingFile ? <ActivityIndicator size="small" color={ACCENT} /> : <FileTextIcon size={20} color={ACCENT} />}
              </View>
              <Text style={styles.attachRowText}>{t("dm.attachFile")}</Text>
            </TouchableOpacity>
            <View style={styles.sheetHandle} />
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {quickCaptureActive && cameraPermission?.granted && (
        <View style={styles.quickCameraOverlay}>
          <CameraView
            ref={cameraRef}
            style={styles.quickCameraView}
            facing={quickCameraFacing}
            flash={quickCameraFlash}
            onCameraReady={handleQuickCameraReady}
          />
          <View style={styles.quickCameraTopBar}>
            <TouchableOpacity style={styles.quickCameraTopBtn} onPress={() => setQuickCaptureActive(false)} hitSlop={10}>
              <Icon name="close" size={28} color="#FFFFFF" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.quickCameraTopBtn} onPress={toggleQuickCameraFlash} hitSlop={10}>
              <Ionicons name={quickCameraFlash === "on" ? "flash-outline" : "flash-off-outline"} size={26} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          {/* Kullanici: "Video moduna aldığında yukarıda süre çubuğu
              olmalı çektiğim süreyi gösteren" - kayit SIRASINDA ust barla
              AYNI hizada, ortada kirmizi nokta + gecen sure rozeti. */}
          {isRecordingVideo && (
            <View style={styles.quickCameraRecTimerWrap} pointerEvents="none">
              <View style={styles.quickCameraRecTimerPill}>
                <View style={styles.quickCameraRecDot} />
                <Text style={styles.quickCameraRecTimerText}>{formatDuration(recordingElapsedSec)}</Text>
              </View>
            </View>
          )}
          {/* Kullanici: "...son fotoğraflarımın ve videolarımın gözüktüğü
              bi alan yapsak deklanşörün üstüne..." - deklansorun USTUNDE,
              ekran genisligini kaplayan kaydirmali son medya seridi;
              hap isaretini asagi kaydirinca gizlenir, yukari kaydirinca
              GERCEK galeri ekrani acilir. */}
          <View style={styles.quickCameraFilmstripWrap} pointerEvents="box-none">
            <CameraFilmstrip
              visible={quickCaptureActive}
              onOpenGallery={handleQuickGalleryPress}
              onPickAsset={handleFilmstripPickAsset}
            />
          </View>
          <View style={styles.quickCameraBottomBar}>
            {/* Galeri SOL kenari X butonuyla AYNI hizada (kullanicinin
                istegi) - bkz. ust bardaki AYNI left:16. */}
            <TouchableOpacity style={styles.quickCameraTopBtn} onPress={handleQuickGalleryPress} hitSlop={10}>
              <ImageIcon size={24} color="#FFFFFF" />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.quickCameraShutterOuter, quickCameraMode === "video" && styles.quickCameraShutterOuterVideo]}
              onPress={handleQuickShutterPress}
              disabled={!quickCameraReady || (quickCameraMode === "photo" && capturingQuickPhoto)}
              hitSlop={8}
            >
              <View
                style={[
                  styles.quickCameraShutterInner,
                  quickCameraMode === "video" && styles.quickCameraShutterInnerVideo,
                  capturingQuickPhoto && styles.quickCameraShutterInnerActive,
                  isRecordingVideo && styles.quickCameraShutterInnerRecording,
                ]}
              />
            </TouchableOpacity>
            {/* Kamera cevirme SAG kenari flas butonuyla AYNI hizada. */}
            <TouchableOpacity
              style={styles.quickCameraTopBtn}
              onPress={toggleQuickCameraFacing}
              disabled={isRecordingVideo}
              hitSlop={10}
            >
              <MaterialCommunityIcons name="camera-flip-outline" size={26} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          {/* Kullanici: "...bu fotoğraf çekme ekranı bir de video çekme
              ekranı ayarlasak" - alt bosluğun EN USTUNE (deklansor
              satirinin hemen altindaki siyah serit) Fotograf/Video mod
              secici eklendi. */}
          <View style={styles.quickCameraModeRow}>
            <TouchableOpacity onPress={() => !isRecordingVideo && setQuickCameraMode("video")} hitSlop={10}>
              <Text style={[styles.quickCameraModeText, quickCameraMode === "video" && styles.quickCameraModeTextActive]}>
                {t("dm.cameraModeVideo")}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => !isRecordingVideo && setQuickCameraMode("photo")} hitSlop={10}>
              <Text style={[styles.quickCameraModeText, quickCameraMode === "photo" && styles.quickCameraModeTextActive]}>
                {t("dm.cameraModePhoto")}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <GalleryPickerModal
        visible={galleryPickerVisible}
        onClose={() => setGalleryPickerVisible(false)}
        onConfirm={handleGalleryPickerConfirm}
      />

      <SendMediaSheet
        visible={pendingImages.length > 0}
        images={pendingImages}
        uploading={uploadingImage}
        uploadProgress={uploadProgress}
        onCancel={() => setPendingImages([])}
        onRemoveImage={removePendingImage}
        onAddMore={pickImage}
        onReplaceImage={replacePendingImage}
        onSend={sendPickedImage}
      />

      <SendVideoSheet
        visible={videoQueue.length > 0}
        uri={videoQueue[0]?.uri || null}
        uploading={uploadingVideo}
        uploadProgress={videoUploadProgress}
        onCancel={() => setVideoQueue((prev) => prev.slice(1))}
        onSend={(caption, meta) => sendPickedVideo(videoQueue[0].uri, videoQueue[0].mimeType, caption, meta)}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 18,
    paddingTop: 44,
    paddingBottom: 14,
    // Secim modunda (X + sayi + ikonlar) icerik avatardan (46px) daha
    // KISA oldugu icin bu olmadan satirin toplam yuksekligi kuculuyor ve
    // altindaki gradyan cizgi yukari kayiyormus gibi gorunuyordu - satirin
    // yuksekligi iki modda da AYNI kalsin diye ("minHeight" tek basina RN
    // Web'de bu flex satirinda islemedi, "height" sabitiyle zorluyoruz).
    // (116 -> 104: kullanicinin istegi uzerine ust bar biraz alcaltildi -
    // paddingTop/paddingBottom da ORANTILI azaltildi ki icerik yuksekligi
    // (46px) avatarla AYNI kalsin.)
    height: 104,
  },
  // Eski duz "#1E1A17" alt cizgi yerine - uygulamanin genelindeki AYNI
  // beyazdan maviye gecen gradyan (kullanicinin istegi). Header'in ICINDE
  // degil, hemen ALTINDA normal akista (absolute degil) render ediliyor -
  // boylece altina gelen (sabitlenmis mesaj bannerI gibi) herhangi bir
  // oge araya bosluk girmeden TAM OTURUYOR.
  headerDivider: { height: 1, width: "100%" },
  headerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#3A2F22",
    alignItems: "center",
    justifyContent: "center",
  },
  headerAvatarInitial: { color: ACCENT, fontSize: 16, fontWeight: "700" },
  headerTextBlock: { flex: 1, marginLeft: -2 },
  headerName: { color: TEXT, fontSize: 18, fontWeight: "700" },
  // Basili tutma SONRASI ust bar - telefon/uc nokta yerini secim ikonlarina,
  // profil blogu yerini "N mesaj secildi" yazisina birakir.
  headerSelectionCount: { flex: 1 },
  headerSelectionCountText: { color: TEXT, fontSize: 20, fontWeight: "700" },
  headerHandle: { color: MUTED, fontSize: 13, marginTop: 1 },
  // Satirlar arasi varsayilan bosluk DAR tutulup (4) ayni gondericiden arka
  // arkaya gelen mesajlar birbirine yakin durur, yeni bir grup basladiginda
  // (messageRowNewGroup) ekstra ust bosluk eklenir - RoomScreen.tsx'teki
  // gruplama hissiyle AYNI.
  // En son mesaj mesaj yazma kutusuna YAPISMASIN, HAFIF bir bosluk kalsin
  // istegi (once 26/20/10/5 denendi - hepsi COK fazla geldi, kullanicinin
  // istegi).
  listContent: { padding: 16, paddingBottom: 1, gap: 4 },
  // Kilitli kayit cubugu acikken son mesaj kutunun 1px yerine 5px ustunde
  // dursun istendi - SADECE bu durumda uygulanir, normal 1px'i etkilemez.
  listContentLocked: { paddingBottom: 5 },
  // "flex-start" (en ustten hizali) - "flex-end" iken fotograf gibi uzun
  // balonlarda gonderici avatari balonun ALT ucuna kayiyordu, oysa UST ucuyla
  // hizali olmali (bkz. RoomScreen.tsx messageRow'daki AYNI tercih).
  messageRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, maxWidth: "100%" },
  messageRowNewGroup: { marginTop: 8 },
  replyHint: { position: "absolute", top: 0, bottom: 0, width: 20, alignItems: "center", justifyContent: "center" },
  messageRowMine: { justifyContent: "flex-end" },
  messageRowTheirs: { justifyContent: "flex-start" },
  // WhatsApp'taki gibi GERCEK renkli balonlar (kullanicinin istegi).
  bubbleWrap: { maxWidth: "75%", position: "relative" },
  // Kullanicinin istegi: TUM kenarlar (ilk balonun cikintili sag-ust kosesiyle
  // AYNI) keskin/az yuvarlak dursun.
  bubble: { paddingHorizontal: 13, paddingVertical: 8, borderRadius: 8, position: "relative" },
  // Sesli mesajda play+dalga satiri (30px) BOS kalan toplam alana gore dikey
  // ortalansin diye ust/alt bosluk boyle paylastirildi - TOPLAM balon
  // yuksekligi degismiyor (8+3+8=19 idi, simdi 18+1+0=19).
  bubbleVoicePad: { paddingTop: 13, paddingBottom: 10 },
  // Konum kartinin kendisi genisletildi/yukseltildi (bkz. LocationMessageBubble),
  // balonun kendi sol/sag/ust bosluğu da 3px'e indirilerek karta neredeyse
  // kenara kadar yer acildi (alt tarafta gonderim saati oldugu icin o
  // paylasilan 8px'e dokunulmadi).
  bubbleLocationPad: { paddingLeft: 3, paddingRight: 3, paddingTop: 3 },
  // Dosya karti icin de AYNI mantik - bkz. FileMessageBubble'daki buyutme.
  bubbleFilePad: { paddingLeft: 3, paddingRight: 3, paddingTop: 3 },
  bubbleCallPad: { paddingLeft: 3, paddingRight: 3, paddingTop: 3, paddingBottom: 3 },
  // Fotograf balonu icin de AYNI mantik - ChatImageBubble'in kendi boyutu da
  // buyutuldu (bkz. asagidaki size/borderRadius prop'lari).
  bubblePhotoPad: { paddingLeft: 3, paddingRight: 3, paddingTop: 3, paddingBottom: 3 },
  // Saat/tik fotografin alt-sag kosesine BINDIRILIYOR (normal akistan
  // cikarilip mutlak konumlandiriliyor) - fotograf boylece balonun en
  // altina kadar (3px) buyuyebiliyor, altinda ayri bir satir kalmiyor.
  metaRowPhotoOverlay: {
    position: "absolute",
    bottom: 8,
    right: 8,
    marginTop: 0,
    backgroundColor: "rgba(0,0,0,0.45)",
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  // Arama kutusundaki saat icin AYNI konum (sag alt, kutunun icinde) ama
  // fotograftaki gibi arkasinda cerceve/kutu YOK (kullanicinin istegi) -
  // kartin kendi arka plani zaten yeterince okunabilir.
  metaRowCallOverlay: {
    position: "absolute",
    bottom: 8,
    right: 10,
    marginTop: 0,
  },
  bubbleMine: { backgroundColor: BUBBLE_MINE_COLOR },
  // Balonun disina tasan, WhatsApp'taki gibi TEK bir bezier egrisiyle
  // cizilen yumusak kuyruk (bkz. BubbleTail) - kirik ucgen cizgisi degil.
  bubbleMineFirst: { borderTopRightRadius: 0 },
  bubbleTheirs: { backgroundColor: "#1E293B" },
  bubbleTheirsFirst: { borderTopLeftRadius: 0 },
  bubbleTailSvg: { position: "absolute", top: 0 },
  bubbleTailSvgMine: { right: -6 },
  bubbleTailSvgTheirs: { left: -6 },
  replyQuote: {
    backgroundColor: "rgba(255,255,255,0.14)",
    borderLeftWidth: 3,
    borderLeftColor: "rgba(255,255,255,0.85)",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    marginHorizontal: -7,
    marginTop: -2,
    marginBottom: 4,
  },
  // Metin her zaman SOLA hizali - balonun kendisi zaten sag/sol tarafa
  // yaslanmis oluyor (WhatsApp'in gercek davranisi).
  bubbleText: { color: TEXT, fontSize: 16, lineHeight: 21 },
  reactionBadgeRow: {
    position: "absolute",
    flexDirection: "row",
    gap: 2,
  },
  reactionBadgeRowMine: { left: 9, bottom: 5 },
  reactionBadgeRowTheirs: { left: 9, bottom: 5 },
  // Kullanici: tepki rozeti icin "pill" (hap) seklinde, kalin beyaz
  // cerceveli, mavi dolgulu bir cerceve istedi ("5 numara" + "Mavi").
  reactionBadgeChip: {
    height: 19,
    paddingHorizontal: 6,
    borderRadius: 999,
    borderWidth: 1.4,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#000000",
    borderColor: "#FFFFFF",
  },
  reactionBadgeEmoji: { fontSize: 12 },
  headerProfileTouch: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  mediaCaption: { color: TEXT, fontSize: 15, marginTop: 5, maxWidth: 220 },
  attachSheet: {
    backgroundColor: "#141210",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingTop: 18,
    paddingBottom: 30,
    paddingHorizontal: 20,
    alignItems: "center",
  },
  attachRow: { width: "100%", flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 14 },
  attachIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(14,165,233,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  attachQuickIcon: {
    position: "absolute",
    top: -4,
    right: -4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: ACCENT,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "#141210",
  },
  attachRowText: { color: TEXT, fontSize: 15, fontWeight: "600" },
  quickCameraOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "#000000" },
  quickCameraView: { flex: 1, marginTop: 50, marginBottom: 70 },
  quickCameraTopBar: {
    position: "absolute",
    top: 70,
    left: 16,
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  quickCameraRecTimerWrap: {
    position: "absolute",
    top: 70,
    left: 0,
    right: 0,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  quickCameraRecTimerPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  quickCameraRecDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#FF3B30" },
  quickCameraRecTimerText: { color: "#FFFFFF", fontSize: 13, fontWeight: "700", fontVariant: ["tabular-nums"] },
  quickCameraTopBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  // Deklansorun SOL kenari X butonuyla, kamera cevirmenin SAG kenari flas
  // butonuyla AYNI hizada (left:16/right:16 - ust barla AYNI) - kullanicinin
  // istegi. Galeri ikonu ortada, diger ucuyle AYNI cerceveli.
  quickCameraFilmstripWrap: {
    position: "absolute",
    bottom: 168,
    left: 0,
    right: 0,
  },
  quickCameraBottomBar: {
    position: "absolute",
    bottom: 86,
    left: 16,
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  quickCameraShutterOuter: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 4,
    borderColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  quickCameraShutterInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: "#FFFFFF",
  },
  quickCameraShutterInnerActive: {
    backgroundColor: "rgba(255,255,255,0.5)",
  },
  quickCameraShutterOuterVideo: { borderColor: "#FF3B30" },
  quickCameraShutterInnerVideo: { backgroundColor: "#FF3B30" },
  quickCameraShutterInnerRecording: {
    width: 28,
    height: 28,
    borderRadius: 6,
  },
  quickCameraModeRow: {
    position: "absolute",
    bottom: 50,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    gap: 24,
  },
  quickCameraModeText: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 13,
    fontWeight: "700",
  },
  quickCameraModeTextActive: { color: "#FFFFFF" },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 3, alignSelf: "flex-end" },
  // Sesli mesajda bu satir TUM genisligi kaplar - sure SOLDA (dalganin
  // basladigi hizada), saat+tik SAGDA kalsin diye.
  metaRowVoice: { alignSelf: "stretch", justifyContent: "space-between", marginTop: -4 },
  metaRowRight: { flexDirection: "row", alignItems: "center", gap: 4 },
  metaTime: { color: "rgba(255,255,255,0.65)", fontSize: 11 },
  // Sesli mesajin sure etiketi - dikeyde saatle AYNI satirda, yatayda dalganin
  // basladigi yere (play butonu genisligi + aralarindaki bosluk) hizali.
  voiceMetaTime: { color: "rgba(255,255,255,0.65)", fontSize: 11, marginLeft: 38 },
  // Referans goruntudeki gibi: cevap onizlemesi, mesaj kutusunun (pill) KENDI
  // SINIRI DEGIL - pill'in ICINDE, kenarlardan bosluklu, kendi ayri (daha
  // acik renk) kucuk bir kart olarak duruyor. Disaridaki tek buyuk kutu
  // (pill) her zaman AYNI yuvarlak hatli - cevap varken sadece boy uzuyor.
  replyPreviewCard: {
    flexDirection: "row",
    alignItems: "stretch",
    backgroundColor: "#4A4A50",
    borderRadius: 10,
    overflow: "hidden",
    marginHorizontal: 8,
    // marginTop duseldi (14->11), kartin EKRANDAKI konumu AYNI kalsin diye
    // translateY o kadar artti (3->6) - boylece cevap blogunu SARAN disaridaki
    // kutunun (pill) toplam yuksekligi 3px kuculdu, kartin kendisi ve
    // mesaj kutusu (inputIconsRow) YERINDEN KIPIRDAMADI.
    marginTop: 3,
    transform: [{ translateY: 6 }],
  },
  replyBarAccent: { width: 4, backgroundColor: "#FFFFFF" },
  replyBarText: { flex: 1, paddingVertical: 12, paddingHorizontal: 10 },
  replyBarClose: { paddingHorizontal: 12, justifyContent: "flex-start", paddingTop: 12 },
  inputBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 15,
  },
  inputBarWithReply: { alignItems: "flex-end" },
  // Kilitli kayit modunda inputBar'in kendi dolgusu (sag/sol/alt) iptal
  // edilir - cubuk EKRANIN TAM kenarlarina otursun diye (bkz. asagidaki
  // recordingLockedBar - dolgu artik ONUN kendi icinde).
  inputBarLockedWrap: { paddingHorizontal: 0, paddingTop: 0, paddingBottom: 0 },
  // Kilitli kayit cubugu - sagi solu TAM kaplar, 100px sabit yukseklikte,
  // ekranin altina TAM oturur (WhatsApp'taki kilitli kayit cubugu gibi).
  recordingLockedBar: {
    width: "100%",
    height: 150,
    flexDirection: "column",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 24,
    // Profil ekranindaki kutularla AYNI koyu lacivert - bkz. yukarida
    // ayni renk kullanan actionSquare/encryptionNotice.
    backgroundColor: "#15202B",
  },
  // Ust satir: kirmizi nokta + sure solda, tek-gonderimlik rozeti sagda.
  recordLockedTopRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  // Sure yazisi ile tek-gonderimlik dugmesi arasindaki canli ses dalgasi.
  recordLiveWave: { flex: 1, flexDirection: "row", alignItems: "center", gap: 1.5, height: 18 },
  recordLiveWaveBar: { flex: 1, borderRadius: 1, backgroundColor: MUTED },
  // Alt satir: sil (solda), duraklat/devam hapı (ortada), gonder (sagda) -
  // ayri bir satirda olduklari icin genisligi UST satirdaki ogelerden
  // (sure/rozet) ETKILENMIYOR.
  recordLockedBottomRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  // Kilitli kayit cubugundaki "Duraklat/Devam et" hap (pill) butonu -
  // ikon + yazi yan yana, ortalanmis.
  recordPausePill: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    width: 260,
    height: 55,
    borderRadius: 27.5,
    backgroundColor: "#55555A",
  },
  recordPausePillText: { color: TEXT, fontSize: 14, fontWeight: "600" },
  // WhatsApp'taki gibi TEK bir hap (pill) kutu - emoji/ek/kamera ikonlari
  // bu kutunun ICINDE, mikrofon/gonder ise AYRI bir daire olarak disinda
  // (kullanicinin istegi, paylastigi referans goruntuye gore).
  inputPill: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    // Profil ekranindaki kutularla AYNI koyu lacivert - kilitli kayit
    // cubuguyla (recordingLockedBar) AYNI renk, tutarlilik icin.
    backgroundColor: "#15202B",
    borderRadius: 27.5,
    paddingLeft: 14,
    paddingRight: 10,
  },
  // Cevap yokken pill sabit 55 yukseklikte (tek satir ikon sirasi).
  inputPillNormal: { height: 55 },
  recordingPill: { flexDirection: "row", alignItems: "center", gap: 10 },
  recordingDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#FF4D4F" },
  recordingTime: { color: TEXT, fontSize: 15, fontWeight: "600" },
  // Kilitli kayit cubugundaki sure yazisi - sag ustteki tek-gonderimlik
  // dugmesiyle (58px) AYNI yukseklikte gorunmesi icin cok daha buyuk font.
  recordingTimeLocked: { color: TEXT, fontSize: 20, fontWeight: "600" },
  recordCancelHintText: { color: MUTED, fontSize: 13, fontWeight: "500" },
  // Mikrofon dugmesinin TAM USTUNDE - parmak yukari kaydirdikca onunla
  // birlikte kayar (bkz. recordDragY), WhatsApp'taki "kilitle" ipucu.
  recordLockHintWrap: {
    position: "absolute",
    right: 19.5,
    bottom: 84,
    width: 48,
    height: 48,
    borderRadius: 24,
    // Karsi tarafin mesaj balonuyla AYNI renk (bubbleTheirs).
    backgroundColor: "#1E293B",
    alignItems: "center",
    justifyContent: "center",
  },
  // Cevap varken pill SUTUN (dikey) duzene geciyor: ust kisimda icine
  // gomulu cevap kartiyla, altta normal ikon sirasiyla - boy otomatik
  // uzuyor (sabit 55 yerine, icerige gore).
  inputPillWithReply: {
    flexDirection: "column",
    alignItems: "stretch",
    paddingLeft: 0,
    paddingRight: 0,
    paddingBottom: 0,
  },
  inputIconsRow: {
    height: 55,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingLeft: 14,
    paddingRight: 10,
    // Emoji/yazi/atac/kamera grubunun TAMAMI 15px sola kaysin istegi -
    // pill'in kendi genisligi/arka plani ETKILENMEDEN sadece ICERIK kayiyor.
    marginLeft: -15,
  },
  // Web onizlemesindeki varsayilan odak cercevesini (beyaz kare) kapatiyor -
  // gercek Android/iOS'ta zaten yok, sadece tarayici davranisi.
  input: {
    flex: 1,
    color: TEXT,
    fontSize: 14,
    paddingTop: 7,
    paddingBottom: 6,
    outlineWidth: 0,
    outlineStyle: "none",
  } as any,
  inputRoundBtn: {
    width: 55,
    height: 55,
    borderRadius: 27.5,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  menuOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)" },
  // Profil ekranindaki kutularla AYNI koyu lacivert (#15202B, bkz.
  // encryptionNotice/DmInfoScreen.tsx actionSquare) - eskiden siyaha yakin
  // kahverengiydi (#141210).
  menuCard: {
    position: "absolute",
    top: 92,
    right: 16,
    backgroundColor: "#15202B",
    borderRadius: 12,
    paddingVertical: 6,
    minWidth: 170,
  },
  menuRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingVertical: 12 },
  menuRowText: { color: TEXT, fontSize: 14, fontWeight: "600" },
  headerNameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  // Uye bilgisi ekranindaki (DmInfoScreen.tsx searchRow) ile AYNI stil/boyut -
  // yuvarlak lacivert (#15202B) kutu, tam genislik koyu bir cubuk DEGIL.
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 18,
    marginTop: 5,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "#15202B",
  },
  searchInput: {
    flex: 1,
    color: theme.text,
    fontSize: 13,
    padding: 0,
    marginTop: 2,
    outlineWidth: 0,
    outlineStyle: "none",
  } as any,
  expiryBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    backgroundColor: "rgba(14,165,233,0.08)",
  },
  expiryBannerText: { color: ACCENT, fontSize: 11, fontWeight: "600" },
  pinnedBanner: {
    flexDirection: "row",
    // Kartin kendisi (pinnedBannerQuote) banner kutusunun dort tarafindan
    // da (sol/ust/alt/sag) SADECE 3px icinde kalsin istegi.
    padding: 3,
    backgroundColor: "rgba(14,165,233,0.10)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(14,165,233,0.16)",
  },
  // Banner icindeki mesaj onizlemesi - balon icindeki cevap alintisiyle
  // (bkz. "replyQuote") AYNI gorunumde: sol kenarda beyaz aksan cubugu +
  // kendi (daha acik) kart arka plani - kullanicinin istegi, "cevap blogu
  // gibi" gozuksun diye. Sabitleme ikonu artik bu kartin ICINDE (sol ucta),
  // kart banner'i (ustten/alttan/soldan 3px disinda) tamamen doldursun diye.
  pinnedBannerQuote: {
    position: "relative",
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(255,255,255,0.14)",
    borderLeftWidth: 3,
    borderLeftColor: "#FFFFFF",
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  // Birden fazla sabitlenmis mesaj varken - foto izleyicideki "4/5" sayfa
  // gostergesiyle AYNI sade gorunum (kutusuz, yari saydam beyaz metin) -
  // kartin sag UST kosesinde (kullanicinin istegi).
  pinnedBannerCounter: {
    position: "absolute",
    top: 5,
    right: 8,
    color: "rgba(255,255,255,0.7)",
    fontSize: 11,
    fontWeight: "600",
  },
  // Sagdaki sayac ("pinnedBannerCounter") ile metin UST USTE binmesin diye
  // sag tarafta ona yetecek kadar bosluk ayriliyor.
  pinnedBannerQuoteText: { flex: 1, minWidth: 0, paddingRight: 26 },
  forwardedRow: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 3 },
  forwardedText: { fontSize: 11, fontStyle: "italic" },
  deletedRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 2 },
  deletedText: { fontSize: 14, fontStyle: "italic" },
  sheetOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  // Profil ekranindaki kutularla AYNI koyu lacivert (#15202B) - eskiden
  // siyaha yakin kahverengiydi (#141210).
  sheetCard: {
    backgroundColor: "#15202B",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingTop: 18,
    paddingBottom: 30,
    paddingHorizontal: 20,
    alignItems: "center",
  },
  sheetTitle: { color: TEXT, fontSize: 16, fontWeight: "700", marginBottom: 4, alignSelf: "flex-start" },
  sheetSubtitle: { color: MUTED, fontSize: 12, marginBottom: 14, alignSelf: "flex-start" },
  // marginHorizontal (-10) + paddingHorizontal (10) birbirini NOTRLER -
  // yazinin konumu AYNI kalir (bkz. onceki duzeltme), ama secili kutunun
  // kendisi kenarlardan tasarak biraz daha GENIS gorunur, yazi da artik
  // kutunun kenarina YAPISIK degil.
  sheetRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 10,
    marginHorizontal: -10,
    borderRadius: 10,
  },
  // VoiceCallScreen/VideoCallScreen'in cikis secimi menusundeki
  // (outputMenuRowSelected) ile AYNI secili-satir dili - tik yerine
  // yarı saydam mavi kutu.
  sheetRowSelected: { backgroundColor: "rgba(14,165,233,0.18)" },
  sheetRowText: { color: TEXT, fontSize: 15, fontWeight: "600" },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "#3A332C", marginTop: 14 },
  // Sure sonu sheet'inin KENDI tutamaci - digerlerinden (Sikayet Et/ataç)
  // farkli olarak ustte, baslikdan ONCE.
  sheetHandleTop: { width: 40, height: 4, borderRadius: 2, backgroundColor: "#3A4C5E", marginBottom: 14 },
  // Kullanicinin istegi: ilk mesajin ustunde, ekrani ortalayacak sekilde,
  // profil ekranindaki kutularla AYNI koyu lacivert (#15202B) renkte,
  // solunda ayarlardaki gizlilik (LockClosedIcon) ikonu olan uctan uca
  // sifreleme bildirimi.
  encryptionNoticeWrap: { alignItems: "center", paddingHorizontal: 20, marginTop: -6, paddingTop: 1, paddingBottom: 7 },
  encryptionNotice: {
    alignItems: "center",
    backgroundColor: "#15202B",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    maxWidth: 320,
  },
  // Kilit ikonu ayri bir sutun DEGIL - metnin icine, "Mesajlar" kelimesinin
  // hemen yanina gomulu kucuk bir "inline" simge (kullanicinin istegi:
  // M harfi buyuklugunde, metinle AYNI satirda) - tum paragraf ortalanmis
  // duruyor (sag tarafa kaymiyor).
  encryptionNoticeRow: { alignItems: "center" },
  encryptionNoticeIconWrap: { marginBottom: 6 },
  encryptionNoticeText: { color: "#FFFFFF", fontSize: 12, lineHeight: 17, textAlign: "center" },
  mediaEmpty: { color: MUTED, fontSize: 13, marginTop: 30, textAlign: "center" },
  sheetCloseBtn: { marginTop: 20, alignItems: "center", paddingVertical: 12 },
  sheetCloseBtnText: { color: MUTED, fontSize: 14, fontWeight: "600" },
  reportInput: {
    width: "100%",
    minHeight: 80,
    backgroundColor: "#0E0C0A",
    borderRadius: 10,
    color: TEXT,
    fontSize: 14,
    padding: 12,
    textAlignVertical: "top",
    outlineWidth: 0,
    outlineStyle: "none",
  } as any,
  // FriendsScreen.tsx'teki "Davet At" butonuyla (hideInviteExtras, ProfileScreen
  // "Çıkış Yap"la AYNI) AYNI gorsel dil - disarida beyazdan maviye gecen
  // degrade kenarlik, icinde siyah dolgulu buton.
  reportSubmitGradientBorder: { alignSelf: "stretch", borderRadius: 10, padding: 2, marginTop: 14 },
  reportSubmitBtnDisabled: { opacity: 0.4 },
  reportSubmitBtnDark: { backgroundColor: "#000000", borderRadius: 8, paddingVertical: 14, alignItems: "center" },
  reportSubmitBtnDarkText: { color: "#FFFFFF", fontSize: 14, fontWeight: "800", letterSpacing: 0.2, textTransform: "uppercase" },
});
