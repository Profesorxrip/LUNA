import React from "react";
import Svg, { Circle, Rect, Path, Line, G } from "react-native-svg";

export type IconName =
  | "close"
  | "settings"
  | "search"
  | "people"
  | "mic"
  | "micOff"
  | "send"
  | "plus"
  | "mention"
  | "image"
  | "invite"
  | "share"
  | "globe"
  | "edit"
  | "chevronRight"
  | "chevronLeft"
  | "moreHoriz"
  | "play"
  | "eye"
  | "eyeOff"
  | "calendar"
  | "clock"
  | "hourglass"
  | "bell"
  | "bellOff"
  | "personBlock"
  | "warning";

interface Props {
  name: IconName;
  size?: number;
  color?: string;
}

/** Rave'in gercek ekran goruntusune bakilarak elle cizilmis, dis bir
 * ikon/font paketine bagli olmayan ikon seti - bkz. tasarim asamasindaki
 * LUNA Ikon Karsilastirmasi sayfasi. Hepsi 24x24 viewBox uzerinde. */
export default function Icon({ name, size = 24, color = "#F5F5F7" }: Props) {
  return <Svg width={size} height={size} viewBox="0 0 24 24">{renderShape(name, color)}</Svg>;
}

function renderShape(name: IconName, color: string) {
  switch (name) {
    case "close":
      // Diger ust bar ikonlariyla ayni gorunmez kutuya (2.5,2.5)-(21.5,21.5) hizalanmasi
      // icin grup olceklendi/ortalandi (X isareti dogal olarak digerlerinden kucuk kaliyordu).
      return (
        <G transform="translate(-2.65 -2.65) scale(1.221)">
          <Rect x={10.2} y={2.8} width={3.6} height={18.4} rx={1.6} fill={color} transform="rotate(45 12 12)" />
          <Rect x={10.2} y={2.8} width={3.6} height={18.4} rx={1.6} fill={color} transform="rotate(-45 12 12)" />
        </G>
      );
    case "settings":
      // Gunes gibi durmasin diye: ince cizgili tek halka + ince disler yerine,
      // KALIN dolu bir halka (evenodd ile "delik" acilmis daire) + 6 tane
      // halkaya bitisik, kalin dis - gercek bir disliye daha cok benziyor.
      // Diger ust bar ikonlariyla ayni gorunmez kutuya hizalanmasi icin grup olceklendi.
      return (
        <G transform="translate(1.541 1.541) scale(0.8716)">
          <Path
            d="M12 5.3 A6.7 6.7 0 1 0 12 18.7 A6.7 6.7 0 1 0 12 5.3 Z M12 9.3 A2.7 2.7 0 1 1 12 14.7 A2.7 2.7 0 1 1 12 9.3 Z"
            fill={color}
            fillRule="evenodd"
          />
          {[0, 60, 120, 180, 240, 300].map((deg) => (
            <Rect key={deg} x={9.2} y={1.1} width={5.6} height={5} rx={1.5} fill={color} transform={`rotate(${deg} 12 12)`} />
          ))}
        </G>
      );
    case "search":
      // Diger ust bar ikonlariyla ayni kalinlik/dolgunluk icin cember ve sap kalinlastirildi,
      // ayni gorunmez kutuya hizalanmasi icin grup olceklendi/ortalandi.
      return (
        <G transform="translate(-0.101 -1.172) scale(1.0199)">
          <Circle cx={10.2} cy={10.2} r={6.6} fill="none" stroke={color} strokeWidth={3.8} />
          <Path d="M8.4 7.3l5 2.9-5 2.9z" fill={color} />
          <Rect x={14.3} y={14.3} width={3.6} height={7.8} rx={1.6} fill={color} transform="rotate(-45 16.1 18.2)" />
        </G>
      );
    case "people":
      // Diger ust bar ikonlariyla ayni kalinlik/dolgunluk icin arkadaki silüet
      // tam opak yapildi ve her iki daire biraz buyutuldu, ayni gorunmez kutuya
      // hizalanmasi icin grup olceklendi/ortalandi.
      return (
        <G transform="translate(0.178 -2.303) scale(1.0556)">
          <Circle cx={16.3} cy={8.6} r={3.4} fill={color} opacity={0.95} />
          <Path
            d="M12.4 15.4c0-2.6 1.7-4.7 3.9-4.7s3.9 2.1 3.9 5c-1.2.7-2.6 1-4.1 1-1.3 0-2.6-.3-3.7-.9z"
            fill={color}
            opacity={0.95}
          />
          <Circle cx={9.3} cy={9.4} r={4.6} fill={color} />
          <Path d="M2.2 20.5c0-4.3 3.2-7.7 7.1-7.7s7.1 3.4 7.1 7.7c-2.1 1.2-4.5 1.8-7.1 1.8s-5-.6-7.1-1.8z" fill={color} />
        </G>
      );
    case "mic":
      return (
        <>
          <Rect x={9.2} y={2} width={5.6} height={11.6} rx={2.8} fill={color} />
          <Path d="M6.2 10.8a5.8 5.8 0 0011.6 0" fill="none" stroke={color} strokeWidth={2.6} strokeLinecap="round" />
          <Rect x={11} y={17.4} width={2} height={3.6} rx={1} fill={color} />
          <Rect x={7.6} y={20.4} width={8.8} height={2} rx={1} fill={color} />
        </>
      );
    case "micOff":
      return (
        <>
          <Rect x={9.2} y={2} width={5.6} height={11.6} rx={2.8} fill={color} opacity={0.5} />
          <Path
            d="M6.2 10.8a5.8 5.8 0 0010.9 2.8"
            fill="none"
            stroke={color}
            strokeWidth={2.6}
            strokeLinecap="round"
            opacity={0.5}
          />
          <Rect x={11} y={17.4} width={2} height={3.6} rx={1} fill={color} opacity={0.5} />
          <Rect x={7.6} y={20.4} width={8.8} height={2} rx={1} fill={color} opacity={0.5} />
          <Rect x={10.5} y={1} width={3} height={24} rx={1.3} fill={color} transform="rotate(38 12 12)" />
        </>
      );
    case "send":
      return <Path d="M2.6 11.6L21.5 2.7l-6.7 18.6-3.1-7.2-7.2-2.5z" fill={color} />;
    case "plus":
      return (
        <>
          <Rect x={10.4} y={2.6} width={3.2} height={18.8} rx={1.4} fill={color} />
          <Rect x={2.6} y={10.4} width={18.8} height={3.2} rx={1.4} fill={color} />
        </>
      );
    case "mention":
      // Simetrik vektor "@" (font glifi degil, sabit sekil - egri/yamuk gorunmuyor),
      // orta kalinlik + hafif buyutulmus (Rave'deki orana yakin).
      return (
        <Path
          d="M12 2C6.49 2 2 6.49 2 12s4.49 10 10 10c2.05 0 4-.63 5.64-1.79l-1.14-1.65C15.19 19.45 13.65 20 12 20c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8v1.43c0 .79-.71 1.57-1.5 1.57s-1.5-.78-1.5-1.57V12c0-2.76-2.24-5-5-5s-5 2.24-5 5 2.24 5 5 5c1.38 0 2.64-.56 3.54-1.47.65.89 1.77 1.47 2.96 1.47 1.97 0 3.5-1.6 3.5-3.57V12c0-5.51-4.49-10-10-10zm0 13c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3z"
          fill={color}
          stroke={color}
          strokeWidth={0.6}
          strokeLinejoin="round"
          transform="translate(0.6 0.6) scale(0.95)"
        />
      );
    case "image":
      // Alt bardaki diger ikonlarla AYNI gorunmez kutuya (2.5,2.5)-(21.5,21.5) hizalanmasi
      // icin butun icerik tek bir grup halinde olceklenip ortalandi.
      return (
        <G transform="translate(0.247 0.737) scale(0.9794)">
          <Rect x={2.3} y={3.8} width={19.4} height={15.4} rx={3} fill="none" stroke={color} strokeWidth={3} />
          <Circle cx={8.3} cy={9.3} r={1.9} fill={color} />
          <Path
            d="M4 17.5l5-5 3 3 3.3-4 4.7 6"
            fill="none"
            stroke={color}
            strokeWidth={3}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </G>
      );
    case "invite":
      // Kisi siluyeti biraz daha buyuk/dolu, rozet artik yesil degil beyaz (koyu art ile kontrast).
      // Diger ikonlarla ayni gorunmez kutuya hizalanmasi icin grup olceklendi/ortalandi.
      return (
        <G transform="translate(0.264 0.637) scale(0.9314)">
          <Circle cx={10.1} cy={6.8} r={4.4} fill={color} />
          <Path
            d="M2.4 20.6c0-4.3 3.5-7.6 7.7-7.6 1.2 0 2.3.2 3.2.7a6.9 6.9 0 00-1.1 3.7c0 1.5.4 2.8 1.2 3.9-1.1.3-2.2.5-3.3.5-3.2 0-5.8-.5-7.7-1.2z"
            fill={color}
          />
          <Circle cx={18} cy={17.2} r={4.8} fill="#FFFFFF" />
          <Rect x={16.8} y={13.7} width={2.4} height={7} rx={1.1} fill="#04140D" />
          <Rect x={14.5} y={16} width={7} height={2.4} rx={1.1} fill="#04140D" />
        </G>
      );
    case "share":
      // Diger ikonlarla ayni gorunmez kutuya hizalanmasi icin grup olceklendi/ortalandi (etkisi cok az, zaten uygundu).
      return (
        <G transform="translate(0.1 0) scale(1)">
          <Circle cx={18} cy={5.2} r={2.7} fill={color} />
          <Circle cx={18} cy={18.8} r={2.7} fill={color} />
          <Circle cx={6} cy={12} r={2.9} fill={color} />
          <Line x1={8.4} y1={10.5} x2={15.6} y2={6.1} stroke={color} strokeWidth={2.9} strokeLinecap="round" />
          <Line x1={8.4} y1={13.5} x2={15.6} y2={17.9} stroke={color} strokeWidth={2.9} strokeLinecap="round" />
        </G>
      );
    case "globe":
      // Diger ikonlarla ayni gorunmez kutuya hizalanmasi icin grup olceklendi/ortalandi.
      return (
        <G transform="translate(-0.04 -1.41) scale(1.016)">
          <Circle cx={10} cy={13.5} r={7.2} fill="none" stroke={color} strokeWidth={2.7} />
          <Line x1={2.5} y1={13.5} x2={17.5} y2={13.5} stroke={color} strokeWidth={2.2} />
          <Path d="M10 6c2.7 2 2.7 12.9 0 15" fill="none" stroke={color} strokeWidth={2.2} />
          <Path d="M10 6c-2.7 2-2.7 12.9 0 15" fill="none" stroke={color} strokeWidth={2.2} />
          <Path
            d="M16.6 5.4c2.5 0 4.6 2 4.6 4.6 0 3.4-4.6 8.1-4.6 8.1s-4.6-4.7-4.6-8.1c0-2.6 2.1-4.6 4.6-4.6z"
            fill={color}
          />
          <Circle cx={16.6} cy={10} r={1.7} fill="#0A0A0C" />
        </G>
      );
    case "edit":
      return (
        <>
          <Path d="M4 17.3V20h2.7L17.8 8.9l-2.7-2.7z" fill={color} />
          <Path
            d="M19.7 6.1l-1.8-1.8a1 1 0 00-1.4 0l-1.4 1.4 2.7 2.7 1.4-1.4a1 1 0 000-1.4z"
            fill={color}
          />
        </>
      );
    case "chevronRight":
      return (
        <Path d="M9 5l7 7-7 7" fill="none" stroke={color} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
      );
    case "chevronLeft":
      return (
        <Path d="M15 5l-7 7 7 7" fill="none" stroke={color} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
      );
    case "moreHoriz":
      return (
        <>
          <Circle cx={5} cy={12} r={2} fill={color} />
          <Circle cx={12} cy={12} r={2} fill={color} />
          <Circle cx={19} cy={12} r={2} fill={color} />
        </>
      );
    case "play":
      return <Path d="M6 4.5v15l13-7.5z" fill={color} />;
    case "eye":
      return (
        <>
          <Path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z" fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
          <Circle cx={12} cy={12} r={3} fill={color} />
        </>
      );
    case "eyeOff":
      return (
        <>
          <Path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z" fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
          <Circle cx={12} cy={12} r={3} fill={color} />
          <Line x1={3.5} y1={19.5} x2={20.5} y2={4.5} stroke={color} strokeWidth={2.4} strokeLinecap="round" />
        </>
      );
    case "calendar":
      return (
        <>
          <Rect x={3.5} y={4.5} width={17} height={16} rx={2.5} fill="none" stroke={color} strokeWidth={2} />
          <Line x1={3.5} y1={9.5} x2={20.5} y2={9.5} stroke={color} strokeWidth={2} />
          <Line x1={8} y1={2.5} x2={8} y2={6.5} stroke={color} strokeWidth={2} strokeLinecap="round" />
          <Line x1={16} y1={2.5} x2={16} y2={6.5} stroke={color} strokeWidth={2} strokeLinecap="round" />
        </>
      );
    case "clock":
      return (
        <>
          <Circle cx={12} cy={12} r={8.5} fill="none" stroke={color} strokeWidth={2} />
          <Path d="M12 7.5v5l3.6 2" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        </>
      );
    case "hourglass":
      return (
        <Path
          d="M6 3h12M6 21h12M7 3c0 4.5 3 6 5 6.5C9 10 7 11.5 7 16c0 2.8 2.2 5 5 5s5-2.2 5-5c0-4.5-2-6-5-6.5 2-.5 5-2 5-6.5"
          fill="none"
          stroke={color}
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      );
    case "bell":
      return (
        <Path
          d="M12 2.5c-1 0-1.8.8-1.8 1.8v.6C7.5 5.6 6 7.7 6 10.2v4l-1.6 2.6c-.3.5.1 1.2.7 1.2h14c.6 0 1-.7.7-1.2L18 14.2v-4c0-2.5-1.5-4.6-4.2-5.3v-.6c0-1-.8-1.8-1.8-1.8zM9.5 19.5a2.5 2.5 0 005 0z"
          fill={color}
        />
      );
    case "bellOff":
      return (
        <>
          <Path
            d="M12 2.5c-1 0-1.8.8-1.8 1.8v.6C7.5 5.6 6 7.7 6 10.2v4l-1.6 2.6c-.3.5.1 1.2.7 1.2h14c.6 0 1-.7.7-1.2L18 14.2v-4c0-2.5-1.5-4.6-4.2-5.3v-.6c0-1-.8-1.8-1.8-1.8zM9.5 19.5a2.5 2.5 0 005 0z"
            fill={color}
            opacity={0.5}
          />
          <Line x1={3.5} y1={20.5} x2={20.5} y2={3.5} stroke={color} strokeWidth={2.4} strokeLinecap="round" />
        </>
      );
    case "personBlock":
      return (
        <G transform="translate(0.264 0.637) scale(0.9314)">
          <Circle cx={10.1} cy={6.8} r={4.4} fill={color} />
          <Path
            d="M2.4 20.6c0-4.3 3.5-7.6 7.7-7.6 1.2 0 2.3.2 3.2.7a6.9 6.9 0 00-1.1 3.7c0 1.5.4 2.8 1.2 3.9-1.1.3-2.2.5-3.3.5-3.2 0-5.8-.5-7.7-1.2z"
            fill={color}
          />
          <Circle cx={18} cy={17.2} r={4.8} fill="#FFFFFF" />
          <Line x1={15} y1={17.2} x2={21} y2={17.2} stroke="#04140D" strokeWidth={2.2} strokeLinecap="round" />
        </G>
      );
    case "warning":
      return (
        <G>
          <Path
            d="M12 3.2 L21.5 20 L2.5 20 Z"
            fill="none"
            stroke={color}
            strokeWidth={2.2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <Line x1={12} y1={9.3} x2={12} y2={14.3} stroke={color} strokeWidth={2.2} strokeLinecap="round" />
          <Circle cx={12} cy={17.1} r={1.25} fill={color} />
        </G>
      );
    default:
      return null;
  }
}
