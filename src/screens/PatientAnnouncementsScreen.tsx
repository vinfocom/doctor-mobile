import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, RefreshControl, StatusBar, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { Bell } from 'lucide-react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getPatientAnnouncements } from '../api/announcements';
import { getPatientProfile } from '../api/auth';
import { io, type Socket } from 'socket.io-client';
import { SOCKET_URL } from '../config/env';
import { ensurePatientAnnouncementsStateHydrated, markPatientAnnouncementsRead } from '../lib/mobileNotificationState';
import { useNotificationSound } from '../hooks/useNotificationSound';

interface PatientAnnouncement {
    message_id: number;
    doctor_id: number;
    doctor_name: string;
    content: string;
    created_at: string;
    appointment_date?: string | null;
}

const toISTYMD = (value?: string | null) => {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
};

const isActiveAnnouncement = (item: PatientAnnouncement) => {
    const appointmentDate = toISTYMD(item.appointment_date);
    if (!appointmentDate) return true;
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    return appointmentDate >= today;
};

export default function PatientAnnouncementsScreen() {
    const [items, setItems] = useState<PatientAnnouncement[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [patientId, setPatientId] = useState<number | null>(null);
    const [doctorIds, setDoctorIds] = useState<number[]>([]);
    const socketRef = useRef<Socket | null>(null);
    const playSound = useNotificationSound();

    useFocusEffect(
        React.useCallback(() => {
            void ensurePatientAnnouncementsStateHydrated();
            markPatientAnnouncementsRead();
        }, [])
    );

    const fetchAnnouncements = useCallback(async () => {
        try {
            const data = await getPatientAnnouncements(50);
            setItems((data?.announcements || []).filter(isActiveAnnouncement));
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
