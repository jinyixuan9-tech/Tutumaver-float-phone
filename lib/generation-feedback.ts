export type GenerationOutcome = "success" | "error" | "warning" | "empty" | "info";
export function generationOutcome(text: string): GenerationOutcome {
  const failed = /失败|错误|中断|超时|无法|未完成|未成功|未生成|没有解析|error|failed|timeout|network/i.test(text);
  if (failed) return /已生成|已保存|已添加|已补充|已刷新|已加载|保留|部分/.test(text) ? "warning" : "error";
  const counts = [...text.matchAll(/(\d+)\s*条/g)].map(match => Number(match[1]));
  if (/没有.*(?:新|值得|有效)|无新增|暂无|本轮.*没有/.test(text) || counts.length > 0 && counts.every(count => count === 0)) return "empty";
  if (/成功|已|完成|新增|生成了|开播了|开启了/.test(text)) return "success";
  return "info";
}
export function isGenerationProgress(text: string): boolean {
  return /^正在|生成中|处理中|加载中|准备中/.test(text.trim());
}
export function chooseGenerationOutcome(notices: string[], taskLabel: string) {
  const terminal = notices.filter(text => !isGenerationProgress(text));
  const issue = [...terminal].reverse().find(text => ["error", "warning"].includes(generationOutcome(text)));
  const text = issue || terminal.at(-1) || `${taskLabel.replace(/正在|…|\.\.\./g, "")}已完成`;
  return { text, kind: issue ? generationOutcome(issue) : terminal.length ? generationOutcome(text) : "success" as GenerationOutcome };
}
