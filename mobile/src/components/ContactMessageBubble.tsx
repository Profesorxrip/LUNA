import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Avatar from "./Avatar";

interface Props {
  name: string;
  handle?: string | null;
  avatarUrl?: string | null;
}

/** Sohbette paylasilan bir kisi karti - "Kişi" ek menusunden secilen
 * arkadasin gonderim anindaki isim/kullanici adi/avatar'ini gosterir
 * (bkz. 0041_dm_contact_messages.sql). FileMessageBubble ile AYNI kart
 * olcusu/dolgusu, sadece dosya ikonu yerine gercek Avatar. */
export default function ContactMessageBubble({ name, handle, avatarUrl }: Props) {
  return (
    <View style={styles.card}>
      <Avatar name={name} avatarUrl={avatarUrl} size={46} ring={false} />
      <View style={styles.textCol}>
        <Text style={styles.name} numberOfLines={1}>
          {name}
        </Text>
        {!!handle && (
          <Text style={styles.handle} numberOfLines={1}>
            @{handle}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minWidth: 225,
    maxWidth: 260,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 8,
    padding: 12,
  },
  textCol: { flex: 1, minWidth: 0 },
  name: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
  handle: { color: "rgba(255,255,255,0.6)", fontSize: 12, marginTop: 2 },
});
