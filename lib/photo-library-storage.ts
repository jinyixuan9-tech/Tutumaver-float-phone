import { photoLeavingStack, photoStackCover } from "./photo-story-data";
import { kvGet, kvSet, registerKvMigration } from "./kv-db";
import type {
  CharacterCurrentTraits,
  PhotoAppearance,
  PhotoAlbum,
  PhotoLibraryPreferences,
  PhotoLibraryState,
  PhotoPersonSlot,
  PhotoRecord,
  PhotoSourceStrategy,
} from "./photo-library-types";

export const PHOTO_LIBRARY_STORAGE_KEY = "ai_phone_photo_library_v1";
export const PHOTO_LIBRARY_UPDATED_EVENT = "photo-library-updated";

registerKvMigration(PHOTO_LIBRARY_STORAGE_KEY);

export const DEFAULT_PHOTO_LIBRARY_PREFERENCES: PhotoLibraryPreferences = {
  mediaStrategy: "album_then_generated",
  chatStrategy: "album_then_generated",
  momentsStrategy: "album_then_generated",
  resolverDebug: false,
  enabledCharacterIds: [],
  enabledOfficialIds: [],
  enabledAlternateIds: [],
  importedStrategy: "album_then_generated",
};

const EMPTY_STATE: PhotoLibraryState = {
  version: 2,
  photos: [],
  albums: [],
  currentTraitsByCharacter: {},
  preferences: DEFAULT_PHOTO_LIBRARY_PREFERENCES,
};

function uniqueStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)));
}

function cleanOptional(value: unknown, max = 600): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.trim().slice(0, max);
  return text || undefined;
}

function normalizeAppearance(value: unknown): PhotoAppearance | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  const result: PhotoAppearance = {
    hair: cleanOptional(raw.hair, 160),
    accessories: cleanOptional(raw.accessories, 220),
    outfit: cleanOptional(raw.outfit, 260),
    season: cleanOptional(raw.season, 100),
    scene: cleanOptional(raw.scene, 220),
  };
  return Object.values(result).some(Boolean) ? result : undefined;
}

function normalizePeople(value: unknown): PhotoPersonSlot[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item, index) => {
    if (!item || typeof item !== "object") return [];
    const raw = item as Record<string, unknown>;
    const appearance = normalizeAppearance(raw.appearance) ?? {};
    return [{
      id: cleanOptional(raw.id, 80) || `person_${index + 1}`,
      position: cleanOptional(raw.position, 100),
      mappedCharacterId: cleanOptional(raw.mappedCharacterId, 180),
      appearance,
    }];
  });
}

function normalizeUsageHistory(value: unknown): PhotoRecord["usageHistory"] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as Record<string, unknown>;
    const channel = item.channel;
    if (!["dm_user", "moments", "dm_char", "bubble", "sms", "wvs", "other", "wvs_artist", "wvs_official", "twitter_main", "twitter_alt"].includes(String(channel))) return [];
    if (typeof item.characterId !== "string" || !item.characterId) return [];
    const usedAt = typeof item.usedAt === "number" && Number.isFinite(item.usedAt) ? item.usedAt : Date.now();
    return [{
      channel: channel as PhotoRecord["usageHistory"][number]["channel"],
      characterId: item.characterId,
      targetId: typeof item.targetId === "string" && item.targetId ? item.targetId : undefined,
      accountId: typeof item.accountId === "string" && item.accountId ? item.accountId : undefined,
      usedAt,
    }];
  });
}

function normalizeStrategy(value: unknown): PhotoSourceStrategy {
  return value === "album_only" || value === "generated_only" || value === "album_then_generated"
    ? value
    : "album_then_generated";
}

function normalizePhoto(raw: unknown): PhotoRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Record<string, unknown>;
  if (typeof item.id !== "string" || !item.id) return null;
  if (typeof item.assetId !== "string" || !item.assetId) return null;

  const createdAt = typeof item.createdAt === "number" && Number.isFinite(item.createdAt) ? item.createdAt : Date.now();
  const updatedAt = typeof item.updatedAt === "number" && Number.isFinite(item.updatedAt) ? item.updatedAt : createdAt;
  const visionStatus = item.visionStatus === "pending" || item.visionStatus === "done" || item.visionStatus === "failed"
    ? item.visionStatus
    : "unprocessed";

  // v0.2.0 旧字段兼容：sceneTags / visionTags / shotType 会折叠进新的简洁信息结构。
  const legacyScene = uniqueStrings(item.sceneTags).join("、");
  const legacyShot = typeof item.shotType === "string" ? item.shotType : "";
  const appearance = normalizeAppearance(item.appearance) ?? (legacyScene || legacyShot ? {
    scene: legacyScene || undefined,
    outfit: legacyShot === "selfie" ? "自拍" : undefined,
  } : undefined);

  return {
    id: item.id,
    assetId: item.assetId,
    originalName: cleanOptional(item.originalName, 260),
    displayName: cleanOptional(item.displayName, 120),
    sourceUrl: cleanOptional(item.sourceUrl, 4096),
    linkedCharacterIds: uniqueStrings(item.linkedCharacterIds),
    sharedPairIds: uniqueStrings(item.sharedPairIds),
    aiUsable: item.aiUsable !== false,
    visionStatus,
    visionSummary: cleanOptional(item.visionSummary, 900),
    subject: cleanOptional(item.subject, 180),
    appearance,
    people: normalizePeople(item.people),
    visionTags: uniqueStrings(item.visionTags),
    visionError: cleanOptional(item.visionError, 500),
    manualFields: uniqueStrings(item.manualFields),
    usageHistory: normalizeUsageHistory(item.usageHistory),
    origin: item.origin === "generated" ? "generated" : "upload",
    generatedByCharacterId: cleanOptional(item.generatedByCharacterId, 180),
    generationPrompt: cleanOptional(item.generationPrompt, 32000),
    sourceAppId: cleanOptional(item.sourceAppId, 60),
    sourceAccountId: cleanOptional(item.sourceAccountId, 180),
    seriesId: cleanOptional(item.seriesId, 120),
    stackId: cleanOptional(item.stackId, 120),
    storyNote: cleanOptional(item.storyNote, 32000),
    stackStoryNote: cleanOptional(item.stackStoryNote, 16000),
    releasedAt: typeof item.releasedAt === "number" && Number.isFinite(item.releasedAt) ? item.releasedAt : undefined,
    createdAt,
    updatedAt,
  };
}

export function generatedPhotoOwner(photo: PhotoRecord): string | undefined {
  if (photo.origin !== "generated") return undefined;
  if (photo.generatedByCharacterId) return photo.generatedByCharacterId;
  if (photo.sourceAccountId?.endsWith(":alt") && photo.sourceAccountId !== "user:alt") return photo.sourceAccountId.slice(0, -4);
  if (photo.linkedCharacterIds.length === 1) return photo.linkedCharacterIds[0];
}

function normalizeCurrentTraits(value: unknown): Record<string, CharacterCurrentTraits> {
  if (!value || typeof value !== "object") return {};
  const result: Record<string, CharacterCurrentTraits> = {};
  for (const [characterId, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    const text = cleanOptional(item.text, 1000) || "";
    const generatedReferencePhotoId = cleanOptional(item.generatedReferencePhotoId, 180);
    if (!text && !generatedReferencePhotoId) continue;
    result[characterId] = {
      text,
      sourcePhotoId: cleanOptional(item.sourcePhotoId, 180),
      generatedReferencePhotoId,
      updatedAt: typeof item.updatedAt === "number" && Number.isFinite(item.updatedAt) ? item.updatedAt : Date.now(),
    };
  }
  return result;
}

function normalizeState(parsed: unknown): PhotoLibraryState {
  const root = parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
  const rawPhotos = Array.isArray(parsed)
    ? parsed
    : Array.isArray(root.photos) ? root.photos : [];
  const rawPreferences = root.preferences && typeof root.preferences === "object"
    ? root.preferences as Record<string, unknown>
    : {};
  const photos = rawPhotos.map(normalizePhoto).filter((photo): photo is PhotoRecord => Boolean(photo));
  const byId = new Map(photos.map(photo => [photo.id, photo]));
  const albumIds = new Set<string>();
  const albums: PhotoAlbum[] = (Array.isArray(root.albums) ? root.albums : []).flatMap(raw => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as Record<string, unknown>;
    const id = cleanOptional(item.id, 180);
    const characterId = cleanOptional(item.characterId, 180);
    const name = cleanOptional(item.name, 80);
    if (!id || !characterId || !name || albumIds.has(id)) return [];
    albumIds.add(id);
    const createdAt = typeof item.createdAt === "number" && Number.isFinite(item.createdAt) ? item.createdAt : Date.now();
    const origin = item.origin === "generated" ? "generated" : undefined;
    const photoIds = uniqueStrings(item.photoIds);
    const updatedAt = typeof item.updatedAt === "number" && Number.isFinite(item.updatedAt) ? item.updatedAt : createdAt;
    return [{ id, characterId, name, origin, photoIds: photoIds.filter(photoId => {
      const photo = byId.get(photoId);
      return photo && (origin === "generated"
        ? generatedPhotoOwner(photo) === characterId
        : photo.origin !== "generated" && photo.linkedCharacterIds.includes(characterId));
    }), createdAt, updatedAt }];
  });
  for (const raw of Array.isArray(root.albums) ? root.albums : []) {
    if (!raw || typeof raw !== "object" || raw.origin === "generated") continue;
    const album = albums.find(row => row.id === raw.id);
    if (!album) continue;
    const photoIds = uniqueStrings(raw.photoIds).filter(id => {
      const photo = byId.get(id);
      return photo && generatedPhotoOwner(photo) === album.characterId;
    });
    const id = `generated_${album.id}`;
    if (photoIds.length && !albumIds.has(id)) albums.push({ ...album, id, origin: "generated", photoIds });
  }
  return {
    version: 2,
    photos,
    albums,
    currentTraitsByCharacter: normalizeCurrentTraits(root.currentTraitsByCharacter),
    preferences: {
      mediaStrategy: normalizeStrategy(rawPreferences.mediaStrategy ?? (rawPreferences.chatStrategy === rawPreferences.momentsStrategy ? rawPreferences.chatStrategy : "album_then_generated")),
      chatStrategy: normalizeStrategy(rawPreferences.chatStrategy ?? rawPreferences.mediaStrategy),
      momentsStrategy: normalizeStrategy(rawPreferences.momentsStrategy ?? rawPreferences.mediaStrategy),
      resolverDebug: rawPreferences.resolverDebug === true,
      enabledCharacterIds: uniqueStrings(rawPreferences.enabledCharacterIds),
      enabledOfficialIds: uniqueStrings(rawPreferences.enabledOfficialIds),
      enabledAlternateIds: uniqueStrings(rawPreferences.enabledAlternateIds),
      importedStrategy: rawPreferences.importedStrategy === "album_only" ? "album_only" : "album_then_generated",
    },
  };
}

function emitUpdated(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(PHOTO_LIBRARY_UPDATED_EVENT));
}

export function createPhotoId(): string {
  return `photo_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function createPhotoSharedPairId(characterIdA: string, characterIdB: string): string {
  const ids = [characterIdA, characterIdB].filter(Boolean).sort();
  if (ids.length !== 2 || ids[0] === ids[1]) return "";
  return ids.map((id) => encodeURIComponent(id)).join("::");
}

export function parsePhotoSharedPairId(pairId: string): [string, string] | null {
  const parts = pairId.split("::");
  if (parts.length !== 2) return null;
  try {
    const a = decodeURIComponent(parts[0]);
    const b = decodeURIComponent(parts[1]);
    if (!a || !b || a === b) return null;
    return [a, b];
  } catch {
    return null;
  }
}

export function loadPhotoLibrary(): PhotoLibraryState {
  if (typeof window === "undefined") return EMPTY_STATE;
  try {
    const raw = kvGet(PHOTO_LIBRARY_STORAGE_KEY);
    if (!raw) return EMPTY_STATE;
    return normalizeState(JSON.parse(raw) as unknown);
  } catch {
    return EMPTY_STATE;
  }
}

export function savePhotoLibrary(state: PhotoLibraryState): PhotoLibraryState {
  const next = normalizeState(state);
  kvSet(PHOTO_LIBRARY_STORAGE_KEY, JSON.stringify(next));
  emitUpdated();
  return next;
}

export function appendPhotoRecords(records: PhotoRecord[]): PhotoLibraryState {
  const current = loadPhotoLibrary();
  return savePhotoLibrary({ ...current, photos: [...records, ...current.photos] });
}

export function createPhotoAlbum(characterId: string, name: string, photoIds: string[] = [], origin?: PhotoAlbum["origin"]): PhotoAlbum | null {
  const cleaned = name.trim().slice(0, 80);
  if (!characterId || !cleaned) return null;
  const current = loadPhotoLibrary();
  const now = Date.now();
  const album: PhotoAlbum = { id: `album_${now}_${Math.random().toString(36).slice(2, 9)}`, characterId, name: cleaned, origin, photoIds, createdAt: now, updatedAt: now };
  return savePhotoLibrary({ ...current, albums: [...current.albums, album] }).albums.find(item => item.id === album.id) ?? null;
}

export function renamePhotoAlbum(albumId: string, name: string): void {
  const cleaned = name.trim().slice(0, 80);
  if (!cleaned) return;
  const current = loadPhotoLibrary();
  savePhotoLibrary({ ...current, albums: current.albums.map(album => album.id === albumId ? { ...album, name: cleaned, updatedAt: Date.now() } : album) });
}

export function removePhotoAlbum(albumId: string): void {
  const current = loadPhotoLibrary();
  savePhotoLibrary({ ...current, albums: current.albums.filter(album => album.id !== albumId) });
}

export function setPhotoAlbumMembership(albumId: string, photoIds: string[], included: boolean): void {
  const current = loadPhotoLibrary();
  const ids = new Set(photoIds);
  savePhotoLibrary({ ...current, albums: current.albums.map(album => album.id === albumId ? { ...album,
    photoIds: included ? [...new Set([...album.photoIds, ...photoIds])] : album.photoIds.filter(id => !ids.has(id)), updatedAt: Date.now() } : album) });
}

export function updatePhotoRecord(photoId: string, patch: Partial<PhotoRecord>): PhotoRecord | null {
  const current = loadPhotoLibrary();
  let updated: PhotoRecord | null = null;
  const photos = current.photos.map((photo) => {
    if (photo.id !== photoId) {
      const target = current.photos.find(item => item.id === photoId);
      if (target && Object.prototype.hasOwnProperty.call(patch, "seriesId") && photoStackCover(photo, current.photos).id === photoStackCover(target, current.photos).id) {
        return { ...photo, seriesId: patch.seriesId?.trim() || undefined, updatedAt: Date.now() };
      }
      return photo;
    }
    updated = normalizePhoto({ ...photo, ...patch, id: photo.id, assetId: photo.assetId, updatedAt: Date.now() });
    return updated ?? photo;
  });
  savePhotoLibrary({ ...current, photos });
  return updated;
}

export function updatePhotoRecords(records: PhotoRecord[]): PhotoLibraryState {
  if (records.length === 0) return loadPhotoLibrary();
  const byId = new Map(records.map((record) => [record.id, record]));
  const current = loadPhotoLibrary();
  return savePhotoLibrary({
    ...current,
    photos: current.photos.map((photo) => byId.get(photo.id) ?? photo),
  });
}

/** Delete an explicit selection atomically; an unselected stack child is kept. */
export function removePhotoRecords(photoIds: string[]): PhotoRecord[] {
  const current = loadPhotoLibrary();
  const ids = new Set(photoIds);
  const removed = current.photos.filter(photo => ids.has(photo.id));
  if (!removed.length) return [];
  const traits = { ...current.currentTraitsByCharacter };
  for (const [characterId, value] of Object.entries(traits)) {
    if ((value.sourcePhotoId && ids.has(value.sourcePhotoId)) || (value.generatedReferencePhotoId && ids.has(value.generatedReferencePhotoId))) {
      traits[characterId] = {
        ...value,
        sourcePhotoId: value.sourcePhotoId && ids.has(value.sourcePhotoId) ? undefined : value.sourcePhotoId,
        generatedReferencePhotoId: value.generatedReferencePhotoId && ids.has(value.generatedReferencePhotoId) ? undefined : value.generatedReferencePhotoId,
      };
    }
  }
  savePhotoLibrary({ ...current,
    photos: current.photos.filter(photo => !ids.has(photo.id)).map(photo => ids.has(photoStackCover(photo, current.photos).id)
      ? { ...photoLeavingStack(photo, current.photos), updatedAt: Date.now() } : photo),
    albums: current.albums.map(album => ({ ...album, photoIds: album.photoIds.filter(id => !ids.has(id)) })),
    currentTraitsByCharacter: traits,
  });
  return removed;
}

export function removePhotoRecord(photoId: string): PhotoRecord | null {
  return removePhotoRecords([photoId])[0] || null;
}

export function setCharacterCurrentTraits(characterId: string, text: string, sourcePhotoId?: string): void {
  const current = loadPhotoLibrary();
  const next = { ...current.currentTraitsByCharacter };
  const cleaned = text.trim();
  const previous = current.currentTraitsByCharacter[characterId];
  if (!cleaned && !previous?.generatedReferencePhotoId) delete next[characterId];
  else {
    next[characterId] = {
      text: cleaned.slice(0, 1000),
      sourcePhotoId: sourcePhotoId !== undefined ? sourcePhotoId : previous?.sourcePhotoId,
      generatedReferencePhotoId: previous?.generatedReferencePhotoId,
      updatedAt: Date.now(),
    };
  }
  savePhotoLibrary({ ...current, currentTraitsByCharacter: next });
}

export function setGeneratedPhotoReference(characterId: string, photoId?: string): void {
  const current = loadPhotoLibrary();
  const photo = current.photos.find(item => item.id === photoId);
  if (photoId && (!photo || generatedPhotoOwner(photo) !== characterId)) return;
  const previous = current.currentTraitsByCharacter[characterId];
  savePhotoLibrary({ ...current, currentTraitsByCharacter: {
    ...current.currentTraitsByCharacter,
    [characterId]: { ...previous, text: previous?.text || "", generatedReferencePhotoId: photoId, updatedAt: Date.now() },
  } });
}

export function setPhotoLibraryPreferences(patch: Partial<PhotoLibraryPreferences>): void {
  const current = loadPhotoLibrary();
  savePhotoLibrary({
    ...current,
    preferences: {
      mediaStrategy: normalizeStrategy(patch.mediaStrategy ?? current.preferences.mediaStrategy),
      chatStrategy: normalizeStrategy(patch.chatStrategy ?? patch.mediaStrategy ?? current.preferences.chatStrategy),
      momentsStrategy: normalizeStrategy(patch.momentsStrategy ?? patch.mediaStrategy ?? current.preferences.momentsStrategy),
      resolverDebug: patch.resolverDebug ?? current.preferences.resolverDebug,
      enabledCharacterIds: uniqueStrings(patch.enabledCharacterIds ?? current.preferences.enabledCharacterIds),
      enabledOfficialIds: uniqueStrings(patch.enabledOfficialIds ?? current.preferences.enabledOfficialIds),
      enabledAlternateIds: uniqueStrings(patch.enabledAlternateIds ?? current.preferences.enabledAlternateIds),
      importedStrategy: patch.importedStrategy === "album_only" ? "album_only" : patch.importedStrategy === "album_then_generated" ? "album_then_generated" : current.preferences.importedStrategy,
    },
  });
}

export function appendPhotoUsage(photoId: string, usage: PhotoRecord["usageHistory"][number]): void {
  const current = loadPhotoLibrary();
  const photo = current.photos.find((item) => item.id === photoId);
  if (!photo) return;
  updatePhotoRecord(photoId, { usageHistory: [...photo.usageHistory, usage].slice(-120) });
}
