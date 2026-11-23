import {bgSetInterval} from './bg-timer';
import {tickCityWriting} from './icity-runtime';
export const DIARY_ENTRIES_UPDATED_EVENT='diary-entries-updated';
export const DIARY_ENTRY_TIMER_SETTINGS_UPDATED_EVENT='diary-entry-timer-settings-updated';
let stop:(()=>void)|null=null;
export const runDiaryEntryTimerCheck=tickCityWriting;
function check(){void tickCityWriting();}
export function startDiaryEntryTimerService(){if(typeof window==='undefined'||stop)return;stop=bgSetInterval(check,60000);window.addEventListener('focus',check);document.addEventListener('visibilitychange',check);check();}
export function stopDiaryEntryTimerService(){stop?.();stop=null;if(typeof window==='undefined')return;window.removeEventListener('focus',check);document.removeEventListener('visibilitychange',check);}
