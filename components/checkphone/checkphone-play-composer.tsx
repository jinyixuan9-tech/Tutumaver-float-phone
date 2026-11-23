'use client';
import {useState,useEffect,useRef} from 'react';
import type {CheckPhoneChatConversation} from '@/lib/checkphone-config';
import {draftThread,getPlayThread,addPlayMessage,editPlayMessage,setPeerQuestion,type PlayThread} from '@/lib/checkphone-play';
import {requestPhonePlay} from '@/lib/checkphone-engine';
import {currentPhoneVisit} from '@/lib/checkphone-access';
export function PhonePlayComposer({owner,conversation}:{owner:string;conversation:CheckPhoneChatConversation}){
 const [text,setText]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[thread,setThread]=useState<PlayThread>();const controller=useRef<AbortController|null>(null);
 useEffect(()=>()=>controller.current?.abort(),[]);
 useEffect(()=>{try{setThread(draftThread(owner,conversation));}catch(e){setError(String(e));}setText('');},[conversation.id]);
 const send=()=>{try{const t=thread||draftThread(owner,conversation);setThread(addPlayMessage(t,text,'outgoing'));setText('');}catch(e){setError(String(e));}};
 async function summon(){setError('');setBusy(true);const v=currentPhoneVisit();controller.current=new AbortController();try{
 const t=thread||draftThread(owner,conversation);if(t.isUser)throw Error('收件人为你自己；退出查手机后，在自己的 Chat 回复。');
 const instruction=t.peerId?`你是收件角色，正在和账号主人聊天。以下为实际消息，direction=outgoing是对方发来，incoming是你发出。你不知道实际操作者，可按语气产生怀疑但不凭空确认。只输出JSON：{"reply":"你在当前窗口的回复正文","askUser":"如果你怀疑是user代发，可发到你与user的Chat里试探的一句话，否则空串"}。不输出动作协议、总结或快照。\n${JSON.stringify([...t.base,...t.messages].slice(-50))}`:`模拟NPC ${t.peer}，根据以下聊天自然回复，只输出一句或一段回复正文：${JSON.stringify([...t.base,...t.messages].slice(-40))}`;
 const reply=await requestPhonePlay(t.peerId||owner,instruction,controller.current.signal);
 if(currentPhoneVisit()?.id!==v?.id||!getPlayThread(t.id)||getPlayThread(t.id)?.committed)return;
 let body=reply,ask='';if(t.peerId){try{const parsed=JSON.parse(reply.replace(/^```(?:json)?\s*|\s*```$/g,''));if(typeof parsed.reply==='string'){body=parsed.reply;ask=typeof parsed.askUser==='string'?parsed.askUser:'';}}catch{}}
 const next=addPlayMessage(t,body,'incoming');if(ask&&next.messages.at(-1))setPeerQuestion(t.id,next.messages.at(-1)!.id,ask);setThread(getPlayThread(t.id));
 }catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}}
 return <section className="cp-play-compose"><small>使用此角色账号发送 · 退出前可编辑／删除本次消息</small><div className="cp-play-drafts">{thread?.messages.map(m=><div key={m.id}><span>{m.direction==='outgoing'?'我':'对方'}：{m.text}</span><button onClick={()=>{const value=prompt('编辑消息',m.text);if(value!==null){editPlayMessage(thread.id,m.id,value);setThread(getPlayThread(thread.id));}}}>编辑</button><button onClick={()=>{editPlayMessage(thread.id,m.id);setThread(getPlayThread(thread.id));}}>删除</button></div>)}</div><form onSubmit={e=>{e.preventDefault();send();}}><input aria-label="代发消息" value={text} onChange={e=>setText(e.target.value)} placeholder="输入消息…" disabled={busy}/><button disabled={!text.trim()||busy}>发送</button><button type="button" onClick={()=>void summon()} disabled={busy}>{busy?'回复中…':'召唤回复'}</button></form>{error&&<p role="alert">{error}</p>}</section>;
}
