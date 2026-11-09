"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  MoreHorizontal,
  ChevronLeft,
  Image as ImageIcon,
  Images,
  Link2,
  Loader2,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  Users,
  X,
} from "lucide-react";

import { CHARACTERS_UPDATED_EVENT, loadCharacters } from "@/lib/character-storage";
import { loadChatMessages, loadChatSessions } from "@/lib/chat-storage";
import { loadMomentPosts } from "@/lib/moments-storage";
import type { Character } from "@/lib/character-types";
import { getChatImageFromIndexedDB, saveChatImageToIndexedDB } from "@/lib/chat-asset-storage";
import { deleteThemeAsset, describeAssetSaveError } from "@/lib/theme-storage";
import type { PhotoAppearance, PhotoPersonSlot, PhotoRecord, PhotoSourceStrategy } from "@/lib/photo-library-types";
import {
  PHOTO_LIBRARY_UPDATED_EVENT,
  appendPhotoRecords,
  createPhotoId,
  createPhotoSharedPairId,
  generatedPhotoOwner,
  loadPhotoLibrary,
  parsePhotoSharedPairId,
  removePhotoRecord,
  removePhotoRecords,
  setCharacterCurrentTraits,
  setGeneratedPhotoReference,
  setPhotoLibraryPreferences,
  updatePhotoRecord,
  updatePhotoRecords,
} from "@/lib/photo-library-storage";
import { analyzePhotos, analyzePhotosInBackground, photoTraitsTextForCharacter } from "@/lib/photo-library-vision";
import { photoUsageLabel } from "@/lib/photo-library-usage";
import { loadWeverseState, upsertWeverseCommunity } from "@/lib/weverse-storage";
import { loadTwitterState, saveTwitterState } from "@/lib/twitter-storage";
import { arrangePhotoStack } from "@/lib/photo-stack-utils";
import { PhotoStackSheet } from "./photo-stack-sheet";
import { photoLeavingStack, photoStackCover } from "@/lib/photo-story-data";
import { PhotoStoryEditor } from "./photo-story-editor";
import { PhotoTagEditor } from "./photo-tag-editor";
import { PhotoAlbumSheet } from "./photo-album-sheet";
import { PhotoUrlSheet } from "./photo-url-sheet";
import { setPhotoAlbumMembership } from "@/lib/photo-library-storage";

type Props = {
  onClose: () => void;
  onNotice?: (message: string) => void;
};

type MainTab = "library" | "people" | "shared" | "pools";
type AlbumScope =
  | { type: "character"; characterId: string }
  | { type: "generated"; characterId: string | null }
  | { type: "shared"; pairId: string }
  | { type: "official"; accountId: string }
  | { type: "alternate"; accountId: string }
  | null;

type UploadDraft = {
  files: File[];
  previewUrls: string[];
  linkedCharacterIds: string[];
  aiUsable: boolean;
  shared: boolean;
  accountId?: string;
  accountType?: "official" | "alternate";
  albumId?: string;
  sourceUrls?: (string | undefined)[];
};

function sortPhotos(photos: PhotoRecord[]): PhotoRecord[] {
  return [...photos].sort((a, b) => b.createdAt - a.createdAt);
}

function formatPhotoDate(timestamp: number): string {
  try {
    return new Intl.DateTimeFormat("zh-CN", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(timestamp));
  } catch {
    return "";
  }
}

function initials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  return trimmed.slice(0, 1).toUpperCase();
}

function CharacterAvatar({ character, size = 28 }: { character: Character; size?: number }) {
  return (
    <span className="photos-character-avatar" style={{ width: size, height: size }} aria-hidden>
      {character.avatar ? <img src={character.avatar} alt="" /> : <span>{initials(character.name)}</span>}
    </span>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (next: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      className={`photos-switch${checked ? " is-on" : ""}`}
      onClick={() => onChange(!checked)}
      role="switch"
      aria-checked={checked}
      aria-label={label}
    >
      <span />
    </button>
  );
}

export function PhotosApp({ onClose, onNotice }: Props) {
  const [characters, setCharacters] = useState<Character[]>(() => loadCharacters());
  const [officialAccounts, setOfficialAccounts] = useState(() => loadWeverseState().communities);
  const [alternateAccounts, setAlternateAccounts] = useState(() => Object.entries(loadTwitterState().accounts).filter(([id, profile]) => id.endsWith(":alt") && profile.disclosure !== "full"));
  const initialLibrary = useMemo(() => loadPhotoLibrary(), []);
  const [photos, setPhotos] = useState<PhotoRecord[]>(() => sortPhotos(initialLibrary.photos));
  const [albums, setAlbums] = useState(initialLibrary.albums);
  const [selectedAlbumId, setSelectedAlbumId] = useState<string | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [albumSheet, setAlbumSheet] = useState<{ characterId: string; photoIds: string[]; origin?: "generated"; mode?: "create" | "manage" } | null>(null);
  const [stackPickerIds, setStackPickerIds] = useState<string[] | null>(null);
  const hold = useRef<{ timer?: ReturnType<typeof setTimeout>; x: number; y: number; consumed: boolean }>({ x: 0, y: 0, consumed: false });
  const [dragId,setDragId]=useState<string|null>(null),[dropId,setDropId]=useState<string|null>(null);
  const dragRef=useRef<string|null>(null), dropRef=useRef<string|null>(null);
  const [importMenu, setImportMenu] = useState(false);
  const [urlSheet, setUrlSheet] = useState(false);
  const [currentTraitsByCharacter, setCurrentTraitsByCharacter] = useState(initialLibrary.currentTraitsByCharacter);
  const [preferences, setPreferences] = useState(initialLibrary.preferences);
  const [imageMap, setImageMap] = useState<Record<string, string>>({});
  const [tab, setTab] = useState<MainTab>("library");
  const [scope, setScope] = useState<AlbumScope>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [photoName, setPhotoName] = useState("");
  const [expandedStackId, setExpandedStackId] = useState<string | null>(null);
  const [uploadDraft, setUploadDraft] = useState<UploadDraft | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const uploadDraftRef = useRef<UploadDraft | null>(null);

  const detailPhoto = detailId ? photos.find((photo) => photo.id === detailId) ?? null : null;
  useEffect(() => {
    if (detailPhoto?.origin !== "generated" || detailPhoto.generationPrompt) return;
    let prompt = detailPhoto.sourceAppId === "moments"
      ? loadMomentPosts().find(post => post.photoLibraryId === detailPhoto.id && post.photoGenerationPrompt)?.photoGenerationPrompt
      : undefined;
    if (detailPhoto.sourceAppId === "chat") {
      for (const session of loadChatSessions()) {
        prompt = loadChatMessages(session.id).find(message => message.mediaData?.photoLibraryId === detailPhoto.id
          && message.mediaData.imageGenerationPrompt)?.mediaData?.imageGenerationPrompt;
        if (prompt) break;
      }
    }
    if (prompt) updatePhotoRecord(detailPhoto.id, { generationPrompt: prompt });
  }, [detailPhoto]);
  useEffect(() => { setPhotoName(detailPhoto?.displayName || ""); }, [detailId]);
  const characterById = useMemo(() => new Map(characters.map((character) => [character.id, character])), [characters]);

  const refreshLibrary = () => {
    const state = loadPhotoLibrary();
    setPhotos(sortPhotos(state.photos));
    setAlbums(state.albums);
    setCurrentTraitsByCharacter(state.currentTraitsByCharacter);
    setPreferences(state.preferences);
    setOfficialAccounts(loadWeverseState().communities);
    setAlternateAccounts(Object.entries(loadTwitterState().accounts).filter(([id, profile]) => id.endsWith(":alt") && profile.disclosure !== "full"));
  };

  useEffect(() => {
    const refreshCharacters = () => setCharacters(loadCharacters());
    const refreshPhotos = () => refreshLibrary();
    window.addEventListener(CHARACTERS_UPDATED_EVENT, refreshCharacters);
    window.addEventListener(PHOTO_LIBRARY_UPDATED_EVENT, refreshPhotos);
    return () => {
      window.removeEventListener(CHARACTERS_UPDATED_EVENT, refreshCharacters);
      window.removeEventListener(PHOTO_LIBRARY_UPDATED_EVENT, refreshPhotos);
    };
  }, []);

  useEffect(() => {
    const pendingIds = loadPhotoLibrary().photos
      .filter((photo) => photo.visionStatus === "unprocessed")
      .map((photo) => photo.id);
    if (pendingIds.length > 0) analyzePhotosInBackground(pendingIds);
  }, []);

  useEffect(() => {
    let canceled = false;
    const missing = photos.filter((photo) => !imageMap[photo.assetId]);
    if (missing.length === 0) return;
    void Promise.all(missing.map(async (photo) => {
      const dataUrl = await getChatImageFromIndexedDB(photo.assetId).catch(() => null);
      return [photo.assetId, dataUrl] as const;
    })).then((rows) => {
      if (canceled) return;
      const loaded = rows.filter((row): row is readonly [string, string] => Boolean(row[1]));
      if (loaded.length === 0) return;
      setImageMap((prev) => {
        const next = { ...prev };
        loaded.forEach(([assetId, dataUrl]) => {
          next[assetId] = dataUrl;
        });
        return next;
      });
    });
    return () => { canceled = true; };
  }, [photos, imageMap]);

  useEffect(() => {
    uploadDraftRef.current = uploadDraft;
  }, [uploadDraft]);

  useEffect(() => { setExpandedStackId(null); }, [scope, tab]);
  useEffect(() => { setSelectedAlbumId(null); }, [scope]);
  useEffect(() => { setSelecting(false); setSelectedIds([]); setExpandedStackId(null); }, [scope, selectedAlbumId, tab]);
  useEffect(() => {
    if (selectedAlbumId && !["all", "unfiled"].includes(selectedAlbumId) && !albums.some(album => album.id === selectedAlbumId)) setSelectedAlbumId(null);
  }, [albums, selectedAlbumId]);

  useEffect(() => () => {
    uploadDraftRef.current?.previewUrls.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  const albumCharacterId = scope?.type === "character" || scope?.type === "generated" ? scope.characterId : null;
  const albumOrigin = scope?.type === "generated" ? "generated" : undefined;
  const scopedPhotos = useMemo(() => {
    if (!scope) return photos;
    if (scope.type === "character" || scope.type === "generated") {
      const items = photos.filter(photo => scope.type === "generated"
        ? photo.origin === "generated" && (characterById.has(generatedPhotoOwner(photo) || "") ? generatedPhotoOwner(photo) : null) === scope.characterId
        : photo.origin !== "generated" && photo.linkedCharacterIds.includes(scope.characterId));
      const ownAlbums = albums.filter(album => album.characterId === scope.characterId && album.origin === albumOrigin);
      if (selectedAlbumId === "unfiled") return items.filter(photo => !ownAlbums.some(album => album.photoIds.includes(photo.id)));
      if (selectedAlbumId && selectedAlbumId !== "all") return items.filter(photo => ownAlbums.find(album => album.id === selectedAlbumId)?.photoIds.includes(photo.id));
      return items;
    }
    if (scope.type === "official") {
      const account = officialAccounts.find((item) => item.id === scope.accountId);
      return photos.filter((photo) => account?.officialMediaPhotoIds?.includes(photo.id) || photo.sourceAccountId === scope.accountId);
    }
    if (scope.type === "alternate") {
      const ids = loadTwitterState().alternateMediaPhotoIds[scope.accountId] || [];
      return photos.filter((photo) => ids.includes(photo.id) || photo.sourceAccountId === scope.accountId);
    }
    return photos.filter((photo) => photo.sharedPairIds.includes(scope.pairId));
  }, [photos, scope, officialAccounts, albums, selectedAlbumId, characterById, albumOrigin]);

  const generatedAlbums = useMemo(() => {
    const groups = new Map<string | null, PhotoRecord[]>();
    for (const photo of photos) {
      if (photo.origin !== "generated") continue;
      const owner = generatedPhotoOwner(photo);
      const id = owner && characterById.has(owner) ? owner : null;
      const items = groups.get(id) ?? [];
      items.push(photo);
      groups.set(id, items);
    }
    return Array.from(groups, ([id, items]) => ({ id, character: id ? characterById.get(id) : undefined, items, cover: items[0] }));
  }, [photos, characterById]);

  const peopleAlbums = useMemo(() => characters
    .map((character) => {
      const items = photos.filter(photo => photo.origin !== "generated" && photo.linkedCharacterIds.includes(character.id));
      return { character, items, cover: items[0] ?? null };
    })
    .filter((album) => preferences.enabledCharacterIds.includes(album.character.id))
    .sort((a, b) => b.items.length - a.items.length), [characters, photos, preferences.enabledCharacterIds]);

  const sharedAlbums = useMemo(() => {
    const pairIds: string[] = Array.from(new Set<string>(photos.flatMap((photo) => photo.sharedPairIds)));
    return pairIds.flatMap((pairId) => {
      const pair = parsePhotoSharedPairId(pairId);
      if (!pair) return [];
      const first = characterById.get(pair[0]);
      const second = characterById.get(pair[1]);
      if (!first || !second) return [];
      const items = photos.filter((photo) => photo.sharedPairIds.includes(pairId));
      return [{ pairId, first, second, items, cover: items[0] ?? null }];
    }).sort((a, b) => b.items.length - a.items.length);
  }, [photos, characterById]);

  const openPicker = () => {
    if (characters.length === 0 && scope?.type !== "official" && scope?.type !== "alternate") {
      onNotice?.("还没有角色，先创建角色再导入照片。");
      return;
    }
    fileInputRef.current?.click();
  };

  const handleFiles = (filesLike: FileList | File[] | null, sourceUrls: string[] = []) => {
    if (!filesLike?.length) return;
    const selectedFiles = Array.from(filesLike).filter((file) => file.type.startsWith("image/"));
    if (selectedFiles.length === 0) {
      onNotice?.("请选择图片文件。");
      return;
    }
    if (uploadDraft) {
      const existingKeys = new Set(uploadDraft.files.map((file) => `${file.name}:${file.size}:${file.lastModified}`));
      const appendedFiles = selectedFiles.filter((file, index) => sourceUrls[index] ? !uploadDraft.sourceUrls?.includes(sourceUrls[index]) : !existingKeys.has(`${file.name}:${file.size}:${file.lastModified}`));
      if (appendedFiles.length > 0) {
        setUploadDraft({
          ...uploadDraft,
          files: [...uploadDraft.files, ...appendedFiles],
          previewUrls: [...uploadDraft.previewUrls, ...appendedFiles.map((file) => URL.createObjectURL(file))],
          sourceUrls: [...(uploadDraft.sourceUrls || uploadDraft.files.map(() => undefined)), ...appendedFiles.map(file => sourceUrls[selectedFiles.indexOf(file)])],
        });
      }
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    const previewUrls = selectedFiles.map((file) => URL.createObjectURL(file));
    let presetCharacterIds: string[] = [];
    let presetShared = false;
    if (scope?.type === "character") {
      presetCharacterIds = [scope.characterId];
    } else if (scope?.type === "shared") {
      const pair = parsePhotoSharedPairId(scope.pairId);
      if (pair) {
        presetCharacterIds = [...pair];
        presetShared = true;
      }
    }
    setUploadDraft({
      files: selectedFiles,
      previewUrls,
      linkedCharacterIds: presetCharacterIds,
      aiUsable: true,
      shared: presetShared,
      accountId: scope?.type === "official" || scope?.type === "alternate" ? scope.accountId : undefined,
      accountType: scope?.type === "official" || scope?.type === "alternate" ? scope.type : undefined,
      albumId: scope?.type === "character" && albums.some(album => album.id === selectedAlbumId && album.characterId === scope.characterId) ? selectedAlbumId! : undefined,
      sourceUrls: selectedFiles.map(file => sourceUrls[selectedFiles.indexOf(file)]),
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeDraftPhoto = (index: number) => {
    setUploadDraft((draft) => {
      if (!draft || index < 0 || index >= draft.files.length) return draft;
      URL.revokeObjectURL(draft.previewUrls[index]);
      return {
        ...draft,
        files: draft.files.filter((_, itemIndex) => itemIndex !== index),
        previewUrls: draft.previewUrls.filter((_, itemIndex) => itemIndex !== index),
        sourceUrls: draft.sourceUrls?.filter((_, itemIndex) => itemIndex !== index),
      };
    });
  };

  const toggleDraftCharacter = (characterId: string) => {
    setUploadDraft((draft) => {
      if (!draft) return draft;
      const has = draft.linkedCharacterIds.includes(characterId);
      const nextIds = has
        ? draft.linkedCharacterIds.filter((id) => id !== characterId)
        : [...draft.linkedCharacterIds, characterId];
      return {
        ...draft,
        linkedCharacterIds: nextIds,
        shared: nextIds.length === 2 ? draft.shared : false,
        albumId: albums.some(album => album.id === draft.albumId && nextIds.includes(album.characterId)) ? draft.albumId : undefined,
      };
    });
  };

  const importPhotos = async () => {
    if (!uploadDraft || uploading) return;
    if (uploadDraft.files.length === 0) {
      onNotice?.("请先添加照片。");
      return;
    }
    if (uploadDraft.linkedCharacterIds.length === 0 && !uploadDraft.accountId) {
      onNotice?.("至少关联一个角色。");
      return;
    }

    setUploading(true);
    setUploadProgress({ current: 0, total: uploadDraft.files.length });
    const records: PhotoRecord[] = [];
    const failed: string[] = [];
    const now = Date.now();
    const sharedPairId = uploadDraft.shared && uploadDraft.linkedCharacterIds.length === 2
      ? createPhotoSharedPairId(uploadDraft.linkedCharacterIds[0], uploadDraft.linkedCharacterIds[1])
      : "";

    for (let index = 0; index < uploadDraft.files.length; index += 1) {
      const file = uploadDraft.files[index];
      try {
        const assetId = await saveChatImageToIndexedDB(file);
        records.push({
          id: createPhotoId(),
          assetId,
          originalName: file.name || undefined,
          sourceUrl: uploadDraft.sourceUrls?.[index],
          linkedCharacterIds: [...uploadDraft.linkedCharacterIds],
          sharedPairIds: sharedPairId ? [sharedPairId] : [],
          aiUsable: uploadDraft.aiUsable,
          visionStatus: "unprocessed",
          usageHistory: [],
          origin: "upload",
          sourceAccountId: uploadDraft.accountId,
          createdAt: now + index,
          updatedAt: now + index,
        });
      } catch (error) {
        failed.push(`${file.name || `第 ${index + 1} 张`}: ${describeAssetSaveError(error)}`);
      }
      setUploadProgress({ current: index + 1, total: uploadDraft.files.length });
    }

    if (records.length > 0) {
      appendPhotoRecords(records);
      if (uploadDraft.albumId) setPhotoAlbumMembership(uploadDraft.albumId, records.map(record => record.id), true);
      if (uploadDraft.accountType === "official" && uploadDraft.accountId) {
        const community = loadWeverseState().communities.find((item) => item.id === uploadDraft.accountId);
        if (community) upsertWeverseCommunity({ ...community, officialMediaPhotoIds: [...new Set([...(community.officialMediaPhotoIds || []), ...records.map((item) => item.id)])] });
      }
      if (uploadDraft.accountType === "alternate" && uploadDraft.accountId) {
        const state = loadTwitterState();
        saveTwitterState({ ...state, alternateMediaPhotoIds: { ...state.alternateMediaPhotoIds, [uploadDraft.accountId]: [...new Set([...(state.alternateMediaPhotoIds[uploadDraft.accountId] || []), ...records.map((item) => item.id)])] } });
      }
      analyzePhotosInBackground(records.map((record) => record.id));
    }
    uploadDraft.previewUrls.forEach((url) => URL.revokeObjectURL(url));
    setUploadDraft(null);
    setUploading(false);
    setUploadProgress({ current: 0, total: 0 });

    if (failed.length > 0) {
      onNotice?.(`已导入 ${records.length} 张，${failed.length} 张失败。`);
    } else {
      onNotice?.(`已导入 ${records.length} 张照片。`);
    }
  };

  useEffect(() => {
    const stopScroll=(event:TouchEvent)=>{if(dragRef.current && event.cancelable)event.preventDefault();};
    document.addEventListener('touchmove',stopScroll,{passive:false});
    return ()=>{document.removeEventListener('touchmove',stopScroll);clearTimeout(hold.current.timer);};
  }, []);

  function mergeDragged(draggedId:string,targetId:string){
    if(draggedId===targetId)return;
    const changes=arrangePhotoStack(photos,[draggedId],targetId);if(changes.length<2)return;
    const targetCover=photoStackCover(photos.find(p=>p.id===targetId)!,photos);
    updatePhotoRecords(changes.map(p=>({...p,stackId:p.id===draggedId?undefined:draggedId,stackStoryNote:p.id===draggedId?targetCover.stackStoryNote:p.stackStoryNote,seriesId:targetCover.seriesId||p.seriesId})));
  }
  const stackPhotos = (ids: string[], targetId?: string) => {
    const records = arrangePhotoStack(loadPhotoLibrary().photos, ids, targetId);
    if (!records.length) return;
    updatePhotoRecords(records);
    setStackPickerIds(null);
    setSelecting(false);
    setSelectedIds([]);
    setExpandedStackId(null);
    onNotice?.(`已整理为套图，照片内容与使用记录保留。`);
  };

  const openSelectedAlbum = () => {
    const selected = photos.filter(photo => selectedIds.includes(photo.id));
    const common = selected[0]?.linkedCharacterIds.filter(id => selected.every(photo => photo.linkedCharacterIds.includes(id))) || [];
    const characterId = albumCharacterId || (!albumOrigin && common.length === 1 ? common[0] : undefined);
    if (characterId) setAlbumSheet({ characterId, photoIds: selectedIds, origin: albumOrigin });
    else onNotice?.("请进入对应人物相册，再把这些照片加入分类。");
  };

  const deleteSelectedPhotos = async () => {
    const selected = photos.filter(photo => selectedIds.includes(photo.id));
    if (!selected.length || !window.confirm(`从图库删除选中的 ${selected.length} 张照片？只删除勾选照片，未勾选的套图成员会保留。`)) return;
    const removed = removePhotoRecords(selected.map(photo => photo.id));
    setSelectedIds([]);
    setSelecting(false);
    const remainingAssets = new Set(loadPhotoLibrary().photos.map(photo => photo.assetId));
    await Promise.all([...new Set(removed.map(photo => photo.assetId))].filter(id => !remainingAssets.has(id)).map(id => deleteThemeAsset(id).catch(() => {})));
    onNotice?.(`已删除 ${removed.length} 张照片。`);
  };

  const renderSelectionBar = () => selecting ? <div className="photos-selection-bar" role="toolbar" aria-label="整理已选照片">
    <span>已选 {selectedIds.length} 张</span>
    <button type="button" className="photos-danger-btn" disabled={!selectedIds.length} onClick={() => void deleteSelectedPhotos()}>删除</button>
    {(!albumOrigin || albumCharacterId) && <button type="button" disabled={!selectedIds.length} onClick={openSelectedAlbum}>加入相册</button>}
    <button type="button" disabled={!selectedIds.length} onClick={() => setStackPickerIds(selectedIds)}>套图</button>
    {albumCharacterId && albums.some(album => album.id === selectedAlbumId) ? <button type="button" disabled={!selectedIds.length} onClick={() => { setPhotoAlbumMembership(selectedAlbumId!, selectedIds, false); setSelectedIds([]); }}>移出相册</button> : null}
  </div> : null;

  const updateDetail = (patch: Partial<PhotoRecord>) => {
    if (!detailPhoto) return;
    updatePhotoRecord(detailPhoto.id, patch);
  };

  const releaseDetailPhoto = () => {
    if (!detailPhoto) return;
    const updated = updatePhotoRecord(detailPhoto.id, { releasedAt: Date.now() });
    if (updated) onNotice?.("已放出这张照片；它可以重新参与相册匹配，原使用记录仍保留。");
  };

  const unstackDetailPhoto = () => {
    if (!detailPhoto) return;
    if (detailPhoto.stackId) {
      updatePhotoRecord(detailPhoto.id, photoLeavingStack(detailPhoto, photos));
      onNotice?.("已从套图移出，照片会单独显示。");
      return;
    }
    const members = photos.filter((photo) => photo.stackId === detailPhoto.id);
    if (!members.length) return;
    updatePhotoRecords([detailPhoto, ...members].map(photo => ({ ...photoLeavingStack(photo, photos), updatedAt: Date.now() })));
    setExpandedStackId(null);
    onNotice?.(`已拆开套图，${members.length + 1} 张照片会单独显示。`);
  };

  const markManual = (field: string): string[] => Array.from(new Set([...(detailPhoto?.manualFields ?? []), field]));

  const updateDetailManual = (field: string, patch: Partial<PhotoRecord>) => {
    if (!detailPhoto) return;
    updatePhotoRecord(detailPhoto.id, { ...patch, manualFields: markManual(field) });
  };

  const updateAppearanceField = (key: keyof PhotoAppearance, value: string) => {
    if (!detailPhoto) return;
    updateDetailManual("appearance", { appearance: { ...(detailPhoto.appearance ?? {}), [key]: value.trim() || undefined } });
  };

  const updatePersonSlot = (slotId: string, updater: (slot: PhotoPersonSlot) => PhotoPersonSlot) => {
    if (!detailPhoto) return;
    const next = (detailPhoto.people ?? []).map((slot) => slot.id === slotId ? updater(slot) : slot);
    const mapped = next.map((person) => person.mappedCharacterId).filter((id): id is string => Boolean(id));
    updateDetailManual("people", { people: next, linkedCharacterIds: [...new Set([...detailPhoto.linkedCharacterIds, ...mapped])] });
  };

  const reanalyzeDetail = async () => {
    if (!detailPhoto) return;
    await analyzePhotos([detailPhoto.id]);
    onNotice?.("识图已更新；你手动改过的字段会保留。");
  };

  const setTraitsFromPhoto = (characterId: string) => {
    if (!detailPhoto) return;
    const text = photoTraitsTextForCharacter(detailPhoto, characterId);
    if (!text) {
      onNotice?.("这张照片还没有可用的人物特征，先完成识图或手动填写。");
      return;
    }
    setCharacterCurrentTraits(characterId, text, detailPhoto.id);
    onNotice?.(`已用这张照片更新 ${characterById.get(characterId)?.name || "角色"} 的当前特征。`);
  };

  const saveCurrentTraits = (characterId: string, text: string) => {
    setCharacterCurrentTraits(characterId, text);
  };

  const updateStrategy = (value: PhotoSourceStrategy) => {
    setPhotoLibraryPreferences({ importedStrategy: value === "album_only" ? "album_only" : "album_then_generated" });
  };

  const toggleImport = (key: "enabledCharacterIds" | "enabledOfficialIds" | "enabledAlternateIds", id: string) => {
    const selected = preferences[key];
    setPhotoLibraryPreferences({ [key]: selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id] });
  };

  const toggleDetailCharacter = (characterId: string) => {
    if (!detailPhoto) return;
    const has = detailPhoto.linkedCharacterIds.includes(characterId);
    if (has && detailPhoto.linkedCharacterIds.length === 1) {
      onNotice?.("至少保留一个关联角色。");
      return;
    }
    const nextIds = has
      ? detailPhoto.linkedCharacterIds.filter((id) => id !== characterId)
      : [...detailPhoto.linkedCharacterIds, characterId];
    const pairId = nextIds.length === 2 ? createPhotoSharedPairId(nextIds[0], nextIds[1]) : "";
    updateDetail({
      linkedCharacterIds: nextIds,
      sharedPairIds: pairId && detailPhoto.sharedPairIds.includes(pairId) ? [pairId] : [],
    });
  };

  const toggleDetailShared = (next: boolean) => {
    if (!detailPhoto || detailPhoto.linkedCharacterIds.length !== 2) return;
    const pairId = createPhotoSharedPairId(detailPhoto.linkedCharacterIds[0], detailPhoto.linkedCharacterIds[1]);
    updateDetail({ sharedPairIds: next && pairId ? [pairId] : [] });
  };

  const analyzePendingPhotos = async () => {
    const ids = loadPhotoLibrary().photos
      .filter(photo => photo.origin !== "generated" && photo.visionStatus !== "done")
      .map((photo) => photo.id);
    if (ids.length === 0) {
      onNotice?.("没有待识别或失败的照片。");
      return;
    }
    onNotice?.(`开始识别 ${ids.length} 张照片；会按每批最多 4 张依次处理。`);
    await analyzePhotos(ids);
    onNotice?.("批量识图已完成；失败项可以在照片详情里查看并重试。");
  };

  const deleteDetailPhoto = async () => {
    if (!detailPhoto) return;
    const confirmed = window.confirm("删除这张照片？这不会删除角色，只会从 Photos 中移除图片。");
    if (!confirmed) return;
    const removed = removePhotoRecord(detailPhoto.id);
    setDetailId(null);
    if (removed) {
      if (!loadPhotoLibrary().photos.some(photo => photo.assetId === removed.assetId)) await deleteThemeAsset(removed.assetId).catch(() => {});
      setImageMap((prev) => {
        const next = { ...prev };
        delete next[removed.assetId];
        return next;
      });
      onNotice?.("照片已删除。");
    }
  };

  const scopeTitle = (() => {
    if (!scope) return "";
    if (scope.type === "character" || scope.type === "generated") {
      if (selectedAlbumId === "all") return albumOrigin ? "全部生图" : "全部照片";
      if (selectedAlbumId === "unfiled") return "未分类";
      const name = scope.characterId ? characterById.get(scope.characterId)?.name : undefined;
      return albums.find(album => album.id === selectedAlbumId)?.name || (albumOrigin ? (name ? `${name}的生图` : "未归属生图") : name || "角色相册");
    }
    if (scope.type === "official") return officialAccounts.find((item) => item.id === scope.accountId)?.official?.displayName || "Weverse 官号";
    if (scope.type === "alternate") return alternateAccounts.find(([id]) => id === scope.accountId)?.[1].name || "X 副号";
    const pair = parsePhotoSharedPairId(scope.pairId);
    if (!pair) return "共享相册";
    return `${characterById.get(pair[0])?.name || "角色"} & ${characterById.get(pair[1])?.name || "角色"}`;
  })();

  const detailPairId = detailPhoto?.linkedCharacterIds.length === 2
    ? createPhotoSharedPairId(detailPhoto.linkedCharacterIds[0], detailPhoto.linkedCharacterIds[1])
    : "";
  const detailShared = Boolean(detailPairId && detailPhoto?.sharedPairIds.includes(detailPairId));

  const renderPhotoGrid = (items: PhotoRecord[]) => {
    if (items.length === 0) {
      return (
        <div className="photos-empty">
          <span className="photos-empty-icon"><Images size={30} strokeWidth={1.5} /></span>
          <strong>{albumOrigin || (tab === "library" && !scope) ? "还没有生成图片" : "还没有照片"}</strong>
          <p>{albumOrigin ? "已归入这个相册的生图会显示在这里。" : tab === "library" && !scope ? "应用内生成的图片会汇总在这里。" : "在当前相册上传照片。"}</p>
          {!albumOrigin && !(tab === "library" && !scope) && <button type="button" onClick={openPicker}>上传照片</button>}
        </div>
      );
    }
    const visible = expandedStackId || selecting ? items : items.filter((photo) => !photo.stackId || photo.stackId === photo.id || !items.some((candidate) => candidate.id === photo.stackId));
    return (
      <>
      {expandedStackId ? <button type="button" className="photos-stack-back" onClick={() => setExpandedStackId(null)}>‹ 返回套图</button> : null}
      <div className="photos-grid">
        {(expandedStackId ? visible.filter((photo) => photo.id === expandedStackId || photo.stackId === expandedStackId) : visible).map((photo) => {
          const stackCount = items.filter((item) => item.stackId === photo.id).length;
          const used = photo.usageHistory.filter((item) => item.usedAt > (photo.releasedAt || 0));
          const privateChannels = ["dm_user", "moments", "bubble", ...(Object.entries(loadTwitterState().accounts).some(([id, profile]) => id.endsWith(":alt") && profile.disclosure === "full") ? ["twitter_alt"] : [])] as const;
          const publicChannels = ["wvs_artist", "twitter_main"] as const;
          const locked = used.some((item) => item.channel === "wvs_official") || (used.some((item) => privateChannels.includes(item.channel as typeof privateChannels[number])) && privateChannels.every((channel) => used.some((item) => item.channel === channel))) || (used.some((item) => publicChannels.includes(item.channel as typeof publicChannels[number])) && publicChannels.every((channel) => used.some((item) => item.channel === channel)));
          return <button type="button" aria-label={photo.displayName || photo.originalName || "照片"} aria-pressed={selecting ? selectedIds.includes(photo.id) : undefined} data-photo-id={photo.id} className={`photos-grid-item${dropId===photo.id ? " is-drop-target" : ""}${dragId===photo.id ? " is-dragging" : ""}${locked ? " is-used" : ""}${selecting && selectedIds.includes(photo.id) ? " is-selected" : ""}`} key={photo.id} draggable={!selecting} onDragStart={event=>{event.dataTransfer.setData("text/plain",photo.id);dragRef.current=photo.id;setDragId(photo.id);}} onDragEnd={()=>{dragRef.current=null;setDragId(null);setDropId(null);}} onDragOver={event=>{event.preventDefault();setDropId(photo.id);}} onDrop={event=>{event.preventDefault();const id=event.dataTransfer.getData("text/plain");if(id&&id!==photo.id)mergeDragged(id,photo.id);setDragId(null);setDropId(null);}} onPointerDown={event=>{
 clearTimeout(hold.current.timer);hold.current={x:event.clientX,y:event.clientY,consumed:false};
 if(!selecting){const el=event.currentTarget, pid=event.pointerId;hold.current.timer=setTimeout(()=>{hold.current.consumed=true;dragRef.current=photo.id;setDragId(photo.id);el.setPointerCapture(pid);},450);}
 }} onPointerMove={event=>{if(dragRef.current){event.preventDefault();const target=document.elementsFromPoint(event.clientX,event.clientY).map(x=>x.closest<HTMLElement>('[data-photo-id]')).find(x=>x&&x.dataset.photoId!==dragRef.current);dropRef.current=target?.dataset.photoId||null;setDropId(dropRef.current);}else if(Math.hypot(event.clientX-hold.current.x,event.clientY-hold.current.y)>9)clearTimeout(hold.current.timer);}} onPointerUp={()=>{clearTimeout(hold.current.timer);if(dragRef.current&&dropRef.current)mergeDragged(dragRef.current,dropRef.current);dragRef.current=null;dropRef.current=null;setDragId(null);setDropId(null);}} onPointerCancel={()=>{clearTimeout(hold.current.timer);dragRef.current=null;dropRef.current=null;setDragId(null);setDropId(null);}} onContextMenu={event=>event.preventDefault()} onClick={() => { if (hold.current.consumed) { hold.current.consumed = false; return; } if (selecting) setSelectedIds(ids => ids.includes(photo.id) ? ids.filter(id => id !== photo.id) : [...ids, photo.id]); else if (stackCount > 0 && !expandedStackId) setExpandedStackId(photo.id); else setDetailId(photo.id); }}>
            {imageMap[photo.assetId]
              ? <img src={imageMap[photo.assetId]} alt="" loading="lazy" />
              : <span className="photos-grid-placeholder"><ImageIcon size={20} /></span>}
            {!photo.aiUsable ? <span className="photos-grid-lock">仅手动</span> : null}
            {stackCount > 0 ? <span className="photos-grid-stack">套图 · {stackCount + 1}张</span> : null}
            {used.length ? <span className="photos-grid-used">{locked ? "已暂锁" : `已用 ${used.length}`}</span> : null}
            {selecting ? <span className={`photos-grid-select${selectedIds.includes(photo.id) ? " is-selected" : ""}`}>{selectedIds.includes(photo.id) ? <Check size={13} /> : null}</span> : null}
          </button>;
        })}
      </div>
      </>
    );
  };

  function renderCharacterAlbums(characterId: string) {
    const items = scopedPhotos;
    const ownAlbums = albums.filter(album => album.characterId === characterId && album.origin === albumOrigin);
    const cards = [{ id: "all", name: albumOrigin ? "全部生图" : "全部照片", items },
      ...ownAlbums.map(album => ({ id: album.id, name: album.name, items: items.filter(photo => album.photoIds.includes(photo.id)) }))];
    return <><div className="photos-library-summary"><strong>我的相册</strong><span>{ownAlbums.length} 个自建相册</span></div>
      <div className="photos-album-grid">{cards.map(card => <button type="button" className="photos-album-card" key={card.id} onClick={() => setSelectedAlbumId(card.id)}>
        <span className="photos-album-cover">{card.items[0] && imageMap[card.items[0].assetId] ? <img src={imageMap[card.items[0].assetId]} alt="" /> : <Images size={32} />}</span><strong>{card.name}</strong><span>{card.items.length} 张</span>
      </button>)}</div></>;
  }

  function renderOverlays() {
    return <>
      {stackPickerIds ? <PhotoStackSheet photos={scope ? scopedPhotos : photos} selectedIds={stackPickerIds} imageMap={imageMap} onChoose={coverId => stackPhotos(stackPickerIds, coverId)} onClose={() => setStackPickerIds(null)} /> : null}
      {uploadDraft ? renderUploadSheet() : null}
      {importMenu ? <div className="photos-sheet-backdrop"><section className="photos-sheet" role="dialog" aria-modal="true" aria-label="导入照片方式"><header className="photos-sheet-header"><button type="button" onClick={() => setImportMenu(false)} aria-label="关闭"><X size={19} /></button><div><strong>导入照片</strong><span>选择导入方式</span></div></header><div className="photos-sheet-scroll photos-import-options"><button type="button" onClick={() => { setImportMenu(false); openPicker(); }}><ImageIcon size={18} /> 本地图片</button><button type="button" onClick={() => { setImportMenu(false); setUrlSheet(true); }}><Link2 size={18} /> 图片 URL · 可批量导入</button></div></section></div> : null}
      {urlSheet ? <PhotoUrlSheet onClose={() => setUrlSheet(false)} onReady={(files, urls) => { setUrlSheet(false); handleFiles(files, urls); }} /> : null}
      {albumSheet ? <PhotoAlbumSheet key={albumSheet.characterId} {...albumSheet} albums={albums} onCreated={id => setSelectedAlbumId(id)} onClose={() => setAlbumSheet(null)} /> : null}
    </>;
  }

  if (detailPhoto) {
    const imageUrl = imageMap[detailPhoto.assetId];
    const generated = detailPhoto.origin === "generated";
    const generatedOwner = generatedPhotoOwner(detailPhoto);
    const generator = generatedOwner ? characterById.get(generatedOwner) : undefined;
    const isGeneratedReference = generator && currentTraitsByCharacter[generator.id]?.generatedReferencePhotoId === detailPhoto.id;
    const activeUsage = detailPhoto.usageHistory.filter((usage) => usage.usedAt > (detailPhoto.releasedAt || 0));
    const storyCover = photoStackCover(detailPhoto, photos);
    const stackMemberCount = photos.filter((photo) => photo.stackId === detailPhoto.id).length;
    return (
      <section className="photos-app photos-detail-view">
        <header className="photos-topbar">
          <button type="button" className="photos-round-btn" onClick={() => setDetailId(null)} aria-label="返回">
            <ChevronLeft size={21} />
          </button>
          <div className="photos-topbar-title">
            <strong>{detailPhoto.displayName || "照片"}</strong>
            <span>{formatPhotoDate(detailPhoto.createdAt)}</span>
          </div>
          <button type="button" className="photos-round-btn photos-danger-btn" onClick={() => void deleteDetailPhoto()} aria-label="删除照片">
            <Trash2 size={18} />
          </button>
        </header>

        <main className="photos-detail-scroll">
          <div className="photos-detail-image-wrap">
            {imageUrl ? <img src={imageUrl} alt="" className="photos-detail-image" /> : <div className="photos-detail-image-loading"><ImageIcon size={30} /></div>}
          </div>

          <section className="photos-inspector-card">
            <label className="photos-edit-row"><span>照片名称</span><input maxLength={120} value={photoName} placeholder={detailPhoto.originalName || "给这张照片起个名字"} onChange={event => setPhotoName(event.target.value)} onBlur={() => updateDetail({ displayName: photoName })} onKeyDown={event => { if (event.key === "Enter") event.currentTarget.blur(); }} /></label>
            <span className="photos-note">原文件名：{detailPhoto.originalName || "未记录"}</span>
          </section>

          {generated ? <section className="photos-inspector-card">
            <div className="photos-inspector-heading"><strong>生图提示词</strong></div>
            <div className="photos-generation-prompt">{detailPhoto.generationPrompt || "原提示词未记录"}</div>
          </section> : <section className="photos-inspector-card photos-vision-card">
            <div className="photos-inspector-heading photos-vision-heading">
              <div>
                <strong>外观与场景</strong>
                <span>
                  {detailPhoto.visionStatus === "pending" ? "正在识别…" : detailPhoto.visionStatus === "failed" ? `识别失败：${detailPhoto.visionError || "可重新识别"}` : detailPhoto.visionStatus === "done" ? "AI 已填好，你可以随时修改" : "尚未识别"}
                </span>
              </div>
              <button type="button" className="photos-mini-action" onClick={() => void reanalyzeDetail()} disabled={detailPhoto.visionStatus === "pending"}>
                {detailPhoto.visionStatus === "pending" ? <Loader2 size={14} className="photos-spin" /> : <RefreshCw size={14} />}
                <span>重新识别</span>
              </button>
            </div>

            {detailPhoto.visionStatus === "failed" && detailPhoto.visionError ? (
              <div className="photos-vision-error">{detailPhoto.visionError}</div>
            ) : null}

            <label className="photos-edit-row">
              <span>内容描述</span>
              <textarea
                value={detailPhoto.visionSummary || ""}
                placeholder="AI 会用一句话概括画面"
                onChange={(event) => updateDetailManual("visionSummary", { visionSummary: event.target.value })}
              />
            </label>
            <label className="photos-edit-row">
              <span>主体</span>
              <input
                value={detailPhoto.subject || ""}
                placeholder="自拍、宠物、风景、食物…"
                onChange={(event) => updateDetailManual("subject", { subject: event.target.value })}
              />
            </label>
            {(["hair", "accessories", "outfit", "season", "scene"] as const).map((key) => (
              <label className="photos-edit-row" key={key}>
                <span>{key === "hair" ? "发色" : key === "accessories" ? "配饰" : key === "outfit" ? "穿搭" : key === "season" ? "季节" : "场景"}</span>
                <input
                  value={detailPhoto.appearance?.[key] || ""}
                  placeholder={key === "hair" ? "如：浅金色短发" : key === "accessories" ? "眼镜、耳钉、项链等" : key === "outfit" ? "如：黑色外套配白T" : key === "season" ? "夏天倾向 / 无法判断" : "如：家里客厅、咖啡店"}
                  onChange={(event) => updateAppearanceField(key, event.target.value)}
                />
              </label>
            ))}
            <PhotoTagEditor key={detailPhoto.id} tags={detailPhoto.visionTags || []} onSave={tags => updateDetailManual("visionTags", { visionTags: tags })} />
          </section>}

          {generated ? <section className="photos-setting-card">
            <div><strong>由谁生成</strong><span>{generator?.name || "未标注角色"}</span></div>
          </section> : <section className="photos-inspector-card">
            <div className="photos-inspector-heading">
              <div>
                <strong>关联角色</strong>
                <span>决定哪些角色以后可以调用这张照片</span>
              </div>
            </div>
            <div className="photos-character-chips">
              {characters.map((character) => {
                const selected = detailPhoto.linkedCharacterIds.includes(character.id);
                return (
                  <button
                    type="button"
                    key={character.id}
                    className={`photos-character-chip${selected ? " is-selected" : ""}`}
                    onClick={() => toggleDetailCharacter(character.id)}
                  >
                    <CharacterAvatar character={character} size={27} />
                    <span>{character.name}</span>
                    {selected ? <Check size={14} /> : null}
                  </button>
                );
              })}
            </div>
          </section>}

          {!generated && detailPhoto.linkedCharacterIds.length === 2 ? (
            <section className="photos-setting-card">
              <div>
                <strong>加入角色共享相册</strong>
                <span>
                  {detailPhoto.linkedCharacterIds.map((id) => characterById.get(id)?.name || "角色").join(" & ")}
                </span>
              </div>
              <Toggle checked={detailShared} onChange={toggleDetailShared} label="共享相册" />
            </section>
          ) : null}

          <section className="photos-setting-card">
            <div>
              <strong>AI 可调用</strong>
              <span>关闭后只保留在 Photos，不参与角色自动发图</span>
            </div>
            <Toggle checked={detailPhoto.aiUsable} onChange={(next) => updateDetail({ aiUsable: next })} label="AI 可调用" />
          </section>


          {!generated && (detailPhoto.people ?? []).length > 1 ? (
            <section className="photos-inspector-card">
              <div className="photos-inspector-heading">
                <strong>多人照片</strong>
                <span>AI 只描述人物槽位，谁是谁由你来匹配</span>
              </div>
              <div className="photos-person-slots">
                {(detailPhoto.people ?? []).map((person, index) => (
                  <div className="photos-person-slot" key={person.id}>
                    <div className="photos-person-slot-head">
                      <strong>人物 {index + 1}</strong>
                      <span>{person.position || "位置未标注"}</span>
                    </div>
                    <label className="photos-edit-row photos-edit-row-compact">
                      <span>位置</span>
                      <input
                        value={person.position || ""}
                        placeholder="如：左侧 / 中间 / 右侧"
                        onChange={(event) => updatePersonSlot(person.id, (slot) => ({ ...slot, position: event.target.value || undefined }))}
                      />
                    </label>
                    <label className="photos-edit-row">
                      <span>对应角色</span>
                      <select
                        value={person.mappedCharacterId || ""}
                        onChange={(event) => updatePersonSlot(person.id, (slot) => ({ ...slot, mappedCharacterId: event.target.value || undefined }))}
                      >
                        <option value="">暂不匹配</option>
                        {characters.map((character) => (
                          <option key={character.id} value={character.id}>{character.name}</option>
                        ))}
                      </select>
                    </label>
                    {(["hair", "accessories", "outfit", "season", "scene"] as const).map((key) => (
                      <label className="photos-edit-row photos-edit-row-compact" key={key}>
                        <span>{key === "hair" ? "发色" : key === "accessories" ? "配饰" : key === "outfit" ? "穿搭" : key === "season" ? "季节" : "场景"}</span>
                        <input
                          value={person.appearance?.[key] || ""}
                          onChange={(event) => updatePersonSlot(person.id, (slot) => ({ ...slot, appearance: { ...slot.appearance, [key]: event.target.value } }))}
                        />
                      </label>
                    ))}
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {generated && generator ? (
            <button type="button" className="photos-reference-btn" onClick={() => {
              setGeneratedPhotoReference(generator.id, isGeneratedReference ? undefined : detailPhoto.id);
              onNotice?.(isGeneratedReference ? "已取消生图外貌参考。" : `已设为 ${generator.name} 的生图外貌参考。`);
            }}>
              <Sparkles size={15} />
              {isGeneratedReference ? "已设为外貌参考 · 点击取消" : `设为 ${generator.name} 的生图外貌参考`}
            </button>
          ) : null}
          {!generated && detailPhoto.linkedCharacterIds.map((characterId) => (
            <button type="button" className="photos-reference-btn" key={characterId} onClick={() => setTraitsFromPhoto(characterId)}>
              <Sparkles size={15} />
              用这张照片设为 {characterById.get(characterId)?.name || "角色"} 的当前特征参考
            </button>
          ))}

          {!generated && <section className="photos-inspector-card">
            <PhotoStoryEditor key={`photo-story-${detailPhoto.id}`} label="故事与使用备注" note={detailPhoto.storyNote}
              hint="写这张的故事、拍摄者、当时的心情或使用限制。与套图备注一起读取，重新识图不会覆盖。共享照片的相关角色会读取同一份故事。"
              onSave={storyNote => updateDetail({ storyNote })} />
          </section>}
          <section className="photos-inspector-card">
            <div className="photos-inspector-heading"><strong>系列与套图</strong></div>
            <label className="photos-edit-row"><span>{detailPhoto.stackId || stackMemberCount ? "套图名称" : "系列名称"}</span><input value={storyCover.seriesId || ""} placeholder="" onChange={(event) => updateDetail({ seriesId: event.target.value })} /></label>
            <button type="button" className="photos-stack-preview" onClick={() => setStackPickerIds([detailPhoto.id])}>
              {(() => { const cover = photos.find(photo => photo.id === (detailPhoto.stackId || detailPhoto.id)); return cover && imageMap[cover.assetId] ? <img src={imageMap[cover.assetId]} alt="" /> : <Images size={26} />; })()}
              <span><strong>{detailPhoto.stackId || stackMemberCount ? "更换套图归属" : "加入套图"}</strong><small>查看缩略图选择，不用记名字</small></span><span aria-hidden="true">›</span>
            </button>
            {detailPhoto.stackId || stackMemberCount > 0 ? <button type="button" className="photos-detail-action" onClick={unstackDetailPhoto}>{detailPhoto.stackId ? "从套图移出，单独显示" : `拆开整个套图（${stackMemberCount + 1} 张）`}</button> : null}
            {!generated && (detailPhoto.stackId || stackMemberCount > 0) ? <PhotoStoryEditor key={`stack-story-${storyCover.id}`} label="套图通用备注" note={storyCover.stackStoryNote}
              hint="整套共同的事件、时间和使用约定。修改会作用于这套所有照片；单张备注仍会一起读取。"
              onSave={stackStoryNote => updatePhotoRecord(storyCover.id, { stackStoryNote })} /> : null}
            <span className="photos-note">{generated ? "套图保留每张生图各自的使用记录。" : "套图不影响每张照片的使用记录。移出或拆开时，共同背景会保留到单张备注。"}</span>
          </section>
          <details className="photos-more-info"><summary>更多信息<span>文件与使用记录</span></summary>
          <section className="photos-meta-card">
            <span>文件</span><strong>{detailPhoto.originalName || "照片"}</strong>
            {!generated && <><span>识图</span><strong>{detailPhoto.visionStatus === "done" ? "已分析" : detailPhoto.visionStatus === "pending" ? "分析中" : detailPhoto.visionStatus === "failed" ? "失败" : "待分析"}</strong></>}
            <span>来源</span><strong>{detailPhoto.origin === "generated" ? `${detailPhoto.sourceAppId || "未知 App"} 生图` : "传图"}</strong>
          </section>
          <section className="photos-inspector-card">
            <div className="photos-inspector-heading"><strong>使用记录</strong><span>{activeUsage.length ? `本轮已用于 ${activeUsage.length} 次 · 可手动放出` : detailPhoto.releasedAt ? "已放出 · 可重新参与匹配" : "还没有发布过"}</span></div>
            {detailPhoto.usageHistory.length ? detailPhoto.usageHistory.map((usage, index) => <div className="photos-usage-row" key={`${usage.usedAt}_${index}`}><span>{photoUsageLabel(usage.channel)} · {characterById.get(usage.characterId)?.name || usage.characterId}{usage.usedAt <= (detailPhoto.releasedAt || 0) ? " · 上轮记录" : ""}</span><time>{formatPhotoDate(usage.usedAt)}</time></div>) : <span className="photos-note">还没有发布过</span>}
            {activeUsage.length ? <button type="button" className="photos-detail-action" onClick={releaseDetailPhoto}>放出照片，允许再次匹配</button> : detailPhoto.releasedAt ? <span className="photos-release-status">✓ 已放出，原发布记录已保留</span> : null}
          </section>
          </details>
        </main>
        {renderSelectionBar()}
        {renderOverlays()}
      </section>
    );
  }

  if (scope) {
    return (
      <section className="photos-app">
        <header className="photos-topbar">
          <button type="button" className="photos-round-btn" onClick={() => selectedAlbumId ? setSelectedAlbumId(null) : setScope(null)} aria-label="返回">
            <ChevronLeft size={21} />
          </button>
          <div className="photos-topbar-title">
            <strong>{scopeTitle}</strong>
            <span>{scopedPhotos.length} 张照片</span>
          </div>
          {!albumCharacterId ? <button type="button" className="photos-text-btn" onClick={() => { setSelecting(!selecting); setSelectedIds([]); }}>{selecting ? "取消" : "选择"}</button> : null}
          {(!albumOrigin || (albumCharacterId && !selectedAlbumId)) && <button type="button" className="photos-round-btn" onClick={() => {
            if (albumCharacterId && !selectedAlbumId) setAlbumSheet({ characterId: albumCharacterId, origin: albumOrigin, photoIds: [], mode: "create" });
            else if (selectedAlbumId === "all") onNotice?.("请先进入一个自建相册，再上传照片。");
            else setImportMenu(true);
          }} aria-label={albumCharacterId && !selectedAlbumId ? "新建相册" : "上传照片"}><Plus size={20} /></button>}
        </header>
        {albumCharacterId ? <div className="photos-organize-bar">
          {!selectedAlbumId ? <button type="button" aria-label="管理已有相册" onClick={() => setAlbumSheet({ characterId: albumCharacterId, origin: albumOrigin, photoIds: [], mode: "manage" })}><MoreHorizontal size={18}/></button> : <>
            <button type="button" onClick={() => { setSelecting(!selecting); setSelectedIds([]); }}>{selecting ? "取消选择" : "选择照片"}</button>
            {selecting ? <button type="button" onClick={() => setSelectedIds((expandedStackId ? scopedPhotos.filter(photo => photo.id === expandedStackId || photo.stackId === expandedStackId) : scopedPhotos).map(photo => photo.id))}>全选</button> : expandedStackId ? <button type="button" onClick={() => setAlbumSheet({ characterId: albumCharacterId, origin: albumOrigin, photoIds: scopedPhotos.filter(photo => photo.id === expandedStackId || photo.stackId === expandedStackId).map(photo => photo.id) })}>整套加入相册</button> : null}
          </>}
        </div> : null}
        <main className="photos-library-scroll">
          {scope.type === "character" && !selectedAlbumId ? (
            <section className="photos-current-traits-card">
              <div className="photos-current-traits-head">
                <div>
                  <strong>当前特征</strong>
                  <span>可选。留空时，这个角色的照片默认都可参与匹配。</span>
                </div>
                <Sparkles size={17} />
              </div>
              <textarea
                value={currentTraitsByCharacter[scope.characterId]?.text || ""}
                placeholder="例如：现在是浅金发、夏天、最近偶尔戴黑框眼镜。也可以从某张近期照片自动提取。"
                onChange={(event) => saveCurrentTraits(scope.characterId, event.target.value)}
              />
              {currentTraitsByCharacter[scope.characterId]?.sourcePhotoId ? <span className="photos-current-traits-source">当前参考来自一张已选照片；你仍可继续手动修改。</span> : null}
            </section>
          ) : null}
          {albumCharacterId && !selectedAlbumId ? renderCharacterAlbums(albumCharacterId) : albumOrigin || !scopedPhotos.length ? renderPhotoGrid(scopedPhotos) : <>{scopedPhotos.some((item) => item.origin !== "generated") ? <><div className="photos-library-summary"><strong>传图</strong><span>{scopedPhotos.filter((item) => item.origin !== "generated").length}</span></div>{renderPhotoGrid(scopedPhotos.filter((item) => item.origin !== "generated"))}</> : null}{scopedPhotos.some((item) => item.origin === "generated") ? <><div className="photos-library-summary"><strong>生图</strong><span>{scopedPhotos.filter((item) => item.origin === "generated").length}</span></div>{renderPhotoGrid(scopedPhotos.filter((item) => item.origin === "generated"))}</> : null}</>}
        </main>
        <input ref={fileInputRef} type="file" accept="image/*" multiple hidden onChange={(event) => handleFiles(event.target.files)} />
        {renderSelectionBar()}
        {renderOverlays()}
      </section>
    );
  }

  function renderUploadSheet() {
    if (!uploadDraft) return null;
    const selectedCharacters = uploadDraft.linkedCharacterIds.map((id) => characterById.get(id)).filter((item): item is Character => Boolean(item));
    return (
      <div className="photos-sheet-backdrop" role="presentation">
        <section className="photos-sheet" role="dialog" aria-modal="true" aria-label="导入照片">
          <header className="photos-sheet-header">
            <button type="button" onClick={() => {
              if (uploading) return;
              uploadDraft.previewUrls.forEach((url) => URL.revokeObjectURL(url));
              setUploadDraft(null);
            }} aria-label="取消"><X size={19} /></button>
            <div><strong>导入照片</strong><span>{uploadDraft.files.length} 张</span></div>
            <button type="button" className="photos-sheet-done" disabled={uploading || uploadDraft.files.length === 0} onClick={() => void importPhotos()}>
              {uploading ? `${uploadProgress.current}/${uploadProgress.total}` : "完成"}
            </button>
          </header>

          <div className="photos-sheet-scroll">
            <div className="photos-import-preview">
              {uploadDraft.previewUrls.map((url, index) => (
                <span className="photos-import-thumb" key={`${url}_${index}`}>
                  <img src={url} alt="" />
                  <button type="button" onClick={() => removeDraftPhoto(index)} aria-label={`移除第 ${index + 1} 张照片`}>
                    <X size={12} strokeWidth={2.4} />
                  </button>
                </span>
              ))}
              <button type="button" className="photos-import-add" onClick={openPicker} aria-label="继续添加照片">
                <Plus size={18} />
                <span>添加</span>
              </button>
            </div>

            {!uploadDraft.accountId ? <label className="photos-edit-row photos-upload-album"><span>导入到相册</span><select value={uploadDraft.albumId || ""} onChange={event => setUploadDraft({ ...uploadDraft, albumId: event.target.value || undefined })}><option value="">全部照片 · 暂不分类</option>{albums.filter(album => uploadDraft.linkedCharacterIds.includes(album.characterId)).map(album => <option key={album.id} value={album.id}>{characterById.get(album.characterId)?.name || "角色"} · {album.name}</option>)}</select></label> : null}

            {!uploadDraft.accountId ? <section className="photos-sheet-section">
              <div className="photos-sheet-section-title">
                <strong>关联角色</strong>
                <span>可多选；角色身份由你决定，不交给识图模型猜</span>
              </div>
              <div className="photos-character-list">
                {characters.map((character) => {
                  const selected = uploadDraft.linkedCharacterIds.includes(character.id);
                  return (
                    <button
                      type="button"
                      className={`photos-character-row${selected ? " is-selected" : ""}`}
                      key={character.id}
                      onClick={() => toggleDraftCharacter(character.id)}
                    >
                      <CharacterAvatar character={character} size={38} />
                      <span>{character.name}</span>
                      <i>{selected ? <Check size={16} /> : null}</i>
                    </button>
                  );
                })}
              </div>
            </section> : <section className="photos-sheet-section"><strong>{uploadDraft.accountType === "official" ? "Weverse 官号专用池" : "X 副号专用池"}</strong><p>这些照片只进入当前账号的独立相册。</p></section>}

            {uploadDraft.linkedCharacterIds.length === 2 ? (
              <section className="photos-setting-card photos-sheet-setting">
                <div>
                  <strong>加入角色共享相册</strong>
                  <span>{selectedCharacters.map((character) => character.name).join(" & ")}</span>
                </div>
                <Toggle checked={uploadDraft.shared} onChange={(next) => setUploadDraft((draft) => draft ? { ...draft, shared: next } : draft)} label="共享相册" />
              </section>
            ) : null}

            <section className="photos-setting-card photos-sheet-setting">
              <div>
                <strong>AI 可调用</strong>
                <span>以后角色发图时可以把这些照片作为候选</span>
              </div>
              <Toggle checked={uploadDraft.aiUsable} onChange={(next) => setUploadDraft((draft) => draft ? { ...draft, aiUsable: next } : draft)} label="AI 可调用" />
            </section>
            <p className="photos-note">导入后的识图接口在“设置 → 配置绑定 → Auxiliary API → 相册识图 API”选择；留空则沿用全局文本 API。所选接口需开启图像识别。</p>
          </div>
        </section>
      </div>
    );
  }

  return (
    <section className="photos-app">
      <header className="photos-home-header">
        <button type="button" className="photos-round-btn" onClick={onClose} aria-label="返回桌面">
          <ChevronLeft size={21} />
        </button>
        <div>
          <span>PHOTOS</span>
          <h1>{tab === "library" ? "首页" : tab === "people" ? "人物" : tab === "pools" ? "专用媒体池" : "共享"}</h1>
        </div>
        {tab === "library" ? <button type="button" className="photos-text-btn" onClick={() => { setSelecting(!selecting); setSelectedIds([]); }}>{selecting ? "取消" : "选择"}</button> : null}
        {tab !== "library" && tab !== "people" && <button type="button" className="photos-add-btn" onClick={() => setImportMenu(true)} aria-label="导入照片">
          <Plus size={20} />
        </button>}
      </header>

      <main className="photos-library-scroll photos-home-scroll">
        {tab === "library" ? (
          <>
            <details className="photos-strategy-card photos-disclosure"><summary>照片使用设置</summary>
              <div className="photos-strategy-head">
                <div>
                  <strong>媒体解析策略</strong>
                  <span>只有引入的角色和账号会读取 Photos。缺图先保留文字描述，点生图才调用已配置的图片 API。</span>
                </div>
                {photos.some(photo => photo.origin !== "generated" && photo.visionStatus !== "done") ? (
                  <button type="button" className="photos-mini-action" onClick={() => void analyzePendingPhotos()}>
                    <RefreshCw size={13} />
                    <span>识别待处理</span>
                  </button>
                ) : null}
              </div>
              <label>
                <span>媒体来源</span>
                <select value={preferences.importedStrategy} onChange={(event) => updateStrategy(event.target.value as PhotoSourceStrategy)}>
                  <option value="album_only">仅匹配相册 · 缺图拒绝</option>
                  <option value="album_then_generated">先匹配 · 缺图可手动生图</option>
                </select>
              </label>
              <label>
                <span>解析调试</span>
                <select value={preferences.resolverDebug ? "on" : "off"} onChange={(event) => setPhotoLibraryPreferences({ resolverDebug: event.target.value === "on" })}>
                  <option value="off">关闭</option>
                  <option value="on">开启</option>
                </select>
              </label>
            </details>
            <details className="photos-import-card photos-disclosure"><summary>管理可用角色相册</summary>
              <div className="photos-library-summary"><strong>引入角色</strong><span>{preferences.enabledCharacterIds.length}/{characters.length}</span></div>
              <p>未引入的角色在所有 App 都沿用文字图片描述与手动生图。</p>
              {characters.map((character) => <div className="photos-import-row" key={character.id}>
                <CharacterAvatar character={character} size={36} /><span>{character.name}</span>
                <Toggle checked={preferences.enabledCharacterIds.includes(character.id)} onChange={() => toggleImport("enabledCharacterIds", character.id)} label={`引入 ${character.name} 相册`} />
              </div>)}
            </details>
            {photos.length > 0 ? (
              <div className="photos-library-summary">
                <strong>生图图库</strong>
                <span>{photos.filter(p=>p.origin === "generated").length}</span>
              </div>
            ) : null}
            {generatedAlbums.length ? <div className="photos-album-grid">
              {generatedAlbums.map(({ id, character, items, cover }) => (
                <button type="button" className="photos-album-card" key={id ?? "unattributed"} onClick={() => setScope({ type: "generated", characterId: id })}>
                  <span className="photos-album-cover">
                    {imageMap[cover.assetId] ? <img src={imageMap[cover.assetId]} alt="" /> : character ? <CharacterAvatar character={character} size={70} /> : <Images size={32} />}
                    {character && <span className="photos-album-avatar"><CharacterAvatar character={character} size={28} /></span>}
                  </span>
                  <strong>{character?.name || "未归属生图"}</strong>
                  <span>{items.length} 张</span>
                </button>
              ))}
            </div> : renderPhotoGrid([])}
          </>
        ) : null}

        {tab === "people" ? (
          peopleAlbums.length > 0 ? (
            <div className="photos-album-grid">
              {peopleAlbums.map(({ character, items, cover }) => (
                <button type="button" className="photos-album-card" key={character.id} onClick={() => setScope({ type: "character", characterId: character.id })}>
                  <span className="photos-album-cover">
                    {cover && imageMap[cover.assetId] ? <img src={imageMap[cover.assetId]} alt="" /> : <CharacterAvatar character={character} size={70} />}
                    <span className="photos-album-avatar"><CharacterAvatar character={character} size={28} /></span>
                  </span>
                  <strong>{character.name}</strong>
                  <span>{items.length} 张</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="photos-empty">
              <span className="photos-empty-icon"><Users size={30} strokeWidth={1.5} /></span>
              <strong>还没有人物相册</strong>
              <p>导入照片并关联角色后，这里会自动出现。</p>
              <button type="button" onClick={openPicker}>导入照片</button>
            </div>
          )
        ) : null}

        {tab === "shared" ? (
          sharedAlbums.length > 0 ? (
            <div className="photos-album-grid">
              {sharedAlbums.map(({ pairId, first, second, items, cover }) => (
                <button type="button" className="photos-album-card" key={pairId} onClick={() => setScope({ type: "shared", pairId })}>
                  <span className="photos-album-cover photos-shared-cover">
                    {cover && imageMap[cover.assetId] ? <img src={imageMap[cover.assetId]} alt="" /> : <Link2 size={34} />}
                    <span className="photos-shared-avatars">
                      <CharacterAvatar character={first} size={30} />
                      <CharacterAvatar character={second} size={30} />
                    </span>
                  </span>
                  <strong>{first.name} & {second.name}</strong>
                  <span>{items.length} 张</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="photos-empty">
              <span className="photos-empty-icon"><Link2 size={30} strokeWidth={1.5} /></span>
              <strong>还没有角色共享相册</strong>
              <p>导入时关联两位角色，再打开“加入角色共享相册”。</p>
              <button type="button" onClick={openPicker}>导入照片</button>
            </div>
          )
        ) : null}

        {tab === "pools" ? <div className="photos-import-card">
          <div className="photos-library-summary"><strong>Weverse 官号</strong><span>专用相册</span></div>
          {officialAccounts.map((account) => <div className="photos-import-row" key={account.id}>
            <span className="photos-pool-icon">W</span><button type="button" className="photos-pool-name" onClick={() => setScope({ type: "official", accountId: account.id })}>{account.official?.displayName || account.name}<small>{account.officialMediaPhotoIds?.length || 0} 张 · 打开相册</small></button>
            <Toggle checked={preferences.enabledOfficialIds.includes(account.id)} onChange={() => toggleImport("enabledOfficialIds", account.id)} label={`引入 ${account.name} 官号相册`} />
          </div>)}
          {!officialAccounts.length ? <p>创建 Weverse Community 后会出现在这里。</p> : null}
          <div className="photos-library-summary"><strong>X 副号</strong><span>未披露 / 有线索</span></div>
          {alternateAccounts.map(([id, profile]) => <div className="photos-import-row" key={id}>
            <span className="photos-pool-icon">𝕏</span><button type="button" className="photos-pool-name" onClick={() => setScope({ type: "alternate", accountId: id })}>{profile.name}<small>独立媒体池 · 打开相册</small></button>
            <Toggle checked={preferences.enabledAlternateIds.includes(id)} onChange={() => toggleImport("enabledAlternateIds", id)} label={`引入 ${profile.name} 副号相册`} />
          </div>)}
          {!alternateAccounts.length ? <p>创建未披露或有线索的 X 副号后会出现在这里。完全披露的副号使用角色相册。</p> : null}
        </div> : null}
      </main>

      <nav className="photos-tabbar" aria-label="Photos 导航">
        <button type="button" className={tab === "library" ? "is-active" : ""} onClick={() => setTab("library")}>
          <Images size={20} /><span>首页</span>
        </button>
        <button type="button" className={tab === "people" ? "is-active" : ""} onClick={() => setTab("people")}>
          <Users size={20} /><span>人物</span>
        </button>
        <button type="button" className={tab === "shared" ? "is-active" : ""} onClick={() => setTab("shared")}>
          <Link2 size={20} /><span>共享</span>
        </button>
        <button type="button" className={tab === "pools" ? "is-active" : ""} onClick={() => { refreshLibrary(); setTab("pools"); }}>
          <ImageIcon size={20} /><span>专用池</span>
        </button>
      </nav>

      <input ref={fileInputRef} type="file" accept="image/*" multiple hidden onChange={(event) => handleFiles(event.target.files)} />
      {renderSelectionBar()}
      {renderOverlays()}
    </section>
  );
}
