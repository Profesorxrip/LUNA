import { useMemo, useState } from "react";
import { Modal, View, Text, TextInput, TouchableOpacity, StyleSheet, FlatList, useWindowDimensions } from "react-native";
import { BlurView } from "expo-blur";
import Icon from "./Icon";
import Avatar from "./Avatar";
import { theme } from "../theme";
import { ALL_EMOJIS } from "../data/emojiCategories";
import { searchEmojis } from "../data/emojiSearch";
import type { ChatMessage } from "../services/socket";

const COLS = 7;
const DEFAULT_EMOJIS = ALL_EMOJIS.map((e) => e.emoji);
// Mesaj onizleme karti + Kopyala/Yanitla/Bildir satiri icin ayrilan asgari
// alan - basilan mesaj ekranin cok asagisindaysa kart bu kadar yukselige
// SIGACAK sekilde yukari ittiriliyor (bkz. clampedTop).
const MIN_BOTTOM_SPACE = 360;

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

interface Props {
  visible: boolean;
  message: ChatMessage | null;
  // ChatBubbleRow'un measureInWindow ile olcup bildirdigi, basilan mesajin
  // GERCEK ekran Y konumu - kart o mesajin oldugu yerde "asili" gorunsun
  // diye (bkz. RoomScreen.tsx openMessageOptions).
  anchorY: number | null;
  onClose: () => void;
  onCopy: () => void;
  onReply: () => void;
  onReport: () => void;
  onSelectEmoji: (emoji: string) => void;
}

/** Rave'deki gibi bir mesaja BASILI TUTUNCA acilan kart - arka plan
 * bulaniklasir, basili tutulan mesajin bir onizlemesi GERCEKTEN basildigi
 * yerde "asili" gorunur, altinda Kopyala/Yanitla/Bildir satiri ve hizli
 * tepki icin TAM emoji klavyesi (arama dahil, EmojiPickerSheet'teki AYNI
 * veri kaynagindan) yer alir. */
export default function MessageOptionsSheet({ visible, message, anchorY, onClose, onCopy, onReply, onReport, onSelectEmoji }: Props) {
  const [query, setQuery] = useState("");
  const { height: screenHeight } = useWindowDimensions();
  const searching = query.trim().length > 0;
  const emojis = useMemo(() => (searching ? searchEmojis(query) : DEFAULT_EMOJIS), [query, searching]);

  if (!message) return null;

  const clampedTop = Math.min(Math.max(anchorY ?? screenHeight * 0.3, 70), Math.max(70, screenHeight - MIN_BOTTOM_SPACE));

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose}>
        <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} pointerEvents="none" />

        <View style={{ height: clampedTop }} pointerEvents="none" />

        <TouchableOpacity activeOpacity={1} style={styles.previewCard} onPress={() => {}}>
          <Avatar name={message.from || "?"} avatarUrl={message.fromAvatarUrl} size={36} />
          <View style={styles.previewTextCol}>
            <Text style={styles.previewText} numberOfLines={4}>
              <Text style={styles.previewFrom}>{message.from}: </Text>
              {message.text}
            </Text>
            <Text style={styles.previewTime}>{formatTime(message.ts)}</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity activeOpacity={1} style={styles.actionsRow} onPress={() => {}}>
          <TouchableOpacity style={styles.actionButton} onPress={onCopy}>
            <Icon name="clipboard" size={22} color="#FFFFFF" />
            <Text style={styles.actionLabel}>Kopyala</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton} onPress={onReply}>
            <Icon name="reply" size={22} color="#FFFFFF" />
            <Text style={styles.actionLabel}>Yanıtla</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton} onPress={onReport}>
            <Icon name="warning" size={22} color="#FFFFFF" />
            <Text style={styles.actionLabel}>Bildir</Text>
          </TouchableOpacity>
        </TouchableOpacity>

        <TouchableOpacity activeOpacity={1} style={styles.emojiCard} onPress={() => {}}>
          <View style={styles.searchBar}>
            <Icon name="search" size={16} color="rgba(255,255,255,0.6)" />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Ara"
              placeholderTextColor="rgba(255,255,255,0.5)"
              style={styles.searchInput}
              autoCorrect={false}
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
              contentContainerStyle={styles.emojiGrid}
              keyboardShouldPersistTaps="handled"
            />
          )}
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1 },
  previewCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: "rgba(28,28,30,0.95)",
    borderRadius: 16,
    padding: 12,
    marginHorizontal: 16,
  },
  previewTextCol: { flex: 1, gap: 4 },
  previewText: { color: "#FFFFFF", fontSize: 14, lineHeight: 19 },
  previewFrom: { fontWeight: "700" },
  previewTime: { color: "rgba(255,255,255,0.5)", fontSize: 11 },
  actionsRow: {
    flexDirection: "row",
    backgroundColor: "rgba(28,28,30,0.95)",
    borderRadius: 16,
    marginHorizontal: 16,
    marginTop: 10,
    overflow: "hidden",
  },
  actionButton: { flex: 1, alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 14 },
  actionLabel: { color: "#FFFFFF", fontSize: 12, fontWeight: "600" },
  emojiCard: {
    flex: 1,
    backgroundColor: "#000000",
    marginTop: 14,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 14,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 10,
  },
  searchInput: { flex: 1, color: "#FFFFFF", fontSize: 14, outlineWidth: 0, outlineStyle: "none" } as any,
  noResults: { color: "rgba(255,255,255,0.6)", fontSize: 12, fontWeight: "500", textAlign: "center", marginTop: 40 },
  emojiGrid: { paddingHorizontal: 12, paddingBottom: 24 },
  emojiCell: { flex: 1, height: 48, borderRadius: 12, justifyContent: "center", alignItems: "center" },
  emojiText: { fontSize: 28 },
});
