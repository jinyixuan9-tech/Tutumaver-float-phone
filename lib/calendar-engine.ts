import {calendarWorldlineContext} from "./calendar-worldline-context";
import { calendarGenerationPrompt } from "./calendar-generation-prompt";
import type { Character } from "./character-types";
import type { ApiConfig, PresetConfig, RegexConfig, WorldBookConfig } from "./settings-types";
import type { UserIdentity } from "@/components/settings/user-identity";
import type { AssemblerInput, LLMMessage } from "./llm-prompt-assembler";
import type { CalendarOwnerType, CalendarScheduleItem } from "./calendar-types";
import { loadCharacters } from "./character-storage";
import {
  loadBindingConfig,
  loadApiConfigs,
  loadPresets,
  loadWorldBooks,
  loadRegexes,
  resolveBinding,
  resolveUserIdentity,
} from "./settings-storage";
import { assemblePromptPayload, isWorldBookEntryActivated } from "./llm-prompt-assembler";
import { loadMemoryConfig } from "./memory-storage";
import { retrieveCoreMemoriesForPrompt, retrieveMemoriesForPrompt } from "./memory-service";
import { formatCoreMemories, formatLongTermMemories } from "./memory-injector";
import { prepareShortTermContext } from "./short-term-assembler";
import { getCustomStickerExample, getCustomStickerNames } from "./custom-sticker-storage";
import { previewMessagesForApi, sendLLMRequest, type ChatEngineError } from "./chat-engine";
import { applyGeneratedCalendarRange, buildCalendarScheduleMarker, clearGeneratedWeekItems, cloneWeekPlanWithManualEdits, loadOwnerCalendarPlans, normalizeGeneratedScheduleItems, restoreCalendarWeekItems } from "./calendar-storage";
import {
  getWeekDates,
  getWeekStartIso,
  getWeekdayLabel,
  formatIsoDate,
  isCalendarTimeRangeAllowed,
  normalizeTime,
  sanitizeScheduleEmoji,
} from "./calendar-utils";

type CalendarAssemblerResolved = {
  apiConfig: ApiConfig;
  preset: PresetConfig | null;
  regexes: RegexConfig[];
  llmMessages: LLMMessage[];
  ownerName: string;
  contextSummary: string;
};

export type CalendarRangeGenerationRequest = {
  additionalPrompt?: string;
  characterIds: string[];
  fromDate: string;
  toDate: string;
  mode: "together" | "separate";
  sharedPairs: string[][];
  existingMode: "supplement" | "replan";
};

function buildSyntheticUserCharacter(identity: UserIdentity | null): Character {
  const now = new Date().toISOString();
  const personaLines = [
    identity?.bio?.trim(),
    identity?.occupation ? `职业：${identity.occupation}` : "",
    identity?.age ? `年龄：${identity.age}` : "",
    identity?.gender && identity.gender !== "保密" ? `性别：${identity.gender}` : "",
    identity?.customSettings?.trim(),
  ].filter(Boolean);

  return {
    id: "__calendar_user__",
    name: identity?.name?.trim() || "用户",
    avatar: identity?.avatarUrl || null,
    persona: personaLines.join("\n") || "这是用户本人。",
    wechatID: "",
    createdAt: now,
    updatedAt: now,
  };
}

function buildCalendarTriggerInstruction(ownerName: string, weekDates: string[]): string {
  return [
    `为${ownerName}安排 ${weekDates[0]} 至 ${weekDates[6]} 的一周日历，按已提供的人设和近期生活判断本周实际值得记录的事项。`,
    "只输出逐行记录：YYYY-MM-DD|周几|开始时间|结束时间|地点|emoji|事项|忙碌档。星期必须对应日期，地点未知或没有合适 emoji 时填无；忙碌档为1至4。",
    "不补空白占位项。本周确实没有新增重要事项时只返回：本周暂无重要日程。",
  ].join("\n");
}

function stripCodeFences(text: string): string {
  return text
    .replace(/^```[a-zA-Z]*\s*/g, "")
    .replace(/\s*```$/g, "")
    .trim();
}

function parseScheduleLines(rawText: string, weekStart: string): CalendarScheduleItem[] {
  const weekDates = new Set(getWeekDates(weekStart));
  const lines = stripCodeFences(rawText)
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  const parsed: Array<{
    date: string;
    startTime: string;
    endTime: string;
    location: string;
    title: string;
    emoji?: string;
    busyLevel?: 1 | 2 | 3 | 4;
  }> = [];

  for (const rawLine of lines) {
    const line = rawLine
      .replace(/^[-*]\s*/, "")
      .replace(/^\d+[.)、]\s*/, "")
      .trim();
    if (!line.includes("|")) continue;
    const parts = line.split("|").map(part => part.trim());
    if (parts.length < 6) continue;

    const date = parts[0];
    const startTime = normalizeTime(parts[2]);
    const endTime = normalizeTime(parts[3]);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !weekDates.has(date)) continue;
    if (!startTime || !endTime || !isCalendarTimeRangeAllowed(startTime, endTime)) continue;

    const location = parts[4] === "无" ? "" : parts[4];
    // 新格式第 6 段为 emoji（YYYY-MM-DD|周几|开始|结束|地点|emoji|事项）；
    // 兼容旧格式（第 6 段直接是事项）：仅当该段确实是 emoji 时才按新格式取。
    let emoji = "";
    let title: string;
    let busyLevel: 1 | 2 | 3 | 4 | undefined;
    const possibleBusyLevel = Number(parts[parts.length - 1]);
    const hasBusyLevel = parts.length >= 8 && [1, 2, 3, 4].includes(possibleBusyLevel);
    if (hasBusyLevel) busyLevel = possibleBusyLevel as 1 | 2 | 3 | 4;
    const contentParts = hasBusyLevel ? parts.slice(0, -1) : parts;
    if (contentParts.length >= 7) {
      const candidate = sanitizeScheduleEmoji(contentParts[5]);
      if (candidate && Array.from(contentParts[5]).length <= 3) {
        emoji = candidate;
        title = contentParts.slice(6).join("|");
      } else {
        title = contentParts.slice(5).join("|");
      }
    } else {
      title = contentParts[5];
    }
    if (!title.trim()) continue;

    parsed.push({
      date,
      startTime,
      endTime,
      location,
      title,
      emoji,
      ...(busyLevel ? { busyLevel } : {}),
    });
  }

  return normalizeGeneratedScheduleItems(parsed);
}

async function resolveCalendarAssemblerInput(
  ownerType: CalendarOwnerType,
  ownerId: string,
  weekStart: string,
  options?: { skipWorldBooks?: boolean; replaceRange?: { fromDate: string; toDate: string } },
): Promise<CalendarAssemblerResolved> {
  const bindings = loadBindingConfig();
  const activeSlot = resolveBinding(bindings, ownerType === "character" ? ownerId : undefined, "calendar");

  if (!activeSlot.apiConfigId) {
    throw new Error("未绑定日历 API，请先在配置绑定中为日历设置 API。");
  }

  const apiConfigs = loadApiConfigs();
  const apiConfig = apiConfigs.find(entry => entry.id === activeSlot.apiConfigId);
  if (!apiConfig) {
    throw new Error("日历 API 配置不存在。");
  }

  const presets = loadPresets();
  let preset = activeSlot.presetId ? presets.find(entry => entry.id === activeSlot.presetId) ?? null : null;
  if (!preset) preset = presets.find(entry => entry.builtIn) ?? null;
  // Replace the calendar task slot in the request copy; do not reset the user's whole preset.
  if (preset) preset = { ...preset, prompts: preset.prompts.map(prompt => prompt.identifier === "calendar_plan_generation"
    ? { ...prompt, content: calendarGenerationPrompt() } : prompt) };


  const allWorldBooks = loadWorldBooks();
  const worldBooks = (activeSlot.worldBookIds || [])
    .map(id => allWorldBooks.find(entry => entry.id === id))
    .filter(Boolean) as WorldBookConfig[];

  const allRegexes = loadRegexes();
  const regexes = (activeSlot.regexIds || [])
    .map(id => allRegexes.find(entry => entry.id === id))
    .filter(Boolean) as RegexConfig[];

  const userIdentity = resolveUserIdentity(ownerType === "character" ? ownerId : undefined, "calendar");
  const character =
    ownerType === "character"
      ? loadCharacters().find(entry => entry.id === ownerId)
      : buildSyntheticUserCharacter(resolveUserIdentity(undefined, "calendar"));

  if (!character) {
    throw new Error("日历目标不存在。");
  }

  const memConfig = loadMemoryConfig();
  let coreMemories = "";
  let longTermMemories = "";
  let recentBlocks: import("./short-term-assembler").RecentBlock[] = [];
  let unifiedRecentItems: import("./short-term-assembler").UnifiedRecentItem[] = [];
  let wbActivationContext = "";

  if (ownerType === "character") {
    const prepared = prepareShortTermContext(ownerId, "calendar", { history: [] });
    recentBlocks = prepared.recentBlocks;
    unifiedRecentItems = prepared.unifiedRecentItems;
    wbActivationContext = prepared.wbActivationContext;
    const [coreResults, longResults] = await Promise.all([
      retrieveCoreMemoriesForPrompt(ownerId, memConfig).catch(() => []),
      retrieveMemoriesForPrompt(ownerId, wbActivationContext, memConfig).catch(() => []),
    ]);
    coreMemories = formatCoreMemories(coreResults);
    longTermMemories = formatLongTermMemories(longResults);
  }

  const scheduleSummary = options?.replaceRange
    ? loadOwnerCalendarPlans(ownerType, ownerId).flatMap(plan => plan.items)
      .filter(item => item.date >= options.replaceRange!.fromDate && item.date <= options.replaceRange!.toDate && item.source !== "generated")
      .map(item => `[${item.visibility === "public" ? "公开" : "私人"}/${item.kind === "milestone" ? "不占用时间的节点" : "实际行程"}] ${item.date} ${item.startTime}-${item.endTime} ${item.title}`).join("\n") || "该范围没有必须保留的手动或WVS安排。"
    : buildCalendarScheduleMarker(ownerType, ownerId, weekStart);
  const llmMessages = assemblePromptPayload({
    character,
    history: [],
    preset,
    worldBooks: options?.skipWorldBooks ? [] : worldBooks,
    regexes,
    userIdentity,
    appId: "calendar",
    scheduleSummary,
    coreMemories,
    longTermMemories,
    worldBookActivationContext: wbActivationContext || undefined,
    recentBlocks,
    unifiedRecentItems,
    customStickerNames: ownerType === "character" ? getCustomStickerNames(ownerId) : "",
    customStickerExample: ownerType === "character" ? getCustomStickerExample(ownerId) : "",
  } as AssemblerInput);

  if (!llmMessages.some(message => typeof message.content === "string" && message.content.includes(calendarGenerationPrompt()))) {
    llmMessages.push({ role: "system", content: calendarGenerationPrompt() });
  }
  return {
    apiConfig,
    preset,
    regexes,
    llmMessages,
    ownerName: character.name,
    contextSummary: [
      coreMemories ? `重要记忆：\n${coreMemories}` : "",
      longTermMemories ? `近期记忆：\n${longTermMemories}` : "",
      recentBlocks.map(block => block.content).filter(Boolean).join("\n"),
    ].filter(Boolean).join("\n\n"),
  };
}

export async function generateWeeklyCalendarSchedule(
  ownerType: CalendarOwnerType,
  ownerId: string,
  weekStart: string,
): Promise<{ success: boolean; error?: string; items?: CalendarScheduleItem[] }> {
  if (ownerType !== "character") {
    return { success: false, error: "用户日程不支持 AI 生成，请手动填写。" };
  }
  const dates=getWeekDates(weekStart);
  const result=await generateCalendarScheduleRange({characterIds:[ownerId],fromDate:dates[0],toDate:dates[dates.length-1],existingMode:"supplement",mode:"separate",sharedPairs:[]});
  return {...result,items:result.success?loadOwnerCalendarPlans("character",ownerId).find(p=>p.weekStart===weekStart)?.items:undefined};
}

function parseRangeScheduleResponse(
  rawText: string,
  request: CalendarRangeGenerationRequest,
  owners: Array<{ id: string; name: string }>,
) {
  const raw = stripCodeFences(rawText);
  const jsonStart = raw.indexOf("{");
  const jsonEnd = raw.lastIndexOf("}");
  if (jsonStart < 0 || jsonEnd <= jsonStart) throw new Error("AI 返回内容不是有效的日程 JSON。");
  let result: unknown;
  try { result = JSON.parse(raw.slice(jsonStart, jsonEnd + 1)); }
  catch { throw new Error("AI 返回的日程格式无法解析，请重试。"); }
  const root = result as {
    characters?: Array<{ characterId?: string; characterName?: string; name?: string; id?: string; items?: Array<Record<string, unknown>> }>;
    items?: Array<Record<string, unknown>>;
    sharedItems?: Array<Record<string, unknown>>;
  };
  const chosen = new Set(request.characterIds);
  const byOwner = new Map<string, CalendarScheduleItem[]>();
  const ownerNames = new Map(owners.map(owner => [owner.id, owner.name]));
  const normalizedName = (value: unknown) => String(value || "").trim().toLocaleLowerCase().replace(/[\s　]+/g, "");
  const idsByName = new Map<string, string[]>();
  for (const [id, name] of ownerNames) {
    const key = normalizedName(name);
    idsByName.set(key, [...(idsByName.get(key) || []), id]);
  }
  const resolveOwnerId = (value: unknown): string | undefined => {
    const reference = String(value || "").trim();
    if (chosen.has(reference)) return reference;
    const matches = idsByName.get(normalizedName(reference)) || [];
    return matches.length === 1 && chosen.has(matches[0]) ? matches[0] : undefined;
  };
  const normalize = (rows: Array<Record<string, unknown>> | undefined) => normalizeGeneratedScheduleItems((rows || []).flatMap(row => {
    const date = String(row.date || "");
    const startTime = normalizeTime(String(row.startTime || ""));
    const endTime = row.kind==="milestone" ? startTime : normalizeTime(String(row.endTime || ""));
    const title = String(row.title || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || formatIsoDate(new Date(`${date}T00:00:00`)) !== date
      || date < request.fromDate || date > request.toDate || !startTime || !endTime || !title) return [];
    const busyLevelValue = Number(row.busyLevel);
    const busyLevel = busyLevelValue === 1 || busyLevelValue === 2 || busyLevelValue === 3 || busyLevelValue === 4
      ? busyLevelValue as 1 | 2 | 3 | 4
      : undefined;
    return [{ encounterScene: typeof row.encounterScene === "string" ? row.encounterScene.slice(0,100) : undefined, visibility: row.visibility === "public" ? "public" as const : "private" as const, kind: row.kind === "milestone" ? "milestone" as const : "event" as const, contentDescription: typeof row.contentDescription === "string" ? row.contentDescription.slice(0,4000) : undefined, publicAt: typeof row.publicAt === "string" ? row.publicAt : undefined, date, startTime, endTime, location: String(row.location || ""), title, emoji: String(row.emoji || ""), ...(busyLevel ? { busyLevel } : {}) }];
  }));
  const responseCharacters = Array.isArray(root.characters) ? root.characters : [];
  for (const entry of responseCharacters) {
    const ownerId = resolveOwnerId(entry.characterId) || resolveOwnerId(entry.characterName) || resolveOwnerId(entry.name) || resolveOwnerId(entry.id)
      // A single-person response is unambiguous even when the model substitutes a display name or omits the ID.
      || (request.characterIds.length === 1 ? request.characterIds[0] : undefined);
    if (!ownerId) continue;
    byOwner.set(ownerId, normalize(entry.items));
  }
  if (!responseCharacters.length && Array.isArray(root.items) && request.characterIds.length === 1) {
    byOwner.set(request.characterIds[0], normalize(root.items));
  }
  const missingOwners = request.characterIds.filter(id => !byOwner.has(id));
  if (missingOwners.length) throw new Error("AI 返回的日程没有正确对应到所有所选角色，请重试。");
  for (const id of request.characterIds) if (!byOwner.has(id)) byOwner.set(id, []);
  for (const row of root.sharedItems || []) {
    const participants = Array.isArray(row.participantIds)
      ? Array.from(new Set(row.participantIds.map(resolveOwnerId).filter((id): id is string => Boolean(id))))
      : [];
    const allowed = request.mode === "together" && request.sharedPairs.some(pair =>
      pair.length === participants.length && participants.every(id => chosen.has(id)) && pair.every(id => participants.includes(id)));
    if (participants.length < 2 || !allowed) continue;
    const normalized = normalize([row]);
    if (!normalized.length) continue;
    const groupId = `calendar_shared_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const shared = { ...normalized[0], sharedGroupId: groupId, sharedCharacterIds: participants };
    for (const id of participants) byOwner.set(id, [...(byOwner.get(id) || []), { ...shared, id: `calendar_item_${Date.now()}_${Math.random().toString(36).slice(2, 8)}` }]);
  }
  return Array.from(byOwner, ([ownerId, items]) => ({ ownerId, items }));
}

export async function generateCalendarScheduleRange(
  request: CalendarRangeGenerationRequest,
): Promise<{ success: boolean; error?: string; generatedCount?: number; pendingCount?: number }> {
  if (!request.characterIds.length || request.characterIds.length > 3) return { success: false, error: "一次请选择 1 到 3 位角色。" };
  if (request.fromDate > request.toDate) return { success: false, error: "结束日期不能早于开始日期。" };
  const ids = Array.from(new Set(request.characterIds));
  try {
    const bindings = loadBindingConfig();
    const bindingKey = (id: string) => {
      const slot = resolveBinding(bindings, id.startsWith("user:")?undefined:id, "calendar");
      return JSON.stringify({
        apiConfigId: slot.apiConfigId,
        presetId: slot.presetId,
        userIdentityId: slot.userIdentityId,
        regexIds: [...(slot.regexIds || [])].sort(),
      });
    };
    const firstBindingKey = bindingKey(ids[0]);
    if (ids.some(id => bindingKey(id) !== firstBindingKey)) {
      return { success: false, error: "所选角色的日历 API、预设或上下文配置不同，暂时不能合并为一次生成；可先选择配置相同的角色。" };
    }
    const resolved = await Promise.all(ids.map(id => resolveCalendarAssemblerInput(
      id.startsWith("user:")?"user":"character", id.startsWith("user:")?"self":id, getWeekStartIso(new Date(`${request.fromDate}T00:00:00`)), { skipWorldBooks: ids.length > 1, ...(request.existingMode === "replan" ? { replaceRange: { fromDate: request.fromDate, toDate: request.toDate } } : {}) },
    )));
    const firstRegexIds = resolved[0].regexes.map(regex => regex.id).sort().join(",");
    if (resolved.some(item => item.apiConfig.id !== resolved[0].apiConfig.id
      || item.preset?.id !== resolved[0].preset?.id
      || item.regexes.map(regex => regex.id).sort().join(",") !== firstRegexIds)) {
      return { success: false, error: "所选角色的日历 API 或预设不同，暂时不能合并为一次生成；请改选兼容的角色。" };
    }
    const owners = [...loadCharacters().filter(character => ids.includes(character.id)),...ids.filter(id=>id.startsWith("user:")).map(id=>({...buildSyntheticUserCharacter(resolveUserIdentity(undefined,"calendar")),id}))];
    const existingContext = ids.map(id => {
      const plans = loadOwnerCalendarPlans(id.startsWith("user:")?"user":"character", id.startsWith("user:")?"self":id);
      const entries = plans.flatMap(plan => plan.items).filter(item => item.date >= request.fromDate && item.date <= request.toDate
        && !(request.existingMode === "replan" && item.source === "generated"));
      const lines = entries.map(item => `- [${item.visibility === "public" ? "公开" : "私人"}/${item.kind === "milestone" ? "不占用时间的节点" : "实际行程"}] ${item.date} ${item.startTime}-${item.endTime} ${item.title}${item.location ? ` @${item.location}` : ""}`);
      return `${owners.find(owner => owner.id === id)?.name || id} 已有安排：\n${lines.length ? lines.join("\n") : "（无）"}`;
    }).join("\n\n");
    const personaContext = owners.map(owner => `【${owner.name}】\n${owner.persona || "暂无详细人设，按过往互动与合理日常推断。"}`).join("\n\n");
    const peopleHistory = resolved.map((entry, index) => index === 0 || !entry.contextSummary
      ? ""
      : `【${entry.ownerName}的过往互动与记忆】\n${entry.contextSummary}`).filter(Boolean).join("\n\n");
    // 多人生成不直接使用首位角色的世界书。按实际绑定者聚合：同一本书只注入一次，
    // 但注入时必须标明适用角色，防止私人设定被当作所有人共享的事实。
    const worldBookContext = (() => {
      if (ids.length <= 1) return ""; // 单人沿用原组装器的世界书激活与注入
      const books = loadWorldBooks();
      const bindingsByBook = new Map<string, string[]>();
      for (const id of ids) {
        const slot = resolveBinding(bindings, id.startsWith("user:")?undefined:id, "calendar");
        for (const bookId of new Set(slot.worldBookIds || [])) {
          const owners = bindingsByBook.get(bookId) || [];
          owners.push(id);
          bindingsByBook.set(bookId, owners);
        }
      }
      return [...bindingsByBook].flatMap(([bookId, boundIds]) => {
        const book = books.find(entry => entry.id === bookId);
        if (!book) return [];
        const names = boundIds.map(id => owners.find(owner => owner.id === id)?.name || id);
        const activation = boundIds.map(id => resolved[ids.indexOf(id)]?.contextSummary || "").join("\n");
        const entries = (book.entries || []).filter(entry => !entry.disable && isWorldBookEntryActivated(entry, activation));
        if (!entries.length) return [];
        const content = entries
          .map(entry => entry.content.replace(/\{\{char\}\}/gi, names.join("、"))).join("\n\n");
        return [`【世界书：${book.name}｜仅适用于：${names.join("、")}】\n${content}`];
      }).join("\n\n");
    })();
    const sharedInstruction = request.sharedPairs.length
      ? `允许考虑以下共同参与组合，但不要求每组都生成共同事项：${request.sharedPairs.map(pair => pair.map(id => owners.find(owner => owner.id === id)?.name || id).join("+" )).join("、")}`
      : "不要生成共同事项，每个人各自安排。";
    const modeInstruction = request.mode === "together"
      ? "整体考虑彼此关系与行程，可安排自然合理的共同活动；仍要分别给每个人列出日程。"
      : "每个人独立安排，不让彼此行程互相影响，也不要安排共同活动。";
    const ownerIdMap = owners.map(owner => `- ${owner.name}：${owner.id}`).join("\n");
    const prompt = [
      "每项必须包含 visibility=public/private、kind=event/milestone。event是实际占用时间的行程，milestone是作品上线、节目播出等不占用当时的时间的公开节点。公开日程的标题与时间提前可见；contentDescription用一两句明确内容，到publicAt解锁，留空按开始时间解锁。私人保持私人。",
      `为以下角色安排 ${request.fromDate} 至 ${request.toDate} 的日历。名称与系统ID：\n${ownerIdMap}`,
      modeInstruction,
      sharedInstruction,
      request.existingMode === "replan" ? "本次重新安排：只保留列出的手动与WVS固定事项，待替换的旧AI安排不作日期和活动模板。" : "本次补充安排：已有事项全部保留，只新增有依据且不重叠的事项。",
      "JSON 格式：{\"characters\":[{\"characterId\":\"角色ID\",\"items\":[{\"date\":\"YYYY-MM-DD\",\"startTime\":\"HH:MM\",\"endTime\":\"HH:MM\",\"location\":\"地点\",\"emoji\":\"emoji\",\"title\":\"事项\",\"visibility\":\"private\",\"kind\":\"event\",\"contentDescription\":\"公开内容的一两句底稿\",\"publicAt\":\"\",\"encounterScene\":\"\",\"busyLevel\":1}]}],\"sharedItems\":[{\"participantIds\":[\"角色ID\",\"角色ID\"],\"date\":\"YYYY-MM-DD\",\"startTime\":\"HH:MM\",\"endTime\":\"HH:MM\",\"location\":\"地点\",\"emoji\":\"emoji\",\"title\":\"事项\",\"visibility\":\"private\",\"kind\":\"event\",\"contentDescription\":\"公开内容的一两句底稿\",\"publicAt\":\"\",\"encounterScene\":\"\",\"busyLevel\":1}]}",
      "只返回一个JSON对象。characters为每位所选角色各提供一项；无新增事项时items为空数组。共同事项只放sharedItems，不能再放入个人items。所有日期在请求范围内；未安排的日子不写占位项。",
      "角色背景：\n" + personaContext,
      calendarWorldlineContext(),
      request.additionalPrompt?.trim() ? `本次生成要求：${request.additionalPrompt.trim().slice(0,3000)}` : "",
      worldBookContext,
      peopleHistory,
      existingContext,
    ].filter(Boolean).join("\n\n");
    const messages: LLMMessage[] = [
      ...resolved[0].llmMessages,
      { role: "user", content: prompt, _debugMeta: { marker: "calendar_range_trigger" } },
    ];
    const rawText = await sendLLMRequest(resolved[0].apiConfig, resolved[0].preset, messages, resolved[0].regexes,
      { characterName: `日历批量:${owners.map(owner => owner.name).join("、")}` }, { appId: "calendar", appTags: ["calendar"] });
    const generated = parseRangeScheduleResponse(rawText, { ...request, characterIds: ids }, owners.map(owner => ({ id: owner.id, name: owner.name })));
    const applied = applyGeneratedCalendarRange(generated, request.fromDate, request.toDate, request.existingMode);
    return { success: true, generatedCount: applied.saved, pendingCount:applied.pending };

  } catch (error) {
    const err = error as ChatEngineError | Error;
    return { success: false, error: err?.message || "生成日历失败" };
  }
}

export async function previewCalendarPromptPayload(
  ownerType: CalendarOwnerType,
  ownerId: string,
  weekStart: string,
): Promise<{ messages: LLMMessage[]; characterName: string; model: string; presetName: string }> {
  if (ownerType !== "character") {
    throw new Error("用户日程不支持 AI 生成预览。");
  }
  const resolved = await resolveCalendarAssemblerInput(ownerType, ownerId, weekStart);
  const weekDates = getWeekDates(weekStart);
  const triggerInstruction = buildCalendarTriggerInstruction(resolved.ownerName, weekDates);

  const messages: LLMMessage[] = [
    ...resolved.llmMessages,
    {
      role: "user",
      content: triggerInstruction,
      _debugMeta: { marker: "calendar_trigger" },
    },
  ];

  const apiMessages = previewMessagesForApi(resolved.apiConfig, resolved.preset, messages);
  return {
    messages: apiMessages,
    characterName: `日历:${resolved.ownerName}`,
    model: resolved.apiConfig.defaultModel,
    presetName: resolved.preset?.name ?? "(无预设)",
  };
}

export function createDefaultScheduleDraft(date: string) {
  return {
    date,
    weekday: getWeekdayLabel(date),
    startTime: "09:00",
    endTime: "10:00",
    location: "",
    title: "",
    emoji: "",
    source: "manual" as const,
  };
}

export function getCurrentWeekStart(): string {
  return getWeekStartIso(new Date());
}
