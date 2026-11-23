/** Music sharing has its own reserved tag; do not change the older [音乐:...] directive. */
export function parseMusicShareFields(value: string): { musicTitle: string; musicArtist?: string; label: string } {
    const [title, ...artist] = value.trim().split('|');
    return { musicTitle: title.trim(), ...(artist.join('|').trim() ? { musicArtist: artist.join('|').trim() } : {}), label: value.trim() };
}
export const MUSIC_SHARE_FORMAT_INSTRUCTION = '音乐分享卡格式固定为 [音乐分享:歌名|歌手]，例如 [音乐分享:我爱你|王菲]。歌名与歌手分开写；歌手不确定则留空，不编造歌曲ID、封面或音频URL。分享不会打断当前播放，收到卡片后可点击封面播放。不要与 [音乐:...] 播放动作或数值状态标签混用。';
