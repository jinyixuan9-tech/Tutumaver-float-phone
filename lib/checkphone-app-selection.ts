import { kvGet, kvSet, registerDynamicPrefix } from "./kv-db";
import { CHECKPHONE_OPTIONAL_POOL_APP_IDS, CHECKPHONE_FIXED_APP_IDS, CHECKPHONE_DOCK_APP_IDS, type CheckPhoneAppId, type CheckPhoneManifest } from "./checkphone-config";
import { loadPhoneManifest, savePhoneManifest } from "./checkphone-storage";
const PREFIX = "ai_phone_checkphone_app_selection_";
registerDynamicPrefix(PREFIX);
export type CheckPhoneAppSelection = { mode: "ai" | "manual"; appIds: CheckPhoneAppId[] };
export function loadCheckPhoneAppSelection(characterId: string): CheckPhoneAppSelection {
  try {
    const raw = JSON.parse(kvGet(PREFIX + characterId) || "{}");
    const appIds = Array.isArray(raw.appIds) ? [...new Set<CheckPhoneAppId>(raw.appIds.filter((id: CheckPhoneAppId) => CHECKPHONE_OPTIONAL_POOL_APP_IDS.includes(id)))] : [];
    return { mode: raw.mode === "manual" && appIds.length === 8 ? "manual" : "ai", appIds };
  } catch { return { mode: "ai", appIds: [] }; }
}
export function applyCheckPhoneAppSelection(characterId: string, appIds: CheckPhoneAppId[], previous?: CheckPhoneManifest | null): CheckPhoneManifest {
  const now = new Date().toISOString();
  const topAppIds = [...CHECKPHONE_FIXED_APP_IDS, ...appIds];
  return { ...previous, characterId, dockAppIds: [...CHECKPHONE_DOCK_APP_IDS], fixedAppIds: [...CHECKPHONE_FIXED_APP_IDS], optionalAppIds: [...appIds], topAppIds, allAppIds: [...topAppIds, ...CHECKPHONE_DOCK_APP_IDS], generatedAt: previous?.generatedAt || now, updatedAt: now };
}
export async function saveCheckPhoneAppSelection(characterId: string, selection: CheckPhoneAppSelection): Promise<CheckPhoneManifest | null> {
  const appIds = [...new Set(selection.appIds)].filter(id => CHECKPHONE_OPTIONAL_POOL_APP_IDS.includes(id));
  if (selection.mode === "manual" && appIds.length !== 8) throw new Error("请选择 8 个 App");
  const previous = await loadPhoneManifest(characterId);
  const next = selection.mode === "manual" ? applyCheckPhoneAppSelection(characterId, appIds, previous) : previous;
  if (next && selection.mode === "manual") await savePhoneManifest(next);
  kvSet(PREFIX + characterId, JSON.stringify({ mode: selection.mode, appIds }));
  return next;
}
