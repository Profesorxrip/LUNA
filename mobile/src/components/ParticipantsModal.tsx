import { FlatList, Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import type { Participant } from "../services/socket";
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
  onMuteParticipant: (targetSocketId: string, muted: boolean) => void;
}

/** Rave'deki ust bardaki "3" rozetli katilimci ikonuna basinca acilan liste -
 * eskiden ekranda sabit yer kaplayan yatay satirin yerine gecti. */
export default function ParticipantsModal({
  visible,
  onClose,
  participants,
  mySocketId,
  isHost,
  onKick,
  onMakeLeader,
  onMuteParticipant,
}: Props) {
  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={styles.sheet} onPress={() => {}}>
          <Text style={styles.title}>Katilimcilar ({participants.length})</Text>

          <FlatList
            style={styles.list}
            data={participants}
            keyExtractor={(p) => p.socketId}
            renderItem={({ item }) => {
              const isSelf = item.socketId === mySocketId;
              return (
                <View style={styles.row}>
                  <View style={styles.avatarWrap}>
                    <Avatar name={item.name} avatarUrl={item.avatarUrl} size={40} />
                    {item.isHost && (
                      <View style={styles.hostBadge}>
                        <Icon name="crown" size={14} color="#FFD700" />
                      </View>
                    )}
                  </View>
                  <Text style={styles.name} numberOfLines={1}>
                    {item.name}
                  </Text>
                  {/* Katilimcinin mikrofon durumu - HERKES gorur (susturulup
                      susturulmadigini bilsin diye), ama tiklayip degistirme
                      SADECE host'a ozel (bkz. server/src/rooms.ts
                      setParticipantMuted - host kendini susturamaz, o yuzden
                      kendi satirinda hic gosterilmiyor). */}
                  {!item.isHost && (
                    <TouchableOpacity
                      style={styles.micBtn}
                      onPress={() => isHost && onMuteParticipant(item.socketId, !item.muted)}
                      disabled={!isHost}
                      hitSlop={8}
                    >
                      <Icon name={item.muted ? "micOff" : "mic"} size={20} color={item.muted ? theme.danger : theme.textMuted} />
                    </TouchableOpacity>
                  )}
                  {isHost && !isSelf && (
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
              );
            }}
          />
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // Katilimcilar paneli artik Rave'deki gibi sagdan acilan, TAM YUKSEKLIKTE
  // bir kutu - ekranin genisliginin ~%45'ini kapliyor.
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", flexDirection: "row", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: theme.surface,
    borderTopLeftRadius: 16,
    borderBottomLeftRadius: 16,
    padding: 20,
    width: "45%",
    height: "100%",
  },
  list: { flex: 1 },
  title: { color: theme.text, fontSize: 16, fontWeight: "700", marginBottom: 12 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
  avatarWrap: { position: "relative" },
  // Lider rozeti - emoji yerine profil fotografinin TAM USTUNE binen
  // (negatif top ile) kucuk bir taç ikonu.
  hostBadge: {
    position: "absolute",
    top: -8,
    alignSelf: "center",
    backgroundColor: theme.surface,
    borderRadius: 8,
    padding: 1,
  },
  name: { color: theme.text, fontSize: 14, flex: 1 },
  micBtn: { padding: 4 },
  actions: { flexDirection: "row", gap: 10 },
  actionText: { color: theme.info, fontSize: 12 },
  actionTextDanger: { color: theme.danger, fontSize: 12 },
});
