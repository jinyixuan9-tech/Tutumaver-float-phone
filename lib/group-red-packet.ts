import { loadChatMessages, updateMessageMediaData, type ChatMessage } from './chat-storage';
import { recordWalletCredit, walletCurrency } from './wallet-storage';
import type { WalletCurrency } from './wallet-types';

export function moneyUnits(currency: WalletCurrency): number { return currency === 'KRW' || currency === 'JPY' ? 1 : 100; }
/** Integer minor units keep each award positive and the final total exact. */
export function calculatePacketShare(total: number, amounts: number[], count: number, currency: WalletCurrency, random = Math.random): number {
    const units = moneyUnits(currency);
    const remaining = Math.round(total * units) - amounts.reduce((sum, value) => sum + Math.round(value * units), 0);
    const left = count - amounts.length;
    if (left < 1 || remaining < left) return 0;
    if (left === 1) return remaining / units;
    const max = Math.min(remaining - left + 1, Math.max(1, Math.floor(remaining / left * 2)));
    return (1 + Math.min(max - 1, Math.floor(Math.max(0, Math.min(.999999999, random())) * max))) / units;
}

export function claimGroupPacket(message: ChatMessage, recipient: { id: string; name: string; characterId?: string; userIdentityId?: string }): { message?: ChatMessage; error?: string; amount?: number } {
    // No await between reading current claims, crediting the ledger and saving the award.
    const latest = loadChatMessages(message.sessionId).find(m => m.id === message.id);
    if (!latest || latest.mediaType !== 'red_packet') return { error: '红包不存在' };
    const d = latest.mediaData || {};
    const claims = d.packetClaims || [];
    const names = d.claimedBy || [];
    if (claims.some(c => c.recipientId === recipient.id) || (!claims.length && names.includes(recipient.name)) || names.some(name => name === recipient.name && !claims.some(c => c.name === name))) return { error: '你已经领过这个红包了' };
    const count = Math.max(1, Math.floor(d.count || 1));
    if (d.status === 'opened' || names.length >= count) return { error: '红包已领完' };
    if (d.status === 'declined') return { error: '红包已失效' };
    const currency = walletCurrency(d.currency);
    const previous = claims.length === names.length ? claims.map(c => c.amount) : names.map(n => d.claimedAmounts?.[n] || 0);
    let amount = calculatePacketShare(d.amount || 0, previous, count, currency);
    if (amount <= 0) return { error: '红包金额不足以分配剩余份数' };
    const result = recordWalletCredit({ ownerId: recipient.characterId, userIdentityId: recipient.userIdentityId,
        amount, currency, title: '领取群红包', category: '红包', detail: `领取 ${latest.senderName || (latest.role === 'user' ? '自己' : '群成员')} 的红包`, relatedMessageId: `${latest.id}:claim:${recipient.id}` });
    if (!result.ok || !result.transaction) return { error: result.error || '领取失败，请重试' };
    // If an earlier ledger write survived an interrupted message save, restore that exact award.
    const tx = result.transaction;
    amount = tx.originalCurrency === currency && tx.originalAmount != null ? tx.originalAmount : tx.currency === currency ? tx.amount : amount;
    const packetClaims = [...claims, { recipientId: recipient.id, name: recipient.name, amount, transactionId: result.transaction.id }];
    const updated: ChatMessage = { ...latest, mediaData: { ...d, packetClaims,
        claimedBy: [...names, recipient.name], claimedAmounts: { ...d.claimedAmounts, [recipient.name]: amount },
        status: names.length + 1 >= count ? 'opened' : 'pending' } };
    updateMessageMediaData(latest.id, updated.mediaData!);
    return { message: updated, amount };
}
