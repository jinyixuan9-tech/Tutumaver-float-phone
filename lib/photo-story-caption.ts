import { sendLLMRequest } from "./chat-engine";
import { loadCharacters } from "./character-storage";
import { loadPhotoLibrary } from "./photo-library-storage";
import { loadApiConfigs, loadBindingConfig, loadPresets, resolveBinding } from "./settings-storage";
import { PHOTO_STORY_RULES, photoStoryNotes, type PhotoStorySnapshot } from "./photo-story-data";

type CaptionInput = {
  photoId?: string;
  characterId: string;
  appId: "twitter" | "moments" | "weverse" | "lysn";
  original: string;
  translated?: string;
  /** Dedicated official/alternate pool: authorize only the selected account's photos. */
  allowedPhotoIds?: string[];
  accountContext?: string;
  /** Official communities use their existing member API binding, without impersonating that member. */
  bindingCharacterId?: string;
  signal?: AbortSignal;
};

/** Correct a new caption AFTER selecting the actual image. No note => no extra request. */
export async function preparePhotoStoryCaption(input: CaptionInput): Promise<{ original: string; translated: string; photoStoryContext?: PhotoStorySnapshot }> {
  const unchanged = { original: input.original, translated: input.translated || input.original };
  if (!input.photoId) return unchanged;
  const library = loadPhotoLibrary();
  const photo = library.photos.find(item => item.id === input.photoId);
  if (!photo) return unchanged;
  const notes = photoStoryNotes(photo, library.photos);
  if (!notes.stackNote && !notes.photoNote) return unchanged;
  const authorized = input.allowedPhotoIds ? input.allowedPhotoIds.includes(photo.id) : photo.linkedCharacterIds.includes(input.characterId);
  if (!authorized) throw new Error("照片备注的使用权限已变化，请重新选择照片。");
  const photoStoryContext: PhotoStorySnapshot = { photoId: photo.id, authorId: input.characterId,
    authorizedCharacterIds: [...photo.linkedCharacterIds], ...notes };
  // Sending an image without a caption still needs a background snapshot for later replies.
  if (!input.original.trim()) return { ...unchanged, photoStoryContext };
  const revised = await revisePhotoStoryText(input, [photoStoryContext], photo.visionSummary);
  return { ...revised, photoStoryContext };
}

/** Also checks separate follow-up text sent in the same photo batch. Uses snapshots, not mutable live notes. */
export async function revisePhotoStoryText(input: Omit<CaptionInput, "photoId">, contexts: PhotoStorySnapshot[], visibleDescription?: string): Promise<{ original: string; translated: string }> {
  const allowed = contexts.filter(context => context.authorId === input.characterId || context.authorizedCharacterIds.includes(input.characterId));
  if (!allowed.length || !input.original.trim()) return { original: input.original, translated: input.translated || input.original };
  const character = loadCharacters().find(item => item.id === input.characterId);
  const binding = resolveBinding(loadBindingConfig(), input.bindingCharacterId || input.characterId, input.appId);
  const configs = loadApiConfigs();
  const api = binding.apiConfigId ? configs.find(item => item.id === binding.apiConfigId) : configs.find(item => item.apiKey?.trim()) || configs[0];
  if (!api) throw new Error("照片有故事备注，但未配置文案 API；本次配图暂未发布。");
  const preset = loadPresets().find(item => item.id === binding.presetId) || null;
  const raw = await sendLLMRequest(api, preset, [
    { role: "system", content: [
      `你正在为 ${input.appId} 的新内容校正配图文案。作者：${character?.name || input.characterId}。保持原文语言、语气、篇幅与原有发帖意图。`,
      character ? [character.persona, character.personality].filter(Boolean).join("\n").slice(0, 6000) : "",
      PHOTO_STORY_RULES,
      "实际选中照片的可见描述用于纠正先写文案后选图的错配。保留无冲突内容，修正与照片/备注不符的事实。不要求硬提摄影者或故事。",
      input.accountContext || "",
      '只输出 JSON：{"safeToPublish":true,"original":"可发布原文","translated":"对应简体中文译文"}。无法遵守限制就 safeToPublish=false。不得输出分析。',
    ].filter(Boolean).join("\n") },
    { role: "user", content: JSON.stringify({ original: input.original, translated: input.translated,
      visibleDescription, photoBackgrounds: allowed.map(context => ({ photoId: context.photoId, stackNote: context.stackNote, photoNote: context.photoNote })) }) },
  ], [], { characterName: character?.name || input.characterId }, {
    appId: input.appId, appTags: [input.appId, "photo-story-caption"], skipOutputRegex: true, signal: input.signal,
  });
  let result: { safeToPublish?: boolean; original?: unknown; translated?: unknown };
  try { const text = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""); result = JSON.parse(text); }
  catch { throw new Error("照片故事文案校正失败，本次配图暂未发布，请重试。"); }
  if (!result || typeof result !== "object" || Array.isArray(result) || result.safeToPublish !== true || typeof result.original !== "string" || !result.original.trim()
    || typeof result.translated !== "string" || !result.translated.trim()) throw new Error("照片故事文案未通过校正，本次配图暂未发布。");
  return { original: result.original.trim(), translated: result.translated.trim() };
}
