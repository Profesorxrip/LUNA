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
import RoomSettingsSheet from "../components/RoomSettingsSheet";
import Avatar from "../components/Avatar";
import Icon from "../components/Icon";
import type { PrivacyLevel, PlaybackMode } from "../services/socket";
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
  const [leaveConfirmVisible, setLeaveConfirmVisible] = useState(false);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [volume, setVolume] = useState(1);

  const playerRef = useRef<MediaPlayerHandle>(null);
  const reactionsRef = useRef<ReactionsOverlayHandle>(null);
  const voice = useVoiceChat();

  const me = room.participants.find((p) => p.socketId === socket.id);
  const isHost = me?.isHost ?? false;
  // PLAYBACK ayari "Sadece Oynat"/"Otomatik Oynat" ise herkes oynat/duraklat/
  // sarabiliyor - video SECME yetkisi (openMediaPicker/selectSource'ta ayrica
  // kontrol edilir) "vote" haric hep host'ta kalir.
  const canControlTransport = isHost || room.playbackMode === "playOnly" || room.playbackMode === "autoplay";
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
  // "leader" modunda host bundan MUAF (kendi oynaticisi zaten otorite) -
  // ama playOnly/autoplay/vote modlarinda HERKES (host dahil) baskasinin
  // yaptigi oynat/duraklat/sec islemini uygulamak zorunda, aksi halde
  // host'un oynaticisi baskasinin durdurmasini hic gormez. Aktif bir oylama
  // varken (video bitmis, sirada ne olsun bekleniyor) eski videoyu tekrar
  // yuklemeye/oynatmaya calismiyoruz - biten videonun "isPlaying" durumu
  // dalgalanip host'un kendi oynaticisini sifirdan tekrar yukleyip onu
  // aninda tekrar "bitirmesine" (sonsuz playback:ended dongusune) yol acardi.
  const appliedSourceUrlRef = useRef<string | null>(null);
  useEffect(() => {
    const url = room.playback.source?.url ?? null;
    // Host "leader" modundayken kendi oynaticisi zaten otorite (selectSource
    // kendisi loadVideo cagiriyor) - burada sadece ref'i o url'e esitleyip
    // cikiyoruz, aksi halde daha sonra baska bir moda gecince (ornegin
    // "vote") ref hala eski/bos oldugu icin zaten oynayan videoyu gereksiz
    // yere yeniden yukleyip kendi play() cagrisiyla yarisa girip
    // durduruyordu (goo.gl/LdLk22 hatasi, video kalici olarak pause'da kalirdi).
    if ((isHost && room.playbackMode === "leader") || !syncable || room.poll) {
      appliedSourceUrlRef.current = url;
      return;
    }
    if (!url) return;
    if (appliedSourceUrlRef.current !== url) {
      // loadVideo() yeni kaynagi yukleyip KENDISI play() cagiriyor (asenkron
      // replaceAsync zinciri icinde) - hemen altindaki play()/pause() burada
      // AYRICA cagrilirsa, henuz tamamlanmamis replaceAsync ile yarisip
      // "play() interrupted by pause()" hatasiyla videoyu kalici pause'da
      // biraktigi icin, yeni yukleme durumunda o ikinci cagriyi atliyoruz -
      // sadece sunucu "durmus baslasin" derse (isPlaying false) devreye giriyoruz.
      appliedSourceUrlRef.current = url;
      playerRef.current?.loadVideo(url, room.playback.positionSeconds);
      if (!room.playback.isPlaying) playerRef.current?.pause();
      return;
    }
    if (room.playback.isPlaying && !room.buffering.anyoneBuffering) playerRef.current?.play();
    else playerRef.current?.pause();
  }, [room.playback.source?.url, room.playback.isPlaying, room.buffering.anyoneBuffering, room.playbackMode, isHost, room.poll, syncable]);

  const handleHostPlayerChange = useCallback(
    (playing: boolean, currentTime: number) => {
      if (!canControlTransport) return;
      socket.emit("playback:update", { isPlaying: playing, positionSeconds: currentTime });
    },
    [canControlTransport]
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
    if (room.playbackMode === "vote") {
      socket.emit("room:proposeSource", { source }, () => {});
      setPickerVisible(false);
      return;
    }
    socket.emit("playback:update", { source, isPlaying: source.type !== "external", positionSeconds: 0 });
    if (source.type !== "external") playerRef.current?.loadVideo(source.url, 0);
  }

  // Video dogal olarak bitince (sadece "vote" modunda, sadece host tetikler) -
  // sunucu 10 saniyelik bir oylama penceresi acar, bu da asagidaki poll
  // useEffect'inin herkeste secim ekranini otomatik acmasini tetikler.
  const handleEnded = useCallback(() => {
    if (!isHost || room.playbackMode !== "vote" || room.poll) return;
    socket.emit("playback:ended");
  }, [isHost, room.playbackMode, room.poll]);

  // Oylama yeni basladiginda (null -> dolu) HERKESTE secim ekranini otomatik
  // ac; oylama sonuclanip kapandiginda (dolu -> null) hala aciksa kapat.
  // Platform secme ekrani (Netflix/Disney+ logolari) DEGIL, dogrudan
  // Rave'deki gibi biten videonun "ilgili/alakali videolar" gorunumu acilsin
  // diye biten videonun YouTube id'sini de tasiyoruz.
  const [pollRelatedVideoId, setPollRelatedVideoId] = useState<string | null | undefined>(undefined);
  const hadPollRef = useRef(false);
  useEffect(() => {
    const hasPoll = Boolean(room.poll);
    if (hasPoll && !hadPollRef.current) {
      const endedSource = room.playback.source;
      setPollRelatedVideoId(endedSource?.type === "youtube" ? endedSource.url : null);
      setPickerVisible(true);
    } else if (!hasPoll && hadPollRef.current) {
      setPickerVisible(false);
      setPollRelatedVideoId(undefined);
    }
    hadPollRef.current = hasPoll;
  }, [room.poll]);

  function openMediaPicker() {
    if (!isHost && room.playbackMode !== "vote") {
      Alert.alert("Sadece lider secebilir", "Medyayi sadece oda lideri degistirebilir.");
      return;
    }
    setPickerVisible(true);
  }

  function shareRoom() {
    Share.share({ message: `LUNA'da "${room.title}" odama katil! Kod: ${room.code}` }).catch(() => {});
  }

  function changePrivacy(privacy: PrivacyLevel) {
    socket.emit("room:settings", { privacy }, () => {});
  }

  function changePlaybackMode(playbackMode: PlaybackMode) {
    socket.emit("room:settings", { playbackMode }, () => {});
  }

  function toggleAutoTranslate(autoTranslateChat: boolean) {
    socket.emit("room:settings", { autoTranslateChat }, () => {});
  }

  function handleVolumeChange(v: number) {
    setVolume(v);
    voice.setRemoteVolume(v);
  }

  function castVote(proposalId: string) {
    socket.emit("room:vote", { proposalId }, () => {});
  }

  // Oylama aktifken geri sayimi canli gostermek icin saniyede bir yeniden
  // render tetikler - baska bir amaci yok.
  const [, forceTick] = useState(0);
  useEffect(() => {
    if (!room.poll) return;
    const timer = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, [room.poll]);

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
        <TouchableOpacity style={styles.iconTouch} onPress={() => setLeaveConfirmVisible(true)} hitSlop={8}>
          <Icon name="close" size={30} color={theme.text} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.iconTouch} onPress={() => setSettingsVisible(true)} hitSlop={8}>
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
            onEnded={handleEnded}
          />
        </ReactionsOverlay>

        <LinearGradient colors={["transparent", theme.bg]} style={styles.bottomFade} pointerEvents="none" />
      </View>

      {room.buffering.anyoneBuffering && (
        <View style={styles.bufferingBanner}>
          <Text style={styles.bufferingText}>⏳ {room.buffering.names.join(", ")} icin bekleniyor (tamponlaniyor)...</Text>
        </View>
      )}

      {room.poll && (
        <View style={styles.pollBanner}>
          <View style={styles.pollHeaderRow}>
            <Text style={styles.pollTitle}>🗳️ Oylama - ne izleyelim?</Text>
            <Text style={styles.pollTimer}>{Math.max(0, Math.ceil((room.poll.deadlineMs - Date.now()) / 1000))}sn</Text>
          </View>
          {room.poll.proposals.map((p) => {
            const voteCount = Object.values(room.poll!.votes).filter((id) => id === p.id).length;
            const myVote = socket.id ? room.poll!.votes[socket.id] : undefined;
            const isMine = myVote === p.id;
            return (
              <TouchableOpacity key={p.id} style={[styles.pollOption, isMine && styles.pollOptionActive]} onPress={() => castVote(p.id)}>
                <Text style={styles.pollOptionText} numberOfLines={1}>
                  {p.source.label || p.source.type} · {p.proposedByName}
                </Text>
                <Text style={styles.pollOptionVotes}>{voteCount} oy</Text>
              </TouchableOpacity>
            );
          })}
          <TouchableOpacity onPress={openMediaPicker}>
            <Text style={styles.pollAddLink}>Secimini degistir</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Sohbet - medyanin hemen altinda, gradyanla ona "batmis" gibi baslar */}
      <FlatList
        style={styles.chatList}
        contentContainerStyle={styles.chatContent}
        data={messages}
        keyExtractor={(_, i) => String(i)}
        renderItem={({ item }) =>
          !item.system ? (
            item.fromSocketId === socket.id ? (
              <View style={[styles.messageRow, styles.messageRowOwn]}>
                <View style={[styles.bubble, styles.bubbleOwn]}>
                  <Text style={styles.chatMsgOwn}>{item.text}</Text>
                </View>
                <Avatar name={item.from || "?"} size={26} />
              </View>
            ) : (
              <View style={styles.messageRow}>
                <Avatar name={item.from || "?"} size={26} />
                <View style={styles.bubble}>
                  <Text style={styles.chatFrom}>{item.from}</Text>
                  <Text style={styles.chatMsg}>{item.text}</Text>
                </View>
              </View>
            )
          ) : item.kind === "joined" ? (
            <View style={styles.messageRow}>
              <Avatar name={item.targetName || "?"} size={26} />
              <View style={styles.bubble}>
                <Text style={styles.chatFrom}>{item.targetName}</Text>
                <Text style={styles.chatMsg}>odaya katıldı</Text>
              </View>
            </View>
          ) : item.kind === "nowPlaying" ? (
            <View style={styles.nowPlayingRow}>
              <Text style={styles.nowPlayingText} numberOfLines={1}>
                Şimdi <Text style={styles.nowPlayingTitle}>{item.title}</Text> oynatılıyor
              </Text>
              <TouchableOpacity onPress={() => sendReaction("❤️")} hitSlop={8}>
                <Text style={styles.nowPlayingHeart}>♡</Text>
              </TouchableOpacity>
            </View>
          ) : item.kind === "kicked" ? (
            <View style={styles.eventRow}>
              <Icon name="kicked" size={16} color={theme.textMuted} />
              <Text style={styles.eventText} numberOfLines={1}>
                <Text style={styles.eventBold}>{item.targetName}</Text>, <Text style={styles.eventBold}>{item.byName}</Text>{" "}
                tarafından atıldı
              </Text>
            </View>
          ) : item.kind === "settings" ? (
            <View style={styles.eventRow}>
              <Icon name="settings" size={14} color={theme.textMuted} />
              <Text style={styles.eventText} numberOfLines={1}>
                <Text style={styles.eventBold}>{item.byName}</Text> {item.settingLabel}: {item.settingValue}
              </Text>
            </View>
          ) : (
            <Text style={styles.systemMsg}>{item.text}</Text>
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
            size={28}
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
            <TouchableOpacity style={styles.iconTouchSm} onPress={showMap} hitSlop={4}>
              <Icon name="globe" size={30} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        )}
      </View>
      {voice.error && <Text style={styles.errorText}>{voice.error}</Text>}

      <MediaPickerSheet
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
        onSelect={selectSource}
        relatedVideosFor={pollRelatedVideoId}
      />
      <ParticipantsModal
        visible={participantsVisible}
        onClose={() => setParticipantsVisible(false)}
        participants={room.participants}
        mySocketId={socket.id}
        isHost={isHost}
        onKick={kick}
        onMakeLeader={makeLeader}
      />
      <RoomSettingsSheet
        visible={settingsVisible}
        onClose={() => setSettingsVisible(false)}
        isHost={isHost}
        privacy={room.privacy}
        playbackMode={room.playbackMode}
        autoTranslateChat={room.autoTranslateChat}
        onChangePrivacy={changePrivacy}
        onChangePlaybackMode={changePlaybackMode}
        onToggleAutoTranslate={toggleAutoTranslate}
        micConnected={voice.connected}
        micMuted={voice.muted}
        onMicPress={handleMicPress}
        onLeaveVoice={voice.leave}
        volume={volume}
        onVolumeChange={handleVolumeChange}
      />

      {leaveConfirmVisible && (
        <View style={styles.leaveOverlay}>
          <View style={styles.leaveCard}>
            <Text style={styles.leaveCardText}>Çıkıyor musun?</Text>
            <View style={styles.leaveCardButtons}>
              <TouchableOpacity style={styles.leaveCardButton} onPress={() => setLeaveConfirmVisible(false)}>
                <Icon name="close" size={20} color={theme.text} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.leaveCardButton} onPress={leave}>
                <Icon name="check" size={20} color={theme.text} />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
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
  logo: { width: 74, height: 34, marginTop: -4 },
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
  pollBanner: {
    marginHorizontal: 12,
    marginTop: 6,
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    gap: 6,
  },
  pollHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  pollTitle: { color: theme.text, fontSize: 13, fontWeight: "700" },
  pollTimer: { color: theme.accentBright, fontSize: 13, fontWeight: "700" },
  pollOption: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: theme.surfaceAlt,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "transparent",
  },
  pollOptionActive: { borderColor: theme.accent },
  pollOptionText: { color: theme.text, fontSize: 12, flex: 1, marginRight: 8 },
  pollOptionVotes: { color: theme.textMuted, fontSize: 12, fontWeight: "700" },
  pollAddLink: { color: theme.info, fontSize: 12, fontWeight: "600", textAlign: "center", marginTop: 2 },
  chatList: { flex: 1 },
  chatContent: { paddingHorizontal: 12, paddingTop: 4, paddingBottom: 8, gap: 6 },
  // Mesaj satiri varsayilan olarak FlatList'in tam genisligine "stretch"
  // edilirdi (bu da metnin flex:1 ile tum satiri kaplayip "bozuk" durmasina
  // yol aciyordu) - alignSelf ile sadece icerigi kadar yer kaplamasi
  // saglaniyor, boylece hem solda hem sagda duzgun bir "balon" gibi duruyor.
  // alignItems: "center" avatar'i balonun TAMAMINA gore dikey ortalar -
  // "flex-end" kullanilsaydi iki satirli (isim+metin) gelen mesajlarda
  // avatar alta yapisip kendi mesajlarimizdaki tek satirli balondan
  // farkli hizalanir, simetriyi bozardi.
  messageRow: { flexDirection: "row", alignItems: "center", gap: 8, alignSelf: "flex-start", maxWidth: "85%" },
  // Kendi mesajlarimiz (fromSocketId === bizim socket id'miz) saga hizalanir.
  // DOM sirasi [balon, avatar] oldugu icin normal "row" yonu avatar'i zaten
  // balonun SAGINA (disariya) yerlestirir - "row-reverse" avatar'i balonun
  // SOLUNA, ustune binecek sekilde koyuyordu, bu yuzden kaldirildi.
  messageRowOwn: { alignSelf: "flex-end" },
  bubble: { backgroundColor: theme.surfaceAlt, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8, flexShrink: 1 },
  bubbleOwn: { backgroundColor: "rgba(16,185,129,0.18)", borderWidth: 1, borderColor: "rgba(16,185,129,0.4)" },
  chatMsg: { color: theme.text, fontSize: 14 },
  chatMsgOwn: { color: theme.text, fontSize: 14 },
  chatFrom: { color: theme.textMuted, fontSize: 11, fontWeight: "700", marginBottom: 2 },
  systemMsg: { color: theme.textMuted, fontSize: 12, fontStyle: "italic", textAlign: "center" },
  nowPlayingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 4,
  },
  nowPlayingText: { color: theme.textMuted, fontSize: 12, fontWeight: "600", flexShrink: 1 },
  nowPlayingTitle: { color: theme.text, fontWeight: "700" },
  nowPlayingHeart: { color: theme.danger, fontSize: 16 },
  eventRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 4 },
  eventText: { color: theme.textMuted, fontSize: 12, flexShrink: 1 },
  eventBold: { color: theme.text, fontWeight: "700" },
  bottomBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderTopWidth: 1,
    borderTopColor: theme.border,
  },
  micButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    marginVertical: -8, // alt bar'in yuksekligini artirmasin diye disariya tasiriyoruz
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 0,
    transform: [{ translateX: -4 }, { translateY: -4 }], // hafif sola/yukari - yuvarlak sekil bozulmadan (kliplenmeden) kaydiriliyor
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
  leaveOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  leaveCard: {
    backgroundColor: "#141416",
    borderRadius: 18,
    paddingVertical: 22,
    paddingHorizontal: 26,
    alignItems: "center",
    gap: 16,
  },
  leaveCardText: { color: theme.text, fontSize: 18, fontWeight: "700" },
  leaveCardButtons: { flexDirection: "row", gap: 14 },
  leaveCardButton: {
    width: 56,
    height: 56,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
});
