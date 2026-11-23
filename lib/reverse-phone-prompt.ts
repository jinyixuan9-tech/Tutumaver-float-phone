import {buildChatPromptMessages,sendLLMRequest} from './chat-engine';
import {createOrGetSession,loadChatMessages} from './chat-storage';
import {getChatImageFromIndexedDB} from './chat-asset-storage';
import type {LLMContentPart} from './llm-prompt-assembler';
import {formatCharacterRelationsForPrompt} from './character-world-storage';
export type ReverseLine={original:string;translation?:string};
export type ReverseDecision={speech?:ReverseLine[];thought?:ReverseLine;postThoughts?:{id:string;thought?:ReverseLine}[];action:{type:string;target?:string;text?:string}};
export function needsReverseTranslation(line:ReverseLine){return !!line.original.trim()&&!line.translation?.trim()&&(/[가-힣ぁ-ヿ]/.test(line.original)||(/[a-zA-Z]{3}/.test(line.original)&&!/[\u3400-\u9fff]/.test(line.original)));}
/** Use the Chat persona, history, world books, memory and bilingual settings, without phone snapshot-generation contracts. */
export async function requestReverseJson(owner:string,instruction:string,signal?:AbortSignal,images:{id:string;url:string}[]=[],mode:'phone'|'icity'='phone'):Promise<unknown>{
 const session=createOrGetSession(owner);const context=await buildChatPromptMessages(session,loadChatMessages(session.id).slice(-50),{callFormatInstruction:'本轮输出合法JSON，遵循最后给出的结构。不要输出查岗快照、线下叙事标签或工具调用。'});
 const bilingual=session.bilingualTranslationEnabled!==false;
 context.llmMessages.push({role:'system',content:[
 mode==='icity'?'user试图偷看你的iCity私密日记被发现了。延续真实聊天的情绪和人设，你自行决定是否交代内容，也可以不告诉user。':'你正在受邀请操作user的手机。延续刚才真实聊天的情绪和人设；生气可以沉默，不必温柔、不必调侃、不强制吃醋。',
 '严格区分来源：角色背景、长期记忆和旧聊天是你原有记忆，不代表当前屏幕有这些内容。只有当前提供的屏幕记录才可称为刚看到；已删除、未加载、50条范围之外的内容不得补写。',
 '联系人或帖子作者不等于熟人。只能根据已明确的人设、关系和共同经历识别，未知就保持未知。'+formatCharacterRelationsForPrompt(owner),
 '心声是对眼前具体文字、图片描述或人物的即时反应。可简短、疑惑、无感，也可不写。不要每步解释接下来要做什么，不要用“发的乱七八糟真可爱”“看看都聊什么”这类泛泛套话填空。不要照抄示例或替user编动机。',
 '开场speech和thought都可为空；不要再对入口处你与user刚聊过的内容写一次点评。聊天台词只输出真实说出口的句子，动作描写不混进聊天气泡。',
 '所有original沿用人设与当前聊天的实际语言；不要因为界面是中文就切成中文。'+(bilingual?'非中文original必须同时填对应的简体中文translation，中文则translation为空。':'双语关闭，translation留空。'),
 '朋友圈若提供一批帖子，只用一次返回postThoughts，逐条按id对应；无感那条thought可为空。所有台词、心声都使用{original,translation}结构。'
 ].join('\n')});
 const parts:LLMContentPart[]=[{type:'text',text:instruction}];if(context.config.enableImageRecognition){for(const item of images.slice(0,9)){let url=item.url;if(url.startsWith('asset://'))url=await getChatImageFromIndexedDB(url.slice(8))||'';if(url.startsWith('data:image/')||url.startsWith('https:'))parts.push({type:'text',text:'以下图片属于屏幕记录ID：'+item.id},{type:'image_url',image_url:{url}});}}
 context.llmMessages.push({role:'user',content:parts.length>1?parts:instruction});
 for(let attempt=0;attempt<2;attempt++){
 const raw=await sendLLMRequest(context.config,context.preset,context.llmMessages,context.regexes,{characterName:context.character.name},{skipOutputRegex:true,appId:'chat',signal});
 try{const parsed=JSON.parse(raw.trim().replace(/^```(?:json)?\s*|\s*```$/g,''));if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw Error('JSON结构不正确');for(const key of ['speech','messages','postThoughts'])if(parsed[key]!==undefined&&!Array.isArray(parsed[key]))throw Error('字段必须是数组');const lines:ReverseLine[]=[];if(parsed.thought)lines.push(parsed.thought);if(Array.isArray(parsed.speech))lines.push(...parsed.speech);if(Array.isArray(parsed.messages))lines.push(...parsed.messages);for(const p of parsed.postThoughts||[])if(p.thought)lines.push(p.thought);
 if(lines.some(l=>typeof l.original!=='string'||(l.translation!==undefined&&typeof l.translation!=='string')||(bilingual&&needsReverseTranslation(l))))throw Error('双语字段不完整');return parsed;
 }catch{if(attempt)throw Error('角色回复格式或双语不完整，已暂停查看，可重试或结束。');context.llmMessages.push({role:'assistant',content:raw},{role:'user',content:'请修正为要求的JSON结构，original保持人设语言；非中文内容补齐translation。不要补出新的事实，不添加动作叙述。'});}
 }
 throw Error('无法读取角色回复');
}
export function reverseLineText(line:ReverseLine){return line.translation?.trim()?line.original.trim()+'|'+line.translation.trim():line.original.trim();}
