import Dexie from "dexie";
import JSZip from "jszip";
import { loadPhoneState, type PhoneCallRecord } from "./phone-storage";
import { loadMediaBlob, isMediaStoreRef } from "./media-cache-storage";
export type VoiceFavoriteKind = "call" | "message";
export type VoiceFavorite = { id:string; kind:VoiceFavoriteKind; sourceKey:string; text:string; characterId:string; role:"user"|"assistant"; createdAt:number; audio:Blob };
class FavoriteDatabase extends Dexie {
  clips!: Dexie.Table<VoiceFavorite,string>;
  constructor(){super("AiPhoneVoiceFavoritesDB");this.version(1).stores({clips:"id,kind,createdAt"});}
}
let db:FavoriteDatabase|undefined;
const database=()=>db??(db=new FavoriteDatabase());
export const VOICE_FAVORITES_EVENT="voice-favorites-updated";
export async function saveVoiceFavorite(input:Omit<VoiceFavorite,"id"|"createdAt">){
  if(!input.audio.size)throw Error("没有可收藏的音频");
  const id=`${input.kind}:${input.sourceKey}`;
  const old=await database().clips.get(id);
  await database().clips.put({...input,id,createdAt:old?.createdAt || Date.now()});
  window.dispatchEvent(new Event(VOICE_FAVORITES_EVENT));
}
export async function getVoiceFavorite(kind:VoiceFavoriteKind,sourceKey:string){return database().clips.get(`${kind}:${sourceKey}`);}
export async function listVoiceFavorites(){return database().clips.orderBy("createdAt").reverse().toArray();}
export async function removeVoiceFavorite(id:string){await database().clips.delete(id);window.dispatchEvent(new Event(VOICE_FAVORITES_EVENT));}
export async function existingVoiceBlob(url?:string):Promise<Blob|null>{
  if(!url)return null;
  if(isMediaStoreRef(url))return (await loadMediaBlob(url))?.blob || null;
  const result=await fetch(url);if(!result.ok)throw Error("读取已有音频失败");
  const blob=await result.blob();if(!blob.size || blob.type.startsWith("text/") || blob.type.includes("json"))throw Error("音频文件无效");return blob;
}
export type VoiceExportModule="call"|"message"|"phone";
export const VOICE_EXPORT_LABELS:Record<VoiceExportModule,string>={call:"Chat 语音／视频通话单句",message:"聊天语音消息",phone:"电话收藏"};
/** Archive contains actual audio bytes and portable relative paths, never temporary blob URLs. */
export async function buildVoiceFavoritesExport(modules:VoiceExportModule[], clips?:VoiceFavorite[], phoneCalls?:PhoneCallRecord[]){
  const zip=new JSZip();const saved=clips || await listVoiceFavorites();const calls=phoneCalls || loadPhoneState().calls.filter(c=>c.favorite);
  const manifest:{version:number;createdAt:string;modules:VoiceExportModule[];clips:unknown[];phoneCalls:unknown[];missingAudio:string[]}={version:1,createdAt:new Date().toISOString(),modules,clips:[],phoneCalls:[],missingAudio:[]};
  let count=0;
  async function put(blob:Blob,kind:string){const ext=blob.type.includes("wav")?"wav":blob.type.includes("ogg")?"ogg":blob.type.includes("webm")?"webm":blob.type.includes("mp4")?"m4a":"mp3";const path=`audio/${kind}_${++count}.${ext}`;zip.file(path,await blob.arrayBuffer());return path;}
  for(const item of saved.filter(c=>modules.includes(c.kind))){const {audio,...meta}=item;manifest.clips.push({...meta,audioPath:await put(audio,item.kind),mimeType:audio.type});}
  if(modules.includes("phone"))for(const call of calls){const transcript=[];for(const line of call.transcript){const {audioRef,...meta}=line;let audioPath:string|undefined;if(audioRef){const media=await loadMediaBlob(audioRef);if(media)audioPath=await put(media.blob,"phone");else manifest.missingAudio.push(`${call.id}/${line.id}`);}else if(line.role==="assistant")manifest.missingAudio.push(`${call.id}/${line.id}`);transcript.push({...meta,audioPath});}manifest.phoneCalls.push({...call,transcript});}
  zip.file("收藏索引.json",JSON.stringify(manifest,null,2));zip.file("说明.txt","audio目录为已保存音频；收藏索引记录来源、台词与音频路径。缺失音频列在missingAudio中，导出不会调用语音API。\n");
  return {blob:await zip.generateAsync({type:"blob"}),missing:manifest.missingAudio.length};
}
