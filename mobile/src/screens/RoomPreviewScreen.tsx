import React, { useEffect, useState } from "react";
import { View, Text, Image, FlatList, TouchableOpacity, StyleSheet } from "react-native";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { TriangleAlert, Trash } from "lucide-react-native";
import { useFonts, Inter_700Bold } from "@expo-google-fonts/inter";
import { useTranslation } from "react-i18next";
import { getSocket, PublicRoomSummary, RoomParticipantDetail } from "../services/socket";
import { theme } from "../theme";
import Icon from "../components/Icon";
import { RoomMicIcon } from "../components/CustomIcons";
import WaveFillIcon from "../components/WaveFillIcon";
import CrownBadge from "../components/CrownBadge";
import LunaLogo from "../components/LunaLogo";
import { showAlert } from "../components/CustomAlert";
import LoadingView from "../components/LoadingView";
import PlatformBadge from "../components/PlatformBadge";
import AdultBadge from "../components/AdultBadge";
import FilledFriendsIcon from "../components/FilledFriendsIcon";
import { badgeInfoForSource, coverUrlForSource } from "../utils/media";
import { hideRoomFromDiscover } from "../utils/hiddenRooms";
import StaticTabBar, { TabKey } from "../navigation/StaticTabBar";

interface Props {
  room: PublicRoomSummary;
  onBack: () => void;
  onJoin: () => void;
  onOpenParticipant: (peer: { userId: string; name: string; handle?: string }) => void;
  // Bu ekran Tab.Navigator'in DISINDA (bkz. RootNavigator.tsx RootStackParamList
  // yorumu) - alttaki sekme cubugu burada STATIK olarak tekrar cizilip, bir
  // sekmeye basilinca MainTabs'a (o sekmeye) donulmesi bu callback'le saglaniyor.
  onNavigateTab: (tab: TabKey) => void;
}

// Discover karti/RoomCardVariantD'deki canli AVATAR_GRADIENTS ile ayni
// renk ailesi - katilimci avatarinin HEM dolgusu HEM de cercevesi bu
// renkten (eskiden sadece kahverengi/yesil tonlarda, cercevesizdi).
const AVATAR_COLORS = ["#6366F1", "#14B8A6", "#F472B6", "#FBBF24", "#38BDF8"];

// WaveFillIcon'un dalgali maskesi icin HAM PNG kaynaklari (CustomIcons.tsx'teki
// VideoIcon/RoomMicIcon ile AYNI dosyalar - bkz. o dosyadaki yorum, kullanicinin
// gonderdigi referans gorselden piksel piksel cikarilmis siluetler).
const VIDEO_ICON_SOURCE = require("../../assets/icons/video-camera.png");
const MIC_ICON_SOURCE = require("../../assets/icons/microphone.png");
// Ic bosluklari (kamera govdesi/mikrofon ovali) doldurulmus "solid" halleri -
// SADECE WaveFillIcon'un dalgasinin maskesi icin (bkz. o dosyadaki yorum).
const VIDEO_ICON_FILLED_SOURCE = require("../../assets/icons/video-camera-filled.png");
const MIC_ICON_FILLED_SOURCE = require("../../assets/icons/microphone-filled.png");

function formatTime(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

// Odanin "Açıldı: 14:32" satiri icin - sadece saat:dakika, cihazin kendi
// yerel saatine gore (bkz. server/src/rooms.ts mapRoomSummary createdAtMs).
function formatOpenedTime(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// Kamera/mikrofon ikonu - KIRMIZI/GRI/BEYAZ 3 durum, konusuyorsa (speaking)
// WaveFillIcon ile dalgali beyaz dolgu gosterilir (bkz. WaveFillIcon.tsx).
// statusIconStack disaridan AYNI sabit kutu boyutunu (24x24) veriyor ki
// konusma baslayip bitince satirdaki diger ikonlar KAYMASIN.
function renderStatusIcon(
  source: any,
  filledSource: any,
  staticIcon: React.ReactNode,
  muted: boolean,
  on: boolean | undefined,
  speaking: boolean | undefined
) {
  const showWave = Boolean(speaking) && !muted && on;
  return (
    <View style={styles.statusIconStack}>
      {showWave ? <WaveFillIcon size={24} source={source} filledSource={filledSource} /> : staticIcon}
    </View>
  );
}

export default function RoomPreviewScreen({ room, onBack, onJoin, onOpenParticipant, onNavigateTab }: Props) {
  // AdultBadge (+18 rozeti) Inter_700Bold kullaniyor - bu ekran onu HICBIR
  // zaman yuklemiyordu, bu yuzden sistemin varsayilan (garip duran) fontuna
  // duşuyordu (bkz. DiscoverScreen.tsx'teki AYNI yukleme).
  useFonts({ Inter_700Bold });
  const { t } = useTranslation();
  const [participants, setParticipants] = useState<RoomParticipantDetail[]>([]);
  const [loadingParticipants, setLoadingParticipants] = useState(true);
  const [position, setPosition] = useState(room.positionSeconds);
  // Discover'daki oda kartlarindaki/RoomScreen.tsx'teki (ParticipantsModal
  // friendIds) ile AYNI gercek arkadaslik halkasi - buraya kadar hic
  // GETIRILMIYORDU, katilimci avatarlari SADECE dekoratif sira-rengi
  // cerceveye sahipti (bkz. AVATAR_COLORS), gercek arkadas olup olmadigini
  // hic yansitmiyordu.
  const [friendIds, setFriendIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    getSocket().emit("room:participants", { code: room.code }, (res: any) => {
      if (res?.ok) setParticipants(res.participants);
      setLoadingParticipants(false);
    });
  }, [room.code]);

  useEffect(() => {
    getSocket().emit("friends:list", {}, (res: any) => {
      if (res?.ok) setFriendIds(new Set(res.friends.map((f: { userId: string }) => f.userId)));
    });
  }, []);

  // "Odayı Sil" - odayi GERCEKTEN silmiyor/kapatmiyor, sadece bu kullanicinin
  // KENDI Keşfet listesinden gizliyor (bkz. utils/hiddenRooms.ts) - herkes
  // kullanabilir, oda baskalarinda normal gorunmeye devam eder.
  function confirmHideRoom() {
    showAlert(t("roomPreview.deleteRoomTitle"), t("roomPreview.deleteRoomBody"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("roomPreview.remove"),
        style: "destructive",
        onPress: async () => {
          await hideRoomFromDiscover(room.code);
          onBack();
        },
      },
    ]);
  }

  function reportRoom() {
    const host = participants.find((p) => p.isHost);
    if (!host?.userId) return;
    getSocket().emit(
      "report:submit",
      { targetUserId: host.userId, reason: `Oda bildirildi: ${room.code} - ${room.title}` },
      (res: any) => {
        if (res?.ok) showAlert(t("discover.reportedTitle"), t("roomPreview.roomReportedBody"));
      }
    );
  }

  const hasDuration = room.durationSeconds != null && room.durationSeconds > 0;
  const hasEnded = hasDuration && position >= room.durationSeconds!;

  // Oynatiliyorsa konumu ekranda canli sekilde ilerletiyoruz - tipki
  // referans ss'deki "2:15/3:36" gibi surekli akan bir sayac. Video suresine
  // ulasinca ("bitti") sayaci orada durduruyoruz, suresiz ilerlemesin.
  useEffect(() => {
    if (!room.isPlaying || hasEnded) return;
    const timer = setInterval(
      () => setPosition((p) => (hasDuration ? Math.min(p + 1, room.durationSeconds!) : p + 1)),
      1000
    );
    return () => clearInterval(timer);
  }, [room.isPlaying, hasEnded, hasDuration]);

  const platform = badgeInfoForSource(room.source);
  const coverUrl = coverUrlForSource(room.source);
  const statusText = hasEnded ? t("roomPreview.ended") : room.isPlaying ? t("roomPreview.playing") : t("roomPreview.paused");

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity onPress={reportRoom} hitSlop={10} style={styles.warningIconWrap}>
          <TriangleAlert size={28} color="#FFFFFF" strokeWidth={1.8} />
        </TouchableOpacity>
        <LunaLogo width={88} style={{ marginTop: -19 }} />
        <TouchableOpacity onPress={confirmHideRoom} hitSlop={10} style={styles.trashIconWrap}>
          <Trash size={28} color={theme.danger} strokeWidth={1.8} />
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.coverWrap} activeOpacity={0.9} onPress={onJoin}>
        {coverUrl ? (
          <Image source={{ uri: coverUrl }} style={styles.cover} />
        ) : (
          <View style={[styles.cover, styles.coverPlaceholder]} />
        )}
        {room.isAdult && <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} pointerEvents="none" />}
        {platform && (
          <View style={styles.platformBadge}>
            <PlatformBadge platform={platform.key} faviconUrl={platform.faviconUrl} size={30} />
          </View>
        )}
        {room.isAdult && (
          <View style={styles.adultBadge}>
            <AdultBadge size={30} />
          </View>
        )}
      </TouchableOpacity>

      <Text style={styles.title} numberOfLines={2}>
        {room.title}
      </Text>

      <View style={styles.statusRow}>
        <View style={styles.statusLeft}>
          {room.privacy === "friends" ? (
            <FilledFriendsIcon size={16} color={theme.textMuted} />
          ) : (
            <Icon name={room.privacy === "invite" ? "inviteKey" : room.privacy === "nearby" ? "radar" : "worldOpen"} size={16} color={theme.textMuted} />
          )}
          {platform && (
            <>
              <Text style={styles.statusDot}>•</Text>
              <Text style={styles.statusText}>{platform.label}</Text>
            </>
          )}
          <Text style={styles.statusDot}>•</Text>
          <Text style={styles.statusText}>{statusText}</Text>
          {hasDuration && (
            <>
              <Text style={styles.statusDot}>•</Text>
              <Text style={styles.statusText}>
                {formatTime(position)}/{formatTime(room.durationSeconds!)}
              </Text>
            </>
          )}
          <Text style={styles.statusDot}>•</Text>
          <Text style={styles.statusText}>{t("roomPreview.openedAt", { time: formatOpenedTime(room.createdAtMs) })}</Text>
        </View>
      </View>

      <FlatList
        data={participants}
        keyExtractor={(item, i) => item.userId || `guest-${i}`}
        style={styles.participantList}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          loadingParticipants ? (
            <LoadingView />
          ) : (
            <Text style={styles.emptyText}>{t("roomPreview.noParticipantInfo")}</Text>
          )
        }
        renderItem={({ item, index }) => (
          <TouchableOpacity
            style={styles.participantRow}
            disabled={!item.userId}
            onPress={() => item.userId && onOpenParticipant({ userId: item.userId, name: item.name, handle: item.handle || undefined })}
          >
            <View style={styles.avatarWrap}>
              {/* Gercek arkadasimizsa (bkz. yukarida friendIds) RoomCardVariantD.tsx'teki
                  (Discover'daki oda karti) GERCEK "arkadas halkasi" ile BIREBIR
                  AYNI teknik - duz bir renk DEGIL, beyazdan maviye gecen bir
                  degrade halka (TabBar/arama cubugu cercevesindeki AYNI motif).
                  Daha once burada yanlislikla Avatar.tsx'teki (kullanilmayan)
                  duz accentBright kenarligi taklit edilmisti. */}
              {(() => {
                const isFriend = Boolean(item.userId && friendIds.has(item.userId));
                const content = item.avatarUrl ? (
                  <Image source={{ uri: item.avatarUrl }} style={styles.participantAvatarInner} />
                ) : (
                  <View
                    style={[
                      styles.participantAvatarInner,
                      styles.participantAvatarFallback,
                      { backgroundColor: AVATAR_COLORS[index % AVATAR_COLORS.length] },
                    ]}
                  >
                    <Text style={styles.participantAvatarInitial}>{item.name.charAt(0).toUpperCase()}</Text>
                  </View>
                );
                return isFriend ? (
                  <LinearGradient colors={["#FFFFFF", "#38BDF8"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.avatarFriendRing}>
                    <View style={styles.avatarFriendMask}>{content}</View>
                  </LinearGradient>
                ) : (
                  <View style={styles.participantAvatar}>{content}</View>
                );
              })()}
              {item.isHost && (
                <View style={styles.hostBadge}>
                  <CrownBadge size={26} />
                </View>
              )}
            </View>
            <View style={styles.participantInfo}>
              <Text style={styles.participantName}>{item.name}</Text>
              {item.handle && <Text style={styles.participantHandle}>@{item.handle}</Text>}
            </View>
            <View style={styles.participantStatusIcons}>
              {/* 3 durum - KIRMIZI: lider/moderator/kendisi izni kapatmis
                  (camMuted/muted). GRI: izni kapali degil ama fiilen acik
                  oldugu bilinmiyor (bkz. RoomParticipantDetail.micOn/camOn
                  yorumu - sunucu bugun bunu hic doldurmuyor, bu yuzden
                  pratikte hep gri). BEYAZ (+ konusuyorsa dalgalanma):
                  micOn/camOn true geldiginde - ParticipantsModal.tsx'teki
                  AYNI gorsel dil, sadece veri kaynagi farkli. */}
              {renderStatusIcon(
                VIDEO_ICON_SOURCE,
                VIDEO_ICON_FILLED_SOURCE,
                <Icon
                  name={item.camMuted ? "videoOff" : "video"}
                  size={24}
                  color={item.camMuted ? theme.danger : item.camOn ? "#FFFFFF" : theme.textMuted}
                />,
                item.camMuted,
                item.camOn,
                item.camSpeaking
              )}
              {renderStatusIcon(
                MIC_ICON_SOURCE,
                MIC_ICON_FILLED_SOURCE,
                <RoomMicIcon size={24} color={item.muted ? theme.danger : item.micOn ? "#FFFFFF" : theme.textMuted} />,
                item.muted,
                item.micOn,
                item.micSpeaking
              )}
            </View>
          </TouchableOpacity>
        )}
      />
      <StaticTabBar activeTab="Discover" onSelect={onNavigateTab} />
    </View>
  );
}

const styles = StyleSheet.create({
  // Artik App.tsx'teki paylasilan AppBackground (degrade) arkada duruyor.
  screen: { flex: 1, backgroundColor: "transparent" },
  participantList: { flex: 1 },
  emptyText: { color: theme.textMuted, fontSize: 13, textAlign: "center", marginTop: 40 },
  // paddingTop, lider rozetinin (hostBadge, top: -16) KIRPILMADAN tam
  // gorunmesi icin - oncesinde ustte hic bosluk olmadigindan tacin yarisi
  // listenin disina tasiyip kesiliyordu.
  listContent: { paddingTop: 20, paddingBottom: 24 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 12,
  },
  // Uyari ucgeni ve cop kutusu glifleri kendi 20x20 kutularinin icinde FARKLI
  // doluluk oranina sahip (ucgen ustte bosluk birakiyor, cop kutusu kulpuyla
  // birlikte kutunun daha alt kismini dolduruyor) - bu yuzden "alignItems:
  // center" ile kutular ortalansa bile gozle bakinca gorsel agirlik merkezleri
  // ayni cizgide durmuyor. Ikisini ayni optik hizaya getirmek icin kucuk bir
  // duzeltme.
  warningIconWrap: { marginTop: -2 },
  trashIconWrap: { marginTop: -6 },
  coverWrap: { marginHorizontal: 16, borderRadius: 16, overflow: "hidden" },
  cover: { width: "100%", aspectRatio: 16 / 10 },
  coverPlaceholder: { backgroundColor: theme.surfaceAlt },
  platformBadge: { position: "absolute", top: 12, right: 12 },
  adultBadge: { position: "absolute", top: 12, left: 12 },
  title: { color: theme.text, fontSize: 20, fontWeight: "700", marginHorizontal: 16, marginTop: 16 },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: 16,
    marginTop: 10,
    paddingBottom: 16,
  },
  statusLeft: { flexDirection: "row", alignItems: "center", gap: 6 },
  statusText: { color: theme.textMuted, fontSize: 13 },
  statusDot: { color: theme.textMuted, fontSize: 13 },
  participantRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  avatarWrap: { position: "relative" },
  // Arkadas OLMAYAN katilimcilarda artik HICBIR cerceve yok (bkz. asagidaki
  // avatarFriendRing - SADECE gercek arkadaslar o degrade halkayi tasir,
  // digerleri duz/cercevesiz). Eskiden sira-rengi (AVATAR_COLORS) bir
  // kenarlik vardi, kullanicinin istegi uzerine kaldirildi.
  participantAvatar: { width: 48, height: 48, borderRadius: 24, overflow: "hidden" },
  // Arkadas halkasi - RoomCardVariantD.tsx'teki avatarFriendRing/avatarFriendMask
  // ile AYNI oran (padding 2, ic borderRadius disarinkinden 2 kucuk) - disaridaki
  // degrade ile icerideki gercek avatar arasinda ince bir "halka" bosluk birakir.
  avatarFriendRing: { width: 48, height: 48, borderRadius: 24, padding: 2 },
  avatarFriendMask: { flex: 1, borderRadius: 22, overflow: "hidden" },
  participantAvatarInner: { width: "100%", height: "100%" },
  participantAvatarFallback: { alignItems: "center", justifyContent: "center" },
  // Lider rozeti - CrownBadge.tsx, profil fotografinin TAM USTUNE (negatif top ile) oturur.
  hostBadge: { position: "absolute", top: -18, left: 0, right: 0, alignItems: "center" },
  participantAvatarInitial: { color: "#FFFFFF", fontSize: 18, fontWeight: "700" },
  participantInfo: { flex: 1 },
  participantName: { color: theme.text, fontSize: 15, fontWeight: "600" },
  participantHandle: { color: theme.textMuted, fontSize: 13, marginTop: 1 },
  participantStatusIcons: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 2 },
  // Ikonla AYNI boyut - SpeakingPulse (dalgalanma) bunu tam dolduracak
  // sekilde cizilir (bkz. ParticipantsModal.tsx micIconStack ile AYNI fikir).
  statusIconStack: { width: 24, height: 24, alignItems: "center", justifyContent: "center" },
});
