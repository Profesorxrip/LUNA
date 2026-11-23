import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Image, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import { CircleArrowDown, Globe, Music, Clapperboard, ListVideo, PlayCircle, ListPlus, Pin, Trash2, Play, RotateCcw } from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useTranslation } from "react-i18next";
import { getSocket, HistoryItem, SourceType } from "../services/socket";
import type { MediaSource } from "../services/socket";
import { supabase } from "../services/supabase";
import { theme } from "../theme";
import { badgeInfoForSource, EXTERNAL_PLATFORMS, openPlatformApp } from "../utils/media";
import PlatformBadge from "./PlatformBadge";
import { extractYouTubeId, fetchYouTubeMeta } from "../utils/youtube";
import Icon from "./Icon";
import { showAlert } from "./CustomAlert";
import { getPinnedEventIds, togglePinnedEvent } from "../utils/pinnedHistory";
import { addToBlankPlaylist, clearBlankPlaylist, getBlankPlaylistUrls } from "../utils/blankPlaylist";
import { clearWatchedMedia, getWatchedMediaUrls } from "../utils/watchedMedia";
import { getLastPlayedMusicUrl, getNextMusicTrackUrl, resetLastPlayedMusicUrl, setLastPlayedMusicUrl } from "../utils/musicPlaylistPosition";
import { timeAgo } from "../utils/timeAgo";

// Platform secme grid'indeki BEYAZ kartlarda kullanilan gercek renkli marka
// logolari - PlatformLogo.tsx'teki SEFFAF/beyaz-siluet setinden (Discover/
// Stats gibi BASKA yerlerde de kullanildigi icin) BILEREK AYRI tutuluyor, bu
// sayede o setin kullanildigi diger ekranlar ETKILENMIYOR.
const GRID_LOGO_SOURCES: Record<string, any> = {
  youtube: require("../../assets/logos-grid/youtube.png"),
  netflix: require("../../assets/logos-grid/netflix.png"),
  hbomax: require("../../assets/logos-grid/hbomax.png"),
  twitch: require("../../assets/logos-grid/twitch.png"),
  icloud: require("../../assets/logos-grid/icloud.png"),
  disneyplus: require("../../assets/logos-grid/disney-plus.png"),
  primevideo: require("../../assets/logos-grid/prime-video.png"),
  drive: require("../../assets/logos-grid/drive.png"),
  web: require("../../assets/logos-grid/web.png"),
  webText: require("../../assets/logos-grid/web-text.png"),
};

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
  /** true ise Modal sarmalayicisi hic kullanilmaz, ic icerik dogrudan
   * (tam ekran bir TAB olarak, orn. "Oluştur" sekmesinde) render edilir -
   * RoomScreen.tsx'teki mevcut Modal kullanimini ETKILEMEZ (orada hic
   * verilmiyor, varsayilan false/undefined). */
  embedded?: boolean;
  /** "Oluştur" sekmesi (CreateRoomScreen.tsx) kucultulmus arama banner'ini
   * SADECE platform secme IZGARASINDAYKEN gostermek, alt ekranlardayken
   * (youtube/weburl/history/liked/external - ust barlari banner'in bindirme
   * bolgesiyle cakisiyor) GIZLEMEK icin - mod her degistiginde cagrilir. */
  onModeChange?: (mode: Mode) => void;
}

type Mode = "grid" | "youtube" | "weburl" | "history" | "liked" | "external";

// Netflix/Disney+/Prime/HBO Max gibi DRM'li sitelerin bot/cihaz korumasi
// varsayilan WebView kimligini reddedebiliyor - gercek bir Android Chrome
// gibi gorunmek bu ilk engeli asma ihtimalini artirir (bkz.
// DrmWebViewPlayer.tsx AYNI User-Agent, orada da ayni sebeple var).
// ONEMLI: MASAUSTU (Windows) DEGIL, Android Chrome - cihaz GERCEKTEN Android
// oldugu icin Netflix'in web oynaticisi platformu Windows sanirsa masaustune
// ozel bir Widevine saglamlik (robustness) seviyesi istiyor, bu da Android
// WebView'in GERCEKTE sagladigi mobil seviyeyle uyusmayip videonun sonsuza
// kadar "yukleniyor" kalmasina yol acabiliyor - kullanici kendi hesabiyla
// girip Netflix'in NATIVE uygulamasi ayni cihazda sorunsuz oynatirken bile.
const ANDROID_CHROME_USER_AGENT =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36";

// DRM'li platformlarda GERCEK bir <video> etiketi belirene kadar (host
// GERCEKTEN bir seyi oynatmaya baslayana kadar) secim sayilmiyor - bu
// sayede YouTube'daki gibi, host odaya girmeden ONCE TEK BASINA gezinip
// izleyecegi seyi bulabiliyor; gezinme/cerez onay ekranlari ODAYA HIC
// YANSIMIYOR. URL kalibina (orn. "/watch/") GUVENMIYORUZ - her platformun
// kendi, degisebilen bir deseni var, ama hepsi oynatirken GERCEK bir
// <video> etiketi olusturur, bu yuzden platform-bagimsiz ve guvenilir.
// userAgent prop'u SADECE navigator.userAgent string'ini degistiriyor -
// navigator.userAgentData (Client Hints) bu degisiklige dahil DEGIL, cunku
// onu tarayici motorunun KENDISI dolduruyor. Bir site UA string'i tutarli
// gorunse bile userAgentData eksik/tutarsizsa bu "gommulu WebView" sinyali
// olarak algilanip bot korumasina takilabiliyor (bkz. DrmWebViewPlayer.tsx
// AYNI bayrak, ayni sebep - Google'in kendi WebView belgeleri bunu
// dogruluyor) - bu yuzden UA string'iyle TUTARLI bir userAgentData da
// taklit ediyoruz.
const USER_AGENT_DATA_PATCH_JS = `
(function () {
  try {
    if (!navigator.userAgentData && !Object.getOwnPropertyDescriptor(navigator, 'userAgentData')) {
      var brands = [
        { brand: "Chromium", version: "131" },
        { brand: "Google Chrome", version: "131" },
        { brand: "Not_A Brand", version: "24" }
      ];
      var uaData = {
        brands: brands,
        mobile: true,
        platform: "Android",
        toJSON: function () { return { brands: brands, mobile: true, platform: "Android" }; },
        getHighEntropyValues: function () {
          return Promise.resolve({
            brands: brands,
            mobile: true,
            platform: "Android",
            platformVersion: "14.0.0",
            architecture: "",
            model: "Pixel 8 Pro",
            uaFullVersion: "131.0.0.0",
            fullVersionList: brands
          });
        }
      };
      Object.defineProperty(navigator, "userAgentData", { get: function () { return uaData; }, configurable: true });
    }
  } catch (e) {}
})();
`;

// Netflix gibi platformlar userAgentData tutarli olsa BILE ayrica "Netflix
// uygulamayla daha guzel / mobil cihazda izlemek icin uygulama gerekir" diye
// DELIBERATE bir tam ekran tanitim karti gosterebiliyor - bu bir bot/DRM
// kontrolu DEGIL, kozmetik bir "once bunu gor" katmani (cogu sitede boyle
// tanitim kartlari ALTTAKI sayfayi/oynaticiyi engellemez, sadece ustune
// biner, bkz. DrmWebViewPlayer.tsx AYNI script). Bu yuzden bu karta BENZEYEN
// bir eleman bulursak gizleyip altinda gercek bir <video> olusuyor mu diye
// devam ediyoruz - deneysel, cihazda test edilmeli.
const APP_PROMO_DISMISS_JS = `
(function () {
  if (window.__lunaPromoDismiss) return;
  window.__lunaPromoDismiss = true;
  var PHRASES = [
    "daha güzel", "daha guzel", "uygulaması gerekir", "uygulamasi gerekir",
    "uygulamayı aç", "uygulamayi ac", "better in the app", "open the app",
    "get the app", "download the app", "use the app"
  ];
  function textMatches(el) {
    var t = (el.innerText || el.textContent || "").toLowerCase();
    if (!t || t.length > 400) return false;
    return PHRASES.some(function (p) { return t.indexOf(p) !== -1; });
  }
  function coversScreen(el) {
    var r = el.getBoundingClientRect();
    return r.width >= window.innerWidth * 0.8 && r.height >= window.innerHeight * 0.5;
  }
  function findOverlayAncestor(el) {
    var node = el;
    for (var i = 0; i < 6 && node; i++) {
      var style = window.getComputedStyle(node);
      if ((style.position === "fixed" || style.position === "absolute") && coversScreen(node)) return node;
      node = node.parentElement;
    }
    return null;
  }
  function sweep() {
    var all = document.querySelectorAll("div, section, main");
    for (var i = 0; i < all.length; i++) {
      if (!textMatches(all[i])) continue;
      var overlay = findOverlayAncestor(all[i]);
      if (overlay && overlay.style.display !== "none") {
        overlay.style.display = "none";
        document.documentElement.style.overflow = "";
        document.body.style.overflow = "";
      }
    }
  }
  sweep();
  new MutationObserver(sweep).observe(document.documentElement, { childList: true, subtree: true });
  setInterval(sweep, 1500);
  true;
})();
`;

const EXTERNAL_VIDEO_DETECT_JS = `
${USER_AGENT_DATA_PATCH_JS}
${APP_PROMO_DISMISS_JS}
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
// Marka isimleri (YouTube/Web) cevrilmiyor - "Gecmis"/"Begenilenler" ise
// dil degisiminde guncellensin diye bir fonksiyonla (sabit degil) uretiliyor.
function getAllItems(t: (key: string) => string): GridItem[] {
  return [
    { key: "youtube", label: "YouTube", logo: "youtube" },
    ext("netflix"),
    ext("hbomax"),
    ext("twitch"),
    ext("prime"),
    ext("disney"),
    { key: "web", label: "Web", logo: "web" },
    ext("drive"),
    ext("icloud"),
    // X icin ayri bir kart YOK - zaten "Web" ile x.com linki yapistirilinca
    // ayni sekilde acilabiliyor (EXTERNAL_PLATFORMS'ta "x" hala duruyor, o
    // sayede Web'den girilen bir X linki de dogru rozet/logo ile eslesiyor,
    // bkz. RoomCard.tsx/RoomPreviewScreen.tsx domain eslestirme).
  ];
}

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
export default function MediaPickerSheet({ visible, onClose, onSelect, relatedVideosFor, embedded, onModeChange }: Props) {
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<Mode>("grid");

  useEffect(() => {
    onModeChange?.(mode);
    // onModeChange KASITLI olarak bagimlilik dizisine eklenmedi - cagiran
    // taraf (CreateRoomScreen.tsx) her render'da YENI bir fonksiyon
    // gecebilir, bu SADECE mod GERCEKTEN degistiginde tetiklenmeli.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);
  const [search, setSearch] = useState("");
  const [webUrlInput, setWebUrlInput] = useState("");
  const [loadingTitle, setLoadingTitle] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Kullanici: "tam profesyonel bir mini tarayıcı olmalı" - "Web" artik tek
  // seferlik bir link kutusu DEGIL, host linki yazip GERCEKTEN gezinebilir
  // (WebView), istedigi sayfada durup "Bu Sayfayı Seç" diyebilir. webBrowsing
  // false iken adres cubugu+bos karsilama ekrani, true olunca - kullanici:
  // "Google sayfasının üstünde bunu görmek istemiyorum" (Rave'deki gibi,
  // uzerinde HICBIR cubuk olmadan) - adres cubugu TAMAMEN kalkip SADECE
  // tam ekran WebView + "Bu Sayfayı Seç" gosterilir (youtube/external
  // modlarindaki AYNI sade gorunum).
  const [webBrowsing, setWebBrowsing] = useState(false);
  const [webCurrentUrl, setWebCurrentUrl] = useState<string | null>(null);
  // Gercek sayfa basligi (navState.title) - oda ismi icin ayrica sunucuya
  // sorup (fetchWebPageTitle) beklemek yerine, zaten yuklenmis olan sayfanin
  // GERCEK <title>'ini dogrudan kullaniyoruz (daha hizli, CORS riski yok).
  const [webPageTitle, setWebPageTitle] = useState<string | null>(null);
  const webViewRef = useRef<WebView>(null);
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
  // Grid ekraninin altindaki playlist sekme cubugu (Muzik/Dizi-Film/Bos) -
  // Muzik/Dizi-Film ayni gercek izleme gecmisi verisini (get_user_room_history)
  // media linkine gore sinifllandirarak kullanir - get_user_platform_stats
  // RPC'sindeki ayni domain sezgisiyle (spotify.com = muzik, geri kalani
  // dizi/film). "Bos playlist" ise CIHAZ BAZLI ayri bir url listesi
  // (blankPlaylist.ts) - bir oda acilirken/secilirken SECILEN videonun url'si
  // buraya eklenir, o video dogal olarak bitince (bkz. RoomScreen.tsx
  // room.poll gecisi) kaldirilir, yani "su an kuyrukta/izlenmekte olan"
  // videolari gosterir.
  const [playlistTab, setPlaylistTab] = useState<"music" | "seriesFilm" | "empty">("empty");
  const [playlistHistory, setPlaylistHistory] = useState<HistoryItem[]>([]);
  const [loadingPlaylist, setLoadingPlaylist] = useState(false);
  const [blankPlaylistUrls, setBlankPlaylistUrls] = useState<Set<string>>(new Set());
  // Dizi/Film playlist'inde izlenip BITIRILEN bir video artik "izlenecekler"
  // listesinde gorunmemeli - bkz. RoomScreen.tsx markMediaWatched (ayni
  // room.poll gecis ani, blankPlaylist'ten kaldirmayla AYNI yerde).
  const [watchedMediaUrls, setWatchedMediaUrls] = useState<Set<string>>(new Set());
  // Profildeki Gecmis/Begenilenler kartlarindaki uc nokta menusuyle AYNI
  // davranis (bkz. UserProfileScreen.tsx renderVideoMenu) - "Gorunurluk
  // Degistir" satiri BILEREK YOK (bu ekranda host'un KENDI gecmisi disinda
  // bir sey yok, gorunurluk kavrami gecerli degil). Sabitleme AYNI cihaz
  // bazli depoyu (pinnedHistory.ts) paylasir, boylece profilde sabitlenen
  // bir video burada da sabit gorunur.
  const [pinnedPlaylistEventIds, setPinnedPlaylistEventIds] = useState<Set<string>>(new Set());
  const [playlistMenuTarget, setPlaylistMenuTarget] = useState<string | null>(null);
  const [playlistMenuShowAddTo, setPlaylistMenuShowAddTo] = useState(false);
  // Bir sekmenin ikonuna o sekme ZATEN ACIKKEN tekrar basilinca acilan kucuk
  // kutu - "Playlist'i Oynat" ve "Sifirla" secenekleri. Muzik'te "Oynat" en
  // son kaldigimiz yerden/basa donerek devam eder (bkz.
  // musicPlaylistPosition.ts), "Sifirla" kaldigimiz yeri unutur. Dizi/Film ve
  // Bos'ta "Oynat" listenin ILK ogesini acar, "Sifirla" ise Dizi/Film'de
  // izlenip dusen videolari geri getirir, Bos'ta kuyrugu komple bosaltir.
  const [musicQuickMenuOpen, setMusicQuickMenuOpen] = useState(false);
  const [seriesFilmQuickMenuOpen, setSeriesFilmQuickMenuOpen] = useState(false);
  const [blankQuickMenuOpen, setBlankQuickMenuOpen] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMyUserId(data.user?.id ?? null));
    getPinnedEventIds().then(setPinnedPlaylistEventIds);
    getBlankPlaylistUrls().then(setBlankPlaylistUrls);
    getWatchedMediaUrls().then(setWatchedMediaUrls);
  }, []);

  useEffect(() => {
    if (!myUserId) return;
    setLoadingPlaylist(true);
    getSocket().emit("user:roomHistory", { userId: myUserId }, (res: any) => {
      setLoadingPlaylist(false);
      if (res?.ok) setPlaylistHistory(res.history);
    });
  }, [myUserId]);

  async function togglePinPlaylistItem(eventId: string) {
    const ids = await togglePinnedEvent(eventId);
    setPinnedPlaylistEventIds(new Set(ids));
  }

  function confirmRemovePlaylistItem(item: HistoryItem) {
    showAlert(t("userProfile.removeFromHistoryTitle"), t("userProfile.removeFromHistoryBody"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("userProfile.removeFromHistory"),
        style: "destructive",
        onPress: () => setPlaylistHistory((prev) => prev.filter((h) => h.eventId !== item.eventId)),
      },
    ]);
  }

  function playlistAddToPlaceholder(label: string) {
    showAlert(label, t("profile.comingSoon"));
  }

  const musicPlaylist = useMemo(
    () => playlistHistory.filter((item) => (item.mediaUrl || "").toLowerCase().includes("spotify.com")),
    [playlistHistory]
  );
  const seriesFilmPlaylist = useMemo(
    () =>
      playlistHistory.filter(
        (item) => !(item.mediaUrl || "").toLowerCase().includes("spotify.com") && !(item.mediaUrl && watchedMediaUrls.has(item.mediaUrl))
      ),
    [playlistHistory, watchedMediaUrls]
  );
  const blankPlaylist = useMemo(
    () => playlistHistory.filter((item) => !!item.mediaUrl && blankPlaylistUrls.has(item.mediaUrl)),
    [playlistHistory, blankPlaylistUrls]
  );
  const activePlaylistItemsRaw =
    playlistTab === "music" ? musicPlaylist : playlistTab === "seriesFilm" ? seriesFilmPlaylist : blankPlaylist;
  // Sabitlenenler (diger siralamayi BOZMADAN) listenin basina gelir - profildeki
  // historyList/likedHistorySorted ile AYNI desen.
  const activePlaylistItems = [...activePlaylistItemsRaw].sort(
    (a, b) => Number(pinnedPlaylistEventIds.has(b.eventId)) - Number(pinnedPlaylistEventIds.has(a.eventId))
  );

  // "Playlist'i Oynat" - en son kaldigimiz parcadan (bkz.
  // musicPlaylistPosition.ts) bir SONRAKI parcayi, playlist bittiyse (ya da
  // hic calinmamissa) BASTAN baslatir - musicPlaylist'in KENDI sirasi (pin
  // sirasi DEGIL) kullanilir, "playlist sirasi" pinlemeden etkilenmesin diye.
  async function playMusicPlaylist() {
    const orderedUrls = musicPlaylist.map((item) => item.mediaUrl).filter((url): url is string => !!url);
    const lastPlayedUrl = await getLastPlayedMusicUrl();
    const nextUrl = getNextMusicTrackUrl(orderedUrls, lastPlayedUrl);
    if (!nextUrl) return;
    const nextItem = musicPlaylist.find((item) => item.mediaUrl === nextUrl);
    if (nextItem) selectHistoryItem(nextItem);
  }

  async function resetMusicPlaylist() {
    await resetLastPlayedMusicUrl();
  }

  function playSeriesFilmPlaylist() {
    if (seriesFilmPlaylist.length === 0) return;
    selectHistoryItem(seriesFilmPlaylist[0]);
  }

  async function resetSeriesFilmPlaylist() {
    await clearWatchedMedia();
    setWatchedMediaUrls(new Set());
  }

  function playBlankPlaylist() {
    if (blankPlaylist.length === 0) return;
    selectHistoryItem(blankPlaylist[0]);
  }

  async function resetBlankPlaylist() {
    await clearBlankPlaylist();
    setBlankPlaylistUrls(new Set());
  }

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
    () => getAllItems(t).filter((i) => i.label.toLowerCase().includes(search.trim().toLowerCase())),
    [search, t]
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
    setWebBrowsing(false);
    setWebCurrentUrl(null);
    setWebPageTitle(null);
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
    setWebBrowsing(false);
    setWebCurrentUrl(null);
    setWebPageTitle(null);
    setWebUrlInput("");
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
    onSelect({ type: "youtube", url: videoId, label: meta.title || t("mediaPicker.youtubeFallbackTitle"), channelName: meta.channelName || undefined });
    handleClose();
  }

  // Platforma dokununca YouTube'daki gibi ONCE uygulama ICINDE (odaya
  // girmeden) o platformun GERCEK sitesinde gezinilir - isim/kapak sormadan
  // oda ancak host GERCEKTEN bir seyi oynatmaya baslayinca acilir (bkz.
  // handleExternalVideoDetected), oda/kart adi platformun kendi adi olarak
  // kalir (DRM'li platformlarda uygulama icinden gercek video basligini
  // goremedigimiz icin). Netflix/Prime/Disney+/HBO Max (drmLocked) de AYNI
  // gezinmeyi dener artik - gercek bir watch-party uygulamasinin (Rave)
  // ekran goruntuleriyle dogrulandigi uzere bu platformlar bazi cihazlarda
  // GERCEKTEN bir WebView icinde oynayabiliyor (onceki "WebView'de asla
  // oynamiyorlar" varsayimimiz YANLISTI - bkz. DrmWebViewPlayer.tsx
  // USER_AGENT_DATA_PATCH_JS, asil eksik userAgentData/Client Hints
  // tutarsizligiydi). Gezinme sirasinda video hic algilanmazsa host yine de
  // kacis kapisi butonuyla platformun kendi uygulamasina gecebilir (bkz.
  // asagidaki "external" render dalindaki buton).
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
      showAlert(t("userProfile.videoUnavailableTitle"), t("mediaPicker.videoUnavailableBody"));
      return;
    }
    if (playlistTab === "music") setLastPlayedMusicUrl(item.mediaUrl);
    onSelect({
      type: item.mediaType as SourceType,
      url: item.mediaUrl,
      label: item.mediaLabel,
      coverUrl: item.mediaCoverUrl || undefined,
    });
    handleClose();
  }

  // Playlist kartlarindaki uc nokta menusu - UserProfileScreen.tsx
  // renderVideoMenu ile AYNI gorunum/konumlandirma (bkz. styles.visibilityMenu/
  // visibilityMenuRow), sadece "Gorunurluk Degistir" satiri YOK (kullanicinin
  // acik istegi - bu ekranda gorunurluk kavrami gecerli degil).
  function renderPlaylistItemMenu(item: HistoryItem) {
    const open = playlistMenuTarget === item.eventId;
    const isPinned = pinnedPlaylistEventIds.has(item.eventId);
    function closeMenu() {
      setPlaylistMenuTarget(null);
      setPlaylistMenuShowAddTo(false);
    }
    return (
      <View style={styles.playlistMenuAnchor}>
        <TouchableOpacity
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          onPress={(e) => {
            e.stopPropagation();
            if (open) {
              closeMenu();
            } else {
              setPlaylistMenuTarget(item.eventId);
              setPlaylistMenuShowAddTo(false);
            }
          }}
        >
          <Icon name="moreHoriz" size={18} color={theme.textMuted} />
        </TouchableOpacity>
        {open && (
          <View style={styles.playlistMenuPopup}>
            {!playlistMenuShowAddTo ? (
              <>
                <TouchableOpacity
                  style={styles.playlistMenuRow}
                  onPress={(e) => {
                    e.stopPropagation();
                    closeMenu();
                    selectHistoryItem(item);
                  }}
                >
                  <PlayCircle size={16} color="#FFFFFF" />
                  <Text style={styles.playlistMenuRowText}>{t("userProfile.openRoom")}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.playlistMenuRow}
                  onPress={(e) => {
                    e.stopPropagation();
                    setPlaylistMenuShowAddTo(true);
                  }}
                >
                  <ListPlus size={16} color="#FFFFFF" />
                  <Text style={styles.playlistMenuRowText}>{t("userProfile.addToPlaylist")}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.playlistMenuRow}
                  onPress={(e) => {
                    e.stopPropagation();
                    closeMenu();
                    togglePinPlaylistItem(item.eventId);
                  }}
                >
                  <Pin size={16} color="#FFFFFF" fill={isPinned ? "#FFFFFF" : "none"} />
                  <Text style={styles.playlistMenuRowText}>{isPinned ? t("userProfile.unpinRoom") : t("userProfile.pinRoom")}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.playlistMenuRow}
                  onPress={(e) => {
                    e.stopPropagation();
                    closeMenu();
                    confirmRemovePlaylistItem(item);
                  }}
                >
                  <Trash2 size={16} color="#FFFFFF" />
                  <Text style={styles.playlistMenuRowText}>{t("userProfile.removeFromHistory")}</Text>
                </TouchableOpacity>
              </>
            ) : (
              (
                [
                  { key: "music" as const, label: t("userProfile.playlistMusic"), PlaylistIcon: Music },
                  { key: "video" as const, label: t("userProfile.playlistShows"), PlaylistIcon: Clapperboard },
                  { key: "blank" as const, label: t("userProfile.playlistBlank"), PlaylistIcon: ListVideo },
                ] as const
              ).map((opt) => (
                <TouchableOpacity
                  key={opt.key}
                  style={styles.playlistMenuRow}
                  onPress={async (e) => {
                    e.stopPropagation();
                    closeMenu();
                    if (opt.key === "blank") {
                      if (!item.mediaUrl) return;
                      const urls = await addToBlankPlaylist(item.mediaUrl);
                      setBlankPlaylistUrls(new Set(urls));
                    } else {
                      playlistAddToPlaceholder(opt.label);
                    }
                  }}
                >
                  <opt.PlaylistIcon size={16} color="#FFFFFF" />
                  <Text style={styles.playlistMenuRowText}>{opt.label}</Text>
                </TouchableOpacity>
              ))
            )}
          </View>
        )}
      </View>
    );
  }

  function domainLabelFor(url: string): string {
    return url.replace(/^https?:\/\//i, "").replace(/^www\./i, "").split("/")[0];
  }

  // Kullanici: "Search çubuğuna birşey yazdığımda google ile arama yapıyor
  // demi" - HAYIR, oncesinde yazilan her sey dogrudan bir adres sanilip
  // "https://" ile actiliyordu. Gercek tarayicilarin adres cubugu gibi:
  // zaten http(s):// ile basliyorsa veya bosluksuz, en az bir nokta iceren
  // alan-adi-benzeri bir sey ise (orn. "wikipedia.org", "wikipedia.org/wiki/x")
  // GERCEK bir adres sayilir; aksi halde (bosluk var, nokta yok vb. -
  // orn. "pizza tarifi") bir arama cumlesi sayilip Google'da aratilir.
  function looksLikeUrl(input: string): boolean {
    if (/^https?:\/\//i.test(input)) return true;
    if (/\s/.test(input)) return false;
    return /^[a-z0-9-]+(\.[a-z0-9-]+)+(:\d+)?([/?#].*)?$/i.test(input) || /^localhost(:\d+)?([/?#].*)?$/i.test(input);
  }

  // Adres cubugundaki "Git" - dogrudan bir video dosyasi linkiyse (.mp4/
  // .m3u8) DRM'li bir platform degil, kendi oynaticimizda (HlsPlayer) gercek
  // senkronla oynatilabilir (bunlarda sayfa/baslik/gezinme kavrami yok, ham
  // video verisi) - bu durumda ESKIDEN OLDUGU gibi aninda secilir. Genel bir
  // sayfaysa artik dogrudan secilmiyor, GERCEK gezinme (WebView) baslatiliyor
  // - host istedigi sayfaya gidip orada "Bu Sayfayı Seç" diyebilir.
  function handleWebGo() {
    const trimmed = webUrlInput.trim();
    if (!trimmed) {
      setError(t("mediaPicker.enterUrlError"));
      return;
    }
    setError(null);
    const normalized = looksLikeUrl(trimmed)
      ? (/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`)
      : `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`;
    const pathname = normalized.replace(/[?#].*$/, "");
    if (/\.m3u8$/i.test(pathname)) {
      onSelect({ type: "hls", url: normalized, label: domainLabelFor(normalized) });
      handleClose();
      return;
    }
    if (/\.mp4$/i.test(pathname)) {
      onSelect({ type: "mp4", url: normalized, label: domainLabelFor(normalized) });
      handleClose();
      return;
    }
    setWebUrlInput(normalized);
    setWebCurrentUrl(normalized);
    setWebPageTitle(null);
    setWebBrowsing(true);
  }

  // Gezinme sirasinda WebView her navigasyonda cagirir - adres cubugu artik
  // gosterilmedigi icin (bkz. yukarisi) sadece o anki GERCEK URL'i ve
  // (secim aninda kullanilacak) GERCEK sayfa basligini (navState.title)
  // arka planda takip eder.
  function handleWebNavChange(navState: { url: string; title?: string }) {
    setWebCurrentUrl(navState.url);
    if (navState.title) setWebPageTitle(navState.title);
  }

  // "Bu Sayfayı Seç" - host gezinme sirasinda durdugu SAYFAYI (platform
  // listesindeki digerleri gibi "external" turunde) odanin icerigi yapar.
  // Sayfa basligi icin ayrica sunucuya sorup beklemiyoruz (bkz. yukarisi) -
  // WebView zaten o sayfayi tamamen yuklemis durumda, navState.title GERCEK
  // <title>'i veriyor.
  function handleWebSelectCurrentPage() {
    if (!webCurrentUrl) return;
    onSelect({ type: "external", url: webCurrentUrl, label: webPageTitle || domainLabelFor(webCurrentUrl) });
    handleClose();
  }

  // "Oluştur" sekmesinde (embedded) grid ekraninda geri/kapatma icin
  // gidilecek bir ust ekran YOK (bu sekmenin kendisi kalici) - o durumda
  // geri oku yerine sag taraftakiyle AYNI gorunmez bosluk gosterilir, logo
  // yine ortalanmis kalir. Alt modlardaysa (youtube/weburl/history/liked/
  // external) embedded'da da geri oku grid'e donmeye devam eder.
  const showBackButton = !(embedded && mode === "grid");

  const content = (
      <View style={[styles.screen, { paddingTop: insets.top + 16 }, embedded && { backgroundColor: "transparent" }]}>
        {/* Grid (ana platform listesi) ekraninda da ayni ustbar - geri
            okuna basinca grid'den bir ALT ekrandaysak (youtube/weburl/
            history/liked) grid'e, grid'in KENDISINDEYSEK sheet'i kapatiyor
            (artik "ARA" cubugunun solunda kapatma icin TEK dokunulacak yer
            buydu, oncesinde hicbir ikon yoktu). */}
        <View style={[styles.topBar, mode !== "grid" && styles.topBarTall]}>
          {showBackButton ? (
            // Kullanici: "Geri ikonu bizim yuvarlak içindeki sola bakan ok
            // ikonumuz olsun" - uygulamadaki standart geri dugmesi (bkz.
            // DMScreen.tsx/GroupChatScreen.tsx onBack) CircleArrowDown'in
            // 90 derece dondurulmus hali - duz ChevronLeft yerine ONA
            // uyumlu hale getirildi.
            <TouchableOpacity style={styles.backButton} onPress={mode === "grid" ? handleClose : handleBack} hitSlop={10}>
              <View style={{ transform: [{ rotate: "90deg" }] }}>
                <CircleArrowDown size={22} color="#FFFFFF" />
              </View>
            </TouchableOpacity>
          ) : (
            <View style={styles.backButton} />
          )}
        </View>

        {mode === "grid" ? (
          <ScrollView style={styles.gridScreen} showsVerticalScrollIndicator={false}>
            <View
              style={[
                styles.gridInset,
                (musicQuickMenuOpen || seriesFilmQuickMenuOpen || blankQuickMenuOpen) && { zIndex: 20 },
              ]}
            >
            <LinearGradient
              colors={["#FFFFFF", "#38BDF8"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.searchBarBorder}
            >
              <LinearGradient
                colors={["#0c1a28", "#13293f", "#1b3752"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.searchBar}
              >
                <Icon name="search" size={18} color="#FFFFFF" />
                <TextInput
                  style={styles.searchInput}
                  placeholder={t("friends.searchPlaceholder")}
                  placeholderTextColor="rgba(186,214,235,0.45)"
                  value={search}
                  onChangeText={setSearch}
                />
              </LinearGradient>
            </LinearGradient>
            <View style={styles.list}>
              {visibleItems.map((item, index) => {
                const row = Math.floor(index / 3);
                return (
                  <TouchableOpacity
                    key={item.key}
                    style={[
                      styles.listItem,
                      { paddingTop: row === 0 ? 1 : 4.5, paddingBottom: row === 2 ? 6 : 4.5 },
                    ]}
                    onPress={() => selectItem(item.key)}
                  >
                    <View style={styles.listItemLogo}>
                      {item.key === "web" ? (
                        <View style={styles.webLogoRow}>
                          <Image
                            source={GRID_LOGO_SOURCES.web}
                            style={styles.webLogoIcon}
                            resizeMode="contain"
                          />
                          <Image
                            source={GRID_LOGO_SOURCES.webText}
                            style={styles.webLogoTextImage}
                            resizeMode="contain"
                          />
                        </View>
                      ) : (
                        !!GRID_LOGO_SOURCES[item.logo] && (
                          <Image
                            source={GRID_LOGO_SOURCES[item.logo]}
                            style={[
                              styles.listItemLogoImage,
                              item.key === "prime" && { width: "97%", height: "97%", transform: [{ translateY: 3 }] },
                              item.key === "disney" && { transform: [{ translateY: -3 }] },
                            ]}
                            resizeMode="contain"
                          />
                        )
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View
              style={[
                styles.playlistTabBar,
                (musicQuickMenuOpen || seriesFilmQuickMenuOpen || blankQuickMenuOpen) && { zIndex: 20 },
              ]}
            >
              <TouchableOpacity
                style={[styles.playlistTabBtn, { transform: [{ translateX: 3 }] }]}
                onPress={() => {
                  if (playlistTab === "music") {
                    setMusicQuickMenuOpen((open) => !open);
                  } else {
                    setPlaylistTab("music");
                    setMusicQuickMenuOpen(false);
                  }
                }}
                hitSlop={8}
              >
                <View style={{ opacity: playlistTab === "music" ? 1 : 0.35 }}>
                  <Music size={22} color="#FFFFFF" strokeWidth={2.2} />
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.playlistTabBtn}
                onPress={() => {
                  if (playlistTab === "seriesFilm") {
                    setSeriesFilmQuickMenuOpen((open) => !open);
                  } else {
                    setPlaylistTab("seriesFilm");
                    setSeriesFilmQuickMenuOpen(false);
                  }
                }}
                hitSlop={8}
              >
                <View style={{ opacity: playlistTab === "seriesFilm" ? 1 : 0.35 }}>
                  <Clapperboard size={22} color="#FFFFFF" strokeWidth={2.2} />
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.playlistTabBtn, { transform: [{ translateX: -3 }] }]}
                onPress={() => {
                  if (playlistTab === "empty") {
                    setBlankQuickMenuOpen((open) => !open);
                  } else {
                    setPlaylistTab("empty");
                    setBlankQuickMenuOpen(false);
                  }
                }}
                hitSlop={8}
              >
                <View style={{ opacity: playlistTab === "empty" ? 1 : 0.35 }}>
                  <ListVideo size={22} color="#FFFFFF" strokeWidth={2.2} />
                </View>
              </TouchableOpacity>

              {musicQuickMenuOpen && (
                <View style={styles.playlistMenuPopupLeft}>
                  <TouchableOpacity
                    style={styles.playlistMenuRow}
                    onPress={() => {
                      setMusicQuickMenuOpen(false);
                      playMusicPlaylist();
                    }}
                  >
                    <Play size={16} color="#FFFFFF" />
                    <Text style={styles.playlistMenuRowText}>{t("mediaPicker.playPlaylist")}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.playlistMenuRow}
                    onPress={() => {
                      setMusicQuickMenuOpen(false);
                      resetMusicPlaylist();
                    }}
                  >
                    <RotateCcw size={16} color="#FFFFFF" />
                    <Text style={styles.playlistMenuRowText}>{t("mediaPicker.resetPlaylist")}</Text>
                  </TouchableOpacity>
                </View>
              )}
              {seriesFilmQuickMenuOpen && (
                <View style={styles.playlistMenuPopupCenter}>
                  <TouchableOpacity
                    style={styles.playlistMenuRow}
                    onPress={() => {
                      setSeriesFilmQuickMenuOpen(false);
                      playSeriesFilmPlaylist();
                    }}
                  >
                    <Play size={16} color="#FFFFFF" />
                    <Text style={styles.playlistMenuRowText}>{t("mediaPicker.playPlaylist")}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.playlistMenuRow}
                    onPress={() => {
                      setSeriesFilmQuickMenuOpen(false);
                      resetSeriesFilmPlaylist();
                    }}
                  >
                    <RotateCcw size={16} color="#FFFFFF" />
                    <Text style={styles.playlistMenuRowText}>{t("mediaPicker.resetPlaylist")}</Text>
                  </TouchableOpacity>
                </View>
              )}
              {blankQuickMenuOpen && (
                <View style={styles.playlistMenuPopup}>
                  <TouchableOpacity
                    style={styles.playlistMenuRow}
                    onPress={() => {
                      setBlankQuickMenuOpen(false);
                      playBlankPlaylist();
                    }}
                  >
                    <Play size={16} color="#FFFFFF" />
                    <Text style={styles.playlistMenuRowText}>{t("mediaPicker.playPlaylist")}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.playlistMenuRow}
                    onPress={() => {
                      setBlankQuickMenuOpen(false);
                      resetBlankPlaylist();
                    }}
                  >
                      <RotateCcw size={16} color="#FFFFFF" />
                      <Text style={styles.playlistMenuRowText}>{t("mediaPicker.resetPlaylist")}</Text>
                    </TouchableOpacity>
                  </View>
                )}
            </View>
            </View>
            <LinearGradient
              colors={["#FFFFFF", "#38BDF8"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.playlistTabDivider}
            />
            <View style={[styles.gridInset, styles.playlistContent]}>
              {loadingPlaylist ? (
                <ActivityIndicator color="#FFFFFF" size="small" style={styles.historyLoading} />
              ) : activePlaylistItems.length === 0 ? (
                <Text style={styles.historyEmptyText}>{t("mediaPicker.noPlaylistVideos")}</Text>
              ) : (
                <View>
                  {activePlaylistItems.map((item, index) => (
                    <Fragment key={item.eventId}>
                      {index > 0 && <View style={styles.playlistVideoDivider} />}
                      <TouchableOpacity
                        style={[styles.playlistVideoCard, playlistMenuTarget === item.eventId && { zIndex: 20 }]}
                        onPress={() => selectHistoryItem(item)}
                      >
                        <View style={styles.playlistVideoThumb}>
                          {!!item.mediaCoverUrl && <Image source={{ uri: item.mediaCoverUrl }} style={styles.playlistVideoThumbImage} />}
                        </View>
                        <View style={styles.playlistVideoInfo}>
                          <View style={styles.playlistVideoTitleRow}>
                            <Text style={styles.playlistVideoTitle} numberOfLines={2}>
                              {item.mediaLabel}
                            </Text>
                            {pinnedPlaylistEventIds.has(item.eventId) && <Pin size={12} color={theme.textMuted} fill={theme.textMuted} />}
                          </View>
                          {(() => {
                            const badge =
                              item.mediaType && item.mediaUrl
                                ? badgeInfoForSource({ type: item.mediaType as SourceType, url: item.mediaUrl, coverUrl: item.mediaCoverUrl || undefined })
                                : null;
                            return (
                              !!badge && (
                                <View style={styles.playlistVideoPlatformRow}>
                                  <PlatformBadge platform={badge.key} faviconUrl={badge.faviconUrl} size={14} />
                                  <Text style={styles.playlistVideoPlatformText}>{badge.label}</Text>
                                </View>
                              )
                            );
                          })()}
                          <Text style={styles.playlistVideoMeta}>{timeAgo(item.createdAt, t, i18n.language)}</Text>
                        </View>
                        {renderPlaylistItemMenu(item)}
                      </TouchableOpacity>
                    </Fragment>
                  ))}
                </View>
              )}
            </View>
          </ScrollView>
        ) : mode === "history" || mode === "liked" ? (
          <ScrollView style={styles.historyScreen} showsVerticalScrollIndicator={false}>
            <Text style={styles.title}>{mode === "liked" ? t("userProfile.tabLiked") : t("userProfile.tabHistory")}</Text>
            {loadingHistory ? (
              <ActivityIndicator color="#FFFFFF" size="large" style={styles.historyLoading} />
            ) : (mode === "liked" ? likedItems : historyItems).length === 0 ? (
              <Text style={styles.historyEmptyText}>
                {mode === "liked" ? t("mediaPicker.noLikedVideos") : t("mediaPicker.noHistoryVideos")}
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
                    <Text style={styles.historyMeta}>{t("userProfile.peopleCount", { count: item.participantCount })}</Text>
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
                <Text style={styles.youtubeLoadingText}>{t("mediaPicker.loadingVideo")}</Text>
              </View>
            )}
          </View>
        ) : mode === "external" && externalPlatform ? (
          <View style={styles.youtubeContainer}>
            <WebView
              source={{ uri: externalPlatform.url }}
              style={styles.webview}
              userAgent={ANDROID_CHROME_USER_AGENT}
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
              allowsInlineMediaPlayback
              mediaPlaybackRequiresUserAction={false}
              // Android'de VARSAYILAN false - kapaliyken Netflix/Disney+ gibi
              // DRM'li (Widevine) video hic baslamaz (sonsuza kadar
              // "yukleniyor" kalir) - bkz. DrmWebViewPlayer.tsx AYNI bayrak,
              // ayni sebep. Burada ayrica onemli: host bu gezinme asamasinda
              // GERCEKTEN oynatmaya baslamazsa (bkz. EXTERNAL_VIDEO_DETECT_JS)
              // secim hic tetiklenmez.
              allowsProtectedMedia
            />
            {/* Kacis kapisi: bu platform gezinirken de video hic algilanmaz/
                takilirsa host dogrudan kendi uygulamasina gecebilir - sohbete
                hic girilmedigi icin burada "oda" kavrami yok, sadece sheet'i
                kapatip uygulamayi aciyoruz. */}
            <TouchableOpacity
              style={styles.externalEscapeBtn}
              onPress={() => {
                const platform = externalPlatform;
                handleClose();
                if (platform) openPlatformApp(platform);
              }}
            >
              <Text style={styles.externalEscapeBtnText}>{t("mediaPicker.openInApp", { label: externalPlatform.label })}</Text>
            </TouchableOpacity>
          </View>
        ) : webBrowsing ? (
          // Kullanici: "Google sayfasının üstünde bunu görmek istemiyorum",
          // "Bak ravede nasıl" - gezinme BASLAYINCA adres cubugu/geri-ileri
          // TAMAMEN kalkar, youtube/external modlarindaki AYNI sade gorunum:
          // sadece tam ekran GERCEK sayfa + "Bu Sayfayı Seç".
          <View style={styles.browserWebviewWrap}>
            <WebView
              ref={webViewRef}
              source={{ uri: webCurrentUrl! }}
              style={styles.webview}
              onNavigationStateChange={handleWebNavChange}
              javaScriptEnabled
              domStorageEnabled
            />
            <TouchableOpacity style={styles.selectPageBtn} onPress={handleWebSelectCurrentPage}>
              <Text style={styles.selectPageBtnText}>{t("mediaPicker.selectThisPage")}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.browserContainer}>
            <View style={styles.browserEmptyState}>
              <Globe size={99} color={theme.textMuted} strokeWidth={1.5} />
              <View style={styles.addressBarPill}>
                <Icon name="search" size={18} color="#6B7280" />
                <TextInput
                  style={styles.addressBarInput}
                  placeholder={t("friends.searchPlaceholder")}
                  placeholderTextColor="#6B7280"
                  value={webUrlInput}
                  onChangeText={setWebUrlInput}
                  onSubmitEditing={handleWebGo}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  returnKeyType="go"
                  selectTextOnFocus
                  autoFocus
                />
              </View>
              {error && <Text style={[styles.error, styles.browserError]}>{error}</Text>}
            </View>
          </View>
        )}
      </View>
  );

  if (embedded) return content;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleClose} statusBarTranslucent>
      {content}
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
  // Kullanici: "Üstbarın yüksekliğini arttırıp biraz geri ikonunu aşağı
  // kaydırsan gönderi oluştur ekranı gibi" - SADECE platform ALT
  // ekranlarinda (YouTube/Web/Netflix/vb., mode !== "grid") uygulanir, ana
  // platform secme ekraninin KENDISI (grid) kullanici "ben platform
  // ekranlarindan bahsediyorum" diyerek bunun DISINDA tuttu. UserProfileScreen.tsx'teki
  // "Gönderi Oluştur" basligiyla (composerHeaderRow) AYNI ek dikey bosluk.
  topBarTall: { paddingTop: 14, paddingBottom: 14, marginBottom: 6 },
  backButton: { width: 38, height: 38, justifyContent: "center", alignItems: "center" },
  // topBar "flex-end" (alttan hizali) - ama geri ikonu kendi 38x38 kutusunun
  // icinde tabanindan boslukluyken logo PNG'sindeki "LUNA" yazisi kendi
  // kutusunun neredeyse tabanina kadar uzaniyor - kutular alttan hizlansa
  // bile yazi daha asagida GORUNUYORDU (piksel olculdu). marginBottom bunu
  // yukari kaydirip gercek GORSEL tabanlari esitliyor.
  searchBarBorder: {
    borderRadius: 27,
    padding: 2,
    marginBottom: 24,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    height: 48,
    borderRadius: 26,
    paddingHorizontal: 18,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 15,
    paddingVertical: 0,
    includeFontPadding: false,
    outlineWidth: 0,
    outlineStyle: "none",
  } as any,
  gridScreen: { flex: 1, marginTop: -20, marginHorizontal: -20 },
  gridInset: { paddingHorizontal: 20 },
  list: { flexDirection: "row", flexWrap: "wrap" },
  playlistTabBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 6,
    paddingBottom: 6,
  },
  playlistTabDivider: { height: 1 },
  playlistTabBtn: { padding: 6 },
  playlistContent: { paddingTop: 4, paddingBottom: 24 },
  playlistVideoCard: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingVertical: 10 },
  playlistVideoThumb: {
    width: 150,
    aspectRatio: 16 / 9,
    borderRadius: 8,
    backgroundColor: "#0D0D0D",
    borderWidth: 1,
    borderColor: "#1C1C1C",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  playlistVideoThumbImage: { width: "100%", height: "100%" },
  playlistVideoInfo: { flex: 1, minWidth: 0, marginTop: 10 },
  playlistVideoTitleRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  playlistVideoTitle: { color: "#F5F0E6", fontSize: 13, fontWeight: "600", flexShrink: 1 },
  playlistVideoPlatformRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  playlistVideoPlatformText: { color: "#9A8F80", fontSize: 11, fontWeight: "700" },
  playlistVideoMeta: { color: "#9A8F80", fontSize: 11, fontWeight: "700", marginTop: 2 },
  playlistVideoDivider: { height: 1, backgroundColor: "#141414", marginVertical: 4, marginHorizontal: -20 },
  playlistMenuAnchor: { position: "relative" },
  playlistMenuPopup: {
    position: "absolute",
    top: "100%",
    right: 0,
    marginTop: 8,
    backgroundColor: "#15202B",
    borderRadius: 14,
    paddingVertical: 4,
    minWidth: 190,
    zIndex: 10,
    overflow: "hidden",
  },
  // Muzik sekmesi ikonu EKRANIN SOLUNA yakin dursun diye - sag kenara
  // yaslanan playlistMenuPopup burada EKRAN DISINA taserdi, bu yuzden
  // soldan hizalanan ayri bir varyant.
  playlistMenuPopupLeft: {
    position: "absolute",
    top: "100%",
    left: 0,
    marginTop: 8,
    backgroundColor: "#15202B",
    borderRadius: 14,
    paddingVertical: 4,
    minWidth: 190,
    zIndex: 10,
    overflow: "hidden",
  },
  // Dizi/Film sekmesi tam ORTADA - kutusu da ekranin tam ortasina gelsin diye
  // (Muzik solda/Bos sagda duran kutularla GORSEL OLARAK dengeli dursun).
  playlistMenuPopupCenter: {
    position: "absolute",
    top: "100%",
    left: "50%",
    marginLeft: -95,
    marginTop: 8,
    backgroundColor: "#15202B",
    borderRadius: 14,
    paddingVertical: 4,
    minWidth: 190,
    zIndex: 10,
    overflow: "hidden",
  },
  playlistMenuRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginHorizontal: 6,
    borderRadius: 12,
  },
  playlistMenuRowText: { color: "#FFFFFF", fontSize: 14, fontWeight: "600" },
  listItem: { width: "33.333%", paddingHorizontal: 1 },
  listItemLogo: {
    aspectRatio: 2,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
    padding: 10,
  },
  listItemLogoImage: { width: "100%", height: "100%" },
  webLogoRow: { flexDirection: "row", alignItems: "center", gap: 9 },
  webLogoIcon: { width: 32, height: 32 },
  webLogoTextImage: { width: 55, height: 17 },
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
  // Kullanici: "tam profesyonel bir mini tarayıcı olmalı" - gercek bir
  // mobil tarayicinin (Chrome/Safari) ust cubugunu taklit eden adres
  // cubugu + geri/ileri/yenile + ilerleme cubugu + canli WebView.
  browserContainer: { flex: 1, marginTop: 4 },
  // Kullanici: "Search çubuğunu beyaz yap ve yüksekliğini arttır sonra
  // dünya ikonunun altına koy" - artik ayri bir ust satir DEGIL, karsilama
  // ekranindaki buyuk dunya ikonunun HEMEN altinda, kendi genisligini
  // ebeveyninden (browserEmptyState) alan beyaz/yuksek bir cubuk.
  addressBarPill: {
    alignSelf: "stretch",
    // Kullanici: "Bu search çubuğunun genişliği discover ekranındakiyle
    // aynı olsun" - DiscoverScreen.tsx'teki arama cubugu (searchBarBorder)
    // ekranin GERCEK kenarindan 16px bosluklu; burada ekran (screen
    // padding:20) + browserEmptyState (paddingHorizontal:32) toplam 52px
    // ic bosluk biriktirdigi icin, 16px'e inmek icin -36 negatif kenar
    // boslugu gerekiyor (20+32-36=16).
    marginHorizontal: -36,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    height: 44,
    borderRadius: 22,
    paddingHorizontal: 18,
    backgroundColor: "#FFFFFF",
  },
  addressBarInput: {
    flex: 1,
    color: "#111111",
    fontSize: 15,
    paddingVertical: 0,
    includeFontPadding: false,
    outlineWidth: 0,
    outlineStyle: "none",
  } as any,
  browserError: { marginTop: 10 },
  browserEmptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 32,
    // Kullanici: "dünya ikonunu ve search çubuğunu yukarı kaydır" -
    // ortalanan icerigi yukari itmek icin alt bosluk ekleniyor.
    paddingBottom: 140,
  },
  browserWebviewWrap: { flex: 1, marginTop: 12, marginHorizontal: -20, marginBottom: -20 },
  selectPageBtn: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 16,
    backgroundColor: theme.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  selectPageBtnText: { color: "#04140D", fontWeight: "700", fontSize: 15 },
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
  externalEscapeBtn: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: 8,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  externalEscapeBtnText: { color: "#FFFFFF", fontSize: 11, fontWeight: "700" },
  error: { color: theme.danger, fontSize: 13 },
  primaryButton: { backgroundColor: theme.accent, borderRadius: 10, paddingVertical: 14, alignItems: "center" },
  primaryButtonText: { color: "#04140D", fontWeight: "700", fontSize: 16 },
});
