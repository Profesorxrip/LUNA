import React, { useEffect, useState } from "react";
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
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { supabase } from "../services/supabase";
import { getSocket, PublicRoomSummary } from "../services/socket";
import Icon, { IconName } from "../components/Icon";
import { showAlert } from "../components/CustomAlert";
import CountryFlag from "../components/CountryFlag";
import RoomCard from "../components/RoomCard";

interface Props {
  onBack: () => void;
  own?: boolean;
  peer?: { userId: string; name: string; handle?: string };
  onOpenDM?: (peer: { userId: string; name: string; handle?: string }) => void;
  onOpenRoomPreview?: (room: PublicRoomSummary) => void;
}

const ACCENT = "#2ECC71";
const BG = "#000000";
const TEXT = "#F5F0E6";
const MUTED = "#9A8F80";

// Su an gercek bir "kullanicilar arasi gezinme" ekrani yok - baskasinin
// profilini (own=false) test etmek icin sabit bir demo kimlik kullaniyoruz.
const DEMO_PEER_USER_ID = "demo-peer-kullanici";

// "goz" ikonuyla acilip kapatilan istatistik gorunurlugu - supabase/
// migrations/0003_profile_stats_and_history.sql'deki profiles.
// stat_visibility sutununun varsayilaniyla AYNI (gercek deger yuklenene
// kadar kisa sureligine gosterilen baslangic durumu).
const DEFAULT_STAT_VISIBILITY: Record<string, boolean> = {
  joinDate: true,
  totalHours: true,
  activityChart: true,
  friends: true,
  longestSession: true,
  biggestRoom: true,
};

interface ActivityStats {
  totalHours: number;
  longestSessionHours: number;
  biggestRoom: number;
  daily: Record<string, number>;
}

interface HistoryItem {
  roomCode: string;
  mediaLabel: string;
  mediaCoverUrl: string | null;
  mediaType: string | null;
  createdAt: number;
}

interface GalleryPhoto {
  id: string;
  url: string;
  createdAt: number;
}

const TR_MONTHS = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];

function formatDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getDate()} ${TR_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function formatHours(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)} dk`;
  return `${hours.toFixed(hours < 10 ? 1 : 0)} saat`;
}

function timeAgo(ms: number): string {
  const diffDays = Math.floor((Date.now() - ms) / (24 * 60 * 60 * 1000));
  if (diffDays <= 0) return "Bugün";
  if (diffDays === 1) return "Dün";
  if (diffDays < 30) return `${diffDays} gün önce`;
  return formatDate(ms);
}

// get_user_activity_stats RPC'sinin "daily" jsonb'si {"YYYY-MM-DD": saat}
// seklinde - grafigin ihtiyac duydugu son 9 gunluk siraya ceviriyor,
// veri olmayan gunler 0 saat olarak gosteriliyor.
function buildDailyActivity(daily: Record<string, number>): { date: string; hours: number }[] {
  const days: { date: string; hours: number }[] = [];
  for (let i = 8; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const iso = d.toISOString().slice(0, 10);
    days.push({ date: `${d.getDate()} ${TR_MONTHS[d.getMonth()]}`, hours: daily[iso] || 0 });
  }
  return days;
}

/** "Vinil Kayıt" konsepti - kartelanın (bkz. tasarım oturumu) ilk seçeneği,
 * kullanıcının kendi profili (own) ve başkasının profili (!own) icin
 * ortak bir govde uzerinde farkli baslik/aksiyon satiri gosterir. */
export default function UserProfileScreen({ onBack, own = true, peer, onOpenDM, onOpenRoomPreview }: Props) {
  const peerUserId = peer?.userId || DEMO_PEER_USER_ID;
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [name, setName] = useState(peer?.name || "Kullanici");
  const [handle, setHandle] = useState(peer?.handle || "kullanici");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [country, setCountry] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(own); // kendi profilin her zaman cevrimici
  const [joinDateMs, setJoinDateMs] = useState<number | null>(null);
  const [avatarSheetVisible, setAvatarSheetVisible] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [editingField, setEditingField] = useState<"name" | "handle" | "bio" | null>(null);
  const [galleryVisible, setGalleryVisible] = useState(true);
  const [statVisibility, setStatVisibility] = useState(DEFAULT_STAT_VISIBILITY);
  const [selectedDay, setSelectedDay] = useState(8);
  const [videosVisible, setVideosVisible] = useState(true);
  const [friendStatus, setFriendStatus] = useState<"none" | "pending" | "friends">("none");
  const [friendCount, setFriendCount] = useState(0);
  const [activityStats, setActivityStats] = useState<ActivityStats | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [activeRoom, setActiveRoom] = useState<PublicRoomSummary | null>(null);
  const [galleryPhotos, setGalleryPhotos] = useState<GalleryPhoto[]>([]);
  const [uploadingGalleryPhoto, setUploadingGalleryPhoto] = useState(false);

  const effectiveUserId = own ? myUserId : peerUserId;

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
        .select("name,handle,bio,avatar_url,created_at,stat_visibility,gallery_visible,videos_visible")
        .eq("id", userId)
        .maybeSingle()
        .then(({ data: profile }) => {
          if (!profile) return;
          if (profile.name) setName(profile.name);
          if (profile.handle) setHandle(profile.handle);
          setBio(profile.bio || "");
          if (profile.avatar_url) setAvatarUrl(profile.avatar_url);
          if (profile.created_at) setJoinDateMs(new Date(profile.created_at).getTime());
          if (profile.stat_visibility) setStatVisibility(profile.stat_visibility);
          if (profile.gallery_visible !== undefined) setGalleryVisible(profile.gallery_visible !== false);
          if (profile.videos_visible !== undefined) setVideosVisible(profile.videos_visible !== false);
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
        setGalleryVisible(res.profile.galleryVisible !== false);
        setVideosVisible(res.profile.videosVisible !== false);
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
    socket.emit("user:activityStats", { userId: effectiveUserId }, (res: any) => {
      if (res?.ok) setActivityStats(res.stats);
    });
    socket.emit("user:friendCount", { userId: effectiveUserId }, (res: any) => {
      if (res?.ok) setFriendCount(res.count);
    });
    socket.emit("user:roomHistory", { userId: effectiveUserId }, (res: any) => {
      if (res?.ok) setHistory(res.history);
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

  // Galeri - gercek yuklenen fotograflar (supabase/migrations/0004_gallery_
  // photos.sql). RLS zaten "sadece kendi fotograflarim VEYA gallery_visible
  // acik olan birinin fotograflari" diye filtreliyor - burada ekstra kontrole
  // gerek yok, dogrudan sorgulayabiliriz (avatar_url'de oldugu gibi).
  useEffect(() => {
    if (!effectiveUserId) return;
    supabase
      .from("gallery_photos")
      .select("id,url,created_at")
      .eq("user_id", effectiveUserId)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setGalleryPhotos((data || []).map((row: any) => ({ id: row.id, url: row.url, createdAt: new Date(row.created_at).getTime() })));
      });
  }, [effectiveUserId]);

  function placeholder(label: string) {
    showAlert(label, "Bu ozellik yakinda eklenecek.");
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
  async function persistField(field: "name" | "handle" | "bio", value: string) {
    if (!own || !myUserId) return;
    await supabase.from("profiles").update({ [field]: value }).eq("id", myUserId);
  }

  function toggleFieldEdit(field: "name" | "handle" | "bio") {
    if (!own) return;
    setEditingField(field);
  }

  function closeFieldEdit(field: "name" | "handle" | "bio", value: string) {
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
      showAlert("İzin gerekli", "Fotoğraf seçmek için galeri iznine ihtiyacımız var.");
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
      const arrayBuffer = await fetch(uri).then((res) => res.arrayBuffer());
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
      showAlert("Yüklenemedi", err?.message || "Fotoğraf yüklenirken bir hata oluştu, tekrar dene.");
    } finally {
      setUploadingAvatar(false);
    }
  }

  // Galeriye GERCEK fotograf yukleme - avatarin tek dosyalik "upsert" deseninin
  // aksine, her secim YENI bir satir/dosya olusturur (bkz. 0004_gallery_
  // photos.sql) cunku bir kullanicinin birden fazla galeri fotografi olabilir.
  async function pickGalleryPhotos() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      showAlert("İzin gerekli", "Fotoğraf seçmek için galeri iznine ihtiyacımız var.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.length) return;
    setUploadingGalleryPhoto(true);
    try {
      for (const asset of result.assets) {
        await uploadGalleryPhoto(asset.uri);
      }
    } finally {
      setUploadingGalleryPhoto(false);
    }
  }

  async function uploadGalleryPhoto(uri: string) {
    if (!myUserId) return;
    try {
      const arrayBuffer = await fetch(uri).then((res) => res.arrayBuffer());
      const ext = uri.split(".").pop()?.toLowerCase().split("?")[0] || "jpg";
      const contentType = ext === "png" ? "image/png" : "image/jpeg";
      const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const path = `${myUserId}/${fileName}`;
      const { error: uploadError } = await supabase.storage.from("gallery").upload(path, arrayBuffer, { contentType });
      if (uploadError) throw uploadError;
      const { data: publicUrlData } = supabase.storage.from("gallery").getPublicUrl(path);
      const { data: row, error: insertError } = await supabase
        .from("gallery_photos")
        .insert({ user_id: myUserId, url: publicUrlData.publicUrl })
        .select("id,url,created_at")
        .single();
      if (insertError) throw insertError;
      setGalleryPhotos((prev) => [{ id: row.id, url: row.url, createdAt: new Date(row.created_at).getTime() }, ...prev]);
    } catch (err: any) {
      showAlert("Yüklenemedi", err?.message || "Fotoğraf yüklenirken bir hata oluştu, tekrar dene.");
    }
  }

  function confirmDeleteGalleryPhoto(photo: GalleryPhoto) {
    if (!own) return;
    showAlert("Fotoğrafı sil", "Bu fotoğrafı galeriden kaldırmak istediğine emin misin?", [
      { text: "Vazgeç", style: "cancel" },
      { text: "Sil", style: "destructive", onPress: () => deleteGalleryPhoto(photo) },
    ]);
  }

  async function deleteGalleryPhoto(photo: GalleryPhoto) {
    setGalleryPhotos((prev) => prev.filter((p) => p.id !== photo.id));
    await supabase.from("gallery_photos").delete().eq("id", photo.id);
    const path = photo.url.split("/gallery/")[1]?.split("?")[0];
    if (path) await supabase.storage.from("gallery").remove([path]);
  }

  // "goz" ikonlari eskiden SADECE yerel state'ti - uygulamadan cikinca
  // sifirlaniyordu, baskasinin HER SEYI gormesine izin veriyordu. Artik
  // profiles.stat_visibility/gallery_visible/videos_visible'a kaydediliyor.
  function toggleStat(key: string) {
    if (!own || !myUserId) return;
    setStatVisibility((v) => {
      const next = { ...v, [key]: !v[key] };
      supabase.from("profiles").update({ stat_visibility: next }).eq("id", myUserId);
      return next;
    });
  }

  function toggleGalleryVisible() {
    if (!own || !myUserId) return;
    setGalleryVisible((v) => {
      const next = !v;
      supabase.from("profiles").update({ gallery_visible: next }).eq("id", myUserId);
      return next;
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

  const initial = name.charAt(0).toUpperCase();
  const dailyActivity = activityStats ? buildDailyActivity(activityStats.daily) : buildDailyActivity({});
  const dailyMax = Math.max(1, ...dailyActivity.map((d) => d.hours));
  const statRows: { key: string; icon: IconName; label: string; value: string }[] = [
    { key: "joinDate", icon: "calendar", label: "Katılım Tarihi", value: joinDateMs ? formatDate(joinDateMs) : "—" },
    {
      key: "totalHours",
      icon: "clock",
      label: "LUNA Süresi",
      value: activityStats ? formatHours(activityStats.totalHours) : "—",
    },
    { key: "friends", icon: "people", label: "Arkadaşlar", value: String(friendCount) },
    {
      key: "longestSession",
      icon: "hourglass",
      label: "En Uzun Oturum",
      value: activityStats ? formatHours(activityStats.longestSessionHours) : "—",
    },
    {
      key: "biggestRoom",
      icon: "people",
      label: "En Büyük Odanız",
      value: activityStats && activityStats.biggestRoom > 0 ? `${activityStats.biggestRoom} kişi` : "—",
    },
  ];

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onBack} hitSlop={10}>
            <Icon name="chevronLeft" size={22} color={TEXT} />
          </TouchableOpacity>
          {!own && (
            <TouchableOpacity onPress={() => placeholder("Diger")} hitSlop={10}>
              <Icon name="moreHoriz" size={22} color={TEXT} />
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity
          style={styles.avatarWrap}
          activeOpacity={own ? 0.8 : 1}
          onPress={() => own && setAvatarSheetVisible(true)}
          disabled={!own}
        >
          <View style={styles.ringOuter}>
            <View style={styles.ringMiddle}>
              <View style={styles.avatarCore}>
                {uploadingAvatar ? (
                  <ActivityIndicator color={ACCENT} />
                ) : avatarUrl ? (
                  <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
                ) : (
                  <Text style={styles.avatarInitial}>{initial}</Text>
                )}
              </View>
            </View>
            {own && (
              <View style={styles.editBadge}>
                <Icon name="edit" size={13} color={BG} />
              </View>
            )}
          </View>
        </TouchableOpacity>

        <View style={styles.nameBlock}>
          {editingField === "name" ? (
            <TextInput
              style={styles.nameInput}
              value={name}
              onChangeText={setName}
              autoFocus
              onSubmitEditing={() => closeFieldEdit("name", name)}
              onBlur={() => closeFieldEdit("name", name)}
            />
          ) : (
            <TouchableOpacity disabled={!own} onPress={() => toggleFieldEdit("name")}>
              <Text style={styles.name}>{name.toUpperCase()}</Text>
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
                <Text style={styles.handle}>@{handle}</Text>
                {!own && <CountryFlag country={country} size={13} />}
              </View>
            </TouchableOpacity>
          )}
          {!own && (
            <View style={styles.presenceRow}>
              <View style={[styles.onlineDot, !isOnline && styles.offlineDot]} />
              <Text style={styles.presenceText}>{isOnline ? "Çevrimiçi" : "Çevrimdışı"}</Text>
            </View>
          )}
        </View>
        {editingField === "bio" ? (
          <TextInput
            style={styles.bioInput}
            value={bio}
            onChangeText={setBio}
            multiline
            autoFocus
            onBlur={() => closeFieldEdit("bio", bio)}
            placeholder="Biyografi"
            placeholderTextColor={MUTED}
          />
        ) : (
          <TouchableOpacity disabled={!own} onPress={() => toggleFieldEdit("bio")}>
            <Text style={styles.bio}>{bio}</Text>
          </TouchableOpacity>
        )}

        {!own && (
          <View style={styles.actionRow}>
            {friendStatus === "friends" ? (
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={() =>
                  onOpenDM
                    ? onOpenDM({ userId: peerUserId, name, handle })
                    : placeholder("Mesaj")
                }
              >
                <Text style={styles.primaryButtonText}>Mesaj</Text>
              </TouchableOpacity>
            ) : friendStatus === "pending" ? (
              <TouchableOpacity style={styles.secondaryButton} onPress={cancelFriendRequest}>
                <Text style={styles.secondaryButtonText}>İsteği İptal Et</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.primaryButton} onPress={sendFriendRequest}>
                <Text style={styles.primaryButtonText}>İstek Gönder</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {activeRoom && (
          <>
            <Text style={styles.sectionHeader}>AKTİF ODA</Text>
            <RoomCard
              room={activeRoom}
              onPress={() => onOpenRoomPreview?.(activeRoom)}
              style={styles.activeRoomCard}
            />
          </>
        )}

        {(own || galleryVisible) && (own || galleryPhotos.length > 0) && (
          <>
            <View style={styles.sectionHeaderRow}>
              <Text style={[styles.sectionHeader, { marginBottom: 0 }]}>GALERİ</Text>
              {own && (
                <View style={styles.sectionHeaderActions}>
                  <TouchableOpacity onPress={pickGalleryPhotos} hitSlop={6} disabled={uploadingGalleryPhoto}>
                    {uploadingGalleryPhoto ? (
                      <ActivityIndicator color={ACCENT} size="small" />
                    ) : (
                      <Icon name="plus" size={16} color={ACCENT} />
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity onPress={toggleGalleryVisible} hitSlop={6}>
                    <Icon name={galleryVisible ? "eye" : "eyeOff"} size={16} color={galleryVisible ? ACCENT : MUTED} />
                  </TouchableOpacity>
                </View>
              )}
            </View>
            {galleryPhotos.length === 0 ? (
              <Text style={styles.emptyHistoryText}>Henüz galeriye fotoğraf eklemedin.</Text>
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.galleryScroll}
                contentContainerStyle={styles.galleryRow}
              >
                {galleryPhotos.map((photo) => (
                  <TouchableOpacity
                    key={photo.id}
                    style={styles.galleryThumb}
                    activeOpacity={own ? 0.7 : 1}
                    onLongPress={own ? () => confirmDeleteGalleryPhoto(photo) : undefined}
                  >
                    <Image source={{ uri: photo.url }} style={styles.galleryThumbImage} />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </>
        )}

        <Text style={styles.sectionHeader}>İSTATİSTİKLER</Text>
        <View style={styles.statsSection}>
          <View style={styles.statsGrid}>
            {statRows.map((stat) => {
              const visible = statVisibility[stat.key];
              if (!own && !visible) return null;
              return (
                <View key={stat.key} style={styles.statCard}>
                  {own && (
                    <TouchableOpacity style={styles.statCardEye} onPress={() => toggleStat(stat.key)} hitSlop={8}>
                      <Icon name={visible ? "eye" : "eyeOff"} size={14} color={visible ? ACCENT : MUTED} />
                    </TouchableOpacity>
                  )}
                  <View style={styles.statCardIconWrap}>
                    <Icon name={stat.icon} size={15} color={ACCENT} />
                  </View>
                  <Text style={styles.statCardValue} numberOfLines={1}>
                    {stat.value}
                  </Text>
                  <Text style={styles.statCardLabel}>{stat.label}</Text>
                </View>
              );
            })}
          </View>

          {(own || statVisibility.activityChart) && (
            <View style={styles.chartCard}>
              <View style={styles.chartCardHeader}>
                <Text style={styles.chartCardTitle}>Günlük Saatler</Text>
                {own && (
                  <TouchableOpacity onPress={() => toggleStat("activityChart")} hitSlop={6}>
                    <Icon
                      name={statVisibility.activityChart ? "eye" : "eyeOff"}
                      size={16}
                      color={statVisibility.activityChart ? ACCENT : MUTED}
                    />
                  </TouchableOpacity>
                )}
              </View>
              <View style={styles.chartBars}>
                {dailyActivity.map((d, i) => (
                  <TouchableOpacity key={d.date + i} style={styles.chartBarTouch} onPress={() => setSelectedDay(i)}>
                    <View
                      style={[
                        styles.chartBar,
                        {
                          height: Math.max(4, (d.hours / dailyMax) * 70),
                          backgroundColor: i === selectedDay ? ACCENT : "#2A4A32",
                        },
                      ]}
                    />
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.chartSelected}>
                {dailyActivity[selectedDay].date} · {formatHours(dailyActivity[selectedDay].hours)}
              </Text>
            </View>
          )}
        </View>

        {(own || videosVisible) && (own || history.length > 0) && (
          <>
            <View style={styles.sectionHeaderRow}>
              <Text style={[styles.sectionHeader, { marginBottom: 0 }]}>GEÇMİŞ</Text>
              {own && (
                <TouchableOpacity onPress={toggleVideosVisible} hitSlop={6}>
                  <Icon name={videosVisible ? "eye" : "eyeOff"} size={16} color={videosVisible ? ACCENT : MUTED} />
                </TouchableOpacity>
              )}
            </View>
            {history.length === 0 ? (
              <Text style={styles.emptyHistoryText}>Henüz bir odaya katılmadın.</Text>
            ) : (
              <View style={styles.videoGrid}>
                {history.map((item) => (
                  <View key={`v-${item.roomCode}-${item.createdAt}`} style={styles.videoCard}>
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
                    <Text style={styles.videoMeta}>{timeAgo(item.createdAt)}</Text>
                  </View>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>

      <Modal
        visible={avatarSheetVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setAvatarSheetVisible(false)}
      >
        <TouchableOpacity
          style={styles.sheetOverlay}
          activeOpacity={1}
          onPress={() => setAvatarSheetVisible(false)}
        >
          <TouchableOpacity activeOpacity={1} style={styles.sheetCard}>
            <TouchableOpacity style={styles.sheetRow} onPress={pickFromGallery}>
              <Text style={styles.sheetRowText}>Fotoğraflar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.sheetRow} onPress={removeAvatar}>
              <Text style={styles.sheetRowText}>Fotoğrafı Kaldır</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.sheetRow} onPress={() => setAvatarSheetVisible(false)}>
              <Text style={[styles.sheetRowText, styles.sheetCancelText]}>Kapat</Text>
            </TouchableOpacity>
            <View style={styles.sheetHandle} />
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG },
  scrollContent: { paddingHorizontal: 24, paddingTop: 50, paddingBottom: 40 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 8, marginBottom: 26 },
  avatarWrap: { alignItems: "center", marginBottom: 18 },
  ringOuter: {
    width: 128,
    height: 128,
    borderRadius: 64,
    backgroundColor: "#2A2422",
    alignItems: "center",
    justifyContent: "center",
  },
  ringMiddle: {
    width: 108,
    height: 108,
    borderRadius: 54,
    backgroundColor: "#17130F",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarCore: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: "#3A2F22",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: { color: ACCENT, fontSize: 32, fontWeight: "700" },
  avatarImage: { width: 88, height: 88, borderRadius: 44 },
  editBadge: {
    position: "absolute",
    right: 0,
    bottom: 0,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: ACCENT,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: BG,
  },
  nameBlock: { alignItems: "center", marginBottom: 6 },
  name: { color: TEXT, fontSize: 24, fontWeight: "700", letterSpacing: 0.5 },
  nameInput: {
    color: TEXT,
    fontSize: 24,
    fontWeight: "700",
    borderBottomWidth: 1,
    borderBottomColor: MUTED,
    minWidth: 140,
    textAlign: "center",
  },
  handleRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2 },
  handle: { color: MUTED, fontSize: 12 },
  presenceRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 },
  presenceText: { color: MUTED, fontSize: 11, fontWeight: "600" },
  handleEditRow: { flexDirection: "row", alignItems: "center", marginTop: 4 },
  handleAt: { color: MUTED, fontSize: 13 },
  handleInput: {
    color: TEXT,
    fontSize: 13,
    borderBottomWidth: 1,
    borderBottomColor: MUTED,
    minWidth: 100,
    paddingVertical: 2,
  },
  bio: { color: "#C9BFAE", fontSize: 12, textAlign: "center", marginBottom: 20 },
  bioInput: {
    color: "#C9BFAE",
    fontSize: 12,
    textAlign: "center",
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#3A332C",
    borderRadius: 8,
    padding: 10,
    minHeight: 50,
  },
  actionRow: { flexDirection: "row", gap: 10, marginBottom: 24 },
  activeRoomCard: { margin: 0, marginBottom: 24 },
  sectionHeaderActions: { flexDirection: "row", alignItems: "center", gap: 14 },
  galleryScroll: { marginBottom: 24 },
  galleryRow: { gap: 10 },
  galleryThumb: { width: 84, height: 84, borderRadius: 10, overflow: "hidden" },
  galleryThumbImage: { width: "100%", height: "100%" },
  emptyHistoryText: { color: MUTED, fontSize: 12, marginBottom: 24 },
  statsSection: { marginBottom: 24 },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 10 },
  statCard: {
    width: "48%",
    backgroundColor: "#141210",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#2A2422",
    padding: 14,
  },
  statCardEye: { position: "absolute", top: 10, right: 10 },
  onlineDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: ACCENT },
  offlineDot: { backgroundColor: MUTED },
  statCardIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(46,204,113,0.12)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  statCardValue: { color: TEXT, fontSize: 17, fontWeight: "700", marginBottom: 2 },
  statCardLabel: { color: MUTED, fontSize: 11.5, fontWeight: "600" },
  chartCard: {
    backgroundColor: "#141210",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#2A2422",
    padding: 14,
  },
  chartCardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  chartCardTitle: { color: TEXT, fontSize: 13, fontWeight: "700" },
  chartBars: { flexDirection: "row", alignItems: "flex-end", gap: 6, height: 70, marginTop: 6, marginBottom: 10 },
  chartBarTouch: { flex: 1, alignItems: "center", justifyContent: "flex-end", height: "100%" },
  chartBar: { width: "100%", borderRadius: 2 },
  chartSelected: { color: MUTED, fontSize: 11, textAlign: "center" },
  primaryButton: { flex: 1, backgroundColor: ACCENT, borderRadius: 6, paddingVertical: 13, alignItems: "center" },
  primaryButtonText: { color: BG, fontSize: 13, fontWeight: "700" },
  secondaryButton: {
    flex: 1,
    backgroundColor: "transparent",
    borderRadius: 6,
    paddingVertical: 13,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#3A332C",
  },
  secondaryButtonText: { color: TEXT, fontSize: 13, fontWeight: "700" },
  sectionHeader: { color: MUTED, fontSize: 10, letterSpacing: 1.5, marginBottom: 10 },
  sectionHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  videoGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  videoCard: { width: "31%", marginBottom: 18 },
  videoThumb: {
    width: "100%",
    aspectRatio: 16 / 9,
    borderRadius: 8,
    backgroundColor: "#17130F",
    borderWidth: 1,
    borderColor: "#2A2422",
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
    backgroundColor: "#141210",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingTop: 8,
    paddingBottom: 30,
    alignItems: "center",
  },
  sheetRow: { width: "100%", paddingVertical: 18, alignItems: "center", borderBottomWidth: 1, borderColor: "#2A2422" },
  sheetRowText: { color: TEXT, fontSize: 16, fontWeight: "700" },
  sheetCancelText: { color: MUTED },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "#3A332C", marginTop: 14 },
});
