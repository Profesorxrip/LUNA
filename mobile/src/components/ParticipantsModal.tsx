import { FlatList, Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import type { Participant } from "../services/socket";
import Avatar from "./Avatar";
import Icon from "./Icon";
import CrownBadge from "./CrownBadge";
import ModeratorBadge from "./ModeratorBadge";
import CountryFlag from "./CountryFlag";
import WaveFillIcon from "./WaveFillIcon";
import { theme } from "../theme";

// WaveFillIcon'un dalgali maskesi icin HAM PNG kaynaklari - CustomIcons.tsx'teki
// RoomMicIcon ile AYNI anahat dosyasi + ic boslugu doldurulmus "solid" hali
// (bkz. WaveFillIcon.tsx'teki yorum).
const MIC_ICON_SOURCE = require("../../assets/icons/microphone.png");
const MIC_ICON_FILLED_SOURCE = require("../../assets/icons/microphone-filled.png");

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
  // Kendi mikrofonumu acip/kapatmak - rol FARK ETMEKSIZIN HERKESE ait:
  // lider/moderator/uye, kendi satirinda HER ZAMAN bunu tetikler (acmak
  // izne tabi olabilir - bkz. RoomScreen.tsx handleMicPress - ama kapatmak
  // her zaman serbesttir, o da ayni fonksiyonun icinde yonetiliyor).
  onToggleOwnMic: () => void;
  // Kamera ikonu - LUNA'da gercek bir kamera yayini YOK, bu yuzden bu
  // SADECE GORSEL bir durum (bkz. server/src/rooms.ts Participant.camMuted).
  // Mikrofondan farkli olarak KENDI satirinda da bu AYNI callback kullanilir
  // (acmak icin izin GEREKMEZ - bkz. rooms.ts setParticipantCamMuted), bu
  // yuzden mic'teki gibi ayri bir "myCamOpen" prop'una ihtiyac yok, item.camMuted
  // zaten hem kendi hem baskalarinin satirinda dogru/canli degeri tasir.
  onMuteCameraParticipant: (targetSocketId: string, camMuted: boolean) => void;
  // Her katilimcinin (socketId -> boolean) O AN gercekten sesli sohbette
  // mikrofonu ACIK mi - LiveKit'ten gelir (bkz. useVoiceChat.ts remoteMicOn),
  // sunucu bunu BILMEZ. "izni var ama acmamis" (gri) ile "izni var VE acik"
  // (beyaz) ayrimi icin kullanilir - zorla susturulmus (item.muted) olan
  // HER ZAMAN kirmizi, bu haritaya hic bakilmaz. Haritada olmayan/false olan
  // bir katilimci "kapali/bilinmiyor" sayilir (sesli sohbete hic baglanmamis
  // olabilir).
  micOnBySocket: Record<string, boolean>;
  // O an KONUSAN (LiveKit "active speaker") katilimcilarin socketId listesi -
  // mikrofon ikonunun etrafindaki dalgalanma animasyonu icin (bkz.
  // SpeakingPulse). Sadece mikrofonu GERCEKTEN acik olanlar icin anlamli.
  speakingSocketIds: string[];
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

interface MicVisual {
  name: "mic" | "micOff";
  color: string;
  speaking: boolean;
}

// Mikrofon ikonunun 3 durumu - KIRMIZI: lider/moderator/kendisi tarafindan
// izni kapatildi (item.muted - zorla susturma, bkz. server/src/rooms.ts
// setParticipantMuted). GRI: izni var ama su an sesli sohbette mikrofonu
// ACIK DEGIL (hic baglanmamis olabilir ya da baglanip kendi susturmus
// olabilir - ikisi de "izni var, kullanmiyor" ayni gorsel). BEYAZ: izni var
// VE fiilen acik - bu durumda, LiveKit o an KONUSTUGUNU tespit ettiyse
// (speakingSocketIds) ikonun arkasinda dalgalanma da gosterilir.
function micVisual(item: Participant, micOnBySocket: Record<string, boolean>, speakingSocketIds: string[]): MicVisual {
  if (item.muted) return { name: "micOff", color: theme.danger, speaking: false };
  const on = Boolean(micOnBySocket[item.socketId]);
  if (!on) return { name: "micOff", color: theme.textMuted, speaking: false };
  return { name: "mic", color: "#FFFFFF", speaking: speakingSocketIds.includes(item.socketId) };
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
  onToggleOwnMic,
  onMuteCameraParticipant,
  micOnBySocket,
  speakingSocketIds,
  topOffset,
  onShowMap,
  onInvite,
  friendIds,
}: Props) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose} statusBarTranslucent>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={[styles.sheet, { top: topOffset, paddingBottom: insets.bottom }]} onPress={() => {}}>
          <View style={styles.content}>
            <Text style={styles.title}>{t("room.participantsTitle", { count: participants.length })}</Text>

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
              const mic = micVisual(item, micOnBySocket, speakingSocketIds);
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
                        <CrownBadge size={20} />
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
                  {/* Kamera ikonu - LUNA'da gercek bir kamera yayini olmadigi
                      icin "acmak" herkese HER ZAMAN serbest (bkz. yukarida
                      onMuteCameraParticipant yorumu), bu yuzden kendi
                      satirimda da AYNI callback kullanilir - mic'teki gibi
                      ayri bir "kendi" dalina gerek yok. */}
                  <TouchableOpacity
                    style={styles.micBtn}
                    onPress={() => (isSelf || canModerateThisTarget) && onMuteCameraParticipant(item.socketId, !item.camMuted)}
                    disabled={!isSelf && !canModerateThisTarget}
                    hitSlop={8}
                  >
                    <Icon name={item.camMuted ? "videoOff" : "video"} size={20} color={item.camMuted ? theme.danger : theme.textMuted} />
                  </TouchableOpacity>
                  {isSelf ? (
                    <TouchableOpacity style={styles.micBtn} onPress={onToggleOwnMic} hitSlop={8}>
                      <View style={styles.micIconStack}>
                        {mic.speaking ? (
                          <WaveFillIcon size={20} source={MIC_ICON_SOURCE} filledSource={MIC_ICON_FILLED_SOURCE} />
                        ) : (
                          <Icon name={mic.name} size={20} color={mic.color} />
                        )}
                      </View>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={styles.micBtn}
                      onPress={() => canModerateThisTarget && onMuteParticipant(item.socketId, !item.muted)}
                      disabled={!canModerateThisTarget}
                      hitSlop={8}
                    >
                      <View style={styles.micIconStack}>
                        {mic.speaking ? (
                          <WaveFillIcon size={20} source={MIC_ICON_SOURCE} filledSource={MIC_ICON_FILLED_SOURCE} />
                        ) : (
                          <Icon name={mic.name} size={20} color={mic.color} />
                        )}
                      </View>
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
  // Mikrofon ikonuyla AYNI boyutta - SpeakingPulse (dalgalanma) bunu tam
  // dolduracak sekilde cizilir, boylece merkezleme icin ayri bir hesap
  // gerekmiyor (bkz. SpeakingPulse yorumu).
  micIconStack: { width: 20, height: 20, alignItems: "center", justifyContent: "center" },
});
