import React from "react";
import { Text, TouchableOpacity, View, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MessageCircle, Phone } from "lucide-react-native";
import { MicrophoneIcon as MicrophoneOutline } from "react-native-heroicons/outline";
import { theme } from "../theme";
import Avatar from "./Avatar";
import Icon from "./Icon";

interface BaseProps {
  name: string;
  avatarUrl?: string | null;
  onPress: () => void;
}

interface ActiveCallProps extends BaseProps {
  incoming?: false;
  elapsedLabel: string;
  muted: boolean;
  onToggleMute: () => void;
  speakerOn: boolean;
  onToggleSpeaker: () => void;
  onEndCall: () => void;
}

interface IncomingCallProps extends BaseProps {
  incoming: true;
  // "Sesli arama" / "Görüntülü arama" - suren sayac yerine arama TURUNU
  // gosteriyor, cunku henuz cevaplanmadi.
  callTypeLabel: string;
  onAccept: () => void;
  onDecline: () => void;
  onMessage: () => void;
}

type Props = ActiveCallProps | IncomingCallProps;

/** Arama ekrani kucultulunce (ya da uygulama icindeyken gelen bir arama
 * bildirimi olarak) bildirim cubugunun hemen altinda, sagdan soldan tam
 * yapisik beliren AYNI kutu - iki modu var:
 * - Devam eden arama (incoming=false/yok): sure + hoparlor/mikrofon/kapat.
 * - Gelen arama (incoming=true): arama turu yazisi + mesaj/reddet/kabul.
 * zIndex SART - altindaki ekran icerigi (bkz. __DevHarness.tsx marginTop)
 * banner'a dogru yukari cekildigi icin kutular gercekten ust uste biniyor;
 * zIndex olmazsa altindaki ekranin dokunma alani bu butonlari gizlice
 * yutuyor (DOM'da SONRA gelen kazanir). */
export default function MinimizedCallBanner(props: Props) {
  const { name, avatarUrl, onPress } = props;
  const insets = useSafeAreaInsets();
  return (
    <TouchableOpacity
      style={[styles.banner, { marginTop: insets.top }]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <Text style={styles.text} numberOfLines={1}>
        {props.incoming ? props.callTypeLabel : props.elapsedLabel}
      </Text>
      <View style={styles.identityWrap}>
        <Avatar name={name} avatarUrl={avatarUrl} size={32} ring={false} />
        <Text style={styles.nameText} numberOfLines={1}>
          {name}
        </Text>
      </View>
      <View style={styles.actionsWrap}>
        {props.incoming ? (
          <>
            <TouchableOpacity style={styles.actionButton} onPress={props.onMessage} hitSlop={8}>
              <MessageCircle size={20} color="#FFFFFF" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionButtonEnd} onPress={props.onDecline} hitSlop={8}>
              <View style={{ transform: [{ rotate: "135deg" }] }}>
                <Phone size={18} color="#FFFFFF" />
              </View>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionButtonAccept} onPress={props.onAccept} hitSlop={8}>
              <Phone size={18} color="#FFFFFF" />
            </TouchableOpacity>
          </>
        ) : (
          <>
            <TouchableOpacity
              style={[styles.actionButton, props.speakerOn && styles.actionButtonActive]}
              onPress={props.onToggleSpeaker}
              hitSlop={8}
            >
              <Icon name="sesAcik1" size={20} color={props.speakerOn ? theme.bg : "#FFFFFF"} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionButton, props.muted && styles.actionButtonActive]}
              onPress={props.onToggleMute}
              hitSlop={8}
            >
              <MicrophoneOutline size={20} color={props.muted ? theme.bg : "#FFFFFF"} strokeWidth={2} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionButtonEnd} onPress={props.onEndCall} hitSlop={8}>
              <View style={{ transform: [{ rotate: "135deg" }] }}>
                <Phone size={18} color="#FFFFFF" />
              </View>
            </TouchableOpacity>
          </>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: "#1E293B",
    paddingVertical: 35,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  text: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 13,
    transform: [{ translateY: 17 }],
  },
  identityWrap: {
    position: "absolute",
    left: 16,
    bottom: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  nameText: { color: "#FFFFFF", fontWeight: "700", fontSize: 13 },
  actionsWrap: {
    position: "absolute",
    right: 16,
    bottom: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  actionButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(255,255,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  actionButtonActive: { backgroundColor: "#FFFFFF" },
  actionButtonEnd: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: theme.danger,
    alignItems: "center",
    justifyContent: "center",
  },
  actionButtonAccept: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#22C55E",
    alignItems: "center",
    justifyContent: "center",
  },
});
