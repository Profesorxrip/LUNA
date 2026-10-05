import { useState } from "react";
import { FlatList, Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { getSocket } from "../services/socket";
import type { Participant, FriendUser } from "../services/socket";
import { showAlert } from "./CustomAlert";
import Avatar from "./Avatar";
import Icon from "./Icon";
import { theme } from "../theme";

interface Props {
  visible: boolean;
  onClose: () => void;
  participants: Participant[];
  mySocketId?: string;
  isHost: boolean;
  onKick: (targetSocketId: string) => void;
  onMakeLeader: (targetSocketId: string) => void;
}

/** Rave'deki ust bardaki "3" rozetli katilimci ikonuna basinca acilan liste -
 * eskiden ekranda sabit yer kaplayan yatay satirin yerine gecti. */
export default function ParticipantsModal({ visible, onClose, participants, mySocketId, isHost, onKick, onMakeLeader }: Props) {
  const [inviteVisible, setInviteVisible] = useState(false);
  const [friends, setFriends] = useState<FriendUser[] | null>(null);

  // Odada ZATEN olan arkadaslari davet listesinden cikariyoruz - tekrar
  // davet etmenin bir anlami yok.
  const participantUserIds = new Set(participants.map((p) => p.userId).filter(Boolean));
  const inviteCandidates = (friends ?? []).filter((f) => !participantUserIds.has(f.userId));

  function openInvite() {
    setInviteVisible(true);
    if (friends === null) {
      getSocket().emit("friends:list", {}, (res: any) => {
        if (res?.ok) setFriends(res.friends);
        else setFriends([]);
      });
    }
  }

  function sendInvite(friend: FriendUser) {
    getSocket().emit("room:invite", { toUserId: friend.userId }, (res: any) => {
      if (res?.ok) showAlert("Davet gönderildi", `${friend.name} bu odaya davet edildi.`);
      else showAlert("Gönderilemedi", res?.error || "Davet gönderilemedi, tekrar dene.");
    });
    setInviteVisible(false);
  }

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={styles.sheet} onPress={() => {}}>
          <Text style={styles.title}>Katilimcilar ({participants.length})</Text>

          <TouchableOpacity style={styles.inviteRow} onPress={openInvite}>
            <View style={styles.inviteIcon}>
              <Icon name="invite" size={18} color={theme.accent} />
            </View>
            <Text style={styles.inviteText}>Arkadaşını Davet Et</Text>
          </TouchableOpacity>

          <FlatList
            data={participants}
            keyExtractor={(p) => p.socketId}
            renderItem={({ item }) => (
              <View style={styles.row}>
                <Avatar name={item.name} avatarUrl={item.avatarUrl} size={40} />
                <Text style={styles.name} numberOfLines={1}>
                  {item.isHost ? "👑 " : ""}
                  {item.name}
                </Text>
                {isHost && item.socketId !== mySocketId && (
                  <View style={styles.actions}>
                    <TouchableOpacity onPress={() => onMakeLeader(item.socketId)}>
                      <Text style={styles.actionText}>Lider yap</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => onKick(item.socketId)}>
                      <Text style={styles.actionTextDanger}>At</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}
          />
        </TouchableOpacity>
      </TouchableOpacity>

      <Modal visible={inviteVisible} animationType="fade" transparent onRequestClose={() => setInviteVisible(false)}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => setInviteVisible(false)}>
          <TouchableOpacity activeOpacity={1} style={styles.sheet} onPress={() => {}}>
            <Text style={styles.title}>Arkadaşını Davet Et</Text>
            {friends === null ? (
              <Text style={styles.emptyText}>Yükleniyor...</Text>
            ) : inviteCandidates.length === 0 ? (
              <Text style={styles.emptyText}>Davet edebileceğin (odada olmayan) arkadaşın yok.</Text>
            ) : (
              <FlatList
                data={inviteCandidates}
                keyExtractor={(f) => f.userId}
                renderItem={({ item }) => (
                  <TouchableOpacity style={styles.row} onPress={() => sendInvite(item)}>
                    <Avatar name={item.name} size={40} />
                    <Text style={styles.name} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={styles.inviteSendText}>Davet Et</Text>
                  </TouchableOpacity>
                )}
              />
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", padding: 24 },
  sheet: { backgroundColor: theme.surface, borderRadius: 16, padding: 20, maxHeight: "70%" },
  title: { color: theme.text, fontSize: 16, fontWeight: "700", marginBottom: 12 },
  inviteRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    marginBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  inviteIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  inviteText: { color: theme.accent, fontSize: 14, fontWeight: "700" },
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
  name: { color: theme.text, fontSize: 14, flex: 1 },
  actions: { flexDirection: "row", gap: 10 },
  actionText: { color: theme.info, fontSize: 12 },
  actionTextDanger: { color: theme.danger, fontSize: 12 },
  inviteSendText: { color: theme.accent, fontSize: 12, fontWeight: "700" },
  emptyText: { color: theme.textMuted, fontSize: 13, textAlign: "center", paddingVertical: 20 },
});
