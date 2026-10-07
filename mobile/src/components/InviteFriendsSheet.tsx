import React, { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, FlatList, Modal } from "react-native";
import { getSocket, FriendUser, Participant } from "../services/socket";
import { showAlert } from "./CustomAlert";
import LoadingView from "./LoadingView";
import Icon from "./Icon";

const ACCENT = "#0EA5E9";
const BG = "#000000";
const TEXT = "#F5F0E6";
const MUTED = "#9A8F80";

function toHandle(name: string): string {
  return name.toLowerCase().replace(/\s+/g, "");
}

interface Props {
  visible: boolean;
  onClose: () => void;
  // Zaten odada olan arkadaslar tekrar listelenmesin diye.
  participants: Participant[];
}

/** Katilimcilar panelindeki davet ikonuna basinca acilir - Discover'daki
 * sag ustteki arkadaslar ikonuna basinca acilan FriendsScreen ile AYNI
 * TAM EKRAN gorunum (kart/sheet DEGIL - bkz. kullanicinin "kart degil ekran
 * olucaktı" duzeltmesi), ama satirlarin saginda tek tek isaretlenebilen bir
 * onay kutusu var - en az bir kisi isaretlenince altta "Davet At" butonu
 * belirir. Gonderim zaten var olan ama hic client'tan cagrilmayan
 * "room:invite" uc noktasini kullanir (bkz. server/src/index.ts). */
export default function InviteFriendsSheet({ visible, onClose, participants }: Props) {
  const socket = getSocket();
  const [friends, setFriends] = useState<FriendUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setSelected(new Set());
    setLoading(true);
    socket.emit("friends:list", {}, (res: any) => {
      setLoading(false);
      if (res?.ok) setFriends(res.friends);
    });
  }, [visible]);

  const presentIds = new Set(participants.map((p) => p.userId).filter(Boolean));
  const invitable = friends.filter((f) => !presentIds.has(f.userId));

  function toggle(userId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  function sendInvites() {
    if (selected.size === 0 || sending) return;
    setSending(true);
    const ids = Array.from(selected);
    let remaining = ids.length;
    let failed = 0;
    ids.forEach((toUserId) => {
      socket.emit("room:invite", { toUserId }, (res: any) => {
        if (!res?.ok) failed++;
        remaining--;
        if (remaining === 0) {
          setSending(false);
          onClose();
          showAlert(
            failed === 0 ? "Davet gonderildi" : "Bazilari gonderilemedi",
            failed === 0
              ? `${ids.length} kisiye davet gonderildi.`
              : `${ids.length - failed}/${ids.length} kisiye davet gonderildi.`
          );
        }
      });
    });
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.screen}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.iconTouch} onPress={onClose} hitSlop={8}>
            <Icon name="close" size={30} color={TEXT} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Arkadaşlarını Davet Et</Text>
          <View style={styles.iconTouch} />
        </View>

        <FlatList
          data={invitable}
          keyExtractor={(f) => f.userId}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            loading ? <LoadingView /> : <Text style={styles.emptyText}>Davet edilebilecek arkadaşın yok.</Text>
          }
          renderItem={({ item }) => {
            const isSelected = selected.has(item.userId);
            return (
              <TouchableOpacity style={styles.row} onPress={() => toggle(item.userId)} activeOpacity={0.7}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarInitial}>{item.name.charAt(0).toUpperCase()}</Text>
                </View>
                <View style={styles.rowText}>
                  <Text style={styles.rowName}>{item.name}</Text>
                  <Text style={styles.rowHandle}>@{toHandle(item.name)}</Text>
                </View>
                <View style={[styles.checkbox, isSelected && styles.checkboxChecked]}>
                  {isSelected && <Icon name="check" size={16} color="#04140D" />}
                </View>
              </TouchableOpacity>
            );
          }}
        />

        {selected.size > 0 && (
          <View style={styles.inviteBar}>
            <TouchableOpacity style={styles.inviteButton} onPress={sendInvites} disabled={sending}>
              <Text style={styles.inviteButtonText}>Davet At ({selected.size})</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 12,
  },
  iconTouch: { width: 38, height: 38, justifyContent: "center", alignItems: "center" },
  headerTitle: { color: TEXT, fontSize: 16, fontWeight: "700" },
  listContent: { paddingHorizontal: 16, paddingBottom: 100 },
  emptyText: { color: MUTED, textAlign: "center", marginTop: 60, fontSize: 14 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#3A2F22",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: { color: ACCENT, fontSize: 18, fontWeight: "700" },
  rowText: { flex: 1 },
  rowName: { color: TEXT, fontSize: 14, fontWeight: "700" },
  rowHandle: { color: MUTED, fontSize: 12, fontWeight: "500", lineHeight: 16, marginTop: 2 },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: MUTED,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxChecked: { backgroundColor: ACCENT, borderColor: ACCENT },
  inviteBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: 16,
    paddingBottom: 34,
    backgroundColor: BG,
    borderTopWidth: 1,
    borderTopColor: "#26262B",
  },
  inviteButton: {
    backgroundColor: ACCENT,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  inviteButtonText: { color: "#04140D", fontSize: 16, fontWeight: "700" },
});
