import { useState, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import type * as NotificationsType from 'expo-notifications';
import Constants from 'expo-constants';

// Expo Go (SDK 53+) removed remote push notification support.
// We lazily require expo-notifications so the package never loads in Expo Go,
// which prevents the package's own startup error from firing.
const isExpoGo = Constants.appOwnership === 'expo';
const Notifications: typeof NotificationsType | null = isExpoGo
    ? null
    : require('expo-notifications');

export interface PushNotificationState {
    expoPushToken?: NotificationsType.ExpoPushToken;
    notification?: NotificationsType.Notification;
}

export const usePushNotifications = (): PushNotificationState => {
    const [expoPushToken, setExpoPushToken] = useState<NotificationsType.ExpoPushToken | undefined>();
    const [notification, setNotification] = useState<NotificationsType.Notification | undefined>();
    const notificationListener = useRef<NotificationsType.EventSubscription | null>(null);
    const responseListener = useRef<NotificationsType.EventSubscription | null>(null);

    useEffect(() => {
        // expo-notifications is not loaded in Expo Go (module is null)
        if (!Notifications) return;

        registerForPushNotificationsAsync().then((token) => {
            if (token) setExpoPushToken(token);
        });

        notificationListener.current = Notifications.addNotificationReceivedListener((notification) => {
            setNotification(notification);
        });

        responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
            console.log('Notification response:', response);
        });

        return () => {
            notificationListener.current?.remove();
            responseListener.current?.remove();
        };
    }, []);

    return { expoPushToken, notification };
};

export async function registerForPushNotificationsAsync() {
    // expo-notifications is not loaded in Expo Go — bail out silently
    if (!Notifications) return;

    let token;

    if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
            name: 'default',
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#FF231F7C',
        });
    }

    if (Device.isDevice) {
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;

        if (existingStatus !== 'granted') {
            const { status } = await Notifications.requestPermissionsAsync();
            finalStatus = status;
        }

        if (finalStatus !== 'granted') {
            console.log('Failed to get push token for push notification!');
            return;
        }

        try {
            const projectId =
                Constants?.expoConfig?.extra?.eas?.projectId ??
                Constants?.easConfig?.projectId ??
                'f0d16ca1-38da-43a7-98f2-39a2dba468dc';

            token = await Notifications.getExpoPushTokenAsync({ projectId });
            console.log('Expo Push Token generated:', token);
        } catch (e) {
            console.log('Error generating push token:', e);
        }
    } else {
        console.log('Must use physical device for Push Notifications');
    }

    return token;
}
