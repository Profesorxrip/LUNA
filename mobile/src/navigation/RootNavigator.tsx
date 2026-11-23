import React, { useEffect, useRef, useState } from "react";
import { Linking, Modal } from "react-native";
import {
  DarkTheme,
  NavigationContainer,
  NavigatorScreenParams,
  RouteProp,
  createNavigationContainerRef,
  useNavigation,
  useRoute,
} from "@react-navigation/native";
import { createNativeStackNavigator, NativeStackNavigationProp } from "@react-navigation/native-stack";
import { createBottomTabNavigator, BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import type { CompositeNavigationProp } from "@react-navigation/native";
import { showAlert } from "../components/CustomAlert";
import DiscoverScreen from "../screens/DiscoverScreen";
import FriendsScreen from "../screens/FriendsScreen";
import CreateRoomScreen from "../screens/CreateRoomScreen";
import ProfileScreen from "../screens/ProfileScreen";
import PremiumScreen from "../screens/PremiumScreen";
import PrivacyScreen from "../screens/PrivacyScreen";
import NotificationSettingsScreen from "../screens/NotificationSettingsScreen";
import BlockedUsersScreen from "../screens/BlockedUsersScreen";
import StatsScreen from "../screens/StatsScreen";
import BackgroundInfoScreen from "../screens/BackgroundInfoScreen";
import UserProfileScreen from "../screens/UserProfileScreen";
import DMScreen, { DMPeer, DmInfoOpenParams } from "../screens/DMScreen";
import GroupChatScreen, { GroupPeer } from "../screens/GroupChatScreen";
import GroupInfoScreen from "../screens/GroupInfoScreen";
import { GroupDetail } from "../services/socket";
import DMListScreen from "../screens/DMListScreen";
import DmInfoScreen from "../screens/DmInfoScreen";
import VoiceCallScreen from "../screens/VoiceCallScreen";
import VideoCallScreen, { type GroupParticipant } from "../screens/VideoCallScreen";
import { DMMessage } from "../services/socket";
import RoomPreviewScreen from "../screens/RoomPreviewScreen";
import RoomScreen from "../screens/RoomScreen";
import TabBar from "./TabBar";
import { getSocket, PublicRoomSummary, RoomState } from "../services/socket";
import { useCallEngineContext } from "../contexts/CallEngineContext";

type PeerParam = { userId: string; name: string; handle?: string };

/** Alt sekme cubugundaki 5 sekme (bkz. TabBar.tsx, kullanicinin onayladigi
 * "Varyant B" - tabbar_compare.html): Kesif/Arkadaslar/Olustur/Profil/Ayarlar.
 * Hepsi TEK bir MainTabs ekrani olarak disaridaki Stack'e gomulu - Room gibi
 * "derinlemesine" ekranlar acilinca (asagidaki RootStackParamList) alt bar
 * DOGAL olarak kayboluyor (MainTabs'in sibling'i, tab navigator'in disinda). */
export type MainTabsParamList = {
  Discover: undefined;
  Friends: undefined;
  Create: undefined;
  Profile: undefined;
  // Eskiden uygulama ayarlarini (ProfileScreen) acardi - artik DM listesini
  // aciyor (bkz. DMsRoute); ayarlar artik Stack'teki "AppSettings" ekrani
  // (profildeki carktan erisiliyor, bkz. MyProfileRoute onOpenSettings).
  DMs: undefined;
};

export type RootStackParamList = {
  // RoomPreviewScreen gibi Tab.Navigator'in DISINDAKI ekranlar buradan
  // MainTabs'a DONERKEN hangi sekmeye gidilecegini de belirtebilsin diye
  // (bkz. RoomPreviewRoute onNavigateTab) sadece "undefined" degil,
  // MainTabsParamList'in kendi (opsiyonel) parametreleri kabul ediliyor.
  MainTabs: NavigatorScreenParams<MainTabsParamList>;
  // Uygulama ayarlari (ProfileScreen) - ARTIK bir sekme degil, sadece
  // UserProfileScreen'deki banner carkindan buraya push ediliyor (bkz.
  // AppSettingsRoute, MyProfileRoute onOpenSettings). ProfileScreen'in
  // KENDISI hic degismedi - sadece erisim yolu degisti.
  AppSettings: undefined;
  Premium: undefined;
  Privacy: undefined;
  Notifications: undefined;
  Blocked: undefined;
  Stats: undefined;
  BackgroundInfo: undefined;
  // Baska birinin profilini goruntülemek icin (own:false + peer) - kendi
  // profilimiz artik MainTabs icindeki "Profile" sekmesi (bkz. MyProfileRoute).
  UserProfile: { own: boolean; peer?: PeerParam };
  DM: { peer: DMPeer };
  DmInfo: { peer: DMPeer } & DmInfoOpenParams;
  GroupChat: { group: GroupPeer };
  GroupInfo: { group: GroupDetail };
  // additionalMemberIds: SADECE grup sohbetinden baslatilan aramalarda dolu -
  // ilk uyeyle (peer) normal 1'e 1 arama kurulur kurulmaz, kalanlar sirayla
  // "Arama Ekle" (addToCall) ile ayni aramaya eklenir (bkz. GroupChatRoute/
  // useRealCallWiring).
  VoiceCall: { peer: DMPeer; peerAvatarUrl: string | null; additionalMemberIds?: string[] };
  // VoiceCall'daki "Paylaş" butonundan - ekran paylasimi SADECE burada
  // gercek oldugu icin (bkz. VoiceCallScreen.tsx onSwitchToVideo yorumu)
  // kullanici onayladiktan sonra VoiceCall'dan BURAYA replace ediliyor.
  // startWithVideoOff: SADECE grup sohbetinden baslatilan SESLI aramalarda
  // true - VoiceCallScreen'de grup icin bir izgara (grid) OLMADIGI icin
  // (bkz. GroupChatRoute) grup aramalari (sesli de olsa) HER ZAMAN buraya
  // (VideoCall/GroupCallGrid, kamerasi kapali baslayarak) yonlendirilir.
  // Verilmezse (digerleri - 1'e 1 goruntulu arama, "Paylaş" ile buraya
  // gecis, "Arama Ekle" ile buyuyen aramalar) eskisi gibi kamera ACIK baslar.
  VideoCall: { peer: DMPeer; peerAvatarUrl: string | null; additionalMemberIds?: string[]; startWithVideoOff?: boolean };
  RoomPreview: { room: PublicRoomSummary };
  Room: { room: RoomState };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

// Gelen arama kabul edildiginde (bkz. CallEngineProvider.tsx) herhangi bir
// ekrandan VoiceCall/VideoCall'a GECIS yapabilmek icin - normal
// useNavigation() hook'u SADECE bir ekran bileseni icinden calisir, ama
// gelen arama bildirimi navigasyon agacinin DISINDA (App.tsx'teki provider)
// gosteriliyor.
export const navigationRef = createNavigationContainerRef<RootStackParamList>();

// CallEngineContext.tsx (bu Navigator'in DISINDA, App.tsx'te onu saran
// Provider) kucultulmus arama banner'ini bazi ekranlarda (orn. "Oda" -
// zaten kendi arama/katilimci arayuzu oldugu icin banner orada gereksiz/
// kafa karistirici) GIZLEYEBILMESI icin gecerli route adini disari acan
// basit bir modul-seviyesi yayinci - o Context NavigationContainer'in
// ICINDE olmadigindan normal bir navigasyon hook'u kullanamiyor.
type RouteNameListener = (name: string | undefined) => void;
const routeNameListeners = new Set<RouteNameListener>();
export function subscribeCurrentRouteName(listener: RouteNameListener): () => void {
  routeNameListeners.add(listener);
  if (navigationRef.isReady()) listener(navigationRef.getCurrentRoute()?.name);
  return () => {
    routeNameListeners.delete(listener);
  };
}
function notifyRouteNameListeners() {
  const name = navigationRef.isReady() ? navigationRef.getCurrentRoute()?.name : undefined;
  routeNameListeners.forEach((listener) => listener(name));
}

const Tab = createBottomTabNavigator<MainTabsParamList>();
type Nav = NativeStackNavigationProp<RootStackParamList>;
// Tab icine gomulu ekranlarin navigasyonu: HEM kendi sekmeleri arasinda
// (navigate ile, otomatik "yukari" da calisir) HEM DE disaridaki Stack'te
// (ozellikle .reset() icin - .reset() navigate'in aksine disariya KENDILIGINDEN
// TASMAZ, bu yuzden .getParent<Nav>() ile disariya elle erisiliyor).
type TabNav<T extends keyof MainTabsParamList> = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabsParamList, T>,
  Nav
>;

// NavigationContainer'a hic tema verilmezse react-navigation'in KENDI
// varsayilan (acik/beyaz) temasi uygulanir - ekranlarin contentStyle'i
// seffaf olsa bile NavigationContainer'in KENDI kok arka plani App.tsx'teki
// paylasilan AppBackground'in (koyu degrade) ONUNE beyaz bir katman olarak
// biner. DarkTheme tabanli, arka plani da seffaf yapilmis bir tema ile bu
// onleniyor.
const navTheme = { ...DarkTheme, colors: { ...DarkTheme.colors, background: "transparent" } };

function enterRoom(navigation: Nav, room: RoomState) {
  // Oda, nereden acilirsa acilsin HEP alt-bar sekmelerinin uzerine biner ve
  // cikinca HEP o an acik olan sekmeye doner - stack'i [MainTabs, Room]
  // olarak sifirliyoruz (eski "Discover" yerine artik "MainTabs").
  navigation.reset({ index: 1, routes: [{ name: "MainTabs" }, { name: "Room", params: { room } }] });
}

function DiscoverRoute() {
  const navigation = useNavigation<TabNav<"Discover">>();

  // Paylasilan oda linkine ("luna://room/KOD") tiklanip uygulama acilinca -
  // soguk baslangicta (getInitialURL) ve uygulama zaten acikken (addEventListener
  // "url") ayni sekilde calisir. Kod gecerliyse odaya otomatik katilir (bkz.
  // ShareRoomScreen.tsx'teki link, DiscoverScreen.tsx joinByCode ile AYNI
  // "room:join" cagrisi).
  useEffect(() => {
    function handleDeepLink(url: string) {
      const match = url.match(/room\/([A-Za-z0-9]+)/);
      if (!match) return;
      const code = match[1].toUpperCase();
      getSocket().emit("room:join", { code }, (res: any) => {
        if (res.ok) {
          const parent = navigation.getParent<Nav>();
          if (parent) enterRoom(parent, res.room);
        } else {
          showAlert("Odaya katılınamadı", res?.error || "Bu link artık geçerli değil.");
        }
      });
    }
    Linking.getInitialURL().then((url) => {
      if (url) handleDeepLink(url);
    });
    const subscription = Linking.addEventListener("url", ({ url }) => handleDeepLink(url));
    return () => subscription.remove();
  }, [navigation]);

  return (
    <DiscoverScreen
      onJoinRoom={(room) => {
        const parent = navigation.getParent<Nav>();
        if (parent) enterRoom(parent, room);
      }}
      onOpenParticipant={(peer) => navigation.navigate("UserProfile", { own: false, peer })}
      onOpenRoomPreview={(room) => navigation.navigate("RoomPreview", { room })}
    />
  );
}

function FriendsRoute() {
  const navigation = useNavigation<TabNav<"Friends">>();
  return (
    <FriendsScreen
      embedded
      onBack={() => {}}
      onOpenDM={(peer) => navigation.navigate("DM", { peer })}
      onOpenParticipant={(peer) => navigation.navigate("UserProfile", { own: false, peer })}
    />
  );
}

function CreateRoute() {
  const navigation = useNavigation<TabNav<"Create">>();
  return (
    <CreateRoomScreen
      onRoomCreated={(room) => {
        const parent = navigation.getParent<Nav>();
        if (parent) enterRoom(parent, room);
      }}
    />
  );
}

function MyProfileRoute() {
  const navigation = useNavigation<TabNav<"Profile">>();
  return (
    <UserProfileScreen
      own
      onOpenDM={(peer) => navigation.navigate("DM", { peer })}
      onOpenRoomPreview={(room) => navigation.navigate("RoomPreview", { room })}
      onOpenRoom={(room) => {
        const parent = navigation.getParent<Nav>();
        if (parent) enterRoom(parent, room);
      }}
      onOpenSettings={() => {
        const parent = navigation.getParent<Nav>();
        if (parent) parent.navigate("AppSettings");
      }}
    />
  );
}

function DMsRoute() {
  const navigation = useNavigation<TabNav<"DMs">>();
  return (
    <DMListScreen
      onOpenDM={(peer) => navigation.navigate("DM", { peer })}
      onOpenGroup={(group) => navigation.navigate("GroupChat", { group })}
    />
  );
}

// ProfileScreen'in KENDISI degismedi, SADECE buraya nasil gelindigi degisti -
// eskiden bir Tab.Screen'di (alt bardaki "..." sekmesi), artik Stack'te
// UserProfileScreen'deki carktan push edilen bagimsiz bir ekran (bkz.
// MyProfileRoute onOpenSettings). "onOpenUserProfile" de artik Tab yerine
// Stack nav'i kullanip dogrudan Profil sekmesine gidiyor.
function AppSettingsRoute() {
  const navigation = useNavigation<Nav>();
  return (
    <ProfileScreen
      onOpenUserProfile={() => navigation.navigate("MainTabs", { screen: "Profile" })}
      onOpenPremium={() => navigation.navigate("Premium")}
      onOpenPrivacy={() => navigation.navigate("Privacy")}
      onOpenNotifications={() => navigation.navigate("Notifications")}
      onOpenBlocked={() => navigation.navigate("Blocked")}
      onOpenStats={() => navigation.navigate("Stats")}
      onOpenBackgroundInfo={() => navigation.navigate("BackgroundInfo")}
    />
  );
}

function MainTabsRoute() {
  return (
    <Tab.Navigator
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{ headerShown: false }}
      // Sekme SIRASI (gorsel) degisti ama uygulama acilinca HALA Kesif'le
      // baslamasi gerekiyor - initialRouteName olmadan ilk <Tab.Screen>
      // (artik "Profile") varsayilan olurdu.
      initialRouteName="Discover"
    >
      <Tab.Screen name="Profile" component={MyProfileRoute} />
      <Tab.Screen name="Discover" component={DiscoverRoute} />
      <Tab.Screen name="Create" component={CreateRoute} />
      <Tab.Screen name="DMs" component={DMsRoute} />
      <Tab.Screen name="Friends" component={FriendsRoute} />
    </Tab.Navigator>
  );
}

function PremiumRoute() {
  const navigation = useNavigation<Nav>();
  return <PremiumScreen onClose={() => navigation.goBack()} />;
}

function PrivacyRoute() {
  const navigation = useNavigation<Nav>();
  return <PrivacyScreen onBack={() => navigation.goBack()} />;
}

function NotificationsRoute() {
  const navigation = useNavigation<Nav>();
  return <NotificationSettingsScreen onBack={() => navigation.goBack()} />;
}

function BlockedRoute() {
  const navigation = useNavigation<Nav>();
  return <BlockedUsersScreen onBack={() => navigation.goBack()} />;
}

function StatsRoute() {
  const navigation = useNavigation<Nav>();
  return <StatsScreen onBack={() => navigation.goBack()} />;
}

function BackgroundInfoRoute() {
  return <BackgroundInfoScreen />;
}

function UserProfileRoute() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<RouteProp<RootStackParamList, "UserProfile">>();
  return (
    <UserProfileScreen
      own={params.own}
      peer={params.peer}
      onBack={() => navigation.goBack()}
      onOpenDM={(peer) => navigation.navigate("DM", { peer })}
      onOpenRoomPreview={(room) => navigation.navigate("RoomPreview", { room })}
      onOpenRoom={(room) => enterRoom(navigation, room)}
    />
  );
}

function DMRoute() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<RouteProp<RootStackParamList, "DM">>();
  return (
    <DMScreen
      peer={params.peer}
      onBack={() => navigation.goBack()}
      onOpenInfo={(info) => navigation.navigate("DmInfo", { peer: params.peer, ...info })}
      onStartVoiceCall={(peerAvatarUrl) => navigation.navigate("VoiceCall", { peer: params.peer, peerAvatarUrl })}
    />
  );
}

function DmInfoRoute() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<RouteProp<RootStackParamList, "DmInfo">>();
  return (
    <DmInfoScreen
      peer={params.peer}
      peerAvatarUrl={params.peerAvatarUrl}
      muted={params.muted}
      mediaMessages={params.mediaMessages}
      fileMessages={params.fileMessages}
      onShowInChat={params.onShowInChat}
      onToggleMute={params.onToggleMute}
      onBack={() => navigation.goBack()}
      onBlocked={() => navigation.popToTop()}
      onOpenParticipant={(peer) => navigation.navigate("UserProfile", { own: false, peer })}
      onStartVoiceCall={(peer) => navigation.navigate("VoiceCall", { peer, peerAvatarUrl: params.peerAvatarUrl })}
    />
  );
}

function GroupChatRoute() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<RouteProp<RootStackParamList, "GroupChat">>();
  return (
    <GroupChatScreen
      group={params.group}
      onBack={() => navigation.goBack()}
      onOpenInfo={(detail) => navigation.navigate("GroupInfo", { group: detail })}
      onStartVoiceCall={(members) => {
        const [first, ...rest] = members;
        // VoiceCall DEGIL - VoiceCallScreen'de grup icin bir izgara (grid)
        // yok, bu yuzden grup aramalari (sesli de olsa) HER ZAMAN
        // VideoCall'a (GroupCallGrid, startWithVideoOff ile kamerasi kapali
        // baslayarak) yonlendirilir - bkz. RootStackParamList'teki
        // startWithVideoOff aciklamasi.
        navigation.navigate("VideoCall", {
          peer: { userId: first.userId, name: first.name },
          peerAvatarUrl: first.avatarUrl,
          additionalMemberIds: rest.map((m) => m.userId),
          startWithVideoOff: true,
        });
      }}
    />
  );
}

function GroupInfoRoute() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<RouteProp<RootStackParamList, "GroupInfo">>();
  return (
    <GroupInfoScreen
      readOnly
      members={params.group.members}
      groupName={params.group.name}
      onChangeGroupName={() => {}}
      groupAvatarUri={params.group.avatarUrl ?? ""}
      onChangeGroupAvatarUri={() => {}}
      onBack={() => navigation.goBack()}
    />
  );
}

// Gelen/giden GERCEK arama durumunu (useCallEngineContext) VoiceCall/
// VideoCall rotalarina baglayan ortak mantik - ikisi de AYNI sekilde
// davranir, sadece isVideo degeri ve render edilen ekran farkli.
function useRealCallWiring(peerUserId: string, isVideo: boolean, additionalMemberIds?: string[]) {
  const navigation = useNavigation<Nav>();
  const engine = useCallEngineContext();
  const startedRef = useRef(false);
  const everActiveRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    // phase "idle" ise bu ekran GELEN (zaten kabul edilmis) degil, GIDEN
    // yeni bir arama olarak acildi (bkz. DMScreen/DmInfoScreen) - davet
    // simdi gonderiliyor. Gelen aramada CallEngineContext.tsx zaten
    // acceptCall()'i navigasyondan ONCE cagirdigi icin phase burada "idle"
    // olmaz, tekrar davet gondermeyiz.
    if (engine.phase === "idle") {
      engine.startCall(peerUserId, isVideo, !!additionalMemberIds?.length).then((ok) => {
        // Grup sohbetinden baslatilan aramalarda (bkz. GroupChatRoute) ilk
        // uyeyle (peerUserId) baglanti kurulur kurulmaz kalanlar "Arama
        // Ekle" ile AYNI yontemle (engine.addToCall) sirayla eklenir -
        // aramayi baslatan taraf sunucuda zaten "accepted" sayildigi icin
        // (bkz. calls.ts startCall) bu hemen calisir, kimsenin kabul etmesini
        // BEKLEMEZ.
        if (ok) additionalMemberIds?.forEach((id) => engine.addToCall(id));
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (engine.phase !== "idle") everActiveRef.current = true;
    else if (everActiveRef.current && navigation.isFocused()) navigation.goBack();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine.phase]);

  function endCall() {
    engine.endCall();
    navigation.goBack();
  }

  return { engine, endCall };
}

// "Arama Ekle" - zaten gercek bir aramadayken (bkz. engine.addToCall) yeni
// bir kisi davet etmek icin FriendsScreen'in davet modunu bir Modal icinde
// acar - __DevHarness.tsx'teki AYNI deseni kullanir, sadece secilen kisiyi
// GERCEKTEN (call:group-add ile) ekler.
function useAddCallModal(engine: ReturnType<typeof useCallEngineContext>, myUserId: string | null, peerUserId: string) {
  const [visible, setVisible] = useState(false);
  const excludeIds = [peerUserId, ...engine.participants.map((p) => p.userId), ...(myUserId ? [myUserId] : [])];
  const modal = (
    <Modal visible={visible} animationType="slide" onRequestClose={() => setVisible(false)} statusBarTranslucent>
      <FriendsScreen
        onBack={() => setVisible(false)}
        onOpenDM={() => {}}
        onOpenParticipant={() => {}}
        inviteMode
        hideInviteExtras
        excludeUserIds={excludeIds}
        onSendInvites={(userIds) => {
          userIds.forEach((id) => engine.addToCall(id));
          setVisible(false);
        }}
      />
    </Modal>
  );
  return { onAddCall: () => setVisible(true), modal };
}

function VoiceCallRoute() {
  const { params } = useRoute<RouteProp<RootStackParamList, "VoiceCall">>();
  const navigation = useNavigation<Nav>();
  const { engine, endCall } = useRealCallWiring(params.peer.userId, false, params.additionalMemberIds);
  const { onAddCall, modal } = useAddCallModal(engine, null, params.peer.userId);
  // Birden fazla kisi gercekten aramaya katildiysa (bkz. "Arama Ekle")
  // VideoCallScreen'in grup moduna (GroupCallGrid) gecilir - sesli aramada
  // boyle bir grid yok, bu yuzden GERCEKTEN goruntulu aramaya da geciliyor
  // (katilimcilarin birbirini GORMESI icin zaten video acik olmasi gerekir).
  useEffect(() => {
    if (engine.participants.length > 1) {
      navigation.replace("VideoCall", { peer: params.peer, peerAvatarUrl: params.peerAvatarUrl });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine.participants.length]);
  return (
    <>
      <VoiceCallScreen
        peer={params.peer}
        peerAvatarUrl={params.peerAvatarUrl}
        onEnd={endCall}
        onMinimize={() => {
          // GERCEK arama/baglanti kesilmez (motor RootNavigator'in disinda,
          // bkz. CallEngineContext.tsx) - sadece bu ekran yiginindan kalkar,
          // yerine kucultulmus banner gelir.
          engine.setCallMinimized(true);
          navigation.goBack();
        }}
        onSwitchToVideo={() => navigation.replace("VideoCall", { peer: params.peer, peerAvatarUrl: params.peerAvatarUrl })}
        onAddCall={onAddCall}
        realCall={engine}
      />
      {modal}
    </>
  );
}

function VideoCallRoute() {
  const { params } = useRoute<RouteProp<RootStackParamList, "VideoCall">>();
  const navigation = useNavigation<Nav>();
  const { engine, endCall } = useRealCallWiring(params.peer.userId, !params.startWithVideoOff, params.additionalMemberIds);
  const { onAddCall, modal } = useAddCallModal(engine, null, params.peer.userId);
  // 1'den fazla katilimci varsa (bkz. "Arama Ekle") GroupCallGrid'e gecmek
  // icin VideoCallScreen'e GERCEK katilimci listesini veriyoruz. isGroupCall
  // true ise (bkz. useCallEngine.ts) HENUZ KIMSE katilmamis olsa bile (bos
  // dizi) izgaraya geciliyor - "calarken sadece ben, katilan tek tek
  // eklensin" davranisi boyle saglanir (bkz. VideoCallScreen.tsx'teki
  // "participants !== undefined" kontrolu).
  const groupParticipants: GroupParticipant[] | undefined =
    engine.isGroupCall || engine.participants.length > 1
      ? engine.participants.map((p) => ({ userId: p.userId, name: p.name, avatarUrl: p.avatarUrl }))
      : undefined;
  return (
    <>
      <VideoCallScreen
        peer={params.peer}
        peerAvatarUrl={params.peerAvatarUrl}
        onEnd={endCall}
        onMinimize={() => {
          engine.setCallMinimized(true);
          navigation.goBack();
        }}
        onAddCall={onAddCall}
        participants={groupParticipants}
        realCall={engine}
      />
      {modal}
    </>
  );
}

function RoomPreviewRoute() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<RouteProp<RootStackParamList, "RoomPreview">>();
  function joinRoomFromPreview() {
    // "name" gonderilmiyor - sunucu zaten identify olmus GERCEK kullanicinin
    // adini biliyor (myName), bunu client'in tekrar hesaplayip "Misafir" ile
    // EZMESINE gerek yok (eskiden tum katilimcilar yanlislikla "Misafir"
    // gorunuyordu, bkz. DiscoverScreen.tsx joinByCode ayni duzeltme).
    getSocket().emit("room:join", { code: params.room.code }, (res: any) => {
      if (res.ok) enterRoom(navigation, res.room);
    });
  }
  return (
    <RoomPreviewScreen
      room={params.room}
      onBack={() => navigation.goBack()}
      onJoin={joinRoomFromPreview}
      onOpenParticipant={(peer) => navigation.navigate("UserProfile", { own: false, peer })}
      // Tab.Navigator'in DISINDAN (bkz. yukarisi) MainTabs'a, istenen sekmeyle
      // geri donuyor - MainTabs zaten yiginda oldugu icin bu hem "geri" hem
      // "sekme degistir" islevini TEK seferde gorur.
      // "as never": react-navigation'in NavigatorScreenParams'i her sekme icin
      // AYRI bir discriminated union uyesi uretiyor - "tab" bizim tarafimizda
      // zaten TabKey (o 5 sekmeyle BIREBIR ayni) ile kisitli oldugu icin bu
      // tur-guvenli bir atlama, gercek bir tip kacagi degil.
      onNavigateTab={(tab) => navigation.navigate("MainTabs", { screen: tab } as never)}
    />
  );
}

function RoomRoute() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<RouteProp<RootStackParamList, "Room">>();
  return (
    <RoomScreen
      initialRoom={params.room}
      onLeave={() => navigation.goBack()}
      onOpenParticipant={(peer) => navigation.navigate("UserProfile", { own: false, peer })}
    />
  );
}

export default function RootNavigator() {
  return (
    <NavigationContainer ref={navigationRef} theme={navTheme} onReady={notifyRouteNameListeners} onStateChange={notifyRouteNameListeners}>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          // Artik App.tsx'teki TEK, paylasilan AppBackground (degrade) her
          // ekranin ARKASINDA sabit duruyor - ekranlarin kendi kok kaplari
          // artik seffaf, gecis sirasinda beyaz/bos bir an gorunmesin diye
          // native-stack'in kendi arka plani da seffaf (opak bir renk
          // koyarsak degrade gecis sirasinda bir an kaybolurdu).
          contentStyle: { backgroundColor: "transparent" },
          // Platformun KENDI varsayilanina birakmak yerine (iOS'ta sagdan
          // kaydirma, Android'de yukari-kaydirma+solma karisimi - ikisi
          // FARKLI hissettiriyordu) tum "derinlemesine giris" ekranlari
          // icin tek, tutarli bir yatay kaydirma secildi.
          animation: "slide_from_right",
        }}
      >
        <Stack.Screen name="MainTabs" component={MainTabsRoute} />
        {/* Bilgi/ayar niteligindeki tek-sayfalik ekranlar (Ayarlar'dan acilir,
            "derinlemesine" bir akisin parcasi degil) - asagidan yukari
            kayarak gelen bir "sayfa/sheet" hissi veriyor, geri kalan
            navigasyon akisindan gorsel olarak ayrisiyor. */}
        <Stack.Screen name="AppSettings" component={AppSettingsRoute} />
        <Stack.Screen name="Premium" component={PremiumRoute} options={{ animation: "slide_from_bottom" }} />
        <Stack.Screen name="Privacy" component={PrivacyRoute} options={{ animation: "slide_from_bottom" }} />
        <Stack.Screen name="Notifications" component={NotificationsRoute} options={{ animation: "slide_from_bottom" }} />
        <Stack.Screen name="Blocked" component={BlockedRoute} options={{ animation: "slide_from_bottom" }} />
        <Stack.Screen name="Stats" component={StatsRoute} options={{ animation: "slide_from_bottom" }} />
        <Stack.Screen name="BackgroundInfo" component={BackgroundInfoRoute} options={{ animation: "slide_from_bottom" }} />
        <Stack.Screen name="UserProfile" component={UserProfileRoute} />
        <Stack.Screen name="DM" component={DMRoute} />
        <Stack.Screen name="DmInfo" component={DmInfoRoute} />
        <Stack.Screen name="GroupChat" component={GroupChatRoute} />
        <Stack.Screen name="GroupInfo" component={GroupInfoRoute} />
        <Stack.Screen name="VoiceCall" component={VoiceCallRoute} options={{ animation: "fade", gestureEnabled: false }} />
        <Stack.Screen name="VideoCall" component={VideoCallRoute} options={{ animation: "fade", gestureEnabled: false }} />
        <Stack.Screen name="RoomPreview" component={RoomPreviewRoute} />
        <Stack.Screen name="Room" component={RoomRoute} options={{ animation: "fade", gestureEnabled: false }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
