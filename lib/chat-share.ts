export type MusicChatSharePayload = {
    type: "music";
    title: string;
    artist: string;
};

export type XiaohongshuNoteChatSharePayload = {
    type: "xiaohongshu_note";
    noteId?: string;
    comments?: import("./xiaohongshu-types").XiaohongshuComment[];
    authorName: string;
    title: string;
    body: string;
    description?: string;
    noteType: "post" | "video";
    tags?: string[];
    imageAssetId?: string;
    coverIcon?: string;
    tone?: string;
};

export type ChatSharePayload = MusicChatSharePayload | XiaohongshuNoteChatSharePayload;

function compactShareText(value: string | undefined, fallback: string): string {
    const text = (value || "").replace(/\s+/g, " ").trim();
    return text || fallback;
}

export function formatXiaohongshuShareForPrompt(input: {
    author?: string;
    title?: string;
    body?: string;
    description?: string;
    comments?: import("./xiaohongshu-types").XiaohongshuComment[];
}): string {
    const author = compactShareText(input.author, "未知作者");
    const title = compactShareText(input.title, "无标题");
    const body = compactShareText(input.body, "无正文内容");
    const description = compactShareText(input.description, "");
    return `分享了一条小红书帖子，作者：${author}, 标题：${title}, 正文内容：${body}，图片/视频描述：${description || "无"}${input.comments?.length ? "，分享时评论：" + JSON.stringify(input.comments.slice(0,5).map(c=>({author:c.authorName,text:c.text,replyTo:c.replyTo}))) : ""}`;
}

export function xiaohongshuShareMessage(sessionId: string, share: XiaohongshuNoteChatSharePayload) {
    const content = formatXiaohongshuShareForPrompt({
        author: share.authorName,
        title: share.title,
        body: share.body,
        description: share.description,
        comments: share.comments,
    });
    return {
        sessionId,
        role: "user" as const,
        content,
        mediaType: "xiaohongshu_note_share" as const,
        mediaData: {
            xiaohongshuNoteId: share.noteId,
            xiaohongshuComments: share.comments?.map(comment=>({...comment})),
            xiaohongshuAuthor: share.authorName,
            xiaohongshuTitle: share.title,
            xiaohongshuBody: share.body,
            xiaohongshuDescription: share.description,
            xiaohongshuNoteType: share.noteType,
            xiaohongshuTags: share.tags,
            xiaohongshuImageAssetId: share.imageAssetId,
            xiaohongshuCoverIcon: share.coverIcon,
            xiaohongshuTone: share.tone,
        },
    };
}
