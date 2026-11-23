import { Capacitor, CapacitorHttp } from "@capacitor/core";

/**
 * Opt-in native transport for HTTPS API calls in the Android APK.
 * Unlike the old /api/* website relay, this uses the user's configured API URL.
 * Other calls still use the ordinary fetch transport.
 */
export function isAndroidNativeApi(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

type NativeFormEntry =
  | { key: string; value: string; type: "string" }
  | { key: string; value: string; type: "base64File"; contentType: string; fileName: string };

function fileBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error("读取生图参考图失败"));
    reader.onload = () => {
      const data = String(reader.result || "");
      const comma = data.indexOf(",");
      if (comma < 0) reject(new Error("参考图转换失败"));
      else resolve(data.slice(comma + 1));
    };
    reader.readAsDataURL(file);
  });
}

function abortError(): Error {
  return new DOMException("请求已取消", "AbortError");
}

async function raceAbort<T>(pending: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return pending;
  if (signal.aborted) throw abortError();
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(abortError());
    signal.addEventListener("abort", abort, { once: true });
    pending.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

/**
 * Android's Capacitor 6 native HTTP expects serialized formData entries
 * (string / base64File). Sending a JS FormData instance directly does not work.
 */
export async function fetchExternalApi(url: string, init: RequestInit = {}): Promise<Response> {
  if (!isAndroidNativeApi()) return fetch(url, init);
  const endpoint = new URL(url);
  if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password || endpoint.hash) {
    throw new Error("安卓 API 请求需要不带账号、密码或锚点的 HTTPS 地址");
  }
  if (init.signal?.aborted) throw abortError();

  const headers = new Headers(init.headers);
  let data: string | NativeFormEntry[] | undefined;
  let dataType: "formData" | undefined;
  if (init.body instanceof FormData) {
    const entries: NativeFormEntry[] = [];
    for (const [key, value] of init.body.entries()) {
      if (typeof value === "string") {
        entries.push({ key, value, type: "string" });
      } else {
        entries.push({
          key,
          value: await fileBase64(value),
          type: "base64File",
          contentType: value.type || "application/octet-stream",
          fileName: value.name || "reference.png",
        });
      }
    }
    data = entries;
    dataType = "formData";
    headers.set("Content-Type", "multipart/form-data");
  } else if (typeof init.body === "string") {
    data = init.body;
  } else if (init.body != null) {
    throw new Error("Android 原生 API 通道不支持此请求体类型");
  }

  const response = await raceAbort(CapacitorHttp.request({
    url: endpoint.href,
    method: init.method || "GET",
    headers: Object.fromEntries(headers.entries()),
    ...(data === undefined ? {} : { data }),
    ...(dataType ? { dataType } : {}),
    responseType: "arraybuffer",
    connectTimeout: 30_000,
    readTimeout: 360_000,
    disableRedirects: true,
  }), init.signal || undefined);

  if (response.status >= 300 && response.status < 400) {
    throw new Error("API 发生重定向，请在设置里填写最终的 HTTPS API 地址");
  }

  const responseHeaders = new Headers();
  for (const [key, value] of Object.entries(response.headers || {})) {
    if (typeof value === "string") {
      try { responseHeaders.set(key, value); } catch { /* invalid header */ }
    }
  }
  const contentType = responseHeaders.get("content-type") || "";
  let payload: BodyInit | null = null;
  if (response.data != null) {
    if (typeof response.data === "object") {
      payload = JSON.stringify(response.data);
      if (!contentType) responseHeaders.set("content-type", "application/json");
    } else if (contentType.toLowerCase().includes("json")) {
      payload = String(response.data);
    } else if (typeof response.data === "string") {
      // Native responseType=arraybuffer normally returns base64, including error bodies.
      // Some gateways instead pass ordinary error text; keep the real HTTP error visible.
      try {
        const raw = atob(response.data);
        const bytes = Uint8Array.from(raw, char => char.charCodeAt(0));
        payload = contentType.toLowerCase().startsWith("text/")
          ? new TextDecoder().decode(bytes)
          : bytes as BodyInit;
      } catch {
        payload = response.data;
      }
    }
  }
  return new Response([204, 205, 304].includes(response.status) ? null : payload, {
    status: response.status,
    headers: responseHeaders,
  });
}
