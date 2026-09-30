import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  TextInput,
  BackHandler,
  Modal,
} from "react-native";
import { supabase } from "../services/supabase";
import { getSocket } from "../services/socket";
import Icon, { IconName } from "../components/Icon";
import CountryFlag from "../components/CountryFlag";

interface Props {
  onBack: () => void;
  own?: boolean;
  peer?: { userId: string; name: string; handle?: string };
  onOpenDM?: (peer: { userId: string; name: string; handle?: string }) => void;
}

const ACCENT = "#2ECC71";
const BG = "#000000";
const TEXT = "#F5F0E6";
const MUTED = "#9A8F80";

// Su an gercek bir "kullanicilar arasi gezinme" ekrani yok - baskasinin
// profilini (own=false) test etmek icin sabit bir demo kimlik kullaniyoruz.
const DEMO_PEER_USER_ID = "demo-peer-kullanici";

const GALLERY_COLORS = ["#2E4A2F", "#3A2F22", "#1F3D24", "#4A3B22", "#274A2A", "#33291D"];

const STAT_DEFS: { key: string; icon: IconName; label: string; value: string }[] = [
  { key: "joinDate", icon: "calendar", label: "Katılım Tarihi", value: "Aralık 16 2025" },
  { key: "totalHours", icon: "clock", label: "LUNA Süresi", value: "758 saat" },
  { key: "friends", icon: "people", label: "Arkadaşlar", value: "18" },
  { key: "longestSession", icon: "hourglass", label: "En Uzun Oturum", value: "53 saat" },
  { key: "biggestRoom", icon: "people", label: "En Büyük Odanız", value: "14 kişi" },
];

const DEFAULT_STAT_VISIBILITY: Record<string, boolean> = {
  joinDate: false,
  totalHours: true,
  activityChart: false,
  friends: true,
  longestSession: true,
  biggestRoom: true,
};

const ACTIVITY = [
  { date: "1 Eyl", hours: 3 },
  { date: "3 Eyl", hours: 6 },
  { date: "5 Eyl", hours: 1 },
  { date: "6 Eyl", hours: 8 },
  { date: "7 Eyl", hours: 2 },
  { date: "8 Eyl", hours: 0 },
  { date: "9 Eyl", hours: 5 },
  { date: "10 Eyl", hours: 9 },
  { date: "11 Eyl", hours: 15.1 },
];
const ACTIVITY_MAX = Math.max(...ACTIVITY.map((d) => d.hours));

type VideoTabKey = "best" | "history" | "likes";

const VIDEO_TABS: { key: VideoTabKey; label: string }[] = [
  { key: "best", label: "En İyiler" },
  { key: "history", label: "Geçmiş" },
  { key: "likes", label: "Beğenilenler" },
];

const VIDEOS: Record<VideoTabKey, { title: string; duration: string; meta: string }[]> = {
  best: [
    { title: "Stranger Things", duration: "5:11", meta: "340 görüntüleme" },
    { title: "Müzik Gecesi", duration: "6:04", meta: "210 görüntüleme" },
    { title: "Gece Sohbeti", duration: "4:35", meta: "180 görüntüleme" },
  ],
  history: [
    { title: "Deneme Videosu", duration: "3:02", meta: "42 görüntüleme" },
    { title: "Netflix Gecesi", duration: "2:47", meta: "30 görüntüleme" },
    { title: "Stranger Things", duration: "5:11", meta: "340 görüntüleme" },
  ],
  likes: [
    { title: "Müzik Klibi", duration: "3:39", meta: "128 görüntüleme" },
    { title: "Konser Kaydı", duration: "6:20", meta: "96 görüntüleme" },
  ],
};

/** "Vinil Kayıt" konsepti - kartelanın (bkz. tasarım oturumu) ilk seçeneği,
 * kullanıcının kendi profili (own) ve başkasının profili (!own) icin
 * ortak bir govde uzerinde farkli baslik/aksiyon satiri gosterir. */
export default function UserProfileScreen({ onBack, own = true, peer, onOpenDM }: Props) {
  const peerUserId = peer?.userId || DEMO_PEER_USER_ID;
  const [name, setName] = useState(peer?.name || "Kullanici");
  const [handle, setHandle] = useState(peer?.handle || "kullanici");
  const [bio, setBio] = useState(own ? "Gece geç saat film ve dizi maratonları." : "");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [country, setCountry] = useState<string | null>(null);
  const [avatarSheetVisible, setAvatarSheetVisible] = useState(false);
  const [editingField, setEditingField] = useState<"name" | "handle" | "bio" | null>(null);
  const [activeTab, setActiveTab] = useState<VideoTabKey>("best");
  const [galleryVisible, setGalleryVisible] = useState<boolean[]>(GALLERY_COLORS.map(() => true));
  const [statVisibility, setStatVisibility] = useState(DEFAULT_STAT_VISIBILITY);
  const [selectedDay, setSelectedDay] = useState(ACTIVITY.length - 1);
  const [videosVisible, setVideosVisible] = useState(true);
  const [friendStatus, setFriendStatus] = useState<"none" | "pending" | "friends">("none");

  useEffect(() => {
    if (!own) return;
    supabase.auth.getUser().then(({ data }) => {
      const email = data.user?.email;
      if (email) {
        const prefix = email.split("@")[0];
        setName(prefix);
        setHandle(prefix.toLowerCase());
      }
    });
  }, [own]);

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      onBack();
      return true;
    });
    return () => sub.remove();
  }, [onBack]);

  useEffect(() => {
    if (own) return;
    const socket = getSocket();
    // Gercek katilimcinin isim/handle/avatar/bio/ulke bilgisini getirir -
    // avatar taplandiginda elimizde sadece isim/userId oluyor, geri kalani
    // (handle, bio, ulke bayragi) burada tamamlaniyor.
    socket.emit("user:profile", { userId: peerUserId }, (res: any) => {
      if (res?.ok && res.profile) {
        setName(res.profile.name || name);
        if (res.profile.handle) setHandle(res.profile.handle);
        if (res.profile.bio) setBio(res.profile.bio);
        if (res.profile.avatarUrl) setAvatarUrl(res.profile.avatarUrl);
        setCountry(res.profile.country || null);
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

  function placeholder(label: string) {
    Alert.alert(label, "Bu ozellik yakinda eklenecek.");
  }

  function sendFriendRequest() {
    getSocket().emit("friend:request", { toUserId: peerUserId }, (res: any) => {
      if (res?.ok) setFriendStatus("pending");
    });
  }

  function cancelFriendRequest() {
    getSocket().emit("friend:cancel", { toUserId: peerUserId }, () => setFriendStatus("none"));
  }

  function toggleFieldEdit(field: "name" | "handle" | "bio") {
    if (!own) return;
    setEditingField((v) => (v === field ? null : field));
  }

  function removeAvatar() {
    setAvatarUrl("");
    setAvatarSheetVisible(false);
  }

  function pickFromGallery() {
    setAvatarSheetVisible(false);
    placeholder("Fotoğraf Seç");
  }

  function toggleGalleryItem(i: number) {
    if (!own) return;
    setGalleryVisible((v) => v.map((x, idx) => (idx === i ? !x : x)));
  }

  function toggleStat(key: string) {
    if (!own) return;
    setStatVisibility((v) => ({ ...v, [key]: !v[key] }));
  }

  const initial = name.charAt(0).toUpperCase();

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onBack} hitSlop={10}>
            <Icon name="chevronLeft" size={22} color={TEXT} />
          </TouchableOpacity>
          {!own && (
            <TouchableOpacity onPress={() => placeholder("Diger")} hitSlop={10}>
              <Icon name="moreHoriz" size={20} color={TEXT} />
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
                {avatarUrl ? (
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
              onSubmitEditing={() => setEditingField(null)}
              onBlur={() => setEditingField(null)}
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
                onSubmitEditing={() => setEditingField(null)}
                onBlur={() => setEditingField(null)}
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
        </View>
        {editingField === "bio" ? (
          <TextInput
            style={styles.bioInput}
            value={bio}
            onChangeText={setBio}
            multiline
            autoFocus
            onBlur={() => setEditingField(null)}
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

        <Text style={styles.sectionHeader}>GALERİ</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.galleryScroll}
          contentContainerStyle={styles.galleryRow}
        >
          {own && (
            <TouchableOpacity style={styles.galleryAddBtn} onPress={() => placeholder("Fotoğraf Ekle")}>
              <Icon name="plus" size={22} color={BG} />
            </TouchableOpacity>
          )}
          {GALLERY_COLORS.map((c, i) => {
            const visible = galleryVisible[i];
            if (!own && !visible) return null;
            return (
              <View key={i} style={[styles.galleryThumb, { backgroundColor: c }]}>
                {own && (
                  <TouchableOpacity style={styles.galleryEyeBadge} onPress={() => toggleGalleryItem(i)} hitSlop={6}>
                    <Icon name={visible ? "eye" : "eyeOff"} size={12} color={visible ? ACCENT : MUTED} />
                  </TouchableOpacity>
                )}
              </View>
            );
          })}
        </ScrollView>

        <Text style={styles.sectionHeader}>İSTATİSTİKLER</Text>
        <View style={styles.statsBlock}>
          <View style={styles.statRow}>
            <View style={styles.onlineDot} />
            <Text style={styles.statRowLabel}>Çevrimiçi</Text>
          </View>
          {STAT_DEFS.map((stat) => {
            const visible = statVisibility[stat.key];
            if (!own && !visible) return null;
            return (
              <View key={stat.key} style={styles.statRow}>
                <Icon name={stat.icon} size={16} color={TEXT} />
                <Text style={styles.statRowLabel}>{stat.label}</Text>
                <Text style={styles.statRowValue}>{stat.value}</Text>
                {own && (
                  <TouchableOpacity onPress={() => toggleStat(stat.key)} hitSlop={6}>
                    <Icon name={visible ? "eye" : "eyeOff"} size={18} color={visible ? ACCENT : MUTED} />
                  </TouchableOpacity>
                )}
              </View>
            );
          })}

          {(own || statVisibility.activityChart) && (
            <View style={styles.chartBlock}>
              <View style={styles.statRow}>
                <Text style={styles.statRowLabel}>Günlük Saatler</Text>
                {own && (
                  <TouchableOpacity onPress={() => toggleStat("activityChart")} hitSlop={6}>
                    <Icon
                      name={statVisibility.activityChart ? "eye" : "eyeOff"}
                      size={18}
                      color={statVisibility.activityChart ? ACCENT : MUTED}
                    />
                  </TouchableOpacity>
                )}
              </View>
              <View style={styles.chartBars}>
                {ACTIVITY.map((d, i) => (
                  <TouchableOpacity key={d.date} style={styles.chartBarTouch} onPress={() => setSelectedDay(i)}>
                    <View
                      style={[
                        styles.chartBar,
                        {
                          height: Math.max(4, (d.hours / ACTIVITY_MAX) * 70),
                          backgroundColor: i === selectedDay ? ACCENT : "#2A4A32",
                        },
                      ]}
                    />
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.chartSelected}>
                {ACTIVITY[selectedDay].date} · {ACTIVITY[selectedDay].hours} saat
              </Text>
            </View>
          )}
        </View>

        {(own || videosVisible) && (
          <>
            <View style={styles.sectionHeaderRow}>
              <Text style={[styles.sectionHeader, { marginBottom: 0 }]}>VİDEOLAR</Text>
              {own && (
                <TouchableOpacity onPress={() => setVideosVisible((v) => !v)} hitSlop={6}>
                  <Icon name={videosVisible ? "eye" : "eyeOff"} size={16} color={videosVisible ? ACCENT : MUTED} />
                </TouchableOpacity>
              )}
            </View>
            <View style={styles.tabsRow}>
              {VIDEO_TABS.map((tab) => (
                <TouchableOpacity key={tab.key} style={styles.tabItem} onPress={() => setActiveTab(tab.key)}>
                  <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>{tab.label}</Text>
                  {activeTab === tab.key && <View style={styles.tabUnderline} />}
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.videoGrid}>
              {VIDEOS[activeTab].map((video, i) => (
                <View key={video.title + i} style={styles.videoCard}>
                  <View style={styles.videoThumb}>
                    <View style={styles.videoPlayBadge}>
                      <Icon name="play" size={11} color={TEXT} />
                    </View>
                    <Text style={styles.videoDurationBadge}>{video.duration}</Text>
                  </View>
                  <Text style={styles.videoTitle} numberOfLines={2}>
                    {video.title}
                  </Text>
                  <Text style={styles.videoMeta}>{video.meta}</Text>
                </View>
              ))}
            </View>
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
  galleryScroll: { marginBottom: 24 },
  galleryRow: { gap: 10 },
  galleryAddBtn: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: TEXT,
    alignItems: "center",
    justifyContent: "center",
  },
  galleryThumb: { width: 84, height: 84, borderRadius: 10, position: "relative" },
  galleryEyeBadge: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  statsBlock: {
    paddingVertical: 4,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#2A2422",
    marginBottom: 24,
  },
  statRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10 },
  onlineDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: ACCENT },
  statRowLabel: { flex: 1, color: TEXT, fontSize: 13, fontWeight: "600" },
  statRowValue: { color: MUTED, fontSize: 13 },
  chartBlock: { paddingTop: 4, paddingBottom: 12 },
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
  tabsRow: { flexDirection: "row", gap: 16, marginBottom: 16 },
  tabItem: { alignItems: "center" },
  tabText: { color: MUTED, fontSize: 12, fontWeight: "600" },
  tabTextActive: { color: TEXT },
  tabUnderline: { height: 2, width: "100%", backgroundColor: ACCENT, borderRadius: 1, marginTop: 6 },
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
    position: "relative",
  },
  videoPlayBadge: {
    position: "absolute",
    top: 5,
    left: 5,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  videoDurationBadge: {
    position: "absolute",
    bottom: 5,
    right: 5,
    color: TEXT,
    fontSize: 9,
    fontWeight: "700",
    backgroundColor: "rgba(0,0,0,0.7)",
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
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
