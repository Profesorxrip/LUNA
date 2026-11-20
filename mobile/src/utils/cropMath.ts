import { clamp } from "./colorMath";

export type Rect = { x: number; y: number; width: number; height: number };

/** "contain" resizeMode'daki bir Image/VideoView'in GERCEKTEN kapladigi
 * (letterbox haric) alani hesaplar - elle kirpma cercevesinin sinirlarini
 * (imgRect) bulmak icin. SendMediaSheet (fotograf) ve SendVideoSheet (video)
 * editorleri AYNI kirpma matematigini (bu dosya) paylasiyor. */
export function computeContainRect(origW: number, origH: number, containerW: number, containerH: number): Rect {
  if (!origW || !origH || !containerW || !containerH) return { x: 0, y: 0, width: containerW, height: containerH };
  const scale = Math.min(containerW / origW, containerH / origH);
  const width = origW * scale;
  const height = origH * scale;
  return { x: (containerW - width) / 2, y: (containerH - height) / 2, width, height };
}

export const CROP_MIN_SIZE = 60;

export function clampCropRect(rect: Rect, bounds: Rect): Rect {
  let { x, y, width, height } = rect;
  width = clamp(width, CROP_MIN_SIZE, bounds.width);
  height = clamp(height, CROP_MIN_SIZE, bounds.height);
  x = clamp(x, bounds.x, bounds.x + bounds.width - width);
  y = clamp(y, bounds.y, bounds.y + bounds.height - height);
  return { x, y, width, height };
}

// Kose tutamaclarindan biri suruklenince cercevenin o kosesini buyutup
// kuculturken KARSI kenari SABIT tutuyor (klasik kirpma araci davranisi).
export function resizeCropRect(rect: Rect, corner: "tl" | "tr" | "bl" | "br", dx: number, dy: number, bounds: Rect): Rect {
  let { x, y, width, height } = rect;
  if (corner === "tl") {
    x += dx;
    y += dy;
    width -= dx;
    height -= dy;
  } else if (corner === "tr") {
    y += dy;
    width += dx;
    height -= dy;
  } else if (corner === "bl") {
    x += dx;
    width -= dx;
    height += dy;
  } else {
    width += dx;
    height += dy;
  }
  if (width < CROP_MIN_SIZE) {
    if (corner === "tl" || corner === "bl") x -= CROP_MIN_SIZE - width;
    width = CROP_MIN_SIZE;
  }
  if (height < CROP_MIN_SIZE) {
    if (corner === "tl" || corner === "tr") y -= CROP_MIN_SIZE - height;
    height = CROP_MIN_SIZE;
  }
  if (x < bounds.x) {
    width -= bounds.x - x;
    x = bounds.x;
  }
  if (y < bounds.y) {
    height -= bounds.y - y;
    y = bounds.y;
  }
  if (x + width > bounds.x + bounds.width) width = bounds.x + bounds.width - x;
  if (y + height > bounds.y + bounds.height) height = bounds.y + bounds.height - y;
  width = Math.max(width, CROP_MIN_SIZE);
  height = Math.max(height, CROP_MIN_SIZE);
  return { x, y, width, height };
}
