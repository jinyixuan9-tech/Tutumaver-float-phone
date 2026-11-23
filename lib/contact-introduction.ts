import { loadCharacters } from "./character-storage";
import { loadChatContacts, loadChatMessages, loadChatSessions, type ChatMessage } from "./chat-storage";
import { addCharacterWorldRelation, getCharacterWorldGroup, loadCharacterWorldGroups, saveCharacterWorldGroups } from "./character-world-storage";
import { resolveChatCharacterDisplayName } from "./chat-profile-storage";

export function introductionCandidates(receiverId: string) {
  const group = getCharacterWorldGroup(receiverId);
  if (!group) return [];
  const friends = new Set(loadChatContacts().map(c => c.characterId));
  return loadCharacters().filter(c => c.id !== receiverId && friends.has(c.id) && group.memberIds.includes(c.id)
    && !group.relations.some(r => r.fromCharacterId === c.id && r.toCharacterId === receiverId || r.fromCharacterId === receiverId && r.toCharacterId === c.id));
}
export function introduceContact(receiverId: string, targetId: string, note: string, sourceMessageId: string): boolean {
  if (!introductionCandidates(receiverId).some(c => c.id === targetId)) return false;
  const group = getCharacterWorldGroup(receiverId)!;
  addCharacterWorldRelation(group.id, receiverId, targetId, note.trim().slice(0, 200) || "经用户介绍成为朋友", {
    bidirectional: true,
    kind: "friend",
    sourceMessageId,
  });
  return true;
}
/** Remove only the relationship introduced by a card now being deleted.
 * Independent/older relationships are preserved even if the same two people are involved. */
export function unlinkDeletedIntroductionCards(deleted: Pick<ChatMessage, "id" | "mediaData" | "mediaType">[]): void {
  const ids = new Set(deleted.filter(m => m.mediaType === "contact_card" && m.mediaData?.contactIntroduction).map(m => m.id));
  if (!ids.size) return;
  const groups = loadCharacterWorldGroups();
  if (!groups.some(g => g.relations.some(r => r.sourceMessageId && ids.has(r.sourceMessageId)))) return;
  saveCharacterWorldGroups(groups.map(g => ({
    ...g, relations: g.relations.filter(r => !r.sourceMessageId || !ids.has(r.sourceMessageId))
  })));
}
/** Project introductions from the original cards still present in Chat. */
export function contactIntroductionEntries(characterId: string) {
  const characters = loadCharacters();
  return loadChatSessions().filter(s => !s.isGroup).flatMap(s => loadChatMessages(s.id).flatMap(m => {
    const targetId = m.mediaData?.contactCardCharacterId;
    if (m.role !== "user" || m.mediaType !== "contact_card" || !m.mediaData?.contactIntroduction || !targetId || ![s.contactId, targetId].includes(characterId)) return [];
    const receiver = characters.find(c => c.id === s.contactId), target = characters.find(c => c.id === targetId);
    if (!receiver || !target) return [];
    return [{ id: `contact_introduction_${m.id}`, timestamp: m.createdAt, shared: true,
      content: `用户把${resolveChatCharacterDisplayName(target)}的名片推荐给${resolveChatCharacterDisplayName(receiver)}，两人由用户介绍而认识，并已成为好友。关系备注（资料）：${JSON.stringify(m.mediaData.contactIntroductionNote || "朋友")}。这不表示双方知道彼此的私人经历。` }];
  }));
}
