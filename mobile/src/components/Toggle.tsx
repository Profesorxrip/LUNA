import { TouchableOpacity, View, StyleSheet } from "react-native";
import { theme } from "../theme";

interface Props {
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
}

// RN'in yerlesik <Switch>'i web'de (react-native-web) ince, "Material"
// tarzinda render ediyor - kullanicinin istedigi klasik iOS "hap" gorunumunu
// (topun TAMAMEN track icinde kaldigi) TUM platformlarda tutarli vermek icin
// elle cizildi.
export default function Toggle({ value, onValueChange, disabled }: Props) {
  return (
    <TouchableOpacity
      activeOpacity={0.8}
      disabled={disabled}
      onPress={() => onValueChange(!value)}
      style={[styles.track, { backgroundColor: value ? theme.accent : theme.border }, disabled && styles.disabled]}
    >
      <View style={[styles.thumb, value && styles.thumbOn]} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  track: { width: 51, height: 31, borderRadius: 16, padding: 2, justifyContent: "center" },
  thumb: {
    width: 27,
    height: 27,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  thumbOn: { alignSelf: "flex-end" },
  disabled: { opacity: 0.5 },
});
