"use client";
import { chatContactDisplayName } from "@/lib/communication-display-name";
import { useEffect, useState } from "react";
import { loadChatAppSettings, CHAT_APP_SETTINGS_UPDATED_EVENT, resolveChatUserAvatar, type ChatSession } from "@/lib/chat-storage";
import { resolveUserIdentity, USER_IDENTITIES_UPDATED_EVENT } from "@/lib/settings-storage";
import { resolveChatCharacterAvatar, resolveChatCharacterDisplayName, CHAT_CHARACTER_PROFILES_UPDATED_EVENT } from "@/lib/chat-profile-storage";
import type { Character } from "@/lib/character-types";
export function useChatUserAvatar(session?: ChatSession) {
    const read = () => resolveChatUserAvatar(session, (session ? resolveUserIdentity(session.isGroup ? undefined : session.contactId, session.isGroup ? "group_chat" : "chat") : resolveUserIdentity())?.avatarUrl);
    const [avatar, setAvatar] = useState(read);
    useEffect(() => {
        const sync = () => setAvatar(read()); sync();
        window.addEventListener(CHAT_APP_SETTINGS_UPDATED_EVENT, sync);
        window.addEventListener(USER_IDENTITIES_UPDATED_EVENT, sync);
        window.addEventListener("settings-bindings-updated", sync);
        return () => { window.removeEventListener(CHAT_APP_SETTINGS_UPDATED_EVENT, sync); window.removeEventListener(USER_IDENTITIES_UPDATED_EVENT, sync); window.removeEventListener("settings-bindings-updated", sync); };
    }, [session?.contactId, session?.userAvatarOverride, session?.isGroup]);
    return avatar;
}
export function useChatCallIdentity(character: Character, session: ChatSession) {
    const read = () => ({ avatar: resolveChatCharacterAvatar(character) || "", name: chatContactDisplayName(character.id, session) });
    const [identity, setIdentity] = useState(read);
    useEffect(() => {
        const sync = () => setIdentity(read()); sync();
        window.addEventListener(CHAT_CHARACTER_PROFILES_UPDATED_EVENT, sync);
        return () => window.removeEventListener(CHAT_CHARACTER_PROFILES_UPDATED_EVENT, sync);
    }, [character, session.alias]);
    return identity;
}
export function useGlobalCallAppearance() {
    const [value, setValue] = useState(() => loadChatAppSettings().globalUserCallAppearance || "");
    useEffect(() => { const sync = () => setValue(loadChatAppSettings().globalUserCallAppearance || ""); window.addEventListener(CHAT_APP_SETTINGS_UPDATED_EVENT, sync); return () => window.removeEventListener(CHAT_APP_SETTINGS_UPDATED_EVENT, sync); }, []);
    return value;
}
