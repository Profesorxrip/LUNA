import { FlatList, Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import type { Participant } from "../services/socket";
import Avatar from "./Avatar";
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
  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={styles.sheet} onPress={() => {}}>
          <Text style={styles.title}>Katilimcilar ({participants.length})</Text>
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
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", padding: 24 },
  sheet: { backgroundColor: theme.surface, borderRadius: 16, padding: 20, maxHeight: "70%" },
  title: { color: theme.text, fontSize: 16, fontWeight: "700", marginBottom: 12 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
  name: { color: theme.text, fontSize: 14, flex: 1 },
  actions: { flexDirection: "row", gap: 10 },
  actionText: { color: theme.info, fontSize: 12 },
  actionTextDanger: { color: theme.danger, fontSize: 12 },
});
