import React from "react";
import { View, Text, Image, TouchableOpacity, StyleSheet, ScrollView, StyleProp, ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import { useFonts, BebasNeue_400Regular } from "@expo-google-fonts/bebas-neue";
import { PublicRoomSummary } from "../services/socket";
import { theme } from "../theme";
import PlatformBadge from "./PlatformBadge";
import AdultBadge from "./AdultBadge";
import { badgeInfoForSource, coverUrlForSource } from "../utils/media";

function sourceIcon(type: string): string {
  if (type === "hls" || type === "mp4") return "🎬";
  if (type === "external") return "🔗";
  return "▶";
}

// Eskiden kahverengi/yesil tonlar (markayla alakasiz) - LUNA'nin kendi gece
// gokyuzu paletinden (lacivert/mavi/mor aile, AppBackground/LunaSpinner ile
// AYNI dunya) 4 koyu ton. Beyaz bas harf hala net okunuyor.
const AVATAR_COLORS = ["#1E3A5F", "#1F2F52", "#2A2F63", "#17405A"];

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

/** Discover'daki oda kartinin TEK kaynagi - baska bir ekranda (orn. profildeki
 * "su an acik odasi") ayni kart gerekirse BURADAN kullanilir, kopyalanmaz -
 * boylece ikisi her zaman birebir ayni gorunur. */
export default function RoomCard({ room, friendIds = new Set(), onPress, onLongPress, onOpenParticipant, onLongPressParticipant, style }: Props) {
  const badgeInfo = badgeInfoForSource(room.source);
  const coverUrl = coverUrlForSource(room.source);
  // Baslik icin LoginScreen'deki AYNI marka fontu (Bebas Neue) - yuklenene
  // kadar sistem fontuyla gosteriliyor (kisa bir baslik oldugu icin
  // yukleme anindaki "atlama" neredeyse fark edilmiyor).
  const [fontsLoaded] = useFonts({ BebasNeue_400Regular });
  return (
    <TouchableOpacity style={[styles.card, style]} onPress={onPress} onLongPress={onLongPress} delayLongPress={350}>
      {coverUrl ? (
        <Image source={{ uri: coverUrl }} style={styles.thumbnail} />
      ) : (
        <View style={[styles.thumbnail, styles.thumbnailPlaceholder]}>
          <Text style={styles.thumbnailPlaceholderText}>{room.source ? sourceIcon(room.source.type) : "▶"}</Text>
        </View>
      )}
      {/* 18+ isaretli odalarin kapak resmi - hideAdultContent kapali olsa bile
          (o zaten odayi tamamen gizliyor) kart burada GORUNUYORSA kapak hic
          acik sekilde gosterilmez, her zaman bulanik kalir. */}
      {room.isAdult && (
        <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} pointerEvents="none" />
      )}
      {badgeInfo && (
        <View style={styles.platformBadge} pointerEvents="none">
          <PlatformBadge platform={badgeInfo.key} faviconUrl={badgeInfo.faviconUrl} size={26} />
        </View>
      )}
      {room.isAdult && (
        <View style={styles.adultBadge} pointerEvents="none">
          <AdultBadge />
        </View>
      )}
      <LinearGradient colors={["transparent", "rgba(4,9,18,0.92)"]} style={styles.cardGradient} pointerEvents="none" />
      <View style={styles.cardOverlay} pointerEvents="box-none">
        <Text style={[styles.cardTitle, fontsLoaded && styles.cardTitleFontLoaded]} numberOfLines={1}>
          {room.title}
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.participantsRow}
          contentContainerStyle={styles.participantsRowContent}
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
                  styles.participantAvatar,
                  { backgroundColor: AVATAR_COLORS[i % AVATAR_COLORS.length], marginLeft: i === 0 ? 0 : 4 },
                  isFriend && styles.participantAvatarFriend,
                ]}
              >
                <Text style={styles.participantAvatarInitial}>{p.name.charAt(0).toUpperCase()}</Text>
              </TouchableOpacity>
            );
          })}
          {room.participantCount > room.participants.length && (
            <View style={[styles.participantAvatar, styles.participantExtraCircle, { marginLeft: 4 }]}>
              <Text style={styles.participantAvatarInitial}>+{room.participantCount - room.participants.length}</Text>
            </View>
          )}
        </ScrollView>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  // Koseler onceki 12'den biraz daha yumusak (16) - uygulamanin diger
  // kare/squircle ikon kutularindaki (orn. LoginScreen providerIconBox)
  // yuvarlakligiyla tutarli. Cerceve artik notr gri degil, vurgu rengine
  // (theme.accent) hafifce calan, cok dusuk opaklikta bir hat - jenerik
  // "kart" hissi yerine LUNA'nin kendi renk dunyasina ait oldugunu belli
  // ediyor.
  card: {
    backgroundColor: theme.surface,
    borderRadius: 16,
    margin: 6,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(14,165,233,0.22)",
  },
  thumbnail: { width: "100%", aspectRatio: 2.8 / 1, backgroundColor: theme.surfaceAlt },
  thumbnailPlaceholder: { justifyContent: "center", alignItems: "center" },
  thumbnailPlaceholderText: { color: theme.textMuted, fontSize: 26 },
  platformBadge: {
    position: "absolute",
    top: 8,
    right: 8,
  },
  adultBadge: {
    position: "absolute",
    top: 8,
    left: 8,
  },
  cardGradient: { position: "absolute", left: 0, right: 0, bottom: 0, height: "75%" },
  cardOverlay: { position: "absolute", left: 0, right: 0, bottom: 0, padding: 10 },
  cardTitle: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
  // Bebas Neue yuklenince: condensed/buyuk harf karakteri daha belirgin
  // olsun diye boyut/harf araligi bu fonta gore yeniden ayarlanir (bkz.
  // LoginScreen.tsx taglineFontLoaded AYNI mantik).
  cardTitleFontLoaded: {
    fontFamily: "BebasNeue_400Regular",
    fontWeight: "400",
    fontSize: 17,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  participantsRow: { marginTop: 5 },
  participantsRowContent: { flexDirection: "row", alignItems: "center", paddingRight: 4 },
  participantAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "rgba(0,0,0,0.55)",
  },
  // Arkadas oldugu bilinen katilimcinin avatarini digerlerinden ayirt
  // etmek icin parlak bir halka - Instagram hikaye halkasina benzer mantik.
  participantAvatarFriend: { borderWidth: 2.5, borderColor: theme.accentBright },
  participantExtraCircle: { backgroundColor: theme.surfaceAlt },
  participantAvatarInitial: { color: theme.accent, fontSize: 15, fontWeight: "700" },
});
