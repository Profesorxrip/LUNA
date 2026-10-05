import React from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";

export interface InfoSection {
  heading?: string;
  body: string;
}

interface Props {
  title: string;
  sections: InfoSection[];
}

/** Gizlilik/Yardim gibi sabit metin ekranlari icin paylasilan govde - ozel
 * bir "X" ya da geri oku yok, diger ekranlarda oldugu gibi (bkz.
 * UserProfileScreen/PremiumScreen) sadece native geri kaydirma/donanim
 * geri tusuyla kapanıyor. */
export default function InfoScreen({ title, sections }: Props) {
  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
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
  screen: { flex: 1, backgroundColor: "#000000" },
  scrollContent: { paddingHorizontal: 20, paddingTop: 54, paddingBottom: 48 },
  title: { color: "#FFFFFF", fontSize: 22, fontWeight: "800", letterSpacing: 0.3, marginBottom: 20 },
  section: { marginBottom: 20 },
  heading: { color: "#FFFFFF", fontSize: 14, fontWeight: "700", marginBottom: 6 },
  body: { color: "rgba(255,255,255,0.7)", fontSize: 13, fontWeight: "500", lineHeight: 20 },
});
