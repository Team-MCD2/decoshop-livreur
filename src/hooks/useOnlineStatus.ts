import { useEffect, useState } from 'react';

/**
 * Reactive `navigator.onLine` snapshot.
 *
 * Returns `true` when the browser believes it has network connectivity,
 * `false` otherwise. Updates on the `online` and `offline` window events.
 *
 * NB : `navigator.onLine` reflects what the OS reports, not whether our
 * actual backend is reachable. A phone connected to wifi-without-internet
 * will still report `online: true`. The replay logic in
 * `useOfflineQueue` handles that gracefully — RPCs that fail with a
 * network error are re-queued for the next attempt, so a "lying" online
 * state at worst means one extra failed-then-retried mutation.
 *
 * For SSR safety we default to `true` when `navigator` is undefined
 * (server) — the PWA is a SPA, so this only matters for tests running
 * in node without jsdom.
 */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState<boolean>(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );

  useEffect(() => {
    const onOnline  = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener('online',  onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online',  onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  return online;
}
