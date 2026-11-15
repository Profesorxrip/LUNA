import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, FlatList } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { ChevronLeft, Users, Clock, Bell } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { getSocket, FriendUser, RecentRoommate, DMMessage } from "../services/socket";
import { theme } from "../theme";
import AppBackground from "../components/AppBackground";
import Avatar from "../components/Avatar";
import Icon from "../components/Icon";
import { showAlert } from "../components/CustomAlert";
import LoadingView from "../components/LoadingView";
import ShareRoomContent from "../components/ShareRoomContent";
import ProfileOptionsSheet, { ProfileOptionsTarget } from "../components/ProfileOptionsSheet";
import { DMPeer } from "./DMScreen";

interface Props {
  onBack: () => void;
  onOpenDM: (peer: DMPeer) => void;
  onOpenParticipant: (peer: { userId: string; name: string; handle?: string }) => void;
  // Oda icindeki Katilimcilar panelinin davet ikonundan acildiginda true -
  // "Arkadaslar" sekmesindeki satirlar DM yerine coklu secim (tik) ile
  // calisir, en az bir kisi secilince altta "Davet At" butonu belirir (bkz.
  // RoomScreen.tsx/ParticipantsModal.tsx onInvite, server/src/index.ts
  // "room:invite"). Sekmeler/istekler ayni ekranda kalir, sadece bu mod
  // Arkadaslar sekmesine zorlar (davet SADECE gercek arkadaslara gider).
  inviteMode?: boolean;
  excludeUserIds?: string[];
  onSendInvites?: (userIds: string[]) => void;
  // inviteMode'da "Engellendi" sekmesinin YERINI ALAN "Paylas" sekmesinin
  // icerigi (ShareRoomContent) icin gerekli - AYRI bir ekran ACMAZ, digerleri
  // gibi ayni sekme cubugunun altinda gosterilir (bkz. RoomScreen.tsx).
  roomCode?: string;
  roomTitle?: string;
  /** true ise "Arkadaşlar" TAB'i olarak kullanilir - bu ekranin donecegi
   * bir "geri" hedefi yoktur (tab kalicidir), bu yuzden sol-ust geri oku
   * yerine sag taraftakiyle ayni gorunmez bosluk gosterilir. RoomScreen.tsx'
   * teki davet-modu Modal kullanimini ETKILEMEZ (orada verilmiyor). */
  embedded?: boolean;
}

type Tab = "friends" | "recent" | "blocked" | "share" | "requests";

const ACCENT = "#0EA5E9";
const TEXT = "#F5F0E6";
const MUTED = "#9A8F80";

function relativeTime(ts: number, t: (key: string, opts?: any) => string): string {
  const diffMs = Date.now() - ts;
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return t("friends.justNow");
  if (min < 60) return t("friends.minutesAgo", { count: min });
  const hour = Math.floor(min / 60);
  if (hour < 24) return t("friends.hoursAgo", { count: hour });
  const day = Math.floor(hour / 24);
  return t("friends.daysAgo", { count: day });
}

/** Rave'in "Arkadaslar" ekraninin yapisinin bir kopyasi - Discover'daki
 * cark/kesif basligini paylasir, altta 3 sekmeli (Arkadaslar / Son
 * Zamanlarda / Engellendi) bir liste - LUNA'nin siyah/yesil temasiyla.
 * Bekleyen arkadaslik istekleri burada degil, arama cubugunun yanindaki
 * "Istekler" butonuyla acilan ayri bir sheet'te (bkz. asagisi). */
export default function FriendsScreen({
  onBack,
  onOpenDM,
  onOpenParticipant,
  inviteMode = false,
  excludeUserIds = [],
  onSendInvites,
  roomCode,
  roomTitle,
  embedded = false,
}: Props) {
  const { t } = useTranslation();
  const socket = getSocket();
  const [tab, setTab] = useState<Tab>("friends");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [friends, setFriends] = useState<FriendUser[]>([]);
  const [incoming, setIncoming] = useState<FriendUser[]>([]);
  const [blocked, setBlocked] = useState<FriendUser[]>([]);
  const [recentRoommates, setRecentRoommates] = useState<RecentRoommate[]>([]);
  const [previews, setPreviews] = useState<Record<string, DMMessage | null>>({});
  const [loading, setLoading] = useState(true);
  // "Son Zamanlarda" sekmesinde bu oturumda istek gonderilen kullanicilar -
  // sunucu bize ayrica "giden istekler" listesi dondurmedigi icin (bkz.
  // friends:list - kasten sadeleştirildi) sadece bu ekranda, bu oturumda
  // gonderilenleri hatirliyoruz; buton kum saatine donup iptal edilebiliyor.
  const [sentRequests, setSentRequests] = useState<Set<string>>(new Set());
  // Engeli kaldirinca satir hemen kaybolmuyor - "arkadaslik istegi gonder"
  // ikonuna donup, sekme degistirilip geri donulene (ya da son zamanlarda/
  // arkadaslara gecilene) kadar orada kaliyor; o an refresh() gercek
  // (artik engelli olmayan) listeyi getirip satiri dogal olarak kaldiriyor.
  const [unblockedIds, setUnblockedIds] = useState<Set<string>>(new Set());
  // "Son Zamanlarda" sekmesindeki kisi GERCEKTEN arkadasimiz da olabilir -
  // o satirda da mavi "arkadas halkasi" (bkz. Avatar.tsx isFriend) gorunsun.
  const friendIds = useMemo(() => new Set(friends.map((f) => f.userId)), [friends]);
  // "Arkadaşlar"/"Son Zamanlarda" satirina BASILI TUTUNCA acilan kucuk
  // profil karti - RoomScreen.tsx/DiscoverScreen.tsx'teki AYNI bilesen, ama
  // engeli kaldirma/bildirme verilmedigi icin kart hep Profil + (arkadassa
  // "Arkadaşı sil", degilse "İstek at"/"İsteği iptal et") + Engelle
  // disinda bir satir gostermez.
  const [profileCardTarget, setProfileCardTarget] = useState<ProfileOptionsTarget | null>(null);
  // "Arkadaşı Sil" / "Reddet" basinca GERCEK sunucu cagrisi HEMEN yapilmiyor -
  // satir optimistik olarak hemen kayboluyor ve birkac saniyelik bir "Geri Al"
  // penceresi aciliyor; bu surede "Geri Al"a basilirsa sunucuya HICBIR SEY
  // gonderilmeden satir geri gelir, basilmazsa sure dolunca gercek istek
  // (friend:remove / friend:respond) gonderilir.
  const [undoBanner, setUndoBanner] = useState<{ message: string; onUndo: () => void } | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingCommitRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    };
  }, []);

  function scheduleUndo(message: string, onUndo: () => void, onCommit: () => void) {
    // Zaten bekleyen baska bir geri-al penceresi varsa, UST USTE binmesin
    // diye onu hemen gerceklestirip (commit) yenisine gecilir.
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
    socket.emit("friends:list", {}, (res: any) => {
      setLoading(false);
      if (!res?.ok) return;
      setFriends(res.friends);
      setIncoming(res.incoming);
      setBlocked(res.blocked);
      setRecentRoommates(res.recentRoommates || []);
      res.friends.forEach((f: FriendUser) => {
        socket.emit("dm:preview", { withUserId: f.userId }, (r: any) => {
          if (r?.ok) setPreviews((prev) => ({ ...prev, [f.userId]: r.lastMessage }));
        });
      });
    });
  }, []);

  useEffect(() => {
    refresh();
    socket.on("friend:incoming", refresh);
    socket.on("friend:accepted", refresh);
    socket.on("friend:declined", refresh);
    socket.on("friend:cancelled", refresh);
    socket.on("friend:removed", refresh);
    return () => {
      socket.off("friend:incoming", refresh);
      socket.off("friend:accepted", refresh);
      socket.off("friend:declined", refresh);
      socket.off("friend:cancelled", refresh);
      socket.off("friend:removed", refresh);
    };
  }, [refresh]);

  function accept(fromUserId: string) {
    socket.emit("friend:respond", { fromUserId, accept: true }, () => refresh());
  }

  function decline(fromUserId: string) {
    const target = incoming.find((f) => f.userId === fromUserId);
    if (!target) return;
    setIncoming((prev) => prev.filter((f) => f.userId !== fromUserId));
    scheduleUndo(
      t("friends.declinedUndoMessage", { name: target.name }),
      () => setIncoming((prev) => [target, ...prev]),
      () => socket.emit("friend:respond", { fromUserId, accept: false }, () => refresh())
    );
  }

  function sendFriendRequest(toUserId: string, onSuccess?: () => void) {
    socket.emit("friend:request", { toUserId }, (res: any) => {
      if (res?.ok) {
        // Buton zaten "İptal Et"e donerek GORSEL olarak geri bildirim
        // veriyor - ustune bir de "İstek gonderildi" bilgi kutusu cikmasi
        // gereksiz/rahatsiz ediciydi (kullanicinin geri bildirimi).
        setSentRequests((prev) => new Set(prev).add(toUserId));
        onSuccess?.();
      } else {
        showAlert(t("friends.requestFailedTitle"), t("friends.requestFailedBody"));
      }
    });
  }

  function cancelSentRequest(toUserId: string, onDone?: () => void) {
    socket.emit("friend:cancel", { toUserId }, () => {
      setSentRequests((prev) => {
        const next = new Set(prev);
        next.delete(toUserId);
        return next;
      });
      onDone?.();
    });
  }

  function unblock(userId: string) {
    showAlert(t("friends.unblockConfirmTitle"), t("friends.unblockConfirmBody"), [
      { text: t("common.no"), style: "cancel" },
      {
        text: t("common.yes"),
        onPress: () =>
          socket.emit("friend:unblock", { userId }, () => {
            setUnblockedIds((prev) => new Set(prev).add(userId));
          }),
      },
    ]);
  }

  function openProfileCard(peer: { userId: string; name: string; handle?: string | null; avatarUrl?: string | null; isFriend: boolean }) {
    setProfileCardTarget({
      userId: peer.userId,
      name: peer.name,
      handle: peer.handle ?? undefined,
      avatarUrl: peer.avatarUrl ?? undefined,
      friendStatus: peer.isFriend ? "friends" : sentRequests.has(peer.userId) ? "outgoing" : "none",
    });
  }

  function closeProfileCard() {
    setProfileCardTarget(null);
  }

  function openProfileFromCard(target: ProfileOptionsTarget) {
    if (!target.userId) return;
    onOpenParticipant({ userId: target.userId, name: target.name, handle: target.handle ?? undefined });
  }

  // Kart ACIK KALIRKEN (artik hicbir aksiyon otomatik kapatmiyor, bkz.
  // ProfileOptionsSheet.tsx act/actAndClose) basarili bir istekten sonra
  // dogru butonu gosterebilsin diye friendStatus'u elle guncelliyoruz.
  function patchProfileCardTarget(userId: string | null | undefined, patch: Partial<ProfileOptionsTarget>) {
    if (!userId) return;
    setProfileCardTarget((prev) => (prev && prev.userId === userId ? { ...prev, ...patch } : prev));
  }

  function sendFriendRequestFromCard(target: ProfileOptionsTarget) {
    if (!target.userId) return;
    sendFriendRequest(target.userId, () => patchProfileCardTarget(target.userId, { friendStatus: "outgoing" }));
  }

  function cancelFriendRequestFromCard(target: ProfileOptionsTarget) {
    if (!target.userId) return;
    cancelSentRequest(target.userId, () => patchProfileCardTarget(target.userId, { friendStatus: "none" }));
  }

  function blockFromCard(target: ProfileOptionsTarget) {
    if (!target.userId) return;
    socket.emit("friend:block", { userId: target.userId }, (res: any) => {
      if (res?.ok) {
        showAlert(t("discover.blockedTitle"), t("discover.blockedBody", { name: target.name }));
        refresh();
        patchProfileCardTarget(target.userId, { friendStatus: "blocked" });
      }
    });
  }

  function unblockFromCard(target: ProfileOptionsTarget) {
    if (!target.userId) return;
    socket.emit("friend:unblock", { userId: target.userId }, () => {
      refresh();
      patchProfileCardTarget(target.userId, { friendStatus: "none" });
    });
  }

  function removeFriendFromCard(target: ProfileOptionsTarget) {
    if (!target.userId) return;
    const userId = target.userId;
    const removed = friends.find((f) => f.userId === userId);
    setFriends((prev) => prev.filter((f) => f.userId !== userId));
    patchProfileCardTarget(userId, { friendStatus: "none" });
    scheduleUndo(
      t("friends.removedFriendUndoMessage", { name: target.name }),
      () => {
        setFriends((prev) => [removed ?? { userId, name: target.name, handle: target.handle ?? null, avatarUrl: target.avatarUrl ?? null }, ...prev]);
        patchProfileCardTarget(userId, { friendStatus: "friends" });
      },
      () => socket.emit("friend:remove", { userId }, () => refresh())
    );
  }

  // Arkadaslar/Son Zamanlarda satirlarindaki butonlarin HEPSI AYNI gorunumu
  // paylasiyor - UserProfileScreen.tsx'teki "Takip Et" pill'iyle AYNI
  // mavi-beyaz gradyan cerceve deseni (removeFriendPillBorder/Inner/Text),
  // sadece yazi ve onPress degisiyor.
  function renderActionPill(label: string, onPress: () => void, compact = false) {
    return (
      <TouchableOpacity style={styles.removeFriendPillButton} onPress={onPress}>
        <LinearGradient colors={[ACCENT, "#FFFFFF"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.removeFriendPillBorder}>
          <View style={[styles.removeFriendPillInner, compact && styles.removeFriendPillInnerCompact]}>
            <Text style={styles.removeFriendPillText}>{label.toUpperCase()}</Text>
          </View>
        </LinearGradient>
      </TouchableOpacity>
    );
  }

  function selectTab(next: Tab) {
    setTab(next);
    // "Paylas" bir liste degil - arkadas/istek verisini tekrar cekmeye gerek yok.
    if (next !== "share") refresh();
  }

  function toggleSelect(userId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  const query = search.trim().toLowerCase();
  const filterList = <T extends { name: string; userId: string }>(list: T[]) =>
    query ? list.filter((u) => u.name.toLowerCase().includes(query) || u.userId.toLowerCase().includes(query)) : list;

  const visibleFriends = filterList(friends).filter((f) => !inviteMode || !excludeUserIds.includes(f.userId));
  const visibleBlocked = filterList(blocked);
  const visibleRecentRoommates = filterList(recentRoommates);
  const visibleIncoming = filterList(incoming);

  // "Tumu" - SADECE o an acik olan sekmedeki (Arkadaslar/Son Zamanlarda/
  // Engellendi) kisileri isaretler/kaldirir - digerindeki secimlere
  // dokunmaz, boylece farkli sekmelerden ayri ayri secilenler birikebilir.
  const currentTabIds =
    tab === "friends"
      ? visibleFriends.map((f) => f.userId)
      : tab === "recent"
      ? visibleRecentRoommates.map((f) => f.userId)
      : tab === "blocked"
      ? visibleBlocked.map((f) => f.userId)
      : [];
  const allCurrentTabSelected = currentTabIds.length > 0 && currentTabIds.every((id) => selected.has(id));

  function toggleSelectAllCurrentTab() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allCurrentTabSelected) {
        currentTabIds.forEach((id) => next.delete(id));
      } else {
        currentTabIds.forEach((id) => next.add(id));
      }
      return next;
    });
  }

  return (
    <View style={styles.screen}>
      {/* Embedded modda App.tsx'teki paylasilan AppBackground zaten arkada
          duruyor ama davet modundaki <Modal> KENDI katmaninda acildigi icin
          o paylasilan degradeyi GORMUYOR - bu yuzden ekran burada KENDI
          AppBackground'ini ciziyor (screen'in kendi backgroundColor'u
          transparent, bkz. asagisi). */}
      <AppBackground />
      {/* Embedded (Arkadaslar sekmesi) artik Discover gibi kendi logosunu/
          basligini tekrarlamiyor - ekranin en ustunu dogrudan arama cubugu
          kapliyor. Davet modunda (RoomScreen.tsx Modal icinde) hala odaya
          donus icin bir geri oku gerekiyor. */}
      {!embedded && (
        <View style={styles.header}>
          <TouchableOpacity style={styles.iconTouch} onPress={onBack} hitSlop={8}>
            <ChevronLeft size={26} color={TEXT} strokeWidth={3} />
          </TouchableOpacity>
        </View>
      )}

      {/* Arama cubugu artik Discover ekranindaki beyazdan maviye gecen
          degrade "halka" + dolgu degradesiyle AYNI gorunuyor (bkz.
          DiscoverScreen.tsx searchBarBorder/searchBar). */}
      <View style={[styles.searchRow, embedded && styles.searchRowEmbedded]}>
        <LinearGradient colors={["#FFFFFF", "#38BDF8"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.searchBarBorder}>
          <LinearGradient colors={["#0c1a28", "#13293f", "#1b3752"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.searchBar}>
            <Icon name="search" size={16} color="#FFFFFF" />
            <TextInput
              style={styles.searchInput}
              value={search}
              onChangeText={setSearch}
              placeholder={t("friends.searchPlaceholder")}
              placeholderTextColor="rgba(186,214,235,0.45)"
            />
          </LinearGradient>
        </LinearGradient>
        {inviteMode && tab !== "share" && (
          <TouchableOpacity
            style={[styles.selectAllButton, allCurrentTabSelected && styles.selectAllButtonActive]}
            onPress={toggleSelectAllCurrentTab}
            hitSlop={8}
          >
            <Text style={[styles.selectAllText, allCurrentTabSelected && styles.selectAllTextActive]}>{t("friends.selectAll")}</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Arama cubugunun altindaki sekme cubugu - MediaPickerSheet.tsx'teki
          (platform secim ekrani "Oluştur" grid'i) playlistTabBar ile AYNI
          desen: aktif ikon tam parlak, pasif ikon sonuk, alti tam genislikte
          beyazdan maviye gecen ince bir degrade cizgiyle ayriliyor. Davet
          modunda (RoomScreen.tsx) bu cubuk yerine asagidaki yuzen hap kalmaya
          devam ediyor (Arkadaslar/Son Zamanlarda/Paylas + "Tumunu sec"). */}
      {!inviteMode && (
        <>
          <View style={styles.tabIconBar}>
            <TouchableOpacity
              style={[styles.tabIconBtn, { transform: [{ translateX: 40 }] }]}
              onPress={() => selectTab("friends")}
              hitSlop={8}
            >
              <View style={{ opacity: tab === "friends" ? 1 : 0.35 }}>
                {/* Icon.tsx'teki "people" (ParticipantsIcon) FARKLI bir cizim -
                    burada alttaki Arkadaslar sekme ikonuyla (TabGlowIcon.tsx
                    "Friends", lucide Users) BIREBIR AYNI gorunmesi icin
                    dogrudan lucide'in Users ikonu kullaniliyor. */}
                <Users size={24} color="#FFFFFF" strokeWidth={1.8} />
              </View>
            </TouchableOpacity>
            <TouchableOpacity style={styles.tabIconBtn} onPress={() => selectTab("recent")} hitSlop={8}>
              <View style={{ opacity: tab === "recent" ? 1 : 0.35 }}>
                {/* Icon.tsx'teki "clock" (CustomIcons ClockIcon) FARKLI bir
                    cizim - yanindaki Users ikonuyla (lucide) AYNI cizgi
                    stilinde kalsin diye dogrudan lucide'in Clock ikonu
                    kullaniliyor. */}
                <Clock size={24} color="#FFFFFF" strokeWidth={1.8} />
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tabIconBtn, { transform: [{ translateX: -40 }] }]}
              onPress={() => selectTab("requests")}
              hitSlop={8}
            >
              <View style={{ opacity: tab === "requests" ? 1 : 0.35 }}>
                {/* Icon.tsx'teki "bell" (heroicons BellIcon) FARKLI bir cizim -
                    yanindaki Users/Clock ile AYNI cizgi stilinde kalsin diye
                    dogrudan lucide'in Bell ikonu kullaniliyor. Kirmizi sayi
                    rozeti kullanicinin istegiyle KALDIRILDI. */}
                {/* lucide'nin Bell cizimi 24x24 kutuyu Clock/Users'tan daha
                    dolu kullaniyor - ayni "size" degerinde gozle GORULUR
                    sekilde daha buyuk duruyordu, bu yuzden burada biraz
                    kucultulerek digerleriyle gorsel agirligi esitleniyor. */}
                {/* Bekleyen arkadaslik istegi varsa (incoming dolu) zil ICI
                    DOLU gorunsun diye lucide'in "fill" prop'u devreye giriyor
                    - normalde "none" olan dolgu, varsa stroke ile ayni beyaza
                    boyaniyor. */}
                <Bell size={20} color="#FFFFFF" fill={incoming.length > 0 ? "#FFFFFF" : "none"} strokeWidth={1.8} />
              </View>
            </TouchableOpacity>
          </View>
          <LinearGradient
            colors={["#FFFFFF", "#38BDF8"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.tabIconDivider}
          />
        </>
      )}

      {tab === "friends" && (
        <FlatList
          data={visibleFriends}
          keyExtractor={(f) => f.userId}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={loading ? <LoadingView /> : <Text style={styles.emptyText}>{t("friends.noFriendsYet")}</Text>}
          renderItem={({ item }) => {
            const preview = previews[item.userId];
            const isSelected = selected.has(item.userId);
            return (
              <TouchableOpacity
                style={styles.row}
                onPress={() =>
                  inviteMode
                    ? toggleSelect(item.userId)
                    : onOpenDM({ userId: item.userId, name: item.name, handle: item.handle ?? undefined })
                }
                onLongPress={() => !inviteMode && openProfileCard({ ...item, isFriend: true })}
              >
                <Avatar name={item.name} avatarUrl={item.avatarUrl} size={48} isFriend />
                <View style={styles.rowText}>
                  <Text style={styles.rowName}>{item.name}</Text>
                  {preview && !inviteMode ? (
                    <Text style={styles.rowPreview} numberOfLines={1}>
                      {preview.text} · {relativeTime(preview.createdAt, t)}
                    </Text>
                  ) : (
                    !!item.handle && <Text style={styles.rowHandle}>@{item.handle}</Text>
                  )}
                </View>
                {!inviteMode && renderActionPill(t("profileOptions.removeFriend"), () => removeFriendFromCard(item))}
                {inviteMode && (
                  <View style={[styles.checkbox, isSelected && styles.checkboxChecked]}>
                    {isSelected && <Icon name="check" size={20} color="#04140D" />}
                  </View>
                )}
              </TouchableOpacity>
            );
          }}
        />
      )}

      {tab === "recent" && (
        <FlatList
          data={visibleRecentRoommates}
          keyExtractor={(f) => f.userId}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            loading ? <LoadingView /> : <Text style={styles.emptyText}>{t("friends.noRecentRoommates")}</Text>
          }
          renderItem={({ item }) => {
            const isSelected = selected.has(item.userId);
            return (
              <View style={styles.row}>
                <TouchableOpacity
                  style={styles.rowMain}
                  onPress={() =>
                    inviteMode
                      ? toggleSelect(item.userId)
                      : onOpenParticipant({ userId: item.userId, name: item.name, handle: item.handle ?? undefined })
                  }
                  onLongPress={() => !inviteMode && openProfileCard({ ...item, isFriend: friendIds.has(item.userId) })}
                >
                  <Avatar name={item.name} avatarUrl={item.avatarUrl} size={48} isFriend={friendIds.has(item.userId)} />
                  <View style={styles.rowText}>
                    <Text style={styles.rowName}>{item.name}</Text>
                    {!!item.handle && (
                      <Text style={styles.rowHandle} numberOfLines={1}>
                        @{item.handle}
                      </Text>
                    )}
                  </View>
                </TouchableOpacity>
                <View style={styles.rowActions}>
                  {/* Eskiden burada HER ZAMAN "istek at" ikonu gosteriliyordu,
                      kisi zaten arkadasimiz olsa bile - artik Arkadaslar
                      sekmesindeki AYNI pill butonu, duruma gore (zaten
                      arkadas / istek gonderilmis / hic istek yok) UC FARKLI
                      metinle gosteriliyor. */}
                  {friendIds.has(item.userId)
                    ? renderActionPill(t("profileOptions.removeFriend"), () => removeFriendFromCard(item))
                    : sentRequests.has(item.userId)
                    ? renderActionPill(t("friends.cancelRequestShort"), () => cancelSentRequest(item.userId))
                    : renderActionPill(t("profileOptions.addFriend"), () => sendFriendRequest(item.userId))}
                  {inviteMode && (
                    <TouchableOpacity onPress={() => toggleSelect(item.userId)} hitSlop={8}>
                      <View style={[styles.checkbox, isSelected && styles.checkboxChecked]}>
                        {isSelected && <Icon name="check" size={20} color="#04140D" />}
                      </View>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          }}
        />
      )}

      {/* "Istekler" artik ayri bir sayfa/Modal acmiyor - tipki Arkadaslar/Son
          Zamanlarda gibi AYNI ekranin icinde, zile basinca gecilen bir
          sekme. Satir gorunumu Arkadaslar sekmesiyle AYNI (Avatar+isim+
          kullanici adi), sadece sag tarafta DM yerine kabul/reddet var. */}
      {tab === "requests" && (
        <FlatList
          data={visibleIncoming}
          keyExtractor={(f) => f.userId}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={loading ? <LoadingView /> : <Text style={styles.emptyText}>{t("friends.noPendingRequests")}</Text>}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <Avatar name={item.name} avatarUrl={item.avatarUrl} size={48} />
              <View style={styles.rowText}>
                <Text style={styles.rowName} numberOfLines={1}>
                  {item.name}
                </Text>
                {!!item.handle && (
                  <Text style={styles.rowHandle} numberOfLines={1}>
                    @{item.handle}
                  </Text>
                )}
              </View>
              <View style={styles.requestActions}>
                {/* Eskiden KUCUK, ciplak X/tik ikonlariydi - artik Arkadaslar/
                    Son Zamanlarda'daki AYNI gradyan pill buton (renderActionPill),
                    kullanicinin "son izlenenlerdeki buton tarzıyla aynı olsun"
                    istegi. Iki genis pill yan yana oldugu icin isim/kullanici
                    adi alani daralmisti - numberOfLines ile taskiyor/sarmiyor,
                    tasarsa "..." ile kesiliyor. */}
                {renderActionPill(t("friends.declineRequest"), () => decline(item.userId), true)}
                {renderActionPill(t("friends.acceptRequest"), () => accept(item.userId), true)}
              </View>
            </View>
          )}
        />
      )}

      {tab === "blocked" && (
        <FlatList
          data={visibleBlocked}
          keyExtractor={(f) => f.userId}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={loading ? <LoadingView /> : <Text style={styles.emptyText}>{t("friends.noBlocked")}</Text>}
          renderItem={({ item }) => {
            const isSelected = selected.has(item.userId);
            return (
              <View style={styles.row}>
                <Avatar name={item.name} avatarUrl={item.avatarUrl} size={48} />
                <View style={styles.rowText}>
                  <Text style={styles.rowName}>{item.name}</Text>
                  {!!item.handle && <Text style={styles.rowHandle}>@{item.handle}</Text>}
                </View>
                {inviteMode ? (
                  <TouchableOpacity onPress={() => toggleSelect(item.userId)} hitSlop={8}>
                    <View style={[styles.checkbox, isSelected && styles.checkboxChecked]}>
                      {isSelected && <Icon name="check" size={20} color="#04140D" />}
                    </View>
                  </TouchableOpacity>
                ) : sentRequests.has(item.userId) ? (
                  <TouchableOpacity onPress={() => cancelSentRequest(item.userId)} hitSlop={8}>
                    <Icon name="hourglass" size={22} color={MUTED} />
                  </TouchableOpacity>
                ) : unblockedIds.has(item.userId) ? (
                  <TouchableOpacity onPress={() => sendFriendRequest(item.userId)} hitSlop={8}>
                    <Icon name="invite" size={26} color="#FFFFFF" />
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity onPress={() => unblock(item.userId)} hitSlop={8}>
                    <Icon name="personBan" size={26} color={MUTED} />
                  </TouchableOpacity>
                )}
              </View>
            );
          }}
        />
      )}

      {tab === "share" && !!roomCode && !!roomTitle && <ShareRoomContent roomCode={roomCode} roomTitle={roomTitle} />}

      {inviteMode && selected.size > 0 && (
        <View style={styles.inviteBar}>
          <TouchableOpacity style={styles.inviteButton} onPress={() => onSendInvites?.(Array.from(selected))}>
            <Text style={styles.inviteButtonText}>{t("friends.sendInvites", { count: selected.size })}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Normal "Arkadaşlar" ekranında (davet modu disinda) Son Zamanlarda/
          Engellendi'ye gecisi saglayan yuzen hap sekme cubugu kullanicinin
          istegiyle KALDIRILDI - ekran artik hep "Arkadaslar" listesini
          gosterir. Davet modunda (RoomScreen.tsx katilimci davet akisi)
          Son Zamanlarda/Paylas sekmeleri hala gerekli oldugu icin orada
          aynen duruyor. */}
      {inviteMode && (
        <View style={styles.tabBarWrap}>
          <View style={styles.tabBar}>
            <TouchableOpacity style={styles.tabItem} onPress={() => selectTab("friends")}>
              <Icon name="people" size={24} color={tab === "friends" ? TEXT : MUTED} />
              <Text style={[styles.tabLabel, tab === "friends" && styles.tabLabelActive]}>{t("friends.tabFriends")}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.tabItem} onPress={() => selectTab("recent")}>
              <Icon name="clock" size={24} color={tab === "recent" ? TEXT : MUTED} />
              <Text style={[styles.tabLabel, tab === "recent" && styles.tabLabelActive]}>{t("friends.tabRecent")}</Text>
            </TouchableOpacity>
            {/* Engellenen birine zaten davet atilamadigi icin bu slotta
                oda linkini/uygulamalari gosteren bir sekme var - digerleri
                gibi (bkz. ShareRoomContent.tsx, AYRI bir ekran ACMAZ). */}
            <TouchableOpacity style={styles.tabItem} onPress={() => selectTab("share")}>
              <Icon name="shareBox" size={24} color={tab === "share" ? TEXT : MUTED} />
              <Text style={[styles.tabLabel, tab === "share" && styles.tabLabelActive]}>{t("friends.tabShare")}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <ProfileOptionsSheet
        visible={!!profileCardTarget}
        target={profileCardTarget}
        isHost={false}
        canModerateTarget={false}
        onClose={closeProfileCard}
        onOpenProfile={openProfileFromCard}
        onSendFriendRequest={sendFriendRequestFromCard}
        onCancelFriendRequest={cancelFriendRequestFromCard}
        onBlock={blockFromCard}
        onUnblock={unblockFromCard}
        onRemoveFriend={removeFriendFromCard}
      />

      {/* "Arkadaşı Sil"/"Reddet" sonrasi gorunen Geri Al kutusu - alt sekme
          cubugunun (bu ekranin KENDI alt sinirinin, react-navigation Tab
          Navigator'da sekme cubugunu ICERMEDIGI icin) 20px ustunde, profildeki
          "..." menusuyle (visibilityMenu, #15202B) AYNI renkte. */}
      {undoBanner && (
        <View style={styles.undoBanner}>
          {/* Kullanicinin gonderdigi referans gorselden cikarilmis ikon
              (bkz. CustomIcons.tsx UndoArrowIcon) - mesajin hemen solunda. */}
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
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 12,
  },
  iconTouch: { width: 38, height: 38, justifyContent: "center", alignItems: "center" },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 10,
  },
  // Embedded (Arkadaslar sekmesi) - ustte geri oku/baslik olmadigi icin
  // DiscoverScreen.tsx'teki searchBarBorder ile AYNI ust bosluk.
  searchRowEmbedded: { marginTop: 50 },
  // DiscoverScreen.tsx searchBarBorder/searchBar ile BIREBIR AYNI gorunum -
  // beyazdan maviye gecen ince bir degrade "halka", icinde koyu lacivert
  // tonlarina gecen bir dolgu degradesi.
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
  // Web onizlemesindeki varsayilan odak cercevesini (beyaz kare) kapatiyor -
  // gercek Android/iOS'ta zaten yok, sadece tarayici davranisi.
  // "includeFontPadding: false" - Android'in native TextInput'u varsayilan
  // olarak fazladan dikey bosluk ekleyip kutuyu gercek cihazda web/iOS'a
  // gore belirgin sekilde daha "uzun" gosteriyordu.
  searchInput: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 15,
    paddingVertical: 0,
    includeFontPadding: false,
    outlineWidth: 0,
    outlineStyle: "none",
  } as any,
  // Davet modunda zil yerine - o an acik sekmedeki herkesi tek seferde
  // isaretler/kaldirir (bkz. toggleSelectAllCurrentTab).
  selectAllButton: {
    height: 42,
    paddingHorizontal: 16,
    borderRadius: 21,
    backgroundColor: "#141210",
    alignItems: "center",
    justifyContent: "center",
  },
  selectAllButtonActive: { backgroundColor: ACCENT },
  selectAllText: { color: TEXT, fontSize: 13, fontWeight: "700" },
  selectAllTextActive: { color: "#04140D" },
  // MediaPickerSheet.tsx playlistTabBar/playlistTabBtn/playlistTabDivider ile
  // AYNI desen - aktif/pasif ikon opakligi + alti tam genislikte ince bir
  // degrade cizgi.
  tabIconBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginHorizontal: 16,
    marginTop: 6,
    paddingBottom: 10,
  },
  tabIconBtn: { padding: 6 },
  tabIconDivider: { height: 1, marginBottom: 4 },
  listContent: { paddingHorizontal: 16, paddingBottom: 100 },
  emptyText: { color: MUTED, textAlign: "center", marginTop: 60, fontSize: 14 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
  },
  rowMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12 },
  rowText: { flex: 1 },
  rowName: { color: TEXT, fontSize: 14, fontWeight: "700" },
  rowHandle: { color: MUTED, fontSize: 12, fontWeight: "500", lineHeight: 16, marginTop: 2 },
  rowPreview: { color: MUTED, fontSize: 12, fontWeight: "500", lineHeight: 16, marginTop: 2 },
  // UserProfileScreen.tsx'teki "Takip Et" pill'iyle (pillGradientBorder/
  // pillInner) AYNI mavi-beyaz gradyan cerceve deseni - satira sigsin diye
  // kucultulmus olcekte.
  removeFriendPillButton: { flexShrink: 0 },
  removeFriendPillBorder: { borderRadius: 19, padding: 2 },
  // minWidth - "Arkadaşı sil"in KENDI dogal genisligine (~124px) sabitlendi
  // ki bu buton BUYUMESIN, kisa "İstek at" (~93px) ona uzansin. "İsteği
  // iptal et" (~135px) bundan dogal olarak biraz daha genis kalabiliyor -
  // bu minWidth UST SINIR degil, SADECE kisa metinleri yukari esitliyor.
  removeFriendPillInner: {
    borderRadius: 17,
    paddingVertical: 9,
    paddingHorizontal: 16,
    minWidth: 124,
    alignItems: "center",
    backgroundColor: "#141210",
  },
  // Istekler sekmesinde Reddet+Onayla YAN YANA iki genis pill, isim/kullanici
  // adi alanini sikistiriyordu - bu ikili icin minWidth kendi kisa
  // metinlerine (~90px) gore dusuruldu (kullanicinin "genisligini dusurelim"
  // istegi).
  removeFriendPillInnerCompact: { minWidth: 70, paddingHorizontal: 10 },
  removeFriendPillText: { color: TEXT, fontSize: 12, fontWeight: "800", letterSpacing: 0.3 },
  requestActions: { flexDirection: "row", alignItems: "center", gap: 10 },
  tabBarWrap: { position: "absolute", bottom: 34, left: 0, right: 0, alignItems: "center" },
  tabBar: {
    flexDirection: "row",
    backgroundColor: "rgba(20,18,16,0.95)",
    borderRadius: 30,
    paddingVertical: 8,
    paddingHorizontal: 6,
    gap: 4,
  },
  tabItem: { alignItems: "center", paddingHorizontal: 14, gap: 3 },
  tabLabel: { color: MUTED, fontSize: 10, fontWeight: "600" },
  tabLabelActive: { color: TEXT },
  // Son Zamanlarda satirinda arkadaslik istegi butonu + (davet modunda)
  // onay kutusu yan yana - istek butonu HER ZAMAN solda.
  rowActions: { flexDirection: "row", alignItems: "center", gap: 14 },
  // Davet modu (inviteMode) - satirin saginda isaretlenebilen onay kutusu
  // ve secim yapilinca beliren alt bar (bkz. RoomScreen.tsx onInvite).
  checkbox: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: MUTED,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxChecked: { backgroundColor: ACCENT, borderColor: ACCENT },
  // Alt sekme cubugunun (tabBarWrap, bottom:34) HEMEN USTUNDE yuzer -
  // sekmeler her zaman gorunur kalsin diye (bkz. kullanicinin "son
  // zamanlarda/engellenenler kismi yok" duzeltmesi).
  inviteBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 104,
    alignItems: "center",
  },
  // tabBar'daki (asagidaki) yuzen hap/pill sekliyle AYNI, sadece daha kucuk.
  inviteButton: {
    backgroundColor: ACCENT,
    borderRadius: 24,
    paddingVertical: 11,
    paddingHorizontal: 28,
    alignItems: "center",
  },
  inviteButtonText: { color: "#04140D", fontSize: 14, fontWeight: "700" },
  // UserProfileScreen.tsx'teki visibilityMenu (profildeki "..." menusu) ile
  // AYNI renk (#15202B) - kullanicinin "profildeki 3 noktaya basinca acilan
  // kutunun renginde olsun" istegi.
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
  undoBannerAction: { color: ACCENT, fontSize: 13, fontWeight: "800", marginTop: 1 },
});
