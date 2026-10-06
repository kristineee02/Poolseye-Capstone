// Push + local alert notifications for the lifeguard app.

import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { apiFetch } from './api/client';

const ALERT_CHANNEL = 'alerts';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
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
  if (Platform.OS === 'web') return { local: false, push: false };
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
  if (!apiToken || Platform.OS === 'web') return;
  await apiFetch('/api/mobile/push-token', { method: 'DELETE', token: apiToken });
}

/** Show a banner right away for an alert the app found while polling. */
export async function showAlertNotification(alert) {
  if (Platform.OS === 'web') return;
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: alert.category === 'broadcast' ? 'Emergency alert' : alert.title,
        body: alert.category === 'broadcast' ? alert.title : `${alert.zone} · ${alert.time || 'now'}`,
        sound: 'default',
        data: { eventId: alert.id, category: alert.category },
      },
      trigger: Platform.OS === 'android' ? { channelId: ALERT_CHANNEL } : null,
    });
  } catch {
    // Notification permission revoked; the in-app alert list still shows it.
  }
}

export function onNotificationTapped(handler) {
  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    handler(response.notification.request.content.data || {});
  });
  return () => sub.remove();
}
