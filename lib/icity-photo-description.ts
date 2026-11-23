import {kvGet,kvSet,registerKvMigration} from './kv-db';
const KEY='icity-photo-descriptions-v1';registerKvMigration(KEY);
export function cityPhotoDescription(reference:string):string {
 if(reference.startsWith('text://')){try{return decodeURIComponent(reference.slice(7));}catch{return '';}}
 try{return (JSON.parse(kvGet(KEY)||'{}') as Record<string,string>)[reference]||'';}catch{return '';}
}
export function saveCityPhotoDescription(reference:string,description:string) {
 if(!reference||!description.trim())return;
 let all:Record<string,string>={};try{all=JSON.parse(kvGet(KEY)||'{}');}catch{}
 all[reference]=description.trim();kvSet(KEY,JSON.stringify(all));
}
