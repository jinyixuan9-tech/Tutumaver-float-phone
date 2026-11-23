import {loadFollowUpConfig} from './settings-storage';
const plans=new Map<string,number>();
export function followUpIntentInstruction():string {const c=loadFollowUpConfig();if(c.enabled===false)return '';return `本轮回复末尾仅在确实想稍后补一句/等待答复时附加 <followup seconds="整数"/>，不要输出未来具体内容。等待秒数在${c.anxietyMinDelay}至${c.anxietyMaxDelay}之间。已道别、晚安、话题结束通常不要追；普通闲聊不必追。不需要就完全不输出该标记。标记不是聊天内容。`;}
export function extractFollowUpIntent(sessionId:string,text:string):string {plans.delete(sessionId);const c=loadFollowUpConfig();return text.replace(/<followup\b[^>]*\/?\s*>/gi,tag=>{const seconds=Number(tag.match(/seconds\s*=\s*["']?(\d+)/i)?.[1]);if(c.enabled!==false&&Number.isFinite(seconds)&&seconds>0)plans.set(sessionId,Math.max(c.anxietyMinDelay,Math.min(c.anxietyMaxDelay,seconds)));return '';});}
export function takeFollowUpIntent(sessionId:string):number|undefined {const seconds=plans.get(sessionId);plans.delete(sessionId);return seconds;}
