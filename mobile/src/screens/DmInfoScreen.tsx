import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from "react-native";
import { useTranslation } from "react-i18next";
import { Phone, PhoneCall, BellOff, Bell, Ban } from "lucide-react-native";
import { getSocket, DMMessage } from "../services/socket";
import { theme } from "../theme";
import Icon from "../components/Icon";
import Avatar from "../components/Avatar";
import ChatImageBubble from "../components/ChatImageBubble";
import { showAlert } from "../components/CustomAlert";
import type { DMPeer } from "./DMScreen";

interface Props {
  peer: DMPeer;
  peerAvatarUrl: string | null;
  muted: boolean;
  mediaMessages: DMMessage[];
  onToggleMute: () => void;
  onBack: () => void;
  onBlocked: () => void;
}

type Tab = "media" | "files";

/** DM'deki karsi tarafin profiline dokununca acilan "Uye Bilgisi" ekrani -
 * uygulamada grup sohbeti olmadigi icin (GroupSetupScreen gibi mirror
 * alinacak bir ekran yok) kendi tasarimi: buyuk avatar + kompakt isim,
 * 4 aksiyon karesi (Ara/Sessiz/Sesli Ara/Engelle), Medya sekmesi GERCEK DM
 * gorsellerini gosterir. */
export default function DmInfoScreen({ peer, peerAvatarUrl, muted, mediaMessages, onToggleMute, onBack, onBlocked }: Props) {
  const { t } = useTranslation();
  const socket = getSocket();
  const [tab, setTab] = useState<Tab>("media");

  function placeholder(label: string) {
    showAlert(label, t("profile.comingSoon"));
  }

  function confirmBlock() {
    showAlert(t("dm.blockConfirmTitle"), t("dm.blockConfirmBody", { name: peer.name }), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("profileOptions.block"),
        style: "destructive",
        onPress: () => {
          socket.emit("friend:block", { userId: peer.userId }, (res: any) => {
            if (res?.ok) {
              showAlert(t("discover.blockedTitle"), t("discover.blockedBody", { name: peer.name }));
              onBlocked();
            }
          });
        },
      },
    ]);
  }

  const actions: { icon: React.ReactNode; label: string; onPress: () => void; danger?: boolean }[] = [
    { icon: <Phone size={20} color={theme.text} />, label: t("dm.callAction"), onPress: () => placeholder(t("dm.callAction")) },
    {
      icon: muted ? <Bell size={20} color={theme.text} /> : <BellOff size={20} color={theme.text} />,
      label: muted ? t("dm.menuUnmute") : t("dm.menuMute"),
      onPress: onToggleMute,
    },
    { icon: <PhoneCall size={20} color={theme.text} />, label: t("dm.voiceCallAction"), onPress: () => placeholder(t("dm.voiceCallAction")) },
    { icon: <Ban size={20} color={theme.danger} />, label: t("profileOptions.block"), onPress: confirmBlock, danger: true },
  ];

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} hitSlop={10} style={styles.backTouch}>
          <Icon name="chevronLeft" size={22} color={theme.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t("dm.memberInfoTitle")}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.profileBlock}>
          <Avatar name={peer.name} avatarUrl={peerAvatarUrl} size={88} />
          <Text style={styles.name}>{peer.name}</Text>
          {!!peer.handle && <Text style={styles.handle}>@{peer.handle}</Text>}
        </View>

        <View style={styles.actionsRow}>
          {actions.map((a) => (
            <TouchableOpacity key={a.label} style={styles.actionSquare} onPress={a.onPress}>
              {a.icon}
              <Text style={[styles.actionLabel, a.danger && styles.actionLabelDanger]} numberOfLines={1}>
                {a.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.tabsRow}>
          <TouchableOpacity style={[styles.tabButton, tab === "media" && styles.tabButtonActive]} onPress={() => setTab("media")}>
            <Text style={[styles.tabButtonText, tab === "media" && styles.tabButtonTextActive]}>{t("dm.menuMedia")}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.tabButton, tab === "files" && styles.tabButtonActive]} onPress={() => setTab("files")}>
            <Text style={[styles.tabButtonText, tab === "files" && styles.tabButtonTextActive]}>{t("dm.tabFiles")}</Text>
          </TouchableOpacity>
        </View>

        {tab === "media" ? (
          mediaMessages.length === 0 ? (
            <Text style={styles.emptyText}>{t("dm.noMedia")}</Text>
          ) : (
            <View style={styles.mediaGrid}>
              {mediaMessages.map((m) => (
                <View key={m.id} style={styles.mediaCell}>
                  <ChatImageBubble uri={m.mediaUrl!} isAdult={m.isAdult} size={110} />
                </View>
              ))}
            </View>
          )
        ) : (
          <Text style={styles.emptyText}>{t("dm.tabFilesEmpty")}</Text>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingTop: 50,
    paddingBottom: 14,
  },
  backTouch: { width: 36, height: 36, alignItems: "flex-start", justifyContent: "center" },
  headerTitle: { flex: 1, textAlign: "center", color: theme.text, fontSize: 15, fontWeight: "700", letterSpacing: 0.5 },
  headerSpacer: { width: 36 },
  scrollContent: { paddingBottom: 40 },
  profileBlock: { alignItems: "center", paddingVertical: 20, gap: 6 },
  name: { color: theme.text, fontSize: 18, fontWeight: "700", marginTop: 10 },
  handle: { color: theme.textMuted, fontSize: 13 },
  actionsRow: { flexDirection: "row", gap: 10, paddingHorizontal: 18, marginBottom: 22 },
  actionSquare: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  actionLabel: { color: theme.text, fontSize: 10, fontWeight: "600" },
  actionLabelDanger: { color: theme.danger },
  tabsRow: { flexDirection: "row", borderBottomWidth: 1, borderColor: "rgba(255,255,255,0.08)", marginHorizontal: 18 },
  tabButton: { flex: 1, alignItems: "center", paddingVertical: 10, borderBottomWidth: 2, borderColor: "transparent" },
  tabButtonActive: { borderColor: theme.accent },
  tabButtonText: { color: theme.textMuted, fontSize: 13, fontWeight: "700" },
  tabButtonTextActive: { color: theme.text },
  emptyText: { color: theme.textMuted, fontSize: 13, textAlign: "center", marginTop: 30 },
  mediaGrid: { flexDirection: "row", flexWrap: "wrap", gap: 2, paddingHorizontal: 2, marginTop: 10 },
  mediaCell: { width: "33%" },
});
