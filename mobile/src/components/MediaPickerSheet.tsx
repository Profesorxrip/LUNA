import { useMemo, useRef, useState } from "react";
import { ActivityIndicator, Image, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { WebView } from "react-native-webview";
import { LinearGradient } from "expo-linear-gradient";
import type { MediaSource } from "../services/socket";
import { theme } from "../theme";
import { EXTERNAL_PLATFORMS } from "../utils/media";
import { extractYouTubeId, fetchYouTubeTitle } from "../utils/youtube";
import PlatformLogo from "./PlatformLogo";
import Icon from "./Icon";

interface Props {
  visible: boolean;
  onClose: () => void;
  onSelect: (source: MediaSource) => void;
}

type Mode = "grid" | "youtube" | "weburl" | "name";

const externalItems = EXTERNAL_PLATFORMS.map((p) => ({ key: p.key, label: p.label, logo: p.logo }));
const ALL_ITEMS = [
  { key: "youtube", label: "YouTube", logo: "youtube" as const },
  ...externalItems.filter((i) => i.key !== "x"),
  { key: "web", label: "Web", logo: "web" as const },
  ...externalItems.filter((i) => i.key === "x"),
];

/** Rave'in gercek "ne izlemek istersin" ekranina benzer TAM SAYFA ekran -
 * degrade arka plan + ust arama cubugu + 2 sutunlu marka logosu listesi.
 * Link yapistirma YOK - YouTube secildiginde uygulama icinde GERCEK YouTube
 * gezinilir (WebView), host normal sekilde bir videoya dokunur dokunmaz o
 * videonun basligi otomatik cekilip odanin/kartin ismi olur. Netflix/Prime/
 * Disney+/HBO Max/Twitch gibi DRM'li platformlarda video secimini
 * uygulama icinden GOREMEDIGIMIZ icin (bkz. MediaPlayer.tsx aciklamasi) host
 * ismi kendi yazar - bunlarda SENKRON da KURULMAZ, sadece "external" kaynak
 * olarak isaretlenip harici acilir. */
export default function MediaPickerSheet({ visible, onClose, onSelect }: Props) {
  const [mode, setMode] = useState<Mode>("grid");
  const [search, setSearch] = useState("");
  const [webUrlInput, setWebUrlInput] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [coverUrlInput, setCoverUrlInput] = useState("");
  const [pendingSource, setPendingSource] = useState<MediaSource | null>(null);
  const [loadingTitle, setLoadingTitle] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const detectedVideoRef = useRef<string | null>(null);

  const visibleItems = useMemo(
    () => ALL_ITEMS.filter((i) => i.label.toLowerCase().includes(search.trim().toLowerCase())),
    [search]
  );

  function reset() {
    setMode("grid");
    setSearch("");
    setWebUrlInput("");
    setNameInput("");
    setCoverUrlInput("");
    setPendingSource(null);
    setLoadingTitle(false);
    setError(null);
    detectedVideoRef.current = null;
  }

  function handleClose() {
    reset();
    onClose();
  }

  function handleBack() {
    setError(null);
    detectedVideoRef.current = null;
    setMode("grid");
  }

  // YouTube gezinme WebView'i her URL degisiminde bunu cagirir - "izle"
  // sayfasina gelindigi an (host gercekten bir videoya dokundugunda) video
  // ID'sini yakalayip basligini otomatik ceker, host'un link yapistirmasina
  // ya da isim yazmasina hic gerek kalmaz.
  async function handleYouTubeNavigation(url: string) {
    if (loadingTitle) return;
    const videoId = extractYouTubeId(url);
    if (!videoId || videoId === detectedVideoRef.current) return;
    detectedVideoRef.current = videoId;
    setLoadingTitle(true);
    const title = await fetchYouTubeTitle(videoId);
    setLoadingTitle(false);
    onSelect({ type: "youtube", url: videoId, label: title || "YouTube Videosu" });
    handleClose();
  }

  function selectItem(key: string) {
    if (key === "youtube") {
      setMode("youtube");
      return;
    }
    if (key === "web") {
      setMode("weburl");
      return;
    }
    const platform = EXTERNAL_PLATFORMS.find((p) => p.key === key);
    if (!platform) return;
    setPendingSource({ type: "external", url: platform.url, label: platform.label });
    setMode("name");
  }

  function handleWebUrlSubmit() {
    const trimmed = webUrlInput.trim();
    if (!trimmed) {
      setError("Bir web sitesi linki yaz.");
      return;
    }
    const normalized = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    setError(null);
    setPendingSource({ type: "external", url: normalized, label: "Web" });
    setMode("name");
  }

  function handleNameSubmit() {
    if (!nameInput.trim() || !pendingSource) {
      setError("Ne izledigini yaz (orn. dizi/film adi).");
      return;
    }
    onSelect({ ...pendingSource, label: nameInput.trim(), coverUrl: coverUrlInput.trim() || undefined });
    handleClose();
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleClose}>
      <View style={styles.screen}>
        {mode !== "grid" && (
          <View style={styles.topBar}>
            <TouchableOpacity onPress={handleBack} hitSlop={10}>
              <Text style={styles.topBarAction}>{"‹ Geri"}</Text>
            </TouchableOpacity>
          </View>
        )}

        {mode === "grid" ? (
          <>
            <LinearGradient
              colors={["#2a2a35", "#1c1c24", "#101014"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.searchBar}
            >
              <Icon name="search" size={18} color="rgba(255,255,255,0.85)" />
              <TextInput
                style={styles.searchInput}
                placeholder="Ara"
                placeholderTextColor="rgba(255,255,255,0.5)"
                value={search}
                onChangeText={setSearch}
              />
            </LinearGradient>
            <View style={styles.list}>
              {visibleItems.map((item) => (
                <TouchableOpacity key={item.key} style={styles.listItem} onPress={() => selectItem(item.key)}>
                  <View style={styles.listItemLogo}>
                    <PlatformLogo platform={item.logo} size={64} />
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </>
        ) : mode === "youtube" ? (
          <View style={styles.youtubeContainer}>
            <WebView
              source={{ uri: "https://m.youtube.com" }}
              style={styles.webview}
              onNavigationStateChange={(navState) => handleYouTubeNavigation(navState.url)}
              javaScriptEnabled
              domStorageEnabled
            />
            {loadingTitle && (
              <View style={styles.youtubeLoadingOverlay}>
                <ActivityIndicator color="#FFFFFF" size="large" />
                <Text style={styles.youtubeLoadingText}>Video yukleniyor...</Text>
              </View>
            )}
          </View>
        ) : mode === "weburl" ? (
          <View style={styles.formBox}>
            <Text style={styles.title}>Web sitesi linki</Text>
            <TextInput
              style={styles.input}
              placeholder="orn. wikipedia.org"
              placeholderTextColor={theme.textMuted}
              value={webUrlInput}
              onChangeText={setWebUrlInput}
              autoCapitalize="none"
              autoFocus
            />
            {error && <Text style={styles.error}>{error}</Text>}
            <TouchableOpacity style={styles.primaryButton} onPress={handleWebUrlSubmit}>
              <Text style={styles.primaryButtonText}>Devam</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.formBox}>
            <Text style={styles.title}>Ne izliyorsun?</Text>
            <Text style={styles.hint}>
              {pendingSource?.label} icin ne izledigini yaz - bu isim odanin/kartin adi olarak gorunecek.
            </Text>
            <TextInput
              style={styles.input}
              placeholder="Orn. Stranger Things, sezon 4"
              placeholderTextColor={theme.textMuted}
              value={nameInput}
              onChangeText={setNameInput}
              autoFocus
            />
            <View style={styles.coverRow}>
              {coverUrlInput.trim() ? (
                <Image source={{ uri: coverUrlInput.trim() }} style={styles.coverPreview} />
              ) : (
                <View style={[styles.coverPreview, styles.coverPreviewEmpty]}>
                  <Text style={styles.coverPreviewEmptyText}>🖼️</Text>
                </View>
              )}
              <TextInput
                style={[styles.input, styles.coverInput]}
                placeholder="Kapak gorseli linki (opsiyonel)"
                placeholderTextColor={theme.textMuted}
                value={coverUrlInput}
                onChangeText={setCoverUrlInput}
                autoCapitalize="none"
              />
            </View>
            {error && <Text style={styles.error}>{error}</Text>}
            <TouchableOpacity style={styles.primaryButton} onPress={handleNameSubmit}>
              <Text style={styles.primaryButtonText}>Ac</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#0A0A0C", padding: 20, paddingTop: 24 },
  topBar: { height: 30, justifyContent: "center", marginBottom: 12 },
  topBarAction: { color: "#FFFFFF", fontSize: 16, fontWeight: "600" },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 26,
    paddingHorizontal: 18,
    paddingVertical: 13,
    gap: 10,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  searchInput: { flex: 1, color: "#FFFFFF", fontSize: 16, outlineWidth: 0, outlineStyle: "none" } as any,
  list: { flexDirection: "row", flexWrap: "wrap" },
  listItem: { width: "50%", paddingVertical: 14, alignItems: "center" },
  listItemLogo: { height: 76, justifyContent: "center" },
  title: { color: theme.text, fontSize: 22, fontWeight: "700" },
  hint: { color: theme.textMuted, fontSize: 13, lineHeight: 19 },
  formBox: { backgroundColor: theme.bg, borderRadius: 16, padding: 20, gap: 16, marginTop: 20 },
  input: {
    backgroundColor: theme.surfaceAlt,
    color: theme.text,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  coverRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  coverInput: { flex: 1 },
  coverPreview: { width: 46, height: 46, borderRadius: 8, backgroundColor: theme.surfaceAlt },
  coverPreviewEmpty: { justifyContent: "center", alignItems: "center" },
  coverPreviewEmptyText: { fontSize: 20 },
  youtubeContainer: { flex: 1, marginHorizontal: -20, marginBottom: -20 },
  webview: { flex: 1 },
  youtubeLoadingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.8)",
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  youtubeLoadingText: { color: "#FFFFFF", fontSize: 15 },
  error: { color: theme.danger, fontSize: 13 },
  primaryButton: { backgroundColor: theme.accent, borderRadius: 10, paddingVertical: 14, alignItems: "center" },
  primaryButtonText: { color: "#04140D", fontWeight: "700", fontSize: 16 },
});
