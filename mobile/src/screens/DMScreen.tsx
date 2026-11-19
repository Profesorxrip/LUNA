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
import { MaterialCommunityIcons, MaterialIcons } from "@expo/vector-icons";
import { LockClosedIcon } from "react-native-heroicons/outline";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import * as Location from "expo-location";
import { useAudioRecorder, useAudioRecorderState, RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync } from "expo-audio";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Camera as CameraIcon, Image as ImageIcon, CircleArrowDown, MoreVertical, Phone, Laugh, Paperclip, Send, MapPin, FileText as FileTextIcon, Trash2, Search, Clock, Bell, BellOff, TriangleAlert, X } from "lucide-react-native";
import { RoomMicIcon } from "../components/CustomIcons";
import { theme } from "../theme";
import { useTranslation } from "react-i18next";
import { getSocket, DMMessage, DMReply } from "../services/socket";
import { supabase } from "../services/supabase";
import Icon from "../components/Icon";
import { showAlert } from "../components/CustomAlert";
import LoadingView from "../components/LoadingView";
import SendMediaSheet from "../components/SendMediaSheet";
import { uriToArrayBuffer } from "../utils/uriToArrayBuffer";
import { uploadWithProgress } from "../utils/uploadWithProgress";
import { formatMessageTime } from "../utils/time";
import ChatImageBubble from "../components/ChatImageBubble";
import VoiceMessageBubble from "../components/VoiceMessageBubble";
import LocationMessageBubble from "../components/LocationMessageBubble";
import FileMessageBubble from "../components/FileMessageBubble";
import Avatar from "../components/Avatar";

function formatRecordingTime(ms: number): string {
  const totalSec = Math.floor(Math.max(0, ms) / 1000);
  const mm = Math.floor(totalSec / 60);
  const ss = totalSec % 60;
  return `${mm}:${ss.toString().padStart(2, "0")}`;
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
}

// Oda sohbetindeki (RoomScreen.tsx -> ChatBubbleRow) ile AYNI mantik: kendi
// mesajimizi SAGDAN SOLA, karsidakinin mesajini SOLDAN SAGA kaydirinca
// yanitlama (reply) tetikleniyor. Satir translateX ile kaydirilirken
// kenarda bir "reply" ikonu belirip bosalan tarafi gosteriyor.
function DMBubbleRow({ item, isMine, groupedWithPrev, seen, onTap, onReply, onReport }: DMBubbleRowProps) {
  const { i18n } = useTranslation();
  const translateX = useRef(new Animated.Value(0)).current;

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
      <TouchableOpacity activeOpacity={0.7} onPress={onTap} onLongPress={onReply} style={styles.bubbleWrap}>
          <View
            style={[
              styles.bubble,
              isMine ? styles.bubbleMine : styles.bubbleTheirs,
              !groupedWithPrev && (isMine ? styles.bubbleMineFirst : styles.bubbleTheirsFirst),
            ]}
          >
            {!groupedWithPrev && <BubbleTail color={isMine ? BUBBLE_MINE_COLOR : "#1E293B"} mine={isMine} />}
            {item.replyTo && (
              <View style={styles.replyQuote}>
                <Text style={styles.replyQuoteFrom}>{item.replyTo.fromName}</Text>
                <Text style={styles.replyQuoteText} numberOfLines={1}>
                  {item.replyTo.text}
                </Text>
              </View>
            )}
            {item.kind === "voice" && item.mediaUrl ? (
              <VoiceMessageBubble uri={item.mediaUrl} durationMs={item.durationMs} />
            ) : item.kind === "location" && item.latitude != null && item.longitude != null ? (
              <LocationMessageBubble latitude={item.latitude} longitude={item.longitude} />
            ) : item.kind === "file" && item.mediaUrl ? (
              <FileMessageBubble
                uri={item.mediaUrl}
                fileName={item.fileName || item.text}
                fileSize={item.fileSize}
                mimeType={item.mimeType}
              />
            ) : item.mediaUrl ? (
              <ChatImageBubble
                uri={item.mediaUrl}
                isAdult={item.isAdult}
                senderName={item.fromName}
                sentAt={item.createdAt}
                onReply={onReply}
                onReport={onReport}
              />
            ) : (
              <Text style={styles.bubbleText}>{item.text}</Text>
            )}
            {item.kind !== "voice" && item.kind !== "location" && item.kind !== "file" && item.mediaUrl && item.text && item.text !== "📷 Fotoğraf" && (
              <Text style={styles.mediaCaption}>{item.text}</Text>
            )}
            <View style={styles.metaRow}>
              <Text style={styles.metaTime}>{formatMessageTime(item.createdAt, i18n.language)}</Text>
              {isMine && (
                <MaterialIcons
                  name={seen ? "done-all" : "done"}
                  size={16}
                  color={seen ? "#FFFFFF" : "rgba(255,255,255,0.65)"}
                />
              )}
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
  const [attachSheetVisible, setAttachSheetVisible] = useState(false);
  const [quickCaptureActive, setQuickCaptureActive] = useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const cameraReadyRef = useRef(false);
  const cameraRef = useRef<CameraView>(null);
  // Dosya (pdf/zip/vb.) gonderme - foto ile AYNI "chat-media" bucket'ina
  // yukleme deseni, ama kendi onizleme/caption ekrani yok, secilince
  // DOGRUDAN gonderilir.
  const [sendingFile, setSendingFile] = useState(false);
  // Sesli mesaj kaydi - expo-audio'nun kendi "ne kadar surdu" sayacini
  // (useAudioRecorderState) kullaniyoruz, kendi zamanlayicimizi KURMUYORUZ.
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(audioRecorder, 200);
  const [voiceRecording, setVoiceRecording] = useState(false);
  const [sendingVoice, setSendingVoice] = useState(false);
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
  const listRef = useRef<FlatList<DMMessage>>(null);
  // "Sohbette Göster" - kayan listede henuz olcum alinmamis bir mesaja
  // scrollToIndex basarisiz olursa (bkz. FlatList'in onScrollToIndexFailed'i)
  // asagida yaklasik bir offset'e gidip TEKRAR denemek icin hangi mesaji
  // ariyoruz onu hatirliyoruz.
  const pendingScrollMessageId = useRef<string | null>(null);
  const muteStorageKey = `dm_muted_${peer.userId}`;

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
    socket.on("dm:message", handleMessage);
    socket.on("dm:seen", handleSeen);
    socket.on("dm:expiry", handleExpiry);
    socket.on("dm:reaction", handleReaction);
    return () => {
      socket.off("dm:message", handleMessage);
      socket.off("dm:seen", handleSeen);
      socket.off("dm:expiry", handleExpiry);
      socket.off("dm:reaction", handleReaction);
    };
  }, [peer.userId]);

  useEffect(() => {
    if (messages.length) listRef.current?.scrollToEnd({ animated: true });
  }, [messages.length]);

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

  // Kullanici: "Mesaj yazma alanı gönderme alanı seçenekleri felan hepsini
  // ekle profesyonel bir önizleme ekranı yap" - galeriden COKLU fotograf
  // secilebiliyor, hepsi SendMediaSheet'te tek tek duzenlenip gonderiliyor.
  async function pickImage() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      showAlert(t("dm.permissionRequiredTitle"), t("dm.permissionRequiredBody"));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.7,
      allowsMultipleSelection: true,
      selectionLimit: 10,
    });
    if (result.canceled || !result.assets?.length) return;
    setAttachSheetVisible(false);
    setPendingImages((prev) => [...prev, ...result.assets.map((a) => a.uri)]);
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
  // icinde) CameraView'iyla tek dokunusla fotograf cekiyor.
  async function startQuickCapture() {
    if (!cameraPermission?.granted) {
      const res = await requestCameraPermission();
      if (!res.granted) {
        showAlert(t("dm.permissionRequiredTitle"), t("dm.cameraPermissionRequiredBody"));
        return;
      }
    }
    cameraReadyRef.current = false;
    setQuickCaptureActive(true);
  }

  // expo-camera web'de "onCameraReady" ilk kareden ONCE de tetiklenebiliyor
  // ("not enough camera data" hatasi) - birkac deneme ile bekliyoruz.
  async function handleQuickCameraReady() {
    cameraReadyRef.current = true;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const photo = await cameraRef.current?.takePictureAsync({ quality: 0.7 });
        if (photo?.uri) {
          setQuickCaptureActive(false);
          setAttachSheetVisible(false);
          setPendingImages((prev) => [...prev, photo.uri]);
          return;
        }
      } catch {
        await new Promise((r) => setTimeout(r, 200));
      }
    }
    setQuickCaptureActive(false);
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
  async function sendPickedImage(caption: string) {
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
            { toUserId: peer.userId, mediaUrl: publicUrlData.publicUrl, caption: isLast ? caption || undefined : undefined },
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
    setVoiceRecording(true);
  }

  async function cancelVoiceRecording() {
    if (audioRecorder.isRecording) await audioRecorder.stop();
    setVoiceRecording(false);
  }

  async function sendVoiceRecording() {
    const durationMs = recorderState.durationMillis;
    if (audioRecorder.isRecording) await audioRecorder.stop();
    setVoiceRecording(false);
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
        { toUserId: peer.userId, mediaUrl: publicUrlData.publicUrl, durationMs },
        (res: any) => {
          if (res?.ok) setMessages((prev) => [...prev, res.message]);
          else showAlert(t("dm.sendFailedTitle"), res?.error || t("dm.genericSendErrorBody"));
        }
      );
    } catch (err: any) {
      showAlert(t("dm.sendFailedTitle"), err?.message || t("dm.genericSendErrorBody"));
    } finally {
      setSendingVoice(false);
    }
  }

  function insertMention() {
    setInput((prev) => (prev.endsWith("@") || prev.length === 0 ? prev + "@" : prev + " @"));
  }

  function startReply(message: DMMessage) {
    setReplyingTo({ text: message.text, fromName: message.fromUserId === myUserId ? t("dm.you") : message.fromName });
  }

  // Medya listesinden (fotograf izleyicideki "Sohbette Göster") ana sohbette
  // o mesaja kaydirir.
  function scrollToMessage(id: string) {
    const index = visibleMessages.findIndex((m) => m.id === id);
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

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={styles.header}>
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
        <LinearGradient
          colors={["#FFFFFF", "#38BDF8"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.headerDivider}
        />
      </View>

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

      <FlatList
        ref={listRef}
        data={visibleMessages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={styles.listContent}
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
        renderItem={({ item, index }) => {
          const isMine = item.fromUserId === myUserId;
          const seen = isMine && item.createdAt <= seenUpTo;
          // Oda sohbetindeki (RoomScreen.tsx) gruplama ile AYNI mantik: arka
          // arkaya gelen mesajlarda gonderici avatari sadece grubun ilkinde
          // gosterilir, devaminda bubble hizasini bozmamak icin ayni genislikte
          // bos bir spacer konur, satirlar arasi bosluk da daraltilir.
          const prev = visibleMessages[index - 1];
          const groupedWithPrev = !!prev && prev.fromUserId === item.fromUserId;
          return (
            <DMBubbleRow
              item={item}
              isMine={isMine}
              groupedWithPrev={groupedWithPrev}
              seen={seen}
              onTap={() => handleMessageTap(item)}
              onReply={() => startReply(item)}
              onReport={() => setReportVisible(true)}
            />
          );
        }}
      />

      <View style={[styles.inputBar, replyingTo && styles.inputBarWithReply]}>
        {voiceRecording ? (
          <>
            <View style={[styles.inputPill, styles.inputPillNormal, styles.recordingPill]}>
              <TouchableOpacity onPress={cancelVoiceRecording} hitSlop={8}>
                <Trash2 size={20} color={MUTED} />
              </TouchableOpacity>
              <View style={styles.recordingDot} />
              <Text style={styles.recordingTime}>{formatRecordingTime(recorderState.durationMillis)}</Text>
            </View>
            <TouchableOpacity style={styles.inputRoundBtn} onPress={sendVoiceRecording} disabled={sendingVoice} hitSlop={8}>
              {sendingVoice ? <ActivityIndicator size="small" color="#141210" /> : <Send size={20} color="#141210" />}
            </TouchableOpacity>
          </>
        ) : (
          <>
            <View style={[styles.inputPill, replyingTo ? styles.inputPillWithReply : styles.inputPillNormal]}>
              {replyingTo && (
                <View style={styles.replyPreviewCard}>
                  <View style={styles.replyBarAccent} />
                  <View style={styles.replyBarText}>
                    <Text style={styles.replyBarFrom}>{replyingTo.fromName}</Text>
                    <Text style={styles.replyBarBody} numberOfLines={1}>
                      {replyingTo.text}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => setReplyingTo(null)} hitSlop={8} style={styles.replyBarClose}>
                    <Icon name="close" size={16} color={MUTED} />
                  </TouchableOpacity>
                </View>
              )}
              <View style={styles.inputIconsRow}>
                <TouchableOpacity onPress={insertMention} hitSlop={6} style={{ marginLeft: -3 }}>
                  <Laugh size={25} color="#FFFFFF" />
                </TouchableOpacity>
                <TextInput
                  style={styles.input}
                  value={input}
                  onChangeText={setInput}
                  placeholder={t("dm.messagePlaceholder")}
                  placeholderTextColor={MUTED}
                  onSubmitEditing={sendMessage}
                />
                <TouchableOpacity onPress={() => setAttachSheetVisible(true)} hitSlop={6} style={{ marginLeft: -25 }}>
                  <View style={{ transform: [{ rotate: "-45deg" }] }}><Paperclip size={19} color="#FFFFFF" /></View>
                </TouchableOpacity>
                <TouchableOpacity onPress={openCamera} hitSlop={6} style={{ marginLeft: 5 }}>
                  <MaterialCommunityIcons name="camera-outline" size={25} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
            </View>
            {input.trim() ? (
              <TouchableOpacity style={styles.inputRoundBtn} onPress={sendMessage} hitSlop={8}>
                <Send size={20} color="#141210" />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.inputRoundBtn} onPress={startVoiceRecording} hitSlop={8}>
                <RoomMicIcon size={22.5} color="#141210" />
              </TouchableOpacity>
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
            <TouchableOpacity
              style={[styles.reportSubmitBtn, !reportReason.trim() && styles.reportSubmitBtnDisabled]}
              onPress={submitReport}
              disabled={!reportReason.trim()}
            >
              <Text style={styles.reportSubmitBtnText}>{t("dm.reportSend")}</Text>
            </TouchableOpacity>
            <View style={styles.sheetHandle} />
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
            facing="back"
            onCameraReady={handleQuickCameraReady}
          />
          <TouchableOpacity style={styles.quickCameraClose} onPress={() => setQuickCaptureActive(false)} hitSlop={10}>
            <Icon name="close" size={22} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      )}

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
    paddingTop: 50,
    paddingBottom: 20,
    position: "relative",
  },
  // Eski duz "#1E1A17" alt cizgi yerine - uygulamanin genelindeki AYNI
  // beyazdan maviye gecen gradyan (kullanicinin istegi).
  headerDivider: { position: "absolute", left: 0, right: 0, bottom: 5, height: 1 },
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
  headerHandle: { color: MUTED, fontSize: 13, marginTop: 1 },
  // Satirlar arasi varsayilan bosluk DAR tutulup (4) ayni gondericiden arka
  // arkaya gelen mesajlar birbirine yakin durur, yeni bir grup basladiginda
  // (messageRowNewGroup) ekstra ust bosluk eklenir - RoomScreen.tsx'teki
  // gruplama hissiyle AYNI.
  listContent: { padding: 16, gap: 4 },
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
  replyQuoteFrom: { color: "#FFFFFF", fontSize: 12, fontWeight: "700" },
  replyQuoteText: { color: "rgba(255,255,255,0.75)", fontSize: 13, marginTop: 1 },
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
  quickCameraView: { flex: 1 },
  quickCameraClose: {
    position: "absolute",
    top: 50,
    left: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 3, alignSelf: "flex-end" },
  metaTime: { color: "rgba(255,255,255,0.65)", fontSize: 11 },
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
  replyBarFrom: { color: "#FFFFFF", fontSize: 12, fontWeight: "700" },
  replyBarBody: { color: MUTED, fontSize: 12, marginTop: 2 },
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
  // WhatsApp'taki gibi TEK bir hap (pill) kutu - emoji/ek/kamera ikonlari
  // bu kutunun ICINDE, mikrofon/gonder ise AYRI bir daire olarak disinda
  // (kullanicinin istegi, paylastigi referans goruntuye gore).
  inputPill: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#3A3A3E",
    borderRadius: 27.5,
    paddingLeft: 14,
    paddingRight: 10,
  },
  // Cevap yokken pill sabit 55 yukseklikte (tek satir ikon sirasi).
  inputPillNormal: { height: 55 },
  recordingPill: { flexDirection: "row", alignItems: "center", gap: 10 },
  recordingDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#FF4D4F" },
  recordingTime: { color: TEXT, fontSize: 15, fontWeight: "600" },
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
  sheetRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
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
  reportSubmitBtn: {
    width: "100%",
    backgroundColor: ACCENT,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: "center",
    marginTop: 14,
  },
  reportSubmitBtnDisabled: { opacity: 0.4 },
  reportSubmitBtnText: { color: "#04140D", fontSize: 14, fontWeight: "700" },
});
