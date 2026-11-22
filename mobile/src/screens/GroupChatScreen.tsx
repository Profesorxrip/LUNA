import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Keyboard,
  Animated,
  PanResponder,
  Platform,
  ActivityIndicator,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useTranslation } from "react-i18next";
import * as ImagePicker from "expo-image-picker";
import { useAudioRecorder, useAudioRecorderState, RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync } from "expo-audio";
import { CameraView, useCameraPermissions } from "expo-camera";
import {
  CircleArrowDown,
  Phone,
  Send,
  Laugh,
  Paperclip,
  Image as ImageIcon,
  Trash2,
  ChevronUp,
  Pause,
  Play,
  MapPin,
  FileText as FileTextIcon,
  BarChart2,
  Music,
  User as UserIcon,
} from "lucide-react-native";
import { SimpleLineIcons, MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import { LockClosedIcon, MicrophoneIcon } from "react-native-heroicons/outline";
import Icon from "../components/Icon";
import { VoiceOnceRingIcon, VoiceOnceFilledIcon } from "../components/CustomIcons";
import AppBackground from "../components/AppBackground";
import Avatar from "../components/Avatar";
import LoadingView from "../components/LoadingView";
import { showAlert } from "../components/CustomAlert";
import SendMediaSheet from "../components/SendMediaSheet";
import ChatImageBubble from "../components/ChatImageBubble";
import VoiceMessageBubble from "../components/VoiceMessageBubble";
import EmojiKeyboardPanel, { PANEL_HEIGHT as EMOJI_PANEL_BASE_HEIGHT } from "../components/EmojiKeyboardPanel";
import { getSocket, GroupMessage, GroupDetail, GroupMember } from "../services/socket";
import { formatMessageTime } from "../utils/time";
import { uriToArrayBuffer } from "../utils/uriToArrayBuffer";
import { uploadWithProgress } from "../utils/uploadWithProgress";
import { supabase } from "../services/supabase";

const BUBBLE_MINE_COLOR = "#2E799E";
const TEXT = "#F5F0E6";
const MUTED = "#9A8F80";
const WAVE_BAR_COUNT = 40;
const LOCK_DRAG_THRESHOLD = 70;
const CANCEL_DRAG_THRESHOLD = 90;

function formatRecordingTime(ms: number): string {
  const totalSec = Math.floor(Math.max(0, ms) / 1000);
  const mm = Math.floor(totalSec / 60);
  const ss = totalSec % 60;
  return `${mm}:${ss.toString().padStart(2, "0")}`;
}

export interface GroupPeer {
  id: string;
  name: string;
  avatarUrl: string | null;
}

interface Props {
  group: GroupPeer;
  onBack: () => void;
  onOpenInfo?: (detail: GroupDetail) => void;
}

interface BubbleRowProps {
  item: GroupMessage;
  isMine: boolean;
  groupedWithPrev: boolean;
  sender?: GroupMember;
  onConsumeMediaOnce: (messageId: string) => void;
}

/** DMScreen.tsx'teki DMBubbleRow ile AYNI mantik - SADECE sesli mesajin
 * canli sure etiketi (voiceTimeLabel) icin kendi local state'i gerekiyor,
 * bu yuzden FlatList'in renderItem'i icine degil AYRI bir bilesene tasindi. */
function GroupBubbleRow({ item, isMine, groupedWithPrev, sender, onConsumeMediaOnce }: BubbleRowProps) {
  const { t, i18n } = useTranslation();
  const [voiceTimeLabel, setVoiceTimeLabel] = useState("0:00");
  const hasMediaCaption = item.kind === "photo" && !!item.mediaUrl && !!item.text && item.text !== "📷 Fotoğraf";
  const consumedColor = isMine ? "rgba(255,255,255,0.6)" : MUTED;

  return (
    <View style={[styles.messageRow, isMine ? styles.messageRowMine : styles.messageRowTheirs, !groupedWithPrev && styles.messageRowNewGroup]}>
      {!isMine && (
        <View style={styles.senderAvatarWrap}>
          {!groupedWithPrev ? (
            <Avatar name={sender?.name || item.fromName} avatarUrl={sender?.avatarUrl} size={28} isFriend />
          ) : (
            <View style={styles.senderAvatarSpacer} />
          )}
        </View>
      )}
      <View style={styles.bubbleCol}>
        {!isMine && !groupedWithPrev && <Text style={styles.senderName}>{sender?.name || item.fromName}</Text>}
        <View style={styles.bubbleWrap}>
          <View
            style={[
              styles.bubble,
              isMine ? styles.bubbleMine : styles.bubbleTheirs,
              item.kind === "voice" && styles.bubbleVoicePad,
              item.kind === "photo" && styles.bubblePhotoPad,
            ]}
          >
            {item.kind === "voice" && item.viewOnce && item.viewOnceConsumed ? (
              <View style={styles.deletedRow}>
                <MicrophoneIcon size={14} color={consumedColor} strokeWidth={1.8} />
                <Text style={[styles.deletedText, { color: consumedColor }]}>{t("dm.voiceOnceConsumed")}</Text>
              </View>
            ) : item.kind === "voice" && item.mediaUrl ? (
              <VoiceMessageBubble
                uri={item.mediaUrl}
                durationMs={item.durationMs}
                onTimeLabel={setVoiceTimeLabel}
                onPlay={item.viewOnce ? () => onConsumeMediaOnce(item.id) : undefined}
              />
            ) : item.kind === "photo" && item.viewOnce && item.viewOnceConsumed ? (
              <View style={styles.deletedRow}>
                <ImageIcon size={14} color={consumedColor} strokeWidth={1.8} />
                <Text style={[styles.deletedText, { color: consumedColor }]}>{t("dm.mediaOnceConsumed")}</Text>
              </View>
            ) : item.kind === "photo" && item.mediaUrl ? (
              <>
                <ChatImageBubble
                  uri={item.mediaUrl}
                  isAdult={item.isAdult}
                  size={280}
                  senderName={item.fromName}
                  sentAt={item.createdAt}
                  onOpen={item.viewOnce ? () => onConsumeMediaOnce(item.id) : undefined}
                />
                {hasMediaCaption && <Text style={styles.mediaCaption}>{item.text}</Text>}
              </>
            ) : (
              <Text style={styles.bubbleText}>{item.text}</Text>
            )}
            <View style={[styles.metaRow, item.kind === "photo" && !hasMediaCaption && styles.metaRowPhotoOverlay]}>
              <Text style={styles.metaTime}>
                {item.kind === "voice" ? voiceTimeLabel + " · " : ""}
                {formatMessageTime(item.createdAt, i18n.language)}
              </Text>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

/** Grup sohbeti - DMScreen.tsx'teki ("Kişi Mesajı") ekranla GORUNUM VE
 * ISLEV olarak BIREBIR AYNI: emoji paneli, fotograf/galeri gonderme, kamera
 * (ani cekim ekrani), sesli mesaj (basili tut/surukleyip kilitle) VE
 * fotograf/sesli mesajdaki "tek görünümlük" (view-once) anahtari GERCEKTEN
 * calisir (kullanicinin "Hepsi birebir kişi mesajındaki gibi çalışsın"
 * istegi). Video mesaji/konum/dosya/anket/muzik/kisi/cikartma/yanitlama/
 * tepki/iletme/sabitleme gibi DM'e ozel geri kalan turler/aksiyonlar HENUZ
 * yok - bunlar icin ataç menusundeki ilgili satirlar "yakında" gosterir
 * (bkz. placeholderInputFeature). DM'in kendisi de butun bunlara 46 ayri
 * migration'da asama asama ulasti.
 */
export default function GroupChatScreen({ group, onBack, onOpenInfo }: Props) {
  const { t, i18n } = useTranslation();
  const [groupDetail, setGroupDetail] = useState<GroupDetail>({ id: group.id, name: group.name, avatarUrl: group.avatarUrl, members: [] });
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState("");
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const listRef = useRef<FlatList<GroupMessage>>(null);
  const socket = getSocket();

  const [attachSheetVisible, setAttachSheetVisible] = useState(false);
  const [emojiPanelVisible, setEmojiPanelVisible] = useState(false);

  // Fotograf/galeri - DMScreen.tsx'teki pendingImages/SendMediaSheet akisiyla
  // AYNI, sadece "dm:sendImage" yerine "group:sendImage".
  const [pendingImages, setPendingImages] = useState<string[]>([]);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Ani kamera cekimi - DMScreen.tsx'teki startQuickCapture ile AYNI, SADECE
  // video modu YOK (grupta video mesaji henuz yok) - tek derdi bir fotograf
  // cekip pendingImages kuyruguna eklemek.
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [quickCaptureActive, setQuickCaptureActive] = useState(false);
  const [quickCameraReady, setQuickCameraReady] = useState(false);
  const [quickCameraFacing, setQuickCameraFacing] = useState<"back" | "front">("back");
  const [quickCameraFlash, setQuickCameraFlash] = useState<"off" | "on">("off");
  const [capturingQuickPhoto, setCapturingQuickPhoto] = useState(false);
  const cameraRef = useRef<CameraView>(null);

  // Sesli mesaj kaydi - DMScreen.tsx'teki ile BIREBIR AYNI.
  const audioRecorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true });
  const recorderState = useAudioRecorderState(audioRecorder, 200);
  const waveHistoryRef = useRef<number[]>([]);
  const lastMeteringTickRef = useRef(-1);
  const [voiceRecording, setVoiceRecording] = useState(false);
  const [sendingVoice, setSendingVoice] = useState(false);
  const [recordingLocked, setRecordingLocked] = useState(false);
  const [recordingPaused, setRecordingPaused] = useState(false);
  // "Tek gorunumluk" sesli mesaj anahtari - kilitli kayit cubugundaki rozetle
  // acilip kapatiliyor, gonderirken mesaja eklenir (bkz. 0049_group_voice_
  // view_once.sql) - DMScreen.tsx'teki voiceOnceView ile AYNI.
  const [voiceOnceView, setVoiceOnceView] = useState(false);
  const recordDragX = useRef(new Animated.Value(0)).current;
  const recordDragY = useRef(new Animated.Value(0)).current;
  const recordLockedRef = useRef(false);
  // Tek-gorunumluk mesaj ilk kez acildiginda AYNI mesaja TEKRAR istek
  // atilmasini onler - DMScreen.tsx'teki consumedOnceRef ile AYNI.
  const consumedOnceRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMyUserId(data.user?.id ?? null));
  }, []);

  const memberById = new Map(groupDetail.members.map((m) => [m.userId, m]));

  useEffect(() => {
    socket.emit("group:open", { groupId: group.id }, (res: any) => {
      setLoading(false);
      if (!res?.ok) return;
      setGroupDetail(res.group);
      setMessages(res.messages || []);
    });

    function handleIncoming({ groupId, message }: { groupId: string; message: GroupMessage }) {
      if (groupId !== group.id) return;
      setMessages((prev) => [...prev, message]);
    }
    socket.on("group:message", handleIncoming);

    function handleMediaOnceConsumed({ groupId, messageId }: { groupId: string; messageId: string }) {
      if (groupId !== group.id) return;
      setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, viewOnceConsumed: true, mediaUrl: undefined } : m)));
    }
    socket.on("group:message:mediaOnceConsumed", handleMediaOnceConsumed);

    return () => {
      socket.off("group:message", handleIncoming);
      socket.off("group:message:mediaOnceConsumed", handleMediaOnceConsumed);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group.id]);

  // DMScreen.tsx'teki handleConsumeMediaOnce ile AYNI mantik.
  function handleConsumeMediaOnce(messageId: string) {
    if (consumedOnceRef.current.has(messageId)) return;
    consumedOnceRef.current.add(messageId);
    socket.emit("group:consumeMediaOnce", { groupId: group.id, messageId }, (res: any) => {
      if (!res?.ok) consumedOnceRef.current.delete(messageId);
    });
  }

  function sendMessage() {
    const text = input.trim();
    if (!text) return;
    setInput("");
    Keyboard.dismiss();
    socket.emit("group:send", { groupId: group.id, text }, (res: any) => {
      if (!res?.ok) {
        showAlert(t("dm.sendFailedTitle"), res?.error || t("dm.genericSendErrorBody"));
        return;
      }
      setMessages((prev) => [...prev, res.message]);
    });
  }

  function placeholderCall() {
    showAlert(t("friends.groupCallAction"), t("profile.comingSoon"));
  }

  // Konum/dosya/anket/muzik/kisi/cikartma grupta HENUZ yok (bkz. dosya basi
  // notu) - bu satirlar/dugmeler GORUNUMDE duruyor, basilinca "yakinda"
  // gosteriyor.
  function placeholderInputFeature(label: string) {
    showAlert(label, t("profile.comingSoon"));
  }

  function insertEmoji(emoji: string) {
    setInput((prev) => prev + emoji);
  }

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
    setPendingImages((prev) => [...prev, ...result.assets!.map((a) => a.uri)]);
  }

  function removePendingImage(index: number) {
    setPendingImages((prev) => prev.filter((_, i) => i !== index));
  }
  function replacePendingImage(index: number, uri: string) {
    setPendingImages((prev) => prev.map((u, i) => (i === index ? uri : u)));
  }

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
            "group:sendImage",
            { groupId: group.id, mediaUrl: publicUrlData.publicUrl, caption: isLast ? caption || undefined : undefined, viewOnce },
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

  async function startQuickCapture() {
    if (!cameraPermission?.granted) {
      const res = await requestCameraPermission();
      if (!res.granted) {
        showAlert(t("dm.permissionRequiredTitle"), t("dm.cameraPermissionRequiredBody"));
        return;
      }
    }
    setQuickCameraReady(false);
    setQuickCameraFacing("back");
    setQuickCameraFlash("off");
    setCapturingQuickPhoto(false);
    setAttachSheetVisible(false);
    setQuickCaptureActive(true);
  }

  function handleQuickCameraReady() {
    setQuickCameraReady(true);
  }
  function toggleQuickCameraFacing() {
    setQuickCameraFacing((f) => (f === "back" ? "front" : "back"));
  }
  function toggleQuickCameraFlash() {
    setQuickCameraFlash((f) => (f === "off" ? "on" : "off"));
  }
  function handleQuickGalleryPress() {
    setQuickCaptureActive(false);
    pickImage();
  }

  // expo-camera web'de "onCameraReady" ilk kareden ONCE de tetiklenebiliyor
  // ("not enough camera data" hatasi) - birkac deneme ile bekliyoruz.
  async function handleQuickShutterPress() {
    if (capturingQuickPhoto || !quickCameraReady) return;
    setCapturingQuickPhoto(true);
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const photo = await cameraRef.current?.takePictureAsync({ quality: 0.7 });
        if (photo?.uri) {
          setQuickCaptureActive(false);
          setCapturingQuickPhoto(false);
          setPendingImages((prev) => [...prev, photo.uri]);
          return;
        }
      } catch {
        await new Promise((r) => setTimeout(r, 200));
      }
    }
    setCapturingQuickPhoto(false);
  }

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
      socket.emit("group:sendVoice", { groupId: group.id, mediaUrl: publicUrlData.publicUrl, durationMs, viewOnce }, (res: any) => {
        if (res?.ok) setMessages((prev) => [...prev, res.message]);
        else showAlert(t("dm.sendFailedTitle"), res?.error || t("dm.genericSendErrorBody"));
      });
    } catch (err: any) {
      showAlert(t("dm.sendFailedTitle"), err?.message || t("dm.genericSendErrorBody"));
    } finally {
      setSendingVoice(false);
      setVoiceOnceView(false);
    }
  }

  const micPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
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
      // eslint-disable-next-line react-hooks/exhaustive-deps
    })
  ).current;

  const recordCancelHintOpacity = recordDragX.interpolate({
    inputRange: [-CANCEL_DRAG_THRESHOLD, -10, 0],
    outputRange: [0, 1, 1],
    extrapolate: "clamp",
  });

  if (voiceRecording && recorderState.durationMillis !== lastMeteringTickRef.current) {
    lastMeteringTickRef.current = recorderState.durationMillis;
    const db = recorderState.metering ?? -60;
    const norm = Math.min(1, Math.max(0, (db + 60) / 60));
    waveHistoryRef.current = [...waveHistoryRef.current, norm].slice(-WAVE_BAR_COUNT);
  }
  const waveHeights = Array.from({ length: WAVE_BAR_COUNT }, (_, i) => {
    const idx = waveHistoryRef.current.length - WAVE_BAR_COUNT + i;
    const norm = idx >= 0 ? waveHistoryRef.current[idx] : 0;
    return 4 + norm * 14;
  });

  return (
    <View style={styles.screen}>
      <AppBackground />
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} hitSlop={10} style={{ marginTop: 1 }}>
          <View style={{ transform: [{ rotate: "90deg" }] }}>
            <CircleArrowDown size={22} color="#FFFFFF" />
          </View>
        </TouchableOpacity>
        <TouchableOpacity style={styles.headerProfileTouch} activeOpacity={0.75} onPress={() => onOpenInfo?.(groupDetail)}>
          <View style={{ marginLeft: -1 }}>
            <Avatar name={groupDetail.name} avatarUrl={groupDetail.avatarUrl} size={46} />
          </View>
          <View style={styles.headerTextBlock}>
            <Text style={styles.headerName} numberOfLines={1}>
              {groupDetail.name}
            </Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity onPress={placeholderCall} hitSlop={10}>
          <Phone size={25} color={TEXT} />
        </TouchableOpacity>
      </View>
      <LinearGradient colors={["#FFFFFF", "#38BDF8"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.headerDivider} />

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={styles.listContent}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        ListEmptyComponent={loading ? <LoadingView /> : <Text style={styles.emptyText}>{t("dm.noMessagesYet")}</Text>}
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
          const prev = messages[index - 1];
          const groupedWithPrev = !!prev && prev.fromUserId === item.fromUserId;
          return (
            <GroupBubbleRow
              item={item}
              isMine={isMine}
              groupedWithPrev={groupedWithPrev}
              sender={memberById.get(item.fromUserId)}
              onConsumeMediaOnce={handleConsumeMediaOnce}
            />
          );
        }}
      />

      <View
        style={[styles.inputBar, voiceRecording && recordingLocked && styles.inputBarLockedWrap]}
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
              <TouchableOpacity
                onPress={() => setVoiceOnceView((v) => !v)}
                hitSlop={8}
                style={{ width: 58, height: 58, marginRight: -1.5, alignItems: "center", justifyContent: "center" }}
              >
                {voiceOnceView ? <VoiceOnceFilledIcon size={58} color="#FFFFFF" /> : <VoiceOnceRingIcon size={58} color={MUTED} />}
              </TouchableOpacity>
            </View>
            <View style={styles.recordLockedBottomRow}>
              <TouchableOpacity onPress={cancelVoiceRecording} hitSlop={8} style={[styles.inputRoundBtn, { backgroundColor: "#FF4D4F" }]}>
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
            <View style={[styles.inputPill, styles.inputPillNormal, voiceRecording && styles.recordingPill]}>
              {voiceRecording ? (
                <>
                  <TouchableOpacity onPress={cancelVoiceRecording} hitSlop={8}>
                    <Trash2 size={20} color={MUTED} />
                  </TouchableOpacity>
                  <View style={styles.recordingDot} />
                  <Text style={styles.recordingTime}>{formatRecordingTime(recorderState.durationMillis)}</Text>
                  <View style={{ flex: 1 }} />
                  <Animated.Text
                    style={[
                      styles.recordCancelHintText,
                      { opacity: recordCancelHintOpacity, transform: [{ translateX: Animated.add(recordDragX, -15) }] },
                    ]}
                    numberOfLines={1}
                  >
                    {"‹ " + t("dm.recordSlideToCancel")}
                  </Animated.Text>
                </>
              ) : (
                <View style={styles.inputIconsRow}>
                  <TouchableOpacity
                    onPress={() => {
                      Keyboard.dismiss();
                      setAttachSheetVisible(false);
                      setEmojiPanelVisible((v) => !v);
                    }}
                    hitSlop={6}
                  >
                    <Laugh size={25} color="#9CA3AF" />
                  </TouchableOpacity>
                  <TextInput
                    style={styles.input}
                    value={input}
                    onChangeText={setInput}
                    placeholder={t("dm.messagePlaceholder")}
                    placeholderTextColor={MUTED}
                    onSubmitEditing={sendMessage}
                    onFocus={() => {
                      setAttachSheetVisible(false);
                      setEmojiPanelVisible(false);
                    }}
                  />
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginLeft: -33 }}>
                    <TouchableOpacity
                      onPress={() => {
                        Keyboard.dismiss();
                        setEmojiPanelVisible(false);
                        setAttachSheetVisible((v) => !v);
                      }}
                      hitSlop={6}
                    >
                      <View style={{ transform: [{ rotate: "-45deg" }] }}>
                        <Paperclip size={23} color="#9CA3AF" strokeWidth={1.7} />
                      </View>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={startQuickCapture} hitSlop={6} style={{ marginLeft: 5 }}>
                      <SimpleLineIcons name="camera" size={25} color="#9CA3AF" />
                    </TouchableOpacity>
                  </View>
                </View>
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

      {attachSheetVisible && (
        <View style={styles.attachSheet}>
          <View style={styles.attachGrid}>
            <TouchableOpacity style={styles.attachGridItem} onPress={pickImage}>
              <View style={styles.attachIconWrap}>
                <ImageIcon size={26} color="#FFFFFF" />
              </View>
              <Text style={styles.attachGridText}>{t("dm.attachGallery")}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.attachGridItem} onPress={() => placeholderInputFeature(t("dm.attachLocation"))}>
              <View style={styles.attachIconWrap}>
                <MapPin size={26} color="#FFFFFF" />
              </View>
              <Text style={styles.attachGridText}>{t("dm.attachLocation")}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.attachGridItem} onPress={() => placeholderInputFeature(t("dm.attachFile"))}>
              <View style={styles.attachIconWrap}>
                <FileTextIcon size={26} color="#FFFFFF" />
              </View>
              <Text style={styles.attachGridText}>{t("dm.attachFile")}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.attachGridItem} onPress={() => placeholderInputFeature(t("dm.attachPoll"))}>
              <View style={styles.attachIconWrap}>
                <BarChart2 size={26} color="#FFFFFF" />
              </View>
              <Text style={styles.attachGridText}>{t("dm.attachPoll")}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.attachGridItem} onPress={() => placeholderInputFeature(t("dm.attachMusic"))}>
              <View style={styles.attachIconWrap}>
                <Music size={26} color="#FFFFFF" />
              </View>
              <Text style={styles.attachGridText}>{t("dm.attachMusic")}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.attachGridItem} onPress={() => placeholderInputFeature(t("dm.attachContact"))}>
              <View style={styles.attachIconWrap}>
                <UserIcon size={26} color="#FFFFFF" />
              </View>
              <Text style={styles.attachGridText}>{t("dm.attachContact")}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {emojiPanelVisible && <View style={{ height: EMOJI_PANEL_BASE_HEIGHT }} />}
      {emojiPanelVisible && (
        <EmojiKeyboardPanel
          onSelect={insertEmoji}
          onSendSticker={() => placeholderInputFeature(t("profile.comingSoon"))}
          customStickers={[]}
          onCreateSticker={() => placeholderInputFeature(t("profile.comingSoon"))}
          customGifs={[]}
          onCreateGif={() => placeholderInputFeature(t("profile.comingSoon"))}
        />
      )}

      {quickCaptureActive && cameraPermission?.granted && (
        <View style={styles.quickCameraOverlay}>
          <CameraView ref={cameraRef} style={styles.quickCameraView} facing={quickCameraFacing} flash={quickCameraFlash} onCameraReady={handleQuickCameraReady} />
          <View style={styles.quickCameraTopBar}>
            <TouchableOpacity style={styles.quickCameraTopBtn} onPress={() => setQuickCaptureActive(false)} hitSlop={10}>
              <Icon name="close" size={28} color="#FFFFFF" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.quickCameraTopBtn} onPress={toggleQuickCameraFlash} hitSlop={10}>
              <Ionicons name={quickCameraFlash === "on" ? "flash-outline" : "flash-off-outline"} size={26} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
          <View style={styles.quickCameraBottomBar}>
            <TouchableOpacity style={styles.quickCameraTopBtn} onPress={handleQuickGalleryPress} hitSlop={10}>
              <ImageIcon size={24} color="#FFFFFF" />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.quickCameraShutterOuter}
              onPress={handleQuickShutterPress}
              disabled={!quickCameraReady || capturingQuickPhoto}
              hitSlop={8}
            >
              <View style={[styles.quickCameraShutterInner, capturingQuickPhoto && styles.quickCameraShutterInnerActive]} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.quickCameraTopBtn} onPress={toggleQuickCameraFacing} hitSlop={10}>
              <MaterialCommunityIcons name="camera-flip-outline" size={26} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
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
    </View>
  );
}

const styles = StyleSheet.create({
  // Asagisindaki butun stiller DMScreen.tsx'teki (Kişi Mesajı ekrani) AYNI
  // isimli stillerle BIREBIR AYNI deger - kullanicinin "kalan herşey aynı
  // olucak birebir aynı" istegi.
  screen: { flex: 1, backgroundColor: "transparent" },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 18, paddingTop: 44, paddingBottom: 14, height: 104 },
  headerDivider: { height: 1, width: "100%" },
  headerProfileTouch: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  headerTextBlock: { flex: 1, marginLeft: -2 },
  headerName: { color: TEXT, fontSize: 18, fontWeight: "700" },
  listContent: { padding: 16, paddingBottom: 1, gap: 4 },
  emptyText: { color: MUTED, textAlign: "center", marginTop: 40, fontSize: 13 },
  encryptionNoticeWrap: { alignItems: "center", marginBottom: 10 },
  encryptionNotice: { backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, maxWidth: "90%" },
  encryptionNoticeRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  encryptionNoticeIconWrap: { width: 18, height: 18, borderRadius: 9, backgroundColor: "rgba(255,255,255,0.12)", alignItems: "center", justifyContent: "center" },
  encryptionNoticeText: { color: MUTED, fontSize: 11, flexShrink: 1 },
  messageRow: { flexDirection: "row", alignItems: "flex-end", gap: 8, maxWidth: "100%" },
  messageRowNewGroup: { marginTop: 8 },
  messageRowMine: { justifyContent: "flex-end" },
  messageRowTheirs: { justifyContent: "flex-start" },
  senderAvatarWrap: { width: 28 },
  senderAvatarSpacer: { width: 28, height: 28 },
  bubbleCol: { maxWidth: "75%" },
  senderName: { color: MUTED, fontSize: 12, fontWeight: "700", marginBottom: 2, marginLeft: 2 },
  bubbleWrap: { position: "relative" },
  bubble: { paddingHorizontal: 13, paddingVertical: 8, borderRadius: 8 },
  bubbleVoicePad: { paddingTop: 13, paddingBottom: 10 },
  bubblePhotoPad: { paddingLeft: 3, paddingRight: 3, paddingTop: 3, paddingBottom: 3, width: 286 },
  bubbleMine: { backgroundColor: BUBBLE_MINE_COLOR },
  bubbleTheirs: { backgroundColor: "#1E293B" },
  bubbleText: { color: TEXT, fontSize: 16, lineHeight: 21 },
  mediaCaption: { color: TEXT, fontSize: 14, marginTop: 6, paddingHorizontal: 2 },
  deletedRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 2 },
  deletedText: { fontSize: 14, fontStyle: "italic" },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 3, alignSelf: "flex-end" },
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
  metaTime: { color: "rgba(255,255,255,0.65)", fontSize: 11 },
  inputBar: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 15 },
  inputBarLockedWrap: { paddingHorizontal: 0, paddingTop: 0, paddingBottom: 0 },
  inputPill: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#15202B", borderRadius: 27.5, paddingLeft: 14, paddingRight: 10 },
  inputPillNormal: { height: 55 },
  recordingPill: { flexDirection: "row", alignItems: "center", gap: 10 },
  recordingDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#FF4D4F" },
  recordingTime: { color: TEXT, fontSize: 15, fontWeight: "600" },
  recordingTimeLocked: { color: TEXT, fontSize: 20, fontWeight: "600" },
  recordCancelHintText: { color: MUTED, fontSize: 13, fontWeight: "500" },
  recordLockHintWrap: {
    position: "absolute",
    right: 19.5,
    bottom: 84,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#1E293B",
    alignItems: "center",
    justifyContent: "center",
  },
  recordingLockedBar: {
    width: "100%",
    height: 150,
    flexDirection: "column",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 24,
    backgroundColor: "#15202B",
  },
  recordLockedTopRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  recordLiveWave: { flex: 1, flexDirection: "row", alignItems: "center", gap: 1.5, height: 18 },
  recordLiveWaveBar: { flex: 1, borderRadius: 1, backgroundColor: MUTED },
  recordLockedBottomRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
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
  inputIconsRow: { height: 55, flexDirection: "row", alignItems: "center", gap: 10, paddingLeft: 14, paddingRight: 10, marginLeft: -15 },
  input: { flex: 1, color: TEXT, fontSize: 14, paddingTop: 7, paddingBottom: 6, outlineWidth: 0, outlineStyle: "none" } as any,
  inputRoundBtn: { width: 55, height: 55, borderRadius: 27.5, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  attachSheet: { backgroundColor: "#15202B", height: 300, paddingTop: 18, paddingHorizontal: 20, alignItems: "center" },
  attachGrid: { width: "100%", flexDirection: "row", flexWrap: "wrap" },
  attachGridItem: { width: "33.33%", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 16 },
  attachIconWrap: { width: 64, height: 64, borderRadius: 32, backgroundColor: "rgba(14,165,233,0.12)", alignItems: "center", justifyContent: "center" },
  attachGridText: { color: TEXT, fontSize: 13, fontWeight: "600" },
  quickCameraOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "#000000" },
  quickCameraView: { flex: 1, marginTop: 50, marginBottom: 70 },
  quickCameraTopBar: { position: "absolute", top: 70, left: 16, right: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  quickCameraTopBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center" },
  quickCameraBottomBar: { position: "absolute", bottom: 86, left: 16, right: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  quickCameraShutterOuter: { width: 72, height: 72, borderRadius: 36, borderWidth: 4, borderColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  quickCameraShutterInner: { width: 58, height: 58, borderRadius: 29, backgroundColor: "#FFFFFF" },
  quickCameraShutterInnerActive: { backgroundColor: "#9CA3AF" },
});
