import {kvGet,kvSet,registerKvMigration} from './kv-db';
export type OfflineMusicTheme='day'|'night';
const KEYS={day:'ai_phone_offline_music_icon_day',night:'ai_phone_offline_music_icon_night'};
for(const key of Object.values(KEYS))registerKvMigration(key);
const DEFAULT_ICONS:Record<OfflineMusicTheme,string>={
 day:'https://imgbed.heliar.top/i/WAkINPN93pprM3En_9cf03d81-e332-4dcd-baa8-410dfe48e088.png',
 night:'https://imgbed.heliar.top/i/yBjuejxNfSDUG0jj_b87e3704-201b-4d8c-8f9d-16063517c288.png',
};
export function defaultOfflineMusicIcon(theme:OfflineMusicTheme='day'){return DEFAULT_ICONS[theme];}
export const DEFAULT_OFFLINE_MUSIC_ICON=DEFAULT_ICONS.day;
export function loadOfflineMusicIcon(theme:OfflineMusicTheme='day'){return kvGet(KEYS[theme])||defaultOfflineMusicIcon(theme);}
export function saveOfflineMusicIcon(ref?:string,theme:OfflineMusicTheme='day'){kvSet(KEYS[theme],ref||'');window.dispatchEvent(new Event('offline-music-icon-updated'));}
