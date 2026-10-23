import React, { useEffect, useState } from "react";
import { View, Text, Image, FlatList, TouchableOpacity, StyleSheet } from "react-native";
import { BlurView } from "expo-blur";
import { ChevronLeftIcon } from "react-native-heroicons/outline";
import { useTranslation } from "react-i18next";
import { getSocket, PublicRoomSummary, RoomParticipantDetail, PrivacyLevel } from "../services/socket";
import { theme } from "../theme";
import Icon from "../components/Icon";
import CrownBadge from "../components/CrownBadge";
import { showAlert } from "../components/CustomAlert";
import LoadingView from "../components/LoadingView";
import PlatformBadge from "../components/PlatformBadge";
import AdultBadge from "../components/AdultBadge";
import CountryFlag from "../components/CountryFlag";
import { badgeInfoForSource, coverUrlForSource } from "../utils/media";
import { hideRoomFromDiscover } from "../utils/hiddenRooms";

interface Props {
  room: PublicRoomSummary;
  onBack: () => void;
  onJoin: () => void;
  onOpenParticipant: (peer: { userId: string; name: string; handle?: string }) => void;
}

const AVATAR_COLORS = ["#3A2F22", "#1F3D24", "#2E4A2F", "#4A3B22"];

function getPrivacyLabels(t: (key: string) => string): Record<PrivacyLevel, string> {
  return {
    open: t("roomPreview.privacyOpen"),
    nearby: t("roomPreview.privacyNearby"),
    friends: t("roomPreview.privacyFriends"),
    invite: t("roomPreview.privacyInvite"),
  };
}

function formatTime(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

// Odanin "Açıldı: 14:32" satiri icin - sadece saat:dakika, cihazin kendi
// yerel saatine gore (bkz. server/src/rooms.ts mapRoomSummary createdAtMs).
function formatOpenedTime(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function RoomPreviewScreen({ room, onBack, onJoin, onOpenParticipant }: Props) {
  const { t } = useTranslation();
  const [participants, setParticipants] = useState<RoomParticipantDetail[]>([]);
  const [loadingParticipants, setLoadingParticipants] = useState(true);
  const [position, setPosition] = useState(room.positionSeconds);

  useEffect(() => {
    getSocket().emit("room:participants", { code: room.code }, (res: any) => {
      if (res?.ok) setParticipants(res.participants);
      setLoadingParticipants(false);
    });
  }, [room.code]);

  // "Odayı Sil" - odayi GERCEKTEN silmiyor/kapatmiyor, sadece bu kullanicinin
  // KENDI Keşfet listesinden gizliyor (bkz. utils/hiddenRooms.ts) - herkes
  // kullanabilir, oda baskalarinda normal gorunmeye devam eder.
  function confirmHideRoom() {
    showAlert(t("roomPreview.deleteRoomTitle"), t("roomPreview.deleteRoomBody"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("roomPreview.remove"),
        style: "destructive",
        onPress: async () => {
          await hideRoomFromDiscover(room.code);
          onBack();
        },
      },
    ]);
  }

  function reportRoom() {
    const host = participants.find((p) => p.isHost);
    if (!host?.userId) return;
    getSocket().emit(
      "report:submit",
      { targetUserId: host.userId, reason: `Oda bildirildi: ${room.code} - ${room.title}` },
      (res: any) => {
        if (res?.ok) showAlert(t("discover.reportedTitle"), t("roomPreview.roomReportedBody"));
      }
    );
  }

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

  const platform = badgeInfoForSource(room.source);
  const coverUrl = coverUrlForSource(room.source);
  const statusText = hasEnded ? t("roomPreview.ended") : room.isPlaying ? t("roomPreview.playing") : t("roomPreview.paused");
  const privacyLabels = getPrivacyLabels(t);

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} hitSlop={10}>
          <ChevronLeftIcon size={22} color={theme.text} strokeWidth={2.6} />
        </TouchableOpacity>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={reportRoom} hitSlop={10} style={styles.warningIconWrap}>
            <Icon name="warning" size={20} color={theme.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity onPress={confirmHideRoom} hitSlop={10} style={styles.trashIconWrap}>
            <Icon name="trash" size={20} color={theme.danger} />
          </TouchableOpacity>
        </View>
      </View>

      <TouchableOpacity style={styles.coverWrap} activeOpacity={0.9} onPress={onJoin}>
        {coverUrl ? (
          <Image source={{ uri: coverUrl }} style={styles.cover} />
        ) : (
          <View style={[styles.cover, styles.coverPlaceholder]} />
        )}
        {room.isAdult && <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} pointerEvents="none" />}
        {platform && (
          <View style={styles.platformBadge}>
            <PlatformBadge platform={platform.key} faviconUrl={platform.faviconUrl} size={30} />
          </View>
        )}
        {room.isAdult && (
          <View style={styles.adultBadge}>
            <AdultBadge size={30} />
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
          <Text style={styles.statusText}>{privacyLabels[room.privacy]}</Text>
          <Icon name={room.privacy === "friends" ? "people" : room.privacy === "invite" ? "inviteKey" : room.privacy === "nearby" ? "radar" : "worldOpen"} size={16} color={theme.textMuted} />
          <Text style={styles.statusDot}>•</Text>
          <Text style={styles.statusText}>{t("roomPreview.openedAt", { time: formatOpenedTime(room.createdAtMs) })}</Text>
        </View>
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
            <Text style={styles.emptyText}>{t("roomPreview.noParticipantInfo")}</Text>
          )
        }
        renderItem={({ item, index }) => (
          <TouchableOpacity
            style={styles.participantRow}
            disabled={!item.userId}
            onPress={() => item.userId && onOpenParticipant({ userId: item.userId, name: item.name, handle: item.handle || undefined })}
          >
            <View style={styles.avatarWrap}>
              {item.avatarUrl ? (
                <Image source={{ uri: item.avatarUrl }} style={styles.participantAvatar} />
              ) : (
                <View style={[styles.participantAvatar, styles.participantAvatarFallback, { backgroundColor: AVATAR_COLORS[index % AVATAR_COLORS.length] }]}>
                  <Text style={styles.participantAvatarInitial}>{item.name.charAt(0).toUpperCase()}</Text>
                </View>
              )}
              {item.isHost && (
                <View style={styles.hostBadge}>
                  <CrownBadge size={20} color={theme.accent} />
                </View>
              )}
            </View>
            <View style={styles.participantInfo}>
              <Text style={styles.participantName}>{item.name}</Text>
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
  // Artik App.tsx'teki paylasilan AppBackground (degrade) arkada duruyor.
  screen: { flex: 1, backgroundColor: "transparent" },
  participantList: { flex: 1 },
  emptyText: { color: theme.textMuted, fontSize: 13, textAlign: "center", marginTop: 40 },
  // paddingTop, lider rozetinin (hostBadge, top: -16) KIRPILMADAN tam
  // gorunmesi icin - oncesinde ustte hic bosluk olmadigindan tacin yarisi
  // listenin disina tasiyip kesiliyordu.
  listContent: { paddingTop: 20, paddingBottom: 24 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 12,
  },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 16 },
  // Uyari ucgeni ve cop kutusu glifleri kendi 20x20 kutularinin icinde FARKLI
  // doluluk oranina sahip (ucgen ustte bosluk birakiyor, cop kutusu kulpuyla
  // birlikte kutunun daha alt kismini dolduruyor) - bu yuzden "alignItems:
  // center" ile kutular ortalansa bile gozle bakinca gorsel agirlik merkezleri
  // ayni cizgide durmuyor. Ikisini ayni optik hizaya getirmek icin kucuk bir
  // duzeltme.
  warningIconWrap: { marginTop: 2 },
  trashIconWrap: { marginTop: -2 },
  coverWrap: { marginHorizontal: 16, borderRadius: 16, overflow: "hidden" },
  cover: { width: "100%", aspectRatio: 16 / 10 },
  coverPlaceholder: { backgroundColor: theme.surfaceAlt },
  platformBadge: { position: "absolute", top: 12, right: 12 },
  adultBadge: { position: "absolute", top: 12, left: 12 },
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
  participantRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  avatarWrap: { position: "relative" },
  participantAvatar: { width: 48, height: 48, borderRadius: 24 },
  participantAvatarFallback: { alignItems: "center", justifyContent: "center" },
  // Lider rozeti - CrownBadge.tsx, profil fotografinin TAM USTUNE (negatif top ile) oturur.
  hostBadge: { position: "absolute", top: -16, left: 0, right: 0, alignItems: "center" },
  participantAvatarInitial: { color: theme.accent, fontSize: 18, fontWeight: "700" },
  participantInfo: { flex: 1 },
  participantName: { color: theme.text, fontSize: 15, fontWeight: "600" },
  participantHandle: { color: theme.textMuted, fontSize: 13, marginTop: 1 },
});
