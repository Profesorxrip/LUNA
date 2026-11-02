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
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Camera as CameraIcon, Image as ImageIcon } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { getSocket, DMMessage, DMReply } from "../services/socket";
import { supabase } from "../services/supabase";
import Icon from "../components/Icon";
import { showAlert } from "../components/CustomAlert";
import LoadingView from "../components/LoadingView";
import SendMediaSheet from "../components/SendMediaSheet";
import { uriToArrayBuffer } from "../utils/uriToArrayBuffer";
import { uploadWithProgress } from "../utils/uploadWithProgress";
import ChatImageBubble from "../components/ChatImageBubble";
import Avatar from "../components/Avatar";

function getExpiryOptions(t: (key: string) => string): { label: string; ms: number | null }[] {
  return [
    { label: t("dm.expiryOff"), ms: null },
    { label: t("dm.expiry1Hour"), ms: 60 * 60 * 1000 },
    { label: t("dm.expiry1Day"), ms: 24 * 60 * 60 * 1000 },
    { label: t("dm.expiry1Week"), ms: 7 * 24 * 60 * 60 * 1000 },
  ];
}

// toLocaleTimeString icin dil koduna karsilik gelen BCP-47 etiketi - bazi
// dillerin (ku) resmi bir ICU locale'i olmayabilir, tarayici/JS motoru
// bilmedigi bir etiketi sessizce sistem varsayilanina dusurur (hata vermez).
const TIME_LOCALE: Record<string, string> = {
  tr: "tr-TR",
  en: "en-US",
  de: "de-DE",
  fr: "fr-FR",
  ar: "ar",
  ku: "ku",
  el: "el-GR",
  ru: "ru-RU",
  az: "az-AZ",
  es: "es-ES",
};

export interface DMPeer {
  userId: string;
  name: string;
  handle?: string;
}

export interface DmInfoOpenParams {
  peerAvatarUrl: string | null;
  muted: boolean;
  mediaMessages: DMMessage[];
  onToggleMute: () => void;
}

interface Props {
  peer: DMPeer;
  onBack: () => void;
  onOpenInfo?: (info: DmInfoOpenParams) => void;
}

const ACCENT = "#0EA5E9";
// Artik App.tsx'teki paylasilan AppBackground (degrade) arkada duruyor.
const BG = "transparent";
const TEXT = "#F5F0E6";
const MUTED = "#9A8F80";

/** Rave'in gercek DM (ozelden mesaj) ekraninin yapisinin bir kopyasi -
 * baslik/avatar/uc nokta menusu, sol/sag balonlar, alinti (reply) onizlemesi,
 * "gorundu" cift tik'i ve alt aksiyon cubugu (etiket/medya/sesli mesaj) -
 * LUNA'nin siyah/yesil temasiyla. */
export default function DMScreen({ peer, onBack, onOpenInfo }: Props) {
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
  const [mediaVisible, setMediaVisible] = useState(false);
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

  function insertMention() {
    setInput((prev) => (prev.endsWith("@") || prev.length === 0 ? prev + "@" : prev + " @"));
  }

  function startReply(message: DMMessage) {
    setReplyingTo({ text: message.text, fromName: message.fromUserId === myUserId ? t("dm.you") : message.fromName });
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
  const mediaMessages = notExpired.filter((m) => !!m.mediaUrl);
  const expiryOptions = getExpiryOptions(t);
  const expiryLabel = expiryOptions.find((o) => o.ms === expiresAfterMs)?.label ?? t("dm.expiryOff");

  const menuItems: { label: string; onPress: () => void }[] = [
    { label: t("dm.menuSearch"), onPress: () => setSearchVisible(true) },
    { label: t("dm.menuMedia"), onPress: () => setMediaVisible(true) },
    { label: t("dm.menuExpiry"), onPress: () => setExpiryVisible(true) },
    { label: muted ? t("dm.menuUnmute") : t("dm.menuMute"), onPress: toggleMute },
    { label: t("dm.menuReport"), onPress: () => setReportVisible(true) },
  ];

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} hitSlop={10}>
          <Icon name="chevronLeft" size={22} color={TEXT} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.headerProfileTouch}
          activeOpacity={0.75}
          disabled={!onOpenInfo}
          onPress={() =>
            onOpenInfo?.({ peerAvatarUrl, muted, mediaMessages, onToggleMute: toggleMute })
          }
        >
          <Avatar name={peer.name} avatarUrl={peerAvatarUrl} size={40} />
          <View style={styles.headerTextBlock}>
            <View style={styles.headerNameRow}>
              <Text style={styles.headerName}>{peer.name}</Text>
              {muted && <Icon name="bellOff" size={13} color={MUTED} />}
            </View>
            {!!peer.handle && <Text style={styles.headerHandle}>@{peer.handle}</Text>}
          </View>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setMenuVisible(true)} hitSlop={10}>
          <Icon name="moreHoriz" size={22} color={TEXT} />
        </TouchableOpacity>
      </View>

      {searchVisible && (
        <View style={styles.searchBar}>
          <Icon name="search" size={16} color={MUTED} />
          <TextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder={t("dm.searchPlaceholder")}
            placeholderTextColor={MUTED}
            autoFocus
          />
          <TouchableOpacity
            onPress={() => {
              setSearchVisible(false);
              setSearchQuery("");
            }}
            hitSlop={8}
          >
            <Icon name="close" size={14} color={MUTED} />
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
        ListEmptyComponent={
          loading ? <LoadingView /> : <Text style={styles.mediaEmpty}>{t("dm.noMessagesYet")}</Text>
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
          // RoomScreen.tsx'teki ChatAvatar ile AYNI desen: kendi mesajimizda
          // avatar SAGDA, karsi tarafinkinde SOLDA - ikisi de gosterilir,
          // grubun ilkinde GERCEK fotograf (ya da yoksa bas harf), devaminda
          // bubble hizasini koruyan bos bir spacer.
          const avatarNode = !groupedWithPrev ? (
            <Avatar name={isMine ? t("dm.you") : item.fromName} avatarUrl={isMine ? myAvatarUrl : peerAvatarUrl} size={26} />
          ) : (
            <View style={styles.avatarSmallSpacer} />
          );
          const bubbleCol = (
            <View style={styles.bubbleWrap}>
              {item.replyTo && (
                <View style={styles.replyQuote}>
                  <Text style={styles.replyQuoteFrom}>{item.replyTo.fromName}</Text>
                  <Text style={styles.replyQuoteText} numberOfLines={1}>
                    {item.replyTo.text}
                  </Text>
                </View>
              )}
              {item.mediaUrl ? (
                <ChatImageBubble uri={item.mediaUrl} isAdult={item.isAdult} />
              ) : (
                <Text style={[styles.bubbleText, isMine && styles.bubbleTextMine]}>{item.text}</Text>
              )}
              {(item.myReaction || item.peerReaction) && (
                <View style={styles.reactionBadgeRow}>
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
              {item.mediaUrl && item.text && item.text !== "📷 Fotoğraf" && (
                <Text style={[styles.mediaCaption, isMine ? styles.mediaCaptionMine : styles.mediaCaptionTheirs]}>{item.text}</Text>
              )}
              <View style={[styles.metaRow, isMine ? styles.metaRowMine : styles.metaRowTheirs]}>
                <Text style={styles.metaTime}>
                  {new Date(item.createdAt).toLocaleTimeString(TIME_LOCALE[i18n.language] ?? "en-US", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </Text>
                {isMine && <Text style={[styles.metaTick, seen && styles.metaTickSeen]}>{seen ? "✓✓" : "✓"}</Text>}
              </View>
            </View>
          );
          return (
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => handleMessageTap(item)}
              onLongPress={() => startReply(item)}
              style={[
                styles.messageRow,
                isMine ? styles.messageRowMine : styles.messageRowTheirs,
                !groupedWithPrev && styles.messageRowNewGroup,
              ]}
            >
              {isMine ? (
                <>
                  {bubbleCol}
                  {avatarNode}
                </>
              ) : (
                <>
                  {avatarNode}
                  {bubbleCol}
                </>
              )}
            </TouchableOpacity>
          );
        }}
      />

      {replyingTo && (
        <View style={styles.replyBar}>
          <View style={styles.replyBarText}>
            <Text style={styles.replyBarFrom}>{replyingTo.fromName}</Text>
            <Text style={styles.replyBarBody} numberOfLines={1}>
              {replyingTo.text}
            </Text>
          </View>
          <TouchableOpacity onPress={() => setReplyingTo(null)} hitSlop={8}>
            <Icon name="close" size={16} color={MUTED} />
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.inputBar}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder={t("dm.messagePlaceholder")}
          placeholderTextColor={MUTED}
          onSubmitEditing={sendMessage}
        />
        {input.trim() ? (
          <TouchableOpacity onPress={sendMessage} hitSlop={8}>
            <Icon name="send" size={24} color={ACCENT} />
          </TouchableOpacity>
        ) : (
          <View style={styles.inputActions}>
            <TouchableOpacity onPress={insertMention} hitSlop={6}>
              <Icon name="mention" size={22} color={TEXT} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setAttachSheetVisible(true)} hitSlop={6}>
              <Icon name="image" size={22} color={TEXT} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => placeholder(t("dm.voiceMessageTitle"))} hitSlop={6}>
              <Icon name="mic" size={22} color={TEXT} />
            </TouchableOpacity>
          </View>
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
                <Text style={styles.menuRowText}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal visible={mediaVisible} transparent animationType="slide" onRequestClose={() => setMediaVisible(false)} statusBarTranslucent>
        <TouchableOpacity style={styles.sheetOverlay} activeOpacity={1} onPress={() => setMediaVisible(false)}>
          <TouchableOpacity activeOpacity={1} style={styles.mediaSheet}>
            <Text style={styles.sheetTitle}>{t("dm.menuMedia")}</Text>
            {mediaMessages.length === 0 ? (
              <Text style={styles.mediaEmpty}>{t("dm.noMedia")}</Text>
            ) : (
              <View style={styles.mediaGrid}>
                {mediaMessages.map((m) => (
                  <ChatImageBubble key={m.id} uri={m.mediaUrl!} isAdult={m.isAdult} size={96} />
                ))}
              </View>
            )}
            <TouchableOpacity style={styles.sheetCloseBtn} onPress={() => setMediaVisible(false)}>
              <Text style={styles.sheetCloseBtnText}>{t("common.close")}</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <Modal visible={expiryVisible} transparent animationType="slide" onRequestClose={() => setExpiryVisible(false)} statusBarTranslucent>
        <TouchableOpacity style={styles.sheetOverlay} activeOpacity={1} onPress={() => setExpiryVisible(false)}>
          <View style={styles.sheetCard}>
            <Text style={styles.sheetTitle}>{t("dm.menuExpiry")}</Text>
            <Text style={styles.sheetSubtitle}>{t("dm.expirySubtitle")}</Text>
            {expiryOptions.map((opt) => (
              <TouchableOpacity key={opt.label} style={styles.sheetRow} onPress={() => chooseExpiry(opt.ms)}>
                <Text style={styles.sheetRowText}>{opt.label}</Text>
                {expiresAfterMs === opt.ms && <Text style={styles.sheetRowCheck}>✓</Text>}
              </TouchableOpacity>
            ))}
            <View style={styles.sheetHandle} />
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
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderColor: "#1E1A17",
  },
  headerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#3A2F22",
    alignItems: "center",
    justifyContent: "center",
  },
  headerAvatarInitial: { color: ACCENT, fontSize: 16, fontWeight: "700" },
  headerTextBlock: { flex: 1 },
  headerName: { color: TEXT, fontSize: 16, fontWeight: "700" },
  headerHandle: { color: MUTED, fontSize: 11, marginTop: 1 },
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
  messageRowMine: { justifyContent: "flex-end" },
  messageRowTheirs: { justifyContent: "flex-start" },
  avatarSmallSpacer: { width: 26 },
  bubbleWrap: { maxWidth: "75%" },
  replyQuote: {
    backgroundColor: "rgba(14,165,233,0.1)",
    borderLeftWidth: 2,
    borderLeftColor: ACCENT,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginBottom: 3,
  },
  replyQuoteFrom: { color: ACCENT, fontSize: 10, fontWeight: "700" },
  replyQuoteText: { color: MUTED, fontSize: 11, marginTop: 1 },
  // RoomScreen.tsx'teki balonsuz duz metin sohbetle AYNI - renkli kutu yok,
  // sadece kendi mesajlarimiz sagdan hizali.
  bubbleText: { color: TEXT, fontSize: 14, lineHeight: 19 },
  bubbleTextMine: { textAlign: "right" },
  reactionBadgeRow: {
    position: "absolute",
    bottom: -10,
    right: -6,
    flexDirection: "row",
    backgroundColor: "#000000",
    borderRadius: 10,
    paddingHorizontal: 5,
    paddingVertical: 2,
    gap: 2,
  },
  // Kullanici: tepki rozeti icin "pill" (hap) seklinde, kalin beyaz
  // cerceveli, mavi dolgulu bir cerceve istedi ("5 numara" + "Mavi").
  reactionBadgeChip: {
    height: 23,
    paddingHorizontal: 8,
    borderRadius: 999,
    borderWidth: 1.6,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0c4a68",
    borderColor: "rgba(255,255,255,0.78)",
  },
  reactionBadgeEmoji: { fontSize: 13 },
  headerProfileTouch: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  mediaCaption: { color: TEXT, fontSize: 13, marginTop: 5, maxWidth: 220 },
  mediaCaptionMine: { alignSelf: "flex-end", textAlign: "right" },
  mediaCaptionTheirs: { alignSelf: "flex-start", textAlign: "left" },
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
  metaRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 3 },
  metaRowMine: { justifyContent: "flex-end" },
  metaRowTheirs: { justifyContent: "flex-start" },
  metaTime: { color: MUTED, fontSize: 10 },
  metaTick: { color: MUTED, fontSize: 11 },
  metaTickSeen: { color: ACCENT },
  replyBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: "#0E0C0A",
    borderTopWidth: 1,
    borderColor: "#1E1A17",
  },
  replyBarText: { flex: 1 },
  replyBarFrom: { color: ACCENT, fontSize: 11, fontWeight: "700" },
  replyBarBody: { color: MUTED, fontSize: 12, marginTop: 1 },
  inputBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderColor: "#1E1A17",
  },
  // Web onizlemesindeki varsayilan odak cercevesini (beyaz kare) kapatiyor -
  // gercek Android/iOS'ta zaten yok, sadece tarayici davranisi.
  input: {
    flex: 1,
    color: TEXT,
    fontSize: 14,
    backgroundColor: "#141210",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    outlineWidth: 0,
    outlineStyle: "none",
  } as any,
  inputActions: { flexDirection: "row", gap: 14 },
  menuOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)" },
  menuCard: {
    position: "absolute",
    top: 92,
    right: 16,
    backgroundColor: "#141210",
    borderRadius: 12,
    paddingVertical: 6,
    minWidth: 150,
  },
  menuRow: { paddingHorizontal: 16, paddingVertical: 12 },
  menuRowText: { color: TEXT, fontSize: 14, fontWeight: "600" },
  headerNameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "#0E0C0A",
    borderBottomWidth: 1,
    borderColor: "#1E1A17",
  },
  searchInput: {
    flex: 1,
    color: TEXT,
    fontSize: 13,
    paddingVertical: 0,
    includeFontPadding: false,
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
  sheetCard: {
    backgroundColor: "#141210",
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
    borderTopWidth: 1,
    borderColor: "#2A2422",
  },
  sheetRowText: { color: TEXT, fontSize: 15, fontWeight: "600" },
  sheetRowCheck: { color: ACCENT, fontSize: 16, fontWeight: "700" },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "#3A332C", marginTop: 14 },
  mediaSheet: {
    backgroundColor: "#141210",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingTop: 18,
    paddingBottom: 30,
    paddingHorizontal: 20,
    minHeight: 200,
  },
  mediaEmpty: { color: MUTED, fontSize: 13, marginTop: 30, textAlign: "center" },
  mediaGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
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
