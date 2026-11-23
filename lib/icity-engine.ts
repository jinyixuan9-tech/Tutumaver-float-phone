import {mediaPreferencePrompt,allowMediaIntent} from './media-preferences';
import {contentLanguageRule,assertContentLanguage} from './content-language';
import {contentPrompt} from './content-prompt-settings';
import type {LLMContentPart} from './llm-prompt-assembler';
import {getChatImageFromIndexedDB} from './chat-asset-storage';
import {sendLLMRequest} from './chat-engine';
import {loadApiConfigs,loadBindingConfig,resolveBinding} from './settings-storage';
import {loadCharacters} from './character-storage';
import {loadCity,saveCity,cityVisibleContext,cityEntries,cityNotice,cityId,commentCity,areCityFriends,personalBook,type CityEntry} from './icity-store';
export async function askCity(instruction:string,data:unknown,characterId?:string,photos:string[]=[],translation=false){
 const id=characterId||loadCharacters()[0]?.id||'';const slot=resolveBinding(loadBindingConfig(),id,'diary');const api=loadApiConfigs().find(x=>x.id===(translation?(slot.translationApiConfigId||slot.apiConfigId):slot.apiConfigId));if(!api)throw Error('请先在设置中绑定日记 API');
 const parts:LLMContentPart[]=[{type:'text',text:JSON.stringify(data)}];
 for(const ref of photos.slice(0,4)){const url=ref.startsWith('asset://')?await getChatImageFromIndexedDB(ref.slice(8)):ref;if(!url)continue;const img=await new Promise<HTMLImageElement>((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=()=>reject(Error('配图读取失败'));i.src=url;});const ratio=Math.min(1,720/Math.max(img.width,img.height));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.width*ratio));canvas.height=Math.max(1,Math.round(img.height*ratio));canvas.getContext('2d')!.drawImage(img,0,0,canvas.width,canvas.height);parts.push({type:'image_url',image_url:{url:canvas.toDataURL('image/jpeg',.75)}});}
 const raw=await sendLLMRequest(api,null,[{role:'system',content:instruction+'\n这是虚构的日记平台。只使用给定内容，不得推测未提供的私人日程、聊天、日记或马甲真实身份。只返回 JSON，不要 Markdown。'},{role:'user',content:parts.length>1?parts:JSON.stringify(data)}],[],{characterName:'手记互动',userName:'用户'},{appId:'diary',skipOutputRegex:true,skipWorldline:true});
 const clean=raw.replace(/^\s*```(?:json)?\s*/,'').replace(/\s*```\s*$/,'');try{return JSON.parse(clean);}catch{throw Error('返回格式不正确，请重试');}
}
export async function generateCityWorld(){
 const s=loadCity();const result=await askCity(('生成4条互不雷同的匿名日记站生活记录，长短、语气、关注点不同。有人长期写恋爱或追星，有人记录旅行求学、工作或吐槽、私人暗恋、写给去世或分手的人，也有普通小事；每批不必集齐，不都温暖励志或恋爱，不像统一社交动态。不冒充现有角色或现实人物。配图通常用文字描述，可无图，最多3张，不能用相册。返回 {posts:[{name,handle,text,bio,photos:[画面描述]}]}。') + contentPrompt('diary.world') + contentLanguageRule('diary') + mediaPreferencePrompt('diary','world'), {recent:s.entries.filter(x=>x.visibility==='world').slice(0,8).map(x=>x.text)});
 if(Array.isArray(result.posts))assertContentLanguage(result.posts.map((p:{text?:string})=>p.text||''),'diary');
 if(!Array.isArray(result.posts))throw Error('没有返回世界日记');
 const next=loadCity();for(const p of result.posts.slice(0,4)){if(typeof p.text!=='string'||!p.text.trim())continue;const id=`npc:${cityId()}`;next.accounts.push({id,kind:'npc',name:String(p.name||'过路人').slice(0,30),handle:`visitor_${cityId().slice(0,8)}`,bio:String(p.bio||'').slice(0,120),avatar:'',background:'',knownBy:[],defaultVisibility:'world',since:new Date().toISOString()});next.books.push({id:personalBook(id),kind:'personal',name:'日记本',owner:id,members:[id],invited:[]});next.entries.unshift({id:cityId(),author:id,book:personalBook(id),text:p.text.slice(0,5000),photos:Array.isArray(p.photos)?p.photos.filter((x:unknown)=>typeof x==='string'&&allowMediaIntent('diary','world',x)).slice(0,3).map((x:string)=>'text://'+encodeURIComponent(x)):[],title:'',createdAt:new Date().toISOString(),visibility:'world',selected:[]});}saveCity(next);const ids=next.entries.filter(e=>!s.entries.some(old=>old.id===e.id)).map(e=>e.id);void import('./icity-runtime').then(m=>m.reactCityWorldLikes(ids));
}
export async function translateCityText(entry:CityEntry){const r=await askCity('将日记正文和标题准确翻译为简体中文，保留段落，不续写，不添加解释。返回 {text:string,title:string}。',{text:entry.text,title:entry.title},entry.author,[],true);if(typeof r.text!=='string'||!r.text.trim())throw Error('翻译没有返回内容');return r.text;}
function isChineseEntry(entry:CityEntry){return /[\u3400-\u9fff]/.test(entry.text)&&!/[\u3040-\u30ff\uac00-\ud7af]/.test(entry.text)&&!['ja','ko','en'].includes(loadCity().accounts.find(a=>a.id===entry.author)?.language||'');}
export async function cityChineseDraft(entry:CityEntry){
 if(isChineseEntry(entry))return {text:entry.text,title:entry.title};
 const r=await askCity('把正文和标题准确翻译成简体中文；已经是中文的内容原样保留。保留段落，不续写。返回 {text:string,title:string}。',{text:entry.text,title:entry.title},entry.author,[],true);
 if(typeof r.text!=='string'||!r.text.trim())throw Error('翻译没有返回内容');return {text:r.text,title:typeof r.title==='string'?r.title:entry.title};
}
export async function cityOriginalDraft(original:CityEntry,text:string,title:string){
 if(isChineseEntry(original))return {text,title};
 const r=await askCity('将编辑后的简体中文正文和标题翻译成原帖所使用的语言。参考原帖判定语言，若原帖为简体中文则保留编辑内容。忠实翻译，不续写。返回 {text:string,title:string}。',{original:{text:original.text,title:original.title},editedChinese:{text,title}},original.author,[],true);
 if(typeof r.text!=='string'||(!r.text.trim()&&text.trim()))throw Error('翻译没有返回内容');return {text:r.text,title:typeof r.title==='string'?r.title:title};
}
