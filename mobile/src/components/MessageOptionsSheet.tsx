import { useMemo, useState } from "react";
import { Modal, View, Text, TextInput, TouchableOpacity, StyleSheet, FlatList } from "react-native";
import { BlurView } from "expo-blur";
import Icon from "./Icon";
import Avatar from "./Avatar";
import { ALL_EMOJIS } from "../data/emojiCategories";
import { searchEmojis } from "../data/emojiSearch";
import type { ChatMessage } from "../services/socket";

const COLS = 7;
const ALL_EMOJI_LIST = ALL_EMOJIS.map((e) => e.emoji);
const QUICK_EMOJIS = ["😂", "❤️", "😮", "😢", "🙏", "👍"];

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

interface Props {
  visible: boolean;
  message: ChatMessage | null;
  onClose: () => void;
  onCopy: () => void;
  onReply: () => void;
  onReport: () => void;
  onSelectEmoji: (emoji: string) => void;
}

/** Rave'deki gibi bir mesaja BASILI TUTUNCA acilan kart - artik mesajin
 * oldugu yerde "asili" degil, ekranin ALTINA sabit bir panel (bottom sheet)
 * olarak aciliyor: mesaj sohbetin neresinde olursa olsun konum hep ayni ve
 * ongorulebilir. Varsayilan halde sadece 6 hizli tepki emojisi gosterilir -
 * arama butonuna basilinca TAM emoji klavyesi (ayni veri kaynagi,
 * EmojiPickerSheet'teki gibi) bu panelin icinde acilir. */
export default function MessageOptionsSheet({ visible, message, onClose, onCopy, onReply, onReport, onSelectEmoji }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState("");
  const searching = query.trim().length > 0;
  const emojis = useMemo(() => (searching ? searchEmojis(query) : ALL_EMOJI_LIST), [query, searching]);

  function handleClose() {
    setExpanded(false);
    setQuery("");
    onClose();
  }

  function collapse() {
    setExpanded(false);
    setQuery("");
  }

  if (!message) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={handleClose}>
        <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} pointerEvents="none" />

        <TouchableOpacity activeOpacity={1} style={styles.sheet} onPress={() => {}}>
          <View style={styles.handle} />

          <View style={styles.previewRow}>
            <Avatar name={message.from || "?"} avatarUrl={message.fromAvatarUrl} size={34} />
            <View style={styles.previewTextCol}>
              <Text style={styles.previewText} numberOfLines={4}>
                <Text style={styles.previewFrom}>{message.from}: </Text>
                {message.text}
              </Text>
              <Text style={styles.previewTime}>{formatTime(message.ts)}</Text>
            </View>
          </View>

          <View style={styles.divider} />

          {expanded ? (
            <>
              <View style={styles.searchBar}>
                <TouchableOpacity onPress={collapse} hitSlop={10} accessibilityLabel="Hızlı tepkilere dön">
                  <Icon name="close" size={16} color="rgba(255,255,255,0.7)" />
                </TouchableOpacity>
                <Icon name="search" size={14} color="rgba(255,255,255,0.6)" />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Ara"
                  placeholderTextColor="rgba(255,255,255,0.5)"
                  style={styles.searchInput}
                  autoCorrect={false}
                  autoFocus
                />
              </View>
              {searching && emojis.length === 0 ? (
                <Text style={styles.noResults}>Sonuç bulunamadı</Text>
              ) : (
                <FlatList
                  data={emojis}
                  keyExtractor={(e, i) => `${e}-${i}`}
                  numColumns={COLS}
                  renderItem={({ item }) => (
                    <TouchableOpacity style={styles.emojiCell} onPress={() => onSelectEmoji(item)}>
                      <Text style={styles.emojiText}>{item}</Text>
                    </TouchableOpacity>
                  )}
                  initialNumToRender={28}
                  windowSize={6}
                  style={styles.emojiGridList}
                  contentContainerStyle={styles.emojiGrid}
                  keyboardShouldPersistTaps="handled"
                />
              )}
            </>
          ) : (
            <>
              <View style={styles.quickRow}>
                {QUICK_EMOJIS.map((emoji) => (
                  <TouchableOpacity key={emoji} style={styles.quickEmoji} onPress={() => onSelectEmoji(emoji)}>
                    <Text style={styles.quickEmojiText}>{emoji}</Text>
                  </TouchableOpacity>
                ))}
                <View style={styles.quickDivider} />
                <TouchableOpacity
                  style={styles.expandButton}
                  onPress={() => setExpanded(true)}
                  hitSlop={6}
                  accessibilityLabel="Tüm emojileri ara"
                >
                  <Icon name="search" size={16} color="rgba(255,255,255,0.7)" />
                </TouchableOpacity>
              </View>

              <View style={styles.divider} />

              <View style={styles.actionsList}>
                <TouchableOpacity style={styles.actionRow} onPress={onCopy}>
                  <Icon name="clipboard" size={18} color="#FFFFFF" />
                  <Text style={styles.actionLabel}>Kopyala</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionRow} onPress={onReply}>
                  <Icon name="reply" size={18} color="#FFFFFF" />
                  <Text style={styles.actionLabel}>Yanıtla</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.actionRow, styles.actionRowLast]} onPress={onReport}>
                  <Icon name="warning" size={18} color="#FFFFFF" />
                  <Text style={styles.actionLabel}>Bildir</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end" },
  sheet: {
    backgroundColor: "#1C1C1E",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingBottom: 26,
    maxHeight: "72%",
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.25)", alignSelf: "center", marginTop: 10, marginBottom: 6 },
  previewRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, paddingHorizontal: 16, paddingVertical: 10 },
  previewTextCol: { flex: 1, gap: 2 },
  previewText: { color: "#FFFFFF", fontSize: 13, lineHeight: 17 },
  previewFrom: { fontWeight: "700" },
  previewTime: { color: "rgba(255,255,255,0.5)", fontSize: 10 },
  divider: { height: 1, backgroundColor: "rgba(255,255,255,0.08)", marginHorizontal: 16 },
  quickRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12 },
  quickEmoji: { width: 32, height: 32, justifyContent: "center", alignItems: "center" },
  quickEmojiText: { fontSize: 22 },
  quickDivider: { width: 1, height: 20, backgroundColor: "rgba(255,255,255,0.14)" },
  expandButton: { width: 32, height: 32, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.08)", justifyContent: "center", alignItems: "center" },
  actionsList: { paddingHorizontal: 16 },
  actionRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderColor: "rgba(255,255,255,0.07)" },
  actionRowLast: { borderBottomWidth: 0 },
  actionLabel: { color: "#FFFFFF", fontSize: 14, fontWeight: "500" },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 8,
  },
  searchInput: { flex: 1, color: "#FFFFFF", fontSize: 13, outlineWidth: 0, outlineStyle: "none" } as any,
  noResults: { color: "rgba(255,255,255,0.6)", fontSize: 12, fontWeight: "500", textAlign: "center", marginTop: 32, marginBottom: 20 },
  emojiGridList: { maxHeight: 220 },
  emojiGrid: { paddingHorizontal: 8, paddingBottom: 12 },
  emojiCell: { flex: 1, height: 38, borderRadius: 9, justifyContent: "center", alignItems: "center" },
  emojiText: { fontSize: 22 },
});
