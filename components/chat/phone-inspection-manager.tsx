'use client';
import {useEffect,useState} from 'react';
import {inspectionRequests,inspectionPermission,resolveInspectionRequest,INSPECTION_UPDATED,type InspectionRequest} from '@/lib/phone-inspection-settings';
import {tickSecretInspections} from '@/lib/secret-phone-inspection';
import {needsReverseTranslation} from '@/lib/reverse-phone-prompt';
import {activeReverse} from '@/lib/reverse-phone-state';
import {startReversePhone} from '@/lib/reverse-phone-runtime';
import {loadCharacters} from '@/lib/character-storage';
import {loadChatSessions,loadChatMessages,pushChatMessage} from '@/lib/chat-storage';
import {buildChatPromptMessages,sendLLMRequest} from '@/lib/chat-engine';
export function PhoneInspectionManager(){
 const [request,setRequest]=useState<InspectionRequest|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{const sync=()=>setRequest(inspectionRequests().find(r=>r.state==='pending'&&inspectionPermission(r.owner).proactive)||null);sync();window.addEventListener(INSPECTION_UPDATED,sync);const tick=()=>{void tickSecretInspections().catch(()=>{})};tick();const timer=setInterval(tick,60000);window.addEventListener('focus',tick);return()=>{clearInterval(timer);window.removeEventListener('focus',tick);window.removeEventListener(INSPECTION_UPDATED,sync)}},[]);
 const respond=async(accepted:boolean)=>{if(!request||busy)return;const r=request;if(accepted&&activeReverse()){setError('当前已有角色正在查看手机，请稍后再同意。');return;}setBusy(true);setError('');resolveInspectionRequest(r.id,accepted?'accepted':'refused');try{if(accepted){await startReversePhone(r.owner,r.sessionId,'requested')}else{
  pushChatMessage({sessionId:r.sessionId,role:'system',content:'你申请查看user的手机，user没有允许。你没有读取手机内容；拒绝本身不能证明隐藏了什么。'});
  const session=loadChatSessions().find(s=>s.id===r.sessionId);if(session){const ctx=await buildChatPromptMessages(session,loadChatMessages(session.id).slice(-50),{callFormatInstruction:'本轮输出合法JSON：{"messages":[{"original":"独立台词，可空","translation":"非中文台词的简体中文译文"}]}。结合人设、已有记忆和上下文回应user未允许查看手机；可以接受、疑惑或沉默，不自动认定背叛，不添加动作旁白。'});const raw=await sendLLMRequest(ctx.config,ctx.preset,ctx.llmMessages,ctx.regexes,{characterName:ctx.character.name},{skipOutputRegex:true,appId:'chat'});const parsed=JSON.parse(raw.trim().replace(/^```(?:json)?\s*|\s*```$/g,''));if(!Array.isArray(parsed.messages))throw Error('拒绝后的回复格式不正确');const lines=parsed.messages as {original:string;translation?:string}[];if(lines.some(l=>typeof l.original!=='string'||(l.translation!==undefined&&typeof l.translation!=='string')||(session.bilingualTranslationEnabled!==false&&needsReverseTranslation(l))))throw Error('拒绝后的回复格式不正确');for(const l of lines)if(l.original.trim())pushChatMessage({sessionId:r.sessionId,role:'assistant',content:l.original+(l.translation?.trim()?'|'+l.translation:'')});window.dispatchEvent(new CustomEvent('chat-messages-updated',{detail:{sessionId:r.sessionId}}))}
 }}catch(e){setError(e instanceof Error?e.message:String(e))}finally{setBusy(false)}};
 if(!request&&!error)return null;const name=loadCharacters().find(c=>c.id===request?.owner)?.name||'TA';return <div className="inspection-dialog-backdrop" data-reverse-control="true"><section role="dialog" aria-modal="true" aria-label="查看手机申请"><h3>{request?`${name}申请查看你的手机`:'手机查看提示'}</h3>{request&&<p>同意后，TA 将开始查看你的小手机。</p>}{error&&<p role="alert">{error}</p>}<footer>{request?<><button disabled={busy} onClick={()=>void respond(false)}>不给TA看</button><button disabled={busy} onClick={()=>void respond(true)}>给TA看</button></>:<button onClick={()=>setError('')}>知道了</button>}</footer></section></div>
}
