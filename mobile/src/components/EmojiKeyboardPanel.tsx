import React, { useMemo, useRef, useState } from "react";
import { View, Text, Image, TextInput, TouchableOpacity, StyleSheet, FlatList, ScrollView, ActivityIndicator, PanResponder } from "react-native";
import { Search, X, Smile, Plus } from "lucide-react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { getEmojiCategories } from "../data/emojiCategories";
import { searchEmojis } from "../data/emojiSearch";
import { STICKER_PACKS, StickerPack } from "../data/stickerPacks";
import { GIF_PACKS } from "../data/gifPacks";
import { CustomSticker } from "../utils/customStickers";
import { CustomGif } from "../utils/customGifs";
import AnimatedEmoji from "./AnimatedEmoji";

const COLS = 7;
const ROW_HEIGHT = 44;
// DMScreen'in composer'i KAC px yukari itecegini (bos bir "spacer" ile)
// hesaplayabilmesi icin disari aciliyor - bkz. asagidaki "position:absolute"
// aciklamasi.
export const PANEL_HEIGHT = 300;

type ListItem = { type: "row"; emojis: string[] };
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
  // GIF sekmesi icin AYNI gonderme pipeline'i (onSendSticker) kullanilir -
  // bkz. ../data/gifPacks.ts (Tenor/GIPHY gibi harici bir API'ye BAGLANMADAN,
  // kendi ozgun GIF'lerimiz) ve ../utils/customGifs.ts.
  customGifs: CustomGif[];
  onCreateGif: () => void;
  creatingGif?: boolean;
}

/** Gulen yuz ikonuna basinca ataç paneliyle AYNI yerde (klavyenin yerini
 * alan inline panel - bkz. DMScreen "attachSheet") acilan panel - WhatsApp/
 * Telegram'daki gibi UC sekmeli: Emoji / GIF / Etiket (bkz. ustteki
 * mainTabsRow).
 * - Emoji sekmesi: bir emoji secmek paneli KAPATMAZ, mesaj kutusuna EKLENIR
 *   (gercek bir klavye gibi ard arda secilebilir). Kategoriler/arama
 *   EmojiPickerSheet (Hizli Tepki secimi) ile AYNI veri kaynagini
 *   (emojiCategories/emojiSearch) kullanir.
 * - GIF sekmesi: kullanici "kendi gıf kütüphanemiz olsun" dedi (Tenor/
 *   GIPHY'ye BAGLANMADAN) - bkz. ../data/gifPacks.ts: ozgun/telifsiz, Python/
 *   Pillow ile uretilmis soyut reaksiyon GIF'leri. Etiket sekmesiyle AYNI
 *   PackSwitcherAndGrid bileseni kullanilir, "Kendi GIF'ini ekle" ile
 *   kullanicinin kendi GIF'leri de eklenebilir (bkz. ../utils/customGifs.ts).
 * - Etiket sekmesi: Kullanici "Etiket değil çıkartmaymış... whatsapp/
 *   telegram'daki gibi minik etiketler" dedi - buyuk emoji DEGIL, GERCEK
 *   gorsel cikartmalar (bkz. ../data/stickerPacks.ts - acik lisansli/ucretsiz
 *   OpenMoji seti).
 * - Hem GIF hem Etiket: birine basmak metne EKLEMEZ, WhatsApp/Telegram'daki
 *   gibi ANINDA kendi basina bir mesaj olarak GONDERILIR (bkz. DMScreen
 *   sendSticker - ikisi de AYNI stickerId/mediaUrl pipeline'ini kullanir),
 *   panel kapanir. "Oluştur"/"Ekle" hucresi her paketin basinda SABIT durur.
 */
export default function EmojiKeyboardPanel({
  onSelect,
  onSendSticker,
  customStickers,
  onCreateSticker,
  creatingSticker,
  customGifs,
  onCreateGif,
  creatingGif,
}: Props) {
  const { t, i18n } = useTranslation();
  const [tab, setTab] = useState<Tab>("emoji");
  const [stickerPackIndex, setStickerPackIndex] = useState(0);
  const [gifPackIndex, setGifPackIndex] = useState(0);

  // Kullanici: "bu üçünün üstüne birde sürükleme hapı koysak mevcut
  // büyüklüğünün iki katına kadar büyütebilsek" - panel klavyenin yerini
  // alan bir alan oldugu icin (bkz. DMScreen attachSheet/emojiPanelVisible)
  // YUKARI surukleme paneli BUYUTUR (panelin UST kenarini yukari tasir).
  const [panelHeight, setPanelHeight] = useState(PANEL_HEIGHT);
  const heightRef = useRef(PANEL_HEIGHT);
  const dragStartHeightRef = useRef(PANEL_HEIGHT);
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_evt, gesture) => Math.abs(gesture.dy) > 2,
      onPanResponderGrant: () => {
        dragStartHeightRef.current = heightRef.current;
      },
      onPanResponderMove: (_evt, gesture) => {
        const next = Math.max(PANEL_HEIGHT, Math.min(PANEL_HEIGHT * 2, dragStartHeightRef.current - gesture.dy));
        heightRef.current = next;
        setPanelHeight(next);
      },
    })
  ).current;
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

  const allGifPacks: StickerPack[] = useMemo(() => {
    if (!customGifs.length) return GIF_PACKS;
    const customPack: StickerPack = {
      id: "custom-gif",
      name: t("emoji.myGifs"),
      icon: { uri: customGifs[0].url },
      stickers: customGifs.map((c) => ({ id: c.id, source: { uri: c.url } })),
    };
    return [...GIF_PACKS, customPack];
  }, [customGifs, t]);

  function jumpToCategory(categoryIndex: number) {
    emojiListRef.current?.scrollToIndex({ index: emojiLayout.sectionStartIndex[categoryIndex], animated: true });
  }

  return (
    <View style={[styles.panel, { height: panelHeight }]}>
      <View style={styles.dragHandleWrap} {...panResponder.panHandlers}>
        <View style={styles.dragHandle} />
      </View>
      <View style={styles.mainTabsRow}>
        <TouchableOpacity
          style={[styles.mainTabButton, tab === "emoji" && styles.mainTabButtonActive]}
          onPress={() => setTab("emoji")}
        >
          <Smile size={20} color={tab === "emoji" ? "#FFFFFF" : "rgba(255,255,255,0.55)"} />
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
          <MaterialCommunityIcons name="sticker-emoji" size={20} color={tab === "sticker" ? "#0EA5E9" : "rgba(255,255,255,0.55)"} />
        </TouchableOpacity>
      </View>

      {tab === "sticker" ? (
        <PackSwitcherAndGrid
          packs={allStickerPacks}
          packIndex={stickerPackIndex}
          onPackIndexChange={setStickerPackIndex}
          customPackId="custom"
          customItems={customStickers}
          onSend={onSendSticker}
          onCreate={onCreateSticker}
          creating={creatingSticker}
          createLabel={t("emoji.createSticker")}
        />
      ) : tab === "gif" ? (
        <PackSwitcherAndGrid
          packs={allGifPacks}
          packIndex={gifPackIndex}
          onPackIndexChange={setGifPackIndex}
          customPackId="custom-gif"
          customItems={customGifs}
          onSend={onSendSticker}
          onCreate={onCreateGif}
          creating={creatingGif}
          createLabel={t("emoji.createGif")}
        />
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
                    <AnimatedEmoji emoji={emoji} size={26} />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )
          ) : (
            <FlatList
              ref={emojiListRef}
              data={emojiLayout.items}
              keyExtractor={(_item, index) => `r-${index}`}
              getItemLayout={(_data, index) => ({ ...emojiLayout.layouts[index], index })}
              renderItem={({ item }) => (
                <View style={styles.emojiRow}>
                  {item.emojis.map((emoji) => (
                    <TouchableOpacity key={emoji} style={styles.emojiCell} onPress={() => onSelect(emoji)}>
                      <AnimatedEmoji emoji={emoji} size={24} />
                    </TouchableOpacity>
                  ))}
                </View>
              )}
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

// Etiket VE GIF sekmeleri AYNI yapidadir (paket seciciti + "olustur/ekle"
// hucresi + grid) - tek fark veri kaynagi (stickerPacks.ts/gifPacks.ts) ve
// kisisel liste (customStickers/customGifs) oldugu icin ortak bilesen.
function PackSwitcherAndGrid({
  packs,
  packIndex,
  onPackIndexChange,
  customPackId,
  customItems,
  onSend,
  onCreate,
  creating,
  createLabel,
}: {
  packs: StickerPack[];
  packIndex: number;
  onPackIndexChange: (i: number) => void;
  customPackId: string;
  customItems: { id: string; url: string }[];
  onSend: (stickerId: string | null, mediaUrl: string | null) => void;
  onCreate: () => void;
  creating?: boolean;
  createLabel: string;
}) {
  const pack = packs[Math.min(packIndex, packs.length - 1)];
  const isCustomPack = pack.id === customPackId;
  return (
    <View style={styles.stickerWrap}>
      {/* Kullanici: "gif yazısının altında bütün çıkartma paketinin ilk
          çıkartmalarından ... kaydırmalı seçebilmek için" - paket sayisi
          1 bile olsa HER ZAMAN gorunur (ileride yeni paket eklenince
          kaydirmali secici zaten hazir olsun diye). */}
      <View style={styles.packTabsRowWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsRowContent}>
          {packs.map((p, i) => (
            <TouchableOpacity
              key={p.id}
              style={[styles.packTabButton, i === packIndex && styles.packTabButtonActive]}
              onPress={() => onPackIndexChange(i)}
            >
              <Image source={p.icon} style={styles.packTabIcon} resizeMode="contain" />
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
      <ScrollView contentContainerStyle={styles.stickerGrid}>
        <TouchableOpacity style={styles.createStickerCell} onPress={onCreate} disabled={creating}>
          <View style={styles.createStickerInner}>
            {creating ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Plus size={22} color="#FFFFFF" />
                <Text style={styles.createStickerText}>{createLabel}</Text>
              </>
            )}
          </View>
        </TouchableOpacity>
        {pack.stickers.map((sticker) => {
          const customUrl = isCustomPack ? customItems.find((c) => c.id === sticker.id)?.url ?? null : null;
          return (
            <TouchableOpacity
              key={sticker.id}
              style={styles.stickerGridCell}
              onPress={() => onSend(isCustomPack ? null : sticker.id, customUrl)}
            >
              <Image source={sticker.source} style={styles.stickerImage} resizeMode="contain" />
            </TouchableOpacity>
          );
        })}
      </ScrollView>
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
    chunk(cat.emojis, cols).forEach((row) => {
      items.push({ type: "row", emojis: row });
      layouts.push({ length: rowHeight, offset });
      offset += rowHeight;
    });
  });
  return { items, sectionStartIndex, layouts };
}

const styles = StyleSheet.create({
  // Kullanici: "Yükselttiğimiz zaman mesaj kutusu ile şey yükselmemeli" -
  // composer'in konumu artik bu panelin GERCEK (surukleyerek buyutulmus)
  // yuksekligine BAGLI DEGIL (DMScreen sadece SABIT PANEL_HEIGHT kadar bir
  // bosluk birakiyor, composer o kadar yukari kayip SABIT kalıyor). Panel
  // kendi basina mutlak konumlu, altta sabitli, buyudukce composer'in
  // UZERINE degil sohbet listesinin UZERINE (yukari dogru) biniyor.
  panel: { position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: "#15202B", zIndex: 10 },
  dragHandleWrap: { height: 18, alignItems: "center", justifyContent: "center" },
  dragHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.3)" },
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
  gifTabTextActive: { color: "#FFFFFF" },
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
  emojiRow: { flexDirection: "row", height: ROW_HEIGHT, alignItems: "center" },
  emojiCell: { flex: 1, height: 36, borderRadius: 10, justifyContent: "center", alignItems: "center", marginRight: 2 },
  stickerWrap: { flex: 1 },
  packTabButton: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "transparent",
    justifyContent: "center",
    alignItems: "center",
  },
  // Kullanici: "çerçevesi tam şeffaf olsun hiç gözükmesin" - kutu arka plani
  // KALDIRILDI, secili paket artik alttaki ince accent cizgiyle belli oluyor.
  packTabButtonActive: { borderBottomWidth: 2, borderBottomColor: "#FFFFFF" },
  packTabIcon: { width: "100%", height: "100%", borderRadius: 10 },
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
    borderColor: "rgba(255,255,255,0.5)",
    borderRadius: 14,
  },
  createStickerText: { color: "#FFFFFF", fontSize: 10, fontWeight: "700", textAlign: "center" },
});
