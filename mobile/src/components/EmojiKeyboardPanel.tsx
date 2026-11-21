import React, { useMemo, useRef, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, FlatList, ScrollView } from "react-native";
import { Search, X } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { getEmojiCategories } from "../data/emojiCategories";
import { searchEmojis } from "../data/emojiSearch";

const COLS = 7;
const HEADER_HEIGHT = 30;
const ROW_HEIGHT = 44;
const PANEL_HEIGHT = 300;

type ListItem = { type: "header"; title: string } | { type: "row"; emojis: string[] };

function chunk<T>(arr: T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < arr.length; i += size) rows.push(arr.slice(i, i + size));
  return rows;
}

interface Props {
  onSelect: (emoji: string) => void;
}

/** Gulen yuz ikonuna basinca ataç paneliyle AYNI yerde (klavyenin yerini
 * alan inline panel - bkz. DMScreen "attachSheet") acilan GERCEK emoji
 * klavyesi. Ataç panelinden farki: bir emoji secmek paneli KAPATMAZ -
 * gercek bir emoji klavyesi gibi ard arda birden fazla emoji eklenebilir.
 * Kategoriler/arama EmojiPickerSheet (Hizli Tepki secimi) ile AYNI veri
 * kaynagini (emojiCategories/emojiSearch) kullanir. */
export default function EmojiKeyboardPanel({ onSelect }: Props) {
  const { t, i18n } = useTranslation();
  const listRef = useRef<FlatList<ListItem>>(null);
  const [query, setQuery] = useState("");
  const searching = query.trim().length > 0;
  const searchResults = useMemo(() => searchEmojis(query), [query]);
  const emojiCategories = useMemo(() => getEmojiCategories(), [i18n.language]);

  const { items, sectionStartIndex, layouts } = useMemo(() => {
    const items: ListItem[] = [];
    const sectionStartIndex: number[] = [];
    const layouts: { length: number; offset: number }[] = [];
    let offset = 0;
    emojiCategories.forEach((cat) => {
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
  }, [emojiCategories]);

  function jumpTo(categoryIndex: number) {
    listRef.current?.scrollToIndex({ index: sectionStartIndex[categoryIndex], animated: true });
  }

  return (
    <View style={styles.panel}>
      <View style={styles.searchBar}>
        <Search size={16} color="rgba(255,255,255,0.5)" />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={t("emoji.searchPlaceholder")}
          placeholderTextColor="rgba(186,214,235,0.45)"
          style={styles.searchInput}
        />
        {searching && (
          <TouchableOpacity onPress={() => setQuery("")} hitSlop={10}>
            <X size={14} color="rgba(255,255,255,0.5)" />
          </TouchableOpacity>
        )}
      </View>

      {!searching && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.tabsRow}
          contentContainerStyle={styles.tabsRowContent}
        >
          {emojiCategories.map((cat, i) => (
            <TouchableOpacity key={cat.key} style={styles.tabButton} onPress={() => jumpTo(i)}>
              <Text style={styles.tabIcon}>{cat.icon}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {searching ? (
        searchResults.length === 0 ? (
          <Text style={styles.noResults}>{t("emoji.noResults")}</Text>
        ) : (
          <ScrollView contentContainerStyle={styles.searchGrid}>
            {searchResults.map((emoji) => (
              <TouchableOpacity key={emoji} style={styles.emojiCellWrap} onPress={() => onSelect(emoji)}>
                <Text style={styles.emojiText}>{emoji}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )
      ) : (
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
                  <TouchableOpacity key={emoji} style={styles.emojiCell} onPress={() => onSelect(emoji)}>
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
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { height: PANEL_HEIGHT, backgroundColor: "#15202B" },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.08)",
    marginHorizontal: 14,
    marginTop: 10,
    paddingHorizontal: 14,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 14,
    paddingVertical: 0,
    includeFontPadding: false,
    outlineWidth: 0,
    outlineStyle: "none",
  } as any,
  searchGrid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 10, paddingTop: 8, gap: 2 },
  emojiCellWrap: { width: 40, height: 40, borderRadius: 10, justifyContent: "center", alignItems: "center" },
  noResults: { color: "rgba(255,255,255,0.6)", fontSize: 12, fontWeight: "500", textAlign: "center", marginTop: 30 },
  tabsRow: { flexGrow: 0 },
  tabsRowContent: { paddingHorizontal: 10, paddingVertical: 6, gap: 4 },
  tabButton: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.06)",
    justifyContent: "center",
    alignItems: "center",
  },
  tabIcon: { fontSize: 17 },
  listContent: { paddingHorizontal: 10, paddingBottom: 20 },
  sectionHeader: { justifyContent: "center", height: HEADER_HEIGHT },
  sectionHeaderText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
    opacity: 0.6,
  },
  emojiRow: { flexDirection: "row", height: ROW_HEIGHT, alignItems: "center" },
  emojiCell: { flex: 1, height: 36, borderRadius: 10, justifyContent: "center", alignItems: "center", marginRight: 2 },
  emojiText: { fontSize: 22 },
});
