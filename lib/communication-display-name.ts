import { loadChatContacts, loadChatSessions, type ChatSession } from "./chat-storage";
import { resolveChatCharacterDisplayName } from "./chat-profile-storage";
import { loadCharacters } from "./character-storage";

/** UI names only: never rewrite persona names or stored message content. */
export function chatContactDisplayName(characterId: string, session?: ChatSession | null): string {
  const character = loadCharacters().find(item => item.id === characterId);
  const chat = session ?? loadChatSessions().find(item => !item.isGroup && item.contactId === characterId);
  return chat?.alias?.trim()
    || loadChatContacts().find(item => item.characterId === characterId)?.nickname?.trim()
    || (character ? resolveChatCharacterDisplayName(character) : "") || "联系人";
}

export function chatPokeDisplayName(name: string, userName?: string): string {
  if (name === userName || name === "你" || name === "我") return "你";
  const character = loadCharacters().find(item => item.name === name || item.id === name);
  return character ? chatContactDisplayName(character.id) : name;
}
