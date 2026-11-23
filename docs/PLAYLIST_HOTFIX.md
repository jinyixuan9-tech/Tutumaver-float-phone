# 音乐卡 PLAYLIST 手动修正

适用于本套 kakao经典悬浮／平面美化。修正后我方显示“歌手 PLAYLIST”，对方仍为“PLAYLIST 歌手”。

## 直接更新内置

分享版 fork 同步上游 main，并等待自己的部署完成。在聊天设置的CSS方案里重新载入“kakao经典悬浮ui”或“kakao经典平面ui”并保存。已保存到会话的CSS是副本，不会自动覆盖。

完整版安装资源065后，同样重新载入对应内置。键位插件仍为0.13.1，不用更换。

## 保留自定义参数，手动添加补丁

打开当前聊天的自定义CSS，拉到全文最末尾，粘贴下面这段并保存。两种美化共用同一段；只处理我方标签，对方、两颗点、封面和其他布局都不动。

```css
/* 我方音乐卡：歌手在前，PLAYLIST 在后 */
:root .chat-msg-wrapper[data-role="user"] .chat-music-share-artist::before {
  content: none !important;
  display: none !important;
}
:root .chat-msg-wrapper[data-role="user"] .chat-music-share-artist::after {
  content: "PLAYLIST" !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  margin: 0 0 0 4px !important;
  padding: 1px 4px !important;
  border-radius: 999px !important;
  background: var(--ii-music-tag) !important;
  color: var(--ii-music-time) !important;
  -webkit-text-fill-color: var(--ii-music-time) !important;
  font-size: 6.5px !important;
  font-weight: 600 !important;
  letter-spacing: 0.2px !important;
  line-height: 1 !important;
  vertical-align: middle !important;
}
```

如果直接改原规则：搜索 content: "PLAYLIST"，原先两边共用artist::before。新版把它分成对方artist::before与我方artist::after，我方使用margin-left:4px、margin-right:0。无需调整歌手文字、卡片坐标或JS。
