import React, { useEffect, useMemo, useState } from 'react';
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
import DateTimePicker from '@react-native-community/datetimepicker';
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
import { useAuthSession } from '../context/AuthSessionContext';

const toYMD = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
};

const ANNOUNCEMENT_TEMPLATES = [
    'Reminder: Please arrive 10 minutes before your appointment and carry any previous prescriptions or reports.',
    'Clinic update: Today\'s appointments are running a little late. Thank you for your patience and cooperation.',
    'Health reminder: Please take your regular medicines on time and bring an updated list of current medications to your visit.',
    'Follow-up note: If you are unable to attend, please inform the clinic in advance so we can help reschedule your appointment.',
];

type Nav = NativeStackNavigationProp<RootStackParamList, 'DoctorAnnouncements'>;

export default function DoctorAnnouncementsScreen() {
    const navigation = useNavigation<Nav>();
    const { role } = useAuthSession();
    const isDoctor = role === 'DOCTOR';
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [sending, setSending] = useState(false);
    const [history, setHistory] = useState<AnnouncementCampaign[]>([]);
    const [targetCount, setTargetCount] = useState(0);
    const [targetPatients, setTargetPatients] = useState<any[]>([]);
    const [message, setMessage] = useState('');
    const [targetMode, setTargetMode] = useState<AnnouncementTargetMode>('TODAY');
    const [targetDate, setTargetDate] = useState(toYMD(new Date()));
    const [showPicker, setShowPicker] = useState(false);

    const canSend = useMemo(() => {
        if (!message.trim()) return false;
        if (targetMode !== 'CUSTOM') return true;
        return /^\d{4}-\d{2}-\d{2}$/.test(targetDate);
    }, [message, targetDate, targetMode]);

    const fetchAll = React.useCallback(async () => {
        if (!isDoctor) {
            setHistory([]);
            setTargetCount(0);
            setTargetPatients([]);
            return;
        }
        const [h, t] = await Promise.all([
            getAnnouncementHistory(200),
            getAnnouncementTargets(targetMode, targetMode === 'CUSTOM' ? targetDate : undefined),
        ]);
        setHistory(h?.campaigns || []);
        setTargetCount(Math.max(0, t?.count || 0));
        setTargetPatients(t?.patients || []);
    }, [isDoctor, targetDate, targetMode]);

    useEffect(() => {
        if (!isDoctor) {
            setLoading(false);
            return;
        }
        const bootstrap = async () => {
            try {
                await fetchAll();
            } catch (err) {
                console.error('[DoctorAnnouncements] fetchAll error:', err);
            } finally {
                setLoading(false);
            }
        };
        bootstrap();
    }, [fetchAll, isDoctor]);

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

    if (!isDoctor) {
        return (
            <SafeAreaView className="flex-1 bg-gray-50">
                <StatusBar barStyle="dark-content" backgroundColor="#f9fafb" />
                <View className="flex-1 px-5 py-6">
                    <TouchableOpacity onPress={() => navigation.goBack()} className="self-start mb-5 px-4 py-2 bg-white rounded-full border border-gray-200">
                        <Text className="text-gray-700 font-semibold">Back</Text>
                    </TouchableOpacity>
                    <View className="bg-white rounded-2xl border border-gray-200 p-5">
                        <Text className="text-gray-900 text-lg font-bold">Doctor only</Text>
                        <Text className="text-gray-600 mt-2">
                            Announcements can only be managed from a doctor account.
                        </Text>
                    </View>
                </View>
            </SafeAreaView>
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
                            <Text className="text-gray-900 font-bold">New Announcement</Text>
                            <Text className="text-gray-500 text-xs mt-1">
                                Choose a quick template or write your own message.
                            </Text>
                            <ScrollView
                                horizontal
                                showsHorizontalScrollIndicator={false}
                                className="mt-3"
                                contentContainerStyle={{ paddingRight: 8 }}
                            >
                                {ANNOUNCEMENT_TEMPLATES.map((template, index) => (
                                    <TouchableOpacity
                                        key={index}
                                        onPress={() => setMessage(template)}
                                        className="mr-2 w-64 rounded-2xl border border-blue-200 bg-blue-50 px-3 py-3"
                                    >
                                        <Text className="text-blue-800 text-xs font-semibold">Template {index + 1}</Text>
                                        <Text className="text-blue-700 text-xs mt-1" numberOfLines={4}>
                                            {template}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>
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
                                        { label: 'Today', value: 'TODAY' as AnnouncementTargetMode },
                                        { label: 'Tomorrow', value: 'TOMORROW' as AnnouncementTargetMode },
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
                                    <View className="mt-3">
                                        <TouchableOpacity
                                            onPress={() => setShowPicker(true)}
                                            className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-3"
                                        >
                                            <Text className="text-gray-800">{targetDate || 'Select Date'}</Text>
                                        </TouchableOpacity>
                                        {showPicker && (
                                            <DateTimePicker
                                                value={targetDate ? new Date(targetDate) : new Date()}
                                                mode="date"
                                                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                                                onChange={(event: any, selectedDate?: Date) => {
                                                    setShowPicker(Platform.OS === 'ios');
                                                    if (selectedDate) setTargetDate(toYMD(selectedDate));
                                                }}
                                            />
                                        )}
                                        {Platform.OS === 'ios' && showPicker && (
                                            <TouchableOpacity onPress={() => setShowPicker(false)} className="mt-2 self-end">
                                                <Text className="text-blue-600 font-bold">Done</Text>
                                            </TouchableOpacity>
                                        )}
                                    </View>
                                )}
                            </View>


                            <Text className="text-blue-700 text-xs font-semibold mt-2">
                                Will send to {targetCount} patient{targetCount === 1 ? '' : 's'}
                            </Text>
                            {targetPatients.length > 0 && (
                                <View className="mt-2 p-3 bg-blue-50 border border-blue-100 rounded-xl">
                                    <Text className="text-blue-800 text-xs font-bold mb-1">Recipients:</Text>
                                    {targetPatients.slice(0, 5).map((p, idx) => {
                                        const datePart = p.appointment_date ? String(p.appointment_date).slice(0, 10) : '';
                                        const dStr = datePart ? new Date(`${datePart}T00:00:00+05:30`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '';
                                        let tStr = '';
                                        if (p.start_time) {
                                            const raw = String(p.start_time);
                                            if (raw.includes('T') || raw.includes('Z') || raw.length > 5) {
                                                // stored as ISO datetime: extract UTC H:M (the actual time)
                                                const d = new Date(raw);
                                                if (!Number.isNaN(d.getTime())) {
                                                    const h = d.getUTCHours();
                                                    const m = d.getUTCMinutes();
                                                    const ampm = h >= 12 ? 'PM' : 'AM';
                                                    tStr = `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`;
                                                }
                                            } else if (raw.includes(':')) {
                                                const parts = raw.split(':');
                                                let hour = parseInt(parts[0], 10);
                                                const ampm = hour >= 12 ? 'PM' : 'AM';
                                                hour = hour % 12 || 12;
                                                tStr = `${hour}:${parts[1]} ${ampm}`;
                                            }
                                        }
                                        return (
                                            <Text key={p.patient_id} className="text-blue-700 text-xs mt-0.5" numberOfLines={1}>
                                                • {p.name} {dStr && tStr ? `(${dStr} @ ${tStr})` : ''}
                                            </Text>
                                        );
                                    })}
                                    {targetPatients.length > 5 && (
                                        <Text className="text-blue-600 text-xs italic mt-1">+ {targetPatients.length - 5} more...</Text>
                                    )}
                                </View>
                            )}

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
                                                {new Date(c.created_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' })} • {c.recipientCount} recipients • Announcement
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
