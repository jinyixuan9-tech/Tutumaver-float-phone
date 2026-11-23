import type { MemoryEntry } from "./memory-types";
import { kvGet, kvSet, registerKvMigration } from "./kv-db";
const KEY = "ai_phone_revoked_memory_sources_v1";
registerKvMigration(KEY);
export type SummarySegment = { sourceKeys: string[]; content: string; occurredFrom?: string; occurredTo?: string };
export function memoryDateLabel(entry: MemoryEntry): string {
    const start = String(entry.metadata?.occurredFrom || "");
    const end = String(entry.metadata?.occurredTo || "");
    return start ? (end && end !== start ? `${start} — ${end}` : start) : String(entry.metadata?.timeSpan || "");
}
export function memoryDateValue(entry: MemoryEntry): string {
    return String(entry.metadata?.occurredFrom || String(entry.metadata?.timeSpan || "").match(/^\d{4}-\d{2}-\d{2}/)?.[0] || "");
}
export function validMemoryDate(value: string): boolean {
    if (!value) return true;
    if (!/^\d{4}-(0[1-9]|1[0-2])(?:-(0[1-9]|[12]\d|3[01]))?$/.test(value)) return false;
    if (value.length === 7) return true;
    const d = new Date(`${value}T12:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}
export function revokedMemoryKeys(): Set<string> {
    try { return new Set(JSON.parse(kvGet(KEY) || "[]")); } catch { return new Set(); }
}
export function revokeMemorySources(keys: string[]): void {
    const all = revokedMemoryKeys(); keys.forEach(key => all.add(key));
    kvSet(KEY, JSON.stringify([...all]));
    if (typeof window !== "undefined") window.dispatchEvent(new Event("memory-sources-updated"));
}
// Preserve unrelated paragraphs when a linked archive is deleted. Legacy mixed summaries
// have no provenance: keep them and flag them for manual correction rather than guessing.
export function projectMemoryEntry(entry: MemoryEntry): MemoryEntry | null {
    const revoked = revokedMemoryKeys();
    const segments = entry.metadata?.summarySegments as SummarySegment[] | undefined;
    if (!Array.isArray(segments)) return entry;
    const kept = segments.filter(s => !s.sourceKeys.some(key => revoked.has(key)));
    if (kept.length === segments.length) return entry;
    if (!kept.length) return null;
    return { ...entry, content: kept.map(s => s.content).join("\n\n"), embedding: undefined,
        metadata: { ...entry.metadata, summarySegments: kept, sourceRevoked: true,
            occurredFrom: kept.map(s => s.occurredFrom).filter(Boolean).sort()[0] || entry.metadata?.occurredFrom,
            occurredTo: kept.map(s => s.occurredTo || s.occurredFrom).filter(Boolean).sort().at(-1) || entry.metadata?.occurredTo } };
}
export function memoryHasRevocableSources(entry: MemoryEntry): boolean {
    const segments = entry.metadata?.summarySegments as SummarySegment[] | undefined;
    return Boolean(segments?.some(s => s.sourceKeys.some(k => /^(xhs:|twitter:|phone:|interview:|wvs:|diary:)/.test(k))));
}

export function memoryOccurredDay(timestamp: string): string {
    const d = new Date(timestamp);
    if (Number.isNaN(d.getTime())) return timestamp.slice(0,10);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
