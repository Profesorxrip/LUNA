import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Share,
  Image,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { getSocket, RoomState, ChatMessage } from "../services/socket";
import type { MediaSource } from "../services/socket";
import MediaPlayer, { MediaPlayerHandle } from "../components/MediaPlayer";
import MediaPickerSheet from "../components/MediaPickerSheet";
import ReactionsOverlay, { ReactionsOverlayHandle } from "../components/ReactionsOverlay";
import ParticipantsModal from "../components/ParticipantsModal";
import Avatar from "../components/Avatar";
import Icon from "../components/Icon";
import { useVoiceChat } from "../hooks/useVoiceChat";
import { theme } from "../theme";

interface Props {
  initialRoom: RoomState;
  onLeave: () => void;
}

const DRIFT_TOLERANCE_SECONDS = 2;
const GUEST_RESYNC_INTERVAL_MS = 8000;
const HOST_HEARTBEAT_INTERVAL_MS = 5000;

export default function RoomScreen({ initialRoom, onLeave }: Props) {
  const socket = getSocket();
  const [room, setRoom] = useState<RoomState>(initialRoom);
  const roomRef = useRef(room);
  roomRef.current = room;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatFocused, setChatFocused] = useState(false);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [participantsVisible, setParticipantsVisible] = useState(false);

  const playerRef = useRef<MediaPlayerHandle>(null);
  const reactionsRef = useRef<ReactionsOverlayHandle>(null);
  const voice = useVoiceChat();

  const me = room.participants.find((p) => p.socketId === socket.id);
  const isHost = me?.isHost ?? false;
  const syncable =
    room.playback.source?.type === "youtube" || room.playback.source?.type === "hls" || room.playback.source?.type === "mp4";

  useEffect(() => {
    function handleRoomState(state: RoomState) {
      setRoom(state);
    }
    function handleChat(msg: ChatMessage) {
      setMessages((prev) => [...prev.slice(-199), msg]);
    }
    function handleKicked() {
      Alert.alert("Odadan atildin", "Oda lideri seni odadan cikardi.");
      onLeave();
    }
    socket.on("room:state", handleRoomState);
    socket.on("room:chat", handleChat);
    socket.on("room:kicked", handleKicked);
    return () => {
      socket.off("room:state", handleRoomState);
      socket.off("room:chat", handleChat);
      socket.off("room:kicked", handleKicked);
    };
  }, []);

  // Misafirler icin surukleme (drift) duzeltmesi.
  useEffect(() => {
    if (isHost || !syncable) return;
    const timer = setInterval(async () => {
      const current = roomRef.current;
      if (!current.playback.source || !current.playback.isPlaying || current.buffering.anyoneBuffering) return;
      const elapsed = (Date.now() - current.playback.updatedAtMs) / 1000;
      const expected = current.playback.positionSeconds + elapsed;
      const actual = await playerRef.current?.getCurrentTime();
      if (actual !== undefined && Math.abs(actual - expected) > DRIFT_TOLERANCE_SECONDS) {
        playerRef.current?.seekTo(expected);
      }
    }, GUEST_RESYNC_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [isHost, syncable]);

  // Host icin kalp atisi.
  useEffect(() => {
    if (!isHost || !syncable) return;
    const timer = setInterval(async () => {
      const current = roomRef.current;
      if (!current.playback.source || !current.playback.isPlaying) return;
      const actual = await playerRef.current?.getCurrentTime();
      if (actual !== undefined) {
        socket.emit("playback:update", { positionSeconds: actual, isPlaying: true });
      }
    }, HOST_HEARTBEAT_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [isHost, syncable]);

  // Misafirlerde: sunucudan gelen yeni durumu yerel oynaticiya uygular.
  useEffect(() => {
    if (isHost || !syncable) return;
    const { source, isPlaying, positionSeconds } = room.playback;
    if (!source) return;
    playerRef.current?.loadVideo(source.url, positionSeconds);
    if (isPlaying && !room.buffering.anyoneBuffering) playerRef.current?.play();
    else playerRef.current?.pause();
  }, [room.playback.source?.url, room.playback.isPlaying, room.buffering.anyoneBuffering]);

  const handleHostPlayerChange = useCallback(
    (playing: boolean, currentTime: number) => {
      if (!isHost) return;
      socket.emit("playback:update", { isPlaying: playing, positionSeconds: currentTime });
    },
    [isHost]
  );

  const handleBuffering = useCallback((isBuffering: boolean) => {
    socket.emit("playback:buffering", { isBuffering });
  }, []);

  const lastDurationRef = useRef<number | null>(null);
  const handleDuration = useCallback(
    (seconds: number) => {
      if (!isHost || Math.round(seconds) === lastDurationRef.current) return;
      lastDurationRef.current = Math.round(seconds);
      socket.emit("playback:update", { durationSeconds: seconds });
    },
    [isHost]
  );

  function selectSource(source: MediaSource) {
    socket.emit("playback:update", { source, isPlaying: source.type !== "external", positionSeconds: 0 });
    if (source.type !== "external") playerRef.current?.loadVideo(source.url, 0);
  }

  function openMediaPicker() {
    if (!isHost) {
      Alert.alert("Sadece lider secebilir", "Medyayi sadece oda lideri degistirebilir.");
      return;
    }
    setPickerVisible(true);
  }

  function shareRoom() {
    Share.share({ message: `LUNA'da "${room.title}" odama katil! Kod: ${room.code}` }).catch(() => {});
  }

  function showRoomInfo() {
    Alert.alert(room.title, `Oda kodu: ${room.code}\n${room.isPublic ? "Herkese acik" : "Sadece kodla katilinir"}`);
  }

  function insertMention() {
    setChatInput((prev) => (prev.endsWith("@") || prev.length === 0 ? prev + "@" : prev + " @"));
  }

  function pickImage() {
    Alert.alert("Yakinda", "Sohbete fotograf ekleme ozelligi yakinda geliyor.");
  }

  function showMap() {
    // Gercek harita/konum ozelligi (react-native-maps) Expo Go'da calismiyor -
    // LiveKit'te oldugu gibi ozel bir "development build" gerektiriyor.
    // O adima gecince burasi gercek katilimci konumlarini gosterecek.
    Alert.alert(
      "Harita yakinda",
      "Katilimcilarin konumunu gosteren harita ozelligi icin ozel bir kurulum gerekiyor - yakinda ekleyecegiz."
    );
  }

  function sendChat() {
    if (!chatInput.trim()) return;
    socket.emit("chat:send", { text: chatInput });
    setChatInput("");
  }

  function sendReaction(emoji: string) {
    reactionsRef.current?.sendReaction(emoji);
  }

  function kick(targetSocketId: string) {
    socket.emit("host:kick", { targetSocketId }, () => {});
  }

  function makeLeader(targetSocketId: string) {
    socket.emit("host:transfer", { targetSocketId }, () => {});
  }

  function leave() {
    socket.emit("room:leave");
    voice.leave();
    onLeave();
  }

  function handleMicPress() {
    if (!voice.connected) voice.join();
    else voice.toggleMute();
  }

  function handleMicLongPress() {
    if (!voice.connected) return;
    Alert.alert("Sesli sohbetten cik", "Sesli sohbetten ayrilmak istedigine emin misin?", [
      { text: "Vazgec", style: "cancel" },
      { text: "Cik", style: "destructive", onPress: voice.leave },
    ]);
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      {/* Ust bar (Rave'deki X / ayarlar / logo / ara / katilimci duzeni) - medya
          alaninin uzerine binmez, kendi satirinda durur, video tam altinda baslar */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.iconTouch} onPress={leave} hitSlop={8}>
          <Icon name="close" size={30} color={theme.text} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.iconTouch} onPress={showRoomInfo} hitSlop={8}>
          <Icon name="settings" size={30} color={theme.text} />
        </TouchableOpacity>
        <Image source={require("../../assets/lavin-icon-mark.png")} style={styles.logo} resizeMode="contain" />
        <TouchableOpacity style={[styles.iconTouch, !isHost && styles.topIconDim]} onPress={openMediaPicker} hitSlop={8}>
          <Icon name="search" size={30} color={theme.text} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.participantsBadge} onPress={() => setParticipantsVisible(true)} hitSlop={8}>
          <Icon name="people" size={30} color={theme.text} />
          <View style={styles.countBubble}>
            <Text style={styles.countText}>{room.participants.length}</Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* Medya alani - ust barin hemen altinda, ustune binmeden */}
      <View style={styles.mediaSection}>
        <ReactionsOverlay ref={reactionsRef}>
          <MediaPlayer
            ref={playerRef}
            source={room.playback.source}
            onStateChange={handleHostPlayerChange}
            onBuffering={handleBuffering}
            onDuration={handleDuration}
          />
        </ReactionsOverlay>

        <LinearGradient colors={["transparent", theme.bg]} style={styles.bottomFade} pointerEvents="none" />
      </View>

      {room.buffering.anyoneBuffering && (
        <View style={styles.bufferingBanner}>
          <Text style={styles.bufferingText}>⏳ {room.buffering.names.join(", ")} icin bekleniyor (tamponlaniyor)...</Text>
        </View>
      )}

      {/* Sohbet - medyanin hemen altinda, gradyanla ona "batmis" gibi baslar */}
      <FlatList
        style={styles.chatList}
        contentContainerStyle={styles.chatContent}
        data={messages}
        keyExtractor={(_, i) => String(i)}
        renderItem={({ item }) =>
          item.system ? (
            item.text.startsWith("Simdi ") ? (
              <View style={styles.nowPlayingRow}>
                <Text style={styles.nowPlayingText} numberOfLines={1}>
                  {item.text}
                </Text>
                <TouchableOpacity onPress={() => sendReaction("❤️")} hitSlop={8}>
                  <Text style={styles.nowPlayingHeart}>♡</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <Text style={styles.systemMsg}>{item.text}</Text>
            )
          ) : (
            <View style={styles.messageRow}>
              <Avatar name={item.from || "?"} size={26} />
              <Text style={styles.chatMsg}>
                <Text style={styles.chatFrom}>{item.from}: </Text>
                {item.text}
              </Text>
            </View>
          )
        }
      />

      {/* Alt bar - mikrofon / mesaj kutusu / etiket / galeri / davet / paylas / gonder (Rave'deki alt bar duzeni) */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={[styles.micButton, voice.connected && voice.muted && styles.micButtonMuted]}
          onPress={handleMicPress}
          onLongPress={handleMicLongPress}
        >
          <Icon
            name={voice.connected && voice.muted ? "micOff" : "mic"}
            size={36}
            color={voice.connected && !voice.muted ? theme.accent : "#04140D"}
          />
        </TouchableOpacity>
        <TextInput
          style={styles.chatInput}
          placeholder="Mesaj yaz..."
          placeholderTextColor={theme.textMuted}
          value={chatInput}
          onChangeText={setChatInput}
          onSubmitEditing={sendChat}
          onFocus={() => setChatFocused(true)}
          onBlur={() => setChatFocused(false)}
        />
        {chatFocused ? (
          // Yaziyorken: Rave'deki gibi sadece gonder oku gorunur.
          <TouchableOpacity style={styles.iconTouchSm} onPress={sendChat} hitSlop={4}>
            <Icon name="send" size={30} color={theme.accentBright} />
          </TouchableOpacity>
        ) : (
          // Yazmiyorken: paylas/etiket/galeri/davet/harita ikonlari gorunur.
          <View style={styles.actionGroup}>
            <TouchableOpacity style={styles.iconTouchSm} onPress={shareRoom} hitSlop={4}>
              <Icon name="share" size={30} color="#FFFFFF" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconTouchSm} onPress={insertMention} hitSlop={4}>
              <Icon name="mention" size={30} color="#FFFFFF" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconTouchSm} onPress={pickImage} hitSlop={4}>
              <Icon name="image" size={30} color="#FFFFFF" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconTouchSm} onPress={shareRoom} hitSlop={4}>
              <Icon name="invite" size={30} color="#FFFFFF" />
            </TouchableOpacity>
            <TouchableOpacity style={[styles.iconTouchSm, { width: 36 }]} onPress={showMap} hitSlop={4}>
              <Icon name="globe" size={36} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        )}
      </View>
      {voice.error && <Text style={styles.errorText}>{voice.error}</Text>}

      <MediaPickerSheet visible={pickerVisible} onClose={() => setPickerVisible(false)} onSelect={selectSource} />
      <ParticipantsModal
        visible={participantsVisible}
        onClose={() => setParticipantsVisible(false)}
        participants={room.participants}
        mySocketId={socket.id}
        isHost={isHost}
        onKick={kick}
        onMakeLeader={makeLeader}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  mediaSection: { position: "relative" },
  bottomFade: { position: "absolute", left: 0, right: 0, bottom: 0, height: 48 },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingTop: 50,
    paddingBottom: 10,
    backgroundColor: theme.bg,
  },
  iconTouch: { width: 38, height: 38, justifyContent: "center", alignItems: "center" },
  actionGroup: { flexDirection: "row", alignItems: "center" },
  iconTouchSm: { width: 30, height: 38, justifyContent: "center", alignItems: "center", flexShrink: 0 },
  topIconDim: { opacity: 0.35 },
  logo: { width: 62, height: 28 },
  participantsBadge: { position: "relative", width: 38, height: 38, justifyContent: "center", alignItems: "center" },
  countBubble: {
    position: "absolute",
    top: 1,
    right: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 7,
    minWidth: 14,
    height: 14,
    paddingHorizontal: 3,
    justifyContent: "center",
    alignItems: "center",
  },
  countText: { color: "#04140D", fontSize: 9, fontWeight: "700" },
  bufferingBanner: {
    marginHorizontal: 12,
    marginTop: 6,
    backgroundColor: "rgba(16,185,129,0.12)",
    borderColor: theme.accent,
    borderWidth: 1,
    borderRadius: 10,
    padding: 8,
  },
  bufferingText: { color: theme.accentBright, fontSize: 12 },
  chatList: { flex: 1 },
  chatContent: { paddingHorizontal: 12, paddingTop: 4, paddingBottom: 8, gap: 6 },
  messageRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  chatMsg: { color: theme.text, fontSize: 14, flex: 1, flexShrink: 1 },
  chatFrom: { fontWeight: "700" },
  systemMsg: { color: theme.textMuted, fontSize: 12, fontStyle: "italic", textAlign: "center" },
  nowPlayingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 4,
  },
  nowPlayingText: { color: theme.textMuted, fontSize: 12, fontWeight: "600", flexShrink: 1 },
  nowPlayingHeart: { color: theme.danger, fontSize: 16 },
  bottomBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: theme.border,
  },
  micButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    marginVertical: -12, // alt bar'in yuksekligini artirmasin diye disariya tasiriyoruz
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 0,
    transform: [{ translateX: -6 }, { translateY: -6 }], // hafif sola/yukari - yuvarlak sekil bozulmadan (kliplenmeden) kaydiriliyor
  },
  micButtonMuted: { backgroundColor: theme.danger },
  chatInput: {
    // Gorunur bir "kutu" degil - mikrofon ve saglardaki ikonlar disindaki
    // tum bos alan bu TextInput, dokununca yine de yazi yazilabiliyor.
    flex: 1,
    minWidth: 0,
    alignSelf: "stretch",
    color: theme.text,
    paddingHorizontal: 10,
    // Web onizlemesindeki varsayilan odak cercevesini (beyaz kare) kapatiyor -
    // gercek Android/iOS'ta zaten yok, sadece tarayici davranisi.
    outlineWidth: 0,
    outlineStyle: "none",
  } as any,
  errorText: { color: theme.danger, fontSize: 12, textAlign: "center", paddingBottom: 6 },
});
