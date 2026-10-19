import { FlatList, Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Participant } from "../services/socket";
import Avatar from "./Avatar";
import Icon from "./Icon";
import CrownBadge from "./CrownBadge";
import ModeratorBadge from "./ModeratorBadge";
import CountryFlag from "./CountryFlag";
import { theme } from "../theme";

interface Props {
  visible: boolean;
  onClose: () => void;
  participants: Participant[];
  mySocketId?: string;
  isHost: boolean;
  // Lider olmasam da moderatorsem baskalarinin mikrofonunu susturabilirim
  // (bkz. rooms.ts canModerate - ProfileOptionsSheet.tsx'teki uzun-basma
  // menusunde zaten boyle calisiyordu, ama bu satirdaki hizli mikrofon
  // ikonu eskiden SADECE isHost'a bakip moderatorleri yanlislikla
  // disliyordu).
  isModerator: boolean;
  onMuteParticipant: (targetSocketId: string, muted: boolean) => void;
  // Bir katilimciya BASILI TUTUNCA (bkz. ProfileOptionsSheet.tsx) - Rave'deki
  // gibi Profil/Liderlik/Engelle/Bildir vb. iceren panel acilir.
  onLongPressParticipant: (participant: Participant) => void;
  // Liderin mikrofonu su an acik mi (bkz. RoomScreen.tsx room.micOpenToAll) -
  // liderin SATIRINI baskalari gorduklerinde bunu kullanir (rolu ne olursa
  // olsun HERKES liderin durumunu boyle gorur).
  hostMicOpen: boolean;
  // KENDI satirimda gosterilecek canli mikrofon durumum - rolum (lider/
  // moderator/uye) FARK ETMEKSIZIN ayni degeri kullanir (bkz. RoomScreen.tsx
  // voice.connected && !voice.muted). Lider icin hostMicOpen ile zaten AYNI
  // deger (lider bunu dogrudan bu formulden yayinlar), ama diger roller icin
  // tek canli kaynak budur.
  myMicOpen: boolean;
  // Kendi mikrofonumu acip/kapatmak - rol FARK ETMEKSIZIN HERKESE ait:
  // lider/moderator/uye, kendi satirinda HER ZAMAN bunu tetikler (acmak
  // izne tabi olabilir - bkz. RoomScreen.tsx handleMicPress - ama kapatmak
  // her zaman serbesttir, o da ayni fonksiyonun icinde yonetiliyor).
  onToggleOwnMic: () => void;
  // Panel ust barin (X/ayarlar/logo/ara/katilimci ikonlarinin oldugu satir)
  // UZERINE binmesin, hemen altindan baslasin diye (bkz. RoomScreen.tsx
  // topBarHeight - gercek yukseklik cihaza gore degistigi icin olculur).
  topOffset: number;
  // Harita (dunya ikonu) - eskiden mesaj alanindaki ikon cubugundaydi,
  // artik panelin alt barinda, davetin solunda (bkz. RoomScreen.tsx showMap).
  onShowMap: () => void;
  // Davet (arkadas ekle) - eskiden mesaj alanindaki ikon cubugundaydi,
  // artik panelin alt barinda, en sagda.
  onInvite: () => void;
  // Discover'daki oda kartlarindaki mavi "arkadas halkasi" ile AYNI - bu
  // odada gercek arkadasimiz olan katilimcilarin avatarinda gosterilir
  // (bkz. Avatar.tsx isFriend, RoomScreen.tsx friendIds).
  friendIds: Set<string>;
}

/** Rave'deki ust bardaki "3" rozetli katilimci ikonuna basinca acilan liste -
 * eskiden ekranda sabit yer kaplayan yatay satirin yerine gecti. */
export default function ParticipantsModal({
  visible,
  onClose,
  participants,
  mySocketId,
  isHost,
  isModerator,
  onMuteParticipant,
  onLongPressParticipant,
  hostMicOpen,
  myMicOpen,
  onToggleOwnMic,
  topOffset,
  onShowMap,
  onInvite,
  friendIds,
}: Props) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose} statusBarTranslucent>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={[styles.sheet, { top: topOffset, paddingBottom: insets.bottom }]} onPress={() => {}}>
          <View style={styles.content}>
            <Text style={styles.title}>Katilimcilar ({participants.length})</Text>

            <FlatList
              style={styles.list}
              contentContainerStyle={styles.listContent}
              data={participants}
              keyExtractor={(p) => p.socketId}
              renderItem={({ item }) => {
              const isSelf = item.socketId === mySocketId;
              // server/src/rooms.ts canModerate ile AYNI kural: lider
              // herkesi, moderator ise SADECE baska bir moderator/lider
              // OLMAYAN birini susturabilir.
              const canModerateThisTarget = isHost || (isModerator && !item.isModerator && !item.isHost);
              // Baskasinin satirindaki ikon - lideriyse hostMicOpen (oda
              // geneline yayinladigi deger), degilse zorla susturulmamis mi.
              const otherMicOpen = item.isHost ? hostMicOpen : !item.muted;
              return (
                <View style={styles.row}>
                  <TouchableOpacity
                    style={styles.identityWrap}
                    activeOpacity={isSelf ? 1 : 0.7}
                    onLongPress={() => !isSelf && onLongPressParticipant(item)}
                  >
                  <View style={styles.avatarWrap}>
                    <Avatar
                      name={item.name}
                      avatarUrl={item.avatarUrl}
                      size={40}
                      isFriend={Boolean(item.userId && friendIds.has(item.userId))}
                    />
                    {item.isHost && (
                      <View style={styles.hostBadge}>
                        <CrownBadge size={20} color={theme.accent} />
                      </View>
                    )}
                    {item.isModerator && (
                      <View style={styles.moderatorBadge}>
                        <ModeratorBadge size={13} color="#fff" />
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
                  <CountryFlag country={item.country} size={14} />
                  </TouchableOpacity>
                  {/* Mikrofon durumu - HERKES gorur (kim susturulmus/liderin
                      mikrofonu acik mi bilsin diye). Tiklayip degistirmek:
                      KENDI satirimda rolum NE OLURSA OLSUN (lider/moderator/
                      uye) HER ZAMAN kendi mikrofonumu acip kapatirim (bkz.
                      RoomScreen.tsx handleMicPress - acmak izne tabi
                      olabilir, kapatmak her zaman serbest). Baskasinin
                      satirinda ise lider VEYA (hedef moderator/lider
                      degilse) moderator degistirebilir (bkz.
                      server/src/rooms.ts canModerate/setParticipantMuted). */}
                  {isSelf ? (
                    <TouchableOpacity style={styles.micBtn} onPress={onToggleOwnMic} hitSlop={8}>
                      <Icon name={myMicOpen ? "mic" : "micOff"} size={20} color={myMicOpen ? theme.textMuted : theme.danger} />
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={styles.micBtn}
                      onPress={() => canModerateThisTarget && onMuteParticipant(item.socketId, !item.muted)}
                      disabled={!canModerateThisTarget}
                      hitSlop={8}
                    >
                      <Icon name={otherMicOpen ? "mic" : "micOff"} size={20} color={otherMicOpen ? theme.textMuted : theme.danger} />
                    </TouchableOpacity>
                  )}
                </View>
              );
              }}
            />
          </View>
          {/* Alt bar - mesaj alanindaki alt barla AYNI seviyede (bkz.
              RoomScreen.tsx styles.bottomBar) - harita ve davet ikonlari
              artik burada, davet en sagda, harita onun solunda. */}
          <View style={styles.bottomBar}>
            <TouchableOpacity style={styles.inviteBtn} onPress={onShowMap} hitSlop={4}>
              <Icon name="globe" size={26} color="#FFFFFF" />
            </TouchableOpacity>
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
    backgroundColor: theme.bg,
  },
  content: { flex: 1, padding: 20 },
  // Alt bar - mesaj alanindaki alt barla (RoomScreen.tsx styles.bottomBar)
  // AYNI yukseklik/dolgu degerleri, davet ikonu en saga yaslanir.
  bottomBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderTopWidth: 1,
    borderTopColor: theme.border,
  },
  inviteBtn: { width: 30, height: 30, justifyContent: "center", alignItems: "center" },
  list: { flex: 1 },
  // Ilk satirin lider rozeti (negatif top ile ustte tasan) listenin kendi
  // ust sinirinda KESILMESIN diye ufak bir bosluk birakiyoruz.
  listContent: { paddingTop: 14 },
  title: { color: theme.text, fontSize: 16, fontWeight: "700", marginBottom: 12 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
  identityWrap: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
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
  // Moderator rozeti - lider rozeti (taç, ustte) gibi profil fotografinin
  // USTUNE biner, SAG ALT kosesinde - arkasinda bir daire/arka plan YOK
  // (profil fotografinda bosluk/kesinti olusturmasin diye).
  moderatorBadge: {
    position: "absolute",
    bottom: -2,
    right: -2,
  },
  nameWrap: { flex: 1 },
  name: { color: theme.text, fontSize: 14 },
  handle: { color: theme.textMuted, fontSize: 12, marginTop: 1 },
  micBtn: { padding: 4 },
});
