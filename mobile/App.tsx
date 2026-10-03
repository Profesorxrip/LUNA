import React, { useEffect, useState } from "react";
import { View, ActivityIndicator } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Session } from "@supabase/supabase-js";
import { supabase } from "./src/services/supabase";
import LoginScreen from "./src/screens/LoginScreen";
import RootNavigator from "./src/navigation/RootNavigator";
import CustomAlertHost from "./src/components/CustomAlert";
import { getSocket } from "./src/services/socket";
import { registerForPushNotifications } from "./src/services/notifications";

// Roadmap AŞAMA 3: gercek authentication artik zorunlu.
const PREVIEW_SKIP_AUTH = false;

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);

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
        <CustomAlertHost />
      </View>
    );
  }

  if (!session && !PREVIEW_SKIP_AUTH) {
    return (
      <>
        <LoginScreen />
        <CustomAlertHost />
        <StatusBar style="light" />
      </>
    );
  }

  return (
    <SafeAreaProvider>
      <RootNavigator />
      <CustomAlertHost />
      <StatusBar style="light" />
    </SafeAreaProvider>
  );
}
