import React from "react";
import { View, Text, Image, TouchableOpacity, StyleSheet, ScrollView, StyleProp, ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import { PublicRoomSummary } from "../services/socket";
import { theme } from "../theme";
import PlatformBadge from "./PlatformBadge";
import AdultBadge from "./AdultBadge";
import { badgeInfoForSource } from "../utils/media";

function sourceIcon(type: string): string {
  if (type === "hls" || type === "mp4") return "🎬";
  if (type === "external") return "🔗";
  return "▶";
}

const AVATAR_COLORS = ["#3A2F22", "#1F3D24", "#2E4A2F", "#4A3B22"];

interface Props {
  room: PublicRoomSummary;
  friendIds?: Set<string>;
  onPress?: () => void;
  onLongPress?: () => void;
  onOpenParticipant?: (peer: { userId: string; name: string }) => void;
  style?: StyleProp<ViewStyle>;
}

/** Discover'daki oda kartinin TEK kaynagi - baska bir ekranda (orn. profildeki
 * "su an acik odasi") ayni kart gerekirse BURADAN kullanilir, kopyalanmaz -
 * boylece ikisi her zaman birebir ayni gorunur. */
export default function RoomCard({ room, friendIds = new Set(), onPress, onLongPress, onOpenParticipant, style }: Props) {
  const badgeInfo = badgeInfoForSource(room.source);
  return (
    <TouchableOpacity style={[styles.card, style]} onPress={onPress} onLongPress={onLongPress} delayLongPress={350}>
      {room.source?.coverUrl ? (
        <Image source={{ uri: room.source.coverUrl }} style={styles.thumbnail} />
      ) : room.source?.type === "youtube" ? (
        <Image source={{ uri: `https://img.youtube.com/vi/${room.source.url}/hqdefault.jpg` }} style={styles.thumbnail} />
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
      <LinearGradient colors={["transparent", "rgba(0,0,0,0.88)"]} style={styles.cardGradient} pointerEvents="none" />
      <View style={styles.cardOverlay} pointerEvents="box-none">
        <Text style={styles.cardTitle} numberOfLines={1}>
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
                disabled={!p.userId || !onOpenParticipant}
                onPress={() => p.userId && onOpenParticipant?.({ userId: p.userId, name: p.name })}
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
  card: { backgroundColor: theme.surface, borderRadius: 12, margin: 6, overflow: "hidden", borderWidth: 1, borderColor: theme.border },
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
