import React, { useEffect, useRef, useState } from "react";
import { View, FlatList, Image, TouchableOpacity, StyleSheet, PanResponder } from "react-native";
import * as MediaLibrary from "expo-media-library/legacy";

export interface FilmstripPickedAsset {
  uri: string;
  type: "image" | "video";
}

interface Props {
  // Kamera ekrani acikken GERCEK (visible=false iken hic veri cekilmez/
  // gosterilmez).
  visible: boolean;
  // Hap isaretini YUKARI kaydirinca - GalleryPickerModal'i acar (kamera
  // ekrani kapanip kullanicinin istegi AYNI "Galeriden Seç" akisina duser).
  onOpenGallery: () => void;
  // Seritteki bir kucuk resme dokununca - GalleryPickerModal'daki tek
  // tiklama ile AYNI davranis: o TEK ogeyi dogrudan duzenleme/gonderme
  // ekranina gotursun.
  onPickAsset: (asset: FilmstripPickedAsset) => void;
}

const THUMB_SIZE = 64;
const DRAG_THRESHOLD = 36;

/** Kamera ekraninda deklansorun USTUNDE, ekran genisligini kaplayan
 * kaydirmali son fotograf/video seridi (Snapchat/Instagram kamera
 * ekranlarindaki "camera roll" cubugu gibi). Ustunde diger sheet'lerle
 * (bkz. DMScreen.tsx sheetHandle/sheetHandleTop) AYNI dilde bir hap
 * isareti var - asagi kaydirinca serit gizlenir, yukari kaydirinca
 * GERCEK galeri ekrani acilir. */
export default function CameraFilmstrip({ visible, onOpenGallery, onPickAsset }: Props) {
  const [assets, setAssets] = useState<MediaLibrary.Asset[]>([]);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setCollapsed(false);
    let cancelled = false;
    (async () => {
      const perm = await MediaLibrary.requestPermissionsAsync();
      if (!perm.granted || cancelled) return;
      const page = await MediaLibrary.getAssetsAsync({
        first: 30,
        mediaType: ["photo", "video"],
        sortBy: ["creationTime"],
      });
      if (!cancelled) setAssets(page.assets);
    })();
    return () => {
      cancelled = true;
    };
  }, [visible]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 6,
      onPanResponderRelease: (_, g) => {
        if (g.dy < -DRAG_THRESHOLD) {
          onOpenGallery();
        } else if (g.dy > DRAG_THRESHOLD) {
          setCollapsed(true);
        }
      },
    })
  ).current;

  if (!visible) return null;

  return (
    <View style={styles.wrap}>
      <View {...panResponder.panHandlers} style={styles.handleTouch} hitSlop={{ top: 10, bottom: 10, left: 60, right: 60 }}>
        <TouchableOpacity onPress={() => setCollapsed((c) => !c)} hitSlop={10}>
          <View style={styles.handle} />
        </TouchableOpacity>
      </View>
      {!collapsed && (
        <FlatList
          horizontal
          data={assets}
          keyExtractor={(item) => item.id}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.thumb}
              activeOpacity={0.85}
              onPress={() => onPickAsset({ uri: item.uri, type: item.mediaType === "video" ? "video" : "image" })}
            >
              <Image source={{ uri: item.uri }} style={styles.thumbImage} />
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: "100%" },
  handleTouch: { alignItems: "center", paddingVertical: 6 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.6)" },
  listContent: { paddingHorizontal: 3, gap: 1 },
  thumb: { width: THUMB_SIZE, height: THUMB_SIZE, backgroundColor: "#1A1A1A" },
  thumbImage: { width: "100%", height: "100%" },
});
