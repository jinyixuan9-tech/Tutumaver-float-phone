export type TheqooTranslationMode = "original" | "chinese" | "folded" | "repost";
export type TheqooUiLanguage = "ko" | "ja" | "zh";
export type TheqooForumLanguage = "ko" | "ja";

export type TheqooTranslatorConfig = {
  enabled: boolean;
  baseUrl: string;
  apiKey: string;
  model: string;
};

export type TheqooComment = {
  id: string;
  original: string;
  translated: string;
  createdAt: number;
  authoredByUser?: boolean;
  authoredByOP?: boolean;
  pendingRefresh?: boolean;
};

export type TheqooImage = {
  id: string;
  kind: "text" | "generated";
  /** 文字图始终保存中文。旧字段名为兼容既有数据继续保留。 */
  originalText?: string;
  translatedText?: string;
  mediaRef?: string;
  /** 生图描述始终保存中文。 */
  prompt?: string;
};

export type TheqooPost = {
  forumLanguage?: TheqooForumLanguage | "zh";
  id: string;
  category: string;
  /** 同一事件的稳定主题标识，用于避免重复生成。旧帖可缺省。 */
  topicKey?: string;
  titleOriginal: string;
  titleTranslated: string;
  bodyOriginal: string;
  bodyTranslated: string;
  createdAt: number;
  views: number;
  comments: TheqooComment[];
  favorite: boolean;
  authoredByUser?: boolean;
  imageRef?: string;
  imagePrompt?: string;
  images?: TheqooImage[];
};

export type TheqooState = {
  uiLanguage: TheqooUiLanguage;
  forumLanguage: TheqooForumLanguage;
  /** false 时论坛内容只生成/显示中文，且不调用翻译 API。 */
  translationEnabled: boolean;
  translationMode: TheqooTranslationMode;
  /** Legacy input only; migrated into ordinary API settings and bindings. */
  translator?: TheqooTranslatorConfig;
  translationApiMigrated?: boolean;
  worldBookIds: string[];
  includeCalendar: boolean;
  includeWeverseSchedule: boolean;
  posts: TheqooPost[];
};

export const THEQOO_STORAGE_KEY = "ai_phone_theqoo_state_v1";

const now = Date.now();
const demoPosts: TheqooPost[] = [];

export const defaultTheqooState = (): TheqooState => ({
  uiLanguage: "ko",
  forumLanguage: "ko",
  translationEnabled: true,
  translationMode: "repost",
  worldBookIds: [],
  includeCalendar: false,
  includeWeverseSchedule: false,
  posts: demoPosts,
});

export function loadTheqooState(): TheqooState {
  if (typeof window === "undefined") return defaultTheqooState();
  try {
    const raw = localStorage.getItem(THEQOO_STORAGE_KEY);
    if (!raw) return defaultTheqooState();
    const parsed = JSON.parse(raw) as Partial<TheqooState> & { includeWeverseSchedule?: boolean };
    const defaults = defaultTheqooState();
    const translator = parsed.translator && typeof parsed.translator === "object"
      ? parsed.translator
      : undefined;
    const mode = parsed.translationMode === "original" ? "original" : "repost";
    return {
      uiLanguage: parsed.uiLanguage === "zh" ? "zh" : parsed.uiLanguage === "ja" ? "ja" : "ko",
      forumLanguage: parsed.forumLanguage === "ja" ? "ja" : "ko",
      translationEnabled: parsed.translationEnabled !== false,
      translationMode: mode || defaults.translationMode,
      translator,
      translationApiMigrated: parsed.translationApiMigrated === true,
      worldBookIds: Array.isArray(parsed.worldBookIds) ? parsed.worldBookIds : [],
      includeCalendar: parsed.includeCalendar === true,
      includeWeverseSchedule: parsed.includeWeverseSchedule === true,
      posts: Array.isArray(parsed.posts) ? parsed.posts.filter(p=>!/^theqoo_demo_[123]$/.test(p.id)) : demoPosts,
    };
  } catch {
    return defaultTheqooState();
  }
}

export function saveTheqooState(state: TheqooState) {
  if (typeof window === "undefined") return;
  localStorage.setItem(THEQOO_STORAGE_KEY, JSON.stringify(state));
}

export function theqooPostLanguage(post: Pick<TheqooPost,"forumLanguage"|"titleOriginal"|"titleTranslated"|"bodyOriginal"|"bodyTranslated">): "ko" | "ja" | "zh" {
  if (post.forumLanguage) return post.forumLanguage;
  if (/[ぁ-ゟ゠-ヿ]/.test(post.titleOriginal + post.bodyOriginal)) return "ja";
  if (/[가-힣]/.test(post.titleOriginal + post.bodyOriginal)) return "ko";
  return post.titleOriginal === post.titleTranslated && post.bodyOriginal === post.bodyTranslated ? "zh" : "ko";
}
