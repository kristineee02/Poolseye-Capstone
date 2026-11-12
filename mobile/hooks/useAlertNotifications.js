import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { fetchMobileEvents } from '../api/events';
import {
  alertCollapseKey,
  clearAlertNotifications,
  dismissStaleAlertNotifications,
  onNotificationTapped,
  presentedCollapseKeys,
  registerForNotifications,
  showAlertNotification,
} from '../notifications';

const POLL_MS = 5000;

const TITLES = {
  drowning: 'Possible drowning',
  intrusion: 'Red zone intrusion',
  'deep-water': 'Deep-water entry',
  supervision: 'Unsupervised swimmer',
};

/** Tray banners are only for alerts that still need a first claim. */
function needsTrayBanner(alert) {
  return alert.backendStatus === 'pending' && Boolean(alert.dispatchedAt);
}

function bannerCopy(group) {
  const primary = group[0];
  const urgent = group.some((alert) => alert.escalatedAt);
  let title;
  let body;
  if (group.length === 1) {
    title = primary.category === 'broadcast' ? 'Emergency alert' : (TITLES[primary.category] || primary.title);
    body = primary.category === 'broadcast'
      ? primary.title
      : `${primary.zone || 'Pool'} · ${primary.time || 'now'}`;
  } else {
    const person = primary.personId != null ? `Person #${primary.personId}` : 'One swimmer';
    const titles = [];
    for (const alert of group) {
      const label = TITLES[alert.category] || alert.title;
      if (label && !titles.includes(label)) titles.push(label);
    }
    title = `${group.length} alerts · ${person}`;
    body = titles.join(' · ');
  }
  if (urgent && primary.category !== 'broadcast') title = `URGENT — no response yet: ${title}`;
  return { title, body };
}

/**
 * Keeps the lifeguard notified while signed in.
 * The Home card is where an alert is acknowledged. An OS banner is only a
 * fallback when the app is in the background and remote push is unavailable,
 * and only after the alert has been sent to lifeguards. One banner per person.
 */
export function useAlertNotifications(token, { onPendingCount, onOpenAlert } = {}) {
  const lastPendingCount = useRef(null);
  const pushReady = useRef(false);
  const appState = useRef(AppState.currentState);
  const announced = useRef(new Map());
  const callbacks = useRef({ onPendingCount, onOpenAlert });
  callbacks.current = { onPendingCount, onOpenAlert };

  useEffect(() => {
    if (!token) return undefined;
    let cancelled = false;
    let notificationsReady = false;
    lastPendingCount.current = null;
    pushReady.current = false;
    announced.current = new Map();

    registerForNotifications(token).then((status) => {
      if (cancelled) return;
      pushReady.current = status.push;
      notificationsReady = true;
      // Re-check once registration finishes. This avoids racing a local
      // fallback banner against a remote push for the same alert.
      poll();
    });

    const poll = async () => {
      const result = await fetchMobileEvents(token, { alertsOnly: true, status: 'pending', limit: 20 });
      if (cancelled || !result.ok) return;
      const pendingCount = Number(result.pendingCount || 0);
      callbacks.current.onPendingCount?.(pendingCount);

      const events = result.events || [];
      const openForTray = events.filter(needsTrayBanner);
      if (pendingCount === 0 && lastPendingCount.current !== 0) {
        clearAlertNotifications().catch(() => {});
        announced.current = new Map();
      } else {
        // Drop banners once anyone claims or the alert is closed.
        dismissStaleAlertNotifications(new Set(openForTray.map((alert) => String(alert.id)))).catch(() => {});
      }
      lastPendingCount.current = pendingCount;

      const foreground = appState.current === 'active';
      if (foreground) return;

      // Remote push is the source of notifications when registration works.
      // Polling only supplies a local fallback when push is unavailable.
      if (!notificationsReady || pushReady.current) return;

      const alreadyShown = await presentedCollapseKeys();
      const groups = new Map();
      for (const alert of openForTray) {
        const key = alertCollapseKey(alert);
        const group = groups.get(key) || [];
        group.push(alert);
        groups.set(key, group);
      }

      const liveKeys = new Set(groups.keys());
      for (const key of announced.current.keys()) {
        if (!liveKeys.has(key)) announced.current.delete(key);
      }

      for (const [key, group] of groups) {
        const copy = bannerCopy(group);
        const signature = `${copy.title}|${copy.body}`;
        if (alreadyShown.has(key) || announced.current.get(key) === signature) {
          announced.current.set(key, signature);
          continue;
        }
        announced.current.set(key, signature);
        showAlertNotification(group[0], {
          identifier: `poolseye-${key}`,
          collapseKey: key,
          title: copy.title,
          body: copy.body,
          eventId: group[0].id,
          eventIds: group.map((alert) => alert.id),
        });
      }
    };

    poll();
    const id = setInterval(poll, POLL_MS);
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      appState.current = state;
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
