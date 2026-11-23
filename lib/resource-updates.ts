import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { isAndroidApp } from './android-runtime';
export type ResourceVersion = {resourceId: string; label: string; sequence: number; notes: string};
export type ResourceUpdateState = {nativeBuild: number; highest: number; active: ResourceVersion; staged?: ResourceVersion; pending: boolean; message: string; canRollback: boolean; cancelled?: boolean};
export type OnlineResourceCandidate = {assetId:string|number;sequence:number;nativeBuild:number;fileName:string;size:number;label:string;notes:string};
export type OnlineResourceCheck = {available:boolean;candidate:OnlineResourceCandidate|null;otherBuilds:boolean};
export const FloatUpdates = registerPlugin<{
    checkOnline(): Promise<OnlineResourceCheck>;
    downloadOnline(options:{assetId:string|number}): Promise<ResourceUpdateState>;
    addListener(event:'downloadProgress',listener:(progress:{received:number;total:number})=>void): Promise<PluginListenerHandle>;
    getState(): Promise<ResourceUpdateState>;
    choosePackage(): Promise<ResourceUpdateState>;
    activate(options: {resourceId: string}): Promise<void>;
    markReady(options: {resourceId: string}): Promise<void>;
    rollback(): Promise<void>;
}>('FloatUpdates');
/** Called after the main screen hydrates successfully, never merely on script download. */
export async function acknowledgeResourceStartup() {
    if (!isAndroidApp()) return;
    try { const state = await FloatUpdates.getState(); if (state.pending) await FloatUpdates.markReady({resourceId: state.active.resourceId}); }
    catch (error) { console.warn('[FloatUpdates] startup acknowledgement failed', error); }
}

export async function prepareResourceReload() {
    // Drain new-message/KV queues and wait behind earlier chat transactions before reloading.
    const [{flushKvWrites},{chatDb,flushPendingChatMessages}] = await Promise.all([import('./kv-db'),import('./chat-db')]);
    await Promise.all([flushKvWrites(),flushPendingChatMessages()]);
    await chatDb.transaction('r',chatDb.messages,chatDb.sessions,chatDb.contacts,async()=>{await Promise.all([chatDb.messages.count(),chatDb.sessions.count(),chatDb.contacts.count()]);});
}
