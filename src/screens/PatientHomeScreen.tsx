import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    View,
    Text,
    ActivityIndicator,
    TouchableOpacity,
    Alert,
    RefreshControl,
    StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { User, MessageCircle, LogOut, Settings } from 'lucide-react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { getPatientProfile } from '../api/auth';
import { removeToken } from '../api/token';
import { getChatNotifications, type IncomingNotificationMessage } from '../api/notifications';
import { useSWRLite } from '../lib/useSWRLite';
import { FlashList } from '@shopify/flash-list';
import IncomingMessageBubble from '../components/IncomingMessageBubble';
import { io, type Socket } from 'socket.io-client';
import { SOCKET_URL } from '../config/env';
import { useAuthSession } from '../context/AuthSessionContext';

type Nav = NativeStackNavigationProp<RootStackParamList>;

interface DoctorItem {
    doctor_id: number;
    doctor_name: string | null;
    specialization: string | null;
    phone: string | null;
}

export default function PatientHomeScreen() {
    const navigation = useNavigation<Nav>();
    const { clearSession } = useAuthSession();
    const [refreshing, setRefreshing] = useState(false);
    const [notifCount, setNotifCount] = useState(0);
    const [announcementCount, setAnnouncementCount] = useState(0);
    const [incomingMessage, setIncomingMessage] = useState<IncomingNotificationMessage | null>(null);
    const lastNotifCheckAtRef = useRef<string>(new Date(Date.now() - 2 * 60 * 1000).toISOString());
    const bubbleHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const socketRef = useRef<Socket | null>(null);
    const socketEnabled = React.useMemo(() => !SOCKET_URL.includes('vercel.app'), []);

    const { data, isLoading: loading, revalidate } = useSWRLite('patient:home', getPatientProfile);
    const patient = data?.patient || null;
    const doctors = (data?.doctors || []) as DoctorItem[];
    const uniqueDoctors = useMemo(() => {
        const byId = new Map<number, DoctorItem>();
        doctors.forEach((d) => {
            if (!d || !d.doctor_id) return;
            if (!byId.has(d.doctor_id)) byId.set(d.doctor_id, d);
        });
        return Array.from(byId.values());
    }, [doctors]);

    const checkIncomingNotifications = React.useCallback(async () => {
        try {
            const result = await getChatNotifications(lastNotifCheckAtRef.current);
            lastNotifCheckAtRef.current = new Date().toISOString();
            setNotifCount((prev) => prev + (result?.count || 0));
            setAnnouncementCount((prev) => prev + (result?.announcementCount || 0));
            if (result?.latestMessage) {
                setIncomingMessage({
                    ...result.latestMessage,
                    preview: (result.latestMessage.isAnnouncement
                        ? result.latestMessage.preview?.replace(/^Announcement:\s*/, '')
                        : result.latestMessage.preview) || '',
                });
                if (bubbleHideTimerRef.current) {
                    clearTimeout(bubbleHideTimerRef.current);
                }
                bubbleHideTimerRef.current = setTimeout(() => {
                    setIncomingMessage(null);
                }, 5000);
            }
        } catch {
            // ignore
        }
    }, []);

    useEffect(() => {
        checkIncomingNotifications();
        const interval = setInterval(checkIncomingNotifications, 7000);
        return () => {
            clearInterval(interval);
            if (bubbleHideTimerRef.current) {
                clearTimeout(bubbleHideTimerRef.current);
            }
        };
    }, [checkIncomingNotifications]);

    useFocusEffect(
        React.useCallback(() => {
            checkIncomingNotifications();
        }, [checkIncomingNotifications])
    );

    useEffect(() => {
        if (!socketEnabled) return;
        if (!patient?.patient_id || uniqueDoctors.length === 0) return;
        const socket = io(SOCKET_URL, {
            transports: ['websocket', 'polling'],
            timeout: 4000,
            reconnection: true,
            reconnectionDelay: 500,
            reconnectionDelayMax: 2000,
        });
        socketRef.current = socket;

        const joinAllRooms = () => {
            uniqueDoctors.forEach((d) => {
                socket.emit('join_chat', { patientId: patient.patient_id, doctorId: d.doctor_id });
            });
        };

        socket.on('connect', joinAllRooms);
        socket.on('receive_message', (msg: any) => {
            if (!msg || msg.sender !== 'DOCTOR') return;
            if (msg.patient_id !== patient.patient_id) return;
            const isAnnouncement = String(msg.content || '').startsWith('Announcement:');
            const senderName = uniqueDoctors.find((d) => d.doctor_id === msg.doctor_id)?.doctor_name || 'Doctor';
            setIncomingMessage({
                senderName,
                senderRole: 'DOCTOR',
                preview: isAnnouncement ? String(msg.content || '').replace(/^Announcement:\s*/, '') : (msg.content || ''),
                isAnnouncement,
                createdAt: msg.created_at || new Date().toISOString(),
                patientId: msg.patient_id,
                doctorId: msg.doctor_id,
            });
            if (bubbleHideTimerRef.current) {
                clearTimeout(bubbleHideTimerRef.current);
            }
            bubbleHideTimerRef.current = setTimeout(() => {
                setIncomingMessage(null);
            }, 5000);
        });
        if (socket.connected) joinAllRooms();

        return () => {
            socket.removeAllListeners();
            socket.disconnect();
            socketRef.current = null;
        };
    }, [uniqueDoctors, patient?.patient_id, socketEnabled]);

    const onRefresh = async () => {
        setRefreshing(true);
        await revalidate().catch(() => {
            Alert.alert("Error", "Failed to load patient data");
        });
        setRefreshing(false);
    };

    const handleLogout = async () => {
        await removeToken();
        clearSession();
        navigation.reset({ index: 0, routes: [{ name: "Login" }] });
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
            <View className="flex-1 bg-gray-50">
                <View className="bg-blue-700 px-5 pt-6 pb-6 rounded-b-3xl">
                    <View className="flex-row items-center justify-between">
                        <View>
                            <Text className="text-blue-100 text-sm">Patient Portal</Text>
                            <Text className="text-white text-3xl font-bold mt-1">{patient?.full_name || "Patient"}</Text>
                        </View>
                        <TouchableOpacity
                            onPress={() => navigation.navigate('PatientProfile')}
                            className="bg-white/20 rounded-full p-2"
                        >
                            <Settings size={22} color="#fff" />
                        </TouchableOpacity>
                    </View>
                </View>

                <FlashList
                    data={uniqueDoctors}
                    keyExtractor={(item, index) => `doctor:${item.doctor_id}:${index}`}
                    contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
                    ListHeaderComponent={
                        <View className="mb-4">
                            {(notifCount > 0 || announcementCount > 0) && (
                                <View className="mb-3 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                                    <Text className="text-amber-700 text-xs font-semibold">
                                        {notifCount > 0 ? `New messages: ${notifCount}` : ''}
                                        {announcementCount > 0 ? `  •  Announcements: ${announcementCount}` : ''}
                                    </Text>
                                </View>
                            )}
                            <Text className="text-gray-700 font-bold text-base">My Doctors</Text>
                            <Text className="text-gray-400 text-sm mt-1">Open chat with your doctor</Text>
                        </View>
                    }
                    renderItem={({ item }) => (
                        <TouchableOpacity
                            className="bg-white rounded-2xl p-4 mb-3 flex-row items-center"
                            style={{ shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 6, elevation: 2 }}
                            disabled={!patient?.patient_id}
                            onPress={() =>
                                navigation.navigate("Chat", {
                                    patientId: patient!.patient_id,
                                    doctorId: item.doctor_id,
                                    patientName: item.doctor_name || "Doctor",
                                    viewer: "PATIENT",
                                })
                            }
                        >
                            <View className="w-11 h-11 bg-blue-100 rounded-full items-center justify-center mr-3 relative">
                                <User size={20} color="#1d4ed8" />
                                {incomingMessage && !incomingMessage.isAnnouncement && incomingMessage.doctorId === item.doctor_id ? (
                                    <View className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-emerald-500 items-center justify-center border border-white">
                                        <Text className="text-white text-[10px] font-bold">1</Text>
                                    </View>
                                ) : null}
                            </View>
                            <View className="flex-1">
                                <Text className="text-gray-800 font-bold">{item.doctor_name || "Doctor"}</Text>
                                <Text className="text-gray-500 text-xs mt-0.5">{item.specialization || "General"}</Text>
                            </View>
                            <MessageCircle size={18} color="#1d4ed8" />
                        </TouchableOpacity>
                    )}
                    ListEmptyComponent={
                        <View className="items-center mt-14">
                            <Text className="text-gray-500">No assigned doctors yet</Text>
                        </View>
                    }
                    ListFooterComponent={
                        <TouchableOpacity
                            onPress={handleLogout}
                            className="mt-6 border border-red-200 bg-red-50 rounded-xl py-3 items-center flex-row justify-center"
                        >
                            <LogOut size={18} color="#ef4444" />
                            <Text className="text-red-500 font-semibold ml-2">Logout</Text>
                        </TouchableOpacity>
                    }
                />
                <IncomingMessageBubble
                    message={incomingMessage}
                    onPress={(message) => {
                        setIncomingMessage(null);
                        if (message.isAnnouncement) {
                            navigation.getParent()?.navigate('PatientAnnouncements');
                            return;
                        }
                        navigation.navigate('Chat', {
                            patientId: message.patientId,
                            doctorId: message.doctorId,
                            patientName: message.senderName,
                            viewer: 'PATIENT',
                        });
                    }}
                />
            </View>
        </SafeAreaView>
    );
}
