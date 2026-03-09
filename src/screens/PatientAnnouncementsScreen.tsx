import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, RefreshControl, StatusBar, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { Bell } from 'lucide-react-native';
import { getPatientAnnouncements } from '../api/announcements';
import { getPatientProfile } from '../api/auth';
import { io, type Socket } from 'socket.io-client';
import { SOCKET_URL } from '../config/env';

interface PatientAnnouncement {
    message_id: number;
    doctor_id: number;
    doctor_name: string;
    content: string;
    created_at: string;
}

export default function PatientAnnouncementsScreen() {
    const [items, setItems] = useState<PatientAnnouncement[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [patientId, setPatientId] = useState<number | null>(null);
    const [doctorIds, setDoctorIds] = useState<number[]>([]);
    const socketRef = useRef<Socket | null>(null);

    const fetchAnnouncements = useCallback(async () => {
        try {
            const data = await getPatientAnnouncements(50);
            setItems(data?.announcements || []);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        const bootstrap = async () => {
            const profile = await getPatientProfile().catch(() => null);
            setPatientId(profile?.patient?.patient_id ?? null);
            const ids = (profile?.doctors || [])
                .map((d: any) => d?.doctor_id)
                .filter((id: any): id is number => typeof id === 'number');
            setDoctorIds(Array.from(new Set(ids)));
            await fetchAnnouncements();
        };
        bootstrap();
    }, [fetchAnnouncements]);

    useEffect(() => {
        const interval = setInterval(fetchAnnouncements, 3000);
        return () => clearInterval(interval);
    }, [fetchAnnouncements]);

    useEffect(() => {
        if (!patientId || doctorIds.length === 0) return;

        const socket = io(SOCKET_URL, {
            transports: ['websocket', 'polling'],
            timeout: 4000,
            reconnection: true,
            reconnectionDelay: 500,
            reconnectionDelayMax: 2000,
        });
        socketRef.current = socket;

        const joinAllRooms = () => {
            doctorIds.forEach((doctorId) => {
                socket.emit('join_chat', { patientId, doctorId });
            });
        };

        socket.on('connect', joinAllRooms);
        socket.on('receive_message', (msg: any) => {
            if (!msg || msg.sender !== 'DOCTOR' || !String(msg.content || '').startsWith('Announcement:')) return;
            if (msg.patient_id !== patientId) return;
            const cleanedContent = String(msg.content).replace(/^Announcement:\s*/, '');
            setItems((prev) => {
                const exists = prev.some((p) => p.message_id && msg.message_id && p.message_id === msg.message_id);
                if (exists) return prev;
                const incoming: PatientAnnouncement = {
                    message_id: msg.message_id || Date.now(),
                    doctor_id: msg.doctor_id,
                    doctor_name: prev.find((p) => p.doctor_id === msg.doctor_id)?.doctor_name || 'Doctor',
                    content: cleanedContent,
                    created_at: msg.created_at || new Date().toISOString(),
                };
                return [incoming, ...prev];
            });
        });
        socket.on('announcement_received', (msg: any) => {
            if (!msg || msg.sender !== 'DOCTOR' || msg.patient_id !== patientId) return;
            setItems((prev) => {
                const exists = prev.some((p) => (msg.campaign_id && p.message_id === msg.campaign_id));
                if (exists) return prev;
                const incoming: PatientAnnouncement = {
                    message_id: msg.campaign_id || Date.now(),
                    doctor_id: msg.doctor_id,
                    doctor_name: prev.find((p) => p.doctor_id === msg.doctor_id)?.doctor_name || 'Doctor',
                    content: String(msg.content || ''),
                    created_at: msg.created_at || new Date().toISOString(),
                };
                return [incoming, ...prev];
            });
        });
        if (socket.connected) joinAllRooms();

        return () => {
            socket.removeAllListeners();
            socket.disconnect();
            socketRef.current = null;
        };
    }, [doctorIds, patientId]);

    const onRefresh = async () => {
        setRefreshing(true);
        await fetchAnnouncements();
        setRefreshing(false);
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
                    <Text className="text-blue-100 text-sm">Patient Portal</Text>
                    <Text className="text-white text-3xl font-bold mt-1">Announcements</Text>
                </View>

                <FlashList
                    data={items}
                    keyExtractor={(item) => item.message_id.toString()}
                    contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
                    renderItem={({ item }) => (
                        <View className="bg-white rounded-2xl p-4 mb-3 border border-blue-50">
                            <Text className="text-blue-700 text-xs font-semibold">Dr. {item.doctor_name}</Text>
                            <Text className="text-gray-900 text-sm font-medium mt-1">{item.content}</Text>
                            <Text className="text-gray-400 text-[11px] mt-2">
                                {new Date(item.created_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' })}
                            </Text>
                        </View>
                    )}
                    ListEmptyComponent={
                        <View className="items-center mt-16">
                            <Bell size={44} color="#9ca3af" />
                            <Text className="text-gray-500 font-semibold mt-4">No announcements yet</Text>
                        </View>
                    }
                />
            </View>
        </SafeAreaView>
    );
}
