import {prepareLivePhoto} from './chat-live-photo';
import {saveChatImageToIndexedDB} from './chat-asset-storage';
export type SocialMedia={kind:'live'|'gif';assetId:string;cover:string;sheet:string;duration:number;muted?:boolean};
const fresh=new Set<string>();
export function markMediaSent(key:string){fresh.add(key);}
export function consumeMediaSent(key:string){const yes=fresh.has(key);fresh.delete(key);return yes;}
export async function decodeGif(data:ArrayBuffer){
 const {parseGIF,decompressFrames}=await import('gifuct-js');const gif=parseGIF(data);
 if(gif.lsd.width*gif.lsd.height>12_000_000 || gif.frames.length>600 || gif.lsd.width*gif.lsd.height*gif.frames.length>120_000_000)throw Error('GIF 太大，请缩小或缩短后重试');
 const frames=decompressFrames(gif,true);return {width:gif.lsd.width,height:gif.lsd.height,frames};
}
export async function prepareSocialMedia(file:File):Promise<SocialMedia>{
 if(file.type!=='image/gif'&&!/\.gif$/i.test(file.name)){const v=await prepareLivePhoto(file,true);return{kind:'live',assetId:v.videoId,cover:v.cover,sheet:v.sheet,duration:v.duration,muted:true};}
 if(file.type!=='image/gif'&&!/\.gif$/i.test(file.name))throw Error('请选择 GIF 或8秒以内的视频');
 if(file.size>30*1024*1024)throw Error('GIF 不能超过30MB');
 const g=await decodeGif(await file.arrayBuffer());const c=document.createElement('canvas');c.width=g.width;c.height=g.height;const ctx=c.getContext('2d')!;
 const patch=document.createElement('canvas'),pc=patch.getContext('2d')!;let previous:typeof g.frames[number]|undefined,snapshot:ImageData|undefined,cover='';
 const sheet=document.createElement('canvas');sheet.width=800;sheet.height=400;const sc=sheet.getContext('2d')!;let sample=0;
 for(let i=0;i<g.frames.length;i++){const f=g.frames[i];if(previous?.disposalType===2)ctx.clearRect(previous.dims.left,previous.dims.top,previous.dims.width,previous.dims.height);if(previous?.disposalType===3&&snapshot)ctx.putImageData(snapshot,0,0);if(f.disposalType===3)snapshot=ctx.getImageData(0,0,c.width,c.height);patch.width=f.dims.width;patch.height=f.dims.height;pc.putImageData(new ImageData(new Uint8ClampedArray(f.patch!),f.dims.width,f.dims.height),0,0);ctx.drawImage(patch,f.dims.left,f.dims.top);if(!cover)cover=c.toDataURL('image/png');if(sample<8&&i>=Math.floor(sample*(g.frames.length-1)/7)){sc.drawImage(c,(sample%4)*200,Math.floor(sample/4)*200,200,200);sample++;}previous=f;}
 return{kind:'gif',assetId:await saveChatImageToIndexedDB(file),cover,sheet:sheet.toDataURL('image/jpeg',.75),duration:g.frames.reduce((n,f)=>n+Math.max(20,f.delay||100),0)/1000};
}
