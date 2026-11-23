import { NextRequest, NextResponse } from "next/server";
import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import { Agent, fetch as fetchPinned } from "undici";

export const runtime = "nodejs";
export const maxDuration = 60;
const MAX_BYTES = 10 * 1024 * 1024;
const blocked = new BlockList();
for (const [address, prefix] of [["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4]] as const) blocked.addSubnet(address, prefix, "ipv4");
const publicIpv6 = new BlockList();
publicIpv6.addSubnet("2000::", 3, "ipv6");
blocked.addSubnet("2001::", 32, "ipv6");
blocked.addSubnet("2001:db8::", 32, "ipv6");
blocked.addSubnet("2002::", 16, "ipv6");

function isPublicPhotoAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return !blocked.check(address, "ipv4");
  if (family === 6) return publicIpv6.check(address, "ipv6") && !blocked.check(address, "ipv6");
  return false;
}

async function imageDispatcher(url: URL): Promise<Agent> {
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || (url.port && !["80", "443"].includes(url.port))) throw new Error("需要使用公开的 http/https 图片直链。");
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || /\.(?:localhost|local|internal)$/.test(host)) throw new Error("无法导入本机或内网链接。");
  const addresses = isIP(host) ? [{ address: host, family: isIP(host) }] : await lookup(host, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(item => !isPublicPhotoAddress(item.address))) throw new Error("无法导入本机或内网链接。");
  // 固定本次连接的 DNS 结果；每次重定向重新校验，避免 DNS 重绑定和内网跳转。
  return new Agent({ connect: { lookup: (_hostname, options, callback) => {
    const selected = addresses.find(item => !options.family || options.family === item.family) ?? addresses[0];
    if (options.all) callback(null, addresses);
    else callback(null, selected.address, selected.family);
  } } });
}

export async function POST(request: NextRequest) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  const abort = () => controller.abort();
  request.signal.addEventListener("abort", abort, { once: true });
  let dispatcher: Agent | undefined;
  try {
    const body = await request.json();
    if (typeof body.url !== "string" || body.url.length > 4096) throw new Error("图片链接格式不正确。");
    let url: URL;
    try { url = new URL(body.url); } catch { throw new Error("图片链接格式不正确。"); }
    for (let redirects = 0; redirects <= 3; redirects++) {
      dispatcher = await imageDispatcher(url);
      const response = await fetchPinned(url, { dispatcher, redirect: "manual", signal: controller.signal, headers: { Accept: "image/avif,image/webp,image/png,image/jpeg,image/gif" } });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        await response.body?.cancel();
        await dispatcher.close(); dispatcher = undefined;
        if (!location || redirects === 3) throw new Error("图片链接跳转过多，请使用最终图片直链。");
        url = new URL(location, url);
        continue;
      }
      if (!response.ok) { await response.body?.cancel(); throw new Error(`图片下载失败（HTTP ${response.status}），链接可能已失效或禁止外部下载。`); }
      const contentType = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
      if (!["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"].includes(contentType)) { await response.body?.cancel(); throw new Error("链接没有返回支持的图片，请使用 JPG、PNG、WebP、GIF 或 AVIF 图片直链。"); }
      if (Number(response.headers.get("content-length")) > MAX_BYTES) { await response.body?.cancel(); throw new Error("单张图片不能超过 10 MB。"); }
      const chunks: Uint8Array[] = [];
      let size = 0;
      if (!response.body) throw new Error("图片内容为空。");
      for await (const chunk of response.body) {
        size += chunk.byteLength;
        if (size > MAX_BYTES) { controller.abort(); throw new Error("单张图片不能超过 10 MB。"); }
        chunks.push(chunk);
      }
      if (!size) throw new Error("图片内容为空。");
      return new NextResponse(Buffer.concat(chunks), { headers: { "Content-Type": contentType, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
    }
    throw new Error("图片下载失败。");
  } catch (error) {
    const message = error instanceof Error && error.name !== "AbortError" ? error.message : "图片下载超时或已取消，请重试。";
    return NextResponse.json({ error: message }, { status: 400, headers: { "Cache-Control": "no-store" } });
  } finally {
    clearTimeout(timer); request.signal.removeEventListener("abort", abort);
    await dispatcher?.destroy().catch(() => {});
  }
}
