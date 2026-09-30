import React, { useEffect, useState } from "react";
import { View, Text, Image, FlatList, TouchableOpacity, StyleSheet, Alert } from "react-native";
import { getSocket, PublicRoomSummary, RoomParticipantDetail, MediaSource } from "../services/socket";
import { theme } from "../theme";
import Icon from "../components/Icon";
import PlatformBadge from "../components/PlatformBadge";
import CountryFlag from "../components/CountryFlag";
import { PlatformKey } from "../components/PlatformLogo";
import { EXTERNAL_PLATFORMS } from "../utils/media";

interface Props {
  room: PublicRoomSummary;
  onBack: () => void;
  onJoin: () => void;
  onOpenParticipant: (peer: { userId: string; name: string; handle?: string }) => void;
}

function bareDomain(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
}

function platformInfo(source: MediaSource | null): { key: PlatformKey; label: string } | null {
  if (!source) return null;
  if (source.type === "youtube") return { key: "youtube", label: "YouTube" };
  if (source.type === "external") {
    const match = EXTERNAL_PLATFORMS.find((p) => bareDomain(source.url).includes(bareDomain(p.url)));
    return match ? { key: match.logo, label: match.label } : null;
  }
  return null;
}

const AVATAR_COLORS = ["#3A2F22", "#1F3D24", "#2E4A2F", "#4A3B22"];

export default function RoomPreviewScreen({ room, onBack, onJoin, onOpenParticipant }: Props) {
  const [participants, setParticipants] = useState<RoomParticipantDetail[]>([]);
  const [participantCount, setParticipantCount] = useState(room.participantCount);

  useEffect(() => {
    getSocket().emit("room:participants", { code: room.code }, (res: any) => {
      if (res?.ok) {
        setParticipants(res.participants);
        setParticipantCount(res.participantCount);
      }
    });
  }, [room.code]);

  const platform = platformInfo(room.source);
  const isExternal = room.source?.type === "external";

  function showSyncNotice() {
    Alert.alert(
      "Otomatik senkron yok",
      "Bu platform DRM korumali oldugu icin oynatma otomatik senkronize edilmiyor - sohbet ve sesli sohbet acik kalmaya devam eder."
    );
  }

  return (
    <View style={styles.screen}>
      <FlatList
        data={participants}
        keyExtractor={(item, i) => item.userId || `guest-${i}`}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <>
            <View style={styles.header}>
              <TouchableOpacity onPress={onBack} hitSlop={10}>
                <Icon name="chevronLeft" size={22} color={theme.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.coverWrap}>
              {room.source?.coverUrl ? (
                <Image source={{ uri: room.source.coverUrl }} style={styles.cover} />
              ) : room.source?.type === "youtube" ? (
                <Image source={{ uri: `https://img.youtube.com/vi/${room.source.url}/hqdefault.jpg` }} style={styles.cover} />
              ) : (
                <View style={[styles.cover, styles.coverPlaceholder]} />
              )}
              <View style={styles.playBadge}>
                <Icon name="play" size={26} color="#FFFFFF" />
              </View>
              {platform && (
                <View style={styles.platformBadge}>
                  <PlatformBadge platform={platform.key} size={30} />
                </View>
              )}
            </View>

            <Text style={styles.title} numberOfLines={2}>
              {room.title}
            </Text>
            {platform && <Text style={styles.platformLabel}>{platform.label}</Text>}

            <View style={styles.statusRow}>
              <View style={styles.statusLeft}>
                <Text style={styles.statusText}>{room.isPlaying ? "Oynatılıyor" : "Duraklatıldı"}</Text>
                <Text style={styles.statusDot}>•</Text>
                <Text style={styles.statusText}>Açık</Text>
                <Icon name="globe" size={16} color={theme.textMuted} />
              </View>
              {isExternal && (
                <TouchableOpacity style={styles.warningBadge} onPress={showSyncNotice} hitSlop={8}>
                  <Icon name="warning" size={18} color={theme.info} />
                </TouchableOpacity>
              )}
            </View>
          </>
        }
        renderItem={({ item, index }) => (
          <TouchableOpacity
            style={styles.participantRow}
            disabled={!item.userId}
            onPress={() => item.userId && onOpenParticipant({ userId: item.userId, name: item.name, handle: item.handle || undefined })}
          >
            {item.avatarUrl ? (
              <Image source={{ uri: item.avatarUrl }} style={styles.participantAvatar} />
            ) : (
              <View style={[styles.participantAvatar, styles.participantAvatarFallback, { backgroundColor: AVATAR_COLORS[index % AVATAR_COLORS.length] }]}>
                <Text style={styles.participantAvatarInitial}>{item.name.charAt(0).toUpperCase()}</Text>
              </View>
            )}
            <View style={styles.participantInfo}>
              <Text style={styles.participantName}>
                {item.isHost ? "👑 " : ""}
                {item.name}
              </Text>
              {item.handle && <Text style={styles.participantHandle}>@{item.handle}</Text>}
            </View>
            <CountryFlag country={item.country} size={22} />
          </TouchableOpacity>
        )}
      />

      <TouchableOpacity style={styles.joinButton} onPress={onJoin}>
        <Text style={styles.joinButtonText}>Odaya Katıl ({participantCount})</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.bg },
  listContent: { paddingBottom: 100 },
  header: { paddingHorizontal: 16, paddingTop: 50, paddingBottom: 12 },
  coverWrap: { marginHorizontal: 16, borderRadius: 16, overflow: "hidden" },
  cover: { width: "100%", aspectRatio: 16 / 10 },
  coverPlaceholder: { backgroundColor: theme.surfaceAlt },
  playBadge: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  platformBadge: { position: "absolute", top: 12, right: 12 },
  title: { color: theme.text, fontSize: 20, fontWeight: "700", marginHorizontal: 16, marginTop: 16 },
  platformLabel: { color: theme.textMuted, fontSize: 14, marginHorizontal: 16, marginTop: 4 },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: 16,
    marginTop: 10,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderColor: theme.border,
  },
  statusLeft: { flexDirection: "row", alignItems: "center", gap: 6 },
  statusText: { color: theme.textMuted, fontSize: 13 },
  statusDot: { color: theme.textMuted, fontSize: 13 },
  warningBadge: { width: 34, height: 34, borderRadius: 17, backgroundColor: "rgba(59,130,246,0.15)", alignItems: "center", justifyContent: "center" },
  participantRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  participantAvatar: { width: 48, height: 48, borderRadius: 24 },
  participantAvatarFallback: { alignItems: "center", justifyContent: "center" },
  participantAvatarInitial: { color: theme.accent, fontSize: 18, fontWeight: "700" },
  participantInfo: { flex: 1 },
  participantName: { color: theme.text, fontSize: 15, fontWeight: "600" },
  participantHandle: { color: theme.textMuted, fontSize: 13, marginTop: 1 },
  joinButton: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 24,
    backgroundColor: theme.accent,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
  },
  joinButtonText: { color: "#04140D", fontSize: 16, fontWeight: "700" },
});
