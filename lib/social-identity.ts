import { loadCharacterWorldGroups } from "./character-world-storage";
export function socialRelated(a: string, b: string): boolean {
  return a !== b && loadCharacterWorldGroups().some(g => g.relations.some(r => (r.fromCharacterId === a && r.toCharacterId === b) || (r.fromCharacterId === b && r.toCharacterId === a)));
}

export {
  PLATFORM_IDENTITIES_KEY,
  PLATFORM_IDENTITIES_UPDATED_EVENT,
  applyPlatformIdentityAction,
  buildPlatformIdentityAutonomyPrompt,
  canAutonomouslyChangePlatformIdentity,
  extractPlatformIdentityUpdates,
  getPlatformIdentity,
  isAnonymousCampusForumPlatform,
  listCharacterPlatformIdentities,
  resolvePlatformIdentity,
  resolveDefaultPlatformDisplayName,
  updatePlatformIdentity,
} from "./platform-identity-storage";
export type { PlatformIdentity, PlatformIdentityAction } from "./platform-identity-storage";
export { listSocialAvatarAssets, getSocialAvatarAsset, addSocialAvatarAsset, removeSocialAvatarAsset } from "./social-avatar-library";

export const publicIdentityBoundary = "本人始终知道自己的人设、经历和记忆；这些是内部认知，不等于对外公开。公开评论、直播、回复只能使用对方账号公开允许的信息。即使私下互相知道，也不能在隐藏账号下喊真名、提主号归属或私人关系；使用该平台自己的网名。不知情者只按网友理解。不同平台身份互相独立，不得因一个平台改名就覆盖其他平台。校园论坛按学号/固定匿名 ID 匿名，禁止修改或替换该 ID、禁止关联公开身份；如平台允许更换头像，只能使用不具身份识别性的头像。";
