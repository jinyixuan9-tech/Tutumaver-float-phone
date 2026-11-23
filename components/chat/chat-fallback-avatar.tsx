"use client";

export const CHAT_FALLBACK_AVATAR_SRC = "https://imgbed.heliar.top/i/gEbyUFeslapYCQSd_kakao%E9%BB%98%E8%AE%A4.png";

export function ChatFallbackAvatar({ alt = "", className = "" }: { alt?: string; className?: string }) {
    return (
        <img
            src={CHAT_FALLBACK_AVATAR_SRC}
            alt={alt}
            draggable={false}
            className={`feed-default-avatar w-full h-full object-cover ${className}`.trim()}
        />
    );
}
