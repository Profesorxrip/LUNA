import React, { useEffect, useRef, useState } from "react";
import { Modal, View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, ActivityIndicator, Keyboard } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { WebView } from "react-native-webview";
import * as Location from "expo-location";
import { CircleArrowDown, MapPin, Search, X, LocateFixed } from "lucide-react-native";

export interface PickedLocation {
  latitude: number;
  longitude: number;
  label?: string;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  onConfirm: (location: PickedLocation) => void;
}

interface SearchResult {
  display_name: string;
  lat: string;
  lon: string;
}

const DEFAULT_CENTER = { lat: 41.015137, lng: 28.97953 }; // Istanbul - GPS gelene kadar makul bir varsayilan

// Leaflet (OpenStreetMap) - RoomMapSheet.tsx ile AYNI yaklasim: API key
// gerektirmez, WebView icinde calistigi icin native harita SDK'si
// derlemeye gerek yok. Pin EKRANIN TAM ORTASINDA SABIT (RN tarafinda,
// bu dosyanin asagisinda), harita onun ALTINDA kaydirilir (Google
// Maps/WhatsApp'in "konum sec" ekranlarindaki AYNI desen) - haritanin
// kendisi marker CIZMEZ, sadece merkez koordinatini "moveend"de RN'e
// postMessage ile bildirir.
function buildMapHtml(center: { lat: number; lng: number }): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <style>
    html, body, #map { height: 100%; margin: 0; padding: 0; background: #15202B; }
    .leaflet-control-attribution { font-size: 9px; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    const map = L.map('map', { zoomControl: false, attributionControl: true }).setView([${center.lat}, ${center.lng}], 15);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19,
    }).addTo(map);

    function reportCenter() {
      const c = map.getCenter();
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'center', lat: c.lat, lng: c.lng }));
    }
    map.on('moveend', reportCenter);

    function handleMessage(event) {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'flyTo') {
          map.flyTo([msg.lat, msg.lng], msg.zoom || 16);
        }
      } catch (e) {}
    }
    document.addEventListener('message', handleMessage);
    window.addEventListener('message', handleMessage);

    setTimeout(reportCenter, 300);
  </script>
</body>
</html>`;
}

/** "Konum" secenegine basinca acilan profesyonel konum secim ekrani -
 * Galeriden Sec (GalleryPickerModal) ile AYNI tam ekranli, lacivert
 * temali dil. Harita GPS konumuyla acilir, kullanici haritayi
 * kaydirarak (merkezdeki sabit pin ile) istedigi noktayi secebilir,
 * ya da yer arayabilir; alttaki buton o an pinin gosterdigi konumu
 * gonderir. */
export default function LocationPickerModal({ visible, onClose, onConfirm }: Props) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const webviewRef = useRef<WebView>(null);
  const reverseGeocodeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [mapReady, setMapReady] = useState(false);
  const [center, setCenter] = useState(DEFAULT_CENTER);
  const [address, setAddress] = useState<string | null>(null);
  const [locatingMe, setLocatingMe] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setAddress(null);
    setSearchQuery("");
    setSearchResults([]);
    setMapReady(true);
    locateMe();
    return () => {
      if (reverseGeocodeTimer.current) clearTimeout(reverseGeocodeTimer.current);
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [visible]);

  async function locateMe() {
    setLocatingMe(true);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) return;
      const pos = await Location.getCurrentPositionAsync({});
      const next = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      setCenter(next);
      webviewRef.current?.postMessage(JSON.stringify({ type: "flyTo", ...next, zoom: 16 }));
    } catch {
      // konum alinamazsa varsayilan merkezde kalinir
    } finally {
      setLocatingMe(false);
    }
  }

  function handleWebviewMessage(event: { nativeEvent: { data: string } }) {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === "center") {
        const next = { lat: msg.lat, lng: msg.lng };
        setCenter(next);
        scheduleReverseGeocode(next);
      }
    } catch {
      // yoksay
    }
  }

  function scheduleReverseGeocode(point: { lat: number; lng: number }) {
    if (reverseGeocodeTimer.current) clearTimeout(reverseGeocodeTimer.current);
    reverseGeocodeTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${point.lat}&lon=${point.lng}&zoom=16`,
          { headers: { Accept: "application/json" } }
        );
        const data = await res.json();
        setAddress(data?.display_name ?? null);
      } catch {
        setAddress(null);
      }
    }, 600);
  }

  function handleSearchChange(text: string) {
    setSearchQuery(text);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!text.trim()) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    searchTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(text)}&limit=8`,
          { headers: { Accept: "application/json" } }
        );
        const data = await res.json();
        setSearchResults(Array.isArray(data) ? data : []);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 450);
  }

  function handlePickResult(result: SearchResult) {
    const lat = parseFloat(result.lat);
    const lng = parseFloat(result.lon);
    Keyboard.dismiss();
    setSearchQuery("");
    setSearchResults([]);
    setCenter({ lat, lng });
    setAddress(result.display_name);
    webviewRef.current?.postMessage(JSON.stringify({ type: "flyTo", lat, lng, zoom: 16 }));
  }

  function handleConfirm() {
    onConfirm({ latitude: center.lat, longitude: center.lng, label: address ?? undefined });
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
          <Text style={styles.headerTitle}>{t("dm.locationPickerTitle")}</Text>
          <TouchableOpacity style={styles.headerBtn} onPress={handleConfirm} hitSlop={10}>
            <View style={{ transform: [{ rotate: "180deg" }] }}>
              <CircleArrowDown size={22} color="#FFFFFF" />
            </View>
          </TouchableOpacity>
        </View>

        <View style={styles.mapWrap}>
          {mapReady && (
            <WebView
              ref={webviewRef}
              source={{ html: buildMapHtml(DEFAULT_CENTER) }}
              style={styles.webview}
              originWhitelist={["*"]}
              onMessage={handleWebviewMessage}
            />
          )}

          {/* Haritanin TAM ORTASINDA sabit pin - harita bunun ALTINDA kayar */}
          <View style={styles.pinWrap} pointerEvents="none">
            <MapPin size={38} color="#4A7E96" fill="#4A7E96" strokeWidth={1.5} />
            <View style={styles.pinShadow} />
          </View>

          <View style={[styles.searchBar, { top: 12 }]}>
            <Search size={16} color="rgba(255,255,255,0.6)" />
            <TextInput
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={handleSearchChange}
              placeholder={t("dm.locationSearchPlaceholder")}
              placeholderTextColor="rgba(255,255,255,0.5)"
              returnKeyType="search"
            />
            {searching ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : searchQuery.length > 0 ? (
              <TouchableOpacity onPress={() => handleSearchChange("")} hitSlop={8}>
                <X size={16} color="rgba(255,255,255,0.6)" />
              </TouchableOpacity>
            ) : null}
          </View>

          {searchResults.length > 0 && (
            <View style={styles.resultsCard}>
              <FlatList
                data={searchResults}
                keyExtractor={(item, idx) => `${item.lat}-${item.lon}-${idx}`}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => (
                  <TouchableOpacity style={styles.resultRow} onPress={() => handlePickResult(item)}>
                    <MapPin size={16} color="rgba(255,255,255,0.6)" />
                    <Text style={styles.resultText} numberOfLines={2}>
                      {item.display_name}
                    </Text>
                  </TouchableOpacity>
                )}
              />
            </View>
          )}

          <TouchableOpacity style={styles.recenterBtn} onPress={locateMe} hitSlop={8}>
            {locatingMe ? <ActivityIndicator size="small" color="#FFFFFF" /> : <LocateFixed size={26} color="#FFFFFF" />}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

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
  mapWrap: { flex: 1, position: "relative" },
  webview: { flex: 1, backgroundColor: "#15202B" },
  pinWrap: {
    position: "absolute",
    top: "50%",
    left: "50%",
    marginLeft: -19,
    marginTop: -40,
    alignItems: "center",
  },
  pinShadow: {
    width: 10,
    height: 4,
    borderRadius: 5,
    backgroundColor: "rgba(0,0,0,0.35)",
    marginTop: 2,
  },
  searchBar: {
    position: "absolute",
    left: 16,
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#1E2A36",
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 46,
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  searchInput: { flex: 1, color: "#FFFFFF", fontSize: 14 },
  resultsCard: {
    position: "absolute",
    top: 64,
    left: 16,
    right: 16,
    maxHeight: 260,
    backgroundColor: "#1E2A36",
    borderRadius: 14,
    paddingVertical: 4,
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  resultRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  resultText: { color: "#FFFFFF", fontSize: 13, flex: 1, lineHeight: 18 },
  recenterBtn: {
    position: "absolute",
    right: 16,
    bottom: 16,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(21,32,43,0.9)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
});
