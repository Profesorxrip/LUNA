import React, { useEffect, useRef, useState } from "react";
import { Animated, Easing, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Session } from "@supabase/supabase-js";
import { supabase } from "./src/services/supabase";
import LoginScreen from "./src/screens/LoginScreen";
import RootNavigator from "./src/navigation/RootNavigator";
import CustomAlertHost from "./src/components/CustomAlert";
import AppBackground from "./src/components/AppBackground";
import SplashScreen from "./src/components/SplashScreen";
import { getSocket } from "./src/services/socket";
import { registerForPushNotifications } from "./src/services/notifications";
import { loadStoredLanguage } from "./src/i18n";

// Roadmap AŞAMA 3: gercek authentication artik zorunlu. Google OAuth
// Supabase'de etkinlestirildigi icin artik gercekten test edilebilir,
// bu yuzden atlama KALICI olarak kapatildi.
const PREVIEW_SKIP_AUTH = false;

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const isAuthed = Boolean(session) || PREVIEW_SKIP_AUTH;

  // Ekranda O AN gercekten duran hal (Giris ekrani mi, ana uygulama mi) -
  // isAuthed'den KASITLI olarak ayri tutuluyor: oturum kontrolu bitince
  // (checkingSession false olunca) dogrudan dogru ekrana gecilir (giris
  // ekranini GEREKSIZ YERE "yanip sondurmeyelim" diye animasyonsuz), ama
  // uygulama ACIKKEN gercek bir giris/cikis olursa (asagidaki crossfade
  // efekti) Giris<->Discover arasinda solarak gecis yapilir.
  const [displayedAuthed, setDisplayedAuthed] = useState<boolean | null>(null);
  const fade = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    loadStoredLanguage();
    if (PREVIEW_SKIP_AUTH) {
      setDisplayedAuthed(true);
      setCheckingSession(false);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setDisplayedAuthed(Boolean(data.session));
      setCheckingSession(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  // Giris ekranindan ana uygulamaya (Discover) - ya da cikis yapilinca tersi
  // yonde - GECIS: oturum durumu anlik olarak degismesine ragmen, once o an
  // ekranda duran icerik solup kayboluyor, SONRA yeni icerik (RootNavigator
  // veya LoginScreen) solarak beliriyor (bkz. yukaridaki displayedAuthed).
  useEffect(() => {
    if (checkingSession || displayedAuthed === null || isAuthed === displayedAuthed) return;
    Animated.timing(fade, {
      toValue: 0,
      duration: 260,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      setDisplayedAuthed(isAuthed);
      Animated.timing(fade, {
        toValue: 1,
        duration: 340,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    });
  }, [isAuthed, checkingSession, displayedAuthed, fade]);

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
      <View style={{ flex: 1 }}>
        <AppBackground />
        <SplashScreen />
        <CustomAlertHost />
        <StatusBar style="light" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <AppBackground />
      <Animated.View style={{ flex: 1, opacity: fade }}>
        {displayedAuthed ? (
          <SafeAreaProvider>
            <RootNavigator />
            <CustomAlertHost />
            <StatusBar style="light" />
          </SafeAreaProvider>
        ) : (
          <>
            <LoginScreen />
            <CustomAlertHost />
            <StatusBar style="light" />
          </>
        )}
      </Animated.View>
    </View>
  );
}
