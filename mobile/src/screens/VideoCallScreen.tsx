import React, { useEffect, useRef, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Animated, PanResponder, useWindowDimensions, Platform, ScrollView } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useTranslation } from "react-i18next";
import { CameraView, useCameraPermissions, type CameraType } from "expo-camera";
import { useVideoPlayer, VideoView } from "expo-video";
import { Cast, MoreVertical, Phone, Minimize2, Bluetooth, Monitor, AppWindow } from "lucide-react-native";
import { Ionicons } from "@expo/vector-icons";
import { MicrophoneIcon as MicrophoneOutline } from "react-native-heroicons/outline";
import { VideoIcon as AppVideoIcon, VideoOffIcon as AppVideoOffIcon } from "../components/CustomIcons";
import { theme } from "../theme";
import Avatar from "../components/Avatar";
import AppBackground from "../components/AppBackground";
import Icon from "../components/Icon";
import { showAlert } from "../components/CustomAlert";
import CallMoreOptionsSheet from "../components/CallMoreOptionsSheet";
import { useConnectionQuality } from "../hooks/useConnectionQuality";
import { formatElapsed } from "./VoiceCallScreen";
import type { DMPeer } from "./DMScreen";
import type { CallEngineApi } from "../hooks/useCallEngine";

interface Props {
  peer: DMPeer;
  peerAvatarUrl: string | null;
  onEnd: () => void;
  onMinimize?: () => void;
  onStateChange?: (connected: boolean, elapsedSeconds: number) => void;
  muted?: boolean;
  onToggleMute?: () => void;
  speakerOn?: boolean;
  onToggleSpeaker?: () => void;
  onAddCall?: () => void;
  // Cihaza baglı GERCEK bir bluetooth ses cihazi var mi - bu bilgiyi
  // Expo/React Native'den gercekten okuyacak bir API yok (ozel bir native
  // modul gerekir), bu yuzden disaridan VERILMESI gerekiyor (bkz.
  // __DevHarness.tsx). Verilmezse (varsayilan false) Hoparlor butonu eski
  // basit ac/kapa davranisina doner - secim kutusu HIC acilmaz.
  bluetoothAvailable?: boolean;
  // Kameram kapaliyken kutuda/tam ekranda gri ikon yerine KENDI profil
  // fotografimi gostermek icin - verilmezse (ya da yuklenemezse) eski ikon
  // yedek olarak kalir.
  myAvatarUrl?: string | null;
  myName?: string;
  // Karsi taraf su an GERCEKTEN ekran paylasiyor mu - sunucu/sinyal
  // tarafinda boyle bir bilgi akisi olmadigi icin (bkz. dosya basindaki
  // mockup aciklamasi) bu da disaridan verilmesi gereken SIMULE bir durum
  // (bkz. __DevHarness.tsx).
  peerSharingScreen?: boolean;
  // Karsi taraf TELEFONDAN mi (dikey) yoksa bilgisayardan mi (yatay)
  // paylasiyor - bu da gercek sinyal olmadigi icin SIMULE bir deger (bkz.
  // yukaridaki peerSharingScreen aciklamasi). Varsayilan false = yatay/PC.
  peerSharingScreenVertical?: boolean;
  // Verilirse (en az 1 elemanli), ekran bu dosyadaki normal 1'e 1 (buyuk
  // sahne + surukelenebilir kucuk kutu) duzeni yerine asagidaki
  // GroupCallGrid'e gecer - "Arama Ekle" ile kisi eklenince kullanilir. BEN
  // DISINDAKI TUM katilimcilar (orijinal "peer" DAHIL) burada gelir - yani
  // tek elemanli bir dizi "ben + peer" (2 kisilik) grid gorunumu demektir.
  // Peer screen-share mockup'i, baglanti kalitesi paneli gibi 1'e 1'e ozel
  // ozellikler bu modda SADE tutuluyor (ilk versiyon) - bkz. GroupCallGrid.
  participants?: GroupParticipant[];
  // GERCEK arama motoruyla (bkz. useCallEngine.ts + CallEngineContext.tsx)
  // baglanti durumu/akislar - SADECE RootNavigator.tsx'teki gercek
  // VideoCallRoute'tan verilir. Verilmezse (bkz. __DevHarness.tsx'teki saf
  // GORSEL/stil testleri) ekran eski mockup davranisina doner.
  realCall?: CallEngineApi;
}

export interface GroupParticipant {
  userId: string;
  name: string;
  avatarUrl?: string | null;
}

type Corner = "top-left" | "top-right" | "bottom-left" | "bottom-right";

// Karsi tarafin GERCEK ekranini alamiyoruz (bkz. peerSharingScreen aciklamasi
// - sunucu tarafinda boyle bir sinyal yok), bu yuzden mockup'i statik bir
// ikon yerine, gercekten oynayan (donguye alinmis, sessiz) ornek bir "ekran
// icerigi" videosuyla gosteriyoruz - ayni kendi kameramizda oldugu gibi
// GERCEKTEN hareket eden bir goruntu, sadece KAYNAK karsi tarafin gercek
// ekrani degil, yerel bir ornek video.
const PEER_SCREEN_SHARE_DEMO_VIDEO = require("../../assets/videos/peer_screen_share_demo.mp4");
// Karsi taraf TELEFONDAN paylasiyorsa ekran yatay degil DIKEY bir dikdortgen
// olur (bkz. peerSharingScreenVertical) - bu yuzden ayri, dikey orani (bir
// sohbet uygulamasi gorunumu) olan ikinci bir ornek video.
const PEER_SCREEN_SHARE_DEMO_VIDEO_VERTICAL = require("../../assets/videos/peer_screen_share_demo_portrait.mp4");
// Ornek videolarin GERCEK en/boy oranlari (bkz. assets/videos) - kucuk kutu,
// karsi tarafin paylastigi ekran icindeyken bu oranlara gore YENIDEN
// boyutlanip (bkz. asagidaki getPeerShareBoxSize) goruntu kutuya TAM
// sigsin diye kullaniliyor.
const PEER_SHARE_HORIZONTAL_ASPECT = 640 / 360;
const PEER_SHARE_VERTICAL_ASPECT = 390 / 844;

const BOX_EDGE_MARGIN = 18;
// Kontroller acikken kutunun ust/alt cubuklara DEGMEMESI icin birakilan bosluk
// (ust cubugun kendi yuksekligi + alt kontrol satirinin yuksekligi kadar) -
// kontroller gizliyken cok daha kucuk bir guvenlik bosluguna dusuyor.
const BOX_TOP_SAFE_EXPANDED = 112;
const BOX_TOP_SAFE_COMPACT = 45;
const BOX_BOTTOM_SAFE_EXPANDED = 145;
const BOX_BOTTOM_SAFE_COMPACT = 24;

/** Dort kosenin, o anki ekran boyutuna ve kontrollerin acik/kapali olusuna
 * gore GERCEK piksel konumunu hesaplar - kutu surukleyip birakildiginda
 * (ya da kontroller acilip kapandiginda) hep BU fonksiyonun dondurdugu
 * noktaya yumusak bir sekilde kayar (bkz. asagidaki useEffect). */
function cornerToXY(
  corner: Corner,
  controlsVisible: boolean,
  screenW: number,
  screenH: number,
  boxW: number = SELF_CAMERA_WIDTH,
  boxH: number = SELF_CAMERA_HEIGHT
) {
  const top = controlsVisible ? BOX_TOP_SAFE_EXPANDED : BOX_TOP_SAFE_COMPACT;
  const bottomSafe = controlsVisible ? BOX_BOTTOM_SAFE_EXPANDED : BOX_BOTTOM_SAFE_COMPACT;
  const left = BOX_EDGE_MARGIN;
  const right = screenW - BOX_EDGE_MARGIN - boxW;
  const bottom = screenH - boxH - bottomSafe;
  switch (corner) {
    case "top-left":
      return { x: left, y: top };
    case "top-right":
      return { x: right, y: top };
    case "bottom-left":
      return { x: left, y: bottom };
    case "bottom-right":
      return { x: right, y: bottom };
  }
}

/** Kucuk kutu, karsi tarafin paylastigi ekrani gosterirken bu boyuta gecer -
 * goruntu kenarlarinda BOSLUK KALMASIN (hicbir "contain" harcanmasin) diye
 * kutunun kendisi goruntunun GERCEK oranina gore yeniden sekilleniyor:
 * - DIKEY (telefon) paylasimda GENISLIK sabit kalir (varsayilan kutu
 *   genisligiyle AYNI), yukseklik bu orana gore hesaplanir.
 * - YATAY (PC) paylasimda ise kutu "yatay cevrilir" - bu kez YUKSEKLIK
 *   sabit kalir (varsayilan genislik kadar), genislik bu orana gore
 *   hesaplanir - boylece goruntu HER IKI durumda da kutuya tam sigar. */
// GERCEK aramada (web) "Hoparlor" menusunu tarayicinin KENDI bildigi ses
// cikisi cihazlariyla (enumerateDevices) doldurur - Bluetooth eslenmisse
// (ve kullanici izin verdiyse, etiket bos gelmez) O DA listede gercekten
// gorunur, ayri/simule bir "bluetoothAvailable" bayragina gerek kalmadan.
function buildRealOutputOptions(audioOutputs: MediaDeviceInfo[]) {
  return audioOutputs.map((d) => ({
    key: d.deviceId,
    label: d.label || "Ses çıkışı",
    renderIcon: (c: string) =>
      /bluetooth/i.test(d.label) ? <Bluetooth size={18} color={c} /> : <Icon name="sesAcik1" size={18} color={c} />,
  }));
}

function getPeerShareBoxSize(vertical: boolean) {
  if (vertical) {
    return { w: SELF_CAMERA_WIDTH, h: Math.round(SELF_CAMERA_WIDTH / PEER_SHARE_VERTICAL_ASPECT) };
  }
  return { w: Math.round(SELF_CAMERA_WIDTH * PEER_SHARE_HORIZONTAL_ASPECT), h: SELF_CAMERA_WIDTH };
}

/** "Paylaş" ile GERCEKTEN yakalanan ekran/pencere akisini gosterir -
 * CameraView'in karsiligi yok (expo-camera ekran yakalamiyor), bu yuzden
 * web'de tarayicinin kendi <video> elementine duz DOM erisimiyle (web
 * disinda hic render edilmez - bkz. startSharing'teki Platform.OS kontrolu). */
function ScreenShareVideo({ stream }: { stream: MediaStream }) {
  const videoRef = useRef<any>(null);
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.srcObject = stream;
    el.play?.().catch(() => {});
  }, [stream]);
  if (Platform.OS !== "web") return null;
  return React.createElement("video", {
    ref: videoRef,
    autoPlay: true,
    muted: true,
    playsInline: true,
    style: { width: "100%", height: "100%", objectFit: "contain", backgroundColor: "#000000" },
  });
}

/** Karsi taraftan gelen GERCEK video+ses akisini gosterir/calar - GERCEK
 * aramada (bkz. realCall prop'u, useCallEngine.ts) remoteStage'deki sahte
 * avatarin YERINE gecer. ScreenShareVideo ile ayni web-only <video> DOM
 * deseni, SADECE "muted" burada FALSE: karsi tarafi GERCEKTEN duymamiz
 * gerekiyor (ScreenShareVideo kendi EKRAN PAYLASIMINI sessize alir, bu ise
 * KARSI TARAFIN kamerasi+mikrofonu). */
function RemoteCallVideo({
  stream,
  fit = "cover",
  realCall,
}: {
  stream: MediaStream;
  fit?: "cover" | "contain";
  realCall?: CallEngineApi;
}) {
  const videoRef = useRef<any>(null);
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.srcObject = stream;
    el.play?.().catch(() => {});
    // Secili ses cikisi (hoparlor/kulaklik/Bluetooth) degisince bu
    // elemana da GERCEKTEN uygulanabilsin diye motora kaydediliyor (bkz.
    // useCallEngine.ts registerMediaElement/setAudioOutputId).
    realCall?.registerMediaElement(el);
    return () => realCall?.unregisterMediaElement(el);
  }, [stream, realCall]);
  if (Platform.OS !== "web") {
    // Native: @livekit/react-native-webrtc'nin KENDI video render
    // bileseni (RTCView) - LiveKit'in SFU'su degil, ayni ham WebRTC
    // modulunun bir parcasi (bkz. useCallEngine.ts getWebRTCGlobals
    // aciklamasi). Modul yuklenemezse (Expo Go) sessizce hicbir sey
    // gostermez - zaten "call:" olaylari da orada hic tetiklenmez.
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { RTCView } = require("@livekit/react-native-webrtc");
      return <RTCView streamURL={(stream as any).toURL?.()} objectFit={fit} style={{ width: "100%", height: "100%" }} />;
    } catch {
      return null;
    }
  }
  return React.createElement("video", {
    ref: videoRef,
    autoPlay: true,
    playsInline: true,
    style: { width: "100%", height: "100%", objectFit: fit, backgroundColor: "#000000" },
  });
}

/** Kendi kameramin GERCEK onizlemesi - expo-camera'nin AYRI bir kamera
 * erisimi ACMASI yerine, dogrudan realCall.localStream'in video track'ini
 * gosterir: boylece "ben ne goruyorsam karsi taraf da TAM OLARAK onu goruyor"
 * garanti edilir (flip/ac-kapa gercekten AYNI akisi etkiler). Sadece GORSEL
 * olarak (gonderilen veriyi DEGIL) on kamerada aynadaki gibi ters cevrilir -
 * cogu kamera uygulamasindaki tanidik "selfie" hissi icin. */
function LocalCallVideo({ stream, mirrored }: { stream: MediaStream; mirrored: boolean }) {
  const videoRef = useRef<any>(null);
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.srcObject = stream;
    el.play?.().catch(() => {});
  }, [stream]);
  if (Platform.OS !== "web") {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { RTCView } = require("@livekit/react-native-webrtc");
      return (
        <RTCView
          streamURL={(stream as any).toURL?.()}
          objectFit="cover"
          mirror={mirrored}
          style={{ width: "100%", height: "100%" }}
        />
      );
    } catch {
      return null;
    }
  }
  return React.createElement("video", {
    ref: videoRef,
    autoPlay: true,
    muted: true,
    playsInline: true,
    style: {
      width: "100%",
      height: "100%",
      objectFit: "cover",
      backgroundColor: "#000000",
      transform: mirrored ? "scaleX(-1)" : undefined,
    },
  });
}

/** Goruntulu arama ekrani - gercek bir uzak video akisi YOK (bkz.
 * VoiceCallScreen.tsx'teki ayni mockup aciklamasi: 1'e 1 DM aramalari icin
 * sunucu tarafinda gercek bir sinyal/WebRTC baglantisi yok). Bu yuzden
 * "uzak" tarafin goruntusu, gercek video uygulamalarinin kamera kapaliyken/
 * baglanirken gosterdigi haliyle AYNI mantikla, tam ekran koyu bir sahne
 * uzerinde buyuk bir avatar olarak gosteriliyor. TEK gercek parca: sag
 * ustteki kucuk kutuda expo-camera ile KENDI kameran canli (izin istenir,
 * on/arka kamera degistirilebilir) - DMScreen.tsx'teki hizli-cekim
 * akisindaki AYNI izin deseni. */
export default function VideoCallScreen({
  peer,
  peerAvatarUrl,
  onEnd,
  onMinimize,
  onStateChange,
  muted: mutedProp,
  onToggleMute,
  speakerOn: speakerOnProp,
  onToggleSpeaker,
  onAddCall,
  bluetoothAvailable = false,
  myAvatarUrl,
  myName = "",
  peerSharingScreen = false,
  peerSharingScreenVertical = false,
  participants,
  realCall,
}: Props) {
  const { t } = useTranslation();
  const [connectedMock, setConnectedMock] = useState(false);
  const connected = realCall ? realCall.phase === "connected" : connectedMock;
  // GERCEK aramada karsi tarafin ekran paylasip paylasmadigi SIMULE edilen
  // peerSharingScreen prop'undan DEGIL, sunucudan gelen gercek "call:state"
  // sinyaliyle dolan realCall.screenSharingPeers'tan okunur (bkz.
  // useCallEngine.ts). DevHarness'taki saf GORSEL testlerde (realCall yok)
  // eski prop davranisina doner.
  const effectivePeerSharingScreen = realCall ? realCall.screenSharingPeers.has(peer.userId) : peerSharingScreen;
  const [elapsed, setElapsed] = useState(0);
  const [mutedInternal, setMutedInternal] = useState(false);
  const [cameraOn, setCameraOn] = useState(true);
  const [facing, setFacing] = useState<CameraType>("front");
  const [isSelfMain, setIsSelfMain] = useState(false);
  const [speakerOnInternal, setSpeakerOnInternal] = useState(false);
  const [moreVisible, setMoreVisible] = useState(false);
  const [noiseReduction, setNoiseReduction] = useState(false);
  const [outputMenuVisible, setOutputMenuVisible] = useState(false);
  const [audioOutput, setAudioOutput] = useState<"earpiece" | "speaker" | "bluetooth">("earpiece");
  const [shareMenuVisible, setShareMenuVisible] = useState(false);
  const [isSharingScreenMock, setIsSharingScreenMock] = useState(false);
  const [screenStreamMock, setScreenStreamMock] = useState<MediaStream | null>(null);
  // GERCEK aramada ekran paylasimi realCall.startScreenShare/stopScreenShare
  // uzerinden yurutulur (bkz. useCallEngine.ts - getDisplayMedia ile alinan
  // video track TUM peer baglantilarinda kameranin YERINE gecer, karsi
  // taraf GERCEKTEN ekranimi gorur) - burasi (DevHarness'taki saf GORSEL
  // test disinda) sadece o GERCEK durumu okur.
  const isSharingScreen = realCall ? realCall.isSharingScreen : isSharingScreenMock;
  const screenStream = realCall ? realCall.localStream : screenStreamMock;
  const [controlsVisible, setControlsVisible] = useState(true);
  const [corner, setCorner] = useState<Corner>("top-right");
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const { width: screenW, height: screenH } = useWindowDimensions();
  const pan = useRef(new Animated.ValueXY(cornerToXY("top-right", true, screenW, screenH))).current;
  const draggingRef = useRef(false);
  // Kucuk kutu SADECE karsi tarafin paylastigi ekrani gosterirken (isSelfMain
  // true VE peerSharingScreen true) goruntunun GERCEK oranina gore yeniden
  // sekilleniyor (bkz. getPeerShareBoxSize) - digerlerinde (kendi kameram,
  // karsidakinin avatari) eski sabit 118x166 kutu aynen kaliyor.
  const boxShowsPeerShare = isSelfMain && effectivePeerSharingScreen;
  // GERCEK aramada paylasilan ekranin GERCEK oranini onceden bilemeyiz
  // (demo videonun aksine) - kutuyu dinamik yeniden sekillendirmek yerine
  // sabit kutu icinde "contain" ile dogru olcekleyip gosteriyoruz (bkz.
  // RemoteCallVideo kullanimi asagida).
  const { w: boxW, h: boxH } =
    boxShowsPeerShare && !realCall
      ? getPeerShareBoxSize(peerSharingScreenVertical)
      : { w: SELF_CAMERA_WIDTH, h: SELF_CAMERA_HEIGHT };
  // PanResponder asagida SADECE ILK render'da olusturulup sabitleniyor
  // (useRef deseni) - icindeki callback'ler bu yuzden kendi "closure"larina
  // degil, HER render'da guncellenen bu ref'e bakarak corner/boxW/boxH gibi
  // degerlerin GUNCEL halini okuyor (yoksa orn. kutu boyutu degisse bile
  // surukleme hesaplari eski/sabit degerlerle calisirdi).
  const liveRef = useRef({ corner, controlsVisible, screenW, screenH, boxW, boxH });
  liveRef.current = { corner, controlsVisible, screenW, screenH, boxW, boxH };
  const connectionQualityMock = useConnectionQuality(connected);
  // GERCEK aramada artik sahte ping RTT'si DEGIL, dogrudan gercek
  // RTCPeerConnection.getStats() olcumu (bkz. useCallEngine.ts
  // measureConnectionQuality) kullanilir.
  const connectionQuality = realCall ? realCall.connectionQuality : connectionQualityMock;
  // Karsi tarafin paylastigi "ekran" mockup'i - bkz. yukaridaki
  // PEER_SCREEN_SHARE_DEMO_VIDEO/_VERTICAL yorumu. loop=true + muted=true:
  // sessiz ve sonsuz donen bir ornek goruntu, gercek bir ses kaynagi
  // olmadigi icin - "muted" (volume=0 degil) sart, cunku tarayicilar
  // kullanici etkilesimi olmadan baslayan (programatik) play() cagrisini
  // SADECE video GERCEKTEN "muted" olarak isaretliyse izin veriyor, yoksa
  // play() sessizce reddedilip video donup kalıyor (bkz. bu satiri
  // tetikleyen gercek bug). Ikisi de her zaman kurulu kalir, sadece aktif
  // olan (peerSharingScreenVertical'a gore) play/pause edilir - boylece
  // yatay/dikey arasinda gecis aninda tekrar yuklenme gecikmesi olmaz.
  const peerScreenPlayerHorizontal = useVideoPlayer(PEER_SCREEN_SHARE_DEMO_VIDEO, (p) => {
    p.loop = true;
    p.muted = true;
  });
  const peerScreenPlayerVertical = useVideoPlayer(PEER_SCREEN_SHARE_DEMO_VIDEO_VERTICAL, (p) => {
    p.loop = true;
    p.muted = true;
  });
  const peerScreenPlayer = peerSharingScreenVertical ? peerScreenPlayerVertical : peerScreenPlayerHorizontal;
  useEffect(() => {
    if (!peerSharingScreen) return;
    const other = peerSharingScreenVertical ? peerScreenPlayerHorizontal : peerScreenPlayerVertical;
    other.pause();
    // isSelfMain degisince (kutuya basilinca) VideoView tam sahne <-> kucuk
    // kutu arasinda YER DEGISTIRIYOR - web'de bu, altindaki <video>
    // elementinin YENIDEN olusturulmasina yol aciyor ve o YENI eleman bir
    // an icin "muted" olarak isaretlenmeden once play() denemesi tarayici
    // tarafindan sessizce reddedilip video donup kalabiliyor. Elemanin
    // gercekten oynamaya basladigini KISA SURELI yoklayarak (max ~600ms,
    // 60ms araliklarla) garantiye aliyoruz - bkz. bu satirlari tetikleyen
    // gercek bug (kutuya gecince video donup kaliyordu).
    let cancelled = false;
    let attempts = 0;
    const tryPlay = () => {
      if (cancelled) return;
      peerScreenPlayer.play();
      attempts += 1;
      if (attempts < 10) setTimeout(tryPlay, 60);
    };
    tryPlay();
    return () => {
      cancelled = true;
    };
    // isSelfMain: kutuya basinca VideoView buyuk sahne <-> kucuk kutu arasinda
    // YER DEGISTIRIYOR (bkz. asagidaki JSX - iki ayri yerde render ediliyor,
    // tek bir yerde degil), bu da web'de ALTTAKI <video> DOM elementinin
    // yeniden mount edilmesine (bu yuzden donup kalmasina) sebep oluyor -
    // play()'i burada TEKRAR cagirmak bu remount sonrasi oynatmayi devam
    // ettiriyor (bkz. bu satiri tetikleyen gercek bug: ekran paylasimi kucuk
    // kutuya gecince video donup kaliyordu).
  }, [peerSharingScreen, peerSharingScreenVertical, isSelfMain, peerScreenPlayer, peerScreenPlayerHorizontal, peerScreenPlayerVertical]);
  const muted = mutedProp ?? mutedInternal;
  // Gercek aramada "Sessiz" yerel mikrofon track'ini GERCEKTEN kapatir/acar
  // (bkz. VoiceCallScreen.tsx'teki AYNI desen).
  const toggleMute =
    onToggleMute ??
    (() => {
      setMutedInternal((m) => {
        const next = !m;
        realCall?.localStream?.getAudioTracks().forEach((track) => {
          track.enabled = !next;
        });
        return next;
      });
    });
  const speakerOn = speakerOnProp ?? speakerOnInternal;
  const toggleSpeaker = onToggleSpeaker ?? (() => setSpeakerOnInternal((s) => !s));
  useMicNoiseSuppression(noiseReduction, muted, !!realCall);
  const endedRef = useRef(false);

  const OUTPUT_OPTIONS_MOCK = [
    { key: "earpiece" as const, label: t("dm.callOutputEarpiece"), renderIcon: (c: string) => <Phone size={18} color={c} /> },
    { key: "speaker" as const, label: t("dm.callSpeaker"), renderIcon: (c: string) => <Icon name="sesAcik1" size={18} color={c} /> },
    { key: "bluetooth" as const, label: t("dm.callOutputBluetooth"), renderIcon: (c: string) => <Bluetooth size={18} color={c} /> },
  ];
  // GERCEK aramada (web) menu tarayicinin KENDI bildigi ses cikisi
  // cihazlarini (Bluetooth DAHIL, varsa) listeler - bkz. useCallEngine.ts
  // refreshAudioOutputs/setAudioOutputId.
  const OUTPUT_OPTIONS = realCall ? buildRealOutputOptions(realCall.audioOutputs) : OUTPUT_OPTIONS_MOCK;

  const speakerButtonActive = realCall
    ? Platform.OS === "web"
      ? !!realCall.audioOutputId
      : realCall.speakerOn
    : bluetoothAvailable
      ? audioOutput !== "earpiece"
      : speakerOn;
  const showBluetoothIconOnButton = realCall
    ? Platform.OS === "web" && /bluetooth/i.test(realCall.audioOutputs.find((d) => d.deviceId === realCall.audioOutputId)?.label || "")
    : bluetoothAvailable && audioOutput === "bluetooth";

  function handleSpeakerPress() {
    if (realCall) {
      if (Platform.OS === "web") {
        realCall.refreshAudioOutputs();
        setOutputMenuVisible((v) => !v);
      } else {
        realCall.setSpeakerRoute(!realCall.speakerOn);
      }
      return;
    }
    if (bluetoothAvailable) setOutputMenuVisible((v) => !v);
    else toggleSpeaker();
  }

  const SHARE_OPTIONS = [
    { key: "screen" as const, label: t("dm.shareScreenFull"), Icon: Monitor },
    { key: "window" as const, label: t("dm.shareScreenWindow"), Icon: AppWindow },
  ];

  // Web'de (bu test ortami dahil) tarayicinin KENDI getDisplayMedia API'si
  // ile GERCEKTEN ekran/pencere yakalaniyor - CameraView'deki gercek kamera
  // erisimiyle AYNI mantik. Native (gercek telefon) derlemede bu API
  // bulunmuyor (ReplayKit/MediaProjection gibi ozel native kod gerekir,
  // Expo'da hazir bir karsiligi yok) - o yuzden orada eski GORSEL mockup'a
  // (sadece buton/durum degisimi) geri duser.
  async function startSharing(target: "screen" | "window") {
    setShareMenuVisible(false);
    if (realCall) {
      // GERCEK arama: getDisplayMedia ile alinan track TUM peer
      // baglantilarinda kameranin YERINE geciyor (bkz. useCallEngine.ts
      // startScreenShare) - karsi taraf GERCEKTEN ekranimi goruyor.
      await realCall.startScreenShare(target);
      return;
    }
    const mediaDevices = (globalThis as any)?.navigator?.mediaDevices;
    if (Platform.OS === "web" && mediaDevices?.getDisplayMedia) {
      try {
        const stream: MediaStream = await mediaDevices.getDisplayMedia({
          video: { displaySurface: target === "screen" ? "monitor" : "window" },
          audio: false,
        });
        stream.getVideoTracks()[0]?.addEventListener("ended", () => {
          setScreenStreamMock(null);
          setIsSharingScreenMock(false);
        });
        setScreenStreamMock(stream);
        setIsSharingScreenMock(true);
      } catch {
        // Kullanici tarayicinin kendi secim penceresinden vazgecti/izin
        // reddetti - sessizce hicbir sey degismez.
      }
      return;
    }
    setIsSharingScreenMock(true);
  }

  function stopSharing() {
    if (realCall) {
      realCall.stopScreenShare();
      return;
    }
    screenStreamMock?.getTracks().forEach((tr) => tr.stop());
    setScreenStreamMock(null);
    setIsSharingScreenMock(false);
  }

  function selectOutput(key: string) {
    setOutputMenuVisible(false);
    if (realCall) {
      realCall.setAudioOutputId(key);
      return;
    }
    setAudioOutput(key as "earpiece" | "speaker" | "bluetooth");
    const wantsSpeaker = key === "speaker";
    if (wantsSpeaker !== speakerOn) toggleSpeaker();
  }

  function placeholder() {
    showAlert(t("profile.comingSoon"));
  }

  // Kutu surukleniyorken degil, SADECE birakildiktan sonra ya da kontroller
  // acilip/kapanip guvenlik bosluklari degistiginde o anki koseye yumusakca
  // kayar - bkz. cornerToXY ustteki tanimi.
  useEffect(() => {
    if (draggingRef.current) return;
    const target = cornerToXY(corner, controlsVisible, screenW, screenH, boxW, boxH);
    Animated.spring(pan, { toValue: target, useNativeDriver: false, friction: 9, tension: 60 }).start();
  }, [corner, controlsVisible, screenW, screenH, boxW, boxH]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_e, gesture) => Math.abs(gesture.dx) > 3 || Math.abs(gesture.dy) > 3,
      onPanResponderGrant: () => {
        draggingRef.current = true;
      },
      onPanResponderMove: (_e, gesture) => {
        const { corner: c, controlsVisible: cv, screenW: sw, screenH: sh, boxW: bw, boxH: bh } = liveRef.current;
        const start = cornerToXY(c, cv, sw, sh, bw, bh);
        pan.setValue({ x: start.x + gesture.dx, y: start.y + gesture.dy });
      },
      onPanResponderRelease: (_e, gesture) => {
        draggingRef.current = false;
        const { corner: c, controlsVisible: cv, screenW: sw, screenH: sh, boxW: bw, boxH: bh } = liveRef.current;
        const start = cornerToXY(c, cv, sw, sh, bw, bh);
        const moved = Math.abs(gesture.dx) > 8 || Math.abs(gesture.dy) > 8;
        if (!moved) {
          // Hareket neredeyse yoksa bu bir SURUKLEME degil TIKLAMA idi -
          // ayni koseye geri yasla, benim/karsidakinin goruntusunu
          // degistir (bkz. selfCameraBox onPress mantigi).
          Animated.spring(pan, { toValue: start, useNativeDriver: false }).start();
          setIsSelfMain((v) => !v);
          return;
        }
        const finalX = start.x + gesture.dx;
        const finalY = start.y + gesture.dy;
        const centerX = finalX + bw / 2;
        const centerY = finalY + bh / 2;
        const nextCorner: Corner =
          centerX < sw / 2
            ? centerY < sh / 2
              ? "top-left"
              : "bottom-left"
            : centerY < sh / 2
              ? "top-right"
              : "bottom-right";
        setCorner(nextCorner);
        Animated.spring(pan, {
          toValue: cornerToXY(nextCorner, cv, sw, sh, bw, bh),
          useNativeDriver: false,
          friction: 9,
          tension: 60,
        }).start();
      },
    })
  ).current;

  useEffect(() => {
    // Gercek aramada baglanti durumu zaten realCall.phase'den geliyor - bu
    // sahte zamanlayici SADECE realCall verilmedigi (saf GORSEL test)
    // durumunda calisir (bkz. VoiceCallScreen.tsx'teki AYNI desen).
    if (realCall) return;
    const connectTimer = setTimeout(() => {
      if (!endedRef.current) setConnectedMock(true);
    }, 2500);
    return () => clearTimeout(connectTimer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!connected) return;
    const interval = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, [connected]);

  useEffect(() => {
    onStateChange?.(connected, elapsed);
  }, [connected, elapsed, onStateChange]);

  // Ekran kaydini/paylasimini GERCEKTEN birakmak icin - arama bitip bu
  // ekrandan cikilirken tarayicinin paylasim gostergesini acik birakmamak
  // adina stream'i mutlaka durduruyoruz. GERCEK aramada bu stream ayni
  // zamanda realCall'un yayinladigi akis oldugu icin (bkz. yukarisi) burada
  // DURDURULMAZ - onu useCallEngine.ts'teki resetAll/endCall zaten yonetir.
  useEffect(() => {
    if (realCall) return;
    return () => {
      screenStreamMock?.getTracks().forEach((tr) => tr.stop());
    };
  }, [screenStreamMock, realCall]);

  // Kontroller GORUNUR oldugunda (ekrana dokunulmasa bile) 5 saniye sonra
  // kendiliginden gizlenir - tekrar gorunur yapildiginda (bkz. yukaridaki
  // tap-to-toggle) sayac bastan baslar.
  useEffect(() => {
    if (!controlsVisible) return;
    const hideTimer = setTimeout(() => setControlsVisible(false), 5000);
    return () => clearTimeout(hideTimer);
  }, [controlsVisible]);

  async function toggleCamera() {
    if (realCall) {
      // GERCEK arama: track.enabled degisir - karsi taraf GERCEKTEN
      // siyah/durgun goruntu alir (bkz. useCallEngine.ts setCameraEnabled).
      realCall.setCameraEnabled(!realCall.cameraEnabled);
      return;
    }
    if (cameraOn) {
      setCameraOn(false);
      return;
    }
    if (!cameraPermission?.granted) {
      const res = await requestCameraPermission();
      if (!res.granted) {
        showAlert(t("dm.permissionRequiredTitle"), t("dm.cameraPermissionRequiredBody"));
        return;
      }
    }
    setCameraOn(true);
  }

  function handleEnd() {
    endedRef.current = true;
    onEnd();
  }

  // GERCEK aramada kendi kameramin GORULDUGU yer artik expo-camera'nin
  // AYRI/kendi kamera erisimi DEGIL, dogrudan realCall.localStream'in video
  // track'i (bkz. asagidaki LocalCallVideo) - boylece "gordugum = karsi
  // tarafin GERCEKTEN gordugu" garanti altina alinmis olur (ayni kamerayi
  // IKI KERE acmak yerine).
  const showSelfCamera = realCall ? realCall.cameraEnabled : cameraOn && cameraPermission?.granted;

  const flipButton = (style: object, iconSize: number) => (
    <TouchableOpacity
      style={style}
      onPress={() => (realCall ? realCall.flipCamera() : setFacing((f) => (f === "front" ? "back" : "front")))}
      hitSlop={6}
    >
      <Ionicons name="camera-reverse-outline" size={iconSize} color="#FFFFFF" />
    </TouchableOpacity>
  );

  // avatarSize - karsi tarafin avatarinin AYNI konumda gorundugu boyut
  // (kutuda 48, tam ekranda 140) - kameram kapaliyken kendi fotografim da
  // o boyutta gosterilsin diye disaridan veriliyor.
  function renderSelfCameraFeed(avatarSize: number) {
    if (showSelfCamera && realCall?.localStream) {
      return <LocalCallVideo stream={realCall.localStream} mirrored={realCall.cameraFacing === "user"} />;
    }
    if (showSelfCamera) return <CameraView style={styles.selfCameraView} facing={facing} />;
    return (
      <View style={styles.selfCameraOff}>
        {myAvatarUrl ? (
          <Avatar name={myName} avatarUrl={myAvatarUrl} size={avatarSize} ring={false} />
        ) : (
          <AppVideoOffIcon size={22} color="rgba(255,255,255,0.6)" />
        )}
      </View>
    );
  }

  // Karsi taraf ekran paylasiyorsa (bkz. yukaridaki peerSharingScreen
  // aciklamasi) onun goruntusunun oldugu yer (buyuk sahne ya da kucuk kutu)
  // avatar yerine bu "paylasilan ekran" kutusunu gosterir - compact true
  // ise kucuk kutudaki, false ise tam/buyuk sahnedeki olcu kullanilir.
  function renderPeerContent(compact: boolean) {
    if (effectivePeerSharingScreen) {
      return (
        <View style={styles.peerScreenShare}>
          {realCall ? (
            realCall.remoteStreams[peer.userId] && <RemoteCallVideo stream={realCall.remoteStreams[peer.userId]} fit="contain" realCall={realCall} />
          ) : (
            <VideoView
              style={styles.peerScreenShareVideo}
              player={peerScreenPlayer}
              contentFit="contain"
              nativeControls={false}
            />
          )}
          {!compact && controlsVisible && (
            <View style={styles.peerScreenShareLabelWrap} pointerEvents="none">
              <View style={styles.peerScreenShareLabelPill}>
                <Cast size={14} color={theme.danger} />
                <Text style={styles.peerScreenShareLabel} numberOfLines={1}>
                  {t("dm.peerSharingScreen", { name: peer.name })}
                </Text>
              </View>
            </View>
          )}
        </View>
      );
    }
    return <Avatar name={peer.name} avatarUrl={peerAvatarUrl} size={compact ? 48 : 140} ring={false} />;
  }

  // NOT: bu kontrol tum hook'lardan SONRA, ana JSX'ten HEMEN once - React'in
  // hook kurallari geregi (her render'da AYNI hook'lar AYNI sirada
  // cagrilmali) component'in EN USTUNE konulamaz, cunku "Arama Ekle" ile
  // participants prop'u SONRADAN degisebiliyor (bkz. __DevHarness.tsx).
  if (participants && participants.length > 0) {
    return (
      <GroupCallGrid
        participants={participants}
        myAvatarUrl={myAvatarUrl}
        myName={myName}
        onEnd={onEnd}
        onMinimize={onMinimize}
        onAddCall={onAddCall}
        bluetoothAvailable={bluetoothAvailable}
        realCall={realCall}
      />
    );
  }

  return (
    <View style={styles.screen}>
      <AppBackground />

      {isSelfMain && (
        <View style={styles.selfCameraFullscreen} pointerEvents="none">
          {renderSelfCameraFeed(140)}
        </View>
      )}

      {effectivePeerSharingScreen && !isSelfMain && !(isSharingScreen && screenStream) && (
        <View style={styles.peerScreenShareFullscreen} pointerEvents="none">
          {renderPeerContent(false)}
        </View>
      )}

      {isSharingScreen && screenStream && (
        <View style={styles.peerScreenShareFullscreen} pointerEvents="none">
          <ScreenShareVideo stream={screenStream} />
          {controlsVisible && (
            <View style={styles.peerScreenShareLabelWrap} pointerEvents="none">
              <View style={styles.peerScreenShareLabelPill}>
                <Cast size={14} color={theme.danger} />
                <Text style={styles.peerScreenShareLabel} numberOfLines={1}>
                  {t("dm.youAreSharing")}
                </Text>
              </View>
            </View>
          )}
        </View>
      )}

      {/* Bos alana dokununca kontrollerin gizlenip gosterilmesi - FaceTime/
          WhatsApp'taki AYNI davranis. Ekranin GERI KALANINDAN (isim/sure
          metni haric) herhangi bir yere dokunulunca tetiklenir: bu katman
          en ALTTA (AppBackground'dan hemen sonra) oldugu icin kendi
          dokunma alani olan butonlar/kutu ustunde render edilip onu
          otomatik olarak ONCELER - bkz. React Native hit-testing. */}
      <TouchableOpacity
        style={StyleSheet.absoluteFill}
        activeOpacity={1}
        onPress={() => setControlsVisible((v) => !v)}
      />

      {controlsVisible && (
        <>
          <LinearGradient colors={["rgba(0,0,0,0.65)", "transparent"]} style={styles.topScrim} pointerEvents="none" />
          <LinearGradient colors={["transparent", "rgba(0,0,0,0.82)"]} style={styles.bottomScrim} pointerEvents="none" />
        </>
      )}

      <View style={styles.topBar} pointerEvents="box-none">
        {controlsVisible && (
          <TouchableOpacity style={styles.chipButton} onPress={onMinimize ?? placeholder} hitSlop={10}>
            <Minimize2 size={30} color="#FFFFFF" />
          </TouchableOpacity>
        )}
        {controlsVisible && (
          <TouchableOpacity style={styles.topInfo} activeOpacity={1} onPress={() => {}}>
            <Text style={styles.peerNameCompact} numberOfLines={1}>
              {peer.name}
            </Text>
            <Text style={styles.statusCompact}>{connected ? formatElapsed(elapsed) : t("dm.callRinging")}</Text>
          </TouchableOpacity>
        )}
        {controlsVisible && (
          <TouchableOpacity style={styles.chipButton} onPress={() => setMoreVisible(true)}>
            <MoreVertical size={30} color="#FFFFFF" />
          </TouchableOpacity>
        )}
      </View>

      {controlsVisible && isSelfMain && showSelfCamera && flipButton(styles.flipButtonStage, 30)}

      <View style={styles.remoteStage} pointerEvents="none">
        {!isSelfMain && !effectivePeerSharingScreen && !(isSharingScreen && screenStream) && (
          realCall?.remoteStreams[peer.userId] ? (
            <RemoteCallVideo stream={realCall.remoteStreams[peer.userId]} realCall={realCall} />
          ) : (
            <Avatar name={peer.name} avatarUrl={peerAvatarUrl} size={140} ring={false} />
          )
        )}
      </View>

      <Animated.View
        style={[styles.selfCameraBoxShape, { width: boxW, height: boxH, position: "absolute", left: pan.x, top: pan.y }]}
        {...panResponder.panHandlers}
      >
        {isSelfMain ? (
          <View style={styles.selfCameraOff}>{renderPeerContent(true)}</View>
        ) : (
          <>
            {renderSelfCameraFeed(48)}
            {controlsVisible && showSelfCamera && flipButton(styles.flipButton, 26)}
          </>
        )}
      </Animated.View>

      {controlsVisible && (
      <View style={styles.bottomButtonsWrap}>
        <View style={styles.controlsGrid}>
          <View style={styles.controlRow}>
            <View style={styles.controlItem}>
              <TouchableOpacity
                style={[styles.controlButton, muted && styles.controlButtonActive]}
                onPress={toggleMute}
              >
                <MicrophoneOutline size={27} color={muted ? theme.danger : "#FFFFFF"} strokeWidth={1.8} />
              </TouchableOpacity>
              <Text style={styles.controlLabel}>{t("dm.callMute")}</Text>
            </View>
            <View style={styles.controlItem}>
              <TouchableOpacity
                style={[styles.controlButton, showSelfCamera && styles.controlButtonActive]}
                onPress={toggleCamera}
              >
                <View style={{ transform: [{ translateY: 1 }] }}>
                  {showSelfCamera ? <AppVideoIcon size={25} color={theme.bg} /> : <AppVideoOffIcon size={25} color="#FFFFFF" />}
                </View>
              </TouchableOpacity>
              <Text style={styles.controlLabel}>{t("dm.callVideoLabel")}</Text>
            </View>
            <View style={styles.controlItem}>
              <TouchableOpacity
                style={[styles.controlButton, speakerButtonActive && styles.controlButtonActive]}
                onPress={handleSpeakerPress}
              >
                {showBluetoothIconOnButton ? (
                  <Bluetooth size={27} color={speakerButtonActive ? theme.bg : "#FFFFFF"} />
                ) : (
                  <Icon name="sesAcik1" size={27} color={speakerButtonActive ? theme.bg : "#FFFFFF"} />
                )}
              </TouchableOpacity>
              <Text style={styles.controlLabel}>{t("dm.callSpeaker")}</Text>
            </View>
            <View style={styles.controlItem}>
              <TouchableOpacity
                style={[styles.controlButton, isSharingScreen && styles.controlButtonActive]}
                onPress={() => (isSharingScreen ? stopSharing() : setShareMenuVisible(true))}
              >
                <Cast size={27} color={isSharingScreen ? theme.danger : "#FFFFFF"} />
              </TouchableOpacity>
              <Text style={styles.controlLabel}>{t("dm.callShareLabel")}</Text>
            </View>
            <View style={styles.controlItem}>
              <TouchableOpacity style={styles.endButton} onPress={handleEnd}>
                <View style={{ transform: [{ rotate: "135deg" }] }}>
                  <Phone size={27} color="#FFFFFF" />
                </View>
              </TouchableOpacity>
              <Text style={styles.controlLabel}>{t("dm.callEndLabel")}</Text>
            </View>
          </View>
        </View>
      </View>
      )}

      {outputMenuVisible && (
        <TouchableOpacity style={styles.outputMenuBackdrop} activeOpacity={1} onPress={() => setOutputMenuVisible(false)}>
          <View style={styles.outputMenuWrap} pointerEvents="box-none">
            <TouchableOpacity activeOpacity={1} style={styles.outputMenuCard} onPress={() => {}}>
              {OUTPUT_OPTIONS.map((opt) => {
                const selected = realCall ? realCall.audioOutputId === opt.key : audioOutput === opt.key;
                const color = selected ? "#FFFFFF" : OUTPUT_MUTED;
                return (
                  <TouchableOpacity
                    key={opt.key}
                    style={[styles.outputMenuRow, selected && styles.outputMenuRowSelected]}
                    onPress={() => selectOutput(opt.key)}
                  >
                    {opt.renderIcon(color)}
                    <Text style={[styles.outputMenuLabel, { color }]}>{opt.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      )}

      {shareMenuVisible && (
        <TouchableOpacity style={styles.outputMenuBackdrop} activeOpacity={1} onPress={() => setShareMenuVisible(false)}>
          <View style={styles.outputMenuWrap} pointerEvents="box-none">
            <TouchableOpacity activeOpacity={1} style={styles.outputMenuCard} onPress={() => {}}>
              <Text style={styles.shareMenuTitle}>{t("dm.shareScreenPromptTitle")}</Text>
              {SHARE_OPTIONS.map((opt) => {
                const OptIcon = opt.Icon;
                return (
                  <TouchableOpacity key={opt.key} style={styles.outputMenuRow} onPress={() => startSharing(opt.key)}>
                    <OptIcon size={18} color={OUTPUT_MUTED} />
                    <Text style={[styles.outputMenuLabel, { color: OUTPUT_MUTED }]}>{opt.label}</Text>
                  </TouchableOpacity>
                );
              })}
              <View style={styles.shareMenuDivider} />
              <TouchableOpacity style={styles.outputMenuRow} onPress={() => setShareMenuVisible(false)}>
                <Text style={[styles.outputMenuLabel, { color: "#FFFFFF", textAlign: "center" }]}>{t("common.cancel")}</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      )}

      <CallMoreOptionsSheet
        visible={moreVisible}
        onClose={() => setMoreVisible(false)}
        noiseReduction={noiseReduction}
        onToggleNoiseReduction={() => {
          setNoiseReduction((n) => {
            const next = !n;
            if (realCall) realCall.setNoiseSuppression(next);
            return next;
          });
        }}
        quality={connectionQuality}
        onAddCall={onAddCall ?? placeholder}
      />
    </View>
  );
}

/** Ekran paylasimi state+fonksiyonlarini GroupCallGrid icin tek yerde
 * toplar - ana (1'e 1) ekrandaki startSharing/stopSharing ile AYNI GERCEK
 * getDisplayMedia mantigi (bkz. dosya basindaki ScreenShareVideo yorumu),
 * sadece kod tekrarini onlemek icin kucuk bir hook'a alinmis hali. */
function useScreenSharing(realCall?: CallEngineApi) {
  const [isSharingScreenMock, setIsSharingScreenMock] = useState(false);
  const [screenStreamMock, setScreenStreamMock] = useState<MediaStream | null>(null);
  const [shareMenuVisible, setShareMenuVisible] = useState(false);
  // GERCEK aramada (bkz. 1'e 1 bilesendeki AYNI aciklama) ekran paylasimi
  // realCall.startScreenShare/stopScreenShare uzerinden yurutulur.
  const isSharingScreen = realCall ? realCall.isSharingScreen : isSharingScreenMock;
  const screenStream = realCall ? realCall.localStream : screenStreamMock;

  async function startSharing(target: "screen" | "window") {
    setShareMenuVisible(false);
    if (realCall) {
      await realCall.startScreenShare(target);
      return;
    }
    const mediaDevices = (globalThis as any)?.navigator?.mediaDevices;
    if (Platform.OS === "web" && mediaDevices?.getDisplayMedia) {
      try {
        const stream: MediaStream = await mediaDevices.getDisplayMedia({
          video: { displaySurface: target === "screen" ? "monitor" : "window" },
          audio: false,
        });
        stream.getVideoTracks()[0]?.addEventListener("ended", () => {
          setScreenStreamMock(null);
          setIsSharingScreenMock(false);
        });
        setScreenStreamMock(stream);
        setIsSharingScreenMock(true);
      } catch {
        // Kullanici tarayicinin kendi secim penceresinden vazgecti/izin
        // reddetti - sessizce hicbir sey degismez.
      }
      return;
    }
    setIsSharingScreenMock(true);
  }

  function stopSharing() {
    if (realCall) {
      realCall.stopScreenShare();
      return;
    }
    screenStreamMock?.getTracks().forEach((tr) => tr.stop());
    setScreenStreamMock(null);
    setIsSharingScreenMock(false);
  }

  useEffect(() => {
    if (realCall) return;
    return () => {
      screenStreamMock?.getTracks().forEach((tr) => tr.stop());
    };
  }, [screenStreamMock, realCall]);

  return { isSharingScreen, screenStream, shareMenuVisible, setShareMenuVisible, startSharing, stopSharing };
}

/** "Diger" panelindeki gurultu azaltma anahtari.
 *
 * GERCEK aramada (realCall verilmisse) bu ayri/sahte mikrofon yakalamasi
 * HIC CALISTIRILMAZ (disabled=true ile erken cikar) - bunun yerine
 * realCall.setNoiseSuppression GERCEK aramanin KENDI mikrofon track'ine
 * (applyConstraints ile) uygulanir, bkz. cagiran yerdeki onToggleNoiseReduction.
 * realCall YOKSA (__DevHarness.tsx saf GORSEL test) tarayicinin KENDI
 * getUserMedia audio constraint'i uzerinden GERCEKTEN ayri bir mikrofon
 * akisina uygulanir - karsi tarafa baglanan gercek bir WebRTC yolu
 * olmadigindan yakalanan stream hicbir yere gonderilmez, sadece bu
 * constraint'in gercekten calistigini kanitlamak icin tutulur. */
function useMicNoiseSuppression(enabled: boolean, muted: boolean, disabled: boolean) {
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    const mediaDevices = (globalThis as any)?.navigator?.mediaDevices;
    if (disabled || Platform.OS !== "web" || !mediaDevices?.getUserMedia || muted) {
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
      streamRef.current = null;
      return;
    }
    let cancelled = false;
    mediaDevices
      .getUserMedia({ audio: { noiseSuppression: enabled, echoCancellation: true, autoGainControl: true } })
      .then((stream: MediaStream) => {
        if (cancelled) {
          stream.getTracks().forEach((tr) => tr.stop());
          return;
        }
        streamRef.current?.getTracks().forEach((tr) => tr.stop());
        streamRef.current = stream;
      })
      .catch(() => {
        // Mikrofon izni reddedildi/cihaz yok - gorsel bir etkisi olmadigi
        // icin kullaniciya gosterilecek bir hata yok, sessizce yoksay.
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, muted, disabled]);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
    };
  }, []);
}

interface GroupCallGridProps {
  // "Ben" bu listede YOK - ayri bir sabit kutucuk olarak (her zaman ilk
  // sirada) ayrica ekleniyor, bkz. asagidaki tiles.
  participants: GroupParticipant[];
  myAvatarUrl?: string | null;
  myName?: string;
  onEnd: () => void;
  onMinimize?: () => void;
  onAddCall?: () => void;
  bluetoothAvailable?: boolean;
  // Verilirse (bkz. RootNavigator.tsx VideoCallRoute), kutucuklar
  // digerlerinin de GERCEK kamera/ses akisini gosterir (bkz. remoteStreams,
  // tile.userId ile eslesir) - verilmezse (__DevHarness.tsx) eski avatar-
  // only mockup davranisina doner.
  realCall?: CallEngineApi;
}

/** 2+ kisilik grup aramasi - Zoom/Meet gibi ESIT boyutlu kutucuklardan
 * olusan bir izgara (grid). GERCEK aramada (bkz. realCall) her katilimciyla
 * mesh WebRTC ile dogrudan baglanilir (bkz. useCallEngine.ts) - benim
 * kutucugum GERCEK kamerami (expo-camera), digerleri GERCEK kameralarini/
 * seslerini gosterir (bkz. remoteStreams). realCall verilmezse
 * (__DevHarness.tsx) eski avatar-only GORSEL mockup'a doner. Ekran
 * paylasimi (kendi ekranim icin GERCEK getDisplayMedia) ve "Diger" paneli
 * (gurultu azaltma + baglanti kalitesi + Arama Ekle) 1'e 1 ekranla AYNI -
 * sadece kod tekrarini onlemek icin burada AYRI bir kopya (bkz.
 * useScreenSharing). Bir kutucuga dokununca o kisi "spotlight" (buyuk
 * sahne) olur, digerleri altta kucuk bir seritte siralanir - buyuk
 * sahneye tekrar dokununca izgaraya geri doner. 6'dan fazla kisi varsa
 * izgara kaydirmali hale gecer. */
function GroupCallGrid({
  participants,
  myAvatarUrl,
  myName,
  onEnd,
  onMinimize,
  onAddCall,
  bluetoothAvailable = false,
  realCall,
}: GroupCallGridProps) {
  const { t } = useTranslation();
  const [connectedMock, setConnectedMock] = useState(false);
  const connected = realCall ? realCall.phase === "connected" : connectedMock;
  const [elapsed, setElapsed] = useState(0);
  const [muted, setMuted] = useState(false);
  const [cameraOn, setCameraOn] = useState(true);
  const [speakerOn, setSpeakerOn] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [outputMenuVisible, setOutputMenuVisible] = useState(false);
  const [audioOutput, setAudioOutput] = useState<"earpiece" | "speaker" | "bluetooth">("earpiece");
  const [moreVisible, setMoreVisible] = useState(false);
  const [noiseReduction, setNoiseReduction] = useState(false);
  useMicNoiseSuppression(noiseReduction, muted, !!realCall);
  const [spotlightId, setSpotlightId] = useState<string | null>(null);
  const { width: screenW } = useWindowDimensions();
  const { isSharingScreen, screenStream, shareMenuVisible, setShareMenuVisible, startSharing, stopSharing } =
    useScreenSharing(realCall);
  const connectionQualityMock = useConnectionQuality(connected);
  // GERCEK aramada artik sahte ping RTT'si DEGIL, dogrudan gercek
  // RTCPeerConnection.getStats() olcumu (bkz. useCallEngine.ts
  // measureConnectionQuality) kullanilir.
  const connectionQuality = realCall ? realCall.connectionQuality : connectionQualityMock;

  useEffect(() => {
    if (realCall) return;
    const connectTimer = setTimeout(() => setConnectedMock(true), 2500);
    return () => clearTimeout(connectTimer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!controlsVisible) return;
    const hideTimer = setTimeout(() => setControlsVisible(false), 5000);
    return () => clearTimeout(hideTimer);
  }, [controlsVisible]);

  async function toggleCamera() {
    if (realCall) {
      realCall.setCameraEnabled(!realCall.cameraEnabled);
      return;
    }
    if (cameraOn) {
      setCameraOn(false);
      return;
    }
    if (!cameraPermission?.granted) {
      const res = await requestCameraPermission();
      if (!res.granted) return;
    }
    setCameraOn(true);
  }

  const showSelfCamera = realCall ? realCall.cameraEnabled : cameraOn && cameraPermission?.granted;

  const OUTPUT_OPTIONS_MOCK = [
    { key: "earpiece" as const, label: t("dm.callOutputEarpiece"), renderIcon: (c: string) => <Phone size={18} color={c} /> },
    { key: "speaker" as const, label: t("dm.callSpeaker"), renderIcon: (c: string) => <Icon name="sesAcik1" size={18} color={c} /> },
    { key: "bluetooth" as const, label: t("dm.callOutputBluetooth"), renderIcon: (c: string) => <Bluetooth size={18} color={c} /> },
  ];
  const OUTPUT_OPTIONS = realCall ? buildRealOutputOptions(realCall.audioOutputs) : OUTPUT_OPTIONS_MOCK;
  const speakerButtonActive = realCall
    ? Platform.OS === "web"
      ? !!realCall.audioOutputId
      : realCall.speakerOn
    : bluetoothAvailable
      ? audioOutput !== "earpiece"
      : speakerOn;
  const showBluetoothIconOnButton = realCall
    ? Platform.OS === "web" && /bluetooth/i.test(realCall.audioOutputs.find((d) => d.deviceId === realCall.audioOutputId)?.label || "")
    : bluetoothAvailable && audioOutput === "bluetooth";

  function handleSpeakerPress() {
    if (realCall) {
      if (Platform.OS === "web") {
        realCall.refreshAudioOutputs();
        setOutputMenuVisible((v) => !v);
      } else {
        realCall.setSpeakerRoute(!realCall.speakerOn);
      }
      return;
    }
    if (bluetoothAvailable) setOutputMenuVisible((v) => !v);
    else setSpeakerOn((s) => !s);
  }

  function selectOutput(key: string) {
    setOutputMenuVisible(false);
    if (realCall) {
      realCall.setAudioOutputId(key);
      return;
    }
    setAudioOutput(key as "earpiece" | "speaker" | "bluetooth");
    const wantsSpeaker = key === "speaker";
    if (wantsSpeaker !== speakerOn) setSpeakerOn(wantsSpeaker);
  }

  const SHARE_OPTIONS = [
    { key: "screen" as const, label: t("dm.shareScreenFull"), Icon: Monitor },
    { key: "window" as const, label: t("dm.shareScreenWindow"), Icon: AppWindow },
  ];

  const tiles = [
    { userId: "__me__", name: myName || t("dm.you"), avatarUrl: myAvatarUrl, isMe: true as const },
    ...participants.map((p) => ({ ...p, isMe: false as const })),
  ];
  // 2 kisi - tek sutun (alt alta, tam genislik); 3+ kisi - iki sutun. Son
  // satirda tek kutucuk kalirsa (orn. 3 ve 5 kisilik aramalarda) o satirin
  // TEK cocugu oldugu icin flex:1 ile zaten o satirin tam genisligini
  // kaplar (bkz. asagidaki gridRow - ekstra bir kod gerekmiyor).
  const cols = tiles.length <= 2 ? 1 : 2;
  const tileRows: (typeof tiles)[] = [];
  for (let i = 0; i < tiles.length; i += cols) tileRows.push(tiles.slice(i, i + cols));
  // 8'den fazla kisi - izgara artik ekrana flex ile sigmaya calismiyor,
  // SABIT boyutlu kutucuklarla kaydirmali hale geciyor (bkz. asagidaki
  // ScrollView dali). 8'e kadar (4 satir x 2 sutun) flex:1 ile TAM ekrani
  // kaplayip bosluk birakmiyor - bu yuzden sinir 6 degil 8.
  const needsScroll = tiles.length > 8;
  const GRID_PADDING = 10;
  const GRID_GAP = 10;
  const GRID_ROWS_PER_PAGE = 4;
  const fixedTileWidth = (screenW - GRID_PADDING * 2 - GRID_GAP) / 2;
  // Kaydirma alaninin GERCEK (flex ile ayrilan) yuksekligini ilk render'da
  // olcup kutucuklarin BOYUNU - genisligi degil - buna gore ayarliyoruz: 9+
  // kisilik kaydirmali moddaki ilk ekran da, 8 kisilik kaydirmasiz moddaki
  // gibi TAM 4 satir (8 kutu) gostersin, 3 degil - 5.+ satir kaydirarak
  // gorulsun. scrollViewportH henuz olculmeden (ilk render) gecici olarak
  // kare kutucuk varsayiyoruz, 2. render'da gercek boya oturuyor.
  const [scrollViewportH, setScrollViewportH] = useState<number | null>(null);
  const fixedTileHeight =
    scrollViewportH != null
      ? (scrollViewportH - GRID_PADDING * 2 - (GRID_ROWS_PER_PAGE - 1) * GRID_GAP) / GRID_ROWS_PER_PAGE
      : fixedTileWidth;
  // Satir hesaplamasi artik fixedTileHeight'a gore tam sayida satir
  // sigacak sekilde kendiliginden tutarli (bkz. yukarinin matematigi) -
  // bu yuzden son satirin yarim kalmasi (kisinin kutusu gosterilmiyor
  // bug'i) riski kalmiyor; asagidaki cap yine de guvenlik agi olarak kalir.
  const rowUnit = fixedTileHeight + GRID_GAP;
  const cleanScrollHeight =
    scrollViewportH != null
      ? Math.max(rowUnit, Math.floor((scrollViewportH - GRID_PADDING) / rowUnit) * rowUnit + GRID_PADDING)
      : null;

  function renderTileInner(tile: (typeof tiles)[number], avatarSize: number) {
    if (tile.isMe && showSelfCamera && realCall?.localStream) {
      return <LocalCallVideo stream={realCall.localStream} mirrored={realCall.cameraFacing === "user"} />;
    }
    if (tile.isMe && showSelfCamera) return <CameraView style={StyleSheet.absoluteFill} facing="front" />;
    const remoteStream = !tile.isMe ? realCall?.remoteStreams[tile.userId] : undefined;
    if (remoteStream) return <RemoteCallVideo stream={remoteStream} realCall={realCall} />;
    return (
      <View style={styles.gridTileAvatarWrap}>
        <Avatar name={tile.name} avatarUrl={tile.avatarUrl} size={avatarSize} ring={false} />
      </View>
    );
  }

  function renderNameLabel(tile: (typeof tiles)[number]) {
    return (
      <View style={styles.gridTileNameWrap} pointerEvents="none">
        <Text style={styles.gridTileName} numberOfLines={1}>
          {tile.isMe ? t("dm.you") : tile.name}
        </Text>
      </View>
    );
  }

  function renderGridTile(tile: (typeof tiles)[number], avatarSize: number, tileStyle: object) {
    return (
      <TouchableOpacity key={tile.userId} style={tileStyle} activeOpacity={0.85} onPress={() => setSpotlightId(tile.userId)}>
        {renderTileInner(tile, avatarSize)}
        {renderNameLabel(tile)}
      </TouchableOpacity>
    );
  }

  const spotlightTile = tiles.find((t2) => t2.userId === spotlightId) ?? null;
  const otherTiles = tiles.filter((t2) => t2.userId !== spotlightId);

  return (
    <View style={styles.screen}>
      <AppBackground />

      {!spotlightTile && (
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={() => setControlsVisible((v) => !v)}
        />
      )}

      {controlsVisible && (
        <>
          <LinearGradient colors={["rgba(0,0,0,0.65)", "transparent"]} style={styles.topScrim} pointerEvents="none" />
          <LinearGradient colors={["transparent", "rgba(0,0,0,0.82)"]} style={styles.bottomScrim} pointerEvents="none" />
        </>
      )}

      <View style={styles.topBar} pointerEvents="box-none">
        {controlsVisible && (
          <TouchableOpacity style={styles.chipButton} onPress={onMinimize ?? (() => {})} hitSlop={10}>
            <Minimize2 size={30} color="#FFFFFF" />
          </TouchableOpacity>
        )}
        {controlsVisible && (
          <View style={styles.topInfo}>
            <Text style={styles.peerNameCompact} numberOfLines={1}>
              {t("dm.groupCallTitle")}
            </Text>
            <Text style={styles.statusCompact}>{connected ? formatElapsed(elapsed) : t("dm.callRinging")}</Text>
          </View>
        )}
        {controlsVisible && (
          <TouchableOpacity style={styles.chipButton} onPress={() => setMoreVisible(true)}>
            <MoreVertical size={30} color="#FFFFFF" />
          </TouchableOpacity>
        )}
      </View>

      {isSharingScreen && screenStream ? (
        <View style={styles.peerScreenShareFullscreen} pointerEvents="none">
          <ScreenShareVideo stream={screenStream} />
          {controlsVisible && (
            <View style={styles.peerScreenShareLabelWrap} pointerEvents="none">
              <View style={styles.peerScreenShareLabelPill}>
                <Cast size={14} color={theme.danger} />
                <Text style={styles.peerScreenShareLabel} numberOfLines={1}>
                  {t("dm.youAreSharing")}
                </Text>
              </View>
            </View>
          )}
        </View>
      ) : spotlightTile ? (
        <View style={styles.spotlightWrap} pointerEvents="box-none">
          <TouchableOpacity
            style={styles.spotlightStage}
            activeOpacity={0.95}
            onPress={() => setSpotlightId(null)}
          >
            {renderTileInner(spotlightTile, 140)}
            {renderNameLabel(spotlightTile)}
          </TouchableOpacity>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.spotlightThumbRowOuter}
            contentContainerStyle={styles.spotlightThumbRow}
          >
            {otherTiles.map((tile) => (
              <TouchableOpacity
                key={tile.userId}
                style={styles.spotlightThumb}
                activeOpacity={0.85}
                onPress={() => setSpotlightId(tile.userId)}
              >
                {renderTileInner(tile, 32)}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      ) : needsScroll ? (
        // "Temiz satir" icin ScrollView'in boyu asagida tam satir sayisina
        // yuvarlanip kisitlaniyor (bkz. cleanScrollHeight) - bu da onun
        // flex:1 ile alabilecegi boyuttan birkac piksel KISA kalmasina
        // sebep olabiliyor. O farkin ekranin EN ALTINDA (butonlarin
        // altinda) bos bir seride donusup butonlari yukari itmesini
        // onlemek icin - farki buradaki sarmalayici flex:1 kutunun
        // ustunde biriktiriyoruz (justifyContent: flex-end ile grid'i
        // bu kutunun DIBINE yaslayip butonlara direkt bitisik tutuyoruz).
        <View
          style={styles.gridScrollWrap}
          onLayout={(e) => {
            if (scrollViewportH == null) setScrollViewportH(e.nativeEvent.layout.height);
          }}
        >
          <ScrollView
            style={[styles.gridScrollView, cleanScrollHeight != null ? { maxHeight: cleanScrollHeight } : null]}
            contentContainerStyle={styles.gridScrollContent}
          >
            {tileRows.map((row, ri) => (
              <View key={ri} style={styles.gridRowFixed}>
                {row.map((tile) => renderGridTile(tile, 40, [styles.gridTileFixed, { width: fixedTileWidth, height: fixedTileHeight }]))}
              </View>
            ))}
          </ScrollView>
        </View>
      ) : (
        <View style={styles.gridContainer} pointerEvents="box-none">
          {tileRows.map((row, ri) => (
            <View key={ri} style={styles.gridRow}>
              {row.map((tile) => renderGridTile(tile, cols === 1 ? 72 : 56, styles.gridTile))}
            </View>
          ))}
        </View>
      )}

      {controlsVisible && (
        <View style={styles.bottomButtonsWrap}>
          <View style={[styles.controlsGrid, styles.groupControlsGridOverride]}>
            <View style={styles.groupControlsDock}>
              <View style={styles.controlRow}>
                <View style={styles.controlItem}>
                  <TouchableOpacity
                    style={[styles.controlButton, muted && styles.controlButtonActive]}
                    onPress={() =>
                      setMuted((m) => {
                        const next = !m;
                        realCall?.localStream?.getAudioTracks().forEach((track) => {
                          track.enabled = !next;
                        });
                        return next;
                      })
                    }
                  >
                    <MicrophoneOutline size={27} color={muted ? theme.danger : "#FFFFFF"} strokeWidth={1.8} />
                  </TouchableOpacity>
                  <Text style={styles.controlLabel}>{t("dm.callMute")}</Text>
                </View>
                <View style={styles.controlItem}>
                  <TouchableOpacity style={[styles.controlButton, showSelfCamera && styles.controlButtonActive]} onPress={toggleCamera}>
                    <View style={{ transform: [{ translateY: 1 }] }}>
                      {showSelfCamera ? <AppVideoIcon size={25} color={theme.bg} /> : <AppVideoOffIcon size={25} color="#FFFFFF" />}
                    </View>
                  </TouchableOpacity>
                  <Text style={styles.controlLabel}>{t("dm.callVideoLabel")}</Text>
                </View>
                <View style={styles.controlItem}>
                  <TouchableOpacity
                    style={[styles.controlButton, speakerButtonActive && styles.controlButtonActive]}
                    onPress={handleSpeakerPress}
                  >
                    {showBluetoothIconOnButton ? (
                      <Bluetooth size={27} color={speakerButtonActive ? theme.bg : "#FFFFFF"} />
                    ) : (
                      <Icon name="sesAcik1" size={27} color={speakerButtonActive ? theme.bg : "#FFFFFF"} />
                    )}
                  </TouchableOpacity>
                  <Text style={styles.controlLabel}>{t("dm.callSpeaker")}</Text>
                </View>
                <View style={styles.controlItem}>
                  <TouchableOpacity
                    style={[styles.controlButton, isSharingScreen && styles.controlButtonActive]}
                    onPress={() => (isSharingScreen ? stopSharing() : setShareMenuVisible(true))}
                  >
                    <Cast size={27} color={isSharingScreen ? theme.danger : "#FFFFFF"} />
                  </TouchableOpacity>
                  <Text style={styles.controlLabel}>{t("dm.callShareLabel")}</Text>
                </View>
                <View style={styles.controlItem}>
                  <TouchableOpacity style={styles.endButton} onPress={onEnd}>
                    <View style={{ transform: [{ rotate: "135deg" }] }}>
                      <Phone size={27} color="#FFFFFF" />
                    </View>
                  </TouchableOpacity>
                  <Text style={styles.controlLabel}>{t("dm.callEndLabel")}</Text>
                </View>
              </View>
            </View>
          </View>
        </View>
      )}

      {outputMenuVisible && (
        <TouchableOpacity style={styles.outputMenuBackdrop} activeOpacity={1} onPress={() => setOutputMenuVisible(false)}>
          <View style={styles.outputMenuWrap} pointerEvents="box-none">
            <TouchableOpacity activeOpacity={1} style={styles.outputMenuCard} onPress={() => {}}>
              {OUTPUT_OPTIONS.map((opt) => {
                const selected = realCall ? realCall.audioOutputId === opt.key : audioOutput === opt.key;
                const color = selected ? "#FFFFFF" : OUTPUT_MUTED;
                return (
                  <TouchableOpacity
                    key={opt.key}
                    style={[styles.outputMenuRow, selected && styles.outputMenuRowSelected]}
                    onPress={() => selectOutput(opt.key)}
                  >
                    {opt.renderIcon(color)}
                    <Text style={[styles.outputMenuLabel, { color }]}>{opt.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      )}

      {shareMenuVisible && (
        <TouchableOpacity style={styles.outputMenuBackdrop} activeOpacity={1} onPress={() => setShareMenuVisible(false)}>
          <View style={styles.outputMenuWrap} pointerEvents="box-none">
            <TouchableOpacity activeOpacity={1} style={styles.outputMenuCard} onPress={() => {}}>
              <Text style={styles.shareMenuTitle}>{t("dm.shareScreenPromptTitle")}</Text>
              {SHARE_OPTIONS.map((opt) => {
                const OptIcon = opt.Icon;
                return (
                  <TouchableOpacity key={opt.key} style={styles.outputMenuRow} onPress={() => startSharing(opt.key)}>
                    <OptIcon size={18} color={OUTPUT_MUTED} />
                    <Text style={[styles.outputMenuLabel, { color: OUTPUT_MUTED }]}>{opt.label}</Text>
                  </TouchableOpacity>
                );
              })}
              <View style={styles.shareMenuDivider} />
              <TouchableOpacity style={styles.outputMenuRow} onPress={() => setShareMenuVisible(false)}>
                <Text style={[styles.outputMenuLabel, { color: "#FFFFFF", textAlign: "center" }]}>{t("common.cancel")}</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      )}

      <CallMoreOptionsSheet
        visible={moreVisible}
        onClose={() => setMoreVisible(false)}
        noiseReduction={noiseReduction}
        onToggleNoiseReduction={() => {
          setNoiseReduction((n) => {
            const next = !n;
            if (realCall) realCall.setNoiseSuppression(next);
            return next;
          });
        }}
        quality={connectionQuality}
        onAddCall={onAddCall}
      />
    </View>
  );
}

const SELF_CAMERA_WIDTH = 118;
const SELF_CAMERA_HEIGHT = 166;
const OUTPUT_MUTED = "rgba(255,255,255,0.55)";

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "transparent" },
  topScrim: { position: "absolute", top: 0, left: 0, right: 0, height: 150 },
  bottomScrim: { position: "absolute", left: 0, right: 0, bottom: 0, height: 320 },
  topBar: {
    paddingTop: 54,
    paddingHorizontal: 18,
    paddingBottom: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  chipButton: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
  },
  topInfo: { alignItems: "center" },
  peerNameCompact: { color: "#FFFFFF", fontSize: 19, fontWeight: "700", maxWidth: 220 },
  statusCompact: { color: "rgba(255,255,255,0.65)", fontSize: 14, marginTop: 2 },
  remoteStage: { flex: 1, alignItems: "center", justifyContent: "center" },
  gridContainer: { flex: 1, padding: 10, gap: 10 },
  gridRow: { flex: 1, flexDirection: "row", gap: 10 },
  gridTile: {
    flex: 1,
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: "#1E293B",
    alignItems: "center",
    justifyContent: "center",
  },
  gridTileAvatarWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  gridTileNameWrap: {
    position: "absolute",
    bottom: 8,
    left: 8,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 6,
    paddingVertical: 3,
    paddingHorizontal: 8,
  },
  gridTileName: { color: "#FFFFFF", fontSize: 12, fontWeight: "600" },
  // 6'dan fazla kisilik kaydirmali izgarada kutucuklar flex:1 ile DEGIL
  // SABIT piksel boyutuyla (bkz. fixedTileSize) buyutuluyor - gridTile'in
  // flex:1'i burada OLMAMALI, yoksa ScrollView icinde satir basina sadece
  // 1 kutucuk kalacak kadar genislerlerdi.
  gridTileFixed: {
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: "#1E293B",
    alignItems: "center",
    justifyContent: "center",
  },
  gridRowFixed: { flexDirection: "row", gap: 10 },
  // minHeight:0 SART - flex:1 TEK BASINA yetmiyor, web'de flex kutularinin
  // varsayilan "min-height:auto" davranisi, icerik kutudan BUYUKSE kutuyu
  // kendi flex payindan daha fazla BUYUTUP alttaki kontrol cubuguyla
  // CAKISMASINA (bkz. bu satiri tetikleyen gercek bug: son satirin
  // butonlarin ARKASINDA kalmasi) sebep oluyordu - minHeight:0 kutuyu
  // KENDI payina sigdirip tasan icerigi GERCEKTEN kaydirmaya zorluyor.
  gridScrollWrap: { flex: 1, justifyContent: "flex-end" },
  gridScrollView: { flex: 1, minHeight: 0 },
  gridScrollContent: { padding: 10, gap: 10 },
  // "Spotlight" (bir kutucuga dokununca buyuyen) gorunum - buyuk sahne +
  // altinda digerlerinin yatay kaydirilabilir kucuk seridi.
  spotlightWrap: { flex: 1 },
  spotlightStage: {
    flex: 1,
    margin: 10,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#1E293B",
    alignItems: "center",
    justifyContent: "center",
  },
  // ScrollView'in (RN'in kendi varsayilan davranisi) stage ile AYNI flex
  // alanini paylasmaya calismasini onlemek icin flexGrow:0 SART - yoksa
  // (bkz. bu satiri tetikleyen gercek bug) buyuk sahne kuculuyor, serit
  // gereginden fazla yer kaplayip altinda bos alan birakiyordu.
  spotlightThumbRowOuter: { flexGrow: 0, flexShrink: 0 },
  spotlightThumbRow: { paddingHorizontal: 10, paddingBottom: 10, gap: 8 },
  spotlightThumb: {
    width: 70,
    height: 96,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "#1E293B",
    alignItems: "center",
    justifyContent: "center",
  },
  selfCameraFullscreen: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  peerScreenShareFullscreen: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#0F172A",
  },
  peerScreenShare: { flex: 1, backgroundColor: "#000000" },
  peerScreenShareVideo: { width: "100%", height: "100%" },
  peerScreenShareLabelWrap: {
    position: "absolute",
    bottom: 14,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  peerScreenShareLabelPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 8,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  peerScreenShareLabel: { color: "#FFFFFF", fontSize: 13, fontWeight: "600" },
  selfCameraBoxShape: {
    width: SELF_CAMERA_WIDTH,
    height: SELF_CAMERA_HEIGHT,
    borderRadius: 4,
    overflow: "hidden",
    backgroundColor: "#1E293B",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  selfCameraView: { flex: 1 },
  selfCameraOff: { flex: 1, alignItems: "center", justifyContent: "center" },
  flipButton: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  flipButtonStage: {
    position: "absolute",
    top: 53,
    right: 62,
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  bottomButtonsWrap: { paddingHorizontal: 18 },
  controlsGrid: { alignItems: "center", gap: 22, paddingBottom: 48 },
  // Grup aramasinda butonlarin arkasinda video/avatar tam ekran kaplamadigi
  // icin (1'e 1 ekranin aksine) dibi bos kalip "havada" durmasinlar diye -
  // yari saydam bir "dock" paneli ustune oturtuluyor, sadece GroupCallGrid'de.
  // NOT: dock'un ustten/alttan ekledigi 14+14=28px, butonlarin EKRANDAKI
  // KONUMUNU 1'e 1 ekrandakiyle birebir ayni tutmak icin asagidaki
  // groupControlsGridOverride ile dengeleniyor (paddingBottom 48 -> 34,
  // yani 48 = dock'un alt paddingi(14) + bu 34 - 1'e 1'deki controlsGrid'e
  // DOKUNULMUYOR, sadece bu kullanimda inline override var).
  groupControlsDock: {
    backgroundColor: "rgba(15,20,32,0.6)",
    borderRadius: 32,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  groupControlsGridOverride: { paddingBottom: 34 },
  controlRow: { flexDirection: "row", gap: 15 },
  controlButton: {
    width: 66,
    height: 66,
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  controlButtonActive: { backgroundColor: "#FFFFFF" },
  controlItem: { alignItems: "center", gap: 8, width: 66 },
  controlLabel: { color: theme.textMuted, fontSize: 10, fontWeight: "600" },
  endButton: {
    width: 66,
    height: 66,
    borderRadius: 24,
    backgroundColor: theme.danger,
    alignItems: "center",
    justifyContent: "center",
  },
  outputMenuBackdrop: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  outputMenuWrap: { position: "absolute", bottom: 144, left: 0, right: 0, alignItems: "center" },
  outputMenuCard: {
    backgroundColor: "#1E293B",
    borderRadius: 14,
    paddingVertical: 6,
    minWidth: 190,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  outputMenuRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, paddingHorizontal: 14, marginHorizontal: 6, borderRadius: 12 },
  outputMenuRowSelected: { backgroundColor: "rgba(14,165,233,0.18)" },
  outputMenuLabel: { fontSize: 14, fontWeight: "600", flex: 1 },
  shareMenuTitle: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 12,
    fontWeight: "600",
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 4,
  },
  shareMenuDivider: { height: 1, backgroundColor: "rgba(255,255,255,0.1)", marginHorizontal: 6, marginVertical: 2 },
});
