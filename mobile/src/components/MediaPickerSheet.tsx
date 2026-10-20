import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Image, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import { ChevronLeft } from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import { getSocket, HistoryItem, SourceType } from "../services/socket";
import type { MediaSource } from "../services/socket";
import { supabase } from "../services/supabase";
import { theme } from "../theme";
import { EXTERNAL_PLATFORMS, fetchWebPageTitle } from "../utils/media";
import { extractYouTubeId, fetchYouTubeMeta } from "../utils/youtube";
import PlatformLogo from "./PlatformLogo";
import Icon from "./Icon";
import { showAlert } from "./CustomAlert";

interface Props {
  visible: boolean;
  onClose: () => void;
  onSelect: (source: MediaSource) => void;
  /** Video dogal olarak bitip oylama acildiginda platform secme ekranini
   * (Netflix/Disney+ logo listesi) hic GOSTERMEDEN dogrudan "yakin/alakali
   * videolar" gorunumune (gercek YouTube'un kendi ilgili video onerileri)
   * gecmek icin - Rave'deki gibi. Bittigi anda gosterilecek videonun
   * YouTube id'si biliniyorsa oradan devam edilir, bilinmiyorsa (harici bir
   * platformdaysak) genel YouTube ana sayfasindan basliyoruz. Kullanici
   * yine de "‹ Geri" ile normal platform listesine donebilir. */
  relatedVideosFor?: string | null;
}

type Mode = "grid" | "youtube" | "weburl" | "history" | "liked" | "external";

// Netflix/Disney+/Prime/HBO Max gibi DRM'li sitelerin bot/cihaz korumasi
// varsayilan WebView kimligini reddedebiliyor - masaustu Chrome gibi
// gorunmek bu ilk engeli asma ihtimalini artirir (bkz. DrmWebViewPlayer.tsx
// AYNI User-Agent, orada da ayni sebeple var).
const DESKTOP_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

// DRM'li platformlarda GERCEK bir <video> etiketi belirene kadar (host
// GERCEKTEN bir seyi oynatmaya baslayana kadar) secim sayilmiyor - bu
// sayede YouTube'daki gibi, host odaya girmeden ONCE TEK BASINA gezinip
// izleyecegi seyi bulabiliyor; gezinme/cerez onay ekranlari ODAYA HIC
// YANSIMIYOR. URL kalibina (orn. "/watch/") GUVENMIYORUZ - her platformun
// kendi, degisebilen bir deseni var, ama hepsi oynatirken GERCEK bir
// <video> etiketi olusturur, bu yuzden platform-bagimsiz ve guvenilir.
const EXTERNAL_VIDEO_DETECT_JS = `
(function () {
  if (window.__lunaVideoDetect) return;
  window.__lunaVideoDetect = true;
  function check() {
    if (document.querySelector('video')) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'videoDetected' }));
      return true;
    }
    return false;
  }
  if (!check()) {
    var obs = new MutationObserver(function () { if (check()) obs.disconnect(); });
    obs.observe(document.documentElement, { childList: true, subtree: true });
  }
  true;
})();
`;

interface GridItem {
  key: string;
  label: string;
  logo: (typeof EXTERNAL_PLATFORMS)[number]["logo"] | "youtube" | "web";
}

const externalItems: GridItem[] = EXTERNAL_PLATFORMS.map((p) => ({ key: p.key, label: p.label, logo: p.logo }));
function ext(key: string): GridItem {
  return externalItems.find((i) => i.key === key)!;
}
// Prime ve Disney+ BILINCLI olarak ayni satirda yan yana - ikisinin de
// yazi govdesi gercekten AYNI HIZADA gorunsun diye kendi gorsellerine
// asimetrik dolgu eklendi (bkz. PlatformLogo.tsx).
const ALL_ITEMS: GridItem[] = [
  { key: "youtube", label: "YouTube", logo: "youtube" },
  ext("netflix"),
  ext("hbomax"),
  ext("twitch"),
  ext("drive"),
  ext("icloud"),
  ext("spotify"),
  { key: "web", label: "Web", logo: "web" },
  ext("prime"),
  ext("disney"),
  { key: "history", label: "Geçmiş", logo: "gecmis" },
  { key: "liked", label: "Beğenilenler", logo: "begenilenler" },
  // X icin ayri bir kart YOK - zaten "Web" ile x.com linki yapistirilinca
  // ayni sekilde acilabiliyor (EXTERNAL_PLATFORMS'ta "x" hala duruyor, o
  // sayede Web'den girilen bir X linki de dogru rozet/logo ile eslesiyor,
  // bkz. RoomCard.tsx/RoomPreviewScreen.tsx domain eslestirme).
];

/** Rave'in gercek "ne izlemek istersin" ekranina benzer TAM SAYFA ekran -
 * degrade arka plan + ust arama cubugu + 2 sutunlu marka logosu listesi.
 * Link yapistirma YOK - YouTube secildiginde uygulama icinde GERCEK YouTube
 * gezinilir (WebView), host normal sekilde bir videoya dokunur dokunmaz o
 * videonun basligi otomatik cekilip odanin/kartin ismi olur. Netflix/Prime/
 * Disney+/HBO Max/Twitch gibi DRM'li platformlarda da AYNI mantik: platforma
 * dokununca host odaya HENUZ girmeden, TEK BASINA (kimse gormeden) o
 * platformun GERCEK sitesinde gezinir - cerez onayi/arama/menu gezintisi
 * odaya hic yansimaz. Host GERCEKTEN bir seyi oynatmaya baslayip bir <video>
 * etiketi belirince (bkz. EXTERNAL_VIDEO_DETECT_JS - URL kalibina degil,
 * platform-bagimsiz bu sinyale guveniyoruz) o anki sayfa host'un "secimi"
 * sayilir, oda o noktadan acilir ve SENKRON (play/pause/saniye) oradan
 * itibaren kurulur (bkz. DrmWebViewPlayer.tsx). Isim/kapak sorma adimi hala
 * YOK - DRM'li platformlarda video basligini uygulama icinden GOREMEDIGIMIZ
 * icin (bkz. MediaPlayer.tsx aciklamasi) oda/kart ismi platformun kendi adi
 * olarak kalir. */
export default function MediaPickerSheet({ visible, onClose, onSelect, relatedVideosFor }: Props) {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<Mode>("grid");
  const [search, setSearch] = useState("");
  const [webUrlInput, setWebUrlInput] = useState("");
  const [loadingTitle, setLoadingTitle] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const detectedVideoRef = useRef<string | null>(null);
  // Secilen DRM'li platform (Netflix/Disney+ vb.) - "external" modunda
  // gezinme WebView'inin hangi adresten baslayacagini ve secim aninda
  // hangi isimle oda acilacagini belirler.
  const [externalPlatform, setExternalPlatform] = useState<{ label: string; url: string } | null>(null);
  // "external" modundaki WebView'in O ANKI adresi - video algilaninca
  // (EXTERNAL_VIDEO_DETECT_JS) secim olarak bu adres kullanilir, platformun
  // genel ana sayfasi degil (host navigasyonunu TAKIP eder).
  const externalCurrentUrlRef = useRef<string | null>(null);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);
  const [likedItems, setLikedItems] = useState<HistoryItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMyUserId(data.user?.id ?? null));
  }, []);

  useEffect(() => {
    if (visible && relatedVideosFor !== undefined) {
      setMode("youtube");
      // WebView ilk acilista biten videonun izleme sayfasina gidiyor - bu
      // ilk navigasyonu "secim" sanip hemen ayni videoyu tekrar
      // oylamasin diye zaten "gorulmus" sayiyoruz, sadece GERCEKTEN
      // BASKA bir ilgili videoya dokunulursa secim sayilacak.
      detectedVideoRef.current = relatedVideosFor;
    }
  }, [visible, relatedVideosFor]);

  const visibleItems = useMemo(
    () => ALL_ITEMS.filter((i) => i.label.toLowerCase().includes(search.trim().toLowerCase())),
    [search]
  );

  function reset() {
    setMode("grid");
    setSearch("");
    setWebUrlInput("");
    setLoadingTitle(false);
    setError(null);
    detectedVideoRef.current = null;
    setExternalPlatform(null);
    externalCurrentUrlRef.current = null;
  }

  function handleClose() {
    reset();
    onClose();
  }

  function handleBack() {
    setError(null);
    detectedVideoRef.current = null;
    setExternalPlatform(null);
    externalCurrentUrlRef.current = null;
    setMode("grid");
  }

  // DRM'li platformun (Netflix/Disney+ vb.) gezinme WebView'inde GERCEK bir
  // <video> etiketi belirince (bkz. EXTERNAL_VIDEO_DETECT_JS) cagrilir - o an
  // host'un durdugu sayfa (externalCurrentUrlRef, platformun genel ana
  // sayfasi DEGIL) secim olarak kullanilir.
  function handleExternalVideoDetected() {
    if (!externalPlatform) return;
    const url = externalCurrentUrlRef.current || externalPlatform.url;
    onSelect({ type: "external", url, label: externalPlatform.label });
    handleClose();
  }

  // YouTube gezinme WebView'i her URL degisiminde bunu cagirir - "izle"
  // sayfasina gelindigi an (host gercekten bir videoya dokundugunda) video
  // ID'sini yakalayip basligini otomatik ceker, host'un link yapistirmasina
  // ya da isim yazmasina hic gerek kalmaz.
  async function handleYouTubeNavigation(url: string) {
    if (loadingTitle) return;
    const videoId = extractYouTubeId(url);
    if (!videoId || videoId === detectedVideoRef.current) return;
    detectedVideoRef.current = videoId;
    setLoadingTitle(true);
    const meta = await fetchYouTubeMeta(videoId);
    setLoadingTitle(false);
    onSelect({ type: "youtube", url: videoId, label: meta.title || "YouTube Videosu", channelName: meta.channelName || undefined });
    handleClose();
  }

  // Platforma dokununca YouTube'daki gibi ONCE uygulama ICINDE (odaya
  // girmeden) o platformun GERCEK sitesinde gezinilir - isim/kapak sormadan
  // oda ancak host GERCEKTEN bir seyi oynatmaya baslayinca acilir (bkz.
  // handleExternalVideoDetected), oda/kart adi platformun kendi adi olarak
  // kalir (DRM'li platformlarda uygulama icinden gercek video basligini
  // goremedigimiz icin).
  function selectItem(key: string) {
    if (key === "youtube") {
      setMode("youtube");
      return;
    }
    if (key === "web") {
      setMode("weburl");
      return;
    }
    if (key === "history" || key === "liked") {
      setMode(key);
      loadHistory(key);
      return;
    }
    const platform = EXTERNAL_PLATFORMS.find((p) => p.key === key);
    if (!platform) return;
    externalCurrentUrlRef.current = platform.url;
    setExternalPlatform(platform);
    setMode("external");
  }

  // "Geçmiş"/"Beğenilenler" karti acilinca kendi gecmisimizi/begenilerimizi
  // ceker - UserProfileScreen'deki ayni isimli sekmelerle AYNI veri kaynagi
  // (user:roomHistory/user:likedHistory), burada sadece secilip AYNI videoyla
  // yeni bir oda acmak icin kullaniliyor.
  function loadHistory(kind: "history" | "liked") {
    if (!myUserId) return;
    setLoadingHistory(true);
    const event = kind === "history" ? "user:roomHistory" : "user:likedHistory";
    getSocket().emit(event, { userId: myUserId }, (res: any) => {
      setLoadingHistory(false);
      if (!res?.ok) return;
      if (kind === "history") setHistoryItems(res.history);
      else setLikedItems(res.history);
    });
  }

  function selectHistoryItem(item: HistoryItem) {
    if (!item.mediaUrl || !item.mediaType) {
      showAlert("Açılamadı", "Bu video artık açılamıyor.");
      return;
    }
    onSelect({
      type: item.mediaType as SourceType,
      url: item.mediaUrl,
      label: item.mediaLabel,
      coverUrl: item.mediaCoverUrl || undefined,
    });
    handleClose();
  }

  async function handleWebUrlSubmit() {
    const trimmed = webUrlInput.trim();
    if (!trimmed) {
      setError("Bir web sitesi linki yaz.");
      return;
    }
    const normalized = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const domainLabel = normalized.replace(/^https?:\/\//i, "").replace(/^www\./i, "").split("/")[0];
    // Dogrudan bir video dosyasi linkiyse (.mp4/.m3u8) DRM'li bir platform
    // degil, kendi oynaticimizda (HlsPlayer) gercek senkronla oynatilabilir -
    // bunlarda sayfa/baslik kavrami yok (ham video verisi), alan adi kaliyor.
    const pathname = normalized.replace(/[?#].*$/, "");
    if (/\.m3u8$/i.test(pathname)) {
      onSelect({ type: "hls", url: normalized, label: domainLabel });
      handleClose();
      return;
    }
    if (/\.mp4$/i.test(pathname)) {
      onSelect({ type: "mp4", url: normalized, label: domainLabel });
      handleClose();
      return;
    }
    // Genel sayfa linki ("external") - oda/kart ismi icin sayfanin GERCEK
    // basligini (og:title) cekmeyi deniyoruz, basarisiz olursa alan adi
    // yedek olarak kullanilir (bkz. fetchWebPageTitle).
    setLoadingTitle(true);
    const realTitle = await fetchWebPageTitle(normalized);
    setLoadingTitle(false);
    onSelect({ type: "external", url: normalized, label: realTitle || domainLabel });
    handleClose();
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleClose} statusBarTranslucent>
      <View style={[styles.screen, { paddingTop: insets.top + 16 }]}>
        {/* Grid (ana platform listesi) ekraninda da ayni ustbar - geri
            okuna basinca grid'den bir ALT ekrandaysak (youtube/weburl/
            history/liked) grid'e, grid'in KENDISINDEYSEK sheet'i kapatiyor
            (artik "ARA" cubugunun solunda kapatma icin TEK dokunulacak yer
            buydu, oncesinde hicbir ikon yoktu). */}
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.backButton} onPress={mode === "grid" ? handleClose : handleBack} hitSlop={10}>
            <ChevronLeft size={28} color="#FFFFFF" strokeWidth={3} />
          </TouchableOpacity>
          <Image source={require("../../assets/lavin-icon-mark.png")} style={styles.topBarLogo} resizeMode="contain" />
          {/* Geri butonuyla AYNI genislikte gorunmez bir bosluk - logo
              gercekten ORTALANSIN diye (bkz. RoomMapSheet.tsx ayni kalip). */}
          <View style={styles.backButton} />
        </View>

        {mode === "grid" ? (
          <>
            <LinearGradient
              colors={["#2a2a35", "#1c1c24", "#101014"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.searchBar}
            >
              <Icon name="search" size={18} color="rgba(255,255,255,0.85)" />
              <TextInput
                style={styles.searchInput}
                placeholder="ARA"
                placeholderTextColor="rgba(255,255,255,0.5)"
                value={search}
                onChangeText={setSearch}
              />
            </LinearGradient>
            <View style={styles.list}>
              {visibleItems.map((item) => (
                <TouchableOpacity key={item.key} style={styles.listItem} onPress={() => selectItem(item.key)}>
                  <View style={styles.listItemLogo}>
                    <PlatformLogo platform={item.logo} size={64} />
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </>
        ) : mode === "history" || mode === "liked" ? (
          <ScrollView style={styles.historyScreen} showsVerticalScrollIndicator={false}>
            <Text style={styles.title}>{mode === "liked" ? "Beğenilenler" : "Geçmiş"}</Text>
            {loadingHistory ? (
              <ActivityIndicator color="#FFFFFF" size="large" style={styles.historyLoading} />
            ) : (mode === "liked" ? likedItems : historyItems).length === 0 ? (
              <Text style={styles.historyEmptyText}>
                {mode === "liked" ? "Henüz beğendiğin bir video yok." : "Henüz izleme geçmişin yok."}
              </Text>
            ) : (
              <View style={styles.historyGrid}>
                {(mode === "liked" ? likedItems : historyItems).map((item) => (
                  <TouchableOpacity key={item.eventId} style={styles.historyCard} onPress={() => selectHistoryItem(item)}>
                    <View style={styles.historyThumb}>
                      {item.mediaCoverUrl ? (
                        <Image source={{ uri: item.mediaCoverUrl }} style={styles.historyThumbImage} />
                      ) : (
                        <Icon name="play" size={20} color="#FFFFFF" />
                      )}
                    </View>
                    <Text style={styles.historyTitle} numberOfLines={2}>
                      {item.mediaLabel}
                    </Text>
                    <Text style={styles.historyMeta}>{item.participantCount} kişi</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </ScrollView>
        ) : mode === "youtube" ? (
          <View style={styles.youtubeContainer}>
            <WebView
              source={{
                uri: relatedVideosFor ? `https://m.youtube.com/watch?v=${relatedVideosFor}` : "https://m.youtube.com",
              }}
              style={styles.webview}
              onNavigationStateChange={(navState) => handleYouTubeNavigation(navState.url)}
              javaScriptEnabled
              domStorageEnabled
            />
            {loadingTitle && (
              <View style={styles.youtubeLoadingOverlay}>
                <ActivityIndicator color="#FFFFFF" size="large" />
                <Text style={styles.youtubeLoadingText}>Video yukleniyor...</Text>
              </View>
            )}
          </View>
        ) : mode === "external" && externalPlatform ? (
          <View style={styles.youtubeContainer}>
            <WebView
              source={{ uri: externalPlatform.url }}
              style={styles.webview}
              userAgent={DESKTOP_USER_AGENT}
              injectedJavaScriptBeforeContentLoaded={EXTERNAL_VIDEO_DETECT_JS}
              onNavigationStateChange={(navState) => {
                externalCurrentUrlRef.current = navState.url;
              }}
              onMessage={(event) => {
                try {
                  const data = JSON.parse(event.nativeEvent.data);
                  if (data.type === "videoDetected") handleExternalVideoDetected();
                } catch {
                  // yoksay - beklenmeyen mesaj formati
                }
              }}
              javaScriptEnabled
              domStorageEnabled
            />
          </View>
        ) : (
          <View style={styles.formBox}>
            <Text style={styles.title}>Web sitesi linki</Text>
            <TextInput
              style={styles.input}
              placeholder="orn. wikipedia.org"
              placeholderTextColor={theme.textMuted}
              value={webUrlInput}
              onChangeText={setWebUrlInput}
              autoCapitalize="none"
              autoFocus
            />
            {error && <Text style={styles.error}>{error}</Text>}
            <TouchableOpacity style={styles.primaryButton} onPress={handleWebUrlSubmit} disabled={loadingTitle}>
              {loadingTitle ? (
                <ActivityIndicator color="#04140D" />
              ) : (
                <Text style={styles.primaryButtonText}>Devam</Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // paddingTop statusBarTranslucent nedeniyle inline veriliyor (insets.top +
  // ekstra boşluk) - arama çubuğu durum çubuğunun/çentiğin altında kalmasın.
  screen: { flex: 1, backgroundColor: "#0A0A0C", padding: 20 },
  // "flex-end" (alttan hizali) - geri ikonu (backButton, 38x38) ile logo
  // FARKLI yukseklikte (30) oldugu icin "center" ile ortalanirlarsa gorsel
  // olarak ayni hizada DURMUYORLARDI (bkz. topBarLogo). SABIT "height: 38"
  // KALDIRILDI - logo'nun gorsel tabanini ikonlarla hizalamak icin asagida
  // eklenen marginBottom, satirin yuksekligini kendi (30+marginBottom)
  // toplamindan DAHA FAZLA gerektiriyordu, sabit 38'lik yukseklikte bu
  // tasma/kirpilma riski yaratiyordu (logo kucuk/kirpilmis GORUNEBILIYORDU).
  // Yukseklik artik en uzun cocuga (en buyuk ihtiyaca) gore KENDILIGINDEN
  // hesaplaniyor.
  topBar: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 12 },
  backButton: { width: 38, height: 38, justifyContent: "center", alignItems: "center" },
  // topBar "flex-end" (alttan hizali) - ama geri ikonu kendi 38x38 kutusunun
  // icinde tabanindan boslukluyken logo PNG'sindeki "LUNA" yazisi kendi
  // kutusunun neredeyse tabanina kadar uzaniyor - kutular alttan hizlansa
  // bile yazi daha asagida GORUNUYORDU (piksel olculdu). marginBottom bunu
  // yukari kaydirip gercek GORSEL tabanlari esitliyor.
  topBarLogo: { width: 68, height: 30, marginBottom: 10, tintColor: "#FFFFFF" },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 26,
    paddingHorizontal: 18,
    paddingVertical: 13,
    gap: 10,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  searchInput: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 16,
    paddingVertical: 0,
    includeFontPadding: false,
    outlineWidth: 0,
    outlineStyle: "none",
  } as any,
  list: { flexDirection: "row", flexWrap: "wrap" },
  listItem: { width: "50%", paddingVertical: 14, alignItems: "center" },
  listItemLogo: { height: 76, justifyContent: "center", paddingHorizontal: 12 },
  title: { color: theme.text, fontSize: 22, fontWeight: "700" },
  historyScreen: { flex: 1 },
  historyLoading: { marginTop: 60 },
  historyEmptyText: { color: theme.textMuted, fontSize: 14, marginTop: 40, textAlign: "center" },
  historyGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", marginTop: 20 },
  historyCard: { width: "48%", marginBottom: 20 },
  historyThumb: {
    width: "100%",
    aspectRatio: 16 / 9,
    borderRadius: 10,
    backgroundColor: "#15151a",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    marginBottom: 8,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  historyThumbImage: { width: "100%", height: "100%" },
  historyTitle: { color: "#FFFFFF", fontSize: 13, fontWeight: "600" },
  historyMeta: { color: theme.textMuted, fontSize: 11, fontWeight: "600", marginTop: 3 },
  formBox: { backgroundColor: theme.bg, borderRadius: 16, padding: 20, gap: 16, marginTop: 20 },
  input: {
    backgroundColor: theme.surfaceAlt,
    color: theme.text,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  youtubeContainer: { flex: 1, marginHorizontal: -20, marginBottom: -20 },
  webview: { flex: 1 },
  youtubeLoadingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.8)",
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  youtubeLoadingText: { color: "#FFFFFF", fontSize: 15 },
  error: { color: theme.danger, fontSize: 13 },
  primaryButton: { backgroundColor: theme.accent, borderRadius: 10, paddingVertical: 14, alignItems: "center" },
  primaryButtonText: { color: "#04140D", fontWeight: "700", fontSize: 16 },
});
