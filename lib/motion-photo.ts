/** Conservative extraction of a JPEG Motion Photo's appended ISO BMFF video.
 * No image re-encoding: static uploads must never silently become fake Live Photos.
 * HEIC/vendor sidecars require device samples and are deliberately not guessed.
 */
export function extractMotionVideo(bytes:Uint8Array):Uint8Array|null{
 if(bytes.length<20||bytes[0]!==255||bytes[1]!==216)return null;
 let eoi=-1;for(let i=2;i<bytes.length-1;i++)if(bytes[i]===255&&bytes[i+1]===217){eoi=i+2;break;}
 if(eoi<0)return null;
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 const type=(p:number)=>String.fromCharCode(...bytes.subarray(p,p+4));
 for(let i=eoi;i+16<=bytes.length;i++){
  if(type(i+4)!=='ftyp')continue;const size=view.getUint32(i);if(size<16||size>256||i+size>bytes.length)continue;
  let p=i,hasMoov=false,hasMdat=false,end=i,valid=true;
  while(p+8<=bytes.length){let n=view.getUint32(p),header=8;const t=type(p+4);if(n===1){if(p+16>bytes.length){valid=false;break;}const hi=view.getUint32(p+8),lo=view.getUint32(p+12);if(hi>0){valid=false;break;}n=lo;header=16;}if(n===0)n=bytes.length-p;if(n<header||p+n>bytes.length){break;}if(!/^[a-zA-Z0-9 ]{4}$/.test(t))break;if(t==='moov')hasMoov=true;if(t==='mdat')hasMdat=true;p+=n;end=p;if(hasMoov&&hasMdat)break;}
  if(valid&&hasMoov&&hasMdat)return bytes.slice(i,end);
 }return null;
}
export async function unwrapMotionPhoto(file:File):Promise<File>{
 if(file.type.startsWith('video/')||/\.(mp4|mov|m4v|webm)$/i.test(file.name))return file;
 if(file.size>40*1024*1024)throw Error('动态照片不能超过40MB');
 const video=extractMotionVideo(new Uint8Array(await file.arrayBuffer()));
 if(!video)throw Error('这份照片没有可识别的动态视频，请选原始动态照片，或从手机相册导出视频后再试');
 return new File([video as Uint8Array<ArrayBuffer>],file.name.replace(/\.[^.]+$/,'')+'.mp4',{type:'video/mp4'});
}
