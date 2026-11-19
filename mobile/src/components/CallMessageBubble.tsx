import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Phone } from "lucide-react-native";
import Icon from "./Icon";
import { formatDuration } from "../utils/format";

interface Props {
  isVideo: boolean;
  status: "completed" | "missed";
  durationMs: number | null;
}

const CALL_COLOR = "#34D399";
const MISSED_COLOR = "#F87171";

/** Sesli/goruntulu arama bittiginde (kapatildi/reddedildi/cevap verilmedi)
 * sohbete dusen KAYIT balonu - dosya/konum balonlariyla AYNI kart dili
 * (8px kose yuvarlakligi, aynı yari-saydam kutu). Arama kendisi burdan
 * BASLATILAMAZ/tekrar aranamaz - sadece ne oldugunun ozeti. */
export default function CallMessageBubble({ isVideo, status, durationMs }: Props) {
  const missed = status === "missed";
  const color = missed ? MISSED_COLOR : CALL_COLOR;
  // Baslik HER ZAMAN arama turunu soyler (cevapsizda da "Cevapsız arama"
  // DEGIL) - cevapsiz oldugu bilgisi ikonun rengiyle VE alt satirdaki
  // "Cevaplanmadı" metniyle zaten veriliyor (kullanicinin istegi).
  const title = isVideo ? "Görüntülü arama" : "Sesli arama";
  const subtitle = missed ? "Cevaplanmadı" : durationMs != null ? formatDuration(durationMs / 1000) : null;

  return (
    <View style={styles.card}>
      <View style={[styles.iconWrap, { backgroundColor: `${color}2E` }]}>
        {isVideo ? <Icon name="video" size={26} color={color} /> : <Phone size={26} color={color} />}
      </View>
      <View style={styles.textCol}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    // Ikon kutusuyla metin (baslik+sure) arasi tam 3px - kullanicinin istegi.
    gap: 3,
    minWidth: 200,
    maxWidth: 260,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 8,
    // Ikon kutusu (yesil/kirmizi) bu seffaf kartin sol/ust/alt kenarina
    // DIGER balonlardaki (foto/konum/dosya) AYNI 3px desenle yasiyor -
    // sag taraf metin icin ayri (gap ile) oldugundan dokunulmadi.
    paddingLeft: 3,
    paddingTop: 3,
    paddingBottom: 3,
    paddingRight: 12,
  },
  iconWrap: {
    width: 54,
    height: 54,
    // Seffaf kartin kendi kose yuvarlakligiyla (8) AYNI - kullanicinin istegi.
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  textCol: { flex: 1, minWidth: 0, marginTop: -20, marginLeft: 5 },
  title: { color: "#FFFFFF", fontSize: 14, fontWeight: "700", marginTop: 11, marginLeft: -2 },
  subtitle: { color: "rgba(255,255,255,0.75)", fontSize: 12, marginTop: 6, marginLeft: -2 },
});
