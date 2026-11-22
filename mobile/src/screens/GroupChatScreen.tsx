import React, { useEffect, useRef, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, Keyboard } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useTranslation } from "react-i18next";
import { CircleArrowDown, Phone, Send } from "lucide-react-native";
import { LockClosedIcon } from "react-native-heroicons/outline";
import AppBackground from "../components/AppBackground";
import Avatar from "../components/Avatar";
import LoadingView from "../components/LoadingView";
import { showAlert } from "../components/CustomAlert";
import { getSocket, GroupMessage, GroupDetail } from "../services/socket";
import { formatMessageTime } from "../utils/time";
import { supabase } from "../services/supabase";
import { theme } from "../theme";

const ACCENT = "#0EA5E9";
const BUBBLE_MINE_COLOR = "#2E799E";
const TEXT = "#F5F0E6";
const MUTED = "#9A8F80";

export interface GroupPeer {
  id: string;
  name: string;
  avatarUrl: string | null;
}

interface Props {
  group: GroupPeer;
  onBack: () => void;
  onOpenInfo?: (detail: GroupDetail) => void;
}

/** Grup sohbeti - DMScreen.tsx'teki ("Kişi Mesajı") ekranla GORUNUM olarak
 * BIREBIR AYNI (header/balon renkleri/giris cubugu), SADECE kullanicinin
 * istedigi grup-ozel farklarla: (1) baskasindan gelen HER yeni gonderici
 * "turu"nun ILK mesajinda pp + ustunde isim, (2) basliktaki pp/isme basinca
 * Grup Bilgisi'ne gider, (3) telefon ikonu DOGRUDAN bir grup aramasi baslatir
 * (tek kisiye degil). Ilk surum SADECE metin mesaji - DM'deki foto/ses/anket/
 * cikartma/yanitlama gibi zengin turler henuz yok (bkz. server/src/group.ts
 * dosya basi notu - DM'in kendisi de bunlara 46 ayri migration'da ulasti).
 */
export default function GroupChatScreen({ group, onBack, onOpenInfo }: Props) {
  const { t, i18n } = useTranslation();
  const [groupDetail, setGroupDetail] = useState<GroupDetail>({ id: group.id, name: group.name, avatarUrl: group.avatarUrl, members: [] });
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState("");
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const listRef = useRef<FlatList<GroupMessage>>(null);
  const socket = getSocket();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMyUserId(data.user?.id ?? null));
  }, []);

  const memberById = new Map(groupDetail.members.map((m) => [m.userId, m]));

  useEffect(() => {
    socket.emit("group:open", { groupId: group.id }, (res: any) => {
      setLoading(false);
      if (!res?.ok) return;
      setGroupDetail(res.group);
      setMessages(res.messages || []);
    });

    function handleIncoming({ groupId, message }: { groupId: string; message: GroupMessage }) {
      if (groupId !== group.id) return;
      setMessages((prev) => [...prev, message]);
    }
    socket.on("group:message", handleIncoming);
    return () => {
      socket.off("group:message", handleIncoming);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group.id]);

  function sendMessage() {
    const text = input.trim();
    if (!text) return;
    setInput("");
    Keyboard.dismiss();
    socket.emit("group:send", { groupId: group.id, text }, (res: any) => {
      if (!res?.ok) {
        showAlert(t("dm.sendFailedTitle"), res?.error || t("dm.genericSendErrorBody"));
        return;
      }
      setMessages((prev) => [...prev, res.message]);
    });
  }

  function placeholderCall() {
    showAlert(t("friends.groupCallAction"), t("profile.comingSoon"));
  }

  return (
    <View style={styles.screen}>
      <AppBackground />
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} hitSlop={10} style={{ marginTop: 1 }}>
          <View style={{ transform: [{ rotate: "90deg" }] }}>
            <CircleArrowDown size={22} color="#FFFFFF" />
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.headerProfileTouch}
          activeOpacity={0.75}
          onPress={() => onOpenInfo?.(groupDetail)}
        >
          <View style={{ marginLeft: -1 }}>
            <Avatar name={groupDetail.name} avatarUrl={groupDetail.avatarUrl} size={46} />
          </View>
          <View style={styles.headerTextBlock}>
            <Text style={styles.headerName} numberOfLines={1}>
              {groupDetail.name}
            </Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity onPress={placeholderCall} hitSlop={10}>
          <Phone size={25} color={TEXT} />
        </TouchableOpacity>
      </View>
      <LinearGradient colors={["#FFFFFF", "#38BDF8"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.headerDivider} />

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={styles.listContent}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        ListEmptyComponent={loading ? <LoadingView /> : <Text style={styles.emptyText}>{t("dm.noMessagesYet")}</Text>}
        ListHeaderComponent={
          <View style={styles.encryptionNoticeWrap}>
            <View style={styles.encryptionNotice}>
              <View style={styles.encryptionNoticeRow}>
                <View style={styles.encryptionNoticeIconWrap}>
                  <LockClosedIcon size={12} color="#FFFFFF" />
                </View>
                <Text style={styles.encryptionNoticeText}>{t("dm.encryptionNotice")}</Text>
              </View>
            </View>
          </View>
        }
        renderItem={({ item, index }) => {
          const isMine = item.fromUserId === myUserId;
          const prev = messages[index - 1];
          const groupedWithPrev = !!prev && prev.fromUserId === item.fromUserId;
          const sender = memberById.get(item.fromUserId);
          return (
            <View style={[styles.messageRow, isMine ? styles.messageRowMine : styles.messageRowTheirs, !groupedWithPrev && styles.messageRowNewGroup]}>
              {!isMine && (
                <View style={styles.senderAvatarWrap}>
                  {!groupedWithPrev ? (
                    <Avatar name={sender?.name || item.fromName} avatarUrl={sender?.avatarUrl} size={28} isFriend />
                  ) : (
                    <View style={styles.senderAvatarSpacer} />
                  )}
                </View>
              )}
              <View style={styles.bubbleCol}>
                {!isMine && !groupedWithPrev && (
                  <Text style={styles.senderName}>{sender?.name || item.fromName}</Text>
                )}
                <View style={styles.bubbleWrap}>
                  <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleTheirs]}>
                    <Text style={styles.bubbleText}>{item.text}</Text>
                    <View style={styles.metaRow}>
                      <Text style={styles.metaTime}>{formatMessageTime(item.createdAt, i18n.language)}</Text>
                    </View>
                  </View>
                </View>
              </View>
            </View>
          );
        }}
      />

      <View style={styles.inputBar}>
        <View style={[styles.inputPill, styles.inputPillNormal]}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder={t("dm.messagePlaceholder")}
            placeholderTextColor={MUTED}
            onSubmitEditing={sendMessage}
          />
        </View>
        <TouchableOpacity style={[styles.inputRoundBtn, !input.trim() && styles.inputRoundBtnDisabled]} onPress={sendMessage} hitSlop={8} disabled={!input.trim()}>
          <Send size={20} color="#141210" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Asagisindaki butun stiller DMScreen.tsx'teki (Kişi Mesajı ekrani) AYNI
  // isimli stillerle BIREBIR AYNI deger - kullanicinin "kalan herşey aynı
  // olucak birebir aynı" istegi.
  screen: { flex: 1, backgroundColor: "transparent" },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 18, paddingTop: 44, paddingBottom: 14, height: 104 },
  headerDivider: { height: 1, width: "100%" },
  headerProfileTouch: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  headerTextBlock: { flex: 1, marginLeft: -2 },
  headerName: { color: TEXT, fontSize: 18, fontWeight: "700" },
  listContent: { padding: 16, paddingBottom: 1, gap: 4 },
  emptyText: { color: MUTED, textAlign: "center", marginTop: 40, fontSize: 13 },
  encryptionNoticeWrap: { alignItems: "center", marginBottom: 10 },
  encryptionNotice: { backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, maxWidth: "90%" },
  encryptionNoticeRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  encryptionNoticeIconWrap: { width: 18, height: 18, borderRadius: 9, backgroundColor: "rgba(255,255,255,0.12)", alignItems: "center", justifyContent: "center" },
  encryptionNoticeText: { color: MUTED, fontSize: 11, flexShrink: 1 },
  messageRow: { flexDirection: "row", alignItems: "flex-end", gap: 8, maxWidth: "100%" },
  messageRowNewGroup: { marginTop: 8 },
  messageRowMine: { justifyContent: "flex-end" },
  messageRowTheirs: { justifyContent: "flex-start" },
  senderAvatarWrap: { width: 28 },
  senderAvatarSpacer: { width: 28, height: 28 },
  bubbleCol: { maxWidth: "75%" },
  senderName: { color: MUTED, fontSize: 12, fontWeight: "700", marginBottom: 2, marginLeft: 2 },
  bubbleWrap: { position: "relative" },
  bubble: { paddingHorizontal: 13, paddingVertical: 8, borderRadius: 8 },
  bubbleMine: { backgroundColor: BUBBLE_MINE_COLOR },
  bubbleTheirs: { backgroundColor: "#1E293B" },
  bubbleText: { color: TEXT, fontSize: 16, lineHeight: 21 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 3, alignSelf: "flex-end" },
  metaTime: { color: "rgba(255,255,255,0.65)", fontSize: 11 },
  inputBar: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 15 },
  inputPill: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#15202B", borderRadius: 27.5, paddingLeft: 14, paddingRight: 10 },
  inputPillNormal: { height: 55 },
  input: { flex: 1, color: TEXT, fontSize: 14, paddingTop: 7, paddingBottom: 6, outlineWidth: 0, outlineStyle: "none" } as any,
  inputRoundBtn: { width: 55, height: 55, borderRadius: 27.5, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  inputRoundBtnDisabled: { opacity: 0.5 },
});
