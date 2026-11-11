import React, { useCallback, useEffect, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, FlatList } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useTranslation } from "react-i18next";
import { useFonts, BebasNeue_400Regular } from "@expo-google-fonts/bebas-neue";
import { getSocket, FriendUser } from "../services/socket";
import Avatar from "../components/Avatar";
import Icon from "../components/Icon";
import LoadingView from "../components/LoadingView";
import { showAlert } from "../components/CustomAlert";
import { triggerHaptic } from "../utils/haptics";

interface Props {
  onBack: () => void;
}

const MUTED = "rgba(255,255,255,0.6)";
const ACCENT = "#0EA5E9";
const PILL_TEXT = "#F5F0E6";

/** Ayarlar > "Engellenenler" icin kendi basina bir ekran -
 * FriendsScreen.tsx'teki "Engellendi" sekmesiyle AYNI veriyi (friends:list
 * -> res.blocked) ve AYNI engeli kaldirma akisini (friend:unblock) kullanir,
 * ama sekme cubugu olmadan, Privacy/NotificationSettings ekranlariyla AYNI
 * geri tusu + ortalanmis Bebas Neue baslik duzeninde. */
export default function BlockedUsersScreen({ onBack }: Props) {
  const { t } = useTranslation();
  const [fontsLoaded] = useFonts({ BebasNeue_400Regular });
  const socket = getSocket();
  const [blocked, setBlocked] = useState<FriendUser[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    socket.emit("friends:list", {}, (res: any) => {
      setLoading(false);
      if (res?.ok) setBlocked(res.blocked);
    });
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  function unblock(userId: string) {
    showAlert(t("friends.unblockConfirmTitle"), t("friends.unblockConfirmBody"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("friends.unblockConfirmTitle"),
        onPress: () => {
          triggerHaptic();
          socket.emit("friend:unblock", { userId }, (res: any) => {
            if (res?.ok) setBlocked((prev) => prev.filter((u) => u.userId !== userId));
          });
        },
      },
    ]);
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} hitSlop={10} style={styles.backTouch}>
          <Icon name="chevronLeft" size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={[styles.title, fontsLoaded && styles.titleFontLoaded]}>{t("profile.blockedTitle")}</Text>
        <View style={styles.headerSpacer} />
      </View>
      <FlatList
        data={blocked}
        keyExtractor={(u) => u.userId}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={loading ? <LoadingView /> : <Text style={styles.emptyText}>{t("friends.noBlocked")}</Text>}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Avatar name={item.name} avatarUrl={item.avatarUrl} size={48} />
            <View style={styles.rowText}>
              <Text style={styles.rowName}>{item.name}</Text>
              {!!item.handle && <Text style={styles.rowHandle}>@{item.handle}</Text>}
            </View>
            <TouchableOpacity onPress={() => unblock(item.userId)} hitSlop={8}>
              <LinearGradient colors={[ACCENT, "#FFFFFF"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.unblockGradientBorder}>
                <View style={styles.unblockInner}>
                  <Text style={styles.unblockButtonText}>{t("profileOptions.unblock").toUpperCase()}</Text>
                </View>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "transparent" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingTop: 54,
    paddingBottom: 14,
  },
  backTouch: { width: 36, height: 36, alignItems: "flex-start", justifyContent: "center" },
  headerSpacer: { width: 36 },
  title: { color: "#FFFFFF", fontSize: 16, fontWeight: "800", letterSpacing: 0.3 },
  titleFontLoaded: { fontFamily: "BebasNeue_400Regular", fontWeight: "400", fontSize: 22, letterSpacing: 1.4 },
  listContent: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 48, flexGrow: 1 },
  emptyText: { color: MUTED, fontSize: 14, fontWeight: "500", textAlign: "center", marginTop: 60 },
  row: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 12 },
  rowText: { flex: 1 },
  rowName: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  rowHandle: { color: MUTED, fontSize: 13, fontWeight: "500", marginTop: 2, textTransform: "uppercase" },
  // UserProfileScreen.tsx'teki "Paylaş" butonuyla AYNI desen - mavi/beyaz
  // degrade "cerceve", ic kisim siyah dolgu.
  unblockGradientBorder: { borderRadius: 20, padding: 2 },
  unblockInner: { borderRadius: 18, paddingVertical: 8, paddingHorizontal: 14, alignItems: "center", backgroundColor: "#000000" },
  unblockButtonText: { color: PILL_TEXT, fontSize: 12, fontWeight: "800", letterSpacing: 0.4 },
});
