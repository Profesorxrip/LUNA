import React from "react";
import { View, Text, Image, TouchableOpacity, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import Icon from "./Icon";

const TEXT = "#F5F0E6";
const MUTED = "#9A8F80";
const ACCENT = "#0EA5E9";

interface Props {
  avatarUrl: string;
  initial: string;
  name: string;
  handle: string;
  timeLabel: string;
  text: string | null;
  imageUrls: string[];
  locationName: string | null;
  taggedNames: string[];
  onPressImage: (url: string) => void;
  onLongPress?: () => void;
}

/** Profil ekranindaki "paylasim akisi" karti - kullanicinin gonderdigi
 * referans tasarimdaki (metin/1-2 fotograf/konum/etiketli kisi) Twitter-
 * benzeri gonderi karti. Anket (poll) ve video gonderileri BU surumde
 * DAHIL DEGIL - ayri bir asamada eklenecek. */
export default function PostCard({
  avatarUrl,
  initial,
  name,
  handle,
  timeLabel,
  text,
  imageUrls,
  locationName,
  taggedNames,
  onPressImage,
  onLongPress,
}: Props) {
  const { t } = useTranslation();
  return (
    <TouchableOpacity activeOpacity={onLongPress ? 0.8 : 1} onLongPress={onLongPress} delayLongPress={350} style={styles.card}>
      <View style={styles.header}>
        <View style={styles.avatar}>
          {avatarUrl ? <Image source={{ uri: avatarUrl }} style={styles.avatarImage} /> : <Text style={styles.avatarInitial}>{initial}</Text>}
        </View>
        <View style={styles.headerText}>
          <Text style={styles.name}>{name}</Text>
          <Text style={styles.meta}>
            @{handle} · {timeLabel}
          </Text>
        </View>
      </View>

      {!!text && <Text style={styles.body}>{text}</Text>}

      {imageUrls.length === 1 && (
        <TouchableOpacity activeOpacity={0.9} onPress={() => onPressImage(imageUrls[0])} style={styles.imageSingleWrap}>
          <Image source={{ uri: imageUrls[0] }} style={styles.imageSingle} />
        </TouchableOpacity>
      )}

      {imageUrls.length === 2 && (
        <View style={styles.imagePairWrap}>
          {imageUrls.map((url) => (
            <TouchableOpacity key={url} activeOpacity={0.9} onPress={() => onPressImage(url)} style={styles.imagePairItem}>
              <Image source={{ uri: url }} style={styles.imagePairImage} />
            </TouchableOpacity>
          ))}
        </View>
      )}

      {!!locationName && (
        <View style={styles.tagRow}>
          <Icon name="pin" size={13} color={MUTED} />
          <Text style={styles.tagText}>{locationName}</Text>
        </View>
      )}

      {taggedNames.length > 0 && (
        <View style={styles.tagRow}>
          <Icon name="people" size={13} color={MUTED} />
          <Text style={styles.tagText}>
            {t("userProfile.withPeople", { names: taggedNames.join(", ") })}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    paddingVertical: 12,
    gap: 8,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#1A2430",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImage: { width: "100%", height: "100%" },
  avatarInitial: { color: TEXT, fontWeight: "700", fontSize: 15 },
  headerText: { flex: 1 },
  name: { color: TEXT, fontWeight: "700", fontSize: 14 },
  meta: { color: MUTED, fontSize: 12, marginTop: 1 },
  body: { color: TEXT, fontSize: 14, lineHeight: 20 },
  imageSingleWrap: {
    borderRadius: 14,
    overflow: "hidden",
  },
  imageSingle: { width: "100%", aspectRatio: 1.4, backgroundColor: "#111" },
  imagePairWrap: { flexDirection: "row", gap: 6 },
  imagePairItem: { flex: 1, borderRadius: 14, overflow: "hidden" },
  imagePairImage: { width: "100%", aspectRatio: 1, backgroundColor: "#111" },
  tagRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  tagText: { color: ACCENT, fontSize: 13 },
});
