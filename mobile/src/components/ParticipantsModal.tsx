import { FlatList, Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import type { Participant } from "../services/socket";
import Avatar from "./Avatar";
import Icon from "./Icon";
import CrownBadge from "./CrownBadge";
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
  // Liderin kendi mikrofonu su an acik mi (bkz. RoomScreen.tsx
  // room.micOpenToAll) - HERKES gorur, ama tiklayip degistirmek (kendi
  // mikrofonunu acip kapatmak) SADECE liderin kendisine ozel.
  hostMicOpen: boolean;
  onToggleOwnMic: () => void;
  // Panel ust barin (X/ayarlar/logo/ara/katilimci ikonlarinin oldugu satir)
  // UZERINE binmesin, hemen altindan baslasin diye (bkz. RoomScreen.tsx
  // topBarHeight - gercek yukseklik cihaza gore degistigi icin olculur).
  topOffset: number;
  // Davet (arkadas ekle) - eskiden mesaj alanindaki ikon cubugundaydi,
  // artik panelin alt barinda (bkz. RoomScreen.tsx shareRoom).
  onInvite: () => void;
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
  hostMicOpen,
  onToggleOwnMic,
  topOffset,
  onInvite,
}: Props) {
  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={[styles.sheet, { top: topOffset }]} onPress={() => {}}>
          <View style={styles.content}>
            <Text style={styles.title}>Katilimcilar ({participants.length})</Text>

            <FlatList
              style={styles.list}
              contentContainerStyle={styles.listContent}
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
                        <CrownBadge size={20} color={theme.accent} />
                      </View>
                    )}
                  </View>
                  <View style={styles.nameWrap}>
                    <Text style={styles.name} numberOfLines={1}>
                      {item.name}
                    </Text>
                    {!!item.handle && (
                      <Text style={styles.handle} numberOfLines={1}>
                        @{item.handle}
                      </Text>
                    )}
                  </View>
                  {/* Mikrofon durumu - HERKES gorur (kim susturulmus/liderin
                      mikrofonu acik mi bilsin diye). Tiklayip degistirmek ise
                      HER ZAMAN o mikrofonun "sahibine" ozel: liderin kendi
                      satirinda SADECE lider kendisi degistirebilir (bkz.
                      RoomScreen.tsx handleMicPress), diger katilimcilarin
                      satirinda SADECE lider degistirebilir (bkz.
                      server/src/rooms.ts setParticipantMuted). */}
                  {item.isHost ? (
                    <TouchableOpacity
                      style={styles.micBtn}
                      onPress={() => isSelf && onToggleOwnMic()}
                      disabled={!isSelf}
                      hitSlop={8}
                    >
                      <Icon name={hostMicOpen ? "mic" : "micOff"} size={20} color={hostMicOpen ? theme.textMuted : theme.danger} />
                    </TouchableOpacity>
                  ) : (
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
          </View>
          {/* Alt bar - mesaj alanindaki alt barla AYNI seviyede (bkz.
              RoomScreen.tsx styles.bottomBar) - davet ikonu artik burada,
              en sagda. */}
          <View style={styles.bottomBar}>
            <TouchableOpacity style={styles.inviteBtn} onPress={onInvite} hitSlop={4}>
              <Icon name="invite" size={28} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // Katilimcilar paneli artik Rave'deki gibi sagdan acilan bir kutu -
  // ekranin genisliginin ~%60'ini kapliyor, ust bardan baslayip ekranin
  // altina kadar uzaniyor (top: topOffset, inline style ile verilir).
  // Koseler SIVRI - hicbir yerde yuvarlatma yok.
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)" },
  sheet: {
    position: "absolute",
    right: 0,
    bottom: 0,
    width: "60%",
    backgroundColor: theme.surface,
  },
  content: { flex: 1, padding: 20 },
  // Alt bar - mesaj alanindaki alt barla (RoomScreen.tsx styles.bottomBar)
  // AYNI yukseklik/dolgu degerleri, davet ikonu en saga yaslanir.
  bottomBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderTopWidth: 1,
    borderTopColor: theme.border,
  },
  inviteBtn: { width: 30, height: 38, justifyContent: "center", alignItems: "center" },
  list: { flex: 1 },
  // Ilk satirin lider rozeti (negatif top ile ustte tasan) listenin kendi
  // ust sinirinda KESILMESIN diye ufak bir bosluk birakiyoruz.
  listContent: { paddingTop: 14 },
  title: { color: theme.text, fontSize: 16, fontWeight: "700", marginBottom: 12 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
  avatarWrap: { position: "relative" },
  // Lider rozeti - ozel cizilmis, kenarlari asagi kivrilan taç (bkz.
  // CrownBadge.tsx) profil fotografinin TAM USTUNE (negatif top ile) oturur.
  hostBadge: {
    position: "absolute",
    top: -15,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  nameWrap: { flex: 1 },
  name: { color: theme.text, fontSize: 14 },
  handle: { color: theme.textMuted, fontSize: 12, marginTop: 1 },
  micBtn: { padding: 4 },
  actions: { flexDirection: "row", gap: 10 },
  actionText: { color: theme.info, fontSize: 12 },
  actionTextDanger: { color: theme.danger, fontSize: 12 },
});
