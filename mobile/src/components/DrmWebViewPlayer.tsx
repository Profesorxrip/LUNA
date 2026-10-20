import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from "react";
import { StyleSheet, View, ActivityIndicator, Text, TouchableOpacity } from "react-native";
import { WebView, WebViewMessageEvent } from "react-native-webview";
import { theme } from "../theme";
import { openPlatformApp, platformForUrl } from "../utils/media";

export interface DrmWebViewPlayerHandle {
  play: () => void;
  pause: () => void;
  seekTo: (seconds: number) => void;
  loadVideo: (url: string, startSeconds?: number) => void;
  getCurrentTime: () => number;
  // Bu oynaticida anlamsiz (gercek ses/kalite/altyazi kontrolu Netflix'in
  // KENDI arayuzunde, bizim erisemedigimiz bir yerde) - MediaPlayer.tsx'in
  // ortak arayuzunu bozmamak icin no-op olarak duruyorlar.
  setVolume: (volume: number) => void;
  setPlaybackRate: (rate: number) => void;
  setSubtitlesEnabled: (enabled: boolean) => void;
  setDubTrack: (index: number) => void;
}

interface Props {
  url: string | null;
  // Kacis kapisi butonunda ("↗ Netflix'de aç") gosterilir.
  label?: string;
  onStateChange?: (isPlaying: boolean, currentTime: number) => void;
  onBuffering?: (isBuffering: boolean) => void;
  onDuration?: (seconds: number) => void;
  onEnded?: () => void;
  // Host, uygulama ICI tarayicida Netflix/Disney+ vb. icinde BASKA bir
  // basliga/filme gecince (orn. anasayfadan bir diziye tiklayinca) URL
  // degisir - bunu RoomScreen'e bildiriyoruz ki yeni "source.url" sunucuya
  // gonderilsin ve TAKIPCILERIN kendi WebView'i de ayni sayfaya gitsin
  // (bkz. RoomScreen.tsx appliedSourceUrlRef - syncable oldugu icin source
  // degisince otomatik loadVideo() cagrilir).
  onUrlChange?: (url: string) => void;
  fullscreen?: boolean;
}

// Masaustu tarayici eklentimizdeki (extension/src/content.js) AYNI teknik:
// sayfadaki GERCEK <video> etiketini bulup oynat/durdur/saniye bilgisini
// yakalamak. Fark: orada bir Socket.IO baglantisi WebView'in kendi
// JS'inin icinde tutuluyordu (ayri bir tarayici sekmesi oldugu icin) -
// burada ise React Native tarafi ZATEN bir soket tutuyor (services/socket.ts),
// bu yuzden enjekte edilen script sadece postMessage ile DISARI bildiriyor/
// disaridan gelen komutlari uyguluyor, kendi agini kurmuyor.
// UA string'i "userAgent" prop'uyla degistirmek SADECE navigator.userAgent VE
// HTTP User-Agent basligini degistiriyor - navigator.userAgentData (Client
// Hints) bu degisiklige dahil DEGIL, cunku onu tarayici motorunun KENDISI
// (gercek Chromium surumune gore) dolduruyor. Bir site UA string'ine "Android
// Chrome 131" yazsa bile userAgentData tutarsiz/eksikse (orn. WebView'in
// kendi kimligini belli etmesi) bu bir "gommulu WebView" sinyali olarak
// algilanip bot/cihaz korumasina (Netflix'in "uygulamayi indir" engeli gibi)
// takilabiliyor - Google'in kendi WebView belgeleri bunun GERCEKTEN boyle
// kontrol edildigini dogruluyor. Bu yuzden UA string'iyle TUTARLI bir
// userAgentData nesnesini de JS tarafinda taklit ediyoruz (HTTP Client Hints
// basliklarini native kod olmadan degistiremiyoruz ama cogu tespit scripti
// once bu JS nesnesine bakiyor).
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
// biner). Bu yuzden bu karta BENZEYEN (bilinen Turkce/Ingilizce metinleri
// iceren, ekranin buyuk kismini kaplayan sabit/mutlak konumlu) bir eleman
// bulursak gizleyip altinda gercek bir <video> olusuyor mu diye devam
// ediyoruz - deneysel bir sezgisel yontem, Netflix'in GERCEK DOM yapisini
// bu sandbox'tan goremedigimiz icin kesin degil, cihazda test edilmeli.
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

const INJECTED_JS = `
${USER_AGENT_DATA_PATCH_JS}
${APP_PROMO_DISMISS_JS}
(function () {
  if (window.__lunaInstalled) return;
  window.__lunaInstalled = true;

  function post(msg) {
    window.ReactNativeWebView.postMessage(JSON.stringify(msg));
  }

  var video = null;
  var heartbeatTimer = null;

  function attach(v) {
    if (v === video) return;
    video = v;
    video.addEventListener("play", emitState);
    video.addEventListener("pause", emitState);
    video.addEventListener("seeked", emitState);
    video.addEventListener("ended", function () { post({ type: "ended" }); });
    video.addEventListener("loadedmetadata", function () {
      if (isFinite(video.duration)) post({ type: "duration", seconds: video.duration });
    });
    video.addEventListener("waiting", function () { post({ type: "buffering", isBuffering: true }); });
    video.addEventListener("playing", function () { post({ type: "buffering", isBuffering: false }); });
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = setInterval(function () {
      if (!video.paused) emitState();
    }, 2000);
    emitState();
  }

  function emitState() {
    if (!video) return;
    post({ type: "state", isPlaying: !video.paused && !video.ended, currentTime: video.currentTime });
  }

  function scan() {
    var found = document.querySelector("video");
    if (found) attach(found);
  }
  scan();
  new MutationObserver(function () { scan(); }).observe(document.body || document.documentElement, {
    childList: true,
    subtree: true,
  });

  var lastUrl = location.href;
  setInterval(function () {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      post({ type: "urlChange", url: location.href });
    }
  }, 1000);

  // RN tarafindan "window.postMessage" ile gonderilen uzaktan komutlari
  // uygula (play/pause/seek) - bkz. asagidaki injectJavaScript cagrilari.
  document.addEventListener("message", onRNMessage); // Android
  window.addEventListener("message", onRNMessage); // iOS
  function onRNMessage(e) {
    try {
      var cmd = JSON.parse(e.data);
      if (!video) return;
      if (cmd.type === "play") video.play().catch(function () {});
      else if (cmd.type === "pause") video.pause();
      else if (cmd.type === "seek") video.currentTime = cmd.seconds;
    } catch (err) {}
  }

  post({ type: "ready" });
  true;
})();
`;

/** Netflix/Disney+/Prime Video/HBO Max gibi DRM'li platformlar icin -
 * KENDI uygulama hesabina degil, uygulama ICINDEKI bu WebView'e (Rave'in
 * de yaptigi gibi, bkz. extension/README tartismasi) actigimiz icin video
 * GERCEKTEN bizim erisebildigimiz bir <video> etiketi olarak var olur ve
 * oynat/durdur/saniye bilgisini (DRM'e hic dokunmadan) yakalayip
 * paylasabiliriz - digerleri AYNI senkron protokolunu (playback:update)
 * masaustu tarayici eklentisiyle birebir paylasir. */
const DrmWebViewPlayer = forwardRef<DrmWebViewPlayerHandle, Props>(
  ({ url, label, onStateChange, onBuffering, onDuration, onEnded, onUrlChange, fullscreen }, ref) => {
    const webviewRef = useRef<WebView>(null);
    const [loading, setLoading] = useState(true);
    // HlsPlayer.tsx'teki AYNI kural: "url" prop'u degisince WebView'i
    // KENDILIGINDEN yeniden yonlendirmiyoruz - bunu yapan tek yer asagidaki
    // imperative loadVideo() metodu, aksi halde prop-degisimi efekti ile
    // dogrudan loadVideo() cagrisi AYNI ANDA iki ayri navigasyon baslatip
    // birbirini yarisirdi. "currentUri" SADECE loadVideo() ile degisir.
    const [currentUri, setCurrentUri] = useState(url);
    const lastKnownRef = useRef({ isPlaying: false, currentTime: 0, updatedAtMs: Date.now() });
    // loadVideo(url, startSeconds) cagrildiginda video HENUZ yok (sayfa
    // daha yeni yonlendi) - bu yuzden hedef saniyeyi burada bekletip, video
    // GERCEKTEN ortaya cikip ilk "state" mesaji gelince uyguluyoruz.
    const pendingSeekRef = useRef<number | null>(null);
    const callbacksRef = useRef({ onStateChange, onBuffering, onDuration, onEnded, onUrlChange });
    callbacksRef.current = { onStateChange, onBuffering, onDuration, onEnded, onUrlChange };

    function sendCommand(cmd: object) {
      const js = `window.postMessage(${JSON.stringify(JSON.stringify(cmd))}, "*"); true;`;
      webviewRef.current?.injectJavaScript(js);
    }

    function handleMessage(e: WebViewMessageEvent) {
      let msg: any;
      try {
        msg = JSON.parse(e.nativeEvent.data);
      } catch {
        return;
      }
      if (msg.type === "ready") {
        setLoading(false);
      } else if (msg.type === "state") {
        if (pendingSeekRef.current !== null) {
          const target = pendingSeekRef.current;
          pendingSeekRef.current = null;
          sendCommand({ type: "seek", seconds: target });
          lastKnownRef.current = { isPlaying: msg.isPlaying, currentTime: target, updatedAtMs: Date.now() };
          return;
        }
        lastKnownRef.current = { isPlaying: msg.isPlaying, currentTime: msg.currentTime, updatedAtMs: Date.now() };
        callbacksRef.current.onStateChange?.(msg.isPlaying, msg.currentTime);
      } else if (msg.type === "buffering") {
        callbacksRef.current.onBuffering?.(msg.isBuffering);
      } else if (msg.type === "duration") {
        callbacksRef.current.onDuration?.(msg.seconds);
      } else if (msg.type === "ended") {
        callbacksRef.current.onEnded?.();
      } else if (msg.type === "urlChange") {
        callbacksRef.current.onUrlChange?.(msg.url);
      }
    }

    useImperativeHandle(ref, () => ({
      play: () => sendCommand({ type: "play" }),
      pause: () => sendCommand({ type: "pause" }),
      seekTo: (seconds: number) => {
        lastKnownRef.current = { ...lastKnownRef.current, currentTime: seconds, updatedAtMs: Date.now() };
        sendCommand({ type: "seek", seconds });
      },
      loadVideo: (nextUrl: string, startSeconds?: number) => {
        if (nextUrl === currentUri) return;
        setLoading(true);
        lastKnownRef.current = { isPlaying: false, currentTime: startSeconds || 0, updatedAtMs: Date.now() };
        pendingSeekRef.current = startSeconds || null;
        setCurrentUri(nextUrl);
      },
      // WebView'den gelen son durumu (oynatiliyor/durduruldu + o andaki
      // saniye) her "state" mesajinda onbelleklyoruz - RoomScreen'in surukleme
      // (drift) kontrolu her birkac saniyede bir bunu sorguladigi icin,
      // HER cagriya WebView icine gidip gelen bir round-trip yaptirmak
      // yerine, oynatiliyorsa gecen sureyi EKLEYEREK aninda tahmin donuyoruz
      // (sunucunun kendi currentPlaybackPosition'iyla AYNI yontem).
      getCurrentTime: () => {
        const last = lastKnownRef.current;
        if (!last.isPlaying) return last.currentTime;
        return last.currentTime + (Date.now() - last.updatedAtMs) / 1000;
      },
      setVolume: () => {},
      setPlaybackRate: () => {},
      setSubtitlesEnabled: () => {},
      setDubTrack: () => {},
    }));

    // "source" nesnesi satir icinde yazilsaydi (source={{uri:currentUri}})
    // RoomScreen'in HER yeniden render'inda (orn. host'un birkac saniyede
    // bir pozisyon bildirdigi kalp atisi) YENI bir nesne olusur, react-
    // native-webview bunu "kaynak degisti" sanip sayfayi BASTAN yukler -
    // YouTubePlayer.tsx'te ayni sebeple videonun basa sarmasina yol acan
    // AYNI hata. useMemo ile sadece currentUri GERCEKTEN degisince yeni
    // nesne olusturuyoruz. (Erken "return null"dan ONCE cagirilmali - React
    // hook kurali: hook cagrilari sartli olamaz.)
    const source = useMemo(() => (currentUri ? { uri: currentUri } : null), [currentUri]);

    if (!currentUri || !source) return null;

    return (
      <View style={[styles.container, fullscreen && styles.containerFullscreen]}>
        <WebView
          ref={webviewRef}
          source={source}
          injectedJavaScriptBeforeContentLoaded={INJECTED_JS}
          onMessage={handleMessage}
          javaScriptEnabled
          domStorageEnabled
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          // Netflix/Disney+ gibi platformlar varsayilan WebView kimligini
          // "desteklenmeyen tarayici" diye reddedip siteyi hic ACMAYABILIYOR
          // (bot/cihaz korumasi) - gercek bir Android Chrome gibi gorunmek bu
          // ilk engeli asma ihtimalini artirir. MASAUSTU (Windows) DEGIL,
          // Android Chrome kullaniyoruz: cihaz GERCEKTEN Android oldugu icin
          // Netflix'in web oynaticisi platformu Windows sanirsa masaustune
          // ozel bir Widevine saglamlik (robustness) seviyesi ister, bu da
          // Android WebView'in GERCEKTE sagladigi mobil seviyeyle uyusmayip
          // videonun sonsuza kadar "yukleniyor" kalmasina yol acabiliyor -
          // kullanici kendi hesabiyla girip Netflix'in NATIVE uygulamasi ayni
          // cihazda sorunsuz oynatirken bile.
          userAgent="Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36"
          // Android'de VARSAYILAN false - kapaliyken Netflix/Disney+ gibi
          // DRM'li (Widevine) video sonsuza kadar "yukleniyor" kalirdi,
          // cunku WebView'in kendisi lisans isteginde bulunmaya/izin vermeye
          // yetkili DEGILDI (kullanicinin kendi hesabiyla girip VIDEOYA
          // basmasina ragmen oynatma hic baslamiyordu - bkz. react-native-
          // webview'in android/.../RNCWebChromeClient.java
          // onPermissionRequest'i, RESOURCE_PROTECTED_MEDIA_ID sadece bu
          // bayrak acikken otomatik veriliyor). Sadece Android'de etkili
          // (iOS'ta WKWebView DRM'i farkli ele aliyor, bu prop @platform
          // android olarak belgeleniyor).
          allowsProtectedMedia
          style={styles.webview}
        />
        {loading && (
          <View style={styles.loadingOverlay} pointerEvents="none">
            <ActivityIndicator color={theme.accent} size="large" />
          </View>
        )}
        {/* Kacis kapisi: WebView'de giris/oynatma sorun cikarirsa platformun
            KENDI uygulamasinda/tarayicida acabilsin - senkron o zaman durur,
            sohbet/sesli sohbet yine de acik kalir. */}
        <TouchableOpacity
          style={styles.openExternalBtn}
          onPress={() => openPlatformApp(platformForUrl(currentUri) || { url: currentUri })}
        >
          <Text style={styles.openExternalBtnText}>↗ {label || "Harici"}'de aç</Text>
        </TouchableOpacity>
      </View>
    );
  }
);

export default DrmWebViewPlayer;

const styles = StyleSheet.create({
  // flex:1 - genislik/aspectRatio hesabina GUVENMIYORUZ artik, parent
  // (mediaSection) zaten kesin piksel 16:9 boyutunda (bkz. RoomScreen.tsx) -
  // bu kutu sadece onu doldursun yeter.
  container: { flex: 1, backgroundColor: "#000" },
  containerFullscreen: { flex: 1 },
  webview: { flex: 1, backgroundColor: "#000" },
  loadingOverlay: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center" },
  // "bottom" DEGIL "top" - altta RoomScreen'in kendi NowPlayingBar'i
  // (kucuk "simdi oynatiliyor" karti) videonun alt kismiyla ORTUSUYOR,
  // bu butonu orada koyarsak o kartin ALTINDA kalip gorunmezdi.
  openExternalBtn: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: 8,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  openExternalBtnText: { color: "#FFFFFF", fontSize: 11, fontWeight: "700" },
});
