/** Kucuk, bagimliliksiz giris dogrulama yardimcilari - roadmap AŞAMA 12
 * (Input validation) icin: bos deger, asiri uzun string, yanlis tip gibi
 * temel abuse/crash senaryolarina karsi. Socket payload'lari TypeScript
 * tipleriyle "tanimlanir" ama derleme zamani tipleri calisma zamaninda
 * hicbir sey garanti etmez - client TypeScript'e uymak zorunda degil. */

export function isNonEmptyString(value: unknown, maxLen: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLen;
}

export function isOptionalString(value: unknown, maxLen: number): value is string | undefined {
  return value === undefined || value === null || (typeof value === "string" && value.length <= maxLen);
}

export function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

export function isFiniteNumber(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

export function isOneOf<T extends string>(value: unknown, options: readonly T[]): value is T {
  return typeof value === "string" && (options as readonly string[]).includes(value);
}
