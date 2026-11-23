# 新 App 复用角色记忆

供塔罗等新入口使用，不会自动添加到桌面或写入经历。

```ts
const cognition = await prepareCharacterMemory(characterId, appId, currentQuestion, {
  history: currentAppHistory,       // ChatMessage[]；保留本 App 自己的会话
  beforeTimestamp: historicalAsOf, // 可选；历史补写/重生成时冻结知识时间
  excludeEntryIds: currentEventIds, // 当前历史已包括的原事件 ID
});
const messages = assemblePromptPayload({
  ...cognition,
  character, preset, worldBooks, regexes, userIdentity,
  appId, appTags: [appId],
});
```

`prepareCharacterMemory` 位于 `lib/character-memory-context.ts`。它复用原有短期组装器和长期/核心检索，不新增逐轮向量调用。

每个 App 仍需自己确定：本轮扮演谁、谁是听众、当前身份是否已被认出、哪些资料能够表达。匿名/临时模式不应直接把 User 的私人人设当作当事人身份。公开模式可以提供角色本人的认知，但需另设公开表达边界。

写回仍由本 App 的原生存储负责。只有真实完成、按规则保留的事件才提供角色投影；携带来源 ID、发生时间、实际参与/知情角色，删除原事件时撤销直接投影。不要把临时预览、未保存答案、模拟粉丝或未完成直播写成真实经历。

预设必须启用相应的 `shortTermMemory`、`memoryLongTerm`、`memoryCore` 标记，否则不会绕过预设强制塞入。最终发包应同时保留历史时间边界；历史请求设置 `beforeTimestamp`，或对已完整提供历史资料的生成设置 `skipWorldline: true`，避免发送层补入今天的世界线。
