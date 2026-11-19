import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, Linking } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { MapPin, ChevronRight } from "lucide-react-native";

interface Props {
  latitude: number;
  longitude: number;
}

const PIN_COLOR = "#38BDF8";
const MAP_COLORS = ["#101A33", "#1E3258"] as const;

/** Sohbette gelen/giden konum mesaji balonu - RoomScreen'in CANLI oda
 * haritasindan (room:location) FARKLI, kalici/tek seferlik bir paylasim;
 * burada gercek bir harita gommek yerine (ek bagimlilik gerektirir) sahte
 * bir harita dokusu (gradyan + yol cizgileri + dusen igne) uzerine tek
 * dokunusla cihazin kendi harita uygulamasini acan bir kart yeterli. */
export default function LocationMessageBubble({ latitude, longitude }: Props) {
  function openMaps() {
    Linking.openURL(`https://maps.google.com/?q=${latitude},${longitude}`);
  }

  return (
    <TouchableOpacity style={styles.card} activeOpacity={0.85} onPress={openMaps}>
      <LinearGradient colors={MAP_COLORS} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.map}>
        <View style={[styles.mapLine, { top: 16, left: -20, width: 180, transform: [{ rotate: "14deg" }] }]} />
        <View style={[styles.mapLine, { top: 50, left: -30, width: 200, transform: [{ rotate: "-8deg" }] }]} />
        <View style={[styles.mapLine, { top: 0, left: 54, width: 100, transform: [{ rotate: "90deg" }] }]} />
        <View style={styles.pinShadow} />
        <View style={styles.pinBadge}>
          <MapPin size={14} color={PIN_COLOR} fill={PIN_COLOR} />
        </View>
      </LinearGradient>
      <View style={styles.infoRow}>
        <View>
          <Text style={styles.title}>Konum</Text>
          <Text style={styles.coords}>
            {latitude.toFixed(5)}, {longitude.toFixed(5)}
          </Text>
        </View>
        <ChevronRight size={16} color="rgba(255,255,255,0.6)" />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: { width: 225, borderRadius: 8, overflow: "hidden" },
  map: { height: 95, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  mapLine: { position: "absolute", height: 2, backgroundColor: "rgba(255,255,255,0.12)" },
  pinShadow: { position: "absolute", bottom: 23, width: 14, height: 5, borderRadius: 7, backgroundColor: "rgba(0,0,0,0.35)" },
  pinBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: PIN_COLOR,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(0,0,0,0.25)",
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  title: { color: "#FFFFFF", fontSize: 13, fontWeight: "700" },
  coords: { color: "rgba(255,255,255,0.75)", fontSize: 11, marginTop: 1 },
});
