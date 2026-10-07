import { useState } from "react";
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from "react-native";
import type { PrivacyLevel, FriendUser } from "../services/socket";
import Avatar from "./Avatar";
import Icon, { IconName } from "./Icon";
import { theme } from "../theme";

interface Props {
  // Gizlilik karti SADECE lidere gosterilir (degistirebilen tek kisi o).
  isHost: boolean;
  privacy: PrivacyLevel;
  onChangePrivacy: (p: PrivacyLevel) => void;
  friends: FriendUser[];
  // Sunucu gercekten "gonderildi" diyene kadar tik isaretlenmesin diye bu
  // set RoomScreen.tsx'te tutuluyor (room:invite ack'i basarili olunca
  // eklenir) - bileşen kendi icinde iyimser (optimistic) tutmuyor.
  sentIds: Set<string>;
  onInviteFriend: (userId: string) => void;
}

const PRIVACY_OPTIONS: { key: PrivacyLevel; icon: IconName; label: string }[] = [
  { key: "open", icon: "globe", label: "Açık" },
  { key: "nearby", icon: "pin", label: "Yakındakiler" },
  { key: "friends", icon: "people", label: "Arkadaşlar" },
  { key: "invite", icon: "invite", label: "Davetli" },
];

/** Oda yeni acildiginda sohbetin en ustunde (bkz. RoomScreen.tsx chat
 * FlatList ListHeaderComponent) beliren, "bildiri karti" ile ayni gorsel
 * dilde iki hizli kart: gizlilik secimi (sadece lider) ve arkadaslari tek
 * dokunusla davet etme. Her biri bagimsiz kapatilabilir, odadan cikip
 * girilirse (RoomScreen yeniden mount olur) tekrar gorunur. */
export default function RoomQuickCards({ isHost, privacy, onChangePrivacy, friends, sentIds, onInviteFriend }: Props) {
  const [privacyDismissed, setPrivacyDismissed] = useState(false);
  const [inviteDismissed, setInviteDismissed] = useState(false);

  const showPrivacy = isHost && !privacyDismissed;
  const showInvite = !inviteDismissed && friends.length > 0;

  if (!showPrivacy && !showInvite) return null;

  return (
    <View style={styles.wrap}>
      {showPrivacy && (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Oda Gizliliği</Text>
            <TouchableOpacity onPress={() => setPrivacyDismissed(true)} hitSlop={8}>
              <Icon name="close" size={16} color={theme.textMuted} />
            </TouchableOpacity>
          </View>
          <View style={styles.privacyRow}>
            {PRIVACY_OPTIONS.map((opt) => {
              const active = opt.key === privacy;
              return (
                <TouchableOpacity
                  key={opt.key}
                  style={[styles.privacyOption, active && styles.privacyOptionActive]}
                  onPress={() => onChangePrivacy(opt.key)}
                >
                  <Icon name={opt.icon} size={18} color={active ? theme.accent : theme.textMuted} />
                  <Text style={[styles.privacyLabel, active && styles.privacyLabelActive]} numberOfLines={1}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      {showInvite && (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Arkadaşlarını Davet Et</Text>
            <TouchableOpacity onPress={() => setInviteDismissed(true)} hitSlop={8}>
              <Icon name="close" size={16} color={theme.textMuted} />
            </TouchableOpacity>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.inviteRow}>
            {friends.map((f) => {
              const sent = sentIds.has(f.userId);
              return (
                <TouchableOpacity
                  key={f.userId}
                  style={styles.inviteItem}
                  disabled={sent}
                  onPress={() => onInviteFriend(f.userId)}
                >
                  <View style={styles.inviteAvatarWrap}>
                    <Avatar name={f.name} avatarUrl={f.avatarUrl} size={44} isFriend />
                    <View style={[styles.inviteBadge, sent && styles.inviteBadgeSent]}>
                      <Icon name={sent ? "check" : "invite"} size={12} color="#04140D" />
                    </View>
                  </View>
                  <Text style={styles.inviteName} numberOfLines={1}>
                    {f.name.split(" ")[0]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10, marginBottom: 14 },
  card: {
    backgroundColor: theme.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 14,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  cardTitle: { color: theme.text, fontSize: 13, fontWeight: "700" },
  privacyRow: { flexDirection: "row", justifyContent: "space-between" },
  privacyOption: {
    flex: 1,
    alignItems: "center",
    gap: 4,
    paddingVertical: 8,
    marginHorizontal: 3,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "transparent",
  },
  privacyOptionActive: { borderColor: theme.accent, backgroundColor: "rgba(16,185,129,0.1)" },
  privacyLabel: { color: theme.textMuted, fontSize: 10, fontWeight: "600" },
  privacyLabelActive: { color: theme.accent },
  inviteRow: { gap: 16 },
  inviteItem: { alignItems: "center", width: 56 },
  inviteAvatarWrap: { position: "relative" },
  inviteBadge: {
    position: "absolute",
    bottom: -2,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: theme.accent,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: theme.surface,
  },
  inviteBadgeSent: { backgroundColor: theme.textMuted },
  inviteName: { color: theme.textMuted, fontSize: 11, marginTop: 4, maxWidth: 56 },
});
