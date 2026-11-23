/** Opt-in diagnostics. Raw model output stays local unless the user explicitly copies it. */
export type ErrorDiagnostic = {
  operation: string; code: string; title: string; explanation: string;
  checks: string[]; technical: string; httpStatus?: number; occurredAt: string;
  previous?: string;
  actualReturn?: string; expectedFormat?: string; parseFailure?: string; returnTruncated?: boolean;
};
export const ERROR_DIAGNOSTICS_EVENT = "rabbit-error-diagnostics-updated";
let armed = false;
let latest: ErrorDiagnostic | null = null;
let lastFailed: { operation: string; technical: string } | null = null;
// One short-lived, metadata-only pre-arm failure for users who enable the tool after seeing an error.
// Do not store model outputs or request bodies while monitoring is off.
let recentFailure: { operation: string; error: string; status?: number; category?: "parse" | "storage"; time: number } | null = null;
const RECENT_FAILURE_MS = 5 * 60 * 1000;

const CATALOG: Array<{ code: string; match: (s: number | undefined, t: string) => boolean; title: string; explanation: string; checks: string[] }> = [
  {code:"API-404",match:s=>s===404,title:"404 Not Found",explanation:"服务器未找到本次请求的资源或模型路由。",checks:["前往设置 → API，重新拉取模型并测试当前模型","检查 API 地址、模型名称及中转站上游是否仍可用","如果只有群聊出错，核对群聊使用的 API 与单聊是否相同"]},
  {code:"API-405",match:s=>s===405,title:"405 Method Not Allowed",explanation:"接口不支持本次使用的请求方法。",checks:["检查 API 地址和接口类型是否正确","确认中转站兼容当前模型的请求方式，必要时换站测试"]},
  {code:"API-400",match:s=>s===400,title:"400 Bad Request",explanation:"服务器拒绝当前请求参数；具体原因应以服务端原始错误信息为准。",checks:["核对 API 模型名、接口格式和参数","若服务端明确提示 token 或上下文超限，再考虑减少输入或换模型"]},
  {code:"API-401",match:s=>s===401,title:"401 Unauthorized",explanation:"服务器未通过本次身份验证。",checks:["检查 API Key 是否正确或失效","确认对应服务商的 API 地址与密钥匹配"]},
  {code:"API-403",match:s=>s===403,title:"403 Forbidden",explanation:"服务器拒绝访问，可能是账户或模型权限限制。",checks:["核对模型权限、账户状态和中转站限制","换一个有权限的模型或站点测试"]},
  {code:"API-408",match:s=>s===408,title:"408 Request Timeout",explanation:"服务器等待请求时超时。",checks:["检查网络及中转站连接状况","稍后重试，检查服务商超时限制"]},
  {code:"API-413",match:s=>s===413,title:"413 Content Too Large",explanation:"服务器认为请求内容或请求体过大。",checks:["减少本次输入、参考图数量或分段生成","检查中转站请求体大小限制，选择更合适的模型或服务"]},
  {code:"API-422",match:s=>s===422,title:"422 Unprocessable Content",explanation:"服务器收到了请求，但不能按当前参数或结构处理。",checks:["检查所选模型与请求格式是否兼容","查看原始返回，确认缺失或无效的参数"]},
  {code:"API-429",match:s=>s===429,title:"429 Too Many Requests",explanation:"服务商限流，或当前额度／配额不足。",checks:["检查中转站余额、额度和调用频率","稍后重试，必要时换模型或站点"]},
  {code:"API-500",match:s=>s===500,title:"500 Internal Server Error",explanation:"服务器内部处理失败。",checks:["检查中转站或模型服务状态","换模型、换站或稍后重试"]},
  {code:"API-502",match:s=>s===502,title:"502 Bad Gateway",explanation:"网关从上游拿到无效响应，常见于中转链路异常。",checks:["检查中转站的上游模型是否可用","换模型、换站或稍后重试"]},
  {code:"API-503",match:s=>s===503,title:"503 Service Unavailable",explanation:"当前服务暂时不可用。",checks:["查看中转站状态及模型可用性","稍后重试或更换站点"]},
  {code:"API-504",match:s=>s===504,title:"504 Gateway Timeout",explanation:"网关等待上游服务响应超时。",checks:["检查中转站和上游模型状态","换模型或站点，若长内容经常失败可考虑分段处理"]},
  {code:"MODEL-001",match:(_,t)=>/context length|context_window|maximum context|too many tokens|上下文超限|输入过长/i.test(t),title:"上下文长度超限",explanation:"服务明确提示输入或上下文超过限制。",checks:["减少发送内容或将长文本分段","换用输入容量更大的模型，检查中转站限制"]},
  {code:"MODEL-002",match:(_,t)=>/max_tokens|finish.reason.{0,10}length|输出截断|内容被截断|生成长度上限/i.test(t),title:"模型输出可能被截断",explanation:"返回信息显示输出可能达到长度限制。",checks:["试试中转站标注的「抗截断」模型","或选择输出上限更宽的模型，必要时分段生成"]},
  {code:"NET-001",match:(_,t)=>/failed to fetch|network request failed|load failed|networkerror|网络连接失败|网络请求失败/i.test(t),title:"网络连接失败",explanation:"请求没有拿到有效 HTTP 响应，不能仅凭此判断是截断或模型失效。",checks:["前往设置 → API 测试模型并检查网络","检查中转站、API 地址、代理状态；必要时换模型或换站"]},
  {code:"NET-002",match:(_,t)=>/timeout|timed out|超时/i.test(t),title:"请求超时",explanation:"请求等待时间超出限制，尚不能确认是否是内容过长。",checks:["检查网络、中转站和上游模型响应","若明确是长内容引起，可分段或换用「抗截断」模型"]},
  {code:"PARSE-001",match:(_,t)=>/parse|invalid json|unexpected token|解析失败|未识别到|格式不符合|格式错误/i.test(t),title:"返回格式不匹配",explanation:"模型可能返回了内容，但没有符合当前功能所要求的结构或标记。",checks:["核对当前功能绑定的预设是否完整，尤其是输出格式要求","展开技术详情，对照要求格式和模型实际返回","若预设没有问题，检查模型遵循格式的能力或反馈解析器兼容问题"]},
  {code:"STORE-001",match:(_,t)=>/quotaexceeded|indexeddb|存储失败|保存失败/i.test(t),title:"本地保存失败",explanation:"数据未能完成本地写入。",checks:["检查设备存储空间及权限","不要直接清除小手机数据，先尝试备份"]},
  {code:"API-OTHER",match:s=>!!s&&s>=400,title:"API 请求被拒绝",explanation:"服务返回 HTTP 错误，具体原因请结合真实状态和响应体判断。",checks:["前往设置 → API 测试模型及接口地址","核对服务商的原始错误信息，再决定是否更换模型或中转站"]},
  {code:"UNKNOWN-001",match:()=>true,title:"操作失败",explanation:"当前记录不足以确认具体原因。",checks:["检查对应功能的 API 与预设绑定","复制技术详情反馈，勿仅凭分类编号推断原因"]},
];
const HTTP_DESCRIPTIONS: Record<number,string> = {
  400:"Bad Request",401:"Unauthorized",403:"Forbidden",404:"Not Found",405:"Method Not Allowed",
  408:"Request Timeout",413:"Content Too Large",422:"Unprocessable Content",429:"Too Many Requests",
  500:"Internal Server Error",502:"Bad Gateway",503:"Service Unavailable",504:"Gateway Timeout",
};
export function httpDiagnosticStatus(status?: number): string {
  return status ? `${status}${HTTP_DESCRIPTIONS[status] ? " "+HTTP_DESCRIPTIONS[status] : ""}` : "未获取 HTTP 状态";
}
function checksForOperation(operation: string, category?: "parse" | "storage"): string[] {
  if (category !== "parse") return [];
  if (/group|群聊/i.test(operation)) return ["群聊：检查群聊预设、说话人标记、成员匹配、消息分隔符及图片媒体字段"];
  if (/offline|线下/i.test(operation)) return ["线下：核对线下预设和对白格式；若有明确截断证据再换「抗截断」模型"];
  if (/browser|浏览器|查手机/i.test(operation)) return ["浏览器／查手机：确认专用预设存在且完整，尤其是 JSON 字段和输出数量要求"];
  if (/weverse|lysn|泡泡|论坛|theqoo/i.test(operation)) return ["社区：检查当前 APP 的帖子、评论及媒体返回结构要求"];
  if (/summary|归档|总结|memory/i.test(operation)) return ["记忆总结：检查总结 API，确认输入限制和输出长度；长场次可分段"];
  return [];
}

function notify() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(ERROR_DIAGNOSTICS_EVENT));
}
export function setErrorDiagnosticsArmed(value: boolean) {
  if (armed === value) return;
  armed = value; latest = null; lastFailed = null;
  const prior = value && recentFailure && Date.now() - recentFailure.time <= RECENT_FAILURE_MS
    ? recentFailure : null;
  recentFailure = null;
  if (prior) {
    // Pre-arm history is metadata only; never claim an actual model response was captured.
    recordErrorDiagnostic({operation:prior.operation,error:prior.error,status:prior.status,category:prior.category});
  } else notify();
}
export function getErrorDiagnostics() { return { armed, latest }; }
export function clearErrorDiagnostic() { latest = null; lastFailed = null; notify(); }
export function recordErrorDiagnostic(input: {
  operation: string; error?: unknown; status?: number; succeeded?: boolean; category?: "parse" | "storage";
  actualReturn?: string; expectedFormat?: string; parseFailure?: string;
}) {
  if (typeof window === "undefined") return;
  const operation = input.operation.trim().slice(0, 110) || "未识别的操作";
  if (!armed) {
    if (input.succeeded) {
      if (recentFailure?.operation === operation) recentFailure = null;
      return;
    }
    const message = input.error instanceof Error ? input.error.message : String(input.error ?? "");
    recentFailure = {operation,error:message.slice(0,240),status:input.status,category:input.category,time:Date.now()};
    return;
  }
  if (input.succeeded) {
    // A successful retry should not generate an error report.
    if (latest?.operation === operation || lastFailed?.operation === operation) clearErrorDiagnostic();
    return;
  }
  const original = input.error instanceof Error ? input.error.message : String(input.error ?? "");
  const description = original.slice(0, 320);
  const guide = input.category === "parse" ? CATALOG.find(c=>c.code==="PARSE-001")!
    : input.category === "storage" ? CATALOG.find(c=>c.code==="STORE-001")!
    : CATALOG.find(c=>c.match(input.status, description))!;
  // Redact secrets even when a third-party error message embeds them.
  const safe = description.replace(/(?:sk-|AIza)[A-Za-z0-9_\-]{8,}/g,"[已隐藏密钥]")
    .replace(/https?:\/\/[^\s"'<>]+/gi,"[已隐藏链接]")
    .replace(/(?:api[_-]?key|authorization|bearer|token)\s*[:=]\s*[^\s,;]+/gi,"[已隐藏凭据]");
  const previous = lastFailed?.operation === operation ? lastFailed.technical : undefined;
  const returnedText = input.actualReturn || "";
  const safeReturn = returnedText.slice(0,6000).replace(/(?:sk-|AIza)[A-Za-z0-9_-]{8,}/g,"[已隐藏密钥]")
    .replace(/https?:\/\/[^\s"'<>]+/gi,"[已隐藏链接]")
    .replace(/(?:api[_-]?key|authorization|bearer|token)\s*[:=]\s*[^\s,;]+/gi,"[已隐藏凭据]");
  latest = {
    operation, code:guide.code,title:guide.title, explanation:guide.explanation,
    checks:[...checksForOperation(operation,input.category),...guide.checks],technical:safe || (input.status ? `HTTP ${input.status}` : "没有获得原始错误信息"),
    ...(input.actualReturn !== undefined ? {actualReturn:safeReturn,returnTruncated:returnedText.length>6000} : {}),
    ...(input.expectedFormat ? {expectedFormat:input.expectedFormat.slice(0,260)} : {}),
    ...(input.parseFailure ? {parseFailure:input.parseFailure.slice(0,300)} : {}),
    ...(input.status ? {httpStatus:input.status} : {}), occurredAt:new Date().toISOString(),previous,
  };
  lastFailed = {operation,technical:latest.technical};
  notify();
}
export function errorDiagnosticReport(item: ErrorDiagnostic, includeActualReturn = false) {
  return [
    "Rabbit Float · 错误诊断报告",
    `操作：${item.operation}`,
    `时间：${item.occurredAt}`,
    `服务器状态：${httpDiagnosticStatus(item.httpStatus)}`,
    `具体错误：${item.title}`,
    `错误阶段：${item.code === "PARSE-001" ? "内容解析" : item.code === "STORE-001" ? "本地保存" : "API／网络请求"}`,
    `说明：${item.explanation}`,
    `内部分类：${item.code}`,
    `本次错误：${item.technical}`,
    ...(item.previous ? [`此前同操作错误：${item.previous}`] : []),
    ...(item.expectedFormat ? [`期望格式：${item.expectedFormat}`] : []),
    ...(item.parseFailure ? [`解析失败点：${item.parseFailure}`] : []),
    ...(includeActualReturn && item.actualReturn !== undefined
      ? [`实际返回内容${item.returnTruncated ? "（仅前 6000 字符，已截断）" : ""}：\n${item.actualReturn}`] : []),
    "建议检查：",...item.checks.map((s,i)=>`${i+1}. ${s}`),
    includeActualReturn && item.actualReturn !== undefined
      ? "注意：实际返回可能包含私人对话，请检查后再分享。"
      : "默认报告不包含模型返回正文、API Key、提示词或请求体。",
  ].join("\n");
}
