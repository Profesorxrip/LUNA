import React, { useEffect, useState } from "react";
import { View, ActivityIndicator } from "react-native";
import { StatusBar } from "expo-status-bar";
import { Session } from "@supabase/supabase-js";
import { supabase } from "./src/services/supabase";
import LoginScreen from "./src/screens/LoginScreen";
import DiscoverScreen from "./src/screens/DiscoverScreen";
import RoomScreen from "./src/screens/RoomScreen";
import ProfileScreen from "./src/screens/ProfileScreen";
import UserProfileScreen from "./src/screens/UserProfileScreen";
import DMScreen, { DMPeer } from "./src/screens/DMScreen";
import FriendsScreen from "./src/screens/FriendsScreen";
import { RoomState, getSocket } from "./src/services/socket";
import { registerForPushNotifications } from "./src/services/notifications";

type Screen = "discover" | "profile" | "userProfile" | "dm" | "friends";

// Roadmap AŞAMA 3: gercek authentication artik zorunlu.
const PREVIEW_SKIP_AUTH = false;

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [screen, setScreen] = useState<Screen>("discover");
  const [room, setRoom] = useState<RoomState | null>(null);
  const [dmPeer, setDmPeer] = useState<DMPeer | null>(null);
  const [dmReturnTo, setDmReturnTo] = useState<Screen>("userProfile");
  const [friendsReturnTo, setFriendsReturnTo] = useState<Screen>("discover");

  function openDM(peer: DMPeer, returnTo: Screen) {
    setDmPeer(peer);
    setDmReturnTo(returnTo);
    setScreen("dm");
  }

  function openFriends(returnTo: Screen) {
    setFriendsReturnTo(returnTo);
    setScreen("friends");
  }

  useEffect(() => {
    if (PREVIEW_SKIP_AUTH) {
      setCheckingSession(false);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setCheckingSession(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  // Sunucuya kim oldugumuzu kanitlamak icin gercek Supabase access token'ini
  // gonderiyoruz - sunucu bunu dogrulayip GERCEK kullanici id'sini kendisi
  // cikarir (bkz. server/src/index.ts user:identify). Client'in "ben buyum"
  // demesine artik izin verilmiyor (roadmap AŞAMA 4, IDOR duzeltmesi).
  useEffect(() => {
    if (session?.access_token) {
      getSocket().emit("user:identify", { accessToken: session.access_token });
      registerForPushNotifications();
    }
  }, [session?.access_token]);

  if (checkingSession) {
    return (
      <View style={{ flex: 1, backgroundColor: "#0A0A0C", justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator color="#10B981" size="large" />
      </View>
    );
  }

  if (!session && !PREVIEW_SKIP_AUTH) {
    return (
      <>
        <LoginScreen />
        <StatusBar style="light" />
      </>
    );
  }

  function handleEnterRoom(r: RoomState) {
    setRoom(r);
    setScreen("discover"); // odadan cikildiginda kesif ekranina donsun
  }

  return (
    <>
      {room ? (
        <RoomScreen initialRoom={room} onLeave={() => setRoom(null)} />
      ) : screen === "dm" && dmPeer ? (
        <DMScreen peer={dmPeer} onBack={() => setScreen(dmReturnTo)} />
      ) : screen === "friends" ? (
        <FriendsScreen
          onBack={() => setScreen(friendsReturnTo)}
          onOpenSettings={() => setScreen("profile")}
          onOpenDM={(peer) => openDM(peer, "friends")}
        />
      ) : screen === "userProfile" ? (
        <UserProfileScreen onBack={() => setScreen("profile")} own onOpenDM={(peer) => openDM(peer, "userProfile")} />
      ) : screen === "profile" ? (
        <ProfileScreen
          onBack={() => setScreen("discover")}
          onOpenUserProfile={() => setScreen("userProfile")}
          onOpenFriends={() => openFriends("profile")}
        />
      ) : (
        <DiscoverScreen
          onJoinRoom={handleEnterRoom}
          onOpenProfile={() => setScreen("profile")}
          onOpenFriends={() => openFriends("discover")}
        />
      )}
      <StatusBar style="light" />
    </>
  );
}
