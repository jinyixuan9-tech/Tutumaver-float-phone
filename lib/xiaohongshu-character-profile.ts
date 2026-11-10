import type { Character } from "./character-types";
import type { CheckPhoneXiaohongshuPayload } from "./checkphone-config";
import { readPhoneSnapshotCache } from "./checkphone-storage";
import { getPlatformIdentity, resolveDefaultPlatformDisplayName } from "./platform-identity-storage";

export function resolveCharacterXiaohongshuDisplayName(character: Pick<Character, "id" | "name">): string {
  const snapshot = readPhoneSnapshotCache<CheckPhoneXiaohongshuPayload>(character.id, "xiaohongshu");
  const profileName = snapshot?.payload?.profile?.name?.trim();
  return getPlatformIdentity(character.id, "xiaohongshu")?.displayName?.trim() || (profileName && profileName !== character.name ? profileName : resolveDefaultPlatformDisplayName(character.id, "xiaohongshu"));
}
