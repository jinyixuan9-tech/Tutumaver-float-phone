import { kvGet, kvSet, registerKvMigration } from "./kv-db";

/**
 * 独立的社交平台头像库。
 * 注意：这里绝不读取 Photo Library，也不把角色本人照片当作默认头像候选。
 */
export type SocialAvatarAsset = {
  id: string;
  label: string;
  url: string;
  tags: string[];
  source: "builtin" | "external";
  createdAt: number;
};

const STORAGE_KEY = "ai_phone_social_avatar_library_v1";
registerKvMigration(STORAGE_KEY);

const BUILTIN_DEFINITIONS: Array<{ id: string; label: string; emoji: string; background: string; foreground: string; tags: string[] }> = [
  { id: "black-cat", label: "黑猫", emoji: "🐈‍⬛", background: "#20202a", foreground: "#f2e8ff", tags: ["cat", "animal", "dark", "cute", "猫", "黑色"] },
  { id: "collie", label: "边牧", emoji: "🐕", background: "#dce8f2", foreground: "#24364a", tags: ["dog", "animal", "smart", "cute", "狗", "边牧"] },
  { id: "moon", label: "月亮", emoji: "🌙", background: "#18243c", foreground: "#f6e7ac", tags: ["moon", "night", "quiet", "blue", "月亮", "夜晚"] },
  { id: "star", label: "星星", emoji: "⭐", background: "#26304f", foreground: "#ffe08a", tags: ["star", "space", "bright", "星星", "宇宙"] },
  { id: "flower", label: "小花", emoji: "🌼", background: "#f5e5d4", foreground: "#8b594b", tags: ["flower", "soft", "warm", "花", "温柔"] },
  { id: "coffee", label: "咖啡", emoji: "☕", background: "#4b332b", foreground: "#f4dfc5", tags: ["coffee", "daily", "brown", "咖啡", "日常"] },
  { id: "book", label: "书本", emoji: "📚", background: "#d9e7df", foreground: "#355348", tags: ["book", "study", "green", "阅读", "学习"] },
  { id: "pixel-heart", label: "像素爱心", emoji: "💗", background: "#49304b", foreground: "#ffd4eb", tags: ["pixel", "game", "pink", "heart", "游戏", "粉色"] },
  { id: "strawberry", label: "草莓", emoji: "🍓", background: "#f5dce0", foreground: "#8e3449", tags: ["fruit", "sweet", "pink", "草莓", "可爱"] },
  { id: "cloud", label: "云朵", emoji: "☁️", background: "#dce8f6", foreground: "#526b8a", tags: ["cloud", "sky", "calm", "蓝色", "天空"] },
  { id: "music", label: "音乐", emoji: "🎧", background: "#e5dff3", foreground: "#51416f", tags: ["music", "headphones", "purple", "音乐"] },
  { id: "frog", label: "青蛙", emoji: "🐸", background: "#d9ecd7", foreground: "#38673f", tags: ["frog", "meme", "green", "搞笑", "青蛙"] },
];

function svgDataUrl(emoji: string, background: string, foreground: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><rect width="256" height="256" rx="64" fill="${background}"/><circle cx="128" cy="128" r="88" fill="${foreground}" opacity=".12"/><text x="128" y="157" text-anchor="middle" font-size="112" font-family="Apple Color Emoji,Segoe UI Emoji,Noto Color Emoji,sans-serif">${emoji}</text></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

const BUILTIN_ASSETS: SocialAvatarAsset[] = BUILTIN_DEFINITIONS.map((item) => ({
  id: item.id,
  label: item.label,
  url: svgDataUrl(item.emoji, item.background, item.foreground),
  tags: item.tags,
  source: "builtin",
  createdAt: 0,
}));

function cleanString(value: unknown, max = 80): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function isAllowedImageUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const url = value.trim();
  // 外链只允许 HTTPS；自定义 data URL 只允许常见栅格格式，避免把任意 SVG/HTML 存进头像库。
  return /^https:\/\/[^\s]+$/i.test(url)
    || /^data:image\/(?:png|jpeg|webp|gif);base64,[a-z0-9+/=]+$/i.test(url);
}

export function listSocialAvatarAssets(): SocialAvatarAsset[] {
  if (typeof window === "undefined") return [...BUILTIN_ASSETS];
  try {
    const raw = kvGet(STORAGE_KEY);
    if (!raw) return [...BUILTIN_ASSETS];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [...BUILTIN_ASSETS];
    const custom = parsed.flatMap((entry): SocialAvatarAsset[] => {
      if (!entry || typeof entry !== "object") return [];
      const row = entry as Partial<SocialAvatarAsset>;
      const id = cleanString(row.id, 80);
      const label = cleanString(row.label, 60);
      if (!id || !label || !isAllowedImageUrl(row.url) || BUILTIN_ASSETS.some((item) => item.id === id)) return [];
      return [{ id, label, url: row.url, tags: Array.isArray(row.tags) ? row.tags.map((tag) => cleanString(tag, 30)).filter(Boolean).slice(0, 20) : [], source: "external", createdAt: typeof row.createdAt === "number" ? row.createdAt : Date.now() }];
    });
    return [...BUILTIN_ASSETS, ...custom];
  } catch {
    return [...BUILTIN_ASSETS];
  }
}

/** 按人物与平台稳定分配一个非本人头像，避免空资料回退到真实照片。 */
export function getDefaultSocialAvatarAsset(characterId: string, platformId: string): SocialAvatarAsset | null {
  const builtins = BUILTIN_ASSETS;
  if (!builtins.length) return null;
  const seed = `${characterId}:${platformId}`;
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return builtins[(hash >>> 0) % builtins.length] || builtins[0];
}

export function getSocialAvatarAsset(id: string): SocialAvatarAsset | null {
  return listSocialAvatarAssets().find((item) => item.id === id) ?? null;
}

/** 把用户从图库/网页找到的非本人照片素材加入独立头像库。 */
export function addSocialAvatarAsset(input: { id?: string; label: string; url: string; tags?: string[] }): SocialAvatarAsset | null {
  if (typeof window === "undefined" || !isAllowedImageUrl(input.url)) return null;
  const label = cleanString(input.label, 60);
  if (!label) return null;
  const id = cleanString(input.id, 80) || `avatar_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  if (!/^[a-z0-9._-]+$/i.test(id) || BUILTIN_ASSETS.some((item) => item.id === id)) return null;
  const existing = listSocialAvatarAssets().filter((item) => item.source === "external" && item.id !== id);
  const asset: SocialAvatarAsset = {
    id, label, url: input.url.trim(),
    tags: Array.isArray(input.tags) ? input.tags.map((tag) => cleanString(tag, 30)).filter(Boolean).slice(0, 20) : [],
    source: "external", createdAt: Date.now(),
  };
  kvSet(STORAGE_KEY, JSON.stringify([...existing, asset]));
  return asset;
}

export function removeSocialAvatarAsset(id: string): boolean {
  if (typeof window === "undefined" || BUILTIN_ASSETS.some((item) => item.id === id)) return false;
  const current = listSocialAvatarAssets();
  const next = current.filter((item) => item.id !== id);
  if (next.length === current.length) return false;
  kvSet(STORAGE_KEY, JSON.stringify(next.filter((item) => item.source === "external")));
  return true;
}

export function formatSocialAvatarLibraryForPrompt(max = 16): string {
  return listSocialAvatarAssets().slice(0, Math.max(1, Math.min(30, max)))
    .map((item) => `${item.id}（${item.label}；标签：${item.tags.join("、") || "无"}）`)
    .join("\n");
}
