import {kvGet,kvSet,registerKvMigration} from './kv-db';
import {DEFAULT_SCHEDULE_PROMPTS,loadSchedulePrompts,saveSchedulePrompt} from './schedule-prompt-settings';
import {DEFAULT_THEQOO_PROMPT,loadTheqooPrompt,saveTheqooPrompt} from './theqoo-prompt-settings';
export const CONTENT_PROMPTS={
 'twitter.world':['twitter','世界帖子与趋势','选题自然混合网友自己的生活、求助、兴趣和娱乐讨论。公开进展只作为部分话题，涉及旧事沿用最新状态；避免重复话题。'],
 'twitter.trends':['twitter','热门话题','生成五条不同的中文热门话题，可涉及生活、娱乐、校园、游戏、情感和都市传闻，不必逐条映射世界线。'],
 'twitter.comments':['twitter','路人评论','自然简短、多种观点，不复述已有评论；结合主帖和公开追评，不要求每批都有身份猜测。'],
 'twitter.strangers':['twitter','陌生私信与账号互动','陌生人有不同动机和语气，自然简短，只依据公开资料和实际对话。'],
 'ytb.live':['ytb','直播普通观众','评论只反应已播出的言语和可见画面，有提问、玩梗、感想、闲聊与不同看法，不统一夸奖。'],
 'ytb.comments':['ytb','视频评论','只根据已发布的视频、公开频道风格和署名，具体感想、提问、玩梗或合理质疑，不近义重复已有评论。'],
 'ytb.strangers':['ytb','陌生频道','生成有辨识度的虚构陌生频道资料与世界内容，不自动认识用户，频道风格独立。'],
 'weverse.posts':['weverse','粉丝社区帖子','粉丝自己的生活、追星记录、求助、接梗、具体舞台细节、审美与温和批评自然混合，不机械凑齐类型。'],
 'weverse.comments':['weverse','粉丝评论','评论围绕主帖和已有讨论，长短、态度和昵称有差异，不复读模板。'],
 'weverse.live':['weverse','直播普通观众','普通观众只反应已经播出的言语和画面，可以不知道、提问或根据线索不确定地猜测。'],
 'interview.audience':['interview','匿名听众弹幕','根据刚刚公开的发言生成零至五条自然简短的中文弹幕，也可以没有；可偶尔带外语口癖，不推断身份或国籍。'],
 'question_box.questions':['question_box','陌生人问题','提问角度自然多样，允许质疑、尖锐、玩笑和不讨好的问题，避免统一夸赞或每题恋爱；传闻保留不确定性。'],
 'diary.world':['diary','路人日记与配图','匿名日记有长短、语气与关注点差异，可记录生活、工作、兴趣、感情或吐槽，不都温暖励志；配图可无，最多三张文字描述，不使用角色相册。'],
 'novel.book':['novel','新书','人物动机、行动与本书设定一致；故事关系按本书指定，手动世界与大纲优先。章节有实际场景、行动和变化，不用摘要冒充正文。'],
 'novel.chapter':['novel','章节续写','按已保存正文续写，保持人物、时间和伏笔连续，不重复上一章，不把未发生大纲当历史。'],
 'novel.posts':['novel','专区网友帖子与回复','网友有不同语气，可荐文、感慨、脑洞、磕CP、吐槽与不同意见，不用小说叙事口吻。'],
 'novel.comments':['novel','章节评论','仅根据已发布正文与已有评论，语气、长短与态度自然多样，评分符合评论，不统一夸奖。'],
 'novel.reviews':['novel','全书书评','根据已发布章节评价作品，允许喜欢与不喜欢的读者并存，每条提供符合内容的1至5分评分。'],
 'calendar':['calendar','日历日程',DEFAULT_SCHEDULE_PROMPTS.calendar],
 'theqoo':['theqoo','论坛内容',DEFAULT_THEQOO_PROMPT],
} as const;
export type ContentPromptId=keyof typeof CONTENT_PROMPTS;
export const CONTENT_APPS={twitter:'X',ytb:'YouTube',weverse:'Weverse',interview:'在场',question_box:'提问箱',theqoo:'Theqoo',diary:'iCity',novel:'NovelNow',calendar:'日历'};
const KEY='ai_phone_content_prompts_v1';registerKvMigration(KEY);
function stored():Partial<Record<ContentPromptId,string>>{try{return JSON.parse(kvGet(KEY)||'{}');}catch{return{};}}
export function loadContentPrompt(id:ContentPromptId):string{if(id==='calendar')return loadSchedulePrompts().calendar;if(id==='theqoo')return loadTheqooPrompt();return stored()[id]?.trim()||CONTENT_PROMPTS[id][2];}
export function saveContentPrompt(id:ContentPromptId,text:string){if(id==='calendar'){saveSchedulePrompt('calendar',text);return;}if(id==='theqoo'){saveTheqooPrompt(text);return;}kvSet(KEY,JSON.stringify({...stored(),[id]:text.trim()||CONTENT_PROMPTS[id][2]}));}
export function contentPrompt(id:ContentPromptId):string{return `\n内容方向（仅用于${CONTENT_PROMPTS[id][1]}）：\n${loadContentPrompt(id)}\n以上只控制内容方向；输出结构、公开隐私边界、用户发言权限与独立语言规则继续遵守。\n`;}
