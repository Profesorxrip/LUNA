import React from "react";
import { View, Text, Image, StyleSheet } from "react-native";
import { useVideoPlayer, VideoView } from "expo-video";
import { Image as ImageIcon, MapPin, File as FileIcon, Phone } from "lucide-react-native";
import { MicrophoneIcon } from "react-native-heroicons/outline";
import AppIcon from "./Icon";
import { DMMessage } from "../services/socket";

interface Props {
  fromName: string;
  text: string;
  kind?: DMMessage["kind"] | null;
  mediaUrl?: string | null;
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
export default function ReplyPreviewContent({ fromName, text, kind, mediaUrl, variant }: Props) {
  const fromColor = "#FFFFFF";
  const bodyColor = variant === "bubble" ? "rgba(255,255,255,0.75)" : "#9A8F80";
  const iconColor = variant === "bubble" ? "rgba(255,255,255,0.85)" : "#9A8F80";
  const thumbSize = 38;
  const thumbLeft = 6;
  const thumbTextGap = 3;

  const hasThumb = (kind === "photo" || kind === "video") && !!mediaUrl;
  // Ikon bilgisi varken on ekteki emoji artik GEREKSIZ (ikon zaten onu
  // anlatiyor) - sadece ilk karakterin emoji olma ihtimaline karsi basit
  // bir kirpma (emoji + takip eden bosluk).
  const label = kind ? text.replace(/^\S+\s*/u, "") || text : text;

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
    } else if (kind === "call") {
      IconEl = text.includes("🎥") ? <AppIcon name="video" size={14} color={iconColor} /> : <Phone size={14} color={iconColor} />;
    }
  }

  return (
    <View style={[styles.row, cancelOuter]}>
      {hasThumb ? (
        kind === "photo" ? (
          <Image source={{ uri: mediaUrl! }} style={[styles.thumbAbs, { left: thumbLeft, width: thumbSize }]} />
        ) : (
          <View style={[styles.thumbAbs, { left: thumbLeft, width: thumbSize }]}>
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
