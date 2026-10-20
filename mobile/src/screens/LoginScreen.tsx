import { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Image } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { useFonts, BebasNeue_400Regular } from "@expo-google-fonts/bebas-neue";
import FontAwesome5 from "@expo/vector-icons/FontAwesome5";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import { supabase } from "../services/supabase";
import { showAlert } from "../components/CustomAlert";
import { theme } from "../theme";
import { GoogleIcon } from "../components/SocialAuthIcons";

// app.json'daki "scheme": "luna" ile eslesiyor - Supabase, OAuth sonrasi
// kullaniciyi tarayicidan buraya (uygulamanin kendisine) geri yonlendirir.
const REDIRECT_URL = "luna://login-callback";

// Supabase'in Provider turundeki GERCEK anahtarlar - X'in kendi anahtari
// hala tarihi ismiyle "twitter" (marka degisikligine ragmen Supabase bunu
// degistirmedi), buton metninde yine de "X" yaziyor. Discord (hesap acma
// captcha sorunu) ve Microsoft/Azure (kurulumda baska bir engel) SIRAYLA
// denendi, ikisi de kullanicinin OWN DEVELOPER HESABI acarken tikandi -
// Spotify'a gecildi, onun gelistirici paneli (sadece isim+redirect URI,
// onay/captcha yok) cok daha az surtunmeli. Apple BILEREK yok - Apple
// Developer Program yillik ucretli uyelik gerektiriyor ($99), uygulama
// gercekten yayina alinirken eklenecek. Telegram da BILEREK yok -
// Supabase'in listesinde Telegram diye bir OAuth saglayicisi YOK (Telegram
// kendi "Login Widget" mekanizmasini kullanir, standart OAuth2 degil, ayri
// bir backend entegrasyonu gerektirir). Apple'in bosluguna Twitch kondu -
// zaten "+" menusunde bir platform olarak var (tutarli), kurulumu basit.
type Provider = "google" | "spotify" | "facebook" | "twitter" | "twitch";

// Logo kenar golgesi icin 8 yonlu kucuk kaydirma (bkz. asagidaki render) -
// capraz olanlar biraz daha az kaydirilir (koseler "sivri" durmasin diye).
const EDGE_SHADOW_OFFSETS: [number, number][] = [
  [0, -3],
  [0, 3],
  [-3, 0],
  [3, 0],
  [-2, -2],
  [2, -2],
  [-2, 2],
  [2, 2],
];

export default function LoginScreen() {
  const [loadingProvider, setLoadingProvider] = useState<Provider | null>(null);
  // Slogan icin ozel bir yazi tipi (Bebas Neue - sik, dar/condensed buyuk
  // harf karakteri) - yuklenene kadar sistem fontuyla gosteriyoruz (kisa bir
  // tek satirlik slogan oldugu icin yukleme anindaki "atlama" neredeyse
  // fark edilmiyor).
  const [fontsLoaded] = useFonts({ BebasNeue_400Regular });

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
      <View style={styles.logoWrap}>
        {/* Kenar golgesi: TEK yonde kaydirilmis bir kopya "arkada duran ikinci
            bir sekil" gibi gorunuyordu (bkz. onceki surum) - bunun yerine
            logonun ETRAFINI saran, her yone (yukari/asagi/sag/sol/capraz)
            kucuk mesafede kaydirilmis COK sayida sonuk kopya kullanilir -
            her biri ayri ayri gorunmez ama ust uste binince harf
            kenarlarinin TUMUNDE yumusak bir golge/hale olusturur (gercek
            blur filtresi olmadan, iOS/Android'de ayni sekilde calisan tek
            yontem). Ana (beyaz) logo EN USTTE render ediliyor. */}
        {EDGE_SHADOW_OFFSETS.map(([dx, dy], i) => (
          <Image
            key={i}
            source={require("../../assets/lavin-icon-mark.png")}
            style={[styles.logoMark, styles.logoShadow, { top: 3 + dy, left: 3 + dx }]}
            resizeMode="contain"
          />
        ))}
        <Image source={require("../../assets/lavin-icon-mark.png")} style={styles.logoMark} resizeMode="contain" />
      </View>

      <Text style={[styles.tagline, fontsLoaded && styles.taglineFontLoaded]}>
        BİRLİKTE İZLEMENİN EN GÜZEL HALİ
      </Text>

      <View style={styles.providerRow}>
        <TouchableOpacity
          style={styles.providerButton}
          onPress={() => signInWithProvider("google")}
          disabled={loadingProvider !== null}
        >
          <View style={[styles.providerIconBox, styles.googleIconBox]}>
            {loadingProvider === "google" ? <ActivityIndicator color="#1C1C1E" /> : <GoogleIcon size={32} />}
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.providerButton}
          onPress={() => signInWithProvider("twitch")}
          disabled={loadingProvider !== null}
        >
          <View style={[styles.providerIconBox, styles.twitchIconBox]}>
            {loadingProvider === "twitch" ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <FontAwesome5 name="twitch" size={30} color="#FFFFFF" />
            )}
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.providerButton}
          onPress={() => signInWithProvider("spotify")}
          disabled={loadingProvider !== null}
        >
          <View style={[styles.providerIconBox, styles.spotifyIconBox]}>
            {loadingProvider === "spotify" ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <FontAwesome5 name="spotify" size={34} color="#FFFFFF" />
            )}
          </View>
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
              <FontAwesome5 name="facebook-f" size={32} color="#FFFFFF" />
            )}
          </View>
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
              <FontAwesome6 name="x-twitter" size={32} color="#FFFFFF" />
            )}
          </View>
        </TouchableOpacity>
      </View>

      <Text style={styles.termsText}>
        Devam ederek Hizmet Koşulları'nı ve Gizlilik Politikası'nı kabul etmiş olursunuz.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // Artik App.tsx'teki paylasilan AppBackground (degrade) arkada duruyor.
  container: { flex: 1, backgroundColor: "transparent", padding: 24, justifyContent: "center" },
  // logoShadow kopyalari logoMark'tan en fazla 3px tasabiliyor - golge
  // View'in disina kirpilmasin diye wrap, logodan biraz daha genis/yuksek.
  // marginTop negatif: "logoyu hafif yukari al" - butun grup (logo+row+alt
  // yazi) dikeyde ortalandigi icin (container: justifyContent "center")
  // sadece logoWrap'e negatif ust bosluk vermek grubu YUKARI kaydiriyor.
  logoWrap: { width: 286, height: 137, alignSelf: "center", marginTop: -24, marginBottom: -8 },
  // Logo artik beyaz siluet - tintColor, PNG'nin seffaf olmayan tum
  // piksellerini bu renge boyar (bkz. MediaPickerSheet.tsx topBarLogo
  // AYNI teknik). 220x103 -> 280x131 (ayni oran) buyutuldu.
  logoMark: { position: "absolute", top: 3, left: 3, width: 280, height: 131, tintColor: "#FFFFFF" },
  // Golge katmani: koyu lacivert tonu (arka plan degradesiyle uyumlu, saf
  // siyah degil) - her kopya cok dusuk opaklikta (0.14), 8 tanesi UST USTE
  // binince harf kenarlarinin TUMUNDE yumusak bir golge/hale olusturur
  // (top/left JSX'te EDGE_SHADOW_OFFSETS'ten geliyor, logoMark'in 3,3'luk
  // taban konumuna GORECELI).
  logoShadow: { tintColor: "#030508", opacity: 0.14 },
  // Logo artik kendi basligini tasimiyor (eskiden "Devam etmek icin giris
  // yap" vardi, kaldirildi) - yerine marka sloganini koyuyoruz. Genislik
  // 280 - logoMark'in GERCEK genisligiyle (ve logonun L...A harf araliginin
  // tam kendisiyle, bkz. kaynak PNG'nin bbox analizi - harfler PNG'nin tam
  // kenarina kadar uzaniyor, bosluksuz) BIREBIR ayni, alignSelf "center" ile
  // logoWrap'le AYNI eksende ortalaniyor - boylece metin L'nin hizasinda
  // baslayip A'nin hizasinda bitiyor (letterSpacing bu genisligi doldurmak
  // icin ayarlandi).
  // Sabit bir "width: 280" ONCEDEN vardi ama bu, metni kutunun icinde
  // ORTALIYORDU - metnin KENDI genisligi 280'den kucuk kaldigi surece
  // (logoyla ayni genislikte GORUNMUYORDU, sadece ayni kutuda ortalaniyordu).
  // Simdi sabit genislik YOK - fontSize/letterSpacing dogrudan logo
  // genisligine (280) ulasacak sekilde olculup ayarlandi (bkz. asagisi).
  tagline: {
    alignSelf: "center",
    color: "rgba(255,255,255,0.75)",
    fontSize: 15,
    fontWeight: "500",
    letterSpacing: 1,
    textAlign: "center",
    marginTop: 14,
  },
  // Bebas Neue (condensed/buyuk harf) yuklenince harf araligi ve boyut
  // bu fonta GORE yeniden ayarlanir. 280 CSS piksellik logo genisligine
  // (ekran goruntusu uzerinde piksel olculerek) eslesecek sekilde
  // fontSize/letterSpacing ayarlandi.
  taglineFontLoaded: {
    fontFamily: "BebasNeue_400Regular",
    fontWeight: "400",
    fontSize: 13,
    letterSpacing: 1.1,
  },
  // Paylas ekranindaki ("Uygulamayla paylaş" satiri, bkz. ShareRoomContent.tsx
  // appButton/appIconCircle) AYNI kare ikon kalibi (squircle) - isimler
  // kaldirildi, artik sadece ikon kutulari var. Bes buton TEK satira sigsin
  // diye 64/kose 18'den biraz kucuk tutuldu: 62/kose 18, columnGap 10.
  providerRow: { flexDirection: "row", justifyContent: "center", columnGap: 16, marginTop: 220 },
  providerButton: { alignItems: "center", width: 62 },
  providerIconBox: { width: 62, height: 62, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  googleIconBox: { backgroundColor: "#FFFFFF" },
  twitchIconBox: { backgroundColor: "#9146FF" },
  spotifyIconBox: { backgroundColor: "#1DB954" },
  facebookIconBox: { backgroundColor: "#1877F2" },
  // X'in marka rengi saf siyah - Apple ile aynı sebeple (koyu arka planda
  // ayirt edilsin diye) ince beyaz cerceve (bkz. ShareRoomContent.tsx
  // appIconBlack AYNI kural).
  xIconBox: { backgroundColor: "#000000", borderWidth: 1, borderColor: "rgba(255,255,255,0.18)" },
  // SafeAreaProvider YOK bu dalda (bkz. App.tsx - sadece oturum acildiktan
  // sonraki ana dal SafeAreaProvider'a sarili), bu yuzden sabit bir alt
  // bosluk (useSafeAreaInsets degil) - ekranin en altina, logo/butonlardan
  // BAGIMSIZ sabit konumda.
  termsText: {
    position: "absolute",
    left: 24,
    right: 24,
    bottom: 32,
    color: theme.textMuted,
    fontSize: 12,
    textAlign: "center",
    lineHeight: 17,
  },
});
