import { NextResponse } from "next/server";
import { proxyFetch } from "@/lib/proxy-fetch";
export const runtime = "nodejs";
export const maxDuration = 30;
export async function POST(request: Request) {
    try {
        const body = await request.json().catch(() => null);
        const apiKey = typeof body?.apiKey === "string" ? body.apiKey.trim() : "";
        const upstream = await proxyFetch("https://api.elevenlabs.io/v1/models", {
            method: "GET", headers: apiKey ? { "xi-api-key": apiKey, Accept: "application/json" } : { Accept: "application/json" },
            signal: AbortSignal.timeout(20_000), cache: "no-store",
        });
        const data = await upstream.json().catch(() => null);
        if (!upstream.ok) {
            const detail = data?.detail?.message || data?.detail || data?.message;
            return NextResponse.json({ message: typeof detail === "string" ? detail.slice(0, 800) : `ElevenLabs 返回 HTTP ${upstream.status}` }, { status: upstream.status >= 400 && upstream.status < 500 ? upstream.status : 502, headers: { "Cache-Control": "no-store" } });
        }
        if (!Array.isArray(data)) throw new Error("ElevenLabs 模型列表格式无效");
        return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
        return NextResponse.json({ message: error instanceof Error && /Timeout|Abort/.test(error.name) ? "读取模型超时，请重试" : "模型读取失败，请稍后重试" }, { status: 502, headers: { "Cache-Control": "no-store" } });
    }
}
