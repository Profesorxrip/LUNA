import { useFonts, Inter_700Bold } from "@expo-google-fonts/inter";
import { Sora_700Bold } from "@expo-google-fonts/sora";
import { BebasNeue_400Regular } from "@expo-google-fonts/bebas-neue";
import { Rubik_700Bold } from "@expo-google-fonts/rubik";
import { Oswald_700Bold } from "@expo-google-fonts/oswald";
import { Pacifico_400Regular } from "@expo-google-fonts/pacifico";
import { PlayfairDisplay_700Bold } from "@expo-google-fonts/playfair-display";
import { Poppins_700Bold } from "@expo-google-fonts/poppins";
import { Caveat_700Bold } from "@expo-google-fonts/caveat";
import { RobotoMono_700Bold } from "@expo-google-fonts/roboto-mono";
import { Lobster_400Regular } from "@expo-google-fonts/lobster";
import { Anton_400Regular } from "@expo-google-fonts/anton";
import { DancingScript_700Bold } from "@expo-google-fonts/dancing-script";
import { PermanentMarker_400Regular } from "@expo-google-fonts/permanent-marker";

/** Metin etiketi (sticker) font secenekleri - fotograf ve video editorleri
 * AYNI listeyi ve AYNI font yukleme kancasini (useStickerFonts) paylasiyor. */
export const STICKER_FONTS: { id: string; label: string; family?: string }[] = [
  { id: "default", label: "Aa" },
  { id: "inter", label: "Aa", family: "Inter_700Bold" },
  { id: "sora", label: "Aa", family: "Sora_700Bold" },
  { id: "bebas", label: "AA", family: "BebasNeue_400Regular" },
  { id: "rubik", label: "Aa", family: "Rubik_700Bold" },
  { id: "oswald", label: "Aa", family: "Oswald_700Bold" },
  { id: "poppins", label: "Aa", family: "Poppins_700Bold" },
  { id: "anton", label: "AA", family: "Anton_400Regular" },
  { id: "playfair", label: "Aa", family: "PlayfairDisplay_700Bold" },
  { id: "pacifico", label: "Aa", family: "Pacifico_400Regular" },
  { id: "lobster", label: "Aa", family: "Lobster_400Regular" },
  { id: "dancing", label: "Aa", family: "DancingScript_700Bold" },
  { id: "caveat", label: "Aa", family: "Caveat_700Bold" },
  { id: "marker", label: "Aa", family: "PermanentMarker_400Regular" },
  { id: "mono", label: "Aa", family: "RobotoMono_700Bold" },
];

export function useStickerFonts() {
  return useFonts({
    Inter_700Bold,
    Sora_700Bold,
    BebasNeue_400Regular,
    Rubik_700Bold,
    Oswald_700Bold,
    Pacifico_400Regular,
    PlayfairDisplay_700Bold,
    Poppins_700Bold,
    Caveat_700Bold,
    RobotoMono_700Bold,
    Lobster_400Regular,
    Anton_400Regular,
    DancingScript_700Bold,
    PermanentMarker_400Regular,
  });
}
