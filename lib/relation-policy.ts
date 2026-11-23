export const RELATION_STYLES = {
  ordinary: { name: "普通", color: "#d8d3c9", background: "#f6f3ee", text: "#625c52", hint: "普通关系 可自定义同事、邻居等 自然发展最慢" },
  friend: { name: "朋友", color: "#658ca9", background: "#edf3f7", text: "#42677f", hint: "朋友方向 未固定时可缓慢发展暧昧 也可以一直是朋友" },
  romance: { name: "恋爱", color: "#bd6b71", background: "#f9edef", text: "#995159", hint: "允许暧昧或恋爱 不表示已经喜欢或已经交往" },
  family: { name: "家人", color: "#bd915d", background: "#faf2e7", text: "#947044", hint: "家人或亲属方向 亲疏可以变化 亲属身份保持" },
  enemy: { name: "敌对", color: "#947cad", background: "#f3eef8", text: "#775e92", hint: "敌对方向 默认固定 解除固定后才允许缓慢缓和" },
} as const;
export type RelationKind = keyof typeof RELATION_STYLES;
export function normalizeRelationKind(value: unknown): RelationKind | undefined {
  return typeof value === "string" && Object.hasOwn(RELATION_STYLES, value) ? value as RelationKind : undefined;
}
export function userRelationNode(identityId: string): string { return `user:${identityId}`; }
export function userIdentityFromNode(node: string): string | null { return node.startsWith("user:") ? node.slice(5) : null; }
export function relationPolicyText(kind: RelationKind | undefined, locked: boolean): string {
  if (kind === "family") return "这是家人/亲属关系，亲疏与情绪可变化，但不得自行改变亲属身份或转成恋爱。";
  if (locked) return "用户固定了当前关系性质与阶段；不得自行改关系或暗示升级。朋友、同事等不自行暗恋/暧昧/恋爱；敌对不自行和解。允许符合当前关系的关心、熟悉、争执与暂时合作。";
  const direction = kind === "romance" ? "允许恋爱方向，但红线不是爱意、双方同意或交往事实。" : kind === "friend" ? "当前是朋友方向；允许比红线更慢的自然发展，也可以一直做朋友。" : kind === "enemy" ? "仅因用户解除了固定，才允许敌对关系在持续实际互动后缓慢缓和。" : kind === "ordinary" ? "普通关系先缓慢建立熟悉与信任；成为朋友也不意味着随后必须恋爱。" : "遵循当前填写的关系，不根据标签擅自假定发展方向。";
  return `${direction}当前填写的关系描述是已有事实；方向不是新身份，不得覆盖既有称呼或阶段。所有自然发展都要慢，依据双方人设、当前状态、持续且有双方回应的实际互动；一次关心、玩笑、暧昧、合作或聊天次数不构成升级。白到蓝到红只是允许路径，不是任务。不直接宣告新关系，不替另一方产生爱意或同意；关系与线色只由用户手动修改。`;
}
