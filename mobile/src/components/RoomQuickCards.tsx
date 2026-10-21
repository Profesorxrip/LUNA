import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import type { PrivacyLevel, PlaybackMode, FriendUser } from "../services/socket";
import Avatar from "./Avatar";
import Icon, { IconName } from "./Icon";
import { theme } from "../theme";

interface Props {
  privacy: PrivacyLevel;
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
// icin) kullanilir. Dil degisiminde guncellensin diye bir fonksiyonla
// (sabit degil) uretiliyor.
export function getPrivacyOptions(t: (key: string) => string): { key: PrivacyLevel; icon: IconName; label: string }[] {
  return [
    { key: "open", icon: "worldOpen", label: t("discover.sectionOpen") },
    { key: "nearby", icon: "radar", label: t("discover.sectionNearby") },
    { key: "friends", icon: "people", label: t("discover.sectionFriends") },
    { key: "invite", icon: "inviteKey", label: t("roomQuickCards.privacyInvite") },
  ];
}

// RoomScreen.tsx'teki "settings"/"nowPlaying" bildiri kartlarinda buyuk
// ikon secimi icin kullanilir (bkz. RoomSettingsSheet.tsx PLAYBACK_OPTIONS -
// ayni secenekler, burada kisa tek satirlik etiketlerle).
export function getPlaybackInfo(t: (key: string) => string): Record<PlaybackMode, { icon: IconName; label: string }> {
  return {
    leader: { icon: "crownFilled", label: t("roomQuickCards.playbackLeader") },
    playOnly: { icon: "playOnlyControl", label: t("roomQuickCards.playbackPlayOnly") },
    autoplay: { icon: "autoplayQueue", label: t("roomQuickCards.playbackAutoplay") },
    vote: { icon: "voteBox", label: t("roomQuickCards.playbackVote") },
  };
}

/** Oda yeni acildiginda sohbetin en ustunde (bkz. RoomScreen.tsx chat
 * FlatList ListHeaderComponent) beliren, digerleriyle (bkz. RoomScreen.tsx
 * eventRow/nowPlayingRow) AYNI "bildiri karti" ailesinden iki kart: gizlilik
 * secimi (sadece lider) ve arkadaslari tek dokunusla davet etme. Kapatma
 * tusu YOK - mesajlar aktikca zaten yukarida kalip sohbet gecmisine karisir,
 * ayrica kalici bir kapatma durumu tutmaya gerek yok. */
export default function RoomQuickCards({ isHost, privacy, onChangePrivacy, friends, sentIds, onInviteFriend }: Props) {
  const { t } = useTranslation();
  const showPrivacy = isHost;
  const showInvite = friends.length > 0;
  const privacyOptions = getPrivacyOptions(t);

  if (!showPrivacy && !showInvite) return null;

  return (
    <View style={styles.wrap}>
      {showPrivacy && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t("roomQuickCards.cardPrivacyTitle")}</Text>
          <View style={styles.privacyRow}>
            {privacyOptions.map((opt) => {
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
          <Text style={styles.cardTitle}>{t("roomQuickCards.cardInviteTitle")}</Text>
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
                      <Icon name={sent ? "check" : "plus"} size={12} color="#04140D" />
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
