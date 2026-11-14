import React, { useEffect, useState } from "react";
import { View, Text, Image, TouchableOpacity, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import Icon from "./Icon";
import { supabase } from "../services/supabase";

const TEXT = "#F5F0E6";
const MUTED = "#9A8F80";
const ACCENT = "#0EA5E9";

interface Props {
  postId: string;
  avatarUrl: string;
  initial: string;
  name: string;
  handle: string;
  timeLabel: string;
  text: string | null;
  imageUrls: string[];
  locationName: string | null;
  taggedNames: string[];
  pollQuestion?: string | null;
  pollOptions?: string[] | null;
  pollOptionImages?: (string | null)[] | null;
  currentUserId?: string | null;
  onPressImage: (url: string) => void;
  onLongPress?: () => void;
}

/** Profil ekranindaki "paylasim akisi" karti - kullanicinin gonderdigi
 * referans tasarimdaki (metin/1-2 fotograf/konum/etiketli kisi/anket)
 * Twitter-benzeri gonderi karti. Video gonderileri BU surumde DAHIL
 * DEGIL - ayri bir asamada eklenecek. */
export default function PostCard({
  postId,
  avatarUrl,
  initial,
  name,
  handle,
  timeLabel,
  text,
  imageUrls,
  locationName,
  taggedNames,
  pollQuestion,
  pollOptions,
  pollOptionImages,
  currentUserId,
  onPressImage,
  onLongPress,
}: Props) {
  const { t } = useTranslation();
  const [pollVotes, setPollVotes] = useState<number[]>(() => (pollOptions || []).map(() => 0));
  const [myVote, setMyVote] = useState<number | null>(null);
  const [pollVoting, setPollVoting] = useState(false);

  useEffect(() => {
    if (!pollOptions || !postId) return;
    let cancelled = false;
    supabase
      .from("post_poll_votes")
      .select("option_index,user_id")
      .eq("post_id", postId)
      .then(({ data }) => {
        if (cancelled || !data) return;
        const counts = pollOptions.map(() => 0);
        let mine: number | null = null;
        for (const row of data as any[]) {
          counts[row.option_index] = (counts[row.option_index] || 0) + 1;
          if (row.user_id === currentUserId) mine = row.option_index;
        }
        setPollVotes(counts);
        setMyVote(mine);
      });
    return () => {
      cancelled = true;
    };
  }, [postId]);

  async function castPollVote(optionIndex: number) {
    if (!currentUserId || pollVoting || optionIndex === myVote) return;
    setPollVoting(true);
    const prevMine = myVote;
    setMyVote(optionIndex);
    setPollVotes((prev) => {
      const next = [...prev];
      if (prevMine !== null) next[prevMine] = Math.max(0, next[prevMine] - 1);
      next[optionIndex] = (next[optionIndex] || 0) + 1;
      return next;
    });
    await supabase.from("post_poll_votes").upsert({ post_id: postId, user_id: currentUserId, option_index: optionIndex });
    setPollVoting(false);
  }

  const pollTotalVotes = pollVotes.reduce((a, b) => a + b, 0);
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

      {!!pollQuestion && !!pollOptions && pollOptions.length > 0 && (
        <View style={styles.pollWrap}>
          <Text style={styles.pollQuestion}>{pollQuestion}</Text>
          {pollOptions.map((option, index) => {
            const count = pollVotes[index] || 0;
            const pct = pollTotalVotes > 0 ? Math.round((count / pollTotalVotes) * 100) : 0;
            const selected = myVote === index;
            return (
              <TouchableOpacity
                key={index}
                activeOpacity={0.8}
                onPress={() => castPollVote(index)}
                style={[styles.pollOption, selected && styles.pollOptionSelected]}
              >
                <View style={[styles.pollOptionFill, { width: `${pct}%` }, selected && styles.pollOptionFillSelected]} />
                {!!pollOptionImages?.[index] && (
                  <Image source={{ uri: pollOptionImages[index]! }} style={styles.pollOptionThumb} />
                )}
                <Text style={styles.pollOptionLabel} numberOfLines={1}>
                  {option}
                </Text>
                <Text style={styles.pollOptionPct}>{pct}%</Text>
              </TouchableOpacity>
            );
          })}
          <Text style={styles.pollVotesCount}>{t("userProfile.pollVotes", { count: pollTotalVotes })}</Text>
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
  pollWrap: { gap: 8 },
  pollQuestion: { color: TEXT, fontSize: 15, fontWeight: "700" },
  pollOption: {
    borderWidth: 1,
    borderColor: "#262626",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    overflow: "hidden",
    position: "relative",
  },
  pollOptionSelected: { borderColor: ACCENT },
  pollOptionFill: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "rgba(14,165,233,0.14)",
  },
  pollOptionFillSelected: { backgroundColor: "rgba(14,165,233,0.26)" },
  pollOptionThumb: { width: 40, height: 40, borderRadius: 8, marginRight: 4 },
  pollOptionLabel: { color: TEXT, fontSize: 14, fontWeight: "600", flex: 1 },
  pollOptionPct: { color: MUTED, fontSize: 13, fontWeight: "700", marginLeft: 8 },
  pollVotesCount: { color: MUTED, fontSize: 12, marginTop: 2 },
});
