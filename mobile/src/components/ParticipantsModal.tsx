import { useEffect, useRef, useState } from "react";
import { FlatList, Modal, PanResponder, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { MoreVertical } from "lucide-react-native";
import type { Participant } from "../services/socket";
import Avatar from "./Avatar";
import Icon from "./Icon";
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
  // Panel videonun ALT KENARINDA baslasin diye (bkz. RoomSettingsSheet.tsx
  // ile AYNI mantik - RoomScreen.tsx topBarHeight + videoNaturalHeight) -
  // video gizlendiginde (videoHidden) bu deger topBarHeight'a duser, panel
  // en yukari kadar cikar.
  topOffset: number;
  // Panelin "tam ekran" durdugu sabit deger (= topBarHeight) - video
  // GORUNURKEN kullanici tutamaci yukari suruklerse panel bu degere kadar
  // genisler (bkz. asagidaki manuallyExpanded/dragPanResponder - AYNI
  // RoomSettingsSheet.tsx'teki gibi).
  fullTopOffset: number;
  // Kutunun O ANKI yarim/tam ekran durumu DEGISTIKCE ebeveyne (RoomScreen.tsx)
  // bildirir - ProfileOptionsSheet'i kutunun GUNCEL yuksekligine gore dikey
  // ortalayabilmek icin (bkz. RoomScreen.tsx participantsExpanded).
  onExpandedChange?: (expanded: boolean) => void;
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
  micOnBySocket,
  speakingSocketIds,
  topOffset,
  fullTopOffset,
  onExpandedChange,
  friendIds,
}: Props) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { height: windowHeight } = useWindowDimensions();

  // Asagidaki surukleme mantigi RoomSettingsSheet.tsx ile BIREBIR AYNI -
  // bkz. oradaki yorumlar icin ayrintili aciklama.
  const [manuallyExpanded, setManuallyExpanded] = useState(false);
  const effectiveTopOffset = manuallyExpanded ? fullTopOffset : topOffset;
  useEffect(() => {
    onExpandedChange?.(manuallyExpanded);
  }, [manuallyExpanded, onExpandedChange]);
  const isDraggingHandleRef = useRef(false);
  const finishDrag = (g: { dy: number }) => {
    if (g.dy < -24) setManuallyExpanded(true);
    else if (g.dy > 24) setManuallyExpanded(false);
    setTimeout(() => {
      isDraggingHandleRef.current = false;
    }, 50);
  };
  const dragPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_evt, g) => Math.abs(g.dy) > 6 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        isDraggingHandleRef.current = true;
      },
      onPanResponderRelease: (_evt, g) => finishDrag(g),
      onPanResponderTerminate: (_evt, g) => finishDrag(g),
    })
  ).current;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose} statusBarTranslucent>
      <TouchableOpacity
        style={styles.backdrop}
        activeOpacity={1}
        onPress={() => {
          if (!isDraggingHandleRef.current) onClose();
        }}
      >
        <TouchableOpacity
          activeOpacity={1}
          style={[
            styles.sheet,
            {
              top: effectiveTopOffset,
              height: Math.max(0, windowHeight - effectiveTopOffset),
              paddingBottom: 30 + insets.bottom,
            },
          ]}
          onPress={() => {}}
        >
          {/* Hap şeklinde sürükleme tutamacı - Ayarlar kutusuyla AYNI
              (bkz. RoomSettingsSheet.tsx dragHandle). */}
          <View style={styles.dragHandleArea} {...dragPanResponder.panHandlers}>
            <View style={styles.dragHandle} />
          </View>
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
                  {/* Rol etiketi - Grup bilgisi ekranindaki (GroupInfoScreen.tsx)
                      KURUCU/YONETICI/UYE yazilariyla AYNI mantik: odanin
                      sahibi (host) burada "KURUCU", moderator ise "LIDER"
                      olarak gosterilir. */}
                  {item.isHost ? (
                    <Text style={styles.roleLabel}>{t("room.participantsRoleHost")}</Text>
                  ) : item.isModerator ? (
                    <Text style={styles.roleLabel}>{t("room.participantsRoleModerator")}</Text>
                  ) : null}
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
                  {/* 3 nokta menusu - Grup bilgisi ekranindaki (GroupInfoScreen.tsx)
                      3 nokta ikonuyla AYNI mantik: odadaki mevcut Profil/
                      Liderlik/Engelle vb. menuyu (ProfileOptionsSheet) acar -
                      eskiden SADECE uzun basinca acilan bu menuye artik acikca
                      dokunarak da erisilebiliyor. Kendi satirimda da gosterilir -
                      kendi uzerimde anlamsiz satirlar (odadan at/engelle vb.)
                      RoomScreen.tsx'teki ProfileOptionsSheet kablamasinda
                      ayiklanir, menu sadece gercekten anlamli olanlari gosterir. */}
                  <TouchableOpacity style={styles.micBtn} onPress={() => onLongPressParticipant(item)} hitSlop={8}>
                    <MoreVertical size={18} color={theme.textMuted} />
                  </TouchableOpacity>
                </View>
              );
              }}
            />
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // Katilimcilar paneli artik Ayarlar kutusuyla (RoomSettingsSheet.tsx)
  // AYNI mantikta: tam genislikte, videonun ALT KENARINDAN (top,
  // effectiveTopOffset ile verilir) ekranin altina kadar uzanan bir sheet -
  // koseler SIVRI, surukleyerek tam ekrana genisletilebilir.
  backdrop: { flex: 1, backgroundColor: "transparent" },
  sheet: {
    position: "absolute",
    top: 0,
    width: "100%",
    maxWidth: 480,
    alignSelf: "center",
    backgroundColor: "#122238",
    paddingTop: 18,
  },
  // Tutamacin GORSEL boyutundan daha genis bir dokunma alani - Ayarlar
  // kutusuyla AYNI (bkz. RoomSettingsSheet.tsx).
  dragHandleArea: { paddingVertical: 10, marginBottom: 2 },
  dragHandle: {
    alignSelf: "center",
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.3)",
  },
  content: { flex: 1, paddingHorizontal: 20 },
  list: { flex: 1 },
  listContent: { paddingTop: 14 },
  title: { color: theme.text, fontSize: 16, fontWeight: "700", marginBottom: 12 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
  identityWrap: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
  avatarWrap: { position: "relative" },
  nameWrap: { flex: 1 },
  name: { color: theme.text, fontSize: 14 },
  // GroupInfoScreen.tsx'teki rowRole ile AYNI stil.
  roleLabel: { color: theme.textMuted, fontSize: 12, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.4 },
  handle: { color: theme.textMuted, fontSize: 12, marginTop: 1 },
  micBtn: { padding: 4 },
  // Mikrofon ikonuyla AYNI boyutta - SpeakingPulse (dalgalanma) bunu tam
  // dolduracak sekilde cizilir, boylece merkezleme icin ayri bir hesap
  // gerekmiyor (bkz. SpeakingPulse yorumu).
  micIconStack: { width: 20, height: 20, alignItems: "center", justifyContent: "center" },
});
