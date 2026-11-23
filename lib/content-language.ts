import { kvGet, kvSet, registerKvMigration } from './kv-db';
export type ContentLanguage = { mode: 'global' | 'chinese' | 'selected'; languages: string[] };
export const COMMON_LANGUAGES = ['简体中文','繁体中文','日语','韩语','英语','法语','意大利语','泰语'];
const KEY='ai_phone_content_languages_v1'; registerKvMigration(KEY);
const CATALOG='ai_phone_content_language_catalog_v1'; registerKvMigration(CATALOG);
export function languageCatalog():string[]{try{return [...new Set([...COMMON_LANGUAGES,...JSON.parse(kvGet(CATALOG)||'[]')])];}catch{return COMMON_LANGUAGES;}}
export function addContentLanguage(name:string){const text=name.trim();if(!text||text.length>40)throw Error('语言名称请填写 1–40 个字');kvSet(CATALOG,JSON.stringify([...new Set([...languageCatalog(),text])]));}
export function normalizeLanguage(value:unknown,fallback:ContentLanguage):ContentLanguage{const v=value as ContentLanguage|undefined;return v&&['global','chinese','selected'].includes(v.mode)?{mode:v.mode,languages:Array.isArray(v.languages)?[...new Set(v.languages.filter(x=>typeof x==='string'&&x.trim()).map(x=>x.trim()))]:fallback.languages}:fallback;}
function legacy(app:string):ContentLanguage{
 try{if(app==='twitter'){const v=JSON.parse(kvGet('ai_phone_twitter_v1')||'{}');const names:Record<string,string>={'简中（大陆）':'简体中文','繁中（港澳台）':'繁体中文','日语（日本）':'日语','韩语（韩国）':'韩语','英语国家':'英语','泰语（泰国）':'泰语'};if(v.audienceLocales?.length)return{mode:'selected',languages:v.audienceLocales.map((x:string)=>names[x]||x)};}
 if(app==='novel'){const n=JSON.parse(kvGet('ai_phone_novelnow_v1')||'{}');if(n.langs?.length)return{mode:'selected',languages:n.langs.map((x:string)=>x.startsWith('简中')?'简体中文':x.startsWith('繁中')?'繁体中文':x==='日文'?'日语':x==='韩文'?'韩语':x==='英文'?'英语':x)};}}catch{}
 return{mode:app==='ytb'?'global':'chinese',languages:['简体中文']};
}
export function loadContentLanguage(app:string):ContentLanguage{try{const all=JSON.parse(kvGet(KEY)||'{}');return normalizeLanguage(all[app],legacy(app));}catch{return legacy(app);}}
export function saveContentLanguage(app:string,value:ContentLanguage){if(value.mode==='selected'&&!value.languages.length)throw Error('至少选择一种语言');let all:Record<string,ContentLanguage>={};try{all=JSON.parse(kvGet(KEY)||'{}');}catch{}kvSet(KEY,JSON.stringify({...all,[app]:value}));}
export function contentLanguageRule(app:string,override?:ContentLanguage):string{const v=override||loadContentLanguage(app);return '非角色内容语言（只约束本次路人/观众/网友正文，不约束角色、译文、名称和作品中文正文）：'+(v.mode==='global'?'全球化，允许任何语言，自然随机；没有每批配额、保底或平均分配要求。':v.mode==='chinese'?'多中文，中文占大多数，仍允许其他语言自然出现，不分配固定外语配额。':`指定语言，只允许以下语言：${v.languages.join('、')}。每条一种主要语言，外语另附中文译文，不据此推断国籍。`);}
/** Reject only obvious script violations; unrecognised/custom languages are left to the model. */
export function assertContentLanguage(texts:string[],app:string,override?:ContentLanguage){const v=override||loadContentLanguage(app);if(v.mode!=='selected')return;const names=v.languages.join(' ');for(const text of texts){if(!text.trim())continue;const ja=/[\u3040-\u30ff]/.test(text),ko=/[\uac00-\ud7af]/.test(text),zh=/[\u3400-\u9fff]/.test(text);if((ja&&!/日|ja|Japanese/i.test(names))||(ko&&!/韩|朝鲜|ko|Korean/i.test(names))||(zh&&!ja&&!/中|汉|日|Chinese|Japanese|zh|ja/i.test(names))||(!ja&&!ko&&!zh&&/[a-z]{3}/i.test(text)&&/^(简体中文|繁体中文|中文|简中|繁中|日语|韩语)([ 、](简体中文|繁体中文|中文|简中|繁中|日语|韩语))*$/.test(names)))throw Error('生成内容超出指定语言，本批未保存，请重试');}}
