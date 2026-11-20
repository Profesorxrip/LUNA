// Kullanici: "Kendi renklerimizi felan oluşturamamız çok kötü" - sabit bir
// renk izgarasi yerine GERCEK bir HSV secici (doygunluk/parlaklik karesi +
// ton cubugu + hex girisi). SendMediaSheet (fotograf) ve SendVideoSheet
// (video) editorleri AYNI renk sistemini (bu dosya + ColorPalettePickerModal)
// paylasiyor.

export function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

export function rgbToHex(r: number, g: number, b: number): string {
  return (
    "#" +
    [r, g, b]
      .map((n) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase()
  );
}

export function hexToRgb(hex: string): [number, number, number] | null {
  const clean = hex.replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return null;
  const m = clean.match(/.{1,2}/g);
  if (!m) return null;
  const [r, g, b] = m.map((h) => parseInt(h, 16));
  return [r, g, b];
}

export function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === rn) h = 60 * (((gn - bn) / d) % 6);
    else if (max === gn) h = 60 * ((bn - rn) / d + 2);
    else h = 60 * ((rn - gn) / d + 4);
  }
  if (h < 0) h += 360;
  const s = max === 0 ? 0 : d / max;
  return [h, s, max];
}

export function hexToHsv(hex: string): [number, number, number] {
  const rgb = hexToRgb(hex);
  if (!rgb) return [0, 0, 1];
  return rgbToHsv(...rgb);
}

export const STICKER_COLORS = [
  "#FFFFFF", "#000000", "#9CA3AF", "#FF3B30", "#FF9F0A", "#FFD60A",
  "#34C759", "#06D6A0", "#0A84FF", "#5AC8FA", "#6366F1", "#BF5AF2",
  "#FF2D55", "#F472B6",
];
