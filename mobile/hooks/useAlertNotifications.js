import { useEffect, useRef } from 'react';
import { fetchMobileEvents } from '../api/events';
import {
  clearAlertNotifications,
  onNotificationTapped,
  registerForNotifications,
  showAlertNotification,
} from '../notifications';
import { AppState } from 'react-native';

const POLL_MS = 5000;
const MAX_BANNERS_PER_POLL = 3;

/**
 * Keeps the lifeguard notified while signed in, whichever tab is open:
 * registers for push, polls for new pending alerts, shows a banner for each,
 * and reports the pending count for the tab badge.
 *
 * Broadcasts arrive as a remote push when push is set up, so they only get a
 * local banner when it isn't (e.g. Expo Go on Android).
 */
export function useAlertNotifications(token, { onPendingCount, onOpenAlert } = {}) {
  const seen = useRef(null);
  const lastPendingCount = useRef(null);
  const pushReady = useRef(false);
  const callbacks = useRef({ onPendingCount, onOpenAlert });
  callbacks.current = { onPendingCount, onOpenAlert };

  useEffect(() => {
    if (!token) return undefined;
    let cancelled = false;
    seen.current = null;
    lastPendingCount.current = null;

    registerForNotifications(token).then((status) => {
      if (!cancelled) pushReady.current = status.push;
    });

    const poll = async () => {
      const result = await fetchMobileEvents(token, { alertsOnly: true, status: 'pending', limit: 20 });
      if (cancelled || !result.ok) return;
      const pendingCount = Number(result.pendingCount || 0);
      callbacks.current.onPendingCount?.(pendingCount);

      const events = result.events || [];
      if (pendingCount === 0 && lastPendingCount.current !== 0) {
        clearAlertNotifications().catch(() => {});
      }
      lastPendingCount.current = pendingCount;

      if (seen.current === null) {
        // Alerts already waiting at sign-in are shown in the list, not re-announced.
        seen.current = new Set(events.map((e) => e.id));
        return;
      }
      const fresh = events.filter((e) => !seen.current.has(e.id));
      // Rebuild from the server response so a reset removes stale local ids too.
      seen.current = new Set(events.map((e) => e.id));
      fresh
        .filter((e) => !(e.category === 'broadcast' && pushReady.current))
        .slice(0, MAX_BANNERS_PER_POLL)
        .forEach(showAlertNotification);
    };

    poll();
    const id = setInterval(poll, POLL_MS);
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') poll();
    });
    const unsubscribe = onNotificationTapped((data) => callbacks.current.onOpenAlert?.(data));
    return () => {
      cancelled = true;
      clearInterval(id);
      appStateSubscription.remove();
      unsubscribe();
    };
  }, [token]);
}
