import React, { useEffect } from "react";
import { Linking } from "react-native";
import { DarkTheme, NavigationContainer, RouteProp, useNavigation, useRoute } from "@react-navigation/native";
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
import BackgroundInfoScreen from "../screens/BackgroundInfoScreen";
import UserProfileScreen from "../screens/UserProfileScreen";
import DMScreen, { DMPeer } from "../screens/DMScreen";
import RoomPreviewScreen from "../screens/RoomPreviewScreen";
import RoomScreen from "../screens/RoomScreen";
import TabBar from "./TabBar";
import { getSocket, PublicRoomSummary, RoomState } from "../services/socket";

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
  Settings: undefined;
};

export type RootStackParamList = {
  MainTabs: undefined;
  Premium: undefined;
  Privacy: undefined;
  BackgroundInfo: undefined;
  // Baska birinin profilini goruntülemek icin (own:false + peer) - kendi
  // profilimiz artik MainTabs icindeki "Profile" sekmesi (bkz. MyProfileRoute).
  UserProfile: { own: boolean; peer?: PeerParam };
  DM: { peer: DMPeer };
  RoomPreview: { room: PublicRoomSummary };
  Room: { room: RoomState };
};

const Stack = createNativeStackNavigator<RootStackParamList>();
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
      onOpenProfile={() => navigation.navigate("Settings")}
      onOpenFriends={() => navigation.navigate("Friends")}
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
    />
  );
}

function SettingsRoute() {
  const navigation = useNavigation<TabNav<"Settings">>();
  return (
    <ProfileScreen
      onOpenUserProfile={() => navigation.navigate("Profile")}
      onOpenPremium={() => navigation.navigate("Premium")}
      onOpenPrivacy={() => navigation.navigate("Privacy")}
      onOpenBackgroundInfo={() => navigation.navigate("BackgroundInfo")}
    />
  );
}

function MainTabsRoute() {
  return (
    <Tab.Navigator tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tab.Screen name="Discover" component={DiscoverRoute} />
      <Tab.Screen name="Friends" component={FriendsRoute} />
      <Tab.Screen name="Create" component={CreateRoute} />
      <Tab.Screen name="Profile" component={MyProfileRoute} />
      <Tab.Screen name="Settings" component={SettingsRoute} />
    </Tab.Navigator>
  );
}

function PremiumRoute() {
  return <PremiumScreen />;
}

function PrivacyRoute() {
  return <PrivacyScreen />;
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
  return <DMScreen peer={params.peer} onBack={() => navigation.goBack()} />;
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
    <NavigationContainer theme={navTheme}>
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
        <Stack.Screen name="Premium" component={PremiumRoute} options={{ animation: "slide_from_bottom" }} />
        <Stack.Screen name="Privacy" component={PrivacyRoute} options={{ animation: "slide_from_bottom" }} />
        <Stack.Screen name="BackgroundInfo" component={BackgroundInfoRoute} options={{ animation: "slide_from_bottom" }} />
        <Stack.Screen name="UserProfile" component={UserProfileRoute} />
        <Stack.Screen name="DM" component={DMRoute} />
        <Stack.Screen name="RoomPreview" component={RoomPreviewRoute} />
        <Stack.Screen name="Room" component={RoomRoute} options={{ animation: "fade", gestureEnabled: false }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
