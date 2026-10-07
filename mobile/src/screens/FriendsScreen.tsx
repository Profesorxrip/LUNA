import React, { useCallback, useEffect, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, FlatList, Image, Modal } from "react-native";
import { getSocket, FriendUser, RecentRoommate, DMMessage } from "../services/socket";
import { theme } from "../theme";
import Icon from "../components/Icon";
import { showAlert } from "../components/CustomAlert";
import LoadingView from "../components/LoadingView";
import ShareRoomContent from "../components/ShareRoomContent";
import { DMPeer } from "./DMScreen";

interface Props {
  onBack: () => void;
  onOpenSettings: () => void;
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
}

type Tab = "friends" | "recent" | "blocked" | "share";

const ACCENT = "#0EA5E9";
const BG = "#000000";
const TEXT = "#F5F0E6";
const MUTED = "#9A8F80";

function toHandle(name: string): string {
  return name.toLowerCase().replace(/\s+/g, "");
}

function relativeTime(ts: number): string {
  const diffMs = Date.now() - ts;
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "az önce";
  if (min < 60) return `${min} dakika`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour} saat`;
  const day = Math.floor(hour / 24);
  return `${day} gün`;
}

/** Rave'in "Arkadaslar" ekraninin yapisinin bir kopyasi - Discover'daki
 * cark/kesif basligini paylasir, altta 3 sekmeli (Arkadaslar / Son
 * Zamanlarda / Engellendi) bir liste - LUNA'nin siyah/yesil temasiyla.
 * Bekleyen arkadaslik istekleri burada degil, arama cubugunun yanindaki
 * "Istekler" butonuyla acilan ayri bir sheet'te (bkz. asagisi). */
export default function FriendsScreen({
  onBack,
  onOpenSettings,
  onOpenDM,
  onOpenParticipant,
  inviteMode = false,
  excludeUserIds = [],
  onSendInvites,
  roomCode,
  roomTitle,
}: Props) {
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
  const [requestsVisible, setRequestsVisible] = useState(false);
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
    socket.emit("friend:respond", { fromUserId, accept: false }, () => refresh());
  }

  function sendFriendRequest(toUserId: string, name: string) {
    socket.emit("friend:request", { toUserId }, (res: any) => {
      if (res?.ok) {
        setSentRequests((prev) => new Set(prev).add(toUserId));
        showAlert("İstek gönderildi", `${name} kullanıcısına arkadaşlık isteği gönderildi.`);
      } else {
        showAlert("Gönderilemedi", "Arkadaşlık isteği gönderilemedi, tekrar dene.");
      }
    });
  }

  function cancelSentRequest(toUserId: string) {
    socket.emit("friend:cancel", { toUserId }, () => {
      setSentRequests((prev) => {
        const next = new Set(prev);
        next.delete(toUserId);
        return next;
      });
    });
  }

  function unblock(userId: string) {
    showAlert("Engeli Kaldır", "Bu kişinin engelini kaldırmak istediğinize emin misiniz?", [
      { text: "Hayır", style: "cancel" },
      {
        text: "Evet",
        onPress: () =>
          socket.emit("friend:unblock", { userId }, () => {
            setUnblockedIds((prev) => new Set(prev).add(userId));
          }),
      },
    ]);
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
      <View style={styles.header}>
        {inviteMode ? (
          // Davet modunda ayarlara gidilemez - sol taraf bos, logo ortalanmis kalsin diye.
          <View style={styles.iconTouch} />
        ) : (
          <TouchableOpacity style={styles.iconTouch} onPress={onOpenSettings} hitSlop={8}>
            <Icon name="settings" size={30} color={TEXT} />
          </TouchableOpacity>
        )}
        <Image source={require("../../assets/lavin-icon-mark.png")} style={styles.headerLogo} resizeMode="contain" />
        {inviteMode ? (
          // Davet modunda kapatma ikonu yok - SADECE cihazin kendi geri
          // tusuyla/hareketiyle kapanir (bkz. RoomScreen.tsx'teki Modal'in
          // onRequestClose'u, Android donanim geri tusunu zaten yakalar).
          <View style={styles.iconTouch} />
        ) : (
          <TouchableOpacity style={styles.iconTouch} onPress={onBack} hitSlop={8}>
            <Icon name="close" size={30} color={TEXT} />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.searchRow}>
        <View style={styles.searchBar}>
          <Icon name="search" size={16} color={MUTED} />
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="ARA"
            placeholderTextColor={MUTED}
          />
        </View>
        {inviteMode && tab !== "share" ? (
          <TouchableOpacity
            style={[styles.selectAllButton, allCurrentTabSelected && styles.selectAllButtonActive]}
            onPress={toggleSelectAllCurrentTab}
            hitSlop={8}
          >
            <Text style={[styles.selectAllText, allCurrentTabSelected && styles.selectAllTextActive]}>Tümü</Text>
          </TouchableOpacity>
        ) : !inviteMode ? (
          <TouchableOpacity style={styles.requestsButton} onPress={() => setRequestsVisible(true)} hitSlop={8}>
            <Icon name="bell" size={20} color={TEXT} />
            {incoming.length > 0 && (
              <View style={styles.requestsBadge}>
                <Text style={styles.requestsBadgeText}>{incoming.length}</Text>
              </View>
            )}
          </TouchableOpacity>
        ) : null}
      </View>

      {tab === "friends" && (
        <FlatList
          data={visibleFriends}
          keyExtractor={(f) => f.userId}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={loading ? <LoadingView /> : <Text style={styles.emptyText}>Henüz arkadaşın yok.</Text>}
          renderItem={({ item }) => {
            const preview = previews[item.userId];
            const isSelected = selected.has(item.userId);
            return (
              <TouchableOpacity
                style={styles.row}
                onPress={() =>
                  inviteMode
                    ? toggleSelect(item.userId)
                    : onOpenDM({ userId: item.userId, name: item.name, handle: toHandle(item.name) })
                }
              >
                <View style={styles.avatar}>
                  <Text style={styles.avatarInitial}>{item.name.charAt(0).toUpperCase()}</Text>
                </View>
                <View style={styles.rowText}>
                  <Text style={styles.rowName}>{item.name}</Text>
                  {preview && !inviteMode ? (
                    <Text style={styles.rowPreview} numberOfLines={1}>
                      {preview.text} · {relativeTime(preview.createdAt)}
                    </Text>
                  ) : (
                    <Text style={styles.rowHandle}>@{toHandle(item.name)}</Text>
                  )}
                </View>
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
            loading ? <LoadingView /> : <Text style={styles.emptyText}>Son zamanlarda aynı odaya girdiğin kimse yok.</Text>
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
                      : onOpenParticipant({ userId: item.userId, name: item.name, handle: toHandle(item.name) })
                  }
                >
                  <View style={styles.avatar}>
                    <Text style={styles.avatarInitial}>{item.name.charAt(0).toUpperCase()}</Text>
                  </View>
                  <View style={styles.rowText}>
                    <Text style={styles.rowName}>{item.name}</Text>
                    <Text style={styles.rowHandle}>{relativeTime(item.lastTogetherMs)} önce aynı odadaydınız</Text>
                  </View>
                </TouchableOpacity>
                <View style={styles.rowActions}>
                  {sentRequests.has(item.userId) ? (
                    <TouchableOpacity onPress={() => cancelSentRequest(item.userId)} hitSlop={8}>
                      <Icon name="hourglass" size={22} color={MUTED} />
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity onPress={() => sendFriendRequest(item.userId, item.name)} hitSlop={8}>
                      <Icon name="invite" size={26} color={ACCENT} />
                    </TouchableOpacity>
                  )}
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

      {tab === "blocked" && (
        <FlatList
          data={visibleBlocked}
          keyExtractor={(f) => f.userId}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={loading ? <LoadingView /> : <Text style={styles.emptyText}>Engellenen kimse yok.</Text>}
          renderItem={({ item }) => {
            const isSelected = selected.has(item.userId);
            return (
              <View style={styles.row}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarInitial}>{item.name.charAt(0).toUpperCase()}</Text>
                </View>
                <View style={styles.rowText}>
                  <Text style={styles.rowName}>{item.name}</Text>
                  <Text style={styles.rowHandle}>@{toHandle(item.name)}</Text>
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
                  <TouchableOpacity onPress={() => sendFriendRequest(item.userId, item.name)} hitSlop={8}>
                    <Icon name="invite" size={26} color={ACCENT} />
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity onPress={() => unblock(item.userId)} hitSlop={8}>
                    <Icon name="personBlock" size={26} color={MUTED} />
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
            <Text style={styles.inviteButtonText}>Davet At ({selected.size})</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.tabBarWrap}>
        <View style={styles.tabBar}>
          <TouchableOpacity style={styles.tabItem} onPress={() => selectTab("friends")}>
            <Icon name="people" size={24} color={tab === "friends" ? TEXT : MUTED} />
            <Text style={[styles.tabLabel, tab === "friends" && styles.tabLabelActive]}>Arkadaşlar</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.tabItem} onPress={() => selectTab("recent")}>
            <Icon name="clock" size={24} color={tab === "recent" ? TEXT : MUTED} />
            <Text style={[styles.tabLabel, tab === "recent" && styles.tabLabelActive]}>Son Zamanlarda</Text>
          </TouchableOpacity>
          {inviteMode ? (
            // Engellenen birine zaten davet atilamadigi icin bu slotta artik
            // oda linkini/uygulamalari gosteren bir sekme var - digerleri
            // gibi (bkz. ShareRoomContent.tsx, AYRI bir ekran ACMAZ).
            <TouchableOpacity style={styles.tabItem} onPress={() => selectTab("share")}>
              <Icon name="shareBox" size={24} color={tab === "share" ? TEXT : MUTED} />
              <Text style={[styles.tabLabel, tab === "share" && styles.tabLabelActive]}>Paylaş</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.tabItem} onPress={() => selectTab("blocked")}>
              <Icon name="personBlock" size={24} color={tab === "blocked" ? TEXT : MUTED} />
              <Text style={[styles.tabLabel, tab === "blocked" && styles.tabLabelActive]}>Engellendi</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <Modal visible={requestsVisible} animationType="fade" transparent onRequestClose={() => setRequestsVisible(false)}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => setRequestsVisible(false)}>
          <TouchableOpacity activeOpacity={1} style={styles.sheet} onPress={() => {}}>
            <Text style={styles.sheetTitle}>İstekler</Text>
            <FlatList
              style={styles.requestsList}
              data={incoming}
              keyExtractor={(f) => f.userId}
              ListEmptyComponent={<Text style={styles.emptyText}>Bekleyen arkadaşlık isteği yok.</Text>}
              renderItem={({ item }) => (
                <View style={styles.row}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarInitial}>{item.name.charAt(0).toUpperCase()}</Text>
                  </View>
                  <View style={styles.rowText}>
                    <Text style={styles.rowName}>{item.name}</Text>
                    <Text style={styles.rowHandle}>@{toHandle(item.name)}</Text>
                  </View>
                  <View style={styles.requestActions}>
                    <TouchableOpacity onPress={() => decline(item.userId)} hitSlop={8}>
                      <Icon name="close" size={16} color={MUTED} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => accept(item.userId)} hitSlop={8}>
                      <Icon name="check" size={22} color={ACCENT} />
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            />
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 12,
  },
  iconTouch: { width: 38, height: 38, justifyContent: "center", alignItems: "center" },
  // lavin-icon-mark.png'nin gorsel agirlik merkezi (yildiz susleme + "LUNA"
  // yazisi) kutunun geometrik ortasinin ~6px altinda - ikonlarla ayni
  // hizaya gelmesi icin bu kadar yukari kaydiriyoruz (piksel analiziyle
  // olculdu, tahmini degil).
  headerLogo: { width: 74, height: 34, marginTop: -6, tintColor: "#FFFFFF" },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: 16,
    marginBottom: 10,
  },
  searchBar: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: "#141210",
  },
  // Web onizlemesindeki varsayilan odak cercevesini (beyaz kare) kapatiyor -
  // gercek Android/iOS'ta zaten yok, sadece tarayici davranisi.
  searchInput: { flex: 1, color: TEXT, fontSize: 14, outlineWidth: 0, outlineStyle: "none" } as any,
  requestsButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#141210",
    alignItems: "center",
    justifyContent: "center",
  },
  requestsBadge: {
    position: "absolute",
    top: -2,
    right: -2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: "#E34848",
    alignItems: "center",
    justifyContent: "center",
  },
  requestsBadgeText: { color: "#FFFFFF", fontSize: 10, fontWeight: "700" },
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
  backdrop: { flex: 1, backgroundColor: "#0A0A0A", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: BG,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    width: "100%",
    height: "60%",
  },
  sheetTitle: { color: TEXT, fontSize: 16, fontWeight: "700", marginBottom: 12 },
  requestsList: { flex: 1 },
  listContent: { paddingHorizontal: 16, paddingBottom: 100 },
  emptyText: { color: MUTED, textAlign: "center", marginTop: 60, fontSize: 14 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
  },
  rowMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#3A2F22",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: { color: ACCENT, fontSize: 18, fontWeight: "700" },
  rowText: { flex: 1 },
  rowName: { color: TEXT, fontSize: 14, fontWeight: "700" },
  rowHandle: { color: MUTED, fontSize: 12, fontWeight: "500", lineHeight: 16, marginTop: 2 },
  rowPreview: { color: MUTED, fontSize: 12, fontWeight: "500", lineHeight: 16, marginTop: 2 },
  requestActions: { flexDirection: "row", alignItems: "center", gap: 16 },
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
});
