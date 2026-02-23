import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    RefreshControl,
    ScrollView,
    StatusBar,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, Megaphone } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import {
    getAnnouncementHistory,
    getAnnouncementTargets,
    resendAnnouncementCampaign,
    sendAnnouncement,
    type AnnouncementCampaign,
    type AnnouncementTargetMode,
} from '../api/announcements';
import { API_URL, SOCKET_URL } from '../config/env';
import { io, type Socket } from 'socket.io-client';

type Nav = NativeStackNavigationProp<RootStackParamList, 'DoctorAnnouncements'>;

export default function DoctorAnnouncementsScreen() {
    const navigation = useNavigation<Nav>();
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [sending, setSending] = useState(false);
    const [socketConnected, setSocketConnected] = useState(false);
    const [socketError, setSocketError] = useState<string>('');
    const [history, setHistory] = useState<AnnouncementCampaign[]>([]);
    const [targetCount, setTargetCount] = useState(0);
    const [message, setMessage] = useState('');
    const [targetMode, setTargetMode] = useState<AnnouncementTargetMode>('UPCOMING');
    const [targetDate, setTargetDate] = useState('');
    const [lastUpdatedAt, setLastUpdatedAt] = useState<string>('');
    const socketRef = useRef<Socket | null>(null);

    const canSend = useMemo(() => {
        if (!message.trim()) return false;
        if (targetMode !== 'CUSTOM') return true;
        return /^\d{4}-\d{2}-\d{2}$/.test(targetDate);
    }, [message, targetDate, targetMode]);
    const likelyInvalidSocketHost = useMemo(() => SOCKET_URL.includes('vercel.app'), []);

    const fetchAll = React.useCallback(async () => {
        const [h, t] = await Promise.all([
            getAnnouncementHistory(200),
            getAnnouncementTargets(targetMode, targetMode === 'CUSTOM' ? targetDate : undefined),
        ]);
        setHistory(h?.campaigns || []);
        setTargetCount(Math.max(0, t?.count || 0));
        setLastUpdatedAt(new Date().toISOString());
    }, [targetDate, targetMode]);

    useEffect(() => {
        const bootstrap = async () => {
            try {
                await fetchAll();
            } catch {
                // ignore
            } finally {
                setLoading(false);
            }
        };
        bootstrap();
    }, [fetchAll]);

    useEffect(() => {
        if (loading) return;
        fetchAll().catch(() => undefined);
    }, [fetchAll, loading]);

    useEffect(() => {
        const socket = io(SOCKET_URL, {
            transports: ['websocket', 'polling'],
            timeout: 4000,
            reconnection: true,
            reconnectionDelay: 500,
            reconnectionDelayMax: 2000,
        });
        socketRef.current = socket;
        socket.on('connect', () => {
            setSocketConnected(true);
            setSocketError('');
        });
        socket.on('disconnect', (reason) => {
            setSocketConnected(false);
            setSocketError(`disconnect: ${reason}`);
        });
        socket.on('connect_error', (err: any) => {
            setSocketConnected(false);
            setSocketError(`connect_error: ${err?.message || 'unknown'}`);
        });
        socket.on('reconnect_error', (err: any) => {
            setSocketConnected(false);
            setSocketError(`reconnect_error: ${err?.message || 'unknown'}`);
        });
        return () => {
            socket.removeAllListeners();
            socket.disconnect();
            socketRef.current = null;
        };
    }, []);

    const onRefresh = async () => {
        setRefreshing(true);
        await fetchAll().catch(() => undefined);
        setRefreshing(false);
    };

    const handleSend = async () => {
        if (!canSend) return;
        setSending(true);
        try {
            const result = await sendAnnouncement(
                message.trim(),
                true,
                targetMode,
                targetMode === 'CUSTOM' ? targetDate : undefined
            );
            Alert.alert('Success', `Sent to ${result.sent ?? 0} patient${(result.sent ?? 0) === 1 ? '' : 's'}`);
            setMessage('');
            await fetchAll();
        } catch (error: any) {
            Alert.alert('Error', error?.response?.data?.error || 'Failed to send');
        } finally {
            setSending(false);
        }
    };

    const handleResend = async (campaign: AnnouncementCampaign) => {
        try {
            const result = await resendAnnouncementCampaign(campaign.campaign_id, { asAnnouncement: true });
            Alert.alert('Resent', `Sent again to ${result.sent ?? 0} patient${(result.sent ?? 0) === 1 ? '' : 's'}`);
            await fetchAll();
        } catch (error: any) {
            Alert.alert('Error', error?.response?.data?.error || 'Failed to resend');
        }
    };

    if (loading) {
        return (
            <View className="flex-1 justify-center items-center bg-gray-50">
                <ActivityIndicator size="large" color="#2563eb" />
            </View>
        );
    }

    return (
        <SafeAreaView className="flex-1 bg-blue-700">
            <StatusBar barStyle="light-content" backgroundColor="#1d4ed8" />
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
                className="flex-1"
            >
                <ScrollView
                    className="flex-1 bg-gray-50"
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
                    contentContainerStyle={{ paddingBottom: 28 }}
                >
                    <View className="bg-blue-700 px-5 pt-5 pb-6 rounded-b-3xl">
                        <View className="flex-row items-center">
                            <TouchableOpacity onPress={() => navigation.goBack()} className="mr-3 p-2 bg-blue-600 rounded-full">
                                <ChevronLeft size={20} color="#fff" />
                            </TouchableOpacity>
                            <View>
                                <Text className="text-blue-100 text-sm">Doctor Tools</Text>
                                <Text className="text-white text-2xl font-bold">Announcement Center</Text>
                            </View>
                        </View>
                    </View>

                    <View className="px-4 mt-4">
                        <View className="bg-white rounded-2xl border border-blue-100 p-4">
                            <Text className="text-gray-900 font-bold mb-2">Debug</Text>
                            <Text className="text-xs text-gray-600">API: {API_URL}</Text>
                            <Text className="text-xs text-gray-600 mt-1">Socket: {SOCKET_URL}</Text>
                            <Text className="text-xs text-gray-600 mt-1">Socket status: {socketConnected ? 'connected' : 'disconnected'}</Text>
                            {socketError ? <Text className="text-xs text-red-500 mt-1">Socket error: {socketError}</Text> : null}
                            {likelyInvalidSocketHost && (
                                <Text className="text-xs text-red-500 mt-1">
                                    Socket URL points to Vercel domain. Set EXPO_PUBLIC_SOCKET_URL to your socket server host.
                                </Text>
                            )}
                            <Text className="text-xs text-gray-600 mt-1">Last refresh: {lastUpdatedAt ? new Date(lastUpdatedAt).toLocaleTimeString() : 'N/A'}</Text>
                        </View>

                        <View className="bg-white rounded-2xl border border-blue-100 p-4 mt-4">
                            <Text className="text-gray-900 font-bold">New Announcement</Text>
                            <TextInput
                                className="mt-3 bg-gray-50 border border-gray-200 rounded-xl px-3 py-3 text-gray-800 min-h-[96px]"
                                multiline
                                textAlignVertical="top"
                                placeholder="Type announcement..."
                                value={message}
                                onChangeText={setMessage}
                            />
                            <View className="mt-3">
                                <Text className="text-gray-700 text-xs font-semibold mb-2">Target Group</Text>
                                <View className="flex-row gap-2">
                                    {[
                                        { label: 'Upcoming', value: 'UPCOMING' as AnnouncementTargetMode },
                                        { label: 'Today', value: 'TODAY' as AnnouncementTargetMode },
                                        { label: 'Custom', value: 'CUSTOM' as AnnouncementTargetMode },
                                    ].map((m) => (
                                        <TouchableOpacity
                                            key={m.value}
                                            onPress={() => setTargetMode(m.value)}
                                            className={`px-3 py-2 rounded-full border ${targetMode === m.value ? 'bg-blue-600 border-blue-600' : 'bg-white border-gray-300'}`}
                                        >
                                            <Text className={`text-xs font-semibold ${targetMode === m.value ? 'text-white' : 'text-gray-700'}`}>{m.label}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                                {targetMode === 'CUSTOM' && (
                                    <TextInput
                                        className="mt-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-gray-800"
                                        placeholder="YYYY-MM-DD"
                                        value={targetDate}
                                        onChangeText={setTargetDate}
                                    />
                                )}
                            </View>

                            <Text className="text-gray-700 text-sm mt-3">This always sends as announcement (not in chat thread).</Text>

                            <Text className="text-blue-700 text-xs font-semibold mt-2">
                                Will send to {targetCount} patient{targetCount === 1 ? '' : 's'}
                            </Text>

                            <TouchableOpacity
                                disabled={!canSend || sending}
                                onPress={handleSend}
                                className={`mt-3 rounded-xl py-3 items-center ${!canSend || sending ? 'bg-blue-300' : 'bg-blue-600'}`}
                            >
                                <Text className="text-white font-semibold">{sending ? 'Sending...' : 'Send Announcement'}</Text>
                            </TouchableOpacity>
                        </View>

                        <View className="mt-4">
                            <Text className="text-gray-700 font-bold mb-2">Previous Broadcasts</Text>
                            {history.map((c) => (
                                <View key={c.campaign_id} className="bg-white rounded-2xl border border-gray-100 p-4 mb-3">
                                    <View className="flex-row items-start justify-between">
                                        <View className="flex-1 pr-3">
                                            <Text className="text-gray-900 font-semibold">{c.content}</Text>
                                            <Text className="text-gray-500 text-xs mt-1">
                                                {new Date(c.created_at).toLocaleString()} • {c.recipientCount} recipients • Announcement
                                            </Text>
                                        </View>
                                        <Megaphone size={18} color="#2563eb" />
                                    </View>
                                    <TouchableOpacity
                                        onPress={() => handleResend(c)}
                                        className="mt-3 self-start bg-blue-50 border border-blue-100 rounded-lg px-3 py-2"
                                    >
                                        <Text className="text-blue-700 text-xs font-semibold">Resend announcement to same recipients</Text>
                                    </TouchableOpacity>
                                </View>
                            ))}
                            {history.length === 0 && (
                                <View className="bg-white rounded-2xl border border-gray-100 p-5 items-center">
                                    <Text className="text-gray-500">No announcement history yet</Text>
                                </View>
                            )}
                        </View>
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}
