import { resolveChatShareSession } from './chat-share-targets';
import {cityPhotoDescription} from './icity-photo-description';
import {loadCity,cityEntries,canShareCity,cityShareText} from './icity-store';
import {createOrGetSession,pushChatMessage} from './chat-storage';
import {activeReverse} from './reverse-phone-state';
import {openSharedChatSession} from './chat-notification-events';
export function shareCityDiaryToChat(entryId:string,recipient:string){
 if(activeReverse())throw Error('反查期间不能分享日记');
 const city=loadCity(),entry=cityEntries(city).find(e=>e.id===entryId);
 const session=resolveChatShareSession(recipient);
 const recipients=session.isGroup ? session.participantIds || [] : [recipient];
 if(!entry||!recipients.length||!recipients.every(id=>canShareCity(city,entry,id)))throw Error('这篇日记不能分享给这些接收者');
 const text=session.isGroup ? '用户分享到群聊的iCity日记快照。账号的真实身份只按各成员原有认知判断，不因群分享暴露：'+JSON.stringify({id:entry.id,author:city.accounts.find(a=>a.id===entry.author)?.handle||'diary',title:entry.title,text:entry.text,translation:entry.translation,photos:entry.photos?.map(cityPhotoDescription),createdAt:entry.createdAt}) : cityShareText(city,entry,recipient);
 const message=pushChatMessage({sessionId:session.id,role:'user',content:text,mediaType:'app_card',mediaData:{appId:'diary',appName:'iCity',appCardTitle:entry.title||'分享日记',appCardBody:entry.text.slice(0,160),cityDiarySnapshot:{id:entry.id,createdAt:entry.createdAt,translation:entry.translation,title:entry.title,text:entry.text,handle:city.accounts.find(a=>a.id===entry.author)?.handle||'diary',photos:entry.photos?[...entry.photos]:undefined,photoDescriptions:entry.photos?.map(cityPhotoDescription)},appCardSummary:'@'+(city.accounts.find(a=>a.id===entry.author)?.handle||'diary'),appHistoryText:text}});
 openSharedChatSession(session.id);
 return message;
}
