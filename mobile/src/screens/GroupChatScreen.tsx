import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Keyboard,
  Animated,
  PanResponder,
  Platform,
  ActivityIndicator,
  Modal,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Path } from "react-native-svg";
import { useTranslation } from "react-i18next";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import * as Clipboard from "expo-clipboard";
import { useAudioRecorder, useAudioRecorderState, RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync } from "expo-audio";
import { CameraView, useCameraPermissions } from "expo-camera";
import {
  CircleArrowDown,
  Phone,
  Send,
  Laugh,
  Paperclip,
  Image as ImageIcon,
  Trash2,
  ChevronUp,
  Pause,
  Play,
  MapPin,
  FileText as FileTextIcon,
  BarChart2,
  Music,
  User as UserIcon,
  Copy,
  Pin,
  PinOff,
  Camera as CameraIcon,
} from "lucide-react-native";
import { SimpleLineIcons, MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import { LockClosedIcon, MicrophoneIcon } from "react-native-heroicons/outline";
import Icon from "../components/Icon";
import { VoiceOnceRingIcon, VoiceOnceFilledIcon } from "../components/CustomIcons";
import AppBackground from "../components/AppBackground";
import Avatar, { colorForName } from "../components/Avatar";
import LoadingView from "../components/LoadingView";
import { showAlert } from "../components/CustomAlert";
import SendMediaSheet from "../components/SendMediaSheet";
import SendVideoSheet from "../components/SendVideoSheet";
import ChatImageBubble from "../components/ChatImageBubble";
import PhotoViewerModal from "../components/PhotoViewerModal";
import VideoViewerModal from "../components/VideoViewerModal";
import VideoMessageBubble from "../components/VideoMessageBubble";
import VoiceMessageBubble from "../components/VoiceMessageBubble";
import LocationMessageBubble from "../components/LocationMessageBubble";
import FileMessageBubble from "../components/FileMessageBubble";
import ContactMessageBubble from "../components/ContactMessageBubble";
import PollMessageBubble from "../components/PollMessageBubble";
import MusicMessageBubble from "../components/MusicMessageBubble";
import StickerMessageBubble from "../components/StickerMessageBubble";
import GifMessageBubble from "../components/GifMessageBubble";
import ReplyPreviewContent from "../components/ReplyPreviewContent";
import LocationPickerModal, { type PickedLocation } from "../components/LocationPickerModal";
import FilePreviewModal from "../components/FilePreviewModal";
import PollComposerModal from "../components/PollComposerModal";
import CameraFilmstrip, { type FilmstripPickedAsset } from "../components/CameraFilmstrip";
import EmojiKeyboardPanel, { PANEL_HEIGHT as EMOJI_PANEL_BASE_HEIGHT } from "../components/EmojiKeyboardPanel";
import { getCustomStickers, addCustomSticker, CustomSticker } from "../utils/customStickers";
import { getCustomGifs, addCustomGif, CustomGif } from "../utils/customGifs";
import { getRecentFiles, addRecentFile, type PickedFileAsset, type RecentFileEntry } from "../utils/recentFiles";
import { getRecentMusic, addRecentMusic } from "../utils/recentMusic";
import FriendsScreen from "./FriendsScreen";
import { getSocket, GroupMessage, GroupReply, GroupPinnedMessage, GroupDetail, GroupMember } from "../services/socket";
import { formatMessageTime } from "../utils/time";
import { uriToArrayBuffer } from "../utils/uriToArrayBuffer";
import { uploadWithProgress } from "../utils/uploadWithProgress";
import { supabase } from "../services/supabase";

const BUBBLE_MINE_COLOR = "#2E799E";
const TEXT = "#F5F0E6";
const MUTED = "#9A8F80";
const WAVE_BAR_COUNT = 40;
const LOCK_DRAG_THRESHOLD = 70;
const CANCEL_DRAG_THRESHOLD = 90;

function formatRecordingTime(ms: number): string {
  const totalSec = Math.floor(Math.max(0, ms) / 1000);
  const mm = Math.floor(totalSec / 60);
  const ss = totalSec % 60;
  return `${mm}:${ss.toString().padStart(2, "0")}`;
}

// DMScreen.tsx'teki BubbleTail ile BIREBIR AYNI - WhatsApp'taki gibi balonun
// kosesinden fiskiran, yumusak egrili kuyruk. Bir gondericiden gelen ilk
// (grubun BASI, groupedWithPrev=false) balonda gorunur.
function BubbleTail({ color, mine }: { color: string; mine: boolean }) {
  const d = mine
    ? "M0,0 L5.2,0 Q7,0 6.093,1.556 L0.605,10.963 Q0,12 0,10.8 L0,0 Z"
    : "M7,0 L1.8,0 Q0,0 0.907,1.556 L6.395,10.963 Q7,12 7,10.8 L7,0 Z";
  return (
    <Svg width={7} height={12} viewBox="0 0 7 12" style={[styles.bubbleTailSvg, mine ? styles.bubbleTailSvgMine : styles.bubbleTailSvgTheirs]}>
      <Path d={d} fill={color} />
    </Svg>
  );
}

export interface GroupPeer {
  id: string;
  name: string;
  avatarUrl: string | null;
}

interface Props {
  group: GroupPeer;
  onBack: () => void;
  onOpenInfo?: (detail: GroupDetail) => void;
}

interface BubbleRowProps {
  item: GroupMessage;
  isMine: boolean;
  groupedWithPrev: boolean;
  sender?: GroupMember;
  reactions: { emoji: string; count: number; mine: boolean }[];
  onTap: () => void;
  onLongPress: () => void;
  onReply: () => void;
  onConsumeMediaOnce: (messageId: string) => void;
  onVotePoll: (messageId: string, optionIndex: number) => void;
  // Tek-gorunumluk medya goruntuyecisinin uc nokta menusundeki "Bildir" icin
  // (bkz. kullanicinin istegi: "İndir çıkmamalı, Sohbette Göster ve Bildir
  // çıkmalı") - DMScreen.tsx'teki AYNI "report:submit" akisini (kullanici
  // bazli rapor) tetikler.
  onReportUser: (userId: string, name: string) => void;
  // Ayni menudeki "Sohbette Göster" icin - mesaji listede ortalayip gosterir.
  onShowInChat: (messageId: string) => void;
}

/** DMScreen.tsx'teki DMBubbleRow ile AYNI mantik VE AYNI mesaj
 * turleri/aksiyonlari - SADECE "seen" (gorundu tik'i, DM'e ozgu iki-kisilik
 * bir kavram) ve balonun disina tasan BubbleTail/kaydirarak-yanitlama
 * (swipe) GORSEL incelikleri BILINCLI olarak disarida birakildi (bunlar
 * salt estetik, "ozellik calisiyor mu" sorusuyla ilgisiz) - yanitlama hala
 * basili tutma menusundeki "Yanıtla" ile TAM calisir. */
function GroupBubbleRow({ item, isMine, groupedWithPrev, sender, reactions, onTap, onLongPress, onReply, onConsumeMediaOnce, onVotePoll, onReportUser, onShowInChat }: BubbleRowProps) {
  const { t, i18n } = useTranslation();
  const [voiceTimeLabel, setVoiceTimeLabel] = useState("0:00");
  // Tek-gorunumluk foto/video HENUZ acilmadiysa (bkz. asagidaki
  // viewOnceViewerUri) sohbette GERCEK icerik hic gosterilmez - sadece
  // tur + "1" rozetli bir satir (kullanicinin istegi: "fotoğrafsa fotoğraf
  // videoysa video... yazdığımız bir mesaj balonu"). Dokununca GERCEK
  // mediaUrl'i YEREL state'e (consumption sonrasi item.mediaUrl undefined
  // olsa bile) yakalayip tam ekran acar VE ayni anda tuketimi bildirir.
  // caption burada da YEREL olarak yakalanir - acilinca onConsumeMediaOnce
  // tuketimi sunucuya bildirir, bu da item.mediaUrl'i undefined yapar ve
  // hasMediaCaption (item.mediaUrl'e bagli) FALSE olur; yazi acik goruntuyeci
  // acikken KAYBOLMASIN diye acilis anindaki degeri burada saklıyoruz.
  const [viewOnceViewerUri, setViewOnceViewerUri] = useState<{ uri: string; kind: "photo" | "video"; caption?: string } | null>(null);
  const isGifSticker = item.kind === "sticker" && !!item.stickerId?.startsWith("gif-");
  const consumedColor = isMine ? "rgba(255,255,255,0.6)" : MUTED;
  // Kullanici istegi: foto/video/gif ACILDIKTAN sonraki ikon+yazi GRI olsun
  // (mine/theirs farki yok, tek bir notr gri) - sesli mesaj bu degisiklige
  // dahil degil (ayri bir asama).
  const mediaConsumedColor = "#9A9A9A";
  const isUnopenedViewOnceMedia = !!item.viewOnce && !item.viewOnceConsumed && (item.kind === "photo" || item.kind === "video" || isGifSticker);
  // Acilmis VEYA acilmamis - ikisi de AYNI satir duzenini (rozet+yazi+saat,
  // tek satir, balon duz metin gibi kompakt) kullanir; farki sadece renk ve
  // yazi. Balon seviyesindeki stil/padding kararlari (bubblePhotoPad, ayri
  // metaRow) bu bayrakla kontrol edilir, sadece "henuz acilmamis" bayragiyla
  // DEGIL - yoksa acildiktan sonra balon sekli degisirdi (kullanici sikayeti).
  const isViewOnceBadgeRow = !!item.viewOnce && (item.kind === "photo" || item.kind === "video" || isGifSticker);
  // Sesli mesaj HENUZ dinlenmemisken kendi normal calinabilir dalgaboyu
  // arayuzunu koruyor (bubbleVoicePad/metaRowVoice) - sadece DINLENDIKTEN
  // SONRA foto/video/gif ile AYNI kompakt rozet+yazi+saat satirina geciyor.
  const isVoiceConsumedBadgeRow = item.kind === "voice" && !!item.viewOnce && !!item.viewOnceConsumed;
  function openViewOnceMedia() {
    if (!item.mediaUrl) return;
    const caption = hasMediaCaption ? item.text : undefined;
    if (item.kind === "video") {
      setViewOnceViewerUri({ uri: item.mediaUrl, kind: "video", caption });
    } else if (item.kind === "photo" || isGifSticker) {
      setViewOnceViewerUri({ uri: item.mediaUrl, kind: "photo", caption });
    } else {
      return;
    }
    onConsumeMediaOnce(item.id);
  }
  const hasMediaCaption =
    !item.deletedForEveryone &&
    item.kind !== "voice" &&
    item.kind !== "location" &&
    item.kind !== "music" &&
    item.kind !== "video" &&
    item.kind !== "sticker" &&
    !!item.mediaUrl &&
    !!item.text &&
    item.text !== "📷 Fotoğraf" &&
    !(item.kind === "file" && item.text === `📎 ${item.fileName}`);

  return (
    <View style={[styles.messageRow, isMine ? styles.messageRowMine : styles.messageRowTheirs, !groupedWithPrev && styles.messageRowNewGroup]}>
      {!isMine && (
        <View style={styles.senderAvatarWrap}>
          {!groupedWithPrev ? (
            <Avatar name={sender?.name || item.fromName} avatarUrl={sender?.avatarUrl} size={28} isFriend />
          ) : (
            <View style={styles.senderAvatarSpacer} />
          )}
        </View>
      )}
      <View style={styles.bubbleCol}>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={onTap}
          onLongPress={item.deletedForEveryone ? undefined : onLongPress}
          style={styles.bubbleWrap}
        >
          <View
            style={[
              styles.bubble,
              isMine ? styles.bubbleMine : styles.bubbleTheirs,
              !groupedWithPrev && (isMine ? styles.bubbleMineFirst : styles.bubbleTheirsFirst),
              item.kind === "voice" && !isVoiceConsumedBadgeRow && styles.bubbleVoicePad,
              item.kind === "location" && styles.bubbleLocationPad,
              item.kind === "file" && styles.bubbleFilePad,
              item.kind === "poll" && styles.bubblePollPad,
              item.kind === "contact" && styles.bubbleContactPad,
              item.kind === "music" && styles.bubbleMusicPad,
              (item.kind !== "voice" &&
                item.kind !== "location" &&
                item.kind !== "file" &&
                item.kind !== "poll" &&
                item.kind !== "contact" &&
                item.kind !== "music" &&
                (item.kind !== "sticker" || isGifSticker) &&
                (item.mediaUrl || isGifSticker) &&
                !isViewOnceBadgeRow &&
                styles.bubblePhotoPad),
              item.kind === "sticker" && !isGifSticker && styles.bubbleStickerNoBg,
            ]}
          >
            {!groupedWithPrev && (item.kind !== "sticker" || isGifSticker) && (
              <BubbleTail color={isMine ? BUBBLE_MINE_COLOR : "#1E293B"} mine={isMine} />
            )}
            {!isMine && !groupedWithPrev && (
              <Text style={[styles.senderName, { color: colorForName(sender?.name || item.fromName) }]}>
                {sender?.name || item.fromName}
              </Text>
            )}
            {item.isForwarded && !item.deletedForEveryone && (
              <View style={styles.forwardedRow}>
                <Icon name="undoArrow" size={12} color={isMine ? "rgba(255,255,255,0.75)" : MUTED} />
                <Text style={[styles.forwardedText, { color: isMine ? "rgba(255,255,255,0.75)" : MUTED }]}>{t("dm.forwardedLabel")}</Text>
              </View>
            )}
            {item.replyTo && !item.deletedForEveryone && (
              <View style={styles.replyQuote}>
                <ReplyPreviewContent fromName={item.replyTo.fromName} text={item.replyTo.text} kind={item.replyTo.kind} mediaUrl={item.replyTo.mediaUrl} viewOnce={item.replyTo.viewOnce} stickerId={item.replyTo.stickerId} variant="bubble" />
              </View>
            )}
            {item.deletedForEveryone ? (
              <View style={styles.deletedRow}>
                <Trash2 size={13} color={consumedColor} />
                <Text style={[styles.deletedText, { color: consumedColor }]}>{t("dm.deletedMessage")}</Text>
              </View>
            ) : item.kind === "voice" && item.viewOnce && item.viewOnceConsumed ? (
              <View style={[styles.viewOnceUnopenedRow, isMine && styles.viewOnceUnopenedRowMineShift]}>
                <View style={styles.viewOnceUnopenedIconWrap}>
                  <VoiceOnceRingIcon size={40} color={mediaConsumedColor} />
                </View>
                <Text style={[styles.viewOnceUnopenedText, { color: mediaConsumedColor }]}>{t("dm.kindVoice")}</Text>
                <Text style={[styles.metaTime, styles.viewOnceUnopenedTime]}>{formatMessageTime(item.createdAt, i18n.language)}</Text>
              </View>
            ) : item.kind === "voice" && item.mediaUrl ? (
              <VoiceMessageBubble uri={item.mediaUrl} durationMs={item.durationMs} onTimeLabel={setVoiceTimeLabel} onPlay={item.viewOnce ? () => onConsumeMediaOnce(item.id) : undefined} viewOnceUnplayed={!!item.viewOnce} />
            ) : item.kind === "location" && item.latitude != null && item.longitude != null ? (
              <LocationMessageBubble latitude={item.latitude} longitude={item.longitude} />
            ) : item.kind === "file" && item.mediaUrl ? (
              <FileMessageBubble uri={item.mediaUrl} fileName={item.fileName || item.text} fileSize={item.fileSize ?? undefined} mimeType={item.mimeType ?? undefined} />
            ) : item.kind === "contact" && item.sharedUserName ? (
              <ContactMessageBubble name={item.sharedUserName} handle={item.sharedUserHandle} avatarUrl={item.sharedUserAvatarUrl} />
            ) : item.kind === "poll" && item.pollQuestion && item.pollOptions ? (
              <PollMessageBubble
                question={item.pollQuestion}
                options={item.pollOptions}
                optionImages={item.pollOptionImages}
                votes={item.pollVotes ?? new Array(item.pollOptions.length).fill(0)}
                myVote={item.myPollVote ?? null}
                onVote={(optionIndex) => onVotePoll(item.id, optionIndex)}
              />
            ) : item.kind === "music" && item.mediaUrl ? (
              <MusicMessageBubble uri={item.mediaUrl} title={item.fileName || item.text} />
            ) : isGifSticker && item.viewOnce && item.viewOnceConsumed ? (
              <View style={[styles.viewOnceUnopenedRow, isMine && styles.viewOnceUnopenedRowMineShift]}>
                <View style={styles.viewOnceUnopenedIconWrap}>
                  <VoiceOnceRingIcon size={40} color={mediaConsumedColor} />
                </View>
                <Text style={[styles.viewOnceUnopenedText, { color: mediaConsumedColor }]}>{t("dm.kindGif")}</Text>
                <Text style={[styles.metaTime, styles.viewOnceUnopenedTime]}>{formatMessageTime(item.createdAt, i18n.language)}</Text>
              </View>
            ) : isGifSticker && item.viewOnce && item.mediaUrl ? (
              <TouchableOpacity activeOpacity={0.7} onPress={openViewOnceMedia} style={[styles.viewOnceUnopenedRow, isMine && styles.viewOnceUnopenedRowMineShift]}>
                <View style={styles.viewOnceUnopenedIconWrap}>
                  <VoiceOnceRingIcon size={40} color={isMine ? "#FFFFFF" : TEXT} />
                </View>
                <Text style={[styles.viewOnceUnopenedText, { color: isMine ? "#FFFFFF" : TEXT }]}>{t("dm.kindGif")}</Text>
                <Text style={[styles.metaTime, styles.viewOnceUnopenedTime]}>{formatMessageTime(item.createdAt, i18n.language)}</Text>
              </TouchableOpacity>
            ) : item.kind === "sticker" && item.stickerId?.startsWith("gif-") ? (
              <GifMessageBubble stickerId={item.stickerId ?? null} mediaUrl={item.mediaUrl ?? null} />
            ) : item.kind === "sticker" ? (
              <StickerMessageBubble stickerId={item.stickerId ?? null} mediaUrl={item.mediaUrl ?? null} />
            ) : item.kind === "video" && item.viewOnce && item.viewOnceConsumed ? (
              <View style={[styles.viewOnceUnopenedRow, isMine && styles.viewOnceUnopenedRowMineShift]}>
                <View style={styles.viewOnceUnopenedIconWrap}>
                  <VoiceOnceRingIcon size={40} color={mediaConsumedColor} />
                </View>
                <Text style={[styles.viewOnceUnopenedText, { color: mediaConsumedColor }]}>{t("dm.kindVideo")}</Text>
                <Text style={[styles.metaTime, styles.viewOnceUnopenedTime]}>{formatMessageTime(item.createdAt, i18n.language)}</Text>
              </View>
            ) : item.kind === "video" && item.viewOnce && item.mediaUrl ? (
              <TouchableOpacity activeOpacity={0.7} onPress={openViewOnceMedia} style={[styles.viewOnceUnopenedRow, isMine && styles.viewOnceUnopenedRowMineShift]}>
                <View style={styles.viewOnceUnopenedIconWrap}>
                  <VoiceOnceRingIcon size={40} color={isMine ? "#FFFFFF" : TEXT} />
                </View>
                <Text style={[styles.viewOnceUnopenedText, { color: isMine ? "#FFFFFF" : TEXT }]}>{t("dm.kindVideo")}</Text>
                <Text style={[styles.metaTime, styles.viewOnceUnopenedTime]}>{formatMessageTime(item.createdAt, i18n.language)}</Text>
              </TouchableOpacity>
            ) : item.kind === "video" && item.mediaUrl ? (
              <VideoMessageBubble uri={item.mediaUrl} size={280} borderRadius={8} senderName={item.fromName} sentAt={item.createdAt} onReply={onReply} />
            ) : item.kind === "photo" && item.viewOnce && item.viewOnceConsumed ? (
              <View style={[styles.viewOnceUnopenedRow, isMine && styles.viewOnceUnopenedRowMineShift]}>
                <View style={styles.viewOnceUnopenedIconWrap}>
                  <VoiceOnceRingIcon size={40} color={mediaConsumedColor} />
                </View>
                <Text style={[styles.viewOnceUnopenedText, { color: mediaConsumedColor }]}>{t("dm.kindPhoto")}</Text>
                <Text style={[styles.metaTime, styles.viewOnceUnopenedTime]}>{formatMessageTime(item.createdAt, i18n.language)}</Text>
              </View>
            ) : item.kind === "photo" && item.viewOnce && item.mediaUrl ? (
              <TouchableOpacity activeOpacity={0.7} onPress={openViewOnceMedia} style={[styles.viewOnceUnopenedRow, isMine && styles.viewOnceUnopenedRowMineShift]}>
                <View style={styles.viewOnceUnopenedIconWrap}>
                  <VoiceOnceRingIcon size={40} color={isMine ? "#FFFFFF" : TEXT} />
                </View>
                <Text style={[styles.viewOnceUnopenedText, { color: isMine ? "#FFFFFF" : TEXT }]}>{t("dm.kindPhoto")}</Text>
                <Text style={[styles.metaTime, styles.viewOnceUnopenedTime]}>{formatMessageTime(item.createdAt, i18n.language)}</Text>
              </TouchableOpacity>
            ) : item.kind === "photo" && item.mediaUrl ? (
              <>
                <ChatImageBubble uri={item.mediaUrl} isAdult={item.isAdult} size={280} senderName={item.fromName} sentAt={item.createdAt} onReply={onReply} />
              </>
            ) : (
              <Text style={styles.bubbleText}>{item.text}</Text>
            )}
            {hasMediaCaption && <Text style={styles.mediaCaption}>{item.text}</Text>}
            {!isViewOnceBadgeRow && !isVoiceConsumedBadgeRow && (
              <View
                style={[
                  styles.metaRow,
                  item.kind === "voice" && styles.metaRowVoice,
                  (item.kind !== "voice" && item.kind !== "location" && item.kind !== "file" && item.kind !== "music" && (item.kind !== "sticker" || isGifSticker) && (item.mediaUrl || isGifSticker) && !hasMediaCaption && styles.metaRowPhotoOverlay),
                  item.kind === "music" && styles.metaRowMusicOverlay,
                  item.kind === "poll" && styles.metaRowPollOverlay,
                  item.kind === "contact" && styles.metaRowContactOverlay,
                  item.kind === "file" && !hasMediaCaption && styles.metaRowFileOverlay,
                  item.kind === "sticker" && !isGifSticker && styles.metaRowStickerOverlay,
                ]}
              >
                {item.kind === "voice" && <Text style={styles.voiceMetaTime}>{voiceTimeLabel}</Text>}
                <Text style={styles.metaTime}>
                  {formatMessageTime(item.createdAt, i18n.language)}
                </Text>
              </View>
            )}
          </View>
          {reactions.length > 0 && (
            <View style={[styles.reactionBadgeRow, isMine ? styles.reactionBadgeRowMine : styles.reactionBadgeRowTheirs]}>
              {reactions.map((r) => (
                <View key={r.emoji} style={styles.reactionBadgeChip}>
                  <Text style={styles.reactionBadgeEmoji}>
                    {r.emoji}
                    {r.count > 1 ? ` ${r.count}` : ""}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </TouchableOpacity>
      </View>
      <PhotoViewerModal
        uri={viewOnceViewerUri?.kind === "photo" ? viewOnceViewerUri.uri : null}
        onClose={() => setViewOnceViewerUri(null)}
        senderName={item.fromName}
        sentAt={item.createdAt}
        onReply={onReply}
        onShowInChat={() => onShowInChat(item.id)}
        onReport={() => onReportUser(item.fromUserId, sender?.name || item.fromName)}
        hideForward
        hideDownload
        caption={viewOnceViewerUri?.caption}
      />
      <VideoViewerModal
        uri={viewOnceViewerUri?.kind === "video" ? viewOnceViewerUri.uri : null}
        onClose={() => setViewOnceViewerUri(null)}
        senderName={item.fromName}
        sentAt={item.createdAt}
        onReply={onReply}
        onShowInChat={() => onShowInChat(item.id)}
        onReport={() => onReportUser(item.fromUserId, sender?.name || item.fromName)}
        hideForward
        hideDownload
        caption={viewOnceViewerUri?.caption}
      />
    </View>
  );
}

/** Grup sohbeti - DMScreen.tsx'teki ("Kişi Mesajı") ekranla GORUNUM VE
 * ISLEV olarak BIREBIR AYNI: emoji paneli (cikartma/GIF sekmeleri dahil),
 * fotograf/galeri, kamera (foto+video, son medya seridi), sesli mesaj
 * (basili tut/surukleyip kilitle + tek gorunumluk), konum, genel dosya,
 * muzik, kisi karti, anket (+secenek fotograflari/oylama), VE basili tutma
 * menusu (yanitla/sabitle/ilet/sil) ile cift-tik tepki. Kullanicinin
 * "Hepsi birebir aynı yap" istegiyle DM'in 46 migration'da asama asama
 * ulastigi butun bu ozelliklere grup da 0047-0051 migration'larinda ulasti. */
export default function GroupChatScreen({ group, onBack, onOpenInfo }: Props) {
  const { t, i18n } = useTranslation();
  const [groupDetail, setGroupDetail] = useState<GroupDetail>({ id: group.id, name: group.name, avatarUrl: group.avatarUrl, members: [] });
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [pinnedMessages, setPinnedMessages] = useState<GroupPinnedMessage[]>([]);
  const [pinnedCursor, setPinnedCursor] = useState(0);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState("");
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const listRef = useRef<FlatList<GroupMessage>>(null);
  const pendingScrollMessageId = useRef<string | null>(null);
  const socket = getSocket();

  const [attachSheetVisible, setAttachSheetVisible] = useState(false);
  const [emojiPanelVisible, setEmojiPanelVisible] = useState(false);
  const [replyingTo, setReplyingTo] = useState<GroupReply | null>(null);
  const [actionMenuMessage, setActionMenuMessage] = useState<GroupMessage | null>(null);
  const [forwardTarget, setForwardTarget] = useState<GroupMessage | null>(null);
  const [contactPickerVisible, setContactPickerVisible] = useState(false);

  // Cift-tik tepki - DM'deki myReaction/peerReaction ikilisi yerine (N kisi
  // oldugu icin) messageId -> {userId: emoji} haritasi, sunucuda SAKLANMAZ
  // (bkz. "group:react"/"group:reaction" - DM'in dm:react'iyle AYNI gecici
  // mantik).
  const [reactionsByMessage, setReactionsByMessage] = useState<Record<string, Record<string, string>>>({});
  const [quickReactionEmoji, setQuickReactionEmoji] = useState("❤️");
  const lastTapRef = useRef<Record<string, number>>({});

  // Fotograf/galeri.
  const [pendingImages, setPendingImages] = useState<string[]>([]);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Video kuyrugu - SendVideoSheet'te onizlenip gonderiliyor (DM'deki
  // videoQueue ile AYNI, trim/kirpma/mute GERCEK transcode YAPMAZ - sadece
  // metadata, bkz. SendVideoSheet'in kendi dosya basi notu).
  const [videoQueue, setVideoQueue] = useState<{ uri: string; mimeType?: string | null }[]>([]);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [videoUploadProgress, setVideoUploadProgress] = useState(0);

  // Ani kamera cekimi - artik DM'deki gibi foto VE video modu var.
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [quickCaptureActive, setQuickCaptureActive] = useState(false);
  const [quickCameraReady, setQuickCameraReady] = useState(false);
  const [quickCameraFacing, setQuickCameraFacing] = useState<"back" | "front">("back");
  const [quickCameraFlash, setQuickCameraFlash] = useState<"off" | "on">("off");
  const [quickCameraMode, setQuickCameraMode] = useState<"photo" | "video">("photo");
  const [capturingQuickPhoto, setCapturingQuickPhoto] = useState(false);
  const [isRecordingVideo, setIsRecordingVideo] = useState(false);
  const [recordingElapsedSec, setRecordingElapsedSec] = useState(0);
  const recordingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cameraRef = useRef<CameraView>(null);

  // Konum/dosya/muzik/anket - DM'deki ile AYNI state'ler.
  const [locationPickerVisible, setLocationPickerVisible] = useState(false);
  const [filePreviewVisible, setFilePreviewVisible] = useState(false);
  const [pendingAttachKind, setPendingAttachKind] = useState<"file" | "music">("file");
  const [pendingFiles, setPendingFiles] = useState<PickedFileAsset[]>([]);
  const [fileCaption, setFileCaption] = useState("");
  const [fileUploadProgress, setFileUploadProgress] = useState(0);
  const [sendingFile, setSendingFile] = useState(false);
  const [recentFiles, setRecentFiles] = useState<RecentFileEntry[]>([]);
  const [recentSelectionMode, setRecentSelectionMode] = useState(false);
  const [selectedRecentUris, setSelectedRecentUris] = useState<string[]>([]);
  const [recentMusic, setRecentMusic] = useState<RecentFileEntry[]>([]);
  const [musicSelectionMode, setMusicSelectionMode] = useState(false);
  const [selectedMusicUris, setSelectedMusicUris] = useState<string[]>([]);
  const [pollComposerVisible, setPollComposerVisible] = useState(false);
  const [sendingPoll, setSendingPoll] = useState(false);

  // Tek-gorunumluk medya goruntuyecisindeki "Bildir" icin - DMScreen.tsx'teki
  // AYNI "report:submit" (kullanici bazli rapor) akisi.
  const [reportVisible, setReportVisible] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reportTarget, setReportTarget] = useState<{ userId: string; name: string } | null>(null);
  function openReportSheet(userId: string, name: string) {
    setReportTarget({ userId, name });
    setReportReason("");
    setReportVisible(true);
  }
  function submitReport() {
    const reason = reportReason.trim();
    if (!reason || !reportTarget) return;
    socket.emit("report:submit", { targetUserId: reportTarget.userId, reason }, (res: any) => {
      if (res?.ok) showAlert(t("dm.reportSentTitle"), t("dm.reportSentBody"));
      else showAlert(t("dm.reportFailedTitle"), t("dm.reportFailedBody"));
    });
    setReportReason("");
    setReportVisible(false);
  }

  // Cikartma/GIF - DM'deki ile AYNI kisisel (cihaz basina, AsyncStorage)
  // listeler, grup/DM ayrimi olmadan paylasilir.
  const [customStickers, setCustomStickers] = useState<CustomSticker[]>([]);
  const [customGifs, setCustomGifs] = useState<CustomGif[]>([]);
  const [creatingSticker, setCreatingSticker] = useState(false);
  const [creatingGif, setCreatingGif] = useState(false);

  // Sesli mesaj kaydi - DMScreen.tsx'teki ile BIREBIR AYNI.
  const audioRecorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true });
  const recorderState = useAudioRecorderState(audioRecorder, 200);
  const waveHistoryRef = useRef<number[]>([]);
  const lastMeteringTickRef = useRef(-1);
  const [voiceRecording, setVoiceRecording] = useState(false);
  const [sendingVoice, setSendingVoice] = useState(false);
  const [recordingLocked, setRecordingLocked] = useState(false);
  const [recordingPaused, setRecordingPaused] = useState(false);
  const [voiceOnceView, setVoiceOnceView] = useState(false);
  const recordDragX = useRef(new Animated.Value(0)).current;
  const recordDragY = useRef(new Animated.Value(0)).current;
  const recordLockedRef = useRef(false);
  const consumedOnceRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMyUserId(data.user?.id ?? null));
  }, []);

  useEffect(() => {
    getCustomStickers().then(setCustomStickers);
    getCustomGifs().then(setCustomGifs);
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) return;
      const { data: profile } = await supabase.from("profiles").select("default_reaction_emoji").eq("id", data.user.id).maybeSingle();
      if (profile?.default_reaction_emoji) setQuickReactionEmoji(profile.default_reaction_emoji);
    })();
  }, []);

  const memberById = new Map(groupDetail.members.map((m) => [m.userId, m]));

  useEffect(() => {
    socket.emit("group:open", { groupId: group.id }, (res: any) => {
      setLoading(false);
      if (!res?.ok) return;
      setGroupDetail(res.group);
      setMessages(res.messages || []);
      setPinnedMessages(res.pinned || []);
    });

    function handleIncoming({ groupId, message }: { groupId: string; message: GroupMessage }) {
      if (groupId !== group.id) return;
      setMessages((prev) => [...prev, message]);
    }
    socket.on("group:message", handleIncoming);

    function handleMediaOnceConsumed({ groupId, messageId }: { groupId: string; messageId: string }) {
      if (groupId !== group.id) return;
      setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, viewOnceConsumed: true, mediaUrl: undefined } : m)));
    }
    socket.on("group:message:mediaOnceConsumed", handleMediaOnceConsumed);

    function handlePollVote({ groupId, messageId, votes }: { groupId: string; messageId: string; votes: number[] }) {
      if (groupId !== group.id) return;
      setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, pollVotes: votes } : m)));
    }
    socket.on("group:pollVote", handlePollVote);

    function handleReaction({ groupId, fromUserId, messageId, emoji }: { groupId: string; fromUserId: string; messageId: string; emoji: string | null }) {
      if (groupId !== group.id) return;
      setReactionsByMessage((prev) => {
        const forMessage = { ...(prev[messageId] || {}) };
        if (emoji) forMessage[fromUserId] = emoji;
        else delete forMessage[fromUserId];
        return { ...prev, [messageId]: forMessage };
      });
    }
    socket.on("group:reaction", handleReaction);

    function handleDeletedForEveryone({ groupId, messageId }: { groupId: string; messageId: string }) {
      if (groupId !== group.id) return;
      setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, deletedForEveryone: true } : m)));
    }
    socket.on("group:message:deletedForEveryone", handleDeletedForEveryone);

    function handlePinned({ groupId, messageId, pinnedBy, pinnedAt }: { groupId: string; messageId: string; pinnedBy: string; pinnedAt: number }) {
      if (groupId !== group.id) return;
      setMessages((current) => {
        const message = current.find((m) => m.id === messageId);
        if (message) setPinnedMessages((prev) => (prev.some((p) => p.message.id === messageId) ? prev : [...prev, { message, pinnedBy, pinnedAt }]));
        return current;
      });
    }
    socket.on("group:message:pinned", handlePinned);

    function handleUnpinned({ groupId, messageId }: { groupId: string; messageId: string }) {
      if (groupId !== group.id) return;
      setPinnedMessages((prev) => prev.filter((p) => p.message.id !== messageId));
    }
    socket.on("group:message:unpinned", handleUnpinned);

    return () => {
      socket.off("group:message", handleIncoming);
      socket.off("group:message:mediaOnceConsumed", handleMediaOnceConsumed);
      socket.off("group:pollVote", handlePollVote);
      socket.off("group:reaction", handleReaction);
      socket.off("group:message:deletedForEveryone", handleDeletedForEveryone);
      socket.off("group:message:pinned", handlePinned);
      socket.off("group:message:unpinned", handleUnpinned);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group.id]);

  function handleConsumeMediaOnce(messageId: string) {
    if (consumedOnceRef.current.has(messageId)) return;
    consumedOnceRef.current.add(messageId);
    socket.emit("group:consumeMediaOnce", { groupId: group.id, messageId }, (res: any) => {
      if (!res?.ok) consumedOnceRef.current.delete(messageId);
    });
  }

  function scrollToMessage(id: string) {
    const index = messages.findIndex((m) => m.id === id);
    if (index === -1) return;
    pendingScrollMessageId.current = id;
    listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.5 });
  }

  function handleMessageTap(message: GroupMessage) {
    const now = Date.now();
    const last = lastTapRef.current[message.id] || 0;
    lastTapRef.current[message.id] = now;
    if (now - last > 300) return;
    if (!myUserId) return;
    const mine = reactionsByMessage[message.id]?.[myUserId];
    const next = mine === quickReactionEmoji ? null : quickReactionEmoji;
    setReactionsByMessage((prev) => {
      const forMessage = { ...(prev[message.id] || {}) };
      if (next) forMessage[myUserId] = next;
      else delete forMessage[myUserId];
      return { ...prev, [message.id]: forMessage };
    });
    socket.emit("group:react", { groupId: group.id, messageId: message.id, emoji: next });
  }

  function startReply(message: GroupMessage) {
    setReplyingTo({
      text: message.text,
      fromName: message.fromUserId === myUserId ? t("dm.you") : message.fromName,
      kind: message.kind,
      // Tek-gorunumlukse GERCEK mediaUrl'i cevaba HIC koymuyoruz (sizdirmamak
      // icin) - ReplyPreviewContent sadece "viewOnce" bayragina bakip rozet+
      // tur etiketi gosteriyor, gercek icerige ihtiyaci yok.
      mediaUrl: message.viewOnce ? undefined : message.mediaUrl,
      viewOnce: message.viewOnce,
      stickerId: message.stickerId,
    });
  }

  function openActionMenu(message: GroupMessage) {
    if (message.deletedForEveryone) return;
    setActionMenuMessage(message);
  }
  function closeActionMenu() {
    setActionMenuMessage(null);
  }
  async function handleCopy(message: GroupMessage) {
    closeActionMenu();
    await Clipboard.setStringAsync(message.text || "");
  }
  function handleDeleteForMe(message: GroupMessage) {
    closeActionMenu();
    showAlert(t("dm.deleteForMeConfirmTitle"), t("dm.deleteForMeConfirmBody"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("dm.actionDeleteForMe"),
        style: "destructive",
        onPress: () => {
          socket.emit("group:deleteMessage", { groupId: group.id, messageId: message.id, forEveryone: false }, (res: any) => {
            if (res?.ok) {
              setMessages((prev) => prev.filter((m) => m.id !== message.id));
              setPinnedMessages((prev) => prev.filter((p) => p.message.id !== message.id));
            }
          });
        },
      },
    ]);
  }
  function handleDeleteForEveryone(message: GroupMessage) {
    closeActionMenu();
    showAlert(t("dm.deleteForEveryoneConfirmTitle"), t("dm.deleteForEveryoneConfirmBody"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("dm.actionDeleteForEveryone"),
        style: "destructive",
        onPress: () => socket.emit("group:deleteMessage", { groupId: group.id, messageId: message.id, forEveryone: true }, () => {}),
      },
    ]);
  }
  function handleDeleteTap(message: GroupMessage) {
    closeActionMenu();
    const isMine = message.fromUserId === myUserId;
    if (!isMine) {
      handleDeleteForMe(message);
      return;
    }
    showAlert(t("dm.deleteChooseTitle"), t("dm.deleteChooseBody"), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("dm.actionDeleteForMe"), style: "destructive", onPress: () => handleDeleteForMe(message) },
      { text: t("dm.actionDeleteForEveryone"), style: "destructive", onPress: () => handleDeleteForEveryone(message) },
    ]);
  }
  function handlePinToggle(message: GroupMessage) {
    closeActionMenu();
    const isPinned = pinnedMessages.some((p) => p.message.id === message.id);
    if (isPinned) socket.emit("group:unpinMessage", { groupId: group.id, messageId: message.id }, () => {});
    else socket.emit("group:pinMessage", { groupId: group.id, messageId: message.id }, () => {});
  }
  function openForwardPicker(message: GroupMessage) {
    closeActionMenu();
    setForwardTarget(message);
  }
  function forwardToUsers(userIds: string[]) {
    if (!forwardTarget || userIds.length === 0) return;
    socket.emit("group:forwardToDm", { toUserIds: userIds, message: forwardTarget }, () => setForwardTarget(null));
  }

  function openContactPicker() {
    setAttachSheetVisible(false);
    setContactPickerVisible(true);
  }
  function sendContacts(userIds: string[]) {
    if (!userIds.length) return;
    setContactPickerVisible(false);
    userIds.forEach((sharedUserId) => {
      socket.emit("group:sendContact", { groupId: group.id, sharedUserId }, (res: any) => {
        if (res?.ok && res.message) setMessages((prev) => [...prev, res.message]);
        else if (!res?.ok) showAlert(t("dm.sendFailedTitle"), res?.error || t("dm.genericSendErrorBody"));
      });
    });
  }

  function openPollComposer() {
    setAttachSheetVisible(false);
    setPollComposerVisible(true);
  }
  async function sendPoll(question: string, options: string[], optionImages: (string | null)[]) {
    if (!myUserId || sendingPoll) return;
    setSendingPoll(true);
    try {
      const uploadedImages: (string | null)[] = [];
      for (const uri of optionImages) {
        if (!uri) {
          uploadedImages.push(null);
          continue;
        }
        const arrayBuffer = await uriToArrayBuffer(uri);
        const ext = uri.split(".").pop()?.toLowerCase() || "jpg";
        const path = `${myUserId}/${Date.now()}-poll-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        await uploadWithProgress("chat-media", path, arrayBuffer, "image/jpeg", () => {});
        const { data: publicUrlData } = supabase.storage.from("chat-media").getPublicUrl(path);
        uploadedImages.push(publicUrlData.publicUrl);
      }
      const hasImages = uploadedImages.some((u) => u !== null);
      socket.emit("group:sendPoll", { groupId: group.id, question, options, optionImages: hasImages ? uploadedImages : undefined }, (res: any) => {
        if (res?.ok && res.message) {
          setMessages((prev) => [...prev, res.message]);
          setPollComposerVisible(false);
        } else if (!res?.ok) showAlert(t("dm.sendFailedTitle"), res?.error || t("dm.genericSendErrorBody"));
      });
    } catch (err: any) {
      showAlert(t("dm.sendFailedTitle"), err?.message || t("dm.genericSendErrorBody"));
    } finally {
      setSendingPoll(false);
    }
  }
  function votePoll(messageId: string, optionIndex: number) {
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== messageId || !m.pollOptions) return m;
        const prevVote = m.myPollVote;
        if (prevVote === optionIndex) return m;
        const votes = [...(m.pollVotes ?? new Array(m.pollOptions.length).fill(0))];
        if (prevVote != null) votes[prevVote] = Math.max(0, votes[prevVote] - 1);
        votes[optionIndex] = (votes[optionIndex] ?? 0) + 1;
        return { ...m, myPollVote: optionIndex, pollVotes: votes };
      })
    );
    socket.emit("group:votePoll", { groupId: group.id, messageId, optionIndex }, (res: any) => {
      if (res?.ok && res.votes) setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, pollVotes: res.votes } : m)));
    });
  }

  function openLocationPicker() {
    setAttachSheetVisible(false);
    setLocationPickerVisible(true);
  }
  function handleLocationPickerConfirm(loc: PickedLocation) {
    setLocationPickerVisible(false);
    socket.emit("group:sendLocation", { groupId: group.id, latitude: loc.latitude, longitude: loc.longitude }, (res: any) => {
      if (res?.ok && res.message) setMessages((prev) => [...prev, res.message]);
      else if (!res?.ok) showAlert(t("dm.sendFailedTitle"), res?.error || t("dm.genericSendErrorBody"));
    });
  }

  function openFilePreview() {
    setAttachSheetVisible(false);
    setPendingAttachKind("file");
    setPendingFiles([]);
    setRecentSelectionMode(false);
    setSelectedRecentUris([]);
    setFilePreviewVisible(true);
    getRecentFiles().then(setRecentFiles);
  }
  function openMusicPicker() {
    setAttachSheetVisible(false);
    setPendingAttachKind("music");
    setPendingFiles([]);
    setMusicSelectionMode(false);
    setSelectedMusicUris([]);
    setFilePreviewVisible(true);
    getRecentMusic().then(setRecentMusic);
  }
  function pickFile() {
    DocumentPicker.getDocumentAsync({ multiple: false }).then((result) => {
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      setPendingFiles([{ uri: asset.uri, name: asset.name, size: asset.size, mimeType: asset.mimeType }]);
      setFileCaption("");
      addRecentFile({ uri: asset.uri, name: asset.name, size: asset.size, mimeType: asset.mimeType }).then(setRecentFiles);
    });
  }
  function pickMusicFile() {
    DocumentPicker.getDocumentAsync({ type: "audio/*", multiple: false }).then((result) => {
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      setPendingFiles([{ uri: asset.uri, name: asset.name, size: asset.size, mimeType: asset.mimeType }]);
      setFileCaption("");
      addRecentMusic({ uri: asset.uri, name: asset.name, size: asset.size, mimeType: asset.mimeType }).then(setRecentMusic);
    });
  }
  function toggleRecentSelection(uri: string) {
    setSelectedRecentUris((prev) => {
      const next = prev.includes(uri) ? prev.filter((u) => u !== uri) : [...prev, uri];
      if (next.length === 0) setRecentSelectionMode(false);
      return next;
    });
  }
  function handlePressRecent(file: RecentFileEntry) {
    if (recentSelectionMode) return toggleRecentSelection(file.uri);
    setPendingFiles([{ uri: file.uri, name: file.name, size: file.size, mimeType: file.mimeType }]);
    setFileCaption("");
  }
  function handleLongPressRecent(file: RecentFileEntry) {
    if (!recentSelectionMode) setRecentSelectionMode(true);
    toggleRecentSelection(file.uri);
  }
  function exitRecentSelection() {
    setRecentSelectionMode(false);
    setSelectedRecentUris([]);
  }
  function confirmRecentSelection() {
    const chosen = recentFiles.filter((f) => selectedRecentUris.includes(f.uri)).map((f) => ({ uri: f.uri, name: f.name, size: f.size, mimeType: f.mimeType }));
    if (chosen.length) sendFilesDirect(chosen);
  }
  async function sendFilesDirect(filesToSend: PickedFileAsset[]) {
    if (!filesToSend.length || !myUserId || sendingFile) return;
    setFilePreviewVisible(false);
    setPendingFiles([]);
    setRecentSelectionMode(false);
    setSelectedRecentUris([]);
    setSendingFile(true);
    try {
      for (const asset of filesToSend) {
        const arrayBuffer = await uriToArrayBuffer(asset.uri);
        const ext = asset.name.split(".").pop()?.toLowerCase() || "bin";
        const path = `${myUserId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        await uploadWithProgress("chat-media", path, arrayBuffer, asset.mimeType || "application/octet-stream", () => {});
        const { data: publicUrlData } = supabase.storage.from("chat-media").getPublicUrl(path);
        await new Promise<void>((resolve) => {
          socket.emit("group:sendFile", { groupId: group.id, mediaUrl: publicUrlData.publicUrl, fileName: asset.name, fileSize: asset.size, mimeType: asset.mimeType }, (res: any) => {
            if (res?.ok && res.message) setMessages((prev) => [...prev, res.message]);
            else if (!res?.ok) showAlert(t("dm.sendFailedTitle"), res?.error || t("dm.genericSendErrorBody"));
            resolve();
          });
        });
      }
    } catch (err: any) {
      showAlert(t("dm.sendFailedTitle"), err?.message || t("dm.genericSendErrorBody"));
    } finally {
      setSendingFile(false);
    }
  }
  function toggleMusicSelection(uri: string) {
    setSelectedMusicUris((prev) => {
      const next = prev.includes(uri) ? prev.filter((u) => u !== uri) : [...prev, uri];
      if (next.length === 0) setMusicSelectionMode(false);
      return next;
    });
  }
  function handlePressRecentMusic(file: RecentFileEntry) {
    if (musicSelectionMode) return toggleMusicSelection(file.uri);
    setPendingFiles([{ uri: file.uri, name: file.name, size: file.size, mimeType: file.mimeType }]);
    setFileCaption("");
  }
  function handleLongPressRecentMusic(file: RecentFileEntry) {
    if (!musicSelectionMode) setMusicSelectionMode(true);
    toggleMusicSelection(file.uri);
  }
  function exitMusicSelection() {
    setMusicSelectionMode(false);
    setSelectedMusicUris([]);
  }
  function confirmMusicSelection() {
    const chosen = recentMusic.filter((f) => selectedMusicUris.includes(f.uri)).map((f) => ({ uri: f.uri, name: f.name, size: f.size, mimeType: f.mimeType }));
    if (chosen.length) sendMusicFilesDirect(chosen);
  }
  async function sendMusicFilesDirect(filesToSend: PickedFileAsset[]) {
    if (!filesToSend.length || !myUserId || sendingFile) return;
    setFilePreviewVisible(false);
    setPendingFiles([]);
    setMusicSelectionMode(false);
    setSelectedMusicUris([]);
    setSendingFile(true);
    try {
      for (const asset of filesToSend) {
        const arrayBuffer = await uriToArrayBuffer(asset.uri);
        const ext = asset.name.split(".").pop()?.toLowerCase() || "bin";
        const path = `${myUserId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        await uploadWithProgress("chat-media", path, arrayBuffer, asset.mimeType || "application/octet-stream", () => {});
        const { data: publicUrlData } = supabase.storage.from("chat-media").getPublicUrl(path);
        await new Promise<void>((resolve) => {
          socket.emit("group:sendMusic", { groupId: group.id, mediaUrl: publicUrlData.publicUrl, fileName: asset.name, fileSize: asset.size, mimeType: asset.mimeType }, (res: any) => {
            if (res?.ok && res.message) setMessages((prev) => [...prev, res.message]);
            else if (!res?.ok) showAlert(t("dm.sendFailedTitle"), res?.error || t("dm.genericSendErrorBody"));
            resolve();
          });
        });
      }
    } catch (err: any) {
      showAlert(t("dm.sendFailedTitle"), err?.message || t("dm.genericSendErrorBody"));
    } finally {
      setSendingFile(false);
    }
  }
  function cancelPendingFile() {
    if (sendingFile) return;
    setFilePreviewVisible(false);
    setPendingFiles([]);
    setFileCaption("");
    setRecentSelectionMode(false);
    setSelectedRecentUris([]);
    setMusicSelectionMode(false);
    setSelectedMusicUris([]);
  }
  function backToFileList() {
    if (sendingFile) return;
    setPendingFiles([]);
    setFileCaption("");
  }
  async function confirmSendFile() {
    const asset = pendingFiles[0];
    if (!asset || !myUserId || sendingFile) return;
    setSendingFile(true);
    setFileUploadProgress(0);
    try {
      const arrayBuffer = await uriToArrayBuffer(asset.uri);
      const ext = asset.name.split(".").pop()?.toLowerCase() || "bin";
      const path = `${myUserId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      await uploadWithProgress("chat-media", path, arrayBuffer, asset.mimeType || "application/octet-stream", (pct) => setFileUploadProgress(pct));
      const { data: publicUrlData } = supabase.storage.from("chat-media").getPublicUrl(path);
      const event = pendingAttachKind === "music" ? "group:sendMusic" : "group:sendFile";
      await new Promise<void>((resolve, reject) => {
        socket.emit(event, { groupId: group.id, mediaUrl: publicUrlData.publicUrl, fileName: asset.name, fileSize: asset.size, mimeType: asset.mimeType, caption: fileCaption || undefined }, (res: any) => {
          if (res?.ok && res.message) {
            setMessages((prev) => [...prev, res.message]);
            resolve();
          } else reject(new Error(res?.error || t("dm.genericSendErrorBody")));
        });
      });
      setFilePreviewVisible(false);
      setPendingFiles([]);
      setFileCaption("");
    } catch (err: any) {
      showAlert(t("dm.sendFailedTitle"), err?.message || t("dm.genericSendErrorBody"));
    } finally {
      setSendingFile(false);
      setFileUploadProgress(0);
    }
  }

  function sendSticker(stickerId: string | null, mediaUrl: string | null) {
    if (!myUserId) return;
    setEmojiPanelVisible(false);
    socket.emit("group:sendSticker", { groupId: group.id, stickerId: stickerId ?? undefined, mediaUrl: mediaUrl ?? undefined }, (res: any) => {
      if (res?.ok && res.message) setMessages((prev) => [...prev, res.message]);
      else if (!res?.ok) showAlert(t("dm.sendFailedTitle"), res?.error || t("dm.genericSendErrorBody"));
    });
  }
  async function uploadCustomSticker(uri: string) {
    if (!myUserId) return;
    setCreatingSticker(true);
    try {
      const arrayBuffer = await uriToArrayBuffer(uri);
      const ext = uri.split(".").pop()?.toLowerCase().split("?")[0] || "png";
      const path = `${myUserId}/${Date.now()}-sticker-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      await uploadWithProgress("chat-media", path, arrayBuffer, ext === "png" ? "image/png" : "image/jpeg", () => {});
      const { data: publicUrlData } = supabase.storage.from("chat-media").getPublicUrl(path);
      const next = await addCustomSticker(publicUrlData.publicUrl);
      setCustomStickers(next);
    } catch (err: any) {
      showAlert(t("dm.sendFailedTitle"), err?.message || t("dm.genericSendErrorBody"));
    } finally {
      setCreatingSticker(false);
    }
  }
  async function createSticker() {
    if (!myUserId || creatingSticker) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      showAlert(t("dm.permissionRequiredTitle"), t("dm.permissionRequiredBody"));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.9 });
    if (result.canceled || !result.assets?.[0]) return;
    uploadCustomSticker(result.assets[0].uri);
  }
  async function uploadCustomGif(uri: string) {
    if (!myUserId) return;
    setCreatingGif(true);
    try {
      const arrayBuffer = await uriToArrayBuffer(uri);
      const ext = uri.split(".").pop()?.toLowerCase().split("?")[0] || "gif";
      const path = `${myUserId}/${Date.now()}-gif-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      await uploadWithProgress("chat-media", path, arrayBuffer, "image/gif", () => {});
      const { data: publicUrlData } = supabase.storage.from("chat-media").getPublicUrl(path);
      const next = await addCustomGif(publicUrlData.publicUrl);
      setCustomGifs(next);
    } catch (err: any) {
      showAlert(t("dm.sendFailedTitle"), err?.message || t("dm.genericSendErrorBody"));
    } finally {
      setCreatingGif(false);
    }
  }
  async function createGif() {
    if (!myUserId || creatingGif) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      showAlert(t("dm.permissionRequiredTitle"), t("dm.permissionRequiredBody"));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 1 });
    if (result.canceled || !result.assets?.[0]) return;
    uploadCustomGif(result.assets[0].uri);
  }

  function sendMessage() {
    const text = input.trim();
    if (!text) return;
    const replyTo = replyingTo;
    setInput("");
    setReplyingTo(null);
    Keyboard.dismiss();
    socket.emit("group:send", { groupId: group.id, text, replyTo }, (res: any) => {
      if (!res?.ok) {
        showAlert(t("dm.sendFailedTitle"), res?.error || t("dm.genericSendErrorBody"));
        return;
      }
      setMessages((prev) => [...prev, res.message]);
    });
  }

  function placeholderCall() {
    showAlert(t("friends.groupCallAction"), t("profile.comingSoon"));
  }

  function insertEmoji(emoji: string) {
    setInput((prev) => prev + emoji);
  }

  async function pickImage() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      showAlert(t("dm.permissionRequiredTitle"), t("dm.permissionRequiredBody"));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.7,
      allowsMultipleSelection: true,
      selectionLimit: 10,
    });
    if (result.canceled || !result.assets?.length) return;
    setAttachSheetVisible(false);
    setPendingImages((prev) => [...prev, ...result.assets!.map((a) => a.uri)]);
  }

  function removePendingImage(index: number) {
    setPendingImages((prev) => prev.filter((_, i) => i !== index));
  }
  function replacePendingImage(index: number, uri: string) {
    setPendingImages((prev) => prev.map((u, i) => (i === index ? uri : u)));
  }

  async function sendPickedImage(caption: string, viewOnce: boolean) {
    if (!pendingImages.length || !myUserId) return;
    setUploadingImage(true);
    setUploadProgress(0);
    const total = pendingImages.length;
    try {
      for (let i = 0; i < total; i++) {
        const uri = pendingImages[i];
        const arrayBuffer = await uriToArrayBuffer(uri);
        const ext = uri.split(".").pop()?.toLowerCase().split("?")[0] || "jpg";
        const contentType = ext === "png" ? "image/png" : "image/jpeg";
        const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const path = `${myUserId}/${fileName}`;
        await uploadWithProgress("chat-media", path, arrayBuffer, contentType, (pct) => {
          setUploadProgress(Math.round(((i + pct / 100) / total) * 100));
        });
        const { data: publicUrlData } = supabase.storage.from("chat-media").getPublicUrl(path);
        const isLast = i === total - 1;
        await new Promise<void>((resolve, reject) => {
          socket.emit(
            "group:sendImage",
            { groupId: group.id, mediaUrl: publicUrlData.publicUrl, caption: isLast ? caption || undefined : undefined, viewOnce },
            (res: any) => {
              if (res?.ok) {
                setMessages((prev) => [...prev, res.message]);
                resolve();
              } else reject(new Error(res?.error || t("dm.imageSendFailedBody")));
            }
          );
        });
      }
      setPendingImages([]);
    } catch (err: any) {
      showAlert(t("dm.sendFailedTitle"), err?.message || t("dm.imageSendErrorBody"));
    } finally {
      setUploadingImage(false);
      setUploadProgress(0);
    }
  }

  async function sendPickedVideo(uri: string, mimeType: string | null | undefined, caption: string, meta: { viewOnce: boolean }) {
    if (!myUserId) return;
    setUploadingVideo(true);
    setVideoUploadProgress(0);
    try {
      const arrayBuffer = await uriToArrayBuffer(uri);
      const ext = uri.split(".").pop()?.toLowerCase().split("?")[0] || "mp4";
      const contentType = mimeType || (ext === "mov" ? "video/quicktime" : "video/mp4");
      const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const path = `${myUserId}/${fileName}`;
      await uploadWithProgress("chat-media", path, arrayBuffer, contentType, (pct) => setVideoUploadProgress(pct));
      const { data: publicUrlData } = supabase.storage.from("chat-media").getPublicUrl(path);
      await new Promise<void>((resolve, reject) => {
        socket.emit(
          "group:sendVideo",
          { groupId: group.id, mediaUrl: publicUrlData.publicUrl, caption: caption || undefined, viewOnce: meta.viewOnce },
          (res: any) => {
            if (res?.ok) {
              setMessages((prev) => [...prev, res.message]);
              resolve();
            } else reject(new Error(res?.error || t("dm.genericSendErrorBody")));
          }
        );
      });
      setVideoQueue((prev) => prev.slice(1));
    } catch (err: any) {
      showAlert(t("dm.sendFailedTitle"), err?.message || t("dm.genericSendErrorBody"));
    } finally {
      setUploadingVideo(false);
      setVideoUploadProgress(0);
    }
  }

  async function startQuickCapture() {
    if (!cameraPermission?.granted) {
      const res = await requestCameraPermission();
      if (!res.granted) {
        showAlert(t("dm.permissionRequiredTitle"), t("dm.cameraPermissionRequiredBody"));
        return;
      }
    }
    setQuickCameraReady(false);
    setQuickCameraFacing("back");
    setQuickCameraFlash("off");
    setQuickCameraMode("photo");
    setCapturingQuickPhoto(false);
    setIsRecordingVideo(false);
    setRecordingElapsedSec(0);
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }
    setAttachSheetVisible(false);
    setQuickCaptureActive(true);
  }

  function handleQuickCameraReady() {
    setQuickCameraReady(true);
  }
  function toggleQuickCameraFacing() {
    setQuickCameraFacing((f) => (f === "back" ? "front" : "back"));
  }
  function toggleQuickCameraFlash() {
    setQuickCameraFlash((f) => (f === "off" ? "on" : "off"));
  }
  function handleQuickGalleryPress() {
    setQuickCaptureActive(false);
    pickImage();
  }
  function handleFilmstripPickAsset(asset: FilmstripPickedAsset) {
    setQuickCaptureActive(false);
    if (asset.type === "video") setVideoQueue((prev) => [...prev, { uri: asset.uri, mimeType: "video/mp4" }]);
    else setPendingImages((prev) => [...prev, asset.uri]);
  }

  function handleQuickShutterPress() {
    if (quickCameraMode === "video") handleQuickVideoShutterPress();
    else handleQuickPhotoShutterPress();
  }

  async function handleQuickPhotoShutterPress() {
    if (capturingQuickPhoto || !quickCameraReady) return;
    setCapturingQuickPhoto(true);
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const photo = await cameraRef.current?.takePictureAsync({ quality: 0.7 });
        if (photo?.uri) {
          setQuickCaptureActive(false);
          setCapturingQuickPhoto(false);
          setPendingImages((prev) => [...prev, photo.uri]);
          return;
        }
      } catch {
        await new Promise((r) => setTimeout(r, 200));
      }
    }
    setCapturingQuickPhoto(false);
  }

  async function handleQuickVideoShutterPress() {
    if (!quickCameraReady) return;
    if (isRecordingVideo) {
      cameraRef.current?.stopRecording();
      return;
    }
    setIsRecordingVideo(true);
    setRecordingElapsedSec(0);
    if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current);
    recordingIntervalRef.current = setInterval(() => setRecordingElapsedSec((s) => s + 1), 1000);
    try {
      const video = await cameraRef.current?.recordAsync({ maxDuration: 60 });
      if (video?.uri) {
        setQuickCaptureActive(false);
        setVideoQueue((prev) => [...prev, { uri: video.uri, mimeType: "video/mp4" }]);
      }
    } catch {
      // kayit basarisiz/iptal - ekran acik kalir
    } finally {
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
        recordingIntervalRef.current = null;
      }
      setIsRecordingVideo(false);
    }
  }

  async function startVoiceRecording() {
    const perm = await requestRecordingPermissionsAsync();
    if (!perm.granted) {
      showAlert(t("dm.permissionRequiredTitle"), t("dm.micPermissionRequiredBody"));
      return;
    }
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await audioRecorder.prepareToRecordAsync();
    audioRecorder.record();
    waveHistoryRef.current = [];
    lastMeteringTickRef.current = -1;
    setVoiceRecording(true);
    setRecordingLocked(false);
    setRecordingPaused(false);
    setVoiceOnceView(false);
  }

  async function cancelVoiceRecording() {
    if (audioRecorder.isRecording) await audioRecorder.stop();
    setVoiceRecording(false);
    setRecordingLocked(false);
    setRecordingPaused(false);
  }

  function pauseResumeRecording() {
    if (recordingPaused) {
      audioRecorder.record();
      setRecordingPaused(false);
    } else {
      audioRecorder.pause();
      setRecordingPaused(true);
    }
  }

  async function sendVoiceRecording() {
    const durationMs = recorderState.durationMillis;
    const viewOnce = voiceOnceView;
    if (audioRecorder.isRecording) await audioRecorder.stop();
    setVoiceRecording(false);
    setRecordingLocked(false);
    setRecordingPaused(false);
    const uri = audioRecorder.uri;
    if (!uri || !myUserId) return;
    setSendingVoice(true);
    try {
      const arrayBuffer = await uriToArrayBuffer(uri);
      const path = `${myUserId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.m4a`;
      await uploadWithProgress("chat-media", path, arrayBuffer, "audio/m4a", () => {});
      const { data: publicUrlData } = supabase.storage.from("chat-media").getPublicUrl(path);
      socket.emit("group:sendVoice", { groupId: group.id, mediaUrl: publicUrlData.publicUrl, durationMs, viewOnce }, (res: any) => {
        if (res?.ok) setMessages((prev) => [...prev, res.message]);
        else showAlert(t("dm.sendFailedTitle"), res?.error || t("dm.genericSendErrorBody"));
      });
    } catch (err: any) {
      showAlert(t("dm.sendFailedTitle"), err?.message || t("dm.genericSendErrorBody"));
    } finally {
      setSendingVoice(false);
      setVoiceOnceView(false);
    }
  }

  const micPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        if (Platform.OS === "web" && typeof document !== "undefined") {
          (document.body.style as any).userSelect = "none";
        }
        recordLockedRef.current = false;
        recordDragX.setValue(0);
        recordDragY.setValue(0);
        startVoiceRecording();
      },
      onPanResponderMove: (_evt, g) => {
        if (recordLockedRef.current) return;
        recordDragX.setValue(Math.min(0, g.dx));
        recordDragY.setValue(Math.min(0, g.dy));
        if (-g.dy > LOCK_DRAG_THRESHOLD) {
          recordLockedRef.current = true;
          setRecordingLocked(true);
          Animated.spring(recordDragX, { toValue: 0, useNativeDriver: true }).start();
          Animated.spring(recordDragY, { toValue: 0, useNativeDriver: true }).start();
        }
      },
      onPanResponderRelease: (_evt, g) => {
        if (Platform.OS === "web" && typeof document !== "undefined") {
          (document.body.style as any).userSelect = "";
        }
        if (recordLockedRef.current) return;
        Animated.spring(recordDragX, { toValue: 0, useNativeDriver: true }).start();
        Animated.spring(recordDragY, { toValue: 0, useNativeDriver: true }).start();
        if (-g.dx > CANCEL_DRAG_THRESHOLD) cancelVoiceRecording();
        else sendVoiceRecording();
      },
      onPanResponderTerminate: () => {
        if (Platform.OS === "web" && typeof document !== "undefined") {
          (document.body.style as any).userSelect = "";
        }
        Animated.spring(recordDragX, { toValue: 0, useNativeDriver: true }).start();
        Animated.spring(recordDragY, { toValue: 0, useNativeDriver: true }).start();
        if (!recordLockedRef.current) cancelVoiceRecording();
      },
      // eslint-disable-next-line react-hooks/exhaustive-deps
    })
  ).current;

  const recordCancelHintOpacity = recordDragX.interpolate({
    inputRange: [-CANCEL_DRAG_THRESHOLD, -10, 0],
    outputRange: [0, 1, 1],
    extrapolate: "clamp",
  });

  if (voiceRecording && recorderState.durationMillis !== lastMeteringTickRef.current) {
    lastMeteringTickRef.current = recorderState.durationMillis;
    const db = recorderState.metering ?? -60;
    const norm = Math.min(1, Math.max(0, (db + 60) / 60));
    waveHistoryRef.current = [...waveHistoryRef.current, norm].slice(-WAVE_BAR_COUNT);
  }
  const waveHeights = Array.from({ length: WAVE_BAR_COUNT }, (_, i) => {
    const idx = waveHistoryRef.current.length - WAVE_BAR_COUNT + i;
    const norm = idx >= 0 ? waveHistoryRef.current[idx] : 0;
    return 4 + norm * 14;
  });

  const myGroupMemberIds = groupDetail.members.map((m) => m.userId);

  const actionMenuItems: { label: string; icon: React.ReactNode; danger?: boolean; onPress: () => void }[] = (() => {
    const m = actionMenuMessage;
    if (!m) return [];
    const isPinned = pinnedMessages.some((p) => p.message.id === m.id);
    const items: { label: string; icon: React.ReactNode; danger?: boolean; onPress: () => void }[] = [
      {
        label: t("dm.actionReply"),
        icon: (
          <View style={{ transform: [{ scaleX: -1 }] }}>
            <Icon name="undoArrow" size={25} color={TEXT} />
          </View>
        ),
        onPress: () => {
          startReply(m);
          closeActionMenu();
        },
      },
      { label: t("dm.actionCopy"), icon: <Copy size={25} color={TEXT} />, onPress: () => handleCopy(m) },
      {
        label: isPinned ? t("dm.actionUnpin") : t("dm.actionPin"),
        icon: isPinned ? <PinOff size={25} color={TEXT} /> : <Pin size={25} color={TEXT} />,
        onPress: () => handlePinToggle(m),
      },
      { label: t("dm.actionForward"), icon: <Icon name="undoArrow" size={25} color={TEXT} />, onPress: () => openForwardPicker(m) },
      { label: t("dm.actionDeleteForMe"), icon: <Trash2 size={25} color="#FF4D4F" />, danger: true, onPress: () => handleDeleteTap(m) },
    ];
    return items;
  })();

  return (
    <View style={styles.screen}>
      <AppBackground />
      <View style={styles.header}>
        {actionMenuMessage ? (
          <>
            <TouchableOpacity onPress={closeActionMenu} hitSlop={10} style={{ marginTop: 1 }}>
              <View style={{ transform: [{ rotate: "90deg" }] }}>
                <CircleArrowDown size={22} color="#FFFFFF" />
              </View>
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={styles.headerSelectionCountText}>1</Text>
            </View>
            {actionMenuItems.map((item) => (
              <TouchableOpacity key={item.label} onPress={item.onPress} hitSlop={10}>
                {item.icon}
              </TouchableOpacity>
            ))}
          </>
        ) : (
          <>
            <TouchableOpacity onPress={onBack} hitSlop={10} style={{ marginTop: 1 }}>
              <View style={{ transform: [{ rotate: "90deg" }] }}>
                <CircleArrowDown size={22} color="#FFFFFF" />
              </View>
            </TouchableOpacity>
            <TouchableOpacity style={styles.headerProfileTouch} activeOpacity={0.75} onPress={() => onOpenInfo?.(groupDetail)}>
              <View style={{ marginLeft: -1 }}>
                <Avatar name={groupDetail.name} avatarUrl={groupDetail.avatarUrl} size={46} />
              </View>
              <View style={styles.headerTextBlock}>
                <Text style={styles.headerName} numberOfLines={1}>
                  {groupDetail.name}
                </Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity onPress={placeholderCall} hitSlop={10}>
              <Phone size={25} color={TEXT} />
            </TouchableOpacity>
          </>
        )}
      </View>
      <LinearGradient colors={["#FFFFFF", "#38BDF8"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.headerDivider} />

      {pinnedMessages.length > 0 &&
        (() => {
          const orderedPins = [...pinnedMessages].sort((a, b) => a.message.createdAt - b.message.createdAt);
          const cursor = Math.min(pinnedCursor, orderedPins.length - 1);
          const shown = orderedPins[cursor].message;
          return (
            <TouchableOpacity
              style={styles.pinnedBanner}
              activeOpacity={0.75}
              onPress={() => {
                scrollToMessage(shown.id);
                setPinnedCursor(cursor === 0 ? orderedPins.length - 1 : cursor - 1);
              }}
            >
              <View style={styles.pinnedBannerQuote}>
                <Pin size={18} color="#FFFFFF" />
                <View style={styles.pinnedBannerQuoteText}>
                  <ReplyPreviewContent fromName={shown.fromUserId === myUserId ? t("dm.you") : shown.fromName} text={shown.text} kind={shown.kind} mediaUrl={shown.mediaUrl} viewOnce={shown.viewOnce} viewOnceConsumed={shown.viewOnceConsumed} stickerId={shown.stickerId} variant="bubble" />
                </View>
                <Text style={styles.pinnedBannerCounter}>
                  {cursor + 1}/{orderedPins.length}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })()}

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={styles.listContent}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        onScrollToIndexFailed={(info) => {
          listRef.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: false });
          const id = pendingScrollMessageId.current;
          if (id) setTimeout(() => scrollToMessage(id), 100);
        }}
        ListEmptyComponent={loading ? <LoadingView /> : null}
        ListHeaderComponent={
          <View style={styles.encryptionNoticeWrap}>
            <View style={styles.encryptionNotice}>
              <View style={styles.encryptionNoticeRow}>
                <View style={styles.encryptionNoticeIconWrap}>
                  <LockClosedIcon size={12} color="#FFFFFF" />
                </View>
                <Text style={styles.encryptionNoticeText}>{t("dm.encryptionNotice")}</Text>
              </View>
            </View>
          </View>
        }
        renderItem={({ item, index }) => {
          const isMine = item.fromUserId === myUserId;
          const prev = messages[index - 1];
          const groupedWithPrev = !!prev && prev.fromUserId === item.fromUserId;
          const rawReactions = reactionsByMessage[item.id] || {};
          const byEmoji = new Map<string, { count: number; mine: boolean }>();
          for (const [userId, emoji] of Object.entries(rawReactions)) {
            const entry = byEmoji.get(emoji) || { count: 0, mine: false };
            entry.count += 1;
            if (userId === myUserId) entry.mine = true;
            byEmoji.set(emoji, entry);
          }
          const reactions = Array.from(byEmoji.entries()).map(([emoji, v]) => ({ emoji, count: v.count, mine: v.mine }));
          return (
            <GroupBubbleRow
              item={item}
              isMine={isMine}
              groupedWithPrev={groupedWithPrev}
              sender={memberById.get(item.fromUserId)}
              reactions={reactions}
              onTap={() => handleMessageTap(item)}
              onLongPress={() => openActionMenu(item)}
              onReply={() => startReply(item)}
              onConsumeMediaOnce={handleConsumeMediaOnce}
              onVotePoll={votePoll}
              onReportUser={openReportSheet}
              onShowInChat={scrollToMessage}
            />
          );
        }}
      />

      <View
        style={[
          styles.inputBar,
          replyingTo && styles.inputBarWithReply,
          voiceRecording && recordingLocked && styles.inputBarLockedWrap,
        ]}
      >
        {voiceRecording && !recordingLocked && (
          <Animated.View pointerEvents="none" style={[styles.recordLockHintWrap, { transform: [{ translateY: recordDragY }] }]}>
            <View style={{ marginTop: 5, alignItems: "center" }}>
              <LockClosedIcon size={17} color="#FFFFFF" strokeWidth={2} />
              <ChevronUp size={15} color="#FFFFFF" style={{ marginTop: -2 }} />
            </View>
          </Animated.View>
        )}
        {voiceRecording && recordingLocked ? (
          <View style={styles.recordingLockedBar}>
            <View style={[styles.recordLockedTopRow, { transform: [{ translateY: -5 }] }]}>
              <View style={{ height: 58, justifyContent: "center", marginLeft: 6.9 }}>
                <Text style={[styles.recordingTimeLocked, { transform: [{ translateY: -1 }] }]}>
                  {formatRecordingTime(recorderState.durationMillis)}
                </Text>
              </View>
              <View style={styles.recordLiveWave}>
                {waveHeights.map((h, i) => (
                  <View key={i} style={[styles.recordLiveWaveBar, { height: h }]} />
                ))}
              </View>
              <TouchableOpacity
                onPress={() => setVoiceOnceView((v) => !v)}
                hitSlop={8}
                style={{ width: 58, height: 58, marginRight: -1.5, alignItems: "center", justifyContent: "center" }}
              >
                {voiceOnceView ? <VoiceOnceFilledIcon size={58} color="#FFFFFF" /> : <VoiceOnceRingIcon size={58} color={MUTED} />}
              </TouchableOpacity>
            </View>
            <View style={styles.recordLockedBottomRow}>
              <TouchableOpacity onPress={cancelVoiceRecording} hitSlop={8} style={[styles.inputRoundBtn, { backgroundColor: "#FF4D4F" }]}>
                <Trash2 size={20} color="#FFFFFF" />
              </TouchableOpacity>
              <TouchableOpacity onPress={pauseResumeRecording} hitSlop={8} style={styles.recordPausePill}>
                {recordingPaused ? <Play size={20} color={TEXT} /> : <Pause size={20} color={TEXT} />}
                <Text style={[styles.recordPausePillText, { transform: [{ translateY: 1 }] }]}>
                  {recordingPaused ? t("dm.recordResume") : t("dm.recordPause")}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.inputRoundBtn} onPress={sendVoiceRecording} disabled={sendingVoice} hitSlop={8}>
                {sendingVoice ? <ActivityIndicator size="small" color="#141210" /> : <Send size={20} color="#141210" />}
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <>
            <View style={[styles.inputPill, voiceRecording ? styles.inputPillNormal : replyingTo ? styles.inputPillWithReply : styles.inputPillNormal, voiceRecording && styles.recordingPill]}>
              {voiceRecording ? (
                <>
                  <TouchableOpacity onPress={cancelVoiceRecording} hitSlop={8}>
                    <Trash2 size={20} color={MUTED} />
                  </TouchableOpacity>
                  <View style={styles.recordingDot} />
                  <Text style={styles.recordingTime}>{formatRecordingTime(recorderState.durationMillis)}</Text>
                  <View style={{ flex: 1 }} />
                  <Animated.Text
                    style={[styles.recordCancelHintText, { opacity: recordCancelHintOpacity, transform: [{ translateX: Animated.add(recordDragX, -15) }] }]}
                    numberOfLines={1}
                  >
                    {"‹ " + t("dm.recordSlideToCancel")}
                  </Animated.Text>
                </>
              ) : (
                <>
                  {replyingTo && (
                    <View style={styles.replyPreviewCard}>
                      <View style={styles.replyBarAccent} />
                      <View style={styles.replyBarText}>
                        <ReplyPreviewContent fromName={replyingTo.fromName} text={replyingTo.text} kind={replyingTo.kind} mediaUrl={replyingTo.mediaUrl} viewOnce={replyingTo.viewOnce} stickerId={replyingTo.stickerId} variant="composer" />
                      </View>
                      <TouchableOpacity onPress={() => setReplyingTo(null)} hitSlop={8} style={styles.replyBarClose}>
                        <Icon name="close" size={16} color={MUTED} />
                      </TouchableOpacity>
                    </View>
                  )}
                  <View style={styles.inputIconsRow}>
                    <TouchableOpacity
                      onPress={() => {
                        Keyboard.dismiss();
                        setAttachSheetVisible(false);
                        setEmojiPanelVisible((v) => !v);
                      }}
                      hitSlop={6}
                    >
                      <Laugh size={25} color="#9CA3AF" />
                    </TouchableOpacity>
                    <TextInput
                      style={styles.input}
                      value={input}
                      onChangeText={setInput}
                      placeholder={t("dm.messagePlaceholder")}
                      placeholderTextColor={MUTED}
                      onSubmitEditing={sendMessage}
                      onFocus={() => {
                        setAttachSheetVisible(false);
                        setEmojiPanelVisible(false);
                      }}
                    />
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginLeft: -33 }}>
                      <TouchableOpacity
                        onPress={() => {
                          Keyboard.dismiss();
                          setEmojiPanelVisible(false);
                          setAttachSheetVisible((v) => !v);
                        }}
                        hitSlop={6}
                      >
                        <View style={{ transform: [{ rotate: "-45deg" }] }}>
                          <Paperclip size={23} color="#9CA3AF" strokeWidth={1.7} />
                        </View>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={startQuickCapture} hitSlop={6} style={{ marginLeft: 5 }}>
                        <SimpleLineIcons name="camera" size={25} color="#9CA3AF" />
                      </TouchableOpacity>
                    </View>
                  </View>
                </>
              )}
            </View>
            {!voiceRecording && input.trim() ? (
              <TouchableOpacity style={styles.inputRoundBtn} onPress={sendMessage} hitSlop={8}>
                <Send size={20} color="#141210" />
              </TouchableOpacity>
            ) : (
              <View style={styles.inputRoundBtn} {...micPan.panHandlers}>
                <MicrophoneIcon size={22.5} color="#141210" strokeWidth={2} />
              </View>
            )}
          </>
        )}
      </View>

      {attachSheetVisible && (
        <View style={styles.attachSheet}>
          <View style={styles.attachGrid}>
            <TouchableOpacity style={styles.attachGridItem} onPress={pickImage}>
              <View style={styles.attachIconWrap}>
                <ImageIcon size={26} color="#FFFFFF" />
              </View>
              <Text style={styles.attachGridText}>{t("dm.attachGallery")}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.attachGridItem} onPress={openLocationPicker}>
              <View style={styles.attachIconWrap}>
                <MapPin size={26} color="#FFFFFF" />
              </View>
              <Text style={styles.attachGridText}>{t("dm.attachLocation")}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.attachGridItem} onPress={openFilePreview}>
              <View style={styles.attachIconWrap}>
                <FileTextIcon size={26} color="#FFFFFF" />
              </View>
              <Text style={styles.attachGridText}>{t("dm.attachFile")}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.attachGridItem} onPress={openPollComposer}>
              <View style={styles.attachIconWrap}>
                <BarChart2 size={26} color="#FFFFFF" />
              </View>
              <Text style={styles.attachGridText}>{t("dm.attachPoll")}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.attachGridItem} onPress={openMusicPicker}>
              <View style={styles.attachIconWrap}>
                <Music size={26} color="#FFFFFF" />
              </View>
              <Text style={styles.attachGridText}>{t("dm.attachMusic")}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.attachGridItem} onPress={openContactPicker}>
              <View style={styles.attachIconWrap}>
                <UserIcon size={26} color="#FFFFFF" />
              </View>
              <Text style={styles.attachGridText}>{t("dm.attachContact")}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {emojiPanelVisible && <View style={{ height: EMOJI_PANEL_BASE_HEIGHT }} />}
      {emojiPanelVisible && (
        <EmojiKeyboardPanel
          onSelect={insertEmoji}
          onSendSticker={sendSticker}
          customStickers={customStickers}
          onCreateSticker={createSticker}
          creatingSticker={creatingSticker}
          customGifs={customGifs}
          onCreateGif={createGif}
          creatingGif={creatingGif}
        />
      )}

      {quickCaptureActive && cameraPermission?.granted && (
        <View style={styles.quickCameraOverlay}>
          <CameraView ref={cameraRef} style={styles.quickCameraView} facing={quickCameraFacing} flash={quickCameraFlash} onCameraReady={handleQuickCameraReady} />
          <View style={styles.quickCameraTopBar}>
            <TouchableOpacity style={styles.quickCameraTopBtn} onPress={() => setQuickCaptureActive(false)} hitSlop={10}>
              <Icon name="close" size={28} color="#FFFFFF" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.quickCameraTopBtn} onPress={toggleQuickCameraFlash} hitSlop={10}>
              <Ionicons name={quickCameraFlash === "on" ? "flash-outline" : "flash-off-outline"} size={26} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          {isRecordingVideo && (
            <View style={styles.quickCameraRecTimerWrap} pointerEvents="none">
              <View style={styles.quickCameraRecTimerPill}>
                <View style={styles.quickCameraRecDot} />
                <Text style={styles.quickCameraRecTimerText}>{formatRecordingTime(recordingElapsedSec * 1000)}</Text>
              </View>
            </View>
          )}

          <View style={styles.quickCameraFilmstripWrap} pointerEvents="box-none">
            <CameraFilmstrip visible={quickCaptureActive} onOpenGallery={handleQuickGalleryPress} onPickAsset={handleFilmstripPickAsset} />
          </View>

          <View style={styles.quickCameraBottomBar}>
            <TouchableOpacity style={styles.quickCameraTopBtn} onPress={handleQuickGalleryPress} hitSlop={10}>
              <ImageIcon size={24} color="#FFFFFF" />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.quickCameraShutterOuter, quickCameraMode === "video" && styles.quickCameraShutterOuterVideo]}
              onPress={handleQuickShutterPress}
              disabled={!quickCameraReady || (quickCameraMode === "photo" && capturingQuickPhoto)}
              hitSlop={8}
            >
              <View
                style={[
                  styles.quickCameraShutterInner,
                  quickCameraMode === "video" && styles.quickCameraShutterInnerVideo,
                  capturingQuickPhoto && styles.quickCameraShutterInnerActive,
                  isRecordingVideo && styles.quickCameraShutterInnerRecording,
                ]}
              />
            </TouchableOpacity>
            <TouchableOpacity style={styles.quickCameraTopBtn} onPress={toggleQuickCameraFacing} disabled={isRecordingVideo} hitSlop={10}>
              <MaterialCommunityIcons name="camera-flip-outline" size={26} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          <View style={styles.quickCameraModeRow}>
            <TouchableOpacity onPress={() => !isRecordingVideo && setQuickCameraMode("video")} hitSlop={10}>
              <Text style={[styles.quickCameraModeText, quickCameraMode === "video" && styles.quickCameraModeTextActive]}>{t("dm.cameraModeVideo")}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => !isRecordingVideo && setQuickCameraMode("photo")} hitSlop={10}>
              <Text style={[styles.quickCameraModeText, quickCameraMode === "photo" && styles.quickCameraModeTextActive]}>{t("dm.cameraModePhoto")}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <SendMediaSheet
        visible={pendingImages.length > 0}
        images={pendingImages}
        uploading={uploadingImage}
        uploadProgress={uploadProgress}
        onCancel={() => setPendingImages([])}
        onRemoveImage={removePendingImage}
        onAddMore={pickImage}
        onReplaceImage={replacePendingImage}
        onSend={sendPickedImage}
      />

      <SendVideoSheet
        visible={videoQueue.length > 0}
        uri={videoQueue[0]?.uri ?? null}
        uploading={uploadingVideo}
        uploadProgress={videoUploadProgress}
        onCancel={() => setVideoQueue((prev) => prev.slice(1))}
        onSend={(caption, meta) => sendPickedVideo(videoQueue[0].uri, videoQueue[0].mimeType, caption, meta)}
      />

      <LocationPickerModal visible={locationPickerVisible} onClose={() => setLocationPickerVisible(false)} onConfirm={handleLocationPickerConfirm} />

      <FilePreviewModal
        visible={filePreviewVisible}
        title={pendingAttachKind === "music" ? t("dm.musicPreviewTitle") : undefined}
        recentSectionLabel={pendingAttachKind === "music" ? t("dm.musicRecentSection") : undefined}
        selectedCountLabel={pendingAttachKind === "music" ? t("dm.musicSelectedCount", { count: selectedMusicUris.length }) : undefined}
        files={pendingFiles}
        caption={fileCaption}
        onChangeCaption={setFileCaption}
        uploading={sendingFile}
        uploadProgress={fileUploadProgress}
        recentFiles={pendingAttachKind === "music" ? recentMusic : recentFiles}
        selectionMode={pendingAttachKind === "music" ? musicSelectionMode : recentSelectionMode}
        selectedUris={pendingAttachKind === "music" ? selectedMusicUris : selectedRecentUris}
        onPressRecent={pendingAttachKind === "music" ? handlePressRecentMusic : handlePressRecent}
        onLongPressRecent={pendingAttachKind === "music" ? handleLongPressRecentMusic : handleLongPressRecent}
        onExitSelection={pendingAttachKind === "music" ? exitMusicSelection : exitRecentSelection}
        onConfirmSelection={pendingAttachKind === "music" ? confirmMusicSelection : confirmRecentSelection}
        onPickFile={pendingAttachKind === "music" ? pickMusicFile : pickFile}
        onBackToList={backToFileList}
        onCancel={cancelPendingFile}
        onSend={confirmSendFile}
      />

      <PollComposerModal visible={pollComposerVisible} sending={sendingPoll} onCancel={() => setPollComposerVisible(false)} onSend={sendPoll} />

      <Modal visible={reportVisible} transparent animationType="slide" onRequestClose={() => setReportVisible(false)} statusBarTranslucent>
        <TouchableOpacity style={styles.sheetOverlay} activeOpacity={1} onPress={() => setReportVisible(false)}>
          <TouchableOpacity activeOpacity={1} style={styles.sheetCard}>
            <View style={styles.sheetHandleTop} />
            <Text style={styles.sheetTitle}>{t("dm.reportTitle", { name: reportTarget?.name })}</Text>
            <Text style={styles.sheetSubtitle}>{t("dm.reportSubtitle")}</Text>
            <TextInput
              style={styles.reportInput}
              value={reportReason}
              onChangeText={setReportReason}
              placeholder={t("dm.reportPlaceholder")}
              placeholderTextColor={MUTED}
              multiline
              autoFocus
            />
            <LinearGradient
              colors={["#FFFFFF", "#38BDF8"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[styles.reportSubmitGradientBorder, !reportReason.trim() && styles.reportSubmitBtnDisabled]}
            >
              <TouchableOpacity style={styles.reportSubmitBtnDark} onPress={submitReport} disabled={!reportReason.trim()}>
                <Text style={styles.reportSubmitBtnDarkText}>{t("dm.reportSend")}</Text>
              </TouchableOpacity>
            </LinearGradient>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <Modal visible={!!forwardTarget} animationType="slide" onRequestClose={() => setForwardTarget(null)} statusBarTranslucent>
        <FriendsScreen
          onBack={() => setForwardTarget(null)}
          onOpenDM={() => {}}
          onOpenParticipant={() => {}}
          inviteMode
          hideInviteExtras
          headerTitle={t("dm.forwardTitle")}
          confirmButtonLabel={(count) => t("dm.forwardSendCount", { count })}
          onSendInvites={forwardToUsers}
        />
      </Modal>

      <Modal visible={contactPickerVisible} animationType="slide" onRequestClose={() => setContactPickerVisible(false)} statusBarTranslucent>
        <FriendsScreen
          onBack={() => setContactPickerVisible(false)}
          onOpenDM={() => {}}
          onOpenParticipant={() => {}}
          inviteMode
          hideInviteExtras
          excludeUserIds={myGroupMemberIds}
          headerTitle={t("dm.contactPickerTitle")}
          confirmButtonLabel={(count) => t("dm.contactShareSendCount", { count })}
          onSendInvites={sendContacts}
        />
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "transparent" },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 18, paddingTop: 44, paddingBottom: 14, height: 104 },
  headerDivider: { height: 1, width: "100%" },
  headerProfileTouch: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  headerTextBlock: { flex: 1, marginLeft: -2 },
  headerName: { color: TEXT, fontSize: 18, fontWeight: "700" },
  headerSelectionCountText: { color: TEXT, fontSize: 20, fontWeight: "700" },
  listContent: { padding: 16, paddingBottom: 1, gap: 4 },
  encryptionNoticeWrap: { alignItems: "center", paddingHorizontal: 20, marginTop: -6, paddingTop: 1, paddingBottom: 7 },
  encryptionNotice: { alignItems: "center", backgroundColor: "#15202B", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, maxWidth: 320 },
  encryptionNoticeRow: { alignItems: "center" },
  encryptionNoticeIconWrap: { marginBottom: 6 },
  encryptionNoticeText: { color: "#FFFFFF", fontSize: 12, lineHeight: 17, textAlign: "center" },
  messageRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, maxWidth: "100%" },
  messageRowNewGroup: { marginTop: 8 },
  messageRowMine: { justifyContent: "flex-end" },
  messageRowTheirs: { justifyContent: "flex-start" },
  senderAvatarWrap: { width: 28 },
  senderAvatarSpacer: { width: 28, height: 28 },
  bubbleCol: { maxWidth: "75%" },
  senderName: { fontSize: 13, fontWeight: "700", marginBottom: 2 },
  bubbleWrap: { position: "relative" },
  bubble: { paddingHorizontal: 13, paddingVertical: 8, borderRadius: 8, position: "relative" },
  bubbleMineFirst: { borderTopRightRadius: 0 },
  bubbleTheirsFirst: { borderTopLeftRadius: 0 },
  bubbleTailSvg: { position: "absolute", top: 0 },
  bubbleTailSvgMine: { right: -6 },
  bubbleTailSvgTheirs: { left: -6 },
  bubbleVoicePad: { paddingTop: 13, paddingBottom: 10 },
  bubbleLocationPad: { paddingLeft: 3, paddingRight: 3, paddingTop: 3 },
  bubbleFilePad: { paddingLeft: 3, paddingRight: 3, paddingTop: 3, paddingBottom: 3 },
  bubblePollPad: { paddingLeft: 3, paddingRight: 3, paddingTop: 3, paddingBottom: 3 },
  bubbleContactPad: { paddingLeft: 3, paddingRight: 3, paddingTop: 3, paddingBottom: 3 },
  bubbleMusicPad: { paddingLeft: 3, paddingRight: 3, paddingTop: 3, paddingBottom: 3 },
  bubblePhotoPad: { paddingLeft: 3, paddingRight: 3, paddingTop: 3, paddingBottom: 3, width: 286 },
  bubbleStickerNoBg: { backgroundColor: "transparent", padding: 0 },
  bubbleMine: { backgroundColor: BUBBLE_MINE_COLOR },
  bubbleTheirs: { backgroundColor: "#1E293B" },
  bubbleText: { color: TEXT, fontSize: 16, lineHeight: 21 },
  mediaCaption: { color: TEXT, fontSize: 14, marginTop: 6, paddingHorizontal: 2 },
  deletedRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 2 },
  deletedText: { fontSize: 14, fontStyle: "italic" },
  // Tek-gorunumluk foto/video HENUZ acilmadiysa gosterilen satir - kullanici
  // istegi: "fotoğrafsa fotoğraf videoysa video... yazdığımız bir mesaj
  // balonu" + yaninda "1" rozeti (VoiceOnceRingIcon, kayit cubugundaki ile
  // AYNI gorsel).
  viewOnceUnopenedRow: { flexDirection: "row", alignItems: "center", gap: 8, marginLeft: -10 },
  // Kullanici istegi: kendi mesajimdaki rozet+metin+saat fotograf VE video
  // icin AYNI sekilde kaydirilsin. marginLeft DEGIL transform kullanildi:
  // negatif margin balonun auto-width
  // hesaplamasini da kuculttup balonu saga kaydiriyordu (kullanici
  // sikayeti) - transform sadece GORSEL olarak kaydirir, layout/genislik
  // etkilenmez.
  viewOnceUnopenedRowMineShift: { transform: [{ translateX: 0 }] },
  // Rozet (40px) metnin satir yuksekliginden (21px) buyuk oldugu icin, balon
  // yuksekligi bozulmasin diye rozeti sabit 21px'lik bir kutu icinde
  // ortalayip tasiriyoruz (overflow visible) - boylece balonun toplam
  // yuksekligi duz metin balonuyla AYNI kaliyor.
  viewOnceUnopenedIconWrap: { height: 21, justifyContent: "center", alignItems: "center", overflow: "visible" },
  viewOnceUnopenedText: { fontSize: 16, lineHeight: 21, marginLeft: -10 },
  viewOnceUnopenedTime: { marginTop: 22 },
  forwardedRow: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 3 },
  forwardedText: { fontSize: 11, fontWeight: "500" },
  replyQuote: {
    backgroundColor: "rgba(255,255,255,0.14)",
    borderLeftWidth: 3,
    borderLeftColor: "rgba(255,255,255,0.85)",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    marginHorizontal: -7,
    marginTop: -2,
    marginBottom: 4,
  },
  reactionBadgeRow: { position: "absolute", flexDirection: "row", gap: 2 },
  reactionBadgeRowMine: { left: 9, bottom: 5 },
  reactionBadgeRowTheirs: { left: 9, bottom: 5 },
  reactionBadgeChip: {
    height: 19,
    paddingHorizontal: 6,
    borderRadius: 999,
    borderWidth: 1.4,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#000000",
    borderColor: "#FFFFFF",
  },
  reactionBadgeEmoji: { fontSize: 12 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 3, alignSelf: "flex-end" },
  metaRowVoice: { alignSelf: "stretch", justifyContent: "space-between", marginTop: -4 },
  metaRowPhotoOverlay: {
    position: "absolute",
    bottom: 8,
    right: 8,
    marginTop: 0,
    backgroundColor: "rgba(0,0,0,0.45)",
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  metaRowMusicOverlay: { position: "absolute", bottom: 4, right: 10, marginTop: 0 },
  metaRowPollOverlay: { position: "absolute", bottom: 8, right: 10, marginTop: 0 },
  metaRowContactOverlay: { position: "absolute", bottom: 8, right: 10, marginTop: 0 },
  metaRowFileOverlay: { position: "absolute", bottom: 8, right: 10, marginTop: 0 },
  metaRowStickerOverlay: {
    position: "absolute",
    bottom: 6,
    right: 6,
    marginTop: 0,
    backgroundColor: "rgba(0,0,0,0.45)",
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  metaTime: { color: "rgba(255,255,255,0.65)", fontSize: 11 },
  voiceMetaTime: { color: "rgba(255,255,255,0.65)", fontSize: 11, marginLeft: 38 },
  inputBar: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 15 },
  inputBarWithReply: { alignItems: "flex-end" },
  inputBarLockedWrap: { paddingHorizontal: 0, paddingTop: 0, paddingBottom: 0 },
  inputPill: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#15202B", borderRadius: 27.5, paddingLeft: 14, paddingRight: 10 },
  inputPillNormal: { height: 55 },
  inputPillWithReply: { flexDirection: "column", alignItems: "stretch", paddingLeft: 0, paddingRight: 0, paddingBottom: 0 },
  recordingPill: { flexDirection: "row", alignItems: "center", gap: 10 },
  recordingDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#FF4D4F" },
  recordingTime: { color: TEXT, fontSize: 15, fontWeight: "600" },
  recordingTimeLocked: { color: TEXT, fontSize: 20, fontWeight: "600" },
  recordCancelHintText: { color: MUTED, fontSize: 13, fontWeight: "500" },
  recordLockHintWrap: {
    position: "absolute",
    right: 19.5,
    bottom: 84,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#1E293B",
    alignItems: "center",
    justifyContent: "center",
  },
  recordingLockedBar: {
    width: "100%",
    height: 150,
    flexDirection: "column",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 24,
    backgroundColor: "#15202B",
  },
  recordLockedTopRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  recordLiveWave: { flex: 1, flexDirection: "row", alignItems: "center", gap: 1.5, height: 18 },
  recordLiveWaveBar: { flex: 1, borderRadius: 1, backgroundColor: MUTED },
  recordLockedBottomRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  recordPausePill: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    width: 260,
    height: 55,
    borderRadius: 27.5,
    backgroundColor: "#55555A",
  },
  recordPausePillText: { color: TEXT, fontSize: 14, fontWeight: "600" },
  inputIconsRow: { height: 55, flexDirection: "row", alignItems: "center", gap: 10, paddingLeft: 14, paddingRight: 10, marginLeft: -15 },
  input: { flex: 1, color: TEXT, fontSize: 14, paddingTop: 7, paddingBottom: 6, outlineWidth: 0, outlineStyle: "none" } as any,
  inputRoundBtn: { width: 55, height: 55, borderRadius: 27.5, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  replyPreviewCard: {
    flexDirection: "row",
    alignItems: "stretch",
    backgroundColor: "#4A4A50",
    borderRadius: 10,
    overflow: "hidden",
    marginHorizontal: 8,
    marginTop: 3,
    transform: [{ translateY: 6 }],
  },
  replyBarAccent: { width: 4, backgroundColor: "#FFFFFF" },
  replyBarText: { flex: 1, paddingVertical: 12, paddingHorizontal: 10 },
  replyBarClose: { paddingHorizontal: 12, justifyContent: "flex-start", paddingTop: 12 },
  pinnedBanner: {
    flexDirection: "row",
    padding: 3,
    backgroundColor: "rgba(14,165,233,0.10)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(14,165,233,0.16)",
  },
  pinnedBannerQuote: {
    position: "relative",
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(255,255,255,0.14)",
    borderLeftWidth: 3,
    borderLeftColor: "#FFFFFF",
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  pinnedBannerCounter: { position: "absolute", top: 5, right: 8, color: "rgba(255,255,255,0.7)", fontSize: 11, fontWeight: "600" },
  pinnedBannerQuoteText: { flex: 1, minWidth: 0, paddingRight: 26 },
  attachSheet: { backgroundColor: "#15202B", height: 300, paddingTop: 18, paddingHorizontal: 20, alignItems: "center" },
  attachGrid: { width: "100%", flexDirection: "row", flexWrap: "wrap" },
  attachGridItem: { width: "33.33%", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 16 },
  attachIconWrap: { width: 64, height: 64, borderRadius: 32, backgroundColor: "rgba(14,165,233,0.12)", alignItems: "center", justifyContent: "center" },
  attachGridText: { color: TEXT, fontSize: 13, fontWeight: "600" },
  quickCameraOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "#000000" },
  quickCameraView: { flex: 1, marginTop: 50, marginBottom: 70 },
  quickCameraTopBar: { position: "absolute", top: 70, left: 16, right: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  quickCameraRecTimerWrap: { position: "absolute", top: 70, left: 0, right: 0, height: 36, alignItems: "center", justifyContent: "center" },
  quickCameraRecTimerPill: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(0,0,0,0.5)", borderRadius: 14, paddingHorizontal: 10, paddingVertical: 6 },
  quickCameraRecDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#FF3B30" },
  quickCameraRecTimerText: { color: "#FFFFFF", fontSize: 13, fontWeight: "700" },
  quickCameraTopBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center" },
  quickCameraFilmstripWrap: { position: "absolute", bottom: 168, left: 0, right: 0 },
  quickCameraBottomBar: { position: "absolute", bottom: 86, left: 16, right: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  quickCameraShutterOuter: { width: 72, height: 72, borderRadius: 36, borderWidth: 4, borderColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  quickCameraShutterInner: { width: 58, height: 58, borderRadius: 29, backgroundColor: "#FFFFFF" },
  quickCameraShutterInnerActive: { backgroundColor: "rgba(255,255,255,0.5)" },
  quickCameraShutterOuterVideo: { borderColor: "#FF3B30" },
  quickCameraShutterInnerVideo: { backgroundColor: "#FF3B30" },
  quickCameraShutterInnerRecording: { width: 28, height: 28, borderRadius: 6 },
  quickCameraModeRow: { position: "absolute", bottom: 50, left: 0, right: 0, flexDirection: "row", justifyContent: "center", gap: 24 },
  quickCameraModeText: { color: "rgba(255,255,255,0.55)", fontSize: 13, fontWeight: "700" },
  quickCameraModeTextActive: { color: "#FFFFFF" },
  // Tek-gorunumluk medya goruntuyecisindeki "Bildir" sheet'i -
  // DMScreen.tsx'teki AYNI stiller.
  sheetOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheetCard: {
    backgroundColor: "#15202B",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingTop: 18,
    paddingBottom: 30,
    paddingHorizontal: 20,
    alignItems: "center",
  },
  sheetTitle: { color: TEXT, fontSize: 16, fontWeight: "700", marginBottom: 4, alignSelf: "flex-start" },
  sheetSubtitle: { color: MUTED, fontSize: 12, marginBottom: 14, alignSelf: "flex-start" },
  sheetHandleTop: { width: 40, height: 4, borderRadius: 2, backgroundColor: "#3A4C5E", marginBottom: 14 },
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
  reportSubmitGradientBorder: { alignSelf: "stretch", borderRadius: 10, padding: 2, marginTop: 14 },
  reportSubmitBtnDisabled: { opacity: 0.4 },
  reportSubmitBtnDark: { backgroundColor: "#000000", borderRadius: 8, paddingVertical: 14, alignItems: "center" },
  reportSubmitBtnDarkText: { color: "#FFFFFF", fontSize: 14, fontWeight: "800", letterSpacing: 0.2, textTransform: "uppercase" },
});
