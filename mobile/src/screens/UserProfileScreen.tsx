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
} from "react-native";
import { ChevronLeft, Gift, Tag, Newspaper, History as HistoryIcon, Heart, Plus } from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import * as ImagePicker from "expo-image-picker";
import { useTranslation } from "react-i18next";
import { supabase } from "../services/supabase";
import { getSocket, PublicRoomSummary, HistoryItem, MediaSource, SourceType, RoomState } from "../services/socket";
import Icon from "../components/Icon";
import { showAlert } from "../components/CustomAlert";
import CountryFlag from "../components/CountryFlag";
import RoomCard from "../components/RoomCard";
import PhotoViewerModal from "../components/PhotoViewerModal";
import PostCard from "../components/PostCard";
import AppBackground from "../components/AppBackground";
import { uriToArrayBuffer } from "../utils/uriToArrayBuffer";

interface Props {
  own?: boolean;
  peer?: { userId: string; name: string; handle?: string };
  onBack?: () => void;
  onOpenDM?: (peer: { userId: string; name: string; handle?: string }) => void;
  onOpenRoomPreview?: (room: PublicRoomSummary) => void;
  onOpenRoom?: (room: RoomState) => void;
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
const BANNER_STRIPE_W = 26;
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
export default function UserProfileScreen({ own = true, peer, onBack, onOpenDM, onOpenRoomPreview, onOpenRoom }: Props) {
  const { t, i18n } = useTranslation();
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
  // Galeride bir fotografa ya da avatara basinca PhotoViewerModal ile tam
  // ekran buyuk haliyle acilir.
  const [viewingPhotoUrl, setViewingPhotoUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [editingField, setEditingField] = useState<
    "name" | "handle" | "bio" | "banner_text" | "profile_location" | "birthday" | null
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
  const [composerFriends, setComposerFriends] = useState<{ userId: string; name: string }[]>([]);
  // Avatarin icindeki "arkaplan penceresinin" kaydirmayla (scroll) birlikte
  // dogru hizada kalmasi icin - AppBackground sayfanin SABIT arkasinda
  // durur, ScrollView icerigi onun ONUNDE kayar.
  const [scrollY, setScrollY] = useState(0);
  const [postingBusy, setPostingBusy] = useState(false);
  const [bannerText, setBannerText] = useState("");
  const [profileLocation, setProfileLocation] = useState("");
  const [birthday, setBirthday] = useState("");
  const [topTab, setTopTab] = useState<"posts" | "tagged" | "history" | "liked">("posts");
  const [taggedPosts, setTaggedPosts] = useState<Post[]>([]);

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
          "name,handle,bio,avatar_url,country,created_at,stat_visibility,videos_visible,bio_visible,posts_visible,banner_text,profile_location,birthday,is_premium"
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
          setBannerText(profile.banner_text || "");
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
        setBannerText(res.profile.bannerText || "");
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
      .select("id,user_id,text,image_urls,location_name,tagged_user_ids,created_at")
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
      .select("id,user_id,text,image_urls,location_name,tagged_user_ids,created_at")
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
      if (res?.ok) setComposerFriends(res.friends.map((f: { userId: string; name: string }) => ({ userId: f.userId, name: f.name })));
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
  type EditableField = "name" | "handle" | "bio" | "banner_text" | "profile_location" | "birthday";

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
    setComposerVisible(true);
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

  function toggleComposerTag(userId: string) {
    setComposerTaggedIds((prev) => (prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]));
  }

  // "Paylaş" - gallery fotograflarindaki uploadGalleryPhoto ile AYNI direkt
  // Supabase Storage yukleme deseni, sadece hedef bucket "post-images" ve
  // sonunda tek bir "posts" satiri ekleniyor (metin + en fazla 2 foto +
  // konum adi + etiketlenen kisi id'leri).
  async function submitPost() {
    if (!myUserId) return;
    if (!composerText.trim() && composerImages.length === 0) return;
    setPostingBusy(true);
    try {
      const imageUrls: string[] = [];
      for (const uri of composerImages) {
        const arrayBuffer = await uriToArrayBuffer(uri);
        const ext = uri.split(".").pop()?.toLowerCase().split("?")[0] || "jpg";
        const contentType = ext === "png" ? "image/png" : "image/jpeg";
        const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const path = `${myUserId}/${fileName}`;
        const { error: uploadError } = await supabase.storage.from("post-images").upload(path, arrayBuffer, { contentType });
        if (uploadError) throw uploadError;
        const { data: publicUrlData } = supabase.storage.from("post-images").getPublicUrl(path);
        imageUrls.push(publicUrlData.publicUrl);
      }
      const { data: row, error: insertError } = await supabase
        .from("posts")
        .insert({
          user_id: myUserId,
          text: composerText.trim() || null,
          image_urls: imageUrls,
          location_name: composerLocation.trim() || null,
          tagged_user_ids: composerTaggedIds,
        })
        .select("id,user_id,text,image_urls,location_name,tagged_user_ids,created_at")
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

  // Profil ustundeki "bayrak" bandi - capraz cizgili bir desen istendigi
  // icin (bkz. kullanicinin referans gorseli), gercek bir repeating-
  // gradient yerine (React Native'de yok) dondurulmus ince seritlerle
  // elde ediliyor - ekran genisligini asip her iki tarafa da tasacak
  // kadar genis bir aralikta tekrarlaniyor.
  const bannerStripes = Array.from(
    { length: Math.ceil((SCREEN_WIDTH + 300) / BANNER_STRIPE_W) },
    (_, i) => -150 + i * BANNER_STRIPE_W
  );

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
        <View style={[styles.topBlock, !(own || bannerText) && styles.topBlockNoBanner]}>
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

        {(own || bannerText) && (
          <View style={[styles.bannerWrap, !bannerText && styles.bannerWrapEmpty]}>
            {bannerText && (
              <View style={StyleSheet.absoluteFill} pointerEvents="none">
                {bannerStripes.map((left, i) => (
                  <View
                    key={i}
                    style={[styles.bannerStripe, { left, backgroundColor: i % 2 === 0 ? "#F1F1EE" : "#E1E1DC" }]}
                  />
                ))}
              </View>
            )}
            {editingField === "banner_text" ? (
              <TextInput
                style={styles.bannerInput}
                value={bannerText}
                onChangeText={setBannerText}
                autoFocus
                autoCapitalize="characters"
                onSubmitEditing={() => closeFieldEdit("banner_text", bannerText)}
                onBlur={() => closeFieldEdit("banner_text", bannerText)}
                placeholder={t("userProfile.bannerPlaceholder")}
                placeholderTextColor="rgba(0,0,0,0.35)"
              />
            ) : bannerText ? (
              <TouchableOpacity disabled={!own} onPress={() => toggleFieldEdit("banner_text")} style={styles.bannerTextTouch}>
                <Text style={styles.bannerText} numberOfLines={1}>
                  {bannerText.toUpperCase()}
                </Text>
              </TouchableOpacity>
            ) : (
              own && (
                <TouchableOpacity onPress={() => toggleFieldEdit("banner_text")} style={StyleSheet.absoluteFill} />
              )
            )}
            {own && (
              <View style={styles.bannerActionsRow}>
                <TouchableOpacity style={styles.bannerActionButton} onPress={openComposer} hitSlop={6}>
                  <Plus size={18} color={TEXT} strokeWidth={3} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.bannerActionButton} onPress={() => placeholder(t("tabs.settings"))} hitSlop={6}>
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
        {(own || bannerText) && (
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
          style={[styles.avatarSquareWrap, (own || bannerText) && styles.avatarSquareOverlap]}
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
              <Text style={styles.avatarInitial}>{initial}</Text>
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
                {isPremium && <Icon name="sparkles" size={18} color={ACCENT} />}
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
              <View style={styles.handleRow}>
                <Text style={styles.handle}>@{handle.toUpperCase()}</Text>
                <CountryFlag country={country} size={13} />
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
                  <Icon name="pin" size={14} color={MUTED} />
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
                  <Icon name="pin" size={14} color={MUTED} />
                </View>
                <Text style={styles.metaText}>
                  {(profileLocation || (own ? t("userProfile.locationFieldPlaceholder") : "")).toUpperCase()}
                </Text>
              </TouchableOpacity>
            ))}

          {joinDateMs != null && (own || statVisibility.joinDate !== false) && (
            <View style={styles.metaRow}>
              <View style={styles.metaIconNudge}>
                <Icon name="calendar" size={14} color={MUTED} />
              </View>
              <Text style={styles.metaText}>{t("userProfile.joinedOn", { date: formatDate(joinDateMs, i18n.language) })}</Text>
            </View>
          )}

          {(own || birthday) &&
            (editingField === "birthday" ? (
              <View style={styles.metaRow}>
                <Gift size={14} color={MUTED} />
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
                <Gift size={14} color={MUTED} />
                <Text style={styles.metaText}>
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
            <TouchableOpacity style={styles.pillOutlineButton} onPress={() => toggleFieldEdit("bio")}>
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
                        avatarUrl={profileCache[post.userId]?.avatarUrl || avatarUrl}
                        initial={(profileCache[post.userId]?.name || name).charAt(0).toUpperCase()}
                        name={profileCache[post.userId]?.name || name}
                        handle={profileCache[post.userId]?.handle || handle}
                        timeLabel={timeAgo(post.createdAt, t, i18n.language)}
                        text={post.text}
                        imageUrls={post.imageUrls}
                        locationName={post.locationName}
                        taggedNames={post.taggedUserIds.map((id) => profileCache[id]?.name).filter(Boolean) as string[]}
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
                    avatarUrl={profileCache[post.userId]?.avatarUrl || ""}
                    initial={(profileCache[post.userId]?.name || "?").charAt(0).toUpperCase()}
                    name={profileCache[post.userId]?.name || "—"}
                    handle={profileCache[post.userId]?.handle || ""}
                    timeLabel={timeAgo(post.createdAt, t, i18n.language)}
                    text={post.text}
                    imageUrls={post.imageUrls}
                    locationName={post.locationName}
                    taggedNames={post.taggedUserIds.map((id) => profileCache[id]?.name).filter(Boolean) as string[]}
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
        transparent
        animationType="slide"
        onRequestClose={() => setComposerVisible(false)}
        statusBarTranslucent
      >
        <View style={styles.composerOverlay}>
          <View style={styles.composerCard}>
            <View style={styles.composerHeaderRow}>
              <TouchableOpacity onPress={() => setComposerVisible(false)}>
                <Text style={styles.composerCancel}>{t("common.cancel")}</Text>
              </TouchableOpacity>
              <Text style={styles.composerTitle}>{t("userProfile.newPost")}</Text>
              <TouchableOpacity
                onPress={submitPost}
                disabled={postingBusy || (!composerText.trim() && composerImages.length === 0)}
              >
                {postingBusy ? (
                  <ActivityIndicator color={ACCENT} size="small" />
                ) : (
                  <Text
                    style={[
                      styles.composerShare,
                      !composerText.trim() && composerImages.length === 0 && styles.composerShareDisabled,
                    ]}
                  >
                    {t("userProfile.share")}
                  </Text>
                )}
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.composerInput}
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

            <TextInput
              style={styles.composerLocationInput}
              value={composerLocation}
              onChangeText={setComposerLocation}
              placeholder={t("userProfile.locationPlaceholder")}
              placeholderTextColor={MUTED}
            />

            {composerTaggedIds.length > 0 && (
              <Text style={styles.composerTaggedPreview}>
                {t("userProfile.withPeople", {
                  names: composerTaggedIds
                    .map((id) => composerFriends.find((f) => f.userId === id)?.name)
                    .filter(Boolean)
                    .join(", "),
                })}
              </Text>
            )}

            <View style={styles.composerActionsRow}>
              <TouchableOpacity
                style={styles.composerActionButton}
                onPress={pickComposerImages}
                disabled={composerImages.length >= 2}
              >
                <Icon name="image" size={18} color={composerImages.length >= 2 ? MUTED : ACCENT} />
                <Text style={styles.composerActionText}>{t("userProfile.addPhoto")}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.composerActionButton} onPress={() => setComposerTagPickerVisible(true)}>
                <Icon name="people" size={18} color={ACCENT} />
                <Text style={styles.composerActionText}>{t("userProfile.tagPeople")}</Text>
              </TouchableOpacity>
            </View>
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
          <TouchableOpacity activeOpacity={1} style={styles.sheetCard}>
            {composerFriends.length === 0 ? (
              <Text style={[styles.emptyHistoryText, { padding: 16 }]}>{t("userProfile.noFriendsToTag")}</Text>
            ) : (
              composerFriends.map((friend) => {
                const checked = composerTaggedIds.includes(friend.userId);
                return (
                  <TouchableOpacity
                    key={friend.userId}
                    style={[styles.sheetRow, styles.tagPickerRow]}
                    onPress={() => toggleComposerTag(friend.userId)}
                  >
                    <Text style={styles.sheetRowText}>{friend.name}</Text>
                    {checked && <Icon name="check" size={16} color={ACCENT} />}
                  </TouchableOpacity>
                );
              })
            )}
            <TouchableOpacity style={styles.sheetRow} onPress={() => setComposerTagPickerVisible(false)}>
              <Text style={[styles.sheetRowText, styles.sheetCancelText]}>{t("userProfile.tagPeopleDone")}</Text>
            </TouchableOpacity>
            <View style={styles.sheetHandle} />
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

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
          <TouchableOpacity activeOpacity={1} style={styles.sheetCard}>
            <TouchableOpacity style={styles.sheetRow} onPress={pickFromGallery}>
              <Text style={styles.sheetRowText}>{t("userProfile.avatarPhotos")}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.sheetRow} onPress={removeAvatar}>
              <Text style={styles.sheetRowText}>{t("userProfile.avatarRemove")}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.sheetRow} onPress={() => setAvatarSheetVisible(false)}>
              <Text style={[styles.sheetRowText, styles.sheetCancelText]}>{t("common.close")}</Text>
            </TouchableOpacity>
            <View style={styles.sheetHandle} />
          </TouchableOpacity>
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
  // Kapak fotografi/metni HENUZ eklenmediyse (bannerText bos) - cizgili
  // desen yerine duz, mat gri bir yer tutucu.
  bannerWrapEmpty: { backgroundColor: "#55554F" },
  bannerStripe: { position: "absolute", top: -90, width: 22, height: 400, transform: [{ rotate: "-20deg" }] },
  bannerTextTouch: { paddingLeft: 24, paddingRight: 90, maxWidth: "100%" },
  bannerText: { color: "#0A0A0A", fontSize: 34, fontWeight: "900", letterSpacing: 0.5 },
  bannerInput: {
    color: "#0A0A0A",
    fontSize: 34,
    fontWeight: "900",
    letterSpacing: 0.5,
    paddingLeft: 24,
    paddingRight: 90,
    outlineWidth: 0,
    outlineStyle: "none",
  } as any,
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
  avatarInitial: { color: ACCENT, fontSize: 30, fontWeight: "700" },
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
  metaRow: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 8 },
  // Pin ve takvim ikonlari (govdeleri/kuyruklari nedeniyle) yaninndaki
  // yaziya gore hafifce asagida duruyordu - yukari nudge.
  metaIconNudge: { marginTop: -2 },
  metaText: {
    color: MUTED,
    fontSize: 12.5,
    fontWeight: "700",
    letterSpacing: 0.3,
    // Ikon (14px) ile dikey hizayi tutturmak icin - yazi tipi/platform
    // varsayilan satir yuksekligindeki fazladan bosluk (Android'de
    // includeFontPadding) ikona gore ortalamayi kaydiriyordu.
    lineHeight: 15,
    includeFontPadding: false,
    marginTop: 2,
  } as any,
  metaInput: {
    color: TEXT,
    fontSize: 12.5,
    fontWeight: "700",
    borderBottomWidth: 1,
    borderBottomColor: MUTED,
    minWidth: 100,
    paddingVertical: 2,
    outlineWidth: 0,
    outlineStyle: "none",
  } as any,
  ownActionRow: { flexDirection: "row", gap: 10, marginBottom: 20 },
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
  topTabTouch: { flex: 1, alignItems: "center", paddingVertical: 12 },
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
    backgroundColor: "#121212",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingTop: 8,
    paddingBottom: 30,
    alignItems: "center",
  },
  sheetRow: { width: "100%", paddingVertical: 18, alignItems: "center", borderBottomWidth: 1, borderColor: "#1C1C1C" },
  sheetRowText: { color: TEXT, fontSize: 16, fontWeight: "700" },
  sheetCancelText: { color: MUTED },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "#262626", marginTop: 14 },
  tagPickerRow: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 20 },

  postDivider: { height: 1, backgroundColor: "#141414", marginVertical: 4 },

  composerOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  composerCard: {
    backgroundColor: "#0B0B0B",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    paddingBottom: 32,
    gap: 14,
  },
  composerHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  composerCancel: { color: MUTED, fontSize: 15 },
  composerTitle: { color: TEXT, fontSize: 15, fontWeight: "700" },
  composerShare: { color: ACCENT, fontSize: 15, fontWeight: "800" },
  composerShareDisabled: { color: MUTED },
  composerInput: {
    color: TEXT,
    fontSize: 15,
    lineHeight: 21,
    minHeight: 70,
    outlineWidth: 0,
    outlineStyle: "none",
  } as any,
  composerImageRow: { flexDirection: "row", gap: 8 },
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
  composerLocationInput: {
    color: "#C9BFAE",
    fontSize: 13,
    borderWidth: 1,
    borderColor: "#262626",
    borderRadius: 8,
    padding: 10,
    outlineWidth: 0,
    outlineStyle: "none",
  } as any,
  composerTaggedPreview: { color: ACCENT, fontSize: 13 },
  composerActionsRow: { flexDirection: "row", gap: 20, borderTopWidth: 1, borderColor: "#1C1C1C", paddingTop: 14 },
  composerActionButton: { flexDirection: "row", alignItems: "center", gap: 6 },
  composerActionText: { color: TEXT, fontSize: 13, fontWeight: "600" },
});
