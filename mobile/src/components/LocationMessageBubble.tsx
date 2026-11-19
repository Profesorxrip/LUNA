import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, Linking } from "react-native";
import { MapPin, ExternalLink } from "lucide-react-native";

interface Props {
  latitude: number;
  longitude: number;
}

/** Sohbette gelen/giden konum mesaji balonu - RoomScreen'in CANLI oda
 * haritasindan (room:location) FARKLI, kalici/tek seferlik bir paylasim;
 * burada gercek bir harita gommek yerine (ek bagimlilik gerektirir) tek
 * dokunusla cihazin kendi harita uygulamasini acan sade bir kart yeterli. */
export default function LocationMessageBubble({ latitude, longitude }: Props) {
  function openMaps() {
    Linking.openURL(`https://maps.google.com/?q=${latitude},${longitude}`);
  }

  return (
    <TouchableOpacity style={styles.row} activeOpacity={0.8} onPress={openMaps}>
      <View style={styles.iconWrap}>
        <MapPin size={18} color="#FFFFFF" />
      </View>
      <View style={styles.textCol}>
        <Text style={styles.title}>Konum</Text>
        <Text style={styles.coords}>
          {latitude.toFixed(5)}, {longitude.toFixed(5)}
        </Text>
      </View>
      <ExternalLink size={14} color="rgba(255,255,255,0.7)" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 10, minWidth: 180, paddingVertical: 4 },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  textCol: { flex: 1 },
  title: { color: "#FFFFFF", fontSize: 13, fontWeight: "700" },
  coords: { color: "rgba(255,255,255,0.75)", fontSize: 11, marginTop: 1 },
});
