import { useCallback, useEffect, useRef } from 'react';
import { Audio } from 'expo-av';

/**
 * A reusable hook that plays a short notification beep sound.
 *
 * Usage:
 *   const playSound = useNotificationSound();
 *   // Call playSound() when a new message or announcement arrives
 */
export function useNotificationSound() {
    const soundRef = useRef<Audio.Sound | null>(null);

    useEffect(() => {
        let mounted = true;
        const load = async () => {
            try {
                await Audio.setAudioModeAsync({
                    playsInSilentModeIOS: false, // Respect silent mode on iOS
                    allowsRecordingIOS: false,
                });
                // Using a reliable locally bundled notification sound
                const { sound } = await Audio.Sound.createAsync(
                    require('../../assets/notification.wav'),
                    { shouldPlay: false, volume: 1.0 }
                );
                if (mounted) soundRef.current = sound;
            } catch (e) {
                // Fail silently – sound is non-critical
            }
        };
        load();
        return () => {
            mounted = false;
            soundRef.current?.unloadAsync().catch(() => undefined);
            soundRef.current = null;
        };
    }, []);

    const playSound = useCallback(async () => {
        try {
            if (!soundRef.current) return;
            await soundRef.current.setPositionAsync(0);
            await soundRef.current.playAsync();
        } catch (e) {
            // Fail silently
        }
    }, []);

    return playSound;
}
