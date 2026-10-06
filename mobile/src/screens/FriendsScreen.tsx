import React, { useCallback, useEffect, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, FlatList, Image, Modal } from "react-native";
import { getSocket, FriendUser, RecentRoommate, DMMessage } from "../services/socket";
import { theme } from "../theme";
import Icon from "../components/Icon";
import { showAlert } from "../components/CustomAlert";
import LoadingView from "../components/LoadingView";
import { DMPeer } from "./DMScreen";

interface Props {
  onBack: () => void;
  onOpenSettings: () => void;
  onOpenDM: (peer: DMPeer) => void;
  onOpenParticipant: (peer: { userId: string; name: string; handle?: string }) => void;
}

type Tab = "friends" | "recent" | "blocked";

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
export default function FriendsScreen({ onBack, onOpenSettings, onOpenDM, onOpenParticipant }: Props) {
  const socket = getSocket();
  const [tab, setTab] = useState<Tab>("friends");
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
    showAlert("Engeli Kaldır", "Bu kişinin engelini kaldırmak istiyor musun?", [
      { text: "Vazgeç", style: "cancel" },
      { text: "Engeli Kaldır", onPress: () => socket.emit("friend:unblock", { userId }, () => refresh()) },
    ]);
  }

  const query = search.trim().toLowerCase();
  const filterList = <T extends { name: string; userId: string }>(list: T[]) =>
    query ? list.filter((u) => u.name.toLowerCase().includes(query) || u.userId.toLowerCase().includes(query)) : list;

  const visibleFriends = filterList(friends);
  const visibleBlocked = filterList(blocked);
  const visibleRecentRoommates = filterList(recentRoommates);

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconTouch} onPress={onOpenSettings} hitSlop={8}>
          <Icon name="settings" size={30} color={TEXT} />
        </TouchableOpacity>
        <Image source={require("../../assets/lavin-icon-mark.png")} style={styles.headerLogo} resizeMode="contain" />
        <TouchableOpacity style={styles.iconTouch} onPress={onBack} hitSlop={8}>
          <Icon name="close" size={30} color={TEXT} />
        </TouchableOpacity>
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
        <TouchableOpacity style={styles.requestsButton} onPress={() => setRequestsVisible(true)} hitSlop={8}>
          <Icon name="bell" size={20} color={TEXT} />
          {incoming.length > 0 && (
            <View style={styles.requestsBadge}>
              <Text style={styles.requestsBadgeText}>{incoming.length}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {tab === "friends" && (
        <FlatList
          data={visibleFriends}
          keyExtractor={(f) => f.userId}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={loading ? <LoadingView /> : <Text style={styles.emptyText}>Henüz arkadaşın yok.</Text>}
          renderItem={({ item }) => {
            const preview = previews[item.userId];
            return (
              <TouchableOpacity
                style={styles.row}
                onPress={() => onOpenDM({ userId: item.userId, name: item.name, handle: toHandle(item.name) })}
              >
                <View style={styles.avatar}>
                  <Text style={styles.avatarInitial}>{item.name.charAt(0).toUpperCase()}</Text>
                </View>
                <View style={styles.rowText}>
                  <Text style={styles.rowName}>{item.name}</Text>
                  {preview ? (
                    <Text style={styles.rowPreview} numberOfLines={1}>
                      {preview.text} · {relativeTime(preview.createdAt)}
                    </Text>
                  ) : (
                    <Text style={styles.rowHandle}>@{toHandle(item.name)}</Text>
                  )}
                </View>
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
          renderItem={({ item }) => (
            <View style={styles.row}>
              <TouchableOpacity
                style={styles.rowMain}
                onPress={() => onOpenParticipant({ userId: item.userId, name: item.name, handle: toHandle(item.name) })}
              >
                <View style={styles.avatar}>
                  <Text style={styles.avatarInitial}>{item.name.charAt(0).toUpperCase()}</Text>
                </View>
                <View style={styles.rowText}>
                  <Text style={styles.rowName}>{item.name}</Text>
                  <Text style={styles.rowHandle}>{relativeTime(item.lastTogetherMs)} önce aynı odadaydınız</Text>
                </View>
              </TouchableOpacity>
              {sentRequests.has(item.userId) ? (
                <TouchableOpacity onPress={() => cancelSentRequest(item.userId)} hitSlop={8}>
                  <Icon name="hourglass" size={22} color={MUTED} />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity onPress={() => sendFriendRequest(item.userId, item.name)} hitSlop={8}>
                  <Icon name="invite" size={26} color={ACCENT} />
                </TouchableOpacity>
              )}
            </View>
          )}
        />
      )}

      {tab === "blocked" && (
        <FlatList
          data={visibleBlocked}
          keyExtractor={(f) => f.userId}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={loading ? <LoadingView /> : <Text style={styles.emptyText}>Engellenen kimse yok.</Text>}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <View style={styles.avatar}>
                <Text style={styles.avatarInitial}>{item.name.charAt(0).toUpperCase()}</Text>
              </View>
              <View style={styles.rowText}>
                <Text style={styles.rowName}>{item.name}</Text>
                <Text style={styles.rowHandle}>@{toHandle(item.name)}</Text>
              </View>
              <TouchableOpacity onPress={() => unblock(item.userId)} hitSlop={8}>
                <Icon name="personBlock" size={26} color={MUTED} />
              </TouchableOpacity>
            </View>
          )}
        />
      )}

      <View style={styles.tabBarWrap}>
        <View style={styles.tabBar}>
          <TouchableOpacity style={styles.tabItem} onPress={() => setTab("friends")}>
            <Icon name="people" size={20} color={tab === "friends" ? TEXT : MUTED} />
            <Text style={[styles.tabLabel, tab === "friends" && styles.tabLabelActive]}>Arkadaşlar</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.tabItem} onPress={() => setTab("recent")}>
            <Icon name="clock" size={20} color={tab === "recent" ? TEXT : MUTED} />
            <Text style={[styles.tabLabel, tab === "recent" && styles.tabLabelActive]}>Son Zamanlarda</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.tabItem} onPress={() => setTab("blocked")}>
            <Icon name="personBlock" size={20} color={tab === "blocked" ? TEXT : MUTED} />
            <Text style={[styles.tabLabel, tab === "blocked" && styles.tabLabelActive]}>Engellendi</Text>
          </TouchableOpacity>
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
  searchInput: { flex: 1, color: TEXT, fontSize: 14 },
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
  tabBarWrap: { position: "absolute", bottom: 24, left: 0, right: 0, alignItems: "center" },
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
});
