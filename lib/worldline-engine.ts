import {publicCalendarContext} from "./calendar-public-context";
import { schedulePublicContentSuffix } from "./schedule-public-content";
import {worldlineTimeLabel} from "./worldline-event-time";
import { simpleLLMCall } from "./api-helpers";
import { resolveAuxiliaryApiConfig } from "./settings-storage";
import { loadCharacters } from "./character-storage";
import type { Worldline, WorldlineEvent } from "./worldline-storage";
import { loadWeverseState } from "./weverse-storage";

/** Public broadcast draft. Private character events and internal schedules are intentionally excluded. */
export async function proposeWorldlineProgress(world: Worldline, direction: string): Promise<string> {
  const api = resolveAuxiliaryApiConfig("qaApiConfigId");
  if (!api) throw new Error("请先配置辅助 API 或全局默认 API。");
  const publicSchedules=publicCalendarContext();
  const prompt = [
    `世界：${world.name}`,
    `世界档案：${world.archive.map(group => `${group.name}：${group.entries.map(item => `${item.title}：${item.content}`).join("；")}`).join("\n")}`,
    `此前广播历史：${(world.progressHistory || []).slice(0, -1).map(item => `${item.recordedAt} ${item.text}`).join("\n") || "无"}`,
    `当前广播：${world.progressHistory?.at(-1)?.text || world.currentState || "无"}`,
    `已公开事件：${world.events.filter(item => item.visibility === "public").sort((a,b) => a.occurredAt.localeCompare(b.occurredAt)).slice(-30).map(item => `${worldlineTimeLabel(item,true)} ${item.title}：${item.detail}`).join("\n") || "无"}`,
    `已公开日历安排（供参考，不得自动创建或改动）：${publicSchedules.join("\n") || "无"}`,
    `推进方向：${direction.trim() || "依据已确认的公开事实自然推进"}`,
    "请写一段新的当前公共进度草稿。它是全体角色及公开平台可知道的广播状态。不能参考或泄露未公开事件及内部日程，不能推翻既定事实，也不能声称已自动发布平台内容。只输出进度正文，等待用户审核后保存。",
  ].join("\n\n");
  const result = await simpleLLMCall(api, [{ role: "user", content: prompt }], { temperature: .55, label: `世界线广播草稿·${world.name}` });
  if (!result.content?.trim() || result.wasTruncated) throw new Error(result.error || "生成结果为空或被截断。");
  return result.content.trim().slice(0, 6000);
}

export type WorldlineProposal = Pick<WorldlineEvent, "title" | "detail" | "occurredAt" | "endsAt" | "category" | "people">;

export async function proposeWorldlineEvent(world: Worldline, direction: string): Promise<WorldlineProposal> {
  const api = resolveAuxiliaryApiConfig("qaApiConfigId");
  if (!api) throw new Error("请先配置辅助 API 或全局默认 API。");
  const characters = loadCharacters().filter(c => world.characterIds.includes(c.id));
  const locked = world.events.filter(e => e.locked);
  const input = [
    `世界：${world.name}`,
    `世界档案：${world.archive.map(group => `${group.name}：${group.entries.map(item => `${item.title}：${item.content}`).join("；")}`).join("\n")}`,
    `当前进度：${world.progressHistory.at(-1)?.text || world.currentState || "未记录"}`,
    `已经确认且锁定的事实（绝不可改写）：${locked.map(e => `${worldlineTimeLabel(e,true)} ${e.title}：${e.detail}`).join("\n") || "无"}`,
    `近期事件：${[...world.events].sort((a,b) => b.occurredAt.localeCompare(a.occurredAt)).slice(0,12).map(e => `${worldlineTimeLabel(e,true)} ${e.title}：${e.detail}`).join("\n") || "无"}`,
    `已公开日历安排（只作事实参考，不自动创建日程）：${publicCalendarContext().join("\n") || "无"}`,
    `可参与角色：${characters.map(c => `${c.id}=${c.name}（${c.briefPersona || c.persona.slice(0,500)}）`).join("\n") || "无"}`,
    `管理者给的方向：${direction.trim()}`,
    "请仅提议接下来可能发生的一件事件。不得追改已发生事件、覆盖世界档案、添加未给出的角色知识、公开私密情节。角色只知道本人亲历或明确获知的信息。输出严格 JSON：{\"title\":\"\",\"detail\":\"\",\"occurredAt\":\"ISO开始日期时间\",\"endsAt\":\"可选ISO结束日期时间，具体时刻事件不填\",\"category\":\"\",\"people\":{\"角色ID\":{\"access\":\"witnessed或heard\",\"perspective\":\"该角色实际知道的内容\"}}}。这是草稿，须管理者审核才会保存。",
  ].join("\n\n");
  const result = await simpleLLMCall(api, [{ role: "user", content: input }], { temperature: .65, label: `世界线推进·${world.name}` });
  if (!result.content || result.wasTruncated) throw new Error(result.error || "生成结果为空或被截断。");
  const match = result.content.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("模型没有返回可解析的事件草稿。");
  let data: Record<string, unknown>;
  try { data = JSON.parse(match[0]) as Record<string, unknown>; } catch { throw new Error("事件草稿格式不正确，请重试。"); }
  const allowed = new Set(characters.map(c => c.id));
  const rawPeople = data.people && typeof data.people === "object" && !Array.isArray(data.people) ? data.people as Record<string, unknown> : {};
  const people: WorldlineProposal["people"] = {};
  for (const [id, raw] of Object.entries(rawPeople)) {
    if (!allowed.has(id) || !raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    people[id] = { access: item.access === "heard" ? "heard" : "witnessed", perspective: String(item.perspective || "").slice(0,2000) };
  }
  const occurred = typeof data.occurredAt === "string" ? Date.parse(data.occurredAt) : NaN;
  const latest = Math.max(Date.now(), ...world.events.map(e => Date.parse(e.occurredAt)).filter(Number.isFinite));
  const occurredAt = Number.isFinite(occurred) && occurred >= latest ? new Date(occurred).toISOString() : new Date(latest + 60000).toISOString();
  const title = String(data.title || "").trim().slice(0,120);
  const detail = String(data.detail || "").trim().slice(0,6000);
  if (!title || !detail) throw new Error("生成结果缺少标题或经过。");
  const end=typeof data.endsAt==="string"?Date.parse(data.endsAt):NaN;
  const endsAt=Number.isFinite(end)&&end>Date.parse(occurredAt)?new Date(end).toISOString():undefined;
  return { title, detail, occurredAt, endsAt, category: String(data.category || "").slice(0,60), people };
}
