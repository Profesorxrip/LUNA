import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  FlatList,
  Image,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  useWindowDimensions,
  RefreshControl,
  PanResponder,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { getSocket, PublicRoomSummary, RoomState, MediaSource, FriendUser } from "../services/socket";
import { supabase } from "../services/supabase";
import { theme } from "../theme";
import Icon from "../components/Icon";
import LoadingView from "../components/LoadingView";
import MediaPickerSheet from "../components/MediaPickerSheet";
import RoomCard from "../components/RoomCard";

interface Props {
  onJoinRoom: (room: RoomState) => void;
  onOpenProfile: () => void;
  onOpenFriends: () => void;
  onOpenParticipant: (peer: { userId: string; name: string }) => void;
  onOpenRoomPreview: (room: PublicRoomSummary) => void;
}

// Sol kenardan (ekranin ilk 24px'i) saga dogru kaydirinca profil/ayarlar,
// sag kenardan sola dogru kaydirinca da arkadaslar ekrani aciliyor -
// Rave'deki gibi hem ikonlara basip hem kenarlardan kaydirarak acilabiliyor.
const EDGE_ZONE = 24;
const SWIPE_THRESHOLD = 60;

// Tablette 2, telefonda 1 sutun - Rave'deki gibi genis ekranda yan yana
// iki kart, dar ekranda kart tam genislikte tek sutun.
const WIDE_BREAKPOINT = 700;

export default function DiscoverScreen({
  onJoinRoom,
  onOpenProfile,
  onOpenFriends,
  onOpenParticipant,
  onOpenRoomPreview,
}: Props) {
  const { width } = useWindowDimensions();
  const numColumns = width >= WIDE_BREAKPOINT ? 2 : 1;
  const [rooms, setRooms] = useState<PublicRoomSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [hostName, setHostName] = useState("Misafir");
  const [friendIds, setFriendIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const widthRef = useRef(width);
  widthRef.current = width;

  const visibleRooms = rooms.filter((r) => r.title.toLowerCase().includes(search.trim().toLowerCase()));

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const email = data.user?.email;
      if (email) setHostName(email.split("@")[0]);
    });
  }, []);

  // Kart uzerindeki katilimci avatarlarinda "bu arkadasin" rozetini
  // gosterebilmek icin arkadas listesini bir kere cekiyoruz.
  useEffect(() => {
    getSocket().emit("friends:list", {}, (res: any) => {
      if (res?.ok) setFriendIds(new Set(res.friends.map((f: FriendUser) => f.userId)));
    });
  }, []);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: (evt) =>
        evt.nativeEvent.pageX <= EDGE_ZONE || evt.nativeEvent.pageX >= widthRef.current - EDGE_ZONE,
      onMoveShouldSetPanResponder: (evt, gesture) => {
        const startX = evt.nativeEvent.pageX - gesture.dx;
        const fromLeft = startX <= EDGE_ZONE && gesture.dx > 10;
        const fromRight = startX >= widthRef.current - EDGE_ZONE && gesture.dx < -10;
        return (fromLeft || fromRight) && Math.abs(gesture.dy) < 40;
      },
      onPanResponderRelease: (evt, gesture) => {
        const startX = evt.nativeEvent.pageX - gesture.dx;
        if (startX <= EDGE_ZONE && gesture.dx > SWIPE_THRESHOLD) onOpenProfile();
        else if (startX >= widthRef.current - EDGE_ZONE && gesture.dx < -SWIPE_THRESHOLD) onOpenFriends();
      },
    })
  ).current;

  const fetchRooms = useCallback(() => {
    getSocket().emit("rooms:list", {}, (list: PublicRoomSummary[]) => {
      setRooms(list);
      setLoading(false);
      setRefreshing(false);
    });
  }, []);

  useEffect(() => {
    const socket = getSocket();
    fetchRooms();
    // Sunucu, herhangi bir acik oda degistiginde (olusturma/katilma/video
    // degisimi) bu event'i TUM baglı istemcilere yayinlar - canli liste.
    socket.on("rooms:list", setRooms);
    return () => {
      socket.off("rooms:list", setRooms);
    };
  }, [fetchRooms]);

  function joinByCode(code: string) {
    const name = "Misafir"; // gercek isim CreateJoin akisinda soruluyor; hizli katilim icin varsayilan
    getSocket().emit("room:join", { code, name }, (res: any) => {
      if (res.ok) onJoinRoom(res.room);
    });
  }

  // Oda, icerik secilmeden var olamaz - "+" direkt platform secme ekranini
  // acar, secim yapilinca oda o icerikle birlikte olusturulup girilir.
  function createRoomWithSource(source: MediaSource) {
    getSocket().emit("room:create", { name: hostName, isPublic: true, source }, (res: any) => {
      if (res.ok) onJoinRoom(res.room);
    });
  }

  return (
    <View style={styles.container} {...panResponder.panHandlers}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconTouch} onPress={onOpenProfile} hitSlop={8}>
          <Icon name="settings" size={30} color={theme.text} />
        </TouchableOpacity>
        <Image source={require("../../assets/lavin-icon-mark.png")} style={styles.headerLogo} resizeMode="contain" />
        <TouchableOpacity style={styles.iconTouch} onPress={onOpenFriends} hitSlop={8}>
          <Icon name="people" size={30} color={theme.text} />
        </TouchableOpacity>
      </View>

      <LinearGradient
        colors={["#2a2a35", "#1c1c24", "#101014"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.searchBar}
      >
        <Icon name="search" size={18} color="rgba(255,255,255,0.85)" />
        <TextInput
          style={styles.searchInput}
          placeholder="Oda ara"
          placeholderTextColor="rgba(255,255,255,0.5)"
          value={search}
          onChangeText={setSearch}
        />
      </LinearGradient>

      <FlatList
        key={numColumns} // sutun sayisi degisince FlatList'i yeniden olustur (RN kurali)
        data={visibleRooms}
        numColumns={numColumns}
        keyExtractor={(item) => item.code}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchRooms(); }} tintColor="#fff" />}
        ListEmptyComponent={
          loading ? (
            <LoadingView />
          ) : (
            <Text style={styles.emptyText}>
              {search.trim() ? "Aramanla eslesen oda yok." : "Su an acik oda yok. Ilk odayi sen ac!"}
            </Text>
          )
        }
        renderItem={({ item }) => (
          <RoomCard
            room={item}
            friendIds={friendIds}
            onPress={() => joinByCode(item.code)}
            onLongPress={() => onOpenRoomPreview(item)}
            onOpenParticipant={onOpenParticipant}
            style={{ flex: 1 / numColumns }}
          />
        )}
      />

      <TouchableOpacity style={styles.fab} onPress={() => setPickerVisible(true)}>
        <Icon name="plus" size={24} color="#04140D" />
      </TouchableOpacity>

      <MediaPickerSheet
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
        onSelect={createRoomWithSource}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
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
    borderRadius: 26,
    paddingHorizontal: 18,
    paddingVertical: 12,
    gap: 10,
    marginHorizontal: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  searchInput: { flex: 1, color: "#FFFFFF", fontSize: 15, outlineWidth: 0, outlineStyle: "none" } as any,
  listContent: { padding: 8, flexGrow: 1 },
  emptyText: { color: theme.textMuted, textAlign: "center", marginTop: 60, fontSize: 15 },
  fab: {
    position: "absolute",
    right: 20,
    bottom: 30,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: theme.accent,
    justifyContent: "center",
    alignItems: "center",
    elevation: 4,
  },
});
