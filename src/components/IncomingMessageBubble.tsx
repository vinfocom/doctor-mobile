import React from 'react';
import { Pressable, Text } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import type { IncomingNotificationMessage } from '../api/notifications';

interface IncomingMessageBubbleProps {
    message: IncomingNotificationMessage | null;
    onPress?: (message: IncomingNotificationMessage) => void;
}

export default function IncomingMessageBubble({ message, onPress }: IncomingMessageBubbleProps) {
    if (!message) return null;

    return (
        <Animated.View
            entering={FadeInUp.springify().damping(16).stiffness(180)}
            exiting={FadeOutUp.duration(220)}
            className="absolute right-4 top-4 z-50"
        >
            <Pressable
                onPress={() => onPress?.(message)}
                className="bg-white border border-blue-100 rounded-2xl px-3 py-2"
                style={{
                    shadowColor: '#1d4ed8',
                    shadowOpacity: 0.18,
                    shadowRadius: 8,
                    shadowOffset: { width: 0, height: 4 },
                    elevation: 5,
                }}
            >
                <Text className="text-[11px] text-blue-500 font-semibold uppercase tracking-wide">
                    {message.isAnnouncement ? 'New announcement' : 'New message'}
                </Text>
                <Text className="text-sm text-gray-900 font-bold mt-0.5">From {message.senderName}</Text>
            </Pressable>
        </Animated.View>
    );
}
