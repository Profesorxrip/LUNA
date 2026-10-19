import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  SectionList,
  Image,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  useWindowDimensions,
  RefreshControl,
  PanResponder,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { getSocket, PublicRoomSummary, DiscoverSections, RoomState, MediaSource, FriendUser } from "../services/socket";
import { supabase } from "../services/supabase";
import { theme } from "../theme";
import Icon, { IconName } from "../components/Icon";
import LoadingView from "../components/LoadingView";
import MediaPickerSheet from "../components/MediaPickerSheet";
import RoomCard from "../components/RoomCard";
import BoldPlusIcon from "../components/BoldPlusIcon";
import { useFocusEffect } from "@react-navigation/native";
import { getHiddenRoomCodes } from "../utils/hiddenRooms";
import ProfileOptionsSheet, { ProfileOptionsTarget } from "../components/ProfileOptionsSheet";
import { showAlert } from "../components/CustomAlert";

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

const EMPTY_SECTIONS: DiscoverSections = { invited: [], friends: [], nearby: [], open: [] };

// Discover artik tek bir liste degil, sirayla 4 bolum (bkz. server/src/rooms.ts
// listPublicRooms): Davetliler (en ustte, gizlilik tipinden bagimsiz - biri
// seni ozel olarak davet ettiyse), Arkadaslar, Yakindakiler, Acik. Her bolumun
// ic siralamasi sunucuda zaten hazirlaniyor, burada sadece gruplanip
// (numColumns'a gore satirlara bolunup) gosteriliyor.
const SECTION_TITLES: { key: keyof DiscoverSections; title: string; icon: IconName }[] = [
  { key: "invited", title: "Davetliler", icon: "invite" },
  { key: "friends", title: "Arkadaşlar", icon: "people" },
  { key: "nearby", title: "Yakındakiler", icon: "radar" },
  { key: "open", title: "Açık", icon: "worldOpen" },
];

function chunk<T>(arr: T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < arr.length; i += size) rows.push(arr.slice(i, i + size));
  return rows;
}

export default function DiscoverScreen({
  onJoinRoom,
  onOpenProfile,
  onOpenFriends,
  onOpenParticipant,
  onOpenRoomPreview,
}: Props) {
  const { width } = useWindowDimensions();
  const numColumns = width >= WIDE_BREAKPOINT ? 2 : 1;
  const [sections, setSections] = useState<DiscoverSections>(EMPTY_SECTIONS);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [hostName, setHostName] = useState("Misafir");
  const [friendIds, setFriendIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [hiddenCodes, setHiddenCodes] = useState<Set<string>>(new Set());
  // Bir oda kartindaki bir katilimcinin avatarina BASILI TUTUNCA acilan
  // profil karti (bkz. ProfileOptionsSheet.tsx) - RoomScreen.tsx'teki AYNI
  // bilesen, ama isHost/canModerateTarget hep false ve oda-ici (lider/
  // moderator/mikrofon/chat) handler'lari HIC verilmiyor, boylece sadece
  // Profil/arkadaslik/Engelle/Bildir satirlari goruntuleniyor - "Keşfet"ten
  // henuz o odaya girilmedigi icin oda yonetimi burada anlamsiz.
  const [profileOptionsTarget, setProfileOptionsTarget] = useState<ProfileOptionsTarget | null>(null);
  const widthRef = useRef(width);
  widthRef.current = width;

  // "Odayı Sil" (bkz. RoomPreviewScreen.tsx) odayi degil, sadece bu
  // kullanicinin kendi listesini gizliyor - ekran her odaklaninca (orn. oda
  // onizlemesinden "Kaldır" deyip geri donunce) guncel listeyi tekrar okur.
  useFocusEffect(
    useCallback(() => {
      getHiddenRoomCodes().then(setHiddenCodes);
    }, [])
  );

  const trimmedSearch = search.trim().toLowerCase();
  const sectionListData = SECTION_TITLES.map(({ key, title, icon }) => {
    const filtered = sections[key].filter((r) => r.title.toLowerCase().includes(trimmedSearch) && !hiddenCodes.has(r.code));
    return { key, title, icon, data: chunk(filtered, numColumns) };
  }).filter((s) => s.data.length > 0);

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
    // Ack'siz emit sunucu hic cevap vermezse (coktu/baglanti kopuk) SURESIZ
    // bekler - "loading" true'da kalip ekran sonsuza kadar donen bir ikonda
    // takilirdi (bkz. room:create/room:join'deki AYNI duzeltme).
    getSocket()
      .timeout(8000)
      .emit("rooms:list", {}, (err: any, result: DiscoverSections) => {
        setLoading(false);
        setRefreshing(false);
        if (err) {
          showAlert("Bağlantı sorunu", "Sunucuya ulaşılamıyor (zaman aşımı). Bağlantını kontrol et.");
          return;
        }
        setSections(result);
      });
  }, []);

  useEffect(() => {
    const socket = getSocket();
    fetchRooms();
    // Sunucu, herhangi bir acik oda degistiginde (olusturma/katilma/video
    // degisimi) bu event'i TUM baglı istemcilere yayinlar - canli liste.
    socket.on("rooms:list", setSections);
    return () => {
      socket.off("rooms:list", setSections);
    };
  }, [fetchRooms]);

  // Bir katilimci avatarina basili tutunca - RoomScreen.tsx openProfileOptions
  // ile AYNI desen: once arkadas listesinden ANINDA bir tahmin, sonra
  // sunucudan GERCEK durumu (outgoing/incoming/blocked) sorup guncelliyoruz.
  function openParticipantOptions(peer: { userId: string; name: string }) {
    setProfileOptionsTarget({
      userId: peer.userId,
      name: peer.name,
      friendStatus: friendIds.has(peer.userId) ? "friends" : undefined,
    });
    getSocket().emit("friend:status", { withUserId: peer.userId }, (res: any) => {
      if (!res?.ok) return;
      setProfileOptionsTarget((prev) => (prev && prev.userId === peer.userId ? { ...prev, friendStatus: res.status } : prev));
    });
  }
  function closeProfileOptions() {
    setProfileOptionsTarget(null);
  }
  function openParticipantProfile(target: ProfileOptionsTarget) {
    if (!target.userId) return;
    onOpenParticipant({ userId: target.userId, name: target.name });
  }
  // Oda-ici alanlarin (RoomScreen.tsx'teki gibi) canli bir "room:state"
  // kaynagi burada yok, kart basarili bir istekten sonra ACIK KALIRKEN dogru
  // butonu gosterebilsin diye friendStatus'u elle guncelliyoruz.
  function patchProfileOptionsTarget(userId: string | null | undefined, patch: Partial<ProfileOptionsTarget>) {
    if (!userId) return;
    setProfileOptionsTarget((prev) => (prev && prev.userId === userId ? { ...prev, ...patch } : prev));
  }
  function sendFriendRequestFromProfile(target: ProfileOptionsTarget) {
    if (!target.userId) return;
    getSocket().emit("friend:request", { toUserId: target.userId }, (res: any) => {
      if (res?.ok) {
        showAlert("İstek gönderildi", `${target.name} kullanıcısına arkadaşlık isteği gönderildi.`);
        patchProfileOptionsTarget(target.userId, { friendStatus: "outgoing" });
      }
    });
  }
  function cancelFriendRequestFromProfile(target: ProfileOptionsTarget) {
    if (!target.userId) return;
    getSocket().emit("friend:cancel", { toUserId: target.userId }, () => {
      patchProfileOptionsTarget(target.userId, { friendStatus: "none" });
    });
  }
  function removeFriendFromProfile(target: ProfileOptionsTarget) {
    if (!target.userId) return;
    getSocket().emit("friend:remove", { userId: target.userId }, (res: any) => {
      if (res?.ok) {
        setFriendIds((prev) => {
          const next = new Set(prev);
          next.delete(target.userId!);
          return next;
        });
        patchProfileOptionsTarget(target.userId, { friendStatus: "none" });
      }
    });
  }
  function blockFromProfile(target: ProfileOptionsTarget) {
    if (!target.userId) return;
    getSocket().emit("friend:block", { userId: target.userId }, (res: any) => {
      if (res?.ok) {
        showAlert("Engellendi", `${target.name} engellendi.`);
        patchProfileOptionsTarget(target.userId, { friendStatus: "blocked" });
      }
    });
  }
  function unblockFromProfile(target: ProfileOptionsTarget) {
    if (!target.userId) return;
    getSocket().emit("friend:unblock", { userId: target.userId }, () => {
      patchProfileOptionsTarget(target.userId, { friendStatus: "none" });
    });
  }
  function reportParticipant(target: ProfileOptionsTarget) {
    if (!target.userId) return;
    getSocket().emit(
      "report:submit",
      { targetUserId: target.userId, reason: "Keşfet oda kartından bildirildi" },
      (res: any) => {
        if (res?.ok) showAlert("Bildirildi", "Bu kullanıcı moderasyon ekibine iletildi, teşekkürler.");
      }
    );
  }

  function joinByCode(code: string) {
    // "name" gonderilmiyor - sunucu zaten identify olmus GERCEK kullanicinin
    // adini biliyor, client'in bunu "Misafir" ile EZMESINE gerek yok (eskiden
    // tum katilimcilar - giris yapmis olsalar bile - yanlislikla "Misafir"
    // gorunuyordu).
    // Socket.IO varsayilan olarak bu tur ack'lerde SURESIZ bekler - sunucu
    // hic cevap vermezse (coktu/baglanti kopuk) geri cagirma fonksiyonu HIC
    // CALISMAZ, asagidaki hata mesaji bile gorunmez. ".timeout()" olmadan
    // kullanici "hicbir sey olmuyor" diye dusunup sessizce takilir kalirdi.
    getSocket()
      .timeout(8000)
      .emit("room:join", { code }, (err: any, res: any) => {
        if (err) return showAlert("Odaya girilemedi", "Sunucuya ulaşılamıyor (zaman aşımı). Bağlantını kontrol et.");
        if (res?.ok) onJoinRoom(res.room);
        else showAlert("Odaya girilemedi", res?.error || "Bilinmeyen bir hata oluştu.");
      });
  }

  // Oda, icerik secilmeden var olamaz - "+" direkt platform secme ekranini
  // acar, secim yapilinca oda o icerikle birlikte olusturulup girilir.
  function createRoomWithSource(source: MediaSource) {
    getSocket()
      .timeout(8000)
      .emit("room:create", { name: hostName, isPublic: true, source }, (err: any, res: any) => {
        if (err) return showAlert("Oda oluşturulamadı", "Sunucuya ulaşılamıyor (zaman aşımı). Bağlantını kontrol et.");
        if (res?.ok) onJoinRoom(res.room);
        else showAlert("Oda oluşturulamadı", res?.error || "Bilinmeyen bir hata oluştu.");
      });
  }

  return (
    <View style={styles.container} {...panResponder.panHandlers}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconTouch} onPress={onOpenProfile} hitSlop={8}>
          <Icon name="person" size={30} color={theme.text} />
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
          placeholder="ODA ARA"
          placeholderTextColor="rgba(255,255,255,0.5)"
          value={search}
          onChangeText={setSearch}
        />
      </LinearGradient>

      <SectionList
        key={numColumns} // sutun sayisi degisince yeniden olustur (RN kurali)
        sections={sectionListData}
        keyExtractor={(row, index) => row.map((r) => r.code).join("-") || String(index)}
        contentContainerStyle={styles.listContent}
        stickySectionHeadersEnabled={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchRooms(); }} tintColor="#fff" />}
        ListEmptyComponent={
          loading ? (
            <LoadingView />
          ) : (
            <Text style={styles.emptyText}>
              {trimmedSearch ? "Aramanla eslesen oda yok." : "Su an acik oda yok. Ilk odayi sen ac!"}
            </Text>
          )
        }
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeaderRow}>
            <Icon name={section.icon} size={20} color={theme.textMuted} />
            <Text style={styles.sectionHeader}>{section.title}</Text>
          </View>
        )}
        renderItem={({ item: row }) => (
          <View style={styles.row}>
            {row.map((item) => (
              <RoomCard
                key={item.code}
                room={item}
                friendIds={friendIds}
                onPress={() => joinByCode(item.code)}
                onLongPress={() => onOpenRoomPreview(item)}
                onOpenParticipant={onOpenParticipant}
                onLongPressParticipant={openParticipantOptions}
                style={{ flex: 1 / numColumns }}
              />
            ))}
          </View>
        )}
      />

      <TouchableOpacity style={styles.fab} onPress={() => setPickerVisible(true)}>
        <BoldPlusIcon size={24} color="#04140D" />
      </TouchableOpacity>

      <MediaPickerSheet
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
        onSelect={createRoomWithSource}
      />

      <ProfileOptionsSheet
        visible={!!profileOptionsTarget}
        target={profileOptionsTarget}
        isHost={false}
        canModerateTarget={false}
        onClose={closeProfileOptions}
        onOpenProfile={openParticipantProfile}
        onSendFriendRequest={sendFriendRequestFromProfile}
        onCancelFriendRequest={cancelFriendRequestFromProfile}
        onRemoveFriend={removeFriendFromProfile}
        onBlock={blockFromProfile}
        onUnblock={unblockFromProfile}
        onReport={reportParticipant}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    // "flex-end" (alttan hizali) - ikonlar (iconTouch, 38x38) ile logo
    // FARKLI yukseklikte (34) oldugu icin "center" ile ortalanirlarsa
    // gorsel olarak ayni hizada DURMUYORLARDI (bkz. headerLogo).
    alignItems: "flex-end",
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 12,
  },
  iconTouch: { width: 38, height: 38, justifyContent: "center", alignItems: "center" },
  // header "flex-end" (alttan hizali) - ama ikon GLYPH'leri (orn. kisi
  // silueti) kendi 38x38 kutusunun icinde TABANINDAN BOSLUKLU dururken
  // logo PNG'sindeki "LUNA" yazisi kendi 34'luk kutusunun NEREDEYSE
  // TABANINA kadar uzaniyor - bu yuzden kutular alttan hizlansa bile YAZI
  // ikon glyph'inden daha asagida GORUNUYORDU (piksel olculdu, ~7-8px).
  // marginBottom bunu yukari kaydirip gercek GORSEL tabanlari esitliyor.
  headerLogo: { width: 74, height: 34, marginBottom: 7, tintColor: "#FFFFFF" },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    height: 48,
    borderRadius: 26,
    paddingHorizontal: 18,
    gap: 10,
    marginHorizontal: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  // "includeFontPadding: false" ŞART - Android'in native TextInput'u
  // (EditText) varsayilan olarak yazi tipi metriklerine gore fazladan dikey
  // bosluk ekliyor, bu da web/iOS'ta normal gorunen bir kutuyu GERCEK
  // Android cihazda belirgin sekilde daha "kalin/uzun" gosteriyordu.
  searchInput: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 15,
    paddingVertical: 0,
    includeFontPadding: false,
    outlineWidth: 0,
    outlineStyle: "none",
  } as any,
  listContent: { padding: 8, flexGrow: 1 },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 8,
    paddingTop: 14,
    paddingBottom: 6,
  },
  sectionHeader: {
    color: theme.textMuted,
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  row: { flexDirection: "row" },
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
