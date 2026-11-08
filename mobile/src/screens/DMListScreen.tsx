import React, { useCallback, useEffect, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, FlatList, Image } from "react-native";
import { useTranslation } from "react-i18next";
import { useFocusEffect } from "@react-navigation/native";
import { getSocket } from "../services/socket";
import Avatar from "../components/Avatar";
import LoadingView from "../components/LoadingView";
import { DMPeer } from "./DMScreen";

const BG = "#000000";
const TEXT = "#F5F0E6";
const MUTED = "#9A8F80";
const ACCENT = "#38BDF8";

interface DMConversationSummary {
  conversationId: string;
  peerId: string;
  peerName: string;
  peerHandle: string | null;
  peerAvatarUrl: string | null;
  lastMessage: { text: string; createdAt: number; fromUserId: string } | null;
  unread: boolean;
}

interface Props {
  onOpenDM: (peer: DMPeer) => void;
}

// FriendsScreen.tsx'teki relativeTime ile AYNI - ayri bir ekran oldugu icin
// kucuk bir kopyasi burada tutuluyor.
function relativeTime(ts: number, t: (key: string, opts?: any) => string): string {
  const diffMs = Date.now() - ts;
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return t("friends.justNow");
  if (min < 60) return t("friends.minutesAgo", { count: min });
  const hour = Math.floor(min / 60);
  if (hour < 24) return t("friends.hoursAgo", { count: hour });
  const day = Math.floor(hour / 24);
  return t("friends.daysAgo", { count: day });
}

/** Alt bardaki uc-nokta sekmesi - tum DM konusmalarinin listesi (en son
 * mesaja gore siralanmis). Bir satira basmak DMScreen'i acar (bkz.
 * RootNavigator.tsx DMsRoute). Eskiden bu sekme uygulama ayarlarini
 * aciyordu - ayarlar artik SADECE UserProfileScreen'deki carktan erisiliyor. */
export default function DMListScreen({ onOpenDM }: Props) {
  const { t } = useTranslation();
  const [conversations, setConversations] = useState<DMConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    getSocket().emit("dm:list", {}, (res: any) => {
      if (res?.ok) setConversations(res.conversations || []);
      setLoading(false);
    });
  }, []);

  useEffect(refresh, [refresh]);
  // Sekmeye her donuste (yeni mesaj gelmis olabilir) liste tazelenir.
  useFocusEffect(refresh);

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.iconTouch} />
        <Image source={require("../../assets/lavin-icon-mark.png")} style={styles.headerLogo} resizeMode="contain" />
        <View style={styles.iconTouch} />
      </View>

      <FlatList
        data={conversations}
        keyExtractor={(c) => c.conversationId}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={loading ? <LoadingView /> : <Text style={styles.emptyText}>{t("dmList.emptyText")}</Text>}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.row}
            onPress={() => onOpenDM({ userId: item.peerId, name: item.peerName, handle: item.peerHandle ?? undefined })}
          >
            <Avatar name={item.peerName} avatarUrl={item.peerAvatarUrl} size={48} />
            <View style={styles.rowText}>
              <Text style={styles.rowName}>{item.peerName}</Text>
              {item.lastMessage ? (
                <Text style={[styles.rowPreview, item.unread && styles.rowPreviewUnread]} numberOfLines={1}>
                  {item.lastMessage.text} · {relativeTime(item.lastMessage.createdAt, t)}
                </Text>
              ) : (
                !!item.peerHandle && <Text style={styles.rowPreview}>@{item.peerHandle}</Text>
              )}
            </View>
            {item.unread && <View style={styles.unreadDot} />}
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 12,
  },
  iconTouch: { width: 38, height: 38 },
  headerLogo: { width: 74, height: 34, marginBottom: 7, tintColor: "#FFFFFF" },
  listContent: { paddingHorizontal: 16, paddingBottom: 100 },
  emptyText: { color: MUTED, textAlign: "center", marginTop: 60, fontSize: 14 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  rowText: { flex: 1 },
  rowName: { color: TEXT, fontSize: 14, fontWeight: "700" },
  rowPreview: { color: MUTED, fontSize: 12, fontWeight: "500", lineHeight: 16, marginTop: 2 },
  rowPreviewUnread: { color: TEXT, fontWeight: "700" },
  unreadDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: ACCENT },
});
