import { kvGet, kvSet, registerKvMigration } from "./kv-db";
import { loadBindingConfig, loadWorldBooks, resolveBinding, saveBindingConfig } from "./settings-storage";
import type { BindingConfig } from "./settings-types";
const MIGRATION = "ai_phone_social_worldbook_binding_migration_v1";
registerKvMigration(MIGRATION);
/** Existing unified selections win. Topic-specific books never leak into ordinary public generation. */
export function migrateSocialWorldBookSelections(config: BindingConfig, legacy: { twitter?: string[]; topic?: string[]; theqoo?: string[] }): BindingConfig {
 let result = { ...config, appDefaults: { ...config.appDefaults } };
 for (const app of ["twitter", "theqoo"] as const) {
  const old = legacy[app] || [];
  if (old.length && !result.appDefaults[app]?.worldBookIds?.length) result.appDefaults[app] = { ...result.appDefaults[app], worldBookIds: [...new Set(old)] };
 }
 if (legacy.topic?.length && !result.appDefaults.twitter?.topicWorldBookIds?.length) result.appDefaults.twitter = { ...result.appDefaults.twitter, topicWorldBookIds: [...new Set(legacy.topic)] };
 return result;
}
export function migrateSocialWorldBooks() {
 if (typeof window === "undefined" || kvGet(MIGRATION) === "done") return;
 let twitter: { worldBookIds?: string[]; sensitiveTopics?: { worldBookIds?: string[] } } = {}, theqoo: { worldBookIds?: string[] } = {};
 try { twitter = JSON.parse(kvGet("ai_phone_twitter_v1") || "{}"); } catch {}
 try { theqoo = JSON.parse(localStorage.getItem("ai_phone_theqoo_state_v1") || "{}"); } catch {}
 const ids = (value: unknown) => Array.isArray(value) ? value.filter((x): x is string => typeof x === "string") : [];
 const before = loadBindingConfig();
 const after = migrateSocialWorldBookSelections(before, { twitter: ids(twitter?.worldBookIds), topic: ids(twitter?.sensitiveTopics?.worldBookIds), theqoo: ids(theqoo?.worldBookIds) });
 if (JSON.stringify(before) !== JSON.stringify(after)) saveBindingConfig(after);
 kvSet(MIGRATION, "done");
}
export function boundSocialWorldBooks(app: "twitter" | "theqoo", characterId?: string, topic = false) {
 migrateSocialWorldBooks();
 const slot = resolveBinding(loadBindingConfig(), characterId, app);
 const ids = new Set(topic ? slot.topicWorldBookIds ?? slot.worldBookIds ?? [] : slot.worldBookIds || []);
 return loadWorldBooks().filter(book => ids.has(book.id));
}
