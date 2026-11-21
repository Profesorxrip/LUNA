import React, { useState } from "react";
import { View, Text, Image, StyleSheet, LayoutChangeEvent } from "react-native";
import { useVideoPlayer, VideoView } from "expo-video";
import { Image as ImageIcon, MapPin, File as FileIcon, Phone, User as UserIcon, BarChart2, Music, Sticker as StickerIcon } from "lucide-react-native";
import { MicrophoneIcon } from "react-native-heroicons/outline";
import AppIcon from "./Icon";
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
export default function ReplyPreviewContent({ fromName, text, kind, mediaUrl, callIsVideo, variant }: Props) {
  const fromColor = "#FFFFFF";
  const bodyColor = variant === "bubble" ? "rgba(255,255,255,0.75)" : "#9A8F80";
  const iconColor = variant === "bubble" ? "rgba(255,255,255,0.85)" : "#9A8F80";
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

  const hasThumb = (kind === "photo" || kind === "video") && !!mediaUrl;
  // Foto/video icin "text" alani ya SABIT bir varsayilan ("📷 Fotoğraf"/
  // "🎥 Video" - emoji ON EKLI) YA DA kullanicinin yazdigi GERCEK bir
  // altyazi (emoji eki OLMADAN, "Beyaz BMW" gibi) olabilir (bkz.
  // 0033/0034_dm_message_kinds.sql: "coalesce(nullif(trim(caption),''), ...)").
  // Asagidaki "ilk kelimeyi emoji sanip kirpma" numarasi bu YUZDEN foto/
  // videoda GUVENSIZ: gercek bir altyazi varsa ilk kelimesini yerdi ("Beyaz
  // BMW" -> "BMW"). O yuzden bu iki turde kucuk resim zaten "foto/video
  // oldugunu" gosterdigi icin, altyaziyi hic DENEMEDEN sabit bir tur
  // etiketi gosteriyoruz.
  const displayText = kind === "photo" ? "Fotoğraf" : kind === "video" ? "Video" : text;
  // Diger zengin (ikonlu) turlerde metin HER ZAMAN sunucunun kendi sabit
  // "emoji + etiket" seklidir (voice/location/call) ya da "emoji + dosya
  // adi" (file) - orada ilk "kelimeyi" (emojiyi) kirpmak guvenli. "text"
  // turu de DB'de HER ZAMAN dolu geliyor (not null default 'text'), bu
  // yuzden "kind ?" tek basina duz metin mesajlarinin da ILK KELIMESINI
  // yanlislikla emoji saniyordu.
  const isRichKind = kind && kind !== "text" && kind !== "photo" && kind !== "video";
  const label = isRichKind ? displayText.replace(/^\S+\s*/u, "") || displayText : displayText;

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
    if (kind === "photo") IconEl = <ImageIcon size={14} color={iconColor} />;
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
          <Text style={[styles.bodyText, { color: bodyColor }]} numberOfLines={1}>
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
  bodyText: { fontSize: 12, flexShrink: 1 },
});
