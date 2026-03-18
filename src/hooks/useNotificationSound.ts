import { useCallback, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

/**
 * A reusable hook that plays a short notification beep sound.
 *
 * Usage:
 *   const playSound = useNotificationSound();
 *   // Call playSound() when a new message or announcement arrives
 */
export function useNotificationSound() {
    const readyRef = useRef(false);

    useEffect(() => {
        let mounted = true;
        const setup = async () => {
            try {
                Notifications.setNotificationHandler({
                    handleNotification: async () => ({
                        shouldShowBanner: false,
                        shouldShowList: false,
                        shouldPlaySound: true,
                        shouldSetBadge: false,
                    }),
                });

                const permissions = await Notifications.getPermissionsAsync();
                if (!permissions.granted) {
                    await Notifications.requestPermissionsAsync();
                }

                if (Platform.OS === 'android') {
                    await Notifications.setNotificationChannelAsync('default', {
                        name: 'default',
                        importance: Notifications.AndroidImportance.DEFAULT,
                        sound: 'default',
                        vibrationPattern: [0, 250, 250, 250],
                    });
                }

                if (mounted) readyRef.current = true;
            } catch {
                // Fail silently – sound is non-critical
            }
        };
        setup();
        return () => {
            mounted = false;
            readyRef.current = false;
        };
    }, []);

    const playSound = useCallback(async () => {
        try {
            if (!readyRef.current) return;
            await Notifications.scheduleNotificationAsync({
                content: {
                    title: 'New message',
                    body: '',
                    sound: 'default',
                },
                trigger: null,
            });
        } catch {
            // Fail silently
        }
    }, []);

    return playSound;
}
