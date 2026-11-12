import { useEffect } from 'react';
import { AppState } from 'react-native';

/**
 * Runs a stable refresh callback immediately, on an interval, and whenever the
 * app returns to the foreground. Pass enabled=false when no session is active.
 */
export function useAutoRefresh(refresh, intervalMs, enabled = true, streamUrl = null) {
  useEffect(() => {
    if (!enabled) return undefined;

    refresh();
    const intervalId = setInterval(refresh, intervalMs);
    const stream = streamUrl && typeof EventSource !== 'undefined' ? new EventSource(streamUrl) : null;
    stream?.addEventListener?.('alerts', refresh);
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });

    return () => {
      clearInterval(intervalId);
      stream?.close?.();
      appStateSubscription.remove();
    };
  }, [enabled, intervalMs, refresh, streamUrl]);
}
