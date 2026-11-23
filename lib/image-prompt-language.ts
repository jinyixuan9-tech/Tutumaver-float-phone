import {kvGet,kvSet,registerKvMigration} from './kv-db';
const KEY='ai_phone_image_prompt_language_v1';registerKvMigration(KEY);
export type ImagePromptLanguage='zh'|'en';
export function loadImagePromptLanguage():ImagePromptLanguage{return kvGet(KEY)==='en'?'en':'zh';}
export function saveImagePromptLanguage(language:ImagePromptLanguage){kvSet(KEY,language);}
/** Constrains image-description fields only, never the surrounding dialogue or article. */
export function imagePromptLanguageInstruction(){return `【图片提示词语言】仅图片描述、画面描述及生图提示词字段必须使用${loadImagePromptLanguage()==='en'?'英语':'简体中文'}，不要夹用其他语言；人名、品牌等专有名词可保留。此规则不改变正文、对话、歌词、引用原文或翻译的语言，不要求生成图片，不修改已保存或用户手写的提示词。`;}
