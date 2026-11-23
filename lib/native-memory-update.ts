import { loadCharacters } from "./character-storage";
import { incrementEventCounter, loadMemoryConfig } from "./memory-storage";

const pending = new Map<string, number>();
let scheduled = false;
/** Count committed native events, not previews or repeated renders.
 * Reuses the configured summarization threshold; disabled auto-summary makes no API call.
 */
export function queueNativeMemoryUpdate(characterIds: string[], source: string, count = 1): void {
  if (typeof window === "undefined" || count < 1) return;
  const allowed = loadMemoryConfig().shortTermAllowedSources as Record<string, boolean | undefined> | undefined;
  if (allowed?.[source] === false || source === "lysn" && allowed?.custom_app === false) return;
  const characters = new Set(loadCharacters().map(c => c.id));
  for (const id of new Set(characterIds)) if (characters.has(id)) pending.set(id, (pending.get(id) || 0) + count);
  if (scheduled || !pending.size) return;
  scheduled = true;
  queueMicrotask(() => {
    const batch = [...pending]; pending.clear(); scheduled = false;
    for (const [id, number] of batch) for (let i = 0; i < number; i++) incrementEventCounter(id);
    if (!loadMemoryConfig().autoSummarizeEnabled) return;
    void import("./memory-summarizer").then(async ({maybeRunSummarization}) => {
      for (const [id] of batch) {
        const character = loadCharacters().find(c => c.id === id);
        if (character) await maybeRunSummarization(id, character.name);
      }
    }).catch(error => console.warn("[NativeMemory] Summary deferred", error));
  });
}
