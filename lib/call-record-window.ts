import type {ChatMessage} from './chat-storage';
/** Never split a completed call at a pagination boundary. Original records are retained. */
export function callSafeWindowStart(messages:ChatMessage[],start:number):number{
 let safe=Math.max(0,start);const open=new Map<string,number>();let legacy=-1;
 for(let i=0;i<messages.length;i++){
  const m=messages[i],data=m.mediaData;
  if(data?.callEvent==='start'&&data.callId)open.set(data.callId,i);
  if(data?.callEvent==='end'&&data.callId){const from=open.get(data.callId);if(from!==undefined&&from<safe&&i>=safe)safe=from;open.delete(data.callId);}
  if(/^\[[^\]\n]*发起了群?(?:语音|视频)通话\]/.test(m.content))legacy=i;
  if(legacy>=0&&/^\[[^\]\n]*(?:(?:挂断了|拒绝了|取消了)群?(?:语音|视频)通话|(?:语音|视频)通话已结束)\]/.test(m.content)){if(legacy<safe&&i>=safe)safe=legacy;legacy=-1;}
 }
 return safe;
}
