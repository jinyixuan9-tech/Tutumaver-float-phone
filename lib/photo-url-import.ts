import { fetchExternalApi, isAndroidNativeApi } from "./android-native-api";

export const PHOTO_URL_IMPORT_LIMIT = 100;

export function parsePhotoUrls(text: string): string[] {
  const rows = text.split(/\r?\n/).map(row => row.trim()).filter(Boolean);
  if (!rows.length) throw new Error("请先粘贴图片直链，每行一条。");
  if (rows.length > PHOTO_URL_IMPORT_LIMIT) throw new Error(`一次最多导入 ${PHOTO_URL_IMPORT_LIMIT} 条链接。`);
  const urls = rows.map((row, index) => {
    let url: URL;
    try { url = new URL(row); } catch { throw new Error(`第 ${index + 1} 条链接格式不正确。`); }
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) throw new Error(`第 ${index + 1} 条需要是 http/https 图片直链。`);
    url.hash = "";
    return url.href;
  });
  return [...new Set(urls)];
}

export async function downloadPhotoUrl(url: string, signal: AbortSignal): Promise<File> {
  // APK has no Next.js server: use the user's URL via Capacitor's native HTTPS
  // transport. Keep the existing server-side fetch and validation for web users.
  const native = isAndroidNativeApi();
  if (native && new URL(url).protocol !== "https:") {
    throw new Error("安卓版链接导入需要 HTTPS 图片直链。");
  }
  const response = native
    ? await fetchExternalApi(url, { method: "GET", signal })
    : await fetch("/api/photos/import-url", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }), signal });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || `下载失败（HTTP ${response.status}）`);
  }
  const blob = await response.blob();
  // Match the web proxy's supported formats and 10 MB per-image limit.
  if (!["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"].includes(blob.type.split(";")[0].toLowerCase()) || !blob.size) {
    throw new Error("链接没有返回支持的图片，请使用 JPG、PNG、WebP、GIF 或 AVIF 图片直链。");
  }
  if (blob.size > 10 * 1024 * 1024) throw new Error("单张图片不能超过 10 MB。");
  // 解码后再进入照片队列，避免把伪装成图片的网页或损坏文件存入相册。
  const objectUrl = URL.createObjectURL(blob);
  try {
    await new Promise<void>((resolve, reject) => {
      const image = new Image();
      const abort = () => { image.src = ""; finish(new Error("已取消下载。")); };
      const timer = setTimeout(() => finish(new Error("图片解码超时。")), 15000);
      const finish = (error?: Error) => { clearTimeout(timer); signal.removeEventListener("abort", abort); image.onload = null; image.onerror = null; error ? reject(error) : resolve(); };
      image.onload = () => image.naturalWidth > 0 ? finish() : finish(new Error("图片无法解码。"));
      image.onerror = () => finish(new Error("图片格式不支持或文件已损坏。"));
      if (signal.aborted) abort();
      else { signal.addEventListener("abort", abort, { once: true }); image.src = objectUrl; }
    });
  } finally { URL.revokeObjectURL(objectUrl); }
  let name = "";
  try { name = decodeURIComponent(new URL(url).pathname.split("/").pop() || ""); } catch { /* 使用默认文件名 */ }
  return new File([blob], name.slice(0, 200) || `链接图片.${blob.type.split("/")[1] || "jpg"}`, { type: blob.type });
}
