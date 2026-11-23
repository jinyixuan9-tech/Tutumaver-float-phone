import {Capacitor,registerPlugin} from '@capacitor/core';
import {playAudioBlobViaMediaElement} from './tts-service';
const native=registerPlugin<{start():Promise<{speaker:boolean}>;setSpeaker(o:{enabled:boolean}):Promise<{speaker:boolean}>;finish():Promise<void>;play(o:{base64:string;token:string}):Promise<{cancelled:boolean}>;stop(o:{token:string}):Promise<void>}>('FloatCallAudio');
export const hasNativePhoneAudio=()=>Capacitor.getPlatform()==='android'&&Capacitor.isPluginAvailable('FloatCallAudio');
export async function startPhoneAudio(){if(hasNativePhoneAudio())return native.start();return {speaker:false};}
export async function setPhoneSpeaker(enabled:boolean){if(!hasNativePhoneAudio())throw Error('免提切换需要安装新版安卓 APK');return native.setSpeaker({enabled});}
export async function finishPhoneAudio(){if(hasNativePhoneAudio())await native.finish();}
export function playPhoneAudio(blob:Blob):{promise:Promise<void>;abort:()=>void}{
 if(!hasNativePhoneAudio())return playAudioBlobViaMediaElement(blob);
 const token=crypto.randomUUID();let cancelled=false;
 const promise=(async()=>{const base64=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(Error('音频读取失败'));reader.readAsDataURL(blob);});if(!cancelled)await native.play({base64,token});})();
 return {promise,abort:()=>{cancelled=true;void native.stop({token}).catch(()=>{});}};
}
