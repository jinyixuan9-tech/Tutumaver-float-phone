import { kvGet, kvSet, registerKvMigration } from "./kv-db";
import { formatSocialAvatarLibraryForPrompt, getSocialAvatarAsset, getDefaultSocialAvatarAsset } from "./social-avatar-library";
import { loadInstalledCustomApps } from "./custom-app-storage";

export const PLATFORM_IDENTITIES_KEY = "ai_phone_platform_identities_v1";
export const PLATFORM_IDENTITIES_UPDATED_EVENT = "platform-identities-updated";
registerKvMigration(PLATFORM_IDENTITIES_KEY);

export type PlatformIdentity = {
  characterId: string;
  platformId: string;
  displayName?: string;
  avatarId?: string;
  avatarUrl?: string;
  lastAutonomousNameAt?: number;
  lastAutonomousAvatarAt?: number;
  updatedAt: number;
};

export type PlatformIdentityAction = {
  platformId: string;
  displayName?: string;
  avatarId?: string;
  requested?: boolean;
  platformLabel?: string;
};

type PlatformIdentityState = { version: 1; profiles: Record<string, Record<string, PlatformIdentity>> };
const NAME_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
const AVATAR_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

function clean(value: unknown, max = 80): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function normalizePlatformId(value: unknown): string {
  return clean(value, 100).toLowerCase().replace(/\s+/g, "-");
}

function resolvePlatformLabel(platformId: string, provided?: string): string {
  if (provided?.trim()) return provided.trim();
  if (platformId.startsWith("custom:")) {
    const customId = platformId.slice("custom:".length);
    return loadInstalledCustomApps().find((app) => app.id === customId)?.name || "";
  }
  return "";
}

/**
 * 校园论坛固定匿名：不允许通用身份层覆盖它的学号/匿名 ID。
 * 真实 appId 未在本次只读核对中确认，因此同时识别常见 ID 与平台显示名。
 * 若项目使用其他自定义 ID，请在调用处额外传平台显示名，或将 ID 加入此名单。
 */
export function isAnonymousCampusForumPlatform(platformId: string, platformLabel = ""): boolean {
  const id = normalizePlatformId(platformId);
  const label = clean(platformLabel, 100).toLowerCase();
  const aliases = new Set(["campus-forum", "campus_forum", "campusforum", "school-forum", "school_forum", "university-forum", "university_forum", "校园论坛", "校园bbs"]);
  return aliases.has(id) || aliases.has(label)
    || ((/campus|school|university|校园|学校|大学/.test(id) || /campus|school|university|校园|学校|大学/.test(label))
      && /(forum|bbs|论坛|社区)/.test(id) || /(forum|bbs|论坛|社区)/.test(label));
}

export function canAutonomouslyChangePlatformIdentity(platformId: string, _platformLabel = ""): boolean {
  // Campus forums may keep a fixed anonymous/student-number handle, but can still
  // have a non-identifying avatar. Name changes are blocked separately below.
  return Boolean(normalizePlatformId(platformId));
}

function loadState(): PlatformIdentityState {
  const fallback: PlatformIdentityState = { version: 1, profiles: {} };
  if (typeof window === "undefined") return fallback;
  try {
    const raw = kvGet(PLATFORM_IDENTITIES_KEY);
    if (!raw) return fallback;
    const value = JSON.parse(raw) as Partial<PlatformIdentityState>;
    if (!value || !value.profiles || typeof value.profiles !== "object" || Array.isArray(value.profiles)) return fallback;
    return { version: 1, profiles: value.profiles as PlatformIdentityState["profiles"] };
  } catch {
    return fallback;
  }
}

function saveState(state: PlatformIdentityState, characterId: string, platformId: string): void {
  if (typeof window === "undefined") return;
  kvSet(PLATFORM_IDENTITIES_KEY, JSON.stringify(state));
  window.dispatchEvent(new CustomEvent(PLATFORM_IDENTITIES_UPDATED_EVENT, { detail: { characterId, platformId } }));
  // Notify existing platform stores so their mounted screens refresh immediately.
  const eventByPlatform: Record<string, string> = {
    chat: "chat-character-profiles-updated",
    weverse: "weverse-updated",
    lysn: "lysn-updated",
    twitter: "twitter-updated",
  };
  const eventName = eventByPlatform[platformId];
  if (eventName) window.dispatchEvent(new Event(eventName));
}

export function getPlatformIdentity(characterId: string, platformId: string): PlatformIdentity | null {
  const id = normalizePlatformId(platformId);
  if (!characterId || !id) return null;
  return loadState().profiles[characterId]?.[id] ?? null;
}

export function listCharacterPlatformIdentities(characterId: string): PlatformIdentity[] {
  const profileSet = loadState().profiles[characterId];
  return profileSet ? Object.values(profileSet).sort((a, b) => a.platformId.localeCompare(b.platformId)) : [];
}

export function updatePlatformIdentity(
  characterId: string,
  platformId: string,
  patch: Pick<PlatformIdentity, "displayName" | "avatarId" | "avatarUrl">,
  options: { requested?: boolean; platformLabel?: string } = {},
): PlatformIdentity | null {
  const id = normalizePlatformId(platformId);
  if (!characterId || !id || !canAutonomouslyChangePlatformIdentity(id, options.platformLabel)) return null;
  const platformLabel = resolvePlatformLabel(id, options.platformLabel);
  const campusAnonymous = isAnonymousCampusForumPlatform(id, platformLabel);
  const state = loadState();
  const previous = state.profiles[characterId]?.[id];
  const now = Date.now();
  const requested = options.requested === true;
  const next: PlatformIdentity = {
    characterId,
    platformId: id,
    displayName: previous?.displayName,
    avatarId: previous?.avatarId,
    avatarUrl: previous?.avatarUrl,
    lastAutonomousNameAt: previous?.lastAutonomousNameAt,
    lastAutonomousAvatarAt: previous?.lastAutonomousAvatarAt,
    updatedAt: now,
  };

  if (patch.displayName !== undefined && !campusAnonymous) {
    const value = clean(patch.displayName, 40);
    const cooldownReady = requested || !previous?.lastAutonomousNameAt || now - previous.lastAutonomousNameAt >= NAME_COOLDOWN_MS;
    if (value && cooldownReady && value !== previous?.displayName) {
      next.displayName = value;
      if (!requested) next.lastAutonomousNameAt = now;
    }
  }

  if (patch.avatarId !== undefined || patch.avatarUrl !== undefined) {
    const avatar = patch.avatarId ? getSocialAvatarAsset(patch.avatarId) : null;
    const cooldownReady = requested || !previous?.lastAutonomousAvatarAt || now - previous.lastAutonomousAvatarAt >= AVATAR_COOLDOWN_MS;
    if (cooldownReady && avatar) {
      next.avatarId = avatar.id;
      next.avatarUrl = avatar.url;
      if (!requested) next.lastAutonomousAvatarAt = now;
    } else if (cooldownReady && !patch.avatarId && typeof patch.avatarUrl === "string" && /^https:\/\//i.test(patch.avatarUrl.trim())) {
      // 仅接受 HTTPS 图片外链；AI 动作本身不会被允许直接塞入 data/javascript URL。
      next.avatarId = undefined;
      next.avatarUrl = patch.avatarUrl.trim();
      if (!requested) next.lastAutonomousAvatarAt = now;
    }
  }

  if (!next.displayName && !next.avatarId && !next.avatarUrl) {
    delete state.profiles[characterId]?.[id];
  } else {
    state.profiles[characterId] ||= {};
    state.profiles[characterId][id] = next;
  }
  saveState(state, characterId, id);
  return next;
}

const DEFAULT_HANDLE_SEEDS = [
  "月亮临时工", "半熟星球", "蓝莓失物招领", "星期三逃跑", "宇宙边角料", "不太圆的月亮",
  "夜航小狗", "薄荷气泡水", "云端散步者", "晚风收件箱", "星星维修部", "猫咪观察员",
  "低电量浪漫", "银河便利店", "雨天收藏家", "海盐小行星", "凌晨四点半", "慢速加载中",
  "tiny-orbit", "mossy-note", "blue-hour-club", "soft-static", "afterglow.exe", "cloudside",
];

/** 未初始化的平台先使用稳定的非本名网名，等待角色按自己的人设主动定制。 */
export function resolveDefaultPlatformDisplayName(characterId: string, platformId: string): string {
  const seed = `${characterId}:${normalizePlatformId(platformId)}`;
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return DEFAULT_HANDLE_SEEDS[(hash >>> 0) % DEFAULT_HANDLE_SEEDS.length] || "月亮临时工";
}

export function resolvePlatformIdentity(
  character: { id: string; name: string; avatar?: string | null },
  platformId: string,
  options: { platformLabel?: string; fixedAnonymousId?: string; fallbackName?: string; fallbackAvatar?: string | null } = {},
): { displayName: string; avatarUrl: string | null; anonymousLocked: boolean } {
  const anonymousLocked = isAnonymousCampusForumPlatform(platformId, resolvePlatformLabel(normalizePlatformId(platformId), options.platformLabel));
  if (anonymousLocked) {
    return {
      // 保留论坛原有固定学号/匿名名；没有传入学号时只保留该论坛自己的旧显示名，不回退角色真名。
      displayName: clean(options.fixedAnonymousId, 40) || clean(options.fallbackName, 40) || "匿名用户",
      avatarUrl: getPlatformIdentity(character.id, platformId)?.avatarUrl || options.fallbackAvatar || getDefaultSocialAvatarAsset(character.id, platformId)?.url || null,
      anonymousLocked: true,
    };
  }
  const profile = getPlatformIdentity(character.id, platformId);
  return {
    displayName: profile?.displayName || clean(options.fallbackName, 40) || resolveDefaultPlatformDisplayName(character.id, platformId),
    avatarUrl: profile?.avatarUrl || options.fallbackAvatar || getDefaultSocialAvatarAsset(character.id, platformId)?.url || null,
    anonymousLocked: false,
  };
}

/** 给 Chat 私聊注入“可自主维护各平台独立身份”的低频指令。 */
export function buildPlatformIdentityAutonomyPrompt(character: { id: string; name: string }): string {
  const knownPlatforms = ["chat", "moments", "xiaohongshu", "weverse", "lysn", "sms", "twitter", "theqoo", "campus-forum"];
  const stored = listCharacterPlatformIdentities(character.id).map((item) => item.platformId);
  const custom = loadInstalledCustomApps().map((app) => `custom:${app.id}`);
  const platforms = [...new Set([...knownPlatforms, ...stored, ...custom])].filter((id) => canAutonomouslyChangePlatformIdentity(id));
  const customApps = loadInstalledCustomApps();
  const platformLabels: Record<string, string> = {
    chat: "聊天", moments: "朋友圈", xiaohongshu: "小红书", weverse: "Weverse",
    lysn: "Lysn", sms: "短信", twitter: "X", theqoo: "Theqoo", "campus-forum": "校园论坛",
  };
  for (const app of customApps) platformLabels[`custom:${app.id}`] = app.name;
  const profileLines = platforms.map((id) => {
    const profile = getPlatformIdentity(character.id, id);
    const label = platformLabels[id] || id;
    const campus = isAnonymousCampusForumPlatform(id, label);
    const currentName = campus ? "沿用论坛已有学号/固定匿名 ID，不得修改" : (profile?.displayName || "尚未单独设置");
    return `- ${id}（${label}）：当前显示名 ${currentName}；头像 ${profile?.avatarId || (profile?.avatarUrl ? "已设置外链" : "尚未单独设置")}`;
  });
  return [
    "【跨平台独立账号身份】",
    "你在不同社交平台可以拥有不同网名、显示名和头像。Character.name 是资料库里的身份名，不等于每个平台都必须公开使用的网名。不要把角色本名机械复制到所有平台；应参考角色资料、人设、语言习惯、兴趣和平台氛围，形成自然且彼此有区别的账号身份。",
    "各平台身份分别保存，改一个平台不能连带覆盖其他平台，也不能修改 Character 本体资料。未提及的平台不要顺手改。",
    "校园论坛身份必须沿用论坛自身已经存在的学号/固定匿名 ID，绝不生成、猜测或修改这个 ID，也绝不把 Character.name 或其他平台网名写进论坛。校园论坛可在不泄露身份的前提下选择非本人头像；不要对论坛输出 displayName。",
    "头像只能从独立社交头像库中选择，不要使用 Photo Library 中的角色本人照片，不要把真实自拍、角色脸照或生成的角色写真当作头像。头像库候选：",
    formatSocialAvatarLibraryForPrompt(),
    "API 已连接且某个平台尚未建立独立资料时，应在该平台首次实际发帖/互动前，按人物资料和平台氛围自然建立一次网名及头像；不要把 Character.name 直接复制过去。已建立的资料只在确有情境理由时低频调整，普通回复不要每轮刷新。使用头像库候选时，avatarId 必须完全匹配候选 ID。",
    "动作格式：[平台资料更新:platformId]{\"platformLabel\":\"平台显示名\",\"displayName\":\"新显示名\",\"avatarId\":\"头像库ID\"}[/平台资料更新]。只写本次真的要修改的字段；自定义软件必须附上其真实 platformLabel。校园论坛绝不写 displayName。用户明确要求现在修改时可以额外写 \"requested\":true。",
    "当前已记录的平台资料：",
    ...profileLines,
    "新增加的自定义软件平台使用其稳定 appId 作为 platformId，格式 custom:app-id；不要把应用显示名称临时当作 ID。若不确定 appId，不要执行更新，只正常讨论。",
  ].join("\n");
}

/** 从模型回复中提取隐藏的平台资料动作，并从可见文本中移除。 */
export function extractPlatformIdentityUpdates(rawText: string): { cleanedText: string; actions: PlatformIdentityAction[] } {
  const actions: PlatformIdentityAction[] = [];
  const cleanedText = rawText.replace(/\[平台资料更新\s*:\s*([a-z0-9._:-]{1,100})\s*\]([\s\S]*?)\[\/平台资料更新\]/gi, (_match, rawId: string, body: string) => {
    const platformId = normalizePlatformId(rawId);
    try {
      const value = JSON.parse(body.trim()) as Record<string, unknown>;
      if (!value || typeof value !== "object" || Array.isArray(value) || !canAutonomouslyChangePlatformIdentity(platformId)) return "";
      const platformLabel = resolvePlatformLabel(platformId, typeof value.platformLabel === "string" ? clean(value.platformLabel, 100) : undefined);
      const action: PlatformIdentityAction = { platformId, requested: value.requested === true, platformLabel };
      if (typeof value.displayName === "string" && !isAnonymousCampusForumPlatform(platformId, platformLabel)) action.displayName = clean(value.displayName, 40);
      if (typeof value.avatarId === "string") action.avatarId = clean(value.avatarId, 80);
      if (action.displayName || action.avatarId) actions.push(action);
    } catch {
      // malformed hidden action is removed rather than leaked to the chat bubble
    }
    return "";
  }).replace(/\n{3,}/g, "\n\n").trim();
  return { cleanedText, actions };
}

export function applyPlatformIdentityAction(characterId: string, action: PlatformIdentityAction): boolean {
  if (!action || !canAutonomouslyChangePlatformIdentity(action.platformId)) return false;
  if (isAnonymousCampusForumPlatform(action.platformId, resolvePlatformLabel(action.platformId, action.platformLabel)) && action.displayName) return false;
  const result = updatePlatformIdentity(characterId, action.platformId, {
    displayName: action.displayName,
    avatarId: action.avatarId,
  }, { requested: action.requested, platformLabel: resolvePlatformLabel(action.platformId, action.platformLabel) });
  return Boolean(result);
}
