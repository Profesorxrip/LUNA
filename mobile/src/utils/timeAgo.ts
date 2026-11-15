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

export function formatDate(ms: number, lang: string): string {
  const d = new Date(ms);
  const months = MONTHS[lang] ?? MONTHS.en;
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

// Gonderi karti altindaki (PostCard.tsx) mutlak tarih+saat - formatDate'in
// SADECE tarih veren halinin aksine, saat:dakika de ekler.
export function formatDateTime(ms: number, lang: string): string {
  const d = new Date(ms);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${formatDate(ms, lang)} · ${hh}:${mm}`;
}

export function timeAgo(ms: number, t: (key: string, opts?: any) => string, lang: string): string {
  const diffDays = Math.floor((Date.now() - ms) / (24 * 60 * 60 * 1000));
  if (diffDays <= 0) return t("userProfile.today");
  if (diffDays === 1) return t("userProfile.yesterday");
  if (diffDays < 30) return t("friends.daysAgo", { count: diffDays });
  return formatDate(ms, lang);
}
