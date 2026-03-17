import { useState, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';

export interface PushNotificationState {
    expoPushToken?: Notifications.ExpoPushToken;
    notification?: Notifications.Notification;
}

export const usePushNotifications = (): PushNotificationState => {
    const [expoPushToken, setExpoPushToken] = useState<Notifications.ExpoPushToken | undefined>();
    const [notification, setNotification] = useState<Notifications.Notification | undefined>();
    const notificationListener = useRef<Notifications.EventSubscription | null>(null);
    const responseListener = useRef<Notifications.EventSubscription | null>(null);

    useEffect(() => {
        registerForPushNotificationsAsync().then((token) => {
            if (token) {
                setExpoPushToken(token);
            }
        });

        notificationListener.current = Notifications.addNotificationReceivedListener((notification) => {
            setNotification(notification);
        });

        responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
            // Could handle push notification tap here
            console.log('Notification response:', response);
        });

        return () => {
            if (notificationListener.current) {
                notificationListener.current.remove();
            }
            if (responseListener.current) {
                responseListener.current.remove();
            }
        };
    }, []);

    return { expoPushToken, notification };
};

export async function registerForPushNotificationsAsync() {
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
            let projectId = Constants?.expoConfig?.extra?.eas?.projectId
                ?? Constants?.easConfig?.projectId;

            if (!projectId) {
                console.log('Project ID not found in Constants. Logging manual override warning.');
                // Note: If you have an EAS project ID, you can hardcode it here, or run `eas init`
                projectId = 'f0d16ca1-38da-43a7-98f2-39a2dba468dc'; // Placeholder for testing
            }

            token = await Notifications.getExpoPushTokenAsync({
                projectId: projectId,
            });
            console.log('Expo Push Token generated:', token);
        } catch (e) {
            console.log('Error generating push token:', e);
        }
    } else {
        // Cannot register for push notifications on a simulator easily without custom setup
        console.log('Must use physical device for Push Notifications');
    }

    return token;
}
