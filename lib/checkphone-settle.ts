import {registerPendingBrowserShares} from './browser-video-share';
import {commitPlayVisit,playThreads,updatePlayKnowledge,getPlayThread,patchPlayThread} from './checkphone-play';
import {phoneVisits,phoneAccess,setPhonePassword,savePhoneVisit,phoneKnowledge,applyPhoneControl,type PhoneVisit} from './checkphone-access';
import {requestPhonePlay} from './checkphone-engine';
import {pushChatMessage,createOrGetSession} from './chat-storage';
const running=new Set<string>();
export async function settlePhoneVisit(visit:PhoneVisit){
 if(running.has(visit.id)||phoneVisits().find(v=>v.id===visit.id)?.settled)return;
 running.add(visit.id);
 try{await runSettlement(visit);const current=phoneVisits().find(v=>v.id===visit.id);if(current&&!current.undone)savePhoneVisit({...current,settled:true,settleError:undefined});}
 catch(e){const current=phoneVisits().find(v=>v.id===visit.id);if(current)savePhoneVisit({...current,settleError:String(e)});throw e;}finally{running.delete(visit.id);}
}
async function runSettlement(visit:PhoneVisit){
 registerPendingBrowserShares(visit);
 commitPlayVisit(visit);
 const reports:string[]=[];
 for(const thread of playThreads(visit.id)){
  if(!thread.messages.length||thread.ownerKnowledge)continue;
  const known=visit.mode==='guess'||visit.mode==='known';
  const raw=thread.settleDecision?JSON.stringify(thread.settleDecision):await requestPhonePlay(visit.owner,`你本人的手机密码是${phoneAccess(visit.owner).password}。本轮不要输出phone-access标签，改密严格用JSON字段。你刚查看手机，发现下面真实存在的消息。${known?'user 已知情进入过你的手机，可能是user代发。':'实际操作者未知，只能发现消息被动过，不能凭空认定是user。'}\n${JSON.stringify(thread.messages)}\n本次只发现消息，不联系对方，不解释、不转发；后续正常聊天中再按人设决定是否对账。可以向user说话。只输出JSON：{"replyToPeer":"","tellUser":"要实际发给user的正文，或空串","forwardToUser":false,"changePassword":false,"newPassword":"若实际改密则填非1234四位数字"}。不要在告诉user的正文中虚构尚未发送的对话。`);
  if(phoneVisits().find(v=>v.id===visit.id)?.undone||getPlayThread(thread.id)?.removed)continue;
  let decision:{replyToPeer?:string;tellUser?:string;changePassword?:boolean;forwardToUser?:boolean;newPassword?:string};try{decision=JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g,''));}catch{throw new Error('后续回复格式未通过校验，请在查手机记录中重试后续处理。');}
  patchPlayThread(thread.id,{settleDecision:decision});
  // Follow-up is persisted as part of the same operation before it can be reported.
  const {rememberVisitPassword}=await import('./checkphone-play');

  if(!getPlayThread(thread.id)?.passwordAfterRevision&&decision.changePassword&&/^\d{4}$/.test(decision.newPassword||'')&&decision.newPassword!=='1234'&&!getPlayThread(thread.id)?.removed){const before=phoneAccess(visit.owner);setPhonePassword(visit.owner,decision.newPassword!);rememberVisitPassword(thread.id,before,phoneAccess(visit.owner).revision);}
  const final=getPlayThread(thread.id);if(final&&!final.removed)updatePlayKnowledge(thread.id,`${known?'user进入过你的手机。':''}你发现账号中的实际聊天，尚未主动联系对方处理：${JSON.stringify(final.messages)}。实际操作者${known?'可能是user':'未知'}。`);
 }
 const current=phoneVisits().find(v=>v.id===visit.id);
 if(!current||current.undone)return;
 for(const t of playThreads(visit.id)){if(t.settleDecision?.tellUser)reports.push(t.settleDecision.tellUser);}
 const known=visit.mode==='guess'||visit.mode==='known';
 if(reports.length||known){
 const context=reports.length?reports.join('\n'):`user ${visit.mode==='guess'?'猜对密码':'用你告知的正确密码'}查看了你的手机，记录为：${visit.attempts.join('；')}；查看过${(visit.sampledApps||[]).join('、')}等应用。`;
 const reply=reports.length?context:applyPhoneControl(visit.owner,await requestPhonePlay(visit.owner,phoneKnowledge(visit.owner,false)+'\n'+context+'\n请只输出你此刻对user的自然回复，不输出快照。'),false);
 if(phoneVisits().find(v=>v.id===visit.id)?.undone)return;
 const session=createOrGetSession(visit.owner),message=pushChatMessage({sessionId:session.id,role:'assistant',content:reply});savePhoneVisit({...current,reportIds:[...(current.reportIds||[]),{session:session.id,id:message.id}]});
 }
}
