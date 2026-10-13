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
// Emoji karti artik ekranin altina kadar UZAMIYOR (flex:1 degil) - sabit,
// kompakt bir yukseklikte (bkz. styles.emojiCard). MIN_BOTTOM_SPACE bu
// yuzden tum kartin (onizleme + aksiyon satiri + emoji karti) gercek toplam
// yuksekligine yakin, sabit bir deger - basilan mesaj ekranin cok
// asagisindaysa kart bu kadar yer SIGACAK sekilde yukari ittiriliyor.
const MIN_BOTTOM_SPACE = 300;

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
            <Icon name="clipboard" size={19} color="#FFFFFF" />
            <Text style={styles.actionLabel}>Kopyala</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton} onPress={onReply}>
            <Icon name="reply" size={19} color="#FFFFFF" />
            <Text style={styles.actionLabel}>Yanıtla</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton} onPress={onReport}>
            <Icon name="warning" size={19} color="#FFFFFF" />
            <Text style={styles.actionLabel}>Bildir</Text>
          </TouchableOpacity>
        </TouchableOpacity>

        <TouchableOpacity activeOpacity={1} style={styles.emojiCard} onPress={() => {}}>
          <View style={styles.searchBar}>
            <Icon name="search" size={14} color="rgba(255,255,255,0.6)" />
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
    gap: 8,
    backgroundColor: "rgba(28,28,30,0.95)",
    borderRadius: 14,
    padding: 10,
    marginHorizontal: 16,
  },
  previewTextCol: { flex: 1, gap: 2 },
  previewText: { color: "#FFFFFF", fontSize: 13, lineHeight: 17 },
  previewFrom: { fontWeight: "700" },
  previewTime: { color: "rgba(255,255,255,0.5)", fontSize: 10 },
  actionsRow: {
    flexDirection: "row",
    backgroundColor: "rgba(28,28,30,0.95)",
    borderRadius: 14,
    marginHorizontal: 16,
    marginTop: 8,
    overflow: "hidden",
  },
  actionButton: { flex: 1, alignItems: "center", justifyContent: "center", gap: 4, paddingVertical: 10 },
  actionLabel: { color: "#FFFFFF", fontSize: 11, fontWeight: "600" },
  // Sabit, kompakt yukseklik - artik ekranin altina kadar UZAMIYOR (eskiden
  // flex:1 ile tum kalan alani dolduruyordu), referans ekran goruntusundeki
  // gibi sadece birkac satirlik bir izgara olarak kalip altinda bos (karanlik
  // arka plan) alan birakiyor.
  emojiCard: {
    height: 220,
    backgroundColor: "#000000",
    marginTop: 10,
    marginHorizontal: 16,
    borderRadius: 16,
    paddingTop: 10,
    overflow: "hidden",
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 7,
    gap: 6,
    marginHorizontal: 12,
    marginBottom: 6,
  },
  searchInput: { flex: 1, color: "#FFFFFF", fontSize: 13, outlineWidth: 0, outlineStyle: "none" } as any,
  noResults: { color: "rgba(255,255,255,0.6)", fontSize: 12, fontWeight: "500", textAlign: "center", marginTop: 32 },
  emojiGrid: { paddingHorizontal: 8, paddingBottom: 12 },
  emojiCell: { flex: 1, height: 38, borderRadius: 9, justifyContent: "center", alignItems: "center" },
  emojiText: { fontSize: 22 },
});
