import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  TextInput,
  Modal,
  ActivityIndicator,
  Animated,
  Easing,
  Dimensions,
  PanResponder,
} from "react-native";
import { ChevronLeft, ChevronDown, Gift, Tag, Newspaper, History as HistoryIcon, Heart, Plus, Camera, Users, CircleArrowDown, ChartBar, MapPin, Pencil, Image as ImageIcon } from "lucide-react-native";
import { LockClosedIcon } from "react-native-heroicons/outline";
import { useFonts, BebasNeue_400Regular } from "@expo-google-fonts/bebas-neue";
import { LinearGradient } from "expo-linear-gradient";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { useTranslation } from "react-i18next";
import { supabase } from "../services/supabase";
import { getSocket, PublicRoomSummary, HistoryItem, MediaSource, SourceType, RoomState } from "../services/socket";
import Icon from "../components/Icon";
import { showAlert } from "../components/CustomAlert";
import RoomCard from "../components/RoomCard";
import PhotoViewerModal from "../components/PhotoViewerModal";
import PostCard from "../components/PostCard";
import AppBackground from "../components/AppBackground";
import PremiumBadge from "../components/PremiumBadge";
import Avatar, { colorForName } from "../components/Avatar";
import { uriToArrayBuffer } from "../utils/uriToArrayBuffer";

interface Props {
  own?: boolean;
  peer?: { userId: string; name: string; handle?: string };
  onBack?: () => void;
  onOpenDM?: (peer: { userId: string; name: string; handle?: string }) => void;
  onOpenRoomPreview?: (room: PublicRoomSummary) => void;
  onOpenRoom?: (room: RoomState) => void;
  onOpenSettings?: () => void;
}

// Alttan acilan kutularin (avatar/banner secim sheet'leri) tutamaciyla
// AŞAĞI SÜRÜKLEYEREK kapatilabilmesi icin - PanResponder (ek bir kutuphane
// gerekmiyor, react-native'in kendi API'si) ile dy>80 aninda onClose
// cagiriyor, aksi halde yayla eski yerine (0) geri donuyor.
function DragToCloseSheet({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  const translateY = useRef(new Animated.Value(0)).current;
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_evt, gesture) => Math.abs(gesture.dy) > 6 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
      onPanResponderMove: (_evt, gesture) => {
        if (gesture.dy > 0) translateY.setValue(gesture.dy);
      },
      onPanResponderRelease: (_evt, gesture) => {
        if (gesture.dy > 80) {
          onClose();
        } else {
          Animated.spring(translateY, { toValue: 0, useNativeDriver: true }).start();
        }
      },
    })
  ).current;

  return (
    <Animated.View style={{ transform: [{ translateY }] }} {...panResponder.panHandlers}>
      {children}
    </Animated.View>
  );
}

// Gizlilik secicisindeki "Genel" secenegi icin gercek kitalarin gorundugu
// dolu (Heroicons solid) kure ikonu - lucide'in cizgisel Globe'undan FARKLI
// olarak Lock/Users ile AYNI "size + color" imzasina sahip, boylece
// VisIcon map'inde (asagida) dogrudan yerine koyulabiliyor.
function WorldIcon({ size, color }: { size?: number; color?: string }) {
  return <Icon name="worldOpen" size={size} color={color} />;
}

// "Gizlilik" satirinda (ProfileScreen.tsx) kullanilan AYNI kilit ikonu -
// lucide'in Lock'u DEGIL, boylece "Ozel" secenegi uygulamadaki gercek
// gizlilik ikonuyla birebir ayni gorunuyor.
function PrivacyLockIcon({ size, color }: { size?: number; color?: string }) {
  return <LockClosedIcon size={size} color={color} strokeWidth={2} />;
}

const ACCENT = "#0EA5E9";
const BG = "#000000";
const TEXT = "#F5F0E6";
const MUTED = "#9A8F80";
// Cevrimdisi halka rengi - MUTED'dan (etiket/metin gri tonu) daha acik,
// avatarin koyu arka planinda daha net secilsin diye.
const OFFLINE_GRAY = "#C2C2C2";

const SCREEN_WIDTH = Dimensions.get("window").width;
const SCREEN_HEIGHT = Dimensions.get("window").height;
// Avatar'in EKRANDAKI (scroll=0 haliyle) sabit konumu - topBlock'un sol
// dolgusu (24) ve banner yuksekligi (150) eksi tasma miktari (23) - bu
// sabitler asagidaki stiller ile AYNI (bannerWrap/avatarSquareOverlap).
// Avatarin icindeki "arkaplan penceresi" bu offsetle + canli scroll
// konumuyla kaydirilarak, PAYLASILAN AppBackground'in TAM boyutlu bir
// kopyasini tam o noktaya hizaliyor - boylece gercekten "o noktadaki
// arkaplanin kendisi" gibi gorunuyor, kendi basina kucultulmus/bagimsiz
// bir degrade DEGIL.
// Cikinti/pp/isim/handle/bio/konum/katilim tarihi/dogum tarihi topBlock'un
// normal sol dolgusundan (24) bu kadar (LEFT_SHIFT) SOLA kaydirildi -
// banner yazisi/sekmeler/govde bundan ETKILENMEZ, sadece bu blok.
const LEFT_SHIFT = 8;
const AVATAR_SCREEN_X = 24 - LEFT_SHIFT;
const BANNER_HEIGHT = 150;
// Avatar banner'in icine SABIT bu kadar (px) tasar - avatar boyutu
// degisse bile bu deger ORANLA degil, SABIT kalir.
const AVATAR_OVERLAP_BASE = 44;
// PP ve cikinti ikisi birden asagi kaysin diye - eski tasma miktarinin
// (AVATAR_OVERLAP_BASE) %25'i kadar, arti ekstra bir miktar daha.
const AVATAR_SHIFT_DOWN = AVATAR_OVERLAP_BASE * 0.25 + 10;
const AVATAR_OVERLAP = AVATAR_OVERLAP_BASE - AVATAR_SHIFT_DOWN;
const AVATAR_SCREEN_Y = BANNER_HEIGHT - AVATAR_OVERLAP;
// Banner'in alt kenari DUZ bir cizgi degil - pp'nin oldugu yerde,
// pp'den daha BUYUK, yuvarlak bir "kabarti/cikinti" var (bkz. bannerNotch
// stili). Bu da avatarBgWindow ile AYNI teknikle (tam ekran boyutlu
// PAYLASILAN arkaplanin o noktaya hizalanmis bir penceresi) cizildi -
// boylece banner'in icindeki ust kismi banner'dan "oyulmus" gibi,
// alt kismi (gercek govdeye tasan kismi) ise zaten govdeyle AYNI
// arkaplani gosterdigi icin govdeyle kesintisiz birlesiyor.
const NOTCH_DIAMETER = 92;
// PP 88px - yatay merkezi AVATAR_SCREEN_X + 44.
const NOTCH_CENTER_X = AVATAR_SCREEN_X + 44;
const NOTCH_X = NOTCH_CENTER_X - NOTCH_DIAMETER / 2;
const NOTCH_Y = BANNER_HEIGHT - NOTCH_DIAMETER / 2 + AVATAR_SHIFT_DOWN;

// Su an gercek bir "kullanicilar arasi gezinme" ekrani yok - baskasinin
// profilini (own=false) test etmek icin sabit bir demo kimlik kullaniyoruz.
const DEMO_PEER_USER_ID = "demo-peer-kullanici";

// "goz" ikonuyla acilip kapatilan istatistik gorunurlugu - supabase/
// migrations/0003_profile_stats_and_history.sql'deki profiles.
// stat_visibility sutununun varsayilaniyla AYNI (gercek deger yuklenene
// kadar kisa sureligine gosterilen baslangic durumu).
const DEFAULT_STAT_VISIBILITY: Record<string, boolean> = {
  onlineStatus: true,
  joinDate: true,
  totalHours: true,
  activityChart: true,
  friends: true,
  longestSession: true,
  biggestRoom: true,
};

interface Post {
  id: string;
  userId: string;
  text: string | null;
  imageUrls: string[];
  locationName: string | null;
  taggedUserIds: string[];
  pollQuestion: string | null;
  pollOptions: string[] | null;
  pollOptionImages: (string | null)[] | null;
  createdAt: number;
}

// Tarih formatlama icin dil basina kisaltilmis ay adlari - bir takvim
// kutuphanesine bagimli kalmadan (zaten TEK YERDE kullaniliyor) basit bir
// harita, bilinmeyen bir dil kodunda İngilizce'ye duser.
const MONTHS: Record<string, string[]> = {
  tr: ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"],
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  de: ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"],
  fr: ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."],
  ar: ["ينا", "فبر", "مار", "أبر", "ماي", "يون", "يول", "أغس", "سبت", "أكت", "نوف", "ديس"],
  ku: ["Rêb", "Sib", "Ada", "Nîs", "Gul", "Hez", "Tîr", "Teb", "Îlo", "Cot", "Mij", "Ber"],
  el: ["Ιαν", "Φεβ", "Μάρ", "Απρ", "Μάι", "Ιούν", "Ιούλ", "Αύγ", "Σεπ", "Οκτ", "Νοέ", "Δεκ"],
  ru: ["янв", "февр", "март", "апр", "май", "июнь", "июль", "авг", "сент", "окт", "нояб", "дек"],
  az: ["Yan", "Fev", "Mar", "Apr", "May", "İyn", "İyl", "Avq", "Sen", "Okt", "Noy", "Dek"],
  es: ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"],
};

function formatDate(ms: number, lang: string): string {
  const d = new Date(ms);
  const months = MONTHS[lang] ?? MONTHS.en;
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function timeAgo(ms: number, t: (key: string, opts?: any) => string, lang: string): string {
  const diffDays = Math.floor((Date.now() - ms) / (24 * 60 * 60 * 1000));
  if (diffDays <= 0) return t("userProfile.today");
  if (diffDays === 1) return t("userProfile.yesterday");
  if (diffDays < 30) return t("friends.daysAgo", { count: diffDays });
  return formatDate(ms, lang);
}

/** "Vinil Kayıt" konsepti - kartelanın (bkz. tasarım oturumu) ilk seçeneği,
 * kullanıcının kendi profili (own) ve başkasının profili (!own) icin
 * ortak bir govde uzerinde farkli baslik/aksiyon satiri gosterir. */
export default function UserProfileScreen({ own = true, peer, onBack, onOpenDM, onOpenRoomPreview, onOpenRoom, onOpenSettings }: Props) {
  const { t, i18n } = useTranslation();
  // Engellenenler/Gizlilik ekranlarindaki BASLIKLA AYNI (Bebas Neue) -
  // sadece "Profili Duzenle" tam ekraninin basligi icin.
  const [editHeaderFontLoaded] = useFonts({ BebasNeue_400Regular });
  const peerUserId = peer?.userId || DEMO_PEER_USER_ID;
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [name, setName] = useState(peer?.name || t("userProfile.defaultName"));
  const [handle, setHandle] = useState(peer?.handle || "kullanici");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [country, setCountry] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(own); // kendi profilin her zaman cevrimici
  const [joinDateMs, setJoinDateMs] = useState<number | null>(null);
  const [avatarSheetVisible, setAvatarSheetVisible] = useState(false);
  const [bannerSheetVisible, setBannerSheetVisible] = useState(false);
  // Galeride bir fotografa ya da avatara basinca PhotoViewerModal ile tam
  // ekran buyuk haliyle acilir.
  const [viewingPhotoUrl, setViewingPhotoUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [editingField, setEditingField] = useState<
    "name" | "handle" | "bio" | "profile_location" | "birthday" | null
  >(null);
  const [statVisibility, setStatVisibility] = useState(DEFAULT_STAT_VISIBILITY);
  const [videosVisible, setVideosVisible] = useState(true);
  const [bioVisible, setBioVisible] = useState(true);
  const [friendStatus, setFriendStatus] = useState<"none" | "pending" | "friends">("none");
  // supabase/migrations/0018_is_premium.sql - su an herkeste false (henuz
  // gercek bir satin alma akisi yok, bkz. PremiumScreen.tsx) - dolu gelince
  // isim yaninda parıltı rozeti gosteriliyor.
  const [isPremium, setIsPremium] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [likedHistory, setLikedHistory] = useState<HistoryItem[]>([]);
  const [historyTab, setHistoryTab] = useState<"best" | "history" | "liked">("history");
  const [activeRoom, setActiveRoom] = useState<PublicRoomSummary | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [postsVisible, setPostsVisible] = useState(true);
  const [profileCache, setProfileCache] = useState<Record<string, { name: string; handle: string; avatarUrl: string }>>({});
  const [composerVisible, setComposerVisible] = useState(false);
  const [composerText, setComposerText] = useState("");
  const [composerImages, setComposerImages] = useState<string[]>([]);
  const [composerLocation, setComposerLocation] = useState("");
  const [composerTaggedIds, setComposerTaggedIds] = useState<string[]>([]);
  const [composerTagPickerVisible, setComposerTagPickerVisible] = useState(false);
  const [composerFriends, setComposerFriends] = useState<{ userId: string; name: string; avatarUrl: string; handle: string }[]>([]);
  const [composerVisibility, setComposerVisibility] = useState<"public" | "private" | "friends">("public");
  const [composerVisibilityMenuOpen, setComposerVisibilityMenuOpen] = useState(false);
  const [composerLocationFieldVisible, setComposerLocationFieldVisible] = useState(false);
  const [composerLocationLoading, setComposerLocationLoading] = useState(false);
  const [composerPollBuilderVisible, setComposerPollBuilderVisible] = useState(false);
  const [composerPollQuestion, setComposerPollQuestion] = useState("");
  const [composerPollOptions, setComposerPollOptions] = useState<string[]>(["", ""]);
  const [composerPollOptionImages, setComposerPollOptionImages] = useState<(string | null)[]>([null, null]);
  const [composerPollImageSheetTarget, setComposerPollImageSheetTarget] = useState<number | null>(null);
  // Avatarin icindeki "arkaplan penceresinin" kaydirmayla (scroll) birlikte
  // dogru hizada kalmasi icin - AppBackground sayfanin SABIT arkasinda
  // durur, ScrollView icerigi onun ONUNDE kayar.
  const [scrollY, setScrollY] = useState(0);
  const [postingBusy, setPostingBusy] = useState(false);
  const [bannerUrl, setBannerUrl] = useState("");
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const [profileLocation, setProfileLocation] = useState("");
  const [birthday, setBirthday] = useState("");
  const [topTab, setTopTab] = useState<"posts" | "tagged" | "history" | "liked">("posts");
  const [taggedPosts, setTaggedPosts] = useState<Post[]>([]);
  // Tam ekran "Profili Duzenle" sayfasi - PROFILI DUZENLE butonuyla acilir,
  // mevcut alan-bazli duzenleme (editingField/persistField) mantigini AYNEN
  // kullanir, sadece hepsini TEK bir ekranda bir arada gosterir.
  const [editProfileVisible, setEditProfileVisible] = useState(false);
  // Konum gizlilik secimi (Genel/Ozel/Arkadaslar) - henuz backend'de bir
  // sutunu YOK, su an sadece gorsel/yerel bir tercih (bkz. konusma ozeti).
  const [locationVisibility, setLocationVisibility] = useState<"public" | "private" | "friends">("public");
  const [locationVisibilityMenuOpen, setLocationVisibilityMenuOpen] = useState(false);
  const [birthdayVisibility, setBirthdayVisibility] = useState<"public" | "private" | "friends">("public");
  const [birthdayVisibilityMenuOpen, setBirthdayVisibilityMenuOpen] = useState(false);

  const effectiveUserId = own ? myUserId : peerUserId;
  // Kendi profilinde HER ZAMAN cevrimicisindir (uygulamayi kullaniyorsun) -
  // baskasinin profilinde ise sahibinin gizleme tercihine (statVisibility.
  // onlineStatus) bagli.
  const showPresenceRing = own || statVisibility.onlineStatus !== false;

  // Baskasinin profilinde avatarin etrafinda disa dogru dalgalanan (sonar
  // gibi buyuyup sonup kaybolan) bir halka - cevrimiciyse mavi, degilse gri.
  // Sahibi "cevrimici durumunu" gizlerse (statVisibility.onlineStatus=false)
  // bu efekt HIC calismaz (bkz. showPresenceRing / avatar render'i).
  const pulseAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!showPresenceRing) return;
    const loop = Animated.loop(
      Animated.timing(pulseAnim, {
        toValue: 1,
        duration: 1800,
        easing: Easing.out(Easing.ease),
        useNativeDriver: false,
      })
    );
    loop.start();
    return () => {
      loop.stop();
      pulseAnim.setValue(0);
    };
  }, [showPresenceRing]);
  const pulseScale = pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] });
  const pulseOpacity = pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] });

  // Kendi profilin: gercek profiles satirini (isim/handle/bio/avatar/
  // katilim tarihi/gorunurluk tercihleri) dogrudan supabase'den yukle -
  // eskiden SADECE e-posta on ekinden uydurma bir isim gosteriliyordu,
  // kaydedilmis GERCEK deger (varsa) hic okunmuyordu.
  useEffect(() => {
    if (!own) return;
    supabase.auth.getUser().then(({ data }) => {
      const userId = data.user?.id;
      if (!userId) return;
      setMyUserId(userId);
      supabase
        .from("profiles")
        .select(
          "name,handle,bio,avatar_url,country,created_at,stat_visibility,videos_visible,bio_visible,posts_visible,banner_url,profile_location,birthday,is_premium"
        )
        .eq("id", userId)
        .maybeSingle()
        .then(({ data: profile }) => {
          if (!profile) return;
          if (profile.name) setName(profile.name);
          if (profile.handle) setHandle(profile.handle);
          setBio(profile.bio || "");
          if (profile.avatar_url) setAvatarUrl(profile.avatar_url);
          setCountry(profile.country || null);
          if (profile.created_at) setJoinDateMs(new Date(profile.created_at).getTime());
          if (profile.stat_visibility) setStatVisibility(profile.stat_visibility);
          if (profile.videos_visible !== undefined) setVideosVisible(profile.videos_visible !== false);
          if (profile.bio_visible !== undefined) setBioVisible(profile.bio_visible !== false);
          if (profile.posts_visible !== undefined) setPostsVisible(profile.posts_visible !== false);
          setBannerUrl(profile.banner_url || "");
          setProfileLocation(profile.profile_location || "");
          setBirthday(profile.birthday || "");
          setIsPremium(profile.is_premium === true);
        });
    });
  }, [own]);

  useEffect(() => {
    if (own) return;
    const socket = getSocket();
    // Gercek katilimcinin isim/handle/avatar/bio/ulke/cevrimici/katilim
    // tarihi/gorunurluk bilgisini getirir - avatar taplandiginda elimizde
    // sadece isim/userId oluyor, geri kalani burada tamamlaniyor.
    socket.emit("user:profile", { userId: peerUserId }, (res: any) => {
      if (res?.ok && res.profile) {
        setName(res.profile.name || name);
        if (res.profile.handle) setHandle(res.profile.handle);
        setBio(res.profile.bio || "");
        if (res.profile.avatarUrl) setAvatarUrl(res.profile.avatarUrl);
        setCountry(res.profile.country || null);
        setIsOnline(Boolean(res.profile.isOnline));
        if (res.profile.createdAt) setJoinDateMs(res.profile.createdAt);
        if (res.profile.statVisibility) setStatVisibility(res.profile.statVisibility);
        setVideosVisible(res.profile.videosVisible !== false);
        setBioVisible(res.profile.bioVisible !== false);
        setPostsVisible(res.profile.postsVisible !== false);
        setBannerUrl(res.profile.bannerUrl || "");
        setProfileLocation(res.profile.profileLocation || "");
        setBirthday(res.profile.birthday || "");
        setIsPremium(Boolean(res.profile.isPremium));
      }
    });
    socket.emit("friend:status", { withUserId: peerUserId }, (res: any) => {
      if (res?.ok) setFriendStatus(res.status === "outgoing" ? "pending" : res.status === "friends" ? "friends" : "none");
    });
    function handleAccepted({ byUserId }: { byUserId: string }) {
      if (byUserId === peerUserId) setFriendStatus("friends");
    }
    function handleDeclinedOrCancelled({ byUserId }: { byUserId: string }) {
      if (byUserId === peerUserId) setFriendStatus("none");
    }
    socket.on("friend:accepted", handleAccepted);
    socket.on("friend:declined", handleDeclinedOrCancelled);
    return () => {
      socket.off("friend:accepted", handleAccepted);
      socket.off("friend:declined", handleDeclinedOrCancelled);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [own, peerUserId]);

  // Gercek istatistikler/arkadas sayisi/gecmis - "Katilim Tarihi" disindaki
  // hicbir sey artik uydurma degil (bkz. supabase/migrations/0003_profile_
  // stats_and_history.sql). Kendi profil icin myUserId cozulur cozulmez,
  // baskasi icin peerUserId zaten hazir oldugu icin hemen calisir.
  useEffect(() => {
    if (!effectiveUserId) return;
    const socket = getSocket();
    socket.emit("user:roomHistory", { userId: effectiveUserId }, (res: any) => {
      if (res?.ok) setHistory(res.history);
    });
    socket.emit("user:likedHistory", { userId: effectiveUserId }, (res: any) => {
      if (res?.ok) setLikedHistory(res.history);
    });
  }, [effectiveUserId]);

  // "Su an acik odasi" karti - Kesif'teki ile AYNI gizlilik kuraliyla
  // sunucu tarafinda hesaplanir (bkz. rooms.ts findActiveRoomForUser) -
  // bu yuzden burada ekstra bir gizlilik kontrolu YAPMIYORUZ, sunucu zaten
  // bu BAKAN (viewer) icin gorunmuyorsa room: null donuyor.
  useEffect(() => {
    if (!effectiveUserId) return;
    const socket = getSocket();
    socket.emit("user:activeRoom", { userId: effectiveUserId }, (res: any) => {
      if (res?.ok) setActiveRoom(res.room);
    });
  }, [effectiveUserId]);

  // Gonderi yazarlarinin / etiketlenen kisilerin isim-kullanici adi-avatar
  // bilgisini dogrudan Supabase'den cozen ortak yardimci - profiles_select_all
  // RLS politikasi (0001_init.sql) herkesin bu alanlari okumasina izin verir.
  async function resolveProfiles(ids: string[]) {
    const unique = Array.from(new Set(ids)).filter(Boolean);
    if (unique.length === 0) return;
    const { data } = await supabase.from("profiles").select("id,name,handle,avatar_url").in("id", unique);
    if (!data) return;
    setProfileCache((prev) => {
      const next = { ...prev };
      for (const p of data as any[]) next[p.id] = { name: p.name || "", handle: p.handle || "", avatarUrl: p.avatar_url || "" };
      return next;
    });
  }

  function rowToPost(row: any): Post {
    return {
      id: row.id,
      userId: row.user_id,
      text: row.text,
      imageUrls: row.image_urls || [],
      locationName: row.location_name,
      taggedUserIds: row.tagged_user_ids || [],
      pollQuestion: row.poll_question || null,
      pollOptions: row.poll_options || null,
      pollOptionImages: row.poll_option_images || null,
      createdAt: new Date(row.created_at).getTime(),
    };
  }

  // Paylasimlar (KENDI gonderileri) - gallery_photos ile AYNI kalip (supabase/
  // migrations/0021_posts.sql): RLS "kendi gonderilerim VEYA posts_visible
  // acik olan birinin gonderileri" diye filtreliyor, burada dogrudan
  // sorguluyoruz.
  useEffect(() => {
    if (!effectiveUserId) return;
    supabase
      .from("posts")
      .select("id,user_id,text,image_urls,location_name,tagged_user_ids,poll_question,poll_options,poll_option_images,created_at")
      .eq("user_id", effectiveUserId)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        const rows = data || [];
        setPosts(rows.map(rowToPost));
        resolveProfiles([effectiveUserId, ...rows.flatMap((row: any) => row.tagged_user_ids || [])]);
      });
  }, [effectiveUserId]);

  // "Etiketlendiklerim" - baskalarinin BU kullaniciyi etiketledigi
  // gonderiler (tagged_user_ids dizisi effectiveUserId'yi iceren TUM
  // gonderiler, yazari kim olursa olsun - RLS zaten o yazarin kendi
  // posts_visible tercihine gore filtreliyor, burada ekstra kontrole
  // gerek yok).
  useEffect(() => {
    if (!effectiveUserId) return;
    supabase
      .from("posts")
      .select("id,user_id,text,image_urls,location_name,tagged_user_ids,poll_question,poll_options,poll_option_images,created_at")
      .contains("tagged_user_ids", [effectiveUserId])
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        const rows = data || [];
        setTaggedPosts(rows.map(rowToPost));
        resolveProfiles(rows.flatMap((row: any) => [row.user_id, ...(row.tagged_user_ids || [])]));
      });
  }, [effectiveUserId]);

  // Etiketleme listesi icin gercek arkadas listesi - DiscoverScreen/
  // RoomPreviewScreen'deki friends:list cagrisiyla AYNI.
  useEffect(() => {
    if (!own) return;
    getSocket().emit("friends:list", {}, (res: any) => {
      if (res?.ok)
        setComposerFriends(
          res.friends.map((f: { userId: string; name: string; avatarUrl?: string | null; handle?: string | null }) => ({
            userId: f.userId,
            name: f.name,
            avatarUrl: f.avatarUrl || "",
            handle: f.handle || "",
          }))
        );
    });
  }, [own]);

  function placeholder(label: string) {
    showAlert(label, t("profile.comingSoon"));
  }

  function sendFriendRequest() {
    getSocket().emit("friend:request", { toUserId: peerUserId }, (res: any) => {
      if (res?.ok) setFriendStatus("pending");
    });
  }

  function cancelFriendRequest() {
    getSocket().emit("friend:cancel", { toUserId: peerUserId }, () => setFriendStatus("none"));
  }

  // Isim/kullanici adi/biyografi duzenlemeleri eskiden SADECE yerel state'ti -
  // yazip kapatinca hicbir yere kaydedilmiyordu, sayfa yenilenince kayboluyordu.
  type EditableField = "name" | "handle" | "bio" | "profile_location" | "birthday";

  async function persistField(field: EditableField, value: string) {
    if (!own || !myUserId) return;
    await supabase.from("profiles").update({ [field]: value || null }).eq("id", myUserId);
  }

  function toggleFieldEdit(field: EditableField) {
    if (!own) return;
    setEditingField(field);
  }

  function closeFieldEdit(field: EditableField, value: string) {
    setEditingField(null);
    persistField(field, value);
  }

  async function removeAvatar() {
    setAvatarSheetVisible(false);
    setAvatarUrl("");
    const { data } = await supabase.auth.getUser();
    const userId = data.user?.id;
    if (!userId) return;
    await supabase.from("profiles").update({ avatar_url: null }).eq("id", userId);
  }

  async function pickFromGallery() {
    setAvatarSheetVisible(false);
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      showAlert(t("dm.permissionRequiredTitle"), t("dm.permissionRequiredBody"));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.[0]) return;
    await uploadAvatar(result.assets[0].uri);
  }

  // DMScreen.tsx'teki openCamera ile AYNI akis (OS'in kendi kamera
  // uygulamasini acan ImagePicker.launchCameraAsync) - sadece kare [1,1]
  // kirpma avatar'a ozel.
  async function takeAvatarPhoto() {
    setAvatarSheetVisible(false);
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      showAlert(t("dm.permissionRequiredTitle"), t("dm.cameraPermissionRequiredBody"));
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.8 });
    if (result.canceled || !result.assets?.[0]) return;
    await uploadAvatar(result.assets[0].uri);
  }

  // avatars storage bucket (supabase/migrations/0001_init.sql) zaten hazirdi -
  // sadece client tarafindaki yukleme hic yazilmamisti. "avatars/<userId>/..."
  // yoluna sadece kendi klasorune yazma izni var (avatar_owner_write policy).
  async function uploadAvatar(uri: string) {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) return;
    setUploadingAvatar(true);
    try {
      const arrayBuffer = await uriToArrayBuffer(uri);
      const ext = uri.split(".").pop()?.toLowerCase() || "jpg";
      const contentType = ext === "png" ? "image/png" : "image/jpeg";
      const path = `${userId}/avatar.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, arrayBuffer, { contentType, upsert: true });
      if (uploadError) throw uploadError;
      const { data: publicUrlData } = supabase.storage.from("avatars").getPublicUrl(path);
      // "upsert" ayni path'e yazdigi icin URL degismiyor - tarayici/CDN
      // onbellegi eski resmi gosterebilir, sona bir "cache-bust" ekliyoruz.
      const bustedUrl = `${publicUrlData.publicUrl}?t=${Date.now()}`;
      const { error: updateError } = await supabase.from("profiles").update({ avatar_url: bustedUrl }).eq("id", userId);
      if (updateError) throw updateError;
      setAvatarUrl(bustedUrl);
    } catch (err: any) {
      showAlert(t("userProfile.uploadFailedTitle"), err?.message || t("userProfile.uploadFailedBody"));
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function removeBannerPhoto() {
    setBannerUrl("");
    const { data } = await supabase.auth.getUser();
    const userId = data.user?.id;
    if (!userId) return;
    await supabase.from("profiles").update({ banner_url: null }).eq("id", userId);
  }

  async function pickBannerPhoto() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      showAlert(t("dm.permissionRequiredTitle"), t("dm.permissionRequiredBody"));
      return;
    }
    // Banner SCREEN_WIDTH x BANNER_HEIGHT oraniyla kirpiliyor - avatarin
    // kare [1,1] oraninin aksine, banner'in GERCEK gorunur en-boy orani.
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [SCREEN_WIDTH, BANNER_HEIGHT],
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.[0]) return;
    await uploadBannerPhoto(result.assets[0].uri);
  }

  async function takeBannerPhoto() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      showAlert(t("dm.permissionRequiredTitle"), t("dm.cameraPermissionRequiredBody"));
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [SCREEN_WIDTH, BANNER_HEIGHT],
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.[0]) return;
    await uploadBannerPhoto(result.assets[0].uri);
  }

  // avatars bucket'iyla AYNI desen (0026_profile_banner_photo.sql) -
  // "banners/<userId>/..." yoluna sadece kendi klasorune yazma izni var.
  async function uploadBannerPhoto(uri: string) {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) return;
    setUploadingBanner(true);
    try {
      const arrayBuffer = await uriToArrayBuffer(uri);
      const ext = uri.split(".").pop()?.toLowerCase() || "jpg";
      const contentType = ext === "png" ? "image/png" : "image/jpeg";
      const path = `${userId}/banner.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("banners")
        .upload(path, arrayBuffer, { contentType, upsert: true });
      if (uploadError) throw uploadError;
      const { data: publicUrlData } = supabase.storage.from("banners").getPublicUrl(path);
      const bustedUrl = `${publicUrlData.publicUrl}?t=${Date.now()}`;
      const { error: updateError } = await supabase.from("profiles").update({ banner_url: bustedUrl }).eq("id", userId);
      if (updateError) throw updateError;
      setBannerUrl(bustedUrl);
    } catch (err: any) {
      showAlert(t("userProfile.uploadFailedTitle"), err?.message || t("userProfile.uploadFailedBody"));
    } finally {
      setUploadingBanner(false);
    }
  }

  // Galeriye GERCEK fotograf yukleme - avatarin tek dosyalik "upsert" deseninin
  // aksine, her secim YENI bir satir/dosya olusturur (bkz. 0004_gallery_
  // photos.sql) cunku bir kullanicinin birden fazla galeri fotografi olabilir.
  // GEÇMİŞ'teki bir video kartına dokununca, o videoyla GERÇEK yeni bir oda
  // açıp dogrudan icine giriyoruz - "+" ile yeni oda acma (DiscoverScreen.tsx
  // createRoomWithSource) ile AYNI room:create cagrisi, sadece kaynak
  // kaydedilmis gecmisten geliyor. Eskiden bu kartlarin HICBIR onPress'i yoktu.
  function openHistoryVideo(item: HistoryItem) {
    if (!item.mediaUrl || !item.mediaType) {
      showAlert(t("userProfile.videoUnavailableTitle"), t("userProfile.videoUnavailableBody"));
      return;
    }
    const source: MediaSource = {
      type: item.mediaType as SourceType,
      url: item.mediaUrl,
      label: item.mediaLabel,
      coverUrl: item.mediaCoverUrl || undefined,
    };
    getSocket()
      .timeout(8000)
      .emit("room:create", { name, isPublic: true, source }, (err: any, res: any) => {
        if (err) return showAlert(t("discover.createFailedTitle"), t("common.connectionIssueBody"));
        if (res?.ok) onOpenRoom?.(res.room);
        else showAlert(t("discover.createFailedTitle"), res?.error || t("common.unknownError"));
      });
  }

  function toggleVideosVisible() {
    if (!own || !myUserId) return;
    setVideosVisible((v) => {
      const next = !v;
      supabase.from("profiles").update({ videos_visible: next }).eq("id", myUserId);
      return next;
    });
  }

  function toggleBioVisible() {
    if (!own || !myUserId) return;
    setBioVisible((v) => {
      const next = !v;
      supabase.from("profiles").update({ bio_visible: next }).eq("id", myUserId);
      return next;
    });
  }

  function openComposer() {
    setComposerText("");
    setComposerImages([]);
    setComposerLocation("");
    setComposerTaggedIds([]);
    setComposerVisibility("public");
    setComposerVisibilityMenuOpen(false);
    setComposerLocationFieldVisible(false);
    setComposerPollBuilderVisible(false);
    setComposerPollQuestion("");
    setComposerPollOptions(["", ""]);
    setComposerPollOptionImages([null, null]);
    setComposerPollImageSheetTarget(null);
    setComposerVisible(true);
  }

  function toggleComposerPollOption(index: number, value: string) {
    setComposerPollOptions((prev) => prev.map((o, i) => (i === index ? value : o)));
  }

  function addComposerPollOption() {
    setComposerPollOptions((prev) => (prev.length >= 4 ? prev : [...prev, ""]));
    setComposerPollOptionImages((prev) => (prev.length >= 4 ? prev : [...prev, null]));
  }

  function removeComposerPollOption(index: number) {
    setComposerPollOptions((prev) => (prev.length <= 2 ? prev : prev.filter((_, i) => i !== index)));
    setComposerPollOptionImages((prev) => (prev.length <= 2 ? prev : prev.filter((_, i) => i !== index)));
  }

  function pickComposerPollOptionImage(index: number) {
    setComposerPollImageSheetTarget(index);
  }

  function removeComposerPollOptionImage(index: number) {
    setComposerPollOptionImages((prev) => prev.map((uri, i) => (i === index ? null : uri)));
  }

  async function takeComposerPollOptionPhoto() {
    const index = composerPollImageSheetTarget;
    setComposerPollImageSheetTarget(null);
    if (index === null) return;
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      showAlert(t("dm.permissionRequiredTitle"), t("dm.cameraPermissionRequiredBody"));
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.8 });
    if (result.canceled || !result.assets?.[0]) return;
    setComposerPollOptionImages((prev) => prev.map((uri, i) => (i === index ? result.assets[0].uri : uri)));
  }

  async function pickComposerPollOptionPhotoFromGallery() {
    const index = composerPollImageSheetTarget;
    setComposerPollImageSheetTarget(null);
    if (index === null) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      showAlert(t("dm.permissionRequiredTitle"), t("dm.permissionRequiredBody"));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.[0]) return;
    setComposerPollOptionImages((prev) => prev.map((uri, i) => (i === index ? result.assets[0].uri : uri)));
  }

  function confirmComposerPoll() {
    if (!composerHasValidPoll()) {
      showAlert(t("userProfile.pollMinOptionsTitle"), t("userProfile.pollMinOptionsBody"));
      return;
    }
    setComposerPollBuilderVisible(false);
  }

  function removeComposerPoll() {
    setComposerPollQuestion("");
    setComposerPollOptions(["", ""]);
    setComposerPollOptionImages([null, null]);
  }

  // Konum kutusu acildiginda cihazin GERCEK konumunu alip (RoomScreen.tsx
  // showMap'teki AYNI izin akisi) expo-location'in cihaz-ici (agsiz)
  // reverseGeocodeAsync'iyle okunabilir bir yer adina ceviriyoruz - ayri
  // bir harita servisi/API anahtari gerekmiyor.
  async function fetchComposerLocationLabel() {
    setComposerLocationLoading(true);
    setComposerLocation("");
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) return;
      const pos = await Location.getCurrentPositionAsync({});
      const results = await Location.reverseGeocodeAsync({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
      });
      const place = results[0];
      if (place) {
        const label = [place.district || place.subregion, place.city || place.region]
          .filter(Boolean)
          .join(", ");
        setComposerLocation(label || place.country || "");
      }
    } catch {
      // Konum alinamadi (izin reddedildi, GPS kapali vb.) - kutu bos kalir.
    } finally {
      setComposerLocationLoading(false);
    }
  }

  function toggleComposerLocationBox() {
    setComposerLocationFieldVisible((v) => {
      const next = !v;
      if (next) fetchComposerLocationLabel();
      return next;
    });
  }

  async function pickComposerImages() {
    if (composerImages.length >= 2) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      showAlert(t("dm.permissionRequiredTitle"), t("dm.permissionRequiredBody"));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      selectionLimit: 2 - composerImages.length,
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.length) return;
    setComposerImages((prev) => [...prev, ...result.assets.map((a) => a.uri)].slice(0, 2));
  }

  function removeComposerImage(uri: string) {
    setComposerImages((prev) => prev.filter((u) => u !== uri));
  }

  async function takeComposerPhoto() {
    if (composerImages.length >= 2) return;
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      showAlert(t("dm.permissionRequiredTitle"), t("dm.cameraPermissionRequiredBody"));
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    if (result.canceled || !result.assets?.[0]) return;
    setComposerImages((prev) => [...prev, result.assets[0].uri].slice(0, 2));
  }

  function toggleComposerTag(userId: string) {
    setComposerTaggedIds((prev) => (prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]));
  }

  // "Paylaş" - gallery fotograflarindaki uploadGalleryPhoto ile AYNI direkt
  // Supabase Storage yukleme deseni, sadece hedef bucket "post-images" ve
  // sonunda tek bir "posts" satiri ekleniyor (metin + en fazla 2 foto +
  // konum adi + etiketlenen kisi id'leri).
  function composerValidPollEntries() {
    return composerPollOptions
      .map((o, i) => ({ text: o.trim(), image: composerPollOptionImages[i] || null }))
      .filter((e) => e.text);
  }

  function composerValidPollOptions() {
    return composerValidPollEntries().map((e) => e.text);
  }

  function composerHasValidPoll() {
    return Boolean(composerPollQuestion.trim()) && composerValidPollOptions().length >= 2;
  }

  function composerHasContent() {
    return Boolean(composerText.trim()) || composerImages.length > 0 || composerHasValidPoll();
  }

  async function uploadComposerImage(uri: string): Promise<string> {
    const arrayBuffer = await uriToArrayBuffer(uri);
    const ext = uri.split(".").pop()?.toLowerCase().split("?")[0] || "jpg";
    const contentType = ext === "png" ? "image/png" : "image/jpeg";
    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const path = `${myUserId}/${fileName}`;
    const { error: uploadError } = await supabase.storage.from("post-images").upload(path, arrayBuffer, { contentType });
    if (uploadError) throw uploadError;
    const { data: publicUrlData } = supabase.storage.from("post-images").getPublicUrl(path);
    return publicUrlData.publicUrl;
  }

  async function submitPost() {
    if (!myUserId) return;
    const pollEntries = composerValidPollEntries();
    const hasValidPoll = composerHasValidPoll();
    if (!composerHasContent()) return;
    setPostingBusy(true);
    try {
      const imageUrls: string[] = [];
      for (const uri of composerImages) {
        imageUrls.push(await uploadComposerImage(uri));
      }
      const pollOptionImageUrls: (string | null)[] = [];
      if (hasValidPoll) {
        for (const entry of pollEntries) {
          pollOptionImageUrls.push(entry.image ? await uploadComposerImage(entry.image) : null);
        }
      }
      const { data: row, error: insertError } = await supabase
        .from("posts")
        .insert({
          user_id: myUserId,
          text: composerText.trim() || null,
          image_urls: imageUrls,
          location_name: composerLocation.trim() || null,
          tagged_user_ids: composerTaggedIds,
          poll_question: hasValidPoll ? composerPollQuestion.trim() : null,
          poll_options: hasValidPoll ? pollEntries.map((e) => e.text) : null,
          poll_option_images: hasValidPoll ? pollOptionImageUrls : null,
        })
        .select("id,user_id,text,image_urls,location_name,tagged_user_ids,poll_question,poll_options,poll_option_images,created_at")
        .single();
      if (insertError) throw insertError;
      setPosts((prev) => [rowToPost(row), ...prev]);
      if (composerTaggedIds.length) {
        setProfileCache((prev) => {
          const next = { ...prev };
          for (const id of composerTaggedIds) {
            const friend = composerFriends.find((f) => f.userId === id);
            if (friend) next[id] = { name: friend.name, handle: next[id]?.handle || "", avatarUrl: next[id]?.avatarUrl || "" };
          }
          return next;
        });
      }
      setComposerVisible(false);
    } catch (err: any) {
      showAlert(t("userProfile.postFailedTitle"), err?.message || t("userProfile.postFailedBody"));
    } finally {
      setPostingBusy(false);
    }
  }

  function confirmDeletePost(post: Post) {
    if (!own) return;
    showAlert(t("userProfile.deletePostTitle"), t("userProfile.deletePostBody"), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("userProfile.delete"), style: "destructive", onPress: () => deletePost(post) },
    ]);
  }

  async function deletePost(post: Post) {
    setPosts((prev) => prev.filter((p) => p.id !== post.id));
    await supabase.from("posts").delete().eq("id", post.id);
    for (const url of post.imageUrls) {
      const path = url.split("/post-images/")[1]?.split("?")[0];
      if (path) await supabase.storage.from("post-images").remove([path]);
    }
  }


  const initial = name.charAt(0).toUpperCase();
  const historyList =
    historyTab === "liked" ? likedHistory : historyTab === "best" ? [...history].sort((a, b) => b.participantCount - a.participantCount) : history;

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        onScroll={(e) => setScrollY(e.nativeEvent.contentOffset.y)}
        scrollEventThrottle={16}
      >
        <View style={[styles.topBlock, !(own || bannerUrl) && styles.topBlockNoBanner]}>
        {/* Kapak fotografi ekranin en ustunden (ScrollView'in dolgusu olmadan)
            baslasin diye bu satir artik akisin icinde yer kaplamiyor - geri/
            diger butonu banner'in UZERINE mutlak konumlu olarak biniyor.
            "Profil" TAB'i olarak (own=true) kullanildiginda onBack hic
            verilmez - donulecek bir "geri" hedefi olmadigi icin (kalici
            bir sekme) ok hic gosterilmiyor (bkz. RootNavigator.tsx
            MyProfileRoute). Baska birinin profili (own=false, disaridaki
            Stack) ya da eski kullanim yerlerinde onBack hep verilir. */}
        {(onBack || !own) && (
          <View style={styles.header}>
            {onBack ? (
              <TouchableOpacity style={styles.bannerActionButton} onPress={onBack} hitSlop={10}>
                <ChevronLeft size={22} color={TEXT} strokeWidth={3} />
              </TouchableOpacity>
            ) : (
              <View />
            )}
            {!own && (
              <TouchableOpacity style={styles.bannerActionButton} onPress={() => placeholder(t("userProfile.more"))} hitSlop={10}>
                <Icon name="moreHoriz" size={22} color={TEXT} />
              </TouchableOpacity>
            )}
          </View>
        )}

        {(own || bannerUrl) && (
          <View style={[styles.bannerWrap, !bannerUrl && styles.bannerWrapEmpty]}>
            {bannerUrl && <Image source={{ uri: bannerUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />}
            {own && (
              <View style={styles.bannerActionsRow}>
                <TouchableOpacity style={styles.bannerActionButton} onPress={openComposer} hitSlop={6}>
                  <Plus size={18} color={TEXT} strokeWidth={3} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.bannerActionButton}
                  onPress={() => (onOpenSettings ? onOpenSettings() : placeholder(t("tabs.settings")))}
                  hitSlop={6}
                >
                  <Icon name="settings" size={18} color={TEXT} />
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {/* Banner'in alt kenarindaki yuvarlak "kabarti" - pp'den BUYUK,
            pp'nin tam ortasinda. Üst yarisi banner'in icini oyuyor gibi
            gorunur, alt yarisi zaten govdeyle AYNI arkaplani gosterdigi
            icin govdeye kesintisiz karisir. */}
        {(own || bannerUrl) && (
          <View
            pointerEvents="none"
            style={[styles.bannerNotch, { left: NOTCH_X, top: NOTCH_Y }]}
          >
            <View
              style={[styles.avatarBgWindow, { left: -NOTCH_X, top: -NOTCH_Y + scrollY }]}
            >
              <AppBackground />
            </View>
          </View>
        )}

        {/* PP (fotograf/bas harf icerigi) gecici olarak kaldirildi, ama
            CERCEVE kullanicinin istegiyle banner uzerinde KALMALI. Cerceve
            ve ic ayri renkler (beyaz cerceve + degrade ic) DEGIL - tek bir
            daire, ucdan uca Discover ile AYNI paylasilan arkaplana
            (App.tsx'teki AppBackground degradesi) tabi. */}
        <TouchableOpacity
          style={[styles.avatarSquareWrap, (own || bannerUrl) && styles.avatarSquareOverlap]}
          activeOpacity={avatarUrl || own ? 0.8 : 1}
          onPress={() => (avatarUrl ? setViewingPhotoUrl(avatarUrl) : own && setAvatarSheetVisible(true))}
          onLongPress={() => own && setAvatarSheetVisible(true)}
          delayLongPress={350}
          disabled={!avatarUrl && !own}
        >
          <View style={styles.avatarSquareCore}>
            {/* Fotograf/bas harf YOKKEN (uploadingAvatar da degilken) bu
                arkaplan penceresi gorunur kalir - fotograf gelince onun
                UZERINE biner, tamamen kapatir. */}
            <View
              style={[
                styles.avatarBgWindow,
                { left: -AVATAR_SCREEN_X, top: -AVATAR_SCREEN_Y + scrollY },
              ]}
            >
              <AppBackground />
            </View>
            {uploadingAvatar ? (
              <ActivityIndicator color={ACCENT} />
            ) : avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
            ) : (
              // Pp henuz eklenmediyse - Discover'daki (RoomCard/Avatar.tsx)
              // isimden sabit renk + beyaz bas harf yedegiyle AYNI gorunum.
              <View style={[styles.avatarFallback, { backgroundColor: colorForName(name) }]}>
                <Text style={styles.avatarInitial}>{initial}</Text>
              </View>
            )}
          </View>
        </TouchableOpacity>

        <View style={styles.nameBlockLeft}>
          {editingField === "name" ? (
            <TextInput
              style={styles.nameInputLeft}
              value={name}
              onChangeText={setName}
              autoFocus
              onSubmitEditing={() => closeFieldEdit("name", name)}
              onBlur={() => closeFieldEdit("name", name)}
            />
          ) : (
            <TouchableOpacity disabled={!own} onPress={() => toggleFieldEdit("name")}>
              <View style={styles.nameRow}>
                <Text style={styles.name}>{name.toUpperCase()}</Text>
                {isPremium && <PremiumBadge size={19} />}
              </View>
            </TouchableOpacity>
          )}
          {editingField === "handle" ? (
            <View style={styles.handleEditRow}>
              <Text style={styles.handleAt}>@</Text>
              <TextInput
                style={styles.handleInput}
                value={handle}
                onChangeText={(v) => setHandle(v.toLowerCase())}
                autoFocus
                onSubmitEditing={() => closeFieldEdit("handle", handle)}
                onBlur={() => closeFieldEdit("handle", handle)}
                autoCapitalize="none"
              />
            </View>
          ) : (
            <TouchableOpacity disabled={!own} onPress={() => toggleFieldEdit("handle")}>
              <View style={[styles.handleRow, { alignItems: "flex-start", gap: 0 }]}>
                <Text style={[styles.handle, styles.handleAtNudge]}>@</Text>
                <Text style={styles.handle}>{handle.toUpperCase()}</Text>
              </View>
            </TouchableOpacity>
          )}

          {(own || (bioVisible && bio.trim().length > 0)) &&
            (editingField === "bio" ? (
              <View>
                <TextInput
                  style={styles.bioInputLeft}
                  value={bio}
                  onChangeText={setBio}
                  multiline
                  autoFocus
                  placeholder={t("userProfile.bioPlaceholder")}
                  placeholderTextColor={MUTED}
                />
                <TouchableOpacity style={styles.bioSaveButton} onPress={() => closeFieldEdit("bio", bio)}>
                  <Text style={styles.bioSaveButtonText}>{t("userProfile.save")}</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity disabled={!own} onPress={() => toggleFieldEdit("bio")}>
                <Text style={bio ? styles.bioLeft : own ? styles.emptyHistoryText : undefined}>
                  {bio || (own ? t("userProfile.noBio") : "")}
                </Text>
              </TouchableOpacity>
            ))}

          {(own || profileLocation) &&
            (editingField === "profile_location" ? (
              <View style={styles.metaRow}>
                <View style={styles.metaIconNudge}>
                  <Icon name="pin" size={12} color={MUTED} />
                </View>
                <TextInput
                  style={styles.metaInput}
                  value={profileLocation}
                  onChangeText={setProfileLocation}
                  autoFocus
                  autoCapitalize="characters"
                  onSubmitEditing={() => closeFieldEdit("profile_location", profileLocation)}
                  onBlur={() => closeFieldEdit("profile_location", profileLocation)}
                  placeholder={t("userProfile.locationFieldPlaceholder")}
                  placeholderTextColor={MUTED}
                />
              </View>
            ) : (
              <TouchableOpacity disabled={!own} onPress={() => toggleFieldEdit("profile_location")} style={styles.metaRow}>
                <View style={styles.metaIconNudge}>
                  <Icon name="pin" size={12} color={MUTED} />
                </View>
                <Text style={styles.metaText}>
                  {(profileLocation || (own ? t("userProfile.locationFieldPlaceholder") : "")).toUpperCase()}
                </Text>
              </TouchableOpacity>
            ))}

          {joinDateMs != null && (own || statVisibility.joinDate !== false) && (
            <View style={styles.metaRow}>
              <View style={styles.metaIconNudge}>
                <Icon name="calendar" size={12} color={MUTED} />
              </View>
              <Text style={styles.metaText}>{t("userProfile.joinedOn", { date: formatDate(joinDateMs, i18n.language) })}</Text>
            </View>
          )}

          {(own || birthday) &&
            (editingField === "birthday" ? (
              <View style={styles.metaRow}>
                <Gift size={12} color={MUTED} />
                <TextInput
                  style={styles.metaInput}
                  value={birthday}
                  onChangeText={setBirthday}
                  autoFocus
                  onSubmitEditing={() => closeFieldEdit("birthday", birthday)}
                  onBlur={() => closeFieldEdit("birthday", birthday)}
                  placeholder={t("userProfile.birthdayPlaceholder")}
                  placeholderTextColor={MUTED}
                />
              </View>
            ) : (
              <TouchableOpacity disabled={!own} onPress={() => toggleFieldEdit("birthday")} style={styles.metaRow}>
                <Gift size={12} color={MUTED} />
                <Text style={[styles.metaText, { marginTop: 3 }]}>
                  {birthday ? t("userProfile.birthdayOn", { date: birthday }) : own ? t("userProfile.birthdayPlaceholder") : ""}
                </Text>
              </TouchableOpacity>
            ))}
        </View>

        {own ? (
          <View style={styles.ownActionRow}>
            <TouchableOpacity style={styles.pillOutlineButton} onPress={() => placeholder(t("userProfile.share"))}>
              <LinearGradient colors={[ACCENT, "#FFFFFF"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.pillGradientBorder}>
                <View style={styles.pillInner}>
                  <Text style={styles.pillOutlineButtonText}>{t("userProfile.share").toUpperCase()}</Text>
                </View>
              </LinearGradient>
            </TouchableOpacity>
            <TouchableOpacity style={styles.pillOutlineButton} onPress={() => setEditProfileVisible(true)}>
              <LinearGradient colors={[ACCENT, "#FFFFFF"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.pillGradientBorder}>
                <View style={styles.pillInner}>
                  <Text style={styles.pillOutlineButtonText}>{t("userProfile.editProfile").toUpperCase()}</Text>
                </View>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.actionRow}>
            {friendStatus === "friends" ? (
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={() =>
                  onOpenDM
                    ? onOpenDM({ userId: peerUserId, name, handle })
                    : placeholder(t("userProfile.message"))
                }
              >
                <Text style={styles.primaryButtonText}>{t("userProfile.message")}</Text>
              </TouchableOpacity>
            ) : friendStatus === "pending" ? (
              <TouchableOpacity style={styles.secondaryButton} onPress={cancelFriendRequest}>
                <Text style={styles.secondaryButtonText}>{t("userProfile.cancelRequest")}</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.requestButton} onPress={sendFriendRequest}>
                <Text style={styles.requestButtonText}>{t("userProfile.sendRequest")}</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        <View style={styles.topTabsRow}>
          {(
            [
              { key: "posts", icon: Newspaper },
              { key: "tagged", icon: Tag },
              { key: "history", icon: HistoryIcon },
              { key: "liked", icon: Heart },
            ] as const
          ).map((tab) => (
            <TouchableOpacity
              key={tab.key}
              style={styles.topTabTouch}
              onPress={() => setTopTab(tab.key)}
            >
              <tab.icon size={20} color={topTab === tab.key ? TEXT : MUTED} />
            </TouchableOpacity>
          ))}
        </View>
        <LinearGradient colors={[ACCENT, "#FFFFFF"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.topTabsBottomBar} />
        </View>
        <View style={styles.bodyContent}>
        {topTab === "posts" && (
          <>
            {(own || postsVisible) ? (
              posts.length === 0 ? (
                <Text style={[styles.emptyHistoryText, { marginTop: 14, textAlign: "center" }]}>{t("userProfile.noPosts")}</Text>
              ) : (
                <View>
                  {posts.map((post, i) => (
                    <React.Fragment key={post.id}>
                      {i > 0 && <View style={styles.postDivider} />}
                      <PostCard
                        postId={post.id}
                        avatarUrl={profileCache[post.userId]?.avatarUrl || avatarUrl}
                        initial={(profileCache[post.userId]?.name || name).charAt(0).toUpperCase()}
                        name={profileCache[post.userId]?.name || name}
                        handle={profileCache[post.userId]?.handle || handle}
                        timeLabel={timeAgo(post.createdAt, t, i18n.language)}
                        text={post.text}
                        imageUrls={post.imageUrls}
                        locationName={post.locationName}
                        taggedNames={post.taggedUserIds.map((id) => profileCache[id]?.name).filter(Boolean) as string[]}
                        pollQuestion={post.pollQuestion}
                        pollOptions={post.pollOptions}
                        pollOptionImages={post.pollOptionImages}
                        currentUserId={myUserId}
                        onPressImage={setViewingPhotoUrl}
                        onLongPress={own ? () => confirmDeletePost(post) : undefined}
                      />
                    </React.Fragment>
                  ))}
                </View>
              )
            ) : (
              <Text style={[styles.emptyHistoryText, { marginTop: 14, textAlign: "center" }]}>{t("userProfile.noPosts")}</Text>
            )}
          </>
        )}

        {topTab === "tagged" && (
          taggedPosts.length === 0 ? (
            <Text style={[styles.emptyHistoryText, { marginTop: 14 }]}>{t("userProfile.noTaggedPosts")}</Text>
          ) : (
            <View>
              {taggedPosts.map((post, i) => (
                <React.Fragment key={post.id}>
                  {i > 0 && <View style={styles.postDivider} />}
                  <PostCard
                    postId={post.id}
                    avatarUrl={profileCache[post.userId]?.avatarUrl || ""}
                    initial={(profileCache[post.userId]?.name || "?").charAt(0).toUpperCase()}
                    name={profileCache[post.userId]?.name || "—"}
                    handle={profileCache[post.userId]?.handle || ""}
                    timeLabel={timeAgo(post.createdAt, t, i18n.language)}
                    text={post.text}
                    imageUrls={post.imageUrls}
                    locationName={post.locationName}
                    taggedNames={post.taggedUserIds.map((id) => profileCache[id]?.name).filter(Boolean) as string[]}
                    pollQuestion={post.pollQuestion}
                    pollOptions={post.pollOptions}
                    pollOptionImages={post.pollOptionImages}
                    currentUserId={myUserId}
                    onPressImage={setViewingPhotoUrl}
                  />
                </React.Fragment>
              ))}
            </View>
          )
        )}

        {topTab === "history" && (own || videosVisible) && (
          <>
            <View style={styles.historyTabsRow}>
              {(
                [
                  { key: "history", label: t("userProfile.tabHistory") },
                  { key: "best", label: t("userProfile.tabBest") },
                ] as const
              ).map((tab) => (
                <TouchableOpacity
                  key={tab.key}
                  onPress={() => setHistoryTab(tab.key)}
                  style={[styles.historyTabTouch, historyTab === tab.key && styles.historyTabTouchActive]}
                >
                  <Text style={[styles.historyTabText, historyTab === tab.key && styles.historyTabTextActive]}>
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {historyList.length === 0 ? (
              <Text style={[styles.emptyHistoryText, { marginTop: 14 }]}>{t("userProfile.noJoinedRooms")}</Text>
            ) : (
              <View style={styles.videoGrid}>
                {historyList.map((item) => (
                  <TouchableOpacity key={`v-${item.eventId}`} style={styles.videoCard} onPress={() => openHistoryVideo(item)}>
                    <View style={styles.videoThumb}>
                      {item.mediaCoverUrl ? (
                        <Image source={{ uri: item.mediaCoverUrl }} style={styles.videoThumbImage} />
                      ) : (
                        <View style={styles.videoPlayBadge}>
                          <Icon name="play" size={11} color={TEXT} />
                        </View>
                      )}
                    </View>
                    <Text style={styles.videoTitle} numberOfLines={2}>
                      {item.mediaLabel}
                    </Text>
                    <Text style={styles.videoMeta}>
                      {historyTab === "best" ? t("userProfile.peopleCount", { count: item.participantCount }) : timeAgo(item.createdAt, t, i18n.language)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </>
        )}

        {topTab === "liked" && (own || videosVisible) && (
          likedHistory.length === 0 ? (
            <Text style={[styles.emptyHistoryText, { marginTop: 14 }]}>{t("userProfile.noLikedVideos")}</Text>
          ) : (
            <View style={styles.videoGrid}>
              {likedHistory.map((item) => (
                <TouchableOpacity key={`v-${item.eventId}`} style={styles.videoCard} onPress={() => openHistoryVideo(item)}>
                  <View style={styles.videoThumb}>
                    {item.mediaCoverUrl ? (
                      <Image source={{ uri: item.mediaCoverUrl }} style={styles.videoThumbImage} />
                    ) : (
                      <View style={styles.videoPlayBadge}>
                        <Icon name="play" size={11} color={TEXT} />
                      </View>
                    )}
                  </View>
                  <Text style={styles.videoTitle} numberOfLines={2}>
                    {item.mediaLabel}
                  </Text>
                  <Text style={styles.videoMeta}>{timeAgo(item.createdAt, t, i18n.language)}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )
        )}

        {activeRoom && (
          <>
            <View style={styles.fullDivider} />
            <Text style={styles.sectionHeader}>{t("userProfile.sectionActiveRoom")}</Text>
            <View style={styles.fullDivider} />
            <RoomCard
              room={activeRoom}
              onPress={() => onOpenRoomPreview?.(activeRoom)}
              style={styles.activeRoomCard}
            />
          </>
        )}

        </View>
      </ScrollView>

      <Modal
        visible={composerVisible}
        animationType="slide"
        onRequestClose={() => setComposerVisible(false)}
        statusBarTranslucent
      >
        <View style={styles.composerScreen}>
          <AppBackground />
          <View style={styles.composerHeaderRow}>
            <TouchableOpacity onPress={() => setComposerVisible(false)} hitSlop={10} style={styles.editHeaderSideButton}>
              <View style={{ transform: [{ rotate: "90deg" }] }}>
                <CircleArrowDown size={22} color="#FFFFFF" />
              </View>
            </TouchableOpacity>
            <Text style={[styles.editHeaderTitle, editHeaderFontLoaded && styles.editHeaderTitleFontLoaded]}>
              {t("userProfile.newPost")}
            </Text>
            <TouchableOpacity
              onPress={submitPost}
              disabled={postingBusy || !composerHasContent()}
              hitSlop={10}
              style={styles.editHeaderSideButton}
            >
              {postingBusy ? (
                <ActivityIndicator color={ACCENT} size="small" />
              ) : (
                <View style={{ transform: [{ rotate: "180deg" }] }}>
                  <CircleArrowDown size={22} color={composerHasContent() ? "#FFFFFF" : MUTED} />
                </View>
              )}
            </TouchableOpacity>
          </View>

          <View
            style={[
              styles.composerVisibilityWrap,
              { position: "relative", zIndex: composerVisibilityMenuOpen ? 20 : 1 },
            ]}
          >
            <LinearGradient
              colors={[ACCENT, "#FFFFFF"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.composerVisibilityGradientBorder}
            >
              <TouchableOpacity
                style={styles.composerVisibilityPill}
                onPress={() => setComposerVisibilityMenuOpen((v) => !v)}
              >
                {composerVisibility === "public" ? (
                  <WorldIcon size={16} color="#FFFFFF" />
                ) : composerVisibility === "private" ? (
                  <PrivacyLockIcon size={16} color="#FFFFFF" />
                ) : (
                  <Users size={16} color="#FFFFFF" />
                )}
                <Text style={styles.composerVisibilityPillText}>
                  {(composerVisibility === "public"
                    ? t("userProfile.visibilityPublic")
                    : composerVisibility === "private"
                    ? t("userProfile.visibilityPrivate")
                    : t("userProfile.visibilityFriends")
                  ).toUpperCase()}
                </Text>
                <View style={{ marginTop: 1 }}>
                  <ChevronDown size={14} color="#FFFFFF" />
                </View>
              </TouchableOpacity>
            </LinearGradient>
            {composerVisibilityMenuOpen && (
              <View style={[styles.visibilityMenu, styles.composerVisibilityMenuPos]}>
                {(
                  [
                    { key: "public" as const, label: t("userProfile.visibilityPublic"), VisIcon: WorldIcon, iconOffset: -2 },
                    { key: "private" as const, label: t("userProfile.visibilityPrivate"), VisIcon: PrivacyLockIcon, iconOffset: -2, textOffset: 2 },
                    { key: "friends" as const, label: t("userProfile.visibilityFriends"), VisIcon: Users, iconOffset: -4 },
                  ]
                ).map((opt) => (
                  <TouchableOpacity
                    key={opt.key}
                    style={[styles.visibilityMenuRow, composerVisibility === opt.key && styles.visibilityMenuRowActive]}
                    onPress={() => {
                      setComposerVisibility(opt.key);
                      setComposerVisibilityMenuOpen(false);
                    }}
                  >
                    <View style={{ marginTop: opt.iconOffset }}>
                      <opt.VisIcon size={16} color={composerVisibility === opt.key ? "#fff" : MUTED} />
                    </View>
                    <Text
                      style={[
                        styles.visibilityMenuRowText,
                        { marginTop: opt.textOffset },
                        composerVisibility === opt.key && styles.visibilityMenuRowTextActive,
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          <ScrollView style={styles.composerBody} keyboardShouldPersistTaps="handled">
            <TextInput
              style={styles.composerFullInput}
              value={composerText}
              onChangeText={setComposerText}
              multiline
              autoFocus
              placeholder={t("userProfile.postTextPlaceholder")}
              placeholderTextColor={MUTED}
            />

            {composerImages.length > 0 && (
              <View style={styles.composerImageRow}>
                {composerImages.map((uri) => (
                  <View key={uri} style={styles.composerImageWrap}>
                    <Image source={{ uri }} style={styles.composerImage} />
                    <TouchableOpacity style={styles.composerImageRemove} onPress={() => removeComposerImage(uri)}>
                      <Text style={styles.composerImageRemoveText}>×</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            {composerLocationFieldVisible && (
              <View style={styles.composerLocationBox}>
                <View style={styles.composerLocationMapTile}>
                  <Image
                    source={require("../../assets/images/location-map-tile.png")}
                    style={{ width: 60, height: 60, position: "absolute" }}
                    resizeMode="contain"
                  />
                  <View style={{ zIndex: 1 }}>
                    <MapPin size={28} color="#FFFFFF" />
                  </View>
                </View>
                <View style={styles.composerLocationTextWrap}>
                  {composerLocationLoading ? (
                    <ActivityIndicator color={ACCENT} size="small" />
                  ) : (
                    <Text style={styles.composerLocationText} numberOfLines={2}>
                      {composerLocation || t("userProfile.locationUnavailable")}
                    </Text>
                  )}
                </View>
                <TouchableOpacity
                  style={styles.composerLocationCloseButton}
                  onPress={() => setComposerLocationFieldVisible(false)}
                  hitSlop={8}
                >
                  <Text style={styles.composerImageRemoveText}>×</Text>
                </TouchableOpacity>
              </View>
            )}

            {composerHasValidPoll() && !composerPollBuilderVisible && (
              <View style={styles.composerPollPreviewBox}>
                <View style={styles.composerPollPreviewIconWrap}>
                  <ChartBar size={20} color="#FFFFFF" />
                </View>
                <View style={styles.composerLocationTextWrap}>
                  <Text style={styles.composerLocationText} numberOfLines={1}>
                    {composerPollQuestion}
                  </Text>
                  <Text style={styles.composerPollPreviewSubtext}>
                    {composerValidPollOptions().length} seçenek
                  </Text>
                </View>
                <View style={styles.composerPollPreviewActions}>
                  <TouchableOpacity
                    style={styles.composerPollPreviewActionButton}
                    onPress={() => setComposerPollBuilderVisible(true)}
                    hitSlop={8}
                  >
                    <Pencil size={14} color={MUTED} />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.composerPollPreviewActionButton} onPress={removeComposerPoll} hitSlop={8}>
                    <Text style={[styles.composerImageRemoveText, { color: MUTED }]}>×</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {composerTaggedIds.length > 0 && (
              <View style={styles.composerTaggedPreviewRow}>
                {composerTaggedIds.map((id) => {
                  const friend = composerFriends.find((f) => f.userId === id);
                  if (!friend) return null;
                  return (
                    <LinearGradient
                      key={id}
                      colors={[ACCENT, "#FFFFFF"]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.composerTaggedPillGradientBorder}
                    >
                      <View style={styles.composerTaggedPill}>
                        <Avatar name={friend.name} avatarUrl={friend.avatarUrl} size={20} />
                        <Text style={styles.composerTaggedPillText}>{friend.name}</Text>
                        <TouchableOpacity onPress={() => toggleComposerTag(id)} hitSlop={8}>
                          <Text style={styles.composerTaggedPillRemoveText}>×</Text>
                        </TouchableOpacity>
                      </View>
                    </LinearGradient>
                  );
                })}
              </View>
            )}
          </ScrollView>

          <LinearGradient colors={[ACCENT, "#FFFFFF"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.composerBottomBarDivider} />
          <View style={styles.composerBottomBar}>
            <TouchableOpacity onPress={pickComposerImages} disabled={composerImages.length >= 2} hitSlop={8}>
              <ImageIcon size={26} color="#FFFFFF" />
            </TouchableOpacity>
            <TouchableOpacity onPress={takeComposerPhoto} disabled={composerImages.length >= 2} hitSlop={8}>
              <Image
                source={require("../../assets/icons/video-camera-bold.png")}
                style={{ width: 22, height: 22, tintColor: "#FFFFFF" }}
                resizeMode="contain"
              />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setComposerPollBuilderVisible(true)} hitSlop={8}>
              <ChartBar size={26} color="#FFFFFF" />
            </TouchableOpacity>
            <TouchableOpacity onPress={toggleComposerLocationBox} hitSlop={8}>
              <MapPin size={24} color="#FFFFFF" />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setComposerTagPickerVisible(true)} hitSlop={8}>
              <Tag size={24} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={composerTagPickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setComposerTagPickerVisible(false)}
      >
        <TouchableOpacity
          style={styles.sheetOverlay}
          activeOpacity={1}
          onPress={() => setComposerTagPickerVisible(false)}
        >
          <TouchableOpacity activeOpacity={1} style={[styles.sheetCard, styles.tagPickerSheetCard]}>
            <View style={styles.sheetHandle} />
            {composerFriends.length === 0 ? (
              <Text style={[styles.emptyHistoryText, { padding: 16 }]}>{t("userProfile.noFriendsToTag")}</Text>
            ) : (
              composerFriends.map((friend) => {
                const checked = composerTaggedIds.includes(friend.userId);
                return (
                  <TouchableOpacity
                    key={friend.userId}
                    style={[styles.sheetRow, styles.tagPickerRow, checked && styles.tagPickerRowChecked]}
                    onPress={() => toggleComposerTag(friend.userId)}
                  >
                    <View style={styles.tagPickerNameWrap}>
                      <Avatar name={friend.name} avatarUrl={friend.avatarUrl} size={46} />
                      <View>
                        <Text style={styles.sheetRowText}>{friend.name}</Text>
                        {!!friend.handle && (
                          <View style={styles.tagPickerHandleRow}>
                            <Text style={styles.tagPickerHandle}>@</Text>
                            <Text style={[styles.tagPickerHandle, styles.tagPickerHandleLetters]}>{friend.handle}</Text>
                          </View>
                        )}
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
            <TouchableOpacity style={styles.sheetRow} onPress={() => setComposerTagPickerVisible(false)}>
              <Text style={[styles.sheetRowText, styles.tagPickerDoneText]}>{t("userProfile.tagPeopleDone").toLocaleUpperCase("tr")}</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <Modal
        visible={composerPollBuilderVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setComposerPollBuilderVisible(false)}
      >
        <TouchableOpacity style={styles.sheetOverlay} activeOpacity={1} onPress={() => setComposerPollBuilderVisible(false)}>
          <TouchableOpacity activeOpacity={1} style={[styles.sheetCard, styles.pollBuilderCard]}>
            <View style={[styles.sheetHandle, { alignSelf: "center" }]} />
            <Text style={[styles.pollBuilderTitleText, editHeaderFontLoaded && styles.pollBuilderTitleTextFontLoaded]}>
              {t("userProfile.pollBuilderTitle")}
            </Text>
            <TextInput
              style={styles.pollQuestionInput}
              placeholder={t("userProfile.pollQuestionPlaceholder")}
              placeholderTextColor={MUTED}
              value={composerPollQuestion}
              onChangeText={setComposerPollQuestion}
              maxLength={140}
            />
            {composerPollOptions.map((opt, index) => (
              <View key={index} style={styles.pollOptionRow}>
                <TouchableOpacity onPress={() => pickComposerPollOptionImage(index)} style={styles.pollOptionImageButton}>
                  {composerPollOptionImages[index] ? (
                    <>
                      <Image source={{ uri: composerPollOptionImages[index]! }} style={styles.pollOptionImage} />
                      <TouchableOpacity
                        style={styles.pollOptionImageRemove}
                        onPress={() => removeComposerPollOptionImage(index)}
                        hitSlop={8}
                      >
                        <Text style={[styles.composerImageRemoveText, { fontSize: 10, lineHeight: 11 }]}>×</Text>
                      </TouchableOpacity>
                    </>
                  ) : (
                    <Camera size={16} color={MUTED} />
                  )}
                </TouchableOpacity>
                <TextInput
                  style={styles.pollOptionInput}
                  placeholder={t("userProfile.pollOptionPlaceholder", { index: index + 1 })}
                  placeholderTextColor={MUTED}
                  value={opt}
                  onChangeText={(v) => toggleComposerPollOption(index, v)}
                  maxLength={60}
                />
                {composerPollOptions.length > 2 && (
                  <TouchableOpacity onPress={() => removeComposerPollOption(index)} hitSlop={8}>
                    <Text style={styles.composerImageRemoveText}>×</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}
            {composerPollOptions.length < 4 && (
              <TouchableOpacity style={styles.pollAddOptionButton} onPress={addComposerPollOption}>
                <Icon name="plus" size={16} color="#FFFFFF" />
                <Text style={styles.pollAddOptionText}>{t("userProfile.pollAddOption")}</Text>
              </TouchableOpacity>
            )}
            <View style={styles.pollBuilderFooterRow}>
              <LinearGradient
                colors={[ACCENT, "#6B7280"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.pollBuilderAddGradientBorder}
              >
                <TouchableOpacity style={styles.pollBuilderAddButton} onPress={() => setComposerPollBuilderVisible(false)}>
                  <Text style={[styles.pollBuilderAddText, styles.pollBuilderCancelTextColor]}>{t("common.cancel")}</Text>
                </TouchableOpacity>
              </LinearGradient>
              <LinearGradient
                colors={[ACCENT, "#FFFFFF"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.pollBuilderAddGradientBorder}
              >
                <TouchableOpacity style={styles.pollBuilderAddButton} onPress={confirmComposerPoll}>
                  <Text style={styles.pollBuilderAddText}>{t("userProfile.pollAddButton")}</Text>
                </TouchableOpacity>
              </LinearGradient>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <Modal
        visible={composerPollImageSheetTarget !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setComposerPollImageSheetTarget(null)}
        statusBarTranslucent
      >
        <TouchableOpacity
          style={styles.sheetOverlay}
          activeOpacity={1}
          onPress={() => setComposerPollImageSheetTarget(null)}
        >
          <DragToCloseSheet onClose={() => setComposerPollImageSheetTarget(null)}>
            <TouchableOpacity activeOpacity={1} style={styles.sheetCard}>
              <View style={styles.sheetHandle} />
              <TouchableOpacity style={styles.sheetRow} onPress={takeComposerPollOptionPhoto}>
                <Text style={styles.sheetRowText}>{t("userProfile.takePhoto")}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.sheetRow} onPress={pickComposerPollOptionPhotoFromGallery}>
                <Text style={styles.sheetRowText}>{t("userProfile.bannerPhotoPick")}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.sheetRow, styles.sheetRowLast]}
                onPress={() => setComposerPollImageSheetTarget(null)}
              >
                <Text style={[styles.sheetRowText, styles.sheetCancelText]}>{t("common.close")}</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          </DragToCloseSheet>
        </TouchableOpacity>
      </Modal>

      {/* Tam ekran "Profili Duzenle" sayfasi - banner/pp/alanlar hepsi TEK
          sayfada, PROFILI DUZENLE butonuyla acilir. Alan duzenleme AYNI
          editingField/persistField akisini kullanir - isim/kullanici adi/
          biyografi/konum/dogum tarihi burada HER ZAMAN dogrudan yazilabilir
          input olarak gosterilir (ayrica tiklama gerekmez), onBlur'da
          kaydedilir. */}
      <Modal
        visible={editProfileVisible}
        animationType="slide"
        onRequestClose={() => setEditProfileVisible(false)}
        statusBarTranslucent
      >
        <View style={styles.editScreen}>
          <AppBackground />
          <ScrollView contentContainerStyle={styles.editScrollContent} keyboardShouldPersistTaps="handled">
            <View style={styles.editHeader}>
              <TouchableOpacity onPress={() => setEditProfileVisible(false)} hitSlop={10} style={styles.editHeaderSideButton}>
                <View style={{ transform: [{ rotate: "90deg" }] }}>
                  <CircleArrowDown size={22} color="#FFFFFF" />
                </View>
              </TouchableOpacity>
              <Text style={[styles.editHeaderTitle, editHeaderFontLoaded && styles.editHeaderTitleFontLoaded]}>
                {t("userProfile.editProfile")}
              </Text>
              <TouchableOpacity
                onPress={() => placeholder(t("userProfile.editProfile"))}
                hitSlop={10}
                style={styles.editHeaderSideButton}
              >
                <CircleArrowDown size={22} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            <View style={[styles.editBannerWrap, !bannerUrl && styles.bannerWrapEmpty]}>
              {bannerUrl && <Image source={{ uri: bannerUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />}
              {uploadingBanner && (
                <View style={[StyleSheet.absoluteFill, styles.bannerUploadingOverlay]}>
                  <ActivityIndicator color="#fff" />
                </View>
              )}
              <TouchableOpacity style={styles.editBannerCameraButton} onPress={() => setBannerSheetVisible(true)}>
                <Camera size={18} color="#fff" />
              </TouchableOpacity>
            </View>

            <View style={styles.editAvatarWrap}>
              <View style={styles.editAvatarCore}>
                {avatarUrl ? (
                  <Image source={{ uri: avatarUrl }} style={styles.editAvatarImage} />
                ) : (
                  <View style={[styles.avatarFallback, { backgroundColor: colorForName(name) }]}>
                    <Text style={styles.avatarInitial}>{initial}</Text>
                  </View>
                )}
              </View>
              <TouchableOpacity style={styles.editAvatarCameraButton} onPress={() => setAvatarSheetVisible(true)}>
                <Camera size={20} color="#fff" />
              </TouchableOpacity>
            </View>

            <View style={styles.editFieldsWrap}>
              <View style={styles.editField}>
                <Text style={styles.editFieldLabel}>{t("userProfile.editProfileDisplayName").toUpperCase()}</Text>
                <TextInput
                  style={styles.editFieldInput}
                  value={name}
                  onChangeText={setName}
                  onBlur={() => persistField("name", name)}
                />
                <LinearGradient colors={[ACCENT, "#FFFFFF"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.editFieldDivider} />
              </View>

              <View style={styles.editField}>
                <Text style={styles.editFieldLabel}>{t("userProfile.editProfileUsername").toUpperCase()}</Text>
                <View style={styles.editHandleRow}>
                  <Text style={styles.editHandleAt}>@</Text>
                  <TextInput
                    style={[styles.editFieldInput, { flex: 1 }]}
                    value={handle}
                    onChangeText={(v) => setHandle(v.toLowerCase())}
                    autoCapitalize="none"
                    onBlur={() => persistField("handle", handle)}
                  />
                </View>
                <LinearGradient colors={[ACCENT, "#FFFFFF"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.editFieldDivider} />
              </View>

              <View style={styles.editField}>
                <Text style={styles.editFieldLabel}>{t("userProfile.editProfileBio").toUpperCase()}</Text>
                <TextInput
                  style={[styles.editFieldInput, styles.editFieldInputBio]}
                  value={bio}
                  onChangeText={setBio}
                  multiline
                  numberOfLines={1}
                  onBlur={() => persistField("bio", bio)}
                  placeholder={t("userProfile.bioPlaceholder")}
                  placeholderTextColor={MUTED}
                />
                <LinearGradient colors={[ACCENT, "#FFFFFF"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.editFieldDivider} />
              </View>

              <View style={[styles.editField, { position: "relative", zIndex: locationVisibilityMenuOpen ? 20 : 1 }]}>
                <Text style={styles.editFieldLabel}>{t("userProfile.editProfileLocation").toUpperCase()}</Text>
                <View style={styles.editHandleRow}>
                  <TextInput
                    style={[styles.editFieldInput, { flex: 1 }]}
                    value={profileLocation}
                    onChangeText={setProfileLocation}
                    onBlur={() => persistField("profile_location", profileLocation)}
                    placeholder={t("userProfile.locationFieldPlaceholder")}
                    placeholderTextColor={MUTED}
                  />
                  <TouchableOpacity onPress={() => setLocationVisibilityMenuOpen((v) => !v)} hitSlop={8}>
                    {locationVisibility === "public" ? (
                      <WorldIcon size={22} color="#fff" />
                    ) : locationVisibility === "private" ? (
                      <PrivacyLockIcon size={22} color="#fff" />
                    ) : (
                      <Users size={22} color="#fff" />
                    )}
                  </TouchableOpacity>
                </View>
                {locationVisibilityMenuOpen && (
                  <View style={styles.visibilityMenu}>
                    {(
                      [
                        { key: "public" as const, label: t("userProfile.visibilityPublic"), VisIcon: WorldIcon, iconOffset: -2 },
                        { key: "private" as const, label: t("userProfile.visibilityPrivate"), VisIcon: PrivacyLockIcon, iconOffset: -2 },
                        { key: "friends" as const, label: t("userProfile.visibilityFriends"), VisIcon: Users, iconOffset: -4 },
                      ]
                    ).map((opt) => (
                      <TouchableOpacity
                        key={opt.key}
                        style={[styles.visibilityMenuRow, locationVisibility === opt.key && styles.visibilityMenuRowActive]}
                        onPress={() => {
                          setLocationVisibility(opt.key);
                          setLocationVisibilityMenuOpen(false);
                        }}
                      >
                        <View style={{ marginTop: opt.iconOffset }}>
                          <opt.VisIcon size={16} color={locationVisibility === opt.key ? "#fff" : MUTED} />
                        </View>
                        <Text
                          style={[
                            styles.visibilityMenuRowText,
                            locationVisibility === opt.key && styles.visibilityMenuRowTextActive,
                          ]}
                        >
                          {opt.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
                <LinearGradient colors={[ACCENT, "#FFFFFF"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.editFieldDivider} />
              </View>

              <View style={[styles.editField, styles.editFieldLast, { position: "relative", zIndex: birthdayVisibilityMenuOpen ? 20 : 1 }]}>
                <Text style={styles.editFieldLabel}>{t("userProfile.editProfileBirthday").toUpperCase()}</Text>
                <View style={styles.editHandleRow}>
                  <TextInput
                    style={[styles.editFieldInput, { flex: 1 }]}
                    value={birthday}
                    onChangeText={setBirthday}
                    onBlur={() => persistField("birthday", birthday)}
                    placeholder={t("userProfile.birthdayPlaceholder")}
                    placeholderTextColor={MUTED}
                  />
                  <TouchableOpacity onPress={() => setBirthdayVisibilityMenuOpen((v) => !v)} hitSlop={8}>
                    {birthdayVisibility === "public" ? (
                      <WorldIcon size={22} color="#fff" />
                    ) : birthdayVisibility === "private" ? (
                      <PrivacyLockIcon size={22} color="#fff" />
                    ) : (
                      <Users size={22} color="#fff" />
                    )}
                  </TouchableOpacity>
                </View>
                {birthdayVisibilityMenuOpen && (
                  <View style={styles.visibilityMenu}>
                    {(
                      [
                        { key: "public" as const, label: t("userProfile.visibilityPublic"), VisIcon: WorldIcon, iconOffset: -2 },
                        { key: "private" as const, label: t("userProfile.visibilityPrivate"), VisIcon: PrivacyLockIcon, iconOffset: -2 },
                        { key: "friends" as const, label: t("userProfile.visibilityFriends"), VisIcon: Users, iconOffset: -4 },
                      ]
                    ).map((opt) => (
                      <TouchableOpacity
                        key={opt.key}
                        style={[styles.visibilityMenuRow, birthdayVisibility === opt.key && styles.visibilityMenuRowActive]}
                        onPress={() => {
                          setBirthdayVisibility(opt.key);
                          setBirthdayVisibilityMenuOpen(false);
                        }}
                      >
                        <View style={{ marginTop: opt.iconOffset }}>
                          <opt.VisIcon size={16} color={birthdayVisibility === opt.key ? "#fff" : MUTED} />
                        </View>
                        <Text
                          style={[
                            styles.visibilityMenuRowText,
                            birthdayVisibility === opt.key && styles.visibilityMenuRowTextActive,
                          ]}
                        >
                          {opt.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
                <LinearGradient colors={[ACCENT, "#FFFFFF"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.editFieldDivider} />
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* avatarSheet/bannerSheet Modal'lari BILEREK burada, "Profili Duzenle"
          tam ekraninin Modal'indan SONRA - react-native-web'de her Modal
          document.body'ye kendi portal'ini ekliyor, ve body'de SONRAKI
          kardes her zaman ONCEKINI gorsel olarak ORTUYOR. Bu iki sheet
          "Profili Duzenle" ekraninin ICINDEN acildigi icin, ondan once
          tanimlanirlarsa (DOM'da ondan once mount olup) o tam ekranin
          ALTINDA kalip gorunmuyorlardi. */}
      <Modal
        visible={avatarSheetVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setAvatarSheetVisible(false)}
        statusBarTranslucent
      >
        <TouchableOpacity
          style={styles.sheetOverlay}
          activeOpacity={1}
          onPress={() => setAvatarSheetVisible(false)}
        >
          <DragToCloseSheet onClose={() => setAvatarSheetVisible(false)}>
            <TouchableOpacity activeOpacity={1} style={styles.sheetCard}>
              <View style={styles.sheetHandle} />
              <TouchableOpacity style={styles.sheetRow} onPress={takeAvatarPhoto}>
                <Text style={styles.sheetRowText}>{t("userProfile.takePhoto")}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.sheetRow} onPress={pickFromGallery}>
                <Text style={styles.sheetRowText}>{t("userProfile.avatarPhotos")}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.sheetRow} onPress={removeAvatar}>
                <Text style={styles.sheetRowText}>{t("userProfile.avatarRemove")}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.sheetRow, styles.sheetRowLast]} onPress={() => setAvatarSheetVisible(false)}>
                <Text style={[styles.sheetRowText, styles.sheetCancelText]}>{t("common.close")}</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          </DragToCloseSheet>
        </TouchableOpacity>
      </Modal>

      <Modal
        visible={bannerSheetVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setBannerSheetVisible(false)}
        statusBarTranslucent
      >
        <TouchableOpacity
          style={styles.sheetOverlay}
          activeOpacity={1}
          onPress={() => setBannerSheetVisible(false)}
        >
          <DragToCloseSheet onClose={() => setBannerSheetVisible(false)}>
            <TouchableOpacity activeOpacity={1} style={styles.sheetCard}>
              <View style={styles.sheetHandle} />
              <TouchableOpacity
                style={styles.sheetRow}
                onPress={() => {
                  setBannerSheetVisible(false);
                  takeBannerPhoto();
                }}
              >
                <Text style={styles.sheetRowText}>{t("userProfile.takePhoto")}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.sheetRow}
                onPress={() => {
                  setBannerSheetVisible(false);
                  pickBannerPhoto();
                }}
              >
                <Text style={styles.sheetRowText}>{t("userProfile.bannerPhotoPick")}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.sheetRow}
                onPress={() => {
                  setBannerSheetVisible(false);
                  removeBannerPhoto();
                }}
              >
                <Text style={styles.sheetRowText}>{t("userProfile.bannerPhotoRemove")}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.sheetRow, styles.sheetRowLast]} onPress={() => setBannerSheetVisible(false)}>
                <Text style={[styles.sheetRowText, styles.sheetCancelText]}>{t("common.close")}</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          </DragToCloseSheet>
        </TouchableOpacity>
      </Modal>

      {/* Galeride bir fotografa ya da avatara basinca acilan ortak tam ekran
          gorunumu (bkz. components/PhotoViewerModal.tsx) - Oda/DM sohbetindeki
          ChatImageBubble ile AYNI bilesen. */}
      <PhotoViewerModal uri={viewingPhotoUrl} onClose={() => setViewingPhotoUrl(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  // Discover/diger ekranlardaki GIBI - App.tsx'teki PAYLASILAN AppBackground
  // degradesi (koyu lacivertten siyaha) arkadan gorunsun diye opak siyah
  // DEGIL, seffaf (eskiden BG ile opak siyaha boyanip bu degradeyi tamamen
  // kapatiyordu).
  screen: { flex: 1, backgroundColor: "transparent" },
  scrollContent: { paddingBottom: 40 },
  topBlock: { paddingHorizontal: 24, position: "relative" },
  // Kapak fotografi olmayan (baskasinin profili + banner'i kapali) nadir
  // durumda - banner YOKKEN geri/diger butonu mutlak konumlu HALA en ustte
  // biniyor olacagindan, altindaki avatarla CARPISMASIN diye bu durumda
  // topBlock'a eskisi gibi bir ust bosluk veriyoruz.
  topBlockNoBanner: { paddingTop: 50 },
  bodyContent: { paddingHorizontal: 16 },
  header: {
    position: "absolute",
    top: 14,
    left: 0,
    right: 0,
    zIndex: 5,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  bannerWrap: {
    height: BANNER_HEIGHT,
    overflow: "hidden",
    marginHorizontal: -24,
    alignItems: "flex-start",
    justifyContent: "center",
    backgroundColor: "#ECECE8",
  },
  // Kapak fotografi HENUZ eklenmediyse - duz, mat gri bir yer tutucu.
  bannerWrapEmpty: { backgroundColor: "#55554F" },
  bannerActionsRow: { position: "absolute", top: 34, right: 14, flexDirection: "row", gap: 8 },
  bannerActionButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(20,20,20,0.75)",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarSquareWrap: { width: 88, height: 88, marginTop: 18, marginBottom: 10, marginLeft: -LEFT_SHIFT },
  // SABIT bir deger (AVATAR_OVERLAP) - avatar boyutu degisse bile bu
  // taşma miktarı ORANLA degil, px olarak SABIT kalir.
  avatarSquareOverlap: { marginTop: -AVATAR_OVERLAP },
  avatarSquareCore: {
    width: 88,
    height: 88,
    borderRadius: 44,
    // SABIT bir renk (eskisi beyaz, sonra koyu) DEGIL - borderRadius
    // kirpmasinin kenarindaki (anti-aliasing) ince seritte bu renk GERCEK
    // arkaplan penceresiyle (asagidaki avatarBgWindow) tam ortusmuyordu,
    // bu da kenarda farkli tonda ince bir cizgi gibi goruluyordu. Seffaf
    // yapilinca o kenarda bile GERCEK arkaplanin kendisi (banner/govde)
    // gorunuyor - yani cizgi de "arkaplana tabi" oluyor.
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarBgWindow: {
    position: "absolute",
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  },
  bannerNotch: {
    position: "absolute",
    width: NOTCH_DIAMETER,
    height: NOTCH_DIAMETER,
    borderRadius: NOTCH_DIAMETER / 2,
    overflow: "hidden",
  },
  // Sadece bannerin icine tasan ust kisim kadar (avatarSquareOverlap'taki
  // 23px ile AYNI) yukseklikte bir pencere - halka sadece bu pencerenin
  // icinde gorunur, govde tarafinda (23px'ten sonrasi) kirpilip yok olur.
  presenceDot: {
    position: "absolute",
    bottom: 2,
    right: 2,
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: BG,
  },
  avatarWrap: { width: 128, height: 128, alignSelf: "center", marginBottom: 18 },
  // Halka gizliyken (showPresenceRing=false) gosterecek bir sey olmadigi
  // icin halkanin ekstra 20px'lik yer kaplamasina gerek yok - kutuyu
  // kuculterek ismi fotografa biraz daha yaklastiriyoruz.
  avatarFallback: { width: "100%", height: "100%", alignItems: "center", justifyContent: "center" },
  avatarInitial: { color: "#fff", fontSize: 30, fontWeight: "700" },
  avatarImage: { width: "100%", height: "100%", borderRadius: 44 },
  nameBlockLeft: { marginBottom: 14, gap: 4, marginLeft: -LEFT_SHIFT },
  // supabase/migrations/0018_is_premium.sql - isim/parıltı rozetini yan
  // yana gostermek icin (bkz. isPremium).
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  name: { color: TEXT, fontSize: 22, fontWeight: "800", letterSpacing: 0.3 },
  nameInputLeft: {
    color: TEXT,
    fontSize: 24,
    fontWeight: "700",
    borderBottomWidth: 1,
    borderBottomColor: MUTED,
    minWidth: 140,
    outlineWidth: 0,
    outlineStyle: "none",
  } as any,
  handleRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2 },
  handle: { color: MUTED, fontSize: 14, fontWeight: "600", letterSpacing: 0.2 },
  // @ isareti bu fontta buyuk harflerin tepe yuksekligine gore kisa
  // ciziliyor (hemen hemen her fontta boyle) - harflerle tepeden
  // hizalansin diye yukari kaydiriliyor.
  handleAtNudge: { marginTop: -2 },
  handleEditRow: { flexDirection: "row", alignItems: "center", marginTop: 4 },
  handleAt: { color: MUTED, fontSize: 14, fontWeight: "600" },
  handleInput: {
    color: TEXT,
    fontSize: 14,
    fontWeight: "600",
    borderBottomWidth: 1,
    borderBottomColor: MUTED,
    minWidth: 100,
    paddingVertical: 2,
    outlineWidth: 0,
    outlineStyle: "none",
  } as any,
  bioLeft: { color: "#C9BFAE", fontSize: 14, lineHeight: 20, marginTop: 6 },
  bioInputLeft: {
    color: "#C9BFAE",
    fontSize: 14,
    lineHeight: 20,
    marginTop: 6,
    borderWidth: 1,
    borderColor: "#262626",
    borderRadius: 8,
    padding: 10,
    minHeight: 50,
    outlineWidth: 0,
    outlineStyle: "none",
  } as any,
  bioSaveButton: {
    flexDirection: "row",
    alignSelf: "flex-end",
    alignItems: "center",
    gap: 6,
    backgroundColor: ACCENT,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginTop: 6,
  },
  bioSaveButtonText: { color: "#04140D", fontSize: 13, fontWeight: "800" },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  // Pin ve takvim ikonlari (govdeleri/kuyruklari nedeniyle) yaninndaki
  // yaziya gore hafifce asagida duruyordu - yukari nudge.
  metaIconNudge: { marginTop: -2 },
  metaText: {
    color: MUTED,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.3,
    // Ikon (14px) ile dikey hizayi tutturmak icin - yazi tipi/platform
    // varsayilan satir yuksekligindeki fazladan bosluk (Android'de
    // includeFontPadding) ikona gore ortalamayi kaydiriyordu.
    lineHeight: 13,
    includeFontPadding: false,
    marginTop: 2,
  } as any,
  metaInput: {
    color: TEXT,
    fontSize: 11,
    fontWeight: "700",
    borderBottomWidth: 1,
    borderBottomColor: MUTED,
    minWidth: 100,
    paddingVertical: 2,
    outlineWidth: 0,
    outlineStyle: "none",
  } as any,
  ownActionRow: { flexDirection: "row", gap: 10, marginBottom: 8, marginLeft: -LEFT_SHIFT },
  pillOutlineButton: { flex: 1 },
  // Mavi-beyaz gradyan "cerceve" - gercek bir borderColor degrade
  // olamadigi icin, disi gradyanla dolu bir kutu + icinde 1.5px (border
  // kalinligi) kucuk, govde rengine yakin dolgulu bir ic kutu ile
  // "sadece kenarlik gradyanli" gorunumu taklit ediliyor.
  pillGradientBorder: {
    borderRadius: 24,
    padding: 2,
  },
  pillInner: {
    borderRadius: 22,
    paddingVertical: 10,
    alignItems: "center",
    backgroundColor: BG,
  },
  pillOutlineButtonText: { color: TEXT, fontSize: 13, fontWeight: "800", letterSpacing: 0.4 },
  topTabsRow: { flexDirection: "row", justifyContent: "space-around", marginHorizontal: -24, paddingTop: 4 },
  topTabTouch: { flex: 1, alignItems: "center", paddingTop: 0, paddingBottom: 12 },
  topTabsBottomBar: { height: 1, marginHorizontal: -24 },
  actionRow: { flexDirection: "row", gap: 10, marginBottom: 24 },
  activeRoomCard: { margin: 0, marginTop: 14, marginBottom: 24 },
  sectionHeaderActions: { flexDirection: "row", alignItems: "center", gap: 14 },
  // "height" SABIT verilmezse bu yatay ScrollView, DIKEY ScrollView'in
  // (sayfanin kendisi) icine ic ice girince native'de SIFIRA YAKIN
  // yukseklige collapse olup fotograflari GORUNMEZ yapiyordu (bkz.
  // RoomScreen.tsx pendingImageBar'daki AYNI sinif hata).
  galleryScroll: { height: 84, flexGrow: 0, flexShrink: 0, marginTop: 14, marginBottom: 24 },
  galleryRow: { gap: 10 },
  galleryThumb: { width: 84, height: 84, borderRadius: 10, overflow: "hidden" },
  galleryThumbImage: { width: "100%", height: "100%" },
  emptyHistoryText: { color: MUTED, fontSize: 12, marginBottom: 24 },
  fullDivider: { height: 1, backgroundColor: "#1C1C1C", marginHorizontal: -16 },
  statsBlock: {
    paddingVertical: 4,
    marginTop: 4,
    marginBottom: 24,
  },
  statRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12 },
  statRowLabel: { flex: 1, color: MUTED, fontSize: 13.5, fontWeight: "500", letterSpacing: 0.1 },
  statRowValue: { color: TEXT, fontSize: 14, fontWeight: "700" },
  chartBlock: { paddingTop: 6, paddingBottom: 12 },
  chartBars: { flexDirection: "row", alignItems: "flex-end", gap: 6, height: 100, marginTop: 6, marginBottom: 10 },
  chartBarTouch: { flex: 1, alignItems: "center", justifyContent: "flex-end", height: "100%" },
  chartBar: { width: "100%", borderRadius: 2 },
  chartSelected: { color: MUTED, fontSize: 11, textAlign: "center" },
  primaryButton: { flex: 1, backgroundColor: ACCENT, borderRadius: 8, paddingVertical: 14, alignItems: "center" },
  primaryButtonText: { color: "#04140D", fontSize: 15, fontWeight: "800", letterSpacing: 0.2 },
  // "Çıkış Yap" (ProfileScreen.tsx signOutButton) ile AYNI hap/kapsul sekli
  // (borderRadius:30, borderWidth:1 cerceve) - sadece renk tonlari kirmizi
  // yerine mavi (ACCENT bazli).
  requestButton: {
    flex: 1,
    backgroundColor: "rgba(14,165,233,0.15)",
    borderRadius: 30,
    paddingVertical: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(14,165,233,0.4)",
  },
  requestButtonText: { color: ACCENT, fontSize: 15, fontWeight: "800", letterSpacing: 0.2, textTransform: "uppercase" },
  secondaryButton: {
    flex: 1,
    backgroundColor: "transparent",
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#262626",
  },
  secondaryButtonText: { color: TEXT, fontSize: 15, fontWeight: "800", letterSpacing: 0.2 },
  sectionHeader: { color: MUTED, fontSize: 11, fontWeight: "700", letterSpacing: 1.2, paddingVertical: 12 },
  sectionHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12 },
  historyTabsRow: { flexDirection: "row", gap: 8, marginTop: 14, marginBottom: 4 },
  historyTabTouch: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 16 },
  historyTabTouchActive: { backgroundColor: "rgba(14,165,233,0.18)" },
  historyTabText: { color: MUTED, fontSize: 12.5, fontWeight: "700" },
  historyTabTextActive: { color: ACCENT },
  videoGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", marginTop: 14 },
  videoCard: { width: "31%", marginBottom: 18 },
  videoThumb: {
    width: "100%",
    aspectRatio: 16 / 9,
    borderRadius: 8,
    backgroundColor: "#0D0D0D",
    borderWidth: 1,
    borderColor: "#1C1C1C",
    marginBottom: 6,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  videoThumbImage: { width: "100%", height: "100%" },
  videoPlayBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  videoTitle: { color: TEXT, fontSize: 11, fontWeight: "600" },
  videoMeta: { color: MUTED, fontSize: 10, fontWeight: "700", marginTop: 2 },
  sheetOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheetCard: {
    backgroundColor: "#15202B",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingTop: 8,
    paddingBottom: 30,
    alignItems: "center",
  },
  sheetRow: { width: "100%", paddingVertical: 18, alignItems: "center" },
  sheetRowLast: { borderBottomWidth: 0 },
  sheetRowText: { color: TEXT, fontSize: 16, fontWeight: "700" },
  sheetCancelText: { color: MUTED },
  tagPickerDoneText: { color: "#FFFFFF", marginTop: 23 },
  tagPickerSheetCard: { paddingBottom: 10 },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "#FFFFFF", marginBottom: 14 },
  tagPickerRow: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 20 },
  tagPickerRowChecked: { backgroundColor: "rgba(14,165,233,0.16)" },
  tagPickerNameWrap: { flexDirection: "row", alignItems: "center", gap: 10 },
  tagPickerHandleRow: { flexDirection: "row", alignItems: "flex-start", gap: 0, marginTop: 2 },
  tagPickerHandle: { color: MUTED, fontSize: 12, fontWeight: "600", letterSpacing: 0.2 },
  tagPickerHandleLetters: { marginTop: 1 },

  postDivider: { height: 1, backgroundColor: "#141414", marginVertical: 4 },

  composerScreen: { flex: 1, backgroundColor: "transparent" },
  composerHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 54,
    paddingBottom: 14,
  },
  composerVisibilityWrap: { paddingHorizontal: 20, marginBottom: 14, marginTop: 5 },
  composerVisibilityGradientBorder: { alignSelf: "flex-start", borderRadius: 20, padding: 1 },
  composerVisibilityPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#000000",
    borderRadius: 19,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  composerVisibilityPillText: { color: "#FFFFFF", fontSize: 12, fontWeight: "800", letterSpacing: 0.5 },
  composerVisibilityMenuPos: { left: 10, right: "auto" },
  composerBody: { flex: 1, paddingHorizontal: 20 },
  composerFullInput: {
    color: TEXT,
    fontSize: 17,
    fontWeight: "600",
    lineHeight: 24,
    minHeight: 120,
    padding: 0,
    marginTop: 5,
    outlineWidth: 0,
    outlineStyle: "none",
  } as any,
  composerImageRow: { flexDirection: "row", gap: 8, marginTop: 16 },
  composerImageWrap: { width: 90, height: 90, borderRadius: 12, overflow: "hidden" },
  composerImage: { width: "100%", height: "100%" },
  composerImageRemove: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.7)",
    alignItems: "center",
    justifyContent: "center",
  },
  composerImageRemoveText: { color: TEXT, fontSize: 13, lineHeight: 14, fontWeight: "700" },
  composerLocationBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#000000",
    borderWidth: 1,
    borderColor: "#262626",
    borderRadius: 8,
    marginTop: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    position: "relative",
  },
  composerLocationTextWrap: { flex: 1 },
  composerLocationText: { color: TEXT, fontSize: 14, fontWeight: "600" },
  composerLocationCloseButton: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  composerLocationMapTile: {
    width: 60,
    height: 60,
    borderWidth: 1,
    borderColor: "#262626",
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  composerPollPreviewBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#000000",
    borderWidth: 1,
    borderColor: "#262626",
    borderRadius: 8,
    marginTop: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    position: "relative",
  },
  composerPollPreviewIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#000000",
    alignItems: "center",
    justifyContent: "center",
  },
  composerPollPreviewSubtext: { color: MUTED, fontSize: 12, marginTop: 2 },
  composerPollPreviewActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  composerPollPreviewActionButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#262626",
    alignItems: "center",
    justifyContent: "center",
  },
  pollBuilderCard: { width: "100%", alignItems: "stretch", paddingHorizontal: 20 },
  pollBuilderTitleText: { color: TEXT, fontSize: 17, fontWeight: "800", textAlign: "center", marginBottom: 16 },
  pollBuilderTitleTextFontLoaded: { fontFamily: "BebasNeue_400Regular", fontWeight: "400", fontSize: 22, letterSpacing: 1.4 },
  pollQuestionInput: {
    color: TEXT,
    fontSize: 15,
    fontWeight: "600",
    backgroundColor: "#0A0F14",
    borderWidth: 1,
    borderColor: "#FFFFFF",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 14,
  },
  pollOptionRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  pollOptionImageButton: {
    width: 52,
    height: 52,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#262626",
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    overflow: "visible",
  },
  pollOptionImage: { width: 52, height: 52, borderRadius: 10 },
  pollOptionImageRemove: {
    position: "absolute",
    top: -4,
    right: -4,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#000000",
    borderWidth: 1,
    borderColor: "#262626",
    alignItems: "center",
    justifyContent: "center",
  },
  pollOptionInput: {
    flex: 1,
    color: TEXT,
    fontSize: 14,
    fontWeight: "600",
    backgroundColor: "#0A0F14",
    borderWidth: 1,
    borderColor: "#FFFFFF",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  pollAddOptionButton: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", marginTop: 2, marginBottom: 18 },
  pollAddOptionText: { color: "#FFFFFF", fontSize: 13, fontWeight: "700" },
  pollBuilderFooterRow: { flexDirection: "row", gap: 10, marginBottom: 6 },
  pollBuilderAddGradientBorder: { flex: 1, borderRadius: 10, padding: 1 },
  pollBuilderAddButton: { alignItems: "center", justifyContent: "center", paddingVertical: 11, borderRadius: 9, backgroundColor: "#000000" },
  pollBuilderAddText: { color: "#FFFFFF", fontSize: 14, fontWeight: "700", textAlign: "center" },
  pollBuilderCancelTextColor: { color: MUTED },
  composerTaggedPreview: { color: ACCENT, fontSize: 13, marginTop: 12 },
  composerTaggedPreviewRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12, marginLeft: -8 },
  composerTaggedPillGradientBorder: { borderRadius: 20, padding: 1 },
  composerTaggedPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#000000",
    borderRadius: 19,
    paddingVertical: 4,
    paddingLeft: 5,
    paddingRight: 5,
  },
  composerTaggedPillText: { color: "#FFFFFF", fontSize: 13, fontWeight: "700" },
  composerTaggedPillRemoveText: { color: MUTED, fontSize: 16, fontWeight: "700", marginLeft: 2, marginTop: -2 },
  composerBottomBarDivider: { height: 1, width: "100%" },
  composerBottomBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 24,
  },

  // Tam ekran "Profili Duzenle" sayfasi
  editScreen: { flex: 1, backgroundColor: "transparent" },
  editScrollContent: { paddingBottom: 60 },
  editHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 54,
    paddingBottom: 14,
  },
  editHeaderSideButton: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  editHeaderTitle: { color: "#FFFFFF", fontSize: 16, fontWeight: "800", letterSpacing: 0.3, marginTop: 1 },
  editHeaderTitleFontLoaded: { fontFamily: "BebasNeue_400Regular", fontWeight: "400", fontSize: 22, letterSpacing: 1.4 },
  editBannerWrap: {
    height: BANNER_HEIGHT,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ECECE8",
  },
  editBannerText: { color: "#0A0A0A", fontSize: 32, fontWeight: "900", letterSpacing: 0.5, paddingHorizontal: 60 },
  editBannerInput: {
    color: "#0A0A0A",
    fontSize: 32,
    fontWeight: "900",
    letterSpacing: 0.5,
    textAlign: "center",
    paddingHorizontal: 60,
    outlineWidth: 0,
    outlineStyle: "none",
  } as any,
  editBannerCameraButton: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(20,20,20,0.3)",
    alignItems: "center",
    justifyContent: "center",
  },
  bannerUploadingOverlay: { backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center" },
  editAvatarWrap: { width: 88, height: 88, marginTop: -44, marginLeft: 24 },
  editAvatarCore: {
    width: 88,
    height: 88,
    borderRadius: 44,
    overflow: "hidden",
    borderWidth: 3,
    borderColor: BG,
  },
  editAvatarImage: { width: "100%", height: "100%" },
  editAvatarCameraButton: {
    position: "absolute",
    top: 0,
    left: 0,
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: "rgba(20,20,20,0.55)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: BG,
  },
  editFieldsWrap: { paddingHorizontal: 24, paddingTop: 24 },
  editField: { marginBottom: 12 },
  editFieldDivider: { height: 1, width: "100%", marginTop: 10 },
  editFieldLast: { marginBottom: 0 },
  editFieldLabel: { color: MUTED, fontSize: 11, fontWeight: "700", letterSpacing: 1, marginBottom: 6, lineHeight: 14 },
  editFieldInput: {
    color: TEXT,
    fontSize: 16,
    fontWeight: "700",
    lineHeight: 20,
    padding: 0,
    margin: 0,
    outlineWidth: 0,
    outlineStyle: "none",
  } as any,
  editFieldInputBio: { minHeight: 0, paddingVertical: 0 } as any,
  editHandleRow: { flexDirection: "row", alignItems: "baseline", gap: 2 },
  editHandleAt: { color: TEXT, fontSize: 16, fontWeight: "700", lineHeight: 20 },
  visibilityMenu: {
    position: "absolute",
    top: "100%",
    right: 0,
    marginTop: 8,
    backgroundColor: "#15202B",
    borderRadius: 14,
    paddingVertical: 4,
    minWidth: 160,
    zIndex: 10,
    overflow: "hidden",
  },
  // Dil secim kutusundaki (ProfileScreen.tsx popoverOptionRow) AYNI desen -
  // secili satirin vurgusu karta tam yapismiyor, kenarlardan icerlek
  // (marginHorizontal) yuvarlak kose bir "hap" gibi duruyor.
  visibilityMenuRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginHorizontal: 6,
    borderRadius: 12,
  },
  visibilityMenuRowActive: { backgroundColor: "rgba(14,165,233,0.18)" },
  visibilityMenuRowText: { color: MUTED, fontSize: 14, fontWeight: "600" },
  visibilityMenuRowTextActive: { color: TEXT },
});
