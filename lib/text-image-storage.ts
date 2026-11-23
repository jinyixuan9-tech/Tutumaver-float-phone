import {kvGet,kvSet,registerKvMigration} from './kv-db';
export type TextImageState={id:string;appId:string;contentId:string;originalPrompt:string;editedPrompt:string;previewRef?:string;previewPrompt?:string;adoptedRef?:string;previousRef?:string;textMode?:boolean;status:'text'|'preview'|'adopted';updatedAt:number};
const KEY='ai_phone_text_images_v1';registerKvMigration(KEY);
function all():Record<string,TextImageState>{try{return JSON.parse(kvGet(KEY)||'{}');}catch{return{};}}
export function textImageId(appId:string,contentId:string){return appId+':'+contentId;}
export function loadTextImage(appId:string,contentId:string,prompt:string,reference?:string):TextImageState{const linked=reference?findTextImageByRef(appId,reference):undefined;return all()[textImageId(appId,contentId)]||(linked?{...linked,id:textImageId(appId,contentId),appId,contentId}:{id:textImageId(appId,contentId),appId,contentId,originalPrompt:prompt,editedPrompt:prompt,status:'text',updatedAt:Date.now()});}
export function saveTextImage(value:TextImageState){const current=all();const original=current[value.id]?.originalPrompt||value.originalPrompt;const next={...value,originalPrompt:original,updatedAt:Date.now()};kvSet(KEY,JSON.stringify({...current,[next.id]:next}));if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent('text-image-updated',{detail:{id:next.id}}));return next;}
export function adoptTextImage(value:TextImageState){if(!value.previewRef)throw Error('请先生成预览');return saveTextImage({...value,adoptedRef:value.previewRef,previousRef:value.previewRef,editedPrompt:value.previewPrompt||value.editedPrompt,previewRef:undefined,previewPrompt:undefined,textMode:false,status:'adopted'});}
export function revertTextImage(value:TextImageState){return saveTextImage({...value,previousRef:value.adoptedRef||value.previousRef,adoptedRef:undefined,previewRef:undefined,textMode:true,status:'text'});}

export function findTextImage(appId:string,contentId:string):TextImageState|undefined{return all()[textImageId(appId,contentId)];}

export function findTextImageByRef(appId:string,ref:string):TextImageState|undefined{const id=ref.replace(/^asset:\/\//,'');return Object.values(all()).find(r=>r.appId===appId&&r.adoptedRef?.replace(/^asset:\/\//,'')===id);}
