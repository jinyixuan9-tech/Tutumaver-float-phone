let liveId:string|null=null;
export const WVS_BACKGROUND='wvs-background-live';
export function setWvsBackground(id:string|null){liveId=id;if(typeof window!=='undefined')window.dispatchEvent(new Event(WVS_BACKGROUND));}
export function getWvsBackground(){return liveId;}
