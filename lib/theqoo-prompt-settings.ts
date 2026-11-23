import { kvGet, kvSet, registerKvMigration } from "./kv-db";

export const THEQOO_PROMPT_KEY = "ai_phone_theqoo_prompt_v1";
registerKvMigration(THEQOO_PROMPT_KEY);
export const DEFAULT_THEQOO_PROMPT = "模拟有自己生活的匿名论坛：网友分享日常、求助、兴趣、美妆、娱乐与新闻，话题自然多样。涉及设定人物时优先沿用当前进展和近期公开事件，上一条进展用于衔接状态。背景是常识，历史细节在话题需要时引用；偶尔有人重看旧作品、想起往事或翻出旧片段，也可以整批都没有。评论有具体观点、追问、分歧和自然跑题，各人关注点不同。创造普通网友的新经历、新梗和讨论角度，让选题独立生长；人物的重要新事实沿用已提供的公开资料。";
export function loadTheqooPrompt(): string {
  const text = kvGet(THEQOO_PROMPT_KEY);
  return text?.trim().slice(0,6000) || DEFAULT_THEQOO_PROMPT;
}
export function saveTheqooPrompt(text: string): void {
  kvSet(THEQOO_PROMPT_KEY, text.trim().slice(0,6000) || DEFAULT_THEQOO_PROMPT);
}
