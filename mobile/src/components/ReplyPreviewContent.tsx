import React, { useState } from "react";
import { View, Text, Image, StyleSheet, LayoutChangeEvent } from "react-native";
import { useVideoPlayer, VideoView } from "expo-video";
import { useTranslation } from "react-i18next";
import { Image as ImageIcon, MapPin, File as FileIcon, Phone, User as UserIcon, BarChart2, Music, Sticker as StickerIcon } from "lucide-react-native";
import { MicrophoneIcon } from "react-native-heroicons/outline";
import AppIcon from "./Icon";
import { VoiceOnceRingIcon } from "./CustomIcons";
import { DMMessage } from "../services/socket";

interface Props {
  fromName: string;
  text: string;
  kind?: DMMessage["kind"] | null;
  mediaUrl?: string | null;
  // Sadece kind="call" icin - metindeki emoji yerine GERCEK bilgiye
  // bakabilelim diye (bkz. asagidaki IconEl secimi). Verilmezse (eski
  // cagrilar - DMReply bu alani HENUZ tasimiyor) metindeki "🎥" emojisine
  // geri donulur.
  callIsVideo?: boolean | null;
  // Kullanici istegi: "tek görünümlük ses ve medya görüntülerini cevap
  // bloklarında göster" - gercek icerik (kucuk resim) ASLA gosterilmez,
  // bunun yerine foto/video/gif balonlarindaki AYNI "1" rozeti + tur
  // etiketi ("Fotoğraf"/"Video"/"GIF"/"Ses") gosterilir. viewOnceConsumed
  // verilirse (sadece canli bir mesaj referansinda - bkz. GroupChatScreen.tsx
  // "shown" sabitlenmis mesaj banner'i - reply ALINTISI gibi DONDURULMUS bir
  // kayitta bu bilgi yok) rozet+etiket griye doner.
  viewOnce?: boolean;
  viewOnceConsumed?: boolean;
  // SADECE GIF cikartmalarini ("gif-" onekli) "GIF" olarak etiketlemek icin.
  stickerId?: string | null;
  // "composer": yaziyorken alttaki cevap cubugu (koyu/MUTED renkler).
  // "bubble": bir mesaj balonunun kendi icindeki alinti (beyaz/yari-saydam).
  variant: "composer" | "bubble";
}

// Eski (bu ozellikten ONCE gonderilmis) kayitlarda kind/mediaUrl hic yok -
// o zaman "text" zaten kendi emoji on ekiyle ("📷 Fotoğraf" gibi) duz
// yaziliyor, burasi hic calismiyor (bkz. asagidaki erken "return" - sadece
// kind BILINIYORSA ikonlu/zengin gosterim devreye giriyor).
function VideoThumb({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p) => {
    p.muted = true;
    p.pause();
  });
  return (
    <View style={styles.thumbWrap}>
      <VideoView style={StyleSheet.absoluteFill} player={player} nativeControls={false} contentFit="cover" pointerEvents="none" />
    </View>
  );
}

/** Cevap alintisinin (hem balon icindeki hem de yazarken alttaki cubuktaki)
 * ORTAK icerigi - gonderenin adi + yanitlanan mesajin TURUNE gore bir ikon
 * (foto/video icin kucuk bir resim onizlemesi, digerleri icin uygun bir
 * simge) + ozet metin. kind/mediaUrl verilmemisse (eski kayitlar) sadece
 * duz metin gosterir - bkz. 0036_dm_reply_rich.sql. */
export default function ReplyPreviewContent({ fromName, text, kind, mediaUrl, callIsVideo, viewOnce, viewOnceConsumed, stickerId, variant }: Props) {
  const { t } = useTranslation();
  const fromColor = "#FFFFFF";
  const bodyColor = variant === "bubble" ? "rgba(255,255,255,0.75)" : "#9A8F80";
  const iconColor = variant === "bubble" ? "rgba(255,255,255,0.85)" : "#9A8F80";
  const isGifSticker = kind === "sticker" && !!stickerId?.startsWith("gif-");
  const isViewOnceMedia = !!viewOnce && (kind === "photo" || kind === "video" || isGifSticker || kind === "voice");
  const viewOnceColor = viewOnceConsumed ? "#9A9A9A" : iconColor;
  // Foto/video kucuk resmi KARE olsun (genislik=yukseklik) istiyoruz, ama
  // yukseklik sabit degil (ustteki thumbAbs top:3/bottom:3 ile saran
  // replyQuote/replyBarText kutusunun - yani metnin satir sayisina gore
  // degisen - boyuna gore OTOMATIK uzuyor). Bu yuzden genisligi ELLE sabit
  // bir sayi yerine, ilk render'da olculen GERCEK yuksekligi onLayout ile
  // yakalayip ona esitliyoruz - saga dogru buyuyerek (sol kenar/thumbLeft
  // sabit kaliyor). fallbackSize ilk kare boyanana kadarki tahmin.
  const fallbackSize = 38;
  const [squareSize, setSquareSize] = useState(fallbackSize);
  const thumbLeft = 6;
  const thumbTextGap = 3;
  const thumbSize = squareSize;
  const handleThumbLayout = (e: LayoutChangeEvent) => {
    const h = Math.round(e.nativeEvent.layout.height);
    if (h > 0 && h !== squareSize) setSquareSize(h);
  };

  const hasThumb = (kind === "photo" || kind === "video") && !!mediaUrl && !isViewOnceMedia;
  // Kullanici: "Dosya ve gifte nasıl mesaj metni gözüküyorsa fotoğraf ve
  // videonun cevap bloğu da öyle olmalı" - "text" alani bazi turlerde ya
  // SUNUCUNUN SABIT varsayilani ("📷 Fotoğraf"/"🎥 Video"/"📎 dosya.pdf" gibi,
  // emoji ON EKLI) YA DA kullanicinin yazdigi GERCEK bir altyazi (emoji eki
  // OLMADAN, "Beyaz BMW" gibi) olabilir (bkz. 0033/0034/0040/0043
  // migration'lari: "coalesce(nullif(trim(caption),''), '<emoji> <etiket>')").
  // ESKI kod foto/videoda bunu "hic denemeden" sabit etikete sabitliyordu
  // (gercek altyazi varsa bile kayboluyordu), digerlerinde ise ters bir
  // hata vardi: ILK SOZCUGU HER ZAMAN emoji sanip kirpiyordu - bu da gercek
  // bir altyazinin ("Ekte son hali var..." gibi) ilk kelimesini ("Ekte")
  // yiyordu. Dogru ve TUTARLI kural: metin GERCEKTEN o turun bilinen sabit
  // emoji onekiyle basliyorsa sadece O ONEK kirpilir; aksi halde (gercek
  // bir altyazi) metin HIC DOKUNULMADAN oldugu gibi gosterilir.
  const KIND_PREFIX: Partial<Record<string, string>> = {
    photo: "📷 ",
    video: "🎥 ",
    voice: "🎤 ",
    location: "📍 ",
    file: "📎 ",
    contact: "👤 ",
    poll: "📊 ",
    music: "🎵 ",
    sticker: "🏷️ ",
  };
  const isRichKind = !!kind && kind !== "text";
  let label = text;
  if (isRichKind) {
    if (kind === "call") {
      const callPrefix = ["📞 ", "🎥 "].find((p) => text.startsWith(p));
      if (callPrefix) label = text.slice(callPrefix.length);
    } else {
      const prefix = kind ? KIND_PREFIX[kind] : undefined;
      if (prefix && text.startsWith(prefix)) label = text.slice(prefix.length);
    }
  }
  // Tek-gorunumlukse gercek altyazi/metin yerine HER ZAMAN sabit tur etiketi
  // (bubble'daki "1" rozetli satirla AYNI metin) - altyazi bile gosterilmez.
  if (isViewOnceMedia) {
    label = isGifSticker
      ? t("dm.kindGif")
      : kind === "video"
      ? t("dm.kindVideo")
      : kind === "voice"
      ? t("dm.kindVoice")
      : t("dm.kindPhoto");
  }

  // Kucuk resim varsa, onu saran ASIL kutunun (balon ici "replyQuote" ya da
  // composer'daki "replyBarText") kenarindan TAM 3px kalsin istiyoruz. Sabit
  // boyutlu bir resmi flex ortalamasi icinde negatif marjla itmek, dikeyde
  // ustten VE alttan AYNI ANDA tam 3px vermeyi matematiksel olarak imkansiz
  // kiliyor (kutu boyu sabit degil) - bu yuzden resmi normal akistan cikarip
  // "position: absolute" ile sarici kutunun (asagidaki cancelX) TAM dis
  // kenarina gore top/left/bottom:3 ile sabitliyoruz; yukseklik otomatik
  // esniyor. Sarici kutu da negatif marjla disaridaki replyQuote/replyBarText
  // dolgusunu (+bubble'da sol kenar cizgisini) iptal edip onun TAM dis
  // kenarina tasiniyor; metin icin de aynisi kadar padding geri ekleniyor.
  const cancelOuter = hasThumb ? (variant === "bubble" ? styles.cancelBubble : styles.cancelComposer) : null;
  const textPad = hasThumb
    ? { paddingLeft: thumbLeft + thumbSize + thumbTextGap, paddingRight: variant === "bubble" ? 8 : 10, paddingTop: variant === "bubble" ? 6 : 12, paddingBottom: variant === "bubble" ? 6 : 12 }
    : null;

  // Ikon kutusunun sinirlari ustteki "fromName" yazisiyla zaten ayni X'te
  // baslasa da, her ikonun kendi SVG viewBox'u icinde ciziminin soluna
  // biraktigi BOSLUK farkli (MicrophoneIcon/MapPin/File gibi kutuphane
  // ikonlari cizimi kutunun tam soluna yaslamiyor) - bu yuzden GOZLE
  // gorunen hizasizligi gidermek icin her ikon icin OLCULEREK bulunan
  // (yuksek cozunurluklu ekran goruntusu + piksel analizi) ayri bir
  // sol kaydirma uygulaniyor.
  let IconEl: React.ReactNode = null;
  let iconShift = 0;
  if (!hasThumb) {
    if (isViewOnceMedia) {
      // Digerlerinden (14px) FARKLI olarak COK daha buyuk: bu ikon ince
      // cizgili bir halka + icinde kucuk bir "1" rakami tasiyor (bkz.
      // CustomIcons.tsx), 32px'te bile rakam zor seciliyordu. AMA bunu
      // digerleri gibi dogrudan buyutmek (satir ici normal akista) cevap
      // bloğunun/balonun BOYUNU buyutup yaziyi asagi itiyordu (kullanici
      // bunu istemedi - blok SABIT kalmali). Cozum: 14x14'luk SABIT bir
      // kutu (digerleriyle AYNI "ayak izi") icine, kutudan TASARAK
      // (overflow visible + absolute ortalama) GERCEKTEN cok daha buyuk
      // (46px) bir ikon yerlestiriliyor - satir/blok yuksekligi ETKILENMEZ.
      IconEl = (
        <View style={styles.viewOnceIconOverflowBox}>
          <View style={styles.viewOnceIconAbs}>
            <VoiceOnceRingIcon size={46} color={viewOnceColor} />
          </View>
        </View>
      );
    } else if (kind === "photo") IconEl = <ImageIcon size={14} color={iconColor} />;
    else if (kind === "video") IconEl = <AppIcon name="video" size={14} color={iconColor} />;
    else if (kind === "voice") {
      IconEl = <MicrophoneIcon size={14} color={iconColor} strokeWidth={1.8} />;
      iconShift = -2;
    } else if (kind === "location") {
      IconEl = <MapPin size={14} color={iconColor} />;
      iconShift = -1;
    } else if (kind === "file") {
      IconEl = <FileIcon size={14} color={iconColor} />;
      iconShift = -1.75;
    } else if (kind === "contact") {
      IconEl = <UserIcon size={14} color={iconColor} />;
      iconShift = -1;
    } else if (kind === "poll") {
      IconEl = <BarChart2 size={14} color={iconColor} />;
      iconShift = -1;
    } else if (kind === "music") {
      IconEl = <Music size={14} color={iconColor} />;
      iconShift = -1;
    } else if (kind === "sticker") {
      IconEl = <StickerIcon size={14} color={iconColor} />;
      iconShift = -1;
    } else if (kind === "call") {
      // "callIsVideo" GERCEK bilgiyi tasir (bkz. DMMessage.callIsVideo) -
      // metindeki "🎥" emojisine sadece bu alan YOKSA (eski DMReply
      // cagrilari) geri donulur. Bu fark ONEMLI: CEVAPSIZ aramalarda
      // (0035_dm_call_messages.sql) metin HER ZAMAN "📞 Cevapsız arama"
      // olur - görüntülü olsa bile emoji tasimaz, bu yuzden sadece metne
      // bakmak cevapsiz GORUNTULU aramalari hep "sesli" gibi gosterirdi.
      const isVideoCall = callIsVideo ?? text.includes("🎥");
      IconEl = isVideoCall ? <AppIcon name="video" size={14} color={iconColor} /> : <Phone size={14} color={iconColor} />;
    }
  }

  return (
    <View style={[styles.row, cancelOuter]}>
      {hasThumb ? (
        kind === "photo" ? (
          <Image source={{ uri: mediaUrl! }} style={[styles.thumbAbs, { left: thumbLeft, width: thumbSize }]} onLayout={handleThumbLayout} />
        ) : (
          <View style={[styles.thumbAbs, { left: thumbLeft, width: thumbSize }]} onLayout={handleThumbLayout}>
            <VideoThumb uri={mediaUrl!} />
          </View>
        )
      ) : null}
      <View style={[styles.textCol, textPad]}>
        <Text style={[styles.fromName, { color: fromColor }]} numberOfLines={1}>
          {fromName}
        </Text>
        <View style={styles.bodyRow}>
          {!!IconEl && <View style={[styles.bodyIcon, { marginLeft: iconShift }]}>{IconEl}</View>}
          <Text style={[styles.bodyText, { color: isViewOnceMedia ? viewOnceColor : bodyColor }]} numberOfLines={1}>
            {label}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 1 },
  // Kucuk resim varken "row" disaridaki kutunun (replyQuote: paddingHorizontal:8,
  // paddingVertical:6, borderLeftWidth:3 / replyBarText: paddingHorizontal:10,
  // paddingVertical:12) dolgusunu negatif marjla iptal edip onun TAM dis
  // kenarina tasiniyor - resim buna gore top/left/bottom:3 ile konumlanabilsin diye.
  cancelBubble: { position: "relative", marginLeft: -11, marginRight: -8, marginTop: -6, marginBottom: -6 },
  cancelComposer: { position: "relative", marginLeft: -10, marginRight: -10, marginTop: -12, marginBottom: -12 },
  thumbAbs: { position: "absolute", top: 3, bottom: 3, borderRadius: 6, overflow: "hidden", backgroundColor: "#000000" },
  thumbWrap: { flex: 1 },
  textCol: { flexShrink: 1, minWidth: 0 },
  fromName: { fontSize: 12, fontWeight: "700" },
  bodyRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 1 },
  bodyIcon: { opacity: 0.9 },
  // Asagidaki ikiliyle (bkz. IconEl'deki isViewOnceMedia dali) satir/blok
  // yuksekligini DEGISTIRMEDEN (ayak izi digerleriyle ayni 14x14) cok daha
  // buyuk bir ikonu TAM ORTALANMIS sekilde disari tasirarak gostermek icin -
  // 46px ikon icin offset = (46-14)/2 = 16.
  viewOnceIconOverflowBox: { width: 14, height: 14 },
  viewOnceIconAbs: { position: "absolute", left: -16, top: -16 },
  bodyText: { fontSize: 12, flexShrink: 1 },
});
