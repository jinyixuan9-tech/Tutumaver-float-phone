export type ShortcutResultMode = "none" | "text" | "image";
export type ShortcutDeliveryMode = "push" | "email";

export type ShortcutAction = {
  id: string;
  /** 角色看到的工具名，如「打开微信并截图」 */
  name: string;
  /** iPhone「快捷指令」App 中的准确名称 */
  shortcutName: string;
  /** 点击 Web Push 运行，或由 iOS 邮件自动化无确认运行 */
  deliveryMode: ShortcutDeliveryMode;
  /** 告诉角色何时使用该动作 */
  description: string;
  /** 角色调用参数的 JSON Schema；空对象表示无参数 */
  parameterSchema: string;
  /** 是否等待快捷指令把文本或图片回传给当前一轮角色 */
  resultMode: ShortcutResultMode;
  /** 命令过期时间，也是等待结果的最长时间 */
  expiresInSeconds: number;
  enabled: boolean;
  createdAt: string;
};

