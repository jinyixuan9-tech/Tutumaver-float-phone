/** Compact display only; storage always keeps the exact count. */
export function formatTwitterCount(value: number | undefined): string {
  const count = Number.isFinite(value) ? Math.max(0, Math.round(value!)) : 0;
  if (count < 10000) return count.toLocaleString("zh-CN");
  const unit = count >= 100000000 ? 100000000 : 10000;
  const compact = Math.floor(count / unit * 10) / 10;
  return `${compact}${unit === 10000 ? "万" : "亿"}`;
}
export function parseTwitterCount(value: string): number | null {
  const match = value.trim().replace(/[,，\s]/g, "").match(/^(\d+(?:\.\d+)?)\s*(万|亿|[kKmMwW])?$/);
  if (!match) return null;
  const scale = ({"万":10000,"亿":100000000,k:1000,m:1000000,w:10000} as Record<string,number>)[(match[2] || "").toLowerCase()] || 1;
  const n = Math.round(Number(match[1]) * scale);
  return Number.isSafeInteger(n) ? n : null;
}
