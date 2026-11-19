import React, { useState } from "react";
import { View, Image, Text, TouchableOpacity, StyleSheet } from "react-native";
import PhotoViewerModal from "./PhotoViewerModal";

interface GridPhoto {
  uri: string;
}

interface Props {
  photos: GridPhoto[];
  size?: number;
  senderName?: string;
  sentAt?: number;
  // PhotoViewerModal.tsx'teki "Yanıtla"/"Bildir" icin - bkz. oradaki Props
  // aciklamalari (sadece verilirse ilgili buton gosterilir).
  onReply?: () => void;
  onReport?: () => void;
}

const GAP = 2;
const MAX_VISIBLE = 4;

/** Arka arkaya gonderilen BIRDEN FAZLA fotografi (dm:sendImage ile ayri ayri
 * gonderilse de DMScreen'de gruplanir - bkz. groupConsecutivePhotos) TEK bir
 * balonda 2x2'ye kadar izgara seklinde gosterir. 4'ten fazlaysa son goze
 * karartilip "+N" yazisi biner - kalan fotograflar o goze dokununca ACILAN
 * tam ekran goruntuyeciden (PhotoViewerModal, >> ile) sirayla gezilebilir. */
export default function PhotoGridBubble({ photos, size = 280, senderName, sentAt, onReply, onReport }: Props) {
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const visible = photos.slice(0, MAX_VISIBLE);
  // 4'e kadar hepsi acik acik gorunur (overlay YOK). 4'ten fazlaysa son
  // gozdeki fotograf da "gizli" sayilir - rakam KALAN 3 goz DISINDA kalan
  // toplam fotograf sayisini gosterir (orn. 5 fotografta +2, 6'da +3 -
  // kullanicinin istegi).
  const extra = photos.length > MAX_VISIBLE ? photos.length - 3 : 0;
  const cell = (size - GAP) / 2;

  function renderCell(index: number, w: number, h: number) {
    const photo = visible[index];
    const showOverlay = index === MAX_VISIBLE - 1 && extra > 0;
    return (
      <TouchableOpacity key={index} activeOpacity={0.85} style={{ width: w, height: h }} onPress={() => setViewerIndex(index)}>
        <Image source={{ uri: photo.uri }} style={styles.cellImage} resizeMode="cover" />
        {showOverlay && (
          <View style={styles.extraOverlay}>
            <Text style={styles.extraText}>+{extra}</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  }

  let layout: React.ReactNode;
  if (visible.length === 2) {
    layout = (
      <View style={styles.row}>
        {renderCell(0, cell, size)}
        <View style={{ width: GAP }} />
        {renderCell(1, cell, size)}
      </View>
    );
  } else if (visible.length === 3) {
    layout = (
      <View style={styles.row}>
        {renderCell(0, cell, size)}
        <View style={{ width: GAP }} />
        <View>
          {renderCell(1, cell, cell)}
          <View style={{ height: GAP }} />
          {renderCell(2, cell, cell)}
        </View>
      </View>
    );
  } else {
    layout = (
      <View>
        <View style={styles.row}>
          {renderCell(0, cell, cell)}
          <View style={{ width: GAP }} />
          {renderCell(1, cell, cell)}
        </View>
        <View style={{ height: GAP }} />
        <View style={styles.row}>
          {renderCell(2, cell, cell)}
          <View style={{ width: GAP }} />
          {renderCell(3, cell, cell)}
        </View>
      </View>
    );
  }

  return (
    <>
      <View style={styles.wrap}>{layout}</View>
      <PhotoViewerModal
        uri={viewerIndex !== null ? visible[viewerIndex].uri : null}
        onClose={() => setViewerIndex(null)}
        senderName={senderName}
        sentAt={sentAt}
        photos={photos.map((p) => p.uri)}
        initialIndex={viewerIndex ?? 0}
        onReply={onReply}
        onReport={onReport}
      />
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: 8, overflow: "hidden" },
  row: { flexDirection: "row" },
  cellImage: { width: "100%", height: "100%" },
  extraOverlay: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center" },
  extraText: { color: "#FFFFFF", fontSize: 26, fontWeight: "800" },
});
