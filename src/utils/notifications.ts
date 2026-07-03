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
