import React, { useEffect, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Linking, useWindowDimensions } from "react-native";
import { useTranslation } from "react-i18next";
import { useFonts, BebasNeue_400Regular } from "@expo-google-fonts/bebas-neue";
import { LinearGradient } from "expo-linear-gradient";
import { Search, PhoneCall, BellOff, Bell, Ban, Image as ImageIcon, Paperclip, CircleArrowDown, X, MapPin, Mic, Play, Pause, ExternalLink, Download, MessageSquare } from "lucide-react-native";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { getSocket, DMMessage } from "../services/socket";
import { theme } from "../theme";
import Avatar from "../components/Avatar";
import AppBackground from "../components/AppBackground";
import ChatImageBubble from "../components/ChatImageBubble";
import { showAlert } from "../components/CustomAlert";
import { formatMessageTime } from "../utils/time";
import { formatDuration, formatFileSize, fileIconFor } from "../utils/format";
import { downloadOrShareFile } from "../utils/fileDownload";
import type { DMPeer } from "./DMScreen";

interface Props {
  peer: DMPeer;
  peerAvatarUrl: string | null;
  muted: boolean;
  mediaMessages: DMMessage[];
  // Ataç ikonunun actigi "Dosyalar" sekmesi - sesli mesaj/konum/genel
  // dosya mesajlari (bkz. DMScreen.tsx DmInfoOpenParams).
  fileMessages: DMMessage[];
  // Dosyalar sekmesindeki bir satirin "Sohbette Göster" ikonu - DMScreen'in
  // KENDI scrollToMessage'ini cagirir (bkz. DmInfoOpenParams), ardindan
  // onBack ile geri donulur.
  onShowInChat: (messageId: string) => void;
  onToggleMute: () => void;
  onBack: () => void;
  onBlocked: () => void;
  onOpenParticipant?: (peer: DMPeer) => void;
  onStartVoiceCall?: (peer: DMPeer) => void;
}

type Tab = "media" | "files";

// Galeri karelerinin arasindaki bosluk - ekran genisligine TAM 3 tane
// sigacak sekilde kare boyutu bundan hesaplaniyor (kenarlardan bosluksuz).
const MEDIA_GAP = 3;
// Ekranin en sagina ve en soluna da birer px bosluk birakiyor.
const MEDIA_EDGE_PAD = 3;

// "Dosyalar" sekmesindeki satirlarin turune gore ikon rengi - sohbet
// balonundaki (VoiceMessageBubble/LocationMessageBubble/FileMessageBubble,
// hepsi beyaz) ile KARISTIRILMASIN: burasi duz koyu bir liste, renk
// ayrimi olmadan tum satirlar birbirinin ayni gorunurdu.
const VOICE_COLOR = theme.accent;
const LOCATION_COLOR = "#F59E0B";
const FILE_COLOR = "#22C55E";

// Sag ustteki uc nokta menusundeki "Sohbette Göster" (PhotoViewerModal.tsx)
// ile AYNI ikon - ayni eylemin tutarli gorsel dili.
function ShowInChatButton({ onPress }: { onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} hitSlop={10}>
      <MessageSquare size={17} color={theme.textMuted} />
    </TouchableOpacity>
  );
}

function FileRowShell({
  color,
  icon,
  title,
  subtitle,
  trailing,
  onShowInChat,
  onPress,
}: {
  color: string;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  trailing?: React.ReactNode;
  onShowInChat: () => void;
  onPress?: () => void;
}) {
  return (
    <TouchableOpacity style={styles.fileRow} activeOpacity={onPress ? 0.6 : 1} onPress={onPress} disabled={!onPress}>
      <View style={[styles.fileRowIcon, { backgroundColor: `${color}26` }]}>{icon}</View>
      <View style={styles.fileRowBody}>
        <Text style={styles.fileRowTitle} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.fileRowSubtitle} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      <View style={styles.fileRowActions}>
        <ShowInChatButton onPress={onShowInChat} />
        {trailing}
      </View>
    </TouchableOpacity>
  );
}

function VoiceFileRow({
  message,
  language,
  onShowInChat,
}: {
  message: DMMessage;
  language: string;
  onShowInChat: () => void;
}) {
  const player = useAudioPlayer(message.mediaUrl!);
  const status = useAudioPlayerStatus(player);
  const duration = status.duration || (message.durationMs ? message.durationMs / 1000 : 0);

  function toggle() {
    if (status.playing) {
      player.pause();
    } else {
      if (status.currentTime >= duration && duration > 0) player.seekTo(0);
      player.play();
    }
  }

  return (
    <FileRowShell
      color={VOICE_COLOR}
      icon={status.playing ? <Pause size={18} color={VOICE_COLOR} /> : <Play size={18} color={VOICE_COLOR} />}
      title="Sesli Mesaj"
      subtitle={`${message.fromName} · ${formatDuration(duration)} · ${formatMessageTime(message.createdAt, language)}`}
      onShowInChat={onShowInChat}
      onPress={toggle}
    />
  );
}

function LocationFileRow({
  message,
  language,
  onShowInChat,
}: {
  message: DMMessage;
  language: string;
  onShowInChat: () => void;
}) {
  return (
    <FileRowShell
      color={LOCATION_COLOR}
      icon={<MapPin size={18} color={LOCATION_COLOR} />}
      title="Konum"
      subtitle={`${message.fromName} · ${formatMessageTime(message.createdAt, language)}`}
      trailing={<ExternalLink size={16} color={theme.textMuted} />}
      onShowInChat={onShowInChat}
      onPress={() => Linking.openURL(`https://maps.google.com/?q=${message.latitude},${message.longitude}`)}
    />
  );
}

function GenericFileRow({
  message,
  language,
  onShowInChat,
}: {
  message: DMMessage;
  language: string;
  onShowInChat: () => void;
}) {
  const [downloading, setDownloading] = useState(false);
  const fileName = message.fileName || message.text;
  const Icon = fileIconFor(message.mimeType, fileName);

  async function handlePress() {
    if (downloading) return;
    setDownloading(true);
    try {
      await downloadOrShareFile(message.mediaUrl!, message.mimeType);
    } catch (err: any) {
      showAlert("İndirilemedi", err?.message || "Dosya indirilirken bir hata oluştu, tekrar dene.");
    } finally {
      setDownloading(false);
    }
  }

  const sizeLabel = formatFileSize(message.fileSize);
  return (
    <FileRowShell
      color={FILE_COLOR}
      icon={<Icon size={18} color={FILE_COLOR} />}
      title={fileName}
      subtitle={`${message.fromName}${sizeLabel ? ` · ${sizeLabel}` : ""} · ${formatMessageTime(message.createdAt, language)}`}
      trailing={downloading ? <ActivityIndicator size="small" color={theme.textMuted} /> : <Download size={16} color={theme.textMuted} />}
      onShowInChat={onShowInChat}
      onPress={handlePress}
    />
  );
}

function FileTabRow({
  message,
  language,
  onShowInChat,
}: {
  message: DMMessage;
  language: string;
  onShowInChat: (messageId: string) => void;
}) {
  const showInChat = () => onShowInChat(message.id);
  if (message.kind === "voice" && message.mediaUrl) return <VoiceFileRow message={message} language={language} onShowInChat={showInChat} />;
  if (message.kind === "location" && message.latitude != null && message.longitude != null)
    return <LocationFileRow message={message} language={language} onShowInChat={showInChat} />;
  if (message.kind === "file" && message.mediaUrl) return <GenericFileRow message={message} language={language} onShowInChat={showInChat} />;
  return null;
}

/** DM'deki karsi tarafin profiline dokununca acilan "Uye Bilgisi" ekrani -
 * uygulamada grup sohbeti olmadigi icin (GroupSetupScreen gibi mirror
 * alinacak bir ekran yok) kendi tasarimi: buyuk avatar + kompakt isim,
 * 4 aksiyon karesi (Ara/Sessiz/Sesli Ara/Engelle), Medya sekmesi GERCEK DM
 * gorsellerini gosterir. */
export default function DmInfoScreen({ peer, peerAvatarUrl, muted, mediaMessages, fileMessages, onShowInChat, onToggleMute, onBack, onBlocked, onOpenParticipant, onStartVoiceCall }: Props) {
  const { t, i18n } = useTranslation();
  const socket = getSocket();
  const [tab, setTab] = useState<Tab>("media");
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isBlocked, setIsBlocked] = useState(false);

  useEffect(() => {
    socket.emit("friend:status", { withUserId: peer.userId }, (res: any) => {
      if (res?.ok) setIsBlocked(res.status === "blocked");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peer.userId]);
  const { width: screenWidth } = useWindowDimensions();
  const mediaCellSize = (screenWidth - MEDIA_GAP * 2 - MEDIA_EDGE_PAD * 2) / 3;
  // "Ara" butonu bu ekranda arama kutusunu acip medya/dosya icinde
  // (su an sadece medyanin yazi/aciklama kismi uzerinden) filtreler.
  const filteredMediaMessages = searchVisible && searchQuery.trim()
    ? mediaMessages.filter((m) => m.text.toLowerCase().includes(searchQuery.trim().toLowerCase()))
    : mediaMessages;
  const filteredFileMessages = searchVisible && searchQuery.trim()
    ? fileMessages.filter((m) => m.text.toLowerCase().includes(searchQuery.trim().toLowerCase()))
    : fileMessages;
  // Engellenenler/Gonderi olusturma ekranlarindaki BASLIKLA AYNI (Bebas Neue).
  const [titleFontLoaded] = useFonts({ BebasNeue_400Regular });

  function placeholder(label: string) {
    showAlert(label, t("profile.comingSoon"));
  }

  // "Dosyalar" satirindaki "Sohbette Göster" ikonu - DMScreen'in KENDI
  // scrollToMessage'ini tetikler (bkz. onShowInChat prop'u), ardindan
  // sohbete geri donulur.
  function handleShowInChat(messageId: string) {
    onShowInChat(messageId);
    onBack();
  }

  function confirmBlock() {
    showAlert(t("dm.blockConfirmTitle"), t("dm.blockConfirmBody", { name: peer.name }), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("profileOptions.block"),
        style: "destructive",
        onPress: () => {
          socket.emit("friend:block", { userId: peer.userId }, (res: any) => {
            if (res?.ok) {
              showAlert(t("discover.blockedTitle"), t("discover.blockedBody", { name: peer.name }));
              setIsBlocked(true);
              onBlocked();
            }
          });
        },
      },
    ]);
  }

  function confirmUnblock() {
    showAlert(t("friends.unblockConfirmTitle"), t("friends.unblockConfirmBody"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("profileOptions.unblock"),
        onPress: () => {
          socket.emit("friend:unblock", { userId: peer.userId }, (res: any) => {
            if (res?.ok) setIsBlocked(false);
          });
        },
      },
    ]);
  }

  const actions: { icon: React.ReactNode; label: string; onPress: () => void; danger?: boolean }[] = [
    { icon: <Search size={20} color={theme.text} />, label: t("dm.callAction"), onPress: () => setSearchVisible((v) => !v) },
    {
      icon: muted ? <Bell size={20} color={theme.text} /> : <BellOff size={20} color={theme.text} />,
      label: muted ? t("dm.menuUnmute") : t("dm.menuMute"),
      onPress: onToggleMute,
    },
    {
      icon: <PhoneCall size={20} color={theme.text} />,
      label: t("dm.voiceCallAction"),
      onPress: () => (onStartVoiceCall ? onStartVoiceCall(peer) : placeholder(t("dm.voiceCallAction"))),
    },
    {
      icon: <Ban size={20} color={isBlocked ? theme.text : theme.danger} />,
      label: isBlocked ? t("profileOptions.unblock") : t("profileOptions.block"),
      onPress: isBlocked ? confirmUnblock : confirmBlock,
      danger: !isBlocked,
    },
  ];

  return (
    <View style={styles.screen}>
      <AppBackground />
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} hitSlop={10} style={styles.backTouch}>
          <View style={{ transform: [{ rotate: "90deg" }] }}>
            <CircleArrowDown size={22} color="#FFFFFF" />
          </View>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, titleFontLoaded && styles.headerTitleFontLoaded]}>
          {t("dm.memberInfoTitle")}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <TouchableOpacity
          style={styles.profileBlock}
          activeOpacity={0.7}
          onPress={() => onOpenParticipant?.(peer)}
        >
          <Avatar name={peer.name} avatarUrl={peerAvatarUrl} size={88} />
          <Text style={styles.name}>{peer.name}</Text>
          {!!peer.handle && <Text style={styles.handle}>@{peer.handle}</Text>}
        </TouchableOpacity>

        <View style={styles.actionsRow}>
          {actions.map((a) => (
            <TouchableOpacity key={a.label} style={styles.actionSquare} onPress={a.onPress}>
              {a.icon}
              <Text style={[styles.actionLabel, a.danger && styles.actionLabelDanger]} numberOfLines={1}>
                {a.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.tabsRow}>
          <TouchableOpacity style={styles.tabIconButton} onPress={() => setTab("media")} hitSlop={6}>
            <ImageIcon size={27.5} color={tab === "media" ? "#FFFFFF" : theme.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.tabIconButton} onPress={() => setTab("files")} hitSlop={6}>
            <View style={{ marginTop: 2 }}>
              <Paperclip size={24} color={tab === "files" ? "#FFFFFF" : theme.textMuted} />
            </View>
          </TouchableOpacity>
        </View>
        <LinearGradient
          colors={[theme.accent, "#FFFFFF"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.tabsBottomBar}
        />

        {searchVisible && (
          <View style={styles.searchRow}>
            <Search size={15} color={theme.textMuted} />
            <TextInput
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder={t("dm.searchMediaPlaceholder")}
              placeholderTextColor={theme.textMuted}
              autoFocus
            />
            <TouchableOpacity
              onPress={() => {
                setSearchVisible(false);
                setSearchQuery("");
              }}
              hitSlop={8}
            >
              <X size={16} color={theme.textMuted} />
            </TouchableOpacity>
          </View>
        )}

        {tab === "media" ? (
          filteredMediaMessages.length === 0 ? (
            <Text style={styles.emptyText}>
              {searchVisible && searchQuery ? t("dm.noSearchResults") : t("dm.noMedia")}
            </Text>
          ) : (
            <View style={[styles.mediaGrid, { gap: MEDIA_GAP, paddingHorizontal: MEDIA_EDGE_PAD }]}>
              {filteredMediaMessages.map((m) => (
                <ChatImageBubble
                  key={m.id}
                  uri={m.mediaUrl!}
                  isAdult={m.isAdult}
                  size={mediaCellSize}
                  borderRadius={0}
                  senderName={m.fromName}
                  sentAt={m.createdAt}
                />
              ))}
            </View>
          )
        ) : filteredFileMessages.length === 0 ? (
          <Text style={styles.emptyText}>
            {searchVisible && searchQuery ? t("dm.noSearchResults") : t("dm.tabFilesEmpty")}
          </Text>
        ) : (
          <View style={styles.filesList}>
            {filteredFileMessages.map((m) => (
              <FileTabRow key={m.id} message={m} language={i18n.language} onShowInChat={handleShowInChat} />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "transparent" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingTop: 50,
    paddingBottom: 14,
  },
  backTouch: { width: 36, height: 36, alignItems: "flex-start", justifyContent: "center" },
  headerTitle: { flex: 1, textAlign: "center", color: theme.text, fontSize: 15, fontWeight: "700", letterSpacing: 0.5 },
  headerTitleFontLoaded: { fontFamily: "BebasNeue_400Regular", fontWeight: "400", fontSize: 22, letterSpacing: 1.4 },
  headerSpacer: { width: 36 },
  scrollContent: { paddingBottom: 40 },
  profileBlock: { alignItems: "center", paddingVertical: 20, gap: 6 },
  name: { color: theme.text, fontSize: 18, fontWeight: "700", marginTop: 10 },
  handle: { color: theme.textMuted, fontSize: 13 },
  actionsRow: { flexDirection: "row", gap: 10, paddingHorizontal: 18, marginBottom: 18 },
  actionSquare: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: 14,
    backgroundColor: "#15202B",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  actionLabel: { color: theme.text, fontSize: 10, fontWeight: "600" },
  actionLabelDanger: { color: theme.danger },
  tabsRow: { flexDirection: "row", marginHorizontal: 18 },
  tabIconButton: { flex: 1, alignItems: "center", paddingTop: 0, paddingBottom: 12 },
  tabsBottomBar: { height: 1 },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 18,
    marginTop: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "#15202B",
  },
  // Web onizlemesindeki varsayilan odak cercevesini (beyaz kare) kapatiyor -
  // gercek Android/iOS'ta zaten yok, sadece tarayici davranisi.
  searchInput: { flex: 1, color: theme.text, fontSize: 13, padding: 0, marginTop: 2, outlineWidth: 0, outlineStyle: "none" } as any,
  emptyText: { color: theme.textMuted, fontSize: 13, textAlign: "center", marginTop: 30 },
  mediaGrid: { flexDirection: "row", flexWrap: "wrap", marginTop: 3 },
  filesList: { marginTop: 5 },
  fileRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 18, paddingVertical: 12 },
  fileRowIcon: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  fileRowBody: { flex: 1, minWidth: 0 },
  fileRowTitle: { color: theme.text, fontSize: 14, fontWeight: "700" },
  fileRowSubtitle: { color: theme.textMuted, fontSize: 12, marginTop: 2 },
  fileRowActions: { flexDirection: "row", alignItems: "center", gap: 16 },
});
