import type { ChatMessage } from "./chat-storage";

/** Source-aware label; tolerate older cards that predate the explicit source field. */
export function chatGiftSourceLabel(data: ChatMessage["mediaData"]): "外卖" | "购物" | "礼物" {
    if (data?.giftSource === "takeout" || data?.takeoutOrderId || data?.label === "外卖卡") return "外卖";
    if (data?.giftSource === "warehouse") return "礼物";
    if (data?.giftSource === "shopping" || data?.shoppingOrderId || data?.shoppingGiftId?.includes("::")) return "购物";
    return "礼物";
}
