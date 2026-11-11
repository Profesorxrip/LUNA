import React, { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from "react-native";
import { useTranslation } from "react-i18next";
import { useFonts, BebasNeue_400Regular } from "@expo-google-fonts/bebas-neue";
import { UserPlus, MessageCircle, DoorOpen, Heart, Megaphone } from "lucide-react-native";
import Icon from "../components/Icon";
import { triggerHaptic } from "../utils/haptics";
import {
  NotificationCategory,
  isNotificationCategoryEnabled,
  setNotificationCategoryEnabled,
} from "../utils/notificationSettings";

const ROW_ICON_COLOR = "#FFFFFF";
const PILL_TRACK_ON = "#38BDF8";

interface Props {
  onBack: () => void;
}

const CATEGORIES: { key: NotificationCategory; icon: React.ReactNode; titleKey: string; noteKey: string }[] = [
  { key: "friendRequests", icon: <UserPlus size={26} color={ROW_ICON_COLOR} strokeWidth={2} />, titleKey: "notifications.friendRequests", noteKey: "notifications.friendRequestsNote" },
  { key: "messages", icon: <MessageCircle size={26} color={ROW_ICON_COLOR} strokeWidth={2} />, titleKey: "notifications.messages", noteKey: "notifications.messagesNote" },
  { key: "roomInvites", icon: <DoorOpen size={26} color={ROW_ICON_COLOR} strokeWidth={2} />, titleKey: "notifications.roomInvites", noteKey: "notifications.roomInvitesNote" },
  { key: "postActivity", icon: <Heart size={26} color={ROW_ICON_COLOR} strokeWidth={2} />, titleKey: "notifications.postActivity", noteKey: "notifications.postActivityNote" },
  { key: "announcements", icon: <Megaphone size={26} color={ROW_ICON_COLOR} strokeWidth={2} />, titleKey: "notifications.announcements", noteKey: "notifications.announcementsNote" },
];

/** Bildirim kategorisi bazli acik/kapali ayarlar - ProfileScreen.tsx'teki
 * SwitchRow (duz mavi "hap" anahtar) ile AYNI gorsel dil, cihaz bazli
 * tercihler notificationSettings.ts (AsyncStorage) uzerinden okunur/yazilir. */
export default function NotificationSettingsScreen({ onBack }: Props) {
  const { t } = useTranslation();
  const [fontsLoaded] = useFonts({ BebasNeue_400Regular });
  const [values, setValues] = useState<Partial<Record<NotificationCategory, boolean>>>({});

  useEffect(() => {
    (async () => {
      const entries = await Promise.all(CATEGORIES.map(async (c) => [c.key, await isNotificationCategoryEnabled(c.key)] as const));
      setValues(Object.fromEntries(entries));
    })();
  }, []);

  function toggle(category: NotificationCategory) {
    triggerHaptic();
    const next = !values[category];
    setValues((prev) => ({ ...prev, [category]: next }));
    setNotificationCategoryEnabled(category, next);
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} hitSlop={10} style={styles.backTouch}>
          <Icon name="chevronLeft" size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={[styles.title, fontsLoaded && styles.titleFontLoaded]}>{t("notifications.title")}</Text>
        <View style={styles.headerSpacer} />
      </View>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {CATEGORIES.map((c) => {
          const value = values[c.key] ?? true;
          return (
            <TouchableOpacity key={c.key} style={styles.row} activeOpacity={0.8} onPress={() => toggle(c.key)}>
              <View style={styles.rowIcon}>{c.icon}</View>
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>{t(c.titleKey)}</Text>
                <Text style={styles.rowNote}>{t(c.noteKey)}</Text>
              </View>
              <View style={[styles.pillTrack, value && styles.pillTrackOn]}>
                <View style={[styles.pillThumb, value ? styles.pillThumbOn : styles.pillThumbOff]} />
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
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
  scrollContent: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 48 },
  title: { color: "#FFFFFF", fontSize: 16, fontWeight: "800", letterSpacing: 0.3 },
  titleFontLoaded: { fontFamily: "BebasNeue_400Regular", fontWeight: "400", fontSize: 22, letterSpacing: 1.4 },
  row: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 14 },
  rowIcon: { width: 32, alignItems: "center", justifyContent: "center" },
  rowText: { flex: 1 },
  rowTitle: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  rowNote: { color: "rgba(255,255,255,0.6)", fontSize: 12.5, fontWeight: "500", marginTop: 3, lineHeight: 16 },
  pillTrack: { width: 46, height: 26, borderRadius: 13, backgroundColor: "rgba(255,255,255,0.15)", justifyContent: "center" },
  pillTrackOn: { backgroundColor: PILL_TRACK_ON },
  pillThumb: { position: "absolute", width: 20, height: 20, borderRadius: 10, backgroundColor: "#FFFFFF" },
  pillThumbOff: { left: 3 },
  pillThumbOn: { right: 3 },
});
