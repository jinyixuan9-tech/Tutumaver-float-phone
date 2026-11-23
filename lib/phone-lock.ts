import { kvGet, kvSet, registerKvMigration } from './kv-db';
const KEY = 'ai_phone_lock_v1';
registerKvMigration(KEY);
export type PhoneLockConfig = {
    enabled: boolean;
    pinHash: string;
    pinLength: number;
    wallpaper: string;
};
export function loadPhoneLock(): PhoneLockConfig { try {
    return { enabled: true, pinHash: '', pinLength: 6, wallpaper: '', ...JSON.parse(kvGet(KEY) || '{}') };
}
catch {
    return { enabled: true, pinHash: '', pinLength: 6, wallpaper: '' };
} }
export function savePhoneLock(c: PhoneLockConfig) { kvSet(KEY, JSON.stringify(c)); }
export async function hashPhonePin(pin: string) { const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('float-lock-v1:' + pin)); return Array.from(new Uint8Array(bytes), v => v.toString(16).padStart(2, '0')).join(''); }

export function formatPhoneLockDate(date:Date){const year=date.getFullYear(),month=String(date.getMonth()+1).padStart(2,'0'),day=String(date.getDate()).padStart(2,'0');return `${year}年${month}月${day}日  星期${'日一二三四五六'[date.getDay()]}`}
