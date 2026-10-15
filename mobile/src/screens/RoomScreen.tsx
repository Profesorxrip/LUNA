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
  Image,
  Animated,
  PanResponder,
  useWindowDimensions,
  Modal,
  Keyboard,
} from "react-native";
import { BlurView } from "expo-blur";
import { useTranslation } from "react-i18next";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import * as ScreenOrientation from "expo-screen-orientation";
import * as Clipboard from "expo-clipboard";
import { getSocket, RoomState, ChatMessage } from "../services/socket";
import type { MediaSource, DMReply, FriendUser, Participant } from "../services/socket";
import { supabase } from "../services/supabase";
import MediaPlayer, { MediaPlayerHandle } from "../components/MediaPlayer";
import MediaPickerSheet from "../components/MediaPickerSheet";
import ReactionsOverlay, { ReactionsOverlayHandle } from "../components/ReactionsOverlay";
import VideoControlsOverlay from "../components/VideoControlsOverlay";
import NowPlayingBar from "../components/NowPlayingBar";
import ParticipantsModal from "../components/ParticipantsModal";
import FriendsScreen from "./FriendsScreen";
import RoomSettingsSheet from "../components/RoomSettingsSheet";
import VideoSettingsSheet from "../components/VideoSettingsSheet";
import MessageOptionsSheet from "../components/MessageOptionsSheet";
import ProfileOptionsSheet, { ProfileOptionsTarget } from "../components/ProfileOptionsSheet";
import SendMediaSheet from "../components/SendMediaSheet";
import ChatImageBubble from "../components/ChatImageBubble";
import RoomMapSheet from "../components/RoomMapSheet";
import RoomQuickCards, { PRIVACY_OPTIONS, PLAYBACK_INFO } from "../components/RoomQuickCards";
import Avatar from "../components/Avatar";
import CrownBadge from "../components/CrownBadge";
import ModeratorBadge from "../components/ModeratorBadge";
import AdultBadge from "../components/AdultBadge";
import { coverUrlForSource } from "../utils/media";
import Icon, { IconName } from "../components/Icon";
import { showAlert } from "../components/CustomAlert";
import { isHideLocationEnabled } from "../utils/locationSettings";
import type { PrivacyLevel, PlaybackMode } from "../services/socket";
import { useVoiceChat } from "../hooks/useVoiceChat";
import { theme } from "../theme";

interface Props {
  initialRoom: RoomState;
  onLeave: () => void;
  // Katilimci secenek panelindeki (bkz. ProfileOptionsSheet.tsx) "Profil"
  // satirina basilinca - DiscoverScreen/FriendsScreen/DMScreen'deki AYNI
  // "onOpenParticipant" deseni (bkz. RootNavigator.tsx).
  onOpenParticipant: (peer: { userId: string; name: string; handle?: string }) => void;
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
  // Mesaja BASILI TUTUNCA (Rave'deki gibi) ekranin altina acilan panel
  // (bkz. MessageOptionsSheet.tsx).
  onLongPressMessage: () => void;
  // Discover'daki mavi "arkadas halkasi" ile AYNI - bu mesaji gonderen
  // gercek arkadasimizsa true (bkz. Avatar.tsx isFriend, RoomScreen.tsx
  // friendIds).
  isFriend: boolean;
  // Katilimcilar panelindeki taç/kalkan rozetleriyle AYNI (bkz.
  // ParticipantsModal.tsx) - sohbette de gonderici lider/moderatorse
  // avatarinin uzerinde gosterilir.
  senderIsHost: boolean;
  senderIsModerator: boolean;
  // Bir tepki kartina BASINCA (uzun basma degil, tek dokunus) o emojiyle
  // tepki verir / zaten o emojiyle tepki vermissek geri ceker (bkz.
  // RoomScreen.tsx reactToMessageWithEmoji, server/src/index.ts message:react
  // - sunucu zaten ayni emojiyle ikinci tepkiyi toggle/geri aliyor).
  onReactWithEmoji: (emoji: string) => void;
}

type Reaction = { emoji: string; fromSocketId: string; fromName: string; fromAvatarUrl?: string | null };

// Ayni mesajdaki tepkileri emojiye gore gruplar - iki+ kisi AYNI emojiyi
// verdiyse tek kart icinde tek emoji gosterilsin diye (bkz. ReactionChip).
// Ilk gorulme sirasi korunur (farkli emojiler farkli kart acar).
function groupReactionsByEmoji(reactions: Reaction[]): { emoji: string; reactors: Reaction[] }[] {
  const order: string[] = [];
  const byEmoji = new Map<string, Reaction[]>();
  for (const r of reactions) {
    if (!byEmoji.has(r.emoji)) {
      byEmoji.set(r.emoji, []);
      order.push(r.emoji);
    }
    byEmoji.get(r.emoji)!.push(r);
  }
  return order.map((emoji) => ({ emoji, reactors: byEmoji.get(emoji)! }));
}

const REACTION_AVATAR_CYCLE_MS = 1500;

/** Tek bir tepki karti - emoji + (2+ kisi ayni tepkiyi verdiyse) sirayla
 * geçiş animasyonuyla donen pp'ler. Karta dokununca ayni emojiyle tepki
 * verir/geri ceker (bkz. onReactWithEmoji). */
function ReactionChip({ emoji, reactors, onPress }: { emoji: string; reactors: Reaction[]; onPress: () => void }) {
  const [index, setIndex] = useState(0);
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (reactors.length < 2) return;
    const id = setInterval(() => {
      Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
        setIndex((i) => (i + 1) % reactors.length);
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
      });
    }, REACTION_AVATAR_CYCLE_MS);
    return () => clearInterval(id);
  }, [reactors.length, opacity]);

  const current = reactors[index % reactors.length] || reactors[0];

  return (
    <TouchableOpacity activeOpacity={0.7} onPress={onPress} style={styles.reactionChip}>
      <Animated.View style={{ opacity }}>
        <Avatar name={current.fromName} avatarUrl={current.fromAvatarUrl} size={24} />
      </Animated.View>
      <Text style={styles.reactionBadgeEmoji}>{emoji}</Text>
    </TouchableOpacity>
  );
}

/** Sohbetteki avatarin ustune, katilimcilar panelindekiyle AYNI konumda
 * (lider = tac, ustte / moderator = kalkan, sag altta) rozet ekler - bkz.
 * ParticipantsModal.tsx hostBadge/moderatorBadge. */
function ChatAvatar({ name, avatarUrl, isFriend, isHost, isModerator }: { name: string; avatarUrl?: string | null; isFriend: boolean; isHost: boolean; isModerator: boolean }) {
  return (
    <View style={styles.chatAvatarWrap}>
      <Avatar name={name} avatarUrl={avatarUrl} size={32} isFriend={isFriend} />
      {isHost && (
        <View style={styles.chatHostBadge}>
          <CrownBadge size={16} color={theme.accent} />
        </View>
      )}
      {isModerator && (
        <View style={styles.chatModeratorBadge}>
          <ModeratorBadge size={10} color="#fff" />
        </View>
      )}
    </View>
  );
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
function ChatBubbleRow({ item, isOwn, groupedWithPrev, onReply, onDoubleTap, onLongPressMessage, isFriend, senderIsHost, senderIsModerator, onReactWithEmoji }: ChatBubbleRowProps) {
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

  // Ayni emojiyi veren herkes TEK bir kartta toplanir (bkz.
  // groupReactionsByEmoji) - farkli emoji farkli kart acar.
  const reactionGroups = item.reactions && item.reactions.length > 0 ? groupReactionsByEmoji(item.reactions) : [];
  const reactionBadges = reactionGroups.length > 0 && (
    <View style={styles.reactionBadgeRow}>
      {reactionGroups.map((g) => (
        <ReactionChip key={g.emoji} emoji={g.emoji} reactors={g.reactors} onPress={() => onReactWithEmoji(g.emoji)} />
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
              <TouchableOpacity activeOpacity={1} onPress={handleTap} onLongPress={onLongPressMessage}>
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
          {!groupedWithPrev && (
            <ChatAvatar name={item.from || "?"} avatarUrl={item.fromAvatarUrl} isFriend={isFriend} isHost={senderIsHost} isModerator={senderIsModerator} />
          )}
        </>
      ) : (
        <>
          {!groupedWithPrev ? (
            <ChatAvatar name={item.from || "?"} avatarUrl={item.fromAvatarUrl} isFriend={isFriend} isHost={senderIsHost} isModerator={senderIsModerator} />
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
              <TouchableOpacity activeOpacity={1} onPress={handleTap} onLongPress={onLongPressMessage}>
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

// "settings" bildiri kartindaki buyuk ikonu, server'in gonderdigi ham
// settingKey/settingRawValue'ya gore secer (bkz. RoomQuickCards.tsx
// PRIVACY_OPTIONS/PLAYBACK_INFO - ayni eslemeler, ikisi de tek yerde).
function settingsCardIcon(item: ChatMessage): IconName {
  if (item.settingKey === "privacy") {
    return PRIVACY_OPTIONS.find((o) => o.key === item.settingRawValue)?.icon || "globe";
  }
  if (item.settingKey === "playbackMode") {
    return PLAYBACK_INFO[item.settingRawValue as keyof typeof PLAYBACK_INFO]?.icon || "crown";
  }
  return "settings";
}

// "nowPlaying" bildiri kartindaki buyuk ikonu ve aciklama metnini
// server'in gonderdigi nowPlayingReason'a gore secer.
const NOW_PLAYING_META: Record<NonNullable<ChatMessage["nowPlayingReason"]>, { icon: IconName; desc: (byName?: string) => string }> = {
  picked: { icon: "play", desc: (byName) => (byName ? `${byName} seçti` : "Seçildi") },
  previous: { icon: "play", desc: (byName) => (byName ? `${byName} önceki videoya döndü` : "Önceki videoya dönüldü") },
  vote: { icon: "check", desc: () => "Oylama sonucu" },
  queue: { icon: "play", desc: () => "Sıradaki video" },
  autoplay: { icon: "fastForward", desc: () => "Otomatik oynatılıyor" },
};

export default function RoomScreen({ initialRoom, onLeave, onOpenParticipant }: Props) {
  const socket = getSocket();
  const { width: windowWidth } = useWindowDimensions();
  const isDesktop = windowWidth >= DESKTOP_BREAKPOINT;
  const [room, setRoom] = useState<RoomState>(initialRoom);
  const roomRef = useRef(room);
  roomRef.current = room;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatFocused, setChatFocused] = useState(false);
  // Android'de geri tusu/dislari dokunarak klavyeyi kapatmak TextInput'un
  // "onBlur"unu HER ZAMAN tetiklemiyor (klavye kapanir ama React'e gore kutu
  // hala "odakli" kalabiliyor) - bu da gonder ikonunun kalici gorunmesine yol
  // aciyordu. Klavyenin GERCEKTEN kapandigini dogrudan dinleyip chatFocused'i
  // orada da sifirliyoruz, sadece onBlur'a guvenmiyoruz.
  useEffect(() => {
    const sub = Keyboard.addListener("keyboardDidHide", () => setChatFocused(false));
    return () => sub.remove();
  }, []);
  const [replyingTo, setReplyingTo] = useState<DMReply | null>(null);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [pendingImageUri, setPendingImageUri] = useState<string | null>(null);
  const [mapVisible, setMapVisible] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [participantsVisible, setParticipantsVisible] = useState(false);
  // Katilimcilar paneli (Modal, kendi ayri agacinda render edilir) ust barin
  // ALTINDAN baslasin diye - gercek yukseklik cihaza/masaustu-telefon
  // duzenine gore degistigi icin olculup burada tutuluyor.
  // Baslangic degeri 0 degil, tahmini bir yukseklik - onLayout olcumu
  // (Katilimcilar paneli acilmasi gibi cok erken bir anda) henuz
  // gelmemisse panel "top: 0" ile ust barin UZERINE binip, altta da
  // sinirlarin yanlis hesaplanmasina (bosluk) yol aciyordu.
  const [topBarHeight, setTopBarHeight] = useState(isDesktop ? 58 : 90);
  const [inviteFriendsVisible, setInviteFriendsVisible] = useState(false);
  // Discover'daki oda kartlarinda kullanilan mavi "arkadas halkasi" ile AYNI -
  // katilimcilar panelinde/sohbet avatarlarinda gercek arkadaslarimizi
  // ayirt edebilmek icin kendi arkadas listemizi (userId'ler) bir kere cekip
  // tutuyoruz (bkz. ParticipantsModal.tsx isFriend, Avatar.tsx).
  const [friendIds, setFriendIds] = useState<Set<string>>(new Set());
  // RoomQuickCards.tsx'teki "Arkadaslarini Davet Et" karti icin tam liste
  // (isim/avatar) gerekiyor, friendIds sadece id tutuyor.
  const [friends, setFriends] = useState<FriendUser[]>([]);
  // Hizli davet kartinda tik SADECE sunucu "room:invite" ack'inde basarili
  // dedikten sonra isaretlensin diye (bkz. RoomQuickCards.tsx sentIds).
  const [quickInviteSentIds, setQuickInviteSentIds] = useState<Set<string>>(new Set());
  const [leaveConfirmVisible, setLeaveConfirmVisible] = useState(false);
  const [settingsVisible, setSettingsVisible] = useState(false);
  // Video kontrol panelinin SAG USTUNDEKI cark (üst bardakinden AYRI) - bu
  // tercihlerin COGU (gizle/ayrintilar/kalite/altyazi) sadece BENIM kisisel
  // izleme tercihim, sunucuya gitmez, kimseyi etkilemez. TEK istisna
  // "oynatma hizi" - o oda genelinde ortak ve SADECE lider degistirebilir
  // (bkz. room.playback.playbackRate, VideoSettingsSheet.tsx).
  const [videoSettingsVisible, setVideoSettingsVisible] = useState(false);
  const [videoHidden, setVideoHidden] = useState(false);
  // "Videoyu gizle" artik bir siyah ortu DEGIL, video alaninin kendisini
  // YUKARI KAYDIRARAK (yuksekligini 0'a indirerek) yok etmesi - bkz.
  // videoCollapseAnim/videoNaturalHeight asagida, toggleHideVideo.
  const videoCollapseAnim = useRef(new Animated.Value(1)).current;
  // Baslangic degeri artik null degil, genislikten hesaplanmis 16:9 bir
  // tahmin - bazi cihazlarda mediaSection'in ilk onLayout olcumu hic
  // gelmiyor/cok gecikiyordu, bu da video alaninin GORUNMEZ (yukseklik 0)
  // kalmasina yol aciyordu (kaynak secilsin ya da secilmesin, "Henuz bir
  // medya secilmedi" yazisi bile gorunmuyordu). Dogru olcum gelince zaten
  // bu tahmini gercek degerle gunceller (asagidaki onLayout).
  const estimatedVideoWidth = isDesktop ? Math.max(200, windowWidth - 380 - 48) : windowWidth;
  const [videoNaturalHeight, setVideoNaturalHeight] = useState<number | null>(
    Math.round((estimatedVideoWidth * 9) / 16)
  );
  const [videoQuality, setVideoQualityState] = useState("default");
  const [subtitlesEnabled, setSubtitlesEnabled] = useState(false);
  // Su an oynayan videonun GERCEKTEN altyazisi var mi - tercih (subtitlesEnabled)
  // DEGIL, videonun kendi durumu (bkz. MediaPlayer.tsx/YouTubePlayer.tsx
  // onCaptionsAvailabilityChange) - VideoSettingsSheet "Altyazılar" satirini
  // bu false'ken "Kullanılamıyor" gosterir.
  const [subtitlesAvailable, setSubtitlesAvailable] = useState(false);
  // Bu videoda GERCEKTEN birden fazla ses parcasi (dublaj) varsa dil
  // etiketleri - BELGELENMEMIS bir YouTube API'si denendigi icin (bkz.
  // YouTubePlayer.tsx setDubTrack) bos kalirsa Dublaj satiri "Kullanılamıyor"
  // gosterir, bu kullanicinin fark edecegi bir hata degildir.
  const [dubTracks, setDubTracks] = useState<string[]>([]);
  const [selectedDubIndex, setSelectedDubIndex] = useState(0);
  // SADECE hls/mp4'te gelir - su an oynayan video track'inin GERCEK
  // cozunurlugu (bkz. HlsPlayer.tsx onVideoResolutionChange). YouTube'da hep
  // null kalir, orada zaten kendi secilebilir kalite listesi var.
  const [videoResolution, setVideoResolution] = useState<{ width: number; height: number } | null>(null);
  // Sesli sohbetteki diger katilimcilarin sesi (LiveKit uzak ses parcalari).
  const [voiceVolume, setVoiceVolume] = useState(1);
  // Su an izlenen videonun/medyanin sesi - "external" kaynaklarda (DRM'li
  // platformlar) gercek bir oynaticimiz olmadigi icin etkisiz kalir.
  const [videoVolume, setVideoVolume] = useState(1);
  // Su an izlenen video "begenilmis" mi - sunucunun dondurdugu eventId,
  // begeniyi geri almak (room:unlike) icin saklaniyor. Oda kodu/video
  // degisince (asagidaki useEffect) sifirlanir - eski videonun begenisi
  // yeni videoya tasinmaz.
  const [likedEventId, setLikedEventId] = useState<string | null>(null);
  // Video tam ekran mi - sadece BU ekranda gorsel bir mod, oda sohbeti/
  // katilimci durumu etkilenmez, sadece video alani buyuyup chat gizlenir.
  const [fullscreenVideo, setFullscreenVideo] = useState(false);
  // Tam ekranda ekrana dokununca VideoControlsOverlay'in butonlariyla
  // NowPlayingBar'in AYNI ANDA acilip kapanmasi icin (bkz. VideoControlsOverlay
  // onVisibilityChange) - normal (tam ekran olmayan) modda kullanilmiyor,
  // orada NowPlayingBar zaten her zaman gorunur kaliyor.
  const [controlsVisible, setControlsVisible] = useState(false);
  // YouTube, HER videonun basinda (controls:0/iv_load_policy ayarlarindan
  // BAGIMSIZ, hicbir resmi parametreyle kapatilamayan) birkac saniyeligine
  // kendi kanal adi/logo/bilgi katmanini gosteriyor - bu "duraklatildi"
  // durumuyla ilgili degil, SADECE yeni bir video yuklenince baslayan bir
  // zaman penceresi. Rave'in de yaptigi gibi, bu pencere boyunca da kendi
  // kapak gorselimizi ustune cekiyoruz (bkz. asagidaki kapak View'i).
  const [introCoverActive, setIntroCoverActive] = useState(false);
  useEffect(() => {
    if (room.playback.source?.type !== "youtube") {
      setIntroCoverActive(false);
      return;
    }
    setIntroCoverActive(true);
    const timer = setTimeout(() => setIntroCoverActive(false), 5000);
    return () => clearTimeout(timer);
  }, [room.playback.source?.url, room.playback.source?.type]);
  // Ayarlar ekranindaki "Hizli Tepki" tercihi - bir mesaja CIFT TIKLAYINCA
  // gonderilecek emoji budur (bkz. ProfileScreen.tsx default_reaction_emoji).
  const [quickReactionEmoji, setQuickReactionEmoji] = useState("❤️");
  // Ayarlar ekranindaki "Yetiskin Icerigini Gizle" tercihim - "+18 icerik"
  // isaretli bir odada video KENDI ekranimda bulanik gorunsun mu, "Atla"
  // oyu verebileyim mi diye (bkz. asagidaki adultBlurActive). Gercek deger
  // Supabase'den gelene kadar GUVENLI VARSAYILAN "true" (gizli) - "false"
  // ile baslarsak, oda +18 isaretliyse ve gercek tercihim "gizli" olsa
  // bile veri yuklenene kadar video kisa bir an bulaniksiz goruntulenirdi.
  const [myHideAdultContent, setMyHideAdultContent] = useState(true);

  const playerRef = useRef<MediaPlayerHandle>(null);
  const reactionsRef = useRef<ReactionsOverlayHandle>(null);
  const voice = useVoiceChat();

  const me = room.participants.find((p) => p.socketId === socket.id);
  const isHost = me?.isHost ?? false;
  // Lider beni moderator yaptiysa - Odadan at/Mikrofonu Devre Disi Birak
  // yetkilerini kullanabilirim, ama SADECE baska bir moderator/lider
  // OLMAYAN birine karsi (bkz. ProfileOptionsSheet.tsx canModerateTarget,
  // server/src/rooms.ts canModerate). Liderligi ver/Moderator yap ise
  // moderatorlere HICBIR ZAMAN acik degil - SADECE gercek lider yapabilir
  // (bkz. rooms.ts transferHost/setModerator, bilerek canModerate
  // kullanmiyorlar). Sunucu tarafi KENDI kontrolunu ayrica yapar, bu
  // client-side hesap sadece dogru satirlari gosterip gizlemek icin.
  const isModerator = me?.isModerator ?? false;
  // Oynat/duraklat/sarma/ilerletme cubugu HER modda sadece lidere ozel -
  // video SECME yetkisi (openMediaPicker/selectSource'ta ayrica kontrol
  // edilir) modlara gore degisebilir ("vote"/"playOnly"), ama oynatmanin
  // KENDISI (transport) hep host'ta kalir.
  const canControlTransport = isHost;
  // "Sadece Oynat" modunda HERKES video ekleyebilir (siraya girer, bkz.
  // selectSource) - "vote" modunda da herkes oneri sunabilir (oylamaya girer).
  // Diger modlarda (leader/autoplay) secim hala sadece host'a ozel.
  const canPickMedia = isHost || room.playbackMode === "vote" || room.playbackMode === "playOnly";
  // "external" (Netflix/Disney+/Prime/HBO Max vb.) ARTIK syncable - gercek
  // oynaticisi var (bkz. DrmWebViewPlayer.tsx, uygulama ICI WebView'de
  // oynat/durdur/saniye yakalayip masaustu tarayici eklentimizle AYNI
  // "playback:update" protokolunu konusuyor).
  const syncable =
    room.playback.source?.type === "youtube" ||
    room.playback.source?.type === "hls" ||
    room.playback.source?.type === "mp4" ||
    room.playback.source?.type === "external";
  // NowPlayingBar.tsx'teki avatar icin - su anki video icin kalici bir "kim
  // sectiyi" bilgimiz olmadigindan (bkz. backlog), liderin kendisi kullanilir.
  const hostParticipant = room.participants.find((p) => p.isHost);
  // Oda "+18 icerik" isaretli VE ben kendi tercihimde "Yetiskin Icerigini
  // Gizle"yi actiysam - video SADECE BENIM ekranimda bulanik gorunur (bkz.
  // asagidaki BlurView). "Liderin Secimi" modunda "Atla" oyu islevsiz (sadece
  // lider video secebilir), o yuzden buton orada gosterilmiyor.
  const adultBlurActive = room.isAdult && myHideAdultContent;
  const canVoteSkipAdult = adultBlurActive && room.playbackMode !== "leader";
  // Discover karti/oda onizlemesiyle (RoomCard.tsx/RoomPreviewScreen.tsx)
  // AYNI kapak gorseli - canli videoyu bulanıklastirmak yerine (performansli
  // degil, hareket eden kareler bulanıklıkla bile sizabiliyor) sabit kapak
  // resmini bulanıklastiriyoruz.
  const adultCoverUrl = coverUrlForSource(room.playback.source);
  const [votedSkipAdult, setVotedSkipAdult] = useState(false);
  useEffect(() => {
    setVotedSkipAdult(false);
  }, [room.playback.source?.url]);
  function voteSkipAdult() {
    if (votedSkipAdult) return;
    socket.emit("room:voteSkipAdult", {}, (res: any) => {
      if (res?.ok) setVotedSkipAdult(true);
    });
  }

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const userId = data.user?.id;
      if (!userId) return;
      supabase
        .from("profiles")
        .select("default_reaction_emoji,hide_adult_content")
        .eq("id", userId)
        .maybeSingle()
        .then(({ data: profile }) => {
          if (profile?.default_reaction_emoji) setQuickReactionEmoji(profile.default_reaction_emoji);
          setMyHideAdultContent(profile?.hide_adult_content === true);
        });
    });
  }, []);

  useEffect(() => {
    socket.emit("friends:list", {}, (res: any) => {
      if (res?.ok) {
        setFriendIds(new Set(res.friends.map((f: { userId: string }) => f.userId)));
        setFriends(res.friends);
      }
    });
  }, []);

  useEffect(() => {
    function handleRoomState(state: RoomState) {
      console.log("[LUNA-DEBUG] room:state alindi", {
        positionSeconds: state.playback.positionSeconds,
        isPlaying: state.playback.isPlaying,
        updatedAtMs: state.playback.updatedAtMs,
      });
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
      reactions: { emoji: string; fromSocketId: string; fromName: string; fromAvatarUrl?: string | null }[];
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
      const elapsed = ((Date.now() - current.playback.updatedAtMs) / 1000) * current.playback.playbackRate;
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
      let actual: number | undefined;
      try {
        actual = await playerRef.current?.getCurrentTime();
      } catch (err) {
        console.log("[LUNA-DEBUG] kalp atisi: getCurrentTime REDDEDILDI (zaman asimi)", String(err));
        return;
      }
      console.log("[LUNA-DEBUG] kalp atisi: getCurrentTime sonucu", actual);
      if (actual !== undefined) {
        console.log("[LUNA-DEBUG] kalp atisi: sunucuya emit ediliyor", { positionSeconds: actual });
        socket.emit("playback:update", { positionSeconds: actual, isPlaying: true });
      } else {
        console.log("[LUNA-DEBUG] kalp atisi: olcum YOK (undefined), bu turu atliyor");
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
    const hostIsAuthoritative = isHost && room.playbackMode === "leader";
    if (!syncable || room.poll) {
      appliedSourceUrlRef.current = url;
      return;
    }
    if (!url) return;
    if (appliedSourceUrlRef.current !== url) {
      appliedSourceUrlRef.current = url;
      // Host "leader" modundaysa selectSource() ZATEN dogrudan loadVideo
      // cagirmisti - ama o cagri, kaynak null'dan ilk videoya (veya bir
      // turden BASKA bir ture, orn. YouTube'dan Netflix'e) gecerken MediaPlayer
      // henuz DOGRU alt oynaticiyi (YouTubePlayer/DrmWebViewPlayer/HlsPlayer)
      // monte etmemisken calisiyordu - playerRef o anda hala ESKI (ya da hic
      // mevcut olmayan) oynaticiyi gosterdigi icin cagri sessizce hicbir sey
      // yapmiyordu (video hic acilmiyordu). Burada URL degisince HER ZAMAN
      // (host dahil) tekrar yukluyoruz - ayni videoyu iki kez yuklemek
      // zararsiz/idempotent, ama kacirilan ilk yuklemeyi guvenilir sekilde
      // telafi ediyor.
      console.log("[LUNA-DEBUG] effect: URL DEGISTI, loadVideo cagriliyor", { url, hostIsAuthoritative, positionSeconds: room.playback.positionSeconds });
      playerRef.current?.loadVideo(url, hostIsAuthoritative ? 0 : room.playback.positionSeconds);
      if (!room.playback.isPlaying) playerRef.current?.pause();
      return;
    }
    // Ayni video, sadece oynat/duraklat durumu - host "leader" modundayken
    // kendi oynaticisi zaten otorite (bkz. yukaridaki yorum), burada AYRICA
    // play()/pause() cagirirsak henuz tamamlanmamis replaceAsync ile yarisip
    // "play() interrupted by pause()" hatasiyla videoyu kalici pause'da
    // birakir (goo.gl/LdLk22) - bu yuzden SADECE host degilken/leader
    // degilken senkronluyoruz.
    if (hostIsAuthoritative) {
      console.log("[LUNA-DEBUG] effect: ayni url, host otoriter, HICBIR SEY yapmiyor (dogru davranis)");
      return;
    }
    console.log("[LUNA-DEBUG] effect: ayni url, misafir/senkron modu - play/pause uyguluyor", { isPlaying: room.playback.isPlaying });
    if (room.playback.isPlaying && !room.buffering.anyoneBuffering) playerRef.current?.play();
    else playerRef.current?.pause();
  }, [room.playback.source?.url, room.playback.isPlaying, room.buffering.anyoneBuffering, room.playbackMode, isHost, room.poll, syncable]);

  const handleHostPlayerChange = useCallback(
    (playing: boolean, currentTime: number) => {
      if (!canControlTransport) return;
      console.log("[LUNA-DEBUG] handleHostPlayerChange (oynaticidan geldi) -> sunucuya emit", { playing, currentTime });
      socket.emit("playback:update", { isPlaying: playing, positionSeconds: currentTime });
    },
    [canControlTransport]
  );

  const handleBuffering = useCallback((isBuffering: boolean) => {
    socket.emit("playback:buffering", { isBuffering });
  }, []);

  // SADECE "external" (DRM) kaynaklarda, SADECE host icin: uygulama ICI
  // WebView'de (bkz. DrmWebViewPlayer.tsx) baska bir basliga/sayfaya
  // gecilince yeni URL'i sunucuya "source" olarak bildiriyoruz - boylece
  // takipcilerin WebView'i de (syncable oldugu icin yukaridaki
  // appliedSourceUrlRef efekti otomatik loadVideo cagirir) ayni sayfaya
  // gider. Takipcinin KENDI WebView'inde dolasmasi ise odanin kaynagini
  // DEGISTIRMEMELI - bu yuzden isHost disinda hic bir sey yapmiyoruz.
  const handleDrmUrlChange = useCallback(
    (url: string) => {
      if (!isHost || !room.playback.source) return;
      socket.emit("playback:update", {
        source: { type: "external", url, label: room.playback.source.label },
        isPlaying: false,
        positionSeconds: 0,
      });
    },
    [isHost, room.playback.source]
  );

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
    if (room.playbackMode === "playOnly") {
      // Herkes ekleyebilir ama mevcut oynayani kesmez, siraya girer (bkz.
      // server/src/rooms.ts enqueueSource). Sunucudan room:state ile donen
      // yeni/degismeyen kaynagi yukardaki useEffect (satir ~344) zaten
      // yukleyip oynatacak - burada AYRICA loadVideo cagirmiyoruz.
      socket.emit("room:enqueueSource", { source }, () => {});
      return;
    }
    // "external" icin isPlaying hala false - platform az once secildi, henuz
    // kimse bir basliga girip oynatmadi (bkz. DrmWebViewPlayer.tsx), ama
    // loadVideo ARTIK onun icin de cagriliyor (WebView'i platformun
    // sayfasina yonlendirir).
    socket.emit("playback:update", { source, isPlaying: source.type !== "external", positionSeconds: 0 });
    console.log("[LUNA-DEBUG] selectSource: DOGRUDAN loadVideo cagriliyor", { url: source.url });
    playerRef.current?.loadVideo(source.url, 0);
  }

  // Video dogal olarak bitince: "vote" modunda sunucu 10 saniyelik bir oylama
  // penceresi acar (asagidaki poll useEffect'i herkeste secim ekranini
  // otomatik acar); "playOnly" modunda sunucu kuyruktaki bir sonraki videoyu
  // otomatik oynatir (bkz. server/src/index.ts playback:ended, rooms.ts
  // advanceQueue); "autoplay" modunda (sadece YouTube kaynaklarda) sunucu
  // YouTube'un GERCEK ilgili video onerisine otomatik gecer (bkz.
  // youtubeRelated.ts) - hepsinde SADECE host'un oynaticisi tetikler.
  const handleEnded = useCallback(() => {
    if (!isHost) return;
    if (room.playbackMode === "vote") {
      if (room.poll) return;
      socket.emit("playback:ended");
    } else if (room.playbackMode === "playOnly" || room.playbackMode === "autoplay") {
      socket.emit("playback:ended");
    }
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
    if (!canPickMedia) {
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
    console.log("[LUNA-DEBUG] togglePlayPause basildi", { suankiIsPlaying: room.playback.isPlaying });
    if (room.playback.isPlaying) playerRef.current?.pause();
    else playerRef.current?.play();
  }

  function seekTo(seconds: number) {
    console.log("[LUNA-DEBUG] seekTo() cagrildi", { seconds, canControlTransport });
    if (!canControlTransport) return;
    const next = Math.max(0, seconds);
    console.log("[LUNA-DEBUG] seekTo(): playerRef.seekTo + sunucuya emit ediliyor", { next });
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
      const elapsed = ((Date.now() - room.playback.updatedAtMs) / 1000) * room.playback.playbackRate;
      setDisplayPosition(room.playback.positionSeconds + elapsed);
    }
    tick();
    const timer = setInterval(tick, 500);
    return () => clearInterval(timer);
  }, [room.playback.positionSeconds, room.playback.isPlaying, room.playback.updatedAtMs, room.playback.playbackRate]);

  // Tam ekrana girince telefon SAGA da SOLA da (hangisine cevrilirse) yatay
  // kalsin diye LANDSCAPE (tek bir yon degil) kilitliyoruz - cikinca dikeye
  // geri donuyor. Web'de (ve orientation API'si olmayan cihazlarda) sessizce
  // no-op gecer, catch ile yutulur - ekran zaten CSS ile yatay gibi davranacak.
  function toggleFullscreenVideo() {
    setFullscreenVideo((v) => {
      const next = !v;
      if (next) ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => {});
      else ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
      return next;
    });
  }

  // Oda ekranindan tam ekran acikken ayrilirsa (geri tusu, sohbetten cikis
  // vb.) telefon yatay kilitli kalmasin diye unmount'ta guvenlik agi.
  useEffect(() => {
    return () => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    };
  }, []);

  // Video Ayarlari sayfasindaki ("sağ üstteki çark") kisisel tercihler -
  // "videoyu gizle" yeni video gelince otomatik tekrar GOSTERILIR (yeni
  // videoyu kacirmayalim diye), kalite/altyazi tercihi KORUNUR ve yeni
  // oynatici orneginde (YouTube yeniden yuklenince, HLS replaceAsync
  // sonrasi) YENIDEN uygulanir - aksi halde her video degisiminde sifirlanirdi.
  useEffect(() => {
    setVideoHidden(false);
    // Yeni video - eskisinin altyazi/dublaj durumu gecerli degil, oynatici
    // kendi videosu icin GERCEK durumu tekrar bildirene kadar "yok" varsay.
    setSubtitlesAvailable(false);
    setDubTracks([]);
    setSelectedDubIndex(0);
    setVideoResolution(null);
  }, [room.playback.source?.url]);
  useEffect(() => {
    if (videoQuality !== "default") playerRef.current?.setQuality(videoQuality);
    if (subtitlesEnabled) playerRef.current?.setSubtitlesEnabled(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.playback.source?.url]);

  // Oynatma hizi herkesin ekraninda AYNI olmali (kalite/altyazinin aksine) -
  // sunucudan gelen room.playback.playbackRate degistikce (lider degistirince
  // YA DA yeni bir video "normal" hizla basladiginda) HERKESIN oynaticisina
  // uygulanir, kisisel bir state TUTULMAZ.
  useEffect(() => {
    playerRef.current?.setPlaybackRate(room.playback.playbackRate);
  }, [room.playback.playbackRate, room.playback.source?.url]);

  // Hem dokunmatik butondan (Video Ayarlari) hem suruklemeden (asagidaki
  // iki PanResponder) ayni sekilde cagrilir - "next" yonune yumusak bir
  // sprinde "yapis"tirir (suruklerken parmagin biraktigi ARA deger neyse
  // oradan baslar, aniden siframadan tamamlar).
  function finishVideoDrag(hide: boolean) {
    setVideoHidden(hide);
    Animated.spring(videoCollapseAnim, { toValue: hide ? 0 : 1, useNativeDriver: false, bounciness: 4 }).start();
  }
  function toggleHideVideo() {
    finishVideoDrag(!videoHidden);
  }

  // PanResponder.create() SADECE ilk render'da calisir (useRef ile sabit
  // tutuluyor) - icindeki callback'ler videoHidden/videoNaturalHeight'in o
  // ANKI (hep ilk/stale) degerini "kapatir". Guncel degeri HER ZAMAN
  // gorebilmek icin (HlsPlayer.tsx'teki callbacksRef ile AYNI teknik) ref
  // uzerinden okuyoruz.
  const videoHiddenRef = useRef(videoHidden);
  videoHiddenRef.current = videoHidden;
  const videoNaturalHeightRef = useRef(videoNaturalHeight);
  videoNaturalHeightRef.current = videoNaturalHeight;

  // Video ACIKKEN, video alaninin KENDISINI yukari suruklemek onu kapatir -
  // cok az (<8px) ya da yatay agirlikli hareketler normal TIKLAMA olarak
  // (VideoControlsOverlay'in kontrollerini ac/kapa) gecsin diye sadece
  // belirgin, DIKEY agirlikli bir suruklemede devreye giriyor.
  const hideVideoPanResponder = useRef(
    PanResponder.create({
      // CAPTURE fazinda (cocuklardan ONCE) sorulur - video uzerindeki
      // VideoControlsOverlay'in kendi TouchableOpacity'si aksi halde normal
      // (capture olmayan) surumde dokunusu hemen kendine alip bu PanResponder'in
      // hic devreye girmesine izin vermiyordu.
      onMoveShouldSetPanResponderCapture: (_evt, g) =>
        !videoHiddenRef.current && Math.abs(g.dy) > 8 && Math.abs(g.dy) > Math.abs(g.dx) * 1.5,
      onPanResponderMove: (_evt, g) => {
        const h = videoNaturalHeightRef.current;
        if (!h) return;
        const upward = Math.min(0, g.dy); // asagi suruklemeyi yoksay, sadece yukari
        videoCollapseAnim.setValue(Math.max(0, Math.min(1, 1 + upward / h)));
      },
      onPanResponderRelease: (_evt, g) => {
        const h = videoNaturalHeightRef.current;
        if (!h) return;
        const passedThreshold = -g.dy > h * 0.25 || g.vy < -0.6;
        finishVideoDrag(passedThreshold);
      },
      onPanResponderTerminate: () => finishVideoDrag(videoHiddenRef.current),
    })
  ).current;

  // Video GIZLIYKEN, onun eski yerinde kalan kucuk "centik"i asagi
  // suruklemek videoyu geri acar - ayna mantik, ters yonde.
  const showVideoPanResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_evt, g) =>
        videoHiddenRef.current && Math.abs(g.dy) > 8 && Math.abs(g.dy) > Math.abs(g.dx) * 1.5,
      onPanResponderMove: (_evt, g) => {
        const h = videoNaturalHeightRef.current;
        if (!h) return;
        const downward = Math.max(0, g.dy); // yukari suruklemeyi yoksay, sadece asagi
        videoCollapseAnim.setValue(Math.max(0, Math.min(1, downward / h)));
      },
      onPanResponderRelease: (_evt, g) => {
        const h = videoNaturalHeightRef.current;
        if (!h) return;
        const passedThreshold = g.dy > h * 0.25 || g.vy > 0.6;
        finishVideoDrag(!passedThreshold);
      },
      onPanResponderTerminate: () => finishVideoDrag(videoHiddenRef.current),
    })
  ).current;
  function changePlaybackRate(rate: number) {
    if (!isHost) return;
    socket.emit("playback:setRate", { rate }, () => {});
  }
  function changeVideoQuality(quality: string) {
    setVideoQualityState(quality);
    playerRef.current?.setQuality(quality);
  }
  function toggleSubtitles() {
    setSubtitlesEnabled((v) => {
      const next = !v;
      playerRef.current?.setSubtitlesEnabled(next);
      return next;
    });
  }
  function changeDubTrack(index: number) {
    setSelectedDubIndex(index);
    playerRef.current?.setDubTrack(index);
  }

  // "Sıradakine gec" / "Onceki video" - "Liderin Secimi" modunda SADECE
  // lidere ozel (dogrudan, oylamasiz), DIGER butun modlarda (vote/sadece
  // oynat/otomatik oynat) artik HERKESE acik bir COGUNLUK OYU: kim hangi
  // yone basarsa o yone 1 oy ekler (zit yone verilmis onceki oyu iptal
  // eder), katilimcilarin yarisindan FAZLASI ayni yonde birikince sunucu
  // gercekten o eylemi uygular (bkz. server/src/rooms.ts voteSkipToNext/
  // voteGoToPrevious, index.ts "room:voteSkipNext"/"room:voteGoToPrevious").
  // Video degisince kendi oyum sifirlaniyor (yeni video icin yeniden
  // oylanabilsin diye). Butonlar ARTIK HER MODDA HERKESE GORUNUR -
  // "Liderin Secimi" modunda lider DISINDAKILER icin sadece soluk/
  // dokunulamaz kalir (gorunmez OLMAZ, bkz. VideoControlsOverlay canSkip).
  const canSkip = room.playbackMode !== "leader" || isHost;
  const [skipVoteDirection, setSkipVoteDirection] = useState<"next" | "previous" | null>(null);
  useEffect(() => {
    setSkipVoteDirection(null);
  }, [room.playback.source?.url]);

  function skipToNext() {
    if (room.playbackMode === "leader") {
      if (!isHost) return;
      openMediaPicker();
      return;
    }
    if (skipVoteDirection === "next") return; // zaten bu yone oy verdim
    socket.emit("room:voteSkipNext", {}, (res: any) => {
      if (res?.ok) setSkipVoteDirection("next");
    });
  }

  function goToPreviousVideo() {
    if (room.playbackMode === "leader") {
      if (!isHost || !room.hasPreviousVideo) return;
      socket.emit("room:previousVideo", {}, () => {});
      return;
    }
    if (!room.hasPreviousVideo || skipVoteDirection === "previous") return;
    socket.emit("room:voteGoToPrevious", {}, (res: any) => {
      if (res?.ok) setSkipVoteDirection("previous");
    });
  }

  // Davet et ekraninda (FriendsScreen inviteMode) isaretlenip "Davet At"a
  // basilan arkadaslara, zaten var olan ama eskiden hic client'tan
  // cagrilmayan "room:invite" uc noktasiyla tek tek davet gonderir.
  function sendRoomInvites(userIds: string[]) {
    if (userIds.length === 0) return;
    let remaining = userIds.length;
    let failed = 0;
    userIds.forEach((toUserId) => {
      socket.emit("room:invite", { toUserId }, (res: any) => {
        if (!res?.ok) failed++;
        remaining--;
        if (remaining === 0) {
          setInviteFriendsVisible(false);
          showAlert(
            failed === 0 ? "Davet gönderildi" : "Bazıları gönderilemedi",
            failed === 0
              ? `${userIds.length} kişiye davet gönderildi.`
              : `${userIds.length - failed}/${userIds.length} kişiye davet gönderildi.`
          );
        }
      });
    });
  }

  // RoomQuickCards.tsx "Arkadaslarini Davet Et" - tek dokunusla, sessizce
  // (buyuk "Davet At" alert'i olmadan) gonderir, tik SADECE basarili ack'te
  // isaretlenir (bkz. quickInviteSentIds).
  function quickInviteFriend(userId: string) {
    socket.emit("room:invite", { toUserId: userId }, (res: any) => {
      if (res?.ok) setQuickInviteSentIds((prev) => new Set(prev).add(userId));
      else showAlert("Gönderilemedi", "Davet gönderilemedi.");
    });
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

  // Ayarlar panelindeki kisisel "Yetiskin Icerigini Gizle" kisayolu -
  // ProfileScreen.tsx'teki ile AYNI tercih, sadece buradan (odadan
  // cikmadan) da degistirilebilsin diye - yerel state'i hemen guncelleyip
  // video blurunu (adultBlurActive) aninda yansitir, sunucuya/Supabase'e
  // kaydetmeyi ise profile:hideAdultContent zaten yapiyor.
  function toggleMyHideAdultContent(enabled: boolean) {
    setMyHideAdultContent(enabled);
    socket.emit("profile:hideAdultContent", { enabled }, () => {});
  }

  function handleVoiceVolumeChange(v: number) {
    setVoiceVolume(v);
    voice.setRemoteVolume(v);
  }

  function handleVideoVolumeChange(v: number) {
    setVideoVolume(v);
    playerRef.current?.setVolume(v);
  }

  // Yeni bir video yuklendiginde oynatici kendi varsayilan sesiyle (tam ses)
  // basliyor - kullanicinin secmis oldugu video sesini HER yeni kaynakta
  // tekrar uyguluyoruz.
  useEffect(() => {
    playerRef.current?.setVolume(videoVolume);
  }, [room.playback.source?.url]);

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
    socket.emit("chat:send", { text: chatInput, replyTo: replyingTo }, (res: any) => {
      if (res && !res.ok) showAlert("Gönderilemedi", res.error || "Mesaj gönderilemedi.");
    });
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

  // Bir tepki kartina DOKUNUNCA o KARTIN emojisiyle tepki verir - zaten o
  // emojiyle tepki vermissek sunucu geri ceker (bkz. ReactionChip,
  // server/src/index.ts message:react - ayni emoji = toggle).
  function reactToMessageWithEmoji(item: ChatMessage, emoji: string) {
    if (!item.id) return;
    socket.emit("message:react", { messageId: item.id, emoji });
  }

  // Mesaja BASILI TUTUNCA acilan kart (Rave'deki gibi) - bkz.
  // MessageOptionsSheet.tsx / ChatBubbleRow onLongPressMessage.
  const [optionsMessage, setOptionsMessage] = useState<ChatMessage | null>(null);

  function openMessageOptions(item: ChatMessage) {
    setOptionsMessage(item);
  }
  function closeMessageOptions() {
    setOptionsMessage(null);
  }
  async function copyOptionsMessage() {
    if (optionsMessage) await Clipboard.setStringAsync(optionsMessage.text);
    closeMessageOptions();
  }
  function replyToOptionsMessage() {
    if (optionsMessage) startReply(optionsMessage);
    closeMessageOptions();
  }
  function reportOptionsMessage() {
    if (optionsMessage?.id) {
      socket.emit("message:report", { messageId: optionsMessage.id }, (res: any) => {
        if (res?.ok) showAlert("Bildirildi", "Bu mesaj moderasyon ekibine iletildi, teşekkürler.");
      });
    }
    closeMessageOptions();
  }
  // Uzun basma karti herhangi bir emojiyle tepki vermeyi destekler - cift
  // tikin aksine (reactToMessage, sadece sabit hizli tepki emojisi) burada
  // tam emoji klavyesinden SECILEN emoji dogrudan gonderiliyor.
  function reactToOptionsMessageWithEmoji(emoji: string) {
    if (optionsMessage?.id) socket.emit("message:react", { messageId: optionsMessage.id, emoji });
    closeMessageOptions();
  }

  function kick(targetSocketId: string) {
    socket.emit("host:kick", { targetSocketId }, () => {});
  }

  function makeLeader(targetSocketId: string) {
    socket.emit("host:transfer", { targetSocketId }, () => {});
  }

  function muteParticipant(targetSocketId: string, muted: boolean) {
    socket.emit("room:muteParticipant", { targetSocketId, muted }, () => {});
  }

  // Katilimci secenek paneli (bkz. ProfileOptionsSheet.tsx) - Rave'deki gibi
  // bir katilimciya BASILI TUTUNCA acilir (bkz. ParticipantsModal.tsx
  // onLongPressParticipant).
  const [profileOptionsTarget, setProfileOptionsTarget] = useState<ProfileOptionsTarget | null>(null);
  // Sadece BENIM icin kisilmis katilimcilarin socketId'leri (bkz.
  // useVoiceChat.ts setParticipantVolume) - oda geneline etki etmez, bu
  // yuzden sunucuya hic bildirilmiyor.
  const [locallyMutedIds, setLocallyMutedIds] = useState<Set<string>>(new Set());

  function openProfileOptions(p: Participant) {
    setProfileOptionsTarget({
      userId: p.userId,
      socketId: p.socketId,
      name: p.name,
      handle: p.handle,
      avatarUrl: p.avatarUrl,
      isHost: p.isHost,
      isModerator: p.isModerator,
      // Ilk anlik tahmin (arkadas listesinden, SENKRON) - "outgoing"/
      // "blocked" durumunu bilemeyiz, onun icin asagida sunucuya soruyoruz;
      // cevap gelince ayni p.socketId'li hedefse guncelliyoruz (kart kapanip
      // baskasi acilmissa UYGULANMAZ).
      friendStatus: p.userId && friendIds.has(p.userId) ? "friends" : undefined,
      micDisabled: p.muted,
      chatBanned: p.chatBanned,
      locallyMuted: locallyMutedIds.has(p.socketId),
    });
    if (p.userId) {
      socket.emit("friend:status", { withUserId: p.userId }, (res: any) => {
        if (!res?.ok) return;
        setProfileOptionsTarget((prev) => (prev && prev.socketId === p.socketId ? { ...prev, friendStatus: res.status } : prev));
      });
    }
  }
  function closeProfileOptions() {
    setProfileOptionsTarget(null);
  }
  function openParticipantProfile(target: ProfileOptionsTarget) {
    if (!target.userId) return;
    onOpenParticipant({ userId: target.userId, name: target.name, handle: target.handle ?? undefined });
  }
  function toggleLocalMute(target: ProfileOptionsTarget) {
    if (!target.socketId) return;
    const next = !locallyMutedIds.has(target.socketId);
    setLocallyMutedIds((prev) => {
      const nextSet = new Set(prev);
      if (next) nextSet.add(target.socketId!);
      else nextSet.delete(target.socketId!);
      return nextSet;
    });
    voice.setParticipantVolume(target.socketId, next ? 0 : 1);
  }
  function sendFriendRequestFromProfile(target: ProfileOptionsTarget) {
    if (!target.userId) return;
    socket.emit("friend:request", { toUserId: target.userId }, (res: any) => {
      if (res?.ok) showAlert("İstek gönderildi", `${target.name} kullanıcısına arkadaşlık isteği gönderildi.`);
    });
  }
  function cancelFriendRequestFromProfile(target: ProfileOptionsTarget) {
    if (!target.userId) return;
    socket.emit("friend:cancel", { toUserId: target.userId }, () => {});
  }
  function removeFriendFromProfile(target: ProfileOptionsTarget) {
    if (!target.userId) return;
    socket.emit("friend:remove", { userId: target.userId }, (res: any) => {
      if (res?.ok) setFriendIds((prev) => {
        const next = new Set(prev);
        next.delete(target.userId!);
        return next;
      });
    });
  }
  // Moderatorluk ver/geri al - sunucu KENDI yetki kontrolunu de yapiyor
  // (bkz. server/src/rooms.ts canModerate/setModerator, en fazla
  // MAX_MODERATORS=2 kisi ayni anda moderator olabilir), ack basarisizsa
  // (orn. kontenjan dolu) kullaniciya nedenini soyluyoruz.
  function makeModerator(target: ProfileOptionsTarget) {
    if (!target.socketId) return;
    socket.emit("host:setModerator", { targetSocketId: target.socketId, value: true }, (res: any) => {
      if (!res?.ok) showAlert("Olmadı", "En fazla 2 kişi aynı anda moderatör olabilir.");
    });
  }
  function removeModerator(target: ProfileOptionsTarget) {
    if (!target.socketId) return;
    socket.emit("host:setModerator", { targetSocketId: target.socketId, value: false }, () => {});
  }
  function enableMicFromProfile(target: ProfileOptionsTarget) {
    if (!target.socketId) return;
    muteParticipant(target.socketId, false);
  }
  // "Chati Kapat/Ac" - sadece ses degil, SOHBETE YAZMAYI kapatir (bkz.
  // server/src/index.ts "chat:send" - chatBanned olan bir mesaj hic
  // yayinlanmaz). kick/mute ile AYNI yetki kurali (canModerateTarget).
  function disableChatFromProfile(target: ProfileOptionsTarget) {
    if (!target.socketId) return;
    socket.emit("room:setChatBanned", { targetSocketId: target.socketId, banned: true }, () => {});
  }
  function enableChatFromProfile(target: ProfileOptionsTarget) {
    if (!target.socketId) return;
    socket.emit("room:setChatBanned", { targetSocketId: target.socketId, banned: false }, () => {});
  }
  function blockFromProfile(target: ProfileOptionsTarget) {
    if (!target.userId) return;
    socket.emit("friend:block", { userId: target.userId }, (res: any) => {
      if (res?.ok) showAlert("Engellendi", `${target.name} engellendi.`);
    });
  }
  function unblockFromProfile(target: ProfileOptionsTarget) {
    if (!target.userId) return;
    socket.emit("friend:unblock", { userId: target.userId }, () => {});
  }
  function reportParticipant(target: ProfileOptionsTarget) {
    if (!target.userId) return;
    socket.emit(
      "report:submit",
      { targetUserId: target.userId, reason: "Katılımcı kartından bildirildi" },
      (res: any) => {
        if (res?.ok) showAlert("Bildirildi", "Bu kullanıcı moderasyon ekibine iletildi, teşekkürler.");
      }
    );
  }

  function leave() {
    socket.emit("room:leave");
    voice.leave();
    onLeave();
  }

  // Ayri bir ayar YOK - "Ses" zaten var olan host'un kendi mikrofon
  // durumudur: host mikrofonunu acarsa (Ses: Acik) HERKES mikrofon acabilir,
  // host kapatirsa/sesli sohbetten ayrilirsa (Ses: Kapali) SADECE host
  // acabilir (bkz. useVoiceChat.ts join'in startMuted parametresi,
  // livekit.ts canPublish). Mikrofonu KAPATMAK her zaman serbest, sadece
  // ACMAK kisitlanir. AYRICA host beni Katilimcilar panelinden ozel olarak
  // susturmus olabilir (me?.muted) - bu, oda geneli acik olsa bile gecerli.
  const canOpenMic = isHost || (room.micOpenToAll && !me?.muted);
  function handleMicPress() {
    if (!voice.connected) {
      voice.join(!canOpenMic);
      return;
    }
    if (voice.muted && !canOpenMic) {
      showAlert(
        "Mikrofon kilitli",
        me?.muted ? "Lider seni susturdu." : "Bu odada sadece lider mikrofonunu acabilir."
      );
      return;
    }
    voice.toggleMute();
  }

  // Host'un mikrofonu su an acik mi (baglanmis VE susturulmamis) - bu deger
  // degistikce sunucuya bildiriyoruz, sunucu da odanin mikrofon politikasini
  // (room.micOpenToAll) buna gore gunceller (bkz. server/src/index.ts
  // "voice:hostMicOpen"). Host degilsek hicbir sey yapmiyoruz.
  useEffect(() => {
    if (!isHost) return;
    socket.emit("voice:hostMicOpen", { open: voice.connected && !voice.muted });
  }, [isHost, voice.connected, voice.muted]);

  // Lider sesli sohbeti kilitlerse (micOpenToAll false olursa) ZATEN
  // baglanmis ve mikrofonu acik olan misafirleri otomatik susturuyoruz -
  // sunucu LiveKit'teki CANLI iznini de ayni anda kapatiyor (bkz.
  // server/src/index.ts "voice:hostMicOpen" syncVoicePermissions), burasi
  // sadece yerel UI/mikrofon durumunu ayni anda dogru gostermek icin.
  useEffect(() => {
    if (canOpenMic || !voice.connected || voice.muted) return;
    voice.toggleMute();
  }, [canOpenMic, voice.connected, voice.muted, voice.toggleMute]);

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
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      {/* Ust bar (Rave'deki X / ayarlar / logo / ara / katilimci duzeni) - medya
          alaninin uzerine binmez, kendi satirinda durur, video tam altinda baslar.
          Tam ekran yatay modda TAMAMEN gizlenir - video butun ekrani kaplar,
          geri cikis NowPlayingBar'daki tam ekran ikonundan olur. */}
      {!fullscreenVideo && (
      <View
        style={[styles.topBar, isDesktop && styles.topBarDesktop]}
        onLayout={(e) => setTopBarHeight(e.nativeEvent.layout.height)}
      >
        <TouchableOpacity style={styles.iconTouch} onPress={() => setLeaveConfirmVisible(true)} hitSlop={8}>
          <Icon name="close" size={30} color={theme.text} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.iconTouch} onPress={() => setSettingsVisible(true)} hitSlop={8}>
          <Icon name="settings" size={30} color={theme.text} />
        </TouchableOpacity>
        <Image source={require("../../assets/lavin-icon-mark.png")} style={styles.logo} resizeMode="contain" />
        <TouchableOpacity style={[styles.iconTouch, !canPickMedia && styles.topIconDim]} onPress={openMediaPicker} hitSlop={8}>
          <Icon name="search" size={30} color={theme.text} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.participantsBadge} onPress={() => setParticipantsVisible(true)} hitSlop={8}>
          <Icon name="people" size={30} color={theme.text} />
          <View style={styles.countBubble}>
            <Text style={styles.countText}>{room.participants.length}</Text>
          </View>
        </TouchableOpacity>
      </View>
      )}

      {/* PC'de (DESKTOP_BREAKPOINT ustu genislik) video solda buyuk, sohbet
          saginda sabit genislikte DAIMA ACIK bir panel olarak yan yana durur -
          telefon genisliginde ayni JSX tek sutun halinde ustte video, altinda
          sohbet olarak akar (roomBody/videoCol/chatCol sadece DESKTOP'ta
          ekstra stil alir, mobilde gorunum ESKISI GIBI kalir). */}
      <View style={[styles.roomBody, isDesktop && styles.roomBodyDesktop]}>
        <View style={[isDesktop && styles.videoColDesktop, fullscreenVideo && styles.videoColFullscreen]}>
          {/* Medya alani - ust barin hemen altinda, ustune binmeden. Tam ekran
              yatay modda flex:1 ile TUM ekrani kaplar (bkz. mediaSectionFullscreen).
              "Videoyu gizle" bu Animated.View'in yuksekligini 0'a indirip
              alttaki icerigin (NowPlayingBar/sohbet) YUKARI KAYMASINI saglar -
              video siyah bir ortuyle KAPATILMIYOR, alani KENDISI yok oluyor. */}
          <Animated.View
            style={
              // Tam ekran yatay modda bu View'in flex:1 ALMASI sart - aksi
              // halde (stil "undefined" kalirsa) kendi icerigine (videonun
              // DOGAL 16:9 yuksekligine) gore kuculuyor, bu da onu saran
              // videoColFullscreen'in (justifyContent:"center") onu dikeyde
              // ORTALAMASINA ve ekrandan TASIP ust/alt kontrollerin
              // YARIM gorunmesine yol aciyordu.
              // Normal (gizli olmayan) durumda bu View'e KASITLI OLARAK
              // hicbir yukseklik/overflow stili VERMIYORUZ - eskiden
              // "videoHidden" false olsa bile interpolate()'in sonucu
              // (videoCollapseAnim tam olarak 1.0'a OTURMAMISSA, orn. spring
              // animasyonu cok ufak bir fark ile "bitmis" sayilsa) mediaSection'i
              // KENDI gercek boyutundan BIRAZ daha kucuk kirpabiliyordu - bu da
              // hem videonun alt kenarinin kesilmesine HEM DE dokunma algilama
              // alaninin (VideoControlsOverlay touchArea) o kirpilan kismi hic
              // gormesine yol aciyordu (normal ekranda dokunma hic calismiyordu).
              // Kirpma/interpolasyon ARTIK SADECE "videoyu gizle" surukleme
              // hareketi/sonucu sirasinda devreye giriyor.
              fullscreenVideo
                ? styles.mediaAnimatedFullscreen
                : videoHidden && videoNaturalHeight != null
                ? {
                    height: videoCollapseAnim.interpolate({ inputRange: [0, 1], outputRange: [0, videoNaturalHeight] }),
                    overflow: "hidden",
                  }
                : undefined
            }
            {...(fullscreenVideo ? {} : hideVideoPanResponder.panHandlers)}
          >
            <View
              style={[
                styles.mediaSection,
                // GERCEK KOK NEDEN: bu kutunun yuksekligi, icindeki
                // WebView/placeholder'in aspectRatio:16/9 stilinin PARENT'tan
                // (flex/stretch zinciri uzerinden) bir GENISLIK alabilmesine
                // bagliydi - bu zincir bir yerde kopunca (ornegin bu cihazda)
                // mediaSection'in KENDI dogal yuksekligi 0 kaliyordu; ustteki
                // Animated.View'e yuksekli ver(se bile) mediaSection kendi
                // icerigine gore boyutlandigi icin hicbir sey degismiyordu -
                // bu yuzden "Henuz bir medya secilmedi" yazisi/video HICBIR
                // ZAMAN gorunmuyordu. Artik genislik/yukseklik dogrudan ekran
                // genisliginden PIKSEL olarak hesaplanip veriliyor, flex/
                // aspectRatio zincirine hic ihtiyac yok.
                !fullscreenVideo && {
                  width: estimatedVideoWidth,
                  height: Math.round((estimatedVideoWidth * 9) / 16),
                },
                fullscreenVideo && styles.mediaSectionFullscreen,
              ]}
              onLayout={(e) => {
                if (!videoHidden) setVideoNaturalHeight(e.nativeEvent.layout.height);
              }}
            >
            <ReactionsOverlay ref={reactionsRef} fullscreen={fullscreenVideo}>
              <MediaPlayer
                ref={playerRef}
                source={room.playback.source}
                onStateChange={handleHostPlayerChange}
                onBuffering={handleBuffering}
                onDuration={handleDuration}
                onEnded={handleEnded}
                onUrlChange={handleDrmUrlChange}
                fullscreen={fullscreenVideo}
                onSubtitlesAvailabilityChange={setSubtitlesAvailable}
                onDubTracksChange={setDubTracks}
                onVideoResolutionChange={setVideoResolution}
              />
              {/* Video DURDURULUNCA YouTube'un kendi arayuzu (logo/paylas/
                  onerilen video karti) ortaya cikiyor - bunlara biz
                  dokunamayiz (YouTube'un gomulu oynatici kurallarinin bir
                  parcasi), ama Rave'in de yaptigi gibi USTUNE kendi opak
                  "duraklatildi" ekranimizi koyup altini tamamen gizleyebiliriz -
                  YouTube'un oynaticisina hic dokunmuyoruz, sadece onun
                  ONUNE kendi gorselimizi cekiyoruz. */}
              {room.playback.source?.type === "youtube" && (introCoverActive || !room.playback.isPlaying) && !adultBlurActive && (
                <View style={StyleSheet.absoluteFill} pointerEvents="none">
                  <Image
                    source={{ uri: `https://img.youtube.com/vi/${room.playback.source.url}/hqdefault.jpg` }}
                    style={StyleSheet.absoluteFill}
                    resizeMode="cover"
                  />
                  <View style={[StyleSheet.absoluteFill, styles.pausedCoverTint]} />
                </View>
              )}
              {syncable && !videoHidden && (
                <VideoControlsOverlay
                  isPlaying={room.playback.isPlaying}
                  canControlTransport={canControlTransport}
                  liked={Boolean(likedEventId)}
                  onToggleLike={toggleLike}
                  onPlayPause={togglePlayPause}
                  onSkip={skipBy}
                  canSkip={canSkip}
                  hasPreviousVideo={room.hasPreviousVideo}
                  onSkipPrevious={goToPreviousVideo}
                  onSkipNext={skipToNext}
                  showVoteBadges={room.playbackMode !== "leader"}
                  nextVoteCount={room.nextVideoVoteCount}
                  previousVoteCount={room.previousVideoVoteCount}
                  onSettings={() => setVideoSettingsVisible(true)}
                  showMic={fullscreenVideo}
                  micConnected={voice.connected}
                  micMuted={voice.muted}
                  onMicPress={handleMicPress}
                  onMicLongPress={handleMicLongPress}
                  onVisibilityChange={setControlsVisible}
                />
              )}
              {adultBlurActive && (
                <View style={StyleSheet.absoluteFill}>
                  {/* Canli videoyu degil, Discover karti/oda onizlemesiyle
                      (RoomCard.tsx/RoomPreviewScreen.tsx) AYNI sabit kapak
                      resmini bulanıklastiriyoruz - hareketli bir goruntu
                      bulanıklıkla bile kare kare sizdirabilir, sabit bir
                      kapak resmi daha guvenli VE daha az kaynak tuketir. */}
                  {adultCoverUrl ? (
                    <Image source={{ uri: adultCoverUrl }} style={StyleSheet.absoluteFill} />
                  ) : (
                    <View style={[StyleSheet.absoluteFill, styles.adultBlurFallbackBg]} />
                  )}
                  <BlurView intensity={90} tint="dark" style={styles.adultBlurHint}>
                    <AdultBadge size={44} />
                    <Text style={styles.adultBlurText}>Bu video +18 içerik barındırıyor</Text>
                    {canVoteSkipAdult ? (
                      <TouchableOpacity
                        style={[styles.adultSkipBtn, votedSkipAdult && styles.adultSkipBtnDisabled]}
                        onPress={voteSkipAdult}
                        disabled={votedSkipAdult}
                      >
                        <Text style={styles.adultSkipBtnText}>
                          {votedSkipAdult ? `Oy verildi (${room.adultSkipVoteCount}/${room.participants.length})` : "Atla"}
                        </Text>
                        {!votedSkipAdult && <Icon name="skipForward" size={14} color="#FFFFFF" />}
                      </TouchableOpacity>
                    ) : (
                      <Text style={styles.adultBlurSubtext}>Bu videoyu lider degistirebilir</Text>
                    )}
                  </BlurView>
                </View>
              )}
            </ReactionsOverlay>

            {/* NowPlayingBar artik HER MODDA (tam ekran da, normal da) videonun
                ALTINDA ayri bir satir degil, videonun KENDISININ uzerine binen,
                kontrol butonlarinin (ortadaki -10/oynat/+10) ALTINDA kalan bir
                overlay - boylece sohbetten net ayrisiyor, "sohbetin bir parcasi"
                gibi gorunmuyor. */}
            {syncable && controlsVisible && (
              <View style={styles.nowPlayingBarOverlay}>
                <NowPlayingBar
                  source={room.playback.source}
                  positionSeconds={displayPosition}
                  durationSeconds={room.playback.durationSeconds ?? null}
                  canSeek={canControlTransport}
                  onSeek={seekTo}
                  isFullscreen={fullscreenVideo}
                  onToggleFullscreen={toggleFullscreenVideo}
                  hostName={hostParticipant?.name || "Lider"}
                  hostAvatarUrl={hostParticipant?.avatarUrl}
                />
              </View>
            )}
            </View>
          </Animated.View>

          {/* Video yukari kayip kaybolunca, onu geri getirecek cark da
              ONUNLA BIRLIKTE gizlenmis oluyordu - kullanici sikisip
              kalmasin diye kalici, HIC collapse olmayan minik bir "centik"
              (asagi surukleyince video geri acilir, bkz. showVideoPanResponder).
              Video ACIKKEN bu centik HIC gorunmez - oradaki kapatma
              hareketi videonun KENDISINI yukari suruklemektir. */}
          {videoHidden && !fullscreenVideo && (
            <View style={styles.videoHandleBar} {...showVideoPanResponder.panHandlers}>
              <View style={styles.videoHandleNotch} />
            </View>
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
        ListHeaderComponent={
          <RoomQuickCards
            isHost={isHost}
            privacy={room.privacy}
            onChangePrivacy={changePrivacy}
            friends={friends}
            sentIds={quickInviteSentIds}
            onInviteFriend={quickInviteFriend}
          />
        }
        data={messages}
        keyExtractor={(_, i) => String(i)}
        renderItem={({ item, index }) => {
          // Rave'de oldugu gibi: arka arkaya gelen mesajlarda ayni
          // gondericinin avatari/ismi sadece grubun ilkinde gosteriliyor,
          // devaminda sadece metin aliniyor.
          const prev = messages[index - 1];
          const groupedWithPrev = !!prev && !prev.system && !item.system && prev.fromSocketId === item.fromSocketId;
          const sender = room.participants.find((p) => p.socketId === item.fromSocketId);
          return !item.system ? (
            <ChatBubbleRow
              item={item}
              isOwn={item.fromSocketId === socket.id}
              groupedWithPrev={groupedWithPrev}
              onReply={() => startReply(item)}
              onDoubleTap={() => reactToMessage(item)}
              onLongPressMessage={() => openMessageOptions(item)}
              isFriend={Boolean(sender?.userId && friendIds.has(sender.userId))}
              senderIsHost={Boolean(sender?.isHost)}
              senderIsModerator={Boolean(sender?.isModerator)}
              onReactWithEmoji={(emoji) => reactToMessageWithEmoji(item, emoji)}
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
            (() => {
              const meta = NOW_PLAYING_META[item.nowPlayingReason || "picked"];
              return (
                <View style={styles.settingsCard}>
                  {!!item.byName && <Avatar name={item.byName} avatarUrl={item.byAvatarUrl} size={36} />}
                  <View style={styles.settingsIconWrap}>
                    <Icon name={meta.icon} size={26} color={theme.accent} />
                  </View>
                  <View style={styles.settingsTextCol}>
                    <Text style={styles.settingsValue} numberOfLines={1}>
                      {item.title}
                    </Text>
                    <Text style={styles.settingsDesc} numberOfLines={1}>
                      {meta.desc(item.byName)}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => sendReaction("❤️")} hitSlop={8}>
                    <Icon name="heartOutline" size={20} color={theme.danger} />
                  </TouchableOpacity>
                </View>
              );
            })()
          ) : item.kind === "kicked" ? (
            <View style={styles.eventRow}>
              <Icon name="kicked" size={16} color={theme.textMuted} />
              <Text style={styles.eventText} numberOfLines={1}>
                <Text style={styles.eventBold}>{item.targetName}</Text>, <Text style={styles.eventBold}>{item.byName}</Text>{" "}
                tarafından atıldı
              </Text>
            </View>
          ) : item.kind === "settings" ? (
            <View style={styles.settingsCard}>
              <Avatar name={item.byName || "?"} avatarUrl={item.byAvatarUrl} size={36} />
              <View style={styles.settingsIconWrap}>
                <Icon name={settingsCardIcon(item)} size={26} color={theme.accent} />
              </View>
              <View style={styles.settingsTextCol}>
                <Text style={styles.settingsValue} numberOfLines={1}>
                  {item.settingValue}
                </Text>
                <Text style={styles.settingsDesc} numberOfLines={1}>
                  {item.settingLabel} · <Text style={styles.eventBold}>{item.byName}</Text> değiştirdi
                </Text>
              </View>
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
        {!chatFocused && (
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
        )}
        <TextInput
          style={styles.chatInput}
          placeholder={me?.chatBanned ? "Sohbete yazman kapatıldı" : "Mesaj yaz..."}
          placeholderTextColor={theme.textMuted}
          value={chatInput}
          onChangeText={setChatInput}
          onSubmitEditing={sendChat}
          onFocus={() => setChatFocused(true)}
          onBlur={() => setChatFocused(false)}
          editable={!me?.chatBanned}
        />
        {chatFocused ? (
          // Yaziyorken: Rave'deki gibi sadece gonder oku gorunur.
          <TouchableOpacity style={styles.iconTouchSm} onPress={sendChat} hitSlop={4}>
            <Icon name="send" size={30} color={theme.accentBright} />
          </TouchableOpacity>
        ) : (
          // Yazmiyorken: etiket/galeri ikonlari gorunur - paylas ikonu
          // kaldirildi, harita (dunya) ikonu artik burada degil, Katilimcilar
          // panelinin alt barinda, davet ikonunun solunda (bkz.
          // ParticipantsModal.tsx onShowMap/onInvite).
          <View style={styles.actionGroup}>
            <TouchableOpacity style={styles.iconTouchSm} onPress={insertMention} hitSlop={4}>
              <Icon name="mention" size={30} color="#FFFFFF" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconTouchSm} onPress={pickImage} hitSlop={4}>
              <Icon name="image" size={30} color="#FFFFFF" />
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
        onMuteParticipant={muteParticipant}
        onLongPressParticipant={openProfileOptions}
        hostMicOpen={room.micOpenToAll}
        onToggleOwnMic={handleMicPress}
        topOffset={topBarHeight}
        onShowMap={() => {
          setParticipantsVisible(false);
          showMap();
        }}
        onInvite={() => setInviteFriendsVisible(true)}
        friendIds={friendIds}
      />
      {/* Davet et - Discover'daki sag ustteki arkadaslar ikonuyla ACILAN AYNI
          FriendsScreen, sadece inviteMode acik (bkz. FriendsScreen.tsx). */}
      <Modal visible={inviteFriendsVisible} animationType="slide" onRequestClose={() => setInviteFriendsVisible(false)}>
        <FriendsScreen
          onBack={() => setInviteFriendsVisible(false)}
          onOpenSettings={() => {}}
          onOpenDM={() => {}}
          onOpenParticipant={() => {}}
          inviteMode
          excludeUserIds={room.participants.map((p) => p.userId).filter((id): id is string => Boolean(id))}
          onSendInvites={sendRoomInvites}
          roomCode={room.code}
          roomTitle={room.title}
        />
      </Modal>
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
        hideAdultContent={myHideAdultContent}
        onToggleHideAdultContent={toggleMyHideAdultContent}
        micConnected={voice.connected}
        micMuted={voice.muted}
        onMicPress={handleMicPress}
        onLeaveVoice={voice.leave}
        voiceVolume={voiceVolume}
        onVoiceVolumeChange={handleVoiceVolumeChange}
        videoVolume={videoVolume}
        onVideoVolumeChange={handleVideoVolumeChange}
      />

      <VideoSettingsSheet
        visible={videoSettingsVisible}
        onClose={() => setVideoSettingsVisible(false)}
        source={room.playback.source}
        videoHidden={videoHidden}
        onToggleHideVideo={toggleHideVideo}
        canChangeSpeed={isHost}
        playbackRate={room.playback.playbackRate}
        onChangePlaybackRate={changePlaybackRate}
        videoQuality={videoQuality}
        onChangeVideoQuality={changeVideoQuality}
        subtitlesEnabled={subtitlesEnabled}
        onToggleSubtitles={toggleSubtitles}
        subtitlesAvailable={subtitlesAvailable}
        dubTracks={dubTracks}
        selectedDubIndex={selectedDubIndex}
        onChangeDubTrack={changeDubTrack}
        videoResolution={videoResolution}
      />

      <MessageOptionsSheet
        visible={!!optionsMessage}
        message={optionsMessage}
        onClose={closeMessageOptions}
        onCopy={copyOptionsMessage}
        onReply={replyToOptionsMessage}
        onReport={reportOptionsMessage}
        onSelectEmoji={reactToOptionsMessageWithEmoji}
      />

      <ProfileOptionsSheet
        visible={!!profileOptionsTarget}
        target={profileOptionsTarget}
        isHost={isHost}
        canModerateTarget={Boolean(
          profileOptionsTarget &&
            (isHost || (isModerator && !profileOptionsTarget.isModerator && !profileOptionsTarget.isHost))
        )}
        onClose={closeProfileOptions}
        onOpenProfile={openParticipantProfile}
        onMakeLeader={(t) => t.socketId && makeLeader(t.socketId)}
        onMakeModerator={makeModerator}
        onRemoveModerator={removeModerator}
        onKick={(t) => t.socketId && kick(t.socketId)}
        onDisableMic={(t) => t.socketId && muteParticipant(t.socketId, true)}
        onEnableMic={enableMicFromProfile}
        onDisableChat={disableChatFromProfile}
        onEnableChat={enableChatFromProfile}
        onToggleLocalMute={toggleLocalMute}
        onSendFriendRequest={sendFriendRequestFromProfile}
        onCancelFriendRequest={cancelFriendRequestFromProfile}
        onRemoveFriend={removeFriendFromProfile}
        onBlock={blockFromProfile}
        onUnblock={unblockFromProfile}
        onReport={reportParticipant}
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
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  mediaAnimatedFullscreen: { flex: 1 },
  mediaSection: { position: "relative" },
  // Tam ekran yatay modda bu View (video + kontroller) flex:1 ile roomBody'nin
  // (ust bar gizliyken TUM ekranin) kalan butun yuksekligini kaplar.
  mediaSectionFullscreen: { flex: 1 },
  nowPlayingBarOverlay: { position: "absolute", left: 0, right: 0, bottom: 0 },
  videoHandleBar: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
  },
  videoHandleNotch: { width: 36, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.3)" },
  adultBlurFallbackBg: { backgroundColor: theme.surface },
  // Video durduruldugunda YouTube'un kendi arayuzunu gizleyen kapak
  // resminin UZERINDEKI karartma - kontrol ikonlarinin okunurlugu icin.
  pausedCoverTint: { backgroundColor: "rgba(0,0,0,0.35)" },
  adultBlurHint: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 16,
  },
  adultBlurText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700", textAlign: "center" },
  adultBlurSubtext: { color: "rgba(255,255,255,0.7)", fontSize: 12, textAlign: "center" },
  // Video kontrol panelindeki (VideoControlsOverlay.tsx "frame" stili) AYNI
  // koyu gri/siyah hap cercevesi - rengi orada da burada da ayni kalsin diye.
  adultSkipBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(20,18,16,0.95)",
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 24,
    marginTop: 4,
  },
  adultSkipBtnDisabled: { backgroundColor: "rgba(80,78,76,0.95)" },
  adultSkipBtnText: { color: "#FFFFFF", fontWeight: "700", fontSize: 14 },
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
  // ParticipantsModal.tsx avatarWrap/hostBadge/moderatorBadge ile AYNI
  // konumlandirma, sadece 32'lik sohbet avatarina oranli kucultulmus.
  chatAvatarWrap: { position: "relative" },
  chatHostBadge: { position: "absolute", top: -12, left: 0, right: 0, alignItems: "center" },
  chatModeratorBadge: { position: "absolute", bottom: -2, right: -2 },
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
  reactionBadgeRow: { flexDirection: "row", gap: 4, marginTop: 2 },
  // Her tepkinin cercevesi - tepki veren kisinin pp'si + emoji AYNI pill'in
  // icinde (bkz. reactionBadges).
  reactionChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: theme.surfaceAlt,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 16,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  reactionBadgeEmoji: { fontSize: 17 },
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
  eventRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 4 },
  eventText: { color: theme.textMuted, fontSize: 12, flexShrink: 1 },
  eventBold: { color: theme.text, fontWeight: "700" },
  // "settings" bildiri karti - RoomQuickCards.tsx'teki kartlarla AYNI
  // ailede: ekranin tam sol/sag kenarina yaslanir (chatContent'in
  // paddingHorizontal:12'si negatif margin ile iptal edilir), kose
  // yuvarlamasi yok, kim degistirdiyse onun avatari + buyuk bir ikon.
  settingsCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: -12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: theme.surface,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: theme.border,
  },
  settingsIconWrap: { width: 36, alignItems: "center" },
  settingsTextCol: { flex: 1 },
  settingsValue: { color: theme.text, fontSize: 16, fontWeight: "700" },
  settingsDesc: { color: theme.textMuted, fontSize: 12, marginTop: 1 },
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
});
