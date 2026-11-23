import type { Character } from "./character-types";
import { formatFixedCharacterRelationsForPrompt } from "./character-world-storage";
import { resolveUserIdentity } from "./settings-storage";
export function fixedRelationshipInstruction(character: Character, userName = "用户", identityId?: string | null, appId = "chat"): string {
  const actualId = identityId === undefined ? resolveUserIdentity(character.id, appId)?.id : identityId || undefined;
  const relations = formatFixedCharacterRelationsForPrompt(character.id, actualId);
  return relations ? `【关系设定】\n${relations}\n关系线不决定知道多少用户资料；遵循本轮注入的资料档位。未明确公开的关系也不向公众泄露。` : "";
}
