import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { theme } from "../theme";

/** Veri cekilirken (ilk acilis) ekranda bos bir bosluk yerine gosterilen
 * basit, markaya uygun yukleniyor goruntusu - "Su an acik oda yok" gibi
 * bos-durum mesajlariyla KARISMASIN diye ayri bir bilesen: liste hala
 * YUKLENIYORSA bunu, yuklenip GERCEKTEN bossa empty-state metnini goster. */
export default function LoadingView({ label }: { label?: string }) {
  return (
    <View style={styles.container}>
      <ActivityIndicator color={theme.accent} size="small" />
      {label ? <Text style={styles.label}>{label}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingTop: 60, alignItems: "center", gap: 10 },
  label: { color: theme.textMuted, fontSize: 13 },
});
