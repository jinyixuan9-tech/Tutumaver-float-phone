import { isGroupMuted } from './group-admin';
import { loadChatSessions, createOrGetSession, type ChatSession } from './chat-storage';
export const GROUP_SHARE_PREFIX = 'groupchat:';
export function chatShareGroups(): ChatSession[] { return loadChatSessions().filter(s=>s.isGroup && !s.isSpectator && !isGroupMuted(s, "self")); }
export function resolveChatShareSession(target: string): ChatSession {
    if (target.startsWith(GROUP_SHARE_PREFIX)) {
        const group=chatShareGroups().find(s=>s.id===target.slice(GROUP_SHARE_PREFIX.length));
        if (!group) throw Error('群聊已不存在或不能发言');
        return group;
    }
    return createOrGetSession(target);
}
