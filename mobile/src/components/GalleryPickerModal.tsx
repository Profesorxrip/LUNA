import React, { useEffect, useRef, useState } from "react";
import { Modal, View, Text, Image, TouchableOpacity, FlatList, StyleSheet, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import * as MediaLibrary from "expo-media-library/legacy";
import { CircleArrowDown, Play } from "lucide-react-native";
import { formatDuration } from "../utils/format";
import { theme } from "../theme";

export interface GalleryPickedAsset {
  uri: string;
  type: "image" | "video";
  mimeType?: string | null;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  onConfirm: (assets: GalleryPickedAsset[]) => void;
  maxSelection?: number;
}

const COLUMNS = 3;

/** Uygulama ici ozel galeri izgara ekrani - paylas menusundeki "Galeriden
 * Sec" ve hizli kamera ekranindaki galeri ikonu AYNI bu ekrani acar
 * (kullanicinin istegi, OS'in kendi galeri uygulamasi yerine).
 *
 * ONEMLI: "expo-media-library"in YENI sinif-tabanli API'si (Query/Asset,
 * v57+) web'de MODUL YUKLENIRKEN requireNativeModule ile COKUYOR (hicbir
 * web karsiligi yok, tum uygulamayi patlatiyor). "expo-media-library/legacy"
 * alt-yolu ise eski ExpoMediaLibrary binding'ini kullaniyor ve bunun GERCEK
 * bir web karsiligi (ExpoMediaLibrary.web.ts) var - sadece izinleri
 * "verilmedi" dondurur, modul yuklemede COKMEZ. Bu yuzden BURADA ozellikle
 * "/legacy" alt-yolu kullanildi. web'de yine de gercek foto listeleme
 * YAPILAMIYOR (tarayicilar JS'in galeriyi keyfi listelemesine izin
 * vermiyor) - bu yuzden cagiran taraf (DMScreen.tsx pickImage) web'de bu
 * ekrani hic acmiyor, eski ImagePicker.launchImageLibraryAsync akisina
 * duser. */
export default function GalleryPickerModal({ visible, onClose, onConfirm, maxSelection = 10 }: Props) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [assets, setAssets] = useState<MediaLibrary.Asset[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const endCursorRef = useRef<string | undefined>(undefined);
  const hasNextPageRef = useRef(true);
  const loadingMoreRef = useRef(false);

  useEffect(() => {
    if (!visible) return;
    setSelectedIds([]);
    endCursorRef.current = undefined;
    hasNextPageRef.current = true;
    setAssets([]);
    setLoading(true);
    loadFirstPage();
  }, [visible]);

  async function loadFirstPage() {
    const perm = await MediaLibrary.requestPermissionsAsync();
    if (!perm.granted) {
      setPermissionDenied(true);
      setLoading(false);
      return;
    }
    setPermissionDenied(false);
    const page = await MediaLibrary.getAssetsAsync({
      first: 60,
      mediaType: ["photo", "video"],
      sortBy: ["creationTime"],
    });
    setAssets(page.assets);
    endCursorRef.current = page.endCursor;
    hasNextPageRef.current = page.hasNextPage;
    setLoading(false);
  }

  async function loadMore() {
    if (loadingMoreRef.current || !hasNextPageRef.current || permissionDenied) return;
    loadingMoreRef.current = true;
    const page = await MediaLibrary.getAssetsAsync({
      first: 60,
      after: endCursorRef.current,
      mediaType: ["photo", "video"],
      sortBy: ["creationTime"],
    });
    setAssets((prev) => [...prev, ...page.assets]);
    endCursorRef.current = page.endCursor;
    hasNextPageRef.current = page.hasNextPage;
    loadingMoreRef.current = false;
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= maxSelection) return prev;
      return [...prev, id];
    });
  }

  function handleConfirm() {
    const picked = selectedIds
      .map((id) => assets.find((a) => a.id === id))
      .filter((a): a is MediaLibrary.Asset => !!a)
      .map((a) => ({
        uri: a.uri,
        type: a.mediaType === "video" ? ("video" as const) : ("image" as const),
        mimeType: a.mediaType === "video" ? "video/mp4" : "image/jpeg",
      }));
    if (!picked.length) return;
    onConfirm(picked);
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.screen}>
        <View style={[styles.header, { paddingTop: insets.top + 40 }]}>
          <TouchableOpacity style={styles.headerBtn} onPress={onClose} hitSlop={10}>
            <View style={{ transform: [{ rotate: "90deg" }] }}>
              <CircleArrowDown size={22} color="#FFFFFF" />
            </View>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t("dm.attachGallery")}</Text>
          <TouchableOpacity style={styles.headerBtn} onPress={handleConfirm} disabled={!selectedIds.length} hitSlop={10}>
            <View style={{ transform: [{ rotate: "180deg" }] }}>
              <CircleArrowDown size={22} color={selectedIds.length ? "#FFFFFF" : theme.textMuted} />
            </View>
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.centerFill}>
            <ActivityIndicator color={theme.accent} size="large" />
          </View>
        ) : permissionDenied ? (
          <View style={styles.centerFill}>
            <Text style={styles.permissionText}>{t("dm.galleryPermissionDenied")}</Text>
          </View>
        ) : (
          <FlatList
            data={assets}
            keyExtractor={(item) => item.id}
            numColumns={COLUMNS}
            onEndReached={loadMore}
            onEndReachedThreshold={0.5}
            contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
            renderItem={({ item }) => {
              const selected = selectedIds.includes(item.id);
              const order = selectedIds.indexOf(item.id);
              return (
                <TouchableOpacity style={styles.cell} activeOpacity={0.85} onPress={() => toggleSelect(item.id)}>
                  <Image source={{ uri: item.uri }} style={styles.cellImage} />
                  {item.mediaType === "video" && (
                    <View style={styles.videoBadge}>
                      <Play size={11} color="#FFFFFF" fill="#FFFFFF" />
                      <Text style={styles.videoBadgeText}>{formatDuration(item.duration || 0)}</Text>
                    </View>
                  )}
                  <View style={[styles.selectBadge, selected && styles.selectBadgeActive]}>
                    {selected && <Text style={styles.selectBadgeText}>{order + 1}</Text>}
                  </View>
                  {selected && <View style={styles.selectedOverlay} />}
                </TouchableOpacity>
              );
            }}
          />
        )}
      </View>
    </Modal>
  );
}

const CELL_SIZE_PCT = 100 / COLUMNS;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#15202B" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  headerBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  headerTitle: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  centerFill: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 },
  permissionText: { color: "rgba(255,255,255,0.7)", fontSize: 14, textAlign: "center" },
  cell: { width: `${CELL_SIZE_PCT}%`, aspectRatio: 1, padding: 1 },
  cellImage: { width: "100%", height: "100%", backgroundColor: "#1A1A1A" },
  videoBadge: {
    position: "absolute",
    left: 5,
    bottom: 5,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  videoBadgeText: { color: "#FFFFFF", fontSize: 11, fontWeight: "600" },
  selectBadge: {
    position: "absolute",
    top: 7,
    right: 7,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.25)",
  },
  selectBadgeActive: { backgroundColor: theme.accent, borderColor: theme.accent },
  selectBadgeText: { color: "#FFFFFF", fontSize: 11, fontWeight: "700" },
  selectedOverlay: {
    position: "absolute",
    top: 1,
    left: 1,
    right: 1,
    bottom: 1,
    backgroundColor: "rgba(14,165,233,0.2)",
  },
});
