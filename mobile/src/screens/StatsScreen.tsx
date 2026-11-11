import React, { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from "react-native";
import { useTranslation } from "react-i18next";
import { useFonts, BebasNeue_400Regular } from "@expo-google-fonts/bebas-neue";
import { Clock, Timer, DoorOpen, Users } from "lucide-react-native";
import Svg, { Circle, G } from "react-native-svg";
import { LinearGradient } from "expo-linear-gradient";
import { supabase } from "../services/supabase";
import { getSocket } from "../services/socket";
import Icon from "../components/Icon";
import LoadingView from "../components/LoadingView";
import { triggerHaptic } from "../utils/haptics";

interface Props {
  onBack: () => void;
}

const ROW_ICON_COLOR = "#FFFFFF";
const MUTED = "rgba(255,255,255,0.6)";

interface ActivityStats {
  totalHours: number;
  longestSessionHours: number;
  biggestRoom: number;
  daily: Record<string, number>;
}

interface PlatformStat {
  platform: string;
  hours: number;
}

function formatHours(n: number): string {
  return (Math.round(n * 10) / 10).toString();
}

const CHART_HEIGHT = 150;
const MAX_BAR_WIDTH = 16;
const DAY_MS = 24 * 60 * 60 * 1000;

// UserProfileScreen.tsx'teki MONTHS haritasinin AYNISI (kisa ay adlari) -
// x ekseni etiketlerinde "3 Kas" gibi gun+ay gostermek icin.
const MONTHS: Record<string, string[]> = {
  tr: ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"],
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  de: ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"],
  fr: ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."],
  ar: ["ينا", "فبر", "مار", "أبر", "ماي", "يون", "يول", "أغس", "سبت", "أكت", "نوف", "ديس"],
  ku: ["Rêb", "Sib", "Ada", "Nîs", "Gul", "Hez", "Tîr", "Teb", "Îlo", "Cot", "Mij", "Ber"],
  el: ["Ιαν", "Φεβ", "Μάρ", "Απρ", "Μάι", "Ιούν", "Ιούλ", "Αύγ", "Σεπ", "Οκτ", "Νοέ", "Δεκ"],
  ru: ["янв", "февр", "март", "апр", "май", "июнь", "июль", "авг", "сент", "окт", "нояб", "дек"],
  az: ["Yan", "Fev", "Mar", "Apr", "May", "İyn", "İyl", "Avq", "Sen", "Okt", "Noy", "Dek"],
  es: ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"],
};

type RangeKey = "7d" | "30d" | "90d" | "365d" | "all";

const RANGES: { key: RangeKey; labelKey: string }[] = [
  { key: "7d", labelKey: "userProfile.range7d" },
  { key: "30d", labelKey: "userProfile.range30d" },
  { key: "90d", labelKey: "userProfile.range90d" },
  { key: "365d", labelKey: "userProfile.range365d" },
  { key: "all", labelKey: "userProfile.rangeAll" },
];

interface Bin {
  label: string;
  fullLabel: string;
  hours: number; // gunluk ORTALAMA - cubuk yuksekligi bunu kullanir, eksen hep 0-24 kalir
}

function parseDaily(daily: Record<string, number>): { time: number; hours: number }[] {
  return Object.entries(daily).map(([key, hours]) => {
    const [y, m, d] = key.split("-").map(Number);
    return { time: Date.UTC(y, m - 1, d), hours };
  });
}

function daysInMonth(y: number, m: number): number {
  return Math.round((Date.UTC(y, m + 1, 1) - Date.UTC(y, m, 1)) / DAY_MS);
}

function daysInYear(y: number): number {
  return Math.round((Date.UTC(y + 1, 0, 1) - Date.UTC(y, 0, 1)) / DAY_MS);
}

function dailyBins(entries: { time: number; hours: number }[], count: number, months: string[]): Bin[] {
  const now = new Date();
  const todayUTC = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const byTime = new Map(entries.map((e) => [e.time, e.hours]));
  const bins: Bin[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const t = todayUTC - i * DAY_MS;
    const date = new Date(t);
    const day = date.getUTCDate();
    const month = months[date.getUTCMonth()];
    const hours = byTime.get(t) || 0;
    bins.push({ label: `${day}\n${month}`, fullLabel: `${day} ${month} ${date.getUTCFullYear()}`, hours });
  }
  return bins;
}

function weeklyBins(entries: { time: number; hours: number }[], weeksCount: number, months: string[]): Bin[] {
  const now = new Date();
  const todayUTC = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const bins: Bin[] = [];
  for (let w = weeksCount - 1; w >= 0; w--) {
    const end = todayUTC - w * 7 * DAY_MS;
    const start = end - 6 * DAY_MS;
    let sum = 0;
    for (const e of entries) if (e.time >= start && e.time <= end) sum += e.hours;
    const startDate = new Date(start);
    const endDate = new Date(end);
    const day = startDate.getUTCDate();
    const month = months[startDate.getUTCMonth()];
    bins.push({
      label: `${day}\n${month}`,
      fullLabel: `${day} ${month} - ${endDate.getUTCDate()} ${months[endDate.getUTCMonth()]}`,
      hours: Math.round((sum / 7) * 10) / 10,
    });
  }
  return bins;
}

function monthlyBins(entries: { time: number; hours: number }[], monthsCount: number | null, months: string[]): Bin[] {
  const now = new Date();
  const curY = now.getFullYear();
  const curM = now.getMonth();
  let startY: number;
  let startM: number;
  if (monthsCount) {
    const idx = curY * 12 + curM - (monthsCount - 1);
    startY = Math.floor(idx / 12);
    startM = ((idx % 12) + 12) % 12;
  } else if (entries.length === 0) {
    startY = curY;
    startM = curM;
  } else {
    const minDate = new Date(Math.min(...entries.map((e) => e.time)));
    startY = minDate.getUTCFullYear();
    startM = minDate.getUTCMonth();
  }
  const bins: Bin[] = [];
  let y = startY;
  let m = startM;
  while (y < curY || (y === curY && m <= curM)) {
    const monthStart = Date.UTC(y, m, 1);
    const monthEnd = Date.UTC(y, m + 1, 1) - 1;
    let sum = 0;
    for (const e of entries) if (e.time >= monthStart && e.time <= monthEnd) sum += e.hours;
    const isCurrentMonth = y === curY && m === curM;
    const dayCount = isCurrentMonth ? now.getDate() : daysInMonth(y, m);
    bins.push({
      label: `${months[m]}\n${y}`,
      fullLabel: `${months[m]} ${y}`,
      hours: Math.round((sum / dayCount) * 10) / 10,
    });
    m += 1;
    if (m > 11) {
      m = 0;
      y += 1;
    }
  }
  return bins;
}

function yearlyBins(entries: { time: number; hours: number }[]): Bin[] {
  const now = new Date();
  const curY = now.getFullYear();
  const startY = entries.length === 0 ? curY : new Date(Math.min(...entries.map((e) => e.time))).getUTCFullYear();
  const bins: Bin[] = [];
  for (let y = startY; y <= curY; y++) {
    const yearStart = Date.UTC(y, 0, 1);
    const yearEnd = Date.UTC(y + 1, 0, 1) - 1;
    let sum = 0;
    for (const e of entries) if (e.time >= yearStart && e.time <= yearEnd) sum += e.hours;
    const isCurrentYear = y === curY;
    const dayCount = isCurrentYear
      ? Math.floor((Date.UTC(curY, now.getMonth(), now.getDate()) - yearStart) / DAY_MS) + 1
      : daysInYear(y);
    bins.push({
      label: String(y),
      fullLabel: String(y),
      hours: Math.round((sum / dayCount) * 10) / 10,
    });
  }
  return bins;
}

function getBins(range: RangeKey, entries: { time: number; hours: number }[], months: string[]): Bin[] {
  switch (range) {
    case "7d":
      return dailyBins(entries, 7, months);
    case "30d":
      return dailyBins(entries, 30, months);
    case "90d":
      return weeklyBins(entries, 13, months);
    case "365d":
      return monthlyBins(entries, 12, months);
    case "all": {
      const monthly = monthlyBins(entries, null, months);
      return monthly.length > 36 ? yearlyBins(entries) : monthly;
    }
  }
}

// Kac cubuk olursa olsun en fazla ~6 etiket gosterir (hepsini yazmak az
// cubukta sorun degil ama coksa cakisir) - ilk/son HER ZAMAN dahil, aradakiler
// esit araliklarla seciliyor (bkz. dataviz skill - "selective direct labels").
function pickTickIndices(count: number): Set<number> {
  if (count <= 12) return new Set(Array.from({ length: count }, (_, i) => i));
  const tickCount = 6;
  const ticks = new Set<number>();
  for (let i = 0; i < tickCount; i++) {
    ticks.add(Math.round((i * (count - 1)) / (tickCount - 1)));
  }
  return ticks;
}

/** "Günlük Saatler" grafigi - server/src/index.ts "user:activityStats" artik
 * TUM gecmisi dondurur (bkz. supabase/migrations/
 * 0024_activity_stats_full_history.sql). Profesyonel aktivite grafiklerinin
 * (Apple Health/Screen Time tarzi) standart deseni: 2500 gunu tek seferde
 * gostermeye CALISMAK yerine bir ARALIK secici (7G/30G/3A/1Y/Tümü) + secilen
 * araliga gore COZUNURLUGU DEGISEN gruplama (gunluk -> haftalik -> aylik ->
 * yillik "binning") - her zaman okunakli sayida (<=30) cubuk, sabit 0-24
 * eksen SADECE gunluk gorunumde (haftalik/aylik toplamlar 24'u asabildigi
 * icin orada eksen veriye gore olcekleniyor), dokunarak tek cubugun tam
 * degerini goren bir "tooltip" (bkz. dataviz skill - mobilde hover yerine
 * tap). */
function DailyHoursChart({
  daily,
  t,
  lang,
}: {
  daily: Record<string, number>;
  t: (key: string, opts?: any) => string;
  lang: string;
}) {
  const months = MONTHS[lang] ?? MONTHS.en;
  const [range, setRange] = useState<RangeKey>("30d");
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [plotWidth, setPlotWidth] = useState<number | null>(null);

  const entries = parseDaily(daily);
  const bins = getBins(range, entries, months);
  const axisMax = 24;
  const ticks = pickTickIndices(bins.length);
  const active = activeIndex !== null ? bins[activeIndex] : null;

  const columnWidth = plotWidth ? plotWidth / bins.length : MAX_BAR_WIDTH;
  const barWidth = Math.max(Math.min(columnWidth - 6, MAX_BAR_WIDTH), 2);

  function selectRange(next: RangeKey) {
    triggerHaptic();
    setRange(next);
    setActiveIndex(null);
  }

  return (
    <View style={chartStyles.wrap}>
      <Text style={chartStyles.title}>{t("userProfile.dailyHoursChart")}</Text>

      <View style={chartStyles.tabsRow}>
        {RANGES.map((r) => {
          const isActive = r.key === range;
          return (
            <TouchableOpacity
              key={r.key}
              style={[chartStyles.tab, isActive && chartStyles.tabActive]}
              onPress={() => selectRange(r.key)}
            >
              <Text style={[chartStyles.tabText, isActive && chartStyles.tabTextActive]}>{t(r.labelKey)}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={chartStyles.plotArea} onLayout={(e) => setPlotWidth(e.nativeEvent.layout.width)}>
        {/* Sol dikey + alt yatay cizgi - birlikte "L" seklinde tek eksen */}
        <View style={chartStyles.yAxisLine} />
        <View style={chartStyles.xAxisLine} />
        <View style={chartStyles.axisLabels} pointerEvents="none">
          <Text style={chartStyles.axisLabel}>{formatHours(axisMax)}</Text>
          <Text style={chartStyles.axisLabel}>{formatHours(axisMax / 2)}</Text>
          <Text style={chartStyles.axisLabel}>0</Text>
        </View>
        <View style={chartStyles.barsRow}>
          {bins.map((b, i) => {
            const isActiveBar = i === activeIndex;
            return (
              <TouchableOpacity
                key={i}
                style={chartStyles.column}
                activeOpacity={0.75}
                onPress={() => setActiveIndex((prev) => (prev === i ? null : i))}
              >
                {isActiveBar ? (
                  <LinearGradient
                    colors={["#FFFFFF", "#38BDF8"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 0, y: 1 }}
                    style={[
                      chartStyles.bar,
                      { width: barWidth, height: Math.max((b.hours / axisMax) * CHART_HEIGHT, 2), opacity: 1 },
                    ]}
                  />
                ) : (
                  <View
                    style={[chartStyles.bar, { width: barWidth, height: Math.max((b.hours / axisMax) * CHART_HEIGHT, 2) }]}
                  />
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
      <View style={chartStyles.xAxisTicks}>
        {bins.map((b, i) => (
          <Text key={i} style={chartStyles.dayLabel}>
            {ticks.has(i) ? b.label : ""}
          </Text>
        ))}
      </View>
      {active && (
        <Text style={chartStyles.selectedDate}>
          {`${active.fullLabel.replace("\n", " ")} · ${t("userProfile.hoursShort", { count: formatHours(active.hours) })}`}
        </Text>
      )}
    </View>
  );
}

// supabase/migrations/0025_user_platform_stats.sql'deki platform anahtarlari
// (mobile/src/utils/media.ts EXTERNAL_PLATFORMS'la AYNI) icin marka adlari -
// marka isimleri dile gore CEVRILMEZ, her dilde oldugu gibi gosterilir.
const PLATFORM_LABELS: Record<string, string> = {
  youtube: "YouTube",
  netflix: "Netflix",
  prime: "Prime Video",
  disney: "Disney+",
  hbomax: "HBO Max",
  twitch: "Twitch",
  spotify: "Spotify",
};

// dataviz skill'indeki dogrulanmis kategorik paletten SABIT bir
// platform->renk eslemesi - renk veriye (saate/siraya) gore DEGIL, platform
// KIMLIGINE gore atanir, boylece ayni platform her ac/satista hep ayni
// renkte kalir ("color follows identity, never rank").
const PLATFORM_COLORS: Record<string, string> = {
  youtube: "#3987e5",
  netflix: "#d95926",
  spotify: "#199e70",
  prime: "#c98500",
  disney: "#d55181",
  hbomax: "#008300",
  twitch: "#9085e9",
};
const OTHER_COLOR = "rgba(255,255,255,0.28)";

const DONUT_SIZE = 168;
const DONUT_STROKE = 24;
const DONUT_RADIUS = (DONUT_SIZE - DONUT_STROKE) / 2;
const DONUT_CENTER = DONUT_SIZE / 2;
const DONUT_CIRCUMFERENCE = 2 * Math.PI * DONUT_RADIUS;
const DONUT_GAP = 3; // bitisik dilimler arasinda ince bosluk

interface BreakdownDatum {
  key: string;
  hours: number;
}

// Platformlar ve Video Turleri grafiklerinin IKISI de ayni halka+legend
// gorsellemesini kullanir (sadece veri/etiket/renk eslemesi degisir) - bu
// yuzden tek bir genel bilesen olarak yazildi, ikisi arasinda kopya kod yok.
function BreakdownDonutChart({
  title,
  data,
  labels,
  colors,
  otherLabelKey,
  t,
}: {
  title: string;
  data: BreakdownDatum[];
  labels: Record<string, string>;
  colors: Record<string, string>;
  otherLabelKey: string;
  t: (key: string, opts?: Record<string, unknown>) => string;
}) {
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const total = data.reduce((sum, d) => sum + d.hours, 0);
  if (total <= 0) return null;

  let cumulative = 0;
  const segments = data.map((d) => {
    const fraction = d.hours / total;
    const startFraction = cumulative;
    cumulative += fraction;
    return { ...d, fraction, startFraction };
  });
  const active = activeKey ? segments.find((s) => s.key === activeKey) ?? null : null;

  return (
    <View style={chartStyles.wrap}>
      <Text style={chartStyles.title}>{title}</Text>
      <View style={donutStyles.row}>
        <View style={donutStyles.svgWrap}>
          <Svg width={DONUT_SIZE} height={DONUT_SIZE}>
            <G rotation={-90} origin={`${DONUT_CENTER}, ${DONUT_CENTER}`}>
              <Circle
                cx={DONUT_CENTER}
                cy={DONUT_CENTER}
                r={DONUT_RADIUS}
                stroke="rgba(255,255,255,0.08)"
                strokeWidth={DONUT_STROKE}
                fill="none"
              />
              {segments.map((s) => {
                const dash = Math.max(s.fraction * DONUT_CIRCUMFERENCE - DONUT_GAP, 0);
                const offset = -(s.startFraction * DONUT_CIRCUMFERENCE);
                const isDimmed = activeKey !== null && activeKey !== s.key;
                return (
                  <Circle
                    key={s.key}
                    cx={DONUT_CENTER}
                    cy={DONUT_CENTER}
                    r={DONUT_RADIUS}
                    stroke={colors[s.key] ?? OTHER_COLOR}
                    strokeWidth={DONUT_STROKE}
                    strokeDasharray={`${dash} ${DONUT_CIRCUMFERENCE - dash}`}
                    strokeDashoffset={offset}
                    strokeLinecap="butt"
                    fill="none"
                    opacity={isDimmed ? 0.3 : 1}
                  />
                );
              })}
            </G>
          </Svg>
          <View style={donutStyles.centerLabel} pointerEvents="none">
            <Text style={donutStyles.centerValue}>
              {t("userProfile.hoursShort", { count: formatHours(active ? active.hours : total) })}
            </Text>
            {active && (
              <Text style={donutStyles.centerUnit} numberOfLines={1}>
                {labels[active.key] ?? t(otherLabelKey)}
              </Text>
            )}
          </View>
        </View>
        <View style={donutStyles.legend}>
          {segments.map((s) => {
            const label = labels[s.key] ?? t(otherLabelKey);
            const isActive = activeKey === s.key;
            return (
              <TouchableOpacity
                key={s.key}
                style={donutStyles.legendRow}
                activeOpacity={0.7}
                onPress={() => setActiveKey((prev) => (prev === s.key ? null : s.key))}
              >
                <View style={[donutStyles.legendDot, { backgroundColor: colors[s.key] ?? OTHER_COLOR }]} />
                <Text style={[donutStyles.legendLabel, isActive && donutStyles.legendLabelActive]} numberOfLines={1}>
                  {label}
                </Text>
                <Text style={[donutStyles.legendPct, isActive && donutStyles.legendLabelActive]}>{Math.round(s.fraction * 100)}%</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const donutStyles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 18 },
  svgWrap: { width: DONUT_SIZE, height: DONUT_SIZE, alignItems: "center", justifyContent: "center" },
  centerLabel: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
    maxWidth: DONUT_SIZE - DONUT_STROKE * 2 - 16,
  },
  centerValue: { color: "#FFFFFF", fontSize: 19, fontWeight: "800", textAlign: "center" },
  centerUnit: { color: "rgba(255,255,255,0.55)", fontSize: 11, fontWeight: "700", marginTop: 2, textAlign: "center" },
  legend: { flex: 1, gap: 10 },
  legendRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendLabel: { flex: 1, color: "rgba(255,255,255,0.75)", fontSize: 13, fontWeight: "700" },
  legendLabelActive: { color: "#FFFFFF" },
  legendPct: { color: "rgba(255,255,255,0.45)", fontSize: 12.5, fontWeight: "700" },
});

const chartStyles = StyleSheet.create({
  wrap: { marginTop: 20, paddingTop: 18 },
  title: { color: "rgba(255,255,255,0.65)", fontSize: 12.5, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase", marginBottom: 14 },
  tabsRow: { flexDirection: "row", gap: 6, marginBottom: 12 },
  tab: { flex: 1, paddingVertical: 7, borderRadius: 10, alignItems: "center", backgroundColor: "rgba(255,255,255,0.06)" },
  tabActive: { backgroundColor: "#FFFFFF" },
  tabText: { color: "rgba(255,255,255,0.55)", fontSize: 11.5, fontWeight: "700" },
  tabTextActive: { color: "#0B1220" },
  axisLabel: { color: "rgba(255,255,255,0.45)", fontSize: 10.5, fontWeight: "600", textAlign: "right", width: 14 },
  plotArea: { height: CHART_HEIGHT, marginTop: 14 },
  axisLabels: { position: "absolute", left: -16, top: 0, bottom: 0, justifyContent: "space-between", zIndex: 2 },
  yAxisLine: { position: "absolute", left: 0, top: -8, bottom: -8, width: 1, backgroundColor: "rgba(255,255,255,0.2)" },
  xAxisLine: { position: "absolute", left: 0, right: 0, bottom: -8, height: 1, backgroundColor: "rgba(255,255,255,0.2)" },
  barsRow: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "flex-end",
  },
  column: { flex: 1, alignItems: "center" },
  bar: { borderRadius: 4, backgroundColor: "#FFFFFF", opacity: 0.85 },
  xAxisTicks: { flexDirection: "row", marginTop: 8 },
  dayLabel: {
    flex: 1,
    color: "rgba(255,255,255,0.45)",
    fontSize: 10,
    fontWeight: "600",
    textAlign: "center",
    lineHeight: 13,
  },
  selectedDate: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center",
    marginTop: 10,
  },
});

/** Ayarlar > "İstatistikler" icin kendi basina bir ekran - UserProfileScreen.tsx'
 * teki "goz" ikonuyla gizlenebilen istatistiklerle AYNI gercek veriyi
 * (supabase/migrations/0003_profile_stats_and_history.sql -> server/src/
 * index.ts "user:activityStats"/"user:friendCount") kullanir, ama SADECE
 * kendi hesabin icin, Privacy/NotificationSettings/Blocked ekranlariyla AYNI
 * geri tusu + ortalanmis Bebas Neue baslik duzeninde. */
export default function StatsScreen({ onBack }: Props) {
  const { t, i18n } = useTranslation();
  const [fontsLoaded] = useFonts({ BebasNeue_400Regular });
  const [stats, setStats] = useState<ActivityStats | null>(null);
  const [friendCount, setFriendCount] = useState<number | null>(null);
  const [platformStats, setPlatformStats] = useState<PlatformStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getUser().then(({ data }) => {
      const userId = data.user?.id;
      if (!userId) {
        if (!cancelled) {
          setErrored(true);
          setLoading(false);
        }
        return;
      }
      const socket = getSocket();
      let remaining = 3;
      function done() {
        remaining -= 1;
        if (remaining === 0 && !cancelled) setLoading(false);
      }
      socket.emit("user:activityStats", { userId }, (res: any) => {
        if (!cancelled && res?.ok) setStats(res.stats);
        else if (!cancelled) setErrored(true);
        done();
      });
      socket.emit("user:friendCount", { userId }, (res: any) => {
        if (!cancelled && res?.ok) setFriendCount(res.count);
        done();
      });
      socket.emit("user:platformStats", { userId }, (res: any) => {
        if (!cancelled && res?.ok) setPlatformStats(res.platforms);
        done();
      });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const rows = stats
    ? [
        {
          key: "totalHours",
          icon: <Clock size={22} color={ROW_ICON_COLOR} strokeWidth={2} />,
          label: t("userProfile.statTotalHours"),
          value: t("userProfile.hoursShort", { count: formatHours(stats.totalHours) }),
        },
        {
          key: "longestSession",
          icon: <Timer size={22} color={ROW_ICON_COLOR} strokeWidth={2} />,
          label: t("userProfile.statLongestSession"),
          value: t("userProfile.hoursShort", { count: formatHours(stats.longestSessionHours) }),
        },
        {
          key: "biggestRoom",
          icon: <DoorOpen size={22} color={ROW_ICON_COLOR} strokeWidth={2} />,
          label: t("userProfile.statBiggestRoom"),
          value: t("userProfile.peopleCount", { count: stats.biggestRoom }),
        },
      ]
    : [];
  if (friendCount !== null) {
    rows.push({
      key: "friends",
      icon: <Users size={22} color={ROW_ICON_COLOR} strokeWidth={2} />,
      label: t("userProfile.statFriends"),
      value: String(friendCount),
    });
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} hitSlop={10} style={styles.backTouch}>
          <Icon name="chevronLeft" size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={[styles.title, fontsLoaded && styles.titleFontLoaded]}>{t("profile.statsTitle")}</Text>
        <View style={styles.headerSpacer} />
      </View>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {loading ? (
          <LoadingView />
        ) : errored && rows.length === 0 ? (
          <Text style={styles.emptyText}>{t("common.unknownError")}</Text>
        ) : (
          <>
            <View style={styles.statsGrid}>
              {rows.map((row) => (
                <View key={row.key} style={styles.statTile}>
                  {row.icon}
                  <Text style={styles.statTileValue}>{row.value}</Text>
                  <Text style={styles.statTileLabel}>{row.label}</Text>
                </View>
              ))}
            </View>
            {stats && <DailyHoursChart daily={stats.daily} t={t} lang={i18n.language} />}
            {platformStats.length > 0 && (
              <BreakdownDonutChart
                title={t("userProfile.platformsChart")}
                data={platformStats.map((p) => ({ key: p.platform, hours: p.hours }))}
                labels={PLATFORM_LABELS}
                colors={PLATFORM_COLORS}
                otherLabelKey="userProfile.platformOther"
                t={t}
              />
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "transparent" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingTop: 54,
    paddingBottom: 14,
  },
  backTouch: { width: 36, height: 36, alignItems: "flex-start", justifyContent: "center" },
  headerSpacer: { width: 36 },
  title: { color: "#FFFFFF", fontSize: 16, fontWeight: "800", letterSpacing: 0.3 },
  titleFontLoaded: { fontFamily: "BebasNeue_400Regular", fontWeight: "400", fontSize: 22, letterSpacing: 1.4 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 48, flexGrow: 1 },
  emptyText: { color: MUTED, fontSize: 14, fontWeight: "500", textAlign: "center", marginTop: 60 },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  statTile: {
    flexBasis: "48%",
    flexGrow: 1,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 14,
    gap: 6,
  },
  statTileValue: { color: "#FFFFFF", fontSize: 19, fontWeight: "800" },
  statTileLabel: { color: MUTED, fontSize: 12.5, fontWeight: "600" },
});
