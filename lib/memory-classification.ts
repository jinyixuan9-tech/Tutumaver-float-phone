import type { NativeTimelineEntry } from "./short-term-assembler";
export function isSharedMemoryEvent(e: NativeTimelineEntry): boolean {
    return e.shared === true || (e.sourceApp === "moments" && e.postAuthorType === "user")
        || (e.sourceApp === "chat" && e.sourceDetail === "group")
        || e.sourceDetail === "interview_shared_issue" || e.sourceDetail === "worldline_shared_event";
}
export function timelineEntryKey(e: NativeTimelineEntry): string { return `${e.sourceApp}:${e.sourceDetail || ""}:${e.groupSessionId || ""}:${e.id}`; }
