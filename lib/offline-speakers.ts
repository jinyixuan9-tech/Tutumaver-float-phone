import type { ChatSession } from './chat-storage';
import { loadCharacters } from './character-storage';
import { groupMemberName } from './group-chat-profile';
/** Resolve aliases only inside this session; ambiguous aliases must never select a voice. */
export function offlineSpeakerMap(session: ChatSession): Record<string, string> {
    const allowed = session.isGroup ? session.participantIds || [] : [session.contactId];
    const map: Record<string, string> = Object.create(null); const ambiguous = new Set<string>();
    const add = (key: string | undefined, id: string) => { const name = key?.trim(); if (!name || name === 'user' || ambiguous.has(name)) return; if (map[name] && map[name] !== id) { delete map[name]; ambiguous.add(name); } else map[name] = id; };
    for (const character of loadCharacters().filter(c => allowed.includes(c.id))) {
        add(character.id, character.id); add(character.name, character.id);
        if (session.isGroup) add(groupMemberName(session, character.id, character, character.name), character.id);
        else add(session.alias, character.id);
    }
    return map;
}
