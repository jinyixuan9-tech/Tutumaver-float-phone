import {kvGet,kvSetAsync,registerKvMigration} from './kv-db';

/** One mask for every unified text-image placeholder, across all apps. */
const KEY='ai_phone_text_image_mask_v1';
export const DEFAULT_TEXT_IMAGE_MASK='/text-image-mask-loading.png';
export const TEXT_IMAGE_MASK_UPDATED='text-image-mask-updated';
registerKvMigration(KEY);

export function loadTextImageMask():string {
  return kvGet(KEY)?.trim() || DEFAULT_TEXT_IMAGE_MASK;
}
export async function saveTextImageMask(reference?:string):Promise<void> {
  await kvSetAsync(KEY,reference?.trim()||'');
  if(typeof window!=='undefined')window.dispatchEvent(new Event(TEXT_IMAGE_MASK_UPDATED));
}
