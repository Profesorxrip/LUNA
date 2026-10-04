import React, { useMemo, useRef } from "react";
import { Modal, View, Text, TouchableOpacity, StyleSheet, FlatList, ScrollView } from "react-native";
import { EMOJI_CATEGORIES } from "../data/emojiCategories";
import Icon from "./Icon";

const COLS = 7;
const HEADER_HEIGHT = 38;
const ROW_HEIGHT = 56;

type ListItem = { type: "header"; title: string } | { type: "row"; emojis: string[] };

function chunk<T>(arr: T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < arr.length; i += size) rows.push(arr.slice(i, i + size));
  return rows;
}

interface Props {
  visible: boolean;
  selected: string;
  onSelect: (emoji: string) => void;
  onClose: () => void;
}

/** Hizli Tepki icin TAM emoji klavyesi (unicode-emoji-json'daki ~1900 emoji,
 * Unicode'un resmi 9 kategorisine gore gruplanmis) - FlatList + onceden
 * hesaplanmis sabit satir yukseklikleriyle (getItemLayout) virtualize
 * edildigi icin 1900+ emoji olmasina ragmen akici kaydiriliyor, ustteki
 * kategori sekmelerine basinca ilgili bolume aninda ziplanabiliyor. */
export default function EmojiPickerSheet({ visible, selected, onSelect, onClose }: Props) {
  const listRef = useRef<FlatList<ListItem>>(null);

  const { items, sectionStartIndex, layouts } = useMemo(() => {
    const items: ListItem[] = [];
    const sectionStartIndex: number[] = [];
    const layouts: { length: number; offset: number }[] = [];
    let offset = 0;
    EMOJI_CATEGORIES.forEach((cat) => {
      sectionStartIndex.push(items.length);
      items.push({ type: "header", title: cat.label });
      layouts.push({ length: HEADER_HEIGHT, offset });
      offset += HEADER_HEIGHT;
      chunk(cat.emojis, COLS).forEach((row) => {
        items.push({ type: "row", emojis: row });
        layouts.push({ length: ROW_HEIGHT, offset });
        offset += ROW_HEIGHT;
      });
    });
    return { items, sectionStartIndex, layouts };
  }, []);

  function jumpTo(categoryIndex: number) {
    listRef.current?.scrollToIndex({ index: sectionStartIndex[categoryIndex], animated: true });
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.screen}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} hitSlop={10}>
            <Icon name="close" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.title}>Hızlı Tepki</Text>
          <Text style={styles.currentEmoji}>{selected}</Text>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.tabsRow}
          contentContainerStyle={styles.tabsRowContent}
        >
          {EMOJI_CATEGORIES.map((cat, i) => (
            <TouchableOpacity key={cat.key} style={styles.tabButton} onPress={() => jumpTo(i)}>
              <Text style={styles.tabIcon}>{cat.icon}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <FlatList
          ref={listRef}
          data={items}
          keyExtractor={(item, index) => (item.type === "header" ? `h-${index}` : `r-${index}`)}
          getItemLayout={(_data, index) => ({ ...layouts[index], index })}
          renderItem={({ item }) =>
            item.type === "header" ? (
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionHeaderText}>{item.title}</Text>
              </View>
            ) : (
              <View style={styles.emojiRow}>
                {item.emojis.map((emoji) => (
                  <TouchableOpacity
                    key={emoji}
                    style={[styles.emojiCell, emoji === selected && styles.emojiCellSelected]}
                    onPress={() => onSelect(emoji)}
                  >
                    <Text style={styles.emojiText}>{emoji}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )
          }
          initialNumToRender={24}
          windowSize={8}
          contentContainerStyle={styles.listContent}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#000000" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingTop: 54,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#1C1C1C",
  },
  title: { color: "#FFFFFF", fontSize: 16, fontWeight: "800", letterSpacing: 0.2 },
  currentEmoji: { fontSize: 24, width: 24, textAlign: "right" },
  tabsRow: { flexGrow: 0, borderBottomWidth: 1, borderBottomColor: "#1C1C1C" },
  tabsRowContent: { paddingHorizontal: 12, paddingVertical: 8, gap: 6 },
  tabButton: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.06)",
    justifyContent: "center",
    alignItems: "center",
  },
  tabIcon: { fontSize: 22 },
  listContent: { paddingHorizontal: 12, paddingBottom: 40 },
  sectionHeader: { justifyContent: "center", height: HEADER_HEIGHT, backgroundColor: "#000000" },
  sectionHeaderText: {
    color: "rgba(255,255,255,0.65)",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  emojiRow: { flexDirection: "row", height: ROW_HEIGHT, alignItems: "center" },
  emojiCell: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 4,
  },
  emojiCellSelected: { backgroundColor: "rgba(14,165,233,0.25)", borderWidth: 1.5, borderColor: "#0EA5E9" },
  emojiText: { fontSize: 30 },
});
