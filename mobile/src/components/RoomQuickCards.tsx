import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from "react-native";
import type { PrivacyLevel, PlaybackMode, FriendUser } from "../services/socket";
import Avatar from "./Avatar";
import Icon, { IconName } from "./Icon";
import { theme } from "../theme";

interface Props {
  privacy: PrivacyLevel;
  playbackMode: PlaybackMode;
  // Gizlilik karti SADECE lidere gosterilir (degistirebilen tek kisi o).
  isHost: boolean;
  onChangePrivacy: (p: PrivacyLevel) => void;
  friends: FriendUser[];
  // Sunucu gercekten "gonderildi" diyene kadar tik isaretlenmesin diye bu
  // set RoomScreen.tsx'te tutuluyor (room:invite ack'i basarili olunca
  // eklenir) - bileşen kendi icinde iyimser (optimistic) tutmuyor.
  sentIds: Set<string>;
  onInviteFriend: (userId: string) => void;
}

// RoomScreen.tsx'teki "settings" bildiri kartinda da (buyuk ikon secimi
// icin) kullanilir.
export const PRIVACY_OPTIONS: { key: PrivacyLevel; icon: IconName; label: string }[] = [
  { key: "open", icon: "globe", label: "Açık" },
  { key: "nearby", icon: "pin", label: "Yakındakiler" },
  { key: "friends", icon: "people", label: "Arkadaşlar" },
  { key: "invite", icon: "invite", label: "Davetli" },
];

// RoomSettingsSheet.tsx'teki PLAYBACK_OPTIONS ile ayni secenekler, burada
// tek satirlik bilgi rozeti icin kisa etiketlerle (bkz. infoRow).
export const PLAYBACK_INFO: Record<PlaybackMode, { icon: IconName; label: string }> = {
  leader: { icon: "crown", label: "Liderin Seçimi" },
  playOnly: { icon: "play", label: "Sadece Oynat" },
  autoplay: { icon: "fastForward", label: "Otomatik Oynat" },
  vote: { icon: "check", label: "Haydi Oylayalım" },
};

/** Oda yeni acildiginda sohbetin en ustunde (bkz. RoomScreen.tsx chat
 * FlatList ListHeaderComponent) beliren, digerleriyle (bkz. RoomScreen.tsx
 * eventRow/nowPlayingRow) AYNI "bildiri karti" ailesinden iki kart: gizlilik
 * secimi (sadece lider) ve arkadaslari tek dokunusla davet etme. Kapatma
 * tusu YOK - mesajlar aktikca zaten yukarida kalip sohbet gecmisine karisir,
 * ayrica kalici bir kapatma durumu tutmaya gerek yok. */
export default function RoomQuickCards({ isHost, privacy, playbackMode, onChangePrivacy, friends, sentIds, onInviteFriend }: Props) {
  const showPrivacy = isHost;
  const showInvite = friends.length > 0;
  const privacyInfo = PRIVACY_OPTIONS.find((o) => o.key === privacy)!;
  const playbackInfo = PLAYBACK_INFO[playbackMode];

  return (
    <View style={styles.wrap}>
      {/* Oda bilgisi - herkese gorunur, salt bilgi amacli (degistirilemez) -
          "X katildi" gibi diger bildiri satirlariyla AYNI sade stil. */}
      <View style={styles.infoRow}>
        <Icon name={privacyInfo.icon} size={14} color={theme.textMuted} />
        <Text style={styles.infoText}>{privacyInfo.label}</Text>
        <Text style={styles.infoDot}>·</Text>
        <Icon name={playbackInfo.icon} size={14} color={theme.textMuted} />
        <Text style={styles.infoText}>{playbackInfo.label}</Text>
      </View>

      {showPrivacy && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Oda Gizliliği</Text>
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
          <Text style={styles.cardTitle}>Arkadaşlarını Davet Et</Text>
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
  // RoomScreen.tsx'teki chatContent'in paddingHorizontal:12'sini negatif
  // margin ile iptal edip kartlari ekranin gercek sol/sag kenarina kadar
  // yasliyor ("tam yasla", kart ustte/altta ince bir cizgiyle ayrilir).
  wrap: { marginHorizontal: -12, marginBottom: 10 },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderColor: theme.border,
  },
  infoText: { color: theme.textMuted, fontSize: 12, fontWeight: "600" },
  infoDot: { color: theme.textMuted, fontSize: 12 },
  card: {
    backgroundColor: theme.surface,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: theme.border,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  cardTitle: { color: theme.text, fontSize: 13, fontWeight: "700", marginBottom: 10 },
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
