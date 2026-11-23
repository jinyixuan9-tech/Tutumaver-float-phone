import { memoryDateLabel, memoryDateValue } from "./memory-event-meta";
// lib/memory-service.ts
// High-level memory orchestration: retrieve long-term memories for prompt injection.

import type { MemoryConfig, MemoryEntry } from "./memory-types";
import { loadMemoryEntriesByType } from "./memory-storage";
import { resolveAuxiliaryApiConfig } from "./settings-storage";
import { generateEmbedding, resolveEmbeddingModel, cosineSimilarity } from "./memory-embedding";
import { estimateTokens } from "./token-counter";

/**
 * Retrieve relevant long-term memories for prompt injection.
 * Strategy:
 *   1. Total tokens <= longTermTokenBudget → return all
 *   2. Over budget + embedding API configured → vector-rank, fill until budget
 *   3. Over budget + no embedding → time-sorted (newest first), fill until budget
 * Embedding API is resolved from auxiliary binding (global, not per-character).
 */
export async function retrieveMemoriesForPrompt(
    characterId: string,
    currentContext: string,
    config: MemoryConfig,
    options?: { beforeTimestamp?: string },
): Promise<MemoryEntry[]> {
    const longTermEntries = (await loadMemoryEntriesByType(characterId, "long_term")).filter(e => memoryAvailableAt(e, options?.beforeTimestamp));
    if (longTermEntries.length === 0 || !currentContext.trim()) return [];

    const budget = config.longTermTokenBudget;

    // Calculate total tokens for all entries
    const dated = (entries: MemoryEntry[]) => [...entries].sort((a,b) => (memoryDateValue(a) || a.createdAt).localeCompare(memoryDateValue(b) || b.createdAt));
    let totalTokens = 0;
    for (const entry of longTermEntries) {
        totalTokens += estimateTokens(`${memoryDateLabel(entry)} ${entry.content}`) + 10;
    }

    // Strategy 1: all fit within budget → return all
    if (totalTokens <= budget) {
        return dated(longTermEntries);
    }

    // Rank by meaning plus literal names/phrases; undated/old unembedded entries remain candidates.
    const needle = currentContext.split("近期背景：")[0].replace(/^本轮用户问题：/, "").trim().toLowerCase();
    const terms = [...new Set(needle.match(/[a-z0-9_]{2,}|[\u3400-\u9fff]{2,}/g) || [])];
    const grams = terms.flatMap(t => /[\u3400-\u9fff]/.test(t) ? Array.from({length: Math.max(0,t.length-1)},(_,i) => t.slice(i,i+2)) : [t]);
    const dateHints = [...needle.matchAll(/(20\d{2})[-年](\d{1,2})(?:[-月](\d{1,2}))?/g)].map(m => `${m[1]}-${m[2].padStart(2,"0")}${m[3] ? `-${m[3].padStart(2,"0")}` : ""}`);
    const lexical = (entry: MemoryEntry) => {
        const text = `${memoryDateLabel(entry)} ${entry.content}`.toLowerCase();
        const hits = grams.filter(t => text.includes(t)).length;
        const from = String(entry.metadata?.occurredFrom || "");
        const to = String(entry.metadata?.occurredTo || from);
        const dateHit = dateHints.some(h => from && (from.startsWith(h) || (from <= h && to >= h)));
        return hits / Math.max(1, grams.length) + (dateHit ? 1 : 0);
    };
    const embeddingApiConfig = config.vectorRecallEnabled ? resolveAuxiliaryApiConfig("embeddingApiConfigId") : null;
    const model = embeddingApiConfig ? resolveEmbeddingModel(embeddingApiConfig) : null;
    let query: number[] | null = null;
    if (embeddingApiConfig && model) {
        try { query = await generateEmbedding(currentContext.includes("本轮用户问题：") ? currentContext.split("近期背景：")[0] : currentContext, embeddingApiConfig); } catch { /* literal fallback */ }
    }
    const scored = longTermEntries.map(entry => {
        const compatible = query && entry.embedding?.length === query.length && (!entry.metadata?.embeddingModel || entry.metadata.embeddingModel === model);
        const semantic = compatible ? Math.max(0, cosineSimilarity(query!, entry.embedding!)) : 0;
        return { entry, score: semantic + lexical(entry) * 1.25 };
    });
    scored.sort((a,b) => b.score - a.score || b.entry.createdAt.localeCompare(a.entry.createdAt));
    return dated(fillByBudget(scored.map(s => s.entry), budget));
}

export async function retrieveCoreMemoriesForPrompt(
    characterId: string,
    config: MemoryConfig,
    options?: { beforeTimestamp?: string },
): Promise<MemoryEntry[]> {
    const coreEntries = (await loadMemoryEntriesByType(characterId, "core")).filter(e => memoryAvailableAt(e, options?.beforeTimestamp));
    if (coreEntries.length === 0) return [];

    const sorted = [...coreEntries].sort((a, b) => {
        const aActive = a.metadata?.active ? 1 : 0;
        const bActive = b.metadata?.active ? 1 : 0;
        if (aActive !== bActive) return bActive - aActive;
        const aDate = String(a.metadata?.eventDate ?? a.updatedAt ?? a.createdAt);
        const bDate = String(b.metadata?.eventDate ?? b.updatedAt ?? b.createdAt);
        return bDate.localeCompare(aDate);
    });

    return fillByBudget(sorted, config.coreMemoryTokenBudget);
}

/** Pick entries in order until token budget is exhausted. */
function fillByBudget(entries: MemoryEntry[], budget: number): MemoryEntry[] {
    const result: MemoryEntry[] = [];
    let used = 0;
    for (const entry of entries) {
        const tokens = estimateTokens(`${memoryDateLabel(entry)} ${entry.content}`) + 10;
        if (used + tokens > budget) continue;
        result.push(entry);
        used += tokens;
    }
    return result;
}

// Summaries written later may contain later knowledge even if their first fact is old.
function memoryAvailableAt(entry: MemoryEntry, before?: string): boolean {
    if (!before) return true;
    return entry.createdAt <= before && (entry.updatedAt || entry.createdAt) <= before
        && String(entry.metadata?.occurredTo || entry.metadata?.occurredFrom || "") <= before;
}
