import React, { useMemo, useState } from "react";
import { Image, Text, StyleSheet } from "react-native";
import { getAnimatedEmojiUrls } from "../utils/animatedEmoji";

interface Props {
  emoji: string;
  size: number;
}

/** Duz Unicode emoji karakteri yerine Google'in ucretsiz/acik lisansli (OFL)
 * Noto Animasyonlu Emoji'sini (GERCEKTEN hareket eden GIF) gosterir - bkz.
 * ../utils/animatedEmoji.ts. Bu kaynak TUM emojileri KAPSAMADIGI icin
 * (ozellikle bayrak/ZWJ/ten tonu varyantlari) birden fazla URL adayi
 * SIRAYLA denenir, hicbiri yuklenemezse eski duz emoji karakterine
 * geri donulur - boylece "tamami bu olsun" isteği bozulmadan, desteklenmeyen
 * nadir emojiler de sessizce calisir durumda kalir. */
export default function AnimatedEmoji({ emoji, size }: Props) {
  const urls = useMemo(() => getAnimatedEmojiUrls(emoji), [emoji]);
  const [attempt, setAttempt] = useState(0);

  if (attempt >= urls.length) {
    return <Text style={[styles.fallbackText, { fontSize: size }]}>{emoji}</Text>;
  }

  return (
    <Image
      source={{ uri: urls[attempt] }}
      style={{ width: size, height: size }}
      resizeMode="contain"
      onError={() => setAttempt((a) => a + 1)}
    />
  );
}

const styles = StyleSheet.create({
  fallbackText: { textAlign: "center" },
});
