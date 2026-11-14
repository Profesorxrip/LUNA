import React, { useEffect, useState } from "react";
import { View, Text, Image, TouchableOpacity, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { Users, MapPin, Eye, Pin, Trash2 } from "lucide-react-native";
import { LockClosedIcon } from "react-native-heroicons/outline";
import { LinearGradient } from "expo-linear-gradient";
import Icon from "./Icon";
import Avatar, { colorForName } from "./Avatar";
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
  dateTimeLabel: string;
  text: string | null;
  imageUrls: string[];
  locationName: string | null;
  taggedPeople: { id: string; name: string; avatarUrl: string }[];
  pollQuestion?: string | null;
  pollOptions?: string[] | null;
  pollOptionImages?: (string | null)[] | null;
  visibility?: "public" | "private" | "friends";
  currentUserId?: string | null;
  isPinned?: boolean;
  onTogglePin?: () => void;
  onChangeVisibility?: (value: "public" | "private" | "friends") => void;
  onRemove?: () => void;
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
  dateTimeLabel,
  text,
  imageUrls,
  locationName,
  taggedPeople,
  pollQuestion,
  pollOptions,
  pollOptionImages,
  visibility = "public",
  currentUserId,
  isPinned = false,
  onTogglePin,
  onChangeVisibility,
  onRemove,
  onPressImage,
  onLongPress,
}: Props) {
  const { t } = useTranslation();
  const [pollVotes, setPollVotes] = useState<number[]>(() => (pollOptions || []).map(() => 0));
  const [myVote, setMyVote] = useState<number | null>(null);
  const [pollVoting, setPollVoting] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuShowVisibility, setMenuShowVisibility] = useState(false);
  const menuInteractive = !!(onTogglePin || onChangeVisibility || onRemove);

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
    <TouchableOpacity
      activeOpacity={onLongPress ? 0.8 : 1}
      onLongPress={onLongPress}
      delayLongPress={350}
      style={[styles.card, menuOpen && { zIndex: 20 }]}
    >
      <View style={[styles.header, menuOpen && { zIndex: 20 }]}>
        <View style={[styles.avatar, !avatarUrl && { backgroundColor: colorForName(name) }]}>
          {avatarUrl ? <Image source={{ uri: avatarUrl }} style={styles.avatarImage} /> : <Text style={styles.avatarInitial}>{initial}</Text>}
        </View>
        <View style={styles.headerText}>
          <Text style={styles.name}>{name.toUpperCase()}</Text>
          <View style={styles.metaRow}>
            <Text style={styles.meta}>@{handle.toUpperCase()}</Text>
            {visibility === "public" ? (
              <Icon name="worldOpen" size={13} color={MUTED} />
            ) : visibility === "private" ? (
              <LockClosedIcon size={13} color={MUTED} strokeWidth={2} />
            ) : (
              <Users size={13} color={MUTED} />
            )}
            <Text style={styles.meta}>· {dateTimeLabel}</Text>
            {isPinned && <Pin size={13} color={MUTED} fill={MUTED} />}
          </View>
        </View>
        {menuInteractive ? (
          <View style={styles.menuAnchor}>
            <TouchableOpacity
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              onPress={(e) => {
                e.stopPropagation();
                if (menuOpen) {
                  setMenuOpen(false);
                  setMenuShowVisibility(false);
                } else {
                  setMenuOpen(true);
                  setMenuShowVisibility(false);
                }
              }}
            >
              <Icon name="moreHoriz" size={18} color={MUTED} />
            </TouchableOpacity>
            {menuOpen && (
              <View style={styles.actionMenu}>
                {!menuShowVisibility ? (
                  <>
                    {!!onChangeVisibility && (
                      <TouchableOpacity
                        style={styles.actionMenuRow}
                        onPress={(e) => {
                          e.stopPropagation();
                          setMenuShowVisibility(true);
                        }}
                      >
                        <Eye size={16} color="#FFFFFF" />
                        <Text style={styles.actionMenuRowText}>{t("userProfile.changeVisibility")}</Text>
                      </TouchableOpacity>
                    )}
                    {!!onTogglePin && (
                      <TouchableOpacity
                        style={styles.actionMenuRow}
                        onPress={(e) => {
                          e.stopPropagation();
                          setMenuOpen(false);
                          onTogglePin();
                        }}
                      >
                        <Pin size={16} color="#FFFFFF" fill={isPinned ? "#FFFFFF" : "none"} />
                        <Text style={styles.actionMenuRowText}>{isPinned ? t("userProfile.unpinRoom") : t("userProfile.pinRoom")}</Text>
                      </TouchableOpacity>
                    )}
                    {!!onRemove && (
                      <TouchableOpacity
                        style={styles.actionMenuRow}
                        onPress={(e) => {
                          e.stopPropagation();
                          setMenuOpen(false);
                          onRemove();
                        }}
                      >
                        <Trash2 size={16} color="#FFFFFF" />
                        <Text style={styles.actionMenuRowText}>{t("userProfile.remove")}</Text>
                      </TouchableOpacity>
                    )}
                  </>
                ) : (
                  (
                    [
                      { key: "public" as const, label: t("userProfile.visibilityPublic") },
                      { key: "private" as const, label: t("userProfile.visibilityPrivate") },
                      { key: "friends" as const, label: t("userProfile.visibilityFriends") },
                    ] as const
                  ).map((opt) => (
                    <TouchableOpacity
                      key={opt.key}
                      style={styles.actionMenuRow}
                      onPress={(e) => {
                        e.stopPropagation();
                        setMenuOpen(false);
                        setMenuShowVisibility(false);
                        onChangeVisibility?.(opt.key);
                      }}
                    >
                      {opt.key === "public" ? (
                        <Icon name="worldOpen" size={16} color="#FFFFFF" />
                      ) : opt.key === "private" ? (
                        <LockClosedIcon size={16} color="#FFFFFF" strokeWidth={2} />
                      ) : (
                        <Users size={16} color="#FFFFFF" />
                      )}
                      <Text style={styles.actionMenuRowText}>{opt.label}</Text>
                    </TouchableOpacity>
                  ))
                )}
              </View>
            )}
          </View>
        ) : (
          <Icon name="moreHoriz" size={18} color={MUTED} />
        )}
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
              <View key={index} style={styles.pollOptionRow}>
                {!!pollOptionImages?.[index] && (
                  <Image source={{ uri: pollOptionImages[index]! }} style={styles.pollOptionThumb} />
                )}
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => castPollVote(index)}
                  style={[styles.pollOption, selected && styles.pollOptionSelected]}
                >
                  <View style={[styles.pollOptionFill, { width: `${pct}%` }, selected && styles.pollOptionFillSelected]} />
                  <Text style={styles.pollOptionLabel} numberOfLines={1}>
                    {option}
                  </Text>
                  <Text style={styles.pollOptionPct}>{pct}%</Text>
                </TouchableOpacity>
              </View>
            );
          })}
          <Text style={styles.pollVotesCount}>{t("userProfile.pollVotes", { count: pollTotalVotes })}</Text>
        </View>
      )}

      {!!locationName && (
        <View style={styles.tagRow}>
          <MapPin size={13} color="#FFFFFF" />
          <Text style={[styles.tagText, { color: "#FFFFFF" }]}>{locationName}</Text>
        </View>
      )}

      {taggedPeople.length > 0 && (
        <View style={styles.taggedPreviewRow}>
          {taggedPeople.map((person) => (
            <LinearGradient
              key={person.id}
              colors={[ACCENT, "#FFFFFF"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.taggedPillGradientBorder}
            >
              <View style={styles.taggedPill}>
                <Avatar name={person.name} avatarUrl={person.avatarUrl} size={20} />
                <Text style={styles.taggedPillText}>{person.name}</Text>
              </View>
            </LinearGradient>
          ))}
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
  metaRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 1 },
  meta: { color: MUTED, fontSize: 14 },
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
  taggedPreviewRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  taggedPillGradientBorder: { borderRadius: 20, padding: 1 },
  taggedPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#000000",
    borderRadius: 19,
    paddingVertical: 4,
    paddingLeft: 5,
    paddingRight: 10,
  },
  taggedPillText: { color: "#FFFFFF", fontSize: 13, fontWeight: "700" },
  menuAnchor: { position: "relative" },
  actionMenu: {
    position: "absolute",
    top: "100%",
    right: 0,
    marginTop: 8,
    backgroundColor: "#15202B",
    borderRadius: 14,
    paddingVertical: 4,
    minWidth: 190,
    zIndex: 10,
    overflow: "hidden",
  },
  actionMenuRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginHorizontal: 6,
    borderRadius: 12,
  },
  actionMenuRowText: { color: "#FFFFFF", fontSize: 14, fontWeight: "600" },
  pollWrap: { gap: 8 },
  pollQuestion: { color: TEXT, fontSize: 15, fontWeight: "700" },
  pollOptionRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  pollOption: {
    flex: 1,
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
  pollOptionThumb: { width: 40, height: 40, borderRadius: 8 },
  pollOptionLabel: { color: TEXT, fontSize: 14, fontWeight: "600", flex: 1 },
  pollOptionPct: { color: MUTED, fontSize: 13, fontWeight: "700", marginLeft: 8 },
  pollVotesCount: { color: MUTED, fontSize: 12, marginTop: 2 },
});
