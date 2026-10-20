import { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Image } from "react-native";
import * as WebBrowser from "expo-web-browser";
import FontAwesome5 from "@expo/vector-icons/FontAwesome5";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import { supabase } from "../services/supabase";
import { showAlert } from "../components/CustomAlert";
import { theme } from "../theme";
import { GoogleIcon, AppleIcon } from "../components/SocialAuthIcons";

// app.json'daki "scheme": "luna" ile eslesiyor - Supabase, OAuth sonrasi
// kullaniciyi tarayicidan buraya (uygulamanin kendisine) geri yonlendirir.
const REDIRECT_URL = "luna://login-callback";

// Supabase'in Provider turundeki GERCEK anahtarlar - X'in kendi anahtari
// hala tarihi ismiyle "twitter" (marka degisikligine ragmen Supabase bunu
// degistirmedi), buton metninde yine de "X" yaziyor. Telegram BILEREK yok -
// Supabase'in listesinde Telegram diye bir OAuth saglayicisi YOK (Telegram
// kendi "Login Widget" mekanizmasini kullanir, standart OAuth2 degil, ayri
// bir backend entegrasyonu gerektirir).
type Provider = "google" | "apple" | "discord" | "facebook" | "twitter";

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

      <View style={styles.providerRow}>
        <TouchableOpacity
          style={styles.providerButton}
          onPress={() => signInWithProvider("google")}
          disabled={loadingProvider !== null}
        >
          <View style={[styles.providerIconBox, styles.googleIconBox]}>
            {loadingProvider === "google" ? <ActivityIndicator color="#1C1C1E" /> : <GoogleIcon size={22} />}
          </View>
          <Text style={styles.providerLabel}>Google</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.providerButton}
          onPress={() => signInWithProvider("apple")}
          disabled={loadingProvider !== null}
        >
          <View style={[styles.providerIconBox, styles.appleIconBox]}>
            {loadingProvider === "apple" ? <ActivityIndicator color="#FFFFFF" /> : <AppleIcon size={22} />}
          </View>
          <Text style={styles.providerLabel}>Apple</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.providerButton}
          onPress={() => signInWithProvider("discord")}
          disabled={loadingProvider !== null}
        >
          <View style={[styles.providerIconBox, styles.discordIconBox]}>
            {loadingProvider === "discord" ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <FontAwesome5 name="discord" size={24} color="#FFFFFF" />
            )}
          </View>
          <Text style={styles.providerLabel}>Discord</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.providerButton}
          onPress={() => signInWithProvider("facebook")}
          disabled={loadingProvider !== null}
        >
          <View style={[styles.providerIconBox, styles.facebookIconBox]}>
            {loadingProvider === "facebook" ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <FontAwesome5 name="facebook-f" size={22} color="#FFFFFF" />
            )}
          </View>
          <Text style={styles.providerLabel}>Facebook</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.providerButton}
          onPress={() => signInWithProvider("twitter")}
          disabled={loadingProvider !== null}
        >
          <View style={[styles.providerIconBox, styles.xIconBox]}>
            {loadingProvider === "twitter" ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <FontAwesome6 name="x-twitter" size={22} color="#FFFFFF" />
            )}
          </View>
          <Text style={styles.providerLabel}>X</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Artik App.tsx'teki paylasilan AppBackground (degrade) arkada duruyor.
  container: { flex: 1, backgroundColor: "transparent", padding: 24, justifyContent: "center" },
  // Logo artik beyaz siluet - tintColor, PNG'nin seffaf olmayan tum
  // piksellerini bu renge boyar (bkz. MediaPickerSheet.tsx topBarLogo
  // AYNI teknik). Altyazi kaldirildigi icin logo biraz yukari, satir
  // biraz asagi kaydi (marginBottom negatif/providerRow marginTop buyuk).
  logoMark: { width: 220, height: 103, alignSelf: "center", marginBottom: -8, tintColor: "#FFFFFF" },
  // Paylas ekranindaki ("Uygulamayla paylaş" satiri, bkz. ShareRoomContent.tsx
  // appButton/appIconCircle) AYNI kare ikon + alt yazi kalibi - tutarlilik
  // icin kose yuvarlakligi ayni (squircle). Bes buton TEK satira sigsin diye
  // 64/kose 18'den biraz kucuk tutuldu: 62/kose 18, columnGap 10.
  providerRow: { flexDirection: "row", justifyContent: "center", columnGap: 10, marginTop: 64 },
  providerButton: { alignItems: "center", gap: 8, width: 62 },
  providerIconBox: { width: 62, height: 62, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  googleIconBox: { backgroundColor: "#FFFFFF" },
  appleIconBox: { backgroundColor: "#000000", borderWidth: 1, borderColor: "rgba(255,255,255,0.18)" },
  discordIconBox: { backgroundColor: "#5865F2" },
  facebookIconBox: { backgroundColor: "#1877F2" },
  // X'in marka rengi saf siyah - Apple ile aynı sebeple (koyu arka planda
  // ayirt edilsin diye) ince beyaz cerceve (bkz. ShareRoomContent.tsx
  // appIconBlack AYNI kural).
  xIconBox: { backgroundColor: "#000000", borderWidth: 1, borderColor: "rgba(255,255,255,0.18)" },
  providerLabel: { color: theme.text, fontSize: 12, fontWeight: "600" },
});
