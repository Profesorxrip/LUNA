import React from "react";
import Svg, { Path, Circle } from "react-native-svg";

interface Props {
  size: number;
  color: string;
}

// Altbardaki Friends ikonuyla (TabGlowIcon.tsx ICON_NODES.Friends, lucide
// Users) BIREBIR AYNI path'ler. Sadece SOLDAKI (tam gorunen) kisi dolu,
// SAGDAKI (yarim/arkada kalan) kisi hala cizgi - "sagda kalan cizgi olarak
// kalmali" (kullanici istegi). Discover'daki "Arkadaşlar" basligi VE oda
// onizlemesindeki "Arkadaş Çemberi" gizlilik ikonu (RoomPreviewScreen.tsx)
// AYNI gorsel kaynagi paylasiyor.
export default function FilledFriendsIcon({ size, color }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {/* Soldaki (tam gorunen) kisi - dis cizgisi AYNEN kaliyor (orijinal
          lucide stroke'u), sadece ici dolduruluyor. */}
      <Circle cx="9" cy="7" r="4" fill={color} stroke={color} strokeWidth={1.8} />
      <Path
        // Sonuna "Z" eklendi - path kapanmadan stroke SADECE ust kavisi
        // ciziyor, alt kenar cizgisiz (sadece dolgu) kalip yumusak/bulanik
        // duruyordu. Kapatilinca alt kenar da ust gibi net bir cizgiyle
        // ciziliyor.
        d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2Z"
        fill={color}
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Sagdaki cizgi, orijinal lucide path'iyle (tab bardakiyle) AYNI
          boyutta ve DOKUNULMADAN birakildi. */}
      <Path
        d="M16 3.128a4 4 0 0 1 0 7.744"
        fill="none"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M22 21v-2a4 4 0 0 0-3-3.87"
        fill="none"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
