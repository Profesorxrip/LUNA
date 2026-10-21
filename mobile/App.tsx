import React, { useEffect, useRef, useState } from "react";
import { Animated, Dimensions, Easing, StyleSheet, View } from "react-native";
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

const SCREEN_H = Dimensions.get("window").height;

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const isAuthed = Boolean(session) || PREVIEW_SKIP_AUTH;

  // Ekranda O AN gercekten duran hal (Giris ekrani mi, ana uygulama mi) -
  // isAuthed'den KASITLI olarak ayri tutuluyor: oturum kontrolu bitince
  // (checkingSession false olunca) dogrudan dogru ekrana gecilir (giris
  // ekranini GEREKSIZ YERE "yanip sondurmeyelim" diye animasyonsuz), ama
  // uygulama ACIKKEN gercek bir giris/cikis olursa (asagidaki kayma
  // efekti) Giris<->Discover arasinda asagidan yukari kayarak gecis
  // yapilir.
  const [displayedAuthed, setDisplayedAuthed] = useState<boolean | null>(null);
  // Gecis SIRASINDA eski ekranin UZERINE kayarak gelen yeni ekran - null
  // ise gecis yok, SADECE displayedAuthed (sabit alt katman) gosteriliyor.
  const [incomingAuthed, setIncomingAuthed] = useState<boolean | null>(null);
  const slide = useRef(new Animated.Value(0)).current;

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
  // yonde - GECIS: yeni icerik, o an ekranda duran (sabit kalan) eski
  // icerigin UZERINE asagidan yukari dogru kayarak geliyor (bkz. asagidaki
  // render - alt katman displayedAuthed, ust katman incomingAuthed).
  useEffect(() => {
    if (checkingSession || displayedAuthed === null || isAuthed === displayedAuthed) return;
    setIncomingAuthed(isAuthed);
    slide.setValue(0);
    Animated.timing(slide, {
      toValue: 1,
      duration: 420,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      setDisplayedAuthed(isAuthed);
      setIncomingAuthed(null);
    });
  }, [isAuthed, checkingSession, displayedAuthed, slide]);

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
      <View style={{ flex: 1 }}>{renderContent(displayedAuthed)}</View>
      {incomingAuthed !== null && (
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            {
              transform: [
                {
                  translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [SCREEN_H, 0] }),
                },
              ],
            },
          ]}
        >
          {renderContent(incomingAuthed)}
        </Animated.View>
      )}
    </View>
  );

  // Giris ekrani ya da ana uygulama (Discover) agacini kurar - hem sabit
  // alt katmanda hem de kayarak gelen ust katmanda AYNI sekilde
  // kullanilabilsin diye ayri bir fonksiyona cikarildi.
  function renderContent(authed: boolean | null) {
    return authed ? (
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
    );
  }
}
