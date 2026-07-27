import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

export async function scheduleAlarm(
  minutes: number,
  workoutName: string,
): Promise<string | null> {
  try {
    const granted = await requestNotificationPermission();
    if (!granted) return null;
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: '⏰ Workout Alarm',
        body: `${minutes} min reached for "${workoutName}"`,
        sound: true,
      },
      trigger: {
        seconds: Math.max(1, Math.round(minutes * 60)),
        repeats: false,
      } as any,
    });
    return id;
  } catch (e) {
    console.warn('scheduleAlarm failed:', e);
    return null;
  }
}

export async function cancelAlarm(id: string): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(id);
  } catch {}
}

/**
 * Schedules a local notification to fire when a rest period ends. Fires even
 * while the app is backgrounded (OS-scheduled, like the workout alarm) so the
 * user is alerted if they switched away. Returns the notification id, or null
 * if permission was denied / scheduling failed.
 */
export async function scheduleRestOverNotification(
  seconds: number,
  nextLabel: string,
): Promise<string | null> {
  try {
    const granted = await requestNotificationPermission();
    if (!granted) return null;
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: '⏱ Rest over',
        body: nextLabel ? `Next up: ${nextLabel}` : 'Rest is over',
        sound: true,
      },
      trigger: {
        seconds: Math.max(1, Math.round(seconds)),
        repeats: false,
      } as any,
    });
    return id;
  } catch (e) {
    console.warn('scheduleRestOverNotification failed:', e);
    return null;
  }
}

/** Cancels a scheduled rest-over notification. No-op if id is null. */
export async function cancelRestOverNotification(id: string | null): Promise<void> {
  if (!id) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(id);
  } catch {}
}
