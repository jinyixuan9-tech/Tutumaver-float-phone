import { loadCharacterWorldGroups } from "./character-world-storage";
export function socialRelated(a: string, b: string): boolean {
 return a !== b && loadCharacterWorldGroups().some(g => g.relations.some(r => (r.fromCharacterId === a && r.toCharacterId === b) || (r.fromCharacterId === b && r.toCharacterId === a)));
}
export const publicIdentityBoundary = "本人始终知道自己的人设、经历和记忆；这些是内部认知，不等于对外公开。公开评论、直播、回复只能使用对方账号公开允许的信息。即使私下互相知道，也不能在隐藏账号下喊真名、提主号归属或私人关系；使用网名。不知情者只按网友理解。";
