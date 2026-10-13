import Svg, { Path } from "react-native-svg";

interface Props {
  size?: number;
  color?: string;
}

/** Moderator rozeti/ikonu - heroicons "ShieldCheckIcon" ile AYNI kalkan disi,
 * SADECE icindeki tik (check) cikarilmis - duz, tek parca, dolu kalkan. */
export default function ModeratorBadge({ size = 20, color = "#F5F5F7" }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12.516 2.17a.75.75 0 0 0-1.032 0 11.209 11.209 0 0 1-7.877 3.08.75.75 0 0 0-.722.515A12.74 12.74 0 0 0 2.25 9.75c0 5.942 4.064 10.933 9.563 12.348a.75.75 0 0 0 .374 0c5.499-1.415 9.563-6.406 9.563-12.348 0-1.39-.236-2.73-.67-3.985a.75.75 0 0 0-.722-.516l-.143.001c-2.996 0-5.717-1.17-7.734-3.08Z"
        fill={color}
      />
    </Svg>
  );
}
