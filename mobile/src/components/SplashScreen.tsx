import { View, StyleSheet } from "react-native";
import LunaSpinner from "./LunaSpinner";

/** App.tsx'te oturum kontrol edilirken (checkingSession) gosterilen acilis
 * ekrani - sadece LUNA'ya ozel "Ay Evreleri" spinner'i (bkz.
 * LunaSpinner.tsx) ortada doner. Logo BILEREK yok - bir yukleniyor
 * ekraninda hem logo hem spinner gereksiz kalabalik yaratiyordu, spinner
 * kendi basina zaten markayi tasiyor. */
export default function SplashScreen() {
  return (
    <View style={styles.container}>
      <LunaSpinner size={84} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center" },
});
