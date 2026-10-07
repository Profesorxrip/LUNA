import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Modal,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";
import { getSocket, DMMessage, DMReply } from "../services/socket";
import { supabase } from "../services/supabase";
import Icon from "../components/Icon";
import { showAlert } from "../components/CustomAlert";
import LoadingView from "../components/LoadingView";
import SendMediaSheet from "../components/SendMediaSheet";
import ChatImageBubble from "../components/ChatImageBubble";

const EXPIRY_OPTIONS: { label: string; ms: number | null }[] = [
  { label: "Kapalı", ms: null },
  { label: "1 Saat", ms: 60 * 60 * 1000 },
  { label: "1 Gün", ms: 24 * 60 * 60 * 1000 },
  { label: "1 Hafta", ms: 7 * 24 * 60 * 60 * 1000 },
];

export interface DMPeer {
  userId: string;
  name: string;
  handle?: string;
}

interface Props {
  peer: DMPeer;
  onBack: () => void;
}

const ACCENT = "#0EA5E9";
const BG = "#000000";
const TEXT = "#F5F0E6";
const MUTED = "#9A8F80";

/** Rave'in gercek DM (ozelden mesaj) ekraninin yapisinin bir kopyasi -
 * baslik/avatar/uc nokta menusu, sol/sag balonlar, alinti (reply) onizlemesi,
 * "gorundu" cift tik'i ve alt aksiyon cubugu (etiket/medya/sesli mesaj) -
 * LUNA'nin siyah/yesil temasiyla. */
export default function DMScreen({ peer, onBack }: Props) {
  const socket = getSocket();
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [messages, setMessages] = useState<DMMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState("");
  const [replyingTo, setReplyingTo] = useState<DMReply | null>(null);
  const [seenUpTo, setSeenUpTo] = useState(0);
  const [menuVisible, setMenuVisible] = useState(false);
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [mediaVisible, setMediaVisible] = useState(false);
  const [expiryVisible, setExpiryVisible] = useState(false);
  const [expiresAfterMs, setExpiresAfterMs] = useState<number | null>(null);
  const [muted, setMuted] = useState(false);
  const [reportVisible, setReportVisible] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [nowTick, setNowTick] = useState(Date.now());
  const [pendingImageUri, setPendingImageUri] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  // Ayarlar ekranindaki "Hizli Tepki" tercihi - bir mesaja CIFT TIKLAYINCA
  // gonderilecek emoji budur (bkz. ProfileScreen.tsx default_reaction_emoji).
  const [quickReactionEmoji, setQuickReactionEmoji] = useState("❤️");
  const lastTapRef = useRef<Record<string, number>>({});
  const listRef = useRef<FlatList<DMMessage>>(null);
  const muteStorageKey = `dm_muted_${peer.userId}`;

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getUser().then(({ data }) => {
      if (cancelled || !data.user) return;
      setMyUserId(data.user.id);
      supabase
        .from("profiles")
        .select("default_reaction_emoji")
        .eq("id", data.user.id)
        .maybeSingle()
        .then(({ data: profile }) => {
          if (!cancelled && profile?.default_reaction_emoji) setQuickReactionEmoji(profile.default_reaction_emoji);
        });
      socket.emit("dm:open", { withUserId: peer.userId }, (res: any) => {
        if (res?.ok) {
          setMessages(res.messages);
          setExpiresAfterMs(res.expiresAfterMs ?? null);
        }
        setLoading(false);
      });
    });
    AsyncStorage.getItem(muteStorageKey).then((v) => {
      if (!cancelled) setMuted(v === "1");
    });
    return () => {
      cancelled = true;
    };
  }, [peer.userId]);

  useEffect(() => {
    function handleMessage({ fromUserId, message }: { fromUserId: string; message: DMMessage }) {
      if (fromUserId !== peer.userId) return;
      setMessages((prev) => [...prev, message]);
    }
    function handleSeen({ byUserId, at }: { byUserId: string; at: number }) {
      if (byUserId !== peer.userId) return;
      setSeenUpTo(at);
    }
    function handleExpiry({ byUserId, ms }: { byUserId: string; ms: number | null }) {
      if (byUserId !== peer.userId) return;
      setExpiresAfterMs(ms);
    }
    function handleReaction({
      fromUserId,
      messageId,
      emoji,
    }: {
      fromUserId: string;
      messageId: string;
      emoji: string | null;
    }) {
      if (fromUserId !== peer.userId) return;
      setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, peerReaction: emoji } : m)));
    }
    socket.on("dm:message", handleMessage);
    socket.on("dm:seen", handleSeen);
    socket.on("dm:expiry", handleExpiry);
    socket.on("dm:reaction", handleReaction);
    return () => {
      socket.off("dm:message", handleMessage);
      socket.off("dm:seen", handleSeen);
      socket.off("dm:expiry", handleExpiry);
      socket.off("dm:reaction", handleReaction);
    };
  }, [peer.userId]);

  useEffect(() => {
    if (messages.length) listRef.current?.scrollToEnd({ animated: true });
  }, [messages.length]);

  // Suresi dolan mesajlar ("Sure sonu" ayari) ekranda da zamanla kaybolsun
  // diye periyodik olarak "simdi"yi tazeliyoruz - filtreleme render sirasinda yapiliyor.
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 5000);
    return () => clearInterval(id);
  }, []);

  function placeholder(label: string) {
    showAlert(label, "Bu ozellik yakinda eklenecek.");
  }

  function sendMessage() {
    if (!input.trim() || !myUserId) return;
    const text = input.trim();
    const replyTo = replyingTo;
    socket.emit("dm:send", { toUserId: peer.userId, text, replyTo }, (res: any) => {
      if (res?.ok) setMessages((prev) => [...prev, res.message]);
    });
    setInput("");
    setReplyingTo(null);
  }

  async function pickImage() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      showAlert("İzin gerekli", "Fotoğraf seçmek için galeri iznine ihtiyacımız var.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.7 });
    if (result.canceled || !result.assets?.[0]) return;
    setPendingImageUri(result.assets[0].uri);
  }

  // "chat-media" bucket'ina (avatars/gallery ile ayni desen, bkz.
  // 0015_chat_media.sql) kendi klasorune yukler, ardindan "dm:sendImage" ile
  // karsi tarafa iletir.
  async function sendPickedImage(isAdult: boolean) {
    if (!pendingImageUri || !myUserId) return;
    setUploadingImage(true);
    try {
      const arrayBuffer = await fetch(pendingImageUri).then((res) => res.arrayBuffer());
      const ext = pendingImageUri.split(".").pop()?.toLowerCase().split("?")[0] || "jpg";
      const contentType = ext === "png" ? "image/png" : "image/jpeg";
      const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const path = `${myUserId}/${fileName}`;
      const { error: uploadError } = await supabase.storage.from("chat-media").upload(path, arrayBuffer, { contentType });
      if (uploadError) throw uploadError;
      const { data: publicUrlData } = supabase.storage.from("chat-media").getPublicUrl(path);
      socket.emit(
        "dm:sendImage",
        { toUserId: peer.userId, mediaUrl: publicUrlData.publicUrl, isAdult },
        (res: any) => {
          if (res?.ok) setMessages((prev) => [...prev, res.message]);
          else showAlert("Gönderilemedi", res?.error || "Fotoğraf gönderilemedi, tekrar dene.");
        }
      );
      setPendingImageUri(null);
    } catch (err: any) {
      showAlert("Gönderilemedi", err?.message || "Fotoğraf gönderilirken bir hata oluştu, tekrar dene.");
    } finally {
      setUploadingImage(false);
    }
  }

  function insertMention() {
    setInput((prev) => (prev.endsWith("@") || prev.length === 0 ? prev + "@" : prev + " @"));
  }

  function startReply(message: DMMessage) {
    setReplyingTo({ text: message.text, fromName: message.fromUserId === myUserId ? "Sen" : message.fromName });
  }

  // Bir mesaja CIFT TIKLAYINCA Ayarlar'da secilen hizli tepki emojisini
  // gonderir/geri alir (ayni emojiye ikinci cift-tik tepkiyi kaldirir).
  function handleMessageTap(message: DMMessage) {
    const now = Date.now();
    const last = lastTapRef.current[message.id] || 0;
    lastTapRef.current[message.id] = now;
    if (now - last > 300) return;
    const next = message.myReaction === quickReactionEmoji ? null : quickReactionEmoji;
    setMessages((prev) => prev.map((m) => (m.id === message.id ? { ...m, myReaction: next } : m)));
    socket.emit("dm:react", { withUserId: peer.userId, messageId: message.id, emoji: next });
  }

  function chooseExpiry(ms: number | null) {
    socket.emit("dm:setExpiry", { withUserId: peer.userId, ms }, (res: any) => {
      if (res?.ok) setExpiresAfterMs(ms);
    });
    setExpiryVisible(false);
  }

  async function toggleMute() {
    const next = !muted;
    setMuted(next);
    if (next) await AsyncStorage.setItem(muteStorageKey, "1");
    else await AsyncStorage.removeItem(muteStorageKey);
  }

  function submitReport() {
    const reason = reportReason.trim();
    if (!reason) return;
    socket.emit("report:submit", { targetUserId: peer.userId, reason }, (res: any) => {
      if (res?.ok) showAlert("Rapor gonderildi", "Bildirimin icin tesekkurler, inceleyecegiz.");
      else showAlert("Hata", "Rapor gonderilemedi, tekrar dene.");
    });
    setReportReason("");
    setReportVisible(false);
  }

  const notExpired = messages.filter((m) => !m.expiresAt || m.expiresAt > nowTick);
  const visibleMessages =
    searchVisible && searchQuery.trim()
      ? notExpired.filter((m) => m.text.toLowerCase().includes(searchQuery.trim().toLowerCase()))
      : notExpired;
  const mediaMessages = notExpired.filter((m) => !!m.mediaUrl);
  const expiryLabel = EXPIRY_OPTIONS.find((o) => o.ms === expiresAfterMs)?.label ?? "Kapalı";

  const menuItems: { label: string; onPress: () => void }[] = [
    { label: "Ara", onPress: () => setSearchVisible(true) },
    { label: "Medya", onPress: () => setMediaVisible(true) },
    { label: "Süre sonu", onPress: () => setExpiryVisible(true) },
    { label: muted ? "Sesi Aç" : "Sessize Al", onPress: toggleMute },
    { label: "Şikayet Et", onPress: () => setReportVisible(true) },
  ];

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} hitSlop={10}>
          <Icon name="chevronLeft" size={22} color={TEXT} />
        </TouchableOpacity>
        <View style={styles.headerAvatar}>
          <Text style={styles.headerAvatarInitial}>{peer.name.charAt(0).toUpperCase()}</Text>
        </View>
        <View style={styles.headerTextBlock}>
          <View style={styles.headerNameRow}>
            <Text style={styles.headerName}>{peer.name}</Text>
            {muted && <Icon name="bellOff" size={13} color={MUTED} />}
          </View>
          {!!peer.handle && <Text style={styles.headerHandle}>@{peer.handle}</Text>}
        </View>
        <TouchableOpacity onPress={() => setMenuVisible(true)} hitSlop={10}>
          <Icon name="moreHoriz" size={22} color={TEXT} />
        </TouchableOpacity>
      </View>

      {searchVisible && (
        <View style={styles.searchBar}>
          <Icon name="search" size={16} color={MUTED} />
          <TextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="SOHBETTE ARA..."
            placeholderTextColor={MUTED}
            autoFocus
          />
          <TouchableOpacity
            onPress={() => {
              setSearchVisible(false);
              setSearchQuery("");
            }}
            hitSlop={8}
          >
            <Icon name="close" size={14} color={MUTED} />
          </TouchableOpacity>
        </View>
      )}

      {expiresAfterMs !== null && (
        <TouchableOpacity style={styles.expiryBanner} onPress={() => setExpiryVisible(true)}>
          <Icon name="clock" size={13} color={ACCENT} />
          <Text style={styles.expiryBannerText}>Mesajlar {expiryLabel.toLowerCase()} sonra siliniyor</Text>
        </TouchableOpacity>
      )}

      <FlatList
        ref={listRef}
        data={visibleMessages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          loading ? <LoadingView /> : <Text style={styles.mediaEmpty}>Henüz mesaj yok, ilk mesajı sen gönder!</Text>
        }
        renderItem={({ item }) => {
          const isMine = item.fromUserId === myUserId;
          const seen = isMine && item.createdAt <= seenUpTo;
          return (
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => handleMessageTap(item)}
              onLongPress={() => startReply(item)}
              style={[styles.messageRow, isMine ? styles.messageRowMine : styles.messageRowTheirs]}
            >
              {!isMine && (
                <View style={styles.avatarSmall}>
                  <Text style={styles.avatarSmallInitial}>{item.fromName.charAt(0).toUpperCase()}</Text>
                </View>
              )}
              <View style={styles.bubbleWrap}>
                {item.replyTo && (
                  <View style={styles.replyQuote}>
                    <Text style={styles.replyQuoteFrom}>{item.replyTo.fromName}</Text>
                    <Text style={styles.replyQuoteText} numberOfLines={1}>
                      {item.replyTo.text}
                    </Text>
                  </View>
                )}
                {item.mediaUrl ? (
                  <ChatImageBubble uri={item.mediaUrl} isAdult={item.isAdult} />
                ) : (
                  <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleTheirs]}>
                    <Text style={styles.bubbleText}>{item.text}</Text>
                  </View>
                )}
                {(item.myReaction || item.peerReaction) && (
                  <View style={styles.reactionBadgeRow}>
                    {item.peerReaction && <Text style={styles.reactionBadgeEmoji}>{item.peerReaction}</Text>}
                    {item.myReaction && <Text style={styles.reactionBadgeEmoji}>{item.myReaction}</Text>}
                  </View>
                )}
                <View style={[styles.metaRow, isMine ? styles.metaRowMine : styles.metaRowTheirs]}>
                  <Text style={styles.metaTime}>
                    {new Date(item.createdAt).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}
                  </Text>
                  {isMine && <Text style={[styles.metaTick, seen && styles.metaTickSeen]}>{seen ? "✓✓" : "✓"}</Text>}
                </View>
              </View>
            </TouchableOpacity>
          );
        }}
      />

      {replyingTo && (
        <View style={styles.replyBar}>
          <View style={styles.replyBarText}>
            <Text style={styles.replyBarFrom}>{replyingTo.fromName}</Text>
            <Text style={styles.replyBarBody} numberOfLines={1}>
              {replyingTo.text}
            </Text>
          </View>
          <TouchableOpacity onPress={() => setReplyingTo(null)} hitSlop={8}>
            <Icon name="close" size={16} color={MUTED} />
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.inputBar}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="Mesaj..."
          placeholderTextColor={MUTED}
          onSubmitEditing={sendMessage}
        />
        {input.trim() ? (
          <TouchableOpacity onPress={sendMessage} hitSlop={8}>
            <Icon name="send" size={24} color={ACCENT} />
          </TouchableOpacity>
        ) : (
          <View style={styles.inputActions}>
            <TouchableOpacity onPress={insertMention} hitSlop={6}>
              <Icon name="mention" size={22} color={TEXT} />
            </TouchableOpacity>
            <TouchableOpacity onPress={pickImage} hitSlop={6}>
              <Icon name="image" size={22} color={TEXT} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => placeholder("Sesli Mesaj")} hitSlop={6}>
              <Icon name="mic" size={22} color={TEXT} />
            </TouchableOpacity>
          </View>
        )}
      </View>

      <Modal visible={menuVisible} transparent animationType="fade" onRequestClose={() => setMenuVisible(false)}>
        <TouchableOpacity style={styles.menuOverlay} activeOpacity={1} onPress={() => setMenuVisible(false)}>
          <View style={styles.menuCard}>
            {menuItems.map((item) => (
              <TouchableOpacity
                key={item.label}
                style={styles.menuRow}
                onPress={() => {
                  setMenuVisible(false);
                  item.onPress();
                }}
              >
                <Text style={styles.menuRowText}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal visible={mediaVisible} transparent animationType="slide" onRequestClose={() => setMediaVisible(false)}>
        <TouchableOpacity style={styles.sheetOverlay} activeOpacity={1} onPress={() => setMediaVisible(false)}>
          <TouchableOpacity activeOpacity={1} style={styles.mediaSheet}>
            <Text style={styles.sheetTitle}>Medya</Text>
            {mediaMessages.length === 0 ? (
              <Text style={styles.mediaEmpty}>Bu sohbette henüz medya paylaşılmadı.</Text>
            ) : (
              <View style={styles.mediaGrid}>
                {mediaMessages.map((m) => (
                  <ChatImageBubble key={m.id} uri={m.mediaUrl!} isAdult={m.isAdult} size={96} />
                ))}
              </View>
            )}
            <TouchableOpacity style={styles.sheetCloseBtn} onPress={() => setMediaVisible(false)}>
              <Text style={styles.sheetCloseBtnText}>Kapat</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <Modal visible={expiryVisible} transparent animationType="slide" onRequestClose={() => setExpiryVisible(false)}>
        <TouchableOpacity style={styles.sheetOverlay} activeOpacity={1} onPress={() => setExpiryVisible(false)}>
          <View style={styles.sheetCard}>
            <Text style={styles.sheetTitle}>Süre sonu</Text>
            <Text style={styles.sheetSubtitle}>Seçilen sürenin ardından bu sohbetteki mesajlar otomatik silinir.</Text>
            {EXPIRY_OPTIONS.map((opt) => (
              <TouchableOpacity key={opt.label} style={styles.sheetRow} onPress={() => chooseExpiry(opt.ms)}>
                <Text style={styles.sheetRowText}>{opt.label}</Text>
                {expiresAfterMs === opt.ms && <Text style={styles.sheetRowCheck}>✓</Text>}
              </TouchableOpacity>
            ))}
            <View style={styles.sheetHandle} />
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal visible={reportVisible} transparent animationType="slide" onRequestClose={() => setReportVisible(false)}>
        <TouchableOpacity style={styles.sheetOverlay} activeOpacity={1} onPress={() => setReportVisible(false)}>
          <TouchableOpacity activeOpacity={1} style={styles.sheetCard}>
            <Text style={styles.sheetTitle}>{peer.name} kullanicisini sikayet et</Text>
            <Text style={styles.sheetSubtitle}>Neden sikayet ettigini kisaca yaz.</Text>
            <TextInput
              style={styles.reportInput}
              value={reportReason}
              onChangeText={setReportReason}
              placeholder="Sikayet nedeni..."
              placeholderTextColor={MUTED}
              multiline
              autoFocus
            />
            <TouchableOpacity
              style={[styles.reportSubmitBtn, !reportReason.trim() && styles.reportSubmitBtnDisabled]}
              onPress={submitReport}
              disabled={!reportReason.trim()}
            >
              <Text style={styles.reportSubmitBtnText}>Gonder</Text>
            </TouchableOpacity>
            <View style={styles.sheetHandle} />
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <SendMediaSheet
        visible={!!pendingImageUri}
        imageUri={pendingImageUri}
        uploading={uploadingImage}
        onCancel={() => setPendingImageUri(null)}
        onSend={sendPickedImage}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 18,
    paddingTop: 50,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderColor: "#1E1A17",
  },
  headerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#3A2F22",
    alignItems: "center",
    justifyContent: "center",
  },
  headerAvatarInitial: { color: ACCENT, fontSize: 16, fontWeight: "700" },
  headerTextBlock: { flex: 1 },
  headerName: { color: TEXT, fontSize: 16, fontWeight: "700" },
  headerHandle: { color: MUTED, fontSize: 11, marginTop: 1 },
  listContent: { padding: 16, gap: 10 },
  messageRow: { flexDirection: "row", alignItems: "flex-end", gap: 8, maxWidth: "100%" },
  messageRowMine: { justifyContent: "flex-end" },
  messageRowTheirs: { justifyContent: "flex-start" },
  avatarSmall: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#3A2F22",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarSmallInitial: { color: ACCENT, fontSize: 11, fontWeight: "700" },
  bubbleWrap: { maxWidth: "75%" },
  replyQuote: {
    backgroundColor: "rgba(14,165,233,0.1)",
    borderLeftWidth: 2,
    borderLeftColor: ACCENT,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginBottom: 3,
  },
  replyQuoteFrom: { color: ACCENT, fontSize: 10, fontWeight: "700" },
  replyQuoteText: { color: MUTED, fontSize: 11, marginTop: 1 },
  bubble: { borderRadius: 14, paddingHorizontal: 12, paddingVertical: 9 },
  bubbleMine: { backgroundColor: "#1F3D24" },
  bubbleTheirs: { backgroundColor: "#17130F" },
  bubbleText: { color: TEXT, fontSize: 14, lineHeight: 19 },
  reactionBadgeRow: {
    position: "absolute",
    bottom: -10,
    right: -6,
    flexDirection: "row",
    backgroundColor: "#000000",
    borderRadius: 10,
    paddingHorizontal: 5,
    paddingVertical: 2,
    gap: 2,
  },
  reactionBadgeEmoji: { fontSize: 13 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 3 },
  metaRowMine: { justifyContent: "flex-end" },
  metaRowTheirs: { justifyContent: "flex-start" },
  metaTime: { color: MUTED, fontSize: 10 },
  metaTick: { color: MUTED, fontSize: 11 },
  metaTickSeen: { color: ACCENT },
  replyBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: "#0E0C0A",
    borderTopWidth: 1,
    borderColor: "#1E1A17",
  },
  replyBarText: { flex: 1 },
  replyBarFrom: { color: ACCENT, fontSize: 11, fontWeight: "700" },
  replyBarBody: { color: MUTED, fontSize: 12, marginTop: 1 },
  inputBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderColor: "#1E1A17",
  },
  // Web onizlemesindeki varsayilan odak cercevesini (beyaz kare) kapatiyor -
  // gercek Android/iOS'ta zaten yok, sadece tarayici davranisi.
  input: {
    flex: 1,
    color: TEXT,
    fontSize: 14,
    backgroundColor: "#141210",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    outlineWidth: 0,
    outlineStyle: "none",
  } as any,
  inputActions: { flexDirection: "row", gap: 14 },
  menuOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)" },
  menuCard: {
    position: "absolute",
    top: 92,
    right: 16,
    backgroundColor: "#141210",
    borderRadius: 12,
    paddingVertical: 6,
    minWidth: 150,
  },
  menuRow: { paddingHorizontal: 16, paddingVertical: 12 },
  menuRowText: { color: TEXT, fontSize: 14, fontWeight: "600" },
  headerNameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "#0E0C0A",
    borderBottomWidth: 1,
    borderColor: "#1E1A17",
  },
  searchInput: { flex: 1, color: TEXT, fontSize: 13, outlineWidth: 0, outlineStyle: "none" } as any,
  expiryBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    backgroundColor: "rgba(14,165,233,0.08)",
  },
  expiryBannerText: { color: ACCENT, fontSize: 11, fontWeight: "600" },
  sheetOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheetCard: {
    backgroundColor: "#141210",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingTop: 18,
    paddingBottom: 30,
    paddingHorizontal: 20,
    alignItems: "center",
  },
  sheetTitle: { color: TEXT, fontSize: 16, fontWeight: "700", marginBottom: 4, alignSelf: "flex-start" },
  sheetSubtitle: { color: MUTED, fontSize: 12, marginBottom: 14, alignSelf: "flex-start" },
  sheetRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    borderTopWidth: 1,
    borderColor: "#2A2422",
  },
  sheetRowText: { color: TEXT, fontSize: 15, fontWeight: "600" },
  sheetRowCheck: { color: ACCENT, fontSize: 16, fontWeight: "700" },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "#3A332C", marginTop: 14 },
  mediaSheet: {
    backgroundColor: "#141210",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingTop: 18,
    paddingBottom: 30,
    paddingHorizontal: 20,
    minHeight: 200,
  },
  mediaEmpty: { color: MUTED, fontSize: 13, marginTop: 30, textAlign: "center" },
  mediaGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  sheetCloseBtn: { marginTop: 20, alignItems: "center", paddingVertical: 12 },
  sheetCloseBtnText: { color: MUTED, fontSize: 14, fontWeight: "600" },
  reportInput: {
    width: "100%",
    minHeight: 80,
    backgroundColor: "#0E0C0A",
    borderRadius: 10,
    color: TEXT,
    fontSize: 14,
    padding: 12,
    textAlignVertical: "top",
    outlineWidth: 0,
    outlineStyle: "none",
  } as any,
  reportSubmitBtn: {
    width: "100%",
    backgroundColor: ACCENT,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: "center",
    marginTop: 14,
  },
  reportSubmitBtnDisabled: { opacity: 0.4 },
  reportSubmitBtnText: { color: "#04140D", fontSize: 14, fontWeight: "700" },
});
