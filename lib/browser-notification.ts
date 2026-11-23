import {isAndroidApp,nativeNotificationGranted,requestNativeNotifications,showNativeMessage} from "./android-notifications";
// lib/browser-notification.ts
// Browser Notification API wrapper for background alerts.

import { loadChatAppSettings } from "./chat-storage";

let _notifCounter = 0;

/** Check if notifications are enabled in app settings. */
export function isNotificationEnabled(): boolean {
    if (typeof window === "undefined") return false;
    if(isAndroidApp())return loadChatAppSettings().browserNotificationsEnabled===true&&nativeNotificationGranted();
    if (!("Notification" in window)) return false;
    const settings = loadChatAppSettings();
    return settings.browserNotificationsEnabled === true && Notification.permission === "granted";
}

/** Request notification permission from the browser. Returns true if granted. */
export async function requestNotificationPermission(): Promise<boolean> {
    if(isAndroidApp())return requestNativeNotifications();
    if (typeof window === "undefined" || !("Notification" in window)) return false;
    if (Notification.permission === "granted") return true;
    if (Notification.permission === "denied") return false;

    const result = await new Promise<NotificationPermission>((resolve) => {
        let settled = false;
        const finish = (permission: NotificationPermission) => {
            if (settled) return;
            settled = true;
            resolve(permission);
        };

        try {
            const request = Notification.requestPermission(finish);
            if (request && typeof request.then === "function") {
                request.then(finish).catch(() => finish(Notification.permission));
            }
        } catch {
            finish(Notification.permission);
        }

        window.setTimeout(() => finish(Notification.permission), 3000);
    });

    return result === "granted";
}

function constructNotification(title: string, payload: NotificationOptions): void {
    try {
        const notification = new Notification(title, payload);
        notification.onclick = () => {
            window.focus();
            const target = (payload.data as { url?: string } | undefined)?.url;
            if (target?.startsWith("/#lysn=")) window.location.hash = target.slice(1);
            else if(target)window.dispatchEvent(new CustomEvent("rabbit-notification-open",{detail:target}));
            notification.close();
        };
    } catch {
        // Android Chrome/Edge: "Illegal constructor" — handled by the SW path below.
    }
}

/**
 * Send a browser notification if enabled and page is hidden.
 * Does nothing if page is visible, permission denied, or setting is off.
 *
 * Android Chrome/Edge does NOT support the `new Notification()` constructor in
 * pages (throws Illegal constructor) — notifications there must go through the
 * service worker's showNotification(). We prefer the SW path everywhere and fall
 * back to the constructor (desktop / dev where the SW isn't registered).
 */
export function sendBrowserNotification(
    title: string,
    options?: { body?: string; icon?: string; url?: string; independent?: boolean },
): void {
    if(options?.independent)return; // Only Chat retains real-system notifications in resource022.
    if (!(options?.independent && isAndroidApp() ? nativeNotificationGranted() : isNotificationEnabled())) return;
    if (!document.hidden) return;

    if(isAndroidApp()){void showNativeMessage(title,options?.body,options?.url).catch(console.warn);return;}
    const payload: NotificationOptions = {
        body: options?.body,
        icon: options?.icon || "/icon-192.png",
        tag: `ai-phone-${Date.now()}-${_notifCounter++}`,
        data: options?.url ? { url: options.url, type: "lysn" } : undefined,
    };

    if ("serviceWorker" in navigator) {
        // `ready` never rejects and may hang forever when no SW is registered
        // (dev mode) — race it with a short timeout, then fall back.
        const timeout = new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 800));
        Promise.race([navigator.serviceWorker.ready, timeout])
            .then((registration) => {
                if (registration && typeof registration.showNotification === "function") {
                    return registration.showNotification(title, payload);
                }
                constructNotification(title, payload);
            })
            .catch(() => constructNotification(title, payload));
        return;
    }
    constructNotification(title, payload);
}
