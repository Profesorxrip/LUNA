import React, { useState } from "react";
import { View, Image, TouchableOpacity, Text, StyleSheet } from "react-native";
import { BlurView } from "expo-blur";
import Icon from "./Icon";
import PhotoViewerModal from "./PhotoViewerModal";
import { theme } from "../theme";

interface Props {
  uri: string;
  isAdult?: boolean;
  size?: number;
  borderRadius?: number;
  // Tam ekran goruntuyeciye (PhotoViewerModal) gonderenin adini/saatini
  // TASIMAK icin - verilmezse (orn. UserProfileScreen'in dogrudan kendi
  // PhotoViewerModal kullanimi, mesaj baglami OLMAYAN galeri/avatar
  // fotograflari) o bilgi goruntuleyicide hic gosterilmez.
  senderName?: string;
  sentAt?: number;
  // PhotoViewerModal.tsx'teki "Yanıtla" butonu icin - bkz. oradaki Props
  // aciklamasi (sadece verilirse buton gosterilir).
  onReply?: () => void;
  // PhotoViewerModal.tsx'teki "Sohbette Göster"/"Bildir" icin - bkz. oradaki
  // Props aciklamalari (sadece verilirse ilgili buton gosterilir).
  onShowInChat?: () => void;
  onReport?: () => void;
  // Tek-gorunumluk fotograf ilk kez TAM EKRAN acildiginda cagrilir - bkz.
  // DMScreen.tsx'teki onConsumeMediaOnce kullanimi (VoiceMessageBubble'daki
  // onPlay ile AYNI mantik).
  onOpen?: () => void;
}

/** Chat/DM'de gonderilen fotograf - "+18 icerik" isaretliyse varsayilan
 * olarak bulanik gelir, dokununca o mesaj icin acilir (ekran/bilesen
 * yeniden monte olunca tekrar bulanik baslar - kalici bir "goruldu" hali
 * yok, her acilista yeniden karar verilir). Bulanik degilken (ya da bir kez
 * acildiktan sonra) dokununca PhotoViewerModal ile tam ekran acilir - profil
 * galerisi/avatar ile AYNI bilesen. */
export default function ChatImageBubble({ uri, isAdult, size = 200, borderRadius = 12, senderName, sentAt, onReply, onShowInChat, onReport, onOpen }: Props) {
  const [revealed, setRevealed] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const blurred = isAdult && !revealed;
  const small = size < 150;

  return (
    <>
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => {
          if (blurred) {
            setRevealed(true);
            return;
          }
          setViewerOpen(true);
          onOpen?.();
        }}
        style={[styles.wrap, { width: size, height: size, borderRadius }]}
      >
        <Image source={{ uri }} style={styles.image} resizeMode="cover" />
        {blurred && (
          <BlurView intensity={90} tint="dark" style={StyleSheet.absoluteFill}>
            <View style={styles.revealHint}>
              <Icon name="eyeOff" size={small ? 16 : 22} color="#FFFFFF" />
              {!small && <Text style={styles.revealText}>+18 içerik{"\n"}göstermek için dokun</Text>}
            </View>
          </BlurView>
        )}
      </TouchableOpacity>
      <PhotoViewerModal
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
  wrap: { overflow: "hidden", backgroundColor: theme.surfaceAlt },
  image: { width: "100%", height: "100%" },
  revealHint: { flex: 1, alignItems: "center", justifyContent: "center", gap: 6 },
  revealText: { color: "#FFFFFF", fontSize: 11, fontWeight: "700", textAlign: "center" },
});
