import React, { useEffect, useRef, useState } from "react";
import { Modal, View, Text, TouchableOpacity, ActivityIndicator, StyleSheet, Animated } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { CircleArrowDown, MoreVertical, MessageSquare, TriangleAlert, Play, Pause } from "lucide-react-native";
import { useVideoPlayer, VideoView } from "expo-video";
import Icon from "./Icon";
import SimpleSlider from "./SimpleSlider";
import { formatMessageTime } from "../utils/time";
import { formatDuration } from "../utils/format";
import { downloadOrShareFile } from "../utils/fileDownload";
import { showAlert } from "./CustomAlert";
import { getSocket } from "../services/socket";
import FriendsScreen from "../screens/FriendsScreen";
import { theme } from "../theme";

interface Props {
  uri: string | null;
  onClose: () => void;
  // PhotoViewerModal.tsx'teki AYNI prop'lar/aciklamalar - bkz. orada.
  senderName?: string;
  sentAt?: number;
  onReply?: () => void;
  onShowInChat?: () => void;
  onReport?: () => void;
}

/** DM'de paylasilan bir videoya dokununca acilan TAM EKRAN oynatici -
 * PhotoViewerModal ile AYNI ust bar (geri/yanitla/ilet/menu). Alt kontrol
 * cubugu da (kullanicinin istegi) ust barla AYNI cerceve/renk olsun diye
 * expo-video'nun native UI'i KAPATILIP (nativeControls=false) kendi
 * play/duraklat/sar/ses kontrollerimiz (HlsPlayer.tsx'teki AYNI
 * "playingChange"/"timeUpdate" dinleyici deseni) kullanildi.
 */
export default function VideoViewerModal({ uri, onClose, senderName, sentAt, onReply, onShowInChat, onReport }: Props) {
  const insets = useSafeAreaInsets();
  const { i18n } = useTranslation();
  const [downloading, setDownloading] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [forwardVisible, setForwardVisible] = useState(false);
  const [barHeight, setBarHeight] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [muted, setMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const seekingRef = useRef(false);
  // Bos alana (videonun uzerine, surukleme olmayan duz bir dokunus) dokununca
  // ust/alt barlarin gizlenip tekrar dokununca geri gelmesi icin
  // (kullanicinin istegi, PhotoViewerModal ile AYNI davranis).
  const [barsVisible, setBarsVisible] = useState(true);
  const barsOpacity = useRef(new Animated.Value(1)).current;
  const player = useVideoPlayer(uri || "", (p) => {
    p.muted = false;
    p.timeUpdateEventInterval = 0.5;
  });

  function toggleBars() {
    const next = !barsVisible;
    setBarsVisible(next);
    Animated.timing(barsOpacity, { toValue: next ? 1 : 0, duration: 160, useNativeDriver: true }).start();
  }

  useEffect(() => {
    if (uri) player.play();
    else player.pause();
  }, [uri]);

  // Alt kontrol cubugu artik expo-video'nun KENDI native UI'i degil,
  // ust barla AYNI cerceve/renk olsun diye (kullanicinin istegi) kendi
  // play/duraklat/sar/ses kontrollerimiz - bkz. HlsPlayer.tsx'teki AYNI
  // "playingChange"/"timeUpdate" dinleyici deseni.
  useEffect(() => {
    const playingSub = player.addListener("playingChange", (e) => setPlaying(e.isPlaying));
    const timeSub = player.addListener("timeUpdate", () => {
      if (!seekingRef.current) setCurrentTime(player.currentTime);
      if (player.duration > 0) setDuration(player.duration);
    });
    const statusSub = player.addListener("statusChange", (e) => {
      if (e.status === "readyToPlay" && player.duration > 0) setDuration(player.duration);
    });
    return () => {
      playingSub.remove();
      timeSub.remove();
      statusSub.remove();
    };
  }, [player]);

  async function handleDownload() {
    if (!uri || downloading) return;
    setDownloading(true);
    try {
      await downloadOrShareFile(uri, "video/mp4");
    } catch (err: any) {
      showAlert("İndirilemedi", err?.message || "Video indirilirken bir hata oluştu, tekrar dene.");
    } finally {
      setDownloading(false);
    }
  }

  // PhotoViewerModal.tsx'teki forwardToUsers ile AYNI desen - sadece
  // "dm:sendImage" yerine "dm:sendVideo" (video zaten chat-media bucket'inda
  // genel bir URL, yeniden yuklemeye gerek yok).
  function forwardToUsers(userIds: string[]) {
    if (!uri || userIds.length === 0) return;
    let remaining = userIds.length;
    let failed = 0;
    userIds.forEach((toUserId) => {
      getSocket().emit("dm:sendVideo", { toUserId, mediaUrl: uri }, (res: any) => {
        if (!res?.ok) failed++;
        remaining--;
        if (remaining === 0) {
          setForwardVisible(false);
          showAlert(
            failed === 0 ? "İletildi" : "Kısmen iletildi",
            failed === 0
              ? `Video ${userIds.length} kişiye iletildi.`
              : `Video ${userIds.length - failed}/${userIds.length} kişiye iletildi.`
          );
        }
      });
    });
  }

  return (
    <Modal visible={!!uri} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.screen}>
        <Animated.View
          style={[styles.topBar, { paddingTop: insets.top + 44, opacity: barsOpacity }]}
          pointerEvents={barsVisible ? "auto" : "none"}
          onLayout={(e) => setBarHeight(e.nativeEvent.layout.height)}
        >
          <View style={styles.topBarLeft}>
            <TouchableOpacity style={styles.iconBtn} onPress={onClose} hitSlop={10}>
              <View style={{ transform: [{ rotate: "90deg" }] }}>
                <CircleArrowDown size={22} color="#FFFFFF" />
              </View>
            </TouchableOpacity>
            {!!senderName && (
              <View style={styles.senderInfo}>
                <Text style={styles.senderName} numberOfLines={1}>
                  {senderName}
                </Text>
                {sentAt != null && <Text style={styles.sentTime}>{formatMessageTime(sentAt, i18n.language)}</Text>}
              </View>
            )}
          </View>
          <View style={styles.topBarRight}>
            {!!onReply && (
              <TouchableOpacity
                style={styles.iconBtn}
                onPress={() => {
                  onReply();
                  onClose();
                }}
                hitSlop={10}
              >
                <View style={{ transform: [{ scaleX: -1 }] }}>
                  <Icon name="undoArrow" size={20} color="#FFFFFF" />
                </View>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.iconBtn} onPress={() => setForwardVisible(true)} hitSlop={10}>
              <Icon name="undoArrow" size={20} color="#FFFFFF" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconBtn} onPress={() => setMenuVisible(true)} hitSlop={10}>
              <MoreVertical size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </Animated.View>

        <TouchableOpacity style={styles.videoWrap} activeOpacity={1} onPress={toggleBars}>
          {!!uri && <VideoView style={styles.video} player={player} nativeControls={false} contentFit="contain" pointerEvents="none" />}
        </TouchableOpacity>

        <Animated.View
          style={[styles.bottomBar, { paddingBottom: insets.bottom + 16, opacity: barsOpacity }]}
          pointerEvents={barsVisible ? "auto" : "none"}
        >
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => (playing ? player.pause() : player.play())}
            hitSlop={10}
          >
            {playing ? <Pause size={20} color="#FFFFFF" /> : <Play size={20} color="#FFFFFF" fill="#FFFFFF" />}
          </TouchableOpacity>
          <Text style={styles.bottomTime}>{formatDuration(currentTime)}</Text>
          <View style={styles.bottomSliderWrap}>
            <SimpleSlider
              value={duration > 0 ? currentTime / duration : 0}
              onValueChange={(v) => {
                seekingRef.current = true;
                const t = v * duration;
                setCurrentTime(t);
                player.currentTime = t;
                seekingRef.current = false;
              }}
            />
          </View>
          <Text style={styles.bottomTime}>{formatDuration(duration)}</Text>
          <TouchableOpacity style={styles.iconBtn} onPress={() => setMuted((m) => { player.muted = !m; return !m; })} hitSlop={10}>
            {muted ? <Icon name="sesKapali1" size={18} color="#FFFFFF" /> : <Icon name="sesAcik1" size={18} color="#FFFFFF" />}
          </TouchableOpacity>
        </Animated.View>

        <Modal visible={menuVisible} transparent animationType="fade" onRequestClose={() => setMenuVisible(false)}>
          <TouchableOpacity style={styles.menuOverlay} activeOpacity={1} onPress={() => setMenuVisible(false)}>
            <View style={[styles.menuCard, { top: barHeight }]}>
              <TouchableOpacity
                style={styles.menuRow}
                disabled={downloading}
                onPress={() => {
                  setMenuVisible(false);
                  handleDownload();
                }}
              >
                {downloading ? <ActivityIndicator color="#FFFFFF" size="small" /> : <CircleArrowDown size={16} color="#FFFFFF" />}
                <Text style={styles.menuRowText}>İndir</Text>
              </TouchableOpacity>
              {!!onShowInChat && (
                <TouchableOpacity
                  style={styles.menuRow}
                  onPress={() => {
                    setMenuVisible(false);
                    onShowInChat();
                    onClose();
                  }}
                >
                  <MessageSquare size={16} color="#FFFFFF" />
                  <Text style={styles.menuRowText}>Sohbette Göster</Text>
                </TouchableOpacity>
              )}
              {!!onReport && (
                <TouchableOpacity
                  style={styles.menuRow}
                  onPress={() => {
                    setMenuVisible(false);
                    onReport();
                    onClose();
                  }}
                >
                  <TriangleAlert size={16} color={theme.danger} />
                  <Text style={[styles.menuRowText, { color: theme.danger }]}>Bildir</Text>
                </TouchableOpacity>
              )}
            </View>
          </TouchableOpacity>
        </Modal>

        <Modal visible={forwardVisible} animationType="slide" onRequestClose={() => setForwardVisible(false)} statusBarTranslucent>
          <FriendsScreen
            onBack={() => setForwardVisible(false)}
            onOpenDM={() => {}}
            onOpenParticipant={() => {}}
            inviteMode
            hideInviteExtras
            headerTitle="İlet"
            confirmButtonLabel={(count) => `İlet (${count})`}
            onSendInvites={forwardToUsers}
          />
        </Modal>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#000000" },
  videoWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  video: { width: "100%", height: "100%" },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 16,
    backgroundColor: "#121212",
  },
  topBarLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1, marginRight: 10 },
  topBarRight: { flexDirection: "row", alignItems: "center", gap: 4 },
  // Ust barla AYNI cerceve/renk (kullanicinin istegi) - sadece ustten degil
  // ALTTAN gelen bir cerceve, expo-video'nun KENDI native UI'i yerine kendi
  // play/duraklat/sar/ses kontrollerimizi tasiyor.
  bottomBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: "#121212",
  },
  bottomTime: { color: "#FFFFFF", fontSize: 12, fontVariant: ["tabular-nums"] },
  bottomSliderWrap: { flex: 1 },
  iconBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  senderInfo: { flex: 1 },
  senderName: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
  sentTime: { color: "rgba(255,255,255,0.6)", fontSize: 12, marginTop: 1 },
  menuOverlay: { flex: 1 },
  menuCard: {
    position: "absolute",
    right: 14,
    backgroundColor: "#1E1E1E",
    borderRadius: 12,
    paddingVertical: 6,
    minWidth: 150,
  },
  menuRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingVertical: 12 },
  menuRowText: { color: "#FFFFFF", fontSize: 14, fontWeight: "600" },
});
