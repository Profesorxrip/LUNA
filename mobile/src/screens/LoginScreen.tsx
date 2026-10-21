import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import * as WebBrowser from "expo-web-browser";
import { useFonts, BebasNeue_400Regular } from "@expo-google-fonts/bebas-neue";
import { useTranslation } from "react-i18next";
import FontAwesome5 from "@expo/vector-icons/FontAwesome5";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import { supabase } from "../services/supabase";
import { showAlert } from "../components/CustomAlert";
import { theme } from "../theme";
import { GoogleIcon } from "../components/SocialAuthIcons";
import { LANGUAGES, setAppLanguage, LanguageCode } from "../i18n";
import LunaLogo from "../components/LunaLogo";
import TermsScreen from "./TermsScreen";
import PrivacyScreen from "./PrivacyScreen";

// Giris ekrani App.tsx'te NavigationContainer'in DISINDA render ediliyor
// (oturum acilmadan once) - yani normal "navigation.navigate('Privacy')"
// burada KULLANILAMAZ. Bunun yerine Terms/Privacy ekranlarini (ikisi de
// navigasyona bagli olmayan SADE sunum bilesenleri) dogrudan bir Modal
// icinde aciyoruz - ayri bir route/navigasyon kurulumuna gerek kalmadan.
type InfoModal = "terms" | "privacy" | null;

// E-posta girisi sifresiz: kullanici sadece e-postasini yazar, Supabase ona
// bir dogrulama kodu mail atar (sifre YOK, "magic link" de YOK - mobil
// uygulamada derin linke guvenmek yerine kod girmek cok daha guvenilir).
// Kodun uzunlugu Supabase proje ayarina gore degisebilir (varsayilan
// sablonla 8 hane gelebiliyor) - bu yuzden kod kutusu SABIT 6 haneye
// kilitli DEGIL. "closed" -> sadece "E-posta ile devam et" linki gorunur,
// "enter-email" -> e-posta kutusu, "enter-code" -> dogrulama kodu kutusu.
type EmailStep = "closed" | "enter-email" | "enter-code";

// app.json'daki "scheme": "luna" ile eslesiyor - Supabase, OAuth sonrasi
// kullaniciyi tarayicidan buraya (uygulamanin kendisine) geri yonlendirir.
const REDIRECT_URL = "luna://login-callback";

// Supabase'in Provider turundeki GERCEK anahtarlar - X icin IKI AYRI
// anahtar var: "twitter" (eski, OAuth 1.0a, KULLANILMAMALI) ve "x" (yeni,
// OAuth 2.0 - Supabase panelinde "X / Twitter (OAuth 2.0)" olarak etkin-
// lestirdigimiz budur). Onceden yanlislikla "twitter" kullaniliyordu,
// duzeltildi. Discord (hesap acma captcha sorunu) ve Microsoft/Azure
// (kurulumda baska bir engel) SIRAYLA denendi, ikisi de kullanicinin OWN
// DEVELOPER HESABI acarken tikandi - Spotify'a gecildi, onun gelistirici
// paneli (sadece isim+redirect URI, onay/captcha yok) cok daha az
// surtunmeli. Apple BILEREK yok - Apple Developer Program yillik ucretli
// uyelik gerektiriyor ($99), uygulama gercekten yayina alinirken
// eklenecek. Telegram da BILEREK yok - Supabase'in listesinde Telegram
// diye bir OAuth saglayicisi YOK (Telegram kendi "Login Widget"
// mekanizmasini kullanir, standart OAuth2 degil, ayri bir backend
// entegrasyonu gerektirir). Apple'in bosluguna Twitch kondu - zaten "+"
// menusunde bir platform olarak var (tutarli), kurulumu basit. Facebook'un
// bosluguna GitHub kondu - Facebook kurulumu "alisilmadik cihaz" guvenlik
// kilidine takildi (Meta tarafinda, bizim kodumuzla alakasiz), GitHub'in
// kaydi cok daha az surtunmeli (isim+callback URL, onay/captcha yok).
type Provider = "google" | "spotify" | "github" | "x" | "twitch";

export default function LoginScreen() {
  const [loadingProvider, setLoadingProvider] = useState<Provider | null>(null);
  // Slogan icin ozel bir yazi tipi (Bebas Neue - sik, dar/condensed buyuk
  // harf karakteri) - yuklenene kadar sistem fontuyla gosteriyoruz (kisa bir
  // tek satirlik slogan oldugu icin yukleme anindaki "atlama" neredeyse
  // fark edilmiyor).
  const [fontsLoaded] = useFonts({ BebasNeue_400Regular });
  const [infoModal, setInfoModal] = useState<InfoModal>(null);
  const { t, i18n } = useTranslation();
  const [languageSheetVisible, setLanguageSheetVisible] = useState(false);
  const currentLanguageCode = i18n.language.toUpperCase();

  const [emailStep, setEmailStep] = useState<EmailStep>("closed");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [emailLoading, setEmailLoading] = useState(false);

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
      showAlert(t("login.signInFailedTitle"), error?.message || t("login.signInFailedBody"));
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
      showAlert(t("login.signInFailedTitle"), t("login.sessionFailedBody"));
      return;
    }
    await supabase.auth.setSession({ access_token, refresh_token });
    // Basarili giristen sonra App.tsx'teki onAuthStateChange dinleyicisi
    // otomatik olarak kullaniciyi ana ekrana yonlendirecek.
  }

  // Supabase'e "bu e-postaya 6 haneli bir kod gonder" der - hesap yoksa
  // shouldCreateUser ile otomatik olusturulur (ayri bir "kayit ol" akisina
  // gerek yok, tek akis hem giris hem kayit).
  async function sendEmailCode() {
    const trimmed = email.trim();
    if (!trimmed) {
      showAlert(t("login.emailRequiredTitle"), t("login.emailRequiredBody"));
      return;
    }
    setEmailLoading(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: { shouldCreateUser: true },
    });
    setEmailLoading(false);
    if (error) {
      showAlert(t("login.sendFailedTitle"), error.message);
      return;
    }
    setEmailStep("enter-code");
  }

  // Kullanicinin mailine gelen kodu Supabase'e dogrulatir - basarili olursa
  // Supabase client oturumu kendisi kurar, App.tsx'teki onAuthStateChange
  // otomatik olarak ana ekrana gecirir (OAuth akisiyla AYNI sekilde).
  async function verifyEmailCode() {
    const trimmed = code.trim();
    if (!trimmed) {
      showAlert(t("login.codeRequiredTitle"), t("login.codeRequiredBody"));
      return;
    }
    setEmailLoading(true);
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: trimmed,
      type: "email",
    });
    setEmailLoading(false);
    if (error) {
      showAlert(t("login.verifyFailedTitle"), error.message);
      return;
    }
  }

  function handleSelectLanguage(langCode: LanguageCode) {
    setAppLanguage(langCode);
    setLanguageSheetVisible(false);
  }

  return (
    <View style={styles.outer}>
      <TouchableOpacity
        style={styles.languageButton}
        onPress={() => setLanguageSheetVisible(true)}
        hitSlop={8}
      >
        <FontAwesome5 name="globe" size={14} color="#FFFFFF" />
        <Text style={styles.languageButtonText}>{currentLanguageCode}</Text>
      </TouchableOpacity>

      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
      <LunaLogo width={280} style={styles.logoWrap} />

      <Text style={[styles.tagline, fontsLoaded && styles.taglineFontLoaded]}>
        {t("login.tagline")}
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
          onPress={() => signInWithProvider("github")}
          disabled={loadingProvider !== null}
        >
          <View style={[styles.providerIconBox, styles.githubIconBox]}>
            {loadingProvider === "github" ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <FontAwesome5 name="github" size={32} color="#FFFFFF" />
            )}
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.providerButton}
          onPress={() => signInWithProvider("x")}
          disabled={loadingProvider !== null}
        >
          <View style={[styles.providerIconBox, styles.xIconBox]}>
            {loadingProvider === "x" ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <FontAwesome6 name="x-twitter" size={32} color="#FFFFFF" />
            )}
          </View>
        </TouchableOpacity>
      </View>

      <View style={styles.emailSection}>
        {emailStep === "closed" && (
          <TouchableOpacity onPress={() => setEmailStep("enter-email")} hitSlop={8}>
            <Text style={styles.emailToggleText}>{t("login.orEmail")}</Text>
          </TouchableOpacity>
        )}

        {emailStep === "enter-email" && (
          <View style={styles.emailRow}>
            <TextInput
              style={styles.emailInput}
              value={email}
              onChangeText={setEmail}
              placeholder={t("login.emailPlaceholder")}
              placeholderTextColor="rgba(255,255,255,0.4)"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!emailLoading}
            />
            <TouchableOpacity style={styles.emailButton} onPress={sendEmailCode} disabled={emailLoading}>
              {emailLoading ? (
                <ActivityIndicator color="#1C1C1E" />
              ) : (
                <Text style={styles.emailButtonText}>{t("login.sendCode")}</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {emailStep === "enter-code" && (
          <>
            <Text style={styles.emailHint}>{t("login.enterCodeHint", { email })}</Text>
            <View style={styles.emailRow}>
              <TextInput
                style={styles.emailInput}
                value={code}
                onChangeText={setCode}
                placeholder={t("login.codePlaceholder")}
                placeholderTextColor="rgba(255,255,255,0.4)"
                keyboardType="number-pad"
                maxLength={10}
                editable={!emailLoading}
              />
              <TouchableOpacity style={styles.emailButton} onPress={verifyEmailCode} disabled={emailLoading}>
                {emailLoading ? (
                  <ActivityIndicator color="#1C1C1E" />
                ) : (
                  <Text style={styles.emailButtonText}>{t("login.verify")}</Text>
                )}
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              onPress={() => {
                setEmailStep("enter-email");
                setCode("");
              }}
              hitSlop={8}
              style={styles.switchEmailButton}
            >
              <Text style={styles.emailToggleText}>{t("login.useOtherEmail")}</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
      </KeyboardAvoidingView>

      {/* Klavye acildiginda KeyboardAvoidingView icerigi yukari kaydiriyor -
          bu metin o View'in disinda tutuluyor ki klavyeyle birlikte
          yukari kayip ustteki icerigin uzerine binmesin, hep ekranin en
          altinda sabit kalsin. */}
      <Text style={styles.termsText}>
        {t("login.termsPrefix")}{" "}
        <Text style={styles.termsLink} onPress={() => setInfoModal("terms")}>
          {t("login.termsLink")}
        </Text>{" "}
        {t("login.and")}{" "}
        <Text style={styles.termsLink} onPress={() => setInfoModal("privacy")}>
          {t("login.privacyLink")}
        </Text>{" "}
        {t("login.termsSuffix")}
      </Text>

      <Modal
        visible={infoModal !== null}
        animationType="slide"
        onRequestClose={() => setInfoModal(null)}
      >
        {infoModal === "terms" ? <TermsScreen /> : <PrivacyScreen />}
        <TouchableOpacity style={styles.infoModalClose} onPress={() => setInfoModal(null)} hitSlop={10}>
          <Text style={styles.infoModalCloseText}>✕</Text>
        </TouchableOpacity>
      </Modal>

      <Modal
        visible={languageSheetVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setLanguageSheetVisible(false)}
        statusBarTranslucent
      >
        <TouchableOpacity
          style={styles.languageOverlay}
          activeOpacity={1}
          onPress={() => setLanguageSheetVisible(false)}
        >
          <TouchableOpacity activeOpacity={1} style={styles.languageSheet}>
            {LANGUAGES.map((lang) => (
              <TouchableOpacity
                key={lang.code}
                style={styles.languageRow}
                onPress={() => handleSelectLanguage(lang.code)}
              >
                <Text
                  style={[
                    styles.languageRowText,
                    lang.code === i18n.language && styles.languageRowTextActive,
                  ]}
                >
                  {lang.label}
                </Text>
                {lang.code === i18n.language && <FontAwesome5 name="check" size={14} color="#0EA5E9" />}
              </TouchableOpacity>
            ))}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  // Artik App.tsx'teki paylasilan AppBackground (degrade) arkada duruyor.
  // outer: termsText ve Modal'in de icinde durdugu DIS sarmalayici - sabit
  // (klavye acilsa da boyutu degismiyor). container ise SADECE klavye
  // acilinca yukari kaymasi gereken kisim (logo/butonlar/email formu).
  outer: { flex: 1, backgroundColor: "transparent" },
  container: { flex: 1, padding: 24, justifyContent: "center" },
  // Dil secici: sag ust kose, infoModalClose ile AYNI olcek/konum mantigi
  // (top:54 - SafeAreaProvider bu dalda yok, bu yuzden sabit bir deger).
  languageButton: {
    position: "absolute",
    top: 54,
    right: 20,
    flexDirection: "row",
    alignItems: "center",
    columnGap: 6,
    paddingHorizontal: 12,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(255,255,255,0.12)",
    zIndex: 10,
  },
  languageButtonText: { color: "#FFFFFF", fontSize: 13, fontWeight: "700" },
  languageOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", padding: 32 },
  languageSheet: { backgroundColor: "#15202B", borderRadius: 18, paddingVertical: 8, maxHeight: 420 },
  languageRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  languageRowText: { color: "rgba(255,255,255,0.8)", fontSize: 15 },
  languageRowTextActive: { color: "#FFFFFF", fontWeight: "700" },
  // marginTop negatif: "logoyu hafif yukari al" - butun grup (logo+row+alt
  // yazi) dikeyde ortalandigi icin (container: justifyContent "center")
  // sadece logoWrap'e negatif ust bosluk vermek grubu YUKARI kaydiriyor.
  // Genislik/yukseklik artik LunaLogo'nun kendi icinde (bkz. components/LunaLogo.tsx).
  logoWrap: { alignSelf: "center", marginTop: -24, marginBottom: -8 },
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
  // Sosyal butonlarin altinda, alt metinden once: once sadece tek satirlik
  // "veya e-posta ile devam et" linki gorunur, tiklaninca YERINDE (ayri bir
  // ekran/modal ACILMADAN) e-posta kutusuna donusur - kod adimi da ayni
  // sekilde yerinde degisir.
  emailSection: { marginTop: 24, alignItems: "center", paddingHorizontal: 8 },
  emailToggleText: { color: "rgba(255,255,255,0.6)", fontSize: 13, textDecorationLine: "underline" },
  switchEmailButton: { marginTop: 14 },
  emailHint: { color: "rgba(255,255,255,0.6)", fontSize: 12, marginBottom: 10, textAlign: "center" },
  emailRow: { flexDirection: "row", width: "100%", columnGap: 8 },
  emailInput: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    paddingHorizontal: 14,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    color: "#FFFFFF",
    fontSize: 15,
  },
  emailButton: {
    height: 46,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  emailButtonText: { color: "#1C1C1E", fontSize: 14, fontWeight: "700" },
  providerButton: { alignItems: "center", width: 62 },
  providerIconBox: { width: 62, height: 62, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  googleIconBox: { backgroundColor: "#FFFFFF" },
  twitchIconBox: { backgroundColor: "#9146FF" },
  spotifyIconBox: { backgroundColor: "#1DB954" },
  // GitHub ve X'in marka rengi saf siyah - koyu arka planda ayirt edilsin
  // diye ince beyaz cerceve (bkz. ShareRoomContent.tsx appIconBlack AYNI
  // kural).
  githubIconBox: { backgroundColor: "#181717", borderWidth: 1, borderColor: "rgba(255,255,255,0.18)" },
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
  // Tiklanabilir oldugunu belli etsin diye alttaki duz metinden daha acik
  // ve alti cizili - RN'de bir paragraf icinde sadece BAZI kelimelerin
  // tiklanabilir olmasi boyle, ic ice <Text onPress> ile yapilir.
  termsLink: { color: theme.text, textDecorationLine: "underline" },
  // InfoScreen (Terms/Privacy) kendi geri butonu/basligi tasimiyor (normalde
  // navigasyon yiginindan native geri ile kapanmasi bekleniyor) - burada bir
  // Modal icinde actigimiz icin kendi kapatma butonumuzu ustune biniyoruz.
  infoModalClose: {
    position: "absolute",
    top: 54,
    right: 20,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  infoModalCloseText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
});
