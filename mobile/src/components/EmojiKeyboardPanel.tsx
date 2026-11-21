import React, { useMemo, useRef, useState } from "react";
import { View, Text, Image, TextInput, TouchableOpacity, StyleSheet, FlatList, ScrollView, ActivityIndicator } from "react-native";
import { Search, X, Smile, Sticker as StickerIcon, Clapperboard, Plus } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { getEmojiCategories } from "../data/emojiCategories";
import { searchEmojis } from "../data/emojiSearch";
import { STICKER_PACKS, StickerPack } from "../data/stickerPacks";
import { CustomSticker } from "../utils/customStickers";

const COLS = 7;
const HEADER_HEIGHT = 30;
const ROW_HEIGHT = 44;
const PANEL_HEIGHT = 300;

type ListItem = { type: "header"; title: string } | { type: "row"; emojis: string[] };
type Tab = "emoji" | "gif" | "sticker";

function chunk<T>(arr: T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < arr.length; i += size) rows.push(arr.slice(i, i + size));
  return rows;
}

interface Props {
  onSelect: (emoji: string) => void;
  // Bundle edilmis hazir paketten (stickerId) YA DA kullanicinin kendi
  // yukledigi bir cikartmadan (mediaUrl) biri dolu olur, digeri null.
  onSendSticker: (stickerId: string | null, mediaUrl: string | null) => void;
  // "Çıkartma oluştur" ile eklenen kisisel cikartmalar - bkz.
  // ../utils/customStickers.ts (AsyncStorage'da tutulur, yuklemeyi/kaydetmeyi
  // DMScreen yapar, bu panel sadece GOSTERIR).
  customStickers: CustomSticker[];
  onCreateSticker: () => void;
  creatingSticker?: boolean;
}

/** Gulen yuz ikonuna basinca ataç paneliyle AYNI yerde (klavyenin yerini
 * alan inline panel - bkz. DMScreen "attachSheet") acilan panel - WhatsApp/
 * Telegram'daki gibi UC sekmeli: Emoji / GIF / Etiket (bkz. ustteki
 * mainTabsRow).
 * - Emoji sekmesi: bir emoji secmek paneli KAPATMAZ, mesaj kutusuna EKLENIR
 *   (gercek bir klavye gibi ard arda secilebilir). Kategoriler/arama
 *   EmojiPickerSheet (Hizli Tepki secimi) ile AYNI veri kaynagini
 *   (emojiCategories/emojiSearch) kullanir.
 * - Etiket sekmesi: Kullanici "Etiket değil çıkartmaymış... whatsapp/
 *   telegram'daki gibi minik etiketler" dedi - buyuk emoji DEGIL, GERCEK
 *   gorsel cikartmalar (bkz. ../data/stickerPacks.ts - acik lisansli/ucretsiz
 *   OpenMoji seti). Bir cikartmaya basmak metne EKLEMEZ, WhatsApp/Telegram'daki
 *   gibi ANINDA kendi basina bir mesaj olarak GONDERILIR (bkz. DMScreen
 *   sendSticker), panel kapanir. "Çıkartma oluştur" hucresi her paketin
 *   basinda SABIT durur (bkz. STICKER_PACKS ile ayni grid).
 * - GIF sekmesi: su an sadece arayuz iskeleti (gercek bir GIF API'si HENUZ
 *   baglanmadi - kullanicinin "şimdilik sadece arayüz/sekme iskeleti" kararı).
 */
export default function EmojiKeyboardPanel({ onSelect, onSendSticker, customStickers, onCreateSticker, creatingSticker }: Props) {
  const { t, i18n } = useTranslation();
  const [tab, setTab] = useState<Tab>("emoji");
  const [stickerPackIndex, setStickerPackIndex] = useState(0);
  const emojiListRef = useRef<FlatList<ListItem>>(null);
  const [query, setQuery] = useState("");
  const searching = query.trim().length > 0;
  const searchResults = useMemo(() => searchEmojis(query), [query]);
  const emojiCategories = useMemo(() => getEmojiCategories(), [i18n.language]);

  const emojiLayout = useMemo(() => buildLayout(emojiCategories, COLS, ROW_HEIGHT), [emojiCategories]);

  const allStickerPacks: StickerPack[] = useMemo(() => {
    if (!customStickers.length) return STICKER_PACKS;
    const customPack: StickerPack = {
      id: "custom",
      name: t("emoji.myStickers"),
      icon: { uri: customStickers[0].url },
      stickers: customStickers.map((c) => ({ id: c.id, source: { uri: c.url } })),
    };
    return [...STICKER_PACKS, customPack];
  }, [customStickers, t]);
  const stickerPack = allStickerPacks[Math.min(stickerPackIndex, allStickerPacks.length - 1)];

  function jumpToCategory(categoryIndex: number) {
    emojiListRef.current?.scrollToIndex({ index: emojiLayout.sectionStartIndex[categoryIndex], animated: true });
  }

  return (
    <View style={styles.panel}>
      <View style={styles.mainTabsRow}>
        <TouchableOpacity
          style={[styles.mainTabButton, tab === "emoji" && styles.mainTabButtonActive]}
          onPress={() => setTab("emoji")}
        >
          <Smile size={20} color={tab === "emoji" ? "#0EA5E9" : "rgba(255,255,255,0.55)"} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.mainTabButton, tab === "gif" && styles.mainTabButtonActive]}
          onPress={() => setTab("gif")}
        >
          <Text style={[styles.gifTabText, tab === "gif" && styles.gifTabTextActive]}>GIF</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.mainTabButton, tab === "sticker" && styles.mainTabButtonActive]}
          onPress={() => setTab("sticker")}
        >
          <StickerIcon size={20} color={tab === "sticker" ? "#0EA5E9" : "rgba(255,255,255,0.55)"} />
        </TouchableOpacity>
      </View>

      {tab === "gif" ? (
        <View style={styles.gifWrap}>
          <View style={styles.searchBar}>
            <Search size={16} color="rgba(255,255,255,0.5)" />
            <TextInput
              placeholder={t("emoji.gifSearchPlaceholder")}
              placeholderTextColor="rgba(186,214,235,0.45)"
              style={styles.searchInput}
              editable={false}
            />
          </View>
          <View style={styles.gifComingSoon}>
            <Clapperboard size={28} color="rgba(255,255,255,0.35)" />
            <Text style={styles.noResults}>{t("emoji.gifComingSoon")}</Text>
          </View>
        </View>
      ) : tab === "sticker" ? (
        <View style={styles.stickerWrap}>
          {/* Kullanici: "gif yazısının altında bütün çıkartma paketinin ilk
              çıkartmalarından ... kaydırmalı seçebilmek için" - paket sayisi
              1 bile olsa HER ZAMAN gorunur (ileride yeni paket eklenince
              kaydirmali secici zaten hazir olsun diye). */}
          <View style={styles.packTabsRowWrap}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.tabsRowContent}
            >
              {allStickerPacks.map((pack, i) => (
                <TouchableOpacity
                  key={pack.id}
                  style={[styles.packTabButton, i === stickerPackIndex && styles.packTabButtonActive]}
                  onPress={() => setStickerPackIndex(i)}
                >
                  <Image source={pack.icon} style={styles.packTabIcon} resizeMode="contain" />
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
          <ScrollView contentContainerStyle={styles.stickerGrid}>
            <TouchableOpacity style={styles.createStickerCell} onPress={onCreateSticker} disabled={creatingSticker}>
              <View style={styles.createStickerInner}>
                {creatingSticker ? (
                  <ActivityIndicator color="#0EA5E9" />
                ) : (
                  <>
                    <Plus size={22} color="#0EA5E9" />
                    <Text style={styles.createStickerText}>{t("emoji.createSticker")}</Text>
                  </>
                )}
              </View>
            </TouchableOpacity>
            {stickerPack.stickers.map((sticker) => {
              const isCustom = stickerPack.id === "custom";
              const customUrl = isCustom ? customStickers.find((c) => c.id === sticker.id)?.url ?? null : null;
              return (
                <TouchableOpacity
                  key={sticker.id}
                  style={styles.stickerGridCell}
                  onPress={() => onSendSticker(isCustom ? null : sticker.id, customUrl)}
                >
                  <Image source={sticker.source} style={styles.stickerImage} resizeMode="contain" />
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      ) : (
        <>
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
                <TouchableOpacity key={cat.key} style={styles.tabButton} onPress={() => jumpToCategory(i)}>
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
              ref={emojiListRef}
              data={emojiLayout.items}
              keyExtractor={(item, index) => (item.type === "header" ? `h-${index}` : `r-${index}`)}
              getItemLayout={(_data, index) => ({ ...emojiLayout.layouts[index], index })}
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
        </>
      )}
    </View>
  );
}

function buildLayout(categories: { key: string; label: string; emojis: string[] }[], cols: number, rowHeight: number) {
  const items: ListItem[] = [];
  const sectionStartIndex: number[] = [];
  const layouts: { length: number; offset: number }[] = [];
  let offset = 0;
  categories.forEach((cat) => {
    sectionStartIndex.push(items.length);
    items.push({ type: "header", title: cat.label });
    layouts.push({ length: HEADER_HEIGHT, offset });
    offset += HEADER_HEIGHT;
    chunk(cat.emojis, cols).forEach((row) => {
      items.push({ type: "row", emojis: row });
      layouts.push({ length: rowHeight, offset });
      offset += rowHeight;
    });
  });
  return { items, sectionStartIndex, layouts };
}

const styles = StyleSheet.create({
  panel: { height: PANEL_HEIGHT, backgroundColor: "#15202B" },
  mainTabsRow: { flexDirection: "row", paddingHorizontal: 14, paddingTop: 8, gap: 8 },
  mainTabButton: {
    flex: 1,
    height: 34,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.05)",
    alignItems: "center",
    justifyContent: "center",
  },
  mainTabButtonActive: { backgroundColor: "rgba(14,165,233,0.16)" },
  gifTabText: { color: "rgba(255,255,255,0.55)", fontSize: 13, fontWeight: "800", letterSpacing: 0.5 },
  gifTabTextActive: { color: "#0EA5E9" },
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
  gifWrap: { flex: 1 },
  gifComingSoon: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  searchGrid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 10, paddingTop: 8, gap: 2 },
  emojiCellWrap: { width: 40, height: 40, borderRadius: 10, justifyContent: "center", alignItems: "center" },
  noResults: { color: "rgba(255,255,255,0.6)", fontSize: 12, fontWeight: "500", textAlign: "center", marginTop: 30 },
  tabsRow: { flexGrow: 0 },
  // ScrollView'in KENDI "style" prop'una verilen yukseklik web'de etkisiz
  // kaliyordu (paket ikonlari - 40px - kategori ikonlarindan - 34px - daha
  // uzun oldugu icin ScrollView'in kendiliginden hesapladigi yukseklik
  // YETERSIZ kalip ustten kesiyordu) - bunun yerine ScrollView'i SARAN,
  // acik yukseklikli duz bir View kullaniliyor.
  packTabsRowWrap: { height: 52 },
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
  stickerWrap: { flex: 1 },
  packTabButton: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.06)",
    justifyContent: "center",
    alignItems: "center",
  },
  packTabButtonActive: { backgroundColor: "rgba(14,165,233,0.16)" },
  packTabIcon: { width: 24, height: 24 },
  stickerGrid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 6, paddingTop: 4, paddingBottom: 12 },
  stickerGridCell: { width: "20%", aspectRatio: 1, justifyContent: "center", alignItems: "center" },
  stickerImage: { width: "72%", height: "72%" },
  // "Çıkartma oluştur" - PollComposerModal'daki secenek fotografi ekleme
  // dugmesiyle AYNI kesikli-cerceve dili (bkz. optionImageButton).
  createStickerCell: {
    width: "20%",
    aspectRatio: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 4,
    padding: 8,
  },
  createStickerInner: {
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
    gap: 4,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: "rgba(14,165,233,0.4)",
    borderRadius: 14,
  },
  createStickerText: { color: "#0EA5E9", fontSize: 10, fontWeight: "700", textAlign: "center" },
});
