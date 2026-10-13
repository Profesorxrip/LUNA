import { Image, Modal, View, Text, TouchableOpacity, StyleSheet } from "react-native";
import Icon from "./Icon";
import type { IconName } from "./Icon";

export interface ProfileOptionsTarget {
  userId?: string | null;
  socketId?: string | null;
  name: string;
  handle?: string | null;
  avatarUrl?: string | null;
  isHost?: boolean;
  isFriend?: boolean;
  // Lider bu katilimcinin mikrofonunu zaten susturmus mu (bkz.
  // RoomScreen.tsx muteParticipant) - zaten susturulmusse "Mikrofonu Devre
  // Disi Birak" satiri tekrar gosterilmez.
  micDisabled?: boolean;
  // Bu SADECE benim icin kisilmis mi (bkz. useVoiceChat.ts
  // setParticipantVolume) - host olup olmadigima bakmaksizin herkeste olan
  // kisisel bir tercih, odanin geneline etki etmez.
  locallyMuted?: boolean;
}

interface Props {
  visible: boolean;
  target: ProfileOptionsTarget | null;
  // Bu katilimcinin bulundugu odada BEN lider miyim - liderlige ozel
  // satirlar (Liderligi ver / At / Mikrofonu Devre Disi Birak) sadece bu
  // true ve hedef ben degilsem gosterilir. Oda disi (orn. DM/Discover)
  // kullanimlarda hep false gecilebilir.
  isHost: boolean;
  onClose: () => void;
  onOpenProfile: (target: ProfileOptionsTarget) => void;
  onMakeLeader?: (target: ProfileOptionsTarget) => void;
  onKick?: (target: ProfileOptionsTarget) => void;
  onDisableMic?: (target: ProfileOptionsTarget) => void;
  onToggleLocalMute?: (target: ProfileOptionsTarget) => void;
  onRemoveFriend?: (target: ProfileOptionsTarget) => void;
  onBlock?: (target: ProfileOptionsTarget) => void;
  onReport?: (target: ProfileOptionsTarget) => void;
}

interface Row {
  key: string;
  icon: IconName;
  label: string;
  danger?: boolean;
  onPress: () => void;
}

const PLACEHOLDER_COLORS = ["#F97316", "#10B981", "#3B82F6", "#EC4899", "#EAB308", "#8B5CF6", "#14B8A6"];
function colorForName(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return PLACEHOLDER_COLORS[Math.abs(hash) % PLACEHOLDER_COLORS.length];
}

/** Rave'deki gibi bir katilimcinin profiline/avatarina BASILI TUTUNCA
 * ekranin ORTASINDA acilan kucuk kutu - buyuk kare profil fotografi + isim/
 * kullanici adi karti, altinda her biri AYRI yuvarlatilmis birer "hap"
 * (pill) olan aksiyon satirlari (kullanicinin gonderdigi referans ekran
 * goruntusuyle BIREBIR ayni duzen). Hangi ekranda/baglamda kullanilirsa
 * kullanilsin ayni bilesen - liderlige ozel satirlar sadece "isHost" true ve
 * hedef kendim degilsem, arkadaslikla ilgili satirlar sadece gercek bir
 * userId/arkadaslik durumu varsa gosterilir. */
export default function ProfileOptionsSheet({
  visible,
  target,
  isHost,
  onClose,
  onOpenProfile,
  onMakeLeader,
  onKick,
  onDisableMic,
  onToggleLocalMute,
  onRemoveFriend,
  onBlock,
  onReport,
}: Props) {
  if (!target) return null;

  function act(fn?: (t: ProfileOptionsTarget) => void) {
    return () => {
      if (fn) fn(target!);
      onClose();
    };
  }

  const rows: Row[] = [];
  if (target.userId) {
    rows.push({ key: "profile", icon: "person", label: "Profil", onPress: act(onOpenProfile) });
  }
  if (isHost && onMakeLeader) {
    rows.push({ key: "leader", icon: "crown", label: "Liderliği ver", onPress: act(onMakeLeader) });
  }
  if (target.isFriend && target.userId && onRemoveFriend) {
    rows.push({ key: "removeFriend", icon: "personBlock", label: "Arkadaşı sil", onPress: act(onRemoveFriend) });
  }
  if (isHost && onKick) {
    rows.push({ key: "kick", icon: "kicked", label: "At", danger: true, onPress: act(onKick) });
  }
  if (isHost && !target.micDisabled && onDisableMic) {
    rows.push({ key: "disableMic", icon: "micOff", label: "Mikrofonu Devre Dışı Bırak", onPress: act(onDisableMic) });
  }
  if (onToggleLocalMute) {
    rows.push({
      key: "localMute",
      icon: "volumeOff",
      label: target.locallyMuted ? "Sesini Aç" : "Sessize Al",
      onPress: act(onToggleLocalMute),
    });
  }
  if (target.userId && onBlock) {
    rows.push({ key: "block", icon: "block", label: "Engelle", danger: true, onPress: act(onBlock) });
  }
  if (target.userId && onReport) {
    rows.push({ key: "report", icon: "warning", label: "Bildir", danger: true, onPress: act(onReport) });
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose}>
        <View style={styles.card}>
          <TouchableOpacity activeOpacity={1} onPress={() => {}} style={styles.cardInner}>
            {target.avatarUrl ? (
              <Image source={{ uri: target.avatarUrl }} style={styles.photo} />
            ) : (
              <View style={[styles.photo, styles.photoPlaceholder, { backgroundColor: colorForName(target.name) }]}>
                <Text style={styles.photoInitial}>{target.name.trim().charAt(0).toUpperCase() || "?"}</Text>
              </View>
            )}
            <View style={styles.nameCard}>
              <Text style={styles.name} numberOfLines={1}>
                {target.name}
              </Text>
              {!!target.handle && (
                <Text style={styles.handle} numberOfLines={1}>
                  @{target.handle}
                </Text>
              )}

              <View style={styles.list}>
                {rows.map((row) => (
                  <TouchableOpacity key={row.key} style={styles.pill} onPress={row.onPress}>
                    <Icon name={row.icon} size={16} color={row.danger ? "#FF6B6B" : "#FFFFFF"} />
                    <Text style={[styles.pillLabel, row.danger && styles.pillLabelDanger]}>{row.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const CARD_WIDTH = 240;
const PHOTO_WIDTH = 90;

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "center", alignItems: "center" },
  card: { width: CARD_WIDTH },
  cardInner: { alignItems: "center", gap: 8 },
  photo: { width: PHOTO_WIDTH, height: PHOTO_WIDTH, borderRadius: 20 },
  photoPlaceholder: { justifyContent: "center", alignItems: "center" },
  photoInitial: { color: "#FFFFFF", fontSize: 28, fontWeight: "700" },
  nameCard: {
    width: "100%",
    backgroundColor: "#1E1E22",
    borderRadius: 20,
    paddingTop: 12,
    paddingBottom: 12,
    paddingHorizontal: 14,
    alignItems: "center",
  },
  name: { color: "#FFFFFF", fontSize: 17, fontWeight: "700", fontStyle: "italic", fontFamily: "Georgia" },
  handle: { color: "rgba(255,255,255,0.55)", fontSize: 12, marginTop: 2 },
  list: { width: "100%", marginTop: 10, gap: 6 },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    height: 42,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 13,
  },
  pillLabel: { color: "#FFFFFF", fontSize: 13, fontWeight: "600", textAlign: "center" },
  pillLabelDanger: { color: "#FF6B6B" },
});
