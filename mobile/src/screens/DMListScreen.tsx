import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Modal, PanResponder, View, Text, TextInput, TouchableOpacity, StyleSheet, FlatList } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import {
  Plus,
  Archive,
  Pin,
  BellOff,
  CircleArrowDown,
  Music,
  Image as ImageIcon,
  File as FileIcon,
  MapPin,
  User as UserIcon,
  BarChart2,
  Sticker as StickerIcon,
  Phone,
} from "lucide-react-native";
import { MicrophoneIcon } from "react-native-heroicons/outline";
import { useFonts, BebasNeue_400Regular } from "@expo-google-fonts/bebas-neue";
import { useTranslation } from "react-i18next";
import { useFocusEffect } from "@react-navigation/native";
import { getSocket, GroupConversationSummary } from "../services/socket";
import { supabase } from "../services/supabase";
import Avatar from "../components/Avatar";
import AppBackground from "../components/AppBackground";
import Icon from "../components/Icon";
import { VoiceOnceRingIcon } from "../components/CustomIcons";
import LoadingView from "../components/LoadingView";
import DMConversationOptionsSheet, { DMConversationOptionsTarget } from "../components/DMConversationOptionsSheet";
import FriendsScreen from "./FriendsScreen";
import { DMPeer } from "./DMScreen";
import { GroupPeer } from "./GroupChatScreen";

const TEXT = "#F5F0E6";
const MUTED = "#9A8F80";

interface DMConversationSummary {
  conversationId: string;
  peerId: string;
  peerName: string;
  peerHandle: string | null;
  peerAvatarUrl: string | null;
  // Kullanici: "son mesajdaki müziğe niye emoji koydun ikon koysana ...
  // sesli mesaj dosya felan hepsi için aynısını yap" - "text" alani
  // sunucuda HER medya turu icin bir emoji ONEKIYLE geliyor (bkz.
  // send_dm_*/send_group_* RPC'leri, "🎵 "/"📎 "/"🎤 "/vb.), bu yuzden
  // gercek bir ikon gosterip oneki metinden ayiklayabilmek icin "kind" (ve
  // arama turu icin callStatus/callIsVideo) gerekiyor (asagida
  // previewIconFor/previewTextFor).
  lastMessage: {
    text: string;
    createdAt: number;
    fromUserId: string;
    // Kullanici: "Gruplarda mesajı kim attıysa onun ismi ve : noktada
    // olmalı" - sadece grup satirlarinda kullanilir (DM'de tek bir
    // PEER oldugu icin gereksiz), bkz. senderPrefixFor.
    fromName?: string | null;
    kind?: string | null;
    callStatus?: string | null;
    callIsVideo?: boolean | null;
    // Kullanici: "...birde fotoğraf video ve tek kullanımlıkşarı göreyim" -
    // ReplyPreviewContent.tsx'teki (cevap alintisi) AYNI "tek görünümlük"
    // kuralini burada da uygulayabilmek icin.
    viewOnce?: boolean | null;
    stickerId?: string | null;
  } | null;
  unread: boolean;
  unreadCount: number;
  isFriend: boolean;
  pinned: boolean;
  muted: boolean;
  archived: boolean;
}

interface Props {
  onOpenDM: (peer: DMPeer) => void;
  // "+" -> "Yeni Grup Oluştur" akisinda bir grup GERCEKTEN olusturulunca
  // (bkz. FriendsScreen.tsx handleCreateGroup), VEYA bu listeden bir grup
  // satirina basilinca cagrilir.
  onOpenGroup: (group: GroupPeer) => void;
}

// DM konusmasi ozetiyle (DMConversationSummary) AYNI alanlara "uydurularak"
// - boylece asagidaki sort/filtrele/renderItem mantiginin NEREDEYSE TAMAMI
// grup satirlari icin de degismeden calisir, SADECE basma/basili-tutma
// davranisi dallanir (bkz. renderItem/openOptionsFor cagrilari).
function groupToRow(g: GroupConversationSummary): DMConversationSummary & { isGroup: true; groupId: string } {
  return {
    conversationId: `group:${g.groupId}`,
    peerId: g.groupId,
    peerName: g.name,
    peerHandle: null,
    peerAvatarUrl: g.avatarUrl,
    // Grup mesajlarinda "call" turu YOK (aramalar SADECE DM'de) - callStatus/
    // callIsVideo bilerek verilmiyor, previewIconFor/previewTextFor zaten
    // kind "call" DEGILSE bunlara hic bakmiyor.
    lastMessage: g.lastMessage
      ? {
          text: g.lastMessage.text,
          createdAt: g.lastMessage.createdAt,
          fromUserId: g.lastMessage.fromUserId,
          fromName: g.lastMessage.fromName,
          kind: g.lastMessage.kind,
          viewOnce: g.lastMessage.viewOnce,
          stickerId: g.lastMessage.stickerId,
        }
      : null,
    unread: false,
    unreadCount: 0,
    isFriend: false,
    pinned: false,
    muted: false,
    archived: false,
    isGroup: true,
    groupId: g.groupId,
  };
}

// Her mesaj turunun sunucuda (send_dm_*/send_group_* RPC'leri) metne
// gomdugu SABIT emoji oneki - "call" HARIC her turde TEK bir onek var,
// "call" ise duruma gore 3 farkli onekten biriyle gelebiliyor.
const KIND_TEXT_PREFIXES: Record<string, string[]> = {
  photo: ["📷 "],
  video: ["🎥 "],
  file: ["📎 "],
  music: ["🎵 "],
  voice: ["🎤 "],
  location: ["📍 "],
  contact: ["👤 "],
  poll: ["📊 "],
  sticker: ["🏷️ "],
  call: ["📞 ", "🎥 "],
};

function previewTextFor(text: string, kind: string | null | undefined): string {
  const prefixes = kind ? KIND_TEXT_PREFIXES[kind] : undefined;
  if (!prefixes) return text;
  const prefix = prefixes.find((p) => text.startsWith(p));
  return prefix ? text.slice(prefix.length) : text;
}

type LastMessagePreview = NonNullable<DMConversationSummary["lastMessage"]>;

function isViewOnceMediaPreview(item: LastMessagePreview): boolean {
  const isGifSticker = item.kind === "sticker" && !!item.stickerId?.startsWith("gif-");
  return !!item.viewOnce && (item.kind === "photo" || item.kind === "video" || isGifSticker || item.kind === "voice");
}

// ReplyPreviewContent.tsx'teki (cevap alintisi) "tur ikonu" seciminin
// BIREBIR AYNISI - kullanici "Sesli mesajın ikonu bu değildi" dedi: orada
// zaten ozenle secilmis (MicrophoneIcon/AppIcon "video"/VoiceOnceRingIcon -
// lucide'den FARKLI aileler) ikonlarla tutarli olsun diye kopyalandi.
function renderPreviewIcon(item: LastMessagePreview, color: string): React.ReactNode {
  if (isViewOnceMediaPreview(item))
    return (
      <View style={styles.rowPreviewViewOnceBox}>
        <View style={styles.rowPreviewViewOnceIconWrap}>
          <VoiceOnceRingIcon size={33} color={color} />
        </View>
      </View>
    );
  switch (item.kind) {
    case "photo":
      return <ImageIcon size={13} color={color} />;
    case "video":
      return <Icon name="video" size={13} color={color} />;
    case "voice":
      return <MicrophoneIcon size={13} color={color} strokeWidth={1.8} />;
    case "location":
      return <MapPin size={13} color={color} />;
    case "file":
      return <FileIcon size={13} color={color} />;
    case "contact":
      return <UserIcon size={13} color={color} />;
    case "poll":
      return <BarChart2 size={13} color={color} />;
    case "music":
      return <Music size={13} color={color} />;
    case "sticker":
      return <StickerIcon size={13} color={color} />;
    case "call":
      return item.callIsVideo ? <Icon name="video" size={13} color={color} /> : <Phone size={13} color={color} />;
    default:
      return null;
  }
}

// AYNI sekilde ReplyPreviewContent.tsx'teki "label" mantigiyla BIREBIR -
// tek-gorunumluk medyada gercek altyazi/metin yerine HER ZAMAN sabit tur
// etiketi gosterilir (kullanici: "tek kullanımlıkşarı göreyim").
function previewLabelFor(item: LastMessagePreview, t: (key: string) => string): string {
  if (isViewOnceMediaPreview(item)) {
    const isGifSticker = item.kind === "sticker" && !!item.stickerId?.startsWith("gif-");
    return isGifSticker ? t("dm.kindGif") : item.kind === "video" ? t("dm.kindVideo") : item.kind === "voice" ? t("dm.kindVoice") : t("dm.kindPhoto");
  }
  return previewTextFor(item.text, item.kind);
}

// Kullanici: "Gruplarda mesajı kim attıysa onun ismi ve : noktada olmalı" -
// DM'de PEER zaten tek kisi oldugu icin sadece grup satirlarinda uygulanir;
// kendi mesajimizsa isim yerine "Siz" (t("dmList.you")) gosterilir.
function senderPrefixFor(
  item: LastMessagePreview,
  isGroup: boolean,
  myUserId: string | null,
  t: (key: string) => string
): string {
  if (!isGroup) return "";
  const name = myUserId && item.fromUserId === myUserId ? t("dmList.you") : item.fromName;
  return name ? `${name}: ` : "";
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function startOfDay(ts: number): number {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

// Son mesaj saatini bicimlendirir: aynı gun ve <12 saat -> "14.00" gibi saat,
// aynı gun ve >=12 saat -> "Bugun", tam bir gun once -> "Dun",
// daha eskiyse -> "20.03.2026" gibi tarih (kullanicinin istegi).
function formatLastMessageTime(ts: number, t: (key: string, opts?: any) => string): string {
  const now = Date.now();
  const dayDiff = Math.round((startOfDay(now) - startOfDay(ts)) / 86400000);

  if (dayDiff >= 2) {
    const d = new Date(ts);
    return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()}`;
  }
  if (dayDiff === 1) return t("userProfile.yesterday");
  if (dayDiff === 0) {
    const hoursElapsed = (now - ts) / 3600000;
    if (hoursElapsed >= 12) return t("userProfile.today");
  }
  const d = new Date(ts);
  return `${pad2(d.getHours())}.${pad2(d.getMinutes())}`;
}

/** Alt bardaki uc-nokta sekmesi - tum DM konusmalarinin listesi (en son
 * mesaja gore siralanmis). Bir satira basmak DMScreen'i acar (bkz.
 * RootNavigator.tsx DMsRoute). Eskiden bu sekme uygulama ayarlarini
 * aciyordu - ayarlar artik SADECE UserProfileScreen'deki carktan erisiliyor. */
function sortConversations(list: DMConversationSummary[]): DMConversationSummary[] {
  return [...list].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return (b.lastMessage?.createdAt ?? 0) - (a.lastMessage?.createdAt ?? 0);
  });
}

export default function DMListScreen({ onOpenDM, onOpenGroup }: Props) {
  const { t } = useTranslation();
  const [headerFontLoaded] = useFonts({ BebasNeue_400Regular });
  const [conversations, setConversations] = useState<DMConversationSummary[]>([]);
  const [groups, setGroups] = useState<GroupConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [optionsTarget, setOptionsTarget] = useState<DMConversationOptionsTarget | null>(null);
  const [optionsVisible, setOptionsVisible] = useState(false);
  // Kullanici: "Arkadaş seçip yeni sohbet başlatabilen ve yeni grup
  // oluşturabilen bir ekran istiyorum" - "+" dugmesi artik "yakinda" uyarisi
  // yerine FriendsScreen'i (hideInviteExtras + !inviteMode -> satira
  // basinca DOGRUDAN onOpenDM cagirir) bir Modal icinde "Yeni Sohbet"
  // basligiyla acar; FriendsScreen'in EN USTUNDE "Yeni Grup Oluştur" satiri
  // da bu modda gorunur (bkz. FriendsScreen.tsx onCreateGroup).
  const [newChatVisible, setNewChatVisible] = useState(false);

  // FriendsScreen.tsx'teki "geri al" (scheduleUndo) ile AYNI mimari - satir
  // ANINDA kaybolur, gercek sunucu cagrisi ~4sn ertelenir, bu sure icinde
  // "Geri Al" basilirsa HICBIR istek gitmeden iptal edilir.
  const [undoBanner, setUndoBanner] = useState<{ message: string; onUndo: () => void } | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingCommitRef = useRef<(() => void) | null>(null);

  // Grup satirlarinda son mesaji "Siz: ..." / "Ad: ..." gosterebilmek icin
  // kendi kullanici id'mizi biliyor olmamiz gerekiyor (bkz. senderPrefixFor).
  const [myUserId, setMyUserId] = useState<string | null>(null);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMyUserId(data.user?.id ?? null));
  }, []);

  useEffect(() => {
    return () => {
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    };
  }, []);

  function scheduleUndo(message: string, onUndo: () => void, onCommit: () => void) {
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
      pendingCommitRef.current?.();
    }
    pendingCommitRef.current = onCommit;
    undoTimerRef.current = setTimeout(() => {
      undoTimerRef.current = null;
      pendingCommitRef.current = null;
      setUndoBanner(null);
      onCommit();
    }, 4000);
    setUndoBanner({
      message,
      onUndo: () => {
        if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
        undoTimerRef.current = null;
        pendingCommitRef.current = null;
        setUndoBanner(null);
        onUndo();
      },
    });
  }

  const refresh = useCallback(() => {
    getSocket().emit("dm:list", {}, (res: any) => {
      if (res?.ok) setConversations(res.conversations || []);
      setLoading(false);
    });
    getSocket().emit("group:list", {}, (res: any) => {
      if (res?.ok) setGroups(res.groups || []);
    });
  }, []);

  useEffect(refresh, [refresh]);
  // Sekmeye her donuste (yeni mesaj gelmis olabilir) liste tazelenir.
  useFocusEffect(refresh);

  // Gruplar DM'lerle AYNI listede, AYNI siralama/arama mantigiyla gorunur
  // (bkz. yukaridaki groupToRow) - gruplar henuz arsivlenemiyor, bu yuzden
  // hep "aktif" listede.
  const mergedRows = useMemo(
    () => [...conversations, ...groups.map(groupToRow)],
    [conversations, groups]
  );
  const activeConversations = useMemo(() => sortConversations(mergedRows.filter((c) => !c.archived)), [mergedRows]);
  const archivedConversations = useMemo(() => sortConversations(mergedRows.filter((c) => c.archived)), [mergedRows]);

  // Telegram'daki gibi "Arsiv" satirini sola/saga kaydirinca gizleme
  // (kullanicinin istegi) - gizlemek SADECE bu cihazda/oturumda bir tercih,
  // sunucuya hicbir sey gonderilmez. Hangi "durumu" gizledigimizi (kac
  // arsivlenmis sohbet + en son hareket zamani) bir imza olarak saklariz;
  // yeni bir sohbet arsivlenir ya da arsivdeki birine yeni mesaj gelirse imza
  // degisir ve satir KENDILIGINDEN geri gelir (Telegram'in davranisiyla AYNI).
  const archiveSignature = `${archivedConversations.length}:${archivedConversations.reduce(
    (max, c) => Math.max(max, c.lastMessage?.createdAt ?? 0),
    0
  )}`;
  const [archiveDismissedSignature, setArchiveDismissedSignature] = useState<string | null>(null);
  const archiveSignatureRef = useRef(archiveSignature);
  archiveSignatureRef.current = archiveSignature;
  const archiveEntryVisible = !showArchived && archivedConversations.length > 0 && archiveDismissedSignature !== archiveSignature;

  const query = search.trim().toLowerCase();
  const baseList = showArchived ? archivedConversations : activeConversations;
  const visibleConversations = query
    ? baseList.filter((c) => c.peerName.toLowerCase().includes(query) || (c.peerHandle || "").toLowerCase().includes(query))
    : baseList;

  function patchConversation(peerId: string, patch: Partial<DMConversationSummary>) {
    setConversations((prev) => prev.map((c) => (c.peerId === peerId ? { ...c, ...patch } : c)));
  }

  function openOptionsFor(item: DMConversationSummary) {
    setOptionsTarget({
      peerId: item.peerId,
      name: item.peerName,
      handle: item.peerHandle,
      avatarUrl: item.peerAvatarUrl,
      pinned: item.pinned,
      muted: item.muted,
      archived: item.archived,
      unread: item.unread,
    });
    setOptionsVisible(true);
  }

  function togglePinned(target: DMConversationOptionsTarget) {
    const next = !target.pinned;
    patchConversation(target.peerId, { pinned: next });
    getSocket().emit("dm:setPinned", { userId: target.peerId, pinned: next }, () => {});
  }

  function toggleMuted(target: DMConversationOptionsTarget) {
    const next = !target.muted;
    patchConversation(target.peerId, { muted: next });
    getSocket().emit("dm:setMuted", { userId: target.peerId, muted: next }, () => {});
  }

  function toggleArchived(target: DMConversationOptionsTarget) {
    const next = !target.archived;
    patchConversation(target.peerId, { archived: next });
    getSocket().emit("dm:setArchived", { userId: target.peerId, archived: next }, () => {});
  }

  function toggleUnread(target: DMConversationOptionsTarget) {
    const next = !target.unread;
    patchConversation(target.peerId, { unread: next, unreadCount: 0 });
    getSocket().emit("dm:setManualUnread", { userId: target.peerId, unread: next }, () => {});
  }

  function deleteConversation(target: DMConversationOptionsTarget) {
    const removed = conversations.find((c) => c.peerId === target.peerId);
    setConversations((prev) => prev.filter((c) => c.peerId !== target.peerId));
    scheduleUndo(
      t("dmList.deletedUndoMessage", { name: target.name }),
      () => {
        if (removed) setConversations((prev) => [removed, ...prev]);
      },
      () => getSocket().emit("dm:delete", { userId: target.peerId }, () => {})
    );
  }

  // Telegram'daki gibi listeyi en ustteyken asagi cekince "Arsiv" kutusunun
  // buyuyerek acilmasi (kullanicinin istegi) - PanResponder'in GERCEK dokunma
  // hareketini takip etmesi sayesinde (native scroll'un "zipllama" fizigine
  // BAGIMLI degil), Telegram'in kendi dokunma takibi gibi iOS/Android/web
  // FARK ETMEKSIZIN ayni sekilde calisir. FlatList EN USTTEYKEN (scrollYRef
  // <= 0) asagi dogru surukleme baslarsa biz yakalariz, yoksa liste normal
  // kaydirmaya devam eder.
  const scrollYRef = useRef(0);
  const pullAnim = useRef(new Animated.Value(0)).current;
  const showArchivedRef = useRef(showArchived);
  const archivedCountRef = useRef(archivedConversations.length);
  useEffect(() => {
    showArchivedRef.current = showArchived;
  }, [showArchived]);
  useEffect(() => {
    archivedCountRef.current = archivedConversations.length;
  }, [archivedConversations.length]);

  const PULL_OPEN_THRESHOLD = 60;
  const PULL_MAX = 90;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponderCapture: (_evt, gestureState) => {
        return (
          !showArchivedRef.current &&
          archivedCountRef.current > 0 &&
          scrollYRef.current <= 0 &&
          gestureState.dy > 10 &&
          Math.abs(gestureState.dy) > Math.abs(gestureState.dx)
        );
      },
      onPanResponderMove: (_evt, gestureState) => {
        pullAnim.setValue(Math.max(0, Math.min(gestureState.dy * 0.5, PULL_MAX)));
      },
      onPanResponderRelease: (_evt, gestureState) => {
        const pulled = Math.max(0, Math.min(gestureState.dy * 0.5, PULL_MAX));
        if (pulled > PULL_OPEN_THRESHOLD) {
          setShowArchived(true);
        }
        Animated.spring(pullAnim, { toValue: 0, useNativeDriver: false }).start();
      },
      onPanResponderTerminate: () => {
        Animated.spring(pullAnim, { toValue: 0, useNativeDriver: false }).start();
      },
    })
  ).current;

  // "Arsiv" satirini sola/saga kaydirinca kaydirdigi yone kayarak kaybolmasi
  // (Telegram'daki gibi, kullanicinin istegi). Yatay hareket baskinken devreye
  // girer (dikey PanResponder'in dy>dx sarti sayesinde bununla CAKISMAZ).
  const archiveSwipeX = useRef(new Animated.Value(0)).current;
  // Satirin GERCEK (olculmus) yuksekligi - kaydirip gizlerken kaybolma
  // animasyonuyla AYNI anda bu yukseklik de 0'a inmezse, satir yana kayip
  // GORUNMEZ olsa bile eski yerinde bos bir BOSLUK birakir (kullanicinin
  // yakaladigi hata - altindaki mesajlar eski yerine cikmiyordu). Bu yuzden
  // "gizle" aninda hem yatay kayma/saydamlik HEM de yukseklik 0'a birlikte
  // (Animated.parallel) animasyonlanir.
  const archiveRowHeightRef = useRef(0);
  const [archiveCollapseAnim, setArchiveCollapseAnim] = useState<Animated.Value | null>(null);
  // NOT: Bu satir artik TouchableOpacity DEGIL duz bir View - react-native-web'de
  // Touchable kendi "click"ini PanResponder'dan BAGIMSIZ bir olay sistemiyle
  // (Pressability/pointer events) tetikledigi icin, bir ust PanResponder'in
  // "capture" ile araya girmesi webde ISE YARAMIYOR (tiklama yine de
  // Arsiv'i aciyordu) - bu yuzden hem "basma" (az hareket) hem "kaydirma"
  // (cok yatay hareket) TEK bu PanResponder icinde ayirt ediliyor.
  const archiveSwipeResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: (_evt, gestureState) => {
        if (Math.abs(gestureState.dx) > Math.abs(gestureState.dy)) {
          archiveSwipeX.setValue(gestureState.dx);
        }
      },
      onPanResponderRelease: (_evt, gestureState) => {
        const horizontalDominant = Math.abs(gestureState.dx) > Math.abs(gestureState.dy);
        if (horizontalDominant && Math.abs(gestureState.dx) > 70) {
          const heightAnim = new Animated.Value(archiveRowHeightRef.current);
          setArchiveCollapseAnim(heightAnim);
          Animated.timing(archiveSwipeX, {
            toValue: gestureState.dx > 0 ? 500 : -500,
            duration: 180,
            useNativeDriver: false,
          }).start();
          Animated.timing(heightAnim, { toValue: 0, duration: 180, useNativeDriver: false }).start();
          // NOT: Animated'in kendi .start(callback) geri cagrisina
          // GUVENILMEDI - bazi ortamlarda (bkz. test harness'i) hic
          // tetiklenmedigi gozlendi. Bunun yerine ayni sureyle AYNI, sade
          // bir setTimeout ile durumu KESIN olarak commit ediyoruz.
          setTimeout(() => {
            setArchiveDismissedSignature(archiveSignatureRef.current);
            archiveSwipeX.setValue(0);
            setArchiveCollapseAnim(null);
          }, 190);
        } else if (Math.abs(gestureState.dx) < 8 && Math.abs(gestureState.dy) < 8) {
          setShowArchived(true);
          Animated.spring(archiveSwipeX, { toValue: 0, useNativeDriver: false }).start();
        } else {
          Animated.spring(archiveSwipeX, { toValue: 0, useNativeDriver: false }).start();
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(archiveSwipeX, { toValue: 0, useNativeDriver: false }).start();
      },
    })
  ).current;

  return (
    <View style={styles.screen}>
      <AppBackground />
      {!showArchived ? (
        /* Eskiden burada LUNA logosu vardi - Discover ekranindaki AYNI
           beyazdan maviye gecen degrade "halka" + dolgu degradeli arama
           cubugu ile degistirildi (kullanicinin istegi). */
        <View style={styles.searchRow}>
          <LinearGradient colors={["#FFFFFF", "#38BDF8"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.searchBarBorder}>
            <LinearGradient colors={["#0c1a28", "#13293f", "#1b3752"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.searchBar}>
              <Icon name="search" size={16} color="#FFFFFF" />
              <TextInput
                style={styles.searchInput}
                value={search}
                onChangeText={setSearch}
                placeholder={t("dmList.searchPlaceholder")}
                placeholderTextColor="rgba(186,214,235,0.45)"
              />
            </LinearGradient>
          </LinearGradient>
          {/* Arama cubugundan "kopmus bir parca" gibi - AYNI gradyan cerceve +
              AYNI koyu lacivert dolgu, sadece dairesel - icinde yeni mesaj
              basmak icin bir "+" (kullanicinin istegi). */}
          <TouchableOpacity onPress={() => setNewChatVisible(true)}>
            <LinearGradient colors={["#FFFFFF", "#38BDF8"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.newDmButtonBorder}>
              <LinearGradient colors={["#0c1a28", "#13293f", "#1b3752"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.newDmButtonInner}>
                <Plus size={22} color="#FFFFFF" strokeWidth={2.4} />
              </LinearGradient>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      ) : (
        /* Arsiv goruntusunde arama cubugu/+ tuşu yerine UserProfileScreen'in
           gonderi olusturma basligi ile BIREBIR AYNI tarif - ortalanmis
           Bebas Neue baslik + AYNI geri oku (CircleArrowDown, 90 derece
           dondurulmus) (kullanicinin istegi). */
        <View style={styles.archiveHeaderRow}>
          <TouchableOpacity onPress={() => setShowArchived(false)} hitSlop={10} style={styles.archiveHeaderSideButton}>
            <View style={{ transform: [{ rotate: "90deg" }] }}>
              <CircleArrowDown size={22} color="#FFFFFF" />
            </View>
          </TouchableOpacity>
          <Text style={[styles.archiveHeaderTitle, headerFontLoaded && styles.archiveHeaderTitleFontLoaded]}>
            {t("dmList.archiveEntryLabel")}
          </Text>
          <View style={styles.archiveHeaderSideButton} />
        </View>
      )}

      {showArchived && (
        // Arsiv goruntusunde de ana listedeki AYNI arama cubugu (kullanicinin
        // istegi) - sadece yaninda "+" (yeni mesaj) tusu yok, arsivde o
        // aksiyonun anlami olmadigi icin.
        <View style={styles.archiveSearchRow}>
          <LinearGradient colors={["#FFFFFF", "#38BDF8"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.searchBarBorder}>
            <LinearGradient colors={["#0c1a28", "#13293f", "#1b3752"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.searchBar}>
              <Icon name="search" size={16} color="#FFFFFF" />
              <TextInput
                style={styles.searchInput}
                value={search}
                onChangeText={setSearch}
                placeholder={t("dmList.searchPlaceholder")}
                placeholderTextColor="rgba(186,214,235,0.45)"
              />
            </LinearGradient>
          </LinearGradient>
        </View>
      )}

      <View style={styles.listArea} {...panResponder.panHandlers}>
        {/* WhatsApp/Telegram'daki gibi - en az bir arsivlenmis sohbet varsa
            listenin en ustunde kalici bir "Arsiv" girisi, USTUNE asagi
            cekince de (Telegram'daki gibi) buyuyerek tepki verir, sola/saga
            kaydirinca da kaydirdigi yone kayarak gizlenir (kullanicinin
            istegi) - yeni bir sohbet arsivlenirse/arsivdeki birine yeni mesaj
            gelirse kendiliginden geri gelir. */}
        {archiveEntryVisible && (
          <Animated.View style={archiveCollapseAnim ? { height: archiveCollapseAnim, overflow: "hidden" } : undefined}>
            <View onLayout={(e) => (archiveRowHeightRef.current = e.nativeEvent.layout.height)}>
              <Animated.View
                style={{
                  opacity: archiveSwipeX.interpolate({ inputRange: [-150, 0, 150], outputRange: [0, 1, 0], extrapolate: "clamp" }),
                  transform: [
                    { scale: pullAnim.interpolate({ inputRange: [0, PULL_MAX], outputRange: [1, 1.08], extrapolate: "clamp" }) },
                    { translateX: archiveSwipeX },
                  ],
                }}
                {...archiveSwipeResponder.panHandlers}
              >
                <View style={styles.archiveEntryRow}>
                  <View style={styles.archiveEntryIconWrap}>
                    <Archive size={20} color="#FFFFFF" strokeWidth={1.8} />
                  </View>
                  <Text style={styles.archiveEntryLabel}>{t("dmList.archiveEntryLabel")}</Text>
                  <View style={styles.archiveEntryBadge}>
                    <Text style={styles.archiveEntryBadgeText}>{archivedConversations.length}</Text>
                  </View>
                </View>
              </Animated.View>
            </View>
          </Animated.View>
        )}

        <FlatList
          data={visibleConversations}
          keyExtractor={(c) => c.conversationId}
          contentContainerStyle={styles.listContent}
          onScroll={(e) => {
            scrollYRef.current = e.nativeEvent.contentOffset.y;
          }}
          scrollEventThrottle={16}
          ListEmptyComponent={
            loading ? (
              <LoadingView />
            ) : (
              // Arama GERCEKTEN sonucu bulamadiysa ("Henuz mesajin yok"
              // YANLIS olur - konusmalari VAR, sadece aramaya uyan yok).
              <Text style={styles.emptyText}>{query ? t("dmList.noSearchResults") : t("dmList.emptyText")}</Text>
            )
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.row}
              onPress={() =>
                (item as any).isGroup
                  ? onOpenGroup({ id: item.peerId, name: item.peerName, avatarUrl: item.peerAvatarUrl })
                  : onOpenDM({ userId: item.peerId, name: item.peerName, handle: item.peerHandle ?? undefined })
              }
              onLongPress={() => !(item as any).isGroup && openOptionsFor(item)}
              delayLongPress={350}
            >
              <Avatar name={item.peerName} avatarUrl={item.peerAvatarUrl} size={48} isFriend={item.isFriend} />
              <View style={styles.rowText}>
                <View style={styles.rowTopLine}>
                  <View style={styles.rowNameWrap}>
                    {item.pinned && <Pin size={12} color={MUTED} strokeWidth={2} style={styles.rowNameIcon} />}
                    <Text style={styles.rowName} numberOfLines={1}>{item.peerName}</Text>
                  </View>
                  <View style={styles.rowTimeWrap}>
                    {item.muted && <BellOff size={12} color={MUTED} strokeWidth={2} style={styles.rowTimeIcon} />}
                    {!!item.lastMessage && (
                      <Text style={styles.rowTime}>{formatLastMessageTime(item.lastMessage.createdAt, t)}</Text>
                    )}
                  </View>
                </View>
                <View style={styles.rowBottomLine}>
                  {item.lastMessage ? (
                    (() => {
                      const previewColor = item.unread ? TEXT : MUTED;
                      const iconNode = renderPreviewIcon(item.lastMessage, previewColor);
                      const senderPrefix = senderPrefixFor(item.lastMessage, !!(item as any).isGroup, myUserId, t);
                      const label = previewLabelFor(item.lastMessage, t);
                      return iconNode ? (
                        <View style={styles.rowPreviewIconWrap}>
                          {!!senderPrefix && (
                            <Text
                              style={[styles.rowPreviewSenderPrefix, item.unread && styles.rowPreviewUnread]}
                              numberOfLines={1}
                            >
                              {senderPrefix}
                            </Text>
                          )}
                          {iconNode}
                          <Text
                            style={[styles.rowPreview, styles.rowPreviewIconText, item.unread && styles.rowPreviewUnread]}
                            numberOfLines={1}
                          >
                            {label}
                          </Text>
                        </View>
                      ) : (
                        <Text style={[styles.rowPreview, item.unread && styles.rowPreviewUnread]} numberOfLines={1}>
                          {senderPrefix + label}
                        </Text>
                      );
                    })()
                  ) : (
                    !!item.peerHandle && <Text style={styles.rowPreview}>@{item.peerHandle}</Text>
                  )}
                  {item.unread && (
                    <View style={styles.unreadBadge}>
                      {item.unreadCount > 0 && (
                        <Text style={styles.unreadBadgeText} numberOfLines={1}>
                          {item.unreadCount > 99 ? "99+" : item.unreadCount}
                        </Text>
                      )}
                    </View>
                  )}
                </View>
              </View>
            </TouchableOpacity>
          )}
        />
      </View>

      <DMConversationOptionsSheet
        visible={optionsVisible}
        target={optionsTarget}
        onClose={() => setOptionsVisible(false)}
        onTogglePinned={togglePinned}
        onToggleMuted={toggleMuted}
        onToggleArchived={toggleArchived}
        onToggleUnread={toggleUnread}
        onDelete={deleteConversation}
      />

      <Modal visible={newChatVisible} animationType="slide" onRequestClose={() => setNewChatVisible(false)} statusBarTranslucent>
        <FriendsScreen
          onBack={() => setNewChatVisible(false)}
          onOpenDM={(peerToOpen) => {
            setNewChatVisible(false);
            onOpenDM(peerToOpen);
          }}
          onOpenParticipant={() => {}}
          hideInviteExtras
          hideFriendActions
          headerTitle={t("dmList.newChatTitle")}
          allowCreateGroup
          onOpenGroup={(group) => {
            setNewChatVisible(false);
            onOpenGroup(group);
          }}
        />
      </Modal>

      {undoBanner && (
        <View style={styles.undoBanner}>
          <Icon name="undoArrow" size={18} color={TEXT} />
          <Text style={styles.undoBannerText} numberOfLines={1}>
            {undoBanner.message}
          </Text>
          <TouchableOpacity onPress={undoBanner.onUndo} hitSlop={8}>
            <Text style={styles.undoBannerAction}>{t("friends.undo")}</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "transparent" },
  // DiscoverScreen.tsx searchBarBorder/searchBar ile BIREBIR AYNI gorunum.
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: 16,
    marginTop: 50,
    marginBottom: 8,
  },
  searchBarBorder: {
    flex: 1,
    borderRadius: 27,
    padding: 2,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    height: 48,
    borderRadius: 26,
    paddingHorizontal: 18,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 15,
    paddingVertical: 0,
    includeFontPadding: false,
    outlineWidth: 0,
    outlineStyle: "none",
  } as any,
  // Arama cubugu ile AYNI 2px cerceve kalinligi, dis cap arama cubuguyla
  // (48 + 2*2) AYNI yukseklikte olsun diye 52.
  newDmButtonBorder: { width: 52, height: 52, borderRadius: 26, padding: 2 },
  newDmButtonInner: { flex: 1, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  listContent: { paddingHorizontal: 16, paddingBottom: 100 },
  emptyText: { color: MUTED, textAlign: "center", marginTop: 60, fontSize: 14 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  rowText: { flex: 1 },
  rowTopLine: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  rowNameWrap: { flexDirection: "row", alignItems: "center", flexShrink: 1 },
  rowNameIcon: { marginRight: 4 },
  rowName: { flexShrink: 1, color: TEXT, fontSize: 14, fontWeight: "700" },
  rowTimeWrap: { flexDirection: "row", alignItems: "center" },
  rowTimeIcon: { marginRight: 4 },
  rowTime: { color: MUTED, fontSize: 11, fontWeight: "600" },
  rowBottomLine: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 2 },
  rowPreview: { flex: 1, color: MUTED, fontSize: 12, fontWeight: "500", lineHeight: 16 },
  rowPreviewUnread: { color: TEXT, fontWeight: "700" },
  rowPreviewIconWrap: { flex: 1, flexDirection: "row", alignItems: "center", gap: 4 },
  rowPreviewIconText: { flex: 1 },
  // Kullanici: "Ama rozet fotoğraf yazısının yanında olmalıydı ismin değil" -
  // grup on-ekini (örn. "Elif Şahin: ") ikondan AYRI, flex'siz bir Text
  // olarak basiyoruz ki ikon+etiket ("Fotoğraf") ismin DEGIL mesajin
  // yaninda kalsin.
  rowPreviewSenderPrefix: { color: MUTED, fontSize: 12, fontWeight: "500", lineHeight: 16, flexShrink: 0 },
  rowPreviewViewOnceBox: { width: 14, height: 14 },
  rowPreviewViewOnceIconWrap: { position: "absolute", top: -9.5, left: -9.5 },
  unreadBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  unreadBadgeText: { color: "#0c1a28", fontSize: 11, fontWeight: "800" },
  // Arsiv girisi - normal bir sohbet satiri gibi degil, ayirt edici olmasi
  // icin hafif seffaf bir kart (kullanicinin istegi: "asagi kaydirarak
  // arsiv acabilsek" - listenin en ustunde kalici/kesin bir giris noktasi).
  // Ustteki bosluk (searchRow.marginBottom 8 + paddingTop 10 = 18px) ile
  // alttaki bosluk (paddingBottom 6 + marginBottom 0 + row.paddingTop 12 =
  // 18px) ESIT olsun diye boyle bolunduler (kullanicinin istegi).
  archiveEntryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginHorizontal: 16,
    marginBottom: 0,
    paddingTop: 10,
    paddingBottom: 6,
  },
  archiveEntryIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 6,
  },
  archiveEntryLabel: { flex: 1, color: TEXT, fontSize: 14, fontWeight: "700" },
  archiveEntryBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  archiveEntryBadgeText: { color: TEXT, fontSize: 11, fontWeight: "800" },
  listArea: { flex: 1 },
  // UserProfileScreen.tsx composerHeaderRow/editHeaderTitle ile BIREBIR AYNI
  // tarif - iki yandaki AYNI genislikteki (36px) bosluklar sayesinde baslik
  // GERCEKTEN ortalanir (kullanicinin istegi).
  archiveHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 54,
    paddingBottom: 4,
  },
  archiveHeaderSideButton: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  archiveHeaderTitle: { color: "#FFFFFF", fontSize: 16, fontWeight: "800", letterSpacing: 0.3, marginTop: 1 },
  archiveHeaderTitleFontLoaded: { fontFamily: "BebasNeue_400Regular", fontWeight: "400", fontSize: 22, letterSpacing: 1.4 },
  // Arsiv ekranindaki arama cubugu - ana listedeki searchRow ile AYNI, sadece
  // "+" tusu olmadigi icin tek basina (kullanicinin istegi).
  archiveSearchRow: { marginHorizontal: 16, marginTop: 8, marginBottom: 8 },
  undoBanner: {
    position: "absolute",
    bottom: 20,
    left: 16,
    right: 16,
    backgroundColor: "#15202B",
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    zIndex: 30,
  },
  undoBannerText: { flex: 1, color: TEXT, fontSize: 13, fontWeight: "600" },
  undoBannerAction: { color: "#38BDF8", fontSize: 13, fontWeight: "800", marginTop: 1 },
});
