'use client';

import { useCallback, useState } from 'react';
import {
  safeStorageSetItem,
} from '../utils/storage';
import {
  urlBase64ToUint8Array,
} from '../utils/taskHelpers';
import {
  NOTIFICATION_ASKED_KEY,
  SW_PATH,
} from '../utils/constants';

interface UsePushNotificationsProps {
  workspaceMode: 'guest' | 'account';
  status: 'authenticated' | 'loading' | 'unauthenticated';
  notificationPermission: NotificationPermission | 'unsupported';
  deferredInstallPrompt: any; // BeforeInstallPromptEvent or null
}

export function usePushNotifications({
  workspaceMode,
  status,
  notificationPermission,
  deferredInstallPrompt,
}: UsePushNotificationsProps) {
  const [pushConfigured, setPushConfigured] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushStatusMessage, setPushStatusMessage] = useState("");

  const syncPushSubscription = useCallback(
    async (permission: NotificationPermission) => {
      try {
        setPushStatusMessage("");
        if (
          workspaceMode !== "account" ||
          status !== "authenticated" ||
          typeof window === "undefined" ||
          !("serviceWorker" in navigator) ||
          !("PushManager" in window)
        ) {
          setPushEnabled(false);
          setPushStatusMessage("Push is available only in account mode on supported browsers.");
          return;
        }

        const configResponse = await fetch("/api/push/subscribe", { cache: "no-store" });
        if (!configResponse.ok) {
          setPushConfigured(false);
          setPushEnabled(false);
          setPushStatusMessage("Push config could not be loaded.");
          return;
        }

        const config = (await configResponse.json()) as { configured?: boolean; vapidPublicKey?: string };
        const vapidPublicKey = config.vapidPublicKey || "";
        const isConfigured = Boolean(config.configured && vapidPublicKey);
        setPushConfigured(isConfigured);

        if (!isConfigured) {
          setPushEnabled(false);
          setPushStatusMessage("Push is not configured on the server.");
          return;
        }

        const existingRegistration = await navigator.serviceWorker.getRegistration(SW_PATH);
        const registration = existingRegistration || (await navigator.serviceWorker.register(SW_PATH));
        await navigator.serviceWorker.ready;
        const existingSubscription = await registration.pushManager.getSubscription();

        if (permission !== "granted") {
          if (existingSubscription) {
            const endpoint = existingSubscription.endpoint;
            await existingSubscription.unsubscribe();
            await fetch("/api/push/subscribe", {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ endpoint }),
            });
          }
          setPushEnabled(false);
          setPushStatusMessage("Notification permission is not granted.");
          return;
        }

        const subscription =
          existingSubscription ||
          (await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
          }));

        const json = subscription.toJSON();
        if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
          setPushEnabled(false);
          setPushStatusMessage("Push subscription data is incomplete.");
          return;
        }

        const response = await fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({
            endpoint: json.endpoint,
            keys: {
              p256dh: json.keys.p256dh,
              auth: json.keys.auth,
            },
          }),
        });

        setPushEnabled(response.ok);
        setPushStatusMessage(response.ok ? "Push notifications are active." : "Failed to save push subscription.");
      } catch (error) {
        setPushEnabled(false);
        const message = error instanceof Error ? error.message : "Push activation failed.";
        setPushStatusMessage(message);
      }
    },
    [workspaceMode, status]
  );

  const requestNotificationPermission = useCallback(async () => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      // setNotificationPermission is handled by parent
      setPushStatusMessage("This browser does not support notifications.");
      return;
    }

    safeStorageSetItem(NOTIFICATION_ASKED_KEY, "1");
    const permission =
      Notification.permission === "granted"
        ? "granted"
        : await Notification.requestPermission().catch(() => "default" as NotificationPermission);
    
    if (permission === "denied") {
      setPushEnabled(false);
      setPushStatusMessage("Notifications are blocked in browser settings.");
      return;
    }

    await syncPushSubscription(permission);
  }, [syncPushSubscription]);

  const triggerInstallPrompt = useCallback(async () => {
    if (!deferredInstallPrompt) {
      return;
    }

    try {
      await deferredInstallPrompt.prompt();
      const choice = await deferredInstallPrompt.userChoice;
      if (choice.outcome === "accepted") {
        // Parent will handle setCanInstallApp(false)
      }
    } catch {
      return;
    }
  }, [deferredInstallPrompt]);

  return {
    pushConfigured,
    pushEnabled,
    pushStatusMessage,
    setPushEnabled,
    setPushStatusMessage,
    setPushConfigured,
    syncPushSubscription,
    requestNotificationPermission,
    triggerInstallPrompt,
  };
}
