import { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Image } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { supabase } from "../services/supabase";
import { showAlert } from "../components/CustomAlert";
import { theme } from "../theme";
import { GoogleIcon, AppleIcon } from "../components/SocialAuthIcons";

// app.json'daki "scheme": "luna" ile eslesiyor - Supabase, OAuth sonrasi
// kullaniciyi tarayicidan buraya (uygulamanin kendisine) geri yonlendirir.
const REDIRECT_URL = "luna://login-callback";

type Provider = "google" | "apple";

export default function LoginScreen() {
  const [loadingProvider, setLoadingProvider] = useState<Provider | null>(null);

  // Supabase Dashboard > Authentication > Providers'ta Google/Apple
  // ETKINLESTIRILMEDIYSE (kendi OAuth client id/secret'lari girilmediyse)
  // bu cagri hata doner - kod tarafi hazir, sadece dashboard tarafinin
  // ayarlanmasi gerekiyor.
  async function signInWithProvider(provider: Provider) {
    setLoadingProvider(provider);
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: REDIRECT_URL, skipBrowserRedirect: true },
    });
    if (error || !data?.url) {
      setLoadingProvider(null);
      showAlert("Giriş başarısız", error?.message || "Giriş başlatılamadı.");
      return;
    }
    const result = await WebBrowser.openAuthSessionAsync(data.url, REDIRECT_URL);
    if (result.type !== "success" || !result.url) {
      setLoadingProvider(null);
      return;
    }
    const fragment = result.url.split("#")[1] || result.url.split("?")[1] || "";
    const params = new URLSearchParams(fragment);
    const access_token = params.get("access_token");
    const refresh_token = params.get("refresh_token");
    setLoadingProvider(null);
    if (!access_token || !refresh_token) {
      showAlert("Giriş başarısız", "Oturum bilgisi alınamadı.");
      return;
    }
    await supabase.auth.setSession({ access_token, refresh_token });
    // Basarili giristen sonra App.tsx'teki onAuthStateChange dinleyicisi
    // otomatik olarak kullaniciyi ana ekrana yonlendirecek.
  }

  return (
    <View style={styles.container}>
      <Image source={require("../../assets/lavin-icon-mark.png")} style={styles.logoMark} resizeMode="contain" />
      <Text style={styles.subtitle}>Devam etmek için giriş yap</Text>

      <TouchableOpacity
        style={[styles.providerButton, styles.googleButton]}
        onPress={() => signInWithProvider("google")}
        disabled={loadingProvider !== null}
      >
        {loadingProvider === "google" ? (
          <ActivityIndicator color="#1C1C1E" />
        ) : (
          <>
            <GoogleIcon size={18} />
            <Text style={styles.googleButtonText}>Google ile devam et</Text>
          </>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.providerButton, styles.appleButton]}
        onPress={() => signInWithProvider("apple")}
        disabled={loadingProvider !== null}
      >
        {loadingProvider === "apple" ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <>
            <AppleIcon size={18} />
            <Text style={styles.appleButtonText}>Apple ile devam et</Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  // Artik App.tsx'teki paylasilan AppBackground (degrade) arkada duruyor.
  container: { flex: 1, backgroundColor: "transparent", padding: 24, justifyContent: "center" },
  // Logo artik beyaz siluet - tintColor, PNG'nin seffaf olmayan tum
  // piksellerini bu renge boyar (bkz. MediaPickerSheet.tsx topBarLogo
  // AYNI teknik).
  logoMark: { width: 220, height: 103, alignSelf: "center", marginBottom: 12, tintColor: "#FFFFFF" },
  subtitle: { color: theme.textMuted, fontSize: 16, textAlign: "center", marginBottom: 32 },
  providerButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    borderRadius: 10,
    paddingVertical: 14,
    marginBottom: 12,
  },
  googleButton: { backgroundColor: "#FFFFFF" },
  googleButtonText: { color: "#1C1C1E", fontSize: 16, fontWeight: "700" },
  appleButton: { backgroundColor: "#000000", borderWidth: 1, borderColor: "rgba(255,255,255,0.18)" },
  appleButtonText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
});
