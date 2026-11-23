import type {ChatMessage} from './chat-storage';
export type NovelChapterSnapshot={bookId:string;chapterId:string;title:string;author:string;chapter:string;text:string;zh?:string;at:number;note?:string;comments?:import("./novel-storage").NovelComment[]};
export type WeverseReplaySnapshot={liveId:string;title:string;hostName:string;coverUrl?:string;summary:string;segments?:Array<{kind:string;original:string;translated?:string;characterId?:string}>;sharedAt:number};
export type SharedApp='x'|'theqoo'|'icity'|'xiaohongshu'|'question'|'novel'|'browser';
export const SHARED_APPS={browser:{name:'Browser',appId:'browser'},x:{name:'X',appId:'twitter'},theqoo:{name:'Theqoo',appId:'theqoo'},icity:{name:'iCity',appId:'diary'},xiaohongshu:{name:'小红书',appId:'xiaohongshu'},question:{name:'提问箱',appId:'question_box'},novel:{name:'NovelNow',appId:'novel'}} as const;
export function sharedApp(message:ChatMessage):SharedApp|null {
 const d=message.mediaData;
 if(message.mediaType==='xiaohongshu_note_share')return 'xiaohongshu';
 if(message.mediaType!=='app_card'||d?.appDirectiveId)return null;
 if(d?.browserVideoSnapshot)return 'browser';if(d?.twitterPostSnapshot)return 'x';if(d?.theqooSnapshot)return 'theqoo';if(d?.cityDiarySnapshot)return 'icity';if(d?.questionBoxSnapshot)return 'question';
 if(d?.appId==='novel'&&(d.novelChapterSnapshot||message.content.includes('小说章节快照')))return 'novel';
 return null;
}
export function novelSnapshot(message:ChatMessage):NovelChapterSnapshot|null {
 if(message.mediaData?.novelChapterSnapshot)return message.mediaData.novelChapterSnapshot;
 // Older shares embedded the immutable chapter JSON in appHistoryText.
 const body=message.mediaData?.appHistoryText||message.content;
 for(const line of body.split(/\n|\\n/)){try{const v=JSON.parse(line);if(typeof v?.bookId==='string'&&typeof v?.text==='string')return v;}catch{}}
 return null;
}
