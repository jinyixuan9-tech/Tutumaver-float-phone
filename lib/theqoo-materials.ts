import type { ApiConfig, WorldBookConfig } from "./settings-types";
import { simpleLLMCall } from "./api-helpers";

export type ForumMaterial = { id: string; label: string; content: string; constant: boolean; rank: number };
function score(text: string, query: string): number {
  const lower = text.toLowerCase();
  const terms = new Set((query.toLowerCase().match(/[a-z0-9_]{3,}|[\u3400-\u9fff]{2,}|[\u3040-\u30ff\uac00-\ud7af]{2,}/g) || [])
    .flatMap(w => /[^a-z0-9_]/.test(w) ? Array.from({length:w.length-1},(_,i)=>w.slice(i,i+2)) : [w]));
  return [...terms].reduce((sum,t)=>sum+(lower.includes(t)?1:0),0);
}
export function forumMaterialCandidates(books: WorldBookConfig[], query: string, random = Math.random): ForumMaterial[] {
  const all = books.flatMap((book,b)=>book.entries.filter(e=>!e.disable).map((entry,i)=>({
    id:`b${b}e${i}`, label:`${book.name} / ${entry.comment || entry.key || "资料"}`,
    content:entry.content, constant:entry.constant, rank:score(`${entry.comment} ${entry.key} ${entry.content}`,query),
  })));
  // Reservoir-style random ordering gives later entries a chance without copying the full book.
  const ranked = all.filter(e=>e.rank>0 || e.constant).sort((a,b)=>Number(b.constant)-Number(a.constant)||b.rank-a.rank).slice(0,18);
  const ids = new Set(ranked.map(e=>e.id));
  const old = random()<.4 ? all.filter(e=>!ids.has(e.id)).map(e=>({e,r:random()})).sort((a,b)=>a.r-b.r).slice(0,4).map(x=>x.e) : [];
  return [...ranked,...old];
}
export function forumMaterialText(entries: ForumMaterial[], ids: string[], budget = 6000): string {
  const selected = new Set(ids);
  let remaining=budget;
  return entries.filter(e=>e.constant || selected.has(e.id)).sort((a,b)=>Number(b.constant)-Number(a.constant)||b.rank-a.rank).flatMap(e=>{
    if(remaining<=0)return [];
    const text=`${e.label}：${e.content}`.slice(0,Math.min(1800,remaining));remaining-=text.length+1;return [text];
  }).join("\n");
}
export async function planForumMaterials(api: ApiConfig, books: WorldBookConfig[], context: string, direction: string): Promise<{topics:string; facts:string}> {
  const candidates=forumMaterialCandidates(books,context);
  const directory=candidates.map(e=>`${e.id} ${e.label.slice(0,110)}：${e.content.slice(0,160)}`).join("\n").slice(0,6500);
  // Failed planning still permits ordinary forum generation; it never falls back to dumping all books.
  const abort = new AbortController();
  const timeout = setTimeout(()=>abort.abort(),30000);
  try {
    const result=await simpleLLMCall(api,[{role:"user",content:[
      "为一轮匿名论坛刷新拟定最多10个简短且不同的选题。独立日常与兴趣自然生长，涉及设定人物时沿用当前进展。背景用于核对，旧事只在相关或偶然想起时出现，可以完全没有。",
      `内容方向：${direction.slice(0,3000)}`,`当前公开素材：${context.slice(0,9000)}`,
      `可查的世界书目录（仅限绑定给论坛的公开资料）：\n${directory || "无"}`,
      '需要细节支持时选择目录中的准确ID，最多8个。只输出JSON：{"topics":["简短选题"],"entryIds":["目录ID"]}。',
    ].join("\n\n")}],{max_tokens:1200,signal:abort.signal,label:"Theqoo 选题与资料检索"});
    if(result.wasTruncated || !result.content)throw new Error("planner unavailable");
    const raw=result.content;const parsed=JSON.parse(raw.slice(raw.indexOf("{"),raw.lastIndexOf("}")+1));
    const ids=Array.isArray(parsed.entryIds)?parsed.entryIds.filter((id:unknown)=>typeof id==="string" && candidates.some(e=>e.id===id)).slice(0,8):[];
    const topics=Array.isArray(parsed.topics)?parsed.topics.filter((s:unknown)=>typeof s==="string").slice(0,10).map((s:string)=>s.slice(0,160)).join("；"):"";
    return {topics,facts:forumMaterialText(candidates,ids)};
  } catch {
    return {topics:"",facts:forumMaterialText(candidates,candidates.filter(e=>e.rank>0).slice(0,4).map(e=>e.id))};
  } finally {
    clearTimeout(timeout);
  }
}
