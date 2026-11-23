import { kvGet, kvSet, registerKvMigration } from "./kv-db";
import { loadOwnerCalendarPlans } from "./calendar-storage";
import { loadCharacters } from "./character-storage";
import { formatZonedPromptTimestamp, getSystemTimeZone } from "./character-time";
const KEY="ai_phone_calendar_public_clues_v1";registerKvMigration(KEY);
type Clue={id:string;characterId:string;at:number;text:string};
type ClueState={next:Record<string,number>;checked:string[];clues:Clue[]};
const sensitive=/医院|就医|诊所|病房|住宅|住址|家中|家里|公寓|酒店房|门牌|私宅|恋人|恋爱|约会|男女朋友|伴侣|亲吻|拥抱/;
/** Public readers only receive the saved visible fragment; private event titles never leave this module. */
export function calendarPublicClues(characterId:string,now=Date.now(),random= Math.random):string[]{
 if(typeof window==="undefined")return [];
 let state:ClueState;try{state=JSON.parse(kvGet(KEY)||"null")||{next:{},checked:[],clues:[]};}catch{state={next:{},checked:[],clues:[]};}
 state.next=state.next&&typeof state.next==="object"?state.next:{};state.checked=Array.isArray(state.checked)?state.checked:[];state.clues=Array.isArray(state.clues)?state.clues:[];
 const character=loadCharacters().find(c=>c.id===characterId);
 if(!character||!/演员|艺人|明星|偶像|歌手|rapper|模特|idol|actor|actress|singer|artist|celebrity/i.test(character.persona||""))return [];
 if(now >= (state.next[characterId]||0)){
  state.next[characterId]=now+(8+random()*64)*3600000;
  const local=formatZonedPromptTimestamp(new Date(now),character.timeZone||getSystemTimeZone()).replace(" ","T");
  const localStamp=Date.parse(local+":00Z");
  const candidates=loadOwnerCalendarPlans("character",characterId).flatMap(p=>p.items).filter(i=>{
   const stamp=Date.parse(`${i.date}T${i.startTime}:00Z`);
   return i.visibility!=="public"&&i.kind!=="milestone"&&stamp<=localStamp&&stamp>=localStamp-3*86400000&&!state.checked.includes(`${characterId}:${i.id}`)&&!sensitive.test(`${i.title} ${i.location} ${i.encounterScene||""}`)&&(Boolean(i.encounterScene?.trim())||/机场|车站|场馆|商场|咖啡|街道|公园|书店|餐厅|便利店|片场|摄影棚|杂志社|录音棚/.test(i.location));
  });
  // A single opportunity is sampled per irregular time window; the outcome is saved across platforms.
  if(candidates.length){
   const item=candidates[Math.min(candidates.length-1,Math.floor(random()*candidates.length))];
   const id=`${characterId}:${item.id}`;state.checked.push(id);
   if(random()<0.16){
    const scene=(item.encounterScene||"在公共场所短暂停留后离开").replace(/[\r\n]+/g," ").trim().slice(0,90);
    const offset=localStamp-Date.parse(`${item.date}T${item.startTime}:00Z`);
    state.clues.push({id,characterId,at:now-offset,text:/片场|摄影棚|杂志社|录音棚/.test(item.location) ? `${item.date} 有工作接触者公开提到与${character.name}有过短暂工作接触；仅可聊亲眼见过的礼貌、态度和专业表现，不知道项目名称、精确地点、时间及内部安排。` : `${item.date} 有路人在公共场所疑似看到${character.name}：${scene}`});
   }
  }
  state.clues=state.clues.filter(c=>c.at>=now-14*86400000).slice(-80);state.checked=state.checked.slice(-500);
  kvSet(KEY,JSON.stringify(state));
 }
 return state.clues.filter(c=>c.characterId===characterId&&c.at<=now&&c.at>=now-7*86400000).slice(-2).map(c=>`偶遇线索（路人目击片段）：${c.text}`);
}
