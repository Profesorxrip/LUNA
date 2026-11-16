import { Image, Modal, View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Pin, PinOff, Bell, BellOff, Archive, ArchiveRestore, Circle, Check, Trash } from "lucide-react-native";
import { useFonts, BebasNeue_400Regular } from "@expo-google-fonts/bebas-neue";
import { useTranslation } from "react-i18next";

export interface DMConversationOptionsTarget {
  peerId: string;
  name: string;
  handle?: string | null;
  avatarUrl?: string | null;
  pinned: boolean;
  muted: boolean;
  archived: boolean;
  unread: boolean;
}

interface Props {
  visible: boolean;
  target: DMConversationOptionsTarget | null;
  onClose: () => void;
  onTogglePinned: (t: DMConversationOptionsTarget) => void;
  onToggleMuted: (t: DMConversationOptionsTarget) => void;
  onToggleArchived: (t: DMConversationOptionsTarget) => void;
  onToggleUnread: (t: DMConversationOptionsTarget) => void;
  onDelete: (t: DMConversationOptionsTarget) => void;
}

const PLACEHOLDER_COLORS = ["#F97316", "#10B981", "#3B82F6", "#EC4899", "#EAB308", "#8B5CF6", "#14B8A6"];
function colorForName(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return PLACEHOLDER_COLORS[Math.abs(hash) % PLACEHOLDER_COLORS.length];
}

/** DM listesinde bir kisiye BASILI TUTUNCA acilan menu - ProfileOptionsSheet
 * ile AYNI gorsel tarif (gradyan kapsul kart + foto/isim basligi + pill
 * aksiyon satirlari), sadece sohbet-yonetimi aksiyonlarina ozel: Sabitle,
 * Sessize al, Arsivle, Okundu/Okunmadi isaretle, Sohbeti sil. Hepsi SADECE
 * benim listemi etkiler (bkz. server/src/dm.ts - karsi tarafa bildirim
 * gitmez). Sil haric digerleri aninda uygulanir/geri alinir (toggle);
 * Sil ise DMListScreen'deki "geri al" (scheduleUndo) akisina baglanir. */
export default function DMConversationOptionsSheet({
  visible,
  target,
  onClose,
  onTogglePinned,
  onToggleMuted,
  onToggleArchived,
  onToggleUnread,
  onDelete,
}: Props) {
  const { t } = useTranslation();
  // ProfileOptionsSheet.tsx'in aksine, bu bilesen TEK BASINA acilabildigi
  // icin (baska bir ekranin BebasNeue'yu onceden yuklemis olmasina
  // GUVENMEDEN) fontu kendi yukluyor - yoksa "SABITLE" gibi etiketler
  // BebasNeue yerine varsayilan sistem fontunda kalabiliyordu.
  const [fontLoaded] = useFonts({ BebasNeue_400Regular });
  if (!target) return null;

  function act(fn: (t: DMConversationOptionsTarget) => void) {
    return () => {
      fn(target!);
      onClose();
    };
  }

  const rows = [
    {
      key: "pin",
      icon: target.pinned ? PinOff : Pin,
      label: target.pinned ? t("dmList.unpinChat") : t("dmList.pinChat"),
      onPress: act(onTogglePinned),
    },
    {
      key: "mute",
      icon: target.muted ? Bell : BellOff,
      label: target.muted ? t("dmList.unmuteChat") : t("dmList.muteChat"),
      onPress: act(onToggleMuted),
    },
    {
      key: "unread",
      icon: target.unread ? Check : Circle,
      label: target.unread ? t("dmList.markRead") : t("dmList.markUnread"),
      onPress: act(onToggleUnread),
    },
    {
      key: "archive",
      icon: target.archived ? ArchiveRestore : Archive,
      label: target.archived ? t("dmList.unarchiveChat") : t("dmList.archiveChat"),
      onPress: act(onToggleArchived),
    },
    {
      key: "delete",
      icon: Trash,
      label: t("dmList.deleteChat"),
      danger: true,
      onPress: act(onDelete),
    },
  ];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose}>
        <View style={styles.card}>
          <LinearGradient colors={["#FFFFFF", "#1C6FD9"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.cardBorder}>
            <TouchableOpacity activeOpacity={1} onPress={() => {}} style={styles.cardInner}>
              <View style={[StyleSheet.absoluteFill, { backgroundColor: "#132233" }]} />
              {target.avatarUrl ? (
                <Image source={{ uri: target.avatarUrl }} style={styles.photo} />
              ) : (
                <View style={[styles.photo, styles.photoPlaceholder, { backgroundColor: colorForName(target.name) }]}>
                  <Text style={styles.photoInitial}>{target.name.trim().charAt(0).toUpperCase() || "?"}</Text>
                </View>
              )}
              <Text style={styles.name} numberOfLines={1}>
                {target.name}
              </Text>
              {!!target.handle && (
                <Text style={styles.handle} numberOfLines={1}>
                  @{target.handle}
                </Text>
              )}

              <View style={styles.list}>
                {rows.map((row) => {
                  const RowIcon = row.icon;
                  return (
                    <TouchableOpacity key={row.key} style={styles.pill} onPress={row.onPress}>
                      <View style={styles.pillIcon}>
                        <RowIcon size={16} color={row.danger ? "#FF6B6B" : "#FFFFFF"} strokeWidth={2} />
                      </View>
                      <View style={styles.pillLabelWrap}>
                        <Text
                          style={[styles.pillLabel, fontLoaded && styles.pillLabelFontLoaded, row.danger && styles.pillLabelDanger]}
                          numberOfLines={1}
                          adjustsFontSizeToFit
                        >
                          {row.label}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </TouchableOpacity>
          </LinearGradient>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const CARD_WIDTH = 170;
const PHOTO_WIDTH = 108;

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "center", alignItems: "center" },
  card: { width: CARD_WIDTH, marginTop: 70 },
  cardBorder: { borderRadius: CARD_WIDTH / 2, padding: 2 },
  cardInner: {
    width: "100%",
    alignItems: "center",
    borderRadius: CARD_WIDTH / 2,
    paddingTop: 12,
    paddingBottom: 32,
    paddingHorizontal: 20,
    overflow: "hidden",
  },
  photo: { width: PHOTO_WIDTH, height: PHOTO_WIDTH, borderRadius: PHOTO_WIDTH / 2, marginBottom: 6 },
  photoPlaceholder: { justifyContent: "center", alignItems: "center" },
  photoInitial: { color: "#FFFFFF", fontSize: 28, fontWeight: "700" },
  name: { color: "#FFFFFF", fontSize: 18, fontFamily: "Inter_700Bold" },
  handle: { color: "rgba(255,255,255,0.55)", fontSize: 12, marginTop: 2 },
  list: { width: "100%", marginTop: 10, gap: 4 },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 36,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 13,
  },
  pillIcon: { position: "absolute", left: 10, top: 0, bottom: 0, justifyContent: "center", alignItems: "center" },
  pillLabelWrap: { width: "100%", paddingLeft: 34, paddingRight: 10 },
  pillLabel: {
    color: "#FFFFFF",
    fontSize: 15,
    lineHeight: 17,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    textAlign: "left",
    textAlignVertical: "center",
    includeFontPadding: false,
    marginTop: 3,
  },
  pillLabelFontLoaded: { fontFamily: "BebasNeue_400Regular", fontWeight: "400", fontSize: 15, letterSpacing: 1 },
  pillLabelDanger: { color: "#FF6B6B" },
});
