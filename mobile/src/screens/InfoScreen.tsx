import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from "react-native";
import { useFonts, BebasNeue_400Regular } from "@expo-google-fonts/bebas-neue";
import Icon from "../components/Icon";

export interface InfoSection {
  heading?: string;
  body: string;
}

interface Props {
  title: string;
  sections: InfoSection[];
  // SADECE bir nav stack ekrani olarak acildiginda verilir (bkz.
  // RootNavigator.tsx PrivacyRoute) - LoginScreen.tsx kendi Modal'inda
  // zaten AYRI bir "X" overlay'i gosterdigi icin bunu vermiyor, o yuzden
  // undefined kalinca eski davranis (sadece native geri kaydirma/donanim
  // geri tusu, buyuk sola yasli baslik) korunuyor.
  onBack?: () => void;
}

export default function InfoScreen({ title, sections, onBack }: Props) {
  const [fontsLoaded] = useFonts({ BebasNeue_400Regular });
  return (
    <View style={styles.screen}>
      {onBack && (
        <View style={styles.header}>
          <TouchableOpacity onPress={onBack} hitSlop={10} style={styles.backTouch}>
            <Icon name="chevronLeft" size={22} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={[styles.titleCentered, fontsLoaded && styles.titleCenteredFontLoaded]}>{title}</Text>
          <View style={styles.headerSpacer} />
        </View>
      )}
      <ScrollView
        contentContainerStyle={[styles.scrollContent, onBack && styles.scrollContentWithBack]}
        showsVerticalScrollIndicator={false}
      >
        {!onBack && <Text style={styles.title}>{title}</Text>}
        {sections.map((s, i) => (
          <View key={i} style={styles.section}>
            {s.heading && <Text style={styles.heading}>{s.heading}</Text>}
            <Text style={styles.body}>{s.body}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  // Kullanici: "bizim arka planı deneyelim" - duz bir renk yerine
  // uygulamanin paylasilan degrade'i (AppBackground) gorunsun diye seffaf.
  // TermsScreen/PrivacyScreen kendi Modal'larinda AppBackground'i KENDILERI
  // render ediyor (bkz. LoginScreen.tsx) - normal navigasyonla acilan
  // BackgroundInfoScreen zaten App.tsx'teki paylasilan katmanin uzerinde.
  screen: { flex: 1, backgroundColor: "transparent" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingTop: 54,
    paddingBottom: 14,
  },
  backTouch: { width: 36, height: 36, alignItems: "flex-start", justifyContent: "center" },
  headerSpacer: { width: 36 },
  // NotificationSettingsScreen.tsx/EmojiPickerSheet.tsx'teki ortalanmis
  // baslikla AYNI desen - geri tusu + sabit genislikteki bosluk arasinda
  // ortalaniyor.
  titleCentered: { color: "#FFFFFF", fontSize: 16, fontWeight: "800", letterSpacing: 0.3 },
  titleCenteredFontLoaded: { fontFamily: "BebasNeue_400Regular", fontWeight: "400", fontSize: 22, letterSpacing: 1.4 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 54, paddingBottom: 48 },
  scrollContentWithBack: { paddingTop: 12 },
  title: { color: "#FFFFFF", fontSize: 22, fontWeight: "800", letterSpacing: 0.3, marginBottom: 20 },
  section: { marginBottom: 20 },
  heading: { color: "#FFFFFF", fontSize: 14, fontWeight: "700", marginBottom: 6 },
  body: { color: "rgba(255,255,255,0.7)", fontSize: 13, fontWeight: "500", lineHeight: 20 },
});
