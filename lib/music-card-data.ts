import { loadAllTracks, type MusicTrack } from './music-storage';
import { unifiedSearch, getNeteaseSongDetail } from './music-service';
import { updateMessageMediaData, loadChatMessages, type ChatMessage } from './chat-storage';

const bindings = new Map<string, Promise<MusicTrack | null>>();
export function musicCardFields(track: MusicTrack) {
  return { musicTrackId: track.id, musicTitle: track.title, musicArtist: track.artist,
    musicCoverUrl: track.coverUrl, musicDuration: track.duration, musicLastPosition: 0 };
}
/** Bind once to an exact song; never replace an already bound song with the player song. */
export function bindMusicCard(message: ChatMessage): Promise<MusicTrack | null> {
  const pending = bindings.get(message.id); if (pending) return pending;
  const work = (async () => {
    const latest = loadChatMessages(message.sessionId).find(m => m.id === message.id) || message;
    const d = latest.mediaData || {};
    const local = await loadAllTracks();
    const norm = (s:string) => s.normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleLowerCase();
    const title = d.musicTitle || ''; if (!title && !d.musicTrackId) return null;
    const candidates = [{ title, artist: d.musicArtist || '' }];
    if (!d.musicArtist) {
      // Legacy cards used both singer - title and title - singer. Confirm against real results.
      const split = title.match(/^(.+?)\s+[-–—]\s+(.+)$/) || title.match(/^([^—–-]+)[—–-]([^—–-]+)$/);
      if (split) candidates.push({title:split[2].trim(),artist:split[1].trim()},{title:split[1].trim(),artist:split[2].trim()});
    }
    const matches = (t:string,a:string) => candidates.some(c => norm(t) === norm(c.title) && (!c.artist || norm(a).split(/[/、&,]/).map(s=>s.trim()).includes(norm(c.artist)) || norm(a) === norm(c.artist)));
    let track: MusicTrack | undefined;
    if (d.musicTrackId) {
      const source=local.find(t=>t.id===d.musicTrackId);
      track={...source,id:d.musicTrackId,title:d.musicTitle||source?.title||'未知歌曲',artist:d.musicArtist??source?.artist??'',
        coverUrl:d.musicCoverUrl||source?.coverUrl,duration:d.musicDuration||source?.duration||0,liked:source?.liked||false,addedAt:source?.addedAt||message.createdAt};
    } else {
      track = local.find(t => matches(t.title,t.artist));
      if (!track) {
        const results = await unifiedSearch([title,d.musicArtist].filter(Boolean).join(' '));
        let result = results.find(r=>matches(r.title,r.artist));
        if (!result && candidates.length>1) {
          const more = await unifiedSearch(`${candidates[1].title} ${candidates[1].artist}`);
          result = more.find(r=>matches(r.title,r.artist));
        }
        if (result?.localTrack) track = result.localTrack;
        else if (result?.neteaseResult) {
          const n = result.neteaseResult;
          track = {id:`netease_${n.id}`,title:n.name,artist:n.artists,coverUrl:n.coverUrl,duration:n.duration / 1000,liked:false,addedAt:message.createdAt};
        }
      }
    }
    if (!track) return null;
    const onlineId = /^netease_(\d+)$/.exec(track.id)?.[1];
    if (onlineId && (!track.coverUrl || !track.duration || !track.artist)) {
      const detail = await getNeteaseSongDetail(Number(onlineId));
      if (detail) track = {...track, title:detail.name||track.title,artist:detail.artists||track.artist,coverUrl:track.coverUrl||detail.coverUrl,duration:track.duration||detail.duration||0};
    }
    const current = loadChatMessages(message.sessionId).find(m => m.id === message.id);
    if (!current) return null; // Deleted while metadata was resolving.
    if (current.mediaData?.musicTrackId && current.mediaData.musicTrackId !== track.id) return null;
    updateMessageMediaData(message.id,{...current.mediaData,...musicCardFields(track), musicLastPosition:current.mediaData?.musicLastPosition||0});
    window.dispatchEvent(new CustomEvent('chat-messages-updated',{detail:{sessionId:message.sessionId}}));
    return track;
  })().catch(() => null).finally(() => bindings.delete(message.id));
  bindings.set(message.id,work); return work;
}
