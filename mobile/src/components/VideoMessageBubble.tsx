import React, { useState } from "react";
import { View, TouchableOpacity, StyleSheet } from "react-native";
import { useVideoPlayer, VideoView } from "expo-video";
import { Play } from "lucide-react-native";
import VideoViewerModal from "./VideoViewerModal";

interface Props {
  uri: string;
  size?: number;
  borderRadius?: number;
  senderName?: string;
  sentAt?: number;
  onReply?: () => void;
  onShowInChat?: () => void;
  onReport?: () => void;
  // Tek-gorunumluk video ilk kez TAM EKRAN acildiginda cagrilir - bkz.
  // ChatImageBubble.tsx'teki AYNI isimli prop.
  onOpen?: () => void;
}

/** Chat/DM'de gonderilen video - fotograf balonuyla AYNI boyut/kenar
 * yuvarlakligi, ayirt edilsin diye tam ortada beyaz dolgulu bir play
 * dugmesi var (kullanicinin istegi). Kucuk resim kendisi, videonun ILK
 * karesinde DURDURULMUS expo-video oynaticisi - ayri bir thumbnail
 * uretmeye gerek yok. Dokununca VideoViewerModal ile tam ekran acilir. */
export default function VideoMessageBubble({ uri, size = 280, borderRadius = 8, senderName, sentAt, onReply, onShowInChat, onReport, onOpen }: Props) {
  const [viewerOpen, setViewerOpen] = useState(false);
  const player = useVideoPlayer(uri, (p) => {
    p.muted = true;
    p.pause();
  });

  return (
    <>
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => {
          setViewerOpen(true);
          onOpen?.();
        }}
        style={[styles.wrap, { width: size, height: size, borderRadius }]}
      >
        <VideoView style={styles.video} player={player} nativeControls={false} contentFit="cover" pointerEvents="none" />
        <View style={styles.playBadge}>
          <Play size={26} color="#0F172A" fill="#0F172A" />
        </View>
      </TouchableOpacity>
      <VideoViewerModal
        uri={viewerOpen ? uri : null}
        onClose={() => setViewerOpen(false)}
        senderName={senderName}
        sentAt={sentAt}
        onReply={onReply}
        onShowInChat={onShowInChat}
        onReport={onReport}
      />
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { overflow: "hidden", backgroundColor: "#000000", alignItems: "center", justifyContent: "center" },
  video: { width: "100%", height: "100%" },
  playBadge: {
    position: "absolute",
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
});
