import {generatePhoneOpening,type PhoneReplyLine} from './phone-engine';
type Pending={at:number;promise:Promise<PhoneReplyLine>};
const pending=new Map<string,Pending>();
export function preparePhoneOpening(sessionId:string,characterId:string){
 for(const [id,p] of pending)if(Date.now()-p.at>120000)pending.delete(id);
 const promise=generatePhoneOpening(characterId);void promise.catch(()=>{});pending.set(sessionId,{at:Date.now(),promise});
}
export function takePhoneOpening(sessionId:string,characterId:string){const p=pending.get(sessionId);pending.delete(sessionId);return p&&Date.now()-p.at<120000?p.promise:generatePhoneOpening(characterId);}
export function discardPhoneOpening(sessionId:string){pending.delete(sessionId);}
