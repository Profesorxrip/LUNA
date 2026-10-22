import React, { useState } from "react";
import { View, Text, Image, TouchableOpacity, StyleSheet, ScrollView, StyleProp, ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { PublicRoomSummary } from "../services/socket";
import { theme } from "../theme";
import PlatformBadge from "./PlatformBadge";
import AdultBadge from "./AdultBadge";
import { badgeInfoForSource, coverUrlForSource } from "../utils/media";

const AVATAR_COLORS = ["#1E3A5F", "#1F2F52", "#2A2F63", "#17405A"];
const AVATAR_W = 40;
const AVATAR_PITCH = 44; // avatar genisligi + aralarindaki 4px bosluk
// Cerceve/nokta SABIT (35x20) kaldigi icin sayi haneye gore kuculuyor -
// 1-2 hanede normal boyut, 3 hanede biraz, 4+ hanede daha da kucuk.
function countFontSize(count: number): number {
  const digits = String(count).length;
  if (digits <= 2) return 10;
  if (digits === 3) return 8;
  return 6;
}
// Gercek NASA ay yuzeyi dokusu (duz/equirectangular harita, kure degil) -
// tekil tekrarlanan daireler yerine SUREKLI bir doku olarak kart arka
// planini kaplamak icin kullaniliyor.
const MOON_TEXTURE = require("../../assets/moon-texture.jpg");

interface Props {
  room: PublicRoomSummary;
  friendIds?: Set<string>;
  onPress?: () => void;
  onLongPress?: () => void;
  onOpenParticipant?: (peer: { userId: string; name: string }) => void;
  // Bir katilimci avatarina BASILI TUTUNCA - kartin geri kalanindaki
  // onLongPress'ten (oda onizlemesini acar) FARKLI olarak, o kisinin
  // profil kartini (bkz. ProfileOptionsSheet.tsx) acar.
  onLongPressParticipant?: (peer: { userId: string; name: string }) => void;
  style?: StyleProp<ViewStyle>;
}

/** Varyant D - "Twitch tarzi yatay yayin karti" (v2 mockup #5) - kucuk kare
 * on-izleme solda (platform rozeti ustune bindirilmis), sagda baslik +
 * avatarlar. Goz/katilimci sayisi rozeti artik on-izlemenin degil, KARTIN
 * KENDISININ sag ust kosesinde. */
export default function RoomCardVariantD({
  room,
  friendIds = new Set(),
  onPress,
  onLongPress,
  onOpenParticipant,
  onLongPressParticipant,
  style,
}: Props) {
  const coverUrl = coverUrlForSource(room.source);
  const badgeInfo = badgeInfoForSource(room.source);
  // Kaydirma alaninin olcülen genisligi TAM avatar sayisina
  // yuvarlaniyor - boylece varsayilan (kaydirilmamis) halde son
  // avatar YARIM kesik gorunmuyor, sadece kullanici gercekten
  // kaydirinca bir sonraki avatar(lar) ortaya cikiyor.
  const [scrollW, setScrollW] = useState<number | null>(null);
  return (
    <TouchableOpacity
      style={[styles.card, style]}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      activeOpacity={0.85}
    >
      {/* Kartin KENDI dis sinirina kadar yayilan ay dokusu zemini - icerigin
          (kapak/baslik/pp/rozet) ALTINDA, kart.overflow:"hidden" sayesinde
          dis kosede kirpiliyor. */}
      <Image source={MOON_TEXTURE} resizeMode="cover" style={[StyleSheet.absoluteFill, { opacity: 0.3 }]} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.accentBright, opacity: 0.45 }]} />
      <>
          <View style={styles.thumbSq}>
            {coverUrl && <Image source={{ uri: coverUrl }} style={StyleSheet.absoluteFill} />}
            {badgeInfo && (
              <View style={styles.platformBadge}>
                <PlatformBadge platform={badgeInfo.key} faviconUrl={badgeInfo.faviconUrl} size={16} />
              </View>
            )}
            {room.isAdult && (
              // Rozet boyutu saninin rozetiyle (viewCount, 20px yukseklik) ayni
              // olacak sekilde kucultuldu ve kapagin sag ust kosesine tasindi.
              <View style={styles.adultBadgeOnThumb}>
                <AdultBadge size={20} />
              </View>
            )}
          </View>
          <View style={styles.viewCount}>
            <LinearGradient
              colors={["#6E9BC0", "#FFFFFF"]}
              start={{ x: 0.2, y: 0 }}
              end={{ x: 0.8, y: 1 }}
              style={styles.liveDot}
            />
            <Text style={[styles.viewCountText, { fontSize: countFontSize(room.participantCount) }]}>
              {room.participantCount}
            </Text>
          </View>
          <View style={styles.right}>
            <Text style={[styles.title, styles.titleNarrow]} numberOfLines={3}>
              {room.title}
            </Text>
            <View style={styles.avatarsRowWrap}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={[styles.avatarsRow, scrollW != null && { flex: undefined, width: scrollW }]}
                contentContainerStyle={styles.avatarsRowContent}
                onLayout={(e) => {
                  if (scrollW != null) return;
                  const measured = e.nativeEvent.layout.width;
                  if (measured < AVATAR_W) return;
                  const wholeCount = Math.floor((measured - AVATAR_W) / AVATAR_PITCH) + 1;
                  setScrollW(AVATAR_W + (wholeCount - 1) * AVATAR_PITCH);
                }}
              >
                {room.participants.map((p, i) => {
                  const isFriend = Boolean(p.userId && friendIds.has(p.userId));
                  return (
                    <TouchableOpacity
                      key={i}
                      disabled={!p.userId || (!onOpenParticipant && !onLongPressParticipant)}
                      onPress={() => p.userId && onOpenParticipant?.({ userId: p.userId, name: p.name })}
                      onLongPress={() => p.userId && onLongPressParticipant?.({ userId: p.userId, name: p.name })}
                      delayLongPress={350}
                      style={[
                        styles.avatar,
                        { backgroundColor: AVATAR_COLORS[i % AVATAR_COLORS.length], marginLeft: i === 0 ? 0 : 4 },
                        isFriend && styles.avatarFriend,
                      ]}
                    >
                      <Text style={styles.avatarInitial}>{p.name.charAt(0).toUpperCase()}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          </View>
        </>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.surface,
    borderRadius: 16,
    margin: 6,
    padding: 6,
    flexDirection: "row",
    gap: 8,
    borderWidth: 1,
    borderColor: "rgba(14,165,233,0.22)",
    overflow: "hidden",
  },
  // Kartla arasinda (padding ile) bosluk birakan ORIJINAL yapi korunuyor -
  // yukseklik SABIT (kart boyutu degismesin diye), sadece genislik artti -
  // "aspectRatio" yerine KENDI height'i var, kartin toplam yuksekligini
  // artik DIKTE ETMIYOR.
  thumbSq: {
    width: 150,
    height: 100,
    // Kapak hep 150x100 SABIT kalsin - satir stretch'iyle buyumesin diye
    // savunma amacli "flex-start" (asil hiza sorunu asagidaki "right"ta).
    alignSelf: "flex-start",
    borderRadius: 12,
    backgroundColor: "#12202f",
    overflow: "hidden",
  },
  platformBadge: {
    position: "absolute",
    top: 6,
    left: 6,
  },
  adultBadgeOnThumb: {
    position: "absolute",
    top: 6,
    right: 6,
  },
  // SABIT boyut - 4 haneye kadar (ornegin "1234") NOKTA + sayi RAHATCA sigacak
  // sekilde bir kere ayarlandi, sonra HICBIR haneli sayida degismiyor.
  // Nokta artik SOL kenara (cok yakin ama DEGMEDEN) SABIT - sayi onun
  // sagina dogru buyuyor, boylece kac haneli olursa olsun noktanin yeri hic
  // kaymiyor (eskiden "flex-end" ile butun grup saga yaslandigi icin nokta
  // da sayiya gore kayiyordu).
  viewCount: {
    position: "absolute",
    top: 7,
    right: 8,
    width: 35,
    height: 20,
    overflow: "hidden",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 4,
    backgroundColor: "rgba(0,0,0,0.55)",
    paddingLeft: 2,
    paddingRight: 8,
    borderRadius: 20,
  },
  liveDot: {
    width: 13,
    height: 13,
    borderRadius: 6.5,
  },
  viewCountText: { color: "#FFFFFF", fontSize: 10, fontWeight: "700" },
  // Video ismi SABIT bir "paddingTop" ile konumlaniyor (alttaki avatar
  // satirinin boyu onu ETKILEMIYOR). "space-between" ile avatar satiri HER
  // ZAMAN sutunun EN ALTINA (kapak resminin alt kenariyla ayni hizaya)
  // oturuyor - kisa baslikli kartlarda avatarlar ustte bosluk birakip
  // yukarida "yuzmesin" diye (eskiden baslik kisa oldugunda avatarlar
  // olmasi gerekenden yukarida kaliyordu).
  right: { flex: 1, minWidth: 0, paddingTop: 6, justifyContent: "space-between", gap: 6 },
  // Sag tarafta goz/sayi rozetine yer birakmak icin sabit bir paddingRight -
  // uzun video isimleri rozetin ALTINA/UZERINE binmeden "..." ile kesiliyor.
  // Artik 3 SATIRA kadar uzayabiliyor (daha kucuk puntoyla) - tek satira
  // sigmayan uzun isimler icin okunurluk artti.
  title: { color: "#FFFFFF", fontSize: 11.5, lineHeight: 14, fontWeight: "700" },
  titleNarrow: { paddingRight: 38 },
  avatarsRowWrap: { flexDirection: "row", alignItems: "center" },
  avatarsRow: { flex: 1 },
  avatarsRowContent: { flexDirection: "row" },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: theme.surface,
  },
  avatarFriend: { borderWidth: 2.2, borderColor: theme.accentBright },
  avatarInitial: { color: theme.accent, fontSize: 16, fontWeight: "700" },
});
