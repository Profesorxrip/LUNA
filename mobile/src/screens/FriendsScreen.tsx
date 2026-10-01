import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Image,
  Alert,
  PanResponder,
  BackHandler,
  useWindowDimensions,
} from "react-native";
import { getSocket, FriendUser, DMMessage } from "../services/socket";
import { theme } from "../theme";
import Icon from "../components/Icon";
import { DMPeer } from "./DMScreen";

interface Props {
  onBack: () => void;
  onOpenSettings: () => void;
  onOpenDM: (peer: DMPeer) => void;
}

// Sag kenardan sola kaydirarak acilan bu ekran, sol kenardan saga kaydirinca
// (Discover'daki gibi) kapanip Discover'a doner.
const EDGE_ZONE = 24;
const SWIPE_THRESHOLD = 60;

type Tab = "friends" | "recent" | "blocked";

const ACCENT = "#2ECC71";
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
 * Zamanlarda / Engellendi) bir liste - LUNA'nin siyah/yesil temasiyla. */
export default function FriendsScreen({ onBack, onOpenSettings, onOpenDM }: Props) {
  const socket = getSocket();
  const { width } = useWindowDimensions();
  const widthRef = useRef(width);
  widthRef.current = width;
  const [tab, setTab] = useState<Tab>("friends");
  const [search, setSearch] = useState("");
  const [friends, setFriends] = useState<FriendUser[]>([]);
  const [incoming, setIncoming] = useState<FriendUser[]>([]);
  const [outgoing, setOutgoing] = useState<FriendUser[]>([]);
  const [blocked, setBlocked] = useState<FriendUser[]>([]);
  const [previews, setPreviews] = useState<Record<string, DMMessage | null>>({});

  const refresh = useCallback(() => {
    socket.emit("friends:list", {}, (res: any) => {
      if (!res?.ok) return;
      setFriends(res.friends);
      setIncoming(res.incoming);
      setOutgoing(res.outgoing);
      setBlocked(res.blocked);
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

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      onBack();
      return true;
    });
    return () => sub.remove();
  }, [onBack]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: (evt) => evt.nativeEvent.pageX <= EDGE_ZONE,
      onMoveShouldSetPanResponder: (evt, gesture) =>
        evt.nativeEvent.pageX - gesture.dx <= EDGE_ZONE && gesture.dx > 10 && Math.abs(gesture.dy) < 40,
      onPanResponderRelease: (_evt, gesture) => {
        if (gesture.dx > SWIPE_THRESHOLD) onBack();
      },
    })
  ).current;

  function accept(fromUserId: string) {
    socket.emit("friend:respond", { fromUserId, accept: true }, () => refresh());
  }

  function decline(fromUserId: string) {
    socket.emit("friend:respond", { fromUserId, accept: false }, () => refresh());
  }

  function cancelOutgoing(toUserId: string) {
    socket.emit("friend:cancel", { toUserId }, () => refresh());
  }

  function unblock(userId: string) {
    Alert.alert("Engeli Kaldır", "Bu kişinin engelini kaldırmak istiyor musun?", [
      { text: "Vazgeç", style: "cancel" },
      { text: "Engeli Kaldır", onPress: () => socket.emit("friend:unblock", { userId }, () => refresh()) },
    ]);
  }

  const query = search.trim().toLowerCase();
  const filterList = (list: FriendUser[]) =>
    query ? list.filter((u) => u.name.toLowerCase().includes(query) || u.userId.toLowerCase().includes(query)) : list;

  const visibleFriends = filterList(friends);
  const visibleIncoming = filterList(incoming);
  const visibleOutgoing = filterList(outgoing);
  const visibleBlocked = filterList(blocked);

  return (
    <View style={styles.screen} {...panResponder.panHandlers}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconTouch} onPress={onOpenSettings} hitSlop={8}>
          <Icon name="settings" size={30} color={TEXT} />
        </TouchableOpacity>
        <Image source={require("../../assets/lavin-icon-mark.png")} style={styles.headerLogo} resizeMode="contain" />
        <TouchableOpacity style={styles.iconTouch} onPress={onBack} hitSlop={8}>
          <Icon name="close" size={26} color={TEXT} />
        </TouchableOpacity>
      </View>

      <View style={styles.searchBar}>
        <Icon name="search" size={16} color={MUTED} />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Ara"
          placeholderTextColor={MUTED}
        />
      </View>

      {tab === "friends" && (
        <FlatList
          data={visibleFriends}
          keyExtractor={(f) => f.userId}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={<Text style={styles.emptyText}>Henüz arkadaşın yok.</Text>}
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
          data={[...visibleIncoming, ...visibleOutgoing]}
          keyExtractor={(f) => f.userId}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={<Text style={styles.emptyText}>Bekleyen arkadaşlık isteği yok.</Text>}
          renderItem={({ item }) => {
            const isIncoming = visibleIncoming.some((f) => f.userId === item.userId);
            return (
              <View style={styles.row}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarInitial}>{item.name.charAt(0).toUpperCase()}</Text>
                </View>
                <View style={styles.rowText}>
                  <Text style={styles.rowName}>{item.name}</Text>
                  <Text style={styles.rowHandle}>@{toHandle(item.name)}</Text>
                </View>
                {isIncoming ? (
                  <View style={styles.rowActions}>
                    <TouchableOpacity onPress={() => decline(item.userId)} hitSlop={8}>
                      <Icon name="close" size={16} color={MUTED} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => accept(item.userId)} hitSlop={8}>
                      <Icon name="invite" size={26} color={ACCENT} />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity onPress={() => cancelOutgoing(item.userId)}>
                    <Text style={styles.pendingText}>Bekliyor</Text>
                  </TouchableOpacity>
                )}
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
          ListEmptyComponent={<Text style={styles.emptyText}>Engellenen kimse yok.</Text>}
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
            <Icon name="clock" size={18} color={tab === "recent" ? TEXT : MUTED} />
            <Text style={[styles.tabLabel, tab === "recent" && styles.tabLabelActive]}>Son Zamanlarda</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.tabItem} onPress={() => setTab("blocked")}>
            <Icon name="personBlock" size={20} color={tab === "blocked" ? TEXT : MUTED} />
            <Text style={[styles.tabLabel, tab === "blocked" && styles.tabLabelActive]}>Engellendi</Text>
          </TouchableOpacity>
        </View>
      </View>
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
  headerLogo: { width: 74, height: 34, marginTop: -4 },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: 16,
    marginBottom: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: "#141210",
  },
  searchInput: { flex: 1, color: TEXT, fontSize: 14 },
  listContent: { paddingHorizontal: 16, paddingBottom: 100 },
  emptyText: { color: MUTED, textAlign: "center", marginTop: 60, fontSize: 14 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: "#1E1A17",
  },
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
  rowName: { color: TEXT, fontSize: 15, fontWeight: "700" },
  rowHandle: { color: MUTED, fontSize: 12, marginTop: 2 },
  rowPreview: { color: MUTED, fontSize: 12, marginTop: 2 },
  rowActions: { flexDirection: "row", alignItems: "center", gap: 16 },
  pendingText: { color: MUTED, fontSize: 12, fontWeight: "600" },
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
