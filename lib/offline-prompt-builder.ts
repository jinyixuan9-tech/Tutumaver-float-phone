// lib/offline-prompt-builder.ts
// 线下聊天历史构造：把「线下轮次」（ChatOfflineTurn）转成与线上同构的 ChatMessage[]。
// assistant 消息内容用 <content> + 摘要 XML 包裹，与真实线下生成（generateOfflineChatCompletion
// / generateGroupOfflineChatCompletion）完全一致。
// chat-room（真实发送）与提示词查看器（预览）共用本模块，保证「预览 = 即将发出的提示词」。

import type { ChatSession, ChatMessage } from "./chat-storage";
import { loadChatOfflineSceneState } from "./chat-offline-storage";
import type { ChatOfflineTurn } from "./chat-offline-storage";
import {loadBindingConfig,loadApiConfigs,resolveBinding} from "./settings-storage";

export function formatOfflineTurnXml(turn: ChatOfflineTurn): string {
    if (turn.rawText?.trim()) return turn.rawText.trim();
    const summaryTag = turn.summaryTag?.trim() || "summary";
    // rawText 缺失（旧数据）时重建完整 XML：思维链（thinkingText）存在则按原标签拼回，
    // 保证历史上下文里保留这一轮的思考内容
    const thinkingTag = turn.thinkingTag?.trim() || "thinking";
    const thinkingBlock = turn.thinkingText?.trim()
        ? `<${thinkingTag}>\n${turn.thinkingText.trim()}\n</${thinkingTag}>`
        : "";
    return [
        thinkingBlock,
        "<content>",
        turn.assistantContent,
        "</content>",
        `<${summaryTag}>`,
        turn.summary,
        `</${summaryTag}>`,
    ].filter(Boolean).join("\n");
}

/** Only explicitly described scene/interactive pictures enter future context; decorative pictures stay private to the UI. */
export function offlineImageContext(image: ChatOfflineTurn["userImage"]): string {
    if (!image || image.usage === "decoration") return "";
    const description = (image.description||image.prompt).trim();
    // File names are not vision results. If the user provided no description, do not invent what the picture shows.
    if (!description || description === "相册图片" || /\.(?:jpg|jpeg|png|gif|webp|heic)$/i.test(description)) {
        return image.usage === "interactive"
            ? "\n[线下互动图：存在一张图片，但当前没有可验证的画面描述；不可假装识别了画面。]"
            : "\n[线下场景参考图：图片存在，尚无已确认的画面描述。]";
    }
    const purpose = image.usage === "interactive" ? "互动图，角色可根据当时是否在场自然反应" : "场景参考图，作为后续环境参考，不必特意提及";
    return `\n[线下${purpose}；以下为${image.recognition==='manual'?'用户确认的独立识图描述':'用户填写的画面描述，不是模型视觉识别'}：${description.slice(0,1200)}]`;
}

export function buildOfflinePromptHistory(
    session: ChatSession,
    turns: ChatOfflineTurn[],
    pendingUserContent: string,
    pendingImage?: ChatOfflineTurn["userImage"],
): ChatMessage[] {
    const history: ChatMessage[] = [];
    const binding=resolveBinding(loadBindingConfig(),session.isGroup?undefined:session.contactId,session.isGroup?"group_chat":"chat");
    const hasVision=loadApiConfigs().some(item=>item.id===binding.apiConfigId&&item.enableImageRecognition===true);
    // Keep story prose intact: image-only ChatMessage is separate because the renderer
    // formats mediaType=image as a photo directive instead of a text paragraph.
    const attach=(image:ChatOfflineTurn["userImage"],id:string,role:"user"|"assistant",at:string) => {
        if(!image || image.usage==="decoration" || image.recognition==="manual" || !image.ref || !hasVision)return;
        history.push({id,sessionId:session.id,role,content:offlineImageContext(image),mediaType:"image",mediaUrl:image.ref,mediaData:{label:"线下场景图片（实际视觉数据，角色只根据可识别内容判断）"},status:"sent",createdAt:at});
    };
    const scene = loadChatOfflineSceneState(session.id)?.active;
    const storyBase = scene ? (scene.storyStartedAt || scene.startedAt) : null;
    for (const turn of turns) {
        const assistantAt = storyBase ? new Date(new Date(storyBase).getTime() + history.length + 1).toISOString() : turn.createdAt;
        const userAtMs = new Date(assistantAt).getTime() - 1;
        const userAt = Number.isFinite(userAtMs) ? new Date(userAtMs).toISOString() : turn.createdAt;
        if (turn.userContent.trim()) {
            history.push({
                id: `${turn.id}_user`,
                sessionId: session.id,
                role: "user",
                content: turn.userContent + (turn.userImage?.futureOnly?"":offlineImageContext(turn.userImage)),
                status: "sent",
                createdAt: userAt,
            });
            if(!turn.userImage?.futureOnly)attach(turn.userImage,`${turn.id}_user_image`,"user",userAt);
        }
        history.push({
            id: `${turn.id}_assistant`,
            sessionId: session.id,
            role: "assistant",
            content: (scene ? `<content>\n${turn.assistantContent}\n</content>` : formatOfflineTurnXml(turn)) + (turn.assistantImage?.futureOnly?"":offlineImageContext(turn.assistantImage)),
            status: "sent",
            createdAt: assistantAt,
            ...(session.isGroup ? { senderName: session.groupName || "群聊线下" } : {}),
        });
        if(!turn.assistantImage?.futureOnly)attach(turn.assistantImage,`${turn.id}_assistant_image`,"assistant",assistantAt);
    }
    for(const turn of turns){for(const image of [turn.userImage,turn.assistantImage]){
        if(!image?.futureOnly||image.usage==='decoration')continue;
        history.push({id:`${turn.id}_supplement_${image.id}`,sessionId:session.id,role:'user',content:'[这是后来补充的图片参考，不代表角色在原楼层当时已经知道，不修改既有事实。]'+offlineImageContext(image),status:'sent',createdAt:new Date().toISOString()});
        attach(image,`${turn.id}_supplement_visual_${image.id}`,'user',new Date().toISOString());
    }}
    if (pendingUserContent.trim() || pendingImage) {
        history.push({
            id: `offline_pending_${Date.now()}`,
            sessionId: session.id,
            role: "user",
            content: pendingUserContent.trim() + (pendingImage?.targetRole==="assistant"&&pendingImage.usage!=="decoration"?"\n[用户指定下一轮对方画面：请结合本轮文字参考此图续写；图片将展示在你的回复下方，不代表必须描写发送照片。]":"") + offlineImageContext(pendingImage),
            status: "sent",
            createdAt: storyBase ? new Date(new Date(storyBase).getTime() + history.length + 2).toISOString() : new Date().toISOString(),
        });
        attach(pendingImage,`offline_pending_image_${Date.now()}`,"user",new Date().toISOString());
    }
    return history;
}
