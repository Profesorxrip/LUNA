import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from "react-native";
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
  // geri tusu) korunuyor.
  onBack?: () => void;
}

export default function InfoScreen({ title, sections, onBack }: Props) {
  return (
    <View style={styles.screen}>
      {onBack && (
        <View style={styles.header}>
          <TouchableOpacity onPress={onBack} hitSlop={10} style={styles.backTouch}>
            <Icon name="chevronLeft" size={22} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      )}
      <ScrollView
        contentContainerStyle={[styles.scrollContent, onBack && styles.scrollContentWithBack]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>{title}</Text>
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
  header: { position: "absolute", top: 50, left: 14, zIndex: 1 },
  backTouch: { width: 36, height: 36, alignItems: "flex-start", justifyContent: "center" },
  scrollContent: { paddingHorizontal: 20, paddingTop: 54, paddingBottom: 48 },
  scrollContentWithBack: { paddingTop: 100 },
  title: { color: "#FFFFFF", fontSize: 22, fontWeight: "800", letterSpacing: 0.3, marginBottom: 20 },
  section: { marginBottom: 20 },
  heading: { color: "#FFFFFF", fontSize: 14, fontWeight: "700", marginBottom: 6 },
  body: { color: "rgba(255,255,255,0.7)", fontSize: 13, fontWeight: "500", lineHeight: 20 },
});
