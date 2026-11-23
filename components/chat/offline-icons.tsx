import type { SVGProps } from "react";
export function OfflineIcon({ kind, ...props }: SVGProps<SVGSVGElement> & { kind: "online" | "dialogue" | "send" }) {
    return <svg viewBox="0 0 32 32" width="26" height="26" aria-hidden="true" {...props}>
        {kind === "online" ? <path fill="currentColor" fillRule="evenodd" d="M6 5h20a3 3 0 0 1 3 3v15a3 3 0 0 1-3 3H11l-8 6V8a3 3 0 0 1 3-3Zm3 9v3h3v-3H9Zm6 0v3h3v-3h-3Zm6 0v3h3v-3h-3Z" /> : kind === "dialogue" ? <path d="m12 12 8-8a6.4 6.4 0 0 1 9 9L15 27A8.5 8.5 0 0 1 3 15L17 1M10 19l12-12a2.5 2.5 0 0 1 3.5 3.5l-12 12a4 4 0 0 1-5.7-5.7" transform="translate(2 3) scale(.84)" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /> : <><circle cx="16" cy="16" r="14" fill="currentColor" /><path d="m9 16 5 6 9-13" fill="none" stroke="var(--offline-check-ink, #fff)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></>}
    </svg>;
}
