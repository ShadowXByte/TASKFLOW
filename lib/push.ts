import webpush from "web-push";

let initialized = false;

export const getVapidPublicKey = () => process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";

export const isPushConfigured = () =>
  Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT);

export const initWebPush = () => {
  if (initialized || !isPushConfigured()) {
    return;
  }

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT as string,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY as string,
    process.env.VAPID_PRIVATE_KEY as string,
  );
  initialized = true;
};

export const sendWebPush = async (
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  payload: Record<string, string>,
) => {
  initWebPush();
  return webpush.sendNotification(subscription, JSON.stringify(payload));
};
