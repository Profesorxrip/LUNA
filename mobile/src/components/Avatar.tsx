import { Image, StyleSheet, Text, View } from "react-native";

const COLORS = ["#F97316", "#10B981", "#3B82F6", "#EC4899", "#EAB308", "#8B5CF6", "#14B8A6"];

function colorForName(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return COLORS[Math.abs(hash) % COLORS.length];
}

/** Gercek bir profil fotografi (avatarUrl) varsa onu gosterir - yoksa isme
 * gore sabit bir renk + bas harf iceren eski yedek goruntuye duser. */
export default function Avatar({ name, size = 28, avatarUrl }: { name: string; size?: number; avatarUrl?: string | null }) {
  if (avatarUrl) {
    return <Image source={{ uri: avatarUrl }} style={{ width: size, height: size, borderRadius: size / 2 }} />;
  }
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <View style={[styles.circle, { width: size, height: size, borderRadius: size / 2, backgroundColor: colorForName(name) }]}>
      <Text style={[styles.text, { fontSize: size * 0.45 }]}>{initial}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: { justifyContent: "center", alignItems: "center", flexShrink: 0 },
  text: { color: "#fff", fontWeight: "700" },
});
