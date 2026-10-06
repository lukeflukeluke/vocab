import { registerSW } from 'virtual:pwa-register';

/** Registers the service worker and reports once the app can work offline. */
export function startServiceWorker(onOfflineReady: () => void): void {
  if (!('serviceWorker' in navigator)) return;
  // Already installed on an earlier visit: the cached app is serving this page.
  if (navigator.serviceWorker.controller) onOfflineReady();
  registerSW({ immediate: true, onOfflineReady });
}

/**
 * Asks the browser not to clear this app's storage under pressure. Returns null when the
 * browser cannot say. The sync server (build session S6) is the real safety net.
 */
export async function requestPersistentStorage(): Promise<boolean | null> {
  if (!navigator.storage?.persist) return null;
  if (await navigator.storage.persisted()) return true;
  return navigator.storage.persist();
}

/** True when running as an installed app rather than a browser tab. */
export function isInstalled(): boolean {
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return iosStandalone || window.matchMedia('(display-mode: standalone)').matches;
}

export function isIos(): boolean {
  return /iPhone|iPad|iPod/.test(navigator.userAgent);
}
