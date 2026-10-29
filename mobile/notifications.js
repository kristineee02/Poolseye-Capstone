// Push + local alert notifications for the lifeguard app.

import { AppState, Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { apiFetch } from './api/client';

const ALERT_CHANNEL = 'alerts';

// Expo Go on Android throws as soon as expo-notifications is loaded (SDK 53+),
// so the module is only required where it is supported.
const IS_EXPO_GO_ANDROID =
  Platform.OS === 'android' && Constants.executionEnvironment === 'storeClient';

const Notifications =
  Platform.OS === 'web' || IS_EXPO_GO_ANDROID ? null : require('expo-notifications');

Notifications?.setNotificationHandler({
  handleNotification: async () => {
    // The Home card is the place to acknowledge. Don't stack an OS banner on top of it.
    const foreground = AppState.currentState === 'active';
    return {
      shouldShowBanner: !foreground,
      shouldShowList: !foreground,
      shouldPlaySound: !foreground,
      shouldSetBadge: false,
    };
  },
});

async function ensureChannels() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(ALERT_CHANNEL, {
    name: 'Pool alerts',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 400, 250, 400],
    sound: 'default',
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
  await Notifications.setNotificationChannelAsync('default', {
    name: 'General',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

async function ensurePermission() {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const asked = await Notifications.requestPermissionsAsync();
  return asked.granted;
}

/**
 * Ask for permission and send this phone's Expo push token to the backend so
 * dashboard broadcasts reach it even when the app is closed. Returns
 * { local, push }: local = banners can be shown, push = remote push is set up.
 * Expo Go on Android cannot receive remote push, so push is false there.
 */
export async function registerForNotifications(apiToken) {
  if (!Notifications) return { local: false, push: false };
  try {
    await ensureChannels();
    if (!(await ensurePermission())) return { local: false, push: false };
  } catch {
    return { local: false, push: false };
  }

  if (!Device.isDevice) return { local: true, push: false };
  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    const { data: pushToken } = await Notifications.getExpoPushTokenAsync({ projectId });
    const result = await apiFetch('/api/mobile/push-token', {
      method: 'PUT',
      token: apiToken,
      body: { token: pushToken },
    });
    return { local: true, push: Boolean(result.ok) };
  } catch {
    return { local: true, push: false };
  }
}

export async function unregisterFromNotifications(apiToken) {
  if (!apiToken || !Notifications) return;
  await apiFetch('/api/mobile/push-token', { method: 'DELETE', token: apiToken });
}

export function alertCollapseKey(alert) {
  if (alert.category === 'broadcast') return `broadcast-${alert.id}`;
  if (alert.personId != null) return `person-${alert.personId}`;
  return `event-${alert.id}`;
}

function notificationData(alert, extra = {}) {
  const eventIds = extra.eventIds || [alert.id];
  return {
    eventId: extra.eventId || alert.id,
    eventIds,
    category: alert.category,
    personId: alert.personId ?? null,
    collapseKey: extra.collapseKey || alertCollapseKey(alert),
  };
}

/** Show one banner. The same identifier replaces the previous banner instead of stacking. */
export async function showAlertNotification(alert, extra = {}) {
  if (!Notifications) return;
  const data = notificationData(alert, extra);
  const identifier = extra.identifier || `poolseye-${data.collapseKey}`;
  try {
    await Notifications.dismissNotificationAsync(identifier).catch(() => {});
    await Notifications.cancelScheduledNotificationAsync(identifier).catch(() => {});
    await Notifications.scheduleNotificationAsync({
      identifier,
      content: {
        title: extra.title || (alert.category === 'broadcast' ? 'Emergency alert' : alert.title),
        body: extra.body || (alert.category === 'broadcast' ? alert.title : `${alert.zone} · ${alert.time || 'now'}`),
        sound: 'default',
        data,
      },
      trigger: Platform.OS === 'android' ? { channelId: ALERT_CHANNEL } : null,
    });
  } catch {
    // Notification permission revoked; the in-app alert list still shows it.
  }
}

function idsIn(data) {
  if (Array.isArray(data?.eventIds) && data.eventIds.length) return data.eventIds.map(String);
  if (data?.eventId) return [String(data.eventId)];
  return [];
}

export async function presentedCollapseKeys() {
  if (!Notifications?.getPresentedNotificationsAsync) return new Set();
  try {
    const presented = await Notifications.getPresentedNotificationsAsync();
    return new Set(
      presented.map((notification) => notification.request.content.data?.collapseKey).filter(Boolean)
    );
  } catch {
    return new Set();
  }
}

/** Drop tray notifications whose alerts are closed or already claimed by someone else. */
export async function dismissStaleAlertNotifications(actionableIds) {
  if (!Notifications?.getPresentedNotificationsAsync) return;
  try {
    const presented = await Notifications.getPresentedNotificationsAsync();
    const byKey = new Map();
    await Promise.all(presented.map(async (notification) => {
      const data = notification.request.content.data || {};
      const ids = idsIn(data);
      if (!ids.length) return;
      const stillOpen = ids.some((id) => actionableIds.has(id));
      if (!stillOpen) {
        await Notifications.dismissNotificationAsync(notification.request.identifier).catch(() => {});
        return;
      }
      const key = data.collapseKey || ids[0];
      const group = byKey.get(key) || [];
      group.push(notification);
      byKey.set(key, group);
    }));
    await Promise.all([...byKey.values()].map(async (group) => {
      group.sort((a, b) => (b.date || 0) - (a.date || 0));
      await Promise.all(group.slice(1).map((old) => (
        Notifications.dismissNotificationAsync(old.request.identifier).catch(() => {})
      )));
    }));
  } catch {
    // Tray cleanup is best-effort; the in-app list is the source of truth.
  }
}

/** Remove stale PoolsEye alerts and reset the OS app badge after backend reset. */
export async function clearAlertNotifications() {
  if (!Notifications) return;
  await Promise.allSettled([
    Notifications.dismissAllNotificationsAsync(),
    Notifications.cancelAllScheduledNotificationsAsync(),
    Notifications.setBadgeCountAsync(0),
  ]);
}

export function onNotificationTapped(handler) {
  if (!Notifications) return () => {};
  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    handler(response.notification.request.content.data || {});
  });
  return () => sub.remove();
}
