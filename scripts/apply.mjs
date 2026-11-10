import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(scriptDir, "..");
const repoRoot = process.cwd();
const changed = new Set();

function read(rel) {
  const file = path.join(repoRoot, rel);
  if (!fs.existsSync(file)) throw new Error(`找不到目标文件：${rel}`);
  return fs.readFileSync(file, "utf8");
}
function write(rel, content) {
  const file = path.join(repoRoot, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, "utf8");
  changed.add(rel);
}
function copyPackageFile(sourceRel, targetRel) {
  const source = path.join(packageRoot, sourceRel);
  if (!fs.existsSync(source)) throw new Error(`补丁包缺少文件：${sourceRel}`);
  const content = fs.readFileSync(source, "utf8");
  const target = path.join(repoRoot, targetRel);
  if (fs.existsSync(target) && fs.readFileSync(target, "utf8") === content) return;
  write(targetRel, content);
}
function patchOnce(rel, before, after, label = before.slice(0, 80)) {
  const text = read(rel);
  if (text.includes(after)) return;
  const count = text.split(before).length - 1;
  if (count !== 1) throw new Error(`${rel}：定位「${label}」失败，预期出现 1 次，实际 ${count} 次。为避免误改，已停止。`);
  write(rel, text.replace(before, after));
}
function patchAll(rel, before, after, expectedCount, label = before.slice(0, 80)) {
  const text = read(rel);
  if (!text.includes(before)) {
    if (text.includes(after)) return;
    throw new Error(`${rel}：未找到「${label}」，且补丁内容也不存在。`);
  }
  const count = text.split(before).length - 1;
  if (count !== expectedCount) throw new Error(`${rel}：定位「${label}」失败，预期出现 ${expectedCount} 次，实际 ${count} 次。为避免误改，已停止。`);
  write(rel, text.split(before).join(after));
}
function patchRegexOnce(rel, regex, replacer, label = regex.toString()) {
  const text = read(rel);
  if (replacer && typeof replacer === "string" && text.includes(replacer)) return;
  const global = new RegExp(regex.source, regex.flags.includes("g") ? regex.flags : regex.flags + "g");
  const matches = [...text.matchAll(global)];
  if (matches.length !== 1) throw new Error(`${rel}：定位「${label}」失败，预期匹配 1 次，实际 ${matches.length} 次。为避免误改，已停止。`);
  write(rel, text.replace(regex, replacer));
}
function insertAfter(rel, anchor, addition, label = anchor.slice(0, 80)) {
  const text = read(rel);
  if (text.includes(addition.trim())) return;
  patchOnce(rel, anchor, anchor + addition, label);
}

// 1. Add the separate per-platform identity store and the non-character avatar library.
copyPackageFile("new-files/lib/platform-identity-storage.ts", "lib/platform-identity-storage.ts");
copyPackageFile("new-files/lib/social-avatar-library.ts", "lib/social-avatar-library.ts");
copyPackageFile("replace-files/lib/social-identity.ts", "lib/social-identity.ts");
copyPackageFile("replace-files/lib/social-language-instructions.ts", "lib/social-language-instructions.ts");

// 2. Extract hidden platform-profile actions and the real-evidence remark basis.
insertAfter(
  "lib/rich-message-parser.ts",
  'import type { ChatMessage } from "./chat-storage";\n',
  'import type { PlatformIdentityAction } from "./platform-identity-storage";\nimport { extractPlatformIdentityUpdates } from "./platform-identity-storage";\n',
  "rich-message-parser imports",
);
patchOnce(
  "lib/rich-message-parser.ts",
  '    characterRemarkForUser?: string;\n',
  '    characterRemarkForUser?: string;\n    /** 备注依据摘要，仅记录模型引用的已有事实，不作为新记忆写入。 */\n    characterRemarkForUserBasis?: string;\n    /** 角色主动更新的独立平台资料。 */\n    platformIdentityActions?: PlatformIdentityAction[];\n',
  "ParsedAIResponse remark field",
);
insertAfter(
  "lib/rich-message-parser.ts",
  'export function parseAIResponse(rawText: string, previousState: StateValue[]): ParsedAIResponse {\n',
  '    const platformIdentityExtraction = extractPlatformIdentityUpdates(rawText);\n',
  "parseAIResponse start",
);
patchOnce(
  "lib/rich-message-parser.ts",
  '    const characterRemarkForUser = characterRemarkMatch?.[1]?.trim();\n',
  '    const characterRemarkCandidate = characterRemarkMatch?.[1]?.trim();\n    const remarkBasisMatch = rawText.match(/[\\[【]\\s*备注依据\\s*[：:]\\s*([^\\]】\\n]{1,100})\\s*[\\]】]/);\n    const characterRemarkForUserBasis = remarkBasisMatch?.[1]?.trim();\n    const characterRemarkForUser = characterRemarkForUserBasis ? characterRemarkCandidate : undefined;\n',
  "remark basis parser",
);
patchOnce("lib/rich-message-parser.ts", "    let protected_ = rawText;", "    let protected_ = platformIdentityExtraction.cleanedText;", "identity action cleanup");
patchOnce(
  "lib/rich-message-parser.ts",
  String.raw`        .replace(/[\[【]\s*(?:给用户备注|给你备注|用户备注)\s*[：:]\s*[^\]】\n]{1,40}\s*[\]】]/g, "")`,
  String.raw`        .replace(/[\[【]\s*(?:给用户备注|给你备注|用户备注)\s*[：:]\s*[^\]】\n]{1,40}\s*[\]】]/g, "")
        .replace(/[\[【]\s*备注依据\s*[：:]\s*[^\]】\n]{1,100}\s*[\]】]/g, "")`,
  "remove remark basis action marker",
);
patchOnce(
  "lib/rich-message-parser.ts",
  '        characterRemarkForUser,\n',
  '        characterRemarkForUser,\n        characterRemarkForUserBasis,\n        platformIdentityActions: platformIdentityExtraction.actions,\n',
  "parser result properties",
);

// 3. Persist the evidence note beside the remark, without adding it to character memory.
insertAfter(
  "lib/chat-storage.ts",
  '    characterRemarkForUserUpdatedAt?: string;\n',
  '    /** 最近一次备注的依据摘要；只保存模型引用的真实已知事实。 */\n    characterRemarkForUserBasis?: string;\n',
  "ChatSession remark basis field",
);

// 4. Apply platform-profile actions from Chat replies and save remark provenance.
insertAfter(
  "components/chat/chat-room.tsx",
  'import { parseAIResponse, type ParsedMessagePart } from "@/lib/rich-message-parser";\n',
  'import { applyPlatformIdentityAction } from "@/lib/platform-identity-storage";\n',
  "chat-room platform action import",
);
patchOnce(
  "components/chat/chat-room.tsx",
  '        const { parts: rawParts, stateValues, freshStateValues, statusPanel, innerMonologue, characterRemarkForUser } = parseAIResponse(aiResponseText, previousState);\n',
  '        const { parts: rawParts, stateValues, freshStateValues, statusPanel, innerMonologue, characterRemarkForUser, characterRemarkForUserBasis, platformIdentityActions } = parseAIResponse(aiResponseText, previousState);\n        if (!session.isGroup && character?.id && platformIdentityActions?.length) {\n            for (const action of platformIdentityActions) applyPlatformIdentityAction(character.id, action);\n        }\n',
  "chat-room parser result",
);
patchOnce(
  "components/chat/chat-room.tsx",
  '\n                        characterRemarkForUserUpdatedAt: updatedAt,\n',
  '\n                        characterRemarkForUserUpdatedAt: updatedAt,\n                        characterRemarkForUserBasis: characterRemarkForUserBasis?.replace(/[\\r\\n]/g, " ").trim().slice(0, 50) || undefined,\n',
  "persist remark basis in saved session",
);
patchOnce(
  "components/chat/chat-room.tsx",
  '\n                    characterRemarkForUserUpdatedAt: updatedAt,\n',
  '\n                    characterRemarkForUserUpdatedAt: updatedAt,\n                    characterRemarkForUserBasis: characterRemarkForUserBasis?.replace(/[\\r\\n]/g, " ").trim().slice(0, 50) || undefined,\n',
  "persist remark basis in active session",
);

// 5. Make the generic identity behaviour available in normal online private Chat.
insertAfter(
  "lib/chat-engine.ts",
  'import { CHARACTER_REMARK_LANGUAGE_INSTRUCTION } from "./social-language-instructions";\n',
  'import { buildPlatformIdentityAutonomyPrompt } from "./platform-identity-storage";\n',
  "chat-engine identity prompt import",
);
insertAfter(
  "lib/chat-engine.ts",
  '    if (!session.isGroup && !isOfflineMode && resolvedAppId === "chat") {\n',
  '        llmMessages.push({ role: "system", content: buildPlatformIdentityAutonomyPrompt(character) });\n',
  "inject cross-platform profile behaviour",
);
patchRegexOnce(
  "lib/chat-engine.ts",
  /        if \(!explicitWeverseProfileRequest\) \{[\s\S]*?        const lysnIdentity = lysnPrivateChatPrompt\(character\.id\);/,
  `        // 社交平台资料统一由 Platform Identity Store + Social Avatar Library 管理。
        // 保留显式请求识别结果供兼容路径使用，但不再注入旧 Photos 头像候选。
        void explicitWeverseProfileRequest;
        void explicitChatProfileRequest;
        void explicitLysnRequest;
        const lysnIdentity = lysnPrivateChatPrompt(character.id);`,
  "replace legacy Photos-based profile prompts",
);
patchOnce(
  "lib/chat-engine.ts",
  'import { buildChatProfileAutonomyPrompt, isExplicitChatProfileRequestTurn } from "./chat-profile-autonomy";',
  'import { isExplicitChatProfileRequestTurn } from "./chat-profile-autonomy";',
  "remove legacy Chat profile prompt import",
);
patchOnce(
  "lib/chat-engine.ts",
  'import { buildWeverseProfileAutonomyPrompt, isExplicitWeverseProfileRequestTurn } from "./weverse-profile-autonomy";',
  'import { isExplicitWeverseProfileRequestTurn } from "./weverse-profile-autonomy";',
  "remove legacy Weverse profile prompt import",
);
patchOnce(
  "lib/chat-engine.ts",
  'import { lysnProfilePrompt, explicitLysnProfileRequest } from "./lysn-profile-autonomy";',
  'import { explicitLysnProfileRequest } from "./lysn-profile-autonomy";',
  "remove legacy Lysn profile prompt import",
);

// 6. Chat renderer: prefer the per-platform name and a non-person avatar when no profile exists.
insertAfter(
  "lib/chat-profile-storage.ts",
  'import type { Character } from "./character-types";\n',
  'import { getPlatformIdentity, resolveDefaultPlatformDisplayName } from "./platform-identity-storage";\nimport { getDefaultSocialAvatarAsset } from "./social-avatar-library";\n',
  "Chat profile identity imports",
);
patchOnce(
  "lib/chat-profile-storage.ts",
  '  return getChatCharacterProfile(character.id)?.displayName?.trim() || character.name;\n',
  '  const legacyName = getChatCharacterProfile(character.id)?.displayName?.trim();\n  return getPlatformIdentity(character.id, "chat")?.displayName?.trim() || (legacyName && legacyName !== character.name ? legacyName : resolveDefaultPlatformDisplayName(character.id, "chat"));\n',
  "Chat display name resolver",
);
patchOnce(
  "lib/chat-profile-storage.ts",
  '  const avatarUrl = getChatCharacterProfile(character.id)?.avatarUrl;\n',
  '  const platformAvatar = getPlatformIdentity(character.id, "chat")?.avatarUrl;\n  if (platformAvatar) return platformAvatar;\n  const avatarUrl = getChatCharacterProfile(character.id)?.avatarUrl;\n',
  "Chat avatar resolver",
);
patchOnce(
  "lib/chat-profile-storage.ts",
  '  return avatarUrl || character.avatar || null;\n',
  '  return avatarUrl || getDefaultSocialAvatarAsset(character.id, "chat")?.url || character.avatar || null;\n',
  "Chat non-person avatar fallback",
);
patchOnce(
  "lib/chat-profile-storage.ts",
  '    return character.avatar || null;\n',
  '    return getDefaultSocialAvatarAsset(character.id, "chat")?.url || null;\n',
  "replace legacy portrait avatar fallback",
);

// 7. Overlay identity on existing platform data models, leaving historical content snapshots intact.
insertAfter(
  "lib/xiaohongshu-character-profile.ts",
  'import { readPhoneSnapshotCache } from "./checkphone-storage";\n',
  'import { getPlatformIdentity, resolveDefaultPlatformDisplayName } from "./platform-identity-storage";\n',
  "XHS identity import",
);
patchOnce(
  "lib/xiaohongshu-character-profile.ts",
  '  const profileName = snapshot?.payload?.profile?.name?.trim();\n  return profileName || character.name;\n',
  '  const profileName = snapshot?.payload?.profile?.name?.trim();\n  return getPlatformIdentity(character.id, "xiaohongshu")?.displayName?.trim() || (profileName && profileName !== character.name ? profileName : resolveDefaultPlatformDisplayName(character.id, "xiaohongshu"));\n',
  "XHS display name resolver",
);

insertAfter(
  "lib/weverse-storage.ts",
  'import { kvGet, kvSet, registerKvMigration } from "./kv-db";\n',
  'import { getPlatformIdentity, resolveDefaultPlatformDisplayName } from "./platform-identity-storage";\nimport { getDefaultSocialAvatarAsset } from "./social-avatar-library";\n',
  "Weverse identity import",
);
patchRegexOnce(
  "lib/weverse-storage.ts",
  /export function loadWeverseState\(\): WeverseState \{ reconcileCalendarMaster\(\); if \(typeof window === "undefined"\) return EMPTY_STATE; try \{ const raw=kvGet\(WEV_STATE_KEY\); return raw \? normalizeState\(JSON\.parse\(raw\)\) : cloneEmpty\(\); \} catch \{ return cloneEmpty\(\); \} \}/,
  `export function loadWeverseState(): WeverseState {
  reconcileCalendarMaster();
  if (typeof window === "undefined") return EMPTY_STATE;
  try {
    const raw = kvGet(WEV_STATE_KEY);
    const state = raw ? normalizeState(JSON.parse(raw)) : cloneEmpty();
    const communities = state.communities.map((community) => {
      const memberProfiles = { ...community.memberProfiles };
      for (const characterId of community.memberCharacterIds) {
        const identity = getPlatformIdentity(characterId, "weverse");
        const previous = memberProfiles[characterId] || { characterId };
        memberProfiles[characterId] = {
          ...previous,
          displayName: identity?.displayName || previous.displayName || resolveDefaultPlatformDisplayName(characterId, "weverse"),
          avatarUrl: identity?.avatarUrl || previous.avatarUrl || getDefaultSocialAvatarAsset(characterId, "weverse")?.url,
          characterId,
        };
      }
      return { ...community, memberProfiles };
    });
    return { ...state, communities };
  } catch { return cloneEmpty(); }
}`,
  "Weverse state identity overlay",
);

insertAfter(
  "lib/lysn-storage.ts",
  'import { kvGet, kvSet, registerKvMigration } from "./kv-db";\n',
  'import { getPlatformIdentity, resolveDefaultPlatformDisplayName } from "./platform-identity-storage";\nimport { getDefaultSocialAvatarAsset } from "./social-avatar-library";\n',
  "Lysn identity import",
);
insertAfter(
  "lib/lysn-storage.ts",
  'const empty = (): LysnState => ({ version: 1, subscribedIds: [], profiles: {}, messages: [], readAt: {}, subscribedAt: {}, lastAutoAt: {}, rooms: {}, userProfile: { ...DEFAULT_LYSN_USER }, settings: { ...DEFAULT_LYSN_SETTINGS } });\n',
  `function overlayLysnProfiles(raw: unknown, subscribedIds: unknown): Record<string, LysnProfile> {
  const profiles: Record<string, LysnProfile> = raw && typeof raw === "object" && !Array.isArray(raw) ? { ...(raw as Record<string, LysnProfile>) } : {};
  const ids = new Set<string>([
    ...Object.keys(profiles),
    ...(Array.isArray(subscribedIds) ? subscribedIds.filter((id): id is string => typeof id === "string") : []),
  ]);
  for (const characterId of ids) {
    const identity = getPlatformIdentity(characterId, "lysn");
    const previous = profiles[characterId] || { name: "", avatar: "", updatedAt: 0 };
    profiles[characterId] = {
      ...previous,
      name: identity?.displayName || previous.name || resolveDefaultPlatformDisplayName(characterId, "lysn"),
      avatar: identity?.avatarUrl || previous.avatar || getDefaultSocialAvatarAsset(characterId, "lysn")?.url || "",
    };
  }
  return profiles;
}
`,
  "Lysn identity overlay helper",
);
patchOnce(
  "lib/lysn-storage.ts",
  '      profiles: parsed.profiles && typeof parsed.profiles === "object" ? parsed.profiles : {},\n',
  '      profiles: overlayLysnProfiles(parsed.profiles, parsed.subscribedIds),\n',
  "Lysn profile load overlay",
);

insertAfter(
  "lib/twitter-storage.ts",
  'import type { RoleSocialSources } from "./role-social-sources";\n',
  'import { getPlatformIdentity, resolveDefaultPlatformDisplayName } from "./platform-identity-storage";\nimport { getDefaultSocialAvatarAsset } from "./social-avatar-library";\n',
  "Twitter identity import",
);
insertAfter(
  "lib/twitter-storage.ts",
  '    if(Object.values(profiles).some(p=>p.enabled===undefined)) kvSet(TWITTER_STORAGE_KEY,JSON.stringify(migrated));\n',
  `    const charactersById = new Map(loadCharacters().map((row) => [row.id, row]));
    for (const [characterId, profile] of Object.entries(migrated.characterProfiles)) {
      const identity = getPlatformIdentity(characterId, "twitter");
      const character = charactersById.get(characterId);
      const name = identity?.displayName || (character && (!profile.name || profile.name === character.name) ? resolveDefaultPlatformDisplayName(characterId, "twitter") : profile.name);
      const avatarUrl = identity?.avatarUrl || profile.avatarUrl || getDefaultSocialAvatarAsset(characterId, "twitter")?.url;
      migrated.characterProfiles[characterId] = { ...profile, name, avatarUrl };
      // Posts resolve the primary account before characterProfiles; keep those two views aligned.
      if (migrated.accounts[characterId]) migrated.accounts[characterId] = { ...migrated.accounts[characterId], name, avatarUrl };
    }
`,
  "Twitter character profile overlay",
);

patchOnce(
  "lib/moments-storage.ts",
  'import { resolveChatCharacterDisplayName } from "./chat-profile-storage";\n',
  'import { resolvePlatformIdentity } from "./platform-identity-storage";\n',
  "Moments identity import",
);
patchOnce(
  "lib/moments-storage.ts",
  '            return loadChatContacts().find(contact => contact.characterId === character.id)?.nickname?.trim() || resolveChatCharacterDisplayName(character);\n',
  '            return loadChatContacts().find(contact => contact.characterId === character.id)?.nickname?.trim() || resolvePlatformIdentity(character, "moments").displayName;\n',
  "Moments notification name resolver",
);

console.log("平台身份补丁已应用。修改文件：\n" + [...changed].sort().map((name) => `- ${name}`).join("\n"));
