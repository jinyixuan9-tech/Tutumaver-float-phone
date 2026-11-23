import { prepareShortTermContext } from "./short-term-assembler";
import { loadMemoryConfig } from "./memory-storage";
import { retrieveCoreMemoriesForPrompt, retrieveMemoriesForPrompt } from "./memory-service";
import { formatCoreMemories, formatLongTermMemories } from "./memory-injector";

/** Shared cognition only. Each app still supplies its own audience, identity and actions.
 * Uses the existing over-budget retrieval policy; does not add embedding calls.
 */
export async function prepareCharacterMemory(characterId: string, appId: string, query: string,
  options?: Parameters<typeof prepareShortTermContext>[2]) {
  const recent = prepareShortTermContext(characterId, appId, options);
  const config = loadMemoryConfig();
  const [longTerm, core] = await Promise.all([
    retrieveMemoriesForPrompt(characterId, `本轮用户问题：${query}\n近期背景：${recent.wbActivationContext}`, config, { beforeTimestamp: options?.beforeTimestamp }),
    retrieveCoreMemoriesForPrompt(characterId, config, { beforeTimestamp: options?.beforeTimestamp }),
  ]);
  return { ...recent, history: recent.truncatedHistory,
    longTermMemories: formatLongTermMemories(longTerm), coreMemories: formatCoreMemories(core),
    worldBookActivationContext: recent.wbActivationContext };
}
