import { Modal, View, Text, TouchableOpacity, StyleSheet } from "react-native";
import Icon from "./Icon";
import Avatar from "./Avatar";
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

/** Rave'deki gibi bir katilimcinin profiline/avatarina BASILI TUTUNCA acilan
 * panel - MessageOptionsSheet ile AYNI alttan panel (bottom sheet) deseni,
 * uygulama genelinde tutarli olsun diye. Hangi ekranda/baglamda kullanilirsa
 * kullanilsin ayni bilesen - liderlige ozel satirlar sadece "isHost" true ve
 * hedef kendim degilsem, arkadaslikla ilgili satirlar sadece gercek bir
 * userId/arkadaslik durumu varsa gosterilir (bkz. ilgili ekranlarin
 * kendi "target" olusturma mantigi). */
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
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={styles.sheet} onPress={() => {}}>
          <View style={styles.dragHandle} />

          <View style={styles.header}>
            <Avatar name={target.name} avatarUrl={target.avatarUrl} size={44} />
            <View style={styles.headerTextCol}>
              <Text style={styles.name} numberOfLines={1}>
                {target.name}
              </Text>
              {!!target.handle && (
                <Text style={styles.handle} numberOfLines={1}>
                  @{target.handle}
                </Text>
              )}
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.list}>
            {rows.map((row, i) => (
              <TouchableOpacity
                key={row.key}
                style={[styles.row, i === rows.length - 1 && styles.rowLast]}
                onPress={row.onPress}
              >
                <Icon name={row.icon} size={18} color={row.danger ? "#FF6B6B" : "#FFFFFF"} />
                <Text style={[styles.rowLabel, row.danger && styles.rowLabelDanger]}>{row.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end" },
  sheet: {
    backgroundColor: "#1C1C1E",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingBottom: 26,
    maxHeight: "80%",
  },
  dragHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.25)", alignSelf: "center", marginTop: 10, marginBottom: 6 },
  header: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingVertical: 12 },
  headerTextCol: { flex: 1, gap: 2 },
  name: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
  handle: { color: "rgba(255,255,255,0.5)", fontSize: 12 },
  divider: { height: 1, backgroundColor: "rgba(255,255,255,0.08)", marginHorizontal: 16 },
  list: { paddingHorizontal: 16, paddingTop: 4 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 13, borderBottomWidth: 1, borderColor: "rgba(255,255,255,0.07)" },
  rowLast: { borderBottomWidth: 0 },
  rowLabel: { color: "#FFFFFF", fontSize: 14, fontWeight: "500" },
  rowLabelDanger: { color: "#FF6B6B" },
});
