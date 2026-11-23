import {notifyLysn} from "./lysn-notification";
import {lysnCalendarContext} from "./lysn-calendar-context";
import { loadCharacters } from "./character-storage";
import { generateLysn } from "./lysn-engine";
import { prepareLysnMessages } from "./lysn-message";
import { appendLysn, loadLysn, saveLysn } from "./lysn-storage";
import { maybeCelebrateLysn } from "./lysn-celebrations";
import { applyLysnProfileAction } from "./lysn-profile-autonomy";
import { noteLysnFanMessage } from "./lysn-identity";

const FIRST_MESSAGE_WAIT_MS = 15 * 60 * 1000;
const RETRY_WAIT_MS = 30 * 60 * 1000;
let running = false;
/** A low-frequency scheduler running only while the phone is open. */
export async function maybeGenerateLysnBackgroundMessage(): Promise<void> {
  if (running || typeof document === "undefined") return;
  const state = loadLysn();
  state.subscribedIds.forEach(id => { void maybeCelebrateLysn(id); });
  // Local simulated reads run even when automatic artist messages are disabled.
  const readNow = Date.now();
  let readChanged = false;
  const observedMessages: Array<{ characterId: string; text: string }> = [];
  for (const characterId of state.subscribedIds) {
    const room = state.rooms[characterId];
    if (!room?.openerShown || !lysnCalendarContext(characterId).canRead) continue;
    const lastArtistAt = state.messages.filter(m => m.characterId === characterId && m.sender === "artist" && !m.opener).at(-1)?.createdAt || 0;
    const unread = state.messages.filter(m => m.characterId === characterId && m.sender === "fan" && !m.seenAt && m.createdAt > lastArtistAt);
    if (!unread.length) {
      if (room.nextFanReadAt) { room.nextFanReadAt = undefined; readChanged = true; }
      continue;
    }
    const style = room.readStyle || "normal";
    const hours = { rare: [3, 12], normal: [0.25, 3], often: [0.05, 0.7] }[style];
    if (!room.nextFanReadAt) {
      room.nextFanReadAt = Math.max(readNow, unread[0].createdAt) + (hours[0] + Math.random() * (hours[1] - hours[0])) * 3600000;
      readChanged = true;
    } else if (readNow >= room.nextFanReadAt) {
      const count = Math.min(unread.length, 1 + Math.floor(Math.random() * Math.min(unread.length, 3)));
      unread.slice(0, count).forEach(m => { m.seenAt = readNow; if (m.kind === "text") observedMessages.push({ characterId, text: m.original }); });
      room.nextFanReadAt = undefined;
      readChanged = true;
    }
  }
  if (readChanged) saveLysn(state);
  observedMessages.forEach(message => noteLysnFanMessage(message.characterId, message.text));
  const scheduleState = loadLysn();
  if (!scheduleState.settings.autonomousMessages) return;
  const now = Date.now();
  const id = scheduleState.subscribedIds.find(characterId => {
    const room = scheduleState.rooms[characterId];
    if (!room?.openerShown || !lysnCalendarContext(characterId).canSend) return false;
    const activity = room.activity || "normal";
    const interval = ({ quiet: 36, normal: 6, frequent: 1 }[activity]) * 3600000 * (lysnCalendarContext(characterId).level===2?1.5:1);
    const firstWait = ({ quiet: 4 * 3600000, normal: FIRST_MESSAGE_WAIT_MS, frequent: 5 * 60000 }[activity]);
    const latest = scheduleState.messages.filter(m => m.characterId === characterId && m.sender === "artist" && !m.opener).at(-1)?.createdAt || 0;
    const joined = scheduleState.subscribedAt[characterId] || now;
    if(!room.nextArrivalAt){room.nextArrivalAt=Math.max(latest,scheduleState.lastAutoAt[characterId]||0,joined)+(latest?interval:firstWait)*(.65+Math.random()*.9);saveLysn(scheduleState);}
    return now>=room.nextArrivalAt;
  });
  if (!id || !loadCharacters().some(c => c.id === id)) return;
  running = true;
  scheduleState.lastAutoAt[id] = now; scheduleState.rooms[id].nextArrivalAt=undefined; saveLysn(scheduleState);
  try {
    const result = await generateLysn(id, scheduleState.messages.filter(m => m.characterId === id), "new");
    if (!result.length) return;
    const rows = await prepareLysnMessages(id, result);
    if (!rows.length) return;
    if (!loadLysn().subscribedIds.includes(id) || loadLysn().subscribedAt[id]!==scheduleState.subscribedAt[id] || !lysnCalendarContext(id).canSend) return;
    const newlyObserved = loadLysn().messages.filter(m => m.characterId === id && m.sender === "fan" && m.kind === "text" && !m.seenAt && result.some(row=>row.quote?.original===m.original));
    appendLysn(id, rows);
    newlyObserved.forEach(message => noteLysnFanMessage(id, message.original));
    if (result[0]?.profileUpdate) await applyLysnProfileAction(id, JSON.stringify(result[0].profileUpdate));
    const latest = loadLysn();
    notifyLysn(id);
  } catch {
    const latest = loadLysn();
    latest.lastAutoAt[id] = Date.now() - FIRST_MESSAGE_WAIT_MS + RETRY_WAIT_MS;
    saveLysn(latest);
  } finally { running = false; }
}
