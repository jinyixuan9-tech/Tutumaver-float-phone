import { photoLeavingStack, photoStackCover } from "./photo-story-data";
import type { PhotoRecord } from "./photo-library-types";

/** Move selected photos and any children of selected covers together, without nested stacks. */
export function arrangePhotoStack(photos: PhotoRecord[], selectedIds: string[], targetId?: string): PhotoRecord[] {
  const byId = new Map(photos.map(photo => [photo.id, photo]));
  const selected = new Set(selectedIds.filter(id => byId.has(id)));
  let coverId = targetId || [...selected][0];
  if (!coverId || !byId.has(coverId)) return [];
  if (targetId) {
    const visited = new Set<string>();
    while (byId.get(coverId)?.stackId && !visited.has(coverId)) {
      visited.add(coverId);
      const parent = byId.get(coverId)!.stackId!;
      if (!byId.has(parent) || parent === coverId) break;
      coverId = parent;
    }
  }
  let grew = true;
  while (grew) {
    grew = false;
    for (const photo of photos) if (photo.stackId && selected.has(photo.stackId) && !selected.has(photo.id)) {
      selected.add(photo.id);
      grew = true;
    }
  }
  selected.add(coverId);
  for (const photo of photos) if (photoStackCover(photo, photos).id === coverId) selected.add(photo.id);
  if (selected.size < 2) return [];
  const now = Date.now();
  return photos.filter(photo => selected.has(photo.id)).map(photo => ({
    ...(photoStackCover(photo, photos).id !== coverId ? photoLeavingStack(photo, photos) : photo),
    seriesId: byId.get(coverId)?.seriesId?.trim() || undefined,
    stackId: photo.id === coverId ? undefined : coverId,
    updatedAt: now,
  }));
}

export function parsePhotoTags(text: string): string[] {
  return [...new Set(text.split(/[、,，\n\r]+/).map(tag => tag.trim()).filter(Boolean))];
}
