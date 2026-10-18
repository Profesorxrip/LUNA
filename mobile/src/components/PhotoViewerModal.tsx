import React, { useState } from "react";
import { Modal, View, Image, TouchableOpacity, ActivityIndicator, StyleSheet, Platform } from "react-native";
import { ChevronLeft } from "lucide-react-native";
import { File, Paths } from "expo-file-system";
import Icon from "./Icon";
import { showAlert } from "./CustomAlert";

interface Props {
  uri: string | null;
  onClose: () => void;
}

/** Profil galerisi, oda sohbeti ve DM'de paylasilan bir fotografa tek
 * dokununca acilan ortak tam ekran gorunumu - ekranin alt %70'ini tam
 * genislikte kaplayan bir panel, ustunde Geri/Indir icin ayri bir bar
 * (fotografa binmiyor). Indir native'de expo-media-library ile galeriye
 * kaydediyor, web'de tarayicinin kendi indirme davranisina birakiyor. */
export default function PhotoViewerModal({ uri, onClose }: Props) {
  const [downloading, setDownloading] = useState(false);

  async function downloadPhoto(url: string) {
    if (downloading) return;
    setDownloading(true);
    try {
      if (Platform.OS === "web") {
        window.open(url, "_blank");
        return;
      }
      // expo-media-library'nin yeni sinif tabanli API'sinin web karsiligi yok
      // (paket import edilir edilmez native modulu arayip cokuyor) - sadece
      // native'de calisan bu dalda DINAMIK import ediyoruz.
      const MediaLibrary = await import("expo-media-library");
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== "granted") {
        showAlert("İzin gerekli", "Fotoğrafı galerine kaydetmek için fotoğraf iznine ihtiyacımız var.");
        return;
      }
      const downloaded = await File.downloadFileAsync(url, Paths.cache);
      await MediaLibrary.Asset.create(downloaded.uri);
      showAlert("Kaydedildi", "Fotoğraf galerine kaydedildi.");
    } catch (err: any) {
      showAlert("Kaydedilemedi", err?.message || "Fotoğraf kaydedilirken bir hata oluştu, tekrar dene.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <Modal visible={!!uri} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={styles.box}>
          <View style={styles.bar}>
            <TouchableOpacity style={styles.iconBtn} onPress={onClose} hitSlop={6}>
              <ChevronLeft size={20} color="#FFFFFF" strokeWidth={2.5} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={() => uri && downloadPhoto(uri)}
              disabled={downloading}
              hitSlop={6}
            >
              {downloading ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Icon name="download" size={18} color="#FFFFFF" />
              )}
            </TouchableOpacity>
          </View>
          {uri && <Image source={{ uri }} style={styles.image} resizeMode="contain" />}
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.92)", justifyContent: "flex-end" },
  box: {
    width: "100%",
    height: "70%",
    backgroundColor: "#121212",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: "hidden",
  },
  bar: {
    height: 64,
    flexGrow: 0,
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    backgroundColor: "#121212",
  },
  image: { flex: 1, width: "100%" },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#1E1E1E", alignItems: "center", justifyContent: "center" },
});
