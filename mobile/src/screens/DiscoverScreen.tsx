import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  FlatList,
  Image,
  TouchableOpacity,
  StyleSheet,
  useWindowDimensions,
  RefreshControl,
  PanResponder,
  ScrollView,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { getSocket, PublicRoomSummary, RoomState, MediaSource } from "../services/socket";
import { supabase } from "../services/supabase";
import { theme } from "../theme";
import Icon from "../components/Icon";
import MediaPickerSheet from "../components/MediaPickerSheet";
import { PlatformKey } from "../components/PlatformLogo";
import PlatformBadge from "../components/PlatformBadge";
import { EXTERNAL_PLATFORMS } from "../utils/media";

interface Props {
  onJoinRoom: (room: RoomState) => void;
  onOpenProfile: () => void;
  onOpenFriends: () => void;
}

// Sol kenardan (ekranin ilk 24px'i) saga dogru kaydirinca profil/ayarlar,
// sag kenardan sola dogru kaydirinca da arkadaslar ekrani aciliyor -
// Rave'deki gibi hem ikonlara basip hem kenarlardan kaydirarak acilabiliyor.
const EDGE_ZONE = 24;
const SWIPE_THRESHOLD = 60;

// Tablette 2, telefonda 1 sutun - Rave'deki gibi genis ekranda yan yana
// iki kart, dar ekranda kart tam genislikte tek sutun.
const WIDE_BREAKPOINT = 700;

function sourceIcon(type: string): string {
  if (type === "hls" || type === "mp4") return "🎬";
  if (type === "external") return "🔗";
  return "▶";
}

// "https://www.netflix.com" -> "netflix.com" - URL polyfiline bagli kalmadan
// basit bir alan adi karsilastirmasi icin.
function bareDomain(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
}

// Kartin kapak resminde sag ust rozet icin - kaynagin hangi platforma ait
// oldugunu bulur (harici platformlar url'e gore eslestirilir).
function platformKeyForSource(source: MediaSource | null): PlatformKey | null {
  if (!source) return null;
  if (source.type === "youtube") return "youtube";
  if (source.type === "external") {
    const match = EXTERNAL_PLATFORMS.find((p) => bareDomain(source.url).includes(bareDomain(p.url)));
    return match?.logo ?? null;
  }
  return null;
}

const AVATAR_COLORS = ["#3A2F22", "#1F3D24", "#2E4A2F", "#4A3B22"];

export default function DiscoverScreen({ onJoinRoom, onOpenProfile, onOpenFriends }: Props) {
  const { width } = useWindowDimensions();
  const numColumns = width >= WIDE_BREAKPOINT ? 2 : 1;
  const [rooms, setRooms] = useState<PublicRoomSummary[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [hostName, setHostName] = useState("Misafir");
  const widthRef = useRef(width);
  widthRef.current = width;

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const email = data.user?.email;
      if (email) setHostName(email.split("@")[0]);
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

      <FlatList
        key={numColumns} // sutun sayisi degisince FlatList'i yeniden olustur (RN kurali)
        data={rooms}
        numColumns={numColumns}
        keyExtractor={(item) => item.code}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchRooms(); }} tintColor="#fff" />}
        ListEmptyComponent={
          <Text style={styles.emptyText}>Su an acik oda yok. Ilk odayi sen ac!</Text>
        }
        renderItem={({ item }) => {
          const platformKey = platformKeyForSource(item.source);
          return (
          <TouchableOpacity style={[styles.card, { flex: 1 / numColumns }]} onPress={() => joinByCode(item.code)}>
            {item.source?.coverUrl ? (
              <Image source={{ uri: item.source.coverUrl }} style={styles.thumbnail} />
            ) : item.source?.type === "youtube" ? (
              <Image
                source={{ uri: `https://img.youtube.com/vi/${item.source.url}/hqdefault.jpg` }}
                style={styles.thumbnail}
              />
            ) : (
              <View style={[styles.thumbnail, styles.thumbnailPlaceholder]}>
                <Text style={styles.thumbnailPlaceholderText}>{item.source ? sourceIcon(item.source.type) : "▶"}</Text>
              </View>
            )}
            {platformKey && (
              <View style={styles.platformBadge} pointerEvents="none">
                <PlatformBadge platform={platformKey} size={18} />
              </View>
            )}
            <LinearGradient colors={["transparent", "rgba(0,0,0,0.88)"]} style={styles.cardGradient} pointerEvents="none" />
            <View style={styles.cardOverlay} pointerEvents="box-none">
              <Text style={styles.cardTitle} numberOfLines={1}>
                {item.title}
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.participantsRow}
                contentContainerStyle={styles.participantsRowContent}
              >
                {item.participants.map((p, i) => (
                  <View
                    key={i}
                    style={[
                      styles.participantAvatar,
                      { backgroundColor: AVATAR_COLORS[i % AVATAR_COLORS.length], marginLeft: i === 0 ? 0 : 4 },
                    ]}
                  >
                    <Text style={styles.participantAvatarInitial}>{p.name.charAt(0).toUpperCase()}</Text>
                  </View>
                ))}
                {item.participantCount > item.participants.length && (
                  <View style={[styles.participantAvatar, styles.participantExtraCircle, { marginLeft: 4 }]}>
                    <Text style={styles.participantAvatarInitial}>+{item.participantCount - item.participants.length}</Text>
                  </View>
                )}
              </ScrollView>
            </View>
          </TouchableOpacity>
          );
        }}
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
  headerLogo: { width: 70, height: 32 },
  listContent: { padding: 8, flexGrow: 1 },
  emptyText: { color: theme.textMuted, textAlign: "center", marginTop: 60, fontSize: 15 },
  card: { backgroundColor: theme.surface, borderRadius: 12, margin: 6, overflow: "hidden", borderWidth: 1, borderColor: theme.border },
  thumbnail: { width: "100%", aspectRatio: 2.4 / 1, backgroundColor: theme.surfaceAlt },
  thumbnailPlaceholder: { justifyContent: "center", alignItems: "center" },
  thumbnailPlaceholderText: { color: theme.textMuted, fontSize: 26 },
  platformBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: "rgba(0,0,0,0.35)",
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  cardGradient: { position: "absolute", left: 0, right: 0, bottom: 0, height: "75%" },
  cardOverlay: { position: "absolute", left: 0, right: 0, bottom: 0, padding: 10 },
  cardTitle: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
  participantsRow: { marginTop: 5 },
  participantsRowContent: { flexDirection: "row", alignItems: "center", paddingRight: 4 },
  participantAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "rgba(0,0,0,0.55)",
  },
  participantExtraCircle: { backgroundColor: theme.surfaceAlt },
  participantAvatarInitial: { color: theme.accent, fontSize: 15, fontWeight: "700" },
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
