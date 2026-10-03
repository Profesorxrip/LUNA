import React, { useEffect, useState } from "react";
import { View, Text, Image, FlatList, TouchableOpacity, StyleSheet } from "react-native";
import { getSocket, PublicRoomSummary, RoomParticipantDetail, MediaSource, PrivacyLevel } from "../services/socket";
import { theme } from "../theme";
import Icon from "../components/Icon";
import { showAlert } from "../components/CustomAlert";
import LoadingView from "../components/LoadingView";
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

const PRIVACY_LABEL: Record<PrivacyLevel, string> = {
  open: "Açık",
  nearby: "Yakındakiler",
  friends: "Sadece Arkadaşlar",
  invite: "Sadece Davet İle",
};

function formatTime(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export default function RoomPreviewScreen({ room, onBack, onJoin, onOpenParticipant }: Props) {
  const [participants, setParticipants] = useState<RoomParticipantDetail[]>([]);
  const [loadingParticipants, setLoadingParticipants] = useState(true);
  const [position, setPosition] = useState(room.positionSeconds);

  useEffect(() => {
    getSocket().emit("room:participants", { code: room.code }, (res: any) => {
      if (res?.ok) setParticipants(res.participants);
      setLoadingParticipants(false);
    });
  }, [room.code]);

  const hasDuration = room.durationSeconds != null && room.durationSeconds > 0;
  const hasEnded = hasDuration && position >= room.durationSeconds!;

  // Oynatiliyorsa konumu ekranda canli sekilde ilerletiyoruz - tipki
  // referans ss'deki "2:15/3:36" gibi surekli akan bir sayac. Video suresine
  // ulasinca ("bitti") sayaci orada durduruyoruz, suresiz ilerlemesin.
  useEffect(() => {
    if (!room.isPlaying || hasEnded) return;
    const timer = setInterval(
      () => setPosition((p) => (hasDuration ? Math.min(p + 1, room.durationSeconds!) : p + 1)),
      1000
    );
    return () => clearInterval(timer);
  }, [room.isPlaying, hasEnded, hasDuration]);

  const platform = platformInfo(room.source);
  const isExternal = room.source?.type === "external";
  const statusText = hasEnded ? "Bitti" : room.isPlaying ? "Oynatılıyor" : "Duraklatıldı";

  function showSyncNotice() {
    showAlert(
      "Otomatik senkron yok",
      "Bu platform DRM korumali oldugu icin oynatma otomatik senkronize edilmiyor - sohbet ve sesli sohbet acik kalmaya devam eder."
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} hitSlop={10}>
          <Icon name="chevronLeft" size={22} color={theme.text} />
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.coverWrap} activeOpacity={0.9} onPress={onJoin}>
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
      </TouchableOpacity>

      <Text style={styles.title} numberOfLines={2}>
        {room.title}
      </Text>
      {platform && <Text style={styles.platformLabel}>{platform.label}</Text>}

      <View style={styles.statusRow}>
        <View style={styles.statusLeft}>
          <Text style={styles.statusText}>{statusText}</Text>
          {hasDuration && (
            <>
              <Text style={styles.statusDot}>•</Text>
              <Text style={styles.statusText}>
                {formatTime(position)}/{formatTime(room.durationSeconds!)}
              </Text>
            </>
          )}
          <Text style={styles.statusDot}>•</Text>
          <Text style={styles.statusText}>{PRIVACY_LABEL[room.privacy]}</Text>
          <Icon name={room.privacy === "friends" ? "people" : room.privacy === "invite" ? "invite" : room.privacy === "nearby" ? "pin" : "globe"} size={16} color={theme.textMuted} />
        </View>
        {isExternal && (
          <TouchableOpacity style={styles.warningBadge} onPress={showSyncNotice} hitSlop={8}>
            <Icon name="warning" size={18} color={theme.info} />
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={participants}
        keyExtractor={(item, i) => item.userId || `guest-${i}`}
        style={styles.participantList}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          loadingParticipants ? (
            <LoadingView />
          ) : (
            <Text style={styles.emptyText}>Katılımcı bilgisi alınamadı.</Text>
          )
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
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.bg },
  participantList: { flex: 1 },
  emptyText: { color: theme.textMuted, fontSize: 13, textAlign: "center", marginTop: 40 },
  listContent: { paddingBottom: 24 },
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
});
