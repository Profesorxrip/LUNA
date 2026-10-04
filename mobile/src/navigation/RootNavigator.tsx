import React from "react";
import { NavigationContainer, RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import { createNativeStackNavigator, NativeStackNavigationProp } from "@react-navigation/native-stack";
import DiscoverScreen from "../screens/DiscoverScreen";
import ProfileScreen from "../screens/ProfileScreen";
import PremiumScreen from "../screens/PremiumScreen";
import UserProfileScreen from "../screens/UserProfileScreen";
import FriendsScreen from "../screens/FriendsScreen";
import DMScreen, { DMPeer } from "../screens/DMScreen";
import RoomPreviewScreen from "../screens/RoomPreviewScreen";
import RoomScreen from "../screens/RoomScreen";
import { getSocket, PublicRoomSummary, RoomState } from "../services/socket";
import { theme } from "../theme";

type PeerParam = { userId: string; name: string; handle?: string };

/** Gercek bir navigasyon yigini (react-navigation) - eskiden App.tsx'te
 * "screen" state'i + "returnTo" degiskenleriyle elle taklit ediliyordu, bu
 * da hem geri kayarken dogru ekrana donmeyi elle takip etmeyi gerektiriyordu
 * hem de ekranlar arasi GECIS ANIMASYONU hic yoktu (anlik kesme gibiydi).
 * Artik "geri" native olarak yigindan bir onceki ekrani biliyor (returnTo
 * degiskenlerine gerek kalmadi) ve her gecis platformun kendi kaydirma
 * animasyonuyla oluyor. */
export type RootStackParamList = {
  Discover: undefined;
  Profile: undefined;
  Premium: undefined;
  UserProfile: { own: boolean; peer?: PeerParam };
  Friends: undefined;
  DM: { peer: DMPeer };
  RoomPreview: { room: PublicRoomSummary };
  Room: { room: RoomState };
};

const Stack = createNativeStackNavigator<RootStackParamList>();
type Nav = NativeStackNavigationProp<RootStackParamList>;

function DiscoverRoute() {
  const navigation = useNavigation<Nav>();
  return (
    <DiscoverScreen
      onJoinRoom={(room) =>
        // Oda, nereden acilirsa acilsin HEP Kesif'in uzerine biner ve
        // cikinca HEP Kesif'e doner (eski App.tsx'teki "handleEnterRoom"
        // ile ayni davranis) - stack'i [Discover, Room] olarak sifirliyoruz.
        navigation.reset({ index: 1, routes: [{ name: "Discover" }, { name: "Room", params: { room } }] })
      }
      onOpenProfile={() => navigation.navigate("Profile")}
      onOpenFriends={() => navigation.navigate("Friends")}
      onOpenParticipant={(peer) => navigation.navigate("UserProfile", { own: false, peer })}
      onOpenRoomPreview={(room) => navigation.navigate("RoomPreview", { room })}
    />
  );
}

function ProfileRoute() {
  const navigation = useNavigation<Nav>();
  return (
    <ProfileScreen
      onBack={() => navigation.goBack()}
      onOpenUserProfile={() => navigation.navigate("UserProfile", { own: true })}
      onOpenFriends={() => navigation.navigate("Friends")}
      onOpenPremium={() => navigation.navigate("Premium")}
    />
  );
}

function PremiumRoute() {
  return <PremiumScreen />;
}

function UserProfileRoute() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<RouteProp<RootStackParamList, "UserProfile">>();
  return (
    <UserProfileScreen
      own={params.own}
      peer={params.peer}
      onOpenDM={(peer) => navigation.navigate("DM", { peer })}
      onOpenRoomPreview={(room) => navigation.navigate("RoomPreview", { room })}
    />
  );
}

function FriendsRoute() {
  const navigation = useNavigation<Nav>();
  return (
    <FriendsScreen
      onBack={() => navigation.goBack()}
      onOpenSettings={() => navigation.navigate("Profile")}
      onOpenDM={(peer) => navigation.navigate("DM", { peer })}
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
    getSocket().emit("room:join", { code: params.room.code, name: "Misafir" }, (res: any) => {
      if (res.ok) {
        navigation.reset({ index: 1, routes: [{ name: "Discover" }, { name: "Room", params: { room: res.room } }] });
      }
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
  return <RoomScreen initialRoom={params.room} onLeave={() => navigation.goBack()} />;
}

export default function RootNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          // Rave/LUNA her ekranda zaten kendi koyu arka planini ciziyor -
          // gecis sirasinda beyaz bir "cam" gorunmesin diye native-stack'in
          // kendi arka plani da koyu.
          contentStyle: { backgroundColor: theme.bg },
        }}
      >
        <Stack.Screen name="Discover" component={DiscoverRoute} />
        <Stack.Screen name="Profile" component={ProfileRoute} />
        <Stack.Screen name="Premium" component={PremiumRoute} />
        <Stack.Screen name="UserProfile" component={UserProfileRoute} />
        <Stack.Screen name="Friends" component={FriendsRoute} />
        <Stack.Screen name="DM" component={DMRoute} />
        <Stack.Screen name="RoomPreview" component={RoomPreviewRoute} />
        <Stack.Screen name="Room" component={RoomRoute} options={{ animation: "fade", gestureEnabled: false }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
