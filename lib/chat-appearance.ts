import {kvGet,kvSet,registerKvMigration} from "./kv-db";
const KEY = "chat-night-mode-v1";
export const CHAT_APPEARANCE_OPEN = "chat-appearance-open";
registerKvMigration(KEY);
export function loadChatNightMode(): boolean { return kvGet(KEY) === "dark"; }
export function saveChatNightMode(dark: boolean): void { kvSet(KEY, dark ? "dark" : "light"); }
export function openChatAppearance(): void { window.dispatchEvent(new Event(CHAT_APPEARANCE_OPEN)); }
