import { loadApiConfigs, loadBindingConfig, saveApiConfigs, saveBindingConfig } from "./settings-storage";
import { THEQOO_STORAGE_KEY, type TheqooState } from "./theqoo-storage";
import type { ApiConfig } from "./settings-types";

/** Call after settings hydration. Preserve an existing unified choice and never copy a legacy key into UI text. */
function migrate(): boolean {
  if (typeof window === "undefined") return false;
  const raw = localStorage.getItem(THEQOO_STORAGE_KEY);
  if (!raw) return false;
  let state: Partial<TheqooState>;
  try { state = JSON.parse(raw); } catch { return false; }
  if (!state || typeof state !== "object" || Array.isArray(state)) return false;
  if (state.translationApiMigrated) return true;
  const legacy = state.translator;
  if (legacy && typeof legacy === "object" && typeof legacy.apiKey === "string" && legacy.apiKey.trim()) {
    const baseUrl = typeof legacy.baseUrl === "string" ? legacy.baseUrl.trim() : "";
    const model = typeof legacy.model === "string" ? legacy.model.trim() : "";
    const apiKey = legacy.apiKey.trim();
    const configs = loadApiConfigs();
    let target = configs.find(item => item.baseUrl?.trim() === baseUrl && item.apiKey.trim() === apiKey && item.defaultModel.trim() === model);
    if (!target) {
      const baseId = "theqoo-legacy-translator";
      let id = baseId;
      let suffix = 2;
      while (configs.some(item => item.id === id)) id = `${baseId}-${suffix++}`;
      target = { id, name: "Theqoo 翻译（已迁移）", provider: "Custom", baseUrl, apiKey, defaultModel: model,
        enableImageRecognition: false, enableImageGeneration: false, enableNativeTools: false } satisfies ApiConfig;
      saveApiConfigs([...configs, target]);
    }
    const bindings = loadBindingConfig();
    if (legacy.enabled && baseUrl && model && !bindings.globalDefaults.translationApiConfigId && !bindings.appDefaults?.theqoo?.translationApiConfigId) {
      saveBindingConfig({ ...bindings, appDefaults: { ...bindings.appDefaults, theqoo: { ...bindings.appDefaults?.theqoo, translationApiConfigId: target.id } } });
    }
  }
  // Keep forum modes, posts, images and comments untouched; credentials now live in the ordinary API settings.
  const next = { ...state, translationApiMigrated: true };
  delete next.translator;
  localStorage.setItem(THEQOO_STORAGE_KEY, JSON.stringify(next));
  return true;
}

export function migrateLegacyTheqooTranslator(): boolean {
  try { return migrate(); } catch { return false; }
}
