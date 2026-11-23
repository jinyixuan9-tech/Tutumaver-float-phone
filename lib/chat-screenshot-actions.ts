import {Capacitor,registerPlugin} from '@capacitor/core';
import {Filesystem,Directory} from '@capacitor/filesystem';
import {Share} from '@capacitor/share';
const Gallery=registerPlugin<{savePng(options:{path:string}):Promise<{uri:string}>}>('FloatGallery');
function base64(blob:Blob){return new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(reader.error);reader.readAsDataURL(blob);});}
async function stage(blob:Blob){const path=`exports/screenshot-${Date.now()}-${Math.random().toString(36).slice(2)}.png`;for(let i=0;i<blob.size;i+=384*1024){const data=await base64(blob.slice(i,i+384*1024));if(i===0)await Filesystem.writeFile({path,directory:Directory.Cache,data,recursive:true});else await Filesystem.appendFile({path,directory:Directory.Cache,data});}return path;}
function android(){return Capacitor.isNativePlatform()&&Capacitor.getPlatform()==='android';}
export async function saveChatScreenshot(blob:Blob){
 if(!android()){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='聊天截图.png';a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);return '已发起图片下载';}
 if(!Capacitor.isPluginAvailable('FloatGallery'))throw Error('当前APK不支持直接保存相册，请覆盖安装1.0.6或更新版本。');
 const path=await stage(blob);try{await Gallery.savePng({path});return '已保存到手机相册';}finally{await Filesystem.deleteFile({path,directory:Directory.Cache}).catch(()=>{});}
}
export async function shareChatScreenshot(blob:Blob){
 if(android()){const path=await stage(blob),file=await Filesystem.getUri({path,directory:Directory.Cache});await Share.share({title:'聊天截图',files:[file.uri],dialogTitle:'分享到其他应用'});return;}
 const file=new File([blob],'聊天截图.png',{type:'image/png'});if(navigator.canShare?.({files:[file]})){await navigator.share({files:[file]});return;}throw Error('当前浏览器不支持图片分享，请先保存图片后在其他应用中选择。');
}
