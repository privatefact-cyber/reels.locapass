/** ロカわんのiPhoneアプリ(Capacitor)の通知プラグインへの入り口。ブラウザ(Web)では null。 */
export const APP_PUSH_TOKEN_KEY = "locawan_apns_token";
export const APP_PUSH_OFF_KEY = "locawan_push_off";

export type AppPushPlugin = {
  checkPermissions: () => Promise<{ receive: "prompt" | "prompt-with-rationale" | "granted" | "denied" }>;
  requestPermissions: () => Promise<{ receive: "prompt" | "prompt-with-rationale" | "granted" | "denied" }>;
  register: () => Promise<void>;
  unregister: () => Promise<void>;
  addListener: (
    event: "registration" | "pushNotificationActionPerformed",
    cb: (data: { value: string; notification?: { data?: { url?: unknown } } }) => void,
  ) => Promise<{ remove: () => Promise<void> | void }>;
};

export function isLocaWanApp(): boolean {
  return typeof navigator !== "undefined" && navigator.userAgent.includes("LocaWanApp");
}

export function getAppPush(): AppPushPlugin | null {
  const cap = (window as unknown as { Capacitor?: { Plugins?: Record<string, unknown> } }).Capacitor;
  return (cap?.Plugins?.PushNotifications as AppPushPlugin | undefined) ?? null;
}
