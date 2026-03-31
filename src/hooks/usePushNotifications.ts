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
const pushDebug = (...args: unknown[]) => {
    if (__DEV__) {
        console.log(...args);
    }
};

function getExpoProjectId() {
    const constantsAny = Constants as typeof Constants & {
        expoConfig?: { extra?: { eas?: { projectId?: string } } };
        easConfig?: { projectId?: string };
        manifest2?: { extra?: { eas?: { projectId?: string } } };
        manifest?: { extra?: { eas?: { projectId?: string } } };
    };

    return (
        constantsAny?.expoConfig?.extra?.eas?.projectId ??
        constantsAny?.easConfig?.projectId ??
        constantsAny?.manifest2?.extra?.eas?.projectId ??
        constantsAny?.manifest?.extra?.eas?.projectId ??
        null
    );
}

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
        if (!Notifications) return;

        registerForPushNotificationsAsync().then((token) => {
            if (token) setExpoPushToken(token);
        });

        notificationListener.current = Notifications.addNotificationReceivedListener((notification) => {
            setNotification(notification);
        });

        responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
            pushDebug('[push] notification response received:', response.notification.request.content.data);
        });

        return () => {
            notificationListener.current?.remove();
            responseListener.current?.remove();
        };
    }, []);

    return { expoPushToken, notification };
};

export async function registerForPushNotificationsAsync() {
    if (!Notifications) {
        pushDebug('[push] expo-notifications unavailable; likely running in Expo Go');
        return;
    }

    let token;

    if (Platform.OS === 'android') {
        pushDebug('[push] configuring Android notification channel');
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
        pushDebug('[push] existing notification permission status:', existingStatus);

        if (existingStatus !== 'granted') {
            const { status } = await Notifications.requestPermissionsAsync();
            finalStatus = status;
            pushDebug('[push] requested notification permission, final status:', finalStatus);
        }

        if (finalStatus !== 'granted') {
            pushDebug('[push] permission not granted; cannot generate push token');
            return;
        }

        try {
            const projectId = getExpoProjectId();

            if (!projectId) {
                throw new Error('Missing EAS projectId for push token generation');
            }

            pushDebug('[push] generating Expo push token with projectId:', projectId);
            token = await Notifications.getExpoPushTokenAsync({ projectId });
            pushDebug('[push] Expo Push Token generated successfully');
        } catch (e) {
            pushDebug('[push] Error generating push token:', e);
        }
    } else {
        pushDebug('[push] Must use physical device for Push Notifications');
    }

    return token;
}
