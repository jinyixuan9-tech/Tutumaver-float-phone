import { NextResponse } from "next/server";
import { proxyFetch } from "@/lib/proxy-fetch";

export const runtime = "nodejs";
export const maxDuration = 120;

type ElevenLabsTtsBody = {
    apiKey?: unknown;
    model?: unknown;
    voiceId?: unknown;
    text?: unknown;
};

function cleanString(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request) {
    try {
        const parsed: unknown = await request.json().catch(() => null);
        const body = (parsed && typeof parsed === "object" ? parsed : {}) as ElevenLabsTtsBody;
        const apiKey = cleanString(body.apiKey);
        const text = cleanString(body.text);
        const voiceId = cleanString(body.voiceId);
        const model = cleanString(body.model) || "eleven_multilingual_v2";

        if (!apiKey) {
            return NextResponse.json({ error: "missing_api_key", message: "ElevenLabs API Key 未配置" }, { status: 400 });
        }
        if (!text) {
            return NextResponse.json({ error: "missing_text", message: "语音文本不能为空" }, { status: 400 });
        }
        if (!/^[A-Za-z0-9_-]{1,128}$/.test(voiceId)) {
            return NextResponse.json({ error: "invalid_voice_id", message: "请填写有效的 ElevenLabs Voice ID（不是音色名称或网页链接）" }, { status: 400 });
        }
        if (!/^[A-Za-z0-9._-]{1,100}$/.test(model)) {
            return NextResponse.json({ error: "invalid_model", message: "ElevenLabs 模型 ID 格式无效" }, { status: 400 });
        }

        const upstream = await proxyFetch(
            `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,
            {
                method: "POST",
                signal: AbortSignal.timeout(110_000),
                headers: { "xi-api-key": apiKey, "Content-Type": "application/json", Accept: "audio/mpeg" },
                body: JSON.stringify({ text, model_id: model }),
            },
        );

        if (!upstream.ok) {
            const raw = await upstream.text().catch(() => "");
            let message = raw;
            try {
                const data = JSON.parse(raw);
                const detail = data?.detail?.message || data?.detail || data?.message || data?.error;
                message = typeof detail === "string" ? detail : detail ? JSON.stringify(detail) : raw;
            } catch { /* 非 JSON 错误保留原文 */ }
            return NextResponse.json(
                { error: "elevenlabs_tts_failed", message: message.slice(0, 1200) || `ElevenLabs 请求失败（HTTP ${upstream.status}）`, upstreamStatus: upstream.status },
                { status: upstream.status >= 400 && upstream.status < 500 ? upstream.status : 502 },
            );
        }

        const audio = await upstream.arrayBuffer();
        if (!audio.byteLength) throw new Error("ElevenLabs 未返回音频数据");
        return new Response(audio, {
            status: 200,
            headers: { "Content-Type": upstream.headers.get("content-type") || "audio/mpeg", "Cache-Control": "no-store" },
        });
    } catch (error: unknown) {
        const message = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")
            ? "ElevenLabs 语音合成超时，请稍后重试"
            : error instanceof Error ? error.message : String(error);
        return NextResponse.json(
            { error: "elevenlabs_tts_proxy_failed", message: message.slice(0, 800) || "ElevenLabs 代理请求失败" },
            { status: 502 },
        );
    }
}
