import React from "react";
import { Modal, View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { WebView } from "react-native-webview";
import Icon from "./Icon";
import { theme } from "../theme";

export interface MapMarker {
  name: string;
  lat: number;
  lng: number;
  isMe: boolean;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  markers: MapMarker[];
  hiddenCount: number;
}

// Leaflet (OpenStreetMap) - API key gerektirmeyen, ucretsiz bir harita
// kutuphanesi, WebView icinde CALISTIGI icin react-native-maps'in aksine
// Expo Go'da da native kod derlemeden calisir (bkz. MediaPickerSheet.tsx'teki
// YouTube WebView ile ayni mantik).
function buildMapHtml(markers: MapMarker[]): string {
  const center = markers.length
    ? { lat: markers[0].lat, lng: markers[0].lng }
    : { lat: 20, lng: 0 };
  const zoom = markers.length ? 11 : 2;
  const markersJson = JSON.stringify(markers);
  return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <style>
    html, body, #map { height: 100%; margin: 0; padding: 0; background: #0A0A0C; }
    .luna-pin { background: #0EA5E9; color: #fff; font-weight: 700; font-size: 11px; padding: 3px 8px; border-radius: 12px; border: 2px solid #fff; white-space: nowrap; }
    .luna-pin-me { background: #38BDF8; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    const markers = ${markersJson};
    const map = L.map('map', { zoomControl: true }).setView([${center.lat}, ${center.lng}], ${zoom});
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19,
    }).addTo(map);
    markers.forEach((m) => {
      const icon = L.divIcon({
        className: '',
        html: '<div class="luna-pin' + (m.isMe ? ' luna-pin-me' : '') + '">' + m.name + '</div>',
        iconSize: null,
      });
      L.marker([m.lat, m.lng], { icon }).addTo(map);
    });
  </script>
</body>
</html>`;
}

/** Oda icindeki "Haritayi Goster" butonuyla acilan gercek harita - Konumu
 * Gizle KAPALI olan katilimcilarin GPS konumunu pin olarak gosterir (bkz.
 * RoomScreen.tsx showMap / src/utils/locationSettings.ts). */
export default function RoomMapSheet({ visible, onClose, markers, hiddenCount }: Props) {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} hitSlop={10}>
          <Icon name="chevronLeft" size={22} color={theme.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Harita</Text>
        <View style={{ width: 22 }} />
      </View>
      {markers.length === 0 ? (
        <View style={styles.empty}>
          <Icon name="pin" size={32} color={theme.textMuted} />
          <Text style={styles.emptyText}>
            Bu odada şu an konumunu paylaşan kimse yok.{"\n"}
            Katılımcılar Ayarlar'daki "Konumu Gizle"yi kapatırsa burada görünür.
          </Text>
        </View>
      ) : (
        <WebView
          source={{ html: buildMapHtml(markers) }}
          style={styles.webview}
          originWhitelist={["*"]}
        />
      )}
      {hiddenCount > 0 && (
        <View style={styles.hiddenBanner}>
          <Icon name="eyeOff" size={14} color={theme.textMuted} />
          <Text style={styles.hiddenBannerText}>
            {hiddenCount} katılımcı konumunu gizliyor.
          </Text>
        </View>
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 54,
    paddingBottom: 12,
    backgroundColor: theme.bg,
  },
  title: { color: theme.text, fontSize: 16, fontWeight: "700" },
  webview: { flex: 1, backgroundColor: theme.bg },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 40 },
  emptyText: { color: theme.textMuted, fontSize: 13, textAlign: "center", lineHeight: 19 },
  hiddenBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: theme.surface,
  },
  hiddenBannerText: { color: theme.textMuted, fontSize: 12 },
});
