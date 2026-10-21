import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, View, ActivityIndicator } from "react-native";
import LunaLogo from "./LunaLogo";
import { theme } from "../theme";

/** App.tsx'te oturum kontrol edilirken (checkingSession) gosterilen acilis
 * ekrani - eskiden markasiz, ciplak bir ActivityIndicator'du. Artik
 * LoginScreen'deki ile AYNI LUNA logosu (bkz. LunaLogo.tsx) hafif bir
 * fade + yukari kayma ile beliriyor, altinda yukleniyor gostergesi doner. */
export default function SplashScreen() {
  const fade = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(14)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 650, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 650, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, [fade, translateY]);

  return (
    <View style={styles.container}>
      <Animated.View style={{ opacity: fade, transform: [{ translateY }] }}>
        <LunaLogo width={190} />
      </Animated.View>
      <ActivityIndicator color={theme.accent} size="small" style={styles.spinner} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center" },
  spinner: { marginTop: 30 },
});
