import {kvGet,kvSet,registerDynamicPrefix} from "./kv-db";
import type {MusicTrack} from "./music-storage";
import {getMusicControlBridge} from "./music-control-bridge";
const PREFIX="ai_phone_chat_offline_story_music:";
registerDynamicPrefix(PREFIX);
export type OfflineStoryMusic={track:MusicTrack;startedAt:number};
export function loadOfflineStoryMusic(sessionId:string):OfflineStoryMusic|null {try{const raw=kvGet(PREFIX+sessionId);if(!raw)return null;const v=JSON.parse(raw) as OfflineStoryMusic;return v?.track?.id&&Number.isFinite(v.startedAt)?v:null;}catch{return null;}}
export function saveOfflineStoryMusic(sessionId:string,track:MusicTrack|null){kvSet(PREFIX+sessionId,track?JSON.stringify({track,startedAt:Date.now()}):"");if(typeof window!=="undefined")window.dispatchEvent(new CustomEvent("offline-story-music-updated",{detail:{sessionId}}));}
/** Background music does not reach model. Song exists in scene only after explicit '发送给TA'. */
export function offlineMusicContext(sessionId:string):string {
 const active=loadOfflineStoryMusic(sessionId);if(!active)return "";
 const state=getMusicControlBridge()?.getState();
 const natural="结合用户文字和上下文理解音乐作用：可以是环境背景、共同听歌或角色分享，不要仅因分享就强行改写场景。不要求每轮提音乐或引用歌词，也不必特意播报暂停、切歌或结束；需要时由角色或叙述自然带过。";
 if(!state||state.currentTrack?.id!==active.track.id)return `\n[用户先前分享的音乐《${active.track.title.slice(0,100)}》目前无法确认仍在播放，不要声称仍在播放。${natural}]`;
 const secs=Math.max(0,Math.floor(state.currentTime));const time=`${Math.floor(secs/60)}:${String(secs%60).padStart(2,"0")}`;
 const ended=state.duration>0&&state.currentTime>=state.duration;
 const header=`\n[用户分享的音乐：${active.track.title.slice(0,100)} — ${active.track.artist.slice(0,100)}；播放器参考状态：${ended?"已到曲末":state.isPlaying?"正在播放":"暂停中"}；位置 ${time}。${natural}]`;
 const text=state.currentTrack.lyrics||"";
 const matched=[...text.matchAll(/\[(\d{1,3}):(\d{2}(?:\.\d+)?)\]([^\r\n]*)/g)].map(m=>({time:Number(m[1])*60+Number(m[2]),line:m[3].trim()})).filter(m=>m.line).sort((a,b)=>a.time-b.time);
 let index=-1;for(let i=0;i<matched.length;i++){if(matched[i].time<=state.currentTime)index=i;else break;}
 if(!matched.length)return header+'\n[没有可靠的时间同步歌词，不要臆造当前或前后歌词。]';
 const parts:string[]=[];
 if(index>0)parts.push('前两句：'+matched.slice(Math.max(0,index-2),index).map(m=>m.line.slice(0,70)).join(' / '));
 if(index>=0)parts.push('当前位置：'+matched[index].line.slice(0,70));
 const upcoming=matched.slice(index+1,index+3);if(upcoming.length)parts.push('后两句（尚未播放到）：'+upcoming.map(m=>m.line.slice(0,70)).join(' / '));
 return header+`\n[同步歌词片段仅供理解氛围，不要求引用；后面的歌词不代表角色已经听见。${parts.join('；')}]`;
}
