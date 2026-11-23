import { Capacitor, CapacitorHttp } from '@capacitor/core';

export function usesAndroidTtsTransport(): boolean {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

/** Explicit TTS transport only: never reroutes other API requests or follows redirects with keys. */
export async function fetchAndroidTts(url: string, init: RequestInit): Promise<Response> {
    const endpoint = new URL(url);
    if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password) {
        throw new Error('安卓语音接口请使用不含用户名或密码的 HTTPS 地址');
    }
    const signal = init.signal;
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const pending = CapacitorHttp.request({
        url: endpoint.href,
        method: init.method || 'POST',
        headers: Object.fromEntries(new Headers(init.headers).entries()),
        data: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
        responseType: 'arraybuffer',
        connectTimeout: 30_000,
        readTimeout: 120_000,
        disableRedirects: true,
    });
    const result = await new Promise<Awaited<typeof pending>>((resolve, reject) => {
        const abort = () => reject(new DOMException('Aborted', 'AbortError'));
        signal?.addEventListener('abort', abort, { once: true });
        pending.then(resolve, reject).finally(() => signal?.removeEventListener('abort', abort));
        if (signal?.aborted) abort();
    });
    if (result.status >= 300 && result.status < 400) {
        throw new Error('语音接口发生重定向，请填写最终的 HTTPS API 地址');
    }
    const contentType = Object.entries(result.headers).find(([key]) => key.toLowerCase() === 'content-type')?.[1] || '';
    let bytes: Uint8Array<ArrayBuffer>;
    // Capacitor parses JSON and error responses before applying responseType.
    if (contentType.toLowerCase().includes('json')) {
        bytes = new TextEncoder().encode(JSON.stringify(result.data));
    } else if (result.status >= 400) {
        bytes = new TextEncoder().encode(typeof result.data === 'string' ? result.data : JSON.stringify(result.data));
    } else {
        const binary = atob(String(result.data));
        bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
    }
    return new Response([204, 205, 304].includes(result.status) ? null : bytes, {
        status: result.status,
        headers: result.headers,
    });
}
