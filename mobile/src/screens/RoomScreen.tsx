import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Share,
  Image,
  Animated,
  PanResponder,
  useWindowDimensions,
  Modal,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useTranslation } from "react-i18next";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { getSocket, RoomState, ChatMessage } from "../services/socket";
import type { MediaSource, DMReply } from "../services/socket";
import { supabase } from "../services/supabase";
import MediaPlayer, { MediaPlayerHandle } from "../components/MediaPlayer";
import MediaPickerSheet from "../components/MediaPickerSheet";
import ReactionsOverlay, { ReactionsOverlayHandle } from "../components/ReactionsOverlay";
import VideoControlsOverlay from "../components/VideoControlsOverlay";
import VideoSeekBar from "../components/VideoSeekBar";
import ParticipantsModal from "../components/ParticipantsModal";
import RoomSettingsSheet from "../components/RoomSettingsSheet";
import SendMediaSheet from "../components/SendMediaSheet";
import ChatImageBubble from "../components/ChatImageBubble";
import RoomMapSheet from "../components/RoomMapSheet";
import Avatar from "../components/Avatar";
import Icon from "../components/Icon";
import { showAlert } from "../components/CustomAlert";
import { isHideLocationEnabled } from "../utils/locationSettings";
import type { PrivacyLevel, PlaybackMode } from "../services/socket";
import { useVoiceChat } from "../hooks/useVoiceChat";
import { theme } from "../theme";

interface Props {
  initialRoom: RoomState;
  onLeave: () => void;
}

const DRIFT_TOLERANCE_SECONDS = 2;
const GUEST_RESYNC_INTERVAL_MS = 8000;
const HOST_HEARTBEAT_INTERVAL_MS = 5000;
const REPLY_SWIPE_TRIGGER = 48;
const REPLY_SWIPE_MAX = 64;
// Bu genislikten (px) itibaren PC/masaustu duzenine geciliyor: video solda
// buyuk, sohbet saginda sabit genislikte DAIMA ACIK bir panel olarak duruyor
// (telefon genisliginde tek sutun, eskisi gibi).
const DESKTOP_BREAKPOINT = 860;

interface ChatBubbleRowProps {
  item: ChatMessage;
  isOwn: boolean;
  groupedWithPrev: boolean;
  onReply: () => void;
  onDoubleTap: () => void;
}

/** Sohbet mesaji satiri - kendi mesajimizi SAGDAN SOLA, baskasinin mesajini
 * SOLDAN SAGA kaydirinca yanitlama (reply) tetikleniyor (Rave'deki gibi).
 * Satir HER ZAMAN "flex-start" (en ustten hizali) - tek/coklu satir ayrimi
 * JS/onTextLayout ILE DEGIL, saf CSS ile cozuluyor: metin sutununun
 * (messageTextCol) minHeight'i avatar boyuyla ayni ve justifyContent:"center"
 * tasiyor - tek satirlik kisa metin bu kutunun icinde avatarin TAM ORTASINA
 * denk gelecek sekilde ortalanirken, iki+ satirlik metin kutuyu zaten
 * doldurup tasdigi icin ustten baslamaya devam ediyor. Bu sayede react-
 * native-web'de desteklenmeyen onTextLayout'a bagli kalinmiyor ve native'de
 * de ilk render'da dogru pozisyonla cikiyor - sonradan "ziplama" olmuyor. */
function ChatBubbleRow({ item, isOwn, groupedWithPrev, onReply, onDoubleTap }: ChatBubbleRowProps) {
  const { i18n } = useTranslation();
  const translateX = useRef(new Animated.Value(0)).current;
  const lastTapRef = useRef(0);
  // "Chat Mesajlarini Otomatik Cevir" - ceviri varsa varsayilan GOSTERILIR,
  // dokununca orijinal metne gecilip geri donulebilir (Instagram/WhatsApp'taki
  // "Cevirisini gor / Orijinali gor" deseniyle ayni mantik).
  const [showOriginal, setShowOriginal] = useState(false);
  const translation = item.translations?.[i18n.language];
  const displayText = translation && !showOriginal ? translation : item.text;

  // Mesaj metnine CIFT TIKLAYINCA Ayarlar'daki hizli tepki emojisini gonderir.
  function handleTap() {
    const now = Date.now();
    if (now - lastTapRef.current < 300) onDoubleTap();
    lastTapRef.current = now;
  }

  const reactionBadges = item.reactions && item.reactions.length > 0 && (
    <View style={styles.reactionBadgeRow}>
      {item.reactions.map((r) => (
        <Text key={r.fromSocketId} style={styles.reactionBadgeEmoji}>
          {r.emoji}
        </Text>
      ))}
    </View>
  );

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_evt, g) => Math.abs(g.dx) > 10 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderMove: (_evt, g) => {
        const raw = isOwn ? Math.min(0, g.dx) : Math.max(0, g.dx);
        translateX.setValue(Math.max(-REPLY_SWIPE_MAX, Math.min(REPLY_SWIPE_MAX, raw)));
      },
      onPanResponderRelease: (_evt, g) => {
        const raw = isOwn ? Math.min(0, g.dx) : Math.max(0, g.dx);
        if (Math.abs(raw) >= REPLY_SWIPE_TRIGGER) onReply();
        Animated.spring(translateX, { toValue: 0, useNativeDriver: true, bounciness: 6 }).start();
      },
      onPanResponderTerminate: () => {
        Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
      },
    })
  ).current;

  const replyHintOpacity = translateX.interpolate({
    inputRange: isOwn ? [-REPLY_SWIPE_TRIGGER, 0] : [0, REPLY_SWIPE_TRIGGER],
    outputRange: isOwn ? [1, 0] : [0, 1],
    extrapolate: "clamp",
  });

  const rowStyle = isOwn ? styles.messageRowOwn : styles.messageRow;
  const replyQuote = item.replyTo && (
    <View style={[styles.replyQuote, isOwn && styles.replyQuoteOwn]}>
      <Text style={styles.replyQuoteText} numberOfLines={1}>
        {item.replyTo.fromName}: {item.replyTo.text}
      </Text>
    </View>
  );

  return (
    <Animated.View style={[rowStyle, { transform: [{ translateX }] }]} {...pan.panHandlers}>
      <Animated.View
        pointerEvents="none"
        style={[styles.replyHint, isOwn ? { right: -26 } : { left: -26 }, { opacity: replyHintOpacity }]}
      >
        <Icon name="reply" size={16} color={theme.textMuted} />
      </Animated.View>
      {isOwn ? (
        <>
          <View style={styles.messageTextCol}>
            {replyQuote}
            {item.mediaUrl ? (
              <ChatImageBubble uri={item.mediaUrl} isAdult={item.isAdult} />
            ) : (
              <TouchableOpacity activeOpacity={1} onPress={handleTap}>
                <Text style={styles.chatMsgOwn} selectable={false}>
                  {displayText}
                </Text>
                {translation && (
                  <TouchableOpacity onPress={() => setShowOriginal((v) => !v)} hitSlop={6}>
                    <Text style={styles.translatedHint}>{showOriginal ? "Çeviriyi gör" : "Orijinalini gör"}</Text>
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            )}
            {reactionBadges}
          </View>
          {!groupedWithPrev && <Avatar name={item.from || "?"} avatarUrl={item.fromAvatarUrl} size={32} />}
        </>
      ) : (
        <>
          {!groupedWithPrev ? (
            <Avatar name={item.from || "?"} avatarUrl={item.fromAvatarUrl} size={32} />
          ) : (
            <View style={styles.avatarSpacer} />
          )}
          <View style={styles.messageTextCol}>
            {replyQuote}
            {item.mediaUrl ? (
              <>
                {!groupedWithPrev && <Text style={styles.chatFrom}>{item.from}</Text>}
                <ChatImageBubble uri={item.mediaUrl} isAdult={item.isAdult} />
              </>
            ) : (
              <TouchableOpacity activeOpacity={1} onPress={handleTap}>
                <Text style={styles.chatMsg} selectable={false}>
                  {!groupedWithPrev && <Text style={styles.chatFrom}>{item.from}: </Text>}
                  {displayText}
                </Text>
                {translation && (
                  <TouchableOpacity onPress={() => setShowOriginal((v) => !v)} hitSlop={6}>
                    <Text style={styles.translatedHint}>{showOriginal ? "Çeviriyi gör" : "Orijinalini gör"}</Text>
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            )}
            {reactionBadges}
          </View>
        </>
      )}
    </Animated.View>
  );
}

export default function RoomScreen({ initialRoom, onLeave }: Props) {
  const socket = getSocket();
  const { width: windowWidth } = useWindowDimensions();
  const isDesktop = windowWidth >= DESKTOP_BREAKPOINT;
  const [room, setRoom] = useState<RoomState>(initialRoom);
  const roomRef = useRef(room);
  roomRef.current = room;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatFocused, setChatFocused] = useState(false);
  const [replyingTo, setReplyingTo] = useState<DMReply | null>(null);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [pendingImageUri, setPendingImageUri] = useState<string | null>(null);
  const [mapVisible, setMapVisible] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [participantsVisible, setParticipantsVisible] = useState(false);
  const [leaveConfirmVisible, setLeaveConfirmVisible] = useState(false);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [volume, setVolume] = useState(1);
  // Su an izlenen video "begenilmis" mi - sunucunun dondurdugu eventId,
  // begeniyi geri almak (room:unlike) icin saklaniyor. Oda kodu/video
  // degisince (asagidaki useEffect) sifirlanir - eski videonun begenisi
  // yeni videoya tasinmaz.
  const [likedEventId, setLikedEventId] = useState<string | null>(null);
  const [reportVisible, setReportVisible] = useState(false);
  const [reportReason, setReportReason] = useState("");
  // Video tam ekran mi - sadece BU ekranda gorsel bir mod, oda sohbeti/
  // katilimci durumu etkilenmez, sadece video alani buyuyup chat gizlenir.
  const [fullscreenVideo, setFullscreenVideo] = useState(false);
  // Ayarlar ekranindaki "Hizli Tepki" tercihi - bir mesaja CIFT TIKLAYINCA
  // gonderilecek emoji budur (bkz. ProfileScreen.tsx default_reaction_emoji).
  const [quickReactionEmoji, setQuickReactionEmoji] = useState("❤️");

  const playerRef = useRef<MediaPlayerHandle>(null);
  const reactionsRef = useRef<ReactionsOverlayHandle>(null);
  const voice = useVoiceChat();

  const me = room.participants.find((p) => p.socketId === socket.id);
  const isHost = me?.isHost ?? false;
  // PLAYBACK ayari "Sadece Oynat"/"Otomatik Oynat" ise herkes oynat/duraklat/
  // sarabiliyor - video SECME yetkisi (openMediaPicker/selectSource'ta ayrica
  // kontrol edilir) "vote" haric hep host'ta kalir.
  const canControlTransport = isHost || room.playbackMode === "playOnly" || room.playbackMode === "autoplay";
  const syncable =
    room.playback.source?.type === "youtube" || room.playback.source?.type === "hls" || room.playback.source?.type === "mp4";

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const userId = data.user?.id;
      if (!userId) return;
      supabase
        .from("profiles")
        .select("default_reaction_emoji")
        .eq("id", userId)
        .maybeSingle()
        .then(({ data: profile }) => {
          if (profile?.default_reaction_emoji) setQuickReactionEmoji(profile.default_reaction_emoji);
        });
    });
  }, []);

  useEffect(() => {
    function handleRoomState(state: RoomState) {
      setRoom(state);
    }
    function handleChat(msg: ChatMessage) {
      setMessages((prev) => [...prev.slice(-199), msg]);
    }
    function handleMessageReaction({
      messageId,
      reactions,
    }: {
      messageId: string;
      reactions: { emoji: string; fromSocketId: string; fromName: string }[];
    }) {
      setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, reactions } : m)));
    }
    // "Chat Mesajlarini Otomatik Cevir" - ceviri mesajdan birkac yuz ms sonra
    // ayri bir event'le gelir (bkz. server/src/index.ts chat:send), ilgili
    // mesaja id ile sonradan eklenir (bkz. ChatBubbleRow).
    function handleChatTranslation({ messageId, translations }: { messageId: string; translations: Record<string, string> }) {
      setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, translations } : m)));
    }
    function handleKicked() {
      showAlert("Odadan atildin", "Oda lideri seni odadan cikardi.");
      onLeave();
    }
    socket.on("room:state", handleRoomState);
    socket.on("room:chat", handleChat);
    socket.on("room:chatTranslation", handleChatTranslation);
    socket.on("room:messageReaction", handleMessageReaction);
    socket.on("room:kicked", handleKicked);
    return () => {
      socket.off("room:state", handleRoomState);
      socket.off("room:chat", handleChat);
      socket.off("room:chatTranslation", handleChatTranslation);
      socket.off("room:messageReaction", handleMessageReaction);
      socket.off("room:kicked", handleKicked);
    };
  }, []);

  // Misafirler icin surukleme (drift) duzeltmesi.
  useEffect(() => {
    if (isHost || !syncable) return;
    const timer = setInterval(async () => {
      const current = roomRef.current;
      if (!current.playback.source || !current.playback.isPlaying || current.buffering.anyoneBuffering) return;
      const elapsed = (Date.now() - current.playback.updatedAtMs) / 1000;
      const expected = current.playback.positionSeconds + elapsed;
      const actual = await playerRef.current?.getCurrentTime();
      if (actual !== undefined && Math.abs(actual - expected) > DRIFT_TOLERANCE_SECONDS) {
        playerRef.current?.seekTo(expected);
      }
    }, GUEST_RESYNC_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [isHost, syncable]);

  // Host icin kalp atisi.
  useEffect(() => {
    if (!isHost || !syncable) return;
    const timer = setInterval(async () => {
      const current = roomRef.current;
      if (!current.playback.source || !current.playback.isPlaying) return;
      const actual = await playerRef.current?.getCurrentTime();
      if (actual !== undefined) {
        socket.emit("playback:update", { positionSeconds: actual, isPlaying: true });
      }
    }, HOST_HEARTBEAT_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [isHost, syncable]);

  // Misafirlerde: sunucudan gelen yeni durumu yerel oynaticiya uygular.
  // "leader" modunda host bundan MUAF (kendi oynaticisi zaten otorite) -
  // ama playOnly/autoplay/vote modlarinda HERKES (host dahil) baskasinin
  // yaptigi oynat/duraklat/sec islemini uygulamak zorunda, aksi halde
  // host'un oynaticisi baskasinin durdurmasini hic gormez. Aktif bir oylama
  // varken (video bitmis, sirada ne olsun bekleniyor) eski videoyu tekrar
  // yuklemeye/oynatmaya calismiyoruz - biten videonun "isPlaying" durumu
  // dalgalanip host'un kendi oynaticisini sifirdan tekrar yukleyip onu
  // aninda tekrar "bitirmesine" (sonsuz playback:ended dongusune) yol acardi.
  const appliedSourceUrlRef = useRef<string | null>(null);
  useEffect(() => {
    const url = room.playback.source?.url ?? null;
    // Host "leader" modundayken kendi oynaticisi zaten otorite (selectSource
    // kendisi loadVideo cagiriyor) - burada sadece ref'i o url'e esitleyip
    // cikiyoruz, aksi halde daha sonra baska bir moda gecince (ornegin
    // "vote") ref hala eski/bos oldugu icin zaten oynayan videoyu gereksiz
    // yere yeniden yukleyip kendi play() cagrisiyla yarisa girip
    // durduruyordu (goo.gl/LdLk22 hatasi, video kalici olarak pause'da kalirdi).
    if ((isHost && room.playbackMode === "leader") || !syncable || room.poll) {
      appliedSourceUrlRef.current = url;
      return;
    }
    if (!url) return;
    if (appliedSourceUrlRef.current !== url) {
      // loadVideo() yeni kaynagi yukleyip KENDISI play() cagiriyor (asenkron
      // replaceAsync zinciri icinde) - hemen altindaki play()/pause() burada
      // AYRICA cagrilirsa, henuz tamamlanmamis replaceAsync ile yarisip
      // "play() interrupted by pause()" hatasiyla videoyu kalici pause'da
      // biraktigi icin, yeni yukleme durumunda o ikinci cagriyi atliyoruz -
      // sadece sunucu "durmus baslasin" derse (isPlaying false) devreye giriyoruz.
      appliedSourceUrlRef.current = url;
      playerRef.current?.loadVideo(url, room.playback.positionSeconds);
      if (!room.playback.isPlaying) playerRef.current?.pause();
      return;
    }
    if (room.playback.isPlaying && !room.buffering.anyoneBuffering) playerRef.current?.play();
    else playerRef.current?.pause();
  }, [room.playback.source?.url, room.playback.isPlaying, room.buffering.anyoneBuffering, room.playbackMode, isHost, room.poll, syncable]);

  const handleHostPlayerChange = useCallback(
    (playing: boolean, currentTime: number) => {
      if (!canControlTransport) return;
      socket.emit("playback:update", { isPlaying: playing, positionSeconds: currentTime });
    },
    [canControlTransport]
  );

  const handleBuffering = useCallback((isBuffering: boolean) => {
    socket.emit("playback:buffering", { isBuffering });
  }, []);

  const lastDurationRef = useRef<number | null>(null);
  const handleDuration = useCallback(
    (seconds: number) => {
      if (!isHost || Math.round(seconds) === lastDurationRef.current) return;
      lastDurationRef.current = Math.round(seconds);
      socket.emit("playback:update", { durationSeconds: seconds });
    },
    [isHost]
  );

  function selectSource(source: MediaSource) {
    if (room.playbackMode === "vote") {
      socket.emit("room:proposeSource", { source }, () => {});
      setPickerVisible(false);
      return;
    }
    socket.emit("playback:update", { source, isPlaying: source.type !== "external", positionSeconds: 0 });
    if (source.type !== "external") playerRef.current?.loadVideo(source.url, 0);
  }

  // Video dogal olarak bitince (sadece "vote" modunda, sadece host tetikler) -
  // sunucu 10 saniyelik bir oylama penceresi acar, bu da asagidaki poll
  // useEffect'inin herkeste secim ekranini otomatik acmasini tetikler.
  const handleEnded = useCallback(() => {
    if (!isHost || room.playbackMode !== "vote" || room.poll) return;
    socket.emit("playback:ended");
  }, [isHost, room.playbackMode, room.poll]);

  // Oylama yeni basladiginda (null -> dolu) HERKESTE secim ekranini otomatik
  // ac; oylama sonuclanip kapandiginda (dolu -> null) hala aciksa kapat.
  // Platform secme ekrani (Netflix/Disney+ logolari) DEGIL, dogrudan
  // Rave'deki gibi biten videonun "ilgili/alakali videolar" gorunumu acilsin
  // diye biten videonun YouTube id'sini de tasiyoruz.
  const [pollRelatedVideoId, setPollRelatedVideoId] = useState<string | null | undefined>(undefined);
  const hadPollRef = useRef(false);
  useEffect(() => {
    const hasPoll = Boolean(room.poll);
    if (hasPoll && !hadPollRef.current) {
      const endedSource = room.playback.source;
      setPollRelatedVideoId(endedSource?.type === "youtube" ? endedSource.url : null);
      setPickerVisible(true);
    } else if (!hasPoll && hadPollRef.current) {
      setPickerVisible(false);
      setPollRelatedVideoId(undefined);
    }
    hadPollRef.current = hasPoll;
  }, [room.poll]);

  function openMediaPicker() {
    if (!isHost && room.playbackMode !== "vote") {
      showAlert("Sadece lider secebilir", "Medyayi sadece oda lideri degistirebilir.");
      return;
    }
    setPickerVisible(true);
  }

  // Video degisince (host yeni bir kaynak secince) eski videonun begeni
  // durumu yeni videoya YANLISLIKLA tasinmasin diye sifirlaniyor.
  useEffect(() => {
    setLikedEventId(null);
  }, [room.playback.source?.url]);

  function toggleLike() {
    if (!room.playback.source) return;
    if (likedEventId) {
      const eventId = likedEventId;
      setLikedEventId(null);
      socket.emit("room:unlike", { eventId }, () => {});
      return;
    }
    socket.emit("room:like", {}, (res: any) => {
      if (res?.ok) setLikedEventId(res.eventId);
    });
  }

  // Video uzerine binen kontrollerin oynat/duraklat/±10sn butonlari - sadece
  // playerRef'i tetikliyor, GERCEK senkron zaten mevcut onStateChange
  // zincirinden (handleHostPlayerChange) geciyor, burada AYRICA emit
  // etmiyoruz (cift gonderim/yarisi onlenir).
  function togglePlayPause() {
    if (!canControlTransport) return;
    if (room.playback.isPlaying) playerRef.current?.pause();
    else playerRef.current?.play();
  }

  function seekTo(seconds: number) {
    if (!canControlTransport) return;
    const next = Math.max(0, seconds);
    playerRef.current?.seekTo(next);
    socket.emit("playback:update", { positionSeconds: next, isPlaying: room.playback.isPlaying });
  }

  async function skipBy(deltaSeconds: number) {
    if (!canControlTransport) return;
    const current = (await playerRef.current?.getCurrentTime()) ?? room.playback.positionSeconds;
    seekTo(current + deltaSeconds);
  }

  // Ilerletme cubugundaki canli pozisyon - sunucu sadece degisiklik oldukca
  // (play/pause/seek, host kalp atisinda 5sn'de bir) gonderiyor, aradaki
  // sureyi "updatedAtMs'den bu yana gecen zaman" ile yerel olarak tahmin
  // ediyoruz (misafir surukleme duzeltmesindeki AYNI formul).
  const [displayPosition, setDisplayPosition] = useState(room.playback.positionSeconds);
  useEffect(() => {
    function tick() {
      if (!room.playback.isPlaying) {
        setDisplayPosition(room.playback.positionSeconds);
        return;
      }
      const elapsed = (Date.now() - room.playback.updatedAtMs) / 1000;
      setDisplayPosition(room.playback.positionSeconds + elapsed);
    }
    tick();
    const timer = setInterval(tick, 500);
    return () => clearInterval(timer);
  }, [room.playback.positionSeconds, room.playback.isPlaying, room.playback.updatedAtMs]);

  function toggleFullscreenVideo() {
    setFullscreenVideo((v) => !v);
  }

  // Video ustundeki uyari ikonu - o anki odayi/videoyu host'u hedef alarak
  // sikayet eder, DMScreen'deki "Sikayet Et" ile AYNI genel mekanizma
  // (report:submit) - LUNA'da oda/video'ya ozel ayri bir rapor turu yok.
  const roomHostUserId = room.participants.find((p) => p.isHost)?.userId ?? null;
  function submitRoomReport() {
    const reason = reportReason.trim();
    if (!reason || !roomHostUserId) return;
    socket.emit("report:submit", { targetUserId: roomHostUserId, reason }, (res: any) => {
      if (res?.ok) showAlert("Rapor gönderildi", "Bildirimin için teşekkürler, inceleyeceğiz.");
      else showAlert("Hata", "Rapor gönderilemedi, tekrar dene.");
    });
    setReportReason("");
    setReportVisible(false);
  }

  // "Sıradakine gec" - vote modunda, video dogal olarak bitmeden host'un
  // oylamayi ERKEN acmasi. Sunucu tarafinda zaten "playback:ended" (video
  // bitince ayni akisi tetikleyen event) ile BIREBIR ayni islem - yeni bir
  // sunucu kodu gerekmiyor.
  const canSkipToNext = isHost && room.playbackMode === "vote" && !room.poll;
  function skipToNext() {
    if (!canSkipToNext) return;
    socket.emit("playback:ended");
  }

  function shareRoom() {
    Share.share({ message: `LUNA'da "${room.title}" odama katil! Kod: ${room.code}` }).catch(() => {});
  }

  function changePrivacy(privacy: PrivacyLevel) {
    socket.emit("room:settings", { privacy }, () => {});
  }

  function changePlaybackMode(playbackMode: PlaybackMode) {
    socket.emit("room:settings", { playbackMode }, () => {});
  }

  function toggleAutoTranslate(autoTranslateChat: boolean) {
    socket.emit("room:settings", { autoTranslateChat }, () => {});
  }

  function toggleAdult(isAdult: boolean) {
    socket.emit("room:settings", { isAdult }, () => {});
  }

  function handleVolumeChange(v: number) {
    setVolume(v);
    voice.setRemoteVolume(v);
  }

  function castVote(proposalId: string) {
    socket.emit("room:vote", { proposalId }, () => {});
  }

  // Oylama aktifken geri sayimi canli gostermek icin saniyede bir yeniden
  // render tetikler - baska bir amaci yok.
  const [, forceTick] = useState(0);
  useEffect(() => {
    if (!room.poll) return;
    const timer = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, [room.poll]);

  function insertMention() {
    setChatInput((prev) => (prev.endsWith("@") || prev.length === 0 ? prev + "@" : prev + " @"));
  }

  async function pickImage() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      showAlert("İzin gerekli", "Fotoğraf seçmek için galeri iznine ihtiyacımız var.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.7 });
    if (result.canceled || !result.assets?.[0]) return;
    setPendingImageUri(result.assets[0].uri);
  }

  // "chat-media" bucket'ina gonderen kullanicinin KENDI klasorune (avatars/
  // gallery ile ayni desen, bkz. 0015_chat_media.sql) yukler, ortaya cikan
  // public URL'i sonra "chat:sendImage" ile odadaki herkese iletilir.
  async function sendPickedImage(isAdult: boolean) {
    if (!pendingImageUri) return;
    setUploadingImage(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) {
        showAlert("Giriş gerekli", "Fotoğraf göndermek için giriş yapmış olman gerekiyor.");
        return;
      }
      const arrayBuffer = await fetch(pendingImageUri).then((res) => res.arrayBuffer());
      const ext = pendingImageUri.split(".").pop()?.toLowerCase().split("?")[0] || "jpg";
      const contentType = ext === "png" ? "image/png" : "image/jpeg";
      const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const path = `${userId}/${fileName}`;
      const { error: uploadError } = await supabase.storage.from("chat-media").upload(path, arrayBuffer, { contentType });
      if (uploadError) throw uploadError;
      const { data: publicUrlData } = supabase.storage.from("chat-media").getPublicUrl(path);
      socket.emit("chat:sendImage", { mediaUrl: publicUrlData.publicUrl, isAdult });
      setPendingImageUri(null);
    } catch (err: any) {
      showAlert("Gönderilemedi", err?.message || "Fotoğraf gönderilirken bir hata oluştu, tekrar dene.");
    } finally {
      setUploadingImage(false);
    }
  }

  // Oda haritasi - react-native-maps YERINE WebView+Leaflet kullaniyoruz
  // (bkz. RoomMapSheet.tsx) ki Expo Go'da native kod derlemeden calissin.
  // "Konumu Gizle" ACIKSA (varsayilan) GPS hic istenmez/gonderilmez - sadece
  // kapatip paylasmayi SECENLERIN konumu digerlerine gorunur.
  async function showMap() {
    const hidden = await isHideLocationEnabled();
    if (!hidden) {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.granted) {
        try {
          const pos = await Location.getCurrentPositionAsync({});
          socket.emit("room:location", { lat: pos.coords.latitude, lng: pos.coords.longitude });
        } catch {
          // Konum alinamadi (orn. cihazda GPS kapali) - sessizce yok say,
          // harita yine de digerlerinin konumuyla acilir.
        }
      }
    }
    setMapVisible(true);
  }

  function sendChat() {
    if (!chatInput.trim()) return;
    socket.emit("chat:send", { text: chatInput, replyTo: replyingTo });
    setChatInput("");
    setReplyingTo(null);
  }

  function startReply(item: ChatMessage) {
    setReplyingTo({ text: item.text, fromName: item.fromSocketId === socket.id ? "Sen" : item.from || "?" });
  }

  function sendReaction(emoji: string) {
    reactionsRef.current?.sendReaction(emoji);
  }

  // Sohbette bir mesaja CIFT TIKLAYINCA Ayarlar'da secilen hizli tepki
  // emojisini gonderir (ayni emojiyle ikinci cift-tik sunucu tarafinda
  // geri alinir, bkz. server/src/index.ts message:react).
  function reactToMessage(item: ChatMessage) {
    if (!item.id) return;
    socket.emit("message:react", { messageId: item.id, emoji: quickReactionEmoji });
  }

  function kick(targetSocketId: string) {
    socket.emit("host:kick", { targetSocketId }, () => {});
  }

  function makeLeader(targetSocketId: string) {
    socket.emit("host:transfer", { targetSocketId }, () => {});
  }

  function leave() {
    socket.emit("room:leave");
    voice.leave();
    onLeave();
  }

  function handleMicPress() {
    if (!voice.connected) voice.join();
    else voice.toggleMute();
  }

  function handleMicLongPress() {
    if (!voice.connected) return;
    showAlert("Sesli sohbetten cik", "Sesli sohbetten ayrilmak istedigine emin misin?", [
      { text: "Vazgec", style: "cancel" },
      { text: "Cik", style: "destructive", onPress: voice.leave },
    ]);
  }

  // Haritada gosterilecek katilimcilar - sadece "Konumu Gizle"yi KAPATIP
  // paylasmayi secenlerin location'i dolu gelir (bkz. showMap / server
  // rooms.ts setParticipantLocation).
  const mapMarkers = room.participants
    .filter((p) => p.location)
    .map((p) => ({ name: p.name, lat: p.location!.lat, lng: p.location!.lng, isMe: p.socketId === socket.id }));
  const hiddenParticipantCount = room.participants.length - mapMarkers.length;

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      {/* Ust bar (Rave'deki X / ayarlar / logo / ara / katilimci duzeni) - medya
          alaninin uzerine binmez, kendi satirinda durur, video tam altinda baslar */}
      <View style={[styles.topBar, isDesktop && styles.topBarDesktop]}>
        <TouchableOpacity style={styles.iconTouch} onPress={() => setLeaveConfirmVisible(true)} hitSlop={8}>
          <Icon name="close" size={30} color={theme.text} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.iconTouch} onPress={() => setSettingsVisible(true)} hitSlop={8}>
          <Icon name="settings" size={30} color={theme.text} />
        </TouchableOpacity>
        <Image source={require("../../assets/lavin-icon-mark.png")} style={styles.logo} resizeMode="contain" />
        <TouchableOpacity style={[styles.iconTouch, !isHost && styles.topIconDim]} onPress={openMediaPicker} hitSlop={8}>
          <Icon name="search" size={30} color={theme.text} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.participantsBadge} onPress={() => setParticipantsVisible(true)} hitSlop={8}>
          <Icon name="people" size={30} color={theme.text} />
          <View style={styles.countBubble}>
            <Text style={styles.countText}>{room.participants.length}</Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* PC'de (DESKTOP_BREAKPOINT ustu genislik) video solda buyuk, sohbet
          saginda sabit genislikte DAIMA ACIK bir panel olarak yan yana durur -
          telefon genisliginde ayni JSX tek sutun halinde ustte video, altinda
          sohbet olarak akar (roomBody/videoCol/chatCol sadece DESKTOP'ta
          ekstra stil alir, mobilde gorunum ESKISI GIBI kalir). */}
      <View style={[styles.roomBody, isDesktop && styles.roomBodyDesktop]}>
        <View style={[isDesktop && styles.videoColDesktop, fullscreenVideo && styles.videoColFullscreen]}>
          {/* Medya alani - ust barin hemen altinda, ustune binmeden */}
          <View style={styles.mediaSection}>
            <ReactionsOverlay ref={reactionsRef}>
              <MediaPlayer
                ref={playerRef}
                source={room.playback.source}
                onStateChange={handleHostPlayerChange}
                onBuffering={handleBuffering}
                onDuration={handleDuration}
                onEnded={handleEnded}
              />
              {syncable && (
                <VideoControlsOverlay
                  isPlaying={room.playback.isPlaying}
                  canControlTransport={canControlTransport}
                  liked={Boolean(likedEventId)}
                  onToggleLike={toggleLike}
                  onPlayPause={togglePlayPause}
                  onSkip={skipBy}
                  showSkipNext={canSkipToNext}
                  onSkipNext={skipToNext}
                  onReport={() => setReportVisible(true)}
                  onSettings={() => setSettingsVisible(true)}
                />
              )}
            </ReactionsOverlay>

            <LinearGradient colors={["transparent", theme.bg]} style={styles.bottomFade} pointerEvents="none" />
          </View>

          {syncable && (
            <VideoSeekBar
              positionSeconds={displayPosition}
              durationSeconds={room.playback.durationSeconds ?? null}
              canSeek={canControlTransport}
              onSeek={seekTo}
              isFullscreen={fullscreenVideo}
              onToggleFullscreen={toggleFullscreenVideo}
            />
          )}

          {room.buffering.anyoneBuffering && (
            <View style={styles.bufferingBanner}>
              <Text style={styles.bufferingText}>⏳ {room.buffering.names.join(", ")} icin bekleniyor (tamponlaniyor)...</Text>
            </View>
          )}

          {room.poll && (
            <View style={styles.pollBanner}>
              <View style={styles.pollHeaderRow}>
                <Text style={styles.pollTitle}>🗳️ Oylama - ne izleyelim?</Text>
                <Text style={styles.pollTimer}>{Math.max(0, Math.ceil((room.poll.deadlineMs - Date.now()) / 1000))}sn</Text>
              </View>
              {room.poll.proposals.map((p) => {
                const voteCount = Object.values(room.poll!.votes).filter((id) => id === p.id).length;
                const myVote = socket.id ? room.poll!.votes[socket.id] : undefined;
                const isMine = myVote === p.id;
                return (
                  <TouchableOpacity
                    key={p.id}
                    style={[styles.pollOption, isMine && styles.pollOptionActive]}
                    onPress={() => castVote(p.id)}
                  >
                    <Text style={styles.pollOptionText} numberOfLines={1}>
                      {p.source.label || p.source.type} · {p.proposedByName}
                    </Text>
                    <Text style={styles.pollOptionVotes}>{voteCount} oy</Text>
                  </TouchableOpacity>
                );
              })}
              <TouchableOpacity onPress={openMediaPicker}>
                <Text style={styles.pollAddLink}>Secimini degistir</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {!fullscreenVideo && (
        <View style={[styles.chatCol, isDesktop && styles.chatColDesktop]}>
      {/* Sohbet - medyanin hemen altinda, gradyanla ona "batmis" gibi baslar */}
      <FlatList
        style={styles.chatList}
        contentContainerStyle={styles.chatContent}
        data={messages}
        keyExtractor={(_, i) => String(i)}
        renderItem={({ item, index }) => {
          // Rave'de oldugu gibi: arka arkaya gelen mesajlarda ayni
          // gondericinin avatari/ismi sadece grubun ilkinde gosteriliyor,
          // devaminda sadece metin aliniyor.
          const prev = messages[index - 1];
          const groupedWithPrev = !!prev && !prev.system && !item.system && prev.fromSocketId === item.fromSocketId;
          return !item.system ? (
            <ChatBubbleRow
              item={item}
              isOwn={item.fromSocketId === socket.id}
              groupedWithPrev={groupedWithPrev}
              onReply={() => startReply(item)}
              onDoubleTap={() => reactToMessage(item)}
            />
          ) : item.kind === "joined" ? (
            <View style={styles.messageRow}>
              <Avatar name={item.targetName || "?"} avatarUrl={item.targetAvatarUrl} size={32} />
              <View style={styles.messageTextCol}>
                <Text style={styles.chatMsg}>
                  <Text style={styles.chatFrom}>{item.targetName}</Text> odaya katıldı
                </Text>
              </View>
            </View>
          ) : item.kind === "nowPlaying" ? (
            <View style={styles.nowPlayingRow}>
              <Text style={styles.nowPlayingText} numberOfLines={1}>
                Şimdi <Text style={styles.nowPlayingTitle}>{item.title}</Text> oynatılıyor
              </Text>
              <TouchableOpacity onPress={() => sendReaction("❤️")} hitSlop={8}>
                <Text style={styles.nowPlayingHeart}>♡</Text>
              </TouchableOpacity>
            </View>
          ) : item.kind === "kicked" ? (
            <View style={styles.eventRow}>
              <Icon name="kicked" size={16} color={theme.textMuted} />
              <Text style={styles.eventText} numberOfLines={1}>
                <Text style={styles.eventBold}>{item.targetName}</Text>, <Text style={styles.eventBold}>{item.byName}</Text>{" "}
                tarafından atıldı
              </Text>
            </View>
          ) : item.kind === "settings" ? (
            <View style={styles.eventRow}>
              <Icon name="settings" size={14} color={theme.textMuted} />
              <Text style={styles.eventText} numberOfLines={1}>
                <Text style={styles.eventBold}>{item.byName}</Text> {item.settingLabel}: {item.settingValue}
              </Text>
            </View>
          ) : (
            <Text style={styles.systemMsg}>{item.text}</Text>
          );
        }}
      />

      {replyingTo && (
        <View style={styles.replyBar}>
          <Icon name="reply" size={16} color={theme.accent} />
          <View style={styles.replyBarText}>
            <Text style={styles.replyBarFrom}>{replyingTo.fromName}</Text>
            <Text style={styles.replyBarBody} numberOfLines={1}>
              {replyingTo.text}
            </Text>
          </View>
          <TouchableOpacity onPress={() => setReplyingTo(null)} hitSlop={8}>
            <Icon name="close" size={16} color={theme.textMuted} />
          </TouchableOpacity>
        </View>
      )}

      {/* Alt bar - mikrofon / mesaj kutusu / etiket / galeri / davet / paylas / gonder (Rave'deki alt bar duzeni) */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={[styles.micButton, voice.connected && voice.muted && styles.micButtonMuted]}
          onPress={handleMicPress}
          onLongPress={handleMicLongPress}
        >
          <Icon
            name={voice.connected && voice.muted ? "micOff" : "mic"}
            size={28}
            color={voice.connected && !voice.muted ? theme.accent : "#04140D"}
          />
        </TouchableOpacity>
        <TextInput
          style={styles.chatInput}
          placeholder="Mesaj yaz..."
          placeholderTextColor={theme.textMuted}
          value={chatInput}
          onChangeText={setChatInput}
          onSubmitEditing={sendChat}
          onFocus={() => setChatFocused(true)}
          onBlur={() => setChatFocused(false)}
        />
        {chatFocused ? (
          // Yaziyorken: Rave'deki gibi sadece gonder oku gorunur.
          <TouchableOpacity style={styles.iconTouchSm} onPress={sendChat} hitSlop={4}>
            <Icon name="send" size={30} color={theme.accentBright} />
          </TouchableOpacity>
        ) : (
          // Yazmiyorken: paylas/etiket/galeri/davet/harita ikonlari gorunur.
          <View style={styles.actionGroup}>
            <TouchableOpacity style={styles.iconTouchSm} onPress={shareRoom} hitSlop={4}>
              <Icon name="share" size={30} color="#FFFFFF" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconTouchSm} onPress={insertMention} hitSlop={4}>
              <Icon name="mention" size={30} color="#FFFFFF" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconTouchSm} onPress={pickImage} hitSlop={4}>
              <Icon name="image" size={30} color="#FFFFFF" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconTouchSm} onPress={shareRoom} hitSlop={4}>
              <Icon name="invite" size={30} color="#FFFFFF" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconTouchSm} onPress={showMap} hitSlop={4}>
              <Icon name="globe" size={30} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        )}
      </View>
      {voice.error && <Text style={styles.errorText}>{voice.error}</Text>}
        </View>
        )}
      </View>

      <MediaPickerSheet
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
        onSelect={selectSource}
        relatedVideosFor={pollRelatedVideoId}
      />
      <SendMediaSheet
        visible={!!pendingImageUri}
        imageUri={pendingImageUri}
        uploading={uploadingImage}
        onCancel={() => setPendingImageUri(null)}
        onSend={sendPickedImage}
      />
      <RoomMapSheet
        visible={mapVisible}
        onClose={() => setMapVisible(false)}
        markers={mapMarkers}
        hiddenCount={hiddenParticipantCount}
      />
      <ParticipantsModal
        visible={participantsVisible}
        onClose={() => setParticipantsVisible(false)}
        participants={room.participants}
        mySocketId={socket.id}
        isHost={isHost}
        onKick={kick}
        onMakeLeader={makeLeader}
      />
      <RoomSettingsSheet
        visible={settingsVisible}
        onClose={() => setSettingsVisible(false)}
        isHost={isHost}
        privacy={room.privacy}
        playbackMode={room.playbackMode}
        autoTranslateChat={room.autoTranslateChat}
        onChangePrivacy={changePrivacy}
        onChangePlaybackMode={changePlaybackMode}
        onToggleAutoTranslate={toggleAutoTranslate}
        isAdult={room.isAdult}
        onToggleAdult={toggleAdult}
        micConnected={voice.connected}
        micMuted={voice.muted}
        onMicPress={handleMicPress}
        onLeaveVoice={voice.leave}
        volume={volume}
        onVolumeChange={handleVolumeChange}
      />

      {leaveConfirmVisible && (
        <View style={styles.leaveOverlay}>
          <View style={styles.leaveCard}>
            <Text style={styles.leaveCardText}>Çıkıyor musun?</Text>
            <View style={styles.leaveCardButtons}>
              <TouchableOpacity style={styles.leaveCardButton} onPress={() => setLeaveConfirmVisible(false)}>
                <Icon name="close" size={20} color={theme.text} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.leaveCardButton} onPress={leave}>
                <Icon name="check" size={20} color={theme.text} />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      <Modal visible={reportVisible} transparent animationType="slide" onRequestClose={() => setReportVisible(false)}>
        <TouchableOpacity style={styles.reportOverlay} activeOpacity={1} onPress={() => setReportVisible(false)}>
          <TouchableOpacity activeOpacity={1} style={styles.reportCard} onPress={() => {}}>
            <Text style={styles.reportTitle}>Bu odayı şikayet et</Text>
            <Text style={styles.reportSubtitle}>Neden şikayet ettiğini kısaca yaz.</Text>
            <TextInput
              style={styles.reportInput}
              value={reportReason}
              onChangeText={setReportReason}
              placeholder="Şikayet nedeni..."
              placeholderTextColor={theme.textMuted}
              multiline
              autoFocus
            />
            <TouchableOpacity
              style={[styles.reportSubmitBtn, !reportReason.trim() && styles.reportSubmitBtnDisabled]}
              onPress={submitRoomReport}
              disabled={!reportReason.trim()}
            >
              <Text style={styles.reportSubmitBtnText}>Gönder</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  mediaSection: { position: "relative" },
  bottomFade: { position: "absolute", left: 0, right: 0, bottom: 0, height: 48 },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingTop: 50,
    paddingBottom: 10,
    backgroundColor: theme.bg,
  },
  // PC'de telefonun ust cenitk/durum cubugu boslugu olan paddingTop:50
  // gereksiz - masaustunde makul bir ust bosluk yeterli.
  topBarDesktop: { paddingTop: 18, paddingHorizontal: 24 },
  // Telefon genisliginde (varsayilan): tek sutun, video ustte, sohbet altta -
  // eskisiyle BIREBIR ayni gorunum (roomBody/videoCol'un ekstra stili yok).
  // PC genisliginde (roomBodyDesktop): video solda buyuk, sohbet saginda
  // sabit genislikte bir panel - ayni JSX, sadece duzen yonu degisiyor.
  roomBody: { flex: 1 },
  roomBodyDesktop: { flexDirection: "row" },
  videoColDesktop: { flex: 1, paddingHorizontal: 24, paddingTop: 16 },
  videoColFullscreen: { flex: 1, justifyContent: "center", backgroundColor: theme.bg },
  // chatCol mobilde FlatList'in flex:1 ile kalan yuksekligi doldurabilmesi
  // icin kendisi de flex:1 olmali (eskiden FlatList dogrudan ana flex:1
  // konteynerin cocuguydu, simdi bir katman daha icerde oldugu icin bu
  // flex:1 zincirinin kopmamasi gerekiyor).
  chatCol: { flex: 1 },
  chatColDesktop: {
    // DIKKAT: "flex: 0" yerine ayri ayri flexGrow/flexShrink/flexBasis
    // yaziliyor - "flex:0" RN-web'de flexBasis'i "0%" yapiyor, bu da
    // kardes elemanla genislik paylasirken "width:380"i TAMAMEN gecersiz
    // kiliyor (flex-basis tanimliyken width yoksayilir) ve panel 0
    // genislige cokup icerigi disari tasiriyordu. flexBasis'i dogrudan
    // 380 vermek bu sorunu kesin cozuyor.
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: 380,
    width: 380,
    borderLeftWidth: 1,
    borderColor: theme.border,
    paddingTop: 8,
  },
  iconTouch: { width: 38, height: 38, justifyContent: "center", alignItems: "center" },
  actionGroup: { flexDirection: "row", alignItems: "center" },
  iconTouchSm: { width: 30, height: 38, justifyContent: "center", alignItems: "center", flexShrink: 0 },
  topIconDim: { opacity: 0.35 },
  // lavin-icon-mark.png'nin gorsel agirlik merkezi (yildiz susleme + "LUNA"
  // yazisi) kutunun geometrik ortasinin ~6px altinda - ikonlarla ayni
  // hizaya gelmesi icin bu kadar yukari kaydiriyoruz (piksel analiziyle
  // olculdu, tahmini degil).
  logo: { width: 74, height: 34, marginTop: -6, tintColor: "#FFFFFF" },
  participantsBadge: { position: "relative", width: 38, height: 38, justifyContent: "center", alignItems: "center" },
  countBubble: {
    position: "absolute",
    top: 1,
    right: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 7,
    minWidth: 14,
    height: 14,
    paddingHorizontal: 3,
    justifyContent: "center",
    alignItems: "center",
  },
  countText: { color: "#04140D", fontSize: 9, fontWeight: "700" },
  bufferingBanner: {
    marginHorizontal: 12,
    marginTop: 6,
    backgroundColor: "rgba(14,165,233,0.12)",
    borderColor: theme.accent,
    borderWidth: 1,
    borderRadius: 10,
    padding: 8,
  },
  bufferingText: { color: theme.accentBright, fontSize: 12 },
  pollBanner: {
    marginHorizontal: 12,
    marginTop: 6,
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    gap: 6,
  },
  pollHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  pollTitle: { color: theme.text, fontSize: 13, fontWeight: "700" },
  pollTimer: { color: theme.accentBright, fontSize: 13, fontWeight: "700" },
  pollOption: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: theme.surfaceAlt,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "transparent",
  },
  pollOptionActive: { borderColor: theme.accent },
  pollOptionText: { color: theme.text, fontSize: 12, flex: 1, marginRight: 8 },
  pollOptionVotes: { color: theme.textMuted, fontSize: 12, fontWeight: "700" },
  pollAddLink: { color: theme.info, fontSize: 12, fontWeight: "600", textAlign: "center", marginTop: 2 },
  chatList: { flex: 1 },
  chatContent: { paddingHorizontal: 12, paddingTop: 4, paddingBottom: 8, gap: 6 },
  // Rave'deki gibi balonsuz, duz metin sohbet: gelen mesajlarda avatar solda,
  // isim+metin tek satirda ic ice ("Isim: metin"); kendi mesajlarimizda
  // isim gosterilmez, metin saga yaslanir, avatar sagda. Satir HER ZAMAN
  // "flex-start" (en ustten hizali) - tek/coklu satir ayrimi messageTextCol'un
  // minHeight+justifyContent kombinasyonuyla saf CSS ile cozuluyor (bkz. o
  // stilin yorumu). position:"relative" kaydirinca beliren reply ikonuna
  // (replyHint) referans nokta saglamak icin.
  messageRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, alignSelf: "flex-start", maxWidth: "88%", position: "relative" },
  messageRowOwn: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    alignSelf: "flex-end",
    maxWidth: "88%",
    justifyContent: "flex-end",
    position: "relative",
  },
  // Ayni gondericiden arka arkaya gelen mesajlarda avatar sadece grubun
  // ilkinde gosterilir - devam eden satirlar avatarin genisligi kadar
  // bosluk birakip metnin hizasini korur (Rave'deki gruplama davranisi).
  avatarSpacer: { width: 32 },
  // Metin + (varsa) alinti kutusunu dikey olarak ust uste dizen sutun.
  // minHeight avatarin boyuyla (32) ayni, justifyContent:"center" ile:
  // - Tek satirlik kisa metin bu 32'lik kutunun icinde dikey ortalanir ->
  //   avatarla ayni yukseklikte oldugu icin TAM ORTASINDAN baslamis gorunur.
  // - Iki+ satirlik metin kutuyu zaten doldurup tastigi icin (dogal
  //   yuksekligi 32'den buyuk) justifyContent'in etkisi kalmaz, en ustten
  //   baslamaya devam eder - flex-start satirla ayni hizada.
  // Bu saf CSS cozumu onTextLayout'a (react-native-web'de desteklenmiyor,
  // ayrica native'de de render sonrasi "ziplama" yaratiyordu) ihtiyac
  // birakmiyor.
  messageTextCol: { flexShrink: 1, minHeight: 32, justifyContent: "center" },
  chatMsg: { color: theme.text, fontSize: 14 },
  chatMsgOwn: { color: theme.text, fontSize: 14, textAlign: "right" },
  reactionBadgeRow: { flexDirection: "row", gap: 2, marginTop: 2 },
  reactionBadgeEmoji: { fontSize: 13 },
  chatFrom: { color: theme.text, fontSize: 14, fontWeight: "700" },
  translatedHint: { color: theme.accentBright, fontSize: 10, fontWeight: "600", marginTop: 2 },
  systemMsg: { color: theme.textMuted, fontSize: 12, fontStyle: "italic", textAlign: "center" },
  // Mesaji kaydirirken (reply) beliren kucuk ok ikonu - satirin disina,
  // acilan bosluga yerlesiyor (bkz. ChatBubbleRow).
  replyHint: { position: "absolute", top: 0, bottom: 0, width: 20, alignItems: "center", justifyContent: "center" },
  // Yanitlanan mesajin alintisi - gonderilen mesajin hemen ustunde kucuk bir
  // etiket gibi duruyor (Rave'deki yanit onizlemesi).
  replyQuote: {
    backgroundColor: theme.surfaceAlt,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 2,
    alignSelf: "flex-start",
  },
  replyQuoteOwn: { alignSelf: "flex-end" },
  replyQuoteText: { color: theme.textMuted, fontSize: 11, fontStyle: "italic" },
  // Mesaj kutusunun hemen ustunde: "su mesaja yanit yaziyorsun" cubugu.
  replyBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: theme.surfaceAlt,
    borderTopWidth: 1,
    borderColor: theme.border,
  },
  replyBarText: { flex: 1 },
  replyBarFrom: { color: theme.accent, fontSize: 12, fontWeight: "700" },
  replyBarBody: { color: theme.textMuted, fontSize: 12, marginTop: 1 },
  nowPlayingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 4,
  },
  nowPlayingText: { color: theme.textMuted, fontSize: 12, fontWeight: "600", flexShrink: 1 },
  nowPlayingTitle: { color: theme.text, fontWeight: "700" },
  nowPlayingHeart: { color: theme.danger, fontSize: 16 },
  eventRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 4 },
  eventText: { color: theme.textMuted, fontSize: 12, flexShrink: 1 },
  eventBold: { color: theme.text, fontWeight: "700" },
  bottomBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderTopWidth: 1,
    borderTopColor: theme.border,
  },
  micButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    marginVertical: -8, // alt bar'in yuksekligini artirmasin diye disariya tasiriyoruz
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 0,
    transform: [{ translateX: -4 }, { translateY: -4 }], // hafif sola/yukari - yuvarlak sekil bozulmadan (kliplenmeden) kaydiriliyor
  },
  micButtonMuted: { backgroundColor: theme.danger },
  chatInput: {
    // Gorunur bir "kutu" degil - mikrofon ve saglardaki ikonlar disindaki
    // tum bos alan bu TextInput, dokununca yine de yazi yazilabiliyor.
    flex: 1,
    minWidth: 0,
    alignSelf: "stretch",
    color: theme.text,
    paddingHorizontal: 10,
    // Web onizlemesindeki varsayilan odak cercevesini (beyaz kare) kapatiyor -
    // gercek Android/iOS'ta zaten yok, sadece tarayici davranisi.
    outlineWidth: 0,
    outlineStyle: "none",
  } as any,
  errorText: { color: theme.danger, fontSize: 12, textAlign: "center", paddingBottom: 6 },
  leaveOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  leaveCard: {
    backgroundColor: "#141416",
    borderRadius: 18,
    paddingVertical: 22,
    paddingHorizontal: 26,
    alignItems: "center",
    gap: 16,
  },
  leaveCardText: { color: theme.text, fontSize: 18, fontWeight: "700" },
  leaveCardButtons: { flexDirection: "row", gap: 14 },
  leaveCardButton: {
    width: 56,
    height: 56,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  reportOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  reportCard: {
    backgroundColor: theme.surface,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 20,
    alignItems: "center",
  },
  reportTitle: { color: theme.text, fontSize: 16, fontWeight: "700", marginBottom: 4, alignSelf: "flex-start" },
  reportSubtitle: { color: theme.textMuted, fontSize: 12, marginBottom: 14, alignSelf: "flex-start" },
  reportInput: {
    width: "100%",
    minHeight: 80,
    backgroundColor: theme.surfaceAlt,
    color: theme.text,
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    textAlignVertical: "top",
    marginBottom: 14,
  },
  reportSubmitBtn: { width: "100%", backgroundColor: theme.accent, borderRadius: 10, paddingVertical: 14, alignItems: "center" },
  reportSubmitBtnDisabled: { opacity: 0.4 },
  reportSubmitBtnText: { color: "#04140D", fontWeight: "700", fontSize: 16 },
});
