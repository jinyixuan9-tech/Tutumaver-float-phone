/** Battery Status API is supplied by Android's Chromium WebView; no permissions or polling. */
export type DeviceBattery = {percent:number;charging:boolean};
type BatteryManager = EventTarget & {level:number;charging:boolean};
export function observeDeviceBattery(onChange:(value:DeviceBattery)=>void,source:Navigator=navigator):()=>void{
 let disposed=false,battery:BatteryManager|undefined;
 const update=()=>{if(!disposed&&battery&&Number.isFinite(battery.level))onChange({percent:Math.round(Math.max(0,Math.min(1,battery.level))*100),charging:battery.charging})};
 const refresh=()=>{if(document.visibilityState==='visible')update()};
 const get=(source as Navigator & {getBattery?:()=>Promise<BatteryManager>}).getBattery;
 if(get)void get.call(source).then(value=>{if(disposed)return;battery=value;update();battery.addEventListener('levelchange',update);battery.addEventListener('chargingchange',update);document.addEventListener('visibilitychange',refresh)}).catch(()=>{});
 return()=>{disposed=true;battery?.removeEventListener('levelchange',update);battery?.removeEventListener('chargingchange',update);document.removeEventListener('visibilitychange',refresh)};
}
